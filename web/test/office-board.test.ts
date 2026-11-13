import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOfficeScene, currentOfficeBoard, officeBoard } from '../lib/office-model'
import type { TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'

const agent = (id: string, status: TeamAgentRow['status'] = 'running', parentId: string | null = 'lead'): TeamAgentRow => ({
  id, parentId, role: parentId ? 'worker' : 'lead', name: id, runtime: null, model: null, status, task: null,
  activities: [], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 1, updatedAt: 1, completedAt: null,
})
const task = (id: string, childId: string, status: TeamTaskRow['status'], prompt: string | null = null, completedAt: number | null = null, result: string | null = null): TeamTaskRow => ({
  id, childId, parentId: 'lead', name: childId, model: null, task: prompt, result, status, delivery: 'none', startedAt: 1, completedAt, updatedAt: 1,
})
const team = (agents: TeamAgentRow[], tasks: TeamTaskRow[], sessionId = 's'): TeamSnapshot => ({ sessionId, title: 'Ship the vendor portal', active: true, updatedAt: 1, agents, tasks })

test('board orders needs-you, failed, in-progress, then most recent done, capped at three', () => {
  const board = officeBoard(team([agent('lead', 'thinking', null), agent('asker', 'waiting_input'), agent('api'), agent('mapper', 'failed')], [
    task('a', 'old', 'done', null, 1), task('b', 'api', 'working'), task('c', 'mapper', 'failed'),
    task('d', 'new', 'done', null, 9), task('e', 'dropped', 'cancelled'),
  ]), 'Ship the vendor portal')
  assert.equal(board.goal, 'Ship the vendor portal')
  assert.deepEqual([board.done, board.total], [2, 4])
  assert.deepEqual(board.items.map(item => [item.state, item.label]), [['waiting', 'asker needs you'], ['failed', 'mapper'], ['working', 'api']])
  const doneOnly = officeBoard(team([], [task('a', 'old', 'done', null, 1), task('b', 'new', 'done', null, 9)]), 'g')
  assert.deepEqual(doneOnly.items.map(item => item.label), ['new', 'old'])
})

test('board never shows delegated prompts or results, only agent display names', () => {
  const secret = 'Use API_KEY=sk-live-123 to call the vendor service'
  const board = officeBoard(team([agent('API / Builder')], [
    task('a', 'API / Builder', 'working', secret, null, 'RESULT OUTPUT'),
    task('b', 'unknown-child', 'failed', `${secret}\nmore`),
  ]), 'g')
  const text = JSON.stringify(board)
  assert.ok(!text.includes('API_KEY') && !text.includes('sk-live') && !text.includes('RESULT'))
  assert.deepEqual(board.items.map(item => item.label), ['unknown-child', 'API / Builder'])
})

test('scene attaches a board to every team floor using the session title as the goal', () => {
  const big = team([agent('lead', 'thinking', null), ...Array.from({ length: 6 }, (_, i) => agent(`w${i}`))], [task('a', 'w0', 'working')])
  const scene = buildOfficeScene([{ ...big, project: 'Portal' }], 'active', false, new Map())
  const floor = scene.floors.find(f => f.kind === 'team')!
  assert.equal(floor.room, 'room-c-big')
  assert.equal(floor.board?.goal, 'Ship the vendor portal')
  assert.equal(floor.board?.total, 1)
})

test('a held floor reads its board from the current scene and disappears with its team', () => {
  const members = [agent('lead', 'thinking', null), ...Array.from({ length: 6 }, (_, i) => agent(`w${i}`))]
  const before = buildOfficeScene([team(members, [task('a', 'w0', 'working')])], 'session', false, new Map())
  const after = buildOfficeScene([team(members, [task('a', 'w0', 'done', null, 5)])], 'session', false, new Map())
  const held = before.floors.find(f => f.kind === 'team')!
  assert.equal(held.board?.done, 0)
  assert.equal(currentOfficeBoard(held, after)?.done, 1)
  assert.equal(currentOfficeBoard(held, buildOfficeScene([team(members, [], 'other')], 'session', false, new Map())), null)
})
