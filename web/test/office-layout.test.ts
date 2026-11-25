import test from 'node:test'
import assert from 'node:assert/strict'
import { officeDesktopHistoryLayout, officeLayoutChanged, officeLayoutFrame } from '../lib/office-layout'
import type { OfficeScene, OfficeFloor } from '../lib/office-types'
import { buildOfficeScene } from '../lib/office-model'
import type { TeamSnapshot } from '../lib/team-types'

const team=(id:string,count=1):TeamSnapshot=>({sessionId:id,title:id,active:true,updatedAt:1,tasks:[],agents:Array.from({length:count},(_,i)=>({id:String(i),parentId:i?'0':null,role:i?'worker':'lead',name:String(i),runtime:null,model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}))})
const scene=(teams:TeamSnapshot[])=>buildOfficeScene(teams,'active',false,new Map())
const desktopScene=(teams:TeamSnapshot[])=>buildOfficeScene(teams,'active',false,new Map(),450,new Set(),[],{},true)
const histDesktopScene=(teams:TeamSnapshot[])=>officeDesktopHistoryLayout(desktopScene(teams))
const atHome=(id:string):TeamSnapshot=>{const result=team(id);result.agents[0].status='done';return result}

test('Desktop swaps workrooms smoothly with clipped native-proportion reveals and without colliding with history',()=>{
 const before=histDesktopScene([team('a'),team('b'),atHome('c')])
 const next=histDesktopScene([team('a'),atHome('b'),team('c')])
 const start=officeLayoutFrame(before,next,0)
 const mid=officeLayoutFrame(before,next,.5)
 const end=officeLayoutFrame(before,next,1)
 const enteringStart=start.floors.find(f=>f.sessionId==='c')!
 const enteringMid=mid.floors.find(f=>f.sessionId==='c')!
 const exitingMid=mid.floors.find(f=>f.sessionId==='b')!
 assert.equal(start.height,before.height)
 assert.equal(end,next)
 assert.ok(enteringMid.height!>0&&enteringMid.constructing===undefined)
 assert.equal(enteringStart.clipHeight,0)
 assert.ok(enteringMid.clipHeight!>0&&enteringMid.clipHeight!<enteringMid.height!)
 assert.ok(enteringMid.transitionOpacity!>0&&enteringMid.transitionOpacity!<=1)
 assert.equal(exitingMid.exiting,true)
 assert.ok(exitingMid.clipHeight!>0&&exitingMid.clipHeight!<exitingMid.height!)
 assert.ok(exitingMid.transitionOpacity!>0&&exitingMid.transitionOpacity!<1)
 for(const frame of [start,mid,end]){
  const history=frame.floors.find(f=>f.kind==='quiet')!
  const rooms=frame.floors.filter(f=>f.kind==='team')
  const bottom=rooms.reduce((m,f)=>Math.max(m,f.y+(f.clipHeight??f.height!)),0)
  assert.ok(history.y>=bottom,'history band stays below every visible/transitioning Desktop room')
 }
})

test('Desktop adding and removing workrooms preserves actors smoothly and handles interruptions',()=>{
 const one=histDesktopScene([team('a')])
 const two=histDesktopScene([team('a'),team('b')])
 const addStart=officeLayoutFrame(one,two,0),addMid=officeLayoutFrame(one,two,.5),addEnd=officeLayoutFrame(one,two,1)
 assert.equal(addStart.height,one.height)
 assert.ok(addMid.height>one.height&&addMid.height<two.height)
 assert.equal(addEnd,two)
 const roomB=addMid.floors.find(f=>f.sessionId==='b')!
 assert.equal(roomB.clipHeight,roomB.height!/2)

 // Removing team 'a' keeps 'a' and its actor while 'b' slides smoothly upward.
 const remStart=officeLayoutFrame(two,histDesktopScene([team('b')]),0)
 const remMid=officeLayoutFrame(two,histDesktopScene([team('b')]),.5)
 const remEnd=officeLayoutFrame(two,histDesktopScene([team('b')]),1)
 assert.equal(remStart.height,two.height)
 assert.ok(remMid.height<two.height&&remMid.height>one.height)
 assert.equal(remMid.floors.find(f=>f.sessionId==='a')?.exiting,true)
 assert.ok(remMid.actors.some(a=>a.sessionId==='a'),'departing room keeps its actors while closing')
 assert.ok(remMid.floors.find(f=>f.sessionId==='b')!.y<two.floors.find(f=>f.sessionId==='b')!.y)
 const actorB=remMid.actors.find(a=>a.sessionId==='b')!
 const floorB=remMid.floors.find(f=>f.sessionId==='b')!
 const origBFloor=two.floors.find(f=>f.sessionId==='b')!,origBActor=two.actors.find(a=>a.sessionId==='b')!
 assert.ok(Math.abs((actorB.y-floorB.y)-(origBActor.y-origBFloor.y))<1e-6,'actor stays glued to sliding floorboards')
 assert.equal(remEnd.floors.some(f=>f.sessionId==='a'),false)

 // Interrupted transitions continue smoothly from exact displayed clipHeight and opacity.
 const interruptedReenter=officeLayoutFrame(remMid,two,0)
 const reA=interruptedReenter.floors.find(f=>f.sessionId==='a')!
 const midA=remMid.floors.find(f=>f.sessionId==='a')!
 assert.equal(reA.clipHeight,midA.clipHeight)
 assert.equal(reA.transitionOpacity,midA.transitionOpacity)
 const interruptedCancelAdd=officeLayoutFrame(addMid,one,0)
 const cancelB=interruptedCancelAdd.floors.find(f=>f.sessionId==='b')!
 assert.equal(cancelB.clipHeight,roomB.clipHeight)
 assert.equal(cancelB.transitionOpacity,roomB.transitionOpacity)
})

test('Desktop history band toggles smoothly without height snapping',()=>{
 const noHist=histDesktopScene([team('a')])
 const withHist=histDesktopScene([team('a'),atHome('h')])
 const enter0=officeLayoutFrame(noHist,withHist,0),enterMid=officeLayoutFrame(noHist,withHist,.5),enter1=officeLayoutFrame(noHist,withHist,1)
 assert.equal(enter0.height,noHist.height)
 assert.ok(enterMid.height>noHist.height&&enterMid.height<withHist.height)
 assert.equal(enter1.height,withHist.height)
 const exit0=officeLayoutFrame(withHist,noHist,0),exitMid=officeLayoutFrame(withHist,noHist,.5),exit1=officeLayoutFrame(withHist,noHist,1)
 assert.equal(exit0.height,withHist.height)
 assert.ok(exitMid.height<withHist.height&&exitMid.height>noHist.height)
 assert.equal(exit1.height,noHist.height)
 assert.equal(exitMid.floors.find(f=>f.kind==='quiet')?.exiting,true)
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
