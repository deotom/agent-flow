import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeNavigation, officeLanding, officeHatchOpen } from '../lib/office-navigation'
import { buildOfficeScene } from '../lib/office-model'
import { createOfficeTrip, officeTripFrame } from '../lib/office-motion'

import type {TeamSnapshot} from '../lib/team-types'
const team:TeamSnapshot={sessionId:'s',title:'Team',active:true,updatedAt:1,tasks:[],agents:[{id:'lead',parentId:null,role:'lead',name:'Lead',runtime:'codex',model:null,status:'thinking',task:null,activities:[],requestKind:null,context:null,toolCallCount:0,hasThread:true,startedAt:1,updatedAt:1,completedAt:null}]}
it('uses floor landings and steady climb speed, not the destination chair height',()=>{
 const before=buildOfficeScene([team],'active',false,new Map()),after=structuredClone(before)
 const actor=after.actors[0],room=after.floors.find(f=>f.kind==='team')!
 const rest={...room,id:'rest',kind:'break' as const,y:room.y+1000,height:250,actorKeys:[actor.key]}
 after.floors.push(rest);after.height=rest.y+400;actor.floorId=rest.id;actor.zone='lounge';actor.x=120;actor.y=rest.y+150
 const event={id:'done',kind:'finished' as const,actorKey:actor.key,parentKey:null,at:1}
 const trip=createOfficeTrip(event,before,after,0)!,rides=trip.segments.filter(s=>s.kind==='ride')
 assert.equal(rides.length,1)
 const ride=rides[0],nav=officeNavigation(after)
 assert.equal(ride.from.x,nav.shaftX);assert.equal(ride.to.x,nav.shaftX)
 assert.equal(ride.to.y,officeLanding(after,rest.id)!.y)
 assert.notEqual(ride.to.y,actor.y)
 assert.ok(Math.abs(Math.abs(ride.to.y-ride.from.y)/ride.duration*1000-80)<.001)
 assert.ok(ride.duration>2200)
 assert.deepEqual(trip.segments.at(-1)!.to,{x:actor.x,y:actor.y})
 const start=trip.segments.slice(0,trip.segments.indexOf(ride)).reduce((n,s)=>n+s.duration,0)
 const a=officeTripFrame(trip,start+100),b=officeTripFrame(trip,start+300)
 assert.equal(a.pose.climb,true);assert.ok(a.pose.climbStep!==b.pose.climbStep)
})
it('bounds the shaft at occupied landings and opens the hatch only for actual passage or a click',()=>{
 const scene=buildOfficeScene([team],'active',false,new Map()),nav=officeNavigation(scene)
 scene.floors.push({id:'empty',kind:'team',sessionId:'empty',title:'Empty',subtitle:'',color:'',y:5000,height:250,actorKeys:[]})
 assert.equal(officeNavigation(scene).bottom,nav.bottom)
 assert.ok(nav.left>scene.width*.88&&nav.right<=scene.width)
 assert.equal(officeHatchOpen(scene,null,false),false)
 assert.equal(officeHatchOpen(scene,nav.hatch,false),true)
 assert.equal(officeHatchOpen(scene,{x:nav.shaftX,y:nav.hatch.y+300},false),false)
 assert.equal(officeHatchOpen(scene,null,true),true)
})
