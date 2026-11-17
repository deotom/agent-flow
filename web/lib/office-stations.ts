import type { OfficeFloor, OfficeScene, OfficeWorkStation } from './office-types'
import type { TeamAgentRow } from './team-types'
import { isWorking } from './team-model'
import {roomStationLayout,type OfficeRoomStation} from './office-room-design'

export const OFFICE_STATION_LABELS:Record<OfficeWorkStation,string>={planning:'planning board',research:'reference corner',build:'development bench',quality:'verification lab',terminal:'operations console'}
export const OFFICE_STATION_NAMES:Record<OfficeWorkStation,string>={planning:'Planning',research:'Research',build:'Development',quality:'Verification',terminal:'Operations'}
export const officeRoomSeed=(id:string)=>[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)
export function agentWorkStation(agent:TeamAgentRow):OfficeWorkStation {
 const activity=agent.activities.at(-1)
 if(!activity)return agent.status==='thinking'?'planning':'terminal'
 const tool=`${activity.type} ${activity.toolName??''}`.toLowerCase()
 // Titles are classified locally; they never enter station labels, events or public output.
 if(/test|verify|verification|lint|pytest|assert/.test(`${tool} ${(activity.title??'').slice(0,160).toLowerCase()}`))return 'quality'
 if(/file_change|write|edit|patch/.test(tool))return 'build'
 if(/web_search|search|fetch|browse|read|query/.test(tool))return 'research'
 if(/compaction|plan|reason/.test(tool))return 'planning'
 return 'terminal'
}
export function officeStations(floor:OfficeFloor,width:number):OfficeRoomStation[]{
 if(floor.room==='room-stations'||floor.room==='room-stations-large')return roomStationLayout(floor,width)
 const kinds=['research','build','quality','terminal'] as const, seed=officeRoomSeed(floor.sessionId??floor.id)
 const order=Array.from({length:4},(_,i)=>kinds[(i+seed%4)%4])
 if(seed&4)order.reverse()
 const height=floor.height??width*.5625
 return order.map((kind,i)=>({kind,x:width*(.11+.185*i),y:floor.y+height*.74,width:width*.18,height:width*.18,facing:'front',work:{x:width*(.11+.185*i),y:floor.y+height*.79},depth:0}))
}
export function officeStationPoint(floor:OfficeFloor,width:number,kind:OfficeWorkStation){
 const h=floor.height??width*.5625
 const station=officeStations(floor,width).find(s=>s.kind===kind)
 if(station)return station.work
 if(floor.room==='room-stations-large')return {x:width*.39,y:floor.y+width*.43}
 return {x:width*.48,y:floor.y+h*.79}
}
export function officeStationUsers(scene:OfficeScene,floor:OfficeFloor,kind:OfficeWorkStation){
 return scene.actors.filter(actor=>actor.floorId===floor.id&&!actor.hidden&&actor.zone==='desk'&&isWorking(actor.agent.status)&&agentWorkStation(actor.agent)===kind)
}
