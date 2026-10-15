import { it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { JsonlEventSource } from '../src/event-source'
import type { AgentEvent } from '../src/protocol'

it('restores JSONL history quietly, preserves partial UTF-8 lines, and replays without double-consuming new records', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-jsonl-'))
  const file = path.join(folder, 'events.jsonl')
  const first = { time: 0, type: 'agent_spawn', payload: { name: 'root', isMain: true } }
  const message = Buffer.from(JSON.stringify({ time: 1, type: 'message', payload: { agent: 'root', content: 'ภาษาไทย 🐱' } }) + '\n')
  const split = message.indexOf(Buffer.from('ภาษา')) + 1
  fs.writeFileSync(file, JSON.stringify(first) + '\n')
  fs.appendFileSync(file, message.subarray(0, split))
  const events: AgentEvent[] = []
  const source = new JsonlEventSource(file)
  source.onEvent(event => events.push(event))
  try {
    source.start()
    assert.equal(events.length, 1)
    assert.equal(events[0].historical, true)
    fs.appendFileSync(file, message.subarray(split))
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(events.length, 2)
    assert.equal(events[1].payload.content, 'ภาษาไทย 🐱')
    assert.equal(events[1].historical, undefined)
    source.replay()
    assert.equal(events.length, 4)
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(events.length, 4)
  } finally { source.dispose(); fs.rmSync(folder, { recursive: true, force: true }) }
})
