import type {OfficeActor,OfficeFloor,OfficePoint,OfficePose,OfficeScene} from './office-types'
import {roomBuildWorkpoints,roomDesktopWorkpoints,roomStationLayout,roomStationSurface} from './office-room-design'
import {agentWorkStation} from './office-stations'
import {officeWorkGesture} from './office-work-gestures'

/** Keep breathing above the seat; the hips and short bent legs stay on their support. */
export function officeSeatFrame(p:OfficePose,lift:number){
 const seated=p.sit?Math.max(0,Math.min(1,p.seatBlend??1)):0
 const settle=p.seatBlend===undefined?0:seated*2
 return {seated,bend:seated,settle,torsoLift:seated>=1?0:lift*(1-seated),seat:{x:0,y:-11+settle}}
}

export function officeStandsAtStation(floor:OfficeFloor|undefined,actor:OfficeActor,pose:OfficePose){
 return Boolean(floor?.room?.startsWith('room-stations')&&actor.zone==='desk'&&!pose.walk&&!pose.inLift&&!pose.climb&&!pose.meeting&&!pose.liftWait)
}

/** Contacts measured from the existing four-cell workstation atlas, in scene units. */
export function officeActorSupport<T extends OfficePose>(scene:OfficeScene,actor:OfficeActor,p:T,scale:number,origin:OfficePoint,time=0,animateWork=true):T&OfficePose {
 const floor=scene.floors.find(f=>f.id===actor.floorId)
 const paintedSeat=floor?.kind==='break'||floor?.kind==='lounge'||actor.zone==='lounge'
 const pose={...p,...(paintedSeat?{seatBack:false}:{})}
 if(!floor||(!p.rising&&!officeStandsAtStation(floor,actor,p)))return pose
 const kind=actor.workStation??agentWorkStation(actor.agent)
 const atPoint=({feet}:{feet:OfficePoint})=>Math.hypot(feet.x-actor.x,feet.y-actor.y)<.01
 const desktopPoint=floor?.desktopArt?roomDesktopWorkpoints(floor,scene.width,kind).find(atPoint):undefined
 // Overflow positions provide standing room. They do not share another worker's tool or stool.
 if(floor.desktopArt&&p.planningNote){
  const workGesture=officeWorkGesture({...actor,pose:{...p,hand:false,wave:false}},'planning',animateWork?time:0,true,true)
  return {...pose,sit:false,face:1,hand:false,wave:false,mug:false,cup:false,objectAction:undefined,
   workGesture:workGesture??undefined,supportHands:{left:{x:3,y:-40},right:{x:12,y:-41+(workGesture?.reach??0)*2}}}
 }
 if(floor.desktopArt&&(!desktopPoint||p.rising&&!desktopPoint.seated)){
  const workTime=animateWork?time:0
  const gesture=!desktopPoint&&(kind==='terminal'||kind==='planning')
   ?p.rising?{kind:'type' as const,progress:0,reach:0,turn:0,nod:0,tilt:0}:officeWorkGesture({...actor,pose:{...actor.pose,...p,hand:false,wave:false}},'terminal',workTime,true,true)
   :null
  if(gesture){
   const typing=!p.rising&&gesture.kind==='type'
   const tap=typing&&workTime>0?Math.sin(workTime*9)*gesture.reach:0
   const grip=p.rising?Math.max(0,Math.min(1,((p.seatBlend??0)-.35)/.65)):1
   const stool=roomDesktopWorkpoints(floor,scene.width,'terminal')[0]
   const stoolHeight=stool?.seatY!==undefined&&scale>0?(stool.feet.y-stool.seatY)/scale:18
   return {...pose,sit:true,seatHeight:stoolHeight,seatBack:false,face:actor.x<scene.width*.625?1:-1,workBack:false,
    cup:false,mug:false,hand:false,wave:false,scratch:false,lean:0,hop:0,objectAction:undefined,typing:animateWork&&typing,
    workGesture:{...gesture,kind:typing||p.rising?'type':'focus',profile:true,notebook:true},
    supportHands:grip?{left:{x:-7,y:-21+(24-stoolHeight)*grip+tap},right:{x:7,y:-21+(24-stoolHeight)*grip-tap}}:undefined}
  }
  return {...pose,sit:false,typing:false,workGesture:undefined,supportHands:undefined}
 }
 const seatHeight=desktopPoint?.seatY!==undefined&&scale>0?(origin.y-desktopPoint.seatY)/scale:undefined
 if(p.rising&&desktopPoint&&scale>0){
  const {surface}=desktopPoint,face=surface.x<actor.x?-1:1
  const seated=p.seatBlend??0,release=Math.max(0,Math.min(1,(seated-.38)/.62))
  const profile=kind==='planning'||Math.abs(surface.x-actor.x)>20*scale
  const gesture=officeWorkGesture(actor,kind,0,true,true)
  const hand=(side:-1|1)=>{
   const x=(surface.x+side*surface.span-origin.x)/scale,y=(surface.y-origin.y)/scale
   return {x:side*face*15+(x-side*face*15)*release,y:-21+(y+21)*release}
  }
  return {...pose,sit:true,seatHeight,seatBack:false,workBack:seated>.35&&!profile,
   face,seatProfile:seated>.35&&profile,typing:false,objectAction:undefined,
   workGesture:release&&gesture?{...gesture,tilt:(gesture.tilt??0)*release}:undefined,
   supportHands:release?{left:hand(-1),right:hand(1)}:undefined}
 }
 pose.sit=false // These painted stations are standing benches, not chair desks.
 const station=roomStationLayout(floor,scene.width).find(s=>s.kind===kind)
 if((!station&&!desktopPoint)||scale<=0)return {...pose,typing:false}
 const buildPoint=!floor.desktopArt&&kind==='build'&&station?roomBuildWorkpoints(station,scene.width).find(atPoint):undefined
 const center=desktopPoint?.surface??buildPoint?.surface??roomStationSurface(station!)
 if(Math.abs(center.x-origin.x)>38*scale||Math.abs(center.y-origin.y)>55*scale)return {...pose,typing:false}
 // A delayed source freezes the last-known station posture rather than dropping
 // the worker's hands. Only the live gesture clock and typing are disabled.
 const workTime=animateWork?time:0
 const workPose={...actor.pose,...p,...(floor.desktopArt?{hand:false,wave:false}:{})}
 const gesture=officeWorkGesture({...actor,pose:workPose},kind,workTime,true,floor.desktopArt)
 if(!gesture)return {...pose,typing:false,workGesture:undefined,supportHands:undefined}
 const reach=gesture.reach,action=gesture.kind,span=center.span
 const left={x:center.x-span,y:center.y},right={x:center.x+span,y:center.y}
 if(action==='mouse'){right.x+=(floor.desktopArt?13:6)*scale*reach;right.y+=scale*reach}
 if(action==='adjust'){right.x+=7*scale*reach;right.y-=8*scale*reach}
 if(action==='tune'){right.x+=(4+2*Math.sin(gesture.progress*4*Math.PI))*scale*reach;right.y-=8*scale*reach}
 if(action==='inspect'){right.x+=4*scale*reach;right.y-=(floor.desktopArt?11:7)*scale*reach}
 if(action==='note'){right.x+=(floor.desktopArt?3+3*Math.sin(gesture.progress*6*Math.PI):3)*scale*reach;right.y-=2*scale*reach}
 if(action==='page'){right.x-=span*2*reach;right.y-=(floor.desktopArt?7:3)*scale*reach}
 if(action==='type'&&workTime>0){
  const tap=(floor.desktopArt?.9*reach:.6)*scale
  left.y-=Math.abs(Math.sin(workTime*11))*tap;right.y-=Math.abs(Math.cos(workTime*12))*tap
 }
 const seated=desktopPoint?.seated??false
 const face=floor.desktopArt?(center.x<actor.x?-1:1):station!.work.x>station!.x?-1:1
 const keyboard=floor.desktopArt&&kind==='terminal'?{x:(center.x-origin.x)/scale,y:(center.y-origin.y)/scale}:undefined
 const profile=kind==='planning'||kind==='research'||(seated&&Math.abs(center.x-actor.x)>20*scale)
 return {...pose,...(floor.desktopArt?{cup:false,mug:false,hand:false,wave:false,scratch:false}:{}),sit:seated,...(seated?{seatBack:false,seatHeight}:{}),face,lean:0,hop:0,workLift:seated?0:Math.min(8,Math.max(0,-(center.y-origin.y)/scale-26)),
 workBack:floor.desktopArt?(seated&&!profile||kind==='build'&&face===1):station!.facing==='front',workGesture:floor.desktopArt?{...gesture,profile,keyboard}:gesture,objectAction:undefined,
  typing:animateWork&&(action==='type'||!floor.desktopArt&&action==='mouse'),turn:(p.turn??0)+gesture.turn,
  supportHands:{left:{x:(left.x-origin.x)/scale,y:(left.y-origin.y)/scale},right:{x:(right.x-origin.x)/scale,y:(right.y-origin.y)/scale}}}
}
