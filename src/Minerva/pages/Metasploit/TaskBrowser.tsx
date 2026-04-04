import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
    Search, ChevronRight, ChevronDown, Terminal, Trash2,
    AlertTriangle, CheckCircle, Loader2, Clock, Bug,
    Shield, Layers, Package, Hash, Cpu, Target, X, Filter,
    Code, Eye, Info, Zap, Minus
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { timeAgo } from '../../lib/time';
import {
    getExecutions, deleteExecution, clearAllExecutions,
    searchExecutions, type MsfExecutionRecord, type ExecutionStatus
} from './executionHistory';
import {
    parseMsfOutput, groupParams, stripAnsi,
    type MsfLogLine, type LogLevel, type ParsedOutput, type ParamGroup
} from './outputParser';

// ── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const MODULE_TYPES = [
    { key: 'exploit', label: 'EXPLOIT', icon: <Bug size={12} />, color: 'text-red-400 border-red-400/40 bg-red-500/10' },
    { key: 'auxiliary', label: 'AUX', icon: <Layers size={12} />, color: 'text-yellow-400 border-yellow-400/40 bg-yellow-500/10' },
    { key: 'post', label: 'POST', icon: <Shield size={12} />, color: 'text-purple-400 border-purple-400/40 bg-purple-500/10' },
    { key: 'payload', label: 'PAYLOAD', icon: <Package size={12} />, color: 'text-cyan-400 border-cyan-400/40 bg-cyan-500/10' },
    { key: 'encoder', label: 'ENCODER', icon: <Hash size={12} />, color: 'text-green-400 border-green-400/40 bg-green-500/10' },
    { key: 'nop', label: 'NOP', icon: <Cpu size={12} />, color: 'text-gray-400 border-gray-400/40 bg-gray-500/10' },
    { key: 'evasion', label: 'EVASION', icon: <Shield size={12} />, color: 'text-orange-400 border-orange-400/40 bg-orange-500/10' },
];

const STATUS_OPTIONS: { key: ExecutionStatus; label: string; color: string; icon: React.ReactNode }[] = [
    { key: 'running', label: 'RUNNING', color: 'text-yellow-400', icon: <Loader2 size={12} className="animate-spin" /> },
    { key: 'complete', label: 'COMPLETE', color: 'text-green-400', icon: <CheckCircle size={12} /> },
    { key: 'error', label: 'ERROR', color: 'text-red-400', icon: <AlertTriangle size={12} /> },
];

const fadeIn: Variants = {
    hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
}

function statusBadge(status: ExecutionStatus) {
    const opt = STATUS_OPTIONS.find(s => s.key === status) || STATUS_OPTIONS[1];
    return (
        <span className={cn("flex items-center gap-1 text-[10px] font-mono font-bold uppercase", opt.color)}>
            {opt.icon} {opt.label}
        </span>
    );
}

function typeBadge(type: string) {
    const t = MODULE_TYPES.find(m => m.key === type);
    if (!t) return <span className="text-[10px] font-mono text-gray-500 uppercase">{type}</span>;
    return (
        <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold border rounded-sm", t.color)}>
            {t.icon} {t.label}
        </span>
    );
}

// ── Log Level Styles ────────────────────────────────────────────────────────

const LOG_LEVEL_STYLES: Record<LogLevel, { color: string; icon: React.ReactNode; bg: string }> = {
    success: { color: 'text-green-400', icon: <CheckCircle size={11} />, bg: 'bg-green-500/8' },
    error: { color: 'text-red-400', icon: <Minus size={11} />, bg: 'bg-red-500/8' },
    warning: { color: 'text-amber-400', icon: <AlertTriangle size={11} />, bg: 'bg-amber-500/8' },
    info: { color: 'text-cyan-400', icon: <Info size={11} />, bg: 'bg-cyan-500/5' },
    debug: { color: 'text-gray-500', icon: <Code size={11} />, bg: '' },
    plain: { color: 'text-gray-400', icon: null, bg: '' },
};

// ── Parsed Log Line ─────────────────────────────────────────────────────────

function LogLineRow({ line }: { line: MsfLogLine }) {
    const style = LOG_LEVEL_STYLES[line.level];
    return (
        <div className={cn("flex items-start gap-2 px-3 py-1 font-mono text-xs", style.bg)}>
            {style.icon && <span className={cn("mt-0.5 shrink-0", style.color)}>{style.icon}</span>}
            {line.timestamp && (
                <span className="text-cyan-400/70 shrink-0 text-[10px]">{line.timestamp}</span>
            )}
            <span className={cn("break-all", style.color)}>{line.message}</span>
        </div>
    );
}

// ── Parsed Params Panel ─────────────────────────────────────────────────────

function ParsedParamsPanel({ groups }: { groups: ParamGroup[] }) {
    if (groups.length === 0) return null;

    // Separate "Module Options" (user-set params) from namespaced defaults
    const mainGroup = groups.find(g => g.label === 'Module Options');
    const nsGroups = groups.filter(g => g.label !== 'Module Options');

    return (
        <div className="space-y-2">
            {/* Main module options — always visible */}
            {mainGroup && mainGroup.params.length > 0 && (
                <div className="border border-ghost/20 bg-black/30 p-3">
                    <div className="text-[9px] font-mono text-signal/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Zap size={10} /> Module Config
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                        {mainGroup.params.map(p => (
                            <div key={p.key} className="flex items-baseline gap-2 text-[11px] font-mono py-0.5">
                                <span className="text-gray-500 shrink-0">{p.key}</span>
                                <span className="text-gray-700">→</span>
                                <span className={cn(
                                    "truncate",
                                    p.value === 'true' ? 'text-green-400' :
                                        p.value === 'false' ? 'text-red-400/60' :
                                            'text-signal'
                                )}>{p.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Namespaced groups — collapsed by default */}
            {nsGroups.length > 0 && (
                <details className="group">
                    <summary className="flex items-center gap-2 cursor-pointer text-[10px] font-mono text-gray-600 hover:text-gray-400 transition-colors">
                        <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
                        ADVANCED DEFAULTS ({nsGroups.reduce((s, g) => s + g.params.length, 0)} params across {nsGroups.length} namespaces)
                    </summary>
                    <div className="mt-2 space-y-2 max-h-[250px] overflow-y-auto cyber-scrollbar">
                        {nsGroups.map(g => (
                            <div key={g.label} className="border border-ghost/15 bg-black/20 p-2">
                                <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1.5">{g.label}::</div>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5">
                                    {g.params.map(p => {
                                        const shortKey = p.key.includes('::') ? p.key.split('::').slice(1).join('::') : p.key;
                                        return (
                                            <div key={p.key} className="flex items-baseline gap-1.5 text-[10px] font-mono py-0.5">
                                                <span className="text-gray-600 shrink-0">{shortKey}</span>
                                                <span className={cn(
                                                    "truncate",
                                                    p.value === 'true' ? 'text-green-400/70' :
                                                        p.value === 'false' ? 'text-gray-600' :
                                                            'text-gray-400'
                                                )}>{p.value}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

// ── Row Component ───────────────────────────────────────────────────────────

function TaskRow({ record, onDelete, onRefresh }: {
    record: MsfExecutionRecord;
    onDelete: (id: string) => void;
    onRefresh: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [viewMode, setViewMode] = useState<'parsed' | 'raw'>('parsed');

    const parsed = useMemo(() => parseMsfOutput(record.output), [record.output]);
    const paramGroups = useMemo(() => groupParams(parsed.params), [parsed.params]);

    const outputPreview = useMemo(() => {
        // Show the last meaningful log line as preview
        if (parsed.logLines.length > 0) {
            const last = parsed.logLines[parsed.logLines.length - 1];
            const prefix = last.level === 'success' ? '[+] ' : last.level === 'error' ? '[-] ' : '[*] ';
            const msg = prefix + (last.timestamp ? `${last.timestamp} - ` : '') + last.message;
            return msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
        }
        const clean = stripAnsi(record.output).trim();
        const lines = clean.split('\n').filter(l => l.trim().length > 0);
        const last = lines.slice(-1).join('').trim();
        return last.length > 120 ? last.slice(0, 120) + '…' : last;
    }, [record.output, parsed.logLines]);

    // Determine preview color based on last log line
    const previewColor = useMemo(() => {
        if (parsed.logLines.length === 0) return 'text-gray-600';
        const last = parsed.logLines[parsed.logLines.length - 1];
        return last.level === 'success' ? 'text-green-400/60' :
            last.level === 'error' ? 'text-red-400/60' : 'text-gray-600';
    }, [parsed.logLines]);

    return (
        <div className="border border-ghost/20 bg-void/50 hover:border-ghost/40 transition-colors">
            {/* Summary Row */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left group"
            >
                <ChevronRight
                    size={14}
                    className={cn("text-gray-600 transition-transform shrink-0", expanded && "rotate-90")}
                />

                {/* Status dot */}
                <div className={cn("w-2 h-2 rounded-full shrink-0",
                    record.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                        record.status === 'complete' ? 'bg-green-400' : 'bg-red-400'
                )} />

                {/* Type badge */}
                <div className="shrink-0">{typeBadge(record.moduleType)}</div>

                {/* Module name */}
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-gray-200 truncate group-hover:text-signal transition-colors">
                        {record.moduleName}
                    </div>
                    {outputPreview && (
                        <div className={cn("text-[10px] font-mono truncate mt-0.5", previewColor)}>{outputPreview}</div>
                    )}
                </div>

                {/* Target */}
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-mono text-cyan-400">{record.target}</div>
                </div>

                {/* Time */}
                <div className="shrink-0 text-right w-20">
                    <div className="text-[10px] font-mono text-gray-500">{timeAgo(record.startedAt)}</div>
                </div>

                {/* Status */}
                <div className="shrink-0 w-20">{statusBadge(record.status)}</div>

                {/* Delete */}
                <button
                    onClick={e => { e.stopPropagation(); onDelete(record.id); }}
                    className="text-gray-600 hover:text-red-400 transition-colors shrink-0 p-1"
                    title="Delete record"
                >
                    <Trash2 size={13} />
                </button>
            </button>

            {/* Expanded Detail */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3 border-t border-ghost/15">
                            {/* Info Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
                                <div className="border border-ghost/20 bg-black/30 px-3 py-2">
                                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-0.5">MODULE</div>
                                    <div className="text-[11px] font-mono text-signal truncate">{record.moduleType}/{record.moduleName}</div>
                                </div>
                                <div className="border border-ghost/20 bg-black/30 px-3 py-2">
                                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-0.5">TARGET</div>
                                    <div className="text-[11px] font-mono text-white">{record.target}</div>
                                </div>
                                <div className="border border-ghost/20 bg-black/30 px-3 py-2">
                                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-0.5">STARTED</div>
                                    <div className="text-[11px] font-mono text-gray-300">{formatTime(record.startedAt)}</div>
                                </div>
                                <div className="border border-ghost/20 bg-black/30 px-3 py-2">
                                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-0.5">
                                        {record.proxy ? 'PROXY' : 'COMPLETED'}
                                    </div>
                                    <div className="text-[11px] font-mono text-purple-400">
                                        {record.proxy || (record.completedAt ? formatTime(record.completedAt) : '-')}
                                    </div>
                                </div>
                            </div>

                            {/* Error message */}
                            {record.errorMessage && (
                                <div className="border border-red-500/30 bg-red-500/10 px-3 py-2 flex items-start gap-2">
                                    <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                                    <span className="text-xs font-mono text-red-400">{record.errorMessage}</span>
                                </div>
                            )}

                            {/* Output Section with Parsed/Raw Toggle */}
                            <div className="border border-ghost/30 bg-black overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 border-b border-ghost/15 bg-black/80">
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                                        <Terminal size={11} /> OUTPUT
                                        {parsed.logLines.length > 0 && (
                                            <span className="text-gray-600">
                                                · {parsed.logLines.filter(l => l.level === 'success').length}<CheckCircle size={9} className="inline text-green-400/60 ml-0.5" />
                                                {parsed.logLines.filter(l => l.level === 'error').length > 0 && (
                                                    <> · {parsed.logLines.filter(l => l.level === 'error').length}<Minus size={9} className="inline text-red-400/60 ml-0.5" /></>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setViewMode('parsed')}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border transition-all",
                                                viewMode === 'parsed'
                                                    ? 'border-signal/50 bg-signal/15 text-signal'
                                                    : 'border-ghost/20 text-gray-600 hover:text-gray-400'
                                            )}
                                        >
                                            <Eye size={10} /> PARSED
                                        </button>
                                        <button
                                            onClick={() => setViewMode('raw')}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border transition-all",
                                                viewMode === 'raw'
                                                    ? 'border-signal/50 bg-signal/15 text-signal'
                                                    : 'border-ghost/20 text-gray-600 hover:text-gray-400'
                                            )}
                                        >
                                            <Code size={10} /> RAW
                                        </button>
                                    </div>
                                </div>

                                {viewMode === 'raw' ? (
                                    /* ── Raw Output ───────────────────────── */
                                    <div className="p-3 font-mono text-xs text-gray-300 max-h-[500px] overflow-y-auto cyber-scrollbar whitespace-pre-wrap leading-relaxed">
                                        {record.output || <span className="text-gray-600">No output captured</span>}
                                    </div>
                                ) : (
                                    /* ── Parsed Output ────────────────────── */
                                    <div className="max-h-[500px] overflow-y-auto cyber-scrollbar">
                                        {/* Banner (collapsible, hidden by default) */}
                                        {parsed.hasBanner && (
                                            <details className="group border-b border-ghost/10">
                                                <summary className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[10px] font-mono text-gray-600 hover:text-gray-400 transition-colors">
                                                    <ChevronRight size={9} className="group-open:rotate-90 transition-transform" />
                                                    BANNER / ASCII ART
                                                </summary>
                                                <div className="px-3 pb-2 font-mono text-[10px] text-gray-600 whitespace-pre leading-tight overflow-x-auto">
                                                    {parsed.banner}
                                                </div>
                                            </details>
                                        )}

                                        {/* Parsed Parameters */}
                                        {parsed.hasParams && (
                                            <div className="border-b border-ghost/10 p-3">
                                                <ParsedParamsPanel groups={paramGroups} />
                                            </div>
                                        )}

                                        {/* Log Lines */}
                                        {parsed.logLines.length > 0 && (
                                            <div className="divide-y divide-ghost/5 py-1">
                                                {parsed.logLines.map((line, i) => (
                                                    <LogLineRow key={i} line={line} />
                                                ))}
                                            </div>
                                        )}

                                        {/* Other lines */}
                                        {parsed.otherLines.length > 0 && (
                                            <div className="px-3 py-2 border-t border-ghost/10">
                                                {parsed.otherLines.map((line, i) => (
                                                    <div key={i} className="font-mono text-xs text-gray-500 py-0.5">{line}</div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Empty */}
                                        {!parsed.hasBanner && !parsed.hasParams && parsed.logLines.length === 0 && parsed.otherLines.length === 0 && (
                                            <div className="p-4 text-center text-gray-600 font-mono text-xs">No output captured</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* User-specified Execution Parameters (from the launch form) */}
                            <details className="group">
                                <summary className="flex items-center gap-2 cursor-pointer text-[10px] font-mono text-gray-500 hover:text-gray-300 transition-colors">
                                    <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
                                    EXECUTION PARAMETERS ({Object.keys(record.options).length})
                                </summary>
                                <div className="mt-2 border border-ghost/20 bg-black/30 p-3 max-h-[180px] overflow-y-auto cyber-scrollbar">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                        {Object.entries(record.options).map(([k, v]) => (
                                            <div key={k} className="flex items-baseline gap-2 text-[11px] font-mono py-0.5">
                                                <span className="text-gray-500 shrink-0">{k}:</span>
                                                <span className="text-signal truncate">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TaskBrowser() {
    const [records, setRecords] = useState<MsfExecutionRecord[]>(() => getExecutions());
    const [query, setQuery] = useState('');
    const [filterType, setFilterType] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<ExecutionStatus | null>(null);
    const [page, setPage] = useState(0);
    const [confirmClear, setConfirmClear] = useState(false);

    const reload = () => setRecords(getExecutions());

    const filtered = useMemo(() => {
        return searchExecutions({
            query: query || undefined,
            moduleType: filterType || undefined,
            status: filterStatus || undefined,
        });
    }, [records, query, filterType, filterStatus]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const handleDelete = (id: string) => {
        deleteExecution(id);
        reload();
    };

    const handleClearAll = () => {
        if (!confirmClear) { setConfirmClear(true); return; }
        clearAllExecutions();
        setConfirmClear(false);
        reload();
    };

    // Count by type for filter badges
    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        records.forEach(r => { counts[r.moduleType] = (counts[r.moduleType] || 0) + 1; });
        return counts;
    }, [records]);

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        records.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
        return counts;
    }, [records]);

    return (
        <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-4">
            {/* ── Search & Filter Bar ────────────────────────────────── */}
            <div className="border border-ghost/30 bg-void/50 p-4 space-y-3">
                {/* Search Row */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            value={query}
                            onChange={e => { setQuery(e.target.value); setPage(0); }}
                            placeholder="Search modules, targets, output..."
                            className="w-full bg-black/60 border border-ghost/30 text-signal font-mono text-xs pl-9 pr-3 py-2 focus:border-signal/60 focus:outline-none transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                        <span>{filtered.length} {filtered.length === 1 ? 'record' : 'records'}</span>
                    </div>
                    {records.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border transition-colors",
                                confirmClear
                                    ? "border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20"
                                    : "border-ghost/30 text-gray-500 hover:text-red-400 hover:border-red-400/30"
                            )}
                        >
                            <Trash2 size={11} />
                            {confirmClear ? 'CONFIRM CLEAR' : 'CLEAR ALL'}
                        </button>
                    )}
                    {confirmClear && (
                        <button
                            onClick={() => setConfirmClear(false)}
                            className="text-gray-500 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Filter Tags */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Module Type Filters */}
                    <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600 uppercase tracking-wider shrink-0">
                        <Filter size={10} /> TYPE:
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {MODULE_TYPES.filter(t => typeCounts[t.key]).map(t => (
                            <button
                                key={t.key}
                                onClick={() => { setFilterType(filterType === t.key ? null : t.key); setPage(0); }}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border transition-all duration-150",
                                    filterType === t.key
                                        ? "border-signal/50 bg-signal/15 text-signal"
                                        : "border-ghost/20 text-gray-500 hover:border-ghost/40 hover:text-gray-300"
                                )}
                            >
                                {t.icon} {t.label}
                                <span className="text-gray-600">{typeCounts[t.key]}</span>
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-ghost/20 mx-1" />

                    {/* Status Filters */}
                    <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600 uppercase tracking-wider shrink-0">
                        STATUS:
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.filter(s => statusCounts[s.key]).map(s => (
                            <button
                                key={s.key}
                                onClick={() => { setFilterStatus(filterStatus === s.key ? null : s.key); setPage(0); }}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border transition-all duration-150",
                                    filterStatus === s.key
                                        ? "border-signal/50 bg-signal/15 text-signal"
                                        : "border-ghost/20 text-gray-500 hover:border-ghost/40 hover:text-gray-300"
                                )}
                            >
                                {s.icon} {s.label}
                                <span className="text-gray-600">{statusCounts[s.key]}</span>
                            </button>
                        ))}
                    </div>

                    {/* Clear filters */}
                    {(filterType || filterStatus || query) && (
                        <button
                            onClick={() => { setFilterType(null); setFilterStatus(null); setQuery(''); setPage(0); }}
                            className="px-2 py-0.5 text-[10px] font-mono text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                            <X size={10} /> CLEAR FILTERS
                        </button>
                    )}
                </div>
            </div>

            {/* ── Results List ────────────────────────────────────────── */}
            <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                    {paged.map(record => (
                        <motion.div
                            key={record.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                        >
                            <TaskRow
                                record={record}
                                onDelete={handleDelete}
                                onRefresh={reload}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Empty State */}
                {paged.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border border-ghost/20 bg-void/30 p-12 text-center"
                    >
                        <Terminal size={32} className="text-gray-700 mx-auto mb-4" />
                        <div className="text-sm font-mono text-gray-500 mb-1">
                            {records.length === 0
                                ? 'NO_EXECUTION_RECORDS'
                                : 'NO_MATCHING_RECORDS'
                            }
                        </div>
                        <div className="text-xs font-mono text-gray-600">
                            {records.length === 0
                                ? 'Launch an attack to see results here.'
                                : 'Try adjusting your search or filters.'
                            }
                        </div>
                    </motion.div>
                )}
            </div>

            {/* ── Pagination ─────────────────────────────────────────── */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-1 text-xs font-mono text-gray-500">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-3 py-1 border border-ghost/20 hover:border-signal/30 hover:text-signal disabled:opacity-30 transition-colors"
                    >
                        PREV
                    </button>
                    <span>PAGE {page + 1} / {totalPages} · {filtered.length} total</span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="px-3 py-1 border border-ghost/20 hover:border-signal/30 hover:text-signal disabled:opacity-30 transition-colors"
                    >
                        NEXT
                    </button>
                </div>
            )}
        </motion.div>
    );
}
