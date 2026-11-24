import {officeSelectionGesture} from '../../../lib/office-selection-gesture'
import { drawRuntimeMark, type Runtime } from '../canvas/runtime-mark'
import { officeDaylight } from '../../../lib/office-daylight'
import { drawOfficeShaft } from './office-shaft-art'
import { clipOfficeReferenceLiftRider } from './office-reference-lift-art'
import { drawOfficeSky } from './office-sky-art'
import { drawOfficeSeasonalRooms } from './office-seasonal-art'
import { drawOfficeGarden, drawOfficeGardenActorShadow, gardenLampsOn } from './office-garden-art'
import { drawOfficeInteriorDoors } from './office-door-art'
import {drawOfficeDailyArt} from './office-daily-art'
import {drawOfficeCommunications} from './office-communication-art'
import {officeRestConversations} from '../../../lib/office-communication'
import {drawOfficeOutingArt,drawOfficeOutingParcel} from './office-outing-art'
import {officeHandContacts} from '../../../lib/office-contacts'
import {officeSharedRest} from '../../../lib/office-shared-rest'
import {skyWeather} from '../../../lib/office-sky'
import {officeAppearance} from '../../../lib/office-model'
import {officeWardrobeTheme,officeWardrobeFor,type OfficeWardrobeLook} from '../../../lib/office-wardrobe'
import {drawOfficePaintedWorkwear,drawOfficeWardrobe,traceOfficeWorkwear} from './office-wardrobe-art'
import {officeAvatarCoatAtlases,officeAvatarExtraHeadAtlases,officeAvatarHeadAtlases,officeAvatarLegAtlases,officeAvatarProfileAtlases,officeAvatarWorkwearV1Atlases,officeAvatarWorkwearV2Atlases} from './office-avatar-atlas'
import {officePaintedAvatarLook} from '../../../lib/office-painted-avatar'
import {officeTintedHead} from './office-avatar-tone'
import {officeElbowSide,officeLimbBend} from '../../../lib/office-limb-pose'
import {drawOfficeVendor,drawOfficeShopQueue,officeVendorAvatarPose} from './office-vendor-art'
import {officeActorRenderScale} from '../../../lib/office-depth'
import {officeVendorExchange,officeVendorCustomerApproaching} from '../../../lib/office-vendor'
import {officeActorSupport,officeSeatFrame,officeStandsAtStation} from '../../../lib/office-support'
import {agentWorkStation,officeStations} from '../../../lib/office-stations'
import {roomDesktopWorkpoints} from '../../../lib/office-room-design'
import {drawOfficeStation} from './office-station-art'
import {drawOfficeRoomDeskLights} from './office-room-design-art'
import {officeStationActivity} from '../../../lib/office-station-activity'
import {officeWalkPose} from '../../../lib/office-walk-pose'
import {clipOfficeStationFurniture} from '../../../lib/office-walking'
import {officeShaftX} from '../../../lib/office-navigation'
import type {OfficeWardrobeTransitionLook} from '../../../lib/office-wardrobe-transition'
import type { OfficeActor, OfficeAppearance, OfficeDrawnOffset, OfficePaintOptions, OfficePoint, OfficePose, OfficeScene, OfficeLeisureAction } from '../../../lib/office-types'
import { officeLife, officeLifeCanChat, officeLifePairs, officeSeed, type OfficeLifePair, type OfficeMood } from '../../../lib/office-life'

type Ambient = { name: string; night: boolean; sky: string; horizon: string; rooms: string[]; glass: string; ground: string; sun: string }
export function officeAmbient(date: Date): Ambient {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 5 && hour < 8) return { name: 'Dawn', night: false, sky: '#db9a65', horizon: '#f1c58c', rooms: ['#344455', '#2b4650', '#3b3c50', '#324b43'], glass: '#f8d796', ground: '#477f6b', sun: '#ffdc79' }
  if (hour >= 8 && hour < 17) return { name: 'Day', night: false, sky: '#449dcc', horizon: '#99c4ce', rooms: ['#30485b', '#284a50', '#363e56', '#304d43'], glass: '#79b7cf', ground: '#3e886b', sun: '#ffe579' }
  if (hour >= 17 && hour < 19) return { name: 'Dusk', night: false, sky: '#9e6977', horizon: '#dfa76f', rooms: ['#344050', '#2c4249', '#3a354a', '#34443b'], glass: '#dca66d', ground: '#3c6e61', sun: '#ffe0a4' }
  return { name: 'Night', night: true, sky: '#182a4a', horizon: '#3b4f6d', rooms: ['#1d3043', '#1e353c', '#2b2b43', '#233c33'], glass: '#d5b66e', ground: '#2a514b', sun: '#ffe7af' }
}

type Ctx = CanvasRenderingContext2D
function oval(c: Ctx, x:number,y:number,rx:number,ry:number,color:string,outline=true) {
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill()
  if(outline){c.strokeStyle='#4b3025';c.lineWidth=1.6;c.stroke()}
}
function round(c:Ctx,x:number,y:number,w:number,h:number,color:string,r=4){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();c.strokeStyle='#4b3025';c.lineWidth=1.4;c.stroke()}

/** Life poses layered on the base pose; all optional so callers can stay minimal. */
export interface OfficeAvatarPose extends OfficePose { workwear?:boolean; wardrobeTransition?:OfficeWardrobeTransitionLook;wardrobe?:OfficeWardrobeLook;objectAction?:OfficeLeisureAction; stretch?: number; lean?: number; doze?: boolean; slump?: boolean; scratch?: boolean; wave?: boolean; turn?: number; cup?: boolean; face?: 1 | -1; hop?: number; runtime?: Runtime | null; party?: boolean; portrait?:boolean }
const shopkeeper:OfficeAppearance={...officeAppearance(0),slot:7001,kind:'human',hair:'#4d3329',skin:'#e6b18c',shirt:'#375e54',pants:'#5f4a36',gear:'cap',outfit:'overalls',cut:'crop',face:'round'}
/** Micro-motion offsets for a pose at a given time; all zero when time is frozen at 0. */
function idleMotion(time:number,p:OfficeAvatarPose){
  const r={lift:0,headX:0,headY:0,tilt:0,left:0,right:0,wave:0,sip:0}
  if(!time||p.walk||p.climb)return r
  r.lift=Math.sin(time*2.2)*(p.doze?1.6:1);r.headX=(p.turn??0)*3
  if(p.typing&&!p.workGesture){r.headY=Math.abs(Math.sin(time*11))*2.2;r.left=Math.sin(time*13)*3;r.right=Math.cos(time*13)*3;r.headX+=Math.sin(time*.7)}
  if(p.wave||p.objectAction==='music')r.wave=Math.sin(time*9)*4
  if(p.mug||p.cup||p.objectAction==='snack'){const k=(time%7)/7;r.sip=k>.78?Math.sin((k-.78)/.22*Math.PI):0;r.headY+=r.sip*2}
  if(p.objectAction==='book'){r.headY+=3;r.headX+=Math.sin(time*.6)*.6}
  if(p.objectAction==='game'){r.left=Math.sin(time*7)*1.2;r.right=Math.cos(time*8)*1.2}
  if(p.doze){r.headY+=3+Math.sin(time*1.1)*1.2;r.tilt=.14}
  if(p.slump){r.headY+=7;r.headX+=2;r.tilt=.22}
  if(p.workGesture){r.headY+=p.workGesture.nod*10;r.tilt+=p.workGesture.turn*.35}
  return r
}
const mix=(a:number,b:number,k:number)=>a+(b-a)*k
/** Round AI logo patch worn on the shirt: chest from the front, upper back at a desk. */
function drawShirtLogo(c:Ctx,runtime:Runtime,x:number,y:number){
  oval(c,x,y,8,8,'#3b2a1e');c.strokeStyle='#f6e2bd';c.lineWidth=1.3;c.stroke()
  drawRuntimeMark(c,runtime,x,y,11.5)
}
function drawOutfit(c:Ctx,a:OfficeAppearance,compact=false){
  const dark='#35444e',light='#e7debf'
  if(a.outfit==='coat'){round(c,-15,-35,30,31,'#dddac8',5);c.beginPath();c.moveTo(0,-32);c.lineTo(0,-6);c.strokeStyle='#8e998e';c.lineWidth=1.5;c.stroke()}
  if(a.outfit==='hoodie'){oval(c,0,-34,18,12,a.shirt);round(c,-8,-17,16,5,dark,2);c.strokeStyle=light;c.lineWidth=1;c.beginPath();c.moveTo(-4,-32);c.lineTo(-5,-23);c.moveTo(4,-32);c.lineTo(5,-23);c.stroke()}
  if(a.outfit==='overalls'){round(c,-11,-29,22,21,'#386477',3);for(const x of [-9,7]){round(c,x,-34,3,13,'#436e81',1);oval(c,x+1.5,-25,1.5,1.5,'#f1ce78',false)}}
  if(a.outfit==='vest'||a.outfit==='jacket'){
    c.fillStyle=dark;c.beginPath();c.moveTo(-14,-33);c.lineTo(-6,-35);c.lineTo(-3,-14);c.lineTo(-14,-11);c.closePath();c.fill();c.beginPath();c.moveTo(14,-33);c.lineTo(6,-35);c.lineTo(3,-14);c.lineTo(14,-11);c.closePath();c.fill()
    if(a.outfit==='jacket'){round(c,-18,-32,7,18,dark,3);round(c,11,-32,7,18,dark,3)}
  }
  if(a.outfit==='poncho'){const w=compact?17:23;c.beginPath();c.moveTo(0,-39);c.lineTo(-w,-16);c.lineTo(0,-7);c.lineTo(w,-16);c.closePath();c.fillStyle=a.shirt;c.fill();c.strokeStyle=light;c.lineWidth=2;c.beginPath();c.moveTo(-w+5,-17);c.lineTo(0,-11);c.lineTo(w-5,-17);c.stroke()}
  if(a.outfit==='striped'){c.strokeStyle=light;c.lineWidth=2;c.beginPath();for(const y of [-29,-23,-17]){c.moveTo(-11,y);c.lineTo(11,y)}c.stroke()}
}
function drawOfficeHead(c:Ctx,a:OfficeAppearance,back:boolean,doze:boolean){
  const cut=a.cut
  if(cut==='long')round(c,-20,-63,38,41,a.hair,12)
  if(cut==='bob')round(c,-20,-63,40,33,a.hair,9)
  oval(c,0,-47,18,18,a.hair)
  if(cut==='bun')oval(c,-11,-67,9,9,a.hair)
  if(cut==='ponytail'){oval(c,-20,-43,7,20,a.hair);oval(c,-22,-32,6,10,a.hair)}
  if(cut==='curly')for(const [x,y] of [[-17,-53],[-14,-62],[-5,-67],[5,-67],[15,-61],[back?16:20,-52]])oval(c,x,y,back?5.5:7,back?5.5:7,a.hair)
  if(cut==='spike'){c.beginPath();for(const [i,[x,y]] of [[-19,-47],[-20,-66],[-12,-63],[-8,-76],[0,-67],[9,-73],[12,-63],[20,-61],[18,-46]].entries())i?c.lineTo(x,y):c.moveTo(x,y);c.closePath();c.fillStyle=a.hair;c.fill();c.strokeStyle='#4b3025';c.stroke()}
  if(a.face==='square')round(c,-11,-58,30,28,a.skin,6)
  else oval(c,3,-44,a.face==='oval'?13:16,a.face==='oval'?17:14,a.skin)
  oval(c,-12,-43,4,5,a.skin)
  c.fillStyle=a.hair;c.strokeStyle='#4b3025';c.lineWidth=1.2;c.beginPath()
  if(cut==='crop'){c.moveTo(-16,-52);c.lineTo(-12,-62);c.quadraticCurveTo(10,-68,18,-53);c.lineTo(8,-55);c.lineTo(-4,-54)}
  else if(cut==='bob'){c.moveTo(-18,-49);c.lineTo(-17,-62);c.quadraticCurveTo(8,-70,18,-55);c.lineTo(18,-47);c.lineTo(9,-54);c.lineTo(3,-50);c.lineTo(-4,-54)}
  else if(cut==='long'){c.moveTo(-18,-45);c.quadraticCurveTo(-20,-69,2,-63);c.quadraticCurveTo(21,-68,20,-43);c.lineTo(14,-52);c.lineTo(3,-59);c.lineTo(-6,-52)}
  else{c.moveTo(-17,-48);c.bezierCurveTo(-18,-69,21,-65,18,-47);c.quadraticCurveTo(10,-51,7,-57);c.quadraticCurveTo(0,-44,-17,-48)}
  c.closePath();c.fill();c.stroke()
  if(cut==='curly')for(const x of [-13,-5,3,11])oval(c,x,-57,5,5,a.hair)
  const ey=-44+(a.slot%3-1),eye=(x:number)=>{if(doze){c.beginPath();c.moveTo(x-2,ey);c.quadraticCurveTo(x,ey+2,x+2,ey);c.strokeStyle='#38291f';c.stroke()}else oval(c,x,ey,a.face==='square'?1.8:1.4,a.face==='oval'?2.7:2.1,'#38291f',false)}
  eye(3);eye(12);oval(c,0,-38,3,1.6,'#df9281',false);oval(c,15,-38,2.5,1.5,'#df9281',false)
  c.beginPath();c.moveTo(6,-34);c.quadraticCurveTo(9,-32-(a.slot%2),12,-35);c.strokeStyle='#9f6251';c.lineWidth=1;c.stroke()
  if(back){oval(c,-5,-47,13,16,a.hair);oval(c,11,-42,7,11,a.skin);eye(15)}
  const gear=a.gear
  if((gear==='glasses'||gear==='goggles')&&!back){const y=ey-5;round(c,-2,y,10,9,gear==='goggles'?'#98d2d360':'#fff8e830',3);round(c,10,y,10,9,gear==='goggles'?'#98d2d360':'#fff8e830',3);c.beginPath();c.moveTo(8,ey);c.lineTo(10,ey);c.stroke()}
  if(gear==='cap'){round(c,-19,-69,36,12,a.shirt,7);round(c,7,-61,22,4,'#344c57',2)}
  if(gear==='beanie'){round(c,-20,-71,39,17,a.shirt,9);round(c,-21,-60,41,5,'#d7c59e',2);oval(c,0,-75,5,5,a.shirt)}
  if(gear==='headphones'||gear==='headset'){c.beginPath();c.ellipse(0,-47,20,20,0,Math.PI,Math.PI*2);c.strokeStyle='#273e4c';c.lineWidth=4;c.stroke();round(c,-22,-51,7,14,'#364a5c',3);round(c,17,-51,7,14,'#364a5c',3);if(gear==='headset'){c.beginPath();c.moveTo(20,-41);c.lineTo(12,-33);c.strokeStyle='#344a51';c.lineWidth=2;c.stroke();oval(c,11,-33,3,2,'#344a51')}}
  if(gear==='earrings'){oval(c,-13,-35,3,4,'#edc76c');oval(c,19,-35,2,3,'#edc76c')}
  if(gear==='scarf'){round(c,-14,-33,29,6,'#edc477',3);round(c,7,-32,6,17,'#edc477',2)}
}
function drawLeisureProp(c:Ctx,kind:OfficeLeisureAction,hands:ReturnType<typeof officeHandContacts>,time:number){
 const {x:rx,y:ry}=hands.right
 if(kind==='book'){
  c.save();c.translate(hands.shared.x-1,hands.shared.y+22)
  round(c,-11,-28,25,15,'#edddab',2);c.strokeStyle='#a28b62';c.lineWidth=1;c.beginPath();c.moveTo(2,-27);c.lineTo(2,-14)
  for(const y of [-24,-21,-18]){c.moveTo(-8,y);c.lineTo(-1,y);c.moveTo(5,y);c.lineTo(11,y)}c.stroke()
  c.restore()
 }else if(kind==='game'){
  c.save();c.translate(hands.shared.x-1,hands.shared.y+22)
  round(c,-12,-26,25,10,'#364856',4);c.strokeStyle='#c6d7d9';c.lineWidth=1.4;c.beginPath();c.moveTo(-9,-21);c.lineTo(-3,-21);c.moveTo(-6,-24);c.lineTo(-6,-18);c.stroke();oval(c,7,-23,1.6,1.6,'#cce0a4',false);oval(c,9,-19,1.6,1.6,'#edc47e',false)
  c.restore()
 }else if(kind==='water'){
  round(c,rx-6,ry+1,13,11,'#65a79f',3);oval(c,rx-9,ry+5,4,4,'#85bbb0');c.beginPath();c.moveTo(rx+5,ry+4);c.lineTo(rx+16,ry+1);c.lineTo(rx+18,ry+4);c.strokeStyle='#8ac4b9';c.lineWidth=3;c.stroke()
  c.fillStyle='#93d4e9';for(let i=0;i<4;i++){const d=(time*12+i*3)%12;c.fillRect(rx+17+i,ry+5+d,1,2)}
 }else if(kind==='music'){
  oval(c,rx+4,ry+1,8,8,'#edc576');oval(c,rx+4,ry+1,5,5,'#b78b54');for(let i=0;i<4;i++)oval(c,rx+4+Math.cos(i*Math.PI/2)*7,ry+1+Math.sin(i*Math.PI/2)*7,1.5,1.5,'#e9e3cf',false)
 }else if(kind==='snack'){
  const plate=hands.plate
  oval(c,plate.x,plate.y,13,3,'#eee1be');for(const x of [-6,1,7])oval(c,plate.x+x,plate.y-3,3,3,'#b97d43');oval(c,rx+3,ry-3,3,3,'#c99658');c.fillStyle='#6c4a2f';c.fillRect(plate.x+1,plate.y-4,1,1)
 }
}

function drawProfileBook(c:Ctx,{x,y}:OfficePoint){
  c.save();c.translate(x,y)
  c.beginPath()
  c.moveTo(-8,2);c.lineTo(-5,-7);c.quadraticCurveTo(0,-8,2,-5);c.lineTo(9,-9)
  c.lineTo(8,0);c.lineTo(2,4);c.closePath()
  c.fillStyle='#ebd7a1';c.fill();c.strokeStyle='#6c422d';c.lineWidth=.9;c.stroke()
  c.beginPath();c.moveTo(2,-5);c.lineTo(2,3);c.moveTo(-4,-4);c.lineTo(0,-3)
  c.moveTo(4,-4);c.lineTo(7,-6);c.moveTo(4,-1);c.lineTo(7,-3)
  c.strokeStyle='#a68a5d';c.lineWidth=.65;c.stroke()
  c.restore()
}
function drawWorkGestureProp(c:Ctx,p:OfficeAvatarPose,hands:ReturnType<typeof officeHandContacts>){
 const gesture=p.workGesture;if(!gesture||gesture.reach<=0)return
 const {x,y}=hands.right;c.save();c.globalAlpha*=gesture.reach
 if(gesture.kind==='tune'){
  c.translate(x,y);c.rotate(.28*Math.sin(gesture.progress*Math.PI*4))
  c.beginPath();c.moveTo(0,0);c.lineTo(1,10);c.strokeStyle='#c7d8d2';c.lineWidth=2;c.stroke()
  round(c,-2.5,-8,5.5,9,'#d98937',2)
 }else if(gesture.kind==='inspect'){
  c.beginPath();c.moveTo(x,y);c.lineTo(x+4,y-6);c.strokeStyle='#b79b59';c.lineWidth=3.5;c.stroke()
  oval(c,x+7,y-10,6,6,'#b9e6e79d');c.strokeStyle='#f2d087';c.lineWidth=1.8;c.stroke()
 }else if(gesture.kind==='note'||gesture.kind==='adjust'){
  c.beginPath();c.moveTo(x-1,y+2);c.lineTo(x+3,y-7);c.strokeStyle=gesture.kind==='note'?'#e8c566':'#91aeb0';c.lineWidth=2;c.stroke()
  if(gesture.kind==='adjust')round(c,x-3,y-1,4,6,'#a9663e',1)
 }else if(gesture.kind==='page'){
  c.beginPath();c.moveTo(x-6,y+2);c.quadraticCurveTo(x+1,y-9,x+7,y-2);c.lineTo(x+5,y+4);c.closePath();c.fillStyle='#f5e8c3';c.fill();c.strokeStyle='#aa946c';c.lineWidth=.9;c.stroke()
 }
 c.restore()
}
// 4 columns: front head, back head, front torso, back torso. One character per row.
function drawAvatarPart(c:Ctx,atlas:CanvasImageSource,row:number,column:number,x:number,y:number,w:number,h:number){
  const cell=256
  c.drawImage(atlas,column*cell,row*cell,cell,cell,x,y,w,h)
}

// Normalized anchors measured on each painted pose. The seated anchors mark the
// underside of the hips so the same sprite can contact stools of different heights.
// `size` is the cell's natural side in avatar units (boots and cuffs match the
// standing figure); seated legs keep that scale and only lengthen the plain shin
// band between `shin[0]` and `shin[1]` to reach the floor from a taller stool.
const lowerBody={
  standing:{row:0,column:0,hipX:.48,ground:.909,hipY:.125,width:.98,size:0,shin:[.5,.66]},
  rearSeat:{row:0,column:1,hipX:.5,ground:.861,hipY:.48,width:.89,size:38,shin:[.505,.615]},
  terminalSeat:{row:0,column:2,hipX:.389,ground:.727,hipY:.501,width:.89,size:44,shin:[.56,.6]},
  reading:{row:1,column:0,hipX:.34,ground:.897,hipY:.496,width:.86,size:37,shin:[.55,.66]},
  workSeat:{row:1,column:1,hipX:.30,ground:.894,hipY:.494,width:.87,size:38,shin:[.55,.665]},
  workStanding:{row:1,column:2,hipX:.495,ground:.897,hipY:.111,width:.96,size:0,shin:[.5,.66]},
} as const
type LowerBodyPose=keyof typeof lowerBody

/** Cell side and the stretched shin height used to hang a pose from `hipHeight`. */
export function officeLowerBodyFit(pose:LowerBodyPose,hipHeight:number){
  const part=lowerBody[pose],natural=hipHeight/(part.ground-part.hipY)
  const size=part.size?Math.min(natural,part.size):natural
  const [top,bottom]=part.shin
  return {size,shin:hipHeight-(top-part.hipY)*size-(part.ground-bottom)*size,top,bottom}
}

function drawLowerBody(c:Ctx,atlas:CanvasImageSource,pose:LowerBodyPose,hipHeight:number){
  const part=lowerBody[pose]
  const {size,shin,top,bottom}=officeLowerBodyFit(pose,hipHeight)
  const width=size*part.width,x=-part.hipX*width,sx=part.column*256,sy=part.row*256
  c.save()
  if(pose==='reading'||pose==='workSeat'||pose==='rearSeat'||pose==='terminalSeat')c.filter='brightness(1.15)'
  if(Math.abs(shin-(bottom-top)*size)<.01){
    c.drawImage(atlas,sx,sy,256,256,x,-part.ground*size,width,size)
  }else{
    // Thighs and boots keep the painted scale; the plain shin band takes up the stool height.
    const hip=-hipHeight-part.hipY*size,band=hip+top*size,floor=-(part.ground-bottom)*size
    c.drawImage(atlas,sx,sy,256,256*top,x,hip,width,top*size)
    // The shin band overlaps both seams by a hair so no gap shows between draws.
    c.drawImage(atlas,sx,sy+256*top,256,256*(bottom-top),x,band-.3,width,floor-band+.6)
    c.drawImage(atlas,sx,sy+256*bottom,256,256*(1-bottom),x,floor,width,(1-bottom)*size)
  }
  c.restore()
}

function drawAvatarBoot(c:Ctx,x:number,y:number,painted:boolean,far=false){
  if(!painted){oval(c,x,y,6,3,'#e4cfac');return}
  c.beginPath()
  c.moveTo(x-4.2,y-4.3)
  c.quadraticCurveTo(x-1,y-5,x+1.8,y-3.8)
  c.bezierCurveTo(x+3,y-2.5,x+7,y-2.3,x+6.8,y-.1)
  c.quadraticCurveTo(x+5.9,y+1.5,x-4,y+.9)
  c.quadraticCurveTo(x-5,y-.7,x-4.2,y-4.3)
  c.fillStyle=far?'#3f2c21':'#513829';c.fill();c.strokeStyle='#39281fb5';c.lineWidth=.85;c.stroke()
  c.beginPath();c.moveTo(x+1,y-2.1);c.quadraticCurveTo(x+3,y-1.9,x+4.4,y-1)
  c.strokeStyle='#ad7845a0';c.lineWidth=.8;c.stroke()
}

function limbDirection(from:OfficePoint,to:OfficePoint):OfficePoint{
  const x=to.x-from.x,y=to.y-from.y,length=Math.hypot(x,y)
  return length>.01?{x:x/length,y:y/length}:{x:0,y:1}
}

/** A single length of cloth follows the joint, with the shoulder or hip hidden under the coat. */
function paintedFabric(c:Ctx,start:OfficePoint,bend:OfficePoint,end:OfficePoint,widths:readonly [number,number,number],color:string,edge:string,shade?:{far?:boolean}){
  const upper=limbDirection(start,bend),lower=limbDirection(bend,end),curve=limbDirection(start,end)
  const [a,b,d]=widths
  c.beginPath()
  c.moveTo(start.x-upper.y*a,start.y+upper.x*a)
  c.quadraticCurveTo(bend.x-curve.y*b,bend.y+curve.x*b,end.x-lower.y*d,end.y+lower.x*d)
  c.lineTo(end.x+lower.y*d,end.y-lower.x*d)
  c.quadraticCurveTo(bend.x+curve.y*b,bend.y-curve.x*b,start.x+upper.y*a,start.y-upper.x*a)
  c.fillStyle=color;c.fill()
  // The far arm turns away from the key light.
  if(shade?.far){c.fillStyle='#24141c38';c.fill()}
  c.lineWidth=shade?.7:.85;c.strokeStyle=edge;c.stroke()
  if(shade){
    // Underside shade on the side away from the warm key light.
    c.beginPath()
    c.moveTo(start.x-upper.y*a*.5,start.y+upper.x*a*.5)
    c.quadraticCurveTo(bend.x-curve.y*b*.55,bend.y+curve.x*b*.55,end.x-lower.y*d*.45,end.y+lower.x*d*.45)
    c.lineWidth=Math.max(1.1,b*.72);c.strokeStyle='#2a171533';c.stroke()
  }
  c.beginPath()
  c.moveTo(start.x+upper.y*a*.47,start.y-upper.x*a*.47)
  c.quadraticCurveTo(bend.x+curve.y*b*.45,bend.y-curve.x*b*.45,end.x+lower.y*d*.12,end.y-lower.x*d*.12)
  c.lineWidth=shade?1.2:1.4;c.strokeStyle=!shade?'#ffcb8733':shade.far?'#ffcb871c':'#ffd69a40';c.stroke()
}

function paintedGrip(c:Ctx,hand:OfficePoint,aim:OfficePoint,skin:string,small?:boolean,keyPlaneTilt?:number){
  c.save();c.translate(hand.x,hand.y)
  if(keyPlaneTilt!==undefined){c.rotate(-keyPlaneTilt);c.scale(1,.62);c.rotate(-Math.PI/2)}
  else c.rotate(Math.atan2(aim.y,aim.x))
  const size=small?.86:1
  c.scale(size,size)
  c.beginPath();c.moveTo(-3.8,-1.8);c.quadraticCurveTo(-.4,-1.7,.6,-2.8)
  c.bezierCurveTo(2.1,-2.9,3.5,-1.5,3.1,.7)
  c.quadraticCurveTo(2.3,2.6,-3.5,2);c.closePath()
  c.fillStyle=skin;c.fill()
  c.strokeStyle='#5335228c';c.lineWidth=.65;c.stroke();c.restore()
}

// Lowest neck pixel of each painted hairstyle (cell px), measured per view. Long
// hair hides the bob's nape, so its back and profile follow the front framing.
const paintedNecks={
  front:[208,199,222,224,216,217,234,215,210,210],
  back:[204,193,221,221,218,220,240,214,210,210],
  profile:[224,219,221,216,217,216,236,212,210,210],
} as const
// Painted standing legs hang from this hip height; the trim torso leaves ~19 units of legs.
export const officeStandingHip=28.5
// Standing hem line of each Desktop garment, in avatar units above the feet.
const workwearHems:Partial<Record<NonNullable<OfficeAppearance['outfit']>,number>>={coat:-10.5,jacket:-13.5,overalls:-13,hoodie:-14.5,vest:-15.5,striped:-14.5}
// The cape stays with its wearer when they change activities.
const paintedCloaks=[
  {cell:undefined,sleeve:'#8d5236'},{cell:undefined,sleeve:'#a56d3c'},
  {cell:2,sleeve:'#734762'},{cell:1,sleeve:'#446459'},
  {cell:3,sleeve:'#626634'},{cell:0,sleeve:'#464d6e'},
] as const
type PaintedWear='jacket'|'hoodie'|'overalls'|'vest'|'striped'|'shirt'
// Sheet, row and sampled sleeve fabric of each hand-painted sleeveless garment.
const paintedWearCells:Record<PaintedWear,{sheet:0|1;row:number;sleeve:string}>={
  jacket:{sheet:0,row:0,sleeve:'#746633'},hoodie:{sheet:0,row:1,sleeve:'#a44e2e'},overalls:{sheet:0,row:2,sleeve:'#d4b98f'},
  vest:{sheet:1,row:0,sleeve:'#d2b690'},striped:{sheet:1,row:1,sleeve:'#4a625c'},shirt:{sheet:1,row:2,sleeve:'#a66b34'},
}
// Measured in the 256px cells: the painted cloth spans rows 32..224 in every view.
// `x` centres the collar under the painted neck; `arm` is the open armhole of the
// near arm and `far` the hidden shoulder the far arm turns behind.
const paintedWearViews={
  front:{column:0,x:1.2,arm:{x:81,y:92},far:{x:170,y:94}},
  profile:{column:1,x:.4,arm:{x:113,y:92},far:{x:142,y:94}},
  back:{column:2,x:1,arm:{x:174,y:94},far:{x:86,y:94}},
} as const
const paintedWearTop=32/256,paintedWearHem=224/256
/** Standing and seated cell sides that put the collar at the neck and the hem above the knee. */
export const officePaintedWearScale={standing:32,seated:30,collar:-43} as const
// Trim painted cloak frame, matched to the workwear build.
const paintedCloakFit={width:38,profileWidth:33,height:35,seatedHeight:31,top:-49} as const

/** Layered character whose local origin is the seat/feet. */
export function drawOfficeAvatar(c:Ctx,a:OfficeAppearance,x:number,y:number,time:number,p:OfficeAvatarPose={},atlas?:CanvasImageSource|null,terminalStool=false) {
  c.save();c.translate(x,y)
  const art=a.kind==='human'?atlas:null
  const extraHeads=art?officeAvatarExtraHeadAtlases.get(art):undefined
  const look=officePaintedAvatarLook(a.slot,extraHeads?10:6),variant=look.hair
  const coats=art?officeAvatarCoatAtlases.get(art):undefined
  const dressed=art&&p.workwear&&!p.portrait?a.outfit:undefined
  // Desktop outfits are all painted raster garments once the workwear sheets load:
  // six sleeveless three-angle pieces, with coats and ponchos wearing the painted cloaks.
  const wearSheets=dressed?[officeAvatarWorkwearV1Atlases.get(art!),officeAvatarWorkwearV2Atlases.get(art!)] as const:undefined
  const wearCell=dressed&&dressed in paintedWearCells?paintedWearCells[dressed as PaintedWear]:undefined
  const wearSheet=wearCell?wearSheets?.[wearCell.sheet]:undefined
  const paintedWear=wearCell&&wearSheet?{...wearCell,source:wearSheet}:undefined
  const cloakForCoat=dressed==='coat'&&Boolean(wearSheets?.[0]||wearSheets?.[1])
  const workwear=dressed&&dressed!=='poncho'&&!paintedWear&&!cloakForCoat?dressed:undefined
  const cloak=paintedCloaks[coats?look.cloak:variant]
  const skin=coats?look.skin:a.skin
  const cloth=paintedWear?paintedWear.sleeve:workwear==='overalls'?'#927759':workwear==='striped'?'#5c716b':art?(coats?cloak.sleeve:a.slot%2?'#a56d3c':'#8d5236'):a.shirt
  const trousers=art?'#534637':a.pants
  const m=idleMotion(time,p),stretch=p.stretch??0
  const weight=p.walk?Math.max(0,Math.min(1,p.walkWeight??1)):0,gait=p.gait??time*7
  const walk=p.walk?officeWalkPose(a.slot,gait,weight,Boolean(p.carry||p.mug||p.cup),p.stepLength,p.stepDirection?{x:p.stepDirection.x*(p.face===-1?-1:1),y:p.stepDirection.y}:undefined,p.liftCrossing?1.45:1):null
  if(walk){const swing=Math.sin(gait)*3*weight;m.left=walk.arm-swing;m.right=p.carry||p.mug||p.cup?0:-walk.arm+swing;m.tilt+=walk.headTilt}
  const support=officeSeatFrame(p,m.lift),seated=support.seated,settleOffset=support.settle,lean=p.walk?0:(p.lean??0)*(1-seated)
  const roomBody=Boolean(art&&!p.portrait),bodyDrop=roomBody?5*seated:0
  const legArt=art&&roomBody?officeAvatarLegAtlases.get(art):undefined
  const seatAdjustment=roomBody&&p.seatHeight!==undefined?seated*(18-p.seatHeight):0
  const workLift=Number.isFinite(p.workLift)&&!p.walk&&!p.sit&&!p.climb?Math.max(0,Math.min(8,p.workLift!)):0
  oval(c,0,1,15,3,'#3d241c30',false) // Shadow stays on the floor during hops.
  const bob=p.walk?0:-(p.hop??0)*(1-seated)
  c.translate(0,bob)
  if(p.face===-1)c.scale(-1,1)
  if(lean)c.rotate(-lean)
  const notebook=roomBody&&p.workGesture?.notebook
  const bench=p.sit&&(p.mug||p.objectAction||notebook),back=p.climb||(!p.walk&&p.workBack)||(p.sit&&seated>.8&&!bench&&!p.workGesture?.profile&&!p.seatProfile)||Boolean(p.walk&&p.stepDirection&&p.stepDirection.y<-.35&&Math.abs(p.stepDirection.y)>Math.abs(p.stepDirection.x)*.8),raised=p.hand||p.wave||p.climb||p.objectAction==='music'
  const walksAcross=p.walk&&!back&&Math.abs(p.stepDirection?.x??1)>.55
  const reading=Boolean(p.sit&&!p.walk&&p.objectAction==='book')
  const sideView=roomBody&&(walksAcross||p.workGesture?.profile||p.seatProfile||reading||p.meeting)
  const profile=art&&sideView?officeAvatarProfileAtlases.get(art):undefined
  if(roomBody&&reading){m.headX+=1.3*seated;m.headY+=1.4*seated;m.tilt+=.1*seated}
  // Legs are anchored to the floor or stool while the coat follows the hips.
  const climbPhase=(p.climbStep??time*2)*Math.PI
  const step=p.climb?Math.sin(climbPhase)*4.5:p.walk ? Math.sin(gait)*3*weight : 0
  const bend=support.bend
  const profileSeat=roomBody&&(p.workGesture?.profile||p.seatProfile||reading)?bend:0
  if(notebook){
    const height=p.seatHeight??18
    round(c,-10,1-height,3,height-1,'#674028',1);round(c,6,1-height,3,height-1,'#674028',1)
    round(c,-8,-6,15,2,'#99633a',1)
    oval(c,-1,1-height,12,3.5,'#b37843')
  }
  const canPaintLegs=legArt&&!p.walk&&!p.climb
  const seatArtBlend=canPaintLegs?Math.min(1,Math.max(0,(seated-.32)/.68)):0
  // A tall Terminal stool is approached from behind like the other rear seats; the
  // painted shins lengthen to the floor instead of stretching the whole lower body.
  const rearStool=back&&!sideView&&!reading
  const standingArt=canPaintLegs&&seated===0&&!p.rising
  if(standingArt){
    drawLowerBody(c,legArt,p.supportHands?'workStanding':'standing',officeStandingHip+workLift)
  }else if(art&&seatArtBlend<1){
    c.save();c.globalAlpha*=1-seatArtBlend
    // In profile both hips sit near the pelvis centre and the far leg falls into shade.
    const across=roomBody&&walksAcross
    for(const [side,foot] of [[-1,walk?.left],[1,walk?.right]] as const){
      const frontBackWalk=roomBody&&Boolean(foot)&&!across
      const x=foot?(across?(foot.x-side*7)*.78+side*1.2:frontBackWalk?side*4.2+(foot.x-side*7)*.35:foot.x):mix(side*mix(6.5,roomBody?10:8,bend),7+side*4,profileSeat)
      const y=foot?.y??(-side*step+side*1.5*profileSeat)
      const hip={x:side*(across?1.1:frontBackWalk?3.8:5.5)+(walk?.sway??0),y:(roomBody?-officeStandingHip+bodyDrop+3*bend:-18)+(walk?.torsoY??0)-workLift+seatAdjustment}
      const ankle={x,y:y-2.5}
      const kneeSide=sideView||!back?-1:side===1?-1:1
      const knee=across&&foot?(()=>{
        const dist=Math.hypot(ankle.x-hip.x,ankle.y-hip.y)
        const segLen=foot.planted?Math.max(dist/2+.12,12.6):Math.max(dist/2+.75,13.1)
        return officeLimbBend(hip,ankle,segLen,segLen,-1)
      })():frontBackWalk&&foot?{x:(hip.x+ankle.x)/2,y:(hip.y+ankle.y)/2+(foot.planted?0:-1.5)}:
        roomBody?officeLimbBend(hip,ankle,13.6,13.6,kneeSide):
        foot?.knee??{x:x+bend*(back?side*2.7:3),y:mix((hip.y+y)/2,-8,bend)}
      const far=across&&side<0
      paintedFabric(c,hip,knee,ankle,across||frontBackWalk?[4.2,3.7,2.8]:[4.5,4,3],far?'#43382d':trousers,'#372a24ad')
      c.save();c.translate(x,y);if(foot)c.rotate(foot.angle);if(across||frontBackWalk)c.scale(.86,.9);drawAvatarBoot(c,0,0,true,far);c.restore()
    }
    c.restore()
  }else if(walk){
   for(const [foot,hip] of [[walk.left,-7],[walk.right,7]] as const){
    for(const [color,width] of [['#4b3025',8],[trousers,5.5]] as const){c.beginPath();c.moveTo(hip+walk.sway,-17+walk.torsoY);c.lineTo(foot.knee.x,foot.knee.y);c.lineTo(foot.x,foot.y-1);c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.lineWidth=width;c.stroke()}
    c.save();c.translate(foot.x,foot.y);c.rotate(foot.angle);drawAvatarBoot(c,0,0,Boolean(art));c.restore()
   }
  }else if(!art){
   round(c,-10,mix(-17-workLift,-10,bend),8,mix(17+workLift+step,9,bend),trousers);round(c,2,mix(-17-workLift,-10,bend),8,mix(17+workLift-step,9,bend),trousers)
   drawAvatarBoot(c,-7,step,Boolean(art));drawAvatarBoot(c,7,-step,Boolean(art))
  }
  if(legArt&&seatArtBlend>0){
    c.save();c.globalAlpha*=seatArtBlend
    const legPose=rearStool?'rearSeat':reading||notebook?'reading':'workSeat'
    drawLowerBody(c,legArt,legPose,mix(officeStandingHip,p.seatHeight??18,seated))
    c.restore()
  }
  let torsoY=-support.torsoLift+(legArt?0:settleOffset)+(walk?.torsoY??0)-workLift+seatAdjustment
  const torsoX=walk?.sway??(p.workGesture?.lean??0)+(reading&&roomBody?2*seated:0)
  const face=p.face??1
  const supportedTilt=p.supportHands?p.workGesture?.tilt??0:0
  // A screen-plane roll only reads as leaning toward the work in profile. Facing
  // away or toward the viewer, the same effort becomes a small forward hunch.
  const hunch=roomBody&&!sideView?supportedTilt:0
  const workTilt=roomBody?(reading ? .22*seated : legArt&&walksAcross?.045*weight:sideView?supportedTilt:0):0
  if(hunch){m.headY+=hunch*9;torsoY+=hunch*4}
  const cos=Math.cos(workTilt),sin=Math.sin(workTilt),pivot=legArt?19:14
  const toTorso=({x,y}:OfficePoint):OfficePoint=>{
    const dx=x*face-torsoX,dy=y-torsoY+pivot
    return {x:cos*dx+sin*dy,y:cos*dy-sin*dx-pivot}
  }
  c.save();c.translate(torsoX,torsoY)
  if(workTilt){c.translate(0,-pivot);c.rotate(workTilt);c.translate(0,pivot)}
  const workBehind=Boolean(art&&back&&p.supportHands)
  const nearSide=roomBody&&sideView&&!workBehind
  const wearView=paintedWearViews[sideView?'profile':back?'back':'front']
  // The painted collar meets the neck; the hem stops above the knee or rests at the seat edge.
  const wearFrame=paintedWear?(()=>{
    const size=mix(officePaintedWearScale.standing,officePaintedWearScale.seated,seated)
    const top=officePaintedWearScale.collar+bodyDrop-paintedWearTop*size
    const left=wearView.x-size/2
    const at=({x,y}:{x:number;y:number})=>({x:left+x/256*size,y:top+y/256*size})
    return {size,top,left,hem:top+paintedWearHem*size,arm:at(wearView.arm),far:at(wearView.far)}
  })():undefined
  const paintCoat=()=>{
    // Garment hems end above the knee standing and drape just over the seat edge when sitting.
    const collar=(roomBody?-51+bodyDrop:-43)+9
    const hem=workwear?mix(workwearHems[workwear]??-14,workwear==='coat'?-12.5:-14.5,seated):0
    if(art){
      // The atlas pieces have transparent margins. Tuck the neck under the painted collar.
      const neckX=back?1:3
      if(roomBody&&(workwear||paintedWear)){
        // A soft neck under the chin, shaded where the collar meets it.
        c.beginPath();c.roundRect(neckX-3.2,-46+bodyDrop,6.6,8,2.6);c.fillStyle=skin;c.fill()
        c.fillStyle='#3a20142a';c.fill()
      }else round(c,neckX-3.5,roomBody?-47+bodyDrop:-41,9,9,skin,3)
      const coatWidth=roomBody?(sideView?paintedCloakFit.profileWidth:paintedCloakFit.width):46
      const coatY=roomBody?paintedCloakFit.top+bodyDrop:-43
      // Seated capes rest on the stool; the painted sheet keeps its proportions.
      const coatHeight=roomBody?mix(paintedCloakFit.height,legArt?paintedCloakFit.seatedHeight:paintedCloakFit.height,seated):38
      if(paintedWear&&wearFrame){
        // Square cells, never squashed: the profile cell is already painted narrower.
        const {size,left,top}=wearFrame
        c.drawImage(paintedWear.source,wearView.column*256,paintedWear.row*256,256,256,left,top,size,size)
      }else if(workwear){
        c.save();c.translate(0,collar)
        drawOfficePaintedWorkwear(c,workwear,cloth,Boolean(back),Boolean(sideView),hem-collar)
        c.restore()
      }else if(coats&&cloak.cell!==undefined){
        drawAvatarPart(c,coats,Math.floor(cloak.cell/2),2*(cloak.cell%2)+(back?1:0),-coatWidth/2,coatY,coatWidth,coatHeight)
      }else drawAvatarPart(c,art,(coats?look.cloak:a.slot)%2,back?3:2,-coatWidth/2,coatY,coatWidth,coatHeight)
    }else{
      round(c,-14,-34,28,23,a.shirt,9)
      drawOutfit(c,a,Boolean(p.climb))
    }
    if(!lateWardrobe)paintWardrobe()
  }
  // Painted collar accents facing the viewer sit over the painted neck, so they follow the head.
  const lateWardrobe=Boolean(art&&roomBody&&!back&&!workwear)
  const paintWardrobe=()=>{
    if(!p.wardrobe&&!p.wardrobeTransition)return
    const collar=(roomBody?-51+bodyDrop:-43)+9
    const hem=workwear?mix(workwearHems[workwear]??-14,workwear==='coat'?-12.5:-14.5,seated):0
    c.save()
    if(workwear&&(p.wardrobe||p.wardrobeTransition)){
      // Knit and cardigan edges stay inside the garment, even when a seated hem rises.
      c.save();c.translate(0,collar);if(sideView){c.translate(1,0);c.scale(.7,1)}
      traceOfficeWorkwear(c,workwear,Boolean(back),hem-collar)
      c.restore();c.clip()
    }
    if(roomBody)c.translate(0,-6+bodyDrop)
    // Painted bodies wear compact collar and chest accents; legacy figures keep translucent edges.
    if(paintedWear)c.translate(wearView.x,0)
    // Seasonal layers follow the drawn torso: narrowed in profile and inside the workwear edge.
    const fit=roomBody?{width:sideView?(paintedWear?.75:.6):workwear?.84:1,profile:Boolean(sideView)}:undefined
    if(p.wardrobeTransition){
      const look=p.wardrobeTransition
      if(look.progress<1){c.save();c.globalAlpha*=1-look.progress;drawOfficeWardrobe(c,a,look.from,Boolean(back),Boolean(art),fit);c.restore()}
      if(look.progress>0){c.save();c.globalAlpha*=look.progress;drawOfficeWardrobe(c,a,look.to,Boolean(back),Boolean(art),fit);c.restore()}
    }else if(p.wardrobe)drawOfficeWardrobe(c,a,p.wardrobe,Boolean(back),Boolean(art),fit)
    c.restore()
  }
  const keyboard=p.workGesture?.keyboard
  const keyPlaneTilt=!p.rising&&(keyboard||notebook)&&p.workGesture?.kind==='type'?workTilt:undefined
  const paintKeyboard=()=>{
    if(!keyboard)return
    const key=toTorso(keyboard)
    c.save();c.translate(key.x,key.y);if(workTilt)c.rotate(-workTilt)
    round(c,-12,-3,24,6,'#435251',1)
    for(let i=0;i<5;i++){
      c.fillStyle=p.typing&&time&&Math.floor(time*9)%5===i?'#cfe4b0':'#8d9a83'
      c.fillRect(-9+i*4,-1,2,2)
    }
    c.restore()
  }
  const contacts=officeHandContacts({...p,gait},{...m,...(p.scratch?{wave:Math.sin(time*12)*2}:{}),lift:support.torsoLift-settleOffset})
  const paintedBody=Boolean(coats||paintedWear)
  if(paintedBody&&walksAcross&&!raised){
    if(!p.carry&&!p.cup&&!p.mug){
      const swing=Math.sin(gait)*5.2*weight
      contacts.left={x:.8-swing,y:-17.5-Math.max(0,-swing)*.25}
      contacts.right={x:-.4+swing,y:-17.5-Math.max(0,swing)*.25}
    }else{
      contacts.left={x:1.5-Math.sin(gait)*2.5*weight,y:-18}
      contacts.right={...contacts.right,x:7,y:-22}
      if(p.cup||p.mug)contacts.cup={...contacts.cup,pivot:{...contacts.right}}
    }
  }else if(paintedBody&&p.walk&&!sideView&&!p.carry&&!p.cup&&!p.mug&&!raised){
    const swing=Math.sin(gait)*2.2*weight
    contacts.left={x:-9.8,y:-18.5+swing}
    contacts.right={x:10.2,y:-18.5-swing}
  }
  if(roomBody&&reading){
    contacts.left={x:mix(contacts.left.x,7,seated),y:mix(contacts.left.y,legArt?-22:-27,seated)}
    contacts.right={x:mix(contacts.right.x,17,seated),y:mix(contacts.right.y,legArt?-23:-28,seated)}
    contacts.shared={x:(contacts.left.x+contacts.right.x)/2,y:(contacts.left.y+contacts.right.y)/2}
  }
  // Painted room figures at rest let their hands hang close to the trim torso.
  const relaxed=roomBody&&!p.walk&&!p.climb&&!p.liftWait&&!raised&&!p.objectAction&&!p.typing&&!p.scratch&&!p.offer&&!stretch&&
    !p.supportHands&&!p.dressing&&!p.mug&&!p.cup&&!p.carry&&!p.workGesture&&!reading&&!notebook
  if(relaxed){
    if(sideView){contacts.left={...contacts.left,x:3};contacts.right={...contacts.right,x:.8}}
    else{contacts.left={...contacts.left,x:-10.5};contacts.right={...contacts.right,x:11}}
    contacts.shared={x:(contacts.left.x+contacts.right.x)/2,y:(contacts.left.y+contacts.right.y)/2}
  }
  if(roomBody&&sideView&&p.meeting&&!p.walk&&!p.supportHands&&!p.climb&&!reading&&!notebook&&!p.mug&&!p.cup&&!relaxed){
    // In side-profile table meetings keep the far hand tucked at the hip and gesture
    // conversationally forward instead of flinging the far hand behind the spine or
    // raising the near hand across the forehead.
    contacts.left={x:2.2,y:-19}
    contacts.right=raised?{x:10.5,y:-30+m.wave*.45}:{x:1,y:-19}
    contacts.shared={x:(contacts.left.x+contacts.right.x)/2,y:(contacts.left.y+contacts.right.y)/2}
  }
  const shoulderSide=p.supportHands?p.face??1:1
  // In profile the near arm leaves the painted armhole and the far shoulder sits just
  // ahead of it behind the chest. Facing 3/4, the near arm rises out of the open
  // armhole and the far one turns behind the garment.
  const shoulderAt=(side:number):OfficePoint=>{
    const near=side===shoulderSide
    if(roomBody&&sideView){
      const y=wearFrame?wearFrame.arm.y:-36+bodyDrop
      return {x:near?(wearFrame?wearFrame.arm.x:-1.8):1.8,y:near?y:y+.6}
    }
    if(wearFrame)return (back?side>0:side<0)?wearFrame.arm:wearFrame.far
    return {x:side*(roomBody?(workwear?10.8:9.2):10),y:roomBody?-36.5+bodyDrop+(workwear?.7:0):-30}
  }
  const workGrip=(target:OfficePoint,side:number)=>{
    const hand=toTorso(target),shoulder=shoulderAt(side)
    const length=Math.hypot(hand.x-shoulder.x,hand.y-shoulder.y)
    const reach=26
    if(!roomBody||length<=reach)return hand
    const direction=limbDirection(shoulder,hand)
    return {x:shoulder.x+direction.x*reach,y:shoulder.y+direction.y*reach}
  }
  const hands=p.supportHands?{...contacts,left:workGrip(p.supportHands.left,-shoulderSide),right:workGrip(p.supportHands.right,shoulderSide)}:contacts
  const {x:lx,y:ly}=hands.left,{x:rx,y:ry}=hands.right
  const arms=[
    {hand:hands.left,side:-shoulderSide},
    {hand:hands.right,side:shoulderSide},
  ].map(({hand,side})=>{
    const shoulder=shoulderAt(side)
    const distance=Math.hypot(hand.x-shoulder.x,hand.y-shoulder.y)
    // Relaxed arms hang almost straight; reaching arms use the full bone length.
    const length=sideView&&!p.supportHands
      ?(p.walk?Math.min(10.5,Math.max(distance/2+.35,8.6)):p.meeting?Math.min(10.5,Math.max(distance/2+.35,7.8)):10.5)
      :p.supportHands||!roomBody?13
      :p.walk&&paintedBody?Math.min(11,Math.max(distance/2+.25,6))
      :Math.min(13,Math.max(distance/2+.9,6))
    const elbowSide=sideView?1:officeElbowSide(shoulder,hand,side,length)
    const elbow=roomBody?officeLimbBend(shoulder,hand,length,length,elbowSide):
      {x:(shoulder.x+hand.x)/2+side*2.8,y:(shoulder.y+hand.y)/2+3.5}
    const aim=limbDirection(elbow,hand)
    return {hand,side,shoulder,elbow,aim,wrist:{x:hand.x-aim.x*2.3,y:hand.y-aim.y*2.3}}
  })
  // Facing 3/4 in a painted garment, an arm hanging on the far side turns behind it.
  const farSide=back?-1:1
  const farArm=paintedWear&&!sideView&&!workBehind?arms.find(arm=>arm.side===farSide&&arm.hand.x*farSide>=(p.walk?4.5:5.5)):undefined
  if(!workBehind&&!nearSide&&!farArm){paintCoat();paintKeyboard()}
  else if(!farArm)paintKeyboard()
  if(art){
    const sleeve=(arm:typeof arms[number],far=false)=>{
      if(roomBody){
        // A soft sleeve head blends into the armhole without an inked ring.
        const radius=2.9
        c.beginPath();c.ellipse(arm.shoulder.x,arm.shoulder.y+.4,radius,radius*1.08,0,0,Math.PI*2)
        c.fillStyle=cloth;c.fill()
        c.fillStyle=far?'#24141c38':'#ffd69a1c';c.fill()
        paintedFabric(c,arm.shoulder,arm.elbow,arm.wrist,[3.1,2.6,2],cloth,'#4a2e2070',{far})
      }else paintedFabric(c,arm.shoulder,arm.elbow,arm.wrist,[3.65,3.1,2.3],cloth,'#513223a8')
    }
    if(nearSide){
      const [far,near]=arms
      sleeve(far,true);paintedGrip(c,far.hand,far.aim,skin,true,keyPlaneTilt)
      paintCoat();sleeve(near)
    }else if(farArm){
      sleeve(farArm,true);paintedGrip(c,farArm.hand,farArm.aim,skin,Boolean(p.workGesture),keyPlaneTilt)
      paintCoat();paintKeyboard()
      for(const arm of arms)if(arm!==farArm)sleeve(arm)
    }else for(const arm of arms)sleeve(arm)
  }else if(p.supportHands||p.walk){
   for(const [hx,hy,shoulder] of [[lx,ly,-13*shoulderSide],[rx,ry,13*shoulderSide]])for(const [color,width] of [['#4b3025',8],[cloth,5.5]] as const){
    const elbowX=(shoulder+hx)/2+(shoulder<0?-2:2),elbowY=(-28+hy)/2+3
    c.beginPath();c.moveTo(shoulder,-28)
    c.lineTo(elbowX,elbowY);c.lineTo(hx,hy)
    c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.lineWidth=width;c.stroke()
   }
  }else{oval(c,(-13+lx)/2,(-28+ly)/2,5,9,a.shirt);oval(c,(13+rx)/2+1,(-28+ry)/2,5,9,a.shirt)}
  if(!art&&p.runtime&&!back)drawShirtLogo(c,p.runtime,1,-20)
  const paintHead=()=>{
    c.save();c.translate(m.headX+(p.acknowledgment??0)*1.5,m.headY-(p.lookUp?3:0)+(p.acknowledgment??0)*2.5)
    if(m.tilt){c.translate(0,-30);c.rotate(m.tilt);c.translate(0,30)}
    const headBack=back&&!p.workGesture?.profile
    const view=headBack?1:0
    const alternateHeads=art&&variant>=2?officeAvatarHeadAtlases.get(art):undefined
    // Painted heads keep their square cells undistorted in every view.
    const headWidth=roomBody?32:40,headHeight=roomBody?32:42
    const headView=sideView?'profile':headBack?'back':'front'
    // Each sheet frames its hairstyles a little differently; seat every neck on the collar.
    const neckLine=roomBody&&art?(223-paintedNecks[headView][variant])*headHeight/256:0
    const headX=-headWidth/2+(sideView?2:headBack?0:roomBody?-1.2:-2),headY=(roomBody?-69+bodyDrop:-67)+Math.max(-4.5,Math.min(4.5,neckLine))
    const extra=variant>=6?extraHeads:undefined
    const headSource=extra??profile??(variant<2?art:alternateHeads)
    const row=extra?variant-6:profile?Math.floor(variant/3):variant<2?variant:Math.floor((variant-2)/2)
    const column=extra?(sideView?1:headBack?2:0):profile?variant%3:variant<2?view:(variant%2)*2+view
    if(headSource){
      // The braid in the first supplemental row reaches into the top of the next cell.
      const skip=extra&&row===1?8:0
      const tinted=coats?officeTintedHead(headSource,row,column,headView,look,skip):undefined
      if(tinted)c.drawImage(tinted,headX,headY,headWidth,headHeight)
      else if(skip)c.drawImage(headSource,column*256,row*256+skip,256,256-skip,headX,headY+skip*headHeight/256,headWidth,headHeight*(256-skip)/256)
      else drawAvatarPart(c,headSource,row,column,headX,headY,headWidth,headHeight)
    }
    else {
      c.save()
      if(roomBody){c.translate(0,-42+bodyDrop);c.scale(.76,.76);c.translate(0,30)}
      drawOfficeHead(c,a,Boolean(headBack),p.doze??false)
      c.restore()
    }
    if(p.party&&!p.lead){
      // Striped party cone with a pompom, tilted a little.
      const hues=['#ff7aa8','#7bc8ff','#ffd35a','#8be08b'],hue=hues[a.slot%hues.length]
      c.save();c.translate(3,-60);c.rotate(.18);c.beginPath();c.moveTo(-7,0);c.lineTo(7,0);c.lineTo(0,-19);c.closePath();c.fillStyle=hue;c.fill();c.strokeStyle='#4b3025';c.lineWidth=1.3;c.stroke()
      c.beginPath();c.moveTo(-4.5,-6);c.lineTo(4.5,-6);c.moveTo(-2.4,-12);c.lineTo(2.4,-12);c.strokeStyle='#fff6';c.lineWidth=1.6;c.stroke()
      oval(c,0,-20,2.6,2.6,'#fff7d6');c.restore()
    }
    if(!art&&p.lead){c.fillStyle='#ffe08b';c.strokeStyle='#80511c';c.lineWidth=1.4;c.beginPath();c.moveTo(-8,-72);c.lineTo(-4,-68);c.lineTo(0,-75);c.lineTo(4,-68);c.lineTo(8,-72);c.lineTo(6,-64);c.lineTo(-6,-64);c.closePath();c.fill();c.stroke()}
    c.restore() // head
  }
  if(!workBehind){paintHead();if(lateWardrobe)paintWardrobe()}
  if((p.mug||p.cup)&&(!p.objectAction||p.objectAction==='coffee')&&!raised&&!p.scratch&&stretch<.3){c.save();c.translate(hands.cup.pivot.x,hands.cup.pivot.y);c.rotate(hands.cup.angle);round(c,-10,-5,9,10,'#fff0cf',2);oval(c,1,0,3,3,'#ead6ae');c.restore()}
  if(p.objectAction&&!p.walk&&!p.climb){
    c.save()
    if(p.objectAction==='book'||p.objectAction==='game'||p.objectAction==='snack')c.globalAlpha*=Math.max(0,Math.min(1,p.seatBlend??1))
    if(roomBody&&reading)drawProfileBook(c,hands.shared)
    else if(roomBody&&p.objectAction==='book'){
      // A standing reader holds a pocket-sized volume between the hands, not a sign board.
      const {x:bx,y:by}=hands.shared
      c.save();c.translate(bx,by);c.scale(.66,.66);c.translate(-bx,-by)
      drawLeisureProp(c,'book',hands,time);c.restore()
    }
    else drawLeisureProp(c,p.objectAction,hands,time)
    c.restore()
  }
  if(p.carry){if(p.climb)round(c,-10,-31,20,18,'#967450',4);else{round(c,rx-13,ry+2,20,14,'#c69a58',2);round(c,rx-12,ry,9,4,'#dbc38c',1)}}
  if(notebook){
    const lap=toTorso({x:0,y:2-(p.seatHeight??18)})
    c.save();c.translate(lap.x,lap.y);if(workTilt)c.rotate(-workTilt)
    const lid=p.rising?Math.max(0,Math.min(1,(seated-.45)/.55)):1
    if(p.rising)c.globalAlpha*=Math.min(1,seated*2)
    if(lid>0){
      round(c,-13,-12*lid,23,12*lid,'#55473c',2)
      if(lid>.25){
        round(c,-11,-10*lid,19,8*lid,'#4e726b',1)
        c.fillStyle='#a8b999';c.fillRect(-8,-8*lid,9,lid);c.fillRect(-8,-5*lid,12,lid)
      }
    }
    round(c,-15,0,27,3,'#705e46',1)
    c.restore()
  }
  if(p.planningNote)drawProfileBook(c,hands.shared)
  drawWorkGestureProp(c,p,hands)
  if(art){
    for(const arm of nearSide?arms.slice(1):arms.filter(arm=>arm!==farArm))paintedGrip(c,arm.hand,arm.aim,skin,Boolean(p.workGesture)||nearSide,keyPlaneTilt)
  }else{
    const palm=p.workGesture?3:4
    oval(c,lx,ly,palm,palm,a.skin);oval(c,rx,ry,palm,palm,a.skin)
  }
  if(workBehind){
    paintCoat()
    if(wearFrame){
      // The near shoulder fills the open armhole while the arm reaches past the body.
      const {x:ax,y:ay}=wearFrame.arm
      c.beginPath();c.ellipse(ax,ay+1.8,2.5,3.9,-.12,0,Math.PI*2)
      c.fillStyle=cloth;c.fill()
      c.fillStyle='#24141c2e';c.fill()
      c.beginPath();c.ellipse(ax-.5,ay+.6,1.2,2.2,-.12,0,Math.PI*2);c.fillStyle='#ffd69a24';c.fill()
    }
    if(legArt&&p.workGesture){
      const near=arms[shoulderSide===1?1:0]
      // The cloak covers the upper arm. Only the last part of the cuff reaches above it.
      const sleeve={x:near.wrist.x-5*near.aim.x,y:near.wrist.y-5*near.aim.y}
      const cuff={x:near.wrist.x-2.5*near.aim.x,y:near.wrist.y-2.5*near.aim.y}
      paintedFabric(c,sleeve,cuff,near.wrist,[2.3,2.1,1.9],cloth,'#513223a8')
      paintedGrip(c,near.hand,near.aim,skin,true,keyPlaneTilt)
    }
    paintHead()
  }
  c.restore() // breathing torso
  if(back&&p.sit&&!p.walk&&!p.climb&&p.seatBack!==false){
    // Chair back is the foreground layer, matching the empty chairs in the room art.
    round(c,-12,-24,24,21,'#514a3c',6);round(c,-10,-22,20,16,'#625a48',5)
  }
  // At a desk the patch sits on the upper back, just above the chair, like a jersey.
  if(!art&&p.runtime&&back){c.save();c.translate(m.headX*.3+torsoX,torsoY);drawShirtLogo(c,p.runtime,0,-22);c.restore()}
  c.restore()
  const contact=(hand:OfficePoint)=>{
    const hx=torsoX+cos*hand.x-sin*(hand.y+pivot),hy=torsoY+sin*hand.x+cos*(hand.y+pivot)-pivot
    return {x:x+face*(Math.cos(lean)*hx+Math.sin(lean)*hy),y:y+bob+Math.cos(lean)*hy-Math.sin(lean)*hx}
  }
  return {left:contact(hands.left),right:contact(hands.right),seat:contact(toTorso({x:torsoX*face,y:torsoY-11}))}
}

/**
 * Decorative mood glyphs, drawn upper-left of the head in avatar units (never mirrored).
 * Deliberately avoids status symbols and colours (!, ×, …, amber, red).
 */
function drawMood(c:Ctx,mood:OfficeMood,time:number){
  c.save();c.lineWidth=1.2;c.strokeStyle='#4b3025'
  if(mood==='zzz'){
    c.textAlign='center'
    for(let i=0;i<3;i++){const k=(time*.45+i/3)%1;c.globalAlpha=(1-k)*.9;c.font=`bold ${6+k*5}px sans-serif`;c.fillStyle='#f3eedd';c.strokeText('z',-14-k*8,-72-k*18);c.fillText('z',-14-k*8,-72-k*18)}
  } else if(mood==='chat'){
    c.beginPath();c.roundRect(-36,-92,22,14,5);c.moveTo(-22,-78);c.lineTo(-17,-73);c.lineTo(-27,-78);c.fillStyle='#fffaf0';c.fill();c.stroke()
    c.beginPath();c.moveTo(-31,-88);c.lineTo(-19,-88);c.moveTo(-31,-83);c.lineTo(-24,-83);c.strokeStyle='#8a6a4c';c.stroke()
  } else if(mood==='idea'){
    oval(c,-20,-86,5.5,5.5,'#ffe58a');round(c,-22.5,-81,5,3,'#b8a07a',1)
    c.beginPath();for(const r of [-2.4,-1.57,-.7]){c.moveTo(-20+Math.cos(r)*8,-86+Math.sin(r)*8);c.lineTo(-20+Math.cos(r)*11,-86+Math.sin(r)*11)}c.strokeStyle='#e8b94a';c.stroke()
  } else if(mood==='note'){
    const k=(time*.8)%1;c.globalAlpha=1-k*.6;c.font='bold 11px sans-serif';c.textAlign='center';c.fillStyle='#fff3d6';c.strokeText('♪',-20-Math.sin(k*6)*2,-78-k*8);c.fillText('♪',-20-Math.sin(k*6)*2,-78-k*8)
  } else if(mood==='sigh'){
    oval(c,-26,-82,5,4,'#cfc8bd');oval(c,-20,-85,6,5,'#cfc8bd');oval(c,-14,-82,5,4,'#cfc8bd')
  }
  c.restore()
}

/** Bounded atmosphere: day butterflies and leaves or night fireflies; slow dust in rooms. */
const DUST_CAP=20
function drawAmbient(c:Ctx,scene:OfficeScene,time:number,night:boolean){
  const w=scene.width,H=scene.floors.find(f=>f.kind==='lounge')?.height??0
  c.save()
  if(H&&night){
    for(let i=0;i<6;i++){
      const x=w*(.12+.14*i)+Math.sin(time*.5+i*1.7)*16,y=H*(.42+.05*(i%4))+Math.cos(time*.7+i)*8,a=.3+.35*(.5+.5*Math.sin(time*1.6+i*2.1))
      c.fillStyle=`rgba(255,236,140,${a*.3})`;c.beginPath();c.ellipse(x,y,5,5,0,0,Math.PI*2);c.fill()
      c.fillStyle=`rgba(255,240,160,${a})`;c.beginPath();c.ellipse(x,y,1.8,1.8,0,0,Math.PI*2);c.fill()
    }
  } else if(H){
    for(let i=0;i<2;i++){
      const k=(time*.022+i*.5)%1,x=w*(.08+.84*k),y=H*(.36+.1*i)+Math.sin(time*1.3+i*3)*10,flap=Math.abs(Math.sin(time*12+i))
      c.fillStyle=i?'#f19bb8':'#f6c55a'
      c.beginPath();c.ellipse(x-2,y,.6+3*flap,3,0,0,Math.PI*2);c.ellipse(x+2,y,.6+3*flap,3,0,0,Math.PI*2);c.fill()
      c.fillStyle='#4b3025';c.fillRect(x-.5,y-2.5,1,5)
    }
    for(let i=0;i<2;i++){
      const k=((time+i*4.5)%9)/9,x=w*(.1+.12*i)+Math.sin(k*Math.PI*4)*10+k*24,y=H*(.12+k*.5)
      c.globalAlpha=k>.85?(1-k)/.15:1;c.save();c.translate(x,y);c.rotate(Math.sin(k*Math.PI*6));c.fillStyle=i?'#9cbf55':'#d99a3e';c.beginPath();c.ellipse(0,0,3.2,1.6,0,0,Math.PI*2);c.fill();c.restore()
    }
    c.globalAlpha=1
  }
  // Confetti over the lounge while any team is celebrating.
  if(H&&scene.actors.some(a=>a.party&&!a.hidden)){
    const colors=['#ff7aa8','#7bc8ff','#ffd35a','#8be08b','#c89bff']
    for(let i=0;i<14;i++){
      const k=((time*.18+i*.0714)%1),x=w*(.22+.7*((i*37%14)/14))+Math.sin(time*2+i)*8,y=H*(.05+k*.7)
      c.save();c.translate(x,y);c.rotate(time*3+i);c.globalAlpha=k>.85?(1-k)/.15:1;c.fillStyle=colors[i%colors.length];c.fillRect(-2,-1,4,2);c.restore()
    }
    c.globalAlpha=1
  }
  let dust=0
  c.fillStyle='rgba(255,240,200,.3)'
  for(const f of scene.floors){
    if(f.kind!=='team')continue
    const h=f.height??0
    for(let j=0;j<2&&dust<DUST_CAP;j++,dust++){
      const k=(time*.015+officeSeed(`${f.id}${j}`))%1,x=w*(.08+.84*k),y=f.y+h*(.35+.25*j)+Math.sin(time*.4+j*2)*6
      c.beginPath();c.ellipse(x,y,1.2,1.2,0,0,Math.PI*2);c.fill()
    }
  }
  c.restore()
}

/** Stable per-actor time offset so micro motion never moves in lockstep. */
const phaseOf=(key:string)=>officeSeed(key)*20
const pairCache=new WeakMap<readonly OfficeActor[],Map<string,OfficeLifePair>>()
const pairsFor=(actors:readonly OfficeActor[])=>{let p=pairCache.get(actors);if(!p){p=officeLifePairs(actors);pairCache.set(actors,p)}return p}

/** Paints one frame and returns where each visible actor's body was drawn, so DOM overlays can follow. */
export function drawOfficeFrame(c:Ctx,scene:OfficeScene,o:OfficePaintOptions):Map<string,OfficeDrawnOffset> {
  c.clearRect(0,0,scene.width,scene.height)
  const scale=scene.width/450,time=o.motion?o.time:0
  const wardrobeTheme=officeWardrobeTheme(o.date),floorsById=new Map(scene.floors.map(floor=>[floor.id,floor]))
  const daylight=officeDaylight(o.date),surface=scene.floors.find(f=>f.kind==='lounge')
  drawOfficeSky(c,scene,time,o.date)
  drawOfficeGarden(c,scene,o.date,time,daylight)
  drawOfficeSeasonalRooms(c,{...scene,floors:scene.floors.filter(f=>!f.desktopArt&&(!f.annexOf||!scene.floors.some(p=>p.id===f.annexOf)))},o.date,time)
  drawOfficeDailyArt(c,scene,o.date,{kind:o.dailyArt?.kind,delivered:o.dailyArt?.delivery,cleanup:o.dailyArt?.cleanup,eatingKeys:new Set(o.dailyArt?.guests.filter(g=>g.phase==='eating'&&g.kind==='lunch').map(g=>g.actorKey))},o.roomArt)
  if(o.roomArt?.canteenShell&&o.paintDeskLights!==false)for(const floor of scene.floors){
    if(floor.desktopArt&&floor.kind==='team'&&!floor.constructing&&!floor.annexOf)drawOfficeRoomDeskLights(c,scene,floor,o.roomArt)
  }
  if(surface?.height&&!surface.desktopArt&&daylight.sun){
    c.fillStyle=`rgba(31,43,38,${.08+daylight.light*.06})`
    c.beginPath();c.ellipse(scene.width*(.14+daylight.shadow*.07),surface.height*.60,scene.width*(.06+Math.abs(daylight.shadow)*.09),surface.height*.022,daylight.shadow*.12,0,Math.PI*2);c.fill()
  }
  const vendorExchange=officeVendorExchange(scene,o.date,o.dailyArt)
  drawOfficeShopQueue(c,scene,o.dailyArt?.shopQueue)
  let vendorHand:{x:number;y:number;scale:number}|null=null
  drawOfficeVendor(c,scene,o.date,time,staff=>{
    c.save();c.translate(staff.x,staff.y);c.scale(staff.scale,staff.scale)
    const hands=drawOfficeAvatar(c,shopkeeper,0,0,time,{...officeVendorAvatarPose(staff),wave:staff.pose==='serve',wardrobe:officeWardrobeFor(wardrobeTheme,shopkeeper.slot,true)},o.avatarArt)
    if(!vendorExchange||staff.pose==='handoff')vendorHand={x:staff.x+hands.right.x*staff.scale,y:staff.y+hands.right.y*staff.scale,scale:staff.scale}
    c.restore()
  },vendorExchange,officeVendorCustomerApproaching(scene,o.dailyArt))
  drawOfficeShaft(c,scene,false,o.architectureArt,false,o.lift)
  drawOfficeInteriorDoors(c,scene,o.openDoorFloorId,o.architectureArt,o.transitDoorIds)
  const visible=scene.actors.filter(a=>!a.hidden),byKey=new Map(visible.map(a=>[a.key,a]))
  const exchange=o.exchange??null
  const busyKeys=new Set([o.tripKey,...(o.leisureKeys??[]),...(exchange?[exchange.senderKey,exchange.receiverKey]:[])].filter((key):key is string=>!!key))
  const weather=skyWeather(o.date)
  const socialTime=time/Math.max(.25,o.socialCadenceMultiplier??1)
  const sharedRest=(o.sharedRest??officeSharedRest(scene,socialTime,busyKeys,{night:officeDaylight(o.date).night,wet:weather==='rain'||weather==='storm',clear:weather==='clear',cutawayFloor:o.cutawayFloor})).filter(pair=>byKey.has(pair.firstKey)&&byKey.has(pair.secondKey))
  const sharedPoses=new Map(sharedRest.flatMap(pair=>[...pair.poses]))
  const chats=officeRestConversations(scene,socialTime,new Set([...busyKeys,...sharedPoses.keys()]))
  const sharedChats=sharedRest.filter(pair=>pair.kind==='chat').map(pair=>Math.floor(pair.progress*4)%2?{speakerKey:pair.secondKey,listenerKey:pair.firstKey}:{speakerKey:pair.firstKey,listenerKey:pair.secondKey})
  const interactions=new Map<string,{face:1|-1;speaking:boolean}>()
  const interact=(speakerKey:string,listenerKey:string)=>{
    const speaker=byKey.get(speakerKey),listener=byKey.get(listenerKey)
    if(!speaker||!listener||speaker.floorId!==listener.floorId)return
    interactions.set(speakerKey,{face:listener.x>=speaker.x?1:-1,speaking:true})
    interactions.set(listenerKey,{face:speaker.x>=listener.x?1:-1,speaking:false})
  }
  for(const chat of chats)interact(chat.speakerKey,chat.listenerKey)
  if(exchange&&!exchange.remote)interact(exchange.kind==='received'?exchange.receiverKey:exchange.senderKey,exchange.kind==='received'?exchange.senderKey:exchange.receiverKey)
  const pairs=time?pairsFor(scene.actors):new Map<string,OfficeLifePair>()
  const offsets=new Map<string,OfficeDrawnOffset>()
  const renderedScale=(actor:OfficeActor)=>{
    const ratio=offsets.get(actor.key)?.scale
    return ratio===undefined?officeActorRenderScale(scene,actor):ratio*scale
  }
  const handFrames=new Map<string,{x:number;y:number}>()
  const furniture=o.roomArt?.stations?scene.floors.filter(f=>f.kind==='team'&&!f.constructing&&!f.annexOf&&!(f.desktopArt&&o.roomArt?.canteenShell)).flatMap(f=>officeStations(f,scene.width).map(station=>({...station,floorId:f.id}))).sort((a,b)=>a.y-b.y):[]
  let furnitureIndex=0
  const paintFurniture=(until:number)=>{while(furnitureIndex<furniture.length&&furniture[furnitureIndex].y<=until){const station=furniture[furnitureIndex++];drawOfficeStation(c,station,o.roomArt!,{time:time?time+phaseOf(`${station.floorId}:${station.kind}`):0,animate:o.live&&o.motion,state:officeStationActivity(scene,station.floorId,station)})}}
  const paintActor=(actor:OfficeActor,crossingLift=false)=>{
    if(actor.pose?.inLift&&!o.lift)return
    const moving=Boolean(actor.pose?.walk||actor.pose?.climb||actor.pose?.inLift)
    const interaction=moving?undefined:interactions.get(actor.key)
    const waiting=actor.agent.status.startsWith('waiting_'),failed=actor.agent.status==='failed'
    const pair=pairs.get(actor.key),partner=pair&&byKey.get(pair.partnerKey)
    const life=officeLife(actor,time,{anchoredRest:true,partnerDx:pair?.partnerDx,pairSeed:pair?.pairSeed,tripActive:actor.key===o.tripKey||o.leisureKeys?.has(actor.key)||sharedPoses.has(actor.key),greet:actor.key===o.greetKey,
      objectAction:o.objectCue?.actorKey===actor.key?o.objectCue.kind:undefined,
      partnerAwake:Boolean(partner&&!busyKeys.has(partner.key)&&officeLifeCanChat(partner))})
    // Monitors stay anchored to the desk and always show real status.
    if(actor.monitor&&!moving){
      const m=actor.monitor,w=actor.floorId && scene.floors.find(f=>f.id===actor.floorId)?.room==='room-b-lead'&&actor.agent.role==='lead'?29:19
      round(c,m.x-w*scale/2,m.y-7*scale,w*scale,12*scale,failed?'#b35956':waiting?'#dfb65d':'#92cad1',1)
      // Running screens scroll code lines; others stay still.
      const scroll=time&&actor.agent.status==='running'?Math.floor((time+phaseOf(actor.key))*4):0
      c.fillStyle='#ecf8dc';for(let i=0;i<3;i++)c.fillRect(m.x-w*scale*.35,m.y+(-4+i*3)*scale,(4+((i+scroll)*5)%9)*scale,scale)
    }
    const t=time?time+phaseOf(actor.key):0
    const floor=floorsById.get(actor.floorId)
    const inMeeting=Boolean(actor.pose?.meeting)
    const basePose={wardrobeTransition:o.wardrobeLooks?.get(actor.key),dressing:o.wardrobeLooks?.get(actor.key)?.dressing,wardrobe:officeWardrobeFor(wardrobeTheme,actor.appearance.slot,floor?.kind==='lounge'),sit:!moving&&!inMeeting&&!life.stand&&!actor.stand,walk:life.walk,typing:o.live&&life.typing&&!moving&&!inMeeting,hand:o.live&&waiting&&!inMeeting,
      mug:!inMeeting&&actor.zone==='lounge'&&!moving&&(!life.objectAction||life.objectAction==='coffee'),objectAction:inMeeting?undefined:life.objectAction,lead:actor.agent.role==='lead'||actor.pod,cup:!inMeeting&&life.cup,stretch:inMeeting?0:life.stretch,lean:inMeeting?0:life.lean,doze:!inMeeting&&life.doze,
      slump:!inMeeting&&life.slump,scratch:!inMeeting&&life.scratch,wave:(inMeeting?false:life.wave)||interaction?.speaking,turn:interaction?(interaction.speaking ? .25 : -.2):life.turn,face:life.face,hop:inMeeting?0:life.hop,runtime:actor.agent.runtime,party:actor.party,...actor.pose,...sharedPoses.get(actor.key),...(interaction?{face:interaction.face}:{}),...(vendorExchange?.actorKey===actor.key?{face:1 as const,offer:.8,mug:false,hand:false,typing:false,objectAction:undefined,sit:false}:{}),climb:false}
    const seated=basePose.sit&&!officeStandsAtStation(floor,actor,basePose)
    const larger=!floor?.desktopArt&&o.avatarArt&&actor.appearance.kind==='human'&&!basePose.meeting&&!seated&&
      (actor.zone==='desk'||basePose.walk||basePose.liftBlend!==undefined)
    const cabinBlend=basePose.liftBlend??(basePose.inLift?1:0)
    const actorScale=officeActorRenderScale(scene,actor)*(larger?1+.18*(1-cabinBlend):1)
    c.save()
    if(o.roomArt?.canteenShell)clipOfficeStationFurniture(c,scene,actor)
    if(!crossingLift&&o.architectureArt?.referenceLift&&(actor.pose?.inLift||actor.pose?.climb))clipOfficeReferenceLiftRider(c,scene)
    c.globalAlpha=(Number.isFinite(c.globalAlpha)?c.globalAlpha:1)*(actor.pose?.opacity??1);c.translate(actor.x+life.dx,actor.y);c.scale(actorScale,actorScale)
    if(floor?.desktopArt&&floor.kind==='lounge'&&!basePose.inLift)drawOfficeGardenActorShadow(c,daylight)
    const avatarPose=officeActorSupport(scene,actor,{stepLength:22*scale/actorScale,...basePose},actorScale,{x:actor.x+life.dx,y:actor.y},t,o.live)
    const terminalStool=Boolean(floor?.desktopArt&&o.roomArt?.canteenShell&&avatarPose.sit&&avatarPose.seatHeight!==undefined&&
      (actor.workStation??agentWorkStation(actor.agent))==='terminal'&&
      roomDesktopWorkpoints(floor,scene.width,'terminal').some(({feet})=>Math.hypot(feet.x-actor.x,feet.y-actor.y)<.01))
    const contact=drawOfficeAvatar(c,actor.appearance,0,0,t,{...avatarPose,workwear:floor?.desktopArt,acknowledgment:officeSelectionGesture(actor.key,avatarPose,o.selectionCue,o.time,o.live&&o.motion)},o.avatarArt,terminalStool)
    handFrames.set(actor.key,{x:actor.x+life.dx+contact.right.x*actorScale,y:actor.y+contact.right.y*actorScale})
    if(life.mood){c.translate(0,-life.hop);drawMood(c,life.mood,t)}
    c.restore()
    offsets.set(actor.key,{dx:life.dx,dy:-life.hop*actorScale*(1-officeSeatFrame(avatarPose,0).seated),scale:actorScale/scale})
  }
  const crossing:OfficeActor[]=[]
  for(const actor of visible.sort((a,b)=>a.y-b.y)){
    if(actor.pose?.liftCrossing&&o.architectureArt?.referenceLift&&o.lift&&o.lift.doorsOpen>=.98&&Math.abs(o.lift.y-actor.y)<2*scale){
      crossing.push(actor)
    }else{
      paintFurniture(actor.y)
      paintActor(actor)
    }
  }
  paintFurniture(Infinity)
  const bubbles=[...chats,...sharedChats]
  drawOfficeCommunications(c,scene,time,exchange,o.cutawayFloor&&scene.floors[0]?.desktopArt?bubbles.slice(0,1):bubbles,renderedScale)
  if(vendorExchange&&vendorHand&&o.roomArt){
    const recipient=scene.actors.find(a=>a.key===vendorExchange.actorKey),to=handFrames.get(vendorExchange.actorKey),from=vendorHand as {x:number;y:number;scale:number}
    if(to&&recipient){const t=Math.max(0,Math.min(1,(vendorExchange.progress-.2)/.6)),p=t*t*(3-2*t),targetScale=renderedScale(recipient),x=from.x+(to.x-from.x)*p,y=from.y+(to.y-from.y)*p-3*scale*Math.sin(p*Math.PI),width=12*from.scale+(13.5*targetScale-12*from.scale)*p,height=11*from.scale+(13.05*targetScale-11*from.scale)*p;drawOfficeOutingParcel(c,o.roomArt,x-width/2,y+from.scale+(1.35*targetScale-from.scale)*p,width,height)}
  }
  drawOfficeOutingArt(c,scene,time,o.roomArt??null,(o.dailyArt?.guests??[]).flatMap(guest=>{
    const actor=scene.actors.find(a=>a.key===guest.actorKey)
    return guest.kind==='outing'&&guest.action&&actor?[{actorKey:actor.key,action:guest.action,phase:guest.phase,floorId:actor.floorId,x:actor.x,y:actor.y,night:guest.night??false,collected:guest.collected??false,handoff:vendorExchange?.actorKey===actor.key,scale:renderedScale(actor)/scale,hand:handFrames.get(actor.key)}]:[]
  }))
  drawOfficeShaft(c,scene,true,o.architectureArt,o.liftSurfaceOpen,o.lift,gardenLampsOn(o.date))
  if(crossing.length){
    // The open landing is in front of the jamb. Keep the far side of the aperture occluded.
    c.save();c.beginPath();c.rect(0,0,officeShaftX(scene)+21*scale,scene.height);c.clip()
    for(const actor of crossing)paintActor(actor,true)
    c.restore()
  }
  if(time)drawAmbient(c,scene,time,officeAmbient(o.date).night)
  return offsets
}
