'use strict'
const api = window.agentFlowDesktop
const element = id => document.getElementById(id)
let currentURL = ''
let widgetMode = true
let dockSide = 'off'
function sendMode() {
  if (currentURL) element('graph').contentWindow.postMessage({ type: 'desktop:widget', widget: widgetMode }, currentURL)
}
function render(state) {
  element('orb-button').disabled = !state.url
  element('source-mode').value = state.runtime || 'auto'
  element('source-mode').disabled = state.busy
  widgetMode = state.widgetMode
  document.body.classList.toggle('widget', widgetMode)
  element('pin-button').setAttribute('aria-pressed', String(state.alwaysOnTop))
  element('pin-text').textContent = state.alwaysOnTop ? 'Pinned' : 'Always on top'
  element('widget-button').setAttribute('aria-pressed', String(widgetMode))
  element('widget-button').setAttribute('aria-label', widgetMode ? 'Expand to full view' : 'Switch to widget')
  element('widget-icon').textContent = widgetMode ? '⤢' : '⊡'
  element('widget-text').textContent = widgetMode ? 'Full view' : 'Widget'
  const dock = dockSide = state.dock || 'off'
  document.body.classList.toggle('docked', dock !== 'off')
  element('dock-button').setAttribute('aria-pressed', String(dock !== 'off'))
  element('dock-button').setAttribute('aria-label', dock === 'off' ? 'Dock to screen edge' : 'Undock')
  element('dock-icon').textContent = dock === 'left' ? '▌' : '▐'
  element('dock-text').textContent = dock === 'off' ? 'Dock' : 'Undock'
  for (const id of ['folder-button', 'welcome-choose', 'open-last', 'open-all-t3']) element(id).disabled = state.busy
  const allT3 = state.runtime === 't3-all'
  element('folder-text').textContent = state.busy ? 'Opening…' : state.folder && !allT3 ? 'Change folder' : 'Choose folder'
  element('workspace-label').textContent = allT3 ? 'All T3 projects' : widgetMode && state.folder ? state.folder.split(/[\\/]/).filter(Boolean).pop() : state.folder || 'No workspace selected'
  element('workspace-label').title = allT3 ? 'Teams from every T3 project on this computer' : state.folder
  // In T3 mode the team view reports T3 health itself; the shell only reports its local viewer.
  const t3View = state.runtime !== 'auto' && Boolean(state.url)
  element('connection-label').textContent = state.busy ? 'CONNECTING' : t3View ? 'VIEWER ON' : state.url ? 'CONNECTED' : 'READY'
  element('connection-dot').classList.toggle('connected', Boolean(state.url))
  const sourceError = state.runtime !== 'auto' && !t3View && state.sourceStatus && state.sourceStatus !== 'T3 local teams (read-only)' ? state.sourceStatus : ''
  element('error').textContent = state.error || sourceError
  element('error').hidden = !(state.error || sourceError)
  element('welcome').hidden = Boolean(state.url)
  element('graph').hidden = !state.url
  element('open-last').hidden = !state.lastFolder
  element('last-folder').textContent = state.lastFolder
  element('last-folder').title = state.lastFolder
  element('footer-status').textContent = state.busy ? 'OPENING WORKSPACE…' : allT3 ? 'ALL T3 PROJECTS · READ ONLY' : state.runtime === 't3' ? 'T3 TEAMS · READ ONLY' : state.url ? 'WATCHING LOCAL AGENT SESSIONS' : 'LOCAL WORKSPACE VIEWER'
  if (state.url !== currentURL) {
    currentURL = state.url
    element('graph').src = state.url ? `${state.url}/?desktop=1&widget=${widgetMode ? '1' : '0'}${allT3 ? '&scope=all' : ''}` : 'about:blank'
  }
  sendMode()
}
async function act(action) {
  try { render(await action()) }
  catch (error) { element('error').textContent = error.message; element('error').hidden = false }
}
element('folder-button').addEventListener('click', () => act(api.chooseFolder))
element('source-mode').addEventListener('change', event => act(() => api.setRuntime(event.target.value)))
element('welcome-choose').addEventListener('click', () => act(api.chooseFolder))
element('open-last').addEventListener('click', () => act(api.openLast))
element('open-all-t3').addEventListener('click', () => act(api.openAllT3))
element('pin-button').addEventListener('click', () => act(api.togglePin))
element('widget-button').addEventListener('click', () => act(api.toggleWidget))
element('dock-button').addEventListener('click', () => act(api.toggleDock))
element('orb-button').addEventListener('click', () => act(api.toggleOrb))
element('dock-button').addEventListener('contextmenu', event => {
  // Right-click moves a docked window to the other edge.
  event.preventDefault()
  act(() => api.setDock(dockSide === 'left' ? 'right' : 'left'))
})
element('minimize-button').addEventListener('click', () => api.minimize())
element('close-button').addEventListener('click', () => api.close())
element('graph').addEventListener('load', sendMode)
const grip = element('resize-grip')
let resizing
let resizeFrame = 0
grip.addEventListener('pointerdown', event => {
  if (event.button !== 0) return
  event.preventDefault()
  resizing = { x: event.screenX, y: event.screenY, width: window.innerWidth, height: window.innerHeight }
  grip.setPointerCapture(event.pointerId)
})
grip.addEventListener('pointermove', event => {
  if (!resizing) return
  const size = { width: resizing.width + event.screenX - resizing.x, height: resizing.height + event.screenY - resizing.y }
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => { void api.resizeWidget(size) })
})
function finishResize(event) {
  if (!resizing) return
  cancelAnimationFrame(resizeFrame)
  const size = { width: resizing.width + event.screenX - resizing.x, height: resizing.height + event.screenY - resizing.y, finished: true }
  resizing = undefined
  void api.resizeWidget(size)
}
grip.addEventListener('pointerup', finishResize)
grip.addEventListener('pointercancel', finishResize)
window.addEventListener('message', async event => {
  if (!currentURL || event.source !== element('graph').contentWindow || event.origin !== currentURL) return
  if (event.data?.type === 'desktop:ready') { sendMode(); return }
  const { type, id, action, payload } = event.data || {}
  const actions = { 't3-send': api.t3Send, 't3-start': api.t3Start, 'open-project': api.openProject, notify: api.notify }
  if (type !== 'agent-flow:desktop-request' || typeof id !== 'string' || !id.length || id.length > 100 || !Object.hasOwn(actions, action)) return
  const source = event.source
  const origin = currentURL
  let response
  try { response = { type: 'agent-flow:desktop-response', id, ok: true, result: await actions[action](payload) } }
  catch (error) { response = { type: 'agent-flow:desktop-response', id, ok: false, error: String(error.message || 'Desktop request failed.').slice(0, 200) } }
  source.postMessage(response, origin)
})
api.onState(render)
api.onFocusAgent?.(target => {
  if (!currentURL || !target || typeof target.sessionId !== 'string' || typeof target.agentId !== 'string' || !target.sessionId || !target.agentId) return
  element('graph').contentWindow?.postMessage({ type: 'desktop:focus-agent', sessionId: target.sessionId, agentId: target.agentId }, currentURL)
})
act(api.state)
