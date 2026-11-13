import type { TeamAgentRow, TeamSnapshot, TeamTaskRow } from './team-types'

export type OfficeKind = 'human' | 'robot' | 'raccoon' | 'owl' | 'fox' | 'alien'
export interface OfficeAppearance {
  slot: number
  kind: OfficeKind
  hair: string
  skin: string
  shirt: string
  pants: string
  cut: string
  gear: string
}
export interface OfficePoint { x: number; y: number }
export interface OfficePose { climb?: boolean; walk?: boolean; sit?: boolean; carry?: boolean; hand?: boolean; typing?: boolean; mug?: boolean; lead?: boolean; face?: 1 | -1 }
export interface OfficeActor extends OfficePoint {
  key: string
  sessionId: string
  agent: TeamAgentRow
  task: TeamTaskRow | null
  parentKey: string | null
  appearance: OfficeAppearance
  floorId: string
  zone: 'desk' | 'lounge'
  activity: string
  runtimeName: string
  /** Rest spot is a standing one (coffee bar, ping-pong). */
  stand?: boolean
  /** Celebrating a team that just finished (lounge only). */
  party?: boolean
  /** Team identity, kept even when the actor rests in the shared lounge. */
  team?: { title: string; color: string }
  hidden?: boolean
  monitor?: OfficePoint
  pod?: boolean
  pose?: OfficePose
}
export interface OfficeFloor {
  id: string
  sessionId: string | null
  title: string
  subtitle: string
  color: string
  y: number
  actorKeys: string[]
  kind: 'team' | 'lounge' | 'quiet' | 'break'
  height?: number
  room?: 'room-a' | 'room-b-lead' | 'room-c-big' | OfficeBreakRoom
  overflow?: number
  working?: number
  waiting?: number
  /** Lounge only: titles of teams that just finished and are celebrating. */
  party?: string[]
  /** Chalk summary for rooms with a blackboard: goal, progress, the few items that matter now. */
  board?: OfficeBoard
}
/** Break-room decor variants; each team keeps one, chosen from its session id. */
export type OfficeBreakRoom = 'room-break' | 'room-break-game' | 'room-break-garden' | 'room-break-reading'
export interface OfficeBoardItem { label: string; state: 'waiting' | 'failed' | 'working' | 'done' }
export interface OfficeBoard { goal: string; done: number; total: number; items: OfficeBoardItem[] }
export interface OfficeScene {
  width: number
  height: number
  floors: OfficeFloor[]
  actors: OfficeActor[]
  quietTeams: TeamSnapshot[]
  totalAgents: number
  finishedCount: number
}
export interface OfficeEvent {
  id: string
  kind: 'assigned' | 'finished' | 'sent' | 'received' | 'arrived' | 'left' | 'activity'
  station?: OfficeWorkStation
  actorKey: string
  parentKey: string | null
  at: number
}
export type OfficeWorkStation = 'planning' | 'research' | 'build' | 'terminal'
export type OfficePet = 'dog' | 'rabbit' | 'bird' | 'turtle'
export interface OfficePaintOptions {
  time: number
  date: Date
  now: number
  live: boolean
  motion: boolean
  pets: readonly OfficePet[]
  selectedKey: string | null
  elevatorY?: number | null
  doorOpen?: boolean
  petEvent?: { kind: 'coffee' | 'heart' | 'fish'; until: number } | null
  /** Actor owned by a real office-motion trip (walk, ride or hold); life is suppressed. */
  tripKey?: string | null
  /** Actor currently waving hello to an arriving teammate. */
  greetKey?: string | null
}
/** Where an actor's body is drawn this frame, relative to its seat (scene units). */
export interface OfficeDrawnOffset { dx: number; dy: number }
