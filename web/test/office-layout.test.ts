import test from 'node:test'
import assert from 'node:assert/strict'
import { officeDesktopHistoryLayout, officeLayoutChanged, officeLayoutFrame } from '../lib/office-layout'
import type { OfficeScene, OfficeFloor } from '../lib/office-types'
import { buildOfficeScene } from '../lib/office-model'
import type { TeamSnapshot } from '../lib/team-types'

const team=(id:string,count=1):TeamSnapshot=>({sessionId:id,title:id,active:true,updatedAt:1,tasks:[],agents:Array.from({length:count},(_,i)=>({id:String(i),parentId:i?'0':null,role:i?'worker':'lead',name:String(i),runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}))})
const scene=(teams:TeamSnapshot[])=>buildOfficeScene(teams,'active',false,new Map())
const desktopScene=(teams:TeamSnapshot[])=>buildOfficeScene(teams,'active',false,new Map(),450,new Set(),[],{},true)
const atHome=(id:string):TeamSnapshot=>{const result=team(id);result.agents[0].status='done';return result}

test('Desktop swaps workrooms without reserving a blank floor or colliding with history',()=>{
 const before=desktopScene([team('a'),team('b'),atHome('c')])
 const next=desktopScene([team('a'),atHome('b'),team('c')])
 const frame=officeLayoutFrame(before,next,0)
 assert.equal(frame,next)
 const entering=frame.floors.find(f=>f.sessionId==='c')!
 assert.ok(entering.height!>0)
 assert.equal(entering.constructing,undefined)
})

test('Desktop history occupies a dedicated band after the room art and before the cutaway',()=>{
 const unspaced=desktopScene([team('a'),team('b'),atHome('c')])
 const spaced=officeDesktopHistoryLayout(unspaced)
 const history=spaced.floors.find(f=>f.kind==='quiet')!
 const lastRoom=spaced.floors.find(f=>f.sessionId==='b')!
 assert.ok(history.y>=lastRoom.y+lastRoom.height!)
 assert.ok(history.height!*360/spaced.width>=32,'narrow Desktop history fits the button and padding')
 assert.equal(spaced.height,history.y+history.height!+spaced.width/3)
})
test('new rooms grow from zero while existing floors, actors and total height move continuously',()=>{
 const before=scene([team('b')]),next=scene([team('a'),team('b')])
 const start=officeLayoutFrame(before,next,0),middle=officeLayoutFrame(before,next,.5),end=officeLayoutFrame(before,next,1)
 const oldB=before.floors.find(f=>f.sessionId==='b')!,newB=next.floors.find(f=>f.sessionId==='b')!
 assert.equal(start.floors.find(f=>f.sessionId==='a')!.height,0)
 assert.equal((middle.floors.find(f=>f.sessionId==='a') as OfficeFloor&{constructing?:boolean}).constructing,true)
 assert.equal(start.floors.find(f=>f.sessionId==='b')!.y,oldB.y)
 assert.equal(middle.floors.find(f=>f.sessionId==='b')!.y,(oldB.y+newB.y)/2)
 assert.equal(middle.height,(before.height+next.height)/2)
 assert.deepEqual(middle.floors[0],next.floors[0])
 assert.equal(start.actors.find(a=>a.sessionId==='b')!.y,before.actors[0].y)
 assert.equal(end,next)
 for(const progress of [0,.1,.5,.9,1])for(const actor of officeLayoutFrame(before,next,progress).actors)assert.ok(Number.isFinite(actor.x)&&Number.isFinite(actor.y))
})
test('resizing and interrupted transitions start from the exact displayed geometry',()=>{
 const before=scene([team('a')]),next=scene([team('a',5)]),middle=officeLayoutFrame(before,next,.4)
 const interrupted=officeLayoutFrame(middle,before,0)
 assert.equal(interrupted.height,middle.height)
 assert.equal(interrupted.floors[1].height,middle.floors[1].height)
 assert.equal(interrupted.actors[0].y,middle.actors[0].y)
 const removed=officeLayoutFrame(scene([team('a'),team('b')]),scene([team('b')]),.5)
 assert.ok(removed.height>scene([team('b')]).height)
})
test('metadata changes do not count as a layout change and current status is retained',()=>{
 const before=scene([team('a')]),next=structuredClone(before)
 next.actors[0].agent.status='thinking';next.floors[1].subtitle='updated'
 assert.equal(officeLayoutChanged(before,next),false)
 assert.equal(officeLayoutFrame(before,next,.4).actors[0].agent.status,'thinking')
 assert.equal(officeLayoutFrame(before,next,.4).floors[1].subtitle,'updated')
 assert.equal(officeLayoutChanged(before,scene([team('a'),team('b')])),true)
})
test('virtual annexes share the interpolated parent floor without adding height',()=>{
 const before=scene([team('a')]),next=scene([team('a',5)])
 const annex=(s:OfficeScene)=>{const f=s.floors.find(f=>f.kind==='team')!;return {...f,id:'annex',kind:'break',annexOf:f.id,actorKeys:[]} as OfficeFloor&{annexOf:string}}
 before.floors.push(annex(before));next.floors.push(annex(next))
 const middle=officeLayoutFrame(before,next,.5),parent=middle.floors.find(f=>f.kind==='team')!,rest=middle.floors.find(f=>f.id==='annex')!
 assert.equal(rest.y,parent.y);assert.equal(rest.height,parent.height)
 assert.equal(middle.height,(before.height+next.height)/2)
})
