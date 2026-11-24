import type {OfficeActor,OfficePoint,OfficeWorkStation} from './office-types'
import {isWorking} from './team-model'

export interface OfficeWorkGesture {
 kind:'type'|'mouse'|'adjust'|'inspect'|'note'|'page'|'tune'|'focus'|'check'
 progress:number
 reach:number
 turn:number
 nod:number
 lean?:number
 tilt?:number
 profile?:boolean
 keyboard?:OfficePoint
 notebook?:boolean
}
type WorkKind=OfficeWorkGesture['kind']
const desktopCycles:Record<OfficeWorkStation,readonly (readonly [WorkKind,number])[]>={
 planning:[['note',2.7],['focus',2.1],['check',1.8],['note',2.3],['focus',1.5]],
 research:[['focus',3],['page',1.15],['focus',2.7],['note',2.2],['check',1.45]],
 build:[['tune',2.45],['check',1.3],['adjust',1.5],['focus',1.8],['note',1.75]],
 terminal:[['type',2.9],['mouse',1.05],['focus',2.1],['type',1.85],['check',1.6]],
 quality:[['inspect',2.1],['focus',2.6],['page',1.3],['note',2.15],['check',1.55]],
}
const desktopLengths=Object.fromEntries(Object.entries(desktopCycles).map(([station,steps])=>[station,steps.reduce((sum,[,seconds])=>sum+seconds,0)])) as Record<OfficeWorkStation,number>
const desktopTilt={planning:.17,research:.22,build:.17,terminal:.13,quality:.17}
const cycles:Record<OfficeWorkStation,readonly WorkKind[]>={
 planning:['note'],
 research:['page','page','page','page','note'],
 build:['type','type','type','adjust'],
 terminal:['type','type','mouse','type','adjust'],
 quality:['inspect','inspect','note'],
}
const seedFor=(key:string)=>[...key].reduce((seed,c)=>Math.imul(seed^c.charCodeAt(0),16777619)>>>0,2166136261)

function desktopWorkGesture(station:OfficeWorkStation,time:number,seed:number):OfficeWorkGesture {
 const steps=desktopCycles[station],tilt=desktopTilt[station],reading=station==='research'
 if(!(time>0&&Number.isFinite(time)))return {kind:steps[0][0],progress:0,reach:0,turn:0,nod:reading?.24:0,tilt,lean:reading?2:0}
 let elapsed=(time*(.86+seed%31/100)+((seed>>>11)%20000)/1000)%desktopLengths[station]
 for(const [kind,duration] of steps){
  if(elapsed>=duration){elapsed-=duration;continue}
  const progress=elapsed/duration,weight=Math.sin(Math.PI*progress)**2
  const rest=kind==='focus'||kind==='check'
  const nod=kind==='check'?-.29:kind==='focus'?.19:kind==='note'?.14:kind==='inspect'?.12:.04
  const turn=kind==='check'?.19:kind==='page'?-.08:kind==='mouse'?.08:kind==='tune'?-.09:.025
  const lean=kind==='check'?-1.8:kind==='inspect'?1.7:kind==='focus'?.9:.5
  return {kind,progress,reach:rest?0:weight,turn:turn*weight,nod:(reading?.24:0)+nod*weight,tilt:tilt+(kind==='check'?-.07:.035)*weight,lean:(reading?2:0)+lean*weight}
 }
 return {kind:steps[0][0],progress:0,reach:0,turn:0,nod:reading?.24:0,tilt}
}
/** Seconds clock; the returned gesture is presentation only and never changes task state. */
export function officeWorkGesture(actor:Pick<OfficeActor,'key'|'agent'|'pose'>,station:OfficeWorkStation,time:number,enabled=true,desktop=false):OfficeWorkGesture|null {
 const pose=actor.pose as (OfficeActor['pose'] & {wave?:boolean|number})
 if(!enabled||!isWorking(actor.agent.status)||station==='planning'&&!desktop||pose&&(pose.walk||pose.climb||pose.inLift||pose.carry||pose.hand||(pose.dressing??0)>0||(pose.offer??0)>0||pose.wave===true||typeof pose.wave==='number'&&pose.wave>0))return null
 if(desktop)return desktopWorkGesture(station,time,seedFor(actor.key))
 const cycle=cycles[station]
 if(time<=0||!Number.isFinite(time))return {kind:cycle[0],progress:0,reach:0,turn:0,nod:0}
 const seed=seedFor(actor.key),cycleDuration=9+(seed%6001)/1000,duration=cycleDuration/cycle.length,phase=((seed>>>11)%20000)/1000
 const clock=(time+phase)/duration,index=Math.floor(clock),progress=clock-index,kind=cycle[index%cycle.length]
 // A complete action lasts several seconds and returns the hands to rest at both ends.
 const reach=Math.sin(Math.PI*progress)**2
 const direction=kind==='mouse'?.07:kind==='adjust'||kind==='tune'?-.10:kind==='page'?-.06:kind==='note'?.04:kind==='inspect'?.08:.015
 const turn=direction*reach,nod=(kind==='inspect'?.08:.035)*reach*Math.sin(Math.PI*2*progress)
 return {kind,progress,reach,turn,nod}
}
