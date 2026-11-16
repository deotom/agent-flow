import type {OfficeActor,OfficeScene} from './office-types'
import type {OfficeTrip} from './office-motion'
import {officeInteriorDoor} from './office-navigation'

/** Door animation follows actual crossing traffic, independently of the user's cutaway view. */
export function officeDoorTraffic(scene:OfficeScene,actors:readonly OfficeActor[],trips:readonly (OfficeTrip|null)[],at:number):ReadonlySet<string>{
 const open=new Set<string>(),scale=scene.width/450
 for(const floor of scene.floors){
  if(!floor.annexOf||floor.constructing)continue
  const parent=scene.floors.find(room=>room.id===floor.annexOf)
  if(!parent||parent.constructing)continue
  const point=officeInteriorDoor(scene,floor.id)
  if(!point)continue
  const keys=new Set(trips.filter((trip):trip is OfficeTrip=>!!trip&&trip.startedAt<=at&&at<trip.endsAt&&trip.segments.some(s=>s.floorId===floor.id)&&trip.segments.some(s=>s.floorId===floor.annexOf)).map(trip=>trip.actorKey))
  if(actors.some(actor=>keys.has(actor.key)&&!actor.hidden&&!actor.pose?.inLift&&(actor.floorId===floor.id||actor.floorId===floor.annexOf)&&Math.abs(actor.x-point.x)<20*scale&&Math.abs(actor.y-point.y)<35*scale))open.add(floor.id)
 }
 return open
}
