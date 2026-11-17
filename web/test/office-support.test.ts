import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeSeatFrame,officeActorSupport} from '../lib/office-support'
import {officeHandContacts} from '../lib/office-contacts'
import {roomStationLayout,roomStationSurface} from '../lib/office-room-design'
import {drawOfficeAvatar} from '../components/agent-visualizer/office/office-art'
import {officeAppearance} from '../lib/office-model'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
it('anchors the hips while seated and bends every seated pose, including an empty-handed desk pose',()=>{
 for(const lift of [-.7,0,.7]){
  const frame=officeSeatFrame({sit:true},lift)
  assert.equal(frame.torsoLift,0)
  assert.equal(frame.bend,1)
  assert.equal(frame.seat.y,-11)
 }
 assert.equal(officeSeatFrame({sit:false},.7).torsoLift,.7)
 assert.equal(officeSeatFrame({sit:true,seatBlend:.5},.7).torsoLift,.35)
})
it('puts workbench users on their feet with both palms on the painted keyboard, without moving their feet',()=>{
 const floor={id:'office',kind:'team' as const,room:'room-stations' as const,sessionId:'s',title:'API',subtitle:'',color:'#abc',y:250,height:253,actorKeys:['a']}
 const scene={width:450,height:800,floors:[floor]} as OfficeScene
 const station=roomStationLayout(floor,450).find(s=>s.kind==='build')!
 const actor={floorId:floor.id,zone:'desk',workStation:'build',x:station.x-20,y:station.y+11,agent:{status:'running'}} as OfficeActor
 const before={x:actor.x,y:actor.y}
 for(const face of [1,-1] as const){
  const pose=officeActorSupport(scene,actor,{sit:true,typing:true,face},1,{x:actor.x,y:actor.y})
  assert.equal(pose.sit,false)
  assert.ok(pose.supportHands)
  for(const lift of [-.7,.7]){
   const hands=officeHandContacts(pose,{left:0,right:0,sip:0,wave:0,lift})
   const surface=roomStationSurface(station),renderFace=pose.face===-1?-1:1
   assert.ok(Math.abs(actor.y+hands.left.y-lift-(pose.workLift??0)-surface.y)<.001)
   assert.ok(Math.abs(actor.x+hands.left.x*renderFace-(surface.x-surface.span))<.001)
  }
 }
 assert.deepEqual({x:actor.x,y:actor.y},before)
})
it('never reaches at a distant station or paints an extra chair over an existing lounge seat',()=>{
 const scene={width:450,height:800,floors:[{id:'rest',kind:'break',y:0,height:253}]} as OfficeScene
 const actor={floorId:'rest',zone:'lounge',x:100,y:150} as OfficeActor
 assert.equal(officeActorSupport(scene,actor,{sit:true},1,actor).seatBack,false)
 assert.equal(officeActorSupport(scene,actor,{sit:false,walk:true},1,actor).walk,true)
})
it('aligns use positions with the actual book, keyboard or console side in every camera view',()=>{
 const floor={id:'office',kind:'team' as const,room:'room-stations' as const,sessionId:'s',title:'API',subtitle:'',color:'#abc',y:250,height:253,actorKeys:[]}
 for(const station of roomStationLayout(floor,450)){
  const contact=roomStationSurface(station)
  assert.equal(station.work.x,contact.x)
  assert.ok(contact.y<station.y)
  assert.ok(Math.abs(contact.x-station.x)<station.width*.4)
 }
 const terminal=roomStationLayout(floor,450).find(s=>s.kind==='terminal')!
 const right=roomStationSurface({...terminal,facing:'right'})
 assert.ok(right.x<terminal.x,'the right-view console is on the left of its server rack')
})
it('keeps the rendered seat contact fixed while breathing and leaves a held mug in the occupied hand',()=>{
 const c=new Proxy({globalAlpha:1} as Record<string,unknown>,{get:(t,k)=>k in t?t[String(k)]:()=>{},set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D
 const seats=[0,1,2,3].map(time=>drawOfficeAvatar(c,officeAppearance(0),0,0,time,{sit:true,mug:true,hop:3,lean:.2,seatBack:false}).seat)
 seats.forEach(seat=>assert.deepEqual(seat,{x:0,y:-11}))
 const m={left:0,right:0,sip:.5,wave:0}
 const still=officeHandContacts({mug:true},m),dressing=officeHandContacts({mug:true,dressing:1},m)
 assert.deepEqual(dressing.right,still.right)
 assert.ok(dressing.left.y<still.left.y)
})
it('keeps palms on their surface while an upright work stance raises the torso',()=>{
 const motion={left:0,right:0,sip:0,wave:0,lift:.7},supportHands={left:{x:-7,y:-32},right:{x:7,y:-32}}
 const hands=officeHandContacts({typing:true,supportHands,workLift:6},motion)
 assert.equal(hands.left.y,-32+.7+6)
 const c=new Proxy({globalAlpha:1} as Record<string,unknown>,{get:(t,k)=>k in t?t[String(k)]:()=>{},set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D
 const base=drawOfficeAvatar(c,officeAppearance(0),0,0,0,{typing:true,supportHands})
 const upright=drawOfficeAvatar(c,officeAppearance(0),0,0,0,{typing:true,supportHands,workLift:6,workBack:true,seatBack:false})
 assert.deepEqual(upright.left,base.left)
 assert.deepEqual(upright.right,base.right)
})
it('retains a static supported work posture when source reads are stale',()=>{
 const floor={id:'office',kind:'team' as const,room:'room-stations' as const,sessionId:'s',title:'API',subtitle:'',color:'#abc',y:250,height:253,actorKeys:[]}
 const scene:OfficeScene={width:450,height:800,floors:[floor],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 for(const station of roomStationLayout(floor,450)){
  const actor={key:'steady',floorId:floor.id,zone:'desk',workStation:station.kind,...station.work,agent:{status:'running',activities:[]}} as unknown as OfficeActor
  const baseline=officeActorSupport(scene,actor,{sit:false,typing:true},1,actor,0,true)
  const stale=officeActorSupport(scene,actor,{sit:false,typing:true},1,actor,99,false)
  assert.deepEqual(stale.supportHands,baseline.supportHands)
  assert.equal(stale.workLift,baseline.workLift)
  assert.equal(stale.workBack,baseline.workBack)
  assert.equal(stale.face,baseline.face)
  assert.equal(stale.typing,false,'last-known work is supported without live typing')
  assert.equal(stale.workGesture?.reach,0)
  assert.deepEqual(stale,officeActorSupport(scene,actor,{sit:false,typing:true},1,actor,199,false))
 }
})
