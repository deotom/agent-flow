'use strict'
const { app, BrowserWindow, dialog, ipcMain, Menu, utilityProcess, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

app.setName('Agent Flow')
const { resolveMobileConfig, createPairingQR } = require('./mobile-pairing.cjs')
const mobileConfig = resolveMobileConfig()
if (mobileConfig) process.env.AGENT_FLOW_REMOTE_CONFIG = mobileConfig
require('./mobile-profile.cjs').configureMobileProfile(app)
const shellURL = pathToFileURL(path.join(__dirname, 'shell.html')).href
let win
let worker
let pendingWorker
let settings = { alwaysOnTop: true, lastFolder: '', widgetMode: true,
  widgetSize: { width: 360, height: 360 }, fullSize: { width: 1120, height: 800 } }
let state = { folder: '', url: '', busy: false, error: '' }
let quitting = false

function settingsPath() { return path.join(app.getPath('userData'), 'desktop-settings.json') }
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    settings = {
      alwaysOnTop: typeof saved.alwaysOnTop === 'boolean' ? saved.alwaysOnTop : true,
      lastFolder: typeof saved.lastFolder === 'string' ? saved.lastFolder : '',
      widgetMode: typeof saved.widgetMode === 'boolean' ? saved.widgetMode : true,
      widgetSize: validSize(saved.widgetSize, 260, 260, { width: 360, height: 360 }),
      fullSize: validSize(saved.fullSize, 620, 440, { width: 1120, height: 800 }),
    }
  } catch { /* First launch or invalid settings: use defaults. */ }
}
function validSize(value, minWidth, minHeight, fallback) {
  return value && Number.isInteger(value.width) && Number.isInteger(value.height)
    && value.width >= minWidth && value.height >= minHeight && value.width <= 7680 && value.height <= 4320
    ? { width: value.width, height: value.height } : fallback
}
function rememberSize() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
  const { width, height } = win.getBounds()
  settings[settings.widgetMode ? 'widgetSize' : 'fullSize'] = { width, height }
}
function saveSettings() {
  const file = settingsPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(settings, null, 2))
  fs.renameSync(`${file}.tmp`, file)
}
function snapshot() { return { ...state, ...settings } }
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

async function openFolder(folder) {
  if (state.busy || quitting) return snapshot()
  state.busy = true
  state.error = ''
  publish()
  let candidate
  try {
    folder = fs.realpathSync(folder)
    if (!fs.statSync(folder).isDirectory()) throw new Error('Please select a folder.')
    candidate = utilityProcess.fork(path.join(__dirname, 'dist/worker.cjs'), [folder], {
      cwd: folder,
      serviceName: 'Agent Flow workspace',
      stdio: 'pipe',
    })
    pendingWorker = candidate
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
    settings.lastFolder = folder
    worker.once('exit', code => {
      if (worker !== candidate || quitting) return
      worker = undefined
      state.url = ''
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
function toggleWidget() {
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
function registerIPC() {
  const actions = {
    'desktop:state': snapshot,
    'desktop:choose-folder': chooseFolder,
    'desktop:open-last': () => settings.lastFolder ? openFolder(settings.lastFolder) : snapshot(),
    'desktop:toggle-pin': togglePin,
    'desktop:toggle-widget': toggleWidget,
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
}
function createWindow() {
  const size = settings.widgetMode ? settings.widgetSize : settings.fullSize
  win = new BrowserWindow({
    title: 'Agent Flow', ...size, minWidth: settings.widgetMode ? 260 : 620, minHeight: settings.widgetMode ? 260 : 440,
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
  win.on('close', () => {
    rememberSize()
    try { saveSettings() } catch { /* Closing still works if preferences cannot be written. */ }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Workspace', submenu: [
      { label: 'Choose folder…', accelerator: 'CmdOrCtrl+O', click: chooseFolder },
      { label: 'Toggle always on top', accelerator: 'CmdOrCtrl+Shift+T', click: togglePin },
      { label: 'Toggle widget', accelerator: 'CmdOrCtrl+Shift+W', click: toggleWidget },
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
    Promise.all([retire(worker), retire(pendingWorker)]).finally(() => app.quit())
  })
}
