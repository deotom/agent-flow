import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeStation} from '../components/agent-visualizer/office/office-station-art'
import {drawOfficeFrame} from '../components/agent-visualizer/office/office-art'
import {roomStationLayout} from '../lib/office-room-design'
import {officeAppearance} from '../lib/office-model'
import type {OfficeActor,OfficePaintOptions,OfficeScene} from '../lib/office-types'
const record=()=>{
 const calls:{op:string;args:unknown[]}[]=[]
 const c=new Proxy({globalAlpha:1} as Record<string,unknown>,{get:(t,k)=>k in t?t[String(k)]:(...args:unknown[])=>calls.push({op:String(k),args}),set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D
 return{c,calls}
}
const art={shell:{},props:{},breakRoom:{},stations:{id:'front'},stationAngles:{id:'angles'}} as unknown as NonNullable<OfficePaintOptions['roomArt']>
const floor={id:'work',sessionId:'s',kind:'team' as const,room:'room-stations' as const,title:'Design studio',subtitle:'',color:'#aaa',y:0,height:253.125,actorKeys:[]}
it('uses actual alternate-view sprites, preserving aspect and grounding every orientation',()=>{
 const station=roomStationLayout(floor,450)[0]
 for(const facing of ['front','left','right'] as const){
  const {c,calls}=record();drawOfficeStation(c,{...station,facing},art)
  const image=calls.find(call=>call.op==='drawImage')!
  assert.ok(image)
  assert.equal(image.args[0],facing==='front'?art.stations:art.stationAngles)
  const [,,,,,x,y,w,h]=image.args as number[]
  assert.ok(Math.abs(y+h-station.y)<.001)
  assert.ok(w>0&&h>0&&x+w<450*.82)
  assert.ok(!calls.some(call=>call.op==='rotate'||call.op==='transform'),'views must not be faked by rotating or shearing a flat sprite')
 }
})
it('interleaves equipment and people by floor depth so a walker can pass behind a bench',()=>{
 const stations=roomStationLayout(floor,450),ordered=stations.toSorted((a,b)=>a.y-b.y),y=(ordered[0].y+ordered.at(-1)!.y)/2
 const actor={key:'walker',sessionId:'s',floorId:'work',x:110,y,appearance:officeAppearance(0),zone:'desk',agent:{id:'a',status:'running',role:'worker',activities:[]},pose:{walk:true,gait:1,walkWeight:1}} as unknown as OfficeActor
 const scene={width:450,height:253.125,floors:[floor],actors:[actor],quietTeams:[],totalAgents:1,finishedCount:0} as OfficeScene
 const options={time:1,date:new Date(2026,0,1,12),now:1,live:true,motion:true,pets:[],selectedKey:null,roomArt:art} as OfficePaintOptions
 const {c,calls}=record();drawOfficeFrame(c,scene,options)
 const person=calls.findIndex(call=>call.op==='translate'&&call.args[0]===actor.x&&call.args[1]===actor.y)
 const benches=calls.map((call,index)=>({call,index})).filter(({call})=>call.op==='drawImage'&&(call.args[0]===art.stations||call.args[0]===art.stationAngles))
 assert.equal(benches.length,4)
 assert.ok(benches.some(bench=>bench.index<person)&&benches.some(bench=>bench.index>person))
 for(const [i,bench] of benches.entries())assert.equal(bench.index<person,ordered[i].y<actor.y)
 assert.ok(benches.every(({call})=>call.args.slice(1).every(v=>typeof v!=='number'||Number.isFinite(v))))
})
