import { visibleRoundGraph } from '@/hooks/simulation/work-rounds'
import { emptyContextBreakdown, type Agent } from './agent-types'
import type { SimulationState } from '@/hooks/simulation/types'

/** Explorer uses a vertical reading order without changing the shared graph positions. */
export function compactGraphPresentation(state: SimulationState): SimulationState {
  const ordered: Agent[] = []
  const seen = new Set<string>()
  const children = new Map<string, Agent[]>()
  for (const agent of state.agents.values()) {
    if (!agent.parentId) continue
    const siblings = children.get(agent.parentId)
    if (siblings) siblings.push(agent)
    else children.set(agent.parentId, [agent])
  }
  const visit = (agent: Agent) => {
    if (seen.has(agent.id)) return
    seen.add(agent.id)
    ordered.push(agent)
    for (const child of children.get(agent.id) ?? []) visit(child)
  }
  for (const agent of state.agents.values()) if (agent.isMain || !state.agents.has(agent.parentId ?? '')) visit(agent)
  for (const agent of state.agents.values()) visit(agent)
  return { ...state, agents: new Map(ordered.map((agent, index) => [agent.id, { ...agent,
    x: ordered.length > 3 && index > 0 ? (index % 2 ? -125 : 125) : 0,
    y: ordered.length > 3 && index > 0 ? Math.ceil(index / 2) * 220 : index * 220 }])) }
}

export function graphFit(bounds: { minX: number; maxX: number; minY: number; maxY: number }, width: number, height: number, compact: boolean, count: number, topInset = 132) {
  const side = compact ? 16 : 52
  const top = compact ? 110 : topInset
  const bottom = compact ? 30 : 72
  const availableW = Math.max(1, width - side * 2)
  const availableH = Math.max(1, height - top - bottom)
  const scale = Math.min(availableW / Math.max(1, bounds.maxX - bounds.minX), availableH / Math.max(1, bounds.maxY - bounds.minY), compact ? 1.1 : count <= 3 ? 2.4 : 1.8)
  return { scale, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale,
    y: top + availableH / 2 - (bounds.minY + bounds.maxY) / 2 * scale }
}


/** Historical nodes are presentation-only: no simulation timers or force nodes. */
export function sessionGraphPresentation(state: SimulationState): SimulationState {
  const agents = new Map(state.agents)
  const inactive: Agent[] = []
  for (const entry of state.timelineEntries.values()) {
    const summary = entry.agentSummary
    if (!summary || summary.isMain || (agents.has(summary.id) && (agents.get(summary.id)!.state !== 'complete' || agents.get(summary.id)!.opacity > 0))) continue
    inactive.push({ ...summary, archived: true, state: summary.state === 'complete' ? 'complete' : 'idle',
      x: 0, y: 0, vx: 0, vy: 0, pinned: false, opacity: 0.42, scale: 1,
      contextBreakdown: emptyContextBreakdown(), messageBubbles: [] })
  }
  const live = [...agents.values()].filter(agent => agent.isMain || agent.state !== 'complete')
  const columns = Math.max(1, Math.ceil(Math.sqrt(inactive.length)))
  const startX = Math.max(0, ...live.map(agent => agent.x)) + 340
  const startY = Math.min(0, ...live.map(agent => agent.y))
  inactive.forEach((agent, index) => agents.set(agent.id, { ...agent,
    x: startX + index % columns * 320, y: startY + Math.floor(index / columns) * 240 }))
  const edges = state.edges.filter(edge => !agents.get(edge.to)?.archived && !agents.get(edge.from)?.archived)
  const existing = new Set(edges.map(edge => `${edge.from}:${edge.to}`))
  for (const agent of agents.values()) {
    if (!agent.parentId || !agents.has(agent.parentId) || existing.has(`${agent.parentId}:${agent.id}`)) continue
    edges.push({ id: `edge-${agent.parentId}-${agent.id}`, from: agent.parentId, to: agent.id, type: 'parent-child', opacity: 0.3 })
  }
  return { ...state, agents, edges }
}

type GraphCollections = Pick<SimulationState, 'agents' | 'toolCalls' | 'edges' | 'particles' | 'discoveries'>
/** Cache only graph collections, never transcript history or the simulation clock. */
export function createGraphProjector() {
  let previous: (GraphCollections & { round: number; roundStart: number; currentOnly: boolean; compact: boolean; showAll: boolean; timelineEntries: SimulationState['timelineEntries'] }) | undefined
  let graph: GraphCollections | undefined
  return (state: SimulationState, currentOnly: boolean, compact: boolean, showAll = false): GraphCollections => {
    if (graph && previous && previous.agents === state.agents && previous.toolCalls === state.toolCalls
      && previous.edges === state.edges && previous.particles === state.particles && previous.discoveries === state.discoveries
      && previous.round === state.round && previous.roundStart === state.roundStart && previous.currentOnly === currentOnly && previous.compact === compact && previous.showAll === showAll
      && (!showAll || previous.timelineEntries === state.timelineEntries)) return graph
    const scoped = showAll ? sessionGraphPresentation(state) : visibleRoundGraph(state, currentOnly)
    const projected = compact ? compactGraphPresentation(scoped) : scoped
    graph = { agents: projected.agents, toolCalls: compact ? new Map() : projected.toolCalls,
      edges: compact ? projected.edges.filter(edge => edge.type === 'parent-child') : projected.edges,
      particles: compact ? projected.particles.filter(particle => ['dispatch', 'return', 'message'].includes(particle.type)) : projected.particles,
      discoveries: compact ? [] : projected.discoveries }
    previous = { agents: state.agents, toolCalls: state.toolCalls, edges: state.edges, particles: state.particles, discoveries: state.discoveries,
      round: state.round, roundStart: state.roundStart, currentOnly, compact, showAll, timelineEntries: state.timelineEntries }
    return graph
  }
}
