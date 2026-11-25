import {drawOfficeRoomCurios} from './office-room-curios-art'
import type {OfficeFloor,OfficeScene} from '../../../lib/office-types'
import {OFFICE_WORKROOM_WALL_CROP,OFFICE_WORKROOM_WALL_DEPTH,roomDesignFor,roomDesktopPlanningDesk,roomLeadMeetingPoint,roomLeadRestPoint,type OfficeRoomTheme} from '../../../lib/office-room-design'
import {OFFICE_WORKROOM_LIFT_DEPTH} from '../../../lib/office-navigation'
import {officePaintedStationOccupancy} from '../../../lib/office-station-activity'

export interface OfficeRoomArt {shell:CanvasImageSource;canteenShell?:CanvasImageSource;props:CanvasImageSource;breakRoom?:CanvasImageSource;stations?:CanvasImageSource;stationAngles?:CanvasImageSource;worldStations?:CanvasImageSource;leadTable?:CanvasImageSource;leadRug?:CanvasImageSource;planningDesk?:CanvasImageSource}
type Ctx=CanvasRenderingContext2D
const liftFloor={left:.832,width:.137,soil:.955}
/** Atlas uses equal cells: studio, operations, research / quality, reading nook, buffet. */
export function drawRoomProp(c:Ctx,art:OfficeRoomArt,cell:number,x:number,y:number,w:number,h=w){
 const source=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=(source.naturalWidth??source.width??1536)/3,sh=(source.naturalHeight??source.height??1024)/2
 c.drawImage(art.props,(cell%3)*sw,Math.floor(cell/3)*sh,sw,sh,x,y,w,h)
}
/** Extends actual floorboards, preserving the old wall/soil scale and timber edges. */
export function drawOfficeRoomShell(c:Ctx,scene:OfficeScene,floor:OfficeFloor,art:OfficeRoomArt){
 const w=scene.width,h=floor.height??w*.5625,y=floor.y
 const shell=String(floor.room)==='room-canteen'?(art.canteenShell??art.shell):art.shell
 const source=shell as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const paintedWorkroom=floor.kind==='team'&&floor.desktopArt&&art.canteenShell
 const sw=source.naturalWidth??source.width??1000,sh=source.naturalHeight??source.height??(paintedWorkroom?721:563)
 if(paintedWorkroom){
  c.drawImage(shell,0,y,w,h)
  // Use full-width planks from the aisle and keep the ground seam on its original row.
  // The live shaft is painted above these crops wherever there are lower stops.
  const {left,width,soil}=liftFloor,planks=.086
  for(let row=OFFICE_WORKROOM_LIFT_DEPTH;row<soil;row+=planks){
   const span=Math.min(planks,soil-row)
   c.drawImage(shell,sw*.425,sh*.538,sw*width,sh*span,w*left,y+h*row,w*width,h*span)
  }
  c.drawImage(shell,sw*.69,sh*soil,sw*width,sh*(1-soil),w*left,y+h*soil,w*width,h*(1-soil))
  return
 }
 const wall=sh*OFFICE_WORKROOM_WALL_CROP,soil=sh*.21,top=w*OFFICE_WORKROOM_WALL_DEPTH,bottom=soil*w/sw
 c.drawImage(shell,0,0,sw,wall,0,y,w,top)
 c.drawImage(shell,0,wall,sw,sh-wall-soil,0,y+top,w,Math.max(1,h-top-bottom))
 c.drawImage(shell,0,sh-soil,sw,soil,0,y+h-bottom,w,bottom)
}
const cells:Record<OfficeRoomTheme,number>={studio:0,operations:1,research:2,quality:3}
type ArtworkPoint=readonly [number,number]

// Trace the lit surfaces along their timber edges in the 1000 × 721 room plate.
const buildBacksplash=[[130,454],[154,430],[322,430],[346,455],[346,550],[130,550]] as const
const buildCounter=[[69,553],[130,548],[346,548],[397,552],[407,571],[346,575],[342,559],[280,558],[268,574],[70,576]] as const
const reviewCounter=[[414,257],[595,257],[601,304],[619,307],[622,317],[376,320],[374,311],[405,303]] as const

function drawUnlitSurface(c:Ctx,image:CanvasImageSource,width:number,height:number,outline:readonly ArtworkPoint[],brightness:number){
 c.save()
 c.beginPath()
 c.moveTo(...outline[0])
 for(const [x,y] of outline.slice(1))c.lineTo(x,y)
 c.closePath();c.clip()
 c.filter=`brightness(${brightness})`
 c.drawImage(image,0,0,width,height)
 c.restore()
}

function drawUnlitBulb(c:Ctx,x:number,y:number,width:number,height:number,angle=0){
 c.beginPath();c.ellipse(x,y,width,height,angle,0,Math.PI*2)
 c.fillStyle='#51331d';c.fill()
}

/** Switch off the equipment on the painted plate. The room lanterns still light the furniture. */
export function drawOfficeRoomDeskLights(c:Ctx,scene:OfficeScene,floor:OfficeFloor,art:OfficeRoomArt){
 if(floor.clipHeight!==undefined&&floor.clipHeight<=0.5)return
 const clipped=floor.clipHeight!==undefined||floor.transitionOpacity!==undefined
 const w=scene.width,h=floor.height??w*.72,lit=officePaintedStationOccupancy(scene,floor)
 if(clipped){
  c.save()
  if(floor.clipHeight!==undefined){c.beginPath();c.rect(0,floor.y,w,floor.clipHeight);c.clip()}
  if(floor.transitionOpacity!==undefined)c.globalAlpha*=floor.transitionOpacity
 }
 c.save();c.translate(0,floor.y);c.scale(w/1000,h/721)
 if(!lit.has('build')){
  drawUnlitSurface(c,art.shell,1000,721,buildBacksplash,.43)
  drawUnlitSurface(c,art.shell,1000,721,buildCounter,.66)
  drawUnlitBulb(c,177,456,8,4)
  drawUnlitBulb(c,298,456,8,4)
 }
 if(!lit.has('quality')){
  drawUnlitSurface(c,art.shell,1000,721,reviewCounter,.76)
  drawUnlitBulb(c,443,220,11,4,-.56)
 }
 // Leave the Research bench lit by the wall lantern. It has no task lamp.
 if(!lit.has('terminal')){
  const glass=c.createLinearGradient(0,502,0,545)
  glass.addColorStop(0,'#292722');glass.addColorStop(1,'#141411')
  c.fillStyle=glass
  c.fillRect(500,503,75,42)
  c.fillRect(641,502,72,43)
 }
 c.restore()
 if(!lit.has('planning')&&art.planningDesk){
  const desk=roomDesktopPlanningDesk(floor,w)
  c.save();c.translate(desk.left,desk.top);c.scale(desk.width/236,desk.height/518)
  drawUnlitSurface(c,art.planningDesk,236,518,[[61,240],[99,242],[92,276],[141,277],[178,286],[202,316],[207,329],[48,347],[7,336],[17,276]],.64)
  drawUnlitBulb(c,98,246,30,7,-.45)
  c.restore()
 }
 if(clipped)c.restore()
}
/** Paint before the interactive station DOM/sprites and actors. Never bakes duplicate workbenches. */
export function drawOfficeRoomDesign(c:Ctx,scene:OfficeScene,floor:OfficeFloor,art:OfficeRoomArt|null){
 if(!art||floor.kind!=='team'||floor.constructing||floor.annexOf)return
 if(floor.clipHeight!==undefined&&floor.clipHeight<=0.5)return
 const w=scene.width,design=roomDesignFor(floor),lead=roomLeadRestPoint(floor,w)
 const clipped=floor.clipHeight!==undefined||floor.transitionOpacity!==undefined
 if(clipped){
  c.save()
  if(floor.clipHeight!==undefined){c.beginPath();c.rect(0,floor.y,w,floor.clipHeight);c.clip()}
  if(floor.transitionOpacity!==undefined)c.globalAlpha*=floor.transitionOpacity
 }
 try{
  drawOfficeRoomShell(c,scene,floor,art)
  if(floor.desktopArt&&art.canteenShell){
   if(art.planningDesk){
    const desk=roomDesktopPlanningDesk(floor,w)
    const image=art.planningDesk as HTMLImageElement
    const sw=image.naturalWidth??image.width,sh=image.naturalHeight??image.height
    // The plaque uses the same DOM style as the other stations. Keep the furniture on its original anchors.
    const firstRow=Math.round(sh*.182),plaqueDepth=desk.height*firstRow/sh
    c.drawImage(image,0,firstRow,sw,sh-firstRow,desk.left,desk.top+plaqueDepth,desk.width,desk.height-plaqueDepth)
   }
   if(art.leadTable){
    const visitor=roomLeadMeetingPoint(floor,w),center=(lead.x+visitor.x)/2
    const floorHeight=floor.height??w*.72
    // The rug ends at the front bench's canopy so both actors stand on the same floorboards.
    if(art.leadRug)c.drawImage(art.leadRug,center-w*.092,lead.y-floorHeight*.059,w*.184,floorHeight*.066)
    const width=visitor.x-lead.x-w*.014,height=Math.min(floorHeight*.13,w*.095)
    c.drawImage(art.leadTable,center-width/2,lead.y-height-w*.0015,width,height)
   }
   return
  }
  c.save();c.globalCompositeOperation='color';c.globalAlpha=(floor.transitionOpacity??1)*(art.canteenShell?.22:.66)
  c.fillStyle=design.accent;c.fillRect(w*.027,floor.y+w*.122,w*.79,w*.228);c.restore()
  // Keep each room's stained boards in the same palette as the painted shell.
  const h=floor.height??w*.5625,floorStart=floor.y+w*.36,floorEnd=floor.y+h-w*.12
  c.save();c.globalCompositeOperation='color';c.globalAlpha=(floor.transitionOpacity??1)*(art.canteenShell?.12:.36);c.fillStyle=design.accent
  const laneX=w*(design.theme==='operations'?.055:.035),laneWidth=w*(design.theme==='research'?.65:.73)
  c.fillRect(laneX,floorStart,laneWidth,Math.max(0,floorEnd-floorStart))
  if(design.large&&!art.canteenShell){c.globalAlpha=(floor.transitionOpacity??1)*.18;c.fillRect(w*(.055+design.detail*.014),floor.y+w*.49,w*.68,w*.012)}
  c.restore()
  if(!art.canteenShell){
   const x=w*(.045+(design.variant%3)*.018)
   drawRoomProp(c,art,cells[design.theme],x,floor.y+w*.135,w*.245,w*.215)
   drawOfficeRoomCurios(c,scene,floor,art)
  }
  // The chair is wholly inside its workroom, outside work stations and the lift aisle.
  drawRoomProp(c,art,4,lead.x-w*.062,lead.y-w*.115,w*.135,w*.135)
 }finally{
  if(clipped)c.restore()
 }
}