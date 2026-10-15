import type { SimulationEvent } from '@/lib/agent-types'
import type { SimulationState, Delegation } from './types'
import { formatAgentName } from '@/lib/utils'

export const FLOW_LABELS: Record<Delegation['stage'], string> = {
  dispatched: 'Task sent', working: 'Working', completed: 'Done · awaiting result',
  returned: 'Result sent', received: 'Parent received result', aborted: 'Stopped',
}
const terminal = new Set(['completed', 'received', 'returned', 'aborted'])

/** Track evidence separately from visual particles: animation arrival is not an acknowledgement. */
export function trackWorkEvent(event: SimulationEvent, prev: SimulationState, next: SimulationState): SimulationState {
  const p = event.payload
  if (event.type === 'subagent_dispatch' && p.notification === true) return next
  const actor = String(p.agent ?? p.name ?? p.child ?? '')
  const actorAgent = next.agents.get(actor) ?? prev.agents.get(actor)
  const startsRound = event.type === 'message' && p.role === 'user' && actorAgent?.isMain
  const round = startsRound ? prev.round + 1 : prev.round
  const roundStart = startsRound ? event.time : prev.roundStart
  let agents = next.agents
  let tools = next.toolCalls
  if (startsRound) {
    agents = new Map([...agents].map(([id, agent]) => [id, { ...agent, messageBubbles: id === actor ? agent.messageBubbles.slice(-1) : [] }]))
  }
  const activity = ['agent_spawn', 'agent_thinking', 'tool_call_start', 'message', 'subagent_dispatch'].includes(event.type)
  if (activity && actorAgent) {
    if (agents === next.agents) agents = new Map(agents)
    agents.set(actor, { ...agents.get(actor)!, round })
    // Keep a nested worker's ancestor chain connected in the current graph.
    let parent = actorAgent.parentId
    const seen = new Set<string>()
    while (parent && !seen.has(parent)) {
      seen.add(parent)
      const agent = agents.get(parent)
      if (!agent) break
      agents.set(parent, { ...agent, round })
      parent = agent.parentId
    }
  }
  if (event.type === 'tool_call_start') {
    tools = new Map(tools)
    for (const [id, tool] of tools) if (!prev.toolCalls.has(id)) tools.set(id, { ...tool, round })
  }
  let conversations = next.conversations
  for (const [id, messages] of conversations) {
    const old = prev.conversations.get(id)?.length ?? 0
    if (messages.length > old) {
      if (conversations === next.conversations) conversations = new Map(conversations)
      conversations.set(id, messages.map((message, index) => index >= old ? { ...message, round, sourceSequence: event.sequence,
        ...(event.sequence ? { id: `${event.sequence}:${id}:${message.type}` } : {}) } : message))
    }
  }
  let delegations = prev.delegations
  const child = String(p.child ?? (actorAgent && !actorAgent.isMain ? actor : ''))
  let record = [...delegations.values()].reverse().find(item => item.child === child)
  const parent = String(p.parent ?? actorAgent?.parentId ?? record?.parent ?? '')
  if (child && parent && activity && (!record || ((terminal.has(record.stage) || record.round !== round) && (event.type === 'agent_spawn' || event.type === 'subagent_dispatch' || event.type === 'agent_thinking')))) {
    record = { id: `${child}:${round}:${event.sequence ?? event.time}:${delegations.size}`, child, parent,
      name: formatAgentName(child), model: actorAgent?.model, task: String(p.task ?? actorAgent?.task ?? ''), round,
      startTime: event.time, stage: event.type === 'subagent_dispatch' ? 'dispatched' : 'working', summary: '', historical: !!event.historical }
  }
  if (record) {
    record = { ...record, model: actorAgent?.model ?? record.model }
    if (event.type === 'subagent_dispatch') { record.task = String(p.task ?? record.task); record.taskArchived = false }
    if (activity && !terminal.has(record.stage) && event.type !== 'subagent_dispatch') record.stage = 'working'
    if (event.type === 'message' && p.role === 'assistant') { record.summary = String(p.content ?? record.summary); record.archived = false }
    if (event.type === 'agent_complete' && !['received', 'returned'].includes(record.stage)) {
      record.stage = p.aborted ? 'aborted' : 'completed'
      record.endTime = event.time
      record.historical = !!event.historical
    }
    if (event.type === 'subagent_return') {
      record.stage = p.received === true ? 'received' : 'returned'
      record.summary = String(p.summary ?? record.summary)
      record.archived = false
      record.endTime = event.time
      record.historical = !!event.historical
    }
    delegations = new Map(delegations)
    delegations.set(record.id, record)
  }
  if (event.type === 'agent_complete') {
    for (const item of delegations.values()) {
      const agent = next.agents.get(item.child)
      if (item.child !== actor && agent?.state === 'complete' && prev.agents.get(item.child)?.state !== 'complete' && !terminal.has(item.stage)) {
        if (delegations === prev.delegations) delegations = new Map(delegations)
        delegations.set(item.id, { ...item, stage: 'aborted', endTime: event.time, historical: !!event.historical,
          summary: item.summary || 'Parent ended before a result was observed.' })
      }
    }
  }
  const edges = next.edges.map(edge => {
    if (edge.type !== 'parent-child') return edge
    const task = [...delegations.values()].reverse().find(item => item.child === edge.to && item.parent === edge.from)
    return task ? { ...edge, flowLabel: FLOW_LABELS[task.stage] } : edge
  })
  return { ...next, agents, toolCalls: tools, conversations, edges, round, roundStart, delegations }
}

export function visibleRoundGraph(state: SimulationState, currentOnly: boolean) {
  if (!currentOnly) return state
  const agents = new Map([...state.agents].filter(([, agent]) => agent.isMain || (agent.round ?? 0) === state.round))
  const toolCalls = new Map([...state.toolCalls].filter(([, tool]) => agents.has(tool.agentId) && (tool.round ?? 0) === state.round))
  const edges = state.edges.filter(edge => agents.has(edge.from) && (agents.has(edge.to) || toolCalls.has(edge.to)))
  const ids = new Set(edges.map(edge => edge.id))
  return { ...state, agents, toolCalls, edges, particles: state.particles.filter(particle => ids.has(particle.edgeId)),
    discoveries: state.discoveries.filter(item => agents.has(item.agentId) && item.timestamp >= state.roundStart) }
}
