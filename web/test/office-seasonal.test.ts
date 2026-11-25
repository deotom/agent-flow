import test from 'node:test'
import assert from 'node:assert/strict'
import { officeGardenHolidayActivity, officeGardenHolidaySpot, officeSeasonalActivity, officeSeasonalObjects } from '../lib/office-seasonal'
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

test('maps every holiday to distinct garden props and varied visitor captions while returning null outside holidays',()=>{
  assert.equal(officeGardenHolidayActivity(new Date(2026,6,12,12)),null)
  const holidayDates=[
    new Date(2026,10,24,12), // loy-krathong
    new Date(2026,3,14,12),  // songkran
    new Date(2026,11,25,12), // christmas
    new Date(2026,9,31,12),  // halloween
    new Date(2027,0,1,12),   // new-year
    new Date(2026,1,14,12),  // valentine
  ]
  const props=new Set<string>()
  for(const d of holidayDates){
    const a=officeGardenHolidayActivity(d,0)
    const b=officeGardenHolidayActivity(d,1)
    assert.ok(a&&a.activity.length>0)
    assert.ok(b&&b.activity.length>0)
    assert.equal(a.prop,b.prop)
    assert.notEqual(a.activity,b.activity)
    props.add(a.prop)
  }
  assert.equal(props.size,6)
})

test('returns an interactive garden holiday spot on holidays and null outside holidays or indoor floors',()=>{
  const loungeFloor={id:'lounge',kind:'lounge' as const,sessionId:null,title:'Garden',subtitle:'',color:'#fff',y:0,height:195,actorKeys:[]}
  const songkranDate=new Date(2026,3,14,12)
  assert.equal(officeGardenHolidaySpot(loungeFloor,450,new Date(2026,6,12,12)),null)
  assert.equal(officeGardenHolidaySpot({...loungeFloor,kind:'team'},450,songkranDate),null)
  assert.equal(officeGardenHolidaySpot({...loungeFloor,kind:'break'},450,songkranDate),null)
  assert.equal(officeGardenHolidaySpot({...loungeFloor,height:0},450,songkranDate),null)
  const holidayDates=[
    new Date(2026,10,24,12), // loy-krathong
    new Date(2026,3,14,12),  // songkran
    new Date(2026,11,25,12), // christmas
    new Date(2026,9,31,12),  // halloween
    new Date(2027,0,1,12),   // new-year
    new Date(2026,1,14,12),  // valentine
  ]
  const labels=new Set<string>(),groupCaptions=new Set<string>()
  for(const d of holidayDates){
    const desktopSpot=officeGardenHolidaySpot({...loungeFloor,desktopArt:true},450,d)
    const webSpot=officeGardenHolidaySpot({...loungeFloor,desktopArt:false},450,d)
    assert.ok(desktopSpot&&webSpot)
    assert.equal(desktopSpot.x,450*.415)
    assert.equal(webSpot.x,450*.23)
    for(const spot of [desktopSpot,webSpot]){
      assert.ok(spot.x<450*.80)
      assert.ok(spot.width>0&&spot.height>0)
      assert.ok(spot.label.length>0&&spot.groupCaption.length>0)
    }
    labels.add(desktopSpot.label)
    groupCaptions.add(desktopSpot.groupCaption)
  }
  assert.equal(labels.size,6)
  assert.equal(groupCaptions.size,6)
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
