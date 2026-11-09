import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawMissionAgents, drawMissionLinks, missionLinkGeometry, missionRemaining, missionSelectedChain, MISSION_COLORS } from '../components/agent-visualizer/canvas/draw-mission'
import { drawAgents } from '../components/agent-visualizer/canvas/draw-agents'
import type { Agent } from '../lib/agent-types'
import type { MissionNode, MissionStage, MissionView } from '../lib/mission-model'
import { captionLayout, findCaptionAgentAt } from '../lib/agent-caption'
import { findAgentAt } from '../components/agent-visualizer/canvas/hit-detection'

type RecordEntry = { kind: string; args: unknown[]; color: unknown; alpha: unknown; width: unknown; dash: unknown; offset: unknown; font: unknown }
let gradients = 0
function recorder(offscreen = false) {
  const records: RecordEntry[] = []
  const props: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, lineDashOffset: 0, dash: [], font: '', shadowBlur: 0 }
  const stack: Record<string, unknown>[] = []
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'save') return () => stack.push({ ...props })
      if (key === 'restore') return () => Object.assign(props, stack.pop())
      if (key === 'setLineDash') return (dash: number[]) => { props.dash = dash }
      if (key === 'measureText') return (text: string) => ({ width: Array.from(text).length * 5 })
      if (key === 'createRadialGradient') return () => {
        assert.ok(offscreen, 'gradient allocated on live rendering context')
        gradients++
        return { addColorStop() {} }
      }
      return (...args: unknown[]) => records.push({ kind: key, args: key === 'drawImage' ? args.slice(1) : args,
        color: key === 'fillText' || key === 'fill' ? props.fillStyle : props.strokeStyle,
        alpha: props.globalAlpha, width: props.lineWidth, dash: props.dash, offset: props.lineDashOffset, font: props.font })
    },
    set(target, key: string, value) {
      if (key === 'shadowBlur') assert.equal(value, 0)
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, records }
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => recorder(true).ctx }),
} })

function agent(id: string, overrides: Partial<Agent> = {}): Agent {
  return { id, name: id, x: 0, y: 0, isMain: id === 'lead', scale: 1, opacity: 1,
    state: 'thinking', tokensUsed: 30, tokensMax: 100, messageBubbles: [], ...overrides } as Agent
}
function node(id: string, overrides: Partial<MissionNode> = {}): MissionNode {
  return { id, activity: null, name: id, parentId: id === 'lead' ? null : 'lead', runtime: 'codex', model: 'gpt-6.1-sol', status: 'thinking', context: null,
    role: id === 'lead' ? 'lead' : 'worker', depth: id === 'lead' ? 0 : 1, x: 0, y: 0,
    plate: id === 'lead' ? 'full' : 'compact', glyph: id === 'lead' ? '{ }' : '>_', attention: null,
    collapsed: false, hiddenChildren: 0, summary: { children: 1, working: 1, waiting: 0, failed: 0 },
    modelLine: 'codex::gpt-6.1-sol', statusLine: '› thinking', ...overrides }
}
function fixture(stage: MissionStage = 'working') {
  const agents = new Map([['lead', agent('lead')], ['worker', agent('worker', { x: 300 })]])
  const mission: MissionView = { nodes: new Map([['lead', node('lead')], ['worker', node('worker')]]),
    links: [{ from: 'lead', to: 'worker', stage, alert: null }], dataRing: 'agents:2 · tools:3 · depth:1 · ' }
  return { agents, mission }
}
function render(stage: MissionStage, time: number, moving: boolean) {
  const { agents, mission } = fixture(stage), r = recorder()
  drawMissionLinks(r.ctx, mission, agents, 'worker', time, moving)
  drawMissionAgents(r.ctx, agents, mission, 'worker', null, time, moving)
  return r.records
}

it('mission rendering is completely static with effects disabled for every delivery stage', () => {
  for (const stage of Object.keys(MISSION_COLORS) as MissionStage[]) {
    assert.deepEqual(render(stage, 0, false), render(stage, 13.4, false), stage)
  }
})

it('working and sent capsules travel in opposite directions; queued dots stay still', () => {
  const working = render('working', 2, true), sent = render('sent', 2, true), queued = render('queued', 2, true)
  assert.ok(working.some(r => r.kind === 'stroke' && Number(r.offset) < 0))
  assert.ok(sent.some(r => r.kind === 'stroke' && Number(r.offset) > 0))
  assert.ok(queued.some(r => r.kind === 'stroke' && String(r.dash) === '1,7' && r.offset === 0))
  assert.ok(!working.some(r => r.kind === 'closePath' && r.color === MISSION_COLORS.working))
})

it('selection follows the mission chain and alerts illuminate its complete curve', () => {
  const { mission, agents } = fixture()
  mission.links.push({ from: 'worker', to: 'leaf', stage: 'failed', alert: 'failed' })
  assert.deepEqual([...missionSelectedChain(mission, 'leaf')], ['leaf', 'worker', 'lead'])
  mission.links.push({ from: 'leaf', to: 'lead', stage: 'working', alert: null })
  assert.equal(missionSelectedChain(mission, 'leaf').size, 3, 'cycle must terminate')
  mission.links[0].alert = 'waiting'
  const r = recorder()
  drawMissionLinks(r.ctx, mission, agents, 'worker', 0, false)
  assert.ok(r.records.some(record => record.kind === 'stroke' && record.color === MISSION_COLORS.waiting + '18' && Number(record.width) > 8))
})

it('context shows white remaining capacity, amber compaction, and nothing for unreported capacity', () => {
  assert.equal(missionRemaining({ tokensUsed: 30, tokensMax: 100 }), 0.7)
  assert.equal(missionRemaining({ tokensUsed: 200, tokensMax: 100 }), 0)
  assert.equal(missionRemaining({ tokensUsed: 0, tokensMax: 0 }), null)
  const { agents, mission } = fixture()
  const draw = () => {
    const r = recorder()
    drawMissionAgents(r.ctx, agents, mission, null, null, 1, false)
    return r.records.filter(r => r.kind === 'stroke' && r.width === 6)
  }
  assert.ok(draw().some(r => r.color === '#eaf6ff'))
  agents.get('lead')!.contextRecharge = { progress: 0.4 }
  assert.ok(draw().some(r => r.color === '#ffb627'))
  agents.get('lead')!.tokensMax = 0
  assert.equal(draw().length, 0)
})

it('reuses gradient sprites and curved data text, with reduced budget keeping labels and halos', () => {
  const { agents, mission } = fixture()
  const first = recorder()
  drawMissionAgents(first.ctx, agents, mission, null, null, 1, true)
  const initialGradients = gradients
  const second = recorder()
  drawMissionAgents(second.ctx, agents, mission, null, null, 2, true)
  assert.equal(gradients, initialGradients)
  const reduced = recorder()
  drawMissionAgents(reduced.ctx, agents, mission, null, null, 2, false, 1, false)
  assert.ok(reduced.records.some(r => r.kind === 'drawImage'))
  assert.ok(reduced.records.some(r => r.kind === 'fillText' && r.args[0] === 'lead '))
  assert.ok(reduced.records.length < second.records.length)
})

it('mission routing preserves node and caption hit geometry and context labels', () => {
  const { agents, mission } = fixture()
  const r = recorder()
  drawAgents(r.ctx, agents, 'lead', null, false, 0, false, false, 1, true, mission)
  assert.ok(r.records.some(record => record.kind === 'fillText' && record.args[0] === ' ctx 70%'))
  const lead = agents.get('lead')!, box = captionLayout(lead, 48, false, 1)
  assert.equal(findAgentAt(lead.x, lead.y, agents), 'lead')
  assert.equal(findCaptionAgentAt(box.left + 1, box.top + 1, agents, false, 1)?.id, 'lead')
  const geometry = missionLinkGeometry(lead, agents.get('worker')!)
  assert.ok(geometry.x1 > 48 && geometry.x2 < 300 - 32)
  assert.ok(geometry.tagX > geometry.x1 && geometry.tagX < geometry.x2)
})

it('collapsed subteams display hidden counts and remain static even with effects enabled', () => {
  const { agents, mission } = fixture('waiting')
  mission.nodes.get('worker')!.collapsed = true
  mission.nodes.get('worker')!.hiddenChildren = 4
  const draw = (time: number) => {
    const r = recorder()
    drawMissionAgents(r.ctx, new Map([['worker', agents.get('worker')!]]), mission, null, null, time, true)
    return r.records
  }
  assert.deepEqual(draw(0), draw(8))
  assert.ok(draw(0).some(r => r.kind === 'fillText' && r.args[0] === '+4'))
})
