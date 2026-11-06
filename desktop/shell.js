'use strict'
const api = window.agentFlowDesktop
const element = id => document.getElementById(id)
let currentURL = ''
let widgetMode = true
function sendMode() {
  if (currentURL) element('graph').contentWindow.postMessage({ type: 'desktop:widget', widget: widgetMode }, currentURL)
}
function render(state) {
  widgetMode = state.widgetMode
  document.body.classList.toggle('widget', widgetMode)
  element('pin-button').setAttribute('aria-pressed', String(state.alwaysOnTop))
  element('pin-text').textContent = state.alwaysOnTop ? 'Pinned' : 'Always on top'
  element('widget-button').setAttribute('aria-pressed', String(widgetMode))
  element('widget-button').setAttribute('aria-label', widgetMode ? 'Expand to full view' : 'Switch to widget')
  element('widget-icon').textContent = widgetMode ? '⤢' : '⊡'
  element('widget-text').textContent = widgetMode ? 'Full view' : 'Widget'
  for (const id of ['folder-button', 'welcome-choose', 'open-last']) element(id).disabled = state.busy
  element('folder-text').textContent = state.busy ? 'Opening…' : state.folder ? 'Change folder' : 'Choose folder'
  element('workspace-label').textContent = widgetMode && state.folder ? state.folder.split(/[\\/]/).filter(Boolean).pop() : state.folder || 'No workspace selected'
  element('workspace-label').title = state.folder
  element('connection-label').textContent = state.busy ? 'CONNECTING' : state.url ? 'CONNECTED' : 'READY'
  element('connection-dot').classList.toggle('connected', Boolean(state.url))
  element('error').textContent = state.error
  element('error').hidden = !state.error
  element('welcome').hidden = Boolean(state.url)
  element('graph').hidden = !state.url
  element('open-last').hidden = !state.lastFolder
  element('last-folder').textContent = state.lastFolder
  element('last-folder').title = state.lastFolder
  element('footer-status').textContent = state.busy ? 'OPENING WORKSPACE…' : state.url ? 'WATCHING LOCAL AGENT SESSIONS' : 'LOCAL WORKSPACE VIEWER'
  if (state.url !== currentURL) {
    currentURL = state.url
    element('graph').src = state.url ? `${state.url}/?desktop=1&widget=${widgetMode ? '1' : '0'}` : 'about:blank'
  }
  sendMode()
}
async function act(action) {
  try { render(await action()) }
  catch (error) { element('error').textContent = error.message; element('error').hidden = false }
}
element('folder-button').addEventListener('click', () => act(api.chooseFolder))
element('welcome-choose').addEventListener('click', () => act(api.chooseFolder))
element('open-last').addEventListener('click', () => act(api.openLast))
element('pin-button').addEventListener('click', () => act(api.togglePin))
element('widget-button').addEventListener('click', () => act(api.toggleWidget))
element('minimize-button').addEventListener('click', () => api.minimize())
element('close-button').addEventListener('click', () => api.close())
let pairingRequest = 0
element('mobile-button').addEventListener('click', async () => {
  const request = ++pairingRequest
  element('mobile-qr').hidden = true
  element('mobile-qr').removeAttribute('src')
  element('mobile-error').hidden = true
  element('mobile-dialog').showModal()
  try {
    const result = await api.pairMobile()
    if (request !== pairingRequest || !element('mobile-dialog').open) return
    element('mobile-qr').src = result.dataURL
    element('mobile-qr').hidden = false
  } catch (error) {
    if (request !== pairingRequest || !element('mobile-dialog').open) return
    element('mobile-error').textContent = error.message
    element('mobile-error').hidden = false
  }
})
element('mobile-close').addEventListener('click', () => element('mobile-dialog').close())
element('mobile-dialog').addEventListener('close', () => {
  pairingRequest++
  element('mobile-qr').removeAttribute('src')
  element('mobile-qr').hidden = true
})
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
window.addEventListener('message', event => {
  if (currentURL && event.source === element('graph').contentWindow && event.origin === currentURL && event.data?.type === 'desktop:ready') sendMode()
})
api.onState(render)
act(api.state)
