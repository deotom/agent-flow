'use client'
/**
 * Orb mode: a floating, transparent reactor for the current team.
 * The lead is drawn with the Mission Map renderer; workers orbit it as status dots.
 * Desktop hooks (drag, click-through, open full view, menu) come from the orb preload when present.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useTeamFeed } from '@/hooks/use-team-feed'
import { buildMissionView, type MissionView } from '@/lib/mission-model'
import { missionPresentation } from '@/lib/graph-presentation'
import { createEmptyState } from '@/hooks/simulation/types'
import { orbSummary, pickOrbTeam, type OrbSummary } from '@/lib/orb-model'
import { drawMissionAgents, MISSION_COLORS } from '@/components/agent-visualizer/canvas/draw-mission'
import type { TeamAgentStatus } from '@/lib/team-types'

interface OrbDesktop {
  setInteractive(value: boolean): void
  moveTo(position: { x: number; y: number; done?: boolean }): void
  openFull(): void
  menu(): void
}
declare global { interface Window { agentFlowOrb?: OrbDesktop } }

export const ORB_SIZE = { width: 260, height: 270 }
const CENTER = { x: 130, y: 104 }
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

function drawOrbit(ctx: CanvasRenderingContext2D, summary: OrbSummary, time: number) {
  const count = summary.dots.length
  summary.dots.forEach((dot, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(count, 1)) * TAU + (dot.working ? time * 0.35 : 0)
    const x = Math.cos(angle) * ORBIT, y = Math.sin(angle) * ORBIT
    const color = DOT_COLOR[dot.status]
    ctx.save()
    ctx.globalAlpha = dot.working || dot.status.startsWith('waiting') || dot.status === 'failed' ? 1 : 0.45
    if (dot.working) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 11)
      glow.addColorStop(0, `${color}aa`); glow.addColorStop(1, `${color}00`)
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill()
    }
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(x, y, dot.working ? 4.2 : 3.4, 0, TAU); ctx.fill()
    ctx.restore()
  })
  if (summary.overflow > 0) {
    ctx.save()
    ctx.font = '600 10px "Cascadia Mono", Consolas, monospace'
    ctx.fillStyle = '#9fd8ee'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`+${summary.overflow}`, ORBIT * 0.72, -ORBIT * 0.72)
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
  const snapshot = pickOrbTeam(feed.snapshots, feed.locked)
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
      drawOrbit(ctx, current, time)
      drawMissionAgents(ctx, lead.agents, lead.view, null, null, time, true, 1, true)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Desktop behaviour: click-through outside the orb, drag to move, double-click to open, right-click for the menu.
  useEffect(() => {
    const desktop = window.agentFlowOrb
    if (!desktop) return
    const api: OrbDesktop = desktop
    let interactive = false
    let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null
    const over = (event: MouseEvent) => {
      const dx = event.clientX - CENTER.x, dy = event.clientY - CENTER.y
      const onLabel = event.clientY > CENTER.y + 50 && event.clientY < CENTER.y + 160 && Math.abs(dx) < 120
      return Math.hypot(dx, dy) <= HIT_RADIUS || onLabel
    }
    const move = (event: PointerEvent) => {
      if (drag) {
        const dx = event.screenX - drag.x, dy = event.screenY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        if (drag.moved) api.moveTo({ x: drag.left + dx, y: drag.top + dy })
        return
      }
      const hit = over(event)
      if (hit !== interactive) { interactive = hit; api.setInteractive(hit) }
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !over(event)) return
      drag = { x: event.screenX, y: event.screenY, left: window.screenX, top: window.screenY, moved: false }
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    }
    const up = (event: PointerEvent) => {
      if (drag?.moved) api.moveTo({ x: drag.left + event.screenX - drag.x, y: drag.top + event.screenY - drag.y, done: true })
      drag = null
    }
    const leave = () => { if (!drag && interactive) { interactive = false; api.setInteractive(false) } }
    const open = (event: MouseEvent) => { if (over(event)) api.openFull() }
    const menu = (event: MouseEvent) => { event.preventDefault(); if (over(event)) api.menu() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    document.addEventListener('mouseleave', leave)
    window.addEventListener('dblclick', open)
    window.addEventListener('contextmenu', menu)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.removeEventListener('mouseleave', leave)
      window.removeEventListener('dblclick', open)
      window.removeEventListener('contextmenu', menu)
    }
  }, [])

  const title = snapshot ? `${snapshot.title}\nDouble-click to open Agent Flow · right-click for options` : 'Agent Flow'
  return <canvas ref={canvas} title={title} aria-label={summary ? `${snapshot!.title}: ${summary.line}` : 'No T3 team'}
    style={{ width: ORB_SIZE.width, height: ORB_SIZE.height, display: 'block', cursor: 'grab', background: 'transparent' }} />
}
