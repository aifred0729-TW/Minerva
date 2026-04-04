import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    Handle,
    Position,
    EdgeProps,
    getStraightPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSubscription } from "@apollo/client/react";

import { cn } from '../lib/utils';
import {
    Network, Server, Globe, Terminal, User,
    Wifi, WifiOff, Activity, RefreshCw, List, Lock,
} from 'lucide-react';
import { snackActions } from '../lib/snackbar';
import { useAppStore } from '../store';
import { CALLBACKPORT_STREAM } from '../lib/api';
import type { CallbackPort } from '../types/tunnels';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtBytes = (n: number): string => {
    if (!n || n <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(1024));
    return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
};

const TYPE_COLOR: Record<string, string> = {
    socks: '#22c55e',
    rpfwd: '#60a5fa',
    interactive: '#a78bfa',
    c2: '#4ade8044',
};

const TYPE_LABEL: Record<string, string> = {
    socks: 'SOCKS5',
    rpfwd: 'RPFWD',
    interactive: 'INTERACTIVE',
};

// ─── Node / Edge data types ───────────────────────────────────────────────────
interface TmMythicNodeData { activePorts: number; [key: string]: unknown; }
interface TmAgentNodeData {
    display_id: number; host: string; ip: string;
    user?: string; domain?: string; active: boolean;
    tunnels: Array<{ type: string; port: number }>;
    [key: string]: unknown;
}
interface TmClientNodeData {
    portType: string; localPort: number; sublabel?: string;
    username?: string; bytesRx: number; bytesTx: number;
    [key: string]: unknown;
}
interface TmTargetNodeData { label: string; sublabel?: string; [key: string]: unknown; }
interface TmTrafficEdgeData {
    color: string; active: boolean; portLabel?: string;
    bytesRx: number; bytesTx: number;
    [key: string]: unknown;
}

// ─── Custom Node: MYTHIC center ───────────────────────────────────────────────
const MythicNode = ({ data }: { data: TmMythicNodeData }) => (
    <div className="flex flex-col items-center px-5 py-3 border-2 border-signal bg-black font-mono min-w-[130px] shadow-[0_0_20px_rgba(74,222,128,0.15)]">
        <Handle type="target" position={Position.Top}    className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <Handle type="target" position={Position.Left}   className="!opacity-0" />
        <Handle type="source" position={Position.Right}  className="!opacity-0" />
        <div className="flex items-center gap-2 mb-1">
            <Server size={16} className="text-signal" />
            <span className="text-signal font-bold text-xs tracking-[0.15em]">MYTHIC</span>
        </div>
        <span className="text-gray-500 text-[10px] tracking-widest">C2 SERVER</span>
        {data.activePorts > 0 && (
            <span className="mt-2 text-[10px] font-bold text-signal border border-signal/40 px-2 py-0.5 bg-signal/10">
                {data.activePorts} ACTIVE
            </span>
        )}
    </div>
);

// ─── Custom Node: Agent/Callback ───────────────────────────────────────────────
const AgentNode = ({ data }: { data: TmAgentNodeData }) => (
    <div className={cn(
        'flex flex-col items-center px-3 py-2.5 border font-mono min-w-[120px] transition-all',
        data.active
            ? 'border-green-500/50 bg-green-900/10 shadow-[0_0_12px_rgba(74,222,128,0.08)]'
            : 'border-gray-700/50 bg-gray-900/30 opacity-60',
    )}>
        <Handle type="target" position={Position.Top}    className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <Handle type="target" position={Position.Left}   className="!opacity-0" />
        <Handle type="source" position={Position.Right}  className="!opacity-0" />
        <div className="flex items-center gap-1.5 mb-1">
            {data.active
                ? <Wifi size={11} className="text-green-400" />
                : <WifiOff size={11} className="text-gray-500" />
            }
            <span className={cn('text-xs font-bold tracking-wider', data.active ? 'text-green-300' : 'text-gray-500')}>
                C-{data.display_id}
            </span>
        </div>
        <span className="text-white text-[11px] font-semibold max-w-[110px] truncate" title={data.host}>
            {data.host || data.ip || '?'}
        </span>
        {data.user && (
            <span className="text-gray-500 text-[10px] flex items-center gap-1 mt-0.5">
                <User size={9} />{data.user}
                {data.domain ? `@${data.domain}` : ''}
            </span>
        )}
        <div className="flex gap-1 mt-1.5 flex-wrap justify-center">
            {data.tunnels?.map((t: any, i: number) => (
                <span
                    key={i}
                    className="text-[9px] px-1 py-0.5 border font-bold tracking-widest"
                    style={{ color: TYPE_COLOR[t.type], borderColor: TYPE_COLOR[t.type] + '50', background: TYPE_COLOR[t.type] + '10' }}
                >
                    {TYPE_LABEL[t.type]}:{t.port}
                </span>
            ))}
        </div>
    </div>
);

// ─── Custom Node: Client / Operator ─────────────────────────────────────────
const ClientNode = ({ data }: { data: TmClientNodeData }) => {
    const color = TYPE_COLOR[data.portType] || '#94a3b8';
    const label = data.portType === 'socks'
        ? 'CLIENT'
        : data.portType === 'interactive'
            ? 'OPERATOR'
            : data.portType === 'rpfwd_out'
                ? 'LOCAL FWD'
                : 'RPFWD SRC';
    return (
        <div
            className="flex flex-col items-center px-3 py-2 border font-mono min-w-[100px]"
            style={{ borderColor: color + '55', background: color + '08' }}
        >
            <Handle type="source" position={Position.Bottom} className="!opacity-0" />
            <Handle type="target" position={Position.Bottom} className="!opacity-0" />
            <Handle type="source" position={Position.Top}    className="!opacity-0" />
            <Handle type="target" position={Position.Top}    className="!opacity-0" />
            <Handle type="source" position={Position.Right}  className="!opacity-0" />
            <Handle type="target" position={Position.Left}   className="!opacity-0" />
            <Terminal size={13} style={{ color }} className="mb-0.5" />
            <span className="text-[11px] font-bold tracking-widest" style={{ color }}>{label}</span>
            <span className="text-gray-400 font-mono text-[10px] mt-0.5">:{data.localPort}</span>
            {data.sublabel && (
                <span className="text-gray-600 text-[9px] mt-0.5 max-w-[90px] truncate" title={data.sublabel}>
                    {data.sublabel}
                </span>
            )}
            {data.username && (
                <span className="text-yellow-500 text-[9px] flex items-center gap-0.5 mt-0.5">
                    <Lock size={8} />{data.username}
                </span>
            )}
            {(data.bytesRx > 0 || data.bytesTx > 0) && (
                <div className="flex gap-1.5 mt-1 text-[9px] font-mono">
                    <span style={{ color: '#4ade80' }}>↓{fmtBytes(data.bytesRx)}</span>
                    <span style={{ color: '#60a5fa' }}>↑{fmtBytes(data.bytesTx)}</span>
                </div>
            )}
        </div>
    );
};

// ─── Custom Node: Internet / Shell target ────────────────────────────────────
const TargetNode = ({ data }: { data: TmTargetNodeData }) => (
    <div className="flex flex-col items-center px-3 py-2 border border-gray-700/40 bg-black/40 font-mono min-w-[90px]">
        <Handle type="target" position={Position.Top}  className="!opacity-0" />
        <Handle type="source" position={Position.Top}  className="!opacity-0" />
        <Globe size={13} className="text-gray-500 mb-0.5" />
        <span className="text-gray-400 text-[11px] font-bold tracking-widest">{data.label}</span>
        {data.sublabel && (
            <span className="text-gray-600 text-[10px]">{data.sublabel}</span>
        )}
    </div>
);

// ─── Animated Traffic Edge ─────────────────────────────────────────────────────
const TrafficEdge = ({
    id, sourceX, sourceY, targetX, targetY, data,
}: EdgeProps) => {
    const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const color  = data?.color  as string || '#4ade80';
    const active = data?.active as boolean;
    const traffic = ((data?.bytesRx as number) || 0) + ((data?.bytesTx as number) || 0);
    const portLabel = data?.portLabel as string;
    const dash = 28; // total dash period

    return (
        <>
            {/* Base line */}
            <path
                d={path}
                fill="none"
                stroke={active ? color + '35' : '#374151'}
                strokeWidth={active ? 2.5 : 1.5}
                strokeDasharray={active ? undefined : '5 4'}
            />
            {/* Animated particle stream */}
            {active && (
                <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeDasharray={`10 ${dash - 10}`}
                    strokeLinecap="round"
                    style={{ animation: `tunnelDash 1.1s linear infinite` }}
                />
            )}
            {/* Port label */}
            {portLabel && (
                <foreignObject
                    x={labelX - 22}
                    y={labelY - 14}
                    width={44}
                    height={16}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        fontFamily: 'monospace', fontSize: 9,
                        color, background: '#050505cc',
                        border: `1px solid ${color}50`,
                        padding: '1px 4px', textAlign: 'center',
                        whiteSpace: 'nowrap',
                    }}>
                        {portLabel}
                    </div>
                </foreignObject>
            )}
            {/* Traffic stats */}
            {traffic > 0 && (
                <foreignObject
                    x={labelX - 28}
                    y={labelY + (portLabel ? 5 : -8)}
                    width={56}
                    height={14}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        fontFamily: 'monospace', fontSize: 9,
                        color: '#9ca3af', background: '#050505aa',
                        padding: '1px 3px', textAlign: 'center',
                        whiteSpace: 'nowrap',
                    }}>
                        {fmtBytes(traffic)}
                    </div>
                </foreignObject>
            )}
        </>
    );
};

// ─── Node / Edge type maps ─────────────────────────────────────────────────────
const nodeTypes = {
    mythicNode:  MythicNode,
    agentNode:   AgentNode,
    clientNode:  ClientNode,
    targetNode:  TargetNode,
};

const edgeTypes = {
    trafficEdge: TrafficEdge,
};

// ─── Layout builder ───────────────────────────────────────────────────────────
const MYTHIC_X = 540;
const MYTHIC_Y = 320;
const AGENT_Y  = 540;
const CLIENT_Y = 80;
const TARGET_Y = 760;
const H_SPACE  = 190;
const NODE_W   = 130; // approx node width for centering

function buildGraph(ports: CallbackPort[]) {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // ── MYTHIC node ──────────────────────────────────────────────────────────
    const activePorts = ports.filter(p => !p.deleted);
    nodes.push({
        id: 'mythic',
        type: 'mythicNode',
        position: { x: MYTHIC_X - NODE_W / 2, y: MYTHIC_Y },
        data: { activePorts: activePorts.length },
        draggable: true,
    });

    // ── Unique agents ─────────────────────────────────────────────────────────
    const cbIds = [...new Set(ports.map(p => p.callback.display_id))];
    const agentCount = cbIds.length;

    const agentCenterX = (i: number) =>
        MYTHIC_X - ((agentCount - 1) / 2) * H_SPACE + i * H_SPACE;

    cbIds.forEach((cbId, i) => {
        const repPort = ports.find(p => p.callback.display_id === cbId)!;
        const cb = repPort.callback;
        const portsForCb = ports.filter(p => p.callback.display_id === cbId && !p.deleted);
        const cx = agentCenterX(i);

        nodes.push({
            id: `agent-${cbId}`,
            type: 'agentNode',
            position: { x: cx - NODE_W / 2, y: AGENT_Y },
            data: {
                display_id: cb.display_id,
                host: cb.host,
                ip: cb.ip,
                user: cb.user,
                domain: cb.domain,
                active: cb.active,
                tunnels: portsForCb.map(p => ({ type: p.port_type, port: p.local_port })),
            },
            draggable: true,
        });

        // C2 backbone edge (Mythic ↔ Agent)
        edges.push({
            id: `c2-${cbId}`,
            source: 'mythic',
            target: `agent-${cbId}`,
            type: 'trafficEdge',
            data: {
                active: cb.active,
                color: cb.active ? '#4ade80' : '#374151',
                bytesRx: 0, bytesTx: 0,
            },
        });
    });

    // ── Per-tunnel nodes + edges ───────────────────────────────────────────────
    let clientSlot = 0;
    let targetSlot = 0;

    ports.forEach(port => {
        const active  = !port.deleted;
        const color   = TYPE_COLOR[port.port_type] || '#94a3b8';
        const cbIdx   = cbIds.indexOf(port.callback.display_id);
        const agentCX = agentCenterX(cbIdx);

        if (port.port_type === 'socks' || port.port_type === 'interactive') {
            // CLIENT/OPERATOR node above MYTHIC
            const clientId = `client-${port.id}`;
            const cx = MYTHIC_X - ((ports.filter(p => p.port_type === 'socks' || p.port_type === 'interactive').length - 1) / 2) * H_SPACE + clientSlot * H_SPACE;
            clientSlot++;

            nodes.push({
                id: clientId,
                type: 'clientNode',
                position: { x: cx - NODE_W / 2, y: CLIENT_Y },
                data: {
                    portType: port.port_type,
                    localPort: port.local_port,
                    sublabel: port.username ? undefined : undefined,
                    username: port.username || undefined,
                    bytesRx: port.bytes_received,
                    bytesTx: port.bytes_sent,
                },
                draggable: true,
            });

            // CLIENT → MYTHIC
            edges.push({
                id: `e-client-mythic-${port.id}`,
                source: clientId,
                target: 'mythic',
                type: 'trafficEdge',
                data: {
                    active,
                    color,
                    portLabel: `:${port.local_port}`,
                    bytesRx: port.bytes_sent,
                    bytesTx: port.bytes_received,
                },
            });

            if (port.port_type === 'socks') {
                // INTERNET target below the agent
                const tgtId = `inet-${port.id}`;
                const tx = agentCX - 40 + targetSlot * 10;
                targetSlot++;

                nodes.push({
                    id: tgtId,
                    type: 'targetNode',
                    position: { x: tx, y: TARGET_Y },
                    data: { label: 'INTERNET', sublabel: 'via SOCKS5' },
                    draggable: true,
                });

                // AGENT → INTERNET
                edges.push({
                    id: `e-agent-inet-${port.id}`,
                    source: `agent-${port.callback.display_id}`,
                    target: tgtId,
                    type: 'trafficEdge',
                    data: {
                        active,
                        color,
                        bytesRx: port.bytes_sent,
                        bytesTx: port.bytes_received,
                    },
                });
            } else {
                // INTERACTIVE: shell target below agent
                const shellId = `shell-${port.id}`;
                nodes.push({
                    id: shellId,
                    type: 'targetNode',
                    position: { x: agentCX - 45, y: TARGET_Y },
                    data: { label: 'SHELL', sublabel: 'interactive' },
                    draggable: true,
                });
                edges.push({
                    id: `e-agent-shell-${port.id}`,
                    source: `agent-${port.callback.display_id}`,
                    target: shellId,
                    type: 'trafficEdge',
                    data: { active, color, bytesRx: port.bytes_received, bytesTx: port.bytes_sent },
                });
            }

        } else if (port.port_type === 'rpfwd') {
            // RPFWD: [RPFWD_SRC] above agent → [AGENT] → [MYTHIC] → [RPFWD_OUT client]

            // Source node above the agent
            const srcId = `rpfwd-src-${port.id}`;
            nodes.push({
                id: srcId,
                type: 'clientNode',
                position: { x: agentCX - NODE_W / 2, y: CLIENT_Y + 20 },
                data: {
                    portType: 'rpfwd_src',
                    localPort: port.remote_port,
                    sublabel: port.remote_ip || '*',
                    bytesRx: port.bytes_received,
                    bytesTx: port.bytes_sent,
                },
                draggable: true,
            });

            // RPFWD_SRC → AGENT
            edges.push({
                id: `e-rpfwd-src-agent-${port.id}`,
                source: srcId,
                target: `agent-${port.callback.display_id}`,
                type: 'trafficEdge',
                data: {
                    active,
                    color,
                    portLabel: port.remote_ip ? `${port.remote_ip}:${port.remote_port}` : `*:${port.remote_port}`,
                    bytesRx: port.bytes_received,
                    bytesTx: port.bytes_sent,
                },
            });

            // Output node beside MYTHIC (local_port forwarded to client)
            const outId = `rpfwd-out-${port.id}`;
            nodes.push({
                id: outId,
                type: 'clientNode',
                position: { x: MYTHIC_X + NODE_W + 30 + clientSlot * 150, y: MYTHIC_Y + 20 },
                data: {
                    portType: 'rpfwd_out',
                    localPort: port.local_port,
                    bytesRx: port.bytes_received,
                    bytesTx: port.bytes_sent,
                },
                draggable: true,
            });
            clientSlot++;

            // MYTHIC → RPFWD_OUT
            edges.push({
                id: `e-mythic-rpfwd-out-${port.id}`,
                source: 'mythic',
                target: outId,
                type: 'trafficEdge',
                data: {
                    active,
                    color,
                    portLabel: `:${port.local_port}`,
                    bytesRx: port.bytes_sent,
                    bytesTx: port.bytes_received,
                },
            });
        }
    });

    return { nodes, edges };
}

// ─── Legend ───────────────────────────────────────────────────────────────────
const Legend = () => (
    <div className="flex flex-col gap-2 bg-black/80 border border-white/10 px-3 py-2.5 font-mono text-[10px]">
        <span className="text-gray-400 tracking-widest font-bold mb-0.5">LEGEND</span>
        {(['socks', 'rpfwd', 'interactive'] as const).map(t => (
            <div key={t} className="flex items-center gap-2">
                <span className="w-5 h-0.5 rounded" style={{ background: TYPE_COLOR[t] }} />
                <span style={{ color: TYPE_COLOR[t] }}>{TYPE_LABEL[t]}</span>
            </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
            <span className="w-5 h-0.5 bg-signal" />
            <span className="text-signal">C2 ACTIVE</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 border-t border-gray-600 border-dashed bg-transparent" />
            <span className="text-gray-500">C2 INACTIVE</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
            <Activity size={10} className="text-gray-400" />
            <span className="text-gray-400">Animated = Live traffic</span>
        </div>
    </div>
);

// ─── Main TunnelMap page ───────────────────────────────────────────────────────
export default function TunnelMap() {
    const { isSidebarCollapsed } = useAppStore();
    const navigate = useNavigate();
    const [ports, setPorts] = useState<CallbackPort[]>([]);
    const [showStopped, setShowStopped] = useState(false);
    const [nodes, setNodes, onNodesChange] = useNodesState([] as Node<Record<string, unknown>>[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge<Record<string, unknown>>[]);

    // Live subscription (same as Tunnels.tsx)
    useSubscription<any>(CALLBACKPORT_STREAM, {
        fetchPolicy: 'no-cache',
        onData: ({ data }: any) => {
            const incoming: CallbackPort[] = data?.data?.callbackport_stream || [];
            if (!incoming.length) return;
            setPorts(prev => {
                const next = [...prev];
                incoming.forEach(cur => {
                    const idx = next.findIndex(p => p.id === cur.id);
                    if (idx > -1) next[idx] = cur;
                    else next.unshift(cur);
                });
                return next;
            });
        },
        onError: () => snackActions.warning('Failed to subscribe to proxy ports'),
    });

    // Rebuild graph whenever ports change
    useEffect(() => {
        const visible = showStopped ? ports : ports.filter(p => !p.deleted);
        const { nodes: n, edges: e } = buildGraph(visible);
        setNodes(n);
        setEdges(e);
    }, [ports, showStopped]);

    const activePorts  = ports.filter(p => !p.deleted);
    const stoppedCount = ports.filter(p => p.deleted).length;

    return (
        <div className="flex h-screen overflow-hidden bg-void">
            {/* Keyframe for animated stroke */}
            <style>{`
                @keyframes tunnelDash {
                    to { stroke-dashoffset: -28; }
                }
                .react-flow__renderer { background: transparent !important; }
                .react-flow__background { background: #050505 !important; }
            `}</style>

            <main
                className={cn(
                    'flex-1 flex flex-col min-h-0 transition-all duration-300',
                    isSidebarCollapsed ? 'ml-16' : 'ml-64',
                )}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-ghost/20 shrink-0">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-1 h-6 bg-signal" />
                            <Network size={18} className="text-signal" />
                            <h1 className="font-mono font-bold tracking-[0.15em] text-xl text-white uppercase">
                                TUNNEL MAP
                            </h1>
                            <span className="text-[10px] font-mono text-gray-600 tracking-widest border border-gray-700 px-1.5 py-0.5">
                                LIVE FLOW
                            </span>
                            {activePorts.length > 0 && (
                                <span className="text-[11px] font-mono text-signal border border-signal/30 bg-signal/5 px-1.5 py-0.5">
                                    {activePorts.length} active
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {stoppedCount > 0 && (
                                <button
                                    onClick={() => setShowStopped(s => !s)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 border font-mono text-xs transition-colors',
                                        showStopped
                                            ? 'border-signal/40 text-signal bg-signal/10'
                                            : 'border-gray-700 text-gray-500 hover:border-gray-500',
                                    )}
                                >
                                    <RefreshCw size={11} />
                                    {showStopped ? 'HIDE STOPPED' : `+${stoppedCount} STOPPED`}
                                </button>
                            )}
                            <button
                                onClick={() => navigate('/tunnels')}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-700 text-gray-400 font-mono text-xs hover:border-gray-500 hover:text-white transition-colors"
                            >
                                <List size={11} />
                                LIST VIEW
                            </button>
                        </div>
                    </div>
                </div>

                {/* Graph */}
                <div className="flex-1 relative">
                    {ports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600 font-mono">
                            <Network size={40} className="opacity-20" />
                            <span className="text-sm tracking-widest">NO TUNNELS — WAITING FOR DATA</span>
                        </div>
                    ) : (
                        <>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            fitView
                            fitViewOptions={{ padding: 0.2 }}
                            minZoom={0.3}
                            maxZoom={2}
                            proOptions={{ hideAttribution: true }}
                            style={{ background: '#050505' }}
                        >
                            <Background
                                variant={"dots" as BackgroundVariant}
                                gap={24}
                                size={1}
                                color="#1a1a1a"
                            />
                            <Controls
                                className="!border-white/10 !bg-black/80"
                                style={{ fontFamily: 'monospace' }}
                            />
                            <MiniMap
                                nodeColor={(n) => {
                                    if (n.type === 'mythicNode') return '#22c55e';
                                    if (n.type === 'agentNode') return (n.data as Record<string, unknown>).active ? '#4ade80' : '#374151';
                                    const pt = (n.data as Record<string, unknown>).portType as string;
                                    return TYPE_COLOR[pt] || '#94a3b8';
                                }}
                                maskColor="#050505cc"
                                className="!bg-black/80 !border-white/10"
                            />
                        </ReactFlow>
                        {/* Legend overlay */}
                        <div className="absolute top-4 right-4 z-10 pointer-events-none">
                            <Legend />
                        </div>
                        {/* Bottom hint */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                            <div className="font-mono text-[10px] text-gray-600 bg-black/60 border border-white/8 px-3 py-1 tracking-widest whitespace-nowrap">
                                DRAG TO REARRANGE · SCROLL TO ZOOM · ANIMATED EDGES = LIVE TRAFFIC
                            </div>
                        </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
