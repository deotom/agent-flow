'use client'
/**
 * T3 projects for the prompt bar, from the relay's local-only "t3-projects" message.
 * The bridge reposts every relay message to this window, so listening here needs no bridge changes.
 */
import { useEffect, useState } from 'react'

export interface T3ProjectInfo { id: string; title: string; root: string; current: boolean }

/** Projects in a relay message, or null when the message is not a project list. Exported for tests. */
export function projectsIn(message: unknown): T3ProjectInfo[] | null {
  const data = message as { type?: string; projects?: unknown } | null
  if (data?.type !== 't3-projects' || !Array.isArray(data.projects)) return null
  return data.projects.filter((item): item is T3ProjectInfo => Boolean(item) && typeof item.id === 'string' && typeof item.root === 'string'
    && typeof item.title === 'string' && typeof item.current === 'boolean')
}

export function useT3Projects(): T3ProjectInfo[] {
  const [projects, setProjects] = useState<T3ProjectInfo[]>([])
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const list = projectsIn(event.data)
      if (list) setProjects(list)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return projects
}
