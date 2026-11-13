import type {OfficeScene,OfficePoint} from './office-types'
const SHAFT_X_RATIO=.938

/** Parent office and its private annex use the same interior threshold. */
export function officeInteriorDoor(scene:OfficeScene,floorId:string):OfficePoint|null {
 const floor=scene.floors.find(f=>f.id===floorId)
 const parent=floor?.annexOf?scene.floors.find(f=>f.id===floor.annexOf):floor
 if(!parent||parent.kind!=='team')return null
 return {x:scene.width*.85,y:parent.y+(parent.height??75)*.79}
}

/** Single geometry contract for the painter, doors, walking and climbing. */
export function officeLanding(scene:OfficeScene,floorId:string):OfficePoint|null {
 const f=scene.floors.find(f=>f.id===floorId)
 if(!f)return null
 if(f.annexOf)return officeInteriorDoor(scene,floorId)
 const scale=scene.width/450,shaftX=scene.width*SHAFT_X_RATIO,h=f.height??75
 return f.kind==='lounge'?{x:shaftX,y:f.y+h*.66}:{x:shaftX-28*scale,y:f.y+h*.79}
}
export function officeNavigation(scene:OfficeScene){
 const scale=scene.width/450,shaftX=scene.width*SHAFT_X_RATIO
 const surface=scene.floors.find(f=>f.kind==='lounge'),hatch=surface?officeLanding(scene,surface.id)!:{x:shaftX,y:scene.width*.5625*.66}
 const occupied=scene.floors.filter(f=>!f.annexOf&&(f.kind==='team'||f.kind==='break')&&(f.actorKeys.length>0||scene.actors.some(a=>a.floorId===f.id&&!a.hidden)))
 const landings=occupied.map(f=>({...officeLanding(scene,f.id)!,id:f.id}))
 return {scale,shaftX,hatch,top:hatch.y,left:shaftX-22*scale,right:shaftX+22*scale,railHalf:18*scale,rungPitch:18*scale,
   bottom:Math.max(hatch.y,...landings.map(p=>p.y))+12*scale,landings,visible:landings.length>0}
}
export function officeHatchOpen(scene:OfficeScene,point:OfficePoint|null,manual:boolean){
 const nav=officeNavigation(scene)
 return manual||Boolean(point&&Math.abs(point.x-nav.hatch.x)<60*nav.scale&&Math.abs(point.y-nav.hatch.y)<90*nav.scale)
}
