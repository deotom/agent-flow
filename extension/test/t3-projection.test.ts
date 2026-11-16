import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapT3Delivery, projectT3Teams, t3WorkspaceMatches, type T3Projection, type T3Row } from '../src/t3-projection'
import type { TeamSnapshot } from '../../web/lib/team-types'

const row = (fields: T3Row, payload: T3Row = {}) => ({ ...fields, payload_json: JSON.stringify(payload) })
export function fixture(): T3Projection {
  return {
    projects: [{ project_id: 'vrm', workspace_root: 'D:\\Project\\TH\\vrm' }, { project_id: 'other', workspace_root: 'D:\\Project\\TH-other' }],
    threads: [
      row({ thread_id: 'lead', project_id: 'vrm', title: 'Index review', default_provider: 'claudeAgent', created_at: '2026-11-06T01:00:00Z', updated_at: '2026-11-06T01:05:00Z' }, { modelSelection: { model: 'claude-test' }, activeProviderThreadId: 'p-lead' }),
      row({ thread_id: 'worker', project_id: 'other', title: 'Code review', default_provider: 'codex' }, { lineage: { parentThreadId: 'lead', relationshipToParent: 'subagent' } }),
      row({ thread_id: 'fork', project_id: 'vrm', title: 'Fork', default_provider: 'codex' }, { lineage: { parentThreadId: 'lead', relationshipToParent: 'fork' } }),
      row({ thread_id: 'unrelated', project_id: 'other', title: 'Index review', default_provider: 'codex' }),
    ],
    subagents: [row({ subagent_id: 'task1', thread_id: 'lead', child_thread_id: 'worker', provider_thread_id: 'p-worker', status: 'completed', driver: 'codex' },
      { title: 'Research worker', model: 'gpt-test', prompt: 'Inspect SQL', result: 'Findings', completionDelivery: { state: 'claimed' } })],
    runs: [row({ run_id: 'r-lead', thread_id: 'lead', ordinal: 2, status: 'running' }), row({ run_id: 'r-worker', thread_id: 'worker', ordinal: 1, status: 'completed', provider_thread_id: 'p-worker' }, { modelSelection: { model: 'gpt-test' } })],
    providerThreads: [{ provider_thread_id: 'p-lead', thread_id: 'lead', driver: 'claudeAgent' },
      row({ provider_thread_id: 'p-worker', thread_id: 'worker', driver: 'codex' }, { contextUsage: { usedTokens: 1200, maxTokens: 8000 } })],
    items: [row({ turn_item_id: 'tool1', thread_id: 'lead', run_id: 'r-lead', type: 'dynamic_tool', status: 'running' }, { toolName: 'delegate_task' })],
    requests: [], nodes: [],
  }
}
test('groups cross-provider children, keeps forks independent, filters workspace boundaries', () => {
  const teams = projectT3Teams(fixture(), ['d:/project/th'])
  assert.deepEqual(teams.map(t => t.session.id).sort(), ['t3:fork', 't3:lead'])
  const team = teams.find(t => t.session.id === 't3:lead')!
  const agents = team.event.payload.agents as T3Row[]
  assert.equal(agents.length, 2)
  assert.equal(agents[0].runtime, 'claude')
  assert.equal(agents[0].state, 'tool_calling')
  assert.equal(agents[1].runtime, 'codex')
  assert.equal(agents[1].parentId, 't3-agent:lead')
  assert.equal(agents[1].model, 'gpt-test')
  assert.equal(agents[1].tokensMax, 8000, 'Reported context counters reach the graph gauge')
  assert.equal(agents[1].tokensUsed, 1200)
  assert.equal(agents[0].tokensMax, 0, 'Absent counters are not estimated')
  assert.equal((team.event.payload.delegations as T3Row[])[0].stage, 'completed', 'Claiming delivery does not prove receipt')
  const detail = team.event.payload.team as TeamSnapshot
  assert.equal(detail.sessionId, 't3:lead')
  assert.equal(detail.title, 'Index review')
  assert.equal(detail.agents[0].status, 'running')
  assert.equal(detail.agents[0].context, null, 'Absent context counters stay null')
  assert.deepEqual(detail.agents[1].context, { used: 1200, max: 8000 })
  assert.equal(detail.agents[0].activities[0].toolName, 'delegate_task')
  assert.equal(detail.agents[0].activities[0].startedAt, null)
  assert.equal(detail.tasks[0].delivery, 'pending')
  assert.equal(detail.updatedAt, Date.parse('2026-11-06T01:05:00Z'))
  assert.equal(t3WorkspaceMatches('D:/Project/TH', 'd:/project/th-other'), false)
  assert.equal(t3WorkspaceMatches('D:/Project/TH', 'd:\\project\\TH\\vrm'), true)
  assert.deepEqual(projectT3Teams(fixture(), ['D:/unrelated']), [])
})

test('maps every documented delivery state without treating delivery as receipt', () => {
  assert.equal(mapT3Delivery(null), 'none')
  for (const state of ['claimed', 'queued', 'pending']) assert.equal(mapT3Delivery(state), 'pending')
  assert.equal(mapT3Delivery('delivered'), 'delivered')
  assert.equal(mapT3Delivery('acknowledged'), 'received')
  assert.equal(mapT3Delivery('observed'), 'received')
  assert.equal(mapT3Delivery('delivered', 'lead-run'), 'received')
  assert.equal(mapT3Delivery('disposed'), 'discarded')
  assert.equal(mapT3Delivery('future-state'), 'unknown')
})
test('preserves nested native delegation and distinguishes delivered from observed results', () => {
  const data = fixture()
  data.subagents.push(row({ subagent_id: 'native', thread_id: 'lead', parent_node_id: 'worker-node', status: 'running', driver: 'claudeAgent' }, { title: 'Nested worker' }))
  data.nodes!.push({ node_id: 'worker-node', provider_thread_id: 'p-worker' })
  const payload = () => projectT3Teams(data, ['D:/Project/TH'])[0].event.payload
  assert.equal((payload().agents as T3Row[]).at(-1)!.parentId, 't3-agent:worker')
  data.subagents[0].payload_json = JSON.stringify({ completionDelivery: { state: 'delivered' } })
  assert.equal((payload().delegations as T3Row[])[0].stage, 'returned')
  data.subagents[0].payload_json = JSON.stringify({ completionDelivery: { state: 'observed', observedByRunId: 'r-next' } })
  assert.equal((payload().delegations as T3Row[])[0].stage, 'received')
})
test('ignores cyclic lineage, deleted roots and stale running tools on a completed run', () => {
  const data = fixture()
  data.runs[0].status = 'completed'
  const team = projectT3Teams(data, ['D:/Project/TH'])[0]
  assert.equal((team.event.payload.agents as T3Row[])[0].state, 'idle')
  data.threads[0].payload_json = JSON.stringify({ lineage: { parentThreadId: 'worker', relationshipToParent: 'subagent' } })
  assert.ok(!projectT3Teams(data, ['D:/Project/TH']).some(t => t.session.id === 't3:lead'))
  data.threads[0].deleted_at = '2026-11-06'
  assert.ok(!projectT3Teams(data, ['D:/Project/TH']).some(t => t.session.id === 't3:lead'))
})

test('attributes native worker tools to that worker rather than to its lead', () => {
  const data = fixture()
  data.subagents.push(row({ subagent_id: 'native', thread_id: 'lead', provider_thread_id: 'native-provider', status: 'running', driver: 'codex' }))
  data.items.push(row({ turn_item_id: 'native-tool', thread_id: 'lead', run_id: 'r-lead', provider_thread_id: 'native-provider', type: 'command_execution', status: 'running' }))
  const agents = projectT3Teams(data, ['D:/Project/TH'])[0].event.payload.agents as T3Row[]
  assert.equal(agents[0].toolCalls, 1)
  assert.equal(agents.at(-1)!.toolCalls, 1)
  assert.equal(agents.at(-1)!.state, 'tool_calling')
})

test('shows native context compaction instead of generic thinking', () => {
  const data = fixture()
  data.items = [row({ turn_item_id: 'c1', thread_id: 'lead', run_id: 'r-lead', type: 'compaction', status: 'running' })]
  const team = projectT3Teams(data, ['d:/project/th']).find(t => t.session.id === 't3:lead')!
  assert.equal((team.event.payload.agents as T3Row[])[0].compacting, true)
  const lead = (team.event.payload.team as TeamSnapshot).agents[0]
  assert.equal(lead.status, 'running')
  assert.equal(lead.activities[0].type, 'compaction')
  data.items = [row({ turn_item_id: 'c1', thread_id: 'lead', run_id: 'r-lead', type: 'compaction', status: 'completed' })]
  const after = projectT3Teams(data, ['d:/project/th']).find(t => t.session.id === 't3:lead')!
  assert.equal((after.event.payload.agents as T3Row[])[0].compacting, false)
  assert.equal((after.event.payload.team as TeamSnapshot).agents[0].status, 'thinking')
})

test('keeps a lead whose run ended busy while T3 waits on its background commands', () => {
  const data = fixture()
  data.runs[0].status = 'completed'
  data.items = []
  data.providerThreads[0] = row({ provider_thread_id: 'p-lead', thread_id: 'lead', driver: 'claudeAgent' }, { pendingBackgroundTasks: [
    { taskId: 'b1', kind: 'command', description: 'Watch   pipeline run', command: 'secret --token x', output: 'tool output' },
    { taskId: 'b2', kind: 'command' },
  ] })
  const team = projectT3Teams(data, ['d:/project/th']).find(t => t.session.id === 't3:lead')!
  assert.equal(team.session.status, 'active', 'A team waiting on background commands is still active')
  assert.equal((team.event.payload.agents as T3Row[])[0].state, 'thinking')
  const lead = (team.event.payload.team as TeamSnapshot).agents[0]
  assert.equal(lead.status, 'background')
  assert.deepEqual(lead.activities.map(a => [a.type, a.title]), [['background_command', 'Watch pipeline run'], ['background_command', null]])
  assert.ok(!JSON.stringify(lead).includes('secret') && !JSON.stringify(lead).includes('tool output'), 'Only the short description crosses the contract')
  data.providerThreads[0] = row({ provider_thread_id: 'p-lead', thread_id: 'lead', driver: 'claudeAgent' }, { pendingBackgroundTasks: [] })
  const after = projectT3Teams(data, ['d:/project/th']).find(t => t.session.id === 't3:lead')!
  assert.equal((after.event.payload.team as TeamSnapshot).agents[0].status, 'idle')
  assert.equal(after.session.status, 'completed')
})

test('all-projects scope (null) takes teams from every project and names each project', () => {
  const data = fixture()
  data.projects[1].title = 'Other app'
  const teams = projectT3Teams(data, null)
  assert.deepEqual(teams.map(t => t.session.id).sort(), ['t3:fork', 't3:lead', 't3:unrelated'])
  const project = (id: string) => (teams.find(t => t.session.id === id)!.event.payload.team as TeamSnapshot).project
  assert.equal(project('t3:lead'), 'vrm', 'Untitled projects fall back to the folder name')
  assert.equal(project('t3:unrelated'), 'Other app')
})

test('reports the current provider after a lead switches from Claude to Codex', () => {
  const data = fixture()
  data.threads[0] = row({ ...data.threads[0], default_provider: 'claudeAgent', active_provider_thread_id: 'p-codex' },
    { modelSelection: { model: 'gpt-test' }, activeProviderThreadId: 'p-codex' })
  data.providerThreads.push({ provider_thread_id: 'p-codex', thread_id: 'lead', driver: 'codex', provider: 'codex' })
  data.runs.push(row({ run_id: 'r-current', thread_id: 'lead', ordinal: 3, status: 'completed', provider_thread_id: 'p-codex' },
    { modelSelection: { model: 'gpt-test' } }))
  const team = projectT3Teams(data, ['D:/Project/TH']).find(t => t.session.id === 't3:lead')!
  const graphLead = (team.event.payload.agents as T3Row[]).find(a => a.isMain)!
  const officeAndBoardLead = (team.event.payload.team as TeamSnapshot).agents.find(a => a.role === 'lead')!
  assert.equal(graphLead.runtime, 'codex')
  assert.equal(graphLead.model, 'gpt-test')
  assert.equal(officeAndBoardLead.runtime, 'codex')
  assert.equal(officeAndBoardLead.model, 'gpt-test')
})

test('keeps a lead working when a newer queued run was cancelled while the previous run still runs', () => {
  const data = fixture()
  // Real T3 shape: run 34 still running, run 35 (a cancelled follow-up) has the higher ordinal.
  data.runs = data.runs.filter(run => run.thread_id !== 'lead')
  data.runs.push(row({ run_id: 'r-34', thread_id: 'lead', ordinal: 34, status: 'running' }), row({ run_id: 'r-35', thread_id: 'lead', ordinal: 35, status: 'cancelled' }))
  data.items = [row({ turn_item_id: 'tool34', thread_id: 'lead', run_id: 'r-34', type: 'command_execution', status: 'running' }, { title: 'oc get pods' })]
  const team = projectT3Teams(data, ['D:/Project/TH']).find(t => t.session.id === 't3:lead')!
  const lead = (team.event.payload.team as TeamSnapshot).agents.find(a => a.role === 'lead')!
  assert.equal(lead.status, 'running')
  assert.equal(team.session.status, 'active')
  // Once nothing runs, the newest run decides again.
  data.runs = data.runs.map(run => run.run_id === 'r-34' ? { ...run, status: 'completed' } : run)
  data.items = []
  const after = projectT3Teams(data, ['D:/Project/TH']).find(t => t.session.id === 't3:lead')!
  assert.equal((after.event.payload.team as TeamSnapshot).agents.find(a => a.role === 'lead')!.status, 'cancelled')
})

test('indexes parent nodes once and resolves each native parent once per projection', () => {
  const data = fixture()
  let nodeReads = 0, parentReads = 0
  data.nodes = Array.from({ length: 2000 }, (_, i) => ({
    get node_id() { nodeReads++; return `node-${i}` }, provider_thread_id: 'p-worker',
  }))
  for (let i = 0; i < 60; i++) data.subagents.push(row({
    subagent_id: `native-${i}`, thread_id: 'lead', provider_thread_id: `native-provider-${i}`, status: 'completed',
    parent_node_id: 'node-1999',
  }))
  // Count resolution work on the actual source row.
  for (const task of data.subagents.slice(1)) Object.defineProperty(task, 'parent_node_id', {
    enumerable: true, get() { parentReads++; return 'node-1999' },
  })
  const team = projectT3Teams(data, ['D:/Project/TH']).find(t => t.session.id === 't3:lead')!
  const native = (team.event.payload.team as TeamSnapshot).agents.filter(a => !a.hasThread)
  assert.equal(native.length, 60)
  assert.ok(native.every(a => a.parentId === 't3-agent:worker'))
  assert.ok(nodeReads <= data.nodes.length + data.subagents.length, `node reads ${nodeReads} must grow with nodes, not tasks times nodes`)
  assert.equal(parentReads, 60, 'reused graph/team/task output must not resolve the same task parent again')
})

test('retains first matching nodes and provider task order while excluding the task itself', () => {
  const data = fixture()
  data.subagents = [
    row({ subagent_id: 'self', thread_id: 'lead', provider_thread_id: 'duplicate-provider', parent_node_id: 'shared', status: 'completed' }),
    row({ subagent_id: 'second', thread_id: 'lead', provider_thread_id: 'duplicate-provider', parent_node_id: 'shared', status: 'completed' }),
    row({ subagent_id: 'child', thread_id: 'lead', provider_thread_id: 'child-provider', parent_node_id: 'shared', status: 'completed' }),
    row({ subagent_id: 'missing', thread_id: 'lead', parent_node_id: 'absent', status: 'completed' }),
    row({ subagent_id: 'empty', thread_id: 'lead', parent_node_id: 'empty-first', status: 'completed' }),
    row({ subagent_id: 'nan', thread_id: 'lead', parent_node_id: NaN, status: 'completed' }),
  ]
  data.nodes = [
    { node_id: 'shared', provider_thread_id: 'duplicate-provider' },
    { node_id: 'shared', provider_thread_id: 'child-provider' },
    { node_id: 'empty-first', provider_thread_id: '' },
    { node_id: 'empty-first', provider_thread_id: 'duplicate-provider' },
    { node_id: NaN, provider_thread_id: 'duplicate-provider' },
  ]
  const team = projectT3Teams(data, ['D:/Project/TH']).find(t => t.session.id === 't3:lead')!.event.payload.team as TeamSnapshot
  const parent = (id: string) => team.agents.find(a => a.id === `t3-task:${id}`)!.parentId
  assert.equal(parent('self'), 't3-task:second')
  assert.equal(parent('second'), 't3-task:self')
  assert.equal(parent('child'), 't3-task:self')
  for (const id of ['missing', 'empty', 'nan']) assert.equal(parent(id), 't3-agent:lead')
  assert.deepEqual(team.tasks.map(t => t.parentId), ['t3-task:second', 't3-task:self', 't3-task:self', 't3-agent:lead', 't3-agent:lead', 't3-agent:lead'])
})

test('parses each payload at most once per projection and rereads mutations on the next call', () => {
  const data = fixture(), reads = new Map<T3Row, number>()
  data.items.push(row({ turn_item_id: 'native-tool', thread_id: 'lead', run_id: 'r-lead', provider_thread_id: 'native-provider', type: 'dynamic_tool', status: 'running' }, { toolName: 'inspect', title: 'Inspect' }))
  data.subagents.push(row({ subagent_id: 'native', thread_id: 'lead', provider_thread_id: 'native-provider', status: 'running' }, { title: 'Native', prompt: 'Inspect state' }))
  data.providerThreads.push(row({ provider_thread_id: 'native-provider', thread_id: 'lead' }, { pendingBackgroundTasks: [{ taskId: 'wait', kind: 'command' }] }))
  data.runs.push({ run_id: 'malformed', thread_id: 'fork', ordinal: 1, status: 'completed', payload_json: '{bad json' })
  for (const source of [...data.threads, ...data.subagents, ...data.runs, ...data.items, ...data.providerThreads]) {
    let value = source.payload_json
    Object.defineProperty(source, 'payload_json', { enumerable: true, configurable: true,
      get() { reads.set(source, (reads.get(source) ?? 0) + 1); return value }, set(next) { value = next },
    })
  }
  const first = projectT3Teams(data, ['D:/Project/TH'], 123456)
  assert.ok([...reads.values()].every(count => count <= 1), `one projection reread payloads ${JSON.stringify([...reads.values()])}`)
  data.subagents[0].payload_json = JSON.stringify({ title: 'Updated worker', prompt: 'New prompt', result: 'New result', completionDelivery: { state: 'observed' } })
  reads.clear()
  const second = projectT3Teams(data, ['D:/Project/TH'], 123456)
  const team = second.find(t => t.session.id === 't3:lead')!.event.payload.team as TeamSnapshot
  assert.equal(team.agents.find(a => a.id === 't3-agent:worker')!.name, 'Updated worker')
  assert.equal(team.tasks[0].task, 'New prompt')
  assert.equal(team.tasks[0].result, 'New result')
  assert.equal(team.tasks[0].delivery, 'received')
  assert.ok([...reads.values()].every(count => count <= 1))
  assert.notDeepEqual(first, second, 'the cache must not outlive its projection call')
})

test('classifies native provider tools once instead of rescanning every task for every item', () => {
  const data=fixture(); let providerReads=0
  for(let i=0;i<80;i++) {
    const task=row({subagent_id:`native-${i}`,thread_id:'lead',status:'completed',provider_thread_id:`provider-${i}`})
    Object.defineProperty(task,'provider_thread_id',{enumerable:true,get(){providerReads++;return `provider-${i}`}})
    data.subagents.push(task)
  }
  for(let i=0;i<800;i++) data.items.push(row({turn_item_id:`tool-${i}`,thread_id:'lead',run_id:'r-lead',provider_thread_id:'unowned-provider',type:'dynamic_tool',status:'completed'}))
  const team=projectT3Teams(data,['D:/Project/TH']).find(t=>t.session.id==='t3:lead')!
  assert.ok(team.event.payload)
  assert.ok(providerReads<20_000,`provider membership rescanned tasks ${providerReads} times`)
})
