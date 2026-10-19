import {
  Agent,
  ToolCallNode,
  Edge,
  SimulationEvent,
  type TimelineEntry,
  type TimelineBlock,
} from '@/lib/agent-types'
import type { SimulationState, ConversationMessage } from './types'
import { handleAgentSpawn, handleAgentComplete, handleAgentIdle, handleAgentThinking, handlePermissionRequested, handleModelDetected, handleInputRequested, handleInputResolved } from './handle-agent-events'
import { handleToolCallStart, handleToolCallEnd } from './handle-tool-events'
import { handleMessage, handleContextUpdate } from './handle-message-events'
import { handleSubagentDispatch, handleSubagentReturn } from './handle-subagent-events'
import { restoreLatestSnapshot } from './latest-snapshot'
import { trackWorkEvent } from './work-rounds'

export interface ProcessEventContext {
  syncForceSimulation: (agents: Map<string, Agent>, edges: Edge[]) => void
  findToolSlot: (agent: Agent, agents: Map<string, Agent>, toolCalls: Map<string, ToolCallNode>, currentTime: number) => { x: number; y: number }
  getContextWindowSize: (modelId?: string) => number
  blockIdCounter: { current: number }
  skipForceSync: boolean
}

/** Mutable collections that handlers mutate in place during a single processEvent call. */
export interface MutableEventState {
  agents: Map<string, Agent>
  toolCalls: Map<string, ToolCallNode>
  particles: SimulationState['particles']
  edges: Edge[]
  discoveries: SimulationState['discoveries']
  fileAttention: SimulationState['fileAttention']
  timelineEntries: SimulationState['timelineEntries']
  conversations: Map<string, ConversationMessage[]>
}

/** Close the last open block on a timeline entry and push a new one. */
export function pushTimelineBlock(
  entry: TimelineEntry,
  currentTime: number,
  block: Pick<TimelineBlock, 'type' | 'label' | 'color'> & { endTime?: number },
  ctx: ProcessEventContext,
): void {
  const lastBlock = entry.blocks[entry.blocks.length - 1]
  if (lastBlock && !lastBlock.endTime) lastBlock.endTime = currentTime
  entry.blocks.push({
    id: `block-${ctx.blockIdCounter.current++}`,
    type: block.type,
    startTime: currentTime,
    endTime: block.endTime,
    label: block.label,
    color: block.color,
  })
}

/** Shallow-compare two Maps by reference equality of values */
function mapsEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

export function processEvent(event: SimulationEvent, prev: SimulationState, ctx: ProcessEventContext): SimulationState {
      if (event.type === 'session_snapshot') return restoreLatestSnapshot(event, prev, ctx)
      const state: MutableEventState = {
        agents: new Map(prev.agents),
        toolCalls: new Map(prev.toolCalls),
        particles: [...prev.particles],
        edges: [...prev.edges],
        discoveries: [...prev.discoveries],
        fileAttention: new Map(prev.fileAttention),
        timelineEntries: new Map(prev.timelineEntries),
        conversations: new Map(prev.conversations),
      }

      switch (event.type) {
        case 'agent_spawn':       handleAgentSpawn(event.payload, prev.currentTime, state, ctx); break
        case 'agent_complete':    handleAgentComplete(event.payload, prev.currentTime, state, ctx); break
        case 'agent_idle':        handleAgentIdle(event.payload, state, prev.currentTime, ctx); break
        case 'agent_thinking':    handleAgentThinking(event.payload, prev.currentTime, state, ctx); break
        case 'model_detected':    handleModelDetected(event.payload, state, ctx); break
        case 'tool_call_start':   handleToolCallStart(event.payload, prev.currentTime, state, ctx); break
        case 'tool_call_end':     handleToolCallEnd(event.payload, prev.currentTime, state, ctx); break
        case 'message':           handleMessage(event.payload, prev.currentTime, state); break
        case 'context_compaction': {
          const id = String(event.payload.agent)
          const agent = state.agents.get(id)
          if (agent) state.agents.set(id, { ...agent, contextRecharge: event.payload.active === true
            ? agent.contextRecharge ?? { progress: 0 } : undefined })
          break
        }
        case 'context_update':    handleContextUpdate(event.payload, state); break
        case 'subagent_dispatch': handleSubagentDispatch(event.payload, prev.currentTime, state); break
        case 'subagent_return':   handleSubagentReturn(event.payload, prev.currentTime, state); break
        case 'input_requested': handleInputRequested(event.payload, state); break
        case 'input_resolved': handleInputResolved(event.payload, state); break
        case 'permission_requested': handlePermissionRequested(event.payload, prev.currentTime, state, ctx); break
      }

      if (event.historical) {
        state.particles = []
        state.discoveries = []
        for (const [id, tool] of state.toolCalls) {
          if (tool !== prev.toolCalls.get(id)) state.toolCalls.set(id, { ...tool, historical: true, opacity: 0 })
        }
        for (const [id, agent] of state.agents) {
          if (agent !== prev.agents.get(id)) state.agents.set(id, {
            ...agent, messageBubbles: [],
            opacity: agent.state === 'complete' && !agent.isMain ? 0 : 1, scale: 1,
          })
        }
      }

      // Stabilize references for unchanged collections to prevent
      // downstream React useMemo/re-render cascades (O(n log n) sorts etc.)
      const next = trackWorkEvent(event, prev, {
        ...prev,
        receivedEventCount: Math.max(prev.receivedEventCount, event.sequence ?? 0),
        agents: state.agents, toolCalls: state.toolCalls,
        particles: state.particles, edges: state.edges,
        discoveries: state.discoveries,
        fileAttention: mapsEqual(prev.fileAttention, state.fileAttention) ? prev.fileAttention : state.fileAttention,
        timelineEntries: mapsEqual(prev.timelineEntries, state.timelineEntries) ? prev.timelineEntries : state.timelineEntries,
        conversations: mapsEqual(prev.conversations, state.conversations) ? prev.conversations : state.conversations,
      })
      // Keep one small metadata row per agent after its simulation node fades.
      // No message bodies, tool results, effects or force nodes are retained here.
      let timelineCopied = next.timelineEntries !== prev.timelineEntries
      for (const [id, agent] of next.agents) {
        if (agent === prev.agents.get(id) && next.timelineEntries.get(id)?.agentSummary) continue
        const entry = next.timelineEntries.get(id)
        if (!entry) continue
        if (!timelineCopied) { next.timelineEntries = new Map(next.timelineEntries); timelineCopied = true }
        const { name, parentId, state: agentState, isMain, runtime, model, round, tokensUsed, tokensMax, toolCalls, spawnTime } = agent
        next.timelineEntries.set(id, { ...entry, agentSummary: { id, name, parentId, state: agentState, isMain, runtime, model, round,
          tokensUsed, tokensMax, toolCalls, spawnTime, timeAlive: Math.max(agent.timeAlive, event.time - spawnTime) } })
      }
      return next
}
