import { it } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectAttentionAlerts,
  createAttentionTracker,
  formatAttentionNotification,
} from '../lib/attention-notify'
import type { TeamAgentStatus, TeamSnapshot } from '../lib/team-types'

function team(sessionId: string, title: string, agents: Array<{ id: string; name: string; status: TeamAgentStatus }>): TeamSnapshot {
  return {
    sessionId,
    title,
    active: true,
    updatedAt: 1000,
    tasks: [],
    agents: agents.map(agent => ({
      id: agent.id,
      parentId: agent.id === 'lead' ? null : 'lead',
      role: agent.id === 'lead' ? 'lead' : 'worker',
      name: agent.name,
      runtime: 'codex',
      model: 'gpt-5',
      status: agent.status,
      task: 'Secret task prompt that should never appear in notifications',
      activities: [],
      requestKind: agent.status === 'waiting_approval' ? 'exec' : agent.status === 'waiting_input' ? 'input' : null,
      context: null,
      toolCallCount: 0,
      hasThread: true,
      startedAt: 1000,
      updatedAt: 1000,
      completedAt: null,
    })),
  }
}

it('suppresses initial-load and reconnect alerts until a live waiting transition occurs', () => {
  const tracker = createAttentionTracker()
  const waiting = [team('t3:1', 'Auth Fix', [{ id: 'lead', name: 'Lead', status: 'waiting_approval' }])]

  // Empty initial frame before SSE snapshots arrive keeps the tracker unprimed.
  assert.deepEqual(collectAttentionAlerts(tracker, [], true, 1000), [])
  // Initial snapshot already waiting must establish baseline silently.
  assert.deepEqual(collectAttentionAlerts(tracker, waiting, true, 2000), [])
  // Steady waiting stays silent.
  assert.deepEqual(collectAttentionAlerts(tracker, waiting, true, 4000), [])

  // Disconnect resets baseline so reconnecting to a waiting agent does not spam.
  assert.deepEqual(collectAttentionAlerts(tracker, waiting, false, 5000), [])
  assert.deepEqual(collectAttentionAlerts(tracker, waiting, true, 6000), [])
})

it('alerts on live waiting transitions, throttles flapping, strips paths, and groups concurrent agents', () => {
  const tracker = createAttentionTracker()
  const working = [team('t3:1', 'Repo C:\\Users\\alice\\secret\\repo', [
    { id: 'lead', name: 'Lead /Users/alice/app', status: 'running' },
    { id: 'w1', name: 'Reviewer', status: 'thinking' },
  ])]
  assert.deepEqual(collectAttentionAlerts(tracker, working, true, 1000), [])

  const first = collectAttentionAlerts(tracker, [team('t3:1', 'Repo C:\\Users\\alice\\secret\\repo', [
    { id: 'lead', name: 'Lead /Users/alice/app', status: 'waiting_approval' },
    { id: 'w1', name: 'Reviewer', status: 'thinking' },
  ])], true, 2000, 60_000)

  assert.equal(first.length, 1)
  assert.equal(first[0].title, 'Approval needed')
  assert.ok(!first[0].body.includes('Users'))
  assert.ok(!first[0].body.includes('Secret task prompt'))
  assert.deepEqual(formatAttentionNotification(first), {
    title: 'Approval needed',
    body: first[0].body,
    tag: 'attention:t3:1:lead',
  })

  // Flapping back to running then waiting within cooldown is suppressed for the same agent.
  assert.deepEqual(collectAttentionAlerts(tracker, working, true, 10_000, 60_000), [])
  assert.deepEqual(collectAttentionAlerts(tracker, [team('t3:1', 'Repo', [
    { id: 'lead', name: 'Lead', status: 'waiting_input' },
    { id: 'w1', name: 'Reviewer', status: 'waiting_input' },
  ])], true, 20_000, 60_000).map(item => item.agentId), ['w1'])

  // Multiple simultaneous transitions collapse into a single summary notification.
  const multi = collectAttentionAlerts(tracker, [team('t3:2', 'Second Team', [
    { id: 'a1', name: 'Alpha', status: 'waiting_approval' },
    { id: 'a2', name: 'Beta', status: 'waiting_input' },
  ])], true, 90_000, 60_000)
  assert.deepEqual(formatAttentionNotification(multi), {
    title: '2 agents need you',
    body: 'Alpha, Beta',
    tag: 'attention:t3:2:a1',
  })
  assert.equal(formatAttentionNotification([]), null)
})
