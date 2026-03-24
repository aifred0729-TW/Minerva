/**
 * Task Browser  /task  |  /task/:displayId
 *
 *  ┌─────────────┬──────────────────────┬──────────────────────────────────┐
 *  │  host tree  │  task list           │  task detail                     │
 *  │  200 px     │  300 px              │  flex                            │
 *  └─────────────┴──────────────────────┴──────────────────────────────────┘
 *
 *  Left  — domain/IP-range grouping → one row per machine (not per session)
 *  Mid   — all sessions for selected machine merged; multi-session badge per row
 *  Right — output (seeded from task.responses + live stream) / details / artifacts
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useSubscription, useLazyQuery } from '@apollo/client';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import {
    b64Decode as b64DecodeLib,
    decodeResponses,
    BrowserScriptOutput,
    StructuredResponseOutput,
    hasBuiltinStructuredRenderer,
    ParsedOutput,
    RawOutput,
    OutputModeToggle,
    type OutputMode,
} from '../components/OutputRenderer';
import {
    GET_CALLBACKS,
    STREAM_CALLBACK_TASKS,
    GET_TASK_BY_DISPLAY_ID,
    STREAM_TASK_RESPONSES_BY_ID,
    GET_TASK_ARTIFACTS_BY_ID,
    GET_BROWSERSCRIPT,
} from '../lib/api';
import {
    ChevronRight, ChevronDown, Search, Monitor, Globe, Network,
    Terminal, Clock, CheckCircle, XCircle, Loader, Hash,
    FileText, Database, ExternalLink, RefreshCw, X, Layers, User,
} from 'lucide-react';

// Clock / CheckCircle / XCircle / Loader — kept for future use

// ─── types ────────────────────────────────────────────────────────────────────

interface CbRow {
    id: number; display_id: number; host: string; user: string;
    ip: string; domain: string; active: boolean;
    payload: { payloadtype: { name: string } };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmtTs  = (ts?: string | null) => ts ? new Date(ts).toLocaleString() : '—';
const fmtHM  = (ts?: string | null) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

// b64Decode is provided by OutputRenderer (UTF-8 aware)
const b64Decode = b64DecodeLib;

const parseFirstIP = (ip: string): string => {
    try { const a = JSON.parse(ip); return Array.isArray(a) && a.length ? a[0] : ip; }
    catch { return ip || ''; }
};

const domainKey = (cb: CbRow): string => {
    if (cb.domain?.trim() && cb.domain.trim() !== '-') return cb.domain.trim().toUpperCase();
    const ip = parseFirstIP(cb.ip ?? '');
    const p  = ip.split('.');
    return p.length >= 3 ? `${p[0]}.${p[1]}.${p[2]}.x` : 'UNKNOWN';
};

const isDomainKey = (k: string) => !/^\d+\.\d+\.\d+\.x$/.test(k) && k !== 'UNKNOWN';

/** domain → host → sessions */
const buildTree = (cbs: CbRow[]) => {
    const domMap = new Map<string, Map<string, CbRow[]>>();
    for (const cb of cbs) {
        const dk = domainKey(cb);
        if (!domMap.has(dk)) domMap.set(dk, new Map());
        const hm   = domMap.get(dk)!;
        const host = (cb.host || `C${cb.display_id}`).toUpperCase();
        if (!hm.has(host)) hm.set(host, []);
        hm.get(host)!.push(cb);
    }
    return new Map([...domMap.entries()].sort(([a], [b]) => {
        if (isDomainKey(a) && !isDomainKey(b)) return -1;
        if (!isDomainKey(a) && isDomainKey(b)) return 1;
        return a.localeCompare(b);
    }));
};

type StatusTier = 'ok' | 'error' | 'running' | 'pending' | 'idle';
const statusTier = (s: string): StatusTier => {
    const l = (s ?? '').toLowerCase();
    if (l.includes('complet') || l.includes('success')) return 'ok';
    if (l.includes('error'))   return 'error';
    if (l.includes('process')) return 'running';
    if (l.includes('submit'))  return 'pending';
    return 'idle';
};
const TIER_COLOR: Record<StatusTier, string> = {
    ok:      '#00ff9d',
    error:   '#ff4444',
    running: '#ffbe00',
    pending: '#00c2ff',
    idle:    '#555',
};
const TIER_LABEL: Record<StatusTier, string> = {
    ok: 'DONE', error: 'ERR', running: 'RUN', pending: 'WAIT', idle: '—',
};

// ─── tiny atoms ───────────────────────────────────────────────────────────────

/** Glowing dot — with live pulse ring for running tasks */
const Dot = ({ tier, size = 8 }: { tier: StatusTier; size?: number }) => (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: size, height: size }}>
        {tier === 'running' && (
            <span className="mv-dot-ring" style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: TIER_COLOR['running'],
            }}/>
        )}
        <span style={{
            width: size, height: size, borderRadius: '50%',
            backgroundColor: TIER_COLOR[tier],
            boxShadow: tier !== 'idle' ? `0 0 6px ${TIER_COLOR[tier]}88` : undefined,
            display: 'inline-block', position: 'relative',
        }}/>
    </span>
);

const CbBadge = ({ id }: { id: number }) => (
    <span className="inline-flex items-center px-2 h-5 font-mono text-[11px] border border-[#00ffd140] text-[#00ffd1] bg-[#00ffd110] rounded-sm leading-none whitespace-nowrap font-semibold">
        C{id}
    </span>
);

// ─── MetaRow / SectionLabel ───────────────────────────────────────────────────

const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-white/[0.06] last:border-0">
        <span className="font-mono text-[11px] text-[#888] uppercase tracking-[0.1em] self-start pt-0.5">{label}</span>
        <span className="font-mono text-[13px] text-[#e0e0e0] min-w-0 break-all">{value ?? <span className="text-[#666]">—</span>}</span>
    </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-6 mb-2 font-mono text-[11px] text-[#666] uppercase tracking-[0.15em]">{children}</p>
);

// ─── HostTree ─────────────────────────────────────────────────────────────────

function HostTree({ callbacks, selectedKey, onSelect }: {
    callbacks: CbRow[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
}) {
    const tree = useMemo(() => buildTree(callbacks), [callbacks]);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggle = (k: string) => setCollapsed(prev => {
        const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
    });

    if (tree.size === 0) return (
        <div className="flex-1 flex items-center justify-center text-[#777] font-mono text-[12px]">NO HOSTS</div>
    );

    return (
        <div className="flex-1 overflow-y-auto">
            {[...tree.entries()].map(([dk, hm]) => {
                const isOpen = !collapsed.has(dk);
                return (
                    <div key={dk}>
                        {/* domain / range header */}
                        <button onClick={() => toggle(dk)}
                            className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-white/[0.04] transition-colors">
                            <span className="text-[#777] shrink-0">
                                {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                            </span>
                            {isDomainKey(dk)
                                ? <Globe size={11} className="shrink-0" style={{ color: '#4488ff' }}/>
                                : <Network size={11} className="shrink-0" style={{ color: '#00cc80' }}/>}
                            <span className="font-mono text-[11px] text-[#aaa] uppercase tracking-wider truncate flex-1 text-left font-semibold">{dk}</span>
                            <span className="font-mono text-[11px] text-[#666] shrink-0">{[...hm.values()].length}</span>
                        </button>

                        {isOpen && [...hm.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([host, cbs], hi) => {
                            const key    = `${dk}::${host}`;
                            const isSel  = selectedKey === key;
                            const active = cbs.some(c => c.active);
                            return (
                                <button key={host} onClick={() => onSelect(key)}
                                    style={{ ...( isSel ? { borderLeftColor: '#00ffd1', background: '#00ffd108' } : { borderLeftColor: 'transparent' }), animationDelay: `${hi * 30}ms` }}
                                    className="mv-slide-in-left w-full flex items-center gap-2 pl-6 pr-3 py-2 border-l-2 transition-colors hover:bg-white/[0.03] text-left">
                                    <Monitor size={13} className="shrink-0" style={{ color: '#777' }}/>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-[13px] font-bold truncate leading-tight"
                                            style={{ color: isSel ? '#00ffd1' : '#e0e0e0' }}>
                                            {host}
                                        </div>
                                        <div className="font-mono text-[11px] truncate mt-0.5" style={{ color: '#888' }}>
                                            {cbs[0]?.user} · {parseFirstIP(cbs[0]?.ip ?? '')}
                                        </div>
                                    </div>
                                    {cbs.length > 1
                                        ? <span className="font-mono text-[11px] border px-1.5 py-0.5 rounded-sm shrink-0" style={{ color: '#aaa', borderColor: '#555' }}>{cbs.length}</span>
                                        : <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#00ff9d' : '#333', flexShrink: 0, boxShadow: active ? '0 0 5px #00ff9d99' : undefined, display: 'inline-block' }}/>}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

// ─── TaskSubscriber (invisible subscription bridge) ───────────────────────────

function TaskSubscriber({ cbId, onBatch }: { cbId: number; onBatch: (id: number, b: any[]) => void }) {
    useSubscription(STREAM_CALLBACK_TASKS, {
        variables: { callback_display_id: cbId },
        onData: ({ data }) => {
            const b: any[] = data.data?.task_stream ?? [];
            if (b.length) onBatch(cbId, b);
        },
    });
    return null;
}

// ─── TaskList ─────────────────────────────────────────────────────────────────

function TaskList({ sessionCbs, selectedId, initialId, onSelect }: {
    sessionCbs: CbRow[];
    selectedId: number | null;
    initialId:  number | null;
    onSelect:   (t: any) => void;
}) {
    const [bySession, setBySession] = useState<Map<number, any[]>>(new Map());
    const [q, setQ]                 = useState('');
    const autoSel                   = useRef(false);
    const multi                     = sessionCbs.length > 1;

    const handleBatch = useCallback((cbId: number, batch: any[]) => {
        setBySession(prev => {
            const existing = prev.get(cbId) ?? [];
            const ids      = new Set(existing.map(t => t.id));
            const fresh    = batch.filter(t => !ids.has(t.id));
            const updated  = existing.map(t => { const u = batch.find(b => b.id === t.id); return u ? {...t,...u} : t; });
            const next     = [...updated, ...fresh];
            if (next.length === existing.length && !fresh.length) return prev;
            const m = new Map(prev); m.set(cbId, next); return m;
        });
    }, []);

    const all = useMemo(() => {
        const flat: any[] = [];
        for (const [cbId, tasks] of bySession)
            for (const t of tasks) flat.push({ ...t, _cbId: cbId });
        return flat.sort((a, b) => b.id - a.id);
    }, [bySession]);

    // auto-select from URL param
    useEffect(() => {
        if (autoSel.current || !initialId || !all.length) return;
        const m = all.find(t => t.display_id === initialId);
        if (m) { onSelect(m); autoSel.current = true; }
    }, [all, initialId, onSelect]);

    const filtered = useMemo(() => {
        const lq = q.trim().toLowerCase();
        if (!lq) return all;
        return all.filter(t =>
            (t.command_name    ?? '').toLowerCase().includes(lq) ||
            (t.display_params  ?? '').toLowerCase().includes(lq) ||
            String(t.display_id).includes(lq) ||
            (t.comment         ?? '').toLowerCase().includes(lq)
        );
    }, [all, q]);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* invisible subscribers */}
            {sessionCbs.map(cb => <TaskSubscriber key={cb.display_id} cbId={cb.display_id} onBatch={handleBatch}/>)}

            {/* search bar */}
            <div className="shrink-0 p-2 border-b border-white/[0.05]">
                <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2.5 pointer-events-none" style={{ color: '#777' }}/>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="filter tasks…"
                        className="w-full pl-7 pr-6 py-2 bg-[#0d0d0d] border border-[#2a2a2a] text-[#e0e0e0] font-mono text-[12px] focus:border-[#00ffd155] outline-none rounded-none placeholder:text-[#555]"/>
                    {q && <button onClick={() => setQ('')} className="absolute right-2 hover:text-[#ccc]" style={{ color: '#777' }}><X size={11}/></button>}
                </div>
            </div>

            {/* stats */}
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05]">
                <span className="font-mono text-[11px]" style={{ color: '#777' }}>{filtered.length}/{all.length}</span>
                {multi && <span className="flex items-center gap-1 font-mono text-[11px]" style={{ color: '#00ffd1aa' }}><Layers size={11}/>{sessionCbs.length} sessions</span>}
            </div>

            {/* list */}
            <div className="flex-1 overflow-y-auto">
                {!all.length && (
                    <div className="flex flex-col items-center justify-center gap-2 h-32" style={{ color: '#666' }}>
                        <Terminal size={20} className="animate-pulse"/>
                        <span className="font-mono text-[12px]">STREAMING…</span>
                    </div>
                )}
                {filtered.map((t, ti) => {
                    const tier = statusTier(t.status);
                    const isSel = t.display_id === selectedId;
                    return (
                        <button key={`${t.id}-${t._cbId}`} onClick={() => onSelect(t)}
                            style={{ ...(isSel ? { borderLeftColor: '#00ffd1', background: '#00ffd108' } : { borderLeftColor: 'transparent' }), animationDelay: `${Math.min(ti, 20) * 25}ms` }}
                            className="mv-fade-in-up w-full text-left px-3 py-2.5 border-b border-white/[0.04] border-l-2 hover:bg-white/[0.03] transition-colors">
                            <div className="flex items-center gap-2">
                                <Dot tier={tier}/>
                                <span className="font-mono text-[11px] shrink-0" style={{ color: '#888' }}>T{t.display_id}</span>
                                <span className="font-mono text-[14px] font-bold truncate flex-1"
                                    style={{ color: isSel ? '#fff' : '#e0e0e0' }}>
                                    {t.command_name}
                                </span>
                                {multi && <CbBadge id={t._cbId}/>}
                            </div>
                            {t.display_params && (
                                <div className="mt-1 ml-4 font-mono text-[12px] truncate" style={{ color: '#999' }}>{t.display_params}</div>
                            )}
                            <div className="mt-1 ml-4 flex items-center gap-3">
                                {t.operator?.username && <span className="font-mono text-[11px]" style={{ color: '#666' }}>{t.operator.username}</span>}
                                <span className="font-mono text-[11px]" style={{ color: '#666' }}>{fmtHM(t.timestamp)}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Output renderers are provided by OutputRenderer.tsx ────────────────────
// (ParsedOutput, RawOutput, OutputModeToggle imported at top)

// ─── TaskDetail ─────────────────────────────────────────────────────────────────

function TaskDetail({ task }: { task: any }) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'output'|'info'|'artifacts'>('output');
    const [outputMode, setOutputMode] = useState<OutputMode>('parsed');

    // Seed from task.responses (already fetched via TASK_FRAGMENT) then append live stream
    const [responses, setResponses] = useState<any[]>(() => task?.responses ?? []);
    const seededTaskId = useRef<number | null>(null);

    // ── Browser script ───────────────────────────────────────────────────────
    const [browserScriptFn,   setBrowserScriptFn]   = useState<Function | null>(null);
    const [browserScriptData, setBrowserScriptData] = useState<any | null>(null);

    const [fetchBrowserScript] = useLazyQuery(GET_BROWSERSCRIPT, {
        fetchPolicy: 'network-only',
        onCompleted: (d: any) => {
            const scripts = d?.browserscript || [];
            if (!scripts.length) { setBrowserScriptFn(null); setBrowserScriptData(null); return; }
            try {
                // eslint-disable-next-line no-new-func
                const fn = Function(`"use strict";return(${scripts[0].script})`)();
                setBrowserScriptFn(() => fn);
            } catch { setBrowserScriptFn(null); setBrowserScriptData(null); }
        },
        onError: () => { setBrowserScriptFn(null); },
    });

    useEffect(() => {
        if (seededTaskId.current === task?.id) return;
        seededTaskId.current = task?.id ?? null;
        setResponses(task?.responses ?? []);
        setTab('output');
        setOutputMode('parsed');
        // Reset browser script state for new task
        setBrowserScriptFn(null);
        setBrowserScriptData(null);
        if (task?.command?.id) fetchBrowserScript({ variables: { command_id: task.command.id } });
    }, [task?.id, task?.responses, task?.command?.id]);

    // Re-run browser script whenever responses or script function changes
    useEffect(() => {
        if (!browserScriptFn || !responses.length) { setBrowserScriptData(null); return; }
        try {
            const rawArr = responses.map((r: any) => b64Decode(r.response ?? ''));
            const result = browserScriptFn(task, rawArr);
            setBrowserScriptData(
                result && typeof result === 'object' && Object.keys(result).length > 0 ? result : null
            );
        } catch { setBrowserScriptData(null); }
    }, [browserScriptFn, responses]);

    useSubscription(STREAM_TASK_RESPONSES_BY_ID, {
        variables: { task_id: task.id },
        skip: !task?.id,
        onData: ({ data }) => {
            const batch: any[] = data.data?.response_stream ?? [];
            if (!batch.length) return;
            setResponses(prev => {
                const ids  = new Set(prev.map((r: any) => r.id));
                const news = batch.filter((r: any) => !ids.has(r.id));
                return news.length ? [...prev, ...news].sort((a, b) => a.id - b.id) : prev;
            });
        },
    });

    const { data: artData } = useQuery(GET_TASK_ARTIFACTS_BY_ID, {
        variables: { task_id: task.id },
        skip: !task?.id,
        fetchPolicy: 'cache-and-network',
    });
    const artifacts: any[] = artData?.taskartifact ?? [];

    const decoded = useMemo(() => decodeResponses(responses), [responses]);
    const hasStructured = useMemo(() => hasBuiltinStructuredRenderer(decoded), [decoded]);

    const tags: any[] = task.tags ?? [];
    const cb            = task.callback;
    const tier          = statusTier(task.status);
    const color         = TIER_COLOR[tier];

    const TABS = [
        { key: 'output',    label: 'OUTPUT',    icon: Terminal  },
        { key: 'info',      label: 'DETAILS',   icon: FileText  },
        { key: 'artifacts', label: `ARTIFACTS${artifacts.length ? ` · ${artifacts.length}` : ''}`, icon: Database },
    ] as const;

    return (
        <div className="flex flex-col h-full min-h-0" style={{ background: '#050505' }}>
            {/* ── header ── */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/[0.06]"
                style={{ background: 'linear-gradient(180deg,#0d0d0d 0%,#080808 100%)' }}>
                <div className="flex items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[12px]" style={{ color: '#888' }}>T{task.display_id}</span>
                            <span className="font-mono text-[18px] font-bold text-white tracking-tight">{task.command_name}</span>
                            <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold" style={{ color }}>
                                <Dot tier={tier}/>
                                {TIER_LABEL[tier]}
                            </span>
                        </div>
                        {task.display_params && (
                            <div className="mt-2 font-mono text-[13px] break-all leading-relaxed line-clamp-2" style={{ color: '#999' }}>
                                {task.display_params}
                            </div>
                        )}
                    </div>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 shrink-0">
                            {tags.map((t: any, i: number) => (
                                <span key={i} className="font-mono text-[11px] px-2 py-1 rounded-sm border font-semibold"
                                    style={{ color: t.tagtype.color, borderColor: t.tagtype.color+'66', background: t.tagtype.color+'18' }}>
                                    {t.tagtype.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {cb && (
                    <div className="flex items-center gap-2 font-mono text-[12px]" style={{ color: '#888' }}>
                        <Monitor size={13} className="shrink-0" style={{ color: '#777' }}/>
                        <span style={{ color: '#bbb' }}>{cb.user}@</span>
                        <span className="font-bold" style={{ color: '#e0e0e0' }}>{cb.host}</span>
                        <span className="mx-1" style={{ color: '#444' }}>│</span>
                        <CbBadge id={cb.display_id}/>
                        <button onClick={() => navigate(`/console/${cb.display_id}`)}
                            className="flex items-center gap-1 transition-colors hover:text-[#00ffd1]"
                            style={{ color: '#00ffd188' }}>
                            console <ExternalLink size={10}/>
                        </button>
                    </div>
                )}
            </div>

            {/* ── tabs ── */}
            <div className="shrink-0 flex items-center border-b border-white/[0.06]"
                style={{ background: '#080808' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = tab === key;
                    return (
                        <button key={key} onClick={() => setTab(key as typeof tab)}
                            className="relative flex items-center gap-1.5 px-4 py-3 font-mono text-[12px] uppercase tracking-wider transition-colors"
                            style={{ color: active ? '#00ffd1' : '#777', fontWeight: active ? 700 : 500 }}>
                            <Icon size={10}/>
                            {label}
                            {active && (
                                <span className="mv-tab-active-bar absolute bottom-0 left-0 right-0 h-px" style={{ background: '#00ffd1' }}/>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── tab content ── */}
            <div key={tab} className="mv-fade-in flex-1 overflow-y-auto min-h-0">

                {tab === 'output' && (
                    <div className="flex flex-col h-full min-h-0">
                        {/* Output mode toggle bar */}
                        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b"
                            style={{ borderColor: '#ffffff0a', background: '#080808' }}>
                            {task.comment && (
                                <div className="flex items-center gap-1.5 font-mono text-[11px] flex-1 truncate" style={{ color: '#888' }}>
                                    <FileText size={10} style={{ color: '#4488ff', flexShrink: 0 }}/>
                                    <span className="truncate">{task.comment}</span>
                                </div>
                            )}
                            {/* Browser script badge */}
                            {browserScriptData && outputMode === 'parsed' && (
                                <div className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-sm border"
                                    style={{ color: '#00ffd188', borderColor: '#00ffd122', background: '#00ffd108' }}
                                    title="Output rendered by command browser script">
                                    <Hash size={9}/> script
                                </div>
                            )}
                            <div className="ml-auto">
                                <OutputModeToggle mode={outputMode} onChange={setOutputMode}/>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto min-h-0 p-4">
                            {decoded.length === 0 ? (
                                <p className="font-mono text-[13px] animate-pulse" style={{ color: '#555' }}>waiting for output…</p>
                            ) : outputMode === 'raw' ? (
                                <RawOutput responses={decoded}/>
                            ) : (hasStructured || !browserScriptData) ? (
                                /* ── Built-in structured renderer wins (ifconfig / netstat / ps / ls) ──
                                   Also used as fallback when no browser script is present. */
                                <StructuredResponseOutput responses={decoded}/>
                            ) : (
                                /* ── Browser script rendered: full Console-equivalent pipeline ── */
                                <BrowserScriptOutput bsd={browserScriptData}/>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'info' && (
                    <div className="p-4">
                        <MetaRow label="status"     value={<span style={{ color: TIER_COLOR[tier] }}>{(task.status ?? '').toUpperCase()}</span>}/>
                        <MetaRow label="operator"   value={task.operator?.username}/>
                        <MetaRow label="tasked from" value={task.taskinglocation}/>
                        <MetaRow label="params"     value={task.original_params}/>
                        <MetaRow label="submitted"  value={fmtTs(task.status_timestamp_submitted)}/>
                        <MetaRow label="completed"  value={fmtTs(task.completed_at || task.status_timestamp_processed)}/>
                        {cb && <>
                            <SectionLabel>callback</SectionLabel>
                            <MetaRow label="session"    value={<CbBadge id={cb.display_id}/>}/>
                            <MetaRow label="user"       value={cb.user}/>
                            <MetaRow label="host"       value={cb.host}/>
                            <MetaRow label="domain"     value={cb.domain}/>
                            <MetaRow label="ip"         value={parseFirstIP(cb.ip ?? '')}/>
                            <MetaRow label="integrity"  value={cb.integrity_level}/>
                        </>}
                    </div>
                )}

                {tab === 'artifacts' && (
                    <div className="p-4 space-y-2">
                        {!artifacts.length && (
                            <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: '#666' }}>
                                <Database size={24}/>
                                <p className="font-mono text-[12px]">NO ARTIFACTS</p>
                            </div>
                        )}
                        {artifacts.map((a: any) => (
                            <div key={a.id} className="px-3 py-2.5 border border-white/[0.05] space-y-1"
                                style={{ background: '#0a0a0a' }}>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-[12px] font-bold uppercase" style={{ color: '#999' }}>{a.base_artifact}</span>
                                    {a.host && <span className="font-mono text-[11px]" style={{ color: '#888' }}>{a.host}</span>}
                                    <span className="ml-auto font-mono text-[11px]" style={{ color: '#666' }}>{fmtTs(a.timestamp)}</span>
                                </div>
                                <p className="font-mono text-[13px] break-all" style={{ color: '#ccc' }}>{a.artifact_text}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SingleTaskView() {
    const { displayId }          = useParams<{ displayId?: string }>();
    const navigate               = useNavigate();
    const { isSidebarCollapsed } = useAppStore();
    const initId                 = displayId ? parseInt(displayId, 10) : null;

    const [selHost, setSelHost]   = useState<string | null>(null);
    const [selTask, setSelTask]   = useState<any>(null);

    const { data: cbData, loading: cbLoading, refetch } = useQuery(GET_CALLBACKS, {
        fetchPolicy: 'cache-and-network',
        pollInterval: 15_000,
    });
    const callbacks: CbRow[] = cbData?.callback ?? [];

    const selCbs = useMemo<CbRow[]>(() => {
        if (!selHost) return [];
        const [dk, host] = selHost.split('::');
        return callbacks.filter(cb =>
            domainKey(cb) === dk &&
            (cb.host || `C${cb.display_id}`).toUpperCase() === host
        );
    }, [selHost, callbacks]);

    const [fetchById] = useLazyQuery(GET_TASK_BY_DISPLAY_ID, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            const t = data?.task?.[0];
            if (!t) return;
            setSelTask(t);
            if (t.callback) {
                const cbRow = callbacks.find(c => c.display_id === t.callback.display_id);
                if (cbRow) {
                    const dk   = domainKey(cbRow);
                    const host = (cbRow.host || `C${cbRow.display_id}`).toUpperCase();
                    setSelHost(`${dk}::${host}`);
                }
            }
        },
    });

    useEffect(() => {
        if (initId) fetchById({ variables: { display_id: initId } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initId]);

    const totalMachines = useMemo(() => {
        const s = new Set(callbacks.map(cb => `${domainKey(cb)}::${(cb.host||`C${cb.display_id}`).toUpperCase()}`));
        return s.size;
    }, [callbacks]);

    const handleHostSelect = (key: string) => {
        setSelHost(key); setSelTask(null);
        navigate('/task', { replace: true });
    };
    const handleTaskSelect = (t: any) => {
        setSelTask(t);
        navigate(`/task/${t.display_id}`, { replace: true });
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar/>

            <div className={cn(
                'transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden',
                isSidebarCollapsed ? 'ml-16' : 'ml-64'
            )}>

                {/* ── Header ── */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Layers size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">TASK BROWSER</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                {totalMachines} MACHINE{totalMachines !== 1?'S':''} · {callbacks.length} SESSION{callbacks.length !== 1?'S':''}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => refetch()}
                        className="flex items-center gap-2 text-xs px-4 py-2 border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/40 font-mono transition-colors rounded">
                        <RefreshCw size={12}/> REFRESH
                    </button>
                </header>

                <div className="flex-1 flex min-h-0 overflow-hidden">

                    {/* ── LEFT: host tree 200px ── */}
                    <div className="w-[200px] shrink-0 flex flex-col min-h-0 border-r border-white/[0.05]"
                        style={{ background: '#080808' }}>
                        <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] flex items-center gap-1.5">
                            <Monitor size={12} style={{ color: '#777' }}/>
                            <span className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: '#888' }}>hosts</span>
                        </div>
                        {cbLoading && !callbacks.length ? (
                            <div className="flex-1 flex items-center justify-center font-mono text-[12px] animate-pulse" style={{ color: '#666' }}>loading…</div>
                        ) : (
                            <HostTree callbacks={callbacks} selectedKey={selHost} onSelect={handleHostSelect}/>
                        )}
                    </div>

                    {/* ── MID: task list 300px ── */}
                    <div className="w-[300px] shrink-0 flex flex-col min-h-0 border-r border-white/[0.05]"
                        style={{ background: '#060606' }}>
                        <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] flex items-center gap-1.5">
                            <Hash size={12} style={{ color: '#777' }}/>
                            <span className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: '#888' }}>tasks</span>
                            {selHost && (
                                <span className="ml-auto font-mono text-[11px] font-bold truncate max-w-[120px]"
                                    style={{ color: '#00ffd1cc' }}>
                                    {selHost.split('::')[1]}
                                </span>
                            )}
                        </div>
                        {selCbs.length ? (
                            <TaskList
                                sessionCbs={selCbs}
                                selectedId={selTask?.display_id ?? null}
                                initialId={initId}
                                onSelect={handleTaskSelect}
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: '#666' }}>
                                <Monitor size={24}/>
                                <p className="font-mono text-[12px]">select a host</p>
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT: detail ── */}
                    <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                        {selTask ? (
                            <div key={selTask.id} className="mv-slide-in-right h-full">
                                <TaskDetail task={selTask}/>
                            </div>
                        ) : (
                            <div className="mv-fade-in flex flex-col items-center justify-center h-full gap-3" style={{ color: '#666' }}>
                                <Terminal size={30}/>
                                <p className="font-mono text-[13px]">
                                    {selCbs.length ? 'select a task' : 'select a host'}
                                </p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
