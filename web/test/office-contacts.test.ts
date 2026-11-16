import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeHandContacts} from '../lib/office-contacts'
import {drawOfficeAvatar} from '../components/agent-visualizer/office/office-art'
import {officeAppearance} from '../lib/office-model'
const still={left:0,right:0,sip:0,wave:0}
it('keeps the mug pivot on the palm through sipping, reaching and waving',()=>{
 for(const sip of [0,.5,1])for(const offer of [0,.5,1]){
  const hands=officeHandContacts({mug:true,offer,cupTilt:.12},{...still,sip})
  assert.deepEqual(hands.cup.pivot,hands.right)
  assert.ok(hands.right.x>=16&&hands.right.x<=28)
  assert.equal(hands.cup.angle,.12)
 }
 const sip=officeHandContacts({mug:true},{...still,sip:1})
 assert.ok(sip.cup.pivot.y<officeHandContacts({mug:true},still).cup.pivot.y)
})
it('anchors a book/game to both palms and a snack plate to the supporting left hand',()=>{
 for(const objectAction of ['book','game','snack'] as const){
  const first=officeHandContacts({objectAction},still),moved=officeHandContacts({objectAction},{...still,left:3,right:3})
  assert.equal(moved.shared.y-first.shared.y,3)
  assert.equal(moved.plate.y-first.plate.y,3)
  assert.equal(first.shared.x,(first.left.x+first.right.x)/2)
  assert.equal(first.shared.y,(first.left.y+first.right.y)/2)
 }
})
it('fades arm swing with the distance-based gait while a carried mug remains steady',()=>{
 const one=officeHandContacts({walk:true,gait:Math.PI/2,walkWeight:1},still),stop=officeHandContacts({walk:true,gait:Math.PI/2,walkWeight:0},still)
 assert.notEqual(one.left.y,stop.left.y)
 assert.notEqual(one.right.y,stop.right.y)
 const mug=officeHandContacts({walk:true,mug:true,gait:Math.PI/2,walkWeight:1},still)
 assert.equal(mug.right.y,stop.right.y)
})
it('reaches for a seated prop gradually rather than snapping both hands to its grip',()=>{
 const waiting=officeHandContacts({objectAction:'book',seatBlend:0},still),held=officeHandContacts({objectAction:'book',seatBlend:1},still),middle=officeHandContacts({objectAction:'book',seatBlend:.5},still)
 assert.equal(waiting.left.x,-15)
 assert.equal(held.left.x,-10)
 assert.equal(middle.left.x,(waiting.left.x+held.left.x)/2)
 assert.equal(middle.right.x,(waiting.right.x+held.right.x)/2)
})
it('keeps ordinary seated art at its original height while explicit seat blends settle softly',()=>{
 const context=new Proxy({globalAlpha:1} as Record<string,unknown>,{get:(target,key)=>key in target?target[key as string]:()=>{}}) as unknown as CanvasRenderingContext2D
 const standing=drawOfficeAvatar(context,officeAppearance(0),0,0,0,{mug:true})
 const seated=drawOfficeAvatar(context,officeAppearance(0),0,0,0,{mug:true,sit:true})
 const settling=drawOfficeAvatar(context,officeAppearance(0),0,0,0,{mug:true,sit:true,seatBlend:1})
 assert.deepEqual(seated.right,standing.right)
 assert.equal(settling.right.y-seated.right.y,2)
})
