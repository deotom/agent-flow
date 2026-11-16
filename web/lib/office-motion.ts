import type { OfficeActor, OfficeEvent, OfficePoint, OfficePose, OfficeScene } from './office-types'
import type { TeamSnapshot } from './team-types'
import { isWorking, statusText } from './team-model'
import type { AnimationMode } from './viewer-preferences'
import { officeWorkTarget, OFFICE_STATION_LABELS } from './office-work'
import { officeNavigation, officeLanding, officeInteriorDoor, officeAisle } from './office-navigation'

export type OfficePane = 'board' | 'graph' | 'office'
export type OfficeLiftPhase = 'boarding' | 'closing' | 'riding' | 'opening' | 'alighting'
export interface OfficeTripSegment { from: OfficePoint; to: OfficePoint; duration: number; kind: 'walk' | 'ride' | 'hold'; floorId?: string; opacity?:readonly [number,number]; liftPhase?:OfficeLiftPhase }
export interface OfficeTrip { event: OfficeEvent; actorKey: string; actor: OfficeActor; segments: OfficeTripSegment[]; startedAt: number; endsAt: number; caption: string; shaftX:number; rungPitch:number; workFloor?:{id:string;y:number;height:number;width:number} }
export interface OfficeTripFrame { point: OfficePoint; pose: OfficePose; elevatorY: number | null; done: boolean; floorId?: string }

/** Resume only trips whose destination still agrees with the latest snapshot. */
export function officeCanResumeTrip(trip: OfficeTrip | null, scene: OfficeScene): boolean {
  if (!trip) return false
  const actor = scene.actors.find(item => item.key === trip.actorKey && !item.hidden)
  if (trip.event.kind === 'left') return !actor
  return Boolean(actor && actor.floorId === trip.actor.floorId && (trip.event.kind !== 'activity' || isWorking(actor.agent.status)))
}

const point = (value: OfficePoint): OfficePoint => ({ x: value.x, y: value.y })
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Only ordinary, connected walking legs share a moving boundary. Lift clocks stay linear. */
function continuousWalk(before: OfficeTripSegment | undefined, after: OfficeTripSegment | undefined): boolean {
  return Boolean(before && after && before.kind === 'walk' && after.kind === 'walk' && !before.liftPhase && !after.liftPhase &&
    before.floorId === after.floorId && before.to.x === after.from.x && before.to.y === after.from.y)
}

function walkProgress(segments: readonly OfficeTripSegment[], index: number, ratio: number): { ratio: number; speed: number } {
  const segment = segments[index]
  if (segment.kind !== 'walk' || segment.liftPhase) return { ratio, speed: 1 }
  const start = continuousWalk(segments[index - 1], segment) ? 1 : 0
  const end = continuousWalk(segment, segments[index + 1]) ? 1 : 0
  // Cubic Hermite endpoints have either a stopped or a passing-through derivative.
  const cubic = start + end - 2, quadratic = 3 - 2 * start - end
  return { ratio: clamp(((cubic * ratio + quadratic) * ratio + start) * ratio, 0, 1), speed: Math.max(0, (3 * cubic * ratio + 2 * quadratic) * ratio + start) }
}

function holdSeatBlend(segment: OfficeTripSegment, elapsed: number): number {
  if (segment.kind !== 'hold' || segment.liftPhase || segment.duration < 1000) return 0
  const ratio = clamp(Math.min(elapsed, segment.duration - elapsed) / 350, 0, 1)
  return ratio * ratio * (3 - 2 * ratio)
}

/** Shared physical navigation for lifecycle and cosmetic journeys. It does not reserve the lift. */
export function createOfficeTravelPath(sourceScene:OfficeScene,next:OfficeScene,from:OfficePoint,fromFloor:string) {
  const nav=officeNavigation(next),liftX=nav.shaftX
  const segments: OfficeTripSegment[] = []
  let cursor = from
  let cursorFloor=fromFloor
  let cursorScene=sourceScene
  const leg = (to: OfficePoint, duration: number, kind: OfficeTripSegment['kind'], opacity?:readonly [number,number]) => {
    segments.push({ from: point(cursor), to: point(to), duration, kind, floorId:cursorFloor,opacity })
    cursor = point(to)
  }
  const walk=(to:OfficePoint)=>{const distance=Math.hypot(to.x-cursor.x,to.y-cursor.y);if(distance>.01)leg(to,Math.max(180,distance/(75*nav.scale)*1000),'walk')}
  const travel = (to: OfficePoint,toFloor:string) => {
    const sourceFloor=cursorScene.floors.find(f=>f.id===cursorFloor)??next.floors.find(f=>f.id===cursorFloor)
    const targetFloor=next.floors.find(f=>f.id===toFloor)
    if(sourceFloor?.annexOf&&cursorFloor!==toFloor){
      const threshold=officeInteriorDoor(cursorScene,sourceFloor.id)??officeInteriorDoor(next,sourceFloor.id)
      if(threshold){walk({x:cursor.x,y:threshold.y});walk(threshold);leg(cursor,280,'hold',[1,0]);cursorFloor=sourceFloor.annexOf;cursorScene=next;leg(cursor,280,'hold',[0,1])}
    }
    if(targetFloor?.annexOf&&cursorFloor!==toFloor){
      const threshold=officeInteriorDoor(next,targetFloor.id)
      if(threshold){travel(threshold,targetFloor.annexOf);leg(cursor,280,'hold',[1,0]);cursorFloor=toFloor;cursorScene=next;leg(cursor,280,'hold',[0,1]);walk({x:to.x,y:threshold.y});walk(to);return}
    }
    const target=officeAisle(next,toFloor)??{x:liftX-28*nav.scale,y:to.y}
    const targetDoor=officeLanding(next,toFloor)??target
    if(cursorFloor!==toFloor){
      const source=officeAisle(cursorScene,cursorFloor)??{x:liftX-28*nav.scale,y:cursor.y}
      const sourceDoor=officeLanding(cursorScene,cursorFloor)??source
      const sourceWait=Math.abs(sourceDoor.x-liftX)<.01?{x:liftX-28*nav.scale,y:sourceDoor.y}:sourceDoor
      walk({x:cursor.x,y:source.y});walk(sourceWait)
      // The passenger crosses an open threshold, then waits inside while doors close.
      const boardingStart=segments.length
      walk({x:liftX,y:sourceDoor.y})
      if(segments.length===boardingStart)leg(cursor,280,'hold')
      segments[segments.length-1].liftPhase='boarding'
      leg(cursor,650,'hold');segments[segments.length-1].liftPhase='closing'
      const distance=Math.abs(targetDoor.y-cursor.y)
      if(distance>.01){leg({x:liftX,y:targetDoor.y},distance/(80*nav.scale)*1000,'ride');segments[segments.length-1].liftPhase='riding'}
      cursorFloor=toFloor;cursorScene=next
      leg(cursor,650,'hold');segments[segments.length-1].liftPhase='opening'
      const alightingStart=segments.length
      const targetExit=Math.abs(targetDoor.x-liftX)<.01?{x:liftX-28*nav.scale,y:targetDoor.y}:targetDoor
      walk(targetExit);if(Math.abs(target.x-liftX)>.01)walk(target)
      if(segments.length===alightingStart)leg(cursor,280,'hold')
      segments[alightingStart].liftPhase='alighting'
    }else{walk({x:cursor.x,y:target.y})}
    walk({x:to.x,y:target.y});walk(to)
  }
  return {segments,leg,travel,nav}
}

/** Lifecycle trips need new evidence; activity trips illustrate current observed work. */
export function createOfficeTrip(event: OfficeEvent, before: OfficeScene, next: OfficeScene, now: number, activityTarget?:OfficePoint): OfficeTrip | null {
  if(event.kind==='routine')return null
  const child = event.kind==='left' ? before.actors.find(actor=>actor.key===event.actorKey&&!actor.hidden) : next.actors.find(actor=>actor.key===event.actorKey)
  const parent = event.parentKey ? next.actors.find(actor => actor.key === event.parentKey) : null
  if (!child || child.hidden) return null
  const presence = event.kind === 'arrived' || event.kind === 'left'
  if (!presence && event.kind !== 'finished' && event.kind !== 'activity' && (!parent || parent.key === child.key || child.parentKey !== parent.key)) return null
  if(event.kind==='activity'&&child.zone!=='desk')return null
  const prior = before.actors.find(a => a.key === child.key)
  const changedRoom = Boolean(prior && prior.floorId !== child.floorId)
  const moving = !changedRoom && (event.kind === 'assigned' || event.kind === 'received') ? parent! : child
  if (moving.hidden) return null
  const old = before.actors.find(actor => actor.key === moving.key)
  // A collapsed/relaid floor is no longer a valid place to start an animation.
  if (!presence && !changedRoom && old && !next.floors.some(floor => floor.id === old.floorId)) return null
  const nav=officeNavigation(next),liftX=nav.shaftX
  const door=nav.hatch
  const from = event.kind === 'arrived' && !old ? { x: liftX-60*nav.scale, y: door.y } : point(old ?? moving)
  const home = point(moving)
  const destination = changedRoom ? point(child) : event.kind === 'activity' ? activityTarget??officeWorkTarget(child,next,event.station??'terminal') : event.kind === 'assigned' ? { x: child.x > 65 ? child.x - 18 : child.x + 18, y: child.y }
    : event.kind === 'sent' ? { x: parent!.x > 100 ? parent!.x - 18 : parent!.x + 18, y: parent!.y }
    : event.kind === 'left' ? { x: liftX-60*nav.scale, y: door.y } : point(moving)
  const {segments,leg,travel}=createOfficeTravelPath(old?before:next,next,from,event.kind==='arrived'&&!old?'lounge':old?.floorId??moving.floorId)
  const destinationFloor=event.kind==='left'?'lounge':event.kind==='sent'&&!changedRoom?parent!.floorId:event.kind==='assigned'&&!changedRoom?child.floorId:moving.floorId
  const captions: Record<OfficeEvent['kind'], string> = {
    routine:'',
    activity:`is working at the ${OFFICE_STATION_LABELS[event.station??'terminal']}`,
    assigned: 'is sharing an assignment', finished: child.floorId === 'lounge' ? 'is joining the celebration' : child.zone === 'lounge' ? 'is heading to the break room' : 'is heading to their desk', sent: 'has sent their work', received: 'has received the work', arrived: 'is heading to their desk', left: 'is heading home',
  }
  if (event.kind === 'received' && !changedRoom) leg(home, 1800, 'hold')
  else {
    if (event.kind === 'left') { travel(door,'lounge'); leg(door, 250, 'hold') }
    travel(destination,destinationFloor)
    leg(destination, event.kind === 'finished' ? 300 : event.kind==='activity'?2200:1400, 'hold')
    if (event.kind !== 'finished' && event.kind!=='activity' && !presence && !changedRoom) travel(home,moving.floorId)
  }
  const floor=event.kind==='activity'?next.floors.find(f=>f.id===moving.floorId):null
  if(event.kind==='arrived'&&segments[0]?.kind==='walk')segments[0].opacity=[0,1]
  if(event.kind==='left'){
    const lastWalk=segments.findLast(segment=>segment.kind==='walk')
    if(lastWalk)lastWalk.opacity=[1,0]
    segments.at(-1)!.opacity=[0,0]
  }
  return { event, actorKey: moving.key, actor: moving, segments, startedAt: now, endsAt: now + segments.reduce((sum, segment) => sum + segment.duration, 0), caption: changedRoom && event.kind !== 'left' ? captions.finished : captions[event.kind],shaftX:nav.shaftX,rungPitch:nav.rungPitch,workFloor:floor?{id:floor.id,y:floor.y,height:floor.height??next.width*.5625,width:next.width}:undefined }
}

/** Work paths stay attached to the same straight aisle during smooth floor relayout. */
export function officeWorkTripFrame(trip:OfficeTrip,now:number,scene:OfficeScene):OfficeTripFrame {
 const frame=officeTripFrame(trip,now),prior=trip.workFloor,floor=prior&&scene.floors.find(f=>f.id===prior.id)
 if(!prior||!floor||prior.width<=0||prior.height<=0)return frame
 return {...frame,point:{x:frame.point.x*scene.width/prior.width,y:floor.y+(frame.point.y-prior.y)*(floor.height??scene.width*.5625)/prior.height}}
}

export function officeTripFrame(trip: OfficeTrip, now: number): OfficeTripFrame {
  let elapsed = Math.max(0, now - trip.startedAt)
  const done = now >= trip.endsAt
  const last = trip.segments.at(-1)!
  if(done)return {point:point(last.to),pose:last.opacity?{opacity:last.opacity[1]}:{},elevatorY:null,done:true,floorId:last.floorId}
  const scale = Number.isFinite(trip.rungPitch) && trip.rungPitch > 0 ? trip.rungPitch / 18 : 1
  let walked = 0, previousFace: -1 | 1 = 1
  for (let index = 0; index < trip.segments.length; index++) {
    const segment = trip.segments[index]
    const distance = segment.kind === 'walk' ? Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y) : 0
    if (elapsed < segment.duration) {
      const ratio = clamp(elapsed / segment.duration, 0, 1)
      const progress = walkProgress(trip.segments, index, ratio)
      const position = { x: segment.from.x + (segment.to.x - segment.from.x) * progress.ratio, y: segment.from.y + (segment.to.y - segment.from.y) * progress.ratio }
      const face = !segment.liftPhase && segment.kind === 'hold' && segment.to.x === segment.from.x ? previousFace : segment.to.x < segment.from.x ? -1 : 1
      return { point: position, done: false, floorId:segment.floorId, elevatorY: segment.kind === 'ride' ? position.y : null,
        pose: { inLift:Boolean(segment.liftPhase&&Math.abs(position.x-trip.shaftX)<10*trip.rungPitch/18),opacity:segment.opacity?segment.opacity[0]+(segment.opacity[1]-segment.opacity[0])*ratio:undefined,climb: false,climbStep:position.y/trip.rungPitch,walk: segment.kind === 'walk', walkWeight:clamp(distance / segment.duration * 1000 / (75 * scale) * progress.speed, 0, 1), gait:(walked + distance * progress.ratio) / (22 * scale) * Math.PI * 2, seatBlend:holdSeatBlend(segment, elapsed), face, sit: false, carry: trip.event.kind === 'sent' || trip.event.kind === 'assigned',
          objectAction:segment.kind==='hold'&&trip.event.kind==='activity'&&trip.event.station==='research'?'book':undefined,
          typing:segment.kind==='hold'&&trip.event.kind==='activity'&&(trip.event.station==='build'||trip.event.station==='terminal'),
          hand:segment.kind==='hold'&&(trip.event.kind==='received'||(trip.event.kind==='activity'&&(trip.event.station==='planning'||trip.event.station==='quality'))) } }
    }
    walked += distance
    if (segment.kind === 'walk' && segment.to.x !== segment.from.x) previousFace = segment.to.x < segment.from.x ? -1 : 1
    elapsed -= segment.duration
  }
  return { point: point(last.to), pose: last.opacity?{opacity:last.opacity[1]}:{}, elevatorY: null, done, floorId:last.floorId }
}

/** Bounded, short-lived visual work. Snapshots, not this queue, remain the authoritative state. */
export function mergeOfficeEvents(pending: readonly OfficeEvent[], incoming: readonly OfficeEvent[], now: number, eligible: (event: OfficeEvent) => boolean = () => true): OfficeEvent[] {
  const rank = { routine:-2, activity:-1, assigned: 0, finished: 1, sent: 2, received: 3, arrived: 4, left: 5 }
  const latest = new Map<string, OfficeEvent>()
  for (const event of [...pending, ...incoming]) {
    if ((event.kind!=='left'&&now-event.at>15_000)||!eligible(event))continue
    const previous = latest.get(event.actorKey)
    if (!previous || event.at > previous.at || (event.at === previous.at && rank[event.kind] > rank[previous.kind])) latest.set(event.actorKey, event)
  }
  const ordered=[...latest.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
  const departures=ordered.filter(event=>event.kind==='left')
  const capacity=Math.max(0,12-departures.length),transient=ordered.filter(event=>event.kind!=='left')
  return [...departures,...(capacity?transient.slice(-capacity):[])].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
}

/** Display presence is separate from task delivery; no entering/leaving animation claims receipt. */
export function officePresenceEvents(before: OfficeScene | null, next: OfficeScene, knownTeams: ReadonlySet<string>, now: number, newTeams:ReadonlySet<string> = new Set()): OfficeEvent[] {
  if (!before) return []
  const old = new Map(before.actors.map(actor => [actor.key, actor])), current = new Map(next.actors.map(actor => [actor.key, actor]))
  const events: OfficeEvent[] = []
  for (const actor of before.actors) if (!actor.hidden && !current.has(actor.key)) events.push({ id: JSON.stringify(['left', actor.key, now]), kind: 'left', actorKey: actor.key, parentKey: actor.parentKey, at: now })
  for (const actor of next.actors) if (!actor.hidden && old.has(actor.key) && !old.get(actor.key)!.hidden && old.get(actor.key)!.floorId !== actor.floorId) events.push({id:JSON.stringify(['finished',actor.key,now]),kind:'finished',actorKey:actor.key,parentKey:actor.parentKey,at:now})
  for (const actor of next.actors) if (!actor.hidden && !old.has(actor.key) && (knownTeams.has(actor.sessionId)||newTeams.has(actor.sessionId)) && ['running','thinking','background','waiting_approval','waiting_input'].includes(actor.agent.status)) {
    events.push({ id: JSON.stringify(['arrived', actor.key, now]), kind: 'arrived', actorKey: actor.key, parentKey: actor.parentKey, at: now })
  }
  return events
}

export function populatedOfficeTeams(snapshots: readonly TeamSnapshot[]): Set<string> { return new Set(snapshots.filter(team => team.agents.length > 0).map(team => team.sessionId)) }

/** Hold floor geometry while people leave, but continue showing the latest real agent states. */
export function officeDepartureScene(held: OfficeScene, next: OfficeScene, snapshots: readonly TeamSnapshot[]): OfficeScene {
  const current = new Map(next.actors.map(actor => [actor.key, actor]))
  const teams = new Map(snapshots.map(team => [team.sessionId, team]))
  const floors=held.floors.filter(f=>f.kind!=='quiet').map(f=>{
    if(f.kind!=='team')return {...f}
    const agents=teams.get(f.sessionId??'')?.agents??[],working=agents.filter(a=>isWorking(a.status)).length,waiting=agents.filter(a=>a.status.startsWith('waiting_')).length
    const subtitle=[working?`${working} working`:'',waiting?`${waiting} needs you`:''].filter(Boolean).join(' · ')||'Heading home'
    return {...f,working,waiting,subtitle}
  })
  const byId=new Map(floors.map(f=>[f.id,f]))
  let bottom=Math.max(0,...floors.filter(f=>!f.annexOf).map(f=>f.y+(f.height??0)))
  // Keep departing floors in place while new teams are admitted below them.
  for(const floor of next.floors.filter(f=>!f.annexOf&&f.kind!=='quiet'))if(!byId.has(floor.id)){
    const added={...floor,y:bottom};floors.push(added);byId.set(added.id,added);bottom+=added.height??0
  }
  for(const floor of next.floors.filter(f=>f.annexOf))if(!byId.has(floor.id)){
    const added={...floor,y:byId.get(floor.annexOf!)?.y??floor.y};floors.push(added);byId.set(added.id,added)
  }
  const quiet=next.floors.find(f=>f.kind==='quiet')
  if(quiet){floors.push({...quiet,y:bottom});bottom+=quiet.height??0}
  const actors=held.actors.map(actor=>{
    const latest=current.get(actor.key)
    if(latest){
      const from=next.floors.find(f=>f.id===latest.floorId),to=byId.get(latest.floorId)
      if(!latest.hidden&&from&&to&&(latest.floorId===actor.floorId||latest.zone!==actor.zone||from.kind!==byId.get(actor.floorId)?.kind))return {...latest,y:to.y+(latest.y-from.y)*(to.height??1)/(from.height??1)}
      return {...latest,hidden:actor.hidden,x:actor.x,y:actor.y,floorId:actor.floorId}
    }
    const source=teams.get(actor.sessionId),agent=source?.agents.find(item=>item.id===actor.agent.id)
    return {...actor,agent:agent??actor.agent,activity:agent?statusText(agent):`Last known: ${actor.activity}`,pose:{...actor.pose,typing:false,hand:false}}
  })
  const known=new Set(actors.map(a=>a.key))
  for(const actor of next.actors)if(!known.has(actor.key)){
    const from=next.floors.find(f=>f.id===actor.floorId),to=byId.get(actor.floorId)
    actors.push({...actor,y:from&&to?to.y+(actor.y-from.y)*(to.height??1)/(from.height??1):actor.y})
  }
  return {...held,floors,actors,height:bottom+held.width/3,totalAgents:next.totalAgents,finishedCount:next.finishedCount,quietTeams:next.quietTeams}

}

export function parseOfficePane(value: string | null): OfficePane { return value === 'office' || value === 'graph' ? value : 'board' }
/** Office motion follows the app's own Animation setting only; the OS reduced-motion flag does not override it. */
export function officeAllowsMotion(mode: AnimationMode): boolean { return mode !== 'off' }

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
