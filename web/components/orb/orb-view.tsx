'use client'
/**
 * Orb mode: a floating portrait and status for the current team.
 * Desktop hooks (drag, click-through, open full view, menu) come from the orb preload when present.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTeamFeed, type TeamReply } from '@/hooks/use-team-feed'
import { orbSummary, pickOrbTeam, type OrbSummary } from '@/lib/orb-model'
import {drawOfficeAvatar} from '@/components/agent-visualizer/office/office-art'
import type {OfficeAppearance} from '@/lib/office-types'
import {useOfficeAvatarArt} from '@/components/agent-visualizer/office/use-office-avatar-art'
import {useOfficeIdentities} from '@/components/agent-visualizer/office/use-office-identities'
import {officeAppearance,officeKey} from '@/lib/office-model'
import type { TeamAgentRow, TeamAgentStatus } from '@/lib/team-types'
import { STATUS_LABEL } from '@/lib/team-model'
import { PromptBar } from '@/components/prompt/prompt-bar'
import { canSendPrompts } from '@/lib/desktop-actions'
import { modelChoices } from '@/lib/prompt-model'

interface OrbDesktop {
  setInteractive(value: boolean): void
  moveTo(position: { x: number; y: number; done?: boolean }): void
  openFull(): void
  menu(): void
  setExpanded?(value: boolean): void
  onLayout?(callback: (layout: OrbLayout) => void): () => void
}
interface OrbLayout { expanded: boolean; left: number; top: number; panel: 'below' | 'above'; scale?: number }
declare global { interface Window { agentFlowOrb?: OrbDesktop } }

export const ORB_SIZE = { width: 260, height: 330 }
/** The top 60px hold the lead's latest reply; the lens sits below it. */
const REPLY_SPACE = 60
const CENTER = { x: 130, y: 112 + REPLY_SPACE }
/** A reply stays readable for 10 minutes, then fades out so the orb does not show stale news. */
const REPLY_MAX_AGE = 10 * 60_000
const HIT_RADIUS = 104
const TAU = Math.PI * 2

const DOT_COLOR: Record<TeamAgentStatus, string> = {
  running: '#eebd76', thinking: '#eebd76', background: '#eebd76',
  waiting_approval: '#ffb45e', waiting_input: '#ffb45e',
  done: '#b8d48a', failed: '#f2ab95', cancelled: '#817b6d', idle: '#96907f',
}

const SAT_ORBIT = 93
const SAT_RADIUS = 6
const PORTRAIT_X = -29
const PORTRAIT_Y = 8
const PORTRAIT_RADIUS = 71
const CAPTION_X = 52
const CAPTION_WIDTH = 71

/** Compact, stable worker markers leave the lead and caption in the foreground. */
export function satellitePositions(count: number): Array<{ x: number; y: number }> {
  const span = Math.min(2.6, Math.max(0, count - 1) * 0.37)
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 - span / 2 + (count > 1 ? (index / (count - 1)) * span : 0)
    return { x: Math.cos(angle) * SAT_ORBIT, y: Math.sin(angle) * SAT_ORBIT }
  })
}

function drawSatellites(ctx: CanvasRenderingContext2D, summary: OrbSummary) {
  const positions = satellitePositions(summary.dots.length)
  ctx.save()
  ctx.lineWidth = 1.5
  summary.dots.forEach((dot, index) => {
    const { x, y } = positions[index]
    ctx.fillStyle = '#272920'
    ctx.strokeStyle = DOT_COLOR[dot.status]
    ctx.beginPath(); ctx.arc(x, y, SAT_RADIUS, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath(); ctx.arc(x, y, 2.3, 0, TAU); ctx.fill()
  })
  if (summary.overflow > 0) {
    ctx.fillStyle = '#f3e8d2'
    ctx.font = '600 10px Segoe UI, system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`+${summary.overflow}`, SAT_ORBIT * 0.97, -48)
  }
  ctx.restore()
}

function ringColors(summary: OrbSummary, lead: TeamAgentRow) {
  if (summary.alert === 'waiting') return [DOT_COLOR.waiting_approval, '#ffdc91']
  if (summary.alert === 'failed' || lead.status === 'failed') return [DOT_COLOR.failed, '#f6aa40']
  if (lead.status === 'done') return [DOT_COLOR.done, '#ffa632']
  if (summary.busy) return ['#ffa632', '#ffd180']
  return ['#8b946d', '#d6a355']
}

function drawLead(ctx: CanvasRenderingContext2D, lead: TeamAgentRow, appearance: OfficeAppearance | undefined, atlas: CanvasImageSource | null, colors: string[]) {
  ctx.save()
  ctx.translate(PORTRAIT_X, PORTRAIT_Y)
  ctx.fillStyle = '#25271f'
  ctx.shadowColor = '#17120e91'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
  ctx.beginPath(); ctx.arc(0, 0, PORTRAIT_RADIUS, 0, TAU); ctx.fill()
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  ctx.lineWidth = 10
  ctx.strokeStyle = colors[0]
  ctx.beginPath(); ctx.arc(0, 0, PORTRAIT_RADIUS - 5, 0, TAU); ctx.stroke()
  ctx.strokeStyle = colors[1]
  ctx.beginPath(); ctx.arc(0, 0, PORTRAIT_RADIUS - 5, Math.PI * .76, Math.PI * 1.27); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 53, 0, TAU); ctx.clip()
  ctx.fillStyle = '#473528'; ctx.fillRect(-53, -53, 106, 106)
  if (appearance) {
    ctx.scale(2.17, 2.17)
    drawOfficeAvatar(ctx, appearance, 0, 48, 0, { face: 1, portrait: true }, atlas)
  } else {
    ctx.fillStyle = '#f3e8d2'; ctx.font = '700 35px Segoe UI, system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(Array.from(lead.name.trim())[0] ?? '•', 0, 2)
  }
  ctx.restore()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text
  const characters = Array.from(text)
  while (characters.length > 1 && ctx.measureText(`${characters.join('')}…`).width > width) characters.pop()
  return `${characters.join('')}…`
}

function contextRemaining(context: TeamAgentRow['context']) {
  if (!context || !Number.isFinite(context.used) || !Number.isFinite(context.max) || context.max <= 0) return null
  return Math.round(Math.max(0, Math.min(1, 1 - context.used / context.max)) * 100)
}

function drawCaption(ctx: CanvasRenderingContext2D, summary: OrbSummary, lead: TeamAgentRow, color: string) {
  const status = summary.alert === 'waiting' ? 'Needs you' : summary.alert === 'failed' ? 'Failed'
    : STATUS_LABEL[lead.status]
  const working = summary.dots.filter(dot => dot.working).length
  const context = contextRemaining(lead.context)
  const detail = working ? `${working} working` : context === null ? null : `Ctx ${context}% left`
  const height = detail ? 64 : 50

  ctx.save()
  ctx.fillStyle = '#25271f'
  ctx.strokeStyle = '#554b37'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(CAPTION_X - 6, PORTRAIT_Y - height / 2, CAPTION_WIDTH + 12, height, 8); ctx.fill(); ctx.stroke()
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.font = '700 16px Segoe UI, system-ui, sans-serif'
  ctx.fillStyle = '#f3e8d2'
  const top = PORTRAIT_Y - height / 2
  ctx.fillText(fitText(ctx, lead.name, CAPTION_WIDTH), CAPTION_X, top + 15)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(CAPTION_X + 3, top + 33, 3, 0, TAU); ctx.fill()
  ctx.font = '12px Segoe UI, system-ui, sans-serif'; ctx.fillStyle = '#f3e8d2'
  ctx.fillText(fitText(ctx, status, CAPTION_WIDTH - 12), CAPTION_X + 11, top + 33)
  if (detail) {
    ctx.fillStyle = '#c7b99f'; ctx.font = '10px Segoe UI, system-ui, sans-serif'
    ctx.fillText(fitText(ctx, detail, CAPTION_WIDTH), CAPTION_X, top + 49)
  }
  ctx.restore()
}

/** Wrap text into at most `lines` lines of `width` px, ending with … when cut. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest && out.length < lines) {
    if (ctx.measureText(rest).width <= width) { out.push(rest); rest = ''; break }
    let cut = rest.length
    while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > width) cut--
    const space = rest.lastIndexOf(' ', cut)
    if (space > cut * 0.5) cut = space
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest && out.length) {
    let last = out[out.length - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    out[out.length - 1] = `${last.trimEnd()}…`
  }
  return out
}

/** The lead's latest reply, faint above the lens; `alpha` rises on hover. */
function drawReply(ctx: CanvasRenderingContext2D, reply: TeamReply, alpha: number) {
  if (alpha <= 0.01) return
  ctx.save()
  ctx.font = '11px "Segoe UI", system-ui, sans-serif'
  const lines = wrapText(ctx, reply.text, 228, 3)
  const height = lines.length * 14 + 12, top = -CENTER.y + Math.max(2, REPLY_SPACE + 4 - height), width = 244
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(34, 37, 30, 0.94)'
  ctx.beginPath(); ctx.roundRect(-width / 2, top, width, height, 9); ctx.fill()
  ctx.strokeStyle = 'rgba(238, 189, 118, 0.38)'; ctx.lineWidth = 1; ctx.stroke()
  ctx.fillStyle = '#f3e8d2'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  lines.forEach((line, index) => ctx.fillText(line, -width / 2 + 9, top + 13 + index * 14))
  ctx.restore()
}

function drawHealthTag(ctx: CanvasRenderingContext2D, health: 'stale' | 'offline') {
  const text = health === 'offline' ? 'OFFLINE · last known' : 'T3 UNREADABLE · last known'
  ctx.save()
  ctx.font = '700 9px "Cascadia Mono", Consolas, monospace'
  const width = ctx.measureText(text).width + 14
  ctx.fillStyle = 'rgba(30, 10, 14, 0.9)'; ctx.strokeStyle = health === 'offline' ? DOT_COLOR.failed : DOT_COLOR.waiting_approval
  ctx.beginPath(); ctx.roundRect(-width / 2, -CENTER.y + 4, width, 16, 8); ctx.fill(); ctx.stroke()
  ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, -CENTER.y + 12.5)
  ctx.restore()
}

export function OrbView() {
  const feed = useTeamFeed()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [focusTeam, setFocusTeam] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(false)
  const baseTitle = useRef('Agent Flow')
  // A satellite's name stays shown while hovered, even when team data refreshes.
  const hoverTitle = useRef<string | null>(null)
  // The desktop keeps the orb fixed on screen and says where it sits inside the expanded window.
  const [layout, setLayout] = useState<OrbLayout | null>(null)
  const interactiveRef = useRef(false)
  // Orb size from the desktop's Size menu (1 = the original 260×270).
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  useEffect(() => window.agentFlowOrb?.onLayout?.(next => {
    // Collapsing returns the window to click-through; the next hover over the orb must ask for input again.
    if (!next.expanded) interactiveRef.current = false
    if (typeof next.scale === 'number' && next.scale > 0) { scaleRef.current = next.scale; setScale(next.scale) }
    setLayout(next)
  }), [])
  // A team the user just prompted from the orb takes over until they lock another one.
  const snapshot = pickOrbTeam(feed.snapshots, feed.locked ?? focusTeam)
  const summary = useMemo(() => snapshot ? orbSummary(snapshot) : null, [snapshot])
  const teams=useMemo(()=>Object.values(feed.snapshots),[feed.snapshots])
  const slots=useOfficeIdentities(teams)
  const atlas=useOfficeAvatarArt()
  const leadAgent = snapshot?.agents.find(agent => agent.role === 'lead')
  const slot = snapshot && leadAgent ? slots.get(officeKey(snapshot.sessionId, leadAgent.id)) : undefined
  const appearance = useMemo(() => typeof slot === 'number' ? officeAppearance(slot) : undefined, [slot])
  const reply = snapshot ? feed.replies[snapshot.sessionId] ?? null : null
  const latest = useRef({ summary, leadAgent, health: feed.health, reply, appearance, atlas })
  latest.current = { summary, leadAgent, health: feed.health, reply, appearance, atlas }
  // Reply opacity eases toward faint, or strong while hovered.
  const replyHover = useRef(false)

  // Transparent page: only the orb is visible on the desktop.
  useEffect(() => {
    for (const element of [document.documentElement, document.body]) { element.style.background = 'transparent'; element.style.overflow = 'hidden' }
  }, [])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext('2d')
    if (!context) return
    const ctx: CanvasRenderingContext2D = context
    let dpr = 0, timer = 0, stopped = false, replyAlpha = 0, replyKey = ''
    function render() {
      if (stopped) return
      const { summary: current, leadAgent: lead, health, reply: answer, appearance: portrait, atlas: art } = latest.current
      // Follow monitor changes so the orb stays sharp on a different DPI.
      const ratio = window.devicePixelRatio || 1
      const zoom = scaleRef.current
      if (ratio * zoom !== dpr) { dpr = ratio * zoom; element!.width = Math.round(ORB_SIZE.width * dpr); element!.height = Math.round(ORB_SIZE.height * dpr) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, ORB_SIZE.width, ORB_SIZE.height)
      ctx.translate(CENTER.x, CENTER.y)
      if (!current || !lead) {
        const text = health === 'offline' ? 'Agent Flow offline' : 'No T3 team'
        ctx.fillStyle = '#25271f'
        ctx.strokeStyle = '#736149'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.roundRect(-81, -22, 162, 44, 10); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#e6d8bd'; ctx.font = '600 13px Segoe UI, system-ui, sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0)
      } else {
        ctx.globalAlpha = health === 'ok' ? 1 : .55
        const colors = ringColors(current, lead)
        drawLead(ctx, lead, portrait, art, colors)
        drawSatellites(ctx, current)
        drawCaption(ctx, current, lead, colors[0])
        // A new reply fades in; it rests faint, brightens under the pointer, and fades out once it is old.
        if (answer) {
          if (answer.text !== replyKey) { replyKey = answer.text; replyAlpha = 0 }
          const age = answer.at ? Date.now() - answer.at : 0
          const target = age > REPLY_MAX_AGE ? 0 : replyHover.current ? 0.96 : 0.42
          replyAlpha += (target - replyAlpha) * 0.18
          drawReply(ctx, answer, replyAlpha)
        }
        ctx.globalAlpha = 1
        if (health !== 'ok') drawHealthTag(ctx, health)
      }
      timer = window.setTimeout(render, health === 'ok' ? 66 : 125)
    }
    render()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [])

  // Desktop behaviour: click-through outside the orb, drag to move, click for the prompt panel,
  // double-click to open the full view, right-click for the menu.
  useEffect(() => {
    const desktop = window.agentFlowOrb
    if (!desktop) return
    const api: OrbDesktop = desktop
    // The hover cache lives in a ref so a collapse (which forces native click-through) can reset it.
    let clickTimer = 0
    let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null
    const over = (event: MouseEvent) => {
      const rect = canvas.current?.getBoundingClientRect()
      if (!rect) return false
      const x = (event.clientX - rect.left) / scaleRef.current, y = (event.clientY - rect.top) / scaleRef.current
      const dx = x - CENTER.x, dy = y - CENTER.y
      const onLabel = dx >= CAPTION_X - 6 && dx <= CAPTION_X + CAPTION_WIDTH + 6 && Math.abs(dy - PORTRAIT_Y) <= 32
      const onReply = Boolean(latest.current.reply) && y < REPLY_SPACE + 4 && Math.abs(dx) < 124
      replyHover.current = onReply
      return Math.hypot(dx, dy) <= HIT_RADIUS || onLabel || onReply
    }
    const move = (event: PointerEvent) => {
      if (drag) {
        const dx = event.screenX - drag.x, dy = event.screenY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        if (drag.moved) api.moveTo({ x: drag.left + dx, y: drag.top + dy })
        return
      }
      // Name and status of the worker under the pointer.
      const rect = canvas.current?.getBoundingClientRect(), current = latest.current.summary
      if (rect && canvas.current && current) {
        const px = (event.clientX - rect.left) / scaleRef.current - CENTER.x, py = (event.clientY - rect.top) / scaleRef.current - CENTER.y
        const index = satellitePositions(current.dots.length).findIndex(point => Math.hypot(point.x - px, point.y - py) <= SAT_RADIUS + 5)
        const dot = current.dots[index]
        hoverTitle.current = dot ? `${dot.name}\n${STATUS_LABEL[dot.status]}` : null
        canvas.current.title = hoverTitle.current ?? baseTitle.current
      }
      // While the panel is open the whole window takes input; only the collapsed orb is click-through.
      if (expandedRef.current) return
      const hit = over(event)
      if (hit !== interactiveRef.current) { interactiveRef.current = hit; api.setInteractive(hit) }
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !over(event)) return
      drag = { x: event.screenX, y: event.screenY, left: window.screenX, top: window.screenY, moved: false }
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    }
    const up = (event: PointerEvent) => {
      const current = drag
      drag = null
      if (!current) return
      if (current.moved) { api.moveTo({ x: current.left + event.screenX - current.x, y: current.top + event.screenY - current.y, done: true }); return }
      // A single click toggles the prompt panel; wait briefly so a double-click can open the full view instead.
      window.clearTimeout(clickTimer)
      clickTimer = window.setTimeout(() => setExpanded(value => !value), 260)
    }
    const leave = () => { replyHover.current = false; if (!drag && interactiveRef.current && !expandedRef.current) { interactiveRef.current = false; api.setInteractive(false) } }
    const open = (event: MouseEvent) => { if (over(event)) { window.clearTimeout(clickTimer); api.openFull() } }
    const menu = (event: MouseEvent) => { if (!over(event)) return; event.preventDefault(); api.menu() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    document.addEventListener('mouseleave', leave)
    window.addEventListener('dblclick', open)
    window.addEventListener('contextmenu', menu)
    return () => {
      window.clearTimeout(clickTimer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.removeEventListener('mouseleave', leave)
      window.removeEventListener('dblclick', open)
      window.removeEventListener('contextmenu', menu)
    }
  }, [])

  useEffect(() => {
    expandedRef.current = expanded
    window.agentFlowOrb?.setExpanded?.(expanded)
  }, [expanded])

  const threads = useMemo(() => Object.values(feed.snapshots)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map(team => ({ id: team.sessionId, label: team.title })), [feed.snapshots])

  const models = useMemo(() => modelChoices(Object.values(feed.snapshots)), [feed.snapshots])
  // The caption stays short; the lead's model and context live in the tooltip.
  const remaining = contextRemaining(leadAgent?.context ?? null)
  const leadDetail = leadAgent ? [leadAgent.runtime && leadAgent.model ? `${leadAgent.runtime}::${leadAgent.model}` : leadAgent.model,
    remaining === null ? null : `ctx ${remaining}% left`].filter(Boolean).join(' · ') : ''
  const title = snapshot ? `${snapshot.title}${leadDetail ? `\n${leadDetail}` : ''}\nClick to prompt · double-click to open Agent Flow · right-click for options` : 'Agent Flow'
  baseTitle.current = title
  useEffect(() => { if (canvas.current && !hoverTitle.current) canvas.current.title = title }, [title])
  const open = expanded && canSendPrompts()
  // Without a layout (collapsed, or outside the desktop app) the orb sits at the top-left and the panel flows below.
  const place = open && layout?.expanded ? layout : null
  // Centre the panel under the orb but keep it inside the window when the orb sits at a screen edge.
  const panelWidth = Math.min(360, window.innerWidth - 8)
  const panelLeft = place ? Math.max(4, Math.min(place.left + (ORB_SIZE.width * scale) / 2 - panelWidth / 2, window.innerWidth - panelWidth - 4)) : 0
  const panelStyle: React.CSSProperties = place
    ? place.panel === 'below'
      ? { position: 'absolute', left: panelLeft, top: place.top + ORB_SIZE.height * scale - 6, width: panelWidth }
      : { position: 'absolute', left: panelLeft, bottom: `calc(100% - ${place.top + 18}px)`, width: panelWidth }
    : { width: panelWidth, marginTop: -6 }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: 'transparent' }}>
      <canvas ref={canvas} aria-label={summary ? `${snapshot!.title}: ${summary.line}` : 'No T3 team'}
        style={{ position: place ? 'absolute' : 'relative', left: place?.left ?? 0, top: place?.top ?? 0,
          width: ORB_SIZE.width * scale, height: ORB_SIZE.height * scale, display: 'block', cursor: 'grab', background: 'transparent' }} />
      {open && (
        <div style={panelStyle}>
          <PromptBar compact autoFocus projects={feed.projects} threads={threads} models={models} selectedThreadId={snapshot?.sessionId ?? null}
            onClose={() => setExpanded(false)}
            onSent={sessionId => { setFocusTeam(sessionId); window.setTimeout(() => setExpanded(false), 1400) }} />
        </div>
      )}
    </div>
  )
}
