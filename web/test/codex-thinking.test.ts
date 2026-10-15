import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'

it('animates Codex thinking without plaintext and stops on turn completion', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  const emit = (type: Parameters<typeof processEvent>[0]['type'], payload: Record<string, unknown>) => {
    state = processEvent({ time: 0, type, payload }, state, ctx)
  }
  emit('agent_spawn', { name: 'orchestrator', isMain: true, runtime: 'codex' })
  emit('agent_thinking', { name: 'orchestrator' })
  assert.equal(state.agents.get('orchestrator')?.state, 'thinking')
  assert.equal(state.timelineEntries.get('orchestrator')?.blocks.at(-1)?.type, 'thinking')
  emit('tool_call_start', { agent: 'orchestrator', tool: 'exec', callId: 'run' })
  emit('context_update', { agent: 'orchestrator', tokens: 1234 })
  assert.equal(state.agents.get('orchestrator')?.state, 'tool_calling')
  emit('tool_call_end', { agent: 'orchestrator', tool: 'exec', callId: 'run' })
  assert.equal(state.agents.get('orchestrator')?.state, 'thinking')
  emit('agent_idle', { name: 'orchestrator', state: 'idle' })
  emit('context_update', { agent: 'orchestrator', tokens: 5678 })
  assert.equal(state.agents.get('orchestrator')?.state, 'idle')
  emit('agent_thinking', { name: 'orchestrator' })
  assert.equal(state.agents.get('orchestrator')?.state, 'thinking')
})

it('brings a completed child back when an old session delegates another task', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  const emit = (type: Parameters<typeof processEvent>[0]['type'], payload: Record<string, unknown>) => {
    state = processEvent({ time: 0, type, payload }, state, ctx)
  }
  emit('agent_spawn', { name: 'orchestrator', isMain: true, runtime: 'codex' })
  emit('agent_spawn', { name: '/root/reviewer', parent: 'orchestrator', runtime: 'codex' })
  emit('agent_complete', { name: 'orchestrator', sessionEnd: true })
  assert.equal(state.agents.get('/root/reviewer')?.state, 'complete')
  emit('agent_spawn', { name: '/root/reviewer', parent: 'orchestrator', runtime: 'codex', task: 'Continue review' })
  emit('agent_thinking', { name: '/root/reviewer' })
  assert.equal(state.agents.get('/root/reviewer')?.state, 'thinking')
  assert.equal(state.agents.get('/root/reviewer')?.completeTime, undefined)
  assert.equal(state.timelineEntries.get('/root/reviewer')?.endTime, undefined)
  assert.equal(state.agents.size, 2)
})
