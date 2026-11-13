import { officeSky, type Holiday, type Season } from './office-sky'
import type { OfficeLeisureAction, OfficeFloor } from './office-types'

export interface OfficeSeasonalActivity { label: string; action: OfficeLeisureAction }
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
  if (floor.kind !== 'break') return []
  const activity = officeSeasonalActivity(date)
  return [{kind:activity.action,label:activity.label,x:width*.12,y:floor.y+(floor.height??width*.5625)*.79}]
}
