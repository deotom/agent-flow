import type { Agent, SimulationEvent } from '@/lib/agent-types'
import { emptyContextBreakdown } from '@/lib/agent-types'
import { createEmptyState, type SimulationState } from './types'
import { formatAgentName } from '@/lib/utils'
import { handleToolCallStart } from './handle-tool-events'
import { handleAgentSpawn } from './handle-agent-events'
import type { ProcessEventContext, MutableEventState } from './process-event'

export function restoreLatestSnapshot(event: SimulationEvent, prev: SimulationState, ctx: ProcessEventContext): SimulationState {
  const state = createEmptyState({ currentTime: event.time, round: Number(event.payload.round) || 0,
    roundStart: event.time, isPlaying: prev.isPlaying, speed: prev.speed, eventLog: prev.eventLog,
    receivedEventCount: Math.max(prev.receivedEventCount, event.sequence ?? 0) })
  const rows = Array.isArray(event.payload.agents) ? event.payload.agents : []
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') continue
    handleAgentSpawn({ name: row.id, parent: row.parentId, isMain: row.isMain, model: row.model, runtime: row.runtime }, event.time, state as MutableEventState, { ...ctx, skipForceSync: true })
    const agent = state.agents.get(row.id)!
    if (Array.isArray(row.tools)) for (const tool of row.tools) {
      if (typeof tool?.callId !== 'string' || typeof tool?.tool !== 'string') continue
      handleToolCallStart({ agent: row.id, callId: tool.callId, tool: tool.tool, args: tool.args }, event.time, state as MutableEventState, { ...ctx, skipForceSync: true })
    }
    const allowed = ['idle', 'thinking', 'tool_calling', 'complete', 'error', 'paused', 'waiting_permission']
    const snapshot: Agent = { ...agent, name: typeof row.name === 'string' ? row.name.slice(0, 80) : formatAgentName(row.id),
      state: allowed.includes(row.state) ? row.state : 'idle',
      tokensUsed: Number(row.tokensUsed) || 0, tokensMax: Number(row.tokensMax) > 0 ? Number(row.tokensMax) : agent.tokensMax,
      toolCalls: Number(row.toolCalls) || 0, timeAlive: Number(row.timeAlive) || 0, spawnTime: Number(row.spawnTime) || 0,
      round: state.round, currentTool: typeof row.currentTool === 'string' ? row.currentTool : undefined,
      contextRecharge: row.compacting === true ? { progress: 0 } : undefined,
      waitingForInput: row.waitingForInput === true, opacity: row.state === 'complete' && !row.isMain ? 0 : 1, scale: 1,
      contextBreakdown: emptyContextBreakdown(), messageBubbles: [] }
    const previous = event.payload.preserveLayout === true ? prev.agents.get(row.id) : undefined
    if (previous) Object.assign(snapshot, { x: previous.x, y: previous.y, vx: previous.vx, vy: previous.vy, pinned: previous.pinned })
    state.agents.set(row.id, snapshot)
    if (snapshot.parentId && snapshot.state !== 'complete') {
      const id = `snapshot-${snapshot.id}`
      state.delegations.set(id, { id, child: snapshot.id, parent: snapshot.parentId, name: snapshot.name, model: snapshot.model,
        task: '', round: state.round, startTime: snapshot.spawnTime, stage: 'working', summary: '', historical: true })
    }
    const entry = state.timelineEntries.get(row.id)!
    const { id, name, parentId, isMain, runtime, model, round, tokensUsed, tokensMax, toolCalls, timeAlive, spawnTime } = snapshot
    state.timelineEntries.set(row.id, { ...entry, agentName: name, blocks: [], agentSummary: {
      id, name, parentId, isMain, runtime, model, round, tokensUsed, tokensMax, toolCalls, timeAlive, spawnTime, state: snapshot.state } })
  }
  state.particles = []
  if (event.payload.preserveHistory === true) {
    state.conversations = prev.conversations
    state.delegations = new Map([...prev.delegations, ...state.delegations])
    state.timelineEntries = new Map([...prev.timelineEntries, ...[...state.timelineEntries].map(([id, entry]) =>
      [id, { ...entry, blocks: prev.timelineEntries.get(id)?.blocks ?? entry.blocks }] as const)])
  } else state.conversations = new Map()
  state.toolCalls = new Map([...state.toolCalls].map(([id, tool]) => [id, { ...tool, opacity: 1 }]))
  state.edges = state.edges.map(edge => ({ ...edge, opacity: 1 }))
  return state
}
