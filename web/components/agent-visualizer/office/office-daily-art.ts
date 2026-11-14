import type {OfficeScene} from '../../../lib/office-types'
import {drawOfficeRoomShell,drawRoomProp,type OfficeRoomArt} from './office-room-design-art'
import {skyWeather,type Weather} from '../../../lib/office-sky'

export interface OfficeDailyVisualState {
 /** Explicit visual overrides while a trip or meal outlives its admission window. */
 kind?:'coffee'|'lunch'|'tea'|null
 delivered?:boolean
 cleanup?:boolean
 weather?:Weather
 eatingKeys?:ReadonlySet<string>
}
type Ctx=CanvasRenderingContext2D
type LunchStage='delivery'|'meal'|'cleanup'|null
/** Clock windows are local, with bounded runtime overrides for an ongoing visit. */
function lunchStage(minute:number,state:OfficeDailyVisualState):LunchStage {
 if(state.cleanup||minute>=765&&minute<780)return 'cleanup'
 if(state.kind==='lunch'||minute>=720&&minute<765||state.kind!=='coffee'&&state.kind!=='tea'&&(state.eatingKeys?.size??0)>0)return 'meal'
 if(state.delivered||minute>=710&&minute<720)return 'delivery'
 return null
}
function buffetDetail(c:Ctx,art:OfficeRoomArt,part:'parcel'|'returns'|'closed',x:number,y:number,w:number,h:number){
 const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=(p.naturalWidth??p.width??1536)/3,sh=(p.naturalHeight??p.height??1024)/2
 const crop={parcel:[.74,.16,.24,.43],returns:[.54,.72,.34,.17],closed:[.04,.53,.92,.38]}[part]
 c.drawImage(art.props,(2+crop[0])*sw,(1+crop[1])*sh,sw*crop[2],sh*crop[3],x,y,w,h)
}
/** Cosmetic only; never selects participants or changes a task's status. Paint before actors. */
export function drawOfficeDailyArt(c:Ctx,scene:OfficeScene,date:Date,state:OfficeDailyVisualState={},art:OfficeRoomArt|null=null){
 if(!art)return
 const w=scene.width,minute=date.getHours()*60+date.getMinutes()
 const stage=lunchStage(minute,state),weather=state.weather??skyWeather(date)
 const coffee=state.kind==='coffee'||minute>=510&&minute<570,tea=state.kind==='tea'||minute>=900&&minute<930
 for(const floor of scene.floors){
  if(String(floor.room)!=='room-canteen')continue
  drawOfficeRoomShell(c,scene,floor,art)
  const h=floor.height??w*.5625
  if(stage==='meal')drawRoomProp(c,art,5,w*.12,floor.y+w*.15,w*.31,w*.225)
  else{
   // The same painted counter with food removed: only its lower woodwork,
   // dishes and closed storage remain while parcels arrive or trays return.
   buffetDetail(c,art,'closed',w*.1324,floor.y+w*.26925,w*.2852,w*.0855)
   if(stage==='delivery')buffetDetail(c,art,'parcel',w*.28,floor.y+w*.205,w*.0744,w*.09675)
   if(stage==='cleanup')buffetDetail(c,art,'returns',w*.30,floor.y+w*.25,w*.1054,w*.03825)
  }
  // Four individual painted dining chairs; positions match OFFICE_CANTEEN_SEATS.
  for(const x of [.30,.45,.63,.78]){
   const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number}
   const sw=(p.naturalWidth??1536)/3,sh=(p.naturalHeight??1024)/2
   c.drawImage(art.props,sw,sh+sh*.21,sw*.65,sh*.74,w*(x-.046),floor.y+h*.70-w*.095,w*.092,w*.105)
  }
  // Reuse the old painted wooden game table as two dining tables, covering its board with food.
  for(const x of [.29,.62]){
   c.drawImage(art.breakRoom,280,327,165,73,w*x,floor.y+h*.70-w*.035,w*.16,w*.075)
   if(stage==='meal'){
    const p=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number}
    const sw=(p.naturalWidth??1536)/3,sh=(p.naturalHeight??1024)/2
    c.drawImage(art.props,sw*2+sw*.10,sh+sh*.36,sw*.55,sh*.15,w*(x+.018),floor.y+h*.70-w*.041,w*.13,w*.035)
   }else if(stage==='cleanup')buffetDetail(c,art,'returns',w*(x+.045),floor.y+h*.70-w*.035,w*.065,w*.025)
  }
 }
 const surface=scene.floors.find(f=>f.kind==='lounge')
 if(surface&&stage&&weather!=='rain'&&weather!=='storm'){
  const h=surface.height??w*.56
  // A compact lunch stall uses the painted buffet, including parcels and return trays.
  if(stage==='meal')drawRoomProp(c,art,5,w*.025,surface.y+h*.46,w*.19,w*.135)
  if(stage==='delivery')buffetDetail(c,art,'parcel',w*.055,surface.y+h*.55,w*.073,w*.097)
  if(stage==='cleanup')buffetDetail(c,art,'returns',w*.055,surface.y+h*.57,w*.085,w*.038)
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
