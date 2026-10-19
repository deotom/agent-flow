'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { vscodeBridge, type ConnectionStatus, type AgentEvent, type SessionInfo } from '@/lib/vscode-bridge'
import { historyArchive, estimateBytes, type HistoryPage } from '@/lib/history-archive'
import { SimulationEvent } from '@/lib/agent-types'
import { shouldAutoSelectSession, type AnimationMode } from '@/lib/viewer-preferences'

interface BridgeHookResult {
  latestOnly: boolean
  loadFullHistory: () => void
  restoring: boolean
  viewVisible: boolean
  historyRevision: number
  setReviewing: (value: boolean) => void
  storageError: string | null
  sessionLocked: boolean
  toggleSessionLock: () => void
  animationMode: AnimationMode
  animationSpeed: number
  setAnimation: (mode: AnimationMode, speed: number) => void
  patchVersion: string
  extensionVersion: string
  connectionSource: string
  lastLiveEventAt: number | null
  historyProgress: { loaded: number; total: number }
  reloadView: () => void
  refreshStatus: () => void
  compact: boolean
  openGraph: () => void
  isVSCode: boolean
  connectionStatus: ConnectionStatus
  /** Events received from VS Code extension, converted to SimulationEvent format */
  pendingEvents: readonly SimulationEvent[]
  /** Call after consuming events to clear the queue */
  consumeEvents: (count?: number) => void
  /** Whether to show mock data (standalone mode or explicit config) */
  useMockData: boolean
  /** Whether CLAUDE_CODE_DISABLE_1M_CONTEXT=1 is set — caps context window to 200k */
  disable1MContext: boolean
  /** Open a file in the VS Code editor */
  bridgeOpenFile: (filePath: string, line?: number) => void
  /** Known sessions from the extension */
  sessions: SessionInfo[]
  /** Currently selected session ID */
  selectedSessionId: string | null
  /** Select a session to view (does not flush events — call flushSessionEvents after state swap). */
  selectSession: (sessionId: string | null) => void
  /** Flush buffered events for a session into pending. Call from useLayoutEffect after state swap. */
  flushSessionEvents: (sessionId: string, fromIndex?: number) => void
  /** Get the current event count for a session (for save/restore) */
  getSessionEventCount: (sessionId: string) => number
  /** Ref to the currently selected session ID — updated synchronously, not via React state */
  selectedSessionIdRef: React.RefObject<string | null>
  /** Session IDs that have received events while not selected */
  sessionsWithActivity: Set<string>
  /** Remove a session from the list */
  removeSession: (sessionId: string) => void
}

/**
 * Connects the VS Code bridge to the React app.
 * When running standalone, returns useMockData=true and no events.
 * When inside VS Code, receives events and forwards control commands.
 *
 * Supports multi-session: events are buffered per-session so switching
 * sessions replays the correct event history.
 */
export function useVSCodeBridge(): BridgeHookResult {
  const [latestOnlySessions, setLatestOnlySessions] = useState<string[]>([])
  const [restoring, setRestoring] = useState(false)
  const deliveryPendingRef = useRef(false)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [storageError, setStorageError] = useState<string | null>(null)
  const reviewingRef = useRef(false)
  const setReviewing = useCallback((value: boolean) => { reviewingRef.current = value }, [])
  const reloadRequiredRef = useRef(false)
  const sequenceRef = useRef(new Map<string, number>())
  const persistedRef = useRef(new Map<string, number>())
  const eventBytesRef = useRef(new WeakMap<SimulationEvent, number>())
  const pruneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushGenerationRef = useRef(0)
  const [viewVisible, setViewVisible] = useState(true)
  const viewVisibleRef = useRef(true)
  const [sessionLocked, setSessionLocked] = useState(() => { try { return localStorage.getItem('agent-flow-session-locked') === 'true' } catch { return false } })
  const lockedRef = useRef(sessionLocked)
  const lockedSessionRef = useRef<string | null>(null)
  useEffect(() => { try { lockedSessionRef.current = localStorage.getItem('agent-flow-locked-session') } catch { /* storage unavailable */ } }, [])
  const [animationMode, setAnimationMode] = useState<AnimationMode>('full')
  const [animationSpeed, setAnimationSpeed] = useState(1)
  const [patchVersion, setPatchVersion] = useState('Unknown — reload extension')
  const [extensionVersion, setExtensionVersion] = useState('Unknown')
  const [connectionSource, setConnectionSource] = useState('')
  const [lastLiveBySession, setLastLiveBySession] = useState<Record<string, number>>({})
  const [historyProgress, setHistoryProgress] = useState({ loaded: 0, total: 0 })
  const lastLiveRef = useRef(new Map<string, number>())
  const [compact, setCompact] = useState(false)
  const [isVSCode, setIsVSCode] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [useMockData, setUseMockData] = useState(
    process.env.NEXT_PUBLIC_DEMO !== '0'
  )
  const [disable1MContext, setDisable1MContext] = useState(false)
  const pendingEventsRef = useRef<SimulationEvent[]>([])
  const [, setEventVersion] = useState(0) // trigger re-render on new events

  // Session state
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const selectedSessionIdRef = useRef<string | null>(null)
  const sessionEventsRef = useRef<Map<string, SimulationEvent[]>>(new Map())
  /** True while a session switch is pending (between auto-select and useLayoutEffect).
   *  Prevents the animation frame from processing events in the wrong simulation context. */
  const sessionSwitchPendingRef = useRef(false)
  const [sessionsWithActivity, setSessionsWithActivity] = useState<Set<string>>(new Set())

  const pendingBatchRef = useRef<{ id: number; persisted: boolean; session: string | null; through: number } | null>(null)
  const acknowledgeBatch = useCallback(() => {
    const batch = pendingBatchRef.current
    if (!batch?.persisted || sessionSwitchPendingRef.current) return
    if (batch.session === selectedSessionIdRef.current && pendingEventsRef.current.some(event => event.sessionId === batch.session && (event.sequence ?? 0) <= batch.through)) return
    pendingBatchRef.current = null
    vscodeBridge?.acknowledgeBatch(batch.id)
  }, [])
  const finishRestoration = useCallback(() => {
    acknowledgeBatch()
    if (!deliveryPendingRef.current && !sessionSwitchPendingRef.current && pendingEventsRef.current.length === 0) setRestoring(false)
  }, [acknowledgeBatch])

  const pruneMemory = useCallback(() => {
    if (pruneTimerRef.current) return
    pruneTimerRef.current = setTimeout(() => {
      pruneTimerRef.current = null
      if (historyArchive.error) return
      const bytes = (event: SimulationEvent) => eventBytesRef.current.get(event) ?? 0
      const entries = [...sessionEventsRef.current].sort(([a], [b]) => Number(a === selectedSessionIdRef.current) - Number(b === selectedSessionIdRef.current))
      let total = entries.reduce((sum, [, events]) => sum + events.reduce((n, event) => n + bytes(event), 0), 0)
      for (const [id, events] of entries) {
        let start = 0, sessionBytes = events.reduce((sum, event) => sum + bytes(event), 0)
        while (start < events.length && (events[start].sequence ?? 0) <= (persistedRef.current.get(id) ?? 0)
          && (events.length - start > 400 || sessionBytes > 2 * 1024 * 1024 || total > 8 * 1024 * 1024)) {
          const size = bytes(events[start++]); total -= size; sessionBytes -= size
        }
        if (start) sessionEventsRef.current.set(id, events.slice(start))
      }
      const pending = pendingEventsRef.current
      if ((!viewVisibleRef.current || document.hidden) && (pending.length > 500 || pending.reduce((sum, event) => sum + bytes(event), 0) > 4 * 1024 * 1024)
        && pending.every(event => (event.sequence ?? 0) <= (persistedRef.current.get(event.sessionId ?? '') ?? 0))) {
        pending.length = 0
        reloadRequiredRef.current = true
      }
    }, 0)
  }, [])
  useEffect(() => {
    const resume = () => { if (!document.hidden && viewVisibleRef.current && reloadRequiredRef.current) { reloadRequiredRef.current = false; setHistoryRevision(value => value + 1) } }
    document.addEventListener('visibilitychange', resume)
    return () => { document.removeEventListener('visibilitychange', resume); if (pruneTimerRef.current) clearTimeout(pruneTimerRef.current) }
  }, [])

  // Connect to standalone dev relay server via SSE when not in VS Code
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bridge = vscodeBridge
    if (!bridge) return

    // Skip in VS Code — extension handles events via postMessage
    if (bridge.isVSCode) return

    // Connect to relay in dev mode or standalone CLI mode
    const isStandalone = process.env.AGENT_FLOW_STANDALONE === '1'
    if (!isStandalone && (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_DEMO !== '0')) return

    const relayPort = process.env.NEXT_PUBLIC_RELAY_PORT || ''
    const es = new EventSource(relayPort ? `http://127.0.0.1:${relayPort}/events` : '/events')

    es.onopen = () => {
      setConnectionStatus('connected')
      setUseMockData(false)
    }
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        window.postMessage(data, '*')
      } catch {}
    }
    es.onerror = () => {
      setConnectionStatus('disconnected')
    }

    return () => {
      es.close()
    }
  }, [])

  useEffect(() => {
    const bridge = vscodeBridge
    if (!bridge) { return }

    // Listen for bridge initialization (event-driven, no polling)
    const unsubInit = bridge.onInit(() => {
      setIsVSCode(true)
      setUseMockData(false)
    })

    // Listen for events — buffer by session, deliver to pending if session matches.
    // selectedSessionIdRef is updated synchronously (not via React state) so it's
    // always current even before React re-renders.
    const unsubEvent = bridge.onEvent((event: AgentEvent) => {
      if (!event.historical && event.sessionId && Date.now() - (lastLiveRef.current.get(event.sessionId) ?? 0) > 1000) {
        const time = Date.now()
        lastLiveRef.current.set(event.sessionId, time)
        setLastLiveBySession(previous => ({ ...previous, [event.sessionId!]: time }))
      }
      if (event.historical && event.sessionId === selectedSessionIdRef.current) setRestoring(true)
      const simEvent: SimulationEvent = {
        time: event.time,
        type: event.type as SimulationEvent['type'],
        payload: event.payload,
        sessionId: event.sessionId,
        historical: event.historical || !viewVisibleRef.current || document.hidden,
      }

      // Always buffer by session (for replay on session switch)
      if (event.sessionId) {
        const buf = sessionEventsRef.current.get(event.sessionId) || []
        simEvent.sequence = (sequenceRef.current.get(event.sessionId) ?? 0) + 1
        sequenceRef.current.set(event.sessionId, simEvent.sequence)
        eventBytesRef.current.set(simEvent, estimateBytes(simEvent))
        void historyArchive.saveEvent(event.sessionId, simEvent).then(() => {
          persistedRef.current.set(event.sessionId!, Math.max(persistedRef.current.get(event.sessionId!) ?? 0, simEvent.sequence!))
          pruneMemory()
        }).catch(error => setStorageError(String(error)))
        buf.push(simEvent)
        sessionEventsRef.current.set(event.sessionId, buf)
        // Keep lastActivityTime roughly current (throttled: one state update per 5s per session)
        const now = Date.now()
        if (!event.historical) setSessions(prev => {
          const s = prev.find(x => x.id === event.sessionId)
          if (!s || now - s.lastActivityTime < 5000) return prev
          return prev.map(x => x.id === event.sessionId ? { ...x, lastActivityTime: now } : x)
        })
      }

      // Deliver to pending if session matches (ref is always current).
      // Skip if a session switch is pending — useLayoutEffect will flush
      // from the session buffer once the simulation state is swapped.
      const selected = selectedSessionIdRef.current
      if (selected && event.sessionId === selected && !sessionSwitchPendingRef.current && !reviewingRef.current) {
        pendingEventsRef.current.push(simEvent)
        if (viewVisibleRef.current && !document.hidden) setEventVersion(v => v + 1)
      } else if (!event.historical && event.sessionId && event.sessionId !== selected) {
        // Track background activity for unselected sessions
        setSessionsWithActivity(prev => {
          if (prev.has(event.sessionId!)) return prev
          const next = new Set(prev)
          next.add(event.sessionId!)
          return next
        })
      }

      // Re-add dismissed sessions when new events arrive
      if (!event.historical && event.sessionId && dismissedSessionsRef.current.has(event.sessionId)) {
        const saved = dismissedSessionsRef.current.get(event.sessionId)
        dismissedSessionsRef.current.delete(event.sessionId)
        if (saved) {
          setSessions(prev => {
            if (prev.find(s => s.id === saved.id)) return prev
            return [...prev, { ...saved, status: 'active' as const, lastActivityTime: Date.now() }]
          })
          if (!selectedSessionIdRef.current) {
            sessionSwitchPendingRef.current = true
            selectedSessionIdRef.current = saved.id
            setSelectedSessionId(saved.id)
          }
        }
      }
    })

    const unsubStatus = bridge.onStatus((status, source) => {
      setConnectionStatus(status)
      setConnectionSource(source)
    })

    const unsubConfig = bridge.onConfig((config) => {
      if (config.latestOnlySessions) setLatestOnlySessions(config.latestOnlySessions)
      if (config.visible !== undefined) {
        viewVisibleRef.current = config.visible; setViewVisible(config.visible)
        if (config.visible && reloadRequiredRef.current) { reloadRequiredRef.current = false; setHistoryRevision(value => value + 1) }
      }
      if (config.animationMode) setAnimationMode(config.animationMode)
      if (config.animationSpeed !== undefined) setAnimationSpeed(config.animationSpeed)
      if (config.patchVersion) setPatchVersion(config.patchVersion)
      if (config.extensionVersion) setExtensionVersion(config.extensionVersion)
      if (config.selectedSessionId && config.selectedSessionId !== selectedSessionIdRef.current) {
        sessionSwitchPendingRef.current = true
        pendingEventsRef.current.length = 0
        selectedSessionIdRef.current = config.selectedSessionId
        setSelectedSessionId(config.selectedSessionId)
      }
      if (config.compact !== undefined) setCompact(config.compact)
      if (config.showMockData !== undefined) { setUseMockData(config.showMockData) }
      if (config.disable1MContext !== undefined) { setDisable1MContext(config.disable1MContext) }
    })

    // Session lifecycle tracking
    // Note: these handlers only update session list + selection state.
    // Event flushing is handled by the consumer (index.tsx effect) to avoid
    // races between auto-flush here and save/restore logic there.
    const unsubSession = bridge.onSession((type, data) => {
      if (type === 'reset') {
        pendingBatchRef.current = null
        deliveryPendingRef.current = false; setRestoring(false)
        setLastLiveBySession({})
        lastLiveRef.current.clear()
        setHistoryProgress({ loaded: 0, total: 0 })
        // Panel was reopened — clear all stale state
        setSessions([])
        setSelectedSessionId(null)
        selectedSessionIdRef.current = null
        pendingEventsRef.current.length = 0
        sessionEventsRef.current.clear()
        sequenceRef.current.clear(); persistedRef.current.clear(); flushGenerationRef.current++
        setSessionsWithActivity(new Set())
        dismissedSessionsRef.current.clear()
        if (viewVisibleRef.current && !document.hidden) setEventVersion(v => v + 1)
        return
      }
      if (type === 'list') {
        const sessionList = data as SessionInfo[]
        setSessions(sessionList)
        // Auto-select: prefer active sessions, then most recently active.
        // Only set selection — useLayoutEffect handles flushing events.
        if (!selectedSessionIdRef.current && sessionList.length > 0) {
          const sorted = [...sessionList].sort((a, b) => {
            const aActive = a.status === 'active' ? 1 : 0
            const bActive = b.status === 'active' ? 1 : 0
            if (aActive !== bActive) return bActive - aActive
            return b.lastActivityTime - a.lastActivityTime
          })
          const saved = lockedRef.current && sessionList.some(session => session.id === lockedSessionRef.current) ? lockedSessionRef.current : null
          const autoId = saved ?? sorted[0].id
          sessionSwitchPendingRef.current = true
          pendingEventsRef.current.length = 0
          selectedSessionIdRef.current = autoId
          setSelectedSessionId(autoId)
        }
      } else if (type === 'started') {
        const session = data as SessionInfo
        // Resume after inactivity re-sends 'started' for a session we may already
        // be showing. Re-arming the switch for the same id would set
        // sessionSwitchPendingRef without anything ever clearing it (the layout
        // effect only runs when the selection changes), freezing event delivery.
        const alreadySelected = session.id === selectedSessionIdRef.current
        setSessions(prev => {
          const existing = prev.find(s => s.id === session.id)
          if (existing) {
            // Session resumed after inactivity — mark active again
            return prev.map(s => s.id === session.id
              ? { ...s, status: 'active' as const, lastActivityTime: Date.now() }
              : s)
          }
          return [...prev, session]
        })
        if (alreadySelected || !shouldAutoSelectSession(lockedRef.current, selectedSessionIdRef.current)) return
        // Auto-select newly started session.
        // Set switch-pending flag to prevent the animation frame from processing
        // events in the wrong simulation state before useLayoutEffect swaps it.
        sessionSwitchPendingRef.current = true
        pendingEventsRef.current.length = 0
        selectedSessionIdRef.current = session.id
        setSelectedSessionId(session.id)
      } else if (type === 'updated') {
        const { sessionId, label } = data as { sessionId: string; label: string }
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, label } : s
        ))
      } else if (type === 'ended') {
        const sessionId = data as string
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, status: 'completed' as const } : s
        ))
      }
    })

    const unsubBatch = bridge.onBatch(id => {
      const session = selectedSessionIdRef.current
      const batch = { id, persisted: false, session, through: session ? sequenceRef.current.get(session) ?? 0 : 0 }
      pendingBatchRef.current = batch
      void historyArchive.settle().then(() => {
        if (pendingBatchRef.current !== batch) return
        batch.persisted = true
        acknowledgeBatch()
      }).catch(error => setStorageError(String(error)))
    })
    const unsubHistory = bridge.onHistory(progress => {
      setHistoryProgress(progress)
      deliveryPendingRef.current = progress.loaded < progress.total
      if (deliveryPendingRef.current) setRestoring(true)
      else finishRestoration()
    })
    bridge.ready()
    return () => {
      unsubInit()
      unsubEvent()
      unsubStatus()
      unsubConfig()
      unsubSession()
      unsubHistory()
      unsubBatch()
    }
  }, [])

  const consumeEvents = useCallback((count?: number) => {
    // Clear in-place so stale closures in animation callbacks
    // also see the cleared array (prevents multi-frame reprocessing)
    pendingEventsRef.current.splice(0, count ?? pendingEventsRef.current.length)
    finishRestoration()
  }, [finishRestoration])

  /** Switch session selection. Does NOT flush events — call flushSessionEvents
   *  from useLayoutEffect after the simulation state has been saved/swapped. */
  const selectSession = useCallback((sessionId: string | null) => {
    if (sessionId === selectedSessionIdRef.current) return
    // Block event delivery to pending until the simulation state is swapped
    sessionSwitchPendingRef.current = true
    pendingEventsRef.current.length = 0
    selectedSessionIdRef.current = sessionId
    if (lockedRef.current && sessionId) {
      lockedSessionRef.current = sessionId
      try { localStorage.setItem('agent-flow-locked-session', sessionId) } catch { /* storage unavailable */ }
    }
    setSelectedSessionId(sessionId)
    if (sessionId) {
      setSessionsWithActivity(prev => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    }
  }, [])

  /** Flush buffered events for the selected session into pending.
   *  Must be called from useLayoutEffect AFTER simulation state is saved/swapped. */
  const flushSessionEvents = useCallback((sessionId: string, fromIndex = 0) => {
    const generation = ++flushGenerationRef.current
    setRestoring(true)
    sessionSwitchPendingRef.current = true
    pendingEventsRef.current.length = 0
    void (async () => {
      let through = fromIndex
      try {
        while (selectedSessionIdRef.current === sessionId && generation === flushGenerationRef.current) {
          const target = sequenceRef.current.get(sessionId) ?? 0
          if (through >= target) break
          await historyArchive.settle()
          let cursor: IDBValidKey[] | undefined = [historyArchive.namespace, sessionId, through]
          while (through < target && generation === flushGenerationRef.current) {
            const page: HistoryPage<SimulationEvent> = await historyArchive.page<SimulationEvent>('events', sessionId, { cursor, forward: true, limit: 500 })
            if (generation !== flushGenerationRef.current || selectedSessionIdRef.current !== sessionId) return
            const events = page.items.filter(event => event.sequence! <= target)
            if (!events.length) break
            for (const event of events) pendingEventsRef.current.push({ ...event, historical: true })
            through = events.at(-1)!.sequence!
            cursor = page.cursor
            setEventVersion(value => value + 1)
            while (pendingEventsRef.current.length > 500 && generation === flushGenerationRef.current) await new Promise(resolve => setTimeout(resolve, 16))
            if (!page.more) break
          }
          if (through < target) throw new Error('History reload was incomplete. Reopen Agent Flow to reload the original transcript.')
        }
      } catch (error) {
        setStorageError(String(error))
        for (const event of sessionEventsRef.current.get(sessionId) ?? []) if (event.sequence! > through) pendingEventsRef.current.push({ ...event, historical: true })
      } finally {
        if (generation === flushGenerationRef.current) { sessionSwitchPendingRef.current = false; finishRestoration(); setEventVersion(value => value + 1) }
      }
    })()
  }, [])

  const getSessionEventCount = useCallback((sessionId: string): number => {
    return sequenceRef.current.get(sessionId) ?? 0
  }, [])

  const dismissedSessionsRef = useRef<Map<string, SessionInfo>>(new Map())

  const removeSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const session = prev.find(s => s.id === sessionId)
      if (session) { dismissedSessionsRef.current.set(sessionId, session) }
      return prev.filter(s => s.id !== sessionId)
    })
    setSessionsWithActivity(prev => {
      if (!prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  const bridgeOpenFile = useCallback((filePath: string, line?: number) => {
    vscodeBridge?.openFile(filePath, line)
  }, [])

  return {
    latestOnly: !!selectedSessionId && latestOnlySessions.includes(selectedSessionId),
    loadFullHistory: () => { if (selectedSessionId) vscodeBridge?.loadFullHistory(selectedSessionId) },
    restoring, viewVisible, historyRevision, storageError, setReviewing,
    sessionLocked,
    toggleSessionLock: () => {
      const locked = !lockedRef.current
      lockedRef.current = locked
      setSessionLocked(locked)
      lockedSessionRef.current = locked ? selectedSessionIdRef.current : null
      try {
        localStorage.setItem('agent-flow-session-locked', String(locked))
        if (lockedSessionRef.current) localStorage.setItem('agent-flow-locked-session', lockedSessionRef.current)
        else localStorage.removeItem('agent-flow-locked-session')
      } catch { /* storage unavailable */ }
    },
    animationMode, animationSpeed,
    setAnimation: (mode, speed) => { setAnimationMode(mode); setAnimationSpeed(speed); vscodeBridge?.setAnimation(mode, speed) },
    patchVersion, extensionVersion, connectionSource, lastLiveEventAt: selectedSessionId ? lastLiveBySession[selectedSessionId] ?? null : null, historyProgress,
    reloadView: () => vscodeBridge?.reloadView(),
    refreshStatus: () => vscodeBridge?.requestStatus(),
    compact, openGraph: () => vscodeBridge?.openGraph(selectedSessionIdRef.current ?? undefined),
    isVSCode,
    connectionStatus,
    pendingEvents: pendingEventsRef.current,
    consumeEvents,
    useMockData,
    disable1MContext,
    bridgeOpenFile,
    sessions,
    selectedSessionId,
    selectedSessionIdRef,
    selectSession,
    flushSessionEvents,
    getSessionEventCount,
    sessionsWithActivity,
    removeSession,
  }
}
