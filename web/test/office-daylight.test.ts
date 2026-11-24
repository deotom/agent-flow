import { it } from 'node:test'
import assert from 'node:assert/strict'
import { officeDaylight, officeDesktopGardenLighting } from '../lib/office-daylight'

const at = (hour: number, minute = 0) => officeDaylight(new Date(2026,10,13,hour,minute))
it('moves the sun from morning to evening and keeps noon above the horizon', () => {
  const morning=at(7), noon=at(12), evening=at(17)
  assert.ok(morning.sun && noon.sun && evening.sun)
  assert.ok(morning.sun.x < noon.sun.x && noon.sun.x < evening.sun.x)
  assert.ok(noon.sun.y < morning.sun.y && noon.sun.y < evening.sun.y)
  assert.equal(at(23).sun,null)
  assert.equal(at(3).sun,null)
})
it('changes light smoothly with the local clock, including while animation is paused', () => {
  assert.ok(at(12).light > at(6).light)
  assert.ok(at(6).light > at(2).light)
  assert.ok(Math.abs(at(11,59).light-at(12).light)<.01)
  assert.notEqual(at(7).top,at(12).top)
  assert.notEqual(at(12).top,at(23).top)
  assert.deepEqual(at(12),at(12))
})

it('moves the light over the Desktop garden objects and switches to a cool ambient wash at night',()=>{
 const morning=officeDesktopGardenLighting(at(8)),noon=officeDesktopGardenLighting(at(12))
 const evening=officeDesktopGardenLighting(at(17)),night=officeDesktopGardenLighting(at(22))
 const sourceX=(value:string)=>Number(/at ([\d.]+)%/.exec(value)?.[1])
 assert.ok(sourceX(morning['--of-garden-sun'])<sourceX(noon['--of-garden-sun']))
 assert.ok(sourceX(noon['--of-garden-sun'])<sourceX(evening['--of-garden-sun']))
 assert.notEqual(morning['--of-garden-wash'],evening['--of-garden-wash'])
 assert.equal(night['--of-garden-sun'],'none')
 assert.ok(night['--of-garden-wash'].startsWith(at(22).top))
})
