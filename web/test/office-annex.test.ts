import test from 'node:test'
import assert from 'node:assert/strict'
import { assignOfficeIdentities, buildOfficeScene, officeKey } from '../lib/office-model'
import { officeInteriorDoor, officeLanding, officeNavigation } from '../lib/office-navigation'
import { createOfficeTrip, officeTripFrame } from '../lib/office-motion'
import { addOfficeArrivals, advanceOfficeArrivals, officeActorsWithArrivals } from '../lib/office-arrivals'
import type { TeamSnapshot } from '../lib/team-types'
const team=(resting:boolean):TeamSnapshot=>({sessionId:'s',title:'Team',active:true,updatedAt:1,tasks:[],agents:[
 {id:'lead',parentId:null,role:'lead',name:'Lead',runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null},
 {id:'worker',parentId:'lead',role:'worker',name:'Worker',runtime:null,model:null,status:resting?'done':'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null},
]})
const scene=(resting:boolean)=>{const t=team(resting);return buildOfficeScene([t],'active',false,assignOfficeIdentities(t.agents.map(a=>officeKey(t.sessionId,a.id))))}

test('doorway crossing gently occludes and reveals the walker on either side',()=>{
 for(const [before,next] of [[scene(false),scene(true)],[scene(true),scene(false)]]){
  const key=officeKey('s','worker'),old=before.actors.find(a=>a.key===key)!,actor=next.actors.find(a=>a.key===key)!
  const trip=createOfficeTrip({id:'cross',kind:'finished',actorKey:key,parentKey:actor.parentKey,at:0},before,next,0)!
  const softened=new Set<string>()
  for(let t=0;t<trip.endsAt;t+=30){const f=officeTripFrame(trip,t),opacity=(f.pose as {opacity?:number}).opacity??1;assert.ok(opacity>=0&&opacity<=1);if(opacity>0&&opacity<1)softened.add(f.floorId!)}
  assert.deepEqual([...softened].sort(),[old.floorId,actor.floorId].sort())
 }
})

test('rest rooms are same-floor annexes and add no building height or external ladder landing',()=>{
 const work=scene(false),rest=scene(true),main=rest.floors.find(f=>f.kind==='team')!,annex=rest.floors.find(f=>f.kind==='break')!
 assert.equal(annex.annexOf,main.id)
 assert.equal(annex.y,main.y);assert.equal(annex.height,main.height)
 assert.equal(rest.height,work.height)
 assert.deepEqual(officeNavigation(rest).landings.map(l=>l.id),[main.id])
 assert.deepEqual(officeInteriorDoor(rest,annex.id),officeInteriorDoor(rest,main.id))
 assert.deepEqual(officeLanding(rest,annex.id),officeInteriorDoor(rest,main.id))
})

test('workers enter their own annex through the office door, without climbing, and return through it',()=>{
 for(const [before,next] of [[scene(false),scene(true)],[scene(true),scene(false)]]){
  const key=officeKey('s','worker'),old=before.actors.find(a=>a.key===key)!,actor=next.actors.find(a=>a.key===key)!
  const trip=createOfficeTrip({id:'room',kind:'finished',actorKey:key,parentKey:actor.parentKey,at:0},before,next,0)!
  const door=officeInteriorDoor(next,actor.floorId)!
  assert.ok(trip.segments.length>2)
  assert.equal(trip.segments.some(s=>s.kind==='ride'),false)
  assert.ok(trip.segments.some(s=>s.to.x===door.x&&s.to.y===door.y))
  assert.equal(officeTripFrame(trip,0).floorId,old.floorId)
  assert.equal(officeTripFrame(trip,trip.endsAt).floorId,actor.floorId)
  for(let t=0;t<trip.endsAt;t+=100){const frame=officeTripFrame(trip,t);assert.ok([old.floorId,actor.floorId].includes(frame.floorId!));assert.equal(frame.pose.climb,false)}
 }
})

test('assigned public landings stay available while all newcomers are still entering from the garden',()=>{
 const target=scene(false),main=target.floors.find(f=>f.kind==='team')!
 target.actors.forEach(actor=>{actor.floorId='lounge';actor.y=100})
 assert.ok(main.actorKeys.length>0)
 assert.deepEqual(officeNavigation(target).landings.map(l=>l.id),[main.id])
 const empty={...target,floors:target.floors.map(f=>({...f,actorKeys:[]}))}
 assert.equal(officeNavigation(empty).landings.length,0)
})

test('desk actors in both room sizes leave the interior door threshold unobstructed',()=>{
 for(const count of [4,8]){
  const t=team(false),lead=t.agents[0]
  t.agents=Array.from({length:count},(_,i)=>({...lead,id:`a${i}`,parentId:i?'a0':null,role:i?'worker':'lead'}))
  const building=buildOfficeScene([t],'active',false,assignOfficeIdentities(t.agents.map(a=>officeKey(t.sessionId,a.id))))
  const room=building.floors.find(f=>f.kind==='team')!,door=officeInteriorDoor(building,room.id)!,scale=building.width/450
  const people=building.actors.filter(a=>a.floorId===room.id&&!a.hidden)
  assert.equal(people.length,count)
  for(const person of people)assert.ok(person.x+22*scale<door.x-17*scale,`${count}-person room: ${person.agent.name} blocks the door`)
 }
})

test('an arrival that finishes en route enters the annex via its parent office',()=>{
 const before=scene(false),key=officeKey('s','worker'),empty={...before,actors:before.actors.filter(a=>a.key!==key)}
 const initial=addOfficeArrivals(new Map(),[{id:'arrive',kind:'arrived',actorKey:key,parentKey:officeKey('s','lead'),at:0}],empty,before,0)
 const actorBefore=officeActorsWithArrivals(before,initial,1000).find(a=>a.key===key)!
 const rest=scene(true),advanced=advanceOfficeArrivals(initial,rest,1000),actorAfter=officeActorsWithArrivals(rest,advanced.trips,1000).find(a=>a.key===key)!
 assert.equal(actorBefore.x,actorAfter.x);assert.equal(actorBefore.y,actorAfter.y)
 const trip=advanced.trips.get(key)!,annex=rest.floors.find(f=>f.kind==='break')!,door=officeInteriorDoor(rest,annex.id)!
 assert.ok(trip.segments.some(s=>s.to.x===door.x&&s.to.y===door.y))
 assert.equal(officeTripFrame(trip,trip.endsAt).floorId,annex.id)
})
