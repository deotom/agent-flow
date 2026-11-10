/**
 * Mission Map: the T3 team graph as a stable radial tree with delivery-stage links.
 *
 * Pure presentation over TeamSnapshot. Every stage comes from T3 evidence
 * (agent status, task status, completion delivery); nothing is estimated.
 * The canvas draws this view; it does not decide semantics itself.
 */
import type { TeamActivity, TeamAgentRow, TeamSnapshot, TeamTaskRow } from './team-types'

/** Delivery stage of the link from a parent (delegator) to a child. */
export type MissionStage =
  | 'working'    // child is running or thinking
  | 'waiting'    // child has an open approval/input request
  | 'queued'     // child done, result not delivered yet (none/pending)
  | 'sent'       // delivered to the parent, receipt not confirmed
  | 'received'   // parent run consumed the result
  | 'failed'     // child failed
  | 'discarded'  // T3 disposed of the result
  | 'cancelled'  // stopped on purpose
  | 'unknown'    // no task record, or a delivery state T3 did not explain

export type MissionAlert = 'waiting' | 'failed' | null

export interface MissionLink {
  from: string
  to: string
  stage: MissionStage
  /** Lights the whole path from the lead down to a descendant that needs attention. */
  alert: MissionAlert
}

/** What the agent is doing right now, from T3 activity items; drives the node's effect. */
export type MissionActivity = 'thinking' | 'command' | 'edit' | 'search' | 'tool' | 'delegate' | 'compacting' | null

export interface MissionNode {
  id: string
  activity: MissionActivity
  /** Snapshot facts so the canvas can draw a node the live simulation already dropped. */
  name: string
  parentId: string | null
  runtime: TeamAgentRow['runtime']
  model: string | null
  status: TeamAgentRow['status']
  context: TeamAgentRow['context']
  role: 'lead' | 'sublead' | 'worker'
  depth: number
  x: number
  y: number
  /** Full code plate for lead, sub-leads and nodes needing attention; compact label otherwise. */
  plate: 'full' | 'compact'
  /** Short code-style glyph for the node core. */
  glyph: string
  attention: MissionAlert
  /** Sub-team folded into this node because all of its work is settled. */
  collapsed: boolean
  hiddenChildren: number
  summary: { children: number; working: number; waiting: number; failed: number }
  /** e.g. "codex::gpt-6.1-sol"; null when T3 reports neither. */
  modelLine: string | null
  /** Code-style status, e.g. "$ running a command" or "sent // await ack". */
  statusLine: string
}

export interface MissionView {
  nodes: Map<string, MissionNode>
  links: MissionLink[]
  /** Non-sensitive team counters for the decorative data ring around the lead. */
  dataRing: string
}

/** Code-style tag drawn on each link. */
export const STAGE_TAG: Record<MissionStage, { word: string; rest: string }> = {
  working: { word: 'dispatch', rest: '(task)' },
  waiting: { word: 'await', rest: ' you()' },
  queued: { word: 'return', rest: ' // waiting' },
  sent: { word: 'send', rest: '(result)' },
  received: { word: 'ack', rest: ' ✓' },
  failed: { word: 'throw', rest: ' Err' },
  discarded: { word: 'drop', rest: ' // discarded' },
  cancelled: { word: 'cancel', rest: '()' },
  unknown: { word: '//', rest: ' no record' },
}

const LEVEL_1 = 300
const LEVEL_STEP = 240
const MIN_ARC = 210
const MAX_CHILD_SPAN = (150 * Math.PI) / 180

/** A question for the user outranks a failure, so the path to it always lights. */
const strongest = (a: MissionAlert, b: MissionAlert): MissionAlert => a === 'waiting' || b === 'waiting' ? 'waiting' : a ?? b
const isWaiting = (status: TeamAgentRow['status']) => status === 'waiting_approval' || status === 'waiting_input'
const isActive = (status: TeamAgentRow['status']) => status === 'running' || status === 'thinking' || status === 'background' || isWaiting(status)
const reachedParent = (task: TeamTaskRow | undefined) => task?.delivery === 'delivered' || task?.delivery === 'received'

export function missionStage(agent: TeamAgentRow, task: TeamTaskRow | undefined): MissionStage {
  if (isWaiting(agent.status)) return 'waiting'
  if (agent.status === 'running' || agent.status === 'thinking' || agent.status === 'background') return 'working'
  if (agent.status === 'cancelled' || task?.status === 'cancelled') return 'cancelled'
  if (agent.status === 'failed' || task?.status === 'failed') return 'failed'
  if (!task) return 'unknown'
  if (task.status === 'working') return 'working'
  switch (task.delivery) {
    case 'none': case 'pending': return 'queued'
    case 'delivered': return 'sent'
    case 'received': return 'received'
    case 'discarded': return 'discarded'
    default: return 'unknown'
  }
}

export function missionActivity(agent: TeamAgentRow): MissionActivity {
  if (agent.status === 'thinking') return 'thinking'
  if (agent.status === 'background') return 'command'
  if (agent.status !== 'running') return null
  const activity = agent.activities.at(-1)
  const kind = `${activity?.toolName ?? ''} ${activity?.type ?? ''}`.toLowerCase()
  if (/compaction/.test(kind)) return 'compacting'
  if (/delegate|spawn|subagent/.test(kind)) return 'delegate'
  if (/file_change|edit|write|patch/.test(kind)) return 'edit'
  if (/web_search|search|fetch/.test(kind)) return 'search'
  if (/command|exec|shell|bash|powershell|stdin/.test(kind)) return 'command'
  return 'tool'
}

function activityGlyph(activity: TeamActivity | undefined): string {
  const kind = `${activity?.toolName ?? ''} ${activity?.type ?? ''}`.toLowerCase()
  if (/compaction/.test(kind)) return '⟳'
  if (/file_change|edit|write|patch/.test(kind)) return '</>'
  if (/web_search|search|fetch/.test(kind)) return '⌕'
  if (/mcp|dynamic_tool/.test(kind)) return 'fn'
  return '>_'
}

function statusLine(agent: TeamAgentRow, stage: MissionStage, role: MissionNode['role']): string {
  const activity = agent.activities.at(-1)
  if (activity?.type === 'compaction') return '› compacting context'
  if (agent.status === 'running') return `$ ${activityLabel(activity)}`
  if (agent.status === 'thinking') return '› thinking'
  if (agent.status === 'background') return `await bg(${agent.activities.length || '…'}) // commands`
  if (agent.status === 'waiting_approval') return 'await you() // approval'
  if (agent.status === 'waiting_input') return 'await you() // answer'
  if (role === 'lead') return agent.status === 'idle' ? '› idle' : `› ${agent.status}`
  switch (stage) {
    case 'queued': return 'done // waiting for lead'
    case 'sent': return 'sent // await ack'
    case 'received': return 'done // acked'
    case 'failed': return 'throw // failed'
    case 'discarded': return 'done // discarded'
    case 'cancelled': return 'cancelled'
    default: return agent.status === 'done' ? 'done // no delivery record' : `› ${agent.status}`
  }
}

function activityLabel(activity: TeamActivity | undefined): string {
  const kind = `${activity?.toolName ?? ''} ${activity?.type ?? ''}`.toLowerCase()
  if (/file_change|edit|write|patch/.test(kind)) return 'editing files'
  if (/web_search|search/.test(kind)) return 'searching the web'
  if (/delegate|spawn|subagent/.test(kind)) return 'delegating'
  if (/command|exec|shell|bash|powershell/.test(kind)) return 'running a command'
  return activity?.toolName ? `using ${activity.toolName.replace(/^.*__/, '').replace(/[_-]+/g, ' ')}` : 'using a tool'
}

function modelLine(agent: TeamAgentRow): string | null {
  const model = agent.model?.trim().toLowerCase().replace(/^claude-/, '').replace(/\s+/g, '-')
  if (!agent.runtime && !model) return null
  return `${agent.runtime ?? 'agent'}::${model || 'unknown'}`
}

/**
 * @param visible IDs the current scope shows (Active team or Whole session). The lead is always kept.
 * @param expanded Sub-leads the user unfolded; settled sub-teams fold by default.
 */
export function buildMissionView(snapshot: TeamSnapshot, visible?: ReadonlySet<string>, expanded: ReadonlySet<string> = new Set()): MissionView | null {
  const lead = snapshot.agents.find(agent => agent.role === 'lead') ?? snapshot.agents.find(agent => !agent.parentId)
  if (!lead) return null
  const byId = new Map(snapshot.agents.map(agent => [agent.id, agent]))
  const latestTask = new Map<string, TeamTaskRow>()
  for (const task of snapshot.tasks) {
    const known = latestTask.get(task.childId)
    if (!known || (task.updatedAt ?? 0) >= (known.updatedAt ?? 0)) latestTask.set(task.childId, task)
  }
  // A shown agent keeps its delegation chain, so the path from the lead stays drawable.
  let shown: ReadonlySet<string> | undefined = visible
  if (visible) {
    const withChain = new Set(visible)
    for (const id of visible) {
      for (let parent = byId.get(id)?.parentId; parent && !withChain.has(parent); parent = byId.get(parent)?.parentId) withChain.add(parent)
    }
    shown = withChain
  }
  const children = new Map<string, TeamAgentRow[]>()
  for (const agent of snapshot.agents) {
    if (agent === lead || !agent.parentId || !byId.has(agent.parentId)) continue
    if (shown && !shown.has(agent.id)) continue
    const list = children.get(agent.parentId) ?? []
    list.push(agent)
    children.set(agent.parentId, list)
  }
  // Stable order: start time, then id, so status changes never reshuffle positions.
  for (const list of children.values()) list.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id.localeCompare(b.id))

  const stage = new Map<string, MissionStage>()
  for (const agent of snapshot.agents) if (agent !== lead) stage.set(agent.id, missionStage(agent, latestTask.get(agent.id)))
  const needs = (agent: TeamAgentRow): MissionAlert =>
    isWaiting(agent.status) ? 'waiting'
      : stage.get(agent.id) === 'failed' && !reachedParent(latestTask.get(agent.id)) ? 'failed' : null

  // Subtree facts, bottom-up.
  const settled = new Map<string, boolean>()
  const summary = new Map<string, MissionNode['summary']>()
  const alertBelow = new Map<string, MissionAlert>()
  const visit = (agent: TeamAgentRow): void => {
    const kids = children.get(agent.id) ?? []
    const sum = { children: 0, working: 0, waiting: 0, failed: 0 }
    let calm = !isActive(agent.status) && needs(agent) === null && stage.get(agent.id) !== 'queued'
    let alert: MissionAlert = null
    for (const kid of kids) {
      visit(kid)
      const kidSum = summary.get(kid.id)!
      const kidNeeds = needs(kid)
      sum.children += 1 + kidSum.children
      sum.working += (stage.get(kid.id) === 'working' ? 1 : 0) + kidSum.working
      sum.waiting += (kidNeeds === 'waiting' ? 1 : 0) + kidSum.waiting
      sum.failed += (kidNeeds === 'failed' ? 1 : 0) + kidSum.failed
      calm &&= settled.get(kid.id)! && stage.get(kid.id) !== 'queued'
      const below = strongest(kidNeeds, alertBelow.get(kid.id) ?? null)
      alert = strongest(alert, below)
    }
    settled.set(agent.id, calm)
    summary.set(agent.id, sum)
    alertBelow.set(agent.id, alert)
  }
  visit(lead)

  const nodes = new Map<string, MissionNode>()
  const links: MissionLink[] = []
  let maxDepth = 0
  const place = (agent: TeamAgentRow, depth: number, x: number, y: number, angle: number, span: number): void => {
    maxDepth = Math.max(maxDepth, depth)
    const kids = children.get(agent.id) ?? []
    const role: MissionNode['role'] = agent === lead ? 'lead' : kids.length ? 'sublead' : 'worker'
    const collapsed = role === 'sublead' && settled.get(agent.id)! && !expanded.has(agent.id)
    const own = needs(agent)
    const nodeStage = stage.get(agent.id) ?? 'working'
    nodes.set(agent.id, {
      id: agent.id, activity: missionActivity(agent), name: agent.name, parentId: agent === lead ? null : agent.parentId, runtime: agent.runtime, model: agent.model,
      status: agent.status, context: agent.context, role, depth, x, y,
      plate: role !== 'worker' || own ? 'full' : 'compact',
      glyph: role === 'lead' ? '{ }' : own === 'waiting' ? '?' : own === 'failed' ? '!'
        : role === 'sublead' ? '⑂' : nodeStage === 'working' ? (agent.status === 'thinking' ? '…' : activityGlyph(agent.activities.at(-1)))
          : nodeStage === 'queued' ? 'ok' : nodeStage === 'sent' ? '{…}' : nodeStage === 'received' ? '✓'
            : nodeStage === 'cancelled' || nodeStage === 'discarded' ? '⊘' : nodeStage === 'failed' ? '!' : '·',
      attention: own, collapsed, hiddenChildren: collapsed ? summary.get(agent.id)!.children : 0,
      summary: summary.get(agent.id)!, modelLine: modelLine(agent), statusLine: statusLine(agent, nodeStage, role),
    })
    if (collapsed || !kids.length) return
    // Weight sectors by visible subtree size so busy branches get room.
    const weight = (kid: TeamAgentRow) => 1 + (expanded.has(kid.id) || !settled.get(kid.id) ? summary.get(kid.id)!.children : 0)
    const total = kids.reduce((sum, kid) => sum + weight(kid), 0)
    const childSpan = depth === 0 ? span : Math.min(span, MAX_CHILD_SPAN)
    // Grow the ring until siblings have at least MIN_ARC of arc each.
    const radius = Math.max(depth === 0 ? LEVEL_1 : LEVEL_STEP, (kids.length * MIN_ARC) / childSpan)
    let cursor = angle - childSpan / 2
    for (const kid of kids) {
      const share = (childSpan * weight(kid)) / total
      const mid = cursor + share / 2
      cursor += share
      const cx = x + Math.cos(mid) * radius
      const cy = y + Math.sin(mid) * radius
      const kidNeeds = needs(kid)
      links.push({ from: agent.id, to: kid.id, stage: stage.get(kid.id)!, alert: strongest(kidNeeds, alertBelow.get(kid.id) ?? null) })
      place(kid, depth + 1, cx, cy, mid, share)
    }
  }
  // Sectors start at the left: one worker sits to the right, more fan clockwise from the upper left.
  place(lead, 0, 0, 0, 0, Math.PI * 2)

  const tools = snapshot.agents.reduce((sum, agent) => sum + agent.toolCallCount, 0)
  return { nodes, links, dataRing: `agents:${nodes.size} · tools:${tools} · depth:${maxDepth} · ` }
}
