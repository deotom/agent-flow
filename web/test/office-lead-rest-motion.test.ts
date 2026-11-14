import {it} from 'node:test'
import assert from 'node:assert/strict'
import {buildOfficeScene} from '../lib/office-model'
import {officeLeadRestTransitions} from '../lib/office-lead-rest'
import {createOfficeLeadRestTrip} from '../lib/office-lead-rest-motion'
import {officeTripFrame} from '../lib/office-motion'
import type {TeamSnapshot} from '../lib/team-types'

const team=(status:'idle'|'running'):TeamSnapshot=>({sessionId:'team',title:'Reports',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name:'Lead',runtime:'codex',model:null,status,task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null},{id:'worker',parentId:'lead',role:'worker',name:'Worker',runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]})
it('walks from the actual work spot into the reading nook and retargets mid-walk back to current work',()=>{
 const work=buildOfficeScene([team('running')],'active',false,new Map(),450),rest=buildOfficeScene([team('idle')],'active',false,new Map(),450)
 const transition=officeLeadRestTransitions(work,rest)[0],from={...transition.from,x:260,y:transition.from.y+8}
 const trip=createOfficeLeadRestTrip(work,rest,transition.actorKey,100,from)!
 assert.ok(trip)
 assert.equal(trip.event.kind,'routine')
 assert.ok(trip.segments.every(s=>s.kind==='walk'))
 assert.deepEqual(officeTripFrame(trip,100).point,{x:from.x,y:from.y})
 assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,{x:transition.to.x,y:transition.to.y})
 const frame=officeTripFrame(trip,trip.startedAt+250),actual={...trip.actor,...frame.point,floorId:frame.floorId!}
 const back=createOfficeLeadRestTrip(rest,work,transition.actorKey,350,actual)!
 assert.deepEqual(officeTripFrame(back,350).point,frame.point)
 assert.match(back.caption,/work station/)
 assert.equal(createOfficeLeadRestTrip(work,work,transition.actorKey,0,work.actors.find(a=>a.key===transition.actorKey)),null)
})
