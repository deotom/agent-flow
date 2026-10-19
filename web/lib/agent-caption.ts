import type { Agent } from './agent-types'
import { NODE } from './agent-types'

/** Shared geometry for drawing the instrument plaque and its native tooltip. */
export function captionLayout(agent: Pick<Agent, 'x' | 'y' | 'isMain' | 'archived' | 'tokensMax'>, radius: number, compact: boolean, viewScale: number) {
  const unit = Math.min(compact ? 2 : 1.25, 1 / Math.max(0.1, viewScale))
  const instrumentPadding = agent.archived ? 0 : agent.isMain && !compact ? 34 : 14
  const width = (compact ? 180 : 220) * Math.min(1, unit)
  const line = (compact ? 16 : 19) * unit
  const y = agent.y + radius + instrumentPadding + 13 * unit
  const panelWidth = width + 16 * unit
  const top = y - 8 * unit
  const rows = !agent.archived && agent.tokensMax > 0 ? 4 : 3
  const height = (rows - 1) * line + 28 * unit
  return { unit, width, line, y, panelWidth, top, height, left: agent.x - panelWidth / 2 }
}

export function findCaptionAgentAt(x: number, y: number, agents: Map<string, Agent>, compact: boolean, viewScale: number): Agent | undefined {
  for (const agent of agents.values()) {
    if (agent.archived || agent.opacity <= 0.5) continue
    const radius = (agent.isMain ? NODE.radiusMain : NODE.radiusSub) * agent.scale
    const box = captionLayout(agent, radius, compact, viewScale)
    if (x >= box.left && x <= box.left + box.panelWidth && y >= box.top && y <= box.top + box.height) return agent
  }
}
