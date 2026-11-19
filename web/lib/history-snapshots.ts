import type { SimulationEvent } from './agent-types'
export function isRealtimeSnapshot(event: SimulationEvent): boolean {
  return !!event.sessionId && event.type === 'session_snapshot' && event.payload.source === 't3'
}
export function isRealtimeSession(session: string | null | undefined): boolean {
  return session?.startsWith('t3:') === true
}

/** Graph refreshes are current state, not seekable transcript history. */
export function simulationEventLog(previous: SimulationEvent[], incoming: SimulationEvent[]): SimulationEvent[] {
  // Realtime snapshots never enter the existing log, so only inspect the new batch.
  return previous.concat(incoming.filter(event => !isRealtimeSnapshot(event)))
}

/** T3 source data is authoritative. Keep current graph state, without a local event log. */
export class SessionEventBuffer {
  readonly latestSnapshots = new Map<string, SimulationEvent>()
  constructor(private archive: (event: SimulationEvent) => void, private estimate: (event: SimulationEvent) => number) {}
  ingest(event: SimulationEvent): SimulationEvent {
    if (isRealtimeSnapshot(event)) {
      const { team: _team, ...payload } = event.payload
      const latest = { ...event, payload: { ...payload, preserveHistory: false } }
      this.latestSnapshots.set(event.sessionId!, latest)
      return latest
    }
    this.estimate(event)
    this.archive(event)
    return event
  }
  replayRealtime(session: string, fromIndex: number): SimulationEvent[] | null {
    if (!isRealtimeSession(session)) return null
    const latest = this.latestSnapshots.get(session)
    return latest && (latest.sequence ?? 0) > fromIndex ? [{ ...latest, historical: true }] : []
  }
  retainSessions(sessions: ReadonlySet<string>) {
    for (const id of this.latestSnapshots.keys()) if (!sessions.has(id)) this.latestSnapshots.delete(id)
  }
  clear() { this.latestSnapshots.clear() }
}
