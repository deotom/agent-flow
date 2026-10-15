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

it('draws a context HUD with a full capacity track and a bounded usage arc', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  for (const [tokensUsed, fraction] of [[46000, 0.46], [150000, 1], [0, 0]] as const) {
    const arcs: number[][] = []
    const canvas = { globalAlpha: 1, setLineDash() {}, save() {}, restore() {}, beginPath() {}, stroke() {}, moveTo() {}, lineTo() {}, arc: (...args: number[]) => arcs.push(args) }
    drawContextHud(canvas as unknown as CanvasRenderingContext2D, { ...state.agents.get('root')!, tokensUsed, tokensMax: 100000 }, 48)
    assert.equal(arcs[0][4] - arcs[0][3], Math.PI * 2)
    if (fraction) {
      assert.equal(arcs.length, 1 + Math.ceil(fraction * 36))
      assert.ok(arcs.slice(1).every(arc => arc[4] > arc[3] && arc[3] >= -Math.PI / 2 && arc[4] <= Math.PI * 1.5))
    }
    else assert.equal(arcs.length, 1)
  }
})

it('pulses only the last context segment without changing its geometry, and respects Animation Off', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  const agent = { ...state.agents.get('root')!, tokensUsed: 46000, tokensMax: 100000 }
  const capture = (time: number, enabled: boolean) => {
    const arcs: number[][] = [], strokes: number[] = []
    const canvas = { globalAlpha: 1, save() {}, restore() {}, beginPath() {}, moveTo() {}, arc: (...args: number[]) => arcs.push(args), stroke() { strokes.push(this.globalAlpha) } }
    drawContextHud(canvas as unknown as CanvasRenderingContext2D, agent, 48, time, enabled)
    return { arcs, strokes }
  }
  const dim = capture(0, true), bright = capture(Math.PI / 2.2, true)
  assert.deepEqual(dim.arcs, bright.arcs)
  assert.deepEqual(dim.strokes.slice(0, -1), bright.strokes.slice(0, -1))
  assert.ok(bright.strokes.at(-1)! > dim.strokes.at(-1)!)
  assert.deepEqual(capture(0, false), capture(10, false))
})

it('shows numeric context usage with warning colors at 80 and 90 percent', () => {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx)
  const labels: { text: string; color: string }[] = []
  const canvas = { fillStyle: '', beginPath() {}, roundRect() {}, fill() {}, fillRect() {}, strokeRect() {},
    fillText(text: string) { labels.push({ text, color: this.fillStyle }) } }
  for (const [tokensUsed, color] of [[79000, COLORS.holoBase], [80000, COLORS.tool], [90000, COLORS.error]] as const) {
    drawContextComposition(canvas as unknown as CanvasRenderingContext2D, { ...state.agents.get('root')!, tokensUsed, tokensMax: 100000 }, 48)
    assert.equal(labels.at(-1)?.color, color)
    assert.ok(labels.at(-1)?.text.startsWith(`CTX ${tokensUsed / 1000}%`))
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
