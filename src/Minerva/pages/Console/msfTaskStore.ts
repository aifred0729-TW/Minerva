/**
 * MSF Task Store — local persistence for Metasploit session operations.
 *
 * Every command an operator types into an MSF session is recorded as a
 * Mythic-shaped task record (timestamp, operator, callback, command,
 * output, status). This keeps the operator's workflow identical to
 * Mythic: scroll back, audit who-did-what, copy past commands, etc.
 *
 * Storage:
 *   localStorage["minerva_msf_tasks_<sessionId>"] = MsfTaskRecord[]
 *
 * Subscription:
 *   subscribe(sessionId, fn) → unsubscribe
 *   The store fires after every mutation so React components can
 *   re-pull via useSyncExternalStore.
 */

import * as mythicKV from '../../lib/mythicKVStore';

export type MsfTaskStatus = 'submitted' | 'running' | 'completed' | 'error';

export type MsfTaskOrigin = 'console' | 'file-browser' | 'process-list' | 'sidekick';

export interface MsfTaskRecord {
    /** Stable UUID for the task. */
    id: string;
    /** Sequential display id, 1-based within the session. */
    display_id: number;
    /** MSF session id that this task targets. */
    session_id: string;
    /** Session type at task creation ('meterpreter' | 'shell' | ...). */
    session_type: string;
    /** The literal command operator typed (or the synthesised one for sidebar features). */
    command: string;
    /** Optional params field (kept for parity with Mythic Task shape). */
    params: string;
    /** Who launched it. */
    operator_username: string;
    /** Which Minerva-side surface created the task. */
    origin: MsfTaskOrigin;
    /** ISO timestamp when operator submitted. */
    started_at: string;
    /** ISO timestamp when output stopped flowing / task was marked complete. */
    completed_at?: string;
    /** Output text accumulated from MSF-RPC reads. */
    response_text: string;
    /** Current state. */
    status: MsfTaskStatus;
    /** Optional human note (e.g. autoclose reason). */
    note?: string;
}

const KEY = (sessionId: string) => `minerva_msf_tasks_${sessionId}`;
const MAX_TASKS_PER_SESSION = 500;
const EMPTY: readonly MsfTaskRecord[] = Object.freeze([]);

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

/**
 * In-memory snapshot cache. `useSyncExternalStore`'s `getSnapshot` must
 * return the same reference between calls when nothing has changed —
 * reading + parsing localStorage on every call would generate a fresh
 * array each time and send React into an infinite re-render loop.
 */
const cache = new Map<string, MsfTaskRecord[]>();

function emit(sessionId: string) {
    listeners.get(sessionId)?.forEach(fn => {
        try { fn(); } catch { /* swallow */ }
    });
}

/** Return the cached array reference, hydrating from the Mythic KV store on first miss. */
function readAll(sessionId: string): MsfTaskRecord[] {
    const cached = cache.get(sessionId);
    if (cached) return cached;
    mythicKV.manageKey(KEY(sessionId));
    try {
        const raw = mythicKV.getItem(KEY(sessionId));
        const parsed = raw ? JSON.parse(raw) : [];
        const arr: MsfTaskRecord[] = Array.isArray(parsed) ? parsed : [];
        cache.set(sessionId, arr);
        return arr;
    } catch {
        cache.set(sessionId, []);
        return cache.get(sessionId)!;
    }
}

/**
 * Replace the snapshot with a fresh array reference (so React sees a change)
 * and persist through the Mythic KV store. Callers should always hand us a
 * new array, but we copy defensively to be safe.
 */
function writeAll(sessionId: string, tasks: MsfTaskRecord[]) {
    const sliced = tasks.length > MAX_TASKS_PER_SESSION
        ? tasks.slice(tasks.length - MAX_TASKS_PER_SESSION)
        : tasks.slice();
    cache.set(sessionId, sliced);
    mythicKV.manageKey(KEY(sessionId));
    mythicKV.setItem(KEY(sessionId), JSON.stringify(sliced));
}

export function getTasks(sessionId: string): MsfTaskRecord[] {
    if (!sessionId) return EMPTY as MsfTaskRecord[];
    return readAll(sessionId);
}

export function subscribe(sessionId: string, fn: Listener): () => void {
    if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
    listeners.get(sessionId)!.add(fn);
    return () => {
        listeners.get(sessionId)?.delete(fn);
    };
}

export interface CreateTaskInput {
    sessionId: string;
    sessionType: string;
    command: string;
    params?: string;
    operator: string;
    origin?: MsfTaskOrigin;
}

export function createTask(input: CreateTaskInput): MsfTaskRecord {
    const tasks = readAll(input.sessionId);
    const nextDisplayId = (tasks[tasks.length - 1]?.display_id ?? 0) + 1;
    const record: MsfTaskRecord = {
        id: crypto.randomUUID(),
        display_id: nextDisplayId,
        session_id: input.sessionId,
        session_type: input.sessionType,
        command: input.command,
        params: input.params ?? '',
        operator_username: input.operator,
        origin: input.origin ?? 'console',
        started_at: new Date().toISOString(),
        response_text: '',
        status: 'submitted',
    };
    tasks.push(record);
    writeAll(input.sessionId, tasks);
    emit(input.sessionId);
    return record;
}

export function appendOutput(sessionId: string, taskId: string, chunk: string): void {
    if (!chunk) return;
    const tasks = readAll(sessionId);
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    t.response_text += chunk;
    if (t.status === 'submitted') t.status = 'running';
    writeAll(sessionId, tasks);
    emit(sessionId);
}

export function markStatus(sessionId: string, taskId: string, status: MsfTaskStatus, note?: string): void {
    const tasks = readAll(sessionId);
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    t.status = status;
    if (status === 'completed' || status === 'error') {
        t.completed_at = t.completed_at || new Date().toISOString();
    }
    if (note) t.note = note;
    writeAll(sessionId, tasks);
    emit(sessionId);
}

export function deleteTask(sessionId: string, taskId: string): void {
    const tasks = readAll(sessionId).filter(t => t.id !== taskId);
    writeAll(sessionId, tasks);
    emit(sessionId);
}

export function clearTasks(sessionId: string): void {
    writeAll(sessionId, []);
    emit(sessionId);
}

/**
 * Find the most-recent task that's still accepting output.
 * Used by the output poller to attribute fresh data to the right command.
 */
export function getActiveTask(sessionId: string): MsfTaskRecord | undefined {
    const tasks = readAll(sessionId);
    for (let i = tasks.length - 1; i >= 0; i--) {
        const t = tasks[i];
        if (t.status === 'submitted' || t.status === 'running') return t;
    }
    return undefined;
}
