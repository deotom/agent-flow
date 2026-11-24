import type { TeamAgentStatus, TeamSnapshot } from './team-types'
import { officeDisplayName } from './office-model'

export const ATTENTION_NOTIFY_STORAGE_KEY = 'agent-flow-attention-notify'

export function isWaitingStatus(status: TeamAgentStatus): status is 'waiting_approval' | 'waiting_input' {
  return status === 'waiting_approval' || status === 'waiting_input'
}

export function readAttentionNotifyEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ATTENTION_NOTIFY_STORAGE_KEY) === '0' ? false : true
  } catch {
    return true
  }
}

export function writeAttentionNotifyEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ATTENTION_NOTIFY_STORAGE_KEY, enabled ? '1' : '0')
  } catch { /* Storage can be unavailable. */ }
}

export interface AttentionAlert {
  key: string
  sessionId: string
  agentId: string
  name: string
  teamTitle: string
  status: 'waiting_approval' | 'waiting_input'
  title: string
  body: string
  tag: string
}

export interface AttentionTracker {
  primed: boolean
  statuses: Map<string, TeamAgentStatus>
  lastNotifiedAt: Map<string, number>
}

export function createAttentionTracker(): AttentionTracker {
  return {
    primed: false,
    statuses: new Map(),
    lastNotifiedAt: new Map(),
  }
}

/** Detect genuine live transitions into waiting_approval / waiting_input without leaking task details. */
export function collectAttentionAlerts(
  tracker: AttentionTracker,
  snapshots: readonly TeamSnapshot[],
  live: boolean,
  now: number,
  cooldownMs = 60_000,
): AttentionAlert[] {
  if (!live) {
    tracker.primed = false
    tracker.statuses.clear()
    return []
  }
  if (!tracker.primed && snapshots.length === 0) return []

  const nextStatuses = new Map<string, TeamAgentStatus>()
  const alerts: AttentionAlert[] = []

  for (const team of snapshots) {
    const cleanTeam = officeDisplayName(team.title || 'Team').slice(0, 60)
    for (const agent of team.agents) {
      const key = `${team.sessionId}:${agent.id}`
      nextStatuses.set(key, agent.status)
      if (!tracker.primed || !isWaitingStatus(agent.status)) continue
      const previous = tracker.statuses.get(key)
      if (previous && isWaitingStatus(previous)) continue
      const lastAt = tracker.lastNotifiedAt.get(key) ?? -Infinity
      if (now - lastAt < cooldownMs) continue
      tracker.lastNotifiedAt.set(key, now)
      const name = officeDisplayName(agent.name).slice(0, 48)
      const title = agent.status === 'waiting_approval' ? 'Approval needed' : 'Input needed'
      alerts.push({
        key,
        sessionId: team.sessionId,
        agentId: agent.id,
        name,
        teamTitle: cleanTeam,
        status: agent.status,
        title,
        body: `${name} · ${cleanTeam}`,
        tag: `attention:${key}`,
      })
    }
  }

  for (const [key, at] of tracker.lastNotifiedAt) {
    if (now - at > cooldownMs * 5) tracker.lastNotifiedAt.delete(key)
  }

  tracker.statuses = nextStatuses
  tracker.primed = true
  return alerts
}

/** Collapse concurrent waiting transitions into one compact native notification payload. */
export function formatAttentionNotification(
  alerts: readonly AttentionAlert[],
): { title: string; body: string; tag: string; sessionId: string; agentId: string } | null {
  if (alerts.length === 0) return null
  if (alerts.length === 1) {
    const [first] = alerts
    return { title: first.title, body: first.body, tag: first.tag, sessionId: first.sessionId, agentId: first.agentId }
  }
  const names = alerts.slice(0, 3).map(alert => alert.name).join(', ')
  const extra = alerts.length > 3 ? ` +${alerts.length - 3}` : ''
  return {
    title: `${alerts.length} agents need you`,
    body: `${names}${extra}`,
    tag: alerts[0].tag,
    sessionId: alerts[0].sessionId,
    agentId: alerts[0].agentId,
  }
}
