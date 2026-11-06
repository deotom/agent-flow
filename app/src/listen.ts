import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/** Bind directly rather than probing a port first (which introduces a race).
 * If a preferred port is occupied, let the OS reserve an available one. */
export async function listenOnAvailablePort(server: Server, preferredPort: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    const onError = (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && preferredPort !== 0) {
        preferredPort = 0
        server.listen(0, '127.0.0.1')
        return
      }
      server.off('listening', onListening)
      server.off('error', onError)
      reject(error)
    }
    server.on('error', onError)
    server.once('listening', onListening)
    server.listen(preferredPort, '127.0.0.1')
  })
  return (server.address() as AddressInfo).port
}
