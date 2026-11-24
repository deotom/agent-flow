export interface OfficeWalkFoot {x:number;y:number;planted:boolean;angle:number;knee:{x:number;y:number}}
/** Distance-driven gait: a stance foot cancels the body's forward travel. */
export function officeWalkPose(slot:number,gait:number,weight:number,carrying=false,cycleDistance=22,direction={x:1,y:0},stepClearance=1){
 const amount=Number.isFinite(weight)?Math.max(0,Math.min(1,weight)):0
 const phase=Number.isFinite(gait)?gait:0,id=Number.isFinite(slot)?Math.abs(Math.floor(slot)):0,style=id%4
 const distance=Number.isFinite(cycleDistance)&&cycleDistance>0?cycleDistance:22,duty=.56+style*.018
 const cycle=((phase/(Math.PI*2)+id*.173205)%1+1)%1
 const length=Math.hypot(direction.x,direction.y),axis=Number.isFinite(length)&&length>0?{x:direction.x/length,y:direction.y/length}:{x:1,y:0}
 const torsoY=amount?-(.35+style*.14)*(1-Math.cos(phase*2))*amount:0
 const sway=amount?Math.sin(phase)*(.35+style*.10)*amount:0
 const foot=(base:number,offset:number):OfficeWalkFoot=>{
  if(!amount)return{x:base,y:0,planted:true,angle:0,knee:{x:base,y:-8}}
  const p=(cycle+offset)%1,planted=p<duty,s=planted?0:(p-duty)/(1-duty),ease=s*s*(3-2*s)
  const dx=planted?distance*(duty/2-p):distance*duty*(ease-.5)
  const y=dx*axis.y*amount+(planted?0:-Math.sin(Math.PI*s)*(2.5+style*.7)*amount*stepClearance),x=base+dx*axis.x*amount
  return{x,y,planted,angle:planted?0:Math.sin(Math.PI*2*s)*.16,knee:{x:(base+sway+x)/2+(planted?0:1.2),y:(-17+torsoY+y)/2-(!planted?1:0)}}
 }
 return{left:foot(-7,0),right:foot(7,.5),torsoY,sway,arm:amount?Math.sin(phase+id*.173205*Math.PI*2)*(2.6+style*.4)*amount*(carrying?.45:1):0,headTilt:amount?Math.sin(phase)*.018*amount:0}
}
