import type {OfficePoint,OfficeScene} from './office-types'
import {officeNavigation} from './office-navigation'

/** Stable per observed trip; rescheduling never changes which side someone uses. */
export function officeGardenRoute(scene:OfficeScene,actorKey:string,at:number):{floorId:string;points:OfficePoint[]} {
 const surface=scene.floors.find(f=>f.kind==='lounge'),nav=officeNavigation(scene)
 const width=scene.width,height=surface?.height??width*.5625,y=surface?.y??0
 let seed=0
 for(const char of `${actorKey}:${at}`)seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0
 const variant=seed%3,front=y+height*.82,rear=y+height*.58
 const p=(x:number,y:number):OfficePoint=>({x:x*width,y})
 // The short fade leg is entirely beyond the crop, including the avatar's body.
 // Rear walkers descend the empty left border; all routes clear the seats/shop.
 const points=surface?.desktopArt?[p(-.14,front),p(-.06,front),p(.10,front),{x:nav.shaftX-28*nav.scale,y:front}]
  :variant===0?[p(-.14,front),p(-.06,front),p(.10,front),p(.86,front)]
  :variant===1?[p(1.14,front),p(1.06,front),p(.86,front)]
  :[p(-.14,rear),p(-.06,rear),p(.07,rear),p(.07,front),p(.86,front)]
 points.push({x:nav.shaftX-28*nav.scale,y:nav.hatch.y})
 return {floorId:surface?.id??'lounge',points}
}
