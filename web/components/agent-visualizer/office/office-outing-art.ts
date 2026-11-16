import type {OfficeScene} from '../../../lib/office-types'
import type {OfficeRoomArt} from './office-room-design-art'

export interface OfficeOutingArtGuest {
 actorKey:string
 action:'snack'|'drink'|'stretch'|'stargaze'
 phase:'outbound'|'eating'|'relocating'|'returning'
 floorId:string
 x:number
 y:number
 night:boolean
 collected:boolean
}
type Ctx=CanvasRenderingContext2D

/** Isolated painted parcel or thermos from the buffet cell, never a second stall. */
function detail(c:Ctx,art:OfficeRoomArt,part:'parcel'|'thermos',x:number,y:number,width:number,height:number){
 const image=art.props as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=(image.naturalWidth??image.width??1536)/3,sh=(image.naturalHeight??image.height??1024)/2
 const [sx,sy,w,h]=part==='parcel'?[.79,.37,.18,.18]:[.80,.14,.15,.25]
 c.drawImage(art.props,(2+sx)*sw,(1+sy)*sh,w*sw,h*sh,x,y,width,height)
}

/**
 * Paint after avatars and before the foreground lift/doors. Frames are physical
 * visitor positions; source seats and destination reservations are never used.
 * Avatar poses already supply the mug, eating/stretching hands and upward gaze.
 */
export function drawOfficeOutingArt(c:Ctx,scene:OfficeScene,time:number,art:OfficeRoomArt|null,guests:readonly OfficeOutingArtGuest[]):void {
 if(!art||!guests.length||!Number.isFinite(scene.width)||scene.width<=0)return
 const w=scene.width,actors=new Map(scene.actors.map(actor=>[actor.key,actor])),seen=new Set<string>()
 let cartServed=false
 for(const guest of guests){
  if(seen.has(guest.actorKey))continue
  seen.add(guest.actorKey)
  const actor=actors.get(guest.actorKey),floor=scene.floors.find(f=>f.id===guest.floorId)
  // A stale guest or lift passenger must not leave a parcel floating over a car.
  if(!actor||actor.hidden||actor.pose?.inLift||!floor||!Number.isFinite(guest.x)||!Number.isFinite(guest.y))continue
  if(guest.x<w*.04||guest.x>w*.87||guest.y<floor.y||guest.y>floor.y+(floor.height??w*.5625)||guest.y>scene.height)continue
  if(guest.action==='snack'&&guest.collected&&guest.phase==='returning'){
   // Tiny breathing follows motion time; zero is a completely frozen pose.
   const bob=Number.isFinite(time)&&time!==0?Math.sin(time*1.7)*w*.0006:0
   const x=guest.x+w*.018,y=guest.y-w*.052+bob
   if(y>=0&&x+w*.03<=w)detail(c,art,'parcel',x,y,w*.03,w*.029)
  }
  if(guest.action==='snack'&&guest.collected&&guest.phase==='eating'&&!guest.night&&floor.kind==='lounge'&&!cartServed){
   const h=floor.height??w*.5625
   // The original painted vendor cart is at 78% width. One small parcel on
   // its real countertop signals service; no buffet, shopkeeper or new light.
   detail(c,art,'parcel',w*.755,floor.y+h*.505-w*.025,w*.027,w*.025)
   cartServed=true
  }
  if(guest.action==='drink'&&guest.phase==='eating'&&floor.kind!=='lounge'){
   const x=guest.x+w*.034,y=guest.y-w*.045
   if(y>=0&&x+w*.02<=w)detail(c,art,'thermos',x,y,w*.02,w*.039)
  }
 }
}
