import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyOfficeDailyLedger, officeDailyWindow, planOfficeDailyEvents, markOfficeDailyAttendance, readOfficeDailyLedger, advanceOfficeDailyLedger } from '../lib/office-daily-events'
import { OFFICE_CANTEEN_ID, projectOfficeDailyScene } from '../lib/office-daily-scene'
import { officeAppearance } from '../lib/office-model'
import type { OfficeActor, OfficeScene } from '../lib/office-types'
const date=(h:number,m=0,d=14)=>new Date(2026,10,d,h,m)
function scene(count=10):OfficeScene {
 const actors=Array.from({length:count},(_,i)=>({key:`a${i}`,sessionId:'s',agent:{id:`a${i}`,status:'idle'},task:null,parentKey:null,appearance:officeAppearance(i),floorId:'private',zone:'lounge',activity:'Resting',runtimeName:'Codex',x:50+i*10,y:350} as OfficeActor))
 return {width:450,height:650,floors:[{id:'lounge',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:0,height:250,actorKeys:[]},{id:'team',kind:'team',sessionId:'s',title:'Work',subtitle:'',color:'#fff',y:225,height:250,actorKeys:[]},{id:'private',kind:'break',annexOf:'team',sessionId:'s',title:'Rest',subtitle:'',color:'#fff',y:225,height:250,actorKeys:actors.map(a=>a.key)},{id:'quiet',kind:'quiet',sessionId:null,title:'Home',subtitle:'',color:'#fff',y:450,height:34,actorKeys:[]}],actors,quietTeams:[],totalAgents:count,finishedCount:count}
}
test('viewer local windows include starts and exclude ends, with delivery and cleanup separate',()=>{
 for(const [h,m,kind] of [[8,29,null],[8,30,'coffee'],[9,29,'coffee'],[9,30,null],[11,59,null],[12,0,'lunch'],[12,44,'lunch'],[12,45,null],[15,0,'tea'],[15,29,'tea'],[15,30,null]] as const)assert.equal(officeDailyWindow(date(h,m)).kind,kind)
 assert.equal(officeDailyWindow(date(11,50)).delivery,true);assert.equal(officeDailyWindow(date(12,10)).delivery,false)
 assert.equal(officeDailyWindow(date(12,45)).cleanup,true);assert.equal(officeDailyWindow(date(13)).cleanup,false)
})
test('only visible resting current private-annex actors are invited, deterministically',()=>{
 const s=scene();s.actors[0].agent.status='failed';s.actors[1].agent.status='running';s.actors[2].agent.status='waiting_input';s.actors[3].hidden=true;s.actors[4].floorId='lounge';s.actors[5].zone='desk';s.actors[6].agent.status='done';s.actors[7].agent.status='cancelled'
 const input={date:date(12),scene:s,ledger:emptyOfficeDailyLedger(),busyKeys:new Set(['a8']),weather:'clear' as const}
 assert.deepEqual(planOfficeDailyEvents(input).invitations.map(a=>a.actorKey),['a6','a7','a9'])
 assert.deepEqual(planOfficeDailyEvents({...input,scene:{...s,actors:[...s.actors].reverse()}}).invitations,planOfficeDailyEvents(input).invitations)
})
test('garden seats include parties and reservations; excess goes indoors and rain never moves guests outside',()=>{
 const s=scene();s.actors.push({...s.actors[0],key:'party',floorId:'lounge',party:true})
 const p=planOfficeDailyEvents({date:date(12),scene:s,ledger:emptyOfficeDailyLedger(),gardenReservedKeys:new Set(['r1','r2']),weather:'clear'})
 assert.equal(p.invitations.filter(a=>a.destination==='garden').length,1);assert.equal(p.invitations.filter(a=>a.destination==='canteen').length,3)
 const guests=[{actorKey:'a0',destination:'garden' as const,seat:3},{actorKey:'a1',destination:'canteen' as const,seat:0}]
 const rain=planOfficeDailyEvents({date:date(12),scene:s,ledger:emptyOfficeDailyLedger(),guests,weather:'rain'})
 assert.deepEqual(rain.moveIndoors,['a0']);assert.ok(rain.invitations.every(a=>a.destination==='canteen'));assert.equal(rain.invitations.length,2)
 assert.deepEqual(planOfficeDailyEvents({date:date(12),scene:s,ledger:emptyOfficeDailyLedger(),guests,weather:'clear'}).moveIndoors,[])
})
test('attendance persists once, caps cumulative lunch at eight, and suppresses expired or backward windows',()=>{
 const s=scene(12);let ledger=emptyOfficeDailyLedger()
 for(let i=0;i<8;i++)ledger=markOfficeDailyAttendance(ledger,date(12),'lunch',`a${i}`)
 ledger=markOfficeDailyAttendance(ledger,date(12),'lunch','a0')
 assert.equal(ledger.days[0].lunch.length,8)
 ledger=readOfficeDailyLedger(JSON.parse(JSON.stringify(ledger)))
 assert.equal(planOfficeDailyEvents({date:date(12,20),scene:s,ledger,weather:'clear'}).invitations.length,0)
 ledger=advanceOfficeDailyLedger(ledger,date(13));assert.equal(planOfficeDailyEvents({date:date(12),scene:s,ledger,weather:'clear'}).invitations.length,0)
 assert.equal(planOfficeDailyEvents({date:date(13),scene:s,ledger,weather:'clear'}).invitations.length,0)
 assert.equal(planOfficeDailyEvents({date:date(12,0,15),scene:s,ledger,weather:'clear'}).invitations.length,4)
 for(let d=15;d<29;d++)ledger=markOfficeDailyAttendance(ledger,date(12,0,d),'lunch','a0')
 assert.equal(ledger.days.length,7);assert.deepEqual(readOfficeDailyLedger({version:99}),emptyOfficeDailyLedger())
})
test('coffee and tea use a small home cohort and never open canteen',()=>{
 for(const h of [8,15]){const p=planOfficeDailyEvents({date:date(h,h===8?30:0),scene:scene(),ledger:emptyOfficeDailyLedger(),weather:'storm'});assert.equal(p.invitations.length,2);assert.ok(p.invitations.every(a=>a.destination==='home'))}
})
test('canteen appends before quiet, keeps physical rooms stable and overlays cloned guests without mutating source',()=>{
 const s=scene(),before=JSON.stringify(s),guest={...s.actors[0],floorId:OFFICE_CANTEEN_ID,x:200,y:600}
 const projected=projectOfficeDailyScene(s,{canteenOpen:true,guests:[guest]})
 assert.deepEqual(projected.floors.map(f=>f.id),['lounge','team','private',OFFICE_CANTEEN_ID,'quiet'])
 assert.equal(projected.floors[1].y,s.floors[1].y);assert.equal(projected.floors[2].y,s.floors[2].y)
 const canteen=projected.floors[3];assert.equal(canteen.y,450);assert.equal(canteen.kind,'break');assert.equal(canteen.room,'room-canteen')
 assert.ok(projected.height>s.height);assert.ok(projected.floors[4].y>s.floors[3].y)
 assert.ok(!projected.floors[2].actorKeys.includes('a0'));assert.deepEqual(canteen.actorKeys,['a0']);assert.notEqual(projected.actors[0],guest)
 assert.equal(JSON.stringify(s),before)
 assert.deepEqual(projectOfficeDailyScene(s,{canteenOpen:false}),s)
 assert.ok(projectOfficeDailyScene(s,{canteenOpen:false,guests:[guest]}).floors.some(f=>f.id===OFFICE_CANTEEN_ID))
})
test('ledger admission is immutable and a single attendee cannot be re-invited before cumulative cap',()=>{
 const original=emptyOfficeDailyLedger(),before=JSON.stringify(original)
 const once=markOfficeDailyAttendance(original,date(12),'lunch','a0')
 assert.equal(JSON.stringify(original),before)
 const p=planOfficeDailyEvents({date:date(12,1),scene:scene(),ledger:readOfficeDailyLedger(JSON.parse(JSON.stringify(once))),weather:'clear'})
 assert.ok(!p.invitations.some(a=>a.actorKey==='a0'))
 assert.equal(markOfficeDailyAttendance(once,date(12,45),'lunch','a1').days[0].lunch.length,1)
 const after=advanceOfficeDailyLedger(once,date(13))
 assert.equal(markOfficeDailyAttendance(after,date(12),'lunch','a1').days[0].lunch.length,1)
 const corrupt=readOfficeDailyLedger({version:1,latestAt:1,days:[{day:'2026-11-14',coffee:['a','a',17],lunch:Array.from({length:100},(_,i)=>`a${i}`),tea:null}]})
 assert.deepEqual(corrupt.days[0].coffee,['a']);assert.equal(corrupt.days[0].lunch.length,8);assert.deepEqual(corrupt.days[0].tea,[])
})
test('temporary room also appends with no quiet summary and closes back to exact source geometry',()=>{
 const source=scene();source.floors=source.floors.filter(f=>f.kind!=='quiet');source.height-=34
 const open=projectOfficeDailyScene(source,{canteenOpen:true})
 assert.equal(open.floors.at(-1)?.id,OFFICE_CANTEEN_ID)
 assert.equal(open.floors.at(-1)?.y,450)
 assert.deepEqual(open.floors.slice(0,-1),source.floors)
 const closed=projectOfficeDailyScene(source,{canteenOpen:false})
 assert.equal(closed.height,source.height);assert.deepEqual(closed.floors,source.floors)
})
test('an idle root lead can leave its main-room rest nook while working and nonroot leads stay excluded',()=>{
 const s=scene(4)
 for(const actor of s.actors){actor.floorId='team';actor.zone='lounge';actor.agent.role='lead'}
 s.actors[1].agent.status='thinking';s.actors[2].agent.parentId='parent';s.actors[3].agent.status='waiting_approval'
 const plan=planOfficeDailyEvents({date:date(12),scene:s,ledger:emptyOfficeDailyLedger(),weather:'clear'})
 assert.deepEqual(plan.invitations.map(i=>i.actorKey),['a0'])
})
