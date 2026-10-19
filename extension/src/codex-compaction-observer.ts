import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { CodexCompactionState } from './codex-compaction-state'

/** Bounded, incremental framing: one allocation per frame, including fragmented snapshots. */
export class CodexIpcFrames {
  private header = Buffer.alloc(4)
  private headerBytes = 0
  private body: Buffer | undefined
  private bodyBytes = 0
  push(chunk: Buffer, accept: (message: any) => void): void {
    let offset = 0
    while (offset < chunk.length) {
      if (!this.body) {
        const length = Math.min(4 - this.headerBytes, chunk.length - offset)
        chunk.copy(this.header, this.headerBytes, offset, offset + length)
        this.headerBytes += length; offset += length
        if (this.headerBytes < 4) continue
        const size = this.header.readUInt32LE()
        if (size === 0 || size > 16 * 1024 * 1024) throw new Error('Invalid Codex IPC frame length')
        this.body = Buffer.allocUnsafe(size); this.bodyBytes = 0; this.headerBytes = 0
      }
      const length = Math.min(this.body.length - this.bodyBytes, chunk.length - offset)
      chunk.copy(this.body, this.bodyBytes, offset, offset + length)
      this.bodyBytes += length; offset += length
      if (this.bodyBytes === this.body.length) {
        const body = this.body; this.body = undefined
        accept(JSON.parse(body.toString('utf8')))
      }
    }
  }
}

/** Read-only follower. Never starts a server, owns a thread or submits Codex actions. */
export class CodexCompactionObserver {
  private socket?: net.Socket
  private clientId?: string
  private disposed = false
  private subscriptions = new Map<string, { owner?: string; projection: CodexCompactionState }>()
  private retry?: NodeJS.Timeout
  private refresh: NodeJS.Timeout

  constructor(private ids: () => string[], private changed: (id: string, active: boolean) => void,
    private endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\codex-ipc'
      : path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'ipc', 'ipc.sock')) {
    this.refresh = setInterval(() => this.sync(), 2000)
    this.refresh.unref()
    this.connect()
  }

  private connect(): void {
    if (this.disposed) return
    const socket = net.connect(this.endpoint)
    this.socket = socket
    const frames = new CodexIpcFrames()
    const timeout = setTimeout(() => socket.destroy(), 30000)
    timeout.unref()
    socket.on('connect', () => this.send({ type: 'request', requestId: randomUUID(), sourceClientId: 'initializing-client',
      version: 0, method: 'initialize', params: { clientType: 'agent-flow-observer' } }))
    socket.on('data', chunk => {
      try { frames.push(chunk, message => {
        if (message.type === 'client-discovery-request') this.send({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } })
        if (message.type === 'response' && message.method === 'initialize' && message.resultType === 'success'
          && typeof message.result?.clientId === 'string') {
          clearTimeout(timeout); this.clientId = message.result.clientId; this.sync()
        }
        if (message.type === 'broadcast' && message.method === 'client-status-changed') {
          if (message.params?.status === 'disconnected') for (const [id, entry] of this.subscriptions) {
            if (entry.owner !== message.params.clientId) continue
            this.changed(id, false); entry.owner = undefined; entry.projection = new CodexCompactionState()
          }
          if (message.params?.status === 'connected') for (const id of this.subscriptions.keys()) this.follow(id, true)
        }
        if (message.type === 'broadcast' && message.method === 'thread-stream-following-status-requested'
          && message.version === 1 && message.params?.hostId === 'local' && this.subscriptions.has(message.params.conversationId)) {
          this.follow(message.params.conversationId, true)
        }
        if (message.type !== 'broadcast' || message.method !== 'thread-stream-state-changed' || message.version !== 11) return
        const { conversationId, hostId, change } = message.params ?? {}
        const entry = hostId === 'local' ? this.subscriptions.get(conversationId) : undefined
        if (!entry || !change) return
        // Ownership can change across extension windows. Wait for a new owner's full snapshot.
        if (entry.owner && entry.owner !== message.sourceClientId && change.type !== 'snapshot') {
          this.changed(conversationId, false)
          entry.owner = message.sourceClientId; entry.projection = new CodexCompactionState()
          this.follow(conversationId, false); this.follow(conversationId, true)
          return
        }
        entry.owner = message.sourceClientId
        try { this.changed(conversationId, entry.projection.update(change)) }
        catch {
          this.changed(conversationId, false)
          entry.projection = new CodexCompactionState()
          this.follow(conversationId, false); this.follow(conversationId, true)
        }
      }) } catch { socket.destroy() }
    })
    socket.on('error', () => { /* Codex may not be running; rollout watching remains available. */ })
    socket.on('close', () => {
      clearTimeout(timeout)
      this.clientId = undefined
      for (const id of this.subscriptions.keys()) this.changed(id, false)
      this.subscriptions.clear()
      if (!this.disposed) { this.retry = setTimeout(() => this.connect(), 5000); this.retry.unref() }
    })
  }

  private send(message: unknown): void {
    if (!this.socket || this.socket.destroyed) return
    const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4)
    header.writeUInt32LE(body.length)
    this.socket.write(Buffer.concat([header, body]))
  }
  private follow(id: string, following: boolean): void {
    this.send({ type: 'broadcast', method: 'thread-stream-following-changed', version: 1, sourceClientId: this.clientId,
      params: { conversationId: id, hostId: 'local', following } })
  }
  private sync(): void {
    if (!this.clientId) return
    const ids = new Set(this.ids().slice(0, 128))
    for (const id of this.subscriptions.keys()) if (!ids.has(id)) {
      this.follow(id, false); this.changed(id, false); this.subscriptions.delete(id)
    }
    for (const id of ids) if (!this.subscriptions.has(id)) {
      this.subscriptions.set(id, { projection: new CodexCompactionState() }); this.follow(id, true)
    }
  }
  dispose(): void {
    this.disposed = true
    clearInterval(this.refresh); clearTimeout(this.retry)
    for (const id of this.subscriptions.keys()) this.changed(id, false)
    this.subscriptions.clear()
    this.socket?.destroy()
  }
}
