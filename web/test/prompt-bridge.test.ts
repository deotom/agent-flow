import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectsIn } from '../hooks/use-t3-projects'
import { cleanError, threadIdOf } from '../lib/desktop-actions'

describe('prompt bridge helpers', () => {
  it('reads only well-formed project lists from relay messages', () => {
    const project = { id: 'p1', title: 'AgentFlow', root: 'D:/Project/AgentFlow', current: true }
    assert.deepEqual(projectsIn({ type: 't3-projects', projects: [project, { id: 2 }, null] }), [project])
    assert.equal(projectsIn({ type: 'session-list', sessions: [] }), null)
    assert.equal(projectsIn(null), null)
  })
  it('strips Electron invoke wording from desktop errors', () => {
    assert.equal(cleanError("Error invoking remote method 'orb:t3-send': Error: Still sending the previous prompt."), 'Still sending the previous prompt.')
    assert.equal(cleanError('Invalid T3 thread id.'), 'Invalid T3 thread id.')
  })
  it('maps an Agent Flow session id to the T3 thread id', () => {
    assert.equal(threadIdOf('t3:0ee7682d-bd4e-4140-9532-1f91e39cbd23'), '0ee7682d-bd4e-4140-9532-1f91e39cbd23')
  })
})

describe('prompt targets', async () => {
  const { modelChoices, defaultProject } = await import('../lib/prompt-model')
  const { reconcileSnapshots } = await import('../hooks/use-team-feed')
  const team = (sessionId: string, agents: Array<{ runtime: 'claude' | 'codex' | null; model: string | null }>) =>
    ({ sessionId, title: sessionId, active: true, updatedAt: 1, tasks: [], agents: agents.map((a, i) => ({ id: `${sessionId}-${i}`, ...a })) }) as never

  it('offers only models T3 reported, most used first', () => {
    const choices = modelChoices([team('t3:a', [{ runtime: 'codex', model: 'gpt-6.1-sol' }, { runtime: 'claude', model: 'claude-opus-5-5' }]),
      team('t3:b', [{ runtime: 'codex', model: 'gpt-6.1-sol' }, { runtime: null, model: 'mystery' }, { runtime: 'claude', model: null }])])
    assert.deepEqual(choices.map(c => [c.provider, c.model]), [['codex', 'gpt-6.1-sol'], ['claudeAgent', 'claude-opus-5-5']])
  })
  it('defaults a new thread only to an exact, single project match', () => {
    const p = (id: string, current: boolean) => ({ id, title: id, root: `D:/${id}`, current })
    assert.equal(defaultProject([p('a', false), p('b', true)])?.id, 'b')
    assert.equal(defaultProject([p('a', false), p('b', false)]), null, 'No exact match is never guessed')
    assert.equal(defaultProject([p('a', true), p('b', true)]), null, 'Two matches need an explicit choice')
  })
  it('drops orb teams the relay no longer lists, including on an empty list', () => {
    const snapshots = { 't3:a': team('t3:a', []), 't3:b': team('t3:b', []) }
    assert.deepEqual(Object.keys(reconcileSnapshots(snapshots, ['t3:a'])), ['t3:a'])
    assert.deepEqual(reconcileSnapshots(snapshots, []), {})
    assert.equal(reconcileSnapshots(snapshots, ['t3:a', 't3:b']), snapshots, 'Unchanged lists keep the same object')
  })
})
