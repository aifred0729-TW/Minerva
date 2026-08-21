'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Persisted desktop configuration.
//
//  In the container deploy, where Minerva points is baked in at compose time
//  (MYTHIC_ADDRESS) and nobody re-reads it. A desktop console has no compose
//  file and one binary follows the operator between engagements, so the target
//  has to be a setting the operator sets before the first login — that is what
//  the connect window writes here.
//
//  Stored under Electron's userData dir, 0600. It holds the MSF-RPC password
//  when Metasploit is enabled, which is the same secret nginx keeps out of the
//  bundle and behind an auth gate — so it is never written anywhere the
//  renderer can read it directly.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const FILE_NAME = 'minerva-desktop.json';

const DEFAULTS = Object.freeze({
    mythicAddress: 'https://127.0.0.1:7443',

    // Display only. The connect window opens on every launch regardless — the
    // operator confirms the target before a login screen is ever shown — so
    // nothing branches on this.
    lastConnectedAt: null,

    // Parity with nginx's `proxy_ssl_verify off`. Mythic self-signs by default,
    // so verification on would refuse every stock install. Exposed as a toggle
    // rather than hard-coded, because an operator running a real cert should be
    // able to demand it.
    insecureTLS: true,

    // Whether the renderer may reach anything other than the local gateway.
    // Default closed: the bundle's index.html pulls Inter and JetBrains Mono
    // from fonts.googleapis.com, and a C2 console should not make that request
    // from an operator's machine. Off means system fonts; see desktop/README.md.
    allowRemoteAssets: false,

    msf: Object.freeze({
        enabled: false,
        address: 'http://127.0.0.1:55553',
        user: 'msf',
        password: '',
    }),

    window: Object.freeze({ width: 1680, height: 1020, x: null, y: null, maximized: false }),
});

/**
 * Accepts what an operator actually types — `10.0.0.5`, `10.0.0.5:7443`,
 * `https://mythic.lan:7443` — and returns the canonical origin.
 * @throws {Error} with a message fit to show in the connect window.
 */
function normalizeMythicAddress(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) throw new Error('Address is empty');

    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;

    let parsed;
    try {
        parsed = new URL(withScheme);
    } catch {
        throw new Error(`Not a valid address: ${text}`);
    }
    if (!parsed.hostname) throw new Error(`Not a valid address: ${text}`);

    // Mythic's default. Guessing 443 instead would send operators to nginx's
    // port on a host that also runs a web server, and the failure would look
    // like a Mythic problem.
    if (!parsed.port) parsed.port = parsed.protocol === 'https:' ? '7443' : '80';

    return `${parsed.protocol}//${parsed.host}`;
}

/** Same, for the MSF-RPC daemon: plaintext msgpack on 55553 by default. */
function normalizeMsfAddress(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) throw new Error('MSF-RPC address is empty');

    const withScheme = /^https?:\/\//i.test(text) ? text : `http://${text}`;

    let parsed;
    try {
        parsed = new URL(withScheme);
    } catch {
        throw new Error(`Not a valid MSF-RPC address: ${text}`);
    }
    if (!parsed.hostname) throw new Error(`Not a valid MSF-RPC address: ${text}`);
    if (!parsed.port) parsed.port = '55553';

    return `${parsed.protocol}//${parsed.host}`;
}

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Coerce whatever is on disk into a complete, valid config. */
function normalize(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const msfIn = input.msf && typeof input.msf === 'object' ? input.msf : {};
    const winIn = input.window && typeof input.window === 'object' ? input.window : {};

    let mythicAddress;
    try {
        mythicAddress = normalizeMythicAddress(input.mythicAddress);
    } catch {
        mythicAddress = DEFAULTS.mythicAddress;
    }

    let msfAddress;
    try {
        msfAddress = normalizeMsfAddress(msfIn.address);
    } catch {
        msfAddress = DEFAULTS.msf.address;
    }

    return {
        mythicAddress,
        lastConnectedAt:
            typeof input.lastConnectedAt === 'string' && input.lastConnectedAt ? input.lastConnectedAt : null,
        insecureTLS: typeof input.insecureTLS === 'boolean' ? input.insecureTLS : DEFAULTS.insecureTLS,
        allowRemoteAssets:
            typeof input.allowRemoteAssets === 'boolean' ? input.allowRemoteAssets : DEFAULTS.allowRemoteAssets,
        msf: {
            enabled: msfIn.enabled === true,
            address: msfAddress,
            user: typeof msfIn.user === 'string' && msfIn.user.trim() ? msfIn.user.trim() : DEFAULTS.msf.user,
            password: typeof msfIn.password === 'string' ? msfIn.password : '',
        },
        window: {
            width: isFiniteNumber(winIn.width) && winIn.width >= 900 ? Math.round(winIn.width) : DEFAULTS.window.width,
            height: isFiniteNumber(winIn.height) && winIn.height >= 600 ? Math.round(winIn.height) : DEFAULTS.window.height,
            x: isFiniteNumber(winIn.x) ? Math.round(winIn.x) : null,
            y: isFiniteNumber(winIn.y) ? Math.round(winIn.y) : null,
            maximized: winIn.maximized === true,
        },
    };
}

function createStore(userDataDir) {
    const file = path.join(userDataDir, FILE_NAME);
    let current = null;

    function load() {
        try {
            current = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
        } catch {
            // Missing on first run; corrupt if a write was interrupted. Either
            // way defaults are the right answer — the connect window will ask.
            current = normalize(null);
        }
        return current;
    }

    function save() {
        const tmp = `${file}.tmp`;
        const body = JSON.stringify(current, null, 2) + '\n';
        // Write-then-rename: a crash mid-write leaves the previous config
        // intact rather than a truncated file that reads as "never configured".
        fs.writeFileSync(tmp, body, { mode: 0o600 });
        fs.renameSync(tmp, file);
        try {
            fs.chmodSync(file, 0o600);
        } catch {
            // Windows has no POSIX mode; the file lives in the user's profile.
        }
        return current;
    }

    return {
        get path() { return file; },
        current() { return current || load(); },
        load,

        /** Shallow-merge a patch, re-validate, persist. Returns the new config. */
        update(patch) {
            const base = current || load();
            current = normalize({
                ...base,
                ...patch,
                msf: { ...base.msf, ...(patch && patch.msf ? patch.msf : {}) },
                window: { ...base.window, ...(patch && patch.window ? patch.window : {}) },
            });
            return save();
        },

        /** Stamp a successful link, so the connect window can show it back. */
        markConnected() {
            const base = current || load();
            current = { ...base, lastConnectedAt: new Date().toISOString() };
            return save();
        },
    };
}

module.exports = { createStore, normalize, normalizeMythicAddress, normalizeMsfAddress, DEFAULTS };
