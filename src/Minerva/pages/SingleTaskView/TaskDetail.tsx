import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery } from "../../lib/useQueryCompat";
import {
    Terminal, FileText, Database, Monitor, ExternalLink, Hash,
} from 'lucide-react';
import {
    decodeResponses,
    BrowserScriptOutput,
    StructuredResponseOutput,
    hasBuiltinStructuredRenderer,
    RawOutput,
    OutputModeToggle,
    type OutputMode,
} from '../../components/OutputRenderer';
import {
    STREAM_TASK_RESPONSES_BY_ID,
    GET_TASK_ARTIFACTS_BY_ID,
    GET_BROWSERSCRIPT,
} from '../../lib/api';
import {
    statusTier, TIER_COLOR, TIER_LABEL,
    Dot, CbBadge, MetaRow, SectionLabel,
    b64Decode, fmtTs, parseFirstIP,
} from './helpers';

export function TaskDetail({ task }: { task: any }) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'output'|'info'|'artifacts'>('output');
    const [outputMode, setOutputMode] = useState<OutputMode>('parsed');

    const [responses, setResponses] = useState<any[]>(() => task?.responses ?? []);
    const seededTaskId = useRef<number | null>(null);

    const [browserScriptFn,   setBrowserScriptFn]   = useState<Function | null>(null);
    const [browserScriptData, setBrowserScriptData] = useState<any | null>(null);

    const [fetchBrowserScript] = useLazyQuery<any>(GET_BROWSERSCRIPT, {
        fetchPolicy: 'network-only',
        onCompleted: (d: any) => {
            const scripts = d?.browserscript || [];
            if (!scripts.length) { setBrowserScriptFn(null); setBrowserScriptData(null); return; }
            try {
                // eslint-disable-next-line no-new-func
                const fn = Function(`"use strict";return(${scripts[0].script})`)();
                setBrowserScriptFn(() => fn);
            } catch { setBrowserScriptFn(null); setBrowserScriptData(null); }
        },
        onError: () => { setBrowserScriptFn(null); },
    });

    useEffect(() => {
        if (seededTaskId.current === task?.id) return;
        seededTaskId.current = task?.id ?? null;
        setResponses(task?.responses ?? []);
        setTab('output');
        setOutputMode('parsed');
        setBrowserScriptFn(null);
        setBrowserScriptData(null);
        if (task?.command?.id) fetchBrowserScript({ variables: { command_id: task.command.id } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id, task?.responses, task?.command?.id]);

    useEffect(() => {
        if (!browserScriptFn || !responses.length) { setBrowserScriptData(null); return; }
        try {
            const rawArr = responses.map((r: Record<string, unknown>) => b64Decode((r.response as string) ?? ''));
            const result = browserScriptFn(task, rawArr);
            setBrowserScriptData(
                result && typeof result === 'object' && Object.keys(result).length > 0 ? result : null
            );
        } catch { setBrowserScriptData(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [browserScriptFn, responses, task?.status, task?.comment]);

    useSubscription<any>(STREAM_TASK_RESPONSES_BY_ID, {
        variables: { task_id: task.id },
        skip: !task?.id,
        onData: ({ data }: { data: any } ) => {
            const batch: any[] = data.data?.response_stream ?? [];
            if (!batch.length) return;
            setResponses(prev => {
                const ids  = new Set(prev.map((r: Record<string, unknown>) => r.id));
                const news = batch.filter((r: Record<string, unknown>) => !ids.has(r.id));
                return news.length ? [...prev, ...news].sort((a, b) => a.id - b.id) : prev;
            });
        },
        onError: (err) => { console.error('[STREAM_TASK_RESPONSES_BY_ID] subscription error:', err); },
    });

    const { data: artData } = useQuery<any>(GET_TASK_ARTIFACTS_BY_ID, {
        variables: { task_id: task.id },
        skip: !task?.id,
        fetchPolicy: 'cache-and-network',
    });
    const artifacts: any[] = artData?.taskartifact ?? [];

    const decoded = useMemo(() => decodeResponses(responses), [responses]);
    const hasStructured = useMemo(() => hasBuiltinStructuredRenderer(decoded), [decoded]);

    const tags: any[] = task.tags ?? [];
    const cb            = task.callback;
    const tier          = statusTier(task.status);
    const color         = TIER_COLOR[tier];

    const TABS = [
        { key: 'output',    label: 'OUTPUT',    icon: Terminal  },
        { key: 'info',      label: 'DETAILS',   icon: FileText  },
        { key: 'artifacts', label: `ARTIFACTS${artifacts.length ? ` · ${artifacts.length}` : ''}`, icon: Database },
    ] as const;

    return (
        <div className="flex flex-col h-full min-h-0" style={{ background: '#050505' }}>
            {/* ── header ── */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/[0.06]"
                style={{ background: 'linear-gradient(180deg,#0d0d0d 0%,#080808 100%)' }}>
                <div className="flex items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[12px]" style={{ color: '#888' }}>T{task.display_id}</span>
                            <span className="font-mono text-[18px] font-bold text-white tracking-tight">{task.command_name}</span>
                            <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold" style={{ color }}>
                                <Dot tier={tier}/>
                                {TIER_LABEL[tier]}
                            </span>
                        </div>
                        {task.display_params && (
                            <div className="mt-2 font-mono text-[13px] break-all leading-relaxed line-clamp-2" style={{ color: '#999' }}>
                                {task.display_params}
                            </div>
                        )}
                    </div>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 shrink-0">
                            {tags.map((t: any) => (
                                <span key={t.id ?? t.tagtype?.id ?? t.tagtype?.name} className="font-mono text-[11px] px-2 py-1 rounded-sm border font-semibold"
                                    style={{ color: t.tagtype.color, borderColor: t.tagtype.color+'66', background: t.tagtype.color+'18' }}>
                                    {t.tagtype.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {cb && (
                    <div className="flex items-center gap-2 font-mono text-[12px]" style={{ color: '#888' }}>
                        <Monitor size={13} className="shrink-0" style={{ color: '#777' }}/>
                        <span style={{ color: '#bbb' }}>{cb.user}@</span>
                        <span className="font-bold" style={{ color: '#e0e0e0' }}>{cb.host}</span>
                        <span className="mx-1" style={{ color: '#444' }}>│</span>
                        <CbBadge id={cb.display_id}/>
                        <button onClick={() => navigate(`/console/${cb.display_id}`)}
                            className="flex items-center gap-1 transition-colors hover:text-[#00ffd1]"
                            style={{ color: '#00ffd188' }}>
                            console <ExternalLink size={10}/>
                        </button>
                    </div>
                )}
            </div>

            {/* ── tabs ── */}
            <div className="shrink-0 flex items-center border-b border-white/[0.06]"
                style={{ background: '#080808' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = tab === key;
                    return (
                        <button key={key} onClick={() => setTab(key as typeof tab)}
                            className="relative flex items-center gap-1.5 px-4 py-3 font-mono text-[12px] uppercase tracking-wider transition-colors"
                            style={{ color: active ? '#00ffd1' : '#777', fontWeight: active ? 700 : 500 }}>
                            <Icon size={10}/>
                            {label}
                            {active && (
                                <span className="mv-tab-active-bar absolute bottom-0 left-0 right-0 h-px" style={{ background: '#00ffd1' }}/>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── tab content ── */}
            <div key={tab} className="mv-fade-in flex-1 overflow-y-auto min-h-0">

                {tab === 'output' && (
                    <div className="flex flex-col h-full min-h-0">
                        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b"
                            style={{ borderColor: '#ffffff0a', background: '#080808' }}>
                            {task.comment && (
                                <div className="flex items-center gap-1.5 font-mono text-[11px] flex-1 truncate" style={{ color: '#888' }}>
                                    <FileText size={10} style={{ color: '#4488ff', flexShrink: 0 }}/>
                                    <span className="truncate">{task.comment}</span>
                                </div>
                            )}
                            {browserScriptData && outputMode === 'parsed' && (
                                <div className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-sm border"
                                    style={{ color: '#00ffd188', borderColor: '#00ffd122', background: '#00ffd108' }}
                                    title="Output rendered by command browser script">
                                    <Hash size={9}/> script
                                </div>
                            )}
                            <div className="ml-auto">
                                <OutputModeToggle mode={outputMode} onChange={setOutputMode}/>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 p-4">
                            {decoded.length === 0 ? (
                                <p className="font-mono text-[13px] animate-pulse" style={{ color: '#555' }}>waiting for output…</p>
                            ) : outputMode === 'raw' ? (
                                <RawOutput responses={decoded}/>
                            ) : (hasStructured || !browserScriptData) ? (
                                <StructuredResponseOutput responses={decoded}/>
                            ) : (
                                <BrowserScriptOutput bsd={browserScriptData}/>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'info' && (
                    <div className="p-4">
                        <MetaRow label="status"     value={<span style={{ color: TIER_COLOR[tier] }}>{(task.status ?? '').toUpperCase()}</span>}/>
                        <MetaRow label="operator"   value={task.operator?.username}/>
                        <MetaRow label="tasked from" value={task.tasking_location}/>
                        <MetaRow label="params"     value={task.original_params}/>
                        <MetaRow label="submitted"  value={fmtTs(task.status_timestamp_submitted)}/>
                        <MetaRow label="completed"  value={fmtTs(task.status_timestamp_processed)}/>
                        {cb && <>
                            <SectionLabel>callback</SectionLabel>
                            <MetaRow label="session"    value={<CbBadge id={cb.display_id}/>}/>
                            <MetaRow label="user"       value={cb.user}/>
                            <MetaRow label="host"       value={cb.host}/>
                            <MetaRow label="domain"     value={cb.domain}/>
                            <MetaRow label="ip"         value={parseFirstIP(cb.ip ?? '')}/>
                            <MetaRow label="integrity"  value={cb.integrity_level}/>
                        </>}
                    </div>
                )}

                {tab === 'artifacts' && (
                    <div className="p-4 space-y-2">
                        {!artifacts.length && (
                            <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: '#666' }}>
                                <Database size={24}/>
                                <p className="font-mono text-[12px]">NO ARTIFACTS</p>
                            </div>
                        )}
                        {artifacts.map((a: any) => (
                            <div key={a.id} className="px-3 py-2.5 border border-white/[0.05] space-y-1"
                                style={{ background: '#0a0a0a' }}>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-[12px] font-bold uppercase" style={{ color: '#999' }}>{a.base_artifact}</span>
                                    {a.host && <span className="font-mono text-[11px]" style={{ color: '#888' }}>{a.host}</span>}
                                    <span className="ml-auto font-mono text-[11px]" style={{ color: '#666' }}>{fmtTs(a.timestamp)}</span>
                                </div>
                                <p className="font-mono text-[13px] break-all" style={{ color: '#ccc' }}>{a.artifact_text}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
