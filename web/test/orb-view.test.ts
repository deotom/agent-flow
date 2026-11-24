import assert from 'node:assert/strict'
import {it} from 'node:test'
const previousCss=require.extensions['.css']
require.extensions['.css']=()=>{}
const {satellitePositions}=require('../components/orb/orb-view') as typeof import('../components/orb/orb-view')
if(previousCss)require.extensions['.css']=previousCss
else delete require.extensions['.css']

it('keeps worker cues above the lead caption at full capacity',()=>{
  const positions=satellitePositions(8)
  assert.equal(positions.length,8)
  assert.ok(positions.every(({y})=>y<-20))
  assert.ok(positions.every(({x},i)=>i===0||x-positions[i-1].x>15))
})
