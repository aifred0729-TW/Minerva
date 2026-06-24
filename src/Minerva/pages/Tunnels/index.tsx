import React, { useState, useMemo, useEffect } from 'react';
import { useSubscription } from "@apollo/client/react";
import {
    ReactFlow,
    Background,
    BackgroundVariant,
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
import { useAllMsfTunnels } from '../Metasploit/msfTunnelStore';
import { useMsfSyntheticCallbacks } from '../Callbacks/msfSyntheticCallbacks';
import { msfTunnelToCallbackPort } from './msfTunnelAdapter';

// ============================================
// Stats strip — minimal "data ribbon"
// ============================================
const StatsBar = ({ ports }: { ports: CallbackPort[] }) => {
    const active = ports.filter(p => !p.deleted);
    const socks  = active.filter(p => p.port_type === 'socks');
    const rpfwd  = active.filter(p => p.port_type === 'rpfwd');
    const inter  = active.filter(p => p.port_type === 'interactive');
    const totalRx = active.reduce((a, p) => a + (p.bytes_received || 0), 0);
    const totalTx = active.reduce((a, p) => a + (p.bytes_sent || 0), 0);

    const Cell = ({
        label, value, color = 'text-white',
    }: { label: string; value: React.ReactNode; color?: string }) => (
        <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] tracking-[0.25em] text-zinc-500 mb-1">{label}</span>
            <span className={cn('text-base font-bold tabular-nums font-mono', color)}>{value}</span>
        </div>
    );

    return (
        <div className="flex items-stretch gap-5 font-mono">
            <Cell label="ACTIVE" value={active.length} color="text-signal" />
            <div className="w-px bg-white/10" />
            <Cell label="SOCKS5" value={socks.length} color="text-emerald-400" />
            <Cell label="RPFWD"  value={rpfwd.length} color="text-sky-400" />
            <Cell label="INTER"  value={inter.length} color="text-purple-400" />
            <div className="w-px bg-white/10" />
            <Cell
                label="RX / TX"
                value={
                    <span className="flex items-baseline gap-1">
                        <span className="text-emerald-400">{fmtBytes(totalRx)}</span>
                        <span className="text-zinc-600 text-xs">/</span>
                        <span className="text-sky-400">{fmtBytes(totalTx)}</span>
                    </span>
                }
            />
        </div>
    );
};

// ============================================
// Main Page
// ============================================
export default function Tunnels() {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const [ports, setPorts] = useState<CallbackPort[]>([]);
    const msfTunnels = useAllMsfTunnels();
    const msfCallbacks = useMsfSyntheticCallbacks();
    // Merge Mythic tunnels (from Hasura subscription) with MSF SOCKS
    // tunnels (driven by msfTunnelStore). One row per Mythic operation:
    // pick the most-recently attached session as the visual
    // representative for the embedded callback block; the row's
    // description still surfaces the full session count + route count.
    const allPorts = useMemo<CallbackPort[]>(() => {
        const synthetic: CallbackPort[] = [];
        for (const t of msfTunnels) {
            const attachedSids = Object.entries(t.sessions)
                .sort(([, a], [, b]) => b.attachedAt.localeCompare(a.attachedAt))
                .map(([sid]) => sid);
            const repSid = attachedSids[0];
            const rep = repSid ? msfCallbacks.find((c: any) => c._msfSessionId === repSid) : undefined;
            synthetic.push(msfTunnelToCallbackPort(t, rep));
        }
        return synthetic.length > 0 ? [...ports, ...synthetic] : ports;
    }, [ports, msfTunnels, msfCallbacks]);
    const [showStopped, setShowStopped] = useState(false);
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<'port' | 'type' | 'callback' | 'traffic'>('port');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [hiddenPorts, setHiddenPorts] = useState<Set<number>>(new Set());
    const [selectedPortId, setSelectedPortId] = useState<number | null>(null);

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

    // Periodic alive-check
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
            const visible = allPorts.filter(p =>
                !hiddenPorts.has(p.id) && (showStopped || !p.deleted)
            );
            const { nodes: n, edges: e } = buildTunnelGraph(visible);
            setNodes(n);
            setEdges(e);
        }, 80);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPorts, showStopped, hiddenPorts]);

    // Optimistic local toggle
    const handlePortToggled = (id: number, deleted: boolean) => {
        setPorts(prev => prev.map(p => p.id === id ? { ...p, deleted } : p));
    };

    // Hide / Unhide handlers
    const handleHidePort = (id: number) => {
        setHiddenPorts(prev => new Set(prev).add(id));
        if (selectedPortId === id) setSelectedPortId(null);
    };
    const handleUnhideAll = () => setHiddenPorts(new Set());

    // Toggle selection (click again to deselect)
    const handleSelect = (id: number) => {
        setSelectedPortId(prev => prev === id ? null : id);
    };

    // Real-time stream subscription
    useSubscription<any>(CALLBACKPORT_STREAM, {
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
                return recalcAlive(next);
            });
        },
        onError: () => snackActions.warning('Failed to subscribe to proxy ports'),
    });

    const filtered = useMemo(() => {
        let list = allPorts.filter(p => !hiddenPorts.has(p.id) && (showStopped || !p.deleted));
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
    }, [allPorts, showStopped, hiddenPorts, search, sortField, sortDir]);

    const toggleSort = (field: typeof sortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const SortBtn = ({ field, label }: { field: typeof sortField; label: string }) => (
        <button
            onClick={() => toggleSort(field)}
            className={cn(
                'flex items-center gap-1 text-[10px] font-mono font-bold tracking-[0.2em] transition-colors',
                sortField === field ? 'text-signal' : 'text-zinc-600 hover:text-zinc-300'
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
                    'transition-all duration-300 p-6 lg:p-10 h-screen flex flex-col overflow-hidden',
                    isSidebarCollapsed ? 'ml-16' : 'ml-64'
                )}
            >
                {/* ── Header ──────────────────────────────────────── */}
                <motion.header
                    className="flex justify-between items-center mb-6"
                    initial={{ opacity: 0, y: -18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="p-3 border border-white/40 bg-white/5 relative"
                            style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                        >
                            <Network size={22} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-[0.25em] text-white uppercase">TUNNEL MANAGER</h1>
                            <p className="text-[10px] text-zinc-400 font-mono flex items-center gap-2 uppercase tracking-[0.3em] mt-0.5">
                                <span className="w-1.5 h-1.5 bg-signal rounded-full animate-pulse" />
                                LIVE TRAFFIC TOPOLOGY
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-5">
                        <StatsBar ports={allPorts} />

                        <div className="h-9 w-px bg-white/10" />

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-2.5 py-1.5 focus-within:border-signal/50 transition-colors">
                                <Search size={11} className="text-zinc-500 shrink-0" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="filter port / host / ip"
                                    className="bg-transparent outline-none text-white font-mono text-xs placeholder-zinc-700 w-44"
                                />
                            </div>
                            <button
                                onClick={() => setShowStopped(s => !s)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 border font-mono text-[10px] tracking-widest transition-colors whitespace-nowrap',
                                    showStopped
                                        ? 'border-signal/40 text-signal bg-signal/10'
                                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                                )}
                            >
                                {showStopped ? <Eye size={11} /> : <EyeOff size={11} />}
                                {showStopped ? 'HIDE STOPPED' : 'SHOW STOPPED'}
                            </button>
                            {hiddenPorts.size > 0 && (
                                <button
                                    onClick={handleUnhideAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-yellow-500/40 text-yellow-400 font-mono text-[10px] tracking-widest hover:bg-yellow-500/10 transition-colors whitespace-nowrap"
                                >
                                    <Eye size={11} />
                                    UNHIDE ({hiddenPorts.size})
                                </button>
                            )}
                        </div>
                    </div>
                </motion.header>

                {/* ── Body: traffic map + info cards ─────────────── */}
                <div className="flex-1 flex overflow-hidden gap-4">

                    {/* ── LEFT: Traffic flow map (2D) ──────────────── */}
                    <motion.div
                        className="flex-1 relative overflow-hidden border border-white/8"
                        style={{
                            background: '#030307',
                            clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
                        }}
                        initial={{ opacity: 0, x: -28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <style>{`@keyframes tunnelDash { to { stroke-dashoffset: -28; } }`}</style>

                        <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2">
                            <span className="w-1 h-3.5 bg-signal" style={{ boxShadow: '0 0 6px #22c55e' }} />
                            <span className="font-mono text-[10px] font-bold tracking-[0.3em] text-white">FLOW MAP</span>
                        </div>

                        {ports.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700 font-mono">
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
                                    style={{ background: '#030307' }}
                                >
                                    <Background
                                        variant={"dots" as BackgroundVariant}
                                        gap={22}
                                        size={0.8}
                                        color="#111111"
                                    />
                                </ReactFlow>

                                <div className="absolute top-3 right-3 z-10 pointer-events-none">
                                    <TnLegend />
                                </div>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                                    <span className="font-mono text-[9px] text-zinc-700 bg-black/60 border border-white/5 px-2.5 py-1 tracking-widest whitespace-nowrap">
                                        DRAG · SCROLL · 3D VIEW IS NOW IN TOPOLOGY3D
                                    </span>
                                </div>
                            </>
                        )}
                    </motion.div>

                    {/* ── RIGHT: Info-card column ────────────────────── */}
                    <motion.div
                        className="w-[460px] shrink-0 flex flex-col overflow-hidden border border-white/8"
                        style={{
                            background: 'linear-gradient(180deg, #060609 0%, #030305 100%)',
                            clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
                        }}
                        initial={{ opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {/* Card column header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-black/30">
                            <div className="flex items-center gap-2">
                                <span className="w-1 h-3.5 bg-signal" style={{ boxShadow: '0 0 6px #22c55e' }} />
                                <span className="font-mono text-[10px] font-bold tracking-[0.3em] text-white">TUNNELS</span>
                                <span className="font-mono text-[10px] text-zinc-500">
                                    {filtered.length}
                                    {!showStopped && ports.filter(p => p.deleted).length > 0 && (
                                        <span className="text-zinc-700 ml-1">(+{ports.filter(p => p.deleted).length} stopped)</span>
                                    )}
                                    {hiddenPorts.size > 0 && (
                                        <span className="text-yellow-600 ml-1">(+{hiddenPorts.size} hidden)</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-zinc-700 text-[9px] font-mono tracking-[0.25em]">SORT</span>
                                <SortBtn field="port" label="PORT" />
                                <SortBtn field="type" label="TYPE" />
                                <SortBtn field="callback" label="CB" />
                                <SortBtn field="traffic" label="↓↑" />
                            </div>
                        </div>

                        {/* Card list */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 cyber-scrollbar">
                            <AnimatePresence initial={false}>
                                {filtered.length === 0 ? (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-700 font-mono"
                                    >
                                        <Network size={28} className="opacity-20" />
                                        <span className="text-xs tracking-widest">
                                            {ports.length === 0
                                                ? 'NO ACTIVE TUNNELS'
                                                : search
                                                    ? 'NO RESULTS FOR FILTER'
                                                    : 'NO MATCHING TUNNELS'}
                                        </span>
                                        {ports.length > 0 && !showStopped && (
                                            <button
                                                onClick={() => setShowStopped(true)}
                                                className="text-[10px] text-signal hover:underline tracking-wider"
                                            >
                                                Show stopped tunnels
                                            </button>
                                        )}
                                    </motion.div>
                                ) : (
                                    filtered.map(port => (
                                        <TunnelRow
                                            key={port.id}
                                            port={port}
                                            selected={selectedPortId === port.id}
                                            onSelect={handleSelect}
                                            onPortToggled={handlePortToggled}
                                            onHide={handleHidePort}
                                        />
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                </div>
            </main>
        </div>
    );
}
