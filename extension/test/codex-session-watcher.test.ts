import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CodexSessionWatcher } from '../src/codex-session-watcher'
import type { AgentEvent } from '../src/protocol'

describe('CodexSessionWatcher history and resume', { concurrency: false }, () => {
  function fixture(historyLimit = 5) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-codex-'))
    const workspace = path.join(home, 'workspace')
    fs.mkdirSync(workspace)
    const previous = process.env.CODEX_HOME
    process.env.CODEX_HOME = home
    const watcher = new CodexSessionWatcher(workspace, historyLimit)
    const events: AgentEvent[] = []
    watcher.onEvent(e => events.push(e))
    function rollout(id: number, cwd = workspace, ageDays = 0, parent?: { id: string; name: string }) {
      // All files live in an old creation partition, regardless of write time.
      const dir = path.join(home, 'sessions', '2020', '01', '01')
      fs.mkdirSync(dir, { recursive: true })
      const uuid = `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`
      const file = path.join(dir, `rollout-2020-01-01T00-00-00-${uuid}.jsonl`)
      const records = [
        { type: 'session_meta', payload: { id: uuid, cwd, ...(parent ? { source: { subagent: { thread_spawn: { parent_thread_id: parent.id, agent_path: parent.name } } } } : {}) } },
        { type: 'response_item', payload: { type: 'message', role: 'user', content: `request ${id}` } },
      ]
      fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n')
      const time = new Date(Date.now() - ageDays * 86400000)
      fs.utimesSync(file, time, time)
      return { uuid, file }
    }
    return { watcher, events, rollout, workspace, cleanup() {
      watcher.dispose()
      if (previous === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = previous
      fs.rmSync(home, { recursive: true, force: true })
    } }
  }

  it('discovers a resumed session in a years-old partition with history disabled', () => {
    const f = fixture(0)
    try {
      const { uuid } = f.rollout(1)
      f.watcher.start()
      assert.equal(f.watcher.isSessionActive(uuid), true)
      assert.ok(f.events.some(e => e.payload.content === 'request 1'))
    } finally { f.cleanup() }
  })

  it('restores unchanged history from cache without rereading JSONL content', () => {
    const f = fixture()
    try {
      const { uuid } = f.rollout(1)
      f.watcher.start()
      f.events.length = 0
      const spy = mock.method(require('node:fs'), 'readSync', () => { throw new Error('Unexpected history reread') })
      try { f.watcher.replaySessionStart([uuid]) } finally { spy.mock.restore() }
      assert.ok(f.events.some(event => event.payload.content === 'request 1' && event.historical))
    } finally { f.cleanup() }
  })

  it('evicts oversized replay caches completely and reconstructs history from the original transcript', () => {
    const f = fixture()
    try {
      const { uuid } = f.rollout(1)
      f.watcher.start()
      const internal = f.watcher as any
      internal.cacheEvent(uuid, { time: 1, type: 'message', payload: { content: 'x'.repeat(2200000) } })
      assert.equal(internal.replayCache.has(uuid), false)
      f.events.length = 0
      f.watcher.replaySessionStart([uuid])
      assert.ok(f.events.some(event => event.payload.content === 'request 1'))
      assert.ok(!f.events.some(event => String(event.payload.content).startsWith('xxxxxxxx')))
      assert.ok([...internal.replayBytes.values()].reduce((sum: number, value: any) => sum + value, 0) <= 8 * 1024 * 1024)
    } finally { f.cleanup() }
  })

  it('keeps separate VS Code workspace watchers independent when both are open', () => {
    const f = fixture()
    const secondPath = path.join(f.workspace, '..', 'other-workspace')
    const second = new CodexSessionWatcher(secondPath)
    try {
      const firstRoot = f.rollout(1)
      const secondRoot = f.rollout(2, secondPath)
      f.watcher.start(); second.start()
      assert.deepEqual(f.watcher.getActiveSessions().map(session => session.id), [firstRoot.uuid])
      assert.deepEqual(second.getActiveSessions().map(session => session.id), [secondRoot.uuid])
      f.watcher.dispose()
      const events: AgentEvent[] = []
      second.onEvent(event => events.push(event))
      second.replaySessionStart([secondRoot.uuid])
      assert.ok(events.some(event => event.payload.content === 'request 2'))
    } finally { second.dispose(); f.cleanup() }
  })

  it('matches every workspace folder and follows linked children into separate worktrees', () => {
    const f = fixture()
    f.watcher.dispose()
    const second = path.join(f.workspace, '..', 'second')
    const watcher = new CodexSessionWatcher([f.workspace, second])
    try {
      const first = f.rollout(1)
      const other = f.rollout(2, second)
      const child = f.rollout(3, path.join(second, '..', 'separate-worktree'), 0, { id: other.uuid, name: '/root/checker' })
      f.rollout(4, second + '-unrelated')
      watcher.start()
      assert.deepEqual(watcher.getActiveSessions().map(session => session.id).sort(), [first.uuid, other.uuid].sort())
      assert.equal(watcher.isSessionActive(child.uuid), true)
    } finally { watcher.dispose(); f.cleanup() }
  })

  it('groups live child rollouts under an old parent and hides them when their turn ends', async () => {
    const f = fixture(0)
    try {
      const parent = f.rollout(1, f.workspace, 30)
      const child = f.rollout(2, f.workspace, 0, { id: parent.uuid, name: '/root/reviewer' })
      fs.appendFileSync(child.file, [
        { type: 'event_msg', payload: { type: 'task_started' } },
        { type: 'turn_context', payload: { model: 'review-model' } },
        { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'review-tool', arguments: '{"cmd":"npm test"}' } },
      ].map(record => JSON.stringify(record)).join('\n') + '\n')
      f.watcher.start()
      assert.deepEqual(f.watcher.getActiveSessions().map(session => session.id), [parent.uuid])
      assert.ok(f.events.some(event => event.type === 'agent_thinking' && event.payload.name === '/root/reviewer' && event.sessionId === parent.uuid))
      assert.ok(f.events.some(event => event.type === 'tool_call_start' && event.payload.agent === '/root/reviewer' && event.sessionId === parent.uuid))
      assert.ok(f.events.some(event => event.type === 'model_detected' && event.payload.agent === '/root/reviewer' && event.payload.model === 'review-model'))
      f.events.length = 0
      f.watcher.replaySessionStart([parent.uuid])
      assert.ok(f.events.some(event => event.type === 'tool_call_start' && event.payload.agent === '/root/reviewer'))
      fs.appendFileSync(child.file, JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete' } }) + '\n')
      const deadline = Date.now() + 5000
      while (!f.events.some(event => event.type === 'agent_complete' && event.payload.name === '/root/reviewer') && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.ok(f.events.some(event => event.type === 'agent_complete' && event.payload.name === '/root/reviewer' && event.sessionId === parent.uuid))
      assert.equal(f.watcher.getActiveSessions().length, 1)
      f.events.length = 0
      f.watcher.replaySessionStart([parent.uuid])
      assert.equal(f.events.filter(event => event.payload.name === '/root/reviewer').at(-1)?.type, 'agent_complete')
    } finally { f.cleanup() }
  })

  it('restores only the newest inactive workspace sessions, preserving idle status and activity time', () => {
    const f = fixture(1)
    try {
      f.rollout(1, f.workspace, 30)
      const newest = f.rollout(2, f.workspace, 3)
      f.rollout(3, f.workspace + '-other', 1)
      f.watcher.start()
      const sessions = f.watcher.getActiveSessions()
      assert.equal(sessions.length, 1)
      assert.equal(sessions[0].id, newest.uuid)
      assert.equal(sessions[0].label, 'request 2')
      assert.equal(sessions[0].status, 'completed')
      assert.equal(sessions[0].lastActivityTime, fs.statSync(newest.file).mtimeMs)
      assert.equal(f.watcher.isActive(), false)
    } finally { f.cleanup() }
  })

  it('replays full content on every panel reopen without consuming later live writes', async () => {
    const f = fixture()
    try {
      const { uuid, file } = f.rollout(1, f.workspace, 3)
      f.watcher.start()
      for (let i = 0; i < 2; i++) {
        f.events.length = 0
        f.watcher.replaySessionStart([uuid])
        assert.equal(f.events.filter(e => e.type === 'agent_spawn').length, 1)
        assert.equal(f.events.filter(e => e.payload.content === 'request 1').length, 1)
        assert.equal(f.watcher.isSessionActive(uuid), false)
      }
      f.events.length = 0
      fs.appendFileSync(file, JSON.stringify({ type: 'response_item', payload: {
        type: 'message', role: 'user', content: 'follow-up after three days',
      } }) + '\n')
      const deadline = Date.now() + 5000
      while (!f.events.some(e => e.payload.content === 'follow-up after three days') && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.equal(f.events.filter(e => e.payload.content === 'follow-up after three days').length, 1)
      assert.equal(f.watcher.isSessionActive(uuid), true)
      assert.ok(f.events.some(e => e.type === 'agent_spawn'))
      // A reopen may race with a pending fs.watch notification. The replay
      // must advance the live cursor so that notification cannot duplicate it.
      f.events.length = 0
      fs.appendFileSync(file, JSON.stringify({ type: 'response_item', payload: {
        type: 'message', role: 'assistant', content: 'reply before file notification',
      } }) + '\n')
      f.watcher.replaySessionStart([uuid])
      await new Promise(resolve => setTimeout(resolve, 50))
      assert.equal(f.events.filter(e => e.payload.content === 'reply before file notification').length, 1)
    } finally { f.cleanup() }
  })

  it('discovers a previously skipped old file when resumed after startup', async () => {
    const f = fixture(0)
    try {
      const { uuid, file } = f.rollout(1, f.workspace, 30)
      f.watcher.start()
      assert.equal(f.watcher.getActiveSessions().length, 0)
      fs.appendFileSync(file, JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n')
      const deadline = Date.now() + 5000
      while (!f.watcher.isSessionActive(uuid) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.equal(f.watcher.isSessionActive(uuid), true)
    } finally { f.cleanup() }
  })
  it('opens a compact latest-state snapshot without transmitting old transcript messages and can load full history explicitly', () => {
    const f = fixture()
    try {
      const root = f.rollout(1)
      const child = f.rollout(2, f.workspace, 0, { id: root.uuid, name: '/root/reviewer' })
      const old = Array.from({ length: 250 }, (_, index) => ({ type: 'response_item', payload: {
        type: 'message', role: 'assistant', content: `older message ${index} ` + 'large result '.repeat(300),
      } }))
      fs.appendFileSync(root.file, old.map(record => JSON.stringify(record)).join('\n') + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n')
      fs.appendFileSync(child.file, JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n' + JSON.stringify({ type: 'response_item', payload: {
        type: 'function_call', name: 'exec_command', call_id: 'pending-command', arguments: '{"cmd":"npm test"}',
      } }) + '\n')
      f.watcher.start()
      f.events.length = 0
      f.watcher.replaySessionStart([root.uuid], { latestOnly: true })
      assert.equal(f.events.length, 1)
      assert.equal(f.events[0].type, 'session_snapshot')
      assert.equal(f.events[0].historical, true)
      const agents = f.events[0].payload.agents as Array<Record<string, unknown>>
      assert.equal(agents.length, 2)
      assert.equal(agents.find(agent => agent.id === '/root/reviewer')?.currentTool, 'exec_command')
      assert.equal(agents.find(agent => agent.id === '/root/reviewer')?.state, 'tool_calling')
      assert.equal(f.events[0].payload.round, 1)
      assert.ok(JSON.stringify(f.events).length < 8000)
      f.events.length = 0
      f.watcher.replaySessionStart([root.uuid])
      assert.equal(f.events.filter(event => String(event.payload.content || '').startsWith('older message')).length, 250)
    } finally { f.cleanup() }
  })

})
