import { visibleRoundGraph } from '@/hooks/simulation/work-rounds'
import type { Agent } from './agent-types'
import type { SimulationState } from '@/hooks/simulation/types'

/** Explorer uses a vertical reading order without changing the shared graph positions. */
export function compactGraphPresentation(state: SimulationState): SimulationState {
  const ordered: Agent[] = []
  const seen = new Set<string>()
  const visit = (agent: Agent) => {
    if (seen.has(agent.id)) return
    seen.add(agent.id)
    ordered.push(agent)
    for (const child of state.agents.values()) if (child.parentId === agent.id) visit(child)
  }
  for (const agent of state.agents.values()) if (agent.isMain || !state.agents.has(agent.parentId ?? '')) visit(agent)
  for (const agent of state.agents.values()) visit(agent)
  return { ...state, agents: new Map(ordered.map((agent, index) => [agent.id, { ...agent,
    x: ordered.length > 3 && index > 0 ? (index % 2 ? -125 : 125) : 0,
    y: ordered.length > 3 && index > 0 ? Math.ceil(index / 2) * 220 : index * 220 }])) }
}

export function graphFit(bounds: { minX: number; maxX: number; minY: number; maxY: number }, width: number, height: number, compact: boolean, count: number, topInset = 132) {
  const side = compact ? 16 : 52
  const top = compact ? 82 : topInset
  const bottom = compact ? 30 : 72
  const availableW = Math.max(1, width - side * 2)
  const availableH = Math.max(1, height - top - bottom)
  const scale = Math.min(availableW / Math.max(1, bounds.maxX - bounds.minX), availableH / Math.max(1, bounds.maxY - bounds.minY), compact ? 1.1 : count <= 3 ? 2.4 : 1.8)
  return { scale, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale,
    y: top + availableH / 2 - (bounds.minY + bounds.maxY) / 2 * scale }
}


type GraphCollections = Pick<SimulationState, 'agents' | 'toolCalls' | 'edges' | 'particles' | 'discoveries'>
/** Cache only graph collections, never transcript history or the simulation clock. */
export function createGraphProjector() {
  let previous: (GraphCollections & { round: number; roundStart: number; currentOnly: boolean; compact: boolean }) | undefined
  let graph: GraphCollections | undefined
  return (state: SimulationState, currentOnly: boolean, compact: boolean): GraphCollections => {
    if (graph && previous && previous.agents === state.agents && previous.toolCalls === state.toolCalls
      && previous.edges === state.edges && previous.particles === state.particles && previous.discoveries === state.discoveries
      && previous.round === state.round && previous.roundStart === state.roundStart && previous.currentOnly === currentOnly && previous.compact === compact) return graph
    const scoped = visibleRoundGraph(state, currentOnly)
    const projected = compact ? compactGraphPresentation(scoped) : scoped
    graph = { agents: projected.agents, toolCalls: compact ? new Map() : projected.toolCalls,
      edges: compact ? projected.edges.filter(edge => edge.type === 'parent-child') : projected.edges,
      particles: compact ? projected.particles.filter(particle => ['dispatch', 'return', 'message'].includes(particle.type)) : projected.particles,
      discoveries: compact ? [] : projected.discoveries }
    previous = { agents: state.agents, toolCalls: state.toolCalls, edges: state.edges, particles: state.particles, discoveries: state.discoveries,
      round: state.round, roundStart: state.roundStart, currentOnly, compact }
    return graph
  }
}
