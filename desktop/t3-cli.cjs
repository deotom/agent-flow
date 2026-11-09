'use strict'
const path = require('node:path')
const MISSING = 'T3 Code CLI not found. Open T3 Code once to install it.'
const ID = /^[A-Za-z0-9-]{8,80}$/

function createT3CLI({ spawn = require('node:child_process').spawn, fs = require('node:fs'), env = process.env, timeoutMs = 60000 } = {}) {
  let busy = false
  function projectRoot(root) {
    if (typeof root !== 'string' || !root.trim()) throw new Error('Project root must be an existing directory.')
    try {
      const resolved = fs.realpathSync(root)
      if (fs.statSync(resolved).isDirectory()) return resolved
    } catch { /* Use a short, path-independent validation error. */ }
    throw new Error('Project root must be an existing directory.')
  }
  function threadId(value) {
    const id = typeof value === 'string' ? value.replace(/^t3:/, '') : ''
    if (!ID.test(id)) throw new Error('Invalid T3 thread id.')
    return id
  }
  function message(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 20000) throw new Error('Prompt must contain 1–20000 characters.')
    return value.trim()
  }
  function launcher() {
    const home = path.join(env.USERPROFILE || '', '.t3')
    let exe, bin
    try {
      const cmd = fs.readFileSync(path.join(home, 'bin', 't3.cmd'), 'utf8')
      const match = cmd.match(/^\s*"([^"\r\n]+\.exe)"\s+"([^"\r\n]+bin\.mjs)"[^\r\n]*$/im)
      if (match) [, exe, bin] = match
    } catch { /* Fall back to the standard installation paths. */ }
    exe ||= path.join(env.LOCALAPPDATA || '', 'Programs', 't3code', 'T3 Code (Beta).exe')
    bin ||= path.join(env.LOCALAPPDATA || '', 'Programs', 't3code', 'resources', 'server.asar', 'apps', 'server', 'dist', 'bin.mjs')
    if (!fs.existsSync(exe) || !fs.existsSync(bin)) throw new Error(MISSING)
    return { exe, bin, home }
  }
  async function run(kind, payload = {}) {
    if (busy) throw new Error('Still sending the previous prompt.')
    const target = kind === 'send' ? threadId(payload?.threadId) : projectRoot(payload?.projectRoot)
    const prompt = message(payload?.message)
    const { exe, bin, home } = launcher()
    busy = true
    try {
      const output = await new Promise((resolve, reject) => {
        let child, timer, settled = false, stdout = '', stderr = ''
        function finish(error) {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (error) reject(error)
          else resolve(stdout)
        }
        try {
          child = spawn(exe, [bin, 'thread', kind, target, '-', '--json'], {
            env: { ...env, ELECTRON_RUN_AS_NODE: '1', T3CODE_HOME: home },
            windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
          })
          child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(0, 1048576) })
          child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(0, 8192) })
          child.once('error', error => finish(new Error(error.code === 'ENOENT' ? MISSING : 'Could not run T3 Code CLI.')))
          child.stdin.on('error', () => { /* Close/error supplies the process failure without exposing internals. */ })
          child.once('close', code => {
            const line = stderr.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)
              .map(value => value.replace(/[\x00-\x1f\x7f]/g, '').trim()).find(Boolean)
            finish(code === 0 ? undefined : new Error((line || `T3 exited (${code})`).slice(0, 200)))
          })
          timer = setTimeout(() => {
            finish(new Error('T3 prompt timed out. Please check T3 Code.'))
            child.kill()
          }, timeoutMs)
          child.stdin.end(prompt)
        } catch { finish(new Error('Could not run T3 Code CLI.')) }
      })
      let id = target
      if (kind === 'start') {
        let result
        try { result = JSON.parse(output) } catch { throw new Error('T3 did not return a valid thread id.') }
        try { id = threadId(result?.threadId || result?.thread?.threadId || result?.thread?.id || result?.id) }
        catch { throw new Error('T3 did not return a valid thread id.') }
      }
      return { ok: true, threadId: id }
    } finally { busy = false }
  }
  return { t3Send: payload => run('send', payload), t3Start: payload => run('start', payload), projectRoot }
}
module.exports = { createT3CLI }
