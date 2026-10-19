import type { SimulationState } from './types'
import {
  TOOL_MIN_DISPLAY_S, TOOL_MAX_RUNNING_S,
  DISCOVERY_HOLD_S, DISCOVERY_LERP_SPEED,
  BUBBLE_VISIBLE_S, MOCK_END_BUFFER_S,
  ANIM_SPEED,
} from '@/lib/canvas-constants'

export interface AnimateOptions {
  animationMode?: 'full' | 'low' | 'off'
  animationSpeed?: number
  useMockData: boolean
  mockScenarioLength: number
  mockScenarioEndTime: number
}

function animateAgents(agents: SimulationState['agents'], deltaTime: number, currentTime: number, returningAgents: Set<string>): SimulationState['agents'] {
  let newAgents = agents
  for (const [id, agent] of agents) {
    let updated = false
    let opacity = agent.opacity
    let scale = agent.scale
    let timeAlive = agent.timeAlive
    let messageBubbles = agent.messageBubbles

    if (agent.state !== 'complete' && opacity < 1) { opacity = Math.min(1, opacity + deltaTime * ANIM_SPEED.agentFadeIn); updated = true }
    if (agent.state !== 'complete' && scale < 1) { scale = Math.min(1, scale + deltaTime * ANIM_SPEED.agentScaleIn); updated = true }
    if (agent.state === 'complete' && !agent.isMain && !returningAgents.has(id)) {
      if (opacity > 0) { opacity = Math.max(0, opacity - deltaTime * ANIM_SPEED.agentFadeOut); updated = true }
      if (scale > 0.8) { scale = Math.max(0.8, scale - deltaTime * ANIM_SPEED.agentScaleOut); updated = true }
    }
    if (agent.state !== 'complete') {
      const elapsed = Math.max(timeAlive, Math.floor(currentTime - agent.spawnTime))
      if (elapsed !== timeAlive) { timeAlive = elapsed; updated = true }
    }
    // Prune expired message bubbles
    if (messageBubbles.length > 0) {
      const pruned = messageBubbles.filter(b => currentTime - b.time <= BUBBLE_VISIBLE_S)
      if (pruned.length !== messageBubbles.length) { messageBubbles = pruned; updated = true }
    }
    if (updated) {
      if (newAgents === agents) newAgents = new Map(agents)
      newAgents.set(id, { ...agent, opacity, scale, timeAlive, messageBubbles })
    }
  }
  return newAgents
}

function animateEdges(edges: SimulationState['edges'], deltaTime: number): SimulationState['edges'] {
  if (edges.some(e => e.opacity < 1)) {
    return edges.map(e =>
      e.opacity < 1 ? { ...e, opacity: Math.min(1, e.opacity + deltaTime * ANIM_SPEED.edgeFadeIn) } : e
    )
  }
  return edges
}

function animateToolCalls(toolCalls: SimulationState['toolCalls'], deltaTime: number, newTime: number): SimulationState['toolCalls'] {
  let newToolCalls = toolCalls
  for (const [id, tc] of toolCalls) {
    if (tc.historical) continue
    let newOpacity = tc.opacity
    if (tc.state === 'running') {
      const runningSince = newTime - tc.startTime
      if (runningSince > TOOL_MAX_RUNNING_S) {
        newOpacity = Math.max(0, tc.opacity - deltaTime * ANIM_SPEED.toolFadeOut)
      } else {
        newOpacity = Math.min(1, tc.opacity + deltaTime * ANIM_SPEED.toolFadeIn)
      }
    } else {
      const timeSinceComplete = newTime - (tc.completeTime ?? 0)
      if (timeSinceComplete < TOOL_MIN_DISPLAY_S) {
        newOpacity = Math.min(1, tc.opacity + deltaTime * ANIM_SPEED.toolFadeIn)
      } else {
        newOpacity = Math.max(0, tc.opacity - deltaTime * ANIM_SPEED.toolFadeOut)
      }
    }
    if (newOpacity !== tc.opacity) {
      if (newToolCalls === toolCalls) newToolCalls = new Map(toolCalls)
      newToolCalls.set(id, { ...tc, opacity: newOpacity })
    }
  }
  return newToolCalls
}

function cleanupFaded(
  agents: SimulationState['agents'],
  toolCalls: SimulationState['toolCalls'],
  edges: SimulationState['edges'],
  originalAgents: SimulationState['agents'],
  originalToolCalls: SimulationState['toolCalls'],
): { agents: SimulationState['agents']; toolCalls: SimulationState['toolCalls']; edges: SimulationState['edges'] } {
  let newAgents = agents
  let newToolCalls = toolCalls
  let filteredEdges = edges

  // Cleanup faded agents (completed sub-agents) and their edges
  const fadedAgentIds: string[] = []
  for (const [id, agent] of newAgents) {
    if (!agent.isMain && agent.state === 'complete' && agent.opacity <= 0) {
      fadedAgentIds.push(id)
    }
  }
  if (fadedAgentIds.length > 0) {
    if (newAgents === originalAgents) newAgents = new Map(originalAgents)
    const fadedSet = new Set(fadedAgentIds)
    for (const id of fadedAgentIds) newAgents.delete(id)
    filteredEdges = filteredEdges.filter(e => !fadedSet.has(e.from) && !fadedSet.has(e.to))
  }

  // Cleanup faded tool calls (opacity <= 0) and their edges
  const fadedToolIds: string[] = []
  for (const [id, tc] of newToolCalls) {
    if (tc.opacity <= 0 && tc.state !== 'running') fadedToolIds.push(id)
  }
  if (fadedToolIds.length > 0) {
    if (newToolCalls === originalToolCalls) newToolCalls = new Map(originalToolCalls)
    const fadedSet = new Set(fadedToolIds)
    for (const id of fadedToolIds) newToolCalls.delete(id)
    filteredEdges = filteredEdges.filter(e => !(e.type === 'tool' && fadedSet.has(e.to)))
  }

  // Remove orphaned edges whose endpoints no longer exist
  const beforeOrphans = filteredEdges
  filteredEdges = filteredEdges.filter(e => {
    const fromExists = newAgents.has(e.from)
    if (!fromExists) return false
    const toExists = newAgents.has(e.to) || newToolCalls.has(e.to)
    return toExists
  })
  if (filteredEdges.length === beforeOrphans.length) filteredEdges = beforeOrphans
  return { agents: newAgents, toolCalls: newToolCalls, edges: filteredEdges }
}

function animateDiscoveries(discoveries: SimulationState['discoveries'], deltaTime: number, newTime: number): SimulationState['discoveries'] {
  if (!discoveries.length) return discoveries
  return discoveries
    .map(d => {
      const age = newTime - d.timestamp
      const lerpT = Math.min(1, deltaTime * DISCOVERY_LERP_SPEED)
      const x = d.x + (d.targetX - d.x) * lerpT
      const y = d.y + (d.targetY - d.y) * lerpT
      if (age < DISCOVERY_HOLD_S) {
        return { ...d, x, y, opacity: Math.min(0.9, d.opacity + deltaTime * ANIM_SPEED.discoveryFadeIn) }
      } else {
        return { ...d, x, y, opacity: Math.max(0, d.opacity - deltaTime * ANIM_SPEED.discoveryFadeOut) }
      }
    })
    .filter(d => d.opacity > 0)
}

function animateParticles(particles: SimulationState['particles'], deltaTime: number, speed: number): SimulationState['particles'] {
  if (!particles.length) return particles
  const particleSpeed = ANIM_SPEED.particleSpeed * speed
  return particles.map(p => {
    if (p.type === 'return' || p.type === 'tool_return')
      return { ...p, progress: Math.max(0, p.progress - deltaTime * particleSpeed) }
    return { ...p, progress: Math.min(1, p.progress + deltaTime * particleSpeed) }
  }).filter(p => {
    if ((p.type === 'return' || p.type === 'tool_return') && p.progress <= 0) return false
    if ((p.type === 'dispatch' || p.type === 'tool_call' || p.type === 'message') && p.progress >= 1) return false
    return true
  })
}

export function computeNextFrame(prev: SimulationState, deltaTime: number, newTime: number, maxT: number, currentState: SimulationState, options: AnimateOptions): SimulationState {
      const motionDelta = options.animationMode === 'off' ? 10 : deltaTime
      const returningEdges = new Set(currentState.particles.filter(particle => options.animationMode !== 'off' && particle.type === 'return' && particle.progress > 0).map(particle => particle.edgeId))
      const returningAgents = new Set<string>()
      for (const edge of currentState.edges) {
        if (returningEdges.has(edge.id)) { returningAgents.add(edge.from); returningAgents.add(edge.to) }
      }
      let newAgentsRaw = animateAgents(currentState.agents, motionDelta, currentState.currentTime, returningAgents)
      // A return pulse starts only when the existing particle reaches its parent.
      const arrived = new Set(currentState.particles.filter(particle => particle.type === 'return' && particle.progress > 0 && particle.progress <= deltaTime * ANIM_SPEED.particleSpeed * currentState.speed * (options.animationSpeed ?? 1))
        .map(particle => currentState.edges.find(edge => edge.id === particle.edgeId)?.from))
      for (const [id, agent] of newAgentsRaw) {
        const active = agent.state === 'thinking' || agent.state === 'tool_calling' || agent.state === 'waiting_permission'
        const activityFade = active ? 1 : Math.max(0, (agent.activityFade ?? 0) - deltaTime * 1.5)
        const resultPulse = options.animationMode === 'off' ? 0 : arrived.has(id) ? 1 : Math.max(0, (agent.resultPulse ?? 0) - deltaTime * 1.8)
        const contextRecharge = agent.contextRecharge && options.animationMode !== 'off'
          ? { progress: (agent.contextRecharge.progress + deltaTime / 1.6) % 1 } : agent.contextRecharge
        if (activityFade !== agent.activityFade || resultPulse !== agent.resultPulse || contextRecharge !== agent.contextRecharge) {
          if (newAgentsRaw === currentState.agents) newAgentsRaw = new Map(newAgentsRaw)
          newAgentsRaw.set(id, { ...agent, activityFade, resultPulse, contextRecharge })
        }
      }
      const newEdgesRaw = animateEdges(currentState.edges, deltaTime)
      const newToolCallsRaw = animateToolCalls(currentState.toolCalls, motionDelta, newTime)

      const { agents: newAgents, toolCalls: newToolCalls, edges: filteredEdges } =
        cleanupFaded(newAgentsRaw, newToolCallsRaw, newEdgesRaw, currentState.agents, currentState.toolCalls)

      const newDiscoveries = animateDiscoveries(currentState.discoveries, deltaTime, newTime)
      const newParticles = options.animationMode === 'off' ? [] : animateParticles(currentState.particles, deltaTime, currentState.speed * (options.animationSpeed ?? 1))

      // Stop playback when mock scenario ends (user can restart manually)
      if (options.useMockData && currentState.eventIndex >= options.mockScenarioLength && newTime > options.mockScenarioEndTime + MOCK_END_BUFFER_S) {
        return {
          ...currentState, currentTime: newTime, eventIndex: currentState.eventIndex,
          agents: newAgents, toolCalls: newToolCalls,
          particles: newParticles, edges: filteredEdges,
          discoveries: newDiscoveries,
          maxTimeReached: maxT,
          isPlaying: false,
        }
      }

      return {
        ...currentState, currentTime: newTime, eventIndex: currentState.eventIndex,
        agents: newAgents, toolCalls: newToolCalls,
        particles: newParticles, edges: filteredEdges,
        discoveries: newDiscoveries,
        maxTimeReached: maxT,
      }
}
