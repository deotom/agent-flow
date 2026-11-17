'use client'
import {useEffect,useState} from 'react'
import type {OfficeRoomArt} from './office-room-design-art'

export function useOfficeRoomArt():OfficeRoomArt|null {
 const [art,setArt]=useState<OfficeRoomArt|null>(null)
 useEffect(()=>{
  if(typeof Image==='undefined')return
  let disposed=false
  const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})
  Promise.all([import('./assets/room-stations.webp?url'),import('./assets/room-daily-props-v1.webp?url'),import('./assets/room-break.webp?url'),import('./assets/work-stations.webp?url'),import('./assets/work-stations-angles-v1.webp?url')])
   .then(parts=>Promise.all(parts.map(part=>load(part.default))))
   .then(([shell,props,breakRoom,stations,stationAngles])=>{if(!disposed)setArt({shell,props,breakRoom,stations,stationAngles})}).catch(()=>{})
  return()=>{disposed=true}
 },[])
 return art
}
