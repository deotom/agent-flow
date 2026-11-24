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
type Outfit=NonNullable<OfficeAppearance['outfit']>
// Shoulder half-width, hem half-width and neck opening of each Desktop garment.
const garmentCut:Partial<Record<Outfit,readonly [number,number,number]>>={
  coat:[12.6,13.4,4.6],jacket:[12.4,12.2,4.3],hoodie:[13,12,5.4],overalls:[12,11.4,4.2],vest:[11.6,11.6,4],striped:[12.2,11.6,4.4],
}
/** The garment silhouette alone, so seasonal layers can be clipped to it. Local origin: collar centre. */
export function traceOfficeWorkwear(c:Ctx,outfit:Outfit,back:boolean,hem:number){
  const H=Math.max(14,hem),[S,F,N]=garmentCut[outfit]??[12.2,11.8,4.4],W=S-1.5
  c.beginPath()
  c.moveTo(-N,-.4)
  c.quadraticCurveTo(-S+2.3,-.3,-S,4.4)
  c.quadraticCurveTo(-S-.5,8.5,-W,H*.5)
  c.quadraticCurveTo(-W+.1,H*.8,-F,H-2)
  c.quadraticCurveTo(-F+.1,H+.3,-F+2.8,H+.3)
  c.quadraticCurveTo(0,H+1.4,F-2.8,H+.3)
  c.quadraticCurveTo(F-.1,H+.3,F,H-2)
  c.quadraticCurveTo(W-.1,H*.8,W,H*.5)
  c.quadraticCurveTo(S+.5,8.5,S,4.4)
  c.quadraticCurveTo(S-2.3,-.3,N,-.4)
  c.quadraticCurveTo(0,back?1.2:2.2,-N,-.4)
  c.closePath()
}
/**
 * Desktop workwear drawn at the painted cloak scale. The local origin is the collar
 * centre; `hem` is the garment length in avatar units, so details never squash.
 */
export function drawOfficePaintedWorkwear(c:Ctx,outfit:Outfit,cloth:string,back:boolean,profile:boolean,hem:number){
  c.save()
  // A turned torso is narrower and its centre line moves toward the facing side.
  if(profile){c.translate(1,0);c.scale(.7,1)}
  const H=Math.max(14,hem),[S,F,N]=garmentCut[outfit]??[12.2,11.8,4.4]
  const W=S-1.5,y=(k:number)=>Math.min(H-1,k)
  const outline=()=>traceOfficeWorkwear(c,outfit,back,H)
  outline();c.fillStyle=cloth;c.fill()
  c.save();c.clip()
  // Warm key light from the upper left, a cool turn on the far side, and weight at the hem.
  const turn=c.createLinearGradient(-S,0,S,0)
  turn.addColorStop(0,'#ffe2b042');turn.addColorStop(.3,'#ffd49a12');turn.addColorStop(.62,'#2a1a1a00');turn.addColorStop(1,'#1e142066')
  c.fillStyle=turn;c.fillRect(-S-2,-2,2*S+4,H+4)
  const fall=c.createLinearGradient(0,0,0,H+1.5)
  fall.addColorStop(0,'#fff0d038');fall.addColorStop(.28,'#00000000');fall.addColorStop(.78,'#2b1a2026');fall.addColorStop(1,'#1e14206e')
  c.fillStyle=fall;c.fillRect(-S-2,-2,2*S+4,H+4)
  // Details stay inside the cloth. In profile the front placket turns toward the facing edge.
  if(profile&&!back){c.translate(4.2,0);c.scale(.62,1)}
  seam(c,[[-S+1.3,5.2],[-W+.7,H*.5],[-F+1.2,H-2.4]],'#f4c68a45',1.3)
  seam(c,[[-F+2.4,H-1.1],[F-2.4,H-1.1]],'#2e201c70',1.1)
  if(outfit==='overalls'){
    const leather='#92603a',strap='#c0986c'
    if(back){
      seam(c,[[-7,1],[-6,6],[7,y(14)]],strap,2.2);seam(c,[[7,1],[6,6],[-7,y(14)]],strap,2.2)
      seam(c,[[-W+.6,y(15)],[W-.6,y(15)]],leather,2.6)
    }else{
      seam(c,[[-7,1],[-5.6,y(8)]],strap,2.2);seam(c,[[7,1],[5.6,y(8)]],strap,2.2)
      patch(c,[[-6,y(7.5)],[6,y(7.5)],[6.6,y(15)],[F-1.2,H-.6],[-F+1.2,H-.6],[-6.6,y(15)]],leather)
      patch(c,[[-3.6,y(10)],[3.6,y(10)],[3.6,y(14.5)],[-3.6,y(14.5)]],'#ae7950')
    }
  }else if(outfit==='vest'){
    if(back)seam(c,[[-W+1,y(H*.62)],[W-1,y(H*.62)]],'#a3855c',1.4)
    else{
      patch(c,[[-N-.4,0],[-S+1.4,4.6],[-W+.8,H*.55],[-F+1.2,H-.8],[F-1.2,H-.8],[W-.8,H*.55],[S-1.4,4.6],[N+.4,0],[2,y(7.5)],[0,y(12)],[-2,y(7.5)]],'#55402f')
      seam(c,[[0,y(12)],[0,H-1]],'#a3855c',1.1)
      c.fillStyle='#d1ad73';for(let k=13;k<H-2;k+=4.5)c.fillRect(-.7,k,1.4,1.4)
    }
  }else if(outfit==='hoodie'){
    if(back){
      patch(c,[[-6.4,-.6],[6.4,-.6],[5.6,y(6.5)],[0,y(9.5)],[-5.6,y(6.5)]],cloth)
      seam(c,[[0,y(1.2)],[0,y(8.6)]],'#322622',1)
    }else{
      patch(c,[[-S+1.6,3.6],[-N-1.4,-1.8],[N+1.4,-1.8],[S-1.6,3.6],[N+.4,6],[0,6.8],[-N-.4,6]],cloth)
      seam(c,[[-2.6,6.4],[-3.4,y(12)]],'#e1b081');seam(c,[[2.6,6.4],[3.4,y(12)]],'#e1b081')
      seam(c,[[-7,y(H*.78)],[-5,y(H*.56)],[5,y(H*.56)],[7,y(H*.78)]],'#322622',1.3)
    }
    seam(c,[[-F+1.6,H-2.2],[F-1.6,H-2.2]],'#e1b08166',1.4)
  }else if(outfit==='jacket'||outfit==='coat'){
    if(back){
      seam(c,[[-S+1.6,y(7.5)],[0,y(9.6)],[S-1.6,y(7.5)]],'#c19c6f',1.1)
      seam(c,[[0,y(H*.64)],[0,H]],'#392a24',1)
      if(outfit==='coat')seam(c,[[-W+.6,y(H*.5)],[W-.6,y(H*.5)]],'#a47a58',2.1)
    }else{
      patch(c,[[-N,-.3],[-N-2.6,4.2],[-1.3,y(9.5)],[0,y(7.8)],[1.3,y(9.5)],[N+2.6,4.2],[N,-.3],[0,3.2]],'#9d734c')
      seam(c,[[0,y(9.5)],[0,H]],'#362821',1.1)
      c.fillStyle='#d1ad73'
      for(let k=12.5;k<H-2;k+=4.5){c.fillRect(1,k,1.5,1.5);if(outfit==='coat')c.fillRect(-2.6,k,1.5,1.5)}
      seam(c,[[-W+1.6,y(H*.7)],[-4.2,y(H*.7)]],'#362821a0',1);seam(c,[[4.2,y(H*.7)],[W-1.6,y(H*.7)]],'#362821a0',1)
      if(outfit==='coat')seam(c,[[-W+.6,y(H*.52)],[-3.6,y(H*.52)]],'#a47a58',1.8)
    }
  }else{
    seam(c,back?[[-N-1,.8],[0,1.6],[N+1,.8]]:[[-N-1,1],[0,4.2],[N+1,1]],'#e0bd8d',1.3)
    if(outfit==='striped'){for(const k of [8,13.5,19])if(k<H-3)seam(c,[[-W+.4,k],[W-.4,k]],'#ddc59c',1.6)}
    else if(!back)patch(c,[[3.5,y(9)],[8,y(9)],[8,y(14)],[4.5,y(15)],[3.5,y(13)]],'#9b7855')
  }
  c.restore()
  outline();c.strokeStyle='#46302a';c.lineWidth=.9;c.stroke()
  c.restore()
}
function softPatch(c:Ctx,points:readonly (readonly [number,number])[],color:string){
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath()
  c.fillStyle=color;c.fill();c.strokeStyle='#4b3025a0';c.lineWidth=.55;c.stroke()
}
/** A knitted, waxed or plain band wrapped once around the neck just above the painted collar. */
function collarWrap(c:Ctx,cx:number,back:boolean,color:string,depth:number){
  const top=-37.7,bottom=top+depth
  c.beginPath()
  c.moveTo(cx-5.2,top)
  c.quadraticCurveTo(cx,top+(back?1.2:2.1),cx+5.2,top)
  c.quadraticCurveTo(cx+5.9,bottom-.8,cx+4.5,bottom)
  c.quadraticCurveTo(cx,bottom+(back?.9:1.8),cx-4.5,bottom)
  c.quadraticCurveTo(cx-5.9,bottom-.8,cx-5.2,top)
  c.closePath()
  c.fillStyle=color;c.fill()
  c.fillStyle='#2a17150f';c.fill()
  c.strokeStyle='#4b3025a0';c.lineWidth=.6;c.stroke()
}
/**
 * Painted Desktop garments are hand-painted rasters, so the season shows as a few
 * small accents at the collar and chest instead of strips over the cloth. Local
 * frame: the painted collar sits near y=-37 and the chest faces +x in profile.
 */
function drawPaintedSeasonAccents(c:Ctx,a:OfficeAppearance,look:OfficeWardrobeLook,back:boolean,profile:boolean){
  const {accent,trim}=look
  const cx=profile?2:back?.4:1
  // Below the painted chin, where the collar meets the neck.
  c.translate(0,1.3)
  if(look.layer==='knit'){
    // A compact knitted scarf, unless the actor already wears an identity scarf.
    if(a.gear!=='scarf'){
      collarWrap(c,cx,back,accent,3.2)
      for(let k=-3.6;k<=3.7;k+=1.8)seam(c,[[cx+k,-37+(back?.2:.6)*(1-Math.abs(k)/5)],[cx+k*.94,-34.9+(back?.1:.5)*(1-Math.abs(k)/5)]],'#2a171540',.5)
      if(!back){
        const x=cx+(profile?2.2:2.4)
        softPatch(c,[[x-.9,-34.6],[x+1.5,-34.8],[x+1.9,-30.4],[x-.2,-30.1]],accent)
        seam(c,[[x-.1,-30.2],[x-.2,-29.3]],trim,.6);seam(c,[[x+.8,-30.3],[x+.8,-29.4]],trim,.6);seam(c,[[x+1.6,-30.4],[x+1.7,-29.5]],trim,.6)
      }
    }
  }else if(look.layer==='rain-poncho'){
    // A slim waxed rain collar with a sheen and a brass clasp.
    collarWrap(c,cx,back,accent,2.4)
    seam(c,profile?[[cx+1.2,-36.4],[cx+4,-37.1]]:[[cx-4.2,-37.2],[cx-1.5,-36.1]],'#f1fbf466',.8)
    if(!back){c.beginPath();c.ellipse(cx+(profile?2.6:.8),-34.9,.85,.85,0,0,Math.PI*2);c.fillStyle='#d9b46a';c.fill();c.strokeStyle='#6b4a26b0';c.lineWidth=.4;c.stroke()}
  }else if(look.layer==='cardigan'){
    // Rainy-season indoor wear: piped collar points and a small clasp.
    if(back)seam(c,[[cx-4.6,-36.6],[cx,-35.6],[cx+4.6,-36.6]],accent,1.1)
    else{
      seam(c,[[cx-1.4,-35.6],[cx-4.4,-36.9]],accent,1.1);seam(c,[[cx+1.4,-35.6],[cx+4.4,-36.9]],accent,1.1)
      const x=cx+(profile?2.4:0)
      seam(c,[[x-1.1,-34.4],[x+1.1,-34.4]],'#d9b46a',.55)
      for(const dx of [-1.1,1.1]){c.beginPath();c.ellipse(x+dx,-34.4,.6,.6,0,0,Math.PI*2);c.fillStyle='#d9b46a';c.fill()}
    }
  }else if(!back){
    // Hot season: a tiny embroidered flower pinned at the lapel.
    const fx=cx+(profile?2.8:3.6),fy=-32.4
    c.beginPath();c.moveTo(fx-.2,fy+.6);c.quadraticCurveTo(fx-1.6,fy+1.7,fx-2,fy+.9);c.quadraticCurveTo(fx-1.2,fy+.3,fx-.2,fy+.6)
    c.fillStyle='#7a8f4c';c.fill()
    for(let k=0;k<5;k++){
      const angle=k*Math.PI*2/5-Math.PI/2
      c.beginPath();c.ellipse(fx+Math.cos(angle)*.85,fy+Math.sin(angle)*.85,.62,.62,0,0,Math.PI*2);c.fillStyle=accent;c.fill()
    }
    c.beginPath();c.ellipse(fx,fy,.5,.5,0,0,Math.PI*2);c.fillStyle=trim;c.fill()
  }
  if(look.holiday){
    // Tiny stitched holiday pin, clear of the collar accents.
    const [hx,hy]=back?[cx+3.8,-34]:profile?[cx+.8,-31]:[cx-3.6,-32.6]
    softPatch(c,[[hx,hy-1.2],[hx+1,hy],[hx,hy+1.2],[hx-1,hy]],trim)
    seam(c,[[hx-.45,hy],[hx+.45,hy]],'#fff4d680',.4)
  }
}
/** Torso overlay after base outfit, before arms/head/runtime patch. No hand props or headwear.
 * The open centre reserves the runtime logo and keeps the actor's original shirt visible.
 */
export function drawOfficeWardrobe(c:Ctx,a:OfficeAppearance,look:OfficeWardrobeLook,back:boolean,painted=false,fit?:{width:number;profile?:boolean}):void {
  c.save()
  // Painted bodies narrow in profile; only the front edge of an open layer stays in view.
  if(fit&&fit.width!==1)c.scale(fit.width,1)
  if(painted){drawPaintedSeasonAccents(c,a,look,back,Boolean(fit?.profile));c.restore();return}
  const sides=fit?.profile?[1] as const:[-1,1] as const
  const {accent,trim}=look
  if(look.layer==='light'){
    for(const side of sides)patch(c,[[side*13,-34],[side*7,-36],[side*4,-32],[side*10,-30]],accent)
    seam(c,[[12,-27],[12,-13]],trim,1.6)
    // Small side floral stitch, away from the chest patch.
    if(!back){seam(c,[[10,-18],[14,-18]],trim,1.2);seam(c,[[12,-20],[12,-16]],trim,1.2)}
  }else if(look.layer==='cardigan'){
    for(const side of sides){
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
    for(const side of sides){
      patch(c,[[side*14,-33],[side*11,-34],[side*10,-12],[side*14,-12]],accent)
      for(const y of [-28,-23,-18])seam(c,[[side*11,y],[side*14,y+1]],trim,.8)
    }
    // Do not duplicate an actor's identity scarf; the vest edges still show the season.
    if(a.gear!=='scarf'&&!painted){
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
