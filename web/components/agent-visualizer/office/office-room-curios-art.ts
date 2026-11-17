import {roomCuriosFor,type OfficeCurioKind} from '../../../lib/office-room-curios'
import type {OfficeFloor,OfficeScene} from '../../../lib/office-types'
import type {OfficeRoomArt} from './office-room-design-art'

type Ctx=CanvasRenderingContext2D
const ink='#593b31',cream='#efd5a0',wood='#a96939'
const colors=['#c86142','#5c9982','#d3a44b','#6f91b0']
function box(c:Ctx,x:number,y:number,w:number,h:number,color:string){
 c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,.035);c.fill();c.strokeStyle=ink;c.lineWidth=.026;c.stroke()
 // An off-centre dry-brush glint softens the tiny silhouettes.
 c.strokeStyle='rgba(255,224,168,.32)';c.lineWidth=.018;c.beginPath();c.moveTo(x+.035,y+.04);c.lineTo(x+w-.04,y+.045);c.stroke()
}
function line(c:Ctx,points:number[],color=ink,width=.025){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.stroke()
}
function oval(c:Ctx,x:number,y:number,rx:number,ry:number,color:string){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();c.strokeStyle=ink;c.lineWidth=.022;c.stroke()}
function paintCurio(c:Ctx,kind:OfficeCurioKind,color:string,tint:number){
 switch(kind){
  case 'swatches':
   box(c,.02,.05,.94,.84,wood);box(c,.09,.12,.80,.67,cream)
   for(let i=0;i<4;i++)box(c,.14+i*.18,.24+(i%2)*.10,.15,.37,colors[(tint+i)%4])
   oval(c,.50,.08,.025,.025,ink);break
  case 'postcard':
   box(c,.04,.12,.90,.72,cream);box(c,.10,.19,.78,.53,'#6d9d9a')
   oval(c,.71,.32,.08,.08,'#eac16b');line(c,[.13,.66,.35,.40,.50,.60,.66,.48,.86,.70],'#d8b67d',.09)
   box(c,.34,.05,.28,.10,'#d3a44b');break
  case 'pennant':
   line(c,[.50,.02,.16,.20,.84,.20,.50,.02],wood,.035)
   c.fillStyle=color;c.beginPath();c.moveTo(.14,.20);c.lineTo(.86,.20);c.lineTo(.80,.72);c.lineTo(.50,.91);c.lineTo(.20,.72);c.closePath();c.fill();c.strokeStyle=ink;c.stroke()
   line(c,[.30,.38,.50,.33,.70,.38,.50,.67,.30,.38],cream,.04);break
  case 'cable':
   box(c,.05,.11,.90,.12,wood)
   for(let i=0;i<3;i++){line(c,[.22+i*.27,.19,.22+i*.27,.30],ink,.04);oval(c,.23+i*.27,.56,.13,.28,colors[(tint+i)%4]);oval(c,.23+i*.27,.56,.075,.22,'#684e3c')}
   break
  case 'gauge':
   box(c,.03,.08,.94,.83,wood);oval(c,.50,.46,.31,.32,cream)
   for(let i=0;i<5;i++){const a=Math.PI*(1+i/4);line(c,[.50+Math.cos(a)*.20,.47+Math.sin(a)*.20,.50+Math.cos(a)*.25,.47+Math.sin(a)*.25],ink,.025)}
   line(c,[.50,.48,.68,.30],color,.045);oval(c,.50,.48,.035,.035,ink);box(c,.31,.81,.38,.10,color);break
  case 'plant':
   line(c,[.50,.72,.48,.17],'#52633b',.045)
   for(let i=0;i<4;i++)oval(c,i%2?.66:.31,.24+i*.10,.17,.09,i%2?'#66964b':'#91ad54')
   box(c,.23,.65,.54,.28,color);line(c,[.20,.67,.80,.67],cream,.045);break
  case 'books':
   for(let i=0;i<4;i++){const h=.55+(i%3)*.10;box(c,.07+i*.21,.90-h,.18,h,colors[(tint+i)%4]);line(c,[.11+i*.21,.40,.19+i*.21,.40],cream,.025);line(c,[.11+i*.21,.78,.19+i*.21,.78],cream,.025)}break
  case 'mug':
   oval(c,.75,.54,.18,.22,color);oval(c,.75,.54,.10,.13,wood);box(c,.15,.22,.54,.65,color);oval(c,.42,.25,.26,.07,cream);oval(c,.42,.25,.20,.035,'#754b36');line(c,[.30,.55,.38,.63,.53,.48],cream,.04);break
  case 'specimen':
   box(c,.12,.14,.76,.72,'#a3b3a0');box(c,.24,.06,.52,.13,wood)
   line(c,[.48,.72,.50,.26],'#4e7044',.035);oval(c,.35,.41,.16,.08,'#8caa52');oval(c,.64,.52,.16,.09,'#6e934b');box(c,.26,.72,.48,.12,cream);break
  case 'hardware':
   box(c,.05,.60,.90,.28,color)
   for(let i=0;i<3;i++){oval(c,.23+i*.26,.45,.11,.14,'#b7ada0');oval(c,.23+i*.26,.45,.04,.06,wood)}
   line(c,[.14,.69,.85,.69],cream,.03);break
  case 'tags':
   line(c,[.06,.14,.94,.14],wood,.05)
   for(let i=0;i<3;i++){line(c,[.21+i*.28,.14,.21+i*.28,.34],ink,.02);box(c,.09+i*.28,.34,.24,.43,colors[(tint+i)%4]);oval(c,.21+i*.28,.40,.025,.025,cream);line(c,[.14+i*.28,.57,.27+i*.28,.57],cream,.03)}break
  case 'brushes':
   for(let i=0;i<3;i++){line(c,[.30+i*.18,.74,.22+i*.26,.15],wood,.055);box(c,.18+i*.26,.06,.09,.20,colors[(tint+i)%4])}
   box(c,.20,.55,.61,.36,color);line(c,[.27,.71,.73,.71],cream,.03);break
  case 'notebook':
   box(c,.12,.13,.76,.76,color);box(c,.15,.17,.07,.67,wood);box(c,.31,.29,.39,.23,cream);line(c,[.36,.40,.66,.40],wood,.025);line(c,[.75,.16,.75,.88],cream,.035);break
  case 'clock':
   oval(c,.50,.48,.43,.43,wood);oval(c,.50,.48,.34,.34,cream)
   for(let i=0;i<4;i++){const a=i*Math.PI/2;line(c,[.50+Math.cos(a)*.25,.48+Math.sin(a)*.25,.50+Math.cos(a)*.29,.48+Math.sin(a)*.29])}
   line(c,[.50,.25,.50,.48,.67,.58],ink,.04);oval(c,.50,.48,.035,.035,color)
 }
}
/** Personal wall curios occupy only x .65–.80w / y .14–.25w. The existing
 * painted architecture and all walkable floor space remain visible. */
export function drawOfficeRoomCurios(c:Ctx,scene:OfficeScene,floor:OfficeFloor,_art:OfficeRoomArt|null){
 if(floor.kind!=='team'||floor.constructing||floor.annexOf)return
 const w=scene.width,curios=roomCuriosFor(floor)
 c.save();c.lineCap='round';c.lineJoin='round'
 // Clip shadows and rotated corners as well as the objects themselves.
 c.beginPath();c.rect(w*.65,floor.y+w*.14,w*.15,w*.11);c.clip()
 for(const support of curios.supports){
  c.save();c.translate(w*support.x,floor.y+w*support.y);c.scale(w*support.width,w*support.height)
  c.shadowColor='rgba(46,26,20,.24)';c.shadowBlur=w*.001;c.shadowOffsetY=w*.0015
  if(support.kind==='shelf'||support.kind==='rail'){
   box(c,0,0,1,1,wood)
   if(support.kind==='rail')for(const x of [.16,.48,.80])line(c,[x,.30,x,1.35,x+.04,1.50],ink,.035)
  }else if(support.kind==='crate'){
   box(c,0,0,1,1,'#855333');box(c,.04,.06,.92,.72,'#6d4b36');line(c,[.04,.76,.96,.76],'#c58a4b',.10);line(c,[.08,.90,.91,.90],'#a77542',.09)
  }else{
   // Research gets a tall open book cubby; quality a glazed sample cabinet.
   box(c,0,0,1,1,wood);box(c,.08,.05,.84,.90,support.kind==='cabinet'?'#8b8c68':'#71503a')
   line(c,[.07,.52,.93,.52],'#c08a4f',.05)
   if(support.kind==='cabinet'){line(c,[.52,.05,.52,.95],'#bd8b4f',.035);line(c,[.09,.08,.31,.36],'rgba(241,222,177,.24)',.018)}
  }
  c.restore()
 }
 for(const item of curios.items){
  c.save();c.translate(w*(item.x+item.width/2),floor.y+w*(item.y+item.height/2));c.rotate(item.tilt);c.scale(w*item.width,w*item.height);c.translate(-.5,-.5)
  c.shadowColor='rgba(46,26,20,.28)';c.shadowBlur=w*.0015;c.shadowOffsetX=w*.0006;c.shadowOffsetY=w*.0013
  paintCurio(c,item.kind,colors[item.tint],item.tint);c.restore()
 }
 c.restore()
}
