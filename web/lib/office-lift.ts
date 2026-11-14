import type { OfficeScene } from './office-types'
import type { OfficeTrip, OfficeTripSegment } from './office-motion'
import { officeNavigation } from './office-navigation'

interface LiftLeg { start:number; end:number; fromY:number; toY:number; fromDoor:number; toDoor:number; actorKey?:string; passenger?:string }
export interface OfficeLiftState { gardenCallPending?:boolean; y:number; doorsOpen:number; availableAt:number; reservations:LiftLeg[] }
export interface OfficeLiftFrame { y:number; doorsOpen:number; moving:boolean; passengerKeys:readonly string[] }
export function createOfficeLift(scene:OfficeScene):OfficeLiftState {
 return {y:officeNavigation(scene).hatch.y,doorsOpen:0,availableAt:0,reservations:[]}
}
/** One physical car. Coordinates are retained during relayout; a retarget starts from this exact position. */
export function officeLiftFrame(lift:OfficeLiftState,now:number,_scene?:OfficeScene):OfficeLiftFrame {
 let y=lift.y,doorsOpen=lift.doorsOpen
 for(const leg of lift.reservations){
  if(now<leg.start)break
  const ratio=Math.max(0,Math.min(1,(now-leg.start)/Math.max(1,leg.end-leg.start)))
  y=leg.fromY+(leg.toY-leg.fromY)*ratio;doorsOpen=leg.fromDoor+(leg.toDoor-leg.fromDoor)*ratio
  if(now<leg.end)return {y,doorsOpen,moving:leg.fromY!==leg.toY,passengerKeys:leg.passenger?[leg.passenger]:[]}
 }
 return {y,doorsOpen,moving:false,passengerKeys:[]}
}
export function advanceOfficeLift(lift:OfficeLiftState,now:number):void {
 const finished=lift.reservations.filter(leg=>leg.end<=now)
 const last=finished.at(-1)
 if(last){lift.y=last.toY;lift.doorsOpen=last.toDoor}
 if(finished.some(leg=>!leg.actorKey&&leg.toDoor===1))lift.gardenCallPending=false
 lift.reservations=lift.reservations.filter(leg=>leg.end>now)
}
export function shiftOfficeLiftTime(lift:OfficeLiftState,delta:number):void {
 lift.availableAt+=delta
 for(const leg of lift.reservations){leg.start+=delta;leg.end+=delta}
}
/** Cancel the affected suffix. Callers re-reserve surviving queued trips from their current actor frames. */
export function cancelOfficeLiftTrips(lift:OfficeLiftState,keys:ReadonlySet<string>,now:number):string[] {
 const index=lift.reservations.findIndex(leg=>leg.actorKey&&keys.has(leg.actorKey)&&leg.end>now)
 if(index<0)return []
 const cut=Math.max(now,lift.reservations[index].start),frame=officeLiftFrame(lift,cut)
 const affected=[...new Set(lift.reservations.slice(index).flatMap(leg=>leg.actorKey?[leg.actorKey]:[]))]
 const prefix=lift.reservations.filter(leg=>leg.end<=cut)
 lift.reservations=prefix
 if(cut<=now){lift.y=frame.y;lift.doorsOpen=frame.doorsOpen;lift.reservations=[]}
 lift.availableAt=Math.max(now,prefix.at(-1)?.end??now)
 return affected
}
/** Reserve a whole trip, inserting closed-door empty pickup travel before every boarding. */
export function reserveOfficeLiftTrip(lift:OfficeLiftState,trip:OfficeTrip,scene:OfficeScene,now:number):OfficeTrip {
 if(!trip.segments.some(segment=>segment.liftPhase))return trip
 advanceOfficeLift(lift,now)
 const startedAt=Math.max(trip.startedAt,now,lift.availableAt),segments:OfficeTripSegment[]=[]
 let time=startedAt
 const tail=lift.reservations.at(-1)
 let carY=tail?.toY??lift.y,door=tail?.toDoor??lift.doorsOpen
 const scale=officeNavigation(scene).scale
 const carLeg=(duration:number,toY:number,toDoor:number,passenger?:string)=>{
  if(duration<=0)return
  lift.reservations.push({start:time,end:time+duration,fromY:carY,toY,fromDoor:door,toDoor,actorKey:trip.actorKey,passenger})
  time+=duration;carY=toY;door=toDoor
 }
 for(const segment of trip.segments){
  if(segment.liftPhase==='riding'&&door>0){
   const duration=650*door
   segments.push({from:{...segment.from},to:{...segment.from},duration,kind:'hold',floorId:segment.floorId,liftPhase:'closing'})
   carLeg(duration,carY,0,trip.actorKey)
  }
  if(segment.liftPhase==='boarding'){
   const waitStart=time
   if(Math.abs(carY-segment.from.y)>.01){
    if(door>0)carLeg(650,carY,0)
    carLeg(Math.abs(carY-segment.from.y)/(80*scale)*1000,segment.from.y,0)
   }
   if(door<1)carLeg(650,carY,1)
   if(time>waitStart)segments.push({from:{...segment.from},to:{...segment.from},duration:time-waitStart,kind:'hold',floorId:segment.floorId})
  }
  segments.push(segment)
  if(segment.liftPhase){
   const phase=segment.liftPhase
   carLeg(segment.duration,phase==='riding'?segment.to.y:carY,phase==='closing'?0:phase==='opening'?1:door,phase==='boarding'||phase==='alighting'?undefined:trip.actorKey)
  }else time+=segment.duration
 }
 // Close after the person has cleared the threshold, before the next empty pickup.
 if(door>0){carLeg(650,carY,0);segments.push({from:{...segments.at(-1)!.to},to:{...segments.at(-1)!.to},duration:650,kind:'hold',floorId:segments.at(-1)!.floorId,opacity:segments.at(-1)!.opacity})}
 lift.availableAt=time
 return {...trip,segments,startedAt,endsAt:time}
}

/** A garden button call joins the existing itinerary without interrupting passengers. */
export function callOfficeLiftToGarden(lift:OfficeLiftState,scene:OfficeScene,now:number):void {
 advanceOfficeLift(lift,now)
 lift.gardenCallPending=true
 const nav=officeNavigation(scene),tail=lift.reservations.at(-1)
 if(tail&&!tail.actorKey&&tail.toY===nav.hatch.y&&tail.toDoor===1)return
 let time=Math.max(now,lift.availableAt),y=tail?.toY??lift.y,door=tail?.toDoor??lift.doorsOpen
 const leg=(duration:number,toY:number,toDoor:number)=>{
  lift.reservations.push({start:time,end:time+duration,fromY:y,toY,fromDoor:door,toDoor})
  time+=duration;y=toY;door=toDoor
 }
 if(door>0)leg(650,y,0)
 if(Math.abs(y-nav.hatch.y)>.01)leg(Math.abs(y-nav.hatch.y)/(80*nav.scale)*1000,nav.hatch.y,0)
 leg(650,y,1);lift.availableAt=time
}

/** Retargeting can replace a reservation suffix; keep the user's outstanding call. */
export function restoreOfficeLiftCall(lift:OfficeLiftState,scene:OfficeScene,now:number):void {
 advanceOfficeLift(lift,now)
 if(lift.gardenCallPending&&!lift.reservations.some(leg=>!leg.actorKey&&leg.toDoor===1&&leg.end>now))callOfficeLiftToGarden(lift,scene,now)
}

/** Manual closure shares the same timeline and never closes on a reserved passenger. */
export function closeOfficeLiftGardenDoor(lift:OfficeLiftState,scene:OfficeScene,now:number):boolean {
 const nav=officeNavigation(scene),frame=officeLiftFrame(lift,now)
 if(Math.abs(frame.y-nav.hatch.y)>2*nav.scale||lift.reservations.some(leg=>leg.actorKey&&leg.end>now))return false
 lift.y=frame.y;lift.doorsOpen=frame.doorsOpen;lift.reservations=[];lift.availableAt=now;lift.gardenCallPending=false
 const duration=650*frame.doorsOpen
 if(duration>0){lift.reservations.push({start:now,end:now+duration,fromY:frame.y,toY:frame.y,fromDoor:frame.doorsOpen,toDoor:0});lift.availableAt+=duration}
 return true
}
