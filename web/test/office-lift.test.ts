import test from 'node:test'
import assert from 'node:assert/strict'
import { assignOfficeIdentities, buildOfficeScene, officeKey } from '../lib/office-model'
import { createOfficeTrip, officeDepartureScene, officePresenceEvents, officeTripFrame } from '../lib/office-motion'
import { addOfficeArrivals, advanceOfficeArrivals } from '../lib/office-arrivals'
import { createOfficeLift, closeOfficeLiftGardenDoor, callOfficeLiftToGarden, officeLiftFrame, shiftOfficeLiftTime, advanceOfficeLift, cancelOfficeLiftTrips, reserveOfficeLiftTrip } from '../lib/office-lift'
import { officeLanding, officeNavigation } from '../lib/office-navigation'
import type { TeamSnapshot } from '../lib/team-types'
const team=(count:number):TeamSnapshot=>({sessionId:'a',title:'a',active:true,updatedAt:1,tasks:[],agents:Array.from({length:count},(_,i)=>({id:`a${i}`,parentId:i?'a0':null,role:i?'worker':'lead',name:`Agent ${i}`,runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}))})
const scene=(count:number)=>{const t=team(count);return buildOfficeScene([t],'active',false,assignOfficeIdentities(t.agents.map(a=>officeKey(t.sessionId,a.id))))}
const setup=()=>{const before=scene(1),next=scene(3),lift=createOfficeLift(next),trips=addOfficeArrivals(new Map(),officePresenceEvents(before,next,new Set(['a']),0),before,next,0,lift);return {before,next,lift,trips}}
test('one car carries serial newcomers to exact landings and returns empty for the next pickup',()=>{
 const {next,lift,trips}=setup(),ordered=[...trips.values()]
 assert.ok(ordered[1].startedAt>=ordered[0].endsAt)
 let emptyReturn=false,rides=0
 for(let now=0;now<ordered.at(-1)!.endsAt;now+=20){
  const car=officeLiftFrame(lift,now)
  if(car.moving&&car.passengerKeys.length===0)emptyReturn=true
  const passengers=ordered.filter(trip=>officeTripFrame(trip,now).pose.inLift&&now>=trip.startedAt&&now<trip.endsAt)
  assert.ok(passengers.length<=1)
  for(const trip of passengers){const frame=officeTripFrame(trip,now);assert.ok(Math.abs(frame.point.y-car.y)<.001);if(frame.elevatorY!==null){rides++;assert.equal(car.doorsOpen,0);assert.deepEqual(car.passengerKeys,[trip.actorKey])}}
 }
 assert.ok(emptyReturn);assert.ok(rides>0)
 for(const trip of ordered){const ride=trip.segments.find(s=>s.kind==='ride')!;assert.equal(ride.from.y,officeNavigation(next).hatch.y);assert.equal(ride.to.y,officeLanding(next,trip.actor.floorId)!.y)}
})
test('boarding crosses an open door and closing/opening each retain the passenger',()=>{
 const {lift,trips}=setup(),trip=[...trips.values()][0]
 let now=trip.startedAt
 for(const segment of trip.segments){
  const car=officeLiftFrame(lift,now+segment.duration/2)
  if(segment.liftPhase==='boarding'||segment.liftPhase==='alighting')assert.equal(car.doorsOpen,1)
  if(segment.liftPhase==='closing'||segment.liftPhase==='opening'){assert.ok(car.doorsOpen>0&&car.doorsOpen<1);assert.deepEqual(car.passengerKeys,[trip.actorKey])}
  now+=segment.duration
 }
})
test('garden threshold crossing belongs to the boarding phase before the door closes',()=>{
 const {trips}=setup(),trip=[...trips.values()][1]
 const boarding=trip.segments.find(s=>s.liftPhase==='boarding')!
 assert.equal(boarding.kind,'walk');assert.ok(boarding.from.x<trip.shaftX);assert.equal(boarding.to.x,trip.shaftX)
 const approach=trip.segments.slice(0,trip.segments.indexOf(boarding)).filter(s=>s.kind==='walk')
 assert.ok(approach.every(s=>s.to.x<trip.shaftX||s.from.y!==boarding.to.y),'a right-edge approach stays on the foreground path until reaching the lift waiting side')
})
test('pause shifts the car timeline and compaction retains its final physical position',()=>{
 const {lift,trips}=setup(),trip=[...trips.values()][0],ride=trip.segments.find(s=>s.kind==='ride')!
 const now=trip.startedAt+trip.segments.slice(0,trip.segments.indexOf(ride)).reduce((n,s)=>n+s.duration,0)+ride.duration/2
 const frame=officeLiftFrame(lift,now);shiftOfficeLiftTime(lift,5000)
 const shifted=officeLiftFrame(lift,now+5000)
 assert.ok(Math.abs(shifted.y-frame.y)<1e-9)
 assert.deepEqual({...shifted,y:frame.y},frame)
 const end=[...trips.values()].at(-1)!.endsAt+5000
 const final=officeLiftFrame(lift,end);advanceOfficeLift(lift,end)
 assert.deepEqual(officeLiftFrame(lift,end+10000),final);assert.equal(lift.reservations.length,0)
})
test('retargeting during a ride preserves car and passenger positions and cancels vanished queues',()=>{
 const {next,lift,trips}=setup(),trip=[...trips.values()][0],ride=trip.segments.find(s=>s.kind==='ride')!
 const now=trip.startedAt+trip.segments.slice(0,trip.segments.indexOf(ride)).reduce((n,s)=>n+s.duration,0)+ride.duration/2
 const oldCar=officeLiftFrame(lift,now),oldActor=officeTripFrame(trip,now)
 const changed=structuredClone(next);changed.floors.filter(f=>f.kind==='team').forEach(f=>f.y+=70);changed.actors.forEach(a=>a.y+=70)
 const advanced=advanceOfficeArrivals(trips,changed,now,lift),current=advanced.trips.get(trip.actorKey)!
 assert.equal(officeLiftFrame(lift,now).y,oldCar.y);assert.deepEqual(officeTripFrame(current,now).point,oldActor.point)
 const latest=officeLiftFrame(lift,now+1).y;assert.ok(Math.abs(latest-oldCar.y)<1)
 cancelOfficeLiftTrips(lift,new Set(advanced.trips.keys()),now)
 assert.equal(lift.availableAt,now);assert.equal(officeLiftFrame(lift,now).y,oldCar.y)
})
test('garden entrance fades in and departure fades away',()=>{
 const {before,next,trips}=setup(),trip=[...trips.values()][0]
 assert.equal(officeTripFrame(trip,trip.startedAt).pose.opacity,0)
 assert.ok(officeTripFrame(trip,trip.startedAt+trip.segments[0].duration/2).pose.opacity!>.4)
 const leaving=createOfficeTrip({id:'left',kind:'left',actorKey:next.actors[1].key,parentKey:null,at:0},next,before,0)!
 assert.equal(officeTripFrame(leaving,leaving.endsAt).pose.opacity,0)
})
test('work on the same floor leaves the physical car and its schedule alone',()=>{
 const {next,lift}=setup(),actor=next.actors[0]
 const work=createOfficeTrip({id:'work',kind:'activity',actorKey:actor.key,parentKey:null,at:0},next,next,0)!
 const prior=structuredClone(lift),scheduled=reserveOfficeLiftTrip(lift,work,next,0)
 assert.deepEqual(lift,prior);assert.equal(scheduled.startedAt,0)
})
test('retargeting while doors open closes them again before changing floors',()=>{
 const {next,lift,trips}=setup(),trip=[...trips.values()][0],opening=trip.segments.find(s=>s.liftPhase==='opening')!
 const now=trip.startedAt+trip.segments.slice(0,trip.segments.indexOf(opening)).reduce((n,s)=>n+s.duration,0)+opening.duration/2
 const changed=structuredClone(next);changed.floors.filter(f=>f.kind==='team').forEach(f=>f.y+=70);changed.actors.forEach(a=>a.y+=70)
 advanceOfficeArrivals(trips,changed,now,lift)
 for(let t=now;t<now+2000;t+=10){const car=officeLiftFrame(lift,t);if(car.moving)assert.equal(car.doorsOpen,0)}
})
test('arrivals rebuild canceled reservations rather than traveling without their car',()=>{
 const {next,lift,trips}=setup()
 cancelOfficeLiftTrips(lift,new Set(trips.keys()),100)
 assert.equal(lift.reservations.length,0)
 const repaired=advanceOfficeArrivals(trips,next,100,lift)
 assert.ok(lift.reservations.length>0)
 for(const trip of repaired.trips.values())assert.ok(lift.reservations.some(leg=>leg.actorKey===trip.actorKey))
})
test('a garden retarget keeps the faded actor outside the threshold until boarding',()=>{
 const {next,lift,trips}=setup(),trip=[...trips.values()][0],now=100
 const opacity=officeTripFrame(trip,now).pose.opacity
 const changed=structuredClone(next);changed.actors.forEach(a=>a.x+=1)
 const repaired=advanceOfficeArrivals(trips,changed,now,lift).trips.get(trip.actorKey)!
 assert.equal(officeTripFrame(repaired,now).pose.opacity,opacity)
 const boarding=repaired.segments.find(s=>s.liftPhase==='boarding')!
 assert.ok(boarding.from.x<repaired.shaftX);assert.equal(boarding.kind,'walk')
})

test('a garden call waits for existing passengers and brings the empty car back without a jump',()=>{
 const {next,lift,trips}=setup(),now=1000,before=officeLiftFrame(lift,now),oldEnd=lift.availableAt
 callOfficeLiftToGarden(lift,next,now)
 assert.deepEqual(officeLiftFrame(lift,now),before)
 assert.ok(lift.availableAt>oldEnd)
 const calledEnd=lift.availableAt;callOfficeLiftToGarden(lift,next,now)
 assert.equal(lift.availableAt,calledEnd,'repeated calls share the existing return journey')
 const returned=officeLiftFrame(lift,lift.availableAt+1)
 assert.equal(returned.y,officeNavigation(next).hatch.y);assert.equal(returned.doorsOpen,1)
 assert.deepEqual(returned.passengerKeys,[])
 assert.ok([...trips.values()].every(t=>t.endsAt<=oldEnd))
})

test('departures retain their floor while simultaneous new arrivals finish their single-car queue',()=>{
 const before=scene(1),a=team(1);a.agents[0].status='idle'
 const b={...team(1),sessionId:'b',title:'B'}
 const next=buildOfficeScene([a,b],'active',false,new Map()),held=officeDepartureScene(before,next,[a,b])
 const oldFloor=before.floors.find(f=>f.kind==='team')!,oldHeld=held.floors.find(f=>f.id===oldFloor.id)!
 const added=held.floors.find(f=>f.kind==='team'&&f.sessionId==='b')!
 assert.equal(oldHeld.y,oldFloor.y);assert.ok(added.y>=oldHeld.y+oldHeld.height!)
 assert.equal(oldHeld.working,0);assert.equal(oldHeld.subtitle,'Heading home','held floors must not claim stale ongoing work')
 const leaving=held.actors.find(actor=>actor.sessionId==='a')!
 assert.equal(leaving.hidden,false,'departing person stays visible until leaving')
 const event={id:'home',kind:'left' as const,actorKey:leaving.key,parentKey:null,at:1}
 assert.ok(createOfficeTrip(event,before,next,0),'current hidden state must not erase the observed departure')
 const lift=createOfficeLift(held),events=officePresenceEvents(before,next,new Set(['a']),0,new Set(['b']))
 const incoming=advanceOfficeArrivals(addOfficeArrivals(new Map(),events,before,next,0,lift),held,0,lift).trips
 const arrival=[...incoming.values()][0],departure=reserveOfficeLiftTrip(lift,createOfficeTrip(event,before,held,0)!,held,0)
 assert.ok(departure.startedAt>=arrival.endsAt)
 assert.equal(officeLiftFrame(lift,departure.endsAt+1).y,officeNavigation(held).hatch.y)
})

test('a queued garden call survives retargeting the arrival itinerary',()=>{
 const {next,lift,trips}=setup(),now=1000
 callOfficeLiftToGarden(lift,next,now)
 const changed=structuredClone(next);changed.floors.filter(f=>f.kind==='team').forEach(f=>f.y+=40);changed.actors.forEach(a=>a.y+=40)
 advanceOfficeArrivals(trips,changed,now,lift)
 const returned=officeLiftFrame(lift,lift.availableAt+1)
 assert.equal(returned.y,officeNavigation(changed).hatch.y)
 assert.equal(returned.doorsOpen,1)
})
test('rendered layout tween frames do not keep restarting a stable arrival destination',()=>{
 const {next,lift,trips}=setup(),original=[...trips.values()][0]
 let pending=trips
 for(let i=1;i<=8;i++){
  const visual=structuredClone(next);visual.actors.forEach(a=>a.y+=i*.5)
  pending=advanceOfficeArrivals(pending,visual,100+i*16,lift,next).trips
  assert.equal(pending.get(original.actorKey)!.startedAt,original.startedAt)
  assert.equal(pending.get(original.actorKey)!.endsAt,original.endsAt)
 }
})

test('manual garden doors reverse continuously and cannot interrupt passenger reservations',()=>{
 const destination=scene(1),lift=createOfficeLift(destination)
 callOfficeLiftToGarden(lift,destination,0)
 const before=officeLiftFrame(lift,325)
 assert.ok(before.doorsOpen>0&&before.doorsOpen<1)
 assert.equal(closeOfficeLiftGardenDoor(lift,destination,325),true)
 assert.deepEqual(officeLiftFrame(lift,325),before)
 assert.equal(officeLiftFrame(lift,lift.availableAt+1).doorsOpen,0)
 assert.equal(lift.gardenCallPending,false)
 const busy=setup(),prior=structuredClone(busy.lift)
 assert.equal(closeOfficeLiftGardenDoor(busy.lift,busy.next,0),false)
 assert.deepEqual(busy.lift,prior)
})
