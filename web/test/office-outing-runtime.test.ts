import {it} from 'node:test'
import assert from 'node:assert/strict'
import {OfficeDailyRuntime} from '../lib/office-daily-runtime'
import {createOfficeLift,advanceOfficeLift} from '../lib/office-lift'
import {officeAppearance} from '../lib/office-model'
import {OFFICE_DAILY_SEATS} from '../lib/office-daily-scene'
import {officeOutingVendorPoint} from '../lib/office-outing-trips'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
const person=(key:string):OfficeActor=>({key,sessionId:'s',parentKey:'lead',floorId:'private',x:90+(key==='b'?90:0),y:390,zone:'lounge',task:null,appearance:officeAppearance(0),activity:'Resting',runtimeName:'Codex',agent:{id:key,parentId:'lead',role:'worker',name:key,runtime:'codex',model:null,status:'done',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:1}})
const scene:OfficeScene={width:450,height:650,totalAgents:2,finishedCount:2,quietTeams:[],actors:[person('a'),person('b')],floors:[{id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'',actorKeys:[],y:0,height:253},{id:'team',kind:'team',sessionId:'s',title:'Office',subtitle:'',color:'',actorKeys:[],y:228,height:253},{id:'private',kind:'break',annexOf:'team',sessionId:'s',title:'Rest',subtitle:'',color:'',actorKeys:['a','b'],y:228,height:253}]}
function settle(runtime:OfficeDailyRuntime,lift:ReturnType<typeof createOfficeLift>,at:number,source=scene){
 for(let i=0;i<30;i++){
  runtime.step({...input(runtime,at,source),lift})
  const pending=[...runtime.guests.values()].filter(g=>g.phase!=='eating'&&!g.returnNeeded)
  if(!pending.length)return at
  const ends=pending.flatMap(g=>g.trip&&g.trip.endsAt>at?[g.trip.endsAt]:[])
  at=ends.length?Math.min(...ends):at+1
 }
 assert.fail('admitted outing did not settle after real arrival, queue, pickup and seat walks')
}
const date=(night=false)=>new Date(2026,10,15,night?23:14,20)
const input=(runtime:OfficeDailyRuntime,at:number,source=scene,night=false,weather:'clear'|'rain'='clear')=>({source,scene:runtime.project(source),date:date(night),at,weather,blocked:false,busyKeys:new Set<string>()})
it('admits daytime outings after the initial delay, uses one lift and never writes outing attendance into the daily ledger',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene),before=JSON.stringify(scene)
 runtime.step({...input(runtime,0),lift});assert.equal(runtime.guests.size,0)
 const due=runtime.outingSchedule.nextAt!;assert.ok(due>=20000&&due<=40000)
 runtime.step({...input(runtime,due),lift});assert.equal(runtime.guests.size,2)
 const guests=[...runtime.guests.values()];assert.ok(guests.every(g=>g.kind==='outing'))
 const end=settle(runtime,lift,Math.min(...guests.map(g=>g.trip!.endsAt)))
 assert.ok(guests.every(g=>g.phase==='eating'))
 advanceOfficeLift(lift,end);assert.equal(lift.reservations.length,0,'the car is free throughout the break')
 assert.ok(runtime.ledger.days.every(d=>d.coffee.length+d.lunch.length+d.tea.length===0))
 assert.equal(JSON.stringify(scene),before)
})
it('keeps nighttime outings to one and returns a newly working participant from their actual position',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,0,scene,true),lift});const due=runtime.outingSchedule.nextAt!
 assert.ok(due>=45000&&due<=75000)
 runtime.step({...input(runtime,due,scene,true),lift});assert.equal(runtime.guests.size,1)
 const g=[...runtime.guests.values()][0];assert.ok(g.outing?.night)
 const end=g.trip!.endsAt;runtime.step({...input(runtime,end,scene,true),lift})
 const actual=runtime.actors(runtime.project(scene),end)[0]
 const source={...scene,actors:scene.actors.map(a=>a.key===g.actorKey?{...a,floorId:'team',zone:'desk' as const,agent:{...a.agent,status:'running' as const}}:a)}
 runtime.step({...input(runtime,end+1,source,true),blocked:true,lift})
 assert.equal(g.phase,'returning');assert.deepEqual(g.trip!.segments[0].from,{x:actual.x,y:actual.y})
 assert.equal(runtime.actors(runtime.project(source),end+1)[0].agent.status,'running')
})
it('rain sends an outing home instead of opening a temporary canteen',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,0),lift});runtime.step({...input(runtime,runtime.outingSchedule.nextAt!),lift})
 const end=Math.max(...[...runtime.guests.values()].map(g=>g.trip!.endsAt));runtime.step({...input(runtime,end),lift})
 runtime.step({...input(runtime,end+1,scene,false,'rain'),lift})
 assert.ok([...runtime.guests.values()].every(g=>g.destination==='home'&&g.phase==='relocating'))
 assert.equal(runtime.canteenOpen,false)
 assert.ok(!runtime.project(scene).floors.some(f=>f.room==='room-canteen'))
})
it('settles into the actual rest seat and eases up before departure without booking another car',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,0),lift});runtime.step({...input(runtime,runtime.outingSchedule.nextAt!),lift})
 const g=[...runtime.guests.values()][0];settle(runtime,lift,Math.min(...[...runtime.guests.values()].map(g=>g.trip!.endsAt)));const arrived=g.restStartedAt!
 g.outing!.action='drink'
 const poseAt=(at:number)=>runtime.actors(runtime.project(scene),at).find(a=>a.key===g.actorKey)!.pose!
 assert.equal(poseAt(arrived).seatBlend,0)
 assert.ok(poseAt(arrived+175).seatBlend!>0&&poseAt(arrived+175).seatBlend!<1)
 assert.equal(poseAt(arrived+351).seatBlend,1)
 assert.ok(poseAt(g.until-175).seatBlend!<1)
 assert.equal(poseAt(g.until).seatBlend,0)
 assert.equal(poseAt(arrived+175).sit,true)
})
it('does not resume an uncollected daytime shopping trip at the closed nighttime cart',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,0),lift});const due=runtime.outingSchedule.nextAt!
 runtime.step({...input(runtime,due),lift});const guest=[...runtime.guests.values()][0]
 guest.outing!.action='snack';guest.outing!.collected=false
 runtime.step({...input(runtime,due+1,scene,true),lift})
 assert.equal(guest.returnNeeded,true)
 assert.equal(guest.phase,'returning')
 assert.equal(runtime.art(date(true),runtime.project(scene),due+1).guests.find(g=>g.actorKey===guest.actorKey)!.night,true)
})
it('briefly shares a collected snack at home, then releases the visitor without another lift booking',()=>{
 const source={...scene,actors:[...scene.actors,person('z-friend')]}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(source)
 runtime.step({...input(runtime,0,source),lift});runtime.step({...input(runtime,runtime.outingSchedule.nextAt!,source),lift})
 const g=[...runtime.guests.values()][0],end=settle(runtime,lift,Math.min(...[...runtime.guests.values()].map(g=>g.trip!.endsAt)),source)
 runtime.step({...input(runtime,end,source),lift});g.outing!.action='snack';g.outing!.collected=true
 runtime.step({...input(runtime,g.until,source),lift});const homeAt=g.trip!.endsAt
 runtime.step({...input(runtime,homeAt,source),lift})
 assert.ok(runtime.guests.has(g.actorKey),'the bag is shared before this visitor relinquishes ownership')
 assert.match(runtime.actors(runtime.project(scene),homeAt).find(a=>a.key===g.actorKey)!.activity,/sharing/)
 runtime.step({...input(runtime,homeAt+4501,source),lift})
 assert.equal(runtime.guests.has(g.actorKey),false)
 assert.equal(lift.reservations.filter(r=>r.actorKey===g.actorKey&&r.end>homeAt).length,0)
})
it('gives a newly opened lunch window priority over existing outings without mixing attendance kinds',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene),morning=new Date(2026,10,15,11,40),lunch=new Date(2026,10,15,12,0)
 runtime.step({...input(runtime,0),date:morning,lift})
 runtime.step({...input(runtime,runtime.outingSchedule.nextAt!),date:morning,lift})
 const guests=[...runtime.guests.values()],end=Math.max(...guests.map(g=>g.trip!.endsAt))
 runtime.step({...input(runtime,end),date:morning,lift})
 runtime.step({...input(runtime,end+1),date:lunch,lift})
 assert.ok(guests.every(g=>g.returnNeeded&&g.phase==='returning'))
 const returned=Math.max(...guests.map(g=>g.trip!.endsAt))
 runtime.step({...input(runtime,returned),date:lunch,lift})
 assert.ok([...runtime.guests.values()].every(g=>g.kind==='lunch'))
 assert.equal(runtime.ledger.days.find(d=>d.day==='2026-11-15')?.lunch.length,2)
})
it('still collects the snack when a party takes the reserved seat before the cart is reached',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,0),lift});const due=runtime.outingSchedule.nextAt!
 runtime.step({...input(runtime,due),lift})
 const g=[...runtime.guests.values()][0];g.outing!.action='snack';g.outing!.collected=false
 const reservedSeat=g.seat,[x,y]=OFFICE_DAILY_SEATS[reservedSeat]
 const party={...person('party'),floorId:'garden',x:x*scene.width,y:y*253,party:true}
 const source={...scene,actors:[...scene.actors,party]}
 runtime.step({...input(runtime,due+1,source),lift})
 assert.notEqual(g.seat,reservedSeat,'occupied picnic seat is reassigned independently of the shop arrival')
 let clock=due+1
 for(let i=0;i<20&&g.shop?.stage!=='serving';i++){
  const ends=[...runtime.guests.values()].flatMap(guest=>guest.trip&&guest.trip.endsAt>clock?[guest.trip.endsAt]:[])
  clock=ends.length?Math.min(...ends):clock+1;runtime.step({...input(runtime,clock,source),lift})
 }
 const vendor=officeOutingVendorPoint(runtime.project(source))!
 const pickup=g.trip!.segments.findIndex(s=>s.kind==='hold'&&s.duration===1400&&s.floorId===vendor.floorId&&Math.hypot(s.to.x-vendor.x,s.to.y-vendor.y)<1)
 assert.ok(pickup>=0,'the relocated journey retains the actual cart stop')
 const pickupAt=g.trip!.startedAt+g.trip!.segments.slice(0,pickup).reduce((sum,s)=>sum+s.duration,0)+700
 runtime.step({...input(runtime,pickupAt,source),lift})
 assert.equal(g.outing!.collected,false,'the bag belongs to the clerk until the pickup hold finishes')
 runtime.step({...input(runtime,pickupAt+701,source),lift})
 assert.equal(g.outing!.collected,true)
})
it('finds the next real sharing peer when an earlier returner is only putting snacks away',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,0),lift});const due=runtime.outingSchedule.nextAt!
 runtime.step({...input(runtime,due),lift})
 const [first,second]=[...runtime.guests.values()],peer=person('friend')
 first.outing!.sharingUntil=due+5000
 second.outing!.sharingUntil=due+5000;second.outing!.sharingWith=peer.key
 const source={...scene,actors:[...scene.actors,peer]}
 assert.equal(runtime.sharingPeer(source,due+1),peer.key)
 assert.equal(runtime.sharingPeer({...source,actors:source.actors.map(a=>a.key===peer.key?{...a,hidden:true}:a)},due+1),null)
 assert.equal(runtime.sharingPeer({...source,actors:source.actors.map(a=>a.key===peer.key?{...a,agent:{...a.agent,status:'running' as const}}:a)},due+1),null)
})
