import { useEffect, useState } from 'react'
import { historyArchive, type HistoryPage, type MessageRow } from '@/lib/history-archive'
import type { Delegation } from './simulation/types'

export function useArchivePage<T extends MessageRow | Delegation>(visible: boolean, session: string | null | undefined, store: 'messages' | 'tasks', options: { query?: string; round?: number; agent?: string; from?: number; to?: number } = {}) {
  const key = JSON.stringify(options)
  const [cursors, setCursors] = useState<(IDBValidKey[] | undefined)[]>([undefined])
  const [page, setPage] = useState<HistoryPage<T>>({ items: [], more: false })
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setCursors([undefined]); setPage({ items: [], more: false }) }, [key, session, visible])
  useEffect(() => {
    if (!visible) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = historyArchive.subscribe(() => {
      if (timer || cursors.length > 1) return
      timer = setTimeout(() => { timer = undefined; setVersion(value => value + 1) }, 200)
    })
    return () => { unsubscribe(); if (timer) clearTimeout(timer) }
  }, [visible, cursors.length])
  useEffect(() => {
    if (!visible || !session) { setPage({ items: [], more: false }); return }
    let cancelled = false
    const opts = JSON.parse(key) as typeof options
    setLoading(true)
    const timer = setTimeout(() => {
      void historyArchive.page<T>(store, session, { cursor: cursors.at(-1), limit: 100, match: value => {
        const row = value as MessageRow & Delegation
        if (opts.round !== undefined && (row.round ?? 0) !== opts.round) return false
        if (opts.agent && (row.agentId ?? row.child) !== opts.agent) return false
        if (opts.from !== undefined && row.timestamp < opts.from) return false
        if (opts.to !== undefined && row.timestamp > opts.to) return false
        const query = opts.query?.trim().toLowerCase()
        return !query || `${row.content ?? row.summary ?? ''} ${row.agentName ?? row.name ?? ''} ${row.toolName ?? ''}`.toLowerCase().includes(query)
      } }).then(result => { if (!cancelled) { setPage(result); setError(null) } })
        .catch(reason => { if (!cancelled) setError(String(reason)) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, opts.query ? 200 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [visible, session, store, key, cursors, version])
  return { ...page, loading, error, pageNumber: cursors.length,
    older: () => { if (page.more && !loading) setCursors(previous => [...previous, page.cursor]) },
    newer: () => { if (cursors.length > 1) setCursors(previous => previous.slice(0, -1)) },
    latest: () => setCursors([undefined]) }
}
