'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TeamSnapshot } from '../../../lib/team-types'
import { isWorking, type TeamScope, type ConnectionView } from '../../../lib/team-model'
import type { AnimationMode } from '../../../lib/viewer-preferences'
import type { OfficeActor, OfficeEvent, OfficePet, OfficeScene, OfficeWorkStation, OfficeLeisureAction } from '../../../lib/office-types'
import { assignOfficeIdentities, buildOfficeScene, currentOfficeBoard, officeEvents, officeKey, officeTeamOrder } from '../../../lib/office-model'
import { createOfficeTrip, mergeOfficeEvents, officeAllowsMotion, officeCanResumeTrip, officeDepartureScene, officePresenceEvents, populatedOfficeTeams, officeTripFrame, parseOfficeIdentities, type OfficeTrip } from '../../../lib/office-motion'
import { deriveOfficeParties, emptyOfficePartyHistory } from '../../../lib/office-parties'
import { drawOfficeFrame, officeAmbient } from './office-art'
import { drawOfficeDaylight } from './office-daylight-art'
import { officeDaylight } from '../../../lib/office-daylight'
import { officeWorkEvents, officeWorkPulse, OFFICE_STATION_LABELS } from '../../../lib/office-work'
import { officeStations, officeStationUsers, officeRoomSeed, OFFICE_STATION_NAMES } from '../../../lib/office-stations'
import { officeLeisureObjects, nearestLeisureActor, createOfficeLeisureTrip, OFFICE_OBJECT_NAMES } from '../../../lib/office-leisure'
import { officeHatchOpen } from '../../../lib/office-navigation'
import { officeSky, officeSkyIcon } from '../../../lib/office-sky'
import { officeSeasonalActivity, officeSeasonalObjects } from '../../../lib/office-seasonal'
import { addOfficeArrivals, advanceOfficeArrivals, officeActorsWithArrivals } from '../../../lib/office-arrivals'

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
  const teamOrder = useMemo(()=>officeTeamOrder(snapshots.map(s=>s.sessionId),savedTeamOrder),[snapshots,savedTeamOrder])
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
  const [heldLayout, setHeldLayout] = useState<OfficeScene | null>(null)
  const held = useRef<OfficeScene | null>(null)
  const holdLayout = (value: OfficeScene | null) => { held.current = value; setHeldLayout(value) }
  const visualScene = useMemo(() => heldLayout ? officeDepartureScene(heldLayout, scene, snapshots) : scene, [heldLayout, scene, snapshots])
  const enabled = visible && pageVisible && live && officeAllowsMotion(animationMode) && !paused
  const canvas = useRef<HTMLCanvasElement>(null)
  const lastPainted = useRef<Moving|null>(null)
  const painted = useRef(false)
  const reconnecting = useRef(false)
  const objectCue = useRef<{actorKey:string;kind:OfficeLeisureAction;until:number}|null>(null)
  const leisureTrips = useRef(new Map<string,{trip:OfficeTrip;kind:OfficeLeisureAction}>())
  const leisureVisual = useRef(new Map<string,Moving>())
  const arrivalTrips = useRef(new Map<string,OfficeTrip>())
  const [,setArrivalTick] = useState(0)
  const [restMoving,setRestMoving]=useState<Moving[]>([])
  const hatchClosed = useRef<HTMLDivElement>(null)
  const hatchButton = useRef<HTMLButtonElement>(null)
  const hatchManual = useRef(false)
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
  const current = useRef({ scene: visualScene, selectedKey, pets, petEvent, enabled, live })
  current.current = { scene: visualScene, selectedKey, pets, petEvent, enabled, live }

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
        active.current = null; setMoving(null); holdLayout(null)
      }
      baseline.current = { snapshots, scene, enabled, scope, showQuiet }
      return
    }
    if (!enabled || !previous?.enabled || previous.scope !== scope || previous.showQuiet !== showQuiet) {
      queue.current = []; active.current = null; setMoving(null); holdLayout(null)
      if(arrivalTrips.current.size){arrivalTrips.current.clear();setArrivalTick(n=>n+1)}
    } else if (previous.scene !== scene) {
      const priorIds=new Set(previous.snapshots.map(s=>s.sessionId))
      const newTeams=new Set(previous.snapshots.length?snapshots.filter(s=>!priorIds.has(s.sessionId)).map(s=>s.sessionId):[])
      const observed = [...officeEvents(previous.snapshots, snapshots, Date.now()), ...officePresenceEvents(previous.scene, scene, populatedOfficeTeams(previous.snapshots), Date.now(),newTeams), ...officeWorkEvents(previous.scene,scene,Date.now())]
      arrivalTrips.current=addOfficeArrivals(arrivalTrips.current,observed,previous.scene,scene,motionClock.current)
      const events=observed.filter(event=>event.kind!=='arrived'&&!arrivalTrips.current.has(event.actorKey))
      setArrivalTick(n=>n+1)
      if (events.some(event => event.kind === 'left')) {
        if (!held.current) holdLayout(previous.scene)
        active.current = null; setMoving(null)
      }
      const pendingBefore = new Map(queue.current.map(item => [item.event.id, item.before]))
      const merged = mergeOfficeEvents(queue.current.map(item => item.event), events, Date.now(), event =>
        createOfficeTrip(event, pendingBefore.get(event.id) ?? previous.scene, scene, 0) !== null)
      const old = new Map(queue.current.map(item => [item.event.id, item]))
      queue.current = merged.map(event => old.get(event.id) ?? { event, before: previous.scene })
      if (active.current && events.some(event => event.kind!=='activity'&&event.actorKey === active.current!.event.actorKey)) { active.current = null; setMoving(null) }
      if (active.current && active.current.event.kind !== 'left' && !scene.actors.some(actor => actor.key === active.current!.actorKey)) { active.current = null; setMoving(null) }
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
    const overrides=new Map([...leisureVisual.current].map(([key,value])=>[key,value.actor]))
    if(movement)overrides.set(movement.actor.key,movement.actor)
    const actors=officeActorsWithArrivals(input.scene,arrivalTrips.current,motionClock.current).map(actor=>overrides.get(actor.key)??actor)
    if(movement&&!actors.some(actor=>actor.key===movement.actor.key))actors.push(movement.actor)
    context.setTransform(ratio,0,0,ratio,0,0)
    const skyElement=skyCanvas.current, skyContext=skyElement?.getContext('2d')
    const surfaceHeight=input.scene.floors.find(f=>f.kind==='lounge')?.height??0
    const opening=officeHatchOpen(input.scene,movement?.actor??null,hatchManual.current)||actors.some(actor=>arrivalTrips.current.has(actor.key)&&officeHatchOpen(input.scene,actor,false))
    if(hatchClosed.current)hatchClosed.current.style.opacity=opening?'0':'1'
    if(hatchButton.current){hatchButton.current.setAttribute('aria-expanded',String(opening));hatchButton.current.setAttribute('aria-label',opening?'Close garden hatch':'Open garden hatch')}
    if(skyElement&&skyContext){
      if(skyElement.width!==w||skyElement.height!==Math.round(surfaceHeight*ratio)){skyElement.width=w;skyElement.height=Math.round(surfaceHeight*ratio)}
      skyContext.setTransform(ratio,0,0,ratio,0,0)
      drawOfficeDaylight(skyContext,input.scene,new Date(),input.enabled?elapsed.current:0)
    }
    const greeting = greet.current && greet.current.until > elapsed.current ? greet.current.key : null
    const offsets = drawOfficeFrame(context, { ...input.scene, actors }, { time: elapsed.current, date: new Date(), now: Date.now(), live: input.live,
      motion: input.enabled, pets: input.pets, petEvent: input.petEvent, selectedKey: input.selectedKey,
      objectCue:objectCue.current&&objectCue.current.until>elapsed.current?objectCue.current:null,
      leisureKeys:new Set([...leisureTrips.current.keys(),...arrivalTrips.current.keys()]),
      tripKey: input.enabled ? active.current?.actorKey ?? null : null, greetKey: input.enabled ? greeting : null })
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
  }, [visualScene, now, enabled, live, selectedKey, petEvent])
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
      if(held.current)for(const [key,trip] of arrivalTrips.current)arrivalTrips.current.set(key,{...trip,startedAt:trip.startedAt+delta,endsAt:trip.endsAt+delta})
      if (time - lastPaint < interval) return
      lastPaint = time
      const input = current.current
      if(!held.current){
        const arrivals=advanceOfficeArrivals(arrivalTrips.current,input.scene,motionClock.current)
        arrivalTrips.current=arrivals.trips
        for(const trip of arrivals.completed)greetArrival(trip,input.scene)
      }
      if(motionClock.current>=nextSeasonalAt.current){
        nextSeasonalAt.current=motionClock.current+45_000
        const available={...input.scene,actors:input.scene.actors.filter(a=>a.key!==active.current?.actorKey&&!leisureTrips.current.has(a.key)&&!arrivalTrips.current.has(a.key)&&a.agent.status!=='failed')}
        const rooms=input.scene.floors.filter(f=>f.kind==='break')
        for(let i=0;i<rooms.length;i++){
          const floor=rooms[(seasonalCursor.current+i)%rooms.length]
          const object=officeSeasonalObjects(floor,input.scene.width,new Date())[0]
          const person=object&&nearestLeisureActor(available,floor,object)
          if(person){const trip=createOfficeLeisureTrip(input.scene,person.key,object,motionClock.current);if(trip){leisureTrips.current.set(person.key,{trip,kind:object.kind});seasonalCursor.current++;break}}
        }
      }
      queue.current = queue.current.filter(pending => Date.now() - pending.event.at <= 15_000&&!arrivalTrips.current.has(pending.event.actorKey))
      if (held.current && !active.current && !queue.current.some(pending => pending.event.kind === 'left')) {
        holdLayout(null); setMoving(null); return
      }
      if (!active.current) {
        while (queue.current.length) {
          const index = held.current ? queue.current.findIndex(item => item.event.kind === 'left') : 0
          if (index < 0) break
          const pending = queue.current.splice(index, 1)[0]
          if (Date.now() - pending.event.at > 15_000) continue
          let trip = createOfficeTrip(pending.event, pending.before, input.scene, motionClock.current)
          const rendered=trip?(leisureVisual.current.get(trip.actorKey)??(lastPainted.current?.actor.key===trip.actorKey?lastPainted.current:null)):null
          if(trip&&rendered&&pending.before.actors.some(a=>a.key===trip!.actorKey&&a.floorId===rendered.actor.floorId)){
            const origin={...pending.before,actors:pending.before.actors.map(a=>a.key===trip!.actorKey?{...a,x:rendered.actor.x,y:rendered.actor.y}:a)}
            trip=createOfficeTrip(pending.event,origin,input.scene,motionClock.current)
          }
          if (trip) { active.current = trip; break }
        }
      }
      let movement: Moving | null = null
      if(!active.current&&!held.current&&!arrivalTrips.current.size&&motionClock.current>=nextWorkAt.current){
        nextWorkAt.current=motionClock.current+5000
        const work=officeWorkPulse(input.scene,workCursor.current++,Date.now())
        if(work)active.current=createOfficeTrip(work,input.scene,input.scene,motionClock.current)
      }
      if (active.current) {
        const trip = active.current, frame = officeTripFrame(trip, motionClock.current)
        const actor = input.scene.actors.find(actor => actor.key === trip.actorKey) ?? (trip.event.kind === 'left' ? trip.actor : null)
        if (frame.done || !actor || (trip.event.kind==='activity'&&!isWorking(actor.agent.status))) {
          if (frame.done) greetArrival(trip, input.scene)
          if (trip.event.kind === 'left' && held.current) holdLayout({ ...held.current, actors: held.current.actors.filter(item => item.key !== trip.actorKey) })
          active.current = null; setMoving(null)
        }
        else movement = { actor: { ...actor, ...frame.point, pose: { ...frame.pose, lead: actor.agent.role === 'lead' } }, caption: trip.caption, elevatorY: frame.elevatorY, station:trip.event.station }
      }
      for(const [key,entry] of leisureTrips.current){
        const actor=input.scene.actors.find(a=>a.key===key)
        if(!actor||actor.hidden||actor.zone!=='lounge'){leisureTrips.current.delete(key);leisureVisual.current.delete(key);continue}
        const dx=actor.x-entry.trip.actor.x,dy=actor.y-entry.trip.actor.y
        if(dx||dy){entry.trip={...entry.trip,actor,segments:entry.trip.segments.map(s=>({...s,from:{x:s.from.x+dx,y:s.from.y+dy},to:{x:s.to.x+dx,y:s.to.y+dy}}))}}
        const frame=officeTripFrame(entry.trip,motionClock.current)
        if(frame.done){leisureTrips.current.delete(key);leisureVisual.current.delete(key);continue}
        leisureVisual.current.set(key,{actor:{...actor,...frame.point,stand:true,pose:{...frame.pose,sit:!frame.pose.walk&&(entry.kind==='book'||entry.kind==='snack'),objectAction:frame.pose.walk?undefined:entry.kind}},caption:entry.trip.caption,elevatorY:null})
      }
      paint(movement)
      if (time - lastLabels >= 80) { setMoving(movement);setRestMoving([...leisureVisual.current.values()]);setArrivalTick(n=>n+1);lastLabels = time }
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [enabled, animationMode])

  // Name tags never overlap: each is at most the gap to its nearest same-row neighbour (minus 4px).
  const tagRoom = useMemo(() => {
    const room = new Map<string, number>(), seated = visualScene.actors.filter(actor => !actor.hidden)
    for (const actor of seated) {
      let nearest = Infinity
      for (const other of seated) if (other !== actor && other.zone === actor.zone && other.floorId === actor.floorId && Math.abs(other.y - actor.y) < 12) nearest = Math.min(nearest, Math.abs(other.x - actor.x))
      room.set(actor.key, Math.min(nearest, actor.zone === 'lounge' ? 70 : 99))
    }
    return room
  }, [visualScene])
  const restByKey=new Map(restMoving.map(m=>[m.actor.key,m.actor]))
  // Project pending evidence during render too, before the effect commits it, so a new name tag
  // never gets one browser frame at its canonical desk while its body waits outside.
  let displayedArrivals=arrivalTrips.current
  const priorDisplay=baseline.current
  if(enabled&&priorDisplay?.enabled&&priorDisplay.scope===scope&&priorDisplay.showQuiet===showQuiet&&priorDisplay.scene!==scene){
    const priorIds=new Set(priorDisplay.snapshots.map(s=>s.sessionId))
    const newTeams=new Set(priorDisplay.snapshots.length?snapshots.filter(s=>!priorIds.has(s.sessionId)).map(s=>s.sessionId):[])
    displayedArrivals=addOfficeArrivals(displayedArrivals,officePresenceEvents(priorDisplay.scene,scene,populatedOfficeTeams(priorDisplay.snapshots),Date.now(),newTeams),priorDisplay.scene,scene,motionClock.current)
  }
  const displayed=officeActorsWithArrivals(visualScene,displayedArrivals,motionClock.current).map(actor=>moving?.actor.key===actor.key?moving.actor:restByKey.get(actor.key)??actor)
  if(moving&&!displayed.some(a=>a.key===moving.actor.key))displayed.push(moving.actor)

  const ambient = officeAmbient(new Date(now))
  const sky = officeSky(new Date(now))
  const seasonalActivity = officeSeasonalActivity(new Date(now))
  const daylight = officeDaylight(new Date(now))
  const working = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => isWorking(agent.status)).length, 0)
  const needsYou = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => agent.status.startsWith('waiting_')).length, 0)
  const lounge = visualScene.floors.find(floor => floor.kind === 'lounge')
  const captionMovement=moving??restMoving[0]??null
  const inspectedFloor=stationSelection?scene.floors.find(f=>f.kind==='team'&&f.sessionId===stationSelection.sessionId):null
  const stationPeople=inspectedFloor&&stationSelection?officeStationUsers(scene,inspectedFloor,stationSelection.kind):[]

  return (
    <section className="of-view" data-motion={enabled} data-season={sky.season} data-holiday={sky.holiday??undefined} aria-label="Agent Office">
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
            {visualScene.floors.filter(f=>f.kind!=='quiet').map(floor=><div key={`art-${floor.id}`} aria-hidden="true" data-season={floor.kind==='lounge'?sky.season:undefined} className={`of-art of-art-${floor.kind==='lounge'?'surface':floor.room}`} style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`,filter:floor.kind==='lounge'?`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`:undefined}} />)}
            <div aria-hidden="true" className="of-art of-art-bottom" style={{bottom:0,height:`${visualScene.width/3/visualScene.height*100}%`}} />
            <div ref={hatchClosed} aria-hidden="true" data-season={sky.season} className="of-hatch-closed" style={{height:`${(lounge?.height??0)/visualScene.height*100}%`,filter:`brightness(${.32+.68*daylight.light}) saturate(${.7+.3*daylight.light})`}}/>
            <span className="of-season-label" title={`${sky.label} · Simulated weather · ${seasonalActivity.label}`} style={{top:`${(lounge?.height??0)*.86/visualScene.height*100}%`}}>{sky.label} · {seasonalActivity.label}</span>
            {visualScene.floors.filter(f=>f.kind==='team').map(floor=><div key={`tint-${floor.id}`} aria-hidden="true" className="of-room-tint" style={{top:`${(floor.y+(floor.height??0)*.20)/visualScene.height*100}%`,height:`${(floor.height??0)*.41/visualScene.height*100}%`,background:['#427b75','#79609a','#657d49','#a46342'][officeRoomSeed(floor.sessionId??floor.id)%4]}} />)}
            {visualScene.floors.filter(f=>f.kind==='team').flatMap(floor=>officeStations(floor,visualScene.width).map(station=>{
              const users=officeStationUsers(scene,floor,station.kind)
              return <button key={`${floor.id}-${station.kind}`} type="button" className="of-workbench" data-kind={station.kind} data-active={users.length>0}
                aria-label={`${OFFICE_STATION_NAMES[station.kind]}, ${floor.title}, ${users.length} working`}
                onClick={()=>floor.sessionId&&setStationSelection({sessionId:floor.sessionId,kind:station.kind})}
                style={{left:`${(station.x-station.width/2)/visualScene.width*100}%`,top:`${(station.y-station.height*.88)/visualScene.height*100}%`,width:`${station.width/visualScene.width*100}%`,height:`${station.height/visualScene.height*100}%`,'--station-accent':floor.color} as CSSProperties}>
                <span>{OFFICE_STATION_NAMES[station.kind]}{users.length>0&&<b> · {users.length}</b>}</span>
                {users.length>0&&<i aria-hidden="true"/>}
              </button>
            }))}
            {/* Every office has a progress board; compact rooms use a smaller wall panel. */}
            {visualScene.floors.filter(floor => floor.kind === 'team').map(floor => {
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
                <button type="button" className="of-board-hit" aria-label={`Inspect planning board, ${floor.title}`} onClick={()=>floor.sessionId&&setStationSelection({sessionId:floor.sessionId,kind:'planning'})}/>
              </div>
            })}
            <canvas ref={canvas} role="img" aria-label={`Office with ${visualScene.actors.filter(a=>!a.hidden).length} visible agents from ${snapshots.length} T3 teams. Choose an agent for details.`} />
            <button ref={hatchButton} type="button" className="of-hatch-hit" aria-label="Open garden hatch" aria-expanded="false" onClick={()=>{hatchManual.current=!hatchManual.current;paint(lastPainted.current)}} style={{top:`${(lounge?.height??0)*.51/visualScene.height*100}%`,height:`${(lounge?.height??0)*.25/visualScene.height*100}%`}}/>
            {visualScene.floors.filter(f=>f.kind==='break'||f.kind==='lounge').flatMap(floor=>{
              if(!visualScene.actors.some(a=>a.floorId===floor.id&&a.zone==='lounge'&&!a.hidden))return []
              return [...officeLeisureObjects(floor,visualScene.width).map(object=>({...object,label:OFFICE_OBJECT_NAMES[object.kind]})),...officeSeasonalObjects(floor,visualScene.width,new Date(now))].map((object,index)=><button key={`${floor.id}-${object.kind}-${index}`} type="button" className="of-object-hit" aria-label={`${object.label}, ${floor.title}`}
                style={{left:`${(object.x-20)/visualScene.width*100}%`,top:`${(object.y-24)/visualScene.height*100}%`,width:`${40/visualScene.width*100}%`,height:`${34/visualScene.height*100}%`}}
                onClick={()=>{const playable={...current.current.scene,actors:current.current.scene.actors.filter(a=>a.key!==active.current?.actorKey&&!arrivalTrips.current.has(a.key))};const person=nearestLeisureActor(playable,floor,object);if(person){
                  if(current.current.enabled){const trip=createOfficeLeisureTrip(current.current.scene,person.key,object,motionClock.current,leisureVisual.current.get(person.key)?.actor);if(trip)leisureTrips.current.set(person.key,{trip,kind:object.kind})}
                  else{objectCue.current={actorKey:person.key,kind:object.kind,until:elapsed.current+7};paint(lastPainted.current)}
                }}}><span>{object.label}</span></button>)
            })}
            {visualScene.floors.filter(f=>f.kind!=='lounge').map(floor => <div key={floor.id} className="of-floor-row" style={{ top:`${(floor.y+5)/visualScene.height*100}%` }}>
              <button type="button" className="of-floor-label" style={floor.kind === 'team' || floor.kind === 'break' ? { borderLeft:`4px solid ${floor.color}` } : undefined}
                aria-expanded={floor.kind === 'quiet' ? showQuiet : undefined}
                title={floor.kind === 'quiet' ? showQuiet ? 'Hide history' : 'Show history' : floor.title}
                onClick={() => floor.kind === 'quiet' ? setShowQuiet(v=>!v) : floor.sessionId && onOpenTeam(floor.sessionId,null)}>
                <i aria-hidden="true" style={{background:floor.waiting ? '#ffc46b' : floor.working ? '#a8d78d' : floor.color}} />
                <strong>{floor.title}{floor.kind === 'quiet' ? showQuiet ? ' · Hide history' : ' · Show history' : ''}</strong><span>{floor.kind === 'quiet' ? showQuiet ? '−' : '+' : floor.subtitle}</span>
              </button>
              {!!floor.overflow && <button type="button" className="of-overflow" onClick={()=>floor.sessionId&&onOpenTeam(floor.sessionId,null)} aria-label={`Open team in Board: ${floor.overflow} more agents${floor.kind === 'break' ? ' resting in the break room' : ''}`}>+{floor.overflow}</button>}
            </div>)}
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
              return <button key={actor.key} ref={agentRef(actor.key)} data-zone={actor.zone} type="button" className="of-agent" data-status={actor.agent.status} data-selected={selectedKey===actor.key} data-edge={actor.x>visualScene.width*.55?'end':'start'}
                aria-pressed={selectedKey===actor.key} aria-label={`${actor.agent.name}, ${role}, ${ai}${team ? `, team ${team.title}` : ''}, ${actor.activity}${actor.party ? ", celebrating in the party garden" : actor.zone === 'lounge' ? ", resting in the break room" : ''}`}
                style={{left:`${(actor.x-22)/visualScene.width*100}%`,top:`${(actor.y-72)/visualScene.height*100}%`,width:`${44/visualScene.width*100}%`,height:`${75/visualScene.height*100}%`}}
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
