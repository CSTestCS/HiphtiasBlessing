const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameAPI', {
  quit: () => ipcRenderer.send('quit'),
  readAsset: (name) => ipcRenderer.invoke('readAsset', name),
});
