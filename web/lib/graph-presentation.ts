import { createCaptionPlacement } from './caption-placement'
import { createToolCaptionLayout } from './tool-caption-layout'
import { visibleRoundGraph } from '@/hooks/simulation/work-rounds'
import { emptyContextBreakdown, type Agent } from './agent-types'
import type { SimulationState } from '@/hooks/simulation/types'
import type { MissionNode, MissionView } from './mission-model'

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
    y: ordered.length > 3 && index > 0 ? Math.ceil(index / 2) * 300 : index * 300 }])) }
}

export function graphFit(bounds: { minX: number; maxX: number; minY: number; maxY: number }, width: number, height: number, compact: boolean, count: number, topInset = 132) {
  const side = compact ? 16 : 52
  const top = compact ? 110 : topInset
  const bottom = compact ? 30 : 72
  const availableW = Math.max(1, width - side * 2)
  const availableH = Math.max(1, height - top - bottom)
  const scale = Math.min(availableW / Math.max(1, bounds.maxX - bounds.minX), availableH / Math.max(1, bounds.maxY - bounds.minY), compact ? 1.1 : count <= 3 ? 1.25 : 1.15)
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

/** Drops agents another view has already scoped out, with their tools, links and particles. */
export function withoutAgents(state: SimulationState, hidden?: ReadonlySet<string>): SimulationState {
  if (!hidden?.size) return state
  const agents = new Map([...state.agents].filter(([id]) => !hidden.has(id)))
  const edges = state.edges.filter(edge => agents.has(edge.from) && agents.has(edge.to))
  const edgeIds = new Set(edges.map(edge => edge.id))
  return { ...state, agents, edges,
    toolCalls: new Map([...state.toolCalls].filter(([, tool]) => agents.has(tool.agentId))),
    particles: state.particles.filter(particle => edgeIds.has(particle.edgeId)),
    discoveries: state.discoveries.filter(discovery => agents.has(discovery.agentId)) }
}

type GraphCollections = Pick<SimulationState, 'agents' | 'toolCalls' | 'edges' | 'particles' | 'discoveries'>
/** Cache only graph collections, never transcript history or the simulation clock. */
/**
 * T3 Mission Map: positions come from the radial tree, links from delivery stages.
 * Tool cards, particles and discoveries are dropped; the links carry the work path.
 */
export function missionPresentation(state: SimulationState, mission: MissionView): SimulationState {
  const agents = new Map<string, Agent>()
  for (const [id, node] of mission.nodes) {
    // The simulation drops finished agents; the team snapshot still knows them, so keep the chain drawable.
    const agent = state.agents.get(id) ?? missionStandIn(node)
    agents.set(id, { ...agent, x: node.x, y: node.y, vx: 0, vy: 0, pinned: true, opacity: Math.max(agent.opacity, 0.55), scale: Math.max(agent.scale, 1) })
  }
  const edges = mission.links.filter(link => agents.has(link.from) && agents.has(link.to))
    .map(link => ({ id: `mission:${link.from}:${link.to}`, from: link.from, to: link.to, type: 'parent-child' as const, opacity: 1 }))
  return { ...state, agents, edges, toolCalls: new Map(), particles: [], discoveries: [] }
}

const STAND_IN_STATE: Record<MissionNode['status'], Agent['state']> = {
  running: 'tool_calling', thinking: 'thinking', waiting_approval: 'waiting_permission', waiting_input: 'waiting_permission',
  done: 'complete', failed: 'error', cancelled: 'complete', idle: 'idle',
}

function missionStandIn(node: MissionNode): Agent {
  return {
    id: node.id, name: node.name, state: STAND_IN_STATE[node.status], parentId: node.parentId, isMain: node.role === 'lead',
    tokensUsed: node.context?.used ?? 0, tokensMax: node.context?.max ?? 0, contextBreakdown: emptyContextBreakdown(),
    toolCalls: 0, timeAlive: 0, x: node.x, y: node.y, vx: 0, vy: 0, pinned: true,
    ...(node.runtime ? { runtime: node.runtime } : {}), ...(node.model ? { model: node.model } : {}),
    spawnTime: 0, opacity: 1, scale: 1, messageBubbles: [],
  }
}

export function createGraphProjector() {
  const layoutTools = createToolCaptionLayout()
  const layoutCaptions = createCaptionPlacement()
  let previous: (GraphCollections & { round: number; roundStart: number; currentOnly: boolean; compact: boolean; showAll: boolean; hidden?: ReadonlySet<string>; mission?: MissionView; timelineEntries: SimulationState['timelineEntries'] }) | undefined
  let graph: GraphCollections | undefined
  return (state: SimulationState, currentOnly: boolean, compact: boolean, showAll = false, hidden?: ReadonlySet<string>, mission?: MissionView): GraphCollections => {
    if (graph && previous && previous.agents === state.agents && previous.toolCalls === state.toolCalls
      && previous.edges === state.edges && previous.particles === state.particles && previous.discoveries === state.discoveries
      && previous.round === state.round && previous.roundStart === state.roundStart && previous.currentOnly === currentOnly && previous.compact === compact && previous.showAll === showAll && previous.hidden === hidden && previous.mission === mission
      && (!showAll || previous.timelineEntries === state.timelineEntries)) return graph
    const scoped = mission && !compact ? missionPresentation(state, mission)
      : withoutAgents(showAll ? sessionGraphPresentation(state) : visibleRoundGraph(state, currentOnly), hidden)
    const projected = compact ? compactGraphPresentation(scoped) : scoped
    const agents = layoutCaptions(projected.agents, projected.toolCalls, projected.edges, compact)
    graph = { agents, toolCalls: compact ? new Map() : layoutTools(agents, projected.toolCalls),
      edges: compact ? projected.edges.filter(edge => edge.type === 'parent-child') : projected.edges,
      particles: compact ? projected.particles.filter(particle => ['dispatch', 'return', 'message'].includes(particle.type)) : projected.particles,
      discoveries: compact ? [] : projected.discoveries }
    previous = { agents: state.agents, toolCalls: state.toolCalls, edges: state.edges, particles: state.particles, discoveries: state.discoveries,
      round: state.round, roundStart: state.roundStart, currentOnly, compact, showAll, hidden, mission, timelineEntries: state.timelineEntries }
    return graph
  }
}
