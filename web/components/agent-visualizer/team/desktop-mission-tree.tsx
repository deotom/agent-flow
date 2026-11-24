'use client'

import type {MissionNode,MissionStage,MissionView} from '@/lib/mission-model'
import type {OfficeAppearance} from '@/lib/office-types'
import {OfficeAvatarPortrait} from '../office/office-avatar-portrait'

function missionStatus(node:MissionNode,stage:MissionStage|undefined){
  if(node.status==='waiting_approval'||node.status==='waiting_input')return {label:'Needs you',tone:'waiting'}
  if(node.status==='failed'||stage==='failed')return {label:'Failed',tone:'failed'}
  if(stage==='cancelled'||stage==='discarded')return {label:stage==='cancelled'?'Cancelled':'Discarded',tone:'idle'}
  if(node.status==='running'||node.status==='thinking'||node.status==='background')return {label:'Working',tone:'working'}
  if(node.status==='done'){
    if(stage==='queued'||stage==='sent')return {label:stage==='queued'?'Queued':'Sent',tone:'queued'}
    return {label:'Done',tone:'done'}
  }
  return {label:'Idle',tone:'idle'}
}

export function DesktopMissionTree({mission,selected,live,atlas,appearanceFor,onSelect}:{
  mission:MissionView
  selected:string|null
  live:boolean
  atlas:CanvasImageSource|null
  appearanceFor:(id:string)=>OfficeAppearance|undefined
  onSelect:(id:string)=>void
}) {
  const parents=new Map(mission.links.map(link=>[link.to,link]))
  const children=new Map<string,MissionNode[]>()
  const roots:MissionNode[]=[]
  for(const node of mission.nodes.values()){
    const parent=parents.get(node.id)?.from
    if(!parent){roots.push(node);continue}
    const siblings=children.get(parent)??[]
    siblings.push(node)
    children.set(parent,siblings)
  }

  const card=(node:MissionNode)=>{
    const link=parents.get(node.id),parent=link&&mission.nodes.get(link.from)
    const {label,tone}=missionStatus(node,link?.stage)
    const appearance=appearanceFor(node.id)
    const description=[node.name,live?label:`Last known: ${label}`,parent?`reports to ${parent.name}`:'',node.collapsed?`${node.hiddenChildren} hidden`:''].filter(Boolean).join(', ')
    return <button type="button" className="af-mission-card" data-tone={tone} data-alert={node.attention||undefined}
      aria-pressed={selected===node.id} aria-label={description}
      title={[description,node.modelLine?.replace('::',' · '),node.statusLine].filter(Boolean).join('\n')}
      onClick={()=>onSelect(node.id)}>
      {appearance?<OfficeAvatarPortrait appearance={appearance} avatarArt={atlas} size={30}/>:
        <span className="af-mission-initial" aria-hidden="true">{node.name.trim().slice(0,1)}</span>}
      <span className="af-mission-name">{node.name}{node.collapsed&&<small>+{node.hiddenChildren} hidden</small>}</span>
      <span className="af-mission-status" data-tone={tone}>{label}</span>
    </button>
  }
  const branch=(nodes:MissionNode[],depth:number)=><ul className="af-mission-branch" data-indent={depth<3}>
    {nodes.map(node=><li key={node.id} data-alert={parents.get(node.id)?.alert||undefined}>
      {card(node)}
      {children.has(node.id)&&branch(children.get(node.id)!,depth+1)}
    </li>)}
  </ul>

  return <section className="af-mission-scroll" aria-label="Team relationships" tabIndex={0}>
    {roots.map(root=>{
      const reports=children.get(root.id)
      return <div key={root.id} className="af-mission-tree" data-branch={Boolean(reports?.length)}>
        <div className="af-mission-lead">{card(root)}</div>
        {reports?.length?branch(reports,1):null}
      </div>
    })}
  </section>
}
