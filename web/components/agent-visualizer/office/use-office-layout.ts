'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OfficeScene } from '../../../lib/office-types'
import { officeLayoutChanged, officeLayoutFrame } from '../../../lib/office-layout'

const DURATION=420
const useIsomorphicLayoutEffect=typeof window!=='undefined'?useLayoutEffect:useEffect
type Transition={from:OfficeScene;to:OfficeScene;elapsed:number;last:number|null;duration:number}

/** Retarget geometry from the last displayed frame; ordinary clock/status updates do not restart it. */
export function useOfficeLayout(target:OfficeScene,animate:boolean,suspended=false):OfficeScene {
  const [frame,setFrame]=useState(target)
  const displayed=useRef(target),priorTarget=useRef(target)
  const transition=useRef<Transition|null>(null),handle=useRef<number|null>(null)
  const controls=useRef({animate,suspended})
  controls.current={animate,suspended}
  const suspendedDesktop=suspended&&Boolean(target.floors[0]?.desktopArt)
  // Supply new metadata on the same render, while retaining displayed room geometry.
  const rendered=!animate||frame===target||suspendedDesktop?target:officeLayoutFrame(frame,target,0)
  useIsomorphicLayoutEffect(()=>{displayed.current=rendered},[rendered])
  useEffect(()=>{
    const prior=priorTarget.current,changed=officeLayoutChanged(prior,target)
    const newRoom=target.floors.some(f=>f.kind==='team'&&!prior.floors.some(p=>p.id===f.id))
    const desktop=Boolean(target.floors[0]?.desktopArt||prior.floors[0]?.desktopArt)
    if(!animate||suspendedDesktop||typeof requestAnimationFrame==='undefined'){
      if(handle.current!==null)cancelAnimationFrame(handle.current)
      priorTarget.current=target
      handle.current=null;transition.current=null;displayed.current=target;setFrame(target);return
    }
    if(suspended){
      if(handle.current!==null)cancelAnimationFrame(handle.current)
      handle.current=null
      if(transition.current){transition.current.last=null;if(!changed)transition.current.to=target}
      return
    }
    priorTarget.current=target
    if(changed){
      transition.current={from:displayed.current,to:target,elapsed:0,last:null,duration:newRoom&&!desktop?900:DURATION}
      const initial=officeLayoutFrame(displayed.current,target,0)
      displayed.current=initial;setFrame(initial)
    }else if(transition.current){
      transition.current.to=target
    }else{
      displayed.current=target;setFrame(target);return
    }
    if(handle.current!==null)return
    const tick=(now:number)=>{
      const current=transition.current
      if(!current){handle.current=null;return}
      if(controls.current.suspended){current.last=null;handle.current=null;return}
      current.last??=now
      current.elapsed+=Math.max(0,Math.min(100,now-current.last));current.last=now
      const progress=Math.min(1,current.elapsed/current.duration)
      const next=officeLayoutFrame(current.from,current.to,1-(1-progress)**3)
      displayed.current=next;setFrame(next)
      if(progress<1)handle.current=requestAnimationFrame(tick)
      else{transition.current=null;handle.current=null}
    }
    handle.current=requestAnimationFrame(tick)
  },[target,animate,suspended,suspendedDesktop])
  useEffect(()=>()=>{if(handle.current!==null)cancelAnimationFrame(handle.current)},[])
  return rendered
}
