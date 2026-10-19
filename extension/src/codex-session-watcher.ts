/**
 * Watches Codex rollout JSONL files at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 *
 * Codex writes one JSONL file per session. Each file begins with a session_meta
 * record carrying the cwd, from which we match against the active VS Code
 * workspace. Discovery scans every date partition: resumed sessions continue
 * writing to their original file, even months after creation.
 *
 * No SQLite dependency — the canonical source is the filesystem. Respects
 * CODEX_HOME for non-default installs.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { AgentEvent, SessionInfo } from './protocol'
import {
  ACTIVE_SESSION_AGE_S, INACTIVITY_TIMEOUT_MS, ORCHESTRATOR_NAME,
  POLL_FALLBACK_MS, SCAN_INTERVAL_MS, SESSION_ID_DISPLAY,
} from './constants'
import { readNewFileLines } from './fs-utils'
import { createLogger } from './logger'
import {
  CodexRolloutParser, CodexRolloutState, createCodexRolloutState,
} from './codex-rollout-parser'
import type { AgentSessionWatcher, SessionLifecycleEvent } from './session-runtime'
import { TypedEventEmitter } from './typed-event-emitter'

const log = createLogger('CodexSessionWatcher')
const ARCHIVE_SCAN_INTERVAL_MS = 30_000

function currentSessionDirs(): string[] {
  const now = new Date()
  return Array.from(new Set([
    [now.getFullYear(), now.getMonth() + 1, now.getDate()],
    [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()],
  ].map(parts => path.join(sessionsRoot(), ...parts.map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))))))
}

/** Extract the session UUID from a rollout filename.
 *  Filenames look like: rollout-2026-04-22T09-15-00-{uuid}.jsonl */
const SESSION_ID_FROM_FILENAME = /rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f-]{36})\.jsonl$/

interface WatchedCodexSession {
  sessionId: string
  rootSessionId: string
  agentName: string
  parentAgentName?: string
  filePath: string
  fileWatcher: fs.FSWatcher | null
  pollTimer: NodeJS.Timeout | null
  inactivityTimer: NodeJS.Timeout | null
  fileSize: number
  /** Leftover bytes past the last newline from the previous read — prepended
   *  to the next chunk so a JSONL line split across reads gets reassembled. */
  fileTail: string
  sessionStartTime: number
  lastActivityTime: number
  sessionDetected: boolean
  sessionCompleted: boolean
  label: string
  rolloutState: CodexRolloutState
  parser: CodexRolloutParser
}

interface CodexSessionMetadata {
  cwd: string
  startTime?: number
  parentId?: string
  agentName?: string
}

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

function sessionsRoot(): string {
  return path.join(codexHome(), 'sessions')
}

/** Only traverse date directories; never follow symlinks outside CODEX_HOME. */
function sessionDirs(): string[] {
  let dirs = [sessionsRoot()]
  for (const pattern of [/^\d{4}$/, /^\d{2}$/, /^\d{2}$/]) {
    const next: string[] = []
    for (const dir of dirs) {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && pattern.test(entry.name)) next.push(path.join(dir, entry.name))
        }
      } catch { /* Root or partition may not exist yet. */ }
    }
    dirs = next
  }
  return dirs
}

/** Read the first line of a rollout file to extract cwd from session_meta.
 *
 *  UTF-8 safety: `\n` is 0x0a, which never appears as a continuation byte in
 *  a multi-byte UTF-8 sequence (continuation bytes are 0x80–0xBF), so slicing
 *  at the byte-indexed newline is guaranteed to land on a character boundary.
 *
 *  session_meta is typically well under 4KB, but base_instructions (which
 *  newer Codex versions embed in full, including AGENTS.md content) can push
 *  it far larger — keep reading in chunks until the first newline, up to a
 *  1MB cap. Past the cap we give up: JSON.parse fails on the truncated object
 *  and we return null rather than emit a corrupted cwd. */
function readSessionMetadata(filePath: string): CodexSessionMetadata | null {
  const CHUNK_SIZE = 65536
  const MAX_FIRST_LINE = 1048576
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const chunks: Buffer[] = []
      let total = 0
      let end = -1
      while (total < MAX_FIRST_LINE) {
        const buf = Buffer.alloc(CHUNK_SIZE)
        const read = fs.readSync(fd, buf, 0, buf.length, total)
        if (read <= 0) break
        const filled = buf.subarray(0, read)
        // indexOf bounded to the filled portion — unwritten bytes are zero and
        // would never match 0x0a, but an explicit end offset makes this obvious.
        const newlineAt = filled.indexOf(0x0a)
        chunks.push(filled)
        total += read
        if (newlineAt >= 0) { end = total - read + newlineAt; break }
      }
      const data = Buffer.concat(chunks)
      const line = data.subarray(0, end >= 0 ? end : data.length).toString('utf-8')
      const parsed = JSON.parse(line) as { type?: string; timestamp?: string; payload?: {
        cwd?: string; id?: string; source?: string | { subagent?: { thread_spawn?: { parent_thread_id?: string; agent_path?: string } } }
      } }
      if (parsed.type !== 'session_meta') return null
      if (typeof parsed.payload?.cwd !== 'string') return null
      const link = typeof parsed.payload.source === 'object' ? parsed.payload.source?.subagent?.thread_spawn : undefined
      const time = Date.parse(parsed.timestamp || '')
      return { cwd: parsed.payload.cwd, startTime: Number.isFinite(time) ? time : undefined,
        parentId: typeof link?.parent_thread_id === 'string' ? link.parent_thread_id : undefined,
        agentName: typeof link?.agent_path === 'string' ? link.agent_path : parsed.payload.id }
    } finally { fs.closeSync(fd) }
  } catch { return null }
}

// ─── Watcher ───────────────────────────────────────────────────────────────

export class CodexSessionWatcher implements AgentSessionWatcher {
  private dirWatchers = new Map<string, fs.FSWatcher>()
  private sessions = new Map<string, WatchedCodexSession>()
  private workspacePaths: string[] = []
  private scanInterval: NodeJS.Timeout | null = null
  private archiveScanInterval: NodeJS.Timeout | null = null
  private dirScanTimer: NodeJS.Timeout | null = null
  private pendingScanDirs = new Set<string>()
  /** One-shot flag so the cwd-mismatch hint is logged at most once per process. */
  private cwdMismatchWarned = false
  private cwdCache = new Map<string, { mtimeMs: number; metadata: CodexSessionMetadata | null; matches: boolean }>()
  private replayCache = new Map<string, AgentEvent[]>()
  private replayBytes = new Map<string, number>()
  private uncachedRoots = new Set<string>()
  private cacheEvent(root: string, event: AgentEvent): void {
    if (this.uncachedRoots.has(root)) return
    const cache = this.replayCache.get(root) ?? []
    const bytes = (this.replayBytes.get(root) ?? 0) + JSON.stringify(event).length * 2
    if (bytes > 4 * 1024 * 1024) {
      this.replayCache.delete(root); this.replayBytes.delete(root); this.uncachedRoots.add(root); return
    }
    cache.push(event)
    this.replayCache.delete(root); this.replayCache.set(root, cache); this.replayBytes.set(root, bytes)
    let total = [...this.replayBytes.values()].reduce((sum, value) => sum + value, 0)
    for (const id of this.replayCache.keys()) {
      if (total <= 8 * 1024 * 1024) break
      total -= this.replayBytes.get(id) ?? 0
      this.replayCache.delete(id); this.replayBytes.delete(id); this.uncachedRoots.add(id)
    }
  }

  private readonly _onEvent = new TypedEventEmitter<AgentEvent>()
  private readonly _onSessionDetected = new TypedEventEmitter<string>()
  private readonly _onSessionLifecycle = new TypedEventEmitter<SessionLifecycleEvent>()

  readonly onEvent = this._onEvent.event
  readonly onSessionDetected = this._onSessionDetected.event
  readonly onSessionLifecycle = this._onSessionLifecycle.event

  /** Workspace path used as a cwd filter — Codex sessions are attached only if
   *  their session_meta.cwd matches this path (or is under it). Pass null/undefined
   *  to attach to any Codex session (useful when no workspace is open). */
  constructor(private readonly workspace?: string | string[] | null, private readonly historyLimit = 5) {}

  isActive(): boolean {
    for (const s of this.sessions.values()) {
      if (s.sessionDetected && !s.sessionCompleted) return true
    }
    return false
  }

  isSessionActive(sessionId: string): boolean {
    const s = this.sessions.get(sessionId)
    return !!s && s.sessionDetected && (!s.sessionCompleted || Array.from(this.sessions.values()).some(child => child.rootSessionId === sessionId && !child.sessionCompleted))
  }

  private compactingSessions = new Set<string>()

  getLiveSessionIds(): string[] {
    return [...this.sessions.values()].sort((a, b) => b.lastActivityTime - a.lastActivityTime).map(session => session.sessionId)
  }

  setCompacting(sessionId: string, active: boolean): void {
    const session = this.sessions.get(sessionId)
    if (!session || this.compactingSessions.has(sessionId) === active) return
    if (active) this.compactingSessions.add(sessionId)
    else this.compactingSessions.delete(sessionId)
    this.emitSessionEvent(sessionId, { time: (Date.now() - session.sessionStartTime) / 1000,
      type: 'context_compaction', payload: { agent: ORCHESTRATOR_NAME, active } })
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter(s => s.sessionId === s.rootSessionId).map(s => ({
      id: s.sessionId,
      label: s.label,
      status: this.isSessionActive(s.sessionId) ? 'active' : 'completed',
      startTime: s.sessionStartTime,
      lastActivityTime: Math.max(s.lastActivityTime, ...Array.from(this.sessions.values()).filter(child => child.rootSessionId === s.sessionId).map(child => child.lastActivityTime)),
    }))
  }

  replaySessionStart(sessionIds?: string[], options?: { latestOnly?: boolean }): void {
    const roots = Array.from(this.sessions.values()).filter(session => session.sessionId === session.rootSessionId
      && (!sessionIds || sessionIds.includes(session.sessionId)))
    for (const root of roots) {
      this._onSessionLifecycle.fire({ type: 'updated', sessionId: root.sessionId, label: root.label })
      const group = Array.from(this.sessions.values()).filter(session => session.rootSessionId === root.sessionId)
      if (options?.latestOnly) {
        const now = Date.now()
        const agents = group.map(session => {
          const rollout = session.rolloutState
          const pending = [...rollout.pendingToolCalls.values()].at(-1)
          const blocking = [...rollout.pendingUserInputs.values()].some(input => input.blocking)
          const isMain = session === root
          const working = this.compactingSessions.has(session.sessionId) || rollout.turnActive && !session.sessionCompleted
          return { id: session.agentName, parentId: isMain ? null : session.parentAgentName || ORCHESTRATOR_NAME,
            name: isMain ? root.label : undefined, isMain, runtime: 'codex', model: rollout.model ?? undefined,
            state: blocking ? 'waiting_permission' : working ? pending ? 'tool_calling' : 'thinking' : isMain ? 'idle' : 'complete',
            compacting: this.compactingSessions.has(session.sessionId), waitingForInput: blocking, currentTool: working ? pending?.name : undefined,
            tools: working ? [...rollout.pendingToolCalls].map(([callId, call]) => ({ callId, tool: call.name, args: call.args })) : [],
            tokensUsed: rollout.lastReportedTokens ?? Object.values(rollout.contextBreakdown).reduce((sum, value) => sum + value, 0),
            tokensMax: rollout.reportedContextWindow ?? undefined, toolCalls: rollout.seenToolCalls.size,
            spawnTime: (session.sessionStartTime - root.sessionStartTime) / 1000,
            timeAlive: Math.max(0, (session.lastActivityTime - session.sessionStartTime) / 1000) }
        })
        this._onEvent.fire({ time: (now - root.sessionStartTime) / 1000, type: 'session_snapshot',
          payload: { agents, round: root.rolloutState.userTurnCount }, sessionId: root.sessionId, historical: true })
        continue
      }
      const cached = this.replayCache.get(root.sessionId)
      const unchanged = group.every(session => {
        try { return fs.statSync(session.filePath).size === session.fileSize } catch { return false }
      })
      if (cached && unchanged) {
        for (const event of [...cached].sort((a, b) => a.time - b.time)) {
          const payload = { ...event.payload }
          for (const field of ['name', 'agent', 'parent', 'child']) {
            const value = payload[field]
            if (typeof value !== 'string' || value === ORCHESTRATOR_NAME || value.startsWith('/')) continue
            const matches = group.filter(session => session !== root && session.agentName.endsWith(`/${value}`))
            if (matches.length === 1) payload[field] = matches[0].agentName
          }
          this._onEvent.fire({ ...event, payload, historical: true })
        }
        for (const session of group) {
          if (session !== root && (session.sessionCompleted || Date.now() - session.lastActivityTime > INACTIVITY_TIMEOUT_MS)) {
            this._onEvent.fire({ time: (session.lastActivityTime - root.sessionStartTime) / 1000, type: 'agent_complete',
              payload: { name: session.agentName }, sessionId: root.sessionId, historical: true })
          }
        }
        if (!this.isSessionActive(root.sessionId)) {
          this._onEvent.fire({ time: (root.lastActivityTime - root.sessionStartTime) / 1000, type: 'agent_complete',
            payload: { name: ORCHESTRATOR_NAME, sessionEnd: true }, sessionId: root.sessionId, historical: true })
          this._onSessionLifecycle.fire({ type: 'ended', sessionId: root.sessionId, label: root.label })
        }
        continue
      }
      this.replayCache.set(root.sessionId, [])
      this.replayBytes.set(root.sessionId, 0); this.uncachedRoots.delete(root.sessionId)
      const snapshots = Array.from(this.sessions.values()).filter(session => session.rootSessionId === root.sessionId).map(session => ({
        session, content: readNewFileLines(session.filePath, 0), state: createCodexRolloutState(), parser: this.createParser(session.sessionId),
      }))
      const rootSnapshot = snapshots.find(snapshot => snapshot.session === root)
      for (const snapshot of snapshots) {
        if (snapshot.session !== root) rootSnapshot?.state.agents.add(snapshot.session.agentName)
      }
      // Replay parent and child records in timestamp order. Replaying entire
      // child files after the parent would revive already-finished children.
      const rows = snapshots.flatMap(snapshot => (snapshot.content?.lines || []).map(line => ({
        snapshot, line, time: line.slice(0, 200).match(/"timestamp"\s*:\s*"([^"]+)"/)?.[1]
          || new Date(snapshot.session.sessionStartTime).toISOString(),
      })))
      rows.sort((a, b) => a.time.localeCompare(b.time))
      for (const row of rows) row.snapshot.parser.processLine(row.line, row.snapshot.state)
      for (const snapshot of snapshots) {
        const { session, content, parser, state } = snapshot
        if (!content) continue
        if (content.newSize > session.fileSize) {
          try { session.lastActivityTime = Math.max(session.lastActivityTime, fs.statSync(session.filePath).mtimeMs) } catch { /* removed */ }
          if (session.sessionId === session.rootSessionId && Date.now() - session.lastActivityTime <= INACTIVITY_TIMEOUT_MS) {
            if (session.sessionCompleted) this._onSessionLifecycle.fire({ type: 'started', sessionId: session.sessionId, label: session.label })
            session.sessionCompleted = false
          }
        }
        session.parser = parser
        session.rolloutState = state
        session.fileSize = content.newSize
        session.fileTail = content.tail
        if (session.sessionId !== session.rootSessionId && (session.sessionCompleted || Date.now() - session.lastActivityTime > INACTIVITY_TIMEOUT_MS)) {
          this.emitSessionEvent(session.sessionId, { time: (session.lastActivityTime - session.sessionStartTime) / 1000,
            type: 'agent_complete', payload: { name: ORCHESTRATOR_NAME } })
        }
        this.resetInactivityTimer(session.sessionId)
      }
      if (!this.isSessionActive(root.sessionId)) {
        this.emitSessionEvent(root.sessionId, { time: (root.lastActivityTime - root.sessionStartTime) / 1000,
          type: 'agent_complete', payload: { name: ORCHESTRATOR_NAME, sessionEnd: true } })
        this._onSessionLifecycle.fire({ type: 'ended', sessionId: root.sessionId, label: root.label })
      }
    }
    if (!options?.latestOnly) for (const session of this.sessions.values()) {
      if (sessionIds && !sessionIds.includes(session.rootSessionId)) continue
      this._onEvent.fire({ type: 'context_compaction', time: (Date.now() - (this.sessions.get(session.rootSessionId)?.sessionStartTime ?? Date.now())) / 1000,
        sessionId: session.rootSessionId, historical: true,
        payload: { agent: session.agentName, active: this.compactingSessions.has(session.sessionId) } })
    }
  }

  start(): void {
    const workspaces = typeof this.workspace === 'string' ? [this.workspace] : this.workspace ?? []
    this.workspacePaths = workspaces.map(workspace => this.resolvePath(workspace) ?? workspace)

    this.scanForSessions()
    this.scanInterval = setInterval(() => this.scanForSessions(currentSessionDirs()), SCAN_INTERVAL_MS)
    this.archiveScanInterval = setInterval(() => this.scanForSessions(), ARCHIVE_SCAN_INTERVAL_MS)

    // Watch the sessions root for new day directories appearing.
    const root = sessionsRoot()
    if (fs.existsSync(root)) {
      try {
        const rootWatcher = fs.watch(root, { recursive: false }, () => this.scanForSessions())
        this.dirWatchers.set(root, rootWatcher)
      } catch (err) { log.debug('Root dir watch failed:', err) }
    }

    log.info(`Watching ${root} for workspace ${this.workspacePaths.join(', ') || '<any>'}`)
  }

  private scheduleDirScan(dir: string): void {
    this.pendingScanDirs.add(dir)
    if (this.dirScanTimer) return
    this.dirScanTimer = setTimeout(() => {
      this.dirScanTimer = null
      const dirs = Array.from(this.pendingScanDirs)
      this.pendingScanDirs.clear()
      this.scanForSessions(dirs)
    }, 100)
  }

  private scanForSessions(dirs = sessionDirs()): void {
    let skippedByCwd = 0
    const candidates: { filePath: string; stat: fs.Stats; metadata: CodexSessionMetadata }[] = []
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue

      // Watch this day's directory so we pick up new rollout files quickly
      if (!this.dirWatchers.has(dir)) {
        try {
          const w = fs.watch(dir, () => this.scheduleDirScan(dir))
          this.dirWatchers.set(dir, w)
        } catch (err) { log.debug('Dir watch failed:', dir, err) }
      }

      let entries: string[]
      try { entries = fs.readdirSync(dir) }
      catch { continue }

      for (const name of entries) {
        if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue
        const filePath = path.join(dir, name)
        if (this.sessions.has(this.sessionIdFor(filePath))) continue

        // Recency filter — skip stale files
        let stat: fs.Stats
        try { stat = fs.statSync(filePath) } catch { continue }
        if (stat.size === 0) continue
        let cached = this.cwdCache.get(filePath)
        if (!cached || (cached.metadata === null && cached.mtimeMs !== stat.mtimeMs)) {
          const metadata = readSessionMetadata(filePath)
          const resolvedCwd = metadata === null ? null : this.resolvePath(metadata.cwd)
          cached = { mtimeMs: stat.mtimeMs, metadata, matches: !!resolvedCwd && this.pathMatchesWorkspace(resolvedCwd) }
          this.cwdCache.set(filePath, cached)
        }
        if (!cached.metadata) continue
        if (!cached.matches && !cached.metadata.parentId) { skippedByCwd++; continue }
        candidates.push({ filePath, stat, metadata: cached.metadata })
      }
    }
    candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    // Restore a bounded number of inactive workspace sessions, while always
    // discovering active writes regardless of creation date or history limit.
    const byId = new Map(candidates.map(candidate => [this.sessionIdFor(candidate.filePath), candidate]))
    const neededParents = new Set<string>()
    for (const candidate of candidates) {
      if (Date.now() - candidate.stat.mtimeMs > ACTIVE_SESSION_AGE_S * 1000) continue
      let parentId = candidate.metadata.parentId
      while (parentId && !neededParents.has(parentId)) {
        neededParents.add(parentId)
        if (!byId.has(parentId) && !this.sessions.has(parentId)) {
          for (const [filePath, cached] of this.cwdCache) {
            if (cached.matches && cached.metadata && this.sessionIdFor(filePath) === parentId) {
              try {
                const parent = { filePath, stat: fs.statSync(filePath), metadata: cached.metadata }
                candidates.push(parent)
                byId.set(parentId, parent)
              } catch { /* Parent may have been archived or removed. */ }
              break
            }
          }
        }
        parentId = byId.get(parentId)?.metadata.parentId
      }
    }
    let restored = this.getActiveSessions().length
    for (const { filePath, stat, metadata } of candidates) {
      if (metadata.parentId) continue
      const active = Date.now() - stat.mtimeMs <= ACTIVE_SESSION_AGE_S * 1000
      if (!active && !neededParents.has(this.sessionIdFor(filePath)) && (!this.workspacePaths.length || restored >= this.historyLimit)) continue
      this.attachSession(filePath, stat, metadata)
      restored++
    }
    // Attach children only to a restored ancestor. Keep their events in that
    // root's graph and never create a separate tab for an internal agent.
    let pending = candidates.filter(candidate => candidate.metadata.parentId)
    while (pending.length) {
      const deferred: typeof pending = []
      let attached = false
      for (const candidate of pending) {
        if (!this.sessions.has(candidate.metadata.parentId!)) { deferred.push(candidate); continue }
        this.attachSession(candidate.filePath, candidate.stat, candidate.metadata)
        attached = true
      }
      if (!attached) break
      pending = deferred
    }

    // Recent Codex activity exists but none of it belongs to this workspace —
    // the #1 reason users see no Codex events. Say so once, loudly enough to
    // survive the standalone app's default log level.
    if (skippedByCwd > 0 && this.sessions.size === 0 && !this.cwdMismatchWarned) {
      this.cwdMismatchWarned = true
      log.warn(
        `Found ${skippedByCwd} Codex session(s), but none ran in ${this.workspacePaths.join(', ')}. ` +
        `Codex sessions are only shown for the current workspace — launch the visualizer from the ` +
        `directory where Codex runs (or open that folder in VS Code).`,
      )
    }
  }

  private sessionIdFor(filePath: string): string {
    const m = path.basename(filePath).match(SESSION_ID_FROM_FILENAME)
    return m ? m[1] : path.basename(filePath, '.jsonl')
  }

  private resolvePath(p: string): string | null {
    try { return fs.realpathSync(p) } catch { return p }
  }

  /** Windows filesystems are case-insensitive and tools disagree on drive-letter
   *  case (VS Code reports `c:\...`, Codex writes `C:\...`) — compare folded there. */
  private pathMatchesWorkspace(p: string): boolean {
    if (!this.workspacePaths.length) return true
    const fold = (s: string) => process.platform === 'win32' ? s.toLowerCase() : s
    const candidate = fold(p)
    return this.workspacePaths.some(workspace => {
      const normalized = fold(workspace).replace(/[\\/]+$/, '')
      return candidate === normalized || candidate.startsWith(normalized + path.sep)
    })
  }

  private createParser(sessionId: string): CodexRolloutParser {
    // Build the parser once per session so the delegate closures capture the
    // right session reference and re-emission is stateless on this side.
    return new CodexRolloutParser({
      emit: (event) => this.emitSessionEvent(sessionId, event),
      elapsed: () => {
        const s = this.sessions.get(sessionId)
        return s ? (Date.now() - s.sessionStartTime) / 1000 : 0
      },
      setLabel: (newLabel) => {
        const s = this.sessions.get(sessionId)
        if (!s || s.rootSessionId !== s.sessionId || !s.label.startsWith('Codex ')) return // only replace root auto-label
        s.label = newLabel
        this._onSessionLifecycle.fire({ type: 'updated', sessionId, label: newLabel })
      },
    })
  }

  private emitSessionEvent(sessionId: string, event: AgentEvent): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    const payload = { ...event.payload }
    let type = event.type
    if (session.rootSessionId !== sessionId) {
      for (const field of ['name', 'agent', 'parent', 'child']) {
        if (payload[field] === ORCHESTRATOR_NAME) payload[field] = session.agentName
      }
      if (event.type === 'agent_spawn' && event.payload.name === ORCHESTRATOR_NAME) {
        payload.isMain = false
        payload.parent = session.parentAgentName
        delete payload.task
      }
      delete payload.sessionEnd
      if (type === 'agent_idle' && payload.state === 'idle') type = 'agent_complete'
    }
    const affectedName = typeof payload.name === 'string' ? payload.name : typeof payload.agent === 'string' ? payload.agent : ''
    for (const child of this.sessions.values()) {
      if (child.rootSessionId === session.rootSessionId && child.sessionId !== child.rootSessionId && child.agentName === affectedName) {
        child.lastActivityTime = Math.max(child.lastActivityTime, session.sessionStartTime + event.time * 1000)
      }
    }
    if (type === 'agent_complete' || type === 'agent_thinking') {
      for (const child of this.sessions.values()) {
        if (child.rootSessionId === session.rootSessionId && child.sessionId !== child.rootSessionId && child.agentName === affectedName) {
          child.sessionCompleted = type === 'agent_complete'
        }
      }
    }
    const root = this.sessions.get(session.rootSessionId)
    const mapped = { ...event, historical: event.historical || !session.sessionDetected, type, time: event.time + (session.sessionStartTime - (root?.sessionStartTime ?? session.sessionStartTime)) / 1000,
      payload, sessionId: session.rootSessionId }
    if (type !== 'context_compaction') this.cacheEvent(session.rootSessionId, mapped)
    this._onEvent.fire(mapped)
  }

  private refreshRootActivity(session: WatchedCodexSession): void {
    if (session.rootSessionId === session.sessionId) return
    const root = this.sessions.get(session.rootSessionId)
    if (!root) return
    root.lastActivityTime = Math.max(root.lastActivityTime, session.lastActivityTime)
    if (root.sessionCompleted) {
      root.sessionCompleted = false
      this._onSessionLifecycle.fire({ type: 'started', sessionId: root.sessionId, label: root.label })
      this.emitSessionEvent(root.sessionId, { time: (root.lastActivityTime - root.sessionStartTime) / 1000,
        type: 'agent_spawn', payload: { name: ORCHESTRATOR_NAME, isMain: true, runtime: 'codex' } })
    }
    this.resetInactivityTimer(root.sessionId)
  }

  private attachSession(filePath: string, stat: fs.Stats, metadata: CodexSessionMetadata): void {
    const sessionId = this.sessionIdFor(filePath)
    const label = `Codex ${sessionId.slice(0, SESSION_ID_DISPLAY)}`
    const parser = this.createParser(sessionId)
    const parent = metadata.parentId ? this.sessions.get(metadata.parentId) : undefined

    const session: WatchedCodexSession = {
      sessionId,
      rootSessionId: parent?.rootSessionId ?? sessionId,
      agentName: parent ? metadata.agentName || sessionId : ORCHESTRATOR_NAME,
      parentAgentName: parent?.agentName,
      filePath,
      fileWatcher: null,
      pollTimer: null,
      inactivityTimer: null,
      fileSize: 0,
      fileTail: '',
      sessionStartTime: metadata.startTime ?? (stat.birthtimeMs || stat.mtimeMs),
      lastActivityTime: stat.mtimeMs,
      sessionDetected: false,
      sessionCompleted: false,
      label,
      rolloutState: createCodexRolloutState(),
      parser,
    }
    this.sessions.set(sessionId, session)
    if (parent) this.sessions.get(session.rootSessionId)?.rolloutState.agents.add(session.agentName)

    // Drain existing content first, so late-opening panels see full history.
    this.readNewLines(sessionId)

    session.sessionDetected = true
    if (!parent) {
      this._onSessionDetected.fire(sessionId)
      this._onSessionLifecycle.fire({ type: 'started', sessionId, label: session.label })
    }
    session.lastActivityTime = stat.mtimeMs
    if (Date.now() - stat.mtimeMs > INACTIVITY_TIMEOUT_MS) {
      if (parent) session.sessionCompleted = true
      else this.markCompleted(sessionId)
    }
    if (parent && !session.sessionCompleted) this.refreshRootActivity(session)

    try {
      session.fileWatcher = fs.watch(filePath, () => this.readNewLines(sessionId))
    } catch (err) { log.debug('File watch failed:', filePath, err) }

    // fs.watch on macOS sometimes silently stops after long idle — poll as backup.
    session.pollTimer = setInterval(() => this.readNewLines(sessionId), POLL_FALLBACK_MS)

    this.resetInactivityTimer(sessionId)
    log.info(`Attached to session ${sessionId.slice(0, SESSION_ID_DISPLAY)} at ${filePath}`)
  }

  private readNewLines(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const result = readNewFileLines(session.filePath, session.fileSize, session.fileTail)
    if (!result) return
    session.fileSize = result.newSize
    session.fileTail = result.tail
    session.lastActivityTime = Date.now()

    // Re-activate if the session had been marked complete on inactivity —
    // new content means the user resumed the Codex CLI.
    if (session.sessionCompleted) {
      session.sessionCompleted = false
      if (session.rootSessionId === sessionId) {
        this._onSessionLifecycle.fire({ type: 'started', sessionId, label: session.label })
        this.emitSessionEvent(sessionId, { time: (Date.now() - session.sessionStartTime) / 1000,
          type: 'agent_spawn', payload: { name: ORCHESTRATOR_NAME, isMain: true, runtime: 'codex' } })
      }
      log.info(`Session ${sessionId.slice(0, SESSION_ID_DISPLAY)} re-activated after idle`)
    }

    for (const line of result.lines) {
      try { session.parser.processLine(line, session.rolloutState) }
      catch (err) { log.debug('Parser threw on line:', err) }
    }

    if (session.sessionDetected && session.rootSessionId !== sessionId) {
      session.sessionCompleted = !session.rolloutState.turnActive
      if (!session.sessionCompleted) this.refreshRootActivity(session)
      else this.emitSessionEvent(sessionId, { time: (session.lastActivityTime - session.sessionStartTime) / 1000,
        type: 'agent_complete', payload: { name: ORCHESTRATOR_NAME } })
    }

    this.resetInactivityTimer(sessionId)
  }

  private resetInactivityTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.inactivityTimer) { clearTimeout(session.inactivityTimer) }
    if (session.sessionCompleted) { session.inactivityTimer = null; return }
    session.inactivityTimer = setTimeout(() => this.markCompleted(sessionId, true), INACTIVITY_TIMEOUT_MS)
  }

  private markCompleted(sessionId: string, fromTimer = false): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.sessionCompleted) return
    if (fromTimer && (session.rolloutState.turnActive || Array.from(this.sessions.values()).some(child => child.rootSessionId === sessionId && child.sessionId !== sessionId && !child.sessionCompleted))) {
      this.resetInactivityTimer(sessionId)
      return
    }
    session.sessionCompleted = true
    this.emitSessionEvent(sessionId, {
      time: (Date.now() - session.sessionStartTime) / 1000,
      type: 'agent_complete',
      payload: { name: ORCHESTRATOR_NAME, sessionEnd: true },
    })
    if (session.rootSessionId === sessionId) this._onSessionLifecycle.fire({ type: 'ended', sessionId, label: session.label })
  }

  dispose(): void {
    if (this.scanInterval) { clearInterval(this.scanInterval) }
    if (this.archiveScanInterval) clearInterval(this.archiveScanInterval)
    if (this.dirScanTimer) clearTimeout(this.dirScanTimer)
    this.pendingScanDirs.clear()
    for (const w of this.dirWatchers.values()) w.close()
    this.dirWatchers.clear()
    for (const s of this.sessions.values()) {
      s.fileWatcher?.close()
      if (s.pollTimer) clearInterval(s.pollTimer)
      if (s.inactivityTimer) clearTimeout(s.inactivityTimer)
    }
    this.sessions.clear()
    this.cwdCache.clear()
    this.replayCache.clear(); this.replayBytes.clear(); this.uncachedRoots.clear()
    this._onEvent.dispose()
    this._onSessionDetected.dispose()
    this._onSessionLifecycle.dispose()
  }
}
