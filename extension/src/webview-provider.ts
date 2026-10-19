import * as vscode from 'vscode'
import * as crypto from 'crypto'
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  AgentEvent,
} from './protocol'
import {
  BRIDGE_INIT_MAX_RETRIES, BRIDGE_INIT_RETRY_MS, DEFAULT_DEV_PORT, NONCE_LENGTH, NONCE_CHARS,
  WEBVIEW_BG_COLOR, WEBVIEW_LOADING_TEXT, WEBVIEW_LOADING_TEXT_DIM,
} from './constants'

function getNonce(): string {
  const bytes = crypto.randomBytes(NONCE_LENGTH)
  const chars = NONCE_CHARS
  let text = ''
  for (let i = 0; i < NONCE_LENGTH; i++) {
    text += chars.charAt(bytes[i] % chars.length)
  }
  return text
}

export class VisualizerPanel implements vscode.Disposable {
  public static readonly viewType = 'agentVisualizer'
  private static instance: VisualizerPanel | undefined
  private static sidebar: VisualizerPanel | undefined
  private static replayTarget: VisualizerPanel | undefined

  private readonly panel: vscode.WebviewPanel | vscode.WebviewView
  private readonly extensionUri: vscode.Uri
  private readonly disposables: vscode.Disposable[] = []
  private readonly _onCommand = new vscode.EventEmitter<WebviewToExtensionMessage>()
  private _wired = false
  private _ready = false
  selectedSessionId: string | undefined
  fullHistorySessionId: string | undefined
  private eventQueue: AgentEvent[] = []
  private flowControl = false
  private nextBatchId = 0
  private waitingBatchId: number | null = null
  private restoringHistory = false
  private historyTotal = 0
  private historyLoaded = 0
  private eventFlushTimer: NodeJS.Timeout | null = null

  readonly onCommand = this._onCommand.event

  /** Returns true if wirePanel has already been called on this instance */
  get isWired(): boolean { return this._wired }
  markWired(): void { this._wired = true }

  /** Whether the webview has signaled 'ready' and replay is complete.
   *  Live events should be gated on this to prevent duplication with replay. */
  get isReady(): boolean { return this._ready }
  get isVisible(): boolean { return this.panel.visible }
  markReady(): void { this._ready = true }

  selectSession(sessionId?: string): void {
    if (!sessionId) return
    this.selectedSessionId = sessionId
    if (this.isReady) this.postMessage({ type: 'config', config: { selectedSessionId: sessionId } })
  }

  reload(): void {
    this._ready = false
    this.waitingBatchId = null
    this.flowControl = false
    if (this.eventFlushTimer) clearTimeout(this.eventFlushTimer)
    this.eventFlushTimer = null
    this.eventQueue = []
    this.panel.webview.html = this.getHtml()
  }

  private constructor(panel: vscode.WebviewPanel | vscode.WebviewView, extensionUri: vscode.Uri, readonly compact = false) {
    this.panel = panel
    this.extensionUri = extensionUri

    this.panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist'), vscode.Uri.joinPath(extensionUri, 'media')] }
    this.panel.webview.html = this.getHtml()
    const onVisibility = () => this.postMessage({ type: 'config', config: { visible: this.panel.visible } })
    if ('onDidChangeViewState' in this.panel) this.disposables.push(this.panel.onDidChangeViewState(onVisibility))
    else if ('onDidChangeVisibility' in this.panel) this.disposables.push(this.panel.onDidChangeVisibility(onVisibility))

    // Listen for messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        if (message.type === 'ready') this.flowControl = message.flowControl === true
        if (message.type === 'events-consumed') {
          if (message.batchId === this.waitingBatchId) { this.waitingBatchId = null; if (this.eventQueue.length) this.scheduleEventFlush() }
          return
        }
        this._onCommand.fire(message)
      },
      undefined,
      this.disposables,
    )

    // Cleanup on dispose
    this.panel.onDidDispose(
      () => {
        this.dispose()
      },
      undefined,
      this.disposables,
    )
  }

  static create(extensionUri: vscode.Uri, column: vscode.ViewColumn): VisualizerPanel {
    if (VisualizerPanel.instance) {
      const existing = VisualizerPanel.instance.panel
      if ('reveal' in existing) existing.reveal(column)
      return VisualizerPanel.instance
    }

    const panel = vscode.window.createWebviewPanel(
      VisualizerPanel.viewType,
      'Agent Flow',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      },
    )

    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'media', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'media', 'icon-dark.svg'),
    }

    VisualizerPanel.instance = new VisualizerPanel(panel, extensionUri)
    return VisualizerPanel.instance
  }

  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): VisualizerPanel {
    VisualizerPanel.instance = new VisualizerPanel(panel, extensionUri)
    return VisualizerPanel.instance
  }

  static getCurrent(): VisualizerPanel | undefined {
    return VisualizerPanel.instance ?? VisualizerPanel.sidebar
  }

  static getEventTargets(): VisualizerPanel[] {
    if (this.replayTarget) return [this.replayTarget]
    return [this.instance, this.sidebar].filter((panel): panel is VisualizerPanel => !!panel)
  }

  static resolveSidebar(view: vscode.WebviewView, extensionUri: vscode.Uri): VisualizerPanel {
    this.sidebar?.dispose()
    this.sidebar = new VisualizerPanel(view, extensionUri, true)
    return this.sidebar
  }

  /** Send a typed message to the webview (fails silently if panel is disposed) */
  postMessage(message: ExtensionToWebviewMessage): void {
    try {
      this.panel.webview.postMessage(message)
    } catch {
      // Panel may have been disposed between check and send — safe to ignore
    }
  }

  /** Send an agent event to the webview */
  sendEvent(event: AgentEvent): void {
    this.eventQueue.push(this.restoringHistory ? { ...event, historical: true } : event)
    if (this.restoringHistory) this.historyTotal++
    this.scheduleEventFlush()
  }

  private scheduleEventFlush(): void {
    if (this.eventFlushTimer || this.waitingBatchId !== null) return
    this.eventFlushTimer = setTimeout(() => {
      this.eventFlushTimer = null
      let count = Math.min(this.eventQueue.length, this.flowControl ? 128 : 500)
      if (this.flowControl) {
        let bytes = 0
        for (let index = 0; index < count; index++) {
          const size = JSON.stringify(this.eventQueue[index]).length * 2
          if (index && bytes + size > 512 * 1024) { count = index; break }
          bytes += size
        }
      }
      const events = this.eventQueue.splice(0, count)
      if (events.length) {
        const batchId = this.flowControl ? ++this.nextBatchId : undefined
        if (batchId !== undefined) this.waitingBatchId = batchId
        this.postMessage({ type: 'agent-event-batch', events, ...(batchId !== undefined ? { batchId } : {}) })
      }
      if (this.historyLoaded < this.historyTotal) {
        this.historyLoaded = Math.min(this.historyTotal, this.historyLoaded + events.filter(event => event.historical).length)
        this.postMessage({ type: 'history-progress', loaded: this.historyLoaded, total: this.historyTotal })
      }
      if (this.eventQueue.length) this.scheduleEventFlush()
    }, 16)
  }

  /** Restore state without presenting archived events as new activity. */
  restoreHistory(replay: () => void): void {
    const previousTarget = VisualizerPanel.replayTarget
    this.historyLoaded = 0
    this.historyTotal = 0
    VisualizerPanel.replayTarget = this
    this.restoringHistory = true
    try { replay() } finally {
      this.restoringHistory = false
      VisualizerPanel.replayTarget = previousTarget
      this.postMessage({ type: 'history-progress', loaded: 0, total: this.historyTotal })
    }
  }

  /** Update connection status display */
  setConnectionStatus(status: 'connected' | 'disconnected' | 'watching', source: string): void {
    this.postMessage({ type: 'connection-status', status, source })
  }

  private getHtml(): string {
    const isDev = this.isDevelopmentMode()

    if (isDev) {
      return this.getDevHtml()
    }
    return this.getProductionHtml()
  }

  private isDevelopmentMode(): boolean {
    // Only use dev mode if the user explicitly set a port in settings
    const config = vscode.workspace.getConfiguration('agentVisualizer')
    const port = config.get<number>('devServerPort', 0)
    return port > 0
  }

  private getDevHtml(): string {
    const config = vscode.workspace.getConfiguration('agentVisualizer')
    const port = config.get<number>('devServerPort', DEFAULT_DEV_PORT)
    const nonce = getNonce()

    // In dev mode, load the Next.js app via iframe
    // The bridge script in the iframe communicates with the parent via postMessage
    return `<!DOCTYPE html>
<html lang="en" style="height:100%; margin:0; padding:0;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      frame-src http://localhost:${port} https://localhost:${port};
      script-src 'nonce-${nonce}';
      style-src 'unsafe-inline';"
  />
  <style>
    html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: ${WEBVIEW_BG_COLOR}; }
    iframe { width: 100%; height: 100%; border: none; }
    .connecting {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
      color: ${WEBVIEW_LOADING_TEXT}; text-align: center;
    }
    .connecting .dot { animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="connecting" id="loading">
    <div>CONNECTING TO DEV SERVER</div>
    <div class="dot" style="margin-top: 8px;">●</div>
    <div style="margin-top: 8px; font-size: 10px; color: ${WEBVIEW_LOADING_TEXT_DIM};">localhost:${port}</div>
  </div>
  <iframe id="app-frame" src="http://localhost:${port}" style="display:none;"></iframe>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const iframe = document.getElementById('app-frame');
      const loading = document.getElementById('loading');
      let iframeReady = false;
      let pendingMessages = [];

      // Show iframe once loaded, then keep sending bridge-init until acked
      iframe.addEventListener('load', () => {
        loading.style.display = 'none';
        iframe.style.display = 'block';

        // The React app may not have mounted yet, so retry the init message
        let initAttempts = 0;
        const initInterval = setInterval(() => {
          if (iframeReady || initAttempts > ${BRIDGE_INIT_MAX_RETRIES}) {
            clearInterval(initInterval);
            return;
          }
          iframe.contentWindow.postMessage({ type: '__vscode-bridge-init', source: 'extension' }, '*');
          initAttempts++;
        }, ${BRIDGE_INIT_RETRY_MS});
      });

      // Single unified message handler
      window.addEventListener('message', (e) => {
        if (e.source === iframe.contentWindow) {
          // Message from iframe → forward to extension host
          if (e.data && e.data.type === 'ready') {
            iframeReady = true;
            // Flush any pending messages
            for (const msg of pendingMessages) {
              iframe.contentWindow.postMessage(msg, '*');
            }
            pendingMessages = [];
          }
          vscode.postMessage(e.data);
        } else {
          // Message from extension host → forward to iframe
          if (iframeReady) {
            iframe.contentWindow.postMessage(e.data, '*');
          } else {
            pendingMessages.push(e.data);
          }
        }
      });

      // Tell extension we're ready (outer frame ready, not iframe)
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`
  }

  private getProductionHtml(): string {
    const webview = this.panel.webview
    const nonce = getNonce()

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.css'),
    )

    return `<!DOCTYPE html>
<html lang="en" class="dark" style="height:100%; margin:0; padding:0;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      img-src ${webview.cspSource} https: data:;
      font-src ${webview.cspSource} data:;
      script-src 'nonce-${nonce}';"
  />
  <link rel="stylesheet" href="${styleUri}">
  <style>
    html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: ${WEBVIEW_BG_COLOR}; }
    #root { height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="recovery" hidden style="position:absolute;inset:0;padding:24px;background:#080d18;color:#d6f1ff;font:14px system-ui;z-index:999">
    <p>Agent Flow could not finish loading in this window.</p>
    <p>Reload this graph. If it still fails, run Developer: Reload Window.</p>
    <button id="reload-graph">Reload graph</button>
  </div>
  <script nonce="${nonce}">
    window.__agentFlowApi = acquireVsCodeApi();
    const recover = () => { document.getElementById('recovery').hidden = false; };
    document.getElementById('reload-graph').addEventListener('click', () => window.__agentFlowApi.postMessage({type:'reload-view'}));
    window.addEventListener('error', recover, true);
    window.addEventListener('unhandledrejection', recover);
    setTimeout(() => { if (!document.getElementById('root').children.length) recover(); }, 10000);
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  dispose(): void {
    if (this.eventFlushTimer) clearTimeout(this.eventFlushTimer)
    this.eventFlushTimer = null
    this.eventQueue = []
    if (VisualizerPanel.instance === this) VisualizerPanel.instance = undefined
    if (VisualizerPanel.sidebar === this) VisualizerPanel.sidebar = undefined
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables.length = 0
    this._onCommand.dispose()
  }
}
