/** One isolated relay per workspace. Switching folders exits the old process,
 * releasing its watchers, SSE clients and discovery registration together. */
import * as http from 'node:http'
import * as fs from 'node:fs'
import { createRelay, Relay } from '../scripts/relay'
import { serveStatic } from '../app/src/static'
import { listenOnAvailablePort } from '../app/src/listen'

const parent = (process as unknown as {
  parentPort?: { postMessage(value: unknown): void; on(name: string, listener: (event: { data: unknown }) => void): void }
}).parentPort
function send(value: unknown) {
  if (parent) parent.postMessage(value)
  else process.send?.(value)
}

let relay: Relay | undefined
let server: http.Server | undefined
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  relay?.dispose()
  server?.close()
  server?.closeAllConnections()
  process.exit(0)
}
parent?.on('message', event => { if (event.data === 'stop') stop() })
process.on('message', message => { if (message === 'stop') stop() })
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('disconnect', stop)

async function main() {
  const workspace = fs.realpathSync(process.argv[2])
  if (!fs.statSync(workspace).isDirectory()) throw new Error('Please select a folder.')
  // Desktop watches existing transcripts and hook registrations. It does not
  // rewrite global Claude settings or enable the published CLI's telemetry.
  relay = await createRelay({ workspace })
  server = http.createServer((req, res) => {
    if (req.url === '/events') return relay!.handleSSE(req, res)
    if (req.method === 'GET') return serveStatic(req, res)
    res.writeHead(404).end('Not found')
  })
  const port = await listenOnAvailablePort(server, 0)
  send({ type: 'ready', url: `http://127.0.0.1:${port}` })
}
main().catch(error => {
  send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  relay?.dispose()
  server?.close()
  process.exit(1)
})
