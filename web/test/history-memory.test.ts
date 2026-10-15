import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyState } from '../hooks/simulation/types'
import { compactHistory } from '../hooks/simulation/compact-history'
import { HistoryArchive, estimateBytes } from '../lib/history-archive'

it('releases archived event payloads and bounds recent message bodies without mutating stored data', () => {
  const state = createEmptyState()
  const messages = Array.from({ length: 3000 }, (_, index) => ({ id: `message-${index}`, sourceSequence: index + 1,
    type: 'assistant' as const, timestamp: index, content: 'original detail '.repeat(1000), inputData: { patch: 'large patch'.repeat(1000) } }))
  state.conversations.set('root', messages)
  state.eventLog = messages.map(message => ({ time: message.timestamp, sequence: message.sourceSequence, type: 'message' as const, payload: { content: message.content } }))
  state.eventIndex = state.eventLog.length
  const before = estimateBytes(messages)
  const compacted = compactHistory(state, state, 3000)
  const recent = compacted.conversations.get('root')!
  assert.equal(recent.length, 500)
  assert.equal(compacted.eventLog.length, 0)
  assert.equal(compacted.eventIndex, 0)
  assert.ok(recent.every(message => message.content.length <= 1600 && !message.inputData && message.archived))
  assert.ok(estimateBytes(recent) < before / 10)
  assert.equal(messages.length, 3000)
  assert.ok(messages[0].content.length > 1600 && messages[0].inputData.patch.length > 1000)
})

it('keeps unconfirmed data and unplayed events until disk persistence has succeeded', () => {
  const state = createEmptyState()
  state.conversations.set('root', Array.from({ length: 700 }, (_, index) => ({ id: `m-${index}`, sourceSequence: index + 1,
    type: 'assistant' as const, timestamp: index, content: 'full body'.repeat(1000) })))
  state.eventLog = Array.from({ length: 20 }, (_, index) => ({ time: index, sequence: index + 1, type: 'agent_idle' as const, payload: {} }))
  state.eventIndex = 5
  const compacted = compactHistory(state, state, 100)
  assert.ok(compacted.conversations.get('root')!.find(message => message.sourceSequence === 101)!.content.length > 1600)
  assert.equal(compacted.eventLog[0].sequence, 6)
  assert.equal(compacted.eventIndex, 0)
})

it('reports unavailable local storage rather than pretending data was archived', async () => {
  const archive = new HistoryArchive()
  await assert.rejects(archive.saveEvent('session', { time: 0, sequence: 1, type: 'message', payload: {} }), /unavailable/)
  assert.ok(archive.error)
})
