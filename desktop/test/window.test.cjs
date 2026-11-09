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
    screen: { getDisplayMatching: () => ({ scaleFactor: 1.5, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), screenToDipRect: (_w, rect) => ({ x: rect.x / 1.5, y: rect.y / 1.5, width: rect.width / 1.5, height: rect.height / 1.5 }) },
    dialog: { showOpenDialog: async () => selected || { canceled: true, filePaths: [] }, showErrorBox() {} },
    ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    Menu: { buildFromTemplate: value => value, setApplicationMenu() {} },
    utilityProcess: { fork(_file, args, options) {
      assert.equal(options.cwd, args[0])
      const child = new EventEmitter()
      child.args = args
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
  const edge = { calls: [] }
  const appbar = { createAppBar(_handle, onRect, onFailure) {
    Object.assign(edge, { onRect, onFailure })
    return { set: (side, width) => edge.calls.push([side, width]), remove: () => edge.calls.push(['off']) }
  } }
  const source = fs.readFileSync(path.resolve(__dirname, '../main.cjs'), 'utf8')
  vm.runInNewContext(source, {
    require: id => id === 'electron' ? electron : id === './appbar.cjs' ? appbar : id === './mobile-profile.cjs' ? { configureMobileProfile() {} } : id === './mobile-pairing.cjs' ? { resolveMobileConfig() {}, createPairingQR: async () => ({ dataURL: 'test-qr' }) } : require(id),
    __dirname: path.resolve(__dirname, '..'), process: Object.create(process, { platform: { value: 'win32' } }), console, setTimeout, clearTimeout,
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
  window.bounds = { x: 1500, y: 300, width: 300, height: 300 }
  assert.equal(invoke('toggle-dock').dock, 'right', 'Docking picks the nearest edge')
  assert.deepEqual({ ...window.bounds }, { x: 1540, y: 0, width: 380, height: 1080 })
  assert.deepEqual(edge.calls.at(-1), ['right', 570], 'The edge is reserved in physical pixels')
  invoke('set-dock', 'left')
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 380, height: 1080 })
  edge.onRect({ x: 0, y: 0, width: 570, height: 1560 })
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 380, height: 1040 }, 'The reserved rect from the shell places the window')
  invoke('resize-widget', { width: 400, height: 10 })
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 380, height: 1040 }, 'While reserved, the shell rect decides placement')
  assert.deepEqual(edge.calls.at(-1), ['left', 600])
  edge.onFailure()
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 400, height: 1080 }, 'Without a reservation the dock still places the window')
  invoke('resize-widget', { width: 450, height: 10, finished: true })
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 450, height: 1080 }, 'Docked resize changes width only')
  invoke('toggle-widget')
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 450, height: 1080 }, 'Switching view keeps the dock')
  invoke('toggle-widget')
  assert.throws(() => invoke('set-dock', 'top'), /Unknown dock side/)
  window.bounds = { x: 600, y: 0, width: 450, height: 1080 }
  window.emit('moved')
  assert.equal(invoke('state').dock, 'off', 'Dragging away from the edge undocks')
  assert.deepEqual(edge.calls.at(-1), ['off'], 'Undocking releases the reserved edge')
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8')).dockWidth, 450)
  invoke('set-dock', 'right')
  invoke('toggle-dock')
  assert.equal(invoke('state').dock, 'off')
  assert.equal(window.bounds.width, 300, 'Undocking restores the pre-dock widget size')
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
  assert.equal(invoke('state').runtime, 'auto')
  await assert.rejects(invoke('set-runtime', 'invalid'), /Unknown source mode/)
  const previousWorker = children.at(-2)
  const t3State = await invoke('set-runtime', 't3')
  assert.equal(t3State.runtime, 't3')
  assert.equal(children.at(-1).args[1], 't3')
  assert.equal(previousWorker.stopped, true)
  failNext = true
  const failedMode = await invoke('set-runtime', 'auto')
  assert.equal(failedMode.runtime, 't3', 'Failed mode change keeps the old source and worker')
  assert.equal(children.at(-2).stopped, undefined)
  app.emit('before-quit', { preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(children.at(-2).stopped, true)
})
