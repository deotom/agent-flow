import type {OfficeActor,OfficePoint,OfficeScene,OfficeWorkStation} from './office-types'
import {officeWorkTarget} from './office-work'
import {isWorking} from './team-model'

/** Visual position only. Source agent/task state remains authoritative. */
export interface OfficeWorkPlace {floorId:string;x:number;y:number;station?:OfficeWorkStation}
export function rememberOfficeWorkPlace(scene:OfficeScene,actor:OfficeActor,point:OfficePoint,station?:OfficeWorkStation):OfficeWorkPlace|null {
 const floor=scene.floors.find(f=>f.id===actor.floorId),height=floor?.height??scene.width*.5625
 if(!floor||actor.zone!=='desk'||actor.hidden||scene.width<=0||height<=0)return null
 return {floorId:floor.id,x:point.x/scene.width,y:(point.y-floor.y)/height,station}
}
export function officeActorAtWorkPlace(scene:OfficeScene,actor:OfficeActor,place:OfficeWorkPlace|undefined):OfficeActor {
 if(!place||place.floorId!==actor.floorId||actor.zone!=='desk'||actor.hidden)return actor
 const floor=scene.floors.find(f=>f.id===place.floorId)
 if(!floor)return actor
 const working=isWorking(actor.agent.status)
 return {...actor,x:place.x*scene.width,y:floor.y+place.y*(floor.height??scene.width*.5625),pose:place.station?{
  ...actor.pose,sit:false,typing:actor.agent.status==='running'&&(place.station==='build'||place.station==='terminal'),
  objectAction:working&&place.station==='research'?'book':undefined,
 }:actor.pose}
}
export const officeSceneAtWorkPlaces=(scene:OfficeScene,places:ReadonlyMap<string,OfficeWorkPlace>):OfficeScene=>({
 ...scene,actors:scene.actors.map(actor=>officeActorAtWorkPlace(scene,actor,places.get(actor.key))),
})
/** Keep existing occupants still, and choose a free adjacent work spot for a coworker. */
export function officeWorkPresenceTarget(scene:OfficeScene,actor:OfficeActor,station:OfficeWorkStation,places:ReadonlyMap<string,OfficeWorkPlace>):OfficePoint {
 const current=places.get(actor.key)
 if(current?.floorId===actor.floorId&&current.station===station){const p=officeActorAtWorkPlace(scene,actor,current);return {x:p.x,y:p.y}}
 const base=officeWorkTarget(actor,scene,station),gap=32*scene.width/450
 const occupied=scene.actors.filter(a=>a.key!==actor.key&&!a.hidden&&a.floorId===actor.floorId&&a.zone==='desk'&&places.get(a.key)?.station).map(a=>officeActorAtWorkPlace(scene,a,places.get(a.key)))
 const candidates=[0,-1,1,-2,2,-3,3].map(i=>({x:Math.max(scene.width*.06,Math.min(scene.width*.755,base.x+i*gap)),y:base.y}))
 return candidates.find(p=>occupied.every(a=>Math.abs(a.x-p.x)>=gap-.01))??candidates.reduce((best,p)=>{
  const distance=(q:OfficePoint)=>Math.min(...occupied.map(a=>Math.abs(a.x-q.x)))
  return distance(p)>distance(best)?p:best
 })
}
