import type {OfficeActor,OfficePoint,OfficePose,OfficeScene} from './office-types'
import {roomStationLayout} from './office-room-design'
import {agentWorkStation} from './office-stations'

/** Keep breathing above the seat; the hips and short bent legs stay on their support. */
export function officeSeatFrame(p:OfficePose,lift:number){
 const seated=p.sit?Math.max(0,Math.min(1,p.seatBlend??1)):0
 const settle=p.seatBlend===undefined?0:seated*2
 return {seated,bend:seated,settle,torsoLift:seated>=1?0:lift*(1-seated),seat:{x:0,y:-11+settle}}
}

/** Contacts measured from the existing four-cell workstation atlas, in scene units. */
export function officeActorSupport<T extends OfficePose>(scene:OfficeScene,actor:OfficeActor,p:T,scale:number,origin:OfficePoint):T&OfficePose {
 const floor=scene.floors.find(f=>f.id===actor.floorId)
 const paintedSeat=floor?.kind==='break'||floor?.kind==='lounge'||actor.zone==='lounge'
 const pose={...p,...(paintedSeat?{seatBack:false}:{})}
 if(!floor||actor.zone!=='desk'||!floor.room?.startsWith('room-stations')||p.walk||p.inLift||p.climb)return pose
 pose.sit=false // These painted stations are standing benches, not chair desks.
 if(!p.typing)return pose
 const kind=actor.workStation??agentWorkStation(actor.agent)
 const station=roomStationLayout(floor,scene.width).find(s=>s.kind===kind)
 if(!station||(kind!=='build'&&kind!=='terminal')||scale<=0)return {...pose,typing:false}
 const center={x:station.x+station.width*(kind==='build'?-.17:.19),y:station.y-station.height*(kind==='build'?.31:.38)}
 if(Math.abs(center.x-origin.x)>38*scale||Math.abs(center.y-origin.y)>55*scale)return {...pose,typing:false}
 const span=station.width*(kind==='build'?.08:.06)
 return {...pose,lean:0,hop:0,supportHands:{left:{x:(center.x-span-origin.x)/scale,y:(center.y-origin.y)/scale},right:{x:(center.x+span-origin.x)/scale,y:(center.y-origin.y)/scale}}}
}
