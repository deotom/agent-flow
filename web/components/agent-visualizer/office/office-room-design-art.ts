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
 c.save();c.globalCompositeOperation='multiply';c.globalAlpha=.25
 c.fillStyle=design.accent;c.fillRect(w*.027,floor.y+w*.122,w*.79,w*.228);c.restore()
 // Distinct painted mission panel; the central live chalkboard stays free.
 const x=w*(design.variant%2?.075:.045)
 drawRoomProp(c,art,cells[design.theme],x,floor.y+w*.135,w*.245,w*.215)
 // The chair is wholly inside its workroom, outside work stations and the lift aisle.
 drawRoomProp(c,art,4,lead.x-w*.062,lead.y-w*.115,w*.135,w*.135)
}
