import { drawRuntimeMark, type Runtime } from '../canvas/runtime-mark'
import { officeDaylight } from '../../../lib/office-daylight'
import { drawOfficeShaft } from './office-shaft-art'
import { drawOfficeSky } from './office-sky-art'
import { drawOfficeSeasonalRooms } from './office-seasonal-art'
import { drawOfficeGarden } from './office-garden-art'
import { drawOfficeInteriorDoors } from './office-door-art'
import {drawOfficeDailyArt} from './office-daily-art'
import {drawOfficeCommunications} from './office-communication-art'
import {officeRestConversations} from '../../../lib/office-communication'
import type { OfficeActor, OfficeAppearance, OfficeDrawnOffset, OfficePaintOptions, OfficePose, OfficeScene, OfficeLeisureAction } from '../../../lib/office-types'
import { officeLife, officeLifeCanChat, officeLifePairs, officeSeed, type OfficeLifePair, type OfficeMood } from '../../../lib/office-life'

type Ambient = { name: string; night: boolean; sky: string; horizon: string; rooms: string[]; glass: string; ground: string; sun: string }
export function officeAmbient(date: Date): Ambient {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 5 && hour < 8) return { name: 'Dawn', night: false, sky: '#db9a65', horizon: '#f1c58c', rooms: ['#344455', '#2b4650', '#3b3c50', '#324b43'], glass: '#f8d796', ground: '#477f6b', sun: '#ffdc79' }
  if (hour >= 8 && hour < 17) return { name: 'Day', night: false, sky: '#449dcc', horizon: '#99c4ce', rooms: ['#30485b', '#284a50', '#363e56', '#304d43'], glass: '#79b7cf', ground: '#3e886b', sun: '#ffe579' }
  if (hour >= 17 && hour < 19) return { name: 'Dusk', night: false, sky: '#9e6977', horizon: '#dfa76f', rooms: ['#344050', '#2c4249', '#3a354a', '#34443b'], glass: '#dca66d', ground: '#3c6e61', sun: '#ffe0a4' }
  return { name: 'Night', night: true, sky: '#182a4a', horizon: '#3b4f6d', rooms: ['#1d3043', '#1e353c', '#2b2b43', '#233c33'], glass: '#d5b66e', ground: '#2a514b', sun: '#ffe7af' }
}

type Ctx = CanvasRenderingContext2D
function oval(c: Ctx, x:number,y:number,rx:number,ry:number,color:string,outline=true) {
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill()
  if(outline){c.strokeStyle='#4b3025';c.lineWidth=1.6;c.stroke()}
}
function round(c:Ctx,x:number,y:number,w:number,h:number,color:string,r=4){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();c.strokeStyle='#4b3025';c.lineWidth=1.4;c.stroke()}

/** Life poses layered on the base pose; all optional so callers can stay minimal. */
export interface OfficeAvatarPose extends OfficePose { objectAction?:OfficeLeisureAction; stretch?: number; lean?: number; doze?: boolean; slump?: boolean; scratch?: boolean; wave?: boolean; turn?: number; cup?: boolean; face?: 1 | -1; hop?: number; runtime?: Runtime | null; party?: boolean }
/** Micro-motion offsets for a pose at a given time; all zero when time is frozen at 0. */
function idleMotion(time:number,p:OfficeAvatarPose){
  const r={lift:0,headX:0,headY:0,tilt:0,left:0,right:0,wave:0,sip:0}
  if(!time||p.walk||p.climb)return r
  r.lift=Math.sin(time*2.2)*(p.doze?1.6:1);r.headX=(p.turn??0)*3
  if(p.typing){r.headY=Math.abs(Math.sin(time*11))*2.2;r.left=Math.sin(time*13)*3;r.right=Math.cos(time*13)*3;r.headX+=Math.sin(time*.7)}
  if(p.wave||p.objectAction==='music')r.wave=Math.sin(time*9)*4
  if(p.mug||p.cup||p.objectAction==='snack'){const k=(time%7)/7;r.sip=k>.78?Math.sin((k-.78)/.22*Math.PI):0;r.headY+=r.sip*2}
  if(p.objectAction==='book'){r.headY+=3;r.headX+=Math.sin(time*.6)*.6}
  if(p.objectAction==='game'){r.left=Math.sin(time*7)*1.2;r.right=Math.cos(time*8)*1.2}
  if(p.doze){r.headY+=3+Math.sin(time*1.1)*1.2;r.tilt=.14}
  if(p.slump){r.headY+=7;r.headX+=2;r.tilt=.22}
  return r
}
const mix=(a:number,b:number,k:number)=>a+(b-a)*k
/** Round AI logo patch worn on the shirt: chest from the front, upper back at a desk. */
function drawShirtLogo(c:Ctx,runtime:Runtime,x:number,y:number){
  oval(c,x,y,8,8,'#3b2a1e');c.strokeStyle='#f6e2bd';c.lineWidth=1.3;c.stroke()
  drawRuntimeMark(c,runtime,x,y,11.5)
}
function drawOutfit(c:Ctx,a:OfficeAppearance,compact=false){
  const dark='#35444e',light='#e7debf'
  if(a.outfit==='coat'){round(c,-15,-35,30,31,'#dddac8',5);c.beginPath();c.moveTo(0,-32);c.lineTo(0,-6);c.strokeStyle='#8e998e';c.lineWidth=1.5;c.stroke()}
  if(a.outfit==='hoodie'){oval(c,0,-34,18,12,a.shirt);round(c,-8,-17,16,5,dark,2);c.strokeStyle=light;c.lineWidth=1;c.beginPath();c.moveTo(-4,-32);c.lineTo(-5,-23);c.moveTo(4,-32);c.lineTo(5,-23);c.stroke()}
  if(a.outfit==='overalls'){round(c,-11,-29,22,21,'#386477',3);for(const x of [-9,7]){round(c,x,-34,3,13,'#436e81',1);oval(c,x+1.5,-25,1.5,1.5,'#f1ce78',false)}}
  if(a.outfit==='vest'||a.outfit==='jacket'){
    c.fillStyle=dark;c.beginPath();c.moveTo(-14,-33);c.lineTo(-6,-35);c.lineTo(-3,-14);c.lineTo(-14,-11);c.closePath();c.fill();c.beginPath();c.moveTo(14,-33);c.lineTo(6,-35);c.lineTo(3,-14);c.lineTo(14,-11);c.closePath();c.fill()
    if(a.outfit==='jacket'){round(c,-18,-32,7,18,dark,3);round(c,11,-32,7,18,dark,3)}
  }
  if(a.outfit==='poncho'){const w=compact?17:23;c.beginPath();c.moveTo(0,-39);c.lineTo(-w,-16);c.lineTo(0,-7);c.lineTo(w,-16);c.closePath();c.fillStyle=a.shirt;c.fill();c.strokeStyle=light;c.lineWidth=2;c.beginPath();c.moveTo(-w+5,-17);c.lineTo(0,-11);c.lineTo(w-5,-17);c.stroke()}
  if(a.outfit==='striped'){c.strokeStyle=light;c.lineWidth=2;c.beginPath();for(const y of [-29,-23,-17]){c.moveTo(-11,y);c.lineTo(11,y)}c.stroke()}
}
function drawOfficeHead(c:Ctx,a:OfficeAppearance,back:boolean,doze:boolean){
  const cut=a.cut
  if(cut==='long')round(c,-20,-63,38,41,a.hair,12)
  if(cut==='bob')round(c,-20,-63,40,33,a.hair,9)
  oval(c,0,-47,18,18,a.hair)
  if(cut==='bun')oval(c,-11,-67,9,9,a.hair)
  if(cut==='ponytail'){oval(c,-20,-43,7,20,a.hair);oval(c,-22,-32,6,10,a.hair)}
  if(cut==='curly')for(const [x,y] of [[-17,-53],[-14,-62],[-5,-67],[5,-67],[15,-61],[back?16:20,-52]])oval(c,x,y,back?5.5:7,back?5.5:7,a.hair)
  if(cut==='spike'){c.beginPath();for(const [i,[x,y]] of [[-19,-47],[-20,-66],[-12,-63],[-8,-76],[0,-67],[9,-73],[12,-63],[20,-61],[18,-46]].entries())i?c.lineTo(x,y):c.moveTo(x,y);c.closePath();c.fillStyle=a.hair;c.fill();c.strokeStyle='#4b3025';c.stroke()}
  if(a.face==='square')round(c,-11,-58,30,28,a.skin,6)
  else oval(c,3,-44,a.face==='oval'?13:16,a.face==='oval'?17:14,a.skin)
  oval(c,-12,-43,4,5,a.skin)
  c.fillStyle=a.hair;c.strokeStyle='#4b3025';c.lineWidth=1.2;c.beginPath()
  if(cut==='crop'){c.moveTo(-16,-52);c.lineTo(-12,-62);c.quadraticCurveTo(10,-68,18,-53);c.lineTo(8,-55);c.lineTo(-4,-54)}
  else if(cut==='bob'){c.moveTo(-18,-49);c.lineTo(-17,-62);c.quadraticCurveTo(8,-70,18,-55);c.lineTo(18,-47);c.lineTo(9,-54);c.lineTo(3,-50);c.lineTo(-4,-54)}
  else if(cut==='long'){c.moveTo(-18,-45);c.quadraticCurveTo(-20,-69,2,-63);c.quadraticCurveTo(21,-68,20,-43);c.lineTo(14,-52);c.lineTo(3,-59);c.lineTo(-6,-52)}
  else{c.moveTo(-17,-48);c.bezierCurveTo(-18,-69,21,-65,18,-47);c.quadraticCurveTo(10,-51,7,-57);c.quadraticCurveTo(0,-44,-17,-48)}
  c.closePath();c.fill();c.stroke()
  if(cut==='curly')for(const x of [-13,-5,3,11])oval(c,x,-57,5,5,a.hair)
  const ey=-44+(a.slot%3-1),eye=(x:number)=>{if(doze){c.beginPath();c.moveTo(x-2,ey);c.quadraticCurveTo(x,ey+2,x+2,ey);c.strokeStyle='#38291f';c.stroke()}else oval(c,x,ey,a.face==='square'?1.8:1.4,a.face==='oval'?2.7:2.1,'#38291f',false)}
  eye(3);eye(12);oval(c,0,-38,3,1.6,'#df9281',false);oval(c,15,-38,2.5,1.5,'#df9281',false)
  c.beginPath();c.moveTo(6,-34);c.quadraticCurveTo(9,-32-(a.slot%2),12,-35);c.strokeStyle='#9f6251';c.lineWidth=1;c.stroke()
  if(back){oval(c,-5,-47,13,16,a.hair);oval(c,11,-42,7,11,a.skin);eye(15)}
  const gear=a.gear
  if((gear==='glasses'||gear==='goggles')&&!back){const y=ey-5;round(c,-2,y,10,9,gear==='goggles'?'#98d2d360':'#fff8e830',3);round(c,10,y,10,9,gear==='goggles'?'#98d2d360':'#fff8e830',3);c.beginPath();c.moveTo(8,ey);c.lineTo(10,ey);c.stroke()}
  if(gear==='cap'){round(c,-19,-69,36,12,a.shirt,7);round(c,7,-61,22,4,'#344c57',2)}
  if(gear==='beanie'){round(c,-20,-71,39,17,a.shirt,9);round(c,-21,-60,41,5,'#d7c59e',2);oval(c,0,-75,5,5,a.shirt)}
  if(gear==='headphones'||gear==='headset'){c.beginPath();c.ellipse(0,-47,20,20,0,Math.PI,Math.PI*2);c.strokeStyle='#273e4c';c.lineWidth=4;c.stroke();round(c,-22,-51,7,14,'#364a5c',3);round(c,17,-51,7,14,'#364a5c',3);if(gear==='headset'){c.beginPath();c.moveTo(20,-41);c.lineTo(12,-33);c.strokeStyle='#344a51';c.lineWidth=2;c.stroke();oval(c,11,-33,3,2,'#344a51')}}
  if(gear==='earrings'){oval(c,-13,-35,3,4,'#edc76c');oval(c,19,-35,2,3,'#edc76c')}
  if(gear==='scarf'){round(c,-14,-33,29,6,'#edc477',3);round(c,7,-32,6,17,'#edc477',2)}
}
function drawLeisureProp(c:Ctx,kind:OfficeLeisureAction,rx:number,ry:number,time:number){
 if(kind==='book'){
  round(c,-11,-28,25,15,'#edddab',2);c.strokeStyle='#a28b62';c.lineWidth=1;c.beginPath();c.moveTo(2,-27);c.lineTo(2,-14)
  for(const y of [-24,-21,-18]){c.moveTo(-8,y);c.lineTo(-1,y);c.moveTo(5,y);c.lineTo(11,y)}c.stroke()
 }else if(kind==='game'){
  round(c,-12,-26,25,10,'#364856',4);c.strokeStyle='#c6d7d9';c.lineWidth=1.4;c.beginPath();c.moveTo(-9,-21);c.lineTo(-3,-21);c.moveTo(-6,-24);c.lineTo(-6,-18);c.stroke();oval(c,7,-23,1.6,1.6,'#cce0a4',false);oval(c,9,-19,1.6,1.6,'#edc47e',false)
 }else if(kind==='water'){
  round(c,rx-6,ry+1,13,11,'#65a79f',3);oval(c,rx-9,ry+5,4,4,'#85bbb0');c.beginPath();c.moveTo(rx+5,ry+4);c.lineTo(rx+16,ry+1);c.lineTo(rx+18,ry+4);c.strokeStyle='#8ac4b9';c.lineWidth=3;c.stroke()
  c.fillStyle='#93d4e9';for(let i=0;i<4;i++){const d=(time*12+i*3)%12;c.fillRect(rx+17+i,ry+5+d,1,2)}
 }else if(kind==='music'){
  oval(c,rx+4,ry+1,8,8,'#edc576');oval(c,rx+4,ry+1,5,5,'#b78b54');for(let i=0;i<4;i++)oval(c,rx+4+Math.cos(i*Math.PI/2)*7,ry+1+Math.sin(i*Math.PI/2)*7,1.5,1.5,'#e9e3cf',false)
 }else if(kind==='snack'){
  oval(c,3,-18,13,3,'#eee1be');for(const x of [-3,4,10])oval(c,x,-21,3,3,'#b97d43');oval(c,rx-1,ry-2,3,3,'#c99658');c.fillStyle='#6c4a2f';c.fillRect(4,-22,1,1)
 }
}
/** Original layered chibi human; local origin is the seat/feet. */
export function drawOfficeAvatar(c:Ctx,a:OfficeAppearance,x:number,y:number,time:number,p:OfficeAvatarPose={}) {
  c.save();c.translate(x,y)
  const m=idleMotion(time,p),stretch=p.stretch??0
  oval(c,0,1,15,3,'#3d241c30',false) // Shadow stays on the floor during hops.
  c.translate(0,(p.walk?Math.sin(time*9)*1.4:0)-(p.hop??0))
  if(p.face===-1)c.scale(-1,1)
  if(p.lean)c.rotate(-p.lean)
  const bench=p.sit&&(p.mug||p.objectAction),back=p.climb||(p.sit&&!bench),raised=p.hand||p.wave||p.climb||p.objectAction==='music'
  // Short legs, soft shoes, torso and arms.
  const climbPhase=(p.climbStep??time*2)*Math.PI
  const step=p.climb?Math.sin(climbPhase)*4.5:p.walk ? Math.sin(time*7)*3 : 0
  round(c,-10,bench?-10:-17,8,bench?9:17+step,a.pants);round(c,2,bench?-10:-17,8,bench?9:17-step,a.pants)
  oval(c,-7,0+step,6,3,'#e4cfac');oval(c,7,0-step,6,3,'#e4cfac')
  c.save();c.translate(0,-m.lift)
  round(c,-14,-34,28,23,a.shirt,9)
  drawOutfit(c,a,Boolean(p.climb))
  let lx=mix(-15,-17,stretch),ly=mix(-21+m.left,-66,stretch)
  let rx=16,ry=-23+m.right-m.sip*12
  if(p.climb){lx=-17;ly=-43+Math.sin(climbPhase)*9;rx=17;ry=-43-Math.sin(climbPhase)*9}
  else if(raised){rx=16+m.wave;ry=-48}
  else if(p.objectAction==='book'||p.objectAction==='game'||p.objectAction==='snack'){lx=-10;ly=-22+m.left;rx=12;ry=-22+m.right-(p.objectAction==='snack'?m.sip*12:0)}
  else if(p.typing&&!p.sit){lx=-12;ly=-40+m.left;rx=12;ry=-40+m.right}
  if(p.scratch){rx=10+Math.sin(time*12)*2;ry=-60}
  rx=mix(rx,17,stretch);ry=mix(ry,-66,stretch)
  oval(c,(-13+lx)/2,(-28+ly)/2,5,9,a.shirt);oval(c,(13+rx)/2+1,(-28+ry)/2,5,9,a.shirt)
  if(p.runtime&&!back)drawShirtLogo(c,p.runtime,1,-20)
  oval(c,lx,ly,4,4,a.skin);oval(c,rx,ry,4,4,a.skin)
  c.save();c.translate(m.headX,m.headY)
  if(m.tilt){c.translate(0,-30);c.rotate(m.tilt);c.translate(0,30)}
  drawOfficeHead(c,a,Boolean(back),p.doze??false)
  if(p.party&&!p.lead){
    // Striped party cone with a pompom, tilted a little.
    const hues=['#ff7aa8','#7bc8ff','#ffd35a','#8be08b'],hue=hues[a.slot%hues.length]
    c.save();c.translate(3,-60);c.rotate(.18);c.beginPath();c.moveTo(-7,0);c.lineTo(7,0);c.lineTo(0,-19);c.closePath();c.fillStyle=hue;c.fill();c.strokeStyle='#4b3025';c.lineWidth=1.3;c.stroke()
    c.beginPath();c.moveTo(-4.5,-6);c.lineTo(4.5,-6);c.moveTo(-2.4,-12);c.lineTo(2.4,-12);c.strokeStyle='#fff6';c.lineWidth=1.6;c.stroke()
    oval(c,0,-20,2.6,2.6,'#fff7d6');c.restore()
  }
  if(p.lead){c.fillStyle='#ffe08b';c.strokeStyle='#80511c';c.lineWidth=1.4;c.beginPath();c.moveTo(-8,-72);c.lineTo(-4,-68);c.lineTo(0,-75);c.lineTo(4,-68);c.lineTo(8,-72);c.lineTo(6,-64);c.lineTo(-6,-64);c.closePath();c.fill();c.stroke()}
  c.restore() // head
  if((p.mug||p.cup)&&(!p.objectAction||p.objectAction==='coffee')&&!raised&&!p.scratch&&stretch<.3){round(c,rx-7,ry+1,9,10,'#fff0cf',2);oval(c,rx+3,ry+6,3,3,'#ead6ae')}
  if(p.objectAction&&!p.walk&&!p.climb)drawLeisureProp(c,p.objectAction,rx,ry,time)
  if(p.carry){if(p.climb)round(c,-10,-31,20,18,'#967450',4);else{round(c,rx-13,ry+2,20,14,'#c69a58',2);round(c,rx-12,ry,9,4,'#dbc38c',1)}}
  c.restore() // breathing torso
  if(back&&!p.walk&&!p.climb){
    // Chair back is the foreground layer, matching the empty chairs in the room art.
    round(c,-12,-24,24,21,'#514a3c',6);round(c,-10,-22,20,16,'#625a48',5)
  }
  // At a desk the patch sits on the upper back, just above the chair, like a jersey.
  if(p.runtime&&back){c.save();c.translate(m.headX*.3,-m.lift);drawShirtLogo(c,p.runtime,0,-22);c.restore()}
  c.restore()
}

/**
 * Decorative mood glyphs, drawn upper-left of the head in avatar units (never mirrored).
 * Deliberately avoids status symbols and colours (!, ×, …, amber, red).
 */
function drawMood(c:Ctx,mood:OfficeMood,time:number){
  c.save();c.lineWidth=1.2;c.strokeStyle='#4b3025'
  if(mood==='zzz'){
    c.textAlign='center'
    for(let i=0;i<3;i++){const k=(time*.45+i/3)%1;c.globalAlpha=(1-k)*.9;c.font=`bold ${6+k*5}px sans-serif`;c.fillStyle='#f3eedd';c.strokeText('z',-14-k*8,-72-k*18);c.fillText('z',-14-k*8,-72-k*18)}
  } else if(mood==='chat'){
    c.beginPath();c.roundRect(-36,-92,22,14,5);c.moveTo(-22,-78);c.lineTo(-17,-73);c.lineTo(-27,-78);c.fillStyle='#fffaf0';c.fill();c.stroke()
    c.beginPath();c.moveTo(-31,-88);c.lineTo(-19,-88);c.moveTo(-31,-83);c.lineTo(-24,-83);c.strokeStyle='#8a6a4c';c.stroke()
  } else if(mood==='idea'){
    oval(c,-20,-86,5.5,5.5,'#ffe58a');round(c,-22.5,-81,5,3,'#b8a07a',1)
    c.beginPath();for(const r of [-2.4,-1.57,-.7]){c.moveTo(-20+Math.cos(r)*8,-86+Math.sin(r)*8);c.lineTo(-20+Math.cos(r)*11,-86+Math.sin(r)*11)}c.strokeStyle='#e8b94a';c.stroke()
  } else if(mood==='note'){
    const k=(time*.8)%1;c.globalAlpha=1-k*.6;c.font='bold 11px sans-serif';c.textAlign='center';c.fillStyle='#fff3d6';c.strokeText('♪',-20-Math.sin(k*6)*2,-78-k*8);c.fillText('♪',-20-Math.sin(k*6)*2,-78-k*8)
  } else if(mood==='sigh'){
    oval(c,-26,-82,5,4,'#cfc8bd');oval(c,-20,-85,6,5,'#cfc8bd');oval(c,-14,-82,5,4,'#cfc8bd')
  }
  c.restore()
}

/** Bounded atmosphere: day butterflies and leaves or night fireflies; slow dust in rooms. */
const DUST_CAP=20
function drawAmbient(c:Ctx,scene:OfficeScene,time:number,night:boolean){
  const w=scene.width,H=scene.floors.find(f=>f.kind==='lounge')?.height??0
  c.save()
  if(H&&night){
    for(let i=0;i<6;i++){
      const x=w*(.12+.14*i)+Math.sin(time*.5+i*1.7)*16,y=H*(.42+.05*(i%4))+Math.cos(time*.7+i)*8,a=.3+.35*(.5+.5*Math.sin(time*1.6+i*2.1))
      c.fillStyle=`rgba(255,236,140,${a*.3})`;c.beginPath();c.ellipse(x,y,5,5,0,0,Math.PI*2);c.fill()
      c.fillStyle=`rgba(255,240,160,${a})`;c.beginPath();c.ellipse(x,y,1.8,1.8,0,0,Math.PI*2);c.fill()
    }
  } else if(H){
    for(let i=0;i<2;i++){
      const k=(time*.022+i*.5)%1,x=w*(.08+.84*k),y=H*(.36+.1*i)+Math.sin(time*1.3+i*3)*10,flap=Math.abs(Math.sin(time*12+i))
      c.fillStyle=i?'#f19bb8':'#f6c55a'
      c.beginPath();c.ellipse(x-2,y,.6+3*flap,3,0,0,Math.PI*2);c.ellipse(x+2,y,.6+3*flap,3,0,0,Math.PI*2);c.fill()
      c.fillStyle='#4b3025';c.fillRect(x-.5,y-2.5,1,5)
    }
    for(let i=0;i<2;i++){
      const k=((time+i*4.5)%9)/9,x=w*(.1+.12*i)+Math.sin(k*Math.PI*4)*10+k*24,y=H*(.12+k*.5)
      c.globalAlpha=k>.85?(1-k)/.15:1;c.save();c.translate(x,y);c.rotate(Math.sin(k*Math.PI*6));c.fillStyle=i?'#9cbf55':'#d99a3e';c.beginPath();c.ellipse(0,0,3.2,1.6,0,0,Math.PI*2);c.fill();c.restore()
    }
    c.globalAlpha=1
  }
  // Confetti over the lounge while any team is celebrating.
  if(H&&scene.actors.some(a=>a.party&&!a.hidden)){
    const colors=['#ff7aa8','#7bc8ff','#ffd35a','#8be08b','#c89bff']
    for(let i=0;i<14;i++){
      const k=((time*.18+i*.0714)%1),x=w*(.22+.7*((i*37%14)/14))+Math.sin(time*2+i)*8,y=H*(.05+k*.7)
      c.save();c.translate(x,y);c.rotate(time*3+i);c.globalAlpha=k>.85?(1-k)/.15:1;c.fillStyle=colors[i%colors.length];c.fillRect(-2,-1,4,2);c.restore()
    }
    c.globalAlpha=1
  }
  let dust=0
  c.fillStyle='rgba(255,240,200,.3)'
  for(const f of scene.floors){
    if(f.kind!=='team')continue
    const h=f.height??0
    for(let j=0;j<2&&dust<DUST_CAP;j++,dust++){
      const k=(time*.015+officeSeed(`${f.id}${j}`))%1,x=w*(.08+.84*k),y=f.y+h*(.35+.25*j)+Math.sin(time*.4+j*2)*6
      c.beginPath();c.ellipse(x,y,1.2,1.2,0,0,Math.PI*2);c.fill()
    }
  }
  c.restore()
}

/** Stable per-actor time offset so micro motion never moves in lockstep. */
const phaseOf=(key:string)=>officeSeed(key)*20
const pairCache=new WeakMap<readonly OfficeActor[],Map<string,OfficeLifePair>>()
const pairsFor=(actors:readonly OfficeActor[])=>{let p=pairCache.get(actors);if(!p){p=officeLifePairs(actors);pairCache.set(actors,p)}return p}

/** Paints one frame and returns where each visible actor's body was drawn, so DOM overlays can follow. */
export function drawOfficeFrame(c:Ctx,scene:OfficeScene,o:OfficePaintOptions):Map<string,OfficeDrawnOffset> {
  c.clearRect(0,0,scene.width,scene.height)
  const scale=scene.width/450,time=o.motion?o.time:0
  drawOfficeSky(c,scene,time,o.date)
  drawOfficeGarden(c,scene,o.date,time)
  drawOfficeSeasonalRooms(c,{...scene,floors:scene.floors.filter(f=>!f.annexOf||!scene.floors.some(p=>p.id===f.annexOf))},o.date,time)
  drawOfficeDailyArt(c,scene,o.date,{kind:o.dailyArt?.kind,delivered:o.dailyArt?.delivery,cleanup:o.dailyArt?.cleanup,eatingKeys:new Set(o.dailyArt?.guests.filter(g=>g.phase==='eating'&&g.kind==='lunch').map(g=>g.actorKey))},o.roomArt)
  const daylight=officeDaylight(o.date),surface=scene.floors.find(f=>f.kind==='lounge')
  if(surface?.height&&daylight.sun){
    c.fillStyle=`rgba(31,43,38,${.08+daylight.light*.06})`
    c.beginPath();c.ellipse(scene.width*(.14+daylight.shadow*.07),surface.height*.60,scene.width*(.06+Math.abs(daylight.shadow)*.09),surface.height*.022,daylight.shadow*.12,0,Math.PI*2);c.fill()
  }
  drawOfficeShaft(c,scene,false,o.architectureArt,false,o.lift)
  drawOfficeInteriorDoors(c,scene,o.openDoorFloorId,o.architectureArt)
  const visible=scene.actors.filter(a=>!a.hidden),byKey=new Map(visible.map(a=>[a.key,a]))
  const exchange=o.exchange??null
  const chats=officeRestConversations(scene,time,new Set([o.tripKey,...(o.leisureKeys??[]),...(exchange?[exchange.senderKey,exchange.receiverKey]:[])].filter((key):key is string=>!!key)))
  const interactions=new Map<string,{face:1|-1;speaking:boolean}>()
  const interact=(speakerKey:string,listenerKey:string)=>{
    const speaker=byKey.get(speakerKey),listener=byKey.get(listenerKey)
    if(!speaker||!listener||speaker.floorId!==listener.floorId)return
    interactions.set(speakerKey,{face:listener.x>=speaker.x?1:-1,speaking:true})
    interactions.set(listenerKey,{face:speaker.x>=listener.x?1:-1,speaking:false})
  }
  for(const chat of chats)interact(chat.speakerKey,chat.listenerKey)
  if(exchange&&!exchange.remote)interact(exchange.kind==='received'?exchange.receiverKey:exchange.senderKey,exchange.kind==='received'?exchange.senderKey:exchange.receiverKey)
  const pairs=time?pairsFor(scene.actors):new Map<string,OfficeLifePair>()
  const offsets=new Map<string,OfficeDrawnOffset>()
  for(const actor of visible.sort((a,b)=>a.y-b.y)) {
    if(actor.pose?.inLift&&!o.lift)continue
    const moving=Boolean(actor.pose?.walk||actor.pose?.climb||actor.pose?.inLift)
    const interaction=moving?undefined:interactions.get(actor.key)
    const waiting=actor.agent.status.startsWith('waiting_'),failed=actor.agent.status==='failed'
    const pair=pairs.get(actor.key),partner=pair&&byKey.get(pair.partnerKey)
    const life=officeLife(actor,time,{partnerDx:pair?.partnerDx,pairSeed:pair?.pairSeed,tripActive:actor.key===o.tripKey||o.leisureKeys?.has(actor.key),greet:actor.key===o.greetKey,
      objectAction:o.objectCue?.actorKey===actor.key?o.objectCue.kind:undefined,
      partnerAwake:Boolean(partner&&partner.key!==o.tripKey&&officeLifeCanChat(partner))})
    // Monitors stay anchored to the desk and always show real status.
    if(actor.monitor&&!moving){
      const m=actor.monitor,w=actor.floorId && scene.floors.find(f=>f.id===actor.floorId)?.room==='room-b-lead'&&actor.agent.role==='lead'?29:19
      round(c,m.x-w*scale/2,m.y-7*scale,w*scale,12*scale,failed?'#b35956':waiting?'#dfb65d':'#92cad1',1)
      // Running screens scroll code lines; others stay still.
      const scroll=time&&actor.agent.status==='running'?Math.floor((time+phaseOf(actor.key))*4):0
      c.fillStyle='#ecf8dc';for(let i=0;i<3;i++)c.fillRect(m.x-w*scale*.35,m.y+(-4+i*3)*scale,(4+((i+scroll)*5)%9)*scale,scale)
    }
    const t=time?time+phaseOf(actor.key):0
    c.save();c.globalAlpha=(Number.isFinite(c.globalAlpha)?c.globalAlpha:1)*(actor.pose?.opacity??1);c.translate(actor.x+life.dx,actor.y);const carScale=actor.pose?.inLift?(.72+.28*(actor.pose.walk?Math.max(0,Math.min(1,(scene.width*.938-actor.x)/(28*scale))):0)):1;c.scale(scale*carScale,scale*carScale)
    drawOfficeAvatar(c,actor.appearance,0,0,t,{sit:!moving&&!life.stand&&!actor.stand,walk:life.walk,typing:o.live&&life.typing&&!moving,hand:o.live&&waiting,
      mug:actor.zone==='lounge'&&!moving&&(!life.objectAction||life.objectAction==='coffee'),objectAction:life.objectAction,lead:actor.agent.role==='lead'||actor.pod,cup:life.cup,stretch:life.stretch,lean:life.lean,doze:life.doze,
      slump:life.slump,scratch:life.scratch,wave:life.wave||interaction?.speaking,turn:interaction?(interaction.speaking ? .25 : -.2):life.turn,face:life.face,hop:life.hop,runtime:actor.agent.runtime,party:actor.party,...actor.pose,...(interaction?{face:interaction.face}:{}),climb:false})
    if(life.mood){c.translate(0,-life.hop);drawMood(c,life.mood,t)}
    c.restore()
    offsets.set(actor.key,{dx:life.dx,dy:-life.hop*scale})
  }
  drawOfficeCommunications(c,scene,time,exchange,chats)
  drawOfficeShaft(c,scene,true,o.architectureArt,o.liftSurfaceOpen,o.lift)
  if(time)drawAmbient(c,scene,time,officeAmbient(o.date).night)
  return offsets
}
