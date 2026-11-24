/**
 * The surface lawn follows real local time: time of day, Thai seasons, hourly weather,
 * dated festivals and small random sky events. Pure function of a Date, so every viewer
 * open at the same minute sees the same sky and tests stay deterministic.
 */
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night'
/** Thai seasons: hot (Mar–May), rainy (Jun–Oct), cool (Nov–Feb). */
export type Season = 'hot' | 'rainy' | 'cool'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'mist'
export type Holiday = 'new-year' | 'songkran' | 'loy-krathong' | 'halloween' | 'christmas' | 'valentine'
export type SkyEventKind =
  | 'balloon' | 'birds' | 'plane' | 'kite' | 'cat' | 'drone'
  | 'shooting-star' | 'night-plane' | 'ufo'
  | 'rainbow' | 'butterflies' | 'fireflies' | 'leaves'
export interface SkyEvent { kind: SkyEventKind; /** 0..1 through the event */ progress: number; /** 0..1 per occurrence, for variation */ seed: number }
export interface OfficeSky {
  phase: SkyPhase
  season: Season
  weather: Weather
  holiday: Holiday | null
  /** Moon age as a fraction of the synodic month: 0 new, .5 full. */
  moon: number
  event: SkyEvent | null
  /** Short human summary, e.g. "Cool season · Clear · Loy Krathong". */
  label: string
}

const SYNODIC_DAYS = 29.530588853
/** J2000.0 epoch: 2000-01-01 12:00 UTC (TT difference is negligible here). */
const J2000 = Date.UTC(2000, 0, 1, 12)
const DAY_MS = 86_400_000
/** Random event slots: one chance every two minutes, each event lasts this long. */
export const SKY_EVENT_SLOT_MS = 120_000
export const SKY_EVENT_MS = 28_000

function hash(...parts: number[]): number {
  let h = 2166136261
  for (const part of parts) { h ^= part | 0; h = Math.imul(h, 16777619); h ^= h >>> 13 }
  return (h >>> 0) / 4294967296
}

const seasonalCloudCount:Record<Season,number>={hot:2,cool:4,rainy:6}
const weatherCloudCount:Record<Weather,number>={clear:0,mist:0,cloudy:2,rain:3,storm:4}
const cloudSpan=1.34
const cloudSeeds=Array.from({length:10},(_,i)=>({
  start:(.81+i*.829)%cloudSpan,
  speed:.002+.0036*hash(i,23),
  altitude:.07+.14*hash(i,27),
  sway:hash(i,29)*Math.PI*2,
  size:.70+.68*hash(i,31),
  opacity:.72+.25*hash(i,37),
}))

/** Positions are normalized to the sky and advance on the animation clock in seconds. */
export function officeClouds(sky:Pick<OfficeSky,'season'|'weather'>,time:number){
  const count=seasonalCloudCount[sky.season]+weatherCloudCount[sky.weather]
  return cloudSeeds.slice(0,count).map(cloud=>({
    x:(cloud.start+time*cloud.speed)%cloudSpan-.17,
    y:cloud.altitude+.012*Math.sin(cloud.sway+time*.09),
    size:cloud.size,
    opacity:cloud.opacity,
  }))
}

export function skyPhase(date: Date): SkyPhase {
  const hour = date.getHours() + date.getMinutes() / 60
  return hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night'
}

export function skySeason(date: Date): Season {
  const month = date.getMonth() + 1
  return month >= 3 && month <= 5 ? 'hot' : month >= 6 && month <= 10 ? 'rainy' : 'cool'
}

/**
 * Moon age in [0, 1): 0 = new moon, 0.5 = full moon. Sun–moon elongation from the mean
 * elements plus the main periodic terms (equation of centre, evection, variation, solar
 * equation), good to a few hours — enough to land Loy Krathong on the right day.
 */
export function moonAge(date: Date): number {
  const d = (date.getTime() - J2000) / DAY_MS, rad = Math.PI / 180
  const D = 297.8501921 + 12.19074912 * d, M = 357.5291092 + 0.98560028 * d, Mp = 134.9633964 + 13.06499295 * d
  const s = (deg: number) => Math.sin(deg * rad)
  const elongation = D + 6.289 * s(Mp) + 1.274 * s(2 * D - Mp) + .658 * s(2 * D) + .214 * s(2 * Mp) - .186 * s(M) - 1.915 * s(M) - .02 * s(2 * M)
  const age = (elongation % 360) / 360
  return age < 0 ? age + 1 : age
}

/** Days to the nearest full moon (absolute). */
const daysFromFull = (date: Date) => Math.abs(moonAge(date) - .5) * SYNODIC_DAYS

/** Full-moon evening (20:00 local) nearest the full moon. */
function fullMoonEvening(year: number, monthIndex: number, day: number): boolean {
  const evening = (offset: number) => daysFromFull(new Date(year, monthIndex, day + offset, 20))
  const today = evening(0)
  return today <= 1 && today < evening(-1) && today <= evening(1)
}
/** In the 29 Oct – 28 Nov window; if two full moons fall in it, the first one counts. */
function loyKrathong(date: Date): boolean {
  const year = date.getFullYear(), start = new Date(year, 9, 29), end = new Date(year, 10, 28)
  if (date < start || date > new Date(year, 10, 28, 23, 59)) return false
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    if (fullMoonEvening(year, d.getMonth(), d.getDate())) return d.getMonth() === date.getMonth() && d.getDate() === date.getDate()
  return false
}

export function skyHoliday(date: Date): Holiday | null {
  const month = date.getMonth() + 1, day = date.getDate()
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'new-year'
  if (month === 4 && day >= 13 && day <= 15) return 'songkran'
  if (month === 12 && (day === 24 || day === 25)) return 'christmas'
  if (month === 2 && day === 14) return 'valentine'
  // Loy Krathong: the full moon of the twelfth Thai lunar month, in practice late Oct to Nov.
  // Loy Krathong: the full-moon night of the twelfth Thai lunar month, which falls between
  // 29 Oct and 28 Nov. Take the evening (20:00) nearest the full moon.
  if (loyKrathong(date)) return 'loy-krathong'
  // Halloween yields to Loy Krathong when they coincide (as on 31 Oct 2020).
  if (month === 10 && day === 31) return 'halloween'
  return null
}

/** Weather changes on the hour, weighted by season; mist only forms around dawn. */
export function skyWeather(date: Date): Weather {
  const season = skySeason(date), phase = skyPhase(date)
  const roll = hash(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 7)
  const table: Record<Season, [Weather, number][]> = {
    hot: [['clear', .72], ['cloudy', .2], ['storm', .08]],
    rainy: [['rain', .4], ['storm', .1], ['cloudy', .28], ['clear', .22]],
    cool: [['clear', .62], ['mist', .2], ['cloudy', .18]],
  }
  let acc = 0
  for (const [weather, weight] of table[season]) {
    acc += weight
    if (roll < acc) return weather === 'mist' && phase !== 'dawn' ? 'clear' : weather
  }
  return 'clear'
}

/** The painted paths dry for 45 minutes after an hourly rain or storm ends. */
export function gardenWetness(date:Date,weather=skyWeather(date)){
  if(weather==='rain'||weather==='storm')return 1
  const minutes=date.getMinutes()+(date.getSeconds()+date.getMilliseconds()/1000)/60
  if(minutes>=45)return 0
  const previous=skyWeather(new Date(date.getTime()-3_600_000))
  if(previous!=='rain'&&previous!=='storm')return 0
  const remaining=1-minutes/45
  return remaining*remaining*(3-2*remaining)
}

/** Random sky event for the current two-minute slot, filtered by time of day and weather. */
export function skyEventKinds(season: Season, phase: SkyPhase): SkyEventKind[] {
  if (phase === 'night') return ['shooting-star', 'shooting-star', 'night-plane', 'ufo', ...(season === 'rainy' ? ['fireflies' as const, 'fireflies' as const] : [])]
  return ['balloon', 'birds', 'birds', 'plane', 'cat', 'drone', ...(season === 'hot' ? ['kite' as const, 'butterflies' as const] : season === 'cool' ? ['kite' as const, 'leaves' as const] : ['butterflies' as const])]
}

export function skyEvent(date: Date, phase = skyPhase(date), weather = skyWeather(date)): SkyEvent | null {
  const t = date.getTime()
  // A rainbow follows rain: first 20 minutes of a dry daytime hour after a wet one.
  const hourAgo = new Date(t - 3_600_000)
  if (phase === 'day' && (weather === 'clear' || weather === 'cloudy') && date.getMinutes() < 20 && ['rain', 'storm'].includes(skyWeather(hourAgo)))
    return { kind: 'rainbow', progress: (date.getMinutes() * 60 + date.getSeconds()) / 1200, seed: hash(hourAgo.getHours(), 3) }
  if (weather === 'rain' || weather === 'storm') return null
  const slot = Math.floor(t / SKY_EVENT_SLOT_MS), roll = hash(slot, 11)
  if (roll > .6) return null
  const start = slot * SKY_EVENT_SLOT_MS + hash(slot, 13) * (SKY_EVENT_SLOT_MS - SKY_EVENT_MS)
  const progress = (t - start) / SKY_EVENT_MS
  if (progress < 0 || progress >= 1) return null
  const kinds = skyEventKinds(skySeason(date), phase).filter(kind => kind !== 'ufo' || hash(slot, 17) < .15)
  return { kind: kinds[Math.floor(hash(slot, 19) * kinds.length)], progress, seed: hash(slot, 23) }
}

const SEASON_LABEL: Record<Season, string> = { hot: 'Hot season', rainy: 'Rainy season', cool: 'Cool season' }
const WEATHER_LABEL: Record<Weather, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', mist: 'Morning mist' }
const HOLIDAY_LABEL: Record<Holiday, string> = { 'new-year': 'New Year', songkran: 'Songkran', 'loy-krathong': 'Loy Krathong', halloween: 'Halloween', christmas: 'Christmas', valentine: "Valentine's Day" }

export function officeSky(date: Date): OfficeSky {
  const phase = skyPhase(date), season = skySeason(date), weather = skyWeather(date), holiday = skyHoliday(date)
  return {
    phase, season, weather, holiday, moon: moonAge(date), event: skyEvent(date, phase, weather),
    label: [SEASON_LABEL[season], WEATHER_LABEL[weather], holiday ? HOLIDAY_LABEL[holiday] : ''].filter(Boolean).join(' · '),
  }
}

/** Toolbar glyph for the sky: holiday first, then weather, then time of day. */
export function officeSkyIcon(sky: OfficeSky): string {
  const holiday: Record<Holiday, string> = { 'new-year': '🎆', songkran: '💦', 'loy-krathong': '🏮', halloween: '🎃', christmas: '🎄', valentine: '💕' }
  if (sky.holiday) return holiday[sky.holiday]
  if (sky.weather === 'storm') return '⛈'
  if (sky.weather === 'rain') return '🌧'
  if (sky.weather === 'mist') return '🌫'
  if (sky.weather === 'cloudy') return '⛅'
  return sky.phase === 'night' ? '☾' : '☀'
}
