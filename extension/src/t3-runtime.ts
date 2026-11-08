import * as vscode from 'vscode'
import { T3SessionWatcher } from './t3-session-watcher'
import { wireWatcherToPanel, type AgentRuntime } from './session-runtime'
import { VisualizerPanel } from './webview-provider'

export function startT3Runtime(context: vscode.ExtensionContext): AgentRuntime {
  const workspace = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? []
  const watcher = new T3SessionWatcher(workspace)
  const wiring = wireWatcherToPanel(watcher, { sessionLabelPrefix: 'T3' })
  const lists = watcher.onSessionsChanged(sessions => {
    for (const panel of VisualizerPanel.getEventTargets()) panel.postMessage({ type: 'session-list', sessions })
  })
  const health = watcher.onSourceHealth(sourceHealth => {
    // The shared UI bridge understands this additive message; the legacy extension protocol remains unchanged.
    for (const panel of VisualizerPanel.getEventTargets()) panel.postMessage({ type: 'source-health', health: sourceHealth } as never)
  })
  watcher.start()
  const dispose = () => { health.dispose(); lists.dispose(); wiring.dispose(); watcher.dispose() }
  context.subscriptions.push({ dispose })
  return { mode: 't3', watcher, connectionStatus: () => watcher.diagnostic, dispose }
}
