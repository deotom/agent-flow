import type {OfficeScene} from './office-types'
import type {OfficeRoomStation} from './office-room-design'
import {agentWorkStation} from './office-stations'
import {isWorking} from './team-model'

export type OfficeStationState='idle'|'working'|'waiting'|'failed'
/** Device activity belongs to a visible, stationary user physically at this tool. */
export function officeStationActivity(scene:OfficeScene,floorId:string,station:OfficeRoomStation):OfficeStationState {
 let state:OfficeStationState='idle'
 const unit=scene.width/450
 for(const actor of scene.actors){
  if(actor.hidden||actor.floorId!==floorId||actor.zone!=='desk'||actor.pose?.walk||actor.pose?.climb||actor.pose?.inLift||(actor.pose?.opacity??1)<.8||
    (actor.workStation??agentWorkStation(actor.agent))!==station.kind||Math.abs(actor.x-station.work.x)>38*unit||Math.abs(actor.y-station.work.y)>35*unit)continue
  if(actor.agent.status==='failed')return 'failed'
  if(actor.agent.status.startsWith('waiting_'))state='waiting'
  else if(isWorking(actor.agent.status)&&state==='idle')state='working'
 }
 return state
}
