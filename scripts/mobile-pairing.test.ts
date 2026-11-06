import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consumePairingFragment } from '../mobile/pairing.mjs'
test('QR link is consumed and removed from browser history, including malformed values', () => {
  let destination = ''
  const history = { replaceState(_state: unknown, _title: string, url: string) { destination = url } }
  const key = 'A'.repeat(43)
  assert.equal(consumePairingFragment({ hash: `#pair=${key}`, pathname: '/agent-flow/', search: '' }, history), key)
  assert.equal(destination, '/agent-flow/')
  assert.equal(consumePairingFragment({ hash: '#pair=invalid', pathname: '/', search: '' }, history), null)
  assert.equal(destination, '/')
})
