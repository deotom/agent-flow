import assert from 'node:assert/strict'
import {it} from 'node:test'
const previousCss=require.extensions['.css']
require.extensions['.css']=()=>{}
const { ORB_REPLY_MAX_AGE, satellitePositions, stepOrbReplyFade } = require('../components/orb/orb-view') as typeof import('../components/orb/orb-view')
if(previousCss)require.extensions['.css']=previousCss
else delete require.extensions['.css']

it('keeps worker cues above the lead caption at full capacity',()=>{
  const positions=satellitePositions(8)
  assert.equal(positions.length,8)
  assert.ok(positions.every(({y})=>y<-20))
  assert.ok(positions.every(({x},i)=>i===0||x-positions[i-1].x>15))
})

it('steps orb reply fade to rest without a continuous idle timer', () => {
  const idle = stepOrbReplyFade(0, false, 0, false, 'ok')
  assert.deepEqual(idle, { alpha: 0, nextDelayMs: null })

  const easing = stepOrbReplyFade(0, true, 1000, false, 'ok')
  assert.ok(easing.alpha > 0 && easing.alpha < 0.42)
  assert.equal(easing.nextDelayMs, 66)

  const staleEasing = stepOrbReplyFade(0, true, 1000, false, 'stale')
  assert.equal(staleEasing.nextDelayMs, 125)

  const settled = stepOrbReplyFade(0.42, true, 1000, false, 'ok')
  assert.equal(settled.alpha, 0.42)
  assert.equal(settled.nextDelayMs, ORB_REPLY_MAX_AGE - 1000 + 50)

  const hovered = stepOrbReplyFade(0.42, true, 1000, true, 'ok')
  assert.ok(hovered.alpha > 0.42 && hovered.alpha < 0.96)
  assert.equal(hovered.nextDelayMs, 66)

  const snappedExpired = stepOrbReplyFade(0.002, true, ORB_REPLY_MAX_AGE + 100, false, 'ok')
  assert.deepEqual(snappedExpired, { alpha: 0, nextDelayMs: null })
})
