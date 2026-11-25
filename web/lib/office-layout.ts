import type { OfficeFloor, OfficePoint, OfficeScene } from './office-types'

const parentId=(floor:OfficeFloor)=>(floor as OfficeFloor&{annexOf?:string}).annexOf
const height=(floor:OfficeFloor)=>floor.height??0
const visibleHeight=(floor:OfficeFloor)=>floor.clipHeight??height(floor)
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

/** Kept as an export for callers; painted Desktop storeys now transition smoothly via clipped reveals. */
export function officeLayoutCommitsImmediately(_before:OfficeScene,_next:OfficeScene):boolean {
  return false
}

/** Status, activity and annex contents must not restart a physical building transition. */
export function officeLayoutChanged(before:OfficeScene,next:OfficeScene):boolean {
  if(before.width!==next.width||before.height!==next.height)return true
  const old=before.floors.filter(f=>!parentId(f)),floors=next.floors.filter(f=>!parentId(f))
  if(old.length!==floors.length)return true
  const byId=new Map(old.map(f=>[f.id,f]))
  return floors.some(f=>{const prior=byId.get(f.id);return !prior||prior.y!==f.y||height(prior)!==height(f)||prior.clipHeight!==undefined||prior.exiting===true})
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

function settledFloorGeometry(floor:OfficeFloor):OfficeFloor {
  if(floor.clipHeight===undefined&&floor.transitionOpacity===undefined&&floor.exiting===undefined)return floor
  const {clipHeight:_c,transitionOpacity:_o,exiting:_e,...rest}=floor
  return rest
}

function desktopLayoutFrame(before:OfficeScene,next:OfficeScene,t:number):OfficeScene {
  const oldFloors=new Map(before.floors.map(f=>[f.id,f]))
  const nextFloors=new Map(next.floors.map(f=>[f.id,f]))
  const width=mix(before.width,next.width,t)
  const rawLounge=next.floors.find(f=>f.kind==='lounge')??before.floors.find(f=>f.kind==='lounge')
  const oldLounge=before.floors.find(f=>f.kind==='lounge')
  const nextLounge=next.floors.find(f=>f.kind==='lounge')
  const lounge=rawLounge?(oldLounge&&nextLounge?{...nextLounge,y:mix(oldLounge.y,nextLounge.y,t),height:mix(height(oldLounge),height(nextLounge),t)}:rawLounge):undefined
  const surfaceHeight=lounge?height(lounge):0

  const beforePhys=before.floors.filter(f=>!parentId(f)&&f.kind!=='lounge'&&f.kind!=='quiet')
  const nextPhys=next.floors.filter(f=>!parentId(f)&&f.kind!=='lounge'&&f.kind!=='quiet')
  const mergedIds=nextPhys.map(f=>f.id)
  const nextPhysSet=new Set(mergedIds)
  for(let i=beforePhys.length-1;i>=0;i--){
    const ex=beforePhys[i]
    if(nextPhysSet.has(ex.id))continue
    let insertAt=mergedIds.length
    for(let j=i+1;j<beforePhys.length;j++){
      const pos=mergedIds.indexOf(beforePhys[j].id)
      if(pos>=0){insertAt=pos;break}
    }
    mergedIds.splice(insertAt,0,ex.id)
  }

  let cursor=surfaceHeight*.960,maxBottom=surfaceHeight
  const physical=new Map<string,OfficeFloor>()
  const placed:OfficeFloor[]=[]
  const fadeInOp=(startOp:number)=>Math.min(1,mix(startOp,1,Math.min(1,t*1.35)))
  for(const id of mergedIds){
    const old=oldFloors.get(id),target=nextFloors.get(id)
    if(old&&target){
      const fullH=mix(height(old),height(target),t)
      const hadClip=old.clipHeight!==undefined||old.exiting===true
      const visH=hadClip?mix(visibleHeight(old),height(target),t):fullH
      const op=hadClip?fadeInOp(old.transitionOpacity??1):1
      const base=settledFloorGeometry({...target,y:cursor,height:fullH})
      const framed=hadClip&&visH<fullH-.5?{...base,clipHeight:visH,transitionOpacity:op}:base
      physical.set(id,framed);placed.push(framed)
      maxBottom=Math.max(maxBottom,cursor+visH)
      cursor+=visH*.982
    }else if(target){
      const fullH=height(target),visH=mix(0,fullH,t),op=Math.min(1,t*1.35)
      const framed={...settledFloorGeometry(target),y:cursor,height:fullH,clipHeight:visH,transitionOpacity:op}
      physical.set(id,framed);placed.push(framed)
      maxBottom=Math.max(maxBottom,cursor+visH)
      cursor+=visH*.982
    }else if(old){
      const fullH=height(old),visH=mix(visibleHeight(old),0,t),op=Math.max(0,(old.transitionOpacity??1)*(1-t))
      const framed={...settledFloorGeometry(old),y:cursor,height:fullH,clipHeight:visH,transitionOpacity:op,exiting:true}
      physical.set(id,framed);placed.push(framed)
      maxBottom=Math.max(maxBottom,cursor+visH)
      cursor+=visH*.982
    }
  }

  const oldQuiet=before.floors.find(f=>f.kind==='quiet')
  const nextQuiet=next.floors.find(f=>f.kind==='quiet')
  let quietFloor:OfficeFloor|undefined,sceneHeight=cursor+width/3
  if(oldQuiet&&nextQuiet){
    const fullQH=mix(height(oldQuiet),height(nextQuiet),t)
    const hadClip=oldQuiet.clipHeight!==undefined||oldQuiet.exiting===true
    const visQH=hadClip?mix(visibleHeight(oldQuiet),height(nextQuiet),t):fullQH
    const op=hadClip?fadeInOp(oldQuiet.transitionOpacity??1):1
    const base=settledFloorGeometry({...nextQuiet,y:maxBottom,height:fullQH})
    quietFloor=hadClip&&visQH<fullQH-.5?{...base,clipHeight:visQH,transitionOpacity:op}:base
    physical.set(quietFloor.id,quietFloor)
    sceneHeight=maxBottom+visQH+width/3
  }else if(nextQuiet){
    const fullQH=height(nextQuiet),visQH=mix(0,fullQH,t),qy=mix(cursor,maxBottom,t)
    quietFloor={...settledFloorGeometry(nextQuiet),y:qy,height:fullQH,clipHeight:visQH,transitionOpacity:Math.min(1,t*1.35)}
    physical.set(quietFloor.id,quietFloor)
    sceneHeight=qy+visQH+width/3
  }else if(oldQuiet){
    const fullQH=height(oldQuiet),visQH=mix(visibleHeight(oldQuiet),0,t),qy=mix(maxBottom,cursor,t)
    quietFloor={...settledFloorGeometry(oldQuiet),y:qy,height:fullQH,clipHeight:visQH,transitionOpacity:Math.max(0,(oldQuiet.transitionOpacity??1)*(1-t)),exiting:true}
    physical.set(quietFloor.id,quietFloor)
    sceneHeight=qy+visQH+width/3
  }

  const annexFloors:OfficeFloor[]=[]
  for(const floor of next.floors){
    const parent=parentId(floor)
    if(!parent)continue
    const geometry=physical.get(parent)
    annexFloors.push(geometry?{...floor,y:geometry.y,height:geometry.height,clipHeight:geometry.clipHeight,transitionOpacity:geometry.transitionOpacity,exiting:geometry.exiting}:floor)
  }
  const floors=[...(lounge?[lounge]:[]),...placed,...annexFloors,...(quietFloor?[quietFloor]:[])]
  const frameFloors=new Map(floors.map(f=>[f.id,f]))
  const oldActors=new Map(before.actors.map(a=>[a.key,a]))
  const nextActorKeys=new Set(next.actors.map(a=>a.key))
  const project=(point:OfficePoint,floorId:string):OfficePoint=>{
    const target=nextFloors.get(floorId),frame=frameFloors.get(floorId)
    if(!target||!frame)return {...point}
    const ratio=height(target)>0?(point.y-target.y)/height(target):0
    return {x:point.x*(next.width?width/next.width:1),y:frame.y+ratio*height(frame)}
  }
  const actors=next.actors.map(actor=>{
    const old=oldActors.get(actor.key)
    const oldFloor=oldFloors.get(actor.floorId),nextFloor=nextFloors.get(actor.floorId),frameFloor=frameFloors.get(actor.floorId)
    const sameFloor=Boolean(old&&old.floorId===actor.floorId&&oldFloor&&nextFloor&&frameFloor)
    const position=sameFloor&&oldFloor&&nextFloor&&frameFloor
      ?{x:mix(old!.x,actor.x,t),y:frameFloor.y+mix(old!.y-oldFloor.y,actor.y-nextFloor.y,t)}
      :project(actor,actor.floorId)
    const monitor=actor.monitor?(sameFloor&&old!.monitor&&oldFloor&&nextFloor&&frameFloor
      ?{x:mix(old!.monitor.x,actor.monitor.x,t),y:frameFloor.y+mix(old!.monitor.y-oldFloor.y,actor.monitor.y-nextFloor.y,t)}
      :project(actor.monitor,actor.floorId)):undefined
    return {...actor,...position,monitor}
  })
  const scaleX=before.width?width/before.width:1
  for(const actor of before.actors){
    if(nextActorKeys.has(actor.key))continue
    const frameFloor=frameFloors.get(actor.floorId),oldFloor=oldFloors.get(actor.floorId)
    if(!frameFloor?.exiting||!oldFloor)continue
    actors.push({...actor,x:actor.x*scaleX,y:frameFloor.y+(actor.y-oldFloor.y),
      monitor:actor.monitor?{x:actor.monitor.x*scaleX,y:frameFloor.y+(actor.monitor.y-oldFloor.y)}:undefined})
  }
  return {...next,width,height:sceneHeight,floors,actors}
}

/** Latest scene data with interpolated physical geometry. No source scene is mutated. */
export function officeLayoutFrame(before:OfficeScene,next:OfficeScene,progress:number):OfficeScene {
  const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:1))
  if(t===1)return next
  if(next.floors[0]?.desktopArt||before.floors[0]?.desktopArt)return desktopLayoutFrame(before,next,t)
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
  const exitingFloors:OfficeFloor[]=[]
  for(const old of before.floors){
    if(parentId(old)||old.kind!=='team'||nextFloors.has(old.id))continue
    const fullH=height(old),visH=mix(visibleHeight(old),0,t),op=Math.max(0,(old.transitionOpacity??1)*(1-t))
    const ex={...old,height:fullH,clipHeight:visH,transitionOpacity:op,exiting:true}
    physical.set(ex.id,ex);exitingFloors.push(ex)
  }
  const floors=[...next.floors.map(floor=>{
    const parent=parentId(floor),geometry=parent?physical.get(parent):physical.get(floor.id)
    return geometry?{...floor,y:geometry.y,height:geometry.height,...(!parent&&(geometry as Construction).constructing?{constructing:true,constructionProgress:(geometry as Construction).constructionProgress}:{})}:floor
  }),...exitingFloors]
  const frameFloors=new Map(floors.map(f=>[f.id,f]))
  const oldActors=new Map(before.actors.map(a=>[a.key,a]))
  const nextActorKeys=new Set(next.actors.map(a=>a.key))
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
  const scaleX=before.width?width/before.width:1
  for(const actor of before.actors){
    if(nextActorKeys.has(actor.key))continue
    const frameFloor=frameFloors.get(actor.floorId)
    if(!frameFloor?.exiting)continue
    actors.push({...actor,x:actor.x*scaleX,monitor:actor.monitor?{x:actor.monitor.x*scaleX,y:actor.monitor.y}:undefined})
  }
  return {...next,width,height:mix(before.height,next.height,t),floors,actors}
}
