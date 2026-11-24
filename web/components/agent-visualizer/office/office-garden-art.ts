import type { OfficeScene } from '../../../lib/office-types'
import { gardenWetness, officeSky, skyPhase, type Holiday, type Season } from '../../../lib/office-sky'
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

function lannaLantern(c:Ctx,sway:number,lit:boolean,hue:string,glow:string){
  c.save();c.rotate(sway)
  stroke(c,[[0,0],[0,5]],'#6b4b2f',.9)
  if(lit)oval(c,0,12,11,11,`${glow}33`)
  oval(c,0,11.5,4.8,6.5,lit?glow:hue)
  stroke(c,[[-4.5,11.5],[4.5,11.5]],'#5c3b1e88',.7)
  stroke(c,[[-3.8,8.5],[3.8,8.5]],'#5c3b1e88',.6)
  stroke(c,[[-3.8,14.5],[3.8,14.5]],'#5c3b1e88',.6)
  c.fillStyle='#8c5c2e';c.fillRect(-3,5,6,1.6);c.fillRect(-2.6,17.5,5.2,1.6)
  stroke(c,[[-1.2,19],[-1.6,23],[0,19],[0,24],[1.2,19],[1.6,23]],'#f2c96d',.7)
  c.restore()
}
function buntingSwag(c:Ctx,x0:number,y0:number,x1:number,y1:number,sag:number,count:number,colors:readonly string[],time:number){
  const midX=(x0+x1)/2,midY=(y0+y1)/2+sag
  c.strokeStyle='#6d5034';c.lineWidth=.8;c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo(midX,midY,x1,y1);c.stroke()
  for(let i=0;i<count;i++){
    const t=(i+.5)/count,px=(1-t)*(1-t)*x0+2*(1-t)*t*midX+t*t*x1,py=(1-t)*(1-t)*y0+2*(1-t)*t*midY+t*t*y1
    const flutter=time?Math.sin(time*1.8+i)*.6:0
    c.beginPath();c.moveTo(px-2.6,py);c.lineTo(px+2.6,py);c.lineTo(px+flutter,py+5.4);c.closePath()
    c.fillStyle=colors[i%colors.length];c.fill()
  }
}

/** Subtle per-holiday garden props and overhead accents, kept clear of the right lift shaft. */
export function drawOfficeHolidayGarden(c:Ctx,scene:OfficeScene,date:Date,time:number,overrideHoliday?:Holiday|null):void{
  const garden=scene.floors.find(f=>f.kind==='lounge'),h=garden?.height??0
  if(!garden||!h)return
  const sky=officeSky(date),holiday=overrideHoliday===undefined?sky.holiday:overrideHoliday
  if(!holiday)return
  const desktop=Boolean(garden.desktopArt),lit=gardenLampsOn(date),w=scene.width,k=w/450
  const place=(x:number,y:number,draw:()=>void)=>{c.save();c.translate(x*w,garden.y+y*h);c.scale(k,k);draw();c.restore()}
  c.save()
  c.beginPath();c.rect(0,garden.y,w*(desktop?.80:.82),h*.89);c.clip()
  const focalX=desktop?.415:.23,focalY=desktop?.84:.735
  const canopyX0=w*(desktop?.18:.14),canopyY0=garden.y+h*(desktop?.36:.28)
  const stallX0=w*(desktop?.46:.40),stallX1=w*(desktop?.68:.66),stallY=garden.y+h*(desktop?.43:.34)
  if(holiday==='loy-krathong'){
    buntingSwag(c,stallX0,stallY,stallX1,stallY,7*k,9,['#f6b642','#f28b40','#ffe17d'],time)
    for(const [i,[lx,ly,hue,glow]] of ([[.14,.32,'#f29b38','#ffd37d'],[.24,.36,'#eb7d4b','#ffe299'],[.48,.43,'#f6b848','#ffe594'],[.57,.44,'#e88b5a','#ffd479'],[.66,.43,'#f6b848','#ffe594']] as const).entries()){
      place(lx,ly,()=>lannaLantern(c,time?Math.sin(time*1.3+i*1.1)*.08:0,lit,hue,glow))
    }
    place(focalX,focalY,()=>{
      oval(c,0,-2,15,4.2,'#5d432e');oval(c,0,-3,13.2,3.1,'#3f7380')
      for(const [kx,ky,petal] of [[-5,-3.2,'#f29db5'],[5,-2.6,'#ffd56b']] as const){
        const bob=time?Math.sin(time*2+kx)*.5:0
        oval(c,kx,ky+bob,4.2,1.6,'#538748')
        oval(c,kx-1.5,ky-1.2+bob,1.5,1.1,petal);oval(c,kx+1.5,ky-1.2+bob,1.5,1.1,petal)
        c.fillStyle='#ffe8c2';c.fillRect(kx-.5,ky-4+bob,1,2.5)
        oval(c,kx+(time?Math.sin(time*5+kx)*.3:0),ky-5.2+bob,1.2,1.6,'#ffd269')
      }
    })
  }else if(holiday==='songkran'){
    buntingSwag(c,canopyX0,canopyY0,stallX1,stallY,12*k,12,['#59c3d4','#f2ca50','#ef7ca2','#74cb7c'],time)
    buntingSwag(c,stallX0,stallY,stallX1,stallY,6*k,8,['#f2ca50','#59c3d4','#ef7ca2'],time)
    place(focalX,focalY,()=>{
      oval(c,0,-2,11,4,'#9d7536');oval(c,0,-4,11,3.2,'#d4ad64');oval(c,0,-4.4,9.5,2.2,'#7fc2d4')
      for(const [px,py,col] of [[-4,-4.5,'#fff9eb'],[0,-4,'#f6c94d'],[4,-4.8,'#fff9eb'],[2,-3.6,'#f697b5']] as const)oval(c,px,py,1.3,1,col)
      if(time){const sp=(time*2)%1;oval(c,-6+sp*12,-7-Math.sin(sp*Math.PI)*4,1,1,'#bcecf8')}
    })
  }else if(holiday==='christmas'){
    buntingSwag(c,stallX0,stallY,stallX1,stallY,6*k,9,['#3d7850','#c2524c','#e8c566'],time)
    for(let i=0;i<7;i++){
      const bx=stallX0+(stallX1-stallX0)*(i+.5)/7,by=stallY+Math.sin((i+.5)/7*Math.PI)*6*k
      const on=!time||Math.sin(time*3+i*1.4)>-.4
      oval(c,bx,by,1.8*k,1.8*k,on?(i%2?'#ffd875':'#ff7666'):'#6b553e')
    }
    place(focalX,focalY,()=>{
      c.fillStyle='#6d4528';c.fillRect(-2,-6,4,6)
      c.beginPath();c.moveTo(0,-27);c.lineTo(-10,-5);c.lineTo(10,-5);c.closePath();c.fillStyle='#3b764e';c.fill()
      c.beginPath();c.moveTo(0,-21);c.lineTo(-12,-5);c.lineTo(12,-5);c.closePath();c.fillStyle='#2f6340';c.fill()
      oval(c,0,-28,2.2,2.2,'#ffe084')
      for(const [dx,dy,col] of [[-3,-15,'#ef6e66'],[4,-11,'#f2ca58'],[-4,-8,'#78b8e6']] as const)oval(c,dx,dy,1.5,1.5,col)
      c.fillStyle='#c45258';c.fillRect(9,-6,6,6);c.fillStyle='#efd17a';c.fillRect(11.3,-6,1.4,6)
      c.fillStyle='#d1a554';c.fillRect(-15,-5,6,5);c.fillStyle='#6fa379';c.fillRect(-12.7,-5,1.4,5)
    })
  }else if(holiday==='halloween'){
    buntingSwag(c,stallX0,stallY,stallX1,stallY,6*k,8,['#7b5ea7','#d9843b','#46344e'],time)
    for(const [i,[gx,gy]] of [[.17,.35],[.27,.39]].entries()){
      place(gx,gy,()=>{
        const sway=time?Math.sin(time*1.6+i)*.1:0
        c.save();c.rotate(sway);stroke(c,[[0,0],[0,5]],'#4b3a54',.8)
        oval(c,0,10,4.2,5,'#f4efe2');oval(c,-1.3,9,.6,.8,'#3a2d40');oval(c,1.3,9,.6,.8,'#3a2d40')
        c.restore()
      })
    }
    place(focalX,focalY,()=>{
      for(const [px,r] of [[-4.5,6.2],[5.5,4.6]] as const){
        oval(c,px,-r*.68,r,r*.76,'#d97834')
        c.fillStyle='#5c7542';c.fillRect(px-.7,-r*1.5,1.4,2.2)
        oval(c,px-2,-r*.8,1,1,'#ffe07d');oval(c,px+2,-r*.8,1,1,'#ffe07d')
      }
    })
  }else if(holiday==='new-year'){
    buntingSwag(c,canopyX0,canopyY0,stallX1,stallY,10*k,11,['#f2cb63','#fff2b8','#e87b6b','#6dc2e6'],time)
    buntingSwag(c,stallX0,stallY,stallX1,stallY,6*k,9,['#f2cb63','#fff2b8','#d9874c'],time)
    place(focalX,focalY,()=>{
      c.fillStyle='#d4a64a';c.fillRect(-10,-7,8,7);c.fillStyle='#fff3c4';c.fillRect(-6.8,-7,1.5,7)
      c.fillStyle='#c45b58';c.fillRect(1,-6,8,6);c.fillStyle='#f4d47c';c.fillRect(4.3,-6,1.5,6)
      const pulse=time?.6+.4*Math.sin(time*6):1
      oval(c,-6,-10,2.5*pulse,2.5*pulse,'#fff2a6');oval(c,5,-9,2.2*pulse,2.2*pulse,'#ffd269')
    })
  }else if(holiday==='valentine'){
    buntingSwag(c,stallX0,stallY,stallX1,stallY,6*k,8,['#f284a4','#fbd2dc','#d4557a'],time)
    for(const [i,[hx,hy]] of [[.49,.45],[.64,.45]].entries()){
      place(hx,hy,()=>{
        c.save();c.rotate(time?Math.sin(time*1.4+i)*.08:0)
        stroke(c,[[0,0],[0,4]],'#8d5267',.8)
        oval(c,-1.5,6.5,2.2,2.2,'#eb6d93');oval(c,1.5,6.5,2.2,2.2,'#eb6d93')
        c.beginPath();c.moveTo(-3.6,7.4);c.lineTo(3.6,7.4);c.lineTo(0,11.6);c.closePath();c.fillStyle='#eb6d93';c.fill()
        c.restore()
      })
    }
    place(focalX,focalY,()=>{
      oval(c,0,-2.5,8.5,3.2,'#9c6c49')
      for(const [rx,ry,col] of [[-4,-5.5,'#e35d81'],[0,-6.5,'#f48fb1'],[4,-5.5,'#e35d81'],[-2,-4,'#f8bbd0'],[2,-4,'#c9496e']] as const)oval(c,rx,ry,2.5,2,col)
    })
  }
  c.restore()
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
  if(sky.holiday)drawOfficeHolidayGarden(c,scene,date,time,sky.holiday)
  const desktop=Boolean(garden.desktopArt)
  c.globalAlpha=(Number.isFinite(c.globalAlpha)?c.globalAlpha:1)*(afterDark?.7:1)
  c.beginPath();c.rect(w*(desktop?.02:.025),garden.y+h*(desktop?.60:.61),w*(desktop?.77:.795),h*(desktop?.275:.145));c.clip()
  if(!afterDark){
    at(desktop?.115:.085,desktop?.845:.735,()=>flowers(c,sky.season,time,variant))
    at(desktop?.755:.735,desktop?.840:.735,()=>flowers(c,sky.season,time,(variant+1)%3))
  }
  if(lit&&sky.weather!=='storm'){
    for(let i=0;i<6;i++){
      const phase=time?time*.9+i*1.9:i
      const y=(desktop?.66:.667)+Math.sin(phase)*(desktop?.035:.031)
      at((desktop?.16:.18)+i*(desktop?.105:.109)+Math.sin(phase*.7)*(desktop?.024:.026),y,()=>oval(c,0,0,1.15,1.15,'#f4e69c'))
    }
  }
  if(sky.season==='hot'&&!lit&&sky.weather!=='storm'){
    at(desktop?.415:.22,desktop?.842:.715,()=>lizard(c,time))
    at(.18,desktop?.66:.64,()=>butterfly(c,time,'#eac65c'))
    at(.69,desktop?.65:.66,()=>butterfly(c,time?time+1.2:0,'#e6aa91'))
  }else if(sky.season==='rainy'){
    if(!desktop)for(const x of [.22,.73])at(x,.735,()=>{oval(c,0,0,12,2.2,'rgba(118,176,183,.48)');oval(c,-2,-.3,7,.5,'rgba(198,226,218,.55)')})
    if(lit||sky.weather==='rain')at(desktop?.385:.23,desktop?.835:.72,()=>frog(c,time))
    if(!afterDark)at(desktop?.760:.76,desktop?.845:.735,()=>snail(c,time))
  }else if(sky.season==='cool'&&!lit){
    at(desktop?.435:.23,desktop?.835:.72,()=>bird(c,time,'#9d8a6c'));at(desktop?.745:.69,desktop?.825:.70,()=>bird(c,time?time+2:0,'#7f9793'))
  }else if(sky.season==='cool'&&sky.phase==='dusk'){
    at(desktop?.135:.775,desktop?.845:.72,()=>rabbit(c,time))
  }
  c.restore()
}
