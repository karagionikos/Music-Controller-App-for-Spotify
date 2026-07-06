import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('retroPlayerBridge', {
  startOAuth: (authorizeUrl: string) => ipcRenderer.invoke('oauth:start', authorizeUrl),
  getRedirectUri: () => ipcRenderer.invoke('oauth:redirect-uri'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
});
