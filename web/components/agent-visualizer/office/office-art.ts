import type { OfficeAppearance, OfficePaintOptions, OfficePose, OfficeScene } from '../../../lib/office-types'

type Ambient = { name: string; night: boolean; sky: string; horizon: string; rooms: string[]; glass: string; ground: string; sun: string }
export function officeAmbient(date: Date): Ambient {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 5 && hour < 8) return { name: 'Dawn', night: false, sky: '#db9a65', horizon: '#f1c58c', rooms: ['#344455', '#2b4650', '#3b3c50', '#324b43'], glass: '#f8d796', ground: '#477f6b', sun: '#ffdc79' }
  if (hour >= 8 && hour < 17) return { name: 'Day', night: false, sky: '#449dcc', horizon: '#99c4ce', rooms: ['#30485b', '#284a50', '#363e56', '#304d43'], glass: '#79b7cf', ground: '#3e886b', sun: '#ffe579' }
  if (hour >= 17 && hour < 19) return { name: 'Dusk', night: false, sky: '#9e6977', horizon: '#dfa76f', rooms: ['#344050', '#2c4249', '#3a354a', '#34443b'], glass: '#dca66d', ground: '#3c6e61', sun: '#ffe0a4' }
  return { name: 'Night', night: true, sky: '#182a4a', horizon: '#3b4f6d', rooms: ['#1d3043', '#1e353c', '#2b2b43', '#233c33'], glass: '#d5b66e', ground: '#2a514b', sun: '#ffe7af' }
}

type Ctx = CanvasRenderingContext2D
const rect = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h))) }
function polygon(c: Ctx, points: Array<[number, number]>, color: string) {
  c.fillStyle = color; c.beginPath()
  points.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)))
  c.closePath(); c.fill()
}
const rounded = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { rect(c, x + 1, y, w - 2, h, color); rect(c, x, y + 1, w, h - 2, color) }
function box(c: Ctx, x: number, y: number, w: number, h: number, depth: number, front: string, top: string, side: string) {
  polygon(c, [[x,y],[x+depth,y-depth/2],[x+w+depth,y-depth/2],[x+w,y]], top); rect(c,x,y,w,h,front)
  polygon(c, [[x+w,y],[x+w+depth,y-depth/2],[x+w+depth,y+h-depth/2],[x+w,y+h]],side)
}
function windowAt(c: Ctx, x: number, y: number, a: Ambient, time: number) {
  rect(c,x-2,y-2,23,18,'#526b80'); rect(c,x,y,19,14,a.glass); rect(c,x+2,y+2,3,10,'#ffffff30'); rect(c,x+9,y,1,14,'#71889a')
  if (!a.night) rect(c,x+3+Math.round(Math.sin(time*.2)*2),y+5,5,2,'#ffffff70')
}
function desk(c: Ctx, x: number, y: number, color: string, time: number) {
  rounded(c,x-4,y+4,32,3,'#182939'); box(c,x-3,y-3,25,2,5,'#96744f','#ffe0a4','#b7806d')
  rect(c,x-1,y-1,2,8,'#c18b6e'); rect(c,x+20,y-1,2,8,'#b47a64'); box(c,x+2,y-16,14,10,2,'#e4d2c1','#fff0d2','#af9eaf')
  rect(c,x+3,y-15,12,7,'#273645'); for(let i=0;i<3;i++) rect(c,x+5,y-13+i*2,3+(Math.floor(time*2+i)%6),1,color)
}

/** Draw one appearance-driven, outlined pixel character. Feet rest at x,y. */
export function drawOfficeAvatar(ctx: CanvasRenderingContext2D, appearance: OfficeAppearance, x: number, y: number, time: number, pose: OfficePose = {}): void {
  const c = ctx as Ctx, ink = '#101d2b', step = Boolean(pose.walk && Math.floor(time*7)%2), bob = pose.walk && Math.sin(time*10)>0 ? 1 : 0
  const top = y - 27 - bob, kind = appearance.kind
  rounded(c,x-2,y,20,3,'#172535')
  const limb = kind === 'robot' ? '#aec9d5' : appearance.skin
  if (kind === 'human') {
    rounded(c,x-1,top+5,16,11,ink); rounded(c,x,top+6,14,9,appearance.skin)
    rect(c,x+1,top+4,12,4,appearance.hair)
    if (appearance.cut === 'bun') rounded(c,x-3,top+2,6,6,appearance.hair)
    else if (appearance.cut === 'crop') rect(c,x+1,top+5,12,3,appearance.hair)
    else if (appearance.cut === 'cap') { rect(c,x,top+2,13,4,'#174f91'); rect(c,x+6,top+1,4,2,'#f8dc76') }
    else if (appearance.cut === 'beanie') rounded(c,x-1,top+2,16,5,appearance.shirt)
    else if (appearance.cut === 'ponytail') rounded(c,x-3,top+6,4,10,appearance.hair)
    else if (appearance.cut === 'curly') { for (const dx of [1,5,9,12]) rounded(c,x+dx,top+2,4,4,appearance.hair) }
    else if (appearance.cut === 'spike') { rect(c,x+2,top+1,2,4,appearance.hair); rect(c,x+7,top,2,5,appearance.hair); rect(c,x+11,top+2,2,3,appearance.hair) }
    else rect(c,x+3,top+3,10,2,appearance.hair)
    rect(c,x+4,top+10,1,2,ink); rect(c,x+10,top+10,1,2,ink); rounded(c,x+1,top+16,13,9,ink); rect(c,x+2,top+17,11,7,appearance.shirt)
    if (appearance.gear === 'glasses' || appearance.gear === 'goggles') { rect(c,x+2,top+9,4,3,'#9be3ed'); rect(c,x+9,top+9,4,3,'#9be3ed') }
    if (appearance.gear === 'headset' || appearance.gear === 'headphones') { rect(c,x-1,top+9,2,6,'#bfd1dd'); rect(c,x+14,top+9,2,6,'#bfd1dd') }
    if (appearance.gear === 'scarf') rect(c,x+2,top+16,12,3,'#e9e3ce')
    legs(c,x,top,appearance.pants,step,Boolean(pose.sit))
  } else if (kind === 'robot') {
    rect(c,x+6,top+1,3,4,ink); rect(c,x+7,top,1,2,'#ffcf5e'); box(c,x,top+5,16,12,2,'#b9d1dc','#f0f7f5','#789bb2')
    rect(c,x+2,top+8,12,6,ink); rect(c,x+4,top+10,3,2,'#5deded'); rect(c,x+10,top+10,2,2,'#5deded'); box(c,x+2,top+18,12,7,2,appearance.shirt,'#79c9ec','#255474')
    rect(c,x+5,top+20,5,3,'#f7d675'); rect(c,x+1,top+19,2,6,limb); rect(c,x+14,top+19,2,6,limb); legs(c,x,top,appearance.pants,step,Boolean(pose.sit))
  } else {
    const fur = kind==='raccoon'?'#9ca8b4':kind==='owl'?'#a97842':kind==='fox'?'#e58a40':'#50d7c1'
    if (kind==='raccoon' || kind==='fox') { rect(c,x-3,top+16,4,9,fur); rect(c,x-3,top+21,4,3,kind==='raccoon'?'#425365':'#f2e6cf') }
    if (kind==='owl') { rect(c,x,top+1,4,5,'#8a5d3c'); rect(c,x+12,top+1,4,5,'#8a5d3c') }
    if (kind==='fox') { rect(c,x,top+1,4,7,ink); rect(c,x+11,top+1,4,7,ink) }
    if (kind==='alien') { rect(c,x+1,top+2,2,5,'#2b9e95'); rect(c,x+12,top+2,2,5,'#2b9e95') }
    rounded(c,x-2,top+6,19,12,ink); rounded(c,x-1,top+7,17,10,fur)
    if(kind==='raccoon') rect(c,x-1,top+11,17,4,'#283b50')
    if(kind==='owl') { rounded(c,x,top+9,7,7,'#f5deb0'); rounded(c,x+8,top+9,7,7,'#f5deb0'); rect(c,x+7,top+14,3,3,'#e4a03b') }
    if(kind==='fox') polygon(c,[[x,top+14],[x+8,top+17],[x+16,top+14],[x+13,top+19],[x+3,top+19]],'#f4e6ce')
    if(kind==='alien') { rounded(c,x+1,top+8,14,8,'#50d7c1'); rect(c,x+3,top+10,4,5,ink); rect(c,x+10,top+10,4,5,ink) }
    if(kind==='raccoon'||kind==='owl'||kind==='fox') { rect(c,x+3,top+11,2,2,'#eef2e4'); rect(c,x+11,top+11,2,2,'#eef2e4') }
    rounded(c,x+1,top+18,14,8,ink); rect(c,x+2,top+19,12,6,appearance.shirt); rect(c,x,top+20,2,5,fur); rect(c,x+15,top+20,2,5,fur)
    if(appearance.gear==='scarf') rect(c,x+2,top+18,12,3,'#e9e3ce')
    legs(c,x,top,appearance.pants,step,Boolean(pose.sit))
  }
  if (pose.lead) { rect(c,x+10,top+18,2,2,'#ffe08a'); rect(c,x+11,top+17,1,4,'#ffe08a') }
  if (pose.typing) rect(c,x+16,top+22+Math.floor(time*5)%2,2,1,appearance.skin)
  if (pose.hand) { rect(c,x+15,top+12,2,7,ink); rect(c,x+15,top+13,2,5,appearance.shirt); rect(c,x+15,top+10,2,3,appearance.skin) }
  if (pose.carry) { box(c,x+11,top+20,6,4,1,'#f5e7c9','#ffefce','#b59f79'); rect(c,x+12,top+21,4,1,'#5c8598') }
  if (pose.mug) { rounded(c,x+12,top+21,4,4,'#f4e4c9'); rect(c,x+16,top+22,1,2,'#f4e4c9') }
}
function legs(c: Ctx, x: number, top: number, pants: string, step: boolean, sit: boolean) {
  if (sit) { rect(c,x+4,top+24,4,2,pants); rect(c,x+9,top+24,4,2,pants); rect(c,x+5,top+26,3,1,'#dce4e7'); rect(c,x+10,top+26,3,1,'#dce4e7') }
  else { rect(c,x+3,top+24,3,step?3:4,pants); rect(c,x+9,top+24,3,4,pants); rect(c,x+2,top+27-(step?1:0),4,1,'#dce4e7'); rect(c,x+8,top+27,4,1,'#dce4e7') }
}

function drawPlant(c: Ctx, x: number, y: number, time: number) {
  const sway = Math.round(Math.sin(time*1.3+x)); box(c,x,y-5,7,5,2,'#e99c75','#ffd89a','#c57b68'); rect(c,x+3,y-13,1,9,'#54ac79'); rect(c,x+sway,y-11,3,3,'#7fce82'); rect(c,x+4+sway,y-15,3,4,'#a5e58b')
}
function drawLounge(c: Ctx, floor: OfficeScene['floors'][number], time: number, options: OfficePaintOptions, main: boolean) {
  const y=floor.y+floorHeight-8
  polygon(c,[[18,y-14],[94,y-14],[100,y-9],[24,y-9]],'#254c64'); box(c,25,y-13,55,10,5,'#426f82','#6b9ca8','#2b4e66'); rect(c,27,y-3,51,3,'#548396')
  box(c,111,y-20,16,18,4,'#3b848c','#66a7a3','#28566c'); rect(c,115,y-16,9,7,'#fff1d5'); rect(c,120,y-8,2,3,'#ffda8a')
  box(c,132,y-3,22,3,3,'#c2a3a9','#dec3c5','#9e7f91')
  drawPlant(c,18,y,time)
  if (!main) return
  // One resident cat and 1–2 visitors across the building, not a duplicated pet per floor.
  rounded(c,134,y-10,13,6,'#dfb891'); rounded(c,143,y-12,6,7,'#dfb891'); rect(c,143,y-15,2,4,'#dfb891'); rect(c,148,y-15,2,4,'#dfb891')
  rect(c,145,y-8,1,1,options.petEvent && options.now < options.petEvent.until ? '#fff' : '#8c685e'); rect(c,149,y-8,1,1,options.petEvent && options.now < options.petEvent.until ? '#fff' : '#8c685e')
  options.pets.forEach((pet,index)=>{
    const x=42+index*24+Math.round(Math.sin(time*.35+index)*3), yy=y+1, ink='#374a54'
    if(pet==='dog'){rounded(c,x,yy-6,11,6,'#d8a065');rounded(c,x+7,yy-11,7,7,'#ebbc83');rect(c,x+7,yy-11,2,5,'#8d6758');rect(c,x+12,yy-10,2,5,'#8d6758');rect(c,x+10,yy-8,1,1,ink);rect(c,x-2,yy-7+Math.round(Math.sin(time*3)),3,2,'#d8a065')}
    else if(pet==='rabbit'){const hop=Math.sin(time*1.5+index)>.92?1:0;rounded(c,x,yy-6-hop,11,6,'#eee7d9');rounded(c,x+7,yy-10-hop,6,7,'#eee7d9');rect(c,x+7,yy-16-hop,2,7,'#eee7d9');rect(c,x+11,yy-15-hop,2,6,'#eee7d9');rect(c,x+8,yy-14-hop,1,4,'#bd8c92');rect(c,x+10,yy-8-hop,1,1,ink)}
    else if(pet==='bird'){rounded(c,x+3,yy-8,7,7,'#f8d76c');rect(c,x+9,yy-5,3,2,'#e89642');rect(c,x+8,yy-7,1,1,ink);rect(c,x+2,yy-5+Math.round(Math.sin(time*2)),4,3,'#c79e47');rect(c,x+4,yy-1,1,2,'#d38c48');rect(c,x+7,yy-1,1,2,'#d38c48')}
    else{rounded(c,x,yy-6,11,6,'#76b48a');rect(c,x+3,yy-6,4,2,'#a4cf85');rect(c,x+4,yy-3,4,2,'#487c68');rounded(c,x+10,yy-4,4,3,'#b2d58e');rect(c,x+12,yy-3,1,1,ink)}
  })
  rect(c,119,y-25-Math.floor(time*2)%4,1,2,'#d7e4d2'); rect(c,122,y-27-Math.floor(time*2)%4,1,2,'#d7e4d2')
}
const floorHeight = 68
function paintFloor(c: Ctx, floor: OfficeScene['floors'][number], index: number, ambient: Ambient, time: number, options: OfficePaintOptions, scene: OfficeScene) {
  const y=floor.y
  rect(c,10,y,164,floorHeight+4,'#263c51'); rect(c,13,y+2,139,floorHeight-4,ambient.rooms[index%ambient.rooms.length])
  polygon(c,[[13,y+8],[23,y],[23,y+37],[13,y+64]],'#172733')
  polygon(c,[[23,y+39],[144,y+39],[153,y+64],[13,y+64]],'#967b5a')
  for(let k=0;k<5;k++){const yy=y+42+k*5; polygon(c,[[22-k*2,yy],[146+k,yy],[146+k,yy+1],[22-k*2,yy+1]],'#715b48')}
  for(let x=30;x<145;x+=23)polygon(c,[[x,y+39],[x-8,y+64],[x-7,y+64],[x+1,y+39]],'#b18b65')
  polygon(c,[[144,y+2],[153,y+10],[153,y+64],[144,y+39]],'#122336'); windowAt(c,25,y+13,ambient,time); windowAt(c,119,y+13,ambient,time)
  rect(c,10,y+floorHeight-4,164,4,'#71889a'); rect(c,10,y+floorHeight,164,4,'#25394f'); rect(c,13,y+2,2,floorHeight-6,floor.color)
  polygon(c,[[174,y+floorHeight-4],[190,y+floorHeight-13],[190,y+floorHeight-8],[174,y+floorHeight+1]],'#1b2e44')
  rect(c,153,y,18,65,ambient.night?'#142b3d':'#2b455d');rect(c,160,y+5,1,59,'#4a6277');rect(c,172,y,2,72,'#638094')
  if (floor.kind==='team') {
    drawPlant(c,137,y+floorHeight-7,time)
    floor.actorKeys.forEach((key,slot)=>{const actor=scene.actors.find(a=>a.key===key);if(actor?.zone==='desk')desk(c,[35,79,122][slot%3],y+56,actor.agent.status==='thinking'?'#b9a1e7':actor.agent.status.startsWith('waiting_')?'#e1bb77':'#9fdcc6',options.live?time:0)})
  } else drawLounge(c,floor,time,options,scene.floors.find(f=>f.kind==='lounge')?.id===floor.id)
  if(ambient.night){rect(c,75,y+9,8,2,'#e6d49c')}
}

export function drawOfficeFrame(ctx: CanvasRenderingContext2D, scene: OfficeScene, options: OfficePaintOptions): void {
  const c=ctx as Ctx, time=options.motion?options.time:0, ambient=officeAmbient(options.date)
  rect(c,0,0,scene.width,scene.height,ambient.sky); rect(c,0,18,scene.width,Math.max(0,scene.height-18),ambient.horizon)
  rounded(c,Math.min(scene.width-15,scene.width*.62),5,12,12,ambient.sun)
  const cloudX=(offset:number)=>((time*1.4+offset)%(scene.width+30))-30
  c.save(); c.globalAlpha=ambient.night?.45:.9
  rounded(c,cloudX(28),7,25,6,'#fff8ed'); rounded(c,cloudX(28)+5,4,12,7,'#fff8ed')
  rounded(c,cloudX(143),17,23,5,'#fff8ed'); c.restore()
  // Building shell scales with the supplied floor list, including unusually tall offices.
  const top=scene.floors[0]?.y??40, maxY=scene.floors.reduce((max,floor)=>Math.max(max,floor.y+72),top)
  rect(c,10,top-4,164,Math.max(0,maxY-top+4),'#253b53')
  polygon(c,[[174,top],[190,top-9],[190,maxY-9],[174,maxY]],'#253b53')
  polygon(c,[[10,scene.floors.length?scene.floors[0].y-8:scene.height-60],[26,scene.floors.length?scene.floors[0].y-16:scene.height-68],[190,scene.floors.length?scene.floors[0].y-16:scene.height-68],[174,scene.floors.length?scene.floors[0].y-8:scene.height-60]],'#536c80')
  scene.floors.forEach((floor,index)=>paintFloor(c,floor,index,ambient,time,options,scene))
  // Shared shaft x=155 is also the motion model's passenger path. Draw the car first.
  const ey=options.elevatorY??(scene.floors[0]?.y??40)+61
  rounded(c,154,ey-24,16,25,'#6a8195');rect(c,155,ey-23,14,23,'#314a65');rect(c,155,ey-23,14,2,'#a6d7e4');rect(c,161,ey-20,1,17,'#4f6e84');rect(c,156,ey-2,12,1,'#c29a66')
  // Ground-floor entrance, opening only for an entering/leaving character.
  const doorY=scene.height-34
  rect(c,150,doorY-2,23,27,'#617b8a');rect(c,152,doorY,19,25,'#122334');
  rect(c,153,doorY,options.doorOpen?4:16,25,'#916e49');rect(c,154,doorY+2,options.doorOpen?2:13,8,'#6094a5');
  if(!options.doorOpen)rect(c,166,doorY+14,1,2,'#e2bf69');
  rect(c,148,scene.height-9,28,2,'#a1a995');
  // Desks are only relevant to their team floor; actors are painted last for depth.
  for(const actor of [...scene.actors].sort((a,b)=>a.y-b.y||a.x-b.x)) {
    const stale=!options.live
    const status=String(actor.agent.status).toLowerCase()
    const pose: OfficePose={...actor.pose}
    if(stale) { pose.typing=false; pose.hand=false;pose.walk=false }
    else {
      if(pose.typing===undefined)pose.typing=status==='running'&&!pose.walk&&!pose.carry&&actor.zone==='desk'
      if(pose.hand===undefined)pose.hand=status==='waiting_approval'||status==='waiting_input'
    }
    if(actor.agent.role==='lead') pose.lead=true
    if(actor.zone==='lounge') { pose.typing=false;if(!pose.walk&&!pose.carry)pose.sit=true;pose.mug ||= status==='done'&&actor.appearance.slot%3===0 }
    drawOfficeAvatar(ctx,actor.appearance,actor.x,actor.y,time,pose)
  }
  rect(c,0,scene.height-6,scene.width,6,ambient.ground)
  if(options.petEvent && options.now<options.petEvent.until) {
    const lounge=scene.floors.find(f=>f.kind==='lounge')
    if(lounge) { const x=145,y=lounge.y+floorHeight-31; if(options.petEvent.kind==='heart') { rect(c,x,y,3,3,'#ef8fb4'); rect(c,x+4,y,3,3,'#ef8fb4'); rect(c,x+2,y+3,3,3,'#ef8fb4') } else if(options.petEvent.kind==='coffee') rect(c,x,y,7,6,'#f2c48a'); else rect(c,x,y,8,5,'#f7b65c') }
  }
}
