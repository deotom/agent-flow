import type {OfficeActor,OfficePoint,OfficeScene,OfficeWorkStation} from './office-types'
import {officeWorkTarget} from './office-work'
import {isWorking} from './team-model'
import {roomActorSpots,roomLeadRestPoint,roomStationSpots} from './office-room-design'

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
 return {...actor,x:place.x*scene.width,y:floor.y+place.y*(floor.height??scene.width*.5625),workStation:place.station??actor.workStation,pose:place.station?{
  ...actor.pose,sit:false,typing:actor.agent.status==='running'&&(place.station==='build'||place.station==='terminal'),
  objectAction:working&&place.station==='research'?'book':undefined,
 }:actor.pose}
}
export const officeSceneAtWorkPlaces=(scene:OfficeScene,places:ReadonlyMap<string,OfficeWorkPlace>):OfficeScene=>({
 ...scene,actors:scene.actors.map(actor=>officeActorAtWorkPlace(scene,actor,places.get(actor.key))),
})
/** Keep valid occupants still; new coworkers use clear floor space, including a second row in large rooms. */
export function officeWorkPresenceTarget(scene:OfficeScene,actor:OfficeActor,station:OfficeWorkStation,places:ReadonlyMap<string,OfficeWorkPlace>):OfficePoint {
 const current=places.get(actor.key),base=officeWorkTarget(actor,scene,station)
 const floor=scene.floors.find(f=>f.id===actor.floorId)
 if(!floor)return base
 const scale=scene.width/450,gap=48*scale,depthGap=60*scale
 const height=floor.height??scene.width*.5625,large=floor.room==='room-stations-large',room=large||floor.room==='room-stations'
 const left=scene.width*.07,right=scene.width*.755
 const maxFeet=floor.y+(room?(floor.desktopArt?height*.94:height-scene.width*.118):height*.79)
 // Include initial canonical occupants as well as people already parked at a station.
 const occupied:OfficePoint[]=scene.actors.filter(a=>a.key!==actor.key&&!a.hidden&&a.floorId===actor.floorId&&(a.zone==='desk'||a.zone==='lounge'&&a.agent.role==='lead'&&a.agent.status==='idle')).map(a=>officeActorAtWorkPlace(scene,a,places.get(a.key)))
 const nook=roomLeadRestPoint(floor,scene.width)
 if(nook.y>=floor.y&&nook.y<=floor.y+height)occupied.push(nook)
 // A little depth alone must not permit two same-row bodies to overlap horizontally.
 const clear=(a:OfficePoint,b:OfficePoint)=>Math.abs(a.x-b.x)>=gap-.01||Math.abs(a.y-b.y)>=depthGap-.01
 const minFeet=floor.y+(room?(floor.desktopArt?height*.48:scene.width*.36):0)
 const within=(p:OfficePoint)=>p.x>=left-.01&&p.x<=right+.01&&p.y>=minFeet-.01&&p.y<=maxFeet+.01
 const available=(p:OfficePoint)=>within(p)&&occupied.every(a=>clear(a,p))
 if(floor.desktopArt&&station==='planning'){
  // The desk sits against the wall. Portable work stays on the front row, clear of the lift aisle.
  const deskFree=occupied.every(a=>Math.abs(a.x-base.x)>=32*scale||Math.abs(a.y-base.y)>=depthGap)
  if(deskFree)return base
  const portable=[.411,.299,.523,.187,.635,.075,.747].map(x=>({x:x*scene.width,y:maxFeet}))
  if(current?.station===station&&current.floorId===floor.id){
   const point=officeActorAtWorkPlace(scene,actor,current)
   if(Math.abs(point.y-maxFeet)<.01&&available(point))return {x:point.x,y:point.y}
  }
  const seated=portable.find(available)
  if(seated)return seated
  const clearance=(point:OfficePoint)=>Math.min(...occupied.map(a=>Math.hypot(a.x-point.x,a.y-point.y)))
  return portable.reduce((best,point)=>clearance(point)>clearance(best)?point:best)
 }
 if(current?.floorId===actor.floorId&&current.station===station){const p=officeActorAtWorkPlace(scene,actor,current);if(available(p))return {x:p.x,y:p.y}}
 const row=(x:number):OfficePoint=>({x,y:base.y})
 const aisle=[base,...Array.from({length:15},(_,i)=>row(base.x+(i-7)*gap)),...occupied.flatMap(a=>[row(a.x-gap),row(a.x+gap)]),row(left),row(right)].filter(within).sort((a,b)=>Math.abs(a.x-base.x)-Math.abs(b.x-base.x))
 const depth=room?roomActorSpots(floor,scene.width).sort((a,b)=>Math.hypot(a.x-base.x,a.y-base.y)-Math.hypot(b.x-base.x,b.y-base.y)):[]
 const candidates=(room?[...roomStationSpots(floor,scene.width,station),...depth,...aisle]:aisle).filter(within)
 const free=candidates.find(available)
 if(free)return free
 // Capacity is bounded by the scene builder. If a transient crowd fills every spot,
 // choose the largest remaining separation without moving existing people.
 const clearance=(p:OfficePoint)=>Math.min(...occupied.map(a=>Math.max(Math.abs(a.x-p.x)/gap,Math.abs(a.y-p.y)/depthGap)))
 return candidates.reduce((best,p)=>clearance(p)>clearance(best)?p:best,candidates[0]??base)
}
