// Secure Preload script for FaceAttend Pro desktop app
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  isElectron: true,
  appVersion: '2.1.0',
  lockKiosk: (options) => ipcRenderer.invoke('kiosk:lock', options),
  unlockKiosk: (options) => ipcRenderer.invoke('kiosk:unlock', options),
  getKioskStatus: () => ipcRenderer.invoke('kiosk:status'),
});
