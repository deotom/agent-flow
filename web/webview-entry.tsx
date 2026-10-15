import { createRoot } from 'react-dom/client'
import { AgentVisualizer } from './components/agent-visualizer'
import { vscodeBridge } from './lib/vscode-bridge'
import './app/globals.css'

// Production webview: use VS Code API for messaging
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscodeApi = (window as unknown as { __agentFlowApi?: ReturnType<typeof acquireVsCodeApi> }).__agentFlowApi ?? acquireVsCodeApi()

// Configure bridge to use VS Code API instead of window.parent.postMessage
if (vscodeBridge) {
  vscodeBridge.configureWebviewApi((msg) => vscodeApi.postMessage(msg))
}

// Mount the React app
const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')
const root = createRoot(rootElement)
root.render(<AgentVisualizer />)
