import test from 'node:test'
import assert from 'node:assert/strict'
import { gardenWetness, moonAge, officeClouds, officeSky, officeSkyIcon, skyEvent, skyHoliday, skyPhase, skySeason, skyWeather, SKY_EVENT_SLOT_MS } from '../lib/office-sky'
import { DESKTOP_BACKGROUND_SKY_EVENTS, drawOfficeForegroundWeather, drawOfficeNightSky, drawOfficeSky, drawOfficeSkyBackgroundEvents, drawOfficeSkyBalloon } from '../components/agent-visualizer/office/office-sky-art'
import type {OfficeScene} from '../lib/office-types'

const at = (y: number, m: number, d: number, h = 12, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s)
const hours = (start: Date, count: number) => Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 3_600_000))

test('paints the Desktop balloon only on the sky layer behind the garden',()=>{
 const date=at(2026,11,23),event={kind:'balloon' as const,seed:.5,progress:.5}
 const scene:OfficeScene={width:450,height:500,floors:[{id:'lounge',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#abc',y:0,height:188,actorKeys:[],desktopArt:true}],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
 let ellipses=0
 const canvas={save(){},restore(){},beginPath(){},rect(){},clip(){},fill(){},fillRect(){},moveTo(){},lineTo(){},stroke(){},createLinearGradient(){},ellipse(){ellipses++}} as unknown as CanvasRenderingContext2D
 const sky={...officeSky(date),weather:'clear' as const,holiday:null,event}
 drawOfficeSky(canvas,scene,1,date,sky)
 assert.equal(ellipses,0)
 drawOfficeSkyBalloon(canvas,scene,1,date,event)
 assert.equal(ellipses,3)
 scene.floors[0].desktopArt=false
 drawOfficeSky(canvas,scene,1,date,sky)
 assert.equal(ellipses,6)
})

test('routes distant Desktop sky events and New Year night fireworks behind the garden foliage layer',()=>{
 const noop=()=>{}
 const grad={addColorStop:noop}
 const mkCtx=()=>{
  const ops:string[]=[]
  let fillStyle='',strokeStyle=''
  const rec=(op:string)=>(...args:unknown[])=>{ops.push(`${op}:${String(fillStyle)}:${String(strokeStyle)}:${args.map(v=>typeof v==='number'?v.toFixed(2):String(v)).join(',')}`)}
  const c={
   set fillStyle(v:string){fillStyle=v},
   get fillStyle(){return fillStyle},
   set strokeStyle(v:string){strokeStyle=v},
   get strokeStyle(){return strokeStyle},
   lineWidth:1,globalAlpha:1,lineCap:'butt',lineJoin:'miter',
   save:noop,restore:noop,beginPath:noop,closePath:noop,rect:noop,clip:noop,
   translate:noop,rotate:noop,scale:noop,setLineDash:noop,
   moveTo:rec('moveTo'),lineTo:rec('lineTo'),quadraticCurveTo:rec('quad'),bezierCurveTo:rec('bezier'),arcTo:noop,
   fill:rec('fill'),fillRect:rec('fillRect'),stroke:rec('stroke'),ellipse:rec('ellipse'),arc:rec('arc'),
   createLinearGradient:()=>grad,createRadialGradient:()=>grad,
  } as unknown as CanvasRenderingContext2D
  return {c,ops}
 }
 const desktopScene=():OfficeScene=>({
  width:450,height:500,
  floors:[{id:'lounge',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#abc',y:0,height:188,actorKeys:[],desktopArt:true}],
  actors:[],quietTeams:[],totalAgents:0,finishedCount:0,
 })
 const date=at(2026,11,23)
 const backgroundKinds=['balloon','plane','night-plane','birds','shooting-star','rainbow','ufo'] as const
 for(const kind of backgroundKinds){
  assert.ok(DESKTOP_BACKGROUND_SKY_EVENTS.has(kind),`${kind} is in DESKTOP_BACKGROUND_SKY_EVENTS`)
  const phase=kind==='night-plane'||kind==='shooting-star'||kind==='ufo'?'night' as const:'day' as const
  const baseSky={...officeSky(date),phase,weather:'clear' as const,holiday:null,event:null}
  const eventSky={...baseSky,event:{kind,seed:.5,progress:kind==='shooting-star'?.6:.5}}
  const fgBase=mkCtx(),fgEv=mkCtx(),bgEv=mkCtx()
  drawOfficeSky(fgBase.c,desktopScene(),1,date,baseSky)
  drawOfficeSky(fgEv.c,desktopScene(),1,date,eventSky)
  drawOfficeSkyBackgroundEvents(bgEv.c,desktopScene(),1,date,eventSky)
  assert.deepEqual(fgEv.ops,fgBase.ops,`foreground sky skips Desktop background event ${kind}`)
  assert.ok(bgEv.ops.length>0,`background sky layer paints Desktop event ${kind}`)
 }
 const foregroundKinds=['cat','butterflies','fireflies','leaves','kite','drone'] as const
 for(const kind of foregroundKinds){
  assert.ok(!DESKTOP_BACKGROUND_SKY_EVENTS.has(kind),`${kind} stays on foreground sky`)
  const phase=kind==='fireflies'?'night' as const:'day' as const
  const baseSky={...officeSky(date),phase,weather:'clear' as const,holiday:null,event:null}
  const eventSky={...baseSky,event:{kind,seed:.5,progress:.5}}
  const fgBase=mkCtx(),fgEv=mkCtx(),bgEv=mkCtx()
  drawOfficeSky(fgBase.c,desktopScene(),1,date,baseSky)
  drawOfficeSky(fgEv.c,desktopScene(),1,date,eventSky)
  drawOfficeSkyBackgroundEvents(bgEv.c,desktopScene(),1,date,eventSky)
  assert.ok(fgEv.ops.length>fgBase.ops.length,`foreground sky still paints ${kind}`)
  assert.equal(bgEv.ops.length,0,`background sky layer skips foreground event ${kind}`)
 }
 const nyDate=at(2026,1,1,21)
 const nyBase={...officeSky(nyDate),phase:'night' as const,weather:'clear' as const,holiday:null,event:null}
 const nyHoliday={...nyBase,holiday:'new-year' as const}
 const nyFgBase=mkCtx(),nyFgHol=mkCtx(),nyBgHol=mkCtx()
 drawOfficeSky(nyFgBase.c,desktopScene(),1,nyDate,nyBase)
 drawOfficeSky(nyFgHol.c,desktopScene(),1,nyDate,nyHoliday)
 drawOfficeSkyBackgroundEvents(nyBgHol.c,desktopScene(),1,nyDate,nyHoliday)
 assert.deepEqual(nyFgHol.ops,nyFgBase.ops,'foreground sky skips Desktop New Year night fireworks')
 assert.ok(nyBgHol.ops.length>0,'background sky layer paints Desktop New Year night fireworks')
 const lkDate=at(2026,11,24,21)
 const lkBase={...officeSky(lkDate),phase:'night' as const,weather:'clear' as const,holiday:null,event:null}
 const lkHoliday={...lkBase,holiday:'loy-krathong' as const}
 const lkFgBase=mkCtx(),lkFgHol=mkCtx(),lkBgMoving=mkCtx(),lkBgStatic=mkCtx()
 drawOfficeSky(lkFgBase.c,desktopScene(),1,lkDate,lkBase)
 drawOfficeSky(lkFgHol.c,desktopScene(),1,lkDate,lkHoliday)
 drawOfficeSkyBackgroundEvents(lkBgMoving.c,desktopScene(),1,lkDate,lkHoliday)
 drawOfficeSkyBackgroundEvents(lkBgStatic.c,desktopScene(),0,lkDate,lkHoliday)
 assert.deepEqual(lkFgHol.ops,lkFgBase.ops,'foreground sky skips Desktop Loy Krathong night lanterns')
 assert.ok(lkBgMoving.ops.length>0,'background sky layer paints moving Desktop Loy Krathong night lanterns')
 assert.ok(lkBgStatic.ops.length>0,'background sky layer paints static Desktop Loy Krathong night lanterns at time=0')
 const hwDate=at(2026,10,31,21)
 const hwHoliday={...officeSky(hwDate),phase:'night' as const,weather:'clear' as const,holiday:'halloween' as const,event:null}
 const hwFgStatic=mkCtx(),hwFgMoving=mkCtx(),hwBgMoving=mkCtx()
 drawOfficeSky(hwFgStatic.c,desktopScene(),0,hwDate,hwHoliday)
 drawOfficeSky(hwFgMoving.c,desktopScene(),1,hwDate,hwHoliday)
 drawOfficeSkyBackgroundEvents(hwBgMoving.c,desktopScene(),1,hwDate,hwHoliday)
 assert.deepEqual(hwFgMoving.ops,hwFgStatic.ops,'foreground sky skips Desktop Halloween night bats')
 assert.ok(hwBgMoving.ops.length>0,'background sky layer paints Desktop Halloween night bats')
 for(const [holiday,d] of [['new-year',at(2026,1,1,12)],['songkran',at(2026,4,13,12)],['loy-krathong',at(2026,11,24,12)]] as const){
  const base={...officeSky(d),phase:'day' as const,weather:'clear' as const,holiday:null,event:null}
  const hol={...base,holiday}
  const dBase=mkCtx(),dHol=mkCtx(),wBase=mkCtx(),wHol=mkCtx()
  const nonDesktop=desktopScene();nonDesktop.floors[0].desktopArt=false
  drawOfficeSky(dBase.c,desktopScene(),0,d,base)
  drawOfficeSky(dHol.c,desktopScene(),0,d,hol)
  drawOfficeSky(wBase.c,nonDesktop,0,d,base)
  drawOfficeSky(wHol.c,nonDesktop,0,d,hol)
  assert.deepEqual(dHol.ops,dBase.ops,`foreground sky skips Desktop daytime bunting for ${holiday}`)
  assert.ok(wHol.ops.length>wBase.ops.length,`non-Desktop daytime sky still paints bunting for ${holiday}`)
 }
 for(const holiday of ['loy-krathong','new-year','halloween'] as const){
  const d=at(2026,11,24,12)
  const daySky={...officeSky(d),phase:'day' as const,weather:'clear' as const,holiday,event:null}
  const bgBurst=mkCtx()
  drawOfficeSkyBackgroundEvents(bgBurst.c,desktopScene(),1,d,daySky,{holiday,startedAt:0,seed:.5,x:450*.415,y:188*.84})
  assert.ok(bgBurst.ops.length>0,`background sky layer paints ${holiday} burst`)
 }
 const webScene=desktopScene()
 webScene.floors[0].desktopArt=false
 const planeSky={...officeSky(date),phase:'day' as const,weather:'clear' as const,holiday:null,event:{kind:'plane' as const,seed:.5,progress:.5}}
 const planeBase={...planeSky,event:null}
 const webBase=mkCtx(),webPlane=mkCtx(),webBg=mkCtx()
 drawOfficeSky(webBase.c,webScene,1,date,planeBase)
 drawOfficeSky(webPlane.c,webScene,1,date,planeSky)
 drawOfficeSkyBackgroundEvents(webBg.c,webScene,1,date,planeSky)
 assert.ok(webPlane.ops.length>webBase.ops.length,'non-Desktop garden still paints plane in drawOfficeSky')
 assert.equal(webBg.ops.length,0,'background layer does not paint non-Desktop plane')
})

test('keeps the garden wet through rain and dries it by local time after a wet hour',()=>{
  const dates=hours(at(2026,7,1,0),24*14)
  const wet=(date:Date)=>['rain','storm'].includes(skyWeather(date))
  const end=dates.find((date,i)=>i>0&&!wet(date)&&wet(dates[i-1]))!
  assert.ok(end)
  const after=(minutes:number)=>gardenWetness(new Date(end.getTime()+minutes*60_000))
  assert.equal(after(-1),1)
  assert.equal(after(0),1)
  assert.ok(after(12)>after(29)&&after(29)>0)
  assert.equal(after(45),0)
  const dry=dates.find((date,i)=>i>0&&!wet(date)&&!wet(dates[i-1]))!
  assert.ok(dry)
  assert.equal(gardenWetness(dry),0)
})

test('time of day follows the local clock', () => {
  assert.equal(skyPhase(at(2026, 11, 13, 4, 59)), 'night')
  assert.equal(skyPhase(at(2026, 11, 13, 5)), 'dawn')
  assert.equal(skyPhase(at(2026, 11, 13, 8)), 'day')
  assert.equal(skyPhase(at(2026, 11, 13, 17)), 'dusk')
  assert.equal(skyPhase(at(2026, 11, 13, 19)), 'night')
})

test('Thai seasons: hot Mar–May, rainy Jun–Oct, cool Nov–Feb', () => {
  const byMonth = Array.from({ length: 12 }, (_, m) => skySeason(at(2026, m + 1, 15)))
  assert.deepEqual(byMonth, ['cool', 'cool', 'hot', 'hot', 'hot', 'rainy', 'rainy', 'rainy', 'rainy', 'rainy', 'cool', 'cool'])
})

test('uses seasonal cloud coverage and increases it with wetter local weather',()=>{
  const hot=officeClouds({season:'hot',weather:'clear'},0)
  const cool=officeClouds({season:'cool',weather:'clear'},0)
  const rainy=officeClouds({season:'rainy',weather:'clear'},0)
  assert.ok(hot.length<cool.length&&cool.length<rainy.length)
  assert.ok(officeClouds({season:'rainy',weather:'storm'},0).length>rainy.length)
})

test('moves individual clouds at different speeds without resetting existing clouds when coverage changes',()=>{
  const condition={season:'cool',weather:'clear'} as const
  const start=officeClouds(condition,0),later=officeClouds(condition,5)
  const drift=later.map((cloud,i)=>cloud.x-start[i].x)
  assert.ok(drift.every(distance=>distance>0))
  assert.ok(Math.max(...drift)>Math.min(...drift))
  assert.deepEqual(officeClouds({...condition,weather:'cloudy'},5).slice(0,later.length),later)
  assert.deepEqual(officeClouds(condition,5),later)
})

test('moon age matches known full and new moons', () => {
  // Full moons: 15 Nov 2024, 5 Nov 2025, 3 Jan 2026. New moon: 20 Nov 2025.
  for (const full of [at(2024, 11, 15), at(2025, 11, 5), at(2026, 1, 3)]) assert.ok(Math.abs(moonAge(full) - .5) < .05, `${full}`)
  const nm = moonAge(at(2025, 11, 20)); assert.ok(nm < .04 || nm > .96)
})

test('festivals by date, Loy Krathong on the November full moon only', () => {
  assert.equal(skyHoliday(at(2026, 12, 31)), 'new-year'); assert.equal(skyHoliday(at(2027, 1, 1)), 'new-year')
  assert.equal(skyHoliday(at(2026, 4, 13)), 'songkran'); assert.equal(skyHoliday(at(2026, 4, 16)), null)
  assert.equal(skyHoliday(at(2026, 10, 31)), 'halloween')
  assert.equal(skyHoliday(at(2020, 10, 31)), 'loy-krathong')
  assert.equal(skyHoliday(at(2026, 12, 25)), 'christmas')
  assert.equal(skyHoliday(at(2026, 2, 14)), 'valentine')
  // Known Loy Krathong dates.
  for (const [y, m, d] of [[2020, 10, 31], [2023, 11, 27], [2024, 11, 15], [2025, 11, 5], [2026, 11, 24]]) assert.equal(skyHoliday(at(y, m, d)), 'loy-krathong', `${y}-${m}-${d}`)
  for (let y = 2020; y <= 2032; y++) assert.equal(Array.from({ length: 70 }, (_, i) => skyHoliday(new Date(y, 9, 1 + i, 12))).filter(h => h === 'loy-krathong').length, 1, `${y}`)
  assert.equal(skyHoliday(at(2024, 11, 15)), 'loy-krathong')
  assert.equal(skyHoliday(at(2025, 11, 5)), 'loy-krathong')
  assert.equal(skyHoliday(at(2025, 11, 12)), null)
  // A full moon outside the window is not Loy Krathong.
  assert.equal(skyHoliday(at(2026, 1, 3)), null)
  const year = Array.from({ length: 366 }, (_, i) => skyHoliday(new Date(2026, 0, 1 + i, 12))).filter(h => h === 'loy-krathong')
  assert.equal(year.length, 1)
})

test('weather is hourly, seasonal and deterministic', () => {
  const wet = hours(at(2026, 8, 1, 0), 24 * 30).map(skyWeather)
  const cool = hours(at(2026, 12, 1, 0), 24 * 30).map(d => [skyWeather(d), skyPhase(d)] as const)
  assert.ok(wet.filter(w => w === 'rain' || w === 'storm').length / wet.length > .3)
  assert.equal(cool.some(([w]) => w === 'rain' || w === 'storm'), false)
  assert.ok(cool.every(([w, p]) => w !== 'mist' || p === 'dawn'))
  assert.ok(cool.some(([w]) => w === 'mist'))
  const d = at(2026, 8, 1, 14, 5)
  assert.equal(skyWeather(d), skyWeather(at(2026, 8, 1, 14, 55)))
})

test('random events: some of the time, never in rain, night-only kinds at night, progress in range', () => {
  const start = at(2026, 11, 13, 0).getTime(), seen = new Set<string>()
  let active = 0, total = 0
  for (let t = start; t < start + 2 * 86_400_000; t += 7_000) {
    const date = new Date(t), weather = skyWeather(date), phase = skyPhase(date), event = skyEvent(date)
    total++
    if (!event) continue
    active++; seen.add(event.kind)
    assert.ok(event.progress >= 0 && event.progress < 1)
    if (event.kind !== 'rainbow') assert.ok(weather !== 'rain' && weather !== 'storm')
    if (['shooting-star', 'night-plane', 'ufo'].includes(event.kind)) assert.equal(phase, 'night')
    if (['balloon', 'birds', 'plane', 'kite', 'cat', 'drone'].includes(event.kind)) assert.notEqual(phase, 'night')
  }
  assert.ok(active / total > .05 && active / total < .3, `event share ${active / total}`)
  for (const kind of ['balloon', 'birds', 'shooting-star']) assert.ok(seen.has(kind), kind)
  // Deterministic within a slot.
  const t = start + 5 * SKY_EVENT_SLOT_MS + 30_000
  assert.deepEqual(skyEvent(new Date(t)), skyEvent(new Date(t)))
})

test('a rainbow can follow rain on a dry daytime hour', () => {
  let found = false
  for (const date of hours(at(2026, 7, 1, 8, 5), 24 * 60)) {
    if (skyPhase(date) !== 'day') continue
    const event = skyEvent(date)
    if (event?.kind === 'rainbow') { found = true; assert.ok(['rain', 'storm'].includes(skyWeather(new Date(date.getTime() - 3_600_000)))) }
  }
  assert.ok(found)
})

test('keeps Desktop Halloween pumpkins clear of the lift and walks the cat along the foreground path',()=>{
  const ellipses:{x:number;y:number}[]=[]
  const canvas={fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalAlpha:1,shadowColor:'',shadowBlur:0,
    save(){},restore(){},beginPath(){},rect(){},clip(){},fill(){},fillRect(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},stroke(){},createLinearGradient:()=>({addColorStop(){}}),
    ellipse(x:number,y:number){ellipses.push({x,y})}} as unknown as CanvasRenderingContext2D
  const scene:OfficeScene={width:450,height:500,floors:[{id:'lounge',kind:'lounge',sessionId:null,title:'Garden',subtitle:'',color:'#abc',y:0,height:195.75,actorKeys:[],desktopArt:true}],actors:[],quietTeams:[],totalAgents:0,finishedCount:0}
  const date=at(2026,10,31,12),sky={...officeSky(date),weather:'clear' as const,holiday:'halloween' as const,event:{kind:'cat' as const,seed:.5,progress:.5}}
  drawOfficeSky(canvas,scene,2,date,sky)
  assert.equal(ellipses.length,4)
  assert.ok(ellipses.slice(0,2).every(p=>p.x<450*.80&&Math.abs(p.x-450*.415)>40),'Desktop pumpkins remain left of the lift column and clear of the focal spot')
  assert.ok(ellipses.slice(2).every(p=>p.y>195.75*.80),'Desktop cat walks along the stone foreground path')
})

test('summary label and toolbar icon', () => {
  const sky = officeSky(at(2025, 11, 5, 21))
  assert.equal(sky.holiday, 'loy-krathong')
  assert.match(sky.label, /^Cool season · .+ · Loy Krathong$/)
  assert.equal(officeSkyIcon(sky), '🏮')
  assert.equal(officeSkyIcon({ ...sky, holiday: null, weather: 'rain' }), '🌧')
  assert.equal(officeSkyIcon({ ...sky, holiday: null, weather: 'clear', phase: 'night' }), '☾')
})

test('separates mist, rain/storm, and Christmas snow into background valley mist and foreground weather over characters', () => {
  const noop = () => {}
  const grad = { addColorStop: noop }
  const mk = () => {
    const ops: string[] = []
    const c = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      save: noop, restore: noop, beginPath: noop, closePath: noop, rect: noop, clip: noop,
      translate: noop, moveTo: () => ops.push('moveTo'), lineTo: () => ops.push('lineTo'),
      fill: () => ops.push('fill'), fillRect: () => ops.push('fillRect'),
      stroke: () => ops.push('stroke'), ellipse: () => ops.push('ellipse'),
      createLinearGradient: () => grad,
    } as unknown as CanvasRenderingContext2D
    return { c, ops }
  }
  const scene: OfficeScene = {
    width: 450, height: 500,
    floors: [{ id: 'lounge', kind: 'lounge', sessionId: null, title: 'Garden', subtitle: '', color: '#abc', y: 0, height: 195, actorKeys: [], desktopArt: true }],
    actors: [], quietTeams: [], totalAgents: 0, finishedCount: 0,
  }
  const date = at(2026, 12, 10, 7)
  const clearSky = { ...officeSky(date), phase: 'dawn' as const, weather: 'clear' as const, holiday: null, event: null }
  for (const weather of ['mist', 'rain', 'storm'] as const) {
    const fgClear = mk(), fgWeather = mk()
    drawOfficeSky(fgClear.c, scene, 1, date, clearSky)
    drawOfficeSky(fgWeather.c, scene, 1, date, { ...clearSky, weather })
    assert.deepEqual(fgWeather.ops, fgClear.ops, `drawOfficeSky defers ${weather} out of pre-actor pass`)
  }
  const bgClear = mk(), bgMist = mk()
  drawOfficeSkyBackgroundEvents(bgClear.c, scene, 1, date, clearSky)
  drawOfficeSkyBackgroundEvents(bgMist.c, scene, 1, date, { ...clearSky, weather: 'mist' })
  assert.equal(bgClear.ops.length, 0)
  assert.ok(bgMist.ops.length > 0, 'Desktop background sky paints distant valley morning mist')

  const fgClean = mk()
  drawOfficeForegroundWeather(fgClean.c, scene, 1, date, clearSky)
  assert.equal(fgClean.ops.length, 0)
  for (const sky of [
    { ...clearSky, weather: 'mist' as const },
    { ...clearSky, weather: 'rain' as const },
    { ...clearSky, weather: 'storm' as const },
    { ...clearSky, weather: 'clear' as const, holiday: 'christmas' as const },
  ]) {
    const out = mk()
    drawOfficeForegroundWeather(out.c, scene, 1, date, sky)
    assert.ok(out.ops.length > 0, `foreground weather paints ${sky.holiday ?? sky.weather}`)
  }
})

test('avoids shadowBlur on night and holiday sky elements', () => {
  const blurs: number[] = []
  const noop = () => {}
  const grad = { addColorStop: noop }
  let shadowBlur = 0
  const c = {
    fillStyle: '', strokeStyle: '', shadowColor: '', lineWidth: 1, globalAlpha: 1,
    set shadowBlur(v: number) { shadowBlur = v; if (v > 0) blurs.push(v) },
    get shadowBlur() { return shadowBlur },
    save: noop, restore: noop, beginPath: noop, closePath: noop, rect: noop, clip: noop,
    translate: noop, rotate: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, fillRect: noop, stroke: noop, ellipse: noop,
    createLinearGradient: () => grad,
  } as unknown as CanvasRenderingContext2D
  const scene: OfficeScene = {
    width: 450, height: 500,
    floors: [{ id: 'lounge', kind: 'lounge', sessionId: null, title: 'Garden', subtitle: '', color: '#abc', y: 0, height: 195, actorKeys: [], desktopArt: true }],
    actors: [], quietTeams: [], totalAgents: 0, finishedCount: 0,
  }
  const cases = [
    { date: at(2026, 11, 24, 21), holiday: 'loy-krathong' as const, event: { kind: 'fireflies' as const, seed: .5, progress: .5 } },
    { date: at(2026, 10, 31, 21), holiday: 'halloween' as const, event: null },
    { date: at(2026, 12, 25, 21), holiday: 'christmas' as const, event: null },
  ]
  for (const item of cases) {
    const sky = { ...officeSky(item.date), phase: 'night' as const, weather: 'clear' as const, holiday: item.holiday, event: item.event }
    drawOfficeNightSky(c, scene, item.date, 1)
    drawOfficeSky(c, scene, 1, item.date, sky)
    drawOfficeSkyBackgroundEvents(c, scene, 1, item.date, sky, { holiday: item.holiday, startedAt: 0, seed: .5, x: 186, y: 164 })
    drawOfficeForegroundWeather(c, scene, 1, item.date, sky)
  }
  assert.deepEqual(blurs, [])
})
