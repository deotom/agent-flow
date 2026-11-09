'use client'
/**
 * Orb mode: a floating, transparent reactor for the current team.
 * The lead is drawn with the Mission Map renderer; workers are small satellite reactors on the upper arc.
 * Desktop hooks (drag, click-through, open full view, menu) come from the orb preload when present.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTeamFeed } from '@/hooks/use-team-feed'
import { buildMissionView, type MissionView } from '@/lib/mission-model'
import { missionPresentation } from '@/lib/graph-presentation'
import { createEmptyState } from '@/hooks/simulation/types'
import { orbSummary, pickOrbTeam, type OrbSummary } from '@/lib/orb-model'
import { drawMissionAgents, MISSION_COLORS } from '@/components/agent-visualizer/canvas/draw-mission'
import type { TeamAgentStatus } from '@/lib/team-types'
import { STATUS_LABEL } from '@/lib/team-model'
import { PromptBar } from '@/components/prompt/prompt-bar'
import { canSendPrompts } from '@/lib/desktop-actions'

interface OrbDesktop {
  setInteractive(value: boolean): void
  moveTo(position: { x: number; y: number; done?: boolean }): void
  openFull(): void
  menu(): void
  setExpanded?(value: boolean): void
  onLayout?(callback: (layout: OrbLayout) => void): () => void
}
interface OrbLayout { expanded: boolean; left: number; top: number; panel: 'below' | 'above' }
declare global { interface Window { agentFlowOrb?: OrbDesktop } }

export const ORB_SIZE = { width: 260, height: 270 }
const CENTER = { x: 130, y: 112 }
const ORBIT = 84
const HIT_RADIUS = 104
const TAU = Math.PI * 2

const DOT_COLOR: Record<TeamAgentStatus, string> = {
  running: MISSION_COLORS.working, thinking: MISSION_COLORS.working, background: MISSION_COLORS.working,
  waiting_approval: MISSION_COLORS.waiting, waiting_input: MISSION_COLORS.waiting,
  done: MISSION_COLORS.received, failed: MISSION_COLORS.failed, cancelled: MISSION_COLORS.cancelled, idle: MISSION_COLORS.unknown,
}

/** The lead alone, centred, drawn by the Mission Map renderer. */
function leadScene(summary: OrbSummary | null): { view: MissionView; agents: ReturnType<typeof missionPresentation>['agents'] } | null {
  if (!summary) return null
  const lead = summary.snapshot.agents.find(agent => agent.role === 'lead')
  if (!lead) return null
  const base = buildMissionView(summary.snapshot, new Set([lead.id]))
  if (!base) return null
  const working = summary.dots.filter(dot => dot.working).length
  // The plate's status line speaks for the whole team, e.g. "› idle · 2 working".
  const nodes = new Map([...base.nodes].map(([id, node]) => [id, id === lead.id ? { ...node, statusLine: summary.line } : node]))
  const view = { ...base, nodes, links: [], dataRing: `agents:${summary.snapshot.agents.length} · working:${working} · ` }
  return { view, agents: missionPresentation(createEmptyState(), view).agents }
}

/** Satellites sit on the upper arc so they never cover the lead's plate below. */
const SAT_ORBIT = 90
const SAT_RADIUS = 12
const RUNTIME_MARK: Record<string, { letter: string; color: string }> = {
  claude: { letter: 'C', color: '#f0a070' }, codex: { letter: 'X', color: '#c3f5ff' },
}
export function satellitePositions(count: number, time = 0): Array<{ x: number; y: number }> {
  const span = Math.min(Math.PI * 1.45, Math.max(0, count - 1) * 0.62)
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 - span / 2 + (count > 1 ? (index / (count - 1)) * span : 0)
    const bob = Math.sin(time * 1.4 + index * 1.7) * 1.6
    return { x: Math.cos(angle) * (SAT_ORBIT + bob), y: Math.sin(angle) * (SAT_ORBIT + bob) }
  })
}

function drawSatellites(ctx: CanvasRenderingContext2D, summary: OrbSummary, time: number) {
  const positions = satellitePositions(summary.dots.length, time)
  summary.dots.forEach((dot, index) => {
    const { x, y } = positions[index]
    const color = DOT_COLOR[dot.status]
    const waiting = dot.status === 'waiting_approval' || dot.status === 'waiting_input'
    const settled = !dot.working && !waiting && dot.status !== 'failed'
    const distance = Math.hypot(x, y), ux = x / distance, uy = y / distance
    ctx.save()
    ctx.globalAlpha = settled ? 0.55 : 1
    // Tether from the lead's ring to the satellite; a light packet travels out while the worker works.
    const from = 62, to = distance - SAT_RADIUS - 2
    ctx.strokeStyle = `${color}55`; ctx.lineWidth = 1; ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.moveTo(ux * from, uy * from); ctx.lineTo(ux * to, uy * to); ctx.stroke(); ctx.setLineDash([])
    if (dot.working) {
      const t = (time * 0.9 + index * 0.37) % 1, r = from + (to - from) * t
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6
      ctx.beginPath(); ctx.arc(ux * r, uy * r, 1.6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0
    }
    // Halo
    if (!settled) {
      const pulse = waiting ? 0.5 + 0.5 * Math.sin(time * 5) : 0.75
      const glow = ctx.createRadialGradient(x, y, SAT_RADIUS * 0.6, x, y, SAT_RADIUS * 2.1)
      glow.addColorStop(0, `${color}${Math.round(80 * pulse).toString(16).padStart(2, '0')}`); glow.addColorStop(1, `${color}00`)
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, SAT_RADIUS * 2.1, 0, TAU); ctx.fill()
    }
    // Core
    const core = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, SAT_RADIUS)
    core.addColorStop(0, '#1d3a55'); core.addColorStop(1, '#071321')
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, SAT_RADIUS - 2.5, 0, TAU); ctx.fill()
    // Segmented status ring, spinning while the worker works
    const segments = 6, gap = 0.28, spin = dot.working ? time * 2.2 : 0
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round'
    if (!settled) { ctx.shadowColor = color; ctx.shadowBlur = 5 }
    for (let i = 0; i < segments; i++) {
      const a = spin + (i / segments) * TAU
      ctx.beginPath(); ctx.arc(x, y, SAT_RADIUS, a + gap / 2, a + TAU / segments - gap / 2); ctx.stroke()
    }
    ctx.shadowBlur = 0
    // Runtime mark in the core
    const mark = RUNTIME_MARK[dot.runtime ?? ''] ?? { letter: '•', color: '#9fc4d8' }
    ctx.fillStyle = mark.color; ctx.font = '700 10px "Cascadia Mono", Consolas, monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark.letter, x, y + 0.5)
    // Outcome badge
    const badge = waiting ? { text: '?', fill: MISSION_COLORS.waiting } : dot.status === 'failed' ? { text: '!', fill: MISSION_COLORS.failed }
      : dot.status === 'done' ? { text: '✓', fill: MISSION_COLORS.received } : null
    if (badge) {
      const bx = x + SAT_RADIUS * 0.75, by = y - SAT_RADIUS * 0.75
      ctx.globalAlpha = 1; ctx.fillStyle = badge.fill
      ctx.beginPath(); ctx.arc(bx, by, 4.3, 0, TAU); ctx.fill()
      ctx.fillStyle = '#04121c'; ctx.font = '800 6.5px Segoe UI, sans-serif'; ctx.fillText(badge.text, bx, by + 0.4)
    }
    ctx.restore()
  })
  if (summary.overflow > 0) {
    ctx.save()
    ctx.font = '600 10px "Cascadia Mono", Consolas, monospace'
    ctx.fillStyle = '#9fd8ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`+${summary.overflow}`, SAT_ORBIT * 0.95, SAT_ORBIT * 0.2)
    ctx.restore()
  }
}
function drawAlert(ctx: CanvasRenderingContext2D, alert: OrbSummary['alert'], time: number) {
  if (!alert) return
  ctx.save()
  if (alert === 'waiting') {
    const pulse = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(time * 4))
    ctx.strokeStyle = MISSION_COLORS.waiting; ctx.globalAlpha = pulse; ctx.lineWidth = 2.5
    ctx.shadowColor = MISSION_COLORS.waiting; ctx.shadowBlur = 14
    ctx.beginPath(); ctx.arc(0, 0, ORBIT + 12, 0, TAU); ctx.stroke()
  } else {
    const x = ORBIT * 0.72, y = ORBIT * 0.72
    ctx.fillStyle = MISSION_COLORS.failed; ctx.shadowColor = MISSION_COLORS.failed; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill()
    ctx.shadowBlur = 0; ctx.fillStyle = '#1a0710'; ctx.font = '700 11px Segoe UI, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + 0.5)
  }
  ctx.restore()
}

export function OrbView() {
  const feed = useTeamFeed()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [focusTeam, setFocusTeam] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(false)
  const baseTitle = useRef('Agent Flow')
  // The desktop keeps the orb fixed on screen and says where it sits inside the expanded window.
  const [layout, setLayout] = useState<OrbLayout | null>(null)
  useEffect(() => window.agentFlowOrb?.onLayout?.(setLayout), [])
  // A team the user just prompted from the orb takes over until they lock another one.
  const snapshot = pickOrbTeam(feed.snapshots, feed.locked ?? focusTeam)
  const summary = useMemo(() => snapshot ? orbSummary(snapshot) : null, [snapshot])
  const scene = useMemo(() => leadScene(summary), [summary])
  const latest = useRef({ summary, scene })
  latest.current = { summary, scene }

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
    const dpr = window.devicePixelRatio || 1
    element.width = ORB_SIZE.width * dpr; element.height = ORB_SIZE.height * dpr
    let frame = 0, last = 0
    const start = performance.now()
    function render(now: number) {
      frame = requestAnimationFrame(render)
      const { summary: current, scene: lead } = latest.current
      // Nothing moving: about 10 fps is enough and keeps an all-day orb cheap.
      if (!current?.busy && now - last < 100) return
      last = now
      const time = (now - start) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, ORB_SIZE.width, ORB_SIZE.height)
      ctx.translate(CENTER.x, CENTER.y)
      if (!current || !lead) {
        ctx.strokeStyle = '#2d5568'; ctx.setLineDash([3, 5]); ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.stroke()
        ctx.setLineDash([]); ctx.fillStyle = '#7fa6bb'; ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('No T3 team', 0, 4)
        return
      }
      drawAlert(ctx, current.alert, time)
      drawSatellites(ctx, current, time)
      drawMissionAgents(ctx, lead.agents, lead.view, null, null, time, true, 1, true)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [])

  //   // Desktop behaviour: click-through outside the orb, drag to move, click for the prompt panel,
  // double-click to open the full view, right-click for the menu.
  useEffect(() => {
    const desktop = window.agentFlowOrb
    if (!desktop) return
    const api: OrbDesktop = desktop
    let interactive = false
    let clickTimer = 0
    let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null
    const over = (event: MouseEvent) => {
      const rect = canvas.current?.getBoundingClientRect()
      if (!rect) return false
      const x = event.clientX - rect.left, y = event.clientY - rect.top
      const dx = x - CENTER.x, dy = y - CENTER.y
      const onLabel = y > CENTER.y + 50 && y < CENTER.y + 160 && Math.abs(dx) < 120
      return Math.hypot(dx, dy) <= HIT_RADIUS || onLabel
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
        const px = event.clientX - rect.left - CENTER.x, py = event.clientY - rect.top - CENTER.y
        const index = satellitePositions(current.dots.length).findIndex(point => Math.hypot(point.x - px, point.y - py) <= SAT_RADIUS + 5)
        const dot = current.dots[index]
        canvas.current.title = dot ? `\n${STATUS_LABEL[dot.status]}` : baseTitle.current
      }
      // While the panel is open the whole window takes input; only the collapsed orb is click-through.
      if (expandedRef.current) return
      const hit = over(event)
      if (hit !== interactive) { interactive = hit; api.setInteractive(hit) }
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
    const leave = () => { if (!drag && interactive && !expandedRef.current) { interactive = false; api.setInteractive(false) } }
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

  const title = snapshot ? `${snapshot.title}\nClick to prompt · double-click to open Agent Flow · right-click for options` : 'Agent Flow'
    const open = expanded && canSendPrompts()
  // Without a layout (collapsed, or outside the desktop app) the orb sits at the top-left and the panel flows below.
  const place = open && layout?.expanded ? layout : null
  const panelStyle: React.CSSProperties = place
    ? place.panel === 'below'
      ? { position: 'absolute', left: place.left + ORB_SIZE.width / 2 - 180, top: place.top + ORB_SIZE.height - 6, width: 360 }
      : { position: 'absolute', left: place.left + ORB_SIZE.width / 2 - 180, bottom: `calc(100% - ${place.top + 18}px)`, width: 360 }
    : { width: 360, marginTop: -6 }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: 'transparent' }}>
      <canvas ref={canvas} title={title} aria-label={summary ? `${snapshot!.title}: ${summary.line}` : 'No T3 team'}
        style={{ position: place ? 'absolute' : 'relative', left: place?.left ?? 0, top: place?.top ?? 0,
          width: ORB_SIZE.width, height: ORB_SIZE.height, display: 'block', cursor: 'grab', background: 'transparent' }} />
      {open && (
        <div style={panelStyle}>
          <PromptBar compact autoFocus projects={feed.projects} threads={threads} selectedThreadId={snapshot?.sessionId ?? null}
            onClose={() => setExpanded(false)}
            onSent={sessionId => { setFocusTeam(sessionId); window.setTimeout(() => setExpanded(false), 1400) }} />
        </div>
      )}
    </div>
  )
}