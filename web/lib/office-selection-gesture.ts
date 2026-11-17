import type {OfficePose} from './office-types'
export interface OfficeSelectionCue {actorKey:string;startedAt:number}
/** Head only: never changes feet, tool contacts, task state or facing. */
export function officeSelectionGesture(key:string,pose:OfficePose|undefined,cue:OfficeSelectionCue|null|undefined,time:number,enabled:boolean):number{
 if(!enabled||!cue||key!==cue.actorKey||pose?.walk||pose?.climb||pose?.inLift||(pose?.opacity??1)<.8)return 0
 const progress=(time-cue.startedAt)/.85
 return progress>0&&progress<1?Math.sin(progress*Math.PI)**2:0
}
