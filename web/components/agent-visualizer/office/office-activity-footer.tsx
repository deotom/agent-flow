'use client'

import type { OfficeAppearance } from '@/lib/office-types'
import { STATUS_LABEL } from '@/lib/team-model'
import type { TeamAgentStatus } from '@/lib/team-types'
import { OfficeAvatarPortrait } from './office-avatar-portrait'

interface OfficeActivityFooterProps {
  name: string
  status: TeamAgentStatus
  task?: string | null
  avatarArt?: CanvasImageSource | null
  appearance?: OfficeAppearance
  progress?: { completed: number; total: number; label?: string }
  onOpen?: () => void
}

export function OfficeActivityFooter({ name, status, task, avatarArt, appearance, progress, onOpen }: OfficeActivityFooterProps) {
  const completion = progress && Number.isInteger(progress.completed) && Number.isInteger(progress.total)
    && progress.total > 0 && progress.completed >= 0 && progress.completed <= progress.total
    ? Math.round(100 * progress.completed / progress.total)
    : undefined
  const statusLabel = status === 'running' ? 'Working' : STATUS_LABEL[status]
  const progressLabel = progress && `${progress.label ?? 'Tasks'} · ${progress.completed} of ${progress.total} complete`

  return (
    <footer className="office-activity-footer" aria-label="Office activity">
      <div className="office-activity-identity">
        {appearance
          ? <OfficeAvatarPortrait appearance={appearance} avatarArt={avatarArt} className="office-activity-portrait" />
          : <span className="office-activity-portrait office-activity-initial" aria-hidden="true">{Array.from(name.trim())[0]}</span>}
        <strong className="office-activity-name" title={name}>{name}</strong>
      </div>
      <span className="office-activity-status" data-status={status}><i aria-hidden="true" />{statusLabel}</span>
      {task && <span className="office-activity-task" title={task}>{task}</span>}
      {completion !== undefined && <span className="office-activity-progress" title={progressLabel}>
        <progress value={completion} max={100} aria-label={progressLabel} />
        <span aria-hidden="true">{completion}%</span>
      </span>}
      {onOpen && <button type="button" className="office-activity-more" onClick={onOpen} aria-label={`View details for ${name}`} title="View details">···</button>}
    </footer>
  )
}
