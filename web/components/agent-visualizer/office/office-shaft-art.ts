import {officeNavigation} from '../../../lib/office-navigation'
import type {OfficeArchitectureArt,OfficeScene,OfficeLiftVisual} from '../../../lib/office-types'

/** A single timber car travels through the cutaway shaft behind fixed landing doors. */
export function drawOfficeShaft(c:CanvasRenderingContext2D,scene:OfficeScene,front=false,art?:OfficeArchitectureArt|null,surfaceOpen=false,lift?:OfficeLiftVisual){
 const n=officeNavigation(scene);if(!n.visible&&!scene.floors.some(f=>f.kind==='lounge'))return
 const s=n.scale,x=n.shaftX,h=n.bottom-n.top
 const rider=scene.actors.find(a=>!a.hidden&&(a.pose?.climb||a.pose?.inLift))
 const car=lift??{y:rider?.y??n.hatch.y,doorsOpen:rider&&!rider.pose?.inLift?1:0,moving:Boolean(rider?.pose?.inLift),passengerKeys:rider?[rider.key]:[]}
 const stops=[{...n.hatch,id:'surface',surface:true},...n.landings.map(p=>({...p,surface:false}))].map(p=>({
  ...p,open:Math.abs(car.y-p.y)<2*s?Math.max(car.doorsOpen,p.surface&&surfaceOpen&&!car.moving&&!car.passengerKeys.length?1:0):0,
 }))
 const clipShaft=()=>{c.beginPath();c.rect(n.left,n.top,scene.width-n.left,h);c.rect(x-22*s,n.hatch.y-86*s,44*s,90*s);c.clip()}
 const fill=(color:string,px:number,py:number,w:number,ph:number)=>{c.fillStyle=color;c.fillRect(px,py,w,ph)}
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
   if(p.surface){
    // A shallow roof, grounded plinth and side posts make a tiny garden pavilion.
    c.fillStyle='#241c1644';c.beginPath();c.ellipse(x,p.y+7*s,30*s,6*s,0,0,Math.PI*2);c.fill()
    fill('#705333',x-26*s,p.y-86*s,7*s,88*s);fill('#5a412b',x+19*s,p.y-86*s,7*s,88*s)
    c.fillStyle='#394f3b';c.beginPath();c.moveTo(x-32*s,p.y-85*s);c.lineTo(x-24*s,p.y-96*s);c.lineTo(x+24*s,p.y-96*s);c.lineTo(x+32*s,p.y-85*s);c.closePath();c.fill()
    fill('#bba16a',x-32*s,p.y-85*s,64*s,3*s)
    fill('#6e5c3e',x-28*s,p.y,56*s,5*s);fill('#b98748',x-28*s,p.y,56*s,1.5*s)
   }
   if(!p.surface){
    // The top of the landing meets the sill; its support stays below the floor.
    fill('#7e5734',n.left-6*s,p.y,52*s,4*s)
    fill('#ad773c',n.left-6*s,p.y-2*s,52*s,2*s)
    fill('#493323',n.left-6*s,p.y+4*s,52*s,s)
   }
   // Keep the painted frame fixed; only the inner leaves slide under its jamb.
   if(art){
    c.save();c.beginPath();c.rect(x-28*s,p.y-84*s,56*s,84*s);c.rect(x-14*s,p.y-66*s,28*s,66*s);c.clip('evenodd')
    c.drawImage(art.doorOpen,x-28*s,p.y-84*s,56*s,84*s);c.restore()
    for(const side of [-1,1]){
     c.save();c.beginPath();c.rect(side<0?x-15*s:x,p.y-68*s,15*s,66*s);c.clip()
     c.drawImage(art.doorClosed,x-28*s+side*18*s*p.open,p.y-84*s,56*s,84*s)
     c.restore()
    }
    if(p.open<.2){c.fillStyle='#3b3226';c.fillRect(x-6*s,p.y-42*s,12*s,13*s);c.fillStyle='#e0c58b';c.font=`${9*s}px sans-serif`;c.textAlign='center';c.fillText('↕',x,p.y-32*s)}
   }else{
    const panel=18*s*(1-p.open)
    fill('#765234',x-22*s,p.y-82*s,4*s,84*s);fill('#66482f',x+18*s,p.y-82*s,4*s,84*s)
    fill('#bb985e',x-22*s,p.y-82*s,44*s,3*s)
    if(panel>.01){fill('#765336',x-18*s,p.y-78*s,panel,78*s);fill('#65462e',x+18*s-panel,p.y-78*s,panel,78*s)}
    if(p.open<.25){c.fillStyle='#d4bb7b';c.font=`${11*s}px sans-serif`;c.textAlign='center';c.fillText('↕',x,p.y-34*s)}
   }
   fill('#3a3024',x-15*s,p.y-91*s,30*s,8*s)
   c.fillStyle='#e5c994';c.font=`bold ${5*s}px sans-serif`;c.textAlign='center';c.fillText('LIFT',x,p.y-85*s)
   fill(p.open>0?'#f5d688':'#a59667',x-2*s,p.y-80*s,4*s,2*s)
  }
 }
 c.restore()
}
