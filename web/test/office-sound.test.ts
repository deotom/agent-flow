import { it } from 'node:test'
import assert from 'node:assert/strict'
import { OfficeSound } from '../lib/office-sound'

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
