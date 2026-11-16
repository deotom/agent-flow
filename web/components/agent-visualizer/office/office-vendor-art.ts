import type { OfficeScene } from '../../../lib/office-types'
import type { Season, Weather } from '../../../lib/office-sky'
import { officeVendorState, type OfficeVendorExchange } from '../../../lib/office-vendor'
import {officeActorDepthScale} from '../../../lib/office-depth'

type Ctx = CanvasRenderingContext2D
export interface OfficeVendorCharacter {
  /** Absolute scene feet origin and multiplier for the existing 76px avatar. */
  x: number
  y: number
  scale: number
  face: 1 | -1
  serving: boolean
  season: Season
  weather: Weather
  pose: 'serve' | 'idle' | 'handoff'
  offer?: number
  recipientKey?: string
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
  if (state.staffed) {
    // Dry: full-sized staff beside the cart's left edge, feet on its frontage.
    // Wet: head and shoulders retreat into the existing window underneath its awning.
    const sheltered = state.wet
    const customer = exchange && state.open ? scene.actors.find(a => a.key === exchange.actorKey && !a.hidden && a.floorId === garden.id && !a.pose?.walk && !a.pose?.inLift) : undefined
    const handoff = Boolean(customer && Number.isFinite(exchange?.progress) && exchange!.progress >= 0 && exchange!.progress < 1)
    const character: OfficeVendorCharacter = {
      x: w * (sheltered ? .778 : .705), y: gy + h * (sheltered ? .62 : .667),
      scale: k * (sheltered ? .44 : officeActorDepthScale(scene,{floorId:garden.id,y:gy+h*.667})), face: 1,
      serving: state.open, season: state.season, weather: state.weather,
      pose: handoff ? 'handoff' : 'idle',
      ...(handoff ? { face: customer!.x < w*.705 ? -1 as const : 1 as const, offer: .22, recipientKey: exchange!.actorKey } : {}),
    }
    c.save(); c.beginPath()
    c.rect(w * (sheltered ? .745 : .655), gy + h * (sheltered ? .485 : .36), w * (sheltered ? .067 : .10), h * (sheltered ? .112 : .35))
    c.clip()
    drawCharacter(character)
    // Small cream apron over the uniform; preserves the caller's face, hair and seasonal layer.
    c.save(); c.translate(character.x, character.y); c.scale(character.scale, character.scale)
    c.fillStyle = '#ead7ac'; c.strokeStyle = '#785e3f'; c.lineWidth = 1.1
    c.beginPath(); c.moveTo(-7,-32); c.lineTo(7,-32); c.lineTo(10,-13); c.lineTo(-10,-13); c.closePath(); c.fill(); c.stroke()
    c.strokeStyle = '#f7edd2'; c.lineWidth = 2
    c.beginPath(); c.moveTo(-7,-32); c.lineTo(-10,-36); c.moveTo(7,-32); c.lineTo(10,-36); c.stroke()
    c.fillStyle = stock[state.season]; c.fillRect(-5,-23,10,5)
    c.restore(); c.restore()
  }
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
