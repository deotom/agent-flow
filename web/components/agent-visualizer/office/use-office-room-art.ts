'use client'
import {useEffect,useState} from 'react'
import type {OfficeRoomArt} from './office-room-design-art'

export function useOfficeRoomArt():OfficeRoomArt|null {
 const [art,setArt]=useState<OfficeRoomArt|null>(null)
 useEffect(()=>{
  if(typeof Image==='undefined')return
  let disposed=false
  const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})
  const desktop=document.documentElement.dataset.agentFlowHost==='desktop'
  const worldShell=desktop?import('./assets/world-workroom.webp?url').then(asset=>load(asset.default)).catch(()=>undefined):undefined
  const worldStations=desktop?import('./assets/world-stations.webp?url').then(asset=>load(asset.default)).catch(()=>undefined):undefined
  const leadTable=desktop?import('./assets/world-lead-table.webp?url').then(asset=>load(asset.default)).catch(()=>undefined):undefined
  const leadRug=desktop?import('./assets/world-lead-rug.webp?url').then(asset=>load(asset.default)).catch(()=>undefined):undefined
  const planningDesk=desktop?import('./assets/world-planning-desk.webp?url').then(asset=>load(asset.default)).catch(()=>undefined):undefined
  const legacyBreak=desktop?undefined:import('./assets/room-break.webp?url').then(asset=>load(asset.default))
  const legacyStations=desktop?undefined:import('./assets/work-stations.webp?url').then(asset=>load(asset.default))
  const legacyAngles=desktop?undefined:import('./assets/work-stations-angles-v1.webp?url').then(asset=>load(asset.default))
  Promise.all([
   import('./assets/room-stations.webp?url').then(asset=>load(asset.default)),
   import('./assets/room-daily-props-v1.webp?url').then(asset=>load(asset.default)),
   legacyBreak,
   legacyStations,
   legacyAngles,
   worldShell,worldStations,leadTable,leadRug,planningDesk,
  ] as const)
   .then(([shell,props,breakRoom,stations,stationAngles,desktopShell,desktopStations,desktopLeadTable,desktopLeadRug,desktopPlanningDesk])=>{
    if(!disposed&&shell&&props&&(desktop||breakRoom))setArt({
     shell:desktopShell??shell,canteenShell:desktopShell?shell:undefined,props,breakRoom,stations,stationAngles,worldStations:desktopStations,leadTable:desktopLeadTable,leadRug:desktopLeadRug,planningDesk:desktopPlanningDesk,
    })
   }).catch(()=>{})
  return()=>{disposed=true}
 },[])
 return art
}
