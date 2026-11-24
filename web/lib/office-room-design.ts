import type {OfficeFloor,OfficePoint,OfficeWorkStation} from './office-types'
// Kept local so station adapters can import this pure module without a cycle.
const officeRoomSeed=(id:string)=>[...id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)

export type OfficeRoomTheme='studio'|'operations'|'research'|'quality'
export interface OfficeRoomDesign {theme:OfficeRoomTheme;variant:number;accent:string;detail:number;large:boolean}
export interface OfficeRoomStation extends OfficePoint {kind:Exclude<OfficeWorkStation,'planning'>;width:number;height:number;facing:'front'|'left'|'right';work:OfficePoint;depth:number;surface?:OfficePoint&{span:number}}
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
const largeRoom=(floor:OfficeFloor,width:number)=>floor.room==='room-stations-large'||(!floor.desktopArt&&(floor.height??width*.5625)>width*.65)
/** Surface centers calibrated to the usable book/keyboard/tray in the view atlas. */
export function roomStationSurface(station:Pick<OfficeRoomStation,'kind'|'facing'|'x'|'y'|'width'|'height'|'surface'>){
 if(station.surface)return station.surface
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
/** Two workers share the Build top, with room for both bodies along its near edge. */
export function roomBuildWorkpoints(station:OfficeRoomStation,width:number){
 const surface=roomStationSurface(station)
 const first=surface.x<=station.x?-1:1
 const halfGap=width*(24/450),center=Math.max(width*.07+halfGap,station.x)
 return [first,-first].map(side=>({
  feet:{x:center+side*halfGap,y:station.work.y},
  surface:{...surface,x:station.x+side*station.width*.24},
 }))
}
// Normalized coordinates of the furniture feet and worktops in the painted Desktop plate.
const desktopStations=[
 {kind:'research',x:.24,feet:.52,top:.422,width:.23,seated:false,points:[[.161,.527,.209]]},
 {kind:'quality',x:.51,feet:.52,top:.434,width:.26,seated:true,seatTop:.465,points:[[.448,.529,.448],[.565,.529,.549]]},
 {kind:'build',x:.235,feet:.898,top:.782,width:.34,seated:false,points:[[.162,.918,.208],[.285,.918,.287]]},
 {kind:'terminal',x:.625,feet:.90,top:.787,width:.30,seated:true,seatTop:.825,points:[[.582,.916,.557],[.714,.916,.676]]},
] as const
export function roomDesktopPlanningDesk(floor:OfficeFloor,width:number){
 const height=floor.height??width*.72
 const left=width*.008,top=floor.y+height*.244,deskWidth=width*.105,deskHeight=height*.30
 return {left,top,width:deskWidth,height:deskHeight,
  feet:{x:left+deskWidth*.747,y:top+deskHeight*.992},
  surface:{x:left+deskWidth*.55,y:top+deskHeight*.603,span:deskWidth*.075},
  seated:true,seatY:top+deskHeight*.752}
}
/** The Desktop plate has its own painted stools, monitors, books, and devices. */
export function roomDesktopWorkpoints(floor:OfficeFloor,width:number,kind:OfficeWorkStation){
 if(!floor.desktopArt)return []
 const height=floor.height??width*.72
 if(kind==='planning')return [roomDesktopPlanningDesk(floor,width)]
 const station=desktopStations.find(station=>station.kind===kind)
 if(!station)return []
 return station.points.map(([x,y,surfaceX])=>({
  feet:{x:width*x,y:floor.y+height*y},
  surface:{x:width*surfaceX,y:floor.y+height*station.top,span:width*.024},
  seated:station.seated,
  seatY:'seatTop' in station?floor.y+height*station.seatTop:undefined,
 }))
}
/** Floor baselines preserve the painted room with shallow tiers or two deep zones. */
export function roomStationLayout(floor:OfficeFloor,width:number):OfficeRoomStation[] {
 if(floor.desktopArt){
  const height=floor.height??width*.72
  return desktopStations.map((station,index)=>{
   const x=width*station.x,y=floor.y+height*station.feet
   const {feet,surface}=roomDesktopWorkpoints(floor,width,station.kind)[0]
   return {kind:station.kind,x,y,width:width*station.width,height:height*(station.feet-station.top+(index<2?.14:.18)),facing:'front',
    work:feet,depth:index<2?0:1,surface}
  })
 }
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
  const [px,py]=positions[i],depth=(py-back)/(front-back)
  const size=width*.18*(.82+.18*depth)
  const facing=facings[i],x=width*px,y=floor.y+width*py
  const surface=roomStationSurface({kind,facing,x,y,width:size,height:size})
  const work={x:surface.x,y:y+width*.009}
  return {kind,x,y,width:size,height:size,facing,work,depth}
 })
}
export function roomActorSpots(floor:OfficeFloor,width:number):OfficePoint[]{
 if(floor.desktopArt){
  const stations=roomStationLayout(floor,width),offset=width*.052
  return largeRoom(floor,width)?stations.flatMap(({work})=>[{x:work.x-offset,y:work.y},{x:work.x+offset,y:work.y}]):stations.map(({work})=>work)
 }
 if(!largeRoom(floor,width))return [.095,.255,.415,.575].map((x,i)=>({x:width*x,y:floor.y+width*(i%2?.435:.375)}))
 return [.43,.60].flatMap((row,j)=>[.12,.28,.44,.60].map((x,i)=>({x:width*(x+(j?.035:0)),y:floor.y+width*(row+(i%2)*.012)})))
}
/** Nearby clear body positions retain each tool's usable edge and floor depth. */
export function roomStationSpots(floor:OfficeFloor,width:number,kind:OfficeWorkStation):OfficePoint[]{
 const station=roomStationLayout(floor,width).find(s=>s.kind===kind),large=largeRoom(floor,width)
 const {x,y}=station?.work??{x:width*.39,y:floor.y+width*(large?.43:.40)}
 const height=floor.height??width*.5625
 const maxFeet=floor.y+(floor.desktopArt?height*.94:height-width*.118)
 const nearby=[0,-.06,.06,-.12,.12].map((dx,i)=>({x:Math.max(width*.07,Math.min(width*.68,x+width*dx)),y:Math.min(maxFeet,y+(i>2?width*(large?.04:.004):0))}))
 if(floor.desktopArt)return [...roomDesktopWorkpoints(floor,width,kind).map(point=>point.feet),...nearby]
 return station?.kind==='build'?[...roomBuildWorkpoints(station,width).map(point=>point.feet),...nearby]:nearby
}
export function roomLeadRestPoint(floor:OfficeFloor,width:number):OfficePoint {
 if(floor.desktopArt)return {x:width*.68,y:floor.y+(floor.height??width*.72)*.63}
 return {x:width*.745,y:floor.y+width*(largeRoom(floor,width)?.39:.40)}
}
/** The visiting actor meets the Lead across the Desktop conversation table. */
export function roomLeadMeetingPoint(floor:OfficeFloor,width:number):OfficePoint {
 const lead=roomLeadRestPoint(floor,width)
 return floor.desktopArt?{x:width*.773,y:lead.y}:lead
}

