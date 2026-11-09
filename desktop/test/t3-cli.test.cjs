'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const path = require('node:path')
const { createT3CLI } = require('../t3-cli.cjs')
const id = '12345678-1234-1234-1234-123456789abc'
function fixture(options = {}) {
  const calls = []
  const fs = {
    existsSync: () => true,
    readFileSync: () => '"C:\\custom\\T3.exe" "C:\\custom\\bin.mjs" %*',
    realpathSync: root => { if (root === 'missing') throw new Error('missing'); return `resolved:${root}` },
    statSync: root => ({ isDirectory: () => root !== 'resolved:file' }),
    ...options.fs,
  }
  const cli = createT3CLI({ fs, env: { USERPROFILE: 'profile', LOCALAPPDATA: 'local', KEEP: 'yes' }, timeoutMs: options.timeoutMs ?? 1000,
    spawn(exe, args, config) {
      const child = new EventEmitter()
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter()
      child.stdin.end = text => { child.input = text }
      child.kill = () => { child.killed = true; if (!options.delayClose) child.emit('close', null) }
      calls.push({ exe, args, config, child })
      return child
    },
  })
  return { cli, calls }
}
test('send uses parsed executable, pipe stdin, JSON, no shell or wait, and strips t3 prefix', async () => {
  const { cli, calls } = fixture()
  const pending = cli.t3Send({ threadId: `t3:${id}`, message: '  hello\nworld  ' })
  const { exe, args, config, child } = calls[0]
  assert.equal(exe, 'C:\\custom\\T3.exe')
  assert.deepEqual(args, ['C:\\custom\\bin.mjs', 'thread', 'send', id, '-', '--json'])
  assert.equal(config.shell, undefined)
  assert.equal(config.windowsHide, true)
  assert.deepEqual(config.stdio, ['pipe', 'pipe', 'pipe'])
  assert.equal(config.env.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(config.env.T3CODE_HOME, path.join('profile', '.t3'))
  assert.equal(config.env.KEEP, 'yes')
  assert.equal(child.input, 'hello\nworld')
  child.emit('close', 0)
  assert.deepEqual(await pending, { ok: true, threadId: id })
})
test('start accepts supported JSON id shapes and canonicalizes project path', async () => {
  for (const output of [{ threadId: id }, { thread: { threadId: id } }, { thread: { id } }, { id }]) {
    const { cli, calls } = fixture()
    const pending = cli.t3Start({ projectRoot: 'project', message: 'start' })
    const { args, child } = calls[0]
    assert.deepEqual(args.slice(1), ['thread', 'start', 'resolved:project', '-', '--json'])
    child.stdout.emit('data', JSON.stringify(output)); child.emit('close', 0)
    assert.deepEqual(await pending, { ok: true, threadId: id })
  }
})
test('invalid inputs never spawn a process', async () => {
  const { cli, calls } = fixture()
  for (const threadId of [undefined, null, 123, '', 'short', '../12345678', 'a'.repeat(81)]) {
    await assert.rejects(cli.t3Send({ threadId, message: 'hi' }), /Invalid T3 thread id/)
  }
  for (const message of [undefined, null, 123, '', '   ', 'x'.repeat(20001)]) {
    await assert.rejects(cli.t3Send({ threadId: id, message }), /Prompt must contain/)
  }
  for (const projectRoot of [undefined, null, 123, '', 'missing', 'file']) {
    await assert.rejects(cli.t3Start({ projectRoot, message: 'hi' }), /existing directory/)
  }
  await assert.rejects(cli.t3Send(null), /Invalid T3 thread id/)
  assert.equal(calls.length, 0)
})
test('send and start share a busy lock, released after completion', async () => {
  const { cli, calls } = fixture()
  const pending = cli.t3Send({ threadId: id, message: 'hi' })
  await assert.rejects(cli.t3Start({ projectRoot: 'project', message: 'hi' }), /Still sending the previous prompt\./)
  await assert.rejects(cli.t3Send({ threadId: id, message: 'hi' }), /Still sending the previous prompt\./)
  calls[0].child.emit('close', 0); await pending
  const next = cli.t3Send({ threadId: id, message: 'next' })
  calls[1].child.emit('close', 0); await next
})
test('timeout reports unknown delivery and holds busy until close or exit', async () => {
  for (const event of ['close', 'exit']) {
    const { cli, calls } = fixture({ timeoutMs: 5, delayClose: true })
    await assert.rejects(cli.t3Send({ threadId: id, message: 'hi' }), {
      message: 'Delivery unknown: T3 did not answer in time. Check the thread in T3 before sending again.',
    })
    assert.equal(calls[0].child.killed, true)
    await assert.rejects(cli.t3Start({ projectRoot: 'project', message: 'next' }), /Still sending/)
    calls[0].child.emit(event, null)
    const next = cli.t3Send({ threadId: id, message: 'next' })
    calls[1].child.emit('close', 0); await next
  }
})

test('timeout lock has a hard ten second cap', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cli, calls } = fixture({ timeoutMs: 5, delayClose: true })
  const pending = cli.t3Send({ threadId: id, message: 'hi' })
  t.mock.timers.tick(5)
  await assert.rejects(pending, /Delivery unknown/)
  t.mock.timers.tick(9999)
  await assert.rejects(cli.t3Send({ threadId: id, message: 'next' }), /Still sending/)
  t.mock.timers.tick(1)
  const next = cli.t3Send({ threadId: id, message: 'next' })
  calls[0].child.emit('close', null)
  await assert.rejects(cli.t3Send({ threadId: id, message: 'duplicate' }), /Still sending/)
  calls[1].child.emit('close', 0); await next
})

test('start accepts paired provider/model arguments and rejects invalid identifiers', async () => {
  const { cli, calls } = fixture()
  for (const payload of [{ provider: 'codex' }, { model: 'model' },
    ...[null, 1, '', 'bad name', '../bad', 'x'.repeat(81)].flatMap(value => [
      { provider: value, model: 'valid' }, { provider: 'valid', model: value },
    ])]) {
    await assert.rejects(cli.t3Start({ projectRoot: 'project', message: 'hi', ...payload }), /Provider and model/)
  }
  assert.equal(calls.length, 0)
  const pending = cli.t3Start({ projectRoot: 'project', message: 'hi', provider: 'provider-1', model: 'model._:1' })
  assert.deepEqual(calls[0].args.slice(1), ['thread', 'start', 'resolved:project', '-', '--json', '--provider', 'provider-1', '--model', 'model._:1'])
  calls[0].child.stdout.emit('data', JSON.stringify({ id })); calls[0].child.emit('close', 0)
  await pending
})

test('missing launcher fallback requires both files and gives install guidance', async () => {
  for (const missing of ['.exe', 'bin.mjs']) {
    const { cli, calls } = fixture({ fs: { readFileSync() { throw new Error('missing') }, existsSync: file => !file.endsWith(missing) } })
    await assert.rejects(cli.t3Send({ threadId: id, message: 'hi' }), { message: 'T3 Code CLI not found. Open T3 Code once to install it.' })
    assert.equal(calls.length, 0)
  }
  const { cli, calls } = fixture({ fs: { readFileSync: () => 'unrecognized' } })
  const pending = cli.t3Send({ threadId: id, message: 'hi' })
  assert.equal(calls[0].exe, path.join('local', 'Programs', 't3code', 'T3 Code (Beta).exe'))
  calls[0].child.emit('close', 0); await pending
})
test('failure exposes only the first meaningful stderr line, capped at 200 characters', async () => {
  for (const [stderr, expected] of [['\r\n \n\x1b[31mFailure\x1b[0m\nSECRET=hidden', 'Failure'], ['x'.repeat(500), 'x'.repeat(200)], ['', 'T3 exited (2)']]) {
    const { cli, calls } = fixture()
    const pending = cli.t3Send({ threadId: id, message: 'hi' })
    calls[0].child.stderr.emit('data', stderr); calls[0].child.emit('close', 2)
    await assert.rejects(pending, { message: expected })
  }
})
test('invalid start JSON and process errors are short and safe', async () => {
  for (const output of ['no JSON', '{}', '{"id":"bad"}']) {
    const { cli, calls } = fixture()
    const pending = cli.t3Start({ projectRoot: 'project', message: 'hi' })
    calls[0].child.stdout.emit('data', output); calls[0].child.emit('close', 0)
    await assert.rejects(pending, /valid thread id/)
  }
  for (const code of ['ENOENT', 'EACCES']) {
    const { cli, calls } = fixture()
    const pending = cli.t3Send({ threadId: id, message: 'hi' })
    calls[0].child.emit('error', Object.assign(new Error('sensitive details'), { code }))
    await assert.rejects(pending, code === 'ENOENT' ? /CLI not found/ : /Could not run T3 Code CLI\./)
  }
})
