/**
 * Interior for the lead's core: a minimap of source code in syntax colours plus counter-turning
 * instrument rings. Idle holds still and only breathes; work scrolls the code and turns the rings.
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
    const shine = ctx.createLinearGradient(0, -r, 0, 0)
    shine.addColorStop(0, 'rgba(255,255,255,0.12)')
    shine.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = shine
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.45, r * 0.75, r * 0.4, 0, 0, TAU)
    ctx.fill()
  })
}

const SYNTAX = ['#c7a6ff', '#5fe1ff', '#ffd479', '#7dffb0', '#dce9f7', '#5fe1ff']

/** Small deterministic generator so the "code" is the same every frame and every launch. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Line pitch of the code tile; the tile is a whole number of lines so it wraps seamlessly. */
function codePitch(r: number, small: boolean) {
  const pitch = Math.max(small ? 4 : 3, r / (small ? 6 : 7.5))
  const lines = Math.max(4, Math.round((r * 2) / pitch))
  return { pitch: (r * 2) / lines, lines }
}

/** A minimap of source code: indented token bars in syntax colours, with a faint gutter. */
function codeTile(r: number, scale: number, small: boolean) {
  const { pitch, lines } = codePitch(r, small)
  return sprite(`code|${r}|${scale}|${small}`, r * 2, r * 2, scale, ctx => {
    const random = seeded(r * 7919 + (small ? 1 : 0))
    const bar = Math.max(1, pitch * 0.42)
    let depth = 0
    for (let line = 0; line < lines; line++) {
      const y = line * pitch + (pitch - bar) / 2
      // Gutter: one dim dot per line, like line numbers.
      ctx.fillStyle = 'rgba(160, 200, 230, 0.35)'
      ctx.fillRect(r * 0.2, y + bar * 0.2, bar * 0.6, bar * 0.6)
      if (random() < 0.14) continue // blank line
      // Blocks open and close, so indentation drifts like real code.
      const roll = random()
      depth = Math.max(0, Math.min(3, depth + (roll < 0.28 ? 1 : roll > 0.72 ? -1 : 0)))
      let x = r * 0.36 + depth * r * 0.13
      const tokens = 1 + Math.floor(random() * 4)
      for (let token = 0; token < tokens && x < r * 1.85; token++) {
        const width = r * (0.07 + random() * 0.3)
        ctx.fillStyle = SYNTAX[Math.floor(random() * SYNTAX.length)]
        ctx.beginPath()
        ctx.roundRect(x, y, Math.min(width, r * 1.85 - x), bar, bar / 2)
        ctx.fill()
        x += width + r * 0.05
      }
    }
  })
}

/** Darkens the top and bottom edges and the centre so the code reads as depth and the mark stays crisp. */
function veil(r: number, scale: number) {
  return sprite(`veil|${r}|${scale}`, r * 2, r * 2, scale, ctx => {
    const edges = ctx.createLinearGradient(0, 0, 0, r * 2)
    edges.addColorStop(0, 'rgba(4, 12, 22, 0.95)')
    edges.addColorStop(0.3, 'rgba(4, 12, 22, 0)')
    edges.addColorStop(0.7, 'rgba(4, 12, 22, 0)')
    edges.addColorStop(1, 'rgba(4, 12, 22, 0.95)')
    ctx.fillStyle = edges
    ctx.fillRect(0, 0, r * 2, r * 2)
    const centre = ctx.createRadialGradient(r, r * 0.85, 0, r, r * 0.85, r * 0.55)
    centre.addColorStop(0, 'rgba(4, 12, 22, 0.75)')
    centre.addColorStop(1, 'rgba(4, 12, 22, 0)')
    ctx.fillStyle = centre
    ctx.fillRect(0, 0, r * 2, r * 2)
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
 * `busy` scrolls the code and turns the rings; `animate` false freezes everything (reduced effects).
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

  // Source code streams upward while the lead works; idle it holds still and only breathes.
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, r - 0.5, 0, TAU)
  ctx.clip()
  const tile = codeTile(r, scale, small)
  const { pitch } = codePitch(r, small)
  const speed = pitch * 1.6 // lines per second, in canvas units
  const offset = busy ? (t * speed) % (r * 2) : 0
  ctx.globalAlpha = alpha * (busy ? 0.55 : 0.36 + 0.08 * breathe)
  ctx.drawImage(tile, -r, -r - offset, r * 2, r * 2)
  ctx.drawImage(tile, -r, r - offset, r * 2, r * 2)
  ctx.globalAlpha = alpha
  ctx.drawImage(veil(r, scale), -r, -r, r * 2, r * 2)
  if (busy) {
    // A caret blinks at the line being written, low in the core.
    const caretY = r * 0.62
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = color
      ctx.fillRect(-r * 0.3, caretY - pitch * 0.4, Math.max(1, r * 0.035), pitch * 0.8)
    }
  }
  ctx.restore()

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
