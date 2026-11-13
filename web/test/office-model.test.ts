import test from 'node:test'
import assert from 'node:assert/strict'
import { assignOfficeIdentities, buildOfficeScene, officeEvents, officeKey, officeAppearance, officeDisplayName, officeBreakRoom, officeWorkRoom, OFFICE_SLOTS, BREAK_ROOMS, officeTeamOrder } from '../lib/office-model'
import type { TeamAgentRow, TeamSnapshot, TeamTaskRow } from '../lib/team-types'
import { officeStations } from '../lib/office-stations'

const agent = (id: string, status: TeamAgentRow['status'] = 'thinking', parentId: string | null = null, startedAt = 1): TeamAgentRow => ({
  id, parentId, role: parentId ? 'worker' : 'lead', name: id, runtime: null, model: null, status, task: null,
  activities: [], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt, updatedAt: startedAt, completedAt: null,
})
const task = (id: string, childId: string, status: TeamTaskRow['status'], delivery: TeamTaskRow['delivery'] = 'none', updatedAt = 1): TeamTaskRow => ({
  id, childId, parentId: 'lead', name: childId, model: null, task: null, result: null, status, delivery, startedAt: 1,
  completedAt: null, updatedAt,
})
const team = (sessionId: string, agents: TeamAgentRow[], tasks: TeamTaskRow[] = []): TeamSnapshot => ({ sessionId, title: sessionId, active: true, updatedAt: 1, agents, tasks })

test('team floors keep their order when attention, source ordering and new arrivals change',()=>{
 const a=team('a',[agent('lead')]),b=team('b',[agent('lead')])
 const before=buildOfficeScene([a,b],'active',false,new Map())
 b.agents[0].status='waiting_input'
 const next=buildOfficeScene([b,a],'active',false,new Map())
 assert.deepEqual(next.floors.map(f=>f.id),before.floors.map(f=>f.id))
 const order=officeTeamOrder(['b','c'],['b','a'])
 assert.deepEqual(order,['b','a','c'])
 const c=team('c',[agent('lead')])
 const stable=buildOfficeScene([a,b,c],'active',false,new Map(),450,new Set(),order)
 assert.deepEqual(stable.floors.filter(f=>f.kind==='team').map(f=>f.sessionId),['b','a','c'])
 assert.deepEqual(officeTeamOrder(['a','b'],order),order)
})

test('agent identities vary in silhouette, clothing and accessories, not just shirt colour',()=>{
 const people=Array.from({length:28},(_,i)=>officeAppearance(i))
 assert.ok(new Set(people.map(p=>p.outfit)).size>=6)
 assert.ok(new Set(people.map(p=>p.gear)).size>=5)
 assert.equal(new Set(people.map(p=>JSON.stringify([p.cut,p.gear,p.outfit,p.face]))).size,people.length)
 assert.deepEqual(officeAppearance(19),officeAppearance(19))
})

test('historical failures cannot keep an idle team office or break room open',()=>{
  const snap=team('finished',[agent('lead','idle'),agent('old-failure','failed','lead'),agent('pending','done','lead')],
    [task('failed','old-failure','failed','received'),task('pending','pending','done','pending')])
  const scene=buildOfficeScene([snap],'active',false,new Map())
  assert.equal(scene.floors.some(f=>f.kind==='team'||f.kind==='break'),false)
  assert.equal(scene.actors.length,0)
  assert.equal(scene.quietTeams[0].sessionId,'finished')
  // If real work resumes, its own office and currently visible resting people return.
  snap.agents[0].status='thinking'
  const resumed=buildOfficeScene([snap],'active',false,new Map())
  assert.equal(resumed.floors.filter(f=>f.kind==='team').length,1)
  assert.equal(resumed.floors.filter(f=>f.kind==='break').length,1)
})

test('break rooms match inactive people still visible in the team Flow, with no historical crowd', () => {
  const a = team('a', [agent('lead'), agent('pending','done','lead'), agent('old','done','lead')], [task('p','pending','done','pending'),task('o','old','done','received')])
  const b = team('b', [agent('lead'),agent('other','done','lead')], [task('b','other','done','none')])
  const scene = buildOfficeScene([a,b], 'active', false, new Map())
  assert.deepEqual(scene.actors.filter(a => a.zone === 'lounge').map(a => a.agent.id).sort(), ['other','pending'])
  for (const room of scene.floors.filter(f => f.kind === 'break')) {
    assert.ok(scene.actors.filter(a => a.floorId === room.id).every(a => a.sessionId === room.sessionId))
  }
  a.tasks[0].delivery = 'received'
  const after = buildOfficeScene([a,b], 'active', false, new Map())
  assert.equal(after.floors.some(f => f.kind === 'break' && f.sessionId === 'a'), false)
  assert.ok(buildOfficeScene([a,b], 'session', false, new Map()).actors.some(a => a.agent.id === 'old'))
})

test('small teams keep compact workshops with varied stable station layouts; larger teams get more floor space', () => {
  const snapshots = Array.from({length:30},(_,i)=>team(`style-${i}`,[agent('lead')]))
  const build = (teams: TeamSnapshot[]) => buildOfficeScene(teams,'active',false,new Map()).floors.filter(f=>f.kind==='team')
  const rooms = build(snapshots)
  assert.ok(rooms.every(f=>f.room==='room-stations'))
  assert.ok(new Set(rooms.map(f=>officeStations(f,450).map(s=>s.kind).join(','))).size>2)
  assert.equal(officeWorkRoom('style-0',5),'room-stations-large')
  for (const room of rooms) assert.equal(build(snapshots.filter(s=>s.sessionId===room.sessionId))[0].room,room.room)
})

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
  const lead=scene.actors.find(x => x.key === officeKey('a','lead'))!
  assert.equal(lead.workStation,'planning');assert.equal(lead.stand,true);assert.equal(lead.monitor,undefined)
  assert.equal(officeAppearance(2).kind, 'human')
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
  assert.ok(scene.actors.find(a => a.agent.id === 'leaf')!.x > scene.actors.find(a => a.agent.id === 'lead')!.x)
})

test('large teams use one eight-seat room with overflow while retaining actor identities', () => {
  const agents = [agent('lead'), ...Array.from({length:8},(_,i)=>agent(`w${i}`,'thinking','lead',i+2))]
  const snap = team('large', agents)
  const scene = buildOfficeScene([snap], 'session', true, assignOfficeIdentities(agents.map(a=>officeKey('large',a.id))))
  assert.equal(scene.actors.length, 9)
  assert.ok(scene.floors.filter(f=>f.kind==='team').length === 1)
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


test('room choice, stable team ordering, quiet teams going home and lounge parties', () => {
  const waiting=team('z-wait',[agent('lead','waiting_input')])
  const small=team('a-work',[agent('lead'),agent('w','running','lead')])
  const noLead=team('no-lead',[{...agent('solo'),role:'worker'}])
  const large=team('big',[agent('lead'),...Array.from({length:10},(_,i)=>agent(`w${i}`,'running','lead'))])
  const quiet=team('quiet',[agent('idle','idle'),...Array.from({length:8},(_,i)=>agent(`done${i}`,'done','idle'))])
  const failed=team('failed',[agent('error','failed')])
  const all=[small,large,quiet,waiting,noLead,failed]
  const ids=assignOfficeIdentities(all.flatMap(s=>s.agents.map(a=>officeKey(s.sessionId,a.id))))
  const scene=buildOfficeScene(all,'active',false,ids)
  assert.equal(scene.floors[0].kind,'lounge')
  const rooms=scene.floors.filter(f=>f.kind==='team')
  assert.equal(rooms[0].sessionId,'a-work')
  assert.ok(rooms.find(f=>f.sessionId==='z-wait')?.waiting)
  assert.equal(rooms.find(f=>f.sessionId==='a-work')?.room,officeWorkRoom('a-work',2))
  assert.equal(rooms.find(f=>f.sessionId==='no-lead')?.room,officeWorkRoom('no-lead',1))
  assert.equal(rooms.find(f=>f.sessionId==='big')?.room,'room-stations-large')
  assert.equal(rooms.find(f=>f.sessionId==='big')?.overflow,3)
  // The quiet team went home: nobody from it rests in the lounge.
  assert.equal(scene.actors.filter(a=>a.zone==='lounge').length,0)
  assert.equal(scene.floors[0].overflow,0)
  // Failure alone does not keep an otherwise inactive office open.
  assert.equal(scene.actors.some(a=>a.agent.id==='error'),false)
  // Just finished: the quiet team celebrates in the lounge, guests first, capped at four seats.
  const party=buildOfficeScene(all,'active',false,ids,450,new Set(['quiet']))
  const guests=party.actors.filter(a=>a.zone==='lounge')
  assert.equal(guests.filter(a=>!a.hidden).length,4)
  assert.equal(party.floors[0].overflow,4)
  assert.ok(guests.every(a=>a.party&&a.sessionId==='quiet'))
  assert.deepEqual(party.floors[0].party,['quiet'])
  // After the party they go home.
  const later=buildOfficeScene(all,'active',false,ids,450,new Set())
  assert.equal(later.actors.filter(a=>a.zone==='lounge').length,0)
  assert.equal(later.floors.find(f=>f.kind==='quiet')?.title,'2 teams at home')
  assert.equal(scene.floors.at(-1)?.kind,'quiet')
  assert.equal(rooms.some(f=>f.sessionId==='quiet'),false)
  assert.equal(buildOfficeScene(all,'active',true,new Map()).floors.filter(f=>f.kind==='team').length,6)
})

test('limited desks seat the lead first, then agents waiting on the user or failed, before ordinary workers', () => {
  const crowd=team('crowd',[agent('lead'),...Array.from({length:9},(_,i)=>agent(`w${i}`,'running','lead')),agent('asks','waiting_approval','lead'),agent('broke','failed','lead')])
  const scene=buildOfficeScene([crowd],'active',false,assignOfficeIdentities(crowd.agents.map(a=>officeKey('crowd',a.id))))
  const seated=scene.actors.filter(a=>a.zone==='desk'&&!a.hidden).map(a=>a.agent.id)
  assert.equal(seated.length,8)
  assert.deepEqual(seated.slice(0,2),['lead','asks'])
  // A failed worker's job is over: it goes up to rest instead of holding a desk.
  assert.equal(scene.actors.find(a=>a.agent.id==='broke')?.zone,'lounge')
  assert.equal(scene.floors.find(f=>f.sessionId==='crowd')?.overflow,3)
})

test('each active team rests in its own break room directly below its office; quiet teams never do', () => {
  const busy=team('busy',[agent('lead'),agent('w','running','lead'),...Array.from({length:10},(_,i)=>agent(`d${i}`,'done','lead')),agent('oops','failed','lead')])
  const other=team('other',[agent('lead'),agent('x','running','lead'),agent('y','done','lead')])
  const home=team('home',[agent('idle','idle'),agent('gone','done','idle')])
  const all=[busy,other,home]
  const ids=assignOfficeIdentities(all.flatMap(s=>s.agents.map(a=>officeKey(s.sessionId,a.id))))
  const scene=buildOfficeScene(all,'session',false,ids)
  const rooms=scene.floors.filter(f=>f.kind==='break')
  assert.deepEqual(rooms.map(f=>f.sessionId).sort(),['busy','other'])
  for (const room of rooms) {
    // Directly after its own office floor, sharing the team colour.
    const index=scene.floors.indexOf(room), office=scene.floors[index-1]
    assert.equal(office.kind,'team'); assert.equal(office.sessionId,room.sessionId); assert.equal(room.color,office.color)
    assert.equal(room.room,officeBreakRoom(room.sessionId!))
    const people=scene.actors.filter(a=>a.floorId===room.id)
    assert.ok(people.length>0&&people.every(a=>a.sessionId===room.sessionId&&a.zone==='lounge'))
  }
  const busyRoom=rooms.find(f=>f.sessionId==='busy')!
  assert.equal(busyRoom.subtitle,'11 resting')
  const spots=BREAK_ROOMS[officeBreakRoom('busy')]
  assert.equal(busyRoom.overflow,11-spots.length)
  const busyPeople=scene.actors.filter(a=>a.floorId===busyRoom.id)
  assert.equal(busyPeople.filter(a=>!a.hidden).length,spots.length)
  assert.ok(busyPeople.some(a=>a.agent.id==='oops'))
  assert.ok(busyPeople.some(a=>a.stand)&&busyPeople.some(a=>!a.stand))
  // The lawn is empty without a party; nobody from the quiet team appears anywhere.
  assert.equal(scene.actors.filter(a=>a.floorId==='lounge').length,0)
  assert.equal(scene.actors.some(a=>a.sessionId==='home'),false)
  assert.equal(buildOfficeScene([home],'session',false,ids).floors.some(f=>f.kind==='break'),false)
})

test('display names never carry file paths', () => {
  assert.equal(officeDisplayName('/root/office-verification/notes'),'notes')
  assert.equal(officeDisplayName(String.raw`Review C:\Users\me\repo\plan.md now`),'Review plan.md now')
  assert.equal(officeDisplayName('Lead / Planner'),'Lead / Planner')
  assert.equal(officeDisplayName('API/Builder'),'API/Builder')
  assert.equal(officeDisplayName('/root/'),'root')
  assert.equal(officeDisplayName('   '),'Agent')
})

test('break rooms come in four decors, chosen stably per team, each with sitting and standing spots', () => {
  const decors=new Set(Array.from({length:200},(_,i)=>officeBreakRoom(`session-${i}`)))
  assert.deepEqual([...decors].sort(),Object.keys(BREAK_ROOMS).sort())
  assert.equal(officeBreakRoom('abc'),officeBreakRoom('abc'))
  for (const spots of Object.values(BREAK_ROOMS)) {
    assert.ok(spots.length>=7)
    assert.ok(spots.some(s=>s[2]===1)&&spots.some(s=>s[2]===0))
    assert.ok(spots.every(([x,y])=>x>.04&&x<.92&&y>.5&&y<.85))
  }
})


test('display names replace recognizable paths only', () => {
  const cases = [
    [String.raw`C:\Program Files\x\file.md`, 'file.md'],
    [String.raw`Builder C:\work\file.md`, 'Builder file.md'],
    [String.raw`\\server\share\x`, 'x'], ['~/work/file.md','file.md'],
    ['https://example.com/root/a','https://example.com/root/a'],
    ['a/b/c','a/b/c'],['API/Builder','API/Builder'],['Lead / Planner','Lead / Planner'],
  ]
  for(const root of ['/root','/home','/Users','/tmp','/var','/mnt','/opt','/srv','/workspace','/usr','/etc','/private']) cases.push([`${root}/work/file.md`,'file.md'])
  for(const [input,expected] of cases) assert.equal(officeDisplayName(input),expected,input)
})
test('celebrating teams are excluded from the home strip', () => {
  const party=team('party',[agent('done','done')]),home=team('home',[agent('idle','idle')])
  const scene=buildOfficeScene([party,home],'active',false,new Map(),450,new Set(['party']))
  assert.deepEqual(scene.quietTeams.map(t=>t.sessionId),['home'])
  assert.equal(scene.floors.find(f=>f.kind==='quiet')?.title,'1 team at home')
  assert.equal(buildOfficeScene([party],'active',false,new Map(),450,new Set(['party'])).floors.some(f=>f.kind==='quiet'),false)
})
