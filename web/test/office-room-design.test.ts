import {it} from 'node:test'
import assert from 'node:assert/strict'
import {roomDesignFor,roomStationLayout,roomActorSpots,roomLeadRestPoint,roomStationSpots} from '../lib/office-room-design'
import type {OfficeFloor} from '../lib/office-types'
import {drawOfficeRoomShell,drawOfficeRoomDesign} from '../components/agent-visualizer/office/office-room-design-art'
import {drawOfficeDailyArt} from '../components/agent-visualizer/office/office-daily-art'
const floor=(title='Research specimen collection',height=253):OfficeFloor=>({id:'team-a',sessionId:'project-a',title,subtitle:'Working',color:'#aaa',y:100,height,actorKeys:[],kind:'team',room:height>260?'room-stations-large':'room-stations'})
it('derives stable work themes from mission and stable variation from team identity',()=>{
 assert.equal(roomDesignFor(floor()).theme,'research')
 assert.equal(roomDesignFor(floor('Design illustration studio')).theme,'studio')
 assert.equal(roomDesignFor(floor('Deploy server operations')).theme,'operations')
 assert.equal(roomDesignFor(floor('Test verification quality')).theme,'quality')
 assert.equal(roomDesignFor(floor('AgentFlow UX/UI')).theme,'studio')
 assert.equal(roomDesignFor(floor('quickVendor API')).theme,'operations')
 assert.equal(roomDesignFor(floor('Frontend UI components')).theme,'studio')
 assert.equal(roomDesignFor(floor('Vendor integration backend')).theme,'operations')
 assert.deepEqual(roomDesignFor(floor()),roomDesignFor({...floor(),subtitle:'Reading file tool',working:7,actorKeys:['new']}))
 const variants=new Set(Array.from({length:12},(_,i)=>roomDesignFor({...floor(),sessionId:`project-${i}`}).variant))
 assert.ok(variants.size>2)
})
it('same-theme projects keep distinct stable decor even when their low hash bits collide',()=>{
 const first=roomDesignFor({...floor('UI design'),sessionId:'project-0'})
 const other=Array.from({length:90},(_,i)=>roomDesignFor({...floor('UI design'),sessionId:`other-${i}`})).find(d=>d.variant===first.variant)!
 assert.ok(other)
 assert.notEqual(first.accent,other.accent)
})
it('mission themes lead the station grouping without moving shared station geometry',()=>{
 const studio=floor('AgentFlow UX/UI'),operations=floor('quickVendor API'),research=floor('Research specimens'),quality=floor('Quality verification')
 const layouts=[studio,operations,research,quality].map(f=>roomStationLayout(f,450))
 assert.deepEqual(layouts.map(layout=>layout[0].kind),['build','terminal','research','quality'])
 for(const layout of layouts)assert.deepEqual(layout.map(({kind,work,...geometry})=>geometry),layouts[0].map(({kind,work,...geometry})=>geometry))
 assert.deepEqual(roomStationLayout({...operations,subtitle:'Reading UI test tool',working:9,actorKeys:['one']},450),layouts[1])
})
it('painted themes change wall and floor accents plus distinct secondary wall displays',()=>{
 const art={shell:{width:1000,height:563},props:{width:1536,height:1024},breakRoom:{width:1000,height:563}} as unknown as Parameters<typeof drawOfficeRoomShell>[3]
 const render=(title:string)=>{
  const colors:string[]=[],images:unknown[][]=[]
  const c={fillStyle:'',drawImage:(...args:unknown[])=>images.push(args),save(){},restore(){},fillRect(this:{fillStyle:string}){colors.push(this.fillStyle)}} as unknown as CanvasRenderingContext2D
  const f=floor(title),scene={width:450,height:600,floors:[f],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
  drawOfficeRoomDesign(c,scene,f,art)
  return {colors,images}
 }
 const studio=render('AgentFlow UX/UI'),operations=render('quickVendor API')
 assert.equal(studio.colors.length,2,'wall tint and stained floorboards both use mission accent')
 assert.notDeepEqual(studio.colors,operations.colors)
 assert.notDeepEqual(studio.images[4],operations.images[4],'secondary painted wall display changes with mission')
 assert.deepEqual(studio,render('AgentFlow UX/UI'))
})
it('paints a fixed-height old wall with deeper floorboards, plus bounded matching daily props',()=>{
 const calls:unknown[][]=[]
 const c={drawImage:(...args:unknown[])=>calls.push(args),save(){},restore(){},fillRect(){}} as unknown as CanvasRenderingContext2D
 const art={shell:{width:1000,height:563},props:{width:1536,height:1024},breakRoom:{width:1000,height:563}} as unknown as Parameters<typeof drawOfficeRoomShell>[3]
 const small=floor(),large=floor('Design studio',337.5)
 const scene={width:450,height:900,floors:[large],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 drawOfficeRoomShell(c,scene,small,art);const smallWall=calls[0],smallFloor=calls[1],smallSoil=calls[2]
 calls.length=0;drawOfficeRoomShell(c,scene,large,art)
 assert.equal(calls[0][8],smallWall[8]);assert.equal(calls[2][8],smallSoil[8]);assert.ok(Number(calls[1][8])>Number(smallFloor[8]))
 drawOfficeRoomDesign(c,scene,large,art)
 const canteen={...large,kind:'break' as const,room:'room-canteen' as OfficeFloor['room']}
 drawOfficeDailyArt(c,{...scene,floors:[canteen]},new Date(2026,0,1,12),{},art)
 for(const call of calls)for(const value of call.slice(1))assert.ok(typeof value!=='number'||Number.isFinite(value))
 assert.ok(calls.length>12)
})
it('large rooms use two real depth rows with perspective-scaled stations and an open lift aisle',()=>{
 const small=floor(),large=floor('Research specimen collection',337.5),w=450
 const a=roomStationLayout(small,w),b=roomStationLayout(large,w)
 assert.ok(new Set(a.map(p=>p.y)).size>=3)
 assert.equal(new Set(b.map(p=>p.y)).size,2)
 assert.ok(a[0].width<b[2].width)
 assert.ok(Math.max(...b.map(p=>p.y))-Math.min(...b.map(p=>p.y))>=w*.16)
 assert.ok(b.every(p=>p.x+p.width/2<w*.80))
 assert.ok(roomActorSpots(large,w).length>=8)
 assert.ok(new Set(roomActorSpots(large,w).map(p=>p.y)).size>=2)
 for(const kind of ['research','build','quality','terminal','planning'] as const){
  const spots=roomStationSpots(large,w,kind)
  assert.ok(spots.length>=4)
  assert.ok(spots.every(p=>p.x<w*.79&&p.y>large.y&&p.y<large.y+large.height!*.9))
  assert.ok(spots.every(p=>p.y<large.y+large.height!-w*.118),'all station users stand on boards above the soil border')
 }
 const nook=roomLeadRestPoint(large,w)
 assert.ok(nook.x>=w*.70&&nook.x<w*.82)
 assert.ok(nook.y<large.y+large.height!*.65)
})

it('places varied-facing furniture and usable work edges entirely on the original boards',()=>{
 for(const height of [253.125,337.5])for(const w of [450,900]){
  const f={...floor('Design studio',height*w/450),room:height>260?'room-stations-large' as const:'room-stations' as const},stations=roomStationLayout(f,w),back=f.y+w*.36,front=f.y+f.height!-w*.118
  assert.ok(Math.max(...stations.map(s=>s.y))-Math.min(...stations.map(s=>s.y)) >= (height>260?60:20)*w/450)
  assert.deepEqual(new Set(stations.map(s=>s.facing)),new Set(['front','left','right']))
  for(const s of stations){
   assert.ok(s.depth>=0&&s.depth<=1)
   assert.ok(s.y>=back&&s.y<=front)
   assert.ok(s.work.y>=back&&s.work.y<=front)
   assert.ok(s.x<=w*.68&&s.x+s.width/2<w*.80)
   assert.ok(Math.abs(s.work.x-s.x)<=s.width*.4)
   assert.ok(s.work.y>=s.y)
   assert.ok(Number.isFinite(s.work.x),'the usable side follows the pictured equipment, not merely the camera direction')
  }
  assert.ok(stations.find(s=>s.depth===0)!.width<stations.find(s=>s.depth===1)!.width)
  assert.ok(roomActorSpots(f,w).every(p=>p.y>=back&&p.y<=front&&p.x<w*.70))
  assert.deepEqual(stations,roomStationLayout({...f,working:99,subtitle:'Changed'},w))
 }
})
