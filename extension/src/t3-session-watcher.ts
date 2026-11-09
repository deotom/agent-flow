import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TypedEventEmitter } from './typed-event-emitter'
import type { AgentEvent, SessionInfo } from './protocol'
import type { SessionLifecycleEvent } from './session-runtime'
import { projectT3Teams, t3WorkspaceMatches, type T3Projection, type T3Row, type T3Team } from './t3-projection'

/** A T3 project the prompt bar can target. Only id, title and folder: no scripts, settings or icons. */
export interface T3ProjectInfo { id: string; title: string; root: string; current: boolean }
// @ts-ignore -- shared web contract intentionally lives outside extension/rootDir.
import type { SourceHealth } from '../../web/lib/team-types'

const T3_POLL_INTERVAL_MS = 2000

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
  private sourceHealthEvents = new TypedEventEmitter<SourceHealth>()
  private projectLists = new TypedEventEmitter<T3ProjectInfo[]>()
  private projectList: T3ProjectInfo[] = []
  private projectFingerprint = ''
  readonly onEvent = this.events.event
  readonly onSessionLifecycle = this.lifecycle.event
  readonly onSessionDetected = this.detected.event
  readonly onDiagnostic = this.diagnostics.event
  readonly onSessionsChanged = this.sessionLists.event
  readonly onSourceHealth = this.sourceHealthEvents.event
  readonly onProjectsChanged = this.projectLists.event
  get projects(): T3ProjectInfo[] { return this.projectList }
  private teams = new Map<string, T3Team>()
  private fingerprints = new Map<string, string>()
  private timer?: ReturnType<typeof setInterval>
  private lastError = ''
  private lastSuccessAt: number | null = null
  private lastChangeAt: number | null = null
  private latestHealth: SourceHealth | null = null
  private disposed = false
  constructor(private workspaces: string[], readonly databasePath = process.env.AGENT_FLOW_T3_DB || path.join(os.homedir(), '.t3', 'userdata', 'statev2.sqlite')) {}

  start(): void {
    if (this.timer || this.disposed) return
    this.poll()
    this.timer = setInterval(() => this.poll(), T3_POLL_INTERVAL_MS)
    this.timer.unref?.()
  }
  get diagnostic(): string { return this.lastError || 'T3 local teams (read-only)' }
  get sourceHealth(): SourceHealth | null { return this.latestHealth }
  isActive(): boolean { return this.getActiveSessions().some(s => s.status === 'active') }
  isSessionActive(id: string): boolean { return this.teams.get(id)?.session.status === 'active' }
  getActiveSessions() { return [...this.teams.values()].map(team => team.session) }
  replaySessionStart(ids?: string[], options?: { latestOnly?: boolean; onSnapshot?: (event: AgentEvent) => void }): void {
    for (const [id, team] of this.teams) if (!ids || ids.includes(id)) (options?.onSnapshot || (event => this.events.fire(event)))(team.event)
  }
    private updateProjects(rows: T3Row[]): void {
    const list = rows.filter(row => !row.deleted_at && !row.archived_at && typeof row.workspace_root === 'string' && row.workspace_root)
      .map(row => {
        const root = String(row.workspace_root)
        return { id: String(row.project_id), title: String(row.title || '') || path.basename(root), root,
          current: this.workspaces.some(workspace => t3WorkspaceMatches(workspace, root) || t3WorkspaceMatches(root, workspace)) }
      })
      .sort((a, b) => Number(b.current) - Number(a.current) || a.title.localeCompare(b.title))
    const fingerprint = JSON.stringify(list)
    if (fingerprint === this.projectFingerprint) return
    this.projectFingerprint = fingerprint
    this.projectList = list
    this.projectLists.fire(list)
  }
poll(): void {
    if (this.disposed) return
    const checkedAt = Date.now()
    let db: ReadDatabase | undefined
    try {
      if (!fs.existsSync(this.databasePath)) throw new Error('T3 database not found. Open T3 or set AGENT_FLOW_T3_DB.')
      // Lazy loading keeps existing modes compatible with hosts without node:sqlite.
      const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (file: string, options: { readOnly: boolean }) => ReadDatabase }
      db = new DatabaseSync(this.databasePath, { readOnly: true })
      db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 100; BEGIN')
      const projects = db.prepare(`SELECT project_id, workspace_root, deleted_at FROM projection_projects`).all()
      const threads = db.prepare(`SELECT thread_id, project_id, title, default_provider, active_provider_thread_id,
        created_at, updated_at, archived_at, deleted_at,
        json_object('lineage', json_extract(payload_json, '$.lineage'), 'modelSelection', json_extract(payload_json, '$.modelSelection'),
          'activeProviderThreadId', json_extract(payload_json, '$.activeProviderThreadId')) AS payload_json
        FROM orchestration_v2_projection_threads`).all()
      const subagents = db.prepare(`SELECT subagent_id, thread_id, run_id, parent_node_id, provider, provider_thread_id,
        child_thread_id, status, started_at, completed_at, updated_at, driver, completion_delivery_state,
        json_object('title', json_extract(payload_json, '$.title'), 'model', json_extract(payload_json, '$.model'),
          'prompt', json_extract(payload_json, '$.prompt'), 'result', json_extract(payload_json, '$.result'),
          'completionDelivery', json_object('observedByRunId', json_extract(payload_json, '$.completionDelivery.observedByRunId'))) AS payload_json
        FROM orchestration_v2_projection_subagents`).all()
      const skeleton: T3Projection = { projects, threads, subagents, runs: [], items: [], providerThreads: [], requests: [] }
      const selected = projectT3Teams(skeleton, this.workspaces).flatMap(team => (team.event.payload.agents as T3Row[])
        .map(agent => String(agent.id)).filter(id => id.startsWith('t3-agent:')).map(id => id.slice('t3-agent:'.length)))
      const placeholders = selected.map(() => '?').join(',') || 'NULL'
      const runs = db.prepare(`SELECT run_id, thread_id, ordinal, status, provider_thread_id, completed_at,
        json_object('modelSelection', json_extract(payload_json, '$.modelSelection')) AS payload_json
        FROM orchestration_v2_projection_runs WHERE thread_id IN (${placeholders})`).all(...selected)
      const providerThreads = db.prepare(`SELECT provider_thread_id, thread_id, provider, driver, updated_at,
        json_object('contextUsage', json_extract(payload_json, '$.contextUsage'),
          'pendingBackgroundTasks', json_extract(payload_json, '$.pendingBackgroundTasks')) AS payload_json
        FROM orchestration_v2_projection_provider_threads WHERE thread_id IN (${placeholders})`).all(...selected)
      const requests = db.prepare(`SELECT runtime_request_id, thread_id, node_id, kind, status, created_at, resolved_at
        FROM orchestration_v2_projection_runtime_requests WHERE thread_id IN (${placeholders})`).all(...selected)
      const nodes = db.prepare(`SELECT node_id, thread_id, parent_node_id, provider_thread_id, started_at, completed_at
        FROM orchestration_v2_projection_nodes WHERE thread_id IN (${placeholders})`).all(...selected)
      // Limit to each thread's newest run; never read tool output or transcripts.
      const items = db.prepare(`SELECT turn_item_id, thread_id, run_id, provider_thread_id, type, status, updated_at,
        json_object('toolName', json_extract(payload_json, '$.toolName'), 'title', json_extract(payload_json, '$.title')) AS payload_json
        FROM orchestration_v2_projection_turn_items i
        WHERE thread_id IN (${placeholders}) AND run_id = (SELECT run_id FROM orchestration_v2_projection_runs r WHERE r.thread_id = i.thread_id ORDER BY ordinal DESC LIMIT 1)
        AND type IN ('command_execution','dynamic_tool','file_change','web_search','mcp_tool_call','compaction')`).all(...selected)
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
      // Titles feed only the prompt bar; an older schema without them must not stop team monitoring.
      let projectRows = projects
      try { projectRows = db.prepare(`SELECT project_id, title, workspace_root, deleted_at, archived_at FROM projection_projects`).all() } catch { /* use folder names */ }
      this.updateProjects(projectRows)
      this.lastSuccessAt = checkedAt
      if (changed) this.lastChangeAt = checkedAt
      if (this.lastError) this.diagnostics.fire('T3 local teams (read-only)')
      this.lastError = ''
      this.latestHealth = { source: 't3', state: 'ok', checkedAt, lastSuccessAt: this.lastSuccessAt,
        lastChangeAt: this.lastChangeAt, pollIntervalMs: T3_POLL_INTERVAL_MS, reason: null }
    } catch (error) {
      // Fail visibly without falling back to unrelated native sessions or leaking paths/data.
      const reason = error instanceof Error && /not found/.test(error.message) ? error.message : 'T3 projection unavailable or incompatible. Check T3 version and database path.'
      if (reason !== this.lastError) { console.warn(`[T3] ${reason}`); this.diagnostics.fire(reason) }
      this.lastError = reason
      this.latestHealth = { source: 't3', state: 'unavailable', checkedAt, lastSuccessAt: this.lastSuccessAt,
        lastChangeAt: this.lastChangeAt, pollIntervalMs: T3_POLL_INTERVAL_MS, reason }
    } finally {
      db?.close()
      if (this.latestHealth?.checkedAt === checkedAt) this.sourceHealthEvents.fire(this.latestHealth)
    }
  }
  dispose(): void {
    this.disposed = true
    clearInterval(this.timer)
    this.teams.clear(); this.fingerprints.clear()
    this.events.dispose(); this.lifecycle.dispose(); this.detected.dispose(); this.diagnostics.dispose(); this.sessionLists.dispose(); this.sourceHealthEvents.dispose()
  }
}
