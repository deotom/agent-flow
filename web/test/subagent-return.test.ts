import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { computeNextFrame } from '../hooks/simulation/animate'

function fixture() {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = createEmptyState()
  const emit = (type: Parameters<typeof processEvent>[0]['type'], payload: Record<string, unknown>, historical = false) => {
    state = processEvent({ time: state.currentTime, type, payload, historical }, state, ctx)
  }
  const frame = (delta: number) => {
    state = computeNextFrame(state, delta, state.currentTime + delta, state.currentTime + delta, state,
      { useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 })
  }
  emit('agent_spawn', { name: 'main', isMain: true })
  emit('agent_spawn', { name: 'child', parent: 'main', runtime: 'codex' })
  return { emit, frame, get state() { return state } }
}

it('returns from child to main on completion and keeps the node and edge until arrival', () => {
  const f = fixture()
  f.emit('agent_complete', { name: 'child' })
  assert.equal(f.state.particles.filter(particle => particle.type === 'return').length, 1)
  assert.equal(f.state.particles[0].progress, 1)
  f.frame(0.25)
  assert.ok(f.state.particles[0].progress < 1 && f.state.particles[0].progress > 0)
  assert.equal(f.state.agents.get('child')?.opacity, 1)
  assert.equal(f.state.agents.get('main')?.resultPulse, 0)
  assert.ok(f.state.edges.some(edge => edge.from === 'main' && edge.to === 'child'))
  f.frame(1)
  assert.equal(f.state.particles.filter(particle => particle.type === 'return').length, 0)
  assert.ok(f.state.agents.has('child'))
  assert.equal(f.state.agents.get('main')?.resultPulse, 1)
  f.frame(3)
  assert.equal(f.state.agents.get('main')?.resultPulse, 0)
  assert.equal(f.state.agents.has('child'), false)
  assert.equal(f.state.edges.some(edge => edge.to === 'child'), false)
})

it('deduplicates explicit returns and late completion messages but allows a subsequent task to return again', () => {
  const f = fixture()
  f.emit('subagent_return', { child: 'child', parent: 'main', summary: 'Finished' })
  f.emit('agent_complete', { name: 'child' })
  f.emit('subagent_return', { child: 'child', parent: 'main', summary: 'Late final answer' })
  assert.equal(f.state.particles.filter(particle => particle.type === 'return').length, 1)
  f.frame(1)
  f.emit('agent_spawn', { name: 'child', parent: 'main' })
  f.emit('agent_complete', { name: 'child' })
  assert.equal(f.state.particles.filter(particle => particle.type === 'return').length, 1)
  f.frame(1)
  f.frame(3)
  f.emit('subagent_return', { child: 'child', parent: 'main', summary: 'Very late final answer' })
  assert.equal(f.state.particles.filter(particle => particle.type === 'return').length, 0)
})

it('does not replay old returns or imply a successful return for aborted work', () => {
  const f = fixture()
  f.emit('agent_complete', { name: 'child' }, true)
  assert.equal(f.state.particles.length, 0)
  f.frame(0.1)
  assert.equal(f.state.agents.has('child'), false)
  assert.equal(f.state.agents.get('main')?.resultPulse, 0)
  f.emit('agent_spawn', { name: 'child', parent: 'main' })
  f.emit('agent_complete', { name: 'child', aborted: true })
  assert.equal(f.state.particles.length, 0)
})

it('routes a nested agent return to its actual parent', () => {
  const f = fixture()
  f.emit('agent_spawn', { name: 'grandchild', parent: 'child' })
  f.emit('subagent_return', { child: 'grandchild', parent: 'main' })
  assert.equal(f.state.particles.at(-1)?.edgeId, 'edge-child-grandchild')
})

it('reuses the settled agent map between elapsed-counter updates', () => {
  const f = fixture()
  f.emit('agent_complete', { name: 'child' }, true)
  f.frame(1)
  f.frame(0.1)
  const settled = f.state.agents
  f.frame(0.1)
  assert.equal(f.state.agents, settled)
  assert.equal(f.state.agents.get('main')?.timeAlive, 1)
})
