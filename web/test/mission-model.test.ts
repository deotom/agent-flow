import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildMissionView, missionActivity, missionStage } from '../lib/mission-model'
import { createEmptyState } from '../hooks/simulation/types'
import { missionPresentation } from '../lib/graph-presentation'
import type { TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'

const agent = (id: string, fields: Partial<TeamAgentRow> = {}): TeamAgentRow => ({
  id, parentId: 'lead', role: 'worker', name: id, runtime: 'codex', model: 'gpt-test', status: 'running', task: null, activities: [],
  requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 1, updatedAt: 1, completedAt: null, ...fields,
})
const lead = (fields: Partial<TeamAgentRow> = {}) => agent('lead', { parentId: null, role: 'lead', status: 'thinking', ...fields })
const task = (childId: string, fields: Partial<TeamTaskRow> = {}): TeamTaskRow => ({
  id: `t-${childId}`, childId, parentId: 'lead', name: childId, model: null, task: null, result: null, status: 'done', delivery: 'none',
  startedAt: 1, completedAt: 2, updatedAt: 2, ...fields,
})
const team = (agents: TeamAgentRow[], tasks: TeamTaskRow[] = []): TeamSnapshot => ({ sessionId: 't3:x', title: 'x', active: true, updatedAt: 1, agents, tasks })

describe('mission stages come only from T3 evidence', () => {
  it('maps agent status and delivery to one stage per link', () => {
    assert.equal(missionStage(agent('w'), undefined), 'working')
    assert.equal(missionStage(agent('w', { status: 'waiting_approval' }), task('w', { status: 'working' })), 'waiting')
    assert.equal(missionStage(agent('w', { status: 'done' }), task('w')), 'queued')
    assert.equal(missionStage(agent('w', { status: 'done' }), task('w', { delivery: 'pending' })), 'queued')
    assert.equal(missionStage(agent('w', { status: 'done' }), task('w', { delivery: 'delivered' })), 'sent')
    assert.equal(missionStage(agent('w', { status: 'done' }), task('w', { delivery: 'received' })), 'received')
    assert.equal(missionStage(agent('w', { status: 'done' }), task('w', { delivery: 'discarded' })), 'discarded')
    assert.equal(missionStage(agent('w', { status: 'failed' }), task('w', { status: 'failed', delivery: 'delivered' })), 'failed')
    assert.equal(missionStage(agent('w', { status: 'cancelled' }), task('w', { status: 'cancelled' })), 'cancelled')
    assert.equal(missionStage(agent('w', { status: 'done' }), undefined), 'unknown', 'No task record is not invented as delivered')
  })
})

describe('mission layout and nested teams', () => {
  const nested = team(
    [lead(), agent('squad', { startedAt: 2 }), agent('icons', { parentId: 'squad' }), agent('check', { parentId: 'squad', status: 'waiting_approval' }),
      agent('lint', { parentId: 'squad', status: 'failed' }), agent('solo', { startedAt: 3, status: 'done' })],
    [task('squad', { status: 'working' }), task('icons', { parentId: 'squad', status: 'working' }), task('check', { parentId: 'squad', status: 'working' }),
      task('lint', { parentId: 'squad', status: 'failed' }), task('solo', { delivery: 'delivered' })])

  it('turns a delegating worker into a sub-lead with a summary and code plate', () => {
    const view = buildMissionView(nested)!
    const squad = view.nodes.get('squad')!
    assert.equal(view.nodes.get('lead')!.role, 'lead')
    assert.equal(squad.role, 'sublead')
    assert.equal(squad.plate, 'full')
    assert.deepEqual(squad.summary, { children: 3, working: 1, waiting: 1, failed: 1 })
    assert.equal(view.nodes.get('solo')!.plate, 'compact')
    assert.equal(view.nodes.get('check')!.plate, 'full', 'A node that needs the user gets a full plate')
    assert.equal(view.nodes.get('solo')!.statusLine, 'sent // await ack')
    assert.equal(view.nodes.get('squad')!.modelLine, 'codex::gpt-test')
  })

  it('lights the whole path from the lead to a descendant that needs the user', () => {
    const view = buildMissionView(nested)!
    const link = (to: string) => view.links.find(item => item.to === to)!
    assert.equal(link('squad').alert, 'waiting')
    assert.equal(link('check').alert, 'waiting')
    assert.equal(link('check').stage, 'waiting')
    assert.equal(link('lint').alert, 'failed')
    assert.equal(link('icons').alert, null)
    assert.equal(link('solo').alert, null)
  })

  it('places children further out than their parent and keeps positions when a status changes', () => {
    const view = buildMissionView(nested)!
    const distance = (id: string) => Math.hypot(view.nodes.get(id)!.x, view.nodes.get(id)!.y)
    assert.ok(distance('icons') > distance('squad'))
    const changed = buildMissionView({ ...nested, agents: nested.agents.map(item => item.id === 'icons' ? { ...item, status: 'done' as const } : item) })!
    for (const id of ['squad', 'icons', 'check', 'solo']) {
      assert.deepEqual([changed.nodes.get(id)!.x, changed.nodes.get(id)!.y], [view.nodes.get(id)!.x, view.nodes.get(id)!.y], id)
    }
  })

  it('folds a settled sub-team until the user expands it', () => {
    const settled = team([lead(), agent('squad', { status: 'done' }), agent('a', { parentId: 'squad', status: 'done' }), agent('b', { parentId: 'squad', status: 'done' })],
      [task('squad', { delivery: 'received' }), task('a', { parentId: 'squad', delivery: 'received' }), task('b', { parentId: 'squad', delivery: 'received' })])
    const folded = buildMissionView(settled)!
    assert.equal(folded.nodes.get('squad')!.collapsed, true)
    assert.equal(folded.nodes.get('squad')!.hiddenChildren, 2)
    assert.equal(folded.nodes.has('a'), false)
    const open = buildMissionView(settled, undefined, new Set(['squad']))!
    assert.equal(open.nodes.get('squad')!.collapsed, false)
    assert.ok(open.nodes.has('a') && open.nodes.has('b'))
  })

  it('keeps the delegation chain of a shown agent even when its parent is scoped out', () => {
    const snapshot = team([lead(), agent('mid', { status: 'done' }), agent('deep', { parentId: 'mid' })], [task('mid', { delivery: 'received' })])
    const view = buildMissionView(snapshot, new Set(['lead', 'deep']))!
    assert.ok(view.nodes.has('mid') && view.nodes.has('deep'))
    assert.ok(view.links.some(link => link.from === 'mid' && link.to === 'deep'))
  })

  it('pins canvas agents to mission positions and swaps edges for mission links', () => {
    const view = buildMissionView(team([lead(), agent('w')]))!
    const state = createEmptyState()
    for (const id of ['lead', 'stray']) state.agents.set(id, { id, x: 999, y: 999, opacity: 1, scale: 1 } as never)
    const presented = missionPresentation(state, view)
    assert.deepEqual([...presented.agents.keys()].sort(), ['lead', 'w'])
    assert.equal(presented.agents.get('w')!.name, 'w', 'A worker the simulation dropped is drawn from the snapshot')
    assert.equal(presented.agents.get('w')!.x, view.nodes.get('w')!.x)
    assert.deepEqual(presented.edges.map(edge => edge.id), ['mission:lead:w'])
    assert.equal(presented.toolCalls.size, 0)
  })
})

describe('mission alerts and folding edge cases', () => {
  it('lets a question for the user outrank a failed sub-lead on the path', () => {
    const view = buildMissionView(team([lead(), agent('s', { status: 'failed' }), agent('w', { parentId: 's', status: 'waiting_approval' })],
      [task('s', { status: 'failed' }), task('w', { parentId: 's', status: 'working' })]))!
    assert.equal(view.links.find(link => link.to === 's')!.alert, 'waiting')
  })
  it('keeps a sub-team open while its own result is still queued', () => {
    const view = buildMissionView(team([lead(), agent('s', { status: 'done' }), agent('a', { parentId: 's', status: 'done' })],
      [task('s'), task('a', { parentId: 's', delivery: 'received' })]))!
    assert.equal(view.nodes.get('s')!.collapsed, false)
  })
})

describe('mission activity drives the node effect', () => {
  it('reads the kind of work from T3 activity items only', () => {
    const item = (type: string, toolName: string | null = null) => [{ id: '1', type, toolName, title: null, startedAt: null }]
    assert.equal(missionActivity(agent('w', { status: 'thinking' })), 'thinking')
    assert.equal(missionActivity(agent('w', { activities: item('command_execution') })), 'command')
    assert.equal(missionActivity(agent('w', { activities: item('file_change') })), 'edit')
    assert.equal(missionActivity(agent('w', { activities: item('web_search') })), 'search')
    assert.equal(missionActivity(agent('w', { activities: item('dynamic_tool', 'delegate_task') })), 'delegate')
    assert.equal(missionActivity(agent('w', { activities: item('compaction') })), 'compacting')
    assert.equal(missionActivity(agent('w', { activities: item('mcp_tool_call', 'figma_read') })), 'tool')
    assert.equal(missionActivity(agent('w', { status: 'done' })), null)
  })
})
