'use client'
import { useEffect, useState } from 'react'
import type { useVSCodeBridge } from '@/hooks/use-vscode-bridge'
import type { AnimationMode } from '@/lib/viewer-preferences'
import { COLORS } from '@/lib/colors'
import { FlowIcon } from './flow-icon'
import { historyArchive } from '@/lib/history-archive'

export function FlowControls({ bridge }: { bridge: ReturnType<typeof useVSCodeBridge> }) {
  const [panel, setPanel] = useState<'settings' | 'status' | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (panel !== 'status') return
    bridge.refreshStatus()
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  // refreshStatus delegates to a stable bridge singleton.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel])
  const session = bridge.sessions.find(session => session.id === bridge.selectedSessionId)
  const stamp = (time?: number | null) => time ? new Date(time).toLocaleString() : 'None since opening this view'
  const toggle = (value: 'settings' | 'status') => setPanel(previous => previous === value ? null : value)
  return <div className="relative flex items-center gap-0.5 text-xs" style={{ color: COLORS.textPrimary }}>
    <button aria-label={bridge.sessionLocked ? 'Unlock session' : 'Lock session'} title={bridge.sessionLocked ? 'Session locked — other sessions cannot switch this view' : 'Lock the current session'} aria-pressed={bridge.sessionLocked} onClick={bridge.toggleSessionLock} className="flow-icon-button" style={{ color: bridge.sessionLocked ? COLORS.dispatch : undefined }}><FlowIcon name={bridge.sessionLocked ? 'lock' : 'unlock'} /></button>
    <button aria-label="Animation settings" title="Animation settings" aria-expanded={panel === 'settings'} onClick={() => toggle('settings')} className="flow-icon-button"><FlowIcon name="settings" /></button>
    <button aria-label="Connection status" title="Connection and patch status" aria-expanded={panel === 'status'} onClick={() => toggle('status')} className="flow-icon-button"><FlowIcon name="info" /></button>
    {panel && <div role="dialog" aria-label={panel === 'settings' ? 'Animation settings' : 'Connection status'} className="absolute right-0 top-full rounded p-3 shadow-lg" style={{ zIndex: 110, width: bridge.compact ? 240 : 320, maxHeight: '65vh', overflowY: 'auto', background: COLORS.panelBg, border: `1px solid ${COLORS.glassBorder}` }}>
      <div className="flex justify-between items-center mb-3"><strong>{panel === 'settings' ? 'Animation' : 'Connection status'}</strong><button aria-label="Close viewer options" className="flow-icon-button" onClick={() => setPanel(null)}><FlowIcon name="close" /></button></div>
      {panel === 'settings' ? <div className="flex flex-col gap-3">
        <label>Effects<select aria-label="Animation mode" className="block w-full mt-1 p-1" style={{ background: COLORS.void }} value={bridge.animationMode} onChange={event => bridge.setAnimation(event.target.value as AnimationMode, bridge.animationSpeed)}>
          <option value="full">Full effects</option><option value="low">Low GPU · 24 FPS</option><option value="off">Effects off</option>
        </select></label>
        <label>Visual speed<select aria-label="Visual animation speed" className="block w-full mt-1 p-1" style={{ background: COLORS.void }} value={bridge.animationSpeed} onChange={event => bridge.setAnimation(bridge.animationMode, Number(event.target.value))}>
          {[0.25, 0.5, 1, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select></label>
        <p style={{ color: COLORS.textMuted }}>Hidden views pause graphics. Detail decreases automatically for large graphs. These settings affect visuals, not agent execution.</p>
      </div> : <div className="flex flex-col gap-2 break-words">
        <div>Patch: <strong>{bridge.patchVersion}</strong></div>
        <div>Extension: {bridge.extensionVersion}</div>
        <div>Watcher: {bridge.connectionStatus}</div>
        <div>{bridge.connectionSource || 'No watcher connected'}</div>
        <div>Session: {session?.label ?? 'No session selected'}</div>
        <div style={{ color: COLORS.textMuted }}>{session?.id}</div>
        <div>Session activity: {stamp(session?.lastActivityTime)}</div>
        <div>Last live event: {stamp(bridge.lastLiveEventAt)}</div>
        {bridge.lastLiveEventAt && <div>{Math.max(0, Math.floor((now - bridge.lastLiveEventAt) / 1000))} seconds since the last live event</div>}
        <div>History: {bridge.historyProgress.loaded.toLocaleString()} / {bridge.historyProgress.total.toLocaleString()} events</div>
        <div>History storage: {bridge.storageError || historyArchive.error ? 'Unavailable · memory fallback' : 'Local disk · paged on demand'}</div>
        {(bridge.storageError || historyArchive.error) && <p role="alert" style={{ color: COLORS.tool }}>{bridge.storageError || historyArchive.error}</p>}
        <p style={{ color: COLORS.textMuted }}>A quiet session may still be thinking. This reports received data, not process health.</p>
        <button onClick={bridge.reloadView} className="rounded p-1">Reload graph from transcripts</button>
        <button onClick={bridge.refreshStatus} className="rounded p-1" style={{ border: `1px solid ${COLORS.glassBorder}` }}>Refresh status</button>
      </div>}
    </div>}
  </div>
}
