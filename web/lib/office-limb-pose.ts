import type {OfficePoint} from './office-types'

/** Place a joint between its shoulder or hip and the visible contact. */
export function officeLimbBend(start:OfficePoint,end:OfficePoint,upper:number,lower:number,side:-1|1):OfficePoint {
 const dx=end.x-start.x,dy=end.y-start.y
 const distance=Math.hypot(dx,dy)
 if(distance<.01)return {x:start.x+side*upper,y:start.y}
 const reach=Math.min(distance,upper+lower)
 const along=(upper*upper-lower*lower+reach*reach)/(2*reach)
 const depth=Math.sqrt(Math.max(0,upper*upper-along*along))*side
 return {x:start.x+(dx*along-dy*depth)/distance,y:start.y+(dy*along+dx*depth)/distance}
}

/** Pick the bend that carries an elbow away from the body and downward, never into the belly. */
export function officeElbowSide(shoulder:OfficePoint,hand:OfficePoint,side:number,length:number):-1|1 {
 const mid={x:(shoulder.x+hand.x)/2,y:(shoulder.y+hand.y)/2}
 const score=(bend:-1|1)=>{
  const elbow=officeLimbBend(shoulder,hand,length,length,bend)
  return Math.sign(side||1)*(elbow.x-mid.x)+1.2*(elbow.y-mid.y)
 }
 return score(1)>=score(-1)?1:-1
}
