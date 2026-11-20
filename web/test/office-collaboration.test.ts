import test from 'node:test'
import {projectT3Teams,type T3Projection} from '../../extension/src/t3-projection'
import assert from 'node:assert/strict'
import {officeCollaborationPreferenceKey,officeCollaborationRemote,parseOfficeCollaborationOverrides,setOfficeCollaborationOverride} from '../lib/office-collaboration'
import {buildOfficeScene,officeKey} from '../lib/office-model'
import {officeRevealTarget,officeAgentInfo} from '../lib/office-interaction'
import {officePresenceEvents} from '../lib/office-motion'
import type {TeamAgentRow,TeamSnapshot,TeamTaskRow} from '../lib/team-types'
const worker=(role?:TeamAgentRow['taskRole']):TeamAgentRow=>({id:'worker',parentId:'lead',role:'worker',taskRole:role,name:'Review implementation name does not classify',runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null})
const lead:TeamAgentRow={...worker(),id:'lead',parentId:null,role:'lead'}
const task:TeamTaskRow={id:'current',childId:'worker',parentId:'lead',name:'Current',model:null,task:null,result:null,status:'working',delivery:'pending',startedAt:30,updatedAt:31,completedAt:null}
const team=(role?:TeamAgentRow['taskRole']):TeamSnapshot=>({sessionId:'a',title:'Team',active:true,updatedAt:31,agents:[lead,worker(role)],tasks:[task]})
test('explicit advisory roles use the meeting screen; names, providers and root leads do not imply remote work',()=>{
 assert.equal(officeCollaborationRemote(worker('review'),task,'a',{}),true)
 assert.equal(officeCollaborationRemote(worker('research'),task,'a',{}),true)
 for(const role of [undefined,'implementation','design','test','general'] as const)assert.equal(officeCollaborationRemote(worker(role),task,'a',{}),false)
 assert.equal(officeCollaborationRemote({...lead,taskRole:'review'},null,'a',{}),false)
})
test('manual presentation is scoped to the current job and bounded without storing task text',()=>{
 const key=officeCollaborationPreferenceKey('a','worker','current')
 let prefs=setOfficeCollaborationOverride({},key,'remote')
 assert.equal(officeCollaborationRemote(worker(),task,'a',prefs),true)
 assert.equal(officeCollaborationRemote(worker(),{...task,id:'next-job'},'a',prefs),false)
 prefs=setOfficeCollaborationOverride(prefs,key,'auto');assert.deepEqual(prefs,{})
 for(let i=0;i<140;i++)prefs=setOfficeCollaborationOverride(prefs,officeCollaborationPreferenceKey('a',String(i),'current'),'remote')
 assert.equal(Object.keys(prefs).length,128)
 assert.deepEqual(parseOfficeCollaborationOverrides('not JSON'),{})
 assert.deepEqual(parseOfficeCollaborationOverrides('{"__proto__":"remote","prompt":"secret"}'),{})
 assert.deepEqual(parseOfficeCollaborationOverrides(JSON.stringify(prefs)),prefs)
})
test('remote workers keep truthful counts and Locate while never taking a physical desk or arrival trip',()=>{
 const source=team('review'),key=officeKey('a','worker'),prefKey=officeCollaborationPreferenceKey('a','worker','current')
 const office=buildOfficeScene([source],'active',false,new Map(),450,new Set(),[],{[prefKey]:'office'})
 const remote=buildOfficeScene([source],'active',false,new Map())
 const floor=remote.floors.find(f=>f.kind==='team')!
 assert.equal(floor.working,2)
 assert.equal(remote.actors.some(a=>a.key===key),false)
 assert.equal(floor.collaboration?.find(m=>m.key===key)?.remote,true)
 assert.deepEqual(officeRevealTarget(remote,key),{peekId:null,y:floor.y+(floor.height??0)*.28})
 assert.equal(officePresenceEvents(office,remote,new Set(['a']),100).some(e=>e.actorKey===key),false)
 assert.equal(officePresenceEvents(remote,office,new Set(['a']),101).some(e=>e.actorKey===key),false)
})
test('inspection uses the new job rather than a late delivery update on an old one',()=>{
 const source=team();source.tasks.unshift({...task,id:'old',startedAt:10,completedAt:20,updatedAt:40,status:'done',delivery:'delivered',task:'Old result job'})
 assert.equal(officeAgentInfo([source],officeKey('a','worker'))?.task?.id,'current')
})

test('Locate never points at a meeting tile for an absent terminal remote worker',()=>{
 for(const status of ['done','idle','cancelled'] as const){
  const source=team('review');source.agents[1]={...source.agents[1],status}
  source.tasks=[{...task,status:'done',delivery:'delivered'}]
  const scene=buildOfficeScene([source],'active',false,new Map())
  assert.equal(officeRevealTarget(scene,officeKey('a','worker')),null)
 }
})


test('a reused live T3 child reaches the actual office at its current job instead of its old result',()=>{
 const row=(fields:Record<string,unknown>,payload:Record<string,unknown>={})=>({...fields,payload_json:JSON.stringify(payload)})
 const data:T3Projection={projects:[{project_id:'p',workspace_root:'D:/fixture'}],
  threads:[row({thread_id:'lead',project_id:'p',title:'Team'}),row({thread_id:'worker',project_id:'p',title:'Worker'},{lineage:{parentThreadId:'lead',relationshipToParent:'subagent'}})],
  subagents:[row({subagent_id:'old',thread_id:'lead',child_thread_id:'worker',status:'completed',started_at:'2026-11-20T05:00:00Z',completed_at:'2026-11-20T06:14:30Z',updated_at:'2026-11-20T06:16:48Z',completion_delivery_state:'delivered'},{title:'Old research',role:'research'}),row({subagent_id:'new',thread_id:'lead',child_thread_id:'worker',status:'running',started_at:'2026-11-20T06:16:00Z',updated_at:'2026-11-20T06:16:09Z'},{title:'Current build',role:'implementation'})],
  runs:[row({run_id:'lead-run',thread_id:'lead',ordinal:1,status:'running'}),row({run_id:'worker-run',thread_id:'worker',ordinal:17,status:'running'})],items:[],providerThreads:[],requests:[]}
 const snapshot=projectT3Teams(data,null)[0].event.payload.team as TeamSnapshot
 const scene=buildOfficeScene([snapshot],'active',false,new Map())
 const actor=scene.actors.find(a=>a.agent.id==='t3-agent:worker')!
 assert.equal(actor.agent.status,'thinking');assert.equal(actor.zone,'desk');assert.equal(actor.task?.id,'t3-delegation:new')
 assert.equal(scene.floors.find(f=>f.kind==='team')!.working,2)
 assert.equal(officeAgentInfo([snapshot],actor.key)?.task?.name,'Current build')
})
