import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeSharedRest, type OfficeSharedRestOptions} from '../lib/office-shared-rest'
import {officeHandContacts} from '../lib/office-contacts'
import {officeLife,officeLifeCanChat,officeLifePairs} from '../lib/office-life'
import type {OfficeActor, OfficeScene} from '../lib/office-types'

const day={night:false,wet:false,clear:true}, night={...day,night:true}
const actor=(key:string,x:number,y=100):OfficeActor=>({key,x,y,floorId:'garden',zone:'lounge',sessionId:'s',parentKey:null,task:null,activity:'',runtimeName:'',
 appearance:{slot:0,kind:'human',hair:'',skin:'',shirt:'',pants:'',cut:'',gear:''},
 agent:{id:key,parentId:null,role:'worker',name:key,runtime:'codex',model:null,status:'done',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:null,updatedAt:null,completedAt:null}})
const scene=(actors=[actor('a',100),actor('b',160)]):OfficeScene=>({width:450,height:300,actors,floors:[{id:'garden',sessionId:null,title:'Garden',subtitle:'',color:'',y:0,kind:'lounge',actorKeys:actors.map(a=>a.key)}],quietTeams:[],totalAgents:actors.length,finishedCount:actors.length})
const empty=new Set<string>()
const active=(s:OfficeScene,options:OfficeSharedRestOptions=day)=>{
 for(let t=4;t<250;t+=.25){const pairs=officeSharedRest(s,t,empty,options);if(pairs.length&&pairs[0].progress>.25&&pairs[0].progress<.75)return {t,pairs}}
 assert.fail('expected a shared resting window')
}
it('supports an explicitly visible private cutaway without admitting an orphan room in the main scene',()=>{
 const full=scene();full.floors[0]={...full.floors[0],kind:'break',annexOf:'office'}
 full.floors.push({...full.floors[0],id:'office',annexOf:undefined,kind:'team'})
 const {t}=active(full),local={...full,floors:[full.floors[0]]}
 assert.equal(officeSharedRest(local,t,empty,day).length,0)
 assert.equal(officeSharedRest(local,t,empty,{...day,cutawayFloor:'garden'}).length,1)
 assert.equal(officeSharedRest(local,t,empty,{...day,cutawayFloor:'different'}).length,0)
})

it('selects a current visible pair and faces each actor toward their neighbour without movement',()=>{
 const s=scene(),{pairs}=active(s),p=pairs[0]
 assert.equal(p.kind,'chat');assert.deepEqual([p.firstKey,p.secondKey],['a','b'])
 assert.equal(p.poses.get('a')?.face,1);assert.equal(p.poses.get('b')?.face,-1)
 for(const pose of p.poses.values()){assert.equal(pose.walk,false);assert.equal(pose.sit,true);assert.equal(pose.offer,0)}
})
it('bounds a toast or snack reach so nearby partners never cross their palms',()=>{
 for(const action of ['coffee','snack'] as const){
  const s=scene([actor('a',100),actor('b',144)])
  s.actors.forEach(a=>a.objectAction=action)
  const {pairs}=active(s),pair=pairs[0],motion={left:0,right:0,sip:0,wave:0}
  const x=s.actors.map(a=>{const pose=pair.poses.get(a.key)!;return a.x+pose.face!*officeHandContacts(pose,motion).right.x})
  assert.ok(x[1]-x[0]>=8-1e-8,`palms overlap while offering ${action}`)
 }
})
it('does not snap an ambient stroller or an offset neighbour back to the seat for a shared gesture',()=>{
 for(let seed=0;seed<12;seed++){
 const s=scene([actor(`a${seed}`,100),actor(`b${seed}`,170)]),ambientPairs=officeLifePairs(s.actors)
 for(let time=4;time<100;time+=.1){
  const pairs=officeSharedRest(s,time,empty,day)
  for(const pair of pairs)for(const key of [pair.firstKey,pair.secondKey]){
   const a=s.actors.find(row=>row.key===key)!,near=ambientPairs.get(key),partner=s.actors.find(row=>row.key===near?.partnerKey)
   const frame=officeLife(a,time,{anchoredRest:true,partnerDx:near?.partnerDx,pairSeed:near?.pairSeed,partnerAwake:!!partner&&officeLifeCanChat(partner)})
   assert.equal(frame.walk,false)
   assert.ok(Math.abs(frame.dx)<.01,'ambient displacement would snap at the shared-window boundary')
  }
 }
 }
})

it('rejects hidden, faded, busy, moving and non-resting source actors immediately',()=>{
 const base=scene(),{t}=active(base)
 const patches:Partial<OfficeActor>[]=[{hidden:true},{zone:'desk'},{pose:{opacity:.8}},{pose:{walk:true}},{pose:{climb:true}},{pose:{inLift:true}}]
 for(const patch of patches){const s=scene();Object.assign(s.actors[1],patch);assert.equal(officeSharedRest(s,t,empty,day).length,0,JSON.stringify(patch))}
 for(const status of ['running','thinking','failed','background','waiting_input','waiting_approval'] as const){const s=scene();s.actors[1].agent.status=status;assert.equal(officeSharedRest(s,t,empty,day).length,0,status)}
 assert.equal(officeSharedRest(base,t,new Set(['b']),day).length,0)
 for(const status of ['idle','done','cancelled'] as const){base.actors[1].agent.status=status;assert.equal(officeSharedRest(base,t,empty,day).length,1)}
})

it('keeps pairs in one visible room, a near depth row and scaled horizontal contact range',()=>{
 for(const [gap,dy,expected] of [[43,0,false],[44,0,true],[90,12,true],[91,0,false],[60,13,false]] as const){
  const s=scene([actor('a',100),actor('b',100+gap,100+dy)])
  assert.equal(Array.from({length:500},(_,i)=>officeSharedRest(s,i*.5,empty,day).length).some(Boolean),expected,`${gap}/${dy}`)
 }
 const s=scene();s.width=900;s.actors[1].x=220;assert.ok(active(s).pairs.length)
 s.actors[1].floorId='other';assert.equal(officeSharedRest(s,active(scene()).t,empty,day).length,0)
 const hidden=scene();hidden.floors[0].kind='quiet';assert.equal(officeSharedRest(hidden,active(scene()).t,empty,day).length,0)
 const building=scene();building.floors[0].constructing=true;assert.equal(officeSharedRest(building,active(scene()).t,empty,day).length,0)
})

it('is deterministic, disjoint and capped across busy crowds by day and night',()=>{
 const s=scene(Array.from({length:16},(_,i)=>actor(String(i).padStart(2,'0'),100+(i%2)*60,100+Math.floor(i/2)*20)))
 for(const options of [day,night]){
  let maximum=0
  for(let t=4;t<600;t+=.5){const pairs=officeSharedRest(s,t,empty,options);maximum=Math.max(maximum,pairs.length)
   assert.ok(pairs.length<=(options.night?1:2));const keys=pairs.flatMap(p=>[p.firstKey,p.secondKey]);assert.equal(new Set(keys).size,keys.length)
   assert.deepEqual(officeSharedRest({...s,actors:[...s.actors].reverse()},t,empty,options),pairs)
  }
  assert.equal(maximum,options.night?1:2)
 }
})

it('offers compatible held props smoothly while preserving unrelated objects and standing spots',()=>{
 for(const action of ['coffee','snack'] as const){const s=scene();s.actors.forEach(a=>a.objectAction=action);const {pairs}=active(s)
  assert.equal(pairs[0].kind,action==='coffee'?'toast':'snack')
  for(const pose of pairs[0].poses.values()){assert.equal(pose.objectAction,action);assert.ok(pose.offer!>0&&pose.offer!<=1);assert.equal(pose.hand,false);if(action==='coffee'){assert.equal(pose.mug,true);assert.ok(Math.abs(pose.cupTilt!)<=.16)}}
 }
 for(const action of ['book','game','water','music'] as const){const s=scene();s.actors[0].objectAction=action;s.actors[0].pose={objectAction:action};const {pairs}=active(s),pose=pairs[0].poses.get('a')!
  assert.equal(pairs[0].kind,'chat');assert.equal(pose.objectAction,action);assert.equal(pose.mug,false);assert.equal(pose.hand,false);assert.equal(pose.sit,action!=='water'&&action!=='music')
 }
 const s=scene();s.actors[0].stand=true;assert.equal(active(s).pairs[0].poses.get('a')?.sit,false)
})

it('uses stars only on dry clear nights in the outdoor lounge',()=>{
 const s=scene();assert.equal(active(s,night).pairs[0].kind,'stargaze');assert.equal(active(s,night).pairs[0].poses.get('a')?.lookUp,true)
 for(const options of [{...night,wet:true},{...night,clear:false},day])assert.equal(active(s,options).pairs[0].kind,'chat')
 s.floors[0].kind='break';s.floors[0].room='room-break-garden';assert.equal(active(s,night).pairs[0].kind,'chat')
})

it('has bounded sparse windows, smooth endpoints and no startup or paused window',()=>{
 const s=scene();for(const t of [-1,0,1,3,NaN,Infinity])assert.deepEqual(officeSharedRest(s,t,empty,day),[])
 for(const options of [day,night]){
  const starts:number[]=[],ends:number[]=[];let prior=false
  for(let t=3;t<650;t+=.01){const now=officeSharedRest(s,t,empty,options).length>0;if(now&&!prior)starts.push(t);if(!now&&prior)ends.push(t);prior=now}
  assert.ok(starts.length>=3)
  for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=(options.night?120:48)-.02&&starts[i]-starts[i-1]<=(options.night?180:72)+.02)
  for(let i=0;i<ends.length;i++)assert.ok(ends[i]-starts[i]>=(options.night?4:6)-.02&&ends[i]-starts[i]<=(options.night?6:8)+.02)
  const coffee=scene();coffee.actors.forEach(a=>a.objectAction='coffee')
  const first=officeSharedRest(coffee,starts[0],empty,options)[0],last=officeSharedRest(coffee,ends[0]-.01,empty,options)[0]
  assert.ok(first.poses.get('a')!.offer!<.01);assert.ok(last.poses.get('a')!.offer!<.01)
 }
})

it('does not mutate scene actors, source agents, poses or busy ownership',()=>{
 const s=scene();s.actors[0].pose={objectAction:'book',face:-1};const before=structuredClone(s),busy=new Set<string>()
 const {t}=active(s);officeSharedRest(s,t,busy,day);assert.deepEqual(s,before);assert.equal(busy.size,0)
 s.actors[0].agent.status='running';assert.deepEqual(officeSharedRest(s,t,busy,day),[])
})

it('forms coordinated standing holiday pairs in the outdoor lounge without changing indoor break rooms',()=>{
 const holidayOptions=[{...day,holiday:'songkran' as const},{...night,holiday:'loy-krathong' as const}]
 for(const options of holidayOptions){
  const s=scene(),before=structuredClone(s)
  const {pairs}=active(s,options)
  assert.equal(pairs.length,1)
  assert.equal(pairs[0].kind,'holiday')
  const a=pairs[0].poses.get('a')!,b=pairs[0].poses.get('b')!
  assert.equal(a.face,1);assert.equal(b.face,-1)
  for(const pose of [a,b]){
   assert.equal(pose.sit,false)
   assert.equal(pose.mug,false)
   assert.equal(pose.walk,false)
   assert.equal(pose.objectAction,undefined)
   assert.ok((pose.offer??0)>0)
  }
  assert.deepEqual(s,before)
 }
 const indoor=scene()
 indoor.floors[0].kind='break'
 assert.equal(active(indoor,{...day,holiday:'songkran' as const}).pairs[0].kind,'chat')
})
