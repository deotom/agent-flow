import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeDoorTraffic} from '../lib/office-door-traffic'
import {officeInteriorDoor} from '../lib/office-navigation'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
import type {OfficeTrip} from '../lib/office-motion'
const scene:OfficeScene={width:450,height:900,actors:[],quietTeams:[],finishedCount:0,totalAgents:0,floors:[{id:'team',kind:'team',sessionId:'s',title:'Office',subtitle:'',color:'',actorKeys:[],y:228,height:253},{id:'rest',annexOf:'team',kind:'break',sessionId:'s',title:'Rest',subtitle:'',color:'',actorKeys:[],y:228,height:253}]}
const door=officeInteriorDoor(scene,'rest','annex')!
const actor={key:'a',sessionId:'s',floorId:'rest',x:door.x,y:door.y,pose:{walk:true}} as OfficeActor
const trip={actorKey:'a',startedAt:10,endsAt:1000,segments:[{floorId:'rest'},{floorId:'team'}]} as OfficeTrip
it('opens the actual transit door without needing a private-room camera switch',()=>{
 assert.deepEqual([...officeDoorTraffic(scene,[actor],[trip],20)],['rest'])
 assert.equal(officeDoorTraffic(scene,[actor],[trip],0).size,0)
 assert.equal(officeDoorTraffic(scene,[actor],[trip],1000).size,0)
 assert.equal(officeDoorTraffic(scene,[{...actor,x:10}],[trip],20).size,0)
 assert.equal(officeDoorTraffic(scene,[actor],[],20).size,0)
})
it('does not react to a lift rider, hidden actor or walking around within an annex',()=>{
 assert.equal(officeDoorTraffic(scene,[{...actor,pose:{inLift:true}}],[trip],20).size,0)
 assert.equal(officeDoorTraffic(scene,[{...actor,hidden:true}],[trip],20).size,0)
 assert.equal(officeDoorTraffic(scene,[actor],[{...trip,segments:[{...trip.segments[0]},{...trip.segments[0]}]}],20).size,0)
 const before=JSON.stringify(scene)
 officeDoorTraffic(scene,[actor],[trip],20)
 assert.equal(JSON.stringify(scene),before)
})
it('keeps the passage open through the hidden midpoint of a doorway fade',()=>{
 assert.deepEqual([...officeDoorTraffic(scene,[{...actor,pose:{opacity:0}}],[trip],20)],['rest'])
})
it('ignores an absent or constructing public room',()=>{
 assert.equal(officeDoorTraffic({...scene,floors:scene.floors.filter(f=>f.id!=='team')},[actor],[trip],20).size,0)
 assert.equal(officeDoorTraffic({...scene,floors:scene.floors.map(f=>f.id==='team'?{...f,constructing:true}:f)},[actor],[trip],20).size,0)
})
