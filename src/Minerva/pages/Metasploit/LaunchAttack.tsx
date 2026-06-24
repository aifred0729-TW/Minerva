import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    createExecution, saveExecution, extractSessionFromOutput, extractJobIdFromOutput,
    type MsfExecutionRecord,
} from './executionHistory';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
    Search, Bug, ChevronRight, ArrowLeft, Crosshair, Play, Loader2,
    AlertTriangle, CheckCircle, ChevronDown, Target, Zap, FileText,
    Shield, Layers, Monitor, Globe, Network, Server, Wifi, Database,
    Cpu, Box, Hash, Eye, Filter, X, SlidersHorizontal, ChevronLeft, Radio
} from 'lucide-react';
import { useSubscription } from "@apollo/client/react";
import { cn } from '../../lib/utils';
import {
    listModules, getModuleInfo, getModuleOptions, getCompatiblePayloads, executeModule,
    consoleCreate, consoleRead, consoleWrite, consoleDestroy, getSessions,
    type MsfModuleInfo, type MsfModuleOption, type MsfExecuteResult, type MsfSession,
} from './msfrpc';
import { CALLBACKPORT_STREAM } from '../../lib/api/tunnels';
import type { CallbackPort } from '../../types/tunnels';
import { ParsedOutputView } from './ParsedOutputView';
import { useAllMsfTunnels } from './msfTunnelStore';

const CONSOLE_WRITE_DELAY_MS = 150;
const CONSOLE_POLL_INTERVAL_MS = 1_500;

// ── Animation ───────────────────────────────────────────────────────────────
const fadeIn: Variants = {
    hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

// ── Types ───────────────────────────────────────────────────────────────────
type ModuleType = 'exploit' | 'auxiliary' | 'post' | 'evasion';
type Step = 'select' | 'configure' | 'result';

interface ModuleTypeDef {
    key: ModuleType;
    plural: string;
    label: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    activeColor: string;   // tailwind bg for selected state
    hoverBorder: string;   // hover border highlight
}

const MODULE_TYPES: ModuleTypeDef[] = [
    { key: 'exploit', plural: 'exploits', label: 'EXPLOITS', desc: 'Remote & local exploitation', icon: <Bug size={18} />, color: 'text-red-400', activeColor: 'bg-red-500', hoverBorder: 'hover:border-red-400/70' },
    { key: 'auxiliary', plural: 'auxiliary', label: 'AUXILIARY', desc: 'Scanners & recon', icon: <Eye size={18} />, color: 'text-yellow-400', activeColor: 'bg-yellow-500', hoverBorder: 'hover:border-yellow-400/70' },
    { key: 'post', plural: 'post', label: 'POST', desc: 'Post-exploitation', icon: <Shield size={18} />, color: 'text-purple-400', activeColor: 'bg-purple-500', hoverBorder: 'hover:border-purple-400/70' },
    { key: 'evasion', plural: 'evasion', label: 'EVASION', desc: 'AV/EDR evasion', icon: <Layers size={18} />, color: 'text-orange-400', activeColor: 'bg-orange-500', hoverBorder: 'hover:border-orange-400/70' },
];

// ── Parse module path for filter facets ─────────────────────────────────────
function parseModule(name: string): { platform: string; service: string; leaf: string } {
    const parts = name.split('/');
    if (parts.length >= 3) return { platform: parts[0], service: parts[1], leaf: parts.slice(2).join('/') };
    if (parts.length === 2) return { platform: parts[0], service: '', leaf: parts[1] };
    return { platform: '', service: '', leaf: name };
}

// Platform icons
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
    windows: <Monitor size={13} />, linux: <Server size={13} />, unix: <Server size={13} />,
    osx: <Cpu size={13} />, apple_ios: <Cpu size={13} />, android: <Box size={13} />,
    multi: <Globe size={13} />, freebsd: <Server size={13} />, bsd: <Server size={13} />,
    solaris: <Server size={13} />, aix: <Server size={13} />, mainframe: <Database size={13} />,
    firefox: <Globe size={13} />, dialup: <Wifi size={13} />,
};

function rankColor(rank: string): string {
    const r = rank?.toLowerCase();
    if (r === 'excellent') return 'text-green-400 bg-green-500/15';
    if (r === 'great') return 'text-emerald-400 bg-emerald-500/15';
    if (r === 'good') return 'text-cyan-400 bg-cyan-500/15';
    if (r === 'normal') return 'text-yellow-400 bg-yellow-500/15';
    if (r === 'average') return 'text-orange-400 bg-orange-500/15';
    if (r === 'low') return 'text-red-400 bg-red-500/15';
    return 'text-zinc-200 bg-gray-500/15';
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — MODULE SELECTOR  (left sidebar + right content)
// ═══════════════════════════════════════════════════════════════════════════
function ModuleSelector({ onSelect }: { onSelect: (type: ModuleType, name: string) => void }) {
    const [activeType, setActiveType] = useState<ModuleType>('exploit');
    const [modules, setModules] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;
    const cacheRef = useRef<Record<string, string[]>>({});
    const [counts, setCounts] = useState<Record<string, number>>({});

    // Filters — multi-select via Set
    const [filterPlatforms, setFilterPlatforms] = useState<Set<string>>(new Set());
    const [filterServices, setFilterServices] = useState<Set<string>>(new Set());

    // Pre-fetch all module counts on mount
    useEffect(() => {
        MODULE_TYPES.forEach(async (t) => {
            if (cacheRef.current[t.key]) { setCounts(prev => ({ ...prev, [t.key]: cacheRef.current[t.key].length })); return; }
            try {
                const mods = await listModules(t.plural);
                cacheRef.current[t.key] = mods;
                setCounts(prev => ({ ...prev, [t.key]: mods.length }));
            } catch { /* ignore */ }
        });
    }, []);

    const fetchModules = useCallback(async (type: ModuleType) => {
        const def = MODULE_TYPES.find(t => t.key === type)!;
        if (cacheRef.current[type]) { setModules(cacheRef.current[type]); return; }
        setLoading(true);
        try {
            const mods = await listModules(def.plural);
            cacheRef.current[type] = mods;
            setModules(mods);
            setCounts(prev => ({ ...prev, [type]: mods.length }));
        } catch { setModules([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchModules(activeType); }, [activeType, fetchModules]);
    useEffect(() => { setPage(0); }, [search, activeType, filterPlatforms, filterServices]);

    // Derive facets from module names
    const parsed = useMemo(() => modules.map(m => ({ name: m, ...parseModule(m) })), [modules]);

    const platforms = useMemo(() => {
        const c: Record<string, number> = {};
        for (const p of parsed) { if (p.platform) c[p.platform] = (c[p.platform] || 0) + 1; }
        return Object.entries(c).sort((a, b) => b[1] - a[1]);
    }, [parsed]);

    const services = useMemo(() => {
        const c: Record<string, number> = {};
        for (const p of parsed) {
            if (filterPlatforms.size > 0 && !filterPlatforms.has(p.platform)) continue;
            if (p.service) c[p.service] = (c[p.service] || 0) + 1;
        }
        return Object.entries(c).sort((a, b) => b[1] - a[1]);
    }, [parsed, filterPlatforms]);

    const filtered = useMemo(() => {
        let list = parsed;
        if (filterPlatforms.size > 0) list = list.filter(m => filterPlatforms.has(m.platform));
        if (filterServices.size > 0) list = list.filter(m => filterServices.has(m.service));
        if (search) { const q = search.toLowerCase(); list = list.filter(m => m.name.toLowerCase().includes(q)); }
        return list;
    }, [parsed, filterPlatforms, filterServices, search]);

    const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    const handleTypeClick = (type: ModuleType) => {
        setActiveType(type);
        setFilterPlatforms(new Set());
        setFilterServices(new Set());
        setSearch('');
    };

    const togglePlatform = (plat: string) => {
        setFilterPlatforms(prev => { const n = new Set(prev); if (n.has(plat)) n.delete(plat); else n.add(plat); return n; });
    };
    const toggleService = (svc: string) => {
        setFilterServices(prev => { const n = new Set(prev); if (n.has(svc)) n.delete(svc); else n.add(svc); return n; });
    };
    const clearFilters = () => { setFilterPlatforms(new Set()); setFilterServices(new Set()); setSearch(''); };

    const typeDef = MODULE_TYPES.find(t => t.key === activeType)!;

    return (
        <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="show"
            // Dynamic height — extends to the viewport bottom minus the page
            // chrome (header + tabs + step indicator + padding). Keeps a sane
            // floor so the panel still looks healthy on short laptop screens.
            className="flex gap-0 h-[calc(100vh-220px)] min-h-[560px] border border-ghost/15 rounded-md overflow-hidden"
        >
            {/* ── Left Sidebar: Module Types ───────────────────────── */}
            <div className="w-48 shrink-0 border-r border-ghost/20 flex flex-col">
                <div className="text-[9px] font-mono text-zinc-300 uppercase tracking-[0.2em] px-4 py-3">MODULE TYPE</div>
                <div className="flex-1 space-y-1 px-2">
                    {MODULE_TYPES.map(t => {
                        const isActive = activeType === t.key;
                        const count = counts[t.key];
                        return (
                            <button
                                key={t.key}
                                onClick={() => handleTypeClick(t.key)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-3 text-left transition-all duration-200 border border-transparent",
                                    isActive
                                        ? `${t.activeColor} text-black font-bold`
                                        : `bg-transparent ${t.color} ${t.hoverBorder}`
                                )}
                            >
                                <span className={cn("shrink-0", isActive ? "text-black" : t.color)}>
                                    {t.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className={cn("text-[11px] font-mono font-bold tracking-wider", isActive ? "text-black" : "text-white")}>{t.label}</div>
                                    <div className={cn("text-[9px] font-mono", isActive ? "text-black/60" : "text-zinc-300")}>
                                        {count != null ? count.toLocaleString() : '...'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Right Content — smooth-minimal module browser ──────── */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Top: type label + count + search (full-width) */}
                <div className="px-5 py-4 border-b border-ghost/15 flex items-center gap-4">
                    <div className={cn('flex items-center gap-2.5 shrink-0', typeDef.color)}>
                        {typeDef.icon}
                        <span className="text-base font-mono font-bold tracking-[0.2em]">{typeDef.label}</span>
                    </div>
                    <span className="text-sm font-mono text-signal tabular-nums">
                        {filtered.length.toLocaleString()}
                        <span className="text-signal/80 ml-1.5">modules</span>
                    </span>
                    <div className="flex-1" />
                    <div className="relative w-72 shrink-0">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-signal/80" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search modules…"
                            className="w-full bg-black/60 border border-signal/20 rounded-md text-signal font-mono text-sm pl-9 pr-3 py-2 focus:border-signal/60 focus:outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Filters — PLATFORM + SERVICE rows */}
                <div className="px-5 py-3 border-b border-ghost/15 space-y-2">
                    <div className="flex items-start gap-3">
                        <span className="text-xs font-mono tracking-[0.25em] text-signal/80 w-20 shrink-0 pt-1.5 flex items-center gap-1.5">
                            <Monitor size={11} /> PLATFORM
                        </span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                            {platforms.slice(0, 12).map(([plat, count]) => {
                                const isActive = filterPlatforms.has(plat);
                                return (
                                    <button
                                        key={plat}
                                        onClick={() => togglePlatform(plat)}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-xs tracking-[0.15em] transition-all',
                                            isActive
                                                ? 'border-accent bg-accent/10 text-accent font-bold'
                                                : 'border-signal/20 text-signal hover:border-signal/50 hover:bg-signal/[0.04]',
                                        )}
                                    >
                                        {PLATFORM_ICONS[plat] || <Globe size={11} />}
                                        <span>{plat}</span>
                                        <span className={cn('text-xs tabular-nums', isActive ? 'text-accent/80' : 'text-signal/60')}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {(filterPlatforms.size > 0 || filterServices.size > 0) && (
                            <button
                                onClick={clearFilters}
                                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-400/40 bg-amber-400/[0.05] font-mono text-xs tracking-[0.2em] text-amber-400 hover:bg-amber-400/10 transition-colors"
                            >
                                <X size={11} /> CLEAR
                            </button>
                        )}
                    </div>

                    {services.length > 0 && (
                        <div className="flex items-start gap-3">
                            <span className="text-xs font-mono tracking-[0.25em] text-signal/80 w-20 shrink-0 pt-1.5 flex items-center gap-1.5">
                                <Network size={11} /> SERVICE
                            </span>
                            <div className="flex flex-wrap gap-1.5 flex-1">
                                {services.slice(0, 12).map(([svc, count]) => {
                                    const isActive = filterServices.has(svc);
                                    return (
                                        <button
                                            key={svc}
                                            onClick={() => toggleService(svc)}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-xs tracking-[0.15em] transition-all',
                                                isActive
                                                    ? 'border-accent bg-accent/10 text-accent font-bold'
                                                    : 'border-signal/20 text-signal hover:border-signal/50 hover:bg-signal/[0.04]',
                                            )}
                                        >
                                            <span>{svc}</span>
                                            <span className={cn('text-xs tabular-nums', isActive ? 'text-accent/80' : 'text-signal/60')}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Module cards — internal scroll */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-signal font-mono text-sm">
                            <Loader2 size={18} className="animate-spin mr-2" /> Loading modules…
                        </div>
                    ) : paged.length === 0 ? (
                        <div className="border border-dashed border-signal/20 rounded-md p-12 text-center text-signal font-mono">
                            <Box size={36} className="mx-auto mb-2 opacity-50" />
                            <div className="text-sm font-bold tracking-[0.2em]">NO_MATCHING_MODULES</div>
                            <div className="text-xs text-signal/80 mt-1">Try clearing filters or changing the module type.</div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {paged.map(({ name, platform, service, leaf }) => (
                                <button
                                    key={name}
                                    onClick={() => onSelect(activeType, name)}
                                    className={cn(
                                        'group w-full text-left rounded-md border border-signal/20 hover:border-signal/50',
                                        'bg-black/30 hover:bg-black/50 px-4 py-2.5 flex items-center gap-3 transition-all',
                                    )}
                                >
                                    {/* Platform icon in soft frame */}
                                    <div className={cn(
                                        'flex items-center justify-center w-10 h-10 rounded-md shrink-0 transition-colors',
                                        'bg-signal/[0.05] group-hover:bg-signal/10',
                                        typeDef.color,
                                    )}>
                                        {PLATFORM_ICONS[platform] || <Globe size={16} />}
                                    </div>

                                    {/* Module name + badges */}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-sm truncate">
                                            <span className="text-signal/70">{platform}{service ? `/${service}` : ''}/</span>
                                            <span className="text-signal font-bold">{leaf}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span className="inline-flex items-center gap-1 border border-signal/30 px-1.5 py-px text-[10px] tracking-[0.2em] text-signal rounded font-mono">
                                                {PLATFORM_ICONS[platform] || <Globe size={9} />}
                                                {platform}
                                            </span>
                                            {service && (
                                                <span className="border border-signal/30 px-1.5 py-px text-[10px] tracking-[0.2em] text-signal rounded font-mono">
                                                    {service}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <ChevronRight
                                        size={16}
                                        className="text-signal/60 group-hover:text-signal group-hover:translate-x-0.5 shrink-0 transition-all"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination — clean rounded buttons */}
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-ghost/15 flex items-center justify-between font-mono text-xs">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-signal/20 text-signal hover:border-signal/50 hover:bg-signal/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-all tracking-[0.2em]"
                        >
                            <ChevronLeft size={12} /> PREV
                        </button>
                        <div className="flex items-baseline gap-2 text-signal">
                            <span className="tracking-[0.2em] text-signal/80">PAGE</span>
                            <span className="font-bold text-base tabular-nums">{page + 1}</span>
                            <span className="text-signal/60">/</span>
                            <span className="tabular-nums">{totalPages}</span>
                        </div>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-signal/20 text-signal hover:border-signal/50 hover:bg-signal/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-all tracking-[0.2em]"
                        >
                            NEXT <ChevronRight size={12} />
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — CONFIGURE  (left: info+required | right: optional+payload+advanced)
// ═══════════════════════════════════════════════════════════════════════════
interface LaunchInfo {
    moduleName: string;
    moduleType: string;
    options: Record<string, string>;
    proxy?: string;
}

function ModuleConfigurator({ type, name, onBack, onLaunched }: {
    type: ModuleType; name: string;
    onBack: () => void; onLaunched: (info: LaunchInfo) => void;
}) {
    const [info, setInfo] = useState<MsfModuleInfo | null>(null);
    const [options, setOptions] = useState<Record<string, MsfModuleOption>>({});
    const [payloads, setPayloads] = useState<string[]>([]);
    const [payloadOptions, setPayloadOptions] = useState<Record<string, MsfModuleOption>>({});
    const [payloadOptsLoading, setPayloadOptsLoading] = useState(false);
    const [values, setValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [payloadSearch, setPayloadSearch] = useState('');
    const [payloadDropdownOpen, setPayloadDropdownOpen] = useState(false);
    const [selectedProxy, setSelectedProxy] = useState<string>(''); // 'socks5:host:port' or ''

    // Subscribe to active SOCKS proxies from Mythic.
    //
    // CALLBACKPORT_STREAM is a Hasura `_stream` subscription — each event
    // contains only the rows that *changed* since the cursor, not the full
    // table. If we read straight off `data.callbackport_stream` every time
    // (the previous shape) the visible list shrinks to whatever happened
    // to be in the last delta, so the SOCKS option vanishes after a while
    // even though the session is still alive. Fix: accumulate into state
    // keyed by `id`, exactly like the Tunnels page does.
    const [mythicPorts, setMythicPorts] = useState<CallbackPort[]>([]);
    useSubscription<any>(CALLBACKPORT_STREAM, {
        fetchPolicy: 'no-cache',
        onData: ({ data }: any) => {
            const incoming: CallbackPort[] = data?.data?.callbackport_stream || [];
            if (!incoming.length) return;
            setMythicPorts(prev => {
                const next = [...prev];
                for (const cur of incoming) {
                    const idx = next.findIndex(p => p.id === cur.id);
                    if (idx > -1) next[idx] = cur;
                    else next.push(cur);
                }
                return next;
            });
        },
        onError: (err) => { console.error('[CALLBACKPORT_STREAM] subscription error:', err); },
    });

    // Also include MSF SOCKS tunnels (they don't live in Mythic's
    // callbackport table). One tunnel per operation now — a single port
    // covers all attached meterpreter sessions via MSF's route table.
    // MSF SOCKS auxiliary is bound to 0.0.0.0 inside the MSF container,
    // so from MSF's own perspective the proxy is reachable at
    // `127.0.0.1:<port>`.
    const msfTunnels = useAllMsfTunnels();

    interface ProxyOption {
        key: string;
        value: string;            // The `Proxies` option value passed to MSF.
        port: number;
        label: string;            // Bottom-line description (operation identity).
        source: 'mythic' | 'msf';
    }

    const proxyOptions = useMemo<ProxyOption[]>(() => {
        const list: ProxyOption[] = [];
        for (const p of mythicPorts) {
            if (p.port_type !== 'socks' || p.deleted) continue;
            const cb = p.callback;
            list.push({
                key: `mythic-${p.id}`,
                value: `socks5:host.docker.internal:${p.local_port}`,
                port: p.local_port,
                label: `CB#${cb.display_id} · ${cb.host || cb.ip} · ${cb.user}@${cb.process_name || '?'}`,
                source: 'mythic',
            });
        }
        for (const t of msfTunnels) {
            const sessionCount = Object.keys(t.sessions).length;
            const routeCount = Object.values(t.sessions).reduce((n, s) => n + s.subnets.length, 0);
            list.push({
                key: `msf-op-${t.operationId}`,
                value: `socks5:127.0.0.1:${t.port}`,
                port: t.port,
                label: `Op #${t.operationId} · ${sessionCount} session${sessionCount === 1 ? '' : 's'} · ${routeCount} route${routeCount === 1 ? '' : 's'}`,
                source: 'msf',
            });
        }
        return list;
    }, [mythicPorts, msfTunnels]);

    // Load module info, options, payloads
    useEffect(() => {
        (async () => {
            setLoading(true); setError(null);
            try {
                const [modInfo, modOpts, compat] = await Promise.all([
                    getModuleInfo(type, name),
                    getModuleOptions(type, name),
                    type === 'exploit' ? getCompatiblePayloads(name) : Promise.resolve([]),
                ]);
                setInfo(modInfo); setOptions(modOpts); setPayloads(compat);
                const defaults: Record<string, string> = {};
                for (const [k, v] of Object.entries(modOpts)) {
                    if (v.default != null && v.default !== '') defaults[k] = String(v.default);
                }
                setValues(defaults);
            } catch (e: any) { setError(e.message); }
            finally { setLoading(false); }
        })();
    }, [type, name]);

    // Load payload options when payload is selected
    useEffect(() => {
        const payload = values.PAYLOAD;
        if (!payload) { setPayloadOptions({}); return; }
        (async () => {
            setPayloadOptsLoading(true);
            try {
                const opts = await getModuleOptions('payload', payload);
                setPayloadOptions(opts);
                setValues(prev => {
                    const next = { ...prev };
                    for (const [k, v] of Object.entries(opts)) {
                        if (!(k in next) && v.default != null && v.default !== '') next[k] = String(v.default);
                    }
                    return next;
                });
            } catch { setPayloadOptions({}); }
            finally { setPayloadOptsLoading(false); }
        })();
    }, [values.PAYLOAD]);

    const setValue = (key: string, val: string) => setValues(prev => ({ ...prev, [key]: val }));

    const handleExecute = () => {
        const opts: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) { if (v !== '' && v != null) opts[k] = v; }
        if (selectedProxy) {
            opts['Proxies'] = selectedProxy;
        }
        // Immediately transition to result — console creation + command execution happens there
        onLaunched({
            moduleName: name,
            moduleType: type,
            options: opts,
            proxy: selectedProxy || undefined,
        });
    };

    // Partition module options
    const requiredOpts = useMemo(() => Object.entries(options).filter(([k, v]) => v.required && !v.advanced && k !== 'PAYLOAD'), [options]);
    const optionalOpts = useMemo(() => Object.entries(options).filter(([k, v]) => !v.required && !v.advanced && k !== 'PAYLOAD'), [options]);
    const advancedModuleOpts = useMemo(() => Object.entries(options).filter(([, v]) => v.advanced), [options]);

    // Partition payload options
    const payloadRequiredOpts = useMemo(() => Object.entries(payloadOptions).filter(([, v]) => v.required && !v.advanced), [payloadOptions]);
    const payloadOptionalOpts = useMemo(() => Object.entries(payloadOptions).filter(([, v]) => !v.required && !v.advanced), [payloadOptions]);
    const advancedPayloadOpts = useMemo(() => Object.entries(payloadOptions).filter(([, v]) => v.advanced), [payloadOptions]);

    const allAdvanced = useMemo(() => [...advancedModuleOpts, ...advancedPayloadOpts], [advancedModuleOpts, advancedPayloadOpts]);

    const allRequiredFilled = useMemo(() => {
        const allReq = [...requiredOpts, ...payloadRequiredOpts];
        return allReq.every(([k]) => values[k] && values[k].trim() !== '');
    }, [requiredOpts, payloadRequiredOpts, values]);

    const filteredPayloads = useMemo(() => {
        if (!payloadSearch) return payloads;
        const q = payloadSearch.toLowerCase();
        return payloads.filter(p => p.toLowerCase().includes(q));
    }, [payloads, payloadSearch]);

    if (loading) {
        return <div className="flex items-center justify-center py-20 text-zinc-300 font-mono text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading module...</div>;
    }

    return (
        <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-5">
            {/* Back */}
            <button onClick={onBack} className="flex items-center gap-1 text-xs font-mono text-zinc-300 hover:text-signal transition-colors">
                <ArrowLeft size={14} /> BACK TO MODULE LIST
            </button>

            {/* Module Info Card */}
            <div className="border border-ghost/30 bg-void/50 p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-10 h-10 border-t border-r border-ghost/20" />
                <div className="flex items-start justify-between mb-2">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Crosshair size={14} className="text-signal" />
                            <span className="text-[11px] font-mono text-signal/70 tracking-wider uppercase">{type}</span>
                        </div>
                        <h2 className="text-base font-bold text-white leading-tight">{info?.name || name}</h2>
                    </div>
                    {info?.rank_name && (
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase shrink-0", rankColor(info.rank_name))}>
                            {info.rank_name}
                        </span>
                    )}
                </div>
                <div className="text-[10px] font-mono text-zinc-300 mb-3 break-all">{name}</div>
                {info?.description && (
                    <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-[100px] overflow-y-auto cyber-scrollbar mb-3">{info.description.trim()}</p>
                )}
                <div className="space-y-1 text-[10px] font-mono">
                    {info?.authors && info.authors.length > 0 && (
                        <div className="flex gap-2"><span className="text-zinc-300 uppercase shrink-0">Authors:</span><span className="text-zinc-200">{info.authors.join(', ')}</span></div>
                    )}
                    {info?.references && info.references.length > 0 && (
                        <div className="flex gap-2"><span className="text-zinc-300 uppercase shrink-0">Refs:</span><span className="text-zinc-200 truncate">{info.references.slice(0, 5).join(', ')}{info.references.length > 5 ? ` +${info.references.length - 5}` : ''}</span></div>
                    )}
                    {info?.targets && info.targets.length > 0 && (
                        <div className="flex gap-2"><span className="text-zinc-300 uppercase shrink-0"><Target size={10} className="inline" /> Targets:</span><span className="text-zinc-200">{info.targets.join(', ')}</span></div>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <div className="text-xs font-mono text-red-400">{error}</div>
                </div>
            )}

            {/* ── SOCKS Proxy Selector ──────────────────────────────── */}
            <div className="border border-ghost/30 bg-void/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Radio size={14} className="text-cyan-400" />
                    <span className="text-xs font-mono font-bold text-cyan-400 tracking-[0.15em] uppercase">PROXY ROUTING</span>
                    <span className="text-[10px] font-mono text-zinc-300">Route traffic through a Mythic or MSF SOCKS tunnel</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {/* Direct connection option */}
                    <button
                        onClick={() => setSelectedProxy('')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 text-xs font-mono border transition-all duration-150",
                            selectedProxy === ''
                                ? "border-signal/50 bg-signal/15 text-signal"
                                : "border-ghost/20 text-zinc-300 hover:border-ghost/40 hover:text-white"
                        )}
                    >
                        <Globe size={12} />
                        DIRECT
                    </button>
                    {/* SOCKS proxy options — Mythic + MSF, merged */}
                    {proxyOptions.map(opt => {
                        const isSelected = selectedProxy === opt.value;
                        const accent = opt.source === 'msf' ? 'text-emerald-400' : 'text-cyan-400';
                        const accentSelectedBg = opt.source === 'msf' ? 'border-emerald-400/50 bg-emerald-400/15' : 'border-cyan-400/50 bg-cyan-400/15';
                        return (
                            <button
                                key={opt.key}
                                onClick={() => setSelectedProxy(isSelected ? '' : opt.value)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 text-xs font-mono border transition-all duration-150",
                                    isSelected
                                        ? `${accentSelectedBg} ${accent}`
                                        : "border-ghost/20 text-zinc-300 hover:border-ghost/40 hover:text-white"
                                )}
                            >
                                <Network size={12} className={isSelected ? accent : ''} />
                                <div className="text-left">
                                    <div className={cn("text-[11px] font-bold flex items-center gap-1.5", isSelected ? accent : "text-gray-300")}>
                                        <span className="text-[8px] tracking-widest opacity-70 uppercase">{opt.source}</span>
                                        :{opt.port}
                                    </div>
                                    <div className="text-[9px] text-zinc-300">
                                        {opt.label}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {proxyOptions.length === 0 && (
                        <span className="text-[10px] font-mono text-zinc-300 self-center ml-2">No active SOCKS tunnels — start one from the Callbacks page</span>
                    )}
                </div>
                {selectedProxy && (
                    <div className="mt-2 text-[10px] font-mono text-cyan-300 flex items-center gap-1.5">
                        <CheckCircle size={10} /> Traffic will be routed through <span className="text-cyan-300 font-bold">{selectedProxy}</span>
                    </div>
                )}
            </div>

            {/* ── Two-Column Layout ──────────────────────────────────── */}
            <div className="flex gap-5 items-stretch">
                {/* ═══ LEFT COLUMN: Required Zone ═══ */}
                <div className="w-1/2 flex flex-col">
                    <div className="relative flex flex-col flex-1 border border-red-400/40 rounded-sm overflow-hidden">
                        {/* Zone Header */}
                        <div className="px-5 pt-4 pb-3 border-b border-red-400/15 shrink-0">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]" />
                                <span className="text-xs font-mono font-bold text-red-400 tracking-[0.2em] uppercase">REQUIRED ZONE</span>
                            </div>
                            <p className="text-[10px] font-mono text-red-300/80 mt-1">Critical parameters — all fields must be configured</p>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-5 flex-1 overflow-y-auto cyber-scrollbar space-y-5" style={{ maxHeight: '460px' }}>
                            {requiredOpts.length > 0 && (
                                <div className="space-y-3">
                                    <div className="text-[10px] font-mono text-red-300 uppercase tracking-widest">Module Parameters</div>
                                    {requiredOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {values.PAYLOAD && payloadRequiredOpts.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-red-400/10">
                                    <div className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest flex items-center gap-1.5">
                                        <Zap size={10} /> Payload Parameters
                                    </div>
                                    {payloadRequiredOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {requiredOpts.length === 0 && payloadRequiredOpts.length === 0 && (
                                <div className="text-center py-8 text-zinc-300 font-mono text-xs">No required options</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══ RIGHT COLUMN: Optional Zone ═══ */}
                <div className="w-1/2 flex flex-col">
                    <div className="relative flex flex-col flex-1 border border-amber-400/40 rounded-sm overflow-hidden">
                        {/* Zone Header */}
                        <div className="px-5 pt-4 pb-3 border-b border-amber-400/10 shrink-0">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal size={14} className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
                                <span className="text-xs font-mono font-bold text-amber-400 tracking-[0.2em] uppercase">OPTIONAL ZONE</span>
                            </div>
                            <p className="text-[10px] font-mono text-amber-300/80 mt-1">Payload selection, fine-tuning & additional configuration</p>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-5 flex-1 overflow-y-auto cyber-scrollbar space-y-5" style={{ maxHeight: '460px' }}>
                            {/* Payload Selector */}
                            {type === 'exploit' && payloads.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-amber-300 uppercase tracking-widest">
                                        <Zap size={10} /> Payload ({payloads.length})
                                    </div>
                                    <div className="relative">
                                        <button onClick={() => setPayloadDropdownOpen(!payloadDropdownOpen)}
                                            className="w-full flex items-center justify-between bg-black/60 border border-ghost/30 text-sm font-mono px-3 py-2.5 hover:border-amber-400/40 transition-colors">
                                            <span className={values.PAYLOAD ? 'text-signal' : 'text-zinc-300'}>{values.PAYLOAD || 'Select payload...'}</span>
                                            <ChevronDown size={14} className={cn("text-zinc-300 transition-transform", payloadDropdownOpen && "rotate-180")} />
                                        </button>
                                        <AnimatePresence>
                                            {payloadDropdownOpen && (
                                                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                                    className="absolute z-50 w-full mt-1 bg-void border border-ghost/40 shadow-2xl">
                                                    <div className="p-2 border-b border-ghost/20">
                                                        <input value={payloadSearch} onChange={e => setPayloadSearch(e.target.value)}
                                                            placeholder="Filter payloads..." autoFocus
                                                            className="w-full bg-black/60 border border-ghost/20 text-signal font-mono text-xs px-2 py-1.5 focus:border-signal/40 focus:outline-none" />
                                                    </div>
                                                    <div className="max-h-[220px] overflow-y-auto cyber-scrollbar">
                                                        {filteredPayloads.map(p => (
                                                            <button key={p} onClick={() => { setValue('PAYLOAD', p); setPayloadDropdownOpen(false); setPayloadSearch(''); }}
                                                                className={cn("w-full text-left px-3 py-2 text-xs font-mono hover:bg-signal/10 transition-colors", values.PAYLOAD === p ? 'text-signal bg-signal/5' : 'text-zinc-200')}>
                                                                {p}
                                                            </button>
                                                        ))}
                                                        {filteredPayloads.length === 0 && <div className="text-center py-4 text-zinc-300 text-xs font-mono">No match</div>}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    {payloadOptsLoading && <div className="text-[10px] font-mono text-zinc-300 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Loading payload options...</div>}
                                </div>
                            )}

                            {/* Payload Optional Options */}
                            {values.PAYLOAD && payloadOptionalOpts.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-amber-400/10">
                                    <div className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest flex items-center gap-1.5">
                                        <Zap size={10} /> Payload Options
                                    </div>
                                    {payloadOptionalOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {/* Module Optional Options */}
                            {optionalOpts.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-amber-400/10">
                                    <div className="text-[10px] font-mono text-amber-300 uppercase tracking-widest">Module Options</div>
                                    {optionalOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {optionalOpts.length === 0 && payloadOptionalOpts.length === 0 && payloads.length === 0 && (
                                <div className="text-center py-8 text-zinc-300 font-mono text-xs">No optional parameters</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Advanced Options (full width, collapsible) ─────────── */}
            {allAdvanced.length > 0 && (
                <div className="border border-ghost/20 bg-void/30 rounded-sm overflow-hidden">
                    <button onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between px-5 py-3 text-xs font-mono text-zinc-300 hover:text-white transition-colors">
                        <span className="tracking-[0.15em] uppercase">ADVANCED OPTIONS ({allAdvanced.length})</span>
                        <ChevronDown size={14} className={cn("transition-transform", showAdvanced && "rotate-180")} />
                    </button>
                    <AnimatePresence>
                        {showAdvanced && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="px-5 pb-5 max-h-[350px] overflow-y-auto cyber-scrollbar">
                                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                        {allAdvanced.map(([key, opt]) => (
                                            <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Launch Button ──────────────────────────────────────── */}
            <div className="flex items-center gap-5 pt-1">
                <button onClick={handleExecute} disabled={!allRequiredFilled}
                    className={cn(
                        "group relative flex items-center justify-center gap-3 px-10 py-3.5 font-mono uppercase tracking-[0.2em] text-sm font-bold transition-all duration-300 overflow-hidden",
                        !allRequiredFilled
                            ? "bg-black/50 text-zinc-300 border border-white/15 cursor-not-allowed"
                            : "bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white border border-red-400/30 hover:border-red-300/60"
                    )}
                    style={allRequiredFilled ? { boxShadow: '0 0 30px rgba(239,68,68,0.25), 0 0 60px rgba(239,68,68,0.10)' } : undefined}
                >
                    {/* Animated glow sweep */}
                    {allRequiredFilled && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    )}
                    {/* Top highlight */}
                    {allRequiredFilled && (
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-300/50 to-transparent" />
                    )}
                    {/* Corner accents */}
                    {allRequiredFilled && (
                        <>
                            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-red-300/60" />
                            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-red-300/60" />
                            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-red-300/40" />
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-red-300/40" />
                        </>
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                        <Crosshair size={18} />
                        DEPLOY EXPLOIT
                    </span>
                </button>
                {!allRequiredFilled && (
                    <span className="text-[10px] font-mono text-red-300 flex items-center gap-1.5">
                        <AlertTriangle size={11} /> Complete all required fields to enable deployment
                    </span>
                )}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION FIELD
// ═══════════════════════════════════════════════════════════════════════════
function OptionField({ name, opt, value, onChange }: {
    name: string; opt: MsfModuleOption; value: string; onChange: (v: string) => void;
}) {
    const isBool = opt.type === 'bool' || opt.type === 'boolean';
    /*  MSF returns the SESSION parameter as `type: 'integer'` with the option
        name `SESSION` and a stock description "The session to run this module
        on" — there is no dedicated `session` type to switch on. We special-
        case by the option name (case-insensitive), which is the actual
        convention every post / session module follows. */
    const isSession = name.toUpperCase() === 'SESSION';
    const hasEnums = opt.enums && opt.enums.length > 0;

    return (
        <div>
            <div className="flex items-center gap-2 mb-1">
                <label className="text-[11px] font-mono text-signal/80 font-bold">{name}</label>
                {opt.required && <span className="text-[9px] font-mono text-red-400 bg-red-500/10 px-1 rounded">REQ</span>}
                <span className="text-[9px] font-mono text-zinc-300 uppercase">{opt.type}</span>
            </div>
            {opt.desc && <p className="text-[10px] text-zinc-300 mb-1.5 leading-relaxed">{opt.desc}</p>}
            {isSession ? (
                <SessionPicker value={value} onChange={onChange} required={opt.required} />
            ) : isBool ? (
                <button onClick={() => onChange(value === 'true' ? 'false' : 'true')}
                    className={cn("px-3 py-1.5 text-xs font-mono border transition-colors",
                        value === 'true' ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-ghost/30 text-zinc-300 hover:border-white/30")}>
                    {value === 'true' ? 'TRUE' : 'FALSE'}
                </button>
            ) : hasEnums ? (
                <select value={value} onChange={e => onChange(e.target.value)}
                    className="w-full bg-black/60 border border-ghost/30 text-signal font-mono text-sm px-3 py-2 focus:border-signal/60 focus:outline-none transition-colors">
                    <option value="">-- select --</option>
                    {opt.enums!.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
            ) : (
                <input value={value} onChange={e => onChange(e.target.value)}
                    placeholder={opt.default != null ? `Default: ${opt.default}` : ''}
                    className="w-full bg-black/60 border border-ghost/30 text-signal font-mono text-sm px-3 py-2 focus:border-signal/60 focus:outline-none transition-colors" />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION PICKER — used by OptionField when opt.type === 'session'
// ═══════════════════════════════════════════════════════════════════════════
/*  Why a custom popover instead of <select>:
 *      A flat dropdown can't carry the per-session metadata an operator
 *      actually needs to disambiguate ("session 3" tells you nothing — the
 *      target host, user, payload, and session type do). We render each
 *      session as a card row with id badge + type icon + host:port + user +
 *      via_payload + info.
 *
 *  Refresh strategy:
 *      Pull on mount + on popover open + on explicit REFRESH click. No
 *      polling — sessions don't churn fast and a stale list one beat behind
 *      is acceptable; the REFRESH button is one click away. */
function SessionPicker({ value, onChange, required }: {
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
}) {
    const [sessions, setSessions] = useState<Record<string, MsfSession>>({});
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSessions(await getSessions());
        } catch (e: any) {
            setError(e?.message || 'Failed to load sessions');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (open) load(); }, [open, load]);

    // Click outside closes the popover.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const entries = Object.entries(sessions).sort(([a], [b]) => Number(a) - Number(b));
    const selected = value ? sessions[value] : undefined;

    return (
        <div ref={pickerRef} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 border text-left font-mono text-sm transition-colors',
                    value
                        ? 'border-accent/50 bg-accent/10 text-signal'
                        : required
                            ? 'border-red-500/40 bg-red-500/[0.04] text-signal hover:border-red-400/60'
                            : 'border-ghost/30 bg-black/60 text-signal hover:border-signal/60',
                )}
            >
                {value && selected ? (
                    <>
                        <SessionTypeIcon type={selected.type} />
                        <span className="text-accent font-bold shrink-0">#{value}</span>
                        <span className="text-[11px] uppercase tracking-[0.2em] text-signal/80 shrink-0">{selected.type}</span>
                        <span className="text-signal/90 truncate">
                            {sessionTargetLabel(selected)}
                        </span>
                    </>
                ) : value ? (
                    // ID set but the session has disappeared from the list — surface that loudly.
                    <>
                        <AlertTriangle size={13} className="text-yellow-400 shrink-0" />
                        <span className="text-accent font-bold shrink-0">#{value}</span>
                        <span className="text-yellow-300/90">no longer active</span>
                    </>
                ) : (
                    <span className="text-signal/60">
                        {loading ? 'loading sessions…' : entries.length === 0 ? 'no active sessions' : '-- select session --'}
                    </span>
                )}
                <ChevronDown size={13} className={cn('ml-auto text-signal/60 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-void/95 backdrop-blur-md border border-signal/40 shadow-2xl shadow-signal/10">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-signal/15 bg-signal/5">
                        <span className="text-[10px] font-mono tracking-[0.3em] text-signal/80">
                            SESSIONS · {entries.length}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); load(); }}
                            disabled={loading}
                            className="flex items-center gap-1 text-[10px] font-mono tracking-[0.25em] text-signal hover:text-accent disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />} REFRESH
                        </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto cyber-scrollbar">
                        {error ? (
                            <div className="px-3 py-4 text-[11px] text-red-300 font-mono">
                                {error}
                            </div>
                        ) : entries.length === 0 ? (
                            <div className="px-3 py-4 text-[11px] text-signal/60 font-mono">
                                {loading ? 'loading…' : 'No active Metasploit sessions. Open one (e.g. via a multi/handler) and refresh.'}
                            </div>
                        ) : (
                            <div className="divide-y divide-signal/10">
                                {entries.map(([id, s]) => {
                                    const isSelected = id === value;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => { onChange(id); setOpen(false); }}
                                            className={cn(
                                                'w-full px-3 py-2 text-left font-mono transition-colors flex items-start gap-2.5',
                                                isSelected
                                                    ? 'bg-accent/10 border-l-2 border-accent'
                                                    : 'hover:bg-signal/5 border-l-2 border-transparent',
                                            )}
                                        >
                                            <SessionTypeIcon type={s.type} />
                                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-accent font-bold text-xs">#{id}</span>
                                                    <span className="text-[9px] uppercase tracking-[0.25em] text-signal/80">{s.type}</span>
                                                    {s.platform && (
                                                        <span className="text-[9px] uppercase tracking-[0.2em] text-signal/60">
                                                            {s.platform}{s.arch ? `/${s.arch}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-signal">
                                                    {s.username && <span className="text-yellow-400/90">{s.username}</span>}
                                                    {s.username && <span className="text-signal/40">@</span>}
                                                    <span className="text-signal truncate">{sessionTargetLabel(s)}</span>
                                                </div>
                                                {s.info && (
                                                    <div className="text-[10px] text-signal/70 truncate" title={s.info}>{s.info}</div>
                                                )}
                                                {s.via_payload && (
                                                    <div className="text-[10px] text-signal/50 truncate" title={s.via_payload}>
                                                        via · {s.via_payload}
                                                    </div>
                                                )}
                                            </div>
                                            {isSelected && <CheckCircle size={13} className="text-accent shrink-0 mt-0.5" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Best-effort target label. tunnel_peer is "ip:port" of the remote side;
// fall back through target_host / session_host / "?" so we never render blank.
function sessionTargetLabel(s: MsfSession): string {
    if (s.tunnel_peer) return s.tunnel_peer;
    if (s.target_host && s.session_port) return `${s.target_host}:${s.session_port}`;
    if (s.target_host) return s.target_host;
    if (s.session_host) return s.session_host;
    return '(no target)';
}

function SessionTypeIcon({ type }: { type: string }) {
    const t = (type || '').toLowerCase();
    if (t === 'meterpreter') return <Zap size={13} className="text-accent shrink-0" />;
    if (t === 'shell')       return <Cpu size={13} className="text-yellow-400 shrink-0" />;
    return <Box size={13} className="text-signal/70 shrink-0" />;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — LIVE EXECUTION OUTPUT
// ═══════════════════════════════════════════════════════════════════════════
function ExecutionResult({ launchInfo, onBack, onNew }: {
    launchInfo: LaunchInfo; onBack: () => void; onNew: () => void;
}) {
    const [output, setOutput] = useState('');
    const [busy, setBusy] = useState(true);
    const [consoleId, setConsoleId] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const initRef = useRef(false);
    const recordRef = useRef<MsfExecutionRecord | null>(null);
    const { moduleName, moduleType, options, proxy } = launchInfo;

    // Create console and execute on mount (once)
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        // Persist execution record
        recordRef.current = createExecution(moduleName, moduleType, options, proxy);

        (async () => {
            try {
                const con = await consoleCreate();
                setConsoleId(con.id);

                // Build commands
                const commands: string[] = [`use ${moduleType}/${moduleName}`];
                for (const [k, v] of Object.entries(options)) {
                    commands.push(`set ${k} ${v}`);
                }
                commands.push('run -j');

                // Write all commands sequentially
                for (const cmd of commands) {
                    await consoleWrite(con.id, cmd);
                    await new Promise(r => setTimeout(r, CONSOLE_WRITE_DELAY_MS));
                }
            } catch (e: any) {
                setInitError(e.message || 'Failed to create console');
                setBusy(false);
                // Persist error status
                if (recordRef.current) {
                    recordRef.current.status = 'error';
                    recordRef.current.errorMessage = e.message || 'Failed to create console';
                    recordRef.current.completedAt = new Date().toISOString();
                    saveExecution(recordRef.current);
                }
            }
        })();
    }, [moduleName, moduleType, options]);

    // Poll console output once consoleId is set
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!consoleId) return;

        const poll = async () => {
            try {
                const res = await consoleRead(consoleId);
                if (res.data) {
                    setOutput(prev => {
                        const updated = prev + res.data;
                        // Persist output + status transitions to history
                        if (recordRef.current) {
                            recordRef.current.output = updated;
                            // Capture backing job id (run -j) so we can reconcile later
                            // even if the user navigates away before completion.
                            if (!recordRef.current.jobId) {
                                const jid = extractJobIdFromOutput(updated);
                                if (jid) recordRef.current.jobId = jid;
                            }
                            // A successful exploit / handler will print "session N opened".
                            // That's our real completion signal — the MSF console itself
                            // stays "busy" briefly afterwards which is what made tasks look
                            // permanently RUNNING in the history view.
                            const sess = extractSessionFromOutput(updated);
                            if (sess && recordRef.current.status !== 'complete') {
                                recordRef.current.status = 'complete';
                                recordRef.current.sessionId = sess.id;
                                recordRef.current.sessionType = sess.type;
                                recordRef.current.completedAt = new Date().toISOString();
                            } else if (!res.busy && recordRef.current.status === 'running') {
                                recordRef.current.status = 'complete';
                                recordRef.current.completedAt = new Date().toISOString();
                            }
                            saveExecution(recordRef.current);
                        }
                        return updated;
                    });
                } else if (!res.busy && recordRef.current && recordRef.current.status === 'running') {
                    // No new data but finished — mark complete
                    recordRef.current.status = 'complete';
                    recordRef.current.completedAt = new Date().toISOString();
                    saveExecution(recordRef.current);
                }
                setBusy(res.busy);
            } catch { /* ignore */ }
        };

        poll();
        pollRef.current = setInterval(poll, CONSOLE_POLL_INTERVAL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [consoleId]);

    // Cleanup console on unmount
    useEffect(() => {
        return () => {
            if (consoleId) consoleDestroy(consoleId).catch(() => { });
            // Don't leave the record stuck on 'running' if the user navigated away
            // before the poll loop observed completion.
            const r = recordRef.current;
            if (r && r.status === 'running') {
                const sess = extractSessionFromOutput(r.output);
                if (sess) {
                    r.sessionId = sess.id;
                    r.sessionType = sess.type;
                }
                r.status = 'complete';
                r.completedAt = new Date().toISOString();
                saveExecution(r);
            }
        };
    }, [consoleId]);

    return (
        <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn("w-2.5 h-2.5 rounded-full", busy ? "bg-yellow-400 animate-pulse" : "bg-green-400")} />
                    <h3 className="text-sm font-mono font-bold text-white tracking-widest uppercase">
                        {busy ? 'EXECUTING' : 'COMPLETE'}
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="px-4 py-1.5 border border-ghost/30 text-zinc-200 text-xs font-mono uppercase tracking-wider hover:text-white hover:border-white/30 transition-colors">
                        RECONFIGURE
                    </button>
                    <button onClick={onNew} className="px-4 py-1.5 bg-signal text-black text-xs font-mono uppercase tracking-wider hover:bg-signal/80 transition-colors">
                        NEW ATTACK
                    </button>
                </div>
            </div>

            {/* Info Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-zinc-300 uppercase tracking-widest mb-1">MODULE</div>
                    <div className="text-xs font-mono text-signal truncate">{moduleType}/{moduleName}</div>
                </div>
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-zinc-300 uppercase tracking-widest mb-1">TARGET</div>
                    <div className="text-xs font-mono text-white">{options.RHOSTS || options.RHOST || '-'}</div>
                </div>
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-zinc-300 uppercase tracking-widest mb-1">PAYLOAD</div>
                    <div className="text-xs font-mono text-cyan-400 truncate">{options.PAYLOAD || '-'}</div>
                </div>
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-zinc-300 uppercase tracking-widest mb-1">PROXY</div>
                    <div className="text-xs font-mono text-purple-400">{proxy || 'DIRECT'}</div>
                </div>
            </div>

            {/* Init Error */}
            {initError && (
                <div className="border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <div className="text-xs font-mono text-red-400">{initError}</div>
                </div>
            )}

            {/* Live Output Terminal — parsed view with raw fallback */}
            {!consoleId && !initError ? (
                <div className="border border-ghost/30 bg-black p-4 flex items-center gap-2 text-zinc-300 font-mono text-xs">
                    <Loader2 size={12} className="animate-spin" /> Creating console and sending commands...
                </div>
            ) : (
                <ParsedOutputView
                    output={output}
                    busy={busy && !!consoleId}
                    title={consoleId ? `CONSOLE #${consoleId}` : 'INITIALIZING...'}
                    rightSlot={
                        busy ? (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 font-bold tracking-[0.2em]">
                                <Loader2 size={10} className="animate-spin" /> RUNNING
                            </span>
                        ) : output ? (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-accent font-bold tracking-[0.2em]">
                                <CheckCircle size={10} /> DONE
                            </span>
                        ) : null
                    }
                />
            )}

            {/* Options used */}
            <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-mono text-zinc-300 hover:text-white transition-colors">
                    <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                    EXECUTION PARAMETERS ({Object.keys(options).length})
                </summary>
                <div className="mt-3 border border-ghost/20 bg-void/30 p-4 max-h-[200px] overflow-y-auto cyber-scrollbar">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {Object.entries(options).map(([k, v]) => (
                            <div key={k} className="flex items-baseline gap-2 text-xs font-mono py-0.5">
                                <span className="text-zinc-300 shrink-0">{k}:</span>
                                <span className="text-signal truncate">{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </details>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export default function LaunchAttack() {
    const [step, setStep] = useState<Step>('select');
    const [selectedType, setSelectedType] = useState<ModuleType>('exploit');
    const [selectedModule, setSelectedModule] = useState('');
    const [launchInfo, setLaunchInfo] = useState<LaunchInfo | null>(null);

    const handleSelect = (type: ModuleType, name: string) => { setSelectedType(type); setSelectedModule(name); setStep('configure'); };
    const handleLaunched = (info: LaunchInfo) => { setLaunchInfo(info); setStep('result'); };
    const handleNew = () => { setSelectedModule(''); setLaunchInfo(null); setStep('select'); };

    return (
        <div>
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-6 text-[10px] font-mono text-zinc-300 uppercase tracking-widest">
                <span className={cn(step === 'select' && 'text-signal')}>1. SELECT MODULE</span>
                <ChevronRight size={10} />
                <span className={cn(step === 'configure' && 'text-signal')}>2. CONFIGURE</span>
                <ChevronRight size={10} />
                <span className={cn(step === 'result' && 'text-signal')}>3. LAUNCH</span>
            </div>

            <AnimatePresence mode="wait">
                {step === 'select' && (
                    <motion.div key="select" exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                        <ModuleSelector onSelect={handleSelect} />
                    </motion.div>
                )}
                {step === 'configure' && (
                    <motion.div key="configure" exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                        <ModuleConfigurator type={selectedType} name={selectedModule} onBack={() => setStep('select')} onLaunched={handleLaunched} />
                    </motion.div>
                )}
                {step === 'result' && launchInfo && (
                    <motion.div key="result" exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                        <ExecutionResult launchInfo={launchInfo} onBack={() => setStep('configure')} onNew={handleNew} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
