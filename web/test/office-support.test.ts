import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeSeatFrame,officeActorSupport} from '../lib/office-support'
import {officeHandContacts} from '../lib/office-contacts'
import {roomStationLayout} from '../lib/office-room-design'
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
   assert.ok(Math.abs(actor.y+hands.left.y-lift-(station.y-station.height*.31))<.001)
   assert.ok(Math.abs(actor.x+hands.left.x*face-(station.x-station.width*.25))<.001)
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
it('keeps the rendered seat contact fixed while breathing and leaves a held mug in the occupied hand',()=>{
 const c=new Proxy({globalAlpha:1} as Record<string,unknown>,{get:(t,k)=>k in t?t[String(k)]:()=>{},set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D
 const seats=[0,1,2,3].map(time=>drawOfficeAvatar(c,officeAppearance(0),0,0,time,{sit:true,mug:true,hop:3,lean:.2,seatBack:false}).seat)
 seats.forEach(seat=>assert.deepEqual(seat,{x:0,y:-11}))
 const m={left:0,right:0,sip:.5,wave:0}
 const still=officeHandContacts({mug:true},m),dressing=officeHandContacts({mug:true,dressing:1},m)
 assert.deepEqual(dressing.right,still.right)
 assert.ok(dressing.left.y<still.left.y)
})
