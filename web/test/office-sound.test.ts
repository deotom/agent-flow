import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chooseAmbientMotif, OfficeSound } from '../lib/office-sound'

class Param {
  value = 0
  setValueAtTime(value: number) { this.value = value }
  cancelScheduledValues() {}
  linearRampToValueAtTime(value: number) { this.value = value }
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param()
  buffer: unknown; loop = false; type = ''; onended: (() => void) | null = null
  stopped = false; immediatelyStopped = false
  connect() {}
  disconnect() {}
  start() {}
  stop(at?: number) { this.stopped = true; this.immediatelyStopped ||= at === undefined }
}
class Context {
  currentTime = 0; state = 'suspended'; destination = new Node()
  gains: Node[] = []; sources: Node[] = []; closed = false; samples = 0
  resumeWait: Promise<void> | null = null; resumes = 0
  createGain() { const n = new Node(); this.gains.push(n); return n }
  createBufferSource() { const n = new Node(); this.sources.push(n); return n }
  createBiquadFilter() { return new Node() }
  createOscillator() { const n = new Node(); this.sources.push(n); return n }
  createBuffer(channels: number, length: number) { this.samples = channels * length; return { getChannelData: () => new Float32Array(length) } }
  async resume() { this.resumes++; await this.resumeWait; this.state = 'running' }
  async suspend() { this.state = 'suspended' }
  async close() { this.closed = true; this.state = 'closed' }
}
function setup() {
  const ctx = new Context(); let creations = 0; let now = 0
  const sound = new OfficeSound({ createContext: () => { creations++; return ctx as unknown as AudioContext }, now: () => now })
  return { sound, ctx, creations: () => creations, advance: () => { now += 1000 } }
}
const live = { active: true, night: false, wet: true }
it('stays off and allocates nothing until an explicit enable gesture', async () => {
  const t = setup(); t.sound.update(live)
  assert.equal(t.sound.enabled, false)
  assert.equal(t.sound.playCue('paper'), false)
  assert.equal(t.creations(), 0)
  await t.sound.toggleFromGesture()
  assert.equal(t.creations(), 1)
  assert.ok(t.ctx.samples <= 24000)
  assert.ok(t.ctx.gains[0].gain.value > 0)
  t.sound.dispose()
})
it('silences dry rain, reduces night volume and suppresses inactive cues immediately', async () => {
  const { sound, ctx } = setup(); sound.update(live); await sound.toggleFromGesture()
  const day = ctx.gains[0].gain.value
  sound.update({ ...live, night: true, wet: false })
  assert.ok(ctx.gains[0].gain.value < day)
  assert.equal(ctx.gains[1].gain.value, 0)
  assert.equal(sound.playCue('paper'), true)
  const cue = ctx.sources[1]
  sound.update({ ...live, active: false })
  assert.equal(ctx.gains[0].gain.value, 0)
  assert.equal(cue.immediatelyStopped, true)
  assert.equal(sound.playCue('wood'), false)
  sound.dispose()
})
it('throttles interaction cues, stops sources and never recreates after disposal', async () => {
  const t = setup(); t.sound.update(live); await t.sound.toggleFromGesture()
  assert.equal(t.sound.playCue('paper'), true)
  assert.equal(t.sound.playCue('wood'), false)
  t.advance(); assert.equal(t.sound.playCue('wood'), true)
  t.sound.dispose()
  assert.equal(t.ctx.gains[0].gain.value, 0)
  assert.ok(t.ctx.sources.every(n => n.stopped))
  assert.equal(t.ctx.closed, true)
  assert.equal(await t.sound.toggleFromGesture(), false)
  assert.equal(t.creations(), 1)
})
it('a delayed resume cannot unmute after disable, hidden state or disposal', async () => {
  for (const action of ['disable', 'hide', 'dispose']) {
    const t = setup(); let release!: () => void
    t.ctx.resumeWait = new Promise<void>(resolve => { release = resolve })
    t.sound.update(live)
    const enabling = t.sound.toggleFromGesture()
    await Promise.resolve()
    assert.equal(t.ctx.resumes, 1)
    if (action === 'disable') void t.sound.toggleFromGesture()
    if (action === 'hide') t.sound.update({ ...live, active: false })
    if (action === 'dispose') t.sound.dispose()
    release(); await enabling
    assert.equal(t.ctx.gains[0].gain.value, 0, action)
    assert.equal(t.sound.playCue('paper'), false, action)
  }
})
it('serializes rapid off/on changes while an earlier resume is pending', async () => {
  const t = setup(); let release!: () => void
  t.ctx.resumeWait = new Promise<void>(resolve => { release = resolve })
  t.sound.update(live)
  const first = t.sound.toggleFromGesture()
  await Promise.resolve()
  const off = t.sound.toggleFromGesture()
  assert.equal(t.ctx.gains[0].gain.value, 0)
  const on = t.sound.toggleFromGesture()
  release(); await Promise.all([first, off, on])
  assert.equal(t.sound.enabled, true)
  assert.ok(t.ctx.gains[0].gain.value > 0)
  assert.equal(t.creations(), 1)
  t.sound.dispose()
})
it('unsupported or failed contexts degrade to disabled', async () => {
  const sound = new OfficeSound({ createContext: null })
  assert.equal(sound.available, false)
  assert.equal(await sound.toggleFromGesture(), false)
  const broken = new OfficeSound({ createContext: () => { throw new Error('unavailable') } })
  assert.equal(await broken.toggleFromGesture(), false)
  assert.equal(broken.enabled, false)
})
it('plays a soft attention cue only when audible and stops it immediately on mute', async () => {
  const t = setup(); t.sound.update(live)
  assert.equal(t.sound.playCue('attention'), false)
  await t.sound.toggleFromGesture()
  t.advance()
  assert.equal(t.sound.playCue('attention'), true)
  const osc = t.ctx.sources.at(-1)!
  assert.equal(osc.type, 'sine')
  t.sound.update({ ...live, active: false })
  assert.equal(osc.immediatelyStopped, true)
  t.sound.dispose()
})

it('paints dry breeze & room warmth beds, scales volume, and zeroes all beds when muted or disposed', async () => {
  const ctx = new Context(); let now = 0
  const timers: { id: number; fn: () => void; ms: number }[] = []
  let nextId = 1
  const cleared = new Set<number>()
  const sound = new OfficeSound({
    createContext: () => ctx as unknown as AudioContext,
    now: () => now,
    random: () => 0.4,
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, fn, ms }); return id },
    clearTimer: (h) => { cleared.add(Number(h)) },
  })
  sound.update({ active: true, night: false, wet: false, phase: 'day', season: 'hot', liveliness: 'normal', working: true })
  await sound.toggleFromGesture()
  assert.equal(ctx.gains[1].gain.value, 0, 'rain bed stays silent when dry')
  assert.ok(ctx.gains[2].gain.value > 0, 'dry gentle breeze bed is active')
  assert.ok(ctx.gains[3].gain.value > 0, 'warm room tone bed is active')
  const baseline = ctx.gains[0].gain.value
  sound.setVolume(0.3)
  assert.ok(ctx.gains[0].gain.value < baseline, 'setVolume scales master gain proportionally')
  sound.setVolume(0); assert.equal(sound.volume, 0.1)
  sound.setVolume(2); assert.equal(sound.volume, 1)
  sound.update({ active: false, night: false, wet: false })
  for (const g of ctx.gains.slice(0, 4)) assert.equal(g.gain.value, 0)
  sound.dispose()
})

it('chooseAmbientMotif reflects weather, time of day, liveliness, and holidays', () => {
  assert.equal(chooseAmbientMotif({ active: true, night: false, wet: true, weather: 'storm' }, 0.1), 'thunder')
  assert.equal(chooseAmbientMotif({ active: true, night: false, wet: true, weather: 'rain' }, 0.2), 'raindrop')
  assert.equal(chooseAmbientMotif({ active: true, night: true, wet: false }, 0.2), 'cricket')
  assert.equal(chooseAmbientMotif({ active: true, night: false, wet: false, phase: 'day', holiday: 'loy-krathong' }, 0.6), 'chime')
  assert.equal(chooseAmbientMotif({ active: true, night: false, wet: false, phase: 'day', working: true, liveliness: 'normal' }, 0.9), 'workshop')
  assert.equal(chooseAmbientMotif({ active: true, night: false, wet: false, phase: 'day', working: true, liveliness: 'quiet' }, 0.9), 'bird')
})

it('schedules ambient synth motifs cleanly and stops or cancels timers on mute or disposal', async () => {
  const ctx = new Context(); let now = 0
  const queue: { id: number; fn: () => void; ms: number }[] = []
  const cleared: number[] = []
  let nextId = 1
  const sound = new OfficeSound({
    createContext: () => ctx as unknown as AudioContext,
    now: () => now,
    random: () => 0.15,
    setTimer: (fn, ms) => { const entry = { id: nextId++, fn, ms }; queue.push(entry); return entry.id },
    clearTimer: (h) => { cleared.push(Number(h)) },
  })
  const dayState = { active: true, night: false, wet: false, phase: 'day' as const, weather: 'clear' as const, season: 'cool' as const, liveliness: 'normal' as const }
  sound.update(dayState)
  await sound.toggleFromGesture()
  assert.equal(queue.length, 1)
  assert.equal(ctx.sources.length, 1, 'initial toggle creates only the shared noise loop')
  queue.shift()!.fn()
  assert.ok(ctx.sources.length > 1, 'scheduled ambient timer synthesizes a bird/nature motif')
  assert.equal(queue.length, 1, 're-schedules the next organic motif')
  const ambientSources = ctx.sources.slice(1)
  const pendingTimer = queue.at(-1)!.id
  sound.update({ ...dayState, active: false })
  assert.ok(cleared.includes(pendingTimer), 'muting clears pending ambient timer')
  assert.ok(ambientSources.every(s => s.immediatelyStopped), 'muting immediately stops active ambient motif nodes')
  sound.update(dayState)
  assert.ok(queue.length >= 2)
  const beforeDisposeTimer = queue.at(-1)!.id
  queue.pop()!.fn()
  const finalTimer = queue.at(-1)!.id
  assert.notEqual(finalTimer, beforeDisposeTimer)
  sound.dispose()
  assert.ok(cleared.includes(finalTimer))
  assert.ok(ctx.sources.every(s => s.stopped))
})

it('plays distinct throttled holiday synth cues across all 6 festivals', async () => {
  const t = setup()
  t.sound.update({ active: true, night: false, wet: false, holiday: 'songkran' })
  await t.sound.toggleFromGesture()
  for (const holiday of ['loy-krathong', 'songkran', 'christmas', 'halloween', 'new-year', 'valentine'] as const) {
    t.sound.update({ active: true, night: false, wet: false, holiday })
    t.advance()
    const before = t.ctx.sources.length
    assert.equal(t.sound.playCue('holiday'), true, `plays ${holiday} cue`)
    assert.equal(t.sound.playCue('holiday'), false, `throttles rapid ${holiday} repeat`)
    assert.ok(t.ctx.sources.length > before, `${holiday} cue allocates synth notes`)
  }
  const latest = t.ctx.sources.at(-1)!
  t.sound.update({ active: false, night: false, wet: false, holiday: 'valentine' })
  assert.equal(latest.immediatelyStopped, true)
  t.sound.dispose()
})
