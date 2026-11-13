import {it} from 'node:test'
import assert from 'node:assert/strict'
import {createOfficeTrip,officeTripFrame,officeWorkTripFrame} from '../lib/office-motion'
import {officeWorkTarget} from '../lib/office-work'
import {rememberOfficeWorkPlace,officeActorAtWorkPlace,officeSceneAtWorkPlaces,officeWorkPresenceTarget} from '../lib/office-work-presence'
import type {OfficeActor,OfficeScene,OfficeEvent} from '../lib/office-types'

const actor:OfficeActor={key:'worker',sessionId:'s',floorId:'team',x:15,y:279,zone:'desk',parentKey:null,task:null,activity:'Working',runtimeName:'Codex',stand:true,
 appearance:{slot:0,kind:'human',shirt:'#369',hair:'#321',skin:'#cba',pants:'#333',cut:'',gear:''},
 agent:{id:'worker',parentId:null,role:'worker',name:'Worker',runtime:'codex',model:null,status:'running',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}}
const scene=():OfficeScene=>({width:450,height:500,floors:[{id:'team',sessionId:'s',kind:'team',y:200,height:100,title:'Team',subtitle:'',color:'#abc',actorKeys:['worker']}],actors:[structuredClone(actor)],quietTeams:[],totalAgents:1,finishedCount:0})
const event:OfficeEvent={id:'work',kind:'activity',station:'build',actorKey:'worker',parentKey:null,at:1}

it('walks directly along the clear front aisle and stays at the working station',()=>{
 const s=scene(),trip=createOfficeTrip(event,s,s,0)!,target=officeWorkTarget(s.actors[0],s,'build')
 assert.deepEqual(officeTripFrame(trip,trip.endsAt).point,target)
 const legs=trip.segments.filter(x=>x.kind==='walk')
 assert.equal(legs.length,1,'no ceremonial return to a staging spot')
 assert.equal(legs[0].from.y,legs[0].to.y,'the main aisle is straight')
})
it('retains the actual workplace across paints and source updates without changing source state',()=>{
 const s=scene(),original=structuredClone(s),target=officeWorkTarget(s.actors[0],s,'build')
 const place=rememberOfficeWorkPlace(s,s.actors[0],target,'build')!
 const next=structuredClone(s);next.actors[0].agent.activities=[{id:'search',type:'web_search',toolName:null,title:null,startedAt:2}]
 const shown=officeActorAtWorkPlace(next,next.actors[0],place)
 assert.deepEqual({x:shown.x,y:shown.y},target,'a new job does not teleport the agent')
 assert.equal(shown.pose?.typing,true)
 assert.deepEqual(s,original)
 assert.equal(officeActorAtWorkPlace(next,{...next.actors[0],zone:'lounge'},place).pose,undefined)
})
it('starts a new station trip at the last drawn workplace and makes room for a coworker',()=>{
 const s=scene(),target=officeWorkTarget(s.actors[0],s,'build'),place=rememberOfficeWorkPlace(s,s.actors[0],target,'build')!
 const places=new Map([['worker',place]]),visual=officeSceneAtWorkPlaces(s,places)
 const trip=createOfficeTrip({...event,station:'quality'},visual,visual,0)!
 assert.deepEqual(trip.segments[0].from,target)
 const coworker={...structuredClone(s.actors[0]),key:'coworker'};s.actors.push(coworker)
 const other=officeWorkPresenceTarget(s,coworker,'build',places)
 assert.ok(Math.abs(other.x-target.x)>=28,'coworkers do not occupy the same point')
 assert.equal(other.y,target.y)
})
it('keeps the drawn work point aligned while its floor moves or resizes',()=>{
 const s=scene(),trip=createOfficeTrip(event,s,s,0)!,t=trip.startedAt+trip.segments[0].duration/2
 const frame=officeTripFrame(trip,t),next=structuredClone(s);next.width=900;next.floors[0].y=350;next.floors[0].height=200
 const shown=officeWorkTripFrame(trip,t,next)
 assert.equal(shown.point.x,frame.point.x*2)
 assert.equal(shown.point.y,350+(frame.point.y-200)*2)
 const place=rememberOfficeWorkPlace(s,s.actors[0],officeWorkTarget(s.actors[0],s,'build'),'build')!
 const at=officeActorAtWorkPlace(next,next.actors[0],place)
 assert.equal(at.y,350+200*.79)
})
it('does not overlap a planning teammate with someone using the bench below the board',()=>{
 const s=scene(),point=officeWorkTarget(s.actors[0],s,'planning')
 const station=(['build','quality','terminal','research'] as const).find(kind=>Math.abs(officeWorkTarget(s.actors[0],s,kind).x-point.x)<1)!
 assert.ok(station)
 const place=rememberOfficeWorkPlace(s,s.actors[0],point,'planning')!,coworker={...structuredClone(s.actors[0]),key:'coworker'}
 s.actors.push(coworker)
 const target=officeWorkPresenceTarget(s,coworker,station,new Map([['worker',place]]))
 assert.ok(Math.abs(target.x-point.x)>=28)
})
