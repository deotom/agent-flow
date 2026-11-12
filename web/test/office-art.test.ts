import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { drawOfficeAvatar, drawOfficeFrame, officeAmbient } from '../components/agent-visualizer/office/office-art'
import type { OfficeAppearance, OfficePaintOptions, OfficePose, OfficeScene } from '../lib/office-types'

type Call = { op: string; args: unknown[]; fill: string }
class RecordingContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000'
  globalAlpha = 1
  calls: Call[] = []
  fillRect(...args: number[]) { this.calls.push({ op: 'rect', args, fill: String(this.fillStyle) }) }
  beginPath() { this.calls.push({ op: 'begin', args: [], fill: String(this.fillStyle) }) }
  moveTo(...args: number[]) { this.calls.push({ op: 'move', args, fill: String(this.fillStyle) }) }
  lineTo(...args: number[]) { this.calls.push({ op: 'line', args, fill: String(this.fillStyle) }) }
  closePath() { this.calls.push({ op: 'close', args: [], fill: String(this.fillStyle) }) }
  fill() { this.calls.push({ op: 'fill', args: [], fill: String(this.fillStyle) }) }
  save() { this.calls.push({ op: 'save', args: [], fill: String(this.fillStyle) }) }
  rect(...args:number[]) { this.calls.push({op:'rect',args,fill:String(this.fillStyle)}) }
  clip() {}
  scale(...args:number[]) { this.calls.push({op:'scale',args,fill:String(this.fillStyle)}) }
  clearRect(...args:number[]) { this.calls.push({op:'clear',args,fill:String(this.fillStyle)}) }
  ellipse(...args:number[]) { this.calls.push({op:'ellipse',args,fill:String(this.fillStyle)}) }
  roundRect(...args:number[]) { this.calls.push({op:'roundRect',args,fill:String(this.fillStyle)}) }
  bezierCurveTo(...args:number[]) { this.calls.push({op:'bezier',args,fill:String(this.fillStyle)}) }
  quadraticCurveTo(...args:number[]) { this.calls.push({op:'quadratic',args,fill:String(this.fillStyle)}) }
  stroke() { this.calls.push({op:'stroke',args:[],fill:String(this.fillStyle)}) }
  restore() { this.calls.push({ op: 'restore', args: [], fill: String(this.fillStyle) }) }
  translate(...args: number[]) { this.calls.push({ op: 'translate', args, fill: String(this.fillStyle) }) }
}
const ctx = () => new RecordingContext() as unknown as CanvasRenderingContext2D & RecordingContext
const appearance = (kind: OfficeAppearance['kind'], slot = 0): OfficeAppearance => ({
  slot, kind, hair: '#30273e', skin: '#edbb91', shirt: '#ee8640', pants: '#253249', cut: 'bun', gear: 'headset',
})
const scene = (floors: OfficeScene['floors'] = [], actors: OfficeScene['actors'] = []): OfficeScene => ({
  width: 320, height: 500, floors, actors, quietTeams: [], totalAgents: actors.length, finishedCount: 0,
})
const options = (patch: Partial<OfficePaintOptions> = {}): OfficePaintOptions => ({
  time: 3, date: new Date(2026, 5, 1, 12), now: 1000, live: true, motion: true, pets: [], selectedKey: null, ...patch,
})

describe('office art painter', () => {
  it('uses the specified local-time ambient phase boundaries', () => {
    const at = (hour: number) => officeAmbient(new Date(2026, 0, 1, hour))
    assert.equal(at(4).name, 'Night')
    assert.equal(at(5).name, 'Dawn')
    assert.equal(at(8).name, 'Day')
    assert.equal(at(17).name, 'Dusk')
    assert.equal(at(19).name, 'Night')
    assert.equal(at(23).night, true)
    assert.ok(at(12).rooms.every(color => color.startsWith('#')))
  })

  it('draws every pose with finite coordinates and nonnegative rectangles', () => {
    const poses: OfficePose[] = [{}, { lead: true }, { walk: true }, { sit: true }, { carry: true }, { hand: true }, { typing: true }, { mug: true }]
    for (const kind of ['human', 'robot', 'raccoon', 'owl', 'fox', 'alien'] as const) for (const pose of poses) {
      const c = ctx(); drawOfficeAvatar(c, appearance(kind), 50, 80, 2, pose)
      assert.ok(c.calls.length > 0)
      for (const call of c.calls) for (const value of call.args) assert.ok(typeof value !== 'number' || Number.isFinite(value))
      for (const call of c.calls.filter(item => item.op === 'rect')) {
        const [x, y, w, h] = call.args as number[]
        assert.ok([x, y, w, h].every(Number.isFinite)); assert.ok(w >= 0 && h >= 0)
      }
    }
  })

  it('paints arbitrary dynamic floors and freezes decorative frames when motion is off', () => {
    const floors = Array.from({ length: 9 }, (_, index) => ({ id: `f${index}`, sessionId: `s${index}`, title: 'Team', subtitle: '', color: '#53c4d1', y: index * 72, actorKeys: [], kind: 'team' as const }))
    const a = ctx(); drawOfficeFrame(a, scene(floors), options({ motion: false, time: 0 }))
    const b = ctx(); drawOfficeFrame(b, scene(floors), options({ motion: false, time: 75 }))
    assert.ok(a.calls.length > 10)
    assert.deepEqual(a.calls, b.calls)
  })

  it('does not pose a stale or absent live actor as typing', () => {
    const actor = { key: 'a', sessionId: 's', agent: { status: 'running', role: 'worker' }, task: null, parentKey: null, appearance: appearance('human'), floorId: 'f', zone: 'desk' as const, activity: '', runtimeName: '', x: 70, y: 80, pose: { typing: true } } as unknown as OfficeScene['actors'][number]
    const c = ctx(); drawOfficeFrame(c, scene([{ id: 'f', sessionId: 's', title: '', subtitle: '', color: '#53c4d1', y: 20, actorKeys: ['a'], kind: 'team' }], [actor]), options({ live: false }))
    assert.ok(c.calls.length > 0)
    assert.ok(!c.calls.some(call => call.op === 'rect' && call.args[0] === 86 && call.args[1] === 75 && call.args[2] === 2 && call.args[3] === 1 && call.fill === '#edbb91'))
  })
})
