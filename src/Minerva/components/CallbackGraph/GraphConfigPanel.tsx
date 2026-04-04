import React from 'react';
import {
    ArrowLeftRight, ArrowUpDown, Wifi, RefreshCw,
    Zap, Monitor, ChevronDown, CheckSquare, Square,
    Camera, FileImage,
} from 'lucide-react';

export interface GraphConfigPanelProps {
    layoutDir: 'LR' | 'TB';
    setLayoutDir: (v: 'LR' | 'TB') => void;
    showAllEdges: boolean;
    setShowAllEdges: (v: boolean) => void;
    packetFlowView: boolean;
    setPacketFlowView: (fn: (prev: boolean) => boolean) => void;
    mergeByHost: boolean;
    setMergeByHost: (fn: (prev: boolean) => boolean) => void;
    groupBy: string;
    setGroupBy: (v: string) => void;
    nodeLabels: string[];
    setNodeLabels: (fn: (prev: string[]) => string[]) => void;
    onDownloadPNG: () => void;
    onDownloadSVG: () => void;
}

export function GraphConfigPanel({
    layoutDir, setLayoutDir,
    showAllEdges, setShowAllEdges,
    packetFlowView, setPacketFlowView,
    mergeByHost, setMergeByHost,
    groupBy, setGroupBy,
    nodeLabels, setNodeLabels,
    onDownloadPNG, onDownloadSVG,
}: GraphConfigPanelProps) {
    return (
        <div className="bg-black/95 border border-signal/40 rounded p-3 w-64 flex flex-col gap-3 backdrop-blur-xl shadow-xl shadow-black/60 text-xs font-mono">
            <div className="text-signal font-bold tracking-widest border-b border-signal/20 pb-2">GRAPH_CONFIG</div>

            {/* Layout Direction */}
            <div className="flex flex-col gap-1">
                <span className="text-gray-400 text-[11px]">LAYOUT_DIRECTION</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setLayoutDir('LR')}
                        className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${layoutDir === 'LR' ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                    >
                        <ArrowLeftRight size={12} /> LR
                    </button>
                    <button
                        onClick={() => setLayoutDir('TB')}
                        className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${layoutDir === 'TB' ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                    >
                        <ArrowUpDown size={12} /> TB
                    </button>
                </div>
            </div>

            {/* Edge Visibility */}
            <div className="flex flex-col gap-1">
                <span className="text-gray-400 text-[11px]">EDGE_VISIBILITY</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowAllEdges(false)}
                        className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${!showAllEdges ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                    >
                        <Wifi size={12} /> ACTIVE
                    </button>
                    <button
                        onClick={() => setShowAllEdges(true)}
                        className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${showAllEdges ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                    >
                        <RefreshCw size={12} /> ALL
                    </button>
                </div>
            </div>

            {/* Packet Flow View */}
            <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[11px]">PACKET_FLOW_VIEW</span>
                <button
                    onClick={() => setPacketFlowView(p => !p)}
                    className={`flex items-center gap-1 px-3 py-1.5 border rounded ${packetFlowView ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                >
                    <Zap size={12} />
                    {packetFlowView ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Merge By Host */}
            <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[11px]">MERGE_BY_HOST</span>
                <button
                    onClick={() => setMergeByHost(p => !p)}
                    className={`flex items-center gap-1 px-3 py-1.5 border rounded ${mergeByHost ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                >
                    <Monitor size={12} />
                    {mergeByHost ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Group By */}
            <div className="flex flex-col gap-1">
                <span className="text-gray-400 text-[11px]">GROUP_BY</span>
                <div className="relative">
                    <select
                        value={groupBy}
                        onChange={e => setGroupBy(e.target.value)}
                        className="w-full bg-black border border-signal/30 text-signal text-xs font-mono px-2 py-1.5 rounded appearance-none pr-6 focus:outline-none focus:border-signal/60"
                    >
                        {['None','host','user','ip','domain','os','process_name'].map(v => (
                            <option key={v} value={v}>{v.toUpperCase()}</option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-signal/60 pointer-events-none" />
                </div>
            </div>

            {/* Node Labels */}
            <div className="flex flex-col gap-1">
                <span className="text-gray-400 text-[11px]">NODE_LABELS</span>
                <div className="flex flex-wrap gap-1">
                    {['host','ip','display_id','user','domain','os','pid','description','architecture'].map(lbl => {
                        const active = nodeLabels.includes(lbl);
                        return (
                            <button
                                key={lbl}
                                onClick={() => setNodeLabels(prev => active ? prev.filter(x => x !== lbl) : [...prev, lbl])}
                                className={`flex items-center gap-1 px-2 py-1 border rounded text-[10px] ${active ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-600 hover:border-signal/30 hover:text-signal/50'}`}
                            >
                                {active ? <CheckSquare size={10} /> : <Square size={10} />}
                                {lbl}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Download */}
            <div className="border-t border-signal/10 pt-2 flex flex-col gap-1">
                <button
                    onClick={onDownloadPNG}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black border border-white/10 text-gray-400 hover:border-signal/40 hover:text-signal rounded text-[11px] font-mono transition-colors"
                >
                    <Camera size={12} /> DOWNLOAD PNG
                </button>
                <button
                    onClick={onDownloadSVG}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-400 rounded text-[11px] font-mono transition-colors"
                >
                    <FileImage size={12} /> DOWNLOAD SVG
                </button>
            </div>
        </div>
    );
}
