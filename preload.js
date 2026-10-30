const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('okuma', {
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  close: () => ipcRenderer.send('close'),
  update: (patch) => ipcRenderer.send('update', patch),
});
