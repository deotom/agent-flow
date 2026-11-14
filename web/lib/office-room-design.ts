import type {OfficeFloor,OfficePoint,OfficeWorkStation} from './office-types'
// Kept local so station adapters can import this pure module without a cycle.
const officeRoomSeed=(id:string)=>[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)

export type OfficeRoomTheme='studio'|'operations'|'research'|'quality'
export interface OfficeRoomDesign {theme:OfficeRoomTheme;variant:number;accent:string;detail:number;large:boolean}
export interface OfficeRoomStation extends OfficePoint {kind:Exclude<OfficeWorkStation,'planning'>;width:number;height:number}
const themes:readonly OfficeRoomTheme[]=['studio','operations','research','quality']
const hue:Record<OfficeRoomTheme,number>={studio:22,operations:169,research:82,quality:217}
/** Title is the stable mission/project label. Tool activity and live counters never affect decor. */
export function roomDesignFor(floor:OfficeFloor):OfficeRoomDesign {
 const seed=officeRoomSeed(floor.sessionId??floor.id),mission=floor.title.toLowerCase()
 const theme:OfficeRoomTheme=/test|quality|verif|\bqa\b|audit|ตรวจ/.test(mission)?'quality':/design|studio|\bart\b|illustrat|creative|\b(ui|ux)\b|frontend|ออกแบบ/.test(mission)?'studio':/research|analys|investigat|document|learn|วิจัย/.test(mission)?'research':/operat|deploy|server|infra|release|pipeline|monitor|\bapi\b|backend|vendor|ระบบ/.test(mission)?'operations':themes[seed%themes.length]
 const accent=`hsl(${hue[theme]+(seed>>>8)%21-10} ${29+(seed>>>14)%12}% ${32+(seed>>>19)%9}%)`
 return {theme,variant:seed%12,accent,detail:(seed>>>12)%4,large:floor.room==='room-stations-large'||(floor.height??0)>.65*450}
}
const largeRoom=(floor:OfficeFloor,width:number)=>floor.room==='room-stations-large'||(floor.height??width*.5625)>width*.65
/** Same-sized furniture in one row, or two staggered work zones on an extended wood floor. */
export function roomStationLayout(floor:OfficeFloor,width:number):OfficeRoomStation[] {
 const design=roomDesignFor(floor)
 const groups:Record<OfficeRoomTheme,OfficeRoomStation['kind'][]>={studio:['build','research','quality','terminal'],operations:['terminal','quality','build','research'],research:['research','build','terminal','quality'],quality:['quality','research','build','terminal']}
 const order=[...groups[design.theme]]
 // Theme's main bench stays in the first zone; secondary tools vary between projects.
 if(design.variant&1)[order[2],order[3]]=[order[3],order[2]]
 const large=largeRoom(floor,width),h=floor.height??width*.5625
 return order.map((kind,i)=>({kind,x:width*(large?(.18+(i%2)*.32+(i>1?.035:0)):(.11+.185*i)),y:floor.y+(large?width*(i<2?.40:.56):h*.74),width:width*.18,height:width*.18}))
}
export function roomActorSpots(floor:OfficeFloor,width:number):OfficePoint[]{
 const h=floor.height??width*.5625
 if(!largeRoom(floor,width))return [.095,.255,.415,.575].map(x=>({x:width*x,y:floor.y+h*.79}))
 return [.43,.60].flatMap((row,j)=>[.12,.28,.44,.60].map((x,i)=>({x:width*(x+(j?.035:0)),y:floor.y+width*(row+(i%2)*.012)})))
}
/** Candidate body positions allow the allocator to move vertically as well as sideways. */
export function roomStationSpots(floor:OfficeFloor,width:number,kind:OfficeWorkStation):OfficePoint[]{
 const station=roomStationLayout(floor,width).find(s=>s.kind===kind)
 const x=station?.x??width*.39,y=(station?.y??floor.y+width*.43)+width*.025
 if(!largeRoom(floor,width))return [-.045,.045,-.09,.09].map(dx=>({x:Math.max(width*.07,Math.min(width*.76,x+width*dx)),y}))
 return [-.06,.06,-.105,.105].map((dx,i)=>({x:Math.max(width*.07,Math.min(width*.76,x+width*dx)),y:Math.min(floor.y+(floor.height??width*.75)-width*.125,y+(i>1?width*.04:0))}))
}
export function roomLeadRestPoint(floor:OfficeFloor,width:number):OfficePoint {
 return {x:width*.745,y:floor.y+width*(largeRoom(floor,width)?.39:.40)}
}

