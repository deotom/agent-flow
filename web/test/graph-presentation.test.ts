import { it } from 'node:test'
import assert from 'node:assert/strict'
import { compactGraphPresentation, createGraphProjector, graphFit } from '../lib/graph-presentation'
import { createEmptyState } from '../hooks/simulation/types'
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
