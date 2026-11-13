import type { OfficeActor, OfficeEvent, OfficePoint, OfficeScene } from './office-types'
import { createOfficeTrip, officeTripFrame, type OfficeTrip, type OfficeTripSegment } from './office-motion'
import { officeLanding, officeNavigation } from './office-navigation'

/** Arrivals have their own durable lane: a long climb must not expire in the work-event queue. */
export function addOfficeArrivals(existing: ReadonlyMap<string,OfficeTrip>, events:readonly OfficeEvent[], before:OfficeScene, next:OfficeScene, now:number) {
  const trips=new Map(existing)
  let start=Math.max(now,...[...trips.values()].map(t=>t.startedAt+900))
  for(const event of events.filter(e=>e.kind==='arrived').sort((a,b)=>a.actorKey.localeCompare(b.actorKey))){
    if(trips.has(event.actorKey))continue
    const trip=createOfficeTrip(event,{...before,actors:before.actors.filter(a=>a.key!==event.actorKey)},next,start)
    if(trip){trips.set(trip.actorKey,trip);start+=900}
  }
  return trips
}

function retarget(trip:OfficeTrip,actor:OfficeActor,scene:OfficeScene,now:number):OfficeTrip {
  if(now<trip.startedAt){
    return createOfficeTrip(trip.event,{...scene,actors:scene.actors.filter(a=>a.key!==actor.key)},scene,trip.startedAt)??trip
  }
  const nav=officeNavigation(scene),landing=officeLanding(scene,actor.floorId)
  if(!landing)return trip
  let cursor=officeTripFrame(trip,now).point
  const segments:OfficeTripSegment[]=[]
  const leg=(to:OfficePoint,kind:OfficeTripSegment['kind'],duration:number)=>{segments.push({from:{...cursor},to:{...to},kind,duration});cursor={...to}}
  const walk=(to:OfficePoint)=>{const d=Math.hypot(to.x-cursor.x,to.y-cursor.y);if(d>.01)leg(to,'walk',Math.max(150,d/(75*nav.scale)*1000))}
  if(Math.abs(cursor.y-landing.y)>.01){
    walk({x:nav.shaftX,y:cursor.y})
    leg({x:nav.shaftX,y:landing.y},'ride',Math.abs(cursor.y-landing.y)/(80*nav.scale)*1000)
    leg(cursor,'hold',280);walk(landing)
  }
  walk({x:actor.x,y:landing.y});walk(actor);leg(actor,'hold',300)
  return {...trip,actor,segments,startedAt:now,endsAt:now+segments.reduce((n,s)=>n+s.duration,0),shaftX:nav.shaftX,rungPitch:nav.rungPitch}
}

export function advanceOfficeArrivals(existing:ReadonlyMap<string,OfficeTrip>,scene:OfficeScene,now:number) {
  const trips=new Map<string,OfficeTrip>(),completed:OfficeTrip[]=[]
  for(const [key,previous] of existing){
    const actor=scene.actors.find(a=>a.key===key&&!a.hidden)
    if(!actor)continue
    const trip=actor.floorId!==previous.actor.floorId||actor.x!==previous.actor.x||actor.y!==previous.actor.y?retarget(previous,actor,scene,now):previous
    if(now>=trip.endsAt)completed.push(trip)
    else trips.set(key,trip)
  }
  return {trips,completed}
}

/** Used by both canvas and DOM: waiting newcomers are absent, entering people use their path position. */
export function officeActorsWithArrivals(scene:OfficeScene,trips:ReadonlyMap<string,OfficeTrip>,now:number):OfficeActor[] {
  return scene.actors.flatMap(actor=>{
    const trip=trips.get(actor.key)
    if(!trip)return [actor]
    if(now<trip.startedAt)return []
    const frame=officeTripFrame(trip,now)
    return [{...actor,...frame.point,stand:true,pose:{...frame.pose,lead:actor.agent.role==='lead'}}]
  })
}
