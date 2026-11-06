// Synthetic Realtime connectivity test. Does not read or upload agent sessions.
// node --env-file=D:/sensitive/agent-flow-supabase.env scripts/supabase-smoke.mjs
import { randomUUID } from 'node:crypto'

const projectUrl = process.env.SUPABASE_URL
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
if (!projectUrl || !publishableKey || projectUrl.includes('YOUR_PROJECT_REF')) {
  console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the local env file.')
  process.exit(1)
}
const endpoint = new URL('/realtime/v1/websocket', projectUrl)
endpoint.protocol = 'wss:'
endpoint.searchParams.set('apikey', publishableKey)
endpoint.searchParams.set('vsn', '1.0.0')
const topic = `realtime:agent-flow-smoke-${randomUUID()}`
const nonce = randomUUID()
const sockets = []
let startedAt = 0
let timeout

function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint)
    sockets.push(socket)
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        topic, event: 'phx_join', ref: '1', join_ref: '1',
        payload: { config: { broadcast: { ack: true, self: false }, presence: { enabled: false }, private: false } },
      }))
    })
    socket.addEventListener('error', () => reject(new Error(`${label}: WebSocket connection failed`)))
    socket.addEventListener('close', () => reject(new Error(`${label}: WebSocket closed before joining`)))
    socket.addEventListener('message', ({ data }) => {
      let message
      try { message = JSON.parse(data) } catch { return }
      if (message.event === 'phx_reply' && message.ref === '1') {
        if (message.payload?.status === 'ok') {
          console.log(`${label}: connected and joined`)
          resolve(socket)
        } else {
          reject(new Error(`${label}: channel join rejected`))
        }
      }
    })
  })
}

try {
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error('Realtime test timed out after 25 seconds')), 25_000)
  })
  await Promise.race([deadline, (async () => {
    const [receiver, sender] = await Promise.all([connect('Receiver'), connect('Sender')])
    const received = new Promise(resolve => {
      receiver.addEventListener('message', ({ data }) => {
        let message
        try { message = JSON.parse(data) } catch { return }
        if (message.event === 'broadcast' && message.payload?.event === 'smoke' && message.payload?.payload?.nonce === nonce) {
          resolve(Date.now() - startedAt)
        }
      })
    })
    startedAt = Date.now()
    sender.send(JSON.stringify({
      topic, event: 'broadcast', ref: '2', join_ref: '1',
      payload: { type: 'broadcast', event: 'smoke', payload: { nonce, status: 'synthetic-test' } },
    }))
    const latency = await received
    console.log(`PASS: synthetic broadcast received by a separate client in ${latency} ms`)
    console.log('This verifies this computer only; iPhone/mobile-network access is not yet tested.')
  })()])
} catch (error) {
  // Avoid dumping URLs or configuration in error output.
  console.error(error.message)
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
  for (const socket of sockets) socket.close()
}
