import {officeCollaboratorDisplayed} from './office-collaboration'
import {officeActorRenderScale} from './office-depth'
import type {OfficeActor,OfficeCollaborationMember,OfficeEvent,OfficeFloor,OfficeScene} from './office-types'

export const OFFICE_HOLOGRAM_MS=2600
const MAX_CUES=2,MAX_SEEN=256,MAX_EVENT_AGE_MS=15000
export interface OfficeHologramCue {
 eventId:string
 kind:'assigned'|'sent'|'received'
 actorKey:string
 parentKey:string
 taskId:string
 startedAt:number
 endsAt:number
}
/** View-local and disposable. Feed only officeEvents from observed source transitions. */
export interface OfficeHologramState {cues:readonly OfficeHologramCue[];seenEventIds:readonly string[]}
export interface OfficeHologramFrame {cue:OfficeHologramCue;member:OfficeCollaborationMember;x:number;y:number;scale:number;opacity:number}

function participants(cue:Pick<OfficeHologramCue,'actorKey'|'parentKey'|'taskId'|'kind'>,scene:OfficeScene):{parent:OfficeActor;floor:OfficeFloor;member:OfficeCollaborationMember}|null{
 const parent=scene.actors.find(a=>a.key===cue.parentKey)
 if(!parent||parent.agent.role!=='lead'||parent.hidden||parent.pose?.walk||parent.pose?.inLift||parent.pose?.climb||(parent.pose?.opacity??1)<.8||!Number.isFinite(parent.x)||!Number.isFinite(parent.y))return null
 const floor=scene.floors.find(f=>f.id===parent.floorId&&f.kind==='team'&&!f.constructing&&f.sessionId===parent.sessionId)
 if(!floor||scene.quietTeams.some(t=>t.sessionId===parent.sessionId))return null
 const member=floor.collaboration?.find(m=>m.key===cue.actorKey&&m.remote)
 if(!member||member.key===parent.key||member.sessionId!==parent.sessionId||member.agent.parentId!==parent.agent.id||!member.task||member.task.id!==cue.taskId||member.task.childId!==member.agent.id||member.task.parentId!==parent.agent.id||member.agent.status==='cancelled'||member.task.status==='cancelled')return null
 // A real terminal delivery may leave the roster immediately. Preserve only its
 // short source-triggered projection while the same remote task still exists.
 const terminalDelivery=(member.task.status==='done'||member.task.status==='failed')&&
  ((cue.kind==='sent'&&(member.task.delivery==='delivered'||member.task.delivery==='received'))||
   (cue.kind==='received'&&member.task.delivery==='received'))
 if(!officeCollaboratorDisplayed(member)&&!terminalDelivery)return null
 // IDs, session and ancestry must come from the same source rows, never a display name.
 if(parent.key!==JSON.stringify([parent.sessionId,parent.agent.id])||member.key!==JSON.stringify([member.sessionId,member.agent.id]))return null
 return {parent,floor,member}
}

/** clockMs is a caller-owned cue clock; wallNowMs is used only for source freshness. */
export function createOfficeHologram(event:OfficeEvent,scene:OfficeScene,clockMs:number,wallNowMs:number):OfficeHologramCue|null{
 if(event.kind!=='assigned'&&event.kind!=='sent'&&event.kind!=='received')return null
 if(!event.parentKey||!event.taskId||!Number.isFinite(clockMs)||!Number.isFinite(event.at)||!Number.isFinite(wallNowMs)||event.at>wallNowMs||wallNowMs-event.at>MAX_EVENT_AGE_MS)return null
 if(event.sourceAt===null||event.sourceAt===undefined||!Number.isFinite(event.sourceAt)||event.sourceAt>wallNowMs||wallNowMs-event.sourceAt>MAX_EVENT_AGE_MS)return null
 const cue:OfficeHologramCue={eventId:event.id,kind:event.kind,actorKey:event.actorKey,parentKey:event.parentKey,taskId:event.taskId,startedAt:clockMs,endsAt:clockMs+OFFICE_HOLOGRAM_MS}
 return participants(cue,scene)?cue:null
}

export function pruneOfficeHolograms(state:OfficeHologramState,scene:OfficeScene,clockMs:number):OfficeHologramState{
 const cues=state.cues.filter(c=>clockMs>=c.startedAt&&clockMs<c.endsAt&&participants(c,scene)).slice(-MAX_CUES)
 return {...state,cues}
}

/** Latest real exchange wins per Lead. Remember IDs after expiry to avoid replay on rerender. */
export function mergeOfficeHolograms(state:OfficeHologramState,events:readonly OfficeEvent[],scene:OfficeScene,clockMs:number,wallNowMs:number):OfficeHologramState{
 let cues=[...pruneOfficeHolograms(state,scene,clockMs).cues]
 const seen=new Set(state.seenEventIds)
 for(const event of events){
  if(seen.has(event.id))continue
  seen.add(event.id)
  const cue=createOfficeHologram(event,scene,clockMs,wallNowMs)
  if(cue)cues=[...cues.filter(c=>c.parentKey!==cue.parentKey),cue].slice(-MAX_CUES)
 }
 return {cues,seenEventIds:[...seen].slice(-MAX_SEEN)}
}

/** Render-only geometry: never adds an actor, hit target or physical trip. */
export function officeHologramFrames(state:OfficeHologramState,scene:OfficeScene,clockMs:number,animate:boolean):OfficeHologramFrame[]{
 return pruneOfficeHolograms(state,scene,clockMs).cues.flatMap(cue=>{
  const found=participants(cue,scene)
  if(!found)return []
  const {parent,member}=found,depth=officeActorRenderScale(scene,parent),scale=depth*.55
  const margin=24*scale,left=parent.x-44*depth,right=parent.x+44*depth
  const candidate=right+margin<=scene.width?right:left
  const x=Math.max(margin,Math.min(scene.width-margin,candidate)),y=parent.y+2*depth
  const fade=animate?Math.min(1,(clockMs-cue.startedAt)/160,(cue.endsAt-clockMs)/500):1
  return [{cue,member,x,y,scale,opacity:.62*Math.max(0,fade)}]
 })
}
