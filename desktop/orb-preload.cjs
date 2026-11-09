'use strict'
const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) contextBridge.exposeInMainWorld('agentFlowOrb', {
  t3Send: payload => ipcRenderer.invoke('orb:t3-send', payload),
  t3Start: payload => ipcRenderer.invoke('orb:t3-start', payload),
  openProject: payload => ipcRenderer.invoke('orb:open-project', payload),
  setExpanded: value => ipcRenderer.send('orb:set-expanded', value),
  setInteractive: value => ipcRenderer.send('orb:set-interactive', value),
  moveTo: position => ipcRenderer.send('orb:move-to', position),
  openFull: () => ipcRenderer.send('orb:open-full'),
  menu: () => ipcRenderer.send('orb:menu'),
  // Where the orb sits inside the expanded window and whether the panel opens below or above it.
  onLayout: callback => {
    const listener = (_event, layout) => callback(layout)
    ipcRenderer.on('orb:layout', listener)
    return () => ipcRenderer.removeListener('orb:layout', listener)
  },
})
