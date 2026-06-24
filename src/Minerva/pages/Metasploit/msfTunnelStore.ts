/**
 * MSF Tunnel Store — one SOCKS tunnel per Mythic operation.
 *
 * Each operation has at most one record: a single host port (allocated
 * by msfSocksAllocator) and a map of meterpreter sessionIds → the
 * subnets currently `route add`-ed via that session. The SOCKS server
 * running on the operation's port consults MSF's global route table on
 * every incoming connection, so one port can pivot through every
 * session whose routes are present.
 *
 * Persistence: mythicKVStore, mirrors the pattern in msfTaskStore.ts.
 *
 * Subscriptions:
 *   - subscribe(fn)            → any change to any operation's tunnel
 *   - useMsfOperationTunnel(op) → live record for a single operation
 *   - useAllMsfTunnels()       → live list of all operation tunnels
 */
import * as mythicKV from '../../lib/mythicKVStore';
import { useSyncExternalStore } from 'react';

export interface MsfSessionRoutes {
    /** Each entry is a CIDR. Operator can edit per session. */
    subnets: string[];
    /** ISO timestamp the session was attached to this tunnel. */
    attachedAt: string;
}

export interface MsfOperationTunnel {
    operationId: string;
    port: number;
    /** MSF job id of the socks_proxy auxiliary, or null until parsed. */
    jobId: string | null;
    /** sessionId → routed subnets. */
    sessions: Record<string, MsfSessionRoutes>;
    /** ISO timestamp when the SOCKS server first came up for this op. */
    startedAt: string;
}

const KEY = 'minerva_msf_socks_op_tunnels';
const EMPTY: readonly MsfOperationTunnel[] = Object.freeze([]);

let cache: MsfOperationTunnel[] | null = null;
const listeners = new Set<() => void>();

function readAll(): MsfOperationTunnel[] {
    if (cache) return cache;
    mythicKV.manageKey(KEY);
    try {
        const raw = mythicKV.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        cache = Array.isArray(parsed) ? parsed : [];
    } catch {
        cache = [];
    }
    return cache;
}

function writeAll(next: MsfOperationTunnel[]): void {
    // Skip if the serialised payload is byte-identical to what we already
    // have. mythicKVStore's `setItem` already has a "same value, no flush"
    // guard but it still records the write; the real cost we want to
    // avoid is the listener fan-out, which makes every component using
    // useAllMsfTunnels re-render.
    const serialised = JSON.stringify(next);
    const prev = cache ? JSON.stringify(cache) : null;
    if (serialised === prev) return;
    cache = next.slice();
    mythicKV.manageKey(KEY);
    mythicKV.setItem(KEY, serialised);
    listeners.forEach(fn => { try { fn(); } catch { /* swallow */ } });
}

export function getAllTunnels(): MsfOperationTunnel[] {
    return readAll();
}

export function getTunnelForOperation(operationId: number | string): MsfOperationTunnel | undefined {
    const key = String(operationId);
    return readAll().find(t => t.operationId === key);
}

export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Create or update an operation tunnel record. */
export function upsertTunnel(record: MsfOperationTunnel): void {
    const list = readAll();
    const idx = list.findIndex(t => t.operationId === record.operationId);
    const next = list.slice();
    if (idx >= 0) next[idx] = { ...next[idx], ...record };
    else next.push(record);
    writeAll(next);
}

/** Remove the entire operation tunnel (used by stopOperationSocks). */
export function removeTunnel(operationId: number | string): void {
    const key = String(operationId);
    const list = readAll();
    const next = list.filter(t => t.operationId !== key);
    if (next.length === list.length) return;
    writeAll(next);
}

/** Replace job id once parsed from console output. */
export function setJobId(operationId: number | string, jobId: string | null): void {
    const key = String(operationId);
    const list = readAll();
    const idx = list.findIndex(t => t.operationId === key);
    if (idx < 0) return;
    const next = list.slice();
    next[idx] = { ...next[idx], jobId };
    writeAll(next);
}

/** Attach (or replace) a session's routed subnets on the operation tunnel. */
export function setSessionRoutes(operationId: number | string, sessionId: string, subnets: string[]): void {
    const key = String(operationId);
    const list = readAll();
    const idx = list.findIndex(t => t.operationId === key);
    if (idx < 0) return;
    const tunnel = list[idx];
    const prev = tunnel.sessions[sessionId];
    const cleaned = [...new Set(subnets)].sort();
    // Same subnets → bail out before allocating new objects so the
    // listeners don't fire and the KV doesn't churn. Compare by joined
    // string since both inputs are already sorted+deduped.
    if (prev && prev.subnets.length === cleaned.length && prev.subnets.join(',') === cleaned.join(',')) {
        return;
    }
    const nextSessions = {
        ...tunnel.sessions,
        [sessionId]: {
            subnets: cleaned,
            attachedAt: prev?.attachedAt ?? new Date().toISOString(),
        },
    };
    const next = list.slice();
    next[idx] = { ...tunnel, sessions: nextSessions };
    writeAll(next);
}

/** Detach a session from the operation tunnel. */
export function removeSession(operationId: number | string, sessionId: string): void {
    const key = String(operationId);
    const list = readAll();
    const idx = list.findIndex(t => t.operationId === key);
    if (idx < 0) return;
    const tunnel = list[idx];
    if (!tunnel.sessions[sessionId]) return;
    const { [sessionId]: _gone, ...rest } = tunnel.sessions;
    const next = list.slice();
    next[idx] = { ...tunnel, sessions: rest };
    writeAll(next);
}

// ─── React bindings ─────────────────────────────────────────────────────────

export function useAllMsfTunnels(): MsfOperationTunnel[] {
    return useSyncExternalStore(subscribe, getAllTunnels, () => EMPTY as MsfOperationTunnel[]);
}

export function useMsfOperationTunnel(operationId: number | string | undefined | null): MsfOperationTunnel | undefined {
    const all = useAllMsfTunnels();
    if (operationId == null || operationId === 0 || operationId === '0') return undefined;
    const key = String(operationId);
    return all.find(t => t.operationId === key);
}

// ─── Compat: re-export old names so existing callers keep compiling
//     while we migrate them. These map to the per-operation model: a
//     "tunnel for session X" is really the operation tunnel that has
//     attached session X. Once all callers are migrated we can drop
//     these. ────────────────────────────────────────────────────────────────

/** @deprecated use useAllMsfTunnels for the operation tunnels. */
export const useMsfTunnels = useAllMsfTunnels;
