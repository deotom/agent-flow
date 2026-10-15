'use client'
import { useEffect, useRef, useState } from 'react'
import type { SessionInfo } from '@/lib/vscode-bridge'
import { COLORS } from '@/lib/colors'
import { FlowIcon } from './flow-icon'

export function SessionPicker({ sessions, selectedSessionId, onSelectSession, onCloseSession, compact = false }: {
  sessions: SessionInfo[]; selectedSessionId: string | null; onSelectSession: (id: string) => void;
  onCloseSession?: (id: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const selected = sessions.find(session => session.id === selectedSessionId)
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const results = sessions.filter(session => `${session.label} ${session.id}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.lastActivityTime - a.lastActivityTime)
  return <div ref={root} className="relative min-w-0" style={{ flex: compact ? 1 : undefined }}>
    <button aria-label="Choose session" aria-expanded={open} onClick={() => { setOpen(value => !value); setQuery('') }} title={selected?.label}
      className="w-full min-w-0 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs" style={{ color: COLORS.textPrimary, border: `1px solid ${COLORS.glassBorder}`, background: COLORS.void }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: selected?.status === 'active' ? COLORS.complete : COLORS.textMuted }} />
      <span className="truncate flex-1">{selected?.label ?? 'Choose a session'}</span><span className="opacity-60">{sessions.length}</span><FlowIcon name="chevron" size={12} />
    </button>
    {open && <div role="dialog" aria-label="Choose session" onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} className="flow-hud-panel absolute left-0 top-full mt-1 rounded-md p-2" style={{ width: compact ? 'min(320px, calc(100vw - 16px))' : 'min(440px, calc(100vw - 48px))', zIndex: 120, background: COLORS.panelBg, border: `1px solid ${COLORS.glassBorder}` }}>
      <input autoFocus type="search" aria-label="Search sessions" placeholder="Search sessions…" value={query} onChange={event => setQuery(event.target.value)}
        className="w-full rounded p-2 text-xs mb-2" style={{ background: COLORS.void, color: COLORS.textPrimary }} />
      <div className="overflow-y-auto" style={{ maxHeight: 'min(320px, 50vh)', overscrollBehavior: 'contain' }}>
        {!results.length && <p className="p-2 text-xs">No matching sessions</p>}
        {results.map(session => <div key={session.id} className="flex items-center gap-1">
          <button aria-current={session.id === selectedSessionId ? 'true' : undefined} onClick={() => { onSelectSession(session.id); setOpen(false) }} className="min-w-0 flex-1 p-2 text-left rounded text-xs" style={{ background: session.id === selectedSessionId ? COLORS.tabSelectedBg : undefined }}>
            <div className="truncate" title={session.label}>{session.label}</div><div className="opacity-60">{session.status === 'active' ? 'Active' : 'Completed'} · {new Date(session.lastActivityTime).toLocaleString()}</div>
          </button>
          {onCloseSession && <button aria-label={`Close session ${session.label}`} className="flow-icon-button" onClick={() => onCloseSession(session.id)}><FlowIcon name="close" size={12} /></button>}
        </div>)}
      </div>
    </div>}
  </div>
}
