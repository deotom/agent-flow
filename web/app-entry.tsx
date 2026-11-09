import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { AgentVisualizer } from './components/agent-visualizer'
import { OrbView } from './components/orb/orb-view'
import './app/globals.css'

// Standalone CLI entry — no VS Code API, connects to relay via SSE
const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')
const root = createRoot(rootElement)
function StandaloneApp() {
  const desktop = new URLSearchParams(window.location.search).get('desktop') === '1'
  const [widget, setWidget] = useState(() => desktop && new URLSearchParams(window.location.search).get('widget') === '1')
  useEffect(() => {
    if (!desktop || window.parent === window) return
    const configure = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === 'desktop:widget' && typeof event.data.widget === 'boolean') setWidget(event.data.widget)
    }
    window.addEventListener('message', configure)
    window.parent.postMessage({ type: 'desktop:ready' }, '*')
    return () => window.removeEventListener('message', configure)
  }, [desktop])
  return <AgentVisualizer desktopWidget={widget} />
}
// The desktop orb window loads ?orb=1: only the floating reactor, on a transparent page.
const orb = new URLSearchParams(window.location.search).get('orb') === '1'
root.render(orb ? <OrbView /> : <StandaloneApp />)
