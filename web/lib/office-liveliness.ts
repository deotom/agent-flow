import type { AnimationMode } from './viewer-preferences'

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

/** Frame interval in ms: full motion while busy, calmer cadence when stationary. */
export function officeFrameInterval(mode: AnimationMode, busy: boolean): number {
 if (busy) return mode === 'low' ? 1000 / 24 : 1000 / 45
 return mode === 'low' ? 1000 / 10 : 1000 / 15
}

/** Canvas pixel ratio capped to keep HiDPI sharpness without excessive backing-store RAM. */
export function officeCanvasScale(clientWidth: number, sceneWidth: number, dpr: number, maxRatio = 2): number {
 const safeScene = Math.max(1, sceneWidth || 1)
 const raw = ((clientWidth || safeScene) * (dpr || 1)) / safeScene
 return Math.max(1, Math.min(maxRatio, Math.ceil(raw * 4) / 4))
}

/** Cosmetic activity only. Pause/reduced motion and scheduled meal ownership remain upstream. */
export function officeLivelinessPolicy(value:unknown,night:boolean):OfficeLivelinessPolicy {
 const mode=officeLiveliness(value)
 const gap:readonly [number,number]=mode==='quiet'?[180000,300000]:mode==='lively'?(night?[150000,240000]:[45000,75000]):night?[180000,300000]:[60000,100000]
 const cadence=(mode==='quiet'?2:mode==='lively'?.75:1)*(night?2:1)
 return Object.freeze({mode,night,outingLimit:mode==='quiet'?(night?0:1):night?1:2,outingGapMs:Object.freeze(gap),socialCadenceMultiplier:cadence,objectCadenceMultiplier:cadence})
}
