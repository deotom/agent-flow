import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeDoorBounds,officeInteriorDoor,officeNavigation,officeInsideLift} from '../lib/office-navigation'
import {drawOfficeInteriorDoors} from '../components/agent-visualizer/office/office-door-art'
import {drawOfficeShaft} from '../components/agent-visualizer/office/office-shaft-art'
import {drawOfficeRoomShell} from '../components/agent-visualizer/office/office-room-design-art'
import type {OfficeArchitectureArt,OfficeScene} from '../lib/office-types'
const fixture=():OfficeScene=>({width:450,height:800,actors:[],quietTeams:[],totalAgents:0,finishedCount:0,floors:[
 {id:'surface',kind:'lounge',sessionId:null,title:'',subtitle:'',color:'',y:0,height:250,actorKeys:[]},
 {id:'main',kind:'team',sessionId:'s',title:'',subtitle:'',color:'',y:250,height:250,actorKeys:['a']},
 {id:'rest',annexOf:'main',kind:'break',sessionId:'s',title:'',subtitle:'',color:'',y:250,height:250,actorKeys:[]}]})
function recorder(){
 const calls:{op:string,args:any[],filter?:unknown}[]=[]
 const values:Record<string,unknown>={filter:'none',createRadialGradient:()=>({addColorStop(){}})}
 const ctx=new Proxy(values,{get(t,k){if(k in t)return t[k as string];return(...args:any[])=>{calls.push({op:String(k),args,filter:t.filter})}},set(t,k,v){t[k as string]=v;return true}})
 return {ctx:ctx as unknown as CanvasRenderingContext2D,calls}
}
const art={doorClosed:{id:'closed'},doorOpen:{id:'open'},liftCabin:{id:'cabin',width:288,height:320},liftShaft:{id:'shaft'}} as unknown as OfficeArchitectureArt
it('keeps every material crop in bounds and undistorted across viewport scales, without sampling another lantern',()=>{
 for(const width of [240,380,450,700])for(const open of [0,.4,1]){
  const scene={...fixture(),width},n=officeNavigation(scene),r=recorder(),s=width/450
  drawOfficeShaft(r.ctx,scene,true,art,false,{y:n.hatch.y,doorsOpen:open,moving:false,passengerKeys:[]})
  for(const call of r.calls.filter(call=>call.op==='drawImage'&&call.args[0]===art.liftCabin&&call.args.length===9)){
   const [,sx,sy,sw,sh,dx,dy,dw,dh]=call.args
   assert.ok(sx>=0&&sy>=0&&sw>0&&sh>0&&sx+sw<=288+1e-9&&sy+sh<=320+1e-9)
   assert.ok(Math.abs(sw/sh-dw/dh)<1e-9,'painted timber grain must preserve its source aspect')
   if(sy===0)assert.ok(sy+sh<=51.2,'fixed cornice cannot source the lantern')
   else if(sy===51.2)assert.ok(sx+sw<=36||sx>=252,'posts contain only outer timber')
   else if(Math.abs(dw-14*s)<1e-9&&Math.abs(dh-68*s)<1e-9){
    assert.ok(sy>=102&&sx>=92&&sx+sw<=197,'leaves use plain rear-wall wood')
    if(open===1&&Math.abs(dy-(n.hatch.y-68*s))<1e-9)assert.ok(dx+dw<=n.shaftX-14*s+1e-9||dx>=n.shaftX+14*s-1e-9)
   }else assert.ok(sy+sh<52,'trim stays above the lantern')
  }
 }
})
it('slides separate leaf crops fully out of the cabin aperture instead of revealing the other leaf',()=>{
 const scene=fixture(),nav=officeNavigation(scene),r=recorder()
 drawOfficeShaft(r.ctx,scene,true,art,false,{y:nav.hatch.y,doorsOpen:1,moving:false,passengerKeys:['a']})
 const leaves=r.calls.filter(c=>c.op==='drawImage'&&c.args[0]===art.liftCabin&&c.args[7]===14&&c.args[8]===68&&c.args[6]===nav.hatch.y-68)
 assert.equal(leaves.length,2)
 for(const leaf of leaves){
  assert.equal(leaf.args.length,9)
  const left=leaf.args[5],right=left+leaf.args[7]
  assert.ok(right<=nav.shaftX-14||left>=nav.shaftX+14,'fully open leaves cannot cover the passenger')
 }
})
it('anchors each side of the doorway to its own wall',()=>{
 const scene=fixture(),workroom={x:450*.825,y:412.144},annex={x:450*.825,y:410}
 assert.deepEqual(officeInteriorDoor(scene,'main'),workroom);assert.deepEqual(officeInteriorDoor(scene,'rest'),workroom)
 assert.deepEqual(officeInteriorDoor(scene,'rest','annex'),annex)
 assert.deepEqual(officeInteriorDoor({...scene,floors:[scene.floors[2]]},'rest'),annex)
 const bounds=officeDoorBounds(scene,'main')!;assert.ok(bounds.x+bounds.width<officeNavigation(scene).left)
 const {ctx,calls}=recorder();drawOfficeInteriorDoors(ctx,scene,'rest',art)
 assert.ok(calls.some(c=>c.op==='drawImage'&&c.args[0]===art.doorOpen))
})
it('keeps the workroom door and its click target at the wall seam as the floor grows',()=>{
 for(const width of [380,450,700])for(const aspect of [.75,.66,.5625]){
  const scene={...fixture(),width}
  const main={...scene.floors[1],y:310,height:width*aspect}
  scene.floors=[main,{...scene.floors[2],y:main.y,height:main.height}]
  const {ctx,calls}=recorder(),shell={width:1000,height:563} as HTMLCanvasElement
  drawOfficeRoomShell(ctx,scene,main,{shell,props:shell,breakRoom:shell})
  drawOfficeInteriorDoors(ctx,scene,null,art)
  const floorboards=calls.filter(call=>call.op==='drawImage'&&call.args[0]===shell)[1]
  const door=calls.find(call=>call.op==='drawImage'&&call.args[0]===art.doorClosed)!
  const bounds=officeDoorBounds(scene,'rest')!
  assert.ok(Math.abs(door.args[2]+door.args[4]-floorboards.args[6])<1e-9)
  assert.deepEqual(door.args.slice(1),[bounds.x,bounds.y,bounds.width,bounds.height])
 }
})
it('shows lift doors at each actual landing and a garden pavilion above the earth',()=>{
 const scene=fixture(),nav=officeNavigation(scene),{ctx,calls}=recorder();drawOfficeShaft(ctx,scene,true,art)
 assert.equal(calls.filter(c=>c.op==='fillText'&&c.args[0]==='LIFT').length,nav.landings.length+1)
 assert.ok(!calls.some(c=>c.op==='drawImage'&&(c.args[0]===art.doorClosed||c.args[0]===art.doorOpen)),'lift uses cabin timber, not a hinged room door or cave interior')
 assert.ok(nav.top>nav.hatch.y,'shaft starts below the grass threshold')
 for(const c of calls)for(const v of c.args)if(typeof v==='number')assert.ok(Number.isFinite(v))
})
it('reveals the boarding cabin and closes landing doors while the car travels',()=>{
 const scene=fixture(),nav=officeNavigation(scene),landing=nav.landings[0]
 scene.actors=[{key:'a',floorId:'main',x:nav.shaftX,y:landing.y,pose:{climb:true}} as OfficeScene['actors'][number]]
 const back=recorder();drawOfficeShaft(back.ctx,scene,false,art)
 assert.ok(back.calls.some(c=>c.op==='drawImage'&&c.args[0]===art.liftCabin&&c.args.length===5))
 const front=recorder();drawOfficeShaft(front.ctx,scene,true,art)
 assert.ok(front.calls.filter(c=>c.op==='clip'&&c.args[0]==='evenodd').length>=nav.landings.length+1,'painted frames leave cabin apertures clear')
 assert.ok(front.calls.some(c=>c.op==='drawImage'&&c.args[0]===art.liftCabin&&c.args[7]===14&&c.args[8]===68&&c.args[5]===nav.shaftX-28&&c.args[6]===landing.y-68),'door leaves slide away from the opening')
 scene.actors[0].pose={climb:true,inLift:true}
 const between=recorder();drawOfficeShaft(between.ctx,scene,true,art)
 assert.ok(!between.calls.some(c=>c.op==='drawImage'&&c.args[0]===art.liftCabin&&c.args[7]===14&&c.args[8]===68&&c.args[5]===nav.shaftX-28&&c.args[6]===landing.y-68),'doors close before travel')
})
it('keeps labels inside the recessed lift hidden through ride and doorway crossing',()=>{
 const scene=fixture(),nav=officeNavigation(scene)
 assert.equal(officeInsideLift(scene,{x:nav.shaftX,pose:{climb:true}}),true)
 assert.equal(officeInsideLift(scene,{x:nav.shaftX,pose:{inLift:true,climb:false}}),true)
 assert.equal(officeInsideLift(scene,{x:nav.left+1,pose:{walk:true}}),true)
 assert.equal(officeInsideLift(scene,{x:nav.left-1,pose:{walk:true}}),false)
 assert.equal(officeInsideLift(scene,{x:100,pose:{typing:true}}),false)
})

it('draws one moving cabin at its physical position instead of copies at every stop',()=>{
 const scene=fixture(),nav=officeNavigation(scene),y=(nav.hatch.y+nav.landings[0].y)/2
 const frame={y,doorsOpen:0,moving:true,passengerKeys:['a']}
 const back=recorder();drawOfficeShaft(back.ctx,scene,false,art,false,frame)
 const cabins=back.calls.filter(c=>c.op==='drawImage'&&c.args[0]===art.liftCabin&&c.args.length===5)
 assert.equal(cabins.length,1)
 assert.equal(cabins[0].args[2]+86,y)
 const front=recorder();drawOfficeShaft(front.ctx,scene,true,art,false,frame)
 assert.ok(!front.calls.some(c=>c.op==='fillRect'&&c.args[0]===nav.left&&c.args[1]===nav.top&&c.args[2]>=nav.right-nav.left&&c.args[3]===nav.bottom-nav.top),'front cutaway does not hide the travelling car')
})

it('uses the concept art for Desktop landings and slides the gold leaves clear without moving the frame',()=>{
 const scene=fixture()
 scene.floors=scene.floors.map(floor=>({...floor,desktopArt:true}))
 const nav=officeNavigation(scene),reference={width:243,height:562} as HTMLCanvasElement
 const desktop={...art,referenceLift:reference}
 const closed=recorder(),open=recorder(),moving=recorder()
 drawOfficeShaft(closed.ctx,scene,true,desktop)
 drawOfficeShaft(open.ctx,scene,true,desktop,false,{y:nav.hatch.y,doorsOpen:1,moving:false,passengerKeys:[]})
 drawOfficeShaft(moving.ctx,scene,false,desktop,false,{y:nav.hatch.y+100,doorsOpen:0,moving:true,passengerKeys:[]})
 const crops=(calls:ReturnType<typeof recorder>['calls'])=>calls.filter(call=>call.op==='drawImage'&&call.args[0]===reference)
 const closedCrops=crops(closed.calls),openCrops=crops(open.calls)
 assert.ok(!closedCrops.some(call=>call.args[1]===0&&call.args[2]===0&&call.args[3]===107&&call.args[4]===232),
  'the garden doors must sit in the painted pavilion without covering its trim')
 const frame=(calls:typeof closedCrops)=>calls.filter(call=>call.args[1]===107&&call.args[2]<531&&call.args[3]===136)
 assert.equal(frame(closedCrops).length,2)
 assert.deepEqual(frame(openCrops),frame(closedCrops))
 const middle=frame(closedCrops)[1]
 const threshold=nav.landings[0].y
 const callPlate=closed.calls.find(call=>call.op==='fillRect'&&call.args[1]===threshold-43*nav.scale)
 assert.ok(callPlate&&callPlate.args[0]>=middle.args[5]&&callPlate.args[0]+callPlate.args[2]<=middle.args[5]+25*scene.width/992,'the call plate fits the left jamb')
 assert.ok(middle.args[8]>=76*nav.scale&&middle.args[8]<=80*nav.scale,'the door gives the rider modest headroom')
 const sills=(calls:typeof closedCrops)=>calls.filter(call=>call.args[1]===107&&call.args[2]===531&&call.args[4]===31)
 const [sill]=sills(closedCrops)
 assert.ok(sill,'the stop uses the rounded stone sill from the reference atlas')
 assert.deepEqual(sills(openCrops),sills(closedCrops),'the sill stays fixed while the leaves move')
 assert.ok(Math.abs(sill.args[6]-(middle.args[6]+middle.args[8]))<1e-9,'the stone meets the bottom of the opening')
 assert.ok(sill.args[6]<threshold&&sill.args[6]+sill.args[8]>threshold+8*nav.scale,'the floor extends from the stop into a visible rounded apron')
 const leaves=openCrops.filter(call=>call.args[4]===176)
 assert.ok(leaves.every(call=>Math.abs(call.args[6]+call.args[8]-nav.hatch.y)<1e-9))
 assert.equal(leaves.length,2)
 assert.ok(leaves[0].args[5]+leaves[0].args[7]<nav.shaftX)
 assert.ok(leaves[1].args[5]>nav.shaftX)
 assert.ok(crops(moving.calls).length>0)
 const shaftTiles=crops(moving.calls).filter(call=>call.args[1]===0&&call.args[2]===240)
 assert.equal(shaftTiles.length,1,'the painted shaft is continuous')
 assert.ok(shaftTiles[0].args[6]>nav.hatch.y,'the shaft does not paint over the garden sill')
 assert.ok([...closed.calls,...open.calls,...moving.calls].every(call=>call.args[0]!==art.liftCabin&&call.op!=='fillText'))
})

it('fills the garden panel on both sides of the lamp without painting over the moving doors',()=>{
 for(const width of [240,450,700]){
  const scene=fixture()
  scene.width=width
  scene.floors[0].desktopArt=true
  const nav=officeNavigation(scene),s=nav.scale
  const reference={width:243,height:562} as HTMLCanvasElement
  const desktop={...art,referenceLift:reference}
  const panels=[]
  for(const [doorsOpen,lampOn] of [[0,false],[1,true]] as const){
   const {ctx,calls}=recorder()
   drawOfficeShaft(ctx,scene,true,desktop,false,{y:nav.hatch.y,doorsOpen,moving:false,passengerKeys:[]},lampOn)
   const panel=calls.find(({op,args})=>op==='drawImage'&&args[0]===reference&&
    args[5]<=nav.shaftX-23*s&&args[5]+args[7]>=nav.shaftX+21*s&&args[6]<nav.hatch.y-80*s)
   assert.ok(panel,'the wood and lamp fill the full width above the garden door')
   assert.ok(Math.abs(panel.args[6]+panel.args[8]-(nav.hatch.y-80*s))<1e-9)
   assert.equal(panel.filter,lampOn?'brightness(0.64)':'none','the garden lift joins the night lighting')
   panels.push(panel.args)
  }
  assert.deepEqual(panels[0],panels[1],'the panel is fixed with the lamp off or on')
 }
})
