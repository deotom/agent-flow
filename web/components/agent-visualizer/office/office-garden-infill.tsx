'use client'
import {useEffect,useRef,useState} from 'react'
import type {Season} from '../../../lib/office-sky'
import {drawOfficeGardenInfill} from '../../../lib/office-garden-infill'

export {drawOfficeGardenInfill} from '../../../lib/office-garden-infill'

/** A single seasonal texture load and redraw on size/image changes only.
 * The parent applies the garden's existing daylight filter to this layer. */
export function OfficeGardenInfill({season,width,height}:{season:Season;width:number;height:number}){
 const canvas=useRef<HTMLCanvasElement>(null)
 const [texture,setTexture]=useState<{season:Season;image:HTMLImageElement}|null>(null)
 useEffect(()=>{
  let disposed=false,image:HTMLImageElement|null=null
  const asset=season==='hot'?import('./assets/surface-hot-closed.webp?url'):season==='rainy'?import('./assets/surface-rainy-closed.webp?url'):import('./assets/surface-cool-closed.webp?url')
  asset.then(({default:src})=>{
   if(disposed)return
   image=new Image()
   image.onload=()=>{if(!disposed&&image)setTexture({season,image})}
   image.onerror=()=>{if(!disposed)setTexture(null)}
   image.src=src
  }).catch(()=>{if(!disposed)setTexture(null)})
  return()=>{disposed=true;if(image){image.onload=null;image.onerror=null;image.src=''}}
 },[season])
 useEffect(()=>{
  const element=canvas.current
  if(!element||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return
  const density=Math.min(2,Math.max(1,window.devicePixelRatio||1))
  element.width=Math.max(1,Math.round(width*density));element.height=Math.max(1,Math.round(height*density))
  const context=element.getContext('2d')
  if(!context)return
  context.setTransform(density,0,0,density,0,0)
  if(texture?.season===season)drawOfficeGardenInfill(context,texture.image,width,height)
 },[texture,season,width,height])
 return <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',top:0,left:0,width:'100%',height:'auto',aspectRatio:`${width} / ${height}`,zIndex:0,pointerEvents:'none'}}/>
}
