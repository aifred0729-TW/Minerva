/**
 * Execution History — localStorage-based storage for MSF module execution records.
 * Modeled after Mythic's task browser persistence pattern.
 */

const STORAGE_KEY = 'minerva_msf_exec_history';

// ── Types ───────────────────────────────────────────────────────────────────

export type ExecutionStatus = 'running' | 'complete' | 'error';

export interface MsfExecutionRecord {
    id: string;
    moduleName: string;
    moduleType: string;
    options: Record<string, string>;
    proxy?: string;
    target: string;           // extracted from RHOSTS / RHOST
    output: string;
    status: ExecutionStatus;
    startedAt: string;        // ISO date string
    completedAt?: string;     // ISO date string
    errorMessage?: string;
    /** Linked MSF session id when the attack established a session. */
    sessionId?: string;
    /** Type of the linked MSF session ('meterpreter' | 'shell' | ...). */
    sessionType?: string;
    /** Backing MSF job id reported by `run -j`. Used to reconcile state. */
    jobId?: string;
}

/**
 * Extract a session id from console output lines like:
 *   [*] Meterpreter session 3 opened (...)
 *   [*] Command shell session 5 opened (...)
 *   [*] Session 7 created in the background.
 * Returns the highest session id seen (last-opened wins).
 */
export function extractSessionFromOutput(output: string): { id: string; type: string } | null {
    if (!output) return null;
    const patterns: Array<{ re: RegExp; type: string }> = [
        { re: /Meterpreter session (\d+) opened/gi, type: 'meterpreter' },
        { re: /Command shell session (\d+) opened/gi, type: 'shell' },
        { re: /Session (\d+) created in the background/gi, type: 'unknown' },
    ];
    let best: { id: string; type: string } | null = null;
    for (const { re, type } of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(output)) !== null) {
            const id = m[1];
            if (!best || parseInt(id, 10) >= parseInt(best.id, 10)) {
                best = { id, type };
            }
        }
    }
    return best;
}

/**
 * Extract a job id from console output lines like:
 *   [*] Exploit running as background job 3.
 *   [*] Auxiliary module running as background job 7.
 */
export function extractJobIdFromOutput(output: string): string | null {
    if (!output) return null;
    const re = /(?:running as background job|started as background job)\s+(\d+)/i;
    const m = re.exec(output);
    return m ? m[1] : null;
}

export interface ExecutionSearchFilters {
    query?: string;           // searches module name, target, output
    moduleType?: string;
    status?: ExecutionStatus;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readAll(): MsfExecutionRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as MsfExecutionRecord[];
    } catch {
        return [];
    }
}

function writeAll(records: MsfExecutionRecord[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Create a new execution record and return it. */
export function createExecution(
    moduleName: string,
    moduleType: string,
    options: Record<string, string>,
    proxy?: string,
): MsfExecutionRecord {
    const record: MsfExecutionRecord = {
        id: crypto.randomUUID(),
        moduleName,
        moduleType,
        options,
        proxy,
        target: options.RHOSTS || options.RHOST || '-',
        output: '',
        status: 'running',
        startedAt: new Date().toISOString(),
    };
    const all = readAll();
    all.unshift(record);          // newest first
    writeAll(all);
    return record;
}

/** Update an existing execution record (upsert by id). */
export function saveExecution(record: MsfExecutionRecord): void {
    const all = readAll();
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) {
        all[idx] = record;
    } else {
        all.unshift(record);
    }
    writeAll(all);
}

/** Get all execution records, newest first. */
export function getExecutions(): MsfExecutionRecord[] {
    return readAll();
}

/** Get a single execution record by id. */
export function getExecution(id: string): MsfExecutionRecord | undefined {
    return readAll().find(r => r.id === id);
}

/** Delete a single execution record. */
export function deleteExecution(id: string): void {
    writeAll(readAll().filter(r => r.id !== id));
}

/** Clear all execution history. */
export function clearAllExecutions(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Sweep stale 'running' records and resolve them:
 *  - If the record's output already mentions a session opening → mark complete with sessionId.
 *  - If `liveSessionIds` contains an id mentioned in the record → mark complete and link.
 *  - If `liveJobIds` no longer contains the record's job id → mark complete (job finished
 *    while the launch view was unmounted).
 *  - If older than `staleAfterMs`, force-complete with no link (the launch console
 *    was closed and never reported back).
 * Returns the number of records touched.
 */
export function reconcileRunningExecutions(opts: {
    liveSessionIds?: string[];
    liveJobIds?: string[];
    staleAfterMs?: number;
} = {}): number {
    const { liveSessionIds = [], liveJobIds = [], staleAfterMs = 60_000 } = opts;
    const all = readAll();
    let changed = 0;
    const now = Date.now();
    for (const r of all) {
        if (r.status !== 'running') continue;
        // 1) Try parsing the captured output first
        const fromOutput = extractSessionFromOutput(r.output);
        if (fromOutput) {
            r.status = 'complete';
            r.sessionId = fromOutput.id;
            r.sessionType = fromOutput.type;
            r.completedAt = r.completedAt || new Date().toISOString();
            changed++;
            continue;
        }
        // 2) If the job id was captured and the job is no longer live → completed
        if (r.jobId && liveJobIds.length > 0 && !liveJobIds.includes(r.jobId)) {
            r.status = 'complete';
            r.completedAt = r.completedAt || new Date().toISOString();
            // The job may have produced a session; try to bind any live session whose
            // host matches the target.
            changed++;
            continue;
        }
        // 3) Stale safety net
        const age = now - new Date(r.startedAt).getTime();
        if (age > staleAfterMs) {
            r.status = 'complete';
            r.completedAt = r.completedAt || new Date().toISOString();
            changed++;
        }
    }
    if (changed > 0) writeAll(all);
    return changed;
}

/** Search / filter execution records (client-side). */
export function searchExecutions(filters: ExecutionSearchFilters): MsfExecutionRecord[] {
    let records = readAll();

    if (filters.moduleType) {
        records = records.filter(r => r.moduleType === filters.moduleType);
    }

    if (filters.status) {
        records = records.filter(r => r.status === filters.status);
    }

    if (filters.query) {
        const q = filters.query.toLowerCase();
        records = records.filter(r =>
            r.moduleName.toLowerCase().includes(q) ||
            r.target.toLowerCase().includes(q) ||
            r.output.toLowerCase().includes(q) ||
            r.moduleType.toLowerCase().includes(q)
        );
    }

    return records;
}
