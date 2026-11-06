// Live opt-in smoke test: synthetic data only, using the real relay publisher.
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { webcrypto } from 'node:crypto'
import { createRemoteMirror } from './remote-mirror'
import { createCipher, realtimeURL, joinMessage, broadcastMessage } from '../mobile/protocol.mjs'

async function main() {
const config = parseEnv(readFileSync(process.env.AGENT_FLOW_REMOTE_CONFIG!, 'utf8'))
const cipher = await createCipher(config.AGENT_FLOW_PAIRING_KEY, webcrypto)
const socket = new WebSocket(realtimeURL(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY))
const mirror = await createRemoteMirror('synthetic-mobile-test')
let deadline: ReturnType<typeof setTimeout>
try {
  await new Promise<void>((resolve, reject) => {
    deadline = setTimeout(() => reject(new Error('Encrypted smoke test timed out')), 25_000)
    socket.addEventListener('error', () => reject(new Error('Receiver connection failed')))
    socket.addEventListener('open', () => socket.send(JSON.stringify(joinMessage(cipher.topic))))
    socket.addEventListener('message', async ({ data }) => {
      try {
        const message = JSON.parse(String(data))
        if (message.event === 'phx_reply' && message.ref === '1') {
          if (message.payload?.status !== 'ok') { reject(new Error('Receiver join rejected')); return }
          mirror!.ingest(JSON.stringify({ type: 'agent-event', event: { sessionId: 'synthetic', type: 'agent_spawn', time: 0, payload: { name: 'Smoke test agent', task: 'DO_NOT_TRANSMIT', runtime: 'codex' } } }))
          const envelope = await cipher.seal({ type: 'request', sentAt: Date.now() })
          socket.send(JSON.stringify(broadcastMessage(cipher.topic, envelope)))
        }
        if (message.event === 'broadcast' && message.payload?.event === 'encrypted') {
          const snapshot = await cipher.open(message.payload.payload)
          if (snapshot.workspace !== 'synthetic-mobile-test' || !snapshot.sessions?.some(s => s.id === 'synthetic')) return
          if (JSON.stringify(snapshot).includes('DO_NOT_TRANSMIT')) { reject(new Error('Private field was included')); return }
          console.log('PASS: real publisher -> Supabase -> separate encrypted receiver; prompt excluded.')
          resolve()
        }
      } catch { reject(new Error('Encrypted message verification failed')) }
    })
  })
} finally {
  clearTimeout(deadline!)
  mirror?.dispose()
  socket.close()
}
}
main().catch(() => { console.error('Encrypted smoke test failed. No credentials were logged.'); process.exitCode = 1 })
