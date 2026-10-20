import type { Agent } from './agent-types'
import { NODE } from './agent-types'

/** Shared geometry for drawing the instrument plaque and its HUD tooltip. */
export function captionLayout(agent: Pick<Agent, 'x' | 'y' | 'isMain' | 'archived' | 'tokensMax' | 'captionDock'>, radius: number, compact: boolean, viewScale: number) {
  const unit = Math.min(compact ? 2 : 1.25, 1 / Math.max(0.1, viewScale))
  const instrumentPadding = agent.archived ? 0 : agent.isMain && !compact ? 34 : 14
  const width = (agent.isMain ? compact ? 180 : 220 : compact ? 140 : 148) * Math.min(1, unit)
  const footerUnit = Math.min(unit, width / 148)
  const line = (agent.isMain ? compact ? 16 : 19 : 15.5) * unit
  const fonts = agent.isMain
    ? { name: compact ? 11.5 : 12.5, model: 9.5, status: compact ? 12 : 13, context: 9.5 }
    : { name: compact ? 11 : 11.5, model: 9, status: 11.5, context: 9 }
  let y = agent.y + radius + instrumentPadding + 13 * unit
  const panelWidth = width + (agent.isMain ? 16 : 12) * unit
  let top = y - 8 * unit
  const rows = 3
  const height = (rows - 1) * line + (agent.isMain ? 28 : 25) * unit
  let left = agent.x - panelWidth / 2
  const dock = agent.captionDock
  if (dock && !agent.archived) {
    const hud = radius + instrumentPadding
    const gap = 8 + 5 * unit + dock.ring * 80
    if (dock.side.includes('left')) left = agent.x - hud - gap - panelWidth
    if (dock.side.includes('right')) left = agent.x + hud + gap
    if (dock.side.startsWith('above')) top = agent.y - hud - gap - height
    else if (dock.side.startsWith('below')) top = agent.y + hud + gap
    else top = agent.y - height / 2
    y = top + 8 * unit
  }
  const endX = Math.max(left, Math.min(left + panelWidth, agent.x))
  const endY = Math.max(top, Math.min(top + height, agent.y))
  const angle = Math.atan2(endY - agent.y, endX - agent.x)
  const hud = radius + instrumentPadding
  return { unit, footerUnit, fonts, width, line, y, panelWidth, top, height, left, centerX: left + panelWidth / 2,
    startX: agent.x + Math.cos(angle) * hud, startY: agent.y + Math.sin(angle) * hud, endX, endY }
}

export function findCaptionAgentAt(x: number, y: number, agents: Map<string, Agent>, compact: boolean, viewScale: number): Agent | undefined {
  for (const agent of agents.values()) {
    if (agent.archived || agent.opacity <= 0.5) continue
    const radius = (agent.isMain ? NODE.radiusMain : NODE.radiusSub) * agent.scale
    const box = captionLayout(agent, radius, compact, viewScale)
    if (x >= box.left && x <= box.left + box.panelWidth && y >= box.top && y <= box.top + box.height) return agent
  }
}


/** Reserve all supported font scales so zoom changes cannot trigger a new docking choice. */
export function captionEnvelope(agent: Parameters<typeof captionLayout>[0], radius: number, compact = false) {
  const boxes = [0.1, 1, 10].map(scale => captionLayout(agent, radius, compact, scale))
  return { left: Math.min(...boxes.map(box => box.left)), right: Math.max(...boxes.map(box => box.left + box.panelWidth)),
    top: Math.min(...boxes.map(box => box.top)), bottom: Math.max(...boxes.map(box => box.top + box.height)) }
}
