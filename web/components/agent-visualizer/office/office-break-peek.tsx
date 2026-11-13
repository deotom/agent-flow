'use client'

import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import type { OfficeActor, OfficeFloor, OfficeLeisureAction, OfficePoint } from '../../../lib/office-types'
import { officeLeisureObjects, OFFICE_OBJECT_NAMES } from '../../../lib/office-leisure'
import { officeSeasonalObjects } from '../../../lib/office-seasonal'

interface OfficeBreakPeekProps {
  floor: OfficeFloor
  width: number
  buildingHeight: number
  actors: readonly OfficeActor[]
  canvasRef: RefObject<HTMLCanvasElement | null>
  onClose: () => void
  onSelect: (sessionId: string, agentId: string) => void
  onOpenTeam: (sessionId: string, agentId: string | null) => void
  onObject: (object: OfficePoint & { kind: OfficeLeisureAction; label: string }) => void
  agentRef?: (key: string) => (element: HTMLButtonElement | null) => void
  now: number
  selectedKey: string | null
}

/** A view through the interior door; it occupies the main room's existing bounds. */
export function OfficeBreakPeek({ floor, width, buildingHeight, actors, canvasRef, onClose, onSelect, onOpenTeam, onObject, agentRef, now, selectedKey }: OfficeBreakPeekProps) {
  const back=useRef<HTMLButtonElement>(null)
  useEffect(()=>{back.current?.focus()},[])
  const height = floor.height ?? width * .5625
  const residents = actors.filter(actor => actor.floorId === floor.id && !actor.hidden)
  const count = floor.actorKeys.length || residents.length
  const objects = [
    ...officeLeisureObjects(floor, width).map(object => ({ ...object, label: OFFICE_OBJECT_NAMES[object.kind] })),
    ...officeSeasonalObjects(floor, width, new Date(now)),
  ]
  return <section className="of-break-peek" aria-label={floor.title} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}} style={{ top: `${floor.y / buildingHeight * 100}%`, height: `${height / buildingHeight * 100}%` }}>
    <div className={`of-art of-art-${floor.room ?? 'room-break'}`} aria-hidden="true" style={{ inset: 0, height: '100%' }} />
    <canvas ref={canvasRef} aria-label={`${floor.title}, ${count} resting agents`} role="img" />
    <div className="of-break-peek-header">
      <button ref={back} type="button" onClick={onClose} aria-label="Back to office">← Back to office</button>
      <strong>Break room · {count} resting</strong>
      {!!floor.overflow && <button type="button" className="of-break-overflow" onClick={() => floor.sessionId && onOpenTeam(floor.sessionId, null)} aria-label={`Open team in Board: ${floor.overflow} more resting agents`}>+{floor.overflow}</button>}
    </div>
    {objects.map((object, index) => <button key={`${object.kind}-${index}`} type="button" className="of-object-hit" aria-label={`${object.label}, ${floor.title}`}
      style={{ left: `${(object.x - 20) / width * 100}%`, top: `${(object.y - floor.y - 24) / height * 100}%`, width: `${40 / width * 100}%`, height: `${34 / height * 100}%` }}
      onClick={() => onObject(object)}><span>{object.label}</span></button>)}
    {residents.map(actor => {
      const ai = [actor.runtimeName, actor.agent.model].filter(Boolean).join(' · ')
      return <button key={actor.key} ref={agentRef?.(actor.key)} type="button" className="of-agent" data-zone="lounge" data-edge={actor.x>width*.55?'end':'start'} data-status={actor.agent.status} data-selected={selectedKey === actor.key}
        aria-pressed={selectedKey === actor.key} aria-label={`${actor.agent.name}, ${ai}, ${actor.activity}, resting in the break room`}
        style={{ left: `${(actor.x - 22) / width * 100}%`, top: `${(actor.y - floor.y - 72) / height * 100}%`, width: `${44 / width * 100}%`, height: `${75 / height * 100}%`,opacity:actor.pose?.opacity }}
        title={`${actor.agent.name} · ${ai} · ${actor.activity}`} onClick={() => onSelect(actor.sessionId, actor.agent.id)}>
        <span className="of-tag" aria-hidden="true" data-zone="lounge" data-failed={actor.agent.status === 'failed'} style={{ '--team': actor.team?.color ?? floor.color } as CSSProperties}>{actor.agent.status === 'failed' && <b>✕</b>}{actor.agent.name}</span>
      </button>
    })}
  </section>
}
