import type {OfficeActor,OfficePoint,OfficePose,OfficeScene} from './office-types'
import {roomStationLayout,roomStationSurface} from './office-room-design'
import {agentWorkStation} from './office-stations'
import {officeWorkGesture} from './office-work-gestures'

/** Keep breathing above the seat; the hips and short bent legs stay on their support. */
export function officeSeatFrame(p:OfficePose,lift:number){
 const seated=p.sit?Math.max(0,Math.min(1,p.seatBlend??1)):0
 const settle=p.seatBlend===undefined?0:seated*2
 return {seated,bend:seated,settle,torsoLift:seated>=1?0:lift*(1-seated),seat:{x:0,y:-11+settle}}
}

/** Contacts measured from the existing four-cell workstation atlas, in scene units. */
export function officeActorSupport<T extends OfficePose>(scene:OfficeScene,actor:OfficeActor,p:T,scale:number,origin:OfficePoint,time=0,animateWork=true):T&OfficePose {
 const floor=scene.floors.find(f=>f.id===actor.floorId)
 const paintedSeat=floor?.kind==='break'||floor?.kind==='lounge'||actor.zone==='lounge'
 const pose={...p,...(paintedSeat?{seatBack:false}:{})}
 if(!floor||actor.zone!=='desk'||!floor.room?.startsWith('room-stations')||p.walk||p.inLift||p.climb)return pose
 pose.sit=false // These painted stations are standing benches, not chair desks.
 const kind=actor.workStation??agentWorkStation(actor.agent)
 const station=roomStationLayout(floor,scene.width).find(s=>s.kind===kind)
 if(!station||scale<=0)return {...pose,typing:false}
 const center=roomStationSurface(station)
 if(Math.abs(center.x-origin.x)>38*scale||Math.abs(center.y-origin.y)>55*scale)return {...pose,typing:false}
 // A delayed source freezes the last-known station posture rather than dropping
 // the worker's hands. Only the live gesture clock and typing are disabled.
 const workTime=animateWork?time:0
 const gesture=officeWorkGesture({...actor,pose:{...actor.pose,...p}},kind,workTime,true)
 if(!gesture)return {...pose,typing:false,workGesture:undefined,supportHands:undefined}
 const reach=gesture?.reach??0,action=gesture?.kind,span=center.span
 const left={x:center.x-span,y:center.y},right={x:center.x+span,y:center.y}
 if(action==='mouse'){right.x+=6*scale*reach;right.y+=scale*reach}
 if(action==='adjust'){right.x+=7*scale*reach;right.y-=8*scale*reach}
 if(action==='inspect'){right.x+=4*scale*reach;right.y-=7*scale*reach}
 if(action==='note'){right.x+=3*scale*reach;right.y-=2*scale*reach}
 if(action==='page'){right.x-=span*2*reach;right.y-=3*scale*reach}
 if(action==='type'&&workTime>0){left.y+=Math.sin(workTime*11)*.6*scale;right.y+=Math.cos(workTime*12)*.6*scale}
 return {...pose,face:station.work.x>station.x?-1:1,lean:0,hop:0,workLift:Math.min(8,Math.max(0,-(center.y-origin.y)/scale-26)),workBack:station.facing==='front',workGesture:gesture??undefined,objectAction:gesture?undefined:pose.objectAction,
  typing:animateWork&&(action==='type'||action==='mouse'),turn:(p.turn??0)+(gesture?.turn??0),
  supportHands:{left:{x:(left.x-origin.x)/scale,y:(left.y-origin.y)/scale},right:{x:(right.x-origin.x)/scale,y:(right.y-origin.y)/scale}}}
}
