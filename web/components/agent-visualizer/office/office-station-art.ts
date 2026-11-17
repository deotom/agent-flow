import frames from './assets/work-stations-frames-v1.json'
import type {OfficeRoomStation} from '../../../lib/office-room-design'
import type {OfficeRoomArt} from './office-room-design-art'
import type {OfficeStationState} from '../../../lib/office-station-activity'

type Point=readonly[number,number]
type Quad=readonly[Point,Point,Point,Point]
type Hardware={screens:readonly Quad[];leds?:readonly Point[];lamp?:Point;page?:Point}
export interface OfficeStationEffects {time:number;animate:boolean;state:OfficeStationState}
const hardware:Record<OfficeRoomStation['kind'],{front:Hardware;angle:Hardware}>={
 build:{front:{screens:[[[.195,.091],[.49,.073],[.49,.30],[.195,.32]],[[.568,.09],[.82,.115],[.82,.32],[.568,.302]]]},angle:{screens:[[[.18,.13],[.425,.09],[.425,.31],[.18,.35]],[[.50,.10],[.735,.105],[.735,.31],[.50,.31]]]}},
 terminal:{front:{screens:[[[.65,.365],[.90,.365],[.88,.505],[.62,.505]]],leds:[.22,.31,.40,.49,.58,.67,.76,.85].flatMap(y=>[.18,.26,.34].map(x=>[x,y] as Point))},angle:{screens:[[[.625,.36],[.821,.39],[.858,.51],[.66,.51]]],leds:[.24,.33,.42,.51,.60,.69,.78].flatMap(y=>[.34,.41,.48].map(x=>[x,y] as Point))}},
 quality:{front:{screens:[[[.47,.225],[.59,.225],[.59,.326],[.47,.326]]],leds:[[.522,.374]],lamp:[.20,.115]},angle:{screens:[[[.475,.20],[.589,.20],[.589,.30],[.475,.30]]],leds:[[.535,.355]],lamp:[.224,.14]}},
 research:{front:{screens:[],lamp:[.735,.295],page:[.75,.54]},angle:{screens:[],lamp:[.703,.275],page:[.70,.535]}},
}

/** Landmarks are in the tight atlas frame, so view fallback and depth use one transform. */
export function officeStationHardware(kind:OfficeRoomStation['kind'],facing:OfficeRoomStation['facing']):Hardware {
 const source=hardware[kind][facing==='front'?'front':'angle']
 if(facing!=='right')return source
 const flip=([x,y]:Point):Point=>[1-x,y]
 return {screens:source.screens.map(q=>[flip(q[1]),flip(q[0]),flip(q[3]),flip(q[2])] as Quad),leds:source.leds?.map(flip),lamp:source.lamp&&flip(source.lamp),page:source.page&&flip(source.page)}
}

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
 for(const [index,led] of (parts.leds??[]).entries()){
  const [px,py]=point(led),lit=time?(Math.sin(time*3.1+index*1.7)>.35?.9:.18):working?.65:alert?.85:.22
  c.save();c.globalAlpha=alpha*lit;c.fillStyle=status;c.beginPath();c.ellipse(px,py,Math.max(.55,w*.01),Math.max(.45,h*.006),0,0,Math.PI*2);c.fill();c.restore()
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
export function drawOfficeStation(c:CanvasRenderingContext2D,station:OfficeRoomStation,art:OfficeRoomArt,effects?:OfficeStationEffects){
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
