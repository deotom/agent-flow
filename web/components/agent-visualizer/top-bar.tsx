"use client"

import { memo, useEffect, useRef, type ReactNode } from "react"
import { Z } from "@/lib/agent-types"
import { COLORS } from "@/lib/colors"
import { formatTokens } from "@/lib/utils"
import { SessionPicker } from "./session-picker"
import { FlowIcon } from './flow-icon'
import type { SessionInfo, ConnectionStatus } from "@/lib/bridge-types"

// ─── Mute/Unmute SVG Icons ───────────────────────────────────────────────────

function MutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

function UnmutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  )
}

// ─── Toggle Button ──────────────────────────────────────────────────────────

function ToggleButton({ active, onClick, children, style, activeColor }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
  activeColor?: { bg: string; text: string }
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1.5 rounded-md transition-all inline-flex items-center gap-1.5"
      style={{
        background: active ? (activeColor?.bg ?? COLORS.toggleActive) : COLORS.toggleInactive,
        border: `1px solid ${COLORS.toggleBorder}`,
        color: active ? (activeColor?.text ?? COLORS.holoBright) : COLORS.textMuted,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── Connection Status Indicator ────────────────────────────────────────────

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const color = status === 'watching' ? COLORS.complete
    : status === 'connected' ? COLORS.idle : COLORS.error
  const label = status === 'watching' ? 'LIVE'
    : status === 'connected' ? 'CONNECTED' : 'OFFLINE'

  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 4px ${color}` }}
      />
      {label}
    </span>
  )
}

// ─── Top Bar ────────────────────────────────────────────────────────────────

export interface TopBarProps {
  agentScopeControl?: ReactNode
  viewerControls?: ReactNode
  onHeightChange?: (height: number) => void
  // Session tabs
  sessions: SessionInfo[]
  selectedSessionId: string | null
  sessionsWithActivity: Set<string>
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
  // Connection
  isVSCode: boolean
  connectionStatus: ConnectionStatus
  // Stats
  agentCount: number
  totalTokens: number
  estimatedContextCost: number
  // Panel toggles
  showFileAttention: boolean
  showTranscript: boolean
  showCostOverlay: boolean
  showTimeline: boolean
  isMuted: boolean
  onTogglePanel: (panel: 'files' | 'transcript' | 'cost') => void
  onToggleTimeline: () => void
  onToggleMute: () => void
}

export const TopBar = memo(function TopBar({
  viewerControls, onHeightChange, agentScopeControl,
  sessions, selectedSessionId, sessionsWithActivity,
  onSelectSession, onCloseSession,
  isVSCode, connectionStatus,
  agentCount, totalTokens, estimatedContextCost,
  showFileAttention, showTranscript, showCostOverlay, showTimeline, isMuted,
  onTogglePanel, onToggleTimeline, onToggleMute,
}: TopBarProps) {
  const header = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!header.current || !onHeightChange) return
    const observer = new ResizeObserver(entries => onHeightChange(entries[0].contentRect.height + 42))
    observer.observe(header.current)
    return () => observer.disconnect()
  }, [onHeightChange])
  return (
    <div ref={header} className="absolute top-3 left-3 right-3 flow-hud-panel flex flex-col items-stretch gap-2 text-[12px] p-2 rounded-lg" style={{ zIndex: 80, background: COLORS.panelBg, border: `1px solid ${COLORS.glassBorder}` }}>
      {/* Session tabs — scrollable, takes available space */}
      {(
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          {sessions.length > 0 && <div className="min-w-0 flex-1">
          <SessionPicker
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            onCloseSession={onCloseSession}
          />
          </div>}
          {agentScopeControl}
        </div>
      )}

      {/* Right-side info/controls */}
      <div className="flex flex-wrap items-center justify-end gap-3" style={{ color: COLORS.textMuted }}>
        {isVSCode && <ConnectionIndicator status={connectionStatus} />}
        <span>{agentCount} agents</span>
        <span>
          {formatTokens(totalTokens)} tokens
          <span style={{ color: COLORS.complete + '65', marginLeft: 4 }}>
            <span title="Context cost estimate for visible agents, using configured model rates. Not billed usage.">~${estimatedContextCost.toFixed(2)}</span>
          </span>
        </span>

        {/* Mutually exclusive panel group */}
        <div className="flex items-center gap-1 px-1 py-0.5 rounded" style={{
          background: COLORS.holoBg03,
          border: `1px solid ${COLORS.holoBorder06}`,
        }}>
          <ToggleButton active={showFileAttention} onClick={() => onTogglePanel('files')} style={{ background: showFileAttention ? undefined : 'transparent', border: 'none' }}><FlowIcon name="files" size={14} />Files</ToggleButton>
          <ToggleButton active={showTranscript} onClick={() => onTogglePanel('transcript')} style={{ background: showTranscript ? undefined : 'transparent', border: 'none' }}><FlowIcon name="chat" size={14} />Chat</ToggleButton>
          <ToggleButton
            active={showCostOverlay}
            onClick={() => onTogglePanel('cost')}
            activeColor={{ bg: COLORS.costActiveBg, text: COLORS.complete }}
            style={{ background: showCostOverlay ? undefined : 'transparent', border: 'none' }}
          >
            <FlowIcon name="cost" size={14} />Cost
          </ToggleButton>
        </div>

        {/* Independent toggles */}
        <ToggleButton active={showTimeline} onClick={onToggleTimeline}><FlowIcon name="timeline" size={14} />Timeline</ToggleButton>
        <ToggleButton active={!isMuted} onClick={onToggleMute} style={{ border: `1px solid ${COLORS.toggleBorder}` }}>
          {isMuted ? <MutedIcon /> : <UnmutedIcon />}
        </ToggleButton>
        {viewerControls}
      </div>
    </div>
  )
})
