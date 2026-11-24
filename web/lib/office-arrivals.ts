import type { OfficeActor, OfficeEvent, OfficePoint, OfficeScene } from './office-types'
import { createOfficeTrip, officeTripFrame, type OfficeTrip, type OfficeTripSegment } from './office-motion'
import { officeLanding, officeNavigation, officeInteriorDoor, officeAisle, officeLiftApproachDistance } from './office-navigation'
import { createOfficeLift, reserveOfficeLiftTrip, cancelOfficeLiftTrips, restoreOfficeLiftCall, type OfficeLiftState } from './office-lift'
import {officeWalkWaypoints} from './office-walking'

/** Arrivals have their own durable lane: a long climb must not expire in the work-event queue. */
export function addOfficeArrivals(existing: ReadonlyMap<string,OfficeTrip>, events:readonly OfficeEvent[], before:OfficeScene, next:OfficeScene, now:number, lift?:OfficeLiftState) {
  const trips=new Map(existing)
  const car=lift??createOfficeLift(next)
  if(!lift&&trips.size){const last=[...trips.values()].sort((a,b)=>a.endsAt-b.endsAt).at(-1)!;car.availableAt=last.endsAt;car.y=last.segments.findLast(s=>s.liftPhase)?.to.y??car.y;car.doorsOpen=0}
  let start=Math.max(now,...[...trips.values()].map(t=>t.endsAt))
  for(const event of events.filter(e=>e.kind==='arrived').sort((a,b)=>a.actorKey.localeCompare(b.actorKey))){
    if(trips.has(event.actorKey))continue
    const trip=createOfficeTrip(event,{...before,actors:before.actors.filter(a=>a.key!==event.actorKey)},next,start)
    if(trip){const scheduled=reserveOfficeLiftTrip(car,trip,next,now);trips.set(trip.actorKey,scheduled);start=scheduled.endsAt}
  }
  return trips
}

function retarget(trip:OfficeTrip,actor:OfficeActor,scene:OfficeScene,now:number):OfficeTrip {
  if(now<trip.startedAt){
    return createOfficeTrip(trip.event,{...scene,actors:scene.actors.filter(a=>a.key!==actor.key)},scene,trip.startedAt)??trip
  }
  const targetFloor=scene.floors.find(f=>f.id===actor.floorId)
  const publicFloor=targetFloor?.annexOf??actor.floorId
  const nav=officeNavigation(scene),landing=officeLanding(scene,publicFloor),aisle=officeAisle(scene,publicFloor)
  if(!landing||!aisle)return trip
  const frame=officeTripFrame(trip,now)
  let cursor=frame.point,cursorFloor=frame.floorId??trip.actor.floorId
  const segments:OfficeTripSegment[]=[]
  const leg=(to:OfficePoint,kind:OfficeTripSegment['kind'],duration:number,liftPhase?:OfficeTripSegment['liftPhase'],opacity?:OfficeTripSegment['opacity'])=>{segments.push({from:{...cursor},to:{...to},kind,duration,floorId:cursorFloor,liftPhase,opacity});cursor={...to}}
  const step=(to:OfficePoint)=>{const d=Math.hypot(to.x-cursor.x,to.y-cursor.y);if(d>.01)leg(to,'walk',Math.max(150,d/(75*nav.scale)*1000))}
  const walk=(to:OfficePoint)=>{
    const floor=scene.floors.find(f=>f.id===cursorFloor)
    for(const waypoint of officeWalkWaypoints(floor,scene.width,cursor,to))step(waypoint)
  }
  const source=scene.floors.find(f=>f.id===cursorFloor)
  if(source?.annexOf){
    const threshold=officeInteriorDoor(scene,source.id,'annex')
    if(threshold){
      if(!source.desktopArt)walk({x:cursor.x,y:threshold.y})
      walk(threshold);leg(cursor,'hold',280,undefined,[1,0])
      cursorFloor=source.annexOf;cursor=officeInteriorDoor(scene,cursorFloor)??threshold
      leg(cursor,'hold',280,undefined,[0,1])
    }
  }
  if(frame.pose.inLift||cursorFloor!==publicFloor||(Math.abs(cursor.x-nav.shaftX)<.01&&Math.abs(cursor.y-landing.y)>.01)){
    if(!frame.pose.inLift){
      const sourceLanding=officeLanding(scene,cursorFloor)
      if(sourceLanding){
        if(!scene.floors.find(f=>f.id===cursorFloor)?.desktopArt)walk({x:cursor.x,y:sourceLanding.y})
        walk(Math.abs(sourceLanding.x-nav.shaftX)<.01?{x:nav.shaftX-officeLiftApproachDistance(scene),y:sourceLanding.y}:sourceLanding)
      }
      const count=segments.length;step({x:nav.shaftX,y:cursor.y})
      if(count===segments.length)leg(cursor,'hold',280,'boarding');else segments.at(-1)!.liftPhase='boarding'
      segments.at(-1)!.liftApron=officeLiftApproachDistance(scene,cursorFloor)
      leg(cursor,'hold',650,'closing')
    }else if(Math.abs(cursor.x-nav.shaftX)>.01){
      step({x:nav.shaftX,y:cursor.y});segments.at(-1)!.liftPhase='boarding'
      segments.at(-1)!.liftApron=officeLiftApproachDistance(scene,cursorFloor)
    }
    leg({x:nav.shaftX,y:landing.y},'ride',Math.max(1,Math.abs(cursor.y-landing.y)/(80*nav.scale)*1000),'riding')
    cursorFloor=publicFloor
    leg(cursor,'hold',650,'opening');const count=segments.length;step(landing);step(aisle)
    if(count===segments.length)leg(cursor,'hold',280,'alighting');else segments[count].liftPhase='alighting'
    segments[count].liftApron=officeLiftApproachDistance(scene,cursorFloor)
  }
  if(targetFloor?.annexOf){
    const threshold=officeInteriorDoor(scene,targetFloor.id)!
    if(!targetFloor.desktopArt)walk({x:cursor.x,y:landing.y})
    walk(threshold);leg(cursor,'hold',280,undefined,[1,0])
    cursorFloor=actor.floorId;cursor=officeInteriorDoor(scene,targetFloor.id,'annex')!
    leg(cursor,'hold',280,undefined,[0,1])
  }else cursorFloor=actor.floorId
  if(!targetFloor?.desktopArt)walk({x:actor.x,y:aisle.y})
  walk(actor);leg(actor,'hold',300)
  if(frame.pose.opacity!==undefined&&frame.pose.opacity<1&&segments.length)segments[0].opacity=[frame.pose.opacity,segments[0].opacity?.[1]??1]
  return {...trip,actor,segments,startedAt:now,endsAt:now+segments.reduce((n,s)=>n+s.duration,0),shaftX:nav.shaftX,rungPitch:nav.rungPitch}
}

export function advanceOfficeArrivals(existing:ReadonlyMap<string,OfficeTrip>,scene:OfficeScene,now:number,lift?:OfficeLiftState,target:OfficeScene=scene) {
  const trips=new Map<string,OfficeTrip>(),completed:OfficeTrip[]=[]
  const changed=[...existing].some(([key,trip])=>{
    const actor=target.actors.find(a=>a.key===key&&!a.hidden)
    const missingReservation=lift&&now<trip.endsAt&&trip.segments.some(s=>s.liftPhase)&&!lift.reservations.some(leg=>leg.actorKey===key&&leg.end>now)
    return missingReservation||!actor||actor.floorId!==trip.actor.floorId||actor.x!==trip.actor.x||actor.y!==trip.actor.y
  })
  const car=lift??createOfficeLift(target)
  if(changed)cancelOfficeLiftTrips(car,new Set(existing.keys()),now)
  for(const [key,previous] of existing){
    const actor=target.actors.find(a=>a.key===key&&!a.hidden)
    if(!actor)continue
    const revised=changed&&now<previous.endsAt?retarget(previous,actor,target,now):previous
    const trip=changed&&now<previous.endsAt?reserveOfficeLiftTrip(car,revised,target,now):previous
    if(now>=trip.endsAt)completed.push(trip)
    else trips.set(key,trip)
  }
  restoreOfficeLiftCall(car,target,now)
  return {trips,completed}
}

/** Used by both canvas and DOM: waiting newcomers are absent, entering people use their path position. */
export function officeActorsWithArrivals(scene:OfficeScene,trips:ReadonlyMap<string,OfficeTrip>,now:number):OfficeActor[] {
  return scene.actors.flatMap(actor=>{
    const trip=trips.get(actor.key)
    if(!trip)return [actor]
    if(now<trip.startedAt)return []
    const frame=officeTripFrame(trip,now)
    return [{...actor,...frame.point,floorId:frame.floorId??actor.floorId,stand:true,pose:{...frame.pose,lead:actor.agent.role==='lead'}}]
  })
}
