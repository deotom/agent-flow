import type {OfficeActor,OfficeFloor,OfficePoint,OfficeScene} from './office-types'

type Bounds = readonly [left:number, top:number, right:number, bottom:number]

// Floor footprints in the painted rooms. The narrower gaps between adjacent
// benches are furniture gaps, not passageways wide enough for a character.
const workroom:readonly Bounds[] = [[.061,.759,.813,.907],[.133,.418,.643,.529],[.7,.546,.785,.621]]
const readingRoom:readonly Bounds[] = [[.12,.58,.30,.717],[.35,.622,.64,.735]]
const buildAndTerminal:readonly (readonly OfficePoint[])[] = [
 [{x:.065,y:.907},{x:.065,y:.62},{x:.108,y:.62},{x:.108,y:.57},{x:.366,y:.57},{x:.366,y:.62},{x:.406,y:.62},{x:.406,y:.907}],
 [{x:.443,y:.91},{x:.443,y:.71},{x:.454,y:.71},{x:.454,y:.639},{x:.762,y:.639},{x:.762,y:.71},{x:.799,y:.71},{x:.799,y:.91}],
]

function contains([left,top,right,bottom]:Bounds,point:OfficePoint){
  return point.x>left&&point.x<right&&point.y>top&&point.y<bottom
}

function crosses([left,top,right,bottom]:Bounds,from:OfficePoint,to:OfficePoint){
  let enter=0,exit=1
  const error=1e-6
  for(const [start,end,low,high] of [[from.x,to.x,left+error,right-error],[from.y,to.y,top+error,bottom-error]]){
    const delta=end-start
    if(!delta){if(start<=low||start>=high)return false;continue}
    const a=(low-start)/delta,b=(high-start)/delta
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b))
    if(enter>=exit)return false
  }
  return true
}

/** Shortest clear route along the edges of the painted furniture footprints. */
export function officeWalkWaypoints(floor:OfficeFloor|undefined,width:number,from:OfficePoint,to:OfficePoint):OfficePoint[] {
  if(!floor?.desktopArt||floor.kind==='lounge'||floor.kind==='quiet')return [to]
  const height=floor.height??width*.72
  const footprints=floor.kind==='team'?workroom:readingRoom
  const obstacles=footprints.map(([l,t,r,b]):Bounds=>[l*width,floor.y+t*height,r*width,floor.y+b*height])
  const sourceContact=obstacles.find(bounds=>contains(bounds,from))
  const targetContact=obstacles.find(bounds=>contains(bounds,to))
  // Use the front edge to enter or leave a seat or reachable prop.
  const start=sourceContact?{x:from.x,y:sourceContact[3]}:from
  const goal=targetContact?{x:to.x,y:targetContact[3]}:to
  const finish=(waypoints:OfficePoint[])=>[...(sourceContact?[start]:[]),...waypoints,...(targetContact?[to]:[])]
  const clear=(a:OfficePoint,b:OfficePoint)=>obstacles.every(bounds=>!crosses(bounds,a,b))
  if(clear(start,goal))return finish([goal])
  const points=[start,goal,...obstacles.flatMap(([l,t,r,b])=>[{x:l,y:t},{x:r,y:t},{x:l,y:b},{x:r,y:b}])]
  const distance=points.map((_,index)=>index===0?0:Infinity),parent=points.map(()=>-1)
  const remaining=new Set(points.keys())
  while(remaining.size){
    const current=[...remaining].reduce((best,index)=>distance[index]<distance[best]?index:best)
    remaining.delete(current)
    if(current===1||!Number.isFinite(distance[current]))break
    for(const index of remaining){
      const a=points[current],b=points[index],next=distance[current]+Math.hypot(a.x-b.x,a.y-b.y)
      if(next<distance[index]&&clear(a,b)){distance[index]=next;parent[index]=current}
    }
  }
  const route:OfficePoint[]=[]
  for(let index=1;index>0;index=parent[index])route.unshift(points[index])
  return finish(route)
}

/** Painted bench fronts hide the parts of a figure behind them at its floor depth. */
export function clipOfficeStationFurniture(c:CanvasRenderingContext2D,scene:OfficeScene,actor:OfficeActor) {
  const floor=scene.floors.find(item=>item.id===actor.floorId)
  if(!floor?.desktopArt||floor.kind!=='team')return
  const height=floor.height??scene.width*.72
  const behind=buildAndTerminal.filter(outline=>actor.y<floor.y+outline[0].y*height&&
    actor.x/scene.width>outline[0].x-.07&&actor.x/scene.width<outline.at(-1)!.x+.07)
  if(!behind.length)return
  c.beginPath()
  c.rect(0,0,scene.width,scene.height)
  for(const outline of behind){
    c.moveTo(outline[0].x*scene.width,floor.y+outline[0].y*height)
    for(const point of outline.slice(1))c.lineTo(point.x*scene.width,floor.y+point.y*height)
    c.closePath()
  }
  c.clip('evenodd')
}
