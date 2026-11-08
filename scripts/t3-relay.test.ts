import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import type { SourceHealth } from '../web/lib/team-types'

const bundle = buildSync({ stdin: { contents: `export { distributeRelayMessage, t3ConnectionStatus } from './scripts/relay'`,
  resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], write: false })
const bundledModule = { exports: {} as { distributeRelayMessage: typeof import('./relay').distributeRelayMessage;
  t3ConnectionStatus: typeof import('./relay').t3ConnectionStatus } }
runInNewContext(bundle.outputFiles[0].text, { module: bundledModule, exports: bundledModule.exports,
  require: (name: string) => name === 'vscode' ? {} : require(name), process, Buffer, console,
  TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, fetch, structuredClone, queueMicrotask,
  setTimeout, clearTimeout, setInterval, clearInterval })
const { distributeRelayMessage, t3ConnectionStatus } = bundledModule.exports

const unavailable: SourceHealth = { source: 't3', state: 'unavailable', checkedAt: 1, lastSuccessAt: null,
  lastChangeAt: null, pollIntervalMs: 2000, reason: 'T3 projection unavailable.' }

test('source health can be sent to SSE without entering the mobile mirror', () => {
  const sent: string[] = [], mobile: string[] = []
  const message = JSON.stringify({ type: 'source-health', health: unavailable })
  distributeRelayMessage(message, [{ write: value => { sent.push(String(value)); return true } }], { ingest: value => mobile.push(value) }, false)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].includes('source-health'), true)
  assert.deepEqual(mobile, [])
})

test('T3 source failures render disconnected instead of live/watching', () => {
  assert.equal(t3ConnectionStatus(unavailable), 'disconnected')
  assert.equal(t3ConnectionStatus({ ...unavailable, state: 'ok', reason: null }), 'connected')
  assert.equal(t3ConnectionStatus(null), 'disconnected')
})
