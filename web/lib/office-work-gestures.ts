import type {OfficeActor,OfficeWorkStation} from './office-types'
import {isWorking} from './team-model'

export interface OfficeWorkGesture {
 kind:'type'|'mouse'|'adjust'|'inspect'|'note'|'page'
 progress:number
 reach:number
 turn:number
 nod:number
}
type WorkKind=OfficeWorkGesture['kind']
const cycles:Record<Exclude<OfficeWorkStation,'planning'>,readonly WorkKind[]>={
 research:['page','page','page','page','note'],
 build:['type','type','type','adjust'],
 terminal:['type','type','mouse','type','adjust'],
 quality:['inspect','inspect','note'],
}
const seedFor=(key:string)=>[...key].reduce((seed,c)=>Math.imul(seed^c.charCodeAt(0),16777619)>>>0,2166136261)
/** Seconds clock; the returned gesture is presentation only and never changes task state. */
export function officeWorkGesture(actor:Pick<OfficeActor,'key'|'agent'|'pose'>,station:OfficeWorkStation,time:number,enabled=true):OfficeWorkGesture|null {
 const pose=actor.pose as (OfficeActor['pose'] & {wave?:boolean|number})
 if(!enabled||!isWorking(actor.agent.status)||station==='planning'||pose&&(pose.walk||pose.climb||pose.inLift||pose.carry||pose.hand||(pose.dressing??0)>0||(pose.offer??0)>0||pose.wave===true||typeof pose.wave==='number'&&pose.wave>0))return null
 const cycle=cycles[station]
 if(time<=0||!Number.isFinite(time))return {kind:cycle[0],progress:0,reach:0,turn:0,nod:0}
 const seed=seedFor(actor.key),cycleDuration=9+(seed%6001)/1000,duration=cycleDuration/cycle.length,phase=((seed>>>11)%20000)/1000
 const clock=(time+phase)/duration,index=Math.floor(clock),progress=clock-index,kind=cycle[index%cycle.length]
 // A complete action lasts several seconds and returns the hands to rest at both ends.
 const reach=Math.sin(Math.PI*progress)**2
 const direction=kind==='mouse'?.07:kind==='adjust'?-.10:kind==='page'?-.06:kind==='note'?.04:kind==='inspect'?.08:.015
 const turn=direction*reach,nod=(kind==='inspect'?.08:.035)*reach*Math.sin(Math.PI*2*progress)
 return {kind,progress,reach,turn,nod}
}
