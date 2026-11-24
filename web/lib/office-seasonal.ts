import { officeSky, type Holiday, type Season } from './office-sky'
import type { OfficeLeisureAction, OfficeFloor } from './office-types'

export interface OfficeSeasonalActivity { label: string; action: OfficeLeisureAction }
export type OfficeHolidayGardenAction = 'krathong' | 'water-play' | 'sparkler' | 'gift-carol' | 'trick-treat' | 'flower-gift'
export interface OfficeGardenHolidayActivity { holiday: Holiday; prop: OfficeHolidayGardenAction; activity: string }

const gardenFestivals: Record<Holiday, { prop: OfficeHolidayGardenAction; captions: readonly [string, string] }> = {
  'loy-krathong': { prop: 'krathong', captions: ['is floating a krathong in the garden', 'is lighting a Loy Krathong lantern'] },
  songkran: { prop: 'water-play', captions: ['is celebrating Songkran with jasmine water', 'is splashing water in the garden'] },
  christmas: { prop: 'gift-carol', captions: ['is exchanging Christmas gifts', 'is singing Christmas carols'] },
  halloween: { prop: 'trick-treat', captions: ['is sharing Halloween treats', "is carrying a jack-o'-lantern"] },
  'new-year': { prop: 'sparkler', captions: ['is lighting a New Year sparkler', 'is celebrating the New Year'] },
  valentine: { prop: 'flower-gift', captions: ['is gifting Valentine flowers', 'is sharing Valentine chocolates'] },
}

export function officeGardenHolidayActivity(date: Date, slot = 0): OfficeGardenHolidayActivity | null {
  const holiday = officeSky(date).holiday
  if (!holiday) return null
  const entry = gardenFestivals[holiday]
  const index = Number.isFinite(slot) ? ((Math.trunc(slot) % 2) + 2) % 2 : 0
  return { holiday, prop: entry.prop, activity: entry.captions[index] }
}
const festivals: Record<Holiday, OfficeSeasonalActivity> = {
  'new-year': { label: 'New Year · celebration snacks', action: 'snack' },
  songkran: { label: 'Songkran · water play', action: 'water' },
  'loy-krathong': { label: 'Loy Krathong · lotus garden', action: 'water' },
  halloween: { label: 'Halloween · trick or treat', action: 'snack' },
  christmas: { label: 'Christmas · music and gifts', action: 'music' },
  valentine: { label: 'Valentine · chocolate picnic', action: 'snack' },
}
const seasonal: Record<Season, readonly OfficeSeasonalActivity[]> = {
  hot: [{label:'Summer · iced drink break',action:'coffee'},{label:'Summer · watering plants',action:'water'},{label:'Summer · fruit picnic',action:'snack'}],
  rainy: [{label:'Rainy season · reading club',action:'book'},{label:'Rainy season · board games',action:'game'},{label:'Rainy season · warm drinks',action:'coffee'}],
  cool: [{label:'Cool season · acoustic corner',action:'music'},{label:'Cool season · cozy reading',action:'book'},{label:'Cool season · warm cocoa',action:'coffee'}],
}
/** Cosmetic activities only: the local date/hour selects a stable, varied invitation. */
export function officeSeasonalActivity(date: Date): OfficeSeasonalActivity {
  const sky = officeSky(date)
  if (sky.holiday) return festivals[sky.holiday]
  const choices = seasonal[sky.season]
  return choices[(date.getDate() + date.getHours()) % choices.length]
}

export function officeSeasonalObjects(floor: OfficeFloor, width: number, date: Date) {
  if (floor.kind !== 'break' || floor.desktopArt) return []
  const activity = officeSeasonalActivity(date)
  return [{kind:activity.action,label:activity.label,x:width*.12,y:floor.y+(floor.height??width*.5625)*.79}]
}
