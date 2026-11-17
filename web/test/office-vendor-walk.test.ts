import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeVendorWalk} from '../lib/office-vendor-walk'
it('walks continuously back into the cart before a customer reaches service',()=>{
 let state=officeVendorWalk(null,1,false,450,253,0)
 const first={...state}
 for(let t=1.04;t<3;t+=.04){
  const next=officeVendorWalk(state,t,true,450,253,0)
  assert.ok(Math.hypot(next.x-state.x,next.y-state.y)<=55*.041)
  state=next
 }
 assert.ok(state.x>first.x&&state.y<first.y)
 assert.equal(state.walk,false)
 assert.ok(Math.abs(state.x-450*.805)<.01)
})
it('takes a short idle stroll and reverses smoothly without changing shop state',()=>{
 let state=officeVendorWalk(null,35,false,450,253,0),distance=0
 for(let t=35.04;t<53;t+=.04){const next=officeVendorWalk(state,t,false,450,253,0);distance+=Math.hypot(next.x-state.x,next.y-state.y);state=next}
 assert.ok(distance>20)
 assert.ok(Math.abs(state.x-450*.705)<.01)
 assert.equal(state.face,1,'home chores must face the shelf even after leftward return')
 const frozen=officeVendorWalk(state,0,true,450,253,0)
 assert.equal(frozen.walk,false)
})
it('faces the shelf again after returning from service',()=>{
 let state=officeVendorWalk(null,20,true,450,253,0)
 for(let t=20.04;t<22;t+=.04)state=officeVendorWalk(state,t,false,450,253,0)
 assert.equal(state.walk,false)
 assert.equal(state.face,1)
})
