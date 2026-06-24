// Puppeteer-driven screenshot capture for README.
// Runs inside the minerva-dev container (where puppeteer + Chrome live)
// and reaches the nginx container by its docker network alias `minerva`.
//
// Usage (from host):
//   docker exec minerva-dev node /tmp/take_screenshots.js
// Output:
//   /tmp/screenshots/<key>.png  (copied back to docs/screenshots/ after)

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://minerva';
const USER = process.env.MYTHIC_ADMIN_USER || 'mythic_admin';
const PASS = process.env.MYTHIC_ADMIN_PASSWORD || '';
const OUT  = '/tmp/screenshots';
const VW   = 1920;
const VH   = 1080;

// Pages to capture. Each entry: { key, path, wait?, after? }
// `wait`  : ms to settle after navigation (default 2500)
// `after` : async (page) => {}  — extra setup before snap
const TARGETS = [
    { key: 'login',         path: '/new/login',         skipAuth: true, wait: 2000 },
    { key: 'dashboard',     path: '/new/dashboard',     wait: 3500 },
    { key: 'events',        path: '/new/events',        wait: 2500 },
    { key: 'callbacks',     path: '/new/callbacks',     wait: 4500 },
    { key: 'console-selection', path: '/new/console',   wait: 2500 },
    { key: 'tasks',         path: '/new/task',          wait: 3000 },
    { key: 'payloads',      path: '/new/payloads',      wait: 3000 },
    { key: 'create-payload', path: '/new/create-payload', wait: 3000 },
    { key: 'payload-types', path: '/new/payload-types', wait: 3500 },
    { key: 'credentials',   path: '/new/credentials',   wait: 2500 },
    { key: 'files',         path: '/new/files',         wait: 3000 },
    { key: 'c2profiles',    path: '/new/c2-profiles',   wait: 3000 },
    { key: 'tunnels',       path: '/new/tunnels',       wait: 3000 },
    { key: 'topology3d',    path: '/new/topology',      wait: 5500 },
    { key: 'quickhacks',    path: '/new/quickhacks',    wait: 2500 },
    { key: 'metasploit',    path: '/new/metasploit',    wait: 4500 },
    { key: 'eventing',      path: '/new/eventing',      wait: 2500 },
    { key: 'mitre',         path: '/new/mitre',         wait: 5000 },
    { key: 'search',        path: '/new/search',        wait: 2000 },
    { key: 'artifacts',     path: '/new/artifacts',     wait: 2500 },
    { key: 'reporting',     path: '/new/reporting',     wait: 2500 },
    { key: 'operations',    path: '/new/operations',    wait: 2500 },
    { key: 'users',         path: '/new/users',         wait: 2500 },
    { key: 'browser-scripts', path: '/new/browser-scripts', wait: 2500 },
    { key: 'tags',          path: '/new/tags',          wait: 2000 },
    { key: 'opsec',         path: '/new/opsec',         wait: 2000 },
    { key: 'settings',      path: '/new/settings',      wait: 2500 },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--disable-dev-shm-usage',
            '--window-size=' + VW + ',' + VH,
        ],
        defaultViewport: { width: VW, height: VH },
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    page.on('console', m => {
        const t = m.type();
        if (t === 'error') console.log('[browser-error]', m.text().slice(0, 200));
    });

    // ── Step 1: login ──────────────────────────────────────────────
    console.log('[*] Loading login page...');
    await page.goto(`${BASE}/new/login`, { waitUntil: 'networkidle2' });
    // Capture login screen BEFORE submitting credentials
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'login.png'), fullPage: false });
    console.log('[+] saved login.png');

    // Find the username/password fields. Component is custom, so use any input with type.
    const usernameSel = 'input[type="text"], input[name="username"], input[autocomplete="username"]';
    const passwordSel = 'input[type="password"]';
    await page.waitForSelector(usernameSel, { timeout: 10_000 });
    await page.type(usernameSel, USER, { delay: 20 });
    await page.type(passwordSel, PASS, { delay: 20 });

    // Submit by pressing Enter (no fixed button selector)
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null),
        page.keyboard.press('Enter'),
    ]);
    await sleep(2500);

    if (page.url().includes('/login')) {
        console.error('[-] Login appears to have failed. Current URL:', page.url());
        await page.screenshot({ path: path.join(OUT, '__login_failed.png') });
        await browser.close();
        process.exit(1);
    }
    console.log('[+] logged in, current URL:', page.url());

    // ── Step 2: visit each route and screenshot ────────────────────
    for (const t of TARGETS) {
        if (t.skipAuth) continue; // login already done
        try {
            console.log('[*] →', t.path);
            await page.goto(`${BASE}${t.path}`, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(e => {
                console.log('   nav timeout (continuing):', e.message.slice(0, 80));
            });
            await sleep(t.wait || 2500);
            if (typeof t.after === 'function') {
                try { await t.after(page); await sleep(800); } catch (e) {
                    console.log('   after-hook failed:', e.message);
                }
            }
            const fp = path.join(OUT, `${t.key}.png`);
            await page.screenshot({ path: fp, fullPage: false });
            console.log('[+] saved', t.key + '.png');
        } catch (e) {
            console.error('[-] failed', t.key, '-', e.message);
        }
    }

    await browser.close();
    console.log('[done]');
})();
