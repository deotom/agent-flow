import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TeamSnapshot } from '../lib/team-types'
import { OfficeAvatarPortrait } from '../components/agent-visualizer/office/office-avatar-portrait'
import { officeAppearance } from '../lib/office-model'
const require=createRequire(import.meta.url)
// Styles belong to browser rendering; test the actual workspace markup.
const previousCss=require.extensions['.css']
require.extensions['.css']=()=>{}
const {TeamWorkspace}=require('../components/agent-visualizer/team/team-workspace') as typeof import('../components/agent-visualizer/team/team-workspace')
if(previousCss)require.extensions['.css']=previousCss;else delete require.extensions['.css']
const snapshot:TeamSnapshot={sessionId:'s',title:'Example team',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name:'Lead',runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
const props={sessions:[{id:'s',label:'Example team',status:'active' as const,startTime:1,lastActivityTime:1}],selectedSessionId:'s',onSelectSession:()=>{},teamSnapshots:{s:snapshot},health:null,transport:'open' as const,animationMode:'off' as const,scope:'active' as const,onScope:()=>{},onPane:()=>{},renderGraph:()=> <div data-testid="team-graph">Actual graph slot</div>}
it('provides a decorative portrait that fits a Board row and keeps browser rows unchanged',()=>{
 const portrait=renderToStaticMarkup(<OfficeAvatarPortrait appearance={officeAppearance(1)} size={34}/>)
 assert.match(portrait,/<canvas[^>]*width="48"[^>]*height="56"[^>]*aria-hidden="true"/)
 assert.match(portrait,/width:34px/)
 assert.doesNotMatch(renderToStaticMarkup(<TeamWorkspace {...props} widget={false} pane="board"/>),/class="jv-agent-portrait"/)
})
it('offers Graph alongside Board and Office in a compact desktop widget',()=>{
 const html=renderToStaticMarkup(<TeamWorkspace {...props} widget pane="office"/>)
 assert.match(html,/>Graph<\/button>/)
 assert.match(html,/>Board<\/button>/)
 assert.match(html,/>Office<\/button>/)
})
it('renders the selected graph in both widget and full workspace',()=>{
 for(const widget of [true,false]){
  const html=renderToStaticMarkup(<TeamWorkspace {...props} widget={widget} pane="graph"/>)
  assert.match(html,/data-testid="team-graph"/)
  assert.match(html,/class="jv-graph"/)
  assert.match(html,/aria-pressed="true"[^>]*>Graph<\/button>/)
  assert.doesNotMatch(html,/class="jv-board"/)
 }
})

it('renders readable Desktop hierarchy cards with explicit agent relationships instead of the fitted canvas',()=>{
 const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document')
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{agentFlowHost:'desktop'}}}})
 try{
  const branch={...snapshot,agents:[...snapshot.agents,{...snapshot.agents[0],id:'worker',parentId:'lead',name:'Mira',role:'worker' as const,status:'running' as const}]}
  const html=renderToStaticMarkup(<TeamWorkspace {...props} teamSnapshots={{s:branch}} widget pane="graph" />)
  assert.doesNotMatch(html,/data-testid="team-graph"/)
  assert.match(html,/aria-label="Team relationships"/)
  assert.match(html,/aria-label="Mira, Last known: Working, reports to Lead"/)
  assert.match(html,/>Working<\/span>/)
 }finally{
  if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument)
  else Reflect.deleteProperty(globalThis,'document')
 }
})

it('renders a single Desktop navigation row and a compact actionable Board row', () => {
 const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
 Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: { agentFlowHost: 'desktop' } } } })
 try {
  const waiting: TeamSnapshot = {
   ...snapshot,
   agents: [{ ...snapshot.agents[0], status: 'waiting_approval', task: 'Fix build' }],
  }
  const html = renderToStaticMarkup(<TeamWorkspace {...props} teamSnapshots={{ s: waiting }} widget pane="board" />)
  assert.equal((html.match(/aria-label="View"/g) ?? []).length, 1)
  assert.match(html, /<nav class="af-desktop-views"/)
  assert.match(html, /aria-label="Workspace tools"/)
  assert.match(html, /class="jv-row af-desktop-row"[^>]*data-status="waiting_approval"/)
  assert.match(html, /<strong>Lead<\/strong><span>Fix build<\/span>/)
  assert.match(html, /class="af-desktop-status"[^>]*>Needs you<\/span>/)
 } finally {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
  else Reflect.deleteProperty(globalThis, 'document')
 }
})
