'use strict'
const fs = require('node:fs')
const path = require('node:path')

// Must run before app.ready and before acquiring the single-instance lock.
// The packaged local viewer may still own its original Chromium profile.
function configureMobileProfile(app, env = process.env) {
  if (!env.AGENT_FLOW_REMOTE_CONFIG) return
  const previousSettings = path.join(app.getPath('userData'), 'desktop-settings.json')
  const base = path.join(env.LOCALAPPDATA || app.getPath('appData'), 'Agent Flow Mobile')
  const profile = path.join(base, 'profile')
  const cache = path.join(base, 'chromium-cache')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(cache, { recursive: true })
  const settings = path.join(profile, 'desktop-settings.json')
  if (fs.existsSync(previousSettings) && !fs.existsSync(settings)) {
    try { fs.copyFileSync(previousSettings, settings, fs.constants.COPYFILE_EXCL) }
    catch (error) {
      if (error.code !== 'EEXIST') console.warn('Could not import previous workspace preferences; choose a folder after launch.')
    }
  }
  app.setPath('userData', profile)
  app.setPath('sessionData', cache)
}

module.exports = { configureMobileProfile }
