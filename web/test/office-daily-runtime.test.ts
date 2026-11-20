import {it} from 'node:test'
import assert from 'node:assert/strict'
import {OfficeDailyRuntime} from '../lib/office-daily-runtime'
import {createOfficeLift,advanceOfficeLift,reserveOfficeLiftTrip} from '../lib/office-lift'
import {createOfficeTrip,officeTripFrame} from '../lib/office-motion'
import {OFFICE_CANTEEN_ID,OFFICE_DAILY_SEATS,projectOfficeDailyScene} from '../lib/office-daily-scene'
import {emptyOfficeDailyLedger} from '../lib/office-daily-events'
import type {OfficeActor,OfficeFloor,OfficeScene} from '../lib/office-types'
const floor = (id:string,y:number,kind:OfficeFloor['kind']='team',annexOf?:string):OfficeFloor => ({id,y,height:200,kind,annexOf,sessionId:'team',title:id,subtitle:'',color:'',actorKeys:[]})
const actor:OfficeActor={key:'worker',sessionId:'team',parentKey:null,x:120,y:350,floorId:'private',zone:'lounge',activity:'Resting',runtimeName:'Codex',task:null,
 appearance:{slot:0,kind:'robot',shirt:'#fff',hair:'#000',skin:'#fff',pants:'#000',cut:'',gear:''},
 agent:{id:'worker',parentId:null,role:'lead',name:'Worker',runtime:'codex',model:null,status:'done',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:1}}
const scene:OfficeScene={width:450,height:1000,totalAgents:1,finishedCount:1,quietTeams:[],actors:[actor],floors:[floor('lounge',0,'lounge'),floor('office',200),floor('private',200,'break','office'),floor('canteen',600,'break')]}


const noon=new Date(2026,10,14,12,1)
const input=(runtime:OfficeDailyRuntime,source=scene,at=0,weather:'clear'|'rain'='clear',blocked=false)=>({source,scene:runtime.project(source),date:noon,at,weather,blocked,busyKeys:new Set<string>()})
it('closing a projected canteen returns its height and lower floors without a mode switch',()=>{
 const base={...scene,floors:[floor('lounge',0,'lounge'),floor('office',180),floor('quiet',360,'quiet')],height:544}
 const opened=projectOfficeDailyScene(base,{canteenOpen:true})
 const runtime=new OfficeDailyRuntime()
 const closed=runtime.project(opened)
 assert.deepEqual(closed.floors,base.floors)
 assert.equal(closed.height,base.height)
 assert.deepEqual(runtime.project(closed),closed,'reprojection does not retain or accumulate a blank storey')
})
it('walks lunch guests to genuinely free garden seats when a party starts mid-meal',()=>{
 const source={...scene,actors:[actor,{...actor,key:'second',agent:{...actor.agent,id:'second'}}]}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(source)
 runtime.step({...input(runtime,source),lift})
 const end=Math.max(...[...runtime.guests.values()].map(g=>g.trip!.endsAt))
 runtime.step({...input(runtime,source,end),lift})
 const mealUntil=[...runtime.guests.values()].map(g=>g.until)
 const parties=OFFICE_DAILY_SEATS.slice(0,2).map((seat,i)=>({...actor,key:`party-${i}`,floorId:'lounge',party:true,x:source.width*seat[0],y:200*seat[1]}))
 const next={...source,actors:[...source.actors,...parties]}
 const positions=runtime.actors(runtime.project(next),end)
 runtime.step({...input(runtime,next,end+1,'clear',true),lift})
 const guests=[...runtime.guests.values()]
 assert.deepEqual(guests.map(g=>g.seat).sort(),[2,3])
 for(const g of guests){
  assert.equal(g.phase,'relocating');assert.equal(g.destination,'garden')
  const before=positions.find(a=>a.key===g.actorKey)!
  assert.deepEqual(g.trip!.segments[0].from,{x:before.x,y:before.y})
  assert.ok(!g.trip!.segments.some(s=>s.liftPhase),'changing garden chairs does not reserve the lift')
 }
 const arrived=Math.max(...guests.map(g=>g.trip!.endsAt))
 runtime.step({...input(runtime,next,arrived,'clear',true),lift})
 assert.deepEqual(guests.map(g=>g.until),mealUntil,'moving seats does not restart the meal')
 const seated=runtime.actors(runtime.project(next),arrived)
 assert.ok(seated.every(g=>parties.every(p=>Math.hypot(p.x-g.x,p.y-g.y)>40)))
 assert.equal(runtime.canteenOpen,false)
})
it('moves conflicting guests indoors if a new party occupies every garden seat',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift});const guest=runtime.guests.get(actor.key)!,end=guest.trip!.endsAt
 runtime.step({...input(runtime,scene,end),lift})
 const parties=OFFICE_DAILY_SEATS.map((seat,i)=>({...actor,key:`party-${i}`,floorId:'lounge',party:true,x:scene.width*seat[0],y:200*seat[1]}))
 const next={...scene,actors:[...scene.actors,...parties]}
 runtime.step({...input(runtime,next,end+1,'clear',true),lift})
 assert.equal(guest.destination,'canteen');assert.equal(guest.phase,'relocating');assert.ok(runtime.canteenOpen)
})
it('gives source work priority when three party guests arrive and leaves the free seat for a resting diner',()=>{
 const source={...scene,actors:[actor,{...actor,key:'z-second',agent:{...actor.agent,id:'z-second'}}]}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(source)
 runtime.step({...input(runtime,source),lift})
 const end=Math.max(...[...runtime.guests.values()].map(g=>g.trip!.endsAt));runtime.step({...input(runtime,source,end),lift})
 const parties=OFFICE_DAILY_SEATS.slice(0,3).map((seat,i)=>({...actor,key:`party-${i}`,floorId:'lounge',party:true,x:450*seat[0],y:200*seat[1]}))
 const working={...source,actors:[{...actor,floorId:'office',zone:'desk' as const,agent:{...actor.agent,status:'running' as const}},source.actors[1],...parties]}
 runtime.step({...input(runtime,working,end+1,'clear',true),lift})
 const worker=runtime.guests.get(actor.key)!,diner=runtime.guests.get('z-second')!
 assert.equal(worker.phase,'returning');assert.equal(worker.trip!.actor.floorId,'office')
 assert.equal(diner.destination,'garden');assert.equal(diner.seat,3);assert.equal(diner.phase,'relocating')
})
it('keeps an admitted lunch journey progressing through ordinary same-room work pulses',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const guest=runtime.guests.get(actor.key)!,trip=guest.trip!
 for(let at=1;at<trip.endsAt;at+=4000){
  runtime.step({...input(runtime,scene,at,'clear',true),lift})
  assert.equal(guest.trip,trip,'blocking new admission must not restart an existing walk')
 }
 runtime.step({...input(runtime,scene,trip.endsAt,'clear',true),lift})
 assert.equal(guest.phase,'eating')
})
it('returns a source-working guest despite a continuously busy departure queue',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const guest=runtime.guests.get(actor.key)!,end=guest.trip!.endsAt
 runtime.step({...input(runtime,scene,end),lift})
 const working={...scene,actors:[{...actor,zone:'desk' as const,floorId:'office',agent:{...actor.agent,status:'running' as const}}]}
 runtime.step({...input(runtime,working,end+1,'clear',true),lift})
 assert.equal(guest.phase,'returning','return uses serial lift scheduling without waiting for the whole real queue')
 assert.equal(runtime.actors(runtime.project(working),end+1)[0].zone,'desk')
})
it('admits once, rides the one car, eats without owning it, and returns to the canonical source',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene),before=JSON.stringify(scene)
 runtime.step({...input(runtime),lift})
 assert.equal(runtime.guests.size,1)
 const guest=runtime.guests.get(actor.key)!
 assert.equal(guest.phase,'outbound')
 assert.ok(guest.trip?.segments.some(s=>s.liftPhase==='riding'))
 const end=guest.trip!.endsAt
 runtime.step({...input(runtime,scene,end),lift})
 assert.equal(guest.phase,'eating')
 advanceOfficeLift(lift,end)
 assert.equal(lift.reservations.length,0)
 assert.equal(runtime.actors(scene,end)[0].pose?.sit,true)
 runtime.step({...input(runtime,scene,guest.until),lift})
 assert.equal(guest.phase,'returning')
 runtime.step({...input(runtime,scene,guest.trip!.endsAt),lift})
 assert.equal(runtime.guests.size,0)
 runtime.step({...input(runtime,scene,guest.trip!.endsAt+1),lift})
 assert.equal(runtime.guests.size,0)
 assert.equal(JSON.stringify(scene),before)
 const reload=new OfficeDailyRuntime(runtime.ledger)
 reload.step({...input(reload),lift:createOfficeLift(scene)})
 assert.equal(reload.guests.size,0)
})
it('opens an appended canteen in rain, retains it until guests return, and makes rain relocation a real journey',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const g=runtime.guests.get(actor.key)!,outboundEnd=g.trip!.endsAt
 runtime.step({...input(runtime,scene,outboundEnd),lift})
 assert.equal(g.destination,'garden')
 const garden=runtime.actors(scene,outboundEnd)[0]
 runtime.step({...input(runtime,scene,outboundEnd+1,'rain'),lift})
 assert.equal(runtime.canteenOpen,true)
 runtime.step({...input(runtime,scene,outboundEnd+2,'rain'),lift})
 assert.equal(g.phase,'relocating')
 assert.ok(g.trip!.segments.some(s=>s.liftPhase==='riding'))
 assert.deepEqual(g.trip!.segments[0].from,{x:garden.x,y:garden.y})
 const indoorEnd=g.trip!.endsAt
 runtime.step({...input(runtime,scene,indoorEnd,'rain'),lift})
 assert.equal(g.destination,'canteen')
 assert.equal(runtime.actors(runtime.project(scene),indoorEnd)[0].floorId,OFFICE_CANTEEN_ID)
 runtime.step({...input(runtime,scene,indoorEnd+1,'clear'),lift})
 assert.equal(g.destination,'canteen')
 assert.equal(runtime.canteenOpen,true)
 runtime.step({...input(runtime,scene,g.until,'rain'),lift})
 runtime.step({...input(runtime,scene,g.trip!.endsAt,'rain'),lift})
 assert.equal(runtime.guests.size,0)
 assert.equal(runtime.canteenOpen,false)
})
it('defers admission to real work and returns a reactivated worker from the actual meal position',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,scene,0,'clear',true),lift})
 assert.equal(runtime.guests.size,0)
 runtime.step({...input(runtime),lift})
 const g=runtime.guests.get(actor.key)!
 const end=g.trip!.endsAt
 runtime.step({...input(runtime,scene,end),lift})
 const at=end+1,physical=runtime.actors(scene,at)[0]
 const working={...scene,actors:[{...actor,floorId:'office',zone:'desk' as const,x:200,y:360,agent:{...actor.agent,status:'running' as const}}]}
 runtime.step({...input(runtime,working,at),lift})
 assert.equal(g.phase,'returning')
 assert.deepEqual(g.trip!.segments[0].from,{x:physical.x,y:physical.y})
 assert.equal(g.trip!.actor.floorId,'office')
 assert.equal(g.trip!.actor.agent.status,'running')
 runtime.step({...input(runtime,working,g.trip!.endsAt),lift})
 assert.equal(runtime.guests.size,0)
})
it('does not admit from historical ledger time or exceed four concurrent guests and eight lunch entries',()=>{
 const many={...scene,actors:Array.from({length:12},(_,i)=>({...actor,key:`worker${i}`,agent:{...actor.agent,id:`worker${i}`}}))}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,many),lift})
 assert.ok(runtime.guests.size<=4)
 assert.ok(runtime.ledger.days[0].lunch.length<=4)
 const rollback=new OfficeDailyRuntime({...emptyOfficeDailyLedger(),latestAt:noon.getTime()+60_000})
 rollback.step({...input(rollback,many),lift:createOfficeLift(scene)})
 assert.equal(rollback.guests.size,0)
})

it('cancels a queued lunch before boarding when source work resumes and reports affected foreign reservations',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const g=runtime.guests.get(actor.key)!,original=g.trip!
 const working={...scene,actors:[{...actor,zone:'desk' as const,floorId:'office',x:200,y:360,agent:{...actor.agent,status:'running' as const}}]}
 runtime.step({...input(runtime,working,1),lift})
 assert.equal(g.phase,'returning')
 assert.notEqual(g.trip,original)
 assert.ok(!g.trip!.segments.some(s=>s.liftPhase==='riding'),'returns through the same parent office without the lunch lift ride')
})

it('keeps canteen geometry stable when a new office arrives and removes it while an unrelated garden guest remains',()=>{
 const many={...scene,actors:[actor,{...actor,key:'second',agent:{...actor.agent,id:'second'}}]}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,many,0,'rain'),lift})
 const projected=runtime.project(many),canteen=projected.floors.find(f=>f.id===OFFICE_CANTEEN_ID)!
 const added={...many,floors:[...many.floors,floor('new-room',800)]}
 assert.equal(runtime.project(added).floors.find(f=>f.id===OFFICE_CANTEEN_ID)!.y,canteen.y)
 const guests=[...runtime.guests.values()]
 guests[0].destination='garden';guests[0].indoorNeeded=false;guests[0].trip=null;guests[0].physical={...actor,floorId:'lounge',x:100,y:100};guests[0].phase='eating';guests[0].until=999999
 runtime.guests.delete(guests[1].actorKey)
 runtime.step({...input(runtime,many,1,'clear'),blocked:true,lift})
 assert.equal(runtime.canteenOpen,false)
 assert.equal(runtime.project(many).floors.some(f=>f.id===OFFICE_CANTEEN_ID),false)
})

it('compacts retained rooms added below the canteen while a garden guest remains active',()=>{
 const many={...scene,actors:[actor,{...actor,key:'second',agent:{...actor.agent,id:'second'}}]}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,many,0,'rain'),lift})
 const added={...many,floors:[...many.floors,floor('new-room',800)]}
 runtime.step({...input(runtime,added,1,'rain'),blocked:true,lift})
 const opened=runtime.project(added),canteen=opened.floors.find(f=>f.id===OFFICE_CANTEEN_ID)!,room=opened.floors.find(f=>f.id==='new-room')!
 assert.ok(room.y>canteen.y)
 const guests=[...runtime.guests.values()]
 guests[0].destination='garden';guests[0].indoorNeeded=false;guests[0].trip=null;guests[0].physical={...actor,floorId:'lounge',x:100,y:100};guests[0].phase='eating';guests[0].until=999999
 runtime.guests.delete(guests[1].actorKey)
 runtime.step({...input(runtime,added,2,'clear'),blocked:true,lift})
 const closed=runtime.project(added)
 assert.equal(runtime.guests.size,1)
 assert.equal(runtime.canteenOpen,false)
 assert.equal(closed.floors.find(f=>f.id==='new-room')!.y,room.y-canteen.height!*.9)
 assert.ok(closed.height<opened.height)
 assert.deepEqual(runtime.project(added),closed)
})

it('yields an unboarded routine reservation to a real arrival and reports the invalidated suffix',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const guest=runtime.guests.get(actor.key)!,physical=runtime.actors(scene,1)[0]
 const newcomer={...actor,key:'newcomer',floorId:'office',zone:'desk' as const,agent:{...actor.agent,id:'newcomer',status:'running' as const}}
 const next={...runtime.project(scene),actors:[actor,newcomer]}
 const arrival=createOfficeTrip({id:'arrival',kind:'arrived',actorKey:'newcomer',parentKey:null,at:1},{...scene,actors:[actor]},next,1)!
 reserveOfficeLiftTrip(lift,arrival,next,1)
 let affected:readonly string[]=[]
 runtime.step({...input(runtime,scene,1),blocked:true,preemptQueuedTravel:true,lift,onLiftCancelled:keys=>{affected=keys}})
 assert.equal(guest.trip,null)
 assert.equal(guest.phase,'outbound')
 assert.deepEqual(affected,['newcomer'])
 assert.deepEqual(runtime.actors(scene,1).map(a=>({x:a.x,y:a.y})),[{x:physical.x,y:physical.y}])
})

it('returns a still-idle lead referenced by urgent work and keeps an aboard passenger until the doors clear',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const guest=runtime.guests.get(actor.key)!,trip=guest.trip!
 const riding=trip.segments.find(s=>s.liftPhase==='riding')!
 const at=trip.startedAt+trip.segments.slice(0,trip.segments.indexOf(riding)).reduce((sum,s)=>sum+s.duration,0)+riding.duration/2
 const point=officeTripFrame(trip,at).point
 runtime.step({...input(runtime,scene,at),busyKeys:new Set([actor.key]),lift})
 assert.equal(guest.trip,trip,'a passenger is not teleported out of a moving car')
 assert.equal(guest.returnNeeded,true)
 assert.deepEqual(runtime.actors(scene,at).map(a=>({x:a.x,y:a.y})),[point])
 runtime.step({...input(runtime,scene,trip.endsAt),busyKeys:new Set([actor.key]),lift})
 assert.equal(guest.phase,'returning')
 assert.equal(runtime.actors(scene,trip.endsAt)[0].pose?.sit,false)
})

it('finishes at most eight lunch admissions across multiple four-person waves',()=>{
 const many={...scene,actors:Array.from({length:12},(_,i)=>({...actor,key:`person${i}`,agent:{...actor.agent,id:`person${i}`}}))}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 let at=0
 for(let iteration=0;iteration<100;iteration++){
  runtime.step({...input(runtime,many,at),lift})
  assert.ok(runtime.guests.size<=4)
  assert.ok(runtime.ledger.days[0].lunch.length<=8)
  const times=[...runtime.guests.values()].map(g=>g.trip?.endsAt??g.until).filter(t=>t>at)
  if(!times.length)break
  at=Math.min(...times)+1
 }
 assert.equal(runtime.ledger.days[0].lunch.length,8)
 assert.equal(runtime.guests.size,0)
 assert.equal(new Set(runtime.ledger.days[0].lunch).size,8)
})

it('retains a vanished home until a real return and exposes its physical origin for lifecycle departure',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime,scene,0,'rain'),lift})
 const guest=runtime.guests.get(actor.key)!,end=guest.trip!.endsAt
 runtime.step({...input(runtime,scene,end,'rain'),lift})
 const departed={...scene,actors:[],floors:scene.floors.filter(f=>f.id==='lounge')}
 const before=runtime.actors(runtime.project(departed),end+1)[0]
 runtime.step({...input(runtime,departed,end+1,'rain'),lift})
 assert.equal(guest.phase,'returning')
 assert.deepEqual(guest.trip!.segments[0].from,{x:before.x,y:before.y})
 assert.ok(guest.trip!.segments.some(s=>s.kind==='ride'))
 assert.equal(runtime.project(departed).floors.some(f=>f.id==='private'),true)
 runtime.step({...input(runtime,departed,guest.trip!.endsAt,'rain'),lift})
 assert.equal(runtime.guests.size,0)
 assert.equal(runtime.completedOrigins.get(actor.key)!.floorId,'private')
 assert.equal(runtime.canteenOpen,false)
 assert.equal(runtime.project(departed).floors.some(f=>f.id==='private'),false)
})

it('reroutes queued rain travel from its actual walking point and shifts reserved timelines during construction',()=>{
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(scene)
 runtime.step({...input(runtime),lift})
 const guest=runtime.guests.get(actor.key)!,point=runtime.actors(scene,1)[0]
 runtime.step({...input(runtime,scene,1,'rain'),lift})
 assert.equal(guest.phase,'relocating')
 assert.equal(guest.destination,'canteen')
 assert.deepEqual(guest.trip!.segments[0].from,{x:point.x,y:point.y})
 const prior=guest.trip!,sample=officeTripFrame(prior,100)
 runtime.shiftMotion(1234)
 assert.deepEqual(officeTripFrame(guest.trip!,1334).point,sample.point)
 assert.equal(guest.trip!.endsAt,prior.endsAt+1234)
})
