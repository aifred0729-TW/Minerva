import React, { useState, useMemo, useEffect } from 'react';
import { useSubscription, useMutation } from '@apollo/client';
import {
    ReactFlow, Background,
    useNodesState, useEdgesState,
    Handle, Position,
    Node, Edge, EdgeProps, getStraightPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Network, Search, RefreshCw, Eye, EyeOff, Play, Square,
    Zap, ArrowRight, Terminal, ChevronUp, ChevronDown,
    Wifi, WifiOff, Activity, Server, User, Clock, Skull,
    Package, Globe, ChevronRight, Layers, KeyRound, ExternalLink, Lock,
} from 'lucide-react';
import { snackActions } from '../../components/utilities/Snackbar';
import { useAppStore } from '../store';
import {
    CALLBACKPORT_STREAM,
    TOGGLE_PROXY_MUTATION,
    TEST_PROXY_MUTATION,
} from '../lib/api';
const loadingSound = process.env.PUBLIC_URL + '/audio/tunnel.mp3';

// ============================================
// Types
// ============================================
interface C2ParamInstance {
    value: string;
    c2profileparameter: { name: string };
    c2profile: { name: string };
}

interface PayloadC2Profile {
    c2profile: { name: string; is_p2p: boolean };
}

interface CallbackPort {
    id: number;
    deleted: boolean;
    port_type: 'socks' | 'rpfwd' | 'interactive';
    local_port: number;
    remote_port: number;
    remote_ip: string;
    bytes_received: number;
    bytes_sent: number;
    username: string;
    password: string;
    updated_at: string;
    task?: { display_id: number };
    callback: {
        id: number;
        display_id: number;
        host: string;
        ip: string;
        user: string;
        description: string;
        domain: string;
        process_name: string;
        integrity_level: number;
        active: boolean;
        init_callback: string;
        last_checkin: string;
        payload?: {
            uuid: string;
            payloadtype: { name: string };
            payloadc2profiles: PayloadC2Profile[];
            c2profileparametersinstances: C2ParamInstance[];
        };
    };
}

// ============================================
// Helpers
// ============================================
const fmtBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const fmtAbsoluteTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const fmtRelativeTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
    const diff = Date.now() - d.getTime();
    if (diff < 0) return 'just now';
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
};

// Auto-ticking relative time — re-renders every second
const LiveTime = ({ isoStr }: { isoStr: string }) => {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);
    return <>{fmtRelativeTime(isoStr)}</>;
};

const PORT_TYPE_LABELS: Record<string, string> = {
    socks: 'SOCKS5',
    rpfwd: 'RPFWD',
    interactive: 'INTERACTIVE',
};

const PORT_TYPE_COLORS: Record<string, string> = {
    socks: 'text-signal border-signal/40 bg-signal/10',
    rpfwd: 'text-blue-400 border-blue-400/40 bg-blue-400/10',
    interactive: 'text-purple-400 border-purple-400/40 bg-purple-400/10',
};

// ============================================
// Flow Diagram
// ============================================

/** Single labelled node box in the flow diagram */
const FlowNode = ({
    label,
    sublabel,
    borderClass = 'border-white/15',
    bgClass = 'bg-black/50',
    labelClass = 'text-gray-200',
}: {
    label: React.ReactNode;
    sublabel?: string;
    borderClass?: string;
    bgClass?: string;
    labelClass?: string;
}) => (
    <div className={cn('px-2 py-1 border shrink-0 text-center', borderClass, bgClass)}>
        <div className={cn('font-mono font-bold text-[11px] tracking-wide leading-none', labelClass)}>{label}</div>
        {sublabel && (
            <div className="text-[9px] text-gray-600 font-mono mt-0.5 leading-none tracking-widest uppercase">{sublabel}</div>
        )}
    </div>
);

/** Connecting line with an animated Framer-Motion particle */
const FlowArrow = ({
    active,
    particleClass,
    direction = 'right',
    label,
}: {
    active: boolean;
    particleClass: string;
    direction?: 'right' | 'left' | 'both';
    label?: string;
}) => {
    const arrowTxtClass = active ? particleClass.replace('bg-', 'text-') : 'text-gray-700';
    return (
        <div className="flex flex-col items-center justify-center flex-1 min-w-[36px] max-w-[80px]">
            {label && (
                <span className="text-[9px] text-gray-600 font-mono mb-0.5 tracking-wider uppercase">{label}</span>
            )}
            <div className="relative flex items-center w-full gap-0.5">
                {(direction === 'left' || direction === 'both') && (
                    <span className={cn('text-[10px] leading-none shrink-0', arrowTxtClass)}>◂</span>
                )}
                <div className="relative flex-1 h-px bg-gray-700/50 overflow-hidden">
                    {active && (
                        <motion.div
                            className={cn('absolute top-[-1.5px] h-[4px] w-3 rounded-sm opacity-80', particleClass)}
                            animate={{ x: direction === 'left' ? ['110%', '-60%'] : ['-60%', '110%'] }}
                            transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }}
                        />
                    )}
                    {active && direction === 'both' && (
                        <motion.div
                            className={cn('absolute top-[-1.5px] h-[4px] w-3 rounded-sm opacity-50', particleClass)}
                            animate={{ x: ['110%', '-60%'] }}
                            transition={{ duration: 1.3, repeat: Infinity, ease: 'linear', delay: 0.65 }}
                        />
                    )}
                </div>
                {(direction === 'right' || direction === 'both') && (
                    <span className={cn('text-[10px] leading-none shrink-0', arrowTxtClass)}>▸</span>
                )}
            </div>
        </div>
    );
};

/** Visual tunnel-topology diagram — layout changes per port_type */
const FlowDiagram = ({ port }: { port: CallbackPort }) => {
    const active = !port.deleted;
    const pc: Record<string, string> = {
        socks: 'bg-signal',
        rpfwd: 'bg-blue-400',
        interactive: 'bg-purple-400',
    };
    const particleClass = pc[port.port_type] || 'bg-gray-400';
    const raw = port.callback.host || port.callback.ip || 'AGENT';
    const agentLabel = raw.length > 14 ? raw.slice(0, 13) + '…' : raw;

    if (port.port_type === 'socks') {
        // CLIENT → [:port MYTHIC] ⟷ [AGENT] → ANY
        return (
            <div className="flex items-center w-full gap-0 py-1.5 overflow-x-auto minimal-scrollbar">
                <FlowNode label="CLIENT" sublabel="you" borderClass="border-gray-600/40" bgClass="bg-gray-900/50" labelClass="text-gray-400" />
                <FlowArrow active={active} particleClass={particleClass} direction="right" label="proxy" />
                <FlowNode label={`:${port.local_port}`} sublabel="MYTHIC" borderClass="border-signal/35" bgClass="bg-signal/5" labelClass="text-signal" />
                <FlowArrow active={active} particleClass={particleClass} direction="both" label="C2" />
                <FlowNode label={agentLabel} sublabel="agent" borderClass="border-green-500/35" bgClass="bg-green-900/10" labelClass="text-green-300" />
                <FlowArrow active={active} particleClass={particleClass} direction="right" label="target" />
                <FlowNode label="ANY" sublabel="internet" borderClass="border-gray-600/30" bgClass="bg-black/30" labelClass="text-gray-500" />
            </div>
        );
    }

    if (port.port_type === 'rpfwd') {
        // [REMOTE src] → [AGENT] ⟷ [MYTHIC :port] → CLIENT
        const srcLabel = port.remote_ip
            ? `${port.remote_ip.length > 12 ? port.remote_ip.slice(0, 11) + '…' : port.remote_ip}:${port.remote_port}`
            : `*:${port.remote_port}`;
        return (
            <div className="flex items-center w-full gap-0 py-1.5 overflow-x-auto minimal-scrollbar">
                <FlowNode label={srcLabel} sublabel="source" borderClass="border-blue-500/35" bgClass="bg-blue-900/10" labelClass="text-blue-300" />
                <FlowArrow active={active} particleClass={particleClass} direction="right" />
                <FlowNode label={agentLabel} sublabel="agent" borderClass="border-green-500/35" bgClass="bg-green-900/10" labelClass="text-green-300" />
                <FlowArrow active={active} particleClass={particleClass} direction="both" label="C2" />
                <FlowNode label={`:${port.local_port}`} sublabel="MYTHIC" borderClass="border-signal/35" bgClass="bg-signal/5" labelClass="text-signal" />
                <FlowArrow active={active} particleClass={particleClass} direction="right" />
                <FlowNode label="CLIENT" sublabel="you" borderClass="border-gray-600/40" bgClass="bg-gray-900/50" labelClass="text-gray-400" />
            </div>
        );
    }

    // interactive: OPERATOR ⟷ MYTHIC ⟷ AGENT ⟷ SHELL
    return (
        <div className="flex items-center w-full gap-0 py-1.5 overflow-x-auto minimal-scrollbar">
            <FlowNode label="OPERATOR" sublabel="you" borderClass="border-gray-600/40" bgClass="bg-gray-900/50" labelClass="text-gray-400" />
            <FlowArrow active={active} particleClass={particleClass} direction="both" />
            <FlowNode label={`:${port.local_port}`} sublabel="MYTHIC" borderClass="border-signal/35" bgClass="bg-signal/5" labelClass="text-signal" />
            <FlowArrow active={active} particleClass={particleClass} direction="both" label="C2" />
            <FlowNode label={agentLabel} sublabel="agent" borderClass="border-purple-500/35" bgClass="bg-purple-900/10" labelClass="text-purple-300" />
            <FlowArrow active={active} particleClass={particleClass} direction="both" />
            <FlowNode label="SHELL" sublabel="target" borderClass="border-gray-600/30" bgClass="bg-black/30" labelClass="text-gray-500" />
        </div>
    );
};

// Get the primary C2 host and port across all instances on a payload
const getC2HostPort = (port: CallbackPort): { host?: string; port?: string; profileName?: string } => {
    const instances = port.callback?.payload?.c2profileparametersinstances;
    if (!instances?.length) return {};
    // Prefer callback_host, fallback to host
    const hostInst = instances.find(p =>
        p.c2profileparameter.name === 'callback_host' || p.c2profileparameter.name === 'host'
    );
    const portInst = instances.find(p =>
        p.c2profileparameter.name === 'callback_port' || p.c2profileparameter.name === 'port'
    );
    return {
        host: hostInst?.value,
        port: portInst?.value,
        profileName: hostInst?.c2profile.name ?? portInst?.c2profile.name,
    };
};

// Friendly label for known C2 parameter names
const C2_PARAM_LABELS: Record<string, string> = {
    callback_host: 'Host',
    callback_port: 'Port',
    host: 'Host',
    port: 'Port',
    callback_interval: 'Interval',
    callback_jitter: 'Jitter',
    killdate: 'Kill Date',
    encrypted_exchange_check: 'Encrypted',
    AESPSK: 'AES PSK',
    aespsk: 'AES PSK',
    proxyHost: 'Proxy Host',
    proxyPort: 'Proxy Port',
    proxyUser: 'Proxy User',
    proxyPass: 'Proxy Pass',
    domains: 'Domains',
    USER_AGENT: 'User Agent',
    HEADERS: 'Headers',
};

// Params that contain sensitive data (partially masked)
const SENSITIVE_PARAMS = new Set(['AESPSK', 'aespsk', 'proxyPass']);

const maskValue = (name: string, value: string): string => {
    if (SENSITIVE_PARAMS.has(name) && value.length > 8) {
        return value.slice(0, 6) + '••••';
    }
    return value;
};

// ============================================
// Tunnel Row — compact, clean, 3-section card
// ============================================
const TunnelRow = ({ port, onPortToggled }: { port: CallbackPort; onPortToggled: (id: number, deleted: boolean) => void }) => {
    const [confirmStop, setConfirmStop] = useState(false);
    const [showPayloadConfig, setShowPayloadConfig] = useState(false);

    const c2hp = getC2HostPort(port);

    const [toggleProxy, { loading: toggling }] = useMutation(TOGGLE_PROXY_MUTATION, {
        onCompleted: (data: any) => {
            if (data.toggleProxy.status === 'success') {
                const nowDeleted = !port.deleted;
                snackActions.success(nowDeleted ? 'Proxy stopped' : 'Proxy started');
                setConfirmStop(false);
                onPortToggled(port.id, nowDeleted);
            } else {
                snackActions.error(data.toggleProxy.error);
            }
        },
        onError: () => snackActions.error('Operation not allowed'),
    });

    const [testProxy, { loading: testing }] = useMutation(TEST_PROXY_MUTATION, {
        onCompleted: (data: any) => {
            if (data.testProxy.status === 'success') {
                snackActions.success('Connection test initiated');
            } else {
                snackActions.error(data.testProxy.error);
            }
        },
        onError: () => snackActions.error('Test failed'),
    });

    const handleToggle = () => {
        if (!port.deleted && !confirmStop) { setConfirmStop(true); return; }
        setConfirmStop(false);
        toggleProxy({ variables: { callbackport_id: port.id, action: port.deleted ? 'start' : 'stop' } });
    };

    const typeColors = PORT_TYPE_COLORS[port.port_type] || 'text-gray-400 border-gray-400/30 bg-gray-400/10';
    const payload = port.callback?.payload;
    const allC2Profiles = payload?.payloadc2profiles || [];
    const instancesByProfile = allC2Profiles.reduce((acc, p) => {
        acc[p.c2profile.name] = {
            is_p2p: p.c2profile.is_p2p,
            instances: (payload?.c2profileparametersinstances || []).filter(
                inst => inst.c2profile.name === p.c2profile.name
            ),
        };
        return acc;
    }, {} as Record<string, { is_p2p: boolean; instances: C2ParamInstance[] }>);

    const rx = port.bytes_received || 0;
    const tx = port.bytes_sent || 0;
    const hasTraffic = rx > 0 || tx > 0;

    /* accent color per type */
    const accentBorder = port.deleted
        ? 'border-l-gray-600'
        : port.port_type === 'socks'
            ? 'border-l-signal'
            : port.port_type === 'rpfwd'
                ? 'border-l-blue-400'
                : 'border-l-purple-400';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(
                'border-l-2 bg-black/40 border border-white/8 font-mono overflow-hidden',
                accentBorder,
                port.deleted && 'opacity-55'
            )}
        >
            {/* ── Section 1: Header ─── */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
                {/* Status dot */}
                <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    port.deleted ? 'bg-gray-600' : 'bg-signal animate-pulse'
                )} />

                {/* Type badge */}
                <span className={cn('px-1.5 py-0.5 border text-[11px] font-bold tracking-widest shrink-0', typeColors)}>
                    {PORT_TYPE_LABELS[port.port_type] || port.port_type.toUpperCase()}
                </span>

                {/* Port */}
                <span className="text-white font-bold text-base tabular-nums">:{port.local_port}</span>

                {/* RPFWD target */}
                {port.port_type === 'rpfwd' && (
                    <span className="flex items-center gap-1 text-blue-300 text-xs font-semibold">
                        <ArrowRight size={11} className="text-gray-500" />
                        {port.remote_ip}:{port.remote_port}
                    </span>
                )}

                {/* Auth badge */}
                {port.username && (
                    <span className="flex items-center gap-1 border border-yellow-500/35 px-1.5 py-0.5 text-yellow-400 text-[11px]">
                        <Lock size={9} />
                        {port.username}
                    </span>
                )}

                {/* Traffic chip */}
                {hasTraffic && (
                    <span className="flex items-center gap-2 text-xs font-mono ml-1">
                        <span className="text-green-400">↓{fmtBytes(rx)}</span>
                        <span className="text-blue-400">↑{fmtBytes(tx)}</span>
                    </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Actions */}
                <AnimatePresence mode="wait">
                    {confirmStop ? (
                        <motion.div
                            key="confirm"
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            className="flex items-center gap-1.5"
                        >
                            <span className="text-red-400 text-[10px] font-bold tracking-wider hidden sm:block">STOP?</span>
                            <button onClick={handleToggle} disabled={toggling}
                                className="px-2.5 py-1 bg-red-500/80 text-black font-bold text-[10px] hover:bg-red-400 transition-colors">
                                YES
                            </button>
                            <button onClick={() => setConfirmStop(false)}
                                className="px-2.5 py-1 border border-gray-600 text-gray-300 font-bold text-[10px] hover:border-gray-400 transition-colors">
                                NO
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div key="btns" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {port.remote_port !== 0 && !port.deleted && (
                                <button
                                    onClick={() => testProxy({ variables: { callbackport_id: port.id } })}
                                    disabled={testing}
                                    title="Test remote connection"
                                    className="flex items-center gap-1 px-2 py-1 border border-blue-400/35 text-blue-300 text-[10px] font-bold hover:bg-blue-400/10 transition-colors disabled:opacity-40"
                                >
                                    <Zap size={10} />TEST
                                </button>
                            )}
                            <button
                                onClick={handleToggle}
                                disabled={toggling}
                                title={port.deleted ? 'Start proxy' : 'Stop proxy'}
                                className={cn(
                                    'flex items-center gap-1 px-2.5 py-1 border font-bold text-[10px] tracking-wider transition-colors disabled:opacity-40',
                                    port.deleted
                                        ? 'border-signal/40 text-signal hover:bg-signal/10'
                                        : 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                                )}
                            >
                                {toggling ? <RefreshCw size={9} className="animate-spin" /> : port.deleted
                                    ? <><Play size={9} />START</>
                                    : <><Square size={9} />STOP</>
                                }
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Section 2: Callback info ─── */}
            <div className="px-3 py-2 flex items-center gap-2 flex-wrap text-xs border-b border-white/5">
                {/* Callback link */}
                <a href={`/new/callbacks/${port.callback.display_id}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-gray-200 hover:text-signal transition-colors group font-mono font-bold">
                    <Terminal size={11} className="text-gray-500 group-hover:text-signal" />
                    C-{port.callback.display_id}
                    <ExternalLink size={9} className="text-gray-600 group-hover:text-signal/70" />
                </a>
                <span className="text-gray-700">·</span>
                {/* Host */}
                <span className="flex items-center gap-1 text-gray-100 font-semibold">
                    <Server size={11} className="text-gray-500 shrink-0" />
                    {port.callback.host}
                    {port.callback.ip && <span className="text-gray-400 text-[11px] font-normal">({port.callback.ip})</span>}
                </span>
                <span className="text-gray-700">·</span>
                {/* User */}
                <span className="flex items-center gap-1 text-gray-300">
                    <User size={11} className="text-gray-500 shrink-0" />
                    {port.callback.user || '—'}
                    {port.callback.domain && <span className="text-gray-500">@{port.callback.domain}</span>}
                </span>
                {/* Task */}
                {port.task && (
                    <>
                        <span className="text-gray-700">·</span>
                        <a href={`/new/task/${port.task.display_id}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-gray-400 hover:text-signal transition-colors group">
                            <Activity size={10} className="text-gray-600 group-hover:text-signal" />
                            T-{port.task.display_id}
                        </a>
                    </>
                )}
                {/* C2 host */}
                {(c2hp.host || c2hp.port) && (
                    <>
                        <span className="text-gray-700">·</span>
                        <span className="flex items-center gap-1 bg-signal/8 border border-signal/20 px-1.5 py-0.5">
                            <Globe size={9} className="text-signal/70 shrink-0" />
                            {c2hp.host && <span className="text-signal font-semibold">{c2hp.host}</span>}
                            {c2hp.host && c2hp.port && <span className="text-gray-600">:</span>}
                            {c2hp.port && <span className="text-yellow-400 font-bold">{c2hp.port}</span>}
                            {c2hp.profileName && <span className="text-gray-500 border-l border-gray-700 pl-1 ml-0.5">{c2hp.profileName}</span>}
                        </span>
                    </>
                )}
                {/* Description */}
                {port.callback.description && (
                    <span className="text-gray-500 italic truncate max-w-[160px]" title={port.callback.description}>
                        {port.callback.description}
                    </span>
                )}
                {/* Time + status badge pushed right */}
                <span className="ml-auto flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-gray-600" title={fmtAbsoluteTime(port.updated_at)}>
                        <Clock size={9} />
                        <LiveTime isoStr={port.updated_at} />
                    </span>
                    <span className={cn(
                        'flex items-center gap-1 font-bold tracking-wider text-[11px]',
                        port.callback.active ? 'text-signal' : 'text-gray-600'
                    )}>
                        {port.callback.active ? <Wifi size={10} /> : <WifiOff size={10} />}
                        {port.callback.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                </span>
            </div>

            {/* ── Section 3 (optional): Payload config toggle ─── */}
            {payload && (
                <>
                    <button
                        onClick={() => setShowPayloadConfig(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-gray-500 hover:text-signal hover:bg-white/2 transition-colors"
                    >
                        {showPayloadConfig ? <ChevronDown size={10} className="text-signal" /> : <ChevronRight size={10} />}
                        <Package size={9} />
                        <span className="font-bold uppercase tracking-widest text-gray-400">{payload.payloadtype.name}</span>
                        <span className="text-gray-600">payload config</span>
                        {!showPayloadConfig && c2hp.host && (
                            <span className="text-gray-700 ml-1">· <span className="text-signal/50">{c2hp.host}</span></span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showPayloadConfig && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                            >
                                <div className="border-t border-white/5 bg-black/20">
                                    {/* Header */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-signal/10 bg-signal/4">
                                        <Package size={10} className="text-signal" />
                                        <span className="font-mono text-[10px] text-signal font-bold tracking-widest uppercase">{payload.payloadtype.name}</span>
                                        <span className="text-gray-600 text-[10px] font-mono truncate">{payload.uuid}</span>
                                    </div>
                                    {allC2Profiles.length === 0 ? (
                                        <div className="px-3 py-2 text-[10px] text-gray-600 font-mono">No C2 profile data</div>
                                    ) : (
                                        Object.entries(instancesByProfile).map(([profileName, { is_p2p, instances: profileInsts }]) => (
                                            <div key={profileName} className="px-3 py-2 border-t border-white/4 first:border-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <Layers size={9} className={is_p2p ? 'text-purple-400' : 'text-blue-400'} />
                                                    <span className={cn('font-mono font-bold text-[10px] tracking-widest uppercase', is_p2p ? 'text-purple-400' : 'text-blue-400')}>{profileName}</span>
                                                    {is_p2p && <span className="text-[9px] border border-purple-400/40 px-1 text-purple-300">P2P</span>}
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                                    {profileInsts.map((param, pi) => {
                                                        const label = C2_PARAM_LABELS[param.c2profileparameter.name] || param.c2profileparameter.name;
                                                        const val = maskValue(param.c2profileparameter.name, param.value || '');
                                                        const isHost = param.c2profileparameter.name === 'callback_host' || param.c2profileparameter.name === 'host';
                                                        const isPort = param.c2profileparameter.name === 'callback_port' || param.c2profileparameter.name === 'port';
                                                        const isSens = SENSITIVE_PARAMS.has(param.c2profileparameter.name);
                                                        return (
                                                            <div key={pi} className="flex items-baseline gap-1.5">
                                                                <span className={cn('text-[10px] font-mono shrink-0 w-16 text-right', isHost || isPort ? 'text-signal/70' : 'text-gray-500')}>{label}</span>
                                                                <span className="text-gray-700 shrink-0">·</span>
                                                                <span className={cn('text-[10px] font-mono break-all',
                                                                    isHost ? 'text-signal font-bold' :
                                                                    isPort ? 'text-yellow-400 font-bold' :
                                                                    isSens ? 'text-gray-500 italic' : 'text-gray-300'
                                                                )}>
                                                                    {val || <span className="text-gray-700">—</span>}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </motion.div>
    );
};

// ============================================
// Stats bar — Callbacks-matched geometric style
// ============================================
const StatsBar = ({ ports }: { ports: CallbackPort[] }) => {
    const active = ports.filter(p => !p.deleted);
    const socks  = active.filter(p => p.port_type === 'socks');
    const rpfwd  = active.filter(p => p.port_type === 'rpfwd');
    const inter  = active.filter(p => p.port_type === 'interactive');
    const totalRx = active.reduce((a, p) => a + (p.bytes_received || 0), 0);
    const totalTx = active.reduce((a, p) => a + (p.bytes_sent || 0), 0);

    const Stat = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
        <div className="text-right border-l border-ghost/20 pl-5">
            <div className="text-gray-400 text-[11px] font-mono tracking-widest">{label}</div>
            <div className={cn('text-xl font-bold tabular-nums font-mono', color)}>{value}</div>
        </div>
    );

    return (
        <div className="flex gap-5 text-sm font-mono items-center">
            <Stat label="ACTIVE"      value={active.length} color="text-signal" />
            <Stat label="SOCKS5"      value={socks.length}  color="text-signal" />
            <Stat label="RPFWD"       value={rpfwd.length}  color="text-blue-400" />
            <Stat label="INTERACTIVE" value={inter.length}  color="text-purple-400" />
            <div className="text-right border-l border-ghost/20 pl-5">
                <div className="text-gray-400 text-[11px] font-mono tracking-widest">RX / TX</div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono tabular-nums text-green-400">{fmtBytes(totalRx)}</span>
                    <span className="text-ghost/40 text-sm">/</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-blue-400">{fmtBytes(totalTx)}</span>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// TunnelGraph — inline flow-map embedded in the right panel
// ============================================================

const TN_COLOR: Record<string, string> = {
    socks:       '#22c55e',
    rpfwd:       '#60a5fa',
    interactive: '#a78bfa',
    rpfwd_src:   '#60a5fa',
    rpfwd_out:   '#34d399',
};
const TN_LABEL: Record<string, string> = {
    socks:       'SOCKS5',
    rpfwd:       'RPFWD',
    interactive: 'INTERACTIVE',
    rpfwd_src:   'RPFWD SRC',
    rpfwd_out:   'LOCAL FWD',
};

// ── invisible centered handles — edges always connect to node center ──
const CENTER: React.CSSProperties = {
    left: '50%', top: '50%', bottom: 'auto', right: 'auto',
    transform: 'translate(-50%,-50%)',
    opacity: 0, pointerEvents: 'none',
};
const TnHandles = () => (
    <>
        {(['top','bottom','left','right'] as const).map(p => (
            <React.Fragment key={p}>
                <Handle type="source" position={p as any} id={`s-${p}`} style={CENTER} />
                <Handle type="target" position={p as any} id={`t-${p}`} style={CENTER} />
            </React.Fragment>
        ))}
    </>
);

// ── corner decoration from CyberNode ──────────────
const Corners = ({ c }: { c: string }) => (
    <>
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2" style={{ borderColor: c }} />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2" style={{ borderColor: c }} />
    </>
);

/** Zone background strip — minimal CP2077 info panel */
const TnZoneNode = ({ data }: any) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.08 + (data.zoneIndex ?? 0) * 0.04 }}
        style={{ position: 'relative', width: data.w, height: data.h, pointerEvents: 'none' }}
    >
        {/* background fill */}
        <div style={{ position: 'absolute', inset: 0, background: `${data.color}0b` }} />

        {/* top edge */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `${data.color}cc` }} />
        {/* bottom edge */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `${data.color}55` }} />

        {/* left accent bar */}
        <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
            background: data.color,
            boxShadow: `0 0 10px ${data.color}cc, 0 0 24px ${data.color}55`,
        }} />

        {/* top-right corner bracket */}
        <div style={{
            position: 'absolute', top: 0, right: 0, width: 18, height: 18,
            borderTop: `1px solid ${data.color}80`,
            borderRight: `1px solid ${data.color}80`,
        }} />
        {/* bottom-left corner bracket */}
        <div style={{
            position: 'absolute', bottom: 0, left: 3, width: 14, height: 14,
            borderBottom: `1px solid ${data.color}50`,
            borderLeft: `1px solid ${data.color}50`,
        }} />

        <TnHandles />

        {/* zone index dot + label — top-left */}
        <div style={{
            position: 'absolute', top: 10, left: 16,
            display: 'flex', alignItems: 'center', gap: 7,
        }}>
            <div style={{
                width: 4, height: 4, background: data.color,
                boxShadow: `0 0 6px ${data.color}`,
                flexShrink: 0,
            }} />
            <span style={{
                fontFamily: 'monospace', fontSize: 9, fontWeight: 800,
                color: `${data.color}dd`, letterSpacing: '0.3em',
                textTransform: 'uppercase',
                textShadow: `0 0 10px ${data.color}80`,
            }}>{data.label}</span>
        </div>

        {/* segment — bottom-right */}
        {data.segment && (
            <div style={{
                position: 'absolute', bottom: 9, right: 16,
                display: 'flex', alignItems: 'center', gap: 5,
            }}>
                <div style={{ width: 16, height: 1, background: `${data.color}60` }} />
                <span style={{
                    fontFamily: 'monospace', fontSize: 8, fontWeight: 600,
                    color: `${data.color}99`, letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                }}>{data.segment}</span>
            </div>
        )}
    </motion.div>
);

/** MYTHIC — CP2077 minimal cyberpunk C2 node */
const TnMythicNode = ({ data }: any) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative' }}
    >
        <TnHandles />
        {/* glow backdrop */}
        <div style={{
            position: 'absolute', inset: -12,
            background: 'radial-gradient(ellipse 80% 60%, #22c55e22 0%, transparent 70%)',
            pointerEvents: 'none',
        }} />
        {/* main body */}
        <div style={{
            width: 148, fontFamily: 'monospace',
            background: 'linear-gradient(135deg, #071a0d 0%, #040d07 100%)',
            border: '1px solid #22c55e70',
            boxShadow: '0 0 0 1px #22c55e18, 0 0 20px #22c55e28, inset 0 1px 0 #22c55e30',
            clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
            padding: '10px 12px 8px',
            position: 'relative',
        }}>
            {/* diagonal cut accent */}
            <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 0, height: 0,
                borderStyle: 'solid',
                borderWidth: '0 14px 14px 0',
                borderColor: 'transparent #22c55e70 transparent transparent',
            }} />
            {/* top row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{
                    width: 6, height: 20, background: '#22c55e',
                    boxShadow: '0 0 8px #22c55e, 0 0 16px #22c55e60',
                    flexShrink: 0,
                }} />
                <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#4ade80', letterSpacing: '0.18em' }}>MYTHIC</div>
                    <div style={{ fontSize: 8, color: '#22c55e70', letterSpacing: '0.3em', marginTop: 1 }}>C2 CORE</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e, 0 0 12px #22c55e80', animation: 'pulse 2s ease-in-out infinite' }} />
                    <div style={{ width: 2, height: 8, background: 'linear-gradient(180deg, #22c55e60, transparent)' }} />
                </div>
            </div>
            {/* divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, #22c55e60, #22c55e10)', marginBottom: 6 }} />
            {/* stats */}
            <div style={{ fontSize: 10, color: data.activePorts > 0 ? '#4ade80' : '#22c55e30', fontWeight: 700, letterSpacing: '0.08em' }}>
                {data.activePorts > 0 ? `${data.activePorts} TUNNEL${data.activePorts !== 1 ? 'S' : ''} ACTIVE` : 'STANDBY'}
            </div>
        </div>
    </motion.div>
);

/** Agent / callback */
const TnAgentNode = ({ data }: any) => {
    const dead = !data.active;
    const c    = dead ? '#ef4444' : '#22c55e';
    return (
        <motion.div className="relative"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1], delay: 0.18 + (data.idx ?? 0) * 0.04 }}
        >
            <TnHandles />
            {dead ? (
                /* — DEAD node: red card with skull — */
                <div style={{
                    width: 100, fontFamily: 'monospace',
                    background: '#c00000',
                    border: '1px solid #ff2222',
                    boxShadow: '0 0 12px #ff000060',
                    padding: '6px 8px 5px',
                    position: 'relative',
                }}>
                    <div style={{ position: 'absolute', top: -1, right: -1, width: 0, height: 0,
                        borderStyle: 'solid', borderWidth: '0 10px 10px 0',
                        borderColor: 'transparent #000 transparent transparent' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Skull size={20} color="#000" strokeWidth={2.5} />
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: '#000', letterSpacing: '0.1em' }}>C-{data.display_id}</div>
                            <div style={{ fontSize: 8, color: '#00000099', letterSpacing: '0.2em' }}>OFFLINE</div>
                        </div>
                    </div>
                    <div style={{ height: 1, background: '#00000030', margin: '4px 0 3px' }} />
                    <div style={{ fontSize: 8, color: '#000000bb', fontWeight: 700, letterSpacing: '0.08em', truncate: true } as any}
                        title={data.host}>
                        {(data.host || data.ip || '?').slice(0, 14)}
                    </div>
                </div>
            ) : (
                /* — ACTIVE node — */
                <div style={{
                    width: 116, fontFamily: 'monospace',
                    background: '#020c04',
                    border: `1px solid ${c}`,
                    boxShadow: `0 0 10px ${c}30`,
                    padding: '7px 10px 6px',
                    position: 'relative',
                }}>
                    <div style={{ position: 'absolute', top: -1, right: -1, width: 0, height: 0,
                        borderStyle: 'solid', borderWidth: '0 10px 10px 0',
                        borderColor: `transparent ${c} transparent transparent` }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <div style={{ width: 3, height: 14, background: c, flexShrink: 0, boxShadow: `0 0 5px ${c}` }} />
                        <span style={{ fontSize: 11, fontWeight: 900, color: c, letterSpacing: '0.15em' }}>
                            C-{data.display_id}
                        </span>
                        <div style={{ marginLeft: 'auto', width: 5, height: 5, background: c,
                            boxShadow: `0 0 6px ${c}`, animation: 'pulse 1.8s ease-in-out infinite' }} />
                    </div>
                    <div style={{ height: 1, background: `linear-gradient(90deg, ${c}60, transparent)`, marginBottom: 4 }} />
                    <div style={{ fontSize: 9, color: '#ffffffcc', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={data.host}>
                        {data.host || data.ip || '?'}
                    </div>
                    {data.user && (
                        <div style={{ fontSize: 8, color: '#ffffff50', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {data.user}
                        </div>
                    )}
                    {data.tunnels?.length > 0 && (
                        <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                            {data.tunnels.map((t: any, i: number) => {
                                const tc = TN_COLOR[t.type] || '#9ca3af';
                                return (
                                    <span key={i} style={{
                                        color: tc, border: `1px solid ${tc}50`,
                                        background: `${tc}15`, fontSize: 7,
                                        padding: '0 2px', fontWeight: 700, letterSpacing: '0.05em',
                                    }}>:{t.port}</span>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

/** Port endpoint — CLIENT / OPERATOR / RPFWD SRC / LOCAL FWD */
const TnPortNode = ({ data }: any) => {
    const c   = TN_COLOR[data.portType] || '#94a3b8';
    const lbl = TN_LABEL[data.portType] || (data.portType as string).toUpperCase();
    return (
        <motion.div className="relative"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.12 + (data.idx ?? 0) * 0.04, ease: [0.22, 1, 0.36, 1] }}
        >
            <TnHandles />
            <div style={{
                width: 100, fontFamily: 'monospace',
                background: '#05050a',
                border: `1px solid ${c}`,
                boxShadow: `0 0 8px ${c}25`,
                padding: '6px 9px 5px',
                position: 'relative',
            }}>
                <div style={{ position: 'absolute', top: -1, right: -1, width: 0, height: 0,
                    borderStyle: 'solid', borderWidth: '0 9px 9px 0',
                    borderColor: `transparent ${c} transparent transparent` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                    <div style={{ width: 3, height: 12, background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 8, fontWeight: 800, color: c, letterSpacing: '0.22em' }}>{lbl}</span>
                </div>
                <div style={{ height: 1, background: `linear-gradient(90deg, ${c}60, transparent)`, marginBottom: 3 }} />
                <span style={{ fontFamily: 'monospace', color: '#fff', fontSize: 12, fontWeight: 700 }}>:{data.localPort}</span>
                {data.sublabel && (
                    <div style={{ fontSize: 8, color: '#ffffff40', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={data.sublabel}>{data.sublabel}</div>
                )}
                {(data.bytesRx > 0 || data.bytesTx > 0) && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 3, fontSize: 8, fontFamily: 'monospace' }}>
                        <span style={{ color: '#4ade80' }}>↓{fmtBytes(data.bytesRx)}</span>
                        <span style={{ color: '#60a5fa' }}>↑{fmtBytes(data.bytesTx)}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

/** INTERNET / SHELL / generic target */
const TnTargetNode = ({ data }: any) => (
    <motion.div className="relative"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.65 + (data.idx ?? 0) * 0.07, ease: [0.22, 1, 0.36, 1] }}
    >
        <div className="relative bg-[#050505] border border-gray-700/40 px-2.5 py-2 w-[90px] font-mono">
            <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-gray-600/50" />
            <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-gray-600/50" />
            <TnHandles />
            <Globe size={10} className="text-gray-500 mx-auto mb-1 block" />
            <span className="text-gray-400 text-[10px] tracking-wider block text-center font-bold uppercase">{data.label}</span>
        </div>
    </motion.div>
);

/** SVG edge with animated particle stream */
const TnFlowEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) => {
    const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const color  = (data?.color  as string)  || '#22c55e';
    const active = (data?.active as boolean);
    const plabel = data?.portLabel as string;
    const traffic = ((data?.bytesRx as number) || 0) + ((data?.bytesTx as number) || 0);
    return (
        <>
            <path d={path} fill="none"
                stroke={active ? `${color}2e` : '#1f2937'}
                strokeWidth={active ? 2.5 : 1.5}
                strokeDasharray={active ? undefined : '4 5'}
            />
            {active && (
                <path d={path} fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeDasharray="8 20"
                    strokeLinecap="round"
                    style={{ animation: 'tunnelDash 1.2s linear infinite' }}
                />
            )}
            {plabel && (
                <foreignObject x={lx - 27} y={ly - 11} width={54} height={14}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        fontFamily: 'monospace', fontSize: 9, color,
                        background: '#050505ec', border: `1px solid ${color}40`,
                        padding: '1px 4px', textAlign: 'center',
                        whiteSpace: 'nowrap', letterSpacing: '0.05em',
                    }}>{plabel}</div>
                </foreignObject>
            )}
            {traffic > 0 && (
                <foreignObject x={lx - 29} y={ly + (plabel ? 6 : -8)} width={58} height={13}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        fontFamily: 'monospace', fontSize: 9, color: '#6b7280',
                        background: '#050505a0', padding: '0 3px',
                        textAlign: 'center', whiteSpace: 'nowrap',
                    }}>{fmtBytes(traffic)}</div>
                </foreignObject>
            )}
        </>
    );
};

const tnNodeTypes = { mythic: TnMythicNode, agent: TnAgentNode, port: TnPortNode, zone: TnZoneNode };
const tnEdgeTypes = { flow: TnFlowEdge };

// ── graph layout builder ────────────────────────────────────────────────
function buildTunnelGraph(ports: CallbackPort[]): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const MX  = 320;    // mythic center-x
    const MY  = 240;    // mythic y
    const AY  = 420;    // agent row y
    const PY  = 60;     // port-source row y
    const TY  = 570;    // target row y
    const HS  = 180;    // horizontal spacing
    const NHW = 74;     // half mythic node-width (148/2)

    // Dynamic zone width: sized to fit nodes + padding, centered on MX
    const cbCount = [...new Set(ports.map(p => p.callback.display_id))].length;
    const contentSpread = Math.max(cbCount - 1, 0) * HS;
    const ZW  = Math.max(contentSpread + 500, 600);  // enough padding on each side
    const ZX  = MX - ZW / 2;

    // Derive network segments from callback IPs
    // callback.ip may arrive as a JSON array string e.g. ["10.9.20.254"]
    const parseIp = (raw: string): string => {
        if (!raw) return '';
        // Strip JSON array brackets and quotes: ["x.x.x.x"] → x.x.x.x
        const stripped = raw.replace(/^\s*\[\s*"|"\s*\]\s*$/g, '').trim();
        // Also handle plain array without quotes: [x.x.x.x]
        return stripped.replace(/^\[|\]$/g, '').trim();
    };
    const cbIps = [...new Set(ports.map(p => parseIp(p.callback.ip)).filter(Boolean))];
    const toSubnet = (ip: string) => {
        const parts = ip.split('.');
        return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
    };
    const endpointSegs = [...new Set(cbIps.map(toSubnet))].join('  ');
    const targetIps = [...new Set(ports.filter(p => p.remote_ip).map(p => parseIp(p.remote_ip)))].join('  ');

    // Zone background strips (rendered behind, zIndex: -1)
    // Heights sized to fully contain nodes at each row (node heights: port~65, mythic~90, agent~80, target~60)
    const zones = [
        { id: 'z-port',   y: PY  - 32, h: 135, color: '#60a5fa', label: 'OPERATOR SIDE',  segment: 'LOCAL NETWORK' },
        { id: 'z-mythic', y: MY  - 32, h: 155, color: '#22c55e', label: 'C2 SERVER',       segment: 'C2 INFRASTRUCTURE' },
        { id: 'z-agent',  y: AY  - 32, h: 165, color: '#f59e0b', label: 'ENDPOINTS',       segment: endpointSegs || 'TARGET NETWORK' },
    ];
    zones.forEach((z, zi) => nodes.push({
        id: z.id, type: 'zone',
        position: { x: ZX, y: z.y },
        data: { w: ZW, h: z.h, color: z.color, label: z.label, segment: z.segment, zoneIndex: zi },
        selectable: false, draggable: false,
        style: { zIndex: -1 },
    }));

    const activePorts = ports.filter(p => !p.deleted);
    nodes.push({
        id: 'mythic', type: 'mythic',
        position: { x: MX - NHW, y: MY },
        data: { activePorts: activePorts.length },
    });

    const cbIds = [...new Set(ports.map(p => p.callback.display_id))];
    const agCX  = (i: number) => MX - ((cbIds.length - 1) / 2) * HS + i * HS;

    cbIds.forEach((cbId, i) => {
        const rep = ports.find(p => p.callback.display_id === cbId)!;
        const cb  = rep.callback;
        const cx  = agCX(i);
        nodes.push({
            id: `a-${cbId}`, type: 'agent',
            position: { x: cx - NHW, y: AY },
            data: {
                display_id: cb.display_id, host: cb.host, ip: cb.ip,
                user: cb.user, domain: cb.domain, active: cb.active,
                idx: i,
                tunnels: ports.filter(p => p.callback.display_id === cbId && !p.deleted)
                    .map(p => ({ type: p.port_type, port: p.local_port })),
            },
        });
        edges.push({
            id: `c2-${cbId}`, source: 'mythic', target: `a-${cbId}`, type: 'flow',
            data: { active: cb.active, color: cb.active ? '#22c55e' : '#374151' },
        });
    });

    let pSlot = 0;
    let oSlot = 0;
    let pNodeIdx = 0;

    ports.forEach(port => {
        const active = !port.deleted;
        const color  = TN_COLOR[port.port_type] || '#94a3b8';
        const cbIdx  = cbIds.indexOf(port.callback.display_id);
        const agX    = agCX(cbIdx);

        if (port.port_type === 'socks' || port.port_type === 'interactive') {
            const srcCount = ports.filter(p => p.port_type === 'socks' || p.port_type === 'interactive').length;
            const px = MX - ((srcCount - 1) / 2) * 140 + pSlot * 140;
            pSlot++;
            const srcId = `ps-${port.id}`;
            nodes.push({
                id: srcId, type: 'port',
                position: { x: px - 53, y: PY },
                data: {
                    portType: port.port_type, localPort: port.local_port,
                    username: port.username || undefined,
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                    idx: pNodeIdx++,
                },
            });
            edges.push({
                id: `e-src-${port.id}`, source: srcId, target: 'mythic', type: 'flow',
                data: { active, color, portLabel: `:${port.local_port}`, bytesRx: port.bytes_sent, bytesTx: port.bytes_received },
            });

        } else if (port.port_type === 'rpfwd') {
            const srcId = `rs-${port.id}`;
            nodes.push({
                id: srcId, type: 'port',
                position: { x: agX - NHW, y: PY + 15 },
                data: {
                    portType: 'rpfwd_src', localPort: port.remote_port,
                    sublabel: port.remote_ip || '*',
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                    idx: pNodeIdx++,
                },
            });
            edges.push({
                id: `e-rs-${port.id}`, source: srcId, target: `a-${port.callback.display_id}`, type: 'flow',
                data: {
                    active, color,
                    portLabel: `*:${port.remote_port}`,
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                },
            });
            const outId = `ro-${port.id}`;
            nodes.push({
                id: outId, type: 'port',
                position: { x: MX + NHW + 20 + oSlot * 130, y: MY + 10 },
                data: {
                    portType: 'rpfwd_out', localPort: port.local_port,
                    bytesRx: port.bytes_received, bytesTx: port.bytes_sent,
                    idx: pNodeIdx++,
                },
            });
            oSlot++;
            edges.push({
                id: `e-ro-${port.id}`, source: 'mythic', target: outId, type: 'flow',
                data: { active, color, portLabel: `:${port.local_port}`, bytesRx: port.bytes_sent, bytesTx: port.bytes_received },
            });
        }
    });
    return { nodes, edges };
}

/** Graph legend */
const TnLegend = () => (
    <div className="flex flex-col gap-1.5 bg-black/90 border border-white/15 px-3 py-2.5 font-mono text-[10px] backdrop-blur-sm">
        <span className="text-gray-300 tracking-widest font-bold mb-0.5">LEGEND</span>
        {(['socks','rpfwd','interactive'] as const).map(t => (
            <div key={t} className="flex items-center gap-2">
                <span className="w-5 h-0.5 rounded shrink-0" style={{ background: TN_COLOR[t] }} />
                <span style={{ color: TN_COLOR[t], fontWeight: 700 }}>{TN_LABEL[t]}</span>
            </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
            <span className="w-5 h-0.5 bg-signal shrink-0" />
            <span className="text-signal font-bold">C2 ACTIVE</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-5 border-t border-dashed border-gray-500 shrink-0" />
            <span className="text-gray-400 font-bold">C2 INACTIVE</span>
        </div>
    </div>
);

// ============================================
// Main Page
// ============================================
export default function Tunnels() {
    const { isSidebarCollapsed } = useAppStore();
    const [ports, setPorts] = useState<CallbackPort[]>([]);
    const [showStopped, setShowStopped] = useState(false);
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<'port' | 'type' | 'callback' | 'traffic'>('port');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Play loading sound on mount
    useEffect(() => {
        const audio = new Audio(loadingSound);
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }, []);

    // Rebuild graph whenever ports / showStopped changes
    // Debounce to let rapid subscription bursts settle before building the graph,
    // preventing partial/missing edges on initial load.
    useEffect(() => {
        const timer = setTimeout(() => {
            const visible = showStopped ? ports : ports.filter(p => !p.deleted);
            const { nodes: n, edges: e } = buildTunnelGraph(visible);
            setNodes(n);
            setEdges(e);
        }, 80);
        return () => clearTimeout(timer);
    }, [ports, showStopped]);

    // Optimistic local toggle — immediately flip deleted without waiting for next subscription event
    const handlePortToggled = (id: number, deleted: boolean) => {
        setPorts(prev => prev.map(p => p.id === id ? { ...p, deleted } : p));
    };

    // Real-time stream subscription
    useSubscription(CALLBACKPORT_STREAM, {
        fetchPolicy: 'no-cache',
        onData: ({ data }: any) => {
            const incoming: CallbackPort[] = data?.data?.callbackport_stream || [];
            if (!incoming.length) return;
            setPorts(prev => {
                const next = [...prev];
                incoming.forEach(cur => {
                    const idx = next.findIndex(p => p.id === cur.id);
                    if (idx > -1) {
                        next[idx] = cur;
                    } else {
                        next.unshift(cur);
                    }
                });
                return next;
            });
        },
        onError: () => snackActions.warning('Failed to subscribe to proxy ports'),
    });

    const filtered = useMemo(() => {
        let list = showStopped ? ports : ports.filter(p => !p.deleted);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                String(p.local_port).includes(q) ||
                p.remote_ip?.toLowerCase().includes(q) ||
                p.port_type.includes(q) ||
                p.callback.host?.toLowerCase().includes(q) ||
                p.callback.ip?.toLowerCase().includes(q) ||
                p.callback.user?.toLowerCase().includes(q) ||
                p.callback.description?.toLowerCase().includes(q) ||
                String(p.callback.display_id).includes(q)
            );
        }

        list = [...list].sort((a, b) => {
            let diff = 0;
            switch (sortField) {
                case 'port': diff = a.local_port - b.local_port; break;
                case 'type': diff = a.port_type.localeCompare(b.port_type); break;
                case 'callback': diff = a.callback.display_id - b.callback.display_id; break;
                case 'traffic': diff = (a.bytes_received + a.bytes_sent) - (b.bytes_received + b.bytes_sent); break;
            }
            return sortDir === 'asc' ? diff : -diff;
        });

        return list;
    }, [ports, showStopped, search, sortField, sortDir]);

    const toggleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const SortBtn = ({ field, label }: { field: typeof sortField; label: string }) => (
        <button
            onClick={() => toggleSort(field)}
            className={cn(
                'flex items-center gap-1 text-xs font-mono font-bold tracking-wider transition-colors',
                sortField === field ? 'text-signal' : 'text-gray-500 hover:text-gray-300'
            )}
        >
            {label}
            {sortField === field && (
                sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
            )}
        </button>
    );

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />
            <main
                className={cn(
                    'transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden',
                    isSidebarCollapsed ? 'ml-16' : 'ml-64'
                )}
            >
                {/* Header — Callbacks style */}
                <motion.header
                    className="flex justify-between items-center mb-8"
                    initial={{ opacity: 0, y: -18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Network size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">TUNNEL MANAGER</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                ACTIVE TUNNELS
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Stats */}
                        <StatsBar ports={ports} />

                        <div className="h-8 w-px bg-ghost/20" />

                        {/* Controls */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 focus-within:border-signal/50 transition-colors">
                                <Search size={12} className="text-gray-500 shrink-0" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Filter by port, host, IP..."
                                    className="bg-transparent outline-none text-white font-mono text-xs placeholder-gray-600 w-44"
                                />
                            </div>
                            <button
                                onClick={() => setShowStopped(s => !s)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 border font-mono text-xs transition-colors whitespace-nowrap',
                                    showStopped
                                        ? 'border-signal/40 text-signal bg-signal/10'
                                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                )}
                            >
                                {showStopped ? <Eye size={12} /> : <EyeOff size={12} />}
                                {showStopped ? 'HIDE STOPPED' : 'SHOW STOPPED'}
                            </button>
                        </div>
                    </div>
                </motion.header>

                {/* Body: left list + right graph */}
                <div className="flex-1 flex overflow-hidden">

                    {/* ── LEFT: Tunnel list ─────────────────────────────── */}
                    <motion.div
                        className="w-[480px] shrink-0 flex flex-col border-r border-white/8 overflow-hidden"
                        initial={{ opacity: 0, x: -28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="flex-1 overflow-y-auto p-4 cyber-scrollbar">
                            {/* Sort controls */}
                            <div className="flex items-center gap-3 mb-4 px-1 flex-wrap">
                                <span className="text-gray-500 text-xs font-mono tracking-widest">SORT:</span>
                                <SortBtn field="port" label="PORT" />
                                <SortBtn field="type" label="TYPE" />
                                <SortBtn field="callback" label="CB" />
                                <SortBtn field="traffic" label="TRAFFIC" />
                                <span className="ml-auto text-gray-400 text-xs font-mono shrink-0">
                                    {filtered.length} tunnel{filtered.length !== 1 ? 's' : ''}
                                    {!showStopped && ports.filter(p => p.deleted).length > 0 && (
                                        <span className="ml-1 text-gray-600">
                                            (+{ports.filter(p => p.deleted).length} stopped)
                                        </span>
                                    )}
                                </span>
                            </div>

                            {/* Tunnel list */}
                            <AnimatePresence initial={false}>
                                {filtered.length === 0 ? (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600 font-mono"
                                    >
                                        <Network size={32} className="opacity-20" />
                                        <span className="text-sm tracking-widest">
                                            {ports.length === 0
                                                ? 'NO ACTIVE TUNNELS'
                                                : search
                                                    ? 'NO RESULTS FOR FILTER'
                                                    : 'NO MATCHING TUNNELS'}
                                        </span>
                                        {ports.length > 0 && !showStopped && (
                                            <button
                                                onClick={() => setShowStopped(true)}
                                                className="text-[11px] text-signal hover:underline tracking-wider"
                                            >
                                                Show stopped tunnels
                                            </button>
                                        )}
                                    </motion.div>
                                ) : (
                                    <div className="space-y-2">
                                        {filtered.map(port => (
                                            <TunnelRow key={port.id} port={port} onPortToggled={handlePortToggled} />
                                        ))}
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* ── RIGHT: Flow-map graph ─────────────────────────── */}
                    <motion.div
                        className="flex-1 relative overflow-hidden"
                        style={{ background: '#030303' }}
                        initial={{ opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {/* keyframe for animated edges */}
                        <style>{`@keyframes tunnelDash { to { stroke-dashoffset: -28; } }`}</style>

                        {ports.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-700 font-mono">
                                <Network size={36} className="opacity-15" />
                                <span className="text-xs tracking-widest">FLOW MAP — WAITING FOR TUNNELS</span>
                            </div>
                        ) : (
                            <>
                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    nodeTypes={tnNodeTypes}
                                    edgeTypes={tnEdgeTypes}
                                    fitView
                                    fitViewOptions={{ padding: 0.18 }}
                                    minZoom={0.2}
                                    maxZoom={2.5}
                                    proOptions={{ hideAttribution: true }}
                                    style={{ background: '#030303' }}
                                >
                                    <Background
                                        variant={"dots" as any}
                                        gap={22}
                                        size={0.8}
                                        color="#111111"
                                    />

                                </ReactFlow>

                                {/* Legend overlay */}
                                <div className="absolute top-3 right-3 z-10 pointer-events-none">
                                    <TnLegend />
                                </div>
                                {/* Hint */}
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                                    <span className="font-mono text-[9px] text-gray-700 bg-black/60 border border-white/5 px-2.5 py-1 tracking-widest whitespace-nowrap">
                                        DRAG · SCROLL TO ZOOM · ANIMATED = LIVE TRAFFIC
                                    </span>
                                </div>
                            </>
                        )}
                    </motion.div>

                </div>
            </main>
        </div>
    );
}
