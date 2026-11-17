export interface OfficeVendorWalk {x:number;y:number;at:number;walk:boolean;face:1|-1;dx:number;dy:number;distance:number}
/** Presentation only. One clerk takes bounded steps; the customer queue remains authoritative. */
export function officeVendorWalk(previous:OfficeVendorWalk|null,time:number,customerComing:boolean,w:number,h:number,gy:number):OfficeVendorWalk{
 const home={x:w*.705,y:gy+h*.667},counter={x:w*.805,y:gy+h*.625}
 const phase=Number.isFinite(time)&&time>0?time%60:0
 const target=customerComing?counter:phase>=36&&phase<44?{x:w*.665,y:gy+h*.73}:home
 if(!previous||time<=0||time<previous.at)return {...(customerComing?counter:home),at:time,walk:false,face:customerComing?-1:1,dx:0,dy:0,distance:0}
 const dx=target.x-previous.x,dy=target.y-previous.y,distance=Math.hypot(dx,dy)
 const step=Math.min(distance,55*w/450*Math.max(0,Math.min(.1,time-previous.at)))
 return {x:previous.x+(distance?dx/distance*step:0),y:previous.y+(distance?dy/distance*step:0),at:time,walk:step>.01,face:distance<.01&&!customerComing?1:Math.abs(dx)>.01?(dx<0?-1:1):customerComing?-1:previous.face,dx:distance?dx/distance:0,dy:distance?dy/distance:0,distance:previous.distance+step}
}
