import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeWorkGesture} from '../lib/office-work-gestures'
import type {OfficeActor,OfficePose,OfficeWorkStation} from '../lib/office-types'
import type {TeamAgentStatus} from '../lib/team-types'
const actor:Pick<OfficeActor,'key'|'agent'|'pose'>={key:'worker-a',agent:{id:'a',parentId:null,role:'worker',name:'A',runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}}
const stations=['research','build','quality','terminal'] as const
it('uses distinct slow task actions and bounded smooth movement without mutation',()=>{
 const original=structuredClone(actor)
 const expected={research:['page','note'],build:['type','adjust'],quality:['inspect','note'],terminal:['type','mouse','adjust']}
 for(const station of stations){
  const kinds=new Set<string>()
  for(let t=.001;t<180;t+=.137){
   const g=officeWorkGesture(actor,station,t)!
   kinds.add(g.kind)
   assert.ok(g.progress>=0&&g.progress<=1)
   assert.ok(g.reach>=0&&g.reach<=1)
   assert.ok(Math.abs(g.turn)<=.15&&Math.abs(g.nod)<=.12)
   assert.ok(Object.values(g).every(v=>typeof v!=='number'||Number.isFinite(v)))
   assert.ok(Math.abs(g.reach-Math.sin(Math.PI*g.progress)**2)<1e-9)
   const next=officeWorkGesture(actor,station,t+.001)!
   assert.ok(Math.abs(next.reach-g.reach)<.003,'one millisecond does not jitter a hand')
   assert.deepEqual(officeWorkGesture(actor,station,t),g)
  }
  assert.deepEqual(kinds,new Set(expected[station]))
 }
 assert.deepEqual(actor,original)
})
it('seeds actor cadence and phase while preserving a stationary baseline with effects off',()=>{
 const other={...actor,key:'worker-b'}
 for(const station of stations){
  assert.notDeepEqual(officeWorkGesture(actor,station,4.5),officeWorkGesture(other,station,4.5))
  const baseline=officeWorkGesture(actor,station,0)!
  assert.deepEqual(baseline,{kind:station==='research'?'page':station==='quality'?'inspect':'type',progress:0,reach:0,turn:0,nod:0})
  for(const time of [-1,0,NaN,Infinity])assert.deepEqual(officeWorkGesture(other,station,time),baseline)
  assert.equal(officeWorkGesture(actor,station,5,false),null)
 }
 assert.equal(officeWorkGesture(actor,'planning',5),null)
})
it('allows zero-valued inactive overlays from the wardrobe and sharing painters',()=>{
 for(const pose of [{dressing:0},{offer:0},{wave:0},{dressing:0,offer:0,wave:false}]){
  assert.ok(officeWorkGesture({...actor,pose},'build',5),'zero is an inactive overlay, not an occupied hand')
 }
})
it('only animates authoritative working statuses and lets motion and social poses preempt work',()=>{
 for(const status of ['running','thinking','background'] as TeamAgentStatus[])assert.ok(officeWorkGesture({...actor,agent:{...actor.agent,status}},'build',5))
 for(const status of ['idle','waiting','done','failed','cancelled'] as TeamAgentStatus[])assert.equal(officeWorkGesture({...actor,agent:{...actor.agent,status}},'build',5),null)
 const poses:Array<OfficePose & {wave?:boolean|number}>=[{walk:true},{climb:true},{inLift:true},{carry:true},{hand:true},{dressing:.5},{offer:.5},{wave:true},{wave:.5}]
 for(const pose of poses)for(const station of stations)assert.equal(officeWorkGesture({...actor,pose},station,5),null)
 assert.ok(officeWorkGesture({...actor,pose:{walk:false,typing:true}},'build',5))
})
