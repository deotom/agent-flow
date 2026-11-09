import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ORB_MAX_DOTS, orbSummary, pickOrbTeam } from '../lib/orb-model'
import { teamSnapshotsIn } from '../hooks/use-team-feed'
import type { TeamActivity, TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'

const agent = (id: string, fields: Partial<TeamAgentRow> = {}): TeamAgentRow => ({
  id, parentId: 'lead', role: 'worker', name: id, runtime: 'codex', model: 'gpt-test', status: 'running', task: null, activities: [],
  requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 1, updatedAt: 1, completedAt: null, ...fields,
})
const lead = (fields: Partial<TeamAgentRow> = {}) => agent('lead', { parentId: null, role: 'lead', status: 'thinking', ...fields })
const task = (childId: string, fields: Partial<TeamTaskRow> = {}): TeamTaskRow => ({
  id: `t-${childId}`, childId, parentId: 'lead', name: childId, model: null, task: null, result: null, status: 'done', delivery: 'none',
  startedAt: 1, completedAt: 2, updatedAt: 2, ...fields,
})
const team = (agents: TeamAgentRow[] = [], tasks: TeamTaskRow[] = [], fields: Partial<TeamSnapshot> = {}): TeamSnapshot => ({
  sessionId: 't3:x', title: 'x', active: true, updatedAt: 1, agents, tasks, ...fields,
})
const background = (id: string): TeamActivity => ({ id, type: 'background_command', toolName: null, title: null, startedAt: null })

describe('pickOrbTeam chooses the team the orb shows', () => {
  const snapshots = (entries: TeamSnapshot[]) => Object.fromEntries(entries.map(item => [item.sessionId, item]))

  it('returns the preferred team when it exists', () => {
    const a = team([lead()], [], { sessionId: 't3:a', active: false, updatedAt: 1 })
    const b = team([lead()], [], { sessionId: 't3:b', active: true, updatedAt: 9 })
    assert.equal(pickOrbTeam(snapshots([a, b]), 't3:a'), a)
  })

  it('falls back to an active team over an inactive newer one', () => {
    const old = team([lead()], [], { sessionId: 't3:old', active: true, updatedAt: 5 })
    const finished = team([lead()], [], { sessionId: 't3:finished', active: false, updatedAt: 99 })
    assert.equal(pickOrbTeam(snapshots([finished, old]), null), old)
  })

  it('picks the newest updatedAt among active teams', () => {
    const older = team([lead()], [], { sessionId: 't3:older', active: true, updatedAt: 3 })
    const newer = team([lead()], [], { sessionId: 't3:newer', active: true, updatedAt: 7 })
    const finished = team([lead()], [], { sessionId: 't3:finished', active: false, updatedAt: 100 })
    assert.equal(pickOrbTeam(snapshots([older, finished, newer]), null), newer)
  })

  it('returns null when there are no teams', () => {
    assert.equal(pickOrbTeam({}, null), null)
    assert.equal(pickOrbTeam({}, 't3:missing'), null)
  })

  it('ignores a preferred id that is missing and falls back to the best team', () => {
    const only = team([lead()], [], { sessionId: 't3:only', active: true, updatedAt: 2 })
    assert.equal(pickOrbTeam(snapshots([only]), 't3:missing'), only)
  })
})

describe('orbSummary dots and overflow', () => {
  it('shows at most ORB_MAX_DOTS running workers and counts the rest as overflow', () => {
    const runners = Array.from({ length: 10 }, (_, index) => agent(`run${index}`, { startedAt: index + 2 }))
    const summary = orbSummary(team([lead({ status: 'thinking' }), ...runners]))
    assert.equal(summary.dots.length, ORB_MAX_DOTS)
    assert.equal(summary.overflow, 2)
    assert.ok(summary.dots.every(dot => dot.working))
    assert.ok(summary.dots.every(dot => dot.id !== 'lead'), 'The lead never gets a dot')
  })

  it('lists working workers first and never the lead', () => {
    const finished = agent('finished', { status: 'done', startedAt: 1 })
    const runners = Array.from({ length: 10 }, (_, index) => agent(`run${index}`, { startedAt: index + 2 }))
    const summary = orbSummary(team([lead(), finished, ...runners]))
    assert.equal(summary.dots.length, ORB_MAX_DOTS)
    assert.ok(summary.dots.every(dot => dot.working), 'The done worker is pushed out by working ones')
    assert.equal(summary.overflow, 3, '11 open workers minus 8 dots')
    assert.ok(summary.dots.every(dot => dot.id !== 'lead' && dot.id !== 'finished'))
  })

  it('shows every open worker without overflow when there are few', () => {
    const summary = orbSummary(team([lead(), agent('a'), agent('b', { status: 'done' })]))
    assert.deepEqual(summary.dots.map(dot => [dot.id, dot.working]), [['a', true], ['b', false]])
    assert.equal(summary.overflow, 0)
  })
})

describe('orbSummary alert', () => {
  it('is waiting when a worker waits for approval', () => {
    assert.equal(orbSummary(team([lead(), agent('w', { status: 'waiting_approval' })])).alert, 'waiting')
  })

  it('is failed when a worker failed and nothing waits', () => {
    assert.equal(orbSummary(team([lead(), agent('w', { status: 'failed' })])).alert, 'failed')
  })

  it('lets waiting outrank failed', () => {
    const summary = orbSummary(team([lead(), agent('f', { status: 'failed' }), agent('w', { status: 'waiting_input' })]))
    assert.equal(summary.alert, 'waiting')
  })

  it('is null when only running workers exist', () => {
    assert.equal(orbSummary(team([lead(), agent('w')])).alert, null)
  })

  it('is null for a failed worker whose failure already reached the lead', () => {
    const summary = orbSummary(team([lead(), agent('f', { status: 'failed' })], [task('f', { status: 'failed', delivery: 'delivered' })]))
    assert.equal(summary.alert, null)
  })
})

describe('orbSummary line', () => {
  it('reads "› idle" for an idle lead with no working workers', () => {
    assert.equal(orbSummary(team([lead({ status: 'idle' })])).line, '› idle')
  })

  it('adds the working count for an idle lead with two running workers', () => {
    const line = orbSummary(team([lead({ status: 'idle' }), agent('a'), agent('b')])).line
    assert.ok(line.startsWith('› idle'), line)
    assert.ok(line.endsWith('· 2 working'), line)
    assert.equal(line, '› idle · 2 working')
  })

  it('names the background commands a lead is waiting on', () => {
    const summary = orbSummary(team([lead({ status: 'background', activities: [background('b1'), background('b2')] })]))
    assert.ok(summary.line.includes('waiting on 2 background commands'), summary.line)
  })
})

describe('orbSummary busy', () => {
  it('is false for an idle lead whose finished workers were all received', () => {
    const summary = orbSummary(team(
      [lead({ status: 'idle' }), agent('a', { status: 'done' }), agent('b', { status: 'done' })],
      [task('a', { delivery: 'received' }), task('b', { delivery: 'received' })],
    ))
    assert.equal(summary.busy, false)
    assert.equal(summary.dots.length, 0, 'Received workers drop out of the active view')
    assert.equal(summary.overflow, 0)
    assert.equal(summary.line, '› idle')
  })

  it('is true when any worker is running', () => {
    assert.equal(orbSummary(team([lead({ status: 'idle' }), agent('w')])).busy, true)
  })

  it('is true while a worker waits for the user', () => {
    assert.equal(orbSummary(team([lead({ status: 'idle' }), agent('w', { status: 'waiting_approval' })])).busy, true)
  })
})

describe('teamSnapshotsIn extracts T3 team snapshots from relay messages', () => {
  const teamSnapshot = (sessionId: string) => ({ sessionId, title: 'x', active: true, updatedAt: 1, agents: [], tasks: [] })
  const sessionEvent = (sessionId: string, payload: Record<string, unknown> = {}) => ({
    type: 'session_snapshot', sessionId, payload: { source: 't3', team: teamSnapshot(sessionId), ...payload },
  })

  it('extracts the team from a single agent-event', () => {
    const message = { type: 'agent-event', event: sessionEvent('t3:x') }
    assert.deepEqual(teamSnapshotsIn(message), [teamSnapshot('t3:x')])
  })

  it('extracts every team from an agent-event-batch and skips other events in it', () => {
    const message = {
      type: 'agent-event-batch',
      events: [sessionEvent('t3:a'), { type: 'agent_status', sessionId: 't3:b', payload: { source: 't3' } }, sessionEvent('t3:b')],
    }
    assert.deepEqual(teamSnapshotsIn(message).map(item => item.sessionId), ['t3:a', 't3:b'])
  })

  it('ignores snapshots from a non-t3 source', () => {
    assert.deepEqual(teamSnapshotsIn({ type: 'agent-event', event: sessionEvent('t3:x', { source: 'claude' }) }), [])
    assert.deepEqual(teamSnapshotsIn({ type: 'agent-event', event: sessionEvent('t3:x', { source: undefined }) }), [])
  })

  it('ignores a team whose sessionId differs from the event sessionId', () => {
    const message = { type: 'agent-event', event: { type: 'session_snapshot', sessionId: 't3:x', payload: { source: 't3', team: teamSnapshot('t3:other') } } }
    assert.deepEqual(teamSnapshotsIn(message), [])
  })

  it('ignores other message types and other event types', () => {
    assert.deepEqual(teamSnapshotsIn({ type: 'session-ended', sessionId: 't3:x' }), [])
    assert.deepEqual(teamSnapshotsIn({ type: 'agent-event', event: { type: 'agent_status', sessionId: 't3:x', payload: { source: 't3', team: teamSnapshot('t3:x') } } }), [])
    assert.deepEqual(teamSnapshotsIn({ type: 'something-else', event: sessionEvent('t3:x') }), [])
  })

  it('returns nothing for null and malformed input', () => {
    const malformed: unknown[] = [
      null, undefined, 'agent-event', 42, [], {}, { type: 5 },
      { type: 'agent-event' },
      { type: 'agent-event', event: null },
      { type: 'agent-event-batch', events: 'not-an-array' },
      { type: 'agent-event-batch' },
      { type: 'agent-event', event: { type: 'session_snapshot', sessionId: 't3:x', payload: { source: 't3', team: null } } },
      { type: 'agent-event', event: { type: 'session_snapshot', sessionId: 't3:x', payload: { source: 't3', team: { sessionId: 't3:x' } } } },
      { type: 'agent-event', event: { type: 'session_snapshot', sessionId: 't3:x', payload: { source: 't3', team: { sessionId: 't3:x', agents: 'nope' } } } },
    ]
    for (const message of malformed) assert.deepEqual(teamSnapshotsIn(message), [], JSON.stringify(message))
  })
})
