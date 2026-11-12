import { it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficeView } from '../components/agent-visualizer/office/office-view'
import { officeKey } from '../lib/office-model'
import type { TeamSnapshot } from '../lib/team-types'

const team = (sessionId: string, name: string): TeamSnapshot => ({ sessionId, title: name, active: true, updatedAt: 1000, tasks: [], agents: [{ id: 'same-lead-id', parentId: null, role: 'lead', name, runtime: 'codex', model: null, status: 'thinking', task: 'Real task from T3', activities: [], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 1000, updatedAt: 1000, completedAt: null }] })
const props = { scope: 'active' as const, selectedKey: null, onSelect: () => {}, onOpenTeam: () => {}, live: true, visible: true, animationMode: 'off' as const, now: 1000 }

it('renders all loaded teams without a session picker and keeps actual names and provider labels', () => {
  const html = renderToStaticMarkup(<OfficeView {...props} snapshots={[team('t3:a','First lead'),team('t3:b','Second lead')]} selectedKey={officeKey('t3:a','same-lead-id')} />)
  assert.ok(html.includes('First lead') && html.includes('Second lead'))
  assert.ok(html.includes('Codex'))
  assert.ok(!html.includes('<select'))
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.ok(html.includes('Model not reported'))
  assert.ok(!html.includes('Mali'))
})
it('renders empty and stale states honestly without a canvas animation requirement', () => {
  const empty = renderToStaticMarkup(<OfficeView {...props} snapshots={[]} />)
  assert.ok(empty.includes('Waiting for T3 team snapshots'))
  const stale = renderToStaticMarkup(<OfficeView {...props} snapshots={[team('t3:a','Quiet source')]} live={false} />)
  assert.ok(stale.includes('Last known positions'))
})
it('lets quiet teams leave the default building while preserving a way to inspect them', () => {
  const quiet = team('t3:a','At home')
  quiet.agents[0].status = 'idle'
  const html = renderToStaticMarkup(<OfficeView {...props} snapshots={[quiet]} />)
  assert.ok(html.includes('Show 1 quiet teams'))
  assert.ok(!html.includes('aria-label="At home, Codex'))
})
