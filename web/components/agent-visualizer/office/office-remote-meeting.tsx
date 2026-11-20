'use client'

import {useEffect,useRef,useState,type CSSProperties} from 'react'
import type {OfficeCollaborationMember,OfficeFloor} from '../../../lib/office-types'
import {isWorking,STATUS_LABEL} from '../../../lib/team-model'
import {officeCollaboratorDisplayed} from '../../../lib/office-collaboration'
import {drawOfficeAvatar} from './office-art'
import {drawRuntimeBadge} from '../canvas/runtime-mark'

export type OfficeDisplayMode='office'|'remote'|'auto'
interface RosterProps {
  members:readonly OfficeCollaborationMember[]
  overrides:Readonly<Record<string,'office'|'remote'>>
  live:boolean
  travellingKeys?:ReadonlySet<string>
  onSelect:(sessionId:string,agentId:string)=>void
  onChange:(key:string,mode:OfficeDisplayMode)=>void
}

// Delivered/received outcomes belong to the Lead; historical workers stay off this screen.
export function currentOfficeCollaborators(members:readonly OfficeCollaborationMember[]) {
  return members.filter(officeCollaboratorDisplayed)
}
const memberStatus=(member:OfficeCollaborationMember,live:boolean)=>`${live?'':'Last known: '}${STATUS_LABEL[member.agent.status]}${!isWorking(member.agent.status)&&!member.agent.status.startsWith('waiting_')&&member.task?.delivery==='pending'&&(member.task.status==='done'||member.task.status==='failed')?' · Result queued':''}`

function Portrait({member}:{member:OfficeCollaborationMember}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const appearance=member.appearance
  useEffect(()=>{
    const context=canvas.current?.getContext('2d')
    if(!context)return
    context.clearRect(0,0,48,56)
    context.save();context.translate(24,80)
    drawOfficeAvatar(context,appearance,0,0,0,{face:1})
    context.restore()
    if(member.agent.runtime)drawRuntimeBadge(context,member.agent.runtime,37,45,9,'#b6a777')
  },[appearance.slot,appearance.kind,appearance.hair,appearance.skin,appearance.shirt,appearance.pants,appearance.cut,appearance.gear,appearance.outfit,appearance.face,member.agent.runtime])
  return <canvas ref={canvas} width={48} height={56} aria-hidden="true"/>
}

/** Text-only roster keeps the portrait drawing budget fixed even for large teams. */
export function OfficeRemoteRoster({members,overrides,live,travellingKeys,onSelect,onChange}:RosterProps) {
  return <><p>ตำแหน่งแสดงผลใน Office</p><small>เปลี่ยนเฉพาะมุมมองของคุณ</small><ul>{members.map(member=><li key={member.key}>
    <button type="button" onClick={()=>onSelect(member.sessionId,member.agent.id)}><strong>{member.agent.name}</strong><span>{memberStatus(member,live)}</span></button>
    <label>แสดงผล <select aria-label={`ตำแหน่งแสดงผลของ ${member.agent.name}`} disabled={travellingKeys?.has(member.key)} title={travellingKeys?.has(member.key)?'รอถึงจุดหมายก่อนเปลี่ยนการแสดง':undefined} value={overrides[member.preferenceKey]??'auto'} onChange={event=>onChange(member.preferenceKey,event.target.value as OfficeDisplayMode)}>
      <option value="office">แสดงในห้อง</option><option value="remote">แสดงบนจอ</option><option value="auto">อัตโนมัติ</option>
    </select></label>{travellingKeys?.has(member.key)&&<small>รอถึงจุดหมายก่อนเปลี่ยนการแสดง</small>}
  </li>)}</ul></>
}

interface OfficeRemoteMeetingProps extends Omit<RosterProps,'members'> {
  floor:OfficeFloor
  buildingHeight:number
  selectedKey:string|null
  hidden?:boolean
}

/** A small screen mounted on the existing back wall; source rows supply all people/statuses. */
export function OfficeRemoteMeeting({floor,buildingHeight,overrides,live,selectedKey,hidden,travellingKeys,onSelect,onChange}:OfficeRemoteMeetingProps) {
  const [open,setOpen]=useState(false)
  const trigger=useRef<HTMLButtonElement>(null)
  const members=currentOfficeCollaborators(floor.collaboration??[])
  const remote=members.filter(member=>member.remote)
  useEffect(()=>{if(!members.length||hidden)setOpen(false)},[members.length,hidden])
  const compact=floor.room!=='room-stations-large',height=floor.height??0
  const close=()=>{setOpen(false);trigger.current?.focus()}
  if(!members.length||hidden)return null
  return <section className="of-remote-meeting" data-remote={remote.length>0} data-open={open} aria-label={`Online meeting display, ${floor.title}`}
    style={{top:`${(floor.y+height*(compact?.20:.19))/buildingHeight*100}%`,height:`${height*(compact?.14:.132)/buildingHeight*100}%`} as CSSProperties}
    onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}}>
    {remote.length>0&&<div className="of-remote-screen of-remote-rail"><div className="of-remote-tiles">{remote.slice(0,3).map(member=><button type="button" key={member.key} data-status={member.agent.status} data-runtime={member.agent.runtime??undefined} aria-pressed={selectedKey===member.key}
      aria-label={`${member.agent.name}, ${memberStatus(member,live)}, online meeting display`} title={`${member.agent.name} · ${memberStatus(member,live)}`} onClick={()=>onSelect(member.sessionId,member.agent.id)}>
      <Portrait member={member}/><i aria-hidden="true"/>
    </button>)}</div></div>}
    <button type="button" ref={trigger} className="of-remote-manage" aria-expanded={open} aria-label={`จัดทีมออนไลน์, ${floor.title}${remote.length>3?`, +${remote.length-3} more`:''}`} onClick={()=>setOpen(value=>!value)}>
      {remote.length>0?<><span className="of-remote-count">ออนไลน์ · {remote.length}</span>{remote.length>3&&<b>+{remote.length-3}</b>}<span aria-hidden="true">⌄</span></>:'จัดทีมออนไลน์'}
    </button>
    {open&&<div className="of-remote-roster" role="region" aria-label={`ตำแหน่งแสดงผล, ${floor.title}`}><button type="button" className="of-remote-close" aria-label="Close online display settings" onClick={close}>×</button>
      <OfficeRemoteRoster members={members} overrides={overrides} live={live} travellingKeys={travellingKeys} onSelect={onSelect} onChange={onChange}/>
    </div>}
  </section>
}
