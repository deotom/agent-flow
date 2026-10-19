'use client'
import { useEffect, useState } from 'react'
import type { Delegation, ConversationMessage } from '@/hooks/simulation/types'
import { FLOW_LABELS } from '@/hooks/simulation/work-rounds'
import { COLORS } from '@/lib/colors'
import { useArchivePage } from '@/hooks/use-archive-page'
import type { MessageRow } from '@/lib/history-archive'
import { FlowIcon } from './flow-icon'

interface Props {
  topInset?: number
  sessionId?: string | null
  compact: boolean
  round: number
  tasks: Map<string, Delegation>
  conversations: Map<string, ConversationMessage[]>
  currentOnly: boolean
  onCurrentOnly: (value: boolean) => void
}
export function WorkPanel({ topInset = 112, sessionId, compact, round, tasks, conversations, currentOnly, onCurrentOnly }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState<Delegation | null>(null)
  const records = [...tasks.values()]
  const latest = records.filter(task => task.endTime !== undefined && !task.historical).sort((a, b) => a.endTime! - b.endTime!).at(-1)
  useEffect(() => {
    if (!latest) return
    setNotice(latest)
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [latest?.id, latest?.stage, latest?.summary])
  const archivedTasks = useArchivePage<Delegation>(open, sessionId, 'tasks', { round: currentOnly ? round : undefined })
  const visible = archivedTasks.items.length && !archivedTasks.error ? archivedTasks.items : records.filter(task => !currentOnly || task.round === round).reverse()
  const task = selected ? archivedTasks.items.find(item => item.id === selected) ?? tasks.get(selected) : undefined
  const archivedMessages = useArchivePage<MessageRow>(open && !!task, sessionId, 'messages', { agent: task?.child, round: task?.round, from: task?.startTime, to: task?.endTime })
  const messages = archivedMessages.items.length && !archivedMessages.error ? [...archivedMessages.items].reverse() : task ? (conversations.get(task.child) ?? []).filter(message => (message.round ?? 0) === task.round && message.timestamp >= task.startTime && (task.endTime === undefined || message.timestamp <= task.endTime)) : []
  return <div className="absolute text-[12px] leading-relaxed" style={{ zIndex: compact ? 30 : 70, top: compact ? 70 : topInset, right: 8, left: compact ? 8 : undefined, width: compact ? undefined : 340, color: COLORS.textPrimary }}>
    <div className="flex justify-end gap-2">
      <button aria-label="Tasks and results" aria-expanded={open} onClick={() => setOpen(value => !value)} className="rounded-md px-2 py-1 flex items-center gap-2" style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.glassBorder}` }}><FlowIcon name="tasks" size={14} />Round {round || '—'} · Tasks {visible.length}<FlowIcon name="chevron" size={12} /></button>
    </div>
    {notice && !open && <button aria-label="View completed agent result" onClick={() => { setSelected(notice.id); setOpen(true); if (notice.round !== round) onCurrentOnly(false) }} className="block mt-2 w-full rounded p-2 text-left" style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.glassBorder}` }}>
      {notice.name} · {FLOW_LABELS[notice.stage]}<div className="truncate opacity-70">{notice.summary || 'Open task details'}</div>
    </button>}
    {open && <section role="dialog" aria-label="Tasks and results" className="flow-hud-panel mt-1 rounded p-3 overflow-y-auto" style={{ maxHeight: compact ? '65vh' : '70vh', background: COLORS.panelBg, border: `1px solid ${COLORS.glassBorder}` }}>
      <div className="flex justify-between mb-2"><strong>Tasks and results</strong><button aria-label="Close tasks and results" className="flow-icon-button" onClick={() => setOpen(false)}><FlowIcon name="close" /></button></div>
      <label className="flex items-center gap-2 mb-3"><input type="checkbox" checked={!currentOnly} onChange={event => { onCurrentOnly(!event.target.checked); setSelected(null) }} />Include previous rounds</label>
      {sessionId && <div className="flex justify-between mb-2">
        <button disabled={archivedTasks.pageNumber === 1 || archivedTasks.loading} onClick={() => { archivedTasks.newer(); setSelected(null) }}>Newer tasks</button>
        <span>Page {archivedTasks.pageNumber}</span>
        <button disabled={!archivedTasks.more || archivedTasks.loading} onClick={() => { archivedTasks.older(); setSelected(null) }}>Older tasks</button>
      </div>}
      {visible.length === 0 && <p>No delegated tasks in this round. Use Chat to read the conversation.</p>}
      {visible.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className="block w-full text-left rounded p-2 mb-1" style={{ border: `1px solid ${COLORS.glassBorder}` }}>
        <strong>{item.name}</strong> · Round {item.round}<div>{FLOW_LABELS[item.stage]}</div><div className="opacity-60">{item.model ?? 'Model unknown'}</div><div className="truncate opacity-80">{item.summary || item.task || 'No result received yet'}</div>
      </button>)}
      {task && <div className="mt-3 pt-2 whitespace-pre-wrap break-words" style={{ borderTop: `1px solid ${COLORS.glassBorder}` }}>
        <strong>{task.name}</strong><div>{task.task}</div><p className="my-2">{task.summary || 'No result received yet'}</p>
        <details><summary>Task messages ({messages.length})</summary><div className="flex justify-between"><button disabled={archivedMessages.pageNumber === 1} onClick={archivedMessages.newer}>Newer messages</button><button disabled={!archivedMessages.more} onClick={archivedMessages.older}>Older messages</button></div>{messages.map(message => <div key={message.id} className="my-2"><strong>{message.type}</strong><div>{message.content}</div></div>)}</details>
      </div>}
    </section>}
  </div>
}
