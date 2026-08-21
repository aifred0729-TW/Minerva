/**
 * Per-host defence marks for the 3D topology's detail panel.
 *
 * Mythic reports none of this: there is no field for "is Defender still
 * running on this box" or "did we punch a hole in the firewall". The
 * operator is the one who knows — they ran the command. So these two are
 * marks the operator sets on the host, and Minerva's job is to remember
 * them and put them where the next glance lands.
 *
 * (The third state in the panel — privilege — is NOT stored here. It is
 * derived live from the callback's integrity level, because Mythic does
 * report that and a stored copy would go stale.)
 *
 * Storage rides on `mythicKV`, exactly like the hidden-subnet list: a
 * localStorage mirror for instant reads after reload, flushed up into the
 * Mythic operator-preferences blob so the marks follow the operator across
 * browsers and get reset by the same "reset preferences" affordance.
 */
import { useSyncExternalStore } from 'react';
import * as mythicKV from '../../lib/mythicKVStore';

export type DefenseState = 'unknown' | 'bypassed' | 'active';

export interface HostDefense {
    /** Anti-virus / EDR on the host. */
    av: DefenseState;
    /** Host firewall. */
    fw: DefenseState;
}

const KEY = 'minerva_topology3d_defense_marks';
const EMPTY: HostDefense = { av: 'unknown', fw: 'unknown' };

/** Hosts are the node identity in this view, so the mark is keyed by host
 *  name — every callback on the same machine shares one set of marks. */
export const hostKeyOf = (host?: string | null): string =>
    String(host ?? '').trim().toLowerCase();

// `useSyncExternalStore` demands a stable snapshot reference between
// changes, so the parsed bag is cached against the raw string it came from.
let cachedRaw: string | null = null;
let cachedBag: Record<string, HostDefense> = {};

function readAll(): Record<string, HostDefense> {
    let raw: string | null = null;
    try { raw = mythicKV.getItem(KEY); } catch { raw = null; }
    if (raw === cachedRaw) return cachedBag;
    let parsed: Record<string, HostDefense> = {};
    try {
        const obj = raw ? JSON.parse(raw) : {};
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) parsed = obj;
    } catch { /* corrupt bag — start clean rather than blowing up the panel */ }
    cachedRaw = raw;
    cachedBag = parsed;
    return parsed;
}

// Per-host snapshots are memoised against the same raw string, because
// `useSyncExternalStore` re-renders forever if getSnapshot hands back a new
// object every call.
let derivedRaw: string | null | undefined;
const derived = new Map<string, HostDefense>();

const normalise = (v: unknown): DefenseState =>
    v === 'bypassed' || v === 'active' ? v : 'unknown';

export function getDefense(hostKey: string): HostDefense {
    if (!hostKey) return EMPTY;
    const bag = readAll();
    if (derivedRaw !== cachedRaw) {
        derived.clear();
        derivedRaw = cachedRaw;
    }
    const hit = derived.get(hostKey);
    if (hit) return hit;
    const entry = bag[hostKey];
    const value: HostDefense = entry
        ? { av: normalise(entry.av), fw: normalise(entry.fw) }
        : EMPTY;
    derived.set(hostKey, value);
    return value;
}

function writeAll(bag: Record<string, HostDefense>): void {
    mythicKV.manageKey(KEY);
    mythicKV.setItem(KEY, JSON.stringify(bag));
}

/** UNKNOWN → BYPASSED → ACTIVE → UNKNOWN. Cycling (rather than a plain
 *  toggle) keeps "not assessed" reachable, so a mis-click is recoverable
 *  and an unassessed host never has to pretend it is one or the other. */
export function cycleDefense(hostKey: string, field: keyof HostDefense): void {
    if (!hostKey) return;
    const bag = { ...readAll() };
    const current = getDefense(hostKey);
    const next: DefenseState =
        current[field] === 'unknown' ? 'bypassed'
        : current[field] === 'bypassed' ? 'active'
        : 'unknown';
    const entry: HostDefense = { ...current, [field]: next };
    if (entry.av === 'unknown' && entry.fw === 'unknown') delete bag[hostKey];
    else bag[hostKey] = entry;
    writeAll(bag);
}

export function clearDefense(hostKey: string): void {
    if (!hostKey) return;
    const bag = { ...readAll() };
    if (!(hostKey in bag)) return;
    delete bag[hostKey];
    writeAll(bag);
}

/** Reactive read for the detail panel. */
export function useHostDefense(hostKey: string): HostDefense {
    return useSyncExternalStore(
        cb => mythicKV.subscribe(KEY, cb),
        () => getDefense(hostKey),
        () => EMPTY,
    );
}
