import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { basename } from 'node:path'
import { webcrypto } from 'node:crypto'
import { RemoteState } from './remote-state'
// The same tiny protocol module is served to Safari; no runtime dependencies.
import { createCipher, realtimeURL, joinMessage, broadcastMessage } from '../mobile/protocol.mjs'

export interface RemoteMirror { ingest(data: string): void; dispose(): void }

/** Opt-in only: the env-file path must be explicitly supplied by the local user. */
export async function createRemoteMirror(workspace: string): Promise<RemoteMirror | undefined> {
  const file = process.env.AGENT_FLOW_REMOTE_CONFIG
  if (!file) return
  const config = parseEnv(readFileSync(file, 'utf8'))
  if (config.AGENT_FLOW_REMOTE_ENABLED !== '1') return
  const cipher = await createCipher(config.AGENT_FLOW_PAIRING_KEY || '', webcrypto)
  const endpoint = realtimeURL(config.SUPABASE_URL || '', config.SUPABASE_PUBLISHABLE_KEY || '')
  const Socket = globalThis.WebSocket
  if (!Socket) throw new Error('Mobile sharing requires Node.js 22 or newer.')
  const state = new RemoteState(basename(workspace))
  let socket: WebSocket | undefined
  let disposed = false
  let joined = false
  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let joinTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let pending: ReturnType<typeof setTimeout> | undefined
  let lastSent = 0
  let sending = false
  const publisher = webcrypto.randomUUID()
  function schedule() {
    if (disposed || pending) return
    pending = setTimeout(() => { pending = undefined; void send() }, Math.max(250, 1000 - (Date.now() - lastSent)))
    pending.unref?.()
  }
  async function send() {
    if (disposed || !joined || socket?.readyState !== Socket.OPEN || sending) return
    sending = true
    try {
      const connection = socket
      const envelope = await cipher.seal({ type: 'snapshot', publisher, sentAt: Date.now(), ...state.snapshot() })
      if (disposed || !joined || socket !== connection || connection.readyState !== Socket.OPEN) return
      connection.send(JSON.stringify(broadcastMessage(cipher.topic, envelope)))
      lastSent = Date.now()
    } catch { console.warn('[mobile] Could not send encrypted status; will retry.') }
    finally { sending = false }
  }
  function connect() {
    if (disposed) return
    joined = false
    const connection = new Socket(endpoint)
    let lastFrame = Date.now()
    socket = connection
    joinTimer = setTimeout(() => connection.close(), 15_000)
    connection.addEventListener('open', () => connection.send(JSON.stringify(joinMessage(cipher.topic))))
    connection.addEventListener('message', async ({ data }) => {
      if (connection !== socket || disposed) return
      lastFrame = Date.now()
      let message
      try { message = JSON.parse(String(data)) } catch { return }
      if (message.event === 'phx_error' || message.event === 'phx_close') { connection.close(); return }
      if (message.event === 'phx_reply' && message.ref === '1') {
        if (message.payload?.status !== 'ok') { connection.close(); return }
        clearTimeout(joinTimer)
        joined = true
        retries = 0
        console.log('[mobile] Encrypted status sharing connected.')
        schedule()
      }
      if (message.event === 'broadcast' && message.payload?.event === 'encrypted') {
        try {
          const request = await cipher.open(message.payload.payload)
          if (request.type === 'request' && Math.abs(Date.now() - request.sentAt) < 60_000) schedule()
        } catch { /* Ignore unauthenticated messages on the public transport. */ }
      }
    })
    connection.addEventListener('error', () => connection.close())
    connection.addEventListener('close', () => {
      if (connection !== socket) return
      joined = false
      clearTimeout(joinTimer)
      clearInterval(heartbeat)
      if (!disposed) {
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(retries++, 5))
        console.warn('[mobile] Sharing disconnected; reconnecting.')
        retryTimer = setTimeout(connect, delay)
        retryTimer.unref?.()
      }
    })
    heartbeat = setInterval(() => {
      if (Date.now() - lastFrame > 45_000) { connection.close(); return }
      if (connection.readyState === Socket.OPEN) {
        connection.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'heartbeat' }))
        schedule()
      }
    }, 15_000)
    heartbeat.unref?.()
  }
  connect()
  return {
    ingest(data) {
      try {
        const message = JSON.parse(data)
        if (message.type === 'agent-event') state.event(message.event)
        else if (message.type === 'session-list') state.syncSessions(message.sessions)
        else if (message.type === 'session-started') state.lifecycle(message.type, message.session)
        else if (message.type === 'session-updated') state.lifecycle(message.type, { id: message.sessionId, label: message.label })
        else if (message.type === 'session-ended') state.lifecycle(message.type, { id: message.sessionId })
        schedule()
      } catch { /* Sharing must not disrupt the local viewer. */ }
    },
    dispose() {
      disposed = true
      clearTimeout(pending); clearTimeout(retryTimer); clearTimeout(joinTimer); clearInterval(heartbeat)
      socket?.close()
    },
  }
}
