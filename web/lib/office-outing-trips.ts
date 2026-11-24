import type {OfficeActor,OfficeScene} from './office-types'
import type {OfficeOutingAction} from './office-rest-outings'
import {createOfficeRoutineTrip,type OfficeRoutineTarget} from './office-daily-trips'
import type {OfficeTrip} from './office-motion'

export function officeOutingVendorPoint(scene:OfficeScene):OfficeRoutineTarget|null {
 const surface=scene.floors.find(f=>f.kind==='lounge')
 return surface?{floorId:surface.id,x:scene.width*(surface.desktopArt?.55:.72),y:surface.y+(surface.height??scene.width*.5625)*(surface.desktopArt?.825:.67)}:null
}
/** Only a daytime snack pickup adds a vendor stop; all navigation still uses the one lift. */
export function createOfficeOutingTrip(scene:OfficeScene,actorKey:string,target:OfficeRoutineTarget,at:number,action:OfficeOutingAction,night:boolean,from?:OfficeActor):OfficeTrip|null {
 const vendor=officeOutingVendorPoint(scene)
 if(action!=='snack'||night||!vendor||target.floorId!==vendor.floorId)return createOfficeRoutineTrip(scene,actorKey,target,at,'is heading out for a short break',from)
 const trip=createOfficeRoutineTrip(scene,actorKey,vendor,at,'is collecting a snack',from)
 if(!trip)return null
 const distance=Math.hypot(target.x-vendor.x,target.y-vendor.y),duration=Math.max(180,distance/(65*scene.width/450)*1000)
 const segments=[...trip.segments,{from:{x:vendor.x,y:vendor.y},to:{x:vendor.x,y:vendor.y},duration:1400,kind:'hold' as const,floorId:vendor.floorId},...(distance>.01?[{from:{x:vendor.x,y:vendor.y},to:{x:target.x,y:target.y},duration,kind:'walk' as const,floorId:target.floorId}]:[])]
 return {...trip,actor:{...trip.actor,x:target.x,y:target.y,floorId:target.floorId},segments,endsAt:at+segments.reduce((sum,s)=>sum+s.duration,0)}
}

/** A floor-only service leg: the shared car was released on arrival at the waiting mark. */
export function createOfficeShopServiceTrip(scene:OfficeScene,actorKey:string,at:number,from:OfficeActor):OfficeTrip|null {
 const vendor=officeOutingVendorPoint(scene)
 if(!vendor||from.floorId!==vendor.floorId)return null
 const trip=createOfficeRoutineTrip(scene,actorKey,vendor,at,'is collecting a snack',from)
 if(!trip)return null
 const segments=[...trip.segments.filter(s=>s.duration>0),{from:{x:vendor.x,y:vendor.y},to:{x:vendor.x,y:vendor.y},duration:1400,kind:'hold' as const,floorId:vendor.floorId}]
 return {...trip,segments,endsAt:at+segments.reduce((sum,s)=>sum+s.duration,0)}
}
