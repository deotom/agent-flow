import { drawRuntimeMark } from '../canvas/runtime-mark'
import type { OfficeAppearance, OfficePaintOptions, OfficePose, OfficeScene } from '../../../lib/office-types'

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
/** Original layered chibi human; local origin is the seat/feet. */
export function drawOfficeAvatar(c:Ctx,a:OfficeAppearance,x:number,y:number,time:number,p:OfficePose={}) {
  c.save();c.translate(x,y)
  const bob=p.walk ? Math.sin(time*9)*1.4 : 0;c.translate(0,bob)
  oval(c,0,1,15,3,'#3d241c30',false)
  // Short legs, soft shoes, torso and typing arms.
  const step=p.walk ? Math.sin(time*9)*3 : 0
  round(c,-10,p.mug?-10:-17,8,p.mug?9:17+step,a.pants);round(c,2,p.mug?-10:-17,8,p.mug?9:17-step,a.pants)
  oval(c,-7,0+step,6,3,'#e4cfac');oval(c,7,0-step,6,3,'#e4cfac')
  round(c,-14,-34,28,23,a.shirt,9)
  oval(c,-14,-23,5,9,a.shirt);oval(c,14,p.hand||p.climb?-39:-24,5,9,a.shirt)
  oval(c,-15,p.climb?-39:-21+(p.typing?Math.sin(time*10):0),4,4,a.skin)
  oval(c,16,p.hand||p.climb?-48:-23+(p.typing?Math.cos(time*10):0),4,4,a.skin)
  oval(c,0,-46,18,18,a.hair)
  if(a.cut==='bun')oval(c,-12,-64,8,8,a.hair)
  if(a.cut==='ponytail'||a.cut==='long')oval(c,-15,-39,7,17,a.hair)
  oval(c,3,-44,15,14,a.skin)
  oval(c,-12,-43,4,5,a.skin)
  // Swept fringe keeps a visible three-quarter face even at a desk.
  c.beginPath();c.moveTo(-17,-48);c.bezierCurveTo(-18,-69,21,-65,18,-47);c.quadraticCurveTo(10,-51,7,-57);c.quadraticCurveTo(0,-44,-17,-48);c.fillStyle=a.hair;c.fill();c.strokeStyle='#4b3025';c.stroke()
  if(a.cut==='curly')for(const dx of [-12,-5,3,11])oval(c,dx,-60,5,5,a.hair)
  oval(c,4,-44,1.7,2.4,'#38291f',false);oval(c,13,-44,1.5,2.3,'#38291f',false)
  oval(c,0,-38,3.4,1.7,'#e79782',false);oval(c,14,-38,2.8,1.5,'#e79782',false)
  if(p.sit&&!p.mug){
    // At a desk we see the back of the head and a small turned profile.
    oval(c,-5,-47,13,16,a.hair)
    oval(c,11,-42,7,11,a.skin)
    oval(c,15,-44,1.5,2.2,'#38291f',false)
    oval(c,12,-37,2.5,1.5,'#e79782',false)
  }
  if(a.gear==='glasses'&&(!p.sit||p.mug)){round(c,0,-48,8,8,'#ffffff20',3);round(c,10,-48,7,8,'#ffffff20',3)}
  if(p.sit&&!p.mug&&!p.walk&&!p.climb){
    // Chair back is the foreground layer, matching the empty chairs in the room art.
    round(c,-12,-24,24,21,'#514a3c',6);round(c,-10,-22,20,16,'#625a48',5)
  }
  if(p.mug){round(c,9,-22,9,10,'#fff0cf',2);oval(c,19,-17,3,3,'#ead6ae')}
  if(p.lead){c.fillStyle='#ffe08b';c.strokeStyle='#80511c';c.beginPath();c.moveTo(-8,-72);c.lineTo(-4,-68);c.lineTo(0,-75);c.lineTo(4,-68);c.lineTo(8,-72);c.lineTo(6,-64);c.lineTo(-6,-64);c.closePath();c.fill();c.stroke()}
  c.restore()
}
export function drawOfficeFrame(c:Ctx,scene:OfficeScene,o:OfficePaintOptions):void {
  c.clearRect(0,0,scene.width,scene.height)
  const scale=scene.width/450,time=o.motion?o.time:0
  // Continuous ladder connects the artwork's separate sections, including their soil bands.
  const x=scene.width*.945, top=scene.width*.335, bottom=scene.height-scene.width/3
  c.save();c.beginPath()
  const lounge=scene.floors.find(f=>f.kind==='lounge')
  if(lounge)c.rect(0,(lounge.height??0)*.68,scene.width,(lounge.height??0)*.32)
  for(const f of scene.floors){
    if(f.kind==='team'){const h=f.height??0;c.rect(0,f.y,scene.width,h*(f.room==='room-c-big'?.10:.17));c.rect(0,f.y+h*.80,scene.width,h*.20)}
    if(f.kind==='quiet')c.rect(0,f.y,scene.width,f.height??30)
  }
  c.clip()
  c.strokeStyle='#5c351d';c.lineWidth=7*scale;c.beginPath();c.moveTo(x-11*scale,top);c.lineTo(x-11*scale,bottom);c.moveTo(x+11*scale,top);c.lineTo(x+11*scale,bottom);c.stroke()
  c.strokeStyle='#c9924f';c.lineWidth=4*scale;c.stroke()
  for(let y=top;y<bottom;y+=18*scale){c.strokeStyle='#976135';c.lineWidth=5*scale;c.beginPath();c.moveTo(x-11*scale,y);c.lineTo(x+11*scale,y);c.stroke()}
  c.restore()
  for(const actor of scene.actors.filter(a=>!a.hidden).sort((a,b)=>a.y-b.y)) {
    const moving=actor.pose?.walk||actor.pose?.climb
    const waiting=actor.agent.status.startsWith('waiting_'),failed=actor.agent.status==='failed'
    if(actor.monitor&&!moving){
      const m=actor.monitor,w=actor.floorId && scene.floors.find(f=>f.id===actor.floorId)?.room==='room-b-lead'&&actor.agent.role==='lead'?29:19
      round(c,m.x-w*scale/2,m.y-7*scale,w*scale,12*scale,failed?'#b35956':waiting?'#dfb65d':'#92cad1',1)
      c.fillStyle='#ecf8dc';for(let i=0;i<3;i++)c.fillRect(m.x-w*scale*.35,m.y+(-4+i*3)*scale,(i===1?8:12)*scale,scale)
      if(actor.agent.runtime)drawRuntimeMark(c,actor.agent.runtime,m.x+(w/2+3)*scale,m.y+5*scale,6*scale)
    }
    c.save();c.translate(actor.x,actor.y);c.scale(scale,scale)
    drawOfficeAvatar(c,actor.appearance,0,0,time,{sit:!moving,typing:o.live&&o.motion&&actor.agent.status==='running'&&!moving,hand:o.live&&waiting,mug:actor.zone==='lounge'&&!moving,lead:actor.agent.role==='lead'||actor.pod,...actor.pose})
    c.restore()
  }
}
