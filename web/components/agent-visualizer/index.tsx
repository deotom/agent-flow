"use client"

import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react"
import { useAgentSimulation } from "@/hooks/use-agent-simulation"
import { useVSCodeBridge } from "@/hooks/use-vscode-bridge"
import { useSelectionState } from "@/hooks/use-selection-state"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { AgentCanvas } from "./canvas"
import { ControlBar } from "./control-bar"
import { AgentDetailCard } from "./agent-detail-card"
import { GlassContextMenu } from "./glass-context-menu"
import { ToolDetailPopup } from "./tool-detail-popup"
import { DiscoveryDetailPopup } from "./discovery-detail-popup"
import { FileAttentionPanel } from "./file-attention-panel"
import { TimelinePanel } from "./timeline-panel"
import { AgentChatPanel } from "./chat-panel"
import { SessionTranscriptPanel } from "./session-transcript-panel"
import { OpenFileProvider } from "./tool-content-renderer"
import { stopPropagationHandlers } from "./shared-ui"
import { TIMING } from "@/lib/agent-types"
import { COLORS } from "@/lib/colors"

import { MOCK_DURATION } from "@/lib/mock-scenario"
import { MessageFeedPanel } from "./message-feed-panel"
import { TopBar } from "./top-bar"
import { buildTimelineEvents } from '@/hooks/simulation/timeline-events'
import { formatAgentName } from '@/lib/utils'
import { agentCost } from './canvas/draw-cost'
import { FlowControls } from './flow-controls'
import { WorkPanel } from './work-panel'
import { FlowIcon } from './flow-icon'
import { SessionPicker } from './session-picker'
import { AgentScopeSwitch } from './agent-scope-switch'
import { sessionGraphPresentation } from '@/lib/graph-presentation'
import { useAudioEffects } from "@/hooks/use-audio-effects"

export function AgentVisualizer() {
  const bridge = useVSCodeBridge()
  const [toolbarBottom, setToolbarBottom] = useState(112)
  const [currentRoundOnly, setCurrentRoundOnly] = useState(true)
  const [showAllAgents, setShowAllAgents] = useState(false)
  useEffect(() => setShowAllAgents(false), [bridge.selectedSessionId])

  const {
    frameRef,
    round, delegations,
    agents,
    toolCalls,
    particles,
    edges,
    discoveries,
    fileAttention,
    timelineEntries,
    currentTime,
    isPlaying,
    speed,
    maxTimeReached,
    conversations,
    play,
    pause,
    restart,
    setSpeed,
    seekToTime,
    updateAgentPosition,
  } = useAgentSimulation({
    restoring: bridge.restoring,
    visible: bridge.viewVisible,
    animationMode: bridge.animationMode,
    animationSpeed: bridge.animationSpeed,
    useMockData: bridge.useMockData,
    externalEvents: bridge.pendingEvents,
    onExternalEventsConsumed: bridge.consumeEvents,
    sessionFilter: bridge.selectedSessionId,
    // Pass the ref that's updated synchronously in session-started handler,
    // so the animation frame never uses a stale filter value.
    sessionFilterRef: bridge.selectedSessionIdRef,
    disable1MContext: bridge.disable1MContext,
  })

  const sessionAgents = useMemo(() => showAllAgents ? sessionGraphPresentation(frameRef.current).agents : agents, [agents, timelineEntries, frameRef, showAllAgents])
  const selection = useSelectionState({ agents: showAllAgents ? sessionAgents : agents, toolCalls, discoveries })
  const activeAgentCount = [...agents.values()].filter(agent => agent.isMain || agent.state !== 'complete').length
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0)
  const scopeControl = <AgentScopeSwitch showAll={showAllAgents} activeCount={activeAgentCount} totalCount={Math.max(timelineEntries.size, agents.size)}
    onChange={all => { setShowAllAgents(all); selection.clearAgent(); setZoomToFitTrigger(value => value + 1) }} />

  const [showStats, setShowStats] = useState(false)
  const [showHexGrid, setShowHexGrid] = useState(true)
  const [showCostOverlay, setShowCostOverlay] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showFileAttention, setShowFileAttention] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  // Mutually exclusive panel toggling — opening one closes the others
  const toggleExclusivePanel = useCallback((panel: 'files' | 'transcript' | 'cost') => {
    setShowFileAttention(prev => panel === 'files' ? !prev : false)
    setShowTranscript(prev => panel === 'transcript' ? !prev : false)
    setShowCostOverlay(prev => panel === 'cost' ? !prev : false)
  }, [])

  const [isReviewing, setIsReviewing] = useState(false)
  useEffect(() => bridge.setReviewing(isReviewing), [isReviewing, bridge.setReviewing])
  const displayAgents = useMemo(() => showAllAgents ? sessionAgents : !currentRoundOnly || isReviewing ? agents : new Map([...agents].filter(([, agent]) => agent.isMain || (agent.round ?? 0) === round)), [agents, sessionAgents, showAllAgents, currentRoundOnly, isReviewing, round])
  const { isMuted, seekingRef, handleToggleMute } = useAudioEffects(agents, toolCalls, isReviewing || bridge.compact)

  // Auto-play on mount
  useEffect(() => {
    const timer = setTimeout(() => play(), TIMING.autoPlayDelayMs)
    return () => clearTimeout(timer)
  }, [play])

  // Rebuild selected history from disk without retaining per-session snapshots.
  // useLayoutEffect ensures restart happens synchronously before any animation
  // frame can consume and discard events from pendingEventsRef.
  const prevSelectedRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    setIsReviewing(false)
    restart()
    if (bridge.selectedSessionId) bridge.flushSessionEvents(bridge.selectedSessionId)
    prevSelectedRef.current = bridge.selectedSessionId
  }, [bridge.selectedSessionId, bridge.historyRevision, restart, bridge.flushSessionEvents])

  const timelineEvents = useMemo(() => buildTimelineEvents(conversations), [conversations])

  // Review mode: when in live mode and user pauses to scrub through history

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause()
      setIsReviewing(true)
    } else {
      play()
    }
  }, [isPlaying, play, pause])

  const handleEnterReview = useCallback(() => {
    if (bridge.latestOnly) { bridge.loadFullHistory(); return }
    pause()
    setIsReviewing(true)
  }, [pause, bridge.latestOnly, bridge.loadFullHistory])

  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleResumeLive = useCallback(async () => {
    setIsReviewing(false)
    await seekToTime(Number.POSITIVE_INFINITY, true)
    setZoomToFitTrigger(n => n + 1)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => { resumeTimerRef.current = null; play() }, TIMING.resumeLiveDelayMs)
  }, [seekToTime, maxTimeReached, play])
  useEffect(() => () => { if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current) }, [])

  const handleRestart = useCallback(() => {
    setIsReviewing(false)
    restart(true)
  }, [restart])

  // Keyboard shortcuts
  const keyboardActions = useMemo(() => ({
    togglePlayPause: handlePlayPause,
    toggleFilePanel: () => toggleExclusivePanel('files'),
    toggleTranscript: () => toggleExclusivePanel('transcript'),
    toggleTimeline: () => { setShowTimeline(prev => !prev) },
    toggleHexGrid: () => { setShowHexGrid(prev => !prev) },
    toggleStats: () => { setShowStats(prev => !prev) },
    toggleCostOverlay: () => toggleExclusivePanel('cost'),
    zoomToFit: () => { setZoomToFitTrigger(n => n + 1) },
    clearSelection: () => { selection.clearAllSelections() },
    deselectAgent: () => { selection.clearAgent() },
    closeTranscript: () => { setShowTranscript(false) },
    toggleMute: handleToggleMute,
    setSpeed,
    selectedAgentId: selection.selectedAgentId,
  }), [handlePlayPause, selection.clearAllSelections, selection.clearAgent, selection.selectedAgentId, setSpeed, handleToggleMute, toggleExclusivePanel])

  useKeyboardShortcuts(keyboardActions)

  const totalTokens = useMemo(() => {
    let sum = 0
    for (const a of displayAgents.values()) sum += a.tokensUsed
    return sum
  }, [displayAgents])
  const estimatedContextCost = useMemo(() => Array.from(displayAgents.values()).reduce((sum, agent) => sum + agentCost(agent.tokensUsed, agent.model), 0), [displayAgents])

  const selectedAgent = selection.selectedAgentId ? displayAgents.get(selection.selectedAgentId) : null
  const selectedConversation = selection.selectedAgentId ? (conversations.get(selection.selectedAgentId) || []).filter(message => showAllAgents || !currentRoundOnly || (message.round ?? 0) === round) : []

  // Session runtime — drives the assistant label (CLAUDE vs CODEX) in transcript panels
  const sessionRuntime = useMemo(() => {
    for (const a of agents.values()) {
      if (a.runtime === 'codex') return 'codex' as const
    }
    return 'claude' as const
  }, [agents])

  // Session-wide conversation (all agents merged chronologically)
  // Only compute when the transcript panel is visible to avoid O(n log n) sort every frame
  const sessionConversation = useMemo(() => {
    if (!showTranscript) return []
    const all = Array.from(conversations).flatMap(([id, messages]) => messages.filter(message => !currentRoundOnly || (message.round ?? 0) === round).map(message => ({
      ...message, agentName: agents.get(id)?.name ?? timelineEntries.get(id)?.agentName ?? formatAgentName(id),
    })))
    return all.sort((a, b) => a.timestamp - b.timestamp)
  }, [conversations, showTranscript, agents, timelineEntries, currentRoundOnly, round])

  const roundConversations = useMemo(() => !currentRoundOnly ? conversations : new Map([...conversations].map(([id, messages]) => [id, messages.filter(message => (message.round ?? 0) === round)])), [conversations, currentRoundOnly, round])

  // Context menu items
  const contextMenuItems = selection.contextMenu ? (
    selection.contextMenu.agentId ? [
      { label: '📊  Toggle Stats', onClick: () => setShowStats(prev => !prev) },
    ] : [
      { label: '🔍  Zoom to Fit', onClick: () => setZoomToFitTrigger(n => n + 1) },
      { label: '📊  Toggle Stats', onClick: () => setShowStats(prev => !prev) },
      { label: '⬡  Toggle Grid', onClick: () => setShowHexGrid(prev => !prev) },
      { label: '', onClick: () => {}, separator: true },
      { label: '⟲  Restart', onClick: restart },
    ]
  ) : []

  const handleCloseSession = useCallback((id: string) => {
    bridge.removeSession(id)
    if (bridge.selectedSessionId === id) {
      const remaining = bridge.sessions.filter(s => s.id !== id)
      if (remaining.length > 0) {
        bridge.selectSession(remaining[remaining.length - 1].id)
      } else bridge.selectSession(null)
    }
  }, [bridge])

  const openFile = useCallback((filePath: string, line?: number) => {
    bridge.bridgeOpenFile(filePath, line)
  }, [bridge])

  const isEmpty = agents.size === 0 && !bridge.useMockData && !bridge.restoring

  return (
    <OpenFileProvider value={bridge.isVSCode ? openFile : null}>
    <div className="agent-flow-ui h-screen w-screen relative overflow-hidden" style={{ background: COLORS.void }}>
      {/* Empty state when no demo and no live data */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
            <div className={bridge.compact ? 'text-[10px]' : 'text-sm'} style={{ color: '#66ccff80' }}>WAITING FOR AGENT SESSION</div>
            {!bridge.compact && <div className="mt-2 text-xs" style={{ color: '#66ccff40' }}>Start a Claude Code or Codex session to see activity</div>}
          </div>
        </div>
      )}

      {bridge.restoring && <div role="status" className="absolute left-0 right-0 bottom-0 flex items-center justify-center" style={{ top: bridge.compact ? 36 : toolbarBottom, zIndex: 85, background: COLORS.void, color: COLORS.textMuted }}>
        <span className="text-xs">Restoring latest session state…</span>
      </div>}
      {bridge.storageError && <div role="alert" className="absolute left-3 right-3 p-3 rounded text-xs" style={{ top: toolbarBottom, zIndex: 90, background: COLORS.panelBg, color: COLORS.tool }}>
        โหลดประวัติไม่สำเร็จ: {bridge.storageError}
        <button className="ml-2 underline" onClick={bridge.reloadView}>กลับไปสถานะล่าสุด</button>
      </div>}
      {/* Canvas fills everything */}
      <AgentCanvas
        topInset={toolbarBottom + 28}
        visible={bridge.viewVisible && !bridge.restoring}
        restoring={bridge.restoring}
        showAllAgents={showAllAgents}
        currentRoundOnly={currentRoundOnly && !isReviewing}
        animationMode={bridge.animationMode}
        animationSpeed={bridge.animationSpeed}
        compact={bridge.compact}
        simulationRef={frameRef}
        selectedAgentId={selection.selectedAgentId}
        hoveredAgentId={selection.hoveredAgentId}
        showStats={showStats}
        showHexGrid={showHexGrid}
        zoomToFitTrigger={zoomToFitTrigger}
        pauseAutoFit={selection.contextMenu !== null}
        onAgentClick={selection.handleAgentClick}
        onAgentHover={selection.setHoveredAgentId}
        onAgentDrag={updateAgentPosition}
        onContextMenu={selection.handleContextMenu}
        onToolCallClick={selection.handleToolCallClick}
        selectedToolCallId={selection.selectedToolCallId}
        onDiscoveryClick={selection.handleDiscoveryClick}
        selectedDiscoveryId={selection.selectedDiscoveryId}
        showCostOverlay={showCostOverlay}
      />

      <WorkPanel topInset={toolbarBottom} sessionId={bridge.selectedSessionId} key={bridge.selectedSessionId ?? 'demo'} compact={bridge.compact} round={round} tasks={delegations} conversations={conversations} currentOnly={currentRoundOnly} onCurrentOnly={setCurrentRoundOnly} />

      {bridge.compact && (
        <>
          <div className="absolute top-0 left-0 right-0 z-50 flex flex-wrap items-center gap-0.5 px-1 py-1" style={{ background: COLORS.panelBg, borderBottom: `1px solid ${COLORS.glassBorder}` }}>
            <div className="w-full flex flex-wrap justify-end gap-1">{scopeControl}{bridge.latestOnly && <button className="text-[10px] px-1" style={{ color: COLORS.holoBright }} onClick={bridge.loadFullHistory}>โหลดประวัติย้อนหลัง</button>}</div>
            <SessionPicker compact sessions={bridge.sessions} selectedSessionId={bridge.selectedSessionId} onSelectSession={bridge.selectSession} onCloseSession={handleCloseSession} />
            <button title="Fit graph" aria-label="Fit graph" className="flow-icon-button" style={{ color: COLORS.textPrimary }} onClick={() => setZoomToFitTrigger(n => n + 1)}><FlowIcon name="fit" /></button>
            <button title="Open full graph" aria-label="Open full graph" className="flow-icon-button" style={{ color: COLORS.textPrimary }} onClick={bridge.openGraph}><FlowIcon name="expand" /></button>
            <FlowControls bridge={bridge} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] truncate pointer-events-none" style={{ color: COLORS.textPrimary, background: COLORS.void }}>
            {selectedAgent ? `${selectedAgent.name} · ${selectedAgent.model ?? 'Model unknown'} · ${selectedAgent.state}` : `${Array.from(displayAgents.values()).filter(agent => agent.isMain || agent.state !== 'complete').length} agents · ${bridge.connectionStatus}`}
          </div>
        </>
      )}

      {!bridge.compact && <>
      {/* Message feed panel (top-left) */}
      <MessageFeedPanel
        topInset={toolbarBottom}
        conversations={roundConversations}
        agents={displayAgents}
        onAgentClick={selection.handleAgentClick}
        selectedAgentId={selection.selectedAgentId}
      />

      {/* Agent detail card (floating, tethered to node) */}
      {selectedAgent && selection.selectedAgentWorldPos && (
        <div {...stopPropagationHandlers}>
          <AgentDetailCard
            agent={selectedAgent}
            onClose={selection.clearAgent}
          />
        </div>
      )}

      {/* Tool call detail popup */}
      {selection.selectedToolData && selection.selectedToolScreenPos && (
        <div {...stopPropagationHandlers}>
          <ToolDetailPopup
            sessionId={bridge.selectedSessionId}
            tool={selection.selectedToolData}
            position={selection.selectedToolScreenPos}
            onClose={selection.clearTool}
          />
        </div>
      )}

      {/* Discovery detail popup */}
      {selection.selectedDiscoveryData && selection.selectedDiscoveryScreenPos && (
        <div {...stopPropagationHandlers}>
          <DiscoveryDetailPopup
            discovery={selection.selectedDiscoveryData}
            position={selection.selectedDiscoveryScreenPos}
            onClose={selection.clearDiscovery}
          />
        </div>
      )}

      {/* Chat panel (bottom-right, shown when agent selected) */}
      <AgentChatPanel
        sessionId={bridge.selectedSessionId}
        agentId={selection.selectedAgentId}
        round={currentRoundOnly && !showAllAgents ? round : undefined}
        visible={!!selectedAgent}
        agentName={selectedAgent?.name ?? ''}
        agentState={selectedAgent?.state ?? 'idle'}
        conversation={selectedConversation}
        runtime={selectedAgent?.runtime ?? sessionRuntime}
        onClose={selection.clearAgent}
      />

      {/* Context menu */}
      {selection.contextMenu && (
        <GlassContextMenu
          position={selection.contextMenu}
          items={contextMenuItems}
          onClose={() => selection.setContextMenu(null)}
        />
      )}

      {/* Floating control strip */}
      <ControlBar
        isPlaying={isPlaying}
        speed={speed}
        currentTime={currentTime}
        totalDuration={bridge.useMockData
          ? (isReviewing ? Math.max(maxTimeReached, currentTime) : MOCK_DURATION)
          : Math.max(maxTimeReached, currentTime)
        }
        onPlayPause={handlePlayPause}
        onRestart={handleRestart}
        onSpeedChange={setSpeed}
        onSeek={(time) => {
          seekingRef.current = true
          pause()
          seekToTime(time)
          setZoomToFitTrigger(n => n + 1)
          if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
          resumeTimerRef.current = setTimeout(() => { resumeTimerRef.current = null; seekingRef.current = false }, TIMING.seekCompleteDelayMs)
        }}
        timelineEvents={timelineEvents}
        isReviewing={isReviewing}
        eventCount={timelineEvents.length}
        onEnterReview={handleEnterReview}
        onResumeLive={handleResumeLive}
      />

      {/* File attention panel (slide-in from right) */}
      <FileAttentionPanel
        visible={showFileAttention}
        fileAttention={fileAttention}
        onClose={() => setShowFileAttention(false)}
        onOpenFile={bridge.isVSCode ? openFile : undefined}
      />

      {/* Session transcript panel (slide-in from right) */}
      <SessionTranscriptPanel
        topInset={toolbarBottom + 40}
        sessionId={bridge.selectedSessionId}
        round={currentRoundOnly && !showAllAgents ? round : undefined}
        visible={showTranscript}
        conversation={sessionConversation}
        runtime={sessionRuntime}
        onClose={() => setShowTranscript(false)}
      />

      {/* Timeline panel (slide-in from bottom) */}
      <TimelinePanel
        visible={showTimeline}
        timelineEntries={timelineEntries}
        currentTime={currentTime}
        onClose={() => setShowTimeline(false)}
      />

      {/* Top bar: session tabs + info/controls */}
      <TopBar
        onHeightChange={setToolbarBottom}
        agentScopeControl={<>{scopeControl}{bridge.latestOnly && <button className="px-2 py-1 text-[10px] rounded" style={{ color: COLORS.holoBright, border: `1px solid ${COLORS.glassBorder}` }} onClick={bridge.loadFullHistory}>โหลดประวัติย้อนหลัง</button>}</>}
        viewerControls={<FlowControls bridge={bridge} />}
        sessions={bridge.sessions}
        selectedSessionId={bridge.selectedSessionId}
        sessionsWithActivity={bridge.sessionsWithActivity}
        onSelectSession={bridge.selectSession}
        onCloseSession={handleCloseSession}
        isVSCode={bridge.isVSCode}
        connectionStatus={bridge.connectionStatus}
        agentCount={displayAgents.size}
        totalTokens={totalTokens}
        estimatedContextCost={estimatedContextCost}
        showFileAttention={showFileAttention}
        showTranscript={showTranscript}
        showCostOverlay={showCostOverlay}
        showTimeline={showTimeline}
        isMuted={isMuted}
        onTogglePanel={toggleExclusivePanel}
        onToggleTimeline={() => setShowTimeline(prev => !prev)}
        onToggleMute={handleToggleMute}
      />
      </>}
      {bridge.historyProgress.loaded < bridge.historyProgress.total && <div role="status" className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: COLORS.void }}>
        <div className="text-center text-xs font-mono" style={{ color: COLORS.textPrimary }}>Loading history…<br />{bridge.historyProgress.loaded.toLocaleString()} / {bridge.historyProgress.total.toLocaleString()} events</div>
      </div>}
    </div>
    </OpenFileProvider>
  )
}
