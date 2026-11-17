import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeStation} from '../components/agent-visualizer/office/office-station-art'
import type {OfficeRoomStation} from '../lib/office-room-design'
import type {OfficeRoomArt} from '../components/agent-visualizer/office/office-room-design-art'

function context(){
 const images:unknown[][]=[],state:Record<string,unknown>={globalAlpha:1,filter:'none',globalCompositeOperation:'source-over',getTransform:()=>({a:2,b:0,c:0,d:2}),drawImage:(...args:unknown[])=>images.push(args)}
 const stack:Record<string,unknown>[]=[]
 state.save=()=>stack.push({...state})
 state.restore=()=>{const saved=stack.pop();if(saved){for(const key of Object.keys(state))if(!(key in saved))delete state[key];Object.assign(state,saved)}}
 return {images,state,c:new Proxy(state,{get(t,k){return k in t?t[String(k)]:()=>{}},set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D}
}
const station:OfficeRoomStation={kind:'terminal',facing:'front',x:100,y:150,width:68,height:68,depth:.5,work:{x:110,y:154}}
it('reuses an idle station raster while keeping live work, new status and moved placement correct',()=>{
 const previous=globalThis.OffscreenCanvas,created:unknown[]=[]
 globalThis.OffscreenCanvas=class {width:number;height:number;constructor(w:number,h:number){this.width=w;this.height=h;created.push(this)}getContext(){return context().c}} as unknown as typeof OffscreenCanvas
 try{
  const r=context(),source={tag:'front'},art={stations:source} as unknown as OfficeRoomArt
  drawOfficeStation(r.c,station,art,{state:'idle',time:1,animate:true})
  drawOfficeStation(r.c,station,art,{state:'idle',time:2,animate:true})
  assert.equal(created.length,1,'static station is painted once')
  assert.equal(r.images[0][0],r.images[1][0],'the same raster is reused')
  drawOfficeStation(r.c,{...station,x:130,y:170},art,{state:'idle',time:3,animate:true})
  assert.equal(created.length,1,'movement uses the same pixels at the new position')
  assert.equal(Number(r.images[2][1])-Number(r.images[1][1]),30)
  assert.equal(Number(r.images[2][2])-Number(r.images[1][2]),20)
  drawOfficeStation(r.c,station,art,{state:'working',time:3,animate:true})
  assert.equal(r.images.at(-1)?.[0],source,'working devices remain live')
  drawOfficeStation(r.c,station,art,{state:'waiting',time:3,animate:true})
  assert.equal(created.length,2,'new state gets its correct appearance')
  drawOfficeStation(r.c,station,{stations:{tag:'replacement'}} as unknown as OfficeRoomArt,{state:'waiting',time:3,animate:true})
  assert.equal(created.length,3,'replacement art cannot reuse stale pixels')
  r.state.globalAlpha=.4
  drawOfficeStation(r.c,station,art,{state:'idle',time:3,animate:true})
  assert.equal(r.images.at(-1)?.[0],source,'faded parents use direct compositing')
  r.state.globalAlpha=1
  drawOfficeStation(r.c,{...station,x:100.125,y:150.375},art,{state:'idle',time:3,animate:true})
  assert.equal(Number(r.images.at(-1)?.[1])*2%1,0,'raster blit aligns to device pixels')
  assert.equal(Number(r.images.at(-1)?.[2])*2%1,0,'fractional placement is baked into the raster')
 }finally{globalThis.OffscreenCanvas=previous}
})
it('evicts old layers while retaining recently used layers at the entry limit',()=>{
 const previous=globalThis.OffscreenCanvas;let created=0
 globalThis.OffscreenCanvas=class {width:number;height:number;constructor(w:number,h:number){this.width=w;this.height=h;created++}getContext(){return context().c}} as unknown as typeof OffscreenCanvas
 try{
  const r=context(),art={stations:{tag:'entry-limit'}} as unknown as OfficeRoomArt
  const draw=(i:number)=>drawOfficeStation(r.c,{...station,depth:i/100},art,{state:'idle',time:0,animate:false})
  for(let i=0;i<40;i++)draw(i)
  const warmed=created;draw(39)
  assert.equal(created,warmed,'most recently used layer is retained')
  draw(0);assert.equal(created,warmed+1,'oldest layer was evicted instead of growing forever')
 }finally{globalThis.OffscreenCanvas=previous}
})
it('enforces the pixel budget before the entry limit and directly paints oversized rasters',()=>{
 const previous=globalThis.OffscreenCanvas;let created=0
 globalThis.OffscreenCanvas=class {width:number;height:number;constructor(w:number,h:number){this.width=w;this.height=h;created++}getContext(){return context().c}} as unknown as typeof OffscreenCanvas
 try{
  const r=context(),source={tag:'pixel-limit'},art={stations:source} as unknown as OfficeRoomArt
  const draw=(i:number)=>drawOfficeStation(r.c,{...station,width:200,height:200,depth:i/1000},art,{state:'idle',time:0,animate:false})
  for(let i=0;i<12;i++)draw(i)
  const warmed=created;draw(11);assert.equal(created,warmed)
  draw(0);assert.equal(created,warmed+1,'pixel cap evicts even with fewer than 32 keys')
  const before=created
  drawOfficeStation(r.c,{...station,width:1000,height:1000},art,{state:'idle',time:0,animate:false})
  assert.equal(created,before,'oversized layer does not allocate a raster')
  assert.equal(r.images.at(-1)?.[0],source)
 }finally{globalThis.OffscreenCanvas=previous}
})
it('paints directly when OffscreenCanvas is unavailable',()=>{
 const previous=globalThis.OffscreenCanvas
 globalThis.OffscreenCanvas=undefined as unknown as typeof OffscreenCanvas
 try{
  const r=context(),source={tag:'direct-fallback'}
  drawOfficeStation(r.c,station,{stations:source} as unknown as OfficeRoomArt,{state:'idle',time:0,animate:false})
  assert.equal(r.images.at(-1)?.[0],source)
 }finally{globalThis.OffscreenCanvas=previous}
})
