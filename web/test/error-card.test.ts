import { it } from 'node:test'
import assert from 'node:assert/strict'
import { drawToolCalls } from '../components/agent-visualizer/canvas/draw-tool-calls'
import type { ToolCallNode } from '../lib/agent-types'

it('renders failed calls without blur or measuring full error logs, and skips hidden history', () => {
  const measured: string[] = [], labels: string[] = [], blurs: number[] = []
  const canvas = { globalAlpha: 1, font: '', set shadowBlur(value: number) { blurs.push(value) },
    save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    measureText(text: string) { measured.push(text); return { width: text.length * 4 } },
    fillText(text: string) { labels.push(text) } }
  const tool: ToolCallNode = { id: 'failed-call', agentId: 'root', toolName: 'exec', args: 'long command '.repeat(10000),
    state: 'error', result: 'large error output '.repeat(10000), errorMessage: 'large failure detail '.repeat(10000),
    x: 0, y: 0, startTime: 0, completeTime: 1, opacity: 1 }
  drawToolCalls(canvas as unknown as CanvasRenderingContext2D, new Map([[tool.id, tool]]), 3)
  assert.ok(labels.some(text => text.includes('FAILED')))
  assert.ok(blurs.every(blur => blur === 0))
  assert.ok(measured.every(text => text.length <= 530))
  const count = labels.length
  drawToolCalls(canvas as unknown as CanvasRenderingContext2D, new Map([[tool.id, { ...tool, historical: true }]]), 4)
  drawToolCalls(canvas as unknown as CanvasRenderingContext2D, new Map([[tool.id, { ...tool, opacity: 0 }]]), 4)
  assert.equal(labels.length, count)
})
