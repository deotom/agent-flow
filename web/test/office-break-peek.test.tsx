import { it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficeBreakPeek } from '../components/agent-visualizer/office/office-break-peek'
import { officeAppearance } from '../lib/office-model'
import type { OfficeActor, OfficeFloor } from '../lib/office-types'

const floor:OfficeFloor={id:'rest',annexOf:'main',kind:'break',sessionId:'s',title:'Private break',subtitle:'3 assigned',color:'#abc',y:250,height:250,room:'room-break-reading',actorKeys:['worker','extra-1','extra-2'],overflow:2}
const actor:OfficeActor={key:'worker',sessionId:'s',floorId:'rest',zone:'lounge',x:100,y:420,appearance:officeAppearance(1),runtimeName:'Codex',activity:'Done',parentKey:null,task:null,agent:{id:'worker',parentId:'lead',role:'worker',name:'Maya',runtime:'codex',model:'Sol',status:'done',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:2}}
it('opens a same-floor private room with back navigation, actors and object controls',()=>{
 const html=renderToStaticMarkup(<OfficeBreakPeek floor={floor} width={450} buildingHeight={1000} actors={[actor]} canvasRef={{current:null}} onClose={()=>{}} onSelect={()=>{}} onOpenTeam={()=>{}} onObject={()=>{}} now={new Date(2026,10,13,12).getTime()} selectedKey={null}/>)
 assert.ok(html.includes('top:25%')&&html.includes('height:25%'))
 assert.ok(html.includes('Back to office')&&html.includes('1 here / 3 assigned'))
 assert.ok(html.includes('Maya, Codex · Sol, Done, resting in the break room'))
 assert.ok(html.includes('Reading corner')&&html.includes('Cool season'))
 assert.ok(html.includes('Team Board')&&html.includes('Open team in Board'))
 assert.equal((html.match(/<canvas/g)??[]).length,1)
})
it('counts physical residents while a source-room actor is away for lunch',()=>{
 const html=renderToStaticMarkup(<OfficeBreakPeek floor={{...floor,actorKeys:['worker','away'],overflow:0}} width={450} buildingHeight={1000} actors={[actor,{...actor,key:'away',floorId:'daily-canteen'}]} canvasRef={{current:null}} onClose={()=>{}} onSelect={()=>{}} onOpenTeam={()=>{}} onObject={()=>{}} now={1} selectedKey={null}/>)
 assert.ok(html.includes('1 here / 2 assigned'))
 assert.ok(html.includes('Team Board'))
})
it('omits seasonal phantom objects and includes hover cards for Desktop break rooms',()=>{
 const html=renderToStaticMarkup(<OfficeBreakPeek floor={{...floor,desktopArt:true}} width={450} buildingHeight={1000} actors={[actor]} canvasRef={{current:null}} onClose={()=>{}} onSelect={()=>{}} onOpenTeam={()=>{}} onObject={()=>{}} now={new Date(2026,10,13,12).getTime()} selectedKey={null}/>)
 assert.ok(!html.includes('Cool season')&&!html.includes('Songkran'))
 assert.ok(html.includes('Reading corner')&&html.includes('Coffee break'))
 assert.ok(html.includes('class="of-card"')&&html.includes('Agent · Codex · Sol'))
})
