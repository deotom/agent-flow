'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

test('window actions persist pin/folder, cancel safely, isolate IPC and retire old workers', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-window-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const folders = [path.join(root, 'project A'), path.join(root, 'project B')]
  folders.forEach(folder => fs.mkdirSync(folder))
  const handlers = new Map()
  const children = []
  let window
  let selected
  let failNext = false
  const app = Object.assign(new EventEmitter(), {
    setName() {}, getPath: () => root, requestSingleInstanceLock: () => true,
    whenReady: async () => {}, quit() {},
  })
  class Window extends EventEmitter {
    constructor(options) {
      super(); window = this; this.options = options; this.pin = options.alwaysOnTop
      this.bounds = { x: 1700, y: 900, width: options.width, height: options.height }
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: pathToFileURL(path.resolve(__dirname, '../shell.html')).href },
        send() {}, setWindowOpenHandler() {}, session: { setPermissionRequestHandler() {} },
      })
    }
    isDestroyed() { return false }
    setAlwaysOnTop(value) { this.pin = value }
    loadFile() {}
    isMaximized() { return false }
    isMinimized() { return false }
    getBounds() { return { ...this.bounds } }
    getNormalBounds() { return this.getBounds() }
    setBounds(value) { this.bounds = value }
    setMinimumSize(width, height) { this.minimumSize = { width, height } }
    minimize() { this.minimized = true }
    close() { this.emit('close') }
  }
  const electron = {
    app, BrowserWindow: Window,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    dialog: { showOpenDialog: async () => selected || { canceled: true, filePaths: [] }, showErrorBox() {} },
    ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    Menu: { buildFromTemplate: value => value, setApplicationMenu() {} },
    utilityProcess: { fork(_file, args, options) {
      assert.equal(options.cwd, args[0])
      const child = new EventEmitter()
      child.postMessage = value => { if (value === 'stop') { child.stopped = true; setImmediate(() => child.emit('exit', 0)) } }
      child.kill = () => { child.stopped = true; child.emit('exit', 1) }
      children.push(child)
      const fail = failNext; failNext = false
      setImmediate(() => child.emit('message', fail
        ? { type: 'error', message: 'Cannot open workspace' }
        : { type: 'ready', url: `http://127.0.0.1:${42000 + children.length}` }))
      return child
    } },
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../main.cjs'), 'utf8')
  vm.runInNewContext(source, {
    require: id => id === 'electron' ? electron : id === './mobile-profile.cjs' ? { configureMobileProfile() {} } : id === './mobile-pairing.cjs' ? { resolveMobileConfig() {}, createPairingQR: async () => ({ dataURL: 'test-qr' }) } : require(id),
    __dirname: path.resolve(__dirname, '..'), process, console, setTimeout, clearTimeout,
  })
  await new Promise(resolve => setImmediate(resolve))
  const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  const invoke = (key, payload) => handlers.get(`desktop:${key}`)(trusted, payload)
  assert.equal(window.pin, true)
  assert.equal(window.options.webPreferences.nodeIntegration, false)
  assert.equal(window.options.webPreferences.contextIsolation, true)
  assert.equal(window.options.frame, false)
  assert.equal(invoke('state').widgetMode, true)
  assert.equal(window.options.minWidth, 260)
  assert.equal(window.options.width, 360)
  assert.equal(children.length, 0, 'Opening the app must wait for a chosen folder')
  await invoke('choose-folder')
  assert.equal(children.length, 0, 'Canceling the picker must not start a watcher')
  assert.throws(() => handlers.get('desktop:toggle-pin')({ ...trusted, senderFrame: { url: 'http://127.0.0.1:42001' } }), /Untrusted/)
  assert.throws(() => handlers.get('desktop:pair-mobile')({ ...trusted, senderFrame: { url: 'http://127.0.0.1:42001' } }), /Untrusted/)
  assert.equal((await invoke('pair-mobile')).dataURL, 'test-qr')
  invoke('toggle-pin')
  assert.equal(window.pin, false)
  selected = { canceled: false, filePaths: [folders[0]] }
  await invoke('choose-folder')
  assert.equal(invoke('state').folder, fs.realpathSync(folders[0]))
  const activeURL = invoke('state').url
  invoke('toggle-widget')
  assert.equal(invoke('state').widgetMode, false)
  assert.equal(window.bounds.width, 1120)
  assert.ok(window.bounds.x + window.bounds.width <= 1920, 'Expanded window must stay on screen')
  assert.ok(window.bounds.y + window.bounds.height <= 1080)
  assert.equal(invoke('state').url, activeURL, 'Toggling mode must keep the existing relay')
  assert.equal(children.length, 1)
  invoke('toggle-widget')
  assert.equal(invoke('state').widgetMode, true)
  assert.equal(window.bounds.width, 360)
  assert.equal(window.minimumSize.width, 260)
  invoke('resize-widget', { width: 180, height: 190, finished: true })
  assert.equal(window.bounds.width, 260)
  assert.equal(window.bounds.height, 260)
  assert.equal(children.length, 1)
  invoke('resize-widget', { width: NaN, height: 300 })
  assert.equal(window.bounds.width, 260)
  selected = { canceled: false, filePaths: [folders[1]] }
  await invoke('choose-folder')
  assert.equal(children[0].stopped, true)
  assert.equal(children[1].stopped, undefined)
  assert.equal(invoke('state').folder, fs.realpathSync(folders[1]))
  failNext = true
  await invoke('choose-folder')
  assert.equal(children[2].stopped, true)
  assert.equal(children[1].stopped, undefined, 'Failed switch must keep the current workspace alive')
  assert.equal(invoke('state').url, 'http://127.0.0.1:42002')
  assert.match(invoke('state').error, /Cannot open workspace/)
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8'))
  assert.equal(saved.alwaysOnTop, false)
  assert.equal(saved.lastFolder, fs.realpathSync(folders[1]))
  assert.equal(saved.widgetMode, true)
  app.emit('before-quit', { preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(children[1].stopped, true)
})
