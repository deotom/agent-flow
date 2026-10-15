import type { Agent } from '@/lib/agent-types'

/** Leave established and dragged nodes in place; fit new labels into free space. */
export function stableAgentLayout(agents: Map<string, Agent>, established: Set<string>): Map<string, Agent> {
  const result = new Map(agents)
  const round = Math.max(0, ...[...agents.values()].map(agent => agent.round ?? 0))
  const placed: Agent[] = [...agents.values()].filter(agent => agent.pinned || established.has(agent.id))
  for (const agent of agents.values()) {
    if (agent.pinned || established.has(agent.id) || agent.state === 'complete') continue
    const free = (x: number, y: number) => placed.every(other => other.state === 'complete' || (!other.isMain && (other.round ?? 0) !== round) || Math.abs(x - other.x) >= 310 || Math.abs(y - other.y) >= 230)
    let x = agent.x, y = agent.y
    if (!free(x, y)) {
      const parent = agent.parentId ? result.get(agent.parentId) : undefined
      const cx = parent?.x ?? agent.x, cy = parent?.y ?? agent.y
      const initial = Math.atan2(agent.y - cy, agent.x - cx)
      search: for (let ring = 1; ring <= agents.size + 1; ring++) {
        for (let step = 0; step < 24; step++) {
          const angle = initial + step * Math.PI / 12
          const px = cx + Math.cos(angle) * ring * 360
          const py = cy + Math.sin(angle) * ring * 360
          if (free(px, py)) { x = px; y = py; break search }
        }
      }
    }
    const next = { ...agent, x, y }
    result.set(agent.id, next)
    placed.push(next)
  }
  return result
}
