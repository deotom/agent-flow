import type { OfficeAppearance } from '../../../lib/office-types'
import type { OfficeWardrobeLook } from '../../../lib/office-wardrobe'

type Ctx=CanvasRenderingContext2D
function patch(c:Ctx,points:readonly (readonly [number,number])[],color:string){
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath()
  c.fillStyle=color;c.fill();c.strokeStyle='#4b3025';c.lineWidth=.8;c.stroke()
}
function seam(c:Ctx,points:readonly (readonly [number,number])[],color:string,width=1){
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke()
}
/** Torso overlay after base outfit, before arms/head/runtime patch. No hand props or headwear.
 * The open centre reserves the runtime logo and keeps the actor's original shirt visible.
 */
export function drawOfficeWardrobe(c:Ctx,a:OfficeAppearance,look:OfficeWardrobeLook,back:boolean):void {
  c.save()
  const {accent,trim}=look
  if(look.layer==='light'){
    patch(c,[[-13,-34],[-7,-36],[-4,-32],[-10,-30]],accent)
    patch(c,[[13,-34],[7,-36],[4,-32],[10,-30]],accent)
    seam(c,[[12,-27],[12,-13]],trim,1.6)
    // Small side floral stitch, away from the chest patch.
    if(!back){seam(c,[[10,-18],[14,-18]],trim,1.2);seam(c,[[12,-20],[12,-16]],trim,1.2)}
  }else if(look.layer==='cardigan'){
    for(const side of [-1,1]){
      patch(c,[[side*14,-34],[side*10,-35],[side*10,-13],[side*15,-12]],accent)
      seam(c,[[side*10,-33],[side*10,-14]],trim)
    }
  }else if(look.layer==='rain-poncho'){
    // A broad water-shedding shoulder cape, with open front/back logo panel and no hood.
    patch(c,[[-5,-37],[-15,-35],[-21,-27],[-12,-29],[-10,-15],[-10,-32]],accent)
    patch(c,[[5,-37],[15,-35],[21,-27],[12,-29],[11,-15],[10,-32]],accent)
    seam(c,[[-19,-28],[-13,-30],[-6,-35]],trim,1.3)
    seam(c,[[19,-28],[13,-30],[6,-35]],trim,1.3)
    // Highlights read as coated fabric instead of a second shirt.
    seam(c,[[-15,-33],[-18,-29]],'#a1b8ac',1.4)
  }else{
    // Knit shoulder/vest edges retain the base outfit palette down the centre.
    for(const side of [-1,1]){
      patch(c,[[side*14,-33],[side*11,-34],[side*10,-12],[side*14,-12]],accent)
      for(const y of [-28,-23,-18])seam(c,[[side*11,y],[side*14,y+1]],trim,.8)
    }
    // Do not duplicate an actor's identity scarf; the vest edges still show the season.
    if(a.gear!=='scarf'){
      patch(c,[[-12,-36],[11,-36],[13,-31],[-12,-31]],accent)
      seam(c,[[-10,-33],[10,-33]],trim,1)
      if(!back)patch(c,[[10,-32],[14,-32],[14,-23],[11,-24]],accent)
    }
  }
  if(look.holiday){
    // Tiny stitched shoulder pin remains outside both the runtime logo and identity gear.
    patch(c,[[-14,-32],[-12,-34],[-10,-32],[-12,-30]],trim)
  }
  c.restore()
}
