import test from 'node:test'
import assert from 'node:assert/strict'
import { officeSeasonalActivity, officeSeasonalObjects } from '../lib/office-seasonal'
import { skyEventKinds, skyEvent, skyPhase, skyWeather } from '../lib/office-sky'
import { skyFor } from '../components/agent-visualizer/office/office-sky-art'

test('activities follow the local calendar and seasons without changing real jobs', () => {
  assert.match(officeSeasonalActivity(new Date(2026,3,13,12)).label,/Songkran/)
  assert.equal(officeSeasonalActivity(new Date(2026,3,13,12)).action,'water')
  assert.match(officeSeasonalActivity(new Date(2026,11,25,12)).label,/Christmas/)
  assert.match(officeSeasonalActivity(new Date(2026,10,24,20)).label,/Krathong/)
  assert.match(officeSeasonalActivity(new Date(2026,0,1,0)).label,/New Year/)
  assert.deepEqual(officeSeasonalActivity(new Date(2026,7,2,12)),officeSeasonalActivity(new Date(2026,7,2,12,59)))
  const labels=[3,7,11].map(m=>officeSeasonalActivity(new Date(2026,m,2,12)).label)
  assert.equal(new Set(labels).size,3)
  const floor={id:'break',kind:'break' as const,y:300,height:250,title:'Team break',color:'#fff',sessionId:'s',subtitle:'',actorKeys:[]}
  const [object]=officeSeasonalObjects(floor,450,new Date(2026,3,13,12))
  assert.equal(object.kind,'water');assert.equal(object.x,54);assert.equal(object.y,497.5)
  assert.deepEqual(officeSeasonalObjects({...floor,desktopArt:true},450,new Date(2026,3,13,12)),[])
  assert.deepEqual(officeSeasonalObjects({...floor,kind:'team'},450,new Date()),[])
})

test('event pools reflect the season and time of day', () => {
  assert.ok(skyEventKinds('hot','day').includes('butterflies'))
  assert.ok(skyEventKinds('rainy','night').includes('fireflies'))
  assert.ok(skyEventKinds('cool','day').includes('leaves'))
  assert.ok(!skyEventKinds('rainy','day').includes('kite'))
  assert.ok(!skyEventKinds('cool','day').includes('shooting-star'))
})

test('minute caching cannot hide an event that begins later in that minute', () => {
  let checked=false
  for(let t=new Date(2026,10,13,8).getTime();t<new Date(2026,10,15,16).getTime();t+=60000){
    const first=new Date(t),later=new Date(t+45000)
    if(!skyEvent(first)&&skyEvent(later)&&skyPhase(later)==='day'&&skyWeather(later)!=='rain'){
      skyFor(first)
      assert.deepEqual(skyFor(later).event,skyEvent(later));checked=true;break
    }
  }
  assert.ok(checked)
})
