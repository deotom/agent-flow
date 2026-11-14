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
 assert.deepEqual(roomDesignFor(floor()),roomDesignFor({...floor(),subtitle:'Reading file tool',working:7,actorKeys:['new']}))
 const variants=new Set(Array.from({length:12},(_,i)=>roomDesignFor({...floor(),sessionId:`project-${i}`}).variant))
 assert.ok(variants.size>2)
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
it('large rooms use two real depth rows with original-sized stations and an open lift aisle',()=>{
 const small=floor(),large=floor('Research specimen collection',337.5),w=450
 const a=roomStationLayout(small,w),b=roomStationLayout(large,w)
 assert.equal(new Set(a.map(p=>p.y)).size,1)
 assert.equal(new Set(b.map(p=>p.y)).size,2)
 assert.equal(a[0].width,b[0].width)
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
