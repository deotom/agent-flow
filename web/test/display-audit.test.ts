import { it } from 'node:test'
import assert from 'node:assert/strict'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { createEmptyState, appendConversation } from '../hooks/simulation/types'
import { computeNextFrame } from '../hooks/simulation/animate'
import { buildTimelineEvents } from '../hooks/simulation/timeline-events'
import { drawContextComposition, drawContextHud, advanceInstrumentPhase, agentStatusLabel, drawActivityOutline } from '../components/agent-visualizer/canvas/draw-agents'
import { COLORS } from '../lib/colors'

const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
  getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }

it('labels each lifecycle state, including running tools and permission waits', () => {
  assert.match(agentStatusLabel({ state: 'thinking' }, 1), /^Thinking\.+$/)
  assert.equal(agentStatusLabel({ state: 'tool_calling', currentTool: 'functions.exec_command' }, 0), 'Running exec_command')
  assert.equal(agentStatusLabel({ state: 'waiting_permission' }, 0), 'Approval needed')
  assert.equal(agentStatusLabel({ state: 'idle' }, 0), 'Ready')
  assert.equal(agentStatusLabel({ state: 'complete' }, 0), 'Done')
  assert.equal(agentStatusLabel({ state: 'error' }, 0), 'Tool failed')
})

it('moves amber dashes around active nodes and stops them for idle and completed nodes', () => {
  const strokes: { color: string; offset: number; dash: number[] }[] = []
  const canvas = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    strokeStyle: '', lineDashOffset: 0, dash: [] as number[], setLineDash(dash: number[]) { this.dash = dash },
    stroke() { strokes.push({ color: this.strokeStyle, offset: this.lineDashOffset, dash: this.dash }) } }
  for (const state of ['thinking', 'tool_calling', 'idle', 'complete'] as const) {
    const count = strokes.length
    drawActivityOutline(canvas as unknown as CanvasRenderingContext2D, { state, x: 0, y: 0 }, 40, 2)
    if (state === 'thinking' || state === 'tool_calling') assert.deepEqual(strokes.at(-1), { color: COLORS.tool, offset: -52, dash: [6, 7] })
    else assert.equal(strokes.length, count)
  }
})

it('reparents a reused child correctly, preserves authoritative context size, and completes every descendant', () => {
  let state = createEmptyState()
  for (const [name, parent] of [['root', undefined], ['child', 'root'], ['grandchild', 'root'], ['leaf', 'grandchild']]) {
    state = processEvent({ time: 0, type: 'agent_spawn', payload: { name, parent, isMain: name === 'root', model: 'gpt-6-sol' } }, state, ctx)
  }
  state = processEvent({ time: 0, type: 'context_update', payload: { agent: 'grandchild', tokens: 100000, tokensMax: 475000 } }, state, ctx)
  state = processEvent({ time: 1, type: 'agent_spawn', payload: { name: 'grandchild', parent: 'child' } }, state, ctx)
  assert.equal(state.agents.get('grandchild')?.parentId, 'child')
  assert.equal(state.agents.get('grandchild')?.tokensMax, 475000)
  assert.equal(state.edges.filter(edge => edge.to === 'grandchild' && edge.from === 'root').length, 0)
  assert.ok(state.edges.some(edge => edge.to === 'grandchild' && edge.from === 'child'))
  state = processEvent({ time: 2, type: 'agent_complete', payload: { name: 'root' } }, state, ctx)
  assert.ok([...state.agents.values()].every(agent => agent.state === 'complete'))
})

it('retains hidden long-running calls until their matching result arrives', () => {
  let state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  state = processEvent({ time: 0, type: 'tool_call_start', payload: { agent: 'root', tool: 'exec', callId: 'slow' } }, state, ctx)
  state = computeNextFrame(state, 2, 10000, 10000, state, { useMockData: false, mockScenarioLength: 0, mockScenarioEndTime: 0 })
  assert.equal(state.toolCalls.size, 1)
  state = processEvent({ time: 10001, type: 'tool_call_end', payload: { agent: 'root', tool: 'exec', callId: 'slow', result: 'finished' } }, state, ctx)
  assert.equal([...state.toolCalls.values()][0].result, 'finished')
})

it('rebuilds timeline markers for equal-length sessions and rolling conversation windows', () => {
  const make = (id: string) => new Map([['orchestrator', [{ id, type: 'assistant' as const, content: id, timestamp: 1 }]]])
  assert.equal(buildTimelineEvents(make('session A'))[0].label, 'session A')
  assert.equal(buildTimelineEvents(make('session B'))[0].label, 'session B')
  assert.equal(buildTimelineEvents(make('latest message'))[0].label, 'latest message')
})

function captureLampHud(agent: Parameters<typeof drawContextHud>[1], time: number, enabled: boolean) {
  const fills: { color: string; alpha: number; rectangles: number[][][] }[] = []
  let rectangles: number[][][] = [], points: number[][] = []
  const canvas = { globalAlpha: 1, fillStyle: '', save() {}, restore() {}, beginPath() { rectangles = [] },
    moveTo(x: number, y: number) { points = [[x, y]] }, lineTo(x: number, y: number) { points.push([x, y]) },
    closePath() { rectangles.push(points) }, fill() { fills.push({ color: this.fillStyle, alpha: this.globalAlpha, rectangles: [...rectangles] }) } }
  drawContextHud(canvas as unknown as CanvasRenderingContext2D, agent, 48, time, enabled)
  return fills
}

it('keeps used LED lamps black and lights remaining capacity, clamped to a full ring', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  for (const [tokensUsed, lit] of [[14000, 31], [150000, 0], [0, 36]] as const) {
    const fills = captureLampHud({ ...state.agents.get('root')!, tokensUsed, tokensMax: 100000 }, 0, false)
    assert.equal(fills[0].rectangles.length, 36)
    assert.equal(fills[1].color, '#010408')
    assert.equal(fills[1].rectangles.length, 36)
    const blue = fills.filter(fill => fill.color === COLORS.holoBase)
    assert.equal(blue.reduce((count, fill) => count + fill.rectangles.length, 0), lit)
    for (const fill of blue) for (const rectangle of fill.rectangles) {
      assert.equal(rectangle.length, 4)
      const [a, b, c] = rectangle
      const width = [b[0] - a[0], b[1] - a[1]], height = [c[0] - b[0], c[1] - b[1]]
      assert.ok(Math.abs(width[0] * height[0] + width[1] * height[1]) < 0.0001)
      assert.ok(Math.hypot(...width) > Math.hypot(...height) * 2)
    }
    if (lit) assert.equal(blue.at(-1)!.rectangles.length, 1)
    else assert.equal(fills.length, 2)
  }
})

it('blinks only the latest blue LED while previous and unlit lamps stay steady, and respects Animation Off', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  const agent = { ...state.agents.get('root')!, tokensUsed: 14000, tokensMax: 100000 }
  const dim = captureLampHud(agent, 0, true), bright = captureLampHud(agent, Math.PI / 2.2, true)
  assert.deepEqual(dim.map(fill => fill.rectangles), bright.map(fill => fill.rectangles))
  assert.deepEqual(dim.slice(0, -2), bright.slice(0, -2))
  assert.ok(bright.at(-2)!.alpha > dim.at(-2)!.alpha)
  assert.deepEqual(captureLampHud(agent, 0, false), captureLampHud(agent, 10, false))
})

it('shows numeric context usage with warning colors at 80 and 90 percent', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  const labels: { text: string; color: string }[] = []
  const canvas = { fillStyle: '', beginPath() {}, roundRect() {}, fill() {}, fillRect() {}, strokeRect() {},
    fillText(text: string) { labels.push({ text, color: this.fillStyle }) } }
  for (const [tokensUsed, color] of [[79000, COLORS.holoBase], [80000, COLORS.tool], [90000, COLORS.error]] as const) {
    drawContextComposition(canvas as unknown as CanvasRenderingContext2D, { ...state.agents.get('root')!, tokensUsed, tokensMax: 100000 }, 48)
    assert.equal(labels.at(-1)?.color, color)
    assert.ok(labels.at(-1)?.text.startsWith(`CTX เหลือ ${100 - tokensUsed / 1000}%`))
  }
})

it('restores queued events after switching away before the next frame consumes them', () => {
  const buffered = [
    { time: 0, sequence: 1, type: 'agent_spawn' as const, payload: { name: 'root', isMain: true } },
    { time: 1, sequence: 2, type: 'message' as const, payload: { agent: 'root', content: 'queued before switch' } },
  ]
  const snapshot = processEvent(buffered[0], createEmptyState(), ctx)
  let restored = snapshot
  for (const event of buffered.slice(snapshot.receivedEventCount)) restored = processEvent(event, restored, ctx)
  assert.equal(restored.conversations.get('root')?.[0].content, 'queued before switch')
  assert.equal(restored.receivedEventCount, 2)
})

it('keeps older transcript messages searchable in long sessions', () => {
  const conversations = new Map()
  for (let index = 0; index < 300; index++) appendConversation(conversations, 'root', { type: 'assistant', content: `message ${index}`, timestamp: index })
  assert.equal(conversations.get('root').length, 300)
  assert.equal(conversations.get('root')[0].content, 'message 0')
})


it('keeps the JARVIS angle continuous across work/Ready and Animation Off transitions', () => {
  const previous = { time: 100, angle: 1 }
  const idle = advanceInstrumentPhase(previous, 100.02, true, true)
  const working = advanceInstrumentPhase(idle, 100.04, true, false)
  assert.ok(idle.angle > 1 && idle.angle < 1.01)
  assert.ok(working.angle > idle.angle && working.angle - idle.angle < 0.02)
  const stopped = advanceInstrumentPhase(working, 200, false, false)
  assert.equal(stopped.angle, working.angle)
  const resumed = advanceInstrumentPhase(stopped, 200.02, true, true)
  assert.ok(resumed.angle - stopped.angle < 0.01)
  assert.ok(advanceInstrumentPhase({ time: 0, angle: Math.PI * 2 - 0.001 }, 0.1, true, false).angle > Math.PI * 2)
})


it('tracks async and blocking inputs separately from permission waits', () => {
  let state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  const event = (type: 'input_requested' | 'input_resolved' | 'permission_requested', payload: Record<string, unknown>) => {
    state = processEvent({ time: 1, type, payload: { agent: 'root', ...payload } }, state, ctx)
    return state.agents.get('root')!
  }
  assert.equal(event('input_requested', { callId: 'async', blocking: false }).state, 'idle')
  assert.match(agentStatusLabel(state.agents.get('root')!, 0), /input requested/)
  assert.equal(event('input_requested', { callId: 'sync', blocking: true }).state, 'waiting_permission')
  assert.equal(agentStatusLabel(state.agents.get('root')!, 0), 'Input needed')
  assert.equal(event('input_resolved', { callId: 'async' }).waitingForInput, true)
  assert.equal(event('input_resolved', { callId: 'sync' }).state, 'thinking')
  event('input_requested', { callId: 'other', blocking: false })
  event('permission_requested', {})
  assert.equal(event('input_resolved', { callId: 'other' }).state, 'waiting_permission')
  assert.equal(agentStatusLabel(state.agents.get('root')!, 0), 'Approval needed')
})

it('starts a fresh context ring fully lit and steady', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  const agent = state.agents.get('root')!
  assert.deepEqual(captureLampHud(agent, 0, true), captureLampHud(agent, 10, true))
})
