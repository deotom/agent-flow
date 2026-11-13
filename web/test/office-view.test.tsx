import { it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficeView } from '../components/agent-visualizer/office/office-view'
import { officeKey } from '../lib/office-model'
import type { TeamSnapshot } from '../lib/team-types'
const team = (sessionId:string,name:string):TeamSnapshot => ({sessionId,title:name,active:true,updatedAt:1000,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name,runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1000,updatedAt:1000,completedAt:null}]})
const props={scope:'active' as const,selectedKey:null,onSelect:()=>{},onOpenTeam:()=>{},live:true,visible:true,animationMode:'off' as const,now:1000}
it('keeps cross-session selection and accessible display names without developer notes',()=>{
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[team('a','Maya'),team('b','Theo')]} selectedKey={officeKey('a','lead')} />)
  assert.ok(html.includes('Maya, Lead, Codex, team Maya')&&html.includes('Theo, Lead, Codex, team Theo'))
  assert.equal((html.match(/aria-pressed="true"/g)??[]).length,1)
  assert.ok(!/Decorative|Work paths|Greet the|\/root\//.test(html))
  assert.ok(html.includes('of-art-surface')&&html.includes('of-art-bottom'))
})
it('provides an expandable quiet strip and a calm empty view',()=>{
  const quiet=team('a','At home');quiet.agents[0].status='idle'
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[quiet]}/>)
  assert.ok(html.includes('1 team went home')&&html.includes('aria-expanded="false"'))
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
