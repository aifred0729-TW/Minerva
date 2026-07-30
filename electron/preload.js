// Bridge for the settings window only (electron/settings.html). The main
// Minerva app window has NO preload — it must stay a plain web origin so the
// same-origin React code behaves exactly as it does behind Nginx.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('minerva', {
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
});
