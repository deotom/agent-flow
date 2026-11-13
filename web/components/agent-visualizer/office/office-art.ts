import { drawRuntimeMark, type Runtime } from '../canvas/runtime-mark'
import type { OfficeActor, OfficeAppearance, OfficeDrawnOffset, OfficePaintOptions, OfficePose, OfficeScene } from '../../../lib/office-types'
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
export interface OfficeAvatarPose extends OfficePose { stretch?: number; lean?: number; doze?: boolean; slump?: boolean; scratch?: boolean; wave?: boolean; turn?: number; cup?: boolean; face?: 1 | -1; hop?: number; runtime?: Runtime | null }
/** Micro-motion offsets for a pose at a given time; all zero when time is frozen at 0. */
function idleMotion(time:number,p:OfficeAvatarPose){
  const r={lift:0,headX:0,headY:0,tilt:0,left:0,right:0,wave:0,sip:0}
  if(!time||p.walk||p.climb)return r
  r.lift=Math.sin(time*2.2)*(p.doze?1.6:1);r.headX=(p.turn??0)*3
  if(p.typing){r.headY=Math.abs(Math.sin(time*11))*2.2;r.left=Math.sin(time*13)*3;r.right=Math.cos(time*13)*3;r.headX+=Math.sin(time*.7)}
  if(p.wave)r.wave=Math.sin(time*9)*4
  if(p.mug||p.cup){const k=(time%7)/7;r.sip=k>.78?Math.sin((k-.78)/.22*Math.PI):0;r.headY+=r.sip*2}
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
/** Original layered chibi human; local origin is the seat/feet. */
export function drawOfficeAvatar(c:Ctx,a:OfficeAppearance,x:number,y:number,time:number,p:OfficeAvatarPose={}) {
  c.save();c.translate(x,y)
  const m=idleMotion(time,p),stretch=p.stretch??0
  oval(c,0,1,15,3,'#3d241c30',false) // Shadow stays on the floor during hops.
  c.translate(0,(p.walk?Math.sin(time*9)*1.4:0)-(p.hop??0))
  if(p.face===-1)c.scale(-1,1)
  if(p.lean)c.rotate(-p.lean)
  const bench=p.sit&&p.mug,back=p.sit&&!p.mug,raised=p.hand||p.wave||p.climb
  // Short legs, soft shoes, torso and arms.
  const step=p.walk ? Math.sin(time*9)*3 : 0
  round(c,-10,bench?-10:-17,8,bench?9:17+step,a.pants);round(c,2,bench?-10:-17,8,bench?9:17-step,a.pants)
  oval(c,-7,0+step,6,3,'#e4cfac');oval(c,7,0-step,6,3,'#e4cfac')
  c.save();c.translate(0,-m.lift)
  round(c,-14,-34,28,23,a.shirt,9)
  const lx=mix(-15,-17,stretch),ly=p.climb?-39:mix(-21+m.left,-66,stretch)
  let rx=16,ry=-23+m.right-m.sip*12
  if(raised){rx=16+m.wave;ry=-48}
  if(p.scratch){rx=10+Math.sin(time*12)*2;ry=-60}
  rx=mix(rx,17,stretch);ry=mix(ry,-66,stretch)
  oval(c,(-13+lx)/2,(-28+ly)/2,5,9,a.shirt);oval(c,(13+rx)/2+1,(-28+ry)/2,5,9,a.shirt)
  if(p.runtime&&!back)drawShirtLogo(c,p.runtime,1,-20)
  oval(c,lx,ly,4,4,a.skin);oval(c,rx,ry,4,4,a.skin)
  c.save();c.translate(m.headX,m.headY)
  if(m.tilt){c.translate(0,-30);c.rotate(m.tilt);c.translate(0,30)}
  oval(c,0,-46,18,18,a.hair)
  if(a.cut==='bun')oval(c,-12,-64,8,8,a.hair)
  if(a.cut==='ponytail'||a.cut==='long')oval(c,-15,-39,7,17,a.hair)
  oval(c,3,-44,15,14,a.skin)
  oval(c,-12,-43,4,5,a.skin)
  // Swept fringe keeps a visible three-quarter face even at a desk.
  c.beginPath();c.moveTo(-17,-48);c.bezierCurveTo(-18,-69,21,-65,18,-47);c.quadraticCurveTo(10,-51,7,-57);c.quadraticCurveTo(0,-44,-17,-48);c.fillStyle=a.hair;c.fill();c.strokeStyle='#4b3025';c.stroke()
  if(a.cut==='curly')for(const dx of [-12,-5,3,11])oval(c,dx,-60,5,5,a.hair)
  const eye=(ex:number,ey:number)=>{if(p.doze){c.beginPath();c.moveTo(ex-2,ey);c.quadraticCurveTo(ex,ey+1.6,ex+2,ey);c.strokeStyle='#38291f';c.lineWidth=1.2;c.stroke()}else oval(c,ex,ey,1.6,2.3,'#38291f',false)}
  eye(4,-44);eye(13,-44)
  oval(c,0,-38,3.4,1.7,'#e79782',false);oval(c,14,-38,2.8,1.5,'#e79782',false)
  if(back){
    // At a desk we see the back of the head and a small turned profile.
    oval(c,-5,-47,13,16,a.hair)
    oval(c,11,-42,7,11,a.skin)
    eye(15,-44)
    oval(c,12,-37,2.5,1.5,'#e79782',false)
  }
  if(a.gear==='glasses'&&!back){round(c,0,-48,8,8,'#ffffff20',3);round(c,10,-48,7,8,'#ffffff20',3)}
  if(p.lead){c.fillStyle='#ffe08b';c.strokeStyle='#80511c';c.lineWidth=1.4;c.beginPath();c.moveTo(-8,-72);c.lineTo(-4,-68);c.lineTo(0,-75);c.lineTo(4,-68);c.lineTo(8,-72);c.lineTo(6,-64);c.lineTo(-6,-64);c.closePath();c.fill();c.stroke()}
  c.restore() // head
  if((p.mug||p.cup)&&!raised&&!p.scratch&&stretch<.3){round(c,rx-7,ry+1,9,10,'#fff0cf',2);oval(c,rx+3,ry+6,3,3,'#ead6ae')}
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
  const visible=scene.actors.filter(a=>!a.hidden),byKey=new Map(visible.map(a=>[a.key,a]))
  const pairs=time?pairsFor(scene.actors):new Map<string,OfficeLifePair>()
  const offsets=new Map<string,OfficeDrawnOffset>()
  for(const actor of visible.sort((a,b)=>a.y-b.y)) {
    const moving=Boolean(actor.pose?.walk||actor.pose?.climb)
    const waiting=actor.agent.status.startsWith('waiting_'),failed=actor.agent.status==='failed'
    const pair=pairs.get(actor.key),partner=pair&&byKey.get(pair.partnerKey)
    const life=officeLife(actor,time,{partnerDx:pair?.partnerDx,pairSeed:pair?.pairSeed,tripActive:actor.key===o.tripKey,greet:actor.key===o.greetKey,
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
    c.save();c.translate(actor.x+life.dx,actor.y);c.scale(scale,scale)
    drawOfficeAvatar(c,actor.appearance,0,0,t,{sit:!moving&&!life.stand,walk:life.walk,typing:o.live&&life.typing&&!moving,hand:o.live&&waiting,
      mug:actor.zone==='lounge'&&!moving,lead:actor.agent.role==='lead'||actor.pod,cup:life.cup,stretch:life.stretch,lean:life.lean,doze:life.doze,
      slump:life.slump,scratch:life.scratch,wave:life.wave,turn:life.turn,face:life.face,hop:life.hop,runtime:actor.agent.runtime,...actor.pose})
    if(life.mood){c.translate(0,-life.hop);drawMood(c,life.mood,t)}
    c.restore()
    offsets.set(actor.key,{dx:life.dx,dy:-life.hop*scale})
  }
  if(time)drawAmbient(c,scene,time,officeAmbient(o.date).night)
  return offsets
}
