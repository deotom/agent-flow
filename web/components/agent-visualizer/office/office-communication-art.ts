import type {OfficeActor,OfficeScene} from '../../../lib/office-types'
import type {OfficeRestConversation,OfficeWorkExchange} from '../../../lib/office-communication'
import {officeActorRenderScale} from '../../../lib/office-depth'

type Ctx=CanvasRenderingContext2D
/** Short, local status bubbles; there is deliberately no task/prompt/result text. */
export function drawOfficeCommunications(c:Ctx,scene:OfficeScene,time:number,exchange:OfficeWorkExchange|null,chats:readonly OfficeRestConversation[],scaleFor=(actor:OfficeActor)=>officeActorRenderScale(scene,actor)){
 const scale=scene.width/450,actors=new Map(scene.actors.filter(a=>!a.hidden&&!a.pose?.inLift).map(a=>[a.key,a]))
 const bubble=(actor:OfficeActor,text:string|null,colour='#fff3d4')=>{
  const floor=scene.floors.find(f=>f.id===actor.floorId)
  if(!floor)return
  c.save();c.font=`600 ${10.5*scale}px "Segoe UI",sans-serif`
  const width=text?Math.min(104*scale,c.measureText(text).width+16*scale):29*scale,height=19*scale
  const x=Math.max(5*scale,Math.min(scene.width-width-5*scale,actor.x-width/2))
  const y=Math.max(floor.y+24*scale,actor.y-74*scaleFor(actor)-20*scale)
  const r=Math.min(5*scale,height/2,width/2)
  const tailX=Math.max(x+r+3.5*scale,Math.min(x+width-r-3.5*scale,actor.x))
  const tipX=Math.max(x+4*scale,Math.min(x+width-4*scale,actor.x)),tipY=y+height+4.2*scale
  const traceBubble=(dy=0)=>{
   c.beginPath()
   c.moveTo(x+r,y+dy)
   c.lineTo(x+width-r,y+dy)
   c.quadraticCurveTo(x+width,y+dy,x+width,y+r+dy)
   c.lineTo(x+width,y+height-r+dy)
   c.quadraticCurveTo(x+width,y+height+dy,x+width-r,y+height+dy)
   c.lineTo(tailX+3.2*scale,y+height+dy)
   c.lineTo(tipX,tipY+dy)
   c.lineTo(tailX-3.2*scale,y+height+dy)
   c.lineTo(x+r,y+height+dy)
   c.quadraticCurveTo(x,y+height+dy,x,y+height-r+dy)
   c.lineTo(x,y+r+dy)
   c.quadraticCurveTo(x,y+dy,x+r,y+dy)
   c.closePath()
  }
  traceBubble(1.4*scale);c.fillStyle='rgba(36,22,12,0.22)';c.fill()
  traceBubble(0);c.fillStyle=colour;c.fill()
  c.strokeStyle='#7d5a37';c.lineWidth=1.1*scale;c.stroke()
  c.beginPath();c.moveTo(x+r,y+1.1*scale);c.lineTo(x+width-r,y+1.1*scale)
  c.strokeStyle='rgba(255,252,238,0.65)';c.lineWidth=.9*scale;c.stroke()
  c.fillStyle='#523d2b';c.textAlign='center';c.textBaseline='middle'
  if(text)c.fillText(text,x+width/2,y+height/2,width-8*scale)
  else for(let i=0;i<3;i++){c.beginPath();c.arc(x+width/2+(i-1)*6*scale,y+height/2+Math.sin(time*6-i)*1.4*scale,1.5*scale,0,Math.PI*2);c.fill()}
  c.restore()
 }
 if(exchange){
  const sender=actors.get(exchange.senderKey),receiver=actors.get(exchange.receiverKey)
  const speaker=exchange.kind==='received'?receiver:sender
  if(speaker&&((sender&&receiver)||exchange.remote)){
   bubble(speaker,exchange.label,exchange.kind==='received'?'#dfeed6':'#fff3d4')
   if(!exchange.remote&&sender&&receiver){
    const p=exchange.progress,x=sender.x+(receiver.x-sender.x)*p,fromY=sender.y-39*scaleFor(sender),toY=receiver.y-39*scaleFor(receiver),y=fromY+(toY-fromY)*p-Math.sin(p*Math.PI)*13*scale
    c.save();c.translate(x,y)
    c.fillStyle='rgba(36,22,12,0.22)';c.beginPath();c.ellipse(0,5*scale,5*scale,1.5*scale,0,0,Math.PI*2);c.fill()
    c.rotate(Math.cos(p*Math.PI)*.16)
    c.fillStyle='#f2e2b8';c.strokeStyle='#755331';c.lineWidth=.95*scale
    c.beginPath();c.roundRect(-5.2*scale,-3.6*scale,10.4*scale,7.2*scale,1.2*scale);c.fill();c.stroke()
    c.beginPath();c.moveTo(-5.1*scale,-3.4*scale);c.lineTo(0,.5*scale);c.lineTo(5.1*scale,-3.4*scale);c.closePath()
    c.fillStyle='#e3cd95';c.fill();c.stroke()
    c.beginPath();c.ellipse(0,.5*scale,1.4*scale,1.4*scale,0,0,Math.PI*2);c.fillStyle='#b84a39';c.fill()
    c.beginPath();c.ellipse(-.4*scale,.1*scale,.45*scale,.45*scale,0,0,Math.PI*2);c.fillStyle='#e58875';c.fill()
    c.restore()
   }
  }
 }
 for(const chat of chats){const speaker=actors.get(chat.speakerKey);if(speaker&&speaker.key!==exchange?.senderKey&&speaker.key!==exchange?.receiverKey)bubble(speaker,null)}
}
