'use client'
/**
 * Lightweight T3 team feed for the orb window. It reads only team snapshots from the relay's event stream:
 * no simulation, no history archive, no event queue, so a second window cannot double-write history.
 */
import { useEffect, useState } from 'react'
import type { TeamSnapshot } from '@/lib/team-types'
import { projectsIn, type T3ProjectInfo } from './use-t3-projects'

interface RelayEvent { type?: string; sessionId?: string; payload?: { source?: string; team?: unknown } }

/** The team snapshot carried by a relay message, if any. Exported for tests. */
export function teamSnapshotsIn(message: unknown): TeamSnapshot[] {
  const data = message as { type?: string; event?: RelayEvent; events?: RelayEvent[] } | null
  if (!data || typeof data.type !== 'string') return []
  const events = data.type === 'agent-event' ? [data.event] : data.type === 'agent-event-batch' && Array.isArray(data.events) ? data.events : []
  const teams: TeamSnapshot[] = []
  for (const event of events) {
    const team = event?.type === 'session_snapshot' && event.payload?.source === 't3' ? event.payload.team as TeamSnapshot | undefined : undefined
    if (team && event?.sessionId && team.sessionId === event.sessionId && Array.isArray(team.agents)) teams.push(team)
  }
  return teams
}

/** The team the user locked in the main view, shared through same-origin storage. */
export function lockedTeamId(): string | null {
  try { return localStorage.getItem('agent-flow-session-locked') === 'true' ? localStorage.getItem('agent-flow-locked-session') : null } catch { return null }
}

/** Whether the orb's picture is current: relay reachable and T3 readable. */
export type FeedHealth = 'ok' | 'stale' | 'offline'

/** Keep only teams the relay still lists. An explicit empty list clears everything. Exported for tests. */
export function reconcileSnapshots(snapshots: Record<string, TeamSnapshot>, sessionIds: readonly string[]): Record<string, TeamSnapshot> {
  const keep = new Set(sessionIds)
  const ids = Object.keys(snapshots)
  if (ids.every(id => keep.has(id))) return snapshots
  return Object.fromEntries(ids.filter(id => keep.has(id)).map(id => [id, snapshots[id]]))
}

export function useTeamFeed(): { snapshots: Record<string, TeamSnapshot>; projects: T3ProjectInfo[]; locked: string | null; connected: boolean; health: FeedHealth } {
  const [sourceOk, setSourceOk] = useState(true)
  const [projects, setProjects] = useState<T3ProjectInfo[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, TeamSnapshot>>({})
  const [connected, setConnected] = useState(false)
  const [locked, setLocked] = useState(lockedTeamId)
  useEffect(() => {
    const source = new EventSource('/events')
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = message => {
      let data: unknown
      try { data = JSON.parse(message.data) } catch { return }
      const kind = (data as { type?: string }).type
      if (kind === 'session-ended') {
        const id = (data as { sessionId?: string }).sessionId
        if (id) setSnapshots(previous => { if (!(id in previous)) return previous; const next = { ...previous }; delete next[id]; return next })
        return
      }
      if (kind === 'source-health') { setSourceOk((data as { health?: { state?: string } }).health?.state === 'ok'); return }
      if (kind === 'session-list') {
        const sessions = (data as { sessions?: unknown }).sessions
        if (Array.isArray(sessions)) {
          const ids = sessions.map(session => (session as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string' && id.startsWith('t3:'))
          setSnapshots(previous => reconcileSnapshots(previous, ids))
        }
        return
      }
      const list = projectsIn(data)
      if (list) { setProjects(list); return }
      const teams = teamSnapshotsIn(data)
      if (teams.length) setSnapshots(previous => {
        const next = { ...previous }
        for (const team of teams) next[team.sessionId] = team
        return next
      })
    }
    // The main view can lock a team while the orb is open.
    const storage = () => setLocked(lockedTeamId())
    window.addEventListener('storage', storage)
    return () => { source.close(); window.removeEventListener('storage', storage) }
  }, [])
  return { snapshots, projects, locked, connected, health: !connected ? 'offline' : sourceOk ? 'ok' : 'stale' }
}
