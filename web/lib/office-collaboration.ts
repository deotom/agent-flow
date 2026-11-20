import type {TeamAgentRow,TeamTaskRow} from './team-types'
import type {OfficeCollaborationMember} from './office-types'
import {isWorking} from './team-model'

/** Screen visibility, inspection and Locate must agree about who is present. */
export function officeCollaboratorDisplayed(member:OfficeCollaborationMember):boolean{
 return member.agent.role!=='lead'&&(isWorking(member.agent.status)||member.agent.status.startsWith('waiting_')||
  !!(member.remote&&member.task&&(member.task.status==='done'||member.task.status==='failed')&&
   ['pending','none','unknown'].includes(member.task.delivery)&&member.agent.status!=='cancelled'))
}

export type OfficeCollaborationOverrides=Readonly<Record<string,'office'|'remote'>>
const LIMIT=128
export function officeCollaborationPreferenceKey(sessionId:string,agentId:string,taskId?:string|null):string{
 return JSON.stringify(['collaboration',sessionId,agentId,taskId??null])
}
function validKey(key:string):boolean{
 if(key.length>2048)return false
 try{const parts=JSON.parse(key);return Array.isArray(parts)&&parts.length===4&&parts[0]==='collaboration'&&typeof parts[1]==='string'&&typeof parts[2]==='string'&&(parts[3]===null||typeof parts[3]==='string')}catch{return false}
}
export function parseOfficeCollaborationOverrides(raw:string|null):Record<string,'office'|'remote'>{
 try{
  if(!raw||raw.length>300_000)return {}
  const value=JSON.parse(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))return {}
  return Object.fromEntries(Object.entries(value).filter(([key,mode])=>validKey(key)&&(mode==='office'||mode==='remote')).slice(-LIMIT)) as Record<string,'office'|'remote'>
 }catch{return {}}
}
export function setOfficeCollaborationOverride(current:OfficeCollaborationOverrides,key:string,mode:'office'|'remote'|'auto'):Record<string,'office'|'remote'>{
 const next={...current};delete next[key]
 if(validKey(key)&&mode!=='auto')next[key]=mode
 return parseOfficeCollaborationOverrides(JSON.stringify(next))
}
export function officeCollaborationRemote(agent:TeamAgentRow,task:TeamTaskRow|null,sessionId:string,overrides:OfficeCollaborationOverrides):boolean{
 if(agent.role!=='worker')return false
 const mode=overrides[officeCollaborationPreferenceKey(sessionId,agent.id,task?.id)]
 if(mode)return mode==='remote'
 const role=task?.taskRole??agent.taskRole
 return role==='review'||role==='research'
}
