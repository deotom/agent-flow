'use client'
/**
 * Lightweight T3 team feed for the orb window. It reads only team snapshots from the relay's event stream:
 * no simulation, no history archive, no event queue, so a second window cannot double-write history.
 */
import { useEffect, useState } from 'react'
import type { TeamSnapshot } from '@/lib/team-types'

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

export function useTeamFeed(): { snapshots: Record<string, TeamSnapshot>; locked: string | null; connected: boolean } {
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
  return { snapshots, locked, connected }
}
