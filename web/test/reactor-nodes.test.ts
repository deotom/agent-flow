import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawAgents, drawContextHud } from '../components/agent-visualizer/canvas/draw-agents'
import { processEvent } from '../hooks/simulation/process-event'
import { createEmptyState } from '../hooks/simulation/types'
import { getStateColor, COLORS } from '../lib/colors'
import type { Agent } from '../lib/agent-types'

function agent(overrides: Partial<Agent> = {}): Agent {
  const state = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'worker' } }, createEmptyState(), {
    syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }), getContextWindowSize: () => 100000, blockIdCounter: { current: 0 }, skipForceSync: true,
  })
  return { ...state.agents.get('worker')!, x: 0, y: 0, scale: 1, opacity: 1, tokensMax: 0, ...overrides }
}

function recorder() {
  const records: { kind: string; path: number[][]; color: string; dash: number[]; offset: number; width: number; alpha: number }[] = []
  let path: number[][] = []
  const stack: Record<string, unknown>[] = []
  const props: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, lineDashOffset: 0, dash: [], shadowBlur: 0 }
  const ctx = new Proxy(props, { get(target, key: string) {
    if (key in target) return target[key]
    if (key === 'save') return () => stack.push({ ...props })
    if (key === 'restore') return () => Object.assign(props, stack.pop())
    if (key === 'beginPath') return () => { path = [] }
    if (key === 'arc') return (...args: number[]) => path.push(args)
    if (key === 'setLineDash') return (dash: number[]) => { props.dash = dash }
    if (key === 'stroke' || key === 'fill') return () => records.push({ kind: key, path: [...path], color: String(props[key + 'Style']), dash: props.dash as number[], offset: Number(props.lineDashOffset), width: Number(props.lineWidth), alpha: Number(props.globalAlpha) })
    if (key === 'measureText') return (text: string) => ({ width: text.length * 6 })
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => { throw new Error('Unexpected per-frame gradient') }
    return () => {}
  } }) as unknown as CanvasRenderingContext2D
  return { ctx, records }
}

function render(node: Agent, time: number, effects: boolean) {
  const captured = recorder()
  drawAgents(captured.ctx, new Map([[node.id, node]]), null, null, false, time, effects)
  return captured.records
}

// Only cached glow creation uses a gradient; the drawing context rejects gradients.
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) } })
Object.defineProperty(globalThis, 'Path2D', { configurable: true, value: class {} })

it('draws navy circular cores and a calm state ring without inventing context capacity', () => {
  const node = agent({ state: 'error' })
  const records = render(node, 0, false)
  assert.ok(records.some(r => r.kind === 'fill' && r.color === 'rgba(6, 30, 50, 0.95)' && r.path[0]?.[2] === 32))
  assert.ok(records.some(r => r.color === getStateColor('error') + '70' && r.path.length === 16))
  const gauge = recorder()
  drawContextHud(gauge.ctx, node, 32)
  assert.equal(gauge.records.length, 0)
})

it('freezes every reactor stroke with motion off, including waiting and compaction', () => {
  for (const state of ['thinking', 'tool_calling', 'waiting_permission', 'idle', 'complete'] as const) {
    const node = agent({ state })
    assert.deepEqual(render(node, 0, false), render(node, 12, false))
  }
  const node = agent({ tokensMax: 100000, contextRecharge: { progress: 0.1 } as Agent['contextRecharge'] })
  const first = recorder(), second = recorder()
  drawContextHud(first.ctx, node, 32, 0, false)
  drawContextHud(second.ctx, { ...node, contextRecharge: { ...node.contextRecharge!, progress: 0.6 } }, 32, 12, false)
  assert.deepEqual(first.records, second.records)
  assert.ok(first.records.some(r => r.color === COLORS.tool))
})

it('rotates inner dashes only for active agents and keeps circular effects within camera bounds', () => {
  for (const isMain of [false, true]) for (const state of ['thinking', 'waiting_permission', 'idle', 'complete'] as const) {
    const node = agent({ isMain, state })
    const radius = isMain ? 48 : 32
    const first = render(node, 0, true), second = render(node, 1, true)
    const inner = (records: typeof first) => records.find(r => r.path[0]?.[2] === radius + 4 && r.dash.join() === '3,3')!
    assert.equal(inner(first).offset !== inner(second).offset, state === 'thinking' || state === 'waiting_permission')
    for (const record of second) for (const arc of record.path) {
      assert.ok(Math.hypot(arc[0], arc[1]) + arc[2] + (record.kind === 'stroke' ? record.width / 2 : 0) <= radius + (isMain ? 40 : 16) + 1e-9, JSON.stringify({ isMain, state, record, arc }))
    }
  }
})

it('pulses amber for compaction even when T3 reports no token counters', () => {
  const gauge = recorder()
  drawContextHud(gauge.ctx, agent({ state: 'thinking', tokensMax: 0, contextRecharge: { progress: 0.1 } }), 32, 0, true)
  assert.ok(gauge.records.some(r => r.color === COLORS.tool))
})
