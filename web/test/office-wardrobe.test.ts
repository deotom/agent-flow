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
