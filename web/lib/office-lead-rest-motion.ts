import type {OfficeActor,OfficeScene} from './office-types'
import {createOfficeRoutineTrip} from './office-daily-trips'

/** A local reading-nook transition begins at the rendered work spot, including interrupted walks. */
export function createOfficeLeadRestTrip(before:OfficeScene,next:OfficeScene,actorKey:string,at:number,fromActor?:OfficeActor){
 const actor=next.actors.find(a=>a.key===actorKey&&!a.hidden),from=fromActor??before.actors.find(a=>a.key===actorKey&&!a.hidden)
 if(!actor||!from||actor.agent.role!=='lead'||actor.parentKey||actor.agent.parentId||actor.floorId!==from.floorId||!next.floors.some(f=>f.id===actor.floorId&&f.kind==='team'))return null
 if(Math.hypot(actor.x-from.x,actor.y-from.y)<.01)return null
 return createOfficeRoutineTrip(next,actorKey,actor,at,actor.zone==='lounge'?'is taking a report-reading break':'is returning to the work station',from)
}
