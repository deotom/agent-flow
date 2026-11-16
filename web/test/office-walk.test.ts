import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeTripFrame, type OfficeTrip, type OfficeTripSegment } from '../lib/office-motion'

const walk = (x: number, to: number, fields: Partial<OfficeTripSegment> = {}): OfficeTripSegment => ({ from: { x, y: 50 }, to: { x: to, y: 50 }, kind: 'walk', floorId: 'room', duration: 1000, ...fields })
const trip = (...segments: OfficeTripSegment[]): OfficeTrip => ({ segments, startedAt: 100, endsAt: 100 + segments.reduce((sum, segment) => sum + segment.duration, 0), shaftX: 100, rungPitch: 18, event: { kind: 'routine', id: 'walk', actorKey: 'walker', parentKey:null, at: 100 }, actorKey: 'walker', actor: {} as OfficeTrip['actor'], caption: '' })
const at = (journey: OfficeTrip, elapsed: number) => officeTripFrame(journey, journey.startedAt + elapsed)
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

it('eases the departure and arrival of a walk without changing its clock or endpoints', () => {
  const journey = trip(walk(0, 100))
  assert.ok(at(journey, 100).point.x < 10)
  assert.ok(at(journey, 900).point.x > 90)
  assert.equal(at(journey, 0).point.x, 0)
  assert.equal(at(journey, 1000).point.x, 100)
  assert.equal(at(journey, 999).done, false)
  assert.equal(at(journey, 1000).done, true)
  assert.equal(at(journey, 0).pose.walkWeight, 0)
  assert.ok(at(journey, 999).pose.walkWeight! < .01)
})

it('passes through same-floor contiguous waypoints at nonzero speed, with a linear middle leg', () => {
  const journey = trip(walk(0, 100), walk(100, 200), walk(200, 300))
  close(at(journey, 999).point.x, 99.8999001)
  close(at(journey, 1001).point.x, 100.1)
  close(at(journey, 1500).point.x, 150)
  close(at(journey, 1999).point.x, 199.9)
  assert.equal(at(journey, 1000).pose.walkWeight, 1)
})

it('does not join walks across holds, floor changes or disjoint endpoints', () => {
  for (const next of [walk(100, 200, { floorId: 'other' }), walk(101, 200), walk(100, 100, { kind: 'hold' })]) {
    const journey = trip(walk(0, 100), next)
    assert.ok(at(journey, 999).pose.walkWeight! < .01)
  }
})

it('keeps every lift phase and opacity progression exactly linear', () => {
  for (const liftPhase of ['boarding', 'closing', 'riding', 'opening', 'alighting'] as const) {
    const segment = walk(80, 100, { liftPhase, kind: liftPhase === 'riding' ? 'ride' : liftPhase === 'closing' || liftPhase === 'opening' ? 'hold' : 'walk', to: { x: 100, y: 150 }, opacity: [0, 1] })
    const journey = trip(segment)
    for (const ratio of [0, .01, .1, .25, .75, .99]) {
      const frame = at(journey, ratio * 1000)
      close(frame.point.x, 80 + 20 * ratio)
      close(frame.point.y, 50 + 100 * ratio)
      close(frame.pose.opacity!, ratio)
      assert.equal(frame.elevatorY, liftPhase === 'riding' ? frame.point.y : null)
    }
  }
  close(at(trip(walk(0, 100, { opacity: [0, 1] })), 100).pose.opacity!, .1)
})

it('bases gait on actual travelled distance, preserving phase across holds and turns', () => {
  const journey = trip(walk(0, 22), walk(22, 22, { kind: 'hold' }), walk(22, 0))
  close(at(journey, 500).pose.gait!, Math.PI)
  close(at(journey, 1500).pose.gait!, Math.PI * 2)
  close(at(journey, 2500).pose.gait!, Math.PI * 3)
  assert.equal(at(journey, 1500).pose.walkWeight, 0)
})

it('retains the previous walking direction while holding', () => {
  const journey = trip(walk(100, 0), walk(0, 0, { kind: 'hold' }))
  assert.equal(at(journey, 1500).pose.face, -1)
})
it('preserves the existing facing convention throughout stationary lift phases',()=>{
 const journey=trip(walk(100,0),...(['closing','riding','opening'] as const).map(liftPhase=>walk(0,0,{kind:liftPhase==='riding'?'ride':'hold',liftPhase})))
 for(const elapsed of [1500,2500,3500])assert.equal(at(journey,elapsed).pose.face,1)
 assert.equal(at(trip(walk(100,0),walk(0,0,{kind:'hold'})),1500).pose.face,-1)
})

it('settles long non-lift holds into and out of a bounded seated blend', () => {
  const journey = trip(walk(0, 0, { kind: 'hold', duration: 2000 }))
  assert.equal(at(journey, 0).pose.seatBlend, 0)
  close(at(journey, 175).pose.seatBlend!, .5)
  assert.equal(at(journey, 350).pose.seatBlend, 1)
  assert.equal(at(journey, 1000).pose.seatBlend, 1)
  close(at(journey, 1825).pose.seatBlend!, .5)
  assert.equal(at(journey, 1000).pose.sit, false)
  assert.equal(at(trip(walk(0, 0, { kind: 'hold', duration: 999 })), 500).pose.seatBlend, 0)
  assert.equal(at(trip(walk(0, 0, { kind: 'hold', duration: 2000, liftPhase: 'opening' })), 500).pose.seatBlend, 0)
})

it('bounds samples around the start and end without overshoot or nonfinite poses', () => {
  const journey = trip(walk(100, 0))
  for (let elapsed = -100; elapsed <= 1100; elapsed++) {
    const frame = at(journey, elapsed)
    assert.ok(Number.isFinite(frame.point.x) && frame.point.x >= 0 && frame.point.x <= 100)
    if (!frame.done) {
      assert.ok(Number.isFinite(frame.pose.gait))
      assert.ok(frame.pose.walkWeight! >= 0 && frame.pose.walkWeight! <= 1)
    }
  }
})
