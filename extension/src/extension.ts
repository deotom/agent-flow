import * as vscode from 'vscode'
import { VisualizerPanel } from './webview-provider'
import { JsonlEventSource } from './event-source'
import { WebviewToExtensionMessage, SessionInfo } from './protocol'
import { startClaudeRuntime } from './claude-runtime'
import { startCodexRuntime } from './codex-runtime'
import { promptHookSetupIfNeeded, configureClaudeHooks, isDisable1MContext } from './hooks-config'
import { createLogger } from './logger'
import type { AgentRuntime, AgentRuntimeMode } from './session-runtime'

const log = createLogger('Extension')
const PATCH_VERSION = 'local-2026.10.19.1'
let extensionVersion = '0.9.2'

function sendViewerConfig(panel: VisualizerPanel): void {
  const config = vscode.workspace.getConfiguration('agentVisualizer')
  panel.postMessage({ type: 'config', config: { visible: panel.isVisible, compact: panel.compact, patchVersion: PATCH_VERSION, extensionVersion,
    animationMode: config.get<'full' | 'low' | 'off'>('animationMode', 'full'), animationSpeed: config.get<number>('animationSpeed', 1) } })
}

type ConfiguredRuntimeMode = AgentRuntimeMode | 'auto'

let eventSource: JsonlEventSource | undefined
let jsonlSession: SessionInfo | undefined
let runtimes: AgentRuntime[] = []

function readConfiguredMode(): ConfiguredRuntimeMode {
  const raw = vscode.workspace.getConfiguration('agentVisualizer').get<string>('runtime', 'auto')
  return raw === 'claude' || raw === 'codex' ? raw : 'auto'
}

interface StartRuntimesResult {
  runtimes: AgentRuntime[]
  failures: AgentRuntimeMode[]
}

async function startRuntimes(
  mode: ConfiguredRuntimeMode,
  context: vscode.ExtensionContext,
): Promise<StartRuntimesResult> {
  const runtimes: AgentRuntime[] = []
  const failures: AgentRuntimeMode[] = []
  if (mode === 'claude' || mode === 'auto') {
    log.info('Starting Claude runtime...')
    try { runtimes.push(await startClaudeRuntime(context)) }
    catch (err) { log.error('Claude runtime failed to start:', err); failures.push('claude') }
  }
  if (mode === 'codex' || mode === 'auto') {
    log.info('Starting Codex runtime...')
    try { runtimes.push(startCodexRuntime(context)) }
    catch (err) { log.error('Codex runtime failed to start:', err); failures.push('codex') }
  }
  return { runtimes, failures }
}

export async function activate(context: vscode.ExtensionContext) {
  extensionVersion = context.extension.packageJSON.version
  log.info('Extension activated')
  if (!context.globalState.get('full-effects-default-v1')) {
    await vscode.workspace.getConfiguration('agentVisualizer').update('animationMode', 'full', vscode.ConfigurationTarget.Global)
    await context.globalState.update('full-effects-default-v1', true)
  }

  const mode = readConfiguredMode()
  log.info(`Runtime mode: ${mode}`)
  const { runtimes: started, failures } = await startRuntimes(mode, context)
  runtimes = started
  log.info(`Active runtimes: ${runtimes.map(r => r.mode).join(', ') || 'none'}`)

  // Surface startup failures to the user — the log-only path leaves them
  // staring at a "disconnected" visualizer with no explanation.
  if (runtimes.length === 0 && failures.length > 0) {
    vscode.window.showWarningMessage(
      `Agent Visualizer: ${failures.join(' and ')} runtime${failures.length > 1 ? 's' : ''} failed to start. See the Output panel for details.`,
    )
  } else if (failures.length > 0) {
    log.info(`Partial startup — ${failures.join(', ')} failed but ${runtimes.map(r => r.mode).join(', ')} active`)
  }

  // ─── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('agentVisualizer.animationMode') || event.affectsConfiguration('agentVisualizer.animationSpeed')) {
      for (const panel of VisualizerPanel.getEventTargets()) sendViewerConfig(panel)
    }
  }))

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('agentVisualizer.explorer', {
    resolveWebviewView(view) {
      const sidebar = VisualizerPanel.resolveSidebar(view, context.extensionUri)
      wirePanel(sidebar)
    },
  }, { webviewOptions: { retainContextWhenHidden: true } }))

  context.subscriptions.push(vscode.commands.registerCommand('agentVisualizer.showInExplorer', async () => {
    await vscode.workspace.getConfiguration('agentVisualizer').update('showExplorerGraph', true, vscode.ConfigurationTarget.Global)
    await vscode.commands.executeCommand('agentVisualizer.explorer.focus')
  }))

  context.subscriptions.push(
    vscode.commands.registerCommand('agentVisualizer.open', (sessionId?: string) => {
      const panel = VisualizerPanel.create(context.extensionUri, vscode.ViewColumn.One)
      panel.selectSession(sessionId)
      wirePanel(panel)
      promptHookSetupIfNeededForClaude(context)
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('agentVisualizer.openToSide', () => {
      const panel = VisualizerPanel.create(context.extensionUri, vscode.ViewColumn.Beside)
      wirePanel(panel)
      promptHookSetupIfNeededForClaude(context)
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('agentVisualizer.connectToAgent', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(radio-tower) Claude Code Hooks', description: 'Auto-configure hooks for live streaming', value: 'hooks' },
          { label: '$(file) Watch JSONL File', description: 'Watch a file for agent events', value: 'jsonl' },
          { label: '$(play) Mock Data', description: 'Use built-in demo scenario', value: 'mock' },
        ],
        { placeHolder: 'Select event source' },
      )

      if (!choice) { return }

      if (choice.value === 'hooks') {
        await configureClaudeHooks()
      } else if (choice.value === 'jsonl') {
        const fileUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'JSONL Files': ['jsonl', 'json', 'ndjson'] },
          title: 'Select agent event log file',
        })

        if (fileUri?.[0]) {
          connectToJsonl(fileUri[0].fsPath, context)
        }
      } else if (choice.value === 'mock') {
        const panel = VisualizerPanel.getCurrent()
        if (panel) {
          panel.postMessage({ type: 'config', config: { mode: 'replay', autoPlay: true, showMockData: true } })
        }
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('agentVisualizer.configureHooks', async () => {
      await configureClaudeHooks()
    }),
  )

  // ─── Serializer (restore panel on VS Code restart) ─────────────────────────

  vscode.window.registerWebviewPanelSerializer(VisualizerPanel.viewType, {
    async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
      const panel = VisualizerPanel.revive(webviewPanel, context.extensionUri)
      wirePanel(panel)
    },
  })
}

/** Only prompt for Claude hook setup if a Claude runtime is active —
 *  otherwise a Codex-only user would see an irrelevant prompt. */
function promptHookSetupIfNeededForClaude(context: vscode.ExtensionContext): void {
  if (runtimes.some(r => r.mode === 'claude')) {
    promptHookSetupIfNeeded(context)
  }
}

function collectActiveSessions(): ReturnType<AgentRuntime['watcher']['getActiveSessions']> {
  const all: ReturnType<AgentRuntime['watcher']['getActiveSessions']> = []
  for (const r of runtimes) all.push(...r.watcher.getActiveSessions())
  if (jsonlSession) all.push(jsonlSession)
  return all
}

function replaySessions(sessionIds: string[]): void {
  for (const r of runtimes) {
    const ownIds = r.watcher.getActiveSessions()
      .map(s => s.id)
      .filter(id => sessionIds.includes(id))
    if (ownIds.length > 0) r.watcher.replaySessionStart(ownIds)
  }
  if (jsonlSession && sessionIds.includes(jsonlSession.id)) eventSource?.replay()
}

function combinedConnectionStatus(): string {
  if (runtimes.length === 0) return 'disconnected'
  return runtimes.map(r => r.connectionStatus()).join(' + ')
}

function wirePanel(panel: VisualizerPanel): void {
  if (panel.isWired) { return }
  panel.markWired()
  let readyHandled = false
  panel.onCommand((message: WebviewToExtensionMessage) => {
    switch (message.type) {
      case 'reload-view':
        readyHandled = false
        panel.reload()
        break
      case 'ready':
        if (readyHandled) { return }
        readyHandled = true
        log.info('Webview ready')
        // Allow events to flow before replay — replay emits through the
        // same onEvent listener, and it's synchronous so no live events
        // can interleave. Events before this point were gated (dropped),
        // and replayExistingContent covers them from the JSONL file.
        panel.markReady()
        // Clear stale webview state from any previous panel instance
        panel.postMessage({ type: 'reset', reason: 'panel-reopened' })
        sendViewerConfig(panel)
        // Send environment-derived config (e.g. CLAUDE_CODE_DISABLE_1M_CONTEXT)
        if (isDisable1MContext()) {
          panel.postMessage({ type: 'config', config: { disable1MContext: true } })
        }
        // Report current connection status and replay active sessions
        // Send session list FIRST so the webview selects a session
        // before replay events arrive (otherwise they have no selected
        // session to match and are only buffered, not delivered).
        const sessions = collectActiveSessions()
        if (sessions.length > 0) {
          panel.postMessage({ type: 'session-list', sessions })
          if (panel.selectedSessionId && sessions.some(session => session.id === panel.selectedSessionId)) {
            panel.selectSession(panel.selectedSessionId)
          }
          panel.restoreHistory(() => replaySessions(sessions.map(s => s.id)))
        }
        panel.setConnectionStatus(runtimes.length || eventSource ? 'watching' : 'disconnected', combinedConnectionStatus())
        break

      case 'request-connect':
        vscode.commands.executeCommand('agentVisualizer.connectToAgent')
        break

      case 'request-status':
        sendViewerConfig(panel)
        panel.postMessage({ type: 'session-list', sessions: collectActiveSessions() })
        panel.setConnectionStatus(runtimes.length || eventSource ? 'watching' : 'disconnected', combinedConnectionStatus())
        break

      case 'set-animation': {
        if (!['full', 'low', 'off'].includes(message.mode) || !Number.isFinite(message.speed) || message.speed < 0.25 || message.speed > 2) break
        const config = vscode.workspace.getConfiguration('agentVisualizer')
        void Promise.all([
          config.update('animationMode', message.mode, vscode.ConfigurationTarget.Global),
          config.update('animationSpeed', message.speed, vscode.ConfigurationTarget.Global),
        ]).catch(error => log.error('Failed to save animation settings', error))
        break
      }

      case 'open-graph':
        vscode.commands.executeCommand('agentVisualizer.open', message.sessionId)
        break

      case 'request-disconnect':
        disconnectEventSource()
        panel.setConnectionStatus('disconnected', '')
        break

      case 'open-file':
        handleOpenFile(message.filePath, message.line)
        break

      case 'log': {
        const webviewLog = createLogger('Webview')
        const logFn = message.level === 'error' ? webviewLog.error
          : message.level === 'warn' ? webviewLog.warn
          : webviewLog.info
        logFn(message.message)
        break
      }
    }
  })
}

// ─── JSONL Connection ──────────────────────────────────────────────────────

function connectToJsonl(filePath: string, context: vscode.ExtensionContext): void {
  disconnectEventSource()

  eventSource = new JsonlEventSource(filePath)
  context.subscriptions.push(eventSource)

  jsonlSession = { id: `jsonl:${filePath}`, label: `JSONL ${vscode.Uri.file(filePath).path.split('/').pop()}`,
    startTime: Date.now(), lastActivityTime: Date.now(), status: 'active' }
  for (const panel of VisualizerPanel.getEventTargets()) panel.postMessage({ type: 'session-started', session: jsonlSession })

  eventSource.onEvent((event) => {
    if (!jsonlSession) return
    if (!event.historical) jsonlSession.lastActivityTime = Date.now()
    for (const panel of VisualizerPanel.getEventTargets()) if (panel.isReady) panel.sendEvent({ ...event, sessionId: jsonlSession.id })
  })

  eventSource.onStatus((status) => {
    for (const panel of VisualizerPanel.getEventTargets()) {
      panel.setConnectionStatus(
        status === 'connected' ? 'watching' : 'disconnected',
        filePath,
      )
    }
  })

  eventSource.start()
}

function disconnectEventSource(): void {
  if (jsonlSession) {
    for (const panel of VisualizerPanel.getEventTargets()) panel.postMessage({ type: 'session-ended', sessionId: jsonlSession.id })
    jsonlSession = undefined
  }
  if (eventSource) {
    eventSource.dispose()
    eventSource = undefined
  }
}

// ─── File Handlers ────────────────────────────────────────────────────────

async function handleOpenFile(filePath: string, line?: number): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath)
    const doc = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
    })
    if (line && line > 0) {
      const pos = new vscode.Position(line - 1, 0)
      editor.selection = new vscode.Selection(pos, pos)
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter)
    }
  } catch (err) {
    log.error(`Failed to open file: ${filePath}`, err)
  }
}

export function deactivate(): void {
  disconnectEventSource()
  for (const r of runtimes) r.dispose()
  runtimes = []
}
