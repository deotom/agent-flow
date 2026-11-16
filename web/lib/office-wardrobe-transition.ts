import { officeWardrobeFor, type OfficeWardrobeLook, type OfficeWardrobeTheme } from './office-wardrobe'

export const OFFICE_WARDROBE_CHANGE_MS=650
export interface OfficeWardrobeTransitionActor {
  key:string
  theme:OfficeWardrobeTheme
  slot:number
  outdoor:boolean
  /** Actual doorway/landing proximity, never inferred just from a changed floor ID. */
  atEntrance:boolean
  inLift?:boolean
  hidden?:boolean
  /** True only when the left hand has no object, climbing, typing or other incompatible pose. */
  freeHand?:boolean
}
export interface OfficeWardrobeTransitionState {
  readonly from:OfficeWardrobeLook
  readonly to:OfficeWardrobeLook
  readonly progress:number
  readonly at:number
}
export interface OfficeWardrobeTransitionLook {
  from:OfficeWardrobeLook
  to:OfficeWardrobeLook
  /** Draw from with alpha 1-progress and to with alpha progress. */
  progress:number
  /** Smooth 0..1 collar-adjustment weight for the free left hand only. */
  dressing:number
}
export interface OfficeWardrobeTransitionFrame {
  store:Map<string,OfficeWardrobeTransitionState>
  looks:Map<string,OfficeWardrobeTransitionLook>
}
function sameGarment(a:OfficeWardrobeLook,b:OfficeWardrobeLook):boolean {
  // Hourly weather metadata alone does not change the garment's painted appearance.
  return a.layer===b.layer&&a.accent===b.accent&&a.trim===b.trim&&a.variant===b.variant&&a.holiday===b.holiday&&a.season===b.season
}

/** Pure cosmetic frame reducer. Feed the existing paused motion clock in milliseconds.
 * Outdoor protection changes start at an entrance; calendar changes refresh in place.
 * An active fade can finish while walking but
 * freezes in a hidden room/cabin. Reversal preserves the exact two-layer mixture;
 * a third target waits for completion so no already-visible layer vanishes abruptly.
 */
export function officeWardrobeTransitionFrame(
  previous:ReadonlyMap<string,OfficeWardrobeTransitionState>|undefined,
  actors:readonly OfficeWardrobeTransitionActor[],
  at:number,
):OfficeWardrobeTransitionFrame {
  const store=new Map<string,OfficeWardrobeTransitionState>(),looks=new Map<string,OfficeWardrobeTransitionLook>()
  for(const actor of actors){
    const old=previous?.get(actor.key),clock=Number.isFinite(at)?at:old?.at??0
    const desired=officeWardrobeFor(actor.theme,actor.slot,actor.outdoor)
    const calendarChanged=Boolean(old&&(old.to.season!==desired.season||old.to.holiday!==desired.holiday))
    // Calendar decorations can refresh in place; only indoor/outdoor protection
    // waits for the entrance. Never interrupt a hidden/cabin frame.
    const blocked=Boolean(actor.inLift||actor.hidden),canChange=(actor.atEntrance||calendarChanged)&&!blocked
    let from=old?.from??desired,to=old?.to??desired,progress=old?.progress??1
    if(old&&!blocked&&progress<1)progress=Math.min(1,progress+Math.max(0,clock-old.at)/OFFICE_WARDROBE_CHANGE_MS)
    if(progress>=1){
      from=to
      if(canChange&&!sameGarment(to,desired)){from=to;to=desired;progress=0}
    }else if(canChange&&sameGarment(from,desired)){
      const priorFrom=from;from=to;to=priorFrom;progress=1-progress
    }
    const state:OfficeWardrobeTransitionState={from,to,progress,at:clock}
    store.set(actor.key,state)
    const dressing=actor.atEntrance&&!blocked&&actor.freeHand&&progress>0&&progress<1?Math.sin(Math.PI*progress):0
    looks.set(actor.key,{from,to,progress,dressing})
  }
  // Building fresh maps also prunes removed actors without mutating the prior frame.
  return {store,looks}
}
