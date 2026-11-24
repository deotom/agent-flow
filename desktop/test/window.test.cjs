'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

test('desktop preload exposes prompt and project invokes only in the main frame', async () => {
  let api
  const calls = []
  const source = fs.readFileSync(path.resolve(__dirname, '../preload.cjs'), 'utf8')
  const run = isMainFrame => vm.runInNewContext(source, {
    process: { isMainFrame },
    require: () => ({ contextBridge: { exposeInMainWorld(_name, value) { api = value } },
      ipcRenderer: { invoke: async (...args) => { calls.push(args); return 'result' } } }),
  })
  run(false); assert.equal(api, undefined)
  run(true)
  for (const method of ['t3Send', 't3Start', 'openProject', 'notify']) assert.equal(await api[method]({ value: method }), 'result')
  assert.deepEqual(calls, [['desktop:t3-send', { value: 't3Send' }], ['desktop:t3-start', { value: 't3Start' }], ['desktop:open-project', { value: 'openProject' }], ['desktop:notify', { value: 'notify' }]])
})

test('shell prompt bridge checks iframe source, origin, id and action and replies with the request id', async () => {
  const elements = new Map()
  const listeners = new Map()
  const calls = []
  const replies = []
  const contentWindow = { postMessage: (value, origin) => replies.push({ value, origin }) }
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { contentWindow, addEventListener() {} })
    return elements.get(id)
  }
  let fail = false
  const api = {
    t3Send: async payload => { calls.push(['send', payload]); if (fail) throw new Error('Send failed'); return { ok: true, threadId: 'test-thread' } },
    t3Start: async payload => { calls.push(['start', payload]); return { ok: true, threadId: 'new-thread' } },
    openProject: async payload => { calls.push(['open', payload]); return { folder: payload.root } },
    notify: async payload => { calls.push(['notify', payload]); return { shown: true } },
    onState() {}, state: () => new Promise(() => {}),
  }
  const context = vm.createContext({ window: { agentFlowDesktop: api, addEventListener: (name, handler) => listeners.set(name, handler) },
    document: { getElementById: getElement } })
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../shell.js'), 'utf8'), context)
  vm.runInContext("currentURL = 'http://127.0.0.1:42001'", context)
  const event = { source: contentWindow, origin: 'http://127.0.0.1:42001', data: { type: 'agent-flow:desktop-request', id: 'request-1', action: 't3-send', payload: { message: 'fake' } } }
  const receive = listeners.get('message')
  for (const invalid of [{ ...event, source: {} }, { ...event, origin: 'http://evil.example' },
    ...[{}, { id: '' }, { id: 1 }, { id: 'x'.repeat(101) }, { action: 'toString' }, { action: 'close' }, { type: 'other' }]
      .map(patch => ({ ...event, data: Object.keys(patch).length ? { ...event.data, ...patch } : {} }))]) await receive(invalid)
  assert.equal(calls.length, 0)
  assert.equal(replies.length, 0)
  for (const [action, method] of [['t3-send', 'send'], ['t3-start', 'start'], ['open-project', 'open'], ['notify', 'notify']]) {
    await receive({ ...event, data: { ...event.data, action } })
    assert.equal(calls.at(-1)[0], method)
    assert.equal(replies.at(-1).value.type, 'agent-flow:desktop-response')
    assert.equal(replies.at(-1).value.id, 'request-1')
    assert.equal(replies.at(-1).value.ok, true)
    assert.equal(replies.at(-1).origin, event.origin)
  }
  fail = true
  await receive(event)
  assert.equal(replies.at(-1).value.ok, false)
  assert.equal(replies.at(-1).value.error, 'Send failed')
})

test('orb preload exposes prompt invokes and fire-and-forget window actions in the main frame', async () => {
  const calls = []
  let api
  const source = fs.readFileSync(path.resolve(__dirname, '../orb-preload.cjs'), 'utf8')
  const run = isMainFrame => vm.runInNewContext(source, {
    process: { isMainFrame },
    require: () => ({
      contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'agentFlowOrb'); api = value } },
      ipcRenderer: { send: (...args) => calls.push(args), invoke: async (...args) => { calls.push(args); return 'result' } },
    }),
  })
  run(false)
  assert.equal(api, undefined)
  run(true)
  api.setInteractive(true)
  api.moveTo({ x: 10, y: 20, done: true })
  api.openFull()
  api.menu()
  api.setExpanded(true)
  assert.equal(await api.t3Send({ message: 'hi' }), 'result')
  assert.equal(await api.t3Start({ message: 'new' }), 'result')
  assert.equal(await api.openProject({ root: 'project' }), 'result')
  assert.equal(await api.notify({ title: 'T', body: 'B' }), 'result')
  assert.deepEqual(calls, [
    ['orb:set-interactive', true], ['orb:move-to', { x: 10, y: 20, done: true }], ['orb:open-full'], ['orb:menu'],
    ['orb:set-expanded', true], ['orb:t3-send', { message: 'hi' }], ['orb:t3-start', { message: 'new' }], ['orb:open-project', { root: 'project' }], ['orb:notify', { title: 'T', body: 'B' }],
  ])
})

test('orb settings accept bounded integer coordinates and never restore open mode', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-orb-settings-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const context = vm.createContext({
    require: id => id === 'electron' ? { app: { setName() {}, getPath: () => root, requestSingleInstanceLock: () => false, quit() {} } }
      : id === './t3-cli.cjs' ? require('../t3-cli.cjs') : require(id),
    __dirname: path.resolve(__dirname, '..'), process,
  })
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../main.cjs'), 'utf8'), context)
  for (const position of [{ x: -100000, y: 100000 }, { x: 0, y: 42 }]) {
    fs.writeFileSync(path.join(root, 'desktop-settings.json'), JSON.stringify({ orbPosition: position, orbOpen: true }))
    const state = vm.runInContext('loadSettings(); snapshot()', context)
    assert.deepEqual({ ...state.orbPosition }, position)
    assert.equal(state.orbOpen, false)
  }
  for (const position of [null, { x: 100001, y: 0 }, { x: 0, y: -100001 }, { x: 1.5, y: 0 }, { x: '1', y: 0 }, { x: 1 }]) {
    fs.writeFileSync(path.join(root, 'desktop-settings.json'), JSON.stringify({ orbPosition: position }))
    assert.equal(vm.runInContext('loadSettings(); snapshot().orbPosition', context), undefined)
  }
})

test('window actions persist pin/folder, cancel safely, isolate IPC and retire old workers', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-window-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const folders = [path.join(root, 'project A'), path.join(root, 'project B')]
  folders.forEach(folder => fs.mkdirSync(folder))
  // These checks were written for the large orb (260×330); size choices are tested at the end.
  fs.writeFileSync(path.join(root, 'desktop-settings.json'), JSON.stringify({ orbScale: 1 }))
  const handlers = new Map()
  const listeners = new Map()
  const windows = []
  const menus = []
  const children = []
  const notifications = []
  let notificationSupported = true
  let window
  let selected
  let failNext = false
  const app = Object.assign(new EventEmitter(), {
    setName() {}, getPath: () => root, requestSingleInstanceLock: () => true,
    whenReady: async () => {}, quit() {},
  })
  class MockNotification extends EventEmitter {
    static isSupported() { return notificationSupported }
    constructor(options) { super(); this.options = options; this.shown = false; notifications.push(this) }
    show() { this.shown = true }
  }
  class Window extends EventEmitter {
    constructor(options) {
      super(); if (!window) window = this
      windows.push(this); this.options = options; this.pin = options.alwaysOnTop
      this.bounds = { x: options.x ?? 1700, y: options.y ?? 900, width: options.width, height: options.height }
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: pathToFileURL(path.resolve(__dirname, '../shell.html')).href },
        send() {}, setWindowOpenHandler: handler => { this.openHandler = handler }, session: { setPermissionRequestHandler: handler => { this.permissionHandler = handler } },
      })
    }
    hookWindowMessage(id, callback) { this.hooks ??= new Map(); this.hooks.set(id, callback) }
    isDestroyed() { return Boolean(this.destroyed) }
    setAlwaysOnTop(value, level) { this.pin = value; this.level = level }
    setIgnoreMouseEvents(value, options = {}) { this.ignoreMouse = value; this.forward = options.forward }
    setResizable(value) { this.resizable = value }
    setFocusable(value) { this.focusable = value }
    hide() { this.hidden = true; this.focused = false }
    show() { this.hidden = false }
    focus() { this.focused = true }
    isVisible() { return !this.hidden }
    isFocused() { return Boolean(this.focused) }
    destroy() { this.destroyed = true; this.emit('closed') }
    loadURL(url) { this.url = url; this.webContents.mainFrame.url = url }
    setPosition(x, y) { Object.assign(this.bounds, { x, y }) }
    getPosition() { return [this.bounds.x, this.bounds.y] }
    loadFile() {}
    isMaximized() { return false }
    isMinimized() { return Boolean(this.minimized) }
    restore() { this.minimized = false }
    getBounds() { return { ...this.bounds } }
    getNormalBounds() { return this.getBounds() }
    setBounds(value) { this.bounds = value }
    setMinimumSize(width, height) { this.minimumSize = { width, height } }
    minimize() { this.minimized = true }
    close() { this.emit('close') }
  }
  const electron = {
    app, BrowserWindow: Window, Notification: MockNotification,
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }], getDisplayMatching: () => ({ scaleFactor: 1.5, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), screenToDipRect: (_w, rect) => ({ x: rect.x / 1.5, y: rect.y / 1.5, width: rect.width / 1.5, height: rect.height / 1.5 }) }),
    powerMonitor: new EventEmitter(),
    dialog: { showOpenDialog: async () => selected || { canceled: true, filePaths: [] }, showErrorBox() {} },
    ipcMain: { handle: (key, handler) => handlers.set(key, handler), on: (key, handler) => listeners.set(key, handler) },
    Menu: { buildFromTemplate: value => { value.popup = options => menus.push({ template: value, ...options }); return value }, setApplicationMenu(value) { this.template = value } },
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
  const promptCalls = []
  const t3 = {
    ...require('../t3-cli.cjs').createT3CLI(),
    t3Send: async payload => { promptCalls.push(['send', payload]); return { ok: true, threadId: 'test-thread' } },
    t3Start: async payload => { promptCalls.push(['start', payload]); return { ok: true, threadId: 'new-thread' } },
  }
  const resumeTimers = []
  let now = 10000
  class Clock extends Date { static now() { return now } }
  vm.runInNewContext(source, {
    Date: Clock,
    require: id => id === 'electron' ? electron : id === './t3-cli.cjs' ? { createT3CLI: () => t3 } : id === './appbar.cjs' ? appbar : require(id),
    __dirname: path.resolve(__dirname, '..'), process: Object.create(process, { platform: { value: 'win32' } }), console, setTimeout: (callback, delay) => delay === 3000 ? resumeTimers.push(callback) : setTimeout(callback, delay), clearTimeout,
  })
  await new Promise(resolve => setImmediate(resolve))
  const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  const invoke = (key, payload) => handlers.get(`desktop:${key}`)(trusted, payload)
  const sendOrb = (orb, key, payload, sender = orb.webContents) => listeners.get(`orb:${key}`)({ sender, senderFrame: orb.webContents.mainFrame }, payload)
  for (const key of ['t3-send', 't3-start', 'open-project']) {
    assert.equal(typeof handlers.get(`desktop:${key}`), 'function')
    for (const event of [{ ...trusted, sender: {} }, { ...trusted, senderFrame: { url: trusted.senderFrame.url } }]) {
      assert.throws(() => handlers.get(`desktop:${key}`)(event, {}), /Untrusted desktop request/)
    }
    assert.throws(() => handlers.get(`orb:${key}`)({ sender: window.webContents }, {}), /Untrusted orb request/)
  }
  for (const key of ['t3-send', 't3-start']) assert.throws(() => invoke(key, {}), /Press Send to send a prompt\./)
  window.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'Enter' })
  now += 5000
  assert.equal((await invoke('t3-send', { message: 'fake' })).threadId, 'test-thread')
  assert.equal((await invoke('t3-start', { message: 'fake' })).threadId, 'new-thread')
  now += 1
  for (const key of ['t3-send', 't3-start']) assert.throws(() => invoke(key, {}), /Press Send/)
  assert.throws(() => invoke('open-project', { root: path.join(root, 'missing') }), /existing directory/)
  assert.equal(window.pin, true)
  assert.equal(window.options.webPreferences.nodeIntegration, false)
  assert.equal(window.options.webPreferences.contextIsolation, true)
  assert.equal(window.options.frame, false)
  assert.equal(invoke('state').widgetMode, true)
  assert.equal(window.options.minWidth, 260)
  assert.equal(window.options.width, 360)
  assert.equal(children.length, 0, 'Opening the app must wait for a chosen folder')
  assert.equal(invoke('toggle-orb').error, 'Open a workspace before switching to the orb.')
  assert.equal(invoke('state').orbOpen, false)
  assert.equal(windows.length, 1)
  const orbMenu = electron.Menu.template[0].submenu.find(item => item.label === 'Orb mode')
  assert.equal(orbMenu.accelerator, 'CmdOrCtrl+Shift+O')
  await invoke('choose-folder')
  assert.equal(children.length, 0, 'Canceling the picker must not start a watcher')
  assert.throws(() => handlers.get('desktop:toggle-pin')({ ...trusted, senderFrame: { url: 'http://127.0.0.1:42001' } }), /Untrusted/)
  invoke('toggle-pin')
  assert.equal(window.pin, false)
  selected = { canceled: false, filePaths: [folders[0]] }
  await invoke('open-project', { root: folders[0] })
  assert.equal(invoke('state').folder, fs.realpathSync(folders[0]))
  const activeURL = invoke('state').url
  await invoke('choose-folder')
  assert.equal(children.length, 1, 'Choosing the current source must reuse its worker and storage origin')
  assert.equal(invoke('state').url, activeURL)
  assert.equal(children[0].stopped, undefined)
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
  const callsBeforeNotification = edge.calls.length
  window.hooks.get(0x81AF)(Buffer.from([1, 0, 0, 0]))
  assert.equal(edge.calls.length, callsBeforeNotification + 1)
  window.hooks.get(0x81AF)(Buffer.from([2, 0, 0, 0]))
  assert.equal(edge.calls.length, callsBeforeNotification + 1)
  electron.screen.emit('display-metrics-changed')
  assert.equal(edge.calls.length, callsBeforeNotification + 2)
  electron.powerMonitor.emit('resume')
  assert.equal(resumeTimers.length, 1)
  assert.equal(edge.calls.length, callsBeforeNotification + 2)
  resumeTimers.pop()()
  assert.equal(edge.calls.length, callsBeforeNotification + 3)
  invoke('set-dock', 'left')
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 380, height: 1080 })
  edge.onRect({ x: 0, y: 0, width: 570, height: 1560 })
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 380, height: 1040 }, 'The reserved rect from the shell places the window')
  invoke('resize-widget', { width: 400, height: 10 })
  assert.deepEqual({ ...window.bounds }, { x: 0, y: 0, width: 380, height: 1040 }, 'While reserved, the shell rect decides placement')
  assert.deepEqual(edge.calls.at(-1), ['left', 600])
  edge.onRect({ x: 0, y: 0, width: 0, height: 1560 })
  assert.equal(window.bounds.width, 400)
  edge.onRect({ x: 99999, y: 99999, width: 570, height: 1560 })
  assert.equal(window.bounds.x, 0)
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
  invoke('set-dock', 'right')
  assert.equal(invoke('toggle-orb').orbOpen, true)
  let orb = windows.at(-1)
  assert.equal(orb.url, `${activeURL}/?orb=1`)
  for (const key of ['transparent', 'skipTaskbar', 'focusable']) assert.equal(orb.options[key], true, key)
  for (const key of ['frame', 'resizable', 'maximizable', 'minimizable', 'hasShadow']) assert.equal(orb.options[key], false, key)
  assert.equal(orb.options.backgroundColor, '#00000000')
  assert.equal(orb.options.width, 260)
  assert.equal(orb.options.height, 330)
  assert.equal(orb.options.webPreferences.preload, path.resolve(__dirname, '../orb-preload.cjs'))
  assert.equal(orb.options.webPreferences.contextIsolation, true)
  assert.equal(orb.options.webPreferences.nodeIntegration, false)
  assert.equal(orb.options.webPreferences.sandbox, true)
  assert.equal(orb.pin, true)
  assert.equal(orb.level, 'floating')
  assert.equal(orb.ignoreMouse, true)
  assert.equal(orb.forward, true)
  assert.deepEqual(orb.getPosition(), [1636, 726])
  assert.equal(window.hidden, true)
  assert.deepEqual(edge.calls.at(-1), ['off'])
  const releasedCalls = edge.calls.length
  edge.onFailure()
  edge.onRect({ x: 0, y: 0, width: 570, height: 1560 })
  assert.equal(edge.calls.length, releasedCalls, 'Late AppBar callbacks must not reserve a hidden window')
  assert.equal(orb.openHandler().action, 'deny')
  let prevented = false
  orb.webContents.emit('will-navigate', { preventDefault() { prevented = true } }, 'https://example.com')
  assert.equal(prevented, true)
  prevented = false
  orb.webContents.emit('will-navigate', { preventDefault() { prevented = true } }, orb.url)
  assert.equal(prevented, false)
  orb.permissionHandler(null, 'camera', allowed => assert.equal(allowed, false))
  for (const [key, payload] of [['set-interactive', true], ['move-to', { x: 1, y: 2, done: true }], ['menu'], ['open-full']]) {
    sendOrb(orb, key, payload, window.webContents)
  }
  assert.equal(orb.ignoreMouse, true)
  assert.deepEqual(orb.getPosition(), [1636, 726])
  assert.equal(menus.length, 0)
  assert.equal(orb.destroyed, undefined)
  for (const key of ['t3-send', 't3-start', 'open-project']) {
    assert.throws(() => handlers.get(`orb:${key}`)({ sender: window.webContents }, {}), /Untrusted orb request/)
  }
  const orbEvent = { sender: orb.webContents, senderFrame: orb.webContents.mainFrame }
  for (const key of ['t3-send', 't3-start']) {
    const handler = handlers.get(`orb:${key}`)
    assert.throws(() => handler(orbEvent, {}), /Press Send/)
    assert.throws(() => handler({ ...orbEvent, senderFrame: { url: orb.url } }, {}), /Untrusted orb/)
    orb.webContents.mainFrame.url = 'http://evil.example/'
    assert.throws(() => handler(orbEvent, {}), /Untrusted orb/)
    orb.webContents.mainFrame.url = orb.url
  }
  orb.webContents.emit('input-event', {}, { type: 'mouseDown' })
  now += 5000
  assert.equal((await handlers.get('orb:t3-send')(orbEvent, { message: 'orb fake' })).threadId, 'test-thread')
  assert.equal((await handlers.get('orb:t3-start')(orbEvent, { message: 'orb fake' })).threadId, 'new-thread')
  assert.throws(() => handlers.get('orb:open-project')(orbEvent, { root: 'missing-directory' }), /existing directory/)
  now += 1
  for (const key of ['t3-send', 't3-start']) assert.throws(() => handlers.get(`orb:${key}`)(orbEvent, {}), /Press Send/)
  assert.equal(promptCalls.length, 4)
  orb.webContents.mainFrame.url = 'http://evil.example/'
  sendOrb(orb, 'set-expanded', true)
  assert.equal(orb.bounds.width, 260)
  orb.webContents.mainFrame.url = orb.url
  listeners.get('orb:set-expanded')({ ...orbEvent, senderFrame: { url: orb.url } }, true)
  assert.equal(orb.bounds.width, 260)
  orb.setPosition(3000, 2000)
  electron.screen.emit('display-removed')
  assert.deepEqual(orb.getPosition(), [1660, 750])
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8')).orbPosition, { x: 1660, y: 750 })
  sendOrb(orb, 'set-expanded', true)
  orb.setPosition(3000, 2000)
  electron.screen.emit('display-metrics-changed')
  assert.deepEqual(orb.getPosition(), [1540, 500])
  sendOrb(orb, 'set-expanded', false)
  assert.ok(orb.bounds.x + orb.bounds.width <= 1920)
  // Centre and top edge are preserved where the work area permits it.
  orb.setPosition(500, 100)
  sendOrb(orb, 'set-expanded', true, window.webContents)
  assert.equal(orb.bounds.width, 260)
  sendOrb(orb, 'set-expanded', true)
  assert.deepEqual({ ...orb.bounds }, { x: 440, y: 100, width: 380, height: 580 })
  assert.equal(orb.ignoreMouse, false)
  assert.equal(orb.focusable, true)
  assert.equal(orb.focused, true)
  assert.equal(orb.resizable, false)
  sendOrb(orb, 'set-interactive', false)
  assert.equal(orb.ignoreMouse, false, 'Expanded composer stays interactive')
  sendOrb(orb, 'set-expanded', true)
  assert.equal(orb.bounds.x, 440, 'Repeated expansion does not shift the window')
  sendOrb(orb, 'move-to', { x: 9999, y: 9999 })
  assert.deepEqual(orb.getPosition(), [1540, 500], 'Expanded movement clamps to its actual size')
  sendOrb(orb, 'set-expanded', false)
  assert.deepEqual({ ...orb.bounds }, { x: 1600, y: 500, width: 260, height: 330 })
  assert.equal(orb.ignoreMouse, true)
  assert.equal(orb.forward, true)
  assert.equal(orb.focusable, false)
  orb.setPosition(500, 100)
  sendOrb(orb, 'set-expanded', true)
  sendOrb(orb, 'set-expanded', false)
  assert.deepEqual({ ...orb.bounds }, { x: 500, y: 100, width: 260, height: 330 })
  orb.setPosition(1636, 726)
  sendOrb(orb, 'set-expanded', true)
  assert.deepEqual({ ...orb.bounds }, { x: 1540, y: 476, width: 380, height: 580 }, 'Near the bottom the panel opens above, keeping the orb in place')
  sendOrb(orb, 'set-expanded', false)
  assert.deepEqual({ ...orb.bounds }, { x: 1636, y: 726, width: 260, height: 330 }, 'Collapsing returns the orb to exactly where it was')
  orb.setPosition(1636, 726)
  sendOrb(orb, 'set-interactive', true)
  assert.equal(orb.ignoreMouse, false)
  sendOrb(orb, 'set-interactive', 'false')
  assert.equal(orb.ignoreMouse, false)
  sendOrb(orb, 'set-interactive', false)
  assert.equal(orb.ignoreMouse, true)
  for (const payload of [null, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: '1', y: 2 }, { x: 1, y: 2, done: 'yes' }]) sendOrb(orb, 'move-to', payload)
  assert.deepEqual(orb.getPosition(), [1636, 726])
  sendOrb(orb, 'move-to', { x: -100.2, y: 2000.7, done: true })
  assert.deepEqual(orb.getPosition(), [0, 750])
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8')).orbPosition, { x: 0, y: 750 })
  sendOrb(orb, 'move-to', { x: 5000, y: -20 })
  assert.deepEqual(orb.getPosition(), [1660, 0])
  sendOrb(orb, 'move-to', { x: 120.6, y: 30.4 })
  assert.deepEqual(orb.getPosition(), [121, 30])
  sendOrb(orb, 'menu')
  assert.equal(menus[0].window, orb)
  assert.deepEqual(Array.from(menus[0].template, item => item.label || item.type), ['Open Agent Flow', 'Size', 'separator', 'Quit Agent Flow'])
  sendOrb(orb, 'open-full')
  assert.equal(orb.destroyed, true)
  assert.equal(invoke('state').orbOpen, false)
  assert.equal(window.hidden, false)
  assert.equal(window.focused, true)
  assert.deepEqual(edge.calls.at(-1), ['right', 675])
  invoke('toggle-orb')
  orb = windows.at(-1)
  assert.deepEqual(orb.getPosition(), [0, 750], 'Reopening uses the saved position')
  assert.equal(invoke('toggle-orb').orbOpen, false)
  assert.equal(orb.destroyed, true)
  invoke('toggle-orb')
  orb = windows.at(-1)
  orb.destroy()
  assert.equal(invoke('state').orbOpen, false, 'Native closure restores the main window')
  assert.equal(window.hidden, false)
  invoke('set-dock', 'off')
  window.setPosition(3000, 2000)
  electron.screen.emit('display-removed')
  assert.ok(window.bounds.x + window.bounds.width <= 1920)
  assert.ok(window.bounds.y + window.bounds.height <= 1080)
  invoke('toggle-orb')
  orb = windows.at(-1)
  selected = { canceled: false, filePaths: [folders[1]] }
  await invoke('choose-folder')
  assert.equal(children[0].stopped, true)
  assert.equal(children[1].stopped, undefined)
  assert.equal(invoke('state').folder, fs.realpathSync(folders[1]))
  assert.equal(orb.url, 'http://127.0.0.1:42002/?orb=1', 'Workspace switches reload the orb directly')
  children[1].emit('exit', 1)
  assert.equal(orb.destroyed, true, 'Worker exit closes the orb')
  assert.equal(window.hidden, false)
  assert.equal(invoke('state').url, '')
  await invoke('choose-folder')
  failNext = true
  selected = { canceled: false, filePaths: [folders[0]] }
  await invoke('choose-folder')
  assert.equal(children[3].stopped, true)
  assert.equal(children[2].stopped, undefined, 'Failed switch must keep the current workspace alive')
  assert.equal(invoke('state').url, 'http://127.0.0.1:42003')
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
  // All T3 projects: no folder choice, the last folder is kept for leaving the mode again.
  const lastFolder = invoke('state').lastFolder
  const allState = await invoke('set-runtime', 't3-all')
  assert.equal(allState.runtime, 't3-all')
  assert.deepEqual([...children.at(-1).args], [fs.realpathSync(root), 't3-all'])
  assert.equal(allState.lastFolder, lastFolder, 'Watching every project does not replace the last folder')
  const workers = children.length
  await invoke('open-project', { root: folders[0] })
  assert.equal(children.length, workers, 'A new thread already shows up while watching every project')
  const backState = await invoke('set-runtime', 't3')
  assert.equal(backState.folder, lastFolder)
  assert.deepEqual([...children.at(-1).args], [lastFolder, 't3'])
  const active = children.at(-1)
  invoke('toggle-orb')
  orb = windows.at(-1)
  const layouts = []
  orb.webContents.send = (channel, value) => { if (channel === 'orb:layout') layouts.push(value) }
  const centre = bounds => [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
  const before = centre(orb.getBounds())
  sendOrb(orb, 'menu')
  menus.at(-1).template.find(item => item.label === 'Size').submenu.find(item => item.label === 'Small').click()
  assert.deepEqual([orb.bounds.width, orb.bounds.height], [169, 215], 'Small is 65% of the large orb')
  assert.ok(centre(orb.getBounds()).every((value, index) => Math.abs(value - before[index]) <= 1), 'Resizing keeps the orb centred')
  assert.equal(layouts.at(-1).scale, 0.65, 'The page learns the new scale')
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8')).orbScale, 0.65)
  sendOrb(orb, 'set-expanded', true)
  assert.equal(orb.bounds.height, 215 + 250, 'The expanded window fits the smaller orb plus the panel')
  sendOrb(orb, 'set-expanded', false)
  assert.deepEqual([orb.bounds.width, orb.bounds.height], [169, 215])

  // Native desktop / orb waiting notifications: trust isolation, suppression, sanitization, throttling, click-to-focus.
  assert.throws(() => handlers.get('desktop:notify')({ ...trusted, sender: {} }, {}), /Untrusted desktop request/)
  assert.equal((await invoke('notify', { title: 'Approval needed', body: 'Lead · Team' })).shown, false, 'Main window notification is suppressed while orb is open')
  assert.throws(() => handlers.get('orb:notify')({ sender: window.webContents }, {}), /Untrusted orb request/)
  assert.throws(() => handlers.get('orb:notify')({ sender: orb.webContents, senderFrame: { url: orb.url } }, {}), /Untrusted orb request/)
  now += 2000
  assert.equal((await handlers.get('orb:notify')({ sender: orb.webContents, senderFrame: orb.webContents.mainFrame }, { title: '  Approval\n needed  ', body: 'Lead · Team', tag: 'o1' })).shown, true)
  assert.deepEqual({ ...notifications.at(-1).options }, { title: 'Approval needed', body: 'Lead · Team', silent: false })
  assert.equal(notifications.at(-1).shown, true)
  notifications.at(-1).emit('click')
  assert.equal(orb.destroyed, true)
  assert.equal(window.hidden, false)
  assert.equal(window.focused, true)
  assert.equal((await invoke('notify', { title: 'Input needed', body: 'Lead · Team' })).shown, false, 'Notification is suppressed when main window is visible and focused')
  window.minimize(); window.focused = false
  now += 2000
  assert.equal((await invoke('notify', { title: 'Input needed', body: 'x'.repeat(200), tag: 'm1' })).shown, true)
  assert.equal(notifications.at(-1).options.body.length, 140)
  now += 100
  assert.equal((await invoke('notify', { title: 'Input needed', body: 'Other', tag: 'm2' })).shown, false, 'Global rate limit throttles rapid notifications')
  now += 2000
  assert.equal((await invoke('notify', { title: 'Input needed', body: 'Same tag', tag: 'm1' })).shown, false, 'Same tag is deduped within 15 seconds')
  assert.equal((await invoke('notify', { title: 'Input needed', body: 'Worker · Team', tag: 'm2' })).shown, true)
  notifications.at(-1).emit('click')
  assert.equal(window.minimized, false)
  assert.equal(window.focused, true)
  notificationSupported = false
  window.minimize(); window.focused = false; now += 2000
  assert.equal((await invoke('notify', { title: 'Input needed', body: 'Worker · Team', tag: 'm3' })).shown, false)
  notificationSupported = true
  invoke('toggle-orb')
  orb = windows.at(-1)

  app.emit('before-quit', { preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(active.stopped, true)
  assert.equal(orb.destroyed, true)
  assert.equal(window.hidden, true, 'Quitting must not restore the main window')
})
