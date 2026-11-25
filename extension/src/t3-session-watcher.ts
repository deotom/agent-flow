import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TypedEventEmitter } from './typed-event-emitter'
import type { AgentEvent, SessionInfo } from './protocol'
import type { SessionLifecycleEvent } from './session-runtime'
import { projectT3Teams, selectT3ThreadIds, t3WorkspaceMatches, type T3Projection, type T3Row, type T3Team } from './t3-projection'

/** A T3 project the prompt bar can target. Only id, title and folder: no scripts, settings or icons. */
export interface T3ProjectInfo { id: string; title: string; root: string; current: boolean }

/**
 * The lead's latest reply, for the orb's fading caption. Local only.
 * Only the reply text, cleaned and capped; never tool output, commands or the user's own messages.
 */
export interface T3Reply { sessionId: string; text: string; at: number | null; streaming: boolean }
const REPLY_LIMIT = 280
export function replyText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const plain = value
    .replace(/```[\s\S]*?(```|$)/g, ' ')        // code blocks
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')   // links and images keep their text
    .replace(/[*_`>#|]+/g, '')                   // markdown marks
    .replace(/\s+/g, ' ').trim()
  return plain.length > REPLY_LIMIT ? `${plain.slice(0, REPLY_LIMIT - 1).trimEnd()}…` : plain
}
// @ts-ignore -- shared web contract intentionally lives outside extension/rootDir.
import type { SourceHealth } from '../../web/lib/team-types'

const T3_POLL_INTERVAL_MS = 2000

/** Opt-in numeric diagnostics only; never include source content or identifiers. */
export interface T3PollTiming {
  startedAt: number; finishedAt: number; totalMs: number
  readMs: number; projectMs: number; repliesMs: number; closeMs: number
}

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
  private replyLists = new TypedEventEmitter<T3Reply[]>()
  private replyList: T3Reply[] = []
  private replyFingerprint = ''
  readonly onEvent = this.events.event
  readonly onSessionLifecycle = this.lifecycle.event
  readonly onSessionDetected = this.detected.event
  readonly onDiagnostic = this.diagnostics.event
  readonly onSessionsChanged = this.sessionLists.event
  readonly onSourceHealth = this.sourceHealthEvents.event
  readonly onProjectsChanged = this.projectLists.event
  get projects(): T3ProjectInfo[] { return this.projectList }
  readonly onRepliesChanged = this.replyLists.event
  get replies(): T3Reply[] { return this.replyList }
  private teams = new Map<string, T3Team>()
  private fingerprints = new Map<string, string>()
  private projectionFingerprint = ''
  private timer?: ReturnType<typeof setTimeout>
  private lastError = ''
  private lastSuccessAt: number | null = null
  private lastChangeAt: number | null = null
  private latestHealth: SourceHealth | null = null
  private disposed = false
  /** `workspaces` null watches every T3 project on this machine. */
  constructor(private workspaces: string[] | null, readonly databasePath = process.env.AGENT_FLOW_T3_DB || path.join(os.homedir(), '.t3', 'userdata', 'statev2.sqlite'),
    private onTiming?: (value: T3PollTiming) => void) {}

  start(): void {
    if (this.timer || this.disposed) return
    try { this.poll() }
    finally { this.scheduleNextPoll() }
  }
  private scheduleNextPoll(): void {
    if (this.disposed) return
    // A synchronous SQLite read can exceed the interval. Wait after it finishes
    // so missed interval deadlines cannot keep the relay worker busy polling.
    this.timer = setTimeout(() => {
      this.timer = undefined
      // Observer errors may escape poll's finally; keep the timer lifecycle
      // intact without changing the caller/host's error handling policy.
      try { this.poll() }
      finally { this.scheduleNextPoll() }
    }, T3_POLL_INTERVAL_MS)
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
  private updateReplies(db: ReadDatabase, sessionIds: string[]): void {
    const list: T3Reply[] = []
    try {
      // Select each lead's winner before decoding JSON. This also bounds decoding
      // when the source database has no timestamp-sorted assistant-message index.
      const rows = db.prepare(`WITH selected(thread_id) AS (
        VALUES ${sessionIds.map(() => '(?)').join(',') || '(NULL)'})
        SELECT selected.thread_id, (
          SELECT json_object('updated_at', updated_at,
            'streaming', json_extract(payload_json, '$.streaming'),
            'text', substr(json_extract(payload_json, '$.text'), 1, 2000))
          FROM (SELECT updated_at, payload_json
            FROM orchestration_v2_projection_turn_items
            WHERE thread_id = selected.thread_id AND type = 'assistant_message'
            ORDER BY updated_at DESC LIMIT 1) AS winning) AS reply_json
        FROM selected WHERE selected.thread_id IS NOT NULL`).all(...sessionIds.map(id => id.replace(/^t3:/, '')))
      const latest = new Map(rows.map(row => [row.thread_id,
        typeof row.reply_json === 'string' ? JSON.parse(row.reply_json) as T3Row : undefined]))
      for (const sessionId of sessionIds) {
        const row = latest.get(sessionId.replace(/^t3:/, ''))
        const text = replyText(row?.text)
        if (row && text) list.push({ sessionId, text, at: Date.parse(String(row.updated_at)) || null, streaming: row.streaming === 1 || row.streaming === true })
      }
    } catch { return /* Replies are optional; team monitoring continues without them. */ }
    const fingerprint = JSON.stringify(list)
    if (fingerprint === this.replyFingerprint) return
    this.replyFingerprint = fingerprint
    this.replyList = list
    this.replyLists.fire(list)
  }
  private updateProjects(rows: T3Row[]): void {
    const list = rows.filter(row => !row.deleted_at && !row.archived_at && typeof row.workspace_root === 'string' && row.workspace_root)
      .map(row => {
        const root = String(row.workspace_root)
        return { id: String(row.project_id), title: String(row.title || '') || path.basename(root), root,
          // Exact folder match only: a parent or nested project must be chosen explicitly, never guessed.
          current: this.workspaces !== null && this.workspaces.some(workspace => t3WorkspaceMatches(workspace, root) && t3WorkspaceMatches(root, workspace)) }
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
    let checkedAt = Date.now()
    const timing = this.onTiming ? { startedAt: checkedAt, finishedAt: 0, totalMs: 0,
      readMs: 0, projectMs: 0, repliesMs: 0, closeMs: 0 } : undefined
    let timingMark = timing ? performance.now() : 0
    let timingStage: 'readMs' | 'projectMs' | 'repliesMs' | 'closeMs' = 'readMs'
    const advanceTiming = timing ? (next: typeof timingStage) => {
      const at = performance.now()
      timing[timingStage] += at - timingMark
      timingMark = at; timingStage = next
    } : undefined
    let db: ReadDatabase | undefined
    try {
      if (!fs.existsSync(this.databasePath)) throw new Error('T3 database not found. Open T3 or set AGENT_FLOW_T3_DB.')
      // Lazy loading keeps existing modes compatible with hosts without node:sqlite.
      const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (file: string, options: { readOnly: boolean }) => ReadDatabase }
      // Release every handle after its snapshot. On Windows even an idle
      // read-only connection can prevent T3 replacing/upgrading its database.
      db = new DatabaseSync(this.databasePath, { readOnly: true })
      db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 100; BEGIN')
      // Titles name each team's project; an older schema without them falls back to folder names.
      let projects: T3Row[]
      try { projects = db.prepare(`SELECT project_id, title, workspace_root, deleted_at, archived_at FROM projection_projects`).all() }
      catch { projects = db.prepare(`SELECT project_id, workspace_root, deleted_at FROM projection_projects`).all() }
      const threads = db.prepare(`SELECT thread_id, project_id, title, default_provider, active_provider_thread_id,
        created_at, updated_at, archived_at, deleted_at,
        json_object('lineage', json_extract(payload_json, '$.lineage'), 'modelSelection', json_extract(payload_json, '$.modelSelection'),
          'activeProviderThreadId', json_extract(payload_json, '$.activeProviderThreadId')) AS payload_json
        FROM orchestration_v2_projection_threads WHERE deleted_at IS NULL`).all()
      const subagentLinks = db.prepare(`SELECT thread_id, child_thread_id FROM main.orchestration_v2_projection_subagents WHERE child_thread_id IS NOT NULL`).all()
      const skeleton: T3Projection = { projects, threads, subagents: subagentLinks, runs: [], items: [], providerThreads: [], requests: [] }
      const selected = selectT3ThreadIds(skeleton, this.workspaces)
      const placeholders = selected.map(() => '?').join(',') || 'NULL'
      const subagents = db.prepare(`SELECT subagent_id, thread_id, run_id, parent_node_id, provider, provider_thread_id,
        child_thread_id, status, started_at, completed_at, updated_at, driver, completion_delivery_state,
        json_object('title', json_extract(payload_json, '$.title'), 'model', json_extract(payload_json, '$.model'), 'role', json_extract(payload_json, '$.role'),
          'prompt', substr(json_extract(payload_json, '$.prompt'), 1, 2000), 'result', substr(json_extract(payload_json, '$.result'), 1, 2000),
          'completionDelivery', json_object('observedByRunId', json_extract(payload_json, '$.completionDelivery.observedByRunId'))) AS payload_json
        FROM orchestration_v2_projection_subagents WHERE thread_id IN (${placeholders})`).all(...selected)
      const runs = db.prepare(`SELECT run_id, thread_id, ordinal, status, provider_thread_id, completed_at,
        json_object('modelSelection', json_extract(payload_json, '$.modelSelection')) AS payload_json
        FROM orchestration_v2_projection_runs WHERE thread_id IN (${placeholders})`).all(...selected)
      const providerThreads = db.prepare(`SELECT provider_thread_id, thread_id, provider, driver, updated_at,
        json_object('contextUsage', json_extract(payload_json, '$.contextUsage'),
          'pendingBackgroundTasks', json_extract(payload_json, '$.pendingBackgroundTasks')) AS payload_json
        FROM orchestration_v2_projection_provider_threads WHERE thread_id IN (${placeholders})`).all(...selected)
      const requests = db.prepare(`SELECT runtime_request_id, thread_id, node_id, kind, status, created_at, resolved_at
        FROM orchestration_v2_projection_runtime_requests WHERE thread_id IN (${placeholders})`).all(...selected)
      // Parent lookup only needs referenced nodes, not every historical node.
      const parentNodeIds = [...new Set(subagents.map(row => row.parent_node_id).filter((id): id is string => typeof id === 'string' && id.length > 0))]
      const nodes = db.prepare(`SELECT node_id, provider_thread_id
        FROM orchestration_v2_projection_nodes WHERE thread_id IN (${placeholders})
        AND node_id IN (${parentNodeIds.map(() => '?').join(',') || 'NULL'})`).all(...selected, ...parentNodeIds)
      // Materialize the same newest-ordinal run once per thread, rather than
      // looking it up again for every historical tool item in that thread.
      const latestRuns = new Map<string, T3Row>()
      for (const run of runs) {
        const id = String(run.thread_id), prior = latestRuns.get(id)
        if (!prior || Number(run.ordinal) > Number(prior.ordinal)) latestRuns.set(id, run)
      }
      const latestPairs = [...latestRuns.values()].flatMap(run => [run.thread_id, run.run_id])
      // Completed items contribute counts/timestamps only. Decoding their large
      // historical tool results is unnecessary work on every live read.
      const items = db.prepare(`WITH latest_runs(thread_id, run_id) AS (
        VALUES ${[...latestRuns].map(() => '(?,?)').join(',') || '(NULL,NULL)'}),
        relevant AS MATERIALIZED (
          SELECT i.turn_item_id, i.thread_id, i.run_id, i.provider_thread_id, i.type, i.status, i.updated_at,
            i.status IN ('running','starting','queued','pending','in_progress') AS active,
            CASE WHEN i.status IN ('running','starting','queued','pending','in_progress') THEN
              json_object('toolName', json_extract(i.payload_json, '$.toolName'), 'title', json_extract(i.payload_json, '$.title'))
              ELSE '{}' END AS payload_json
          FROM orchestration_v2_projection_turn_items i
          JOIN latest_runs latest ON latest.thread_id = i.thread_id AND latest.run_id = i.run_id
          WHERE i.type IN ('command_execution','dynamic_tool','file_change','web_search','mcp_tool_call','compaction'))
        SELECT turn_item_id, thread_id, run_id, provider_thread_id, type, status, updated_at, payload_json,
          1 AS item_count, NULL AS updated_ats_json FROM relevant WHERE active = 1
        UNION ALL
        SELECT NULL, thread_id, run_id, provider_thread_id, type, NULL, NULL, '{}',
          COUNT(*), json_group_array(updated_at) FROM relevant WHERE active IS NOT 1
        GROUP BY thread_id, run_id, provider_thread_id, type`).all(...latestPairs)
      advanceTiming?.('projectMs')
      const projection: T3Projection = { projects, threads, subagents, runs, providerThreads, requests, items, nodes }
      // Compare the complete freshly read input, not file timestamps or an
      // inferred source revision. All SQLite and optional reply reads still run.
      const projectionFingerprint = JSON.stringify(projection)
      let changed = false
      if (projectionFingerprint !== this.projectionFingerprint) {
        const next = new Map(projectT3Teams(projection, this.workspaces).map(team => [team.session.id, team]))
        changed = next.size !== this.teams.size
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
      }
      this.updateProjects(projects)
      advanceTiming?.('repliesMs')
      this.updateReplies(db, [...this.teams.keys()])
      db.exec('COMMIT')
      this.projectionFingerprint = projectionFingerprint
      // Date the completed read, not its start: large snapshots take time.
      checkedAt = Date.now()
      this.lastSuccessAt = checkedAt
      if (changed) this.lastChangeAt = checkedAt
      if (this.lastError) this.diagnostics.fire('T3 local teams (read-only)')
      this.lastError = ''
      this.latestHealth = { source: 't3', state: 'ok', checkedAt, lastSuccessAt: this.lastSuccessAt,
        lastChangeAt: this.lastChangeAt, pollIntervalMs: T3_POLL_INTERVAL_MS, reason: null }
    } catch (error) {
      checkedAt = Date.now()
      // Fail visibly without falling back to unrelated native sessions or leaking paths/data.
      const reason = error instanceof Error && /not found/.test(error.message) ? error.message : 'T3 projection unavailable or incompatible. Check T3 version and database path.'
      if (reason !== this.lastError) { console.warn(`[T3] ${reason}`); this.diagnostics.fire(reason) }
      this.lastError = reason
      this.latestHealth = { source: 't3', state: 'unavailable', checkedAt, lastSuccessAt: this.lastSuccessAt,
        lastChangeAt: this.lastChangeAt, pollIntervalMs: T3_POLL_INTERVAL_MS, reason }
    } finally {
      advanceTiming?.('closeMs')
      try {
        db?.close()
        if (this.latestHealth?.checkedAt === checkedAt) this.sourceHealthEvents.fire(this.latestHealth)
      } finally {
        if (timing) {
          advanceTiming?.('closeMs')
          timing.finishedAt = Date.now()
          timing.totalMs = timing.readMs + timing.projectMs + timing.repliesMs + timing.closeMs
          try { this.onTiming?.(timing) } catch { /* Diagnostics cannot affect monitoring. */ }
        }
      }
    }
  }
  dispose(): void {
    this.disposed = true
    clearTimeout(this.timer)
    this.teams.clear(); this.fingerprints.clear()
    this.projectionFingerprint = ''
    this.events.dispose(); this.lifecycle.dispose(); this.detected.dispose(); this.diagnostics.dispose(); this.sessionLists.dispose(); this.sourceHealthEvents.dispose(); this.projectLists.dispose(); this.replyLists.dispose()
  }
}
