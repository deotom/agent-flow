import { officeDaylight } from '../../../lib/office-daylight'
import type { OfficeScene } from '../../../lib/office-types'

/** Sky canvas sits behind the garden's transparent foreground artwork. */
export function drawOfficeDaylight(c:CanvasRenderingContext2D,scene:OfficeScene,date:Date,time:number) {
  const H=scene.floors.find(f=>f.kind==='lounge')?.height??0,w=scene.width,k=w/450
  if(!H||typeof c.createLinearGradient!=='function')return
  const light=officeDaylight(date)
  c.save()
  const sky=c.createLinearGradient(0,0,0,H*.48);sky.addColorStop(0,light.top);sky.addColorStop(1,light.horizon)
  c.fillStyle=sky;c.fillRect(0,0,w,H)
  if(light.sun){
    const x=light.sun.x*w,y=light.sun.y*H,r=9*k
    const glow=c.createRadialGradient(x,y,r,x,y,55*k);glow.addColorStop(0,'#fff1b982');glow.addColorStop(1,'#fff1b900')
    c.fillStyle=glow;c.fillRect(x-55*k,y-55*k,110*k,110*k)
    c.fillStyle='#fff1bd';c.beginPath();c.ellipse(x,y,r,r,0,0,Math.PI*2);c.fill()
  }
  if(light.night){
    for(let i=0;i<32;i++){
      const x=((i*137.508)%450)/450*w,y=((i*53.7)%100)/100*H*.37
      c.fillStyle=`rgba(244,245,230,${.55+.25*Math.sin(time+i)})`;c.fillRect(x,y,k,k)
    }
    c.fillStyle='#f3ead0';c.beginPath();c.ellipse(w*.76,H*.16,8*k,8*k,0,0,Math.PI*2);c.fill()
  }else{
    // Clouds drift only when motion runs; their sky/lighting follows the clock even paused.
    for(let i=0;i<3;i++){
      const x=((w*(.38+i*.23)+time*1.5*k)%(w+60*k))-30*k,y=H*(.10+i*.07)
      c.fillStyle='#fff9ed90';c.beginPath();c.ellipse(x,y,22*k,4*k,0,0,Math.PI*2);c.ellipse(x+7*k,y-3*k,10*k,6*k,0,0,Math.PI*2);c.fill()
    }
  }
  c.restore()
}
