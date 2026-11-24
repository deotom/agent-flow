'use client'

import {useEffect,useRef} from 'react'
import type {OfficeAppearance} from '../../../lib/office-types'
import type {AgentRuntime} from '../../../lib/team-types'
import {drawRuntimeBadge} from '../canvas/runtime-mark'
import {drawOfficeAvatar} from './office-art'

export function OfficeAvatarPortrait({appearance,avatarArt,runtime,size,className}:{
  appearance:OfficeAppearance
  avatarArt?:CanvasImageSource|null
  runtime?:AgentRuntime|null
  size?:number
  className?:string
}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const context=canvas.current?.getContext('2d')
    if(!context)return
    context.clearRect(0,0,48,56)
    drawOfficeAvatar(context,appearance,24,80,0,{face:1,portrait:true},avatarArt)
    if(runtime)drawRuntimeBadge(context,runtime,37,45,9,'#b6a777')
  },[appearance.slot,appearance.kind,appearance.hair,appearance.skin,appearance.shirt,appearance.pants,appearance.cut,appearance.gear,appearance.outfit,appearance.face,avatarArt,runtime])
  return <canvas ref={canvas} width={48} height={56} aria-hidden="true" className={className}
    style={size?{width:size,height:size,objectFit:'cover',flexShrink:0,borderRadius:6,background:'var(--desk-avatar-surface, #352519)'}:undefined}/>
}
