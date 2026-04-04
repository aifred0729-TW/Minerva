import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Folder,
    Code,
    Copy,
    Database,
    Eye,
    X,
    Box,
    Skull,
    Wifi,
    List,
    Archive,
    Hash,
    Key,
    Network,
    ClipboardCopy as Clipboard,
}from 'lucide-react';
import { ReactFlow, Background, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-monokai';
import { OutputPanel, ACCENT, AMBER } from './core';
import { fileDownloadUrl } from '../../lib/urls';
import { getErrorMessage } from '../../lib/utils';

const GRAPH_AUTO_HIDE_THRESHOLD = 50;
const GRAPH_INTERACTIVE_MAX_NODES = 200;

interface GraphNode { id: string; label?: string; color?: string; img?: string; overlay_icon?: string; group?: string }
interface GraphEdge { source: string; target: string; label?: string; color?: string }

const GRAPH_ICON: Record<string, React.FC<{ size: number; color: string }>> = {
    group:     ({ size, color }) => <Folder size={size} color={color}/>,
    computer:  ({ size, color }) => <Box size={size} color={color}/>,
    user:      ({ size, color }) => <Skull size={size} color={color}/>,
    lan:       ({ size, color }) => <Wifi size={size} color={color}/>,
    language:  ({ size, color }) => <Code size={size} color={color}/>,
    list:      ({ size, color }) => <List size={size} color={color}/>,
    container: ({ size, color }) => <Archive size={size} color={color}/>,
    help:      ({ size, color }) => <Hash size={size} color={color}/>,
    diamond:   ({ size, color }) => <Key size={size} color={color}/>,
    skull:     ({ size, color }) => <Skull size={size} color={color}/>,
};

/** Simple layered graph layout (Sugiyama-style) */
function dagreLayout(nodes: GraphNode[], edges: GraphEdge[], rankDir: string) {
    const horizontal = rankDir === 'LR' || rankDir === 'RL';
    const nodeW = 140, nodeH = 56, gapX = 36, gapY = 46;
    // build adjacency
    const adj: Record<string, string[]> = {};
    const indeg: Record<string, number> = {};
    nodes.forEach(n => { adj[n.id] = []; indeg[n.id] = 0; });
    edges.forEach(e => {
        if (adj[e.source]) adj[e.source].push(e.target);
        if (indeg[e.target] !== undefined) indeg[e.target]++;
    });
    // topological sort → assign ranks
    const queue: string[] = [];
    const rank: Record<string, number> = {};
    nodes.forEach(n => { if (!indeg[n.id]) queue.push(n.id); });
    let head = 0;
    while (head < queue.length) {
        const cur = queue[head++];
        (adj[cur] || []).forEach(t => {
            rank[t] = Math.max(rank[t] || 0, (rank[cur] || 0) + 1);
            indeg[t]--;
            if (indeg[t] === 0) queue.push(t);
        });
    }
    // assign unlinked nodes
    nodes.forEach(n => { if (rank[n.id] === undefined) rank[n.id] = 0; });
    // group by rank
    const layers: Record<number, string[]> = {};
    let maxRank = 0;
    nodes.forEach(n => {
        const r = rank[n.id];
        maxRank = Math.max(maxRank, r);
        if (!layers[r]) layers[r] = [];
        layers[r].push(n.id);
    });
    // position
    const pos: Record<string, { x: number; y: number }> = {};
    for (let r = 0; r <= maxRank; r++) {
        const ids = layers[r] || [];
        ids.forEach((id, i) => {
            if (horizontal) {
                pos[id] = { x: r * (nodeW + gapX) + nodeW / 2 + 20, y: i * (nodeH + gapY) + nodeH / 2 + 20 };
            } else {
                pos[id] = { x: i * (nodeW + gapX) + nodeW / 2 + 20, y: r * (nodeH + gapY) + nodeH / 2 + 20 };
            }
        });
    }
    const maxCols = Object.values(layers).reduce((m, l) => Math.max(m, l.length), 0);
    const totalW = horizontal ? (maxRank + 1) * (nodeW + gapX) + 40 : maxCols * (nodeW + gapX) + 40;
    const totalH = horizontal ? maxCols * (nodeH + gapY) + 40 : (maxRank + 1) * (nodeH + gapY) + 40;
    return { pos, width: totalW, height: totalH, nodeW, nodeH };
}

export function GraphPanel({ nodes, edges, rankDir = 'LR' }: { nodes: GraphNode[]; edges: GraphEdge[]; rankDir?: string }) {
    const [show, setShow] = useState(nodes.length < GRAPH_AUTO_HIDE_THRESHOLD);
    const [isInteractive, setIsInteractive] = useState(false);
    const { pos, width, height, nodeW, nodeH } = useMemo(() => dagreLayout(nodes, edges, rankDir), [nodes, edges, rankDir]);
    // Context menu state
    const [graphCtx, setGraphCtx] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
    const graphCtxRef = useRef<HTMLDivElement>(null);
    const [viewAllNode, setViewAllNode] = useState<GraphNode | null>(null);

    useEffect(() => {
        if (!graphCtx) return;
        const handler = (e: MouseEvent) => {
            if (graphCtxRef.current && !graphCtxRef.current.contains(e.target as Node)) setGraphCtx(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [graphCtx]);

    return (
        <OutputPanel icon={<Network size={11}/>} label="GRAPH" count={nodes.length}
            toolbar={
                <button onClick={() => setIsInteractive(!isInteractive)}
                    className="px-2 py-0.5 text-[9px] font-mono rounded transition-colors"
                    style={{
                        background: isInteractive ? `${ACCENT}30` : 'transparent',
                        color: isInteractive ? ACCENT : '#888',
                        border: `1px solid ${isInteractive ? ACCENT : '#444'}`,
                    }}>
                    {isInteractive ? 'INTERACTIVE' : 'STATIC'}
                </button>
            }>
            {!show && nodes.length >= GRAPH_AUTO_HIDE_THRESHOLD && (
                <button onClick={() => setShow(true)}
                    className="font-mono text-[10px] px-3 py-1.5 rounded-sm border transition-colors hover:opacity-80"
                    style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}10` }}>
                    Show {nodes.length} nodes (large graph)
                </button>
            )}
            {show && isInteractive && nodes.length < GRAPH_INTERACTIVE_MAX_NODES && (
                <InteractiveGraphFlow nodes={nodes} edges={edges} />
            )}
            {show && !isInteractive && (
                <div className="border border-white/10 rounded overflow-auto" style={{ maxHeight: 500 }}>
                    <svg width={width} height={height} className="block">
                        <defs>
                            <marker id="gp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                <path d="M0,0 L0,6 L6,3 z" fill={`${ACCENT}90`}/>
                            </marker>
                        </defs>
                        {/* edges */}
                        {edges.map((e, i) => {
                            const s = pos[e.source], t = pos[e.target];
                            if (!s || !t) return null;
                            return (
                                <g key={`e${i}`}>
                                    <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                                        stroke={e.color || `${ACCENT}40`} strokeWidth="1.5" markerEnd="url(#gp-arrow)"/>
                                    {e.label && (
                                        <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 4}
                                            fill="#888" fontSize="8" textAnchor="middle" fontFamily="monospace">{e.label}</text>
                                    )}
                                </g>
                            );
                        })}
                        {/* nodes */}
                        {nodes.map(n => {
                            const p = pos[n.id];
                            if (!p) return null;
                            const fill = n.color || '#00ffd115';
                            const stroke = n.color || `${ACCENT}50`;
                            const IconComp = n.img ? null : GRAPH_ICON[n.overlay_icon || n.group || ''];
                            return (
                                <g key={n.id} style={{ cursor: 'context-menu' }}
                                    onContextMenu={(e) => { e.preventDefault(); setGraphCtx({ x: e.clientX, y: e.clientY, node: n }); }}>
                                    <rect x={p.x - nodeW / 2} y={p.y - nodeH / 2} width={nodeW} height={nodeH}
                                        rx="4" fill={fill} stroke={stroke} strokeWidth="1"/>
                                    {n.img && (
                                        <image href={n.img} x={p.x - 10} y={p.y - nodeH / 2 + 4} width={20} height={20}/>
                                    )}
                                    {IconComp && (
                                        <foreignObject x={p.x - 8} y={p.y - nodeH / 2 + 4} width={16} height={16}>
                                            <IconComp size={14} color={n.color || ACCENT}/>
                                        </foreignObject>
                                    )}
                                    <text x={p.x} y={n.img || IconComp ? p.y + 8 : p.y + 2}
                                        fill="#e0e0e0" fontSize="9" textAnchor="middle" dominantBaseline="middle"
                                        fontFamily="monospace">
                                        {(n.label || n.id).slice(0, 20)}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            )}
            {/* #6 — Graph node context menu */}
            {graphCtx && (
                <div ref={graphCtxRef}
                    className="fixed z-[9999] min-w-[140px] shadow-2xl border rounded-sm overflow-hidden"
                    style={{ left: graphCtx.x, top: graphCtx.y, background: '#0d0d0d', borderColor: '#ffffff20' }}>
                    <button onClick={() => { setViewAllNode(graphCtx.node); setGraphCtx(null); }}
                        className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: ACCENT }}>
                        <Eye size={10}/> View All Data
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(graphCtx.node, null, 2)); setGraphCtx(null); }}
                        className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: '#ccc' }}>
                        <Copy size={10}/> Copy Node JSON
                    </button>
                </div>
            )}
            {/* #6 — View All Data modal */}
            {viewAllNode && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.75)' }}
                    onClick={() => setViewAllNode(null)}>
                    <div className="rounded-sm overflow-hidden shadow-2xl max-w-lg w-full max-h-[70vh] flex flex-col"
                        style={{ background: '#0a0a0a', border: `1px solid ${ACCENT}30` }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                            style={{ borderColor: `${ACCENT}15`, background: `${ACCENT}06` }}>
                            <span className="font-mono text-[11px]" style={{ color: ACCENT }}>
                                NODE DATA — {viewAllNode.label || viewAllNode.id}
                            </span>
                            <button onClick={() => setViewAllNode(null)} className="text-gray-500 hover:text-white transition-colors p-0.5"><X size={14}/></button>
                        </div>
                        <div className="overflow-auto p-4 flex-1">
                            <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#ccc' }}>
                                {JSON.stringify(viewAllNode, null, 2)}
                            </pre>
                        </div>
                        <div className="flex justify-end gap-2 px-4 py-2 border-t" style={{ borderColor: '#ffffff10' }}>
                            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(viewAllNode, null, 2)); }}
                                className="px-3 py-1 text-[10px] font-mono border transition-colors hover:opacity-80"
                                style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}10` }}>
                                <Copy size={10} className="inline mr-1"/> Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </OutputPanel>
    );
}

// ─── InteractiveGraphFlow — ReactFlow-powered graph visualization ─────────────

function InteractiveGraphFlow({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
    const rfNodes = useMemo(() =>
        nodes.map(n => ({
            id: n.id,
            data: {
                label: n.label || n.id,
                color: n.color || ACCENT,
                icon: n.overlay_icon || n.group,
                img: n.img,
            },
            position: { x: Math.random() * 400, y: Math.random() * 400 },
        })), [nodes]);

    const rfEdges = useMemo(() =>
        edges.map((e, i) => ({
            id: `${e.source}-${e.target}-${i}`,
            source: e.source,
            target: e.target,
            label: e.label,
            style: { stroke: e.color || `${ACCENT}60` },
        })), [edges]);

    return (
        <div style={{ width: '100%', height: 500 }}>
            <ReactFlowProvider>
                <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
                    <Background color="#ffffff10" gap={16} />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}

// ─── DatabasePanel (#1) — SQLite viewer via sql.js ────────────────────────────

export function DatabasePanel({ agentFileId, filename }: { agentFileId: string; filename?: string }) {
    const [db, setDb] = useState<IDBDatabase | null>(null);
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSql] = useState('');
    const [results, setResults] = useState<{ columns: string[]; values: any[][] } | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const initSqlJs = (await import('sql.js')).default;
                const SQL = await initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
                const resp = await fetch(fileDownloadUrl(agentFileId));
                const buf = await resp.arrayBuffer();
                const database = new SQL.Database(new Uint8Array(buf));
                if (cancelled) return;
                setDb(database);
                // list tables
                const res = database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
                if (res.length > 0) setTables(res[0].values.map((r: any[]) => String(r[0])));
                setLoading(false);
            } catch (e: unknown) {
                if (!cancelled) {
                    setError(getErrorMessage(e) || 'Failed to load database');
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [agentFileId]);

    const runQuery = useCallback(() => {
        if (!db || !sql.trim()) return;
        try {
            const res = (db as any).exec(sql);
            if (res.length > 0) {
                setResults(res[0]);
                setError('');
            } else {
                setResults(null);
                setError('Query returned no results');
            }
        } catch (e: unknown) {
            setError(getErrorMessage(e) || 'Query error');
            setResults(null);
        }
    }, [db, sql]);

    const exportCsv = useCallback(() => {
        if (!results) return;
        const esc = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
        const csv = [results.columns.join(','), ...results.values.map(row => row.map(c => esc(String(c ?? ''))).join(','))].join('\n');
        navigator.clipboard.writeText(csv);
    }, [results]);

    return (
        <OutputPanel icon={<Database size={11}/>} label="DATABASE" accent={AMBER}>
            {loading && <div className="font-mono text-[10px]" style={{ color: '#555' }}>Loading database…</div>}
            {error && !loading && <div className="font-mono text-[10px]" style={{ color: '#f87171' }}>{error}</div>}
            {!loading && db && (
                <div className="space-y-3">
                    {/* Table list */}
                    <div className="flex flex-wrap gap-1">
                        {tables.map(t => (
                            <button key={t} onClick={() => { setSql(`SELECT * FROM "${t}" LIMIT 100`); }}
                                className="px-2 py-0.5 font-mono text-[10px] rounded-sm border transition-colors hover:opacity-80"
                                style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}08` }}>
                                {t}
                            </button>
                        ))}
                    </div>
                    {/* SQL editor */}
                    <div className="flex gap-2">
                        <input value={sql} onChange={e => setSql(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') runQuery(); }}
                            placeholder="SELECT * FROM ..."
                            className="flex-1 px-2 py-1 font-mono text-[11px] rounded-sm border"
                            style={{ background: '#0d0d0d', color: '#ccc', borderColor: '#ffffff15' }}/>
                        <button onClick={runQuery}
                            className="px-3 py-1 font-mono text-[10px] rounded-sm border transition-colors"
                            style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}10` }}>
                            Run
                        </button>
                        {results && (
                            <button onClick={exportCsv} title="Copy CSV"
                                className="px-2 py-1 font-mono text-[10px] rounded-sm border transition-colors"
                                style={{ color: '#888', borderColor: '#ffffff15', background: '#ffffff08' }}>
                                <Clipboard size={10}/>
                            </button>
                        )}
                    </div>
                    {/* Results table */}
                    {results && (
                        <div className="overflow-auto border border-white/10 rounded-sm" style={{ maxHeight: 400 }}>
                            <table className="w-full text-left font-mono text-[10px]">
                                <thead>
                                    <tr style={{ background: '#ffffff06' }}>
                                        {results.columns.map(c => (
                                            <th key={c} className="px-2 py-1.5 whitespace-nowrap" style={{ color: `${ACCENT}90`, borderBottom: '1px solid #ffffff10' }}>{c}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.values.map((row, ri) => (
                                        <tr key={ri} className="hover:bg-white/[0.02]">
                                            {row.map((cell, ci) => (
                                                <td key={ci} className="px-2 py-1 whitespace-nowrap" style={{ color: '#aaa', borderBottom: '1px solid #ffffff06' }}>{String(cell ?? '')}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </OutputPanel>
    );
}

// ─── JsonPanel ────────────────────────────────────────────────────────────────

