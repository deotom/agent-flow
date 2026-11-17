import type { OfficeScene,OfficePose,OfficePoint } from '../../../lib/office-types'
import type { Season, Weather } from '../../../lib/office-sky'
import { officeVendorState, type OfficeVendorExchange } from '../../../lib/office-vendor'
import {officeActorDepthScale} from '../../../lib/office-depth'

type Ctx = CanvasRenderingContext2D
function drawShopTool(c:Ctx,kind:'prepare'|'tidy'|'stock',point:OfficePoint,scale:number){
 c.save()
 c.fillStyle=kind==='tidy'?'#b9d2c2':kind==='stock'?'#9b653e':'#e3bc77'
 c.strokeStyle='#61432f';c.lineWidth=.8*scale
 c.fillRect(point.x-5*scale,point.y-scale,10*scale,(kind==='stock'?7:3)*scale);c.strokeRect(point.x-5*scale,point.y-scale,10*scale,(kind==='stock'?7:3)*scale)
 if(kind==='prepare'){c.fillStyle='#a65f3b';for(let i=0;i<3;i++)c.fillRect(point.x+(-4+i*3)*scale,point.y-3*scale,2*scale,2*scale)}
 c.restore()
}
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
  /** Avatar-local contacts derived from fixed shelf/bin/counter positions. */
  shopAction?:{held:boolean;progress:number;source:OfficePoint;destination:OfficePoint;prop:OfficePoint}
  offer?: number
  recipientKey?: string
}

/** Explicit supported hands do not imply typing or its keyboard-speed head bob. */
export function officeVendorAvatarPose(staff:OfficeVendorCharacter):OfficePose {
  return {face:staff.face,offer:staff.offer,supportHands:staff.supportHands,turn:staff.turn}
}

// Canvas-local presentation continuity only. No actor, trip or purchase state is written.
type ChoreMemo={at:number;width:number;last:OfficeVendorCharacter|null;wasHandoff:boolean;blocked?:string;returning?:{at:number;duration:number;previous:OfficeVendorCharacter}}
const choreMemos=new WeakMap<Ctx,ChoreMemo>()

/** The cart is already painted into the garden. Only staff and small stock/sign accents live here.
 * Callback runs inside a saved bounded clip, using absolute coordinates; the caller applies scale.
 * No appearance/model import keeps the decorative NPC independent of actors and reservations.
 */
export function drawOfficeVendor(c: Ctx, scene: OfficeScene, date: Date, time: number, drawCharacter: (character: OfficeVendorCharacter) => void, exchange: OfficeVendorExchange | null = null): void {
  const garden = scene.floors.find(f => f.kind === 'lounge'), w = scene.width, h = garden?.height ?? 0
  if (!garden || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(garden.y) || w <= 0 || h <= 0) return
  const state = officeVendorState(date), k = w / 450, gy = garden.y
  if(!state.open||!Number.isFinite(time)||time<=0)choreMemos.delete(c)
  const stock: Record<Season, string> = { hot: '#e6bb59', rainy: '#b7c5ad', cool: '#d8a17b' }
  c.save()
  if(state.staffed&&!state.wet){
    // Fold-out preparation shelf joins the painted cart to the clerk's hands.
    c.fillStyle='#805431';c.fillRect(w*.725,gy+h*.574,w*.035,h*.018)
    c.fillStyle='#d2a26a';c.fillRect(w*.722,gy+h*.57,w*.04,h*.009)
    c.strokeStyle='#60462d';c.lineWidth=1.5*k;c.beginPath();c.moveTo(w*.73,gy+h*.59);c.lineTo(w*.757,gy+h*.64);c.stroke()
    // Stock bin beneath the shelf, cloth hook and a tray on the preparation top.
    c.fillStyle='#815b37';c.fillRect(w*.73-7*k,gy+h*.64,14*k,9*k)
    c.strokeStyle='#d1a365';c.lineWidth=k;c.strokeRect(w*.73-7*k,gy+h*.64,14*k,9*k)
    c.fillStyle='#c79b62';c.fillRect(w*.73-8*k,gy+h*.64,16*k,2*k)
    c.strokeStyle='#674c34';c.beginPath();c.moveTo(w*.728,gy+h*.58);c.lineTo(w*.728,gy+h*.60);c.stroke()
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
    const nominal=clock>=4&&clock<10?'prepare':clock>=14&&clock<20?'tidy':clock>=24&&clock<30?'stock':'idle'
    const token=`${Math.floor(time/36)}:${nominal}`
    const saved=choreMemos.get(c)
    const memo:ChoreMemo=saved&&saved.width===w&&time>=saved.at?saved:{at:time,width:w,last:null,wasHandoff:false}
    if(handoff){
      if(!memo.wasHandoff&&memo.last?.shopAction)memo.returning={at:time,duration:Math.min(.24,(1-exchange!.progress)*1.4*.4),previous:memo.last}
      if(nominal!=='idle')memo.blocked=token
    }
    const chore=!sheltered&&!handoff&&memo.blocked!==token?nominal:'idle'
    const start=chore==='prepare'?4:chore==='tidy'?14:24
    const x=w*(sheltered?.778:.705),y=gy+h*(sheltered?.62:.667)
    const scale=k*(sheltered?.44:officeActorDepthScale(scene,{floorId:garden.id,y}))
    const local=(px:number,py:number):OfficePoint=>({x:(px-x)/scale,y:(py-y)/scale})
    const mix=(a:OfficePoint,b:OfficePoint,t:number):OfficePoint=>{const p=Math.max(0,Math.min(1,t)),e=p*p*(3-2*p);return {x:a.x+(b.x-a.x)*e,y:a.y+(b.y-a.y)*e}}
    const rest={x:16,y:-23},progress=chore==='idle'?0:(clock-start)/6
    const homes={tidy:local(w*.728,gy+h*.59+scale),prepare:local(w*.738,gy+h*.571-2*scale),stock:local(w*.73,gy+h*.64-6*scale)}
    const source=chore==='idle'?rest:homes[chore]
    const target=chore==='stock'?local(w*.756,gy+h*.55-6*scale):chore==='tidy'?local(w*.744,gy+h*.592-2*scale):local(w*.738,gy+h*.571-2*scale-5*k)
    // Reusable tools go home after use: no object jumps to another holder at wrap.
    const destination=source
    const held=progress>=.18&&progress<.82
    let hand=progress<.18?mix(rest,source,progress/.18):progress<.4?mix(source,target,(progress-.18)/.22):progress<.65?target:progress<.82?mix(target,destination,(progress-.65)/.17):mix(destination,rest,(progress-.82)/.18)
    if(chore==='tidy'&&progress>=.4&&progress<.65)hand={...hand,x:hand.x+Math.sin((progress-.4)/.25*Math.PI*4)*4}
    const prop=progress<.18?source:held?hand:destination
    const reach=chore==='idle'?0:Math.min(1,progress/.18,(1-progress)/.18)
    let character: OfficeVendorCharacter = {
      x,y,scale,face:1,
      serving: state.open, season: state.season, weather: state.weather,
      pose: handoff ? 'handoff' : chore,
      ...(chore!=='idle'?{shopAction:{held,progress,source,destination,prop},turn:.15*reach,supportHands:{left:{x:-15+3*reach,y:-21-6*reach},right:hand}}:{}),
      ...(handoff ? { face: customer!.x < w*.705 ? -1 as const : 1 as const, offer: .22, recipientKey: exchange!.actorKey } : {}),
    }
    if(memo.returning){
      const old=memo.returning.previous,a=old.shopAction!,p=Math.max(0,(time-memo.returning.at)/memo.returning.duration)
      if(p<1){
        const prop=a.held?mix(a.prop,a.source,p/.75):a.source
        const right=a.held&&p<.75?prop:mix(a.held?a.source:old.supportHands!.right,rest,a.held?(p-.75)/.25:p)
        character={...old,offer:undefined,recipientKey:undefined,turn:(old.turn??0)*(1-p),supportHands:{left:mix(old.supportHands!.left,{x:-15,y:-21},p),right},shopAction:{...a,held:a.held&&p<.75,prop}}
      }else memo.returning=undefined
    }
    if(state.open&&Number.isFinite(time)&&time>0){memo.at=time;memo.last=character;memo.wasHandoff=handoff;choreMemos.set(c,memo)}
    if(!sheltered){
      // Holder phases keep the same behind-body layer; only a held tool is foreground.
      for(const kind of ['tidy','stock','prepare'] as const){
        const active=character.pose===kind?character.shopAction:undefined
        if(active?.held)continue
        const point=active?.prop??homes[kind]
        drawShopTool(c,kind,{x:x+point.x*scale,y:y+point.y*scale},scale)
      }
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
    if(character.shopAction?.held){
      drawShopTool(c,character.pose as 'prepare'|'tidy'|'stock',character.shopAction.prop,1)
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
