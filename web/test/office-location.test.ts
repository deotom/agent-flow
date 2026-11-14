import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeActorLocation} from '../lib/office-location'
import type {OfficeActor,OfficeScene} from '../lib/office-types'
const scene={floors:[{id:'office',kind:'team'},{id:'rest',kind:'break',annexOf:'office'},{id:'garden',kind:'lounge'},{id:'canteen',kind:'break',room:'room-canteen'}]} as OfficeScene
const actor={floorId:'office',zone:'lounge',parentKey:null,agent:{role:'lead'}} as OfficeActor
it('uses the actual floor to distinguish lead nook, garden, private lounge, canteen and lift',()=>{
 assert.equal(officeActorLocation(actor,scene),'resting in the lead reading nook')
 assert.equal(officeActorLocation({...actor,floorId:'garden'},scene),'in the garden')
 assert.equal(officeActorLocation({...actor,floorId:'garden',party:true},scene),'celebrating in the party garden')
 assert.equal(officeActorLocation({...actor,floorId:'rest'},scene),'in the private break room')
 assert.equal(officeActorLocation({...actor,floorId:'canteen'},scene),'in the canteen')
 assert.equal(officeActorLocation({...actor,pose:{inLift:true}},scene),'in the lift')
 assert.equal(officeActorLocation({...actor,zone:'desk'},scene),'in the office')
})
