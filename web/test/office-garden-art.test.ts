import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawOfficeGarden, drawOfficeGardenActorShadow, drawOfficeHolidayGarden } from '../components/agent-visualizer/office/office-garden-art'
import { officeDaylight } from '../lib/office-daylight'
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
  for(const date of [new Date(2026,3,12,12),new Date(2026,6,12,12),new Date(2026,10,12,12)]){
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
it('dims the garden wildlife layer at night',()=>{
  const day=recorder(),night=recorder()
  drawOfficeGarden(day.c,scene(),new Date(2026,10,12,12),0)
  drawOfficeGarden(night.c,scene(),new Date(2026,10,12,22),0)
  assert.ok(day.sets.some(set=>set.key==='globalAlpha'&&set.value===1))
  assert.ok(night.sets.some(set=>set.key==='globalAlpha'&&set.value===.7))
})
it('keeps the character contact at the feet and moves the solar shadow across the ground',()=>{
  const shadows=(hour:number)=>{
    const r=recorder()
    drawOfficeGardenActorShadow(r.c,officeDaylight(new Date(2026,10,12,hour)))
    return r.calls.filter(call=>call.op==='ellipse').map(call=>call.args)
  }
  const morning=shadows(8),evening=shadows(16),night=shadows(22)
  assert.ok(Number(morning[0][0])>0&&Number(evening[0][0])<0)
  assert.deepEqual(morning.at(-1)?.slice(0,2),[0,1])
  assert.deepEqual(evening.at(-1)?.slice(0,2),[0,1])
  assert.equal(night.length,1,'only the soft contact shadow remains after dark')
})
it('is stable for the same local day, animates optionally and skips every indoor floor',()=>{
  const date=new Date(2026,6,12),a=recorder(),b=recorder(),moving=recorder()
  drawOfficeGarden(a.c,scene(),date,0);drawOfficeGarden(b.c,scene(),date,0);drawOfficeGarden(moving.c,scene(),date,2)
  assert.deepEqual(a.calls,b.calls)
  assert.notDeepEqual(a.calls,moving.calls)
  for(const kind of ['team','break','quiet'] as const){const r=recorder();drawOfficeGarden(r.c,scene(kind),date,2);assert.equal(r.calls.length,0)}
})

it('renders distinct holiday garden decor left of the lift across all 6 holidays and skips non-holidays and indoor floors',()=>{
  const nonHoliday=new Date(2026,10,12,12)
  const plain=recorder(),sc=scene()
  const before=structuredClone(sc)
  drawOfficeHolidayGarden(plain.c,sc,nonHoliday,1)
  assert.equal(plain.calls.length,0)
  assert.deepEqual(sc,before)
  const holidayDates=[
    new Date(2026,10,24,19), // loy-krathong
    new Date(2026,3,14,12),  // songkran
    new Date(2026,11,25,12), // christmas
    new Date(2026,9,31,19),  // halloween
    new Date(2027,0,1,20),   // new-year
    new Date(2026,1,14,12),  // valentine
  ]
  const rendered:unknown[][]=[]
  for(const d of holidayDates){
    const r=recorder()
    drawOfficeHolidayGarden(r.c,sc,d,1)
    assert.ok(r.calls.length>0,`holiday garden paints decor for ${d.toISOString()}`)
    const xs=r.calls.filter(c=>c.op==='translate'||c.op==='fillRect'||c.op==='ellipse'||c.op==='moveTo'||c.op==='lineTo').map(c=>Number(c.args[0])).filter(Number.isFinite)
    assert.ok(xs.every(x=>x<sc.width*.80),`holiday garden stays clear of Desktop lift (max x=${Math.max(...xs)})`)
    for(const prev of rendered) assert.notDeepEqual(r.calls,prev)
    rendered.push(r.calls)
    for(const kind of ['team','break','quiet'] as const){
      const indoor=recorder()
      drawOfficeHolidayGarden(indoor.c,scene(kind),d,1)
      assert.equal(indoor.calls.length,0)
    }
  }
})
