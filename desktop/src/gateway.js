'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Local gateway — the desktop app's stand-in for Minerva's nginx container.
//
//  The React bundle addresses every backend through its own origin:
//  `window.location.origin + "/graphql/"`, `/auth`, `/direct/download/...`,
//  `/msf-rpc/`, and `wss://" + window.location.host + "/graphql/"`. In the
//  container deploy nginx is that origin and rewrites those paths onto Mythic.
//  Loading the bundle from `file://` would strip the origin and break all of
//  it, so the desktop app keeps the shape and moves the proxy in-process:
//  a loopback HTTP server the renderer treats exactly as it treats nginx.
//
//  The route table below is a deliberate mirror of nginx.conf.template. When
//  that file gains a location, this needs the matching entry.
//
//  The port is FIXED, not ephemeral. The origin is the storage key for the
//  operator's JWT, the persisted Zustand store (sidebar, console tabs, audio),
//  and the IndexedDB music library and graph cache. A port picked per launch
//  would hand the renderer a new origin every time and silently wipe all of
//  it — the app would look like it had never been logged into. 127.0.0.1 is
//  also a Chromium secure context, so navigator.clipboard and crypto.subtle
//  work over plain HTTP with no certificate involved.
// ═══════════════════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ── Static serving ─────────────────────────────────────────────────────────

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    // sql.js ships a .wasm and refuses to instantiate it under the wrong type.
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.hdr': 'image/vnd.radiance',
};

const mimeFor = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

/** Hop-by-hop headers: meaningful to one connection, never to be relayed. */
const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

/** nginx's X-Real-IP / X-Forwarded-For / X-Forwarded-Proto trio. */
function forwardedHeaders(req, headers) {
    const peer = req.socket.remoteAddress || '127.0.0.1';
    headers['x-real-ip'] = peer;
    headers['x-forwarded-for'] = headers['x-forwarded-for']
        ? `${headers['x-forwarded-for']}, ${peer}`
        : peer;
    headers['x-forwarded-proto'] = 'http';
    return headers;
}

function relayHeaders(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
    }
    return out;
}

// ── Route table (mirrors nginx.conf.template) ──────────────────────────────

/**
 * Prefixes forwarded verbatim to Mythic. Order matters only for readability —
 * these do not overlap. nginx declares `/auth`, `/invite` and `/refresh` as
 * prefix locations rather than exact matches, so they are prefixes here too.
 */
const MYTHIC_PREFIXES = ['/graphql/', '/api/', '/auth', '/invite', '/refresh', '/direct/'];

const matchMythic = (p) => MYTHIC_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));

// ── Gateway ────────────────────────────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {string}   opts.appDir     Directory holding the built React bundle.
 * @param {function} opts.getConfig  Returns the live config; read per request
 *                                   so a settings change lands without a restart.
 * @param {number}   opts.port       Fixed loopback port — see the note above.
 * @param {string}   [opts.devServer] CRA dev server origin; when set, /new/*
 *                                    and /ws proxy there instead of disk, so
 *                                    the desktop shell can be run against HMR.
 * @param {function} [opts.onLog]    Receives one-line diagnostics.
 */
function createGateway({ appDir, getConfig, port, devServer, onLog }) {
    const log = onLog || (() => {});
    const devTarget = devServer ? new URL(devServer) : null;
    let server = null;
    let boundPort = 0;

    const upstream = () => {
        const cfg = getConfig();
        const base = new URL(cfg.mythicAddress);
        return {
            base,
            isTLS: base.protocol === 'https:',
            mod: base.protocol === 'https:' ? https : http,
            rejectUnauthorized: !cfg.insecureTLS,
            cfg,
        };
    };

    // ── /new/* — the bundle itself ─────────────────────────────────────────
    function serveStatic(urlPath, res) {
        // `/new` and `/new/` both mean index.html; anything deeper is a file.
        const rel = urlPath === '/new' ? '/' : urlPath.slice('/new'.length);
        let decoded;
        try {
            decoded = decodeURIComponent(rel);
        } catch {
            return sendIndex(res); // malformed escape — treat as a route, not a file
        }

        const resolved = path.resolve(appDir, '.' + decoded);
        // Containment check: `..` in the URL must not escape the bundle.
        if (resolved !== appDir && !resolved.startsWith(appDir + path.sep)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('403 forbidden');
        }

        fs.stat(resolved, (err, stat) => {
            if (err || stat.isDirectory()) return sendIndex(res);

            // Hashed CRA assets are immutable; index.html must never be.
            const cacheable = decoded.startsWith('/static/');
            res.writeHead(200, {
                'Content-Type': mimeFor(resolved),
                'Content-Length': stat.size,
                'Cache-Control': cacheable ? 'public, max-age=31536000, immutable' : 'no-cache',
            });
            const stream = fs.createReadStream(resolved);
            stream.on('error', () => res.destroy());
            stream.pipe(res);
        });
    }

    function sendIndex(res) {
        const index = path.join(appDir, 'index.html');
        fs.readFile(index, (err, body) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end(
                    'Minerva bundle not found.\n\n' +
                    `Expected index.html at: ${index}\n\n` +
                    'Run `npm run build` in the repository root before starting the desktop app.',
                );
            }
            res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
            res.end(body);
        });
    }

    // ── Reverse proxy ──────────────────────────────────────────────────────
    function proxy(req, res, targetURL, { rejectUnauthorized, mod }) {
        const headers = relayHeaders(req.headers);

        // Host is forwarded unchanged, matching nginx's `proxy_set_header Host
        // $host`. TLS SNI is driven by the `hostname` option below, not by this
        // header, so the socket still presents the real server name. Rewriting
        // Host to the upstream would be the more conventional proxy behaviour
        // but diverges from the configuration Mythic is actually tested behind.
        forwardedHeaders(req, headers);

        const upReq = mod.request(
            {
                protocol: targetURL.protocol,
                hostname: targetURL.hostname,
                port: targetURL.port || (targetURL.protocol === 'https:' ? 443 : 80),
                method: req.method,
                path: targetURL.pathname + targetURL.search,
                headers,
                rejectUnauthorized,
                // File uploads and long GraphQL polls both live here.
                timeout: 300_000,
            },
            (upRes) => {
                res.writeHead(upRes.statusCode || 502, relayHeaders(upRes.headers));
                upRes.pipe(res);
            },
        );

        upReq.on('timeout', () => upReq.destroy(new Error('upstream timeout')));
        upReq.on('error', (err) => {
            log(`proxy ${req.method} ${req.url} -> ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            }
            if (!res.writableEnded) {
                res.end(JSON.stringify({ error: 'upstream_unreachable', detail: err.message }));
            }
        });

        req.pipe(upReq);
    }

    // ── auth_request equivalent ────────────────────────────────────────────
    //
    //  nginx gates /msf-config and /msf-rpc/ on a subrequest to Mythic's
    //  JWT-protected `GET /me`. Same gate, same reason: without it the MSF-RPC
    //  path is an unauthenticated route to module.execute.
    function authorizeOperator(req) {
        return new Promise((resolve) => {
            const auth = req.headers['authorization'];
            if (!auth) return resolve(false);

            const { base, mod, rejectUnauthorized } = upstream();
            const target = new URL('/me', base);
            const probe = mod.request(
                {
                    protocol: target.protocol,
                    hostname: target.hostname,
                    port: target.port || (target.protocol === 'https:' ? 443 : 80),
                    method: 'GET',
                    path: '/me',
                    headers: { authorization: auth, host: target.host },
                    rejectUnauthorized,
                    timeout: 8_000,
                },
                (upRes) => {
                    upRes.resume(); // drain, we only want the status
                    resolve((upRes.statusCode || 0) >= 200 && (upRes.statusCode || 0) < 300);
                },
            );
            probe.on('timeout', () => { probe.destroy(); resolve(false); });
            probe.on('error', () => resolve(false));
            probe.end();
        });
    }

    function deny(res) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
    }

    // ── Request router ─────────────────────────────────────────────────────
    async function onRequest(req, res) {
        const raw = req.url || '/';
        const qIndex = raw.indexOf('?');
        const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex);
        const search = qIndex === -1 ? '' : raw.slice(qIndex);
        const { base, mod, rejectUnauthorized, cfg } = upstream();

        // `location = /` — the console's front door.
        if (pathname === '/') {
            res.writeHead(302, { Location: '/new/login' });
            return res.end();
        }

        if (pathname === '/new' || pathname.startsWith('/new/')) {
            if (devTarget) {
                return proxy(req, res, new URL(pathname + search, devTarget), {
                    rejectUnauthorized: false,
                    mod: devTarget.protocol === 'https:' ? https : http,
                });
            }
            return serveStatic(pathname, res);
        }

        // Pre-auth server identity. nginx serves a file written at install time;
        // here the honest answer is the host this console is pointed at.
        if (pathname === '/server-info') {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            return res.end(JSON.stringify({ hostname: base.hostname }));
        }

        // Deployment MSF credential — operators only, same as nginx.
        if (pathname === '/msf-config') {
            if (!(await authorizeOperator(req))) return deny(res);
            const msf = cfg.msf || {};
            if (!msf.enabled || !msf.password) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ error: 'msf_not_configured' }));
            }
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            return res.end(JSON.stringify({ user: msf.user || 'msf', pass: msf.password }));
        }

        // msgpack RPC to msfrpcd, behind the same operator gate.
        if (pathname === '/msf-rpc' || pathname.startsWith('/msf-rpc/')) {
            const msf = cfg.msf || {};
            if (!msf.enabled) {
                res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ error: 'msf_disabled' }));
            }
            if (!(await authorizeOperator(req))) return deny(res);

            const msfBase = new URL(msf.address);
            const rest = pathname.slice('/msf-rpc'.length).replace(/^\//, '');
            const target = new URL('/api/' + rest + search, msfBase);
            return proxy(req, res, target, {
                rejectUnauthorized: msfBase.protocol === 'https:' ? !cfg.insecureTLS : true,
                mod: msfBase.protocol === 'https:' ? https : http,
            });
        }

        if (matchMythic(pathname)) {
            return proxy(req, res, new URL(pathname + search, base), { rejectUnauthorized, mod });
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 not found');
    }

    // ── WebSocket upgrade — GraphQL subscriptions ──────────────────────────
    //
    //  Every live surface in the console (callbacks, event feed, console
    //  output, topology) is a subscription. If this handler is wrong the app
    //  looks like it loaded and then silently stops updating, so it fails
    //  loudly instead: the client socket is destroyed on any upstream error.
    function onUpgrade(req, socket, head) {
        const raw = req.url || '/';
        const isGraphQL = raw === '/graphql' || raw.startsWith('/graphql/') || raw.startsWith('/graphql?');

        // webpack's HMR socket, only when running against a dev server.
        const isHMR = Boolean(devTarget) && (raw === '/ws' || raw.startsWith('/ws?'));
        if (!isGraphQL && !isHMR) return socket.destroy();

        const { base, mod: mythicMod, rejectUnauthorized: verifyMythic } = upstream();
        const origin = isHMR ? devTarget : base;
        const mod = isHMR ? (devTarget.protocol === 'https:' ? https : http) : mythicMod;
        const rejectUnauthorized = isHMR ? false : verifyMythic;
        const target = new URL(raw, origin);
        const headers = relayHeaders(req.headers);
        headers.connection = 'Upgrade';
        headers.upgrade = req.headers.upgrade || 'websocket';

        const upReq = mod.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            method: 'GET',
            path: target.pathname + target.search,
            headers,
            rejectUnauthorized,
        });

        upReq.on('upgrade', (upRes, upSocket, upHead) => {
            const statusLine = `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n`;
            const headerLines = Object.entries(upRes.headers)
                .map(([k, v]) => (Array.isArray(v) ? v.map((x) => `${k}: ${x}`).join('\r\n') : `${k}: ${v}`))
                .join('\r\n');
            socket.write(statusLine + headerLines + '\r\n\r\n');

            if (upHead && upHead.length) socket.write(upHead);
            if (head && head.length) upSocket.write(head);

            socket.setNoDelay(true);
            upSocket.setNoDelay(true);

            const drop = () => { socket.destroy(); upSocket.destroy(); };
            socket.on('error', drop);
            upSocket.on('error', drop);
            socket.pipe(upSocket);
            upSocket.pipe(socket);
        });

        // Mythic answered the upgrade with a normal response — relay it so the
        // client sees the real status (401, 502) rather than a dead socket.
        upReq.on('response', (upRes) => {
            socket.write(`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n\r\n`);
            upRes.pipe(socket);
        });

        upReq.on('error', (err) => {
            log(`upgrade ${raw} -> ${err.message}`);
            socket.destroy();
        });

        upReq.end();
    }

    return {
        /** Bind the fixed loopback port. Never reachable off-host. */
        start() {
            return new Promise((resolve, reject) => {
                if (server) return resolve({ port: boundPort, url: `http://127.0.0.1:${boundPort}` });
                // Mythic's JWTs are large; nginx raises its header buffers to
                // 16k for the same reason. Node's 16k default is close enough
                // to the line that a long-lived operator token plus the usual
                // headers can trip a 431 the app cannot explain.
                server = http.createServer({ maxHeaderSize: 65536 });
                server.on('request', (req, res) => {
                    onRequest(req, res).catch((err) => {
                        log(`route ${req.url} -> ${err.message}`);
                        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
                        if (!res.writableEnded) res.end('500 gateway error');
                    });
                });
                server.on('upgrade', onUpgrade);
                server.on('error', (err) => {
                    server = null;
                    if (err.code === 'EADDRINUSE') {
                        return reject(new Error(
                            `Port ${port} on 127.0.0.1 is already in use. ` +
                            'Another Minerva is probably running. Close it, or set ' +
                            'MINERVA_PORT to a free port and relaunch.',
                        ));
                    }
                    reject(err);
                });
                server.listen(port, '127.0.0.1', () => {
                    boundPort = server.address().port;
                    log(`gateway listening on 127.0.0.1:${boundPort}`);
                    resolve({ port: boundPort, url: `http://127.0.0.1:${boundPort}` });
                });
            });
        },

        stop() {
            return new Promise((resolve) => {
                if (!server) return resolve();
                const s = server;
                server = null;
                boundPort = 0;
                s.close(() => resolve());
                // close() waits on keep-alive sockets; subscriptions hold them open.
                s.closeAllConnections?.();
            });
        },

        get port() { return boundPort; },
        get url() { return boundPort ? `http://127.0.0.1:${boundPort}` : null; },
    };
}

// ── Pre-flight checks (drive the connect window's checklist) ───────────────

function tcpReachable(hostname, port, timeoutMs = 6_000) {
    return new Promise((resolve) => {
        const socket = net.connect({ host: hostname, port, timeout: timeoutMs });
        const done = (ok, detail) => {
            socket.destroy();
            resolve({ ok, detail });
        };
        socket.on('connect', () => done(true, `${hostname}:${port}`));
        socket.on('timeout', () => done(false, 'timed out'));
        socket.on('error', (err) => done(false, err.code || err.message));
    });
}

function tlsHandshake(hostname, port, rejectUnauthorized, timeoutMs = 8_000) {
    return new Promise((resolve) => {
        const socket = tls.connect(
            { host: hostname, port, servername: hostname, rejectUnauthorized, timeout: timeoutMs },
            () => {
                const cert = socket.getPeerCertificate() || {};
                resolve({
                    ok: true,
                    detail: socket.getProtocol() || 'TLS',
                    fingerprint: cert.fingerprint256 || null,
                    subject: (cert.subject && cert.subject.CN) || null,
                    validTo: cert.valid_to || null,
                    authorized: socket.authorized,
                });
                socket.destroy();
            },
        );
        socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, detail: 'timed out' }); });
        socket.on('error', (err) => { socket.destroy(); resolve({ ok: false, detail: err.code || err.message }); });
    });
}

/**
 * Any HTTP answer from /me proves something is speaking Mythic's protocol at
 * that address. 401 is the expected one — the probe deliberately carries no
 * token — so it counts as success. A 200 means the address is fine but also
 * that Mythic is not requiring auth there, which is worth surfacing.
 */
function mythicEndpoint(base, rejectUnauthorized, timeoutMs = 8_000) {
    return new Promise((resolve) => {
        const mod = base.protocol === 'https:' ? https : http;
        const req = mod.request(
            {
                protocol: base.protocol,
                hostname: base.hostname,
                port: base.port || (base.protocol === 'https:' ? 443 : 80),
                method: 'GET',
                path: '/me',
                headers: { host: base.host },
                rejectUnauthorized,
                timeout: timeoutMs,
            },
            (res) => {
                res.resume();
                const code = res.statusCode || 0;
                resolve({ ok: code > 0, detail: `HTTP ${code}`, status: code });
            },
        );
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'timed out' }); });
        req.on('error', (err) => resolve({ ok: false, detail: err.code || err.message }));
        req.end();
    });
}

/**
 * Runs the connect window's four checks, reporting each as it lands so the
 * checklist fills in rather than appearing all at once.
 *
 * @param {object}   cfg
 * @param {function} report  (id, status, detail) — status: OK | FAIL | N/A
 */
async function preflight(cfg, report) {
    const base = new URL(cfg.mythicAddress);
    const port = Number(base.port || (base.protocol === 'https:' ? 443 : 80));
    const rejectUnauthorized = !cfg.insecureTLS;
    const result = { ok: false, fingerprint: null, steps: {} };

    const step = (id, res, extra) => {
        result.steps[id] = { ...res, ...(extra || {}) };
        report(id, res.ok ? 'OK' : 'FAIL', res.detail);
        return res.ok;
    };

    const reach = await tcpReachable(base.hostname, port);
    if (!step('SERVER_REACHABLE', reach)) return result;

    if (base.protocol === 'https:') {
        const handshake = await tlsHandshake(base.hostname, port, rejectUnauthorized);
        result.fingerprint = handshake.fingerprint || null;
        if (!step('TLS_HANDSHAKE', handshake)) return result;
    } else {
        result.steps.TLS_HANDSHAKE = { ok: true, detail: 'plaintext' };
        report('TLS_HANDSHAKE', 'N/A', 'plaintext');
    }

    const endpoint = await mythicEndpoint(base, rejectUnauthorized);
    if (!step('MYTHIC_ENDPOINT', endpoint)) return result;

    result.ok = true;
    return result;
}

module.exports = { createGateway, preflight };
