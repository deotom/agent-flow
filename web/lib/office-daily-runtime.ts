import type {OfficeActor,OfficeFloor,OfficeScene} from './office-types'
import {advanceOfficeDailyLedger,emptyOfficeDailyLedger,markOfficeDailyAttendance,officeDailyActorEligible,officeDailyWindow,planOfficeDailyEvents,readOfficeDailyLedger,type OfficeDailyInvitation,type OfficeDailyLedger} from './office-daily-events'
import {OFFICE_CANTEEN_ID,OFFICE_CANTEEN_SEATS,OFFICE_DAILY_SEATS,officeGardenOccupiedSeats,projectOfficeDailyScene} from './office-daily-scene'
import {createOfficeRoutineTrip,type OfficeRoutineTarget} from './office-daily-trips'
import {officeTripFrame,type OfficeTrip} from './office-motion'
import {cancelOfficeLiftTrips,reserveOfficeLiftTrip,type OfficeLiftState} from './office-lift'
import {officeNavigation} from './office-navigation'
import {skyWeather,type Weather} from './office-sky'

export type OfficeDailyPhase='outbound'|'eating'|'relocating'|'returning'
export interface OfficeDailyRuntimeGuest extends OfficeDailyInvitation {
 phase:OfficeDailyPhase; home:OfficeActor; physical:OfficeActor; trip:OfficeTrip|null; until:number
 returnNeeded:boolean; indoorNeeded:boolean
 gardenSeatNeeded?:number
}
export interface OfficeDailyRuntimeInput {
 source:OfficeScene; scene:OfficeScene; date:Date; at:number; lift:OfficeLiftState
 blocked:boolean; preemptQueuedTravel?:boolean; busyKeys:ReadonlySet<string>; weather?:Weather; onLiftCancelled?:(keys:readonly string[])=>void
}
export const OFFICE_DAILY_STORAGE='agent-flow-office-daily-v1'

/** Coordinates cosmetic ownership. Source snapshots remain authoritative and untouched. */
export class OfficeDailyRuntime {
 ledger:OfficeDailyLedger
 readonly guests=new Map<string,OfficeDailyRuntimeGuest>()
 readonly completedOrigins=new Map<string,OfficeActor>()
 canteenOpen=false
 private retained:OfficeScene|null=null
 constructor(ledger:unknown=emptyOfficeDailyLedger()){this.ledger=readOfficeDailyLedger(ledger)}

 /** Keep occupied geometry while source rooms disappear or newcomers append below it. */
 project(base:OfficeScene):OfficeScene {
  if(!this.canteenOpen)base={...base,floors:base.floors.filter(f=>f.id!==OFFICE_CANTEEN_ID)}
  let result=base
  if(this.retained&&this.guests.size){
   const floors:OfficeFloor[]=this.retained.floors.filter(f=>f.kind!=='quiet'&&(this.canteenOpen||f.id!==OFFICE_CANTEEN_ID)).map(old=>({...old,...base.floors.find(f=>f.id===old.id),y:old.y,height:old.height,actorKeys:[]}))
   let bottom=Math.max(0,...floors.filter(f=>!f.annexOf).map(f=>f.y+(f.height??base.width*.5625)*.9))
   for(const floor of base.floors.filter(f=>!f.annexOf&&f.kind!=='quiet'))if(!floors.some(f=>f.id===floor.id)){floors.push({...floor,y:bottom});bottom+=(floor.height??base.width*.5625)*.9}
   for(const floor of base.floors.filter(f=>f.annexOf))if(!floors.some(f=>f.id===floor.id))floors.push({...floor,y:floors.find(f=>f.id===floor.annexOf)?.y??floor.y})
   const quiet=base.floors.find(f=>f.kind==='quiet')
   if(quiet){floors.push({...quiet,y:bottom});bottom+=(quiet.height??0)*.9}
   const actors=base.actors.map(actor=>{const from=base.floors.find(f=>f.id===actor.floorId),to=floors.find(f=>f.id===actor.floorId);return from&&to?{...actor,y:actor.y+to.y-from.y}:actor})
   for(const floor of floors)floor.actorKeys=actors.filter(a=>a.floorId===floor.id).map(a=>a.key)
   result={...base,floors,actors,height:Math.max(base.height,bottom+base.width/3)}
  }
  const projected=projectOfficeDailyScene(result,{canteenOpen:this.canteenOpen})
  const canteen=projected.floors.find(f=>f.id===OFFICE_CANTEEN_ID)
  if(canteen)for(const guest of this.guests.values())if(guest.destination==='canteen'&&!canteen.actorKeys.includes(guest.actorKey))canteen.actorKeys.push(guest.actorKey)
  return projected
 }

 actors(scene:OfficeScene,at:number):OfficeActor[] {
  return [...this.guests.values()].map(g=>{
   const canonical=scene.actors.find(a=>a.key===g.actorKey)??g.home
   const frame=g.trip?officeTripFrame(g.trip,at):null
   const walking=frame&&!frame.done
   const eating=g.phase==='eating'&&!g.returnNeeded
   return {...canonical,...g.physical,...(frame?frame.point:{}),floorId:frame?.floorId??g.physical.floorId,
    agent:canonical.agent,task:canonical.task,hidden:false,zone:g.returnNeeded?canonical.zone:'lounge',party:false,stand:walking?true:false,
    activity:eating?(g.kind==='lunch'?'is enjoying lunch':g.kind==='coffee'?'is taking a coffee break':'is having afternoon tea'):g.trip?.caption??'is returning',
    pose:walking?frame.pose:{sit:eating,objectAction:eating?(g.kind==='lunch'?'snack':'coffee'):undefined,mug:eating&&g.kind!=='lunch'}}
  })
 }

 art(date:Date,scene:OfficeScene,at:number){
  const window=officeDailyWindow(date),actors=this.actors(scene,at)
  return {kind:window.kind,delivery:window.delivery,cleanup:window.cleanup,guests:[...this.guests.values()].map(g=>{const actor=actors.find(a=>a.key===g.actorKey)!;return {actorKey:g.actorKey,kind:g.kind,phase:g.phase,floorId:actor.floorId,x:actor.x,y:actor.y,seat:g.seat}})}
 }

 shiftMotion(delta:number):void {
  for(const guest of this.guests.values())if(guest.trip)guest.trip={...guest.trip,startedAt:guest.trip.startedAt+delta,endsAt:guest.trip.endsAt+delta}
 }

 private target(scene:OfficeScene,g:OfficeDailyRuntimeGuest):OfficeRoutineTarget|null {
  if(g.destination==='home'){
   const actor=scene.actors.find(a=>a.key===g.actorKey)??g.home
   return {floorId:actor.floorId,x:actor.x+24*scene.width/450,y:actor.y}
  }
  const floor=scene.floors.find(f=>g.destination==='canteen'?f.id===OFFICE_CANTEEN_ID:f.kind==='lounge')
  if(!floor)return null
  const seat=(g.destination==='canteen'?OFFICE_CANTEEN_SEATS:OFFICE_DAILY_SEATS)[g.seat]
  return {floorId:floor.id,x:scene.width*seat[0],y:floor.y+(floor.height??scene.width*.5625)*seat[1]}
 }

 step(input:OfficeDailyRuntimeInput):void {
  const {source,date,at,lift}=input,weather=input.weather??skyWeather(date),wet=weather==='rain'||weather==='storm'
  const window=officeDailyWindow(date)
  let geometry=this.project(input.scene)
  // Release source-working participants before allocating the remaining meal seats.
  for(const g of this.guests.values()){
   const canonical=source.actors.find(a=>a.key===g.actorKey)
   if(!canonical||!officeDailyActorEligible(canonical,source)||window.occurrenceKey!==g.occurrenceKey||input.busyKeys.has(g.actorKey))g.returnNeeded=true
  }
  const gardenGuests=[...this.guests.values()].filter(g=>g.destination==='garden')
  const partySeats=officeGardenOccupiedSeats(source,new Set(this.guests.keys())),reserved=new Set(partySeats)
  for(const g of gardenGuests)if(!partySeats.has(g.gardenSeatNeeded??g.seat))reserved.add(g.gardenSeatNeeded??g.seat)
  for(const g of gardenGuests){
   if(g.returnNeeded||g.phase==='returning')continue
   if(wet){g.indoorNeeded=true;g.gardenSeatNeeded=undefined;continue}
   if(!partySeats.has(g.gardenSeatNeeded??g.seat))continue
   const seat=[0,1,2,3].find(s=>!reserved.has(s))
   if(seat===undefined){g.indoorNeeded=true;g.gardenSeatNeeded=undefined}
   else{reserved.add(seat);g.gardenSeatNeeded=seat}
  }
  for(const g of this.guests.values()){
   if(g.trip&&g.phase!=='returning'&&at<g.trip.endsAt&&(g.returnNeeded||g.indoorNeeded||g.gardenSeatNeeded!==undefined||input.preemptQueuedTravel)){
    let time=g.trip.startedAt,boarding=Infinity,clear=-Infinity
    for(const segment of g.trip.segments){if(segment.liftPhase){boarding=Math.min(boarding,time);clear=time+segment.duration}time+=segment.duration}
    if(at<boarding||at>=clear){
     const affected=cancelOfficeLiftTrips(lift,new Set([g.actorKey]),at)
     for(const key of new Set([g.actorKey,...affected])){
      const guest=this.guests.get(key)
      if(guest?.trip){const frame=officeTripFrame(guest.trip,at);guest.physical={...guest.physical,...frame.point,floorId:frame.floorId??guest.physical.floorId};guest.trip=null}
     }
     input.onLiftCancelled?.(affected.filter(key=>!this.guests.has(key)))
    }
   }
   if(g.trip){
    const frame=officeTripFrame(g.trip,at)
    g.physical={...g.physical,...frame.point,floorId:frame.floorId??g.physical.floorId,pose:frame.pose}
    if(!frame.done)continue // A passenger clears the shared car before changing plans.
    if(g.phase==='returning'){
     const latest=geometry.actors.find(a=>a.key===g.actorKey&&!a.hidden)
     if(!latest||(latest.floorId===g.physical.floorId&&Math.hypot(latest.x-g.physical.x,latest.y-g.physical.y)<1)){
      this.completedOrigins.set(g.actorKey,g.physical);this.guests.delete(g.actorKey);continue
     }
    }else{g.phase='eating';if(g.until===0)g.until=at+(g.kind==='lunch'?60_000+(hash(g.actorKey)%61)*1000:18_000);g.trip=null}
   }
   if(g.phase==='eating'&&at>=g.until)g.returnNeeded=true
   if(input.blocked&&!g.returnNeeded&&!g.indoorNeeded&&g.gardenSeatNeeded===undefined)continue
   if(g.returnNeeded){
    const home=geometry.actors.find(a=>a.key===g.actorKey&&!a.hidden)
    const fallback=geometry.floors.some(f=>f.id===g.home.floorId)?g.home:null
    const target=home??fallback??{floorId:geometry.floors.find(f=>f.kind==='lounge')?.id??'lounge',...officeNavigation(geometry).hatch}
    this.start(g,geometry,{floorId:target.floorId,x:target.x,y:target.y},at,lift,'returning','is returning to the office')
   }else if(g.gardenSeatNeeded!==undefined&&!g.indoorNeeded){
    const priorSeat=g.seat;g.seat=g.gardenSeatNeeded
    const target=this.target(geometry,g)
    if(target&&this.start(g,geometry,target,at,lift,'relocating','is moving to a free garden seat'))g.gardenSeatNeeded=undefined
    else g.seat=priorSeat
   }else if(g.indoorNeeded){
    this.canteenOpen=true
    geometry=this.project(input.scene)
    const seats=new Set([...this.guests.values()].filter(a=>a!==g&&a.destination==='canteen').map(a=>a.seat))
    const seat=[0,1,2,3].find(s=>!seats.has(s))
    if(seat!==undefined){g.indoorNeeded=false;g.destination='canteen';g.seat=seat;const target=this.target(geometry,g);if(target)this.start(g,geometry,target,at,lift,'relocating','is bringing lunch indoors')}
   }else if(!g.trip&&g.phase!=='eating'){const target=this.target(geometry,g);if(target)this.start(g,geometry,target,at,lift,g.phase,g.kind==='lunch'?'is collecting lunch':'is getting a drink')}
  }
  const busy=new Set([...input.busyKeys,...this.guests.keys()])
  const plan=planOfficeDailyEvents({date,scene:source,ledger:this.ledger,busyKeys:busy,guests:[...this.guests.values()].map(g=>({...g,seat:g.gardenSeatNeeded??g.seat})),weather})
  this.ledger=advanceOfficeDailyLedger(plan.ledger,date)
  if(!input.blocked){
   for(const invite of plan.invitations){
    const home=geometry.actors.find(a=>a.key===invite.actorKey&&!a.hidden)
    if(!home)continue
    const g:OfficeDailyRuntimeGuest={...invite,home,physical:home,phase:'outbound',trip:null,until:0,returnNeeded:false,indoorNeeded:false}
    if(g.destination==='canteen'){this.canteenOpen=true;geometry=this.project(input.scene)}
    const target=this.target(geometry,g)
    if(!target||!this.start(g,geometry,target,at,lift,'outbound',g.kind==='lunch'?'is collecting lunch':g.kind==='coffee'?'is getting coffee':'is getting afternoon tea'))continue
    this.guests.set(g.actorKey,g)
    this.completedOrigins.delete(g.actorKey)
    this.ledger=markOfficeDailyAttendance(this.ledger,date,g.kind,g.actorKey)
   }
  }
  this.canteenOpen=[...this.guests.values()].some(g=>g.destination==='canteen'||g.indoorNeeded||g.physical.floorId===OFFICE_CANTEEN_ID||g.trip?.segments.some(s=>s.floorId===OFFICE_CANTEEN_ID))
  if(this.guests.size){this.retained=this.project(input.scene)}else{this.retained=null;this.canteenOpen=false}
 }

 private start(g:OfficeDailyRuntimeGuest,scene:OfficeScene,target:OfficeRoutineTarget,at:number,lift:OfficeLiftState,phase:OfficeDailyPhase,caption:string){
  const visible={...scene,actors:scene.actors.map(a=>a.key===g.actorKey?{...a,hidden:false}:a)}
  const trip=createOfficeRoutineTrip(visible,g.actorKey,target,at,caption,{...g.physical,hidden:false})
  if(!trip)return false
  g.trip=reserveOfficeLiftTrip(lift,trip,scene,at);g.phase=phase
  return true
 }
}
const hash=(key:string)=>{let result=0;for(const char of key)result=(result*31+char.charCodeAt(0))>>>0;return result}
