import type {OfficeActor,OfficeScene} from './office-types'
import type {OfficeTrip} from './office-motion'
import {officeLifePairs,officeSeed} from './office-life'

export interface OfficeWorkExchange {
 kind:'assigned'|'sent'|'received'
 senderKey:string
 receiverKey:string
 label:string
 remote:boolean
 progress:number
}
export interface OfficeRestConversation {speakerKey:string;listenerKey:string}
const visible=(actor:OfficeActor)=>!actor.hidden&&!actor.pose?.inLift&&!actor.pose?.climb&&(actor.pose?.opacity??1)>.8

/** A status icon, never fabricated dialogue or a substitute for an actual delivery record. */
export function officeWorkExchange(trip:OfficeTrip|null,scene:OfficeScene,at:number):OfficeWorkExchange|null {
 if(!trip||at<trip.startedAt||at>=trip.endsAt)return null
 const kind=trip.event.kind
 if(kind!=='assigned'&&kind!=='sent'&&kind!=='received')return null
 const child=scene.actors.find(a=>a.key===trip.event.actorKey),parent=scene.actors.find(a=>a.key===trip.event.parentKey)
 if(!child||!parent||child.key===parent.key||child.parentKey!==parent.key||child.sessionId!==parent.sessionId||!visible(child)||!visible(parent))return null
 let start=trip.startedAt
 for(const segment of trip.segments){
  const end=start+segment.duration
  if(at<end){
   if(segment.kind!=='hold'||segment.liftPhase||segment.liftWait||segment.duration<1000||trip.meetingPartner&&!segment.meeting)return null
   return {kind,senderKey:kind==='assigned'?parent.key:child.key,receiverKey:kind==='assigned'?child.key:parent.key,
    label:kind==='assigned'?'Assigning work':kind==='sent'?'Report sent':'Report received',
    remote:child.floorId!==parent.floorId||Math.hypot(child.x-parent.x,child.y-parent.y)>scene.width*.28,
    progress:Math.max(0,Math.min(1,(at-start)/Math.max(1,segment.duration)))}
  }
  start=end
 }
 return null
}

/** Ambient social gestures have no quoted text and never update a task or message record. */
export function officeRestConversations(scene:OfficeScene,time:number,busyKeys:ReadonlySet<string>):OfficeRestConversation[] {
 if(time<=0)return []
 const resting=scene.actors.filter(a=>visible(a)&&a.zone==='lounge'&&['idle','done','cancelled'].includes(a.agent.status)&&!a.pose?.walk&&!busyKeys.has(a.key))
 const pairs=officeLifePairs(resting),actors=new Map(resting.map(a=>[a.key,a])),result:OfficeRestConversation[]=[]
 for(const a of resting){
  const pair=pairs.get(a.key),b=pair&&actors.get(pair.partnerKey)
  if(!pair||!b||a.key>b.key||Math.abs(a.x-b.x)>scene.width*.30)continue
  const phase=((time+officeSeed([a.key,b.key].sort().join('\0'))*20)%20+20)%20
  if(phase<2||phase>=6)continue
  const left=a.x<=b.x?a:b,right=left===a?b:a
  const speaker=Math.floor(phase-2)%2===0?left:right,listener=speaker===left?right:left
  result.push({speakerKey:speaker.key,listenerKey:listener.key})
  if(result.length===2)break
 }
 return result
}
