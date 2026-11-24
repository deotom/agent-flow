import type { OfficeFloor, OfficeScene, OfficeWorkStation } from './office-types'
import type { TeamAgentRow } from './team-types'
import { isWorking } from './team-model'
import {roomDesktopWorkpoints,roomStationLayout,type OfficeRoomStation} from './office-room-design'

export const OFFICE_STATION_LABELS:Record<OfficeWorkStation,string>={planning:'planning board',research:'reference corner',build:'development bench',quality:'verification lab',terminal:'operations console'}
export const OFFICE_STATION_NAMES:Record<OfficeWorkStation,string>={planning:'Planning',research:'Research',build:'Development',quality:'Verification',terminal:'Operations'}
export const OFFICE_DESKTOP_STATION_NAMES:Record<OfficeWorkStation,string>={planning:'Planning',research:'Research',build:'Build',quality:'Review',terminal:'Terminal'}
export const officeRoomSeed=(id:string)=>[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)
const stationTokens=(value:string)=>value.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[^a-zA-Z0-9]+/g,' ').toLowerCase()
const roleStation=(role:TeamAgentRow['taskRole']):OfficeWorkStation|null=>
 role==='research'?'research':role==='review'||role==='test'?'quality':null
export function agentWorkStation(agent:TeamAgentRow):OfficeWorkStation {
 const activity=agent.activities.at(-1)
 if(!activity){
  if(agent.status==='thinking')return roleStation(agent.taskRole)??'planning'
  if(agent.status==='background')return 'terminal'
  return roleStation(agent.taskRole)??'terminal'
 }
 const tool=stationTokens(`${activity.type} ${activity.toolName??''}`)
 // Titles are classified locally; they never enter station labels, events or public output.
 const title=stationTokens((activity.title??'').slice(0,160))
 if(/\b(compaction|plan|planning|todo|todowrite|reason|reasoning|delegate|subagent|ask question|exit plan mode)\b/.test(tool))return 'planning'
 if(/\b(review|pull request|ci logs|ci rerun|test|tests|verify|verification|lint|eslint|typecheck|type check|tsc|pytest|vitest|jest|assert)\b/.test(tool))return 'quality'
 if(/\b(file change|write|edit|multi edit|patch|apply patch|create file|replace)\b/.test(tool))return 'build'
 if(/\b(web search|search|fetch|web fetch|browse|read|query|grep|glob|ls|find|list|view|inspect|outline|symbol|definition|references|lookup|doc|docs|documentation|resource|resources|research|preview snapshot)\b/.test(tool))return 'research'
 if(/\b(test|tests|testing|verify|verification|verifying|review|reviewing|audit|auditing|lint|linting|eslint|typecheck|type check|tsc|pytest|vitest|jest|mocha|playwright|cypress|assert|diff|check|checks|checking|qa|ci|pr|pull request|git status)\b/.test(title))return 'quality'
 if(/\b(search|searching|find|finding|locate|locating|grep|rg|glob|ls|list|listing|read|reading|cat|browse|fetch|query|explore|lookup|investigate|analyze|analysis|research|inspect|directory|survey|view)\b/.test(title))return 'research'
 if(/\b(plan|planning|compaction|compact|summarize)\b/.test(title))return 'planning'
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
 if(floor.desktopArt&&kind==='planning')return roomDesktopWorkpoints(floor,width,kind)[0].feet
 const station=officeStations(floor,width).find(s=>s.kind===kind)
 if(station)return station.work
 if(floor.room==='room-stations-large')return {x:width*.39,y:floor.y+width*.43}
 return {x:width*.48,y:floor.y+h*.79}
}
export function officeStationUsers(scene:OfficeScene,floor:OfficeFloor,kind:OfficeWorkStation){
 return scene.actors.filter(actor=>actor.floorId===floor.id&&!actor.hidden&&actor.zone==='desk'&&isWorking(actor.agent.status)&&agentWorkStation(actor.agent)===kind)
}
