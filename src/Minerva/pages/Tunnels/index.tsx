import React, { useState, useMemo, useEffect } from 'react';
import { useSubscription } from '@apollo/client';
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
}from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn, isCallbackAlive } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Network,
    Search,
    Eye,
    EyeOff,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import { useAppStore } from '../../store';
import { CALLBACKPORT_STREAM } from '../../lib/api';
import type { CallbackPort } from '../../types/tunnels';

import { loadingSound, fmtBytes } from './tunnels.utils';
import { TunnelRow } from './TunnelRow';
import { tnNodeTypes, tnEdgeTypes, buildTunnelGraph, TnLegend } from './TunnelGraph';

// ============================================
// Flow Diagram components (inline — small)
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

// ============================================
// Stats bar
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
    const [hiddenPorts, setHiddenPorts] = useState<Set<number>>(new Set());

    // Play loading sound on mount
    useEffect(() => {
        const audio = new Audio(loadingSound);
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }, []);

    // Client-side alive recalculation
    const recalcAlive = (list: CallbackPort[]): CallbackPort[] =>
        list.map(p => {
            const alive = isCallbackAlive(p.callback);
            if (alive === p.callback.active) return p;
            return { ...p, callback: { ...p.callback, active: alive } };
        });

    // Periodic alive-check: re-evaluate every 15 s
    useEffect(() => {
        const id = setInterval(() => {
            setPorts(prev => {
                const next = recalcAlive(prev);
                return next.some((p, i) => p !== prev[i]) ? next : prev;
            });
        }, 15_000);
        return () => clearInterval(id);
    }, []);

    // Rebuild graph whenever ports / showStopped / hiddenPorts changes
    useEffect(() => {
        const timer = setTimeout(() => {
            const visible = ports.filter(p =>
                !hiddenPorts.has(p.id) && (showStopped || !p.deleted)
            );
            const { nodes: n, edges: e } = buildTunnelGraph(visible);
            setNodes(n);
            setEdges(e);
        }, 80);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ports, showStopped, hiddenPorts]);

    // Optimistic local toggle
    const handlePortToggled = (id: number, deleted: boolean) => {
        setPorts(prev => prev.map(p => p.id === id ? { ...p, deleted } : p));
    };

    // Hide / Unhide handlers (client-side only)
    const handleHidePort = (id: number) => {
        setHiddenPorts(prev => new Set(prev).add(id));
    };
    const handleUnhideAll = () => {
        setHiddenPorts(new Set());
    };

    // Real-time stream subscription
    useSubscription(CALLBACKPORT_STREAM, {
        fetchPolicy: 'no-cache',
        onData: ({ data }: { data: Record<string, unknown> }) => {
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
                return recalcAlive(next);
            });
        },
        onError: () => snackActions.warning('Failed to subscribe to proxy ports'),
    });

    const filtered = useMemo(() => {
        let list = ports.filter(p => !hiddenPorts.has(p.id) && (showStopped || !p.deleted));
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
    }, [ports, showStopped, hiddenPorts, search, sortField, sortDir]);

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
            <main
                className={cn(
                    'transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden',
                    isSidebarCollapsed ? 'ml-16' : 'ml-64'
                )}
            >
                {/* Header */}
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
                        <StatsBar ports={ports} />

                        <div className="h-8 w-px bg-ghost/20" />

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
                            {hiddenPorts.size > 0 && (
                                <button
                                    onClick={handleUnhideAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-yellow-500/40 text-yellow-400 font-mono text-xs hover:bg-yellow-500/10 transition-colors whitespace-nowrap"
                                >
                                    <Eye size={12} />
                                    UNHIDE ({hiddenPorts.size})
                                </button>
                            )}
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
                                    {hiddenPorts.size > 0 && (
                                        <span className="ml-1 text-yellow-600">
                                            (+{hiddenPorts.size} hidden)
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
                                            <TunnelRow key={port.id} port={port} onPortToggled={handlePortToggled} onHide={handleHidePort} />
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
