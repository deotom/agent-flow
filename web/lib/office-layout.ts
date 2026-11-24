import type { OfficeFloor, OfficePoint, OfficeScene } from './office-types'

const parentId=(floor:OfficeFloor)=>(floor as OfficeFloor&{annexOf?:string}).annexOf
const height=(floor:OfficeFloor)=>floor.height??0
type Construction=OfficeFloor&{constructing?:boolean;constructionProgress?:number}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t

/** Desktop history belongs below the painted rooms and has room for a compact-width button. */
export function officeDesktopHistoryLayout(scene:OfficeScene):OfficeScene {
  if(!scene.floors[0]?.desktopArt)return scene
  const history=scene.floors.find(floor=>floor.kind==='quiet')
  if(!history)return scene
  const y=scene.floors.reduce((bottom,floor)=>parentId(floor)||floor===history?bottom:Math.max(bottom,floor.y+height(floor)),0)
  const historyHeight=scene.width*.10
  return {...scene,height:y+historyHeight+scene.width/3,floors:scene.floors.map(floor=>floor===history?{...floor,y,height:historyHeight}:floor)}
}

/** A painted Desktop storey needs its whole geometry as soon as its header is shown. */
export function officeLayoutCommitsImmediately(before:OfficeScene,next:OfficeScene):boolean {
  if(!next.floors[0]?.desktopArt)return false
  const priorIds=new Set(before.floors.filter(floor=>!parentId(floor)).map(floor=>floor.id))
  const nextIds=next.floors.filter(floor=>!parentId(floor)).map(floor=>floor.id)
  return priorIds.size!==nextIds.length||nextIds.some(id=>!priorIds.has(id))
}

/** Status, activity and annex contents must not restart a physical building transition. */
export function officeLayoutChanged(before:OfficeScene,next:OfficeScene):boolean {
  if(before.width!==next.width||before.height!==next.height)return true
  const old=before.floors.filter(f=>!parentId(f)),floors=next.floors.filter(f=>!parentId(f))
  if(old.length!==floors.length)return true
  const byId=new Map(old.map(f=>[f.id,f]))
  return floors.some(f=>{const prior=byId.get(f.id);return !prior||prior.y!==f.y||height(prior)!==height(f)})
}

/** A new room begins at the old boundary beside its nearest surviving neighbour. */
function collapsedY(floor:OfficeFloor,before:OfficeScene,next:OfficeScene):number {
  const physical=next.floors.filter(f=>!parentId(f)),index=physical.findIndex(f=>f.id===floor.id)
  const old=new Map(before.floors.map(f=>[f.id,f]))
  for(let i=index+1;i<physical.length;i++){const following=old.get(physical[i].id);if(following)return following.y}
  for(let i=index-1;i>=0;i--){
    const preceding=physical[i],prior=old.get(preceding.id)
    if(prior){const ratio=height(preceding)>0?(floor.y-preceding.y)/height(preceding):1;return prior.y+height(prior)*ratio}
  }
  return floor.y
}

/** Latest scene data with interpolated physical geometry. No source scene is mutated. */
export function officeLayoutFrame(before:OfficeScene,next:OfficeScene,progress:number):OfficeScene {
  const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:1))
  if(t===1||officeLayoutCommitsImmediately(before,next))return next
  const oldFloors=new Map(before.floors.map(f=>[f.id,f]))
  const nextFloors=new Map(next.floors.map(f=>[f.id,f]))
  const physical=new Map<string,OfficeFloor>()
  for(const floor of next.floors){
    if(parentId(floor))continue
    const old=oldFloors.get(floor.id)
    const constructing=floor.kind==='team'&&(!old||height(old)===0||(old as Construction).constructing===true)
    physical.set(floor.id,floor.kind==='lounge'?floor:{...floor,y:mix(old?.y??collapsedY(floor,before,next),floor.y,t),height:mix(old?height(old):0,height(floor),t),
      ...(constructing?{constructing:true,constructionProgress:mix((old as Construction|undefined)?.constructionProgress??0,1,t)}:{})})
  }
  const floors=next.floors.map(floor=>{
    const parent=parentId(floor),geometry=parent?physical.get(parent):physical.get(floor.id)
    return geometry?{...floor,y:geometry.y,height:geometry.height,...(!parent&&(geometry as Construction).constructing?{constructing:true,constructionProgress:(geometry as Construction).constructionProgress}:{})}:floor
  })
  const frameFloors=new Map(floors.map(f=>[f.id,f]))
  const oldActors=new Map(before.actors.map(a=>[a.key,a]))
  const width=mix(before.width,next.width,t)
  const project=(point:OfficePoint,floorId:string):OfficePoint=>{
    const target=nextFloors.get(floorId),frame=frameFloors.get(floorId)
    if(!target||!frame)return {...point}
    const ratio=height(target)>0?(point.y-target.y)/height(target):0
    return {x:point.x*(next.width?width/next.width:1),y:frame.y+ratio*height(frame)}
  }
  const actors=next.actors.map(actor=>{
    const old=oldActors.get(actor.key)
    const sameFloor=old?.floorId===actor.floorId&&oldFloors.has(actor.floorId)
    const position=sameFloor?{x:mix(old.x,actor.x,t),y:mix(old.y,actor.y,t)}:project(actor,actor.floorId)
    const monitor=actor.monitor?(sameFloor&&old.monitor?{x:mix(old.monitor.x,actor.monitor.x,t),y:mix(old.monitor.y,actor.monitor.y,t)}:project(actor.monitor,actor.floorId)):undefined
    return {...actor,...position,monitor}
  })
  return {...next,width,height:mix(before.height,next.height,t),floors,actors}
}
