/**
 * Mythic-backed key/value store for Minerva-side ephemeral state.
 *
 * Why this exists: state that "feels like Mythic" — MSF session ledger,
 * file-listing caches, process snapshots, MSF task history — used to live
 * only in localStorage. Mythic stores its own settings server-side via the
 * `updateOperatorPreferences` mutation, so the same data should land
 * there too: same persistence, same backup story, follows the operator
 * across browsers / machines, gets reset by the same "reset preferences"
 * affordance the rest of Minerva already has.
 *
 * Storage layout — one bag inside the operator preferences blob:
 *   preferences {
 *     ...other Mythic settings,
 *     minerva_msf_state: {
 *       minerva_msf_session_ledger: { ... },
 *       minerva_msf_fs_3:            { ... },
 *       minerva_msf_ps_3:            { ... },
 *       minerva_msf_tasks_3:         [ ... ],
 *       ...
 *     },
 *   }
 * Updates are merged into the rest of `preferences` so unrelated Mythic
 * settings are not clobbered.
 *
 * Three layers:
 *   1. In-memory `Map` — hot reads, stable references for
 *      useSyncExternalStore.
 *   2. localStorage mirror — survives reload before Mythic preferences
 *      finish loading, and works offline-ish if the mutation fails.
 *   3. Mythic preferences (the source of truth) — flushed with a short
 *      debounce so a poll loop that writes every second produces ~1 RPC
 *      per second, not per write.
 *
 * Consumers use a `localStorage`-shaped API (`getItem` / `setItem` /
 * `removeItem` / `subscribe`) so the existing cache files only need a
 * tiny rename. They also opt their keys into Mythic-sync by calling
 * `mythicKV.manageKey(key)` once — only managed keys get pushed up.
 */
import { gql } from '@apollo/client';
import type { ApolloClient } from '@apollo/client/core';
import { mePreferences } from './state';

const PREFS_BAG_KEY = 'minerva_msf_state';
const FLUSH_DEBOUNCE_MS = 800;

// ─── Reactive store state ─────────────────────────────────────────────────
const memory = new Map<string, string>();
const managed = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
const wildcardListeners = new Set<() => void>();
// Keys that have been written in this browser session. Hydration must NOT
// overwrite these — they're newer than whatever is in the Mythic prefs blob
// (typical case: a poll loop wrote a few entries before preferences finished
// loading). Updates from other browsers still arrive on the next hydrate
// after our flush settles.
const touched = new Set<string>();

let client: ApolloClient | null = null;
let hydrated = false;
let pendingFlush = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const UPDATE_PREFERENCES = gql`
    mutation MinervaMsfStateUpdate($preferences: jsonb!) {
        updateOperatorPreferences(preferences: $preferences) {
            status
            error
        }
    }
`;

// ─── Lifecycle hooks ──────────────────────────────────────────────────────

/** Wire the Apollo client used to write back to Mythic. Call once at boot. */
export function attachApolloClient(c: ApolloClient): void {
    client = c;
}

/**
 * Hydrate the cache from a preferences blob. The blob is the value returned
 * by `getOperatorPreferences.preferences`. We extract the
 * `minerva_msf_state` sub-object, copy each key into memory + localStorage,
 * mark them managed, and emit subscribers so reactive UI updates.
 */
export function hydrateFromPreferences(preferences: Record<string, unknown> | null | undefined): void {
    const bag = (preferences && typeof preferences === 'object'
        ? (preferences as Record<string, unknown>)[PREFS_BAG_KEY]
        : null) as Record<string, unknown> | null;
    if (bag && typeof bag === 'object') {
        for (const [k, v] of Object.entries(bag)) {
            managed.add(k);
            // Preserve any pre-hydration writes — they're newer than the
            // Mythic copy and will be flushed up shortly.
            if (touched.has(k)) continue;
            const stringValue = typeof v === 'string' ? v : JSON.stringify(v);
            if (memory.get(k) !== stringValue) {
                memory.set(k, stringValue);
                try { localStorage.setItem(k, stringValue); } catch { /* quota */ }
                emit(k);
            }
        }
    }
    hydrated = true;
    // If anyone wrote to the store before hydration finished, flush now.
    if (pendingFlush) scheduleFlush();
}

/** Mark a key for Mythic sync. Idempotent; call once near the cache module. */
export function manageKey(key: string): void {
    managed.add(key);
}

// ─── localStorage-style API ───────────────────────────────────────────────

export function getItem(key: string): string | null {
    if (memory.has(key)) return memory.get(key)!;
    // Fallback to localStorage for pre-hydration reads (poll loops that
    // start before Mythic preferences come back).
    try {
        const v = localStorage.getItem(key);
        if (v !== null) memory.set(key, v);
        return v;
    } catch {
        return null;
    }
}

export function setItem(key: string, value: string): void {
    if (memory.get(key) === value) return;
    memory.set(key, value);
    touched.add(key);
    try { localStorage.setItem(key, value); } catch { /* quota */ }
    emit(key);
    if (managed.has(key)) scheduleFlush();
}

export function removeItem(key: string): void {
    if (!memory.has(key)) {
        try { if (localStorage.getItem(key) === null) return; } catch { return; }
    }
    memory.delete(key);
    touched.add(key);
    try { localStorage.removeItem(key); } catch { /* quota */ }
    emit(key);
    if (managed.has(key)) {
        // Keep it in `managed` so the next flush knows to delete the key
        // from the Mythic blob too.
        scheduleFlush();
    }
}

export function subscribe(key: string, fn: () => void): () => void {
    let set = listeners.get(key);
    if (!set) { set = new Set(); listeners.set(key, set); }
    set.add(fn);
    return () => { listeners.get(key)?.delete(fn); };
}

/** Notified on every change to any managed key — used by the cache modules. */
export function subscribeAll(fn: () => void): () => void {
    wildcardListeners.add(fn);
    return () => { wildcardListeners.delete(fn); };
}

// ─── Internals ────────────────────────────────────────────────────────────

function emit(key: string): void {
    listeners.get(key)?.forEach(fn => { try { fn(); } catch { /* swallow */ } });
    wildcardListeners.forEach(fn => { try { fn(); } catch { /* swallow */ } });
}

function scheduleFlush(): void {
    pendingFlush = true;
    if (!hydrated) return; // wait for hydrate() to call us back
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        if (!pendingFlush) return;
        pendingFlush = false;
        void flushToMythic();
    }, FLUSH_DEBOUNCE_MS);
}

async function flushToMythic(): Promise<void> {
    if (!client) return;
    // Build the new MSF bag from every managed key that still has a value.
    const bag: Record<string, unknown> = {};
    for (const key of managed) {
        const raw = memory.get(key);
        if (raw === undefined) continue;
        // Try to store the parsed form for compact JSON; fall back to string.
        try { bag[key] = JSON.parse(raw); } catch { bag[key] = raw; }
    }
    const nextPreferences = { ...(mePreferences() ?? {}), [PREFS_BAG_KEY]: bag };
    // Keep the reactive var in sync so other code (e.g. setBulk) sees the
    // current MSF state when it merges.
    mePreferences(nextPreferences);
    try {
        await client.mutate({
            mutation: UPDATE_PREFERENCES,
            variables: { preferences: nextPreferences },
        });
    } catch {
        // Network blip — retry on the next change.
        pendingFlush = true;
        if (!flushTimer) {
            flushTimer = setTimeout(() => {
                flushTimer = null;
                if (pendingFlush) { pendingFlush = false; void flushToMythic(); }
            }, FLUSH_DEBOUNCE_MS * 4);
        }
    }
}

/** Force-flush, e.g. before logout. Resolves once Mythic has acknowledged. */
export async function flushNow(): Promise<void> {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    pendingFlush = false;
    await flushToMythic();
}
