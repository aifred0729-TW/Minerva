'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  afterPack — ad-hoc sign the macOS app when nothing else will.
//
//  Apple Silicon does not merely warn about unsigned binaries; the kernel
//  refuses to execute them. A macOS build produced with no signing identity
//  therefore does not start at all on any Mac made since 2020 — the app bounces
//  once in the Dock and dies, with nothing in the UI to explain it.
//
//  An ad-hoc signature (identity "-") satisfies that requirement. It does NOT
//  satisfy Gatekeeper: a downloaded copy still carries com.apple.quarantine and
//  is still refused as "damaged" until the operator strips it, or until the app
//  is signed with a Developer ID and notarized. This is the floor, not the fix.
//
//  No-op when a real identity is configured, so it never disturbs a signed
//  build, and no-op on Windows.
// ═══════════════════════════════════════════════════════════════════════════

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
    if (context.electronPlatformName !== 'darwin') return;

    // A real signing setup is in play — leave it entirely alone.
    const hasIdentity =
        process.env.CSC_LINK ||
        process.env.CSC_NAME ||
        (context.packager.config.mac && context.packager.config.mac.identity);
    if (hasIdentity) {
        console.log('[minerva] signing identity present — skipping ad-hoc signature');
        return;
    }

    // A universal build stages each arch in dist/mac-universal-<arch>-temp and
    // then merges them, and the merge requires every non-binary file to hash
    // identically across the two. Signing a staging copy breaks that: each arch
    // gets its own _CodeSignature. Leave the staging dirs alone.
    if (context.appOutDir.endsWith('-temp')) {
        console.log(`[minerva] ${context.appOutDir} is universal staging — not signing it`);
        return;
    }

    const appName = `${context.packager.appInfo.productFilename}.app`;
    const appPath = path.join(context.appOutDir, appName);

    console.log(`[minerva] ad-hoc signing ${appPath}`);
    try {
        // --deep is deprecated by Apple for distribution signing but remains the
        // supported way to ad-hoc sign a tree of nested helpers and frameworks,
        // which is exactly what an Electron .app is.
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
            stdio: 'inherit',
        });
        console.log('[minerva] ad-hoc signature applied — the app will launch on Apple Silicon');
        console.log('[minerva] it is NOT notarized: users must strip the quarantine attribute');
    } catch (err) {
        // Do not fail the build: an unsigned x64 build is still usable under
        // Rosetta, and failing here would hide that.
        console.warn(`[minerva] ad-hoc signing failed: ${err.message}`);
    }
};
