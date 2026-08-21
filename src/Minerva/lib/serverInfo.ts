// ═══════════════════════════════════════════════════════════════════
//  Pre-auth server identity.
//
//  The login screen needs to show which machine this console is pointed
//  at, before anyone has authenticated. Nothing in the Mythic API is
//  reachable at that point, so Minerva's own nginx serves the host's
//  machine name on /server-info (see nginx/nginx.dev.conf.template).
//
//  This is NOT window.location.hostname: that is the address the browser
//  dialled, which may be an IP, a load-balancer name, or a tunnel. The
//  value here is the name of the box actually running Minerva.
// ═══════════════════════════════════════════════════════════════════

/** Pre-auth endpoint served by Minerva's nginx. */
export const SERVER_INFO_URL = '/server-info';

const FETCH_TIMEOUT_MS = 4_000;

/** Whatever the browser dialled — the honest answer when nothing better exists. */
const dialledHost = () => window.location.hostname || '127.0.0.1';

let cached: Promise<string> | null = null;

/**
 * The Minerva host's machine name, falling back to the dialled host.
 *
 * Never rejects: callers are display code and a failure here should degrade to
 * a slightly less specific label, not break the screen. Resolved once per page
 * load and shared, so several widgets asking for it cost one request.
 */
export function getServerHostname(): Promise<string> {
    if (cached) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // Started inside a then() so that a SYNCHRONOUS throw from fetch — a
    // missing or monkey-patched implementation — becomes a rejection this
    // chain can catch, rather than escaping before `cached` is assigned and
    // taking the calling effect down with it.
    cached = Promise.resolve()
        .then(() => fetch(SERVER_INFO_URL, { cache: 'no-store', signal: controller.signal }))
        .then(res => (res.ok ? res.json() : null))
        .then((data: { hostname?: unknown } | null) => {
            const name = typeof data?.hostname === 'string' ? data.hostname.trim() : '';
            // Empty means nginx has no MINERVA_HOSTNAME configured, which is the
            // documented "don't know" answer rather than an error.
            return name || dialledHost();
        })
        .catch(() => dialledHost())
        .finally(() => clearTimeout(timeout));

    return cached;
}

/** Synchronous best guess, for first paint before the fetch resolves. */
export function serverHostnameFallback(): string {
    return dialledHost();
}
