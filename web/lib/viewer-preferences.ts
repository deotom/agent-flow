export type AnimationMode = 'full' | 'low' | 'off'
export function shouldAutoSelectSession(locked: boolean, selected: string | null): boolean { return !locked || !selected }
export function animationFrameInterval(mode: AnimationMode): number { return mode === 'low' ? 1000 / 24 : mode === 'off' ? 1000 / 12 : 1000 / 60 }
export function transcriptPage<T>(messages: T[], count: number): T[] { return messages.slice(-Math.max(100, count)) }
