import { it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficeView } from '../components/agent-visualizer/office/office-view'
import { officeKey } from '../lib/office-model'
import type { TeamSnapshot } from '../lib/team-types'
const team = (sessionId:string,name:string):TeamSnapshot => ({sessionId,title:name,active:true,updatedAt:1000,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name,runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1000,updatedAt:1000,completedAt:null}]})
const props={scope:'active' as const,selectedKey:null,onSelect:()=>{},onOpenTeam:()=>{},live:true,visible:true,animationMode:'off' as const,now:1000}
const onDesktop=<T,>(render:()=>T):T=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document')
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{agentFlowHost:'desktop'}}}})
 try{return render()}
 finally{
  if(previous)Object.defineProperty(globalThis,'document',previous)
  else Reflect.deleteProperty(globalThis,'document')
 }
}
it('shows the Desktop break-room headcount above the door and keeps the break room entrance',()=>{
 const snap=team('count','Workshop')
 snap.agents.push({...snap.agents[0],id:'review',parentId:'lead',role:'worker',taskRole:'review',name:'Reviewer',status:'running'},
  {...snap.agents[0],id:'rest',parentId:'lead',role:'worker',name:'Resting worker',status:'done'})
 const html=onDesktop(()=>renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[snap]}/>))
 assert.ok(html.includes('1 คนในห้องพัก · Workshop'),'only the resting worker is in the break room')
 assert.ok(!html.includes('คนในห้องทำงาน'))
 assert.ok(html.includes('Open break room, Workshop, 1 assigned'))
 assert.ok(!html.includes('จัดทีมออนไลน์'))
 const busy=team('busy','Workshop')
 busy.agents.push({...busy.agents[0],id:'review',parentId:'lead',role:'worker',taskRole:'review',name:'Reviewer',status:'running'})
 assert.ok(onDesktop(()=>renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[busy]}/>)).includes('0 คนในห้องพัก · Workshop'))
})
it('keeps the painted Desktop break-room door free of a teacup badge',()=>{
 const snap=team('door','Workshop')
 snap.agents.push({...snap.agents[0],id:'rest',parentId:'lead',role:'worker',name:'Resting worker',status:'done'})
 const html=onDesktop(()=>renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[snap]}/>))
 const door=html.match(/<button[^>]*class="of-annex-door"[^>]*>(.*?)<\/button>/)
 assert.ok(door,'the door stays a button')
 assert.ok(door[0].includes('Open break room, Workshop, 1 assigned'))
 assert.equal(door[1],'','no badge inside the Desktop door')
 assert.ok(!html.includes('☕'))
 const web=renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[snap]}/>)
 assert.ok(web.includes('☕ 1'),'the non-desktop door keeps its count badge')
})
it('renders Desktop workbench labels, working counts and board active state without dead work-station overlay',()=>{
 const snap=team('plan','Workshop')
 const html=onDesktop(()=>renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[snap]}/>))
 assert.ok(html.includes('class="of-board" data-compact="true" data-painted="false" data-active="true"'))
 for(const label of ['Research','Build','Review','Terminal']){
  assert.ok(html.includes(`aria-label="${label}, Workshop, 0 working"`),label)
  assert.ok(html.includes(`<span>${label}</span>`),label)
 }
 assert.ok(!html.includes('of-work-station'))
})
it('paints desk lights on a backdrop canvas under wall signs and boards',()=>{
 const html=onDesktop(()=>renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[team('lights','Workshop')]}/>))
 const lights=html.indexOf('class="of-desk-lights"'),board=html.indexOf('class="of-board"'),foreground=html.indexOf('aria-label="Office with')
 assert.ok(lights>=0&&board>lights&&foreground>board)
 const sign=html.indexOf('class="of-station-sign"')
 assert.ok(sign<0||sign>lights)
 assert.match(html,/<canvas class="of-desk-lights" aria-hidden="true" style="z-index:0;pointer-events:none;height:100%"/)
})
it('keeps private resting rooms behind a main-room door without standalone floors, with a waiting beacon',()=>{
 const snap=team('annex','Main');snap.agents[0].status='waiting_input'
 snap.agents.push({...snap.agents[0],id:'rest',parentId:'lead',role:'worker',name:'Resting worker',status:'done'})
 const html=renderToStaticMarkup(<OfficeView {...props} scope="session" snapshots={[snap]}/>)
 assert.ok(html.includes('Open break room, Main, 1 assigned'))
 assert.ok(html.includes('of-alert-beacon')&&html.includes('Waiting for your answer'))
 assert.ok(!html.includes('class="of-art of-art-room-break'))
 assert.ok(!html.includes('aria-label="Resting worker,'))
})
it('connects the calendar to the garden theme, weather summary and holiday activity',()=>{
 const html=renderToStaticMarkup(<OfficeView {...props} now={new Date(2026,3,13,12).getTime()} snapshots={[team('s','Lead')]}/>)
 assert.ok(html.includes('data-season="hot"')&&html.includes('data-holiday="songkran"'))
 assert.ok(html.includes('Songkran · water play')&&html.includes('simulated weather'))
 assert.ok(html.includes('of-holiday-hit')&&html.includes('aria-label="Splash Songkran water, '))
 const cool=renderToStaticMarkup(<OfficeView {...props} now={new Date(2026,10,13,12).getTime()} snapshots={[team('s','Lead')]}/>)
 assert.ok(cool.includes('data-season="cool"')&&cool.includes('Cool season'))
 assert.ok(!cool.includes('of-holiday-hit'))
})
it('keeps reconnect status in the existing Office toolbar while retaining the last known scene',()=>{
 const html=renderToStaticMarkup(<OfficeView {...props} live={false} snapshots={[team('s','Lead')]} connection={{label:'Reconnecting',tone:'warn',detail:'Last read 12 seconds ago'}}/>)
 assert.ok(html.includes('class="of-link"')&&html.includes('Reconnecting'))
 assert.ok(html.includes('of-building')&&html.includes('Lead'))
})
it('gives each small office its own compact progress board',()=>{
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[team('small-a','Small A'),team('small-b','Small B')]}/>)
  assert.equal((html.match(/role="note"/g)??[]).length,2)
  assert.equal((html.match(/data-compact="true"/g)??[]).length,2)
  assert.ok(html.includes('Team board: Small A')&&html.includes('Team board: Small B'))
})
it('keeps cross-session selection and accessible display names without developer notes',()=>{
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[team('a','Maya'),team('b','Theo')]} selectedKey={officeKey('a','lead')} />)
  assert.ok(html.includes('Maya, Lead, Codex, team Maya')&&html.includes('Theo, Lead, Codex, team Theo'))
  assert.equal((html.match(/aria-pressed="true"/g)??[]).length,1)
  assert.ok(!/Decorative|Work paths|Greet the|\/root\//.test(html))
  assert.ok(html.includes('of-art-surface')&&html.includes('of-art-bottom'))
})
it('offers full selected-agent reading and attention navigation without a full-screen overlay',()=>{
 const source=team('read','ชื่อหัวหน้าทีมที่ยาวมากและต้องแสดงได้ครบทุกตัวอักษร')
 source.agents[0].status='waiting_input';source.agents[0].task='รายละเอียดงานทั้งหมดที่ไม่ควรถูกตัดกลางคำ'
 const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[source]} selectedKey={officeKey('read','lead')}/>)
 assert.ok(html.includes('class="of-inspector"'))
 assert.ok(html.includes(source.agents[0].task!))
 assert.ok(html.includes('aria-label="Go to next agent who needs you"'))
 assert.ok(html.includes('aria-label="Locate selected agent"'))
 assert.ok(html.includes('aria-label="Show Office tips"'))
})
it('retains request kind and deliberately expandable results with an empty-name task fallback',()=>{
 const source=team('read','Reader');source.agents[0].status='waiting_input';source.agents[0].requestKind='confirmation';source.agents[0].task='รายละเอียดสำรองเมื่อชื่องานว่าง'
 source.tasks=[{id:'task',childId:'lead',parentId:'root',name:'',model:null,task:source.agents[0].task,result:'ผลลัพธ์ที่ผู้ใช้ต้องกดขยายอ่าน',status:'done',delivery:'received',startedAt:1,completedAt:2,updatedAt:2}]
 const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[source]} selectedKey={officeKey('read','lead')}/>)
 assert.ok(html.includes('ชนิดคำขอ')&&html.includes('confirmation'))
 assert.ok(html.includes('ผลลัพธ์ล่าสุด')&&html.includes(source.tasks[0].result!))
 assert.equal(html.split(source.agents[0].task!).length-1,1,'assignment fallback is shown once')
})
it('provides an expandable quiet strip and a calm empty view',()=>{
  const quiet=team('a','At home');quiet.agents[0].status='idle'
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[quiet]}/>)
  assert.ok(html.includes('1 team at home')&&html.includes('aria-expanded="false"'))
  assert.ok(!html.includes('aria-label="At home, Codex'))
  assert.ok(renderToStaticMarkup(<OfficeView {...props} snapshots={[]}/>).includes('Your teams will appear here.'))
})
it('labels blackboard items with their state and never shows delegated prompts',()=>{
  const big=team('big','Lead')
  const worker=(id:string,status:'running'|'failed'|'waiting_input')=>({...big.agents[0],id,parentId:'lead',role:'worker' as const,name:id,status})
  big.agents.push(worker('Ann','waiting_input'),worker('Bo','failed'),worker('Cy','running'),worker('Di','running'),worker('Ed','running'))
  const task=(id:string,childId:string,status:'working'|'failed'|'done')=>({id,childId,parentId:'lead',name:childId,model:null,task:'SECRET_PROMPT do the thing',result:'RESULT_TEXT',status,delivery:'none' as const,startedAt:1,completedAt:status==='done'?2:null,updatedAt:1})
  big.tasks=[task('t1','Bo','failed'),task('t2','Cy','working'),task('t3','Di','done')]
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[big]}/>)
  assert.ok(html.includes('class="of-board"'))
  assert.ok(html.includes('1 of 3 tasks done. Needs you: Ann needs you. Failed: Bo. Working: Cy.'))
  assert.ok(!html.includes('SECRET_PROMPT')&&!html.includes('RESULT_TEXT'))
})

it('labels the empty garden and private lounge entrance without filling the main view with resting people',()=>{
  const active=team('a','Busy')
  active.agents.push(...Array.from({length:12},(_,i)=>({...active.agents[0],id:`done${i}`,name:`Done${i}`,parentId:'lead',role:'worker' as const,status:'done' as const})))
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[active]}/>)
  assert.ok(html.includes('Party garden · No celebrations'))
  assert.ok(html.includes('Open break room, Busy, 12 assigned'))
  assert.ok(!html.includes('aria-label="Done0,'))
  assert.ok(!html.includes('Show history'))
  const home=team('b','Home');home.agents[0].status='idle'
  assert.ok(renderToStaticMarkup(<OfficeView {...props} snapshots={[home]}/>).includes('Show history'))
})

it('renders a compact proportional lift call plate without an oversized arrow glyph on Desktop', () => {
  const snap = team('lift', 'Workshop')
  const html = onDesktop(() => renderToStaticMarkup(<OfficeView {...props} snapshots={[snap]} />))
  const hatch = html.match(/<button[^>]*class="of-hatch-hit"[^>]*>(.*?)<\/button>/)
  assert.ok(hatch, 'garden lift button renders')
  assert.equal(hatch[1], '<span class="of-lift-call-plate" aria-hidden="true"></span>')
  assert.ok(!hatch[1].includes('↕'))
})

it('includes a quick ambient sound toggle in the Desktop toolbar without duplicating it in Web', () => {
  const snap = team('sound', 'Workshop')
  const desktopHtml = onDesktop(() => renderToStaticMarkup(<OfficeView {...props} snapshots={[snap]} />))
  assert.ok(desktopHtml.includes('class="of-sound-quick"'))
  assert.ok(desktopHtml.includes('aria-label="Play Office ambient sound"'))
  assert.ok(desktopHtml.includes('aria-pressed="false"'))
  assert.ok(desktopHtml.includes('aria-label="Office ambient sound"'))
  const webHtml = renderToStaticMarkup(<OfficeView {...props} snapshots={[snap]} />)
  assert.ok(!webHtml.includes('class="of-sound-quick"'))
  assert.ok(webHtml.includes('aria-label="Office ambient sound"'))
})
