/**
 * Port allocator for the MSF SOCKS tunnel — one port per Mythic **operation**,
 * not per meterpreter session.
 *
 * Why per-operation:
 *   - `auxiliary/server/socks_proxy` consults the route table on every incoming
 *     connection, so one running proxy serves every session whose routes are
 *     present. A single port can dynamically cover everything Minerva pivots
 *     through.
 *   - Tying the port to an operation keeps the assignment stable: teammates on
 *     the same engagement share it, and proxychains4 config does not change as
 *     sessions come and go.
 *
 * ── Why this is stored in agentstorage and not operator preferences ──────────
 *
 * The ledger used to live in `mythicKVStore`, i.e. `updateOperatorPreferences`
 * — which is PER OPERATOR. The header promised "teammates share the port" while
 * the storage made that impossible: operator B could not see A's map, so B read
 * an empty ledger, allocated 7100, failed to bind (A already had it), and then
 * the job lookup's blind fallback latched B onto A's proxy. B then pushed
 * `route add` for B's subnets into the one MSF route table A's proxychains was
 * consuming.
 *
 * agentstorage is shared across operators, and the ledger is one row PER PORT
 * so claiming is atomic — see lib/api/msfSocksAlloc.ts. A blob would have the
 * same lost-update race the preferences store had.
 *
 * Reads are synchronous against an in-memory cache (the Tunnels row resolves an
 * operation during a click handler); anything that MUTATES the ledger is async
 * and refreshes the cache.
 *
 * Range 7100-7131 is published by docker-compose.metasploit.yml, starting at
 * 7100 to leave Mythic's own SOCKS range (7000-7010) untouched.
 */
import { apolloClient } from './apollo';
import * as mythicKV from './mythicKVStore';
import {
    GET_MSF_SOCKS_ALLOCATIONS,
    CLAIM_MSF_SOCKS_PORT,
    RELEASE_MSF_SOCKS_PORT,
    MSF_SOCKS_ALLOC_PREFIX,
    msfSocksAllocUniqueId,
} from './api/msfSocksAlloc';

export const MSF_SOCKS_PORT_MIN = 7100;
export const MSF_SOCKS_PORT_MAX = 7131;

/** Legacy per-operator key, migrated forward once then left alone. */
const LEGACY_KEY = 'minerva_msf_socks_alloc';

type Allocation = Record<string, number>; // operationId → port

// ─── In-memory mirror of the shared ledger ──────────────────────────────────
let cache: Allocation = {};
let migrated = false;

const enc = (s: string): string => btoa(unescape(encodeURIComponent(s)));
const dec = (data: string): string => {
    if (!data) return '';
    // Postgres hands bytea back as `\x<hex>`; the UI writes base64. Accept both.
    if (data.startsWith('\\x')) {
        const hex = data.slice(2);
        let out = '';
        for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        try { return decodeURIComponent(escape(atob(out))); } catch { return out; }
    }
    try { return decodeURIComponent(escape(atob(data))); } catch { return data; }
};

const portFromUniqueId = (u: string): number | null => {
    if (!u.startsWith(MSF_SOCKS_ALLOC_PREFIX)) return null;
    const n = parseInt(u.slice(MSF_SOCKS_ALLOC_PREFIX.length), 10);
    return Number.isFinite(n) ? n : null;
};

const opFromRow = (data: string): string | null => {
    try {
        const parsed = JSON.parse(dec(data));
        const op = parsed?.op;
        return op ? String(op) : null;
    } catch { return null; }
};

/** Pull the shared ledger into the cache. Safe to call often. */
export async function refreshAllocations(): Promise<Allocation> {
    try {
        const res = await apolloClient.query<any>({
            query: GET_MSF_SOCKS_ALLOCATIONS,
            variables: { prefix: `${MSF_SOCKS_ALLOC_PREFIX}%` },
            fetchPolicy: 'network-only',
        });
        const next: Allocation = {};
        for (const row of res?.data?.agentstorage ?? []) {
            const port = portFromUniqueId(String(row.unique_id ?? ''));
            const op = opFromRow(String(row.data ?? ''));
            if (port !== null && op) next[op] = port;
        }
        cache = next;
        if (!migrated) { migrated = true; void migrateLegacyLedger(); }
    } catch {
        // Offline / permission blip — keep whatever we already had rather than
        // reporting the range as free, which would hand out a port in use.
    }
    return { ...cache };
}

/**
 * One-time migration of the old per-operator blob into the shared ledger.
 * Uses the same atomic claim, so it can never steal a port another operator
 * already holds, and a half-migrated state simply resolves on the next call.
 */
async function migrateLegacyLedger(): Promise<void> {
    try {
        mythicKV.manageKey(LEGACY_KEY);
        const raw = mythicKV.getItem(LEGACY_KEY);
        if (!raw) return;
        const old = JSON.parse(raw) as Allocation;
        for (const [op, port] of Object.entries(old ?? {})) {
            if (typeof port !== 'number') continue;
            if (cache[op] === port) continue;             // already in the shared ledger
            await claimPort(port, op);                    // no-op if someone else holds it
        }
        await refreshAllocations();
    } catch { /* best effort */ }
}

/** Atomic test-and-set. True when THIS operation ends up holding the port. */
async function claimPort(port: number, opKey: string): Promise<boolean> {
    try {
        const res = await apolloClient.mutate<any>({
            mutation: CLAIM_MSF_SOCKS_PORT,
            variables: { unique_id: msfSocksAllocUniqueId(port), data: enc(JSON.stringify({ op: opKey })) },
        });
        // `update_columns: []` → ON CONFLICT DO NOTHING → null when already held.
        return !!res?.data?.insert_agentstorage_one;
    } catch {
        return false;
    }
}

/**
 * Return this operation's port, claiming one if it has none.
 *
 * Async because the claim has to be atomic against other operators; the
 * synchronous readers below serve the UI from the cache.
 */
export async function allocatePortForOperation(operationId: number | string): Promise<number | null> {
    const key = String(operationId);
    if (!key || key === '0') return null;

    await refreshAllocations();
    if (cache[key]) return cache[key];

    const taken = new Set(Object.values(cache));
    for (let p = MSF_SOCKS_PORT_MIN; p <= MSF_SOCKS_PORT_MAX; p++) {
        if (taken.has(p)) continue;
        if (await claimPort(p, key)) {
            cache[key] = p;
            return p;
        }
        // Lost the race for this port — someone claimed it between our read and
        // our write. That is exactly the case the blob ledger got wrong.
    }
    return null; // range exhausted
}

/** Drop this operation's mapping. Safe when no mapping exists. */
export async function releasePortForOperation(operationId: number | string): Promise<void> {
    const key = String(operationId);
    if (!key) return;
    const port = cache[key] ?? null;
    if (port === null) return;
    try {
        await apolloClient.mutate<any>({
            mutation: RELEASE_MSF_SOCKS_PORT,
            variables: { unique_id: msfSocksAllocUniqueId(port) },
        });
    } catch { /* the refresh below will show whether it stuck */ }
    delete cache[key];
    await refreshAllocations();
}

// ─── Synchronous readers (cache-backed) ─────────────────────────────────────

/** Read-only lookup — does not allocate. */
export function getPortForOperation(operationId: number | string): number | null {
    const key = String(operationId);
    if (!key) return null;
    return cache[key] ?? null;
}

/** Reverse lookup: operationId for a given port (used by the Tunnels page row). */
export function getOperationForPort(port: number): string | null {
    for (const [op, p] of Object.entries(cache)) {
        if (p === port) return op;
    }
    return null;
}

/** Whole map — used for diagnostic / management UI. */
export function getAllAllocations(): Allocation {
    return { ...cache };
}
