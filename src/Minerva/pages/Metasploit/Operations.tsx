import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal, Loader2, CircleStop, Trash2, RefreshCw, ChevronDown, ChevronRight,
    Play, Clock, CheckCircle, XCircle, AlertTriangle, Plus, Send, Eye, X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    consoleCreate, consoleDestroy, consoleWrite, consoleRead, consoleList,
    getJobs, getJobInfo, getSessions, stopJob,
    type MsfConsole, type MsfConsoleRead, type MsfSession
} from './msfrpc';

// ── Types ──────────────────────────────────────────────────────────────────

interface ConsoleEntry {
    id: string;
    prompt: string;
    busy: boolean;
    output: string;
    command?: string;
    createdAt: Date;
}

interface JobDetail {
    name: string;
    info: Record<string, unknown>;
    consoleId: string | null;
    consoleOutput: string;
    consoleBusy: boolean;
    consolePrompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATIONS PAGE
// ═══════════════════════════════════════════════════════════════════════════

/** Polling intervals (ms) */
const REFRESH_INTERVAL_MS = 10_000;
const CONSOLE_POLL_MS = 2_000;
const JOB_POLL_MS = 1_500;
const ACTION_SETTLE_DELAY_MS = 500;

export default function Operations() {
    const [consoles, setConsoles] = useState<ConsoleEntry[]>([]);
    const [activeConsoleId, setActiveConsoleId] = useState<string | null>(null);
    const [jobs, setJobs] = useState<Record<string, string>>({});
    const [jobDetails, setJobDetails] = useState<Record<string, Record<string, unknown>>>({});
    const [sessions, setSessions] = useState<Record<string, MsfSession>>({});
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const outputRef = useRef<HTMLDivElement>(null);
    const jobOutputRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Job detail panel state ─────────────────────────────────────────────
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [jobConsoles, setJobConsoles] = useState<Record<string, { consoleId: string; output: string; busy: boolean; prompt: string }>>({});
    const [jobInputValue, setJobInputValue] = useState('');
    const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const activeConsole = useMemo(() =>
        consoles.find(c => c.id === activeConsoleId) || null,
    [consoles, activeConsoleId]);

    // ── Load existing consoles, jobs, sessions ─────────────────────────────
    const refresh = useCallback(async () => {
        try {
            const [conList, jobList, sessList] = await Promise.all([
                consoleList(),
                getJobs(),
                getSessions(),
            ]);

            setConsoles(prev => {
                const existing = new Map(prev.map(c => [c.id, c]));
                return conList.map(c => ({
                    id: c.id,
                    prompt: c.prompt,
                    busy: c.busy,
                    output: existing.get(c.id)?.output || '',
                    command: existing.get(c.id)?.command,
                    createdAt: existing.get(c.id)?.createdAt || new Date(),
                }));
            });

            setJobs(jobList);
            setSessions(sessList);

            const details: Record<string, Record<string, unknown>> = {};
            for (const id of Object.keys(jobList)) {
                try { details[id] = await getJobInfo(id); } catch { /* ignore */ }
            }
            setJobDetails(details);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    // Periodic refresh for jobs/sessions (every 10s)
    useEffect(() => {
        const iv = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(iv);
    }, [refresh]);

    // ── Poll active console output ─────────────────────────────────────────
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!activeConsoleId) return;

        const poll = async () => {
            try {
                const result = await consoleRead(activeConsoleId);
                if (result.data) {
                    setConsoles(prev => prev.map(c =>
                        c.id === activeConsoleId
                            ? { ...c, output: c.output + result.data, prompt: result.prompt, busy: result.busy }
                            : c
                    ));
                } else {
                    setConsoles(prev => prev.map(c =>
                        c.id === activeConsoleId
                            ? { ...c, prompt: result.prompt, busy: result.busy }
                            : c
                    ));
                }
            } catch { /* ignore */ }
        };

        poll();
        pollRef.current = setInterval(poll, CONSOLE_POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [activeConsoleId]);

    // ── Poll expanded job's console ────────────────────────────────────────
    useEffect(() => {
        if (jobPollRef.current) clearInterval(jobPollRef.current);
        if (!expandedJobId) return;
        const jc = jobConsoles[expandedJobId];
        if (!jc) return;

        const poll = async () => {
            try {
                const result = await consoleRead(jc.consoleId);
                if (result.data || result.prompt !== jc.prompt || result.busy !== jc.busy) {
                    setJobConsoles(prev => ({
                        ...prev,
                        [expandedJobId]: {
                            ...prev[expandedJobId],
                            output: prev[expandedJobId].output + (result.data || ''),
                            prompt: result.prompt,
                            busy: result.busy,
                        }
                    }));
                }
            } catch { /* ignore */ }
        };

        poll();
        jobPollRef.current = setInterval(poll, JOB_POLL_MS);
        return () => { if (jobPollRef.current) clearInterval(jobPollRef.current); };
    }, [expandedJobId, jobConsoles]);

    // Auto-scroll console output
    useEffect(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, [activeConsole?.output]);

    // Auto-scroll job output
    useEffect(() => {
        if (jobOutputRef.current) jobOutputRef.current.scrollTop = jobOutputRef.current.scrollHeight;
    }, [expandedJobId, jobConsoles]);

    // ── Job expand / collapse ──────────────────────────────────────────────
    const handleExpandJob = async (jobId: string) => {
        if (expandedJobId === jobId) {
            // Collapse — destroy the job console
            const jc = jobConsoles[jobId];
            if (jc) {
                consoleDestroy(jc.consoleId).catch(() => {});
                setJobConsoles(prev => { const n = { ...prev }; delete n[jobId]; return n; });
            }
            setExpandedJobId(null);
            setJobInputValue('');
            return;
        }

        setExpandedJobId(jobId);
        setJobInputValue('');

        // Already have a console for this job?
        if (jobConsoles[jobId]) return;

        // Create a console and query the job info
        try {
            const con = await consoleCreate();
            setJobConsoles(prev => ({
                ...prev,
                [jobId]: { consoleId: con.id, output: '', busy: true, prompt: con.prompt }
            }));
            // Send info command to show job details
            await consoleWrite(con.id, `jobs -i ${jobId}`);
        } catch { /* ignore */ }
    };

    const handleJobCommand = async () => {
        if (!expandedJobId || !jobInputValue.trim()) return;
        const cmd = jobInputValue;
        setJobInputValue('');
        const jc = jobConsoles[expandedJobId];
        if (!jc) return;

        // Append to output
        setJobConsoles(prev => ({
            ...prev,
            [expandedJobId]: {
                ...prev[expandedJobId],
                output: prev[expandedJobId].output + prev[expandedJobId].prompt + cmd + '\n',
                busy: true,
            }
        }));

        try { await consoleWrite(jc.consoleId, cmd); } catch { /* ignore */ }
    };

    // ── Console actions ────────────────────────────────────────────────────
    const handleCreateConsole = async () => {
        setCreating(true);
        try {
            const con = await consoleCreate();
            const entry: ConsoleEntry = {
                id: con.id, prompt: con.prompt, busy: con.busy,
                output: '', createdAt: new Date(),
            };
            setConsoles(prev => [...prev, entry]);
            setActiveConsoleId(con.id);
        } catch { /* ignore */ }
        finally { setCreating(false); }
    };

    const handleDestroyConsole = async (id: string) => {
        try {
            await consoleDestroy(id);
            setConsoles(prev => prev.filter(c => c.id !== id));
            if (activeConsoleId === id) setActiveConsoleId(null);
        } catch { /* ignore */ }
    };

    const handleSendCommand = async () => {
        if (!activeConsoleId || !inputValue.trim()) return;
        const cmd = inputValue;
        setInputValue('');
        setConsoles(prev => prev.map(c =>
            c.id === activeConsoleId
                ? { ...c, output: c.output + c.prompt + cmd + '\n', busy: true, command: cmd }
                : c
        ));
        try { await consoleWrite(activeConsoleId, cmd); } catch { /* ignore */ }
    };

    const handleStopJob = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await stopJob(id);
            setTimeout(refresh, ACTION_SETTLE_DELAY_MS);
        } catch { /* ignore */ }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-500 font-mono text-sm">
                <Loader2 size={18} className="animate-spin mr-2" /> Loading operations...
            </div>
        );
    }

    const jobEntries = Object.entries(jobs);
    const sessionEntries = Object.entries(sessions);

    return (
        <div className="space-y-6">
            {/* ── Active Jobs ────────────────────────────────────────── */}
            <div className="border border-ghost/30 bg-void/50">
                <div className="flex items-center justify-between px-5 py-3 border-b border-ghost/15">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400 uppercase tracking-widest">
                        <Play size={14} /> RUNNING JOBS ({jobEntries.length})
                    </div>
                    <button onClick={refresh} className="text-gray-500 hover:text-signal transition-colors" title="Refresh">
                        <RefreshCw size={14} />
                    </button>
                </div>
                {jobEntries.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 font-mono text-xs">NO_RUNNING_JOBS</div>
                ) : (
                    <div className="divide-y divide-ghost/10">
                        {jobEntries.map(([id, name]) => {
                            const detail = jobDetails[id] || {};
                            const ds = (detail.datastore != null && typeof detail.datastore === 'object') ? detail.datastore as Record<string, unknown> : null;
                            const isExpanded = expandedJobId === id;
                            const jc = jobConsoles[id];

                            return (
                                <div key={id}>
                                    {/* Job Row */}
                                    <button
                                        onClick={() => handleExpandJob(id)}
                                        className={cn(
                                            "w-full px-5 py-3 text-left transition-colors",
                                            isExpanded ? "bg-signal/5" : "hover:bg-signal/3"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <ChevronRight size={14} className={cn("text-gray-500 transition-transform shrink-0", isExpanded && "rotate-90")} />
                                                <span className="text-signal font-mono text-xs font-bold w-8">[{id}]</span>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-mono text-gray-300">{name}</div>
                                                    {ds && (
                                                        <div className="text-[10px] font-mono text-gray-600 mt-0.5">
                                                            {ds.RHOSTS ? `RHOSTS: ${String(ds.RHOSTS)}` : ''}
                                                            {ds.RPORT ? ` | RPORT: ${String(ds.RPORT)}` : ''}
                                                            {ds.PAYLOAD ? ` | ${String(ds.PAYLOAD)}` : ''}
                                                            {ds.Proxies ? ` | Proxy: ${String(ds.Proxies)}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="flex items-center gap-1 text-[10px] font-mono text-yellow-400">
                                                    <Loader2 size={10} className="animate-spin" /> RUNNING
                                                </span>
                                                <button onClick={(e) => handleStopJob(id, e)} className="text-red-400/60 hover:text-red-400 transition-colors" title="Stop">
                                                    <CircleStop size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Expanded Detail Panel */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                                className="overflow-hidden"
                                            >
                                                <div className="border-t border-ghost/15 bg-black/30">
                                                    {/* Job Info Grid */}
                                                    {ds && (
                                                        <div className="px-5 py-4 border-b border-ghost/10">
                                                            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3">JOB PARAMETERS</div>
                                                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 max-h-[200px] overflow-y-auto cyber-scrollbar">
                                                                {Object.entries(ds)
                                                                    .filter(([, v]) => v != null && v !== '' && v !== false)
                                                                    .map(([k, v]) => (
                                                                        <div key={k} className="flex items-baseline gap-2 text-xs font-mono py-0.5">
                                                                            <span className="text-gray-500 shrink-0">{k}:</span>
                                                                            <span className="text-signal truncate">{String(v)}</span>
                                                                        </div>
                                                                    ))
                                                                }
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Live Console */}
                                                    <div className="bg-black">
                                                        <div className="flex items-center justify-between px-4 py-2 border-b border-ghost/15">
                                                            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                                                                <Terminal size={11} />
                                                                CONSOLE OUTPUT
                                                                {jc && (
                                                                    <span className="text-gray-700">#{jc.consoleId}</span>
                                                                )}
                                                            </div>
                                                            {jc && (
                                                                <div className="flex items-center gap-2">
                                                                    {jc.busy ? (
                                                                        <span className="flex items-center gap-1 text-[10px] font-mono text-yellow-400">
                                                                            <Loader2 size={10} className="animate-spin" /> BUSY
                                                                        </span>
                                                                    ) : (
                                                                        <span className="flex items-center gap-1 text-[10px] font-mono text-green-400">
                                                                            <CheckCircle size={10} /> READY
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div
                                                            ref={isExpanded ? jobOutputRef : undefined}
                                                            className="p-4 font-mono text-xs text-gray-300 h-[300px] overflow-y-auto cyber-scrollbar whitespace-pre-wrap leading-relaxed"
                                                        >
                                                            {jc?.output || (
                                                                <span className="text-gray-600">Loading job info...</span>
                                                            )}
                                                            {jc?.busy && <span className="text-yellow-400 animate-pulse">█</span>}
                                                        </div>
                                                        {/* Input for the job console */}
                                                        {jc && (
                                                            <div className="flex items-center border-t border-ghost/20 bg-black/80">
                                                                <span className="px-3 text-xs font-mono text-signal shrink-0">
                                                                    {jc.prompt || 'msf >'}
                                                                </span>
                                                                <input
                                                                    value={jobInputValue}
                                                                    onChange={e => setJobInputValue(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') handleJobCommand(); }}
                                                                    placeholder="Enter command..."
                                                                    className="flex-1 bg-transparent text-signal font-mono text-xs py-2.5 focus:outline-none"
                                                                />
                                                                <button
                                                                    onClick={handleJobCommand}
                                                                    disabled={!jobInputValue.trim() || jc.busy}
                                                                    className="px-3 text-gray-500 hover:text-signal disabled:opacity-30 transition-colors"
                                                                >
                                                                    <Send size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Recent Sessions ─────────────────────────────────────── */}
            <div className="border border-ghost/30 bg-void/50">
                <div className="px-5 py-3 border-b border-ghost/15">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400 uppercase tracking-widest">
                        <CheckCircle size={14} /> SESSIONS ({sessionEntries.length})
                    </div>
                </div>
                {sessionEntries.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 font-mono text-xs">NO_ACTIVE_SESSIONS</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-gray-500 border-b border-ghost/20">
                                    <th className="text-left py-2 px-4">ID</th>
                                    <th className="text-left py-2 px-4">TYPE</th>
                                    <th className="text-left py-2 px-4">INFO</th>
                                    <th className="text-left py-2 px-4">TARGET</th>
                                    <th className="text-left py-2 px-4">TUNNEL</th>
                                    <th className="text-left py-2 px-4">VIA EXPLOIT</th>
                                    <th className="text-left py-2 px-4">VIA PAYLOAD</th>
                                    <th className="text-left py-2 px-4">ARCH</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionEntries.map(([id, s]) => (
                                    <tr key={id} className="border-b border-ghost/10 hover:bg-signal/5 transition-colors">
                                        <td className="py-2 px-4 text-signal font-bold">{id}</td>
                                        <td className="py-2 px-4">
                                            <span className={cn("px-1.5 py-0.5 text-[10px]",
                                                s.type === 'meterpreter' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                                            )}>{s.type?.toUpperCase()}</span>
                                        </td>
                                        <td className="py-2 px-4 text-gray-300 max-w-[180px] truncate">{s.info || '-'}</td>
                                        <td className="py-2 px-4 text-cyan-400">{s.session_host || s.target_host || '-'}:{s.session_port || '-'}</td>
                                        <td className="py-2 px-4 text-gray-400 text-[10px]">{s.tunnel_peer || '-'}</td>
                                        <td className="py-2 px-4 text-gray-400 max-w-[160px] truncate">{s.via_exploit || '-'}</td>
                                        <td className="py-2 px-4 text-gray-400 max-w-[160px] truncate">{s.via_payload || '-'}</td>
                                        <td className="py-2 px-4 text-gray-400">{s.arch || '-'}/{s.platform || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Interactive Consoles ─────────────────────────────────── */}
            <div className="border border-ghost/30 bg-void/50">
                <div className="flex items-center justify-between px-5 py-3 border-b border-ghost/15">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400 uppercase tracking-widest">
                        <Terminal size={14} /> MSF CONSOLES ({consoles.length})
                    </div>
                    <button onClick={handleCreateConsole} disabled={creating}
                        className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono text-signal border border-signal/30 hover:bg-signal/10 disabled:opacity-50 transition-colors">
                        {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        NEW CONSOLE
                    </button>
                </div>

                {/* Console tabs */}
                {consoles.length > 0 && (
                    <div className="flex items-center border-b border-ghost/15 px-2 overflow-x-auto cyber-scrollbar">
                        {consoles.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setActiveConsoleId(c.id)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 text-xs font-mono border-b-2 -mb-[1px] transition-colors shrink-0",
                                    activeConsoleId === c.id
                                        ? "border-signal text-signal"
                                        : "border-transparent text-gray-500 hover:text-white"
                                )}
                            >
                                <Terminal size={11} />
                                Console #{c.id}
                                {c.busy && <Loader2 size={10} className="animate-spin text-yellow-400" />}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDestroyConsole(c.id); }}
                                    className="ml-1 text-gray-600 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={10} />
                                </button>
                            </button>
                        ))}
                    </div>
                )}

                {/* Console output */}
                {activeConsole ? (
                    <div className="bg-black">
                        <div
                            ref={outputRef}
                            className="p-4 font-mono text-xs text-gray-300 h-[400px] overflow-y-auto cyber-scrollbar whitespace-pre-wrap leading-relaxed"
                        >
                            {activeConsole.output || (
                                <span className="text-gray-600">Waiting for output...</span>
                            )}
                            {activeConsole.busy && (
                                <span className="text-yellow-400 animate-pulse">█</span>
                            )}
                        </div>
                        <div className="flex items-center border-t border-ghost/20 bg-black/80">
                            <span className="px-3 text-xs font-mono text-signal shrink-0">
                                {activeConsole.prompt || 'msf >'}
                            </span>
                            <input
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSendCommand(); }}
                                placeholder="Enter command..."
                                className="flex-1 bg-transparent text-signal font-mono text-xs py-2.5 focus:outline-none"
                                autoFocus
                            />
                            <button
                                onClick={handleSendCommand}
                                disabled={!inputValue.trim() || activeConsole.busy}
                                className="px-3 text-gray-500 hover:text-signal disabled:opacity-30 transition-colors"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-600 font-mono text-xs">
                        {consoles.length === 0
                            ? 'Create a console to interact with Metasploit Framework'
                            : 'Select a console tab above'}
                    </div>
                )}
            </div>
        </div>
    );
}
