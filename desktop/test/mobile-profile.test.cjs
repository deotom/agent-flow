'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { configureMobileProfile } = require('../mobile-profile.cjs')

test('mobile launch separates profile/cache from the running local viewer and preserves preferences', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-profile-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const oldProfile = path.join(root, 'original')
  fs.mkdirSync(oldProfile)
  const originalSettings = path.join(oldProfile, 'desktop-settings.json')
  fs.writeFileSync(originalSettings, JSON.stringify({ lastFolder: 'saved-workspace', widgetMode: false }))
  const paths = { userData: oldProfile, appData: root }
  const app = { getPath: name => paths[name], setPath(name, value) { assert.ok(fs.existsSync(value)); paths[name] = value } }
  const env = { AGENT_FLOW_REMOTE_CONFIG: 'config.env', LOCALAPPDATA: path.join(root, 'local') }
  configureMobileProfile(app, env)
  assert.notEqual(paths.userData, oldProfile)
  assert.notEqual(paths.userData, paths.sessionData)
  assert.ok(paths.sessionData.startsWith(env.LOCALAPPDATA))
  const newSettings = path.join(paths.userData, 'desktop-settings.json')
  assert.equal(JSON.parse(fs.readFileSync(newSettings)).lastFolder, 'saved-workspace')
  fs.writeFileSync(newSettings, JSON.stringify({ lastFolder: 'new-workspace' }))
  paths.userData = oldProfile
  configureMobileProfile(app, env)
  assert.equal(JSON.parse(fs.readFileSync(newSettings)).lastFolder, 'new-workspace')
  assert.equal(JSON.parse(fs.readFileSync(originalSettings)).lastFolder, 'saved-workspace')
})

test('ordinary desktop launch keeps its existing profile untouched', () => {
  configureMobileProfile({ getPath() { throw new Error('Must not access paths') }, setPath() { throw new Error('Must not change paths') } }, {})
})
