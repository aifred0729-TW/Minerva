import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createExecution, saveExecution, type MsfExecutionRecord } from './executionHistory';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
    Search, Bug, ChevronRight, ArrowLeft, Crosshair, Play, Loader2,
    AlertTriangle, CheckCircle, ChevronDown, Target, Zap, FileText,
    Shield, Layers, Monitor, Globe, Network, Server, Wifi, Database,
    Cpu, Box, Hash, Eye, Filter, X, SlidersHorizontal, ChevronLeft, Radio, Terminal
} from 'lucide-react';
import { useSubscription } from "@apollo/client/react";
import { cn } from '../../lib/utils';
import {
    listModules, getModuleInfo, getModuleOptions, getCompatiblePayloads, executeModule,
    consoleCreate, consoleRead, consoleWrite, consoleDestroy,
    type MsfModuleInfo, type MsfModuleOption, type MsfExecuteResult
} from './msfrpc';
import { CALLBACKPORT_STREAM } from '../../lib/api/tunnels';
import type { CallbackPort } from '../../types/tunnels';

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
    return 'text-gray-400 bg-gray-500/15';
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
        <motion.div variants={fadeIn} initial="hidden" animate="show" className="flex gap-0 h-[640px]">
            {/* ── Left Sidebar: Module Types ───────────────────────── */}
            <div className="w-48 shrink-0 border-r border-ghost/20 flex flex-col">
                <div className="text-[9px] font-mono text-gray-600 uppercase tracking-[0.2em] px-4 py-3">MODULE TYPE</div>
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
                                    <div className={cn("text-[9px] font-mono", isActive ? "text-black/60" : "text-gray-600")}>
                                        {count != null ? count.toLocaleString() : '...'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Right Content ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar: Search + Filter Tags */}
                <div className="px-4 pt-3 pb-3 border-b border-ghost/15 space-y-2.5">
                    <div className="flex items-center gap-3">
                        <div className={cn("flex items-center gap-2 shrink-0", typeDef.color)}>
                            {typeDef.icon}
                            <span className="text-sm font-mono font-bold tracking-widest">{typeDef.label}</span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-500">{filtered.length.toLocaleString()} modules</span>
                        <div className="flex-1" />
                        {/* Search inline */}
                        <div className="relative w-64">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search modules..."
                                className="w-full bg-black/60 border border-ghost/30 text-signal font-mono text-xs pl-8 pr-3 py-1.5 focus:border-signal/60 focus:outline-none transition-colors" />
                        </div>
                    </div>

                    {/* Filter Tags Row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Platform tags */}
                        <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600 uppercase tracking-wider shrink-0">
                            <Monitor size={10} /> Platform:
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {platforms.slice(0, 12).map(([plat, count]) => (
                                <button key={plat} onClick={() => togglePlatform(plat)}
                                    className={cn(
                                        "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border transition-all duration-150",
                                        filterPlatforms.has(plat)
                                            ? "border-signal/50 bg-signal/15 text-signal"
                                            : "border-ghost/20 text-gray-500 hover:border-ghost/40 hover:text-gray-300"
                                    )}>
                                    {PLATFORM_ICONS[plat] || <Globe size={10} />}
                                    <span>{plat}</span>
                                    <span className="text-gray-600">{count}</span>
                                </button>
                            ))}
                        </div>

                        {/* Service tags (show when platforms selected or always top services) */}
                        {services.length > 0 && (
                            <>
                                <div className="w-px h-4 bg-ghost/20 mx-1" />
                                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600 uppercase tracking-wider shrink-0">
                                    <Network size={10} /> Service:
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {services.slice(0, 10).map(([svc, count]) => (
                                        <button key={svc} onClick={() => toggleService(svc)}
                                            className={cn(
                                                "px-2 py-0.5 text-[10px] font-mono border transition-all duration-150",
                                                filterServices.has(svc)
                                                    ? "border-signal/50 bg-signal/15 text-signal"
                                                    : "border-ghost/20 text-gray-500 hover:border-ghost/40 hover:text-gray-300"
                                            )}>
                                            {svc} <span className="text-gray-600">{count}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Clear all */}
                        {(filterPlatforms.size > 0 || filterServices.size > 0) && (
                            <button onClick={clearFilters} className="px-2 py-0.5 text-[10px] font-mono text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1">
                                <X size={10} /> Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Module List — compact rows */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-500 font-mono text-sm">
                            <Loader2 size={18} className="animate-spin mr-2" /> Loading modules...
                        </div>
                    ) : (
                        <div className="divide-y divide-ghost/8">
                            {paged.map(({ name, platform, service, leaf }) => (
                                <button key={name} onClick={() => onSelect(activeType, name)}
                                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-signal/5 transition-colors text-left group">
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-mono text-gray-300 group-hover:text-signal truncate block transition-colors">{leaf}</span>
                                        <span className="text-[10px] font-mono text-gray-600">{platform}{service ? `/${service}` : ''}</span>
                                    </div>
                                    <ChevronRight size={14} className="text-gray-700 group-hover:text-signal shrink-0 transition-colors" />
                                </button>
                            ))}
                            {paged.length === 0 && (
                                <div className="text-center py-16 text-gray-500 font-mono text-sm">NO_MATCHING_MODULES</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-ghost/15 text-xs font-mono text-gray-500">
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            className="px-3 py-1 border border-ghost/20 hover:border-signal/30 hover:text-signal disabled:opacity-30 transition-colors">PREV</button>
                        <span>PAGE {page + 1} / {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="px-3 py-1 border border-ghost/20 hover:border-signal/30 hover:text-signal disabled:opacity-30 transition-colors">NEXT</button>
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

    // Subscribe to active SOCKS proxies from Mythic
    const { data: proxyData } = useSubscription<any>(CALLBACKPORT_STREAM, {
        onError: (err) => { console.error('[CALLBACKPORT_STREAM] subscription error:', err); },
    });
    const socksProxies = useMemo(() => {
        const ports: CallbackPort[] = proxyData?.callbackport_stream || [];
        return ports.filter(p => p.port_type === 'socks' && !p.deleted);
    }, [proxyData]);

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
        return <div className="flex items-center justify-center py-20 text-gray-500 font-mono text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading module...</div>;
    }

    return (
        <motion.div variants={fadeIn} initial="hidden" animate="show" className="space-y-5">
            {/* Back */}
            <button onClick={onBack} className="flex items-center gap-1 text-xs font-mono text-gray-500 hover:text-signal transition-colors">
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
                <div className="text-[10px] font-mono text-gray-600 mb-3 break-all">{name}</div>
                {info?.description && (
                    <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-[100px] overflow-y-auto cyber-scrollbar mb-3">{info.description.trim()}</p>
                )}
                <div className="space-y-1 text-[10px] font-mono">
                    {info?.authors && info.authors.length > 0 && (
                        <div className="flex gap-2"><span className="text-gray-600 uppercase shrink-0">Authors:</span><span className="text-gray-400">{info.authors.join(', ')}</span></div>
                    )}
                    {info?.references && info.references.length > 0 && (
                        <div className="flex gap-2"><span className="text-gray-600 uppercase shrink-0">Refs:</span><span className="text-gray-400 truncate">{info.references.slice(0, 5).join(', ')}{info.references.length > 5 ? ` +${info.references.length - 5}` : ''}</span></div>
                    )}
                    {info?.targets && info.targets.length > 0 && (
                        <div className="flex gap-2"><span className="text-gray-600 uppercase shrink-0"><Target size={10} className="inline" /> Targets:</span><span className="text-gray-400">{info.targets.join(', ')}</span></div>
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
                    <span className="text-[10px] font-mono text-gray-600">Route traffic through a Mythic SOCKS tunnel</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {/* Direct connection option */}
                    <button
                        onClick={() => setSelectedProxy('')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 text-xs font-mono border transition-all duration-150",
                            selectedProxy === ''
                                ? "border-signal/50 bg-signal/15 text-signal"
                                : "border-ghost/20 text-gray-500 hover:border-ghost/40 hover:text-gray-300"
                        )}
                    >
                        <Globe size={12} />
                        DIRECT
                    </button>
                    {/* SOCKS proxy options from Mythic */}
                    {socksProxies.map(p => {
                        const proxyValue = `socks5:host.docker.internal:${p.local_port}`;
                        const isSelected = selectedProxy === proxyValue;
                        const cb = p.callback;
                        return (
                            <button
                                key={p.id}
                                onClick={() => setSelectedProxy(isSelected ? '' : proxyValue)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 text-xs font-mono border transition-all duration-150",
                                    isSelected
                                        ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-400"
                                        : "border-ghost/20 text-gray-500 hover:border-ghost/40 hover:text-gray-300"
                                )}
                            >
                                <Network size={12} />
                                <div className="text-left">
                                    <div className={cn("text-[11px] font-bold", isSelected ? "text-cyan-400" : "text-gray-300")}>
                                        :{p.local_port}
                                    </div>
                                    <div className="text-[9px] text-gray-600">
                                        CB#{cb.display_id} · {cb.host || cb.ip} · {cb.user}@{cb.process_name || '?'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {socksProxies.length === 0 && (
                        <span className="text-[10px] font-mono text-gray-600 self-center ml-2">No active SOCKS tunnels — start one from the Tunnels page</span>
                    )}
                </div>
                {selectedProxy && (
                    <div className="mt-2 text-[10px] font-mono text-cyan-400/60 flex items-center gap-1.5">
                        <CheckCircle size={10} /> Traffic will be routed through <span className="text-cyan-400 font-bold">{selectedProxy}</span>
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
                            <p className="text-[10px] font-mono text-red-300/40 mt-1">Critical parameters — all fields must be configured</p>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-5 flex-1 overflow-y-auto cyber-scrollbar space-y-5" style={{ maxHeight: '460px' }}>
                            {requiredOpts.length > 0 && (
                                <div className="space-y-3">
                                    <div className="text-[10px] font-mono text-red-300/50 uppercase tracking-widest">Module Parameters</div>
                                    {requiredOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {values.PAYLOAD && payloadRequiredOpts.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-red-400/10">
                                    <div className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-widest flex items-center gap-1.5">
                                        <Zap size={10} /> Payload Parameters
                                    </div>
                                    {payloadRequiredOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {requiredOpts.length === 0 && payloadRequiredOpts.length === 0 && (
                                <div className="text-center py-8 text-gray-600 font-mono text-xs">No required options</div>
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
                            <p className="text-[10px] font-mono text-amber-300/30 mt-1">Payload selection, fine-tuning & additional configuration</p>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-5 flex-1 overflow-y-auto cyber-scrollbar space-y-5" style={{ maxHeight: '460px' }}>
                            {/* Payload Selector */}
                            {type === 'exploit' && payloads.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-amber-300/50 uppercase tracking-widest">
                                        <Zap size={10} /> Payload ({payloads.length})
                                    </div>
                                    <div className="relative">
                                        <button onClick={() => setPayloadDropdownOpen(!payloadDropdownOpen)}
                                            className="w-full flex items-center justify-between bg-black/60 border border-ghost/30 text-sm font-mono px-3 py-2.5 hover:border-amber-400/40 transition-colors">
                                            <span className={values.PAYLOAD ? 'text-signal' : 'text-gray-500'}>{values.PAYLOAD || 'Select payload...'}</span>
                                            <ChevronDown size={14} className={cn("text-gray-500 transition-transform", payloadDropdownOpen && "rotate-180")} />
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
                                                                className={cn("w-full text-left px-3 py-2 text-xs font-mono hover:bg-signal/10 transition-colors", values.PAYLOAD === p ? 'text-signal bg-signal/5' : 'text-gray-400')}>
                                                                {p}
                                                            </button>
                                                        ))}
                                                        {filteredPayloads.length === 0 && <div className="text-center py-4 text-gray-500 text-xs font-mono">No match</div>}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    {payloadOptsLoading && <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Loading payload options...</div>}
                                </div>
                            )}

                            {/* Payload Optional Options */}
                            {values.PAYLOAD && payloadOptionalOpts.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-amber-400/10">
                                    <div className="text-[10px] font-mono text-cyan-400/50 uppercase tracking-widest flex items-center gap-1.5">
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
                                    <div className="text-[10px] font-mono text-amber-300/50 uppercase tracking-widest">Module Options</div>
                                    {optionalOpts.map(([key, opt]) => (
                                        <OptionField key={key} name={key} opt={opt} value={values[key] || ''} onChange={v => setValue(key, v)} />
                                    ))}
                                </div>
                            )}

                            {optionalOpts.length === 0 && payloadOptionalOpts.length === 0 && payloads.length === 0 && (
                                <div className="text-center py-8 text-gray-600 font-mono text-xs">No optional parameters</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Advanced Options (full width, collapsible) ─────────── */}
            {allAdvanced.length > 0 && (
                <div className="border border-ghost/20 bg-void/30 rounded-sm overflow-hidden">
                    <button onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between px-5 py-3 text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors">
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
                            ? "bg-gray-800/80 text-gray-600 border border-gray-700/50 cursor-not-allowed"
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
                    <span className="text-[10px] font-mono text-red-400/70 flex items-center gap-1.5">
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
    const hasEnums = opt.enums && opt.enums.length > 0;

    return (
        <div>
            <div className="flex items-center gap-2 mb-1">
                <label className="text-[11px] font-mono text-signal/80 font-bold">{name}</label>
                {opt.required && <span className="text-[9px] font-mono text-red-400 bg-red-500/10 px-1 rounded">REQ</span>}
                <span className="text-[9px] font-mono text-gray-600 uppercase">{opt.type}</span>
            </div>
            {opt.desc && <p className="text-[10px] text-gray-500 mb-1.5 leading-relaxed">{opt.desc}</p>}
            {isBool ? (
                <button onClick={() => onChange(value === 'true' ? 'false' : 'true')}
                    className={cn("px-3 py-1.5 text-xs font-mono border transition-colors",
                        value === 'true' ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-ghost/30 text-gray-500 hover:border-white/30")}>
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
// STEP 3 — LIVE EXECUTION OUTPUT
// ═══════════════════════════════════════════════════════════════════════════
function ExecutionResult({ launchInfo, onBack, onNew }: {
    launchInfo: LaunchInfo; onBack: () => void; onNew: () => void;
}) {
    const [output, setOutput] = useState('');
    const [busy, setBusy] = useState(true);
    const [consoleId, setConsoleId] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);
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
                        // Persist output to history
                        if (recordRef.current) {
                            recordRef.current.output = updated;
                            if (!res.busy) {
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

    // Auto-scroll
    useEffect(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, [output]);

    // Cleanup console on unmount
    useEffect(() => {
        return () => {
            if (consoleId) consoleDestroy(consoleId).catch(() => { });
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
                    <button onClick={onBack} className="px-4 py-1.5 border border-ghost/30 text-gray-400 text-xs font-mono uppercase tracking-wider hover:text-white hover:border-white/30 transition-colors">
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
                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">MODULE</div>
                    <div className="text-xs font-mono text-signal truncate">{moduleType}/{moduleName}</div>
                </div>
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">TARGET</div>
                    <div className="text-xs font-mono text-white">{options.RHOSTS || options.RHOST || '-'}</div>
                </div>
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">PAYLOAD</div>
                    <div className="text-xs font-mono text-cyan-400 truncate">{options.PAYLOAD || '-'}</div>
                </div>
                <div className="border border-ghost/20 bg-void/50 px-4 py-3">
                    <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">PROXY</div>
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

            {/* Live Output Terminal */}
            <div className="border border-ghost/30 bg-black overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-ghost/15 bg-black/80">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400 uppercase tracking-widest">
                        <Terminal size={13} />
                        {consoleId ? `CONSOLE #${consoleId}` : 'INITIALIZING...'}
                    </div>
                    <div className="flex items-center gap-2">
                        {busy && (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-yellow-400">
                                <Loader2 size={10} className="animate-spin" /> RUNNING
                            </span>
                        )}
                        {!busy && output && (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-green-400">
                                <CheckCircle size={10} /> DONE
                            </span>
                        )}
                    </div>
                </div>
                <div
                    ref={outputRef}
                    className="p-4 font-mono text-xs text-gray-300 h-[450px] overflow-y-auto cyber-scrollbar whitespace-pre-wrap leading-relaxed"
                >
                    {!consoleId && !initError && (
                        <span className="text-gray-600 flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> Creating console and sending commands...
                        </span>
                    )}
                    {output}
                    {busy && consoleId && <span className="text-yellow-400 animate-pulse">█</span>}
                </div>
            </div>

            {/* Options used */}
            <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors">
                    <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                    EXECUTION PARAMETERS ({Object.keys(options).length})
                </summary>
                <div className="mt-3 border border-ghost/20 bg-void/30 p-4 max-h-[200px] overflow-y-auto cyber-scrollbar">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {Object.entries(options).map(([k, v]) => (
                            <div key={k} className="flex items-baseline gap-2 text-xs font-mono py-0.5">
                                <span className="text-gray-500 shrink-0">{k}:</span>
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
            <div className="flex items-center gap-2 mb-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
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
