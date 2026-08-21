import React, { useState, useEffect } from 'react';
import { useMutation } from "@apollo/client/react";
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
    Server,
    User,
    Clock,
    Package,
    Globe,
    ChevronRight,
    Layers,
    ExternalLink,
    Lock,
    Activity,
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
    C2_PARAM_LABELS,
    SENSITIVE_PARAMS,
    maskValue,
    getC2HostPort,
} from './tunnels.utils';
import { isMsfPortId } from './msfTunnelAdapter';
import { stopOperationSocks } from '../Metasploit/msfSocks';
import { getOperationForPort } from '../../lib/msfSocksAllocator';

const LIVE_TIME_TICK_MS = 1_000;
const LiveTime = ({ isoStr }: { isoStr: string }) => {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), LIVE_TIME_TICK_MS);
        return () => clearInterval(id);
    }, []);
    return <>{fmtRelativeTime(isoStr)}</>;
};

// ── per-type accent palette ──────────────────────────────────────────────
const ACCENT: Record<string, { stroke: string; soft: string; text: string; cls: string; }> = {
    socks:       { stroke: '#4ade80', soft: '#4ade8022', text: '#4ade80', cls: 'signal' },
    rpfwd:       { stroke: '#60a5fa', soft: '#60a5fa22', text: '#60a5fa', cls: 'blue-400' },
    interactive: { stroke: '#a78bfa', soft: '#a78bfa22', text: '#a78bfa', cls: 'purple-400' },
};

const parseIps = (raw: string): string[] => {
    if (!raw) return [];
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map((s: string) => s.trim()).filter(Boolean); } catch {}
    return raw.replace(/^\[|\]$/g, '').split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
};

interface TunnelRowProps {
    port: CallbackPort;
    selected: boolean;
    onSelect: (id: number) => void;
    onPortToggled: (id: number, deleted: boolean) => void;
    onHide: (id: number) => void;
}

export const TunnelRow = ({ port, selected, onSelect, onPortToggled, onHide }: TunnelRowProps) => {
    const [confirmStop, setConfirmStop] = useState(false);
    const [showPayloadConfig, setShowPayloadConfig] = useState(false);

    const accent = ACCENT[port.port_type] ?? ACCENT.socks;
    const c2hp   = getC2HostPort(port);
    const dead   = port.deleted;

    const [toggleProxy, { loading: toggling }] = useMutation<any>(TOGGLE_PROXY_MUTATION, {
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

    const [testProxy, { loading: testing }] = useMutation<any>(TEST_PROXY_MUTATION, {
        onCompleted: (data: any) => {
            if (data.testProxy.status === 'success') {
                snackActions.success('Connection test initiated');
            } else {
                snackActions.error(data.testProxy.error);
            }
        },
        onError: () => snackActions.error('Test failed'),
    });

    // Stop click on inner buttons from triggering the card-select handler
    const stop = (e: React.MouseEvent) => e.stopPropagation();

    const isMsfRow = isMsfPortId(port.id);
    const [msfStopping, setMsfStopping] = useState(false);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!port.deleted && !confirmStop) { setConfirmStop(true); return; }
        setConfirmStop(false);
        if (isMsfRow) {
            // MSF SOCKS row → maps to a Mythic operation, not a Mythic
            // callbackport. Stop the whole operation tunnel; the boot
            // bootstrap will re-open it the moment the next meterpreter
            // session comes online. Restart from this row isn't supported.
            if (port.deleted) {
                snackActions.warning('The boot bootstrap re-opens MSF SOCKS automatically when a session arrives.');
                return;
            }
            const opId = getOperationForPort(port.local_port);
            if (!opId) {
                snackActions.error('Cannot resolve operation for this MSF tunnel row.');
                return;
            }
            setMsfStopping(true);
            stopOperationSocks(opId)
                .then(() => snackActions.success(`MSF SOCKS for op #${opId} stopped`))
                .catch(err => snackActions.error(err?.message || 'Stop failed'))
                .finally(() => setMsfStopping(false));
            return;
        }
        toggleProxy({ variables: { callbackport_id: port.id, action: port.deleted ? 'start' : 'stop' } });
    };

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
    const total = rx + tx;
    const hasTraffic = total > 0;
    // Ratio bar: relative split of RX/TX (no "% of max" — just direction balance)
    const rxPct = hasTraffic ? Math.max(2, Math.min(98, Math.round((rx / total) * 100))) : 50;

    const ipv4s = parseIps(port.callback.ip).filter((ip: string) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip));
    const ipDisplay = ipv4s.length > 0 ? ipv4s.join(', ') : port.callback.ip;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            onClick={() => onSelect(port.id)}
            style={{
                background: '#05050a',
                borderColor: selected ? accent.stroke : '#ffffff10',
                boxShadow: selected ? `0 0 0 1px ${accent.stroke}, 0 0 24px ${accent.stroke}25, inset 0 0 22px ${accent.soft}` : 'none',
                clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
            }}
            className={cn(
                'relative font-mono cursor-pointer overflow-hidden border transition-shadow',
                dead && 'opacity-60',
            )}
        >
            {/* Type accent stripe (left edge) */}
            <div
                style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: dead ? '#52525b' : accent.stroke,
                    boxShadow: dead ? 'none' : `0 0 8px ${accent.stroke}cc`,
                }}
            />

            {/* Top-right notch (cyberpunk corner cut) */}
            <div
                style={{
                    position: 'absolute', top: 0, right: 0, width: 0, height: 0,
                    borderStyle: 'solid', borderWidth: '0 10px 10px 0',
                    borderColor: `transparent ${dead ? '#52525b' : accent.stroke} transparent transparent`,
                    opacity: 0.7,
                }}
            />

            {/* ── Header row: type + port + status ─────────────────── */}
            <div className="flex items-center gap-3 px-4 pt-3">
                {/* Type label */}
                <span
                    className="text-[10px] font-black tracking-[0.25em]"
                    style={{ color: dead ? '#71717a' : accent.text }}
                >
                    {PORT_TYPE_LABELS[port.port_type] || port.port_type.toUpperCase()}
                </span>

                {/* Port — large prominent */}
                <span
                    className="text-2xl font-bold tabular-nums tracking-tight"
                    style={{ color: dead ? '#a1a1aa' : '#ffffff', textShadow: dead ? 'none' : `0 0 12px ${accent.stroke}55` }}
                >
                    :{port.local_port}
                </span>

                {/* Auth lock chip */}
                {port.username && (
                    <span className="flex items-center gap-1 border border-yellow-500/30 px-1.5 py-px text-[9px] font-bold text-yellow-400 tracking-wider">
                        <Lock size={8} />
                        {port.username}
                    </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Status indicator */}
                <span
                    className={cn(
                        'flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em]',
                        dead ? 'text-zinc-500' : 'text-white'
                    )}
                >
                    <span
                        className={cn('w-1.5 h-1.5 rounded-full', !dead && 'animate-pulse')}
                        style={{
                            background: dead ? '#52525b' : accent.stroke,
                            boxShadow: dead ? 'none' : `0 0 8px ${accent.stroke}`,
                        }}
                    />
                    {dead ? 'STOPPED' : 'LIVE'}
                </span>
            </div>

            {/* ── RPFWD remote target line ─────────────────────────── */}
            {port.port_type === 'rpfwd' && (
                <div className="px-4 mt-1 flex items-center gap-1.5 text-[11px] text-blue-300">
                    <ArrowRight size={10} className="text-zinc-500 shrink-0" />
                    <span className="font-semibold">{port.remote_ip}</span>
                    <span className="text-zinc-600">:</span>
                    <span className="font-bold text-yellow-400">{port.remote_port}</span>
                </div>
            )}

            {/* ── Traffic block ────────────────────────────────────── */}
            <div className="px-4 mt-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="flex items-baseline gap-1 text-[11px] tabular-nums">
                        <span className="text-zinc-500 text-[9px] tracking-widest">RX</span>
                        <span className="text-emerald-400 font-bold">{fmtBytes(rx)}</span>
                    </span>
                    <span className="flex items-baseline gap-1 text-[11px] tabular-nums">
                        <span className="text-zinc-500 text-[9px] tracking-widest">TX</span>
                        <span className="text-sky-400 font-bold">{fmtBytes(tx)}</span>
                    </span>
                </div>
                {/* Ratio bar — RX (emerald) ⇄ TX (sky), single hairline */}
                <div className="relative h-[3px] bg-white/[0.04] overflow-hidden">
                    {hasTraffic ? (
                        <>
                            <div className="absolute left-0 top-0 bottom-0" style={{ width: `${rxPct}%`, background: 'linear-gradient(90deg, transparent, #10b981)' }} />
                            <div className="absolute right-0 top-0 bottom-0" style={{ width: `${100 - rxPct}%`, background: 'linear-gradient(270deg, transparent, #38bdf8)' }} />
                        </>
                    ) : (
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-dashed border-white/10" />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Callback summary ─────────────────────────────────── */}
            <div className="px-4 mt-3 mb-3 space-y-1 text-[11px]">
                {/* Line 1: callback id + host + ip */}
                <div className="flex items-center gap-1.5 text-zinc-200">
                    <a href={`/new/callbacks/${port.callback.display_id}`} target="_blank" rel="noreferrer"
                        onClick={stop}
                        className="flex items-center gap-1 font-bold hover:text-signal transition-colors group"
                    >
                        <Terminal size={10} className="text-zinc-500 group-hover:text-signal" />
                        C-{port.callback.display_id}
                        <ExternalLink size={8} className="text-zinc-700 group-hover:text-signal/70" />
                    </a>
                    <span className="text-zinc-700">·</span>
                    <Server size={10} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-100 font-semibold truncate" title={port.callback.host}>{port.callback.host}</span>
                    {ipDisplay && (
                        <span className="text-zinc-500 truncate text-[10px]" title={ipDisplay}>({ipDisplay})</span>
                    )}
                    {/* CB activity dot pushed right */}
                    <span className="ml-auto shrink-0 flex items-center gap-1 text-[9px] tracking-wider"
                        title={port.callback.active ? 'Callback alive' : 'Callback dead'}
                    >
                        {port.callback.active ? (
                            <Wifi size={9} className="text-signal/80" />
                        ) : (
                            <WifiOff size={9} className="text-zinc-600" />
                        )}
                    </span>
                </div>
                {/* Line 2: user, task */}
                <div className="flex items-center gap-1.5 text-zinc-400">
                    <User size={10} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-200 truncate" title={port.callback.user}>
                        {port.callback.user || '—'}
                        {port.callback.domain && <span className="text-zinc-500">@{port.callback.domain}</span>}
                    </span>
                    {port.task && (
                        <>
                            <span className="text-zinc-700">·</span>
                            <a href={`/new/task/${port.task.display_id}`} target="_blank" rel="noreferrer"
                                onClick={stop}
                                className="flex items-center gap-1 hover:text-signal transition-colors"
                            >
                                <Activity size={9} />
                                T-{port.task.display_id}
                            </a>
                        </>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-zinc-600 text-[10px]"
                        title={fmtAbsoluteTime(port.updated_at)}
                    >
                        <Clock size={9} />
                        <LiveTime isoStr={port.updated_at} />
                    </span>
                </div>
                {/* Line 3: C2 host */}
                {(c2hp.host || c2hp.port) && (
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <Globe size={10} className="text-signal/60 shrink-0" />
                        {c2hp.host && <span className="text-signal/90 font-semibold truncate">{c2hp.host}</span>}
                        {c2hp.host && c2hp.port && <span className="text-zinc-700">:</span>}
                        {c2hp.port && <span className="text-yellow-400 font-bold">{c2hp.port}</span>}
                        {c2hp.profileName && (
                            <span className="text-zinc-500 ml-1 border-l border-zinc-800 pl-1.5">{c2hp.profileName}</span>
                        )}
                    </div>
                )}
                {/* Line 4: description */}
                {port.callback.description && (
                    <div className="text-[10px] text-zinc-500 italic truncate" title={port.callback.description}>
                        {port.callback.description}
                    </div>
                )}
            </div>

            {/* ── Selected: action footer ──────────────────────────── */}
            <AnimatePresence initial={false}>
                {selected && (
                    <motion.div
                        key="footer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.16 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-white/[0.06] px-4 py-2.5 flex items-center gap-2 bg-black/30">
                            {confirmStop ? (
                                <>
                                    <span className="text-red-400 text-[10px] font-bold tracking-wider">CONFIRM STOP?</span>
                                    <div className="flex-1" />
                                    <button onClick={handleToggle} disabled={toggling || msfStopping}
                                        className="px-3 py-1 bg-red-500/80 text-black font-bold text-[10px] hover:bg-red-400 transition-colors">
                                        YES
                                    </button>
                                    <button onClick={(e) => { stop(e); setConfirmStop(false); }}
                                        className="px-3 py-1 border border-zinc-700 text-zinc-300 font-bold text-[10px] hover:border-zinc-500 transition-colors">
                                        NO
                                    </button>
                                </>
                            ) : (
                                <>
                                    {port.remote_port !== 0 && !port.deleted && (
                                        <button
                                            onClick={(e) => { stop(e); testProxy({ variables: { callbackport_id: port.id } }); }}
                                            disabled={testing}
                                            title="Test remote connection"
                                            className="flex items-center gap-1 px-2.5 py-1 border border-blue-400/30 text-blue-300 text-[10px] font-bold tracking-wider hover:bg-blue-400/10 transition-colors disabled:opacity-40"
                                        >
                                            <Zap size={10} />TEST
                                        </button>
                                    )}
                                    <button
                                        onClick={handleToggle}
                                        disabled={toggling || msfStopping}
                                        title={port.deleted ? 'Start proxy' : 'Stop proxy'}
                                        className={cn(
                                            'flex items-center gap-1 px-2.5 py-1 border font-bold text-[10px] tracking-wider transition-colors disabled:opacity-40',
                                            port.deleted
                                                ? 'border-signal/40 text-signal hover:bg-signal/10'
                                                : 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                                        )}
                                    >
                                        {(toggling || msfStopping) ? <RefreshCw size={9} className="animate-spin" /> : port.deleted
                                            ? <><Play size={9} />START</>
                                            : <><Square size={9} />STOP</>
                                        }
                                    </button>
                                    <div className="flex-1" />
                                    <button
                                        onClick={(e) => { stop(e); onHide(port.id); }}
                                        title="Hide from view"
                                        className="flex items-center gap-1 px-2.5 py-1 border border-zinc-700 text-zinc-400 text-[10px] font-bold tracking-wider hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                                    >
                                        <EyeOff size={9} />HIDE
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Payload config (collapsible) */}
                        {payload && (
                            <>
                                <button
                                    onClick={(e) => { stop(e); setShowPayloadConfig(v => !v); }}
                                    className="w-full flex items-center gap-2 px-4 py-1.5 text-[10px] font-mono text-zinc-500 hover:text-signal hover:bg-white/[0.02] transition-colors border-t border-white/[0.04]"
                                >
                                    {showPayloadConfig ? <ChevronDown size={10} className="text-signal" /> : <ChevronRight size={10} />}
                                    <Package size={9} />
                                    <span className="font-bold uppercase tracking-widest text-zinc-400">{payload.payloadtype.name}</span>
                                    <span className="text-zinc-600">payload config</span>
                                </button>

                                <AnimatePresence>
                                    {showPayloadConfig && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.16 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="border-t border-white/[0.04] bg-black/20">
                                                <div className="flex items-center gap-2 px-4 py-1.5 border-b border-signal/10 bg-signal/[0.04]">
                                                    <Package size={10} className="text-signal" />
                                                    <span className="font-mono text-[10px] text-signal font-bold tracking-widest uppercase">{payload.payloadtype.name}</span>
                                                    <span className="text-zinc-600 text-[10px] font-mono truncate">{payload.uuid}</span>
                                                </div>
                                                {allC2Profiles.length === 0 ? (
                                                    <div className="px-4 py-2 text-[10px] text-zinc-600 font-mono">No C2 profile data</div>
                                                ) : (
                                                    Object.entries(instancesByProfile).map(([profileName, { is_p2p, instances: profileInsts }]) => (
                                                        <div key={profileName} className="px-4 py-2 border-t border-white/[0.04] first:border-0">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <Layers size={9} className={is_p2p ? 'text-purple-400' : 'text-blue-400'} />
                                                                <span className={cn('font-mono font-bold text-[10px] tracking-widest uppercase', is_p2p ? 'text-purple-400' : 'text-blue-400')}>{profileName}</span>
                                                                {is_p2p && <span className="text-[9px] border border-purple-400/40 px-1 text-purple-300">P2P</span>}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                                {profileInsts.map((param, pi) => {
                                                                    const label = C2_PARAM_LABELS[param.c2profileparameter.name] || param.c2profileparameter.name;
                                                                    const val = maskValue(param.c2profileparameter.name, param.value || '');
                                                                    const isHost = param.c2profileparameter.name === 'callback_host' || param.c2profileparameter.name === 'host';
                                                                    const isPort = param.c2profileparameter.name === 'callback_port' || param.c2profileparameter.name === 'port';
                                                                    const isSens = SENSITIVE_PARAMS.has(param.c2profileparameter.name);
                                                                    return (
                                                                        <div key={pi} className="flex items-baseline gap-1.5">
                                                                            <span className={cn('text-[10px] font-mono shrink-0 w-16 text-right', isHost || isPort ? 'text-signal/70' : 'text-zinc-500')}>{label}</span>
                                                                            <span className="text-zinc-700 shrink-0">·</span>
                                                                            <span className={cn('text-[10px] font-mono break-all',
                                                                                isHost ? 'text-signal font-bold' :
                                                                                isPort ? 'text-yellow-400 font-bold' :
                                                                                isSens ? 'text-zinc-500 italic' : 'text-zinc-300'
                                                                            )}>
                                                                                {val || <span className="text-zinc-700">—</span>}
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
                )}
            </AnimatePresence>
        </motion.div>
    );
};
