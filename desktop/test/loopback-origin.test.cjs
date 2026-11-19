'use strict'
const {test} = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {preferredDesktopPort} = require('../loopback-origin.cjs')

test('workspace/source origin is stable, bounded and case-insensitive on Windows', () => {
  const folder = path.resolve('sample-workspace')
  const port = preferredDesktopPort(folder, 't3-all', 'win32')
  assert.equal(preferredDesktopPort(folder.toUpperCase(), 't3-all', 'win32'), port)
  assert.equal(preferredDesktopPort(path.join(folder, '..', 'sample-workspace'), 't3-all', 'win32'), port)
  assert.ok(port >= 20000 && port < 40000)
  assert.notEqual(preferredDesktopPort(folder, 't3'), port)
  assert.notEqual(preferredDesktopPort(path.join(folder, 'another'), 't3-all'), port)
})
