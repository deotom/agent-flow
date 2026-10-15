import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'

it('keeps parallel Codex tools distinct and correlates out-of-order results by call id', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'orchestrator', isMain: true } }, state, ctx)
  for (const callId of ['first', 'second']) {
    state = processEvent({ time: 0, type: 'tool_call_start', payload: { agent: 'orchestrator', tool: 'exec', callId, args: callId } }, state, ctx)
  }
  assert.equal(state.toolCalls.size, 2)
  state = processEvent({ time: 0, type: 'tool_call_end', payload: { agent: 'orchestrator', tool: 'exec', callId: 'second', result: 'second result' } }, state, ctx)
  const calls = [...state.toolCalls.values()]
  assert.equal(calls.find(c => c.callId === 'first')?.state, 'running')
  assert.equal(calls.find(c => c.callId === 'second')?.result, 'second result')
  assert.equal(state.agents.get('orchestrator')?.state, 'tool_calling')
  state = processEvent({ time: 0, type: 'tool_call_end', payload: { agent: 'orchestrator', tool: 'exec', callId: 'first', result: 'first result' } }, state, ctx)
  assert.equal(state.agents.get('orchestrator')?.state, 'thinking')
})

it('tracks every file in a Codex patch in the Files panel', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'orchestrator', isMain: true } }, state, ctx)
  state = processEvent({ time: 0, type: 'tool_call_start', payload: { agent: 'orchestrator', tool: 'apply_patch', callId: 'patch', inputData: { file_paths: ['first.ts', 'second.ts'] } } }, state, ctx)
  assert.equal(state.fileAttention.get('first.ts')?.edits, 1)
  assert.equal(state.fileAttention.get('second.ts')?.edits, 1)
})
