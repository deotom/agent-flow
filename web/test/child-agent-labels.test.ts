import { it } from 'node:test'
import assert from 'node:assert/strict'
import { formatAgentName, formatModelName } from '../lib/utils'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { computeNextFrame } from '../hooks/simulation/animate'

it('shows readable child names while keeping routing IDs and model after the node fades and resumes', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 258400, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  const name = '/root/remaining_reads_round2'
  let state = createEmptyState()
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name, runtime: 'codex', parent: 'orchestrator' } }, state, ctx)
  state = processEvent({ time: 0, type: 'model_detected', payload: { agent: name, model: 'gpt-6-sol' } }, state, ctx)
  state = processEvent({ time: 0, type: 'message', payload: { agent: name, content: 'Earlier progress' } }, state, ctx)
  state = processEvent({ time: 0, type: 'agent_complete', payload: { name } }, state, ctx)
  state = computeNextFrame(state, 2, 2, 2, state, { useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 })
  assert.equal(state.agents.has(name), false)
  state = processEvent({ time: 3, type: 'agent_spawn', payload: { name, runtime: 'codex', parent: 'orchestrator' } }, state, ctx)
  const child = state.agents.get(name)!
  assert.equal(child.id, name)
  assert.equal(child.name, 'Remaining Reads Round 2')
  assert.equal(child.model, 'gpt-6-sol')
  assert.equal(formatModelName(child.model!), 'GPT-6-sol')
  assert.equal(state.timelineEntries.get(name)?.agentName, child.name)
  assert.equal(state.conversations.get(name)?.[0].content, 'Earlier progress')
})

it('preserves ordinary names and distinguishes numbered child tasks', () => {
  assert.equal(formatAgentName('ตรวจ API'), 'ตรวจ API')
  assert.equal(formatAgentName('/root/reviewer/nested_check_round3'), 'Nested Check Round 3')
  assert.notEqual(formatAgentName('/root/read_round2'), formatAgentName('/root/read_round3'))
})
