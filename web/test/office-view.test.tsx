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
  assert.ok(html.includes('Maya, Codex')&&html.includes('Theo, Codex'))
  assert.equal((html.match(/aria-pressed="true"/g)??[]).length,1)
  assert.ok(!/Decorative|Work paths|Greet the|\/root\//.test(html))
  assert.ok(html.includes('of-art-surface')&&html.includes('of-art-bottom'))
})
it('provides an expandable quiet strip and a calm empty view',()=>{
  const quiet=team('a','At home');quiet.agents[0].status='idle'
  const html=renderToStaticMarkup(<OfficeView {...props} snapshots={[quiet]}/>)
  assert.ok(html.includes('1 quiet teams')&&html.includes('aria-expanded="false"'))
  assert.ok(!html.includes('aria-label="At home, Codex'))
  assert.ok(renderToStaticMarkup(<OfficeView {...props} snapshots={[]}/>).includes('Your teams will appear here.'))
})
