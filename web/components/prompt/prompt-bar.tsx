'use client'
/**
 * Prompt bar: type a message and send it to a T3 thread, or start a new thread in a T3 project.
 * Sending goes through the desktop app and T3's own CLI. A busy thread gets the message as its next turn;
 * nothing running is interrupted. Nothing is sent without the user pressing Send or Enter.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { desktopRequest, threadIdOf } from '@/lib/desktop-actions'
import type { T3ProjectInfo } from '@/hooks/use-t3-projects'
import './prompt-bar.css'

export interface PromptThread { id: string; label: string }
const NEW = '__new__'
const DRAFT_KEY = 'agent-flow-prompt-draft'
const plainLabel = (label: string) => label.replace(/^T3\s*·\s*/, '')

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; text: string } | { kind: 'error'; text: string }

export function PromptBar({ projects, threads, selectedThreadId, onSent, onClose, autoFocus = false, compact = false }: {
  projects: T3ProjectInfo[]
  threads: PromptThread[]
  selectedThreadId: string | null
  /** Called with the Agent Flow session id ("t3:<id>") that received the prompt. */
  onSent?: (sessionId: string) => void
  onClose?: () => void
  autoFocus?: boolean
  compact?: boolean
}) {
  const current = projects.find(project => project.current) ?? null
  const [target, setTarget] = useState<string>(selectedThreadId ?? NEW)
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(DRAFT_KEY) ?? '' } catch { return '' } })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const input = useRef<HTMLTextAreaElement>(null)

  // Follow the team the user is looking at until they pick a target themselves.
  const picked = useRef(false)
  useEffect(() => { if (!picked.current && selectedThreadId) setTarget(selectedThreadId) }, [selectedThreadId])
  useEffect(() => { if (target !== NEW && !threads.some(thread => thread.id === target)) setTarget(selectedThreadId && threads.some(t => t.id === selectedThreadId) ? selectedThreadId : NEW) }, [threads, target, selectedThreadId])
  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, text) } catch { /* storage unavailable */ } }, [text])
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])

  const options = useMemo(() => threads.map(thread => ({ id: thread.id, label: plainLabel(thread.label) })), [threads])
  const sending = status.kind === 'sending'
  const canSend = text.trim().length > 0 && !sending && (target !== NEW || Boolean(current))

  async function switchProject(root: string) {
    if (!root || root === current?.root) return
    setStatus({ kind: 'sending' })
    try {
      await desktopRequest('open-project', { root })
      setStatus({ kind: 'sent', text: 'Switched project' })
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    }
  }

  async function send() {
    if (!canSend) return
    const message = text.trim()
    setStatus({ kind: 'sending' })
    try {
      if (target === NEW) {
        const result = await desktopRequest('t3-start', { projectRoot: current!.root, message }) as { threadId?: string } | undefined
        setStatus({ kind: 'sent', text: 'Started a new thread' })
        if (result?.threadId) onSent?.(`t3:${threadIdOf(result.threadId)}`)
      } else {
        await desktopRequest('t3-send', { threadId: threadIdOf(target), message })
        setStatus({ kind: 'sent', text: 'Sent · a busy thread gets it next' })
        onSent?.(target)
      }
      setText('')
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <form className="pb-root" data-compact={compact} onSubmit={event => { event.preventDefault(); void send() }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose?.() } }}>
      <div className="pb-targets">
        <select className="pb-select" aria-label="T3 project" title={current?.root ?? 'No T3 project for this folder'} value={current?.root ?? ''}
          disabled={sending || projects.length === 0} onChange={event => void switchProject(event.target.value)}>
          {!current && <option value="">No T3 project here</option>}
          {projects.map(project => <option key={project.id} value={project.root}>{project.title}</option>)}
        </select>
        <select className="pb-select" aria-label="Send to" value={target} disabled={sending}
          onChange={event => { picked.current = true; setTarget(event.target.value) }}>
          <option value={NEW} disabled={!current}>＋ New thread</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </div>
      <div className="pb-input-row">
        <textarea ref={input} className="pb-input" rows={compact ? 2 : 1} value={text} disabled={sending} maxLength={20000}
          placeholder={target === NEW ? 'Start a new thread…' : 'Message this thread…'} aria-label="Prompt"
          onChange={event => { setText(event.target.value); if (status.kind !== 'sending') setStatus({ kind: 'idle' }) }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
        <button className="pb-send" type="submit" disabled={!canSend} aria-label="Send prompt" title="Send · Enter (Shift+Enter for a new line)">
          {sending ? '…' : '➤'}
        </button>
      </div>
      {status.kind === 'sent' && <p className="pb-status" data-kind="ok" role="status">{status.text}</p>}
      {status.kind === 'error' && <p className="pb-status" data-kind="error" role="alert">{status.text}</p>}
    </form>
  )
}
