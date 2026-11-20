import * as path from 'node:path'
import type { AgentEvent, SessionInfo } from './protocol'
// @ts-ignore -- shared web contract intentionally lives outside extension/rootDir.
import type { AgentRuntime, TeamActivity, TeamAgentRow, TeamDelivery, TeamSnapshot, TeamTaskRow } from '../../web/lib/team-types'

export type T3Row = Record<string, unknown>
export interface T3Projection {
  projects: T3Row[]
  threads: T3Row[]
  subagents: T3Row[]
  runs: T3Row[]
  items: T3Row[]
  providerThreads: T3Row[]
  requests: T3Row[]
  nodes?: T3Row[]
}
export interface T3Team { session: SessionInfo; event: AgentEvent }
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const object = (value: unknown): T3Row => value && typeof value === 'object' && !Array.isArray(value) ? value as T3Row : {}
export function t3Payload(row: T3Row): T3Row {
  try { return object(JSON.parse(text(row.payload_json))) } catch { return {} }
}
const timestamp = (value: unknown): number => Date.parse(text(value)) || 0
const optionalTimestamp = (value: unknown): number | null => {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}
const capped = (value: unknown): string | null => {
  const result = text(value)
  return result ? result.slice(0, 2000) : null
}
const jobMoment = (task: T3Row): number => optionalTimestamp(task.started_at) ?? optionalTimestamp(task.completed_at) ?? timestamp(task.updated_at)
const taskRole = (value: unknown): TeamAgentRow['taskRole'] => ['implementation','research','review','design','test','general'].includes(text(value)) ? text(value) as TeamAgentRow['taskRole'] : undefined
function normalized(value: string): string {
  // T3's Windows paths can be read by a remote host too.
  const result = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(result) || process.platform === 'win32' ? result.toLowerCase() : result
}
export function t3WorkspaceMatches(workspace: string, candidate: string): boolean {
  if (!candidate) return false
  const root = normalized(path.isAbsolute(workspace) || /^[a-z]:/i.test(workspace) ? workspace : path.resolve(workspace))
  const target = normalized(candidate)
  return target === root || target.startsWith(`${root}/`)
}
const running = (status: unknown): boolean => ['running', 'starting', 'queued', 'pending', 'in_progress'].includes(text(status))
const toolTypes = new Set(['command_execution', 'dynamic_tool', 'file_change', 'web_search', 'mcp_tool_call'])
/** Which AI runs a T3 agent, from its driver and provider ids (e.g. driver "acpRegistry", provider "acpRegistry_github_copilot"). */
/** The first id that names a known AI wins, so a thread's own driver outranks the project default. */
const teamRuntime = (...ids: unknown[]): AgentRuntime | undefined => {
  for (const id of ids) {
    const value = text(id).toLowerCase()
    if (!value) continue
    if (/codex/.test(value)) return 'codex'
    if (/claude/.test(value)) return 'claude'
    if (/copilot/.test(value)) return 'copilot'
    if (/antigravity|gemini/.test(value)) return 'gemini'
    if (/cursor/.test(value)) return 'cursor'
  }
  return undefined
}
/** The local graph only knows Claude and Codex. */
const runtime = (...ids: unknown[]): 'claude' | 'codex' | undefined => {
  const value = teamRuntime(...ids)
  return value === 'claude' || value === 'codex' ? value : undefined
}
const terminalSuccess = new Set(['completed', 'complete', 'succeeded', 'success', 'done'])
const terminalFailure = new Set(['failed', 'error'])
const terminalCancelled = new Set(['cancelled', 'canceled', 'interrupted'])
/**
 * Background commands T3 still tracks after the run that started them ended (T3 shows "Waiting on N commands").
 * Only the kind and the agent's short description are kept, never the command text or its output.
 */
function backgroundActivities(provider: T3Row | undefined, payload = t3Payload): TeamActivity[] {
  const list = payload(provider || {}).pendingBackgroundTasks
  if (!Array.isArray(list)) return []
  return list.slice(0, 5).map((value, index) => {
    const task = object(value)
    const kind = text(task.kind).replace(/[^a-z_]/gi, '').slice(0, 24) || 'task'
    const description = text(task.description).replace(/\s+/g, ' ').trim().slice(0, 120)
    return { id: `background:${text(task.taskId).slice(0, 40) || index}`, type: `background_${kind}`, toolName: null, title: description || null, startedAt: null }
  })
}

export function mapT3Delivery(stateValue: unknown, observedByRunId?: unknown): TeamDelivery {
  const state = text(stateValue).toLowerCase()
  if (text(observedByRunId) || state === 'acknowledged' || state === 'observed') return 'received'
  if (state === 'delivered') return 'delivered'
  if (state === 'disposed') return 'discarded'
  if (['claimed', 'queued', 'pending'].includes(state)) return 'pending'
  if (!state) return 'none'
  return 'unknown'
}

/** Resolve scope/lineage once without constructing graph snapshots for the reader. */
function selectT3Topology(data: T3Projection, workspaces: string[] | null, payloadFor = t3Payload) {
  const inScope = (folder: string) => workspaces === null || workspaces.some(w => t3WorkspaceMatches(w, folder))
  const liveProjects = data.projects.filter(row => !row.deleted_at && inScope(text(row.workspace_root)))
  const projects = new Set(liveProjects.map(row => text(row.project_id)))
  // Project name per team, so teams from different projects can be told apart.
  const projectNames = new Map(liveProjects.map(row => [text(row.project_id), text(row.title) || path.basename(text(row.workspace_root))]))
  const threads = new Map(data.threads.filter(row => !row.deleted_at).map(row => [text(row.thread_id), row]))
  const parents = new Map<string, string>()
  for (const [id, row] of threads) {
    const lineage = object(payloadFor(row).lineage)
    if (lineage.relationshipToParent === 'subagent' && threads.has(text(lineage.parentThreadId))) parents.set(id, text(lineage.parentThreadId))
  }
  for (const row of data.subagents) {
    const child = text(row.child_thread_id), parent = text(row.thread_id)
    if (child && child !== parent && threads.has(child) && threads.has(parent)) parents.set(child, parent)
  }
  const rootOf = (id: string): string | undefined => {
    const seen = new Set<string>()
    while (parents.has(id)) {
      if (seen.has(id)) return undefined // Corrupt lineage must not loop or invent a team.
      seen.add(id); id = parents.get(id)!
    }
    return id
  }
  const roots = [...threads].filter(([id, row]) => !parents.has(id) && !row.archived_at &&
    (projects.has(text(row.project_id)) || (workspaces !== null && workspaces.some(w => t3WorkspaceMatches(w, text(row.worktree_path))))))
    .sort((a, b) => timestamp(b[1].updated_at) - timestamp(a[1].updated_at)).slice(0, 20)
  const membersByRoot = new Map(roots.map(([id]) => [id, [] as [string, T3Row][]]))
  for (const member of threads) {
    const root = rootOf(member[0])
    if (root !== undefined) membersByRoot.get(root)?.push(member)
  }
  return { liveProjects, projectNames, threads, parents, roots, membersByRoot }
}
export function selectT3ThreadIds(data: T3Projection, workspaces: string[] | null): string[] {
  const { roots, membersByRoot } = selectT3Topology(data, workspaces)
  return roots.flatMap(([id]) => membersByRoot.get(id)!.map(([memberId]) => memberId))
}

// The reader collapses inactive rows by thread/run/provider/type. Raw fixtures
// remain supported; timestamps stay as source values to preserve Date.parse
// semantics (SQL lexical MAX is not equivalent for every stored timestamp).
const itemCount = (items: T3Row[]): number => items.reduce((count, item) => count + (typeof item.item_count === 'number' ? item.item_count : 1), 0)
function itemUpdatedAt(item: T3Row): number | null {
  if (typeof item.updated_ats_json !== 'string') return optionalTimestamp(item.updated_at)
  const values: unknown[] = JSON.parse(item.updated_ats_json)
  let latest: number | null = null
  for (const value of values) {
    const parsed = optionalTimestamp(value)
    if (parsed !== null && (latest === null || parsed > latest)) latest = parsed
  }
  return latest
}

/** Only explicit delegation relationships form teams. Forked or similarly named
 * conversations stay independent; no native transcript IDs are guessed. */
/** `workspaces` null means every T3 project on this machine. */
export function projectT3Teams(data: T3Projection, workspaces: string[] | null, now = Date.now()): T3Team[] {
  // A poll owns its row snapshot. Reuse parsed payloads inside this projection,
  // but reread the same row object on the next poll if its payload changed.
  const payloads = new WeakMap<T3Row, T3Row>()
  const payloadFor = (row: T3Row): T3Row => {
    const cached = payloads.get(row)
    if (cached) return cached
    const payload = t3Payload(row)
    payloads.set(row, payload)
    return payload
  }
  const nodesById = new Map<unknown, T3Row>()
  for (const node of data.nodes ?? []) {
    const id = node.node_id
    // Array.find used strict equality: preserve its first row and NaN behavior.
    if (id === id && !nodesById.has(id)) nodesById.set(id, node)
  }
  const itemsByThread = new Map<unknown, T3Row[]>(), itemsByProvider = new Map<unknown, T3Row[]>()
  for (const item of data.items) {
    for (const [index, id] of [[itemsByThread, item.thread_id], [itemsByProvider, item.provider_thread_id]] as const) {
      if (id !== id) continue // Preserve strict equality: NaN never matched.
      const rows = index.get(id)
      if (rows) rows.push(item)
      else index.set(id, [item])
    }
  }
  const { projectNames, threads, parents, roots, membersByRoot } = selectT3Topology(data, workspaces, payloadFor)
  const result: T3Team[] = []
  for (const [rootId, root] of roots) {
    const members = membersByRoot.get(rootId)!
    const memberIds = new Set(members.map(([id]) => id))
    const start = timestamp(root.created_at)
    const relative = (value: unknown) => Math.max(0, (timestamp(value) - start) / 1000)
    const taskRows = data.subagents.filter(row => memberIds.has(text(row.thread_id)))
    const nativeProviders = new Set(taskRows.filter(task => task.provider_thread_id && task.provider_thread_id === task.provider_thread_id
      && !threads.has(text(task.child_thread_id))).map(task => task.provider_thread_id))
    const agents: T3Row[] = []
    const teamAgents: TeamAgentRow[] = []
    const nodeForThread = new Map(members.map(([id]) => [id, `t3-agent:${id}`]))
    // Native provider subagents may not have their own app thread.
    for (const task of taskRows) if (!threads.has(text(task.child_thread_id))) nodeForThread.set(`task:${text(task.subagent_id)}`, `t3-task:${text(task.subagent_id)}`)
    const tasksByProvider = new Map<unknown, [T3Row, T3Row?]>()
    for (const task of taskRows) {
      const provider = task.provider_thread_id
      if (!provider) continue
      const pair = tasksByProvider.get(provider)
      if (!pair) tasksByProvider.set(provider, [task])
      else if (pair[0] !== task && !pair[1]) pair[1] = task
    }
    const taskParents = new WeakMap<T3Row, string | undefined>()
    const taskParent = (task: T3Row): string | undefined => {
      if (taskParents.has(task)) return taskParents.get(task)
      const node = nodesById.get(task.parent_node_id)
      const pair = node?.provider_thread_id ? tasksByProvider.get(node.provider_thread_id) : undefined
      // Duplicate providers retain Array.find order, excluding this exact task.
      const parentTask = pair?.[0] === task ? pair[1] : pair?.[0]
      const parent = parentTask
        ? nodeForThread.get(text(parentTask.child_thread_id)) || nodeForThread.get(`task:${text(parentTask.subagent_id)}`)
        : nodeForThread.get(text(task.thread_id))
      taskParents.set(task, parent)
      return parent
    }
    for (const [id, row] of members) {
      const payload = payloadFor(row)
      const runs = data.runs.filter(run => run.thread_id === id).sort((a, b) => Number(b.ordinal) - Number(a.ordinal))
      // A queued or steered message can create a newer run that ends "cancelled" while the
      // previous run is still working, so a still-running run wins over a newer finished one.
      const latest = runs.find(run => running(run.status)) ?? runs[0]
      const provider = data.providerThreads.find(p => p.provider_thread_id === (payload.activeProviderThreadId || row.active_provider_thread_id || latest?.provider_thread_id))
      // Delivery can touch an old delegation after this child starts another job.
      const task = taskRows.filter(t => t.child_thread_id === id).sort((a, b) => jobMoment(b)-jobMoment(a) || timestamp(b.updated_at)-timestamp(a.updated_at))[0]
      const items = (itemsByThread.get(id) ?? []).filter(item => (!latest || item.run_id === latest.run_id)
        && !nativeProviders.has(item.provider_thread_id))
      const tools = items.filter(item => toolTypes.has(text(item.type)))
      const pending = tools.filter(item => running(item.status) && (!latest || running(latest.status))).map(item => {
        const p = payloadFor(item)
        return { callId: text(item.turn_item_id), tool: text(p.toolName) || text(item.type), args: text(p.title) }
      })
      // T3 records native context compaction as a turn item; surface it instead of a generic "Thinking".
      const compactions = items.filter(item => text(item.type) === 'compaction' && running(item.status) && (!latest || running(latest.status)))
      const blocked = data.requests.some(request => request.thread_id === id && ['pending', 'open', 'requested'].includes(text(request.status)))
      const openRequest = data.requests.filter(request => request.thread_id === id && ['pending', 'open', 'requested'].includes(text(request.status)))
        .sort((a, b) => (optionalTimestamp(b.created_at) ?? 0) - (optionalTimestamp(a.created_at) ?? 0))[0]
      const status = task && !(terminalSuccess.has(text(task.status)) && running(latest?.status)) ? task.status : latest?.status
      const model = text(object(payload.modelSelection).model) || text(object(payloadFor(latest || {}).modelSelection).model) || text(task && payloadFor(task).model) || undefined
      // Background commands keep the agent busy on the canvas after its run ended.
      const background = backgroundActivities(provider, payloadFor)
      const baseState = blocked ? 'waiting_permission' : pending.length ? 'tool_calling' : running(status) ? 'thinking'
        : ['failed', 'error'].includes(text(status)) ? 'error' : id !== rootId && ['completed', 'cancelled', 'interrupted'].includes(text(status)) ? 'complete' : 'idle'
      const state = background.length && (baseState === 'idle' || baseState === 'complete') ? 'thinking' : baseState
      const parentId = parents.get(id)
      const providerPayload = payloadFor(provider || {})
      const contextUsage = object(providerPayload.contextUsage)
      const usedTokens = Number(contextUsage.usedTokens), maxTokens = Number(contextUsage.maxTokens)
      // Only counters T3 reported reach the graph gauge; absent counters stay 0 (no gauge).
      const reported = usedTokens > 0 && maxTokens > 0
      agents.push({ id: nodeForThread.get(id), name: text(task && payloadFor(task).title) || text(row.title),
        parentId: task ? taskParent(task) : parentId ? nodeForThread.get(parentId) : null, isMain: id === rootId,
        runtime: runtime(provider?.driver, provider?.provider, row.default_provider), model, state,
        spawnTime: relative(row.created_at), timeAlive: Math.max(0, (now - timestamp(row.created_at)) / 1000),
        tools: pending, currentTool: pending.at(-1)?.tool, toolCalls: itemCount(tools),
        tokensUsed: reported ? usedTokens : 0, tokensMax: reported ? maxTokens : 0,
        task: text(task && payloadFor(task).prompt), compacting: compactions.length > 0,
      })
      const requestKind = text(openRequest?.kind) || text(payloadFor(openRequest || {}).kind)
      const activities: TeamActivity[] = [...compactions, ...tools.filter(item => running(item.status) && (!latest || running(latest.status)))].map(item => {
        const itemPayload = payloadFor(item)
        return {
          id: text(item.turn_item_id), type: text(item.type), toolName: text(itemPayload.toolName) || null,
          title: text(itemPayload.title) || null, startedAt: optionalTimestamp(itemPayload.startedAt),
        }
      })
      const baseStatus: TeamAgentRow['status'] = openRequest
        ? (/approval|permission|confirm|decision/i.test(requestKind) ? 'waiting_approval' : 'waiting_input')
        : activities.length ? 'running' : running(status) ? 'thinking'
        : terminalFailure.has(text(status)) ? 'failed' : terminalCancelled.has(text(status)) ? 'cancelled'
        : id !== rootId && terminalSuccess.has(text(status)) ? 'done' : 'idle'
      const shownStatus: TeamAgentRow['status'] = background.length && (baseStatus === 'idle' || baseStatus === 'done') ? 'background' : baseStatus
      teamAgents.push({
        id: nodeForThread.get(id)!, parentId: task ? taskParent(task) ?? null : parentId ? nodeForThread.get(parentId) ?? null : null,
        role: id === rootId ? 'lead' : 'worker', name: text(task && payloadFor(task).title) || text(row.title),
        runtime: teamRuntime(provider?.driver, provider?.provider, row.default_provider) ?? null, model: model ?? null,
        status: shownStatus, taskRole: taskRole(task && payloadFor(task).role), task: capped(task && payloadFor(task).prompt), activities: shownStatus === 'background' ? background : activities,
        requestKind: openRequest ? requestKind || null : null,
        context: usedTokens > 0 && maxTokens > 0 ? { used: usedTokens, max: maxTokens } : null,
        toolCallCount: itemCount(tools), hasThread: true,
        startedAt: task ? optionalTimestamp(task.started_at) ?? optionalTimestamp(row.created_at) : optionalTimestamp(row.created_at),
        updatedAt: Math.max(optionalTimestamp(row.updated_at) ?? 0, optionalTimestamp(task?.updated_at) ?? 0) || null,
        completedAt: running(status) ? null : optionalTimestamp(task?.completed_at) ?? optionalTimestamp(latest?.completed_at),
      })
    }
    for (const task of taskRows) {
      if (threads.has(text(task.child_thread_id))) continue
      const p = payloadFor(task)
      const items = (task.provider_thread_id ? itemsByProvider.get(task.provider_thread_id) ?? [] : []).filter(item => toolTypes.has(text(item.type)))
      const tools = items.filter(item => running(item.status) && running(task.status)).map(item => ({
        callId: text(item.turn_item_id), tool: text(payloadFor(item).toolName) || text(item.type), args: text(payloadFor(item).title),
      }))
      const provider = data.providerThreads.find(row => row.provider_thread_id === task.provider_thread_id)
      const contextUsage = object(payloadFor(provider || {}).contextUsage)
      const usedTokens = Number(contextUsage.usedTokens), maxTokens = Number(contextUsage.maxTokens)
      const reported = usedTokens > 0 && maxTokens > 0
      agents.push({ id: nodeForThread.get(`task:${text(task.subagent_id)}`), name: text(p.title) || 'Subagent',
        parentId: taskParent(task), isMain: false, runtime: runtime(task.driver, task.provider),
        model: text(p.model) || undefined, state: tools.length ? 'tool_calling' : running(task.status) || backgroundActivities(provider, payloadFor).length ? 'thinking' : task.status === 'failed' ? 'error' : 'complete',
        task: text(p.prompt), spawnTime: relative(task.started_at), tools, currentTool: tools.at(-1)?.tool,
        tokensUsed: reported ? usedTokens : 0, tokensMax: reported ? maxTokens : 0, toolCalls: itemCount(items) })
      const openRequest = data.requests.filter(request => request.thread_id === task.thread_id && request.node_id === task.parent_node_id
        && ['pending', 'open', 'requested'].includes(text(request.status)))[0]
      const requestKind = text(openRequest?.kind) || text(payloadFor(openRequest || {}).kind)
      const activities: TeamActivity[] = items.filter(item => running(item.status) && running(task.status)).map(item => {
        const itemPayload = payloadFor(item)
        return { id: text(item.turn_item_id), type: text(item.type), toolName: text(itemPayload.toolName) || null,
          title: text(itemPayload.title) || null, startedAt: optionalTimestamp(itemPayload.startedAt) }
      })
      const statusValue = text(task.status)
      const baseStatus: TeamAgentRow['status'] = openRequest
        ? (/approval|permission|confirm|decision/i.test(requestKind) ? 'waiting_approval' : 'waiting_input')
        : activities.length ? 'running' : running(statusValue) ? 'thinking'
        : terminalFailure.has(statusValue) ? 'failed' : terminalCancelled.has(statusValue) ? 'cancelled' : 'done'
      const background = backgroundActivities(provider, payloadFor)
      const teamStatus: TeamAgentRow['status'] = background.length && baseStatus === 'done' ? 'background' : baseStatus
      teamAgents.push({ id: nodeForThread.get(`task:${text(task.subagent_id)}`)!, parentId: taskParent(task) ?? null,
        role: 'worker', name: text(p.title) || 'Subagent', runtime: teamRuntime(task.driver, task.provider) ?? null,
        model: text(p.model) || null, status: teamStatus, taskRole: taskRole(p.role), task: capped(p.prompt), activities: teamStatus === 'background' ? background : activities,
        requestKind: openRequest ? requestKind || null : null,
        context: usedTokens > 0 && maxTokens > 0 ? { used: usedTokens, max: maxTokens } : null,
        toolCallCount: itemCount(items), hasThread: false, startedAt: optionalTimestamp(task.started_at),
        updatedAt: optionalTimestamp(task.updated_at), completedAt: optionalTimestamp(task.completed_at) })
    }
    const delegations = taskRows.map(task => {
      const p = payloadFor(task), delivery = object(p.completionDelivery)
      const deliveryState = text(task.completion_delivery_state) || text(delivery.state)
      const stage = ['acknowledged', 'observed'].includes(deliveryState) || delivery.observedByRunId ? 'received'
        : deliveryState === 'delivered' ? 'returned' : task.status === 'completed' ? 'completed'
        : task.status === 'failed' || task.status === 'cancelled' ? 'aborted' : 'working'
      return { id: `t3-delegation:${text(task.subagent_id)}`, child: nodeForThread.get(text(task.child_thread_id)) || nodeForThread.get(`task:${text(task.subagent_id)}`),
        parent: taskParent(task), name: text(p.title) || 'Subagent', model: text(p.model), task: text(p.prompt),
        round: 0, startTime: relative(task.started_at), stage, summary: text(p.result), historical: true }
    })
    const active = agents.some(agent => ['thinking', 'tool_calling', 'waiting_permission'].includes(text(agent.state)))
    const updated = Math.max(timestamp(root.updated_at), ...members.map(([, row]) => timestamp(row.updated_at)), ...taskRows.map(row => timestamp(row.updated_at)))
    const session: SessionInfo = { id: `t3:${rootId}`, label: `T3 · ${text(root.title) || 'Untitled team'}`,
      status: active ? 'active' : 'completed', startTime: start, lastActivityTime: updated }
    const teamTasks: TeamTaskRow[] = taskRows.map(task => {
      const p = payloadFor(task), delivery = object(p.completionDelivery), state = text(task.status)
      const childId = nodeForThread.get(text(task.child_thread_id)) || nodeForThread.get(`task:${text(task.subagent_id)}`)!
      const status: TeamTaskRow['status'] = terminalFailure.has(state) ? 'failed' : terminalCancelled.has(state) ? 'cancelled'
        : terminalSuccess.has(state) ? 'done' : 'working'
      return { id: `t3-delegation:${text(task.subagent_id)}`, childId, parentId: taskParent(task) ?? nodeForThread.get(text(task.thread_id))!,
        name: text(p.title) || 'Subagent', model: text(p.model) || null, taskRole: taskRole(p.role), task: capped(p.prompt), result: capped(p.result), status,
        delivery: mapT3Delivery(text(task.completion_delivery_state) || delivery.state, delivery.observedByRunId),
        startedAt: optionalTimestamp(task.started_at), completedAt: optionalTimestamp(task.completed_at), updatedAt: optionalTimestamp(task.updated_at) }
    })
    const updatedCandidates = [root, ...members.map(([, row]) => row), ...taskRows,
      ...data.providerThreads.filter(row => memberIds.has(text(row.thread_id))), ...data.items.filter(row => memberIds.has(text(row.thread_id)))]
      .map(row => itemUpdatedAt(row)).filter((value): value is number => value !== null)
    const team: TeamSnapshot = { sessionId: session.id, title: text(root.title) || 'Untitled team', project: projectNames.get(text(root.project_id)) || null, active,
      updatedAt: updatedCandidates.length ? Math.max(...updatedCandidates) : null, agents: teamAgents, tasks: teamTasks }
    result.push({ session, event: { sessionId: session.id, time: relative(new Date(now).toISOString()), type: 'session_snapshot',
      payload: { agents, delegations, team, round: 0, source: 't3', preserveLayout: true, preserveHistory: true } } })
  }
  return result
}
