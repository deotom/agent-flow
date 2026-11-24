'use client'
import {useEffect,useState} from 'react'
import type {OfficeArchitectureArt} from '../../../lib/office-types'

export function useOfficeArchitectureArt():OfficeArchitectureArt|null {
 const [art,setArt]=useState<OfficeArchitectureArt|null>(null)
 useEffect(()=>{
  if(typeof Image==='undefined')return
  let disposed=false
  const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})
  const reference=document.documentElement.dataset.agentFlowHost==='desktop'
    ?import('./assets/world-lift.webp?url').then(asset=>load(asset.default)).catch(()=>undefined):undefined
  Promise.all([
   import('./assets/office-door-closed.webp?url'),import('./assets/office-door-open.webp?url'),
   import('./assets/office-lift-cabin.webp?url'),import('./assets/office-lift-shaft.webp?url'),
  ]).then(parts=>Promise.all([...parts.map(part=>load(part.default)),reference] as const)).then(([doorClosed,doorOpen,liftCabin,liftShaft,referenceLift])=>{
   if(!disposed&&doorClosed&&doorOpen&&liftCabin&&liftShaft)setArt({doorClosed,doorOpen,liftCabin,liftShaft,referenceLift})
  }).catch(()=>{})
  return()=>{disposed=true}
 },[])
 return art
}
