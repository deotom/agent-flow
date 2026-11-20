import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withoutAgents } from '../lib/graph-presentation'
import { ageLabel, buildTeamView, connectionView, deliverySteps, plainToolLabel, statusText, treeGuides } from '../lib/team-model'
import type { SourceHealth, TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'

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
const stepStates = (status: TeamTaskRow['status'], delivery: TeamTaskRow['delivery']) => deliverySteps({ status, delivery }).steps.map(step => step.state)

describe('plain language', () => {
  it('replaces internal names and stays honest about unknown tools', () => {
    assert.equal(plainToolLabel(null, 'command_execution'), 'Running a command')
    assert.equal(plainToolLabel('command_execution'), 'Running a command')
    assert.equal(plainToolLabel('mcp__t3-code__delegate_task', 'dynamic_tool'), 'Delegating to a worker')
    assert.equal(plainToolLabel('t3-code.delegate_task', 'dynamic_tool'), 'Delegating to a worker')
    assert.equal(plainToolLabel('Grep'), 'Searching code')
    assert.equal(plainToolLabel('frobnicateTheWidget'), 'Using frobnicate the widget')
    assert.equal(plainToolLabel(null, 'never_seen_type'), 'Using a tool')
  })
  it('states the lead is idle with workers running, without claiming it waits for them', () => {
    assert.equal(statusText(lead({ status: 'idle' }), 2), 'Idle · 2 workers still working')
    assert.equal(statusText(agent('w', { status: 'running', activities: [{ id: '1', type: 'file_change', toolName: null, title: null, startedAt: null }] })), 'Editing files')
  })
})

describe('delivery evidence', () => {
  it('never lights a step without evidence', () => {
    assert.deepEqual(stepStates('working', 'none'), ['active', 'pending', 'pending', 'pending'])
    assert.deepEqual(stepStates('done', 'none'), ['done', 'done', 'pending', 'pending'])
    assert.deepEqual(stepStates('done', 'pending'), ['done', 'done', 'active', 'pending'])
    assert.deepEqual(stepStates('done', 'delivered'), ['done', 'done', 'done', 'pending'])
    assert.deepEqual(stepStates('done', 'received'), ['done', 'done', 'done', 'done'])
    assert.deepEqual(stepStates('done', 'discarded'), ['done', 'done', 'failed', 'pending'])
    assert.deepEqual(stepStates('failed', 'none'), ['failed', 'failed', 'pending', 'pending'])
    assert.deepEqual(stepStates('done', 'unknown'), ['done', 'done', 'pending', 'pending'])
  })
  it('separates sent from received in the caption', () => {
    assert.match(deliverySteps({ status: 'done', delivery: 'delivered' }).caption, /not confirmed/)
    assert.match(deliverySteps({ status: 'done', delivery: 'received' }).caption, /received/)
  })
})

describe('team view', () => {
  it('builds a solo lead', () => {
    const view = buildTeamView(team([lead()]), 'active')
    assert.equal(view.rows.length, 1)
    assert.equal(view.rows[0].depth, 0)
    assert.equal(view.counts.active, 1)
    assert.equal(view.hiddenFinished, 0)
  })
  it('nests only by explicit parent IDs, not by similar names', () => {
    const view = buildTeamView(team([lead(), agent('lead worker'), agent('child', { parentId: 'lead worker' }), agent('orphan', { parentId: 'gone' })]), 'session')
    const depth = Object.fromEntries(view.rows.map(row => [row.agent.id, row.depth]))
    assert.deepEqual(depth, { lead: 0, 'lead worker': 1, child: 2, orphan: 0 })
    assert.equal(view.rows.find(row => row.agent.id === 'orphan')?.orphan, true)
    assert.equal(view.rows[0].agent.id, 'lead')
  })
  it('keeps an unreceived result open but lets finished work drop out of the active scope', () => {
    const agents = [lead(), agent('running'), agent('unsent', { status: 'done' }), agent('sent', { status: 'done' }), agent('received', { status: 'done' })]
    const tasks = [task('running', { status: 'working' }), task('unsent'), task('sent', { delivery: 'delivered' }), task('received', { delivery: 'received' })]
    const active = buildTeamView(team(agents, tasks), 'active')
    assert.deepEqual(active.rows.map(row => row.agent.id), ['lead', 'running', 'unsent'])
    assert.equal(active.hiddenFinished, 2)
    assert.equal(buildTeamView(team(agents, tasks), 'session').rows.length, 5)
    assert.deepEqual([active.counts.working, active.counts.done, active.counts.sent, active.counts.received], [1, 1, 1, 1])
  })
  it('keeps a finished parent visible when its child is still working', () => {
    const view = buildTeamView(team([lead(), agent('mid', { status: 'done' }), agent('deep', { parentId: 'mid' })], [task('mid', { delivery: 'received' })]), 'active')
    assert.deepEqual(view.rows.map(row => row.agent.id), ['lead', 'mid', 'deep'])
  })
  it('orders current work above old work among siblings', () => {
    const view = buildTeamView(team([lead(), agent('old', { status: 'done', startedAt: 0 }), agent('now', { startedAt: 5 }), agent('ask', { status: 'waiting_input', startedAt: 9 })],
      [task('old', { delivery: 'received' })]), 'session')
    assert.deepEqual(view.rows.map(row => row.agent.id), ['lead', 'ask', 'now', 'old'])
  })
  it('raises attention for evidence only and honours dismissal', () => {
    const agents = [lead(), agent('ask', { status: 'waiting_approval' }), agent('bad', { status: 'failed' }), agent('lost', { status: 'done' }), agent('quiet', { updatedAt: 0 })]
    const tasks = [task('bad', { status: 'failed' }), task('lost', { delivery: 'discarded' })]
    const view = buildTeamView(team(agents, tasks), 'active')
    assert.deepEqual(view.attention.map(item => item.kind), ['waiting', 'failed', 'discarded'])
    assert.ok(!view.attention.some(item => item.agentId === 'quiet'), 'Time passing is not a problem')
    assert.equal(buildTeamView(team(agents, tasks), 'active', new Set([view.attention[1].id])).attention.length, 2)
  })
  it('closes a finished worker whose result T3 discarded, but keeps the alert', () => {
    const view = buildTeamView(team([lead(), agent('lost', { status: 'done' })], [task('lost', { delivery: 'discarded' })]), 'active')
    assert.deepEqual(view.rows.map(row => row.agent.id), ['lead'])
    assert.deepEqual(view.attention.map(item => item.kind), ['discarded'])
  })
  it('treats a cancelled worker as history, without alarming about its discarded result', () => {
    const view = buildTeamView(team([lead(), agent('stopped', { status: 'cancelled' }), agent('now')], [task('stopped', { status: 'cancelled', delivery: 'discarded' })]), 'active')
    assert.deepEqual(view.rows.map(row => row.agent.id), ['lead', 'now'])
    assert.equal(view.attention.length, 0)
    assert.equal(view.counts.issues, 0)
  })
  it('keeps a failure open until its report reaches the lead', () => {
    const agents = [lead(), agent('unsent', { status: 'failed' }), agent('reported', { status: 'failed' })]
    const tasks = [task('unsent', { status: 'failed' }), task('reported', { status: 'failed', delivery: 'delivered' })]
    const view = buildTeamView(team(agents, tasks), 'active')
    assert.deepEqual(view.rows.map(row => row.agent.id), ['lead', 'unsent'])
    assert.deepEqual(view.attention.map(item => item.agentId), ['unsent'])
  })
  it('does not loop on corrupt cycles', () => {
    const view = buildTeamView(team([agent('a', { parentId: 'b' }), agent('b', { parentId: 'a' })]), 'active')
    assert.equal(view.rows.length, 2)
  })
})

describe('connection', () => {
  const health = (fields: Partial<SourceHealth> = {}): SourceHealth => ({ source: 't3', state: 'ok', checkedAt: 100_000, lastSuccessAt: 100_000, lastChangeAt: 1, pollIntervalMs: 2000, reason: null, ...fields })
  it('stays connected through a long quiet period when reads succeed', () => {
    const view = connectionView('open', health({ lastChangeAt: 1 }), 101_000)
    assert.equal(view.label, 'Connected')
    assert.equal(view.live, true)
  })
  it('separates an unreadable source from a lost link and from silence', () => {
    assert.equal(connectionView('open', health({ state: 'unavailable', reason: 'T3 database not found.' }), 100_000).label, 'Unavailable')
    assert.equal(connectionView('reconnecting', health(), 100_000).label, 'Reconnecting')
    assert.equal(connectionView('open', health(), 130_000).label, 'Read delayed')
    assert.equal(connectionView('open', null, 0).label, 'Connecting')
  })
  it('stops claiming live activity unless the read is current', () => {
    assert.equal(connectionView('open', health({ state: 'unavailable' }), 100_000).live, false)
    assert.equal(connectionView('reconnecting', health(), 100_000).live, false)
  })
  it('warns about delayed data at the same deadline without pretending the open link is reconnecting', () => {
    assert.equal(connectionView('open',health(),110_000).label,'Connected')
    const delayed=connectionView('open',health(),110_001)
    assert.equal(delayed.label,'Read delayed')
    assert.equal(delayed.tone,'warn')
    assert.equal(delayed.live,false)
    assert.match(delayed.detail,/still connected/i)
    assert.equal(connectionView('open',health({checkedAt:110_001,lastSuccessAt:110_001}),110_002).label,'Connected')
    assert.equal(connectionView('reconnecting',health({checkedAt:110_001}),110_002).label,'Reconnecting')
  })
  it('words age without judgment', () => {
    assert.equal(ageLabel(null, 10), 'unknown')
    assert.equal(ageLabel(1000, 3000), 'just now')
    assert.equal(ageLabel(0 + 1, 601_000), '10m ago')
  })
})

describe('graph scope', () => {
  it('drops hidden agents with their links, tools and particles', () => {
    const node = (id: string) => [id, { id }] as [string, never]
    const state = { agents: new Map([node('lead'), node('gone')]), edges: [{ id: 'e', from: 'lead', to: 'gone' }],
      toolCalls: new Map([['t', { agentId: 'gone' }]]), particles: [{ edgeId: 'e' }], discoveries: [{ agentId: 'gone' }] } as never
    const scoped = withoutAgents(state, new Set(['gone'])) as unknown as { agents: Map<string, unknown>; edges: unknown[]; toolCalls: Map<string, unknown>; particles: unknown[]; discoveries: unknown[] }
    assert.deepEqual([...scoped.agents.keys()], ['lead'])
    assert.deepEqual([scoped.edges.length, scoped.toolCalls.size, scoped.particles.length, scoped.discoveries.length], [0, 0, 0, 0])
    assert.equal(withoutAgents(state, new Set()), state)
  })
})

it('names native context compaction instead of a generic tool', () => {
  assert.equal(plainToolLabel(null, 'compaction'), 'Compacting context')
})

describe('background commands', () => {
  it('reads as working and names the number of commands T3 is waiting on', async () => {
    const { statusText, isWorking } = await import('../lib/team-model')
    const bg = { id: 'b', type: 'background_command', toolName: null, title: 'Watch run', startedAt: null }
    const lead = { id: 'lead', parentId: null, role: 'lead' as const, name: 'L', runtime: 'claude' as const, model: null, status: 'background' as const,
      task: null, activities: [bg, { ...bg, id: 'c' }], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 1, updatedAt: 1, completedAt: null }
    assert.equal(statusText(lead), 'Waiting on 2 background commands')
    assert.equal(isWorking('background'), true)
  })
})

it('tree guides keep trunks unbroken across siblings and nested children', () => {
  assert.deepEqual(treeGuides([0, 1, 2, 2, 1, 1]), [
    [],
    ['tee'],
    ['pass', 'tee'],
    ['pass', 'last'],
    ['tee'],
    ['last'],
  ])
  assert.deepEqual(treeGuides([0, 1, 2]), [[], ['last'], [null, 'last']])
})


describe('reused worker jobs',()=>{
 it('keeps the newer job current when an old result is delivered later',()=>{
  const old=task('worker',{id:'old',startedAt:10,completedAt:20,updatedAt:40,delivery:'delivered'})
  const current=task('worker',{id:'current',startedAt:30,completedAt:null,updatedAt:31,status:'working',delivery:'pending'})
  const view=buildTeamView(team([lead(),agent('worker',{status:'thinking'})],[old,current]),'active')
  assert.equal(view.rows.find(r=>r.agent.id==='worker')!.task?.id,'current')
 })
})
