import {it} from 'node:test'
import assert from 'node:assert/strict'
import {createOfficeTrip,officeTripFrame,officeWorkTripFrame} from '../lib/office-motion'
import {officeWorkTarget} from '../lib/office-work'
import {rememberOfficeWorkPlace,officeActorAtWorkPlace,officeSceneAtWorkPlaces,officeWorkPresenceTarget} from '../lib/office-work-presence'
import type {OfficeActor,OfficeScene,OfficeEvent,OfficePoint} from '../lib/office-types'
import {roomActorSpots,roomLeadRestPoint,roomStationSpots} from '../lib/office-room-design'
import {officeActorSupport} from '../lib/office-support'
import {officeActorRenderScale} from '../lib/office-depth'

const actor:OfficeActor={key:'worker',sessionId:'s',floorId:'team',x:15,y:279,zone:'desk',parentKey:null,task:null,activity:'Working',runtimeName:'Codex',stand:true,
 appearance:{slot:0,kind:'human',shirt:'#369',hair:'#321',skin:'#cba',pants:'#333',cut:'',gear:''},
 agent:{id:'worker',parentId:null,role:'worker',name:'Worker',runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}}
const scene=():OfficeScene=>({width:450,height:500,floors:[{id:'team',sessionId:'s',kind:'team',y:200,height:100,title:'Team',subtitle:'',color:'#abc',actorKeys:['worker']}],actors:[structuredClone(actor)],quietTeams:[],totalAgents:1,finishedCount:0})
const event:OfficeEvent={id:'work',kind:'activity',station:'build',actorKey:'worker',parentKey:null,at:1}

it('uses a left-wall Planning desk, then gives a second planner their own notebook',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:310.5,room:'room-stations',desktopArt:true}
 const first={...s.actors[0],workStation:'planning' as const,agent:{...actor.agent,status:'thinking' as const}}
 const target=officeWorkPresenceTarget({...s,actors:[first]},first,'planning',new Map())
 assert.ok(target.x<s.width*.12)
 const seated={...first,...target}
 const pose=officeActorSupport(s,seated,{},officeActorRenderScale(s,seated),seated)
 assert.ok(pose.sit&&pose.supportHands)
 assert.equal(pose.workGesture?.kind,'note')
 const second={...first,key:'second'}
 const overflow=officeWorkPresenceTarget({...s,actors:[seated,second]},second,'planning',new Map())
 assert.notDeepEqual(overflow,target)
 assert.ok(overflow.y>s.floors[0].y+s.floors[0].height!*.90)
 const atNotebook={...second,...overflow}
 assert.equal(officeActorSupport(s,atNotebook,{},1,atNotebook).workGesture?.notebook,true)
 const trip=createOfficeTrip({...event,station:'planning'},s,{...s,actors:[first]},0,target)!
 let at=0
 const note=trip.segments.find(segment=>{if(segment.planningNote)return true;at+=segment.duration;return false})
 assert.ok(note,'a newly observed planning activity can stop at the board briefly')
 assert.ok(officeTripFrame(trip,at+note.duration/2).pose.planningNote)
 assert.deepEqual(trip.segments.at(-1)?.to,target)
})

it('places Desktop Build and Terminal workers on the front worktops, with their hands in reach',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:450*.69,room:'room-stations',desktopArt:true}
 for(const station of ['build','terminal'] as const){
  const person={...s.actors[0],workStation:station}
  const point=officeWorkPresenceTarget(s,person,station,new Map())
  const atBench={...person,...point}
  const pose=officeActorSupport(s,atBench,{},officeActorRenderScale(s,atBench),point,1)
  assert.ok(point.y>s.floors[0].y+s.floors[0].height!*.86,'feet stay at the painted front bench')
  assert.ok(pose.supportHands,'the worker can reach its own worktop')
  assert.equal(Boolean(pose.sit),station==='terminal')
  if(station==='terminal'){
   assert.ok(pose.seatHeight!>20,'the hips reach the stool while the feet sit on the floor')
   assert.equal(pose.workBack,true,'the body faces the terminal with its back to the aisle')
   assert.equal(pose.workGesture?.profile,false)
   const rising=officeActorSupport(s,atBench,{rising:true,seatBlend:1},officeActorRenderScale(s,atBench),point)
   assert.equal(rising.face,pose.face)
   assert.equal(rising.workBack,true)
   assert.ok(rising.supportHands,'the hands are still on the desk at the start of the rise')
  }
 }
})

it('seats Desktop Review coworkers at two separate books',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:450*.721,room:'room-stations-large',desktopArt:true}
 const first={...s.actors[0],workStation:'quality' as const},second={...first,key:'second'}
 s.actors=[first,second]
 const places=new Map()
 const books=[first,second].map(person=>{
  const point=officeWorkPresenceTarget(s,person,'quality',places)
  places.set(person.key,rememberOfficeWorkPlace(s,person,point,'quality'))
  const atBook={...person,...point}
  const pose=officeActorSupport(s,atBook,{},officeActorRenderScale(s,atBook),point)
  assert.equal(pose.sit,true)
  assert.equal(pose.seatBack,false)
  assert.ok(pose.supportHands)
  return point
 })
 assert.ok(books[1].x-books[0].x>=48)
})

it('keeps the foreground and back row close in scale in a painted room',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:325,room:'room-stations-large',desktopArt:true}
 const rear=officeActorRenderScale(s,{...actor,y:370})
 const front=officeActorRenderScale(s,{...actor,y:500})
 assert.ok(front>rear&&front/rear<1.15)
})

it('gives a third Terminal coworker a lap notebook within their own reach',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:310.5,room:'room-stations',desktopArt:true}
 // The two stools are at x=261.9 and x=321.3. This is the overflow spot toward the aisle.
 const overflow={...s.actors[0],x:234.9,y:484.418,workStation:'terminal' as const}
 const pose=officeActorSupport(s,overflow,{typing:true},1,overflow,3)
 assert.equal(pose.sit,true)
 assert.ok(pose.seatHeight!<=19,'overflow notebook uses a natural workshop stool height, not a high bar stool')
 assert.equal(pose.workGesture?.notebook,true)
 assert.equal(pose.workGesture?.keyboard,undefined)
 assert.ok(pose.supportHands&&Math.abs(pose.supportHands.left.x)<16&&Math.abs(pose.supportHands.right.x)<16)
 assert.ok(pose.supportHands.left.x*pose.face!>0&&pose.supportHands.right.x*pose.face!>0,'both hands stay forward on the lap notebook without reaching behind the back')
 s.actors=[overflow]
 const trip=createOfficeTrip(event,s,s,0,{x:105,y:410})
 assert.equal(trip?.segments[0].riseFrom,'terminal')
 const frame=officeTripFrame(trip!,150)
 assert.equal(frame.pose.walk,false)
 const rising=officeActorSupport(s,overflow,frame.pose,1,frame.point,3)
 assert.equal(rising.sit,true)
 assert.equal(rising.workGesture?.notebook,true)
 assert.equal(rising.typing,false)
})

it('keeps a Desktop work pose at the station when ambient life offers a mug or a wave',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:450*.69,room:'room-stations',desktopArt:true}
 const person={...s.actors[0],workStation:'terminal' as const}
 const point=officeWorkPresenceTarget(s,person,'terminal',new Map()),atDesk={...person,...point}
 const pose=officeActorSupport(s,atDesk,{cup:true,mug:true,wave:true},1,point,4)
 assert.equal(pose.sit,true)
 assert.equal(pose.cup,false)
 assert.equal(pose.mug,false)
 assert.equal(pose.wave,false)
 assert.ok(pose.supportHands&&pose.workGesture?.keyboard)
})

it('uses the parked station until a worker reaches the newly reported station',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:450*.69,room:'room-stations',desktopArt:true}
 const workingAtBuild=officeWorkTarget(s.actors[0],s,'build')
 const parked=rememberOfficeWorkPlace(s,s.actors[0],workingAtBuild,'build')!
 const latest={...s.actors[0],workStation:'research' as const}
 const shown=officeActorAtWorkPlace(s,latest,parked)
 const pose=officeActorSupport(s,shown,{},officeActorRenderScale(s,shown),shown,1)
 assert.equal(shown.workStation,'build')
 assert.ok(pose.supportHands)
 assert.equal(latest.workStation,'research')
})

it('gives two Build coworkers separate contacts on the same bench and keeps the remaining worker in place',()=>{
 const s=scene(),worker={...s.actors[0],workStation:'build' as const},coworker={...worker,key:'coworker'}
 for(const title of ['Research','Design','API','Quality']){
  for(const room of ['room-stations','room-stations-large'] as const){
   s.floors[0]={...s.floors[0],title,room,height:room==='room-stations'?253.125:337.5}
   s.actors=[worker,coworker]
   const first=officeWorkPresenceTarget(s,worker,'build',new Map())
   const places=new Map([[worker.key,rememberOfficeWorkPlace(s,worker,first,'build')!]])
   const second=officeWorkPresenceTarget(s,coworker,'build',places)
   assert.ok(Math.abs(first.x-second.x)>=47.99)
   assert.equal(second.y,first.y)
   const grips=[{...worker,...first},{...coworker,...second}].map(person=>{
    const pose=officeActorSupport(s,person,{},1,person)
    assert.ok(pose.supportHands)
    const {left,right}=pose.supportHands
    return (left.x+right.x)/2+person.x
   })
   assert.ok(Math.abs(grips[0]-grips[1])>=30)
   places.set(coworker.key,rememberOfficeWorkPlace(s,coworker,second,'build')!)
   const research=officeWorkPresenceTarget(s,worker,'research',places)
   const atBuild=officeSceneAtWorkPlaces(s,places)
   const trip=createOfficeTrip({...event,station:'research'},atBuild,atBuild,0,research)!
   assert.deepEqual(trip.segments[0].from,{x:atBuild.actors[0].x,y:atBuild.actors[0].y})
   assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,research)
   places.set(worker.key,rememberOfficeWorkPlace(s,worker,research,'research')!)
   const retained=officeWorkPresenceTarget(s,coworker,'build',places)
   assert.ok(Math.hypot(retained.x-second.x,retained.y-second.y)<.001)
  }
 }
})

it('walks directly along the clear front aisle and stays at the working station',()=>{
 const s=scene(),trip=createOfficeTrip(event,s,s,0)!,target=officeWorkTarget(s.actors[0],s,'build')
 assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,target)
 const legs=trip.segments.filter(x=>x.kind==='walk')
 assert.equal(legs.length,1,'no ceremonial return to a staging spot')
 assert.equal(legs[0].from.y,legs[0].to.y,'the main aisle is straight')
})
it('retains the actual workplace across paints and source updates without changing source state',()=>{
 const s=scene(),original=structuredClone(s),target=officeWorkTarget(s.actors[0],s,'build')
 const place=rememberOfficeWorkPlace(s,s.actors[0],target,'build')!
 const next=structuredClone(s);next.actors[0].agent.activities=[{id:'search',type:'web_search',toolName:null,title:null,startedAt:2}]
 const shown=officeActorAtWorkPlace(next,next.actors[0],place)
 assert.deepEqual({x:shown.x,y:shown.y},target,'a new job does not teleport the agent')
 assert.equal(shown.pose?.typing,true)
 assert.deepEqual(s,original)
 assert.equal(officeActorAtWorkPlace(next,{...next.actors[0],zone:'lounge'},place).pose,undefined)
})
it('starts a new station trip at the last drawn workplace and makes room for a coworker',()=>{
 const s=scene(),target=officeWorkTarget(s.actors[0],s,'build'),place=rememberOfficeWorkPlace(s,s.actors[0],target,'build')!
 const places=new Map([['worker',place]]),visual=officeSceneAtWorkPlaces(s,places)
 const trip=createOfficeTrip({...event,station:'quality'},visual,visual,0)!
 assert.deepEqual(trip.segments[0].from,target)
 const coworker={...structuredClone(s.actors[0]),key:'coworker'};s.actors.push(coworker)
 const other=officeWorkPresenceTarget(s,coworker,'build',places)
 assert.ok(Math.abs(other.x-target.x)>=28,'coworkers do not occupy the same point')
 assert.equal(other.y,target.y)
})
it('keeps the drawn work point aligned while its floor moves or resizes',()=>{
 const s=scene(),trip=createOfficeTrip(event,s,s,0)!,t=trip.startedAt+trip.segments[0].duration/2
 const frame=officeTripFrame(trip,t),next=structuredClone(s);next.width=900;next.floors[0].y=350;next.floors[0].height=200
 const shown=officeWorkTripFrame(trip,t,next)
 assert.equal(shown.point.x,frame.point.x*2)
 assert.equal(shown.point.y,350+(frame.point.y-200)*2)
 const place=rememberOfficeWorkPlace(s,s.actors[0],officeWorkTarget(s.actors[0],s,'build'),'build')!
 const at=officeActorAtWorkPlace(next,next.actors[0],place)
 assert.equal(at.y,350+200*.79)
})
it('does not overlap a planning teammate with someone using the bench below the board',()=>{
 const s=scene(),point=officeWorkTarget(s.actors[0],s,'planning')
 const station=(['build','quality','terminal','research'] as const).find(kind=>Math.abs(officeWorkTarget(s.actors[0],s,kind).x-point.x)<1)!
 assert.ok(station)
 const place=rememberOfficeWorkPlace(s,s.actors[0],point,'planning')!,coworker={...structuredClone(s.actors[0]),key:'coworker'}
 s.actors.push(coworker)
 const target=officeWorkPresenceTarget(s,coworker,station,new Map([['worker',place]]))
 assert.ok(Math.abs(target.x-point.x)>=28)
})
it('uses the second depth row of a large room instead of squeezing everyone along one axis',()=>{
 const s=scene();s.floors[0]={...s.floors[0],room:'room-stations-large',height:337.5}
 const spots=[...roomStationSpots(s.floors[0],s.width,'build'),...roomActorSpots(s.floors[0],s.width)]
 const places=new Map<string,NonNullable<ReturnType<typeof rememberOfficeWorkPlace>>>()
 const points:OfficePoint[]=[]
 for(let i=0;i<4;i++){
  const person={...structuredClone(actor),key:`worker-${i}`};s.actors.push(person)
  const point=officeWorkPresenceTarget(s,person,'build',places)
  points.push(point);places.set(person.key,rememberOfficeWorkPlace(s,person,point,'build')!)
 }
 assert.ok(points.some(p=>p.y!==points[0].y),'a crowded station uses real floor depth')
 assert.ok(points.every(p=>spots.some(q=>Math.abs(p.x-q.x)<.01&&Math.abs(p.y-q.y)<.01)))
 for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=26)
})
it('keeps a working station user clear of the idle lead reading nook',()=>{
 const s=scene(),worker=s.actors[0];s.floors[0].height=253
 const nook={...structuredClone(worker),key:'lead',zone:'lounge' as const,x:335.25,y:380,agent:{...worker.agent,role:'lead' as const,status:'idle' as const}}
 s.actors.push(nook)
 const kind=(['research','build','quality','terminal'] as const).reduce((a,b)=>Math.abs(officeWorkTarget(worker,s,a).x-nook.x)<Math.abs(officeWorkTarget(worker,s,b).x-nook.x)?a:b)
 const close={...officeWorkTarget(worker,s,kind),x:nook.x-12},place=rememberOfficeWorkPlace(s,worker,close,kind)!
 const target=officeWorkPresenceTarget(s,worker,kind,new Map([[worker.key,place]]))
 assert.ok(Math.hypot(target.x-nook.x,target.y-nook.y)>=32)
})

it('keeps three persistent coworkers a full avatar apart with an idle lead in the small-room nook',()=>{
 const s=scene();s.floors[0]={...s.floors[0],height:253.125,room:'room-stations'}
 s.actors=roomActorSpots(s.floors[0],s.width).slice(0,3).map((point,i)=>({...structuredClone(actor),...point,key:`person-${i}`}))
 const nook=roomLeadRestPoint(s.floors[0],s.width)
 s.actors.push({...structuredClone(actor),...nook,key:'lead',zone:'lounge',agent:{...actor.agent,role:'lead',status:'idle'}})
 const places=new Map<string,NonNullable<ReturnType<typeof rememberOfficeWorkPlace>>>()
 const workers=s.actors.filter(a=>a.zone==='desk')
 for(const person of workers){const point=officeWorkPresenceTarget(s,person,'build',places);places.set(person.key,rememberOfficeWorkPlace(s,person,point,'build')!)}
 const points=workers.map(a=>officeActorAtWorkPlace(s,a,places.get(a.key)))
 for(let i=0;i<points.length;i++){
  assert.ok(points[i].y>=s.floors[0].y+s.width*.36&&points[i].y<=s.floors[0].y+s.floors[0].height!-s.width*.118,'feet remain on painted floorboards')
  assert.ok(Math.abs(points[i].x-nook.x)>=44,'work bodies leave the reading nook clear')
  for(let j=0;j<i;j++)assert.ok(Math.abs(points[i].x-points[j].x)>=44,'same-row avatars have full body width clearance')
  assert.deepEqual(officeWorkPresenceTarget(s,workers[i],'build',places),{x:points[i].x,y:points[i].y},'valid persistent positions stay still on later pulses')
 }
})

it('includes visible uncached desk occupants when choosing a workplace',()=>{
 const s=scene();s.floors[0]={...s.floors[0],height:253.125,room:'room-stations'}
 const base=officeWorkTarget(s.actors[0],s,'terminal')
 const uncached={...structuredClone(actor),key:'uncached',...base}
 s.actors.push(uncached)
 const point=officeWorkPresenceTarget(s,s.actors[0],'terminal',new Map())
 assert.ok(Math.hypot(point.x-base.x,point.y-base.y)>=44)
})

it('retains valid small-room depth workplaces instead of clamping them to one aisle',()=>{
 const s=scene();s.floors[0]={...s.floors[0],height:253.125,room:'room-stations'}
 const worker=s.actors[0],point={x:80,y:s.floors[0].y+450*.435}
 const place=rememberOfficeWorkPlace(s,worker,point,'research')!
 assert.deepEqual(officeWorkPresenceTarget(s,worker,'research',new Map([[worker.key,place]])),point)
 const points=(['build','research','quality','terminal'] as const).map(kind=>officeWorkPresenceTarget(s,worker,kind,new Map()))
 assert.ok(new Set(points.map(p=>p.y)).size>=3)
})

it('keeps a Desktop Research coworker reading at the book side when Planning is occupied',()=>{
 const s=scene()
 s.floors[0]={...s.floors[0],height:310.5,room:'room-stations',desktopArt:true}
 const planner={...s.actors[0],workStation:'planning' as const}
 const planTarget=officeWorkPresenceTarget(s,planner,'planning',new Map())
 const places=new Map([[planner.key,rememberOfficeWorkPlace(s,planner,planTarget,'planning')!]])
 const atPlan={...planner,...planTarget}
 const researcher={...s.actors[0],key:'researcher',workStation:'research' as const}
 const researchTarget=officeWorkPresenceTarget({...s,actors:[atPlan,researcher]},researcher,'research',places)
 const atBook={...researcher,...researchTarget}
 const pose=officeActorSupport(s,atBook,{},officeActorRenderScale(s,atBook),researchTarget,1)
 assert.equal(pose.face,-1)
 assert.equal(pose.workGesture?.profile,true)
 assert.ok(pose.supportHands,'researcher still reaches the open book when Planning is occupied')
})
