import type { OfficeScene } from '../../../lib/office-types'
import { officeSky, type Season } from '../../../lib/office-sky'

type Ctx=CanvasRenderingContext2D
const oval=(c:Ctx,x:number,y:number,rx:number,ry:number,color:string,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,Math.PI*2);c.fill()}
const stroke=(c:Ctx,points:readonly (readonly [number,number])[],color:string,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()}
const shade=(c:Ctx,r:number)=>oval(c,0,1,r,1.6,'rgba(33,56,27,.2)')
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
export function drawOfficeGarden(c:Ctx,scene:OfficeScene,date:Date,time:number):void{
  const garden=scene.floors.find(f=>f.kind==='lounge'),h=garden?.height??0
  if(!garden||!h)return
  const sky=officeSky(date),w=scene.width,k=w/450
  const variant=(date.getFullYear()+date.getMonth()*31+date.getDate())%3
  const at=(x:number,y:number,draw:()=>void)=>{c.save();c.translate(x*w,garden.y+y*h);c.scale(k,k);draw();c.restore()}
  c.save()
  c.globalAlpha=(Number.isFinite(c.globalAlpha)?c.globalAlpha:1)*(sky.phase==='night'?.7:1)
  c.beginPath();c.rect(w*.025,garden.y+h*.61,w*.795,h*.145);c.clip()
  at(.085,.735,()=>flowers(c,sky.season,time,variant))
  at(.735,.735,()=>flowers(c,sky.season,time,(variant+1)%3))
  if(sky.season==='hot'){
    at(.22,.715,()=>lizard(c,time))
    at(.18,.64,()=>butterfly(c,time,sky.phase==='night'?'#d8d5a7':'#eac65c'))
    at(.69,.66,()=>butterfly(c,time?time+1.2:0,'#e6aa91'))
  }else if(sky.season==='rainy'){
    for(const x of [.22,.73])at(x,.735,()=>{oval(c,0,0,12,2.2,'rgba(118,176,183,.48)');oval(c,-2,-.3,7,.5,'rgba(198,226,218,.55)')})
    at(.23,.72,()=>frog(c,time));at(.76,.735,()=>snail(c,time))
  }else{
    at(.23,.72,()=>bird(c,time,'#9d8a6c'));at(.69,.70,()=>bird(c,time?time+2:0,'#7f9793'))
    at(.775,.72,()=>rabbit(c,time))
  }
  c.restore()
}
