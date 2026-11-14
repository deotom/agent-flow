import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeWorkExchange,officeRestConversations} from '../lib/office-communication'
import {officeAppearance} from '../lib/office-model'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
import type {OfficeTrip} from '../lib/office-motion'
import {drawOfficeCommunications} from '../components/agent-visualizer/office/office-communication-art'

const person=(key:string,parentKey:string|null=null):OfficeActor=>({key,sessionId:'team',parentKey,agent:{id:key,parentId:parentKey,role:parentKey?'worker':'lead',name:key,runtime:'codex',model:null,status:'idle',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null},task:null,appearance:officeAppearance(0),floorId:'room',zone:'lounge',activity:'Resting',runtimeName:'Codex',x:parentKey?160:100,y:300})
const scene=():OfficeScene=>({width:450,height:500,actors:[person('lead'),person('worker','lead')],floors:[{id:'room',kind:'team',sessionId:'team',title:'Team',subtitle:'',color:'#abc',y:200,height:250,actorKeys:['lead','worker']}],quietTeams:[],totalAgents:2,finishedCount:0})
const trip=(kind:OfficeTrip['event']['kind']):OfficeTrip=>({event:{id:'event',kind,actorKey:'worker',parentKey:'lead',at:1},actorKey:'worker',actor:person('worker','lead'),startedAt:100,endsAt:2100,segments:[{kind:'hold',floorId:'room',from:{x:160,y:300},to:{x:160,y:300},duration:2000}],caption:'',shaftX:420,rungPitch:18})
it('communicates only observed assignment, delivery and acknowledgement events during their live handoff',()=>{
 const s=scene(),before=JSON.stringify(s)
 assert.equal(officeWorkExchange(trip('assigned'),s,99),null)
 assert.equal(officeWorkExchange(trip('assigned'),s,2100),null)
 assert.equal(officeWorkExchange(trip('activity'),s,1000),null)
 assert.equal(officeWorkExchange(trip('finished'),s,1000),null,'completion alone is not proof of delivery')
 assert.equal(officeWorkExchange(trip('sent'),s,1000)?.kind,'sent')
 assert.equal(officeWorkExchange(trip('sent'),s,1000)?.senderKey,'worker')
 assert.equal(officeWorkExchange(trip('assigned'),s,1000)?.senderKey,'lead')
 assert.equal(officeWorkExchange(trip('received'),s,1000)?.label,'Report received')
 assert.equal(JSON.stringify(s),before)
})
it('honours real ancestry and suppresses hidden or riding people and cross-room transfer lines',()=>{
 const s=scene()
 s.actors[1].parentKey='someone-else';assert.equal(officeWorkExchange(trip('sent'),s,1000),null)
 s.actors[1].parentKey='lead';s.actors[0].hidden=true;assert.equal(officeWorkExchange(trip('sent'),s,1000),null)
 s.actors[0].hidden=false;s.actors[0].pose={inLift:true};assert.equal(officeWorkExchange(trip('sent'),s,1000),null)
 s.actors[0].pose=undefined;s.actors[0].floorId='other'
 assert.equal(officeWorkExchange(trip('sent'),s,1000)?.remote,true)
})
it('does not flash an exchange bubble during a short transit hold',()=>{
 const handoff=trip('sent'),hold=handoff.segments[0]
 handoff.segments=[{...hold,duration:280},{...hold,duration:1400}];handoff.endsAt=1780
 assert.equal(officeWorkExchange(handoff,scene(),200),null)
 assert.equal(officeWorkExchange(handoff,scene(),700)?.kind,'sent')
})
it('puts remote labels only on the sender or acknowledged receiver that owns the action',()=>{
 const labels:string[]=[]
 const c=new Proxy({fillText:(text:string)=>labels.push(text),measureText:()=>({width:50})},{get:(target,key)=>Reflect.get(target,key)??(()=>{})}) as unknown as CanvasRenderingContext2D
 const s=scene();s.actors=s.actors.filter(a=>a.key==='worker')
 for(const kind of ['assigned','received'] as const){
  drawOfficeCommunications(c,s,1,{kind,senderKey:kind==='assigned'?'lead':'worker',receiverKey:kind==='assigned'?'worker':'lead',label:kind==='assigned'?'Assigning work':'Report received',remote:true,progress:.5},[])
 }
 assert.deepEqual(labels,[])
 drawOfficeCommunications(c,s,1,{kind:'sent',senderKey:'worker',receiverKey:'lead',label:'Report sent',remote:true,progress:.5},[])
 assert.deepEqual(labels,['Report sent'])
})
it('rest and party conversations alternate speakers without inventing work or spoken content',()=>{
 const s=scene();s.actors.forEach(a=>{a.party=true})
 const seen=new Set<string>()
 for(let t=0;t<40;t+=.1)for(const chat of officeRestConversations(s,t,new Set())){
  seen.add(chat.speakerKey);assert.notEqual(chat.speakerKey,chat.listenerKey)
 }
 assert.deepEqual([...seen].sort(),['lead','worker'])
 assert.deepEqual(officeRestConversations(s,0,new Set()),[])
 s.actors[1].agent.status='waiting_input'
 assert.equal(Array.from({length:400},(_,i)=>officeRestConversations(s,i/10,new Set()).length).reduce((a,b)=>a+b,0),0)
 s.actors[1].agent.status='idle';s.actors[1].pose={walk:true}
 assert.equal(Array.from({length:400},(_,i)=>officeRestConversations(s,i/10,new Set()).length).reduce((a,b)=>a+b,0),0)
})
