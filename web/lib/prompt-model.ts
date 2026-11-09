/**
 * Choices for the prompt bar, derived only from what T3 already reports.
 */
import type { TeamSnapshot } from './team-types'
import type { T3ProjectInfo } from '@/hooks/use-t3-projects'

/** A provider/model pair seen in T3 teams. `provider` is the T3 provider instance id the CLI expects. */
export interface ModelChoice { provider: string; model: string; label: string }

const PROVIDER: Record<string, string> = { claude: 'claudeAgent', codex: 'codex' }

/** Models agents in these teams actually ran, most used first. Unknown runtimes are left out rather than guessed. */
export function modelChoices(snapshots: Iterable<TeamSnapshot>): ModelChoice[] {
  const counts = new Map<string, ModelChoice & { uses: number }>()
  for (const team of snapshots) for (const agent of team.agents) {
    const provider = agent.runtime ? PROVIDER[agent.runtime] : undefined
    if (!provider || !agent.model) continue
    const key = `${provider}\u0000${agent.model}`
    const known = counts.get(key)
    if (known) known.uses++
    else counts.set(key, { provider, model: agent.model, label: `${agent.runtime === 'claude' ? 'Claude' : 'Codex'} · ${agent.model}`, uses: 1 })
  }
  return [...counts.values()].sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label))
    .map(({ provider, model, label }) => ({ provider, model, label }))
}

/** The project a new thread starts in by default: only an exact match for the open folder, never a guess. */
export function defaultProject(projects: T3ProjectInfo[]): T3ProjectInfo | null {
  const exact = projects.filter(project => project.current)
  return exact.length === 1 ? exact[0] : null
}
