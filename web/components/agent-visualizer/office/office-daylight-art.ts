import { officeDaylight, officeDesktopGardenSun } from '../../../lib/office-daylight'
import type { OfficeScene } from '../../../lib/office-types'
import { drawOfficeNightSky, drawOfficeWeatherClouds } from './office-sky-art'

/** Sky canvas sits behind the garden's transparent foreground artwork. */
export function drawOfficeDaylight(c:CanvasRenderingContext2D,scene:OfficeScene,date:Date,time:number) {
  const garden=scene.floors.find(f=>f.kind==='lounge'),H=garden?.height??0,w=scene.width,k=w/450
  if(!H||typeof c.createLinearGradient!=='function')return
  const light=officeDaylight(date)
  c.save()
  const sky=c.createLinearGradient(0,0,0,H*.48);sky.addColorStop(0,light.top);sky.addColorStop(1,light.horizon)
  c.fillStyle=sky;c.fillRect(0,0,w,H)
  const sun=garden?.desktopArt?officeDesktopGardenSun(light.sun):light.sun
  if(sun){
    const x=sun.x*w,y=sun.y*H,r=9*k
    const glow=c.createRadialGradient(x,y,r,x,y,55*k);glow.addColorStop(0,'#fff1b982');glow.addColorStop(1,'#fff1b900')
    c.fillStyle=glow;c.fillRect(x-55*k,y-55*k,110*k,110*k)
    c.fillStyle='#fff1bd';c.beginPath();c.ellipse(x,y,r,r,0,0,Math.PI*2);c.fill()
  }
  if(light.night)drawOfficeNightSky(c,scene,date,time)
  drawOfficeWeatherClouds(c,scene,date,time)
  c.restore()
}
