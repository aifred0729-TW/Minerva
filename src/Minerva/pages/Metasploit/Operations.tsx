import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    Terminal, Loader2, CircleStop, Trash2, RefreshCw, ChevronDown, ChevronRight,
    Play, Clock, CheckCircle, XCircle, AlertTriangle, Plus, Send, Eye, X,
    ArrowUpRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { MSF_DISPLAY_ID_OFFSET } from '../Callbacks/msfSyntheticCallbacks';
import {
    consoleCreate, consoleDestroy, consoleWrite, consoleRead, consoleList,
    getJobs, getJobInfo, getSessions, stopJob, filterSessionsByOperation,
    type MsfConsole, type MsfConsoleRead, type MsfSession
} from './msfrpc';
import { useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';

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

// ── MSF job-name parser ────────────────────────────────────────────────────
// `job.list` returns strings like:
//   "Exploit: auxiliary/server/socks_proxy"
//   "Auxiliary: scanner/ssh/ssh_login"
//   "Exploit: exploit/multi/handler"
// Split into a kind (drives the colored sidebar-style chip) and a module
// path (drives the breadcrumb display). Falls back to "other" if the
// string doesn't match — better than rendering raw "Exploit: foo" verbatim.
type MsfJobKind = 'exploit' | 'auxiliary' | 'post' | 'evasion' | 'other';

interface ParsedMsfJob {
    kind: MsfJobKind;
    modulePath: string;
    moduleSegments: string[];
    leafName: string;
    raw: string;
}

function parseMsfJobName(name: string | undefined | null): ParsedMsfJob {
    const raw = String(name || '');
    const m = raw.match(/^\s*(Exploit|Auxiliary|Post|Evasion)\s*:\s*(.+?)\s*$/i);
    let kind: MsfJobKind = 'other';
    let modulePath = raw;
    if (m) {
        const k = m[1].toLowerCase();
        if (k === 'exploit' || k === 'auxiliary' || k === 'post' || k === 'evasion') {
            kind = k as MsfJobKind;
        }
        modulePath = m[2];
    }
    const segments = modulePath.split('/').filter(Boolean);
    const leafName = segments[segments.length - 1] || modulePath;
    return { kind, modulePath, moduleSegments: segments, leafName, raw };
}

// Colored kind chip — mirrors the "type-selector sidebar" colour table
// from docs/DESIGN_LANGUAGE.md (exploit-red / aux-yellow / post-purple
// / evasion-orange) so an operator scanning the job list reads the
// module category by colour before reading the path.
function KindChip({ kind }: { kind: MsfJobKind }) {
    const cfg = (() => {
        switch (kind) {
            case 'exploit':   return { label: 'EXP',  cls: 'border-red-500/40    text-red-400' };
            case 'auxiliary': return { label: 'AUX',  cls: 'border-yellow-500/40 text-yellow-400' };
            case 'post':      return { label: 'POST', cls: 'border-purple-500/40 text-purple-400' };
            case 'evasion':   return { label: 'EVA',  cls: 'border-orange-500/40 text-orange-400' };
            default:          return { label: 'MOD',  cls: 'border-signal/30     text-signal' };
        }
    })();
    return (
        <span
            className={cn(
                'rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] font-bold shrink-0',
                cfg.cls,
            )}
        >
            {cfg.label}
        </span>
    );
}

function ParamChip({ k, v }: { k: string; v: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-signal/20 bg-signal/[0.04] px-2 py-0.5 font-mono text-[10px]">
            <span className="tracking-[0.15em] uppercase text-signal">{k}</span>
            <span className="tabular-nums text-signal font-bold truncate max-w-[120px]">{v}</span>
        </span>
    );
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
    const me = useReactiveVar(meState);
    const currentOpId = me.user?.current_operation_id ?? 0;
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
            // Scope sessions to the operator's current Mythic operation
            // — MSF's session.list is global across the daemon but each
            // session carries the `workspace` field that bootstrap pins
            // to `mythic-op-{id}` per operation. Filter so other
            // operations' sessions don't show up in this tab.
            setSessions(filterSessionsByOperation(sessList, currentOpId));

            const details: Record<string, Record<string, unknown>> = {};
            for (const id of Object.keys(jobList)) {
                try { details[id] = await getJobInfo(id); } catch { /* ignore */ }
            }
            setJobDetails(details);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [currentOpId]);

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
            {/* ── Running Jobs ─────────────────────────────────────────── */}
            <div className="rounded-md border border-signal/20 bg-machine/30 overflow-hidden">
                {/* Step-intro style header per design language */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-signal/15 bg-black/30">
                    <div className="flex items-center gap-2.5">
                        <Play size={14} strokeWidth={1.8} className="text-signal" />
                        <span className="font-mono text-sm font-bold tracking-[0.25em] uppercase text-signal">
                            Running Jobs
                        </span>
                        <span className="font-mono text-xs tabular-nums tracking-[0.15em] text-signal">
                            {String(jobEntries.length).padStart(2, '0')}
                        </span>
                    </div>
                    <button
                        onClick={refresh}
                        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-signal hover:text-accent transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={12} strokeWidth={2} />
                        Refresh
                    </button>
                </div>
                {jobEntries.length === 0 ? (
                    <div className="py-10 text-center font-mono text-xs tracking-[0.3em] uppercase text-signal">
                        No Running Jobs
                    </div>
                ) : (
                    <div className="divide-y divide-signal/10">
                        {jobEntries.map(([id, name]) => {
                            const detail = jobDetails[id] || {};
                            const ds = (detail.datastore != null && typeof detail.datastore === 'object')
                                ? detail.datastore as Record<string, unknown>
                                : null;
                            const parsed = parseMsfJobName(name);
                            const isExpanded = expandedJobId === id;
                            const jc = jobConsoles[id];
                            const dsFields = ds
                                ? Object.entries(ds).filter(([, v]) => v != null && v !== '' && v !== false)
                                : [];

                            return (
                                <div key={id}>
                                    {/* Row */}
                                    <button
                                        onClick={() => handleExpandJob(id)}
                                        className={cn(
                                            'w-full px-5 py-3 text-left transition-colors',
                                            isExpanded ? 'bg-signal/[0.06]' : 'hover:bg-signal/[0.04]',
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <ChevronRight
                                                size={14}
                                                strokeWidth={2}
                                                className={cn(
                                                    'text-signal transition-transform shrink-0',
                                                    isExpanded && 'rotate-90',
                                                )}
                                            />
                                            <span className="rounded-sm border border-signal/30 px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] tabular-nums text-signal shrink-0">
                                                JOB {String(id).padStart(2, '0')}
                                            </span>
                                            <KindChip kind={parsed.kind} />
                                            {/* Parsed breadcrumb — non-leaf segments quieter than the leaf */}
                                            <div className="flex-1 min-w-0 flex items-baseline gap-1 font-mono">
                                                {parsed.moduleSegments.length > 1 && (
                                                    <span className="text-xs text-signal whitespace-nowrap truncate">
                                                        {parsed.moduleSegments.slice(0, -1).join('/')}
                                                        <span className="px-1 text-signal">/</span>
                                                    </span>
                                                )}
                                                <span className="text-sm text-signal font-bold tracking-[0.05em] truncate">
                                                    {parsed.leafName}
                                                </span>
                                            </div>
                                            {/* Inline-summary chips for the most-common datastore keys */}
                                            {ds && (
                                                <div className="hidden md:flex items-center gap-1.5 shrink-0">
                                                    {ds.RHOSTS != null && ds.RHOSTS !== '' && <ParamChip k="rhosts" v={String(ds.RHOSTS)} />}
                                                    {ds.LPORT != null && ds.LPORT !== '' && <ParamChip k="lport" v={String(ds.LPORT)} />}
                                                    {ds.SRVPORT != null && ds.SRVPORT !== '' && <ParamChip k="srvport" v={String(ds.SRVPORT)} />}
                                                    {ds.PAYLOAD != null && ds.PAYLOAD !== '' && <ParamChip k="payload" v={String(ds.PAYLOAD)} />}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                                                    <span className="relative flex items-center justify-center w-2 h-2">
                                                        <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping" />
                                                        <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
                                                    </span>
                                                    Running
                                                </span>
                                                <button
                                                    onClick={(e) => handleStopJob(id, e)}
                                                    className="text-signal hover:text-red-500 transition-colors p-0.5"
                                                    title="Stop job"
                                                >
                                                    <CircleStop size={14} strokeWidth={2} />
                                                </button>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Expanded detail */}
                                    <AnimatePresence initial={false}>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                                className="overflow-hidden"
                                            >
                                                <div className="border-t border-signal/15 bg-black/40">
                                                    {/* Full module path breadcrumb */}
                                                    <div className="flex items-center gap-3 px-5 py-3 border-b border-signal/10">
                                                        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal shrink-0">
                                                            Module Path
                                                        </span>
                                                        <span className="font-mono text-xs text-signal truncate">
                                                            {parsed.modulePath}
                                                        </span>
                                                    </div>

                                                    {/* Datastore — parsed into a 2-col label/value grid */}
                                                    {ds && dsFields.length > 0 && (
                                                        <div className="px-5 py-4 border-b border-signal/10">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal">
                                                                    Job Parameters
                                                                </span>
                                                                <span className="font-mono text-[10px] tabular-nums tracking-[0.15em] text-signal">
                                                                    {String(dsFields.length).padStart(2, '0')} FIELDS
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 max-h-[220px] overflow-y-auto cyber-scrollbar pr-2">
                                                                {dsFields.map(([k, v]) => (
                                                                    <div key={k} className="flex items-center gap-2 font-mono py-0.5 min-w-0">
                                                                        <span className="text-[10px] tracking-[0.15em] uppercase text-signal shrink-0 w-24 truncate">
                                                                            {k}
                                                                        </span>
                                                                        <span className="text-xs text-signal font-bold tabular-nums truncate">
                                                                            {String(v)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Live console */}
                                                    <div className="bg-black/60">
                                                        <div className="flex items-center justify-between px-5 py-2.5 border-b border-signal/10">
                                                            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-signal">
                                                                <Terminal size={11} strokeWidth={2} />
                                                                Console Output
                                                                {jc && (
                                                                    <span className="tracking-[0.1em] tabular-nums text-signal">
                                                                        #{jc.consoleId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {jc && (
                                                                jc.busy ? (
                                                                    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                                                                        <Loader2 size={10} strokeWidth={2} className="animate-spin" />
                                                                        Busy
                                                                    </span>
                                                                ) : (
                                                                    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-signal">
                                                                        <CheckCircle size={10} strokeWidth={2} />
                                                                        Ready
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                        <div
                                                            ref={isExpanded ? jobOutputRef : undefined}
                                                            className="p-4 font-mono text-xs text-signal h-[300px] overflow-y-auto cyber-scrollbar whitespace-pre-wrap leading-relaxed"
                                                        >
                                                            {jc?.output || (
                                                                <span className="text-signal">Loading job info…</span>
                                                            )}
                                                            {jc?.busy && <span className="text-accent animate-pulse">█</span>}
                                                        </div>
                                                        {jc && (
                                                            <div className="flex items-center border-t border-signal/15 bg-black/80">
                                                                <span className="px-3 font-mono text-xs text-signal shrink-0">
                                                                    {jc.prompt || 'msf >'}
                                                                </span>
                                                                <input
                                                                    value={jobInputValue}
                                                                    onChange={e => setJobInputValue(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') handleJobCommand(); }}
                                                                    placeholder="Enter command…"
                                                                    className="flex-1 bg-transparent text-signal font-mono text-xs py-2.5 focus:outline-none placeholder:text-signal placeholder:opacity-50"
                                                                />
                                                                <button
                                                                    onClick={handleJobCommand}
                                                                    disabled={!jobInputValue.trim() || jc.busy}
                                                                    className="px-3 text-signal hover:text-accent disabled:opacity-30 transition-colors"
                                                                >
                                                                    <Send size={14} strokeWidth={2} />
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

            {/* ── Sessions (linked to unified Callbacks view) ───────────────────── */}
            <div className="border border-ghost/30 bg-void/50">
                <div className="flex items-center justify-between px-5 py-3 border-b border-ghost/15">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400 uppercase tracking-widest">
                        <CheckCircle size={14} /> SESSIONS ({sessionEntries.length})
                    </div>
                    <Link to="/callbacks"
                        className="flex items-center gap-1 text-[10px] font-mono text-signal/70 hover:text-signal border border-signal/30 px-2 py-1 transition-colors">
                        INTERACT IN CALLBACKS <ArrowUpRight size={11} />
                    </Link>
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
                                    <th className="text-right py-2 px-4">ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionEntries.map(([id, s]) => (
                                    <tr key={id} className="border-b border-ghost/10 hover:bg-signal/5 transition-colors">
                                        <td className="py-2 px-4 text-red-400 font-bold">MSF-{id}</td>
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
                                        <td className="py-2 px-4 text-right">
                                            <Link to={`/console/${MSF_DISPLAY_ID_OFFSET + (parseInt(id, 10) || 0)}`}
                                                className="inline-flex items-center gap-1 text-[10px] font-mono text-signal hover:text-white border border-signal/30 hover:border-signal/60 px-2 py-0.5 transition-colors">
                                                <Terminal size={10} /> INTERACT
                                            </Link>
                                        </td>
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
