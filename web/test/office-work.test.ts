import { it } from 'node:test'
import assert from 'node:assert/strict'
import { buildOfficeScene } from '../lib/office-model'
import { officeWorkEvents, officeWorkPulse } from '../lib/office-work'
import { createOfficeTrip } from '../lib/office-motion'
import type { TeamSnapshot } from '../lib/team-types'

const snapshot:TeamSnapshot={sessionId:'s',title:'Team',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',role:'lead',parentId:null,name:'Lead',runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
const scene=()=>buildOfficeScene([structuredClone(snapshot)],'active',false,new Map())
it('uses newly observed tools for work-station trips without replaying initial history',()=>{
 const before=scene(),next=scene()
 next.actors[0].agent.status='running'
 next.actors[0].agent.activities=[{id:'tool-1',type:'file_change',toolName:null,title:'PRIVATE',startedAt:2}]
 assert.deepEqual(officeWorkEvents(null,next,3),[])
 const events=officeWorkEvents(before,next,3)
 assert.equal(events.length,1);assert.equal(events[0].station,'build')
 assert.ok(!JSON.stringify(events).includes('PRIVATE'))
 assert.deepEqual(officeWorkEvents(next,next,4),[])
 const trip=createOfficeTrip(events[0],before,next,0)!
 assert.ok(trip);assert.ok(trip.segments.some(s=>s.kind==='walk'))
 assert.ok(trip.segments.every(s=>s.kind!=='ride'))
 assert.deepEqual(trip.segments.at(-1)?.to,{x:next.actors[0].x,y:next.actors[0].y})
})
it('represents current thinking at the planning board, never sends resting or hidden people to work',()=>{
 const next=scene(),event=officeWorkPulse(next,0,10)!
 assert.equal(event.station,'planning')
 const trip=createOfficeTrip(event,next,next,0)!
 assert.ok(trip.caption.includes('planning board'))
 next.actors[0].hidden=true;assert.equal(officeWorkPulse(next,0,10),null)
 next.actors[0].hidden=false;next.actors[0].agent.status='idle'
 assert.equal(officeWorkPulse(next,0,10),null)
})
