import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as os from 'node:os'
import * as path from 'node:path'
import { assertFixturePath } from './t3-fixture-db'

test('fixture database refuses the T3 data directory', () => {
  assert.throws(() => assertFixturePath(path.join(os.homedir(), '.t3', 'userdata', 'fixture.sqlite')), /Refusing/)
  assert.doesNotThrow(() => assertFixturePath(path.join(os.tmpdir(), 'agent-flow-t3-fixture.sqlite')))
})
