'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TeamSnapshot } from '../../../lib/team-types'
import { STATUS_LABEL, isWorking, type TeamScope } from '../../../lib/team-model'
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

function visitingPets(): OfficePet[] {
  const choices: OfficePet[] = ['dog', 'rabbit', 'bird', 'turtle']
  const pets: OfficePet[] = []
  const count = 1 + Math.floor(Math.random() * 2)
  for (let i = 0; i < count; i++) pets.push(choices.splice(Math.floor(Math.random() * choices.length), 1)[0])
  return pets
}
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
  const [pets] = useState(visitingPets)
  const [petEvent, setPetEvent] = useState<{ kind: 'coffee' | 'heart' | 'fish'; until: number } | null>(null)
  const [petNote, setPetNote] = useState('A resident cat and visiting pets share the lounge. Try greeting the cat.')
  useEffect(() => {
    if (!petEvent) return
    const timer = setTimeout(() => { setPetEvent(null); setPetNote('A resident cat and visiting pets share the lounge. Try greeting the cat.') }, Math.max(0, petEvent.until - Date.now()))
    return () => clearTimeout(timer)
  }, [petEvent])
  const { reduced, pageVisible } = useDisplayPreferences()
  const scene = useMemo(() => buildOfficeScene(snapshots, scope, showQuiet, identities), [snapshots, scope, showQuiet, identities])
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
  const [caption, setCaption] = useState('Decorative lounge movement is separate from observed work events.')
  const current = useRef({ scene: visualScene, selectedKey, pets, petEvent, enabled, live })
  current.current = { scene: visualScene, selectedKey, pets, petEvent, enabled, live }

  useEffect(() => {
    const previous = baseline.current
    if (!enabled || !previous?.enabled) {
      queue.current = []; active.current = null; setMoving(null); holdLayout(null)
    } else {
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
          if (trip) { active.current = trip; setCaption(`${trip.caption} · ${input.scene.actors.find(actor => actor.key === pending.event.actorKey)?.agent.name ?? 'agent'}`); break }
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
  const closeEncounter = moving ? visualScene.actors.filter(actor => actor.key !== moving.actor.key && Math.abs(actor.y - moving.actor.y) < 8 && Math.abs(actor.x - moving.actor.x) < 38) : []
  const greeting = () => {
    if (petEvent && petEvent.until > Date.now()) return
    const choices = ['heart', 'coffee', 'fish'] as const
    const kind = choices[Math.floor(Math.random() * choices.length)]
    setPetEvent({ kind, until: Date.now() + 6500 })
    setPetNote(kind === 'coffee' ? 'Lounge surprise: the cat declares a coffee break.' : kind === 'fish' ? 'Lounge surprise: a tiny fish treasure!' : 'Lounge surprise: the cat approves a short break.')
  }
  return (
    <section className="of-view" aria-label="Agent Office">
      <div className="of-toolbar">
        <span>{snapshots.length} teams · {working} working{needsYou > 0 && <strong className="of-waiting"> · {needsYou} need you</strong>}</span>
        <button type="button" aria-pressed={paused} onClick={() => { if (reduced && !allowReduced) { setAllowReduced(true); setPaused(false) } else setPaused(value => !value) }} disabled={animationMode === 'off'}
          title={animationMode === 'off' ? 'Choose Full effects or Low GPU in Animation settings' : reduced && !allowReduced ? 'Enable motion for Office only; your system setting stays unchanged' : 'Pause both work animations and decorative movement'}>
          {animationMode === 'off' ? 'Effects off' : reduced && !allowReduced ? 'Enable Office motion' : paused ? 'Resume motion' : 'Pause motion'}</button>
        {reduced && allowReduced && <button type="button" onClick={() => setAllowReduced(false)} title="Restore the system reduced motion preference for Office">Follow system</button>}
      </div>
      <div className="of-clock"><time dateTime={new Date(now).toISOString()}>{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{ambient.name} · local time</span></div>
      {!live && <p className="of-caption">Last known positions. Work animations resume after fresh reads.</p>}
      {scene.quietTeams.length > 0 && <button className="of-quiet" type="button" aria-expanded={showQuiet} onClick={() => setShowQuiet(value => !value)}>{showQuiet ? 'Collapse quiet teams' : `Show ${scene.quietTeams.length} quiet teams`}</button>}
      <div className="of-scroll">
        {snapshots.length === 0 ? <p className="of-empty">Waiting for T3 team snapshots. No session selection is required.</p> : (
          <div className="of-building" style={{ '--of-height': visualScene.height } as CSSProperties}>
            <canvas ref={canvas} width={visualScene.width} height={visualScene.height} role="img" aria-label={`Office with ${visualScene.actors.length} visible agents from ${snapshots.length} T3 teams. Choose an agent label for details.`} />
            {visualScene.floors.map(floor => {
              const speaking = moving && Math.abs(moving.actor.y - (floor.y + 61)) < 8 && closeEncounter.length > 0
              return <button key={floor.id} type="button" className="of-floor-label" style={{ top: `${floor.y / visualScene.height * 100}%`, borderLeftColor: floor.color, visibility: speaking ? 'hidden' : 'visible' }}
                disabled={!floor.sessionId} title={`${floor.title}${floor.subtitle ? ` · ${floor.subtitle}` : ''}${floor.sessionId ? '\nOpen this team in Board' : '\nShared resting space; idle movement is decorative'}`}
                onClick={() => floor.sessionId && onOpenTeam(floor.sessionId, null)}><strong>{floor.title}</strong><span>{floor.subtitle}</span></button>
            })}
            {displayed.map(actor => {
              const raised = moving?.actor.key === actor.key && closeEncounter.length > 0
              return <button key={actor.key} type="button" className="of-agent-label" data-runtime={actor.agent.runtime ?? 'unknown'} data-status={actor.agent.status} data-selected={selectedKey === actor.key}
                aria-pressed={selectedKey === actor.key} aria-label={`${actor.agent.name}, ${actor.runtimeName}, ${actor.agent.role}, ${actor.activity}`}
                title={`${actor.agent.name}\n${actor.runtimeName} · ${actor.agent.model ?? 'Model not reported'}\n${actor.activity}${actor.agent.task ? `\n${actor.agent.task}` : ''}`}
                style={{ left: `${(actor.x + 6.5) / visualScene.width * 100}%`, top: `${(actor.y - 48 - (raised ? 20 : 0)) / visualScene.height * 100}%` }}
                onClick={() => onSelect(actor.sessionId, actor.agent.id)}>
                <strong>{actor.agent.name}</strong><span>{actor.runtimeName}{actor.agent.role === 'lead' ? ' · Lead' : ''}</span><em>{actor.activity || STATUS_LABEL[actor.agent.status]}</em>
              </button>
            })}
            {lounge && <button type="button" className="of-cat" aria-label="Greet the lounge cat (decorative easter egg)" title="Greet the cat" style={{ top: `${(lounge.y + 44) / visualScene.height * 100}%`, height: `${22 / visualScene.height * 100}%` }} onClick={greeting} />}
          </div>
        )}
      </div>
      <div className="of-footer">
        <p className="of-caption" role="status" aria-live="polite">{caption}</p>
        <p className="of-caption">{petNote}</p>
        <span>{scene.totalAgents} agents · {scene.finishedCount} finished · Work paths follow newly observed T3 events.</span>
      </div>
    </section>
  )
}
