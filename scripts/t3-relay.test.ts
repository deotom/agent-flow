import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import type { SourceHealth } from '../web/lib/team-types'

const bundle = buildSync({ stdin: { contents: `export { distributeRelayMessage, t3ConnectionStatus, allowLocalRequest, bufferRelayHistory } from './scripts/relay'`,
  resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], write: false })
const bundledModule = { exports: {} as { distributeRelayMessage: typeof import('./relay').distributeRelayMessage;
  t3ConnectionStatus: typeof import('./relay').t3ConnectionStatus;
  allowLocalRequest: typeof import('./relay').allowLocalRequest;
  bufferRelayHistory: typeof import('./relay').bufferRelayHistory } }
runInNewContext(bundle.outputFiles[0].text, { module: bundledModule, exports: bundledModule.exports,
  require: (name: string) => name === 'vscode' ? {} : require(name), process, Buffer, console,
  TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, fetch, structuredClone, queueMicrotask,
  setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate })
const { distributeRelayMessage, t3ConnectionStatus, allowLocalRequest, bufferRelayHistory } = bundledModule.exports

const unavailable: SourceHealth = { source: 't3', state: 'unavailable', checkedAt: 1, lastSuccessAt: null,
  lastChangeAt: null, pollIntervalMs: 2000, reason: 'T3 projection unavailable.' }

test('T3 source failures render disconnected instead of live/watching', () => {
  assert.equal(t3ConnectionStatus(unavailable), 'disconnected')
  assert.equal(t3ConnectionStatus({ ...unavailable, state: 'ok', reason: null }), 'connected')
  assert.equal(t3ConnectionStatus(null), 'disconnected')
})


test('SSE drops slow or failed sinks and continues serving healthy clients', () => {
  // write() returning false alone is normal backpressure (e.g. during a replay) and must not drop the client.
  const busy = { writableLength: 64 * 1024, write: () => false, end() { throw new Error('busy client was dropped') } }
  distributeRelayMessage('{}', [busy], () => assert.fail('busy client was dropped'))
  for (const condition of ['queued', 'grows', 'throws']) {
    let ended = 0, writes = 0
    const dropped: unknown[] = [], healthy: string[] = []
    const slow = { writableLength: condition === 'queued' ? 4 * 1024 * 1024 + 1 : 0,
      write() { writes++; if (condition === 'throws') throw new Error('closed')
        if (condition === 'grows') this.writableLength = 4 * 1024 * 1024 + 1
        return condition !== 'backpressure' },
      end() { ended++ },
    }
    distributeRelayMessage('{}', [slow, { write: value => { healthy.push(value); return true } }], sink => dropped.push(sink))
    assert.deepEqual(dropped, [slow])
    assert.equal(ended, 1)
    assert.equal(writes, condition === 'queued' ? 0 : 1)
    assert.equal(healthy.length, 1)
  }
})

test('local Host guard permits only the bound loopback authority', () => {
  for (const host of ['127.0.0.1:42001', 'localhost:42001', 'evil.example:42001',
    '127.0.0.1:42002', 'localhost', undefined, 'localhost:42001.evil.example']) {
    let status = 0, body = ''
    const req = { headers: { host }, socket: { localPort: 42001 } }
    const res = { writeHead(code: number) { status = code; return this }, end(value: string) { body = value } }
    const allowed = allowLocalRequest(req as any, res as any)
    assert.equal(allowed, host === '127.0.0.1:42001' || host === 'localhost:42001')
    if (!allowed) { assert.equal(status, 403); assert.equal(body, 'Forbidden') }
  }
})


test('T3 reconnect history does not accumulate full snapshots and overflow the SSE queue', () => {
  const buffers = new Map<string, import('../extension/src/protocol').AgentEvent[]>()
  const snapshot = { sessionId: 't3:large-team', time: 0, type: 'session_snapshot' as const,
    payload: { source: 't3', agents: [], team: { title: 'Full current state' }, padding: 'x'.repeat(1024 * 1024) } }
  // Current snapshots are replayed by T3SessionWatcher separately. Keeping past
  // copies creates a >4MB history frame and closes every reconnecting stream.
  for (let i = 0; i < 8; i++) bufferRelayHistory(buffers, { ...snapshot, time: i })
  assert.equal(buffers.has(snapshot.sessionId), false)
  const native = { sessionId: 'native-session', time: 0, type: 'message' as const, payload: { text: 'History needed for incremental native events' } }
  bufferRelayHistory(buffers, native)
  assert.equal(buffers.get(native.sessionId)?.[0], native, 'native incremental history is retained')
})
