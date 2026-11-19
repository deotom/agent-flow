'use strict'
const crypto = require('node:crypto')
const path = require('node:path')

/** Prefer the same origin for a canonical workspace/source on each launch.
 * Binding still owns the port atomically; an occupied port is never trusted. */
function preferredDesktopPort(workspace, runtime = 'auto', platform = process.platform) {
  const absolute = path.resolve(workspace)
  const canonical = platform === 'win32' ? absolute.toLowerCase() : absolute
  const key = `${runtime}\0${canonical}`
  return 20000 + crypto.createHash('sha256').update(key).digest().readUInt32BE(0) % 20000
}
module.exports = { preferredDesktopPort }
