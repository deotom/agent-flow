import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createCaptionPlacement } from '../lib/caption-placement'
import { captionEnvelope, captionLayout, findCaptionAgentAt } from '../lib/agent-caption'
import { createEmptyState } from '../hooks/simulation/types'
import { processEvent, type ProcessEventContext } from '../hooks/simulation/process-event'
import type { Agent, Edge, ToolCallNode } from '../lib/agent-types'

const ctx: ProcessEventContext = { syncForceSimulation() {}, findToolSlot: () => ({ x: 0, y: 0 }),
  getContextWindowSize: () => 475000, blockIdCounter: { current: 0 }, skipForceSync: true }
const base = processEvent({ time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }, createEmptyState(), ctx).agents.get('root')!
const root: Agent = { ...base, x: 0, y: 0, opacity: 1, scale: 1 }
const child: Agent = { ...root, id: 'child', name: 'Child', isMain: false, parentId: root.id, y: 300 }
const intersects = (a: ReturnType<typeof captionEnvelope>, b: ReturnType<typeof captionEnvelope>) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

it('docks horizontally readable plaques away from conversation bubbles and delegation paths without moving agents', () => {
  const agents = new Map([[root.id, { ...root, messageBubbles: [{ text: 'Live reply', role: 'assistant' as const, time: 0, _cachedW: 220, _cachedH: 130 }] }], [child.id, child]])
  const edges: Edge[] = [{ id: 'delegation', from: root.id, to: child.id, type: 'parent-child', opacity: 1 }]
  const arrange = createCaptionPlacement(), placed = arrange(agents, new Map(), edges)
  const main = placed.get(root.id)!
  assert.notEqual(main.captionDock?.side, 'below')
  assert.equal(agents.get(root.id)!.captionDock, undefined)
  assert.deepEqual([main.x, main.y], [root.x, root.y])
  assert.equal(intersects(captionEnvelope(main, 48), { left: 62, right: 282, top: -20, bottom: 110 }), false)
  assert.equal(intersects(captionEnvelope(main, 48), captionEnvelope(placed.get(child.id)!, 32)), false)
  for (const zoom of [0.1, 0.5, 1, 2.4, 4]) {
    const box = captionLayout(main, 48, false, zoom)
    assert.equal(findCaptionAgentAt(box.centerX, box.top + box.height / 2, placed, false, zoom)?.id, root.id)
    assert.ok(box.endX >= box.left && box.endX <= box.left + box.panelWidth)
    assert.ok(box.endY >= box.top && box.endY <= box.top + box.height)
  }
  assert.deepEqual(arrange(new Map([[root.id, root], [child.id, child]]), new Map(), []).get(root.id)!.captionDock, main.captionDock)
})

it('keeps a safe dock steady and only redocks when a new card occupies it', () => {
  const arrange = createCaptionPlacement(), agents = new Map([[root.id, root]])
  const first = arrange(agents, new Map(), [])
  const initial = first.get(root.id)!, box = captionLayout(initial, 48, false, 1)
  const tool: ToolCallNode = { id: 'new-tool', agentId: root.id, toolName: 'exec', args: '', state: 'running', startTime: 1, opacity: 1,
    x: box.centerX, y: box.top + box.height / 2 }
  assert.deepEqual(arrange(new Map(agents), new Map(), []).get(root.id)!.captionDock, initial.captionDock)
  const moved = arrange(agents, new Map([[tool.id, tool]]), []).get(root.id)!
  assert.notDeepEqual(moved.captionDock, initial.captionDock)
  assert.equal(intersects(captionEnvelope(moved, 48), { left: tool.x - 85, right: tool.x + 85, top: tool.y - 18, bottom: tool.y + 18 }), false)
  assert.deepEqual(arrange(agents, new Map(), []).get(root.id)!.captionDock, moved.captionDock)
  arrange(new Map(), new Map(), [])
  assert.equal(arrange(agents, new Map(), []).get(root.id)!.captionDock?.side, 'below')
})
