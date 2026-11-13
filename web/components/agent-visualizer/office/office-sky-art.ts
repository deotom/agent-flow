import type { OfficeScene } from '../../../lib/office-types'
import { officeSky, skyEvent as currentSkyEvent, type OfficeSky, type SkyEvent } from '../../../lib/office-sky'

/**
 * Paints the surface lawn's sky layer over the artwork: time-of-day tint, stars and the real
 * moon phase, hourly weather, seasonal accents, dated festivals and random sky events.
 * Static parts (tint, moon, stars, clouds, festival decor) draw even when motion is off;
 * anything that moves needs `time` > 0.
 */
type Ctx = CanvasRenderingContext2D

let cached: { minute: number; sky: OfficeSky } | null = null
/** The sky only changes by the minute, except the moving event's progress. */
export function skyFor(date: Date): OfficeSky {
  const minute = Math.floor(date.getTime() / 60_000)
  if (!cached || cached.minute !== minute) cached = { minute, sky: officeSky(date) }
  const event = currentSkyEvent(date)
  return event === cached.sky.event ? cached.sky : { ...cached.sky, event }
}

const rnd = (i: number, salt = 0) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x) }
function disc(c: Ctx, x: number, y: number, r: number, fill: string) { c.beginPath(); c.ellipse(x, y, r, r, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill() }

/** Celestial objects remain behind the garden foreground, using the local lunar phase. */
export function drawOfficeNightSky(c: Ctx, scene: OfficeScene, date: Date, time: number) {
  const H = scene.floors.find(f => f.kind === 'lounge')?.height ?? 0
  if (!H) return
  const sky = skyFor(date)
  stars(c, scene.width, H, time, sky)
  moon(c, sky, scene.width, H, scene.width / 450)
}

export function drawOfficeSky(c: Ctx, scene: OfficeScene, time: number, date: Date, override?: OfficeSky): OfficeSky | null {
  const lawn = scene.floors.find(f => f.kind === 'lounge'), H = lawn?.height ?? 0
  // Needs a real 2D context (gradients); recording test contexts skip the sky.
  if (!H || typeof c.createLinearGradient !== 'function') return null
  const sky = override ?? skyFor(date), w = scene.width, k = w / 450
  c.save()
  c.beginPath(); c.rect(0, 0, w, H * .82); c.clip()
  // The daylight canvas owns the sun path, stars and moon. This layer adds weather and events.
  const dim = sky.weather === 'storm' ? .16 : sky.weather === 'rain' ? .10 : 0
  if (dim) { c.fillStyle = `rgba(40,48,66,${dim})`; c.fillRect(0, 0, w, H) }
  weather(c, sky, w, H, k, time)
  if (sky.holiday) holiday(c, sky, w, H, k, time)
  if (sky.event && time) skyEvent(c, sky.event, w, H, k, time)
  c.restore()
  return sky
}

function tint(c: Ctx, sky: OfficeSky, w: number, H: number) {
  const dim = sky.weather === 'storm' ? .22 : sky.weather === 'rain' ? .14 : sky.weather === 'cloudy' ? .06 : 0
  if (sky.phase === 'night') { c.fillStyle = 'rgba(12,22,58,.5)'; c.fillRect(0, 0, w, H) }
  else if (sky.phase === 'dawn') { c.fillStyle = 'rgba(255,170,130,.14)'; c.fillRect(0, 0, w, H) }
  else if (sky.phase === 'dusk') { c.fillStyle = 'rgba(255,110,70,.16)'; c.fillRect(0, 0, w, H) }
  else {
    // Daytime: cool the painted sunset sky towards blue, fading out at the horizon.
    const g = c.createLinearGradient(0, 0, 0, H * .5); g.addColorStop(0, 'rgba(110,180,255,.28)'); g.addColorStop(1, 'rgba(110,180,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, w, H * .5)
  }
  if (dim) { c.fillStyle = `rgba(40,48,66,${dim})`; c.fillRect(0, 0, w, H) }
}

function stars(c: Ctx, w: number, H: number, time: number, sky: OfficeSky) {
  if (sky.weather === 'cloudy' || sky.weather === 'rain' || sky.weather === 'storm') return
  for (let i = 0; i < 32; i++) {
    const twinkle = time ? .55 + .45 * Math.sin(time * (1 + rnd(i, 3) * 2) + i) : .8
    c.globalAlpha = twinkle; disc(c, rnd(i) * w, rnd(i, 1) * H * .42, .5 + rnd(i, 2) * .9, '#fff8e0')
  }
  c.globalAlpha = 1
}

/** Moon with its real phase: lit disc, then the shadowed part as an offset ellipse. */
function moon(c: Ctx, sky: OfficeSky, w: number, H: number, k: number) {
  const x = w * .8, y = H * .14, r = 9 * k, age = sky.moon
  c.save(); c.shadowColor = '#fff5c8'; c.shadowBlur = 10 * k; disc(c, x, y, r, '#fff3c4'); c.restore()
  // Illuminated fraction; waxing lit on the right, waning lit on the left.
  const lit = (1 - Math.cos(age * Math.PI * 2)) / 2, waxing = age < .5
  if (lit > .98) return
  c.save(); c.beginPath(); c.ellipse(x, y, r + .3, r + .3, 0, 0, Math.PI * 2); c.clip()
  c.fillStyle = 'rgba(28,34,66,.92)'
  c.beginPath()
  // Shadow half on the dark side plus a terminator ellipse.
  const side = waxing ? -1 : 1, term = Math.abs(1 - 2 * lit) * r
  c.ellipse(x, y, r, r, 0, Math.PI / 2, Math.PI * 1.5, side > 0 ? true : false)
  c.ellipse(x, y, term, r, 0, Math.PI * 1.5, Math.PI / 2, (lit < .5) === (side > 0))
  c.fill(); c.restore()
}

function sunGlow(c: Ctx, w: number, H: number, time: number) {
  const pulse = time ? .8 + .2 * Math.sin(time * .6) : 1
  const g = c.createRadialGradient(w * .93, H * .3, 2, w * .93, H * .3, w * .3)
  g.addColorStop(0, `rgba(255,236,160,${.32 * pulse})`); g.addColorStop(1, 'rgba(255,236,160,0)')
  c.fillStyle = g; c.fillRect(0, 0, w, H)
}

function cloud(c: Ctx, x: number, y: number, s: number, color: string) {
  disc(c, x, y, 9 * s, color); disc(c, x + 10 * s, y - 4 * s, 11 * s, color); disc(c, x + 22 * s, y, 9 * s, color); c.fillRect(x, y, 22 * s, 8 * s)
}

/** Cloud layer belongs behind the transparent tree canopy, with the live sun and moon. */
export function drawOfficeWeatherClouds(c: Ctx, scene: OfficeScene, date: Date, time: number): boolean {
  const sky = skyFor(date), w = scene.width, H = scene.floors.find(f => f.kind === 'lounge')?.height ?? 0, k = w / 450
  const night = sky.phase === 'night'
  if (sky.weather !== 'clear' && sky.weather !== 'mist') {
    c.save()
    const n = sky.weather === 'cloudy' ? 4 : 6, color = sky.weather === 'storm' ? (night ? '#3a3f55' : '#8a90a0') : night ? '#56607a' : '#f4f1ea'
    for (let i = 0; i < n; i++) {
      const drift = time ? time * (3 + rnd(i, 4) * 3) * k : 0
      const x = ((rnd(i, 5) * w + drift) % (w + 60 * k)) - 40 * k
      c.globalAlpha = .88; cloud(c, x, H * (.06 + rnd(i, 6) * .2), k * (.8 + rnd(i, 7) * .6), color)
    }
    c.globalAlpha = 1
    c.restore()
    return true
  }
  return false
}

function weather(c: Ctx, sky: OfficeSky, w: number, H: number, k: number, time: number) {
  const night = sky.phase === 'night'
  if (sky.weather === 'rain' || sky.weather === 'storm') {
    const n = sky.weather === 'storm' ? 90 : 55, fall = time * 260 * k
    c.strokeStyle = night ? 'rgba(170,190,230,.55)' : 'rgba(210,225,245,.65)'; c.lineWidth = .8 * k; c.beginPath()
    for (let i = 0; i < n; i++) {
      const x = (rnd(i, 8) * (w + 40 * k) + fall * .3) % (w + 40 * k) - 20 * k, y = (rnd(i, 9) * H * .82 + fall) % (H * .82)
      c.moveTo(x, y); c.lineTo(x - 3 * k, y + 8 * k)
    }
    c.stroke()
    if (sky.weather === 'storm' && time) {
      // Lightning: a brief double flash every few seconds.
      const beat = time % 6.5, strike = beat < .12 || (beat > .22 && beat < .3)
      if (strike) { c.fillStyle = 'rgba(255,255,240,.45)'; c.fillRect(0, 0, w, H) }
    }
  }
  if (sky.weather === 'mist') {
    const shift = time ? Math.sin(time * .15) * 20 * k : 0
    const g = c.createLinearGradient(0, H * .4, 0, H * .8); g.addColorStop(0, 'rgba(245,240,235,0)'); g.addColorStop(.5, 'rgba(245,240,235,.42)'); g.addColorStop(1, 'rgba(245,240,235,.1)')
    c.save(); c.translate(shift, 0); c.fillStyle = g; c.fillRect(-30 * k, H * .4, w + 60 * k, H * .4); c.restore()
  }
}

function holiday(c: Ctx, sky: OfficeSky, w: number, H: number, k: number, time: number) {
  const night = sky.phase === 'night' || sky.phase === 'dusk'
  switch (sky.holiday) {
    case 'new-year': return night ? fireworks(c, w, H, k, time) : bunting(c, w, H, k, ['#e8473f', '#f2c94c', '#3f8ee8', '#5cc272'])
    case 'songkran': bunting(c, w, H, k, ['#3fb4e8', '#7fd3f5', '#f2c94c', '#ff8fb1']); return !night && time ? water(c, w, H, k, time) : undefined
    case 'loy-krathong': return night ? lanterns(c, w, H, k, time) : bunting(c, w, H, k, ['#f2a03f', '#f2c94c', '#e86a3f'])
    case 'halloween': pumpkins(c, w, H, k, night); return night && time ? bats(c, w, H, k, time) : undefined
    case 'christmas': treeLights(c, w, H, k, time); return snow(c, w, H, k, time)
    case 'valentine': return hearts(c, w, H, k, time)
  }
}

function bunting(c: Ctx, w: number, H: number, k: number, colors: string[]) {
  const y0 = H * .05
  c.strokeStyle = '#6b4a2c'; c.lineWidth = .8 * k; c.beginPath(); c.moveTo(w * .38, y0); c.quadraticCurveTo(w * .62, y0 + 14 * k, w * .88, y0); c.stroke()
  for (let i = 0; i < 10; i++) {
    const t = (i + .5) / 10, x = w * (.38 + .5 * t), y = y0 + Math.sin(t * Math.PI) * 7 * k
    c.beginPath(); c.moveTo(x - 4 * k, y); c.lineTo(x + 4 * k, y); c.lineTo(x, y + 8 * k); c.closePath(); c.fillStyle = colors[i % colors.length]; c.fill()
  }
}

function fireworks(c: Ctx, w: number, H: number, k: number, time: number) {
  if (!time) return
  const colors = ['#ff6b6b', '#ffd93d', '#6bcBff', '#c77dff', '#7dffa0']
  for (let b = 0; b < 3; b++) {
    const cycle = 2.4, n = Math.floor((time + b * .8) / cycle), p = ((time + b * .8) % cycle) / cycle
    const x = w * (.2 + rnd(n, b) * .6), y = H * (.08 + rnd(n, b + 5) * .2), r = p * 26 * k
    c.globalAlpha = Math.max(0, 1 - p)
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; disc(c, x + Math.cos(a) * r, y + Math.sin(a) * r + p * p * 6 * k, 1.2 * k, colors[(n + b) % colors.length]) }
  }
  c.globalAlpha = 1
}

function water(c: Ctx, w: number, H: number, k: number, time: number) {
  for (let s = 0; s < 3; s++) {
    const x0 = w * (.3 + s * .2), y0 = H * .72, dir = s % 2 ? -1 : 1
    for (let i = 0; i < 8; i++) {
      const p = ((time * .9 + i / 8 + s * .3) % 1), x = x0 + dir * p * 40 * k, y = y0 - Math.sin(p * Math.PI) * 30 * k
      c.globalAlpha = .75; disc(c, x, y, 1.6 * k, '#8fd8ff')
    }
  }
  c.globalAlpha = 1
}

function lanterns(c: Ctx, w: number, H: number, k: number, time: number) {
  for (let i = 0; i < 8; i++) {
    const p = time ? ((time * .03 + rnd(i, 12)) % 1) : rnd(i, 12), x = w * (.15 + rnd(i, 13) * .7) + (time ? Math.sin(time * .7 + i) * 6 * k : 0), y = H * (.7 - p * .68)
    c.save(); c.globalAlpha = p > .85 ? (1 - p) / .15 : 1; c.shadowColor = '#ffb347'; c.shadowBlur = 8 * k
    c.beginPath(); c.moveTo(x - 3.5 * k, y - 5 * k); c.lineTo(x + 3.5 * k, y - 5 * k); c.lineTo(x + 2.5 * k, y + 4 * k); c.lineTo(x - 2.5 * k, y + 4 * k); c.closePath()
    c.fillStyle = '#ffb04a'; c.fill(); disc(c, x, y + 3 * k, 1.3 * k, '#fff2b0'); c.restore()
  }
}

function pumpkins(c: Ctx, w: number, H: number, k: number, night: boolean) {
  for (const [fx, fy] of [[.12, .74], [.2, .77], [.88, .73]] as const) {
    const x = w * fx, y = H * fy
    c.save(); if (night) { c.shadowColor = '#ffa13d'; c.shadowBlur = 8 * k }
    c.beginPath(); c.ellipse(x, y, 6 * k, 4.6 * k, 0, 0, Math.PI * 2); c.fillStyle = '#f08a24'; c.fill(); c.strokeStyle = '#7a3d10'; c.lineWidth = .8 * k; c.stroke()
    c.fillStyle = '#4c7a2a'; c.fillRect(x - .8 * k, y - 6.5 * k, 1.6 * k, 2.5 * k)
    if (night) { c.fillStyle = '#ffe28a'; c.fillRect(x - 3 * k, y - 1.5 * k, 1.6 * k, 1.6 * k); c.fillRect(x + 1.4 * k, y - 1.5 * k, 1.6 * k, 1.6 * k) }
    c.restore()
  }
}

function bats(c: Ctx, w: number, H: number, k: number, time: number) {
  c.strokeStyle = '#1d1424'; c.lineWidth = 1.4 * k
  for (let i = 0; i < 4; i++) {
    const p = (time * .08 + rnd(i, 14)) % 1, x = w * p, y = H * (.12 + rnd(i, 15) * .2) + Math.sin(time * 3 + i) * 5 * k, f = Math.sin(time * 14 + i) * 3 * k
    c.beginPath(); c.moveTo(x - 6 * k, y - f); c.quadraticCurveTo(x - 3 * k, y + 1 * k, x, y); c.quadraticCurveTo(x + 3 * k, y + 1 * k, x + 6 * k, y - f); c.stroke()
  }
}

function treeLights(c: Ctx, w: number, H: number, k: number, time: number) {
  const colors = ['#ff5a5a', '#ffd84a', '#5ad1ff', '#7dff8a']
  for (let i = 0; i < 18; i++) {
    const on = time ? Math.sin(time * 2 + i * 1.7) > -.3 : true
    if (!on) continue
    c.save(); c.shadowColor = colors[i % 4]; c.shadowBlur = 5 * k
    disc(c, w * (.05 + rnd(i, 16) * .25), H * (.08 + rnd(i, 17) * .3), 1.4 * k, colors[i % 4]); c.restore()
  }
}

function snow(c: Ctx, w: number, H: number, k: number, time: number) {
  c.fillStyle = 'rgba(255,255,255,.9)'
  for (let i = 0; i < 40; i++) {
    const y = ((rnd(i, 18) * H * .82) + time * (12 + rnd(i, 19) * 10) * k) % (H * .82), x = rnd(i, 20) * w + Math.sin(time * .8 + i) * 4 * k
    c.beginPath(); c.ellipse(x, y, 1.1 * k, 1.1 * k, 0, 0, Math.PI * 2); c.fill()
  }
}

function heart(c: Ctx, x: number, y: number, s: number, color: string) {
  c.beginPath(); c.moveTo(x, y + s); c.bezierCurveTo(x - 2 * s, y - .2 * s, x - s, y - 1.6 * s, x, y - .6 * s); c.bezierCurveTo(x + s, y - 1.6 * s, x + 2 * s, y - .2 * s, x, y + s); c.fillStyle = color; c.fill()
}

function hearts(c: Ctx, w: number, H: number, k: number, time: number) {
  for (let i = 0; i < 6; i++) {
    const p = time ? (time * .05 + rnd(i, 21)) % 1 : rnd(i, 21)
    c.globalAlpha = p > .8 ? (1 - p) / .2 : .9
    heart(c, w * (.2 + rnd(i, 22) * .6) + (time ? Math.sin(time + i) * 5 * k : 0), H * (.72 - p * .6), 3.2 * k, i % 2 ? '#ff7aa8' : '#ff4f7b')
  }
  c.globalAlpha = 1
}

/** Random sky events; `progress` runs 0..1 across the event. */
function skyEvent(c: Ctx, event: SkyEvent, w: number, H: number, k: number, time: number) {
  const p = event.progress, fade = Math.min(1, p / .08, (1 - p) / .08)
  const across = (from: number, to: number) => from + (to - from) * p
  c.save(); c.globalAlpha = Math.max(0, fade)
  switch (event.kind) {
    case 'butterflies': case 'fireflies': case 'leaves': {
      for (let i = 0; i < 7; i++) {
        const x = ((p * w + rnd(i, 31) * w) % (w + 20 * k)) - 10 * k
        const y = H * (.25 + rnd(i, 32) * .48) + Math.sin(time * 2 + i) * 7 * k
        if (event.kind === 'fireflies') {
          c.save(); c.globalAlpha *= .5 + .5 * Math.sin(time * 3 + i) ** 2; c.shadowColor = '#e5ff8a'; c.shadowBlur = 8 * k; disc(c, x, y, 1.5 * k, '#e5ff8a'); c.restore()
        } else if (event.kind === 'leaves') {
          c.save(); c.translate(x, y); c.rotate(time + i); c.fillStyle = ['#d5a34c','#b7bc55','#db8752'][i % 3]; c.beginPath(); c.ellipse(0, 0, 4 * k, 1.7 * k, 0, 0, Math.PI * 2); c.fill(); c.restore()
        } else {
          const wing = (1.4 + Math.abs(Math.sin(time * 9 + i)) * 2) * k
          c.fillStyle = ['#ffcf69','#f59ca8','#92cfe9'][i % 3]; c.beginPath(); c.ellipse(x-wing,y,wing,2.5*k,-.4,0,Math.PI*2); c.ellipse(x+wing,y,wing,2.5*k,.4,0,Math.PI*2); c.fill(); c.fillStyle='#655145';c.fillRect(x-.5*k,y-2*k,k,4*k)
        }
      }
      break
    }
    case 'balloon': {
      const x = across(-20 * k, w + 20 * k), y = H * (.16 + event.seed * .1) + Math.sin(time * .8) * 3 * k
      const stripes = ['#e8473f', '#f2c94c', '#3f8ee8']
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x, y, (11 - i * 3.5) * k, 13 * k, 0, 0, Math.PI * 2); c.fillStyle = stripes[i]; c.fill() }
      c.strokeStyle = '#5a3a20'; c.lineWidth = .7 * k; c.beginPath(); c.moveTo(x - 5 * k, y + 11 * k); c.lineTo(x - 3 * k, y + 18 * k); c.moveTo(x + 5 * k, y + 11 * k); c.lineTo(x + 3 * k, y + 18 * k); c.stroke()
      c.fillStyle = '#8a5a30'; c.fillRect(x - 3.5 * k, y + 18 * k, 7 * k, 4.5 * k)
      break
    }
    case 'birds': {
      c.strokeStyle = '#2d2a30'; c.lineWidth = 1.1 * k
      for (let i = 0; i < 5; i++) {
        const x = across(w + 20 * k, -40 * k) + (i % 2) * 8 * k + i * 6 * k, y = H * (.12 + event.seed * .12) + i * 3 * k, f = Math.sin(time * 10 + i) * 2.5 * k
        c.beginPath(); c.moveTo(x - 4 * k, y - f); c.quadraticCurveTo(x - 2 * k, y, x, y + 1 * k); c.quadraticCurveTo(x + 2 * k, y, x + 4 * k, y - f); c.stroke()
      }
      break
    }
    case 'plane': case 'night-plane': {
      const x = across(-30 * k, w + 30 * k), y = H * (.06 + event.seed * .08)
      if (event.kind === 'plane') {
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.4 * k; c.beginPath(); c.moveTo(x - 6 * k, y); c.lineTo(Math.max(0, x - 120 * k), y + 1 * k); c.stroke()
        c.fillStyle = '#f4f6f8'; c.beginPath(); c.ellipse(x, y, 6 * k, 1.6 * k, 0, 0, Math.PI * 2); c.fill(); c.fillRect(x - 1 * k, y - 4 * k, 2 * k, 8 * k)
      } else {
        const blink = Math.sin(time * 6) > 0
        disc(c, x, y, 1.2 * k, blink ? '#ff4a4a' : '#552222'); disc(c, x + 4 * k, y, 1 * k, blink ? '#3a3a3a' : '#5aff7a')
      }
      break
    }
    case 'kite': {
      const x = w * (.5 + event.seed * .2) + Math.sin(time * 1.3) * 6 * k, y = H * .2 + Math.cos(time * 1.1) * 4 * k
      c.strokeStyle = 'rgba(80,60,40,.7)'; c.lineWidth = .6 * k; c.beginPath(); c.moveTo(x, y + 8 * k); c.quadraticCurveTo(x - 10 * k, H * .45, x - 4 * k, H * .7); c.stroke()
      c.beginPath(); c.moveTo(x, y - 8 * k); c.lineTo(x + 6 * k, y); c.lineTo(x, y + 8 * k); c.lineTo(x - 6 * k, y); c.closePath(); c.fillStyle = '#ff6f61'; c.fill()
      c.strokeStyle = '#fff'; c.lineWidth = .6 * k; c.beginPath(); c.moveTo(x, y - 8 * k); c.lineTo(x, y + 8 * k); c.moveTo(x - 6 * k, y); c.lineTo(x + 6 * k, y); c.stroke()
      break
    }
    case 'cat': {
      const x = across(-15 * k, w + 15 * k), y = H * .72, step = Math.sin(time * 9) * 1.2 * k
      c.fillStyle = '#e8913a'
      c.beginPath(); c.ellipse(x, y - 4 * k, 6 * k, 3.4 * k, 0, 0, Math.PI * 2); c.fill()
      disc(c, x + 6 * k, y - 7 * k, 3 * k, '#e8913a')
      c.beginPath(); c.moveTo(x + 4 * k, y - 9 * k); c.lineTo(x + 5 * k, y - 12 * k); c.lineTo(x + 6.5 * k, y - 9.5 * k); c.moveTo(x + 6.5 * k, y - 9.5 * k); c.lineTo(x + 8 * k, y - 12 * k); c.lineTo(x + 9 * k, y - 8.5 * k); c.fill()
      c.strokeStyle = '#e8913a'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(x - 6 * k, y - 5 * k); c.quadraticCurveTo(x - 10 * k, y - 10 * k + step, x - 9 * k, y - 13 * k); c.stroke()
      c.fillRect(x - 4 * k, y - 2 * k + step, 1.6 * k, 3 * k); c.fillRect(x + 3 * k, y - 2 * k - step, 1.6 * k, 3 * k)
      break
    }
    case 'drone': {
      const x = across(w + 20 * k, -20 * k), y = H * (.25 + event.seed * .08) + Math.sin(time * 2) * 2 * k
      c.fillStyle = '#3b3f46'; c.fillRect(x - 5 * k, y - 1.5 * k, 10 * k, 3 * k)
      for (const dx of [-6, 6]) { c.fillRect(x + dx * k - 3 * k, y - 3.5 * k, 6 * k, .8 * k) }
      c.fillStyle = '#c8955a'; c.fillRect(x - 3 * k, y + 2.5 * k, 6 * k, 5 * k)
      break
    }
    case 'shooting-star': {
      for (const [start, len] of [[.1, .12], [.55, .1]] as const) {
        const q = (p - start) / len
        if (q < 0 || q > 1) continue
        const x0 = w * (.75 - event.seed * .2), y0 = H * .05, x = x0 - q * 90 * k, y = y0 + q * 45 * k
        const g = c.createLinearGradient(x, y, x + 24 * k, y - 12 * k); g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(1, 'rgba(255,255,230,0)')
        c.strokeStyle = g; c.lineWidth = 1.4 * k; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 24 * k, y - 12 * k); c.stroke()
      }
      break
    }
    case 'ufo': {
      const hover = p > .25 && p < .75, x = p < .25 ? across(-20 * k, w * .5) * 1 : p > .75 ? w * .5 + (p - .75) / .25 * (w * .6) : w * .5 + Math.sin(time) * 8 * k
      const y = H * .22 + Math.sin(time * 2) * 2 * k
      if (hover) { const g = c.createLinearGradient(0, y, 0, H * .78); g.addColorStop(0, 'rgba(170,255,200,.45)'); g.addColorStop(1, 'rgba(170,255,200,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - 4 * k, y); c.lineTo(x + 4 * k, y); c.lineTo(x + 16 * k, H * .78); c.lineTo(x - 16 * k, H * .78); c.closePath(); c.fill() }
      c.fillStyle = '#9fb3c8'; c.beginPath(); c.ellipse(x, y, 11 * k, 3.4 * k, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#bff3ff'; c.beginPath(); c.ellipse(x, y - 2.5 * k, 5 * k, 3.5 * k, 0, Math.PI, 0); c.fill()
      for (let i = -2; i <= 2; i++) disc(c, x + i * 4 * k, y + .5 * k, .9 * k, Math.sin(time * 8 + i) > 0 ? '#ffee66' : '#ff8866')
      break
    }
    case 'rainbow': {
      const colors = ['#ff4d4d', '#ff9f43', '#ffd93d', '#6bd86b', '#4dabff', '#6c63ff', '#b066ff']
      c.globalAlpha = .38 * Math.min(1, p / .1, (1 - p) / .3); c.lineWidth = 2.6 * k
      colors.forEach((color, i) => { c.strokeStyle = color; c.beginPath(); c.arc(w * .5, H * .62, (w * .42) - i * 2.6 * k, Math.PI, 0); c.stroke() })
      break
    }
  }
  c.restore()
}
