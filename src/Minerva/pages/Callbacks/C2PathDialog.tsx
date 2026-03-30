import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useLazyQuery, useMutation } from '@apollo/client';
// @ts-ignore
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    BaseEdge,
    EdgeProps,
    getStraightPath,
    EdgeLabelRenderer,
    useReactFlow,
}from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image'
import {
    Terminal,
    Monitor,
    Camera,
    X,
    ChevronDown,
    RefreshCw,
    ArrowUpDown,
    ArrowLeftRight,
    FileImage,
    EyeOff,
    CheckSquare,
    GitBranch,
    Square,
    ChevronRight,
    Trash2,
    Plus,
    Link2,
}from 'lucide-react';
import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    ADD_EDGE_MUTATION,
    REMOVE_EDGE_MUTATION,
    GET_LINK_COMMANDS_FOR_CALLBACK,
    CREATE_TASK_MUTATION,
    GET_CALLBACK_C2_PATHS,
    GET_P2P_PROFILES_AND_CALLBACKS,
}from '../../lib/api';
import { CyberModal } from '../../components/CyberModal';
import { elk as _c2Elk } from '../../components/CallbackGraph/layout';
import { ReactFlowProvider } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const C2AgentNode = ({ data }: { data: Record<string, unknown> }) => {
    const labelFields: string[] = data.labelFields || ['displayId', 'user', 'host'];
    const showField = (f: string) => labelFields.includes(f);
    return (
        <div className={cn(
            'flex flex-col items-center gap-1 px-3 py-2 border rounded font-mono text-xs min-w-[80px] transition-all',
            data._selected ? 'ring-1 ring-signal/80 brightness-110 ' : '',
            data._dimmed ? 'opacity-20 grayscale ' : '',
            data.isMythic
                ? 'border-signal/60 bg-signal/10 text-signal'
                : data.active
                    ? 'border-white/30 bg-black/60 text-white'
                    : 'border-red-500/30 bg-red-900/10 text-red-400'
        )}>
            <Handle type="target" position={Position.Left} isConnectable={false} />
            {data.isMythic ? (
                <span className="text-[10px] font-bold tracking-widest text-signal">MYTHIC</span>
            ) : (
                <>
                    <img
                        src={`/static/${data.payloadType}_dark.svg`}
                        alt={data.payloadType}
                        className="w-6 h-6 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {showField('displayId') && <span className="text-[10px] font-bold">#{data.displayId}</span>}
                    {showField('user') && data.user && <span className="text-[9px] text-gray-400 truncate max-w-[100px]">{data.user}</span>}
                    {showField('host') && data.host && <span className="text-[9px] text-gray-300 truncate max-w-[100px]">{data.host}</span>}
                    {showField('ip') && data.ip && <span className="text-[9px] text-blue-400/70 truncate max-w-[100px]">{data.ip}</span>}
                    {showField('type') && <span className="text-[9px] text-purple-400/70">{data.payloadType}</span>}
                    <span className={cn('text-[8px] mt-0.5', data.active ? 'text-signal' : 'text-red-400')}>
                        {data.active ? '● ACTIVE' : '○ INACTIVE'}
                    </span>
                </>
            )}
            <Handle type="source" position={Position.Right} isConnectable={false} />
        </div>
    );
};

// Custom edge for C2 graph
const C2PathEdge = ({ id, sourceX, sourceY, targetX, targetY, style, data, label }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const isP2P = data?.isP2P;
    const isActive = data?.active !== false;
    return (
        <>
            <BaseEdge id={id} path={edgePath} style={{
                ...style,
                stroke: isActive ? (isP2P ? '#a78bfa' : '#22c55e') : '#ef4444',
                strokeWidth: 1.5,
                strokeDasharray: isActive ? undefined : '6 3',
            }} />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'none',
                        }}
                        className={cn(
                            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border whitespace-nowrap',
                            isActive
                                ? isP2P ? 'bg-black/90 border-purple-500/40 text-purple-300' : 'bg-black/90 border-signal/30 text-signal'
                                : 'bg-black/90 border-red-500/30 text-red-400'
                        )}
                    >
                        {String(label)}
                        <span className="text-[8px] opacity-60">{isP2P ? ' P2P' : ''}</span>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

const c2PathNodeTypes = { agentNode: C2AgentNode };
const c2PathEdgeTypes = { c2path: C2PathEdge };

// Inner graph component (needs to be inside ReactFlowProvider)
const C2PathGraphInner = ({
    edges, onNodeCtxMenu, labelFields = ['displayId', 'user', 'host'], groupBy = 'None', onHideNodeIds,
}: {
    edges: any[];
    onNodeCtxMenu?: (event: React.MouseEvent, nodeId: string, nodeData: any) => void;
    labelFields?: string[];
    groupBy?: string;
    onHideNodeIds?: (ids: string[]) => void;
}) => {
    const { fitView } = useReactFlow();
    const containerRef = useRef<HTMLDivElement>(null);
    const __navigate = useNavigate();

    const [c2LayoutDir, setC2LayoutDir] = useState<'LR' | 'TB'>('LR');
    const [c2SelectedIds, setC2SelectedIds] = useState<Set<string>>(new Set());
    const [c2EdgeCtxMenu, setC2EdgeCtxMenu] = useState<{ x: number; y: number; edge: any } | null>(null);
    const [c2PaneCtxMenu, setC2PaneCtxMenu] = useState<{ x: number; y: number } | null>(null);

    // Build raw nodes and edges (unpositioned)
    const { rawNodes, rawEdges } = useMemo(() => {
        const nodeMap = new Map<string, any>();
        nodeMap.set('Mythic', {
            id: 'Mythic', type: 'agentNode', position: { x: 0, y: 0 },
            data: { isMythic: true, active: true, label: 'Mythic', labelFields },
        });
        edges.forEach((edge: any) => {
            [edge.source, edge.destination].forEach((node: any) => {
                if (!node) return;
                const nodeId = String(node.id);
                if (!nodeMap.has(nodeId)) {
                    nodeMap.set(nodeId, {
                        id: nodeId, type: 'agentNode', position: { x: 0, y: 0 },
                        data: {
                            isMythic: false, active: node.active, displayId: node.display_id,
                            user: node.user || '', host: node.host || '', ip: node.ip || '',
                            payloadType: node.payload?.payloadtype?.name || 'agent',
                            label: `#${node.display_id}`,
                            labelFields,
                        },
                    });
                }
            });
        });
        const rawEdgesArr: any[] = edges.map((edge: any) => {
            const isP2P = edge.c2profile?.is_p2p;
            const isActive = !edge.end_timestamp;
            return {
                id: `edge-${edge.id}`,
                source: !isP2P ? String(edge.source?.id) : String(edge.source?.id),
                target: !isP2P ? 'Mythic' : String(edge.destination?.id),
                type: 'c2path', label: edge.c2profile?.name || (isP2P ? 'P2P' : ''),
                animated: isActive, data: { isP2P, active: isActive, edgeId: edge.id,
                    sourceId: String(edge.source?.id), destId: String(edge.destination?.id ?? 'Mythic') },
            };
        });
        return { rawNodes: Array.from(nodeMap.values()), rawEdges: rawEdgesArr };
    }, [edges, labelFields]);

    // ELK-layouted state
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [flowEdgeState, setFlowEdgeState, onEdgesChange] = useEdgesState(rawEdges);

    useEffect(() => {
        setFlowEdgeState(rawEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawEdges]);

    // Run ELK layout when raw nodes or layout direction change
    useEffect(() => {
        if (rawNodes.length === 0) return;
        let cancelled = false;
        const elkNodes = rawNodes.map(n => ({
            id: n.id,
            width: n.id === 'Mythic' ? 90 : 160,
            height: n.id === 'Mythic' ? 50 : 80,
        }));
        const nodeIdSet = new Set(rawNodes.map(n => n.id));
        const elkEdges = rawEdges
            .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
            .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }));
        _c2Elk.layout({
            id: 'c2-root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': c2LayoutDir === 'LR' ? 'RIGHT' : 'DOWN',
                'elk.layered.spacing.nodeNodeBetweenLayers': '100',
                'elk.spacing.nodeNode': '40',
            },
            children: elkNodes,
            edges: elkEdges,
        }).then((result: Record<string, unknown>) => {
            if (cancelled) return;
            const posMap = new Map<string, { x: number; y: number }>();
            (result.children || []).forEach((n: Record<string, unknown>) => { posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }); });
            setNodes(rawNodes.map(n => ({ ...n, position: posMap.get(n.id) ?? n.position })));
            setTimeout(() => fitView({ padding: 0.3 }), 80);
        }).catch(() => {
            if (!cancelled) { setNodes(rawNodes); setTimeout(() => fitView({ padding: 0.3 }), 80); }
        });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawNodes, c2LayoutDir]);

    // Apply selection visual feedback + groupBy overlays
    const displayNodes = useMemo(() => {
        const withSel = nodes.map((n: Record<string, unknown>) => ({
            ...n,
            data: {
                ...n.data,
                _selected: c2SelectedIds.has(n.id),
                _dimmed: c2SelectedIds.size > 0 && !c2SelectedIds.has(n.id),
            },
        }));
        if (groupBy === 'None') return withSel.filter((n: Record<string, unknown>) => n.type !== 'c2group');
        const PAD = 24, NODE_W = 160, NODE_H = 80;
        const bounds = new Map<string, { mnX: number; mnY: number; mxX: number; mxY: number }>();
        withSel.forEach((n: Record<string, unknown>) => {
            if (n.type === 'c2group') return;
            const val = String((n.data as any)[groupBy] ?? '(none)');
            const b = bounds.get(val) ?? { mnX: Infinity, mnY: Infinity, mxX: -Infinity, mxY: -Infinity };
            b.mnX = Math.min(b.mnX, n.position.x);
            b.mnY = Math.min(b.mnY, n.position.y);
            b.mxX = Math.max(b.mxX, n.position.x + NODE_W);
            b.mxY = Math.max(b.mxY, n.position.y + NODE_H);
            bounds.set(val, b);
        });
        const groupNodes: any[] = [];
        bounds.forEach((b, gv) => {
            if (b.mnX === Infinity) return;
            groupNodes.push({
                id: `c2group-${gv}`, type: 'c2group',
                position: { x: b.mnX - PAD, y: b.mnY - PAD },
                style: { width: b.mxX - b.mnX + PAD * 2, height: b.mxY - b.mnY + PAD * 2, zIndex: -10, pointerEvents: 'none',
                    border: '1px dashed #22c55e33', borderRadius: 4, backgroundColor: '#22c55e05' },
                data: { label: gv },
                selectable: false, draggable: false,
            });
        });
        return [...groupNodes, ...withSel.filter((n: Record<string, unknown>) => n.type !== 'c2group')];
    }, [nodes, c2SelectedIds, groupBy]);

    const handleExportSVG = useCallback(async () => {
        const el = containerRef.current;
        if (!el) return;
        try {
            const dataUrl = await toSvg(el, { backgroundColor: '#050505' });
            const a = document.createElement('a'); a.download = 'c2_graph.svg'; a.href = dataUrl; a.click();
        } catch {}
    }, []);

    const handleExportPNG = useCallback(async () => {
        const el = containerRef.current;
        if (!el) return;
        try {
            const dataUrl = await toPng(el, { backgroundColor: '#050505', pixelRatio: 2 });
            const a = document.createElement('a'); a.download = 'c2_graph.png'; a.href = dataUrl; a.click();
        } catch {}
    }, []);

    const onC2NodeClick = useCallback((event: React.MouseEvent, node: any) => {
        if (node.type === 'c2group') return;
        if (event.shiftKey) {
            setC2SelectedIds(prev => {
                const s = new Set(prev);
                s.has(node.id) ? s.delete(node.id) : s.add(node.id);
                return s;
            });
        } else {
            setC2SelectedIds(prev => prev.size === 1 && prev.has(node.id) ? new Set() : new Set([node.id]));
        }
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <ReactFlow
            nodes={displayNodes}
            edges={flowEdgeState}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={c2PathNodeTypes}
            edgeTypes={c2PathEdgeTypes}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="bg-transparent"
            minZoom={0.2}
            maxZoom={3}
            defaultEdgeOptions={{ type: 'c2path' }}
            panOnScroll={true}
            onNodeClick={onC2NodeClick}
            onEdgeContextMenu={(event, edge) => {
                event.preventDefault();
                setC2EdgeCtxMenu({ x: event.clientX, y: event.clientY, edge });
                setC2PaneCtxMenu(null);
            }}
            onPaneContextMenu={(event: any) => {
                event.preventDefault();
                setC2PaneCtxMenu({ x: event.clientX, y: event.clientY });
                setC2EdgeCtxMenu(null);
            }}
            onPaneClick={() => {
                setC2SelectedIds(new Set());
                setC2EdgeCtxMenu(null);
                setC2PaneCtxMenu(null);
            }}
            onNodeContextMenu={(event, node) => {
                event.preventDefault();
                setC2EdgeCtxMenu(null);
                setC2PaneCtxMenu(null);
                onNodeCtxMenu?.(event as unknown as React.MouseEvent, node.id, node.data);
            }}
        >
            <Background color="#333" gap={20} className="opacity-20" />
        </ReactFlow>

        {/* Floating C2 toolbar — layout toggle + export */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 pointer-events-auto">
            <button
                onClick={() => setC2LayoutDir(d => d === 'LR' ? 'TB' : 'LR')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/90 border border-signal/30 text-signal text-[10px] font-mono hover:bg-signal/10 rounded transition-colors"
                title={c2LayoutDir === 'LR' ? 'Switch to Top-Bottom' : 'Switch to Left-Right'}>
                {c2LayoutDir === 'LR'
                    ? <><ArrowUpDown size={10} /> TB</>
                    : <><ArrowLeftRight size={10} /> LR</>}
            </button>
            <button onClick={handleExportSVG}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/90 border border-signal/30 text-signal text-[10px] font-mono hover:bg-signal/10 rounded transition-colors"
                title="Export SVG">
                <FileImage size={10} /> SVG
            </button>
            <button onClick={handleExportPNG}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/90 border border-signal/30 text-signal text-[10px] font-mono hover:bg-signal/10 rounded transition-colors"
                title="Export PNG">
                <Camera size={10} /> PNG
            </button>
        </div>

        {/* Edge context menu */}
        {c2EdgeCtxMenu && createPortal(
            <div
                style={{ position: 'fixed', top: c2EdgeCtxMenu.y, left: c2EdgeCtxMenu.x, zIndex: 9999 }}
                className="bg-[#0a0a0a] border border-signal/30 rounded shadow-lg py-1 min-w-[150px]"
            >
                {c2EdgeCtxMenu.edge?.label && (
                    <div className="px-3 py-1 text-[10px] font-mono text-signal/50 border-b border-signal/10 mb-0.5">
                        {String(c2EdgeCtxMenu.edge.label)}{c2EdgeCtxMenu.edge.data?.isP2P ? ' (P2P)' : ''}
                    </div>
                )}
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-signal flex items-center gap-2"
                    onClick={() => {
                        const e = c2EdgeCtxMenu.edge;
                        if (e?.data?.sourceId && onHideNodeIds) onHideNodeIds([e.data.sourceId, e.data.destId].filter(Boolean));
                        setC2EdgeCtxMenu(null);
                    }}>
                    <EyeOff size={11} /> Hide Edge Nodes
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-gray-400 flex items-center gap-2"
                    onClick={() => setC2EdgeCtxMenu(null)}>
                    <X size={11} /> Cancel
                </button>
            </div>,
            document.body
        )}

        {/* Pane context menu */}
        {c2PaneCtxMenu && createPortal(
            <div
                style={{ position: 'fixed', top: c2PaneCtxMenu.y, left: c2PaneCtxMenu.x, zIndex: 9999 }}
                className="bg-[#0a0a0a] border border-signal/30 rounded shadow-lg py-1 min-w-[150px]"
            >
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-signal flex items-center gap-2"
                    onClick={() => { setC2SelectedIds(new Set()); setC2PaneCtxMenu(null); }}>
                    <CheckSquare size={11} /> Unselect All
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-gray-400 flex items-center gap-2"
                    onClick={() => setC2PaneCtxMenu(null)}>
                    <X size={11} /> Cancel
                </button>
            </div>,
            document.body
        )}
        </div>
    );
};

export const C2PathDialog = ({ callbackId, displayId, onClose }: { callbackId: number; displayId: number; onClose: () => void }) => {
    const { data, loading } = useQuery(GET_CALLBACK_C2_PATHS, {
        variables: { callback_id: callbackId }, fetchPolicy: 'no-cache',
    });
    const { data: p2pData } = useQuery(GET_P2P_PROFILES_AND_CALLBACKS);
    const [__getLinkCmds, { data: __linkCmdsData }] = useLazyQuery(GET_LINK_COMMANDS_FOR_CALLBACK);
    const [removeEdge] = useMutation(REMOVE_EDGE_MUTATION);
    const [addEdge] = useMutation(ADD_EDGE_MUTATION);
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const navigate = useNavigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const edges = data?.callbackgraphedge || [];
    const [showList, setShowList] = useState(false);
    const [c2CtxMenu, setC2CtxMenu] = useState<{ x: number; y: number; nodeId: string; displayId?: number; isMythic?: boolean } | null>(null);
    const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
    const [c2LabelFields, setC2LabelFields] = useState<string[]>(['displayId', 'host', 'user']);
    const [c2GroupBy, setC2GroupBy] = useState<string>('None');

    // Edge operation modals
    const [removeEdgeModal, setRemoveEdgeModal] = useState<any[] | null>(null);
    const [addEdgeSourceCb, setAddEdgeSourceCb] = useState<unknown>(null);
    const [addEdgeSelectedProfile, setAddEdgeSelectedProfile] = useState<unknown>(null);
    const [addEdgeSelectedDest, setAddEdgeSelectedDest] = useState<unknown>(null);
    const [addEdgeDestOptions, setAddEdgeDestOptions] = useState<any[]>([]);
    const [taskForEdgeModal, setTaskForEdgeModal] = useState<unknown>(null);
    const [taskForEdgeCommand, setTaskForEdgeCommand] = useState<string>('');
    const [taskForEdgeParams, setTaskForEdgeParams] = useState<string>('');

    // Filter edges by hidden node IDs
    const filteredEdges = useMemo(() =>
        edges.filter((e: Record<string, unknown>) =>
            !hiddenNodeIds.has(String(e.source?.id)) &&
            !hiddenNodeIds.has(String(e.destination?.id))
        ),
    [edges, hiddenNodeIds]);

    // Find node data from edges
    const allNodes = useMemo(() => {
        const nodes: Record<string, unknown> = {};
        edges.forEach((e: Record<string, unknown>) => {
            if (e.source?.id) nodes[String(e.source.id)] = e.source;
            if (e.destination?.id) nodes[String(e.destination.id)] = e.destination;
        });
        return nodes;
    }, [edges]);

    const handleNodeCtxMenu = useCallback((event: React.MouseEvent, nodeId: string, nodeData: any) => {
        event.preventDefault();
        setC2CtxMenu({ x: event.clientX, y: event.clientY, nodeId, displayId: nodeData?.displayId, isMythic: nodeData?.isMythic });
    }, []);

    const handleHideNodeIds = useCallback((ids: string[]) => {
        setHiddenNodeIds(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s; });
    }, []);

    const handleOpenRemoveEdgeModal = useCallback(() => {
        const activeEdges = edges.filter((e: Record<string, unknown>) => !e.end_timestamp);
        setRemoveEdgeModal(activeEdges);
    }, [edges]);

    const handleOpenAddEdgeModal = useCallback(() => {
        const cb = c2CtxMenu ? allNodes[c2CtxMenu.nodeId] : null;
        if (cb) {
            setAddEdgeSourceCb(cb);
            setAddEdgeSelectedProfile(null);
            setAddEdgeSelectedDest(null);
            setAddEdgeDestOptions([]);
        }
    }, [c2CtxMenu, allNodes]);

    const handleManuallyAddEdge = useCallback(async () => {
        if (!addEdgeSourceCb || !addEdgeSelectedProfile || !addEdgeSelectedDest) return;
        try {
            await addEdge({
                variables: {
                    source_id: addEdgeSourceCb.id,
                    destination_id: addEdgeSelectedDest.id,
                    c2profile: addEdgeSelectedProfile.name,
                },
            });
            snackActions.success('P2P edge added');
            setAddEdgeSourceCb(null);
            setAddEdgeSelectedProfile(null);
            setAddEdgeSelectedDest(null);
            setAddEdgeDestOptions([]);
        } catch (err: unknown) {
            snackActions.error('Failed: ' + err.message);
        }
    }, [addEdgeSourceCb, addEdgeSelectedProfile, addEdgeSelectedDest, addEdge]);

    const handleTaskForEdge = useCallback(async () => {
        if (!taskForEdgeModal || !taskForEdgeCommand) return;
        try {
            await createTask({
                variables: {
                    callback_id: taskForEdgeModal.id,
                    command: taskForEdgeCommand,
                    params: taskForEdgeParams,
                },
            });
            snackActions.success('Task created');
            setTaskForEdgeModal(null);
            setTaskForEdgeCommand('');
            setTaskForEdgeParams('');
        } catch (err: unknown) {
            snackActions.error('Failed: ' + err.message);
        }
    }, [taskForEdgeModal, taskForEdgeCommand, taskForEdgeParams, createTask]);

    const __allLabelFields = ['displayId', 'host', 'user', 'ip', 'type'];
    const toggleLabel = (f: string) => setC2LabelFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

    return (
        <CyberModal title={`C2_PATH — CALLBACK #${displayId}`} onClose={onClose} icon={<GitBranch />}>
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <RefreshCw size={20} className="animate-spin text-signal/50" />
                </div>
            ) : edges.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-8 font-mono">No active C2 edges found</div>
            ) : (
                <div className="flex flex-col gap-3">
                    {/* Controls row */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* View toggle */}
                        <div className="flex items-center gap-1 text-xs font-mono">
                            <button
                                onClick={() => setShowList(false)}
                                className={cn('px-3 py-1 border transition-colors', !showList ? 'border-signal text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-gray-300')}
                            >
                                GRAPH
                            </button>
                            <button
                                onClick={() => setShowList(true)}
                                className={cn('px-3 py-1 border transition-colors', showList ? 'border-signal text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-gray-300')}
                            >
                                LIST
                            </button>
                        </div>
                        {/* Group By */}
                        <div className="flex items-center gap-1.5 text-xs font-mono">
                            <span className="text-gray-500">GROUP</span>
                            <div className="relative">
                                <select
                                    value={c2GroupBy}
                                    onChange={e => setC2GroupBy(e.target.value)}
                                    className="bg-black border border-signal/20 text-signal text-xs font-mono px-2 py-1 rounded appearance-none pr-5 focus:outline-none focus:border-signal/50"
                                >
                                    {['None','host','user','ip'].map(v => (
                                        <option key={v} value={v}>{v === 'None' ? 'NONE' : v.toUpperCase()}</option>
                                    ))}
                                </select>
                                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-signal/60 pointer-events-none" />
                            </div>
                        </div>
                        {/* Label Fields */}
                        <div className="flex items-center gap-1 text-xs font-mono flex-wrap">
                            {['displayId','host','user','ip','type'].map(f => {
                                const active = c2LabelFields.includes(f);
                                return (
                                    <button key={f}
                                        onClick={() => toggleLabel(f)}
                                        className={cn('flex items-center gap-0.5 px-2 py-0.5 border rounded text-[10px] transition-colors',
                                            active ? 'bg-signal/20 border-signal/50 text-signal' : 'bg-black border-white/10 text-gray-600 hover:border-signal/30 hover:text-signal/50')}>
                                        {active ? <CheckSquare size={9} /> : <Square size={9} />}{f}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="ml-auto text-gray-600 text-[10px] font-mono">{edges.length} edge{edges.length !== 1 ? 's' : ''}</span>
                    </div>

                    {showList ? (
                        /* List view (original) */
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto cyber-scrollbar">
                            {edges.map((edge: any) => {
                                const src = edge.source;
                                const dst = edge.destination;
                                const isEgress = !edge.c2profile?.is_p2p;
                                return (
                                    <div key={edge.id} className="border border-white/10 rounded p-3 space-y-2 bg-black/30">
                                        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
                                            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                                                isEgress ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30')}>
                                                {edge.c2profile?.name || '?'} • {isEgress ? 'Egress' : 'P2P'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={cn('flex flex-col text-xs font-mono p-2 border rounded flex-1',
                                                src?.active ? 'border-signal/30 bg-signal/5' : 'border-red-500/30 bg-red-900/10')}>
                                                <span className="text-gray-500 text-[9px] uppercase mb-0.5">SOURCE</span>
                                                <span className="text-white font-bold">#{src?.display_id} {src?.user}@{src?.host}</span>
                                                <span className="text-gray-500">{(() => { try { return JSON.parse(src?.ip || '[]')[0]; } catch { return src?.ip || '?'; } })()}</span>
                                                <span className={src?.active ? 'text-signal' : 'text-red-400'}>
                                                    {src?.active ? '● Active' : '○ Inactive'}
                                                </span>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-500 shrink-0" />
                                            <div className={cn('flex flex-col text-xs font-mono p-2 border rounded flex-1',
                                                dst?.active ? 'border-blue-500/30 bg-blue-900/10' : 'border-red-500/30 bg-red-900/10')}>
                                                <span className="text-gray-500 text-[9px] uppercase mb-0.5">DESTINATION</span>
                                                <span className="text-white font-bold">#{dst?.display_id} {dst?.user}@{dst?.host}</span>
                                                <span className="text-gray-500">{(() => { try { return JSON.parse(dst?.ip || '[]')[0]; } catch { return dst?.ip || '?'; } })()}</span>
                                                <span className={dst?.active ? 'text-blue-400' : 'text-red-400'}>
                                                    {dst?.active ? '● Active' : '○ Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* Graph view */
                        <div style={{ height: '60vh', minHeight: 320 }} className="border border-signal/20 rounded overflow-hidden bg-black/40">
                            <ReactFlowProvider>
                                <C2PathGraphInner
                                    edges={filteredEdges}
                                    onNodeCtxMenu={handleNodeCtxMenu}
                                    labelFields={c2LabelFields}
                                    groupBy={c2GroupBy}
                                    onHideNodeIds={handleHideNodeIds}
                                />
                            </ReactFlowProvider>
                        </div>
                    )}
                </div>
            )}

            {/* Node context menu */}
            {c2CtxMenu && createPortal(
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setC2CtxMenu(null)} />
                    <div
                        className="fixed z-[9999] bg-black/95 border border-signal/30 shadow-lg w-48 backdrop-blur-lg"
                        style={{ top: c2CtxMenu.y, left: c2CtxMenu.x }}
                    >
                        <div className="px-3 py-2 border-b border-white/5 text-[10px] font-mono text-gray-500">
                            {c2CtxMenu.isMythic ? 'MYTHIC_SERVER' : `CALLBACK #${c2CtxMenu.displayId ?? c2CtxMenu.nodeId}`}
                        </div>
                        {!c2CtxMenu.isMythic && c2CtxMenu.displayId && (
                            <button
                                onClick={() => { navigate(`/console/${c2CtxMenu.displayId}`); setC2CtxMenu(null); onClose(); }}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors w-full text-left"
                            >
                                <Terminal size={12} /> Interact
                            </button>
                        )}
                        <div className="border-t border-white/5 my-1" />
                        {!c2CtxMenu.isMythic && c2CtxMenu.displayId && (
                            <>
                                <button
                                    onClick={() => { handleOpenRemoveEdgeModal(); setC2CtxMenu(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-orange-900/20 text-xs text-orange-400 hover:text-orange-300 transition-colors w-full text-left"
                                >
                                    <Trash2 size={12} /> Remove Edge
                                </button>
                                <button
                                    onClick={() => { handleOpenAddEdgeModal(); setC2CtxMenu(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-cyan-900/20 text-xs text-cyan-400 hover:text-cyan-300 transition-colors w-full text-left"
                                >
                                    <Plus size={12} /> Add P2P Edge
                                </button>
                                <button
                                    onClick={() => { setTaskForEdgeModal(c2CtxMenu ? allNodes[c2CtxMenu.nodeId] : null); setC2CtxMenu(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-blue-900/20 text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-left"
                                >
                                    <Link2 size={12} /> Task for Edge
                                </button>
                                <div className="border-t border-white/5 my-1" />
                            </>
                        )}
                        <button
                            onClick={() => { setHiddenNodeIds(p => { const n = new Set(p); n.add(c2CtxMenu.nodeId); return n; }); setC2CtxMenu(null); }}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-yellow-900/20 text-xs text-yellow-400 hover:text-yellow-300 transition-colors w-full text-left"
                        >
                            <EyeOff size={12} /> Hide from Graph
                        </button>
                    </div>
                </>,
                document.body
            )}

            {/* Remove Edge Modal */}
            {removeEdgeModal && (
                <CyberModal
                    title="REMOVE_EDGE"
                    onClose={() => setRemoveEdgeModal(null)}
                    icon={<Trash2 />}
                >
                    <div className="space-y-3 min-w-[340px]">
                        <p className="text-xs text-gray-400 font-mono mb-2">Select an active edge to remove:</p>
                        {removeEdgeModal.map((e: Record<string, unknown>) => (
                            <button
                                key={e.id}
                                onClick={async () => {
                                    try {
                                        await removeEdge({ variables: { edge_id: e.id } });
                                        snackActions.success('Edge removed');
                                    } catch (err: unknown) {
                                        snackActions.error('Failed: ' + err.message);
                                    }
                                    setRemoveEdgeModal(null);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-orange-500/40 rounded text-xs font-mono text-left text-gray-300 hover:text-orange-300 hover:bg-orange-900/20 transition-colors"
                            >
                                <Trash2 size={12} className="text-orange-500 shrink-0" />
                                <span>
                                    #{e.source?.display_id} → #{e.destination?.display_id}
                                    {e.c2profile?.name && <span className="text-gray-500 ml-2">[{e.c2profile.name}]</span>}
                                </span>
                            </button>
                        ))}
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setRemoveEdgeModal(null)}
                                className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}

            {/* Add P2P Edge Modal */}
            {addEdgeSourceCb && (
                <CyberModal
                    title="ADD_P2P_EDGE"
                    onClose={() => { setAddEdgeSourceCb(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                    icon={<Plus />}
                >
                    <div className="space-y-4 min-w-[380px]">
                        <p className="text-xs text-gray-400 font-mono">
                            Source: <span className="text-signal">#{addEdgeSourceCb.display_id}</span>
                            {addEdgeSourceCb.host && <span className="text-gray-500 ml-2">({addEdgeSourceCb.host})</span>}
                        </p>

                        {/* Profile selector */}
                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-2">P2P_PROFILE</label>
                            <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                {p2pData?.c2profile?.map((profile: any) => (
                                    <button
                                        key={profile.id}
                                        onClick={() => {
                                            setAddEdgeSelectedProfile(profile);
                                            setAddEdgeSelectedDest(null);
                                            const dests = (profile.callbackc2profiles || [])
                                                .map((cp: any) => cp.callback)
                                                .filter((c: any) => c && c.id !== addEdgeSourceCb.id);
                                            setAddEdgeDestOptions(dests);
                                        }}
                                        className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                            addEdgeSelectedProfile?.id === profile.id
                                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                        }`}
                                    >
                                        <GitBranch size={14} />
                                        <span>{profile.name}</span>
                                        <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                    </button>
                                ))}
                                {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                    <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES</div>
                                )}
                            </div>
                        </div>

                        {/* Destination selector */}
                        {addEdgeSelectedProfile && (
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">DESTINATION_CALLBACK</label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {addEdgeDestOptions.map((cb: any) => (
                                        <button
                                            key={cb.id}
                                            onClick={() => setAddEdgeSelectedDest(cb)}
                                            className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                addEdgeSelectedDest?.id === cb.id
                                                    ? 'border-signal bg-signal/10 text-signal'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            }`}
                                        >
                                            <Monitor size={14} />
                                            <span>#{cb.display_id}</span>
                                            {cb.description && <span className="text-gray-500 ml-1 truncate max-w-[140px]">{cb.description}</span>}
                                        </button>
                                    ))}
                                    {addEdgeDestOptions.length === 0 && (
                                        <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_CALLBACKS</div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => { setAddEdgeSourceCb(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                                className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleManuallyAddEdge}
                                disabled={!addEdgeSelectedProfile || !addEdgeSelectedDest}
                                className="px-4 py-2 border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                CONFIRM_EDGE
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}

            {/* Task for Edge Modal */}
            {taskForEdgeModal && (
                <CyberModal
                    title="TASK_FOR_EDGE"
                    onClose={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(''); setTaskForEdgeParams(''); }}
                    icon={<Link2 />}
                >
                    <div className="space-y-4 min-w-[340px]">
                        <p className="text-xs text-gray-400 font-mono">
                            Callback #{taskForEdgeModal.display_id} — {taskForEdgeModal.host}
                        </p>

                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-2">COMMAND</label>
                            <input
                                type="text"
                                value={taskForEdgeCommand}
                                onChange={(e) => setTaskForEdgeCommand(e.target.value)}
                                className="w-full px-3 py-2 bg-black border border-white/10 text-white text-xs font-mono focus:border-signal/30 focus:outline-none"
                                placeholder="e.g. ls, whoami"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-2">PARAMETERS (optional)</label>
                            <textarea
                                value={taskForEdgeParams}
                                onChange={(e) => setTaskForEdgeParams(e.target.value)}
                                className="w-full px-3 py-2 bg-black border border-white/10 text-white text-xs font-mono focus:border-signal/30 focus:outline-none resize-none"
                                rows={3}
                                placeholder="JSON parameters"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(''); setTaskForEdgeParams(''); }}
                                className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleTaskForEdge}
                                disabled={!taskForEdgeCommand}
                                className="px-4 py-2 border border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500 font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                TASK
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}
        </CyberModal>
    );
};

/* ─────────── Open Multiple Callbacks Dialog ─────────── */
