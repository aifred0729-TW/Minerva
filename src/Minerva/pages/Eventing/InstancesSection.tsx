import React, { useState, useMemo } from 'react';
import { useMutation, useSubscription } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { ChevronDown, ChevronRight, StopCircle, RotateCcw, RefreshCw, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    GET_EVENT_GROUP_INSTANCES,
    SUB_EVENT_GROUP_INSTANCES,
    SUB_EVENTSTEP_INSTANCES,
    CANCEL_EVENT_GROUP_INSTANCE,
    RETRY_EVENT_GROUP_INSTANCE,
} from '../../lib/api';

const StepRows = ({ instanceId }: { instanceId: number }) => {
    const [steps, setSteps] = useState<any[]>([]);
    useSubscription<any>(SUB_EVENTSTEP_INSTANCES, {
        variables: { eventgroupinstance_id: instanceId },
        onData: ({ data }: { data: any }) => {
            const batch: any[] = data.data?.eventstepinstance_stream ?? [];
            if (!batch.length) return;
            setSteps(prev => {
                const ids = new Set(prev.map(s => s.id));
                const news = batch.filter(s => !ids.has(s.id));
                return news.length
                    ? [...prev, ...news].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    : prev.map(s => {
                        const upd = batch.find(b => b.id === s.id);
                        return upd ? { ...s, ...upd } : s;
                    });
            });
        },
        onError: (err) => { console.error('[SUB_EVENTSTEP_INSTANCES] subscription error:', err); },
    });
    const statusColor: Record<string, string> = {
        success: 'text-green-400', error: 'text-red-400',
        processing: 'text-yellow-400', skipped: 'text-gray-600',
    };
    if (steps.length === 0) return (
        <div className="text-[10px] text-gray-600 font-mono px-6 py-2 animate-pulse">Loading steps...</div>
    );
    return (
        <div className="border-t border-white/5 bg-black/20">
            {steps.map(s => (
                <div key={s.id} className="flex items-start gap-3 px-6 py-2 border-b border-white/5 last:border-0">
                    <span className={cn('text-[10px] font-mono w-4 text-center shrink-0 mt-0.5', statusColor[s.status] ?? 'text-gray-500')}>
                        {s.order ?? '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-mono text-gray-300">{s.eventstep?.name ?? s.eventstep?.action}</span>
                            <span className={cn('text-[9px] font-mono uppercase', statusColor[s.status] ?? 'text-gray-500')}>{s.status}</span>
                        </div>
                        {s.stdout && (
                            <pre className="text-[10px] text-gray-400 mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">{s.stdout}</pre>
                        )}
                        {s.stderr && (
                            <pre className="text-[10px] text-red-400/80 mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">{s.stderr}</pre>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

const InstanceRow = ({ inst }: { inst: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [cancelInstance] = useMutation<any>(CANCEL_EVENT_GROUP_INSTANCE, {
        variables: { id: inst.id },
        onCompleted: () => snackActions.success('Instance cancelled'),
        onError: (e) => snackActions.error('Cancel failed: ' + e.message),
    });
    const [retryInstance] = useMutation<any>(RETRY_EVENT_GROUP_INSTANCE, {
        variables: { id: inst.id },
        onCompleted: () => snackActions.success('Instance retried'),
        onError: (e) => snackActions.error('Retry failed: ' + e.message),
    });
    const statusColor: Record<string, string> = {
        success: 'text-green-400 border-green-400/30', error: 'text-red-400 border-red-400/30',
        processing: 'text-yellow-400 border-yellow-400/30', cancelled: 'text-gray-500 border-gray-500/30',
    };
    const s = (inst.status ?? '').toLowerCase();
    const colorClass = Object.entries(statusColor).find(([k]) => s.includes(k))?.[1] ?? 'text-gray-400 border-white/15';
    const isRunning = s.includes('process');
    const isError = s.includes('error') || s.includes('cancel');

    return (
        <div className="border border-white/8 hover:border-signal/20 transition-all">
            <div className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-[11px] text-gray-600 w-10 shrink-0">#{inst.id}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-white font-bold truncate">
                            {inst.eventgroup?.name ?? `Instance ${inst.id}`}
                        </span>
                        <span className={cn('text-[9px] font-mono border px-1.5 py-0.5 rounded-sm', colorClass)}>
                            {inst.status?.toUpperCase()}
                        </span>
                        {inst.trigger && (
                            <span className="text-[9px] text-gray-500 font-mono border border-white/10 px-1.5 py-0.5 rounded-sm">{inst.trigger}</span>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                        {inst.operator?.username && <span className="mr-3">{inst.operator.username}</span>}
                        {inst.created_at && new Date(inst.created_at).toLocaleString()}
                        {inst.end_timestamp && <span className="ml-3 text-gray-700">→ {new Date(inst.end_timestamp).toLocaleString()}</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isRunning && (
                        <button onClick={() => cancelInstance()} title="Cancel"
                            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                            <StopCircle size={14} />
                        </button>
                    )}
                    {isError && (
                        <button onClick={() => retryInstance()} title="Retry"
                            className="p-1.5 text-gray-500 hover:text-signal transition-colors">
                            <RotateCcw size={14} />
                        </button>
                    )}
                    <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-signal transition-colors">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>
            </div>
            {expanded && <StepRows instanceId={inst.id} />}
        </div>
    );
};

export const InstancesSection = () => {
    const [instances, setInstances] = useState<any[]>([]);
    const [filterStatus, setFilterStatus] = useState('');

    const { loading, refetch } = useQuery<any>(GET_EVENT_GROUP_INSTANCES, {
        fetchPolicy: 'network-only',
        onCompleted: (d: any) => setInstances(d.eventgroupinstance ?? []),
    });

    useSubscription<any>(SUB_EVENT_GROUP_INSTANCES, {
        onData: ({ data }: { data: any }) => {
            const batch: any[] = data.data?.eventgroupinstance_stream ?? [];
            if (!batch.length) return;
            setInstances(prev => {
                const ids = new Set(prev.map(i => i.id));
                const news = batch.filter(i => !ids.has(i.id));
                return news.length
                    ? [...batch, ...prev].sort((a, b) => b.id - a.id)
                    : prev.map(p => {
                        const u = batch.find(b => b.id === p.id);
                        return u ? { ...p, ...u } : p;
                    });
            });
        },
        onError: (err) => { console.error('[SUB_EVENT_GROUP_INSTANCES] subscription error:', err); },
    });

    const filtered = useMemo(() =>
        filterStatus
            ? instances.filter(i => (i.status ?? '').toLowerCase().includes(filterStatus.toLowerCase()))
            : instances,
        [instances, filterStatus]
    );

    const statuses = useMemo(() => [...new Set(instances.map(i => i.status).filter(Boolean))], [instances]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="bg-void border border-ghost/30 rounded-lg px-3 py-1.5 text-sm text-signal focus:border-signal outline-none">
                    <option value="">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => refetch()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-ghost/30 text-ghost hover:text-signal hover:border-signal transition-colors rounded-sm">
                    <RefreshCw size={11} /> REFRESH
                </button>
                <span className="text-xs text-ghost font-mono ml-auto">{filtered.length} instance{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            {loading && instances.length === 0 && (
                <div className="flex items-center justify-center py-12 text-ghost animate-pulse font-mono text-sm">
                    LOADING...
                </div>
            )}
            {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-ghost">
                    <Activity size={36} className="opacity-30" />
                    <p className="font-mono text-sm">No instances found</p>
                </div>
            )}
            <div className="space-y-2">
                {filtered.map(inst => <InstanceRow key={inst.id} inst={inst} />)}
            </div>
        </div>
    );
};
