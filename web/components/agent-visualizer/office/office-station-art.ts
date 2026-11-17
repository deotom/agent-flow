import frames from './assets/work-stations-frames-v1.json'
import type {OfficeRoomStation} from '../../../lib/office-room-design'
import type {OfficeRoomArt} from './office-room-design-art'
import type {OfficeStationState} from '../../../lib/office-station-activity'
import {officeStationHardware,type Hardware,type Point} from './office-station-hardware'
export {officeStationHardware} from './office-station-hardware'
export interface OfficeStationEffects {time:number;animate:boolean;state:OfficeStationState}

function drawDeviceEffects(c:CanvasRenderingContext2D,kind:OfficeRoomStation['kind'],parts:Hardware,x:number,y:number,w:number,h:number,effect:OfficeStationEffects){
 const alpha=Number.isFinite(c.globalAlpha)?c.globalAlpha:1
 const working=effect.state==='working',time=working&&effect.animate&&Number.isFinite(effect.time)&&effect.time>0?effect.time:0
 const alert=effect.state==='waiting'||effect.state==='failed'
 const pulse=time?.5+.5*Math.sin(time*2):.5
 const status=effect.state==='failed'?'#df8b78':effect.state==='waiting'?'#dfba70':working?'#b5dd87':'#83a294'
 const point=([px,py]:Point):Point=>[x+w*px,y+h*py]
 for(const [index,quad] of parts.screens.entries()){
  const q=quad.map(point),minX=Math.min(...q.map(p=>p[0])),maxX=Math.max(...q.map(p=>p[0])),minY=Math.min(...q.map(p=>p[1])),maxY=Math.max(...q.map(p=>p[1]))
  c.save();c.beginPath();q.forEach(([px,py],i)=>i?c.lineTo(px,py):c.moveTo(px,py));c.closePath();c.clip()
  c.fillStyle=working?'#153b3e':effect.state==='failed'?'#51322e':effect.state==='waiting'?'#51452d':'#102c2a';c.globalAlpha=alpha*(working?.42:alert?.6:.76);c.fillRect(minX,minY,maxX-minX,maxY-minY)
  c.globalAlpha=alpha*(working?.65+.12*pulse:alert?.8:.24)
  c.strokeStyle=effect.state==='working'?(kind==='build'?(minX<x+w*.5?'#7bd2d5':'#a8d86d'):'#9ed7a3'):status
  c.fillStyle=c.strokeStyle;c.lineWidth=Math.max(.55,w*.008)
  // Cosmetic traces, never tool output. Bilinear placement follows the display plane.
  const screen=(u:number,v:number):Point=>{
   const top=[q[0][0]+(q[1][0]-q[0][0])*u,q[0][1]+(q[1][1]-q[0][1])*u]
   const bottom=[q[3][0]+(q[2][0]-q[3][0])*u,q[3][1]+(q[2][1]-q[3][1])*u]
   return [top[0]+(bottom[0]-top[0])*v,top[1]+(bottom[1]-top[1])*v]
  }
  c.beginPath()
  if(kind==='build'){
   const scroll=time?Math.floor(time*2+index)%5:0
   for(let row=0;row<5;row++){const a=screen(.12,.14+row*.16),b=screen(.35+((row+scroll)%4)*.13,.14+row*.16);c.moveTo(...a);c.lineTo(...b)}
  }else{
   for(let i=0;i<=20;i++){const u=.08+i*.042,v=.5+(working?.22:.08)*Math.sin(i*.7-time*2+index);const p=screen(u,v);if(i)c.lineTo(...p);else c.moveTo(...p)}
  }
  c.stroke();c.restore()
 }
 // Two paths replace a save/fill/restore for every LED, with the same per-lamp phase.
 if(parts.leds?.length)for(const bright of time?[false,true]:[false]){
  const lit=time?(bright?.9:.18):working?.65:alert?.85:.22
  c.save();c.globalAlpha=alpha*lit;c.fillStyle=status;c.beginPath();let count=0
  for(const [index,led] of (parts.leds??[]).entries()){
   if(time&&(Math.sin(time*3.1+index*1.7)>.35)!==bright)continue
   const px=x+w*led[0],py=y+h*led[1],rx=Math.max(.55,w*.01)
   c.moveTo(px+rx,py);c.ellipse(px,py,rx,Math.max(.45,h*.006),0,0,Math.PI*2);count++
  }
  if(count)c.fill();c.restore()
 }
 if(parts.lamp){
  const [px,py]=point(parts.lamp)
  c.save();c.fillStyle='#ffe0a0';c.globalAlpha=alpha*(working?.15+.06*pulse:.06);c.beginPath();c.ellipse(px,py,w*.055,h*.034,0,0,Math.PI*2);c.fill();c.restore()
 }
 if(parts.page&&working){
  const [px,py]=point(parts.page);c.save();c.strokeStyle='#f7dfa2';c.globalAlpha=alpha*(.25+.12*pulse);c.lineWidth=Math.max(.55,w*.009);c.beginPath();c.moveTo(px-w*.045,py);c.lineTo(px+w*.035,py+(time?Math.sin(time)*h*.012:0));c.stroke();c.restore()
 }
}

/** Tight atlas frames retain the real object aspect; its lowest foot is the floor anchor. */
function paintOfficeStation(c:CanvasRenderingContext2D,station:OfficeRoomStation,art:OfficeRoomArt,effects?:OfficeStationEffects){
 const key=`${station.kind}-${station.facing}` as keyof typeof frames
 const requested=frames[key]??frames[`${station.kind}-front`],frame=requested.sheet==='angles'&&!art.stationAngles?frames[`${station.kind}-front`]:requested,source=frame.sheet==='angles'?art.stationAngles:art.stations
 if(!source)return
 const longest=Math.max(frame.width,frame.height),w=station.width*.90*frame.width/longest,h=station.height*.90*frame.height/longest
 c.save()
 c.beginPath();c.ellipse(station.x,station.y+1,station.width*.36,station.width*.055,0,0,Math.PI*2);c.fillStyle='#24160e38';c.fill()
 c.filter=`brightness(${.84+.16*station.depth}) saturate(.96)`
 c.drawImage(source,frame.x,frame.y,frame.width,frame.height,station.x-w/2,station.y-h,w,h)
 c.restore()
 if(effects){
  const facing=frame.sheet==='front'?'front':station.facing
  drawDeviceEffects(c,station.kind,officeStationHardware(station.kind,facing),station.x-w/2,station.y-h,w,h,effects)
 }
}

type Raster={canvas:OffscreenCanvas;x:number;y:number;scale:number;pixels:number}
const rasters=new Map<string,Raster>(),sourceIds=new WeakMap<object,number>()
let nextSourceId=0,rasterPixels=0

/** Bounded presentation cache only; source state and moving devices are always read fresh. */
export function drawOfficeStation(c:CanvasRenderingContext2D,station:OfficeRoomStation,art:OfficeRoomArt,effects?:OfficeStationEffects){
 const moving=effects?.state==='working'&&effects.animate&&Number.isFinite(effects.time)&&effects.time>0
 if(!effects||moving||typeof OffscreenCanvas==='undefined'||c.globalAlpha!==1||c.filter!=='none'||c.globalCompositeOperation!=='source-over'||c.imageSmoothingEnabled===false){paintOfficeStation(c,station,art,effects);return}
 const matrix=c.getTransform(),scale=matrix.a
 if(!Number.isFinite(scale)||scale<=0||matrix.b!==0||matrix.c!==0||matrix.d!==scale){paintOfficeStation(c,station,art,effects);return}
 const key=`${station.kind}-${station.facing}` as keyof typeof frames,requested=frames[key]??frames[`${station.kind}-front`]
 const frame=requested.sheet==='angles'&&!art.stationAngles?frames[`${station.kind}-front`]:requested,source=frame.sheet==='angles'?art.stationAngles:art.stations
 if(!source)return
 let id=sourceIds.get(source);if(id===undefined){id=++nextSourceId;sourceIds.set(source,id)}
 // Align the blit to device pixels and paint the original subpixel phase inside
 // the raster. Otherwise a second bilinear sample softens the painted assets.
 const left=(station.x-(station.width+4)/2)*scale+(matrix.e??0),top=(station.y-station.height-2)*scale+(matrix.f??0)
 const phaseX=left-Math.floor(left),phaseY=top-Math.floor(top)
 const cacheKey=[id,station.kind,frame.sheet,frame.x,frame.y,station.width,station.height,station.depth,scale,phaseX.toFixed(6),phaseY.toFixed(6),effects.state].join(':')
 let raster=rasters.get(cacheKey)
 if(!raster){
  const width=Math.ceil((station.width+4)*scale+phaseX),height=Math.ceil((station.height+station.width*.12+4)*scale+phaseY),pixels=width*height
  if(!Number.isFinite(pixels)||pixels<=0||pixels>1_000_000){paintOfficeStation(c,station,art,effects);return}
  const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d')
  if(!context){paintOfficeStation(c,station,art,effects);return}
  const x=(station.width+4)/2+phaseX/scale,y=station.height+2+phaseY/scale
  context.setTransform(scale,0,0,scale,0,0)
  paintOfficeStation(context as unknown as CanvasRenderingContext2D,{...station,x,y},art,{...effects,time:0,animate:false})
  raster={canvas,x,y,scale,pixels}
  while(rasters.size&&(rasters.size>=32||rasterPixels+pixels>2_000_000)){const oldest=rasters.keys().next().value!;rasterPixels-=rasters.get(oldest)!.pixels;rasters.delete(oldest)}
  rasters.set(cacheKey,raster);rasterPixels+=pixels
 }else{rasters.delete(cacheKey);rasters.set(cacheKey,raster)}
 c.drawImage(raster.canvas,station.x-raster.x,station.y-raster.y,raster.canvas.width/raster.scale,raster.canvas.height/raster.scale)
}
