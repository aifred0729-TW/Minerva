// ═══════════════════════════════════════════════════════════════════
//  Persisted connection config (Mythic + MSF-RPC addresses).
//
//  Resolution order (highest priority first):
//    1. Environment variable  (CI / power users / scripted launch)
//    2. minerva-config.json in the Electron userData dir (set via the
//       in-app "Set Mythic Server…" window)
//    3. Built-in localhost default
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_MYTHIC = 'https://127.0.0.1:7443';
const DEFAULT_MSF = 'http://127.0.0.1:55553';

function configPath() {
    return path.join(app.getPath('userData'), 'minerva-config.json');
}

function readFileConfig() {
    try {
        return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    } catch (_e) {
        return {};
    }
}

// Trim and drop any trailing slash so path joining is predictable.
function normalize(addr) {
    return typeof addr === 'string' ? addr.trim().replace(/\/+$/, '') : addr;
}

function getMythicAddress() {
    const fromEnv = process.env.MINERVA_MYTHIC_ADDRESS || process.env.MYTHIC_ADDRESS;
    return normalize(fromEnv || readFileConfig().mythicAddress || DEFAULT_MYTHIC);
}

function getMsfAddress() {
    const fromEnv = process.env.MINERVA_MSF_ADDRESS || process.env.MSF_ADDRESS;
    return normalize(fromEnv || readFileConfig().msfAddress || DEFAULT_MSF);
}

// True when the operator has never configured a server and none is forced
// via env — used to pop the settings window on first launch.
function isConfigured() {
    if (process.env.MINERVA_MYTHIC_ADDRESS || process.env.MYTHIC_ADDRESS) return true;
    return typeof readFileConfig().mythicAddress === 'string';
}

function save({ mythicAddress, msfAddress }) {
    const current = readFileConfig();
    const next = { ...current };
    if (mythicAddress !== undefined) next.mythicAddress = normalize(mythicAddress);
    if (msfAddress !== undefined) next.msfAddress = normalize(msfAddress);
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
    return next;
}

module.exports = {
    DEFAULT_MYTHIC,
    DEFAULT_MSF,
    getMythicAddress,
    getMsfAddress,
    isConfigured,
    save,
    configPath,
};
