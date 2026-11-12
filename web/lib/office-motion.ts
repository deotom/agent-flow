import type { OfficeActor, OfficeEvent, OfficePoint, OfficePose, OfficeScene } from './office-types'
import type { TeamSnapshot } from './team-types'
import { statusText } from './team-model'
import type { AnimationMode } from './viewer-preferences'

export type OfficePane = 'board' | 'graph' | 'office'
export interface OfficeTripSegment { from: OfficePoint; to: OfficePoint; duration: number; kind: 'walk' | 'ride' | 'hold' }
export interface OfficeTrip { event: OfficeEvent; actorKey: string; actor: OfficeActor; segments: OfficeTripSegment[]; startedAt: number; endsAt: number; caption: string }
export interface OfficeTripFrame { point: OfficePoint; pose: OfficePose; elevatorY: number | null; done: boolean }

const point = (value: OfficePoint): OfficePoint => ({ x: value.x, y: value.y })
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Only new evidence calls this. Initial reads and stale-source catch-up never create a trip. */
export function createOfficeTrip(event: OfficeEvent, before: OfficeScene, next: OfficeScene, now: number): OfficeTrip | null {
  const child = next.actors.find(actor => actor.key === event.actorKey) ?? (event.kind === 'left' ? before.actors.find(actor => actor.key === event.actorKey) : null)
  const parent = event.parentKey ? next.actors.find(actor => actor.key === event.parentKey) : null
  if (!child || child.hidden) return null
  const presence = event.kind === 'arrived' || event.kind === 'left'
  if (!presence && event.kind !== 'finished' && (!parent || parent.key === child.key || child.parentKey !== parent.key)) return null
  const completed = child.zone === 'lounge' && before.actors.find(a=>a.key===child.key)?.zone === 'desk'
  const moving = !completed && (event.kind === 'assigned' || event.kind === 'received') ? parent! : child
  const old = before.actors.find(actor => actor.key === moving.key)
  // A collapsed/relaid floor is no longer a valid place to start an animation.
  if (!presence && !completed && old && !next.floors.some(floor => floor.id === old.floorId)) return null
  const liftX = next.width * .945
  const door = { x: liftX, y: next.width * .335 }
  const from = event.kind === 'arrived' ? { x: liftX, y: door.y } : point(old ?? moving)
  const home = point(moving)
  const destination = completed ? point(child) : event.kind === 'assigned' ? { x: child.x > 65 ? child.x - 18 : child.x + 18, y: child.y }
    : event.kind === 'sent' ? { x: parent!.x > 100 ? parent!.x - 18 : parent!.x + 18, y: parent!.y }
    : event.kind === 'left' ? { x: liftX, y: door.y } : point(moving)
  const segments: OfficeTripSegment[] = []
  let cursor = from
  const leg = (to: OfficePoint, duration: number, kind: OfficeTripSegment['kind']) => {
    segments.push({ from: point(cursor), to: point(to), duration, kind })
    cursor = point(to)
  }
  const travel = (to: OfficePoint) => {
    if (cursor.y !== to.y) {
      leg({ x: liftX, y: cursor.y }, clamp(Math.abs(liftX - cursor.x) / 65 * 1000, 200, 1500), 'walk')
      leg({ x: liftX, y: to.y }, clamp(Math.abs(to.y - cursor.y) / 160 * 1000, 350, 2200), 'ride')
    }
    if (cursor.x !== to.x || cursor.y !== to.y) leg(to, clamp(Math.abs(to.x - cursor.x) / 65 * 1000, 200, 1500), 'walk')
  }
  const captions: Record<OfficeEvent['kind'], string> = {
    assigned: 'is sharing an assignment', finished: 'is taking a break in the lounge', sent: 'has sent their work', received: 'has received the work', arrived: 'is climbing down to their desk', left: 'is climbing up to the lounge',
  }
  if (event.kind === 'received' && !completed) leg(home, 1800, 'hold')
  else {
    if (event.kind === 'left') { travel(door); leg(door, 250, 'hold') }
    travel(destination)
    leg(destination, event.kind === 'finished' ? 300 : 1400, 'hold')
    if (event.kind !== 'finished' && !presence && !completed) travel(home)
  }
  return { event, actorKey: moving.key, actor: moving, segments, startedAt: now, endsAt: now + segments.reduce((sum, segment) => sum + segment.duration, 0), caption: captions[event.kind] }
}

export function officeTripFrame(trip: OfficeTrip, now: number): OfficeTripFrame {
  let elapsed = Math.max(0, now - trip.startedAt)
  const done = now >= trip.endsAt
  const last = trip.segments.at(-1)!
  for (const segment of trip.segments) {
    if (elapsed < segment.duration) {
      const ratio = clamp(elapsed / segment.duration, 0, 1)
      const position = { x: segment.from.x + (segment.to.x - segment.from.x) * ratio, y: segment.from.y + (segment.to.y - segment.from.y) * ratio }
      return { point: position, done: false, elevatorY: segment.kind === 'ride' ? position.y : null,
        pose: { climb: segment.kind === 'ride', walk: segment.kind === 'walk', sit: false, carry: trip.event.kind === 'sent' || trip.event.kind === 'assigned', hand: segment.kind === 'hold' && trip.event.kind === 'received' } }
    }
    elapsed -= segment.duration
  }
  return { point: point(last.to), pose: {}, elevatorY: null, done }
}

/** Bounded, short-lived visual work. Snapshots, not this queue, remain the authoritative state. */
export function mergeOfficeEvents(pending: readonly OfficeEvent[], incoming: readonly OfficeEvent[], now: number): OfficeEvent[] {
  const rank = { assigned: 0, finished: 1, sent: 2, received: 3, arrived: 4, left: 5 }
  const latest = new Map<string, OfficeEvent>()
  for (const event of [...pending, ...incoming]) {
    if (now - event.at > 15_000) continue
    const previous = latest.get(event.actorKey)
    if (!previous || event.at > previous.at || (event.at === previous.at && rank[event.kind] > rank[previous.kind])) latest.set(event.actorKey, event)
  }
  return [...latest.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(-12)
}

/** Display presence is separate from task delivery; no entering/leaving animation claims receipt. */
export function officePresenceEvents(before: OfficeScene | null, next: OfficeScene, knownTeams: ReadonlySet<string>, now: number): OfficeEvent[] {
  if (!before) return []
  const old = new Map(before.actors.map(actor => [actor.key, actor])), current = new Map(next.actors.map(actor => [actor.key, actor]))
  const events: OfficeEvent[] = []
  for (const actor of before.actors) if (!current.has(actor.key)) events.push({ id: JSON.stringify(['left', actor.key, now]), kind: 'left', actorKey: actor.key, parentKey: actor.parentKey, at: now })
  for (const actor of next.actors) if (old.get(actor.key)?.zone === 'desk' && actor.zone === 'lounge') events.push({id:JSON.stringify(['finished',actor.key,now]),kind:'finished',actorKey:actor.key,parentKey:actor.parentKey,at:now})
  for (const actor of next.actors) if (!old.has(actor.key) && knownTeams.has(actor.sessionId) && (actor.agent.role === 'lead' || ['running','thinking','background','waiting_approval','waiting_input'].includes(actor.agent.status))) {
    events.push({ id: JSON.stringify(['arrived', actor.key, now]), kind: 'arrived', actorKey: actor.key, parentKey: actor.parentKey, at: now })
  }
  return events
}

export function populatedOfficeTeams(snapshots: readonly TeamSnapshot[]): Set<string> { return new Set(snapshots.filter(team => team.agents.length > 0).map(team => team.sessionId)) }

/** Hold floor geometry while people leave, but continue showing the latest real agent states. */
export function officeDepartureScene(held: OfficeScene, next: OfficeScene, snapshots: readonly TeamSnapshot[]): OfficeScene {
  const current = new Map(next.actors.map(actor => [actor.key, actor]))
  const teams = new Map(snapshots.map(team => [team.sessionId, team]))
  return { ...held, totalAgents: next.totalAgents, finishedCount: next.finishedCount, quietTeams: next.quietTeams,
    actors: held.actors.map(actor => {
      const latest = current.get(actor.key)
      if (latest) return { ...latest, x: actor.x, y: actor.y, floorId: actor.floorId }
      const source = teams.get(actor.sessionId), agent = source?.agents.find(item => item.id === actor.agent.id)
      return { ...actor, agent: agent ?? actor.agent, activity: agent ? statusText(agent) : `Last known: ${actor.activity}`, pose: { ...actor.pose, typing: false, hand: false } }
    }) }
}

export function parseOfficePane(value: string | null): OfficePane { return value === 'office' || value === 'graph' ? value : 'board' }
export function officeAllowsMotion(mode: AnimationMode, reduced: boolean, allowReduced: boolean): boolean { return mode !== 'off' && (!reduced || allowReduced) }

export function parseOfficeIdentities(raw: string | null): Map<string, number> {
  const identities = new Map<string, number>()
  if (!raw) return identities
  try {
    const rows: unknown = JSON.parse(raw)
    if (!Array.isArray(rows)) return identities
    for (const row of rows.slice(0, 10_000)) {
      if (Array.isArray(row) && typeof row[0] === 'string' && row[0].length > 0 && row[0].length <= 2048 && Number.isSafeInteger(row[1]) && row[1] >= 0 && row[1] <= 1_000_000) identities.set(row[0], row[1])
    }
  } catch { /* Private browsing, old formats and corrupt storage must not block the viewer. */ }
  return identities
}
