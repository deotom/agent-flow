import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeActorDepthScale,officeActorRenderScale} from '../lib/office-depth'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
const scene:OfficeScene={width:450,height:1000,actors:[],quietTeams:[],totalAgents:0,finishedCount:0,floors:[{id:'work',kind:'team',sessionId:'s',title:'Work',subtitle:'',color:'#fff',y:250,height:250,actorKeys:[]},{id:'private',kind:'break',annexOf:'work',sessionId:'s',title:'Private',subtitle:'',color:'#fff',y:250,height:250,actorKeys:[]}]}
const actor=(v:number,floorId='work')=>({floorId,x:200,y:250+v*250} as OfficeActor)
it('grows uniformly from a rear-wall door to the front seating aisle without moving the feet',()=>{
 const back=actor(.64),front=actor(.79),before=structuredClone([back,front,scene])
 assert.ok(officeActorDepthScale(scene,back)<.9)
 assert.ok(officeActorDepthScale(scene,front)>1)
 let prior=0
 for(let v=.52;v<=.83;v+=.001){const scale=officeActorDepthScale(scene,actor(v));assert.ok(scale>=prior);if(prior)assert.ok(scale-prior<.002);prior=scale}
 assert.deepEqual([back,front,scene],before)
})
it('uses identical depth in a room, its annex and an annex-local canvas',()=>{
 for(const v of [.52,.64,.79,.9]){
  const a=actor(v,'private'),local={...scene,floors:[{...scene.floors[1],y:0}]}
  assert.equal(officeActorDepthScale(scene,a),officeActorDepthScale(scene,actor(v)))
  assert.equal(officeActorDepthScale(scene,a),officeActorDepthScale(local,{...a,y:a.y-250}))
 }
})
it('keeps lift cabin scale independent of changing floor depth and respects viewport scale',()=>{
 const a={...actor(.64),pose:{inLift:true}},b={...actor(.95),pose:{inLift:true}}
 assert.equal(officeActorRenderScale(scene,a),.72)
 assert.equal(officeActorRenderScale(scene,b),.72)
 const half={...scene,width:225,floors:scene.floors.map(f=>({...f,y:f.y/2,height:f.height!/2}))}
 assert.equal(officeActorRenderScale(half,{...actor(.79),x:100,y:actor(.79).y/2}),officeActorRenderScale(scene,actor(.79))/2)
})
it('bounds scale and uses a safe fallback for absent floors or invalid coordinates',()=>{
 for(const v of [-10,0,1,20])assert.ok(officeActorDepthScale(scene,actor(v))>=.78&&officeActorDepthScale(scene,actor(v))<=1.04)
 assert.equal(officeActorDepthScale(scene,actor(.5,'absent')),1)
 assert.equal(officeActorDepthScale(scene,{...actor(.5),y:NaN}),1)
})
