import type {OfficeScene} from './office-types'
import type {OfficeRoutineTarget} from './office-daily-trips'
export interface OfficeShopQueueEntry {actorKey:string;order:number;arrivedAt:number|null;serving:boolean;slot?:number}
export function officeShopWaitingPoints(scene:OfficeScene):OfficeRoutineTarget[]{
 const floor=scene.floors.find(f=>f.kind==='lounge'),h=floor?.height??scene.width*.5625
 if(!floor||![scene.width,floor.y,h].every(Number.isFinite)||scene.width<=0||h<=0)return []
 const points=floor.desktopArt?[[.445,.829],[.341,.838]]:[[.51,.745],[.41,.78]]
 return points.map(([x,y])=>({floorId:floor.id,x:scene.width*x,y:floor.y+h*y}))
}
/** Arrival timestamp owns service; admission ordinal breaks simultaneous-arrival ties. */
export function officeShopQueue(scene:OfficeScene,entries:readonly OfficeShopQueueEntry[]){
 const ready=entries.filter(e=>e.arrivedAt!==null&&Number.isFinite(e.arrivedAt)).sort((a,b)=>a.arrivedAt!-b.arrivedAt!||a.order-b.order)
 const serviceKey=ready.find(e=>e.serving)?.actorKey??ready[0]?.actorKey??null
 const marks=officeShopWaitingPoints(scene).map((point,index)=>{
 const guest=entries.find(e=>e.slot===index&&!e.serving)
 return {...point,index,actorKey:guest?.actorKey??null,arrived:guest?.arrivedAt!==null&&guest?.arrivedAt!==undefined}
 })
 return {serviceKey,marks}
}
