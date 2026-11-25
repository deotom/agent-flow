import type { Holiday, Season, SkyPhase, Weather } from './office-sky'
import type { OfficeLiveliness } from './office-liveliness'

/** Optional, local-only Office ambience. Never create this context outside a user gesture. */
export type OfficeSoundCue = 'paper' | 'wood' | 'attention' | 'holiday'
export type OfficeAmbientMotif = 'bird' | 'cricket' | 'raindrop' | 'thunder' | 'chime' | 'workshop'
export interface OfficeSoundState {
  active: boolean
  night: boolean
  wet: boolean
  phase?: SkyPhase
  weather?: Weather
  season?: Season
  holiday?: Holiday | null
  liveliness?: OfficeLiveliness
  working?: boolean
}
interface Options {
  createContext?: (() => AudioContext) | null
  now?: () => number
  random?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

const HOLIDAY_SCALES: Record<Holiday, readonly number[]> = {
  'loy-krathong': [587.33, 659.25, 783.99, 880.00, 1046.50], // serene lotus bell pentatonic
  songkran: [523.25, 587.33, 659.25, 783.99, 1046.50],       // bright cheerful major pentatonic
  christmas: [659.25, 783.99, 987.77, 1046.50, 1318.51],     // crisp winter celesta
  halloween: [440.00, 523.25, 622.25, 659.25, 783.99],       // cozy twilight minor/mysterious
  'new-year': [587.33, 739.99, 880.00, 1174.66, 1479.98],    // sparkling D-major chime
  valentine: [523.25, 659.25, 783.99, 987.77, 1174.66],      // warm Cmaj9 harp shimmer
}
const DEFAULT_SCALE: readonly number[] = [587.33, 659.25, 739.99, 880.00, 1174.66]

export function chooseAmbientMotif(state: OfficeSoundState, rng: number): OfficeAmbientMotif {
  const r = Number.isFinite(rng) ? Math.max(0, Math.min(0.999999, rng)) : 0
  const busy = Boolean(state.working && state.liveliness !== 'quiet')
  if (state.wet) {
    if (state.weather === 'storm') {
      if (r < 0.28) return 'thunder'
      if (r < 0.76) return 'raindrop'
      if (r < 0.90) return 'chime'
      return busy ? 'workshop' : 'raindrop'
    }
    if (r < 0.60) return 'raindrop'
    if (r < (state.holiday ? 0.86 : 0.82)) return 'chime'
    return busy ? 'workshop' : 'raindrop'
  }
  if (state.night || state.phase === 'night') {
    if (state.holiday) return r < 0.52 ? 'cricket' : 'chime'
    if (r < 0.72) return 'cricket'
    if (r < 0.94) return 'chime'
    return busy ? 'workshop' : 'cricket'
  }
  if (state.phase === 'dusk') {
    if (state.holiday) return r < 0.35 ? 'cricket' : r < 0.80 ? 'chime' : 'bird'
    return r < 0.45 ? 'cricket' : r < 0.80 ? 'chime' : 'bird'
  }
  if (state.holiday) {
    if (r < 0.38) return 'bird'
    if (r < 0.84) return 'chime'
    return busy ? 'workshop' : 'bird'
  }
  if (r < 0.58) return 'bird'
  if (r < 0.82) return 'chime'
  return busy ? 'workshop' : 'bird'
}

function browserContextFactory(): (() => AudioContext) | null {
  if (typeof window === 'undefined') return null
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Context ? () => new Context() : null
}

function setGain(param: AudioParam, target: number, at: number, fade = 0.12): void {
  const prev = Number.isFinite(param.value) ? param.value : 0
  param.cancelScheduledValues(at)
  if (target <= 0 || fade <= 0) {
    param.setValueAtTime(0, at)
    return
  }
  param.setValueAtTime(prev, at)
  param.linearRampToValueAtTime(target, at + fade)
}

export class OfficeSound {
  private readonly factory: (() => AudioContext) | null
  private readonly now: () => number
  private readonly random: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rain: GainNode | null = null
  private breeze: GainNode | null = null
  private room: GainNode | null = null
  private rainFilter: BiquadFilterNode | null = null
  private breezeFilter: BiquadFilterNode | null = null
  private roomFilter: BiquadFilterNode | null = null
  private noise: AudioBuffer | null = null
  private sources = new Set<AudioScheduledSourceNode>()
  private cueCleanup = new Map<AudioScheduledSourceNode, () => void>()
  private state: OfficeSoundState = { active: false, night: false, wet: false }
  private vol = 0.65
  private breezeBaseFreq = 420
  private breezeBaseGain = 0
  private ambientTimer: unknown = null
  private disposed = false
  private failed = false
  private on = false
  private lastCue = -Infinity
  private queue: Promise<void> = Promise.resolve()

  constructor(options: Options = {}) {
    this.factory = options.createContext === undefined ? browserContextFactory() : options.createContext
    this.now = options.now ?? (() => performance.now())
    this.random = options.random ?? (() => Math.random())
    this.setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>))
  }
  get enabled() { return this.on }
  get available() { return !!this.factory && !this.failed && !this.disposed }
  get volume() { return this.vol }
  private get audible() { return this.on && this.state.active && !this.disposed }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return
    this.vol = Math.max(0.1, Math.min(1, value))
    this.applyGain()
  }

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
    // Preserve gain indices: [0]=master, [1]=rain, [2]=breeze, [3]=room.
    this.rain = ctx.createGain()
    this.rain.gain.value = 0
    this.rain.connect(this.master)
    this.breeze = ctx.createGain()
    this.breeze.gain.value = 0
    this.breeze.connect(this.master)
    this.room = ctx.createGain()
    this.room.gain.value = 0
    this.room.connect(this.master)

    // One second of seamless loopable pink-shaped mono noise, 24,000 samples / 96 KB, reused by all beds & cues.
    const length = 24000
    const overlap = 1024
    this.noise = ctx.createBuffer(1, length, length)
    const data = this.noise.getChannelData(0)
    const raw = new Float32Array(length + overlap)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < overlap; i++) {
      const w = this.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
    }
    for (let i = 0; i < raw.length; i++) {
      const w = this.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
      raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18
    }
    for (let i = 0; i < length; i++) {
      let sample = raw[i]
      if (i < overlap) {
        const fade = 0.5 - 0.5 * Math.cos((Math.PI * i) / overlap)
        sample = raw[length + i] * (1 - fade) + sample * fade
      }
      data[i] = Math.max(-0.75, Math.min(0.75, sample))
    }

    const source = ctx.createBufferSource()
    source.buffer = this.noise
    source.loop = true

    this.rainFilter = ctx.createBiquadFilter()
    this.rainFilter.type = 'lowpass'
    this.rainFilter.frequency.value = 1150
    this.rainFilter.Q.value = 0.55
    source.connect(this.rainFilter)
    this.rainFilter.connect(this.rain)

    this.breezeFilter = ctx.createBiquadFilter()
    this.breezeFilter.type = 'bandpass'
    this.breezeFilter.frequency.value = 420
    this.breezeFilter.Q.value = 0.85
    source.connect(this.breezeFilter)
    this.breezeFilter.connect(this.breeze)

    this.roomFilter = ctx.createBiquadFilter()
    this.roomFilter.type = 'lowpass'
    this.roomFilter.frequency.value = 155
    this.roomFilter.Q.value = 0.5
    source.connect(this.roomFilter)
    this.roomFilter.connect(this.room)

    this.sources.add(source)
    source.start()
  }

  private clearAmbientTimer() {
    if (this.ambientTimer !== null) {
      this.clearTimer(this.ambientTimer)
      this.ambientTimer = null
    }
  }

  private applyGain() {
    if (!this.ctx || !this.master || !this.rain || !this.breeze || !this.room) return
    const at = this.ctx.currentTime
    if (!this.audible) {
      this.clearAmbientTimer()
      for (const [source, cleanup] of [...this.cueCleanup.entries()]) {
        try { source.stop() } catch { /* Already ended. */ }
        cleanup()
      }
      this.breezeBaseGain = 0
      setGain(this.master.gain, 0, at, 0)
      setGain(this.rain.gain, 0, at, 0)
      setGain(this.breeze.gain, 0, at, 0)
      setGain(this.room.gain, 0, at, 0)
      return
    }
    const running = this.ctx.state === 'running'
    const livelinessScale = this.state.liveliness === 'quiet' ? 0.78 : this.state.liveliness === 'lively' ? 1.15 : 1
    const masterTarget = running ? (this.state.night ? 0.045 : 0.09) * livelinessScale * (this.vol / 0.65) : 0
    const rainTarget = running && this.state.wet ? (this.state.weather === 'storm' ? 0.38 : 0.26) : 0
    const breezeTarget = running ? (this.state.wet ? 0.10 : this.state.night ? 0.16 : 0.22) : 0
    const roomTarget = running ? (this.state.night ? 0.08 : this.state.working ? 0.14 : 0.10) : 0
    const rainFreq = this.state.weather === 'storm' ? 1550 : 1150
    const breezeFreq = this.state.night || this.state.phase === 'night'
      ? 300
      : this.state.weather === 'mist' || this.state.phase === 'dawn' || this.state.phase === 'dusk'
        ? 360
        : this.state.season === 'hot'
          ? 480
          : 420
    this.breezeBaseFreq = breezeFreq
    this.breezeBaseGain = breezeTarget
    this.rainFilter?.frequency.setValueAtTime(rainFreq, at)
    this.breezeFilter?.frequency.setValueAtTime(breezeFreq, at)
    setGain(this.master.gain, masterTarget, at)
    setGain(this.rain.gain, rainTarget, at)
    setGain(this.breeze.gain, breezeTarget, at)
    setGain(this.room.gain, roomTarget, at)
    if (running) this.scheduleAmbient(true)
  }

  private scheduleAmbient(initial = false) {
    if (!this.audible || this.ctx?.state !== 'running' || this.ambientTimer !== null) return
    const nightMul = this.state.night ? 1.25 : 1
    const r = this.random()
    const baseMs = initial
      ? 2200 + r * 1400
      : this.state.liveliness === 'quiet'
        ? 9500 + r * 6000
        : this.state.liveliness === 'lively'
          ? 3000 + r * 2800
          : 4800 + r * 4000
    this.ambientTimer = this.setTimer(() => {
      this.ambientTimer = null
      if (!this.audible || !this.ctx || this.ctx.state !== 'running') return
      const at = this.ctx.currentTime
      const drift = 0.86 + this.random() * 0.28
      if (this.breeze && this.breezeBaseGain > 0) setGain(this.breeze.gain, this.breezeBaseGain * drift, at, 2.4)
      if (this.breezeFilter) {
        this.breezeFilter.frequency.cancelScheduledValues(at)
        this.breezeFilter.frequency.setValueAtTime(Number.isFinite(this.breezeFilter.frequency.value) ? this.breezeFilter.frequency.value : this.breezeBaseFreq, at)
        this.breezeFilter.frequency.linearRampToValueAtTime(this.breezeBaseFreq * drift, at + 2.4)
      }
      this.playAmbientMotif(chooseAmbientMotif(this.state, this.random()))
      this.scheduleAmbient(false)
    }, Math.round(baseMs * nightMul))
  }

  private trackTransient(source: AudioScheduledSourceNode, extraNodes: AudioNode[]) {
    this.sources.add(source)
    const cleanup = () => {
      this.cueCleanup.delete(source)
      this.sources.delete(source)
      source.disconnect()
      for (const node of extraNodes) node.disconnect()
    }
    this.cueCleanup.set(source, cleanup)
    source.onended = cleanup
  }

  private playTone(freqStart: number, freqEnd: number, delay: number, duration: number, peak: number, type: OscillatorType = 'sine', filterSpec?: { type: BiquadFilterType; freq: number; q?: number }) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    const envelope = ctx.createGain()
    const filter = filterSpec ? ctx.createBiquadFilter() : null
    const start = ctx.currentTime + delay
    osc.type = type
    osc.frequency.setValueAtTime(freqStart, start)
    if (freqEnd !== freqStart) osc.frequency.linearRampToValueAtTime(freqEnd, start + duration)
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + Math.min(0.025, duration * 0.25))
    envelope.gain.linearRampToValueAtTime(0, start + duration)
    if (filter && filterSpec) {
      filter.type = filterSpec.type
      filter.frequency.value = filterSpec.freq
      if (filterSpec.q !== undefined) filter.Q.value = filterSpec.q
      osc.connect(filter)
      filter.connect(envelope)
      envelope.connect(this.master)
      this.trackTransient(osc, [filter, envelope])
    } else {
      osc.connect(envelope)
      envelope.connect(this.master)
      this.trackTransient(osc, [envelope])
    }
    osc.start(start)
    osc.stop(start + duration)
  }

  private playNoiseBurst(delay: number, duration: number, attack: number, peak: number, filterType: BiquadFilterType, freq: number, q = 0.7) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const source = ctx.createBufferSource()
    source.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = freq
    filter.Q.value = q
    const envelope = ctx.createGain()
    const start = ctx.currentTime + delay
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + Math.min(attack, duration * 0.45))
    envelope.gain.linearRampToValueAtTime(0, start + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.master)
    this.trackTransient(source, [filter, envelope])
    source.start(start)
    source.stop(start + duration)
  }

  private playAmbientMotif(motif: OfficeAmbientMotif) {
    if (!this.ctx || !this.master) return
    if (motif === 'bird') {
      const count = this.random() > 0.45 ? 3 : 2
      const base = 1760 + this.random() * 680
      for (let i = 0; i < count; i++) {
        const up = i % 2 === 0 ? 1.18 : 0.88
        this.playTone(base, base * up, i * 0.14, 0.085, 0.20, 'sine', { type: 'lowpass', freq: 3200 })
      }
    } else if (motif === 'cricket') {
      const freq = 3950 + this.random() * 350
      for (let i = 0; i < 3; i++) {
        this.playTone(freq, freq, i * 0.09, 0.042, 0.11, 'sine', { type: 'bandpass', freq: 4100, q: 3 })
      }
    } else if (motif === 'raindrop') {
      const count = this.random() > 0.55 ? 2 : 1
      for (let i = 0; i < count; i++) {
        const f = 540 + this.random() * 280
        this.playTone(f, f * 1.45, i * 0.22, 0.05, 0.18, 'sine')
      }
    } else if (motif === 'thunder') {
      this.playNoiseBurst(0, 1.9, 0.55, 0.42, 'lowpass', 95, 0.8)
    } else if (motif === 'chime') {
      const scale = this.state.holiday ? HOLIDAY_SCALES[this.state.holiday] : DEFAULT_SCALE
      const count = this.state.holiday ? 2 : 1
      for (let i = 0; i < count; i++) {
        const freq = scale[Math.floor(this.random() * scale.length) % scale.length]
        this.playTone(freq, freq, i * 0.24, 0.95, 0.18, 'sine')
        this.playTone(freq * 2.756, freq * 2.756, i * 0.24, 0.45, 0.032, 'sine')
      }
    } else {
      const count = this.random() > 0.5 ? 3 : 2
      for (let i = 0; i < count; i++) {
        this.playNoiseBurst(i * 0.11, 0.024, 0.004, 0.11, 'bandpass', 950, 1.4)
      }
    }
  }

  private playHolidayCue(holiday: Holiday | null) {
    if (holiday === 'songkran') {
      this.playNoiseBurst(0, 0.16, 0.015, 0.28, 'bandpass', 1400, 0.7)
      this.playTone(620, 930, 0.05, 0.075, 0.24, 'sine')
      this.playTone(840, 1240, 0.13, 0.075, 0.20, 'sine')
    } else if (holiday === 'loy-krathong') {
      this.playTone(587.33, 587.33, 0, 0.52, 0.26, 'sine')
      this.playTone(880.00, 880.00, 0.12, 0.44, 0.18, 'sine')
      this.playTone(520, 760, 0.20, 0.06, 0.16, 'sine')
    } else if (holiday === 'christmas') {
      const notes = [659.25, 783.99, 1046.50]
      notes.forEach((f, i) => this.playTone(f, f, i * 0.08, 0.34, 0.22, 'sine'))
    } else if (holiday === 'halloween') {
      const notes = [440, 523.25, 622.25]
      notes.forEach((f, i) => this.playTone(f, f * 0.98, i * 0.09, 0.24, 0.22, 'triangle', { type: 'lowpass', freq: 1800 }))
    } else if (holiday === 'new-year') {
      this.playNoiseBurst(0, 0.09, 0.008, 0.24, 'bandpass', 1800, 0.9)
      ;[880, 1174.66, 1479.98].forEach((f, i) => this.playTone(f, f, 0.04 + i * 0.06, 0.26, 0.20, 'sine'))
    } else if (holiday === 'valentine') {
      ;[523.25, 659.25, 987.77].forEach((f, i) => this.playTone(f, f, i * 0.09, 0.38, 0.22, 'sine'))
    } else {
      this.playTone(587.33, 587.33, 0, 0.36, 0.22, 'sine')
    }
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

  /** Call only for real user interactions / real door openings, or explicit waiting alerts. */
  playCue(cue: OfficeSoundCue): boolean {
    const ctx = this.ctx
    const now = this.now()
    if (!this.audible || !ctx || ctx.state !== 'running' || now - this.lastCue < 800) return false
    this.lastCue = now
    if (cue === 'holiday') {
      this.playHolidayCue(this.state.holiday ?? null)
      return true
    }
    if (cue === 'attention') {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.11)
      const envelope = ctx.createGain()
      const duration = 0.26
      envelope.gain.setValueAtTime(0, ctx.currentTime)
      envelope.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.015)
      envelope.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)
      osc.connect(envelope)
      envelope.connect(this.master!)
      this.trackTransient(osc, [envelope])
      osc.start()
      osc.stop(ctx.currentTime + duration)
      return true
    }
    this.playNoiseBurst(0, cue === 'paper' ? 0.12 : 0.18, 0.008, cue === 'paper' ? 0.18 : 0.4, cue === 'paper' ? 'bandpass' : 'lowpass', cue === 'paper' ? 2200 : 260, 0.6)
    return true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.on = false
    this.applyGain()
    this.clearAmbientTimer()
    for (const source of this.sources) {
      try { source.stop() } catch { /* Already ended. */ }
      source.disconnect()
    }
    this.sources.clear()
    this.master?.disconnect()
    this.rain?.disconnect()
    this.breeze?.disconnect()
    this.room?.disconnect()
    this.rainFilter?.disconnect()
    this.breezeFilter?.disconnect()
    this.roomFilter?.disconnect()
    this.noise = null
    if (this.ctx) void this.ctx.close().catch(() => {})
  }
}
