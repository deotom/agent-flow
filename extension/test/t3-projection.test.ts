import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectT3Teams, t3WorkspaceMatches, type T3Projection, type T3Row } from '../src/t3-projection'

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
    runs: [row({ run_id: 'r-lead', thread_id: 'lead', ordinal: 2, status: 'running' }), row({ run_id: 'r-worker', thread_id: 'worker', ordinal: 1, status: 'completed' }, { modelSelection: { model: 'gpt-test' } })],
    providerThreads: [{ provider_thread_id: 'p-lead', driver: 'claudeAgent' }],
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
  assert.equal(agents[1].tokensMax, 0)
  assert.equal((team.event.payload.delegations as T3Row[])[0].stage, 'completed', 'Claiming delivery does not prove receipt')
  assert.equal(t3WorkspaceMatches('D:/Project/TH', 'd:/project/th-other'), false)
  assert.equal(t3WorkspaceMatches('D:/Project/TH', 'd:\\project\\TH\\vrm'), true)
  assert.deepEqual(projectT3Teams(fixture(), ['D:/unrelated']), [])
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
