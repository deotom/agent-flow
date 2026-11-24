import test from 'node:test'
import assert from 'node:assert/strict'
import {buildOfficeScene,officeKey} from '../lib/office-model'
import {roomLeadRestPoint} from '../lib/office-room-design'
import {officeLife} from '../lib/office-life'
import {officeLeadRestTransitions,officePendingOriginKeys} from '../lib/office-lead-rest'
import type {TeamAgentRow,TeamSnapshot} from '../lib/team-types'
const agent=(id:string,status:TeamAgentRow['status'],parentId:string|null=null):TeamAgentRow=>({id,parentId,role:parentId?'worker':'lead',name:id,runtime:null,model:null,status,task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null})
const snapshot=(status:TeamAgentRow['status']):TeamSnapshot=>({sessionId:'s',title:'Research office',active:true,updatedAt:1,agents:[agent('lead',status),agent('worker','running','lead')],tasks:[]})
const build=(s:TeamSnapshot)=>buildOfficeScene([s],'session',false,new Map())
const lead=(s:ReturnType<typeof build>)=>s.actors.find(a=>a.key===officeKey('s','lead'))!
test('keeps origins only for current pending participants and the active walker',()=>{
 const event={id:'assigned',kind:'assigned' as const,actorKey:'worker',parentKey:'lead',at:1}
 assert.deepEqual([...officePendingOriginKeys([event],'walker')].sort(),['lead','walker','worker'])
 assert.equal(officePendingOriginKeys([],undefined).size,0,'expired or dropped evidence cannot pin an old origin')
})
test('actually idle lead keeps a main room nook without extra annex, source edits or room churn',()=>{
 const source=snapshot('idle'),json=JSON.stringify(source),rest=build(source),actor=lead(rest),work=build(snapshot('running'))
 const floor=rest.floors.find(f=>f.id===actor.floorId)!
 assert.equal(actor.zone,'lounge');assert.equal(floor.kind,'team');assert.equal(actor.stand,false);assert.equal(actor.workStation,undefined)
 assert.deepEqual({x:actor.x,y:actor.y},roomLeadRestPoint(floor,rest.width));assert.ok(['book','coffee'].includes(actor.objectAction!))
 assert.equal(rest.floors.some(f=>f.kind==='break'),false);assert.deepEqual(rest.floors.map(f=>[f.id,f.y,f.height]),work.floors.map(f=>[f.id,f.y,f.height]))
 assert.equal(JSON.stringify(source),json);assert.equal(actor.agent.status,'idle')
 for(const status of ['thinking','running','background','waiting_approval','waiting_input','failed'] as const){const a=lead(build(snapshot(status)));assert.equal(a.zone,'desk',status);assert.equal(a.objectAction,undefined,status)}
 source.agents[1].status='idle';assert.equal(build(source).actors.length,0)
})
test('idle lead reads or drinks without workstation dozing and active travel suppresses nook life',()=>{
 const actor=lead(build(snapshot('idle')))
 for(let time=0;time<100;time+=.37){const life=officeLife(actor,time);assert.equal(life.doze,false);assert.equal(life.typing,false);assert.equal(life.walk,false);assert.equal(life.dx,0);assert.ok(life.objectAction==='book'||life.objectAction==='coffee')}
 const trip=officeLife(actor,20,{tripActive:true});assert.equal(trip.objectAction,undefined);assert.equal(trip.walk,false)
})
test('rest transition intents use source coordinates, require observed zone change, and do not mutate scenes',()=>{
 const work=build(snapshot('running')),rest=build(snapshot('idle')),json=JSON.stringify([work,rest])
 assert.deepEqual(officeLeadRestTransitions(null,rest),[]);assert.deepEqual(officeLeadRestTransitions(rest,rest),[])
 const [toRest]=officeLeadRestTransitions(work,rest);assert.equal(toRest.actorKey,lead(rest).key);assert.deepEqual(toRest.from,lead(work));assert.deepEqual(toRest.to,lead(rest));assert.match(toRest.caption,/rest|report/)
 const waiting=build(snapshot('waiting_input'));const [toDesk]=officeLeadRestTransitions(rest,waiting);assert.equal(toDesk.to.zone,'desk');assert.deepEqual(toDesk.from,lead(rest))
 assert.deepEqual(officeLeadRestTransitions(rest,{...work,actors:work.actors.filter(a=>a.agent.id!=='lead')}),[])
 assert.deepEqual(officeLeadRestTransitions(rest,{...work,actors:work.actors.map(a=>({...a,hidden:true}))}),[])
 assert.equal(JSON.stringify([work,rest]),json)
})
test('large-room model actors occupy the actual staggered depth rows used by furniture',()=>{
 const source=snapshot('running');source.agents.push(...Array.from({length:5},(_,i)=>agent(`more${i}`,'running','lead')))
 const s=build(source),floor=s.floors.find(f=>f.kind==='team')!,actors=s.actors.filter(a=>a.floorId===floor.id&&!a.hidden)
 assert.equal(floor.room,'room-stations-large')
 assert.ok(Math.max(...actors.map(a=>a.y))-Math.min(...actors.map(a=>a.y))>s.width*.15)
 assert.ok(actors.every(a=>a.x<s.width*.75))
})
test('initial small-room staging leaves the occupied lead nook clear before the first work pulse',()=>{
 const source=snapshot('idle');source.agents.push(agent('extra1','running','lead'),agent('extra2','running','lead'))
 const s=build(source),people=s.actors.filter(a=>!a.hidden&&s.floors.some(f=>f.id===a.floorId&&f.kind==='team'))
 assert.equal(s.floors.find(f=>f.kind==='team')!.room,'room-stations')
 for(let i=0;i<people.length;i++)for(let j=0;j<i;j++)assert.ok(Math.abs(people[i].x-people[j].x)>=48||Math.abs(people[i].y-people[j].y)>=60,'initial bodies are clear, not just later cached positions')
})
test('Desktop idle root lead stands calmly at the Lead table without a forced reading book',()=>{
 const source=snapshot('idle')
 const desktop=buildOfficeScene([source],'session',false,new Map(),450,new Set(),[],{},true)
 const actor=desktop.actors.find(a=>a.key===officeKey('s','lead'))!
 assert.equal(actor.zone,'lounge');assert.equal(actor.stand,true);assert.equal(actor.objectAction,undefined)
 assert.equal(actor.activity,'At the Lead table')
 for(const t of [0,1.5,12,24]){
  const life=officeLife(actor,t)
  assert.equal(life.stand,true);assert.equal(life.objectAction,undefined);assert.equal(life.doze,false);assert.equal(life.walk,false);assert.equal(life.dx,0)
 }
})
