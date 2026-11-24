import assert from 'node:assert/strict'
import { it } from 'node:test'

const previousCss = require.extensions['.css']
require.extensions['.css'] = () => {}
const { workspaceClockIntervalMs } = require('../components/agent-visualizer/team/team-workspace') as typeof import('../components/agent-visualizer/team/team-workspace')
if (previousCss) require.extensions['.css'] = previousCss
else delete require.extensions['.css']

it('throttles Office clock updates and pauses workspace clock ticks when hidden', () => {
  assert.equal(workspaceClockIntervalMs('office', true), 10_000)
  assert.equal(workspaceClockIntervalMs('board', true), 1_000)
  assert.equal(workspaceClockIntervalMs('graph', true), 1_000)
  assert.equal(workspaceClockIntervalMs('office', false), null)
  assert.equal(workspaceClockIntervalMs('board', false), null)
})
