import type { AgentEvent, SessionInfo } from '../extension/src/protocol'

export interface MobileAgent {
  name: string; parent?: string; status: string; tool?: string; model?: string; tokens?: number
  displayName?: string; isMain?: boolean; tokensMax?: number; toolCalls?: number
}
export interface MobileSession {
  id: string; label: string; status: string; lastActivity: number; startTime?: number; round?: number; runtime?: string
  agents: MobileAgent[]
  recent: { type: string; agent: string; tool?: string; at: number }[]
}
const short = (value: unknown, fallback = '') => typeof value === 'string' ? value.slice(0, 80) : fallback
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/** Explicit metadata projection: never keep prompt, tool arguments/results, paths, or message text. */
export class RemoteState {
  private sessions = new Map<string, MobileSession>()
  constructor(private workspace: string) {}
  private session(id: string) {
    let item = this.sessions.get(id)
    if (!item) {
      item = { id, label: `Session ${id.slice(0, 8)}`, status: 'active', lastActivity: Date.now(), agents: [], recent: [] }
      this.sessions.set(id, item)
      if (this.sessions.size > 12) this.sessions.delete(this.sessions.keys().next().value!)
    }
    return item
  }
  lifecycle(type: string, session: Partial<SessionInfo> & { id: string }) {
    const item = this.session(session.id)
    if (type === 'session-ended') item.status = 'completed'
    else if (session.status) item.status = session.status
    else if (type === 'session-started') item.status = 'active'
    if (session.label) item.label = short(session.label)
    if (numeric(session.startTime) !== undefined) item.startTime = session.startTime
    if (numeric(session.lastActivityTime)) item.lastActivity = session.lastActivityTime!
  }
  syncSessions(sessions: SessionInfo[]) {
    const ids = new Set(sessions.map(session => session.id))
    for (const id of this.sessions.keys()) if (!ids.has(id)) this.sessions.delete(id)
    for (const session of sessions) this.lifecycle('session-list', session)
  }
  event(event: AgentEvent) {
    if (!event.sessionId) return
    const item = this.session(event.sessionId)
    const p = event.payload || {}
    if (event.type === 'session_snapshot') {
      item.round = numeric(p.round)
      const rows = Array.isArray(p.agents) ? p.agents : []
      item.agents = rows.filter(row => typeof row?.id === 'string').slice(0, 32).map(row => ({
        name: row.id, displayName: short(row.name) || undefined, parent: typeof row.parentId === 'string' ? row.parentId : undefined,
        isMain: row.isMain === true, model: short(row.model) || undefined,
        status: ({ complete: 'completed', tool_calling: 'working', waiting_permission: 'needs-input' } as Record<string, string>)[row.state] || short(row.state, 'idle'),
        tool: short(row.currentTool) || undefined, tokens: numeric(row.tokensUsed), tokensMax: numeric(row.tokensMax), toolCalls: numeric(row.toolCalls),
      }))
      if (rows.some(row => row.runtime === 'codex')) item.runtime = 'codex'
      return
    }
    if (!['agent_spawn', 'subagent_dispatch', 'agent_thinking', 'tool_call_start', 'tool_call_end', 'agent_complete', 'subagent_return', 'agent_idle', 'permission_requested', 'input_requested', 'input_resolved', 'error', 'model_detected', 'context_update'].includes(event.type)) return
    const name = short(p.agent ?? p.name ?? p.child, 'Orchestrator')
    let agent = item.agents.find(a => a.name === name)
    if (!agent) {
      if (item.agents.length >= 32) return
      agent = { name, status: 'idle' }
      item.agents.push(agent)
    }
    const tool = short(p.tool).replace(/[^a-zA-Z0-9_.:/-]/g, '')
    switch (event.type) {
      case 'agent_spawn': agent.status = 'idle'; agent.parent = short(p.parent) || undefined; agent.isMain = p.isMain === true; agent.model = short(p.model) || agent.model; break
      case 'subagent_dispatch': agent.parent = short(p.parent) || undefined; agent.status = 'working'; break
      case 'agent_thinking': agent.status = 'thinking'; agent.tool = undefined; break
      case 'tool_call_start': agent.status = 'working'; agent.tool = tool || undefined; break
      case 'tool_call_end': agent.tool = undefined; agent.status = 'working'; break
      case 'agent_complete': case 'subagent_return': agent.status = 'completed'; agent.tool = undefined; break
      case 'agent_idle': agent.status = 'idle'; agent.tool = undefined; break
      case 'permission_requested': case 'input_requested': agent.status = 'needs-input'; break
      case 'input_resolved': agent.status = 'working'; break
      case 'error': agent.status = 'error'; break
      case 'model_detected': agent.model = short(p.model) || undefined; break
      case 'context_update': agent.tokens = numeric(p.tokens); agent.tokensMax = numeric(p.tokensMax) ?? agent.tokensMax; break
      default: return
    }
    if (typeof p.runtime === 'string') item.runtime = short(p.runtime)
    if (!event.historical) {
      item.lastActivity = Date.now()
      if (agent.status !== 'completed') item.status = 'active'
      if (!['context_update', 'model_detected'].includes(event.type)) {
        item.recent.unshift({ type: event.type, agent: name, ...(tool ? { tool } : {}), at: Date.now() })
        item.recent.length = Math.min(item.recent.length, 16)
      }
    }
  }
  snapshot() {
    return { workspace: this.workspace, sessions: [...this.sessions.values()].sort((a, b) => b.lastActivity - a.lastActivity) }
  }
}
