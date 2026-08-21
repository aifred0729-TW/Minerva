'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Preload for the connect window.
//
//  The console window has no preload at all — it loads the unmodified React
//  bundle over the loopback gateway and must stay an ordinary web origin. Only
//  the pre-login gate needs to talk to the main process, and it gets exactly
//  four verbs, never a channel it can name itself.
// ═══════════════════════════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('minerva', {
    /** Current config, with the MSF password reduced to a boolean. */
    config: () => ipcRenderer.invoke('minerva:config'),

    /**
     * Run the reachability checks against a draft address.
     * @param {(step: {id: string, status: string, detail: string}) => void} onStep
     */
    preflight(draft, onStep) {
        const listener = (_event, step) => onStep(step);
        ipcRenderer.on('minerva:preflight-step', listener);
        return ipcRenderer
            .invoke('minerva:preflight', draft)
            .finally(() => ipcRenderer.removeListener('minerva:preflight-step', listener));
    },

    /** Persist the draft, start the gateway, open the console. */
    connect: (draft) => ipcRenderer.invoke('minerva:connect', draft),

    quit: () => ipcRenderer.invoke('minerva:quit'),
});
