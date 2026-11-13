import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawOfficeInteriorDoors } from '../components/agent-visualizer/office/office-door-art'
import type { OfficeFloor, OfficeScene } from '../lib/office-types'
const floor=(id:string,annexOf?:string):OfficeFloor=>({id,annexOf,kind:annexOf?'break':'team',sessionId:'s',title:id,subtitle:'',color:'#fff',y:250,height:250,actorKeys:[]})
function draw(floors:OfficeFloor[],open:string|null=null){
 const calls:{op:string,args:unknown[]}[]=[],state:Record<string,unknown>={}
 const ctx=new Proxy(state,{get(t,k){if(k in t)return t[k as string];return(...args:unknown[])=>calls.push({op:String(k),args})},set(t,k,v){t[k as string]=v;return true}})
 const scene:OfficeScene={width:450,height:700,floors,actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 drawOfficeInteriorDoors(ctx as unknown as CanvasRenderingContext2D,scene,open)
 return calls
}
it('draws one shared doorway in the public room and a back door in the private view',()=>{
 const publicCalls=draw([floor('main'),floor('rest','main')]),privateCalls=draw([floor('rest','main')])
 assert.equal(publicCalls.filter(c=>c.op==='translate').length,1)
 assert.equal(privateCalls.filter(c=>c.op==='translate').length,1)
 assert.ok(publicCalls.some(c=>c.op==='fillText'&&c.args[0]==='REST'))
 assert.ok(privateCalls.some(c=>c.op==='fillText'&&c.args[0]==='WORK'))
 assert.notDeepEqual(draw([floor('main'),floor('rest','main')],'rest'),publicCalls)
 for(const call of publicCalls)for(const value of call.args)if(typeof value==='number')assert.ok(Number.isFinite(value))
 assert.equal(draw([{...floor('main'),constructing:true},floor('rest','main')]).length,0)
 assert.equal(draw([{...floor('main'),height:20},floor('rest','main')]).length,0)
})
it('leaves a visible gap between the doorway frame and the public shaft',()=>{
 const calls=draw([floor('main'),floor('rest','main')])
 const tx=calls.find(c=>c.op==='translate')!.args[0] as number
 const sx=calls.find(c=>c.op==='scale')!.args[0] as number
 const right=tx+Math.max(...calls.filter(c=>c.op==='fillRect').map(c=>(c.args[0] as number)+(c.args[2] as number)))*sx
 assert.ok(450*.938-22-right>=4)
})
