import type { OfficeActor, OfficePoint, OfficeScene } from './office-types'
import { createOfficeTravelPath, type OfficeTrip } from './office-motion'

export type OfficeRoutineTarget = OfficePoint & {floorId:string}

/** One cosmetic travel leg. Eligibility, meal time and lift ownership belong to the coordinator. */
export function createOfficeRoutineTrip(scene:OfficeScene,actorKey:string,target:OfficeRoutineTarget,now:number,caption:string,fromActor?:OfficeActor):OfficeTrip|null {
  if(fromActor && fromActor.key!==actorKey)return null
  const current=scene.actors.find(actor=>actor.key===actorKey)
  const source=fromActor??current
  if(!source||source.hidden||current?.hidden)return null
  if(!scene.floors.some(floor=>floor.id===source.floorId)||!scene.floors.some(floor=>floor.id===target.floorId))return null
  if(![source.x,source.y,target.x,target.y,now].every(Number.isFinite))return null
  const {segments,travel,leg,nav}=createOfficeTravelPath(scene,scene,source,source.floorId)
  travel(target,target.floorId)
  // A zero-distance journey still has a valid final frame, with no dining dwell.
  if(!segments.length)leg(target,0,'hold')
  const actor={...(current??source),x:target.x,y:target.y,floorId:target.floorId}
  return {
    event:{id:JSON.stringify(['routine',actorKey,target.floorId,target.x,target.y,now]),kind:'routine',actorKey,parentKey:null,at:now},
    actorKey,actor,segments,startedAt:now,endsAt:now+segments.reduce((sum,segment)=>sum+segment.duration,0),caption,
    shaftX:nav.shaftX,rungPitch:nav.rungPitch,
  }
}
