/**
 * Pure presentation model for the T3 team HUD. It only words and arranges
 * evidence from team-types.ts: nothing here estimates a missing value or
 * concludes that work is stuck from elapsed time.
 */
import type { SourceHealth, TeamActivity, TeamAgentRow, TeamAgentStatus, TeamDelivery, TeamSnapshot, TeamTaskRow, TransportState } from './team-types'

export type TeamScope = 'active' | 'session'

const ACTIVITY_BY_TYPE: Record<string, string> = {
  command_execution: 'Running a command',
  file_change: 'Editing files',
  web_search: 'Searching the web',
  subagent: 'Delegating to a worker',
  reasoning: 'Thinking',
}
const ACTIVITY_BY_TOOL: Record<string, string> = {
  bash: 'Running a command', powershell: 'Running a command', shell: 'Running a command', exec: 'Running a command', exec_command: 'Running a command', write_stdin: 'Running a command', command_execution: 'Running a command',
  read: 'Reading files', notebookread: 'Reading files', glob: 'Finding files', ls: 'Finding files',
  grep: 'Searching code', search: 'Searching code',
  edit: 'Editing files', multiedit: 'Editing files', write: 'Editing files', notebookedit: 'Editing files', apply_patch: 'Editing files',
  webfetch: 'Reading a web page', websearch: 'Searching the web', web_search: 'Searching the web',
  agent: 'Delegating to a worker', task: 'Delegating to a worker', delegate_task: 'Delegating to a worker',
  toolsearch: 'Loading tools', todowrite: 'Updating its task list',
  task_status: 'Checking a worker', t3_thread_read: 'Reading another thread', orchestrator_capabilities: 'Checking available workers',
}

function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words.length > 40 ? `${words.slice(0, 39)}…` : words
}

/** Server-qualified names look like mcp__server__tool or server.tool. */
function toolBaseName(tool: string): string {
  const parts = tool.split(/__|\./).filter(Boolean)
  return parts.at(-1) ?? tool
}

/** Plain wording for a raw T3 item type or tool name. Unknown names stay honest. */
export function plainToolLabel(tool: string | null | undefined, type?: string | null): string {
  if (tool) {
    const base = toolBaseName(tool)
    const known = ACTIVITY_BY_TOOL[base.toLowerCase()] ?? ACTIVITY_BY_TYPE[base.toLowerCase()]
    if (known) return known
    const words = humanize(base)
    if (words) return `Using ${words}`
  }
  return (type && ACTIVITY_BY_TYPE[type]) || 'Using a tool'
}

export function describeActivity(activity: TeamActivity): { label: string; detail: string | null } {
  return { label: plainToolLabel(activity.toolName, activity.type), detail: activity.title?.trim() || null }
}

export const STATUS_LABEL: Record<TeamAgentStatus, string> = {
  running: 'Running', thinking: 'Thinking', waiting_approval: 'Needs approval', waiting_input: 'Needs your answer',
  done: 'Done', failed: 'Failed', cancelled: 'Cancelled', idle: 'Idle',
}

export const LEGEND: { status: TeamAgentStatus; meaning: string }[] = [
  { status: 'running', meaning: 'A tool is in progress' },
  { status: 'thinking', meaning: 'Run is in progress, no tool in use' },
  { status: 'waiting_approval', meaning: 'T3 has an open approval request' },
  { status: 'waiting_input', meaning: 'T3 has an open question' },
  { status: 'done', meaning: 'Finished successfully' },
  { status: 'failed', meaning: 'Ended with an error' },
  { status: 'cancelled', meaning: 'Stopped before finishing' },
  { status: 'idle', meaning: 'Lead has no run in progress' },
]

const isWaiting = (status: TeamAgentStatus) => status === 'waiting_approval' || status === 'waiting_input'
export const isWorking = (status: TeamAgentStatus) => status === 'running' || status === 'thinking'
export const isTerminal = (status: TeamAgentStatus) => status === 'done' || status === 'failed' || status === 'cancelled'

export function statusText(agent: TeamAgentRow, workingChildren = 0): string {
  if (agent.status === 'running') {
    const current = agent.activities.at(-1)
    return current ? describeActivity(current).label : 'Using a tool'
  }
  if (agent.status === 'idle' && workingChildren > 0) return `Idle · ${workingChildren} ${workingChildren === 1 ? 'worker' : 'workers'} still working`
  return STATUS_LABEL[agent.status]
}

export type StepState = 'done' | 'active' | 'pending' | 'failed'
export interface DeliveryStep { key: 'working' | 'done' | 'sent' | 'received'; label: string; state: StepState }

/** Each step lights only on evidence. Done never implies the lead has the result. */
export function deliverySteps(task: Pick<TeamTaskRow, 'status' | 'delivery'>): { steps: DeliveryStep[]; caption: string } {
  const step = (key: DeliveryStep['key'], label: string, state: StepState): DeliveryStep => ({ key, label, state })
  const { status, delivery } = task
  const stopped = status === 'failed' || status === 'cancelled'
  const working = step('working', 'Working', status === 'working' ? 'active' : stopped ? 'failed' : 'done')
  const done = step('done', stopped ? (status === 'failed' ? 'Failed' : 'Cancelled') : 'Done', status === 'working' ? 'pending' : stopped ? 'failed' : 'done')
  const sentState: StepState = delivery === 'delivered' || delivery === 'received' ? 'done' : delivery === 'discarded' ? 'failed'
    : status !== 'working' && delivery === 'pending' ? 'active' : 'pending'
  const steps = [working, done, step('sent', 'Sent', sentState), step('received', 'Lead received', delivery === 'received' ? 'done' : 'pending')]
  const lead = stopped ? (status === 'failed' ? 'Worker failed. ' : 'Worker was cancelled. ') : ''
  if (status === 'working') return { steps, caption: 'Worker is still working.' }
  const captions: Record<TeamDelivery, string> = {
    none: 'T3 has no delivery record yet.',
    pending: 'Result is queued. It has not been delivered yet.',
    delivered: 'Sent to the Lead. T3 has not confirmed the Lead read it.',
    received: 'T3 confirms a Lead run received the result.',
    discarded: 'T3 discarded this result. The Lead will not get it.',
    unknown: 'T3 reported a delivery state this version does not recognize.',
  }
  return { steps, caption: lead + captions[delivery] }
}

export interface PipelineCounts { working: number; done: number; sent: number; received: number }
export interface TeamCounts extends PipelineCounts { needsYou: number; issues: number; agents: number; active: number }
export interface AttentionItem { id: string; agentId: string; kind: 'waiting' | 'failed' | 'discarded' | 'unknown'; title: string; detail: string }
export interface TeamRow { agent: TeamAgentRow; task: TeamTaskRow | null; depth: number; statusText: string; parentName: string | null; workingChildren: number; orphan: boolean }
export interface TeamView { rows: TeamRow[]; attention: AttentionItem[]; counts: TeamCounts; hiddenFinished: number; lead: TeamAgentRow | null }

function latestTaskByChild(tasks: TeamTaskRow[]): Map<string, TeamTaskRow> {
  const latest = new Map<string, TeamTaskRow>()
  for (const task of tasks) {
    const known = latest.get(task.childId)
    if (!known || (task.updatedAt ?? 0) >= (known.updatedAt ?? 0)) latest.set(task.childId, task)
  }
  return latest
}

/** Open work: finished rows drop out so old work cannot bury current work. */
function isOpen(agent: TeamAgentRow, task: TeamTaskRow | undefined): boolean {
  if (agent.role === 'lead' || !isTerminal(agent.status)) return true
  // A cancelled worker was stopped on purpose; it is history, not open work.
  if (agent.status === 'cancelled') return false
  if (agent.status !== 'done') return task?.delivery !== 'received'
  return !task || task.delivery === 'none' || task.delivery === 'pending' || task.delivery === 'unknown'
}

function urgency(agent: TeamAgentRow, task: TeamTaskRow | undefined): number {
  if (isWaiting(agent.status)) return 0
  if (agent.status === 'failed') return 1
  if (isWorking(agent.status)) return 2
  return isOpen(agent, task) ? 3 : 4
}

function attentionFor(agents: TeamAgentRow[], latest: Map<string, TeamTaskRow>): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const agent of agents) {
    const task = latest.get(agent.id)
    if (isWaiting(agent.status)) items.push({ id: `wait:${agent.id}`, agentId: agent.id, kind: 'waiting', title: agent.name,
      detail: agent.status === 'waiting_approval' ? 'Needs your approval in T3' : 'Needs your answer in T3' })
    else if (agent.status === 'failed' && task?.delivery !== 'received') items.push({ id: `failed:${agent.id}`, agentId: agent.id, kind: 'failed', title: agent.name, detail: 'Worker failed' })
    // Discarding a cancelled worker's result is the expected outcome of the cancel, not a new problem.
    if (task?.delivery === 'discarded' && agent.status !== 'cancelled') items.push({ id: `discarded:${task.id}`, agentId: agent.id, kind: 'discarded', title: agent.name, detail: 'Result discarded. The Lead will not get it' })
    else if (task?.delivery === 'unknown') items.push({ id: `unknown:${task.id}`, agentId: agent.id, kind: 'unknown', title: agent.name, detail: 'Delivery state not recognized' })
  }
  return items
}

export function buildTeamView(snapshot: TeamSnapshot, scope: TeamScope, dismissed: ReadonlySet<string> = new Set()): TeamView {
  const { agents, tasks } = snapshot
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  const latest = latestTaskByChild(tasks)
  const children = new Map<string, TeamAgentRow[]>()
  const roots: TeamAgentRow[] = []
  // Hierarchy comes only from explicit parent IDs. A missing parent stays visible and marked.
  for (const agent of agents) {
    if (agent.parentId && byId.has(agent.parentId) && agent.parentId !== agent.id) {
      const siblings = children.get(agent.parentId)
      if (siblings) siblings.push(agent); else children.set(agent.parentId, [agent])
    } else roots.push(agent)
  }
  const visible = new Set<string>()
  for (const agent of agents) {
    if (scope === 'active' && !isOpen(agent, latest.get(agent.id))) continue
    for (let current: TeamAgentRow | undefined = agent, guard = 0; current && !visible.has(current.id) && guard <= agents.length; guard++) {
      visible.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }
  const order = (a: TeamAgentRow, b: TeamAgentRow) => urgency(a, latest.get(a.id)) - urgency(b, latest.get(b.id))
    || (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id.localeCompare(b.id)
  const rows: TeamRow[] = []
  const seen = new Set<string>()
  const countWorking = (id: string): number => (children.get(id) ?? []).filter(child => isWorking(child.status) || isWaiting(child.status)).length
  const visit = (agent: TeamAgentRow, depth: number) => {
    if (seen.has(agent.id)) return
    seen.add(agent.id)
    if (visible.has(agent.id)) {
      const workingChildren = countWorking(agent.id)
      rows.push({ agent, task: latest.get(agent.id) ?? null, depth, statusText: statusText(agent, workingChildren), workingChildren,
        parentName: agent.parentId ? byId.get(agent.parentId)?.name ?? null : null, orphan: Boolean(agent.parentId) && !byId.has(agent.parentId!) })
    }
    for (const child of [...(children.get(agent.id) ?? [])].sort(order)) visit(child, depth + 1)
  }
  for (const root of [...roots].sort((a, b) => Number(b.role === 'lead') - Number(a.role === 'lead') || order(a, b))) visit(root, 0)
  // Corrupt cycles have no root. They still appear rather than vanish.
  for (const agent of agents) visit(agent, 0)

  const counts: TeamCounts = { working: 0, done: 0, sent: 0, received: 0, needsYou: 0, issues: 0, agents: agents.length, active: 0 }
  for (const agent of agents) {
    if (isWaiting(agent.status)) counts.needsYou++
    if (isWorking(agent.status) || isWaiting(agent.status)) counts.active++
    if (agent.status === 'failed') counts.issues++
  }
  for (const task of latest.values()) {
    if (task.status === 'working') counts.working++
    else if (task.delivery === 'received') counts.received++
    else if (task.delivery === 'delivered') counts.sent++
    else if (task.status === 'done') counts.done++
    if (task.delivery === 'discarded' && task.status !== 'cancelled') counts.issues++
  }
  return { rows, counts, hiddenFinished: agents.length - rows.length, lead: agents.find(agent => agent.role === 'lead') ?? null,
    attention: attentionFor(agents, latest).filter(item => !dismissed.has(item.id)) }
}

/** Relative age. A long gap is reported as a fact, never as a problem. */
export function ageLabel(time: number | null | undefined, now: number): string {
  if (!time) return 'unknown'
  const seconds = Math.max(0, Math.round((now - time) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(time).toLocaleDateString()
}

export type ConnectionTone = 'ok' | 'warn' | 'down'
export interface ConnectionView { label: 'Connected' | 'Connecting' | 'Reconnecting' | 'Unavailable'; tone: ConnectionTone; live: boolean; detail: string }

/**
 * Reading the source and agent activity are separate questions. A quiet agent on
 * a healthy read stays Connected; a failed read says so without blaming the agent.
 */
export function connectionView(transport: TransportState, health: SourceHealth | null, now: number): ConnectionView {
  if (transport === 'reconnecting') return { label: 'Reconnecting', tone: 'warn', live: false,
    detail: `Lost the link to the Agent Flow service. Last read ${ageLabel(health?.lastSuccessAt, now)}.` }
  if (!health) return { label: 'Connecting', tone: 'warn', live: false, detail: 'Waiting for the first read of T3 data.' }
  if (health.state === 'unavailable') return { label: 'Unavailable', tone: 'down', live: false,
    detail: `${health.reason ?? 'T3 data cannot be read.'} Last good read ${ageLabel(health.lastSuccessAt, now)}.` }
  const silence = now - health.checkedAt
  if (silence > Math.max(10_000, health.pollIntervalMs * 5)) return { label: 'Reconnecting', tone: 'warn', live: false,
    detail: `No read result for ${Math.round(silence / 1000)}s. Last read ${ageLabel(health.lastSuccessAt, now)}.` }
  return { label: 'Connected', tone: 'ok', live: true,
    detail: `Read-only. Checks T3 every ${Math.round(health.pollIntervalMs / 1000)}s, so short steps between checks are not shown.` }
}

/** Strip the viewer's label prefix so team names read as names. */
export function teamTitle(label: string): string {
  return label.replace(/^T3\s*·\s*/, '') || 'Untitled team'
}
