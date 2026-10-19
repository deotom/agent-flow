import { NODE, type Agent, type ToolCallNode } from './agent-types'
import { TOOL_CARD_W, TOOL_CARD_H } from './canvas-constants'
import { captionLayout } from './agent-caption'

interface Rect { left: number; right: number; top: number; bottom: number }
interface Point { x: number; y: number }
const halfW = TOOL_CARD_W / 2, halfH = TOOL_CARD_H / 2, gap = 8
const cardRect = (point: Point): Rect => ({ left: point.x - halfW, right: point.x + halfW, top: point.y - halfH, bottom: point.y + halfH })
const overlaps = (point: Point, rect: Rect) => point.x + halfW + gap > rect.left && point.x - halfW - gap < rect.right
  && point.y + halfH + gap > rect.top && point.y - halfH - gap < rect.bottom

/** Presentation-only repair, shared by cards, hit testing, beams, particles and auto-fit. */
export function createToolCaptionLayout() {
  const placed = new Map<string, Point>()
  return (agents: Map<string, Agent>, tools: Map<string, ToolCallNode>): Map<string, ToolCallNode> => {
    for (const id of placed.keys()) if (!tools.has(id)) placed.delete(id)
    const reserved: Rect[] = []
    for (const agent of agents.values()) {
      if (agent.archived || !agent.isMain && agent.state === 'complete' && agent.opacity <= 0) continue
      const radius = agent.isMain ? NODE.radiusMain : NODE.radiusSub
      // Reserve the maximum caption size, so changing zoom never shifts a card.
      const caption = captionLayout(agent, radius, false, 0.1)
      reserved.push({ left: caption.left, right: caption.left + caption.panelWidth,
        top: agent.y + radius + (agent.isMain ? 34 : 14), bottom: caption.top + caption.height })
      const hud = radius + (agent.isMain ? 34 : 14)
      reserved.push({ left: agent.x - hud, right: agent.x + hud, top: agent.y - hud, bottom: agent.y + hud })
    }
    const occupied = new Map<string, Rect>()
    for (const [id, tool] of tools) if (!tool.historical) occupied.set(id, cardRect(placed.get(id) ?? tool))
    let result = tools
    for (const [id, tool] of tools) {
      if (tool.historical) continue
      const obstacles = [...reserved, ...[...occupied].filter(([other]) => other !== id).map(([, rect]) => rect)]
      const collision = (point: Point) => obstacles.find(rect => overlaps(point, rect))
      let point: Point = placed.get(id) ?? tool
      if (collision(point)) {
        const queue: Point[] = [point], seen = new Set<string>()
        const distance = (candidate: Point) => (candidate.x - tool.x) ** 2 + (candidate.y - tool.y) ** 2
        let found = false
        for (let step = 0; queue.length && step < 128; step++) {
          queue.sort((a, b) => distance(a) - distance(b))
          const candidate = queue.shift()!
          const key = `${candidate.x}:${candidate.y}`
          if (seen.has(key)) continue
          seen.add(key)
          const rect = collision(candidate)
          if (!rect) { point = candidate; found = true; break }
          queue.push({ x: rect.left - halfW - gap, y: candidate.y }, { x: rect.right + halfW + gap, y: candidate.y },
            { x: candidate.x, y: rect.top - halfH - gap }, { x: candidate.x, y: rect.bottom + halfH + gap })
        }
        if (!found) point = { x: Math.max(tool.x, ...obstacles.map(rect => rect.right)) + halfW + gap, y: tool.y }
      }
      // Retain only positions, never transcript or tool-result objects.
      placed.set(id, { x: point.x, y: point.y })
      occupied.set(id, cardRect(point))
      if (point.x !== tool.x || point.y !== tool.y) {
        if (result === tools) result = new Map(tools)
        result.set(id, { ...tool, x: point.x, y: point.y })
      }
    }
    return result
  }
}
