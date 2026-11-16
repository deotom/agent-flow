import type {TeamSnapshot} from './team-types'
import type {OfficeBoard,OfficeScene} from './office-types'
import {officeKey} from './office-model'

/** Re-read requests on each click; stable IDs keep polling from shuffling the cycle. */
export function officeNextAttention(snapshots:readonly TeamSnapshot[],previous:string|null){
 const targets=snapshots.flatMap(team=>team.agents.filter(agent=>agent.status.startsWith('waiting_')).map(agent=>({key:officeKey(team.sessionId,agent.id),sessionId:team.sessionId,agentId:agent.id}))).sort((a,b)=>a.key.localeCompare(b.key))
 if(!targets.length)return null
 const index=targets.findIndex(target=>target.key===previous)
 return targets[(index+1)%targets.length]
}

export function officeAgentInfo(snapshots:readonly TeamSnapshot[],key:string|null){
 if(!key)return null
 for(const team of snapshots){
  const agent=team.agents.find(row=>officeKey(team.sessionId,row.id)===key)
  if(!agent)continue
  const task=team.tasks.filter(row=>row.childId===agent.id).sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0))[0]??null
  return {team,agent,task,assignment:task?.task??agent.task}
 }
 return null
}

/** Explicit board inspection is not limited to the painted three-line preview. */
export function officePlanningInfo(snapshots:readonly TeamSnapshot[],sessionId:string):OfficeBoard|null{
 const team=snapshots.find(row=>row.sessionId===sessionId)
 if(!team)return null
 const tasks=team.tasks.filter(task=>task.status!=='cancelled'),assigned=new Set(tasks.map(task=>task.childId))
 const items:OfficeBoard['items']=[
  ...team.agents.filter(agent=>agent.status.startsWith('waiting_')&&!assigned.has(agent.id)).map(agent=>({label:agent.name,state:'waiting' as const})),
  ...tasks.map(task=>({label:task.name||team.agents.find(agent=>agent.id===task.childId)?.name||'Agent',state:team.agents.some(agent=>agent.id===task.childId&&agent.status.startsWith('waiting_'))?'waiting' as const:task.status==='failed'?'failed' as const:task.status==='done'?'done' as const:'working' as const})),
 ]
 const order={waiting:0,failed:1,working:2,done:3}
 items.sort((a,b)=>order[a.state]-order[b.state])
 return {goal:team.title,done:tasks.filter(task=>task.status==='done').length,total:tasks.length,items}
}

/** Use the physical render, not the source's reserved desk or home seat. */
export function officeRevealTarget(scene:OfficeScene,key:string):{peekId:string|null;y:number}|null{
 const actor=scene.actors.find(row=>row.key===key&&!row.hidden)
 if(!actor||!Number.isFinite(actor.y))return null
 const floor=scene.floors.find(row=>row.id===actor.floorId)
 if(!floor||floor.kind==='quiet'||floor.constructing)return null
 const parent=floor.annexOf?scene.floors.find(row=>row.id===floor.annexOf):null
 if(floor.annexOf&&(!parent||parent.constructing))return null
 return {peekId:floor.annexOf&&!actor.pose?.inLift?floor.id:null,y:Math.max(0,Math.min(scene.height,actor.y))}
}
