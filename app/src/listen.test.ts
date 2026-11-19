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

for (const code of ['EACCES', 'EADDRNOTAVAIL']) test(`refused preferred port (${code}) retries an available port`, async t => {
  const server = http.createServer((_req, res) => res.end('viewer'))
  t.after(() => { server.closeAllConnections(); server.close() })
  const actual = server.listen.bind(server), attempted: unknown[] = []
  server.listen = ((...args: unknown[]) => {
    attempted.push(args[0])
    if (args[0] === 23001) {
      queueMicrotask(() => server.emit('error', Object.assign(new Error('Reserved port'), { code })))
      return server
    }
    return Reflect.apply(actual, server, args)
  }) as typeof server.listen
  const selected = await listenOnAvailablePort(server, 23001)
  assert.deepEqual(attempted, [23001, 0])
  assert.ok(selected > 0)
  assert.equal(await (await fetch(`http://127.0.0.1:${selected}`)).text(), 'viewer')
})

test('a refused automatic port terminates without retrying forever', async () => {
  const server = http.createServer(), attempted: unknown[] = []
  server.listen = ((port: unknown) => {
    attempted.push(port)
    queueMicrotask(() => server.emit('error', Object.assign(new Error('No loopback access'), { code: 'EACCES' })))
    return server
  }) as typeof server.listen
  await assert.rejects(listenOnAvailablePort(server, 0), /No loopback access/)
  assert.deepEqual(attempted, [0])
})
