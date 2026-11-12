/**
 * Orb mode: the whole team at a glance in a small floating reactor.
 * Pure selection and summary logic; drawing lives in components/orb.
 */
import { buildTeamView, isWorking, statusText } from './team-model'
import type { AgentRuntime, TeamAgentStatus, TeamSnapshot } from './team-types'

export const ORB_MAX_DOTS = 8

export interface OrbDot { id: string; status: TeamAgentStatus; working: boolean; name: string; runtime: AgentRuntime | null }
export interface OrbSummary {
  snapshot: TeamSnapshot
  /** Workers in the open team, working ones first, at most ORB_MAX_DOTS. */
  dots: OrbDot[]
  /** Open workers beyond the dots. */
  overflow: number
  /** Something needs the user (waiting) or went wrong (failed). Waiting outranks failed. */
  alert: 'waiting' | 'failed' | null
  /** One line: lead status and how many workers are working. */
  line: string
  /** Whether anything is moving, so an idle orb can redraw slowly. */
  busy: boolean
}

/** The locked team when the user locked one, otherwise the active team that changed last. */
export function pickOrbTeam(snapshots: Record<string, TeamSnapshot>, preferred: string | null): TeamSnapshot | null {
  if (preferred && snapshots[preferred]) return snapshots[preferred]
  const teams = Object.values(snapshots)
  teams.sort((a, b) => Number(b.active) - Number(a.active) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return teams[0] ?? null
}

export function orbSummary(snapshot: TeamSnapshot): OrbSummary {
  const view = buildTeamView(snapshot, 'active')
  const workers = view.rows.filter(row => row.agent.role !== 'lead').map(row => row.agent)
  workers.sort((a, b) => Number(isWorking(b.status)) - Number(isWorking(a.status)))
  const dots = workers.slice(0, ORB_MAX_DOTS).map(agent => ({ id: agent.id, status: agent.status, working: isWorking(agent.status), name: agent.name, runtime: agent.runtime }))
  const kinds = new Set(view.attention.map(item => item.kind))
  const alert = kinds.has('waiting') ? 'waiting' : kinds.has('failed') ? 'failed' : null
  const working = workers.filter(agent => isWorking(agent.status)).length
  const lead = view.lead
  const leadText = lead ? statusText(lead).toLowerCase() : 'no lead'
  const line = working > 0 ? `› ${leadText} · ${working} working` : `› ${leadText}`
  const busy = alert === 'waiting' || working > 0 || (lead ? isWorking(lead.status) : false)
  return { snapshot, dots, overflow: Math.max(0, workers.length - dots.length), alert, line, busy }
}
