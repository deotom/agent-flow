import {roomDesignFor,type OfficeRoomTheme} from './office-room-design'
import type {OfficeFloor} from './office-types'

export type OfficeCurioKind='swatches'|'cable'|'specimen'|'gauge'|'postcard'|'plant'|'books'|'mug'|'pennant'|'clock'|'hardware'|'tags'|'brushes'|'notebook'
export interface OfficeCurio {kind:OfficeCurioKind;x:number;y:number;width:number;height:number;tint:number;tilt:number}
export interface OfficeCurioSupport {kind:'shelf'|'rail'|'cubby'|'cabinet'|'crate';x:number;y:number;width:number;height:number}
export interface OfficeRoomCurios {theme:OfficeRoomTheme;variant:number;items:OfficeCurio[];supports:OfficeCurioSupport[]}
type Placement=readonly[OfficeCurioKind,number,number,number,number]
// Each miniature composition has its own weight and negative space. Positions
// are authored around equipment rather than a shared grid of interchangeable slots.
const compositions:Record<OfficeRoomTheme,{items:readonly Placement[];supports:OfficeCurioSupport[]}>= {
 studio:{items:[['swatches',.656,.146,.071,.051],['postcard',.751,.151,.036,.030],['brushes',.703,.200,.032,.039],['mug',.753,.211,.030,.028]],supports:[{kind:'shelf',x:.657,y:.239,width:.132,height:.006}]},
 operations:{items:[['cable',.660,.152,.090,.049],['clock',.760,.150,.030,.031],['hardware',.666,.209,.054,.028],['notebook',.758,.206,.029,.033]],supports:[{kind:'rail',x:.659,y:.149,width:.094,height:.006},{kind:'crate',x:.659,y:.205,width:.068,height:.039}]},
 research:{items:[['books',.660,.166,.033,.070],['specimen',.712,.149,.034,.047],['plant',.757,.199,.034,.044],['postcard',.711,.211,.033,.027]],supports:[{kind:'cubby',x:.656,y:.160,width:.043,height:.083},{kind:'shelf',x:.708,y:.196,width:.041,height:.005}]},
 quality:{items:[['tags',.664,.159,.045,.035],['specimen',.667,.203,.038,.033],['gauge',.744,.151,.046,.042],['notebook',.746,.213,.033,.025]],supports:[{kind:'cabinet',x:.658,y:.151,width:.058,height:.091},{kind:'rail',x:.742,y:.199,width:.049,height:.005}]},
}
/** Coordinates are room-width fractions, confined to the free right-hand wall.
 * Only identity seeds arrangement; live tasks, population and statuses never do. */
export function roomCuriosFor(floor:OfficeFloor):OfficeRoomCurios {
 const seed=[...(floor.sessionId??floor.id)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)
 const theme=roomDesignFor(floor).theme,variant=(seed>>>5)%2,composition=compositions[theme]
 const mirroredX=(x:number,width:number)=>variant?1.45-x-width:x
 return {theme,variant,items:composition.items.map(([original,x,y,width,height],i)=>{
  // Personal accents vary without erasing the equipment-led composition.
  const kind:OfficeCurioKind=original==='postcard'&&(seed&8)?'pennant':original==='notebook'&&(seed&16)?'mug':original
  return {kind,x:mirroredX(x,width),y,width,height,tint:(seed>>>(i+3))%4,tilt:(((seed>>>(i+15))%3)-1)*.025}
 }),supports:composition.supports.map(support=>({...support,x:mirroredX(support.x,support.width)}))}
}
