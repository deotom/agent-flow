import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeVendorAllowsObject,officeVendorState } from '../lib/office-vendor'
import { officeSky } from '../lib/office-sky'
import { drawOfficeVendor,officeVendorAvatarPose, type OfficeVendorCharacter } from '../components/agent-visualizer/office/office-vendor-art'
import type { OfficeScene } from '../lib/office-types'
import {drawOfficeAvatar} from '../components/agent-visualizer/office/office-art'

const date=(hour:number,minute=0)=>new Date(2026,10,16,hour,minute)
it('keeps the shop busy between customers without inventing a sale, and freezes with effects off',()=>{
 const poses=new Set<string>()
 for(const time of [0,7,17,27,35]){
  const staff:OfficeVendorCharacter[]=[]
  drawOfficeVendor(recorder().c,scene(450),date(12),time,a=>staff.push(a))
  poses.add(staff[0].pose)
  assert.equal(staff[0].recipientKey,undefined)
 }
 assert.deepEqual([...poses].sort(),['idle','prepare','stock','tidy'])
 for(const time of [0,NaN,-1]){
  const staff:OfficeVendorCharacter[]=[]
  drawOfficeVendor(recorder().c,scene(450),date(12),time,a=>staff.push(a))
  assert.equal(staff[0].pose,'idle')
 }
})
it('does not invite a cosmetic cart visit while closed, while indoor drinks and picnic seats remain usable',()=>{
 assert.equal(officeVendorAllowsObject(date(22),'lounge','coffee'),false)
 assert.equal(officeVendorAllowsObject(date(22),'break','coffee'),true)
 assert.equal(officeVendorAllowsObject(date(22),'lounge','snack'),true)
 assert.equal(officeVendorAllowsObject(date(12),'lounge','coffee'),officeVendorState(date(12)).open)
})
it('closes at the same local dawn and dusk boundaries as garden outings',()=>{
  for(const [hour,minute,night] of [[5,29,true],[5,30,false],[18,29,false],[18,30,true]] as const){
    const state=officeVendorState(date(hour,minute))
    assert.equal(state.night,night)
    assert.equal(state.open,!night&&!state.wet)
    assert.equal(state.staffed,!night)
  }
})
it('wet simulated hours close service but keep staff sheltered and seasonal stock cosmetic',()=>{
  const seen=new Set<string>()
  for(let month=0;month<12;month++)for(let day=1;day<=28;day++){
    const d=new Date(2026,month,day,12),sky=officeSky(d),state=officeVendorState(d)
    assert.equal(state.weather,sky.weather);assert.equal(state.season,sky.season)
    assert.equal(state.wet,sky.weather==='rain'||sky.weather==='storm')
    assert.equal(state.open,!state.wet)
    assert.equal(state.staffed,true)
    if(state.wet)assert.equal(state.sign,'sheltered')
    seen.add(sky.weather)
  }
  assert.ok(seen.has('rain')&&seen.has('storm')&&seen.has('clear')&&seen.has('cloudy'))
  assert.equal(officeVendorState(date(22)).sign,'closed')
})
function scene(width:number):OfficeScene{return {width,height:800,floors:[{id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:20,height:width*.5625,actorKeys:[]}],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}}
function recorder(){
  const calls:{op:string,args:unknown[]}[]=[],state:Record<string,unknown>={}
  const c=new Proxy(state,{get(t,k){if(k in t)return t[k as string];return (...args:unknown[])=>calls.push({op:String(k),args})},set(t,k,v){t[String(k)]=v;return true}})
  return {c:c as unknown as CanvasRenderingContext2D,calls}
}
it('attaches chore props to the actual rendered palm at all supported widths',()=>{
 for(const width of [240,450,700])for(const time of [7,17,27]){
  const r=recorder();let palm:{x:number;y:number}|undefined
  drawOfficeVendor(r.c,scene(width),date(12),time,staff=>{
   const hands=drawOfficeAvatar(r.c,officeAppearance(0),0,0,time,officeVendorAvatarPose(staff))
   palm=hands.right
   assert.ok(hands.left.x<-10,'working left hand remains outside foreground apron')
  })
  const prop=r.calls.find(call=>call.op==='fillRect'&&call.args[2]===10&&(call.args[3]===3||call.args[3]===7))
  assert.ok(prop&&palm)
  assert.ok(Math.abs(Number(prop.args[0])+5-palm.x)<.001,'prop follows actual right palm x')
  assert.ok(Math.abs(Number(prop.args[1])+1-palm.y)<.001,'prop follows actual right palm y')
 }
})
it('keeps foreground seasonal stock out of the sheltered clerk window',()=>{
 for(const width of [240,450,700]){
  const r=recorder();let afterStaff=0
  drawOfficeVendor(r.c,scene(width),new Date(2026,6,2,12),17,()=>{afterStaff=r.calls.length})
  const h=width*.5625
  const overlap=r.calls.slice(afterStaff).filter(call=>call.op==='fillRect').some(call=>{
   const [x,y,w,hRect]=call.args as number[]
   return x<width*.812&&x+w>width*.745&&y<20+h*.585&&y+hRect>20+h*.50
  })
  assert.equal(overlap,false,'wares must not paint over sheltered head and chest')
 }
})
it('places one full decorative merchant beside the painted cart within a bounded clip without scene writes',()=>{
  for(const width of [240,450,700]){
    const s=scene(width),before=JSON.stringify(s),r=recorder(),characters:OfficeVendorCharacter[]=[]
    drawOfficeVendor(r.c,s,date(12),2,character=>{
      assert.equal(r.calls.at(-1)?.op,'clip','avatar must be clipped before drawing')
      characters.push(character)
    })
    assert.equal(JSON.stringify(s),before)
    assert.equal(characters.length,1)
    const actor=characters[0],h=width*.5625
    assert.ok(actor.x>width*.66&&actor.x<width*.75)
    assert.ok(actor.y>20+h*.62&&actor.y<20+h*.72)
    assert.ok(actor.scale>=.86*width/450&&actor.scale<=.94*width/450)
    assert.equal(actor.serving,officeVendorState(date(12)).open)
    assert.equal(actor.face,1)
    for(const call of r.calls)for(const arg of call.args)if(typeof arg==='number')assert.ok(Number.isFinite(arg))
    const clip=r.calls.find(call=>call.op==='rect')!.args as number[]
    assert.ok(clip[0]>=0&&clip[1]>=20&&clip[0]+clip[2]<=width&&clip[1]+clip[3]<=20+h)
  }
})
it('shows only a closed sign at night and ignores absent or invalid gardens',()=>{
  const r=recorder(),s=scene(450),characters:OfficeVendorCharacter[]=[]
  drawOfficeVendor(r.c,s,date(22),0,a=>characters.push(a))
  assert.equal(characters.length,0)
  assert.ok(r.calls.length>0)
  for(const input of [{...s,floors:[]},{...s,width:NaN},{...s,width:0},{...s,floors:s.floors.map(f=>({...f,height:0}))}]){
    const empty=recorder();drawOfficeVendor(empty.c,input,date(12),0,()=>assert.fail('invalid garden drew merchant'))
    assert.equal(empty.calls.length,0)
  }
})
it('rain and storm retreat exactly one nonserving merchant underneath the existing roof',()=>{
  for(const day of [2,7])for(const width of [240,450,700]){
    const s=scene(width),r=recorder(),characters:OfficeVendorCharacter[]=[],d=new Date(2026,6,day,12)
    drawOfficeVendor(r.c,s,d,8,a=>characters.push(a))
    assert.equal(characters.length,1)
    const a=characters[0],h=width*.5625
    assert.equal(a.serving,false);assert.equal(a.pose,'idle')
    assert.ok(a.x>width*.75&&a.x<width*.81)
    const clip=r.calls.find(call=>call.op==='rect')!.args as number[]
    assert.ok(clip[1]>=20+h*.48,'retreat stays below the painted awning')
    assert.ok(clip[1]+clip[3]<=20+h*.60,'counter masks lower body')
    assert.ok(a.y-76*a.scale>=clip[1],'head stays visible within roof clearance')
    assert.ok(a.y-30*a.scale<clip[1]+clip[3],'face stays above the counter')
    assert.equal(r.calls.filter(c=>c.op==='save').length,r.calls.filter(c=>c.op==='restore').length)
  }
})

import { officeVendorExchange } from '../lib/office-vendor'
import { officeAppearance } from '../lib/office-model'
import type { OfficeActor, OfficeDailyVisual } from '../lib/office-types'
function pickupFixture(width=450){
  const s=scene(width),x=width*.61,y=20+width*.5625*.70
  const actor:OfficeActor={key:'customer-b',sessionId:'s',agent:{id:'b',name:'B',role:'worker',status:'done'} as OfficeActor['agent'],task:null,parentKey:null,appearance:officeAppearance(0),floorId:'garden',zone:'lounge',activity:'collecting snack',runtimeName:'Codex',x,y,pose:{walk:false,sit:false}}
  s.actors=[actor];s.totalAgents=1;s.finishedCount=1
  const visual:OfficeDailyVisual={delivery:false,cleanup:false,guests:[{actorKey:actor.key,kind:'outing',phase:'outbound',action:'snack',floorId:'garden',x,y,seat:0,night:false,collected:true,pickupProgress:.5}]}
  return {s,actor,visual}
}
it('derives a stable single handoff only from real stationary snack pickup guests without writes',()=>{
  for(const width of [240,450,700]){
    const {s,actor,visual}=pickupFixture(width),before=JSON.stringify({s,visual})
    assert.equal(officeVendorExchange(s,date(12),visual)?.actorKey,'customer-b')
    assert.equal(JSON.stringify({s,visual}),before)
    const second={...actor,key:'customer-a'};s.actors.push(second)
    visual.guests=[...visual.guests,{...visual.guests[0],actorKey:second.key,phase:'relocating'}]
    assert.equal(officeVendorExchange(s,date(12),visual)?.actorKey,'customer-a')
    visual.guests=[...visual.guests].reverse();s.actors.reverse()
    assert.equal(officeVendorExchange(s,date(12),visual)?.actorKey,'customer-a')
  }
})
it('finishes the customer already being served before a later key-sorted arrival',()=>{
 const {s,actor,visual}=pickupFixture()
 const later={...actor,key:'customer-a'};s.actors.push(later)
 visual.guests=[{...visual.guests[0],pickupProgress:.7},{...visual.guests[0],actorKey:later.key,pickupProgress:.2}]
 assert.equal(officeVendorExchange(s,date(12),visual)?.actorKey,actor.key)
})
it('rejects wet/night, absent, stale, moving, hidden, lifted and working pickup candidates',()=>{
  const {s,visual}=pickupFixture()
  for(const d of [date(22),new Date(2026,6,2,12),new Date(2026,6,7,12)])assert.equal(officeVendorExchange(s,d,visual),null)
  assert.equal(officeVendorExchange(s,date(12),undefined),null)
  for(const change of [{hidden:true},{floorId:'missing'},{zone:'desk' as const},{x:s.actors[0].x+5},{x:NaN},{pose:{walk:true}},{pose:{inLift:true}},{pose:{climb:true}},{pose:{sit:true}},{pose:{opacity:0}},{agent:{...s.actors[0].agent,status:'running' as const}},{agent:{...s.actors[0].agent,status:'waiting_input' as const}}]){
    assert.equal(officeVendorExchange({...s,actors:[{...s.actors[0],...change}]},date(12),visual),null,JSON.stringify(change))
  }
  for(const change of [{pickupProgress:undefined},{pickupProgress:NaN},{pickupProgress:-.1},{pickupProgress:1},{phase:'eating' as const},{phase:'returning' as const},{kind:'tea' as const},{action:'drink' as const},{night:true},{floorId:'missing'},{x:s.actors[0].x+5},{y:NaN},{actorKey:'gone'}]){
    assert.equal(officeVendorExchange(s,date(12),{...visual,guests:[{...visual.guests[0],...change}]}),null,JSON.stringify(change))
  }
})
it('merchant reaches only for an eligible recipient rather than waving on a timer',()=>{
  const {s,visual}=pickupFixture(),exchange=officeVendorExchange(s,date(12),visual),r=recorder(),characters:OfficeVendorCharacter[]=[]
  drawOfficeVendor(r.c,s,date(12),8,a=>characters.push(a),exchange)
  assert.equal(characters[0].pose,'handoff');assert.ok(characters[0].offer!>=.15&&characters[0].offer!<=.3)
  assert.equal(characters[0].recipientKey,'customer-b')
  const idle:OfficeVendorCharacter[]=[]
  drawOfficeVendor(recorder().c,s,date(12),8,a=>idle.push(a))
  assert.equal(idle[0].pose,'prepare');assert.equal(idle[0].offer,undefined)
  const wet:OfficeVendorCharacter[]=[]
  drawOfficeVendor(recorder().c,s,new Date(2026,6,2,12),8,a=>wet.push(a),exchange)
  assert.equal(wet[0].pose,'idle');assert.equal(wet[0].offer,undefined)
  for(const time of [7,17,27]){
    const serving:OfficeVendorCharacter[]=[]
    drawOfficeVendor(recorder().c,s,date(12),time,a=>serving.push(a),exchange)
    assert.equal(serving[0].pose,'handoff');assert.equal(serving[0].supportHands,undefined)
  }
})
import { officeVendorPickupProgress } from '../lib/office-vendor'
import type { OfficeTrip } from '../lib/office-motion'
function pickupTrip():OfficeTrip{
  const {s,actor}=pickupFixture(),p={x:actor.x,y:actor.y}
  return {actorKey:actor.key,actor,event:{id:'pickup',kind:'routine',actorKey:actor.key,parentKey:null,at:100},caption:'collecting snack',startedAt:100,endsAt:2100,shaftX:s.width*.94,rungPitch:18,segments:[{kind:'walk',from:{x:p.x-30,y:p.y},to:p,duration:200,floorId:'garden'},{kind:'hold',from:p,to:p,duration:1400,floorId:'garden'},{kind:'walk',from:p,to:{x:p.x-40,y:p.y},duration:400,floorId:'garden'}]}
}
it('pickup progress follows only the active physical cart hold and never lift/seat/expired holds',()=>{
  const {s}=pickupFixture(),trip=pickupTrip()
  assert.equal(officeVendorPickupProgress(s,trip,299),null)
  assert.equal(officeVendorPickupProgress(s,trip,300),0)
  assert.equal(officeVendorPickupProgress(s,trip,1000),.5)
  assert.equal(officeVendorPickupProgress(s,trip,1700),null)
  assert.equal(officeVendorPickupProgress(s,trip,2200),null)
  assert.equal(officeVendorPickupProgress(s,null,1000),null)
  for(const patch of [{liftPhase:'closing' as const},{floorId:'elsewhere'},{duration:650},{from:{x:0,y:0},to:{x:0,y:0}},{kind:'walk' as const},{opacity:[0,1] as const}]){
    const altered={...trip,segments:trip.segments.map((seg,i)=>i===1?{...seg,...patch}:seg)}
    assert.equal(officeVendorPickupProgress(s,altered,1000),null,JSON.stringify(patch))
  }
})
