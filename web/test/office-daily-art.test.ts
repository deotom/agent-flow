import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeDailyArt,drawOfficeDailyEatingTrays,type OfficeDailyVisualState} from '../components/agent-visualizer/office/office-daily-art'
import type {OfficeRoomArt} from '../components/agent-visualizer/office/office-room-design-art'
import type {OfficeActor,OfficeFloor,OfficeScene} from '../lib/office-types'
import {skyWeather} from '../lib/office-sky'
const surface:OfficeFloor={id:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#abc',y:0,height:253,actorKeys:[],kind:'lounge'}
const canteen:OfficeFloor={...surface,id:'daily-canteen',y:253,room:'room-canteen',kind:'break'}
const art={shell:{width:1000,height:563},props:{width:1536,height:1024},breakRoom:{width:1000,height:563}} as unknown as OfficeRoomArt
function render(hour:number,minute:number,state:OfficeDailyVisualState={},floors=[surface],date=new Date(2026,10,14,hour,minute)){
 const calls:unknown[][]=[]
 const ctx={drawImage:(...args:unknown[])=>calls.push(args),save(){},restore(){},fillRect(){}} as unknown as CanvasRenderingContext2D
 const scene:OfficeScene={width:450,height:800,floors,actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 drawOfficeDailyArt(ctx,scene,date,state,art)
 return calls
}
it('delivery, buffet and tray return use different painted props at their local stage boundaries',()=>{
 const delivery=render(11,50,{weather:'clear'}),meal=render(12,15,{weather:'clear'}),cleanup=render(12,45,{weather:'clear'})
 assert.ok(delivery.length>0);assert.ok(meal.length>0);assert.ok(cleanup.length>0)
 assert.notDeepEqual(delivery,meal)
 assert.notDeepEqual(cleanup,meal)
 assert.equal(render(11,49,{weather:'clear'}).length,0)
 assert.equal(render(13,0,{weather:'clear'}).length,0)
 assert.deepEqual(render(11,30,{delivered:true,weather:'clear'}),delivery)
 assert.deepEqual(render(12,15,{cleanup:true,weather:'clear'}),cleanup)
})
it('rain and storm keep food indoors, including the scene-derived weather fallback',()=>{
 for(const weather of ['rain','storm'] as const){
  assert.equal(render(12,15,{weather}).length,0)
  const indoors=render(12,15,{weather},[surface,canteen])
  assert.ok(indoors.length>5)
  assert.ok(indoors.every(call=>Number(call[6])>=canteen.y),'all painted food stays below the garden')
 }
 const rainyDate=Array.from({length:100},(_,i)=>new Date(2026,8,1+i,12,15)).find(date=>['rain','storm'].includes(skyWeather(date)))!
 assert.ok(rainyDate)
 assert.equal(render(12,15,{},[surface],rainyDate).length,0)
})
it('coffee and tea guests never start the outdoor lunch buffet',()=>{
 assert.equal(render(8,45,{kind:'coffee',eatingKeys:new Set(['coffee-guest']),weather:'clear'}).length,0)
 assert.equal(render(15,15,{kind:'tea',eatingKeys:new Set(['tea-guest']),weather:'clear'}).length,0)
})
it('cleanup removes open food from dining tables but retains the four seats and return trays',()=>{
 const meal=render(12,15,{weather:'rain'},[canteen]),cleanup=render(12,45,{weather:'rain'},[canteen])
 const tableFood=(calls:unknown[][])=>calls.filter(call=>call[0]===art.props&&call[3]===512*.55&&call[4]===512*.15&&Number(call[7])===450*.13)
 assert.equal(tableFood(meal).length,2)
 assert.equal(tableFood(cleanup).length,0)
 const chairs=(calls:unknown[][])=>calls.filter(call=>call[0]===art.props&&Number(call[7])===450*.092)
 assert.equal(chairs(meal).length,4);assert.equal(chairs(cleanup).length,4)
 assert.notDeepEqual(meal,cleanup)
})
it('keeps Desktop clear-lunch cues on the café counter without covering the tree or break bookshelf',()=>{
 const desktopSurface:OfficeFloor={...surface,desktopArt:true}
 const desktopBreak:OfficeFloor={...canteen,id:'break-team',room:'room-break-reading',annexOf:'team',desktopArt:true}
 const lunch=render(12,15,{weather:'clear'},[desktopSurface,desktopBreak])
 assert.ok(lunch.some(call=>Number(call[5])>=450*.52&&Number(call[5])<=450*.64),'compact Desktop meal cue sits on the café counter')
 assert.ok(!lunch.some(call=>Number(call[5])<450*.25&&Number(call[7])>=450*.15),'no legacy buffet covers the painted tree and bench')
 const coffee=render(9,0,{kind:'coffee',weather:'clear'},[desktopSurface,desktopBreak])
 assert.ok(!coffee.some(call=>Number(call[6])>=desktopBreak.y&&Number(call[5])<450*.2),'no legacy thermos covers the painted break-room bookshelf')
})
it('draws eating trays with depth scaling and skips hidden or lifted diners, while paintTrays:false keeps buffet meal cue only',()=>{
 const diner={key:'diner',floorId:'lounge',x:180,y:160,hidden:false,pose:{}} as OfficeActor
 const hidden={key:'hidden',floorId:'lounge',x:210,y:160,hidden:true,pose:{}} as OfficeActor
 const inLift={key:'lifted',floorId:'lounge',x:240,y:160,hidden:false,pose:{inLift:true}} as OfficeActor
 const calls:unknown[][]=[]
 const ctx={drawImage:(...args:unknown[])=>calls.push(args),save(){},restore(){},fillRect(){}} as unknown as CanvasRenderingContext2D
 const sc:OfficeScene={width:450,height:800,floors:[surface],actors:[diner,hidden,inLift],quietTeams:[],totalAgents:3,finishedCount:0}
 drawOfficeDailyEatingTrays(ctx,sc,new Set(['diner','hidden','lifted']),art,()=>0.6)
 assert.equal(calls.length,1)
 assert.ok(Math.abs(Number(calls[0][7])-26*0.6)<1e-6&&Math.abs(Number(calls[0][8])-9.5*0.6)<1e-6)
 calls.length=0
 drawOfficeDailyArt(ctx,sc,new Date(2026,10,14,10,0),{weather:'clear',eatingKeys:new Set(['diner']),paintTrays:false},art)
 assert.ok(calls.length>0&&!calls.some(call=>Number(call[5])===180-13))
})
