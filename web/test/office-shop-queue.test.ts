import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeShopQueue,officeShopWaitingPoints} from '../lib/office-shop-queue'
import type {OfficeScene} from '../lib/office-types'
const scene:OfficeScene={width:450,height:700,floors:[{id:'garden',kind:'lounge',y:0,height:253,actorKeys:[],sessionId:null,title:'Garden',subtitle:'',color:''}],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
it('two physical marks stay on the floor left/front of service at narrow and wide widths',()=>{
 for(const width of [240,450,700]){const s={...scene,width,floors:scene.floors.map(f=>({...f,height:width*.5625}))},points=officeShopWaitingPoints(s)
 assert.equal(points.length,2);assert.notDeepEqual(points[0],points[1])
 for(const p of points){assert.ok(p.x>width*.2&&p.x<width*.61);assert.ok(p.y>width*.5625*.70&&p.y<width*.5625*.85);assert.equal(p.floorId,'garden')}
 }
})
it('service belongs to actual arrival order and remains owned until released, never alphabetical admission',()=>{
 const entries=[{actorKey:'a',order:0,arrivedAt:200,serving:false},{actorKey:'z',order:1,arrivedAt:100,serving:false}],before=JSON.stringify(entries)
 assert.equal(officeShopQueue(scene,entries).serviceKey,'z')
 assert.equal(JSON.stringify(entries),before)
 assert.equal(officeShopQueue(scene,[{...entries[0],serving:true},entries[1]]).serviceKey,'a')
 assert.equal(officeShopQueue(scene,[entries[0]]).serviceKey,'a')
 assert.equal(officeShopQueue(scene,[{...entries[0],arrivedAt:null}]).serviceKey,null)
 assert.equal(officeShopQueue(scene,[{...entries[0],arrivedAt:100},entries[1]]).serviceKey,'a')
})
import {OfficeDailyRuntime,type OfficeDailyRuntimeGuest} from '../lib/office-daily-runtime'
import {createOfficeLift} from '../lib/office-lift'
import {officeAppearance} from '../lib/office-model'
import type {OfficeActor} from '../lib/office-types'
import {officeVendorPickupProgress} from '../lib/office-vendor'
const home=(key:string):OfficeActor=>({key,sessionId:'s',parentKey:'lead',floorId:'private',x:100,y:390,zone:'lounge',task:null,appearance:officeAppearance(0),activity:'Rest',runtimeName:'Codex',agent:{id:key,name:key,parentId:'lead',role:'worker',status:'done'} as OfficeActor['agent']})
function setup(){
 const source:OfficeScene={...scene,actors:[home('a'),home('z')],floors:[...scene.floors,{id:'team',kind:'team',y:228,height:253,actorKeys:[],sessionId:'s',title:'Office',subtitle:'',color:''},{id:'private',annexOf:'team',kind:'break',y:228,height:253,actorKeys:['a','z'],sessionId:'s',title:'Rest',subtitle:'',color:''}]}
 const runtime=new OfficeDailyRuntime(),lift=createOfficeLift(source)
 for(const [i,a] of source.actors.entries()){
 const g:OfficeDailyRuntimeGuest={actorKey:a.key,kind:'outing',occurrenceKey:a.key,destination:'garden',seat:i,home:a,physical:{...a,floorId:'garden',x:i===0?100:225,y:190},outing:{action:'snack',night:false,dwellMs:30000,collected:false},phase:'outbound',trip:null,until:0,returnNeeded:false,indoorNeeded:false}
 runtime.guests.set(a.key,g)
 }
 const date=new Date(2026,10,15,14,20)
 const step=(at:number,actors=source.actors)=>runtime.step({source:{...source,actors},scene:runtime.project({...source,actors}),date,at,lift,weather:'clear',blocked:true,busyKeys:new Set()})
 return {source,runtime,lift,date,step}
}
it('concurrent garden shoppers actually walk to distinct marks, wait on the floor and serve actual arrival order',()=>{
 const {runtime,lift,date,source,step}=setup()
 // blocked optional admissions still let already admitted shoppers finish their itinerary.
 step(0)
 const a=runtime.guests.get('a')!,z=runtime.guests.get('z')!
 assert.ok(a.trip&&z.trip)
 assert.notDeepEqual(a.trip.actor,z.trip.actor)
 const first=Math.min(a.trip.endsAt,z.trip.endsAt)
 step(first)
 assert.equal(officeVendorPickupProgress(source,z.trip,first),null,'arrival walk must precede service hold')
 assert.equal(a.outing!.collected,false);assert.equal(z.outing!.collected,false)
 let at=first,firstService:string|null=null
 for(let i=0;i<30&&[a,z].some(g=>g.phase!=='eating');i++){
   const times=[a,z].flatMap(g=>g.trip?[g.trip.endsAt-700,g.trip.endsAt].filter(time=>time>at):[])
   at=times.length?Math.min(...times):at+1;step(at)
   const serving=[a,z].filter(g=>officeVendorPickupProgress(source,g.trip,at)!==null)
   assert.ok(serving.length<=1)
   if(serving.length&&!firstService)firstService=serving[0].actorKey
 }
 assert.equal(firstService,'z','nearer real arrival wins despite alphabetical/insertion order')
 assert.ok([a,z].every(g=>g.outing!.collected&&g.phase==='eating'))
 assert.equal(lift.reservations.length,0,'floor shop wait never reserves the shared car')
 const marks=runtime.shopQueue(source).marks
 assert.equal(marks.length,2);assert.ok(marks.every(mark=>mark.actorKey===null))
})
it('working/removed shoppers release marks and service without receiving a phantom parcel',()=>{
 const {runtime,source,step}=setup();step(0)
 const a=runtime.guests.get('a')!,z=runtime.guests.get('z')!
 const arrival=Math.min(a.trip!.endsAt,z.trip!.endsAt);step(arrival)
 const working=source.actors.map(actor=>actor.key==='z'?{...actor,zone:'desk' as const,agent:{...actor.agent,status:'running' as const}}:actor)
 step(arrival+1,working)
 assert.equal(z.outing!.collected,false)
 assert.ok(!runtime.shopQueue(source).marks.some(mark=>mark.actorKey==='z'))
 step(arrival+2,working.filter(actor=>actor.key!=='a'))
 assert.ok(runtime.shopQueue(source).marks.every(mark=>mark.actorKey===null))
 assert.equal(a.outing!.collected,false)
})

it('work preempts the active pickup hold and immediately advances the next real waiting shopper',()=>{
 const {runtime,source,lift,date,step}=setup();step(0)
 const a=runtime.guests.get('a')!,z=runtime.guests.get('z')!
 const arrival=Math.min(a.trip!.endsAt,z.trip!.endsAt);step(arrival)
 const middle=z.trip!.endsAt-700;step(middle)
 assert.notEqual(officeVendorPickupProgress(source,z.trip,middle),null)
 assert.equal(z.outing!.collected,false)
 const working=source.actors.map(actor=>actor.key==='z'?{...actor,agent:{...actor.agent,status:'running' as const}}:actor)
 step(middle+1,working)
 assert.equal(z.outing!.collected,false)
 assert.notEqual(runtime.shopQueue(source).serviceKey,'z')
 assert.equal(a.shop?.stage,'serving')
 assert.equal(a.outing!.collected,false)
 const waitingEnd=a.trip?.endsAt??middle+1
 step(Math.max(middle+2,waitingEnd),working)
 assert.equal(a.shop?.stage,'seating')
 assert.equal(a.outing!.collected,true)
 assert.equal(lift.reservations.filter(r=>r.passenger==='a').length,0,'service uses no cabin')
})
it('lift arrivals release the car before floor wait/service and rebuild canceled pending arrival legs',()=>{
 const {runtime,source,lift,date}=setup()
 for(const g of runtime.guests.values())g.physical=g.home
 const step=(at:number,preempt=false)=>runtime.step({source,scene:runtime.project(source),date,at,lift,weather:'clear',blocked:true,busyKeys:new Set(),preemptQueuedTravel:preempt})
 step(0)
 const a=runtime.guests.get('a')!,z=runtime.guests.get('z')!
 assert.ok(a.trip!.segments.some(s=>s.liftPhase)&&z.trip!.segments.some(s=>s.liftPhase))
 step(1,true)
 assert.equal(a.shop?.stage,'arriving');assert.equal(z.shop?.stage,'arriving')
 assert.equal([a.trip,z.trip].some(Boolean),false)
 step(2)
 assert.ok(a.trip&&z.trip)
 let at=Math.min(a.trip.endsAt,z.trip.endsAt)
 step(at)
 const serving=[a,z].find(g=>g.shop?.stage==='serving')!
 assert.ok(serving)
 assert.ok(serving.trip!.segments.every(s=>!s.liftPhase),'shop itinerary is outside the car timeline')
 const expected=serving.trip!.endsAt
 assert.ok(lift.reservations.every((r,i,list)=>i===0||r.start>=list[i-1].end),'one shared car stays serial')
 step(expected)
 assert.equal(serving.outing!.collected,true)
 assert.equal(serving.shop?.stage,'seating')
 assert.ok(serving.trip!.segments.every(s=>!s.liftPhase))
})

it('rain or night closes an active queue without completing its interrupted pickup',()=>{
 for(const closed of ['rain','night'] as const){
  const {runtime,source,lift,date,step}=setup();step(0)
  const first=Math.min(...[...runtime.guests.values()].map(g=>g.trip!.endsAt));step(first)
  const serving=[...runtime.guests.values()].find(g=>g.shop?.stage==='serving')!
  const middle=serving.trip!.endsAt-700;step(middle)
  runtime.step({source,scene:runtime.project(source),date:closed==='night'?new Date(2026,10,15,23,20):date,at:middle+1,lift,weather:closed==='rain'?'rain':'clear',blocked:true,busyKeys:new Set()})
  assert.equal(serving.outing!.collected,false)
  assert.equal(runtime.shopQueue(source).serviceKey,null)
  assert.ok(runtime.shopQueue(source).marks.every(mark=>mark.actorKey===null))
 }
})
it('keeps canceled unboarded arrivals waiting across real-travel frames instead of rebuilding every frame',()=>{
 const {runtime,source,lift,date}=setup()
 for(const g of runtime.guests.values())g.physical=g.home
 const step=(at:number,preempt:boolean)=>runtime.step({source,scene:runtime.project(source),date,at,lift,weather:'clear',blocked:true,busyKeys:new Set(),preemptQueuedTravel:preempt})
 step(0,false)
 for(let at=1;at<=20;at++){
  step(at,true)
  assert.ok([...runtime.guests.values()].every(g=>g.trip===null),'real travel leaves cosmetic arrivals unreserved')
  assert.equal(lift.reservations.length,0)
 }
 step(21,false)
 const trips=[...runtime.guests.values()].map(g=>g.trip)
 assert.ok(trips.every(Boolean))
 step(22,false)
 assert.deepEqual([...runtime.guests.values()].map(g=>g.trip),trips,'arrival resumes once after the real travel clears')
})
