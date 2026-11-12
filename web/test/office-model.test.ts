import test from 'node:test'
import assert from 'node:assert/strict'
import { assignOfficeIdentities, buildOfficeScene, officeEvents, officeKey, officeAppearance } from '../lib/office-model'
import type { TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'

const agent = (id: string, status: TeamAgentRow['status'] = 'thinking', parentId: string | null = null, startedAt = 1): TeamAgentRow => ({
  id, parentId, role: parentId ? 'worker' : 'lead', name: id, runtime: null, model: null, status, task: null,
  activities: [], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt, updatedAt: startedAt, completedAt: null,
})
const task = (id: string, childId: string, status: TeamTaskRow['status'], delivery: TeamTaskRow['delivery'] = 'none', updatedAt = 1): TeamTaskRow => ({
  id, childId, parentId: 'lead', name: childId, model: null, task: null, result: null, status, delivery, startedAt: 1,
  completedAt: null, updatedAt,
})
const team = (sessionId: string, agents: TeamAgentRow[], tasks: TeamTaskRow[] = []): TeamSnapshot => ({ sessionId, title: sessionId, active: true, updatedAt: 1, agents, tasks })

test('identity allocation preserves slots, sorts newcomers, and repairs invalid persisted slots', () => {
  assert.equal(officeKey('s1', 'x'), JSON.stringify(['s1', 'x']))
  const before = assignOfficeIdentities(['b', 'a'])
  const after = assignOfficeIdentities(['c', 'a', 'b'], before)
  assert.equal(after.get('a'), before.get('a')); assert.equal(after.get('b'), before.get('b'))
  assert.equal(after.get('c'), 2)
  const repaired = assignOfficeIdentities(['x', 'y', 'z'], new Map([['y', -1], ['x', 3.5], ['z', 1], ['gone', 0]]))
  assert.deepEqual([...repaired], [['gone', 0], ['z', 1], ['x', 2], ['y', 3]])
  const many = assignOfficeIdentities(Array.from({ length: 140 }, (_, i) => `k${i}`))
  assert.equal(new Set(many.values()).size, 140)
  const cross = assignOfficeIdentities([officeKey('s1', 'same'), officeKey('s2', 'same')])
  assert.equal(new Set(cross.values()).size, 2)
})

test('scene aggregates sessions, scopes through team view, lays out desks and terminal lounge', () => {
  const a = team('a', [agent('lead'), agent('w1', 'thinking', 'lead', 3), agent('w2', 'done', 'lead', 2)], [task('t2', 'w2', 'done', 'received')])
  const b = team('b', [agent('lead'), agent('w', 'waiting_input', 'lead')])
  const ids = assignOfficeIdentities([officeKey('a','lead'), officeKey('a','w1'), officeKey('a','w2'), officeKey('b','lead'), officeKey('b','w')])
  const scene = buildOfficeScene([b, a], 'session', true, ids)
  assert.equal(scene.totalAgents, 5); assert.equal(scene.finishedCount, 1)
  assert.equal(scene.actors.length, 5)
  assert.equal(scene.actors.find(x => x.key === officeKey('a','w2'))?.zone, 'lounge')
  assert.equal(scene.actors.find(x => x.key === officeKey('a','lead'))?.x, 20)
  assert.equal(officeAppearance(2).kind, 'robot')
  assert.equal(buildOfficeScene([a], 'active', false, ids).actors.some(x => x.agent.id === 'w2'), false)
  const quiet = team('quiet', [agent('q', 'idle')])
  assert.deepEqual(buildOfficeScene([quiet], 'session', false, assignOfficeIdentities([officeKey('quiet','q')])).quietTeams.map(x => x.sessionId), ['quiet'])
  assert.equal(buildOfficeScene([quiet], 'session', true, assignOfficeIdentities([officeKey('quiet','q')])).actors.length, 1)
})

test('nested, orphaned and cyclic agents remain visible exactly once', () => {
  const snap = team('s', [agent('lead'), agent('sub', 'thinking', 'lead'), agent('leaf', 'thinking', 'sub'), agent('orphan', 'thinking', 'missing'), agent('cy1', 'thinking', 'cy2'), agent('cy2', 'thinking', 'cy1')])
  const keys = snap.agents.map(a => officeKey('s', a.id)); const scene = buildOfficeScene([snap], 'session', true, assignOfficeIdentities(keys))
  assert.equal(scene.actors.length, snap.agents.length)
  assert.equal(new Set(scene.actors.map(a => a.agent.id)).size, snap.agents.length)
  assert.ok(scene.actors.find(a => a.agent.id === 'orphan'))
  assert.ok(scene.actors.find(a => a.agent.id === 'leaf')!.y > scene.actors.find(a => a.agent.id === 'lead')!.y)
})

test('large teams use extra floors while retaining every desk actor', () => {
  const agents = [agent('lead'), ...Array.from({length:8},(_,i)=>agent(`w${i}`,'thinking','lead',i+2))]
  const snap = team('large', agents)
  const scene = buildOfficeScene([snap], 'session', true, assignOfficeIdentities(agents.map(a=>officeKey('large',a.id))))
  assert.equal(scene.actors.length, 9)
  assert.ok(scene.floors.filter(f=>f.kind==='team').length >= 3)
  assert.equal(new Set(scene.actors.map(a=>a.key)).size, 9)
})

test('events avoid initial replay, detect strongest task transitions, and ignore new teams', () => {
  const before = [team('s', [agent('lead'), agent('w')], [task('t', 'w', 'working', 'pending')])]
  const next = [team('s', [agent('lead'), agent('w','done')], [task('t', 'w', 'done', 'received', 2)]), team('new', [agent('n')])]
  assert.deepEqual(officeEvents(null, before, 10), [])
  assert.deepEqual(officeEvents(before, next, 10).map(e => e.kind), ['received'])
  assert.deepEqual(officeEvents(next, [...next].reverse(), 11), [])
  const delivered = [team('s', [agent('lead'), agent('w','done')], [task('t', 'w', 'done', 'delivered', 3)])]
  assert.deepEqual(officeEvents(next, delivered, 12).map(e => e.kind), ['sent'])
  const base = [team('s', [agent('lead'),agent('w')], [])]
  const assigned = [team('s', [agent('lead'),agent('w')], [task('new','w','working')])]
  assert.deepEqual(officeEvents(base, assigned, 20).map(e=>e.kind), ['assigned'])
  const sent = [team('s',[agent('lead'),agent('w','done')],[task('new','w','done','delivered',2)])]
  assert.deepEqual(officeEvents(assigned,sent,21).map(e=>e.kind), ['sent'])
  const pending = [team('s',[agent('lead'),agent('w','done')],[task('new','w','done','pending',3)])]
  assert.deepEqual(officeEvents(sent,pending,22), [])
  const discarded = [team('s',[agent('lead'),agent('w','done')],[task('new','w','done','discarded',4)])]
  assert.deepEqual(officeEvents(pending,discarded,23), [])
})
