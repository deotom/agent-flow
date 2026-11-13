import type { OfficeActor, OfficeEvent, OfficeScene, OfficeWorkStation } from './office-types'
import { isWorking } from './team-model'
import { agentWorkStation, officeStationPoint } from './office-stations'
export { OFFICE_STATION_LABELS } from './office-stations'

const eligible=(actor:OfficeActor)=>!actor.hidden&&actor.zone==='desk'&&isWorking(actor.agent.status)
export const officeWorkStation=(actor:Pick<OfficeActor,'agent'>):OfficeWorkStation=>agentWorkStation(actor.agent)
export function officeWorkTarget(actor:OfficeActor,scene:OfficeScene,station:OfficeWorkStation) {
  const floor=scene.floors.find(f=>f.id===actor.floorId)
  return floor?officeStationPoint(floor,scene.width,station):{x:scene.width*.49,y:actor.y}
}
/** New observed activities get priority; no command text, output or prompts enter an event. */
export function officeWorkEvents(before:OfficeScene|null,next:OfficeScene,now:number):OfficeEvent[] {
  if(!before)return []
  const old=new Map(before.actors.map(actor=>[actor.key,actor]))
  return next.actors.flatMap(actor=>{
    const previous=old.get(actor.key)
    if(!previous||previous.hidden||!eligible(actor))return []
    const ids=new Set(previous.agent.activities.map(a=>a.id))
    const activity=actor.agent.activities.filter(a=>!ids.has(a.id)).at(-1)
    if(!activity&&!(actor.agent.status==='thinking'&&previous.agent.status!=='thinking'))return []
    return [{id:JSON.stringify(['activity',actor.key,activity?.id??actor.agent.updatedAt??now]),kind:'activity' as const,
      actorKey:actor.key,parentKey:actor.parentKey,at:now,station:officeWorkStation(actor)}]
  })
}
/** Periodic illustration of CURRENT observed work, not a replay or a task-completion event. */
export function officeWorkPulse(scene:OfficeScene,cursor:number,now:number):OfficeEvent|null {
  const actors=scene.actors.filter(eligible).sort((a,b)=>a.key.localeCompare(b.key))
  if(!actors.length)return null
  const actor=actors[cursor%actors.length]
  return {id:JSON.stringify(['work-pulse',actor.key,now]),kind:'activity',actorKey:actor.key,parentKey:actor.parentKey,at:now,station:officeWorkStation(actor)}
}
