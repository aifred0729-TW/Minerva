/**
 * MsfProcessList — meterpreter `ps` output, parsed into a table.
 *
 * Reads from msfPsCache (the Mythic mythictree-for-processes analogue).
 * Mounting the tab does NOT trigger a new `ps`; it only fires when the
 * cache is empty or the operator hits Refresh. Each refresh is a recorded
 * task in msfTaskStore so the audit log shows when and by whom.
 */
import React, { useCallback, useMemo, useState, useSyncExternalStore, useEffect } from 'react';
import {
    RefreshCw, Loader2, AlertTriangle, Search, Activity, Cpu, Clock, Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMsfSession } from './useMsfSession';
import type { MsfSession } from '../Metasploit/msfrpc';
import {
    getSnapshot, setSnapshot, clearSnapshot, subscribe as subscribePs,
    parsePsOutput, type MsfPsSnapshot,
} from './msfPsCache';

interface Props {
    sessionId: string;
    session: MsfSession | null;
}

function ago(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
    return new Date(iso).toLocaleString();
}

export function MsfProcessList({ sessionId, session }: Props) {
    const sessionType = session?.type || 'meterpreter';
    const isMeterpreter = sessionType === 'meterpreter';
    const { runAndWait } = useMsfSession(sessionId, sessionType, true);

    // ── Subscribe to the local ps cache ────────────────────────────────────
    const snapshot = useSyncExternalStore<MsfPsSnapshot | null>(
        useCallback((cb: () => void) => subscribePs(sessionId, cb), [sessionId]),
        useCallback(() => getSnapshot(sessionId), [sessionId]),
        useCallback(() => getSnapshot(sessionId), [sessionId]),
    );

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [killBusy, setKillBusy] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        if (!isMeterpreter) {
            setError('Process listing is only supported on meterpreter sessions.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const task = await runAndWait('ps', { origin: 'process-list', timeoutMs: 30_000 });
            const parsed = parsePsOutput(task.response_text);
            setSnapshot(sessionId, parsed);
            if (parsed.length === 0) setError('Empty process list — try refreshing again.');
        } catch (e: any) {
            setError(e?.message || 'Failed to query process list');
        } finally {
            setLoading(false);
        }
    }, [runAndWait, isMeterpreter, sessionId]);

    // First-load only fires when the cache is empty. Switching tabs back
    // does NOT re-trigger ps.
    useEffect(() => {
        if (isMeterpreter && !snapshot && !loading) {
            void refresh();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, isMeterpreter]);

    const handleKill = useCallback(async (pid: number) => {
        if (!window.confirm(`Kill process ${pid}?`)) return;
        setKillBusy(pid);
        try {
            await runAndWait(`kill ${pid}`, { origin: 'process-list', timeoutMs: 10_000 });
            await refresh();
        } finally {
            setKillBusy(null);
        }
    }, [runAndWait, refresh]);

    const procs = snapshot?.procs ?? [];
    const filtered = useMemo(() => {
        if (!query.trim()) return procs;
        const q = query.toLowerCase();
        return procs.filter(p =>
            String(p.pid).includes(q) ||
            String(p.ppid).includes(q) ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.user || '').toLowerCase().includes(q) ||
            (p.path || '').toLowerCase().includes(q)
        );
    }, [procs, query]);

    if (!isMeterpreter) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-signal font-mono">
                <Cpu size={24} className="text-signal/80" />
                <div className="text-xs">Process listing requires a meterpreter session.</div>
                <div className="text-[10px] text-signal/80">Use the terminal directly (e.g. <span className="text-accent">ps -ef</span>).</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-2 min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border border-signal/15 bg-machine/40 rounded-md px-2 py-1.5 shrink-0">
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="p-1 text-signal hover:text-accent disabled:opacity-40 transition-colors"
                    title="Re-run ps (creates a task)"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
                <span className="flex items-center gap-1 text-[11px] font-mono text-signal">
                    <Activity size={12} className="text-accent" /> {procs.length} procs
                </span>
                {snapshot && (
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-signal whitespace-nowrap"
                        title={`Captured ${new Date(snapshot.capturedAt).toLocaleString()}`}
                    >
                        <Clock size={10} /> {ago(snapshot.capturedAt)}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1 border border-signal/15 px-1.5 py-0.5 rounded-sm">
                    <Search size={11} className="text-signal" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Filter…"
                        className="bg-transparent text-[11px] font-mono text-signal placeholder:text-signal/60 focus:outline-none w-24"
                    />
                </div>
                <button
                    onClick={() => {
                        if (!window.confirm('Drop cached process snapshot?')) return;
                        clearSnapshot(sessionId);
                    }}
                    disabled={!snapshot}
                    className="p-1 text-signal hover:text-red-500 disabled:opacity-40 transition-colors"
                    title="Clear cache (does not affect the session)"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {error && (
                <div className="border border-red-500/30 bg-red-500/10 px-2 py-1.5 flex items-center gap-2 rounded-md shrink-0">
                    <AlertTriangle size={12} className="text-red-500 shrink-0" />
                    <span className="text-[11px] font-mono text-red-500">{error}</span>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto cyber-scrollbar border border-signal/15 bg-machine/20 rounded-md">
                <table className="w-full text-[11px] font-mono">
                    <thead className="sticky top-0 bg-machine/60 backdrop-blur-sm">
                        <tr className="text-signal uppercase tracking-[0.2em] text-[10px]">
                            <th className="text-right px-2 py-1.5 w-14">PID</th>
                            <th className="text-right px-2 py-1.5 w-14">PPID</th>
                            <th className="text-left px-2 py-1.5">Name</th>
                            <th className="text-left px-2 py-1.5 w-14 hidden md:table-cell">Arch</th>
                            <th className="text-left px-2 py-1.5 hidden lg:table-cell">User</th>
                            <th className="text-right px-2 py-1.5 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => (
                            <tr
                                key={p.pid}
                                className="border-t border-signal/10 hover:bg-signal/5"
                                title={p.path || ''}
                            >
                                <td className="px-2 py-1 text-right tabular-nums text-signal">{p.pid}</td>
                                <td className="px-2 py-1 text-right tabular-nums text-signal/80">{p.ppid}</td>
                                <td className="px-2 py-1 text-signal truncate max-w-[180px]" title={p.name}>{p.name}</td>
                                <td className="px-2 py-1 hidden md:table-cell text-signal">{p.arch || '—'}</td>
                                <td className="px-2 py-1 hidden lg:table-cell text-signal truncate max-w-[180px]" title={p.user}>{p.user || '—'}</td>
                                <td className="px-2 py-1 text-right">
                                    <button
                                        onClick={() => handleKill(p.pid)}
                                        disabled={killBusy === p.pid}
                                        className={cn(
                                            'text-[10px] font-mono px-1.5 py-0.5 border rounded-sm transition-colors',
                                            killBusy === p.pid
                                                ? 'border-amber-400/40 text-amber-400'
                                                : 'border-red-500/30 text-red-500 hover:bg-red-500/10',
                                        )}
                                        title={`kill ${p.pid}`}
                                    >
                                        {killBusy === p.pid ? '…' : 'KILL'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center px-2 py-6 text-signal/80">
                                    {!snapshot
                                        ? 'No cached snapshot. Refresh to query the agent.'
                                        : procs.length === 0 ? 'Empty process list.' : 'No matches.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
