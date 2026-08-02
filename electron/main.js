// ═══════════════════════════════════════════════════════════════════
//  Electron main process — Minerva desktop (Route B: standalone).
//
//  Boots the local reverse proxy (electron/proxy.js), then loads the
//  bundled React build from that proxy's stable localhost origin. The
//  operator only ever supplies a Mythic address; the proxy handles TLS
//  termination of Mythic's self-signed cert and all path routing, so
//  NOTHING under src/ has to change.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');

const { createProxyServer } = require('./proxy');
const config = require('./config');

// Stable port ⇒ stable origin ⇒ persisted login/session (see proxy.js header).
const PORT = parseInt(process.env.MINERVA_PORT || '41390', 10);
const HOST = '127.0.0.1';
// Set MINERVA_DEV_SERVER=http://127.0.0.1:3000 (with `npm start` running) for HMR.
const DEV_SERVER = process.env.MINERVA_DEV_SERVER || '';
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

let mainWindow = null;
let settingsWindow = null;
let proxyServer = null;

const appOrigin = () => `http://${HOST}:${PORT}`;

function log(msg) {
    // eslint-disable-next-line no-console
    console.log(`[minerva] ${msg}`);
}

function startProxy() {
    return new Promise((resolve, reject) => {
        const staticMode = DEV_SERVER
            ? { type: 'devServer', target: DEV_SERVER }
            : { type: 'build', dir: BUILD_DIR };

        proxyServer = createProxyServer({
            getMythicTarget: config.getMythicAddress,
            getMsfTarget: config.getMsfAddress,
            staticMode,
            log,
        });

        proxyServer.on('error', reject);
        proxyServer.listen(PORT, HOST, () => {
            log(`proxy listening on ${appOrigin()} — mythic=${config.getMythicAddress()} static=${staticMode.type}`);
            resolve();
        });
    });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0a0a0f',
        title: 'Minerva',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadURL(`${appOrigin()}/`);

    // Open target=_blank / external links (e.g. Mythic Jupyter, Hasura) in the
    // system browser rather than a frameless Electron window.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(appOrigin())) return { action: 'allow' };
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function openSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 520,
        height: 420,
        resizable: false,
        parent: mainWindow || undefined,
        modal: !!mainWindow,
        title: 'Minerva — Server Settings',
        backgroundColor: '#0a0a0f',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function buildMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        {
            label: 'Server',
            submenu: [
                { label: 'Set Mythic Server…', accelerator: 'CmdOrCtrl+,', click: openSettingsWindow },
                { type: 'separator' },
                {
                    label: 'Reload',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => mainWindow && mainWindow.reload(),
                },
                { role: 'quit' },
            ],
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                { role: 'togglefullscreen' },
                { role: 'toggleDevTools' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: the settings window reads/writes connection config ──────────
ipcMain.handle('config:get', () => ({
    mythicAddress: config.getMythicAddress(),
    msfAddress: config.getMsfAddress(),
}));

ipcMain.handle('config:save', (_evt, payload) => {
    const saved = config.save(payload || {});
    // Proxy reads config live per-request, so a plain reload re-points it.
    if (mainWindow) mainWindow.loadURL(`${appOrigin()}/`);
    if (settingsWindow) settingsWindow.close();
    return saved;
});

// ── Self-signed Mythic infrastructure ────────────────────────────────
// Upstream TLS is already terminated on the Node side (proxy `secure:false`),
// so the webview only ever speaks HTTP to localhost. This handler is a
// belt-and-suspenders accept for any direct HTTPS the webview might attempt
// against the configured Mythic/MSF hosts — by design for C2 infra with
// self-signed certs. Scoped to the configured hosts, not "accept everything".
function configuredHosts() {
    const hosts = new Set();
    for (const addr of [config.getMythicAddress(), config.getMsfAddress()]) {
        try {
            hosts.add(new URL(addr).host);
        } catch (_e) {
            /* ignore malformed */
        }
    }
    return hosts;
}

app.on('certificate-error', (event, _webContents, url, _error, _cert, callback) => {
    let host = '';
    try {
        host = new URL(url).host;
    } catch (_e) {
        /* ignore */
    }
    if (configuredHosts().has(host)) {
        event.preventDefault();
        callback(true); // trust
    } else {
        callback(false);
    }
});

app.whenReady().then(async () => {
    try {
        await startProxy();
    } catch (err) {
        log(`failed to start proxy on ${appOrigin()}: ${err.message}`);
        // Most common cause: port already in use. Surface and bail.
        const { dialog } = require('electron');
        dialog.showErrorBox(
            'Minerva failed to start',
            `Could not bind the local proxy to ${appOrigin()}.\n\n${err.message}\n\n` +
            `Set MINERVA_PORT to a free port and relaunch.`
        );
        app.quit();
        return;
    }

    buildMenu();
    createMainWindow();

    // First launch with no server configured → prompt before showing the app.
    if (!config.isConfigured()) {
        openSettingsWindow();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
    if (proxyServer) proxyServer.close();
});
