import {drawRuntimeMark} from '../canvas/runtime-mark'
import type {AgentRuntime} from '../../../lib/team-types'
import type {OfficeAppearance} from '../../../lib/office-types'
import type {OfficeHologramFrame} from '../../../lib/office-hologram'

type DrawAvatar=(c:CanvasRenderingContext2D,appearance:OfficeAppearance,x:number,y:number,time:number,pose:{runtime:AgentRuntime|null})=>void

/** Canvas-only projection. The original avatar and AI mark stay recognizable. */
export function drawOfficeHolograms(c:CanvasRenderingContext2D,frames:readonly OfficeHologramFrame[],drawAvatar:DrawAvatar):void{
 for(const frame of frames){
  c.save();c.translate(frame.x,frame.y);c.scale(frame.scale,frame.scale)
  c.globalAlpha*=frame.opacity
  c.fillStyle='#56d8cf';c.strokeStyle='#a1f1e8';c.lineWidth=1.3
  c.beginPath();c.ellipse(0,0,23,5,0,0,Math.PI*2);c.fill();c.stroke()
  // Static pose for both settings; only the caller's bounded opacity can change.
  drawAvatar(c,frame.member.appearance,0,-3,0,{runtime:frame.member.agent.runtime})
  const runtime=frame.member.agent.runtime
  if(runtime){
   c.fillStyle='#234f53';c.beginPath();c.ellipse(20,-49,8,8,0,0,Math.PI*2);c.fill();c.stroke()
   drawRuntimeMark(c,runtime,20,-49,11)
  }
  c.restore()
 }
}
