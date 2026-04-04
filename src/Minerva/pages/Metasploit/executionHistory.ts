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
