import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createToolCaptionLayout } from '../lib/tool-caption-layout'
import { captionLayout } from '../lib/agent-caption'
import { TOOL_CARD_W, TOOL_CARD_H } from '../lib/canvas-constants'
import type { ToolCallNode } from '../lib/agent-types'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import { findToolCallAt } from '../components/agent-visualizer/canvas/hit-detection'
import { resolveEdgeTarget } from '../components/agent-visualizer/canvas/draw-edges'

const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
  getContextWindowSize: () => 200000, blockIdCounter: { current: 0 }, skipForceSync: true }
const base = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'child' } }, createEmptyState(), ctx).agents.get('child')!
const agent = { ...base, x: 0, y: 0, opacity: 1, scale: 1, isMain: false }
const agents = new Map([[agent.id, agent]])
const tool = (id: string, x: number, y: number): ToolCallNode => ({ id, agentId: agent.id, toolName: 'exec', args: 'command', state: 'running', startTime: 0, opacity: 1, x, y })

it('moves restored command cards away from captions at all zoom sizes without moving source events', () => {
  const original = tool('blocked', 0, 95), safe = tool('safe', -350, -100)
  const source = new Map([[original.id, original], [safe.id, safe]])
  const arrange = createToolCaptionLayout(), result = arrange(agents, source)
  const moved = result.get(original.id)!
  assert.notDeepEqual([moved.x, moved.y], [original.x, original.y])
  assert.equal(source.get(original.id), original)
  assert.deepEqual([original.x, original.y], [0, 95])
  assert.equal(result.get(safe.id), safe)
  for (const zoom of [0.1, 0.5, 1, 2.4, 4]) {
    const caption = captionLayout(agent, 32, false, zoom)
    const overlap = moved.x + TOOL_CARD_W / 2 > caption.left && moved.x - TOOL_CARD_W / 2 < caption.left + caption.panelWidth
      && moved.y + TOOL_CARD_H / 2 > caption.top && moved.y - TOOL_CARD_H / 2 < caption.top + caption.height
    assert.equal(overlap, false)
  }
  assert.equal(findToolCallAt(moved.x, moved.y, result), moved.id)
  assert.equal(resolveEdgeTarget({ id: 'edge', from: agent.id, to: moved.id, type: 'tool', opacity: 1 }, agents, result), moved)
  const again = arrange(new Map(agents), source).get(moved.id)!
  assert.deepEqual([again.x, again.y], [moved.x, moved.y])
})

it('separates parallel command cards and keeps a repaired position after another card disappears', () => {
  const arrange = createToolCaptionLayout()
  const source = new Map(Array.from({ length: 8 }, (_, i) => [`tool-${i}`, tool(`tool-${i}`, 0, 95)]))
  const result = arrange(agents, source)
  const cards = [...result.values()]
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    assert.ok(Math.abs(cards[i].x - cards[j].x) >= TOOL_CARD_W || Math.abs(cards[i].y - cards[j].y) >= TOOL_CARD_H)
  }
  const retained = cards[0]
  const later = arrange(agents, new Map([[retained.id, source.get(retained.id)!]])).get(retained.id)!
  assert.deepEqual([later.x, later.y], [retained.x, retained.y])
  arrange(agents, new Map())
  const fresh = tool(retained.id, -350, -100)
  assert.equal(arrange(agents, new Map([[fresh.id, fresh]])).get(fresh.id), fresh)
})
