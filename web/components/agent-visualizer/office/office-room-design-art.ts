import type {OfficeFloor,OfficeScene} from '../../../lib/office-types'
import {roomDesignFor,roomLeadRestPoint,type OfficeRoomTheme} from '../../../lib/office-room-design'

export interface OfficeRoomArt {shell:CanvasImageSource;props:CanvasImageSource;breakRoom:CanvasImageSource}
type Ctx=CanvasRenderingContext2D
/** Atlas uses equal cells: studio, operations, research / quality, reading nook, buffet. */
export function drawRoomProp(c:Ctx,art:OfficeRoomArt,cell:number,x:number,y:number,w:number,h=w){
 const source=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=(source.naturalWidth??source.width??1536)/3,sh=(source.naturalHeight??source.height??1024)/2
 c.drawImage(art.props,(cell%3)*sw,Math.floor(cell/3)*sh,sw,sh,x,y,w,h)
}
/** Extends actual floorboards, preserving the old wall/soil scale and timber edges. */
export function drawOfficeRoomShell(c:Ctx,scene:OfficeScene,floor:OfficeFloor,art:OfficeRoomArt){
 const w=scene.width,h=floor.height??w*.5625,y=floor.y
 const source=art.shell as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=source.naturalWidth??source.width??1000,sh=source.naturalHeight??source.height??563
 const wall=sh*.64,soil=sh*.21,top=wall*w/sw,bottom=soil*w/sw
 c.drawImage(art.shell,0,0,sw,wall,0,y,w,top)
 c.drawImage(art.shell,0,wall,sw,sh-wall-soil,0,y+top,w,Math.max(1,h-top-bottom))
 c.drawImage(art.shell,0,sh-soil,sw,soil,0,y+h-bottom,w,bottom)
}
const cells:Record<OfficeRoomTheme,number>={studio:0,operations:1,research:2,quality:3}
/** Paint before the interactive station DOM/sprites and actors. Never bakes duplicate workbenches. */
export function drawOfficeRoomDesign(c:Ctx,scene:OfficeScene,floor:OfficeFloor,art:OfficeRoomArt|null){
 if(!art||floor.kind!=='team'||floor.constructing||floor.annexOf)return
 const w=scene.width,design=roomDesignFor(floor),lead=roomLeadRestPoint(floor,w)
 drawOfficeRoomShell(c,scene,floor,art)
 c.save();c.globalCompositeOperation='color';c.globalAlpha=.66
 c.fillStyle=design.accent;c.fillRect(w*.027,floor.y+w*.122,w*.79,w*.228);c.restore()
 // Transparent wood stain retains every painted board and its grain. Separate
 // lanes make the two deep work zones visible without repainting the architecture.
 const h=floor.height??w*.5625,floorStart=floor.y+w*.36,floorEnd=floor.y+h-w*.12
 c.save();c.globalCompositeOperation='color';c.globalAlpha=.36;c.fillStyle=design.accent
 const laneX=w*(design.theme==='operations'?.055:.035),laneWidth=w*(design.theme==='research'?.65:.73)
 c.fillRect(laneX,floorStart,laneWidth,Math.max(0,floorEnd-floorStart))
 if(design.large){c.globalAlpha=.18;c.fillRect(w*(.055+design.detail*.014),floor.y+w*.49,w*.68,w*.012)}
 c.restore()
 // Distinct painted mission panel; the central live chalkboard stays free.
 const x=w*(.045+(design.variant%3)*.018)
 drawRoomProp(c,art,cells[design.theme],x,floor.y+w*.135,w*.245,w*.215)
 // A second small painted tool display gives each theme a distinct room balance.
 // Cropped fragments are wall-mounted; none duplicate an interactive workbench.
 const source=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=(source.naturalWidth??source.width??1536)/3,sh=(source.naturalHeight??source.height??1024)/2
 const detail:Record<OfficeRoomTheme,readonly[number,number,number,number]>={studio:[.05,.48,.57,.35],operations:[.30,.28,.50,.39],research:[.53,.26,.41,.47],quality:[.09,.62,.73,.27]}
 const [sx,sy,swidth,sheight]=detail[design.theme],cell=cells[design.theme]
 c.drawImage(art.props,(cell%3+sx)*sw,(Math.floor(cell/3)+sy)*sh,sw*swidth,sh*sheight,w*(.65+(design.detail%2)*.018),floor.y+w*(.15+Math.floor(design.detail/2)*.024),w*.145,w*.10)
 // The chair is wholly inside its workroom, outside work stations and the lift aisle.
 drawRoomProp(c,art,4,lead.x-w*.062,lead.y-w*.115,w*.135,w*.135)
}
