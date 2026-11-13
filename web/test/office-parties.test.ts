import { it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveOfficeParties, emptyOfficePartyHistory } from '../lib/office-parties'
import { buildOfficeScene, OFFICE_PARTY_MS } from '../lib/office-model'
import { officePresenceEvents } from '../lib/office-motion'
import type { TeamSnapshot } from '../lib/team-types'
const active: TeamSnapshot = {sessionId:'s',title:'Team',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',name:'Lead',role:'lead',parentId:null,runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
const done: TeamSnapshot = {...active,agents:[{...active.agents[0],status:'done'}]}
it('derives immediate parties purely with stable identity and exact expiry',()=>{
  const initial=emptyOfficePartyHistory()
  const working=deriveOfficeParties(initial,[active],1234)
  const finished=deriveOfficeParties(working,[done],2345)
  assert.equal(working.since.size,0)
  assert.equal(working.quiet?.get('s'),false)
  assert.equal(initial.quiet,null)
  assert.deepEqual([...finished.parties],['s'])
  assert.equal(deriveOfficeParties(working,[active],2346).parties.size,0)
  const same=deriveOfficeParties(finished,[done],2345+OFFICE_PARTY_MS-1)
  assert.equal(same.parties,finished.parties)
  const expired=deriveOfficeParties(same,[done],2345+OFFICE_PARTY_MS)
  assert.equal(expired.parties.size,0)
  assert.equal(deriveOfficeParties(expired,[done],2346+OFFICE_PARTY_MS).parties,expired.parties)
  const desk=buildOfficeScene([active],'active',false,new Map())
  const party=buildOfficeScene([done],'active',false,new Map(),450,finished.parties)
  assert.equal(party.actors[0].floorId,'lounge')
  assert.deepEqual(officePresenceEvents(desk,party,new Set(['s']),2345).map(e=>e.kind),['finished'])
  const home=buildOfficeScene([done],'active',false,new Map(),450,expired.parties)
  assert.deepEqual(officePresenceEvents(party,home,new Set(['s']),2345+OFFICE_PARTY_MS).map(e=>e.kind),['left'])
})
