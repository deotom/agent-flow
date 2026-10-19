/**
 * Codex runtime.
 *
 * Rollout files provide history; a read-only native follower provides live
 * compaction boundaries that rollout files only record after completion.
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { CodexCompactionObserver } from './codex-compaction-observer'
import { CodexSessionWatcher } from './codex-session-watcher'
import { createLogger } from './logger'
import { wireWatcherToPanel } from './session-runtime'
import type { AgentRuntime } from './session-runtime'

const log = createLogger('CodexRuntime')

export function startCodexRuntime(context: vscode.ExtensionContext): AgentRuntime {
  const workspace = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? null
  const historyLimit = vscode.workspace.getConfiguration('agentVisualizer').get<number>('codexHistoryLimit', 5)
  const watcher = new CodexSessionWatcher(workspace, historyLimit)
  context.subscriptions.push(watcher)

  const wiring = wireWatcherToPanel(watcher, {
    sessionLabelPrefix: 'Codex',
  })

  watcher.start()
  const observer = new CodexCompactionObserver(() => watcher.getLiveSessionIds(), (id, active) => watcher.setCompacting(id, active))
  context.subscriptions.push(observer)

  const homeLabel = process.env.CODEX_HOME
    ? process.env.CODEX_HOME.replace(os.homedir(), '~')
    : '~/.codex'

  const connectionStatus = (): string => `Codex session watcher (${homeLabel})`

  const dispose = (): void => { observer.dispose(); wiring.dispose(); watcher.dispose() }

  log.info(`Codex runtime started (home: ${homeLabel})`)

  return { mode: 'codex', watcher, connectionStatus, dispose }
}
