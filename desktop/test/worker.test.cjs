'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

function start(folder, codexHome) {
  const child = fork(path.resolve(__dirname, '../dist/worker.cjs'), [folder], {
    env: { ...process.env, CODEX_HOME: codexHome, AGENT_FLOW_RUNTIME: 'codex' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  child.stdout.resume()
  child.stderr.resume()
  return child
}
async function stop(child) {
  if (child.exitCode !== null) return
  const exited = once(child, 'exit')
  child.send('stop')
  const [code] = await exited
  assert.equal(code, 0)
}
function fixture(root, folder, id) {
  const dir = path.join(root, 'sessions/2026/10/27')
  fs.mkdirSync(dir, { recursive: true })
  const timestamp = new Date().toISOString()
  const records = [
    { type: 'session_meta', timestamp, payload: { id, cwd: folder } },
    { type: 'event_msg', timestamp, payload: { type: 'user_message', message: 'Desktop integration test' } },
  ]
  fs.writeFileSync(path.join(dir, `rollout-2026-10-27T00-00-00-${id}.jsonl`), records.map(row => JSON.stringify(row)).join('\n') + '\n')
}

test('isolated workspaces serve UI + matching sessions, and release ports on stop', { timeout: 30000 }, async t => {
  // Keep the traditional standalone port occupied. If the user's own viewer
  // already owns it, leave that process untouched and run the same assertions.
  const existing = http.createServer((_req, res) => res.end('existing viewer'))
  await new Promise((resolve, reject) => {
    existing.once('error', error => error.code === 'EADDRINUSE' ? resolve() : reject(error))
    existing.listen(3001, '127.0.0.1', resolve)
  })
  t.after(() => { if (existing.listening) existing.close() })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-desktop-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const a = path.join(root, 'workspace ก')
  const b = path.join(root, 'workspace b')
  fs.mkdirSync(a); fs.mkdirSync(b)
  const firstID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const secondID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  fixture(root, a, firstID)
  fixture(root, b, secondID)
  const workers = [start(a, root), start(b, root)]
  t.after(() => { for (const child of workers) if (child.exitCode === null) child.kill() })
  const ready = await Promise.all(workers.map(async child => (await once(child, 'message'))[0]))
  for (const message of ready) assert.equal(message.type, 'ready', JSON.stringify(message))
  for (const message of ready) assert.notEqual(new URL(message.url).port, '3001')
  assert.notEqual(ready[0].url, ready[1].url)
  for (const [index, message] of ready.entries()) {
    const page = await fetch(message.url)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /id="root"/)
    const widgetPage = await fetch(`${message.url}/?desktop=1&widget=1`)
    assert.equal(widgetPage.status, 200)
    assert.match(await widgetPage.text(), /id="root"/)
    const asset = await fetch(`${message.url}/index.js`)
    assert.equal(asset.status, 200)
    assert.ok((await asset.text()).length > 1000)
    const controller = new AbortController()
    const response = await fetch(`${message.url}/events`, { signal: controller.signal })
    assert.match(response.headers.get('content-type'), /text\/event-stream/)
    const reader = response.body.getReader()
    const { value } = await reader.read()
    const events = new TextDecoder().decode(value)
    assert.ok(events.includes(index === 0 ? firstID : secondID), events)
    assert.ok(!events.includes(index === 0 ? secondID : firstID), 'Other workspace leaked into session list')
    controller.abort()
  }
  await Promise.all(workers.map(stop))
  for (const message of ready) await assert.rejects(fetch(message.url))
})

test('missing workspace reports a useful failure and exits', { timeout: 10000 }, async () => {
  const child = start(path.join(os.tmpdir(), `missing-agent-flow-${Date.now()}`), os.tmpdir())
  const exited = once(child, 'exit')
  const [message] = await once(child, 'message')
  assert.equal(message.type, 'error')
  assert.match(message.message, /ENOENT/)
  const [code] = await exited
  assert.equal(code, 1)
})
test('SSE reconnect restores the complete Codex graph after a long history', { timeout: 30000 }, async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-long-'))
  const folder = path.join(home, 'workspace')
  fs.mkdirSync(folder)
  const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  fixture(home, folder, id)
  const file = path.join(home, 'sessions/2026/10/27', `rollout-2026-10-27T00-00-00-${id}.jsonl`)
  const records = Array.from({ length: 5100 }, (_, index) => ({ type: 'event_msg', payload: {
    type: 'token_count', info: { last_token_usage: { total_tokens: index + 1 }, model_context_window: 200000 },
  } }))
  fs.appendFileSync(file, records.map(row => JSON.stringify(row)).join('\n') + '\n')
  const worker = start(folder, home)
  t.after(() => { if (worker.exitCode === null) worker.kill() })
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const [ready] = await once(worker, 'message')
  assert.equal(ready.type, 'ready')
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const response = await fetch(`${ready.url}/events`, { signal: controller.signal })
    const reader = response.body.getReader()
    let text = '', snapshot
    while (!snapshot) {
      const { value, done } = await reader.read()
      assert.equal(done, false)
      text += new TextDecoder().decode(value)
      const rows = text.split('\n\n').filter(row => row.startsWith('data: ')).flatMap(row => {
        try { return [JSON.parse(row.slice(6))] } catch { return [] }
      })
      snapshot = rows.find(row => row.event?.type === 'session_snapshot')?.event
    }
    assert.equal(snapshot.payload.preserveHistory, true)
    assert.ok(snapshot.payload.agents.some(agent => agent.id === 'orchestrator' && agent.isMain))
    controller.abort()
  }
  await stop(worker)
})
