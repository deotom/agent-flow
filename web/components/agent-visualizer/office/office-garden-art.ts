import type { OfficeScene } from '../../../lib/office-types'
import { gardenWetness, officeSky, skyPhase, type Season } from '../../../lib/office-sky'
import { officeDaylight } from '../../../lib/office-daylight'

type Ctx=CanvasRenderingContext2D
const paintedLampCenters=[[.304,.310],[.490,.477],[.706,.475]] as const
const oval=(c:Ctx,x:number,y:number,rx:number,ry:number,color:string,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,Math.PI*2);c.fill()}
const stroke=(c:Ctx,points:readonly (readonly [number,number])[],color:string,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()}
const shade=(c:Ctx,r:number)=>oval(c,0,1,r,1.6,'rgba(33,56,27,.2)')
type GardenLight=ReturnType<typeof officeDaylight>
// Ground contact in the painted plate, from left to right: roots, bench, stools and lift sill.
const furnitureContacts=[[.104,.677,24,3],[.163,.758,8,2],[.355,.766,8,2],[.58,.798,9,2],[.655,.806,9,2],[.9,.865,27,2.5]] as const
// The stone path in the foreground plate, clear of café stools and the lift platform.
const puddleSites=[[.389,.823,12,2.9,false],[.418,.839,8,2.3,false],[.742,.819,12,3.1,true],[.778,.833,9,2.4,true]] as const

function drawWetGardenPath(c:Ctx,w:number,y:number,h:number,wetness:number,light:GardenLight,lit:boolean){
  if(wetness<=0)return
  const k=w/450
  c.save()
  c.globalAlpha=(Number.isFinite(c.globalAlpha)?c.globalAlpha:1)*wetness
  for(const [x,depth,rx,ry,nearLamp] of puddleSites){
    const cx=x*w,cy=y+depth*h,spread=(.70+.30*wetness)*k
    const dx=rx*spread,dy=ry*spread
    oval(c,cx,cy,dx*1.38,dy*1.36,'#292d3861',-.10)
    oval(c,cx-dx*.16,cy,dx,dy,'#3c4e657c',-.13)
    oval(c,cx+dx*.32,cy+dy*.27,dx*.67,dy*.73,'#3c4e655e',.06)
    const reflection=lit&&nearLamp?'#ffbd718c':light.horizon+(light.night?'45':'b3')
    oval(c,cx-dx*.20,cy-dy*.33,dx*.56,dy*.30,reflection,-.13)
    oval(c,cx+dx*.36,cy,dx*.30,dy*.19,reflection,.05)
  }
  c.restore()
}

function gardenContact(c:Ctx,x:number,y:number,rx:number,ry:number,k:number,light:GardenLight){
  if(light.sun){
    const drift=light.shadow*(6+22*light.sun.y)*k
    oval(c,x+drift,y+2*k,rx+Math.abs(drift)*.65,ry*1.8,'#29222b35',light.shadow*.10)
  }
  oval(c,x,y+k,rx,ry,light.sun?'#221b1d53':'#211d2b3b')
}

/** Called in the character's local space so the contact stays aligned to the feet. */
export function drawOfficeGardenActorShadow(c:Ctx,light:GardenLight){
  gardenContact(c,0,0,12,1.8,1,light)
}
export function gardenLampsOn(date:Date){
  const phase=skyPhase(date)
  return phase==='dusk'||phase==='night'
}
/** Paint the glass over the lit panes in the daytime plate, leaving the timber and metal untouched. */
export function drawUnlitGardenLamp(c:Ctx,x:number,y:number,sx:number,sy=sx){
  c.save();c.translate(x,y);c.scale(sx,sy)
  c.beginPath();c.moveTo(-5.7,-7);c.lineTo(5.7,-7);c.lineTo(4.3,7);c.lineTo(-4.3,7);c.closePath()
  c.fillStyle='#796647';c.fill()
  stroke(c,[[-2.7,-6],[-2.1,6]],'#a38b62',1)
  stroke(c,[[2.4,-6],[1.9,6]],'#534532',1.2)
  c.restore()
}
/** The lamp glow is painted above the garden plate's daylight filter. */
export function drawLitGardenLamp(c:Ctx,x:number,y:number,sx:number,sy:number){
  c.save();c.translate(x,y);c.scale(sx,sy)
  const halo=c.createRadialGradient(0,0,1,0,0,36)
  halo.addColorStop(0,'#ffbb578c')
  halo.addColorStop(.36,'#f49a344d')
  halo.addColorStop(1,'#f49a3400')
  c.fillStyle=halo;c.fillRect(-36,-36,72,72)
  oval(c,0,0,3.6,6,'#ffc063')
  oval(c,0,.4,1.8,4.5,'#ffe8a6')
  c.restore()
}
function bloom(c:Ctx,x:number,y:number,color:string,r=2.2){
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;oval(c,x+Math.cos(a)*r,y+Math.sin(a)*r,r*.75,r*.58,color,a)}
  oval(c,x,y,r*.55,r*.55,'#f5d27a')
}
function flowers(c:Ctx,season:Season,time:number,variant:number){
  const colors:Record<Season,readonly string[]>={hot:['#e3b447','#e08e5c','#e8cb75'],rainy:['#ab97d0','#8bbacb','#e5c9dd'],cool:['#eedfc6','#d9a4b1','#e6bc71']}
  const green=season==='rainy'?'#438d57':season==='hot'?'#7e9a52':'#638c59'
  for(let i=0;i<5;i++){
    const x=-12+i*6,y=-8-(i%3)*3,sway=time?Math.sin(time*(season==='cool'?1.1:.7)+i+variant)*.7:0
    stroke(c,[[x,1],[x+sway,y]],green,1.1)
    oval(c,x-2,y*.4,3.8,1.5,green,-.6);oval(c,x+2,y*.65,3.4,1.4,green,.6)
    bloom(c,x+sway,y,colors[season][(i+variant)%3],season==='cool'?2.5:2)
  }
  if(season==='rainy'){
    // Broad new leaves appear after the summer rains, rather than winter foliage loss.
    for(let i=0;i<3;i++)oval(c,-8+i*8,-3,3.2,7,'#5a9c62',-.7+i*.7)
  }
}
function butterfly(c:Ctx,time:number,color:string){
  const flap=time?.4+.6*Math.abs(Math.sin(time*6)):1
  oval(c,-2.8*flap,-1,3*flap,3.4,color,-.3);oval(c,2.8*flap,-1,3*flap,3.4,color,.3)
  oval(c,-2*flap,2,2.2*flap,2.1,'#e9ba75');oval(c,2*flap,2,2.2*flap,2.1,'#e9ba75')
  stroke(c,[[0,-3],[0,3]],'#695743',1);stroke(c,[[0,-3],[-1,-5]],'#695743',.6);stroke(c,[[0,-3],[1,-5]],'#695743',.6)
}
function lizard(c:Ctx,time:number){
  shade(c,8)
  const sway=time?Math.sin(time*1.2)*1.2:0
  c.strokeStyle='#8eaa68';c.lineWidth=2;c.beginPath();c.moveTo(-5,-2);c.quadraticCurveTo(-11,-4+sway,-13,-1);c.stroke()
  oval(c,0,-2,6,2.2,'#8aa65e');oval(c,6,-3,3,1.8,'#9eb976')
  for(const [x,direction] of [[-2,-1],[3,1]])for(const side of [-1,1])stroke(c,[[x,-2],[x+direction*2,side*2-2],[x+direction*3,side*2.7-2]],'#779850',.9)
  for(let i=0;i<4;i++)oval(c,-3+i*2,-3,.5,.5,'#c4cd86')
  oval(c,7,-3.8,.55,.55,'#35472a')
}
function frog(c:Ctx,time:number){
  const breath=time?Math.sin(time*1.6)*.25:0
  shade(c,6);oval(c,-4,-1,3,1.7,'#56874b');oval(c,4,-1,3,1.7,'#56874b')
  oval(c,0,-3,5,3+breath,'#7baf64');oval(c,0,-2.2,3,1.5,'#b8c88a')
  for(const x of [-2.7,2.7]){oval(c,x,-5.7,1.7,1.8,'#8ebc72');oval(c,x,-6,.7,.8,'#344d30')}
  stroke(c,[[-1,-3],[1,-3]],'#557345',.5)
}
function snail(c:Ctx,time:number){
  const reach=time?Math.sin(time*.8)*.8:0
  shade(c,6);oval(c,0,-1,6,1.5,'#b7a985');oval(c,-1.5,-4,3.7,3.7,'#ac8661')
  c.strokeStyle='#d1b48a';c.lineWidth=.8;c.beginPath();c.ellipse(-1.5,-4,2,2,0,0,Math.PI*1.6);c.stroke()
  oval(c,5+reach,-2,1.6,1.4,'#b7a985')
  for(const x of [4.4,6]){stroke(c,[[x+reach,-2],[x+reach,-4]],'#a59576',.6);oval(c,x+reach,-4,.4,.4,'#584f3c')}
}
function bird(c:Ctx,time:number,color:string){
  const peck=time&&Math.sin(time*.8)>.8?2:0
  shade(c,5);stroke(c,[[-1,-2],[-1,1]],'#a78555',.65);stroke(c,[[2,-2],[2,1]],'#a78555',.65)
  oval(c,0,-4,4.4,3,color);oval(c,1,-3.4,2.4,2,'#d6c6a0');oval(c,3.5,-6+peck,2.2,2,color)
  oval(c,4.2,-6.5+peck,.5,.5,'#343a2d');stroke(c,[[5.5,-5.7+peck],[7,-5+peck]],'#c89b58',1)
  stroke(c,[[-3,-4],[-6,-5],[-4,-2]],color,1.5)
}
function rabbit(c:Ctx,time:number){
  shade(c,6.5);oval(c,-1,-3,6,4,'#d8c9af');oval(c,4,-5,3.6,3.2,'#e5d8c1');oval(c,-6,-3.5,2.2,2.2,'#efe4cf')
  oval(c,2.5,-10.5,1.6,5,'#e5d8c1',-.15);oval(c,5.5,-10.5,1.6,5,'#e5d8c1',.15)
  oval(c,2.5,-11, .7,3.2,'#cfae9f',-.15);oval(c,5.5,-11,.7,3.2,'#cfae9f',.15)
  oval(c,-2,0,3,1.2,'#c6b79f');oval(c,5,-1,2.5,1,'#d6c6ac')
  const blink=time&&Math.sin(time*.9)>.98
  oval(c,5.2,-5.7,.55,blink?.18:.65,'#594d40');oval(c,7.2,-4.3,.6,.45,'#c6948a')
}

/** Small wildlife and plant accents live on grass margins, clear of furniture and the hatch. */
export function drawOfficeGarden(c:Ctx,scene:OfficeScene,date:Date,time:number,light=officeDaylight(date)):void{
  const garden=scene.floors.find(f=>f.kind==='lounge'),h=garden?.height??0
  if(!garden||!h)return
  const sky=officeSky(date),w=scene.width,k=w/450
  const lit=gardenLampsOn(date),afterDark=sky.phase==='night'
  const variant=(date.getFullYear()+date.getMonth()*31+date.getDate())%3
  const at=(x:number,y:number,draw:()=>void)=>{c.save();c.translate(x*w,garden.y+y*h);c.scale(k,k);draw();c.restore()}
  c.save()
  if(garden.desktopArt){
    drawWetGardenPath(c,w,garden.y,h,gardenWetness(date,sky.weather),light,lit)
    for(const [x,y,rx,ry] of furnitureContacts)gardenContact(c,x*w,garden.y+y*h,rx*k,ry*k,k,light)
    const paintLamp=lit?drawLitGardenLamp:drawUnlitGardenLamp
    for(const [x,y] of paintedLampCenters)paintLamp(c,x*w,garden.y+y*h,k,h/195)
  }
  c.globalAlpha=(Number.isFinite(c.globalAlpha)?c.globalAlpha:1)*(afterDark?.7:1)
  c.beginPath();c.rect(w*.025,garden.y+h*.61,w*.795,h*.145);c.clip()
  if(!afterDark){
    at(.085,.735,()=>flowers(c,sky.season,time,variant))
    at(.735,.735,()=>flowers(c,sky.season,time,(variant+1)%3))
  }
  if(lit&&sky.weather!=='storm'){
    for(let i=0;i<6;i++){
      const phase=time?time*.9+i*1.9:i
      const y=.667+Math.sin(phase)*.031
      at(.18+i*.109+Math.sin(phase*.7)*.026,y,()=>oval(c,0,0,1.15,1.15,'#f4e69c'))
    }
  }
  if(sky.season==='hot'&&!lit&&sky.weather!=='storm'){
    at(.22,.715,()=>lizard(c,time))
    at(.18,.64,()=>butterfly(c,time,'#eac65c'))
    at(.69,.66,()=>butterfly(c,time?time+1.2:0,'#e6aa91'))
  }else if(sky.season==='rainy'){
    if(!garden.desktopArt)for(const x of [.22,.73])at(x,.735,()=>{oval(c,0,0,12,2.2,'rgba(118,176,183,.48)');oval(c,-2,-.3,7,.5,'rgba(198,226,218,.55)')})
    if(lit||sky.weather==='rain')at(.23,.72,()=>frog(c,time))
    if(!afterDark)at(.76,.735,()=>snail(c,time))
  }else if(sky.season==='cool'&&!lit){
    at(.23,.72,()=>bird(c,time,'#9d8a6c'));at(.69,.70,()=>bird(c,time?time+2:0,'#7f9793'))
  }else if(sky.season==='cool'&&sky.phase==='dusk'){
    at(.775,.72,()=>rabbit(c,time))
  }
  c.restore()
}
