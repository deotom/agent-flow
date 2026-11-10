import type { Agent } from '@/lib/agent-types'
import { NODE } from '@/lib/agent-types'
import { captionLayout } from '@/lib/agent-caption'
import { STAGE_TAG, type MissionNode, type MissionStage, type MissionView } from '@/lib/mission-model'
import { getAgentGlowSprite, measureTextCached } from './render-cache'
import { truncateText } from './draw-misc'
import { drawCoreFx } from './core-fx'
import { drawRuntimeBadge, drawRuntimeMark, isRuntime } from './runtime-mark'

const TAU = Math.PI * 2
const FONT = '"Cascadia Mono", Consolas, monospace'
const SYNTAX = { keyword: '#c792ea', fn: '#82aaff', comment: '#5c7a93', string: '#c3e88d', punctuation: '#89a3b9' }
export const MISSION_COLORS: Record<MissionStage, string> = {
  working: '#5fe1ff', queued: '#dce9f7', sent: '#c7a6ff', received: '#3dff9a',
  waiting: '#ffb627', failed: '#ff5c7a', discarded: '#596a7c', cancelled: '#596a7c', unknown: '#5c7a93',
}

/** Follow actual mission links, with a guard for malformed/cyclic input. */
export function missionSelectedChain(mission: MissionView, selected: string | null): Set<string> {
  const chain = new Set<string>()
  const parents = new Map(mission.links.map(link => [link.to, link.from]))
  let id = selected
  while (id && !chain.has(id)) {
    chain.add(id)
    id = parents.get(id) ?? null
  }
  return chain
}

export function missionRemaining(agent: Pick<Agent, 'tokensUsed' | 'tokensMax'>): number | null {
  return agent.tokensMax > 0 ? Math.max(0, Math.min(1, 1 - agent.tokensUsed / agent.tokensMax)) : null
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
}

function segments(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, count: number, start = 0, end = count) {
  ctx.beginPath()
  const step = TAU / count
  for (let i = start; i < end; i++) {
    const a = -Math.PI / 2 + (i + 0.12) * step
    ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
    ctx.arc(x, y, radius, a, a + step * 0.73)
  }
}

/** Curves terminate outside each instrument, so beams never cut across a core. */
export function missionLinkGeometry(from: Pick<Agent, 'x' | 'y' | 'isMain'>, to: Pick<Agent, 'x' | 'y' | 'isMain'>) {
  const dx = to.x - from.x, dy = to.y - from.y
  const distance = Math.hypot(dx, dy) || 1
  const ux = dx / distance, uy = dy / distance
  const pad = (agent: Pick<Agent, 'isMain'>) => agent.isMain ? NODE.radiusMain + 24 : NODE.radiusSub + 10
  const start = Math.min(pad(from), distance * 0.2), end = Math.min(pad(to), distance * 0.2)
  const x1 = from.x + ux * start, y1 = from.y + uy * start
  const x2 = to.x - ux * end, y2 = to.y - uy * end
  const bend = Math.min(30, distance * 0.075)
  const cx = (x1 + x2) / 2 - uy * bend, cy = (y1 + y2) / 2 + ux * bend
  return { x1, y1, x2, y2, cx, cy, tagX: (x1 + 2 * cx + x2) / 4, tagY: (y1 + 2 * cy + y2) / 4 }
}

function tagWordColor(stage: MissionStage) {
  return ['working', 'sent', 'received'].includes(stage) ? SYNTAX.fn
    : ['discarded', 'unknown'].includes(stage) ? SYNTAX.comment : SYNTAX.keyword
}

export function drawMissionLinks(
  ctx: CanvasRenderingContext2D, mission: MissionView, agents: Map<string, Agent>,
  selected: string | null, time: number, effectsEnabled = true, viewScale = 1, detailed = true,
) {
  const chain = missionSelectedChain(mission, selected)
  const unit = Math.min(1.5, 1 / Math.max(0.1, viewScale))
  ctx.save()
  ctx.shadowBlur = 0
  ctx.lineCap = 'round'
  for (const link of mission.links) {
    const from = agents.get(link.from), to = agents.get(link.to)
    if (!from || !to) continue
    const g = missionLinkGeometry(from, to)
    const color = MISSION_COLORS[link.stage]
    const highlighted = chain.has(link.from) && chain.has(link.to)
    const pulse = effectsEnabled ? 0.6 + Math.sin(time * 2.4) * 0.25 : 0.8
    ctx.globalAlpha = Math.min(from.opacity, to.opacity)
    ctx.beginPath()
    ctx.moveTo(g.x1, g.y1)
    ctx.quadraticCurveTo(g.cx, g.cy, g.x2, g.y2)
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    if (link.alert || highlighted || (detailed && ['working', 'sent', 'received'].includes(link.stage))) {
      ctx.strokeStyle = (link.alert ? MISSION_COLORS[link.alert] : color) + '18'
      ctx.lineWidth = link.alert ? 13 * pulse : highlighted ? 10 : 6
      ctx.stroke()
      if (link.alert) {
        ctx.strokeStyle = MISSION_COLORS[link.alert] + '30'
        ctx.lineWidth = 5 * pulse
        ctx.stroke()
      }
    }
    const dim = ['discarded', 'cancelled', 'unknown'].includes(link.stage)
    ctx.lineWidth = highlighted ? 2 : link.stage === 'received' ? 1.7 : 1
    ctx.strokeStyle = color + (dim ? '45' : link.stage === 'waiting' ? '99' : highlighted ? 'cc' : '65')
    if (link.stage === 'queued' || link.stage === 'unknown') ctx.setLineDash([1, 7])
    if (dim && link.stage !== 'unknown') ctx.setLineDash([5, 7])
    if (link.stage === 'failed') {
      ctx.setLineDash([8, 5, 2, 8])
      if (effectsEnabled && Math.sin(time * 19) > 0.94) ctx.strokeStyle = color + '25'
    }
    if (link.stage === 'waiting') ctx.globalAlpha *= pulse
    ctx.stroke()
    if (link.stage === 'working' || link.stage === 'sent') {
      ctx.strokeStyle = color + 'e0'
      ctx.lineWidth = link.stage === 'sent' ? 2.6 : 1.7
      ctx.setLineDash(link.stage === 'sent' ? [7, 25] : [13, 22])
      // Negative offset travels forward along the parent -> child path.
      ctx.lineDashOffset = effectsEnabled ? time * (link.stage === 'sent' ? 22 : -28) : 0
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    ctx.globalAlpha = Math.min(from.opacity, to.opacity)
    ctx.font = `${10 * unit}px ${FONT}`
    const tag = STAGE_TAG[link.stage]
    const wordW = measureTextCached(ctx, tag.word), restW = measureTextCached(ctx, tag.rest)
    const width = wordW + restW + 14 * unit, height = 19 * unit
    const x = g.tagX - width / 2, y = g.tagY - height / 2
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, 3 * unit)
    ctx.fillStyle = '#041321'
    ctx.fill()
    ctx.strokeStyle = color + '85'
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = tagWordColor(link.stage)
    ctx.fillText(tag.word, x + 7 * unit, g.tagY)
    ctx.fillStyle = tag.rest.includes('//') ? SYNTAX.comment : color
    ctx.fillText(tag.rest, x + 7 * unit + wordW, g.tagY)
  }
  ctx.restore()
}

// The gradients and curved text are created only on cache misses, never per frame.
const coreCache = new Map<number, HTMLCanvasElement>()
const dataCache = new Map<string, HTMLCanvasElement>()
function coreSprite(radius: number) {
  const r = Math.ceil(radius)
  let sprite = coreCache.get(r)
  if (sprite) return sprite
  sprite = document.createElement('canvas')
  sprite.width = sprite.height = r * 2 + 2
  const ctx = sprite.getContext('2d')!
  const gradient = ctx.createRadialGradient(r * 0.7, r * 0.5, 0, r, r, r)
  gradient.addColorStop(0, '#0c3856')
  gradient.addColorStop(1, '#020a14')
  circle(ctx, r + 1, r + 1, r)
  ctx.fillStyle = gradient
  ctx.fill()
  if (coreCache.size >= 32) coreCache.clear()
  coreCache.set(r, sprite)
  return sprite
}

function dataSprite(data: string, radius: number) {
  const key = `${radius}|${data}`
  const cached = dataCache.get(key)
  if (cached) return cached
  const size = Math.ceil((radius + 12) * 4)
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = size
  const ctx = sprite.getContext('2d')!
  ctx.scale(2, 2)
  ctx.translate(size / 4, size / 4)
  ctx.font = `8px ${FONT}`
  ctx.fillStyle = '#5fe1ff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = `${data}${data}`
  let angle = 0
  const widths = Array.from(text).map(char => measureTextCached(ctx, char) + 1)
  const total = widths.reduce((sum, width) => sum + width, 0)
  Array.from(text).forEach((char, i) => {
    const step = widths[i] / total * TAU
    ctx.save()
    ctx.rotate(angle + step / 2)
    ctx.translate(0, -radius)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    angle += step
  })
  if (dataCache.size >= 12) dataCache.clear()
  dataCache.set(key, sprite)
  return sprite
}

function drawLeadInstrument(ctx: CanvasRenderingContext2D, agent: Agent, radius: number, mission: MissionView, time: number, moving: boolean, detailed: boolean) {
  const remaining = missionRemaining(agent)
  if (remaining !== null) {
    const count = 28, lit = Math.ceil(remaining * count)
    segments(ctx, agent.x, agent.y, radius + 12, count)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#142434'
    ctx.stroke()
    segments(ctx, agent.x, agent.y, radius + 12, count, 0, lit)
    ctx.strokeStyle = agent.contextRecharge ? '#ffb627' : '#eaf6ff'
    ctx.stroke()
    if (agent.contextRecharge) {
      segments(ctx, agent.x, agent.y, radius + 12, count)
      ctx.strokeStyle = '#ffb627'
      ctx.globalAlpha *= moving ? 0.45 + 0.3 * Math.sin(time * 7) : 0.7
      ctx.stroke()
    } else if (lit > 0 && lit < count) {
      segments(ctx, agent.x, agent.y, radius + 12, count, lit - 1, lit)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 7.5
      ctx.globalAlpha *= moving ? 0.55 + 0.4 * Math.sin(time * 2.2) : 1
      ctx.stroke()
    }
  }
  if (!detailed) return
  ctx.save()
  ctx.globalAlpha = agent.opacity * 0.32
  ctx.translate(agent.x, agent.y)
  // Tick ring ~20 s per turn; the data ring drifts the other way (~50 s per turn).
  ctx.rotate(moving ? time * 0.3 : 0)
  circle(ctx, 0, 0, radius + 24)
  ctx.strokeStyle = '#5fe1ff'
  ctx.lineWidth = 2
  ctx.setLineDash([1, 5])
  ctx.stroke()
  ctx.setLineDash([])
  if (moving && (agent.state === 'thinking' || agent.state === 'tool_calling')) {
    // A bright scan arc sweeps the tick ring while the lead works.
    const sweep = time * 1.6
    ctx.globalAlpha = agent.opacity * 0.9
    ctx.beginPath()
    ctx.arc(0, 0, radius + 24, sweep, sweep + 0.7)
    ctx.strokeStyle = '#9ff0ff'
    ctx.lineWidth = 2.4
    ctx.stroke()
    ctx.globalAlpha = agent.opacity * 0.32
  }
  ctx.rotate(moving ? -time * 0.42 : 0)
  const sprite = dataSprite(mission.dataRing, radius + 30)
  ctx.drawImage(sprite, -sprite.width / 4, -sprite.height / 4, sprite.width / 2, sprite.height / 2)
  ctx.restore()
}

function modelSpans(modelLine: string | null): Array<[string, string]> {
  if (!modelLine) return [['// model unreported', SYNTAX.comment]]
  const separator = modelLine.indexOf('::')
  if (separator < 0) return [[modelLine, SYNTAX.string]]
  return [[modelLine.slice(0, separator), SYNTAX.fn], ['::', SYNTAX.punctuation], [modelLine.slice(separator + 2), SYNTAX.string]]
}

function drawSpans(ctx: CanvasRenderingContext2D, spans: Array<[string, string]>, x: number, y: number, maxWidth: number) {
  let remaining = maxWidth
  for (const [text, color] of spans) {
    if (remaining <= 0) break
    const clipped = truncateText(ctx, text, remaining)
    ctx.fillStyle = color
    ctx.fillText(clipped, x, y)
    const width = measureTextCached(ctx, clipped)
    x += width
    remaining -= width
    if (clipped !== text) break
  }
}

function drawMissionLabel(ctx: CanvasRenderingContext2D, agent: Agent, node: MissionNode, radius: number, color: string, viewScale: number) {
  // Shared caption bounds preserve camera fit, caption hover, docking and collision avoidance.
  const box = captionLayout(agent, radius, false, viewScale)
  const u = box.unit
  const spans = modelSpans(node.modelLine)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  if (node.plate === 'full') {
    const { left: x, top: y, panelWidth: w, height: h } = box
    const cut = 8 * u
    ctx.beginPath()
    ctx.moveTo(box.startX, box.startY)
    ctx.lineTo(box.endX, box.endY)
    ctx.strokeStyle = color + '65'
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - cut, y)
    ctx.lineTo(x + w, y + cut)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.fillStyle = '#04182bec'
    ctx.fill()
    ctx.strokeStyle = color + '80'
    ctx.stroke()
    const tx = x + 7 * u, width = w - 14 * u
    ctx.font = `${11 * u}px ${FONT}`
    const role = node.role === 'lead' ? 'lead ' : node.role === 'sublead' ? 'sub ' : ''
    drawSpans(ctx, [[role, SYNTAX.keyword], [agent.name, '#e3f3ff']], tx, y + 6 * u, width)
    ctx.font = `${10 * u}px ${FONT}`
    const remaining = missionRemaining(agent)
    const context = node.role === 'lead' && remaining !== null ? ` ctx ${Math.round(remaining * 100)}%` : ''
    const contextWidth = measureTextCached(ctx, context)
    drawSpans(ctx, spans, tx, y + 6 * u + box.line, Math.max(0, width - contextWidth))
    if (context) {
      ctx.fillStyle = agent.contextRecharge ? MISSION_COLORS.waiting : '#eaf6ff'
      ctx.fillText(context, tx + width - contextWidth, y + 6 * u + box.line)
    }
    const summary = node.summary
    const status = node.role === 'sublead' && (summary.waiting || summary.failed)
      ? [summary.waiting ? `${summary.waiting} await` : '', summary.failed ? `${summary.failed} throw` : ''].filter(Boolean).join(' · ')
      : node.statusLine
    const subTeamAlert = node.role === 'sublead'
    ctx.fillStyle = subTeamAlert && summary.waiting ? MISSION_COLORS.waiting : subTeamAlert && summary.failed ? MISSION_COLORS.failed : color
    ctx.fillText(truncateText(ctx, status, width), tx, y + 6 * u + box.line * 2)
  } else {
    ctx.font = `${11 * u}px ${FONT}`
    ctx.fillStyle = '#deedf9'
    ctx.textAlign = 'center'
    ctx.fillText(truncateText(ctx, agent.name, box.panelWidth), box.centerX, box.y)
    ctx.font = `${10 * u}px ${FONT}`
    // Model gets its own line so it is never cut by the status.
    const modelWidth = Math.min(box.panelWidth * 1.3, spans.reduce((sum, [text]) => sum + measureTextCached(ctx, text), 0))
    ctx.textAlign = 'left'
    drawSpans(ctx, spans, box.centerX - modelWidth / 2, box.y + box.line, modelWidth)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(truncateText(ctx, node.statusLine, box.panelWidth * 1.3), box.centerX, box.y + box.line * 2)
  }
}

const RISING = ['0', '1', '>', '_', '$', '/', '1', '0']
const CODE_BARS = ['#c792ea', '#82aaff', '#c3e88d']

/** One small effect per kind of work, so the node shows what the agent is doing. */
function drawActivityEffect(ctx: CanvasRenderingContext2D, agent: Agent, node: MissionNode, radius: number, time: number) {
  const { x, y } = agent
  const seed = (x * 0.013 + y * 0.007) % 6.28
  const opacity = agent.opacity
  ctx.save()
  ctx.lineCap = 'round'
  switch (node.activity) {
    case 'thinking': {
      // Twinkling sparks with short tails travel along the orbit; nothing crosses the node.
      ctx.lineWidth = 1.4
      ctx.strokeStyle = '#9ff0ff'
      ctx.fillStyle = '#e6fdff'
      for (let i = 0; i < 5; i++) {
        const direction = i % 2 ? 1 : -1
        const r = radius + 10 + (i % 3) * 5
        const angle = seed + i * 1.257 + time * 0.8 * direction
        const glow = 0.3 + 0.7 * Math.max(0, Math.sin(time * 3 + i * 2.1))
        ctx.globalAlpha = opacity * glow * 0.5
        ctx.beginPath()
        ctx.arc(x, y, r, direction > 0 ? angle - 0.35 : angle, direction > 0 ? angle : angle + 0.35)
        ctx.stroke()
        ctx.globalAlpha = opacity * glow
        ctx.beginPath()
        ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'command': {
      // Terminal output: characters stream up out of the node and fade.
      ctx.font = `bold 10px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#c3e88d'
      for (let i = 0; i < 5; i++) {
        const progress = ((time * 0.55 + i * 0.2 + seed) % 1)
        ctx.globalAlpha = opacity * Math.sin(progress * Math.PI) * 0.9
        ctx.fillText(RISING[(i + Math.floor(time * 3)) % RISING.length], x + (i - 2) * 9, y - radius - 4 - progress * 34)
      }
      break
    }
    case 'edit': {
      // Code being typed: three syntax-coloured lines grow beside the node.
      const left = x + radius + 8, top = y - radius + 2
      for (let i = 0; i < 3; i++) {
        const width = 6 + ((time * 26 + i * 15 + seed * 10) % 30)
        ctx.globalAlpha = opacity * 0.85
        ctx.strokeStyle = CODE_BARS[i]
        ctx.lineWidth = 2.4
        ctx.beginPath()
        ctx.moveTo(left + (i === 1 ? 6 : 0), top + i * 7)
        ctx.lineTo(left + (i === 1 ? 6 : 0) + width, top + i * 7)
        ctx.stroke()
      }
      break
    }
    case 'search': {
      // Radar sweep around the node.
      const angle = time * 2.2 + seed
      ctx.fillStyle = '#5fe1ff'
      ctx.globalAlpha = opacity * 0.16
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.arc(x, y, radius + 20, angle - 0.7, angle)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = opacity * 0.8
      ctx.strokeStyle = '#bff6ff'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
      ctx.lineTo(x + Math.cos(angle) * (radius + 20), y + Math.sin(angle) * (radius + 20))
      ctx.stroke()
      break
    }
    case 'tool': {
      // Electric pulses race around the ring.
      ctx.strokeStyle = '#82aaff'
      ctx.lineWidth = 2.2
      for (let i = 0; i < 3; i++) {
        const angle = time * 2.6 + seed + i * 2.094
        ctx.globalAlpha = opacity * 0.9
        ctx.beginPath()
        ctx.arc(x, y, radius + 7, angle, angle + 0.35)
        ctx.stroke()
      }
      break
    }
    case 'delegate': {
      // Sonar rings: work is being handed out.
      ctx.strokeStyle = '#5fe1ff'
      ctx.lineWidth = 1.2
      for (let i = 0; i < 2; i++) {
        const phase = (time * 0.7 + i * 0.5 + seed) % 1
        ctx.globalAlpha = opacity * (1 - phase) * 0.6
        ctx.beginPath()
        ctx.arc(x, y, radius + 4 + phase * 22, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'compacting': {
      // Amber swirl while T3 compacts the context.
      ctx.strokeStyle = '#ffb627'
      ctx.lineWidth = 2
      for (let i = 0; i < 2; i++) {
        const angle = -time * 3.2 + i * Math.PI
        ctx.globalAlpha = opacity * 0.85
        ctx.beginPath()
        ctx.arc(x, y, radius + 6, angle, angle + 1.1)
        ctx.stroke()
      }
      break
    }
  }
  ctx.restore()
}

export function drawMissionAgents(
  ctx: CanvasRenderingContext2D, agents: Map<string, Agent>, mission: MissionView,
  selected: string | null, hovered: string | null, time: number, effectsEnabled = true, viewScale = 1, detailed = true, showLabels = true,
) {
  const stages = new Map(mission.links.map(link => [link.to, link.stage]))
  for (const [id, node] of mission.nodes) {
    const agent = agents.get(id)
    if (!agent) continue
    const radius = agent.isMain ? NODE.radiusMain : NODE.radiusSub
    const core = radius * (node.role === 'lead' ? 0.67 : 0.56)
    // The lead has no inbound link: colour it from its own T3 status.
    const stage = stages.get(id) ?? (node.status === 'running' || node.status === 'thinking' || node.status === 'background' ? 'working'
      : node.status === 'waiting_approval' || node.status === 'waiting_input' ? 'waiting' : node.status === 'failed' ? 'failed' : 'queued')
    const color = MISSION_COLORS[stage]
    const moving = effectsEnabled && !node.collapsed
    const active = id === selected || id === hovered
    ctx.save()
    ctx.shadowBlur = 0
    ctx.globalAlpha = agent.opacity * (node.collapsed ? 0.6 : 1)
    const haloR = radius + (node.role === 'lead' ? 45 : 24)
    const halo = getAgentGlowSprite(color, Math.round(core / 2), haloR, active ? '55' : '30')
    // Working nodes breathe; settled ones keep a steady glow.
    const live = moving && (stage === 'working' || stage === 'waiting')
    ctx.globalAlpha = agent.opacity * (node.collapsed ? 0.6 : 1) * (live ? 0.7 + 0.3 * Math.sin(time * 2.2 + agent.x * 0.01) : 1)
    ctx.drawImage(halo, agent.x - haloR, agent.y - haloR)
    ctx.globalAlpha = agent.opacity * (node.collapsed ? 0.6 : 1)
    const sprite = coreSprite(core)
    ctx.drawImage(sprite, agent.x - core - 1, agent.y - core - 1, core * 2 + 2, core * 2 + 2)
    circle(ctx, agent.x, agent.y, core)
    ctx.strokeStyle = color + (active ? 'ff' : '99')
    ctx.lineWidth = active ? 2 : 1
    ctx.stroke()
    if (node.role === 'lead' && detailed) drawCoreFx(ctx, agent.x, agent.y, core, color, time, moving && stage === 'working', moving)
    // The status ring turns while work moves: fast when working, slow while a result is in transit.
    const spin = !moving ? 0 : stage === 'working' ? time * 0.8 : stage === 'sent' ? time * 0.3 : 0
    ctx.save()
    ctx.translate(agent.x, agent.y)
    ctx.rotate(spin)
    segments(ctx, 0, 0, radius - 4, node.role === 'lead' ? 24 : 16)
    ctx.strokeStyle = color + '20'
    ctx.lineWidth = active ? 9 : 7
    ctx.stroke()
    ctx.strokeStyle = color + (active ? 'ff' : 'c0')
    ctx.lineWidth = active ? 4.5 : 3.5
    ctx.stroke()
    ctx.restore()
    if (moving && stage === 'working' && detailed) {
      // A bright tracer orbits just outside the ring, the opposite way.
      const angle = -time * 1.7 + agent.y * 0.01
      ctx.beginPath()
      ctx.arc(agent.x, agent.y, radius + 3, angle, angle + 0.5)
      ctx.strokeStyle = '#d9faff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    if (stage === 'waiting' && moving && detailed) {
      const phase = (time * 0.45) % 1
      circle(ctx, agent.x, agent.y, radius + phase * 24)
      ctx.strokeStyle = color
      ctx.globalAlpha *= (1 - phase) * 0.55
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.globalAlpha = agent.opacity
    }
    if (moving && detailed && node.activity) drawActivityEffect(ctx, agent, node, radius, time)
    if (node.role === 'lead') {
      ctx.save()
      drawLeadInstrument(ctx, agent, radius, mission, time, moving, detailed)
      ctx.restore()
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${node.role === 'lead' ? 17 : 13}px ${FONT}`
    ctx.fillStyle = color
    const subtitle = node.collapsed ? `+${node.hiddenChildren}` : node.role === 'lead' ? 'LEAD' : node.role === 'sublead' ? `×${node.summary.children}` : ''
    // The thinking glyph counts its dots so a quiet worker still reads as alive.
    const glyph = node.glyph === '…' && moving ? '.'.repeat(1 + Math.floor(time * 2) % 3) : node.glyph
    // The lead's core shows which AI runs it; other nodes wear it as a small rim badge.
    const runtime = isRuntime(node.runtime) ? node.runtime : null
    if (node.role === 'lead' && runtime) {
      // The mark floats like a hologram: a faint cyan ghost just beside it, then the mark over a soft glow.
      ctx.save()
      ctx.globalAlpha *= 0.22
      drawRuntimeMark(ctx, runtime, agent.x + 0.8, agent.y - 6, core * 0.62, '#5ff0ff')
      ctx.restore()
      const glow = core * 0.55
      ctx.drawImage(getAgentGlowSprite(color, 0, glow, '50'), agent.x - glow, agent.y - 6 - glow, glow * 2, glow * 2)
      drawRuntimeMark(ctx, runtime, agent.x, agent.y - 6, core * 0.62)
    }
    else ctx.fillText(glyph, agent.x, agent.y - (subtitle ? 5 : 0))
    if (node.role !== 'lead' && runtime && detailed) {
      const offset = radius * 0.74
      drawRuntimeBadge(ctx, runtime, agent.x + offset, agent.y - offset, Math.max(9, radius * 0.36), color + 'c0')
    }
    if (subtitle) {
      ctx.font = `bold 10px ${FONT}`
      ctx.fillStyle = '#eaf6ff'
      ctx.fillText(subtitle, agent.x, agent.y + 12)
    }
    if (showLabels) drawMissionLabel(ctx, agent, node, radius, color, viewScale)
    ctx.restore()
  }
}
