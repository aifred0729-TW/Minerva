import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ReactFlow, Background, Node, Edge,
    getConnectedEdges,
} from '@xyflow/react';
import { useNavigate } from 'react-router-dom';
import { useQueryCompat as useQuery } from '../../../lib/useQueryCompat';
import { GET_CALLBACKS_WITH_BROWSERSCRIPTS } from '../../../lib/api';
import { toSvg } from 'html-to-image';
import { snackActions } from '../../../lib/snackbar';
import { getErrorMessage, downloadDataUrl } from '../../../lib/utils';
import { elk, nodeTypes } from '../layout';
import type { Callback } from '../../../types/callbacks';
import { usePageVisible } from '../../../lib/usePageVisible';
import {
    Eye, EyeOff, X, ChevronDown, FileImage,
    ArrowLeftRight, ArrowUpDown, CheckSquare,
    Terminal, Trash2, Plus, Link2,
} from 'lucide-react';

const GRAPH_AUTO_HIDE_THRESHOLD = 50;

/** Node data stored alongside xyflow nodes */
interface GraphNodeData {
    displayId?: number;
    host?: string;
    [key: string]: unknown;
}

interface BrowserScriptViewProps {
    active: boolean;
    onRemoveEdge: (cbInfo: { callback_id: number; display_id?: number; host: string }) => void;
    onAddP2PEdge: (cbInfo: { callback_id: number; display_id?: number; host: string }) => void;
    onTaskForEdge: (cbInfo: { callback_id: number; display_id?: number; host: string }) => void;
}

export function BrowserScriptView({ active, onRemoveEdge, onAddP2PEdge, onTaskForEdge }: BrowserScriptViewProps) {
    const navigate = useNavigate();
    const bsContainerRef = useRef<HTMLDivElement>(null);
    const pageVisible = usePageVisible();

    // ── State ──
    const [bsHiddenNodeIds, setBsHiddenNodeIds] = useState<Set<string>>(new Set());
    const [bsContextMenu, setBsContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const [bsLayoutDir, setBsLayoutDir] = useState<'LR' | 'TB'>('LR');
    const [bsSelectedNodeIds, setBsSelectedNodeIds] = useState<Set<string>>(new Set());
    const [bsEdgeCtxMenu, setBsEdgeCtxMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);
    const [bsPaneCtxMenu, setBsPaneCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const [bsElkData, setBsElkData] = useState<{ nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }>({ nodes: [], edges: [] });
    const [bsGroupBy, setBsGroupBy] = useState<string>('None');
    const [bsShowLargeGraph, setBsShowLargeGraph] = useState(false);

    // ── Query ──
    const { data: bsData } = useQuery<any>(GET_CALLBACKS_WITH_BROWSERSCRIPTS, {
        fetchPolicy: 'network-only',
        skip: !active,
        pollInterval: active && pageVisible ? 10000 : 0,
    });

    // ── Build raw (unpositioned) nodes/edges from bsData ──
    const bsRawData = useMemo(() => {
        if (!(bsData as any)?.callback) return { nodes: [], edges: [] };
        const rawNodes: Record<string, unknown>[] = [];
        const rawEdges: Record<string, unknown>[] = [];
        const scriptIds = new Set<string>();
        (bsData as any).callback.forEach((cb: Callback) => {
            const cbNodeId = `cb-${cb.id}`;
            const payloadType = cb.payload?.payloadtype?.name || 'agent';
            rawNodes.push({
                id: cbNodeId,
                type: 'bsCallbackNode',
                position: { x: 0, y: 0 },
                data: {
                    displayId: cb.display_id,
                    host: cb.host || cb.ip || '',
                    user: cb.user || '',
                    ip: cb.ip || '',
                    domain: cb.domain || '',
                    os: cb.os || '',
                    payloadType,
                    buttons: [
                        { type: 'interact', label: 'Interact', displayId: cb.display_id },
                    ],
                },
            });
            const scripts: Array<Record<string, unknown> & { command?: { cmd?: string } }> = [];
            (cb.loadedcommands || []).forEach((lc) => {
                (lc.command?.browserscripts || []).forEach((bs) => {
                    scripts.push({ ...bs, _payloadType: payloadType });
                });
            });
            scripts.forEach((bs) => {
                const bsNodeId = `bs-${bs.id}`;
                if (!scriptIds.has(bsNodeId)) {
                    scriptIds.add(bsNodeId);
                    rawNodes.push({
                        id: bsNodeId,
                        type: 'browserscriptNode',
                        position: { x: 0, y: 0 },
                        data: {
                            label: bs.name,
                            name: bs.name,
                            command: bs.command?.cmd || '',
                            agentIcon: bs._payloadType,
                            // overlay_img: agent icon as JSX (rendered in BrowserscriptNode)
                            overlay_img: bs._payloadType ? (
                                <img src={`/static/${bs._payloadType}_dark.svg`} alt=""
                                    style={{ width: 14, height: 14, objectFit: 'contain' }}
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : null,
                        },
                    });
                }
                rawEdges.push({
                    id: `e-${cbNodeId}-${bsNodeId}-${bs.id}`,
                    source: cbNodeId,
                    target: bsNodeId,
                    label: bs.command?.cmd || '',
                    style: { stroke: '#22c55e44', strokeWidth: 1 },
                    animated: false,
                    data: { commandName: bs.command?.cmd || '', scriptName: String(bs.name || '') },
                });
            });
        });
        return { nodes: rawNodes, edges: rawEdges };
    }, [bsData]);

    // ── Run ELK layout ──
    useEffect(() => {
        if (bsRawData.nodes.length === 0) { setBsElkData({ nodes: [], edges: [] }); return; }
        let cancelled = false;
        const elkNodes = bsRawData.nodes.map((n: any) => ({
            id: n.id as string,
            width: n.type === 'bsCallbackNode' ? 120 : 140,
            height: n.type === 'bsCallbackNode' ? 80 : 64,
        }));
        const nodeIdSet = new Set(bsRawData.nodes.map((n: any) => n.id as string));
        const elkEdges = bsRawData.edges
            .filter((e: any) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
            .map((e: any) => ({ id: e.id as string, sources: [e.source as string], targets: [e.target as string] }));
        const elkDirection = bsLayoutDir === 'LR' ? 'RIGHT' : 'DOWN';
        elk.layout({
            id: 'bs-root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': elkDirection,
                'elk.layered.spacing.nodeNodeBetweenLayers': '80',
                'elk.spacing.nodeNode': '40',
            },
            children: elkNodes,
            edges: elkEdges,
        }).then((result: any) => {
            if (cancelled) return;
            const posMap = new Map<string, { x: number; y: number }>();
            (result.children || []).forEach((n: any) => { posMap.set(n.id as string, { x: n.x ?? 0, y: n.y ?? 0 }); });
            setBsElkData({
                nodes: bsRawData.nodes.map((n: any) => ({ ...n, position: posMap.get(n.id as string) ?? n.position })),
                edges: bsRawData.edges,
            });
        }).catch(() => {
            if (!cancelled) setBsElkData(bsRawData);
        });
        return () => { cancelled = true; };
    }, [bsRawData, bsLayoutDir]);

    // ── BrowserScript graph with hidden-node filtering ──
    const bsVisibleGraphData = useMemo(() => {
        if (bsHiddenNodeIds.size === 0) return bsElkData;
        const visibleIds = new Set(
            bsElkData.nodes.filter((n: any) => !bsHiddenNodeIds.has(n.id)).map((n: any) => n.id)
        );
        return {
            nodes: bsElkData.nodes.filter((n: any) => !bsHiddenNodeIds.has(n.id)),
            edges: bsElkData.edges.filter((e: any) => visibleIds.has(e.source) && visibleIds.has(e.target)),
        };
    }, [bsElkData, bsHiddenNodeIds]);

    // ── Selection visual feedback ──
    const bsDisplayData = useMemo(() => {
        const { nodes, edges } = bsVisibleGraphData;
        if (bsSelectedNodeIds.size === 0) return { nodes, edges };
        const selNodes = nodes.filter((n: any) => bsSelectedNodeIds.has(n.id));
        const connectedEdges = getConnectedEdges(selNodes as Node[], edges as Edge[]);
        const connectedEdgeIds = new Set(connectedEdges.map((e: Edge) => e.id));
        return {
            nodes: nodes.map((n: any) => ({
                ...n,
                data: { ...n.data, _selected: bsSelectedNodeIds.has(n.id), _anySelected: true },
            })),
            edges: edges.map((e: any) => ({
                ...e,
                style: connectedEdgeIds.has(e.id)
                    ? { stroke: '#22c55e', strokeWidth: 2, opacity: 1 }
                    : { stroke: '#22c55e22', strokeWidth: 1, opacity: 0.2 },
            })),
        };
    }, [bsVisibleGraphData, bsSelectedNodeIds]);

    // ── Group-by bounding box overlay ──
    const bsFinalDisplayData = useMemo(() => {
        const { nodes, edges } = bsDisplayData;
        if (bsGroupBy === 'None') return { nodes: nodes.filter((n: any) => n.type !== 'groupBound'), edges };
        const PAD = 28, NODE_W = 120, NODE_H = 80;
        const bounds = new Map<string, { mnX: number; mnY: number; mxX: number; mxY: number }>();
        nodes.forEach((n: any) => {
            if (n.type === 'groupBound') return;
            const val = n.type === 'bsCallbackNode' ? String((n.data as GraphNodeData)[bsGroupBy] ?? '(none)') : null;
            if (!val) return;
            const b = bounds.get(val) ?? { mnX: Infinity, mnY: Infinity, mxX: -Infinity, mxY: -Infinity };
            b.mnX = Math.min(b.mnX, n.position.x);
            b.mnY = Math.min(b.mnY, n.position.y);
            b.mxX = Math.max(b.mxX, n.position.x + NODE_W);
            b.mxY = Math.max(b.mxY, n.position.y + NODE_H);
            bounds.set(val, b);
        });
        const groupNodes: Node[] = [];
        bounds.forEach((b, gv) => {
            if (b.mnX === Infinity) return;
            groupNodes.push({
                id: `bs-group-${gv}`,
                type: 'groupBound',
                position: { x: b.mnX - PAD, y: b.mnY - PAD },
                style: { width: b.mxX - b.mnX + PAD * 2, height: b.mxY - b.mnY + PAD * 2, zIndex: -10, pointerEvents: 'none' },
                data: { groupBy: bsGroupBy, groupValue: gv },
                selectable: false, draggable: false,
            });
        });
        return { nodes: [...groupNodes, ...nodes.filter((n: Record<string, unknown>) => n.type !== 'groupBound')], edges };
    }, [bsDisplayData, bsGroupBy]);

    // ── Event handlers ──
    const onBsNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        setBsContextMenu(null);
        setBsEdgeCtxMenu(null);
        setBsPaneCtxMenu(null);
        setBsSelectedNodeIds(prev => {
            const next = new Set(prev);
            if (event.shiftKey) {
                if (next.has(node.id)) { next.delete(node.id); } else { next.add(node.id); }
            } else {
                if (next.size === 1 && next.has(node.id)) { next.clear(); } else { next.clear(); next.add(node.id); }
            }
            return next;
        });
    }, []);

    const onBsEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.preventDefault();
        setBsEdgeCtxMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
        setBsContextMenu(null);
        setBsPaneCtxMenu(null);
    }, []);

    const onBsPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
        event.preventDefault();
        setBsPaneCtxMenu({ x: event.clientX, y: event.clientY });
        setBsContextMenu(null);
        setBsEdgeCtxMenu(null);
    }, []);

    const onBsNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        setBsContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
        setBsEdgeCtxMenu(null);
        setBsPaneCtxMenu(null);
    }, []);

    const handleBsDownloadSvg = useCallback(async () => {
        const el = bsContainerRef.current;
        if (!el) return;
        try {
            snackActions.info('Generating SVG...');
            const dataUrl = await toSvg(el, { backgroundColor: '#050505' });
            downloadDataUrl(dataUrl, 'browserscript_graph.svg');
        } catch (e: unknown) {
            snackActions.error('SVG export failed: ' + getErrorMessage(e));
        }
    }, []);

    if (!active) return null;

    return (
        <div ref={bsContainerRef} className="absolute inset-0">

            {/* Large graph guard — ≥50 nodes hidden by default */}
            {bsElkData.nodes.length >= GRAPH_AUTO_HIDE_THRESHOLD && !bsShowLargeGraph ? (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="border border-yellow-500/40 bg-black/90 px-8 py-6 text-center font-mono">
                        <div className="text-yellow-400 text-sm mb-1">LARGE_GRAPH_DETECTED</div>
                        <div className="text-gray-500 text-xs mb-4">{bsElkData.nodes.length} nodes · {bsElkData.edges.length} edges</div>
                        <button
                            onClick={() => setBsShowLargeGraph(true)}
                            className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 text-xs hover:bg-cyan-500/30 transition-colors">
                            SHOW_GRAPH
                        </button>
                    </div>
                </div>
            ) : (
            <ReactFlow
                nodes={bsFinalDisplayData.nodes}
                edges={bsFinalDisplayData.edges}
                nodeTypes={nodeTypes}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ padding: 0.4, minZoom: 0.05, maxZoom: 2 }}
                className="bg-transparent"
                minZoom={0.05}
                maxZoom={4}
                zoomOnScroll={true}
                panOnScroll={true}
                zoomOnDoubleClick={false}
                onNodeClick={onBsNodeClick}
                onNodeDoubleClick={(_e, node) => {
                    if (node.id.startsWith('cb-')) {
                        navigate(`/console/${(node.data as GraphNodeData).displayId}`);
                    }
                }}
                onNodeContextMenu={onBsNodeContextMenu}
                onEdgeContextMenu={onBsEdgeContextMenu}
                onPaneContextMenu={onBsPaneContextMenu}
                onPaneClick={() => {
                    setBsContextMenu(null);
                    setBsEdgeCtxMenu(null);
                    setBsPaneCtxMenu(null);
                    setBsSelectedNodeIds(new Set());
                }}
            >
                <Background color="#111" gap={20} className="opacity-30" />
                {bsFinalDisplayData.nodes.filter((n: Record<string, unknown>) => n.type !== 'groupBound').length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-gray-600 text-sm font-mono border border-gray-800 px-6 py-4 bg-black/60">
                            {bsHiddenNodeIds.size > 0 ? 'ALL_NODES_HIDDEN' : 'NO_BROWSERSCRIPTS_LOADED'}
                        </div>
                    </div>
                )}
            </ReactFlow>
            )}

            {/* BS Floating Controls Toolbar */}
            <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-auto">
                <button
                    onClick={handleBsDownloadSvg}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded transition-colors"
                    title="Export SVG">
                    <FileImage size={11} /> SVG
                </button>
                <button
                    onClick={() => setBsLayoutDir(d => d === 'LR' ? 'TB' : 'LR')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded transition-colors"
                    title={bsLayoutDir === 'LR' ? 'Switch to Top-Bottom' : 'Switch to Left-Right'}>
                    {bsLayoutDir === 'LR' ? <ArrowUpDown size={11} /> : <ArrowLeftRight size={11} />}
                    {bsLayoutDir === 'LR' ? 'TB' : 'LR'}
                </button>
                {bsHiddenNodeIds.size > 0 && (
                    <button
                        onClick={() => setBsHiddenNodeIds(new Set())}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded transition-colors"
                        title="Revert all hidden">
                        <Eye size={11} /> REVERT
                    </button>
                )}
                <div className="relative">
                    <select
                        value={bsGroupBy}
                        onChange={e => setBsGroupBy(e.target.value)}
                        className="w-full bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono px-2 py-1.5 rounded appearance-none pr-5 focus:outline-none focus:border-cyan-500/60"
                        title="Group by field">
                        {['None','host','user','ip','domain','os'].map(v => (
                            <option key={v} value={v}>{v === 'None' ? 'GROUP_BY' : v.toUpperCase()}</option>
                        ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-cyan-400/60 pointer-events-none" />
                </div>
            </div>

            {/* Node context menu */}
            {bsContextMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: bsContextMenu.y, left: bsContextMenu.x, zIndex: 9999 }}
                    className="bg-[#0a0a0a] border border-cyan-500/30 rounded shadow-lg py-1 min-w-[180px]"
                    onClick={e => e.stopPropagation()}
                >
                    {(() => {
                        const nd = bsFinalDisplayData.nodes.find((n: Record<string, unknown>) => n.id === bsContextMenu.nodeId)?.data;
                        const isCbNode = bsContextMenu.nodeId.startsWith('cb-');
                        const cbIntId = isCbNode ? parseInt(bsContextMenu.nodeId.replace('cb-', ''), 10) : null;
                        const cbInfo = (isCbNode && cbIntId != null)
                            ? { callback_id: cbIntId, display_id: nd?.displayId, host: nd?.host || '' }
                            : null;
                        return (
                            <>
                                {nd && (
                                    <div className="px-3 py-1.5 border-b border-cyan-500/10 mb-0.5">
                                        <div className="text-[10px] font-mono text-cyan-500/50">
                                            {isCbNode ? `CALLBACK #${nd.displayId}` : nd.name || nd.label || 'SCRIPT'}
                                        </div>
                                        {isCbNode && nd.host && <div className="text-[10px] font-mono text-gray-600">{nd.host}</div>}
                                    </div>
                                )}
                                {nd?.buttons?.map((btn: any, i: number) => {
                                    if (btn.type === 'interact') return (
                                        <button key={i}
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                            onClick={() => { navigate(`/console/${btn.displayId}`); setBsContextMenu(null); }}>
                                            <Terminal size={11} /> {btn.label || 'Interact'}
                                        </button>
                                    );
                                    return null;
                                })}
                                <div className="h-px bg-white/10 my-0.5" />
                                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                    onClick={() => {
                                        setBsHiddenNodeIds(prev => { const s = new Set(prev); s.add(bsContextMenu.nodeId); return s; });
                                        setBsContextMenu(null);
                                    }}>
                                    <EyeOff size={11} /> Hide Node
                                </button>
                                {bsSelectedNodeIds.size > 0 && (
                                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                        onClick={() => {
                                            const toHide = new Set<string>(
                                                bsVisibleGraphData.nodes
                                                    .filter((n: any) => !bsSelectedNodeIds.has(n.id))
                                                    .map((n: any) => n.id as string)
                                            );
                                            setBsHiddenNodeIds(prev => new Set([...prev, ...toHide]));
                                            setBsSelectedNodeIds(new Set());
                                            setBsContextMenu(null);
                                        }}>
                                        <Eye size={11} /> Show Only Selected
                                    </button>
                                )}
                                {bsHiddenNodeIds.size > 0 && (
                                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                        onClick={() => { setBsHiddenNodeIds(new Set()); setBsContextMenu(null); }}>
                                        <Eye size={11} /> Revert Hidden
                                    </button>
                                )}
                                {cbInfo && (
                                    <>
                                        <div className="h-px bg-white/10 my-0.5" />
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-orange-400 hover:bg-orange-900/20 hover:text-orange-300 flex items-center gap-2"
                                            onClick={() => {
                                                onRemoveEdge(cbInfo);
                                                setBsContextMenu(null);
                                            }}>
                                            <Trash2 size={11} /> Remove Edge
                                        </button>
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-cyan-400 hover:bg-cyan-900/20 hover:text-cyan-300 flex items-center gap-2"
                                            onClick={() => {
                                                onAddP2PEdge(cbInfo);
                                                setBsContextMenu(null);
                                            }}>
                                            <Plus size={11} /> Add P2P Edge
                                        </button>
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-blue-400 hover:bg-blue-900/20 hover:text-blue-300 flex items-center gap-2"
                                            onClick={() => {
                                                onTaskForEdge(cbInfo);
                                                setBsContextMenu(null);
                                            }}>
                                            <Link2 size={11} /> Task for Edge
                                        </button>
                                    </>
                                )}
                                <div className="h-px bg-white/10 my-0.5" />
                                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-500 hover:bg-white/5 hover:text-gray-400 flex items-center gap-2"
                                    onClick={() => setBsContextMenu(null)}>
                                    <X size={11} /> Cancel
                                </button>
                            </>
                        );
                    })()}
                </div>,
                document.body
            )}

            {/* Edge context menu */}
            {bsEdgeCtxMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: bsEdgeCtxMenu.y, left: bsEdgeCtxMenu.x, zIndex: 9999 }}
                    className="bg-[#0a0a0a] border border-cyan-500/30 rounded shadow-lg py-1 min-w-[160px]"
                >
                    {(() => {
                        const ed = bsFinalDisplayData.edges.find((e: Record<string, unknown>) => e.id === bsEdgeCtxMenu.edgeId);
                        if (ed?.data?.commandName) return (
                            <div className="px-3 py-1 text-[10px] font-mono text-cyan-500/60 border-b border-cyan-500/10 mb-0.5">
                                CMD: {ed.data.commandName}
                            </div>
                        );
                        return null;
                    })()}
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                        onClick={() => {
                            setBsHiddenNodeIds(prev => {
                                const edge = bsVisibleGraphData.edges.find((e: Record<string, unknown>) => e.id === bsEdgeCtxMenu.edgeId);
                                if (!edge) return prev;
                                const s = new Set(prev);
                                s.add(edge.source as string); s.add(edge.target as string);
                                return s;
                            });
                            setBsEdgeCtxMenu(null);
                        }}>
                        <EyeOff size={11} /> Hide Edge Nodes
                    </button>
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-gray-400 flex items-center gap-2"
                        onClick={() => setBsEdgeCtxMenu(null)}>
                        <X size={11} /> Cancel
                    </button>
                </div>,
                document.body
            )}

            {/* Pane context menu */}
            {bsPaneCtxMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: bsPaneCtxMenu.y, left: bsPaneCtxMenu.x, zIndex: 9999 }}
                    className="bg-[#0a0a0a] border border-cyan-500/30 rounded shadow-lg py-1 min-w-[160px]"
                >
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                        onClick={() => { setBsSelectedNodeIds(new Set()); setBsPaneCtxMenu(null); }}>
                        <CheckSquare size={11} /> Unselect All
                    </button>
                    {bsHiddenNodeIds.size > 0 && (
                        <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                            onClick={() => { setBsHiddenNodeIds(new Set()); setBsPaneCtxMenu(null); }}>
                            <Eye size={11} /> Revert All Hidden
                        </button>
                    )}
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-gray-400 flex items-center gap-2"
                        onClick={() => setBsPaneCtxMenu(null)}>
                        <X size={11} /> Cancel
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
}
