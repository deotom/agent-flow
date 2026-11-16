import type { OfficeScene } from '../../../lib/office-types'
import { officeSky, type Holiday, type Season } from '../../../lib/office-sky'

type Ctx = CanvasRenderingContext2D
const dot=(c:Ctx,x:number,y:number,r:number,color:string)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,r,r,0,0,Math.PI*2);c.fill()}
const box=(c:Ctx,x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h)}
const line=(c:Ctx,points:readonly (readonly [number,number])[],color:string,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()}
const shape=(c:Ctx,points:readonly (readonly [number,number])[],color:string)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill()}
function shelf(c:Ctx){
  c.fillStyle='rgba(24,19,12,.2)';c.beginPath();c.ellipse(0,4,25,4,0,0,Math.PI*2);c.fill()
  box(c,-23,0,46,4,'#86542e');box(c,-23,0,46,1.5,'#d9b377');box(c,-19,4,3,6,'#654126');box(c,16,4,3,6,'#654126')
}
function mug(c:Ctx,x:number,y:number,color:string){
  c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.ellipse(x+5,y-4,3,3,0,0,Math.PI*2);c.stroke()
  box(c,x-5,y-9,10,9,color);box(c,x-4,y-9,8,2,'#e8d7b3');box(c,x-3,y-8,6,1,'#704329')
}
function seasonalProp(c:Ctx,season:Season,time:number,breakRoom:boolean){
  if(season==='hot'){
    box(c,-12,-5,16,4,'#4b7e70');box(c,-6,-23,4,19,'#91bba5')
    c.strokeStyle='#c3ded0';c.lineWidth=1.7;c.beginPath();c.ellipse(-4,-27,11,11,0,0,Math.PI*2);c.stroke()
    c.save();c.translate(-4,-27);c.rotate(time?time*4:0)
    for(let i=0;i<3;i++){c.rotate(Math.PI*2/3);c.fillStyle='#83c7c0';c.beginPath();c.ellipse(0,-5,3.5,6,.25,0,Math.PI*2);c.fill()}
    c.restore();dot(c,-4,-27,2.5,'#e3dfb7')
    box(c,12,-18,8,18,'#b1dcd6');box(c,12,-18,8,3,'#e6f3e8');box(c,14,-13,2,7,'#d9f5ed')
    if(breakRoom)mug(c,-20,-2,'#e4bb59')
  }else if(season==='rainy'){
    box(c,-12,-18,23,18,'#7b5b87');box(c,-14,-19,27,4,'#b197bc');box(c,-10,-14,2,10,'#d4b8d0')
    for(const [x,color,h] of [[-7,'#e3b958',35],[1,'#62adb0',39],[8,'#e68b77',30]] as const){
      line(c,[[x,-12],[x-3,-h]],color,3)
      c.strokeStyle='#e3cfb4';c.lineWidth=2;c.beginPath();c.moveTo(x-3,-h);c.quadraticCurveTo(x-8,-h-5,x-9,-h+1);c.stroke()
    }
    if(breakRoom){box(c,15,-7,8,7,'#bc8f4b');box(c,16,-9,5,3,'#dac594')}
  }else{
    box(c,-15,-4,18,4,'#705542');box(c,-7,-26,3,23,'#b59c6c')
    shape(c,[[-17,-26],[5,-26],[1,-41],[-13,-41]],'#f2ce7f')
    box(c,-17,-27,22,3,'#c19750');box(c,-12,-38,3,10,'#fff0b8')
    mug(c,13,-1,breakRoom?'#a8c5a7':'#bc9480')
    if(time){const t=Math.sin(time*1.7)*1.5;line(c,[[12,-15],[14+t,-20],[12,-24]],'rgba(247,228,193,.65)',1)}
  }
}
function heart(c:Ctx,x:number,y:number,s:number){
  c.fillStyle='#e77591';c.beginPath();c.moveTo(x,y+s);c.bezierCurveTo(x-2*s,y-s,x-s,y-2*s,x,y-s);c.bezierCurveTo(x+s,y-2*s,x+2*s,y-s,x,y+s);c.fill()
}
function holidayProp(c:Ctx,holiday:Holiday,time:number){
  switch(holiday){
    case 'christmas':
      box(c,-2,-11,4,12,'#8b5d38')
      shape(c,[[-17,-8],[17,-8],[10,-20],[14,-20],[6,-30],[9,-30],[0,-47],[-9,-30],[-6,-30],[-14,-20],[-10,-20]],'#3f805b')
      line(c,[[-6,-31],[7,-27],[-11,-20],[12,-14]],'#e4c76d',1.5)
      for(const [i,[x,y]] of [[-4,-30],[5,-23],[-8,-15],[9,-12]].entries())dot(c,x,y,1.8,time&&Math.sin(time+i)<-.8?'#9f8c6c':i%2?'#edba54':'#ec7b69')
      dot(c,0,-47,2.7,'#ffe19a');box(c,13,-9,9,9,'#c26065');box(c,17,-9,1.5,9,'#efc980');box(c,-23,-7,9,7,'#cfab62');box(c,-19,-7,1.5,7,'#83a783');break
    case 'halloween':
      for(const [x,r] of [[-8,10],[12,7]]){
        c.fillStyle='#cf793a';c.beginPath();c.ellipse(x,-r*.7,r,r*.75,0,0,Math.PI*2);c.fill()
        line(c,[[x,-r*1.4],[x-1,-r*1.8]],'#708353',2)
        shape(c,[[x-5,-r],[x-1,-r],[x-3,-r-3]],'#f7ce72');shape(c,[[x+1,-r],[x+5,-r],[x+3,-r-3]],'#f7ce72')
        line(c,[[x-4,-4],[x-1,-2],[x+3,-4]],'#6e4029',1)
      }break
    case 'valentine':
      box(c,-7,-15,14,15,'#b97d83');box(c,-5,-15,10,2,'#efbdc1')
      for(const [x,y] of [[-10,-30],[0,-36],[10,-28]]){line(c,[[0,-12],[x,y]],'#759b70');heart(c,x,y,4)}
      box(c,12,-6,11,6,'#e7c9b0');heart(c,17,-5,2);break
    case 'songkran':
      c.fillStyle='#b68a50';c.beginPath();c.ellipse(0,-6,20,8,0,0,Math.PI);c.fill()
      c.fillStyle='#8bc8d2';c.beginPath();c.ellipse(0,-6,20,4,0,0,Math.PI*2);c.fill()
      for(const [x,y] of [[-8,-6],[5,-5],[12,-8]]){dot(c,x,y,2,'#f9e7a1');dot(c,x+1,y,1,'#e9b48a')}
      box(c,16,-21,4,12,'#dfcba0');dot(c,18,-22,4,'#ccaa70');break
    case 'loy-krathong':
      c.fillStyle='#437b5d';c.beginPath();c.ellipse(0,-3,20,5,0,0,Math.PI*2);c.fill()
      for(let i=0;i<5;i++){const x=-14+i*7;shape(c,[[x-5,-4],[x,-15-Math.sin(i)*2],[x+5,-4]],i%2?'#80b080':'#bbbd86')}
      box(c,-1,-22,2,14,'#e9c58b');dot(c,0+(time?Math.sin(time*3)*.5:0),-25,2.5,'#ffe4a0');break
    case 'new-year':
      for(const [x,y,color] of [[-18,-10,'#b96b65'],[-3,-16,'#718e85'],[12,-9,'#be9b58']] as const){box(c,x,y,14,-y,color);box(c,x+6,y,2,-y,'#f2d5a2');line(c,[[x+7,y],[x+3,y-4],[x+1,y],[x+12,y],[x+10,y-4],[x+7,y]],'#f2d5a2',1.4)}
      break
  }
}
const palettes:Record<Holiday,readonly string[]>={
  'new-year':['#d19062','#c6ab60','#74a6a3'],songkran:['#69bdc9','#e9c76e','#c88eaa'],
  'loy-krathong':['#d4a257','#be7650','#b7b77a'],halloween:['#c88843','#80708f','#abac67'],
  christmas:['#ad605d','#80a080','#d0b76f'],valentine:['#c87e98','#e9b3ac','#c5a4aa'],
}
const roomSeasonColors:Record<Season,readonly [string,string]>={
  hot:['#b38a43','#478c83'],rainy:['#4d8590','#806780'],cool:['#aa794f','#688278'],
}
/** Thin edge details leave the project's wall paint, board and stations readable. */
function seasonalRoomTrim(c:Ctx,width:number,y:number,height:number,season:Season,variant:number){
  const colors=roomSeasonColors[season],left=width*.045,right=width*.85,top=y+height*.18
  box(c,left,top,right-left,Math.max(1,height*.012),colors[variant%2])
  // Short hanging fabric tabs sit at the wall edges, outside the central board.
  for(const x of [left+width*.008,right-width*.022]){
    const w=width*.014,h=height*.1
    shape(c,[[x,top+3],[x+w,top+3],[x+w,top+h],[x+w/2,top+h-3],[x,top+h]],colors[(variant+1)%2])
    if(season==='hot')line(c,[[x+1,top+6],[x+w-1,top+10]],'#d4b66b',1)
    else if(season==='rainy')line(c,[[x+w/2,top+6],[x+w/2,top+h-5]],'#9db7ae',1)
    else for(let i=0;i<3;i++)line(c,[[x+1,top+6+i*4],[x+w-1,top+7+i*4]],'#cead76',1)
  }
}
function garland(c:Ctx,width:number,holiday:Holiday,variant:number,time:number){
  line(c,[[0,0],[width*.25,5],[width*.5,7],[width*.75,5],[width,0]],'#746245',.8)
  const colors=palettes[holiday]
  for(let i=0;i<12;i++){
    const x=(i+.5)/12*width,y=Math.sin((i+.5)/12*Math.PI)*7,sway=time?Math.sin(time*.8+i)*.5:0
    shape(c,[[x-3,y],[x+3,y],[x+sway,y+6]],colors[(i+variant)%colors.length])
  }
}

/** Cosmetic room accents share the calendar with the garden and never change agent state. */
export function drawOfficeSeasonalRooms(c:Ctx,scene:OfficeScene,date:Date,time:number):void{
  const rooms=scene.floors.filter(f=>(f.kind==='team'||f.kind==='break')&&(f.height??0)>0)
  if(!rooms.length)return
  const sky=officeSky(date),scale=scene.width/450
  for(const floor of rooms){
    const height=floor.height!,breakRoom=floor.kind==='break'
    const variant=[...(floor.annexOf??floor.id)].reduce((sum,char)=>sum+char.charCodeAt(0),0)%3
    c.save();c.beginPath();c.rect(scene.width*.025,floor.y+height*.17,scene.width*.85,height*(breakRoom?.64:.38));c.clip()
    seasonalRoomTrim(c,scene.width,floor.y,height,sky.season,variant)
    // Wall shelves remain above agent routes and to either side of the planning board.
    c.save();c.translate(scene.width*(breakRoom?.12:.085),floor.y+height*(breakRoom?.74:.44));c.scale(scale,scale)
    shelf(c)
    if(breakRoom&&sky.holiday)holidayProp(c,sky.holiday,time)
    else seasonalProp(c,sky.season,time,breakRoom)
    c.restore()
    if(sky.holiday){
      if(!breakRoom){
        c.save();c.translate(scene.width*.79,floor.y+height*.44);c.scale(scale,scale)
        shelf(c);holidayProp(c,sky.holiday,time);c.restore()
      }
      c.save();c.translate(scene.width*.07,floor.y+height*.205);c.scale(scale,scale)
      garland(c,breakRoom?350:180,sky.holiday,variant,time);c.restore()
    }
    if(breakRoom){
      // A small second shelf makes lounges feel lived in without duplicating workroom props.
      c.save();c.translate(scene.width*.80,floor.y+height*.39);c.scale(scale,scale)
      shelf(c);mug(c,-9,-1,['#90ada8','#c49a7b','#9c99b2'][variant]);box(c,4,-6,15,6,'#b9a178');box(c,6,-9,13,3,'#879a7e');c.restore()
    }
    c.restore()
  }
}
