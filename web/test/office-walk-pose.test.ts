import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeWalkPose} from '../lib/office-walk-pose'
it('keeps at least one foot planted and lifts the swinging foot above the floor',()=>{
 for(let slot=0;slot<12;slot++)for(let i=0;i<160;i++){
  const pose=officeWalkPose(slot,i/160*Math.PI*2,1)
  assert.ok(pose.left.y<=0&&pose.right.y<=0)
  assert.ok(pose.left.planted||pose.right.planted)
  for(const value of [pose.left.x,pose.left.y,pose.right.x,pose.right.y,pose.torsoY,pose.sway,pose.arm,pose.headTilt])assert.ok(Number.isFinite(value))
 }
})
it('moves the planted foot backwards by the same distance the actor moves forwards',()=>{
 const stride=25
 const a=officeWalkPose(0,.1*Math.PI*2,1,false,stride),b=officeWalkPose(0,.2*Math.PI*2,1,false,stride)
 assert.ok(a.left.planted&&b.left.planted)
 assert.ok(Math.abs((a.left.x+.1*stride)-(b.left.x+.2*stride))<1e-8)
 assert.equal(a.left.y,0);assert.equal(b.left.y,0)
})
it('settles to standing, varies walking style by identity and steadies a carried object',()=>{
 for(const phase of [0,1,3,5]){
  const still=officeWalkPose(2,phase,0)
  assert.deepEqual([still.left.x,still.left.y,still.right.x,still.right.y,still.torsoY,still.arm],[-7,0,7,0,0,0])
 }
 const styles=new Set(Array.from({length:8},(_,slot)=>JSON.stringify(officeWalkPose(slot,2.4,1))))
 assert.ok(styles.size>=4)
 const free=officeWalkPose(3,2.4,1),carry=officeWalkPose(3,2.4,1,true)
 assert.ok(Math.abs(carry.arm)<Math.abs(free.arm))
 assert.deepEqual(carry.left,free.left)
})
it('projects stance along a depth aisle instead of stepping sideways while walking deeper',()=>{
 const stride=24,direction={x:0,y:-1}
 const a=officeWalkPose(0,.1*Math.PI*2,1,false,stride,direction),b=officeWalkPose(0,.2*Math.PI*2,1,false,stride,direction)
 assert.equal(a.left.x,b.left.x)
 assert.ok(a.left.planted&&b.left.planted)
 assert.ok(Math.abs((a.left.y-.1*stride)-(b.left.y-.2*stride))<1e-8)
})
