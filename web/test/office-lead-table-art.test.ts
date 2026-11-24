import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeRoomDesign} from '../components/agent-visualizer/office/office-room-design-art'
import {roomDesktopPlanningDesk,roomLeadMeetingPoint,roomLeadRestPoint} from '../lib/office-room-design'
import {officeLanding} from '../lib/office-navigation'
import type {OfficeFloor} from '../lib/office-types'

function roomCanvas(drawImage=(..._args:unknown[])=>{},fill=()=>{},moveTo=(_x:number,_y:number)=>{}){
 return {drawImage,fill,moveTo,lineTo:moveTo,beginPath(){},closePath(){},stroke(){},fillRect(){},strokeRect(){},save(){},restore(){},
  createLinearGradient:()=>({addColorStop(){}})} as unknown as CanvasRenderingContext2D
}

it('paints the Planning furniture below the shared sign without shifting its workpoint',()=>{
 const shell={width:1000,height:721} as CanvasImageSource
 const planningDesk={width:236,height:518} as CanvasImageSource
 const floor:OfficeFloor={id:'p',sessionId:'p',title:'Planning',subtitle:'',color:'#aaa',y:200,height:325,actorKeys:[],kind:'team',desktopArt:true}
 const scene={width:450,height:800,floors:[floor],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 const calls:unknown[][]=[]
 drawOfficeRoomDesign(roomCanvas((...args)=>calls.push(args)),scene,floor,{shell,canteenShell:shell,breakRoom:shell,props:shell,planningDesk})
 const desk=roomDesktopPlanningDesk(floor,scene.width)
 const [, sx, sy, sw, sh, x, y, width, height]=calls.find(c=>c[0]===planningDesk)! as [CanvasImageSource,...number[]]
 assert.equal(sx,0)
 assert.equal(sw,236)
 assert.equal(sy,94,'the baked sign is omitted')
 assert.equal(sy+sh,518)
 assert.equal(x,desk.left)
 assert.equal(width,desk.width)
 assert.ok(Math.abs(y+height-desk.top-desk.height)<1e-9)
 assert.ok(desk.top<floor.y+325*.26&&desk.left+desk.width<450*.12)
 assert.ok(desk.surface.y<desk.seatY&&desk.seatY<desk.feet.y&&desk.feet.y<=desk.top+desk.height)
})

it('paints the Desktop Lead table between the two meeting positions',()=>{
 const table={width:80,height:121} as CanvasImageSource
 const rug={width:360,height:114} as CanvasImageSource
 const shell={width:1000,height:721} as CanvasImageSource
 const art={shell,canteenShell:shell,breakRoom:shell,props:shell,leadTable:table,leadRug:rug}
 for(const width of [450,900]){
  const floor:OfficeFloor={id:'team-a',sessionId:'project-a',title:'Project A',subtitle:'',color:'#aaa',y:100,height:width*.69,actorKeys:[],kind:'team',room:'room-stations',desktopArt:true}
  const scene={width,height:900,floors:[floor],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
  const calls:unknown[][]=[]
  const ctx=roomCanvas((...args)=>{calls.push(args)})
  drawOfficeRoomDesign(ctx,scene,floor,art)
  const drawnRug=calls.find(call=>call[0]===rug)
  const drawnTable=calls.find(call=>call[0]===table)
  assert.equal(drawnRug?.[0],rug)
  assert.equal(drawnTable?.[0],table)
  const [,x,y,w,h]=drawnTable as [CanvasImageSource,number,number,number,number]
  const lead=roomLeadRestPoint(floor,width),visitor=roomLeadMeetingPoint(floor,width)
  const [,rugX,rugY,rugWidth,rugHeight]=drawnRug as [CanvasImageSource,number,number,number,number]
  assert.ok(rugX<lead.x&&visitor.x<rugX+rugWidth)
  assert.ok(rugY<lead.y&&lead.y<rugY+rugHeight)
  assert.ok(rugX+rugWidth<width*.84)
  assert.ok(lead.x<x&&x+w<visitor.x)
  assert.ok(w>=width*.075,'the narrower table remains visible at the compact Desktop scale')
  assert.ok(h<=width*.095,'the top stays below the shoulders of the people speaking beside it')
  assert.ok(visitor.x<width*.84)
  assert.equal(lead.y,visitor.y)
  assert.ok(Math.abs(y+h-lead.y)<width*.006,'table and actors share a floor baseline')
 }
})

it('keeps the front floorboards clear at every Desktop lift landing',()=>{
 const shell={width:1000,height:721} as CanvasImageSource
 const art={shell,canteenShell:shell,breakRoom:shell,props:shell}
 const upper:OfficeFloor={id:'team-a',sessionId:'a',title:'',subtitle:'',color:'',y:100,height:325,actorKeys:['a'],kind:'team',room:'room-stations',desktopArt:true}
 const lower={...upper,id:'team-b',y:425}
 const scene={width:450,height:800,floors:[upper,lower],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 for(const floor of scene.floors){
  const crops:unknown[][]=[]
  const ctx=roomCanvas((...args)=>crops.push(args),()=>assert.fail('lift mat overlaps the floorboards'))
  drawOfficeRoomDesign(ctx,scene,floor,art)
  const sill=officeLanding(scene,floor.id)!
  assert.ok(sill.y>=floor.y+floor.height!*.94)
  assert.ok(crops.filter(crop=>crop.length===9).every(crop=>Number(crop[6])>=sill.y),'repair is limited to the seam under the sill')
 }
})
