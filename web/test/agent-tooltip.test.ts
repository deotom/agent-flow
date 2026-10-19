import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawAgentTooltip, updateAgentHint } from '../components/agent-visualizer/canvas/agent-tooltip'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { createEmptyState } from '../hooks/simulation/types'

const context: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
  getContextWindowSize: () => 475000, blockIdCounter: { current: 0 }, skipForceSync: true }
const agent = { ...processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), context).agents.get('root')!,
  name: 'ตรวจสอบระบบบัญชีและประวัติการทำงานของโครงการ', opacity: 1, tokensUsed: 270637, tokensMax: 475000 }
const agents = new Map([[agent.id, agent]])

function canvas() {
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = []
  const labels: Array<{ text: string; x: number; y: number; maxWidth?: number }> = []
  let measurements = 0
  const ctx = { shadowBlur: 0, fillStyle: '', strokeStyle: '', font: '',
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
    roundRect(x: number, y: number, width: number, height: number) { boxes.push({ x, y, width, height }) },
    measureText(text: string) { measurements++; return { width: Array.from(text).length * 6 } },
    fillText(text: string, x: number, y: number, maxWidth?: number) { labels.push({ text, x, y, maxWidth }) } }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, boxes, labels, measures: () => measurements }
}

it('delays a hint 400ms, keeps the delay on the same target and resets on another target or leaving', () => {
  const first = updateAgentHint(null, 'root', 100, 200, 1000)!
  assert.equal(updateAgentHint(first, 'root', 101, 201, 1200)?.since, 1000)
  assert.equal(updateAgentHint(first, 'child', 100, 200, 1200)?.since, 1200)
  assert.equal(updateAgentHint(first, undefined, 0, 0, 1200), null)
  const c = canvas()
  drawAgentTooltip(c.ctx, first, agents, 1399, 700, 700, 132)
  assert.equal(c.boxes.length, 0)
  drawAgentTooltip(c.ctx, first, agents, 1400, 700, 700, 132)
  assert.equal(c.boxes.length, 1)
})

it('wraps the full name, contains the HUD hint within narrow and edge viewports and caches text measurement', () => {
  for (const [width, height, x, y, topInset] of [[700, 700, 690, 690, 132], [240, 450, 230, 440, 82], [200, 350, 0, 0, 82]]) {
    const c = canvas(), hint = { agentId: agent.id, x, y, since: 0 }
    drawAgentTooltip(c.ctx, hint, agents, 400, width, height, topInset)
    const box = c.boxes[0]
    assert.ok(box.x >= 8 && box.x + box.width <= width - 8)
    assert.ok(box.y >= topInset && box.y + box.height <= height - 60)
    assert.equal(c.labels.slice(0, -2).map(label => label.text).join(''), agent.name)
    assert.match(c.labels.at(-2)!.text, /270,637 \/ 475,000/)
    assert.match(c.labels.at(-1)!.text, /43%/)
    const measurements = c.measures()
    drawAgentTooltip(c.ctx, hint, agents, 1000, width, height, topInset)
    assert.equal(c.measures(), measurements)
  }
})

it('does not draw a missing, invisible or dismissed target', () => {
  const c = canvas(), hint = { agentId: agent.id, x: 100, y: 200, since: 0 }
  drawAgentTooltip(c.ctx, null, agents, 500, 700, 700, 132)
  drawAgentTooltip(c.ctx, hint, new Map(), 500, 700, 700, 132)
  drawAgentTooltip(c.ctx, hint, new Map([[agent.id, { ...agent, opacity: 0 }]]), 500, 700, 700, 132)
  assert.equal(c.boxes.length, 0)
})
