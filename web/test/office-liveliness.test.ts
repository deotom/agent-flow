import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeCanvasScale, officeFrameInterval, officeLiveliness, officeLivelinessPolicy } from '../lib/office-liveliness'

it('validates persisted atmosphere without coercing malformed values',()=>{
 for(const mode of ['quiet','normal','lively'] as const)assert.equal(officeLiveliness(mode),mode)
 for(const value of [undefined,null,'','NORMAL',' quiet ','busy',0,true,{},['quiet']])assert.equal(officeLiveliness(value),'normal')
})
it('keeps the approved day and night outing limits and interval ranges',()=>{
 for(const [mode,dayLimit,nightLimit,dayGap,nightGap] of [
  ['quiet',1,0,[180000,300000],[180000,300000]],
  ['normal',2,1,[60000,100000],[180000,300000]],
  ['lively',2,1,[45000,75000],[150000,240000]],
 ] as const){
  const day=officeLivelinessPolicy(mode,false),night=officeLivelinessPolicy(mode,true)
  assert.equal(day.mode,mode);assert.equal(day.night,false);assert.equal(day.outingLimit,dayLimit);assert.deepEqual(day.outingGapMs,dayGap)
  assert.equal(night.night,true);assert.equal(night.outingLimit,nightLimit);assert.deepEqual(night.outingGapMs,nightGap)
 }
 assert.deepEqual(officeLivelinessPolicy('invalid',false),officeLivelinessPolicy('normal',false))
})
it('provides calmer optional social/object cadence at night without meal or work controls',()=>{
 for(const [mode,multiplier] of [['quiet',2],['normal',1],['lively',.75]] as const){
  const day=officeLivelinessPolicy(mode,false),night=officeLivelinessPolicy(mode,true)
  assert.equal(day.socialCadenceMultiplier,multiplier);assert.equal(day.objectCadenceMultiplier,multiplier)
  assert.equal(night.socialCadenceMultiplier,multiplier*2);assert.equal(night.objectCadenceMultiplier,multiplier*2)
  assert.ok(Object.isFrozen(day));assert.ok(Object.isFrozen(day.outingGapMs))
  assert.equal('mealLimit' in day,false);assert.equal('workCadence' in day,false)
 }
})
it('scales adaptive frame cadence and caps canvas pixel ratio',()=>{
 assert.equal(officeFrameInterval('full',true),1000/45)
 assert.equal(officeFrameInterval('low',true),1000/24)
 assert.equal(officeFrameInterval('full',false),1000/15)
 assert.equal(officeFrameInterval('low',false),1000/10)
 assert.ok(officeFrameInterval('full',false)>officeFrameInterval('full',true))
 assert.equal(officeCanvasScale(450,450,3),2)
 assert.equal(officeCanvasScale(900,450,2),2)
 assert.equal(officeCanvasScale(450,450,1.2),1.25)
 assert.equal(officeCanvasScale(200,450,1),1)
})
