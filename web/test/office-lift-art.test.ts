import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeDoorBounds,officeInteriorDoor,officeNavigation,officeInsideLift} from '../lib/office-navigation'
import {drawOfficeInteriorDoors} from '../components/agent-visualizer/office/office-door-art'
import {drawOfficeShaft} from '../components/agent-visualizer/office/office-shaft-art'
import type {OfficeArchitectureArt,OfficeScene} from '../lib/office-types'
const fixture=():OfficeScene=>({width:450,height:800,actors:[],quietTeams:[],totalAgents:0,finishedCount:0,floors:[
 {id:'surface',kind:'lounge',sessionId:null,title:'',subtitle:'',color:'',y:0,height:250,actorKeys:[]},
 {id:'main',kind:'team',sessionId:'s',title:'',subtitle:'',color:'',y:250,height:250,actorKeys:['a']},
 {id:'rest',annexOf:'main',kind:'break',sessionId:'s',title:'',subtitle:'',color:'',y:250,height:250,actorKeys:[]}]})
function recorder(){const calls:{op:string,args:any[]}[]=[];const ctx=new Proxy({} as Record<string,unknown>,{get(t,k){if(k in t)return t[k as string];return(...args:any[])=>{calls.push({op:String(k),args})}},set(t,k,v){t[k as string]=v;return true}});return {ctx:ctx as unknown as CanvasRenderingContext2D,calls}}
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
it('shares a flush back-wall doorway between main and private views',()=>{
 const scene=fixture(),point={x:450*.825,y:410}
 assert.deepEqual(officeInteriorDoor(scene,'main'),point);assert.deepEqual(officeInteriorDoor(scene,'rest'),point)
 assert.deepEqual(officeInteriorDoor({...scene,floors:[scene.floors[2]]},'rest'),point)
 const bounds=officeDoorBounds(scene,'main')!;assert.ok(bounds.x+bounds.width<officeNavigation(scene).left)
 const {ctx,calls}=recorder();drawOfficeInteriorDoors(ctx,scene,'rest',art)
 assert.ok(calls.some(c=>c.op==='drawImage'&&c.args[0]===art.doorOpen))
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
