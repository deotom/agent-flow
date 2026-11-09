'use strict'
const { app, BrowserWindow, dialog, ipcMain, Menu, utilityProcess, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const t3CLI = require('./t3-cli.cjs').createT3CLI()

app.setName('Agent Flow')
const { resolveMobileConfig, createPairingQR } = require('./mobile-pairing.cjs')
const mobileConfig = resolveMobileConfig()
if (mobileConfig) process.env.AGENT_FLOW_REMOTE_CONFIG = mobileConfig
require('./mobile-profile.cjs').configureMobileProfile(app)
const shellURL = pathToFileURL(path.join(__dirname, 'shell.html')).href
let win
let orbWin
let orbExpanded = false
let worker
let pendingWorker
let settings = { alwaysOnTop: true, lastFolder: '', widgetMode: true, runtime: 'auto', dock: 'off', dockWidth: 380,
  widgetSize: { width: 360, height: 360 }, fullSize: { width: 1120, height: 800 } }
let docking = false
let state = { folder: '', url: '', busy: false, error: '', sourceStatus: '' }
let quitting = false

function settingsPath() { return path.join(app.getPath('userData'), 'desktop-settings.json') }
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    settings = {
      alwaysOnTop: typeof saved.alwaysOnTop === 'boolean' ? saved.alwaysOnTop : true,
      lastFolder: typeof saved.lastFolder === 'string' ? saved.lastFolder : '',
      widgetMode: typeof saved.widgetMode === 'boolean' ? saved.widgetMode : true,
      runtime: saved.runtime === 't3' ? 't3' : 'auto',
      widgetSize: validSize(saved.widgetSize, 260, 260, { width: 360, height: 360 }),
      fullSize: validSize(saved.fullSize, 620, 440, { width: 1120, height: 800 }),
      dock: saved.dock === 'left' || saved.dock === 'right' ? saved.dock : 'off',
      dockWidth: Number.isInteger(saved.dockWidth) && saved.dockWidth >= 260 && saved.dockWidth <= 1600 ? saved.dockWidth : 380,
      orbPosition: validPosition(saved.orbPosition),
    }
  } catch { /* First launch or invalid settings: use defaults. */ }
}
function validPosition(value) {
  return value && Number.isInteger(value.x) && Number.isInteger(value.y) && Math.abs(value.x) <= 100000 && Math.abs(value.y) <= 100000
    ? { x: value.x, y: value.y } : undefined
}
function validSize(value, minWidth, minHeight, fallback) {
  return value && Number.isInteger(value.width) && Number.isInteger(value.height)
    && value.width >= minWidth && value.height >= minHeight && value.width <= 7680 && value.height <= 4320
    ? { width: value.width, height: value.height } : fallback
}
function rememberSize() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
  const { width, height } = win.getBounds()
  if (settings.dock !== 'off') { settings.dockWidth = width; return }
  settings[settings.widgetMode ? 'widgetSize' : 'fullSize'] = { width, height }
}
function saveSettings() {
  const file = settingsPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(settings, null, 2))
  fs.renameSync(`${file}.tmp`, file)
}
function snapshot() { return { ...state, ...settings, orbOpen: Boolean(orbWin) } }
function publish() {
  if (win && !win.isDestroyed()) win.webContents.send('desktop:state', snapshot())
}
function retire(child) {
  if (!child) return Promise.resolve()
  return new Promise(resolve => {
    const timer = setTimeout(() => { child.kill(); resolve() }, 2000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    try { child.postMessage('stop') } catch { clearTimeout(timer); child.kill(); resolve() }
  })
}

async function openFolder(folder, runtime = settings.runtime) {
  if (state.busy || quitting) return snapshot()
  state.busy = true
  state.error = ''
  publish()
  let candidate
  try {
    folder = fs.realpathSync(folder)
    if (!fs.statSync(folder).isDirectory()) throw new Error('Please select a folder.')
    candidate = utilityProcess.fork(path.join(__dirname, 'dist/worker.cjs'), [folder, runtime], {
      cwd: folder,
      serviceName: 'Agent Flow workspace',
      stdio: 'pipe',
    })
    pendingWorker = candidate
    let sourceStatus = ''
    candidate.on('message', message => {
      if (message?.type !== 'source-status' || typeof message.message !== 'string') return
      sourceStatus = message.message
      if (worker === candidate) { state.sourceStatus = sourceStatus; publish() }
    })
    let diagnostics = ''
    candidate.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-2000) })
    candidate.stdout?.on('data', () => {})
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Workspace took too long to open. Please try again.')), 90000)
      const onExit = code => finish(new Error(diagnostics || `Workspace service exited (${code}).`))
      const onMessage = message => {
        if (message?.type === 'ready' && /^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) finish(null, message.url)
        if (message?.type === 'error') finish(new Error(message.message))
      }
      function finish(error, value) {
        clearTimeout(timer)
        candidate.removeListener('exit', onExit)
        candidate.removeListener('message', onMessage)
        if (error) reject(error)
        else resolve(value)
      }
      candidate.once('exit', onExit)
      candidate.on('message', onMessage)
    })
    if (quitting) { await retire(candidate); return snapshot() }
    const previous = worker
    worker = candidate
    pendingWorker = undefined
    state.folder = folder
    state.url = url
    if (orbWin) orbWin.loadURL(`${url}/?orb=1`)
    state.sourceStatus = sourceStatus
    settings.lastFolder = folder
    settings.runtime = runtime
    worker.once('exit', code => {
      if (worker !== candidate || quitting) return
      worker = undefined
      state.url = ''
      closeOrb()
      state.error = `Workspace service stopped (${code}). Select the folder to reconnect.`
      publish()
    })
    try { saveSettings() } catch (error) { state.error = `Could not remember preferences: ${error.message}` }
    publish()
    await retire(previous)
  } catch (error) {
    await retire(candidate)
    state.error = error.message
  } finally {
    if (pendingWorker === candidate) pendingWorker = undefined
    state.busy = false
    publish()
  }
  return snapshot()
}

async function chooseFolder() {
  if (state.busy) return snapshot()
  const selected = await dialog.showOpenDialog(win, {
    title: 'Choose an agent workspace',
    defaultPath: state.folder || settings.lastFolder || app.getPath('home'),
    properties: ['openDirectory'],
  })
  if (!selected.canceled && selected.filePaths[0]) return openFolder(selected.filePaths[0])
  return snapshot()
}
function togglePin() {
  settings.alwaysOnTop = !settings.alwaysOnTop
  win.setAlwaysOnTop(settings.alwaysOnTop)
  try { saveSettings() } catch (error) { state.error = `Could not remember preferences: ${error.message}` }
  publish()
  return snapshot()
}
// // Dock: pin the window to the left or right edge of its display at full work-area height. On Windows the
// edge is also reserved like the taskbar (see appbar.cjs), so other windows maximize beside it.
let appBar
let reserved = false
let dockBounds
function placeDocked(bounds) {
  docking = true
  try { win.setBounds(bounds) } finally { docking = false }
  dockBounds = win.getBounds()
}
function releaseEdge() {
  reserved = false
  appBar?.remove()
}
function applyDock() {
  if (orbWin || !win || win.isDestroyed() || settings.dock === 'off') return
  if (win.isMaximized()) win.unmaximize()
  const display = screen.getDisplayMatching(win.getBounds())
  const area = display.workArea
  const width = Math.max(260, Math.min(settings.dockWidth, area.width))
  // Once the edge is reserved the work area excludes it, so the shell's rect places the window instead.
  if (!reserved) placeDocked({ x: settings.dock === 'left' ? area.x : area.x + area.width - width, y: area.y, width, height: area.height })
  appBar?.set(settings.dock, width * (display.scaleFactor || 1))
}
function onEdgeReserved(rect) {
  if (orbWin || settings.dock === 'off' || !win || win.isDestroyed()) return
  reserved = true
  placeDocked(screen.screenToDipRect(win, rect))
}
function onEdgeUnavailable() {
  reserved = false
  applyDock()
}
function setDock(side) {
  if (side !== 'left' && side !== 'right' && side !== 'off') throw new Error('Unknown dock side')
  if (side === settings.dock) return snapshot()
  if (settings.dock === 'off') rememberSize()
  settings.dock = side
  win.setMinimumSize(settings.widgetMode || side !== 'off' ? 260 : 620, settings.widgetMode ? 260 : 440)
  if (side !== 'off') applyDock()
  else {
    releaseEdge()
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    const size = settings.widgetMode ? settings.widgetSize : settings.fullSize
    const width = Math.min(size.width, area.width)
    const height = Math.min(size.height, area.height)
    const bounds = win.getBounds()
    win.setBounds({ width, height, y: area.y + Math.round((area.height - height) / 2),
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)) })
  }
  try { saveSettings() } catch (error) { state.error = `Could not remember preferences: ${error.message}` }
  publish()
  return snapshot()
}
function toggleDock() {
  if (settings.dock !== 'off') return setDock('off')
  const bounds = win.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  return setDock(bounds.x + bounds.width / 2 < area.x + area.width / 2 ? 'left' : 'right')
}
// The user dragged a docked window away from where it was docked: treat that as undocking.
function onMoved() {
  if (docking || settings.dock === 'off' || !win || win.isDestroyed() || !dockBounds) return
  const bounds = win.getBounds()
  if (Math.abs(bounds.x - dockBounds.x) <= 8 && Math.abs(bounds.y - dockBounds.y) <= 8) return
  settings.dock = 'off'
  releaseEdge()
  const area = screen.getDisplayMatching(bounds).workArea
  const size = settings.widgetMode ? settings.widgetSize : settings.fullSize
  win.setMinimumSize(settings.widgetMode ? 260 : 620, settings.widgetMode ? 260 : 440)
  win.setBounds({ x: bounds.x, y: bounds.y, width: Math.min(size.width, area.width), height: Math.min(size.height, area.height) })
  try { saveSettings() } catch { /* The window still moves if settings cannot be saved. */ }
  publish()
}
function onResized() {
  if (docking || settings.dock === 'off' || !win || win.isDestroyed()) return
  settings.dockWidth = win.getBounds().width
  applyDock()
  try { saveSettings() } catch { /* Resizing still works if settings cannot be saved. */ }
}
function toggleWidget() {
  if (settings.dock !== 'off') {
    settings.widgetMode = !settings.widgetMode
    win.setMinimumSize(260, settings.widgetMode ? 260 : 440)
    applyDock()
    try { saveSettings() } catch (error) { state.error = `Could not remember preferences: ${error.message}` }
    publish()
    return snapshot()
  }
  rememberSize()
  const previous = win.getNormalBounds()
  if (win.isMaximized()) win.unmaximize()
  settings.widgetMode = !settings.widgetMode
  const size = settings.widgetMode ? settings.widgetSize : settings.fullSize
  const area = screen.getDisplayMatching(previous).workArea
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  win.setMinimumSize(settings.widgetMode ? 260 : 620, settings.widgetMode ? 260 : 440)
  win.setBounds({ width, height,
    x: Math.max(area.x, Math.min(previous.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(previous.y, area.y + area.height - height)),
  })
  try { saveSettings() } catch (error) { state.error = `Could not remember preferences: ${error.message}` }
  publish()
  return snapshot()
}
function resizeWidget(size) {
  if (settings.dock !== 'off' && size && Number.isFinite(size.width)) {
    settings.dockWidth = Math.max(260, Math.round(size.width))
    applyDock()
    if (size.finished === true) try { saveSettings() } catch { /* Resizing is still available if settings cannot be saved. */ }
    return
  }
  if (!settings.widgetMode || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) return
  const bounds = win.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const width = Math.max(260, Math.min(Math.round(size.width), area.width))
  const height = Math.max(260, Math.min(Math.round(size.height), area.height))
  win.setBounds({ ...bounds, width, height })
  if (size.finished === true) {
    rememberSize()
    try { saveSettings() } catch { /* Resizing is still available if settings cannot be saved. */ }
  }
}
function restoreMain() {
  if (quitting || !win || win.isDestroyed()) return
  win.show()
  win.focus()
  if (settings.dock !== 'off') applyDock()
  publish()
}
function closeOrb() {
  if (!orbWin) return
  const closing = orbWin
  orbWin = undefined
  closing.destroy()
  restoreMain()
}
function toggleOrb() {
  if (orbWin) { closeOrb(); return snapshot() }
  if (!state.url) {
    state.error = 'Open a workspace before switching to the orb.'
    publish()
    return snapshot()
  }
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  orbExpanded = false
  orbLayout = { left: 0, top: 0, panel: 'below' }
  const saved = settings.orbPosition
  const onScreen = saved && screen.getAllDisplays().some(({ workArea: a }) =>
    saved.x >= a.x && saved.y >= a.y && saved.x + 260 <= a.x + a.width && saved.y + 270 <= a.y + a.height)
  const position = onScreen ? saved : { x: Math.max(area.x, area.x + area.width - 284), y: Math.max(area.y, area.y + area.height - 294) }
  const orb = orbWin = new BrowserWindow({
    ...position, width: 260, height: 270, resizable: false, maximizable: false, minimizable: false,
    skipTaskbar: true, hasShadow: false, transparent: true, backgroundColor: '#00000000', frame: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'orb-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  orb.setIgnoreMouseEvents(true, { forward: true })
  orb.setAlwaysOnTop(true, 'floating')
  orb.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  orb.webContents.on('will-navigate', (event, url) => { if (url !== `${state.url}/?orb=1`) event.preventDefault() })
  orb.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  orb.on('closed', () => {
    if (orbWin !== orb) return
    orbWin = undefined
    restoreMain()
  })
  orb.loadURL(`${state.url}/?orb=1`)
  win.hide()
  if (settings.dock !== 'off') releaseEdge()
  publish()
  return snapshot()
}
// Where the orb canvas sits inside the expanded window, so the orb itself never moves on screen.
let orbLayout = { left: 0, top: 0, panel: 'below' }
function setOrbExpanded(value) {
  if (typeof value !== 'boolean' || value === orbExpanded) return
  const bounds = orbWin.getBounds()
  // The orb's own top-left on screen (also correct after the expanded window was dragged).
  const orbAt = orbExpanded ? { x: bounds.x + orbLayout.left, y: bounds.y + orbLayout.top } : { x: bounds.x, y: bounds.y }
  const area = screen.getDisplayMatching(bounds).workArea
  const clamp = (v, low, high) => Math.round(Math.max(low, Math.min(v, high)))
  let next
  if (value) {
    const width = 380, height = 520
    // Open the panel below when it fits, otherwise above, so the orb stays where the user put it.
    const panel = orbAt.y + height <= area.y + area.height ? 'below' : 'above'
    const x = clamp(orbAt.x - (width - 260) / 2, area.x, area.x + area.width - width)
    const y = clamp(panel === 'below' ? orbAt.y : orbAt.y - (height - 270), area.y, area.y + area.height - height)
    orbLayout = { left: orbAt.x - x, top: orbAt.y - y, panel }
    next = { x, y, width, height }
  } else {
    orbLayout = { left: 0, top: 0, panel: 'below' }
    next = { x: clamp(orbAt.x, area.x, area.x + area.width - 260), y: clamp(orbAt.y, area.y, area.y + area.height - 270), width: 260, height: 270 }
  }
  orbWin.setResizable(true)
  try { orbWin.setBounds(next) }
  finally { orbWin.setResizable(false) }
  orbWin.webContents.send('orb:layout', { expanded: value, ...orbLayout })
  orbExpanded = value
  orbWin.setIgnoreMouseEvents(!value, { forward: true })
  orbWin.setFocusable(value)
  if (value) orbWin.focus()
}
function openProject(payload) {
  return openFolder(t3CLI.projectRoot(payload?.root))
}
function registerIPC() {
  const actions = {
    'desktop:t3-send': t3CLI.t3Send,
    'desktop:t3-start': t3CLI.t3Start,
    'desktop:open-project': openProject,
    'desktop:state': snapshot,
    'desktop:choose-folder': chooseFolder,
    'desktop:open-last': () => settings.lastFolder ? openFolder(settings.lastFolder) : snapshot(),
    'desktop:toggle-pin': togglePin,
    'desktop:toggle-widget': toggleWidget,
    'desktop:toggle-dock': toggleDock,
    'desktop:toggle-orb': toggleOrb,
    'desktop:set-dock': setDock,
    'desktop:set-runtime': async value => {
      if (value !== 'auto' && value !== 't3') throw new Error('Unknown source mode')
      if (state.busy || value === settings.runtime) return snapshot()
      if (state.folder) return openFolder(state.folder, value)
      settings.runtime = value
      saveSettings(); publish()
      return snapshot()
    },
    'desktop:minimize': () => win.minimize(),
    'desktop:close': () => win.close(),
    'desktop:resize-widget': resizeWidget,
    'desktop:pair-mobile': () => createPairingQR(mobileConfig),
  }
  for (const [channel, handler] of Object.entries(actions)) ipcMain.handle(channel, (event, payload) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== shellURL) {
      throw new Error('Untrusted desktop request')
    }
    return handler(payload)
  })
  const orbActions = {
    'orb:set-expanded': setOrbExpanded,
    'orb:set-interactive': value => {
      if (typeof value === 'boolean') orbWin.setIgnoreMouseEvents(orbExpanded ? false : !value, { forward: true })
    },
    'orb:move-to': value => {
      if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || (value.done !== undefined && typeof value.done !== 'boolean')) return
      const { width, height } = orbWin.getBounds()
      const area = screen.getDisplayMatching({ x: Math.round(value.x), y: Math.round(value.y), width, height }).workArea
      const x = Math.max(area.x, Math.min(Math.round(value.x), area.x + area.width - width))
      const y = Math.max(area.y, Math.min(Math.round(value.y), area.y + area.height - height))
      orbWin.setPosition(x, y)
      if (value.done === true) {
        // Remember the orb itself, not the larger expanded window around it.
        settings.orbPosition = { x: x + orbLayout.left, y: y + orbLayout.top }
        try { saveSettings() } catch (error) { state.error = `Could not remember preferences: ${error.message}` }
        publish()
      }
    },
    'orb:open-full': closeOrb,
    'orb:menu': () => Menu.buildFromTemplate([
      { label: 'Open Agent Flow', click: closeOrb },
      { type: 'separator' },
      { label: 'Quit Agent Flow', click: () => app.quit() },
    ]).popup({ window: orbWin }),
  }
  for (const [channel, handler] of Object.entries(orbActions)) ipcMain.on(channel, (event, payload) => {
    if (orbWin && event.sender === orbWin.webContents) handler(payload)
  })
  for (const [channel, handler] of Object.entries({ 'orb:t3-send': t3CLI.t3Send, 'orb:t3-start': t3CLI.t3Start, 'orb:open-project': openProject })) {
    ipcMain.handle(channel, (event, payload) => {
      if (!orbWin || event.sender !== orbWin.webContents) throw new Error('Untrusted orb request')
      return handler(payload)
    })
  }
}
function createWindow() {
  const size = settings.widgetMode ? settings.widgetSize : settings.fullSize
  win = new BrowserWindow({
    title: 'Agent Flow', ...size, minWidth: settings.widgetMode || settings.dock !== 'off' ? 260 : 620, minHeight: settings.widgetMode ? 260 : 440,
    frame: false,
    backgroundColor: '#080e1b', alwaysOnTop: settings.alwaysOnTop,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => { if (url !== shellURL) event.preventDefault() })
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  win.on('page-title-updated', event => event.preventDefault())
  if (process.platform === 'win32') {
    appBar = require('./appbar.cjs').createAppBar(() => win.getNativeWindowHandle().readBigUInt64LE(0).toString(), onEdgeReserved, onEdgeUnavailable)
  }
  win.on('closed', releaseEdge)
  win.on('moved', onMoved)
  win.on('resized', onResized)
  screen.on?.('display-metrics-changed', applyDock)
  applyDock()
  win.on('close', () => {
    rememberSize()
    try { saveSettings() } catch { /* Closing still works if preferences cannot be written. */ }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Workspace', submenu: [
      { label: 'Choose folder…', accelerator: 'CmdOrCtrl+O', click: chooseFolder },
      { label: 'Toggle always on top', accelerator: 'CmdOrCtrl+Shift+T', click: togglePin },
      { label: 'Toggle widget', accelerator: 'CmdOrCtrl+Shift+W', click: toggleWidget },
      { label: 'Orb mode', accelerator: 'CmdOrCtrl+Shift+O', click: toggleOrb },
      { label: 'Dock left', accelerator: 'CmdOrCtrl+Shift+Left', click: () => setDock('left') },
      { label: 'Dock right', accelerator: 'CmdOrCtrl+Shift+Right', click: () => setDock('right') },
      { label: 'Undock', accelerator: 'CmdOrCtrl+Shift+D', click: () => setDock('off') },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
  ]))
  win.loadFile(path.join(__dirname, 'shell.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() } })
  app.whenReady().then(() => { loadSettings(); registerIPC(); createWindow() }).catch(error => {
    dialog.showErrorBox('Agent Flow could not start', error.message)
    app.quit()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', event => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    closeOrb()
    releaseEdge()
    Promise.all([retire(worker), retire(pendingWorker)]).finally(() => app.quit())
  })
}
