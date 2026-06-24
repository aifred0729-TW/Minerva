// One-shot: open /new/login, wait for the actual login form to appear, snapshot it.
const puppeteer = require('puppeteer');
const fs = require('fs');

const BASE = 'https://minerva';
const OUT  = '/tmp/screenshots/login.png';
const VW   = 1920;
const VH   = 1080;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--disable-dev-shm-usage',
        ],
        defaultViewport: { width: VW, height: VH },
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);

    await page.goto(`${BASE}/new/login`, { waitUntil: 'networkidle2' });

    // Wait for password input to appear (boot animation has cleared)
    try {
        await page.waitForSelector('input[type="password"]', { timeout: 20_000 });
    } catch (e) {
        console.log('password field not found within 20s; capturing anyway');
    }
    // Let any glow/scanline animations settle one more frame
    await sleep(1500);

    await page.screenshot({ path: OUT, fullPage: false });
    console.log('saved', OUT);
    await browser.close();
})();
