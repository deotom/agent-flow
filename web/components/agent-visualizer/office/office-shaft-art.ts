import { officeNavigation } from '../../../lib/office-navigation'
import type {OfficeScene} from '../../../lib/office-types'

/** Recessed shaft and doorways share the exact landing coordinates used by motion. */
export function drawOfficeShaft(c:CanvasRenderingContext2D,scene:OfficeScene,front=false){
 const n=officeNavigation(scene);if(!n.visible)return
 const s=n.scale,h=n.bottom-n.top,x=n.shaftX
 c.save()
 const plank=(px:number,py:number,w:number,ph:number)=>{if(ph<=0||w<=0)return;c.fillStyle='#604024';c.fillRect(px,py,w,ph);c.fillStyle='#bf9257';c.fillRect(px+s,py,w-2*s,Math.max(s,ph-2*s));c.fillStyle='#ddbb7e';c.fillRect(px+s,py,w-2*s,s)}
 if(!front){
  const bg=typeof c.createLinearGradient==='function'?c.createLinearGradient(n.left,0,n.right,0):null
  if(bg){bg.addColorStop(0,'#1e1d16');bg.addColorStop(.5,'#3c3021');bg.addColorStop(1,'#171b17')}
  c.fillStyle=bg??'#30291e';c.fillRect(n.left,n.top,scene.width-n.left,h)
  c.fillStyle='#50422b';for(let y=n.top+11*s;y<n.bottom;y+=38*s){c.fillRect(n.left+3*s,y,8*s,2*s);c.fillRect(n.right-10*s,y+14*s,7*s,s)}
  for(const p of n.landings){c.fillStyle='#18211c';c.fillRect(p.x-3*s,p.y-86*s,n.left-p.x+8*s,88*s);plank(p.x-3*s,p.y+2*s,n.right-p.x+3*s,6*s)}
  plank(x-n.railHalf-2*s,n.top,4*s,h);plank(x+n.railHalf-2*s,n.top,4*s,h)
  for(let y=Math.ceil(n.top/n.rungPitch)*n.rungPitch;y<n.bottom;y+=n.rungPitch)plank(x-n.railHalf,y,n.railHalf*2,4*s)
 }else{
  // Leave real entry gaps in the left frame rather than making people pass through a post.
  let y=n.top
  for(const p of [...n.landings].sort((a,b)=>a.y-b.y)){
   const opening=Math.max(n.top,p.y-86*s)
   plank(n.left,y,3*s,opening-y);plank(p.x-3*s,opening,n.left-p.x+7*s,4*s)
   y=Math.max(y,p.y+7*s)
  }
  plank(n.left,y,3*s,n.bottom-y);plank(n.right-2*s,n.top,3*s,h)
 }
 c.restore()
}
