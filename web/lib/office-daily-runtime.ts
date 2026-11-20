import type {OfficeActor,OfficeFloor,OfficeScene} from './office-types'
import {advanceOfficeDailyLedger,emptyOfficeDailyLedger,markOfficeDailyAttendance,officeDailyActorEligible,officeDailyWindow,planOfficeDailyEvents,readOfficeDailyLedger,type OfficeDailyInvitation,type OfficeDailyLedger} from './office-daily-events'
import {OFFICE_CANTEEN_ID,OFFICE_CANTEEN_SEATS,OFFICE_DAILY_SEATS,officeGardenOccupiedSeats,projectOfficeDailyScene} from './office-daily-scene'
import {createOfficeRoutineTrip,type OfficeRoutineTarget} from './office-daily-trips'
import {officeTripFrame,type OfficeTrip} from './office-motion'
import {cancelOfficeLiftTrips,reserveOfficeLiftTrip,type OfficeLiftState} from './office-lift'
import {officeNavigation} from './office-navigation'
import {skyWeather,type Weather} from './office-sky'
import {emptyOfficeOutingSchedule,planOfficeRestOutings,markOfficeRestOutingAdmission,type OfficeOutingAction} from './office-rest-outings'
import {createOfficeOutingTrip,createOfficeShopServiceTrip,officeOutingVendorPoint} from './office-outing-trips'
import {officeDaylight} from './office-daylight'
import {officeVendorPickupProgress,officeVendorPickupFinished} from './office-vendor'

import {officeShopQueue,officeShopWaitingPoints} from './office-shop-queue'
import type {OfficeLiveliness} from './office-liveliness'

export type OfficeDailyPhase='outbound'|'eating'|'relocating'|'returning'
export interface OfficeDailyRuntimeGuest extends Omit<OfficeDailyInvitation,'kind'> {
 kind:OfficeDailyInvitation['kind']|'outing'
 outing?:{action:OfficeOutingAction;night:boolean;dwellMs:number;collected:boolean;sharingUntil?:number;sharingWith?:string}
 phase:OfficeDailyPhase; home:OfficeActor; physical:OfficeActor; trip:OfficeTrip|null; until:number
 returnNeeded:boolean; indoorNeeded:boolean
 gardenSeatNeeded?:number
 restStartedAt?:number
 shop?:{stage:'arriving'|'waiting'|'serving'|'seating';slot?:number;order:number;arrivedAt:number|null}
}
export interface OfficeDailyRuntimeInput {
 source:OfficeScene; scene:OfficeScene; date:Date; at:number; lift:OfficeLiftState
 blocked:boolean; preemptQueuedTravel?:boolean; busyKeys:ReadonlySet<string>; weather?:Weather; liveliness?:OfficeLiveliness; onLiftCancelled?:(keys:readonly string[])=>void
}
export const OFFICE_DAILY_STORAGE='agent-flow-office-daily-v1'

/** Coordinates cosmetic ownership. Source snapshots remain authoritative and untouched. */
export class OfficeDailyRuntime {
 ledger:OfficeDailyLedger
 readonly guests=new Map<string,OfficeDailyRuntimeGuest>()
 readonly completedOrigins=new Map<string,OfficeActor>()
 canteenOpen=false
 outingSchedule=emptyOfficeOutingSchedule()
 private retained:OfficeScene|null=null
 private shopSequence=0

 shopQueue(scene:OfficeScene){
  return officeShopQueue(scene,[...this.guests.values()].flatMap(g=>g.shop&&!g.returnNeeded&&!g.indoorNeeded&&g.shop.stage!=='seating'?[{actorKey:g.actorKey,order:g.shop.order,arrivedAt:g.shop.arrivedAt,serving:g.shop.stage==='serving',slot:g.shop.slot}]:[]))
 }
 constructor(ledger:unknown=emptyOfficeDailyLedger()){this.ledger=readOfficeDailyLedger(ledger)}

 /** Keep occupied geometry while source rooms disappear or newcomers append below it. */
 project(base:OfficeScene):OfficeScene {
  if(!this.canteenOpen)base=projectOfficeDailyScene(base,{canteenOpen:false})
  let result=base
  const retained=this.retained&&(this.canteenOpen?this.retained:projectOfficeDailyScene(this.retained,{canteenOpen:false}))
  if(retained&&this.guests.size){
   const floors:OfficeFloor[]=retained.floors.filter(f=>f.kind!=='quiet').map(old=>({...old,...base.floors.find(f=>f.id===old.id),y:old.y,height:old.height,actorKeys:[]}))
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
   const walking=frame&&!frame.done&&at>=g.trip!.startedAt
   const waiting=frame&&!frame.done&&at<g.trip!.startedAt
   const eating=g.phase==='eating'&&!g.returnNeeded
   const sharing=g.outing?.sharingUntil!==undefined&&at<g.outing.sharingUntil
   const action=g.outing?.action
   const smooth=(value:number)=>{const k=Math.max(0,Math.min(1,value));return k*k*(3-2*k)}
   const seatBlend=eating?Math.min(smooth((at-(g.restStartedAt??at))/350),smooth((g.until-at)/350)):0
   const restPose=action==='stretch'?{sit:false,mug:false,stretch:Math.max(0,Math.sin(at/1000*Math.PI/4))}:
    action==='stargaze'?{sit:true,mug:false,lookUp:true,turn:Math.sin(at/5000)*.15}:
    {sit:true,objectAction:action==='snack'||g.kind==='lunch'?'snack' as const:'coffee' as const,mug:action!=='snack'&&g.kind!=='lunch'}
   const outingActivity=action==='snack'?'is enjoying a snack':action==='drink'?'is enjoying a warm drink':action==='stretch'?'is stretching their legs':'is watching the stars'
   return {...canonical,...g.physical,...(frame?frame.point:{}),floorId:frame?.floorId??g.physical.floorId,
    agent:canonical.agent,task:canonical.task,hidden:false,zone:g.returnNeeded?canonical.zone:'lounge',party:false,stand:Boolean(walking||waiting||eating&&action==='stretch'),
    activity:sharing?(g.outing?.sharingWith?'is sharing snacks with a teammate':'is putting the snacks away'):eating?(g.outing?outingActivity:g.kind==='lunch'?'is enjoying lunch':g.kind==='coffee'?'is taking a coffee break':'is having afternoon tea'):g.trip?.caption??(g.returnNeeded?'is returning':g.shop?.stage==='waiting'?'is waiting at the shop':'is waiting for a short break'),
    pose:sharing?{sit:true,hand:false,offer:.6,mug:false,objectAction:'snack'}:walking?{...frame.pose,...(action==='drink'?{mug:true}:{})}:waiting?{walk:false,sit:false}:eating?{...restPose,seatBlend}:{sit:false,mug:false}}
  })
 }

 art(date:Date,scene:OfficeScene,at:number){
  const window=officeDailyWindow(date),actors=this.actors(scene,at)
  return {kind:window.kind,delivery:window.delivery,cleanup:window.cleanup,shopQueue:this.shopQueue(scene),guests:[...this.guests.values()].map(g=>{const actor=actors.find(a=>a.key===g.actorKey)!;return {actorKey:g.actorKey,kind:g.kind,phase:g.phase,floorId:actor.floorId,x:actor.x,y:actor.y,seat:g.seat,action:g.outing?.action,collected:g.outing?.collected,pickupProgress:g.outing?.action==='snack'?(officeVendorPickupProgress(scene,g.trip,at)??undefined):undefined,night:g.outing?g.outing.night||officeDaylight(date).night:undefined}})}
 }

 sharingPeer(scene:OfficeScene,at:number,actors:readonly OfficeActor[]=scene.actors):string|null {
  for(const guest of this.guests.values()){
   if(!guest.outing?.sharingWith||guest.outing.sharingUntil===undefined||at>=guest.outing.sharingUntil)continue
   const peer=actors.find(a=>a.key===guest.outing!.sharingWith)
   if(peer&&peer.sessionId===guest.home.sessionId&&peer.floorId===guest.physical.floorId&&!peer.pose?.walk&&!peer.pose?.inLift&&officeDailyActorEligible(peer,scene))return peer.key
  }
  return null
 }

 shiftMotion(delta:number):void {
  for(const guest of this.guests.values()){
   if(guest.trip)guest.trip={...guest.trip,startedAt:guest.trip.startedAt+delta,endsAt:guest.trip.endsAt+delta}
   if(guest.shop?.arrivedAt!==undefined&&guest.shop.arrivedAt!==null)guest.shop.arrivedAt+=delta
  }
 }

 private target(scene:OfficeScene,g:OfficeDailyRuntimeGuest):OfficeRoutineTarget|null {
  if(g.destination==='home'){
   const actor=scene.actors.find(a=>a.key===g.actorKey)??g.home
   return {floorId:actor.floorId,x:actor.x+(g.outing?0:24*scene.width/450),y:actor.y}
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
   if(!canonical||!officeDailyActorEligible(canonical,source)||(g.kind==='outing'?Boolean(window.kind):window.occurrenceKey!==g.occurrenceKey)||input.busyKeys.has(g.actorKey))g.returnNeeded=true
   if(g.outing?.action==='snack'&&!g.outing.collected&&officeDaylight(date).night)g.returnNeeded=true
   if(g.returnNeeded)g.shop=undefined
  }
  const gardenGuests=[...this.guests.values()].filter(g=>g.destination==='garden')
  const partySeats=officeGardenOccupiedSeats(source,new Set(this.guests.keys())),reserved=new Set(partySeats)
  for(const g of gardenGuests)if(!partySeats.has(g.gardenSeatNeeded??g.seat))reserved.add(g.gardenSeatNeeded??g.seat)
  for(const g of gardenGuests){
   if(g.returnNeeded||g.phase==='returning')continue
   if(wet){g.indoorNeeded=true;g.gardenSeatNeeded=undefined;g.shop=undefined;continue}
   if(!partySeats.has(g.gardenSeatNeeded??g.seat))continue
   const seat=[0,1,2,3].find(s=>!reserved.has(s))
   if(seat===undefined){g.indoorNeeded=true;g.gardenSeatNeeded=undefined}
   else{reserved.add(seat);if(g.shop&&g.shop.stage!=='seating'){g.seat=seat;g.gardenSeatNeeded=undefined}else g.gardenSeatNeeded=seat}
  }
  for(const g of this.guests.values()){
   if(g.outing?.sharingUntil!==undefined){
    const canonical=source.actors.find(a=>a.key===g.actorKey)
    if(canonical&&officeDailyActorEligible(canonical,source)&&!window.kind&&!input.busyKeys.has(g.actorKey)){
     if(at<g.outing.sharingUntil)continue
     this.completedOrigins.set(g.actorKey,g.physical);this.guests.delete(g.actorKey);continue
    }
    g.outing.sharingUntil=undefined
   }
   if(g.trip&&g.phase!=='returning'&&at<g.trip.endsAt&&(g.returnNeeded||g.indoorNeeded||g.gardenSeatNeeded!==undefined||input.preemptQueuedTravel&&g.trip.segments.some(segment=>segment.liftPhase))){
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
    const vendor=g.outing?.action==='snack'&&(g.phase==='outbound'||g.phase==='relocating')?officeOutingVendorPoint(geometry):null
    if(vendor&&!wet&&!officeDaylight(date).night&&!g.returnNeeded&&officeVendorPickupFinished(geometry,g.trip,at))g.outing!.collected=true
    if(!frame.done)continue // A passenger clears the shared car before changing plans.
    if(g.shop?.stage==='arriving'&&!g.returnNeeded&&!g.indoorNeeded){
     g.shop.arrivedAt=g.trip.endsAt;g.shop.stage='waiting';g.trip=null;continue
    }
    if(g.shop?.stage==='serving'&&!g.returnNeeded&&!g.indoorNeeded){
     g.trip=null
     if(g.outing?.collected){g.shop.stage='seating';const target=this.target(geometry,g);if(target)this.start(g,geometry,target,at,lift,g.phase,'is taking a snack to the garden seat')}
     continue
    }
    if(g.phase==='returning'){
     const latest=geometry.actors.find(a=>a.key===g.actorKey&&!a.hidden)
     if(!latest||(latest.floorId===g.physical.floorId&&Math.hypot(latest.x-g.physical.x,latest.y-g.physical.y)<1)){
      if(g.outing?.action==='snack'&&g.outing.collected&&latest&&officeDailyActorEligible(latest,geometry)&&!window.kind&&!input.busyKeys.has(g.actorKey)){
       const visitors=new Map(this.actors(geometry,at).map(a=>[a.key,a]))
       g.outing.sharingWith=geometry.actors.map(a=>visitors.get(a.key)??a).find(a=>a.key!==g.actorKey&&a.sessionId===g.home.sessionId&&a.floorId===g.physical.floorId&&!a.pose?.walk&&!a.pose?.inLift&&officeDailyActorEligible(a,geometry))?.key
       g.outing.sharingUntil=at+4500;g.trip=null;continue
      }
      this.completedOrigins.set(g.actorKey,g.physical);this.guests.delete(g.actorKey);continue
     }
    }else{g.phase='eating';g.restStartedAt=at;if(g.until===0)g.until=at+(g.outing?.dwellMs??(g.kind==='lunch'?60_000+(hash(g.actorKey)%61)*1000:18_000));g.trip=null}
   }
   if(g.shop?.stage==='waiting'&&!g.returnNeeded&&!g.indoorNeeded)continue
   if(g.phase==='eating'&&at>=g.until)g.returnNeeded=true
   // A canceled cosmetic arrival waits until real lift travel clears. Rebuilding
   // it now would only cancel and re-reserve the same trip on the next frame.
   if(input.preemptQueuedTravel&&!g.trip&&!g.returnNeeded&&!g.indoorNeeded)continue
   if(input.blocked&&!g.returnNeeded&&!g.indoorNeeded&&g.gardenSeatNeeded===undefined&&!(g.outing?.action==='snack'&&!g.outing.collected&&g.destination==='garden'&&!g.trip))continue
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
    if(g.outing){
     const priorDestination=g.destination;g.destination='home'
     const target=this.target(geometry,g)
     if(target&&this.start(g,geometry,target,at,lift,'relocating','is heading inside for a quiet break')){
      g.indoorNeeded=false;g.gardenSeatNeeded=undefined
      if(g.outing.action==='snack'||g.outing.action==='stargaze')g.outing.action='drink'
     }else g.destination=priorDestination
     continue
    }
    this.canteenOpen=true
    geometry=this.project(input.scene)
    const seats=new Set([...this.guests.values()].filter(a=>a!==g&&a.destination==='canteen').map(a=>a.seat))
    const seat=[0,1,2,3].find(s=>!seats.has(s))
    if(seat!==undefined){g.indoorNeeded=false;g.destination='canteen';g.seat=seat;const target=this.target(geometry,g);if(target)this.start(g,geometry,target,at,lift,'relocating','is bringing lunch indoors')}
   }else if(!g.trip&&g.phase!=='eating'){const target=this.target(geometry,g);if(target)this.start(g,geometry,target,at,lift,g.phase,g.kind==='lunch'?'is collecting lunch':'is getting a drink')}
  }
  const serviceKey=this.shopQueue(geometry).serviceKey
  const shopper=serviceKey?this.guests.get(serviceKey):undefined
  if(shopper?.shop?.stage==='waiting'&&!wet&&!officeDaylight(date).night){
   const trip=createOfficeShopServiceTrip(geometry,shopper.actorKey,at,shopper.physical)
   if(trip){shopper.trip=trip;shopper.shop.stage='serving';shopper.shop.slot=undefined}
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
    this.ledger=markOfficeDailyAttendance(this.ledger,date,invite.kind,g.actorKey)
   }
  }
  const outings=planOfficeRestOutings({date,at,scene:source,state:this.outingSchedule,busyKeys:busy,guests:[...this.guests.values()].map(g=>({...g,seat:g.gardenSeatNeeded??g.seat})),weather,blocked:input.blocked,liveliness:input.liveliness})
  this.outingSchedule=outings.state
  for(const invite of outings.invitations){
   const home=geometry.actors.find(a=>a.key===invite.actorKey&&!a.hidden)
   if(!home||this.guests.has(invite.actorKey))continue
   const g:OfficeDailyRuntimeGuest={...invite,outing:{action:invite.action,night:invite.night,dwellMs:invite.dwellMs,collected:false},home,physical:home,phase:'outbound',trip:null,until:0,returnNeeded:false,indoorNeeded:false}
   const target=this.target(geometry,g)
   if(!target||!this.start(g,geometry,target,at,lift,'outbound',invite.destination==='home'?'is taking a quiet break inside':invite.action==='snack'?'is collecting a snack':invite.action==='drink'?'is taking a warm drink outside':invite.action==='stretch'?'is stepping out to stretch':'is heading out to watch the stars'))continue
   this.guests.set(g.actorKey,g);this.completedOrigins.delete(g.actorKey)
   this.outingSchedule=markOfficeRestOutingAdmission(this.outingSchedule,invite,at)
  }
  this.canteenOpen=[...this.guests.values()].some(g=>g.destination==='canteen'||g.kind!=='outing'&&g.indoorNeeded||g.physical.floorId===OFFICE_CANTEEN_ID||g.trip?.segments.some(s=>s.floorId===OFFICE_CANTEEN_ID))
  if(this.guests.size){this.retained=this.project(input.scene)}else{this.retained=null;this.canteenOpen=false}
 }

 private start(g:OfficeDailyRuntimeGuest,scene:OfficeScene,target:OfficeRoutineTarget,at:number,lift:OfficeLiftState,phase:OfficeDailyPhase,caption:string){
  const visible={...scene,actors:scene.actors.map(a=>a.key===g.actorKey?{...a,hidden:false}:a)}
  const needsShop=g.outing?.action==='snack'&&!g.outing.night&&!g.outing.collected&&g.destination==='garden'&&(phase==='outbound'||phase==='relocating')
  if(needsShop&&(!g.shop||g.shop.stage==='arriving')){
   const occupied=new Set([...this.guests.values()].flatMap(guest=>guest!==g&&guest.shop?.slot!==undefined&&!guest.returnNeeded&&!guest.indoorNeeded?[guest.shop.slot]:[]))
   const slot=g.shop?.slot??[0,1].find(index=>!occupied.has(index)),waiting=slot===undefined?undefined:officeShopWaitingPoints(scene)[slot]
   if(!waiting)return false
   const arrival=createOfficeRoutineTrip(visible,g.actorKey,waiting,at,'is joining the shop queue',{...g.physical,hidden:false})
   if(!arrival)return false
   g.shop={stage:'arriving',slot,order:g.shop?.order??this.shopSequence++,arrivedAt:null}
   g.trip=reserveOfficeLiftTrip(lift,arrival,scene,at);g.phase=phase;return true
  }
  const trip=g.outing&&(phase==='outbound'||phase==='relocating'&&g.destination==='garden')&&!g.outing.collected?createOfficeOutingTrip(visible,g.actorKey,target,at,g.outing.action,g.outing.night,{...g.physical,hidden:false}):createOfficeRoutineTrip(visible,g.actorKey,target,at,caption,{...g.physical,hidden:false})
  if(!trip)return false
  g.trip=reserveOfficeLiftTrip(lift,{...trip,caption},scene,at);g.phase=phase
  return true
 }
}
const hash=(key:string)=>{let result=0;for(const char of key)result=(result*31+char.charCodeAt(0))>>>0;return result}
