import { it } from 'node:test'
import assert from 'node:assert/strict'
import type { SimulationEvent } from '../lib/agent-types'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { computeNextFrame } from '../hooks/simulation/animate'

it('restores a long history quietly across batches, preserves transcripts, and animates new work', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  const apply = (event: SimulationEvent) => {
    state = processEvent(event, { ...state, currentTime: event.time }, ctx)
  }
  const frame = (time: number) => {
    state = computeNextFrame(state, 0.1, time, time, state, {
      useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0,
    })
  }
  apply({ time: 0, historical: true, type: 'agent_spawn', payload: { name: 'orchestrator', isMain: true } })
  for (let i = 0; i < 50; i++) {
    apply({ time: i * 10, historical: true, type: 'tool_call_start', payload: { agent: 'orchestrator', tool: 'exec', callId: `${i}`, args: 'old command' } })
    // A frame may run between IPC batches. Keep pending calls for correlation,
    // but never flash their cards or particles while loading history.
    frame(i * 10)
    assert.equal(state.particles.length, 0)
    assert.equal([...state.toolCalls.values()].filter(tool => tool.opacity > 0).length, 0)
    apply({ time: i * 10 + 1, historical: true, type: 'tool_call_end', payload: { agent: 'orchestrator', tool: 'exec', callId: `${i}`, result: 'old result' } })
  }
  frame(501)
  assert.equal(state.toolCalls.size, 0)
  assert.equal(state.conversations.get('orchestrator')?.filter(message => message.type === 'tool_result').length, 50)
  assert.equal(state.timelineEntries.get('orchestrator')?.blocks.filter(block => block.type === 'tool_call').length, 50)
  apply({ time: 502, type: 'tool_call_start', payload: { agent: 'orchestrator', tool: 'exec', callId: 'new', args: 'new command' } })
  frame(502)
  assert.ok([...state.toolCalls.values()].some(tool => tool.callId === 'new' && tool.opacity > 0))
  assert.ok(state.particles.length > 0)
})

it('shows a new result for a restored pending call and allows explicit history review', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  state = processEvent({ time: 0, historical: true, type: 'agent_spawn', payload: { name: 'orchestrator', isMain: true } }, state, ctx)
  const start: SimulationEvent = { time: 0, historical: true, type: 'tool_call_start', payload: { agent: 'orchestrator', tool: 'exec', callId: 'pending' } }
  state = processEvent(start, state, ctx)
  assert.equal([...state.toolCalls.values()][0].historical, true)
  state = processEvent({ time: 1, type: 'tool_call_end', payload: { agent: 'orchestrator', tool: 'exec', callId: 'pending', result: 'new result' } }, { ...state, currentTime: 1 }, ctx)
  assert.equal([...state.toolCalls.values()][0].historical, false)
  assert.ok(state.particles.length > 0)
  // Seeking rebuilds from the log with historical=false so old work is visible.
  const reviewed = processEvent({ ...start, historical: false }, { ...state, toolCalls: new Map() }, ctx)
  assert.equal([...reviewed.toolCalls.values()][0].historical, undefined)
})


it('hydrates latest state and the inactive catalog directly, then processes new events without replaying prior work', () => {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = processEvent({ type: 'session_snapshot', time: 90000, sequence: 1, historical: true, payload: { round: 88, agents: [
    { id: 'root', isMain: true, name: 'Long project', state: 'thinking', compacting: true, model: 'gpt-6.1-sol', tokensUsed: 300000, tokensMax: 475000 },
    { id: '/root/check', parentId: 'root', state: 'tool_calling', currentTool: 'exec', model: 'gpt-6-sol', tokensUsed: 20000, tools: [{ callId: 'current', tool: 'exec', args: 'npm test' }] },
    { id: '/root/old', parentId: 'root', state: 'complete', tokensUsed: 90000 },
  ] } }, createEmptyState(), ctx)
  assert.ok(state.agents.get('root')?.contextRecharge)
  assert.equal(state.round, 88)
  assert.equal(state.agents.get('root')?.tokensUsed, 300000)
  assert.equal(state.agents.get('root')?.tokensMax, 475000)
  assert.equal(state.agents.get('/root/check')?.currentTool, 'exec')
  assert.equal(state.agents.get('/root/old')?.opacity, 0)
  assert.equal(state.timelineEntries.size, 3)
  assert.equal([...state.conversations.values()].flat().length, 0)
  assert.equal(state.toolCalls.size, 1)
  assert.equal([...state.toolCalls.values()][0].state, 'running')
  assert.equal(state.delegations.size, 1)
  assert.equal(state.particles.length, 0)
  state = processEvent({ type: 'message', time: 90001, sequence: 2, payload: { agent: 'root', role: 'user', content: 'New follow-up' } }, state, ctx)
  assert.equal(state.round, 89)
  assert.equal(state.conversations.get('root')?.length, 1)
})
