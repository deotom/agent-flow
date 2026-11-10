/**
 * Small vector marks that tell which AI runs an agent: a warm starburst for Claude, a terminal prompt for Codex.
 * Simple original glyphs drawn on canvas, not the vendors' logos.
 */
export type Runtime = 'claude' | 'codex'

export const RUNTIME_COLORS: Record<Runtime, string> = { claude: '#f0a070', codex: '#c3f5ff' }

export function isRuntime(value: unknown): value is Runtime {
  return value === 'claude' || value === 'codex'
}

/** Draw the mark centred on (x, y), fitting a box `size` wide. */
export function drawRuntimeMark(ctx: CanvasRenderingContext2D, runtime: Runtime, x: number, y: number, size: number, color = RUNTIME_COLORS[runtime]) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const r = size / 2
  if (runtime === 'claude') {
    // Twelve tapered rays of two lengths around a small hub.
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + 0.13
      const outer = r * (i % 2 ? 0.72 : 1)
      const width = r * 0.13
      ctx.save()
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(r * 0.18, -width)
      ctx.lineTo(outer, -width * 0.35)
      ctx.lineTo(outer, width * 0.35)
      ctx.lineTo(r * 0.18, width)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // A rounded terminal frame with a ">_" prompt.
    const w = r * 1.9, h = r * 1.5, corner = r * 0.3
    ctx.lineWidth = Math.max(1, r * 0.14)
    ctx.beginPath()
    ctx.roundRect(-w / 2, -h / 2, w, h, corner)
    ctx.stroke()
    ctx.lineWidth = Math.max(1.1, r * 0.17)
    ctx.beginPath()
    ctx.moveTo(-r * 0.55, -r * 0.3)
    ctx.lineTo(-r * 0.15, 0)
    ctx.lineTo(-r * 0.55, r * 0.3)
    ctx.moveTo(r * 0.08, r * 0.34)
    ctx.lineTo(r * 0.55, r * 0.34)
    ctx.stroke()
  }
  ctx.restore()
}

/** A dark disc with the mark, pinned to a node's upper-right rim. */
export function drawRuntimeBadge(ctx: CanvasRenderingContext2D, runtime: Runtime, x: number, y: number, radius: number, ring: string) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#071321'
  ctx.fill()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = ring
  ctx.stroke()
  ctx.restore()
  drawRuntimeMark(ctx, runtime, x, y, radius * 1.35)
}
