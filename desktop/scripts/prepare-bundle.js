#!/usr/bin/env node
'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Stage the web bundle into the desktop project before packaging.
//
//  The bundle is built at the repository root, one level above this package.
//  Pointing electron-builder's extraResources at `../build` looked like it
//  would work and did not: the packaged app shipped an empty resources
//  directory and every window rendered "bundle not found". Two things were
//  wrong with that shape, and this script removes both.
//
//  1. `from: ../build` escapes the project directory. How electron-builder
//     resolves a relative `from` — against the project dir or against
//     directories.buildResources — is not something to depend on. Copying the
//     bundle inside the project first means the path never leaves it.
//
//  2. `to: app` collides with `app.asar`. Electron treats `resources/app` as a
//     place an application can live, so handing that exact name to a resource
//     directory puts it in competition with the packed application. The
//     staged copy is called `webroot`, which nothing else claims.
//
//  Runs before every package and every local start, so the two paths cannot
//  drift apart.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '..', '..', 'build');
const index = path.join(source, 'index.html');
const target = path.resolve(__dirname, '..', 'webroot');

if (!fs.existsSync(index)) {
    process.stderr.write(
        '\n  Minerva bundle not found.\n\n' +
        `  Expected: ${index}\n\n` +
        '  Build it from the repository root first:\n\n' +
        '      npm install\n' +
        '      npm run build\n\n',
    );
    process.exit(1);
}

// Replace rather than merge: a stale asset from an older bundle would ship
// silently, and hashed filenames make that invisible until something 404s.
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

const count = (function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce(
        (n, entry) => n + (entry.isDirectory() ? walk(path.join(dir, entry.name)) : 1),
        0,
    );
})(target);

process.stdout.write(`[minerva] staged ${count} files: ${source} -> ${target}\n`);
