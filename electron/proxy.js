// ═══════════════════════════════════════════════════════════════════
//  Local reverse proxy — the Electron main-process equivalent of the
//  Nginx that serves Minerva in Docker.
//
//  The React app under src/ is written entirely against SAME-ORIGIN
//  relative URLs (see lib/apollo.ts, lib/websocket.ts, lib/urls.ts,
//  lib/auth.ts, pages/Metasploit/msfrpc.ts). It never learns Mythic's
//  real address — the proxy does. So we replicate nginx.dev.conf exactly:
//
//    /graphql/   → ${MYTHIC}/graphql/     (HTTP + WS upgrade, accept self-signed)
//    /api/       → ${MYTHIC}/api/         (streamed, for large uploads/downloads)
//    /auth       → ${MYTHIC}/auth
//    /refresh    → ${MYTHIC}/refresh
//    /invite     → ${MYTHIC}/invite
//    /direct/    → ${MYTHIC}/direct/
//    /msf-rpc/   → ${MSF}/api/            (PATH REWRITE: /msf-rpc/ → /api/)
//    /           → 302 /new/login
//    /new/*      → bundled static build (or dev server, if MINERVA_DEV_SERVER)
//
//  Serving the app from http://127.0.0.1:<fixed-port> keeps window.location
//  .origin STABLE across launches, so the JWT in localStorage / IndexedDB
//  music library / graph-node cache survive restarts. 127.0.0.1 is also a
//  Chromium "secure context", so navigator.clipboard / crypto.subtle work
//  over plain HTTP with no cert needed. Mythic's own self-signed TLS is
//  terminated here on the Node side via `secure: false`.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

// Nginx-equivalent upstream path groups.
const MYTHIC_PREFIXES = ['/graphql', '/api', '/auth', '/refresh', '/invite', '/direct'];
const MSF_PREFIX = '/msf-rpc';

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm', // sql.js ships a .wasm — MUST be this type for streaming compile
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.glb': 'model/gltf-binary',
};

function pathnameOf(reqUrl) {
    // Strip query string; reqUrl is always origin-relative here.
    const q = reqUrl.indexOf('?');
    return q === -1 ? reqUrl : reqUrl.slice(0, q);
}

function startsWithPrefix(pathname, prefix) {
    // Mirror nginx prefix `location` semantics: match the prefix exactly or
    // followed by `/` or `?` (query already stripped by caller).
    return pathname === prefix || pathname.startsWith(prefix + '/');
}

function isMythicPath(pathname) {
    return MYTHIC_PREFIXES.some((p) => startsWithPrefix(pathname, p));
}

/**
 * @param {object} opts
 * @param {() => string} opts.getMythicTarget  e.g. "https://10.0.0.5:7443"
 * @param {() => string} opts.getMsfTarget     e.g. "http://127.0.0.1:55553"
 * @param {{type:'build', dir:string} | {type:'devServer', target:string}} opts.staticMode
 * @param {(msg:string)=>void} [opts.log]
 * @returns {import('http').Server}
 */
function createProxyServer({ getMythicTarget, getMsfTarget, staticMode, log = () => {} }) {
    // `changeOrigin:false` mirrors nginx `proxy_set_header Host $host` — the
    // original (localhost) Host is forwarded; TLS SNI still uses the target
    // host, exactly like a reverse proxy. `secure:false` = proxy_ssl_verify off.
    const proxy = httpProxy.createProxyServer({
        changeOrigin: false,
        secure: false,
        xfwd: true,
        proxyTimeout: 300000, // 300s, matches nginx /api read/send timeout
    });

    proxy.on('error', (err, req, res) => {
        log(`proxy error for ${req && req.url}: ${err.message}`);
        // res may be a socket (ws) or ServerResponse; guard both.
        if (res && typeof res.writeHead === 'function' && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Minerva proxy: upstream unreachable (' + err.message + ')');
        } else if (res && typeof res.destroy === 'function') {
            res.destroy();
        }
    });

    const server = http.createServer(
        // Large headers: Mythic JWTs are big; nginx bumped buffers to 16k.
        { maxHeaderSize: 65536 },
        (req, res) => {
            const pathname = pathnameOf(req.url);

            if (isMythicPath(pathname)) {
                proxy.web(req, res, { target: getMythicTarget() });
                return;
            }

            if (startsWithPrefix(pathname, MSF_PREFIX)) {
                // Path rewrite: /msf-rpc/... → /api/...  (nginx proxy_pass .../api/)
                req.url = req.url.replace(/^\/msf-rpc/, '/api');
                proxy.web(req, res, { target: getMsfTarget() });
                return;
            }

            if (staticMode.type === 'devServer') {
                // Everything else (incl. /new/* and CRA's HMR assets) → dev server.
                proxy.web(req, res, { target: staticMode.target });
                return;
            }

            serveBuild(req, res, pathname, staticMode.dir, log);
        }
    );

    // WebSocket upgrades: only GraphQL subscriptions go to Mythic. In dev
    // mode, webpack HMR's /ws goes to the dev server.
    server.on('upgrade', (req, socket, head) => {
        const pathname = pathnameOf(req.url);
        if (startsWithPrefix(pathname, '/graphql')) {
            proxy.ws(req, socket, head, { target: getMythicTarget() });
        } else if (staticMode.type === 'devServer') {
            proxy.ws(req, socket, head, { target: staticMode.target });
        } else {
            socket.destroy();
        }
    });

    return server;
}

function serveBuild(req, res, pathname, buildDir, log) {
    // Root → login, mirroring nginx `location = /`.
    if (pathname === '/') {
        res.writeHead(302, { Location: '/new/login' });
        res.end();
        return;
    }

    // The React app is built with homepage "/new", so assets are addressed as
    // /new/static/... while living on disk at build/static/... — strip /new.
    const indexHtml = path.join(buildDir, 'index.html');
    if (!startsWithPrefix(pathname, '/new')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const rel = pathname.slice('/new'.length).replace(/^\/+/, ''); // '' | 'static/js/x.js' | 'login'
    const candidate = path.resolve(buildDir, rel);

    // Path-traversal guard: never serve outside buildDir.
    if (candidate !== buildDir && !candidate.startsWith(buildDir + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.stat(candidate, (err, stat) => {
        if (!err && stat.isFile()) {
            sendFile(res, candidate);
        } else {
            // SPA fallback: any /new/* route (e.g. /new/callbacks/5) → index.html.
            sendFile(res, indexHtml);
        }
    });
}

function sendFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const type = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
    });
    stream.pipe(res);
}

module.exports = { createProxyServer };
