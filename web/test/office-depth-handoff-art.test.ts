import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeAvatar,drawOfficeFrame} from '../components/agent-visualizer/office/office-art'
import {officeAppearance} from '../lib/office-model'
import {officeActorRenderScale} from '../lib/office-depth'
import {drawOfficeVendor} from '../components/agent-visualizer/office/office-vendor-art'
import {officeVendorExchange} from '../lib/office-vendor'
import type {OfficeActor,OfficePaintOptions,OfficeScene} from '../lib/office-types'
const scene:OfficeScene={width:450,height:650,actors:[],quietTeams:[],totalAgents:1,finishedCount:1,floors:[{id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#abc',y:0,height:253,actorKeys:['a']}]}
const actor={key:'a',sessionId:'s',agent:{id:'a',name:'Agent',status:'done',role:'worker',runtime:null,activities:[]},task:null,parentKey:null,appearance:officeAppearance(0),floorId:'garden',zone:'lounge',activity:'collecting snack',runtimeName:'Codex',x:450*.61,y:253*.70,stand:true,pose:{walk:false,sit:false}} as unknown as OfficeActor
function context(){
 const images:unknown[][]=[],scales:number[][]=[],state:Record<string,unknown>={globalAlpha:1}
 const c=new Proxy(state,{get(t,k){if(k in t)return t[String(k)];if(k==='drawImage')return (...args:unknown[])=>images.push(args);if(k==='scale')return (...args:number[])=>scales.push(args);if(k==='measureText')return ()=>({width:20});if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});return ()=>{}},set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D
 return {c,images,scales}
}
const props={width:1536,height:1024},art={props,shell:{},breakRoom:{}} as unknown as NonNullable<OfficePaintOptions['roomArt']>
const options=(progress:number):OfficePaintOptions=>({date:new Date(2026,10,16,12),time:0,now:0,live:true,motion:false,pets:[],selectedKey:null,roomArt:art,leisureKeys:new Set(['a']),dailyArt:{delivery:false,cleanup:false,guests:[{actorKey:'a',kind:'outing',phase:'outbound',floorId:'garden',x:actor.x,y:actor.y,seat:0,action:'snack',night:false,collected:true,pickupProgress:progress}]}})
it('uses one purchased parcel, ending on the same scaled palm the avatar actually renders',()=>{
 const s={...scene,actors:[actor]},r=context(),offsets=drawOfficeFrame(r.c,s,options(.95))
 const parcels=r.images.filter(args=>args[0]===props&&Math.abs(Number(args[1])-1428.48)<.01)
 assert.equal(parcels.length,1,'no duplicate carried bag during service')
 const scale=officeActorRenderScale(s,actor),hands=drawOfficeAvatar(context().c,actor.appearance,0,0,0,{face:1,offer:.8,sit:false,mug:false})
 assert.ok(r.scales.some(([x,y])=>x===scale&&y===scale),'uniform canvas scale')
 assert.equal(offsets.get('a')?.scale,scale)
 assert.ok(Math.abs(Number(parcels[0][5])-(actor.x+hands.right.x*scale-6.75*scale))<.001)
 assert.ok(Math.abs(Number(parcels[0][6])-(actor.y+hands.right.y*scale+1.35*scale))<.001)
})
it('leaves source geometry and collection state unchanged while painting a handoff',()=>{
 const s={...scene,actors:[actor]},o=options(.5),before=structuredClone({s,o:{...o,leisureKeys:[...o.leisureKeys!]}})
 drawOfficeFrame(context().c,s,o)
 assert.deepEqual({s,o:{...o,leisureKeys:[...o.leisureKeys!]}},before)
})
it('stages the customer in front of the clerk with separated bodies and reachable palms',()=>{
 const s={...scene,actors:[actor]},o=options(.5),exchange=officeVendorExchange(s,o.date,o.dailyArt)!
 const customerScale=officeActorRenderScale(s,actor),customer=drawOfficeAvatar(context().c,actor.appearance,0,0,0,{face:1,offer:.8})
 let checked=false
 drawOfficeVendor(context().c,s,o.date,0,staff=>{
  assert.ok(staff.x-actor.x>38)
  assert.ok(staff.y<actor.y)
  assert.ok(staff.scale<customerScale,'the farther-back clerk uses the same depth projection')
  const hand=drawOfficeAvatar(context().c,officeAppearance(0),0,0,0,{face:staff.face,offer:staff.offer})
  const dx=staff.x+hand.right.x*staff.scale-actor.x-customer.right.x*customerScale
  const dy=staff.y+hand.right.y*staff.scale-actor.y-customer.right.y*customerScale
  assert.ok(Math.hypot(dx,dy)<8,`hands are ${Math.hypot(dx,dy)} scene units apart`)
  checked=true
 },exchange)
 assert.equal(checked,true)
})
