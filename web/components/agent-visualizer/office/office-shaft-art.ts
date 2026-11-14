import {officeNavigation} from '../../../lib/office-navigation'
import type {OfficeArchitectureArt,OfficeScene} from '../../../lib/office-types'

/** Fixed landing doors conceal travel; the garden entrance stands on the grass. */
export function drawOfficeShaft(c:CanvasRenderingContext2D,scene:OfficeScene,front=false,art?:OfficeArchitectureArt|null,surfaceOpen=false){
 const n=officeNavigation(scene);if(!n.visible)return
 const s=n.scale,x=n.shaftX,h=n.bottom-n.top
 const stops=[{...n.hatch,id:'surface',surface:true},...n.landings.map(p=>({...p,surface:false}))].map(p=>{
  const proximity=Math.max(0,...scene.actors.filter(a=>!a.hidden&&!a.pose?.inLift&&(a.pose?.walk||a.pose?.climb)).map(a=>
   Math.min(1,Math.max(0,(a.x-(n.left-26*s))/(16*s)))*Math.max(0,Math.min(1,(32*s-Math.abs(a.y-p.y))/(24*s)))))
  return {...p,open:p.surface&&surfaceOpen?1:proximity}
 })
 const fill=(color:string,px:number,py:number,w:number,ph:number)=>{c.fillStyle=color;c.fillRect(px,py,w,ph)}
 c.save()
 if(!front){
  // Each doorway reveals a stationary cabin interior, never a naked earth shaft.
  for(const p of stops){
   c.save();c.beginPath();c.rect(x-18*s,p.y-78*s,36*s,78*s);c.clip()
   fill('#272f28',x-18*s,p.y-78*s,36*s,78*s)
   if(art)c.drawImage(art.liftCabin,x-23*s,p.y-86*s,46*s,92*s)
   fill('#b48a4e',x-18*s,p.y-2*s,36*s,2*s)
   c.restore()
  }
 }else{
  // Only open landing apertures reveal actors. All between-floor trips stay occluded.
  c.save();c.beginPath();c.rect(n.left,n.top,scene.width-n.left,h)
  for(const p of stops)if(p.open>0)c.rect(x-18*s*p.open,p.y-78*s,36*s*p.open,78*s)
  c.clip('evenodd')
  fill('#3d3024',n.left,n.top,scene.width-n.left,h)
  if(art)for(let y=n.top;y<n.bottom;y+=128*s)c.drawImage(art.liftShaft,n.left,y,n.right-n.left,128*s)
  fill('#8f673e',n.left,n.top,2*s,h)
  c.restore()
  for(const p of stops){
   if(p.surface){
    // A shallow roof, grounded plinth and side posts make a tiny garden pavilion.
    c.fillStyle='#241c1644';c.beginPath();c.ellipse(x,p.y+7*s,30*s,6*s,0,0,Math.PI*2);c.fill()
    fill('#705333',x-26*s,p.y-86*s,7*s,88*s);fill('#5a412b',x+19*s,p.y-86*s,7*s,88*s)
    c.fillStyle='#394f3b';c.beginPath();c.moveTo(x-32*s,p.y-85*s);c.lineTo(x-24*s,p.y-96*s);c.lineTo(x+24*s,p.y-96*s);c.lineTo(x+32*s,p.y-85*s);c.closePath();c.fill()
    fill('#bba16a',x-32*s,p.y-85*s,64*s,3*s)
    fill('#6e5c3e',x-28*s,p.y,56*s,5*s);fill('#c4ad77',x-28*s,p.y,56*s,1.5*s)
   }
   if(!p.surface){
    // The top of the landing meets the sill; its support stays below the floor.
    fill('#7e5734',n.left-10*s,p.y,56*s,4*s)
    fill('#c4a36b',n.left-10*s,p.y-2*s,56*s,2*s)
    fill('#493323',n.left-10*s,p.y+4*s,56*s,s)
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
