import type {OfficeRoomStation} from '../../../lib/office-room-design'

export type Point=readonly[number,number]
/** Top left, top right, bottom right, bottom left in screen reading order. */
export type Quad=readonly[Point,Point,Point,Point]
export type Hardware={screens:readonly Quad[];leds?:readonly Point[];lamp?:Point;page?:Point}

// Pixel landmarks refer to the tight frames in work-stations-frames-v1.json.
// Keep each facing independent: the angle atlas is not an exact pixel mirror.
const points=(width:number,height:number,pixels:readonly Point[]):readonly Point[]=>pixels.map(([x,y])=>[x/width,y/height])
const quad=(width:number,height:number,pixels:Quad):Quad=>points(width,height,pixels) as Quad

// Rack LEDs follow the actual lit components, including the longer status bars.
// Console buttons are included; the green blocks inside LCDs belong to screens.
const terminalFront=points(445,498,[
 [80.5,108.4],[119.1,108.5],[142.9,108.8],[173,109],
 [81.6,151.3],[172.6,146.1],[172.7,157.3],
 [69,196],[82,196],[95,196],[107.5,196.1],[120,196],[132.7,195.7],
 [69.1,238.2],[82,238.5],[95,238.5],[106.3,239.2],[119,238.5],
 [77.7,284],[91.7,284],[111.1,284.4],[127.1,284.4],[172.5,277.8],[172.7,290.3],
 [169.5,343.5],[170.7,381.8],
 [66.6,417.6],[78,418],[90,418.1],[101.6,417.8],
 [259.3,278.1],[283.8,279.3],[307.3,279],
])
const terminalLeft=points(358,337,[
 [167.4,74.1],[150.6,75.6],[135.1,77.4],[111.6,79.4],
 [167.8,98.5],[167.9,105.8],[114.2,107.4],
 [143.7,132.9],[136.1,134.1],[129.1,134.6],[121.7,135.3],[114.1,135.5],[106.5,136.5],
 [137.2,159.8],[129.4,161.2],[121.8,162],[114.5,162.7],[106.9,163.1],
 [167.7,181.8],[140.8,188.4],[132,189.4],[168,189.3],[115.5,191],
 [167.4,222.6],[167.3,246],
 [128.2,274.5],[120,275.7],[113.2,276.5],[106.1,277.3],
 [245.2,187.2],[261.1,186.2],[275.9,184.2],
])
const terminalRight=points(357,337,[
 [197,73.9],[219.2,76],[234.1,77.3],[248.8,78.3],
 [197.8,102.5],[250.3,103.3],[250.2,110.8],
 [192.6,129.5],[200.2,130],[206.8,130.5],[213.8,131.3],[220.5,131.5],[228.1,132.6],
 [192.6,156.1],[200.2,156.4],[206.9,157.1],[213.8,157.6],[221.2,158.1],
 [196.3,184.1],[204.8,185.1],[215.8,186.2],[223.9,187],[250.2,185.5],[250.4,193],
 [249.5,226.4],[249.7,250.8],
 [193.4,269.4],[200.5,270.1],[207.5,271],[214.8,271.8],
 [34.9,180],[49.4,182.4],[64.6,183.3],
])

const hardware:Record<OfficeRoomStation['kind'],Record<OfficeRoomStation['facing'],Hardware>>={
 build:{
  front:{screens:[[[.195,.091],[.49,.073],[.49,.30],[.195,.32]],[[.568,.09],[.82,.115],[.82,.32],[.568,.302]]]},
  left:{screens:[[[.18,.13],[.425,.09],[.425,.31],[.18,.35]],[[.50,.10],[.735,.105],[.735,.31],[.50,.31]]]},
  right:{screens:[quad(430,318,[[116,17],[230,17],[230,88],[116,88]]),quad(430,318,[[255,24],[351,41],[351,99],[255,83]])]},
 },
 terminal:{
  front:{screens:[[[.65,.365],[.90,.365],[.88,.505],[.62,.505]]],leds:terminalFront},
  left:{screens:[[[.625,.36],[.821,.39],[.858,.51],[.66,.51]]],leds:terminalLeft},
  right:{screens:[quad(357,337,[[61,114],[136,124],[118,174],[43,163]])],leds:terminalRight},
 },
 quality:{
  front:{screens:[[[.47,.225],[.59,.225],[.59,.326],[.47,.326]]],leds:points(563,409,[[293.8,148.4]]),lamp:[.20,.115]},
  left:{screens:[[[.475,.20],[.589,.20],[.589,.30],[.475,.30]]],leds:points(424,328,[[220,109]]),lamp:[.224,.14]},
  right:{screens:[quad(430,328,[[177,69],[219,72],[219,96],[177,92]])],leds:points(430,328,[[193,107]]),lamp:[327/430,39/328]},
 },
 research:{
  front:{screens:[],lamp:[.735,.295],page:[.75,.54]},
  left:{screens:[],lamp:[.703,.275],page:[.70,.535]},
  right:{screens:[],lamp:[111/383,96/341],page:[100/383,180/341]},
 },
}

/** Landmarks are normalized within the requested tight atlas frame. */
export function officeStationHardware(kind:OfficeRoomStation['kind'],facing:OfficeRoomStation['facing']):Hardware {
 return hardware[kind][facing]
}
