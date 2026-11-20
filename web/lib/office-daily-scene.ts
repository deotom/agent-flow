import type { OfficeActor, OfficeFloor, OfficeScene } from './office-types'
export const OFFICE_CANTEEN_ID='daily-canteen'
export const OFFICE_DAILY_SEATS= [[.338,.61],[.495,.61],[.64,.57],[.78,.58]] as const
export const OFFICE_CANTEEN_SEATS= [[.30,.70],[.45,.70],[.63,.70],[.78,.70]] as const
/** Physical seat ownership, rather than a head count, is shared by parties and meals. */
export function officeGardenOccupiedSeats(scene:OfficeScene,excludeKeys:ReadonlySet<string>=new Set()):Set<number> {
 const surface=scene.floors.find(f=>f.kind==='lounge'),seats=new Set<number>()
 if(!surface)return seats
 const height=surface.height??scene.width*.5625
 for(const actor of scene.actors){
  if(actor.hidden||actor.floorId!==surface.id||excludeKeys.has(actor.key))continue
  let nearest=0,distance=Infinity
  OFFICE_DAILY_SEATS.forEach(([x,y],i)=>{const d=Math.hypot(actor.x-x*scene.width,actor.y-surface.y-y*height);if(d<distance){nearest=i;distance=d}})
  seats.add(nearest)
 }
 return seats
}
/** Start from the source scene every frame. Guest positions are purely visual clones. */
export function projectOfficeDailyScene(base:OfficeScene,state:{canteenOpen:boolean;guests?:readonly OfficeActor[]}):OfficeScene {
 const guests=state.guests??[],open=state.canteenOpen||guests.some(a=>a.floorId===OFFICE_CANTEEN_ID)
 // Runtime inputs can already contain the projected room. Removing only its
 // art/floor leaves its offset and total height behind until Office remounts.
 const closing=!open&&base.floors.find(f=>f.id===OFFICE_CANTEEN_ID)
 if(closing){
  const offset=(closing.height??base.width*864/1536)*.90
  const floors=base.floors.filter(f=>f.id!==OFFICE_CANTEEN_ID).map(f=>({...f,y:f.y>=closing.y?f.y-offset:f.y}))
  const byId=new Map(floors.map(f=>[f.id,f]))
  const actors=base.actors.map(a=>{const old=base.floors.find(f=>f.id===a.floorId),next=byId.get(a.floorId);return old&&next?{...a,y:a.y+next.y-old.y}:a})
  base={...base,floors,actors,height:base.height-offset}
 }
 const floors=base.floors.map(f=>({...f,actorKeys:[...f.actorKeys]})),overrides=new Map(guests.map(a=>[a.key,a]))
 let height=base.height
 if(open&&!floors.some(f=>f.id===OFFICE_CANTEEN_ID)) {
  const roomHeight=base.width*864/1536,offset=roomHeight*.90
  const quietIndex=floors.findIndex(f=>f.kind==='quiet')
  const y=quietIndex>=0?floors[quietIndex].y:Math.max(...floors.filter(f=>!f.annexOf).map(f=>f.y+(f.height??roomHeight)*.90),0)
  const canteen:OfficeFloor={id:OFFICE_CANTEEN_ID,sessionId:null,title:'Canteen',subtitle:'Lunch break',color:'#ba956b',y,height:roomHeight,actorKeys:[],kind:'break',room:'room-canteen'}
  if(quietIndex>=0){for(let i=quietIndex;i<floors.length;i++)floors[i].y+=offset;floors.splice(quietIndex,0,canteen)}else floors.push(canteen)
  height+=offset
 }
 const actors=base.actors.map(a=>({...a,...overrides.get(a.key)}))
 for(const guest of guests)if(!actors.some(a=>a.key===guest.key))actors.push({...guest})
 // Reconcile membership only for guests; retain unrelated source bookkeeping.
 for(const floor of floors){floor.actorKeys=floor.actorKeys.filter(k=>!overrides.has(k));for(const guest of guests)if(guest.floorId===floor.id&&!floor.actorKeys.includes(guest.key))floor.actorKeys.push(guest.key)}
 return {...base,height,floors,actors}
}
