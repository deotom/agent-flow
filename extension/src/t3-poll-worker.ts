import { parentPort, workerData } from 'node:worker_threads'
import { T3SessionWatcher } from './t3-session-watcher'
import type { T3WorkerMessage } from './t3-worker-watcher'

if (!parentPort) throw new Error('T3 poll entry requires a worker thread')
const watcher = new T3SessionWatcher(workerData.workspaces, workerData.databasePath)
let messages: T3WorkerMessage[] = []
let initialized = false
watcher.onEvent(value => messages.push({ kind: 'event', value }))
watcher.onSessionLifecycle(value => messages.push({ kind: 'lifecycle', value }))
watcher.onSessionDetected(value => messages.push({ kind: 'detected', value }))
watcher.onDiagnostic(value => messages.push({ kind: 'diagnostic', value }))
watcher.onSessionsChanged(value => messages.push({ kind: 'sessions', value }))
watcher.onProjectsChanged(value => messages.push({ kind: 'projects', value }))
watcher.onRepliesChanged(value => messages.push({ kind: 'replies', value }))
watcher.onSourceHealth(value => messages.push({ kind: 'health', value }))
parentPort.on('message', request => {
  if (request !== 'poll') return
  messages = []
  watcher.poll()
  if (!initialized && watcher.sourceHealth?.state === 'ok') {
    // A replacement worker starts without prior fingerprints. Publish even an
    // empty baseline so recovery cannot retain sessions from the old worker.
    if (!messages.some(message => message.kind === 'sessions')) {
      const healthIndex = messages.findIndex(message => message.kind === 'health')
      messages.splice(healthIndex < 0 ? messages.length : healthIndex, 0, { kind: 'sessions', value: watcher.getActiveSessions() })
    }
    initialized = true
  }
  parentPort!.postMessage(messages)
  messages = []
})
parentPort.on('close', () => watcher.dispose())
