import type {OfficeScene} from '../../../lib/office-types'
import {drawOfficeRoomShell,drawRoomProp,type OfficeRoomArt} from './office-room-design-art'

export interface OfficeDailyVisualState {
 /** Explicit visual overrides while a trip or meal outlives its admission window. */
 kind?:'coffee'|'lunch'|'tea'|null
 delivered?:boolean
 eatingKeys?:ReadonlySet<string>
}
type Ctx=CanvasRenderingContext2D
/** Cosmetic only; never selects participants or changes a task's status. Paint before actors. */
export function drawOfficeDailyArt(c:Ctx,scene:OfficeScene,date:Date,state:OfficeDailyVisualState={},art:OfficeRoomArt|null=null){
 if(!art)return
 const w=scene.width,minute=date.getHours()*60+date.getMinutes()
 const lunch=state.kind==='lunch'||minute>=710&&minute<780,coffee=state.kind==='coffee'||minute>=510&&minute<570,tea=state.kind==='tea'||minute>=900&&minute<930
 for(const floor of scene.floors){
  if(String(floor.room)!=='room-canteen')continue
  drawOfficeRoomShell(c,scene,floor,art)
  const h=floor.height??w*.5625
  drawRoomProp(c,art,5,w*.12,floor.y+w*.15,w*.31,w*.225)
  // Four individual painted dining chairs; positions match OFFICE_CANTEEN_SEATS.
  for(const x of [.30,.45,.63,.78]){
   const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number}
   const sw=(p.naturalWidth??1536)/3,sh=(p.naturalHeight??1024)/2
   c.drawImage(art.props,sw,sh+sh*.21,sw*.65,sh*.74,w*(x-.046),floor.y+h*.70-w*.095,w*.092,w*.105)
  }
  // Reuse the old painted wooden game table as two dining tables, covering its board with food.
  for(const x of [.29,.62]){
   c.drawImage(art.breakRoom,280,327,165,73,w*x,floor.y+h*.70-w*.035,w*.16,w*.075)
   const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number}
   const sw=(p.naturalWidth??1536)/3,sh=(p.naturalHeight??1024)/2
   c.drawImage(art.props,sw*2+sw*.10,sh+sh*.36,sw*.55,sh*.15,w*(x+.018),floor.y+h*.70-w*.041,w*.13,w*.035)
  }
 }
 const surface=scene.floors.find(f=>f.kind==='lounge')
 if(surface&&lunch){
  const h=surface.height??w*.56
  // A compact lunch stall uses the painted buffet, including parcels and return trays.
  drawRoomProp(c,art,5,w*.025,surface.y+h*.46,w*.19,w*.135)
 }
 if(coffee||tea){
  for(const floor of scene.floors.filter(f=>f.kind==='break'&&String(f.room)!=='room-canteen')){
   // Thermos/parcel detail from the buffet cell; no additional furniture over the lounge.
   const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number}
   const sw=(p.naturalWidth??1536)/3,sh=(p.naturalHeight??1024)/2
   c.drawImage(art.props,sw*2+sw*.74,sh+sh*.16,sw*.24,sh*.43,w*.105,floor.y+w*.29,w*.04,w*.072)
  }
 }
 if(state.eatingKeys)for(const actor of scene.actors){
  if(actor.hidden||!state.eatingKeys.has(actor.key))continue
  // A held painted food tray, attached to the actual animated body position.
  const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number}
  const sw=(p.naturalWidth??1536)/3,sh=(p.naturalHeight??1024)/2
  c.drawImage(art.props,sw*2+sw*.10,sh+sh*.36,sw*.55,sh*.15,actor.x-w*.027,actor.y-w*.044,w*.054,w*.02)
 }
}
