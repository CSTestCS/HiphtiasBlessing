const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameAPI', {
  quit: () => ipcRenderer.send('quit'),
});
