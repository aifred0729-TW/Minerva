import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
    RefreshCw, Wifi, WifiOff, Server, Bug, Shield, Terminal,
    Crosshair, Activity, Settings as SettingsIcon, X, Save,
    Layers, Package, Hash, Cpu, CircleStop, LayoutDashboard, Rocket, Loader2, ClipboardList, History
} from 'lucide-react';
import { useAppStore } from '../../store';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import {
    getFullStatus, getStoredCredentials, saveCredentials, stopJob, pingMsfRpc,
    filterSessionsByOperation,
    type MsfConnectionStatus, type MsfSession
} from './msfrpc';
import { useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';

const LaunchAttack = lazy(() => import('./LaunchAttack'));
const Operations = lazy(() => import('./Operations'));
const TaskBrowser = lazy(() => import('./TaskBrowser'));

type MsfTab = 'dashboard' | 'attack' | 'operations' | 'history';

// Online-indicator ping — cheap `core.version` RPC, runs often so the
// red/green dot reacts within seconds when the MSF daemon flips state.
const MSF_PING_INTERVAL_MS = 3_000;
// Full status (module counts, session list, job list) — fetches 7 huge
// module-name arrays. Runs on a slow cadence; also fires once whenever
// the ping flips from offline → online so the dashboard fills in fast.
const MSF_HEAVY_REFRESH_INTERVAL_MS = 60_000;

// ── Animation Variants ──────────────────────────────────────────────────────
const container: Variants = {
    hidden: { opacity: 0, y: 20, filter: 'blur(12px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { staggerChildren: 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};
const item: Variants = {
    hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

// ── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = 'signal' }: {
    icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
    const colorMap: Record<string, string> = {
        signal: 'text-signal border-signal/20 bg-signal/5',
        red: 'text-red-400 border-red-400/20 bg-red-500/5',
        yellow: 'text-yellow-400 border-yellow-400/20 bg-yellow-500/5',
        green: 'text-green-400 border-green-400/20 bg-green-500/5',
        purple: 'text-purple-400 border-purple-400/20 bg-purple-500/5',
        cyan: 'text-cyan-400 border-cyan-400/20 bg-cyan-500/5',
    };
    return (
        <div className={cn("border bg-void/50 p-5 relative group overflow-hidden hover:border-signal/50 transition-colors duration-500", colorMap[color] || colorMap.signal)}>
            <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-ghost/30 group-hover:border-signal/40 transition-colors duration-500" />
            <div className="flex items-center gap-2 mb-3 text-gray-400 group-hover:text-signal transition-colors text-xs font-mono tracking-widest uppercase">
                {icon}
                {label}
            </div>
            <div className="text-3xl font-bold font-mono">{value}</div>
            {sub && <div className="text-[11px] text-gray-500 font-mono mt-1">{sub}</div>}
        </div>
    );
}

// ── Sessions are now managed from the Callbacks page (unified table + console).
//    A small summary card here keeps a quick count, but interaction lives in /callbacks.
function SessionsSummary({ sessions }: { sessions: Record<string, MsfSession> }) {
    const entries = Object.entries(sessions);
    return (
        <div className="border border-ghost/30 bg-void/50 p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-mono tracking-widest uppercase">
                    <Crosshair size={16} /> ACTIVE SESSIONS ({entries.length})
                </div>
                <Link to="/callbacks"
                    className="text-[10px] font-mono text-signal/70 hover:text-signal border border-signal/30 px-2 py-1 transition-colors">
                    OPEN IN CALLBACKS →
                </Link>
            </div>
            {entries.length === 0 ? (
                <div className="text-gray-500 font-mono text-sm text-center py-8">NO_ACTIVE_SESSIONS</div>
            ) : (
                <div className="space-y-1.5">
                    {entries.slice(0, 6).map(([id, s]) => (
                        <Link to="/callbacks" key={id}
                            className="flex items-center justify-between border border-ghost/15 px-3 py-1.5 hover:border-signal/40 hover:bg-signal/5 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-red-400 font-mono text-xs font-bold shrink-0">MSF-{id}</span>
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0',
                                    s.type === 'meterpreter' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                                )}>{s.type?.toUpperCase()}</span>
                                <span className="text-cyan-400 font-mono text-xs truncate">
                                    {s.session_host || s.target_host || '-'}:{s.session_port || '-'}
                                </span>
                                <span className="text-gray-500 font-mono text-[10px] truncate hidden md:inline">
                                    {s.info || s.via_exploit || ''}
                                </span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-500 shrink-0">→ INTERACT</span>
                        </Link>
                    ))}
                    {entries.length > 6 && (
                        <div className="text-[10px] font-mono text-gray-500 text-center pt-1">
                            +{entries.length - 6} more · view all in Callbacks
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Jobs Table ──────────────────────────────────────────────────────────────
function JobsPanel({ jobs, onStop }: { jobs: Record<string, string>; onStop: (id: string) => void }) {
    const entries = Object.entries(jobs);
    if (entries.length === 0) {
        return (
            <div className="border border-ghost/30 bg-void/50 p-6">
                <div className="flex items-center gap-2 mb-4 text-gray-400 text-xs font-mono tracking-widest uppercase">
                    <Activity size={16} /> RUNNING JOBS
                </div>
                <div className="text-gray-500 font-mono text-sm text-center py-8">NO_RUNNING_JOBS</div>
            </div>
        );
    }
    return (
        <div className="border border-ghost/30 bg-void/50 p-6">
            <div className="flex items-center gap-2 mb-4 text-gray-400 text-xs font-mono tracking-widest uppercase">
                <Activity size={16} /> RUNNING JOBS ({entries.length})
            </div>
            <div className="space-y-2">
                {entries.map(([id, name]) => (
                    <div key={id} className="flex items-center justify-between border border-ghost/15 px-3 py-2 hover:border-signal/30 transition-colors">
                        <div className="flex items-center gap-3">
                            <span className="text-signal font-mono text-xs font-bold">[{id}]</span>
                            <span className="text-gray-300 font-mono text-xs">{name}</span>
                        </div>
                        <button onClick={() => onStop(id)} className="text-red-400/60 hover:text-red-400 transition-colors" title="Stop job">
                            <CircleStop size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Module Stats Breakdown ──────────────────────────────────────────────────
function ModuleBreakdown({ stats }: { stats: Record<string, number> }) {
    const moduleTypes = [
        { key: 'exploits', label: 'Exploits', icon: <Bug size={14} />, color: 'text-red-400' },
        { key: 'auxiliary', label: 'Auxiliary', icon: <Layers size={14} />, color: 'text-yellow-400' },
        { key: 'post', label: 'Post', icon: <Shield size={14} />, color: 'text-purple-400' },
        { key: 'payloads', label: 'Payloads', icon: <Package size={14} />, color: 'text-cyan-400' },
        { key: 'encoders', label: 'Encoders', icon: <Hash size={14} />, color: 'text-green-400' },
        { key: 'nops', label: 'NOPs', icon: <Cpu size={14} />, color: 'text-gray-400' },
        { key: 'evasion', label: 'Evasion', icon: <Shield size={14} />, color: 'text-orange-400' },
    ];
    const total = moduleTypes.reduce((sum, t) => sum + (stats[t.key] || 0), 0);

    return (
        <div className="border border-ghost/30 bg-void/50 p-6">
            <div className="flex items-center gap-2 mb-4 text-gray-400 text-xs font-mono tracking-widest uppercase">
                <Bug size={16} /> MODULE DATABASE
            </div>
            <div className="space-y-3">
                {moduleTypes.map(t => {
                    const count = stats[t.key] || 0;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                        <div key={t.key}>
                            <div className="flex items-center justify-between mb-1">
                                <div className={cn("flex items-center gap-2 text-xs font-mono", t.color)}>
                                    {t.icon} {t.label}
                                </div>
                                <span className="text-xs font-mono text-gray-400">{count.toLocaleString()}</span>
                            </div>
                            <div className="h-1 w-full bg-ghost/20 rounded-full overflow-hidden">
                                <div className={cn("h-full transition-all duration-700 rounded-full", t.color.replace('text-', 'bg-'))} style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-4 pt-3 border-t border-ghost/15 flex justify-between text-xs font-mono">
                <span className="text-gray-500">TOTAL MODULES</span>
                <span className="text-signal font-bold">{total.toLocaleString()}</span>
            </div>
        </div>
    );
}

// ── Settings Modal ──────────────────────────────────────────────────────────
function ConnectionSettings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
    const creds = getStoredCredentials();
    const [user, setUser] = useState(creds.user);
    const [pass, setPass] = useState(creds.pass);

    if (!open) return null;

    const handleSave = () => {
        saveCredentials(user, pass);
        onClose();
        onSaved();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-void border border-ghost/40 p-6 w-full max-w-md"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-mono tracking-widest text-signal uppercase">MSF-RPC Credentials</h3>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
                    </div>
                    <p className="text-xs font-mono text-gray-500 mb-4">Connection is proxied through Minerva's Nginx gateway.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">USERNAME</label>
                            <input value={user} onChange={e => setUser(e.target.value)} type="text"
                                className="w-full mt-1 bg-black/60 border border-ghost/30 text-signal font-mono text-sm px-3 py-2 focus:border-signal/60 focus:outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">PASSWORD</label>
                            <input value={pass} onChange={e => setPass(e.target.value)} type="password"
                                className="w-full mt-1 bg-black/60 border border-ghost/30 text-signal font-mono text-sm px-3 py-2 focus:border-signal/60 focus:outline-none transition-colors" />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-signal text-black text-xs font-mono uppercase tracking-wider hover:bg-signal/80 transition-colors">
                            <Save size={14} /> SAVE
                        </button>
                        <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-gray-400 text-xs font-mono uppercase tracking-wider hover:text-white hover:border-white/30 transition-colors">
                            CANCEL
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function Metasploit() {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const [status, setStatus] = useState<MsfConnectionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState<MsfTab>('dashboard');

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const s = await getFullStatus();
            setStatus(s);
            setLastRefresh(new Date());
        } catch (e: any) {
            setStatus({ connected: false, sessions: {}, jobs: {}, error: e.message });
        } finally {
            setLoading(false);
        }
    }, []);

    // Heavy refresh — initial load + slow background cadence. The fast
    // ping below also triggers this when it flips offline → online.
    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, MSF_HEAVY_REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [refresh]);

    // Fast online-indicator ping. Keeps the connection dot reactive
    // without paying for module-list enumeration on every cycle. When
    // the connection comes back, kick a heavy refresh immediately so
    // the dashboard counters fill in instead of waiting up to 60s.
    useEffect(() => {
        let cancelled = false;
        let prevConnected: boolean | null = null;
        const tick = async () => {
            const up = await pingMsfRpc();
            if (cancelled) return;
            setStatus(prev => {
                if (!prev) {
                    // Heavy refresh hasn't returned yet — set a minimal
                    // record so the UI dot updates straight away.
                    return { connected: up, sessions: {}, jobs: {} };
                }
                if (prev.connected === up) return prev;
                return { ...prev, connected: up, error: up ? undefined : prev.error };
            });
            if (prevConnected === false && up) {
                // Re-fetch the heavy data on reconnect so the page fills in.
                refresh();
            }
            prevConnected = up;
        };
        tick();
        const iv = setInterval(tick, MSF_PING_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(iv); };
    }, [refresh]);

    const handleStopJob = async (id: string) => {
        await stopJob(id);
        refresh();
    };

    // Scope sessions to the operator's current Mythic operation — MSF
    // RPC's `session.list` is global across the daemon, but each session
    // carries a `workspace` field that the boot bootstrap pins to
    // `mythic-op-{id}`. Counters and the SessionsSummary panel read
    // only the scoped subset so other operations don't leak in.
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const scopedSessions = useMemo(
        () => status?.sessions ? filterSessionsByOperation(status.sessions, opId) : {},
        [status?.sessions, opId],
    );
    const sessionCount = Object.keys(scopedSessions).length;
    const jobCount = status ? Object.keys(status.jobs).length : 0;

    // Tri-state connection: 'connecting' before the first ping/heavy
    // refresh returns, then 'online'/'offline' from the live status.
    // Don't flash OFFLINE during the initial probe — operators have
    // mistaken that for a real connection failure.
    const connState: 'connecting' | 'online' | 'offline' = status === null
        ? 'connecting'
        : status.connected ? 'online' : 'offline';
    const dotClass = connState === 'online'
        ? 'bg-accent animate-pulse'
        : connState === 'connecting'
            ? 'bg-amber-400 animate-pulse'
            : 'bg-red-500';
    const dotText = connState === 'online'
        ? 'RPC_CONNECTED'
        : connState === 'connecting'
            ? 'RPC_CONNECTING'
            : 'RPC_OFFLINE';
    const dotTextClass = connState === 'online'
        ? 'text-accent'
        : connState === 'connecting'
            ? 'text-amber-400'
            : 'text-red-500';

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-x-hidden">
            <div className={cn("transition-all duration-300 p-6 lg:p-12 min-h-screen", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                <motion.div variants={container} initial="hidden" animate="show">

                    {/* Header */}
                    <header className="flex justify-between items-center mb-8 border-b border-ghost/30 pb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 flex items-center justify-center border border-ghost/40 bg-void">
                                <Server size={22} className="text-signal" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-widest text-signal">METASPLOIT</h1>
                                <p className="text-xs text-signal font-mono tracking-widest">MSF_RPC_FRAMEWORK_INTERFACE</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Connection Status — tri-state */}
                            <div className="hidden md:flex items-center gap-4 text-xs font-mono text-signal">
                                <span className={cn("flex items-center gap-2", dotTextClass)}>
                                    <span className={cn("w-2 h-2 rounded-full", dotClass)} />
                                    {dotText}
                                </span>
                                {status?.version && (
                                    <span className="flex items-center gap-4 before:content-[''] before:w-px before:h-3 before:bg-signal/20">
                                        v{status.version.version}
                                    </span>
                                )}
                                {lastRefresh && (
                                    <span className="flex items-center gap-4 before:content-[''] before:w-px before:h-3 before:bg-signal/20">
                                        {lastRefresh.toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                            <button onClick={() => setSettingsOpen(true)} className="p-2 text-signal hover:text-accent transition-colors" title="RPC Settings">
                                <SettingsIcon size={18} />
                            </button>
                            <button onClick={refresh} className={cn("p-2 text-signal hover:text-accent transition-colors", loading && "animate-spin")} title="Refresh">
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </header>

                    {/* Tab Navigation */}
                    <div className="flex items-center gap-0 mb-6 border-b border-white/8">
                        {([
                            { key: 'dashboard' as MsfTab, label: 'DASHBOARD', icon: <LayoutDashboard size={14} /> },
                            { key: 'attack' as MsfTab, label: 'LAUNCH ATTACK', icon: <Rocket size={14} /> },
                            { key: 'operations' as MsfTab, label: 'OPERATIONS', icon: <ClipboardList size={14} /> },
                            { key: 'history' as MsfTab, label: 'TASK HISTORY', icon: <History size={14} /> },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 px-5 py-2.5 text-xs font-mono uppercase tracking-widest border-b-2 transition-colors -mb-[1px]',
                                    activeTab === tab.key ? 'border-signal text-signal' : 'border-transparent text-signal hover:border-signal/40'
                                )}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Connecting hero — covers the initial probe so the page
                        doesn't flash "OFFLINE" before the first ping returns. */}
                    {connState === 'connecting' && (
                        <motion.div variants={item} className="min-h-[70vh] flex items-center justify-center">
                            <div className="flex flex-col items-center gap-8">
                                <div className="relative w-24 h-24 flex items-center justify-center">
                                    <span className="absolute inset-0 rounded-full border border-amber-400/30 animate-ping" />
                                    <span className="absolute inset-3 rounded-full border border-amber-400/60" />
                                    <Server size={32} className="text-amber-400 relative" strokeWidth={1.6} />
                                </div>
                                <div className="text-center space-y-3">
                                    <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-signal">
                                        Establishing link
                                    </div>
                                    <div className="text-xl font-mono text-signal tracking-[0.2em] font-bold">
                                        PROBING MSF-RPC DAEMON
                                    </div>
                                    <div className="text-xs font-mono text-signal pt-1 max-w-md">
                                        Sending one <span className="text-amber-400">core.version</span> RPC. Status will resolve within a few seconds.
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Error Banner — only after a real failed probe, not during the initial check. */}
                    {connState === 'offline' && (
                        <motion.div variants={item} className="mb-6 border border-red-500/30 bg-red-500/[0.04] p-4 flex items-start gap-3 rounded-md">
                            <WifiOff size={18} className="text-red-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="text-sm font-mono text-red-500 font-bold tracking-wider">CONNECTION FAILED</div>
                                <div className="text-xs font-mono text-signal mt-1">{status?.error || 'Cannot reach MSF-RPC daemon.'}</div>
                                <button onClick={() => setSettingsOpen(true)} className="mt-2 text-xs font-mono text-red-500 hover:text-red-400 underline transition-colors">
                                    CHECK CONNECTION SETTINGS
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Dashboard Tab — hidden during the initial probe; the
                        connecting hero fills the page instead. */}
                    {activeTab === 'dashboard' && connState !== 'connecting' && (
                        <>
                            {/* Stat Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                                <motion.div variants={item}>
                                    <StatCard
                                        icon={<Wifi size={16} />}
                                        label="STATUS"
                                        value={status?.connected ? 'ONLINE' : 'OFFLINE'}
                                        sub={status?.version ? `Framework ${status.version.version}` : undefined}
                                        color={status?.connected ? 'green' : 'red'}
                                    />
                                </motion.div>
                                <motion.div variants={item}>
                                    <StatCard
                                        icon={<Crosshair size={16} />}
                                        label="SESSIONS"
                                        value={sessionCount}
                                        sub={sessionCount > 0 ? 'ACTIVE CONNECTIONS' : 'NO TARGETS'}
                                        color={sessionCount > 0 ? 'red' : 'signal'}
                                    />
                                </motion.div>
                                <motion.div variants={item}>
                                    <StatCard
                                        icon={<Activity size={16} />}
                                        label="JOBS"
                                        value={jobCount}
                                        sub={jobCount > 0 ? 'RUNNING' : 'IDLE'}
                                        color={jobCount > 0 ? 'yellow' : 'signal'}
                                    />
                                </motion.div>
                                <motion.div variants={item}>
                                    <StatCard
                                        icon={<Bug size={16} />}
                                        label="MODULES"
                                        value={status?.moduleStats
                                            ? Object.values(status.moduleStats).reduce((a, b) => a + b, 0).toLocaleString()
                                            : '-'}
                                        sub="TOTAL LOADED"
                                        color="purple"
                                    />
                                </motion.div>
                            </div>

                            {/* Main Grid */}
                            {status?.connected && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <motion.div variants={item}>
                                        <SessionsSummary sessions={scopedSessions} />
                                    </motion.div>
                                    <motion.div variants={item}>
                                        <JobsPanel jobs={status.jobs} onStop={handleStopJob} />
                                    </motion.div>
                                </div>
                            )}

                            {/* Module Breakdown */}
                            {status?.connected && status.moduleStats && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <motion.div variants={item}>
                                        <ModuleBreakdown stats={status.moduleStats} />
                                    </motion.div>
                                    <motion.div variants={item}>
                                        {/* System Terminal */}
                                        <div className="border border-ghost/30 bg-black p-5 font-mono text-xs min-h-[280px] text-gray-400 relative overflow-hidden">
                                            <div className="absolute top-3 right-3 text-gray-400/30"><Terminal size={16} /></div>
                                            <div className="space-y-1.5">
                                                <p className="text-signal">$ msf_status.sh</p>
                                                <p>Querying MSF-RPC daemon... <span className="text-signal">[OK]</span></p>
                                                <p className="text-signal"> {'>'} Framework: Metasploit {status.version?.version}</p>
                                                <p> {'>'} Ruby: {status.version?.ruby}</p>
                                                <p> {'>'} API: v{status.version?.api}</p>
                                                <p> {'>'} Active Sessions: <span className={sessionCount > 0 ? 'text-red-400' : ''}>{sessionCount}</span></p>
                                                <p> {'>'} Running Jobs: <span className={jobCount > 0 ? 'text-yellow-400' : ''}>{jobCount}</span></p>
                                                {status.moduleStats && (
                                                    <>
                                                        <p> {'>'} Exploits: {status.moduleStats.exploits?.toLocaleString()}</p>
                                                        <p> {'>'} Payloads: {status.moduleStats.payloads?.toLocaleString()}</p>
                                                        <p> {'>'} Auxiliary: {status.moduleStats.auxiliary?.toLocaleString()}</p>
                                                        <p> {'>'} Post: {status.moduleStats.post?.toLocaleString()}</p>
                                                    </>
                                                )}
                                                <p className="text-green-400 mt-2"> {'>'} All systems nominal.</p>
                                                <p className="animate-pulse">_</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Launch Attack Tab */}
                    {activeTab === 'attack' && status?.connected && (
                        <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-500 font-mono text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading...</div>}>
                            <LaunchAttack />
                        </Suspense>
                    )}

                    {activeTab === 'attack' && status && !status.connected && (
                        <div className="text-center py-20 text-signal font-mono text-sm tracking-[0.15em]">
                            MSF-RPC must be connected to launch attacks.
                        </div>
                    )}

                    {/* Operations Tab */}
                    {activeTab === 'operations' && status?.connected && (
                        <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-500 font-mono text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading...</div>}>
                            <Operations />
                        </Suspense>
                    )}

                    {activeTab === 'operations' && status && !status.connected && (
                        <div className="text-center py-20 text-signal font-mono text-sm tracking-[0.15em]">
                            MSF-RPC must be connected to view operations.
                        </div>
                    )}

                    {/* Task History Tab */}
                    {activeTab === 'history' && (
                        <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-500 font-mono text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading...</div>}>
                            <TaskBrowser />
                        </Suspense>
                    )}

                </motion.div>
            </div>

            <ConnectionSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={refresh} />
        </div>
    );
}
