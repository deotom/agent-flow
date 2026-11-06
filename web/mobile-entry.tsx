import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { AgentVisualizer } from './components/agent-visualizer'
import { vscodeBridge } from './lib/vscode-bridge'
import { MobileGraphAdapter, type RemoteGraphSnapshot } from './lib/mobile-graph'
import './app/globals.css'

const adapter = new MobileGraphAdapter()
let ready = false
let pending: RemoteGraphSnapshot | null = null
function deliver(snapshot: RemoteGraphSnapshot) {
  for (const message of adapter.update(snapshot)) window.postMessage(message, window.location.origin)
}
vscodeBridge?.configureWebviewApi(message => {
  if (message.type === 'ready') {
    ready = true
    window.parent.postMessage({ type: 'graph-ready' }, window.location.origin)
    if (pending) { deliver(pending); pending = null }
  }
})
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== window.location.origin || window.parent === window) return
  if (event.data?.type === 'mobile-snapshot' && Array.isArray(event.data.snapshot?.sessions)) {
    if (ready) deliver(event.data.snapshot)
    else pending = event.data.snapshot
  }
  if (event.data?.type === 'mobile-connection') window.postMessage({ type: 'connection-status', status: event.data.connected ? 'connected' : 'disconnected', source: 'Supabase · encrypted mobile' }, window.location.origin)
})
function App() {
  const [small, setSmall] = useState(window.innerWidth < 600)
  useEffect(() => { const resize = () => setSmall(window.innerWidth < 600); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  return <AgentVisualizer desktopWidget={small} />
}
createRoot(document.getElementById('root')!).render(<App />)
