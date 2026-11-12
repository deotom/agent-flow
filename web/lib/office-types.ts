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
export interface OfficePose { walk?: boolean; sit?: boolean; carry?: boolean; hand?: boolean; typing?: boolean; mug?: boolean; lead?: boolean }
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
  kind: 'team' | 'lounge'
}
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
  kind: 'assigned' | 'finished' | 'sent' | 'received' | 'arrived' | 'left'
  actorKey: string
  parentKey: string | null
  at: number
}
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
}
