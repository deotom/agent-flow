import { Worker } from 'node:worker_threads'
import * as path from 'node:path'
import { TypedEventEmitter } from './typed-event-emitter'
import type { AgentEvent, SessionInfo } from './protocol'
import type { SessionLifecycleEvent } from './session-runtime'
import type { T3ProjectInfo, T3Reply } from './t3-session-watcher'
// @ts-ignore -- shared web contract intentionally lives outside extension/rootDir.
import type { SourceHealth } from '../../web/lib/team-types'

export type T3WorkerMessage = {
  [K in keyof T3WorkerValues]: { kind: K; value: T3WorkerValues[K] }
}[keyof T3WorkerValues]
interface T3WorkerValues {
  event: AgentEvent; lifecycle: SessionLifecycleEvent; detected: string; diagnostic: string
  sessions: SessionInfo[]; projects: T3ProjectInfo[]; replies: T3Reply[]; health: SourceHealth
}
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30_000

/** Relay-side cache. Only the dedicated worker imports/executes synchronous SQLite.
 * One request/completion at a time bounds queued snapshots even with a slow relay. */
export class T3WorkerWatcher {
  private events = new TypedEventEmitter<AgentEvent>()
  private lifecycle = new TypedEventEmitter<SessionLifecycleEvent>()
  private detected = new TypedEventEmitter<string>()
  private diagnostics = new TypedEventEmitter<string>()
  private sessionLists = new TypedEventEmitter<SessionInfo[]>()
  private projectLists = new TypedEventEmitter<T3ProjectInfo[]>()
  private replyLists = new TypedEventEmitter<T3Reply[]>()
  private healthEvents = new TypedEventEmitter<SourceHealth>()
  readonly onEvent = this.events.event
  readonly onSessionLifecycle = this.lifecycle.event
  readonly onSessionDetected = this.detected.event
  readonly onDiagnostic = this.diagnostics.event
  readonly onSessionsChanged = this.sessionLists.event
  readonly onProjectsChanged = this.projectLists.event
  readonly onRepliesChanged = this.replyLists.event
  readonly onSourceHealth = this.healthEvents.event
  private sessions: SessionInfo[] = []
  private snapshots = new Map<string, AgentEvent>()
  private projectList: T3ProjectInfo[] = []
  private replyList: T3Reply[] = []
  private health: SourceHealth | null = null
  private source = 'T3 local teams (read-only)'
  private worker?: Worker
  private timer?: ReturnType<typeof setTimeout>
  private watchdog?: ReturnType<typeof setTimeout>
  private sessionLabels = new Map<string, string>()
  private newlyStarted = new Set<string>()
  private started = false
  private disposed = false
  constructor(private workspaces: string[] | null, private databasePath?: string,
    private createWorker: () => Worker = () => new Worker(path.join(__dirname, 't3-poll-worker.cjs'), {
      workerData: { workspaces: this.workspaces, databasePath: this.databasePath },
    })) {}
  get diagnostic(): string { return this.source }
  get sourceHealth(): SourceHealth | null { return this.health }
  get projects(): T3ProjectInfo[] { return this.projectList }
  get replies(): T3Reply[] { return this.replyList }
  getActiveSessions(): SessionInfo[] { return [...this.sessions] }
  isActive(): boolean { return this.sessions.some(s => s.status === 'active') }
  isSessionActive(id: string): boolean { return this.sessions.some(s => s.id === id && s.status === 'active') }
  replaySessionStart(ids?: string[], options?: { latestOnly?: boolean; onSnapshot?: (event: AgentEvent) => void }): void {
    for (const [id, event] of this.snapshots) if (!ids || ids.includes(id)) (options?.onSnapshot || (value => this.events.fire(value)))(event)
  }
  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    this.poll()
  }
  private schedule(): void {
    if (this.disposed) return
    this.timer = setTimeout(() => { this.timer = undefined; this.poll() }, POLL_INTERVAL_MS)
    this.timer.unref?.()
  }
  private poll(): void {
    if (this.disposed) return
    try {
      if (!this.worker) {
        const worker = this.createWorker()
        this.worker = worker
        worker.on('message', (messages: T3WorkerMessage[]) => {
          if (this.disposed || this.worker !== worker || !Array.isArray(messages)) return
          clearTimeout(this.watchdog)
          this.watchdog = undefined
          try {
            // A recreated worker has no record of the old sessions. Reconcile
            // its complete baseline before forwarding starts for the new one.
            for (const message of messages) if (message.kind === 'sessions') {
              this.endMissingSessions(message.value)
              break
            }
            for (const message of messages) { if (this.disposed) break; this.receive(message) }
          }
          finally { this.schedule() }
        })
        worker.on('error', () => this.failed(worker))
        worker.on('exit', () => this.failed(worker))
        worker.unref()
      }
      const worker = this.worker
      this.watchdog = setTimeout(() => this.failed(worker), POLL_TIMEOUT_MS)
      this.watchdog.unref?.()
      this.worker.postMessage('poll')
    } catch { this.failed(this.worker) }
  }
  private failed(worker: Worker | undefined): void {
    if (this.disposed || this.worker !== worker) return
    this.worker = undefined
    // Wait for native work to actually stop before creating another worker.
    // A synchronous native call may delay termination; never accumulate peers.
    const stopped = worker ? worker.terminate().catch(() => {}) : Promise.resolve()
    clearTimeout(this.timer)
    clearTimeout(this.watchdog)
    this.watchdog = undefined
    const reason = 'T3 poll worker unavailable. Retrying local monitoring.'
    const prior = this.health
    this.health = { source: 't3', state: 'unavailable', checkedAt: Date.now(),
      lastSuccessAt: prior?.lastSuccessAt ?? null, lastChangeAt: prior?.lastChangeAt ?? null,
      pollIntervalMs: POLL_INTERVAL_MS, reason }
    try {
      if (this.source !== reason) { this.source = reason; this.diagnostics.fire(reason) }
      this.healthEvents.fire(this.health)
    } finally { void stopped.then(() => this.schedule()) }
  }
  private endMissingSessions(sessions: SessionInfo[]): void {
    const ids = new Set(sessions.map(session => session.id))
    for (const [id, label] of this.sessionLabels) if (!ids.has(id)) {
      this.sessionLabels.delete(id); this.newlyStarted.delete(id); this.snapshots.delete(id)
      this.lifecycle.fire({ type: 'ended', sessionId: id, label })
    }
  }
  private receive(message: T3WorkerMessage): void {
    switch (message.kind) {
      case 'event':
        if (message.value.sessionId) this.snapshots.set(message.value.sessionId, message.value)
        this.events.fire(message.value); break
      case 'lifecycle':
        if (message.value.type === 'ended') {
          this.snapshots.delete(message.value.sessionId)
          if (!this.sessionLabels.delete(message.value.sessionId)) break
          this.newlyStarted.delete(message.value.sessionId)
          this.lifecycle.fire(message.value)
        } else {
          const existed = this.sessionLabels.has(message.value.sessionId)
          this.sessionLabels.set(message.value.sessionId, message.value.label)
          if (!existed) this.newlyStarted.add(message.value.sessionId)
          this.lifecycle.fire({ ...message.value, type: existed ? 'updated' : 'started' })
        }
        break
      case 'detected':
        if (this.newlyStarted.delete(message.value)) this.detected.fire(message.value)
        break
      case 'diagnostic': this.source = message.value; this.diagnostics.fire(message.value); break
      case 'sessions': {
        const ids = new Set(message.value.map(session => session.id))
        this.endMissingSessions(message.value)
        for (const id of this.snapshots.keys()) if (!ids.has(id)) this.snapshots.delete(id)
        this.sessions = message.value; this.sessionLists.fire(message.value); break
      }
      case 'projects': this.projectList = message.value; this.projectLists.fire(message.value); break
      case 'replies': this.replyList = message.value; this.replyLists.fire(message.value); break
      case 'health':
        this.health = message.value
        // A recreated watcher may be healthy without emitting a recovery diagnostic.
        const source = message.value.reason || 'T3 local teams (read-only)'
        if (this.source !== source) { this.source = source; this.diagnostics.fire(source) }
        this.healthEvents.fire(message.value); break
    }
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.timer)
    clearTimeout(this.watchdog)
    const worker = this.worker
    this.worker = undefined
    void worker?.terminate().catch(() => {})
    this.sessions = []; this.snapshots.clear(); this.projectList = []; this.replyList = []
    this.sessionLabels.clear(); this.newlyStarted.clear()
    this.events.dispose(); this.lifecycle.dispose(); this.detected.dispose(); this.diagnostics.dispose()
    this.sessionLists.dispose(); this.projectLists.dispose(); this.replyLists.dispose(); this.healthEvents.dispose()
  }
}
