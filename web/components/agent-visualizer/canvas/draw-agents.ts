import { Agent, NODE, ANIM } from '@/lib/agent-types'
import { COLORS, getStateColor } from '@/lib/colors'
import {
  AGENT_DRAW, STATS_OVERLAY,
} from '@/lib/canvas-constants'
import { alphaHex, formatModelName } from '@/lib/utils'
import { truncateText, drawHexagon, CLAUDE_SPARK_D, OPENAI_LOGO_D, OPENAI_LOGO_VIEWBOX } from './draw-misc'
import { getAgentGlowSprite } from './render-cache'

let _claudeSparkPath: Path2D | null = null
export function contextGaugeColor(used: number, capacity: number): string {
  const usage = used / Math.max(1, capacity)
  return usage >= 0.9 ? COLORS.error : usage >= 0.8 ? COLORS.tool : COLORS.holoBase
}
export function agentStatusLabel(agent: Pick<Agent, 'state' | 'currentTool'>, time: number): string {
  switch (agent.state) {
    case 'thinking': return `Thinking${'.'.repeat(1 + Math.floor(time * 2) % 3)}`
    case 'tool_calling': return `Running ${agent.currentTool?.split('.').pop() ?? 'tool'}`
    case 'waiting_permission': return 'Approval needed'
    case 'complete': return 'Done'
    case 'error': return 'Tool failed'
    case 'paused': return 'Paused'
    default: return 'Ready'
  }
}
export function getClaudeSparkPath() {
  if (!_claudeSparkPath) _claudeSparkPath = new Path2D(CLAUDE_SPARK_D)
  return _claudeSparkPath
}

let _openaiLogoPath: Path2D | null = null
function getOpenAILogoPath() {
  if (!_openaiLogoPath) _openaiLogoPath = new Path2D(OPENAI_LOGO_D)
  return _openaiLogoPath
}

export function drawClaudeSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save()
  ctx.translate(cx, cy)
  const scale = (r * AGENT_DRAW.sparkScale) / AGENT_DRAW.sparkViewBox
  ctx.scale(scale, scale)
  ctx.translate(-AGENT_DRAW.sparkViewBox, -AGENT_DRAW.sparkViewBox + 1)
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 6 / scale
  ctx.fill(getClaudeSparkPath())
  ctx.restore()
}

export function drawOpenAILogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save()
  ctx.translate(cx, cy)
  // Target diameter matches the Claude spark: (r * sparkScale) total.
  const scale = (r * AGENT_DRAW.sparkScale) / OPENAI_LOGO_VIEWBOX
  ctx.scale(scale, scale)
  ctx.translate(-OPENAI_LOGO_VIEWBOX / 2, -OPENAI_LOGO_VIEWBOX / 2)
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 6 / scale
  ctx.fill(getOpenAILogoPath())
  ctx.restore()
}

/** Pick the brand logo for the agent's runtime. Defaults to Claude. */
export function drawAgentBrand(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, color: string,
  runtime: Agent['runtime'],
) {
  if (runtime === 'codex') drawOpenAILogo(ctx, cx, cy, r, color)
  else drawClaudeSpark(ctx, cx, cy, r, color)
}

export function drawContextHud(ctx: CanvasRenderingContext2D, agent: Agent, radius: number, time = 0, effectsEnabled = false) {
  if (agent.state === 'complete' && !agent.isMain) return
  const usage = Math.min(1, Math.max(0, agent.tokensUsed / Math.max(1, agent.tokensMax)))
  const ringRadius = radius + 10
  const slots = agent.isMain ? 36 : 24
  const step = Math.PI * 2 / slots
  const gap = step * 0.42
  const filled = usage * slots
  const last = Math.ceil(filled) - 1
  ctx.save()
  const opacity = ctx.globalAlpha
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.7
  ctx.strokeStyle = COLORS.holoBase
  ctx.globalAlpha = opacity * 0.12
  ctx.beginPath()
  ctx.arc(agent.x, agent.y, ringRadius, 0, Math.PI * 2)
  ctx.stroke()
  const lampColor = contextGaugeColor(agent.tokensUsed, agent.tokensMax)
  const coreColor = usage >= 0.8 ? '#fff2e5' : '#e1fcff'
  const lampWidth = agent.isMain ? 2.8 : 1.9
  const paintLamp = (tip: boolean) => {
    // Reuse one path for all three unblurred LED layers.
    ctx.strokeStyle = lampColor
    ctx.lineWidth = lampWidth + 2.4
    ctx.globalAlpha = opacity * 0.09
    ctx.stroke()
    ctx.lineWidth = lampWidth
    ctx.globalAlpha = opacity * 0.82
    ctx.stroke()
    ctx.strokeStyle = coreColor
    ctx.lineWidth = agent.isMain ? 0.85 : 0.6
    ctx.globalAlpha = opacity * (tip && effectsEnabled ? 0.42 + (1 - Math.cos(time * 2.2)) * 0.27 : 0.8)
    ctx.stroke()
  }
  ctx.beginPath()
  for (let index = 0; index < last; index++) {
    const start = -Math.PI / 2 + index * step + gap / 2
    ctx.moveTo(agent.x + Math.cos(start) * ringRadius, agent.y + Math.sin(start) * ringRadius)
    ctx.arc(agent.x, agent.y, ringRadius, start, start + step - gap)
  }
  if (last > 0) paintLamp(false)
  if (last >= 0) {
    const start = -Math.PI / 2 + last * step + gap / 2
    const fraction = Math.min(1, filled - last)
    ctx.beginPath()
    ctx.arc(agent.x, agent.y, ringRadius, start, start + (step - gap) * fraction)
    paintLamp(true)
  }
  ctx.restore()
}

export function drawContextComposition(ctx: CanvasRenderingContext2D, agent: Agent, radius: number, labelScale = 1) {
  if (agent.tokensUsed <= 0) return
  ctx.fillStyle = contextGaugeColor(agent.tokensUsed, agent.tokensMax)
  ctx.font = `${10 * labelScale}px "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`CTX ${Math.round(agent.tokensUsed / Math.max(1, agent.tokensMax) * 100)}%`, agent.x, agent.y + radius + 12 + 57 * labelScale)
}

function drawDepthShadow(ctx: CanvasRenderingContext2D, agent: Agent, r: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = AGENT_DRAW.shadowBlur
  ctx.shadowOffsetX = AGENT_DRAW.shadowOffsetX
  ctx.shadowOffsetY = AGENT_DRAW.shadowOffsetY
  drawHexagon(ctx, agent.x, agent.y, r * 0.9)
  ctx.fillStyle = COLORS.cardBgFaintOverlay
  ctx.fill()
  ctx.restore()
}

function drawAgentGlow(ctx: CanvasRenderingContext2D, agent: Agent, r: number, color: string, isHovered: boolean, isSelected: boolean, isWaiting: boolean) {
  const glowR = r + AGENT_DRAW.glowPadding
  const glowAlpha = isHovered || isSelected ? 0.18 : isWaiting ? 0.12 : agent.state === 'thinking' ? 0.09 : 0.04
  // Pre-rendered glow sprite instead of per-frame gradient creation
  const sprite = getAgentGlowSprite(color, Math.round(r * 0.5), Math.ceil(glowR), alphaHex(glowAlpha))
  ctx.drawImage(sprite, agent.x - Math.ceil(glowR), agent.y - Math.ceil(glowR))

  // Ambient outer hex ring
  drawHexagon(ctx, agent.x, agent.y, r + AGENT_DRAW.outerRingOffset)
  ctx.strokeStyle = color + '25'
  ctx.lineWidth = 1
  ctx.stroke()

  // Inner hex fill
  drawHexagon(ctx, agent.x, agent.y, r)
  ctx.fillStyle = COLORS.nodeInterior
  ctx.fill()
}

function drawScanline(ctx: CanvasRenderingContext2D, agent: Agent, r: number, color: string, isHovered: boolean, isWaiting: boolean, time: number) {
  const scanSpeed = agent.state === 'thinking' || isHovered || isWaiting ? ANIM.scanline.thinking : ANIM.scanline.normal
  const scanY = agent.y - r + ((time * scanSpeed) % (r * 2))
  ctx.save()
  drawHexagon(ctx, agent.x, agent.y, r)
  ctx.clip()
  const scanGrad = ctx.createLinearGradient(agent.x, scanY - AGENT_DRAW.scanlineHalfH, agent.x, scanY + AGENT_DRAW.scanlineHalfH)
  const scanAlpha = isHovered ? '35' : '20'
  scanGrad.addColorStop(0, color + '00')
  scanGrad.addColorStop(0.5, color + scanAlpha)
  scanGrad.addColorStop(1, color + '00')
  ctx.fillStyle = scanGrad
  ctx.fillRect(agent.x - r, scanY - AGENT_DRAW.scanlineHalfH, r * 2, AGENT_DRAW.scanlineWidth)
  ctx.restore()
}

function drawStateRing(ctx: CanvasRenderingContext2D, agent: Agent, r: number, color: string, isHovered: boolean, isSelected: boolean, isWaiting: boolean, time: number, effectsEnabled: boolean) {
  drawHexagon(ctx, agent.x, agent.y, r)
  ctx.strokeStyle = color
  ctx.lineWidth = (isSelected || isHovered) ? 2.5 : 2
  if (agent.state === 'complete') {
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = color + '60'
  } else if (isWaiting) {
    ctx.setLineDash([6, 4])
    ctx.lineDashOffset = -time * AGENT_DRAW.waitingDashSpeed
    ctx.lineWidth = 2.5
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
  if (effectsEnabled) drawActivityOutline(ctx, agent, r, time)
}

/** Amber dashes travel along the node outline while it is actively working. */
export function drawActivityOutline(ctx: CanvasRenderingContext2D, agent: Pick<Agent, 'state' | 'x' | 'y'>, radius: number, time: number) {
  if (agent.state !== 'thinking' && agent.state !== 'tool_calling') return
  ctx.save()
  drawHexagon(ctx, agent.x, agent.y, radius + 4)
  ctx.strokeStyle = COLORS.tool
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 7])
  ctx.lineDashOffset = -time * 26
  ctx.shadowColor = COLORS.tool
  ctx.shadowBlur = 5
  ctx.stroke()
  ctx.restore()
}

function drawCenterIcon(ctx: CanvasRenderingContext2D, agent: Agent, r: number, color: string, isWaiting: boolean) {
  if (isWaiting) {
    // Geometric lock icon — fits the holographic style
    const s = r * 0.3
    ctx.save()
    ctx.strokeStyle = color + '90'
    ctx.fillStyle = color + '90'
    ctx.lineWidth = 1.5
    // Lock body (rounded rect)
    ctx.beginPath()
    ctx.roundRect(agent.x - s * 0.6, agent.y - s * 0.1, s * 1.2, s * 1.0, 2)
    ctx.fill()
    // Lock shackle (arc)
    ctx.beginPath()
    ctx.arc(agent.x, agent.y - s * 0.15, s * 0.4, Math.PI, 0)
    ctx.stroke()
    ctx.restore()
  } else if (agent.isMain) {
    drawAgentBrand(ctx, agent.x, agent.y, r, color + '90', agent.runtime)
  } else {
    ctx.fillStyle = color + '90'
    ctx.font = `${r * AGENT_DRAW.subIconScale}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(agent.state === 'tool_calling' ? '\u2699' : '\u25C7', agent.x, agent.y)
  }
}

function drawOrbitingParticles(ctx: CanvasRenderingContext2D, agent: Agent, r: number, color: string, time: number) {
  for (let i = 0; i < 4; i++) {
    const angle = time * ANIM.orbitSpeed + (i / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.fillStyle = color + '80'
    ctx.arc(
      agent.x + Math.cos(angle) * (r + AGENT_DRAW.orbitParticleOffset),
      agent.y + Math.sin(angle) * (r + AGENT_DRAW.orbitParticleOffset),
      AGENT_DRAW.orbitParticleSize, 0, Math.PI * 2,
    )
    ctx.fill()
  }
}

type InstrumentPhase = { time: number; angle: number }
const instrumentPhases = new WeakMap<CanvasRenderingContext2D, Map<string, InstrumentPhase>>()
export function advanceInstrumentPhase(previous: InstrumentPhase | undefined, time: number, moving: boolean, idle: boolean): InstrumentPhase {
  const delta = previous ? Math.max(0, Math.min(0.25, time - previous.time)) : 0
  return { time, angle: (previous?.angle ?? 0) + (moving ? delta * (idle ? 0.12 : 0.65) : 0) }
}

function drawMainInstrument(ctx: CanvasRenderingContext2D, agent: Agent, r: number, time: number, moving: boolean, detailed: boolean) {
  ctx.save()
  let phases = instrumentPhases.get(ctx)
  if (!phases) { phases = new Map(); instrumentPhases.set(ctx, phases) }
  if (phases.size > 8) phases.clear()
  const phase = advanceInstrumentPhase(phases.get(agent.id), time, moving, agent.state === 'idle')
  phases.set(agent.id, phase)
  const rotation = phase.angle
  ctx.strokeStyle = '#76c8ff90'
  ctx.lineWidth = 0.8
  for (let i = 0; i < 6; i++) {
    const start = rotation + i * Math.PI / 3
    ctx.beginPath()
    ctx.arc(agent.x, agent.y, r + 19, start, start + Math.PI / 4)
    ctx.stroke()
  }
  ctx.strokeStyle = '#76c8ff75'
  for (let i = 0; i < (detailed ? 24 : 12); i++) {
    const angle = i * Math.PI / (detailed ? 12 : 6)
    const inner = r + 24, outer = inner + (i % 3 === 0 ? 4 : 2)
    ctx.beginPath()
    ctx.moveTo(agent.x + Math.cos(angle) * inner, agent.y + Math.sin(angle) * inner)
    ctx.lineTo(agent.x + Math.cos(angle) * outer, agent.y + Math.sin(angle) * outer)
    ctx.stroke()
  }
  if (moving && agent.state !== 'idle') {
    ctx.shadowBlur = 0
    ctx.strokeStyle = `rgba(123,201,255,${0.12 + (Math.sin(time * 2) + 1) * 0.08})`
    ctx.lineWidth = 1
    for (let i = 0; i < (detailed ? 3 : 0); i++) {
      const angle = -rotation * 0.45 + i * Math.PI * 2 / 3
      ctx.beginPath()
      ctx.arc(agent.x, agent.y, r + 34, angle, angle + 0.8)
      ctx.stroke()
    }
    const flare = rotation * 1.4
    ctx.fillStyle = COLORS.holoBright
    ctx.shadowColor = COLORS.holoBase
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(agent.x + Math.cos(flare) * (r + 19), agent.y + Math.sin(flare) * (r + 19), 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawWaitingRipples(ctx: CanvasRenderingContext2D, agent: Agent, r: number, color: string, time: number) {
  // Radar ripples — 2 concentric rings expanding outward, staggered
  for (let i = 0; i < 2; i++) {
    const ripplePhase = ((time * 0.65 + i * 0.5) % 1.0)
    const rippleR = r + AGENT_DRAW.rippleInnerOffset + ripplePhase * AGENT_DRAW.rippleMaxExpand
    const rippleAlpha = (1 - ripplePhase) * AGENT_DRAW.rippleMaxAlpha
    ctx.beginPath()
    drawHexagon(ctx, agent.x, agent.y, rippleR)
    ctx.strokeStyle = color + alphaHex(rippleAlpha)
    ctx.lineWidth = 1.5 * (1 - ripplePhase)
    ctx.stroke()
  }

  // Slower orbiting particles in amber
  for (let i = 0; i < 3; i++) {
    const angle = time * AGENT_DRAW.waitingOrbitSpeed + (i / 3) * Math.PI * 2
    ctx.beginPath()
    ctx.fillStyle = color + '70'
    ctx.arc(
      agent.x + Math.cos(angle) * (r + AGENT_DRAW.waitingOrbitOffset),
      agent.y + Math.sin(angle) * (r + AGENT_DRAW.waitingOrbitOffset),
      AGENT_DRAW.waitingOrbitParticleSize, 0, Math.PI * 2,
    )
    ctx.fill()
  }
}

function drawAgentLabel(ctx: CanvasRenderingContext2D, agent: Agent, r: number, isHovered: boolean, time: number, compact: boolean, viewScale: number) {
  const unit = Math.min(compact ? 2 : 1.25, 1 / Math.max(0.1, viewScale))
  const width = compact ? 220 : 260
  const line = (compact ? 16 : 19) * unit
  const y = agent.y + r + 12
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = isHovered ? COLORS.holoBright : COLORS.textPrimary
  ctx.font = `600 ${(compact ? 12 : 14) * unit}px "Segoe UI", sans-serif`
  ctx.fillText(truncateText(ctx, agent.name, width), agent.x, y)
  ctx.font = `${(compact ? 10.5 : 11) * unit}px "Segoe UI", sans-serif`
  ctx.fillStyle = COLORS.textMuted
  ctx.fillText(truncateText(ctx, agent.model ? formatModelName(agent.model) : 'Model unknown', width), agent.x, y + line)
  ctx.fillStyle = getStateColor(agent.state)
  ctx.font = `500 ${(compact ? 11 : 12) * unit}px "Segoe UI", sans-serif`
  ctx.fillText(truncateText(ctx, agentStatusLabel(agent, time), width), agent.x, y + line * 2)
  if (compact && agent.tokensUsed > 0) {
    ctx.fillStyle = contextGaugeColor(agent.tokensUsed, agent.tokensMax)
    ctx.font = `${10 * unit}px "Segoe UI", sans-serif`
    ctx.fillText( `CTX ${Math.round(agent.tokensUsed / Math.max(1, agent.tokensMax) * 100)}%`, agent.x, y + line * 3)
  }
}

function drawStatsOverlay(ctx: CanvasRenderingContext2D, agent: Agent, r: number) {
  const sy = agent.y - r - STATS_OVERLAY.yOffset
  ctx.fillStyle = COLORS.cardBgDark
  ctx.beginPath()
  ctx.roundRect(agent.x - STATS_OVERLAY.boxWidth / 2, sy, STATS_OVERLAY.boxWidth, STATS_OVERLAY.boxHeight, STATS_OVERLAY.borderRadius)
  ctx.fill()
  ctx.strokeStyle = COLORS.glassBorder
  ctx.lineWidth = 0.5
  ctx.stroke()
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `${STATS_OVERLAY.fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`${agent.toolCalls} tools \u00B7 ${agent.timeAlive.toFixed(1)}s`, agent.x, sy + STATS_OVERLAY.textPaddingY)
}

export function drawAgents(
  ctx: CanvasRenderingContext2D,
  agents: Map<string, Agent>,
  selectedAgentId: string | null,
  hoveredAgentId: string | null,
  showStats: boolean,
  time: number,
  effectsEnabled = true,
  compact = false,
  viewScale = 1,
  detailed = true,
) {
  for (const [id, agent] of agents) {
    const radius = agent.isMain ? NODE.radiusMain : NODE.radiusSub
    const color = getStateColor(agent.state)
    const isHovered = id === hoveredAgentId
    const isSelected = id === selectedAgentId

    const isWaiting = agent.state === 'waiting_permission'
    const activeEffects = effectsEnabled && ['thinking', 'tool_calling', 'waiting_permission'].includes(agent.state)

    const r = radius * agent.scale

    ctx.save()
    ctx.globalAlpha = agent.opacity

    if (detailed) drawDepthShadow(ctx, agent, r)
    drawAgentGlow(ctx, agent, r, color, isHovered, isSelected, isWaiting)
    if (agent.isMain && !compact) drawMainInstrument(ctx, agent, r, time, effectsEnabled && (activeEffects || agent.state === 'idle'), detailed)
    if (agent.isMain && agent.state === 'idle') {
      ctx.save()
      const opacity = ctx.globalAlpha
      ctx.shadowBlur = 0
      ctx.fillStyle = COLORS.holoBase
      ctx.globalAlpha = opacity * 0.14
      ctx.beginPath()
      ctx.arc(agent.x, agent.y - r - 19, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = opacity * 0.85
      ctx.beginPath()
      ctx.arc(agent.x, agent.y - r - 19, 1.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e1fcff'
      ctx.globalAlpha = opacity * (effectsEnabled ? 0.45 + (1 - Math.cos(time * 1.6)) * 0.27 : 0.8)
      ctx.beginPath()
      ctx.arc(agent.x, agent.y - r - 19, 0.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (activeEffects && detailed) drawScanline(ctx, agent, r, color, isHovered, isWaiting, time)
    drawStateRing(ctx, agent, r, color, isHovered, isSelected, isWaiting, time, effectsEnabled)
    drawContextHud(ctx, agent, r, time, effectsEnabled)
    drawCenterIcon(ctx, agent, r, color, isWaiting)

    if (activeEffects && detailed && !compact && agent.state === 'thinking') {
      drawOrbitingParticles(ctx, agent, r, color, time)
    }

    if (activeEffects && detailed && isWaiting) {
      drawWaitingRipples(ctx, agent, r, color, time)
    }

    drawAgentLabel(ctx, agent, r, isHovered, time, compact, viewScale)

    if (!compact && (agent.state !== 'complete' || agent.opacity > 0.5)) {
      drawContextComposition(ctx, agent, r, Math.min(1.25, 1 / Math.max(0.1, viewScale)))
    }

    if (showStats && agent.state !== 'complete') {
      drawStatsOverlay(ctx, agent, r)
    }

    ctx.restore()
  }
}
