import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const exports: { exports: any } = { exports: {} }
vm.runInNewContext(readFileSync(new URL('./extension.cjs', import.meta.url), 'utf8'), {
  module: exports, require: (name: string) => name === 'vscode' ? {} : require(name),
})
const { verifyPatch } = exports.exports
const content = Buffer.from('local patched build')
const expected = { version: 'local-test', files: { 'dist/extension.js': createHash('sha256').update(content).digest('hex') } }
it('detects replaced, missing and unchanged local patch files without relying on the replaced extension', () => {
  assert.equal(verifyPatch('/extension', expected, () => content).ok, true)
  assert.equal(verifyPatch('/extension', expected, () => Buffer.from('marketplace build')).ok, false)
  assert.equal(verifyPatch('/extension', expected, () => { throw new Error('missing') }).ok, false)
  assert.equal(verifyPatch(undefined, expected).ok, false)
})

it('warns once per replacement and keeps watching independently across extension changes', async () => {
  let bytes = content
  let warnings = 0
  let hidden = 0
  let shown = 0
  let poll: () => void = () => {}
  let changed: () => void = () => {}
  const guardModule = { exports: {} as any }
  const subscriptions: any[] = []
  const disposable = { dispose() {} }
  const fakeVSCode = {
    StatusBarAlignment: { Left: 1 },
    window: {
      createStatusBarItem: () => ({ ...disposable, hide: () => hidden++, show: () => shown++ }),
      showWarningMessage: async () => { warnings++; return undefined },
    },
    extensions: {
      getExtension: () => ({ extensionPath: '/extension' }),
      onDidChange: (callback: () => void) => { changed = callback; return disposable },
    },
    commands: { registerCommand: () => disposable },
  }
  vm.runInNewContext(readFileSync(new URL('./extension.cjs', import.meta.url), 'utf8'), {
    module: guardModule,
    require: (name: string) => name === 'vscode' ? fakeVSCode : name === 'node:fs'
      ? { readFileSync: (file: string) => file.endsWith('expected.json') ? JSON.stringify(expected) : bytes }
      : require(name),
    setInterval: (callback: () => void, interval: number) => { assert.equal(interval, 60000); poll = callback; return 1 },
    clearInterval() {},
  })
  guardModule.exports.activate({ extensionPath: '/guard', subscriptions })
  assert.equal(warnings, 0)
  assert.equal(hidden, 1)
  bytes = Buffer.from('updated marketplace code')
  changed()
  await Promise.resolve()
  assert.equal(warnings, 1)
  poll()
  assert.equal(warnings, 1)
  assert.ok(shown >= 1)
  bytes = content
  poll()
  assert.equal(hidden, 2)
  bytes = Buffer.from('another update')
  poll()
  assert.equal(warnings, 2)
  for (const item of subscriptions) item.dispose()
})
