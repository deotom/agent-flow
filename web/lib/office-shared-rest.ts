import type {OfficeActor, OfficePose, OfficeScene} from './office-types'
import {officeSeed} from './office-life'

export interface OfficeSharedRestPair {
 kind:'toast'|'snack'|'stargaze'|'chat'
 firstKey:string
 secondKey:string
 progress:number
 poses:ReadonlyMap<string,OfficePose>
}
export interface OfficeSharedRestOptions {night:boolean;wet:boolean;clear:boolean;cutawayFloor?:string}

const resting=new Set(['idle','done','cancelled'])
const smooth=(t:number)=>{const k=Math.max(0,Math.min(1,t));return k*k*(3-2*k)}
const object=(actor:OfficeActor)=>actor.pose?.objectAction??actor.objectAction

/** Current physical resting neighbours only. No state, travel, ownership or source writes. Time is seconds. */
export function officeSharedRest(scene:OfficeScene,time:number,busyKeys:ReadonlySet<string>,options:OfficeSharedRestOptions):readonly OfficeSharedRestPair[] {
 if(!Number.isFinite(time)||time<=3||!Number.isFinite(scene.width)||scene.width<=0)return []
 const scale=scene.width/450,floors=new Map(scene.floors.map(f=>[f.id,f]))
 const eligible=scene.actors.filter(actor=>{
  const floor=floors.get(actor.floorId),parent=floor?.annexOf?floors.get(floor.annexOf):null
  return actor.zone==='lounge'&&resting.has(actor.agent.status)&&!actor.hidden&&!busyKeys.has(actor.key)
   &&Number.isFinite(actor.x)&&Number.isFinite(actor.y)&&(actor.pose?.opacity??1)>.8
   &&!actor.pose?.walk&&!actor.pose?.climb&&!actor.pose?.inLift
   &&floor&&floor.kind!=='quiet'&&!floor.constructing&&(!floor.annexOf||(parent?!parent.constructing&&parent.kind!=='quiet':options.cutawayFloor===floor.id))
 }).sort((a,b)=>a.key.localeCompare(b.key))
 const used=new Set<string>(),pairs:OfficeSharedRestPair[]=[]
 for(const first of eligible){
  if(used.has(first.key))continue
  // A physical room ID also prevents pairing across a private annex's hidden doorway.
  const second=eligible.filter(actor=>actor.key!==first.key&&!used.has(actor.key)&&actor.floorId===first.floorId
   &&Math.abs(actor.y-first.y)<=12*scale&&Math.abs(actor.x-first.x)>=44*scale&&Math.abs(actor.x-first.x)<=90*scale)
   .sort((a,b)=>Math.abs(a.x-first.x)-Math.abs(b.x-first.x)||a.key.localeCompare(b.key))[0]
  if(!second)continue
  // Match before checking the clock: a window never switches an actor between neighbours.
  used.add(first.key);used.add(second.key)
  const id=JSON.stringify([first.key,second.key]),seed=officeSeed(id)
  const period=options.night?120+60*seed:48+24*seed
  const duration=options.night?4+2*officeSeed(id+'window'):6+2*officeSeed(id+'window')
  const start=4+officeSeed(id+'start')*period,elapsed=time-start
  if(elapsed<0)continue
  const phase=elapsed%period
  if(phase>=duration)continue
  const progress=phase/duration,envelope=smooth(phase/.8)*smooth((duration-phase)/.8)
  const firstObject=object(first),secondObject=object(second)
  const kind:OfficeSharedRestPair['kind']=firstObject==='coffee'&&secondObject==='coffee'?'toast'
   :firstObject==='snack'&&secondObject==='snack'?'snack'
   :options.night&&!options.wet&&options.clear&&floors.get(first.floorId)?.kind==='lounge'?'stargaze':'chat'
  const pose=(actor:OfficeActor,partner:OfficeActor):OfficePose=>{
   const action=object(actor),offering=kind==='toast'||kind==='snack'
   const baseReach=kind==='snack'?12:16,maxReach=(Math.abs(partner.x-actor.x)/scale-8)/2
   const reach=Math.max(0,Math.min(1,(maxReach-baseReach)/(28-baseReach)))
   return {...actor.pose,face:partner.x>actor.x?1:-1,walk:false,typing:false,
    sit:!actor.stand&&action!=='water'&&action!=='music',objectAction:action,...(action?{mug:action==='coffee'}:{}),
    // Held books/games stay in their existing grip. A raised generic arm would hide the mug.
    hand:actor.pose?.mug===false&&!action&&kind==='chat'&&envelope>.3,offer:offering?envelope*reach:0,
    cupTilt:kind==='toast'?.12*envelope:0,lookUp:kind==='stargaze',turn:kind==='chat'?.2*envelope:0}
  }
  pairs.push({kind,firstKey:first.key,secondKey:second.key,progress,poses:new Map([[first.key,pose(first,second)],[second.key,pose(second,first)]])})
  if(pairs.length>=(options.night?1:2))break
 }
 return pairs
}
