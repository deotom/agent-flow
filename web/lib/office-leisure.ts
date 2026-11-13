import type { OfficeBreakRoom, OfficeFloor, OfficeScene, OfficeLeisureAction, OfficePoint } from './office-types'
import type { OfficeTrip,OfficeTripSegment } from './office-motion'
import { officeLanding,officeNavigation } from './office-navigation'
export const OFFICE_OBJECT_NAMES:Record<OfficeLeisureAction,string>={coffee:'Coffee break',book:'Reading corner',game:'Game table',water:'Garden plants',music:'Music corner',snack:'Picnic snacks'}
const spots:Record<OfficeBreakRoom,OfficeLeisureAction[]>={
 'room-break':['coffee','coffee','book','book','coffee','game','game','coffee','book'],
 'room-break-game':['game','game','game','coffee','game','game','game'],
 'room-break-garden':['coffee','coffee','book','book','book','water','water'],
 'room-break-reading':['book','book','book','coffee','book','book','coffee'],
}
export const officeLeisureForSpot=(room:OfficeBreakRoom,index:number)=>spots[room][index%spots[room].length]
export function officeLeisureObjects(floor:OfficeFloor,width:number){
 const h=floor.height??width*.5625
 const list:(readonly [OfficeLeisureAction,number,number])[]=floor.kind==='lounge'?[['snack',.34,.61],['music',.50,.61],['coffee',.78,.58]]:
 floor.room==='room-break-game'?[['game',.09,.72],['coffee',.63,.70]]:
 floor.room==='room-break-garden'?[['water',.84,.73],['book',.475,.60],['coffee',.22,.64]]:
 floor.room==='room-break-reading'?[['book',.29,.645],['coffee',.77,.66]]:[['coffee',.15,.74],['book',.70,.6],['game',.54,.75]]
 return list.map(([kind,x,y])=>({kind,x:x*width,y:floor.y+y*h}))
}
export function nearestLeisureActor(scene:OfficeScene,floor:OfficeFloor,point:OfficePoint){
 return scene.actors.filter(a=>a.floorId===floor.id&&a.zone==='lounge'&&!a.hidden&&['idle','done','cancelled','failed'].includes(a.agent.status))
   .sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]??null
}
/** Decorative object use, with a real walk to the prop and back; never changes T3 state. */
export function createOfficeLeisureTrip(scene:OfficeScene,actorKey:string,object:OfficePoint&{kind:OfficeLeisureAction},now:number,from?:OfficePoint):OfficeTrip|null {
 const actor=scene.actors.find(a=>a.key===actorKey)
 if(!actor||actor.hidden||actor.zone!=='lounge'||!['idle','done','cancelled','failed'].includes(actor.agent.status))return null
 const nav=officeNavigation(scene),line=officeLanding(scene,actor.floorId)
 if(!line)return null
 const segments:OfficeTripSegment[]=[],home={x:actor.x,y:actor.y}
 let cursor=from?{...from}:{...home}
 const walk=(to:OfficePoint)=>{const d=Math.hypot(to.x-cursor.x,to.y-cursor.y);if(d>.01){segments.push({from:{...cursor},to:{...to},duration:Math.max(150,d/(65*nav.scale)*1000),kind:'walk'});cursor={...to}}}
 walk({x:cursor.x,y:line.y});walk({x:object.x,y:line.y});walk(object)
 segments.push({from:{...cursor},to:{...cursor},duration:4500,kind:'hold'})
 walk({x:cursor.x,y:line.y});walk({x:home.x,y:line.y});walk(home)
 return {event:{id:JSON.stringify(['leisure',actor.key,object.kind,now]),kind:'activity',actorKey:actor.key,parentKey:null,at:now},actorKey:actor.key,actor,segments,startedAt:now,endsAt:now+segments.reduce((n,s)=>n+s.duration,0),caption:`is enjoying ${OFFICE_OBJECT_NAMES[object.kind].toLowerCase()}`,shaftX:nav.shaftX,rungPitch:nav.rungPitch}
}
