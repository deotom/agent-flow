import test from 'node:test'
import assert from 'node:assert/strict'
import { addOfficeArrivals, advanceOfficeArrivals, officeActorsWithArrivals } from '../lib/office-arrivals'
import { officePresenceEvents } from '../lib/office-motion'
import { assignOfficeIdentities, buildOfficeScene, officeKey } from '../lib/office-model'
import type { TeamSnapshot } from '../lib/team-types'
const team=(sessionId:string,count:number):TeamSnapshot=>({sessionId,title:sessionId,active:true,updatedAt:1,tasks:[],agents:Array.from({length:count},(_,i)=>({id:`a${i}`,parentId:i?'a0':null,role:i?'worker':'lead',name:`Agent ${i}`,runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}))})
const scene=(teams:TeamSnapshot[])=>buildOfficeScene(teams,'active',false,assignOfficeIdentities(teams.flatMap(t=>t.agents.map(a=>officeKey(t.sessionId,a.id)))))

test('new agents wait outside and enter serially without desk flashes or queue expiry',()=>{
 const before=scene([team('a',1)]),next=scene([team('a',5)])
 const events=officePresenceEvents(before,next,new Set(['a']),1000)
 const trips=addOfficeArrivals(new Map(),events,before,next,0)
 assert.equal(trips.size,4)
 const starts=[...trips.values()].map(t=>t.startedAt)
 assert.equal(starts[0],0)
 const ordered=[...trips.values()]
 for(let i=1;i<ordered.length;i++)assert.ok(starts[i]>=ordered[i-1].endsAt)
 const visible=officeActorsWithArrivals(next,trips,0)
 assert.equal(visible.length,2)
 const first=visible.find(a=>a.key===events[0].actorKey)!
 assert.notEqual(first.y,next.actors.find(a=>a.key===first.key)!.y)
 assert.ok(first.x<0||first.x>next.width,'arrival starts beyond the garden frame before entering the lift')
 const later=advanceOfficeArrivals(trips,next,16000)
 assert.ok(later.completed.length>0||later.trips.size>0)
 const finished=advanceOfficeArrivals(later.trips,next,100000)
 assert.equal(finished.trips.size,0)
 assert.equal(officeActorsWithArrivals(next,finished.trips,100000).length,5)
})

test('new live teams enter but baseline, scope history and terminal agents do not replay',()=>{
 const before=scene([team('a',1)]),next=scene([team('a',1),team('b',2)])
 assert.equal(officePresenceEvents(null,next,new Set(['a']),1000,new Set(['b'])).length,0)
 assert.equal(officePresenceEvents(before,next,new Set(['a']),1000).length,0)
 assert.equal(officePresenceEvents(before,next,new Set(['a']),1000,new Set(['b'])).filter(e=>e.kind==='arrived').length,2)
 const history=structuredClone(next);history.actors.filter(a=>a.sessionId==='b').forEach(a=>a.agent.status='done')
 assert.equal(officePresenceEvents(before,history,new Set(['a']),1000,new Set(['b'])).filter(e=>e.kind==='arrived').length,0)
})

test('an entrance retargets continuously after floor changes and removes vanished actors',()=>{
 const before=scene([team('a',1)]),next=scene([team('a',2)])
 const trips=addOfficeArrivals(new Map(),officePresenceEvents(before,next,new Set(['a']),1000),before,next,0)
 const moving=officeActorsWithArrivals(next,trips,1000).find(a=>trips.has(a.key))!
 const shifted=structuredClone(next);shifted.actors.forEach(a=>a.y+=70);shifted.floors.filter(f=>f.kind==='team').forEach(f=>f.y+=70)
 const advanced=advanceOfficeArrivals(trips,shifted,1000)
 const after=officeActorsWithArrivals(shifted,advanced.trips,1000).find(a=>advanced.trips.has(a.key))!
 assert.equal(after.x,moving.x);assert.equal(after.y,moving.y)
 const gone=advanceOfficeArrivals(advanced.trips,before,1100)
 assert.equal(gone.trips.size,0)
})
