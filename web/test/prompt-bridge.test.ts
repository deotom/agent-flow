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
