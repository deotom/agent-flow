import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { drawOfficeAvatar, drawOfficeFrame, officeAmbient, officePaintedWearScale, officeStandingHip } from '../components/agent-visualizer/office/office-art'
import { officeActorSupport } from '../lib/office-support'
import type { OfficeAppearance, OfficePaintOptions, OfficePose, OfficeScene } from '../lib/office-types'
import { officeAppearance } from '../lib/office-model'
import { officeNavigation } from '../lib/office-navigation'
import { officeAvatarHeadAtlases, officeAvatarCoatAtlases, officeAvatarLegAtlases, officeAvatarProfileAtlases, officeAvatarExtraHeadAtlases, officeAvatarWorkwearV1Atlases, officeAvatarWorkwearV2Atlases } from '../components/agent-visualizer/office/office-avatar-atlas'
import { officePaintedAvatarLook } from '../lib/office-painted-avatar'
import { MAX_TINTED_HEADS, officeTintedHead } from '../components/agent-visualizer/office/office-avatar-tone'
import { officeElbowSide, officeLimbBend } from '../lib/office-limb-pose'
import { drawOfficePaintedWorkwear } from '../components/agent-visualizer/office/office-wardrobe-art'
import { officeWardrobeFor, officeWardrobeTheme } from '../lib/office-wardrobe'
import { drawOfficeGarden } from '../components/agent-visualizer/office/office-garden-art'
import { createOfficeTravelPath, officeTripFrame, type OfficeTrip } from '../lib/office-motion'
import { drawOfficeRoomDesign, drawOfficeRoomDeskLights } from '../components/agent-visualizer/office/office-room-design-art'
import { skyWeather } from '../lib/office-sky'

type Call = { op: string; args: unknown[]; fill: string }
class RecordingContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000'
  globalAlpha = 1
  calls: Call[] = []
  fillRect(...args: number[]) { this.calls.push({ op: 'rect', args, fill: String(this.fillStyle) }) }
  strokeRect(...args: number[]) { this.calls.push({ op: 'strokeRect', args, fill: String(this.fillStyle) }) }
  createRadialGradient() { return {addColorStop(){}} }
  createLinearGradient() { return {addColorStop(){}} }
  beginPath() { this.calls.push({ op: 'begin', args: [], fill: String(this.fillStyle) }) }
  moveTo(...args: number[]) { this.calls.push({ op: 'move', args, fill: String(this.fillStyle) }) }
  lineTo(...args: number[]) { this.calls.push({ op: 'line', args, fill: String(this.fillStyle) }) }
  closePath() { this.calls.push({ op: 'close', args: [], fill: String(this.fillStyle) }) }
  fill() { this.calls.push({ op: 'fill', args: [], fill: String(this.fillStyle) }) }
  save() { this.calls.push({ op: 'save', args: [], fill: String(this.fillStyle) }) }
  rect(...args:number[]) { this.calls.push({op:'rect',args,fill:String(this.fillStyle)}) }
  clip() {}
  scale(...args:number[]) { this.calls.push({op:'scale',args,fill:String(this.fillStyle)}) }
  clearRect(...args:number[]) { this.calls.push({op:'clear',args,fill:String(this.fillStyle)}) }
  ellipse(...args:number[]) { this.calls.push({op:'ellipse',args,fill:String(this.fillStyle)}) }
  roundRect(...args:number[]) { this.calls.push({op:'roundRect',args,fill:String(this.fillStyle)}) }
  bezierCurveTo(...args:number[]) { this.calls.push({op:'bezier',args,fill:String(this.fillStyle)}) }
  quadraticCurveTo(...args:number[]) { this.calls.push({op:'quadratic',args,fill:String(this.fillStyle)}) }
  stroke() { this.calls.push({op:'stroke',args:[],fill:String(this.fillStyle)}) }
  restore() { this.calls.push({ op: 'restore', args: [], fill: String(this.fillStyle) }) }
  translate(...args: number[]) { this.calls.push({ op: 'translate', args, fill: String(this.fillStyle) }) }
  rotate(...args: number[]) { this.calls.push({ op: 'rotate', args, fill: String(this.fillStyle) }) }
  drawImage(...args:unknown[]) { this.calls.push({op:'image',args,fill:String(this.fillStyle)}) }
  fillText(...args: unknown[]) { this.calls.push({ op: 'text', args, fill: String(this.fillStyle) }) }
  strokeText(...args: unknown[]) { this.calls.push({ op: 'strokeText', args, fill: String(this.fillStyle) }) }
}
const ctx = () => new RecordingContext() as unknown as CanvasRenderingContext2D & RecordingContext
it('uses different rendered outlines and garment details with the same fabric colour',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const base=officeAppearance(0)
  for(const workBack of [false,true]){
    const paths=['jacket','hoodie','overalls','vest','coat','striped'].map(outfit=>{
      const canvas=ctx()
      drawOfficeAvatar(canvas,{...base,outfit:outfit as OfficeAppearance['outfit']},0,0,0,{workwear:true,workBack},atlas)
      return JSON.stringify(canvas.calls.filter(call=>call.op==='move'||call.op==='line').map(call=>call.args))
    })
    assert.equal(new Set(paths).size,paths.length)
  }
})
it('switches the painted garden lamps and warm-season wildlife with local daylight',()=>{
  const floor={id:'garden',kind:'lounge',y:0,height:190,desktopArt:true}
  const scene={width:450,floors:[floor]} as OfficeScene
  const day=ctx(),night=ctx()
  drawOfficeGarden(day,scene,new Date(2026,3,20,12),0)
  drawOfficeGarden(night,scene,new Date(2026,3,20,21),0)
  assert.ok(day.calls.some(call=>call.fill==='#8aa65e'),'the lizard is visible by day')
  assert.ok(!night.calls.some(call=>call.fill==='#8aa65e'),'the lizard has left by night')
  assert.ok(day.calls.some(call=>call.fill==='#796647'),'daylight shows the unlit glass')
  assert.ok(!night.calls.some(call=>call.fill==='#796647'),'night reveals the painted glow')
  assert.equal(night.calls.filter(call=>call.op==='ellipse'&&call.fill==='#ffe8a6').length,3,'the tree and café lanterns emit light above the dimmed plate')
  assert.ok(!day.calls.some(call=>call.fill==='#ffe8a6'),'the lanterns do not emit light during daytime')
  assert.ok(night.calls.some(call=>call.fill==='#f4e69c'),'fireflies appear after dusk')
})
it('paints distinct front and back atlas parts and keeps animated grip contacts unchanged',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const front=ctx(),back=ctx(),walking=ctx(),laterSlot=ctx()
  const pose={walk:true,face:-1 as const,gait:1.5,walkWeight:.8}
  drawOfficeAvatar(front,officeAppearance(0),0,0,0,{},atlas)
  drawOfficeAvatar(back,officeAppearance(1),0,0,0,{workBack:true},atlas)
  assert.deepEqual(front.calls.filter(call=>call.op==='image').map(call=>call.args.slice(1,3)),[[512,0],[0,0]])
  assert.deepEqual(back.calls.filter(call=>call.op==='image').map(call=>call.args.slice(1,3)),[[768,256],[256,256]])
  assert.deepEqual(drawOfficeAvatar(walking,officeAppearance(1),30,80,2,pose,atlas),drawOfficeAvatar(ctx(),officeAppearance(1),30,80,2,pose))
  drawOfficeAvatar(laterSlot,officeAppearance(9),0,0,0,{},atlas)
  assert.deepEqual(laterSlot.calls.filter(call=>call.op==='image').map(call=>call.args.slice(1,3)),[[512,256]])
})
it('builds painted wrists into the sleeve silhouette while preserving the worktop grips',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const painted=ctx(),legacy=ctx(),pose={supportHands:{left:{x:-19,y:-28},right:{x:25,y:-40}}}
  assert.deepEqual(drawOfficeAvatar(painted,officeAppearance(0),0,0,0,pose,atlas),drawOfficeAvatar(legacy,officeAppearance(0),0,0,0,pose))
  for(const hand of Object.values(pose.supportHands)){
    const isBead=(call:Call)=>call.op==='ellipse'&&call.args[0]===hand.x&&call.args[1]===hand.y
    assert.ok(legacy.calls.some(isBead))
    assert.ok(!painted.calls.some(isBead))
  }
})
it('paints rear-facing hands before the coat and preserves both worktop contacts while leaning',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement,painter=ctx(),figure=officeAppearance(0)
  const supportHands={left:{x:-18,y:-28},right:{x:19,y:-33}}
  const result=drawOfficeAvatar(painter,figure,45,79,0,{face:-1,sit:true,workBack:true,supportHands,
    workGesture:{kind:'type',progress:.3,reach:.6,nod:0,turn:0,lean:2,tilt:.15}},atlas)
  const skin=painter.calls.findIndex(call=>call.op==='fill'&&call.fill===figure.skin)
  const coat=painter.calls.findIndex(call=>call.op==='image'&&call.args[1]===768)
  assert.ok(skin>=0&&skin<coat,'distant hands are behind the near coat')
  assert.ok(Math.abs(result.left.x-27)<1e-7&&Math.abs(result.left.y-51)<1e-7)
  assert.ok(Math.abs(result.right.x-64)<1e-7&&Math.abs(result.right.y-46)<1e-7)
})
it('limits the reach of a painted worker even when a gesture targets the next workstation',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const result=drawOfficeAvatar(ctx(),officeAppearance(0),0,0,0,{
    supportHands:{left:{x:-16,y:-31},right:{x:59,y:-31}},
  },atlas)
  assert.deepEqual(result.left,{x:-16,y:-31})
  assert.ok(result.right.x>20&&result.right.x<=38,'the extended hand stays within one arm of the shoulder')
})
it('plants both feet toward the desk in the painted seated profile',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement,painter=ctx()
  drawOfficeAvatar(painter,officeAppearance(0),0,0,0,{face:-1,sit:true,workBack:true,seatHeight:25,seatBack:false,
    workGesture:{kind:'type',progress:0,reach:0,nod:0,turn:0,profile:true}},atlas)
  const boots=painter.calls.filter(call=>call.op==='translate').slice(2,4)
  assert.ok(boots.every(({args:[x,y]})=>Number(x)>0&&Math.abs(Number(y))<=2),'the feet share the floor plane in front of the stool')
})
it('uses the supplemental painted head atlas for higher slots and wraps across six silhouettes',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const heads={width:1024,height:512} as HTMLImageElement
  officeAvatarHeadAtlases.set(parts,heads)
  for(const [slot,back,source,sx,sy] of [[2,false,heads,0,0],[3,true,heads,768,0],[4,false,heads,0,256],[11,true,heads,768,256],[6,false,parts,0,0]] as const){
    const c=ctx()
    drawOfficeAvatar(c,officeAppearance(slot),0,0,0,{workBack:back},parts)
    assert.deepEqual(c.calls.filter(call=>call.op==='image').at(-1)?.args.slice(0,3),[source,sx,sy])
  }
})
it('frames painted room cloaks at the trim workwear build with the hem above the knee',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  for(const pose of [{},{sit:true,workBack:true},{walk:true,gait:1}]){
    const painter=ctx()
    drawOfficeAvatar(painter,officeAppearance(0),0,0,0,pose,atlas)
    const [coat,head]=painter.calls.filter(call=>call.op==='image')
    const [,,,,,,coatY,coatW,coatH]=coat.args.map(Number)
    assert.ok(coatW>=('walk' in pose?32:36)&&coatW<=42,'the cloak is no wider than a trim human build')
    assert.ok(coatH>=30&&coatH<=36,'the cloak keeps a waist-length drape')
    assert.ok(Number(head.args[7])<=coatW,'the head never outgrows the cloak')
    if(!('sit' in pose)){const hem=coatY+229/256*coatH;assert.ok(hem>=-19&&hem<=-16,'the standing hem leaves the legs in view')}
    assert.equal(head.args[7],head.args[8],'painted heads keep their square cell undistorted')
  }
})
it('keeps the same cloak through the work and walking poses and narrows the walking silhouette',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const coats={width:1024,height:512} as HTMLImageElement
  const heads={width:1024,height:512} as HTMLImageElement
  const profiles={width:768,height:512} as HTMLImageElement
  officeAvatarCoatAtlases.set(parts,coats)
  officeAvatarHeadAtlases.set(parts,heads)
  officeAvatarProfileAtlases.set(parts,profiles)
  const walking=ctx(),working=ctx(),portrait=ctx()
  drawOfficeAvatar(walking,officeAppearance(3),0,0,0,{walk:true,face:-1,stepDirection:{x:-1,y:0}},parts)
  drawOfficeAvatar(working,officeAppearance(3),0,0,0,{sit:true,workBack:true},parts)
  drawOfficeAvatar(portrait,officeAppearance(3),0,0,0,{portrait:true,walk:true},parts)
  const walkingParts=walking.calls.filter(call=>call.op==='image')
  const workingParts=working.calls.filter(call=>call.op==='image')
  assert.deepEqual(walkingParts.map(call=>call.args.slice(0,3)),[[coats,512,0],[profiles,0,256]])
  assert.deepEqual(workingParts.map(call=>call.args.slice(0,3)),[[coats,768,0],[heads,768,0]])
  assert.ok(Number(walkingParts[0].args[7])<Number(workingParts[0].args[7]))
  assert.ok(Number(walkingParts[1].args[7])<Number(portrait.calls.find(call=>call.op==='image'&&call.args[0]===heads)?.args[7]))
})
it('combines each painted hairstyle with every skin tone and cloak',()=>{
  const roster=Array.from({length:360},(_,slot)=>officePaintedAvatarLook(slot))
  assert.equal(new Set(roster.map(({hair,tone,cloak})=>`${hair}:${tone}:${cloak}`)).size,360)
  assert.deepEqual(officePaintedAvatarLook(107),roster[107])
})
it('bends the painted knees and elbows without changing bone length at a reachable contact',()=>{
  const start={x:3,y:-23}
  for(const [target,side] of [[{x:18,y:-4},-1],[{x:8,y:-4},-1],[{x:-14,y:-17},1]] as const){
    const joint=officeLimbBend(start,target,13,13,side)
    assert.ok(Math.abs(Math.hypot(joint.x-start.x,joint.y-start.y)-13)<1e-8)
    assert.ok(Math.abs(Math.hypot(joint.x-target.x,joint.y-target.y)-13)<1e-8)
  }
})
/** Maps a cell fraction of a painted leg pose to the avatar y where the banded draw calls put it. */
function legRowAt(calls:Call[],sheet:CanvasImageSource,cellY:number,fraction:number){
  for(const call of calls.filter(call=>call.op==='image'&&call.args[0]===sheet)){
    const [,,sy,,sh,,dy,,dh]=call.args.map(Number)
    const source=cellY+fraction*256
    if(source>=sy-1e-9&&source<=sy+sh+1e-9)return dy+(source-sy)/sh*dh
  }
  return NaN
}
it('plants seated painted legs on the floor and matches the seat height in each view',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const legs={width:768,height:512} as HTMLImageElement
  officeAvatarLegAtlases.set(parts,legs)
  const sitting=[
    {pose:{objectAction:'book' as const},column:0,row:256,ground:.897,hip:.496,width:.86},
    {pose:{workBack:true},column:256,row:0,ground:.861,hip:.48,width:.89},
  ]
  for(const {pose,column,row,ground,hip,width} of sitting)for(const seatHeight of [17,23]){
    const painter=ctx()
    drawOfficeAvatar(painter,officeAppearance(1),0,0,0,{...pose,sit:true,seatHeight,seatBack:false},parts)
    const call=painter.calls.find(call=>call.op==='image'&&call.args[0]===legs)
    assert.ok(call)
    assert.deepEqual(call.args.slice(1,3),[column,row])
    assert.ok(Math.abs(legRowAt(painter.calls,legs,row,ground))<1e-8,'boots stand on the floor')
    assert.ok(Math.abs(legRowAt(painter.calls,legs,row,hip)+seatHeight)<1e-8,'the hips rest on the seat')
    // Thighs and boots keep one scale: the band above the shins is not stretched.
    const [,,,sw,sh,,,dw,dh]=call.args.map(Number)
    assert.ok(Math.abs(dw/(sw*width)-dh/sh)<1e-8,'the painted thighs keep their aspect ratio')
    assert.ok(dw<=38*width+1e-8,'seated legs stay at the painted standing scale')
    if(row===0)assert.equal(Number(call.args[5])+Number(call.args[7])/2,0,'rear-facing boots share the stool center')
    const rising=ctx()
    drawOfficeAvatar(rising,officeAppearance(1),0,0,0,{...pose,sit:true,rising:true,seatBlend:1,seatHeight,seatBack:false},parts)
    assert.deepEqual(rising.calls.filter(call=>call.op==='image'&&call.args[0]===legs).map(call=>call.args),
     painter.calls.filter(call=>call.op==='image'&&call.args[0]===legs).map(call=>call.args),
     'the lower body keeps the same pose and anchors at the start of the rise')
  }
  const walking=ctx()
  drawOfficeAvatar(walking,officeAppearance(1),0,0,0,{walk:true,gait:1.4},parts)
  assert.ok(!walking.calls.some(call=>call.op==='image'&&call.args[0]===legs))
})
it('lengthens only the shins on a tall Terminal stool and keeps its boots on the floor',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const legs={width:768,height:512} as HTMLImageElement
  officeAvatarLegAtlases.set(parts,legs)
  const painter=ctx()
  drawOfficeAvatar(painter,officeAppearance(0),0,0,0,{sit:true,workBack:true,seatHeight:28},parts)
  const layers=painter.calls.filter(call=>call.op==='image')
  const legLayers=layers.filter(call=>call.args[0]===legs)
  assert.equal(legLayers.length,3,'thighs, shins and boots are separate bands')
  assert.ok(layers.findIndex(call=>call.args[0]===parts)>layers.findLastIndex(call=>call.args[0]===legs),'the coat covers the seated hips')
  assert.ok(legLayers.every(call=>call.args[1]===256&&Number(call.args[2])<256),'the rear seated pose matches the back-facing body')
  assert.ok(Math.abs(legRowAt(painter.calls,legs,0,.861))<1e-8)
  assert.ok(Math.abs(legRowAt(painter.calls,legs,0,.48)+28)<1e-8)
  const [top,shin,boots]=legLayers.map(call=>call.args.map(Number))
  assert.ok(Math.abs(top[7]/(256*.89)-top[8]/top[4])<1e-8&&Math.abs(boots[7]/(256*.89)-boots[8]/boots[4])<1e-8,'thighs and boots are not stretched')
  assert.ok(top[7]<=38*.89+1e-8,'the legs are not widened to fill the stool height')
  assert.ok(shin[8]/shin[4]>top[8]/top[4],'the plain shins take up the extra stool height')
})
it('keeps the rear stool legs out of upright, early rise and side-facing poses',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const legs={width:768,height:512} as HTMLImageElement
  officeAvatarLegAtlases.set(parts,legs)
  const poses:OfficePose[]=[{}, {sit:true,rising:true,seatBlend:.25},
    {sit:true,objectAction:'book'}, {sit:true,workBack:true,seatProfile:true}]
  for(const pose of poses){
    const painter=ctx()
    drawOfficeAvatar(painter,officeAppearance(0),0,0,0,{seatHeight:28,...pose},parts)
    assert.ok(!painter.calls.some(call=>call.op==='image'&&call.args[0]===legs&&call.args[1]===256&&Number(call.args[2])<256))
  }
})
it('renders the actual varied character profiles with distinct geometry and valid poses',()=>{
  const silhouettes=new Set<string>()
  for(let slot=0;slot<28;slot++)for(const pose of [{},{sit:true,mug:true},{walk:true},{climb:true},{hand:true},...(['coffee','book','game','water','music','snack'] as const).map(objectAction=>({objectAction}))]){
    const c=ctx();drawOfficeAvatar(c,officeAppearance(slot),0,0,2,pose)
    if(!Object.keys(pose).length)silhouettes.add(JSON.stringify(c.calls.map(call=>[call.op,call.args])))
    for(const call of c.calls)for(const v of call.args)assert.ok(typeof v!=='number'||Number.isFinite(v))
    for(const call of c.calls.filter(call=>call.op==='rect'))assert.ok((call.args[2] as number)>=0&&(call.args[3] as number)>=0)
  }
  assert.ok(silhouettes.size>=20)
})
const appearance = (kind: OfficeAppearance['kind'], slot = 0): OfficeAppearance => ({
  slot, kind, hair: '#30273e', skin: '#edbb91', shirt: '#ee8640', pants: '#253249', cut: 'bun', gear: 'headset',
})
const scene = (floors: OfficeScene['floors'] = [], actors: OfficeScene['actors'] = []): OfficeScene => ({
  width: 320, height: 500, floors, actors, quietTeams: [], totalAgents: actors.length, finishedCount: 0,
})
const options = (patch: Partial<OfficePaintOptions> = {}): OfficePaintOptions => ({
  time: 3, date: new Date(2026, 5, 1, 12), now: 1000, live: true, motion: true, pets: [], selectedKey: null, ...patch,
})

it('keeps painted figures legible without covering their clothing with a runtime medallion',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const painted=ctx(),legacy=ctx(),wardrobe={runtime:'codex' as const,lead:true}
  drawOfficeAvatar(painted,officeAppearance(0),0,0,0,wardrobe,atlas)
  drawOfficeAvatar(legacy,officeAppearance(0),0,0,0,wardrobe)
  assert.ok(legacy.calls.some(call=>call.op==='ellipse'&&call.args.slice(0,4).join()==='1,-20,8,8'))
  assert.ok(!painted.calls.some(call=>call.op==='ellipse'&&call.args.slice(0,4).join()==='1,-20,8,8'))

  const worker={key:'worker',sessionId:'s',agent:{status:'running',role:'worker',runtime:null,activities:[]},task:null,parentKey:null,appearance:officeAppearance(0),floorId:'f',zone:'desk',stand:true,activity:'Running',runtimeName:'',x:90,y:147} as unknown as OfficeScene['actors'][number]
  const room=scene([{id:'f',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team',y:20,height:162,actorKeys:['worker']}],[worker])
  const original=drawOfficeFrame(ctx(),room,options({motion:false})).get(worker.key)!
  const larger=drawOfficeFrame(ctx(),room,options({motion:false,avatarArt:atlas})).get(worker.key)!
  assert.ok(larger.scale!>original.scale!*1.1)
  assert.equal(larger.dx,original.dx)
  assert.equal(larger.dy,original.dy)
  worker.stand=false
  const seated=drawOfficeFrame(ctx(),room,options({motion:false,avatarArt:atlas})).get(worker.key)!
  assert.equal(seated.scale,original.scale,'an implicit chair pose keeps its original scale')
  room.floors[0].room='room-stations'
  const supported=drawOfficeFrame(ctx(),room,options({motion:false,avatarArt:atlas})).get(worker.key)!
  assert.equal(supported.scale,larger.scale,'standing benches override the implicit chair pose')
})

it('uses the same Desktop scale at the same position when an actor stops at a station',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const worker={key:'worker',sessionId:'s',agent:{status:'running',role:'worker',runtime:null,activities:[]},
    appearance:officeAppearance(0),floorId:'f',zone:'desk',stand:true,x:90,y:290} as unknown as OfficeScene['actors'][number]
  const room=scene([{id:'f',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team',room:'room-stations',
    desktopArt:true,y:20,height:300,actorKeys:[worker.key]}],[worker])
  const at=(pose:OfficePose)=>drawOfficeFrame(ctx(),{...room,actors:[{...worker,pose}]},options({motion:false,avatarArt:atlas})).get(worker.key)?.scale
  assert.equal(at({walk:true,walkWeight:0}),at({}))
})

it('keeps Desktop lift scale continuous from the aisle into the car and out at the garden',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const worker={key:'worker',sessionId:'s',agent:{status:'running',role:'worker',runtime:null,activities:[]},
    appearance:officeAppearance(0),floorId:'f',zone:'desk',stand:true,x:90,y:450} as unknown as OfficeScene['actors'][number]
  const room=scene([
    {id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:0,height:190,actorKeys:[],desktopArt:true},
    {id:'f',kind:'team',sessionId:'s',title:'Team',subtitle:'',color:'#fff',y:190,height:325,actorKeys:[worker.key],desktopArt:true,room:'room-stations'},
  ],[worker])
  const path=createOfficeTravelPath(room,room,worker,'f')
  path.travel({x:260,y:147},'garden')
  const endsAt=path.segments.reduce((sum,item)=>sum+item.duration,0)
  const trip:OfficeTrip={actorKey:worker.key,actor:worker,event:{id:'lift',actorKey:worker.key,parentKey:null,at:0,kind:'routine'},
    desktopMotion:true,segments:path.segments,startedAt:0,endsAt,caption:'',shaftX:path.nav.shaftX,rungPitch:path.nav.rungPitch}
  let elapsed=0
  const sampledAt=(now:number)=>{
    const frame=officeTripFrame(trip,now)
    const drawn={...worker,...frame.point,floorId:frame.floorId??'garden',pose:frame.pose}
    return drawOfficeFrame(ctx(),{...room,actors:[drawn]},options({motion:false,avatarArt:atlas,
      lift:{y:frame.elevatorY??drawn.y,doorsOpen:0,moving:false,passengerKeys:[worker.key]}})).get(worker.key)!.scale!
  }
  for(const item of path.segments){
    elapsed+=item.duration
    assert.ok(Math.abs(sampledAt(elapsed-.01)-sampledAt(elapsed))<.01,`scale changed when leaving ${item.liftPhase??item.kind}`)
    if(item.liftPhase==='riding')assert.ok(sampledAt(elapsed-.01)>.83,'the Desktop rider retains their proportions inside the car')
  }
})

describe('office art painter', () => {
  it('uses the specified local-time ambient phase boundaries', () => {
    const at = (hour: number) => officeAmbient(new Date(2026, 0, 1, hour))
    assert.equal(at(4).name, 'Night')
    assert.equal(at(5).name, 'Dawn')
    assert.equal(at(8).name, 'Day')
    assert.equal(at(17).name, 'Dusk')
    assert.equal(at(19).name, 'Night')
    assert.equal(at(23).night, true)
    assert.ok(at(12).rooms.every(color => color.startsWith('#')))
  })

  it('draws every pose with finite coordinates and nonnegative rectangles', () => {
    const poses: OfficePose[] = [{}, { lead: true }, { walk: true }, { sit: true }, { carry: true }, { hand: true }, { typing: true }, { mug: true }]
    for (const kind of ['human', 'robot', 'raccoon', 'owl', 'fox', 'alien'] as const) for (const pose of poses) {
      const c = ctx(); drawOfficeAvatar(c, appearance(kind), 50, 80, 2, pose)
      assert.ok(c.calls.length > 0)
      for (const call of c.calls) for (const value of call.args) assert.ok(typeof value !== 'number' || Number.isFinite(value))
      for (const call of c.calls.filter(item => item.op === 'rect')) {
        const [x, y, w, h] = call.args as number[]
        assert.ok([x, y, w, h].every(Number.isFinite)); assert.ok(w >= 0 && h >= 0)
      }
    }
  })

  it('paints arbitrary dynamic floors and freezes decorative frames when motion is off', () => {
    const floors = Array.from({ length: 9 }, (_, index) => ({ id: `f${index}`, sessionId: `s${index}`, title: 'Team', subtitle: '', color: '#53c4d1', y: index * 72, actorKeys: [], kind: 'team' as const }))
    const occupant={key:'worker',sessionId:'s0',agent:{status:'running',role:'worker',runtime:null},task:null,parentKey:null,appearance:appearance('human'),floorId:'f0',zone:'desk',activity:'Running',runtimeName:'',x:70,y:80} as unknown as OfficeScene['actors'][number]
    const a = ctx(); drawOfficeFrame(a, scene(floors,[occupant]), options({ motion: false, time: 0 }))
    const b = ctx(); drawOfficeFrame(b, scene(floors,[occupant]), options({ motion: false, time: 75 }))
    assert.ok(a.calls.length > 10)
    assert.deepEqual(a.calls, b.calls)
  })

  it('does not pose a stale or absent live actor as typing', () => {
    const actor = { key: 'a', sessionId: 's', agent: { status: 'running', role: 'worker' }, task: null, parentKey: null, appearance: appearance('human'), floorId: 'f', zone: 'desk' as const, activity: '', runtimeName: '', x: 70, y: 80, pose: { typing: true } } as unknown as OfficeScene['actors'][number]
    const c = ctx(); drawOfficeFrame(c, scene([{ id: 'f', sessionId: 's', title: '', subtitle: '', color: '#53c4d1', y: 20, actorKeys: ['a'], kind: 'team' }], [actor]), options({ live: false }))
    assert.ok(c.calls.length > 0)
    assert.ok(!c.calls.some(call => call.op === 'rect' && call.args[0] === 86 && call.args[1] === 75 && call.args[2] === 2 && call.args[3] === 1 && call.fill === '#edbb91'))
  })
})
it('paints unlit desk lights by default and leaves them to a backdrop canvas when asked',()=>{
  const image={width:1000,height:721} as unknown as HTMLImageElement
  const roomArt={shell:image,canteenShell:image,props:image,breakRoom:image}
  const room=scene([{id:'f',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team',y:20,height:230,actorKeys:[],desktopArt:true}])
  const bulbs=(patch:Partial<OfficePaintOptions>)=>{const c=ctx();drawOfficeFrame(c,room,options({motion:false,roomArt,...patch}));return c.calls.filter(call=>call.op==='fill'&&call.fill==='#51331d').length}
  assert.ok(bulbs({})>0,'standalone callers keep the unlit station overlay')
  assert.equal(bulbs({paintDeskLights:true}),bulbs({}))
  assert.equal(bulbs({paintDeskLights:false}),0)
})

it('clips Desktop lift riders behind the garden sill and shaft jambs while leaving open threshold crossings visible',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const referenceLift={width:243,height:562} as HTMLImageElement
  const room=scene([
    {id:'garden',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:0,height:190,actorKeys:[],desktopArt:true},
    {id:'f',kind:'team',sessionId:'s',title:'Team',subtitle:'',color:'#fff',y:182,height:325,actorKeys:['rider'],desktopArt:true,room:'room-stations'},
  ])
  room.width=450
  const nav=officeNavigation(room)
  const unit=nav.scale*450/992,cavityWidth=88*unit,shaftTop=nav.top+(4.5+9)*nav.scale
  const rider={key:'rider',sessionId:'s',agent:{status:'running',role:'worker',runtime:null,activities:[]},
    appearance:officeAppearance(0),floorId:'garden',zone:'lounge',stand:true,x:nav.shaftX,y:nav.hatch.y+18,
    pose:{inLift:true}} as unknown as OfficeScene['actors'][number]

  const riding=ctx()
  drawOfficeFrame(riding,{...room,actors:[rider]},options({motion:false,avatarArt:atlas,
    architectureArt:{referenceLift,doorClosed:referenceLift,doorOpen:referenceLift,liftCabin:referenceLift,liftShaft:referenceLift},
    lift:{y:rider.y,doorsOpen:0,moving:true,passengerKeys:[rider.key]}}))
  const firstBackLift=riding.calls.findIndex(call=>call.op==='image'&&call.args[0]===referenceLift)
  const riderAvatar=riding.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===atlas)
  const lastFrontLift=riding.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===referenceLift)
  assert.ok(firstBackLift>=0&&riderAvatar>firstBackLift&&riderAvatar<lastFrontLift,'riding passenger draws after the cabin and before the front lift doors')
  const riderRects=riding.calls.slice(firstBackLift,riderAvatar).filter(call=>call.op==='rect')
  const openIndex=riderRects.findIndex(call=>Math.abs(Number(call.args[0])-(nav.shaftX-24*nav.scale))<1e-9&&Math.abs(Number(call.args[2])-48*nav.scale)<1e-9)
  assert.ok(openIndex>=2,'rider clip follows the cabin draw')
  const [openRect,shaftRect]=riderRects.slice(openIndex,openIndex+2)
  assert.ok(openRect&&shaftRect)
  assert.ok(Math.abs((openRect.args[1]! as number)+(openRect.args[3]! as number)-nav.hatch.y)<1e-9,'garden opening stops above the stone sill')
  assert.ok(Math.abs(Number(shaftRect.args[0])-(nav.shaftX-cavityWidth/2))<1e-9)
  assert.ok(Math.abs(Number(shaftRect.args[1])-shaftTop)<1e-9&&shaftTop>nav.hatch.y+16*nav.scale,'shaft cavity starts below the curved garden sill')
  assert.ok(Math.abs(Number(shaftRect.args[2])-cavityWidth)<1e-9,'shaft cavity keeps the rider inside the wooden jambs')

  const crossing=ctx()
  const crossingActor={...rider,y:nav.hatch.y,pose:{inLift:true,liftCrossing:true,walk:true}} as unknown as OfficeScene['actors'][number]
  drawOfficeFrame(crossing,{...room,actors:[crossingActor]},options({motion:false,avatarArt:atlas,
    architectureArt:{referenceLift,doorClosed:referenceLift,doorOpen:referenceLift,liftCabin:referenceLift,liftShaft:referenceLift},
    lift:{y:nav.hatch.y,doorsOpen:1,moving:false,passengerKeys:[rider.key]}}))
  const crossingAvatar=crossing.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===atlas)
  const crossingFrontLift=crossing.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===referenceLift)
  assert.ok(crossingAvatar>crossingFrontLift,'open-door threshold crossing draws over the front lift sill')
  const postLiftRects=crossing.calls.slice(crossingFrontLift+1,crossingAvatar).filter(call=>call.op==='rect')
  assert.ok(postLiftRects.some(call=>call.args[0]===0&&call.args[1]===0&&call.args[2]===nav.shaftX+21*nav.scale&&call.args[3]===room.height))
  assert.ok(!postLiftRects.some(call=>Math.abs(Number(call.args[1])-shaftTop)<1e-9&&Math.abs(Number(call.args[2])-cavityWidth)<1e-9),'threshold crossing omits the shaft-only sill clip')
})
it('turns back-facing station effort into a forward hunch while profile workers still lean in',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const workGesture={kind:'type' as const,progress:.3,reach:.6,nod:0,turn:0,lean:0,tilt:.2}
  const supportHands={left:{x:-14,y:-31},right:{x:13,y:-32}}
  const rolls=(pose:OfficePose)=>{const painter=ctx();drawOfficeAvatar(painter,officeAppearance(0),0,0,0,pose,atlas);return painter.calls.filter(call=>call.op==='rotate'&&Math.abs(Math.abs(Number(call.args[0]))-.2)<1e-9).length}
  for(const pose of [{workBack:true},{sit:true,workBack:true,seatHeight:21,seatBack:false},{}] as OfficePose[])
    assert.equal(rolls({...pose,supportHands,workGesture}),0,'facing away or forward, the torso never rolls sideways')
  assert.ok(rolls({supportHands,workGesture:{...workGesture,profile:true}})>0,'a profile worker leans toward the worktop')
  const level=ctx(),hunched=ctx()
  const coatY=(painter:typeof level)=>painter.calls.filter(call=>call.op==='translate').map(call=>Number(call.args[1]))
  drawOfficeAvatar(level,officeAppearance(0),0,0,0,{workBack:true,supportHands,workGesture:{...workGesture,tilt:0}},atlas)
  drawOfficeAvatar(hunched,officeAppearance(0),0,0,0,{workBack:true,supportHands,workGesture},atlas)
  assert.ok(coatY(hunched).some((y,i)=>y>coatY(level)[i]),'the shoulders settle forward instead')
  assert.deepEqual(drawOfficeAvatar(ctx(),officeAppearance(0),0,0,0,{workBack:true,supportHands,workGesture},atlas).left,supportHands.left,'worktop grips are unchanged')
})
it('hangs relaxed painted arms beside the body with the elbows bent outward',()=>{
  for(const side of [-1,1] as const){
    const shoulder={x:side*10.8,y:-35.8},hand={x:side*15.5,y:-22}
    const length=Math.hypot(hand.x-shoulder.x,hand.y-shoulder.y)/2+.9
    const elbow=officeLimbBend(shoulder,hand,length,length,officeElbowSide(shoulder,hand,side,length))
    assert.ok(side*(elbow.x-(shoulder.x+hand.x)/2)>0,'the elbow points away from the belly')
    assert.ok(side*(elbow.x-(shoulder.x+hand.x)/2)<4,'a relaxed arm only bends a little')
  }
  // Reaching level across a worktop drops the elbow below the forearm.
  const elbow=officeLimbBend({x:11,y:-32},{x:30,y:-31},13,13,officeElbowSide({x:11,y:-32},{x:30,y:-31},1,13))
  assert.ok(elbow.y>-31.5)
})
it('draws Desktop workwear at painted scale with its hem above the knees',()=>{
  for(const outfit of ['jacket','hoodie','overalls','vest','coat','striped'] as const)for(const profile of [false,true]){
    const painter=ctx()
    drawOfficePaintedWorkwear(painter,outfit,'#8d5236',false,profile,28)
    assert.ok(!painter.calls.some(call=>call.op==='scale'&&Number(call.args[1])!==1),'garment details are never squashed vertically')
    const ys=painter.calls.filter(call=>call.op==='move'||call.op==='line'||call.op==='quadratic').flatMap(call=>call.args.filter((_,i)=>i%2===1).map(Number))
    assert.ok(Math.max(...ys)<=28+1.5,'the hem ends where it is placed')
    assert.equal(painter.calls.some(call=>call.op==='scale'&&Number(call.args[0])<.75),profile,'a turned torso is narrower')
  }
  const atlas={width:1024,height:512} as HTMLImageElement,standing=ctx()
  drawOfficeAvatar(standing,{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true},atlas)
  const collar=standing.calls.find(call=>call.op==='translate'&&call.args[0]===0&&Number(call.args[1])<-30)
  assert.ok(collar&&Number(collar.args[1])+28<=-12,'standing workwear leaves the trousers and boots in view')
})
it('narrows seasonal layers onto the turned torso in profile',()=>{
  const atlas={width:1024,height:512} as HTMLImageElement
  const wardrobe=officeWardrobeFor(officeWardrobeTheme(new Date(2026,10,23,12)),1,false)
  const scales=(pose:OfficePose)=>{const painter=ctx();drawOfficeAvatar(painter,officeAppearance(3),0,0,0,{workwear:true,wardrobe,...pose},atlas);return painter.calls.filter(call=>call.op==='scale').map(call=>call.args.map(Number))}
  assert.ok(scales({walk:true,gait:1,stepDirection:{x:1,y:0}}).some(([x,y])=>x===.6&&y===1))
  assert.ok(scales({}).some(([x,y])=>x===.84&&y===1),'front layers sit inside the workwear edge')
})
it('seats every painted hairstyle neck on the collar line',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const heads={width:1024,height:512} as HTMLImageElement
  const profiles={width:768,height:512} as HTMLImageElement
  const extra={width:768,height:1024} as HTMLImageElement
  officeAvatarHeadAtlases.set(parts,heads);officeAvatarProfileAtlases.set(parts,profiles);officeAvatarExtraHeadAtlases.set(parts,extra)
  const necks={front:[208,199,222,224,216,217,234,215,210,210],back:[204,193,221,221,218,220,240,214,210,210]}
  for(const view of ['front','back'] as const){
    const lines=new Set<string>()
    for(let slot=0;slot<10;slot++){
      const painter=ctx()
      drawOfficeAvatar(painter,officeAppearance(slot),0,0,0,{workBack:view==='back'},parts)
      const head=painter.calls.filter(call=>call.op==='image').at(-1)!.args.map(Number)
      // Undo the cell trim used for the supplemental braid before reading the neck line.
      const cellTop=head[2]%256===8?head[6]-8*32/256:head[6]
      lines.add((cellTop+necks[view][slot]*32/256).toFixed(3))
      assert.equal(head[7],32)
    }
    assert.equal(lines.size,1,`${view} necks share one collar height`)
  }
  const blond=ctx()
  drawOfficeAvatar(blond,officeAppearance(7),0,0,0,{},parts)
  assert.deepEqual(blond.calls.filter(call=>call.op==='image').at(-1)!.args.slice(2,5),[264,256,248],'the braid above never bleeds into the next head')
})
function paintedWardrobeAtlas(){
  const parts={width:1024,height:512} as HTMLImageElement
  const v1={width:768,height:768} as HTMLImageElement
  const v2={width:768,height:768} as HTMLImageElement
  const coats={width:1024,height:512} as HTMLImageElement
  officeAvatarWorkwearV1Atlases.set(parts,v1);officeAvatarWorkwearV2Atlases.set(parts,v2);officeAvatarCoatAtlases.set(parts,coats);officeAvatarHeadAtlases.set(parts,{width:1024,height:512} as HTMLImageElement)
  return {parts,v1,v2,coats}
}
const sleeveCaps=(painter:RecordingContext)=>painter.calls.map((call,index)=>({call,index})).filter(({call})=>call.op==='ellipse'&&Number(call.args[2])===2.9)
it('dresses Desktop workwear from the painted three-angle sheets at the trim torso scale',()=>{
  const {parts,v1,v2}=paintedWardrobeAtlas()
  const outfits={jacket:[v1,0,'#746633'],hoodie:[v1,256,'#a44e2e'],overalls:[v1,512,'#d4b98f'],vest:[v2,0,'#d2b690'],striped:[v2,256,'#4a625c'],shirt:[v2,512,'#a66b34']} as const
  for(const [outfit,[sheet,row,sleeve]] of Object.entries(outfits))for(const [pose,column] of [[{},0],[{meeting:true},256],[{workBack:true},512]] as const){
    const painter=ctx()
    drawOfficeAvatar(painter,{...officeAppearance(0),outfit:outfit as OfficeAppearance['outfit']},0,0,0,{workwear:true,...pose},parts)
    const garment=painter.calls.filter(call=>call.op==='image'&&(call.args[0]===v1||call.args[0]===v2))
    assert.equal(garment.length,1,`${outfit} draws one painted cell`)
    assert.equal(garment[0].args[0],sheet)
    const [,sx,sy,sw,sh,,dy,dw,dh]=garment[0].args.map(Number)
    assert.deepEqual([sx,sy,sw,sh],[column,row,256,256],`${outfit} picks the view column`)
    assert.equal(dw,dh,'square cells are never squashed, even in profile')
    assert.equal(dw,officePaintedWearScale.standing)
    assert.ok(Math.abs(dy+32/256*dh-officePaintedWearScale.collar)<1e-9,'the painted collar meets the neck')
    const hem=dy+224/256*dh
    assert.ok(hem>=-19.5&&hem<=-18,'the standing hem leaves about nineteen units of legs')
    assert.ok(painter.calls.some(call=>call.op==='fill'&&call.fill===sleeve),'sleeves match the painted fabric')
  }
  const seated=ctx()
  drawOfficeAvatar(seated,{...officeAppearance(0),outfit:'vest'},0,0,0,{workwear:true,sit:true,workBack:true,seatBack:false},parts)
  const [,,,,,,dy,dw]=seated.calls.find(call=>call.op==='image'&&call.args[0]===v2)!.args.map(Number)
  assert.equal(dw,officePaintedWearScale.seated)
  const hem=dy+224/256*dw
  assert.ok(hem>-18&&hem<=-14,'the seated hem rests at the seat edge')
})
it('wears the painted cloaks for coats and ponchos and keeps procedural workwear without the sheets',()=>{
  const {parts,v1,v2,coats}=paintedWardrobeAtlas()
  for(const outfit of ['coat','poncho'] as const)for(const slot of [0,1,2,3,4,5]){
    const painter=ctx()
    drawOfficeAvatar(painter,{...officeAppearance(slot),outfit},0,0,0,{workwear:true},parts)
    const images=painter.calls.filter(call=>call.op==='image')
    assert.ok(!images.some(call=>call.args[0]===v1||call.args[0]===v2))
    const cloak=images[0]
    assert.ok(cloak.args[0]===coats||(cloak.args[0]===parts&&Number(cloak.args[1])>=512),`${outfit} uses a hand-painted cloak`)
    assert.ok(!painter.calls.some(call=>call.op==='translate'&&call.args[0]===0&&call.args[1]===-42),'no procedural garment is traced')
  }
  const bare={width:1024,height:512} as HTMLImageElement,painter=ctx()
  drawOfficeAvatar(painter,{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true},bare)
  assert.ok(painter.calls.some(call=>call.op==='translate'&&call.args[0]===0&&Number(call.args[1])<-30),'the procedural workwear remains the fallback')
  assert.ok(painter.calls.filter(call=>call.op==='image').every(call=>call.args[0]===bare))
})
it('sets profile sleeves into the painted armhole and turns 3/4 far arms behind the garment',()=>{
  const {parts,v1}=paintedWardrobeAtlas()
  const jacket={...officeAppearance(0),outfit:'jacket' as const}
  const garmentAt=(painter:RecordingContext)=>painter.calls.findIndex(call=>call.op==='image'&&call.args[0]===v1)
  const profile=ctx()
  drawOfficeAvatar(profile,jacket,0,0,0,{workwear:true,meeting:true},parts)
  const [far,near]=sleeveCaps(profile)
  assert.ok(far&&near)
  assert.ok(Number(near.call.args[0])>=-2.1&&Number(near.call.args[0])<=-1.3,'the near shoulder sits in the profile armhole')
  assert.ok(Number(far.call.args[0])>=1.4&&Number(far.call.args[0])<=2.1,'the far shoulder sits just ahead, behind the chest')
  for(const cap of [far,near])assert.ok(Number(cap.call.args[1])>=-37&&Number(cap.call.args[1])<=-34,'shoulders sit at armhole height')
  assert.ok(far.index<garmentAt(profile)&&near.index>garmentAt(profile))
  for(const [pose,farSign] of [[{},1],[{workBack:true},-1]] as const){
    const painter=ctx()
    drawOfficeAvatar(painter,jacket,0,0,0,{workwear:true,...pose},parts)
    const caps=sleeveCaps(painter),garment=garmentAt(painter)
    assert.equal(caps.length,2)
    const behind=caps.filter(cap=>cap.index<garment),front=caps.filter(cap=>cap.index>garment)
    assert.equal(behind.length,1,'one arm turns behind the garment');assert.equal(front.length,1)
    assert.ok(Number(behind[0].call.args[0])*farSign>0,'the far arm is the one hidden')
    assert.ok(Math.abs(Number(front[0].call.args[0]))>=3&&Math.abs(Number(front[0].call.args[0]))<=7,'the near arm leaves the open armhole')
  }
  // Without a cap ring the sleeve head never inks a hard circle across the garment.
  const painter=ctx()
  drawOfficeAvatar(painter,jacket,0,0,0,{workwear:true},parts)
  for(const {index} of sleeveCaps(painter))assert.ok(painter.calls.slice(index,index+4).every(call=>call.op!=='stroke'))
})
it('lets relaxed painted hands hang close to the trim torso while officeHandContacts is unchanged',()=>{
  const {parts}=paintedWardrobeAtlas()
  const painted=drawOfficeAvatar(ctx(),{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true},parts)
  const legacy=drawOfficeAvatar(ctx(),officeAppearance(0),0,0,0,{})
  assert.ok(painted.left.x>=-11&&painted.left.x<=-10&&painted.right.x>=10&&painted.right.x<=11.5)
  assert.deepEqual([legacy.left.x,legacy.right.x],[-15,16])
  const busy=drawOfficeAvatar(ctx(),{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true,mug:true},parts)
  assert.ok(busy.left.x>=-11&&busy.left.x<=-10,'free hand stays tucked beside the trim torso while holding a mug')
  assert.ok(busy.right.x>=11&&busy.right.x<=14,'mug hand stays near the trim torso')
})
it('keeps free hands tucked in single-hand actions, bounds stretch, and holds standing books with both hands',()=>{
  const {parts}=paintedWardrobeAtlas()
  const jacket={...officeAppearance(0),outfit:'jacket' as const}
  for(const pose of [{wave:true},{hand:true},{carry:true},{liftWait:'press' as const},{offer:.8},{scratch:true}]){
    const hands=drawOfficeAvatar(ctx(),jacket,0,0,0,{workwear:true,...pose},parts)
    assert.ok(hands.left.x>=-11.5,`free hand stays tucked during ${JSON.stringify(pose)}`)
  }
  const stretched=drawOfficeAvatar(ctx(),jacket,0,0,0,{workwear:true,stretch:1},parts)
  assert.ok(stretched.left.y>=-58&&stretched.right.y>=-58,'overhead stretch stays within natural arm length')
  const readingStanding=drawOfficeAvatar(ctx(),jacket,0,0,0,{workwear:true,objectAction:'book'},parts)
  assert.ok(readingStanding.left.x>=-9&&readingStanding.right.x<=10,'both hands hold the edges of a standing book')
})
it('hangs standing painted legs from the raised hip and keeps the boots on the floor',()=>{
  const parts={width:1024,height:512} as HTMLImageElement
  const legs={width:768,height:512} as HTMLImageElement
  officeAvatarLegAtlases.set(parts,legs)
  const painter=ctx()
  drawOfficeAvatar(painter,officeAppearance(0),0,0,0,{},parts)
  assert.ok(Math.abs(legRowAt(painter.calls,legs,0,.125)+officeStandingHip)<1e-8)
  assert.ok(Math.abs(legRowAt(painter.calls,legs,0,.909))<1e-8)
  assert.ok(officeStandingHip>=28&&officeStandingHip<=29)
})
it('keeps painted walking limbs untwisted across front/back and side strides',()=>{
  const {parts}=paintedWardrobeAtlas()
  for(const stepDirection of [{x:0,y:1},{x:0,y:-1}] as const){
    const walked=drawOfficeAvatar(ctx(),{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true,walk:true,gait:Math.PI/2,walkWeight:1,stepDirection},parts)
    assert.ok(Math.abs(walked.left.x)<=11.5&&Math.abs(walked.right.x)<=11.5,'front/back walking keeps hands tucked near the trim torso')
  }
  const side=drawOfficeAvatar(ctx(),{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true,walk:true,gait:Math.PI/2,walkWeight:1,face:1,stepDirection:{x:1,y:0}},parts)
  assert.ok(Math.abs(side.left.x)<=7&&Math.abs(side.right.x)<=7,'profile walking swings hands symmetrically around the center line')
})
it('keeps speaking round-table profile hands tucked and gesturing forward over the table',()=>{
  const {parts}=paintedWardrobeAtlas()
  const speaker=drawOfficeAvatar(ctx(),{...officeAppearance(0),outfit:'jacket'},0,0,0,{workwear:true,meeting:true,wave:true},parts)
  assert.ok(speaker.left.x>=0,'far hand stays tucked instead of sticking behind the spine')
  assert.ok(speaker.right.y>=-36&&speaker.right.x>=8,'speaking hand gestures conversationally forward over the table')

  const lead={key:'lead',sessionId:'s',agent:{status:'idle',role:'lead',runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'f',zone:'desk',stand:true,x:140,y:280} as unknown as OfficeScene['actors'][number]
  const worker={key:'worker',sessionId:'s',agent:{status:'done',role:'worker',runtime:null,activities:[]},task:null,parentKey:'lead',
    appearance:{...officeAppearance(1),outfit:'vest'},floorId:'f',zone:'lounge',stand:true,x:200,y:280} as unknown as OfficeScene['actors'][number]
  const room=scene([{id:'f',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team',desktopArt:true,y:20,height:300,actorKeys:['lead','worker']}],[lead,worker])
  const loungeIdle=ctx(),tableListener=ctx()
  drawOfficeFrame(loungeIdle,room,options({motion:false,time:0,avatarArt:parts}))
  assert.ok(loungeIdle.calls.some(call=>call.op==='fill'&&call.fill==='#fff0cf'),'baseline lounge actor holds a mug when not in a meeting')
  drawOfficeFrame(tableListener,{...room,actors:[lead,{...worker,pose:{meeting:true}}]},options({motion:false,time:0,avatarArt:parts}))
  assert.ok(!tableListener.calls.some(call=>call.op==='fill'&&call.fill==='#fff0cf'),'round-table meeting suppresses lounge mugs on transferred done workers')
})
it('calibrates Desktop break-room and garden seating heights and draws all upgraded leisure and party props',()=>{
  const {parts}=paintedWardrobeAtlas()
  const breakFloor={id:'b',sessionId:'s',title:'Break',subtitle:'',color:'#fff',kind:'break' as const,room:'room-break-reading' as const,annexOf:'team',desktopArt:true,y:200,height:300,actorKeys:[]}
  const gardenFloor={id:'g',sessionId:null,title:'Garden',subtitle:'',color:'#fff',kind:'lounge' as const,desktopArt:true,y:0,height:200,actorKeys:[]}
  const sofaActor={key:'a',sessionId:'s',agent:{status:'done' as const,role:'worker' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'b',zone:'lounge' as const,x:450*.275,y:200+300*.742} as unknown as OfficeScene['actors'][number]
  const armchairActor={...sofaActor,key:'p',x:450*.642,y:200+300*.750} as unknown as OfficeScene['actors'][number]
  const benchActor={...sofaActor,key:'g1',floorId:'g',x:450*.238,y:148} as unknown as OfficeScene['actors'][number]
  const sc={width:450,height:500,floors:[gardenFloor,breakFloor],actors:[sofaActor,armchairActor,benchActor],quietTeams:[],totalAgents:3,finishedCount:3}
  const sofa=officeActorSupport(sc,sofaActor,{sit:true},1,sofaActor)
  const arm=officeActorSupport(sc,armchairActor,{sit:true},1,armchairActor)
  const bench=officeActorSupport(sc,benchActor,{sit:true},1,benchActor)
  assert.equal(sofa.seatProfile,false);assert.equal(sofa.seatHeight,17);assert.equal(sofa.face,1)
  assert.equal(arm.seatProfile,true);assert.equal(arm.seatHeight,16);assert.equal(arm.face,-1)
  assert.equal(bench.seatHeight,16)
  for(const pose of [{objectAction:'water' as const},{sit:true,objectAction:'snack' as const},{objectAction:'music' as const},{sit:true,objectAction:'game' as const},{party:true}] as const){
    const painter=ctx()
    drawOfficeAvatar(painter,{...officeAppearance(0),outfit:'jacket'},0,0,1.5,{workwear:true,...pose},parts)
    for(const call of painter.calls)for(const v of call.args)assert.ok(typeof v!=='number'||Number.isFinite(v))
  }
})
it('dresses the Desktop café shopkeeper in painted overalls and draws seamless chat bubbles',()=>{
  const {parts,v1}=paintedWardrobeAtlas()
  const a={key:'a',sessionId:'s',agent:{status:'running' as const,role:'worker' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'f',zone:'desk' as const,stand:true,x:100,y:280} as unknown as OfficeScene['actors'][number]
  const b={...a,key:'b',x:135} as unknown as OfficeScene['actors'][number]
  const desktopGarden={id:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',kind:'lounge' as const,desktopArt:true,y:0,height:195,actorKeys:[]}
  const legacyGarden={...desktopGarden,desktopArt:false}
  const teamFloor={id:'f',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team' as const,desktopArt:true,y:200,height:300,actorKeys:['a','b']}
  const desktopOut=ctx(),legacyOut=ctx()
  drawOfficeFrame(desktopOut,scene([desktopGarden],[]),options({motion:false,time:0,date:new Date(2026,3,20,12),avatarArt:parts}))
  drawOfficeFrame(legacyOut,scene([legacyGarden],[]),options({motion:false,time:0,date:new Date(2026,3,20,12),avatarArt:parts}))
  assert.ok(desktopOut.calls.some(call=>call.op==='image'&&call.args[0]===v1&&call.args[2]===512),'Desktop shopkeeper wears painted overalls')
  assert.ok(!legacyOut.calls.some(call=>call.op==='image'&&call.args[0]===v1))
  let chatCalls:Call[]=[]
  for(let time=.5;time<33;time+=.5){
    const painter=ctx()
    drawOfficeFrame(painter,scene([teamFloor],[a,b]),options({motion:true,time,avatarArt:parts}))
    if(painter.calls.some(call=>call.op==='fill'&&call.fill==='#fff3d4')){chatCalls=painter.calls;break}
  }
  assert.ok(chatCalls.length>0,'paired coworkers emit the seamless parchment chat bubble')
  assert.ok(!chatCalls.some(call=>call.fill==='#fffaf0'))
})
it('draws lunch eating trays after avatars and keeps Desktop ambient fireflies/butterflies/confetti clear of the lift shaft',()=>{
  const {parts}=paintedWardrobeAtlas()
  const props={width:1536,height:1024} as HTMLImageElement
  const roomArt={shell:{width:1000,height:721} as HTMLImageElement,canteenShell:{width:1000,height:721} as HTMLImageElement,props}
  const desktopGarden={id:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',kind:'lounge' as const,desktopArt:true,y:0,height:195,actorKeys:['diner']}
  const diner={key:'diner',sessionId:'s',agent:{status:'done' as const,role:'worker' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'lounge',zone:'lounge' as const,stand:false,party:true,x:140,y:145} as unknown as OfficeScene['actors'][number]
  const sc={width:450,height:500,floors:[desktopGarden],actors:[diner],quietTeams:[],totalAgents:1,finishedCount:1}
  const painter=ctx()
  drawOfficeFrame(painter,sc,options({motion:true,time:3,date:new Date(2026,5,1,21),avatarArt:parts,roomArt,dailyArt:{kind:'lunch',delivery:false,cleanup:false,guests:[{actorKey:'diner',kind:'lunch',phase:'eating',floorId:'lounge',x:140,y:145,seat:0}]}}))
  const lastAvatar=painter.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===parts)
  const trayCall=painter.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===props&&call.args[1]===1024+512*.10)
  assert.ok(lastAvatar>=0&&trayCall>lastAvatar,'lunch eating tray is painted in front of the avatar')
  assert.ok(painter.calls.some(call=>call.op==='rect'&&call.args[0]===0&&call.args[1]===0&&Math.abs(Number(call.args[2])-450*.81)<1e-6&&call.args[3]===195),'Desktop garden ambient effects clip left of the lift shaft')
  const leadTeamFloor={id:'f',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team' as const,desktopArt:true,y:200,height:300,actorKeys:['lead']}
  const idleLead={key:'lead',sessionId:'s',agent:{status:'idle' as const,role:'lead' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'f',zone:'lounge' as const,stand:true,x:300,y:380} as unknown as OfficeScene['actors'][number]
  const idleOut=ctx()
  drawOfficeFrame(idleOut,scene([leadTeamFloor],[idleLead]),options({motion:false,time:3,avatarArt:parts}))
  assert.ok(!idleOut.calls.some(call=>call.fill==='#efe0b8'),'idle Desktop root lead does not hold a forced book at the Lead table')
  assert.ok(!idleOut.calls.some(call=>call.fill==='#fff0cf'),'idle Desktop root lead does not hold an automatic mug at the Lead table')

  const restingGarden={key:'guest',sessionId:'s',agent:{status:'idle' as const,role:'member' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'lounge',zone:'lounge' as const,stand:true,x:140,y:145} as unknown as OfficeScene['actors'][number]
  const loyOut=ctx()
  drawOfficeFrame(loyOut,scene([desktopGarden],[restingGarden]),options({motion:false,time:3,date:new Date(2026,10,24,20),avatarArt:parts,roomArt}))
  assert.ok(loyOut.calls.some(call=>call.fill==='#4a8248'),'Loy Krathong garden actor holds a lotus krathong base')
  assert.ok(loyOut.calls.some(call=>call.fill==='#ffd269'),'Loy Krathong garden actor shows krathong candlelight')
  assert.ok(loyOut.calls.every(call=>call.args.every(a=>typeof a!=='number'||Number.isFinite(a))),'holiday garden frame emits no NaN coordinates')
  const plainOut=ctx()
  drawOfficeFrame(plainOut,scene([desktopGarden],[restingGarden]),options({motion:false,time:3,date:new Date(2026,10,22,20),avatarArt:parts,roomArt}))
  assert.ok(!plainOut.calls.some(call=>call.fill==='#4a8248'),'non-holiday garden actor does not hold a krathong')

  const clippedZero=ctx(),clippedHalf=ctx(),settledRoomCtx=ctx()
  const roomFloor:OfficeScene['floors'][number]={id:'f-clip',sessionId:'s',title:'Clip',subtitle:'',color:'#fff',kind:'team',desktopArt:true,y:200,height:300,actorKeys:['g']}
  const roomActor={key:'g',sessionId:'s',agent:{status:'running' as const,role:'member' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'f-clip',zone:'desk' as const,stand:false,x:140,y:340} as unknown as OfficeScene['actors'][number]
  drawOfficeRoomDesign(clippedZero,scene([{...roomFloor,clipHeight:0,transitionOpacity:0}],[]),{...roomFloor,clipHeight:0,transitionOpacity:0},roomArt)
  drawOfficeRoomDeskLights(clippedZero,scene([{...roomFloor,clipHeight:0,transitionOpacity:0}],[]),{...roomFloor,clipHeight:0,transitionOpacity:0},roomArt)
  assert.equal(clippedZero.calls.length,0,'room design and desk lights skip floors clipped to 0')
  drawOfficeRoomDesign(clippedHalf,scene([{...roomFloor,clipHeight:150,transitionOpacity:.5}],[]),{...roomFloor,clipHeight:150,transitionOpacity:.5},roomArt)
  assert.ok(clippedHalf.calls.some(call=>call.op==='rect'&&call.args[1]===200&&call.args[3]===150),'transitioning room clips to clipHeight')
  drawOfficeRoomDesign(settledRoomCtx,scene([roomFloor],[]),roomFloor,roomArt)
  assert.ok(!settledRoomCtx.calls.some(call=>call.op==='rect'),'settled Desktop room calls no extra clip rect')

  const actorHidden=ctx(),actorClipped=ctx()
  drawOfficeFrame(actorHidden,scene([{...roomFloor,clipHeight:0,transitionOpacity:0}],[roomActor]),options({motion:false,time:3,avatarArt:parts,roomArt}))
  assert.ok(!actorHidden.calls.some(call=>call.op==='image'&&call.args[0]===parts),'actor on zero-clipped floor is not painted')
  drawOfficeFrame(actorClipped,scene([{...roomFloor,clipHeight:160,transitionOpacity:.5}],[roomActor]),options({motion:false,time:3,avatarArt:parts,roomArt}))
  assert.ok(actorClipped.calls.some(call=>call.op==='rect'&&call.args[1]===200&&call.args[3]===160),'actor on transitioning floor clips to floor clipHeight')
})

it('renders Desktop holiday room decor, break-room headwear, shared holiday effects, and garden bursts',()=>{
  const {parts}=paintedWardrobeAtlas()
  const props={width:1536,height:1024} as HTMLImageElement
  const roomArt={shell:{width:1000,height:721} as HTMLImageElement,canteenShell:{width:1000,height:721} as HTMLImageElement,props}
  const teamFloor:OfficeScene['floors'][number]={id:'team',sessionId:'s',title:'Team',subtitle:'',color:'#fff',kind:'team',desktopArt:true,y:200,height:300,actorKeys:[]}
  const songkranTeam=ctx(),plainTeam=ctx()
  drawOfficeFrame(songkranTeam,scene([teamFloor],[]),options({motion:false,time:1,date:new Date(2026,3,13,12),avatarArt:parts,roomArt}))
  drawOfficeFrame(plainTeam,scene([teamFloor],[]),options({motion:false,time:1,date:new Date(2026,10,13,12),avatarArt:parts,roomArt}))
  assert.ok(songkranTeam.calls.length>plainTeam.calls.length,'Desktop team floor adds holiday room decor on Songkran')

  const breakFloor:OfficeScene['floors'][number]={id:'b',sessionId:'s',title:'Break',subtitle:'',color:'#fff',kind:'break',annexOf:'team',desktopArt:true,y:200,height:300,actorKeys:['g']}
  const breakActor={key:'g',sessionId:'s',agent:{status:'done' as const,role:'member' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:{...officeAppearance(0),slot:0},floorId:'b',zone:'lounge' as const,stand:true,x:200,y:380} as unknown as OfficeScene['actors'][number]
  const xmasBreak=ctx(),plainBreak=ctx()
  drawOfficeFrame(xmasBreak,scene([breakFloor],[breakActor]),options({motion:false,time:1,date:new Date(2026,11,25,12),avatarArt:parts,roomArt}))
  drawOfficeFrame(plainBreak,scene([breakFloor],[breakActor]),options({motion:false,time:1,date:new Date(2026,10,13,12),avatarArt:parts,roomArt}))
  assert.ok(xmasBreak.calls.some(call=>call.fill==='#c44440'),'Desktop break-room actor wears holiday headwear on Christmas')
  assert.ok(!plainBreak.calls.some(call=>call.fill==='#c44440'),'non-holiday break-room actor does not wear Christmas headwear')

  const gardenFloor:OfficeScene['floors'][number]={id:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',kind:'lounge',desktopArt:true,y:0,height:195,actorKeys:['a','b']}
  const actorA={key:'a',sessionId:'s',agent:{status:'done' as const,role:'member' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'lounge',zone:'lounge' as const,stand:true,x:120,y:150} as unknown as OfficeScene['actors'][number]
  const actorB={...actorA,key:'b',x:180} as unknown as OfficeScene['actors'][number]
  const sharedRest=[{kind:'holiday' as const,firstKey:'a',secondKey:'b',progress:.5,poses:new Map<string,OfficePose>([['a',{face:1,sit:false,walk:false,offer:.8}],['b',{face:-1,sit:false,walk:false,offer:.8}]])}]
  const sharedCtx=ctx(),burstCtx=ctx()
  drawOfficeFrame(sharedCtx,scene([gardenFloor],[actorA,actorB]),options({motion:true,time:1,date:new Date(2026,3,13,12),avatarArt:parts,roomArt,sharedRest}))
  assert.ok(sharedCtx.calls.some(call=>call.fill==='#9ae6ff'),'shared holiday Songkran pair paints water splash droplets')
  drawOfficeFrame(burstCtx,scene([gardenFloor],[actorA,actorB]),options({motion:true,time:1,date:new Date(2026,3,13,12),avatarArt:parts,roomArt,sharedRest,holidayBurst:{holiday:'songkran',startedAt:0,seed:.5,x:186,y:164}}))
  assert.ok(burstCtx.calls.length>sharedCtx.calls.length,'active holidayBurst adds garden burst geometry')

  for(const c of [songkranTeam,xmasBreak,sharedCtx,burstCtx]){
    for(const call of c.calls)for(const arg of call.args)assert.ok(typeof arg!=='number'||Number.isFinite(arg))
  }
})

it('paints morning mist, rain, and Christmas snow in front of the garden shopkeeper, actors, and lift doors',()=>{
  const {parts}=paintedWardrobeAtlas()
  const props={width:1536,height:1024} as HTMLImageElement
  const roomArt={shell:{width:1000,height:721} as HTMLImageElement,canteenShell:{width:1000,height:721} as HTMLImageElement,props}
  const gardenFloor:OfficeScene['floors'][number]={id:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#fff',kind:'lounge',desktopArt:true,y:0,height:195,actorKeys:['guest']}
  const guest={key:'guest',sessionId:'s',agent:{status:'done' as const,role:'member' as const,runtime:null,activities:[]},task:null,parentKey:null,
    appearance:officeAppearance(0),floorId:'lounge',zone:'lounge' as const,stand:true,x:140,y:150} as unknown as OfficeScene['actors'][number]
  const mistDate=Array.from({length:30},(_,i)=>new Date(2026,11,i+1,7)).find(d=>skyWeather(d)==='mist')!
  const rainDate=Array.from({length:31},(_,i)=>new Date(2026,7,i+1,12)).find(d=>skyWeather(d)==='rain')!
  const xmasDate=new Date(2026,11,25,12)
  assert.ok(mistDate&&rainDate)

  const sc=scene([gardenFloor],[guest])
  const mistCtx=ctx(),rainCtx=ctx(),xmasCtx=ctx()
  drawOfficeFrame(mistCtx,sc,options({motion:true,time:1,date:mistDate,avatarArt:parts,roomArt}))
  const lastAvatarMist=mistCtx.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===parts)
  const lastMistRect=mistCtx.calls.findLastIndex(call=>call.op==='rect'&&Number(call.args[2])>sc.width)
  assert.ok(lastAvatarMist>=0&&lastMistRect>lastAvatarMist,'foreground morning mist draws after avatars and shopkeeper')

  drawOfficeFrame(rainCtx,sc,options({motion:true,time:1,date:rainDate,avatarArt:parts,roomArt}))
  const lastAvatarRain=rainCtx.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===parts)
  const lastRainStroke=rainCtx.calls.findLastIndex(call=>call.op==='stroke')
  assert.ok(lastAvatarRain>=0&&lastRainStroke>lastAvatarRain,'foreground rain streaks draw after avatars and lift doors')

  drawOfficeFrame(xmasCtx,sc,options({motion:true,time:1,date:xmasDate,avatarArt:parts,roomArt}))
  const lastAvatarXmas=xmasCtx.calls.findLastIndex(call=>call.op==='image'&&call.args[0]===parts)
  const lastSnow=xmasCtx.calls.findLastIndex(call=>call.op==='ellipse'&&call.fill==='rgba(255,255,255,.9)')
  assert.ok(lastAvatarXmas>=0&&lastSnow>lastAvatarXmas,'Christmas snow falls in front of garden actors')

  for(const c of [mistCtx,rainCtx,xmasCtx]){
    for(const call of c.calls)for(const arg of call.args)assert.ok(typeof arg!=='number'||Number.isFinite(arg))
  }
})

it('caps cached tinted head canvases with LRU eviction in officeTintedHead',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document')
  const created:{width:number;height:number}[]=[]
  const offCtx={drawImage(){},getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>{const el={width:0,height:0,getContext:()=>offCtx};created.push(el);return el}}})
  try{
    const atlas={} as HTMLImageElement,look=officePaintedAvatarLook(0,6)
    for(let row=0;row<MAX_TINTED_HEADS;row++)assert.ok(officeTintedHead(atlas,row,0,'front',look))
    assert.equal(created.length,MAX_TINTED_HEADS)
    // Promote row 0 to MRU, making row 1 the oldest candidate for eviction.
    assert.equal(officeTintedHead(atlas,0,0,'front',look),created[0] as unknown as HTMLCanvasElement)
    assert.equal(created.length,MAX_TINTED_HEADS)
    assert.ok(officeTintedHead(atlas,MAX_TINTED_HEADS,0,'front',look))
    assert.equal(created[0].width,96,'recently used head survives eviction')
    assert.equal(created[1].width,0,'evicted canvas releases its pixel buffer width')
    assert.equal(created[1].height,0,'evicted canvas releases its pixel buffer height')
    // Evicted row 1 must be recomputed on next request.
    assert.ok(officeTintedHead(atlas,1,0,'front',look))
    assert.equal(created.length,MAX_TINTED_HEADS+2)
  }finally{
    if(previous)Object.defineProperty(globalThis,'document',previous)
    else Reflect.deleteProperty(globalThis,'document')
  }
})
