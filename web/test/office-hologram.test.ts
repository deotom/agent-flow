import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeAppearance,officeKey,officeEvents} from '../lib/office-model'
import type {TeamSnapshot} from '../lib/team-types'
import type {OfficeActor,OfficeCollaborationMember,OfficeEvent,OfficeScene} from '../lib/office-types'
import {createOfficeHologram,mergeOfficeHolograms,pruneOfficeHolograms,officeHologramFrames,type OfficeHologramState} from '../lib/office-hologram'
import {drawOfficeHolograms} from '../components/agent-visualizer/office/office-hologram-art'

const leadKey=officeKey('s','lead'),childKey=officeKey('s','child')
function scene():OfficeScene{
 const lead:OfficeActor={key:leadKey,sessionId:'s',parentKey:null,agent:{id:'lead',parentId:null,role:'lead',name:'Lead',runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null},task:null,appearance:officeAppearance(0),floorId:'room',zone:'desk',activity:'Working',runtimeName:'Codex',x:100,y:300}
 const member:OfficeCollaborationMember={key:childKey,sessionId:'s',preferenceKey:'child',remote:true,appearance:officeAppearance(8),agent:{...lead.agent,id:'child',parentId:'lead',role:'worker',name:'Child',runtime:'claude'},task:{id:'task',childId:'child',parentId:'lead',name:'Task',model:null,task:null,result:null,status:'working',delivery:'pending',startedAt:1,updatedAt:1,completedAt:null}}
 return {width:450,height:500,actors:[lead],floors:[{id:'room',kind:'team',sessionId:'s',title:'Team',subtitle:'',color:'#abc',y:200,height:250,actorKeys:[leadKey],collaboration:[member]}],quietTeams:[],totalAgents:2,finishedCount:0}
}
const event=(kind:OfficeEvent['kind']='assigned',id=kind):OfficeEvent=>({id,kind,taskId:'task',actorKey:childKey,parentKey:leadKey,at:10000,sourceAt:10000})
const empty=():OfficeHologramState=>({cues:[],seenEventIds:[]})
it('uses real source transitions and never treats task completion as report receipt or replays baseline',()=>{
 const s=scene(),member=s.floors[0].collaboration![0]
 const snapshot:TeamSnapshot={sessionId:'s',title:'Team',active:true,updatedAt:1,agents:[s.actors[0].agent,member.agent],tasks:[]}
 const assigned={...snapshot,tasks:[member.task!]}
 assert.deepEqual(officeEvents(null,[assigned],10000),[])
 const assignments=officeEvents([snapshot],[assigned],10000)
 assert.equal(assignments[0].kind,'assigned')
 assert.equal(mergeOfficeHolograms(empty(),assignments,s,0,10000).cues.length,1)
 const finished={...assigned,tasks:[{...member.task!,status:'done' as const}]}
 const completion=officeEvents([assigned],[finished],10000)
 assert.equal(completion[0].kind,'finished')
 assert.equal(mergeOfficeHolograms(empty(),completion,s,0,10000).cues.length,0)
 const sent={...finished,tasks:[{...finished.tasks[0],delivery:'delivered' as const}]}
 const received={...sent,tasks:[{...sent.tasks[0],delivery:'received' as const}]}
 for(const [prior,next,kind] of [[finished,sent,'sent'],[sent,received,'received']] as const){
  const events=officeEvents([prior],[next],10000)
  member.task=next.tasks[0];member.agent={...member.agent,status:'done'}
  assert.equal(events[0].kind,kind)
  assert.equal(mergeOfficeHolograms(empty(),events,s,0,10000).cues[0].kind,kind)
 }
})
it('binds the projection to the current task and rejects cancelled terminal recipients',()=>{
 const s=scene(),member=s.floors[0].collaboration![0]
 assert.equal(createOfficeHologram({...event(),taskId:'old-task'},s,0,10000),null)
 const state=mergeOfficeHolograms(empty(),[event()],s,0,10000)
 member.task={...member.task!,id:'new-task'}
 assert.equal(pruneOfficeHolograms(state,s,100).cues.length,0)
 member.task={...member.task!,id:'task',status:'done',delivery:'received'};member.agent.status='cancelled'
 assert.equal(createOfficeHologram(event('received'),s,0,10000),null)
})
it('creates cues only for observed assignment, sent and received events, preserving identity',()=>{
 const s=scene(),before=JSON.stringify(s)
 for(const kind of ['assigned','sent','received'] as const){
  const cue=createOfficeHologram(event(kind),s,100,10000)
  assert.equal(cue?.kind,kind);assert.equal(cue?.startedAt,100);assert.equal(cue?.endsAt,2700)
 }
 for(const kind of ['finished','arrived','left','activity','routine'] as const)assert.equal(createOfficeHologram(event(kind),s,100,10000),null)
 assert.equal(JSON.stringify(s),before)
 const state=mergeOfficeHolograms(empty(),[event()],s,100,10000),frame=officeHologramFrames(state,s,500,true)[0]
 assert.equal(frame.member.appearance,s.floors[0].collaboration![0].appearance)
 assert.equal(frame.member.agent.runtime,'claude')
})
it('requires current displayed remote member, real same-session ancestry and visible Lead',()=>{
 const reject=(change:(s:OfficeScene)=>void)=>{const s=scene();change(s);assert.equal(createOfficeHologram(event(),s,0,10000),null)}
 reject(s=>{s.floors[0].collaboration![0].agent.parentId='other'})
 reject(s=>{s.floors[0].collaboration![0].task!.parentId='other'})
 reject(s=>{s.floors[0].collaboration![0].sessionId='other'})
 reject(s=>{s.floors[0].collaboration![0].remote=false})
 reject(s=>{s.floors[0].collaboration![0].agent.status='cancelled'})
 reject(s=>{s.actors[0].hidden=true})
 reject(s=>{s.actors[0].pose={inLift:true}})
 reject(s=>{s.actors[0].pose={walk:true}})
 reject(s=>{s.floors[0].constructing=true})
 assert.equal(createOfficeHologram({...event(),parentKey:childKey},scene(),0,10000),null)
})
it('expires after 2600ms and removes cues for disappeared, quiet or hidden participants',()=>{
 const s=scene(),state=mergeOfficeHolograms(empty(),[event()],s,100,10000)
 assert.equal(pruneOfficeHolograms(state,s,2699).cues.length,1)
 assert.equal(pruneOfficeHolograms(state,s,2700).cues.length,0)
 for(const change of [(s:OfficeScene)=>{s.actors=[]},(s:OfficeScene)=>{s.floors[0].collaboration=[]},(s:OfficeScene)=>{s.actors[0].hidden=true},(s:OfficeScene)=>{s.quietTeams=[{sessionId:'s'} as never]}]){
  const current=scene();change(current);assert.equal(pruneOfficeHolograms(state,current,200).cues.length,0)
 }
 assert.equal(createOfficeHologram({...event(),at:0},s,0,16000),null)
 assert.equal(createOfficeHologram({...event(),at:10001},s,0,10000),null)
 assert.equal(createOfficeHologram({...event(),sourceAt:1000},s,0,20000),null,'new receipt time cannot make an old source transition fresh')
})
it('deduplicates event IDs even after expiry and bounds cues to one per Lead and two overall',()=>{
 const s=scene();let state=mergeOfficeHolograms(empty(),[event()],s,100,10000)
 state=mergeOfficeHolograms(state,[event()],s,1000,10000);assert.equal(state.cues[0].endsAt,2700)
 state=mergeOfficeHolograms(state,[event()],s,3000,10000);assert.equal(state.cues.length,0)
 state=mergeOfficeHolograms(state,[event('sent')],s,3000,10000)
 state=mergeOfficeHolograms(state,[event('received')],s,3100,10000);assert.equal(state.cues.length,1)
 for(let i=1;i<=3;i++){
  const parent={...s.actors[0],key:officeKey('s',`lead${i}`),agent:{...s.actors[0].agent,id:`lead${i}`},x:100+i*60}
  const member={...s.floors[0].collaboration![0],key:officeKey('s',`child${i}`),agent:{...s.floors[0].collaboration![0].agent,id:`child${i}`,parentId:`lead${i}`},task:{...s.floors[0].collaboration![0].task!,childId:`child${i}`,parentId:`lead${i}`}}
  s.actors.push(parent);s.floors[0].collaboration!.push(member)
  state=mergeOfficeHolograms(state,[{...event(),id:`e${i}`,actorKey:member.key,parentKey:parent.key}],s,3200+i,10000)
 }
 assert.equal(state.cues.length,2);assert.equal(new Set(state.cues.map(c=>c.parentKey)).size,2)
})
it('clamps the small projection beside the Lead and draws original avatar/runtime with static effects-off pose',()=>{
 const s=scene();s.actors[0].x=448
 const state=mergeOfficeHolograms(empty(),[event()],s,0,10000)
 const frames=officeHologramFrames(state,s,2400,false),frame=frames[0]
 const enlarged=officeHologramFrames(state,s,2400,false,()=>1.18)[0]
 assert.equal(enlarged.scale,.55*1.18)
 assert.ok(frame.x<450-frame.scale*20);assert.ok(frame.scale<1)
 assert.equal(frame.opacity,officeHologramFrames(state,s,100,false)[0].opacity)
 assert.ok(officeHologramFrames(state,s,2500,true)[0].opacity<officeHologramFrames(state,s,1000,true)[0].opacity)
 const calls:unknown[][]=[]
 const c=new Proxy({globalAlpha:1},{get:(t,k)=>Reflect.get(t,k)??(()=>{})}) as unknown as CanvasRenderingContext2D
 drawOfficeHolograms(c,frames,(...args)=>{calls.push(args)})
 assert.equal(calls.length,1);assert.equal(calls[0][1],frame.member.appearance)
 assert.equal(calls[0][4],0);assert.deepEqual(calls[0][5],{runtime:'claude'})
 assert.equal(officeHologramFrames(state,s,2600,false).length,0)
})
