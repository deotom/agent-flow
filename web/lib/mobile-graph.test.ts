import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MobileGraphAdapter, type RemoteGraphSnapshot } from './mobile-graph'

test('remote metadata restores the desktop graph and emits only subsequent changes', () => {
  const adapter = new MobileGraphAdapter()
  const snapshot: RemoteGraphSnapshot = { sentAt: 1000, sessions: [{ id: 's', label: 'Session', status: 'active', lastActivity: 1000, runtime: 'codex', agents: [
    { name: 'main', status: 'thinking', tokens: 50 }, { name: 'child', parent: 'main', status: 'working', tool: 'exec_command' },
  ] }] }
  const first = adapter.update(snapshot) as any[]
  const restored = first.find(m => m.type === 'agent-event-batch').events[0]
  assert.equal(restored.type, 'session_snapshot')
  assert.equal(restored.time, 0)
  assert.equal(restored.payload.agents[1].parentId, 'main')
  assert.equal(restored.payload.agents[1].state, 'tool_calling')
  assert.equal(adapter.update(snapshot).some(m => m.type === 'agent-event-batch'), false)
  snapshot.sentAt = 2000
  snapshot.sessions[0].agents[1] = { name: 'child', parent: 'main', status: 'completed' }
  const events = (adapter.update(snapshot).find(m => m.type === 'agent-event-batch') as any).events
  assert.equal(events[0].type, 'session_snapshot')
  assert.equal(events[0].payload.agents[1].state, 'complete')
  assert.equal(events[0].payload.agents[1].currentTool, undefined)
  assert.equal(events[0].time, 1)
})

test('remote snapshots use readable desktop names and remove stale nodes without shifting the graph', async () => {
  const { RemoteState } = await import('../../scripts/remote-state')
  const { createEmptyState } = await import('../hooks/simulation/types')
  const { processEvent } = await import('../hooks/simulation/process-event')
  const source = new RemoteState('workspace')
  source.lifecycle('session-started', { id: 's', label: 'ปิด lot1 ต่อ', status: 'active' })
  const rows = [
    { id: 'orchestrator', name: 'ปิด lot1 ต่อ', isMain: true, runtime: 'claude', state: 'idle', tokensUsed: 100, tokensMax: 200 },
    { id: '/root/open45_triage', parentId: 'orchestrator', runtime: 'codex', state: 'thinking', model: 'gpt-6.1-sol' },
  ]
  source.event({ sessionId: 's', time: 0, type: 'session_snapshot', payload: { agents: rows, round: 28 } })
  const adapter = new MobileGraphAdapter()
  const ctx = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  const apply = (snapshot: any, state = createEmptyState()) => {
    const batch = adapter.update({ sentAt: 1000, ...snapshot }).find(m => m.type === 'agent-event-batch') as any
    for (const event of batch.events) state = processEvent(event, state, ctx)
    return state
  }
  let state = apply(source.snapshot())
  assert.equal(state.agents.get('orchestrator')?.name, 'ปิด lot1 ต่อ')
  assert.equal(state.agents.get('/root/open45_triage')?.name, 'Open45 Triage')
  assert.equal(state.agents.get('orchestrator')?.tokensMax, 200)
  assert.equal(state.agents.get('orchestrator')?.runtime, 'claude')
  assert.equal(state.agents.get('/root/open45_triage')?.runtime, 'codex')
  assert.equal(state.round, 28)
  Object.assign(state.agents.get('orchestrator')!, { x: 321, y: 123, pinned: true })
  source.event({ sessionId: 's', time: 1, type: 'session_snapshot', payload: { agents: rows.slice(0, 1), round: 29 } })
  state = apply(source.snapshot(), state)
  assert.equal(state.agents.size, 1)
  assert.equal(state.agents.get('orchestrator')?.x, 321)
  assert.equal(state.agents.get('orchestrator')?.pinned, true)
})
