/**
 * Holographic interior for the lead's core: a fine hex lattice, counter-turning instrument rings,
 * a radar sweep and scanlines. Idle holds still and only breathes; work sets it turning.
 * Every gradient lives in a cached sprite, so a frame allocates nothing on the live context.
 */
import { getAgentGlowSprite } from './render-cache'

const TAU = Math.PI * 2
const MAX_SPRITES = 48
const sprites = new Map<string, HTMLCanvasElement>()

/** A cached square sprite `size` canvas units wide, painted at `scale` device pixels per unit. */
function sprite(key: string, width: number, height: number, scale: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cached = sprites.get(key)
  if (cached) { sprites.delete(key); sprites.set(key, cached); return cached }
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  paint(ctx)
  sprites.set(key, canvas)
  // Least recently used goes first.
  if (sprites.size > MAX_SPRITES) sprites.delete(sprites.keys().next().value!)
  return canvas
}

/** Depth glow, scanlines and a glass highlight: the parts that never move. */
function base(r: number, color: string, scale: number, busy: boolean, small: boolean) {
  return sprite(`base|${r}|${color}|${scale}|${busy}|${small}`, r * 2, r * 2, scale, ctx => {
    ctx.translate(r, r)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.clip()
    const well = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    well.addColorStop(0, color + (busy ? '40' : '26'))
    well.addColorStop(0.6, color + '0c')
    well.addColorStop(1, color + '00')
    ctx.fillStyle = well
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.fillStyle = 'rgba(200, 240, 255, 0.05)'
    const gap = Math.max(small ? 3 : 2, r / (small ? 9 : 14))
    for (let y = -r; y < r; y += gap) ctx.fillRect(-r, y, r * 2, 0.6)
    const shine = ctx.createLinearGradient(0, -r, 0, 0)
    shine.addColorStop(0, 'rgba(255,255,255,0.12)')
    shine.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = shine
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.45, r * 0.75, r * 0.4, 0, 0, TAU)
    ctx.fill()
  })
}

/** A hex lattice faded toward the rim and the centre, so the mark stays crisp. */
function lattice(r: number, color: string, scale: number) {
  return sprite(`hex|${r}|${color}|${scale}`, r * 2, r * 2, scale, ctx => {
    const cell = Math.max(3.2, r / 6)
    const w = cell * Math.sqrt(3)
    ctx.strokeStyle = color
    ctx.lineWidth = 0.5
    for (let row = -1; row * cell * 1.5 < r * 2 + cell; row++) {
      for (let col = -1; col * w < r * 2 + w; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0)
        const cy = row * cell * 1.5
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 6 + (i / 6) * TAU
          ctx.lineTo(cx + Math.cos(angle) * cell, cy + Math.sin(angle) * cell)
        }
        ctx.closePath()
        ctx.stroke()
      }
    }
    ctx.globalCompositeOperation = 'destination-in'
    const fade = ctx.createRadialGradient(r, r, r * 0.15, r, r, r)
    fade.addColorStop(0, 'rgba(0,0,0,0.25)')
    fade.addColorStop(0.55, 'rgba(0,0,0,1)')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, r * 2, r * 2)
  })
}

/** Radar wedge pointing along +x: a fading tail behind a bright edge. Drawn rotated. */
function sweep(r: number, color: string, scale: number) {
  return sprite(`sweep|${r}|${color}|${scale}`, r * 2, r * 2, scale, ctx => {
    ctx.translate(r, r)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.clip()
    const wedge = ctx.createConicGradient(0, 0, 0)
    wedge.addColorStop(0, color + '00')
    wedge.addColorStop(0.7, color + '00')
    wedge.addColorStop(0.995, color + '80')
    wedge.addColorStop(1, color + '00')
    ctx.fillStyle = wedge
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.strokeStyle = color + 'dd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(r, 0)
    ctx.stroke()
  })
}

/** A soft horizontal band of light that scans down the core while busy. */
function band(r: number, color: string, scale: number) {
  return sprite(`band|${r}|${color}|${scale}`, r * 2, r * 0.36, scale, ctx => {
    const glow = ctx.createLinearGradient(0, 0, 0, r * 0.36)
    glow.addColorStop(0, color + '00')
    glow.addColorStop(0.5, color + '45')
    glow.addColorStop(1, color + '00')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, r * 2, r * 0.36)
  })
}

/** Ring of short ticks, every fifth one longer. */
function ticks(ctx: CanvasRenderingContext2D, radius: number, count: number, length: number) {
  ctx.beginPath()
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU
    const inner = radius - (i % 5 === 0 ? length * 1.8 : length)
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  ctx.stroke()
}

/** Device pixels per canvas unit, bucketed to halves so sprites stay crisp under zoom without endless re-renders. */
function backingScale(ctx: CanvasRenderingContext2D): number {
  const matrix = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const raw = matrix && typeof matrix === 'object' ? Math.hypot(matrix.a, matrix.b) : 1
  return Number.isFinite(raw) ? Math.min(6, Math.max(1, Math.ceil(raw * 2) / 2)) : 1
}

/**
 * Draw inside a core of radius `radius` centred on (x, y).
 * `busy` turns the rings and sweep; `animate` false freezes everything (reduced effects).
 */
export function drawCoreFx(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, time: number, busy: boolean, animate: boolean) {
  const r = Math.max(4, Math.round(radius))
  const t = animate ? time : 0
  const breathe = animate ? 0.5 + 0.5 * Math.sin(t * 1.6) : 0.5
  const scale = backingScale(ctx)
  // Small cores (the orb at its smallest) get fewer, wider details so they do not turn to mush.
  const small = r * scale < 60
  ctx.save()
  const alpha = ctx.globalAlpha
  ctx.translate(x, y)
  ctx.drawImage(base(r, color, scale, busy, small), -r, -r, r * 2, r * 2)
  ctx.globalAlpha = alpha * (0.24 + 0.12 * breathe)
  ctx.drawImage(lattice(r, color, scale), -r, -r, r * 2, r * 2)
  ctx.globalAlpha = alpha

  if (busy) {
    ctx.save()
    ctx.rotate(t * 2.4)
    ctx.drawImage(sweep(r, color, scale), -r, -r, r * 2, r * 2)
    ctx.restore()
    // The scan band passes top to bottom; the circle clip keeps it inside the core.
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, r - 0.5, 0, TAU)
    ctx.clip()
    const top = ((t * 0.35) % 1) * r * 2.6 - r * 1.48
    ctx.drawImage(band(r, color, scale), -r, top, r * 2, r * 0.36)
    ctx.restore()
  }

  // Instrument rings: ticks one way, a broken arc the other.
  ctx.lineCap = 'round'
  ctx.save()
  ctx.rotate(busy ? t * 0.5 : 0)
  ctx.strokeStyle = color + '70'
  ctx.lineWidth = 0.6
  ticks(ctx, r * 0.9, small ? 20 : 40, Math.max(1.2, r * 0.05))
  ctx.restore()
  ctx.save()
  ctx.rotate(busy ? -t * 0.9 : -0.6)
  ctx.strokeStyle = color + 'b0'
  ctx.lineWidth = 1
  for (const [start, span] of [[0, 1.1], [1.5, 0.35], [2.3, 1.4], [4.1, 0.5], [4.9, 0.9]] as const) {
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.74, start, start + span)
    ctx.stroke()
  }
  ctx.restore()
  // Fine inner orbit with a single glowing bead.
  ctx.strokeStyle = color + '38'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.58, 0, TAU)
  ctx.stroke()
  const bead = busy ? t * 1.7 : -Math.PI / 4
  const bx = Math.cos(bead) * r * 0.58, by = Math.sin(bead) * r * 0.58
  const halo = Math.max(3, r * 0.16)
  ctx.drawImage(getAgentGlowSprite(color, 0, halo, '90'), bx - halo, by - halo, halo * 2, halo * 2)
  ctx.fillStyle = '#eaffff'
  ctx.beginPath()
  ctx.arc(bx, by, Math.max(0.9, r * 0.045), 0, TAU)
  ctx.fill()
  ctx.restore()
}
