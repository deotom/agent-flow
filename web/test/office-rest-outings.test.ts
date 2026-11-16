import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyOfficeOutingSchedule,planOfficeRestOutings,markOfficeRestOutingAdmission} from '../lib/office-rest-outings'
import {officeAppearance} from '../lib/office-model'
import {OFFICE_DAILY_SEATS} from '../lib/office-daily-scene'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
const date=(hour=14,minute=20,day=15)=>new Date(2026,10,day,hour,minute)
function scene(count=6):OfficeScene {
 const actors=Array.from({length:count},(_,i)=>({key:`a${i}`,sessionId:'s',agent:{id:`a${i}`,status:'done',role:'worker'},task:null,parentKey:'lead',appearance:officeAppearance(i),floorId:'private',zone:'lounge',activity:'Rest',runtimeName:'Codex',x:100+i*15,y:350} as OfficeActor))
 return {width:450,height:650,floors:[{id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:0,height:250,actorKeys:[]},{id:'team',kind:'team',sessionId:'s',title:'Work',subtitle:'',color:'#fff',y:225,height:250,actorKeys:[]},{id:'private',kind:'break',annexOf:'team',sessionId:'s',title:'Rest',subtitle:'',color:'#fff',y:225,height:250,actorKeys:actors.map(a=>a.key)}],actors,quietTeams:[],totalAgents:count,finishedCount:count}
}
function init(d=date(),s=scene()){return planOfficeRestOutings({date:d,at:0,scene:s,state:emptyOfficeOutingSchedule(),guests:[],blocked:false,weather:'clear'})}
test('day and night initial delay, cadence, cohort and dwell are bounded and deterministic',()=>{
 for(const night of [false,true]){const d=date(night?21:14),first=init(d),before=JSON.stringify(first.state)
  assert.deepEqual(first.invitations,[]);assert.ok(first.state.nextAt! >=(night?45000:20000)&&first.state.nextAt! <=(night?75000:40000))
  const due=planOfficeRestOutings({date:d,at:first.state.nextAt!,scene:scene(),state:first.state,guests:[],blocked:false,weather:'clear'})
  assert.equal(due.invitations.length,night?1:2);assert.ok(due.state.nextAt!-first.state.nextAt! >=(night?180000:60000)&&due.state.nextAt!-first.state.nextAt! <=(night?300000:100000))
  for(const invite of due.invitations){assert.equal(invite.kind,'outing');assert.equal(invite.night,night);assert.ok(invite.dwellMs>=(night?30000:25000)&&invite.dwellMs<=(night?60000:45000));assert.ok((night?['drink','stretch','stargaze']:['snack','drink','stretch']).includes(invite.action))}
  assert.equal(JSON.stringify(first.state),before)
  assert.deepEqual(due,planOfficeRestOutings({date:d,at:first.state.nextAt!,scene:scene(),state:first.state,guests:[],blocked:false,weather:'clear'}))
 }
})
test('only visible current resting actors including idle lead nook qualify, with real work priority',()=>{
 const s=scene(10);s.actors[0].agent.status='running';s.actors[1].agent.status='waiting_input';s.actors[2].agent.status='failed';s.actors[3].hidden=true;s.actors[4].floorId='garden';s.actors[5].floorId='gone';s.actors[6].agent.status='cancelled';s.actors[7].agent={...s.actors[7].agent,role:'lead',parentId:null,status:'idle'};s.actors[7].parentKey=null;s.actors[7].floorId='team'
 const before=JSON.stringify(s),first=init(date(),s),p=planOfficeRestOutings({date:date(),at:first.state.nextAt!,scene:s,state:first.state,guests:[],busyKeys:new Set(['a8','a9']),blocked:false,weather:'clear'})
 assert.deepEqual(p.invitations.map(i=>i.actorKey),['a6','a7'])
 assert.equal(JSON.stringify(s),before)
})
test('blocked and daily windows consume the check cadence without per-frame retries or cooldowns',()=>{
 const first=init(),at=first.state.nextAt!
 for(const d of [date(),date(8,45),date(12,10),date(15,10)]){const p=planOfficeRestOutings({date:d,at,scene:scene(),state:first.state,guests:[],blocked:d.getHours()===14,weather:'clear'});assert.equal(p.invitations.length,0);assert.ok(p.state.nextAt!>at);assert.deepEqual(p.state.lastByActor,{})}
 const p=planOfficeRestOutings({date:date(),at:at+10000000,scene:scene(),state:first.state,guests:[],blocked:false,weather:'clear'})
 assert.equal(p.invitations.length,2);assert.ok(p.state.nextAt!>at+10000000)
 assert.equal(planOfficeRestOutings({date:date(),at:at+10000001,scene:scene(),state:p.state,guests:[],blocked:false,weather:'clear'}).invitations.length,0)
})
test('garden exact physical party seats and all kinds of visitor reservations share four slots',()=>{
 const s=scene(),[x,y]=OFFICE_DAILY_SEATS[2];s.actors.push({...s.actors[0],key:'party',floorId:'garden',party:true,x:x*s.width,y:y*250})
 const guests=[{actorKey:'meal',destination:'garden' as const,seat:0,kind:'lunch'},{actorKey:'other',destination:'garden' as const,seat:1,kind:'outing'}]
 const first=init(date(),s),input={date:date(),at:first.state.nextAt!,scene:s,state:first.state,guests,blocked:false,weather:'clear' as const},p=planOfficeRestOutings(input)
 assert.equal(p.invitations.length,1);assert.equal(p.invitations[0].seat,3);assert.equal(p.invitations[0].destination,'garden')
 const full=planOfficeRestOutings({...input,guests:[...guests,{actorKey:'tea',destination:'garden',seat:3,kind:'tea'}]});assert.equal(full.invitations[0].destination,'home')
 const wet=planOfficeRestOutings({...input,weather:'storm'});assert.equal(wet.invitations[0].destination,'home');assert.deepEqual([...new Set(wet.invitations.map(i=>i.destination))],['home'])
 const night=init(date(21),s);assert.equal(planOfficeRestOutings({...input,date:date(21),state:night.state,at:night.state.nextAt!}).invitations.length,0)
})
test('only actual admission consumes bounded cooldown; fair round robin rotates beyond the lead',()=>{
 const s=scene(),first=init(date(),s);let state=first.state,at=state.nextAt!,keys:string[]=[]
 for(let round=0;round<3;round++){const p=planOfficeRestOutings({date:date(),at,scene:s,state,guests:[],blocked:false,weather:'clear'});assert.equal(Object.keys(p.state.lastByActor).length,round*2);state=p.state
  for(const invite of p.invitations){keys.push(invite.actorKey);const before=JSON.stringify(state);const marked=markOfficeRestOutingAdmission(state,invite,at);assert.equal(JSON.stringify(state),before);const entry=marked.lastByActor[invite.actorKey];assert.ok(entry.nextAt-at>=360000&&entry.nextAt-at<=600000);assert.deepEqual(markOfficeRestOutingAdmission(marked,invite,at+100),marked);state=marked}
  at=state.nextAt!
 }
 assert.equal(new Set(keys).size,6)
 assert.equal(planOfficeRestOutings({date:date(),at,scene:s,state,guests:[],blocked:false,weather:'clear'}).invitations.length,0)
 const n=init(date(21)),p=planOfficeRestOutings({date:date(21),at:n.state.nextAt!,scene:s,state:n.state,guests:[],blocked:false,weather:'clear'}),marked=markOfficeRestOutingAdmission(p.state,p.invitations[0],n.state.nextAt!)
 const entry=marked.lastByActor[p.invitations[0].actorKey];assert.ok(entry.nextAt-entry.at>=600000&&entry.nextAt-entry.at<=900000)
})
test('day and daylight-profile changes rebase against current motion time with no instant backlog',()=>{
 const first=init(),late=first.state.nextAt!+999999
 for(const d of [date(21),date(14,20,16)]){const p=planOfficeRestOutings({date:d,at:late,scene:scene(),state:first.state,guests:[],blocked:false,weather:'clear'});assert.equal(p.invitations.length,0);assert.ok(p.state.nextAt!>=late+(d.getHours()===21?45000:20000))}
 const dawn=init(date(5,29)),day=planOfficeRestOutings({date:date(5,30),at:0,scene:scene(),state:dawn.state,guests:[],blocked:false,weather:'clear'});assert.ok(day.state.nextAt!>=20000&&day.state.nextAt!<=40000)
})
test('cooldown history is bounded at five hundred actors and absent actors may be pruned',()=>{
 const first=init(),s=scene(510);let state=first.state
 for(let i=0;i<510;i++)state=markOfficeRestOutingAdmission(state,{actorKey:`a${i}`,kind:'outing',occurrenceKey:`outing-${i}`,destination:'home',seat:0,action:'drink',night:false,dwellMs:25000},i)
 assert.equal(Object.keys(state.lastByActor).length,500)
 const p=planOfficeRestOutings({date:date(),at:1000,scene:s,state,guests:[],blocked:true});assert.ok(Object.keys(p.state.lastByActor).length<=500)
})
test('wet or full garden uses quiet indoor actions with one home outing per source floor',()=>{
 const s=scene(),first=init(date(),s),input={date:date(),at:first.state.nextAt!,scene:s,state:first.state,guests:[],blocked:false,weather:'rain' as const}
 const p=planOfficeRestOutings(input);assert.equal(p.invitations.length,1);assert.equal(p.invitations[0].destination,'home');assert.ok(['drink','stretch'].includes(p.invitations[0].action))
 const sameRoom=planOfficeRestOutings({...input,guests:[{actorKey:'a0',destination:'home',seat:0,kind:'outing'}]});assert.deepEqual(sameRoom.invitations,[])
 s.actors[5].floorId='team';s.actors[5].parentKey=null;s.actors[5].agent={...s.actors[5].agent,role:'lead',parentId:null,status:'idle'}
 const twoRooms=planOfficeRestOutings(input);assert.equal(twoRooms.invitations.length,2)
 assert.deepEqual(twoRooms.invitations.map(i=>s.actors.find(a=>a.key===i.actorKey)?.floorId),['private','team'])
 const night=init(date(21),s),n=planOfficeRestOutings({...input,date:date(21),state:night.state,at:night.state.nextAt!});assert.equal(n.invitations[0].destination,'home');assert.ok(['drink','stretch'].includes(n.invitations[0].action))
})
test('continuous blocking retries within fifteen seconds and releases one cohort without a burst',()=>{
 let state=init().state,at=state.nextAt!
 for(let i=0;i<10;i++){const p=planOfficeRestOutings({date:date(),at,scene:scene(),state,guests:[],blocked:true,weather:'clear'});assert.deepEqual(p.invitations,[]);assert.ok(p.state.nextAt!-at>=10000&&p.state.nextAt!-at<=15000);state=p.state;at=state.nextAt!}
 const release=planOfficeRestOutings({date:date(),at,scene:scene(),state,guests:[],blocked:false,weather:'clear'});assert.equal(release.invitations.length,2);assert.ok(release.state.nextAt!-at>=60000)
 const nextFrame=planOfficeRestOutings({date:date(),at:at+1,scene:scene(),state:release.state,guests:[],blocked:false,weather:'clear'});assert.deepEqual(nextFrame.invitations,[])
})
