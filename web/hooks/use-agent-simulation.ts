'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Agent,
  ToolCallNode,
  Edge,
  SimulationEvent,
  type TimelineEntry,
} from '@/lib/agent-types'
import { MOCK_SCENARIO } from '@/lib/mock-scenario'
import { TOOL_CARD_W, TOOL_CARD_H, TOOL_SLOT, BUBBLE_VISIBLE_S, MODEL_FAMILY_CONTEXT, DEFAULT_CONTEXT_SIZE, FALLBACK_CONTEXT_SIZE, ANIM_SPEED } from '@/lib/canvas-constants'
import { useVisibleFrameLoop } from './use-visible-frame-loop'
import { hasActiveAgents } from '@/lib/render-budget'
import { animationFrameInterval } from '@/lib/viewer-preferences'
import { historyArchive, type MessageRow } from '@/lib/history-archive'
import { compactHistory } from './simulation/compact-history'
import { stableAgentLayout } from './simulation/stable-layout'

import type { SimulationState, UseAgentSimulationOptions } from './simulation/types'
import { createEmptyState } from './simulation/types'
import { processEvent, type ProcessEventContext } from './simulation/process-event'
import { computeNextFrame } from './simulation/animate'
import { snapVisualState } from './simulation/snap-visual-state'
import { shouldCommitFrame } from './simulation/ui-throttle'

export function useAgentSimulation(options: UseAgentSimulationOptions = {}) {
  const { restoring = false, useMockData = true, externalEvents, onExternalEventsConsumed, sessionFilter, sessionFilterRef: externalFilterRef, disable1MContext = false, animationMode = 'full', animationSpeed = 1, visible = true } = options
  const internalFilterRef = useRef(sessionFilter)
  internalFilterRef.current = sessionFilter
  const sessionFilterRef = externalFilterRef ?? internalFilterRef

  // ─── State management ──────────────────────────────────────────────────────
  // frameRef: source of truth, updated every animation frame (no React render).
  // state: React state for UI components, updated only on structural data changes
  //        (new events, play/pause, seek) — NOT on every animation tick.
  // Canvas reads from frameRef directly for 60fps rendering.
  const [state, setState] = useState<SimulationState>(createEmptyState)
  const frameRef = useRef<SimulationState>(createEmptyState())

  /** Update both frameRef and React state (triggers UI re-render) */
  const commitState = useCallback((next: SimulationState) => {
    frameRef.current = next
    setState(next)
  }, [])

  const lastTimeRef = useRef<number>(0)
  const establishedNodesRef = useRef(new Set<string>())
  const seekGenerationRef = useRef(0)
  const reviewCursorRef = useRef<{ session: string; cursor?: IDBValidKey[]; loading: boolean; done: boolean } | null>(null)
  const savedTasksRef = useRef(new Map<string, string>())
  const archiveBusyRef = useRef<{ generation: number } | null>(null)
  const archiveDirtyRef = useRef(false)
  const blockIdCounter = useRef(0)
  const skipForceSyncRef = useRef(false)
  const animateRef = useRef<(timestamp: number) => void>(() => {})
  /** Throttle React UI updates to ~4/sec — canvas stays smooth via frameRef */
  const lastUIUpdateRef = useRef(0)
  const lastUITimeRef = useRef(0)
  const historyUIChangedRef = useRef(false)

  // ─── Stable incremental layout ─────────────────────────────────────────────────
  // Place only new agents; existing positions and manual drags remain anchored.
  const syncForceSimulation = useCallback((_agents: Map<string, Agent>, _edges: Edge[]) => {
    const current = frameRef.current
    const agents = stableAgentLayout(current.agents, establishedNodesRef.current)
    establishedNodesRef.current = new Set(agents.keys())
    frameRef.current = { ...current, agents }
  }, [])

  const findToolSlot = useCallback((
    agent: Agent, agents: Map<string, Agent>,
    toolCalls: Map<string, ToolCallNode>, currentTime: number,
  ): { x: number; y: number } => {
    const visibleBubbles = agent.messageBubbles.filter(b => currentTime - b.time <= BUBBLE_VISIBLE_S)
    const bubbleRect = visibleBubbles.length > 0 ? {
      x1: agent.x + 30, y1: agent.y - 30,
      x2: agent.x + 300, y2: agent.y - 20 + visibleBubbles.length * 60 + 20,
    } : null

    const overlaps = (cx: number, cy: number) => {
      if (bubbleRect && cx + TOOL_CARD_W / 2 > bubbleRect.x1 && cx - TOOL_CARD_W / 2 < bubbleRect.x2
        && cy + TOOL_CARD_H / 2 > bubbleRect.y1 && cy - TOOL_CARD_H / 2 < bubbleRect.y2) return true
      for (const tc of toolCalls.values()) {
        if (Math.abs(cx - tc.x) < TOOL_CARD_W && Math.abs(cy - tc.y) < TOOL_CARD_H) return true
      }
      return false
    }

    let outAngle = -Math.PI / 2
    if (agent.parentId) {
      const parent = agents.get(agent.parentId)
      if (parent) {
        outAngle = Math.atan2(agent.y - parent.y, agent.x - parent.x)
      }
    }

    for (let ring = 1; ring <= TOOL_SLOT.maxRings; ring++) {
      const dist = TOOL_SLOT.baseDistance + ring * TOOL_SLOT.ringIncrement
      const steps = TOOL_SLOT.baseSteps + ring * TOOL_SLOT.stepsPerRing
      for (let i = 0; i < steps; i++) {
        const sweep = (i / (steps - 1) - 0.5) * Math.PI
        const angle = outAngle + sweep
        const cx = agent.x + Math.cos(angle) * dist
        const cy = agent.y + Math.sin(angle) * dist
        if (!overlaps(cx, cy)) return { x: cx, y: cy }
      }
    }
    return { x: agent.x + Math.cos(outAngle) * TOOL_SLOT.fallbackDistance, y: agent.y + Math.sin(outAngle) * TOOL_SLOT.fallbackDistance }
  }, [])

  const getContextWindowSize = useCallback((modelId?: string): number => {
    if (!modelId) return disable1MContext ? DEFAULT_CONTEXT_SIZE : FALLBACK_CONTEXT_SIZE
    const id = modelId.toLowerCase()
    for (const { pattern, size } of MODEL_FAMILY_CONTEXT) {
      if (pattern.test(id)) return disable1MContext ? Math.min(size, DEFAULT_CONTEXT_SIZE) : size
    }
    return DEFAULT_CONTEXT_SIZE
  }, [disable1MContext])

  const processEventWithContext = useCallback((event: SimulationEvent, prev: SimulationState): SimulationState => {
    const ctx: ProcessEventContext = {
      syncForceSimulation,
      findToolSlot,
      getContextWindowSize,
      blockIdCounter,
      skipForceSync: skipForceSyncRef.current || !!event.historical,
    }
    return processEvent(event, prev, ctx)
  }, [syncForceSimulation, findToolSlot, getContextWindowSize])

  // ─── Animation loop ──────────────────────────────────────────────────────
  // Reads/writes frameRef directly. Only calls commitState when new events
  // are processed, so React only re-renders UI on structural data changes.
  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp
    const deltaTime = Math.min((timestamp - lastTimeRef.current) / 1000, ANIM_SPEED.maxDeltaTime)
    lastTimeRef.current = timestamp

    const prev = frameRef.current
    if (!prev.isPlaying) {
      return
    }

    // Snapshot and consume external events OUTSIDE the main processing
    // to avoid React strict mode double-invocation clearing them
    let capturedEvents: SimulationEvent[] | null = null
    if (externalEvents && externalEvents.length > 0 && !useMockData && !reviewCursorRef.current) {
      capturedEvents = externalEvents.slice(0, 64)
    }

    let newTime = prev.currentTime + deltaTime * prev.speed
    let maxT = Math.max(prev.maxTimeReached, newTime)
    let newEventIndex = prev.eventIndex

    // Process events — thread state through each event
    let currentState = prev
    const newEvents: SimulationEvent[] = []

    if (useMockData) {
      while (newEventIndex < MOCK_SCENARIO.length && MOCK_SCENARIO[newEventIndex].time <= newTime) {
        const evt = MOCK_SCENARIO[newEventIndex]
        currentState = processEventWithContext(evt, currentState)
        newEvents.push(evt)
        newEventIndex++
      }
    } else {
      while (newEventIndex < currentState.eventLog.length && currentState.eventLog[newEventIndex].time <= newTime) {
        const evt = currentState.eventLog[newEventIndex]
        currentState = processEventWithContext({ ...evt, historical: false }, currentState)
        newEventIndex++
      }
    }

    // Process captured external events (snapshotted outside the main
    // processing to avoid React strict mode double-invocation issues)
    if (capturedEvents) {
      // Live events are appended at the tail and eventIndex snapped to the end
      // below; if part of the log had not been replayed yet (review playback,
      // restored snapshot) those events would be skipped forever. Apply them first.
      if (!useMockData) {
        while (newEventIndex < currentState.eventLog.length) {
          const evt = currentState.eventLog[newEventIndex]
          currentState = { ...processEventWithContext(evt, { ...currentState, currentTime: evt.time }), currentTime: evt.time }
          newEventIndex++
        }
        newTime = Math.max(newTime, currentState.currentTime)
      }
      const processingStarted = performance.now()
      let consumed = 0
      for (const event of capturedEvents) {
        if (consumed && performance.now() - processingStarted >= 8) break
        consumed++
        if (event.sequence && event.sequence <= prev.receivedEventCount) continue
        const activeFilter = sessionFilterRef.current
        if (activeFilter && event.sessionId && event.sessionId !== activeFilter) {
          continue
        }
        const eventTime = event.historical ? event.time : Math.max(event.time ?? newTime, newTime)
        const timedEvent = { ...event, time: eventTime }
        currentState = { ...currentState, currentTime: eventTime }
        currentState = processEventWithContext(timedEvent, currentState)
        newEvents.push(timedEvent)
      }
      onExternalEventsConsumed?.(consumed)
      // Sync simulation clock to latest event so active state renders correctly
      newTime = Math.max(newTime, currentState.currentTime)
      maxT = Math.max(maxT, newTime)
    }

    // Append new events to log
    if (newEvents.length > 0) {
      let newLog = currentState.eventLog.concat(newEvents)
      // In mock mode, eventIndex tracks position in MOCK_SCENARIO (not the log).
      // In live mode, eventIndex tracks position in the event log.
      if (!useMockData) {
        newEventIndex = newLog.length
      }
      currentState = { ...currentState, eventLog: newLog }
    }

    currentState = { ...currentState, eventIndex: newEventIndex }

    let result = computeNextFrame(prev, deltaTime, newTime, maxT, currentState, {
      useMockData,
      mockScenarioLength: MOCK_SCENARIO.length,
      mockScenarioEndTime: MOCK_SCENARIO.length > 0 ? MOCK_SCENARIO[MOCK_SCENARIO.length - 1].time : 0,
      animationMode, animationSpeed,
    })

    const archiveSession = sessionFilterRef.current
    if (newEvents.length) archiveDirtyRef.current = true
    if (!useMockData && archiveSession && archiveDirtyRef.current && !reviewCursorRef.current && !historyArchive.error
      && archiveBusyRef.current?.generation !== seekGenerationRef.current) {
      const archiveJob = { generation: seekGenerationRef.current }
      archiveBusyRef.current = archiveJob
      archiveDirtyRef.current = false
      const messages: MessageRow[] = [...result.conversations].flatMap(([agentId, messages]) => messages.filter(message => !message.archived && message.sourceSequence !== undefined && message.sourceSequence <= result.receivedEventCount).map(message => ({ ...message, agentId,
        agentName: result.agents.get(agentId)?.name ?? result.timelineEntries.get(agentId)?.agentName ?? agentId })))
      const tasks = [...result.delegations.values()].filter(task => {
        const signature = `${task.stage}:${task.endTime}:${task.model}`
        const changed = !task.archived || savedTasksRef.current.get(task.id) !== signature
        savedTasksRef.current.set(task.id, signature)
        return changed
      })
      for (const id of savedTasksRef.current.keys()) if (!result.delegations.has(id)) savedTasksRef.current.delete(id)
      const tools = [...result.toolCalls.values()].filter(tool => !tool.archived)
      const archiveGeneration = seekGenerationRef.current
      const through = result.receivedEventCount
      void Promise.all([...messages.map(message => historyArchive.saveMessage(archiveSession, message)),
        ...tasks.map(task => historyArchive.saveTask(archiveSession, task)), ...tools.map(tool => historyArchive.saveTool(archiveSession, tool)), historyArchive.settle()]).then(() => {
        if (archiveGeneration !== seekGenerationRef.current || historyArchive.error || sessionFilterRef.current !== archiveSession || reviewCursorRef.current || !frameRef.current.isPlaying) return
        const compacted = compactHistory(frameRef.current, result, through)
        frameRef.current = compacted
        historyUIChangedRef.current = true
      }).catch(error => { historyArchive.error = String(error) }).finally(() => { if (archiveBusyRef.current === archiveJob) archiveBusyRef.current = null })
    }
    const review = reviewCursorRef.current
    if (review && result.eventIndex > 500) result = compactHistory(result, result, result.receivedEventCount)
    if (review && !review.loading && !review.done && result.eventLog.length - result.eventIndex < 250) {
      review.loading = true
      void historyArchive.page<SimulationEvent>('events', review.session, { cursor: review.cursor, forward: true, limit: 500 }).then(page => {
        if (reviewCursorRef.current !== review) return
        review.cursor = page.cursor; review.done = !page.more; review.loading = false
        frameRef.current = { ...frameRef.current, eventLog: frameRef.current.eventLog.concat(page.items) }
      }).catch(error => { review.loading = false; review.done = true; historyArchive.error = String(error) })
    }

    // Place new nodes once per batch, including quiet historical restoration.
    if (newEvents.length) {
      const agents = stableAgentLayout(result.agents, establishedNodesRef.current)
      establishedNodesRef.current = new Set(agents.keys())
      result = { ...result, agents }
    }
    // Write to frameRef (canvas reads this every frame)
    frameRef.current = result

    // Node positions are updated only when new agents arrive or the user drags.


    // Throttle React re-renders — UI updates at most ~4/sec, canvas stays smooth via frameRef
    if (shouldCommitFrame({
      now: timestamp,
      lastCommitAt: lastUIUpdateRef.current,
      processedEvents: newEvents.length > 0 || historyUIChangedRef.current,
      currentTime: result.currentTime,
      lastCommittedTime: lastUITimeRef.current,
    })) {
      setState(frameRef.current)
      historyUIChangedRef.current = false
      lastUIUpdateRef.current = timestamp
      lastUITimeRef.current = result.currentTime
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionFilter intentionally omitted; we read sessionFilterRef.current
  }, [processEventWithContext, useMockData, externalEvents, onExternalEventsConsumed, animationMode, animationSpeed])

  animateRef.current = animate

  useVisibleFrameLoop(animateRef, state.isPlaying && visible, () => {
    const current = frameRef.current
    if (restoring) return 0
    const quiet = !useMockData && !externalEvents?.length && !reviewCursorRef.current && !current.particles.length && !current.discoveries.length && !current.toolCalls.size && !hasActiveAgents(current.agents.values())
    return quiet ? 250 : animationFrameInterval(animationMode)
  }, () => { lastTimeRef.current = 0 })

  // ─── Playback controls ───────────────────────────────────────────────────
  const play = useCallback(() => {
    const next = { ...frameRef.current, isPlaying: true }
    commitState(next)
  }, [commitState])

  const pause = useCallback(() => {
    const next = { ...frameRef.current, isPlaying: false }
    commitState(next)
  }, [commitState])

  const setSpeed = useCallback((speed: number) => {
    frameRef.current = { ...frameRef.current, speed }
    setState(prev => ({ ...prev, speed }))
  }, [])

  const restart = useCallback((keepActive = false) => {
    blockIdCounter.current = 0
    seekGenerationRef.current++; reviewCursorRef.current = null; savedTasksRef.current.clear()
    if (!keepActive) {
      establishedNodesRef.current.clear()
      commitState(createEmptyState({ isPlaying: true, speed: frameRef.current.speed }))
      return
    }
    // Keep active agents but clear completed state and visual history
    const prev = frameRef.current
    const agents = new Map<string, Agent>()
    for (const [id, agent] of prev.agents) {
      if (agent.state !== 'complete') {
        agents.set(id, { ...agent, toolCalls: 0, messageBubbles: [], timeAlive: 0 })
      }
    }

    const edges = prev.edges.filter(e =>
      e.type === 'parent-child' && agents.has(e.from) && agents.has(e.to)
    )

    const timelineEntries = new Map<string, TimelineEntry>()
    for (const [id, entry] of prev.timelineEntries) {
      if (agents.has(id)) {
        timelineEntries.set(id, { ...entry, blocks: [] })
      }
    }

    const conversations: SimulationState['conversations'] = new Map()
    for (const id of agents.keys()) conversations.set(id, [])

    const eventLog = prev.eventLog.filter(e =>
      e.type === 'agent_spawn' && agents.has(e.payload?.name as string)
    )

    const next = {
      ...createEmptyState({ isPlaying: true, speed: prev.speed }),
      agents, edges, timelineEntries, conversations,
      eventLog, eventIndex: eventLog.length,
    }
    commitState(next)
    setTimeout(() => syncForceSimulation(next.agents, next.edges), 0)
  }, [syncForceSimulation, commitState])

  const updateAgentPosition = useCallback((agentId: string, x: number, y: number) => {
    // Drag updates — write to frameRef only (canvas reads it, no React render)
    const prev = frameRef.current
    const newAgents = new Map(prev.agents)
    const agent = newAgents.get(agentId)
    if (agent) newAgents.set(agentId, { ...agent, x, y, pinned: true })
    frameRef.current = { ...prev, agents: newAgents }


  }, [])

  /** Seek to a specific time — replays events from scratch up to targetTime */
  const seekToTime = useCallback(async (targetTime: number, live = false) => {
    const prev = frameRef.current
    const generation = ++seekGenerationRef.current
    reviewCursorRef.current = null
    const session = sessionFilterRef.current
    let replayState = createEmptyState({ receivedEventCount: prev.receivedEventCount, speed: prev.speed, maxTimeReached: prev.maxTimeReached })
    skipForceSyncRef.current = true
    blockIdCounter.current = 0
    try {
      if (useMockData || !session) {
        for (const event of MOCK_SCENARIO) { if (event.time > targetTime) break; replayState = processEventWithContext(event, { ...replayState, currentTime: event.time }) }
      } else {
        await historyArchive.settle()
        let cursor: IDBValidKey[] | undefined
        while (generation === seekGenerationRef.current) {
          const page = await historyArchive.page<SimulationEvent>('events', session, { cursor, forward: true, limit: 500 })
          if (generation !== seekGenerationRef.current) return
          const future: SimulationEvent[] = []
          for (const event of page.items) {
            if (event.time > targetTime) future.push(event)
            else replayState = processEventWithContext({ ...event, historical: true }, { ...replayState, currentTime: event.time })
          }
          cursor = page.cursor
          // Bound the temporary seek state as well. Full messages remain in the disk archive.
          replayState = compactHistory(replayState, replayState, replayState.receivedEventCount)
          if (future.length || !page.more) {
            if (!live) { replayState.eventLog = future; replayState.eventIndex = 0; reviewCursorRef.current = { session, cursor, loading: false, done: !page.more } }
            break
          }
        }
      }
      if (generation !== seekGenerationRef.current) return
      const effectiveTime = Number.isFinite(targetTime) ? targetTime : Math.max(prev.maxTimeReached, replayState.currentTime)
      replayState = snapVisualState(replayState, effectiveTime)
      commitState({ ...replayState, currentTime: effectiveTime, maxTimeReached: Math.max(prev.maxTimeReached, effectiveTime), isPlaying: live })
      syncForceSimulation(replayState.agents, replayState.edges)
    } catch (error) { historyArchive.error = String(error) } finally { if (generation === seekGenerationRef.current) skipForceSyncRef.current = false }
  }, [processEventWithContext, useMockData, syncForceSimulation, commitState])

  // ─── Session state save/restore ──────────────────────────────────────────
  const saveSnapshot = useCallback((): { simState: SimulationState; blockId: number } => ({
    simState: frameRef.current,
    blockId: blockIdCounter.current,
  }), [])

  const restoreSnapshot = useCallback((snapshot: { simState: SimulationState; blockId: number }) => {
    blockIdCounter.current = snapshot.blockId
    let st = snapshot.simState
    // A snapshot taken while paused/scrubbed still has un-replayed log entries.
    // Restoring it with isPlaying=true would play them back at 1x under a LIVE
    // badge; fast-forward to the end of the log so the tab comes back live.
    if (!useMockData && st.eventIndex < st.eventLog.length) {
      skipForceSyncRef.current = true
      for (const evt of st.eventLog.slice(st.eventIndex)) {
        st = { ...processEventWithContext(evt, { ...st, currentTime: evt.time }), currentTime: evt.time }
      }
      skipForceSyncRef.current = false
      const t = Math.max(st.currentTime, st.maxTimeReached)
      st = { ...snapVisualState(st, t), currentTime: t, eventIndex: st.eventLog.length }
    }
    commitState({ ...st, isPlaying: true })
    setTimeout(() => syncForceSimulation(st.agents, st.edges), 0)
  }, [syncForceSimulation, commitState, useMockData, processEventWithContext])

  return {
    // Canvas reads frameRef directly for 60fps rendering
    frameRef,
    // UI components use React state (updated only on events/user actions)
    round: state.round, roundStart: state.roundStart, delegations: state.delegations,
    agents: state.agents, toolCalls: state.toolCalls,
    particles: state.particles, edges: state.edges,
    discoveries: state.discoveries,
    fileAttention: state.fileAttention,
    timelineEntries: state.timelineEntries,
    currentTime: state.currentTime, isPlaying: state.isPlaying, speed: state.speed,
    maxTimeReached: state.maxTimeReached,
    conversations: state.conversations,
    play, pause, restart, setSpeed, seekToTime,
    updateAgentPosition,
    saveSnapshot, restoreSnapshot,
  }
}
