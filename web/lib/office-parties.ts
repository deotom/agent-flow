import type { TeamSnapshot } from './team-types'
import { OFFICE_PARTY_MS, officeTeamQuiet } from './office-model'

export interface OfficePartyHistory {
  quiet: ReadonlyMap<string, boolean> | null
  since: ReadonlyMap<string, number>
  parties: ReadonlySet<string>
}
export const emptyOfficePartyHistory = (): OfficePartyHistory => ({ quiet: null, since: new Map(), parties: new Set() })

/** Pure projection from committed history; callers commit only after render. */
export function deriveOfficeParties(previous: OfficePartyHistory, snapshots: readonly TeamSnapshot[], now: number): OfficePartyHistory {
  const quiet = new Map(snapshots.map(snapshot => [snapshot.sessionId, officeTeamQuiet(snapshot)]))
  const since = new Map(previous.since)
  for (const [id, isQuiet] of quiet) if (isQuiet && previous.quiet?.get(id) === false && !since.has(id)) since.set(id, now)
  for (const [id, at] of since) if (!quiet.get(id) || now - at >= OFFICE_PARTY_MS) since.delete(id)
  const members = [...since].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id)
  const parties = members.length === previous.parties.size && members.every(id => previous.parties.has(id)) ? previous.parties : new Set(members)
  return { quiet, since, parties }
}
