import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFICE_CHAT_GAP, OFFICE_DESK_REACH, OFFICE_LOUNGE_REACH, OFFICE_STILL, officeLife, officeLifePairs, officeSeed } from '../lib/office-life'
import type { OfficeActor } from '../lib/office-types'
import type { TeamAgentStatus } from '../lib/team-types'

const actor = (key: string, status: TeamAgentStatus, zone: 'desk' | 'lounge' = 'desk', x = 100, y = 200, floorId = 'f'): OfficeActor => ({
  key, sessionId: 's', agent: { id: key, status, role: 'worker', activities: [] }, task: null, parentKey: null,
  appearance: { slot: 0, kind: 'human', hair: '#000', skin: '#fff', shirt: '#f00', pants: '#00f', cut: 'bun', gear: 'headset' },
  floorId, zone, x, y, activity: '', runtimeName: '',
} as unknown as OfficeActor)
const keys = Array.from({ length: 24 }, (_, i) => `agent-${i}`)
const times = Array.from({ length: 400 }, (_, i) => .05 + i * .37)
const statuses: TeamAgentStatus[] = ['running', 'thinking', 'waiting_approval', 'waiting_input', 'failed', 'background', 'idle', 'done', 'cancelled']

test('time zero is the canonical still frame for every status and zone', () => {
  for (const status of statuses) for (const zone of ['desk', 'lounge'] as const) {
    const frame = officeLife(actor('a', status, zone), 0, { partnerDx: 80, pairSeed: .3 })
    assert.deepEqual({ ...frame, typing: false }, { ...OFFICE_STILL })
  }
})

test('real status wins: active, waiting and failed agents never doze, wander or leave their seat', () => {
  for (const status of ['running', 'thinking', 'waiting_approval', 'waiting_input', 'failed', 'background'] as const)
    for (const zone of ['desk', 'lounge'] as const) for (const key of keys) for (const t of times) {
      const f = officeLife(actor(key, status, zone), t, { partnerDx: 90, pairSeed: officeSeed(key) })
      assert.equal(f.doze, false, `${status} ${zone} dozed`)
      assert.equal(f.dx, 0, `${status} ${zone} moved`)
      assert.equal(f.walk || f.stand, false)
      if (status !== 'running') assert.equal(f.typing, false)
    }
})

test('every frame is finite and within amplitude limits', () => {
  for (const status of statuses) for (const zone of ['desk', 'lounge'] as const) for (const key of keys) for (const t of times) {
    const f = officeLife(actor(key, status, zone), t, { partnerDx: key.length % 2 ? 140 : -140, pairSeed: .4 })
    for (const value of [f.dx, f.hop, f.stretch, f.lean, f.turn]) assert.ok(Number.isFinite(value))
    assert.ok(Math.abs(f.dx) <= Math.max(OFFICE_DESK_REACH, OFFICE_LOUNGE_REACH, (140 - OFFICE_CHAT_GAP) / 2) + 1e-9)
    assert.ok(f.hop >= 0 && f.hop <= 2 + 1e-9)
    assert.ok(f.stretch >= 0 && f.stretch <= 1)
    assert.ok(Math.abs(f.lean) <= 4 * Math.PI / 180 + 1e-9)
    assert.ok(Math.abs(f.turn) <= 1)
    if (zone === 'desk') assert.ok(Math.abs(f.dx) <= OFFICE_DESK_REACH + 1e-9)
  }
})

test('trips, walking and climbing suppress life entirely', () => {
  for (const t of times) {
    assert.deepEqual(officeLife(actor('a', 'idle'), t, { tripActive: true }), OFFICE_STILL)
    assert.deepEqual(officeLife({ ...actor('a', 'done', 'lounge'), pose: { climb: true } }, t), OFFICE_STILL)
  }
})

test('running agents type in short bursts and take brief breaks', () => {
  const typing = times.map(t => officeLife(actor('typist', 'running'), t).typing)
  const share = typing.filter(Boolean).length / typing.length
  assert.ok(share > .45 && share < .8, `typing share ${share}`)
})

test('idle and resting agents show life: someone dozes, someone strolls, strolls return home smoothly', () => {
  const frames = keys.flatMap(key => times.map(t => officeLife(actor(key, 'idle'), t)))
  assert.ok(frames.some(f => f.doze && f.mood === 'zzz'))
  assert.ok(frames.some(f => f.walk && f.dx !== 0))
  for (const key of keys) {
    let last = officeLife(actor(key, 'idle'), .01).dx
    for (let t = .01; t < 60; t += 1 / 45) { const dx = officeLife(actor(key, 'idle'), t).dx; assert.ok(Math.abs(dx - last) < 1.5, `${key} jumped at ${t}`); last = dx }
  }
})

test('lounge partners meet keeping the chat gap, face each other and take turns speaking', () => {
  const left = actor('l', 'done', 'lounge', 100), right = actor('r', 'done', 'lounge', 200)
  const pairs = officeLifePairs([right, left])
  const pl = pairs.get('l')!, pr = pairs.get('r')!
  assert.equal(pl.partnerKey, 'r'); assert.equal(pr.partnerKey, 'l'); assert.equal(pl.pairSeed, pr.pairSeed)
  let met = false, both = false
  for (let t = .01; t < 64; t += .1) {
    const a = officeLife(left, t, pl), b = officeLife(right, t, pr)
    const gap = (right.x + b.dx) - (left.x + a.dx)
    assert.ok(gap >= OFFICE_CHAT_GAP - 1e-6, `gap ${gap}`)
    if (a.mood === 'chat' || b.mood === 'chat') { met = true; assert.equal(a.face, 1); assert.equal(b.face, -1) }
    if (a.mood === 'chat' && b.mood === 'chat') both = true
  }
  assert.ok(met); assert.equal(both, false)
  // Close partners do not walk backwards.
  const close = officeLifePairs([actor('c1', 'done', 'lounge', 100), actor('c2', 'done', 'lounge', 130)])
  for (let t = .01; t < 64; t += .25) assert.equal(officeLife(actor('c1', 'done', 'lounge', 100), t, close.get('c1')).dx, 0)
})

test('pairs are reciprocal, disjoint and skip hidden or travelling actors and other rows', () => {
  const pairs = officeLifePairs([
    actor('a', 'running', 'desk', 10, 200), actor('b', 'running', 'desk', 60, 200), actor('c', 'running', 'desk', 110, 200),
    actor('d', 'running', 'desk', 60, 300), { ...actor('h', 'running', 'desk', 30, 200), hidden: true }, { ...actor('w', 'running', 'desk', 40, 200), pose: { walk: true } },
  ])
  assert.equal(pairs.get('a')?.partnerKey, 'b'); assert.equal(pairs.get('b')?.partnerKey, 'a')
  for (const key of ['c', 'd', 'h', 'w']) assert.equal(pairs.has(key), false)
})

test('desk chat needs an awake partner', () => {
  const pair = { partnerDx: 50, pairSeed: .2 }
  const chats = (awake: boolean) => times.some(t => officeLife(actor('x', 'running'), t, { ...pair, partnerAwake: awake }).mood === 'chat')
  assert.equal(chats(true), true)
  assert.equal(chats(false), false)
})

test('greeting waves without moving', () => {
  const f = officeLife(actor('g', 'running'), 3, { greet: true })
  assert.equal(f.wave, true); assert.equal(f.dx, 0)
})
