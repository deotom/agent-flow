import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import { listenOnAvailablePort } from './listen'

test('occupied preferred port falls back without stopping its owner', async t => {
  const owner = http.createServer((_req, res) => res.end('existing app'))
  const viewer = http.createServer((_req, res) => res.end('new viewer'))
  t.after(() => { owner.closeAllConnections(); owner.close(); viewer.closeAllConnections(); viewer.close() })
  const occupied = await listenOnAvailablePort(owner, 0)
  const selected = await listenOnAvailablePort(viewer, occupied)
  assert.notEqual(selected, occupied)
  assert.equal(await (await fetch(`http://127.0.0.1:${occupied}`)).text(), 'existing app')
  assert.equal(await (await fetch(`http://127.0.0.1:${selected}`)).text(), 'new viewer')
})

test('multiple automatic listeners receive distinct reserved ports', async t => {
  const servers = [http.createServer(), http.createServer(), http.createServer()]
  t.after(() => servers.forEach(server => server.close()))
  const ports = await Promise.all(servers.map(server => listenOnAvailablePort(server, 0)))
  assert.equal(new Set(ports).size, servers.length)
  assert.ok(ports.every(port => port > 0))
})
