import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeSelectionGesture} from '../lib/office-selection-gesture'
it('acknowledges only an explicit matching selection for one short bounded nod',()=>{
 const cue={actorKey:'a',startedAt:10}
 assert.equal(officeSelectionGesture('a',undefined,cue,10.3,true)>0,true)
 for(const time of [9,10,11,20])assert.equal(officeSelectionGesture('a',undefined,cue,time,true),0)
 assert.equal(officeSelectionGesture('b',undefined,cue,10.3,true),0)
 assert.equal(officeSelectionGesture('a',undefined,null,10.3,true),0)
})
it('never interrupts travel or animates when disabled',()=>{
 for(const pose of [{walk:true},{climb:true},{inLift:true},{opacity:.2}])assert.equal(officeSelectionGesture('a',pose,{actorKey:'a',startedAt:1},1.4,true),0)
 assert.equal(officeSelectionGesture('a',undefined,{actorKey:'a',startedAt:1},1.4,false),0)
})

it('does not move supported palms or mutate the work pose',async()=>{
 const {officeHandContacts}=await import('../lib/office-contacts')
 const pose={typing:true,supportHands:{left:{x:-12,y:-26},right:{x:13,y:-27}}}
 const before=structuredClone(pose),frame={lift:.3,left:0,right:0,wave:0,sip:0}
 const acknowledgment=officeSelectionGesture('a',pose,{actorKey:'a',startedAt:1},1.4,true)
 assert.ok(acknowledgment>0)
 assert.deepEqual(officeHandContacts({...pose,acknowledgment},frame),officeHandContacts(pose,frame))
 assert.deepEqual(pose,before)
})
