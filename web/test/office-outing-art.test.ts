import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeOutingArt,type OfficeOutingArtGuest} from '../components/agent-visualizer/office/office-outing-art'
import type {OfficeRoomArt} from '../components/agent-visualizer/office/office-room-design-art'
import type {OfficeActor,OfficeFloor,OfficeScene} from '../lib/office-types'
const garden:OfficeFloor={id:'garden',sessionId:null,title:'Garden',subtitle:'',color:'#abc',y:0,height:253,actorKeys:[],kind:'lounge'}
const home:OfficeFloor={...garden,id:'home',y:253,kind:'break',room:'room-break-reading'}
const art={shell:{width:1000,height:563},props:{width:1536,height:1024},breakRoom:{width:1000,height:563}} as unknown as OfficeRoomArt
const guest=(overrides:Partial<OfficeOutingArtGuest>={}):OfficeOutingArtGuest=>({actorKey:'guest',action:'snack',phase:'returning',floorId:'garden',x:150,y:170,night:false,collected:true,...overrides})
function render(guests:readonly OfficeOutingArtGuest[],options:{time?:number;hidden?:boolean;inLift?:boolean;art?:OfficeRoomArt|null;width?:number}={}){
 const calls:unknown[][]=[]
 const ctx={drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D
 const scene:OfficeScene={width:options.width??450,height:800,floors:[garden,home],actors:guests.map(g=>({key:g.actorKey,hidden:options.hidden,pose:{inLift:options.inLift}} as OfficeActor)),quietTeams:[],totalAgents:guests.length,finishedCount:0}
 drawOfficeOutingArt(ctx,scene,options.time??0,options.art===undefined?art:options.art,guests)
 return calls
}
it('draws nothing without an outing, assets, or an eligible visible traveler',()=>{
 assert.deepEqual(render([]),[])
 assert.deepEqual(render([guest()],{art:null}),[])
 assert.deepEqual(render([guest()],{hidden:true}),[])
 assert.deepEqual(render([guest()],{inLift:true}),[])
 assert.deepEqual(render([guest({x:Number.NaN})]),[])
 assert.deepEqual(render([guest({x:460})]),[])
 assert.deepEqual(render([guest({floorId:'missing'})]),[])
})
it('attaches returning snacks to the actual traveler frame rather than a source seat or cart',()=>{
 const first=render([guest()]),moved=render([guest({x:215,y:199})])
 assert.equal(first.length,1)
 assert.equal(moved.length,1)
 assert.equal(Number(moved[0][5])-Number(first[0][5]),65)
 assert.equal(Number(moved[0][6])-Number(first[0][6]),29)
 assert.ok(Math.abs(Number(first[0][5])-150)<20)
 assert.ok(Number(first[0][6])<170&&Number(first[0][6])>130)
 assert.deepEqual(first,render([guest()],{time:0}),'paused pose has no changing pulse or bob')
})
it('does not paint a purchase when work or night interrupts the trip before pickup',()=>{
 assert.deepEqual(render([guest({collected:false})]),[])
 assert.deepEqual(render([guest({collected:false,night:true})]),[])
})
it('shows the original cart service cue only for an actual daytime garden snack stop',()=>{
 const stop=guest({phase:'eating'}),day=render([stop])
 assert.equal(day.length,1)
 assert.equal(render([guest({phase:'outbound'})]).length,0)
 assert.equal(render([guest({phase:'relocating'})]).length,0)
 assert.equal(render([guest({phase:'eating',floorId:'home',y:400})]).length,0)
 assert.equal(render([guest({phase:'eating',night:true})]).length,0)
 assert.equal(render([stop,{...stop,actorKey:'second',x:190}]).length,1,'one shared cart cue, no duplicated stall')
})
it('night drinks use a tiny indoor thermos, while stretching and stars add no open shop',()=>{
 assert.equal(render([guest({action:'drink',phase:'eating',night:true,floorId:'home',y:400})]).length,1)
 for(const action of ['drink','stretch','stargaze'] as const)assert.equal(render([guest({action,phase:'eating',night:true})]).length,0)
})
it('keeps every atlas crop and destination bounded at narrow and wide scene sizes',()=>{
 for(const width of [240,450,700]){
  const calls=render([guest({x:width*.34,y:170}),guest({actorKey:'drink',action:'drink',phase:'eating',night:true,floorId:'home',x:width*.6,y:400}),guest({actorKey:'buyer',phase:'eating',x:width*.3})],{width,time:100})
  assert.ok(calls.length>=2)
  for(const call of calls){
   const [,sx,sy,sw,sh,dx,dy,dw,dh]=call as [unknown,number,number,number,number,number,number,number,number]
   assert.ok([sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite))
   assert.ok(sx>=0&&sy>=0&&sx+sw<=1536&&sy+sh<=1024)
   assert.ok(sw>0&&sh>0&&dw>0&&dh>0&&dx>=0&&dx+dw<=width&&dy>=0&&dy+dh<=800)
  }
 }
})
