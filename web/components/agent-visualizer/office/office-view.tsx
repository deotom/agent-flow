'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TeamSnapshot } from '../../../lib/team-types'
import { isWorking, type TeamScope } from '../../../lib/team-model'
import type { AnimationMode } from '../../../lib/viewer-preferences'
import type { OfficeActor, OfficeEvent, OfficePet, OfficeScene } from '../../../lib/office-types'
import { assignOfficeIdentities, buildOfficeScene, officeEvents, officeKey } from '../../../lib/office-model'
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

function useDisplayPreferences() {
  const [reduced, setReduced] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(media.matches)
    const visibility = () => setPageVisible(!document.hidden)
    motion(); visibility()
    media.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  return { reduced, pageVisible }
}
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
  const [paused, setPaused] = useState(false)
  const [allowReduced, setAllowReduced] = useState(() => { try { return localStorage.getItem('agent-flow-office-motion-override') === 'allow' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('agent-flow-office-motion-override', allowReduced ? 'allow' : 'system') } catch { /* In-memory selection remains available. */ } }, [allowReduced])
  const pets: OfficePet[] = []
  const petEvent = null
  const { reduced, pageVisible } = useDisplayPreferences()
  const viewport = useRef<HTMLDivElement>(null)
  const sceneWidth = 450
  const scene = useMemo(() => buildOfficeScene(snapshots, scope, showQuiet, identities, sceneWidth), [snapshots, scope, showQuiet, identities, sceneWidth])
  const [heldLayout, setHeldLayout] = useState<OfficeScene | null>(null)
  const held = useRef<OfficeScene | null>(null)
  const holdLayout = (value: OfficeScene | null) => { held.current = value; setHeldLayout(value) }
  const visualScene = useMemo(() => heldLayout ? officeDepartureScene(heldLayout, scene, snapshots) : scene, [heldLayout, scene, snapshots])
  const enabled = visible && pageVisible && live && officeAllowsMotion(animationMode, reduced, allowReduced) && !paused
  const canvas = useRef<HTMLCanvasElement>(null)
  const queue = useRef<Pending[]>([])
  const active = useRef<OfficeTrip | null>(null)
  const baseline = useRef<{ snapshots: readonly TeamSnapshot[]; scene: OfficeScene; enabled: boolean } | null>(null)
  const motionClock = useRef(0)
  const elapsed = useRef(0)
  const [moving, setMoving] = useState<Moving | null>(null)
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
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const input = current.current
    const actors = movement ? input.scene.actors.some(actor => actor.key === movement.actor.key) ? input.scene.actors.map(actor => actor.key === movement.actor.key ? movement.actor : actor) : [...input.scene.actors,movement.actor] : input.scene.actors
    context.setTransform(2,0,0,2,0,0)
    drawOfficeFrame(context, { ...input.scene, actors }, { time: elapsed.current, date: new Date(), now: Date.now(), live: input.live,
      motion: input.enabled, pets: input.pets, petEvent: input.petEvent, selectedKey: input.selectedKey, elevatorY: movement?.elevatorY ?? null, doorOpen: Boolean(movement && movement.actor.y >= input.scene.height-35) })
  }
  // Paint on mount and scene changes even when the animation loop is suspended.
  // A restored/hidden pane must never leave a newly mounted canvas transparent.
  useEffect(() => { paint(null) }, [visualScene, now, enabled, selectedKey, petEvent])
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
        <button type="button" aria-label={paused || (reduced && !allowReduced) ? 'Resume Office motion' : 'Pause Office motion'} aria-pressed={paused} disabled={animationMode === 'off'}
          onClick={() => { if (reduced) { setAllowReduced(value => !value); setPaused(false) } else setPaused(value => !value) }}
          title={animationMode === 'off' ? 'Effects off in Animation settings' : reduced ? allowReduced ? 'Pause and follow system reduced motion' : 'Enable Office motion despite system reduced motion' : paused ? 'Resume Office motion' : 'Pause Office motion'}>
          <span aria-hidden="true">{paused || (reduced && !allowReduced) ? '▶' : 'Ⅱ'}</span></button>

      </div>

      <div className="of-scroll" ref={viewport}>
        {snapshots.length === 0 ? <p className="of-empty">Your teams will appear here.</p> : (
          <div className="of-building" style={{ width:'100%', maxWidth:900, aspectRatio:`${visualScene.width} / ${visualScene.height}` } as CSSProperties}>
            {visualScene.floors.filter(f=>f.kind!=='quiet').map(floor=><div key={`art-${floor.id}`} aria-hidden="true" className={`of-art of-art-${floor.kind==='lounge'?'surface':floor.room}`} style={{top:`${floor.y/visualScene.height*100}%`,height:`${(floor.height??0)/visualScene.height*100}%`}} />)}
            <div aria-hidden="true" className="of-art of-art-bottom" style={{bottom:0,height:`${visualScene.width/3/visualScene.height*100}%`}} />
            <canvas ref={canvas} width={visualScene.width*2} height={visualScene.height*2} role="img" aria-label={`Office with ${visualScene.actors.filter(a=>!a.hidden).length} visible agents from ${snapshots.length} T3 teams. Choose an agent for details.`} />
            {visualScene.floors.filter(f=>f.kind!=='lounge').map(floor => <div key={floor.id}>
              <button type="button" className="of-floor-label" style={{ top:`${(floor.y+5)/visualScene.height*100}%`,right:floor.overflow?52:'7%' }}
                aria-expanded={floor.kind === 'quiet' ? showQuiet : undefined}
                title={floor.kind === 'quiet' ? showQuiet ? 'Collapse quiet teams' : 'Expand quiet teams' : floor.title}
                onClick={() => floor.kind === 'quiet' ? setShowQuiet(v=>!v) : floor.sessionId && onOpenTeam(floor.sessionId,null)}>
                <i aria-hidden="true" style={{background:floor.waiting ? '#ffc46b' : floor.working ? '#a8d78d' : floor.color}} />
                <strong>{floor.title}</strong><span>{floor.kind === 'quiet' ? showQuiet ? '−' : '+' : floor.subtitle}</span>
              </button>
              {!!floor.overflow && <button className="of-overflow" style={{right:'7%',top:`${(floor.y+5)/visualScene.height*100}%`}} onClick={()=>floor.sessionId&&onOpenTeam(floor.sessionId,null)} aria-label={`Open team in Board: ${floor.overflow} more agents`}>+{floor.overflow}</button>}
            </div>)}
            {!!lounge?.overflow && <span className="of-resting">+{lounge.overflow} resting</span>}
            {displayed.filter(actor=>!actor.hidden).map(actor => {
              const waiting=actor.agent.status.startsWith('waiting_')
              const activity=actor.agent.activities.at(-1)?.type ?? ''
              const bubble=waiting ? '!' : actor.agent.status==='failed' ? '×' : /edit|write|file_change/.test(activity) ? '</>' : /search|read/.test(activity) ? '⌕' : /command|tool|shell/.test(activity) ? '>_' : '…'
              return <button key={actor.key} type="button" className="of-agent" data-status={actor.agent.status} data-selected={selectedKey===actor.key}
                aria-pressed={selectedKey===actor.key} aria-label={`${actor.agent.name}, ${actor.runtimeName}, ${actor.agent.role}, ${actor.activity}`}
                style={{left:`${(actor.x-22)/visualScene.width*100}%`,top:`${(actor.y-72)/visualScene.height*100}%`,width:`${44/visualScene.width*100}%`,height:`${75/visualScene.height*100}%`}}
                onMouseEnter={()=>setInspectedKey(actor.key)} onMouseLeave={()=>setInspectedKey(null)} onFocus={()=>setInspectedKey(actor.key)} onBlur={()=>setInspectedKey(null)}
                onClick={()=>onSelect(actor.sessionId,actor.agent.id)}>
                {actor.zone==='desk' && <span className="of-bubble" aria-hidden="true">{bubble}</span>}
                <span className="of-name" data-visible={inspectedKey===actor.key||selectedKey===actor.key}>{actor.agent.name}</span>
              </button>
            })}
            {moving && <div className="of-toast" role="status" aria-live="polite">{moving.actor.agent.name} {moving.caption}</div>}
          </div>
        )}
      </div>
    </section>
  )
}
