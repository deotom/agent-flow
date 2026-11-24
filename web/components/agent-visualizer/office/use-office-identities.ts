'use client'

import {useEffect,useMemo,useState} from 'react'
import {assignOfficeIdentities,officeKey} from '../../../lib/office-model'
import {parseOfficeIdentities} from '../../../lib/office-motion'
import type {TeamSnapshot} from '../../../lib/team-types'

const STORAGE_KEY='agent-flow-office-identities-v1'
const EMPTY=new Map<string,number>()
const readIdentities=()=>{
  try{return parseOfficeIdentities(localStorage.getItem(STORAGE_KEY))}catch{return EMPTY}
}

export function useOfficeIdentities(snapshots:readonly TeamSnapshot[],enabled=true):ReadonlyMap<string,number>{
  const [saved,setSaved]=useState(()=>enabled?readIdentities():EMPTY)
  const identities=useMemo(()=>enabled?assignOfficeIdentities(snapshots.flatMap(snapshot=>snapshot.agents.map(agent=>officeKey(snapshot.sessionId,agent.id))),saved):EMPTY,[snapshots,saved,enabled])
  useEffect(()=>{
    if(!enabled||identities.size===saved.size&&[...identities].every(([key,value])=>saved.get(key)===value))return
    setSaved(identities)
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...identities].slice(-10_000)))}catch{/* Keep the assignments in memory. */}
  },[enabled,identities,saved])
  return identities
}
