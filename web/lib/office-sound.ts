/** Optional, local-only Office ambience. Never create this context outside a user gesture. */
export type OfficeSoundCue = 'paper' | 'wood'
export interface OfficeSoundState { active: boolean; night: boolean; wet: boolean }
interface Options { createContext?: (() => AudioContext) | null; now?: () => number }

function browserContextFactory(): (() => AudioContext) | null {
  if (typeof window === 'undefined') return null
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Context ? () => new Context() : null
}

export class OfficeSound {
  private readonly factory: (() => AudioContext) | null
  private readonly now: () => number
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rain: GainNode | null = null
  private noise: AudioBuffer | null = null
  private sources = new Set<AudioScheduledSourceNode>()
  private cueCleanup = new Map<AudioScheduledSourceNode, () => void>()
  private state: OfficeSoundState = { active: false, night: false, wet: false }
  private disposed = false
  private failed = false
  private on = false
  private lastCue = -Infinity
  private queue: Promise<void> = Promise.resolve()

  constructor(options: Options = {}) {
    this.factory = options.createContext === undefined ? browserContextFactory() : options.createContext
    this.now = options.now ?? (() => performance.now())
  }
  get enabled() { return this.on }
  get available() { return !!this.factory && !this.failed && !this.disposed }
  private get audible() { return this.on && this.state.active && !this.disposed }

  update(state: OfficeSoundState): void {
    const activeChanged = this.state.active !== state.active
    this.state = state
    this.applyGain()
    if (activeChanged && this.ctx) void this.reconcile()
  }

  /** The sole enabling/context-creation path. Call directly from a click, never an effect. */
  async toggleFromGesture(): Promise<boolean> {
    if (this.disposed || !this.available) return false
    this.on = !this.on
    try {
      if (this.on && !this.ctx) this.initialize()
      this.applyGain()
      await this.reconcile()
    } catch {
      this.on = false
      this.failed = true
      this.applyGain()
      if (this.ctx) void this.ctx.close().catch(() => {})
    }
    return this.on
  }

  private initialize() {
    const ctx = this.factory!()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    this.rain = ctx.createGain()
    this.rain.gain.value = 0
    this.rain.connect(this.master)
    // One second of mono noise, fixed 24,000 samples / 96 KB, reused by every cue.
    this.noise = ctx.createBuffer(1, 24000, 24000)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const source = ctx.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1300
    source.connect(filter)
    filter.connect(this.rain)
    this.sources.add(source)
    source.start()
  }

  private applyGain() {
    if (!this.ctx || !this.master || !this.rain) return
    if (!this.audible) {
      for (const [source, cleanup] of this.cueCleanup) {
        try { source.stop() } catch { /* Already ended. */ }
        cleanup()
      }
    }
    const at = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(at)
    this.master.gain.setValueAtTime(this.audible && this.ctx.state === 'running' ? (this.state.night ? 0.025 : 0.06) : 0, at)
    this.rain.gain.setValueAtTime(this.audible && this.state.wet ? 0.1 : 0, at)
  }

  private reconcile(): Promise<void> {
    // Serialize suspend/resume: late browser promises can never restore stale gain.
    this.queue = this.queue.then(async () => {
      const ctx = this.ctx
      if (!ctx || this.disposed) return
      if (this.audible) {
        await ctx.resume()
        this.applyGain()
        if (!this.audible && ctx.state !== 'closed') await ctx.suspend()
      } else {
        this.applyGain()
        if (ctx.state !== 'closed') await ctx.suspend()
      }
    }).catch(() => {
      this.on = false
      this.applyGain()
    })
    return this.queue
  }

  /** Call only for real user interactions / real door openings, never inferred tool events. */
  playCue(cue: OfficeSoundCue): boolean {
    const ctx = this.ctx
    const now = this.now()
    if (!this.audible || !ctx || ctx.state !== 'running' || now - this.lastCue < 800) return false
    this.lastCue = now
    const source = ctx.createBufferSource()
    source.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = cue === 'paper' ? 'bandpass' : 'lowpass'
    filter.frequency.value = cue === 'paper' ? 2200 : 260
    filter.Q.value = 0.6
    const envelope = ctx.createGain()
    const duration = cue === 'paper' ? 0.12 : 0.18
    envelope.gain.setValueAtTime(0, ctx.currentTime)
    envelope.gain.linearRampToValueAtTime(cue === 'paper' ? 0.18 : 0.4, ctx.currentTime + 0.008)
    envelope.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.master!)
    this.sources.add(source)
    const cleanup = () => {
      this.cueCleanup.delete(source)
      this.sources.delete(source)
      source.disconnect(); filter.disconnect(); envelope.disconnect()
    }
    this.cueCleanup.set(source, cleanup)
    source.onended = cleanup
    source.start()
    source.stop(ctx.currentTime + duration)
    return true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.on = false
    this.applyGain()
    for (const source of this.sources) {
      try { source.stop() } catch { /* Already ended. */ }
      source.disconnect()
    }
    this.sources.clear()
    this.master?.disconnect()
    this.rain?.disconnect()
    this.noise = null
    if (this.ctx) void this.ctx.close().catch(() => {})
  }
}
