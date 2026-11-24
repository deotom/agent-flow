import { it } from 'node:test'
import assert from 'node:assert/strict'
import { agentWorkStation, OFFICE_DESKTOP_STATION_NAMES, officeStations, officeStationUsers, officeStationPoint } from '../lib/office-stations'
import { buildOfficeScene } from '../lib/office-model'
import { officeWorkEvents, officeWorkStation } from '../lib/office-work'
import type {TeamSnapshot} from '../lib/team-types'
const snap:TeamSnapshot={sessionId:'s',title:'Team',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',role:'lead',parentId:null,name:'Lead',runtime:'codex',model:null,status:'running',task:null,activities:[{id:'tool',type:'command_execution',toolName:null,title:'Run regression tests',startedAt:1}],requestKind:null,context:null,toolCallCount:1,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
it('keeps the staging position stable when work changes, leaving relocation to the motion system',()=>{
 const before=buildOfficeScene([snap],'active',false,new Map()).actors[0]
 const next=structuredClone(snap);next.agents[0].activities=[{id:'edit',type:'file_change',toolName:null,title:null,startedAt:2}]
 const after=buildOfficeScene([next],'active',false,new Map()).actors[0]
 assert.deepEqual({x:after.x,y:after.y},{x:before.x,y:before.y})
 assert.notEqual(after.workStation,before.workStation)
})
it('has four distinct tools with stable team layouts and targets inside the room',()=>{
 const scene=buildOfficeScene([snap],'active',false,new Map()),floor=scene.floors.find(f=>f.kind==='team')!
 const stations=officeStations(floor,scene.width)
 assert.deepEqual(stations.map(s=>s.kind).sort(),['build','quality','research','terminal'])
 assert.equal(new Set(stations.map(s=>s.x)).size,4)
 assert.deepEqual(officeStations(floor,scene.width),stations)
 assert.ok(stations.every(s=>s.x>0&&s.x<scene.width*.9&&s.y>floor.y&&s.y<floor.y+floor.height!))
 assert.ok(new Set(Array.from({length:20},(_,i)=>officeStations({...floor,sessionId:`s${i}`},scene.width).map(s=>s.kind).join(','))).size>2)
})
it('lights only stations currently used by visible working agents and recognizes verification work',()=>{
 const scene=buildOfficeScene([snap],'active',false,new Map()),floor=scene.floors.find(f=>f.kind==='team')!
 assert.equal(officeWorkStation(scene.actors[0]),'quality')
 assert.equal(officeStationUsers(scene,floor,'quality').length,1)
 assert.equal(officeStationUsers(scene,floor,'build').length,0)
 scene.actors[0].hidden=true;assert.equal(officeStationUsers(scene,floor,'quality').length,0)
 scene.actors[0].hidden=false;scene.actors[0].agent.status='done';assert.equal(officeStationUsers(scene,floor,'quality').length,0)
})

it('uses the station work edge as the target for room and fallback layouts',()=>{
 const scene=buildOfficeScene([snap],'active',false,new Map()),floor=scene.floors.find(f=>f.kind==='team')!
 for(const room of ['room-stations','room-stations-large',undefined] as const){
  const f={...floor,room}
  for(const station of officeStations(f,450)){
   assert.deepEqual(officeStationPoint(f,450,station.kind),station.work)
   assert.ok(['front','left','right'].includes(station.facing))
   assert.ok(station.depth>=0&&station.depth<=1)
  }
 }
})

it('routes research tools and search/list/read commands to research without substring false positives',()=>{
 const base=structuredClone(snap.agents[0])
 const classify=(type:string,toolName:string|null,title:string|null=null)=>
  agentWorkStation({...base,activities:[{id:'a',type,toolName,title,startedAt:1}]})
 for(const toolName of ['Grep','Glob','LS','read_file','search_web','WebFetch','find_by_name','list_dir','mcp__t3-code__t3_thread_read']){
  assert.equal(classify('dynamic_tool',toolName),'research',toolName)
 }
 assert.equal(classify('web_search',null,'query'),'research')
 assert.equal(classify('command_execution',null,'Search break room code'),'research')
 assert.equal(classify('command_execution',null,'List office assets'),'research')
 assert.equal(classify('dynamic_tool','read_file','Read web/test/office-art.test.ts'),'research')
 assert.equal(classify('file_change',null,'Edit web/test/office-art.test.ts'),'build')
 assert.equal(classify('dynamic_tool','edit_file','Edit web/test/office-art.test.ts'),'build')
 assert.equal(classify('mcp_tool_call','TodoWrite','Track review step'),'planning')
 for(const title of ['Build latest files','git checkout main','Print project summary']){
  assert.equal(classify('command_execution',null,title),'terminal',title)
 }
})

it('routes review tools, verification commands and taskRole thinking cleanly while keeping titles private',()=>{
 const base=structuredClone(snap.agents[0])
 const classify=(type:string,toolName:string|null,title:string|null=null)=>
  agentWorkStation({...base,activities:[{id:'a',type,toolName,title,startedAt:1}]})
 for(const toolName of ['mcp__t3-code__pull_request_read','mcp__t3-code__pull_request_review','mcp__t3-code__ci_logs']){
  assert.equal(classify('mcp_tool_call',toolName),'quality',toolName)
 }
 for(const title of ['npx tsc --noEmit','git diff --stat','TypeScript check','Review changes','Run vitest','QA audit']){
  assert.equal(classify('command_execution',null,title),'quality',title)
 }
 assert.equal(agentWorkStation({...base,status:'thinking',activities:[],taskRole:'research'}),'research')
 assert.equal(agentWorkStation({...base,status:'thinking',activities:[],taskRole:'review'}),'quality')
 assert.equal(agentWorkStation({...base,status:'thinking',activities:[],taskRole:'test'}),'quality')
 assert.equal(agentWorkStation({...base,status:'thinking',activities:[],taskRole:'implementation'}),'planning')
 assert.equal(agentWorkStation({...base,status:'thinking',activities:[],taskRole:undefined}),'planning')
 assert.equal(agentWorkStation({...base,status:'background',activities:[],taskRole:'research'}),'terminal')

 const before=buildOfficeScene([snap],'active',false,new Map())
 const next=structuredClone(before)
 next.actors[0].agent.activities=[{id:'tool-2',type:'command_execution',toolName:null,title:'SECRET Search review diff',startedAt:2}]
 const events=officeWorkEvents(before,next,3)
 assert.equal(events.length,1)
 assert.equal(events[0].station,'quality')
 assert.ok(!JSON.stringify(events).includes('SECRET'))
 assert.deepEqual(OFFICE_DESKTOP_STATION_NAMES,{planning:'Planning',research:'Research',build:'Build',quality:'Review',terminal:'Terminal'})
})
