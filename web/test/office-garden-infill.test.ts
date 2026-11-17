import assert from 'node:assert/strict'
import test from 'node:test'
import {drawOfficeGardenInfill} from '../lib/office-garden-infill'

test('reuses a nearby lawn sample only within the retired hatch, with feathered opacity',()=>{
 const calls:{name:string;args:unknown[]}[]=[],alphas:number[]=[]
 const c=new Proxy({globalAlpha:1},{get(target,key){if(key in target)return target[key as keyof typeof target];return (...args:unknown[])=>calls.push({name:String(key),args})},set(target,key,value){if(key==='globalAlpha')alphas.push(value);Reflect.set(target,key,value);return true}}) as unknown as CanvasRenderingContext2D
 const image={width:1000,height:563} as CanvasImageSource
 drawOfficeGardenInfill(c,image,450,253.35)
 const draws=calls.filter(call=>call.name==='drawImage')
 assert.ok(draws.length>=6&&draws.length<=16)
 assert.equal(new Set(draws.map(call=>JSON.stringify(call.args.slice(1)))).size,1)
 for(const {args} of draws){
  assert.equal(args[0],image)
  const [sx,sy,sw,sh,x,y,w,h]=args.slice(1) as number[]
  assert.ok(sx>=530&&sx+sw<=730&&sy>=350&&sy+sh<=420)
  assert.ok(x>=450*.82&&x+w<=450&&y>=253.35*.49&&y+h<253.35*.77)
  assert.ok(Math.abs(sw/sh-w/h)<1e-9,'flowers and grass preserve their source aspect ratio')
 }
 assert.ok(alphas[0]>0&&alphas[0]<.2)
 assert.equal(alphas.at(-1),1)
 assert.equal(calls[0].name,'save');assert.equal(calls.at(-1)?.name,'restore')
})
test('can retire the hatch on a canvas without roundRect support',()=>{
 let rectangles=0
 const c=new Proxy({roundRect:undefined,rect(){rectangles++}} as Record<string,unknown>,{get:(t,k)=>k in t?t[String(k)]:()=>{},set(t,k,v){t[String(k)]=v;return true}}) as unknown as CanvasRenderingContext2D
 drawOfficeGardenInfill(c,{width:1000,height:563} as CanvasImageSource,450,253.125)
 assert.ok(rectangles>0)
})
test('skips invalid or not-yet-decoded images and dimensions',()=>{
 let called=false
 const c=new Proxy({},{get(){return ()=>{called=true}}}) as unknown as CanvasRenderingContext2D
 for(const [width,height] of [[0,260],[450,0],[-1,260],[Number.NaN,260]])drawOfficeGardenInfill(c,{width:1000,height:563} as CanvasImageSource,width,height)
 drawOfficeGardenInfill(c,{width:0,height:0} as CanvasImageSource,450,260)
 assert.equal(called,false)
})
