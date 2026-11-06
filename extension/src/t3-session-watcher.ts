import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TypedEventEmitter } from './typed-event-emitter'
import type { AgentEvent, SessionInfo } from './protocol'
import type { SessionLifecycleEvent } from './session-runtime'
import { projectT3Teams, type T3Projection, type T3Row, type T3Team } from './t3-projection'

interface ReadDatabase {
  exec(sql: string): void
  prepare(sql: string): { all(...args: unknown[]): T3Row[] }
  close(): void
}
/** Local T3 V2 projection adapter. No T3 credentials, commands or writable
 * database connection. Auto/native mode deliberately does not start it. */
export class T3SessionWatcher {
  private events = new TypedEventEmitter<AgentEvent>()
  private lifecycle = new TypedEventEmitter<SessionLifecycleEvent>()
  private detected = new TypedEventEmitter<string>()
  private diagnostics = new TypedEventEmitter<string>()
  private sessionLists = new TypedEventEmitter<SessionInfo[]>()
  readonly onEvent = this.events.event
  readonly onSessionLifecycle = this.lifecycle.event
  readonly onSessionDetected = this.detected.event
  readonly onDiagnostic = this.diagnostics.event
  readonly onSessionsChanged = this.sessionLists.event
  private teams = new Map<string, T3Team>()
  private fingerprints = new Map<string, string>()
  private timer?: ReturnType<typeof setInterval>
  private lastError = ''
  private disposed = false
  constructor(private workspaces: string[], readonly databasePath = process.env.AGENT_FLOW_T3_DB || path.join(os.homedir(), '.t3', 'userdata', 'statev2.sqlite')) {}

  start(): void {
    if (this.timer || this.disposed) return
    this.poll()
    this.timer = setInterval(() => this.poll(), 2000)
    this.timer.unref?.()
  }
  get diagnostic(): string { return this.lastError || 'T3 local teams (read-only)' }
  isActive(): boolean { return this.getActiveSessions().some(s => s.status === 'active') }
  isSessionActive(id: string): boolean { return this.teams.get(id)?.session.status === 'active' }
  getActiveSessions() { return [...this.teams.values()].map(team => team.session) }
  replaySessionStart(ids?: string[], options?: { latestOnly?: boolean; onSnapshot?: (event: AgentEvent) => void }): void {
    for (const [id, team] of this.teams) if (!ids || ids.includes(id)) (options?.onSnapshot || (event => this.events.fire(event)))(team.event)
  }
  poll(): void {
    if (this.disposed) return
    let db: ReadDatabase | undefined
    try {
      if (!fs.existsSync(this.databasePath)) throw new Error('T3 database not found. Open T3 or set AGENT_FLOW_T3_DB.')
      // Lazy loading keeps existing modes compatible with hosts without node:sqlite.
      const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (file: string, options: { readOnly: boolean }) => ReadDatabase }
      db = new DatabaseSync(this.databasePath, { readOnly: true })
      db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 100; BEGIN')
      const read = (name: string) => db!.prepare(`SELECT * FROM ${name}`).all()
      const projects = read('projection_projects')
      const threads = read('orchestration_v2_projection_threads')
      const subagents = read('orchestration_v2_projection_subagents')
      const skeleton: T3Projection = { projects, threads, subagents, runs: [], items: [], providerThreads: [], requests: [] }
      const selected = projectT3Teams(skeleton, this.workspaces).flatMap(team => (team.event.payload.agents as T3Row[])
        .map(agent => String(agent.id)).filter(id => id.startsWith('t3-agent:')).map(id => id.slice('t3-agent:'.length)))
      const placeholders = selected.map(() => '?').join(',') || 'NULL'
      const scoped = (name: string) => db!.prepare(`SELECT * FROM ${name} WHERE thread_id IN (${placeholders})`).all(...selected)
      const runs = scoped('orchestration_v2_projection_runs')
      const providerThreads = scoped('orchestration_v2_projection_provider_threads')
      const requests = scoped('orchestration_v2_projection_runtime_requests')
      const nodes = scoped('orchestration_v2_projection_nodes')
      // Limit to each thread's newest run; never read tool output or transcripts.
      const items = db.prepare(`SELECT turn_item_id, thread_id, run_id, provider_thread_id, type, status,
        json_object('toolName', json_extract(payload_json, '$.toolName'), 'title', json_extract(payload_json, '$.title')) AS payload_json
        FROM orchestration_v2_projection_turn_items i
        WHERE thread_id IN (${placeholders}) AND run_id = (SELECT run_id FROM orchestration_v2_projection_runs r WHERE r.thread_id = i.thread_id ORDER BY ordinal DESC LIMIT 1)
        AND type IN ('command_execution','dynamic_tool','file_change','web_search','mcp_tool_call')`).all(...selected)
      db.exec('COMMIT')
      const projection: T3Projection = { projects, threads, subagents, runs, providerThreads, requests, items, nodes }
      const next = new Map(projectT3Teams(projection, this.workspaces).map(team => [team.session.id, team]))
      let changed = next.size !== this.teams.size
      for (const [id, old] of this.teams) if (!next.has(id)) {
        this.lifecycle.fire({ type: 'ended', sessionId: id, label: old.session.label })
        this.fingerprints.delete(id)
      }
      for (const [id, team] of next) {
        // Wall-clock age is not an activity change.
        const signature = JSON.stringify({ session: team.session, payload: { ...team.event.payload,
          agents: (team.event.payload.agents as T3Row[]).map(({ timeAlive, ...agent }) => agent) } })
        if (signature === this.fingerprints.get(id)) continue
        changed = true
        this.lifecycle.fire({ type: this.teams.has(id) ? 'updated' : 'started', sessionId: id, label: team.session.label })
        if (!this.teams.has(id)) this.detected.fire(id)
        this.events.fire(team.event)
        this.fingerprints.set(id, signature)
      }
      this.teams = next
      if (changed) this.sessionLists.fire(this.getActiveSessions())
      if (this.lastError) this.diagnostics.fire('T3 local teams (read-only)')
      this.lastError = ''
    } catch (error) {
      // Fail visibly without falling back to unrelated native sessions or leaking paths/data.
      const reason = error instanceof Error && /not found/.test(error.message) ? error.message : 'T3 projection unavailable or incompatible. Check T3 version and database path.'
      if (reason !== this.lastError) { console.warn(`[T3] ${reason}`); this.diagnostics.fire(reason) }
      this.lastError = reason
      for (const [id, team] of this.teams) this.lifecycle.fire({ type: 'ended', sessionId: id, label: team.session.label })
      this.teams.clear(); this.fingerprints.clear()
      this.sessionLists.fire([])
    } finally { db?.close() }
  }
  dispose(): void {
    this.disposed = true
    clearInterval(this.timer)
    this.teams.clear(); this.fingerprints.clear()
    this.events.dispose(); this.lifecycle.dispose(); this.detected.dispose(); this.diagnostics.dispose(); this.sessionLists.dispose()
  }
}
