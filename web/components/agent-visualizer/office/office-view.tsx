'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TeamSnapshot } from '../../../lib/team-types'
import { isWorking, type TeamScope, type ConnectionView } from '../../../lib/team-model'
import type { AnimationMode } from '../../../lib/viewer-preferences'
import type { OfficeActor, OfficeEvent, OfficePet, OfficeScene, OfficeWorkStation, OfficeLeisureAction } from '../../../lib/office-types'
import { assignOfficeIdentities, buildOfficeScene, currentOfficeBoard, officeEvents, officeKey, officeTeamOrder, officeTeamQuiet } from '../../../lib/office-model'
import { createOfficeTrip, mergeOfficeEvents, officeAllowsMotion, officeCanResumeTrip, officeDepartureScene, officePresenceEvents, populatedOfficeTeams, officeTripFrame, officeWorkTripFrame, parseOfficeIdentities, type OfficeTrip } from '../../../lib/office-motion'
import { deriveOfficeParties, emptyOfficePartyHistory } from '../../../lib/office-parties'
import { drawOfficeFrame, officeAmbient } from './office-art'
import { drawOfficeDaylight } from './office-daylight-art'
import { officeDaylight } from '../../../lib/office-daylight'
import { officeWorkEvents, officeWorkPulse, officeWorkStation, OFFICE_STATION_LABELS } from '../../../lib/office-work'
import {officeActorAtWorkPlace,officeSceneAtWorkPlaces,officeWorkPresenceTarget,rememberOfficeWorkPlace,type OfficeWorkPlace} from '../../../lib/office-work-presence'
import { officeStations, officeStationUsers, officeRoomSeed, OFFICE_STATION_NAMES } from '../../../lib/office-stations'
import { officeLeisureObjects, nearestLeisureActor, createOfficeLeisureTrip, OFFICE_OBJECT_NAMES } from '../../../lib/office-leisure'
import { officeInteriorDoor, officeDoorBounds, officeInsideLift, officeLanding, officeNavigation } from '../../../lib/office-navigation'
import { officeSky, officeSkyIcon } from '../../../lib/office-sky'
import { officeSeasonalActivity, officeSeasonalObjects } from '../../../lib/office-seasonal'
import {createOfficeLift,closeOfficeLiftGardenDoor,callOfficeLiftToGarden,reserveOfficeLiftTrip,officeLiftFrame,restoreOfficeLiftCall,shiftOfficeLiftTime,cancelOfficeLiftTrips,type OfficeLiftState} from '../../../lib/office-lift'
import { addOfficeArrivals, advanceOfficeArrivals, officeActorsWithArrivals } from '../../../lib/office-arrivals'
import { useOfficeLayout } from './use-office-layout'
import { OfficeBreakPeek } from './office-break-peek'
import {officeLeadRestTransitions,officePendingOriginKeys} from '../../../lib/office-lead-rest'
import {createOfficeLeadRestTrip} from '../../../lib/office-lead-rest-motion'
import {officeWorkExchange} from '../../../lib/office-communication'
import {OfficeDailyRuntime,OFFICE_DAILY_STORAGE} from '../../../lib/office-daily-runtime'
import {useOfficeRoomArt} from './use-office-room-art'
import {drawOfficeRoomDesign} from './office-room-design-art'
import {useOfficeArchitectureArt} from './use-office-architecture-art'

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
}
const IDENTITY_STORAGE = 'agent-flow-office-identities-v1'
const TEAM_ORDER_STORAGE = 'agent-flow-office-team-order-v1'
const readTeamOrder = (): readonly string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TEAM_ORDER_STORAGE)??'[]')
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id==='string'&&id.length>0&&id.length<=2048))].slice(0,10_000) : []
  } catch { return [] }
}
const readIdentities = () => { try { return parseOfficeIdentities(localStorage.getItem(IDENTITY_STORAGE)) } catch { return new Map<string, number>() } }
const sameIdentities = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) => a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)

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
const BOARD_MARKS = { waiting: '!', failed: '✗', working: '○', done: '✓' } as const
const BOARD_STATES = { waiting: 'Needs you', failed: 'Failed', working: 'Working', done: 'Done' } as const
type Moving = { actor: OfficeActor; caption: string; elevatorY: number | null; station?:OfficeWorkStation }
type Pending = { event: OfficeEvent; before: OfficeScene }

export function OfficeView({ snapshots, scope, selectedKey, onSelect, onOpenTeam, live, connection, visible, animationMode, now }: OfficeViewProps) {
  const [savedIdentities, setSavedIdentities] = useState(readIdentities)
  const [savedTeamOrder,setSavedTeamOrder] = useState(readTeamOrder)
  const teamOrder = useMemo(()=>officeTeamOrder(snapshots.filter(s=>!officeTeamQuiet(s)).map(s=>s.sessionId),savedTeamOrder),[snapshots,savedTeamOrder])
  useEffect(()=>{
    if(teamOrder===savedTeamOrder)return
    setSavedTeamOrder(teamOrder)
    try{localStorage.setItem(TEAM_ORDER_STORAGE,JSON.stringify(teamOrder))}catch{/* In-memory order stays stable. */}
  },[teamOrder,savedTeamOrder])
  const identities = useMemo(() => assignOfficeIdentities(snapshots.flatMap(snapshot => snapshot.agents.map(agent => officeKey(snapshot.sessionId, agent.id))), savedIdentities), [snapshots, savedIdentities])
  useEffect(() => {
    if (sameIdentities(identities, savedIdentities)) return
    setSavedIdentities(identities)
    try { localStorage.setItem(IDENTITY_STORAGE, JSON.stringify([...identities].slice(-10_000))) } catch { /* The in-memory identities still remain stable. */ }
  }, [identities, savedIdentities])
  const [showQuiet, setShowQuiet] = useState(false)
  const [peekId,setPeekId] = useState<string|null>(null)
  const lastDoor=useRef<HTMLButtonElement|null>(null)
  const closePeek=()=>{const automatic=Boolean(autoPeek.current);autoPeek.current=null;setPeekId(null);if(!automatic)requestAnimationFrame(()=>{if(lastDoor.current?.isConnected)lastDoor.current.focus()})}
  const [stationSelection,setStationSelection]=useState<{sessionId:string;kind:OfficeWorkStation}|null>(null)
  // The user's own pause choice persists across launches.
  const [paused, setPaused] = useState(() => { try { return localStorage.getItem(PAUSE_STORAGE) === 'true' } catch { return false } })
  useEffect(() => { try { localStorage.setItem(PAUSE_STORAGE, String(paused)) } catch { /* In-memory selection remains available. */ } }, [paused])
  const pets: OfficePet[] = []
  const petEvent = null
  const pageVisible = usePageVisible()
  const viewport = useRef<HTMLDivElement>(null)
  const sceneWidth = 450
  // Project from committed history, so speculative renders cannot start or expire parties.
  const partyLog = useRef(emptyOfficePartyHistory())
  const partyHistory = useMemo(() => deriveOfficeParties(partyLog.current, snapshots, now), [snapshots, now])
  useEffect(() => { partyLog.current = partyHistory }, [partyHistory])
  const parties = partyHistory.parties
  const scene = useMemo(() => buildOfficeScene(snapshots, scope, showQuiet, identities, sceneWidth, parties, teamOrder), [snapshots, scope, showQuiet, identities, sceneWidth, parties, teamOrder])
  const daily=useRef<OfficeDailyRuntime|null>(null)
  if(!daily.current){let saved:unknown;try{saved=JSON.parse(localStorage.getItem(OFFICE_DAILY_STORAGE)??'null')}catch{}daily.current=new OfficeDailyRuntime(saved)}
  const [dailyVersion,setDailyVersion]=useState(0)
  const persistedDaily=useRef('')
  const [heldLayout, setHeldLayout] = useState<OfficeScene | null>(null)
  const held = useRef<OfficeScene | null>(null)
  const holdLayout = (value: OfficeScene | null) => { held.current = value; setHeldLayout(value) }
  const enabled = visible && pageVisible && live && officeAllowsMotion(animationMode) && !paused
  const layoutTarget = useMemo(() => daily.current!.project(heldLayout ? officeDepartureScene(heldLayout, scene, snapshots) : scene), [heldLayout, scene, snapshots,dailyVersion])
  const visualScene = useOfficeLayout(layoutTarget,visible&&pageVisible&&officeAllowsMotion(animationMode)&&!paused,!live)
  const architectureArt=useOfficeArchitectureArt()
  const roomArt=useOfficeRoomArt()
  const roomCanvas=useRef<HTMLCanvasElement>(null)
  const lift=useRef<OfficeLiftState|null>(null)
  if(!lift.current)lift.current=createOfficeLift(visualScene)
  const canvas = useRef<HTMLCanvasElement>(null)
  const workPlaces=useRef(new Map<string,OfficeWorkPlace>())
  const peekCanvas = useRef<HTMLCanvasElement>(null)
  const lastPainted = useRef<Moving|null>(null)
  const painted = useRef(false)
  const reconnecting = useRef(false)
  const objectCue = useRef<{actorKey:string;kind:OfficeLeisureAction;until:number}|null>(null)
  const leadOrigins=useRef(new Map<string,OfficeActor>())
  const autoPeek=useRef<{key:string;floorId:string}|null>(null)
  const autoPeeked=useRef(new Set<string>())
  const leisureTrips = useRef(new Map<string,{trip:OfficeTrip;kind:OfficeLeisureAction}>())
  const leisureVisual = useRef(new Map<string,Moving>())
  const arrivalTrips = useRef(new Map<string,OfficeTrip>())
  const [visualTick,setArrivalTick] = useState(0)
  const [restMoving,setRestMoving]=useState<Moving[]>([])
  const hatchButton = useRef<HTMLButtonElement>(null)
  const skyCanvas = useRef<HTMLCanvasElement>(null)
  const queue = useRef<Pending[]>([])
  const active = useRef<OfficeTrip | null>(null)
  const baseline = useRef<{ snapshots: readonly TeamSnapshot[]; scene: OfficeScene; enabled: boolean; scope: TeamScope; showQuiet: boolean } | null>(null)
  const motionClock = useRef(0)
  const nextWorkAt = useRef(0)
  const nextSeasonalAt = useRef(12_000)
  const seasonalCursor = useRef(0)
  const workCursor = useRef(0)
  const elapsed = useRef(0)
  const [moving, setMoving] = useState<Moving | null>(null)
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
  const current = useRef({ scene: visualScene,target:layoutTarget,sourceScene:scene, selectedKey, pets, petEvent, enabled, live, peekId,architectureArt,roomArt,wallNow:now })
  current.current = { scene: visualScene,target:layoutTarget,sourceScene:scene, selectedKey, pets, petEvent, enabled, live, peekId,architectureArt,roomArt,wallNow:now }
  const createVisualTrip=(event:OfficeEvent,before:OfficeScene,next:OfficeScene,at:number)=>{
    const prior=officeSceneAtWorkPlaces(before,workPlaces.current),present=officeSceneAtWorkPlaces(next,workPlaces.current)
    const person=present.actors.find(a=>a.key===event.actorKey)
    if(event.kind==='routine'){
      const actual=daily.current!.completedOrigins.get(event.actorKey)??leadOrigins.current.get(event.actorKey)??(lastPainted.current?.actor.key===event.actorKey?lastPainted.current.actor:undefined)??prior.actors.find(a=>a.key===event.actorKey)
      const trip=createOfficeLeadRestTrip(prior,present,event.actorKey,at,actual)
      return trip?{...trip,event}:null
    }
    const target=event.kind==='activity'&&person?officeWorkPresenceTarget(next,person,event.station??officeWorkStation(person),workPlaces.current):undefined
    let trip=createOfficeTrip(event,prior,present,at,target)
    if(!trip)return null
    const actual=daily.current!.completedOrigins.get(trip.actorKey)??leadOrigins.current.get(trip.actorKey)??leisureVisual.current.get(trip.actorKey)?.actor??(lastPainted.current?.actor.key===trip.actorKey?lastPainted.current.actor:present.actors.find(a=>a.key===trip!.actorKey))
    if(actual&&prior.actors.some(a=>a.key===trip!.actorKey&&(a.floorId===actual.floorId||daily.current!.completedOrigins.has(trip!.actorKey)))){
      const origin={...prior,floors:[...prior.floors,...present.floors.filter(f=>!prior.floors.some(p=>p.id===f.id))],actors:prior.actors.map(a=>a.key===trip!.actorKey?{...a,x:actual.x,y:actual.y,floorId:actual.floorId}:a)}
      trip=createOfficeTrip(event,origin,present,at,target)
    }
    return trip
  }

  useEffect(() => {
    const previous = baseline.current
    if (!live) {
      reconnecting.current = true
      queue.current = []
      baseline.current = { snapshots, scene, enabled, scope, showQuiet }
      return
    }
    if (reconnecting.current) {
      reconnecting.current = false
      queue.current = []
      if (!officeCanResumeTrip(active.current, scene)) {
        if(active.current)cancelOfficeLiftTrips(lift.current!,new Set([active.current.actorKey]),motionClock.current)
        active.current = null; setMoving(null); holdLayout(null)
      }
      baseline.current = { snapshots, scene, enabled, scope, showQuiet }
      return
    }
    if (!enabled || !previous?.enabled || previous.scope !== scope || previous.showQuiet !== showQuiet) {
      if(!daily.current!.guests.size){
      queue.current = []; active.current = null; leadOrigins.current.clear();setMoving(null); holdLayout(null)
      if(!daily.current!.guests.size){const car=officeLiftFrame(lift.current!,motionClock.current);lift.current={y:car.y,doorsOpen:0,availableAt:motionClock.current,reservations:[]}}
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
      arrivalTrips.current=addOfficeArrivals(arrivalTrips.current,observed.filter(e=>!daily.current!.guests.has(e.actorKey)),previous.scene,scene,motionClock.current,lift.current!)
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
  }, [snapshots, scene, enabled, live, scope, showQuiet])

  const paint = (movement: Moving | null) => {
    const element = canvas.current, context = element?.getContext('2d')
    if (!element || !context) return
    painted.current = true
    lastPainted.current=movement
    const input = current.current
    // Backing store follows rendered size × device pixel ratio so wide views stay crisp.
    const ratio = Math.max(1, Math.min(4, Math.ceil((element.clientWidth || input.scene.width) * (window.devicePixelRatio || 1) / input.scene.width * 4) / 4))
    const w = Math.round(input.scene.width * ratio), h = Math.round(input.scene.height * ratio)
    if (element.width !== w || element.height !== h) { element.width = w; element.height = h }
    const overrides=new Map([...leadOrigins.current,...[...leisureVisual.current].map(([key,value])=>[key,value.actor] as const)])
    for(const actor of daily.current!.actors(input.scene,motionClock.current))overrides.set(actor.key,actor)
    if(movement)overrides.set(movement.actor.key,movement.actor)
    const actors=officeActorsWithArrivals(input.scene,arrivalTrips.current,motionClock.current).map(actor=>{
      const override=overrides.get(actor.key)
      return override?{...override,agent:actor.agent,task:actor.task}:(arrivalTrips.current.has(actor.key)?actor:officeActorAtWorkPlace(input.scene,actor,workPlaces.current.get(actor.key)))
    })
    for(const actor of daily.current!.actors(input.scene,motionClock.current))if(!actors.some(a=>a.key===actor.key))actors.push(actor)
    if(movement&&!actors.some(actor=>actor.key===movement.actor.key))actors.push(movement.actor)
    context.setTransform(ratio,0,0,ratio,0,0)
    const skyElement=skyCanvas.current, skyContext=skyElement?.getContext('2d')
    const surfaceHeight=input.scene.floors.find(f=>f.kind==='lounge')?.height??0
    const liftVisual=officeLiftFrame(lift.current!,motionClock.current,input.scene)
    const hatch=officeNavigation(input.scene).hatch,atGarden=Math.abs(liftVisual.y-hatch.y)<2*input.scene.width/450
    const opening=atGarden&&liftVisual.doorsOpen>.5
    if(hatchButton.current){
      hatchButton.current.setAttribute('aria-expanded',String(opening))
      hatchButton.current.setAttribute('aria-label',atGarden?(opening?'Close garden lift':'Open garden lift'):'Call lift to garden')
      hatchButton.current.disabled=opening&&lift.current!.reservations.some(leg=>Boolean(leg.actorKey)&&leg.end>motionClock.current)
    }
    if(skyElement&&skyContext){
      if(skyElement.width!==w||skyElement.height!==Math.round(surfaceHeight*ratio)){skyElement.width=w;skyElement.height=Math.round(surfaceHeight*ratio)}
      skyContext.setTransform(ratio,0,0,ratio,0,0)
      drawOfficeDaylight(skyContext,input.scene,new Date(input.wallNow),input.enabled?elapsed.current:0)
    }
    const greeting = greet.current && greet.current.until > elapsed.current ? greet.current.key : null
    const publicFloors=input.scene.floors.filter(f=>!f.annexOf)
    const publicIds=new Set(publicFloors.filter(f=>!f.constructing).map(f=>f.id))
    const doorFloor=input.scene.floors.find(f=>f.annexOf&&movement&&f.sessionId===movement.actor.sessionId&&(()=>{const p=officeInteriorDoor(input.scene,f.id);return p&&Math.abs(p.x-movement.actor.x)<20*input.scene.width/450&&Math.abs(p.y-movement.actor.y)<35*input.scene.width/450})())
    const options={ time: elapsed.current, date: new Date(input.wallNow), now: input.wallNow, dailyArt:daily.current!.art(new Date(input.wallNow),input.scene,motionClock.current), live: input.live,
      exchange:officeWorkExchange(active.current,{...input.scene,actors},motionClock.current),
      motion: input.enabled, pets: input.pets, petEvent: input.petEvent, selectedKey: input.selectedKey,
      openDoorFloorId:input.peekId??doorFloor?.id??null,architectureArt:input.architectureArt,roomArt:input.roomArt,liftSurfaceOpen:false,lift:liftVisual,
      objectCue:objectCue.current&&objectCue.current.until>elapsed.current?objectCue.current:null,
      leisureKeys:new Set([...leisureTrips.current.keys(),...arrivalTrips.current.keys(),...daily.current!.guests.keys()]),
      tripKey: input.enabled ? active.current?.actorKey ?? null : null, greetKey: input.enabled ? greeting : null }
    const offsets = drawOfficeFrame(context, { ...input.scene, actors:actors.filter(a=>publicIds.has(a.floorId)) },options)
    const annex=input.scene.floors.find(f=>f.id===input.peekId&&f.annexOf),peek=peekCanvas.current,peekContext=peek?.getContext('2d')
    if(annex&&peek&&peekContext){
      const ph=Math.max(1,annex.height??0)
      if(peek.width!==w||peek.height!==Math.round(ph*ratio)){peek.width=w;peek.height=Math.round(ph*ratio)}
      peekContext.setTransform(ratio,0,0,ratio,0,0)
      const local={...input.scene,height:ph,floors:[{...annex,y:0}],actors:actors.filter(a=>a.floorId===annex.id).map(a=>({...a,y:a.y-annex.y}))}
      for(const [key,offset] of drawOfficeFrame(peekContext,local,options))offsets.set(key,offset)
    }
    if (!cssScale.current) cssScale.current = (element.clientWidth || input.scene.width) / input.scene.width
    for (const [key, button] of agentRefs.current) {
      const offset = offsets.get(key), k = cssScale.current
      const value = offset && (offset.dx || offset.dy) ? `translate(${(offset.dx * k).toFixed(1)}px,${(offset.dy * k).toFixed(1)}px)` : ''
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
  useEffect(() => {
    if (!live && painted.current) return
    if (!enabled || (!active.current&&!queue.current.length)) paint(null)
  }, [visualScene, now, enabled, live, selectedKey, petEvent, peekId,architectureArt])
  useEffect(()=>{if(architectureArt)paint(lastPainted.current)},[architectureArt])
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
        const arrivals=advanceOfficeArrivals(arrivalTrips.current,input.scene,motionClock.current,lift.current!,input.target)
        arrivalTrips.current=arrivals.trips
        for(const trip of arrivals.completed)greetArrival(trip,input.scene)
      }
      if(motionClock.current>=nextSeasonalAt.current){
        nextSeasonalAt.current=motionClock.current+45_000
        const available={...input.scene,actors:input.scene.actors.filter(a=>a.key!==active.current?.actorKey&&!leisureTrips.current.has(a.key)&&!arrivalTrips.current.has(a.key)&&!daily.current!.guests.has(a.key)&&a.agent.status!=='failed')}
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
      const busyKeys=new Set([...arrivalTrips.current.keys(),...leisureTrips.current.keys(),...queue.current.flatMap(p=>[p.event.actorKey,...(p.event.parentKey?[p.event.parentKey]:[])]),...(active.current?[active.current.actorKey]:[])])
      const realQueue=queue.current.some(p=>!daily.current!.guests.has(p.event.actorKey)&&(!p.event.parentKey||!daily.current!.guests.has(p.event.parentKey)))
      daily.current!.step({source:input.sourceScene,scene:input.scene,date:new Date(input.wallNow),at:motionClock.current,lift:lift.current!,busyKeys,blocked:Boolean(active.current||arrivalTrips.current.size||realQueue),preemptQueuedTravel:Boolean(arrivalTrips.current.size||active.current?.segments.some(s=>s.liftPhase)||queue.current.some(p=>p.event.kind==='left'&&!daily.current!.guests.has(p.event.actorKey))),onLiftCancelled:keys=>{
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
      const privateWalker=daily.current!.actors(input.scene,motionClock.current).find(a=>{
        const trip=daily.current!.guests.get(a.key)?.trip
        return trip&&motionClock.current>=trip.startedAt&&!officeTripFrame(trip,motionClock.current).done&&a.pose?.walk&&input.scene.floors.some(f=>f.id===a.floorId&&f.annexOf)
      })
      if(autoPeek.current&&(!privateWalker||privateWalker.key!==autoPeek.current.key||privateWalker.floorId!==autoPeek.current.floorId)){
        if(input.peekId===autoPeek.current.floorId)setPeekId(null)
        autoPeek.current=null
      }
      if(privateWalker&&!input.peekId&&!autoPeek.current){
        const id=daily.current!.guests.get(privateWalker.key)?.trip?.event.id
        if(id&&!autoPeeked.current.has(id)){
          autoPeeked.current.add(id);if(autoPeeked.current.size>64)autoPeeked.current.delete(autoPeeked.current.values().next().value!)
          autoPeek.current={key:privateWalker.key,floorId:privateWalker.floorId};setPeekId(privateWalker.floorId)
        }
      }
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
      if(!active.current&&!held.current&&!arrivalTrips.current.size&&motionClock.current>=nextWorkAt.current){
        nextWorkAt.current=motionClock.current+5000
        const work=officeWorkPulse({...input.scene,actors:input.scene.actors.filter(a=>!daily.current!.guests.has(a.key))},workCursor.current++,Date.now())
        if(work)active.current=createVisualTrip(work,input.scene,input.scene,motionClock.current)
      }
      if (active.current) {
        const trip = active.current, frame = officeWorkTripFrame(trip, motionClock.current,input.scene)
        const actor = input.scene.actors.find(actor => actor.key === trip.actorKey) ?? (trip.event.kind === 'left' ? trip.actor : null)
        if (frame.done || !actor || (trip.event.kind==='activity'&&!isWorking(actor.agent.status))) {
          if(frame.done&&actor&&trip.event.kind==='activity'){
            const place=rememberOfficeWorkPlace(input.scene,actor,frame.point,trip.event.station??officeWorkStation(actor))
            if(place)workPlaces.current.set(actor.key,place)
          }
          if (frame.done) greetArrival(trip, input.scene)
          if (trip.event.kind === 'left' && held.current) holdLayout({ ...held.current, actors: held.current.actors.filter(item => item.key !== trip.actorKey) })
          active.current = null; setMoving(null)
        }
        else {
          movement = { actor: { ...actor, ...frame.point,floorId:frame.floorId??actor.floorId, pose: { ...frame.pose, lead: actor.agent.role === 'lead' } }, caption: trip.caption, elevatorY: frame.elevatorY, station:trip.event.station }
          if(trip.event.kind==='activity'){
            const place=rememberOfficeWorkPlace(input.scene,actor,movement.actor)
            if(place)workPlaces.current.set(actor.key,place)
          }
        }
      }
      for(const [key,entry] of leisureTrips.current){
        const actor=input.scene.actors.find(a=>a.key===key)
        if(!actor||actor.hidden||actor.zone!=='lounge'||daily.current!.guests.has(key)){leisureTrips.current.delete(key);leisureVisual.current.delete(key);continue}
        const dx=actor.x-entry.trip.actor.x,dy=actor.y-entry.trip.actor.y
        if(dx||dy){entry.trip={...entry.trip,actor,segments:entry.trip.segments.map(s=>({...s,from:{x:s.from.x+dx,y:s.from.y+dy},to:{x:s.to.x+dx,y:s.to.y+dy}}))}}
        const frame=officeTripFrame(entry.trip,motionClock.current)
        if(frame.done){leisureTrips.current.delete(key);leisureVisual.current.delete(key);continue}
        leisureVisual.current.set(key,{actor:{...actor,...frame.point,stand:true,pose:{...frame.pose,sit:!frame.pose.walk&&(entry.kind==='book'||entry.kind==='snack'),objectAction:frame.pose.walk?undefined:entry.kind}},caption:entry.trip.caption,elevatorY:null})
      }
      const keepWork=new Set([...input.scene.actors.filter(a=>a.zone==='desk').map(a=>a.key),...queue.current.map(p=>p.event.actorKey),...(active.current?[active.current.actorKey]:[])])
      for(const key of workPlaces.current.keys())if(!keepWork.has(key))workPlaces.current.delete(key)
      const originKeys=officePendingOriginKeys(queue.current.map(p=>p.event),active.current?.actorKey)
      for(const key of leadOrigins.current.keys())if(!originKeys.has(key))leadOrigins.current.delete(key)
      for(const key of daily.current!.completedOrigins.keys())if(!originKeys.has(key))daily.current!.completedOrigins.delete(key)
      restoreOfficeLiftCall(lift.current!,input.target,motionClock.current)
      paint(movement)
      if (time - lastLabels >= 80) { setMoving(movement);setRestMoving([...leisureVisual.current.values()]);setArrivalTick(n=>n+1);lastLabels = time }
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
  for(const actor of daily.current!.actors(visualScene,motionClock.current))restByKey.set(actor.key,actor)
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
  for(const actor of daily.current!.actors(visualScene,motionClock.current))if(!allDisplayed.some(a=>a.key===actor.key))allDisplayed.push(actor)
  if(moving&&!allDisplayed.some(a=>a.key===moving.actor.key))allDisplayed.push(moving.actor)
  const publicFloors=visualScene.floors.filter(f=>!f.annexOf)
  const publicIds=new Set(publicFloors.filter(f=>!f.constructing).map(f=>f.id))
  const displayed=allDisplayed.filter(a=>publicIds.has(a.floorId))
  const peekFloor=visualScene.floors.find(f=>f.id===peekId&&f.annexOf)
  const visitObject=(floor:OfficeScene['floors'][number],object:{kind:OfficeLeisureAction;label:string;x:number;y:number})=>{
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
  const working = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => isWorking(agent.status)).length, 0)
  const needsYou = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => agent.status.startsWith('waiting_')).length, 0)
  const lounge = visualScene.floors.find(floor => floor.kind === 'lounge')
  const dailyActor=daily.current!.actors(visualScene,motionClock.current)[0]
  const captionMovement=moving??restMoving[0]??(dailyActor?{actor:dailyActor,caption:dailyActor.activity,elevatorY:null}:null)
  const inspectedFloor=stationSelection?scene.floors.find(f=>f.kind==='team'&&f.sessionId===stationSelection.sessionId):null
  const stationPeople=inspectedFloor&&stationSelection?officeStationUsers(scene,inspectedFloor,stationSelection.kind):[]

  return (
    <section className="of-view" data-motion={enabled} data-daily-guests={daily.current!.guests.size} data-canteen-open={daily.current!.canteenOpen} data-season={sky.season} data-holiday={sky.holiday??undefined} aria-label="Agent Office">
      <div className="of-toolbar">
        <span className="of-counts">{working} working{needsYou > 0 && <strong className="of-waiting"> · {needsYou} need you</strong>}</span>
        <span className="of-link" data-tone={connection?.tone ?? (live ? 'ok' : 'warn')} title={connection?.detail} role="status">{connection?.label ?? (live ? 'Connected' : 'Reconnecting')}</span>
        <time dateTime={new Date(now).toISOString()} title={`${ambient.name} · ${sky.label} · simulated weather · local time`}><span aria-hidden="true">{officeSkyIcon(sky)}</span> {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
        <button type="button" aria-label={paused ? 'Resume Office motion' : 'Pause Office motion'} aria-pressed={paused} disabled={animationMode === 'off'}
          onClick={() => setPaused(value => !value)}
          title={animationMode === 'off' ? 'Effects off in Animation settings' : paused ? 'Resume Office motion' : 'Pause Office motion'}>
          <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span></button>

      </div>

      <div className="of-scroll" ref={viewport}>
        {snapshots.length === 0 ? <p className="of-empty">Your teams will appear here.</p> : (
          <div className="of-building" style={{ width:'100%', maxWidth:900, aspectRatio:`${visualScene.width} / ${visualScene.height}` } as CSSProperties}>
            <canvas ref={skyCanvas} aria-hidden="true" style={{height:`${(visualScene.floors.find(f=>f.kind==='lounge')?.height??0)/visualScene.height*100}%`,zIndex:0}} />
            {publicFloors.filter(f=>f.kind!=='quiet').map(floor=><div key={`art-${floor.id}`} aria-hidden="true" data-season={floor.kind==='lounge'?sky.season:undefined} className={`of-art of-art-${floor.kind==='lounge'?'surface':floor.room}`} style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`,filter:floor.kind==='lounge'?`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`:undefined}} />)}
            <div aria-hidden="true" className="of-art of-art-bottom" style={{bottom:0,height:`${visualScene.width/3/visualScene.height*100}%`}} />
            {/* Covers the old painted pit; the moving car has its own cutaway above it. */}
            <div aria-hidden="true" data-season={sky.season} className="of-hatch-closed" style={{height:`${(lounge?.height??0)/visualScene.height*100}%`,filter:`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`}}/>
            <span className="of-season-label" title={`${sky.label} · Simulated weather · ${seasonalActivity.label}`} style={{top:`${(lounge?.height??0)*.86/visualScene.height*100}%`}}>{sky.label} · {seasonalActivity.label}</span>
            <canvas ref={roomCanvas} aria-hidden="true" style={{zIndex:0,pointerEvents:'none',height:'100%'}} />
            {visualScene.floors.filter(f=>f.kind==='team'&&!f.constructing).flatMap(floor=>officeStations(floor,visualScene.width).map(station=>{
              const users=officeStationUsers(scene,floor,station.kind)
              return <button key={`${floor.id}-${station.kind}`} type="button" className="of-workbench" data-kind={station.kind} data-active={users.length>0}
                aria-label={`${OFFICE_STATION_NAMES[station.kind]}, ${floor.title}, ${users.length} working`}
                tabIndex={peekFloor?.sessionId===floor.sessionId?-1:0}
                onClick={()=>floor.sessionId&&setStationSelection({sessionId:floor.sessionId,kind:station.kind})}
                style={{left:`${(station.x-station.width/2)/visualScene.width*100}%`,top:`${(station.y-station.height*.88)/visualScene.height*100}%`,width:`${station.width/visualScene.width*100}%`,height:`${station.height/visualScene.height*100}%`,'--station-accent':floor.color} as CSSProperties}>
                <span>{OFFICE_STATION_NAMES[station.kind]}{users.length>0&&<b> · {users.length}</b>}</span>
                {users.length>0&&<i aria-hidden="true"/>}
              </button>
            }))}
            {/* Every office has a progress board; compact rooms use a smaller wall panel. */}
            {visualScene.floors.filter(floor => floor.kind === 'team'&&!floor.constructing).map(floor => {
              // Geometry may be held during departures; content always comes from the current scene.
              const board = currentOfficeBoard(floor, scene), h = floor.height ?? 0
              const compact = floor.room !== 'room-stations-large'
              if (!board) return null
              const progress = board.total ? `${board.done} of ${board.total} tasks done` : 'No tasks yet'
              return <div key={`board-${floor.id}`} className="of-board" data-compact={compact} data-active={officeStationUsers(scene,floor,'planning').length>0} role="note"
                aria-label={`Team board: ${board.goal}. ${progress}.${board.items.map(item => ` ${BOARD_STATES[item.state]}: ${item.label}.`).join('')}`}
                style={{ top:`${(floor.y + h * (compact ? .24 : .19)) / visualScene.height * 100}%`, height:`${h * (compact ? .19 : .132) / visualScene.height * 100}%` }}>
                <div className="of-board-inner">
                <div className="of-board-goal" aria-hidden="true">{board.goal}</div>
                <div className="of-board-progress" aria-hidden="true">
                  <span className="of-board-bar"><i style={{ width:`${board.total ? board.done / board.total * 100 : 0}%` }} /></span>
                  {board.total ? `${board.done}/${board.total}` : 'no tasks yet'}
                </div>
                <ul aria-hidden="true">{board.items.map((item, index) => <li key={index} data-state={item.state}><b>{BOARD_MARKS[item.state]}</b>{item.label}</li>)}</ul>
                </div>
                <button type="button" className="of-board-hit" tabIndex={peekFloor?.sessionId===floor.sessionId?-1:0} aria-label={`Inspect planning board, ${floor.title}`} onClick={()=>floor.sessionId&&setStationSelection({sessionId:floor.sessionId,kind:'planning'})}/>
              </div>
            })}
            <canvas ref={canvas} role="img" aria-label={`Office with ${displayed.filter(a=>!a.hidden).length} visible agents from ${snapshots.length} T3 teams. Choose an agent for details.`} />
            <button ref={hatchButton} type="button" className="of-hatch-hit" aria-label="Open garden lift" aria-expanded="false" onClick={()=>{const car=officeLiftFrame(lift.current!,motionClock.current),hatch=officeNavigation(current.current.scene).hatch;if(Math.abs(car.y-hatch.y)<2*current.current.scene.width/450&&car.doorsOpen>.5)closeOfficeLiftGardenDoor(lift.current!,current.current.scene,motionClock.current);else callOfficeLiftToGarden(lift.current!,current.current.scene,motionClock.current);paint(lastPainted.current)}} style={{left:`${(officeNavigation(visualScene).shaftX-28*visualScene.width/450)/visualScene.width*100}%`,width:`${56/450*100}%`,top:`${((officeLanding(visualScene,'lounge')?.y??0)-96*visualScene.width/450)/visualScene.height*100}%`,height:`${100*visualScene.width/450/visualScene.height*100}%`}}/>
            {publicFloors.filter(f=>f.kind==='break'||f.kind==='lounge').flatMap(floor=>{
              if(!visualScene.actors.some(a=>a.floorId===floor.id&&a.zone==='lounge'&&!a.hidden))return []
              return [...officeLeisureObjects(floor,visualScene.width).map(object=>({...object,label:OFFICE_OBJECT_NAMES[object.kind]})),...officeSeasonalObjects(floor,visualScene.width,new Date(now))].map((object,index)=><button key={`${floor.id}-${object.kind}-${index}`} type="button" className="of-object-hit" aria-label={`${object.label}, ${floor.title}`}
                style={{left:`${(object.x-20)/visualScene.width*100}%`,top:`${(object.y-24)/visualScene.height*100}%`,width:`${40/visualScene.width*100}%`,height:`${34/visualScene.height*100}%`}}
                onClick={()=>visitObject(floor,object)}><span>{object.label}</span></button>)
            })}
            {publicFloors.filter(f=>f.kind!=='lounge').map(floor => <div key={floor.id} className="of-floor-row" style={{ top:`${(floor.y+5)/visualScene.height*100}%` }}>
              <button type="button" className="of-floor-label" style={floor.kind === 'team' || floor.kind === 'break' ? { borderLeft:`4px solid ${floor.color}` } : undefined}
                tabIndex={peekFloor?.sessionId&&peekFloor.sessionId===floor.sessionId?-1:0}
                aria-expanded={floor.kind === 'quiet' ? showQuiet : undefined}
                title={floor.kind === 'quiet' ? showQuiet ? 'Hide history' : 'Show history' : floor.title}
                onClick={() => floor.kind === 'quiet' ? setShowQuiet(v=>!v) : floor.sessionId && onOpenTeam(floor.sessionId,null)}>
                <i aria-hidden="true" style={{background:floor.waiting ? '#ffc46b' : floor.working ? '#a8d78d' : floor.color}} />
                <strong>{floor.title}{floor.kind === 'quiet' ? showQuiet ? ' · Hide history' : ' · Show history' : ''}</strong><span>{floor.kind === 'quiet' ? showQuiet ? '−' : '+' : floor.subtitle}</span>
              </button>
              {!!floor.overflow && <button type="button" className="of-overflow" tabIndex={peekFloor?.sessionId===floor.sessionId?-1:0} onClick={()=>floor.sessionId&&onOpenTeam(floor.sessionId,null)} aria-label={`Open team in Board: ${floor.overflow} more agents${floor.kind === 'break' ? ' resting in the break room' : ''}`}>+{floor.overflow}</button>}
            </div>)}
            {visualScene.floors.filter(f=>f.annexOf).map(floor=>{
              const door=officeInteriorDoor(visualScene,floor.id),bounds=officeDoorBounds(visualScene,floor.id),parent=visualScene.floors.find(f=>f.id===floor.annexOf)
              if(!door||!bounds||!parent||parent.constructing)return null
              const count=floor.actorKeys.length
              const transit=Boolean(moving&&active.current?.event.kind!=='activity'&&moving.actor.sessionId===floor.sessionId&&(moving.actor.floorId===floor.id||active.current?.actor.floorId===floor.id))
              return <button type="button" className="of-annex-door" data-transit={transit} key={`door-${floor.id}`} aria-label={`Open break room, ${parent.title}, ${count} resting`} aria-expanded={peekId===floor.id}
                tabIndex={peekId===floor.id?-1:0}
                style={{left:`${bounds.x/visualScene.width*100}%`,top:`${bounds.y/visualScene.height*100}%`,width:`${bounds.width/visualScene.width*100}%`,height:`${bounds.height/visualScene.height*100}%`}}
                onClick={event=>{lastDoor.current=event.currentTarget;autoPeek.current=null;setPeekId(floor.id)}}><span>☕ {count}{transit?' ↳':''}</span></button>
            })}
            {publicFloors.filter(f=>f.kind==='team'&&!f.constructing&&(f.waiting??0)>0).map(floor=><div key={`beacon-${floor.id}`} className="of-alert-beacon" role="status" aria-label={`Waiting for your answer, ${floor.title}`} title={`${floor.waiting} waiting for your answer`}
              style={{left:'70%',top:`${(floor.y+(floor.height??0)*.18)/visualScene.height*100}%`}}><i/><b/></div>)}
            {publicFloors.filter(f=>f.kind==='team'&&f.constructing).map(floor=><div key={`site-${floor.id}`} className="of-construction" role="status" aria-label={`Preparing room, ${floor.title}`}
              style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`,opacity:Math.min(1,(1-(floor.constructionProgress??0))*5),'--build-progress':floor.constructionProgress??0} as CSSProperties}><i/><strong>⚒ Preparing room</strong><span>{floor.title}</span><b/></div>)}
            {(!!lounge?.overflow || !!lounge?.party?.length) && <span className="of-resting" data-party={!!lounge?.party?.length}>
              {lounge?.party?.length ? `🎉 ${lounge.party[0]} finished${lounge.party.length > 1 ? ` +${lounge.party.length - 1}` : ''}` : ''}
              {lounge?.party?.length && lounge.overflow ? ' · ' : ''}{lounge?.overflow ? `+${lounge.overflow} more` : ''}
            </span>}
            {!lounge?.party?.length && <span className="of-resting of-resting-muted">Party garden · No celebrations</span>}
            {displayed.filter(actor=>!actor.hidden).map(actor => {
              const waiting=actor.agent.status.startsWith('waiting_'), walking=Boolean(actor.pose?.walk||actor.pose?.climb)
              const activity=actor.agent.activities.at(-1)?.type ?? ''
              const role=actor.agent.role==='lead' ? 'Lead' : actor.pod ? 'Sub-lead' : 'Agent'
              const ai=[actor.runtimeName, actor.agent.model].filter(Boolean).join(' · ')
              const team=actor.team ?? visualScene.floors.find(floor=>floor.id===actor.floorId)
              const bubble=waiting ? '!' : actor.agent.status==='failed' ? '×' : /edit|write|file_change/.test(activity) ? '</>' : /search|read/.test(activity) ? '⌕' : /command|tool|shell/.test(activity) ? '>_' : '…'
              return <button key={actor.key} ref={agentRef(actor.key)} data-daily-phase={daily.current!.guests.get(actor.key)?.phase} data-daily-destination={daily.current!.guests.get(actor.key)?.destination} data-floor-id={actor.floorId} data-zone={actor.zone} type="button" className="of-agent" data-lift-travel={officeInsideLift(visualScene,actor)&&officeLiftFrame(lift.current!,motionClock.current).moving} data-status={actor.agent.status} data-selected={selectedKey===actor.key} data-edge={actor.x>visualScene.width*.55?'end':'start'}
                tabIndex={peekFloor?.sessionId===actor.sessionId?-1:0}
                aria-pressed={selectedKey===actor.key} aria-label={`${actor.agent.name}, ${role}, ${ai}${team ? `, team ${team.title}` : ''}, ${actor.activity}${actor.party ? ", celebrating in the party garden" : actor.zone === 'lounge' ? ", resting in the break room" : ''}`}
                style={{left:`${(actor.x-22)/visualScene.width*100}%`,top:`${(actor.y-72)/visualScene.height*100}%`,width:`${44/visualScene.width*100}%`,height:`${75/visualScene.height*100}%`,opacity:actor.pose?.opacity}}
                onMouseEnter={()=>setInspectedKey(actor.key)} onMouseLeave={()=>setInspectedKey(null)} onFocus={()=>setInspectedKey(actor.key)} onBlur={()=>setInspectedKey(null)}
                onClick={()=>onSelect(actor.sessionId,actor.agent.id)}>
                {actor.zone==='desk' && (!walking || waiting || actor.agent.status==='failed') && <span className="of-bubble" aria-hidden="true">{bubble}</span>}
                {/* Always-visible name tag: team colour stripe, gold for leads. The AI logo is on the shirt. */}
                <span className="of-tag" aria-hidden="true" data-lead={role!=='Agent'} data-zone={actor.zone} data-failed={actor.agent.status==='failed'} style={{ '--team': team?.color ?? '#a88b70', maxWidth:`calc(${(tagRoom.get(actor.key) ?? 99) / 44 * 100}% - 4px)` } as CSSProperties}>
                  {actor.agent.status==='failed' && <b className="of-tag-failed">✕</b>}{role!=='Agent' && <b>{role==='Lead' ? '♛' : '♜'}</b>}{actor.agent.name}
                </span>
                <span className="of-card" aria-hidden="true" data-visible={inspectedKey===actor.key||selectedKey===actor.key}>
                  <strong>{actor.agent.name}</strong>
                  <span>{role} · {ai}</span>
                  {team && <span className="of-card-team"><i style={{ background:team.color }} />{team.title}</span>}
                  <span className="of-card-activity">{actor.activity}</span>
                </span>
              </button>
            })}
            {peekFloor&&<OfficeBreakPeek floor={peekFloor} focusOnOpen={!autoPeek.current} width={visualScene.width} buildingHeight={visualScene.height} actors={allDisplayed.filter(a=>a.floorId===peekFloor.id)} canvasRef={peekCanvas} now={now} selectedKey={selectedKey}
              onClose={closePeek} onSelect={onSelect} onOpenTeam={onOpenTeam} onObject={object=>visitObject(peekFloor,object)} agentRef={agentRef}/>}
            {moving?.station && <div className="of-work-station" aria-hidden="true" style={{left:`${moving.actor.x/visualScene.width*100}%`,top:`${(moving.actor.y-82)/visualScene.height*100}%`}}>{OFFICE_STATION_LABELS[moving.station]}</div>}
          </div>
        )}
      </div>
      <div className="of-live-caption" role="status" aria-live="polite" title={captionMovement?`${captionMovement.actor.agent.name} ${captionMovement.caption}`:undefined}>
        {captionMovement?<><strong>{captionMovement.actor.agent.name}</strong><span>{captionMovement.caption}</span></>:<span aria-hidden="true">&nbsp;</span>}
      </div>
      {inspectedFloor&&stationSelection&&<aside className="of-station-panel" aria-label={`${OFFICE_STATION_NAMES[stationSelection.kind]} station details`}>
        <button type="button" className="of-station-close" aria-label="Close station details" onClick={()=>setStationSelection(null)}>×</button>
        <strong>{OFFICE_STATION_NAMES[stationSelection.kind]}</strong><small>{inspectedFloor.title}</small>
        {stationPeople.length?stationPeople.map(actor=><button key={actor.key} type="button" onClick={()=>onSelect(actor.sessionId,actor.agent.id)}><b>{actor.agent.name}</b><span>{actor.activity}</span></button>):<p>No agent is using this station.</p>}
      </aside>}
    </section>
  )
}
