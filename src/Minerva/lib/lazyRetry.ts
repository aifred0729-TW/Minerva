// ═══════════════════════════════════════════════════════════════════
//  Route code-splitting that survives a moved chunk.
//
//  Every page in App.tsx is a dynamic import, so opening a route is a
//  network fetch for a webpack chunk. That fetch fails for two mundane
//  reasons, neither of which is a bug in the page:
//
//    • the dev server is mid-recompile when the route is opened — the
//      chunk is briefly not emitted and the request 404s;
//    • the tab has been open across a redeploy and is still running the
//      old bundle, which asks for a chunk the server no longer has.
//
//  React.lazy latches that rejection permanently: the module payload is
//  parked in a Rejected state and every later render re-throws it, so
//  the route stays dead for the life of the tab and the ErrorBoundary's
//  "Try Again" cannot fix it. Only a page load can.
//
//  So: retry the import a couple of times (covers the recompile window),
//  and if it still will not load, reload the page once — guarded per
//  chunk in sessionStorage so a chunk that is genuinely broken surfaces
//  in the ErrorBoundary instead of putting the tab in a reload loop.
// ═══════════════════════════════════════════════════════════════════

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Attempts after the first one before giving up on the import. */
const RETRIES = 2;

/** Base backoff; attempt N waits N × this, so 400ms then 800ms. */
const RETRY_DELAY_MS = 400;

const GUARD_PREFIX = 'minerva.chunkReload.';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Is this the browser failing to fetch a code-split chunk?
 *
 * webpack raises a named `ChunkLoadError`; the message forms are matched too
 * because a CSS chunk failure and a native `import()` failure (bundlers other
 * than webpack, and webpack's own module-federation paths) word it differently
 * without setting the name.
 */
export function isChunkLoadError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const { name, message } = err as { name?: unknown; message?: unknown };
    if (name === 'ChunkLoadError') return true;
    if (typeof message !== 'string') return false;
    return /Loading (CSS )?chunk .+ failed/i.test(message)
        || /Failed to fetch dynamically imported module/i.test(message);
}

/**
 * Claim the one reload this chunk is allowed for this tab session.
 *
 * Returns false when the reload has already been spent — including when
 * sessionStorage is unavailable (private mode, storage disabled), because
 * without somewhere to record the attempt a reload could repeat forever.
 */
function claimReload(key: string): boolean {
    try {
        const guard = GUARD_PREFIX + key;
        if (sessionStorage.getItem(guard)) return false;
        sessionStorage.setItem(guard, String(Date.now()));
        return true;
    } catch {
        return false;
    }
}

/** Chunk arrived — re-arm the reload for whatever breaks it next time. */
function releaseReload(key: string): void {
    try {
        sessionStorage.removeItem(GUARD_PREFIX + key);
    } catch {
        /* storage unavailable: nothing was claimed, nothing to release */
    }
}

/**
 * `React.lazy` with chunk-fetch retries and a single self-healing reload.
 *
 * `key` identifies the chunk for the reload guard — use the page name, and
 * keep it unique across call sites so one broken page cannot spend another
 * page's reload.
 */
export function lazyRetry<T extends ComponentType<any>>(
    importer: () => Promise<{ default: T }>,
    key: string,
): LazyExoticComponent<T> {
    return lazy(async () => {
        for (let attempt = 0; ; attempt++) {
            try {
                const mod = await importer();
                releaseReload(key);
                return mod;
            } catch (err) {
                // A page that throws while evaluating is a real error: report
                // it as-is rather than reloading into it repeatedly.
                if (!isChunkLoadError(err)) throw err;

                if (attempt < RETRIES) {
                    await sleep(RETRY_DELAY_MS * (attempt + 1));
                    continue;
                }

                if (!claimReload(key)) throw err;
                window.location.reload();
                // Park forever: the reload is already in flight, and resolving
                // or rejecting here would flash an error frame on the way out.
                return await new Promise<never>(() => { });
            }
        }
    });
}
