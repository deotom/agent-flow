'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { SessionInfo } from '@/lib/bridge-types'
import type { SourceHealth, TeamAgentRow, TeamSnapshot, TeamTaskRow, TransportState } from '@/lib/team-types'
import { LEGEND, STATUS_LABEL, ageLabel, buildTeamView, compareTeamTaskRecency, connectionView, deliverySteps, describeActivity, teamTitle, treeGuides, type AttentionItem, type TreeGuide, type ConnectionView, type TeamRow, type TeamScope, type TeamView } from '@/lib/team-model'
import { buildMissionView, type MissionView } from '@/lib/mission-model'
import { formatModelName } from '@/lib/utils'
import type { AnimationMode } from '@/lib/viewer-preferences'
import { AgentLamp, ContextMeter, DeliveryTrack, TeamReactor } from './team-visuals'
import { OfficeView } from '../office/office-view'
import { officeKey } from '@/lib/office-model'
import '../office/office.css'
import './team.css'

export type TeamPane = 'board' | 'graph' | 'office'

interface TeamWorkspaceProps {
  widget: boolean
  sessions: SessionInfo[]
  selectedSessionId: string | null
  onSelectSession: (id: string) => void
  teamSnapshots: Record<string, TeamSnapshot>
  health: SourceHealth | null
  transport: TransportState
  animationMode: AnimationMode
  visible?: boolean
  scope: TeamScope
  onScope: (scope: TeamScope) => void
  pane: TeamPane
  onPane: (pane: TeamPane) => void
  viewerControls?: ReactNode
  renderGraph: (selectedId: string | null, onSelect: (id: string | null) => void, hiddenIds: ReadonlySet<string>, mission: MissionView | undefined) => ReactNode
  /** Prompt bar shown under the board and the graph when the desktop app can send prompts. */
  promptBar?: ReactNode
}

const PROVIDER_NAME: Record<NonNullable<TeamAgentRow['runtime']>, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor' }
const providerName = (runtime: TeamAgentRow['runtime']) => runtime ? PROVIDER_NAME[runtime] : null
const modelName = (agent: TeamAgentRow) => agent.model ? formatModelName(agent.model) : 'Model not reported'
const stamp = (time: number | null) => time ? new Date(time).toLocaleString() : 'Not reported'

function useClock(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function useDismissOnOutside(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, close])
  return root
}

/** Desktop 'All T3 projects' mode: teams come from every project, not one folder. */
const allProjectsScope = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scope') === 'all'

function TeamPicker({ sessions, selectedSessionId, onSelect, snapshots, compact }: { sessions: SessionInfo[]; selectedSessionId: string | null; onSelect: (id: string) => void; snapshots: Record<string, TeamSnapshot>; compact: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useDismissOnOutside(open, () => setOpen(false))
  const selected = sessions.find(session => session.id === selectedSessionId)
  const title = selected ? snapshots[selected.id]?.title || teamTitle(selected.label) : 'Choose a team'
  const allScope = allProjectsScope()
  // Name the project once teams can come from more than one.
  const showProject = allScope || new Set(sessions.map(session => snapshots[session.id]?.project).filter(Boolean)).size > 1
  const selectedProject = selected ? snapshots[selected.id]?.project : null
  const ordered = [...sessions].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.lastActivityTime - a.lastActivityTime)
  return (
    <div ref={root} className="jv-picker">
      <button className="jv-picker-button" aria-expanded={open} aria-haspopup="listbox" aria-label={`Team: ${title}. Choose another team`} title={title} onClick={() => setOpen(value => !value)}>
        {!compact && <span className="jv-eyebrow">T3 team{showProject && selectedProject ? ` · ${selectedProject}` : ''} · {sessions.length} {allScope ? 'across all projects' : 'in this folder'}</span>}
        <span className="jv-picker-title">{title}</span>
        <span className="jv-picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="jv-popover jv-picker-list" role="listbox" aria-label="Teams">
          {ordered.map(session => {
            const team = snapshots[session.id]
            const working = team?.agents.filter(agent => ['running', 'thinking', 'background', 'waiting_approval', 'waiting_input'].includes(agent.status)).length ?? 0
            return (
              <button key={session.id} role="option" aria-selected={session.id === selectedSessionId} className="jv-picker-option" onClick={() => { onSelect(session.id); setOpen(false) }}>
                <span className="jv-dot" data-active={session.status === 'active'} aria-hidden="true" />
                <span className="jv-picker-option-body">
                  <span className="jv-picker-option-title">{team?.title || teamTitle(session.label)}</span>
                  {showProject && team?.project && <span className="jv-picker-option-project">{team.project}</span>}
                  <span className="jv-muted">{session.status === 'active' ? `Active · ${working} working` : 'No active work'} · {team?.agents.length ?? '?'} agents · {ageLabel(team?.updatedAt ?? session.lastActivityTime, Date.now())}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Pipeline({ view, compact }: { view: TeamView; compact: boolean }) {
  const { counts } = view
  const stages = [
    { key: 'working', label: 'Working', value: counts.working, hint: 'Delegated tasks in progress' },
    { key: 'done', label: 'Done', value: counts.done, hint: 'Finished, delivery not yet recorded' },
    { key: 'sent', label: 'Sent', value: counts.sent, hint: 'Delivered, read by the Lead not confirmed' },
    { key: 'received', label: 'Received', value: counts.received, hint: 'A Lead run confirmed receipt' },
  ]
  return (
    <div className="jv-pipeline" data-compact={compact} role="group" aria-label="Delegated task progress">
      {stages.map(stage => (
        <div key={stage.key} className="jv-stage" data-stage={stage.key} data-empty={stage.value === 0} title={stage.hint}>
          <strong>{stage.value}</strong><span>{stage.label}</span>
        </div>
      ))}
    </div>
  )
}

function ConnectionPill({ connection, health, now, compact }: { connection: ConnectionView; health: SourceHealth | null; now: number; compact: boolean }) {
  return (
    <div className="jv-link" data-tone={connection.tone} title={connection.detail} role="status" aria-live="polite">
      <span className="jv-link-dot" aria-hidden="true" />
      <strong>{connection.label}</strong>
      {health && <span className="jv-link-age">{compact ? `checked ${ageLabel(health.lastSuccessAt, now)}` : `Last read ${ageLabel(health.lastSuccessAt, now)}`}</span>}
      {!compact && health?.lastChangeAt && <span className="jv-link-age">Team changed {ageLabel(health.lastChangeAt, now)}</span>}
    </div>
  )
}

function Legend() {
  const [open, setOpen] = useState(false)
  const root = useDismissOnOutside(open, () => setOpen(false))
  return (
    <div ref={root} className="jv-legend">
      <button className="jv-chip-button" aria-label="What the lights mean" aria-expanded={open} title="What the lights mean" onClick={() => setOpen(value => !value)}>?</button>
      {open && (
        <div className="jv-popover jv-legend-panel" role="dialog" aria-label="What the lights mean">
          <h3 className="jv-eyebrow">Status lights</h3>
          <ul>{LEGEND.map(item => <li key={item.status}><AgentLamp status={item.status} size={24} /><span><strong>{STATUS_LABEL[item.status]}</strong><em>{item.meaning}</em></span></li>)}</ul>
          <h3 className="jv-eyebrow">Delivery track</h3>
          <p>Working, Done, Sent, Lead received. A segment lights only when T3 records it. Done alone does not mean the Lead has the result.</p>
          <h3 className="jv-eyebrow">Reactor and CTX</h3>
          <p>Each arc of the reactor is one agent, and it is not a usage gauge. CTX bars appear only when T3 reports real context numbers.</p>
          <p>Lights show the state at the last read. T3 is checked on an interval, so steps between checks are not shown.</p>
        </div>
      )}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="jv-seg" role="group" aria-label={label}>
      {options.map(option => <button key={option.value} aria-pressed={option.value === value} title={option.title} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  )
}

function AttentionPanel({ items, onOpen, onDismiss, limit }: { items: AttentionItem[]; onOpen: (id: string) => void; onDismiss: (id: string) => void; limit: number }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null
  const shown = expanded ? items : items.slice(0, limit)
  return (
    <section className="jv-attention" aria-label="Needs attention">
      {shown.map(item => (
        <div key={item.id} className="jv-alert" data-kind={item.kind}>
          <button className="jv-alert-body" onClick={() => onOpen(item.agentId)} title={`${item.title}: ${item.detail}`}>
            <span className="jv-alert-mark" aria-hidden="true">{item.kind === 'waiting' ? '!' : '×'}</span>
            <span className="jv-alert-text"><strong>{item.detail}</strong><em>{item.title}</em></span>
          </button>
          {item.kind !== 'waiting' && <button className="jv-alert-close" aria-label={`Dismiss: ${item.detail}, ${item.title}`} title="Dismiss until this view is reopened" onClick={() => onDismiss(item.id)}>×</button>}
        </div>
      ))}
      {items.length > limit && <button className="jv-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer' : `+${items.length - limit} more`}</button>}
    </section>
  )
}

const rowDepth = (row: TeamRow, compact: boolean) => compact ? Math.min(row.depth, 2) : Math.min(row.depth, 5)

function AgentRowCard({ row, guides, selected, live, now, compact, onSelect }: { row: TeamRow; guides: TreeGuide[]; selected: boolean; live: boolean; now: number; compact: boolean; onSelect: (id: string) => void }) {
  const { agent, task } = row
  const provider = providerName(agent.runtime)
  const currentTitle = agent.status === 'running' ? agent.activities.at(-1)?.title?.trim() : undefined
  const depth = rowDepth(row, compact)
  return (
    <li className="jv-row-wrap" data-depth={depth} data-status={agent.status} data-live={live} style={{ '--jv-depth': depth } as CSSProperties}>
      {guides.map((guide, index) => guide && <span key={index} className="jv-guide" data-guide={guide} aria-hidden="true" style={{ '--jv-level': index + 1 } as CSSProperties} />)}
      {depth > 0 && live && (agent.status === 'running' || agent.status === 'thinking') && <span className="jv-packet" aria-hidden="true" />}
      <button className="jv-row" data-selected={selected} data-status={agent.status} data-role={agent.role} data-live={live} aria-pressed={selected} onClick={() => onSelect(agent.id)}
        title={`${agent.name}${agent.task ? `\n\n${agent.task.slice(0, 300)}` : ''}`}>
        <span className="jv-brackets" aria-hidden="true" />
        <AgentLamp status={agent.status} live={live} size={compact ? 26 : 34} />
        <span className="jv-row-main">
          <span className="jv-row-head">
            <span className="jv-role" data-role={agent.role}>{agent.role === 'lead' ? 'Lead' : row.depth > 1 ? 'Sub-worker' : 'Worker'}</span>
            <span className="jv-row-name">{agent.name}</span>
          </span>
          <span className="jv-row-status" data-status={agent.status}>
            {!live && <span className="jv-lastknown">Last known: </span>}{row.statusText}{currentTitle && <span className="jv-muted"> · {currentTitle}</span>}
          </span>
          <span className="jv-row-meta">
            {provider && <span className="jv-provider" data-runtime={agent.runtime}>{provider}</span>}
            <span>{modelName(agent)}</span>
            {!compact && agent.updatedAt && <span className="jv-muted">Updated {ageLabel(agent.updatedAt, now)}</span>}
            {row.orphan && <span className="jv-warn-text">Parent not in this team</span>}
          </span>
        </span>
        <span className="jv-row-side">
          {task && <DeliveryTrack task={task} />}
          {!compact && agent.context && <ContextMeter used={agent.context.used} max={agent.context.max} />}
        </span>
      </button>
    </li>
  )
}

function TaskEvidence({ task }: { task: TeamTaskRow }) {
  const { caption } = deliverySteps(task)
  return (
    <section className="jv-section" aria-label="Delegation and delivery">
      <h3 className="jv-eyebrow">Delegation and delivery</h3>
      <DeliveryTrack task={task} showLabels />
      <p className="jv-caption">{caption}</p>
      <dl className="jv-facts">
        <dt>Started</dt><dd>{stamp(task.startedAt)}</dd>
        <dt>Finished</dt><dd>{stamp(task.completedAt)}</dd>
      </dl>
    </section>
  )
}

function DetailPanel({ snapshot, agentId, live, now, onSelect, onClose }: { snapshot: TeamSnapshot; agentId: string; live: boolean; now: number; onSelect: (id: string) => void; onClose: () => void }) {
  const agent = snapshot.agents.find(row => row.id === agentId)
  if (!agent) return null
  const task = snapshot.tasks.filter(row => row.childId === agent.id).sort(compareTeamTaskRecency)[0]
  const parent = agent.parentId ? snapshot.agents.find(row => row.id === agent.parentId) : undefined
  const children = snapshot.agents.filter(row => row.parentId === agent.id)
  const prompt = task?.task ?? agent.task
  return (
    <aside className="jv-detail" aria-label={`Details for ${agent.name}`}>
      <span className="jv-brackets" aria-hidden="true" />
      <header className="jv-detail-head">
        <AgentLamp status={agent.status} live={live} size={42} />
        <div className="jv-detail-title">
          <span className="jv-eyebrow">{agent.role === 'lead' ? 'Lead' : 'Worker'} · {live ? STATUS_LABEL[agent.status] : `Last known: ${STATUS_LABEL[agent.status]}`}</span>
          <h2>{agent.name}</h2>
        </div>
        <button className="jv-chip-button" aria-label="Close details" onClick={onClose}>×</button>
      </header>
      <div className="jv-detail-scroll">
        <section className="jv-section">
          <dl className="jv-facts">
            <dt>Provider</dt><dd>{providerName(agent.runtime) ?? 'Not reported'}</dd>
            <dt>Model</dt><dd>{agent.model ?? 'Not reported'}</dd>
            <dt>Reports to</dt><dd>{parent ? <button className="jv-link-button" onClick={() => onSelect(parent.id)}>{parent.name}</button> : agent.role === 'lead' ? 'Top of team' : 'Not in this team'}</dd>
            <dt>Started</dt><dd>{stamp(agent.startedAt)}</dd>
            <dt>Last update</dt><dd>{agent.updatedAt ? ageLabel(agent.updatedAt, now) : 'Not reported'}</dd>
            <dt>Tool calls</dt><dd>{agent.toolCallCount}</dd>
            <dt>Context</dt><dd>{agent.context ? <ContextMeter used={agent.context.used} max={agent.context.max} /> : 'Not reported by T3'}</dd>
          </dl>
        </section>
        <section className="jv-section" aria-label="Current activity">
          <h3 className="jv-eyebrow">Now</h3>
          {agent.activities.length ? (
            <ul className="jv-activity">
              {agent.activities.map(activity => {
                const { label, detail } = describeActivity(activity)
                return <li key={activity.id}><strong>{label}</strong>{detail && <span>{detail}</span>}{activity.startedAt && <em>{ageLabel(activity.startedAt, now)}</em>}</li>
              })}
            </ul>
          ) : <p className="jv-caption">{agent.status === 'thinking' ? 'Run in progress, no tool in use at the last read.' : 'No tool in progress at the last read.'}</p>}
          {agent.status === 'background' && <p className="jv-caption">The run ended. T3 is still waiting on these background commands and reports back when they finish.</p>}
          {agent.requestKind && <p className="jv-caption jv-warn-text">Open request in T3: {agent.requestKind.replace(/[_-]+/g, ' ')}</p>}
        </section>
        {task && <TaskEvidence task={task} />}
        {children.length > 0 && (
          <section className="jv-section" aria-label="Workers">
            <h3 className="jv-eyebrow">Delegated to ({children.length})</h3>
            <ul className="jv-children">
              {children.map(child => <li key={child.id}><button className="jv-link-button" onClick={() => onSelect(child.id)}><AgentLamp status={child.status} live={live} size={18} /><span>{child.name}</span></button></li>)}
            </ul>
          </section>
        )}
        {prompt && <details className="jv-section jv-expand"><summary className="jv-eyebrow">Task</summary><p>{prompt}</p></details>}
        {task?.result && <details className="jv-section jv-expand" open><summary className="jv-eyebrow">Result</summary><p>{task.result}</p></details>}
      </div>
    </aside>
  )
}

export function TeamWorkspace({ widget, sessions, selectedSessionId, onSelectSession, teamSnapshots, health, transport, animationMode, visible = true, scope, onScope, pane, onPane, viewerControls, renderGraph, promptBar }: TeamWorkspaceProps) {
  const now = useClock(1000)
  const snapshot = selectedSessionId ? teamSnapshots[selectedSessionId] ?? null : null
  const connection = connectionView(transport, health, now)
  const live = connection.live
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const view = useMemo(() => snapshot ? buildTeamView(snapshot, scope, dismissed) : null, [snapshot, scope, dismissed])
  const guides = useMemo(() => view ? treeGuides(view.rows.map(row => rowDepth(row, widget))) : [], [view, widget])
  // The graph shows the same agents as the board, so a scope rule holds in both views.
  const hiddenIds = useMemo<ReadonlySet<string>>(() => {
    if (!snapshot || !view) return new Set()
    const shown = new Set(view.rows.map(row => row.agent.id))
    return new Set(snapshot.agents.filter(agent => !shown.has(agent.id)).map(agent => agent.id))
  }, [snapshot, view])
  // Settled sub-teams fold into their sub-lead; selecting a folded sub-lead unfolds it.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  // Selection and reading position belong to each team, and survive poll refreshes.
  const selections = useRef(new Map<string, string | null>())
  const scrolls = useRef(new Map<string, number>())
  const list = useRef<HTMLDivElement>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [officeSelection, setOfficeSelection] = useState<{ sessionId: string; agentId: string } | null>(null)
  const office = pane === 'office'
  const officeSnapshots = useMemo(() => sessions.flatMap(session => teamSnapshots[session.id] ? [teamSnapshots[session.id]] : []), [sessions, teamSnapshots])
  const mission = useMemo(() => {
    if (!snapshot) return undefined
    const visible = new Set(snapshot.agents.filter(agent => !hiddenIds.has(agent.id)).map(agent => agent.id))
    // Never fold away the selected agent: its sub-teams stay open.
    const open = new Set(expanded)
    const parents = new Map(snapshot.agents.map(agent => [agent.id, agent.parentId]))
    for (let id = selectedAgentId ? parents.get(selectedAgentId) : null; id && !open.has(id); id = parents.get(id)) open.add(id)
    return buildMissionView(snapshot, visible, open) ?? undefined
  }, [snapshot, hiddenIds, expanded, selectedAgentId])
  const select = (id: string | null) => {
    if (id && mission?.nodes.get(id)?.collapsed) setExpanded(previous => new Set(previous).add(id))
    setSelectedAgentId(id)
    if (selectedSessionId) selections.current.set(selectedSessionId, id)
  }
  useLayoutEffect(() => {
    setExpanded(new Set())
    setSelectedAgentId(selectedSessionId ? selections.current.get(selectedSessionId) ?? null : null)
    if (list.current) list.current.scrollTop = selectedSessionId ? scrolls.current.get(selectedSessionId) ?? 0 : 0
  }, [selectedSessionId])
  const detailSnapshot = office ? officeSelection ? teamSnapshots[officeSelection.sessionId] : null : snapshot
  const detailAgentId = office ? officeSelection?.agentId : selectedAgentId
  const selectedExists = Boolean(detailAgentId && detailSnapshot?.agents.some(agent => agent.id === detailAgentId))
  const dismiss = (id: string) => setDismissed(previous => new Set(previous).add(id))
  const statuses = office ? officeSnapshots.flatMap(team => team.agents.map(agent => agent.status)) : snapshot?.agents.map(agent => agent.status) ?? []
  const showGraph = pane === 'graph' && Boolean(snapshot)

  return (
    <div className="jv-root" data-widget={widget} data-motion={animationMode} data-live={live}>
      <div className="jv-backdrop" aria-hidden="true" />
      <header className={office ? "jv-bar of-header" : "jv-bar"}>
        {!office && <span className="jv-header-sweep" aria-hidden="true" />}
        {!office && <TeamReactor statuses={statuses} active={office ? statuses.filter(status => ['running', 'thinking', 'background', 'waiting_approval', 'waiting_input'].includes(status)).length : view?.counts.active ?? 0} live={live} size={widget ? 46 : 76} />}
        <div className="jv-bar-main">
          <div className="jv-bar-row">
            {office ? <div className="jv-picker"><span className="jv-picker-title">Agent Office · {officeSnapshots.length} teams</span></div> : <TeamPicker sessions={sessions} selectedSessionId={selectedSessionId} onSelect={onSelectSession} snapshots={teamSnapshots} compact={widget} />}
            {widget && !office && <Legend />}
          </div>
          {!office && view && <Pipeline view={view} compact={widget} />}
          {widget && <Segmented label="View" value={pane} onChange={onPane} options={[{ value: 'board', label: 'Board' }, { value: 'graph', label: 'Graph' }, { value: 'office', label: 'Office' }]} />}
        </div>
        {!widget && (
          <div className="jv-bar-tools">
            <div className="jv-bar-row jv-end">
              {!office && <Segmented label="Which agents to show" value={scope} onChange={onScope} options={[
                { value: 'active', label: office ? 'Current work' : 'Active team', title: 'Current work and results not yet sent' },
                { value: 'session', label: office ? 'All history' : 'Whole session', title: office ? 'Include finished agents across loaded teams' : 'Every agent in this team, including finished work' },
              ]} />}
              <Segmented label="View" value={pane} onChange={onPane} options={[{ value: 'board', label: 'Board' }, { value: 'graph', label: 'Graph' }, { value: 'office', label: 'Office' }]} />
              {!office && <Legend />}
              {viewerControls}
            </div>
            {!office && <ConnectionPill connection={connection} health={health} now={now} compact={false} />}
          </div>
        )}
      </header>

      {!office && connection.tone !== 'ok' && <div className="jv-banner" data-tone={connection.tone} role="status">
        <strong>{connection.label}</strong> {connection.detail}{snapshot && connection.tone === 'down' ? ' Showing the last known team.' : ''}
      </div>}

      {!office && view && <AttentionPanel items={view.attention} onOpen={select} onDismiss={dismiss} limit={widget ? 1 : 3} />}

      <main className="jv-main" data-detail={selectedExists&&!office}>
        {office ? <OfficeView snapshots={officeSnapshots} scope={scope} selectedKey={officeSelection ? officeKey(officeSelection.sessionId, officeSelection.agentId) : null}
          onSelect={(sessionId, agentId) => setOfficeSelection(previous => previous?.sessionId === sessionId && previous.agentId === agentId ? null : { sessionId, agentId })}
          onOpenTeam={(sessionId, agentId) => { selections.current.set(sessionId, agentId); setSelectedAgentId(agentId); onSelectSession(sessionId); onPane('board') }}
          live={live} connection={connection} visible={visible} animationMode={animationMode} now={now} /> : showGraph ? <div className="jv-graph">{renderGraph(selectedAgentId, select, hiddenIds, mission)}</div> : (
          <div className="jv-board" ref={list} onScroll={event => { if (selectedSessionId) scrolls.current.set(selectedSessionId, event.currentTarget.scrollTop) }}>
            {view ? (
              <>
                <ol className="jv-tree" aria-label="Team members">
                  {view.rows.map((row, index) => <AgentRowCard key={row.agent.id} row={row} guides={guides[index]} selected={row.agent.id === selectedAgentId} live={live} now={now} compact={widget} onSelect={id => select(id === selectedAgentId ? null : id)} />)}
                </ol>
                {scope === 'active' && view.hiddenFinished > 0 && (
                  <button className="jv-more" onClick={() => onScope('session')}>{view.hiddenFinished} finished hidden · Show whole session</button>
                )}
                {scope === 'session' && widget && <button className="jv-more" onClick={() => onScope('active')}>Show active team only</button>}
              </>
            ) : <EmptyState connection={connection} hasSessions={sessions.length > 0} />}
          </div>
        )}
        {!office && selectedExists && detailSnapshot && <DetailPanel snapshot={detailSnapshot} agentId={detailAgentId!} live={live} now={now}
          onSelect={select}
          onClose={() => select(null)} />}
      </main>

      {promptBar}
      {widget && <footer className="jv-foot"><ConnectionPill connection={connection} health={health} now={now} compact /></footer>}
    </div>
  )
}

function EmptyState({ connection, hasSessions }: { connection: ConnectionView; hasSessions: boolean }) {
  return (
    <div className="jv-empty">
      <TeamReactor statuses={[]} active={0} live={false} size={84} label="Teams" />
      {connection.tone === 'down' ? <><h2>T3 data is unavailable</h2><p>{connection.detail}</p></>
        : hasSessions ? <><h2>Loading team</h2><p>Waiting for the next read of T3 data.</p></>
        : <><h2>{allProjectsScope() ? 'No T3 teams yet' : 'No T3 teams in this folder'}</h2><p>{allProjectsScope() ? 'Teams appear here when any T3 project has threads.' : 'Teams appear here when a T3 project in this folder has threads.'} This view only reads T3 and never starts work.</p></>}
    </div>
  )
}
