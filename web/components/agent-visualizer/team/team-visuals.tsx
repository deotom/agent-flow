'use client'

import type { TeamAgentStatus } from '@/lib/team-types'
import { STATUS_LABEL, deliverySteps, type DeliveryStep } from '@/lib/team-model'

/** The glyph and label carry the status. Light and motion only reinforce them. */
function StatusGlyph({ status }: { status: TeamAgentStatus }) {
  switch (status) {
    case 'done': return <path d="M11 16.5l3.4 3.4 6.6-7.4" />
    case 'failed': return <path d="M12 12l8 8M20 12l-8 8" />
    case 'cancelled': return <path d="M11.5 20.5l9-9" />
    case 'waiting_approval': return <path d="M16 10.5v6.5M16 20.6v.6" />
    case 'waiting_input': return <path d="M13.2 13.2a2.9 2.9 0 1 1 4.4 2.5c-1 .6-1.6 1.2-1.6 2.3M16 21v.3" />
    case 'running': return <path d="M13.6 11.8l6 4.2-6 4.2z" />
    case 'thinking': return <circle cx="16" cy="16" r="2.4" />
    default: return null
  }
}

/** Miniature reactor: outer ring motion means state, not a measurement. */
export function AgentLamp({ status, live = true, size = 32 }: { status: TeamAgentStatus; live?: boolean; size?: number }) {
  return (
    <span className="jv-lamp" data-status={status} data-live={live} style={{ width: size, height: size }} role="img" aria-label={live ? STATUS_LABEL[status] : `Last known: ${STATUS_LABEL[status]}`}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <circle className="jv-lamp-track" cx="16" cy="16" r="13.5" />
        <circle className="jv-lamp-arc" cx="16" cy="16" r="13.5" pathLength={100} />
        <circle className="jv-lamp-core" cx="16" cy="16" r="9.5" />
        <g className="jv-lamp-glyph"><StatusGlyph status={status} /></g>
      </svg>
    </span>
  )
}

/**
 * Team reactor: one arc per agent, coloured by that agent's status. It reads as a
 * head count of the team, and deliberately has no fill level that could be taken
 * for remaining context.
 */
export function TeamReactor({ statuses, active, live, size = 72, label = 'Active' }: { statuses: TeamAgentStatus[]; active: number; live: boolean; size?: number; label?: string }) {
  const total = Math.max(1, statuses.length)
  const gap = statuses.length > 1 ? Math.min(3, 30 / total) : 0
  const length = 100 / total - gap
  const spinning = live && active > 0
  return (
    <div className="jv-reactor" data-spinning={spinning} style={{ width: size, height: size }} role="img"
      aria-label={`${active} of ${statuses.length} agents active${live ? '' : ', last known'}`}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle className="jv-reactor-halo" cx="50" cy="50" r="47" />
        <g className="jv-reactor-ticks"><circle cx="50" cy="50" r="46" pathLength={120} /></g>
        <g transform="rotate(-90 50 50)">
          {statuses.map((status, index) => (
            <circle key={index} className="jv-reactor-seg" data-status={status} cx="50" cy="50" r="38" pathLength={100}
              strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-index * (100 / total) - gap / 2} />
          ))}
        </g>
        <g className="jv-reactor-inner"><circle cx="50" cy="50" r="29.5" pathLength={36} /></g>
        <circle className="jv-reactor-core" cx="50" cy="50" r="24" />
      </svg>
      <div className="jv-reactor-readout"><strong>{active}</strong>{size >= 60 && <span>{label}</span>}</div>
    </div>
  )
}

/** Worker → done → sent → lead received. Only evidence lights a step. */
export function DeliveryTrack({ task, showLabels = false }: { task: { status: 'working' | 'done' | 'failed' | 'cancelled'; delivery: 'none' | 'pending' | 'delivered' | 'received' | 'discarded' | 'unknown' }; showLabels?: boolean }) {
  const { steps, caption } = deliverySteps(task)
  const summary = steps.map((step: DeliveryStep) => `${step.label}: ${step.state}`).join(', ')
  return (
    <div className="jv-track" data-labels={showLabels} title={caption} role="img" aria-label={`${summary}. ${caption}`}>
      {steps.map(step => (
        <span key={step.key} className="jv-track-step" data-state={step.state}>
          <i aria-hidden="true" />
          {showLabels && <em>{step.label}</em>}
        </span>
      ))}
    </div>
  )
}

/** Only rendered with real T3 numbers. Kept visually unlike the activity lamp. */
export function ContextMeter({ used, max }: { used: number; max: number }) {
  const percent = Math.min(100, Math.max(0, Math.round((used / max) * 100)))
  const tone = percent >= 90 ? 'high' : percent >= 75 ? 'mid' : 'low'
  return (
    <div className="jv-context" data-tone={tone} role="img" aria-label={`Context ${percent}% used`} title={`${used.toLocaleString()} of ${max.toLocaleString()} tokens used (reported by T3)`}>
      <span className="jv-context-label">CTX</span>
      <span className="jv-context-bar"><i style={{ width: `${percent}%` }} /></span>
      <span className="jv-context-value">{percent}%</span>
    </div>
  )
}
