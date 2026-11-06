'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// Expose individual actions only. The embedded graph receives no Node access.
if (process.isMainFrame) contextBridge.exposeInMainWorld('agentFlowDesktop', {
  state: () => ipcRenderer.invoke('desktop:state'),
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  openLast: () => ipcRenderer.invoke('desktop:open-last'),
  togglePin: () => ipcRenderer.invoke('desktop:toggle-pin'),
  toggleWidget: () => ipcRenderer.invoke('desktop:toggle-widget'),
  setRuntime: runtime => ipcRenderer.invoke('desktop:set-runtime', runtime),
  pairMobile: () => ipcRenderer.invoke('desktop:pair-mobile'),
  minimize: () => ipcRenderer.invoke('desktop:minimize'),
  close: () => ipcRenderer.invoke('desktop:close'),
  resizeWidget: size => ipcRenderer.invoke('desktop:resize-widget', size),
  onState: callback => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('desktop:state', listener)
    return () => ipcRenderer.removeListener('desktop:state', listener)
  },
})
