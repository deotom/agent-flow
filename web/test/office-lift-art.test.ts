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
const art={doorClosed:{id:'closed'},doorOpen:{id:'open'},liftCabin:{id:'cabin'},liftShaft:{id:'shaft'}} as unknown as OfficeArchitectureArt
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
 assert.equal(calls.filter(c=>c.op==='fillText'&&c.args[0]==='↕').length,nav.landings.length+1)
 assert.ok(nav.top>nav.hatch.y,'shaft starts below the grass threshold')
 for(const c of calls)for(const v of c.args)if(typeof v==='number')assert.ok(Number.isFinite(v))
})
it('reveals cabin interiors through open landing doors and hides between-floor travel',()=>{
 const scene=fixture(),nav=officeNavigation(scene),landing=nav.landings[0]
 scene.actors=[{key:'a',floorId:'main',x:nav.shaftX,y:landing.y,pose:{climb:true}} as OfficeScene['actors'][number]]
 const back=recorder();drawOfficeShaft(back.ctx,scene,false,art)
 assert.ok(back.calls.some(c=>c.op==='drawImage'&&c.args[0]===art.liftCabin))
 const front=recorder();drawOfficeShaft(front.ctx,scene,true,art)
 assert.ok(front.calls.filter(c=>c.op==='clip'&&c.args[0]==='evenodd').length>=nav.landings.length+2,'painted frames leave cabin apertures clear')
 assert.ok(front.calls.some(c=>c.op==='rect'&&c.args[2]>30&&c.args[3]===78))
 scene.actors[0].pose={climb:true,inLift:true}
 const between=recorder();drawOfficeShaft(between.ctx,scene,true,art)
 assert.ok(!between.calls.some(c=>c.op==='rect'&&c.args[2]>30&&c.args[3]===78))
})
it('keeps labels inside the recessed lift hidden through ride and doorway crossing',()=>{
 const scene=fixture(),nav=officeNavigation(scene)
 assert.equal(officeInsideLift(scene,{x:nav.shaftX,pose:{climb:true}}),true)
 assert.equal(officeInsideLift(scene,{x:nav.left+1,pose:{walk:true}}),true)
 assert.equal(officeInsideLift(scene,{x:nav.left-1,pose:{walk:true}}),false)
 assert.equal(officeInsideLift(scene,{x:100,pose:{typing:true}}),false)
})
