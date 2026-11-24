import test from 'node:test'
import assert from 'node:assert/strict'
import { assignOfficeIdentities, buildOfficeScene, officeKey } from '../lib/office-model'
import { createOfficeTravelPath, createOfficeTrip, officeArrivalMeetingStop, officeDepartureScene, officeMeetingActor, officePresenceEvents, officeTripFrame } from '../lib/office-motion'
import { officeWorkExchange } from '../lib/office-communication'
import { addOfficeArrivals, advanceOfficeArrivals } from '../lib/office-arrivals'
import { createOfficeLift, closeOfficeLiftGardenDoor, callOfficeLiftToGarden, officeLiftFrame, officeGardenLiftButton, toggleOfficeGardenLift, shiftOfficeLiftTime, advanceOfficeLift, cancelOfficeLiftTrips, reserveOfficeLiftTrip } from '../lib/office-lift'
import { officeInsideLift, officeLanding, officeLiftApproachDistance, officeNavigation } from '../lib/office-navigation'
import { roomDesktopWorkpoints, roomLeadMeetingPoint, roomLeadRestPoint } from '../lib/office-room-design'
import type { TeamSnapshot } from '../lib/team-types'
const team=(count:number):TeamSnapshot=>({sessionId:'a',title:'a',active:true,updatedAt:1,tasks:[],agents:Array.from({length:count},(_,i)=>({id:`a${i}`,parentId:i?'a0':null,role:i?'worker':'lead',name:`Agent ${i}`,runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}))})
const scene=(count:number,desktop=false)=>{const t=team(count);return buildOfficeScene([t],'active',false,assignOfficeIdentities(t.agents.map(a=>officeKey(t.sessionId,a.id))),450,new Set(),[],{},desktop)}
const setup=(desktop=false)=>{const before=scene(1,desktop),next=scene(3,desktop),lift=createOfficeLift(next),trips=addOfficeArrivals(new Map(),officePresenceEvents(before,next,new Set(['a']),0),before,next,0,lift);return {before,next,lift,trips}}
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

test('Desktop walkers round the workbenches and use the side aisle on the way to the lift',()=>{
 const source=team(3),office=buildOfficeScene([source],'active',false,new Map(),450,new Set(),[],{},true)
 const floor=office.floors.find(f=>f.kind==='team')!,height=floor.height!
 const place=(x:number,y:number)=>({x:x*office.width,y:floor.y+y*height})
 for(const destination of [place(.24,.538),officeLanding(office,floor.id)!]){
  const path=createOfficeTravelPath(office,office,place(.625,.918),floor.id)
  path.travel(destination,floor.id)
  assert.deepEqual(path.segments.at(-1)?.to,destination)
  for(const step of path.segments)for(let i=0;i<=40;i++){
   const ratio=i/40,x=(step.from.x+(step.to.x-step.from.x)*ratio)/office.width
   const y=(step.from.y+(step.to.y-step.from.y)*ratio-floor.y)/height
   assert.ok(!(x>.067&&x<.80&&y>.77&&y<.90),'feet do not pass through the front workbenches')
  }
 }
})

test('Desktop lift connects the garden pavilion to the front floor of the workroom',()=>{
 const office=scene(3,true),nav=officeNavigation(office)
 const floor=office.floors.find(f=>f.kind==='team')!
 const stop=nav.landings.find(landing=>landing.id===floor.id)!
 const threshold=(stop.y-floor.y)/floor.height!
 assert.equal(nav.hatch.x,nav.shaftX)
 assert.ok(threshold>=.94&&threshold<=.955,'the sill lines up with the front floorboards')
 const visitor=roomLeadMeetingPoint(floor,office.width)
 assert.ok(nav.shaftX-office.width*.068-visitor.x>=24,'a visitor leaves an arm of clearance beside the painted jamb')
 assert.ok(Math.hypot(visitor.x-stop.x,visitor.y-stop.y)>=35,'the waiter and visitor have separate standing space')
 assert.ok(stop.x-visitor.x>=12,'the waiter stands to the right of the Lead visitor')
 assert.equal(stop.x,nav.shaftX-officeLiftApproachDistance(office,floor.id))
 const path=createOfficeTravelPath(office,office,office.actors[0],floor.id)
 path.travel({x:office.width*.62,y:nav.hatch.y},office.floors.find(f=>f.kind==='lounge')!.id)
 const board=path.segments.find(segment=>segment.liftPhase==='boarding')!
 assert.deepEqual(board.from,{x:stop.x,y:stop.y})
 assert.deepEqual(board.to,{x:nav.shaftX,y:stop.y})
 const garden=office.floors.find(f=>f.kind==='lounge')!
 const returning=createOfficeTravelPath(office,office,nav.hatch,garden.id)
 returning.travel(office.actors[0],floor.id)
 const checkThreshold=(route:typeof path,phase:'boarding'|'alighting')=>{
  const index=route.segments.findIndex(s=>s.liftPhase===phase&&s.floorId===floor.id)
  const segment=route.segments[index]
  const start=route.segments.slice(0,index).reduce((sum,s)=>sum+s.duration,0)
  const actor=office.actors[0]
  const trip={...route,event:{kind:'left' as const,id:'walk',actorKey:actor.key,parentKey:null,at:0},
   actor,actorKey:actor.key,startedAt:0,endsAt:route.segments.reduce((sum,s)=>sum+s.duration,0),
   caption:'',shaftX:nav.shaftX,rungPitch:nav.rungPitch}
  const midpoint=officeTripFrame(trip,start+segment.duration/2)
  assert.ok(midpoint.point.x>office.width*.83&&midpoint.point.x<office.width*.97)
  assert.ok(Math.abs(midpoint.point.y-stop.y)<1e-9,'feet stay level while crossing the sill')
  assert.equal(midpoint.pose.inLift,false,'feet are still outside the cabin')
  assert.equal(midpoint.pose.liftCrossing,true,'the crossing sprite is visible over the sill')
  assert.equal(midpoint.pose.walk,true)
 }
 checkThreshold(path,'boarding')
 checkThreshold(returning,'alighting')
})

test('passengers signal at the threshold before boarding and ease into cabin scale',()=>{
 const {next,lift,trips}=setup(true),trip=[...trips.values()][0],segments=trip.segments
 const apronDistance=officeLiftApproachDistance(next)
 let time=trip.startedAt
 const calls:ReturnType<typeof officeTripFrame>[]=[]
 for(const segment of segments){
  if(segment.liftWait==='press')calls.push(officeTripFrame(trip,time+segment.duration/2))
  if(segment.liftPhase==='boarding'&&segment.kind==='walk'){
   const start=officeTripFrame(trip,time),middle=officeTripFrame(trip,time+segment.duration/2)
   assert.equal(start.point.x,trip.shaftX-apronDistance)
   assert.equal(start.pose.liftBlend,0)
   assert.ok(middle.pose.liftBlend!>0&&middle.pose.liftBlend!<1)
  }
  if(segment.liftPhase==='alighting')assert.equal(segment.to.x,trip.shaftX-officeLiftApproachDistance(next,segment.floorId))
  if(segment.liftPhase==='riding'){
   const at=time+segment.duration/4
   assert.ok(Math.abs(officeTripFrame(trip,at).point.y-officeLiftFrame(lift,at).y)<1e-9)
  }
  time+=segment.duration
 }
 assert.equal(calls.length,1)
 assert.ok(calls[0].pose.hand&&!calls[0].pose.inLift&&!calls[0].pose.walk)
 assert.equal(officeInsideLift(next,{x:calls[0].point.x,pose:calls[0].pose}),false)
 assert.ok(calls[0].point.x+28<trip.shaftX-30,'a full painted character clears the foreground jamb')
})

test('the manual garden call reports waiting and works with animation disabled',()=>{
 const office=scene(2,true),lift=createOfficeLift(office)
 toggleOfficeGardenLift(lift,office,0,true)
 assert.equal(officeGardenLiftButton(lift,office,0).state,'waiting')
 assert.equal(officeGardenLiftButton(lift,office,lift.availableAt).state,'open','the button becomes ready even before compaction')
 advanceOfficeLift(lift,lift.availableAt)
 assert.equal(officeGardenLiftButton(lift,office,lift.availableAt).state,'open')
 toggleOfficeGardenLift(lift,office,lift.availableAt,false)
 assert.equal(officeGardenLiftButton(lift,office,lift.availableAt).state,'ready')
 toggleOfficeGardenLift(lift,office,lift.availableAt,false)
 assert.equal(officeGardenLiftButton(lift,office,lift.availableAt).state,'open')
})

test('Desktop lead and teammate reach opposite sides of the conversation table together',()=>{
 const office=scene(2,true),[lead,worker]=office.actors
 const floor=office.floors.find(f=>f.id===lead.floorId)!
 const trip=createOfficeTrip({id:'report',kind:'sent',actorKey:worker.key,parentKey:lead.key,at:0},office,office,0)!
 assert.equal(trip.meetingPartner?.actorKey,lead.key)
 let time=trip.startedAt
 for(const segment of trip.segments){
  if(segment.meeting){
   const at=time+segment.duration/2
   assert.deepEqual(officeTripFrame(trip,at).point,roomLeadMeetingPoint(floor,office.width))
   assert.deepEqual(officeTripFrame(trip.meetingPartner!,at).point,roomLeadRestPoint(floor,office.width))
   return
  }
  time+=segment.duration
 }
 assert.fail('There must be a stationary conversation phase')
})

test('Desktop workers rise from a painted seat before walking and stay seated after arrival',()=>{
 const office=scene(2,true),actor=office.actors[1],floor=office.floors.find(row=>row.id===actor.floorId)!
 Object.assign(actor,roomDesktopWorkpoints(floor,office.width,'terminal')[0].feet,{workStation:'terminal'})
 const target=roomDesktopWorkpoints(floor,office.width,'quality')[0].feet
 const trip=createOfficeTrip({id:'station-change',kind:'activity',station:'quality',actorKey:actor.key,parentKey:actor.parentKey,at:0},office,office,0,target)!
 const first=trip.segments[0],rise=officeTripFrame(trip,first.duration/2)
 assert.equal(first.riseFrom,'terminal')
 assert.equal(rise.seatStation,'terminal')
 assert.equal(rise.pose.seatBlend,.5)
 assert.equal(rise.pose.walk,false)
 assert.equal(officeTripFrame(trip,trip.endsAt-1).pose.seatBlend,1)
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

test('Desktop finished workers meet Lead at the round table for sent and received before entering the break room',()=>{
 const doneTeam=team(2);doneTeam.agents[1].status='done'
 const before=scene(2,true)
 const next=buildOfficeScene([doneTeam],'active',false,assignOfficeIdentities(doneTeam.agents.map(a=>officeKey(doneTeam.sessionId,a.id))),450,new Set(),[],{},true)
 const lead=next.actors.find(a=>a.agent.role==='lead')!
 const beforeWorker=before.actors.find(a=>a.key!==lead.key)!
 const nextWorker=next.actors.find(a=>a.key===beforeWorker.key)!
 const teamFloor=next.floors.find(f=>f.id===lead.floorId)!
 assert.notEqual(nextWorker.floorId,teamFloor.id,'done worker belongs to the break-room annex')
 for(const kind of ['sent','received'] as const){
  for(const origin of [before,next]){
   const trip=createOfficeTrip({id:`handoff-${kind}`,kind,actorKey:beforeWorker.key,parentKey:lead.key,at:0},origin,next,0)!
   assert.equal(trip.meetingPartner?.actorKey,lead.key,`${kind} triggers a round-table meeting even after break-room transfer`)
   let t=trip.startedAt,meetingAt=-1,walkAt=-1
   for(const segment of trip.segments){
    if(segment.meeting){meetingAt=t+segment.duration/2;break}
    if(walkAt<0&&segment.kind==='walk'&&segment.duration>0)walkAt=t+segment.duration/2
    t+=segment.duration
   }
   assert.ok(meetingAt>0)
   if(walkAt>=0)assert.equal(officeTripFrame(trip,walkAt).pose.carry,true)
   const workerFrame=officeTripFrame(trip,meetingAt)
   const leadFrame=officeTripFrame(trip.meetingPartner!,meetingAt)
   assert.deepEqual(workerFrame.point,roomLeadMeetingPoint(teamFloor,next.width))
   assert.deepEqual(leadFrame.point,roomLeadRestPoint(teamFloor,next.width))
   assert.equal(workerFrame.floorId,teamFloor.id)
   assert.equal(workerFrame.pose.carry,false)
   assert.equal(workerFrame.pose.hand,false)
   const partnerActor=officeMeetingActor(trip,next,meetingAt)!
   assert.equal(partnerActor.floorId,teamFloor.id)
   assert.equal(partnerActor.stand,true)
   assert.equal(partnerActor.objectAction,undefined)
   const meetingScene={...next,actors:next.actors.map(a=>a.key===beforeWorker.key?{...a,...workerFrame.point,floorId:workerFrame.floorId!,zone:'lounge' as const}:a.key===lead.key?partnerActor:a)}
   assert.equal(officeWorkExchange(trip,meetingScene,meetingAt)?.remote,false)
   const afterAt=Math.min(trip.endsAt-1,meetingAt+1000)
   assert.equal(officeTripFrame(trip,afterAt).pose.carry,false,'parcel is put down after the round-table handoff')
   const doneWorker=officeTripFrame(trip,trip.endsAt)
   const doneLead=officeTripFrame(trip.meetingPartner!,trip.meetingPartner!.endsAt)
   assert.deepEqual(doneWorker.point,{x:nextWorker.x,y:nextWorker.y})
   assert.equal(doneWorker.floorId,nextWorker.floorId)
   assert.deepEqual(doneLead.point,{x:lead.x,y:lead.y})
   assert.equal(doneLead.floorId,lead.floorId)
  }
 }
})

test('Desktop newly assigned arrivals target the round table and then meet Lead before walking to their desk',()=>{
 const desktop=scene(2,true),[lead,worker]=desktop.actors
 const floor=desktop.floors.find(f=>f.id===lead.floorId)!
 const stop=officeArrivalMeetingStop(desktop,worker.key,lead.key)!
 assert.deepEqual(stop,roomLeadMeetingPoint(floor,desktop.width))
 assert.equal(officeArrivalMeetingStop(scene(2,false),worker.key,lead.key),null)
 const beforeAtTable={...desktop,actors:desktop.actors.map(a=>a.key===worker.key?{...a,...stop}:a)}
 const trip=createOfficeTrip({id:'assign',kind:'assigned',actorKey:worker.key,parentKey:lead.key,at:0},beforeAtTable,desktop,0)!
 assert.equal(trip.meetingPartner?.actorKey,worker.key)
 const meetingAt=trip.startedAt+trip.segments.slice(0,trip.segments.findIndex(s=>s.meeting)).reduce((n,s)=>n+s.duration,0)+500
 assert.deepEqual(officeTripFrame(trip,meetingAt).point,roomLeadRestPoint(floor,desktop.width))
 assert.deepEqual(officeTripFrame(trip.meetingPartner!,meetingAt).point,stop)
 const end=officeTripFrame(trip.meetingPartner!,trip.meetingPartner!.endsAt)
 assert.deepEqual(end.point,{x:worker.x,y:worker.y})
 assert.equal(end.floorId,worker.floorId)
})
