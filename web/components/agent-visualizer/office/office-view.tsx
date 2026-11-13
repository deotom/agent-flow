'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TeamSnapshot } from '../../../lib/team-types'
import { isWorking, type TeamScope } from '../../../lib/team-model'
import type { AnimationMode } from '../../../lib/viewer-preferences'
import type { OfficeActor, OfficeEvent, OfficePet, OfficeScene } from '../../../lib/office-types'
import { assignOfficeIdentities, buildOfficeScene, currentOfficeBoard, OFFICE_PARTY_MS, officeEvents, officeKey, officeTeamQuiet } from '../../../lib/office-model'
import { createOfficeTrip, mergeOfficeEvents, officeAllowsMotion, officeDepartureScene, officePresenceEvents, populatedOfficeTeams, officeTripFrame, parseOfficeIdentities, type OfficeTrip } from '../../../lib/office-motion'
import { drawOfficeFrame, officeAmbient } from './office-art'

interface OfficeViewProps {
  snapshots: readonly TeamSnapshot[]
  scope: TeamScope
  selectedKey: string | null
  onSelect: (sessionId: string, agentId: string) => void
  onOpenTeam: (sessionId: string, agentId: string | null) => void
  live: boolean
  visible: boolean
  animationMode: AnimationMode
  now: number
}
const IDENTITY_STORAGE = 'agent-flow-office-identities-v1'
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
type Moving = { actor: OfficeActor; caption: string; elevatorY: number | null }
type Pending = { event: OfficeEvent; before: OfficeScene }

export function OfficeView({ snapshots, scope, selectedKey, onSelect, onOpenTeam, live, visible, animationMode, now }: OfficeViewProps) {
  const [savedIdentities, setSavedIdentities] = useState(readIdentities)
  const identities = useMemo(() => assignOfficeIdentities(snapshots.flatMap(snapshot => snapshot.agents.map(agent => officeKey(snapshot.sessionId, agent.id))), savedIdentities), [snapshots, savedIdentities])
  useEffect(() => {
    if (sameIdentities(identities, savedIdentities)) return
    setSavedIdentities(identities)
    try { localStorage.setItem(IDENTITY_STORAGE, JSON.stringify([...identities].slice(-10_000))) } catch { /* The in-memory identities still remain stable. */ }
  }, [identities, savedIdentities])
  const [showQuiet, setShowQuiet] = useState(false)
  // The user's own pause choice persists across launches.
  const [paused, setPaused] = useState(() => { try { return localStorage.getItem(PAUSE_STORAGE) === 'true' } catch { return false } })
  useEffect(() => { try { localStorage.setItem(PAUSE_STORAGE, String(paused)) } catch { /* In-memory selection remains available. */ } }, [paused])
  const pets: OfficePet[] = []
  const petEvent = null
  const pageVisible = usePageVisible()
  const viewport = useRef<HTMLDivElement>(null)
  const sceneWidth = 450
  // Parties end on a minute clock so the scene is not rebuilt every second.
  const partyClock = Math.floor(now / 60_000) * 60_000
  // Parties are for teams this viewer actually saw finish (active -> quiet), at most two at a time.
  // Derived during render so finishers go straight from their desks to the party, never via home.
  const partyLog = useRef({ quiet: null as Map<string, boolean> | null, since: new Map<string, number>(), snapshots: null as readonly TeamSnapshot[] | null })
  const parties = useMemo(() => {
    const log = partyLog.current
    if (log.snapshots !== snapshots) {
      const quietNow = new Map(snapshots.map(snapshot => [snapshot.sessionId, officeTeamQuiet(snapshot)]))
      if (log.quiet) for (const [id, isQuiet] of quietNow) if (isQuiet && log.quiet.get(id) === false) log.since.set(id, Date.now())
      for (const id of [...log.since.keys()]) if (!quietNow.get(id)) log.since.delete(id)
      log.quiet = quietNow; log.snapshots = snapshots
    }
    for (const [id, at] of [...log.since]) if (partyClock - at >= OFFICE_PARTY_MS) log.since.delete(id)
    return new Set([...log.since].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id))
  }, [snapshots, partyClock])
  const scene = useMemo(() => buildOfficeScene(snapshots, scope, showQuiet, identities, sceneWidth, parties), [snapshots, scope, showQuiet, identities, sceneWidth, parties])
  const [heldLayout, setHeldLayout] = useState<OfficeScene | null>(null)
  const held = useRef<OfficeScene | null>(null)
  const holdLayout = (value: OfficeScene | null) => { held.current = value; setHeldLayout(value) }
  const visualScene = useMemo(() => heldLayout ? officeDepartureScene(heldLayout, scene, snapshots) : scene, [heldLayout, scene, snapshots])
  const enabled = visible && pageVisible && live && officeAllowsMotion(animationMode) && !paused
  const canvas = useRef<HTMLCanvasElement>(null)
  const queue = useRef<Pending[]>([])
  const active = useRef<OfficeTrip | null>(null)
  const baseline = useRef<{ snapshots: readonly TeamSnapshot[]; scene: OfficeScene; enabled: boolean } | null>(null)
  const motionClock = useRef(0)
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
    if (!enabled || !previous?.enabled) {
      queue.current = []; active.current = null; setMoving(null); holdLayout(null)
    } else if (previous.snapshots !== snapshots) {
      const events = [...officeEvents(previous.snapshots, snapshots, Date.now()), ...officePresenceEvents(previous.scene, scene, populatedOfficeTeams(previous.snapshots), Date.now())]
      if (events.some(event => event.kind === 'left')) {
        if (!held.current) holdLayout(previous.scene)
        active.current = null; setMoving(null)
      }
      const merged = mergeOfficeEvents(queue.current.map(item => item.event), events, Date.now())
      const old = new Map(queue.current.map(item => [item.event.id, item]))
      queue.current = merged.map(event => old.get(event.id) ?? { event, before: previous.scene })
      if (active.current && events.some(event => event.actorKey === active.current!.event.actorKey)) { active.current = null; setMoving(null) }
      if (active.current && active.current.event.kind !== 'left' && !scene.actors.some(actor => actor.key === active.current!.actorKey)) { active.current = null; setMoving(null) }
    }
    baseline.current = { snapshots, scene, enabled }
  }, [snapshots, scene, enabled])

  const paint = (movement: Moving | null) => {
    const element = canvas.current, context = element?.getContext('2d')
    if (!element || !context) return
    const input = current.current
    // Backing store follows rendered size × device pixel ratio so wide views stay crisp.
    const ratio = Math.max(1, Math.min(4, Math.ceil((element.clientWidth || input.scene.width) * (window.devicePixelRatio || 1) / input.scene.width * 4) / 4))
    const w = Math.round(input.scene.width * ratio), h = Math.round(input.scene.height * ratio)
    if (element.width !== w || element.height !== h) { element.width = w; element.height = h }
    const actors = movement ? input.scene.actors.some(actor => actor.key === movement.actor.key) ? input.scene.actors.map(actor => actor.key === movement.actor.key ? movement.actor : actor) : [...input.scene.actors,movement.actor] : input.scene.actors
    context.setTransform(ratio,0,0,ratio,0,0)
    const greeting = greet.current && greet.current.until > elapsed.current ? greet.current.key : null
    const offsets = drawOfficeFrame(context, { ...input.scene, actors }, { time: elapsed.current, date: new Date(), now: Date.now(), live: input.live,
      motion: input.enabled, pets: input.pets, petEvent: input.petEvent, selectedKey: input.selectedKey, elevatorY: movement?.elevatorY ?? null, doorOpen: Boolean(movement && movement.actor.y >= input.scene.height-35),
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
  useEffect(() => { paint(null) }, [visualScene, now, enabled, selectedKey, petEvent])
  useEffect(() => {
    const element = canvas.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { cssScale.current = element.clientWidth / current.current.scene.width; if (!current.current.enabled) paint(null) })
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
      if (time - lastPaint < interval) return
      lastPaint = time
      const input = current.current
      queue.current = queue.current.filter(pending => Date.now() - pending.event.at <= 15_000)
      if (held.current && !active.current && !queue.current.some(pending => pending.event.kind === 'left')) {
        holdLayout(null); setMoving(null); return
      }
      if (!active.current) {
        while (queue.current.length) {
          const index = held.current ? queue.current.findIndex(item => item.event.kind === 'left') : 0
          if (index < 0) break
          const pending = queue.current.splice(index, 1)[0]
          if (Date.now() - pending.event.at > 15_000) continue
          const trip = createOfficeTrip(pending.event, pending.before, input.scene, motionClock.current)
          if (trip) { active.current = trip; break }
        }
      }
      let movement: Moving | null = null
      if (active.current) {
        const trip = active.current, frame = officeTripFrame(trip, motionClock.current)
        const actor = input.scene.actors.find(actor => actor.key === trip.actorKey) ?? (trip.event.kind === 'left' ? trip.actor : null)
        if (frame.done || !actor) {
          if (frame.done) greetArrival(trip, input.scene)
          if (trip.event.kind === 'left' && held.current) holdLayout({ ...held.current, actors: held.current.actors.filter(item => item.key !== trip.actorKey) })
          active.current = null; setMoving(null)
        }
        else movement = { actor: { ...actor, ...frame.point, pose: { ...frame.pose, lead: actor.agent.role === 'lead' } }, caption: trip.caption, elevatorY: frame.elevatorY }
      }
      paint(movement)
      if (time - lastLabels >= 80) { setMoving(movement); lastLabels = time }
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
  const displayed = moving ? visualScene.actors.some(actor => actor.key === moving.actor.key) ? visualScene.actors.map(actor => actor.key === moving.actor.key ? moving.actor : actor) : [...visualScene.actors,moving.actor] : visualScene.actors

  const ambient = officeAmbient(new Date(now))
  const working = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => isWorking(agent.status)).length, 0)
  const needsYou = snapshots.reduce((sum, team) => sum + team.agents.filter(agent => agent.status.startsWith('waiting_')).length, 0)
  const lounge = visualScene.floors.find(floor => floor.kind === 'lounge')

  return (
    <section className="of-view" data-motion={enabled} aria-label="Agent Office">
      <div className="of-toolbar">
        <span className="of-counts">{working} working{needsYou > 0 && <strong className="of-waiting"> · {needsYou} need you</strong>}</span>
        <time dateTime={new Date(now).toISOString()} title={`${ambient.name} · local time`}><span aria-hidden="true">{ambient.night ? '☾' : '☀'}</span> {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
        <button type="button" aria-label={paused ? 'Resume Office motion' : 'Pause Office motion'} aria-pressed={paused} disabled={animationMode === 'off'}
          onClick={() => setPaused(value => !value)}
          title={animationMode === 'off' ? 'Effects off in Animation settings' : paused ? 'Resume Office motion' : 'Pause Office motion'}>
          <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span></button>

      </div>

      <div className="of-scroll" ref={viewport}>
        {snapshots.length === 0 ? <p className="of-empty">Your teams will appear here.</p> : (
          <div className="of-building" style={{ width:'100%', maxWidth:900, aspectRatio:`${visualScene.width} / ${visualScene.height}` } as CSSProperties}>
            {visualScene.floors.filter(f=>f.kind!=='quiet').map(floor=><div key={`art-${floor.id}`} aria-hidden="true" className={`of-art of-art-${floor.kind==='lounge'?'surface':floor.room}`} style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`}} />)}
            <div aria-hidden="true" className="of-art of-art-bottom" style={{bottom:0,height:`${visualScene.width/3/visualScene.height*100}%`}} />
            {/* Library blackboard: team goal, task progress and what matters now, in chalk. */}
            {visualScene.floors.filter(floor => floor.room === 'room-c-big').map(floor => {
              // Geometry may be held during departures; content always comes from the current scene.
              const board = currentOfficeBoard(floor, scene), h = floor.height ?? 0
              if (!board) return null
              const progress = board.total ? `${board.done} of ${board.total} tasks done` : 'No tasks yet'
              return <div key={`board-${floor.id}`} className="of-board" role="note"
                aria-label={`Team board: ${board.goal}. ${progress}.${board.items.map(item => ` ${BOARD_STATES[item.state]}: ${item.label}.`).join('')}`}
                style={{ top:`${(floor.y + h * .19) / visualScene.height * 100}%`, height:`${h * .132 / visualScene.height * 100}%` }}>
                <div className="of-board-inner">
                <div className="of-board-goal" aria-hidden="true">{board.goal}</div>
                <div className="of-board-progress" aria-hidden="true">
                  <span className="of-board-bar"><i style={{ width:`${board.total ? board.done / board.total * 100 : 0}%` }} /></span>
                  {board.total ? `${board.done}/${board.total}` : 'no tasks yet'}
                </div>
                <ul aria-hidden="true">{board.items.map((item, index) => <li key={index} data-state={item.state}><b>{BOARD_MARKS[item.state]}</b>{item.label}</li>)}</ul>
                </div>
              </div>
            })}
            <canvas ref={canvas} role="img" aria-label={`Office with ${visualScene.actors.filter(a=>!a.hidden).length} visible agents from ${snapshots.length} T3 teams. Choose an agent for details.`} />
            {visualScene.floors.filter(f=>f.kind!=='lounge').map(floor => <div key={floor.id} className="of-floor-row" style={{ top:`${(floor.y+5)/visualScene.height*100}%` }}>
              <button type="button" className="of-floor-label" style={floor.kind === 'team' || floor.kind === 'break' ? { borderLeft:`4px solid ${floor.color}` } : undefined}
                aria-expanded={floor.kind === 'quiet' ? showQuiet : undefined}
                title={floor.kind === 'quiet' ? showQuiet ? 'Collapse quiet teams' : 'Expand quiet teams' : floor.title}
                onClick={() => floor.kind === 'quiet' ? setShowQuiet(v=>!v) : floor.sessionId && onOpenTeam(floor.sessionId,null)}>
                <i aria-hidden="true" style={{background:floor.waiting ? '#ffc46b' : floor.working ? '#a8d78d' : floor.color}} />
                <strong>{floor.title}</strong><span>{floor.kind === 'quiet' ? showQuiet ? '−' : '+' : floor.subtitle}</span>
              </button>
              {!!floor.overflow && <button type="button" className="of-overflow" onClick={()=>floor.sessionId&&onOpenTeam(floor.sessionId,null)} aria-label={`Open team in Board: ${floor.overflow} more agents`}>+{floor.overflow}</button>}
            </div>)}
            {(!!lounge?.overflow || !!lounge?.party?.length) && <span className="of-resting" data-party={!!lounge?.party?.length}>
              {lounge?.party?.length ? `🎉 ${lounge.party[0]} finished${lounge.party.length > 1 ? ` +${lounge.party.length - 1}` : ''}` : ''}
              {lounge?.party?.length && lounge.overflow ? ' · ' : ''}{lounge?.overflow ? `+${lounge.overflow} more` : ''}
            </span>}
            {displayed.filter(actor=>!actor.hidden).map(actor => {
              const waiting=actor.agent.status.startsWith('waiting_'), walking=Boolean(actor.pose?.walk||actor.pose?.climb)
              const activity=actor.agent.activities.at(-1)?.type ?? ''
              const role=actor.agent.role==='lead' ? 'Lead' : actor.pod ? 'Sub-lead' : 'Agent'
              const ai=[actor.runtimeName, actor.agent.model].filter(Boolean).join(' · ')
              const team=actor.team ?? visualScene.floors.find(floor=>floor.id===actor.floorId)
              const bubble=waiting ? '!' : actor.agent.status==='failed' ? '×' : /edit|write|file_change/.test(activity) ? '</>' : /search|read/.test(activity) ? '⌕' : /command|tool|shell/.test(activity) ? '>_' : '…'
              return <button key={actor.key} ref={agentRef(actor.key)} data-zone={actor.zone} type="button" className="of-agent" data-status={actor.agent.status} data-selected={selectedKey===actor.key} data-edge={actor.x>visualScene.width*.55?'end':'start'}
                aria-pressed={selectedKey===actor.key} aria-label={`${actor.agent.name}, ${role}, ${ai}${team ? `, team ${team.title}` : ''}, ${actor.activity}`}
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
            {moving && <div className="of-toast" role="status" aria-live="polite">{moving.actor.agent.name} {moving.caption}</div>}
          </div>
        )}
      </div>
    </section>
  )
}
