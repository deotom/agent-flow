export type OfficeLiveliness = 'quiet' | 'normal' | 'lively'

export interface OfficeLivelinessPolicy {
 readonly mode: OfficeLiveliness
 readonly night: boolean
 readonly outingLimit: number
 readonly outingGapMs: readonly [number,number]
 /** Multiply optional interval duration, never source work or scheduled meals. */
 readonly socialCadenceMultiplier: number
 readonly objectCadenceMultiplier: number
}

export function officeLiveliness(value:unknown):OfficeLiveliness {
 return value==='quiet'||value==='lively'||value==='normal'?value:'normal'
}

/** Cosmetic activity only. Pause/reduced motion and scheduled meal ownership remain upstream. */
export function officeLivelinessPolicy(value:unknown,night:boolean):OfficeLivelinessPolicy {
 const mode=officeLiveliness(value)
 const gap:readonly [number,number]=mode==='quiet'?[180000,300000]:mode==='lively'?(night?[150000,240000]:[45000,75000]):night?[180000,300000]:[60000,100000]
 const cadence=(mode==='quiet'?2:mode==='lively'?.75:1)*(night?2:1)
 return Object.freeze({mode,night,outingLimit:mode==='quiet'?(night?0:1):night?1:2,outingGapMs:Object.freeze(gap),socialCadenceMultiplier:cadence,objectCadenceMultiplier:cadence})
}
