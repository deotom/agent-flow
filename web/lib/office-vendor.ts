import { officeDaylight } from './office-daylight'
import { officeSky } from './office-sky'
import type {OfficeDailyVisual,OfficeFloor,OfficeLeisureAction,OfficePoint,OfficeScene} from './office-types'
import type {OfficeTrip} from './office-motion'
import {officeOutingVendorPoint} from './office-outing-trips'

/** Cosmetic shop hours; never authorizes trips, pickups or transactions. */
export function officeVendorState(date: Date) {
  const sky = officeSky(date), night = officeDaylight(date).night
  const wet = sky.weather === 'rain' || sky.weather === 'storm'
  return {
    night, wet, season: sky.season, weather: sky.weather,
    open: !night && !wet,
    staffed: !night,
    sign: night ? 'closed' as const : wet ? 'sheltered' as const : 'open' as const,
  }
}

/** Only the cosmetic cart interaction is closed; indoor drinks and picnic seats are independent. */
export function officeVendorAllowsObject(date:Date,floor:OfficeFloor['kind'],action:OfficeLeisureAction):boolean {
  return floor!=='lounge'||action!=='coffee'||officeVendorState(date).open
}

export interface OfficeVendorExchange {
  actorKey: string
  customer: OfficePoint
  /** Progress through the real trip's one pickup hold, never a repeating animation clock. */
  progress: number
}

/** Read the existing cart stop without extending the trip or marking a transaction. */
function pickupWindow(scene:OfficeScene,trip:OfficeTrip|null|undefined):{start:number;end:number}|null {
  const point=officeOutingVendorPoint(scene)
  if(!point||!trip||trip.event.kind!=='routine'||!Number.isFinite(trip.startedAt)||!Number.isFinite(scene.width)||scene.width<=0)return null
  let start=trip.startedAt
  for(const segment of trip.segments){
    if(!Number.isFinite(segment.duration)||segment.duration<=0)return null
    const tolerance=2*scene.width/450
    if(segment.kind==='hold'&&segment.duration===1400&&!segment.liftPhase&&!segment.opacity&&segment.floorId===point.floorId&&
        Math.hypot(segment.from.x-point.x,segment.from.y-point.y)<tolerance&&
        Math.hypot(segment.to.x-point.x,segment.to.y-point.y)<tolerance&&
        Math.hypot(segment.to.x-segment.from.x,segment.to.y-segment.from.y)<.01)return {start,end:start+segment.duration}
    start+=segment.duration
  }
  return null
}
export function officeVendorPickupProgress(scene:OfficeScene,trip:OfficeTrip|null|undefined,at:number):number|null {
 const window=pickupWindow(scene,trip)
 return window&&Number.isFinite(at)&&at>=window.start&&at<window.end?(at-window.start)/(window.end-window.start):null
}
export function officeVendorPickupFinished(scene:OfficeScene,trip:OfficeTrip|null|undefined,at:number):boolean {
 const window=pickupWindow(scene,trip)
 return Boolean(window&&Number.isFinite(at)&&at>=window.end)
}

/** One real recipient during the cart's physical pickup hold; derived anew for each frame. */
export function officeVendorExchange(scene:OfficeScene,date:Date,dailyVisual:OfficeDailyVisual|undefined):OfficeVendorExchange|null {
  if(!dailyVisual||!officeVendorState(date).open||!Number.isFinite(scene.width)||scene.width<=0)return null
  const point=officeOutingVendorPoint(scene)
  if(!point||![point.x,point.y].every(Number.isFinite))return null
  const tolerance=2*scene.width/450,actors=new Map(scene.actors.map(actor=>[actor.key,actor]))
  const candidates:OfficeVendorExchange[]=[]
  for(const guest of dailyVisual.guests){
    const progress=guest.pickupProgress
    if(guest.kind!=='outing'||guest.action!=='snack'||guest.night||!['outbound','relocating'].includes(guest.phase)||typeof progress!=='number'||!Number.isFinite(progress)||progress<0||progress>=1)continue
    const actor=actors.get(guest.actorKey),pose=actor?.pose
    if(!actor||actor.hidden||actor.party||actor.zone!=='lounge'||!['idle','done','cancelled'].includes(actor.agent.status)||
      pose?.walk||pose?.inLift||pose?.climb||pose?.sit||pose?.opacity!==undefined&&pose.opacity<.99||
      actor.floorId!==point.floorId||guest.floorId!==point.floorId)continue
    if(![actor.x,actor.y,guest.x,guest.y].every(Number.isFinite)||
      Math.hypot(actor.x-point.x,actor.y-point.y)>=tolerance||
      Math.hypot(guest.x-point.x,guest.y-point.y)>=tolerance||
      Math.hypot(actor.x-guest.x,actor.y-guest.y)>=tolerance)continue
    candidates.push({actorKey:actor.key,customer:{x:actor.x,y:actor.y},progress})
  }
  candidates.sort((a,b)=>b.progress-a.progress||(a.actorKey<b.actorKey?-1:a.actorKey>b.actorKey?1:0))
  return candidates[0]??null
}
