import assert from 'node:assert/strict'
import test from 'node:test'
import {roomCuriosFor} from './office-room-curios'
import type {OfficeFloor} from './office-types'
const floor=(overrides:Partial<OfficeFloor>={}):OfficeFloor=>({id:'floor-a',sessionId:'project-42',title:'Studio design',subtitle:'',color:'#fff',y:120,actorKeys:[],kind:'team',...overrides})
test('curios stay fixed through status, agent count and task updates without mutating floors',()=>{
 const base=floor(),before=structuredClone(base),first=roomCuriosFor(base)
 assert.deepEqual(first,roomCuriosFor(floor({subtitle:'another task',working:9,waiting:2,actorKeys:['a','b'],board:{goal:'new task',done:2,total:7,items:[]}})))
 assert.deepEqual(base,before)
 assert.deepEqual(first,roomCuriosFor(base))
})
test('compositions are bounded small wall objects, varied by project identity',()=>{
 const fingerprints=new Set<string>()
 for(let i=0;i<100;i++){
  const result=roomCuriosFor(floor({sessionId:`project-${i}`}))
  assert.equal(result.items.length,4)
  assert.equal(new Set(result.items.map(item=>item.kind)).size,result.items.length)
  for(const item of result.items){
   const dx=(Math.abs(Math.cos(item.tilt))*item.width+Math.abs(Math.sin(item.tilt))*item.height)/2
   const dy=(Math.abs(Math.sin(item.tilt))*item.width+Math.abs(Math.cos(item.tilt))*item.height)/2
   assert.ok(item.x+item.width/2-dx>=.65&&item.y+item.height/2-dy>=.14)
   assert.ok(item.x+item.width/2+dx<=.800001&&item.y+item.height/2+dy<=.250001)
   assert.ok(item.width>0&&item.height>0)
  }
  fingerprints.add(JSON.stringify(result))
 }
 assert.ok(fingerprints.size>=12)
})
test('mission selects different silhouettes while session identity fixes variant',()=>{
 const cases=[['Design studio','swatches'],['Deploy operations','cable'],['Research investigation','specimen'],['Quality testing','gauge']] as const
 for(const [title,kind] of cases)assert.ok(roomCuriosFor(floor({title})).items.some(item=>item.kind===kind))
 const a=roomCuriosFor(floor()),b=roomCuriosFor(floor({title:'Research investigation'}))
 assert.equal(a.variant,b.variant)
 assert.notDeepEqual(a.items.map(({x,y,width,height})=>({x,y,width,height})),b.items.map(({x,y,width,height})=>({x,y,width,height})))
})
test('themes have distinct supports and project variants materially change placement',()=>{
 const titles=['Design studio','Deploy operations','Research investigation','Quality testing']
 const geometry=(title:string,sessionId='project-42')=>roomCuriosFor(floor({title,sessionId}))
 const signatures=titles.map(title=>JSON.stringify(geometry(title).items.map(({x,y,width,height})=>[x,y,width,height])))
 assert.equal(new Set(signatures).size,4)
 assert.equal(new Set(titles.map(title=>geometry(title).supports[0].kind)).size,4)
 for(const title of titles){
  const samples=Array.from({length:20},(_,i)=>geometry(title,`session-${i}`))
  const a=samples[0],b=samples.find(sample=>sample.variant!==a.variant)!
  assert.ok(b)
  assert.ok(a.items.some((item,i)=>Math.abs(item.x-b.items[i].x)>.025))
  for(const sample of samples){
   for(const item of sample.items){
    const dx=(Math.abs(Math.cos(item.tilt))*item.width+Math.abs(Math.sin(item.tilt))*item.height)/2
    const dy=(Math.abs(Math.sin(item.tilt))*item.width+Math.abs(Math.cos(item.tilt))*item.height)/2
    assert.ok(item.x+item.width/2-dx>=.65&&item.y+item.height/2-dy>=.14)
    assert.ok(item.x+item.width/2+dx<=.80&&item.y+item.height/2+dy<=.25)
   }
   for(const support of sample.supports){
    assert.ok(support.x>=.65&&support.y>=.14)
    assert.ok(support.x+support.width<=.80&&support.y+support.height<=.25)
   }
  }
 }
})
