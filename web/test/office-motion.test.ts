import { officeNavigation } from '../lib/office-navigation'
import { officeCanResumeTrip } from '../lib/office-motion'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createOfficeTrip, officeAllowsMotion, officeDepartureScene, officeTripFrame, mergeOfficeEvents, officePresenceEvents, populatedOfficeTeams, parseOfficeIdentities, parseOfficePane } from '../lib/office-motion'
import type { OfficeActor, OfficeEvent, OfficeScene } from '../lib/office-types'

const actor = (key: string, y: number, parentKey: string | null = null): OfficeActor => ({ key, x: 20, y, floorId: `floor:${y}`, parentKey, sessionId: 't3:a',
  agent: { id: key, parentId: parentKey, role: parentKey ? 'worker' : 'lead', name: key, runtime: 'codex', model: null, status: 'running', task: null, activities: [], requestKind: null, context: null, toolCallCount: 0, hasThread: true, startedAt: 1, updatedAt: 1, completedAt: null },
  appearance: { slot: 0, kind: 'robot', shirt: '#4488aa', hair: '#222222', skin: '#dddddd', pants: '#333333', cut: '', gear: '' }, zone: 'desk', task: null, activity: 'Running', runtimeName: 'Codex' })
const scene = (...actors: OfficeActor[]): OfficeScene => ({ actors, floors: [...new Set(actors.map(a => a.floorId))].map(id => ({ id, y: (actors.find(a=>a.floorId===id)?.y??100)-63.2, height:80, kind: 'team', sessionId: 't3:a', title: '', subtitle: '', color: '', actorKeys: actors.filter(a => a.floorId === id).map(a => a.key) })), width: 200, height: 400, totalAgents: actors.length, finishedCount: 0, quietTeams: [] })
const event = (kind: OfficeEvent['kind'], fields: Partial<OfficeEvent> = {}): OfficeEvent => ({ id: kind, kind, actorKey: 'worker', parentKey: 'lead', at: 1000, ...fields })
it('resumes the same valid trip after reconnecting, but drops work that ended while offline',()=>{
 const building=scene(actor('worker',173,'lead'))
 const trip=createOfficeTrip(event('activity'),building,building,0)!
 assert.equal(officeCanResumeTrip(trip,building),true)
 const ended=structuredClone(building);ended.actors[0].agent.status='done'
 assert.equal(officeCanResumeTrip(trip,ended),false)
 assert.equal(officeCanResumeTrip(trip,scene()),false)
 const departure=createOfficeTrip(event('left'),building,scene(),0)!
 assert.equal(officeCanResumeTrip(departure,scene()),true)
 assert.equal(officeCanResumeTrip(departure,building),false)
})

describe('Office evidence animation', () => {
  it('moves the actual parent for a new assignment and returns it to its own desk', () => {
    const building = scene(actor('lead', 101), actor('worker', 173, 'lead'))
    const trip = createOfficeTrip(event('assigned'), building, building, 1000)!
    assert.equal(trip.actorKey, 'lead')
    assert.equal(officeTripFrame(trip, 1000).point.y, 101)
    assert.equal(officeTripFrame(trip, trip.endsAt + 1).point.y, 101)
    assert.equal(officeTripFrame(trip, trip.endsAt + 1).done, true)
    assert.ok(trip.segments.some(segment => segment.kind === 'ride'))
  })
  it('moves a sent report to its explicit parent without claiming receipt', () => {
    const building = scene(actor('lead', 101), actor('worker', 173, 'lead'))
    const trip = createOfficeTrip(event('sent'), building, building, 1000)!
    assert.equal(trip.actorKey, 'worker')
    assert.match(trip.caption, /sent/i)
    assert.doesNotMatch(trip.caption, /received|acknowledged/i)
    assert.equal(officeTripFrame(trip, trip.endsAt + 1).point.y, 173)
  })
  it('does not manufacture a reporting trip when a parent is missing', () => {
    const building = scene(actor('worker', 173))
    assert.equal(createOfficeTrip(event('sent'), building, building, 0), null)
    assert.equal(createOfficeTrip(event('assigned'), building, building, 0), null)
    const mismatched = scene(actor('worker', 173, 'someone-else'), actor('lead', 101))
    assert.equal(createOfficeTrip(event('sent'), mismatched, mismatched, 0), null)
  })
  it('marks an explicit receipt with the parent, not another report trip', () => {
    const building = scene(actor('lead', 101), actor('worker', 173, 'lead'))
    const trip = createOfficeTrip(event('received'), building, building, 0)!
    assert.equal(trip.actorKey, 'lead')
    assert.ok(trip.segments.every(segment => segment.kind === 'hold'))
    assert.match(trip.caption, /received/i)
  })
  it('climbs finished work to the lounge even when its quiet room collapses', () => {
    const old = scene(actor('worker', 173, 'lead'), actor('lead', 101))
    const resting = { ...actor('worker', 245, 'lead'), zone: 'lounge' as const }
    const next = scene(resting, actor('lead', 101), { ...actor('anchor', 173), x: 100 })
    const trip = createOfficeTrip(event('finished'), old, next, 0)!
    assert.equal(officeTripFrame(trip, trip.endsAt + 1).point.y, 245)
    assert.ok(createOfficeTrip(event('finished'), old, scene(resting), 0)?.segments.some(s=>s.kind==='ride'))
  })
  it('keeps every sampled position finite and every ride inside the shaft', () => {
    const building = scene(actor('lead', 101), actor('worker', 1109, 'lead'))
    const trip = createOfficeTrip(event('sent'), building, building, 0)!
    for (let time = 0; time <= trip.endsAt + 100; time += 20) {
      const frame = officeTripFrame(trip, time)
      assert.ok(Number.isFinite(frame.point.x) && Number.isFinite(frame.point.y))
      if (frame.elevatorY !== null) assert.equal(frame.point.x, officeNavigation(building).shaftX)
    }
  })
  it('coalesces actor events, expires old work and never requeues duplicates', () => {
    const sent = event('sent', { at: 2000 })
    assert.deepEqual(mergeOfficeEvents([event('finished')], [sent, sent], 3000), [sent])
    assert.deepEqual(mergeOfficeEvents([sent], [], 30_000), [])
    const events = Array.from({ length: 40 }, (_, index) => event('sent', { id: String(index), actorKey: String(index), at: 2000 }))
    assert.ok(mergeOfficeEvents([], events, 3000).length <= 12)
  })
  it('leaves through the ground-floor door when a quiet team is removed', () => {
    const old=scene(actor('worker',173,'lead')),next=scene(actor('other',101))
    const trip=createOfficeTrip(event('left'),old,next,0)!
    assert.equal(trip.actorKey,'worker')
    assert.equal(officeTripFrame(trip,0).point.y,173)
    assert.ok(trip.segments.some(segment=>segment.kind==='ride'))
    assert.equal(officeTripFrame(trip,trip.endsAt+1).point.x,trip.shaftX)
  })
  it('enters from outside before climbing the ladder to a desk', () => {
    const building=scene(actor('worker',173,'lead'))
    const trip=createOfficeTrip(event('arrived'),scene(),building,0)!
    assert.equal(officeTripFrame(trip,0).point.x,trip.shaftX)
    assert.ok(trip.segments.some(segment=>segment.kind==='ride'))
    assert.equal(officeTripFrame(trip,trip.endsAt+1).point.y,173)
  })
  it('uses presence only for previously known teams, without reenacting initial history', () => {
    const old=scene(actor('old',101)),next=scene(actor('new',173))
    const teams=new Set(['t3:a'])
    assert.deepEqual(officePresenceEvents(null,next,teams,1000),[])
    assert.deepEqual(officePresenceEvents(old,next,teams,1000).map(e=>e.kind),['left','arrived'])
    assert.deepEqual(officePresenceEvents(scene(),next,new Set(),1000),[])
  })
  it('holds the previous floor geometry until departing agents are outside', () => {
    const old=scene(actor('worker',173,'lead')),next=scene(actor('worker',245,'lead'))
    const held=officeDepartureScene(old,next,[])
    assert.equal(held.actors[0].y,173)
    assert.equal(held.floors[0].id,'floor:173')
    assert.equal(held.totalAgents,next.totalAgents)
  })
  it('treats the first populated snapshot after an empty team as a baseline', () => {
    const team={sessionId:'t3:a',title:'Late data',active:true,updatedAt:1,agents:[],tasks:[]}
    assert.equal(officePresenceEvents(scene(),scene(actor('worker',173)),populatedOfficeTeams([team]),1000).length,0)
  })
})

describe('Office preferences', () => {
  it('allows an explicit Office motion override without changing system or Effects off preferences', () => {
    assert.equal(officeAllowsMotion('full'),true)
    assert.equal(officeAllowsMotion('low'),true)
    assert.equal(officeAllowsMotion('off'),false)
  })
  it('restores Office and safely falls back from unknown pane values', () => {
    assert.equal(parseOfficePane('office'), 'office')
    assert.equal(parseOfficePane('graph'), 'graph')
    assert.equal(parseOfficePane('not-a-pane'), 'board')
  })
  it('rejects malformed or dangerous identity storage without breaking the view', () => {
    assert.equal(parseOfficeIdentities('bad json').size, 0)
    assert.deepEqual([...parseOfficeIdentities('[["a",0],["b",1]]')], [['a', 0], ['b', 1]])
    assert.equal(parseOfficeIdentities('{"a":4}').size, 0)
    assert.equal(parseOfficeIdentities('[["a",-1],["b",null],["c",1.2]]').size, 0)
  })
})


it('excludes hidden presence and animates all room destinations', () => {
  const teams = new Set(['t3:a']), desk = actor('worker',101)
  const hidden = {...desk, hidden:true}
  assert.deepEqual(officePresenceEvents(scene(hidden),scene(),teams,1000),[])
  assert.deepEqual(officePresenceEvents(scene(),scene(hidden),teams,1000),[])
  assert.deepEqual(officePresenceEvents(scene(hidden),scene({...hidden,zone:'lounge',floorId:'lounge'}),teams,1000),[])
  const rest = {...desk,zone:'lounge' as const,floorId:'break',y:201}
  const party = {...rest,floorId:'lounge',party:true,y:40}
  for(const [from,to,caption] of [[desk,rest,'is heading to the break room'],[desk,party,'is joining the celebration'],[rest,party,'is joining the celebration']] as const){
    const events=officePresenceEvents(scene(from),scene(to),teams,1000)
    assert.equal(events.length,1)
    const trip=createOfficeTrip(events[0],scene(from),scene(to),1000)!
    assert.equal(trip.caption,caption)
    assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,{x:to.x,y:to.y})
  }
  assert.equal(createOfficeTrip(event('left'),scene(desk),scene(),0)?.caption,'is heading home')
  assert.equal(createOfficeTrip(event('arrived'),scene(),scene(desk),0)?.caption,'is heading to their desk')
})
it('filters ineligible trips before the queue cap', () => {
  const visible=event('left',{actorKey:'visible'})
  const hidden=Array.from({length:30},(_,i)=>event('left',{actorKey:`hidden${i}`,id:`hidden${i}`,at:1001}))
  assert.deepEqual(mergeOfficeEvents([],[visible,...hidden],1002,e=>e.actorKey==='visible'),[visible])
})
