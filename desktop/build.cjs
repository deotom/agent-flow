'use strict'
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const esbuild = require('../node_modules/esbuild')
const root = path.resolve(__dirname, '..')

// Reuse exactly the same UI build as the standalone app.
execFileSync(process.execPath, [path.join(root, 'app/build.js')], { cwd: root, stdio: 'inherit' })
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true })
fs.cpSync(path.join(root, 'app/dist/webview'), path.join(__dirname, 'dist/webview'), { recursive: true })
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'worker.ts')],
  outfile: path.join(__dirname, 'dist/worker.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  alias: { vscode: path.join(root, 'scripts/vscode-shim.js') },
  define: { AGENT_FLOW_APP_VERSION: JSON.stringify(require('../app/package.json').version) },
})
console.log('Desktop assets ready.')
