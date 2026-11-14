import type { OfficeActor, OfficeScene } from './office-types'
import { skyWeather, type Weather } from './office-sky'

export type OfficeDailyKind = 'coffee' | 'lunch' | 'tea'
export type OfficeDailyDestination = 'garden' | 'canteen' | 'home'
export interface OfficeDailyDay { day:string; coffee:string[]; lunch:string[]; tea:string[] }
export interface OfficeDailyLedger { version:1; latestAt:number; days:OfficeDailyDay[] }
export interface OfficeDailyGuest { actorKey:string; destination:OfficeDailyDestination; seat:number }
export interface OfficeDailyInvitation extends OfficeDailyGuest { kind:OfficeDailyKind; occurrenceKey:string }
export interface OfficeDailyPlanInput {
 date:Date; scene:OfficeScene; ledger:OfficeDailyLedger
 busyKeys?:ReadonlySet<string>; guests?:readonly OfficeDailyGuest[]
 /** Includes waiting outbound garden reservations, excluding keys already in guests. */
 gardenReservedKeys?:ReadonlySet<string>; weather?:Weather
}
const LIMITS:Record<OfficeDailyKind,number>={coffee:2,lunch:8,tea:2}
const localDay=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
export function officeDailyWindow(date:Date) {
 const minute=date.getHours()*60+date.getMinutes(),day=localDay(date)
 const kind:OfficeDailyKind|null=minute>=510&&minute<570?'coffee':minute>=720&&minute<765?'lunch':minute>=900&&minute<930?'tea':null
 return {day,kind,delivery:minute>=710&&minute<730,cleanup:minute>=765&&minute<780,occurrenceKey:kind?`${day}:${kind}`:null}
}
export function emptyOfficeDailyLedger():OfficeDailyLedger {return {version:1,latestAt:0,days:[]}}
/** Validate persisted data and bound both history and each occurrence's actor list. */
export function readOfficeDailyLedger(value:unknown):OfficeDailyLedger {
 if(!value||typeof value!=='object')return emptyOfficeDailyLedger()
 const v=value as Partial<OfficeDailyLedger>
 if(v.version!==1||!Number.isFinite(v.latestAt)||!Array.isArray(v.days))return emptyOfficeDailyLedger()
 const days=new Map<string,OfficeDailyDay>()
 for(const item of v.days.slice(-32)) {
  if(!item||typeof item.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.day))continue
  const day:OfficeDailyDay=days.get(item.day)??{day:item.day,coffee:[],lunch:[],tea:[]}
  for(const kind of ['coffee','lunch','tea'] as const)day[kind]=[...new Set([...day[kind],...(Array.isArray(item[kind])?item[kind].filter((k:unknown):k is string=>typeof k==='string'&&k.length>0&&k.length<=512):[])])].slice(0,LIMITS[kind])
  days.set(day.day,day)
 }
 return {version:1,latestAt:Math.max(0,v.latestAt!),days:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-7)}
}
/** Persist the returned ledger even when there are no invitations: this closes missed windows. */
export function advanceOfficeDailyLedger(ledger:OfficeDailyLedger,date:Date):OfficeDailyLedger {
 const clean=readOfficeDailyLedger(ledger)
 return {...clean,latestAt:Math.max(clean.latestAt,Number.isFinite(date.getTime())?date.getTime():0)}
}
/** Mark at admission, before queuing travel; cancellation does not re-open an invitation. */
export function markOfficeDailyAttendance(ledger:OfficeDailyLedger,date:Date,kind:OfficeDailyKind,actorKey:string):OfficeDailyLedger {
 const result=advanceOfficeDailyLedger(ledger,date),window=officeDailyWindow(date)
 if(date.getTime()<ledger.latestAt||window.kind!==kind||!actorKey||actorKey.length>512)return result
 let day=result.days.find(d=>d.day===window.day)
 if(!day){day={day:window.day,coffee:[],lunch:[],tea:[]};result.days.push(day)}
 if(!day[kind].includes(actorKey)&&day[kind].length<LIMITS[kind])day[kind].push(actorKey)
 result.days.sort((a,b)=>a.day.localeCompare(b.day));result.days=result.days.slice(-7)
 return result
}
export function officeDailyActorEligible(actor:OfficeActor,scene:OfficeScene):boolean {
 const floor=scene.floors.find(f=>f.id===actor.floorId)
 const resting=!actor.hidden&&!actor.party&&actor.zone==='lounge'&&['idle','done','cancelled'].includes(actor.agent.status)
 const privateRoom=floor?.kind==='break'&&!!floor.annexOf&&floor.sessionId===actor.sessionId&&scene.floors.some(f=>f.id===floor.annexOf&&f.kind==='team')
 const leadNook=floor?.kind==='team'&&floor.sessionId===actor.sessionId&&actor.agent.role==='lead'&&!actor.agent.parentId&&!actor.parentKey&&actor.agent.status==='idle'
 return resting&&(privateRoom||leadNook)
}
/** Invitations reserve no runtime resources and consume no ledger entries until accepted. */
export function planOfficeDailyEvents(input:OfficeDailyPlanInput) {
 const {date,scene}=input,window=officeDailyWindow(date),ledger=advanceOfficeDailyLedger(input.ledger,date),guests=input.guests??[]
 const wet=['rain','storm'].includes(input.weather??skyWeather(date))
 const moveIndoors=wet?guests.filter(g=>g.destination==='garden').map(g=>g.actorKey):[]
 const invitations:OfficeDailyInvitation[]=[]
 if(!window.kind||!Number.isFinite(date.getTime())||date.getTime()<input.ledger.latestAt)return {window,ledger,invitations,moveIndoors}
 const kind=window.kind,attended=ledger.days.find(d=>d.day===window.day)?.[kind]??[]
 const occupied=new Set(guests.map(g=>g.actorKey)),gardenKeys=new Set(input.gardenReservedKeys??[])
 for(const a of scene.actors)if(!a.hidden&&scene.floors.some(f=>f.id===a.floorId&&f.kind==='lounge'))gardenKeys.add(a.key)
 for(const g of guests)if(g.destination==='garden')gardenKeys.add(g.actorKey)
 // Existing party occupants and reservations occupy the remaining earliest seats.
 const gardenSeats=new Set(guests.filter(g=>g.destination==='garden').map(g=>g.seat))
 const indoorSeats=new Set(guests.filter(g=>g.destination==='canteen').map(g=>g.seat))
 for(let i=0,n=gardenKeys.size-gardenSeats.size;n>0&&i<4;i++)if(!gardenSeats.has(i)){gardenSeats.add(i);n--}
 const cap=Math.min(kind==='lunch'?4:2,LIMITS[kind]-attended.length)
 for(const actor of [...scene.actors].sort((a,b)=>a.key.localeCompare(b.key))) {
  if(invitations.length>=cap||guests.length+invitations.length>=(kind==='lunch'?4:2))break
  if(occupied.has(actor.key)||attended.includes(actor.key)||input.busyKeys?.has(actor.key)||!officeDailyActorEligible(actor,scene))continue
  const destination:OfficeDailyDestination=kind!=='lunch'?'home':!wet&&gardenKeys.size<4?'garden':'canteen'
  const seats=destination==='garden'?gardenSeats:indoorSeats
  const seat=destination==='home'?invitations.length:[0,1,2,3].find(s=>!seats.has(s))
  if(seat===undefined)continue
  invitations.push({actorKey:actor.key,kind,occurrenceKey:window.occurrenceKey!,destination,seat})
  occupied.add(actor.key);if(destination==='garden')gardenKeys.add(actor.key)
  if(destination!=='home')seats.add(seat)
 }
 return {window,ledger,invitations,moveIndoors}
}

