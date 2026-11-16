import type {OfficePoint,OfficePose} from './office-types'
export interface OfficeGripPose extends OfficePose {wave?:boolean;cup?:boolean;scratch?:boolean}
export interface OfficeHandMotion {left:number;right:number;sip:number;wave:number;lift?:number}
const unit=(value:number|undefined)=>Number.isFinite(value)?Math.max(0,Math.min(1,value!)):0
const mix=(from:number,to:number,amount:number)=>from+(to-from)*amount

/** Avatar-local contact points. Body breathing and facing transform hands and props together. */
export function officeHandContacts(p:OfficeGripPose,m:OfficeHandMotion){
 const stretch=unit(p.stretch),offer=unit(p.offer),weight=p.walk?unit(p.walkWeight??1):0
 const swing=Math.sin(p.gait??0)*3*weight
 let lx=-15,ly=-21+m.left+(p.walk?swing:0),rx=16,ry=-23+m.right-m.sip*12
 if(p.walk&&!p.mug&&!p.cup&&!p.carry)ry-=swing
 if(p.climb){const phase=(p.climbStep??0)*Math.PI;lx=-17;ly=-43+Math.sin(phase)*9;rx=17;ry=-43-Math.sin(phase)*9}
 else if(p.hand||p.wave||p.objectAction==='music'){rx=16+m.wave;ry=-48}
 else if(p.objectAction==='book'||p.objectAction==='game'||p.objectAction==='snack'){
  const grip=unit(p.seatBlend??1)
  lx=mix(-15,-10,grip);ly=mix(-21+m.left,-22+m.left,grip)
  rx=mix(16,12,grip);ry=mix(-23+m.right,-22+m.right-(p.objectAction==='snack'?m.sip*12:0),grip)
 }
 else if(p.typing&&!p.sit){lx=-12;ly=-40+m.left;rx=12;ry=-40+m.right}
 if(p.scratch){rx=10+m.wave;ry=-60}
 if(offer){rx=mix(rx,28,offer);ry=mix(ry,-30,offer)}
 let left:OfficePoint={x:mix(lx,-17,stretch),y:mix(ly,-66,stretch)}
 let right:OfficePoint={x:mix(rx,17,stretch),y:mix(ry,-66,stretch)}
 if(p.typing&&p.supportHands){
  const face=p.face===-1?-1:1,lift=m.lift??0
  left={x:p.supportHands.left.x*face,y:p.supportHands.left.y+lift}
  right={x:p.supportHands.right.x*face,y:p.supportHands.right.y+lift}
 }else if(p.dressing){
  const dress=unit(p.dressing)
  left={x:mix(left.x,-8,dress),y:mix(left.y,-36,dress)}
 }
 return {left,right,shared:{x:(left.x+right.x)/2,y:(left.y+right.y)/2},plate:{x:left.x+13,y:left.y+4},cup:{pivot:{...right},angle:Number.isFinite(p.cupTilt)?Math.max(-.28,Math.min(.28,p.cupTilt!)):0}}
}
