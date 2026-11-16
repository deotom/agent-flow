import type {OfficeActor,OfficeScene} from './office-types'

/** Feet stay on the painted floor; depth changes the whole avatar, never its route. */
export function officeActorDepthScale(scene:Pick<OfficeScene,'floors'>,actor:Pick<OfficeActor,'floorId'|'y'>):number {
 const floor=scene.floors.find(f=>f.id===actor.floorId),height=floor?.height
 if(!floor||!height||!Number.isFinite(height)||!Number.isFinite(actor.y))return 1
 const t=Math.max(0,Math.min(1,((actor.y-floor.y)/height-.52)/.30))
 return .78+.26*t*t*(3-2*t)
}

/** Canvas, contact points and overlays all share this physical scene-unit scale. */
export function officeActorRenderScale(scene:Pick<OfficeScene,'width'|'floors'>,actor:Pick<OfficeActor,'floorId'|'x'|'y'|'pose'>):number {
 const base=scene.width/450
 if(actor.pose?.inLift){
  const boarding=actor.pose.walk?Math.max(0,Math.min(1,(scene.width*.938-actor.x)/(28*base))):0
  return base*(.72+.28*boarding)
 }
 return base*officeActorDepthScale(scene,actor)
}
