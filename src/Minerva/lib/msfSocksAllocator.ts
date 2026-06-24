/**
 * Port allocator for the MSF SOCKS tunnel — one port per Mythic
 * **operation**, not per meterpreter session.
 *
 * Why per-operation:
 *   - The Metasploit `auxiliary/server/socks_proxy` module looks up the
 *     route table on every incoming connection; one running proxy can
 *     serve all sessions whose routes are present. So a single port can
 *     dynamically cover everything Minerva pivots through.
 *   - Tying the port to a Mythic operation makes the assignment stable:
 *     teammates working on the same engagement share the port,
 *     proxychains4 config doesn't change when sessions come and go,
 *     different operations get distinct ports for blast-radius isolation.
 *
 * Range 7100-7131 is published by `docker-compose.metasploit.yml`. The
 * range starts at 7100 to leave Mythic's own SOCKS range (7000-7010 by
 * default in `mythic_server`) untouched.
 *
 * Persistence: Mythic operator preferences via mythicKVStore, so the
 * mapping survives reload and follows the operator across browsers.
 */
import * as mythicKV from './mythicKVStore';

export const MSF_SOCKS_PORT_MIN = 7100;
export const MSF_SOCKS_PORT_MAX = 7131;

const KEY = 'minerva_msf_socks_alloc';

type Allocation = Record<string, number>; // operationId (string) → port

function read(): Allocation {
    mythicKV.manageKey(KEY);
    try {
        const raw = mythicKV.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed as Allocation : {};
    } catch {
        return {};
    }
}

function write(next: Allocation): void {
    mythicKV.manageKey(KEY);
    mythicKV.setItem(KEY, JSON.stringify(next));
}

/** Returns the port for an operation, allocating one if it doesn't have one yet. */
export function allocatePortForOperation(operationId: number | string): number | null {
    const key = String(operationId);
    if (!key || key === '0') return null;
    const map = read();
    if (map[key]) return map[key];
    const taken = new Set(Object.values(map));
    for (let p = MSF_SOCKS_PORT_MIN; p <= MSF_SOCKS_PORT_MAX; p++) {
        if (!taken.has(p)) {
            map[key] = p;
            write(map);
            return p;
        }
    }
    return null; // range exhausted
}

/** Drop the mapping for an operation. Safe to call when no mapping exists. */
export function releasePortForOperation(operationId: number | string): void {
    const key = String(operationId);
    if (!key) return;
    const map = read();
    if (!(key in map)) return;
    delete map[key];
    write(map);
}

/** Read-only lookup — does not allocate. */
export function getPortForOperation(operationId: number | string): number | null {
    const key = String(operationId);
    if (!key) return null;
    const map = read();
    return map[key] ?? null;
}

/** Reverse lookup: operationId for a given port (used by the Tunnels page row). */
export function getOperationForPort(port: number): string | null {
    const map = read();
    for (const [op, p] of Object.entries(map)) {
        if (p === port) return op;
    }
    return null;
}

/** Whole map — used for diagnostic / management UI. */
export function getAllAllocations(): Allocation {
    return { ...read() };
}
