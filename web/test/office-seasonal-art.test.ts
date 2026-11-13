import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawOfficeSeasonalRooms } from '../components/agent-visualizer/office/office-seasonal-art'
import type { OfficeScene, OfficeFloor } from '../lib/office-types'

function recorder() {
  const calls: {op:string;args:unknown[]}[]=[]
  const state: Record<string,unknown>={}
  const c=new Proxy(state,{get(target,key){
    if(key in target)return target[key as string]
    return (...args:unknown[])=>{calls.push({op:String(key),args})}
  },set(target,key,value){target[key as string]=value;return true}})
  return {c:c as unknown as CanvasRenderingContext2D,calls}
}
const floor=(kind:OfficeFloor['kind'],id:string=kind):OfficeFloor=>({id,kind,sessionId:'s',title:'Room',subtitle:'',color:'#fff',y:250,height:253,actorKeys:[]})
const scene=(floors:OfficeFloor[]):OfficeScene=>({width:450,height:800,floors,actors:[],quietTeams:[],totalAgents:0,finishedCount:0})
it('draws room-specific seasonal and holiday props without touching garden, quiet floors or actor state',()=>{
  const dates=[new Date(2026,2,12,12),new Date(2026,6,12,12),new Date(2026,10,12,12),new Date(2026,0,1,12),new Date(2026,3,13,12),new Date(2026,9,31,12),new Date(2026,11,25,12),new Date(2026,1,14,12),new Date(2026,10,24,12)]
  const variants=new Set<string>()
  for(const date of dates){
    const room=scene([floor('team'),floor('break')]),before=JSON.stringify(room)
    const {c,calls}=recorder();drawOfficeSeasonalRooms(c,room,date,0)
    assert.ok(calls.length>20)
    assert.equal(JSON.stringify(room),before)
    for(const call of calls)for(const arg of call.args)if(typeof arg==='number')assert.ok(Number.isFinite(arg))
    for(const call of calls.filter(c=>c.op==='rect'||c.op==='fillRect'))assert.ok((call.args[2] as number)>=0&&(call.args[3] as number)>=0)
    variants.add(JSON.stringify(calls))
    const skipped=recorder();drawOfficeSeasonalRooms(skipped.c,scene([floor('lounge'),floor('quiet')]),date,2)
    assert.equal(skipped.calls.length,0)
  }
  assert.equal(variants.size,dates.length)
})
it('keeps placement stable and makes motion optional',()=>{
  const room=scene([floor('team','alpha'),floor('break','beta')]),date=new Date(2026,3,10,12)
  const a=recorder(),b=recorder(),animated=recorder()
  drawOfficeSeasonalRooms(a.c,room,date,0);drawOfficeSeasonalRooms(b.c,room,date,0);drawOfficeSeasonalRooms(animated.c,room,date,1)
  assert.deepEqual(a.calls,b.calls)
  assert.notDeepEqual(a.calls,animated.calls)
  for(const call of a.calls.filter(c=>c.op==='translate'))assert.ok((call.args[0] as number)<450*.88)
})
it('places the interactive lounge prop at the shared left corner in both ordinary and holiday rooms',()=>{
  for(const date of [new Date(2026,4,1,12),new Date(2026,11,25,12)]){
    const {c,calls}=recorder();drawOfficeSeasonalRooms(c,scene([floor('break')]),date,0)
    assert.ok(calls.some(call=>call.op==='translate'&&call.args[0]===450*.12&&call.args[1]===250+253*.74))
  }
})
