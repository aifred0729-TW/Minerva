#!/usr/bin/env node
'use strict';

// The desktop app ships the same React bundle the container serves; it does not
// build its own. Failing here with the actual command to run beats failing
// inside electron-builder's resource copy, or — worse — shipping an installer
// whose window renders the gateway's "bundle not found" page.

const fs = require('fs');
const path = require('path');

const bundle = path.resolve(__dirname, '..', '..', 'build');
const index = path.join(bundle, 'index.html');

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

const stats = fs.statSync(index);
process.stdout.write(`[minerva] bundle ok — ${bundle} (index.html ${stats.mtime.toISOString()})\n`);
