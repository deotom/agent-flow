'use strict'
const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) contextBridge.exposeInMainWorld('agentFlowOrb', {
  setInteractive: value => ipcRenderer.send('orb:set-interactive', value),
  moveTo: position => ipcRenderer.send('orb:move-to', position),
  openFull: () => ipcRenderer.send('orb:open-full'),
  menu: () => ipcRenderer.send('orb:menu'),
})
