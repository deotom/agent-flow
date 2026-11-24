'use client'

import {useEffect,useState} from 'react'
import {officeAvatarCoatAtlases,officeAvatarExtraHeadAtlases,officeAvatarHeadAtlases,officeAvatarLegAtlases,officeAvatarProfileAtlases,officeAvatarWorkwearV1Atlases,officeAvatarWorkwearV2Atlases} from './office-avatar-atlas'

export function isDesktopAvatarHost():boolean {
  return typeof document!=='undefined'&&document.documentElement.dataset.agentFlowHost==='desktop'
}

let avatarImage:Promise<HTMLImageElement|null>|undefined

function loadAtlas(asset:Promise<{default:string}>,width=1024,height=512):Promise<HTMLImageElement|null>{
  return asset.then(({default:src})=>new Promise<HTMLImageElement|null>(resolve=>{
    const image=new Image()
    image.onload=()=>resolve(image.naturalWidth===width&&image.naturalHeight===height?image:null)
    image.onerror=()=>resolve(null)
    image.src=src
  })).catch(()=>null)
}

export function useOfficeAvatarArt(enabled=true):HTMLImageElement|null {
  const [avatarArt,setAvatarArt]=useState<HTMLImageElement|null>(null)
  useEffect(()=>{
    if(!enabled||!isDesktopAvatarHost()||typeof Image==='undefined')return
    let disposed=false
    avatarImage??=Promise.all([
      loadAtlas(import('./assets/office-avatar-parts-v1.webp?url')),
      loadAtlas(import('./assets/office-avatar-heads-v1.webp?url')),
      loadAtlas(import('./assets/office-avatar-coats-v2.webp?url')),
      loadAtlas(import('./assets/office-avatar-profiles-v2.webp?url'),768),
      loadAtlas(import('./assets/office-avatar-extra-heads-v2.webp?url'),768,1024),
      loadAtlas(import('./assets/office-avatar-legs-v2.webp?url'),768),
      loadAtlas(import('./assets/office-avatar-workwear-v1.webp?url'),768,768),
      loadAtlas(import('./assets/office-avatar-workwear-v2.webp?url'),768,768),
    ]).then(([parts,heads,coats,profiles,extraHeads,legs,workwearV1,workwearV2])=>{
      if(parts){
        if(heads)officeAvatarHeadAtlases.set(parts,heads)
        if(coats)officeAvatarCoatAtlases.set(parts,coats)
        if(profiles)officeAvatarProfileAtlases.set(parts,profiles)
        if(extraHeads)officeAvatarExtraHeadAtlases.set(parts,extraHeads)
        if(legs)officeAvatarLegAtlases.set(parts,legs)
        if(workwearV1)officeAvatarWorkwearV1Atlases.set(parts,workwearV1)
        if(workwearV2)officeAvatarWorkwearV2Atlases.set(parts,workwearV2)
      }
      return parts
    })
    void avatarImage.then(image=>{if(!disposed)setAvatarArt(image)})
    return()=>{disposed=true}
  },[enabled])
  return enabled?avatarArt:null
}
