import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeAgentInfo,officeNextAttention,officePlanningInfo,officeRevealTarget} from '../lib/office-interaction'
import {officeKey} from '../lib/office-model'
import type {TeamSnapshot} from '../lib/team-types'
import type {OfficeScene} from '../lib/office-types'
const team=(sessionId:string):TeamSnapshot=>({sessionId,title:'ทีมชื่อยาวสำหรับทดสอบการอ่านทั้งหมด',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name:'หัวหน้าผู้ประสานงานชื่อยาวโดยไม่ตัดข้อความ',runtime:'codex',model:'test-model',status:'waiting_input',task:'งานเต็มที่ต้องอ่านได้',activities:[],requestKind:'question',context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]})
it('cycles real waiting agents in stable key order and rechecks changed or removed requests',()=>{
 const a=team('a'),b=team('b')
 assert.equal(officeNextAttention([b,a],null)?.key,officeKey('a','lead'))
 assert.equal(officeNextAttention([a,b],officeKey('a','lead'))?.key,officeKey('b','lead'))
 assert.equal(officeNextAttention([b,a],officeKey('b','lead'))?.key,officeKey('a','lead'))
 b.agents[0].status='running'
 assert.equal(officeNextAttention([a,b],officeKey('a','lead'))?.key,officeKey('a','lead'))
 assert.equal(officeNextAttention([b],officeKey('a','lead')),null)
})
it('reads full names and task evidence from the latest source rather than shortened room labels',()=>{
 const source=team('a'),info=officeAgentInfo([source],officeKey('a','lead'))!
 assert.equal(info.agent.name,source.agents[0].name)
 assert.equal(info.team.title,source.title)
 assert.equal(info.assignment,source.agents[0].task)
 assert.equal(officeAgentInfo([source],officeKey('missing','lead')),null)
 source.tasks=[{id:'task',childId:'lead',parentId:'root',name:'ชื่องานเต็ม',model:null,task:'คำอธิบายงานล่าสุด',result:null,status:'working',delivery:'none',startedAt:1,updatedAt:2,completedAt:null}]
 assert.equal(officeAgentInfo([source],officeKey('a','lead'))!.assignment,'คำอธิบายงานล่าสุด')
})
it('reveals the physical annex or lift location without bringing hidden history rooms back',()=>{
 const source={width:450,height:1000,floors:[{id:'team',kind:'team',y:228,height:253},{id:'rest',kind:'break',annexOf:'team',y:228,height:253}],actors:[{key:'a',floorId:'rest',x:150,y:400}]} as OfficeScene
 assert.deepEqual(officeRevealTarget(source,'a'),{peekId:'rest',y:400})
 source.actors[0].pose={inLift:true};source.actors[0].y=600
 assert.deepEqual(officeRevealTarget(source,'a'),{peekId:null,y:600})
 source.actors[0].hidden=true
 assert.equal(officeRevealTarget(source,'a'),null)
 assert.equal(officeRevealTarget(source,'missing'),null)
})
it('expands the board from full source labels and includes tasks beyond the three-item painted preview',()=>{
 const source=team('a'),long='ชื่องานเต็มสำหรับกระดานที่ต้องอ่านได้ทั้งหมดโดยไม่มีการตัด'.repeat(3)
 source.tasks=Array.from({length:5},(_,i)=>({id:`task${i}`,childId:`worker${i}`,parentId:'lead',name:long+i,model:null,task:'PRIVATE ASSIGNMENT',result:'PRIVATE RESULT',status:'working' as const,delivery:'none' as const,startedAt:1,updatedAt:2,completedAt:null}))
 const board=officePlanningInfo([source],'a')!
 assert.equal(board.goal,source.title)
 assert.equal(board.total,5)
 assert.equal(board.items.length,6)
 assert.equal(board.items[1].label,long+'0')
 assert.ok(!JSON.stringify(board).includes('PRIVATE'))
 assert.equal(officePlanningInfo([source],'gone'),null)
})
