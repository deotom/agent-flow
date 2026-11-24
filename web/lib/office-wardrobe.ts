import { officeSky, type Holiday, type Season, type Weather } from './office-sky'

/** Resolve once per painted frame, then share with every actor. Cosmetic only. */
export interface OfficeWardrobeTheme { season: Season; holiday: Holiday | null; weather: Weather }
export interface OfficeWardrobeLook extends OfficeWardrobeTheme {
  layer: 'light' | 'cardigan' | 'rain-poncho' | 'knit'
  accent: string
  trim: string
  variant: number
  outdoor: boolean
}
const accents:Record<Season,readonly string[]>={
  hot:['#bb823e','#478c83','#ae6154'],
  rainy:['#427c86','#88637f','#698452'],
  cool:['#ae734d','#617c86','#97714e'],
}
const holidayTrim:Record<Holiday,string>={
  'new-year':'#d6ae55',songkran:'#58b1b7','loy-krathong':'#c69b46',
  halloween:'#bc7938',christmas:'#b6544c',valentine:'#ba627e',
}
export function officeWardrobeTheme(date:Date):OfficeWardrobeTheme {
  const {season,holiday,weather}=officeSky(date)
  return {season,holiday,weather}
}
export function officeWardrobeFor(theme:OfficeWardrobeTheme,slot:number,outdoor:boolean):OfficeWardrobeLook {
  const variant=Number.isFinite(slot)?((Math.trunc(slot)%3)+3)%3:0
  // Even dry rainy-season hours retain a light protective shoulder layer outdoors.
  const layer=theme.season==='hot'?'light':theme.season==='cool'?'knit':outdoor?'rain-poncho':'cardigan'
  return {...theme,layer,accent:accents[theme.season][variant],trim:theme.holiday?holidayTrim[theme.holiday]:'#d7bb7f',variant,outdoor}
}
