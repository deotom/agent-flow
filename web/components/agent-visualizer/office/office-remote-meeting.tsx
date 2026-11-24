'use client'

import {useEffect,useId,useRef,useState,type CSSProperties} from 'react'
import type {OfficeCollaborationMember,OfficeFloor} from '../../../lib/office-types'
import {isWorking,STATUS_LABEL} from '../../../lib/team-model'
import {officeCollaboratorDisplayed} from '../../../lib/office-collaboration'
import {OfficeAvatarPortrait} from './office-avatar-portrait'
import {FlowIcon} from '../flow-icon'

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

/** Text-only roster keeps the portrait drawing budget fixed even for large teams. */
export function OfficeRemoteRoster({members,overrides,live,travellingKeys,onSelect,onChange}:RosterProps) {
  if(!members.length)return <p className="of-remote-empty">ยังไม่มีสมาชิกที่จัดตำแหน่งได้</p>
  return <><p>ตำแหน่งแสดงผลใน Office</p><small>เปลี่ยนเฉพาะมุมมองของคุณ</small><ul>{members.map(member=>{
    const travelling=travellingKeys?.has(member.key)
    return <li key={member.key}>
    <button type="button" onClick={()=>onSelect(member.sessionId,member.agent.id)}><strong>{member.agent.name}</strong><span>{memberStatus(member,live)}</span></button>
    <label><span>แสดงผล</span><select aria-label={`ตำแหน่งแสดงผลของ ${member.agent.name}`} disabled={travelling} title={travelling?'รอถึงจุดหมายก่อนเปลี่ยนการแสดง':undefined} value={overrides[member.preferenceKey]??'auto'} onChange={event=>{
      if(!travelling)onChange(member.preferenceKey,event.target.value as OfficeDisplayMode)
    }}>
      <option value="office">แสดงในห้อง</option><option value="remote">แสดงบนจอ</option><option value="auto">อัตโนมัติ</option>
    </select></label>{travelling&&<small>รอถึงจุดหมายก่อนเปลี่ยนการแสดง</small>}
  </li>})}</ul></>
}

interface OfficeRemoteMeetingProps extends Omit<RosterProps,'members'> {
  floor:OfficeFloor
  buildingHeight:number
  selectedKey:string|null
  hidden?:boolean
  avatarArt?:CanvasImageSource|null
}

/** A small screen mounted on the existing back wall; source rows supply all people/statuses. */
export function OfficeRemoteMeeting({floor,buildingHeight,overrides,live,selectedKey,hidden,avatarArt,travellingKeys,onSelect,onChange}:OfficeRemoteMeetingProps) {
  const [open,setOpen]=useState(false)
  const trigger=useRef<HTMLButtonElement>(null)
  const wall=useRef<HTMLElement>(null)
  const panel=useRef<HTMLDivElement>(null)
  const panelId=useId()
  const members=currentOfficeCollaborators(floor.collaboration??[])
  const remote=members.filter(member=>member.remote)
  const desktop=Boolean(floor.desktopArt)
  useEffect(()=>{if(hidden||(!desktop&&!members.length))setOpen(false)},[desktop,members.length,hidden])
  useEffect(()=>{
    if(!open)return
    panel.current?.focus({preventScroll:true})
    const dismiss=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!wall.current?.contains(event.target))setOpen(false)
    }
    document.addEventListener('pointerdown',dismiss)
    return ()=>document.removeEventListener('pointerdown',dismiss)
  },[open])
  const compact=floor.room!=='room-stations-large',height=floor.height??0
  const close=()=>{setOpen(false);trigger.current?.focus()}
  if(hidden||(!desktop&&!members.length))return null
  const limit=desktop?2:3,extra=Math.max(0,remote.length-limit)
  const top=desktop?.155:compact?.20:.19,screenHeight=desktop?.119:compact?.14:.132
  const tiles=remote.length>0&&<div className="of-remote-tiles">{remote.slice(0,limit).map(member=><button type="button" key={member.key} data-status={member.agent.status} data-runtime={member.agent.runtime??undefined} aria-pressed={selectedKey===member.key}
    aria-label={`${member.agent.name}, ${memberStatus(member,live)}, online meeting display`} title={`${member.agent.name} · ${memberStatus(member,live)}`} onClick={()=>onSelect(member.sessionId,member.agent.id)}>
    <OfficeAvatarPortrait appearance={member.appearance} runtime={member.agent.runtime} avatarArt={avatarArt}/><i aria-hidden="true"/>
  </button>)}</div>
  const manage=<button type="button" ref={trigger} className="of-remote-manage" aria-expanded={open} aria-controls={open?panelId:undefined}
    aria-label={`จัดทีมออนไลน์, ${floor.title}${extra?`, +${extra} more`:''}`} title="จัดทีมออนไลน์" onClick={()=>setOpen(value=>!value)}>
    {desktop&&<FlowIcon name="settings" size={14}/>}
    {remote.length>0?<><span className="of-remote-count">ออนไลน์ · {remote.length}</span>{extra>0&&<b>+{extra}</b>}{!desktop&&<span aria-hidden="true">⌄</span>}</>:!desktop&&'จัดทีมออนไลน์'}
  </button>
  return <section ref={wall} className="of-remote-meeting" data-desktop={desktop||undefined} data-remote={remote.length>0} data-open={open} aria-label={`Online meeting display, ${floor.title}`}
    style={{top:`${(floor.y+height*top)/buildingHeight*100}%`,height:`${height*screenHeight/buildingHeight*100}%`} as CSSProperties}
    onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}}>
    {desktop?<div className="of-remote-screen">{tiles}{manage}</div>:<>{tiles&&<div className="of-remote-screen of-remote-rail">{tiles}</div>}{manage}</>}
    {open&&<div ref={panel} id={panelId} tabIndex={-1} className="of-remote-roster" role="region" aria-label={`ตำแหน่งแสดงผล, ${floor.title}`}>
      <button type="button" className="of-remote-close" aria-label="Close online display settings" onClick={close}>×</button>
      <OfficeRemoteRoster members={members} overrides={overrides} live={live} travellingKeys={travellingKeys} onSelect={(sessionId,agentId)=>{close();onSelect(sessionId,agentId)}} onChange={onChange}/>
    </div>}
  </section>
}
