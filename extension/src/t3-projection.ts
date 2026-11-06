import * as path from 'node:path'
import type { AgentEvent, SessionInfo } from './protocol'

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
const runtime = (driver: unknown): 'claude' | 'codex' | undefined => driver === 'codex' ? 'codex' : driver === 'claudeAgent' || driver === 'claude' ? 'claude' : undefined

/** Only explicit delegation relationships form teams. Forked or similarly named
 * conversations stay independent; no native transcript IDs are guessed. */
export function projectT3Teams(data: T3Projection, workspaces: string[], now = Date.now()): T3Team[] {
  const projects = new Set(data.projects.filter(row => !row.deleted_at && workspaces.some(w => t3WorkspaceMatches(w, text(row.workspace_root))))
    .map(row => text(row.project_id)))
  const threads = new Map(data.threads.filter(row => !row.deleted_at).map(row => [text(row.thread_id), row]))
  const parents = new Map<string, string>()
  for (const [id, row] of threads) {
    const lineage = object(t3Payload(row).lineage)
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
    (projects.has(text(row.project_id)) || workspaces.some(w => t3WorkspaceMatches(w, text(row.worktree_path)))))
    .sort((a, b) => timestamp(b[1].updated_at) - timestamp(a[1].updated_at)).slice(0, 20)
  const result: T3Team[] = []
  for (const [rootId, root] of roots) {
    const members = [...threads].filter(([id]) => rootOf(id) === rootId)
    const memberIds = new Set(members.map(([id]) => id))
    const start = timestamp(root.created_at)
    const relative = (value: unknown) => Math.max(0, (timestamp(value) - start) / 1000)
    const taskRows = data.subagents.filter(row => memberIds.has(text(row.thread_id)))
    const agents: T3Row[] = []
    const nodeForThread = new Map(members.map(([id]) => [id, `t3-agent:${id}`]))
    // Native provider subagents may not have their own app thread.
    for (const task of taskRows) if (!threads.has(text(task.child_thread_id))) nodeForThread.set(`task:${text(task.subagent_id)}`, `t3-task:${text(task.subagent_id)}`)
    const taskParent = (task: T3Row): string | undefined => {
      const node = data.nodes?.find(n => n.node_id === task.parent_node_id)
      const parentTask = taskRows.find(t => t !== task && node?.provider_thread_id && t.provider_thread_id === node.provider_thread_id)
      if (parentTask) return nodeForThread.get(text(parentTask.child_thread_id)) || nodeForThread.get(`task:${text(parentTask.subagent_id)}`)
      return nodeForThread.get(text(task.thread_id))
    }
    for (const [id, row] of members) {
      const payload = t3Payload(row)
      const runs = data.runs.filter(run => run.thread_id === id).sort((a, b) => Number(b.ordinal) - Number(a.ordinal))
      const latest = runs[0]
      const provider = data.providerThreads.find(p => p.provider_thread_id === (payload.activeProviderThreadId || latest?.provider_thread_id))
      const task = taskRows.filter(t => t.child_thread_id === id).sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at))[0]
      const items = data.items.filter(item => item.thread_id === id && (!latest || item.run_id === latest.run_id)
        && !taskRows.some(t => t.provider_thread_id && t.provider_thread_id === item.provider_thread_id && !threads.has(text(t.child_thread_id))))
      const tools = items.filter(item => toolTypes.has(text(item.type)))
      const pending = tools.filter(item => running(item.status) && (!latest || running(latest.status))).map(item => {
        const p = t3Payload(item)
        return { callId: text(item.turn_item_id), tool: text(p.toolName) || text(item.type), args: text(p.title) }
      })
      const blocked = data.requests.some(request => request.thread_id === id && ['pending', 'open', 'requested'].includes(text(request.status)))
      const status = task?.status || latest?.status
      const model = text(object(payload.modelSelection).model) || text(object(t3Payload(latest || {}).modelSelection).model) || text(task && t3Payload(task).model) || undefined
      const state = blocked ? 'waiting_permission' : pending.length ? 'tool_calling' : running(status) ? 'thinking'
        : ['failed', 'error'].includes(text(status)) ? 'error' : id !== rootId && ['completed', 'cancelled', 'interrupted'].includes(text(status)) ? 'complete' : 'idle'
      const parentId = parents.get(id)
      agents.push({ id: nodeForThread.get(id), name: text(task && t3Payload(task).title) || text(row.title),
        parentId: task ? taskParent(task) : parentId ? nodeForThread.get(parentId) : null, isMain: id === rootId,
        runtime: runtime(provider?.driver || provider?.provider || row.default_provider), model, state,
        spawnTime: relative(row.created_at), timeAlive: Math.max(0, (now - timestamp(row.created_at)) / 1000),
        tools: pending, currentTool: pending.at(-1)?.tool, toolCalls: tools.length,
        // T3 does not guarantee token counters in these projections. Do not estimate them.
        tokensUsed: 0, tokensMax: 0, task: text(task && t3Payload(task).prompt),
      })
    }
    for (const task of taskRows) {
      if (threads.has(text(task.child_thread_id))) continue
      const p = t3Payload(task)
      const items = data.items.filter(item => task.provider_thread_id && item.provider_thread_id === task.provider_thread_id && toolTypes.has(text(item.type)))
      const tools = items.filter(item => running(item.status) && running(task.status)).map(item => ({
        callId: text(item.turn_item_id), tool: text(t3Payload(item).toolName) || text(item.type), args: text(t3Payload(item).title),
      }))
      agents.push({ id: nodeForThread.get(`task:${text(task.subagent_id)}`), name: text(p.title) || 'Subagent',
        parentId: taskParent(task), isMain: false, runtime: runtime(task.driver || task.provider),
        model: text(p.model) || undefined, state: tools.length ? 'tool_calling' : running(task.status) ? 'thinking' : task.status === 'failed' ? 'error' : 'complete',
        task: text(p.prompt), spawnTime: relative(task.started_at), tools, currentTool: tools.at(-1)?.tool,
        tokensUsed: 0, tokensMax: 0, toolCalls: items.length })
    }
    const delegations = taskRows.map(task => {
      const p = t3Payload(task), delivery = object(p.completionDelivery)
      const stage = delivery.state === 'observed' || delivery.observedByRunId ? 'received'
        : delivery.state === 'delivered' ? 'returned' : task.status === 'completed' ? 'completed'
        : task.status === 'failed' || task.status === 'cancelled' ? 'aborted' : 'working'
      return { id: `t3-delegation:${text(task.subagent_id)}`, child: nodeForThread.get(text(task.child_thread_id)) || nodeForThread.get(`task:${text(task.subagent_id)}`),
        parent: taskParent(task), name: text(p.title) || 'Subagent', model: text(p.model), task: text(p.prompt),
        round: 0, startTime: relative(task.started_at), stage, summary: text(p.result), historical: true }
    })
    const active = agents.some(agent => ['thinking', 'tool_calling', 'waiting_permission'].includes(text(agent.state)))
    const updated = Math.max(timestamp(root.updated_at), ...members.map(([, row]) => timestamp(row.updated_at)), ...taskRows.map(row => timestamp(row.updated_at)))
    const session: SessionInfo = { id: `t3:${rootId}`, label: `T3 · ${text(root.title) || 'Untitled team'}`,
      status: active ? 'active' : 'completed', startTime: start, lastActivityTime: updated }
    result.push({ session, event: { sessionId: session.id, time: relative(new Date(now).toISOString()), type: 'session_snapshot',
      payload: { agents, delegations, round: 0, source: 't3', preserveLayout: true, preserveHistory: true } } })
  }
  return result
}
