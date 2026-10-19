import { it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { TypedEventEmitter } from '../src/typed-event-emitter'
import type { AgentEvent } from '../src/protocol'

it('streams to the Explorer and editor independently, isolates history replay, and disposes only the closed view', async () => {
  const makeSurface = () => {
    const messages: any[] = []
    let visibilityChanged = () => {}
    let received: (message: any) => void = () => {}
    return {
      visible: true,
      onDidChangeVisibility: (listener: () => void) => { visibilityChanged = listener; return { dispose() {} } },
      changeVisibility(visible: boolean) { this.visible = visible; visibilityChanged() },
      messages,
      receive(message: any) { received(message) },
      webview: { html: '', options: {}, cspSource: 'test', asWebviewUri: (uri: string) => uri,
        postMessage: (message: unknown) => messages.push(message), onDidReceiveMessage: (listener: (message: any) => void) => { received = listener; return { dispose() {} } } },
      onDidDispose: () => ({ dispose() {} }), reveal() {},
    }
  }
  const editorSurface = makeSurface()
  const sidebarSurface = makeSurface()
  const vscode = {
    EventEmitter: TypedEventEmitter,
    Uri: { joinPath: (...parts: string[]) => parts.join('/') },
    workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
    window: { createWebviewPanel: () => editorSurface, setStatusBarMessage() {} },
  }
  const bundle = buildSync({ stdin: {
    contents: "export { VisualizerPanel } from './src/webview-provider'; export { wireWatcherToPanel } from './src/session-runtime'",
    resolveDir: process.cwd(), loader: 'ts',
  }, bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], write: false })
  const module = { exports: {} as any }
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports,
    require: (name: string) => name === 'vscode' ? vscode : require(name), setTimeout, clearTimeout })
  const { VisualizerPanel, wireWatcherToPanel } = module.exports
  const sidebar = VisualizerPanel.resolveSidebar(sidebarSurface, '/extension')
  sidebar.markReady()
  const editor = VisualizerPanel.create('/extension', 1)
  editor.markReady()
  const events = new TypedEventEmitter<AgentEvent>()
  const lifecycle = new TypedEventEmitter<any>()
  const detected = new TypedEventEmitter<string>()
  const wiring = wireWatcherToPanel({ onEvent: events.event, onSessionLifecycle: lifecycle.event,
    onSessionDetected: detected.event, getActiveSessions: () => [] }, { sessionLabelPrefix: 'Codex' })
  const live: AgentEvent = { time: 1, type: 'agent_thinking', payload: { name: 'root' } }
  try {
    assert.equal(sidebar.compact, true)
    assert.equal(editor.compact, false)
    sidebarSurface.changeVisibility(false)
    assert.equal(sidebarSurface.messages.at(-1).config.visible, false)
    assert.equal(sidebar.isVisible, false)
    sidebarSurface.changeVisibility(true)
    assert.equal(sidebarSurface.messages.at(-1).config.visible, true)
    events.fire(live)
    sidebar.restoreHistory(() => events.fire({ ...live, time: 0 }))
    await new Promise(resolve => setTimeout(resolve, 40))
    const editorEvents = editorSurface.messages.flatMap(message => message.events ?? [])
    const sidebarEvents = sidebarSurface.messages.flatMap(message => message.events ?? [])
    assert.equal(editorEvents.length, 1)
    assert.equal(sidebarEvents.length, 2)
    assert.equal(sidebarEvents[1].historical, true)
    assert.equal(editorEvents[0].historical, undefined)
    sidebar.dispose()
    assert.equal(VisualizerPanel.getCurrent(), editor)
    assert.deepEqual(Array.from(VisualizerPanel.getEventTargets()), [editor])
    editorSurface.messages.length = 0
    editor.restoreHistory(() => { for (let index = 0; index < 1201; index++) editor.sendEvent({ ...live, time: index }) })
    assert.equal(editorSurface.messages.at(-1).total, 1201)
    const deadline = Date.now() + 3000
    while (editorSurface.messages.flatMap(message => message.events ?? []).length < 1201 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.deepEqual(editorSurface.messages.filter(message => message.type === 'agent-event-batch').map(message => message.events.length), [500, 500, 201])
    assert.equal(editorSurface.messages.at(-1).loaded, 1201)
    assert.match(editorSurface.webview.html, /__agentFlowApi = acquireVsCodeApi/)
    assert.match(editorSurface.webview.html, /reload-view/)
    editor.reload()
    assert.equal(editor.isReady, false)
    editorSurface.messages.length = 0
    events.fire(live)
    await new Promise(resolve => setTimeout(resolve, 40))
    assert.equal(editorSurface.messages.length, 0)
    editor.markReady()
    events.fire(live)
    await new Promise(resolve => setTimeout(resolve, 40))
    assert.equal(editorSurface.messages.flatMap(message => message.events ?? []).length, 1)
    editorSurface.receive({ type: 'ready', flowControl: true })
    editorSurface.messages.length = 0
    editor.restoreHistory(() => { for (let index = 0; index < 1000; index++) editor.sendEvent({ ...live, time: index }) })
    await new Promise(resolve => setTimeout(resolve, 50))
    let batches = editorSurface.messages.filter(message => message.type === 'agent-event-batch')
    assert.equal(batches.length, 1)
    assert.equal(batches[0].events.length, 128)
    editorSurface.receive({ type: 'events-consumed', batchId: -1 })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(editorSurface.messages.filter(message => message.type === 'agent-event-batch').length, 1)
    editorSurface.receive({ type: 'events-consumed', batchId: batches[0].batchId })
    await new Promise(resolve => setTimeout(resolve, 50))
    batches = editorSurface.messages.filter(message => message.type === 'agent-event-batch')
    assert.equal(batches.length, 2)
    assert.equal(batches[1].events[0].time, 128)
  } finally { wiring.dispose(); sidebar.dispose(); editor.dispose() }
})

it('waits for UI subscriptions before acknowledging readiness and receiving initial configuration', () => {
  const bundle = buildSync({ stdin: { contents: "export { vscodeBridge } from '../web/lib/vscode-bridge'", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false })
  const module = { exports: {} as any }
  let receive: (event: unknown) => void = () => {}
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports,
    window: { addEventListener: (_name: string, listener: any) => { receive = listener }, removeEventListener() {} } })
  const bridge = module.exports.vscodeBridge
  let acknowledgements = 0
  let receivedConfig: any
  bridge.configureWebviewApi((message: any) => {
    if (message.type === 'ready') {
      acknowledgements++
      receive({ data: { type: 'config', config: { compact: true, selectedSessionId: 'older-session' } } })
    }
  })
  assert.equal(acknowledgements, 0)
  bridge.onConfig((config: any) => { receivedConfig = config })
  bridge.ready()
  assert.equal(acknowledgements, 1)
  assert.equal(receivedConfig.compact, true)
  assert.equal(receivedConfig.selectedSessionId, 'older-session')
  bridge.dispose()
})
