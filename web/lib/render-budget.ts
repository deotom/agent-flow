import type { Agent, ToolCallNode } from './agent-types'
import type { AnimationMode } from './viewer-preferences'

export function renderBudget(mode: AnimationMode, count: number, active: boolean, compact: boolean) {
  const dense = count >= 12, crowded = count >= 30
  return {
    fps: mode === 'off' || !active ? 8 : crowded ? 12 : dense ? 18 : mode === 'low' ? 24 : 60,
    stars: crowded ? 0 : compact ? 6 : dense ? 8 : mode === 'full' ? 48 : 16,
    particles: crowded ? 16 : dense ? 32 : mode === 'full' ? 128 : 48,
    effects: crowded ? 3 : dense ? 4 : mode === 'full' ? 20 : 8,
    detailed: mode === 'full' && !dense && !compact,
    bloom: mode === 'full' && count <= 6 && active && !compact,
    pixelRatio: compact || dense ? 1 : mode === 'full' ? 2 : 1.25,
  }
}
export function hasActiveAgents(agents: Iterable<{ state: string }>): boolean {
  for (const agent of agents) if (['thinking', 'tool_calling', 'waiting_permission'].includes(agent.state)) return true
  return false
}

export function limitVisualParticles<T extends { type: string }>(particles: T[], limit: number): T[] {
  if (particles.length <= limit) return particles
  const important = particles.filter(particle => ['return', 'dispatch', 'message'].includes(particle.type)).slice(-limit)
  const remaining = limit - important.length
  return important.concat(remaining > 0 ? particles.filter(particle => !['return', 'dispatch', 'message'].includes(particle.type)).slice(-remaining) : [])
}


/** Error/result travel and fading cards remain animated even after the agent stops working. */
export function hasVisualMotion(agents: Iterable<Pick<Agent, 'state' | 'isMain' | 'opacity'>>, tools: Iterable<Pick<ToolCallNode, 'opacity' | 'historical'>>, particles: number, discoveries: number, effects = 0): boolean {
  if (particles || discoveries || effects) return true
  for (const agent of agents) if (['thinking', 'tool_calling', 'waiting_permission'].includes(agent.state) || (!agent.isMain && agent.state === 'complete' && agent.opacity > 0)) return true
  for (const tool of tools) if (!tool.historical && tool.opacity > 0) return true
  return false
}
