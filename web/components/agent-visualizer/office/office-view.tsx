'use client'

import {useOfficeSound} from './use-office-sound'
import {OfficeGardenInfill} from './office-garden-infill'
import {OfficeRemoteMeeting,type OfficeDisplayMode} from './office-remote-meeting'
import {officeCollaboratorDisplayed,parseOfficeCollaborationOverrides,setOfficeCollaborationOverride} from '../../../lib/office-collaboration'
import type {OfficeSelectionCue} from '../../../lib/office-selection-gesture'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TeamSnapshot } from '../../../lib/team-types'
import { isWorking, STATUS_LABEL, type TeamScope, type ConnectionView } from '../../../lib/team-model'
import type { AnimationMode } from '../../../lib/viewer-preferences'
import type { OfficeActor, OfficeEvent, OfficePet, OfficeScene, OfficeWorkStation, OfficeLeisureAction } from '../../../lib/office-types'
import { buildOfficeScene, currentOfficeBoard, officeEvents, officeKey, officeTeamOrder, officeTeamQuiet } from '../../../lib/office-model'
import { createOfficeTrip, mergeOfficeEvents, officeAllowsMotion, officeArrivalMeetingStop, officeCanResumeTrip, officeDepartureScene, officeMeetingActor, officePresenceEvents, populatedOfficeTeams, officeTripFrame, officeWorkTripFrame, type OfficeTrip } from '../../../lib/office-motion'
import { deriveOfficeParties, emptyOfficePartyHistory } from '../../../lib/office-parties'
import { drawOfficeAvatar, drawOfficeFrame, officeAmbient } from './office-art'
import {mergeOfficeHolograms,pruneOfficeHolograms,officeHologramFrames,type OfficeHologramState} from '../../../lib/office-hologram'
import {drawOfficeHolograms} from './office-hologram-art'
import { drawOfficeDaylight } from './office-daylight-art'
import { drawOfficeSkyBalloon } from './office-sky-art'
import { officeDaylight, officeDesktopGardenLighting } from '../../../lib/office-daylight'
import { officeWorkEvents, officeWorkPulse, officeWorkStation } from '../../../lib/office-work'
import {officeActorAtWorkPlace,officeSceneAtWorkPlaces,officeWorkPresenceTarget,rememberOfficeWorkPlace,type OfficeWorkPlace} from '../../../lib/office-work-presence'
import { officeStations, officeStationUsers, officeRoomSeed, OFFICE_STATION_NAMES, OFFICE_DESKTOP_STATION_NAMES } from '../../../lib/office-stations'
import { roomDesktopPlanningDesk } from '../../../lib/office-room-design'
import { officeLeisureObjects, nearestLeisureActor, createOfficeLeisureTrip, OFFICE_OBJECT_NAMES } from '../../../lib/office-leisure'
import { officeInteriorDoor, officeDoorBounds, officeInsideLift, officeLanding, officeNavigation } from '../../../lib/office-navigation'
import { officeSky, officeSkyIcon } from '../../../lib/office-sky'
import { officeSeasonalActivity, officeSeasonalObjects } from '../../../lib/office-seasonal'
import {createOfficeLift,officeGardenLiftButton,toggleOfficeGardenLift,reserveOfficeLiftTrip,officeLiftFrame,restoreOfficeLiftCall,shiftOfficeLiftTime,cancelOfficeLiftTrips,type OfficeLiftState} from '../../../lib/office-lift'
import { addOfficeArrivals, advanceOfficeArrivals, officeActorsWithArrivals } from '../../../lib/office-arrivals'
import { useOfficeLayout } from './use-office-layout'
import { officeDesktopHistoryLayout } from '../../../lib/office-layout'
import { OfficeBreakPeek } from './office-break-peek'
import {officeLeadRestTransitions,officePendingOriginKeys} from '../../../lib/office-lead-rest'
import {createOfficeLeadRestTrip} from '../../../lib/office-lead-rest-motion'
import {officeWorkExchange} from '../../../lib/office-communication'
import {officeActorLocation} from '../../../lib/office-location'
import {OfficeDailyRuntime,OFFICE_DAILY_STORAGE} from '../../../lib/office-daily-runtime'
import {useOfficeRoomArt} from './use-office-room-art'
import {useOfficeAvatarArt} from './use-office-avatar-art'
import {useOfficeIdentities} from './use-office-identities'
import {drawOfficeRoomDesign,drawOfficeRoomDeskLights} from './office-room-design-art'
import {officePaintedStationOccupancy} from '../../../lib/office-station-activity'
import {useOfficeArchitectureArt} from './use-office-architecture-art'
import {officeAgentInfo,officeNextAttention,officePlanningInfo,officeRevealTarget} from '../../../lib/office-interaction'
import {OfficeInspector} from './office-inspector'
import {OfficeDiscoveryTip,useOfficeDiscovery} from './office-discovery'
import {OfficeActivityFooter} from './office-activity-footer'
import {officeSharedRest} from '../../../lib/office-shared-rest'
import {skyWeather} from '../../../lib/office-sky'
import {officeDoorTraffic} from '../../../lib/office-door-traffic'
import {officeVendorAllowsObject,officeVendorState} from '../../../lib/office-vendor'
import {officeLiveliness,officeLivelinessPolicy} from '../../../lib/office-liveliness'
import {officeWardrobeTheme} from '../../../lib/office-wardrobe'
import {officeWardrobeTransitionFrame,type OfficeWardrobeTransitionState} from '../../../lib/office-wardrobe-transition'

const PAINTED_STATION_SIGNS = [
  { label: 'Planning', x: .061, y: .269 },
  { label: 'Research', x: .22, y: .265 },
  { label: 'Review', x: .51, y: .35 },
  { label: 'Build', x: .235, y: .582 },
  { label: 'Terminal', x: .61, y: .651 },
] as const

interface OfficeViewProps {
  snapshots: readonly TeamSnapshot[]
  scope: TeamScope
  selectedKey: string | null
  onSelect: (sessionId: string, agentId: string) => void
  onOpenTeam: (sessionId: string, agentId: string | null) => void
  live: boolean
  connection?: Pick<ConnectionView, 'label' | 'tone' | 'detail'>
  visible: boolean
  animationMode: AnimationMode
  now: number
  identitySlots?:ReadonlyMap<string,number>
  attentionCueTick?: number
  attentionNotify?: boolean
  onToggleAttentionNotify?: () => void
  focusRevealTick?: number
}
const COLLABORATION_STORAGE='agent-flow.office.collaboration.v1'
const readCollaboration=()=>{try{return parseOfficeCollaborationOverrides(localStorage.getItem(COLLABORATION_STORAGE))}catch{return parseOfficeCollaborationOverrides(null)}}
const TEAM_ORDER_STORAGE = 'agent-flow-office-team-order-v1'
const readTeamOrder = (): readonly string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TEAM_ORDER_STORAGE)??'[]')
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id==='string'&&id.length>0&&id.length<=2048))].slice(0,10_000) : []
  } catch { return [] }
}

/** Only page visibility pauses drawing; motion itself is the app's own setting, not the OS reduced-motion flag. */
function usePageVisible() {
  const [pageVisible, setPageVisible] = useState(true)
  useEffect(() => {
    const visibility = () => setPageVisible(!document.hidden)
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  return pageVisible
}
const PAUSE_STORAGE = 'agent-flow-office-paused'
const LIVELINESS_STORAGE='agent-flow-office-liveliness-v1'
const BOARD_MARKS = { waiting: '!', failed: '✗', working: '○', done: '✓' } as const
const BOARD_STATES = { waiting: 'Needs you', failed: 'Failed', working: 'Working', done: 'Done' } as const
type Moving = { actor: OfficeActor; caption: string; elevatorY: number | null; station?:OfficeWorkStation }
type Pending = { event: OfficeEvent; before: OfficeScene }
const EMPTY_REST_MOVING: Moving[] = []

export function OfficeView({ snapshots, scope, selectedKey, onSelect, onOpenTeam, live, connection, visible, animationMode, now, identitySlots, attentionCueTick, attentionNotify, onToggleAttentionNotify, focusRevealTick }: OfficeViewProps) {
  const desktopArt=typeof document!=='undefined'&&document.documentElement.dataset.agentFlowHost==='desktop'
  const stationNames=desktopArt?OFFICE_DESKTOP_STATION_NAMES:OFFICE_STATION_NAMES
  const [collaborationOverrides,setCollaborationOverrides]=useState(readCollaboration)
  const changeCollaboration=(key:string,mode:OfficeDisplayMode)=>{
    const member=scene.floors.flatMap(floor=>floor.collaboration??[]).find(member=>member.preferenceKey===key)
    if(!member||travellingKeys.has(member.key)||active.current?.actorKey===member.key||arrivalTrips.current.has(member.key)||leisureTrips.current.has(member.key)||daily.current?.guests.has(member.key))return
    const next=setOfficeCollaborationOverride(collaborationOverrides,key,mode)
    setCollaborationOverrides(next)
    try{localStorage.setItem(COLLABORATION_STORAGE,JSON.stringify(next))}catch{/* Keep the display choice in memory. */}
  }
  const localIdentities=useOfficeIdentities(snapshots,identitySlots===undefined)
  const [savedTeamOrder,setSavedTeamOrder] = useState(readTeamOrder)
  const teamOrder = useMemo(()=>officeTeamOrder(snapshots.filter(s=>!officeTeamQuiet(s)).map(s=>s.sessionId),savedTeamOrder),[snapshots,savedTeamOrder])
  useEffect(()=>{
    if(teamOrder===savedTeamOrder)return
    setSavedTeamOrder(teamOrder)
    try{localStorage.setItem(TEAM_ORDER_STORAGE,JSON.stringify(teamOrder))}catch{/* In-memory order stays stable. */}
  },[teamOrder,savedTeamOrder])
  const identities=identitySlots??localIdentities
  const [showQuiet, setShowQuiet] = useState(false)
  const [liveliness,setLiveliness]=useState(()=>{try{return officeLiveliness(localStorage.getItem(LIVELINESS_STORAGE))}catch{return officeLiveliness(null)}})
  useEffect(()=>{try{localStorage.setItem(LIVELINESS_STORAGE,liveliness)}catch{/* Keep the in-memory choice. */}},[liveliness])
  const wardrobeStore=useRef<ReadonlyMap<string,OfficeWardrobeTransitionState>>(new Map())
  const [peekId,setPeekId] = useState<string|null>(null)
  const lastDoor=useRef<HTMLButtonElement|null>(null)
  const closePeek=()=>{const closingFocus=document.activeElement;setPeekId(null);requestAnimationFrame(()=>{if(document.activeElement!==document.body&&document.activeElement!==closingFocus)return;if(lastDoor.current?.isConnected)lastDoor.current.focus()})}
  const [stationSelection,setStationSelection]=useState<{sessionId:string;kind:OfficeWorkStation}|null>(null)
  const [inspectorHeight,setInspectorHeight]=useState(0)
  // The user's own pause choice persists across launches.
  const [paused, setPaused] = useState(() => { try { return localStorage.getItem(PAUSE_STORAGE) === 'true' } catch { return false } })
  useEffect(() => { try { localStorage.setItem(PAUSE_STORAGE, String(paused)) } catch { /* In-memory selection remains available. */ } }, [paused])
  const pets: OfficePet[] = []
  const petEvent = null
  const pageVisible = usePageVisible()
  const discovery=useOfficeDiscovery(visible&&pageVisible,!desktopArt)
  useEffect(()=>{if(selectedKey||stationSelection)discovery.dismiss()},[selectedKey,stationSelection,discovery.dismiss])
  const viewport = useRef<HTMLDivElement>(null)
  const desktopWorkroomShown = useRef(false)
  const officeControls = useRef<HTMLDetailsElement>(null)
  useEffect(()=>{
    if(!desktopArt||!visible)return
    const dismiss=(event:PointerEvent)=>{
      const controls=officeControls.current
      if(controls?.open&&event.target instanceof Node&&!controls.contains(event.target))controls.open=false
    }
    document.addEventListener('pointerdown',dismiss)
    return ()=>document.removeEventListener('pointerdown',dismiss)
  },[desktopArt,visible])
  const inspectorTrigger=useRef<HTMLElement|null>(null)
  const focusInspector=useRef(false)
  const attentionCursor=useRef<string|null>(null)
  const sceneWidth = 450
  // Project from committed history, so speculative renders cannot start or expire parties.
  const partyLog = useRef(emptyOfficePartyHistory())
  const partyHistory = useMemo(() => deriveOfficeParties(partyLog.current, snapshots, now), [snapshots, now])
  useEffect(() => { partyLog.current = partyHistory }, [partyHistory])
  const parties = partyHistory.parties
  const scene = useMemo(() => buildOfficeScene(snapshots, scope, showQuiet, identities, sceneWidth, parties, teamOrder,collaborationOverrides,desktopArt), [snapshots, scope, showQuiet, identities, sceneWidth, parties, teamOrder,collaborationOverrides,desktopArt])
  const daily=useRef<OfficeDailyRuntime|null>(null)
  if(!daily.current){let saved:unknown;try{saved=JSON.parse(localStorage.getItem(OFFICE_DAILY_STORAGE)??'null')}catch{}daily.current=new OfficeDailyRuntime(saved)}
  const [dailyVersion,setDailyVersion]=useState(0)
  const persistedDaily=useRef('')
  const [heldLayout, setHeldLayout] = useState<OfficeScene | null>(null)
  const held = useRef<OfficeScene | null>(null)
  const holdLayout = (value: OfficeScene | null) => { held.current = value; setHeldLayout(value) }
  const enabled = visible && pageVisible && live && officeAllowsMotion(animationMode) && !paused
  const soundWeather=skyWeather(new Date(now))
  const sound=useOfficeSound({active:visible&&pageVisible&&live&&!paused,night:officeDaylight(new Date(now)).night,wet:soundWeather==='rain'||soundWeather==='storm'})
  const lastAttentionCue=useRef(attentionCueTick)
  useEffect(()=>{
    if(attentionCueTick!==undefined&&attentionCueTick!==lastAttentionCue.current){
      lastAttentionCue.current=attentionCueTick
      if(attentionCueTick>0)sound.playCue('attention')
    }
  },[attentionCueTick,sound.playCue])
  const layoutTarget = useMemo(() => officeDesktopHistoryLayout(daily.current!.project(heldLayout ? officeDepartureScene(heldLayout, scene, snapshots) : scene)), [heldLayout, scene, snapshots,dailyVersion])
  const visualScene = useOfficeLayout(layoutTarget,visible&&pageVisible&&officeAllowsMotion(animationMode)&&!paused,!live)
  const workroomTop = visualScene.floors.reduce<number|undefined>((top,floor)=>
    floor.kind==='team'&&!floor.constructing?Math.min(top??Infinity,floor.y):top,undefined)
  useEffect(()=>{
    const view=viewport.current
    if(workroomTop===undefined){desktopWorkroomShown.current=false;return}
    if(!desktopArt||!visible||!view||view.clientWidth<640||desktopWorkroomShown.current||selectedKey)return
    const building=view.querySelector<HTMLElement>('.of-building')
    if(!building?.clientWidth)return
    desktopWorkroomShown.current=true
    view.scrollTop=workroomTop*building.clientWidth/visualScene.width
  },[desktopArt,visible,visualScene.width,workroomTop,selectedKey])
  const architectureArt=useOfficeArchitectureArt()
  const roomArt=useOfficeRoomArt()
  const avatarArt=useOfficeAvatarArt()
  const roomCanvas=useRef<HTMLCanvasElement>(null)
  // Unlit station overlays sit under wall signs and boards; repaint only when occupancy or geometry changes.
  const deskLightCanvas=useRef<HTMLCanvasElement>(null)
  const deskLightPainted=useRef<{signature:string;art:unknown}|null>(null)
  const lift=useRef<OfficeLiftState|null>(null)
  if(!lift.current)lift.current=createOfficeLift(visualScene)
  const canvas = useRef<HTMLCanvasElement>(null)
  const workPlaces=useRef(new Map<string,OfficeWorkPlace>())
  const peekCanvas = useRef<HTMLCanvasElement>(null)
  const lastPainted = useRef<Moving|null>(null)
  const paintedMinute = useRef<number | null>(null)
  const painted = useRef(false)
  const paintedCollaboration=useRef(collaborationOverrides)
  const reconnecting = useRef(false)
  const objectCue = useRef<{actorKey:string;kind:OfficeLeisureAction;until:number}|null>(null)
  const leadOrigins=useRef(new Map<string,OfficeActor>())
  const leisureTrips = useRef(new Map<string,{trip:OfficeTrip;kind:OfficeLeisureAction}>())
  const leisureVisual = useRef(new Map<string,Moving>())
  const arrivalTrips = useRef(new Map<string,OfficeTrip>())
  const pendingArrivalMeetings = useRef(new Map<string,OfficeEvent>())
  const [visualTick,setArrivalTick] = useState(0)
  const [restMoving,setRestMoving]=useState<Moving[]>([])
  const hatchButton = useRef<HTMLButtonElement>(null)
  const skyCanvas = useRef<HTMLCanvasElement>(null)
  const queue = useRef<Pending[]>([])
  const active = useRef<OfficeTrip | null>(null)
  const baseline = useRef<{ snapshots: readonly TeamSnapshot[]; scene: OfficeScene; enabled: boolean; scope: TeamScope; showQuiet: boolean } | null>(null)
  const motionClock = useRef(0)
  const holograms=useRef<OfficeHologramState>({cues:[],seenEventIds:[]})
  const hologramClock=useRef({at:0,last:Date.now(),active:false})
  const hologramBaseline=useRef<{snapshots:readonly TeamSnapshot[];scope:TeamScope;showQuiet:boolean;watching:boolean}|null>(null)
  const hologramNow=()=>{
    const clock=hologramClock.current,wall=Date.now()
    if(clock.active)clock.at+=Math.max(0,wall-clock.last)
    clock.last=wall
    return clock.at
  }
  useEffect(()=>{
    hologramClock.current.last=Date.now()
    hologramClock.current.active=visible&&pageVisible&&live&&!paused
  },[visible,pageVisible,live,paused])
  const nextWorkAt = useRef(0)
  const objectCadence=officeLivelinessPolicy(liveliness,officeDaylight(new Date(now)).night).objectCadenceMultiplier
  const priorObjectCadence=useRef(objectCadence)
  const nextSeasonalAt = useRef(12_000*objectCadence)
  useEffect(()=>{
    const remaining=Math.max(0,nextSeasonalAt.current-motionClock.current)
    nextSeasonalAt.current=motionClock.current+remaining*objectCadence/priorObjectCadence.current
    priorObjectCadence.current=objectCadence
  },[objectCadence])
  const seasonalCursor = useRef(0)
  const workCursor = useRef(0)
  const selectionCue=useRef<OfficeSelectionCue|null>(null)
  const elapsed = useRef(0)
  const [moving, setMoving] = useState<Moving | null>(null)
  const hadMotionSync = useRef(false)
  // Overlay buttons follow life offsets via a per-frame transform; React only owns seats and content.
  const agentRefs = useRef(new Map<string, HTMLButtonElement>())
  const appliedTransforms = useRef(new Map<string, string>())
  // Stable per-key ref callbacks so re-renders don't detach buttons or reset the transform cache.
  const refCallbacks = useRef(new Map<string, (element: HTMLButtonElement | null) => void>())
  const agentRef = (key: string) => {
    let callback = refCallbacks.current.get(key)
    if (!callback) refCallbacks.current.set(key, callback = element => {
      appliedTransforms.current.delete(key)
      if (element) agentRefs.current.set(key, element); else { agentRefs.current.delete(key); refCallbacks.current.delete(key) }
    })
    return callback
  }
  const cssScale = useRef(0)
  // One teammate waves hello when someone arrives in their room (8s cooldown per room).
  const greet = useRef<{ key: string; until: number } | null>(null)
  const greetCooldown = useRef(new Map<string, number>())
  const [inspectedKey, setInspectedKey] = useState<string | null>(null)
  const current = useRef({ scene: visualScene,target:layoutTarget,sourceScene:scene, selectedKey, pets, petEvent, enabled, live, peekId,architectureArt,roomArt,avatarArt,liveliness,wallNow:now })
  const doorTrips=()=>[active.current,...arrivalTrips.current.values(),...[...daily.current!.guests.values()].map(guest=>guest.trip)]
  current.current = { scene: visualScene,target:layoutTarget,sourceScene:scene, selectedKey, pets, petEvent, enabled, live, peekId,architectureArt,roomArt,avatarArt,liveliness,wallNow:now }
  const arrivalSceneWithMeetings=(base:OfficeScene)=>!desktopArt||!pendingArrivalMeetings.current.size?base:{
    ...base,
    actors:base.actors.map(actor=>{
      const pending=pendingArrivalMeetings.current.get(actor.key)
      const stop=pending?officeArrivalMeetingStop(base,actor.key,pending.parentKey):null
      return stop?{...actor,...stop}:actor
    }),
  }
  const createVisualTrip=(event:OfficeEvent,before:OfficeScene,next:OfficeScene,at:number)=>{
    const prior=officeSceneAtWorkPlaces(before,workPlaces.current),present=officeSceneAtWorkPlaces(next,workPlaces.current)
    const person=present.actors.find(a=>a.key===event.actorKey)
    if(event.kind==='routine'){
      const actual=daily.current!.completedOrigins.get(event.actorKey)??leadOrigins.current.get(event.actorKey)??(lastPainted.current?.actor.key===event.actorKey?lastPainted.current.actor:undefined)??prior.actors.find(a=>a.key===event.actorKey)
      const trip=createOfficeLeadRestTrip(prior,present,event.actorKey,at,actual)
      return trip?{...trip,event}:null
    }
    const target=event.kind==='activity'&&person?officeWorkPresenceTarget(next,person,event.station??officeWorkStation(person),workPlaces.current):undefined
    if(desktopArt&&person&&target&&Math.hypot(target.x-person.x,target.y-person.y)<1)return null
    let trip=createOfficeTrip(event,prior,present,at,target)
    if(!trip)return null
    const liveOrigin=(key:string)=>daily.current!.completedOrigins.get(key)??leadOrigins.current.get(key)??leisureVisual.current.get(key)?.actor??(lastPainted.current?.actor.key===key?lastPainted.current.actor:undefined)
    const keys=trip.meetingPartner?[trip.actorKey,trip.meetingPartner.actorKey]:[trip.actorKey]
    const updates=new Map<string,OfficeActor>()
    for(const key of keys){
      const actual=liveOrigin(key)
      if(actual&&prior.actors.some(a=>a.key===key&&(a.floorId===actual.floorId||daily.current!.completedOrigins.has(key))))updates.set(key,actual)
    }
    if(updates.size){
      const origin={...prior,floors:[...prior.floors,...present.floors.filter(f=>!prior.floors.some(p=>p.id===f.id))],actors:prior.actors.map(a=>{const actual=updates.get(a.key);return actual?{...a,x:actual.x,y:actual.y,floorId:actual.floorId}:a})}
      trip=createOfficeTrip(event,origin,present,at,target)
    }
    return trip
  }

  useEffect(() => {
    const previous = baseline.current
    const parkDesktopWorkers=(keys?:ReadonlySet<string>)=>{
      if(!desktopArt)return
      let changed=false
      for(const actor of scene.actors){
        if(actor.hidden||actor.zone!=='desk'||!isWorking(actor.agent.status)||(keys&&!keys.has(actor.key))||workPlaces.current.get(actor.key)?.floorId===actor.floorId)continue
        const station=officeWorkStation(actor)
        const occupied={...scene,actors:scene.actors.filter(other=>other.key===actor.key||!isWorking(other.agent.status)||workPlaces.current.has(other.key))}
        const target=officeWorkPresenceTarget(occupied,actor,station,workPlaces.current)
        const place=rememberOfficeWorkPlace(scene,actor,target,station)
        if(place){workPlaces.current.set(actor.key,place);changed=true}
      }
      if(changed)setArrivalTick(tick=>tick+1)
    }
    if(!previous?.scene.actors.length||previous.scope!==scope||previous.showQuiet!==showQuiet||!enabled||!previous.enabled)parkDesktopWorkers()
    if (!live) {
      reconnecting.current = true
      queue.current = []
      pendingArrivalMeetings.current.clear()
      baseline.current = { snapshots, scene, enabled, scope, showQuiet }
      return
    }
    if (reconnecting.current) {
      reconnecting.current = false
      queue.current = []
      pendingArrivalMeetings.current.clear()
      if (!officeCanResumeTrip(active.current, scene)) {
        if(active.current)cancelOfficeLiftTrips(lift.current!,new Set([active.current.actorKey]),motionClock.current)
        active.current = null; setMoving(null); holdLayout(null)
      }
      baseline.current = { snapshots, scene, enabled, scope, showQuiet }
      return
    }
    if (!enabled || !previous?.enabled || previous.scope !== scope || previous.showQuiet !== showQuiet) {
      if(!daily.current!.guests.size){
      queue.current = []; active.current = null; leadOrigins.current.clear();pendingArrivalMeetings.current.clear();setMoving(null); holdLayout(null)
      const car=officeLiftFrame(lift.current!,motionClock.current),reset=createOfficeLift(scene)
      const atGarden=Math.abs(car.y-reset.y)<2*scene.width/450
      lift.current={...reset,y:car.y,doorsOpen:!enabled&&atGarden&&!car.passengerKeys.length?car.doorsOpen:0,availableAt:motionClock.current}
      if(arrivalTrips.current.size){arrivalTrips.current.clear();setArrivalTick(n=>n+1)}
      }
    } else if (previous.scene !== scene) {
      const priorIds=new Set(previous.snapshots.map(s=>s.sessionId))
      const newTeams=new Set(previous.snapshots.length?snapshots.filter(s=>!priorIds.has(s.sessionId)).map(s=>s.sessionId):[])
      const restEvents:OfficeEvent[]=officeLeadRestTransitions(previous.scene,scene).map(change=>{
        const liveTrip=active.current?.actorKey===change.actorKey?active.current:null
        const frame=liveTrip?officeTripFrame(liveTrip,motionClock.current):null
        const actual=daily.current!.actors(current.current.scene,motionClock.current).find(a=>a.key===change.actorKey)??(frame?{...change.from,...frame.point,floorId:frame.floorId??change.from.floorId}:leadOrigins.current.get(change.actorKey)??officeActorAtWorkPlace(previous.scene,change.from,workPlaces.current.get(change.actorKey)))
        leadOrigins.current.set(change.actorKey,actual)
        if(liveTrip?.event.kind==='routine'){active.current=null;setMoving(null)}
        return {id:JSON.stringify(['lead-rest',change.actorKey,Date.now()]),kind:'routine',actorKey:change.actorKey,parentKey:null,at:Date.now()}
      })
      const observed = [...restEvents,...officeEvents(previous.snapshots, snapshots, Date.now()), ...officePresenceEvents(previous.scene, scene, populatedOfficeTeams(previous.snapshots), Date.now(),newTeams), ...officeWorkEvents(previous.scene,scene,Date.now())]
      parkDesktopWorkers(new Set(observed.filter(event=>event.kind==='arrived').map(event=>event.actorKey)))
      const arrivingKeys=new Set([...arrivalTrips.current.keys(),...observed.filter(e=>e.kind==='arrived'&&!daily.current!.guests.has(e.actorKey)).map(e=>e.actorKey)])
      for(const event of observed)if(desktopArt&&event.kind==='assigned'&&arrivingKeys.has(event.actorKey)&&officeArrivalMeetingStop(scene,event.actorKey,event.parentKey))pendingArrivalMeetings.current.set(event.actorKey,event)
      for(const [key,pending] of pendingArrivalMeetings.current)if(observed.some(e=>e.kind==='left'&&e.actorKey===key)||!officeArrivalMeetingStop(scene,key,pending.parentKey))pendingArrivalMeetings.current.delete(key)
      arrivalTrips.current=addOfficeArrivals(arrivalTrips.current,observed.filter(e=>!daily.current!.guests.has(e.actorKey)),previous.scene,arrivalSceneWithMeetings(officeSceneAtWorkPlaces(scene,workPlaces.current)),motionClock.current,lift.current!)
      const events=observed.filter(event=>event.kind!=='arrived'&&(event.kind==='left'||!arrivalTrips.current.has(event.actorKey)))
      setArrivalTick(n=>n+1)
      if (events.some(event => event.kind === 'left')) {
        if (!held.current) holdLayout(previous.scene)
      }
      const pendingBefore = new Map(queue.current.map(item => [item.event.id, item.before]))
      const merged = mergeOfficeEvents(queue.current.map(item => daily.current!.guests.has(item.event.actorKey)||Boolean(item.event.parentKey&&daily.current!.guests.has(item.event.parentKey))?{...item.event,at:Date.now()}:item.event), events, Date.now(), event =>
        (event.kind!=='left'||!scene.actors.some(a=>a.key===event.actorKey&&!a.hidden))&&createVisualTrip(event, pendingBefore.get(event.id) ?? previous.scene, scene, 0)!==null)
      const old = new Map(queue.current.map(item => [item.event.id, item]))
      queue.current = merged.map(event => old.get(event.id) ?? { event, before: previous.scene })
      if (active.current?.event.kind==='activity' && events.some(event => event.kind!=='activity'&&event.actorKey === active.current!.event.actorKey)) { cancelOfficeLiftTrips(lift.current!,new Set([active.current.actorKey]),motionClock.current);active.current = null; setMoving(null) }
      if (active.current && active.current.event.kind !== 'left' && !scene.actors.some(actor => actor.key === active.current!.actorKey)&&!events.some(event=>event.kind==='left'&&event.actorKey===active.current!.actorKey)) { cancelOfficeLiftTrips(lift.current!,new Set([active.current.actorKey]),motionClock.current);active.current = null; setMoving(null) }
    }
    baseline.current = { snapshots, scene, enabled, scope, showQuiet }
  }, [snapshots, scene, enabled, live, scope, showQuiet, desktopArt])

  // Realtime evidence also works with effects off; no separate animation loop.
  useEffect(()=>{
    const previous=hologramBaseline.current,watching=visible&&pageVisible&&live&&!paused
    const hadCue=holograms.current.cues.length>0
    const observed=watching&&previous?.watching&&previous.scope===scope&&previous.showQuiet===showQuiet&&previous.snapshots!==snapshots
      ?officeEvents(previous.snapshots,snapshots,Date.now()):[]
    holograms.current=watching?mergeOfficeHolograms(holograms.current,observed,scene,hologramNow(),Date.now()):{...holograms.current,cues:[]}
    hologramBaseline.current={snapshots,scope,showQuiet,watching}
    if(hadCue||holograms.current.cues.length)paint(lastPainted.current)
  },[snapshots,scene,scope,showQuiet,visible,pageVisible,live,paused])

  const paint = (movement: Moving | null) => {
    const element = canvas.current, context = element?.getContext('2d')
    if (!element || !context) return
    painted.current = true
    lastPainted.current=movement
    const input = current.current, wallDate = new Date(input.wallNow)
    paintedMinute.current=Math.floor(input.wallNow/60_000)
    // Backing store follows rendered size × device pixel ratio so wide views stay crisp.
    const ratio = Math.max(1, Math.min(4, Math.ceil((element.clientWidth || input.scene.width) * (window.devicePixelRatio || 1) / input.scene.width * 4) / 4))
    const w = Math.round(input.scene.width * ratio), h = Math.round(input.scene.height * ratio)
    if (element.width !== w || element.height !== h) { element.width = w; element.height = h }
    const dailyActors=daily.current!.actors(input.scene,motionClock.current)
    const overrides=new Map([...leadOrigins.current,...[...leisureVisual.current].map(([key,value])=>[key,value.actor] as const)])
    for(const actor of dailyActors)overrides.set(actor.key,actor)
    const meeting=officeMeetingActor(active.current,input.scene,motionClock.current)
    if(meeting)overrides.set(meeting.key,meeting)
    if(movement)overrides.set(movement.actor.key,movement.actor)
    const actors=officeActorsWithArrivals(input.scene,arrivalTrips.current,motionClock.current).map(actor=>{
      const override=overrides.get(actor.key)
      return override?{...override,agent:actor.agent,task:actor.task}:(arrivalTrips.current.has(actor.key)?actor:officeActorAtWorkPlace(input.scene,actor,workPlaces.current.get(actor.key)))
    })
    for(const actor of dailyActors)if(!actors.some(a=>a.key===actor.key))actors.push(actor)
    if(movement&&!actors.some(actor=>actor.key===movement.actor.key))actors.push(movement.actor)
    const remoteKeys=new Set(input.sourceScene.floors.flatMap(f=>(f.collaboration??[]).filter(member=>member.remote).map(member=>member.key)))
    for(let index=actors.length-1;index>=0;index--)if(remoteKeys.has(actors[index].key))actors.splice(index,1)
    context.setTransform(ratio,0,0,ratio,0,0)
    const skyElement=skyCanvas.current, skyContext=skyElement?.getContext('2d')
    const surfaceHeight=input.scene.floors.find(f=>f.kind==='lounge')?.height??0
    const liftVisual=officeLiftFrame(lift.current!,motionClock.current,input.scene)
    if(hatchButton.current){
      const button=officeGardenLiftButton(lift.current!,input.scene,motionClock.current)
      hatchButton.current.setAttribute('aria-expanded',String(button.expanded))
      hatchButton.current.setAttribute('aria-label',button.label)
      hatchButton.current.dataset.liftState=button.state
      hatchButton.current.disabled=button.disabled
    }
    if(skyElement&&skyContext){
      if(skyElement.width!==w||skyElement.height!==Math.round(surfaceHeight*ratio)){skyElement.width=w;skyElement.height=Math.round(surfaceHeight*ratio)}
      skyContext.setTransform(ratio,0,0,ratio,0,0)
      drawOfficeDaylight(skyContext,input.scene,wallDate,elapsed.current)
      if(input.enabled)drawOfficeSkyBalloon(skyContext,input.scene,elapsed.current,wallDate)
    }
    const sharingPeer=daily.current!.sharingPeer(input.scene,motionClock.current,actors)
    const greeting = greet.current && greet.current.until > elapsed.current ? greet.current.key : sharingPeer
    const publicFloors=input.scene.floors.filter(f=>!f.annexOf)
    const publicIds=new Set(publicFloors.filter(f=>!f.constructing).map(f=>f.id))
    const transitDoorIds=officeDoorTraffic(input.scene,actors,doorTrips(),motionClock.current)
    const exchange=officeWorkExchange(active.current,{...input.scene,actors},motionClock.current)
    const leisureKeys=new Set([...leisureTrips.current.keys(),...arrivalTrips.current.keys(),...daily.current!.guests.keys(),...(meeting?[meeting.key]:[])])
    const socialBusy=new Set([...leisureKeys,...(active.current?[active.current.actorKey]:[]),...(exchange?[exchange.senderKey,exchange.receiverKey]:[])])
    const weather=skyWeather(wallDate)
    const policy=officeLivelinessPolicy(input.liveliness,officeDaylight(wallDate).night)
    const wardrobeTheme=officeWardrobeTheme(wallDate),unit=input.scene.width/450
    const wardrobe=officeWardrobeTransitionFrame(wardrobeStore.current,actors.map(actor=>{
      const floor=input.scene.floors.find(f=>f.id===actor.floorId)
      const doorway=officeLanding(input.scene,actor.floorId)
      const action=actor.pose?.objectAction??actor.objectAction
      return {key:actor.key,theme:wardrobeTheme,slot:actor.appearance.slot,outdoor:floor?.kind==='lounge',inLift:actor.pose?.inLift,hidden:actor.hidden||(actor.pose?.opacity??1)<.8,
        atEntrance:Boolean(doorway&&Math.abs(actor.x-doorway.x)<35*unit&&Math.abs(actor.y-doorway.y)<35*unit),
        freeHand:!isWorking(actor.agent.status)&&!actor.pose?.typing&&!actor.pose?.hand&&!actor.pose?.carry&&!actor.pose?.climb&&!actor.pose?.stretch&&!['book','game','snack'].includes(action??'')}
    }),motionClock.current)
    wardrobeStore.current=wardrobe.store
    const sharedRest=officeSharedRest({...input.scene,actors:actors.filter(a=>publicIds.has(a.floorId)||a.floorId===input.peekId)},input.enabled?elapsed.current/policy.socialCadenceMultiplier:0,socialBusy,{night:policy.night,wet:weather==='rain'||weather==='storm',clear:weather==='clear'})
    const options={ selectionCue:selectionCue.current,time: elapsed.current, date: wallDate, now: input.wallNow, dailyArt:daily.current!.art(wallDate,input.scene,motionClock.current), live: input.live,
      exchange,sharedRest,wardrobeLooks:wardrobe.looks,socialCadenceMultiplier:policy.socialCadenceMultiplier,
      motion: input.enabled, pets: input.pets, petEvent: input.petEvent, selectedKey: input.selectedKey,
      openDoorFloorId:input.peekId,transitDoorIds,architectureArt:input.architectureArt,roomArt:input.roomArt,avatarArt:input.avatarArt,liftSurfaceOpen:false,lift:liftVisual,
      objectCue:objectCue.current&&objectCue.current.until>elapsed.current?objectCue.current:null,
      leisureKeys,
      tripKey: input.enabled ? active.current?.actorKey ?? null : null, greetKey: input.enabled ? greeting : null, paintDeskLights:false }
    const publicScene={ ...input.scene, actors:actors.filter(a=>publicIds.has(a.floorId)) }
    const deskElement=deskLightCanvas.current,deskContext=deskElement?.getContext('2d')
    if(deskElement&&deskContext){
      const art=input.roomArt
      const lightFloors=art?.canteenShell?input.scene.floors.filter(f=>f.desktopArt&&f.kind==='team'&&!f.constructing&&!f.annexOf):[]
      const signature=JSON.stringify([w,h,ratio,lightFloors.map(f=>[f.id,f.y,f.height,f.room,[...officePaintedStationOccupancy(publicScene,f)].sort()])])
      if(deskElement.width!==w||deskElement.height!==h||deskLightPainted.current?.signature!==signature||deskLightPainted.current.art!==art){
        deskLightPainted.current={signature,art}
        if(deskElement.width!==w||deskElement.height!==h){deskElement.width=w;deskElement.height=h}
        deskContext.setTransform(ratio,0,0,ratio,0,0);deskContext.clearRect(0,0,input.scene.width,input.scene.height)
        if(art)for(const floor of lightFloors)drawOfficeRoomDeskLights(deskContext,publicScene,floor,art)
      }
    }
    const offsets = drawOfficeFrame(context, publicScene,options)
    if(holograms.current.cues.length){
      const hologramScene={...input.scene,quietTeams:input.sourceScene.quietTeams,actors:actors.filter(a=>publicIds.has(a.floorId)),floors:input.scene.floors.map(f=>({...f,collaboration:input.sourceScene.floors.find(current=>current.id===f.id)?.collaboration}))}
      const clock=hologramNow()
      holograms.current=pruneOfficeHolograms(holograms.current,hologramScene,clock)
      const frames=officeHologramFrames(holograms.current,hologramScene,clock,input.enabled,actor=>{
        const offset=offsets.get(actor.key)
        return offset?.scale===undefined?undefined:offset.scale*input.scene.width/450
      })
      drawOfficeHolograms(context,frames,(c,appearance,x,y,time,pose)=>drawOfficeAvatar(c,appearance,x,y,time,pose,input.avatarArt))
    }
    const annex=input.scene.floors.find(f=>f.id===input.peekId&&f.annexOf),peek=peekCanvas.current,peekContext=peek?.getContext('2d')
    if(annex&&peek&&peekContext){
      const ph=Math.max(1,annex.height??0)
      if(peek.width!==w||peek.height!==Math.round(ph*ratio)){peek.width=w;peek.height=Math.round(ph*ratio)}
      peekContext.setTransform(ratio,0,0,ratio,0,0)
      const local={...input.scene,height:ph,floors:[{...annex,y:0}],actors:actors.filter(a=>a.floorId===annex.id).map(a=>({...a,y:a.y-annex.y}))}
      for(const [key,offset] of drawOfficeFrame(peekContext,local,{...options,cutawayFloor:annex.id}))offsets.set(key,offset)
    }
    if (!cssScale.current) cssScale.current = (element.clientWidth || input.scene.width) / input.scene.width
    for (const [key, button] of agentRefs.current) {
      const offset = offsets.get(key), k = cssScale.current
      const value = offset ? `translate(${(offset.dx * k).toFixed(1)}px,${(offset.dy * k).toFixed(1)}px) scale(${(offset.scale??1).toFixed(4)})` : ''
      button.style.transformOrigin='50% 96%'
      if (appliedTransforms.current.get(key) !== value) { button.style.transform = value; appliedTransforms.current.set(key, value) }
    }
  }
  const greetArrival = (trip: OfficeTrip, scene: OfficeScene) => {
    const arrived = scene.actors.find(actor => actor.key === trip.actorKey)
    if (trip.event.kind !== 'arrived' || !arrived?.floorId) return
    if ((greetCooldown.current.get(arrived.floorId) ?? -Infinity) > elapsed.current) return
    const greeter = scene.actors.filter(actor => actor.floorId === arrived.floorId && actor.key !== arrived.key && !actor.hidden && actor.zone === 'desk')
      .sort((a, b) => Math.abs(a.x - arrived.x) - Math.abs(b.x - arrived.x))[0]
    if (!greeter) return
    greet.current = { key: greeter.key, until: elapsed.current + 1 }
    greetCooldown.current.set(arrived.floorId, elapsed.current + 8)
  }
  // Paint on mount and scene changes even when the animation loop is suspended.
  // A restored/hidden pane must never leave a newly mounted canvas transparent.
  // The RAF owns moving actors. A clock/snapshot repaint must not flash them back to a desk.
  const wallMinute = Math.floor(now / 60_000)
  useEffect(() => {
    const displayChanged=paintedCollaboration.current!==collaborationOverrides
    paintedCollaboration.current=collaborationOverrides
    // A manual display choice also applies while stale or while another actor
    // is travelling; preserve that actor's current frame instead of its desk.
    if(displayChanged){paint(lastPainted.current);return}
    if (!live && painted.current) {
      // Daylight and lamps follow the wall clock even when scene updates are paused.
      if (desktopArt&&paintedMinute.current!==wallMinute) paint(lastPainted.current)
      return
    }
    if (!enabled || (!active.current&&!queue.current.length)) paint(null)
  }, [visualScene, wallMinute, enabled, live, selectedKey, petEvent, peekId, architectureArt, collaborationOverrides, desktopArt])
  useEffect(()=>{if(architectureArt||avatarArt)paint(lastPainted.current)},[architectureArt,avatarArt])
  const roomPaintKey=JSON.stringify([visualScene.width,visualScene.height,...visualScene.floors.filter(f=>f.kind==='team').map(f=>[f.id,f.sessionId,f.title,f.room,f.y,f.height,f.constructing])])
  useEffect(()=>{
    const element=roomCanvas.current,context=element?.getContext('2d')
    if(!element||!context)return
    const ratio=Math.max(1,Math.min(3,window.devicePixelRatio||1))
    const width=Math.round(visualScene.width*ratio),height=Math.round(visualScene.height*ratio)
    if(element.width!==width)element.width=width
    if(element.height!==height)element.height=height
    context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,visualScene.width,visualScene.height)
    for(const floor of visualScene.floors)drawOfficeRoomDesign(context,visualScene,floor,roomArt)
    paint(lastPainted.current)
  },[roomPaintKey,roomArt])
  useEffect(()=>{if(peekId)paint(lastPainted.current)},[peekId])
  useEffect(()=>{if(peekId&&!scene.floors.some(f=>f.id===peekId))setPeekId(null)},[scene,peekId])
  useEffect(() => {
    const element = canvas.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { cssScale.current = element.clientWidth / current.current.scene.width; if (!current.current.enabled) paint(lastPainted.current) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [snapshots.length === 0])
  useEffect(() => {
    if (!enabled) return
    let handle = 0, lastTime = 0, lastPaint = 0, lastLabels = 0
    const interval = animationMode === 'low' ? 1000 / 24 : 1000 / 45
    const tick = (time: number) => {
      handle = requestAnimationFrame(tick)
      if (!lastTime) lastTime = time
      const delta = Math.min(200, time - lastTime) * (animationMode === 'low' ? .5 : 1)
      lastTime = time; elapsed.current += delta / 1000; motionClock.current += delta
      // Freeze on every RAF, including skipped paint frames, while old floors are held.
      const growing=new Set(current.current.scene.floors.filter(f=>f.constructing).map(f=>f.id))
      for(const floor of current.current.scene.floors)if(floor.annexOf&&growing.has(floor.annexOf))growing.add(floor.id)
      if(arrivalTrips.current.size&&[...arrivalTrips.current.values()].some(trip=>growing.has(trip.actor.floorId))){
        for(const [key,trip] of arrivalTrips.current)arrivalTrips.current.set(key,{...trip,startedAt:trip.startedAt+delta,endsAt:trip.endsAt+delta})
        shiftOfficeLiftTime(lift.current!,delta)
        daily.current!.shiftMotion(delta)
        if(active.current?.segments.some(s=>s.liftPhase))active.current={...active.current,startedAt:active.current.startedAt+delta,endsAt:active.current.endsAt+delta}
      }
      if (time - lastPaint < interval) return
      lastPaint = time
      const input = current.current
      {
        const target=desktopArt&&arrivalTrips.current.size?officeSceneAtWorkPlaces(input.target,workPlaces.current):input.target
        const arrivals=advanceOfficeArrivals(arrivalTrips.current,input.scene,motionClock.current,lift.current!,arrivalSceneWithMeetings(target))
        arrivalTrips.current=arrivals.trips
        if(arrivals.completed.length)hadMotionSync.current=true
        for(const trip of arrivals.completed){
          greetArrival(trip,input.scene)
          const assigned=pendingArrivalMeetings.current.get(trip.actorKey)
          if(assigned){
            pendingArrivalMeetings.current.delete(trip.actorKey)
            const beforeAtTable={...input.scene,actors:input.scene.actors.map(a=>a.key===trip.actorKey?{...a,x:trip.actor.x,y:trip.actor.y,floorId:trip.actor.floorId}:a)}
            queue.current.unshift({event:{...assigned,at:Date.now()},before:beforeAtTable})
          }
        }
      }
      if(motionClock.current>=nextSeasonalAt.current){
        nextSeasonalAt.current=motionClock.current+45_000*officeLivelinessPolicy(input.liveliness,officeDaylight(new Date(input.wallNow)).night).objectCadenceMultiplier
        const available={...input.scene,actors:input.scene.actors.filter(a=>a.key!==active.current?.actorKey&&a.key!==active.current?.meetingPartner?.actorKey&&!leisureTrips.current.has(a.key)&&!arrivalTrips.current.has(a.key)&&!daily.current!.guests.has(a.key)&&a.agent.status!=='failed')}
        const rooms=input.scene.floors.filter(f=>f.kind==='break')
        for(let i=0;i<rooms.length;i++){
          const floor=rooms[(seasonalCursor.current+i)%rooms.length]
          const object=officeSeasonalObjects(floor,input.scene.width,new Date(input.wallNow))[0]
          const person=object&&nearestLeisureActor(available,floor,object)
          if(person){const trip=createOfficeLeisureTrip(input.scene,person.key,object,motionClock.current);if(trip){leisureTrips.current.set(person.key,{trip,kind:object.kind});seasonalCursor.current++;break}}
        }
      }
      queue.current = queue.current.filter(pending => (daily.current!.guests.has(pending.event.actorKey)||Boolean(pending.event.parentKey&&daily.current!.guests.has(pending.event.parentKey))||pending.event.kind==='left'||Date.now() - pending.event.at <= 15_000)&&(pending.event.kind==='left'||!arrivalTrips.current.has(pending.event.actorKey))&&(pending.event.kind!=='left'||!input.sourceScene.actors.some(a=>a.key===pending.event.actorKey&&!a.hidden)))
      const dailyBefore={count:daily.current!.guests.size,open:daily.current!.canteenOpen}
      const busyKeys=new Set([...arrivalTrips.current.keys(),...leisureTrips.current.keys(),...queue.current.flatMap(p=>[p.event.actorKey,...(p.event.parentKey?[p.event.parentKey]:[])]),...(active.current?[active.current.actorKey,...(active.current.meetingPartner?[active.current.meetingPartner.actorKey]:[])]:[])])
      const realQueue=queue.current.some(p=>!daily.current!.guests.has(p.event.actorKey)&&(!p.event.parentKey||!daily.current!.guests.has(p.event.parentKey)))
      daily.current!.step({source:input.sourceScene,scene:input.scene,date:new Date(input.wallNow),at:motionClock.current,liveliness:input.liveliness,lift:lift.current!,busyKeys,blocked:Boolean(active.current||arrivalTrips.current.size||realQueue),preemptQueuedTravel:Boolean(arrivalTrips.current.size||active.current?.segments.some(s=>s.liftPhase)||queue.current.some(p=>p.event.kind==='left'&&!daily.current!.guests.has(p.event.actorKey))),onLiftCancelled:keys=>{
        for(const key of keys){
          const prior=arrivalTrips.current.get(key)??(active.current?.actorKey===key?active.current:null)
          if(!prior)continue
          const frame=officeTripFrame(prior,motionClock.current)
          const before={...input.scene,actors:input.scene.actors.map(a=>a.key===key?{...a,...frame.point,floorId:frame.floorId??a.floorId}:a)}
          const rebuilt=createOfficeTrip(prior.event,before,input.scene,motionClock.current)
          const trip=rebuilt?reserveOfficeLiftTrip(lift.current!,rebuilt,input.scene,motionClock.current):null
          if(arrivalTrips.current.has(key)){if(trip)arrivalTrips.current.set(key,trip);else arrivalTrips.current.delete(key)}
          else active.current=trip
        }
      }})
      if(dailyBefore.count!==daily.current!.guests.size||dailyBefore.open!==daily.current!.canteenOpen)setDailyVersion(n=>n+1)
      for(const [key,origin] of daily.current!.completedOrigins)if(leadOrigins.current.has(key))leadOrigins.current.set(key,origin)
      const ledger=JSON.stringify(daily.current!.ledger)
      if(ledger!==persistedDaily.current){persistedDaily.current=ledger;try{localStorage.setItem(OFFICE_DAILY_STORAGE,ledger)}catch{}}
      queue.current=queue.current.map(p=>(daily.current!.completedOrigins.has(p.event.actorKey)||Boolean(p.event.parentKey&&daily.current!.completedOrigins.has(p.event.parentKey)))?{...p,event:{...p.event,at:Date.now()}}:p)
      if (held.current && !active.current && !queue.current.some(pending => pending.event.kind === 'left')) {
        holdLayout(null); setMoving(null); return
      }
      if (!active.current&&!arrivalTrips.current.size) {
        while (queue.current.length) {
          const index = queue.current.findIndex(item=>!daily.current!.guests.has(item.event.actorKey)&&(!item.event.parentKey||!daily.current!.guests.has(item.event.parentKey))&&(!held.current||item.event.kind==='left'))
          if (index < 0) break
          const pending = queue.current.splice(index, 1)[0]
          if (pending.event.kind!=='left'&&Date.now() - pending.event.at > 15_000) continue
          const trip=createVisualTrip(pending.event,pending.before,input.scene,motionClock.current)
          if(!trip)leadOrigins.current.delete(pending.event.actorKey)
          if (trip) { daily.current!.completedOrigins.delete(trip.actorKey);active.current = trip.segments.some(s=>s.liftPhase)?reserveOfficeLiftTrip(lift.current!,trip,input.scene,motionClock.current):trip; break }
        }
      }
      let movement: Moving | null = null
      if(!desktopArt&&!active.current&&!held.current&&!arrivalTrips.current.size&&motionClock.current>=nextWorkAt.current){
        nextWorkAt.current=motionClock.current+5000
        const work=officeWorkPulse({...input.scene,actors:input.scene.actors.filter(a=>!daily.current!.guests.has(a.key))},workCursor.current++,Date.now())
        if(work)active.current=createVisualTrip(work,input.scene,input.scene,motionClock.current)
      }
      if (active.current) {
        const trip = active.current, frame = officeWorkTripFrame(trip, motionClock.current,input.scene)
        const actor = input.scene.actors.find(actor => actor.key === trip.actorKey) ?? (trip.event.kind === 'left' ? trip.actor : null)
        if (frame.done || !actor || (trip.event.kind==='activity'&&!isWorking(actor.agent.status))) {
          hadMotionSync.current=true
          if(frame.done&&actor&&trip.event.kind==='activity'){
            const place=rememberOfficeWorkPlace(input.scene,actor,frame.point,trip.event.station??officeWorkStation(actor))
            if(place)workPlaces.current.set(actor.key,place)
          }
          if (frame.done) greetArrival(trip, input.scene)
          if (trip.event.kind === 'left' && held.current) holdLayout({ ...held.current, actors: held.current.actors.filter(item => item.key !== trip.actorKey) })
          active.current = null; setMoving(null)
        }
        else {
          movement = { actor: { ...actor, ...frame.point, ...(trip.meetingPartner ? { stand: true, objectAction: undefined } : {}), floorId:frame.floorId??actor.floorId,workStation:frame.seatStation??trip.event.station??actor.workStation, pose: { ...frame.pose, ...(trip.meetingPartner ? { objectAction: undefined } : {}), meeting:Boolean(trip.meetingPartner),lead: actor.agent.role === 'lead' } }, caption: trip.caption, elevatorY: frame.elevatorY, station:trip.event.station }
          if(trip.event.kind==='activity'){
            const place=rememberOfficeWorkPlace(input.scene,actor,movement.actor)
            if(place)workPlaces.current.set(actor.key,place)
          }
        }
      }
      for(const [key,entry] of leisureTrips.current){
        const actor=input.scene.actors.find(a=>a.key===key)
        if(!actor||actor.hidden||actor.zone!=='lounge'||daily.current!.guests.has(key)){leisureTrips.current.delete(key);leisureVisual.current.delete(key);hadMotionSync.current=true;continue}
        const dx=actor.x-entry.trip.actor.x,dy=actor.y-entry.trip.actor.y
        if(dx||dy){entry.trip={...entry.trip,actor,segments:entry.trip.segments.map(s=>({...s,from:{x:s.from.x+dx,y:s.from.y+dy},to:{x:s.to.x+dx,y:s.to.y+dy}}))}}
        const frame=officeTripFrame(entry.trip,motionClock.current)
        if(frame.done){leisureTrips.current.delete(key);leisureVisual.current.delete(key);hadMotionSync.current=true;continue}
        leisureVisual.current.set(key,{actor:{...actor,...frame.point,stand:true,pose:{...frame.pose,sit:!frame.pose.walk&&(entry.kind==='book'||entry.kind==='snack'),objectAction:frame.pose.walk?undefined:entry.kind}},caption:entry.trip.caption,elevatorY:null})
      }
      const keepWork=new Set([...input.scene.actors.filter(a=>a.zone==='desk').map(a=>a.key),...queue.current.map(p=>p.event.actorKey),...(active.current?[active.current.actorKey]:[])])
      for(const key of workPlaces.current.keys())if(!keepWork.has(key))workPlaces.current.delete(key)
      const originKeys=officePendingOriginKeys(queue.current.map(p=>p.event),active.current?.actorKey)
      for(const key of leadOrigins.current.keys())if(!originKeys.has(key))leadOrigins.current.delete(key)
      for(const key of daily.current!.completedOrigins.keys())if(!originKeys.has(key))daily.current!.completedOrigins.delete(key)
      restoreOfficeLiftCall(lift.current!,input.target,motionClock.current)
      paint(movement)
      if (time - lastLabels >= 80) {
        const activeMotion=Boolean(movement||active.current||leisureVisual.current.size||arrivalTrips.current.size||daily.current!.guests.size||officeLiftFrame(lift.current!,motionClock.current).moving)
        if(activeMotion||hadMotionSync.current){
          hadMotionSync.current=activeMotion
          setMoving(movement)
          setRestMoving(leisureVisual.current.size?[...leisureVisual.current.values()]:EMPTY_REST_MOVING)
          setArrivalTick(n=>n+1)
        }
        lastLabels = time
      }
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [enabled, animationMode])

  // Name tags never overlap: each is at most the gap to its nearest same-row neighbour (minus 4px).
  const tagRoom = useMemo(() => {
    const room = new Map<string, number>(), seated = officeSceneAtWorkPlaces(visualScene,workPlaces.current).actors.map(a=>moving?.actor.key===a.key?moving.actor:a).filter(actor => !actor.hidden)
    for (const actor of seated) {
      let nearest = Infinity
      for (const other of seated) if (other !== actor && other.zone === actor.zone && other.floorId === actor.floorId && Math.abs(other.y - actor.y) < 12) nearest = Math.min(nearest, Math.abs(other.x - actor.x))
      room.set(actor.key, Math.min(nearest, actor.zone === 'lounge' ? 70 : 99))
    }
    return room
  }, [visualScene,moving,visualTick])
  const restByKey=new Map([...leadOrigins.current,...restMoving.map(m=>[m.actor.key,m.actor] as const)])
  if(enabled&&baseline.current?.enabled&&baseline.current.scene!==scene)for(const change of officeLeadRestTransitions(baseline.current.scene,scene))if(!restByKey.has(change.actorKey))restByKey.set(change.actorKey,officeActorAtWorkPlace(baseline.current.scene,change.from,workPlaces.current.get(change.actorKey)))
  const dailyActors=daily.current!.actors(visualScene,motionClock.current)
  for(const actor of dailyActors)restByKey.set(actor.key,actor)
  const meeting=officeMeetingActor(active.current,visualScene,motionClock.current)
  if(meeting)restByKey.set(meeting.key,meeting)
  // Project pending evidence during render too, before the effect commits it, so a new name tag
  // never gets one browser frame at its canonical desk while its body waits outside.
  let displayedArrivals=arrivalTrips.current
  const priorDisplay=baseline.current
  if(enabled&&priorDisplay?.enabled&&priorDisplay.scope===scope&&priorDisplay.showQuiet===showQuiet&&priorDisplay.scene!==scene){
    const priorIds=new Set(priorDisplay.snapshots.map(s=>s.sessionId))
    const newTeams=new Set(priorDisplay.snapshots.length?snapshots.filter(s=>!priorIds.has(s.sessionId)).map(s=>s.sessionId):[])
    displayedArrivals=addOfficeArrivals(displayedArrivals,officePresenceEvents(priorDisplay.scene,scene,populatedOfficeTeams(priorDisplay.snapshots),Date.now(),newTeams),priorDisplay.scene,scene,motionClock.current,structuredClone(lift.current!))
  }
  const allDisplayed=officeActorsWithArrivals(visualScene,displayedArrivals,motionClock.current).map(actor=>{
    const override=moving?.actor.key===actor.key?moving.actor:restByKey.get(actor.key)
    return override?{...override,agent:actor.agent,task:actor.task}:(displayedArrivals.has(actor.key)?actor:officeActorAtWorkPlace(visualScene,actor,workPlaces.current.get(actor.key)))
  })
  for(const actor of dailyActors)if(!allDisplayed.some(a=>a.key===actor.key))allDisplayed.push(actor)
  if(moving&&!allDisplayed.some(a=>a.key===moving.actor.key))allDisplayed.push(moving.actor)
  const remoteKeys=new Set(scene.floors.flatMap(f=>(f.collaboration??[]).filter(member=>member.remote).map(member=>member.key)))
  for(let index=allDisplayed.length-1;index>=0;index--)if(remoteKeys.has(allDisplayed[index].key))allDisplayed.splice(index,1)
  const travellingKeys=new Set([active.current?.actorKey,active.current?.meetingPartner?.actorKey,...arrivalTrips.current.keys(),...leisureTrips.current.keys(),...daily.current!.guests.keys(),...allDisplayed.filter(actor=>officeInsideLift(visualScene,actor)).map(actor=>actor.key)].filter((key):key is string=>Boolean(key)))
  const publicFloors=visualScene.floors.filter(f=>!f.annexOf)
  const publicIds=new Set(publicFloors.filter(f=>!f.constructing).map(f=>f.id))
  const displayed=allDisplayed.filter(a=>publicIds.has(a.floorId))
  // People inside each team's break room right now. Overflow residents still count; anyone
  // out in the garden, canteen or lift does not.
  const breakRoomCounts=new Map<string,number>()
  if(desktopArt)for(const floor of publicFloors){
    if(floor.kind!=='team')continue
    const annex=visualScene.floors.find(f=>f.annexOf===floor.id&&f.kind==='break')
    breakRoomCounts.set(floor.id,annex?allDisplayed.filter(actor=>actor.floorId===annex.id&&(actor.pose?.opacity??1)>.5&&!officeInsideLift(visualScene,actor)).length:0)
  }
  const peekFloor=visualScene.floors.find(f=>f.id===peekId&&f.annexOf)
  const visitObject=(floor:OfficeScene['floors'][number],object:{kind:OfficeLeisureAction;label:string;x:number;y:number})=>{
    if(!officeVendorAllowsObject(new Date(current.current.wallNow),floor.kind,object.kind))return
    const playable={...current.current.scene,actors:current.current.scene.actors.filter(a=>a.key!==active.current?.actorKey&&!arrivalTrips.current.has(a.key)&&!daily.current!.guests.has(a.key))}
    const person=nearestLeisureActor(playable,floor,object)
    if(!person)return
    if(current.current.enabled){const trip=createOfficeLeisureTrip(current.current.scene,person.key,object,motionClock.current,leisureVisual.current.get(person.key)?.actor);if(trip)leisureTrips.current.set(person.key,{trip,kind:object.kind})}
    else{objectCue.current={actorKey:person.key,kind:object.kind,until:elapsed.current+7};paint(lastPainted.current)}
  }

  const ambient = officeAmbient(new Date(now))
  const sky = officeSky(new Date(now))
  const seasonalActivity = officeSeasonalActivity(new Date(now))
  const daylight = officeDaylight(new Date(now))
  const gardenLighting=desktopArt?officeDesktopGardenLighting(daylight):undefined
  const vendor=officeVendorState(new Date(now)),vendorLabel=vendor.open?'Garden shop open':vendor.wet&&!vendor.night?'Garden shop sheltered, service paused':'Garden shop closed'
  const working = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => isWorking(agent.status)).length, 0)
  const needsYou = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => agent.status.startsWith('waiting_')).length, 0)
  const lounge = visualScene.floors.find(floor => floor.kind === 'lounge')
  const dailyActor=dailyActors[0]
  const liftMoving=officeLiftFrame(lift.current!,motionClock.current).moving
  const captionMovement=moving??restMoving[0]??(dailyActor?{actor:dailyActor,caption:dailyActor.activity,elevatorY:null}:null)
  const inspectedFloor=stationSelection?scene.floors.find(f=>f.kind==='team'&&f.sessionId===stationSelection.sessionId):null
  const stationPeople=inspectedFloor&&stationSelection?officeStationUsers(scene,inspectedFloor,stationSelection.kind):[]
  const selectedInfo=officeAgentInfo(snapshots,selectedKey)
  const selectedActor=allDisplayed.find(actor=>actor.key===selectedKey)
  const selectedRemote=scene.floors.flatMap(f=>f.collaboration??[]).find(member=>member.key===selectedKey&&member.remote&&officeCollaboratorDisplayed(member))
  const activityActor=!desktopArt?undefined:selectedInfo?selectedActor:
    scene.actors.find(actor=>actor.agent.status.startsWith('waiting_'))??scene.actors.find(actor=>isWorking(actor.agent.status))??captionMovement?.actor
  const activityInfo=desktopArt?(selectedInfo??officeAgentInfo(snapshots,activityActor?.key??null)):null
  const activityProgress=activityInfo?.agent.role==='lead'?officePlanningInfo(snapshots,activityInfo.team.sessionId):null
  const doorTraffic=officeDoorTraffic(visualScene,allDisplayed,doorTrips(),motionClock.current)
  const selectedBoard=inspectedFloor?.sessionId&&stationSelection?.kind==='planning'?officePlanningInfo(snapshots,inspectedFloor.sessionId):null
  const rememberTrigger=()=>{const element=document.activeElement;inspectorTrigger.current=element instanceof HTMLElement&&element!==document.body?element:null;focusInspector.current=true;discovery.dismiss()}
  const inspectorFocused=()=>{focusInspector.current=false}
  const closeInspector=()=>{
    const closingFocus=document.activeElement
    if(stationSelection)setStationSelection(null)
    else if(selectedInfo)onSelect(selectedInfo.team.sessionId,selectedInfo.agent.id)
    requestAnimationFrame(()=>{
      // A newer door/panel interaction owns focus; never replay the old close over it.
      if(document.activeElement!==document.body&&document.activeElement!==closingFocus)return
      if(inspectorTrigger.current?.isConnected)inspectorTrigger.current.focus();else viewport.current?.focus()
    })
  }
  const inspectAgent=(sessionId:string,agentId:string)=>{
    if(enabled)selectionCue.current={actorKey:officeKey(sessionId,agentId),startedAt:elapsed.current}
    sound.playCue('paper')
    rememberTrigger();setStationSelection(null)
    if(officeKey(sessionId,agentId)!==selectedKey)onSelect(sessionId,agentId)
  }
  const inspectStation=(sessionId:string,kind:OfficeWorkStation)=>{
    rememberTrigger()
    if(selectedInfo)onSelect(selectedInfo.team.sessionId,selectedInfo.agent.id)
    setStationSelection({sessionId,kind})
  }
  const revealAgent=(key:string)=>{
    const target=officeRevealTarget({...visualScene,actors:allDisplayed,floors:visualScene.floors.map(floor=>({...floor,collaboration:scene.floors.find(current=>current.id===floor.id)?.collaboration}))},key)
    if(!target)return false
    setPeekId(target.peekId)
    if(target.peekId)lastDoor.current=[...(viewport.current?.querySelectorAll<HTMLButtonElement>('.of-annex-door')??[])].find(button=>button.dataset.annexId===target.peekId)??null
    // Let the selected panel measure its clearance before revealing a low floor.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const view=viewport.current
      if(!view?.isConnected)return
      const building=view.querySelector<HTMLElement>('.of-building'),scale=(building?.clientWidth??view.clientWidth)/visualScene.width
      const panel=view.parentElement?.querySelector<HTMLElement>('.of-inspector')
      const uncovered=panel?Math.max(80,Math.min(view.clientHeight,panel.getBoundingClientRect().top-view.getBoundingClientRect().top-12)):view.clientHeight
      const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false
      view.scrollTo({top:Math.max(0,target.y*scale-uncovered*.5),behavior:enabled&&!reduce?'smooth':'instant'})
    }))
    return true
  }
  const lastFocusReveal = useRef(focusRevealTick)
  useEffect(() => {
    if (focusRevealTick !== undefined && focusRevealTick !== lastFocusReveal.current) {
      lastFocusReveal.current = focusRevealTick
      if (focusRevealTick > 0 && selectedKey) revealAgent(selectedKey)
    }
  }, [focusRevealTick, selectedKey])
  const locateSelected=()=>{
    if(!selectedInfo||!selectedKey)return
    discovery.dismiss()
    if(!revealAgent(selectedKey))onOpenTeam(selectedInfo.team.sessionId,selectedInfo.agent.id)
  }
  const nextAttention=()=>{
    const target=officeNextAttention(snapshots,attentionCursor.current)
    if(!target)return
    attentionCursor.current=target.key
    if(revealAgent(target.key))inspectAgent(target.sessionId,target.agentId)
    else onOpenTeam(target.sessionId,target.agentId)
  }
  const showTips=()=>{
    setStationSelection(null)
    if(selectedInfo)onSelect(selectedInfo.team.sessionId,selectedInfo.agent.id)
    discovery.show()
  }

  const focusArea=(top:number)=>{
    const view=viewport.current,building=view?.querySelector<HTMLElement>('.of-building')
    if(officeControls.current?.open)officeControls.current.open=false
    if(view&&building)view.scrollTop=top*building.clientWidth/visualScene.width
  }
  const areaSwitch=(compact=false)=>workroomTop!==undefined&&<div className="of-area-switch" data-compact={compact}>
    <button type="button" onClick={()=>focusArea(0)}>Garden</button><button type="button" onClick={()=>focusArea(workroomTop)}>Workroom</button>
  </div>
  const motionControl=<button type="button" aria-label={paused ? 'Resume Office motion' : 'Pause Office motion'} aria-pressed={paused} disabled={animationMode === 'off'}
    onClick={() => setPaused(value => !value)} title={animationMode === 'off' ? 'Effects off in Animation settings' : paused ? 'Resume Office motion' : 'Pause Office motion'}>
    <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>{desktopArt&&(paused?' Resume motion':' Pause motion')}</button>
  const atmosphere=<div className="of-atmosphere"><label>บรรยากาศ <select aria-label="Office atmosphere" value={liveliness} onChange={event=>setLiveliness(officeLiveliness(event.target.value))}><option value="quiet">สงบ</option><option value="normal">ปกติ</option><option value="lively">คึกคัก</option></select></label><button type="button" disabled={!sound.available} aria-label="Office ambient sound" aria-pressed={sound.enabled} title="เสียงบรรยากาศ · ปิดเป็นค่าเริ่มต้น" onClick={sound.toggle}>{sound.enabled?'เสียง: เปิด':'เสียง: ปิด'}</button>{onToggleAttentionNotify&&<button type="button" aria-label="Needs you alerts" aria-pressed={Boolean(attentionNotify)} title="แจ้งเตือนเมื่อเอเจนต์รอคุณ" onClick={onToggleAttentionNotify}>{attentionNotify?'แจ้งเตือน: เปิด':'แจ้งเตือน: ปิด'}</button>}{!desktopArt&&<small>{daylight.night?'กลางคืน · ลดกิจกรรมลง':'กิจกรรมพักระหว่างวัน'}</small>}</div>

  return (
    <section className="of-view" data-motion={enabled} data-liveliness={liveliness} data-discover={discovery.open} data-daily-guests={daily.current!.guests.size} data-canteen-open={daily.current!.canteenOpen} data-season={sky.season} data-holiday={sky.holiday??undefined} aria-label="Agent Office">
      <div className="of-toolbar">
        <span className="of-counts">{working} working</span>
        {needsYou > 0 && <button type="button" className="of-attention of-attention-action" aria-label="Go to next agent who needs you" title="ไปหาคนถัดไปที่รอคุณ" onClick={nextAttention}>{needsYou} need you ↗</button>}
        {!desktopArt&&<span className="of-link" data-tone={connection?.tone ?? (live ? 'ok' : 'warn')} title={connection?.detail} role="status">{connection?.label ?? (live ? 'Connected' : 'Reconnecting')}</span>}
        {desktopArt&&areaSwitch()}
        <time dateTime={new Date(now).toISOString()} title={`${ambient.name} · ${sky.label} · simulated weather · local time`}><span aria-hidden="true">{officeSkyIcon(sky)}</span> {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
        {selectedInfo&&<button type="button" aria-label="Locate selected agent" title="ไปหาคนที่เลือก" onClick={locateSelected}>⌖</button>}
        {desktopArt?<details className="of-scene-controls" ref={officeControls} onKeyDown={event=>{if(event.key==='Escape'&&officeControls.current?.open){officeControls.current.open=false;officeControls.current.querySelector('summary')?.focus();event.stopPropagation()}}}>
          <summary aria-label="Office settings" title="Office settings">⚙</summary>
          <div className="of-scene-controls-panel">{atmosphere}<div className="of-scene-controls-actions">{motionControl}<button type="button" aria-expanded={discovery.open} onClick={()=>{if(officeControls.current)officeControls.current.open=false;showTips()}}>Office tips</button></div>{areaSwitch(true)}</div>
        </details>:<><button type="button" aria-label="Show Office tips" title="วิธีใช้ Office" aria-expanded={discovery.open} onClick={showTips}>?</button>{motionControl}</>}

      </div>

      {!desktopArt&&atmosphere}
      <div className="of-scroll" ref={viewport} tabIndex={-1} style={{paddingBottom:inspectedFloor&&stationSelection||selectedInfo?inspectorHeight:0,boxSizing:'border-box'}}>
        {snapshots.length === 0 ? <p className="of-empty">Your teams will appear here.</p> : (
          <div className="of-building" style={{ width:desktopArt?undefined:'100%', maxWidth:900, aspectRatio:`${visualScene.width} / ${visualScene.height}` } as CSSProperties}>
            <canvas ref={skyCanvas} aria-hidden="true" style={{height:`${(visualScene.floors.find(f=>f.kind==='lounge')?.height??0)/visualScene.height*100}%`,zIndex:0}} />
            {publicFloors.filter(f=>f.kind!=='quiet').map(floor=><div key={`art-${floor.id}`} aria-hidden="true" data-season={floor.kind==='lounge'?sky.season:undefined} className={`of-art of-art-${floor.kind==='lounge'?'surface':floor.room}`} style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`,filter:floor.kind==='lounge'?`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`:undefined,...(floor.kind==='lounge'?gardenLighting:undefined)} as CSSProperties} />)}
            <div aria-hidden="true" className="of-art of-art-bottom" style={{bottom:0,height:`${visualScene.width/3/visualScene.height*100}%`}} />
            {!desktopArt&&!!lounge?.height&&<>
              <div aria-hidden="true" data-season={sky.season} className="of-hatch-closed" style={{height:`${lounge.height/visualScene.height*100}%`,filter:`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`}}/>
              <div aria-hidden="true" style={{position:'absolute',top:0,left:0,width:'100%',height:`${lounge.height/visualScene.height*100}%`,zIndex:0,pointerEvents:'none',filter:`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`}}><OfficeGardenInfill season={sky.season} width={visualScene.width} height={lounge.height}/></div>
            </>}
            <span className="of-season-label" title={`${sky.label} · Simulated weather · ${seasonalActivity.label}`} style={{top:`calc(${((publicFloors.find(f=>f.kind!=='lounge')?.y??(lounge?.height??0)*.9)+5)/visualScene.height*100}% - 26px)`}}>{sky.label} · {seasonalActivity.label}</span>
            <canvas ref={roomCanvas} aria-hidden="true" style={{zIndex:0,pointerEvents:'none',height:'100%'}} />
            <canvas ref={deskLightCanvas} className="of-desk-lights" aria-hidden="true" style={{zIndex:0,pointerEvents:'none',height:'100%'}} />
            {desktopArt&&roomArt?.canteenShell&&publicFloors.filter(floor=>floor.kind==='team'&&!floor.constructing).flatMap(floor=>PAINTED_STATION_SIGNS.map(sign=>{
              const wall=sign.label==='Planning'
              if(wall&&!roomArt.planningDesk)return null
              const left=`${sign.x*100}%`
              return <span key={`${floor.id}-${sign.label}`} aria-hidden="true" className="of-station-sign" data-wall={wall?'left':undefined}
                style={{left:wall?`max(25px, ${left})`:left,top:`${(floor.y+(floor.height??0)*sign.y)/visualScene.height*100}%`}}>{sign.label}</span>
            }))}
            {desktopArt&&roomArt?.canteenShell&&roomArt.planningDesk&&publicFloors.filter(floor=>floor.kind==='team'&&!floor.constructing).map(floor=>{
              const desk=roomDesktopPlanningDesk(floor,visualScene.width),users=officeStationUsers(scene,floor,'planning')
              return <button key={`planning-${floor.id}`} type="button" className="of-workbench" data-kind="planning" data-painted="true" data-active={users.length>0}
                aria-label={`${stationNames.planning}, ${floor.title}, ${users.length} working`} tabIndex={peekFloor?.sessionId===floor.sessionId?-1:0}
                onClick={()=>floor.sessionId&&inspectStation(floor.sessionId,'planning')}
                style={{left:`${desk.left/visualScene.width*100}%`,width:`${desk.width/visualScene.width*100}%`,top:`${desk.top/visualScene.height*100}%`,height:`${desk.height/visualScene.height*100}%`}}>
                <span>{stationNames.planning}{users.length>0&&<b> · {users.length}</b>}</span>
              </button>
            })}
            {visualScene.floors.filter(f=>f.kind==='team'&&!f.constructing).flatMap(floor=>officeStations(floor,visualScene.width).map(station=>{
              const users=officeStationUsers(scene,floor,station.kind)
              return <button key={`${floor.id}-${station.kind}`} type="button" className="of-workbench" data-kind={station.kind} data-facing={station.facing} data-painted={Boolean(roomArt?.stations)} data-active={users.length>0}
                aria-label={`${stationNames[station.kind]}, ${floor.title}, ${users.length} working`}
                tabIndex={peekFloor?.sessionId===floor.sessionId?-1:0}
                onClick={()=>floor.sessionId&&inspectStation(floor.sessionId,station.kind)}
                style={{left:`${(station.x-station.width/2)/visualScene.width*100}%`,top:`${(station.y-station.height*.88)/visualScene.height*100}%`,width:`${station.width/visualScene.width*100}%`,height:`${station.height/visualScene.height*100}%`,'--station-accent':floor.color} as CSSProperties}>
                <span>{stationNames[station.kind]}{users.length>0&&<b> · {users.length}</b>}</span>
                {users.length>0&&!roomArt?.stations&&<i aria-hidden="true"/>}
              </button>
            }))}
            {/* Every office has a progress board; compact rooms use a smaller wall panel. */}
            {visualScene.floors.filter(floor => floor.kind === 'team'&&!floor.constructing).map(floor => {
              // Geometry may be held during departures; content always comes from the current scene.
              const board = currentOfficeBoard(floor, scene), h = floor.height ?? 0
              const compact = floor.room !== 'room-stations-large'
              if (!board) return null
              const progress = board.total ? `${board.done} of ${board.total} tasks done` : 'No tasks yet'
              const painted = Boolean(desktopArt&&roomArt?.canteenShell)
              return <div key={`board-${floor.id}`} className="of-board" data-compact={compact} data-painted={painted} data-active={officeStationUsers(scene,floor,'planning').length>0} role="note"
                aria-label={`Team board: ${board.goal}. ${progress}.${board.items.map(item => ` ${BOARD_STATES[item.state]}: ${item.label}.`).join('')}`}
                style={{ top:`${(floor.y + h * (painted ? .202 : compact ? .24 : .19)) / visualScene.height * 100}%`, height:`${h * (painted ? .119 : compact ? .19 : .132) / visualScene.height * 100}%` }}>
                <div className="of-board-inner">
                <div className="of-board-goal" aria-hidden="true">{board.goal}</div>
                <div className="of-board-progress" aria-hidden="true">
                  <span className="of-board-bar"><i style={{ width:`${board.total ? board.done / board.total * 100 : 0}%` }} /></span>
                  {board.total ? `${board.done}/${board.total}` : 'no tasks yet'}
                </div>
                <ul aria-hidden="true">{board.items.map((item, index) => <li key={index} data-state={item.state}><b>{BOARD_MARKS[item.state]}</b>{item.label}</li>)}</ul>
                </div>
                <button type="button" className="of-board-hit" tabIndex={peekFloor?.sessionId===floor.sessionId?-1:0} aria-label={`Inspect planning board, ${floor.title}`} onClick={()=>floor.sessionId&&inspectStation(floor.sessionId,'planning')}/>
              </div>
            })}
            {publicFloors.filter(f=>f.kind==='team'&&!f.constructing).map(floor=>{
              if(!desktopArt)return <OfficeRemoteMeeting key={`remote-${floor.id}`} floor={{...floor,collaboration:scene.floors.find(current=>current.id===floor.id)?.collaboration}} buildingHeight={visualScene.height} overrides={collaborationOverrides} live={live} selectedKey={selectedKey} hidden={peekFloor?.sessionId===floor.sessionId} avatarArt={avatarArt} travellingKeys={travellingKeys} onSelect={inspectAgent} onChange={changeCollaboration}/>
              if(peekFloor?.sessionId===floor.sessionId)return null
              const count=breakRoomCounts.get(floor.id)??0
              const label=`${count} คนในห้องพัก · ${floor.title}`
              return <span key={`count-${floor.id}`} className="of-room-count" role="img" aria-label={label} title={label}
                style={{top:`${(floor.y+(floor.height??0)*.21)/visualScene.height*100}%`}}>
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="5.4" r="2.1"/><path d="M2.2 13.2v-1a3.8 3.8 0 0 1 7.6 0v1"/><path d="M10.6 3.6a2 2 0 0 1 0 3.8M11.6 9a3 3 0 0 1 2.2 2.9v1.3"/>
                </svg><b aria-hidden="true">{count}</b>
              </span>
            })}
            <canvas ref={canvas} role="img" aria-label={`Office with ${displayed.filter(a=>!a.hidden).length} visible agents from ${snapshots.length} T3 teams. Choose an agent for details. ${vendorLabel}.`} />
            <button ref={hatchButton} type="button" className="of-hatch-hit" aria-label="Call lift to garden" aria-expanded="false" onClick={()=>{toggleOfficeGardenLift(lift.current!,current.current.scene,motionClock.current,current.current.enabled);paint(lastPainted.current)}} style={{left:`${(officeNavigation(visualScene).shaftX-28*visualScene.width/450)/visualScene.width*100}%`,width:`${56/450*100}%`,top:`${((officeLanding(visualScene,'lounge')?.y??0)-96*visualScene.width/450)/visualScene.height*100}%`,height:`${100*visualScene.width/450/visualScene.height*100}%`}}>{desktopArt&&<span className="of-lift-call-plate" aria-hidden="true" />}</button>
            {publicFloors.filter(f=>f.kind==='break'||f.kind==='lounge').flatMap(floor=>{
              if(!visualScene.actors.some(a=>a.floorId===floor.id&&a.zone==='lounge'&&!a.hidden))return []
              return [...officeLeisureObjects(floor,visualScene.width).map(object=>({...object,label:OFFICE_OBJECT_NAMES[object.kind]})),...officeSeasonalObjects(floor,visualScene.width,new Date(now))].map((object,index)=><button key={`${floor.id}-${object.kind}-${index}`} type="button" className="of-object-hit" disabled={!officeVendorAllowsObject(new Date(now),floor.kind,object.kind)} aria-label={`${floor.kind==='lounge'&&object.kind==='coffee'?vendorLabel:object.label}, ${floor.title}`}
                style={{left:`${(object.x-20)/visualScene.width*100}%`,top:`${(object.y-24)/visualScene.height*100}%`,width:`${40/visualScene.width*100}%`,height:`${34/visualScene.height*100}%`}}
                onClick={()=>visitObject(floor,object)}><span>{object.label}</span></button>)
            })}
            {publicFloors.filter(f=>f.kind!=='lounge'&&f.id!==peekFloor?.annexOf).map(floor => {
              const desktopHistory=desktopArt&&floor.kind==='quiet'
              return <div key={floor.id} className="of-floor-row" data-floor-kind={floor.kind}
                style={{top:`${(floor.y+(desktopHistory?0:5))/visualScene.height*100}%`,height:desktopHistory?`${(floor.height??0)/visualScene.height*100}%`:undefined}}>
              <button type="button" className="of-floor-label" style={floor.kind === 'team' || floor.kind === 'break' ? { borderLeft:`4px solid ${floor.color}` } : undefined}
                aria-expanded={floor.kind === 'quiet' ? showQuiet : undefined}
                title={floor.kind === 'quiet' ? showQuiet ? 'Hide history' : 'Show history' : floor.title}
                onClick={() => floor.kind === 'quiet' ? setShowQuiet(v=>!v) : floor.sessionId && onOpenTeam(floor.sessionId,null)}>
                <i aria-hidden="true" style={{background:floor.waiting ? '#ffc46b' : floor.working ? '#a8d78d' : floor.color}} />
                <strong>{floor.title}{floor.kind === 'quiet' ? showQuiet ? ' · Hide history' : ' · Show history' : ''}</strong><span>{floor.kind === 'quiet' ? showQuiet ? '−' : '+' : floor.subtitle}</span>
              </button>
              {!!floor.overflow && <button type="button" className="of-overflow" onClick={()=>floor.sessionId&&onOpenTeam(floor.sessionId,null)} aria-label={`Open team in Board: ${floor.overflow} more agents${floor.kind === 'break' ? ' resting in the break room' : ''}`}>+{floor.overflow}</button>}
              </div>
            })}
            {visualScene.floors.filter(f=>f.annexOf).map(floor=>{
              const door=officeInteriorDoor(visualScene,floor.id),bounds=officeDoorBounds(visualScene,floor.id),parent=visualScene.floors.find(f=>f.id===floor.annexOf)
              if(!door||!bounds||!parent||parent.constructing)return null
              const count=floor.actorKeys.length
              const transit=doorTraffic.has(floor.id)
              const label=`Open break room, ${parent.title}, ${count} assigned`
              return <button type="button" className="of-annex-door" data-annex-id={floor.id} data-transit={transit} key={`door-${floor.id}`} aria-label={label} title={label} aria-expanded={peekId===floor.id}
                tabIndex={peekId===floor.id?-1:0}
                style={{left:`${bounds.x/visualScene.width*100}%`,top:`${bounds.y/visualScene.height*100}%`,width:`${bounds.width/visualScene.width*100}%`,height:`${bounds.height/visualScene.height*100}%`}}
                onClick={event=>{lastDoor.current=event.currentTarget;sound.playCue('wood');setPeekId(floor.id)}}>{!desktopArt&&<span aria-hidden="true">☕ {count}{transit?' ↳':''}</span>}</button>
            })}
            {publicFloors.filter(f=>f.kind==='team'&&!f.constructing&&(f.waiting??0)>0).map(floor=><div key={`beacon-${floor.id}`} className="of-alert-beacon" role="status" aria-label={`Waiting for your answer, ${floor.title}`} title={`${floor.waiting} waiting for your answer`}
              style={{left:desktopArt?'80%':'70%',top:`${(floor.y+(floor.height??0)*(desktopArt?.15:.18))/visualScene.height*100}%`}}><i/><b/></div>)}
            {publicFloors.filter(f=>f.kind==='team'&&f.constructing).map(floor=><div key={`site-${floor.id}`} className="of-construction" role="status" aria-label={`Preparing room, ${floor.title}`}
              style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`,opacity:Math.min(1,(1-(floor.constructionProgress??0))*5),'--build-progress':floor.constructionProgress??0} as CSSProperties}><i/><strong>⚒ Preparing room</strong><span>{floor.title}</span><b/></div>)}
            {(!!lounge?.overflow || !!lounge?.party?.length) && <span className="of-resting" data-party={!!lounge?.party?.length}>
              {lounge?.party?.length ? `🎉 ${lounge.party[0]} finished${lounge.party.length > 1 ? ` +${lounge.party.length - 1}` : ''}` : ''}
              {lounge?.party?.length && lounge.overflow ? ' · ' : ''}{lounge?.overflow ? `+${lounge.overflow} more` : ''}
            </span>}
            {!lounge?.party?.length && <span className="of-resting of-resting-muted">Party garden · No celebrations</span>}
            {displayed.filter(actor=>!actor.hidden).map(actor => {
              const waiting=actor.agent.status.startsWith('waiting_'), walking=Boolean(actor.pose?.walk||actor.pose?.climb)
              const failed=actor.agent.status==='failed'
              const activity=actor.agent.activities.at(-1)?.type ?? ''
              const role=actor.agent.role==='lead' ? 'Lead' : actor.pod ? 'Sub-lead' : 'Agent'
              const ai=[actor.runtimeName, actor.agent.model].filter(Boolean).join(' · ')
              const team=actor.team ?? visualScene.floors.find(floor=>floor.id===actor.floorId)
              const bubble=waiting ? '!' : actor.agent.status==='failed' ? '×' : /edit|write|file_change/.test(activity) ? '</>' : /search|read/.test(activity) ? '⌕' : /command|tool|shell/.test(activity) ? '>_' : '…'
              return <button key={actor.key} ref={agentRef(actor.key)} data-daily-phase={daily.current!.guests.get(actor.key)?.phase} data-daily-destination={daily.current!.guests.get(actor.key)?.destination} data-floor-id={actor.floorId} data-zone={actor.zone} type="button" className="of-agent" data-lift-travel={officeInsideLift(visualScene,actor)&&liftMoving} data-status={actor.agent.status} data-selected={selectedKey===actor.key} data-edge={actor.x>visualScene.width*.55?'end':'start'}
                tabIndex={peekFloor?.sessionId===actor.sessionId||actor.x<0||actor.x>visualScene.width||officeInsideLift(visualScene,actor)||(actor.pose?.opacity??1)<.8?-1:0}
                aria-pressed={selectedKey===actor.key} aria-label={`${actor.agent.name}, ${role}, ${ai}${team ? `, team ${team.title}` : ''}, ${actor.activity}, ${officeActorLocation(actor,visualScene)}`}
                style={{left:`${(actor.x-22)/visualScene.width*100}%`,top:`${(actor.y-72)/visualScene.height*100}%`,width:`${44/visualScene.width*100}%`,height:`${75/visualScene.height*100}%`,opacity:actor.pose?.opacity}}
                onMouseEnter={()=>setInspectedKey(actor.key)} onMouseLeave={()=>setInspectedKey(null)} onFocus={()=>setInspectedKey(actor.key)} onBlur={()=>setInspectedKey(null)}
                onClick={()=>inspectAgent(actor.sessionId,actor.agent.id)}>
                {actor.zone==='desk' && (waiting || failed || (!desktopArt&&!walking)) && <span className="of-bubble" aria-hidden="true">{bubble}</span>}
                {(!desktopArt||selectedKey===actor.key||waiting||failed)&&<span className="of-tag" aria-hidden="true" data-lead={role!=='Agent'} data-zone={actor.zone} data-failed={failed} style={{ '--team': team?.color ?? '#a88b70', maxWidth:`calc(${(tagRoom.get(actor.key) ?? 99) / 44 * 100}% - 4px)` } as CSSProperties}>
                  {failed && <b className="of-tag-failed">✕</b>}{!desktopArt&&role!=='Agent' && <b>{role==='Lead' ? '♛' : '♜'}</b>}{actor.agent.name}
                </span>}
                <span className="of-card" aria-hidden="true" data-visible={inspectedKey===actor.key&&selectedKey!==actor.key}>
                  <strong>{actor.agent.name}</strong>
                  <span>{role} · {ai}</span>
                  {team && <span className="of-card-team"><i style={{ background:team.color }} />{team.title}</span>}
                  <span className="of-card-activity">{actor.activity}</span>
                </span>
              </button>
            })}
            {peekFloor&&<OfficeBreakPeek floor={peekFloor} width={visualScene.width} buildingHeight={visualScene.height} actors={allDisplayed.filter(a=>a.floorId===peekFloor.id)} canvasRef={peekCanvas} now={now} selectedKey={selectedKey}
              onClose={closePeek} onSelect={inspectAgent} onOpenTeam={onOpenTeam} onObject={object=>visitObject(peekFloor,object)} agentRef={agentRef}/>}
          </div>
        )}
      </div>
      <OfficeDiscoveryTip open={discovery.open} onDismiss={discovery.dismiss}/>
      {desktopArt?(activityInfo?<OfficeActivityFooter name={activityInfo.agent.name} status={activityInfo.agent.status}
        task={activityInfo.task?.name||activityInfo.assignment||activityActor?.activity} avatarArt={avatarArt}
        appearance={selectedRemote?.appearance??activityActor?.appearance}
        progress={activityProgress?{completed:activityProgress.done,total:activityProgress.total,label:'Team tasks'}:undefined}
        onOpen={()=>inspectAgent(activityInfo.team.sessionId,activityInfo.agent.id)}/>:<footer className="office-activity-footer office-activity-idle">No agents currently working</footer>):<div className="of-live-caption" role="status" aria-live="polite" title={captionMovement?`${captionMovement.actor.agent.name} ${captionMovement.caption}`:undefined}>
        {captionMovement?<><strong>{captionMovement.actor.agent.name}</strong><span>{captionMovement.caption}</span></>:<span aria-hidden="true">&nbsp;</span>}
      </div>}
      {inspectedFloor&&stationSelection?<OfficeInspector key={`station-${inspectedFloor.id}-${stationSelection.kind}`} title={stationNames[stationSelection.kind]} onClose={closeInspector} onHeight={setInspectorHeight} autoFocus={focusInspector.current} onAutoFocus={inspectorFocused}>
        <p className="of-inspector-team">{inspectedFloor.title}</p>
        {selectedBoard&&<section aria-label="Full planning board"><h3>{selectedBoard.goal}</h3><p>{selectedBoard.done}/{selectedBoard.total} tasks done</p><ul>{selectedBoard.items.map((item,index)=><li key={index}><b>{BOARD_STATES[item.state]}</b> · {item.label}</li>)}</ul></section>}
        {stationPeople.length?stationPeople.map(actor=><button key={actor.key} type="button" onClick={()=>inspectAgent(actor.sessionId,actor.agent.id)}><b>{actor.agent.name}</b><span>{actor.activity}</span></button>):<p>No agent is using this station.</p>}
        <button type="button" onClick={()=>onOpenTeam(inspectedFloor.sessionId!,null)}>เปิดทีมใน Board ↗</button>
      </OfficeInspector>:selectedInfo&&<OfficeInspector key={`agent-${selectedKey}`} title="รายละเอียดเอเจนต์" onClose={closeInspector} onHeight={setInspectorHeight} autoFocus={focusInspector.current} onAutoFocus={inspectorFocused}>
        <h3>{selectedInfo.agent.name}</h3><p className="of-inspector-team">{selectedInfo.team.title}</p>
        <dl><dt>บทบาท</dt><dd>{selectedInfo.agent.role==='lead'?'Lead':'Worker'}</dd><dt>AI / Model</dt><dd>{[selectedActor?.runtimeName??selectedInfo.agent.runtime,selectedInfo.agent.model].filter(Boolean).join(' · ')||'Not reported'}</dd>
          <dt>สถานะงาน</dt><dd>{!live?'Last known: ':''}{STATUS_LABEL[selectedInfo.agent.status]}</dd>
          {selectedInfo.agent.requestKind&&<><dt>ชนิดคำขอ</dt><dd>{selectedInfo.agent.requestKind}</dd></>}
          <dt>งาน</dt><dd>{selectedInfo.task?.name||selectedInfo.assignment||'No task reported'}</dd>
          {selectedRemote&&<><dt>ในฉาก</dt><dd>แสดงบนจอประชุมออนไลน์ · {STATUS_LABEL[selectedRemote.agent.status]}</dd></>}
          {!selectedRemote&&selectedActor&&<><dt>ในฉาก</dt><dd>{selectedActor.activity} · {officeActorLocation(selectedActor,visualScene)}</dd></>}
        </dl>
        {selectedInfo.assignment&&selectedInfo.task?.name&&selectedInfo.task.name!==selectedInfo.assignment&&<details><summary>รายละเอียดงานเต็ม</summary><p>{selectedInfo.assignment}</p></details>}
        {selectedInfo.task?.result&&<details><summary>ผลลัพธ์ล่าสุด</summary><p>{selectedInfo.task.result}</p></details>}
        <button type="button" onClick={()=>onOpenTeam(selectedInfo.team.sessionId,selectedInfo.agent.id)}>เปิดทีมใน Board ↗</button>
      </OfficeInspector>}
    </section>
  )
}
