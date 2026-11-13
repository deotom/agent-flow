import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TeamSnapshot } from '../lib/team-types'
const require=createRequire(import.meta.url)
// Styles belong to browser rendering; test the actual workspace markup.
const previousCss=require.extensions['.css']
require.extensions['.css']=()=>{}
const {TeamWorkspace}=require('../components/agent-visualizer/team/team-workspace') as typeof import('../components/agent-visualizer/team/team-workspace')
if(previousCss)require.extensions['.css']=previousCss;else delete require.extensions['.css']
const snapshot:TeamSnapshot={sessionId:'s',title:'Example team',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name:'Lead',runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
const props={sessions:[{id:'s',label:'Example team',status:'active' as const,startTime:1,lastActivityTime:1}],selectedSessionId:'s',onSelectSession:()=>{},teamSnapshots:{s:snapshot},health:null,transport:'open' as const,animationMode:'off' as const,scope:'active' as const,onScope:()=>{},onPane:()=>{},renderGraph:()=> <div data-testid="team-graph">Actual graph slot</div>}
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
