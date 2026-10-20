import { NODE, type Agent, type Edge, type ToolCallNode } from './agent-types'
import { AGENT_DRAW, BUBBLE_DRAW, BUBBLE_GAP, BUBBLE_MAX_W, BUBBLE_MAX_LINES, TOOL_CARD_W, TOOL_CARD_H } from './canvas-constants'
import { captionEnvelope } from './agent-caption'
import { bezierPoint, computeControlPoints } from '@/components/agent-visualizer/canvas/draw-edges'

type Rect = ReturnType<typeof captionEnvelope>
type Dock = NonNullable<Agent['captionDock']>
const sides: Dock['side'][] = ['below', 'left', 'right', 'above', 'below-left', 'below-right', 'above-left', 'above-right']
const overlap = (a: Rect, b: Rect) => a.left < b.right + 6 && a.right > b.left - 6 && a.top < b.bottom + 6 && a.bottom > b.top - 6

/** Exact segment/rectangle clipping, also catching lines whose endpoints are outside the plaque. */
function crosses(a: { x: number; y: number }, b: { x: number; y: number }, rect: Rect): boolean {
  let lo = 0, hi = 1
  const dx = b.x - a.x, dy = b.y - a.y
  for (const [p, q] of [[-dx, a.x - rect.left], [dx, rect.right - a.x], [-dy, a.y - rect.top], [dy, rect.bottom - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) lo = Math.max(lo, t)
    else hi = Math.min(hi, t)
    if (lo > hi) return false
  }
  return true
}

/** Stable per-view docking; only a side/ring is retained for each currently known node. */
export function createCaptionPlacement() {
  const positions = new Map<string, Dock>()
  let geometryKey: string | undefined
  return (agents: Map<string, Agent>, tools: Map<string, ToolCallNode>, edges: Edge[], compact = false): Map<string, Agent> => {
    for (const id of positions.keys()) if (!agents.has(id)) positions.delete(id)
    const attach = () => {
      let result = agents
      for (const agent of agents.values()) {
        const dock = positions.get(agent.id)
        if (!dock || agent.archived || agent.captionDock?.side === dock.side && agent.captionDock?.ring === dock.ring) continue
        if (result === agents) result = new Map(agents)
        result.set(agent.id, { ...agent, captionDock: dock })
      }
      return result
    }
    // Status clocks and fade frames do not affect docking geometry.
    const key = JSON.stringify([compact,
      [...agents.values()].map(agent => [agent.id, agent.x, agent.y, agent.isMain, agent.archived, agent.state === 'complete' && agent.opacity <= 0,
        compact ? [] : agent.messageBubbles.map(bubble => [bubble.role, bubble._cachedW, bubble._cachedH])]),
      compact ? [] : [...tools.values()].map(tool => [tool.id, tool.x, tool.y, tool.historical, tool.opacity > 0]),
      edges.map(edge => [edge.from, edge.to, edge.type, edge.opacity > 0])])
    if (key === geometryKey) return attach()
    const obstacles: Rect[] = []
    const plaques = new Map<string, Rect>()
    for (const agent of agents.values()) {
      if (agent.opacity <= 0 && agent.state === 'complete') continue
      const radius = agent.isMain ? NODE.radiusMain : NODE.radiusSub
      const hud = radius + (agent.isMain && !compact ? 34 : 14)
      obstacles.push({ left: agent.x - hud, right: agent.x + hud, top: agent.y - hud, bottom: agent.y + hud })
      plaques.set(agent.id, captionEnvelope({ ...agent, captionDock: positions.get(agent.id) }, radius, compact))
      if (!compact) {
        let y = agent.y + AGENT_DRAW.bubbleCursorY
        for (const bubble of agent.messageBubbles) {
          const style = bubble.role === 'thinking' ? BUBBLE_DRAW.thinking : BUBBLE_DRAW.normal
          const height = bubble._cachedH ?? style.headerH + BUBBLE_MAX_LINES * style.lineH + style.padding + style.lineH
          const left = agent.x + radius + AGENT_DRAW.bubbleAnchorOffset
          obstacles.push({ left, right: left + (bubble._cachedW ?? BUBBLE_MAX_W), top: y, bottom: y + height })
          y += height + BUBBLE_GAP
        }
      }
    }
    if (!compact) for (const tool of tools.values()) if (!tool.historical && tool.opacity > 0) {
      obstacles.push({ left: tool.x - TOOL_CARD_W / 2, right: tool.x + TOOL_CARD_W / 2,
        top: tool.y - TOOL_CARD_H / 2, bottom: tool.y + TOOL_CARD_H / 2 })
    }
    const paths: Array<Array<{ x: number; y: number }>> = []
    for (const edge of edges) {
      if (compact && edge.type !== 'parent-child') continue
      const from = agents.get(edge.from), to = agents.get(edge.to) ?? tools.get(edge.to)
      if (!from || !to || edge.opacity <= 0) continue
      const cp = computeControlPoints(from.x, from.y, to.x, to.y)
      if (!cp) continue
      paths.push(Array.from({ length: 13 }, (_, i) => ({
        x: bezierPoint(i / 12, from.x, cp.cp1x, cp.cp2x, to.x),
        y: bezierPoint(i / 12, from.y, cp.cp1y, cp.cp2y, to.y) })))
    }
    for (const agent of agents.values()) {
      if (agent.archived || agent.opacity <= 0 && agent.state === 'complete') continue
      const radius = agent.isMain ? NODE.radiusMain : NODE.radiusSub
      const occupied = [...obstacles, ...[...plaques].filter(([id]) => id !== agent.id).map(([, rect]) => rect)]
      const boxFor = (dock: Dock) => captionEnvelope({ ...agent, captionDock: dock }, radius, compact)
      const score = (box: Rect) => occupied.filter(rect => overlap(box, rect)).length * 1000
        + paths.filter(path => path.slice(1).some((point, i) => crosses(path[i], point, box))).length * 10
      let dock: Dock = positions.get(agent.id) ?? { side: 'below', ring: 0 }
      let box = boxFor(dock), cost = score(box)
      if (cost > 0) {
        let best = cost + dock.ring
        for (let ring = 0; ring < 4; ring++) for (const side of sides) {
          const candidate = { side, ring }, bounds = boxFor(candidate), value = score(bounds) + ring
          if (value < best) { dock = candidate; box = bounds; cost = score(bounds); best = value }
        }
        if (cost >= 1000) {
          const top = Math.min(agent.y, ...occupied.map(rect => rect.top))
          dock = { side: 'above', ring: Math.ceil((agent.y - top + 240) / 80) }
          box = boxFor(dock)
        }
      }
      positions.set(agent.id, dock); plaques.set(agent.id, box)
    }
    geometryKey = key
    return attach()
  }
}
