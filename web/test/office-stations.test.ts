import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeStations, officeStationUsers } from '../lib/office-stations'
import { buildOfficeScene } from '../lib/office-model'
import { officeWorkStation } from '../lib/office-work'
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
