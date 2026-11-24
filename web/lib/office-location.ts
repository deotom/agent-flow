import type {OfficeActor,OfficeScene} from './office-types'

/** Describe the visible location, independently of the actor's authoritative work status. */
export function officeActorLocation(actor:OfficeActor,scene:OfficeScene):string {
 if(actor.pose?.inLift)return 'in the lift'
 const floor=scene.floors.find(f=>f.id===actor.floorId)
 if(floor?.room==='room-canteen')return 'in the canteen'
 if(floor?.kind==='lounge')return actor.party?'celebrating in the party garden':'in the garden'
 if(floor?.annexOf)return 'in the private break room'
 if(floor?.kind==='team'&&actor.zone==='lounge'&&actor.agent.role==='lead'&&!actor.parentKey)return floor.desktopArt?'at the Lead table':'resting in the lead reading nook'
 return 'in the office'
}
