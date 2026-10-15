import { it } from 'node:test'
import assert from 'node:assert/strict'
import { animationFrameInterval, shouldAutoSelectSession, transcriptPage } from '../lib/viewer-preferences'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { computeNextFrame } from '../hooks/simulation/animate'

it('keeps a locked selection while allowing initial selection and manual switches', () => {
  assert.equal(shouldAutoSelectSession(true, 'current'), false)
  assert.equal(shouldAutoSelectSession(false, 'current'), true)
  assert.equal(shouldAutoSelectSession(true, null), true)
})

it('pages transcript history without removing or hiding searchable older messages', () => {
  const messages = Array.from({ length: 350 }, (_, index) => index)
  assert.deepEqual(transcriptPage(messages, 100), messages.slice(250))
  assert.deepEqual(transcriptPage(messages, 200), messages.slice(150))
  assert.deepEqual(transcriptPage(messages, 400), messages)
  assert.equal(messages.length, 350)
})

it('reduces render frequency for low GPU and static modes', () => {
  assert.equal(Math.round(1000 / animationFrameInterval('full')), 60)
  assert.equal(Math.round(1000 / animationFrameInterval('low')), 24)
  assert.equal(Math.round(1000 / animationFrameInterval('off')), 12)
})

it('changes particle speed without changing timeline time, and removes completed nodes with effects off', () => {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 200000,
    blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = createEmptyState()
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, state, ctx)
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'child', parent: 'root' } }, state, ctx)
  state = processEvent({ time: 0, type: 'agent_complete', payload: { name: 'child' } }, state, ctx)
  const options = { useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 }
  const slow = computeNextFrame(state, 0.1, 0.1, 0.1, state, { ...options, animationSpeed: 0.5 })
  const fast = computeNextFrame(state, 0.1, 0.1, 0.1, state, { ...options, animationSpeed: 2 })
  assert.equal(slow.currentTime, fast.currentTime)
  assert.ok(slow.particles[0].progress > fast.particles[0].progress)
  const off = computeNextFrame(state, 0.1, 0.1, 0.1, state, { ...options, animationMode: 'off' })
  assert.equal(off.particles.length, 0)
  assert.equal(off.agents.has('child'), false)
  assert.equal(off.agents.has('root'), true)
})
