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
  outfit?: 'shirt' | 'jacket' | 'hoodie' | 'overalls' | 'vest' | 'coat' | 'poncho' | 'striped'
  face?: 'round' | 'square' | 'oval'
}
export interface OfficePoint { x: number; y: number }
export interface OfficePose { acknowledgment?:number; workGesture?:import('./office-work-gestures').OfficeWorkGesture;workLift?:number;workBack?:boolean;stepLength?:number;stepDirection?:OfficePoint;dressing?:number;seatBack?:boolean;supportHands?:{left:OfficePoint;right:OfficePoint}; inLift?:boolean; opacity?:number;objectAction?:OfficeLeisureAction;climb?: boolean; climbStep?:number; walk?: boolean; sit?: boolean; carry?: boolean; hand?: boolean; typing?: boolean; mug?: boolean; lead?: boolean; face?: 1 | -1;stretch?:number;turn?:number;lookUp?:boolean;walkWeight?:number;gait?:number;seatBlend?:number;offer?:number;cupTilt?:number }
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
  workStation?: OfficeWorkStation
  objectAction?: OfficeLeisureAction
  pod?: boolean
  pose?: OfficePose
}
export interface OfficeCollaborationMember {
  key: string
  preferenceKey: string
  sessionId: string
  agent: TeamAgentRow
  task: TeamTaskRow | null
  appearance: OfficeAppearance
  remote: boolean
}
export interface OfficeFloor {
  collaboration?: OfficeCollaborationMember[]
  id: string
  sessionId: string | null
  title: string
  subtitle: string
  color: string
  y: number
  actorKeys: string[]
  kind: 'team' | 'lounge' | 'quiet' | 'break'
  /** Private room behind this public office's interior door; shares its layout bounds. */
  annexOf?: string
  constructing?: boolean
  constructionProgress?: number
  height?: number
  room?: 'room-a' | 'room-b-lead' | 'room-c-big' | 'room-stations' | 'room-stations-large' | 'room-canteen' | OfficeBreakRoom
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
  taskId?: string
  sourceAt?: number | null
  kind: 'assigned' | 'finished' | 'sent' | 'received' | 'arrived' | 'left' | 'activity' | 'routine'
  station?: OfficeWorkStation
  actorKey: string
  parentKey: string | null
  at: number
}
export type OfficeWorkStation = 'planning' | 'research' | 'build' | 'quality' | 'terminal'
export type OfficeLeisureAction = 'coffee' | 'book' | 'game' | 'water' | 'music' | 'snack'
export type OfficePet = 'dog' | 'rabbit' | 'bird' | 'turtle'
export interface OfficeArchitectureArt {
  doorClosed:CanvasImageSource
  doorOpen:CanvasImageSource
  liftCabin:CanvasImageSource
  liftShaft:CanvasImageSource
}
export interface OfficeLiftVisual {y:number;doorsOpen:number;moving:boolean;passengerKeys:readonly string[]}
export interface OfficeDailyVisual {
  shopQueue?:ReturnType<typeof import('./office-shop-queue').officeShopQueue>
  kind?:'coffee'|'lunch'|'tea'|null
  delivery:boolean
  cleanup:boolean
  guests:readonly {actorKey:string;kind:'coffee'|'lunch'|'tea'|'outing';phase:'outbound'|'eating'|'relocating'|'returning';floorId:string;x:number;y:number;seat:number;action?:import('./office-rest-outings').OfficeOutingAction;night?:boolean;collected?:boolean;pickupProgress?:number}[]
}
export interface OfficePaintOptions {
  selectionCue?:import('./office-selection-gesture').OfficeSelectionCue|null
  wardrobeLooks?:ReadonlyMap<string,import('./office-wardrobe-transition').OfficeWardrobeTransitionLook>
  socialCadenceMultiplier?:number
  transitDoorIds?:ReadonlySet<string>
  sharedRest?:readonly import('./office-shared-rest').OfficeSharedRestPair[]
  cutawayFloor?:string
  exchange?:import('./office-communication').OfficeWorkExchange|null
  roomArt?:{shell:CanvasImageSource;props:CanvasImageSource;breakRoom:CanvasImageSource;stations?:CanvasImageSource;stationAngles?:CanvasImageSource}|null
  dailyArt?:OfficeDailyVisual
  lift?:OfficeLiftVisual
  architectureArt?:OfficeArchitectureArt|null
  liftSurfaceOpen?:boolean
  openDoorFloorId?: string | null
  objectCue?: {actorKey:string;kind:OfficeLeisureAction;until:number}|null
  time: number
  date: Date
  now: number
  live: boolean
  motion: boolean
  pets: readonly OfficePet[]
  selectedKey: string | null
  petEvent?: { kind: 'coffee' | 'heart' | 'fish'; until: number } | null
  /** Actor owned by a real office-motion trip (walk, ride or hold); life is suppressed. */
  tripKey?: string | null
  leisureKeys?: ReadonlySet<string>
  /** Actor currently waving hello to an arriving teammate. */
  greetKey?: string | null
}
/** Where an actor's body is drawn this frame, relative to its seat (scene units). */
export interface OfficeDrawnOffset { dx: number; dy: number; scale?:number }
