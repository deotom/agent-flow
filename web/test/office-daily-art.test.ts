import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeDailyArt,type OfficeDailyVisualState} from '../components/agent-visualizer/office/office-daily-art'
import type {OfficeRoomArt} from '../components/agent-visualizer/office/office-room-design-art'
import type {OfficeFloor,OfficeScene} from '../lib/office-types'
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
