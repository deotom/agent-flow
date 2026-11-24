import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeWardrobeTheme, officeWardrobeFor } from '../lib/office-wardrobe'
import { drawOfficeWardrobe } from '../components/agent-visualizer/office/office-wardrobe-art'
import type { OfficeAppearance } from '../lib/office-types'

const appearance:OfficeAppearance={slot:7,kind:'human',hair:'#352b29',skin:'#c88c64',shirt:'#aa533b',pants:'#263949',cut:'curly',gear:'headset',outfit:'overalls',face:'square'}
function recorder(){
  const paths:number[][]=[],fills:string[]=[]
  const state:Record<string,unknown>={}
  const c=new Proxy(state,{get(target,key){if(key in target)return target[String(key)];return (...args:unknown[])=>{if(['moveTo','lineTo','fillRect','ellipse'].includes(String(key)))paths.push(args as number[]);if(key==='fill'||key==='fillRect')fills.push(String(target.fillStyle))}},set(target,key,value){target[String(key)]=value;return true}})
  return {c:c as unknown as CanvasRenderingContext2D,paths,fills}
}
it('uses Thai calendar boundaries and preserves the existing holiday calendar',()=>{
  for(const [month,day,season] of [[1,28,'cool'],[2,1,'hot'],[4,31,'hot'],[5,1,'rainy'],[9,31,'rainy'],[10,1,'cool']] as const){
    assert.equal(officeWardrobeTheme(new Date(2026,month,day,12)).season,season)
  }
  assert.equal(officeWardrobeTheme(new Date(2026,3,13,12)).holiday,'songkran')
  assert.equal(officeWardrobeTheme(new Date(2026,11,25,12)).holiday,'christmas')
})
it('keeps indoor rainy dress light and adds actual shoulder protection outdoors',()=>{
  const theme=officeWardrobeTheme(new Date(2026,6,12,12))
  assert.equal(officeWardrobeFor(theme,7,false).layer,'cardigan')
  assert.equal(officeWardrobeFor(theme,7,true).layer,'rain-poncho')
  assert.equal(officeWardrobeFor(officeWardrobeTheme(new Date(2026,3,1,12)),7,false).layer,'light')
  assert.equal(officeWardrobeFor(officeWardrobeTheme(new Date(2026,10,1,12)),7,false).layer,'knit')
  assert.deepEqual(officeWardrobeFor(theme,7,true),officeWardrobeFor(theme,7,true))
  assert.equal(officeWardrobeFor(theme,7,false).outdoor,false)
  assert.equal(officeWardrobeFor(theme,7,true).outdoor,true)
  assert.notEqual(officeWardrobeFor(theme,7,true).accent,officeWardrobeFor(theme,8,true).accent)
  assert.ok(Number.isFinite(officeWardrobeFor(theme,NaN,true).variant))
})
it('draws distinct torso layers without changing identity, head, hands or the chest logo reserve',()=>{
  const signatures=new Set<string>(),before=JSON.stringify(appearance)
  for(const date of [new Date(2026,3,1,12),new Date(2026,6,12,12),new Date(2026,10,1,12),new Date(2026,11,25,12)])for(const outdoor of [false,true])for(const back of [false,true]){
    const {c,paths,fills}=recorder()
    drawOfficeWardrobe(c,appearance,officeWardrobeFor(officeWardrobeTheme(date),appearance.slot,outdoor),back)
    assert.ok(paths.length>0)
    for(const values of paths){for(const value of values)assert.ok(Number.isFinite(value));const [x,y]=values;assert.ok(x>=-22&&x<=22&&y>=-38&&y<=-10);assert.ok(!(x>-9&&x<10&&y>-29&&y<-12),'keeps logo centre free')}
    assert.equal(JSON.stringify(appearance),before)
    signatures.add(JSON.stringify({paths,fills}))
  }
  assert.ok(signatures.size>=5)
})
it('dresses painted garments with compact collar and chest accents instead of side strips',()=>{
  const signatures=new Set<string>()
  const dates=[new Date(2026,3,1,12),new Date(2026,6,12,12),new Date(2026,10,1,12),new Date(2026,11,25,12)]
  for(const date of dates)for(const outdoor of [false,true])for(const [back,fit] of [[false,undefined],[true,undefined],[false,{width:.75,profile:true}]] as const){
    const look=officeWardrobeFor(officeWardrobeTheme(date),appearance.slot,outdoor)
    const {c,paths,fills}=recorder()
    drawOfficeWardrobe(c,appearance,look,back,true,fit)
    if(!back||look.layer!=='light'||look.holiday)assert.ok(paths.length>0,`${look.layer} shows on the painted torso`)
    const ys=paths.map(([,y])=>y),xs=paths.map(([x])=>x)
    if(paths.length){
      assert.ok(Math.min(...ys)>=-39&&Math.max(...ys)<=-28,'accents stay between the collar and the chest')
      assert.ok(xs.every(x=>Math.abs(x)<=8),'no strip runs down the garment edges')
    }
    if(fit&&paths.length)assert.ok(xs.reduce((sum,x)=>sum+x,0)/xs.length>0,'a turned torso shows its accents on the facing side')
    signatures.add(JSON.stringify({paths,fills}))
  }
  assert.ok(signatures.size>=8,'each season reads differently')
  // An identity scarf is never doubled by the cool-season knit.
  const cool=officeWardrobeFor(officeWardrobeTheme(new Date(2026,10,1,12)),appearance.slot,false),scarfed=recorder(),plain=recorder()
  drawOfficeWardrobe(scarfed.c,{...appearance,gear:'scarf'},cool,false,true)
  drawOfficeWardrobe(plain.c,appearance,cool,false,true)
  assert.equal(scarfed.paths.length,0)
  assert.ok(plain.paths.length>0)
})

it('paints distinct festive outdoor collar garments for all 6 holidays within chest bounds',()=>{
  const holidayDates=[
    new Date(2026,10,24,12), // loy-krathong
    new Date(2026,3,14,12),  // songkran
    new Date(2026,11,25,12), // christmas
    new Date(2026,9,31,12),  // halloween
    new Date(2027,0,1,12),   // new-year
    new Date(2026,1,14,12),  // valentine
  ]
  const signatures=new Set<string>()
  for(const d of holidayDates){
    const pts:{x:number;y:number}[]=[]
    const ops:string[]=[]
    let fillStyle='',strokeStyle=''
    const noop=()=>{}
    const track=(op:string)=>(...args:number[])=>{
      ops.push(`${op}:${fillStyle}:${strokeStyle}:${args.map(v=>v.toFixed(2)).join(',')}`)
      if(op==='moveTo'||op==='lineTo'||op==='fillRect'||op==='ellipse') pts.push({x:args[0],y:args[1]})
    }
    const c={
      set fillStyle(v:string){fillStyle=v},get fillStyle(){return fillStyle},
      set strokeStyle(v:string){strokeStyle=v},get strokeStyle(){return strokeStyle},
      lineWidth:1,globalAlpha:1,lineCap:'butt',lineJoin:'miter',
      save:noop,restore:noop,beginPath:noop,closePath:noop,translate:noop,rotate:noop,scale:noop,setLineDash:noop,
      moveTo:track('moveTo'),lineTo:track('lineTo'),quadraticCurveTo:noop,bezierCurveTo:noop,
      fillRect:track('fillRect'),ellipse:track('ellipse'),arc:track('arc'),
      fill(){ops.push(`fill:${fillStyle}`)},stroke(){ops.push(`stroke:${strokeStyle}`)},
    } as unknown as CanvasRenderingContext2D
    const look=officeWardrobeFor(officeWardrobeTheme(d),appearance.slot,true)
    assert.equal(look.outdoor,true)
    drawOfficeWardrobe(c,appearance,look,false,true)
    assert.ok(pts.length>0)
    assert.ok(pts.every(p=>p.y>=-39&&p.y<=-28&&Math.abs(p.x)<=8))
    assert.ok(pts.reduce((s,p)=>s+p.x,0)/pts.length>0)
    signatures.add(ops.join('|'))
  }
  assert.equal(signatures.size,6)
})
