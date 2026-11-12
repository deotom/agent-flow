import { it } from 'node:test'
import assert from 'node:assert/strict'
import { assignOfficeIdentities, buildOfficeScene, officeEvents, officeKey } from '../lib/office-model'
import type { TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'
const agent = (id: string, parentId: string | null = null): TeamAgentRow => ({ id, parentId, role: parentId ? 'worker' : 'lead', name: id, runtime: 'codex', model: null, status: 'running', task: null, activities: [], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 100, updatedAt: 200, completedAt: null })
const team = (id: string, agents: TeamAgentRow[], tasks: TeamTaskRow[] = []): TeamSnapshot => ({ sessionId: id, title: id, active: true, updatedAt: 200, agents, tasks })
const task = (fields: Partial<TeamTaskRow> = {}): TeamTaskRow => ({ id: 't', childId: 'worker', parentId: 'lead', name: '', model: null, task: null, result: null, status: 'working', delivery: 'none', startedAt: 210, updatedAt: 210, completedAt: null, ...fields })

it('keeps identities for temporarily absent teams and never lends their slot to a newcomer', () => {
  const before = new Map([['old',0],['still-here',1]])
  const next = assignOfficeIdentities(['still-here','new'],before)
  assert.equal(next.get('old'),0)
  assert.equal(next.get('still-here'),1)
  assert.notEqual(next.get('new'),0)
})
it('observes a new worker assignment in an already-loaded team, but does not replay old arrivals', () => {
  const previous = [team('s',[agent('lead')])]
  const next = [team('s',[agent('lead'),agent('worker','lead')],[task()])]
  assert.equal(officeEvents(previous,next,1000)[0]?.kind,'assigned')
  assert.equal(officeEvents(previous,[team('s',next[0].agents,[task({ startedAt: 50 })])],1000).length,0)
  assert.equal(officeEvents([team('s',[])],next,1000).length,0)
})
it('uses actual parent IDs and stable event identities when optional timestamps are absent', () => {
  const agents=[agent('lead'),agent('other'),agent('worker','lead')]
  const before=[team('s',agents,[task({ status:'done',delivery:'pending' })])]
  const next=[team('s',agents,[task({ status:'done',delivery:'delivered',parentId:'other',updatedAt:null,startedAt:null })])]
  const a=officeEvents(before,next,1000)[0],b=officeEvents(before,next,2000)[0]
  assert.equal(a.parentKey,null)
  assert.equal(a.id,b.id)
})
it('preserves an existing team floor identity when another team is inserted before it', () => {
  const b=team('b',[agent('lead')]),a=team('a',[agent('lead')])
  const identities=assignOfficeIdentities([officeKey('a','lead'),officeKey('b','lead')])
  const prior=buildOfficeScene([b],'active',false,identities),next=buildOfficeScene([a,b],'active',false,identities)
  assert.equal(prior.actors.find(a=>a.sessionId==='b')?.floorId,next.actors.find(a=>a.sessionId==='b')?.floorId)
})
it('lets idle teams leave even when old results have no delivery acknowledgement', () => {
  for(const delivery of ['none','pending','unknown'] as const){
    const lead={...agent('lead'),status:'idle' as const},worker={...agent('worker','lead'),status:'done' as const}
    const snapshot=team('s',[lead,worker],[task({status:'done',delivery})])
    const ids=assignOfficeIdentities(snapshot.agents.map(a=>officeKey('s',a.id)))
    const scene=buildOfficeScene([snapshot],'active',false,ids)
    assert.equal(scene.actors.length,1)
    assert.equal(scene.floors.filter(f=>f.kind==='team').length,0)
    assert.equal(scene.floors.filter(f=>f.kind==='lounge').length,1)
    assert.equal(scene.quietTeams.length,1)
    assert.equal(buildOfficeScene([snapshot],'session',true,ids).actors.length,2)
  }
})
it('does not create historical lounge floors in Current work while a sibling is active', () => {
  const lead={...agent('lead'),status:'idle' as const}
  const old=Array.from({length:10},(_,i)=>({...agent(`old-${i}`,'lead'),status:'done' as const}))
  const snapshot=team('s',[lead,agent('worker','lead'),...old],old.map(a=>task({id:a.id,childId:a.id,status:'done',delivery:'pending'})))
  const ids=assignOfficeIdentities(snapshot.agents.map(a=>officeKey('s',a.id)))
  const current=buildOfficeScene([snapshot],'active',false,ids)
  assert.deepEqual(current.actors.filter(a=>a.zone==='desk').map(a=>a.agent.id).sort(),['lead','worker'])
  assert.equal(current.floors.filter(f=>f.kind==='lounge').length,1)
  assert.equal(buildOfficeScene([snapshot],'session',false,ids).actors.length,12)
})
