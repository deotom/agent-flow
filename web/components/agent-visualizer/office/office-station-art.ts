import frames from './assets/work-stations-frames-v1.json'
import type {OfficeRoomStation} from '../../../lib/office-room-design'
import type {OfficeRoomArt} from './office-room-design-art'

/** Tight atlas frames retain the real object aspect; its lowest foot is the floor anchor. */
export function drawOfficeStation(c:CanvasRenderingContext2D,station:OfficeRoomStation,art:OfficeRoomArt){
 const key=`${station.kind}-${station.facing}` as keyof typeof frames
 const requested=frames[key]??frames[`${station.kind}-front`],frame=requested.sheet==='angles'&&!art.stationAngles?frames[`${station.kind}-front`]:requested,source=frame.sheet==='angles'?art.stationAngles:art.stations
 if(!source)return
 const longest=Math.max(frame.width,frame.height),w=station.width*.90*frame.width/longest,h=station.height*.90*frame.height/longest
 c.save()
 c.beginPath();c.ellipse(station.x,station.y+1,station.width*.36,station.width*.055,0,0,Math.PI*2);c.fillStyle='#24160e38';c.fill()
 c.filter=`brightness(${.84+.16*station.depth}) saturate(.96)`
 c.drawImage(source,frame.x,frame.y,frame.width,frame.height,station.x-w/2,station.y-h,w,h)
 c.restore()
}
