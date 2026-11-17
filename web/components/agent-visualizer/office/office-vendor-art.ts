import type { OfficeScene,OfficePose } from '../../../lib/office-types'
import type { Season, Weather } from '../../../lib/office-sky'
import { officeVendorState, type OfficeVendorExchange } from '../../../lib/office-vendor'
import {officeActorDepthScale} from '../../../lib/office-depth'

type Ctx = CanvasRenderingContext2D
export function drawOfficeShopQueue(c:Ctx,scene:OfficeScene,queue:import('../../../lib/office-types').OfficeDailyVisual['shopQueue']){
 if(!queue)return
 const unit=scene.width/450
 c.save()
 for(const mark of queue.marks){
  const floor=scene.floors.find(f=>f.id===mark.floorId)
  if(!floor||floor.kind!=='lounge')continue
  c.globalAlpha=mark.actorKey?(mark.arrived?.7:.45):.24
  c.strokeStyle='#e3cf9f';c.lineWidth=1.2*unit
  c.beginPath();c.ellipse(mark.x,mark.y,10*unit,3*unit,0,0,Math.PI*2);c.stroke()
  c.fillStyle='#e3cf9f';c.beginPath();c.ellipse(mark.x-3*unit,mark.y,1.3*unit,1.8*unit,0,0,Math.PI*2);c.ellipse(mark.x+3*unit,mark.y,1.3*unit,1.8*unit,0,0,Math.PI*2);c.fill()
 }
 c.restore()
}
export interface OfficeVendorCharacter {
  /** Absolute scene feet origin and multiplier for the existing 76px avatar. */
  x: number
  y: number
  scale: number
  face: 1 | -1
  serving: boolean
  season: Season
  weather: Weather
  pose: 'serve' | 'idle' | 'handoff' | 'prepare' | 'tidy' | 'stock'
  supportHands?:{left:{x:number;y:number};right:{x:number;y:number}}
  turn?:number
  offer?: number
  recipientKey?: string
}

/** Activate the avatar's supported-hand path; typing is a paint flag, not task state. */
export function officeVendorAvatarPose(staff:OfficeVendorCharacter):OfficePose {
  return {face:staff.face,offer:staff.offer,supportHands:staff.supportHands,turn:staff.turn,typing:Boolean(staff.supportHands)}
}

/** The cart is already painted into the garden. Only staff and small stock/sign accents live here.
 * Callback runs inside a saved bounded clip, using absolute coordinates; the caller applies scale.
 * No appearance/model import keeps the decorative NPC independent of actors and reservations.
 */
export function drawOfficeVendor(c: Ctx, scene: OfficeScene, date: Date, time: number, drawCharacter: (character: OfficeVendorCharacter) => void, exchange: OfficeVendorExchange | null = null): void {
  const garden = scene.floors.find(f => f.kind === 'lounge'), w = scene.width, h = garden?.height ?? 0
  if (!garden || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(garden.y) || w <= 0 || h <= 0) return
  const state = officeVendorState(date), k = w / 450, gy = garden.y
  const stock: Record<Season, string> = { hot: '#e6bb59', rainy: '#b7c5ad', cool: '#d8a17b' }
  c.save()
  if(state.staffed&&!state.wet){
    // Fold-out preparation shelf joins the painted cart to the clerk's hands.
    c.fillStyle='#805431';c.fillRect(w*.725,gy+h*.574,w*.035,h*.018)
    c.fillStyle='#d2a26a';c.fillRect(w*.722,gy+h*.57,w*.04,h*.009)
    c.strokeStyle='#60462d';c.lineWidth=1.5*k;c.beginPath();c.moveTo(w*.73,gy+h*.59);c.lineTo(w*.757,gy+h*.64);c.stroke()
  }
  if (state.staffed) {
    // Dry: full-sized staff beside the cart's left edge, feet on its frontage.
    // Wet: head and shoulders retreat into the existing window underneath its awning.
    const sheltered = state.wet
    const customer = exchange && state.open ? scene.actors.find(a => a.key === exchange.actorKey && !a.hidden && a.floorId === garden.id && !a.pose?.walk && !a.pose?.inLift) : undefined
    const handoff = Boolean(customer && Number.isFinite(exchange?.progress) && exchange!.progress >= 0 && exchange!.progress < 1)
    // Quiet gaps separate grounded chores. These are decorative gestures only;
    // a real pickup always owns the hands, and sheltered staff stay still.
    const clock=Number.isFinite(time)&&time>0?time%36:0
    const chore=!sheltered&&!handoff?(clock>=4&&clock<10?'prepare':clock>=14&&clock<20?'tidy':clock>=24&&clock<30?'stock':'idle'):'idle'
    const start=chore==='prepare'?4:chore==='tidy'?14:24
    const elapsed=clock-start
    const ramp=chore==='idle'?0:Math.min(1,elapsed,6-elapsed)
    const reach=ramp*ramp*(3-2*ramp)
    const sweep=chore==='tidy'?Math.sin((elapsed-1)*2.2)*5*reach:0
    const character: OfficeVendorCharacter = {
      x: w * (sheltered ? .778 : .705), y: gy + h * (sheltered ? .62 : .667),
      scale: k * (sheltered ? .44 : officeActorDepthScale(scene,{floorId:garden.id,y:gy+h*.667})), face: 1,
      serving: state.open, season: state.season, weather: state.weather,
      pose: handoff ? 'handoff' : chore,
      ...(reach>0?{turn:.15*reach,supportHands:{left:{x:-15+3*reach,y:-21-6*reach},right:{x:16+(-1+sweep)*reach,y:-23-6*reach}}}:{}),
      ...(handoff ? { face: customer!.x < w*.705 ? -1 as const : 1 as const, offer: .22, recipientKey: exchange!.actorKey } : {}),
    }
    c.save(); c.beginPath()
    c.rect(w * (sheltered ? .745 : .655), gy + h * (sheltered ? .485 : .36), w * (sheltered ? .067 : .135), h * (sheltered ? .112 : .35))
    c.clip()
    drawCharacter(character)
    // Small cream apron over the uniform; preserves the caller's face, hair and seasonal layer.
    c.save(); c.translate(character.x, character.y); c.scale(character.scale, character.scale)
    c.fillStyle = '#ead7ac'; c.strokeStyle = '#785e3f'; c.lineWidth = 1.1
    c.beginPath(); c.moveTo(-7,-32); c.lineTo(7,-32); c.lineTo(10,-13); c.lineTo(-10,-13); c.closePath(); c.fill(); c.stroke()
    c.strokeStyle = '#f7edd2'; c.lineWidth = 2
    c.beginPath(); c.moveTo(-7,-32); c.lineTo(-10,-36); c.moveTo(7,-32); c.lineTo(10,-36); c.stroke()
    c.fillStyle = stock[state.season]; c.fillRect(-5,-23,10,5)
    // The working hand carries the cloth, tray or stock tin; never a purchase bag.
    if(character.supportHands){
      const hand=character.supportHands.right
      c.fillStyle=chore==='tidy'?'#b9d2c2':chore==='stock'?'#9b653e':'#e3bc77'
      c.strokeStyle='#61432f';c.lineWidth=.8
      c.fillRect(hand.x-5,hand.y-1,10,chore==='stock'?7:3)
      c.strokeRect(hand.x-5,hand.y-1,10,chore==='stock'?7:3)
      if(chore==='prepare'){c.fillStyle='#a65f3b';for(let i=0;i<3;i++)c.fillRect(hand.x-4+i*3,hand.y-3,2,2)}
    }
    c.restore(); c.restore()
  }
  // Dress the original stall, keeping every accent inside its own frontage.
  // Seasonal colour and wares remain visible when service closes for the night.
  c.save();c.beginPath();c.rect(w*.747,gy+h*.35,w*.087,h*.30);c.clip()
  c.strokeStyle='#77563a';c.lineWidth=k
  c.beginPath();c.moveTo(w*.755,gy+h*.40);c.quadraticCurveTo(w*.785,gy+h*.425,w*.82,gy+h*.40);c.stroke()
  for(let i=0;i<5;i++){
    const px=w*(.758+i*.014),py=gy+h*(.403+Math.sin(i*Math.PI/4)*.012)
    c.fillStyle=stock[state.season];c.beginPath();c.moveTo(px-2*k,py);c.lineTo(px+2*k,py);c.lineTo(px,py+5*k);c.closePath();c.fill()
  }
  // Warm drinks in the cool season, fruit in heat, covered tins in rain.
  for(let i=0;i<3&&!(state.staffed&&state.wet);i++){
    const px=w*.773+i*5*k,py=gy+h*.55
    c.fillStyle=stock[state.season];c.strokeStyle='#694731';c.lineWidth=.7*k
    if(state.season==='hot'){c.beginPath();c.ellipse(px,py,2*k,2.5*k,0,0,Math.PI*2);c.fill()}
    else {c.fillRect(px-2*k,py-5*k,4*k,5*k);c.strokeRect(px-2*k,py-5*k,4*k,5*k);if(state.season==='rainy')c.fillRect(px-2.5*k,py-6*k,5*k,k)}
  }
  c.restore()
  // These few pixels sit on the painted counter fascia, never over the roof or lift.
  c.beginPath(); c.rect(w*.745,gy+h*.59,w*.073,h*.065); c.clip()
  const x=w*.759,y=gy+h*.614
  c.fillStyle='#543f2b'; c.fillRect(x,y,13*k,6*k)
  c.fillStyle=state.open?'#a3be7a':state.wet?'#9eafb1':'#b39470'
  c.fillRect(x+1*k,y+1*k,11*k,4*k)
  // Open: tiny plate/stock. Closed: diagonal latch, no buying invitation or invented purchase.
  if(state.open){
    c.fillStyle=stock[state.season]
    for(let i=0;i<3;i++){c.beginPath();c.ellipse(w*.797+i*2*k,gy+h*.606,1.4*k,1.7*k,0,0,Math.PI*2);c.fill()}
  }else{
    c.strokeStyle='#624e38';c.lineWidth=k;c.beginPath();c.moveTo(x+3*k,y+4*k);c.lineTo(x+10*k,y+2*k);c.stroke()
  }
  c.restore()
}
