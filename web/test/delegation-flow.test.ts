import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawEdges } from '../components/agent-visualizer/canvas/draw-edges'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { COLORS } from '../lib/colors'

it('animates yellow dashes toward a working child and stops when it becomes idle or complete', () => {
  const ctx: ProcessEventContext = {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true,
  }
  let state = createEmptyState()
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, state, ctx)
  state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'child', parent: 'root' } }, state, ctx)
  state.agents.set('root', { ...state.agents.get('root')!, opacity: 1, x: 0, y: 0 })
  state.edges[0].opacity = 1
  const strokes: { offset: number; color: string; dash: number[] }[] = []
  const labels: string[] = []
  const canvas = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, bezierCurveTo() {},
    measureText(text: string) { return { width: text.length * 6 } }, fillRect() {},
    fillText(text: string) { labels.push(text) },
    lineDashOffset: 0, strokeStyle: '', dash: [] as number[],
    setLineDash(dash: number[]) { this.dash = dash },
    stroke() { strokes.push({ offset: this.lineDashOffset, color: this.strokeStyle, dash: this.dash }) },
  }
  for (const status of ['thinking', 'tool_calling', 'idle', 'complete'] as const) {
    state.agents.set('child', { ...state.agents.get('child')!, state: status, opacity: 1, x: 200, y: 0 })
    strokes.length = 0
    drawEdges(canvas as unknown as CanvasRenderingContext2D, state.edges, state.agents, state.toolCalls, new Set(), 1)
    if (status === 'thinking' || status === 'tool_calling') {
      assert.deepEqual(strokes[0], { offset: -30, color: COLORS.tool, dash: [6, 9] })
      drawEdges(canvas as unknown as CanvasRenderingContext2D, state.edges, state.agents, state.toolCalls, new Set(), 2)
      assert.equal(strokes[1].offset, -60)
    } else assert.equal(strokes.length, 0)
  }
  strokes.length = 0
  state.agents.set('child', { ...state.agents.get('child')!, state: 'complete', returnStartedAt: 0 })
  drawEdges(canvas as unknown as CanvasRenderingContext2D, state.edges, state.agents, state.toolCalls, new Set([state.edges[0].id]), 2)
  assert.deepEqual(strokes[0], { offset: 60, color: COLORS.return, dash: [6, 9] })
  assert.ok(labels.includes('Working'))
})


it('fades edge text once per task stage without replaying history or restarting on repeated work', () => {
  const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
    getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
  let state = createEmptyState()
  const event = (time: number, type: Parameters<typeof processEvent>[0]['type'], payload: Record<string, unknown>, historical = false) => {
    state = processEvent({ time, type, payload, historical }, { ...state, currentTime: time }, ctx)
    for (const [id, agent] of state.agents) state.agents.set(id, { ...agent, opacity: 1, x: id === 'root' ? 0 : 200 })
    state.edges = state.edges.map(edge => ({ ...edge, opacity: 1 }))
  }
  const labels: { text: string; alpha: number }[] = []
  const stack: number[] = []
  const canvas = { globalAlpha: 1, save() { stack.push(this.globalAlpha) }, restore() { this.globalAlpha = stack.pop()! },
    beginPath() {}, moveTo() {}, bezierCurveTo() {}, stroke() {}, measureText: () => ({ width: 50 }), fillRect() {},
    fillText(text: string) { labels.push({ text, alpha: this.globalAlpha }) } }
  const draw = (simulationTime: number, compact = false) => {
    labels.length = 0
    // Animation Off freezes decorative time at zero; label expiry must still follow the simulation.
    drawEdges(canvas as unknown as CanvasRenderingContext2D, state.edges, state.agents, state.toolCalls, new Set(), 0, false, compact, true, simulationTime)
    return labels[0]
  }
  event(0, 'agent_spawn', { name: 'root', isMain: true })
  event(1, 'agent_spawn', { name: 'child', parent: 'root' })
  assert.equal(draw(1)?.text, 'Working')
  assert.ok(draw(3.2)!.alpha > 0 && draw(3.2)!.alpha < 1)
  event(3.3, 'agent_thinking', { name: 'child' })
  assert.equal(draw(3.6), undefined)
  event(4, 'agent_complete', { name: 'child' })
  assert.equal(draw(4)?.text, 'Done · awaiting result')
  event(5, 'agent_thinking', { name: 'child' })
  assert.equal(draw(5)?.text, 'Working')
  assert.equal(draw(5, true), undefined)
  state = createEmptyState()
  event(0, 'agent_spawn', { name: 'root', isMain: true }, true)
  event(1, 'agent_spawn', { name: 'child', parent: 'root' }, true)
  assert.equal(draw(1), undefined)
})
