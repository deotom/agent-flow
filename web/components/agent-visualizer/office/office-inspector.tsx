'use client'
import {useEffect,useLayoutEffect,useRef,type ReactNode} from 'react'

/** One bounded nonmodal reading surface; the scene and composer remain available. */
export function OfficeInspector({title,onClose,onHeight,autoFocus=false,onAutoFocus,children}:{title:string;onClose:()=>void;onHeight:(height:number)=>void;autoFocus?:boolean;onAutoFocus?:()=>void;children:ReactNode}){
 const close=useRef<HTMLButtonElement>(null)
 const panel=useRef<HTMLElement>(null)
 const latestClose=useRef(onClose);latestClose.current=onClose
 useEffect(()=>{if(autoFocus){close.current?.focus();onAutoFocus?.()}},[autoFocus,onAutoFocus])
 useEffect(()=>{
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();latestClose.current()}}
  window.addEventListener('keydown',escape)
  return()=>window.removeEventListener('keydown',escape)
 },[])
 useLayoutEffect(()=>{
  const element=panel.current
  if(!element)return
  const measure=()=>onHeight(Math.ceil(element.getBoundingClientRect().height)+12)
  measure()
  const observer=new ResizeObserver(measure);observer.observe(element)
  return()=>{observer.disconnect();onHeight(0)}
 },[onHeight])
 return <aside ref={panel} className="of-inspector" aria-label={title}>
  <header><strong>{title}</strong><button ref={close} type="button" aria-label="Close Office details" onClick={onClose}>×</button></header>
  <div className="of-inspector-content">{children}</div>
 </aside>
}
