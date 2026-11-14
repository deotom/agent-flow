import type {OfficeActor,OfficeEvent,OfficeScene} from './office-types'
/** Origins belong to pending visual evidence, including a lead named as another actor's parent. */
export function officePendingOriginKeys(events:readonly OfficeEvent[],activeActorKey?:string):Set<string> {
 const keys=new Set(events.flatMap(event=>[event.actorKey,...(event.parentKey?[event.parentKey]:[])]))
 if(activeActorKey)keys.add(activeActorKey)
 return keys
}
export interface OfficeLeadRestTransition {actorKey:string;from:OfficeActor;to:OfficeActor;caption:string}
/** Pure transition intents; the runtime owns journey priority, interruption and reservations. */
export function officeLeadRestTransitions(previous:OfficeScene|null,next:OfficeScene):OfficeLeadRestTransition[] {
 if(!previous)return []
 const old=new Map(previous.actors.map(a=>[a.key,a]))
 return next.actors.flatMap(to=>{
  const from=old.get(to.key)
  if(!from||from.hidden||to.hidden||to.agent.role!=='lead'||to.agent.parentId||to.parentKey||from.floorId!==to.floorId)return []
  if(!next.floors.some(f=>f.id===to.floorId&&f.kind==='team')||!previous.floors.some(f=>f.id===from.floorId&&f.kind==='team'))return []
  const resting=(a:OfficeActor)=>a.zone==='lounge'&&a.agent.status==='idle'
  if(resting(from)===resting(to)||![from.zone,to.zone].includes('desk'))return []
  return [{actorKey:to.key,from:{...from},to:{...to},caption:resting(to)?'is taking a report-reading break':'is returning to the work station'}]
 })
}
