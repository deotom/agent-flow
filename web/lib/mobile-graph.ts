import { formatAgentName } from './utils'

type AgentRow = { name: string; displayName?: string; parent?: string; isMain?: boolean; runtime?: string; status: string; model?: string; tokens?: number; tokensMax?: number; toolCalls?: number; tool?: string }
export interface RemoteGraphSnapshot {
  sentAt: number
  sessions: { id: string; label: string; status: string; lastActivity: number; startTime?: number; round?: number; runtime?: string; agents: AgentRow[] }[]
}
const graphState = (row: AgentRow) => ({ completed: 'complete', thinking: 'thinking', 'needs-input': 'waiting_permission', error: 'error', idle: 'idle', working: row.tool ? 'tool_calling' : 'thinking' } as Record<string, string>)[row.status] || 'idle'

/** Restore authoritative metadata with the desktop renderer, retaining stable routing IDs. */
export class MobileGraphAdapter {
  private previous = new Map<string, string>()
  private start = 0
  update(snapshot: RemoteGraphSnapshot): Record<string, unknown>[] {
    if (!this.start) this.start = snapshot.sentAt
    const messages: Record<string, unknown>[] = [{ type: 'config', config: { showMockData: false, autoPlay: true, animationMode: 'full' } },
      { type: 'connection-status', status: 'connected', source: 'Supabase · encrypted mobile' },
      { type: 'session-list', sessions: snapshot.sessions.map(s => ({ id: s.id, label: s.label, status: s.status, startTime: s.startTime ?? s.lastActivity, lastActivityTime: s.lastActivity })) }]
    const currentIds = new Set(snapshot.sessions.map(s => s.id))
    for (const id of this.previous.keys()) if (!currentIds.has(id)) this.previous.delete(id)
    for (const session of snapshot.sessions) {
      const signature = JSON.stringify([session.label, session.runtime, session.round, session.agents])
      if (this.previous.get(session.id) === signature) continue
      this.previous.set(session.id, signature)
      messages.push({ type: 'agent-event-batch', events: [{ type: 'session_snapshot', sessionId: session.id,
        time: Math.max(0, (snapshot.sentAt - this.start) / 1000), payload: { round: session.round ?? 0, preserveLayout: true,
          agents: session.agents.map(a => ({ id: a.name, name: a.displayName || (a.isMain ? session.label : formatAgentName(a.name)),
            parentId: a.parent, isMain: a.isMain ?? !a.parent, runtime: a.runtime ?? session.runtime, model: a.model, state: graphState(a),
            tokensUsed: a.tokens || 0, tokensMax: a.tokensMax, toolCalls: a.toolCalls, currentTool: a.tool,
            waitingForInput: a.status === 'needs-input', tools: a.tool ? [{ callId: `mobile-${a.name}-${a.tool}`, tool: a.tool, args: '' }] : [] })) } }] })
    }
    return messages
  }
}
