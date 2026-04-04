import React, { useState, useMemo } from 'react';
import {
    ChevronRight, ChevronDown, Globe, Network, Monitor,
} from 'lucide-react';
import type { CbRow } from '../../types/tasks';
import { buildTree, isDomainKey, parseFirstIP } from './helpers';

export function HostTree({ callbacks, selectedKey, onSelect }: {
    callbacks: CbRow[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
}) {
    const tree = useMemo(() => buildTree(callbacks), [callbacks]);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggle = (k: string) => setCollapsed(prev => {
        const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
    });

    if (tree.size === 0) return (
        <div className="flex-1 flex items-center justify-center text-[#777] font-mono text-[12px]">NO HOSTS</div>
    );

    return (
        <div className="flex-1 overflow-y-auto">
            {[...tree.entries()].map(([dk, hm]) => {
                const isOpen = !collapsed.has(dk);
                return (
                    <div key={dk}>
                        <button onClick={() => toggle(dk)}
                            className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-white/[0.04] transition-colors">
                            <span className="text-[#777] shrink-0">
                                {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                            </span>
                            {isDomainKey(dk)
                                ? <Globe size={11} className="shrink-0" style={{ color: '#4488ff' }}/>
                                : <Network size={11} className="shrink-0" style={{ color: '#00cc80' }}/>}
                            <span className="font-mono text-[11px] text-[#aaa] uppercase tracking-wider truncate flex-1 text-left font-semibold">{dk}</span>
                            <span className="font-mono text-[11px] text-[#666] shrink-0">{[...hm.values()].length}</span>
                        </button>

                        {isOpen && [...hm.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([host, cbs], hi) => {
                            const key    = `${dk}::${host}`;
                            const isSel  = selectedKey === key;
                            const active = cbs.some(c => c.active);
                            return (
                                <button key={host} onClick={() => onSelect(key)}
                                    style={{ ...( isSel ? { borderLeftColor: '#00ffd1', background: '#00ffd108' } : { borderLeftColor: 'transparent' }), animationDelay: `${hi * 30}ms` }}
                                    className="mv-slide-in-left w-full flex items-center gap-2 pl-6 pr-3 py-2 border-l-2 transition-colors hover:bg-white/[0.03] text-left">
                                    <Monitor size={13} className="shrink-0" style={{ color: '#777' }}/>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-[13px] font-bold truncate leading-tight"
                                            style={{ color: isSel ? '#00ffd1' : '#e0e0e0' }}>
                                            {host}
                                        </div>
                                        <div className="font-mono text-[11px] truncate mt-0.5" style={{ color: '#888' }}>
                                            {cbs[0]?.user} · {parseFirstIP(cbs[0]?.ip ?? '')}
                                        </div>
                                    </div>
                                    {cbs.length > 1
                                        ? <span className="font-mono text-[11px] border px-1.5 py-0.5 rounded-sm shrink-0" style={{ color: '#aaa', borderColor: '#555' }}>{cbs.length}</span>
                                        : <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#00ff9d' : '#333', flexShrink: 0, boxShadow: active ? '0 0 5px #00ff9d99' : undefined, display: 'inline-block' }}/>}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
