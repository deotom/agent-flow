import type {officePaintedAvatarLook} from '../../../lib/office-painted-avatar'

type Look=ReturnType<typeof officePaintedAvatarLook>
type HeadView='front'|'back'|'profile'
const paintedSkin=['#dd9d6e','#e7ab80','#a76b46','#df9e6b','#e4a47b','#995c3b','#c58b60','#945d42','#e7aa78','#c99065']
const heads=new WeakMap<CanvasImageSource,Map<string,HTMLCanvasElement|null>>()
const rgb=(hex:string)=>[1,3,5].map(offset=>Number.parseInt(hex.slice(offset,offset+2),16))
const ramp=(value:number,low:number,high:number)=>Math.max(0,Math.min(1,(value-low)/(high-low)))

/** Tint the lit skin and keep the surrounding hair, eyewear and dark line work.
 * `top` skips cell pixels that belong to the painting in the row above. */
export function officeTintedHead(source:CanvasImageSource,row:number,column:number,view:HeadView,look:Look,top=0){
 if(typeof document==='undefined')return
 let variants=heads.get(source)
 if(!variants){variants=new Map();heads.set(source,variants)}
 const key=`${view}:${row}:${column}:${look.tone}:${top}`
 if(variants.has(key))return variants.get(key)??undefined
 const side=96,canvas=document.createElement('canvas')
 canvas.width=side;canvas.height=side
 const context=canvas.getContext('2d',{willReadFrequently:true})
 let tinted:HTMLCanvasElement|null=null
 if(context)try{
  context.drawImage(source,column*256,row*256+top,256,256-top,0,top*side/256,side,(256-top)*side/256)
  const pixels=context.getImageData(0,0,side,side)
  const base=rgb(paintedSkin[look.hair]),shift=rgb(look.skin).map((value,i)=>value-base[i])
  const ear=view==='back'
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
   const i=(y*side+x)*4
   if(pixels.data[i+3]===0)continue
   const [r,g,b]=[pixels.data[i],pixels.data[i+1],pixels.data[i+2]]
   const xPart=ramp(x/side,ear?.51:.29,ear?.73:.48)
   const yPart=ramp(y/side,ear?.37:.28,ear?.56:.51)
   const warmth=ramp(r-b,22,43)*ramp(g-b,4,17)*ramp(g/Math.max(r,1),.47,.56)
   const light=ramp(r,base[0]*.60,base[0]*.88)
   const mask=xPart*yPart*warmth*light
   pixels.data[i]+=shift[0]*mask
   pixels.data[i+1]+=shift[1]*mask
   pixels.data[i+2]+=shift[2]*mask
  }
  context.putImageData(pixels,0,0)
  tinted=canvas
 }catch{
  // A canvas with unreadable pixels still draws the original asset.
 }
 variants.set(key,tinted)
 return tinted??undefined
}
