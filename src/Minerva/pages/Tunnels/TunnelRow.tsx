import React, { useState, useEffect } from 'react';
import { useMutation } from '@apollo/client';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCw,
    EyeOff,
    Play,
    Square,
    Zap,
    ArrowRight,
    Terminal,
    ChevronDown,
    Wifi,
    WifiOff,
    Activity,
    Server,
    User,
    Clock,
    Package,
    Globe,
    ChevronRight,
    Layers,
    ExternalLink,
    Lock,
} from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import {
    TOGGLE_PROXY_MUTATION,
    TEST_PROXY_MUTATION,
} from '../../lib/api';
import type { CallbackPort, C2ParamInstance } from '../../types/tunnels';
import {
    fmtBytes,
    fmtAbsoluteTime,
    fmtRelativeTime,
    PORT_TYPE_LABELS,
    PORT_TYPE_COLORS,
    C2_PARAM_LABELS,
    SENSITIVE_PARAMS,
    maskValue,
    getC2HostPort,
} from './tunnels.utils';

// Auto-ticking relative time — re-renders every second
const LiveTime = ({ isoStr }: { isoStr: string }) => {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);
    return <>{fmtRelativeTime(isoStr)}</>;
};

export const TunnelRow = ({ port, onPortToggled, onHide }: { port: CallbackPort; onPortToggled: (id: number, deleted: boolean) => void; onHide: (id: number) => void }) => {
    const [confirmStop, setConfirmStop] = useState(false);
    const [showPayloadConfig, setShowPayloadConfig] = useState(false);

    const c2hp = getC2HostPort(port);

    const [toggleProxy, { loading: toggling }] = useMutation(TOGGLE_PROXY_MUTATION, {
        onCompleted: (data: Record<string, unknown>) => {
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
        onCompleted: (data: Record<string, unknown>) => {
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
                            <button
                                onClick={() => onHide(port.id)}
                                title="Hide from view"
                                className="flex items-center gap-1 px-2 py-1 border border-gray-600/40 text-gray-500 text-[10px] font-bold hover:border-gray-400 hover:text-gray-300 transition-colors"
                            >
                                <EyeOff size={9} />HIDE
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
                    {port.callback.ip && (() => {
                        const parseIps = (raw: string): string[] => {
                            if (!raw) return [];
                            try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map((s: string) => s.trim()).filter(Boolean); } catch {}
                            return raw.replace(/^\[|\]$/g, '').split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
                        };
                        const ipv4s = parseIps(port.callback.ip).filter((ip: string) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip));
                        const display = ipv4s.length > 0 ? ipv4s.join(', ') : port.callback.ip;
                        return <span className="text-gray-400 text-[11px] font-normal">({display})</span>;
                    })()}
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
