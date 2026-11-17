import test from 'node:test'
import assert from 'node:assert/strict'
import {buildOfficeScene} from '../lib/office-model'
import {createOfficeTrip,officeTripFrame,type OfficeTrip} from '../lib/office-motion'
import type {OfficeEvent,OfficeScene} from '../lib/office-types'
import type {TeamSnapshot} from '../lib/team-types'
const team:TeamSnapshot={sessionId:'garden',title:'Garden',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name:'Lead',runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
const scene=()=>buildOfficeScene([team],'active',false,new Map())
const event=(s:OfficeScene,kind:OfficeEvent['kind'],at=1):OfficeEvent=>({id:`${kind}:${at}`,kind,actorKey:s.actors[0].key,parentKey:null,at})
const arrival=(s:OfficeScene,at=1,now=0)=>createOfficeTrip(event(s,'arrived',at),{...s,actors:[]},s,now)!
const gardenWalks=(trip:OfficeTrip)=>trip.segments.filter(s=>s.floorId==='lounge'&&s.kind==='walk'&&!s.liftPhase)

test('lifecycle actors cross the frame boundary without fading on open grass',()=>{
 const s=scene()
 for(let at=1;at<=30;at++){
  const arriving=arrival(s,at),leaving=createOfficeTrip(event(s,'left',at),s,{...s,actors:[]},0)!
  for(const p of [arriving.segments[0].from,leaving.segments.at(-1)!.to])assert.ok(p.x < -s.width*.05||p.x>s.width*1.05,'endpoint is fully outside the garden')
  for(const trip of [arriving,leaving]){
   for(let i=1;i<trip.segments.length;i++)assert.deepEqual(trip.segments[i].from,trip.segments[i-1].to,'all legs meet')
   for(const seg of trip.segments.filter(seg=>seg.opacity&&seg.kind==='walk'))assert.ok(seg.from.x<0&&seg.to.x<0||seg.from.x>s.width&&seg.to.x>s.width,'fade stays outside the frame')
  }
  assert.equal(officeTripFrame(arriving,0).pose.opacity,0)
  assert.equal(officeTripFrame(leaving,leaving.endsAt).pose.opacity,0)
 }
})

test('stable left, right and rear routes reverse for departures',()=>{
 const s=scene(),routes=new Map<string,ReturnType<typeof gardenWalks>>()
 for(let at=1;at<=60;at++){
  const walks=gardenWalks(arrival(s,at))
  assert.deepEqual(gardenWalks(arrival(s,at,12345)),walks,'rescheduling preserves the route')
  routes.set(JSON.stringify(walks.map(seg=>seg.to)),walks)
  const outgoing=gardenWalks(createOfficeTrip(event(s,'left',at),s,{...s,actors:[]},0)!)
  assert.deepEqual(outgoing.map(seg=>[seg.from,seg.to]),walks.toReversed().map(seg=>[seg.to,seg.from]),'departure retraces the safe garden corridor')
 }
 assert.equal(routes.size,3)
 const paths=[...routes.values()]
 assert.ok(paths.some(path=>path[0].from.x<0))
 assert.ok(paths.some(path=>path[0].from.x>s.width))
 assert.ok(paths.some(path=>path[0].from.y<s.floors[0].height!*.65),'rear entrance traverses depth')
})

test('garden corridors clear furniture and retain the actual surface floor id',()=>{
 const s=scene(),surface=s.floors.find(f=>f.kind==='lounge')!;surface.id='surface-garden'
 for(let at=1;at<=30;at++){
  const trip=arrival(s,at),boarding=trip.segments.findIndex(seg=>seg.liftPhase==='boarding')
  assert.ok(boarding>0)
  for(const seg of trip.segments.slice(0,boarding)){
   assert.equal(seg.floorId,surface.id)
   for(let step=0;step<=20;step++){
    const t=step/20,x=(seg.from.x+(seg.to.x-seg.from.x)*t)/s.width,y=(seg.from.y+(seg.to.y-seg.from.y)*t-surface.y)/surface.height!
    assert.ok(!(x>.28&&x<.81&&y>.53&&y<.72),'clears picnic furniture and shop counter')
   }
  }
 }
})
