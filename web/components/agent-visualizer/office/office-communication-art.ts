import type {OfficeActor,OfficeScene} from '../../../lib/office-types'
import type {OfficeRestConversation,OfficeWorkExchange} from '../../../lib/office-communication'

type Ctx=CanvasRenderingContext2D
/** Short, local status bubbles; there is deliberately no task/prompt/result text. */
export function drawOfficeCommunications(c:Ctx,scene:OfficeScene,time:number,exchange:OfficeWorkExchange|null,chats:readonly OfficeRestConversation[]){
 const scale=scene.width/450,actors=new Map(scene.actors.filter(a=>!a.hidden&&!a.pose?.inLift).map(a=>[a.key,a]))
 const bubble=(actor:OfficeActor,text:string|null,colour='#fff0c9')=>{
  const floor=scene.floors.find(f=>f.id===actor.floorId)
  if(!floor)return
  c.save();c.font=`600 ${10.5*scale}px "Segoe UI",sans-serif`
  const width=text?Math.min(104*scale,c.measureText(text).width+16*scale):29*scale,height=19*scale
  const x=Math.max(5*scale,Math.min(scene.width-width-5*scale,actor.x-width/2))
  const y=Math.max(floor.y+24*scale,actor.y-94*scale)
  c.fillStyle=colour;c.strokeStyle='#8b653c';c.lineWidth=1.2*scale
  c.beginPath();c.roundRect(x,y,width,height,5*scale);c.fill();c.stroke()
  c.beginPath();const tail=Math.max(x+6*scale,Math.min(x+width-6*scale,actor.x));c.moveTo(tail-3*scale,y+height);c.lineTo(tail,y+height+4*scale);c.lineTo(tail+3*scale,y+height);c.fill();c.stroke()
  c.fillStyle='#523d2b';c.textAlign='center';c.textBaseline='middle'
  if(text)c.fillText(text,x+width/2,y+height/2,width-8*scale)
  else for(let i=0;i<3;i++){c.beginPath();c.arc(x+width/2+(i-1)*6*scale,y+height/2+Math.sin(time*6-i)*1.4*scale,1.5*scale,0,Math.PI*2);c.fill()}
  c.restore()
 }
 if(exchange){
  const sender=actors.get(exchange.senderKey),receiver=actors.get(exchange.receiverKey)
  const speaker=exchange.kind==='received'?receiver:sender
  if(speaker&&((sender&&receiver)||exchange.remote)){
   bubble(speaker,exchange.label,exchange.kind==='received'?'#d9ead2':'#ffedb9')
   if(!exchange.remote&&sender&&receiver){
    const p=exchange.progress,x=sender.x+(receiver.x-sender.x)*p,y=sender.y+(receiver.y-sender.y)*p-39*scale-Math.sin(p*Math.PI)*13*scale
    c.save();c.fillStyle='#ead8a6';c.strokeStyle='#785735';c.lineWidth=scale;c.beginPath();c.roundRect(x-5*scale,y-3.5*scale,10*scale,7*scale,scale);c.fill();c.stroke()
    c.beginPath();c.moveTo(x-5*scale,y-3.5*scale);c.lineTo(x,y);c.lineTo(x+5*scale,y-3.5*scale);c.stroke();c.restore()
   }
  }
 }
 for(const chat of chats){const speaker=actors.get(chat.speakerKey);if(speaker&&speaker.key!==exchange?.senderKey&&speaker.key!==exchange?.receiverKey)bubble(speaker,null)}
}
