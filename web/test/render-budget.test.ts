import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createFrameLoop } from '../lib/frame-loop'
import { renderBudget, hasActiveAgents, hasVisualMotion, limitVisualParticles } from '../lib/render-budget'

it('caps graphics and resolution, preserves active effects, and reduces detail for crowded graphs', () => {
  const low = renderBudget('low', 2, true, false)
  assert.equal(low.fps, 24)
  assert.equal(low.bloom, false)
  assert.ok(low.particles > 0 && low.stars > 0)
  assert.ok(low.pixelRatio <= 1.25)
  const dense = renderBudget('low', 40, true, false)
  assert.ok(dense.fps < low.fps && dense.particles < low.particles)
  assert.equal(dense.stars, 0)
  assert.equal(dense.detailed, false)
  assert.equal(renderBudget('full', 2, false, false).bloom, false)
  assert.equal(renderBudget('full', 2, false, false).fps, 30)
  assert.equal(renderBudget('full', 2, false, false).detailed, false)
  assert.equal(renderBudget('off', 2, false, false).fps, 8)
  assert.equal(hasActiveAgents([{ state: 'complete' }, { state: 'idle' }]), false)
  assert.equal(hasActiveAgents([{ state: 'waiting_permission' }]), true)
  const particles = [{ type: 'return' }, ...Array.from({ length: 100 }, () => ({ type: 'tool_call' }))]
  const limited = limitVisualParticles(particles, 4)
  assert.equal(limited.length, 4)
  assert.ok(limited.some(particle => particle.type === 'return'))
})

it('cancels every scheduled graphics callback while hidden and resumes once at the current time', () => {
  let id = 0, now = 0, calls = 0
  const frames = new Map<number, (time: number) => void>()
  const timers = new Map<number, { fn: () => void; ms: number }>()
  const loop = createFrameLoop({ request: fn => { frames.set(++id, fn); return id }, cancel: key => { frames.delete(key) },
    delay: (fn, ms) => { timers.set(++id, { fn, ms }); return id }, clear: key => { timers.delete(key) }, now: () => now },
    () => { calls++; now += 3 }, () => 1000 / 24)
  loop.setVisible(true)
  assert.equal(frames.size, 1)
  const [firstId, first] = [...frames][0]
  frames.delete(firstId); first(now)
  assert.equal(calls, 1)
  assert.equal(timers.size, 0)
  assert.equal(frames.size, 1)
  loop.setVisible(false)
  assert.equal(timers.size + frames.size, 0)
  now += 86400000
  assert.equal(calls, 1)
  loop.setVisible(true)
  loop.setVisible(true)
  assert.equal(frames.size, 1)
  const [nextId, next] = [...frames][0]
  frames.delete(nextId); next(now)
  assert.equal(calls, 2)
  loop.dispose()
  assert.equal(timers.size + frames.size, 0)
})


it('keeps fractional frame deadlines aligned with refresh and does not burst after a delayed frame', () => {
  let id = 0
  const frames = new Map<number, (time: number) => void>()
  const calls: number[] = []
  const loop = createFrameLoop({ request: fn => { frames.set(++id, fn); return id }, cancel: key => { frames.delete(key) },
    delay: () => { throw new Error('Frame pacing must not depend on timer jitter') }, clear() {}, now: () => 0 },
    time => calls.push(time), () => 1000 / 24)
  const refresh = (time: number) => { const [key, fn] = [...frames][0]; frames.delete(key); fn(time) }
  loop.setVisible(true)
  for (let index = 0; index <= 60; index++) refresh(index * 1000 / 60)
  assert.equal(calls.length, 25)
  const gaps = calls.slice(1).map((time, index) => Math.round(time - calls[index]))
  assert.ok(gaps.every(gap => gap === 33 || gap === 50))
  refresh(3000)
  const afterStall = calls.length
  refresh(3010)
  assert.equal(calls.length, afterStall)
  assert.equal(frames.size, 1)
  loop.dispose()
  assert.equal(frames.size, 0)
})


it('keeps result/error animations at the working cadence until the last transient has faded', () => {
  const agents = [{ state: 'error' as const, isMain: true, opacity: 1 }]
  const failedCard = [{ opacity: 0.5, historical: false }]
  assert.equal(renderBudget('full', 1, hasVisualMotion(agents, failedCard, 0, 0), false).fps, 60)
  assert.equal(hasVisualMotion(agents, [], 1, 0), true)
  assert.equal(hasVisualMotion(agents, [], 0, 0, 1), true)
  assert.equal(hasVisualMotion(agents, [{ opacity: 0, historical: false }], 0, 0), false)
  assert.equal(hasVisualMotion(agents, [{ opacity: 1, historical: true }], 0, 0), false)
  assert.equal(renderBudget('full', 1, hasVisualMotion(agents, [], 0, 0), false).fps, 30)
})


it('paces Full standby motion evenly at 30 FPS on a 60 Hz display without enabling expensive idle effects', () => {
  let pending: ((time: number) => void) | undefined
  const calls: number[] = []
  const budget = renderBudget('full', 1, false, false)
  const loop = createFrameLoop({ request: fn => { pending = fn; return 1 }, cancel() { pending = undefined }, delay: () => 0, clear() {}, now: () => 0 },
    time => calls.push(time), () => 1000 / budget.fps)
  loop.setVisible(true)
  for (let frame = 0; frame <= 60; frame++) { const fn = pending!; pending = undefined; fn(frame * 1000 / 60) }
  assert.equal(calls.length, 31)
  assert.ok(calls.slice(1).every((time, index) => Math.abs(time - calls[index] - 1000 / 30) < 0.01))
  assert.equal(budget.bloom, false)
  assert.equal(budget.detailed, false)
  assert.ok(budget.stars < renderBudget('full', 1, true, false).stars)
  loop.dispose()
})
