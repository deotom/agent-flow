'use strict'
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

async function main() {
  const { packager } = await import('@electron/packager')
  const version = require('electron/package.json').version
  const zipName = `electron-v${version}-win32-x64.zip`
  const cachedDir = path.resolve(__dirname, '../artifacts.local/runtime')
  const zipDir = process.env.AGENT_FLOW_ELECTRON_ZIP_DIR || (fs.existsSync(path.join(cachedDir, zipName)) ? cachedDir : undefined)
  if (zipDir) {
    const expected = require('electron/checksums.json')[zipName]
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(zipDir, zipName))).digest('hex')
    if (!expected || actual !== expected) throw new Error('Cached Electron ZIP checksum does not match the installed Electron package.')
  }
  const outputs = await packager({
    dir: __dirname,
    out: path.resolve(process.env.AGENT_FLOW_PACKAGE_OUTPUT || path.join(__dirname, '../artifacts.local/desktop')),
    name: 'Agent Flow',
    executableName: 'Agent Flow',
    platform: 'win32',
    arch: 'x64',
    electronZipDir: zipDir,
    overwrite: true,
    asar: true,
    prune: true,
    ignore: [/^\/test(?:\/|$)/, /^\/.*\.ts$/, /^\/(build|package)\.cjs$/, /^\/package-lock\.json$/],
    win32metadata: {
      CompanyName: 'Agent Flow',
      FileDescription: 'Agent Flow Desktop',
      ProductName: 'Agent Flow',
    },
  })
  console.log(outputs.join('\n'))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
