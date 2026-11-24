import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeStation,officeStationHardware} from '../components/agent-visualizer/office/office-station-art'
import {roomDesktopWorkpoints,type OfficeRoomStation} from '../lib/office-room-design'
import {drawOfficeRoomDeskLights,type OfficeRoomArt} from '../components/agent-visualizer/office/office-room-design-art'
import {officeStationActivity,type OfficeStationState} from '../lib/office-station-activity'
import {officeAppearance} from '../lib/office-model'
import type {OfficeActor,OfficeFloor,OfficeScene} from '../lib/office-types'

const station:OfficeRoomStation={kind:'build',facing:'left',x:130,y:180,width:85,height:85,depth:.5,work:{x:120,y:184}}
const art={stations:{name:'front'},stationAngles:{name:'angles'}} as unknown as OfficeRoomArt

it('darkens both Terminal screens until a stationary worker occupies either painted seat',()=>{
 const floor={id:'team',desktopArt:true,y:200,height:325} as OfficeFloor
 const spot=roomDesktopWorkpoints(floor,450,'terminal')[1].feet
 const actor={...spot,floorId:floor.id,zone:'desk',workStation:'terminal',agent:{status:'running'}} as OfficeActor
 const count=(actors:OfficeActor[])=>{
  const scene={width:450,floors:[floor],actors} as OfficeScene
  let darkScreens=0
  const c={save(){},restore(){},translate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},drawImage(){},ellipse(){},fill(){},createLinearGradient:()=>({addColorStop(){}}),fillRect(){darkScreens++}}
  drawOfficeRoomDeskLights(c as unknown as CanvasRenderingContext2D,scene,floor,{...art,shell:art.stations!})
  return darkScreens
 }
 assert.equal(count([]),2)
 assert.equal(count([actor]),0)
 assert.equal(count([{...actor,pose:{walk:true}}]),2)
 assert.equal(count([{...actor,x:actor.x+25}]),2)
})
function paint(time:number,animate=true,state:OfficeStationState='working',item=station,assets=art,alpha=1){
 const calls:unknown[][]=[],props:Record<string,unknown>={globalAlpha:alpha}
 const c=new Proxy(props,{get(t,k){if(k in t)return t[String(k)];return (...args:unknown[])=>calls.push([k,...args,...(k==='stroke'||k==='fill'?[{alpha:props.globalAlpha,color:k==='stroke'?props.strokeStyle:props.fillStyle}]:[])])},set(t,k,v){t[String(k)]=v;calls.push(['set',k,v]);return true}}) as unknown as CanvasRenderingContext2D
 drawOfficeStation(c,item,assets,{time,animate,state})
 return calls
}
it('animates device screens and embedded lights while an occupied station works',()=>{
 assert.notDeepEqual(paint(1),paint(2),'the equipment must respond to the working animation clock')
})
it('keeps idle and effects-off devices static while preserving a lit last-known display',()=>{
 assert.deepEqual(paint(1,false),paint(20,false))
 assert.deepEqual(paint(1,true,'idle'),paint(20,true,'idle'))
 assert.deepEqual(paint(1,true,'waiting'),paint(20,true,'waiting'))
 assert.deepEqual(paint(1,true,'failed'),paint(20,true,'failed'))
 assert.deepEqual(paint(NaN),paint(0))
})
it('makes waiting and failed traces readable without flashing and preserves alpha inheritance',()=>{
 for(const state of ['waiting','failed'] as const){
  const alphas=paint(1,true,state).filter(call=>call[0]==='stroke').map(call=>Number((call.at(-1) as {alpha:number}).alpha))
  assert.ok(alphas.some(alpha=>alpha>=.7),'alert trace is stronger than a dim idle trace')
 }
 const parts=officeStationHardware('build','right')
 assert.ok(parts.screens.every(q=>q[0][0]<q[1][0]),'screen content reads left to right in the right-facing view')
 const faded=paint(1,true,'working',station,art,.3).filter(call=>call[0]==='stroke')
 assert.ok(faded.every(call=>Number((call.at(-1) as {alpha:number}).alpha)<=.3),'parent opacity bounds the effect')
})
it('changes embedded rack lights independently of the moving screen trace',()=>{
 const calls=paint(1,true,'working',{...station,kind:'terminal'})
 const lights=calls.filter(call=>call[0]==='fill'&&(call.at(-1) as {color:string}).color==='#b5dd87').map(call=>Number((call.at(-1) as {alpha:number}).alpha))
 assert.ok(lights.some(a=>a>=.8)&&lights.some(a=>a<=.2),'rack has clear bright and dim indicators')
})
it('lights only a visible stationary agent physically using the matching tool',()=>{
 const actor={key:'worker',floorId:'team',zone:'desk',appearance:officeAppearance(0),workStation:'build',x:station.work.x,y:station.work.y,agent:{status:'running',activities:[]}} as unknown as OfficeActor
 const scene={width:450,actors:[actor]} as OfficeScene,before=structuredClone(scene)
 assert.equal(officeStationActivity(scene,'team',station),'working')
 for(const change of [{hidden:true},{floorId:'other'},{zone:'lounge'},{workStation:'research'},{x:station.work.x+100},{pose:{walk:true}},{pose:{climb:true}},{pose:{inLift:true}},{pose:{opacity:.3}}]){
  assert.equal(officeStationActivity({...scene,actors:[{...actor,...change} as OfficeActor]},'team',station),'idle')
 }
 for(const status of ['idle','done','cancelled'] as const)assert.equal(officeStationActivity({...scene,actors:[{...actor,agent:{...actor.agent,status}}]},'team',station),'idle')
 assert.equal(officeStationActivity({...scene,actors:[{...actor,agent:{...actor.agent,status:'waiting_input'}}]},'team',station),'waiting')
 assert.equal(officeStationActivity({...scene,actors:[{...actor,agent:{...actor.agent,status:'failed'}}]},'team',station),'failed')
 assert.deepEqual(scene,before)
})
it('keeps all twelve hardware views inside their atlas frame and front fallback aligned',()=>{
 for(const kind of ['build','terminal','quality','research'] as const)for(const facing of ['front','left','right'] as const){
  const parts=officeStationHardware(kind,facing)
  const points=[...parts.screens.flat(),...(parts.leds??[]),...(parts.lamp?[parts.lamp]:[]),...(parts.page?[parts.page]:[])]
  assert.ok(points.every(p=>p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))
  assert.ok(parts.screens.every(q=>q[0][0]<q[1][0]&&q[3][0]<q[2][0]),`${kind}/${facing}: display reading order`)
  for(const width of [240,450,700])for(const call of paint(2,true,'working',{...station,kind,facing,width:width*.18,height:width*.18})){
   for(const n of call)if(typeof n==='number')assert.ok(Number.isFinite(n))
  }
 }
 const fallback={...art,stationAngles:undefined}
 assert.deepEqual(paint(2,true,'working',{...station,facing:'left'},fallback),paint(2,true,'working',{...station,facing:'front'},fallback))
})
