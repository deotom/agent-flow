import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RemoteState } from './remote-state'
import { webcrypto } from 'node:crypto'
import { createCipher, generatePairingKey } from '../mobile/protocol.mjs'

test('mobile projection excludes prompt, paths, tool arguments, and results', () => {
  const state = new RemoteState('workspace')
  state.lifecycle('session-started', { id: 'session1', label: 'My session' })
  state.event({ sessionId: 'session1', time: 0, type: 'agent_spawn', payload: { name: 'Orchestrator', task: 'SECRET PROMPT', runtime: 'codex' } })
  state.event({ sessionId: 'session1', time: 1, type: 'tool_call_start', payload: { agent: 'Orchestrator', tool: 'exec_command', args: 'SECRET COMMAND', inputData: { path: 'SECRET PATH' } } })
  state.event({ sessionId: 'session1', time: 2, type: 'tool_call_end', payload: { agent: 'Orchestrator', result: 'SECRET RESULT' } })
  const snapshot = state.snapshot()
  assert.equal(JSON.stringify(snapshot).includes('SECRET'), false)
  assert.equal(snapshot.sessions[0].runtime, 'codex')
  assert.equal(snapshot.sessions[0].label, 'My session')
  assert.equal(snapshot.sessions[0].agents[0].tool, undefined)
  assert.equal(snapshot.sessions[0].recent.length, 3)
})
test('mobile state bounds memory and preserves parent links and input state', () => {
  const state = new RemoteState('workspace')
  for (let i = 0; i < 25; i++) state.lifecycle('session-started', { id: String(i) })
  state.event({ sessionId: '24', time: 0, type: 'subagent_dispatch', payload: { parent: 'Main', child: 'Child', task: 'private' } })
  state.event({ sessionId: '24', time: 1, type: 'input_requested', payload: { agent: 'Child' } })
  const snapshot = state.snapshot()
  assert.equal(snapshot.sessions.length, 12)
  const agent = snapshot.sessions.find(s => s.id === '24')!.agents[0]
  assert.equal(agent.parent, 'Main')
  assert.equal(agent.status, 'needs-input')
})
test('AES-GCM encryption roundtrips and rejects wrong keys or modified ciphertext', async () => {
  const token = generatePairingKey(webcrypto)
  const first = await createCipher(token, webcrypto)
  const receiver = await createCipher(token, webcrypto)
  const wrong = await createCipher(generatePairingKey(webcrypto), webcrypto)
  const value = { workspace: 'private', sessions: [] }
  const envelope = await first.seal(value)
  assert.equal(first.topic, receiver.topic)
  assert.notEqual(first.topic, wrong.topic)
  assert.deepEqual(await receiver.open(envelope), value)
  assert.equal(JSON.stringify(envelope).includes('private'), false)
  await assert.rejects(wrong.open(envelope))
  await assert.rejects(receiver.open({ ...envelope, data: (envelope.data[0] === 'A' ? 'B' : 'A') + envelope.data.slice(1) }))
  const largerSnapshot = { data: 'x'.repeat(90_000) }
  assert.deepEqual(await receiver.open(await first.seal(largerSnapshot)), largerSnapshot)
  await assert.rejects(createCipher('short', webcrypto))
})

test('authoritative snapshots replace stale agents and preserve desktop metadata', () => {
  const state = new RemoteState('workspace')
  state.lifecycle('session-started', { id: 's', label: 'Initial title' })
  state.lifecycle('session-updated', { id: 's', label: 'ปิด lot1 ต่อ' })
  state.event({ sessionId: 's', time: 0, type: 'agent_spawn', payload: { name: 'stale' } })
  state.event({ sessionId: 's', time: 1, type: 'session_snapshot', payload: { agents: [
    { id: 'orchestrator', name: 'ปิด lot1 ต่อ', isMain: true, runtime: 'codex', state: 'idle', tokensUsed: 100, tokensMax: 200, toolCalls: 3 },
    { id: '/root/open45_triage', parentId: 'orchestrator', state: 'thinking', model: 'gpt-6.1-sol' },
  ] } })
  state.event({ sessionId: 's', time: 2, type: 'message', payload: { from: 'ghost', text: 'SECRET' } })
  const session = state.snapshot().sessions[0]
  assert.equal(session.label, 'ปิด lot1 ต่อ')
  assert.deepEqual(session.agents.map(a => a.name), ['orchestrator', '/root/open45_triage'])
  assert.equal(session.agents[0].tokensMax, 200)
  assert.equal(session.agents[0].displayName, session.label)
  assert.equal(session.agents[1].parent, 'orchestrator')
})
