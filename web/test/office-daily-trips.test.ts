import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createOfficeRoutineTrip } from '../lib/office-daily-trips'
import { officeTripFrame } from '../lib/office-motion'
import { officeInteriorDoor, officeNavigation } from '../lib/office-navigation'
import { advanceOfficeLift, createOfficeLift, officeLiftFrame, reserveOfficeLiftTrip } from '../lib/office-lift'
import type { OfficeActor, OfficeFloor, OfficeScene } from '../lib/office-types'

const floor = (id:string,y:number,kind:OfficeFloor['kind']='team',annexOf?:string):OfficeFloor => ({id,y,height:200,kind,annexOf,sessionId:'team',title:id,subtitle:'',color:'',actorKeys:[]})
const actor:OfficeActor={key:'worker',sessionId:'team',parentKey:null,x:120,y:350,floorId:'private',zone:'lounge',activity:'Resting',runtimeName:'Codex',task:null,
 appearance:{slot:0,kind:'robot',shirt:'#fff',hair:'#000',skin:'#fff',pants:'#000',cut:'',gear:''},
 agent:{id:'worker',parentId:null,role:'lead',name:'Worker',runtime:'codex',model:null,status:'done',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:1}}
const scene:OfficeScene={width:450,height:1000,totalAgents:1,finishedCount:1,quietTeams:[],actors:[actor],floors:[floor('lounge',0,'lounge'),floor('office',200),floor('private',200,'break','office'),floor('canteen',600,'break')]}

it('walks out of an annex through its parent door and uses the phased shared lift to the canteen',()=>{
 const before=JSON.stringify(scene),target={floorId:'canteen',x:130,y:750}
 const trip=createOfficeRoutineTrip(scene,actor.key,target,100,'is collecting lunch')!
 assert.ok(trip)
 assert.equal(trip.event.kind,'routine')
 assert.equal(trip.caption,'is collecting lunch')
 assert.equal(trip.event.parentKey,null)
 assert.deepEqual(officeTripFrame(trip,100).point,{x:actor.x,y:actor.y})
 assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,{x:130,y:750})
 assert.equal(officeTripFrame(trip,trip.endsAt).floorId,'canteen')
 assert.equal(officeTripFrame(trip,trip.endsAt).done,true)
 assert.deepEqual(trip.segments.filter(s=>s.liftPhase).map(s=>s.liftPhase),['boarding','closing','riding','opening','alighting'])
 const door=officeInteriorDoor(scene,'private')!
 assert.ok(trip.segments.some(s=>s.floorId==='private'&&s.to.x===door.x&&s.to.y===door.y))
 assert.deepEqual(trip.segments.filter(s=>s.opacity).map(s=>[s.floorId,s.opacity]),[['private',[1,0]],['office',[0,1]]])
 assert.ok(trip.segments.filter(s=>s.kind==='ride').every(s=>s.from.x===officeNavigation(scene).shaftX&&s.to.x===officeNavigation(scene).shaftX))
 assert.notEqual(trip.segments.at(-1)?.kind,'hold','meal time is outside the journey')
 assert.equal(JSON.stringify(scene),before)
})

it('reserves only each travel leg and leaves the shared car free during a meal',()=>{
 const lift=createOfficeLift(scene),before=JSON.stringify(lift),target={floorId:'canteen',x:130,y:750}
 const raw=createOfficeRoutineTrip(scene,actor.key,target,100,'is collecting lunch')!
 assert.equal(JSON.stringify(lift),before,'constructing a journey has no lift side effects')
 const outbound=reserveOfficeLiftTrip(lift,raw,scene,100)
 const ride=outbound.segments.find(s=>s.liftPhase==='riding')!
 const rideStart=outbound.startedAt+outbound.segments.slice(0,outbound.segments.indexOf(ride)).reduce((sum,s)=>sum+s.duration,0)
 assert.deepEqual(officeLiftFrame(lift,rideStart+ride.duration/2).passengerKeys,[actor.key])
 advanceOfficeLift(lift,outbound.endsAt)
 assert.equal(lift.reservations.length,0)
 const mealEnd=outbound.endsAt+90_000
 assert.equal(officeLiftFrame(lift,mealEnd).moving,false)
 const from={...actor,...target}
 const inbound=reserveOfficeLiftTrip(lift,createOfficeRoutineTrip(scene,actor.key,actor,mealEnd,'is returning',from)!,scene,mealEnd)
 assert.equal(inbound.startedAt,mealEnd)
 assert.ok(lift.reservations.length>0)
 assert.ok(lift.reservations.every(s=>s.start>=mealEnd))
})

it('returns from the garden or canteen to a newly working actor via the annex without changing source data',()=>{
 const working={...actor,agent:{...actor.agent,status:'running' as const}}
 const current={...scene,actors:[working]},before=JSON.stringify(current)
 for(const source of [{floorId:'lounge',x:50,y:100},{floorId:'canteen',x:130,y:750}]){
  const from={...actor,...source},trip=createOfficeRoutineTrip(current,actor.key,actor,500,'is returning to work',from)!
  assert.deepEqual(officeTripFrame(trip,500).point,{x:source.x,y:source.y})
  assert.equal(officeTripFrame(trip,trip.endsAt).floorId,'private')
  assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,{x:actor.x,y:actor.y})
  assert.equal(trip.actor.agent.status,'running')
  assert.deepEqual(trip.segments.filter(s=>s.opacity).map(s=>[s.floorId,s.opacity]),[['office',[1,0]],['private',[0,1]]])
 }
 assert.equal(JSON.stringify(current),before)
})

it('keeps same-floor trips on foot and starts an interrupted journey at the supplied physical point',()=>{
 const from={...actor,x:195,y:370},trip=createOfficeRoutineTrip(scene,actor.key,{floorId:'private',x:170,y:360},0,'is getting coffee',from)!
 assert.deepEqual(officeTripFrame(trip,0).point,{x:195,y:370})
 assert.ok(trip.segments.every(s=>s.kind==='walk'&&!s.liftPhase&&s.floorId==='private'))
})
it('keeps a quiet indoor visit at its current seat instead of taking a pointless door detour',()=>{
 const trip=createOfficeRoutineTrip(scene,actor.key,{floorId:actor.floorId,x:actor.x,y:actor.y},100,'is taking a quiet break')!
 assert.equal(trip.endsAt,100)
 assert.ok(trip.segments.every(s=>s.kind==='hold'&&s.duration===0))
 assert.deepEqual(officeTripFrame(trip,100).point,{x:actor.x,y:actor.y})
})

it('rejects invalid geometry and actors but permits an explicit last-known actor for safe departure',()=>{
 const target={floorId:'lounge',x:60,y:100},empty={...scene,actors:[]}
 assert.equal(createOfficeRoutineTrip(scene,'missing',target,0,'return'),null)
 assert.equal(createOfficeRoutineTrip(scene,actor.key,{...target,floorId:'missing'},0,'return'),null)
 assert.equal(createOfficeRoutineTrip(scene,actor.key,target,0,'return',{...actor,floorId:'missing'}),null)
 assert.equal(createOfficeRoutineTrip(empty,actor.key,target,0,'return'),null)
 assert.ok(createOfficeRoutineTrip(empty,actor.key,target,0,'return',actor))
 assert.equal(createOfficeRoutineTrip(empty,actor.key,target,0,'return',{...actor,key:'other'}),null)
})
