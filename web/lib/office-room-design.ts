import type {OfficeFloor,OfficePoint,OfficeWorkStation} from './office-types'
// Kept local so station adapters can import this pure module without a cycle.
const officeRoomSeed=(id:string)=>[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)

export type OfficeRoomTheme='studio'|'operations'|'research'|'quality'
export interface OfficeRoomDesign {theme:OfficeRoomTheme;variant:number;accent:string;detail:number;large:boolean}
export interface OfficeRoomStation extends OfficePoint {kind:Exclude<OfficeWorkStation,'planning'>;width:number;height:number;facing:'front'|'left'|'right';work:OfficePoint;depth:number}
// The workroom shell is 1000 × 563. Only the floorboards stretch in deeper rooms.
export const OFFICE_WORKROOM_WALL_CROP=.64
export const OFFICE_WORKROOM_WALL_DEPTH=OFFICE_WORKROOM_WALL_CROP*563/1000
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
/** Surface centers calibrated to the usable book/keyboard/tray in the view atlas. */
export function roomStationSurface(station:Pick<OfficeRoomStation,'kind'|'facing'|'x'|'y'|'width'|'height'>){
 const angled=station.facing!=='front',right=station.facing==='right'
 const offsets:Record<OfficeRoomStation['kind'],readonly[number,number,number]>={
  research:[angled?(right?-.25:.25):.20,angled?.29:.35,.07],
  build:[angled?(right?.10:-.10):-.17,angled?.36:.31,.065],
  terminal:[angled?(right?-.25:.25):.25,angled?.34:.40,.055],
  quality:[angled?(right?.05:-.05):0,angled?.36:.34,.065],
 }
 const [dx,dy,span]=offsets[station.kind]
 return{x:station.x+station.width*dx,y:station.y-station.height*dy,span:station.width*span}
}
/** Floor baselines preserve the painted room with shallow tiers or two deep zones. */
export function roomStationLayout(floor:OfficeFloor,width:number):OfficeRoomStation[] {
 const design=roomDesignFor(floor)
 const groups:Record<OfficeRoomTheme,OfficeRoomStation['kind'][]>={studio:['build','research','quality','terminal'],operations:['terminal','quality','build','research'],research:['research','build','terminal','quality'],quality:['quality','research','build','terminal']}
 const order=[...groups[design.theme]]
 // Theme's main bench stays in the first zone; secondary tools vary between projects.
 if(design.variant&1)[order[2],order[3]]=[order[3],order[2]]
 const large=largeRoom(floor,width)
 const plans:Record<OfficeRoomTheme,number[][]>={
  studio:large?[[.17,.40],[.49,.40],[.23,.565],[.55,.565]]:[[.12,.366],[.31,.432],[.49,.366],[.64,.405]],
  operations:large?[[.18,.40],[.53,.40],[.16,.565],[.49,.565]]:[[.12,.405],[.31,.366],[.49,.432],[.64,.366]],
  research:large?[[.23,.40],[.54,.40],[.17,.565],[.49,.565]]:[[.12,.432],[.31,.366],[.49,.405],[.64,.366]],
  quality:large?[[.17,.40],[.49,.40],[.24,.565],[.56,.565]]:[[.12,.366],[.31,.405],[.49,.366],[.64,.432]],
 }
 const positions=plans[design.theme]
 const orientations:Record<OfficeRoomTheme,OfficeRoomStation['facing'][]>={studio:['right','left','front','left'],operations:['front','right','left','front'],research:['right','front','left','front'],quality:['left','right','front','front']}
 const facings=orientations[design.theme]
 const back=large?.40:.366,front=large?.565:.432
 return order.map((kind,i)=>{
  const [px,py]=positions[i],depth=(py-back)/(front-back),size=width*.18*(.82+.18*depth)
  const facing=facings[i],x=width*px,y=floor.y+width*py
  const surface=roomStationSurface({kind,facing,x,y,width:size,height:size})
  const work={x:surface.x,y:y+width*.009}
  return {kind,x,y,width:size,height:size,facing,work,depth}
 })
}
export function roomActorSpots(floor:OfficeFloor,width:number):OfficePoint[]{
 if(!largeRoom(floor,width))return [.095,.255,.415,.575].map((x,i)=>({x:width*x,y:floor.y+width*(i%2?.435:.375)}))
 return [.43,.60].flatMap((row,j)=>[.12,.28,.44,.60].map((x,i)=>({x:width*(x+(j?.035:0)),y:floor.y+width*(row+(i%2)*.012)})))
}
/** Nearby clear body positions retain each tool's usable edge and floor depth. */
export function roomStationSpots(floor:OfficeFloor,width:number,kind:OfficeWorkStation):OfficePoint[]{
 const station=roomStationLayout(floor,width).find(s=>s.kind===kind),large=largeRoom(floor,width)
 const {x,y}=station?.work??{x:width*.39,y:floor.y+width*(large?.43:.40)}
 const maxFeet=floor.y+(floor.height??width*.5625)-width*.118
 return [0,-.06,.06,-.12,.12].map((dx,i)=>({x:Math.max(width*.07,Math.min(width*.68,x+width*dx)),y:Math.min(maxFeet,y+(i>2?width*(large?.04:.004):0))}))
}
export function roomLeadRestPoint(floor:OfficeFloor,width:number):OfficePoint {
 return {x:width*.745,y:floor.y+width*(largeRoom(floor,width)?.39:.40)}
}

