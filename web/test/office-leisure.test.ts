import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeLeisureObjects, nearestLeisureActor, officeLeisureForSpot,createOfficeLeisureTrip } from '../lib/office-leisure'
import { buildOfficeScene } from '../lib/office-model'
import { officeLife } from '../lib/office-life'
import type {TeamSnapshot} from '../lib/team-types'
const snap:TeamSnapshot={sessionId:'s',title:'Team',active:true,updatedAt:1,tasks:[],agents:['lead','rest'].map((id,i)=>({id,role:i?'worker':'lead',parentId:i?'lead':null,name:id,runtime:'codex',model:null,status:i?'done':'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}))}
it('walks to the selected object along the floor, uses it, then returns without changing job status',()=>{
 const scene=buildOfficeScene([snap],'active',false,new Map()),floor=scene.floors.find(f=>f.kind==='break')!,object=officeLeisureObjects(floor,scene.width).at(-1)!
 const actor=scene.actors.find(a=>a.zone==='lounge')!,before=JSON.stringify(scene)
 const trip=createOfficeLeisureTrip(scene,actor.key,object,0)!
 assert.ok(trip.segments.some(s=>s.kind==='hold'&&s.from.x===object.x&&s.from.y===object.y))
 assert.ok(trip.segments.every(s=>s.kind!=='ride'))
 assert.deepEqual(trip.segments.at(-1)!.to,{x:actor.x,y:actor.y})
 assert.equal(JSON.stringify(scene),before)
 assert.equal(createOfficeLeisureTrip(scene,scene.actors.find(a=>a.zone==='desk')!.key,object,0),null)
})
it('selects only visible resting people for objects in their own room',()=>{
 const scene=buildOfficeScene([snap],'active',false,new Map()),floor=scene.floors.find(f=>f.kind==='break')!
 const objects=officeLeisureObjects(floor,scene.width)
 assert.ok(objects.length>0)
 const actor=nearestLeisureActor(scene,floor,objects[0])!
 assert.equal(actor.agent.id,'rest')
 assert.equal(nearestLeisureActor(scene,scene.floors.find(f=>f.kind==='team')!,objects[0]),null)
 actor.hidden=true;assert.equal(nearestLeisureActor(scene,floor,objects[0]),null)
})
it('uses props during rest and parties while preserving real work ownership',()=>{
 const scene=buildOfficeScene([snap],'active',false,new Map()),actor=scene.actors.find(a=>a.zone==='lounge')!
 assert.ok(officeLeisureForSpot('room-break-reading',0))
 for(const kind of ['coffee','book','game','water','music','snack'] as const){
   assert.equal(officeLife(actor,3,{objectAction:kind}).objectAction,kind)
   assert.equal(officeLife({...actor,party:true},3,{objectAction:kind}).objectAction,kind)
   assert.equal(officeLife(actor,3,{objectAction:kind,tripActive:true}).objectAction,undefined)
 }
})
