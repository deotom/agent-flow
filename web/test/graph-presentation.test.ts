import { it } from 'node:test'
import assert from 'node:assert/strict'
import { compactGraphPresentation, createGraphProjector, graphFit, sessionGraphPresentation } from '../lib/graph-presentation'
import { createEmptyState } from '../hooks/simulation/types'
import { compactHistory } from '../hooks/simulation/compact-history'
import { computeNextFrame } from '../hooks/simulation/animate'
import { hasVisualMotion } from '../lib/render-budget'
import { detectStateChanges } from '../components/agent-visualizer/canvas/detect-state-changes'
import { findAgentAt } from '../components/agent-visualizer/canvas/hit-detection'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'

it('projects Explorer nodes without mutating shared positions, identities or delegation routes', () => {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = createEmptyState()
  for (const name of ['root', 'child-a', 'child-b', 'nested']) state = processEvent({ time: 0, type: 'agent_spawn', payload: { name, parent: name === 'root' ? undefined : name === 'nested' ? 'child-a' : 'root', isMain: name === 'root' } }, state, ctx)
  const before = [...state.agents.values()].map(agent => [agent.x, agent.y])
  const compact = compactGraphPresentation(state)
  assert.deepEqual([...compact.agents.keys()], ['root', 'child-a', 'nested', 'child-b'])
  assert.deepEqual([...state.agents.values()].map(agent => [agent.x, agent.y]), before)
  assert.equal(compact.edges, state.edges)
  assert.equal(compact.agents.get('nested')?.parentId, 'child-a')
})

it('fits the graph into available space while reserving toolbar and footer areas', () => {
  const bounds = { minX: -150, maxX: 150, minY: -70, maxY: 350 }
  for (const [width, height, compact] of [[280, 380, true], [900, 600, false], [350, 250, true]] as const) {
    const fit = graphFit(bounds, width, height, compact, 2)
    assert.ok(fit.scale > 0 && Number.isFinite(fit.scale))
    assert.ok(bounds.minX * fit.scale + fit.x >= 0)
    assert.ok(bounds.maxX * fit.scale + fit.x <= width)
    assert.ok(bounds.minY * fit.scale + fit.y >= (compact ? 82 : 132) - 0.001)
    assert.ok(bounds.maxY * fit.scale + fit.y <= height - (compact ? 30 : 72) + 0.001)
  }
})


it('reuses graph and camera inputs between clock/history updates while invalidating changed nodes and round filters', () => {
  const project = createGraphProjector()
  const state = createEmptyState()
  const initial = project(state, true, true)
  const clockAndHistory = { ...state, currentTime: 100, conversations: new Map(), timelineEntries: new Map() }
  assert.equal(project(clockAndHistory, true, true), initial)
  assert.equal('conversations' in initial, false)
  const changed = project({ ...clockAndHistory, agents: new Map(state.agents) }, true, true)
  assert.notEqual(changed, initial)
  assert.notEqual(project({ ...clockAndHistory, round: 2 }, true, true), changed)
  assert.notEqual(project(clockAndHistory, false, false), initial)
})


it('shows one selectable inactive node per agent after cleanup without reviving force nodes, tools, or effects', () => {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = createEmptyState()
  const emit = (time: number, type: Parameters<typeof processEvent>[0]['type'], payload: Record<string, unknown>, historical = false) => {
    state = processEvent({ time, type, payload, historical }, { ...state, currentTime: time }, ctx)
  }
  emit(0, 'agent_spawn', { name: 'root', isMain: true })
  emit(1, 'agent_spawn', { name: 'child', parent: 'root', model: 'gpt-6-sol', runtime: 'codex' })
  emit(2, 'context_update', { agent: 'child', tokens: 50000 })
  emit(3, 'message', { agent: 'child', role: 'assistant', content: 'Saved result' })
  emit(4, 'agent_complete', { name: 'child' })
  const flowing = sessionGraphPresentation(state)
  assert.equal(flowing.agents.get('child')!.archived, undefined)
  // The normal cleanup still releases finished physical nodes and edges.
  state = computeNextFrame(state, 10, 14, 14, state, { animationMode: 'off', useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 })
  assert.equal(state.agents.has('child'), false)
  const cold = compactHistory({ ...state, conversations: new Map(), delegations: new Map() }, state, 0)
  assert.ok(cold.timelineEntries.get('child')!.agentSummary)
  assert.deepEqual(cold.timelineEntries.get('child')!.blocks, [])
  assert.equal(sessionGraphPresentation(cold).agents.has('child'), true)
  const project = createGraphProjector()
  assert.equal(project(state, true, false).agents.has('child'), false)
  const all = project(state, true, false, true)
  const ghost = all.agents.get('child')!
  assert.equal(all.agents.size, 2)
  assert.equal(ghost.archived, true)
  assert.ok(ghost.opacity > 0 && ghost.opacity < 0.5)
  assert.equal(ghost.model, 'gpt-6-sol')
  assert.equal(ghost.tokensUsed, 50000)
  assert.deepEqual(ghost.messageBubbles, [])
  assert.equal(findAgentAt(ghost.x, ghost.y, all.agents), 'child')
  assert.ok(all.edges.some(edge => edge.from === 'root' && edge.to === 'child'))
  assert.equal(state.agents.has('child'), false)
  assert.equal(state.conversations.get('child')!.at(-1)!.content, 'Saved result')
  assert.equal(hasVisualMotion([ghost], [], 0, 0), false)
  assert.deepEqual(detectStateChanges(new Map([['child', ghost]]), new Map(), new Map(), new Map()).effects, [])
  assert.equal(project({ ...state, currentTime: 1000 }, true, false, true), all)
  const compact = project(state, true, true, true)
  assert.equal(compact.agents.get('child')!.parentId, 'root')
  assert.notEqual(compact.agents.get('child')!.y, compact.agents.get('root')!.y)
  // A reused worker replaces the same summary, with its newest identity/model.
  emit(15, 'agent_spawn', { name: 'child', parent: 'root', model: 'gpt-6.1-sol' })
  const resumed = project(state, true, false, true)
  assert.equal(resumed.agents.size, 2)
  assert.equal(resumed.agents.get('child')!.archived, undefined)
  assert.equal(resumed.agents.get('child')!.model, 'gpt-6.1-sol')
  assert.equal(state.timelineEntries.size, 2)
})

it('reconstructs the inactive catalog on historical restore without retaining message or tool payloads', () => {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = createEmptyState()
  for (const [name, parent] of [['root', undefined], ['child', 'root'], ['nested', 'child']]) {
    state = processEvent({ time: 0, type: 'agent_spawn', payload: { name, parent, isMain: name === 'root' }, historical: true }, state, ctx)
  }
  state = processEvent({ time: 1, type: 'agent_complete', payload: { name: 'child' }, historical: true }, state, ctx)
  state = computeNextFrame(state, 10, 10, 10, state, { animationMode: 'off', useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 })
  const all = sessionGraphPresentation(state)
  assert.equal(all.agents.size, 3)
  assert.ok(all.edges.some(edge => edge.from === 'child' && edge.to === 'nested'))
  for (const entry of state.timelineEntries.values()) {
    assert.ok(entry.agentSummary)
    assert.equal('messageBubbles' in entry.agentSummary, false)
    assert.equal('task' in entry.agentSummary, false)
  }
})
