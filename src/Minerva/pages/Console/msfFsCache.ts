/**
 * msfFsCache — persistent cache of Metasploit-session filesystem listings.
 * The Mythic equivalent is the `mythictree` table populated by the agent:
 * the UI reads cached entries and only re-tasks `ls` when the operator
 * explicitly asks. We follow the same model but persist through Mythic's
 * `updateOperatorPreferences` mutation (via `lib/mythicKVStore.ts`) so
 * cached listings live in the Mythic operator-preferences blob alongside
 * real Mythic settings — survives across browsers and reloads.
 *
 * Storage key inside the Mythic prefs bag:
 *   minerva_msf_fs_<sessionId> → {
 *       cwd: string | null,
 *       listings: { [path: string]: { entries: FsEntry[]; listedAt: string } },
 *   }
 *
 * The in-memory cache stays mandatory — `useSyncExternalStore` cannot
 * tolerate re-parsing JSON on every getSnapshot call.
 */
import * as mythicKV from '../../lib/mythicKVStore';

export interface FsEntry {
    name: string;
    isDir: boolean;
    size?: number;
    mtime?: string;
    mode?: string;
}

export interface FsListing {
    /** Absolute path this listing represents. */
    path: string;
    /** Sorted, with `..` (if present) first. */
    entries: FsEntry[];
    /** ISO timestamp when the listing was captured. */
    listedAt: string;
}

interface FsState {
    cwd: string | null;
    listings: Record<string, FsListing>;
}

const KEY = (sessionId: string) => `minerva_msf_fs_${sessionId}`;

const EMPTY_STATE: Readonly<FsState> = Object.freeze({ cwd: null, listings: {} });

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, FsState>();

function emit(sessionId: string) {
    listeners.get(sessionId)?.forEach(fn => {
        try { fn(); } catch { /* swallow */ }
    });
}

function read(sessionId: string): FsState {
    const cached = cache.get(sessionId);
    if (cached) return cached;
    try {
        mythicKV.manageKey(KEY(sessionId));
        const raw = mythicKV.getItem(KEY(sessionId));
        const parsed = raw ? JSON.parse(raw) : null;
        const state: FsState = {
            cwd: parsed?.cwd ?? null,
            listings: parsed?.listings ?? {},
        };
        cache.set(sessionId, state);
        return state;
    } catch {
        const state: FsState = { cwd: null, listings: {} };
        cache.set(sessionId, state);
        return state;
    }
}

function write(sessionId: string, next: FsState) {
    cache.set(sessionId, next);
    mythicKV.manageKey(KEY(sessionId));
    mythicKV.setItem(KEY(sessionId), JSON.stringify(next));
}

// ── Path helpers ──────────────────────────────────────────────────────────

export function isWindowsPath(p: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\');
}

export function joinPath(base: string, child: string): string {
    if (!base) return child;
    if (child === '..') return parentPath(base);
    if (child === '.') return base;
    const win = isWindowsPath(base);
    const sep = win ? '\\' : '/';
    const trimmed = base.endsWith(sep) ? base.slice(0, -1) : base;
    // Allow absolute "C:\foo" or "/foo" as child to override.
    if (/^[A-Za-z]:[\\/]/.test(child) || child.startsWith('/')) return child;
    return `${trimmed}${sep}${child}`;
}

export function parentPath(p: string): string {
    if (!p) return p;
    const win = isWindowsPath(p);
    const sep = win ? '\\' : '/';
    // Root paths stay at root.
    if (win) {
        if (/^[A-Za-z]:[\\]?$/.test(p)) return p;
    } else {
        if (p === '/') return '/';
    }
    const norm = p.endsWith(sep) ? p.slice(0, -1) : p;
    const idx = norm.lastIndexOf(sep);
    if (idx < 0) return p;
    if (idx === 0 && !win) return '/';
    if (win && idx === 2) return norm.slice(0, 3); // "C:\"
    return norm.slice(0, idx);
}

// ── Public read API ───────────────────────────────────────────────────────

export function getState(sessionId: string): FsState {
    if (!sessionId) return EMPTY_STATE as FsState;
    return read(sessionId);
}

export function getCwd(sessionId: string): string | null {
    return read(sessionId).cwd;
}

export function getListing(sessionId: string, path: string): FsListing | undefined {
    return read(sessionId).listings[path];
}

export function subscribe(sessionId: string, fn: Listener): () => void {
    if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
    listeners.get(sessionId)!.add(fn);
    return () => listeners.get(sessionId)?.delete(fn);
}

// ── Public write API ──────────────────────────────────────────────────────

export function setCwd(sessionId: string, cwd: string | null) {
    const prev = read(sessionId);
    if (prev.cwd === cwd) return;
    write(sessionId, { ...prev, cwd });
    emit(sessionId);
}

export function setListing(sessionId: string, path: string, entries: FsEntry[]) {
    const prev = read(sessionId);
    const listing: FsListing = {
        path,
        entries,
        listedAt: new Date().toISOString(),
    };
    write(sessionId, {
        cwd: prev.cwd,
        listings: { ...prev.listings, [path]: listing },
    });
    emit(sessionId);
}

export function deleteListing(sessionId: string, path: string) {
    const prev = read(sessionId);
    if (!(path in prev.listings)) return;
    const { [path]: _, ...rest } = prev.listings;
    write(sessionId, { cwd: prev.cwd, listings: rest });
    emit(sessionId);
}

export function clearAll(sessionId: string) {
    write(sessionId, { cwd: null, listings: {} });
    emit(sessionId);
}

// ── Output parsers ────────────────────────────────────────────────────────

function stripAnsi(s: string) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Parse meterpreter `ls` output (or `ls -la` for shell sessions).
 * Returns the parsed entries and, when present, the path the listing
 * was captured for (from meterpreter's `Listing: <path>` header).
 */
export function parseLsOutput(raw: string): { entries: FsEntry[]; listingPath: string | null } {
    const text = stripAnsi(raw);
    const lines = text.split('\n');
    let listingPath: string | null = null;
    const entries: FsEntry[] = [];
    let inTable = false;
    let columnsOk = false;
    let parentSeen = false;

    for (const lineRaw of lines) {
        const line = lineRaw.replace(/\r$/, '');
        if (!listingPath) {
            const m = /^Listing:\s+(.+)$/.exec(line.trim());
            if (m) { listingPath = m[1].trim(); continue; }
        }
        if (!inTable && /^Mode\s+Size\s+Type/i.test(line)) { inTable = true; continue; }
        if (inTable && /^----+\s+/.test(line)) { columnsOk = true; continue; }
        if (inTable && columnsOk) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const tok = trimmed.split(/\s+/);
            if (tok.length < 6) continue;
            const mode = tok[0];
            const sizeStr = tok[1];
            const type = tok[2];
            const dateTokens = tok.slice(3, 6).join(' ');
            const name = tok.slice(6).join(' ').trim();
            if (!name || name === '.') continue;
            if (name === '..') {
                if (!parentSeen) {
                    entries.unshift({ name: '..', isDir: true });
                    parentSeen = true;
                }
                continue;
            }
            const isDir = /^dir/i.test(type);
            const size = isNaN(Number(sizeStr)) ? undefined : Number(sizeStr);
            entries.push({ name, isDir, size, mtime: dateTokens, mode });
        }
    }

    // POSIX `ls -la` fallback for shell sessions.
    if (entries.length === 0) {
        for (const line of lines) {
            const m = /^([dl-])([rwx\-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/.exec(line.trim());
            if (!m) continue;
            const typeCh = m[1];
            const name = m[5];
            if (name === '.') continue;
            if (name === '..') {
                if (!parentSeen) { entries.unshift({ name: '..', isDir: true }); parentSeen = true; }
                continue;
            }
            entries.push({ name, isDir: typeCh === 'd', size: Number(m[3]), mtime: m[4] });
        }
    }
    return { entries, listingPath };
}

/** Parse meterpreter `pwd` output → first path-looking line. */
export function parsePwdOutput(raw: string): string | null {
    const text = stripAnsi(raw);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (/^([A-Za-z]:\\|\/)/.test(line)) return line;
    }
    return null;
}
