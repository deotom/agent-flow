import { it } from 'node:test'
import assert from 'node:assert/strict'
import type { SimulationEvent } from '../lib/agent-types'
import { SessionEventBuffer } from '../lib/history-snapshots'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'

const snapshot = (sequence: number, sessionId = 't3:test'): SimulationEvent => ({
  type: 'session_snapshot', sessionId, sequence, time: sequence,
  payload: { source: 't3', preserveHistory: true, agents: [{ id: 'root', isMain: true, name: `Current ${sequence}`, state: 'thinking' }],
    delegations: [], team: { messages: 'large transcript'.repeat(1000), toJSON() { throw new Error('must not serialize') } } },
})

it('keeps one lightweight realtime snapshot per session without estimating or archiving it', () => {
  let archived = 0, estimated = 0
  const history = new SessionEventBuffer(() => { archived++ }, () => { estimated++; return 1 })
  for (let i = 1; i <= 2000; i++) history.ingest(snapshot(i))
  assert.equal(archived, 0)
  assert.equal(estimated, 0)
  assert.equal(history.latestSnapshots.size, 1)
  const latest = history.latestSnapshots.get('t3:test')!
  assert.equal(latest.sequence, 2000)
  assert.equal(latest.payload.team, undefined)
  assert.equal(latest.payload.preserveHistory, false)
  assert.doesNotThrow(() => JSON.stringify(latest))
})

it('switching sessions restores their latest current graph without replaying old catalogs', () => {
  const history = new SessionEventBuffer(() => {}, () => 0)
  history.ingest(snapshot(1, 't3:a'))
  history.ingest(snapshot(1, 't3:b'))
  history.ingest(snapshot(2, 't3:a'))
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  for (const [id, expected] of [['t3:a', 'Current 2'], ['t3:b', 'Current 1'], ['t3:a', 'Current 2']]) {
    const state = processEvent(history.latestSnapshots.get(id)!, createEmptyState(), ctx)
    assert.equal(state.agents.get('root')?.name, expected)
    assert.equal(state.timelineEntries.size, 1)
  }
  history.clear()
  assert.equal(history.latestSnapshots.size, 0)
})

it('passes every native incremental event to estimation and archival in original order', () => {
  const archived: SimulationEvent[] = [], estimated: SimulationEvent[] = []
  const history = new SessionEventBuffer(event => { archived.push(event) }, event => { estimated.push(event); return 1 })
  const events: SimulationEvent[] = [
    { type: 'agent_spawn', time: 1, sequence: 1, sessionId: 'native', payload: { name: 'root' } },
    { type: 'tool_call_start', time: 2, sequence: 2, sessionId: 'native', payload: { callId: 'call' } },
    { type: 'tool_call_end', time: 3, sequence: 3, sessionId: 'native', payload: { callId: 'call' } },
  ]
  for (const event of events) assert.equal(history.ingest(event), event)
  assert.deepEqual(archived, events)
  assert.deepEqual(estimated, events)
  assert.equal(history.latestSnapshots.size, 0)
})

it('new realtime sessions restore empty until the first snapshot, without requesting archive replay', () => {
  const history = new SessionEventBuffer(() => { throw new Error('no realtime archive') }, () => 0)
  assert.deepEqual(history.replayRealtime('t3:new', 0), [])
  assert.equal(history.replayRealtime('native', 0), null)
  history.ingest(snapshot(2, 't3:new'))
  assert.equal(history.replayRealtime('t3:new', 0)?.[0].historical, true)
  assert.deepEqual(history.replayRealtime('t3:new', 2), [])
})

it('releases current snapshots when source sessions disappear', () => {
  const history = new SessionEventBuffer(() => {}, () => 0)
  history.ingest(snapshot(1, 't3:a')); history.ingest(snapshot(1, 't3:b'))
  history.retainSessions(new Set(['t3:b']))
  assert.deepEqual([...history.latestSnapshots.keys()], ['t3:b'])
})

it('does not retain T3 graph events in the simulation log or enable derived T3 archival', async () => {
  const { simulationEventLog, isRealtimeSession } = await import('../lib/history-snapshots')
  let log: SimulationEvent[] = []
  for (let index = 0; index < 2000; index++) log = simulationEventLog(log, [snapshot(index)])
  assert.equal(log.length, 0)
  assert.equal(isRealtimeSession('t3:test'), true)
  assert.equal(isRealtimeSession('native'), false)
  const native: SimulationEvent = { type: 'message', time: 1, payload: { content: 'Keep native history' } }
  assert.deepEqual(simulationEventLog([native], [snapshot(3), native]), [native, native])
})
