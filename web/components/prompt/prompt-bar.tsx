'use client'
/**
 * Prompt bar: type a message and send it to a T3 thread, or start a new thread in a T3 project.
 * Sending goes through the desktop app and T3's own CLI. A busy thread gets the message as its next turn;
 * nothing running is interrupted. Nothing is sent without the user pressing Send or Enter.
 *
 * The project picker only chooses where a NEW thread starts; it never switches what Agent Flow is watching.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { desktopRequest, threadIdOf } from '@/lib/desktop-actions'
import { defaultProject, type ModelChoice } from '@/lib/prompt-model'
import type { T3ProjectInfo } from '@/hooks/use-t3-projects'
import './prompt-bar.css'

export interface PromptThread { id: string; label: string }
const NEW = '__new__'
const DRAFT_KEY = 'agent-flow-prompt-draft'
const plainLabel = (label: string) => label.replace(/^T3\s*·\s*/, '')

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; text: string } | { kind: 'error'; text: string; unknown?: boolean }

export function PromptBar({ projects, threads, models = [], selectedThreadId, onSent, onClose, autoFocus = false, compact = false }: {
  projects: T3ProjectInfo[]
  /** Threads of the folder Agent Flow is watching. */
  threads: PromptThread[]
  /** Provider/model pairs T3 reported; empty means the project's default only. */
  models?: ModelChoice[]
  selectedThreadId: string | null
  /** Called with the Agent Flow session id ("t3:<id>") that received the prompt. */
  onSent?: (sessionId: string) => void
  onClose?: () => void
  autoFocus?: boolean
  compact?: boolean
}) {
  const watched = defaultProject(projects)
  const [projectRoot, setProjectRoot] = useState<string>('')
  const [target, setTarget] = useState<string>(selectedThreadId ?? NEW)
  const [modelKey, setModelKey] = useState('')
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(DRAFT_KEY) ?? '' } catch { return '' } })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const input = useRef<HTMLTextAreaElement>(null)
  // A thread we just started: select it as soon as T3 lists it.
  const [pending, setPending] = useState<string | null>(null)

  // The chosen project, or the one that exactly matches the watched folder.
  const project = projects.find(item => item.root === projectRoot) ?? watched
  const elsewhere = Boolean(project && watched && project.root !== watched.root) || Boolean(project && !watched)
  // Threads belong to the watched folder; another project can only get a new thread from here.
  const options = useMemo(() => elsewhere ? [] : threads.map(thread => ({ id: thread.id, label: plainLabel(thread.label) })), [threads, elsewhere])

  // Follow the team the user is looking at until they pick a target themselves.
  const picked = useRef(false)
  useEffect(() => { if (!picked.current && selectedThreadId) setTarget(selectedThreadId) }, [selectedThreadId])
  useEffect(() => {
    if (pending && options.some(option => option.id === pending)) { setTarget(pending); setPending(null); return }
    if (target !== NEW && !options.some(option => option.id === target)) setTarget(selectedThreadId && options.some(o => o.id === selectedThreadId) ? selectedThreadId : NEW)
  }, [options, target, selectedThreadId, pending])
  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, text) } catch { /* storage unavailable */ } }, [text])
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])

  const sending = status.kind === 'sending'
  const choice = models.find(model => `${model.provider}\u0000${model.model}` === modelKey) ?? null
  const canSend = text.trim().length > 0 && !sending && (target !== NEW || Boolean(project))

  async function send() {
    if (!canSend) return
    const message = text.trim()
    setStatus({ kind: 'sending' })
    try {
      if (target === NEW) {
        const payload = { projectRoot: project!.root, message, ...(choice ? { provider: choice.provider, model: choice.model } : {}) }
        const result = await desktopRequest('t3-start', payload) as { threadId?: string } | undefined
        const id = result?.threadId ? `t3:${threadIdOf(result.threadId)}` : null
        setStatus({ kind: 'sent', text: elsewhere ? `Started a new thread in ${project!.title}` : 'Started a new thread' })
        if (id) { if (!elsewhere) setPending(id); onSent?.(id) }
      } else {
        await desktopRequest('t3-send', { threadId: threadIdOf(target), message })
        setStatus({ kind: 'sent', text: 'Sent · a busy thread gets it next' })
        onSent?.(target)
      }
      setText('')
      picked.current = false
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus({ kind: 'error', text: message, unknown: message.startsWith('Delivery unknown') })
    }
  }

  return (
    <form className="pb-root" data-compact={compact} onSubmit={event => { event.preventDefault(); void send() }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose?.() } }}>
      <div className="pb-targets">
        <select className="pb-select" aria-label="Project for a new thread" title={project?.root ?? 'Choose the T3 project for a new thread'}
          value={project?.root ?? ''} disabled={sending || projects.length === 0}
          onChange={event => { setProjectRoot(event.target.value); if (event.target.value && event.target.value !== watched?.root) { picked.current = true; setTarget(NEW) } }}>
          {!project && <option value="">{projects.length ? 'Choose a project…' : 'No T3 project'}</option>}
          {projects.map(item => <option key={item.id} value={item.root}>{item.title}{item.current ? '' : ' ↗'}</option>)}
        </select>
        <select className="pb-select" aria-label="Send to" value={target} disabled={sending}
          onChange={event => { picked.current = true; setTarget(event.target.value) }}>
          <option value={NEW} disabled={!project}>＋ New thread</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </div>
      {target === NEW && models.length > 0 && (
        <select className="pb-select pb-model" aria-label="Model for the new thread" value={modelKey} disabled={sending} onChange={event => setModelKey(event.target.value)}>
          <option value="">Project default model</option>
          {models.map(model => <option key={`${model.provider}:${model.model}`} value={`${model.provider}\u0000${model.model}`}>{model.label}</option>)}
        </select>
      )}
      <div className="pb-input-row">
        <textarea ref={input} className="pb-input" rows={compact ? 2 : 1} value={text} disabled={sending} maxLength={20000}
          placeholder={target === NEW ? `Start a new thread${project ? ` in ${project.title}` : ''}…` : 'Message this thread…'} aria-label="Prompt"
          onChange={event => { setText(event.target.value); if (status.kind !== 'sending') setStatus({ kind: 'idle' }) }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
        <button className="pb-send" type="submit" disabled={!canSend} aria-label="Send prompt" title="Send · Enter (Shift+Enter for a new line)">
          {sending ? '…' : '➤'}
        </button>
      </div>
      {status.kind === 'sent' && <p className="pb-status" data-kind="ok" role="status">{status.text}</p>}
      {status.kind === 'error' && <p className="pb-status" data-kind={status.unknown ? 'unknown' : 'error'} role="alert">{status.text}</p>}
    </form>
  )
}
