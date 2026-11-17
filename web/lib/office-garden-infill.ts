/** Reuses the current season's own painted lawn to retire the old ground hatch.
 * The matching closed-hatch overlay must remain beneath this transparent patch
 * so the open hatch's raised lid is covered while the image is loading. */
export function drawOfficeGardenInfill(c:CanvasRenderingContext2D,image:CanvasImageSource,width:number,height:number):void {
 const source=image as CanvasImageSource&{naturalWidth?:number;naturalHeight?:number;width?:number;height?:number}
 const sw=source.naturalWidth??source.width??0,sh=source.naturalHeight??source.height??0
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||sw<=0||sh<=0)return
 const x=width*.824,y=height*.564,w=width*.176,h=height*.179,feather=width*.012
 // Keep source and destination aspect ratios equal; narrow the grass sample
 // rather than reaching down into the painted soil or stretching flower heads.
 const sampleWidth=Math.min(sw*.190,sh*(65/563)*w/h),sampleHeight=sampleWidth*h/w
 // Nested alpha clips form a soft edge without readback, a second bitmap or any
 // frame loop. Every pass samples the identical area, so blade/flower detail
 // stays sharp in the opaque centre rather than accumulating offset textures.
 c.save()
 for(let i=0;i<10;i++){
  const inset=feather*i/9
  c.save();c.beginPath()
  if(typeof c.roundRect==='function')c.roundRect(x+inset,y+inset,w-2*inset,h-2*inset,feather*.8)
  else c.rect(x+inset,y+inset,w-2*inset,h-2*inset)
  c.clip()
  c.globalAlpha=1/(10-i)
  c.drawImage(image,sw*.530,sh*(350/563),sampleWidth,sampleHeight,x,y,w,h)
  c.restore()
 }
 c.restore()
}
