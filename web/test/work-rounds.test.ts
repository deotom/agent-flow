import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { visibleRoundGraph } from '../hooks/simulation/work-rounds'
import { stableAgentLayout } from '../hooks/simulation/stable-layout'
import { computeNextFrame } from '../hooks/simulation/animate'
import type { SimulationEvent } from '../lib/agent-types'

function fixture() {
  let state = createEmptyState()
  let time = 0
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  return { get state() { return state }, event(type: SimulationEvent['type'], payload: Record<string, unknown>, historical = false) {
    state = processEvent({ type, payload, historical, time: ++time }, { ...state, currentTime: time }, ctx)
  }, hideCompleted() { state = computeNextFrame(state, 10, ++time, time, state, { animationMode: 'off', useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 }) } }
}

it('starts rounds only from main user input and preserves searchable history while hiding old graph work', () => {
  const f = fixture()
  f.event('agent_spawn', { name: 'root', isMain: true })
  f.event('message', { agent: 'root', role: 'user', content: 'First task' }, true)
  f.event('agent_spawn', { name: 'child', parent: 'root' }, true)
  f.event('message', { agent: 'child', role: 'user', content: 'Delegated instruction' }, true)
  assert.equal(f.state.round, 1)
  f.event('tool_call_start', { agent: 'child', tool: 'Read', args: 'old.txt' }, true)
  f.event('message', { agent: 'root', role: 'user', content: 'Second task' })
  assert.equal(f.state.round, 2)
  assert.equal(visibleRoundGraph(f.state, true).agents.has('child'), false)
  assert.equal(visibleRoundGraph(f.state, true).toolCalls.size, 0)
  assert.equal(visibleRoundGraph(f.state, false).agents.has('child'), true)
  assert.equal(f.state.conversations.get('root')?.[0].content, 'First task')
  assert.equal(f.state.conversations.get('root')?.[0].round, 1)
})

it('distinguishes completion, result sent and an explicit parent receipt even after the node fades', () => {
  const f = fixture()
  f.event('agent_spawn', { name: 'root', isMain: true })
  f.event('message', { agent: 'root', role: 'user', content: 'Review' })
  f.event('agent_spawn', { name: 'child', parent: 'root', task: 'Check routes' })
  f.event('subagent_dispatch', { parent: 'root', child: 'child', task: 'Check routes' })
  f.event('message', { agent: 'child', role: 'assistant', content: 'Checked three routes' })
  f.event('agent_complete', { name: 'child' })
  assert.equal([...f.state.delegations.values()][0].stage, 'completed')
  f.hideCompleted()
  assert.equal(f.state.agents.has('child'), false)
  f.event('subagent_return', { child: 'child', parent: 'root', summary: 'Three routes verified' })
  assert.equal([...f.state.delegations.values()][0].stage, 'returned')
  f.event('subagent_return', { child: 'child', parent: 'root', summary: 'Three routes verified', received: true })
  const result = [...f.state.delegations.values()][0]
  assert.equal(result.stage, 'received')
  assert.equal(result.summary, 'Three routes verified')
  assert.equal(f.state.conversations.get('child')?.at(-1)?.content, 'Checked three routes')
})

it('keeps separate task records when the same child is reused and keeps nested ancestors connected', () => {
  const f = fixture()
  f.event('agent_spawn', { name: 'root', isMain: true })
  f.event('message', { agent: 'root', role: 'user', content: 'First' })
  f.event('agent_spawn', { name: 'child', parent: 'root' })
  f.event('agent_complete', { name: 'child', aborted: true })
  f.event('message', { agent: 'root', role: 'user', content: 'Next' })
  f.event('agent_spawn', { name: 'child', parent: 'root' })
  f.event('agent_spawn', { name: 'grandchild', parent: 'child' })
  assert.equal(f.state.delegations.size, 3)
  assert.deepEqual([...f.state.delegations.values()].map(task => task.round), [1, 2, 2])
  assert.equal(visibleRoundGraph(f.state, true).agents.size, 3)
  f.event('message', { agent: 'root', role: 'user', content: 'Reassign active child' })
  f.event('agent_spawn', { name: 'child', parent: 'root', task: 'New task' })
  assert.equal(f.state.delegations.size, 4)
  assert.equal([...f.state.delegations.values()].at(-1)?.round, 3)
  f.event('subagent_dispatch', { parent: 'root', child: 'child', task: 'Thanks', notification: true })
  assert.equal(f.state.delegations.size, 4)
  assert.equal([...f.state.delegations.values()].at(-1)?.task, 'New task')
})

it('marks dependent work stopped when the parent ends without evidence of a result', () => {
  const f = fixture()
  f.event('agent_spawn', { name: 'root', isMain: true })
  f.event('agent_spawn', { name: 'child', parent: 'root' })
  f.event('agent_complete', { name: 'root', aborted: true })
  assert.equal([...f.state.delegations.values()][0].stage, 'aborted')
})

it('places many labels without overlap and keeps existing or dragged nodes stationary', () => {
  const f = fixture()
  f.event('agent_spawn', { name: 'root', isMain: true })
  for (let i = 0; i < 24; i++) f.event('agent_spawn', { name: `child-${i}`, parent: 'root' })
  const layout = stableAgentLayout(f.state.agents, new Set(['root']))
  const values = [...layout.values()]
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    assert.ok(Math.abs(values[i].x - values[j].x) >= 310 || Math.abs(values[i].y - values[j].y) >= 230)
  }
  const anchored = new Set(layout.keys())
  layout.set('dragged', { ...values[1], id: 'dragged', pinned: true, x: -3000, y: -3000 })
  const again = stableAgentLayout(layout, anchored)
  for (const [id, agent] of layout) assert.deepEqual([again.get(id)?.x, again.get(id)?.y], [agent.x, agent.y])
})
