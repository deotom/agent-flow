'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Agent, Particle, Edge, Discovery, DepthParticle } from '@/lib/agent-types'
import type { SimulationState } from '@/hooks/simulation/types'
import { getStateColor } from '@/lib/colors'
import { ANIM_SPEED, PERF_OVERLAY, PERF_OVERLAY_ENABLED } from '@/lib/canvas-constants'
import { BloomRenderer } from './bloom-renderer'
import { createDepthParticles, updateDepthParticles, drawBackground } from './background-layer'
import {
  type VisualEffect,
  drawTetherLine,
  drawEffects,
  drawAgents,
  drawMessageBubblesWorld,
  drawEdges, getActiveEdgeIds,
  drawParticles, buildEdgeMap,
  drawToolCalls,
  drawDiscoveries, drawDiscoveryConnections,
  drawCostLabels, drawCostSummaryPanel,
  detectStateChanges as detectStateChangesPure,
} from './canvas/index'
import { useCanvasCamera } from '@/hooks/use-canvas-camera'
import { drawAgentTooltip } from './canvas/agent-tooltip'
import { useCanvasInteraction } from '@/hooks/use-canvas-interaction'
import { type AnimationMode } from '@/lib/viewer-preferences'
import { visibleRoundGraph } from '@/hooks/simulation/work-rounds'
import { sessionGraphPresentation } from '@/lib/graph-presentation'
import { compactGraphPresentation, createGraphProjector } from '@/lib/graph-presentation'
import { renderBudget, hasVisualMotion, limitVisualParticles } from '@/lib/render-budget'
import { useVisibleFrameLoop } from '@/hooks/use-visible-frame-loop'


interface CanvasProps {
  topInset?: number
  restoring?: boolean
  visible?: boolean
  showAllAgents?: boolean
  currentRoundOnly?: boolean
  animationMode?: AnimationMode
  animationSpeed?: number
  compact?: boolean
  /** Ref to simulation state — read every frame without React re-renders */
  simulationRef: React.RefObject<SimulationState>
  selectedAgentId: string | null
  hoveredAgentId: string | null
  showStats: boolean
  showHexGrid: boolean
  zoomToFitTrigger?: number
  pauseAutoFit?: boolean
  onAgentClick: (agentId: string | null) => void
  onAgentHover: (agentId: string | null) => void
  onAgentDrag: (agentId: string, x: number, y: number) => void
  onContextMenu: (e: React.MouseEvent, type: 'agent' | 'edge' | 'canvas', id?: string) => void
  onToolCallClick?: (toolCallId: string | null) => void
  selectedToolCallId?: string | null
  onDiscoveryClick?: (discoveryId: string | null) => void
  selectedDiscoveryId?: string | null
  showCostOverlay?: boolean
}

export function AgentCanvas({
  topInset = 132, visible = true, restoring = false, currentRoundOnly = true, showAllAgents = false,
  animationMode = 'full', animationSpeed = 1,
  compact = false,
  simulationRef,
  selectedAgentId, hoveredAgentId, showStats, showHexGrid, zoomToFitTrigger, pauseAutoFit,
  onAgentClick, onAgentHover, onAgentDrag, onContextMenu, onToolCallClick, selectedToolCallId, onDiscoveryClick, selectedDiscoveryId, showCostOverlay,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const timeRef = useRef(0)
  const simTimeRef = useRef(0)
  const bloomRef = useRef<BloomRenderer | null>(null)
  const depthParticlesRef = useRef<DepthParticle[]>([])
  const lastFrameTimeRef = useRef(0)
  const dprRef = useRef(1)

  // Effects system
  const effectsRef = useRef<VisualEffect[]>([])
  const prevAgentStatesRef = useRef<Map<string, string>>(new Map())
  const prevToolStatesRef = useRef<Map<string, string>>(new Map())

  // Rate-limited error logging for the draw loop (avoid flooding console)
  const lastDrawErrorRef = useRef(0)

  // Performance overlay state
  const perfRef = useRef({
    frames: 0,
    lastFpsUpdate: 0,
    fps: 0,
    frameTimeMs: 0,
    frameTimes: [] as number[],
    p95: 0,
  })

  // Caches for per-frame lookups — avoid rebuilding Set/Map every ~16ms
  const edgeLookupCacheRef = useRef<{
    particles: Particle[]
    edges: Edge[]
    activeEdgeIds: Set<string>
    edgeMap: Map<string, Edge>
  }>({ particles: [], edges: [], activeEdgeIds: new Set(), edgeMap: new Map() })

  // ─── Stable refs for animation loop & event handlers ────────────────────
  // Simulation data (agents, particles, etc.) is synced from simulationRef
  // at the top of each draw frame, so it's always fresh even without re-renders.
  const scoped = showAllAgents ? sessionGraphPresentation(simulationRef.current) : visibleRoundGraph(simulationRef.current, currentRoundOnly)
  const sim = compact ? compactGraphPresentation(scoped) : scoped
  const makeDrawProps = (prev?: { isDragging: boolean }) => ({
    animationMode, animationSpeed, currentRoundOnly, showAllAgents, topInset,
    compact,
    agents: sim.agents, toolCalls: sim.toolCalls,
    particles: sim.particles, edges: sim.edges, discoveries: sim.discoveries,
    selectedAgentId, hoveredAgentId, showStats, showHexGrid,
    showCostOverlay, selectedToolCallId, selectedDiscoveryId,
    simTime: sim.currentTime, pauseAutoFit, dimensions,
    onAgentDrag, onAgentClick, onAgentHover, onContextMenu,
    onToolCallClick, onDiscoveryClick,
    isDragging: prev?.isDragging ?? false,
  })
  const drawPropsRef = useRef(makeDrawProps())
  const compactRef = useRef(compact)
  compactRef.current = compact
  drawPropsRef.current = { ...makeDrawProps(drawPropsRef.current), compact }

  // ─── Camera ─────────────────────────────────────────────────────────────
  const {
    transformRef, userHasNavigatedRef, panVelocityRef,
    screenToCanvas, doZoomToFit, updateCamera,
  } = useCanvasCamera({
    mainCanvasRef, drawPropsRef, simTimeRef, dimensions,
    agentCount: sim.agents.size, zoomToFitTrigger, selectedAgentId,
  })

  // ─── Interaction ────────────────────────────────────────────────────────
  const {
    isDragging, handlers, updateDragLerp, tooltipRef,
  } = useCanvasInteraction({
    drawPropsRef, transformRef, userHasNavigatedRef, panVelocityRef,
    simTimeRef, screenToCanvas, doZoomToFit, mainCanvasRef,
  })

  // Keep drawPropsRef in sync with interaction state
  drawPropsRef.current.isDragging = isDragging

  // ─── Setup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    depthParticlesRef.current = createDepthParticles(dimensions.width, dimensions.height)
    return () => { bloomRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- particles created once, resized by draw loop
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        setDimensions({ width: w, height: h })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ─── Detect state changes → spawn effects ──────────────────────────────

  const detectStateChanges = useCallback(() => {
    const { agents, toolCalls } = drawPropsRef.current
    const { effects, newAgentStates, newToolStates } = detectStateChangesPure(
      agents, toolCalls,
      prevAgentStatesRef.current, prevToolStatesRef.current,
    )
    effectsRef.current.push(...effects)
    prevAgentStatesRef.current = newAgentStates
    prevToolStatesRef.current = newToolStates
  }, [])

  // ─── Main draw loop ────────────────────────────────────────────────────

  // Stable ref so the rAF loop always calls the latest draw without
  // re-subscribing when the callback identity changes.
  const drawRef = useRef<(timestamp: number) => void>(() => {})
  const projectGraphRef = useRef<ReturnType<typeof createGraphProjector> | null>(null)
  if (!projectGraphRef.current) projectGraphRef.current = createGraphProjector()

  const draw = useCallback((timestamp: number) => {
    const mode = drawPropsRef.current.animationMode

    const canvas = mainCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      // Sync simulation data from ref — always fresh, independent of React renders
      {
        const s = projectGraphRef.current!(simulationRef.current, drawPropsRef.current.currentRoundOnly, compactRef.current, drawPropsRef.current.showAllAgents)
        const p = drawPropsRef.current
        p.agents = s.agents
        p.toolCalls = s.toolCalls
        p.particles = s.particles
        p.edges = s.edges
        p.discoveries = s.discoveries
        p.simTime = simulationRef.current.currentTime
      }

      const {
        agents, toolCalls, particles, edges, discoveries,
        selectedAgentId, hoveredAgentId, showStats, showHexGrid,
        showCostOverlay, selectedToolCallId, selectedDiscoveryId,
        simTime, pauseAutoFit, dimensions, onAgentDrag,
        isDragging,
      } = drawPropsRef.current
      const budget = renderBudget(mode, agents.size, hasVisualMotion(agents.values(), toolCalls.values(), particles.length, discoveries.length, effectsRef.current.length), compactRef.current)
      const transform = transformRef.current

      const deltaTime = lastFrameTimeRef.current ? (timestamp - lastFrameTimeRef.current) / 1000 : ANIM_SPEED.defaultDeltaTime
      lastFrameTimeRef.current = timestamp
      if (mode !== 'off') timeRef.current += deltaTime * drawPropsRef.current.animationSpeed
      if (simTime != null) simTimeRef.current = simTime

      const dpr = Math.min(dprRef.current, budget.pixelRatio)
      const w = dimensions.width
      const h = dimensions.height

      const pixelWidth = Math.max(1, Math.round(w * dpr))
      const pixelHeight = Math.max(1, Math.round(h * dpr))
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
        ctx.scale(dpr, dpr)
        bloomRef.current?.resize(pixelWidth, pixelHeight)
      }
      if (budget.bloom && !bloomRef.current) {
        bloomRef.current = new BloomRenderer(0.24)
        bloomRef.current.resize(pixelWidth, pixelHeight)
      } else if (mode !== 'full' || agents.size > 6 || compactRef.current) bloomRef.current = null

      // Camera physics (inertia + auto-fit)
      updateCamera(isDragging, pauseAutoFit)

      // Floaty agent drag
      updateDragLerp(agents, onAgentDrag)

      // Detect state changes → visual effects
      if (mode !== 'off') detectStateChanges()
      if (effectsRef.current.length > budget.effects) effectsRef.current = effectsRef.current.slice(-budget.effects)

      // Update effects (mutate in place to avoid GC pressure)
      {
        const effects = effectsRef.current
        let writeIdx = 0
        for (let i = 0; i < effects.length; i++) {
          effects[i].age += deltaTime
          if (effects[i].age < effects[i].duration) {
            if (writeIdx !== i) effects[writeIdx] = effects[i]
            writeIdx++
          }
        }
        effects.length = writeIdx
      }

      ctx.clearRect(0, 0, w, h)
      const backgroundParticles = depthParticlesRef.current.slice(0, budget.stars)
      if (mode !== 'off') updateDepthParticles(backgroundParticles, deltaTime, w, h)

      let activeAgentPos: { x: number; y: number; color: string } | undefined
      for (const [, agent] of agents) {
        if (agent.state === 'thinking' || agent.state === 'tool_calling' || agent.state === 'waiting_permission') {
          activeAgentPos = { x: agent.x, y: agent.y, color: getStateColor(agent.state) }
          break
        }
      }

      drawBackground(ctx, w, h, backgroundParticles, transform, !compactRef.current && budget.detailed && showHexGrid, timeRef.current, activeAgentPos)

      ctx.save()
      ctx.translate(transform.x, transform.y)
      ctx.scale(transform.scale, transform.scale)

      // Pre-compute shared lookup structures — cached across frames when inputs are unchanged
      const elCache = edgeLookupCacheRef.current
      let activeEdgeIds: Set<string>
      let edgeMap: Map<string, Edge>
      if (elCache.particles === particles && elCache.edges === edges) {
        activeEdgeIds = elCache.activeEdgeIds
        edgeMap = elCache.edgeMap
      } else {
        activeEdgeIds = getActiveEdgeIds(particles)
        edgeMap = buildEdgeMap(edges)
        edgeLookupCacheRef.current = { particles, edges, activeEdgeIds, edgeMap }
      }

      drawDiscoveryConnections(ctx, discoveries, agents)
      drawEdges(ctx, edges, agents, toolCalls, activeEdgeIds, timeRef.current, mode !== 'off', compactRef.current, !budget.detailed, simTimeRef.current)
      drawToolCalls(ctx, toolCalls, timeRef.current, selectedToolCallId)
      drawDiscoveries(ctx, discoveries, agents, selectedDiscoveryId)
      drawAgents(ctx, agents, selectedAgentId, hoveredAgentId, showStats, timeRef.current, mode !== 'off', compactRef.current, transform.scale, budget.detailed)
      if (!compactRef.current) drawMessageBubblesWorld(ctx, agents, simTimeRef.current)
      if (showCostOverlay) drawCostLabels(ctx, agents, toolCalls)
      if (mode !== 'off') {
        drawParticles(ctx, limitVisualParticles(particles, budget.particles), edgeMap, agents, toolCalls, timeRef.current)
        drawEffects(ctx, effectsRef.current)
      }

      if (selectedAgentId) {
        const agent = agents.get(selectedAgentId)
        if (agent && !compactRef.current) drawTetherLine(ctx, agent, transform, h)
      }

      ctx.restore()

      if (showCostOverlay) drawCostSummaryPanel(ctx, agents, toolCalls)
      if (budget.bloom && bloomRef.current) bloomRef.current.apply(canvas, ctx)

      drawAgentTooltip(ctx, tooltipRef.current, agents, performance.now(), w, h, compactRef.current ? 82 : topInset)

      // ─── Performance overlay (enabled via ?perf or ?stress) ──────────
      if (PERF_OVERLAY_ENABLED) {
        const perf = perfRef.current
        const frameEnd = performance.now()
        const frameMs = frameEnd - (timestamp || frameEnd)
        perf.frameTimes.push(frameMs)
        if (perf.frameTimes.length > PERF_OVERLAY.maxFrameSamples) perf.frameTimes.shift()
        perf.frames++
        perf.frameTimeMs = frameMs
        if (frameEnd - perf.lastFpsUpdate >= PERF_OVERLAY.updateIntervalMs) {
          perf.fps = perf.frames
          perf.frames = 0
          perf.lastFpsUpdate = frameEnd
          const sorted = [...perf.frameTimes].sort((a, b) => a - b)
          perf.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0
        }
        const po = PERF_OVERLAY
        const textX = po.x + po.padding
        let textY = po.y + po.lineHeight + 2
        ctx.save()
        ctx.fillStyle = po.bgColor
        ctx.fillRect(po.x, po.y, po.width, po.height)
        ctx.font = po.font
        ctx.fillStyle = perf.fps < po.fpsWarning ? po.fpsWarningColor : perf.fps < po.fpsCaution ? po.fpsCautionColor : po.fpsGoodColor
        ctx.fillText(`FPS: ${perf.fps}`, textX, textY); textY += po.lineHeight
        ctx.fillStyle = po.textColor
        ctx.fillText(`Frame: ${frameMs.toFixed(1)}ms  P95: ${perf.p95.toFixed(1)}ms`, textX, textY); textY += po.lineHeight
        ctx.fillText(`Agents: ${agents.size}`, textX, textY); textY += po.lineHeight
        ctx.fillText(`Tool calls: ${toolCalls.size}`, textX, textY); textY += po.lineHeight
        ctx.fillText(`Particles: ${particles.length}`, textX, textY); textY += po.lineHeight
        ctx.fillText(`Edges: ${edges.length}`, textX, textY); textY += po.lineHeight
        ctx.fillText(`Discoveries: ${discoveries.length}`, textX, textY)
        ctx.restore()
      }

    } catch (err) {
      // Log at most once every 5s to avoid flooding the console
      const now = Date.now()
      if (now - lastDrawErrorRef.current > 5000) {
        lastDrawErrorRef.current = now
        console.warn('[AgentCanvas] draw error:', err)
      }
    }
  }, [detectStateChanges, updateCamera, updateDragLerp, transformRef, topInset, tooltipRef])

  drawRef.current = draw

  useVisibleFrameLoop(drawRef, visible, () => {
    const current = simulationRef.current
    const budget = renderBudget(drawPropsRef.current.animationMode, current.agents.size, hasVisualMotion(current.agents.values(), current.toolCalls.values(), current.particles.length, current.discoveries.length, effectsRef.current.length), compactRef.current)
    return 1000 / budget.fps
  }, () => {
    lastFrameTimeRef.current = 0
    // Restored agents are a baseline, not new spawns/completions to animate.
    const current = simulationRef.current
    prevAgentStatesRef.current = new Map([...current.agents].map(([id, agent]) => [id, agent.state]))
    prevToolStatesRef.current = new Map([...current.toolCalls].map(([id, tool]) => [id, tool.state]))
    effectsRef.current = []
  })

  useEffect(() => { tooltipRef.current = null }, [visible, restoring, tooltipRef])

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ visibility: restoring ? 'hidden' : undefined, cursor: isDragging ? 'grabbing' : 'grab' }}>
      <canvas
        ref={mainCanvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        {...handlers}
        className="w-full h-full"
      />
    </div>
  )
}
