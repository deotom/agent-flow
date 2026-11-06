import { defineConfig } from 'vite'
import { createBuildConfig } from './vite.config.shared'
export default defineConfig(createBuildConfig({
  outDir: '../mobile/graph', entry: 'mobile-entry.tsx', name: 'AgentFlowMobile',
  define: { 'process.env.NEXT_PUBLIC_DEMO': '"0"', 'process.env.NEXT_PUBLIC_RELAY_PORT': '""', 'process.env.AGENT_FLOW_STANDALONE': '"0"' },
}))
