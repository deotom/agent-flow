'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// Expose individual actions only. The embedded graph receives no Node access.
if (process.isMainFrame) contextBridge.exposeInMainWorld('agentFlowDesktop', {
  t3Send: payload => ipcRenderer.invoke('desktop:t3-send', payload),
  t3Start: payload => ipcRenderer.invoke('desktop:t3-start', payload),
  openProject: payload => ipcRenderer.invoke('desktop:open-project', payload),
  notify: payload => ipcRenderer.invoke('desktop:notify', payload),
  state: () => ipcRenderer.invoke('desktop:state'),
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  openLast: () => ipcRenderer.invoke('desktop:open-last'),
  openAllT3: () => ipcRenderer.invoke('desktop:open-all-t3'),
  togglePin: () => ipcRenderer.invoke('desktop:toggle-pin'),
  toggleWidget: () => ipcRenderer.invoke('desktop:toggle-widget'),
  toggleDock: () => ipcRenderer.invoke('desktop:toggle-dock'),
  toggleOrb: () => ipcRenderer.invoke('desktop:toggle-orb'),
  setDock: side => ipcRenderer.invoke('desktop:set-dock', side),
  setRuntime: runtime => ipcRenderer.invoke('desktop:set-runtime', runtime),
  minimize: () => ipcRenderer.invoke('desktop:minimize'),
  close: () => ipcRenderer.invoke('desktop:close'),
  resizeWidget: size => ipcRenderer.invoke('desktop:resize-widget', size),
  onState: callback => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('desktop:state', listener)
    return () => ipcRenderer.removeListener('desktop:state', listener)
  },
  onFocusAgent: callback => {
    const listener = (_event, target) => callback(target)
    ipcRenderer.on('desktop:focus-agent', listener)
    return () => ipcRenderer.removeListener('desktop:focus-agent', listener)
  },
})
