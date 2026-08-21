'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Minerva Desktop — main process.
//
//  Launch order is deliberate and is the whole point of the desktop build:
//
//      connect window  ->  preflight  ->  gateway  ->  console window
//
//  The operator says where Mythic is *before* a login screen exists. In the
//  container deploy that answer is compose configuration; here it is the first
//  thing the app asks, because one binary travels between engagements and the
//  wrong target is otherwise only discovered as a failed login.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const { app, BrowserWindow, Menu, session, shell, ipcMain, dialog } = require('electron');

const { createGateway, preflight } = require('./gateway');
const { createStore, normalizeMythicAddress, normalizeMsfAddress } = require('./settings');

const APP_NAME = 'Minerva';

// Fixed, not ephemeral: the origin is the storage key for the operator's JWT
// and every persisted preference. See the note at the top of gateway.js.
const PORT = Number.parseInt(process.env.MINERVA_PORT || '41390', 10);

// Point the shell at a running CRA dev server (`npm start` in the repo root)
// to iterate on the console itself without repackaging.
const DEV_SERVER = process.env.MINERVA_DEV_SERVER || '';

// Scripted launches — CI, a kiosk box, an operator with a shell alias — should
// not have to click through the gate. An address here wins over the stored one.
const ENV_MYTHIC = process.env.MINERVA_MYTHIC_ADDRESS || process.env.MYTHIC_ADDRESS || '';

// One console per machine. A second instance would bind a second gateway and
// fight the first over the same settings file.
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

let store = null;
let gateway = null;
let connectWindow = null;
let consoleWindow = null;

const log = (line) => process.stdout.write(`[minerva] ${line}\n`);

/** Where the built React bundle lives, packaged vs. run from the repo. */
function resolveAppDir() {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'app')
        : path.resolve(__dirname, '..', '..', 'build');
}

// ── Egress control ─────────────────────────────────────────────────────────
//
//  Everything the console needs is reachable through the loopback gateway.
//  Anything else leaving this process is, by definition, not Minerva talking
//  to Mythic — and the bundle's index.html does contain one such request: a
//  stylesheet from fonts.googleapis.com. On an operator's machine during an
//  engagement that is an outbound connection to a third party that nobody
//  asked for, so it is blocked unless the operator opts in.

const ALLOWED_SCHEMES = new Set(['devtools:', 'file:', 'blob:', 'data:', 'chrome-extension:']);

function installEgressFilter(ses) {
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        const cfg = store.current();
        if (cfg.allowRemoteAssets) return callback({});

        let parsed;
        try {
            parsed = new URL(details.url);
        } catch {
            return callback({});
        }

        if (ALLOWED_SCHEMES.has(parsed.protocol)) return callback({});

        // PORT rather than gateway.port: the connect window renders before the
        // gateway is up, and a null port here would block its own assets.
        const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
        if (loopback && parsed.port === String(PORT)) return callback({});
        if (DEV_SERVER && details.url.startsWith(DEV_SERVER)) return callback({});

        log(`blocked egress: ${details.url}`);
        callback({ cancel: true });
    });
}

// ── Windows ────────────────────────────────────────────────────────────────

const commonWebPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
};

function createConnectWindow() {
    if (connectWindow && !connectWindow.isDestroyed()) {
        connectWindow.focus();
        return connectWindow;
    }

    connectWindow = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 880,
        minHeight: 620,
        show: false,
        backgroundColor: '#000000',
        title: `${APP_NAME} — Link Configuration`,
        // The connect screen is a Screen Frame: the window itself reads as the
        // instrument, so the OS chrome stays out of the way where it can.
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            ...commonWebPreferences,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    connectWindow.loadFile(path.join(__dirname, 'connect', 'index.html'));
    connectWindow.once('ready-to-show', () => connectWindow.show());
    connectWindow.on('closed', () => {
        connectWindow = null;
        // Closing the gate before a console exists means the operator is done.
        if (!consoleWindow || consoleWindow.isDestroyed()) app.quit();
    });

    return connectWindow;
}

function createConsoleWindow(url) {
    const cfg = store.current();
    const bounds = cfg.window;

    consoleWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        ...(bounds.x !== null && bounds.y !== null ? { x: bounds.x, y: bounds.y } : {}),
        minWidth: 1100,
        minHeight: 700,
        show: false,
        backgroundColor: '#000000',
        title: APP_NAME,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: { ...commonWebPreferences },
    });

    if (bounds.maximized) consoleWindow.maximize();
    consoleWindow.loadURL(`${url}/new/login`);
    consoleWindow.once('ready-to-show', () => consoleWindow.show());

    // Sidebar's JUPYTER / GRAPHQL entries are `target="_blank"` links to paths
    // the gateway does not serve. They belong to Mythic and belong in a real
    // browser, so resolve them against Mythic and hand them to the OS.
    consoleWindow.webContents.setWindowOpenHandler(({ url: target }) => {
        openExternally(target);
        return { action: 'deny' };
    });

    // Nothing should navigate the console away from the gateway origin.
    consoleWindow.webContents.on('will-navigate', (event, target) => {
        if (!target.startsWith(url)) {
            event.preventDefault();
            openExternally(target);
        }
    });

    const remember = () => {
        if (!consoleWindow || consoleWindow.isDestroyed()) return;
        const maximized = consoleWindow.isMaximized();
        const { width, height, x, y } = consoleWindow.getNormalBounds();
        store.update({ window: { width, height, x, y, maximized } });
    };
    consoleWindow.on('resize', remember);
    consoleWindow.on('move', remember);
    consoleWindow.on('close', remember);
    consoleWindow.on('closed', () => { consoleWindow = null; });

    return consoleWindow;
}

/**
 * Send a URL to the system browser. Relative and loopback targets are resolved
 * against Mythic first — `/jupyter` means Mythic's Jupyter, not the gateway.
 */
function openExternally(target) {
    const cfg = store.current();
    let resolved = target;
    try {
        const parsed = new URL(target, cfg.mythicAddress);
        if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
            const mythic = new URL(cfg.mythicAddress);
            parsed.protocol = mythic.protocol;
            parsed.hostname = mythic.hostname;
            parsed.port = mythic.port;
        }
        resolved = parsed.toString();
    } catch {
        return;
    }
    if (/^https?:$/i.test(new URL(resolved).protocol)) shell.openExternal(resolved);
}

// ── Connect flow ───────────────────────────────────────────────────────────

async function handleConnect(config) {
    const cfg = store.update(config);

    if (!gateway) {
        gateway = createGateway({
            appDir: resolveAppDir(),
            getConfig: () => store.current(),
            port: PORT,
            devServer: DEV_SERVER,
            onLog: log,
        });
    }

    const { url } = await gateway.start();
    store.markConnected();

    if (consoleWindow && !consoleWindow.isDestroyed()) {
        // Re-pointed at a different Mythic: same gateway, new upstream, so a
        // reload is enough — and it drops the old session's subscriptions.
        consoleWindow.loadURL(`${url}/new/login`);
        consoleWindow.focus();
    } else {
        createConsoleWindow(url);
    }

    if (connectWindow && !connectWindow.isDestroyed()) connectWindow.close();
    log(`console pointed at ${cfg.mythicAddress} via ${url}`);
    return { ok: true, url };
}

function registerIpc() {
    ipcMain.handle('minerva:config', () => {
        const cfg = store.current();
        // The MSF password never crosses to a renderer; the connect window only
        // needs to know whether one is already stored.
        return {
            mythicAddress: cfg.mythicAddress,
            insecureTLS: cfg.insecureTLS,
            allowRemoteAssets: cfg.allowRemoteAssets,
            lastConnectedAt: cfg.lastConnectedAt,
            msf: {
                enabled: cfg.msf.enabled,
                address: cfg.msf.address,
                user: cfg.msf.user,
                hasPassword: Boolean(cfg.msf.password),
            },
            version: app.getVersion(),
            platform: process.platform,
            settingsPath: store.path,
            connected: Boolean(consoleWindow && !consoleWindow.isDestroyed()),
        };
    });

    ipcMain.handle('minerva:preflight', async (event, draft) => {
        let mythicAddress;
        try {
            mythicAddress = normalizeMythicAddress(draft && draft.mythicAddress);
        } catch (err) {
            return { ok: false, error: err.message };
        }

        const sender = event.sender;
        const probe = {
            mythicAddress,
            insecureTLS: draft && typeof draft.insecureTLS === 'boolean' ? draft.insecureTLS : true,
        };

        const result = await preflight(probe, (id, status, detail) => {
            if (!sender.isDestroyed()) sender.send('minerva:preflight-step', { id, status, detail });
        });

        return { ...result, mythicAddress };
    });

    ipcMain.handle('minerva:connect', async (event, draft) => {
        try {
            const patch = { mythicAddress: normalizeMythicAddress(draft && draft.mythicAddress) };

            if (typeof draft.insecureTLS === 'boolean') patch.insecureTLS = draft.insecureTLS;
            if (typeof draft.allowRemoteAssets === 'boolean') patch.allowRemoteAssets = draft.allowRemoteAssets;

            const msfIn = (draft && draft.msf) || {};
            const msf = { enabled: msfIn.enabled === true };
            if (msf.enabled) {
                msf.address = normalizeMsfAddress(msfIn.address);
                msf.user = String(msfIn.user || 'msf');
                // Blank means "keep what is stored" — the renderer is never
                // handed the existing password to echo back.
                if (typeof msfIn.password === 'string' && msfIn.password) msf.password = msfIn.password;
            }
            patch.msf = msf;

            return await handleConnect(patch);
        } catch (err) {
            log(`connect failed: ${err.stack || err.message}`);
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('minerva:quit', () => app.quit());
}

// ── Menu ───────────────────────────────────────────────────────────────────

function buildMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        {
            label: 'Connection',
            submenu: [
                {
                    label: 'Link Configuration…',
                    accelerator: isMac ? 'Cmd+,' : 'Ctrl+,',
                    click: () => createConnectWindow(),
                },
                { type: 'separator' },
                {
                    label: 'Reload Console',
                    accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
                    click: () => consoleWindow && !consoleWindow.isDestroyed() && consoleWindow.reload(),
                },
                {
                    label: 'Open Settings File',
                    click: () => shell.showItemInFolder(store.path),
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                { role: 'toggleDevTools' },
            ],
        },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                {
                    // Deliberately manual. The app never checks for updates on
                    // its own: a console that reaches out to github.com every
                    // launch is a beacon from an operator's machine, which is
                    // the same objection that closes egress by default.
                    label: 'Releases…',
                    click: () => shell.openExternal('https://github.com/aifred0729-TW/Minerva/releases'),
                },
                { type: 'separator' },
                {
                    label: 'About Minerva Desktop',
                    click: () => {
                        const cfg = store.current();
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'Minerva Desktop',
                            message: `${APP_NAME} ${app.getVersion()}`,
                            detail:
                                `Mythic:   ${cfg.mythicAddress}\n` +
                                `Gateway:  ${gateway && gateway.url ? gateway.url : 'not started'}\n` +
                                `Settings: ${store.path}\n` +
                                `Electron: ${process.versions.electron}  ·  Chromium ${process.versions.chrome}`,
                        });
                    },
                },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

app.on('second-instance', () => {
    const target = consoleWindow || connectWindow;
    if (target && !target.isDestroyed()) {
        if (target.isMinimized()) target.restore();
        target.focus();
    }
});

app.whenReady().then(() => {
    app.setName(APP_NAME);
    store = createStore(app.getPath('userData'));
    store.load();

    if (ENV_MYTHIC) {
        try {
            store.update({ mythicAddress: ENV_MYTHIC });
            log(`mythic address forced by environment: ${store.current().mythicAddress}`);
        } catch (err) {
            log(`ignoring bad MINERVA_MYTHIC_ADDRESS: ${err.message}`);
        }
    }

    installEgressFilter(session.defaultSession);
    registerIpc();
    buildMenu();

    // Mythic self-signs. The renderer only ever talks to the loopback gateway
    // over plain HTTP, so this should not fire — it is here for anything that
    // reaches Mythic directly, and it stays scoped to the configured host
    // rather than trusting bad certificates in general.
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        const cfg = store.current();
        let host = null;
        try {
            host = new URL(url).host;
        } catch {
            /* fall through to the default rejection */
        }
        if (cfg.insecureTLS && host && host === new URL(cfg.mythicAddress).host) {
            event.preventDefault();
            return callback(true);
        }
        log(`certificate rejected for ${url}: ${error}`);
        callback(false);
    });

    createConnectWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createConnectWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
    if (gateway) await gateway.stop();
});
