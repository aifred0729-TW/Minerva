/**
 * msfPsCache — persistent cache of `ps` output per MSF session.
 * Mirrors Mythic's `mythictree` (tree_type='process') pattern and is
 * persisted via the Mythic operator-preferences blob (see
 * `lib/mythicKVStore.ts`) so snapshots survive across browsers / reloads
 * the same way Mythic settings do.
 */
import * as mythicKV from '../../lib/mythicKVStore';

export interface MsfProc {
    pid: number;
    ppid: number;
    name: string;
    arch?: string;
    sessionField?: string;
    user?: string;
    path?: string;
}

export interface MsfPsSnapshot {
    procs: MsfProc[];
    capturedAt: string;
}

const KEY = (sessionId: string) => `minerva_msf_ps_${sessionId}`;

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, MsfPsSnapshot | null>();

function emit(sessionId: string) {
    listeners.get(sessionId)?.forEach(fn => {
        try { fn(); } catch { /* swallow */ }
    });
}

function read(sessionId: string): MsfPsSnapshot | null {
    if (cache.has(sessionId)) return cache.get(sessionId) ?? null;
    mythicKV.manageKey(KEY(sessionId));
    try {
        const raw = mythicKV.getItem(KEY(sessionId));
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && Array.isArray(parsed.procs) && typeof parsed.capturedAt === 'string') {
            cache.set(sessionId, parsed as MsfPsSnapshot);
            return parsed;
        }
        cache.set(sessionId, null);
        return null;
    } catch {
        cache.set(sessionId, null);
        return null;
    }
}

function write(sessionId: string, snapshot: MsfPsSnapshot | null) {
    cache.set(sessionId, snapshot);
    mythicKV.manageKey(KEY(sessionId));
    if (snapshot) mythicKV.setItem(KEY(sessionId), JSON.stringify(snapshot));
    else mythicKV.removeItem(KEY(sessionId));
}

export function subscribe(sessionId: string, fn: Listener): () => void {
    if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
    listeners.get(sessionId)!.add(fn);
    return () => listeners.get(sessionId)?.delete(fn);
}

export function getSnapshot(sessionId: string): MsfPsSnapshot | null {
    if (!sessionId) return null;
    return read(sessionId);
}

export function setSnapshot(sessionId: string, procs: MsfProc[]) {
    write(sessionId, { procs, capturedAt: new Date().toISOString() });
    emit(sessionId);
}

export function clearSnapshot(sessionId: string) {
    write(sessionId, null);
    emit(sessionId);
}

// ── Output parser ─────────────────────────────────────────────────────────

function stripAnsi(s: string) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Parse meterpreter `ps` output. Column widths are not fixed — we anchor on
 * the dashed underline row to determine each column's start offset.
 */
export function parsePsOutput(raw: string): MsfProc[] {
    const text = stripAnsi(raw);
    const lines = text.split('\n');
    let dashLine: string | null = null;
    let dataStart = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*PID\s+PPID\s+Name/i.test(lines[i])) {
            for (let j = i + 1; j < lines.length; j++) {
                if (/^[\s-]+$/.test(lines[j]) && lines[j].includes('---')) {
                    dashLine = lines[j];
                    dataStart = j + 1;
                    break;
                }
            }
            break;
        }
    }
    if (!dashLine || dataStart < 0) return [];

    const colStarts: number[] = [];
    let inDash = false;
    for (let i = 0; i < dashLine.length; i++) {
        const ch = dashLine[i];
        if (ch === '-' && !inDash) { colStarts.push(i); inDash = true; }
        else if (ch !== '-') { inDash = false; }
    }
    if (colStarts.length < 3) return [];

    const slice = (line: string, idx: number) => {
        const s = colStarts[idx];
        const e = idx + 1 < colStarts.length ? colStarts[idx + 1] : line.length;
        return line.slice(s, e).trim();
    };

    const out: MsfProc[] = [];
    for (let i = dataStart; i < lines.length; i++) {
        const l = lines[i];
        if (!l.trim()) continue;
        if (/^Process List/i.test(l)) continue;
        const pid = parseInt(slice(l, 0), 10);
        if (isNaN(pid)) continue;
        const ppid = parseInt(slice(l, 1), 10);
        out.push({
            pid,
            ppid: isNaN(ppid) ? 0 : ppid,
            name: colStarts.length > 2 ? slice(l, 2) : '',
            arch: colStarts.length > 3 ? slice(l, 3) || undefined : undefined,
            sessionField: colStarts.length > 4 ? slice(l, 4) || undefined : undefined,
            user: colStarts.length > 5 ? slice(l, 5) || undefined : undefined,
            path: colStarts.length > 6 ? slice(l, 6) || undefined : undefined,
        });
    }
    return out;
}
