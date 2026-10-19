import { it } from 'node:test'
import assert from 'node:assert/strict'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { CodexCompactionState } from '../src/codex-compaction-state'
import { CodexCompactionObserver, CodexIpcFrames } from '../src/codex-compaction-observer'

const turnPath = ['turnHistory', 'history', 'entitiesByKey', 'tail:0:local:turn']
const turn = (completed = false) => ({ status: 'inProgress', items: [
  { id: 'text', type: 'agentMessage', text: 'DO NOT RETAIN THIS BODY' },
  { id: 'compact', type: 'contextCompaction', completed },
], completedItemIds: {} })
const snapshot = (revision = 1) => ({ type: 'snapshot', revision,
  conversationState: { title: 'DO NOT RETAIN TITLE', turnHistory: { kind: 'canonical', history: { entitiesByKey: { 'tail:0:local:turn': turn() } } } } })

it('projects canonical history, follows exact start/end and never retains chat bodies', () => {
  const state = new CodexCompactionState()
  assert.equal(state.update(snapshot()), true)
  assert.doesNotMatch(JSON.stringify(state), /DO NOT RETAIN/)
  assert.equal(state.update({ type: 'patches', baseRevision: 1, revision: 2,
    patches: [{ op: 'replace', path: [...turnPath, 'items', 1, 'completed'], value: true }] }), false)
  assert.equal(state.update({ type: 'patches', baseRevision: 2, revision: 3,
    patches: [{ op: 'replace', path: turnPath, value: turn() }] }), true)
  assert.equal(state.update({ type: 'patches', baseRevision: 3, revision: 4,
    patches: [{ op: 'replace', path: [...turnPath, 'status'], value: 'failed' }] }), false)
  assert.throws(() => state.update({ type: 'patches', baseRevision: 1, revision: 5, patches: [] }), /revision gap/)
})

it('handles legacy turns, inserted/removed items and completion ID maps', () => {
  const state = new CodexCompactionState()
  assert.equal(state.update({ type: 'snapshot', revision: 1, conversationState: { turns: [turn(true)] } }), false)
  assert.equal(state.update({ type: 'patches', baseRevision: 1, revision: 2, patches: [
    { op: 'add', path: ['turns', 0, 'items', 0], value: { id: 'new', type: 'contextCompaction', completed: false } },
  ] }), true)
  assert.equal(state.update({ type: 'patches', baseRevision: 2, revision: 3, patches: [
    { op: 'remove', path: ['turns', 0, 'items', 1] },
    { op: 'add', path: ['turns', 0, 'completedItemIds', 'new'], value: true },
  ] }), false)
  assert.throws(() => state.update({ type: 'patches', baseRevision: 3, revision: 4,
    patches: [{ op: 'add', path: ['__proto__'], value: {} }] }), /Invalid/)
})

const encode = (value: unknown) => {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4)
  header.writeUInt32LE(body.length)
  return Buffer.concat([header, body])
}
it('decodes fragmented and coalesced frames and rejects oversized allocations', () => {
  const frames = new CodexIpcFrames(), received: unknown[] = []
  const bytes = Buffer.concat([encode({ a: 'ภาษาไทย' }), encode({ b: 2 })])
  for (const byte of bytes) frames.push(Buffer.from([byte]), value => received.push(value))
  assert.deepEqual(received, [{ a: 'ภาษาไทย' }, { b: 2 }])
  const header = Buffer.alloc(4); header.writeUInt32LE(17 * 1024 * 1024)
  assert.throws(() => frames.push(header, () => {}), /frame length/)
})

it('subscribes read-only, isolates threads, refreshes gaps and clears state on disconnect', async () => {
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\agent-flow-test-${randomUUID()}` : path.join(os.tmpdir(), `af-${randomUUID()}.sock`)
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(endpoint, resolve))
  const changes: [string, boolean][] = [], methods: string[] = []
  let declinedDiscovery = false
  let peer: net.Socket | undefined
  let following = 0
  server.on('connection', socket => {
    peer = socket
    const frames = new CodexIpcFrames()
    socket.on('data', data => frames.push(data, message => {
      if (message.type === 'client-discovery-response') {
        assert.deepEqual(message.response, { canHandle: false })
        declinedDiscovery = true
        return
      }
      methods.push(message.method)
      if (message.method === 'initialize') {
        socket.write(encode({ type: 'response', method: 'initialize', resultType: 'success', result: { clientId: 'observer' } }))
        socket.write(encode({ type: 'client-discovery-request', requestId: 'discovery' }))
      }
      if (message.method === 'thread-stream-following-changed' && message.params.following && ++following === 1) {
        const send = (id: string, change: unknown) => socket.write(encode({ type: 'broadcast', method: 'thread-stream-state-changed', version: 11,
          sourceClientId: 'owner', params: { conversationId: id, hostId: 'local', change } }))
        send('unsubscribed', snapshot())
        send('root', snapshot())
        send('root', { type: 'patches', baseRevision: 10, revision: 11, patches: [] })
      }
    }))
  })
  const observer = new CodexCompactionObserver(() => ['root'], (id, active) => changes.push([id, active]), endpoint)
  const until = async (condition: () => boolean) => {
    const end = Date.now() + 3000
    while (!condition() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
    assert.ok(condition(), 'IPC fixture timed out')
  }
  try {
    await until(() => following === 2)
    assert.equal(declinedDiscovery, true)
    assert.deepEqual(changes, [['root', true], ['root', false]])
    assert.ok(methods.every(method => ['initialize', 'thread-stream-following-changed'].includes(method)))
    peer!.write(encode({ type: 'broadcast', method: 'thread-stream-following-status-requested', version: 1,
      params: { hostId: 'local', conversationId: 'root' } }))
    await until(() => following === 3)
    peer!.write(encode({ type: 'broadcast', method: 'thread-stream-state-changed', version: 11,
      sourceClientId: 'owner', params: { hostId: 'local', conversationId: 'root', change: snapshot(12) } }))
    peer!.write(encode({ type: 'broadcast', method: 'client-status-changed', version: 0,
      sourceClientId: 'owner', params: { clientId: 'owner', status: 'disconnected' } }))
    await until(() => changes.length === 4)
    assert.deepEqual(changes.slice(-2), [['root', true], ['root', false]])
    peer!.destroy()
    await until(() => changes.length === 5)
    assert.deepEqual(changes.at(-1), ['root', false])
  } finally {
    observer.dispose(); peer?.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
