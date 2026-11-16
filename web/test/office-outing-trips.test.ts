import {it} from 'node:test'
import assert from 'node:assert/strict'
import {createOfficeOutingTrip,officeOutingVendorPoint} from '../lib/office-outing-trips'
import {officeTripFrame} from '../lib/office-motion'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
const actor={key:'worker',sessionId:'s',floorId:'private',x:110,y:380,zone:'lounge',hidden:false,agent:{status:'done'}} as OfficeActor
const scene:OfficeScene={width:450,height:700,totalAgents:1,finishedCount:1,quietTeams:[],actors:[actor],floors:[{id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'',actorKeys:[],y:0,height:253},{id:'team',kind:'team',sessionId:'s',title:'Team',subtitle:'',color:'',actorKeys:[],y:228,height:253},{id:'private',kind:'break',annexOf:'team',sessionId:'s',title:'Rest',subtitle:'',color:'',actorKeys:['worker'],y:228,height:253}]}
it('walks from the private room through the real lift, collects a snack and then walks to its reserved seat',()=>{
 const target={floorId:'garden',x:152,y:154},before=JSON.stringify(scene)
 const trip=createOfficeOutingTrip(scene,actor.key,target,100,'snack',false,actor)!
 const vendor=officeOutingVendorPoint(scene)!
 assert.ok(trip.segments.some(s=>s.liftPhase==='riding'))
 assert.ok(trip.segments.some(s=>s.kind==='hold'&&!s.liftPhase&&s.duration===1400&&s.from.x===vendor.x&&s.from.y===vendor.y))
 assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,{x:target.x,y:target.y})
 assert.equal(JSON.stringify(scene),before)
})
it('night drinks and returning visitors do not open or visit the vendor',()=>{
 const target={floorId:'garden',x:152,y:154}
 for(const [action,night] of [['drink',true],['stargaze',true],['snack',true]] as const){
  const trip=createOfficeOutingTrip(scene,actor.key,target,0,action,night,actor)!
  assert.equal(trip.segments.some(s=>s.kind==='hold'&&s.duration===1400),false)
 }
})
