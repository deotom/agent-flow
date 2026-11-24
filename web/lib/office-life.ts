import type { OfficeActor, OfficeLeisureAction } from './office-types'

/**
 * Ambient "life" for Office actors, layered on top of real status.
 * Real status always wins: only idle/done/cancelled agents may doze or leave their
 * seat, and decorative moods never reuse status symbols or colours.
 * Pure function of time (seconds); time 0 is the canonical still frame.
 */
export type OfficeMood = 'zzz' | 'chat' | 'idea' | 'note' | 'sigh' | null
export interface OfficeLifeFrame {
  objectAction?: OfficeLeisureAction
  /** Scene-unit lateral offset from the seat. */
  dx: number
  /** Upward hop in avatar units. */
  hop: number
  face: 1 | -1
  walk: boolean
  stand: boolean
  /** 0..1 arms-up stretch. */
  stretch: number
  /** Seated lean-back in radians (≤ 4°). */
  lean: number
  doze: boolean
  slump: boolean
  scratch: boolean
  wave: boolean
  /** Head turn, -1 (left) .. 1 (right). */
  turn: number
  cup: boolean
  mood: OfficeMood
  /** Hands on keyboard (only for running agents). */
  typing: boolean
}
export interface OfficeLifeContext {
  /** Rendered rest stays with its object; meaningful travel belongs to real trips. */
  anchoredRest?:boolean
  objectAction?: OfficeLeisureAction
  /** Scene-unit vector to the paired neighbour. */
  partnerDx?: number
  /** Partner can join a conversation right now. */
  partnerAwake?: boolean
  /** Shared seed so both partners run the same conversation clock. */
  pairSeed?: number
  /** A real office-motion trip owns this actor (walk, ride or hold). */
  tripActive?: boolean
  /** Greeting a teammate who just arrived. */
  greet?: boolean
}

export const OFFICE_STILL: OfficeLifeFrame = Object.freeze({ dx: 0, hop: 0, face: 1, walk: false, stand: false, stretch: 0, lean: 0, doze: false, slump: false, scratch: false, wave: false, turn: 0, cup: false, mood: null, typing: false }) as OfficeLifeFrame

/** Maximum lateral travel (scene units) — keeps hit targets near their seat. */
export const OFFICE_DESK_REACH = 18, OFFICE_LOUNGE_REACH = 24, OFFICE_CHAT_GAP = 52

export function officeSeed(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}
/** Seconds into a repeating cycle, offset by a seed. */
const at = (time: number, period: number, seed: number) => (((time + seed * period) % period) + period) % period
const ease = (k: number) => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k)
const bump = (k: number) => k <= 0 || k >= 1 ? 0 : Math.sin(k * Math.PI)
const sign = (v: number): 1 | -1 => v < 0 ? -1 : 1
const frame = (patch: Partial<OfficeLifeFrame>): OfficeLifeFrame => ({ ...OFFICE_STILL, ...patch })
const objectFrame=(kind:OfficeLeisureAction,time:number,party=false)=>frame({objectAction:kind,cup:kind==='coffee',stand:kind==='water'||kind==='music',
  wave:kind==='music',lean:kind==='water'?.06:0,hop:party?Math.max(0,Math.sin(time*3))*1.5:0,mood:kind==='music'?'note':null})

/** 2s out, `pause`s away, 2s back; null outside the trip. */
function stroll(t: number, start: number, reach: number, pause: number, away: Partial<OfficeLifeFrame>): OfficeLifeFrame | null {
  const k = t - start
  if (k < 0 || k >= 4 + pause || reach === 0) return null
  if (k < 2) return frame({ walk: true, stand: true, dx: reach * ease(k / 2), face: sign(reach) })
  if (k < 2 + pause) return frame({ stand: true, dx: reach, ...away })
  return frame({ walk: true, stand: true, dx: reach * (1 - ease((k - 2 - pause) / 2)), face: sign(-reach) })
}

const RESTING = new Set(['idle', 'done', 'cancelled'])
const CHATTY = new Set(['running', 'thinking'])
export const officeLifeCanChat = (actor: OfficeActor) => actor.zone === 'lounge' ? RESTING.has(actor.agent.status) : CHATTY.has(actor.agent.status)

function officeLifeFrame(actor: OfficeActor, time: number, context: OfficeLifeContext = {}): OfficeLifeFrame {
  const status = actor.agent.status
  const still = frame({ typing: status === 'running' && actor.zone === 'desk' })
  if (context.tripActive || actor.pose?.walk || actor.pose?.climb) return still
  if(actor.zone==='lounge'&&context.objectAction&&(RESTING.has(status)||status==='failed'))return objectFrame(context.objectAction,time,actor.party)
  // Idle leads remain seated at their report nook rather than falling asleep at a workstation.
  if(actor.zone==='lounge'&&status==='idle'&&actor.agent.role==='lead'&&!actor.agent.parentId&&!actor.parentKey&&!actor.party){
    if(actor.stand&&!actor.objectAction)return frame({stand:true,turn:time?Math.sin(time*.5+officeSeed(actor.key)*6)*.45:0})
    return objectFrame(actor.objectAction==='coffee'?'coffee':'book',time)
  }
  if(!time)return actor.zone==='lounge'&&actor.objectAction?objectFrame(actor.objectAction,0,actor.party):still
  if (context.greet) return frame({ wave: true, turn: .5 })
  const s = officeSeed(actor.key)
  const partner = context.partnerDx, paired = partner !== undefined && context.partnerAwake !== false && officeLifeCanChat(actor)
  const pairSeed = context.pairSeed ?? s
  // Left partner speaks first; partners alternate every second.
  const speaking = (k: number) => (Math.floor(k) % 2 === 0) === ((partner ?? 0) > 0)

  if (actor.zone === 'lounge') {
    if (actor.party && RESTING.has(status)) {
      // Party: bob to the beat, throw arms up now and then, the odd note. Seated, no wandering.
      const beat = time * 2.2 + s * 6
      return frame({ hop: Math.max(0, Math.sin(beat * Math.PI)) * 2, stretch: at(time, 4, s) < 1 ? bump(at(time, 4, s)) : 0,
        turn: Math.sin(time * 1.3 + s * 5) * .7, mood: at(time, 6, s) < 1.2 ? 'note' : null, cup:(!actor.objectAction||actor.objectAction==='coffee')&&at(time, 4, s) >= 1,objectAction:actor.objectAction })
    }
    // Failed workers rest too, but they look it: slumped with an occasional sigh.
    if (status === 'failed') return frame({ slump: true, cup: true, mood: at(time, 12, s) < 1.2 ? 'sigh' : null })
    if (!RESTING.has(status)) return still
    if(actor.objectAction&&at(time,16,s)<10)return objectFrame(actor.objectAction,time)
    if (paired) {
      const t = at(time, 20, pairSeed), reach = sign(partner!) * Math.max(0, (Math.abs(partner!) - OFFICE_CHAT_GAP) / 2)
      if (t < 2) return frame({ walk: reach !== 0, stand: true, dx: reach * ease(t / 2), face: sign(partner!), cup: true })
      if (t < 6) return frame({ stand: true, dx: reach, face: sign(partner!), cup: true, mood: speaking(t - 2) ? 'chat' : null })
      if (t < 8) return frame({ walk: reach !== 0, stand: true, dx: reach * (1 - ease((t - 6) / 2)), face: sign(-partner!), cup: true })
      return frame({ cup: true, turn: Math.sin(time * .5 + s * 6) * .5 })
    }
    if (s < .35) {
      const t = at(time, 24, s)
      return t < 1.5 ? frame({ stretch: bump(t / 1.5) }) : frame({ doze: true, mood: 'zzz' })
    }
    const t = at(time, 18, s), reach = (s > .65 ? 1 : -1) * OFFICE_LOUNGE_REACH
    const away = stroll(t, 0, reach, 3, { stretch: bump((t - 2) / 3) * .7, mood: t - 2 > .9 && t - 2 < 2.1 ? 'note' : null })
    return away ?? frame({ cup: true, turn: Math.sin(time * .5 + s * 6) * .5 })
  }

  if (paired && CHATTY.has(status)) {
    // One 2.4s conversation per shared 32s cycle; each partner speaks 1.2s.
    const t = at(time, 32, pairSeed)
    if (t < 2.4) return frame({ turn: sign(partner!) * .6, mood: (t < 1.2) === (partner! > 0) ? 'chat' : null, typing: false })
  }
  switch (status) {
    case 'running': {
      const t = at(time, 12, s)
      if (t < 9) return frame({ typing: t % 1.2 < .9 })
      if (t < 10) return frame({ stretch: bump(t - 9) })
      return frame({ cup: true })
    }
    case 'thinking': {
      const t = at(time, 16, s)
      if (t < 1.6) return frame({ scratch: true })
      if (t >= 8 && t < 8.6) return frame({ mood: 'idea' })
      return frame({ turn: Math.sin(time * .8 + s * 4) * .6 })
    }
    case 'waiting_approval':
    case 'waiting_input': {
      const t = at(time, 8, s)
      return frame({ wave: t < 1.2, hop: t < .4 ? bump(t / .4) * 2 : 0 })
    }
    case 'failed': {
      const t = at(time, 12, s)
      return frame({ slump: true, mood: t < 1.2 ? 'sigh' : null })
    }
    case 'background': {
      const t = at(time, 10, s)
      return frame({ lean: 4 * Math.PI / 180 * ease(Math.min(1, t)), turn: t > 6 && t < 7.5 ? .5 : 0 })
    }
    case 'idle': {
      const t = at(time, 24, s)
      if (s < .5) return t < 1.5 ? frame({ stretch: bump(t / 1.5) }) : frame({ doze: true, mood: 'zzz' })
      return stroll(at(time, 18, s), 0, (s > .75 ? 1 : -1) * OFFICE_DESK_REACH, 3, { cup: true }) ?? still
    }
    default: return still
  }
}

export function officeLife(actor:OfficeActor,time:number,context:OfficeLifeContext={}):OfficeLifeFrame {
  const frame=officeLifeFrame(actor,time,context)
  if(!context.anchoredRest||actor.zone!=='lounge')return frame
  return {...frame,dx:0,walk:false,stand:Boolean(actor.stand||frame.objectAction==='water'||frame.objectAction==='music')}
}

export interface OfficeLifePair { partnerKey: string; partnerDx: number; pairSeed: number }
/**
 * Reciprocal, disjoint pairs from stable seat order: desk actors pair within the
 * same floor and seat row; lounge actors pair across the lounge. Hidden and
 * travelling actors are excluded.
 */
export function officeLifePairs(actors: readonly OfficeActor[]): Map<string, OfficeLifePair> {
  const groups = new Map<string, OfficeActor[]>()
  for (const actor of actors) {
    if (actor.hidden || actor.pose?.walk || actor.pose?.climb) continue
    // Pair within one room and one row of seats (the lawn and the break room are separate rooms).
    const group = `${actor.zone}\0${actor.floorId}\0${Math.round(actor.y / (actor.zone === 'lounge' ? 12 : 8))}`
    groups.set(group, [...groups.get(group) ?? [], actor])
  }
  const pairs = new Map<string, OfficeLifePair>()
  for (const members of groups.values()) {
    members.sort((a, b) => a.x - b.x || a.key.localeCompare(b.key))
    for (let i = 0; i + 1 < members.length; i += 2) {
      const a = members[i], b = members[i + 1], pairSeed = officeSeed([a.key, b.key].sort().join('\0'))
      pairs.set(a.key, { partnerKey: b.key, partnerDx: b.x - a.x, pairSeed })
      pairs.set(b.key, { partnerKey: a.key, partnerDx: a.x - b.x, pairSeed })
    }
  }
  return pairs
}
