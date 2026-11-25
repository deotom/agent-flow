import {officeLiftApproachDistance,officeNavigation} from '../../../lib/office-navigation'
import type {OfficeArchitectureArt,OfficeScene,OfficeLiftVisual} from '../../../lib/office-types'
import {drawOfficeReferenceLift} from './office-reference-lift-art'

/** A single timber car travels through the cutaway shaft behind fixed landing doors. */
export function drawOfficeShaft(c:CanvasRenderingContext2D,scene:OfficeScene,front=false,art?:OfficeArchitectureArt|null,surfaceOpen=false,lift?:OfficeLiftVisual,gardenLampOn=true){
 const n=officeNavigation(scene);if(!n.visible&&!scene.floors.some(f=>f.kind==='lounge'))return
 const s=n.scale,x=n.shaftX,h=n.bottom-n.top
 const rider=scene.actors.find(a=>!a.hidden&&(a.pose?.climb||a.pose?.inLift))
 const car=lift??{y:rider?.y??n.hatch.y,doorsOpen:rider&&!rider.pose?.inLift?1:0,moving:Boolean(rider?.pose?.inLift),passengerKeys:rider?[rider.key]:[]}
 const floorsById=new Map(scene.floors.map(f=>[f.id,f]))
 const stops=[{...n.hatch,id:'surface',surface:true},...n.landings.map(p=>({...p,surface:false}))].map(p=>{
  const floor=p.surface?undefined:floorsById.get(p.id)
  const clip=floor&&(floor.clipHeight!==undefined||floor.transitionOpacity!==undefined)?{top:floor.y,height:floor.clipHeight??(floor.height??0),opacity:floor.transitionOpacity??1}:undefined
  return {
   ...p,clip,open:Math.abs(car.y-p.y)<2*s?Math.max(car.doorsOpen,p.surface&&surfaceOpen&&!car.moving&&!car.passengerKeys.length?1:0):0,
   waiting:scene.actors.some(actor=>!actor.hidden&&actor.pose?.liftWait&&Math.abs(actor.y-p.y)<2*s&&Math.abs(actor.x-(x-officeLiftApproachDistance(scene,p.id)))<4*s),
  }
 })
 if(scene.floors[0]?.desktopArt&&art?.referenceLift){
  drawOfficeReferenceLift(c,art.referenceLift,n,front,car,stops,gardenLampOn)
  return
 }
 const clipShaft=()=>{c.beginPath();c.rect(n.left,n.top,scene.width-n.left,h);c.rect(x-22*s,n.hatch.y-86*s,44*s,90*s);c.clip()}
 const fill=(color:string,px:number,py:number,w:number,ph:number)=>{c.fillStyle=color;c.fillRect(px,py,w,ph)}
 const timberLip=(px:number,py:number,width:number,height:number)=>{
  fill('#926034',px,py,width,height)
  if(art){
   const source=art.liftCabin as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
   const sw=source.naturalWidth??source.width??288,sh=source.naturalHeight??source.height??320
   // Reuse the painted cornice grain, rather than a new flat-colour material.
   const cropHeight=sh*.055,cropWidth=Math.min(sw*.76,cropHeight*width/height)
   c.drawImage(art.liftCabin,(sw-cropWidth)/2,sh*.09,cropWidth,cropHeight,px,py,width,height)
  }
  fill('#d4a35d',px,py,width,1.2*s)
  fill('#503522',px,py+height-s,width,s)
 }
 c.save()
 if(!front){
  // One timber car moves through a cutaway shaft; cables and earth remain behind it.
  c.save();c.beginPath();c.rect(n.left,n.top,scene.width-n.left,h);c.clip()
  fill('#292820',n.left,n.top,scene.width-n.left,h)
  if(art){c.globalAlpha=.55;for(let y=n.top;y<n.bottom;y+=128*s)c.drawImage(art.liftShaft,n.left,y,n.right-n.left,128*s);c.globalAlpha=1}
  fill('#75674e',x-15*s,n.top,s,h);fill('#75674e',x+15*s,n.top,s,h)
  fill('#171c18',x-.5*s,n.top,s,Math.max(0,car.y-86*s-n.top));c.restore()
  c.save();clipShaft()
  fill('#242b24',x-20*s,car.y-82*s,40*s,84*s)
  if(art)c.drawImage(art.liftCabin,x-23*s,car.y-86*s,46*s,92*s)
  else{fill('#9b6d3d',x-22*s,car.y-86*s,44*s,4*s);fill('#775334',x-22*s,car.y-82*s,3*s,86*s);fill('#775334',x+19*s,car.y-82*s,3*s,86*s)}
  fill('#b18b4e',x-23*s,car.y+2*s,46*s,3*s)
  c.restore()
 }else{
  // Thin front guides leave both the travelling cabin and its passenger visible.
  c.save();clipShaft()
  fill('#916539',n.left,n.top,2*s,h);fill('#493a28',n.right-s,n.top,s,h)
  fill('#9b7849',x-22*s,car.y-81*s,2*s,83*s);fill('#87643c',x+20*s,car.y-81*s,2*s,83*s)
  c.restore()
  for(const p of stops){
   if(p.clip&&p.clip.height<=0.5)continue
   if(p.clip){c.save();c.beginPath();c.rect(0,p.clip.top,scene.width,p.clip.height);c.clip();c.globalAlpha*=p.clip.opacity}
   // One painted arch, with a visible right-hand thickness and a recessed inner
   // reveal. No second pair of posts or flat roof competing with its silhouette.
   c.fillStyle='#21170f40';c.beginPath();c.moveTo(x-27*s,p.y+3*s);c.lineTo(x+29*s,p.y+3*s);c.lineTo(x+34*s,p.y+10*s);c.lineTo(x-22*s,p.y+8*s);c.closePath();c.fill()
   c.fillStyle='#684328';c.beginPath();c.moveTo(x+23*s,p.y-77*s);c.lineTo(x+27*s,p.y-73*s);c.lineTo(x+27*s,p.y+4*s);c.lineTo(x+23*s,p.y);c.closePath();c.fill()
   fill('#24190f',x-16*s,p.y-67*s,3*s,67*s)
   fill('#49301d',x+13*s,p.y-67*s,3*s,67*s)
   fill('#382416',x-16*s,p.y-76*s,32*s,11*s)
   fill('#c99452',x-25*s,p.y-72*s,1.4*s,72*s)
   // The walking plane stays at p.y. Its warm front bevel extends down into
   // the supporting earth, never up across an agent's feet.
   timberLip(x-28*s,p.y,56*s,6*s)
   fill('#2f2016',x-28*s,p.y+6*s,56*s,1.2*s)
   if(p.surface){
    // Small fixed soil/grass overlaps seat the timber in the original garden.
    fill('#77502d',x-31*s,p.y+3*s,5*s,3*s)
    c.strokeStyle='#727c3c';c.lineWidth=1.2*s;c.beginPath()
    for(const side of [-1,1]){const gx=x+side*28*s;c.moveTo(gx,p.y+4*s);c.lineTo(gx-side*2*s,p.y-s);c.moveTo(gx,p.y+4*s);c.lineTo(gx+side*3*s,p.y+1*s)}
    c.stroke()
   }
   // Keep the painted frame fixed; only the inner leaves slide under its jamb.
   if(art){
    const leafArt=art.liftCabin as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
    const leafWidth=leafArt.naturalWidth??leafArt.width??288,leafHeight=leafArt.naturalHeight??leafArt.height??320
    const corniceHeight=50*(leafHeight*.16)/leafWidth,postHeight=84-corniceHeight
    const postSourceWidth=leafHeight*.84*9/postHeight
    // Only the cabin's painted architrave/posts are reused here, never its
    // lantern/interior. This is stationary architecture, not another car.
    c.save();c.beginPath();c.rect(x-26*s,p.y-84*s,52*s,84*s);c.rect(x-14*s,p.y-66*s,28*s,66*s);c.clip('evenodd')
    c.drawImage(art.liftCabin,0,0,leafWidth,leafHeight*.16,x-25*s,p.y-84*s,50*s,corniceHeight*s)
    c.drawImage(art.liftCabin,0,leafHeight*.16,postSourceWidth,leafHeight*.84,x-25*s,p.y-postHeight*s,9*s,postHeight*s)
    c.drawImage(art.liftCabin,leafWidth-postSourceWidth,leafHeight*.16,postSourceWidth,leafHeight*.84,x+16*s,p.y-postHeight*s,9*s,postHeight*s)
    c.restore()
    for(const side of [-1,1]){
     c.save();c.beginPath();c.rect(side<0?x-14*s:x,p.y-68*s,14*s,68*s);c.clip()
     // Symmetric timber panels have no hinged-door knob or hinges. Each owns
     // its source crop, so opening cannot slide an opposite leaf into view.
     const leafX=x+(side<0?-14:0)*s+side*14*s*p.open
     const panelHeight=leafHeight*.46,panelWidth=panelHeight*14/68
     c.drawImage(art.liftCabin,(leafWidth-panelWidth)/2,leafHeight*.32,panelWidth,panelHeight,
      leafX,p.y-68*s,14*s,68*s)
     c.strokeStyle='#654022';c.lineWidth=s;c.strokeRect(leafX+.5*s,p.y-67.5*s,13*s,67*s)
     fill('#cf9e57',leafX+(side<0?11:2)*s,p.y-38*s,s,8*s)
     c.restore()
    }
   }else{
    const panel=18*s*(1-p.open)
    fill('#765234',x-22*s,p.y-82*s,4*s,84*s);fill('#66482f',x+18*s,p.y-82*s,4*s,84*s)
    fill('#bb985e',x-22*s,p.y-82*s,44*s,3*s)
    if(panel>.01){fill('#765336',x-18*s,p.y-78*s,panel,78*s);fill('#65462e',x+18*s-panel,p.y-78*s,panel,78*s)}
    if(p.open<.25){c.fillStyle='#d4bb7b';c.font=`${11*s}px sans-serif`;c.textAlign='center';c.fillText('↕',x,p.y-34*s)}
   }
   timberLip(x-16*s,p.y-93*s,32*s,9*s)
   fill('#3a3024',x-14*s,p.y-91*s,28*s,6*s)
   c.fillStyle='#e5c994';c.font=`bold ${5*s}px sans-serif`;c.textAlign='center';c.fillText('LIFT',x,p.y-85*s)
   fill(p.open>0?'#f5d688':'#a59667',x-2*s,p.y-80*s,4*s,2*s)
   if(p.clip)c.restore()
  }
 }
 c.restore()
}
