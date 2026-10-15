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
