import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { usePageVisible } from '../../lib/usePageVisible';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';
import {
    Monitor, Hash, Terminal, Layers, RefreshCw,
} from 'lucide-react';
import type { CbRow } from '../../types/tasks';
import { GET_CALLBACKS, GET_TASK_BY_DISPLAY_ID } from '../../lib/api';
import { domainKey } from './helpers';
import { HostTree } from './HostTree';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';

export default function SingleTaskView() {
    const { displayId }          = useParams<{ displayId?: string }>();
    const navigate               = useNavigate();
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const pageVisible = usePageVisible();
    const initId                 = displayId ? parseInt(displayId, 10) : null;

    // Selections (selTask is also where the URL-derived task ends up)
    const [selHost, setSelHost]   = useState<string | null>(null);
    const [selTask, setSelTask]   = useState<Record<string, unknown> | null>(null);

    const { data: cbData, loading: cbLoading, refetch } = useQuery<any>(GET_CALLBACKS, {
        fetchPolicy: 'cache-and-network',
        pollInterval: pageVisible ? 15_000 : 0,
    });
    const callbacks: CbRow[] = useMemo(() => cbData?.callback ?? [], [cbData]);

    // Deep-link: observe a useQuery result directly. Lazy-query / onCompleted
    // wrappers were unreliable under Apollo v4's cache-and-network delivery on
    // a fresh tab — the right pane stayed empty even after the task arrived.
    const { data: taskData } = useQuery<any>(GET_TASK_BY_DISPLAY_ID, {
        variables: { display_id: initId ?? 0 },
        skip: !initId,
        fetchPolicy: 'network-only',
    });

    // Adopt the fetched task into selTask as soon as it arrives. Imperative
    // setState (not useMemo derivation) so the right pane definitely re-renders.
    useEffect(() => {
        const t = taskData?.task?.[0];
        if (!t) return;
        if ((selTask as any)?.display_id === t.display_id) return;
        setSelTask(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskData]);

    // Once both selTask and the callbacks list are available, derive the host
    // for the host tree / task list panes. Runs whenever either side updates so
    // late-loading callbacks still pick up the correct host.
    useEffect(() => {
        if (selHost) return;
        const cb = (selTask as any)?.callback;
        if (!cb || !callbacks.length) return;
        const cbRow = callbacks.find((c: CbRow) => c.display_id === cb.display_id);
        if (!cbRow) return;
        const dk   = domainKey(cbRow);
        const host = (cbRow.host || `C${cbRow.display_id}`).toUpperCase();
        setSelHost(`${dk}::${host}`);
    }, [selTask, callbacks, selHost]);

    const effectiveTask = selTask;
    const effectiveHost = selHost;

    const selCbs = useMemo<CbRow[]>(() => {
        if (!effectiveHost) return [];
        const [dk, host] = effectiveHost.split('::');
        return callbacks.filter(cb =>
            domainKey(cb) === dk &&
            (cb.host || `C${cb.display_id}`).toUpperCase() === host
        );
    }, [effectiveHost, callbacks]);

    const totalMachines = useMemo(() => {
        const s = new Set(callbacks.map(cb => `${domainKey(cb)}::${(cb.host||`C${cb.display_id}`).toUpperCase()}`));
        return s.size;
    }, [callbacks]);

    const handleHostSelect = (key: string) => {
        setSelHost(key); setSelTask(null);
        navigate('/task', { replace: true });
    };
    const handleTaskSelect = (t: Record<string, unknown>) => {
        setSelTask(t);
        navigate(`/task/${t.display_id}`, { replace: true });
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <div className={cn(
                'transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden',
                isSidebarCollapsed ? 'ml-16' : 'ml-64'
            )}>

                {/* ── Header ── */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Layers size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">TASK BROWSER</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                {totalMachines} MACHINE{totalMachines !== 1?'S':''} · {callbacks.length} SESSION{callbacks.length !== 1?'S':''}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => refetch()}
                        className="flex items-center gap-2 text-xs px-4 py-2 border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/40 font-mono transition-colors rounded">
                        <RefreshCw size={12}/> REFRESH
                    </button>
                </header>

                <div className="flex-1 flex min-h-0 overflow-hidden">

                    {/* ── LEFT: host tree 200px ── */}
                    <div className="w-[200px] shrink-0 flex flex-col min-h-0 border-r border-white/[0.05]"
                        style={{ background: '#080808' }}>
                        <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] flex items-center gap-1.5">
                            <Monitor size={12} style={{ color: '#777' }}/>
                            <span className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: '#888' }}>hosts</span>
                        </div>
                        {cbLoading && !callbacks.length ? (
                            <div className="flex-1 flex items-center justify-center font-mono text-[12px] animate-pulse" style={{ color: '#666' }}>loading…</div>
                        ) : (
                            <HostTree callbacks={callbacks} selectedKey={effectiveHost} onSelect={handleHostSelect}/>
                        )}
                    </div>

                    {/* ── MID: task list 300px ── */}
                    <div className="w-[300px] shrink-0 flex flex-col min-h-0 border-r border-white/[0.05]"
                        style={{ background: '#060606' }}>
                        <div className="shrink-0 px-3 py-2 border-b border-white/[0.08] flex items-center gap-1.5">
                            <Hash size={12} style={{ color: '#777' }}/>
                            <span className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: '#888' }}>tasks</span>
                            {effectiveHost && (
                                <span className="ml-auto font-mono text-[11px] font-bold truncate max-w-[120px]"
                                    style={{ color: '#00ffd1cc' }}>
                                    {effectiveHost.split('::')[1]}
                                </span>
                            )}
                        </div>
                        {selCbs.length ? (
                            <TaskList
                                sessionCbs={selCbs}
                                selectedId={((effectiveTask as any)?.display_id ?? null) as number | null}
                                initialId={initId}
                                onSelect={handleTaskSelect}
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: '#666' }}>
                                <Monitor size={24}/>
                                <p className="font-mono text-[12px]">select a host</p>
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT: detail ── */}
                    <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                        {effectiveTask ? (
                            <div key={(effectiveTask as any).id} className="mv-slide-in-right h-full">
                                <TaskDetail task={effectiveTask}/>
                            </div>
                        ) : (
                            <div className="mv-fade-in flex flex-col items-center justify-center h-full gap-3" style={{ color: '#666' }}>
                                <Terminal size={30}/>
                                <p className="font-mono text-[13px]">
                                    {selCbs.length ? 'select a task' : 'select a host'}
                                </p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
