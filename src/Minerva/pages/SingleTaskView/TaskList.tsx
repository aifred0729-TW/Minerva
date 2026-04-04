import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSubscription } from "@apollo/client/react";
import {
    Search, Terminal, X, Layers, Hash,
} from 'lucide-react';
import type { CbRow } from '../../types/tasks';
import { STREAM_CALLBACK_TASKS } from '../../lib/api';
import { statusTier, Dot, CbBadge, fmtHM } from './helpers';

// ─── TaskSubscriber (invisible subscription bridge) ───────────────────────────

function TaskSubscriber({ cbId, onBatch }: { cbId: number; onBatch: (id: number, b: any[]) => void }) {
    useSubscription<any>(STREAM_CALLBACK_TASKS, {
        variables: { callback_display_id: cbId },
        onData: ({ data }: { data: any } ) => {
            const b: any[] = data.data?.task_stream ?? [];
            if (b.length) onBatch(cbId, b);
        },
        onError: (err) => { console.error('[STREAM_CALLBACK_TASKS] subscription error:', err); },
    });
    return null;
}

// ─── TaskList ─────────────────────────────────────────────────────────────────

export function TaskList({ sessionCbs, selectedId, initialId, onSelect }: {
    sessionCbs: CbRow[];
    selectedId: number | null;
    initialId:  number | null;
    onSelect:   (t: Record<string, unknown>) => void;
}) {
    const [bySession, setBySession] = useState<Map<number, any[]>>(new Map());
    const [q, setQ]                 = useState('');
    const autoSel                   = useRef(false);
    const multi                     = sessionCbs.length > 1;

    const handleBatch = useCallback((cbId: number, batch: any[]) => {
        setBySession(prev => {
            const existing = prev.get(cbId) ?? [];
            const ids      = new Set(existing.map(t => t.id));
            const fresh    = batch.filter(t => !ids.has(t.id));
            const updated  = existing.map(t => { const u = batch.find(b => b.id === t.id); return u ? {...t,...u} : t; });
            const next     = [...updated, ...fresh];
            if (next.length === existing.length && !fresh.length) return prev;
            const m = new Map(prev); m.set(cbId, next); return m;
        });
    }, []);

    const all = useMemo(() => {
        const flat: any[] = [];
        for (const [cbId, tasks] of bySession)
            for (const t of tasks) flat.push({ ...t, _cbId: cbId });
        return flat.sort((a, b) => b.id - a.id);
    }, [bySession]);

    // auto-select from URL param
    useEffect(() => {
        if (autoSel.current || !initialId || !all.length) return;
        const m = all.find(t => t.display_id === initialId);
        if (m) { onSelect(m); autoSel.current = true; }
    }, [all, initialId, onSelect]);

    const filtered = useMemo(() => {
        const lq = q.trim().toLowerCase();
        if (!lq) return all;
        return all.filter(t =>
            (t.command_name    ?? '').toLowerCase().includes(lq) ||
            (t.display_params  ?? '').toLowerCase().includes(lq) ||
            String(t.display_id).includes(lq) ||
            (t.comment         ?? '').toLowerCase().includes(lq)
        );
    }, [all, q]);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* invisible subscribers */}
            {sessionCbs.map(cb => <TaskSubscriber key={cb.display_id} cbId={cb.display_id} onBatch={handleBatch}/>)}

            {/* search bar */}
            <div className="shrink-0 p-2 border-b border-white/[0.05]">
                <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2.5 pointer-events-none" style={{ color: '#777' }}/>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="filter tasks…"
                        className="w-full pl-7 pr-6 py-2 bg-[#0d0d0d] border border-[#2a2a2a] text-[#e0e0e0] font-mono text-[12px] focus:border-[#00ffd155] outline-none rounded-none placeholder:text-[#555]"/>
                    {q && <button onClick={() => setQ('')} className="absolute right-2 hover:text-[#ccc]" style={{ color: '#777' }}><X size={11}/></button>}
                </div>
            </div>

            {/* stats */}
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05]">
                <span className="font-mono text-[11px]" style={{ color: '#777' }}>{filtered.length}/{all.length}</span>
                {multi && <span className="flex items-center gap-1 font-mono text-[11px]" style={{ color: '#00ffd1aa' }}><Layers size={11}/>{sessionCbs.length} sessions</span>}
            </div>

            {/* list */}
            <div className="flex-1 overflow-y-auto">
                {!all.length && (
                    <div className="flex flex-col items-center justify-center gap-2 h-32" style={{ color: '#666' }}>
                        <Terminal size={20} className="animate-pulse"/>
                        <span className="font-mono text-[12px]">STREAMING…</span>
                    </div>
                )}
                {filtered.map((t, ti) => {
                    const tier = statusTier(t.status);
                    const isSel = t.display_id === selectedId;
                    return (
                        <button key={`${t.id}-${t._cbId}`} onClick={() => onSelect(t)}
                            style={{ ...(isSel ? { borderLeftColor: '#00ffd1', background: '#00ffd108' } : { borderLeftColor: 'transparent' }), animationDelay: `${Math.min(ti, 20) * 25}ms` }}
                            className="mv-fade-in-up w-full text-left px-3 py-2.5 border-b border-white/[0.04] border-l-2 hover:bg-white/[0.03] transition-colors">
                            <div className="flex items-center gap-2">
                                <Dot tier={tier}/>
                                <span className="font-mono text-[11px] shrink-0" style={{ color: '#888' }}>T{t.display_id}</span>
                                <span className="font-mono text-[14px] font-bold truncate flex-1"
                                    style={{ color: isSel ? '#fff' : '#e0e0e0' }}>
                                    {t.command_name}
                                </span>
                                {multi && <CbBadge id={t._cbId}/>}
                            </div>
                            {t.display_params && (
                                <div className="mt-1 ml-4 font-mono text-[12px] truncate" style={{ color: '#999' }}>{t.display_params}</div>
                            )}
                            <div className="mt-1 ml-4 flex items-center gap-3">
                                {t.operator?.username && <span className="font-mono text-[11px]" style={{ color: '#666' }}>{t.operator.username}</span>}
                                <span className="font-mono text-[11px]" style={{ color: '#666' }}>{fmtHM(t.timestamp)}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
