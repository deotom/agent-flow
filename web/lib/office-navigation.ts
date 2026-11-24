import type {OfficeScene,OfficeFloor,OfficePoint,OfficeActor} from './office-types'
import {OFFICE_WORKROOM_WALL_DEPTH} from './office-room-design'
const SHAFT_X_RATIO=.938
export function officeShaftX(scene:Pick<OfficeScene,'width'|'floors'>){
 return scene.width*(scene.floors[0]?.desktopArt?.9:SHAFT_X_RATIO)
}
/** Leave a full avatar width outside the painted Desktop jamb. */
export const OFFICE_DESKTOP_LIFT_APRON=60
export const OFFICE_WORKROOM_LIFT_DEPTH=.946
export const OFFICE_GARDEN_LIFT_SILL_OFFSET=9

export function officeLiftApproachDistance(scene:Pick<OfficeScene,'width'|'floors'>,floorId?:string){
 const apron=scene.floors.find(floor=>floor.id===floorId)?.kind==='team'?45:OFFICE_DESKTOP_LIFT_APRON
 return scene.width/450*(scene.floors[0]?.desktopArt?apron:28)
}

/** The lift travels behind its service wall; labels follow the same occlusion. */
export function officeInsideLift(scene:OfficeScene,actor:Pick<OfficeActor,'x'|'pose'>){
 return Boolean(actor.pose?.inLift||actor.pose?.climb||(actor.pose?.walk&&actor.x>=officeShaftX(scene)-22*scene.width/450))
}

/** The workroom wall stays fixed while the private cutaway scales to the room height. */
export function officeInteriorDoor(scene:OfficeScene,floorId:string,side:'workroom'|'annex'='workroom'):OfficePoint|null {
 const floor=scene.floors.find(f=>f.id===floorId)
 const room=floor?.annexOf&&side==='workroom'?(scene.floors.find(f=>f.id===floor.annexOf)??floor):floor
 if(!room||(room.kind!=='team'&&!room.annexOf))return null
 if(room.desktopArt&&!room.annexOf)return {x:scene.width*.737,y:room.y+(room.height??scene.width*.721)*.486}
 const depth=room.annexOf?(room.height??75)*.64:scene.width*OFFICE_WORKROOM_WALL_DEPTH
 return {x:scene.width*.825,y:room.y+depth}
}

/** Painted extent and pointer target of the inset back-wall door. */
export function officeDoorBounds(scene:OfficeScene,floorId:string){
 const point=officeInteriorDoor(scene,floorId)
 if(!point)return null
 const scale=scene.width/450
 return {x:point.x-28*scale,y:point.y-84*scale,width:56*scale,height:84*scale}
}

/** Single geometry contract for the painter, doors, walking and climbing. */
export function officeLanding(scene:OfficeScene,floorId:string):OfficePoint|null {
 const f=scene.floors.find(f=>f.id===floorId)
 if(!f)return null
 if(f.annexOf)return officeInteriorDoor(scene,floorId,'annex')
 const shaftX=officeShaftX(scene),h=f.height??75
 if(f.kind==='lounge')return {x:shaftX,y:f.y+(f.desktopArt?h*.84-OFFICE_GARDEN_LIFT_SILL_OFFSET*scene.width/450:h*.74)}
 // The sill meets the front floorboards below the painted workbenches.
 const depth=f.desktopArt?OFFICE_WORKROOM_LIFT_DEPTH:.79
 return {x:shaftX-officeLiftApproachDistance(scene,f.id),y:f.y+h*depth}
}
/** The lift entrance meets the clear walking aisle without a raised step. */
export function officeAisle(scene:OfficeScene,floorId:string):OfficePoint|null {
 const landing=officeLanding(scene,floorId)
 if(landing&&scene.floors[0]?.desktopArt&&landing.x===officeShaftX(scene))return {...landing,x:landing.x-officeLiftApproachDistance(scene)}
 return landing
}
export function officeNavigation(scene:OfficeScene){
 const scale=scene.width/450,shaftX=officeShaftX(scene)
 const surface=scene.floors.find(f=>f.kind==='lounge'),hatch=surface?officeLanding(scene,surface.id)!:{x:shaftX,y:scene.width*.5625*.66}
 const occupied=scene.floors.filter(f=>!f.annexOf&&(f.kind==='team'||f.kind==='break')&&(f.actorKeys.length>0||scene.actors.some(a=>a.floorId===f.id&&!a.hidden)))
 const landings=occupied.map(f=>({...officeLanding(scene,f.id)!,id:f.id}))
 return {scale,shaftX,hatch,top:hatch.y+4*scale,left:shaftX-22*scale,right:shaftX+22*scale,railHalf:18*scale,rungPitch:18*scale,
   bottom:Math.max(hatch.y,...occupied.map(f=>officeAisle(scene,f.id)!.y))+12*scale,landings,visible:landings.length>0}
}
export function officeHatchOpen(scene:OfficeScene,point:OfficePoint|null,manual:boolean){
 const nav=officeNavigation(scene)
 return manual||Boolean(point&&Math.abs(point.x-nav.hatch.x)<32*nav.scale&&Math.abs(point.y-nav.hatch.y)<18*nav.scale)
}
