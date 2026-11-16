import type {OfficeScene} from './office-types'
import {officeDailyActorEligible,officeDailyWindow} from './office-daily-events'
import {officeGardenOccupiedSeats} from './office-daily-scene'
import {officeDaylight} from './office-daylight'
import {skyWeather,type Weather} from './office-sky'
import {officeLiveliness,officeLivelinessPolicy,type OfficeLiveliness} from './office-liveliness'

export type OfficeOutingAction='snack'|'drink'|'stretch'|'stargaze'
export interface OfficeOutingAttendance {at:number;nextAt:number;occurrenceKey:string}
export interface OfficeOutingSchedule {
 nextAt:number|null;cursor:number;sequence:number;profile:string|null;lastAt:number
 lastByActor:Record<string,OfficeOutingAttendance>
}
export interface OfficeRestOutingInvitation {
 actorKey:string;kind:'outing';occurrenceKey:string;destination:'garden'|'home';seat:number
 action:OfficeOutingAction;night:boolean;dwellMs:number
}
export interface OfficeRestOutingGuest {actorKey:string;destination:'garden'|'home'|'canteen';seat:number;kind?:string}
export interface OfficeRestOutingsInput {
 date:Date;at:number;scene:OfficeScene;state:OfficeOutingSchedule;busyKeys?:ReadonlySet<string>
 guests:readonly OfficeRestOutingGuest[];weather?:Weather;blocked:boolean;liveliness?:OfficeLiveliness
}
export function emptyOfficeOutingSchedule():OfficeOutingSchedule {return {nextAt:null,cursor:0,sequence:0,profile:null,lastAt:0,lastByActor:{}}}
const jitter=(key:string,min:number,max:number)=>{
 let hash=2166136261
 for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)
 return min+(hash>>>0)%(max-min+1)
}
const profileFor=(date:Date,night:boolean)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}:${night?'night':'day'}`
const history=(entries:readonly (readonly [string,OfficeOutingAttendance])[])=>Object.fromEntries([...entries].sort((a,b)=>b[1].at-a[1].at||a[0].localeCompare(b[0])).slice(0,500).map(([key,value])=>[key,{...value}]))
/** No persistence and no backend state: times use the existing pauseable motion clock. */
export function planOfficeRestOutings(input:OfficeRestOutingsInput):{state:OfficeOutingSchedule;invitations:OfficeRestOutingInvitation[]} {
 const {date,at,scene}=input,invitations:OfficeRestOutingInvitation[]=[]
 if(!Number.isFinite(at)||!Number.isFinite(date.getTime()))return {state:{...input.state,lastByActor:history(Object.entries(input.state.lastByActor))},invitations}
 const night=officeDaylight(date).night,mode=officeLiveliness(input.liveliness),policy=officeLivelinessPolicy(mode,night),baseProfile=profileFor(date,night),profile=mode==='normal'?baseProfile:`${baseProfile}:${mode}`,present=new Set(scene.actors.map(a=>a.key))
 const state:OfficeOutingSchedule={...input.state,lastAt:at,lastByActor:history(Object.entries(input.state.lastByActor).filter(([key])=>present.has(key)))}
 // A day/profile change during pause starts a fresh initial delay, never overdue work.
 if(state.nextAt===null||state.profile!==profile||at<input.state.lastAt){
  state.profile=profile;state.nextAt=at+jitter(`${profile}:${state.sequence}:initial`,night?45000:20000,night?75000:40000)
  return {state,invitations}
 }
 if(at<state.nextAt)return {state,invitations}
 const token=`${profile}:${state.sequence++}`
 // A bounded recheck avoids busy-frame retries without starving behind real work pulses.
 state.nextAt=at+jitter(`${token}:retry`,10000,15000)
 const activeOutings=input.guests.filter(g=>g.kind==='outing').length,limit=policy.outingLimit
 if(input.blocked||officeDailyWindow(date).kind||activeOutings>=limit)return {state,invitations}
 const actors=[...scene.actors].sort((a,b)=>a.key.localeCompare(b.key)),guestKeys=new Set(input.guests.map(g=>g.actorKey))
 const seats=officeGardenOccupiedSeats(scene,guestKeys),gardenGuests=input.guests.filter(g=>g.destination==='garden')
 for(const guest of gardenGuests)seats.add(guest.seat)
 const homeFloors=new Set(input.guests.filter(g=>g.destination==='home').map(g=>scene.actors.find(a=>a.key===g.actorKey)?.floorId).filter((id):id is string=>!!id))
 const garden=scene.floors.find(f=>f.kind==='lounge')
 let gardenCount=scene.actors.filter(a=>!a.hidden&&a.floorId===garden?.id&&!guestKeys.has(a.key)).length+gardenGuests.length
 const wet=['rain','storm'].includes(input.weather??skyWeather(date))
 const start=actors.length?state.cursor%actors.length:0
 for(let offset=0;offset<actors.length&&invitations.length<limit-activeOutings;offset++){
  const index=(start+offset)%actors.length,actor=actors[index]
  if(guestKeys.has(actor.key)||input.busyKeys?.has(actor.key)||!officeDailyActorEligible(actor,scene)||(state.lastByActor[actor.key]?.nextAt??-Infinity)>at)continue
  const freeSeat=[0,1,2,3].find(seat=>!seats.has(seat)),destination=garden&&!wet&&gardenCount<4&&freeSeat!==undefined?'garden':'home'
  if(destination==='home'&&homeFloors.has(actor.floorId))continue
  const actions:readonly OfficeOutingAction[]=destination==='home'?['drink','stretch']:night?['drink','stretch','stargaze']:['snack','drink','stretch']
  invitations.push({actorKey:actor.key,kind:'outing',occurrenceKey:`outing:${token}:${actor.key}`,destination,seat:destination==='garden'?freeSeat!:0,
   action:actions[jitter(`${token}:${actor.key}:action`,0,actions.length-1)],night,dwellMs:jitter(`${token}:${actor.key}:dwell`,night?30000:25000,night?60000:45000)})
  if(destination==='garden'){seats.add(freeSeat!);gardenCount++}else homeFloors.add(actor.floorId)
  state.cursor=(index+1)%actors.length
 }
 if(invitations.length)state.nextAt=at+jitter(`${token}:gap`,policy.outingGapMs[0],policy.outingGapMs[1])
 return {state,invitations}
}
/** Call only after a concrete trip was created. Repeated confirmation is idempotent. */
export function markOfficeRestOutingAdmission(state:OfficeOutingSchedule,invite:OfficeRestOutingInvitation,at:number):OfficeOutingSchedule {
 const lastByActor=history(Object.entries(state.lastByActor)),prior=lastByActor[invite.actorKey]
 if(!Number.isFinite(at)||prior?.occurrenceKey===invite.occurrenceKey)return {...state,lastByActor}
 const cooldown=jitter(`${invite.occurrenceKey}:cooldown`,invite.night?600000:360000,invite.night?900000:600000)
 return {...state,lastByActor:history([...Object.entries(lastByActor).filter(([key])=>key!==invite.actorKey),[invite.actorKey,{at,nextAt:at+cooldown,occurrenceKey:invite.occurrenceKey}]])}
}
