import {it} from 'node:test'
import assert from 'node:assert/strict'
import {officeWardrobeTransitionFrame, type OfficeWardrobeTransitionActor} from '../lib/office-wardrobe-transition'

const theme={season:'rainy' as const,holiday:null,weather:'rain' as const}
const actor=(changes:Partial<OfficeWardrobeTransitionActor>={}):OfficeWardrobeTransitionActor=>({key:'a',theme,slot:7,outdoor:false,atEntrance:true,freeHand:true,...changes})
const frame=(previous:ReturnType<typeof officeWardrobeTransitionFrame>|undefined,actors:OfficeWardrobeTransitionActor[],at:number)=>officeWardrobeTransitionFrame(previous?.store,actors,at)
const look=(f:ReturnType<typeof frame>)=>f.looks.get('a')!
it('initializes the actual indoor/outdoor look immediately and prunes removed actors without mutating input',()=>{
  const input=Object.freeze(actor({outdoor:true})),before=JSON.stringify(input)
  const f=frame(undefined,[input],100)
  assert.equal(look(f).from.layer,'rain-poncho');assert.equal(look(f).to.layer,'rain-poncho');assert.equal(look(f).progress,1);assert.equal(look(f).dressing,0)
  assert.equal(JSON.stringify(input),before)
  const next=frame(f,[],200);assert.equal(next.store.size,0);assert.equal(next.looks.size,0);assert.equal(f.store.size,1)
})
it('waits for the entrance, crossfades for 650ms, and freezes with a paused motion clock',()=>{
  const a=frame(undefined,[actor()],0)
  const b=frame(a,[actor({outdoor:true,atEntrance:false})],100)
  assert.equal(look(b).to.layer,'cardigan')
  const c=frame(b,[actor({outdoor:true})],200)
  assert.equal(look(c).from.layer,'cardigan');assert.equal(look(c).to.layer,'rain-poncho');assert.equal(look(c).progress,0)
  const d=frame(c,[actor({outdoor:true})],525)
  assert.equal(look(d).progress,.5);assert.equal(look(d).dressing,1)
  assert.deepEqual(look(frame(d,[actor({outdoor:true})],525)),look(d))
  const end=frame(d,[actor({outdoor:true})],850)
  assert.equal(look(end).progress,1);assert.equal(look(end).dressing,0)
})
it('reverses a partial garment change continuously instead of snapping to either endpoint',()=>{
  const initial=frame(undefined,[actor()],0)
  const start=frame(initial,[actor({outdoor:true})],10)
  const partial=frame(start,[actor({outdoor:true})],140)
  assert.equal(look(partial).progress,.2)
  const reversed=frame(partial,[actor()],140)
  assert.equal(look(reversed).from.layer,'rain-poncho');assert.equal(look(reversed).to.layer,'cardigan')
  assert.equal(look(reversed).progress,.8)
  assert.ok(Math.abs(look(reversed).dressing-look(partial).dressing)<1e-12)
  const end=frame(reversed,[actor()],270)
  assert.equal(look(end).to.layer,'cardigan');assert.equal(look(end).progress,1)
})
it('freezes garments in the cabin or hidden without catching up blocked elapsed time',()=>{
  const a=frame(undefined,[actor()],0),b=frame(a,[actor({outdoor:true})],10),c=frame(b,[actor({outdoor:true})],140)
  for(const blocked of [{inLift:true},{hidden:true}]){
    const d=frame(c,[actor({outdoor:false,...blocked})],1000)
    assert.equal(look(d).progress,.2);assert.equal(look(d).to.layer,'rain-poncho');assert.equal(look(d).dressing,0)
    const e=frame(d,[actor({outdoor:true,atEntrance:false})],1065)
    assert.ok(Math.abs(look(e).progress-.3)<1e-12);assert.equal(look(e).dressing,0)
  }
})
it('only adjusts a genuinely free hand at an entrance and defers a third target without losing mixed layers',()=>{
  const a=frame(undefined,[actor()],0),b=frame(a,[actor({outdoor:true})],10)
  const c=frame(b,[actor({outdoor:true,freeHand:false})],140)
  assert.equal(look(c).dressing,0)
  const cool=actor({theme:{season:'cool',holiday:null,weather:'clear'}})
  const d=frame(c,[cool],140)
  assert.equal(look(d).from.layer,'cardigan');assert.equal(look(d).to.layer,'rain-poncho');assert.equal(look(d).progress,.2)
  const e=frame(d,[cool],660)
  assert.equal(look(e).from.layer,'rain-poncho');assert.equal(look(e).to.layer,'knit');assert.equal(look(e).progress,0)
  assert.equal(look(frame(e,[{...cool,atEntrance:false}],725)).dressing,0)
})
it('refreshes seasonal or holiday clothing in place without an entrance gesture or source travel',()=>{
 const first=frame(undefined,[actor({atEntrance:false})],0)
 const next=actor({atEntrance:false,theme:{season:'cool',holiday:'christmas',weather:'clear'}})
 const start=frame(first,[next],100)
 assert.equal(look(start).to.layer,'knit');assert.equal(look(start).progress,0);assert.equal(look(start).dressing,0)
 const middle=frame(start,[next],425)
 assert.equal(look(middle).progress,.5);assert.equal(look(middle).dressing,0)
 assert.equal(look(frame(middle,[next],750)).progress,1)
})
