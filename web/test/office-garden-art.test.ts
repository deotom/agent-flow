import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawOfficeGarden } from '../components/agent-visualizer/office/office-garden-art'
import type { OfficeScene, OfficeFloor } from '../lib/office-types'

function recorder(){
  const calls:{op:string;args:unknown[]}[]=[],state:Record<string,unknown>={},sets:{key:string;value:unknown}[]=[]
  const c=new Proxy(state,{get(t,k){if(k in t)return t[k as string];return (...args:unknown[])=>{calls.push({op:String(k),args})}},set(t,k,v){sets.push({key:String(k),value:v});t[k as string]=v;return true}})
  return {c:c as unknown as CanvasRenderingContext2D,calls,sets}
}
const floor=(kind:OfficeFloor['kind']):OfficeFloor=>({id:kind,kind,sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:0,height:280,actorKeys:[]})
const scene=(kind:OfficeFloor['kind']='lounge'):OfficeScene=>({width:450,height:800,floors:[floor(kind)],actors:[],quietTeams:[],totalAgents:0,finishedCount:0})
it('draws distinct Thai seasonal flora and small animals confined to garden grass margins',()=>{
  const variants=new Set<string>()
  for(const date of [new Date(2026,3,12),new Date(2026,6,12),new Date(2026,10,12)]){
    const input=scene(),before=JSON.stringify(input),r=recorder()
    drawOfficeGarden(r.c,input,date,0)
    assert.equal(JSON.stringify(input),before)
    assert.ok(r.calls.length>50)
    for(const call of r.calls)for(const arg of call.args)if(typeof arg==='number')assert.ok(Number.isFinite(arg))
    const anchors=r.calls.filter(c=>c.op==='translate')
    assert.ok(anchors.length>=4)
    for(const {args} of anchors){
      const x=args[0] as number,y=args[1] as number
      assert.ok(x>=450*.025&&x<=450*.81)
      assert.ok(y>=280*.61&&y<=280*.755)
      assert.ok(x<450*.3||x>450*.6,'keeps the picnic furniture clear')
    }
    variants.add(JSON.stringify(r.calls))
  }
  assert.equal(variants.size,3)
})
it('dims plants and wildlife at night without adding artificial light',()=>{
  const day=recorder(),night=recorder()
  drawOfficeGarden(day.c,scene(),new Date(2026,10,12,12),0)
  drawOfficeGarden(night.c,scene(),new Date(2026,10,12,22),0)
  assert.ok(day.sets.some(set=>set.key==='globalAlpha'&&set.value===1))
  assert.ok(night.sets.some(set=>set.key==='globalAlpha'&&set.value===.7))
})
it('is stable for the same local day, animates optionally and skips every indoor floor',()=>{
  const date=new Date(2026,6,12),a=recorder(),b=recorder(),moving=recorder()
  drawOfficeGarden(a.c,scene(),date,0);drawOfficeGarden(b.c,scene(),date,0);drawOfficeGarden(moving.c,scene(),date,2)
  assert.deepEqual(a.calls,b.calls)
  assert.notDeepEqual(a.calls,moving.calls)
  for(const kind of ['team','break','quiet'] as const){const r=recorder();drawOfficeGarden(r.c,scene(kind),date,2);assert.equal(r.calls.length,0)}
})
