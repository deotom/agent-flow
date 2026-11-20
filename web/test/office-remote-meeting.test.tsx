import {it} from 'node:test'
import assert from 'node:assert/strict'
import {Children,isValidElement,type ReactElement,type ReactNode} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {OfficeRemoteMeeting,OfficeRemoteRoster,currentOfficeCollaborators} from '../components/agent-visualizer/office/office-remote-meeting'
import {OfficeView} from '../components/agent-visualizer/office/office-view'
import {officeAppearance,officeKey} from '../lib/office-model'
import type {OfficeCollaborationMember,OfficeFloor} from '../lib/office-types'

const member=(id:string,remote=true):OfficeCollaborationMember=>({key:`session:${id}`,preferenceKey:`preference:${id}`,sessionId:'session',remote,appearance:officeAppearance(0),task:null,
  agent:{id,parentId:'lead',role:'worker',name:`Worker ${id}`,runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:2,completedAt:null}})
const floor=(members:OfficeCollaborationMember[]):OfficeFloor=>({id:'room',sessionId:'session',kind:'team',title:'Team',subtitle:'',color:'#abc',y:200,height:253,room:'room-a',actorKeys:[],collaboration:members})
const props={buildingHeight:800,overrides:{},live:true,selectedKey:null,onSelect:()=>{},onChange:()=>{}}
function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{
  return Children.toArray(node).flatMap(child=>isValidElement<Record<string,unknown>>(child)?[child,...elements(child.props.children as ReactNode)]:[])
}
it('caps portraits at three and keeps extra real participants behind the roster control',()=>{
  const html=renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor(Array.from({length:5},(_,index)=>member(String(index))))}/> )
  assert.equal((html.match(/<canvas/g)??[]).length,3)
  assert.ok(html.includes('+2 more')&&html.includes('ออนไลน์ · 5'))
  assert.ok(!html.includes('of-remote-roster'))
  assert.ok(!html.includes('Connected')&&!html.includes('animation'))
})
it('uses a quiet portrait and AI badge rail instead of visible participant nameplates',()=>{
 const m=member('badge');m.agent.runtime='claude'
 const html=renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor([m])}/> )
 assert.ok(html.includes('data-runtime="claude"'))
 assert.ok(html.includes('Worker badge, Running'))
 assert.ok(!html.includes('<span>Worker badge</span>'))
 assert.ok(html.includes('of-remote-rail'))
})
it('reports source status as last known while reads are stale without a live pulse',()=>{
  const m=member('waiting');m.agent.status='waiting_input'
  const html=renderToStaticMarkup(<OfficeRemoteMeeting {...props} live={false} floor={floor([m])}/> )
  assert.ok(html.includes('Last known: Needs your answer'))
  assert.ok(!/Connected|connecting|pulse|blink/.test(html))
})
it('offers display settings for unknown roles and keeps completed history off the wall',()=>{
  const m=member('current',false),done=member('old');done.agent.status='done'
  const html=renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor([m,done])}/> )
  assert.ok(html.includes('จัดทีมออนไลน์'));assert.equal((html.match(/<canvas/g)??[]).length,0)
  assert.deepEqual(currentOfficeCollaborators([m,done]).map(row=>row.key),[m.key])
  assert.equal(renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor([done])}/>),'')
})
it('selects the actual source agent and changes only that display preference',()=>{
  const m=member('real-id'),selected:unknown[]=[],changed:unknown[]=[]
  const tree=OfficeRemoteRoster({members:[m],overrides:{},live:true,onSelect:(...args)=>selected.push(args),onChange:(...args)=>changed.push(args)})
  const nodes=elements(tree)
  const button=nodes.find(node=>node.type==='button')!
  ;(button.props.onClick as ()=>void)()
  assert.deepEqual(selected,[['session','real-id']])
  const select=nodes.find(node=>node.type==='select')!
  ;(select.props.onChange as (event:unknown)=>void)({target:{value:'remote'}})
  assert.deepEqual(changed,[['preference:real-id','remote']])
  const html=renderToStaticMarkup(tree)
  assert.ok(html.includes('แสดงในห้อง')&&html.includes('แสดงบนจอ')&&html.includes('อัตโนมัติ')&&html.includes('เปลี่ยนเฉพาะมุมมองของคุณ'))
})
it('locks display placement while a real trip owns the participant',()=>{
  const m=member('travelling')
  const html=renderToStaticMarkup(<OfficeRemoteRoster members={[m]} overrides={{}} live={true} travellingKeys={new Set([m.key])} onSelect={()=>{}} onChange={()=>{}}/>)
  assert.ok(html.includes('disabled=""')&&html.includes('รอถึงจุดหมายก่อนเปลี่ยนการแสดง'))
})
it('keeps a queued remote result visible until delivery without reviving old workers',()=>{
  const queued=member('queued');queued.agent.status='done'
  queued.task={id:'task',childId:queued.agent.id,parentId:'lead',name:'Review',task:null,model:null,result:'Done',status:'done',delivery:'pending',startedAt:1,completedAt:2,updatedAt:2}
  const old=Array.from({length:141},(_,index)=>{const row=member(`old-${index}`);row.agent.status='done';return row})
  assert.deepEqual(currentOfficeCollaborators([...old,queued]).map(row=>row.key),[queued.key])
  const html=renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor([...old,queued])}/> )
  assert.ok(html.includes('Result queued'));assert.equal((html.match(/<canvas/g)??[]).length,1)
  for(const delivery of ['none','unknown'] as const){queued.task.delivery=delivery;assert.equal(currentOfficeCollaborators([queued]).length,1)}
  queued.task.delivery='pending';queued.task.status='working';queued.agent.status='running'
  assert.ok(!renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor([queued])}/>).includes('Result queued'))
  queued.task.status='done'
  assert.ok(!renderToStaticMarkup(<OfficeRemoteMeeting {...props} floor={floor([queued])}/>).includes('Result queued'),'a resumed child does not queue its old wrapper result')
  queued.task.status='done';queued.agent.status='done'
  queued.task.delivery='received'
  assert.equal(currentOfficeCollaborators([queued]).length,0)
})
it('integrates a remote source worker with the existing inspector without a duplicate physical body',()=>{
  const m=member('research');m.agent.taskRole='research'
  const lead={...m.agent,id:'lead',name:'Lead',role:'lead' as const,parentId:null,taskRole:undefined}
  const html=renderToStaticMarkup(<OfficeView snapshots={[{sessionId:'session',title:'Team',active:true,updatedAt:2,agents:[lead,m.agent],tasks:[]}]} scope="active" selectedKey={officeKey('session',m.agent.id)} onSelect={()=>{}} onOpenTeam={()=>{}} live={false} visible={true} animationMode="off" now={2}/>)
  assert.ok(html.includes('Online meeting display, Team')&&html.includes('แสดงบนจอประชุมออนไลน์'))
  assert.ok(html.includes('Last known: Running'))
  assert.equal((html.match(/class="of-agent"/g)??[]).length,1)
  assert.ok(html.includes('Locate selected agent'))
})
