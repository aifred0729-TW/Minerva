/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Task, TaskResponse } from '../../types/tasks';
import type { ContextMenuState } from '../../types/console';
import type { MythicBrowserScriptData, MythicTableDef } from '../../types/output';
import { useSubscription, useMutation, useLazyQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    Bug,
    CheckCircle,
    ChevronRight,
    ClipboardCopy,
    Copy,
    ExternalLink,
    Eye,
    FileDown,
    Image,
    Key,
    LayoutList,
    Lock,
    MessageSquare,
    Network,
    PlayCircle,
    RotateCcw,
    Search,
    Skull,
    SlidersHorizontal,
    Tag,
    Unlock,
    Wifi,
    XCircle,
}from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import {
    CREATE_TASK_MUTATION, GET_ALL_TASK_RESPONSES, GET_BROWSERSCRIPT,
    GET_KILL_COMMAND, GET_RESPONSES_ALL_SEARCH, GET_RESPONSES_PAGINATED,
    REISSUE_TASK_HANDLER_MUTATION, REISSUE_TASK_MUTATION,
    STREAM_SUBTASKS, STREAM_TASK_RESPONSES,
} from '../../lib/api';
import { TaskOpsecDialog } from '../../components/TaskOpsecDialog';
import { TaskTokenDialog } from '../../components/TaskTokenDialog';
import { ViewEditTagsDialog } from '../../components/MythicTag';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { MythicDialog } from '../../components/MythicDialog';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { operatorSettingDefaults } from '../../lib/state';
import { snackActions } from '../../lib/snackbar';
import { useGetMythicSetting } from '../../components/MythicSavedUserSetting';
import {
    MythicTable, TerminalPanel, ProcessPanel,
    FilesPanel, DownloadPanel, ScreenshotPanel,
} from '../../components/OutputRenderer';
import { parseIP, normalizeUnixPath, filterBrowserScriptOutput } from './utils';
import { ContextMenu } from './ContextMenu';
import { TaskCommentModal, TaskParamsModal, TaskStdoutStderrModal } from './modals';
import { MimikatzBlock } from './MimikatzBlock';
import { InteractiveTaskBlock, TaskCredentialsPanel } from './InteractiveTaskBlock';

export const SubTaskBlock = ({ parentTaskId, depth = 0, callbackHost, scrollRoot }: {
    parentTaskId: number;
    depth?: number;
    callbackHost?: string;
    scrollRoot?: React.RefObject<HTMLDivElement>;
}) => {
    const [subTaskMap, setSubTaskMap] = useState<Map<number, any>>(new Map());
    useSubscription(STREAM_SUBTASKS, {
        variables: { parent_task_id: parentTaskId },
        onData: ({ data: d }: { data: { data: Record<string, unknown> } }) => {
            const incoming: Task[] = (d?.data?.task_stream as Task[]) || [];
            setSubTaskMap(prev => {
                const next = new Map(prev);
                incoming.forEach((t: Task) => next.set(t.id, { ...(next.get(t.id) || {}), ...t }));
                return next;
            });
        },
    });
    const subTasks = useMemo(() => [...subTaskMap.values()].sort((a, b) => a.id - b.id), [subTaskMap]);
    if (subTasks.length === 0) return null;
    const indent = depth * 16;
    return (
        <div style={{ marginLeft: indent + 8 }} className="mt-2 border-l border-signal/20 pl-3 space-y-2">
            {subTasks.map((sub: Task) => {
                const subStatus = (sub.status || '').toLowerCase();
                let subStatusColor = 'text-yellow-500';
                let subBorderColor = 'border-yellow-500/30';
                if (subStatus.includes('error')) { subStatusColor = 'text-red-500'; subBorderColor = 'border-red-500/30'; }
                else if (subStatus === 'completed' || subStatus === 'success') { subStatusColor = 'text-signal'; subBorderColor = 'border-signal/30'; }
                const responses = sub.responses || [];
                return (
                    <div key={sub.id} className={cn('border-l-2 pl-3 py-1 bg-white/3 rounded-r', subBorderColor)}>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 mb-1">
                            <span className="text-blue-400/70">{sub.operator?.username || '?'}</span>
                            <span className="mx-1">|</span>
                            <span>SUB #{sub.display_id}</span>
                            {sub.subtask_group_name && (
                                <span className="text-cyan-500/60 text-[9px] font-mono" title="Sub-task group">[{sub.subtask_group_name}]</span>
                            )}
                            {sub.comment && (
                                <span className="text-yellow-300/60 italic truncate max-w-[180px]" title={sub.comment}>💬 {sub.comment}</span>
                            )}
                        </div>
                        <div className="font-mono text-xs text-white font-bold mb-1 flex items-start gap-1.5">
                            <span className="text-signal/70 shrink-0">↳</span>
                            <span className="text-yellow-200/90">{sub.command_name}</span>
                            <span className="text-gray-400">{sub.display_params}</span>
                        </div>
                        <div className={cn('text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5', subStatusColor)}>
                            {subStatus}
                            {subStatus !== 'completed' && subStatus !== 'success' && !subStatus.includes('error') && (
                                <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                            )}
                        </div>
                        {responses.length > 0 && (
                            <div className="font-mono text-xs text-gray-300 whitespace-pre-wrap break-words bg-black/30 p-2 rounded border border-white/5 text-[11px]">
                                {responses.map((r: TaskResponse) => b64DecodeUnicode(r.response || '')).join('')}
                            </div>
                        )}
                        <SubTaskBlock parentTaskId={sub.id} depth={depth + 1} callbackHost={callbackHost} scrollRoot={scrollRoot} />
                    </div>
                );
            })}
        </div>
    );
};

export const TaskBlock = ({ task, callbackHost, onFileAction, scrollRoot, onReveal, myUsername, collapseAllEpoch, expandAllEpoch, defaultCollapsed }: {
    task: Task;
    callbackHost?: string;
    onFileAction?: (action: string, path: string, name: string, isDir: boolean) => void;
    scrollRoot?: React.RefObject<HTMLDivElement>;
    onReveal?: () => void;
    myUsername?: string;
    collapseAllEpoch?: number;
    expandAllEpoch?: number;
    defaultCollapsed?: boolean;
}) => {
    const navigate = useNavigate();
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
    const [showSearch, setShowSearch] = useState(false);
    const [expandedScreenshot, setExpandedScreenshot] = useState<{src:string;alt:string}|null>(null);
    const [searchText, setSearchText] = useState('');
    const [panelContent, setPanelContent] = useState<React.ReactNode | null>(null);
    const closePanel = useCallback(() => setPanelContent(null), []);
    const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
    // Collapse when parent requests collapse-all
    useEffect(() => {
        if (collapseAllEpoch !== undefined && collapseAllEpoch > 0) setCollapsed(true);
    }, [collapseAllEpoch]);
    // #8 — Expand when parent requests expand-all
    useEffect(() => {
        if (expandAllEpoch !== undefined && expandAllEpoch > 0) setCollapsed(false);
    }, [expandAllEpoch]);
    // ── OPSEC / Edit Tags / Eventing / Token dialogs ──
    const [opsecDialogOpen, setOpsecDialogOpen] = useState<{open:boolean;view:'pre'|'post'}>({open:false,view:'pre'});
    const [editTagsOpen, setEditTagsOpen] = useState(false);
    const [eventingOpen, setEventingOpen] = useState(false);
    const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
    // ── Output pagination ── (default true = console always shows all output, matching OldReactUI selectAllOutput={true})
    const [showAllOutput, setShowAllOutput] = useState(true);
    // ── Operator settings ──
    const hideUsernames: boolean = useGetMythicSetting({setting_name: 'hideUsernames', default_value: operatorSettingDefaults.hideUsernames ?? false});
    const showIPSetting: boolean = useGetMythicSetting({setting_name: 'showIP', default_value: operatorSettingDefaults.showIP ?? false});
    const showHostnameSetting: boolean = useGetMythicSetting({setting_name: 'showHostname', default_value: operatorSettingDefaults.showHostname ?? false});
    const showCallbackGroupsSetting: boolean = useGetMythicSetting({setting_name: 'showCallbackGroups', default_value: operatorSettingDefaults.showCallbackGroups ?? false});
    const showOPSECBypassUsernameSetting: boolean = useGetMythicSetting({setting_name: 'showOPSECBypassUsername', default_value: operatorSettingDefaults.showOPSECBypassUsername ?? false});
    const taskTimestampField: string = useGetMythicSetting({setting_name: 'taskTimestampDisplayField', default_value: operatorSettingDefaults.taskTimestampDisplayField ?? 'timestamp'});
    const responseStreamLimit: number = useGetMythicSetting({setting_name: 'experiment-responseStreamLimit', default_value: operatorSettingDefaults['experiment-responseStreamLimit'] ?? 50});
    const _useDisplayParamsForCLIHistory: boolean = useGetMythicSetting({setting_name: '_useDisplayParamsForCLIHistory', default_value: operatorSettingDefaults._useDisplayParamsForCLIHistory ?? true});
    const showMediaSetting: boolean = useGetMythicSetting({setting_name: 'showMedia', default_value: operatorSettingDefaults.showMedia ?? true});
    // effectiveStreamLimit: 0 means "no limit" (show all), otherwise use the setting value
    const effectiveStreamLimit = responseStreamLimit > 0 ? responseStreamLimit : 0;
    // ── Server-side search / pagination state ──
    const [paginatedResults, setPaginatedResults] = useState<any[] | null>(null);
    const [totalSearchCount, setTotalSearchCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [fetchPagedResponses] = useLazyQuery(GET_RESPONSES_PAGINATED, {
        fetchPolicy: 'network-only',
        onCompleted: (d: Record<string, unknown>) => {
            setPaginatedResults(d.response || []);
            setTotalSearchCount(d.response_aggregate?.aggregate?.count || 0);
        },
    });
    const [fetchAllSearchResponses] = useLazyQuery(GET_RESPONSES_ALL_SEARCH, {
        fetchPolicy: 'network-only',
        onCompleted: (d: Record<string, unknown>) => {
            setPaginatedResults(d.response || []);
            setTotalSearchCount(d.response_aggregate?.aggregate?.count || 0);
        },
    });
    // Trigger server-side search when searchText changes (debounced)
    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (!searchText.trim()) {
            setPaginatedResults(null);
            setCurrentPage(1);
            setTotalSearchCount(0);
            return;
        }
        searchDebounceRef.current = setTimeout(() => {
            const limit = effectiveStreamLimit || 50;
            if (showAllOutput || effectiveStreamLimit === 0) {
                fetchAllSearchResponses({ variables: { task_id: task.id, search: `%${searchText}%` } });
            } else {
                fetchPagedResponses({ variables: { task_id: task.id, fetchLimit: limit, offset: 0, search: `%${searchText}%` } });
                setCurrentPage(1);
            }
        }, 300);
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText, showAllOutput, task.id, responseStreamLimit]);
    const handlePageChange = (page: number) => {
        const limit = effectiveStreamLimit || 50;
        const searchParam = searchText.trim() ? `%${searchText}%` : '%%';
        fetchPagedResponses({ variables: { task_id: task.id, fetchLimit: limit, offset: limit * (page - 1), search: searchParam } });
        setCurrentPage(page);
    };
    // ── Live response streaming ──
    // Seed with initial snapshot; subscription incrementally merges newer/updated responses.
    const [liveResponses, setLiveResponses] = useState<any[]>(() => task.responses || []);
    const liveResponsesRef = useRef(liveResponses);
    useEffect(() => { liveResponsesRef.current = liveResponses; }, [liveResponses]);
    // Keep liveResponses in sync when the task snapshot delivers a fresh responses array
    // (e.g., on initial bulk-load before the subscription fires)
    const prevTaskIdRef = useRef(task.id);
    useEffect(() => {
        if (task.id !== prevTaskIdRef.current) {
            prevTaskIdRef.current = task.id;
            setLiveResponses(task.responses || []);
        }
    }, [task.id, task.responses]);
    useSubscription(STREAM_TASK_RESPONSES, {
        variables: { task_id: task.id },
        fetchPolicy: 'network-only',
        onData: ({ data: d }: { data: { data: Record<string, unknown> } }) => {
            const incoming: TaskResponse[] = (d?.data?.response_stream as TaskResponse[]) || [];
            if (incoming.length === 0) return;
            setLiveResponses(prev => {
                const next = [...prev];
                incoming.forEach(
(r: TaskResponse) => {
                    const idx = next.findIndex((x: TaskResponse) => x.id === r.id);
                    if (idx >= 0) next[idx] = r;
                    else next.push(r);
                });
                next.sort((a: TaskResponse, b: TaskResponse) => a.id - b.id);
                return next;
            });
        },
    });
    // ── BrowserScript ──
    const [browserScriptFn, setBrowserScriptFn] = useState<Function | null>(null);
    const [browserScriptData, setBrowserScriptData] = useState<any | null>(null);
    const [viewBrowserScript, setViewBrowserScript] = useState(false);
    const commandId = task.command?.id;
    const [fetchBrowserScript] = useLazyQuery(GET_BROWSERSCRIPT, {
        fetchPolicy: 'network-only',
        onCompleted: (d: Record<string, unknown>) => {
            const scripts = d?.browserscript || [];
            if (scripts.length === 0) { setBrowserScriptFn(null); setBrowserScriptData(null); return; }
            try {
                // eslint-disable-next-line no-new-func
                const fn = Function(`"use strict";return(${scripts[0].script})`)();
                setBrowserScriptFn(() => fn);
            } catch { setBrowserScriptFn(null); setBrowserScriptData(null); }
        },
        onError: () => { setBrowserScriptFn(null); },
    });
    useEffect(() => {
        if (commandId) fetchBrowserScript({ variables: { command_id: commandId } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commandId]);
    // Run browserScript on new responses — OldReactUI calling convention: script(task, rawResponseArray)
    useEffect(() => {
        if (!browserScriptFn || liveResponses.length === 0) { setBrowserScriptData(null); return; }
        try {
            const rawResponseArray = liveResponses.map((r: TaskResponse) => b64DecodeUnicode(r.response || ''));
            const result = browserScriptFn(task, rawResponseArray);
            setBrowserScriptData(result && typeof result === 'object' && Object.keys(result).length > 0 ? result : null);
        } catch { setBrowserScriptData(null); }
    }, [browserScriptFn, liveResponses, task]);
    // ── Output ref for screenshot ──
    const outputRef = useRef<HTMLDivElement>(null);

    // Lazy-reveal output when the task scrolls into the visible area of the terminal
    const taskRef = useRef<HTMLDivElement>(null);
    const [outputRevealed, setOutputRevealed] = useState(false);
    const onRevealRef = useRef(onReveal);
    useEffect(() => { onRevealRef.current = onReveal; }, [onReveal]);
    useEffect(() => {
        if (outputRevealed) return;
        const el = taskRef.current;
        if (!el) return;
        const root = scrollRoot?.current ?? null;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    setOutputRevealed(true);
                    // NOTE: do NOT call onReveal here — DOM hasn't grown yet.
                    // useLayoutEffect below fires after the re-render so scrollHeight is correct.
                    observer.disconnect();
                }
            },
            { root, rootMargin: '200px 0px 200px 0px', threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [outputRevealed, scrollRoot]);
    // Fire the reveal callback AFTER the DOM has expanded (useLayoutEffect runs post-mutation)
    useLayoutEffect(() => {
        if (outputRevealed) onRevealRef.current?.();
    }, [outputRevealed]);

    // Kill task: find the job_kill command then createTask
    const [killConfirmOpen, setKillConfirmOpen] = useState(false);
    const [getKillCmd] = useLazyQuery(GET_KILL_COMMAND, {
        fetchPolicy: 'network-only',
        onCompleted: (d: Record<string, unknown>) => {
            const cmds = d?.callback_by_pk?.loadedcommands || [];
            if (cmds.length === 0) { snackActions.warning('No kill-task command loaded for this callback'); return; }
            const cmd = cmds[0].command.cmd;
            const pt = cmds[0].command.payloadtype?.name;
            createKillTask({ variables: {
                callback_id: task.callback?.display_id ?? task.display_id,
                command: cmd,
                params: task.agent_task_id || String(task.id),
                tasking_location: 'modal',
                parameter_group_name: 'Default',
                payload_type: pt,
            } });
        },
        onError: () => snackActions.error('Failed to query kill command'),
    });
    const [createKillTask] = useMutation(CREATE_TASK_MUTATION, {
        onCompleted: (d: Record<string, unknown>) => d.createTask?.status === 'error'
            ? snackActions.error('Kill failed: ' + d.createTask.error)
            : snackActions.success('Kill task queued'),
        onError: () => snackActions.error('Failed to create kill task'),
    });
    const handleKillTask = () => {
        const callbackDbId = task.callback?.id;
        if (!callbackDbId) { snackActions.warning('Callback ID unknown'); return; }
        getKillCmd({ variables: { callback_id: callbackDbId } });
        setKillConfirmOpen(false);
    };

    const [reissueTask] = useMutation(REISSUE_TASK_MUTATION, {
        onCompleted: (d: Record<string, unknown>) => d.reissue_task.status === 'success'
            ? snackActions.success('Task reissued successfully')
            : snackActions.error('Reissue failed: ' + d.reissue_task.error),
        onError: () => snackActions.error('Failed to reissue task'),
    });
    const [reissueTaskHandler] = useMutation(REISSUE_TASK_HANDLER_MUTATION, {
        onCompleted: (d: Record<string, unknown>) => d.reissue_task_handler.status === 'success'
            ? snackActions.success('Task handler reissued')
            : snackActions.warning('Reissue handler failed: ' + d.reissue_task_handler.error),
        onError: () => snackActions.error('Failed to reissue task handler'),
    });
    const [fetchAllResponses] = useLazyQuery(GET_ALL_TASK_RESPONSES, {
        fetchPolicy: 'network-only',
        onCompleted: (d: Record<string, unknown>) => {
            const text = (d.response || []).reduce((acc: string, r: TaskResponse) => acc + b64DecodeUnicode(r.response || ''), '');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `task_${task.display_id}.txt`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            snackActions.success('Output downloaded');
        },
        onError: () => snackActions.error('Failed to download output'),
    });

    const copyParams = () => {
        const cmd = task.command_name || '';
        const params = task.original_params || task.display_params || '';
        navigator.clipboard.writeText(cmd + (params ? ' ' + params : ''))
            .then(() => snackActions.success('Copied to clipboard'))
            .catch(() => snackActions.error('Failed to copy'));
    };

    let time = "---";
    try {
        const ts = (task as any)[taskTimestampField] || task.timestamp;
        time = new Date(ts).toLocaleTimeString();
    } catch(e) {}

    let statusColor = "text-yellow-500";
    let borderColor = "border-yellow-500/50";
    const status = (task.status || "").toLowerCase();
    if (status.includes("error")) { statusColor = "text-red-500"; borderColor = "border-red-500/50"; }
    else if (status === "completed" || status === "success") { statusColor = "text-signal"; borderColor = "border-signal/50"; }
    else if (status === "cleared") { statusColor = "text-orange-400"; borderColor = "border-orange-400/50"; }

    const tryParseJSON = (str: string) => { try { return JSON.parse(str); } catch { return null; } };
    const fmtBytes = (bytes: number) => {
        if (!bytes || bytes < 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    };
    const fmtUnixTime = (ts: number) => {
        if (!ts) return '-';
        const d = new Date(ts * 1000);
        const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
        const day = String(d.getDate()).padStart(2, ' ');
        const hh  = String(d.getHours()).padStart(2, '0');
        const mm  = String(d.getMinutes()).padStart(2, '0');
        return `${mon} ${day} ${hh}:${mm}`;
    };

    const buildPath = (f: Record<string, unknown>, directory: string): string => {
        const isWindows = /^[A-Za-z]:[\\/]/.test(directory) || directory.includes('\\');
        if (isWindows) {
            // For Windows: trust full_name if it looks absolute (has drive letter or starts with \)
            if (f.full_name && (/^[A-Za-z]:[\\/]/.test(f.full_name) || f.full_name.startsWith('\\'))) return f.full_name;
            const sep = '\\';
            const normDir = directory.replace(/[\\/]+$/, '');
            return normDir + sep + f.name;
        }
        // Unix path
        if (f.full_name && f.full_name.startsWith('/')) return f.full_name;
        const normDir = normalizeUnixPath(directory);
        if (normDir && normDir !== '.') return normDir.replace(/\/+$/, '') + '/' + f.name;
        return f.name;
    };

    const handleFileRowClick = (f: Record<string, unknown>, directory: string) => {
        if (!onFileAction) return;
        const fullPath = buildPath(f, directory);
        if (!f.is_file) {
            onFileAction('ls', fullPath, f.name, true);
        } else {
            onFileAction('cat', fullPath, f.name, false);
        }
    };

    const handleFileRowCtx = (e: React.MouseEvent, f: Record<string, unknown>, directory: string) => {
        if (!onFileAction) return;
        e.preventDefault();
        const fullPath = buildPath(f, directory);
        setCtxMenu({ x: e.clientX, y: e.clientY, isDir: !f.is_file, path: fullPath, name: f.name });
    };

    return (
        <>
        <div ref={taskRef} className={cn("mb-4 border-l-2 pl-4 py-2 bg-white/5 rounded-r group hover:bg-white/10", borderColor)}>
            {/* Header: operator info + action buttons — #12 console prompt styling */}
            <div className="flex items-start justify-between mb-1 gap-2">
                <div
                    className="flex items-center gap-0 text-[11px] font-mono opacity-60 group-hover:opacity-100 transition-opacity flex-wrap min-w-0 cursor-pointer select-none"
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? 'Expand task' : 'Collapse task'}
                >
                    <span className="text-signal/40 mr-1">┌──[</span>
                    <ChevronRight
                        size={12}
                        className={cn('text-signal shrink-0 transition-transform duration-150 mr-1', collapsed ? 'rotate-0' : 'rotate-90')}
                    />
                    <span className="text-gray-500 mr-0.5">⏰</span>
                    <span className="text-gray-400">{time}</span>
                    <span className="text-signal/40">]-[</span>
                    {!hideUsernames && <>
                        <span className="text-gray-500 mr-0.5">👤</span>
                        <span className="text-blue-400 font-bold">{task.operator?.username || "Unknown"}</span>
                    </>}
                    <span className="text-signal/40">]-[</span>
                    <span className="text-gray-500 mr-0.5">#</span>
                    <a href={`/new/task/${task.display_id}`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-signal/80 hover:text-signal hover:underline"
                        title="Open task in new window">
                        T-{task.display_id}
                    </a>
                    {task.callback?.display_id && (
                        <>
                            <span className="text-signal/40">/</span>
                            <a href={`/new/callbacks/${task.callback.display_id}`} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-blue-300/60 hover:text-blue-300 hover:underline"
                                title="Open callback in new window">
                                C-{task.callback.display_id}
                            </a>
                        </>
                    )}
                    <span className="text-signal/40">]</span>
                    {showHostnameSetting && task.callback?.host && (
                        <><span className="text-signal/40">-[</span><span className="text-gray-400/70" title="Hostname">{task.callback.host}</span><span className="text-signal/40">]</span></>
                    )}
                    {showIPSetting && task.callback?.ip && (() => { const ip = parseIP(task.callback.ip); return ip && ip !== '0.0.0.0' ? <><span className="text-signal/40">-[</span><span className="text-gray-500/60 text-[10px]" title="IP">{ip}</span><span className="text-signal/40">]</span></> : null; })()}
                    {showCallbackGroupsSetting && task.callback?.mythictree_groups && task.callback.mythictree_groups.length > 0 && (
                        <><span className="text-signal/40">-[</span><span className="text-cyan-500/50 text-[10px]" title="Groups">{task.callback.mythictree_groups.join(', ')}</span><span className="text-signal/40">]</span></>
                    )}
                    {task.comment && (
                        <span className="text-yellow-300/70 italic text-[10px] max-w-[200px] truncate" title={task.comment}>
                            💬 {task.comment}
                        </span>
                    )}
                    {/* OPSEC pre-check indicator — click to open OPSEC dialog */}
                    {task.opsec_pre_blocked !== null && task.opsec_pre_blocked !== undefined && (
                        <span className="flex items-center gap-0.5 font-mono text-[9px] uppercase cursor-pointer"
                            onClick={e => { e.stopPropagation(); setOpsecDialogOpen({open:true,view:'pre'}); }}
                            title={task.opsec_pre_bypassed
                                ? `OPSEC Pre-Check: Bypassed${task.opsec_pre_bypass_user ? ' by ' + task.opsec_pre_bypass_user.username : ''} — click for details`
                                : "OPSEC Pre-Check: Blocked — click for details"}>
                            {task.opsec_pre_bypassed
                                ? <><Unlock size={10} className="text-yellow-400" /><span className="text-yellow-400">PRE</span>{showOPSECBypassUsernameSetting && task.opsec_pre_bypass_user && <span className="text-yellow-300/60 normal-case ml-0.5">({task.opsec_pre_bypass_user.username})</span>}</>
                                : <><Lock size={10} className="text-red-500" /><span className="text-red-500">PRE</span></>}
                        </span>
                    )}
                    {/* OPSEC post-check indicator — click to open OPSEC dialog */}
                    {task.opsec_post_blocked !== null && task.opsec_post_blocked !== undefined && (
                        <span className="flex items-center gap-0.5 font-mono text-[9px] uppercase cursor-pointer"
                            onClick={e => { e.stopPropagation(); setOpsecDialogOpen({open:true,view:'post'}); }}
                            title={task.opsec_post_bypassed
                                ? `OPSEC Post-Check: Bypassed${task.opsec_post_bypass_user ? ' by ' + task.opsec_post_bypass_user.username : ''} — click for details`
                                : "OPSEC Post-Check: Blocked — click for details"}>
                            {task.opsec_post_bypassed
                                ? <><Unlock size={10} className="text-yellow-400" /><span className="text-yellow-400">POST</span>{showOPSECBypassUsernameSetting && task.opsec_post_bypass_user && <span className="text-yellow-300/60 normal-case ml-0.5">({task.opsec_post_bypass_user.username})</span>}</>
                                : <><Lock size={10} className="text-red-500" /><span className="text-red-500">POST</span></>}
                        </span>
                    )}
                    {/* Payload type badge */}
                    {task.command?.payloadtype?.name && (
                        <span className="font-mono text-[9px] text-gray-500/70 opacity-70 hover:opacity-100 transition-opacity"
                            title={`Payload type: ${task.command.payloadtype.name}`}>
                            [{task.command.payloadtype.name}]
                        </span>
                    )}
                    {/* has_intercepted_response indicator */}
                    {task.has_intercepted_response && (
                        <span title="This task has responses that have been intercepted and changed"
                            className="flex items-center text-purple-400/80 hover:text-purple-300">
                            <RotateCcw size={10} />
                        </span>
                    )}
                    {/* Eventing link */}
                    {task.eventstepinstance && (
                        <a
                            href={`/new/eventing?eventgroup=${task.eventstepinstance.eventgroupinstance.eventgroup.id}&eventgroupinstance=${task.eventstepinstance.eventgroupinstance.id}`}
                            onClick={e => e.stopPropagation()}
                            title={`Triggered by event: ${task.eventstepinstance.eventstep?.name ?? ''}`}
                            className="flex items-center text-cyan-400/70 hover:text-cyan-300 transition-colors">
                            <PlayCircle size={10} />
                        </a>
                    )}
                    {/* Tags */}
                    {task.tags && task.tags.length > 0 && (
                        <span className="flex items-center gap-1">
                            {task.tags.map((tag: { tagtype: { name: string; color: string; id: number } }) => (
                                <span
                                    key={tag.id}
                                    className="inline-flex items-center gap-0.5 px-1 rounded text-[9px] font-mono font-bold"
                                    style={{
                                        backgroundColor: (tag.tagtype?.color ?? '#888') + '33',
                                        color: tag.tagtype?.color ?? '#aaa',
                                        border: `1px solid ${(tag.tagtype?.color ?? '#888')}55`,
                                    }}
                                    title={tag.tagtype?.name ?? 'tag'}>
                                    <Tag size={7} />
                                    {tag.tagtype?.name ?? ''}
                                </span>
                            ))}
                        </span>
                    )}
                    {/* Collapsed command summary */}
                    {collapsed && (
                        <span className="ml-2 flex items-center gap-1.5 text-[11px] font-mono opacity-80">
                            <span className={cn("font-bold", statusColor)}>▸</span>
                            <span className="text-yellow-200 font-bold">{task.command_name}</span>
                            {task.display_params && (
                                <span className="text-gray-400 truncate max-w-[260px]">{task.display_params}</span>
                            )}
                        </span>
                    )}
                </div>
                {/* Task action toolbar (dim until hover) */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {/* Kill running task */}
                    {!task.completed && task.status_timestamp_processing && !status.includes('error') && (
                        killConfirmOpen ? (
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] font-mono text-red-400">Kill?</span>
                                <button title="Confirm Kill" onClick={handleKillTask}
                                    className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors">
                                    <CheckCircle size={12} />
                                </button>
                                <button title="Cancel" onClick={() => setKillConfirmOpen(false)}
                                    className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                                    <XCircle size={12} />
                                </button>
                            </div>
                        ) : (
                            <button title="Kill Task / Stop Running Job" onClick={() => setKillConfirmOpen(true)}
                                className="p-1 rounded text-red-500/60 hover:text-red-400 hover:bg-red-500/20 transition-colors">
                                <Skull size={12} />
                            </button>
                        )
                    )}
                    {/* Reissue task (error: container) */}
                    {status.includes('error: container') && (
                        <button title="Resubmit Task" onClick={() => reissueTask({ variables: { task_id: task.id } })}
                            className="p-1 rounded hover:bg-yellow-500/20 text-yellow-400 transition-colors">
                            <RotateCcw size={12} />
                        </button>
                    )}
                    {/* Reissue task handler (error: task) */}
                    {status.includes('error: task') && !status.includes('error: container') && (
                        <button title="Resubmit Task Handler" onClick={() => reissueTaskHandler({ variables: { task_id: task.id } })}
                            className="p-1 rounded hover:bg-yellow-500/20 text-yellow-400 transition-colors">
                            <RotateCcw size={12} />
                        </button>
                    )}
                    {/* Search toggle */}
                    <button title={showSearch ? "Close Search" : "Search Output"}
                        onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchText(''); }}
                        className={cn("p-1 rounded transition-colors", showSearch ? "text-signal bg-signal/20" : "text-gray-500 hover:text-white hover:bg-white/10")}>
                        <Search size={12} />
                    </button>
                    {/* Copy command + params */}
                    <button title="Copy Command to Clipboard" onClick={copyParams}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <Copy size={12} />
                    </button>
                    {/* Copy output */}
                    <button title="Copy Output to Clipboard"
                        onClick={() => {
                            const text = liveResponses.map((r: TaskResponse) => b64DecodeUnicode(r.response || '')).join('');
                            navigator.clipboard.writeText(text);
                            snackActions.success('Output copied');
                        }}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <ClipboardCopy size={12} />
                    </button>
                    {/* Edit comment */}
                    <button title="Edit Comment"
                        onClick={() => setPanelContent(<TaskCommentModal taskId={task.id} onClose={closePanel} />)}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <MessageSquare size={12} />
                    </button>
                    {/* View parameters + timestamps */}
                    <button title="View Parameters & Timestamps"
                        onClick={() => setPanelContent(<TaskParamsModal taskId={task.id} onClose={closePanel} />)}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <SlidersHorizontal size={12} />
                    </button>
                    {/* View stdout/stderr */}
                    <button title="View Stdout/Stderr"
                        onClick={() => setPanelContent(<TaskStdoutStderrModal taskId={task.id} onClose={closePanel} />)}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <Bug size={12} />
                    </button>
                    {/* Toggle BrowserScript rendering (only when script available) */}
                    {browserScriptFn && (
                        <button title={viewBrowserScript ? "Show Raw Output" : "Show BrowserScript Output"}
                            onClick={() => setViewBrowserScript(v => !v)}
                            className={cn('p-1 rounded transition-colors text-[10px] font-mono font-bold',
                                viewBrowserScript ? 'text-signal bg-signal/20' : 'text-gray-500 hover:text-white hover:bg-white/10')}>
                            BS
                        </button>
                    )}
                    {/* Token info (when task has a token) */}
                    {task.token && (
                        <button title="View Token Information"
                            onClick={() => setTokenDialogOpen(true)}
                            className="p-1 rounded text-yellow-600/70 hover:text-yellow-400 hover:bg-yellow-500/20 transition-colors">
                            <Key size={12} />
                        </button>
                    )}
                    {/* Toggle output pagination */}
                    <button title={showAllOutput || effectiveStreamLimit === 0 ? "Showing all output" + (effectiveStreamLimit === 0 ? ' (limit=0 → unlimited)' : ' — click to paginate') : `Showing last ${effectiveStreamLimit} responses${liveResponses.length > effectiveStreamLimit ? ` (${liveResponses.length - effectiveStreamLimit} older hidden)` : ''}`}
                        onClick={() => setShowAllOutput(v => !v)}
                        className={cn("p-1 rounded transition-colors", showAllOutput ? "text-orange-400 bg-orange-400/15" : "text-gray-500 hover:text-white hover:bg-white/10")}>
                        <LayoutList size={12} />
                    </button>
                    {/* Edit Tags */}
                    <button title="Edit Tags"
                        onClick={() => setEditTagsOpen(true)}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <Tag size={12} />
                    </button>
                    {/* Trigger Eventing */}
                    <button title="Trigger Event from this Task"
                        onClick={() => setEventingOpen(true)}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <PlayCircle size={12} />
                    </button>
                    {/* Screenshot output as PNG */}
                    <button title="Download Screenshot of Output"
                        onClick={async () => {
                            if (!outputRef.current) return;
                            try {
                                snackActions.info('Capturing screenshot...');
                                const dataUrl = await toPng(outputRef.current, { cacheBust: true });
                                const a = document.createElement('a');
                                a.href = dataUrl;
                                a.download = `task_${task.display_id}_output.png`;
                                document.body.appendChild(a); a.click();
                                document.body.removeChild(a);
                                snackActions.success('Screenshot saved');
                            } catch { snackActions.error('Screenshot failed'); }
                        }}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <Image size={12} />
                    </button>
                    {/* Download all output as .txt */}
                    <button title="Download All Output" onClick={() => fetchAllResponses({ variables: { task_id: task.id } })}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                        <FileDown size={12} />
                    </button>
                    {/* Open task in new window */}
                    <a href={`/new/task/${task.display_id}`} target="_blank" rel="noreferrer"
                        title="Open Task in New Window"
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors flex items-center">
                        <ExternalLink size={12} />
                    </a>
                </div>
            </div>
            {/* Collapsible body */}
            <AnimatePresence initial={false}>
            {!collapsed && (
            <motion.div
                key="task-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
            >
            {/* Search bar (shown when toggled) */}
            {showSearch && (
                <div className="flex items-center gap-2 mb-2 mt-0.5">
                    <Search size={11} className="text-signal shrink-0" />
                    <input
                        type="text"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        placeholder="Filter output..."
                        className="flex-1 bg-black/40 border border-signal/30 focus:border-signal px-2 py-0.5 text-white font-mono text-xs outline-none transition-colors"
                        autoFocus
                    />
                    {searchText && (
                        <button onClick={() => setSearchText('')} className="text-gray-500 hover:text-white transition-colors"><XCircle size={11} /></button>
                    )}
                </div>
            )}
            <div className="font-mono text-sm text-white font-bold mb-3 flex items-start gap-2">
                <span className="text-signal mt-0.5">$</span>
                <div className="break-all">
                    <span className="text-yellow-200">{task.command_name}</span> 
                    <span className="ml-2 text-gray-300">{task.display_params}</span>
                </div>
            </div>
            <div className={cn("text-[11px] uppercase tracking-wider font-bold mb-2 flex items-center gap-2", statusColor)}>
                {status}
                {status !== "completed" && status !== "success" && !status.includes("error") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>
                )}
            </div>
            {/* Output box — interactive tasks bypass lazy-reveal and get a live terminal */}
            <div className="relative">
            {(task.is_interactive_task || task.command?.supported_ui_features?.includes('task_response:interactive')) ? (
                <InteractiveTaskBlock
                    taskId={task.id}
                    task={task}
                    liveResponses={liveResponses}
                    callbackDisplayId={task.callback?.display_id ?? 0}
                    commandName={task.command_name || task.command?.cmd || ''}
                    myUsername={myUsername ?? ''}
                />
            ) : !outputRevealed ? (
                <div className="bg-black/20 rounded border border-white/5 h-9 flex items-center px-3 gap-2 text-[11px] text-gray-700 font-mono italic select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-700 animate-pulse shrink-0" />
                    scroll up to reveal output...
                </div>
            ) : (
            <div ref={outputRef} className="isolate font-mono text-xs text-gray-200 whitespace-pre-wrap break-words bg-black/40 p-3 rounded border border-white/5 shadow-inner select-text space-y-2">
                {/* BrowserScript rendered output — full Mythic type support */}
                {viewBrowserScript && browserScriptData && (() => {
                    const bsd: MythicBrowserScriptData = searchText.trim() ? filterBrowserScriptOutput(browserScriptData, searchText) : browserScriptData;
                    return (
                        <div className="mb-2 space-y-2">
                            {/* plaintext — shared TerminalPanel */}
                            {bsd.plaintext !== undefined && (
                                <TerminalPanel text={String(bsd.plaintext)}/>
                            )}
                            {/* table[] — shared MythicTable */}
                            {Array.isArray(bsd.table) && bsd.table.map((tbl: MythicTableDef, i: number) => (
                                <MythicTable key={i} tbl={tbl}/>
                            ))}
                            {/* process_list — shared ProcessPanel */}
                            {Array.isArray(bsd.process_list) && (
                                <ProcessPanel procs={bsd.process_list}/>
                            )}
                            {/* files — shared FilesPanel */}
                            {Array.isArray(bsd.files) && (
                                <FilesPanel files={bsd.files}/>
                            )}
                            {bsd.file_browser?.files && (
                                <FilesPanel files={bsd.file_browser.files}/>
                            )}
                            {/* download[] — shared DownloadPanel */}
                            {Array.isArray(bsd.download) && (
                                <DownloadPanel downloads={bsd.download}/>
                            )}
                            {/* screenshot[] — top-level screenshot rendering (#3) */}
                            {Array.isArray(bsd.screenshot) && bsd.screenshot.length > 0 && (
                                <ScreenshotPanel screenshots={bsd.screenshot}/>
                            )}
                            {/* media[] — enhanced inline player with image/PDF preview (#8) */}
                            {showMediaSetting && Array.isArray(bsd.media) && bsd.media.map((m: { agent_file_id: string; filename?: string }, i: number) => {
                                const src = `/api/v1.4/files/download/${m.agent_file_id}`;
                                const name: string = (m.name || m.plaintext || '').toLowerCase();
                                const isAudio = /\.(mp3|ogg|wav|aac|flac|m4a)$/.test(name);
                                const isVideo = /\.(mp4|webm|ogv|mov|avi|mkv)$/.test(name);
                                const isImage = /\.(png|jpe?g|gif|bmp|svg|webp|ico)$/.test(name);
                                const isPdf = /\.pdf$/.test(name);
                                return (
                                    <div key={i} className="space-y-1">
                                        {m.plaintext && <div className="text-gray-400 text-[10px]">{m.plaintext}</div>}
                                        {isAudio ? (
                                            <audio controls src={src} className="w-full h-8 max-w-sm" />
                                        ) : isVideo ? (
                                            <video controls src={src} className="max-w-full rounded border border-white/10" style={{maxHeight:'240px'}} />
                                        ) : isImage ? (
                                            <img src={src} alt={m.plaintext || 'image'} className="max-w-full rounded border border-white/10 cursor-pointer" style={{maxHeight:'300px'}}
                                                onClick={() => setExpandedScreenshot({ src, alt: m.plaintext || 'image' })} />
                                        ) : isPdf ? (
                                            <iframe src={src} title={m.plaintext || 'PDF'} className="w-full rounded border border-white/10" style={{height:'400px'}} />
                                        ) : (
                                            <a href={src} target="_blank" rel="noreferrer"
                                                className="text-blue-400 hover:underline text-[10px] flex items-center gap-1">
                                                <Eye size={10}/> View Media
                                            </a>
                                        )}
                                    </div>
                                );
                            })}
                            {/* graph — SVG renderer */}
                            {bsd.graph && (() => {
                                type GNode = {id:string;label?:string;color?:string};
                                type GEdge = {source:string;target:string;label?:string};
                                const nodes: GNode[] = Array.isArray(bsd.graph.nodes) ? bsd.graph.nodes : [];
                                const edges: GEdge[] = Array.isArray(bsd.graph.edges) ? bsd.graph.edges : [];
                                if (nodes.length === 0) {
                                    return (
                                        <details className="text-[10px]">
                                            <summary className="text-gray-500 cursor-pointer">Graph data (raw)</summary>
                                            <pre className="text-gray-400 text-[9px] overflow-auto max-h-40">{JSON.stringify(bsd.graph, null, 2)}</pre>
                                        </details>
                                    );
                                }
                                // Layout: circle of nodes
                                const W = 480, H = 300;
                                const cx = W/2, cy = H/2;
                                const r = Math.min(cx, cy) - 40;
                                const angleStep = (2 * Math.PI) / nodes.length;
                                const positions: Record<string,{x:number,y:number}> = {};
                                nodes.forEach((n, i) => {
                                    const a = angleStep * i - Math.PI/2;
                                    positions[n.id] = {x: cx + r*Math.cos(a), y: cy + r*Math.sin(a)};
                                });
                                return (
                                    <div className="border border-white/10 rounded overflow-auto">
                                        <svg width={W} height={H} className="block mx-auto">
                                            <defs>
                                                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                                    <path d="M0,0 L0,6 L6,3 z" fill="#4ade80" opacity="0.7"/>
                                                </marker>
                                            </defs>
                                            {/* edges */}
                                            {edges.map((e, i) => {
                                                const s = positions[e.source], t = positions[e.target];
                                                if (!s || !t) return null;
                                                const mx=(s.x+t.x)/2, my=(s.y+t.y)/2;
                                                return (
                                                    <g key={i}>
                                                        <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                                                            stroke="#00ff4155" strokeWidth="1" markerEnd="url(#arrowhead)" />
                                                        {e.label && <text x={mx} y={my} fill="#aaa" fontSize="7" textAnchor="middle">{e.label}</text>}
                                                    </g>
                                                );
                                            })}
                                            {/* nodes */}
                                            {nodes.map((n) => {
                                                const p = positions[n.id];
                                                return (
                                                    <g key={n.id}>
                                                        <circle cx={p.x} cy={p.y} r="18"
                                                            fill={n.color || '#00ff4120'}
                                                            stroke={n.color || '#00ff41'}
                                                            strokeWidth="1" />
                                                        <text x={p.x} y={p.y+1} fill="#e0e0e0" fontSize="8" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">
                                                            {(n.label || n.id).slice(0,10)}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                );
                            })()}
                            {/* search[] — clickable Mythic search links (OldReactUI parity) */}
                            {Array.isArray(bsd.search) && bsd.search.length > 0 && (
                                <div className="space-y-1">
                                    {bsd.search.map((s: { plaintext: string; title?: string }, si: number) => {
                                        const label = s.plaintext || JSON.stringify(s);
                                        const query = s.search || s.plaintext || '';
                                        const searchType = s.type || 'command_and_responses';
                                        const href = `/new/search/?type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(query)}`;
                                        return (
                                            <a key={si} href={href}
                                                className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-200 hover:underline transition-colors font-mono"
                                                title={s.hoverText || `Search: ${query}`}
                                                onClick={e => { e.preventDefault(); navigate(href); }}>
                                                <Search size={9} className="shrink-0" />
                                                {label}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                            {/* tabs[] — full-featured tab switcher with nested type support */}
                            {Array.isArray(bsd.tabs) && bsd.tabs.length > 0 && (() => {
                                const [activeTabIdx, setActiveTabIdx] = React.useState(0);
                                const safeIdx = Math.min(activeTabIdx, bsd.tabs.length - 1);
                                const tab = bsd.tabs[safeIdx];
                                const renderTabContent = (t: MythicBrowserScriptData) => (
                                    <div className="space-y-2">
                                        {/* plaintext */}
                                        {t.plaintext !== undefined && t.plaintext !== '' && (
                                            <TerminalPanel text={String(t.plaintext)} />
                                        )}
                                        {/* table[] */}
                                        {Array.isArray(t.table) && t.table.map((tbl: MythicTableDef, ti: number) => (
                                            <MythicTable key={ti} tbl={tbl} />
                                        ))}
                                        {/* process_list */}
                                        {Array.isArray(t.process_list) && <ProcessPanel procs={t.process_list} />}
                                        {/* files */}
                                        {Array.isArray(t.files) && <FilesPanel files={t.files} />}
                                        {t.file_browser?.files && <FilesPanel files={t.file_browser.files} />}
                                        {/* download */}
                                        {Array.isArray(t.download) && <DownloadPanel downloads={t.download} />}
                                        {/* screenshot — enhanced with click-to-expand */}
                                        {t.screenshot && t.screenshot.agent_file_id && (
                                            <img
                                                src={`/api/v1.4/files/download/${t.screenshot.agent_file_id}`}
                                                alt={t.screenshot.filename || 'screenshot'}
                                                className="max-w-full rounded border border-white/10 cursor-zoom-in"
                                                style={{ maxHeight: '300px' }}
                                                onClick={() => setExpandedScreenshot({ src: `/api/v1.4/files/download/${t.screenshot.agent_file_id}`, alt: t.screenshot.filename || 'screenshot' })}
                                            />
                                        )}
                                        {Array.isArray(t.screenshot) && t.screenshot.length > 0 && (
                                            <ScreenshotPanel screenshots={t.screenshot}/>
                                        )}
                                        {/* media — enhanced with image/PDF support */}
                                        {showMediaSetting && Array.isArray(t.media) && t.media.map((m: { agent_file_id: string; filename?: string }, mi: number) => {
                                            const src = `/api/v1.4/files/download/${m.agent_file_id}`;
                                            const name: string = (m.name || m.plaintext || '').toLowerCase();
                                            const isAudio = /\.(mp3|ogg|wav|aac|flac|m4a)$/.test(name);
                                            const isVideo = /\.(mp4|webm|ogv|mov|avi|mkv)$/.test(name);
                                            const isImage = /\.(png|jpe?g|gif|bmp|svg|webp|ico)$/.test(name);
                                            const isPdf = /\.pdf$/.test(name);
                                            return (
                                                <div key={mi} className="space-y-1">
                                                    {m.plaintext && <div className="text-gray-400 text-[10px]">{m.plaintext}</div>}
                                                    {isAudio ? (
                                                        <audio controls src={src} className="w-full h-8 max-w-sm" />
                                                    ) : isVideo ? (
                                                        <video controls src={src} className="max-w-full rounded border border-white/10" style={{maxHeight:'240px'}} />
                                                    ) : isImage ? (
                                                        <img src={src} alt={m.plaintext || 'image'} className="max-w-full rounded border border-white/10 cursor-pointer" style={{maxHeight:'300px'}}
                                                            onClick={() => setExpandedScreenshot({ src, alt: m.plaintext || 'image' })} />
                                                    ) : isPdf ? (
                                                        <iframe src={src} title={m.plaintext || 'PDF'} className="w-full rounded border border-white/10" style={{height:'400px'}} />
                                                    ) : (
                                                        <a href={src} target="_blank" rel="noreferrer"
                                                            className="text-blue-400 hover:underline text-[10px] flex items-center gap-1">
                                                            <Eye size={10}/> View Media
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {/* search[] within a tab */}
                                        {Array.isArray(t.search) && t.search.length > 0 && (
                                            <div className="space-y-1">
                                                {t.search.map((s: { plaintext: string; title?: string }, si: number) => {
                                                    const label = s.plaintext || JSON.stringify(s);
                                                    const query = s.search || s.plaintext || '';
                                                    const searchType = s.type || 'command_and_responses';
                                                    const href = `/new/search/?type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(query)}`;
                                                    return (
                                                        <a key={si} href={href}
                                                            className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-200 hover:underline transition-colors font-mono"
                                                            title={s.hoverText || `Search: ${query}`}
                                                            onClick={e => { e.preventDefault(); navigate(href); }}>
                                                            <Search size={9} className="shrink-0" />
                                                            {label}
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                                return (
                                    <div className="border border-white/10 rounded overflow-hidden">
                                        <div className="flex gap-0 flex-wrap border-b border-white/10 bg-black/30">
                                            {bsd.tabs.map((t: MythicBrowserScriptData, ti: number) => (
                                                <button key={ti} onClick={() => setActiveTabIdx(ti)}
                                                    className={cn('px-3 py-1.5 text-[10px] font-mono border-r border-white/10 transition-colors',
                                                        ti === safeIdx ? 'bg-signal/15 text-signal border-b-2 border-b-signal' : 'text-gray-500 hover:text-white hover:bg-white/5')}>
                                                    {t.title || `Tab ${ti+1}`}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="p-2">
                                            {renderTabContent(tab)}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })()}
                {/* Raw responses — hidden when the command has a parser (browserScriptFn loaded),
                     unless the user explicitly toggles to raw view via the BS button.
                     Built-in structured renderers (ls/ifconfig/netstat/ps) suppress plain-text
                     residue via hasBuiltinStructuredOutput inside the block. */}
                {(!viewBrowserScript || (!browserScriptData && !browserScriptFn)) && (() => {
                    const effectiveLimit = effectiveStreamLimit;
                    const responsesToRender = paginatedResults !== null
                        ? paginatedResults
                        : (effectiveLimit === 0 || showAllOutput ? liveResponses : liveResponses.slice(-effectiveLimit));
                    const directoryMap = new Map<string, { directory: string; host: string; files: Map<string, any> }>();
                    const otherResponses: { id: string; content: string; parsed: unknown; isError: boolean }[] = [];
                    const isStructuredParsed = (parsed: unknown, text: string): boolean => {
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            if (parsed[0]?.AdapterName !== undefined) return true;
                            if (parsed[0]?.local_port !== undefined && parsed[0]?.protocol !== undefined) return true;
                            if (parsed[0]?.process_id !== undefined) return true;
                        }
                        if (!parsed && (
                            text.includes('mimikatz(commandline) #') ||
                            (text.includes('mimikatz') && text.includes('[*] Calling PE entry point'))
                        )) return true;
                        return false;
                    };
                    responsesToRender.forEach(
(r: TaskResponse) => {
                        let content = b64DecodeUnicode(r.response);
                        const parsed = tryParseJSON(content);
                        if (parsed && parsed.files && Array.isArray(parsed.files)) {
                            // Build the full absolute directory path from parent_path + name.
                            // e.g. parent_path="/home", name="david" → "/home/david"
                            // e.g. parent_path="C:\", name="Recovery" → "C:\Recovery"
                            const fullDir = (() => {
                                if (parsed.parent_path !== undefined) {
                                    const p = parsed.parent_path as string;
                                    const n = parsed.name || '';
                                    // Check BOTH parent_path and name for Windows indicators
                                    // e.g. parent_path="" + name="C:\" → Windows root drive
                                    const isWindows = /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\') ||
                                                     (/^[A-Za-z]:/.test(n) && (n.includes('\\') || n.includes(':')));
                                    if (isWindows) {
                                        // If name is already an absolute Windows path (has drive letter), return as-is
                                        if (/^[A-Za-z]:/.test(n) && (!p || p === '\\' || p === '/')) return n;
                                        const stripped = p.replace(/[\\/]+$/, '');
                                        if (!stripped) return n; // empty parent, name is the path
                                        return stripped + '\\' + n;
                                    }
                                    if (p === '/' || p === '') return '/' + n;
                                    return p.replace(/\/+$/, '') + '/' + n;
                                }
                                return parsed.directory || parsed.name || 'Unknown';
                            })();
                            const dirKey = `${fullDir}|${parsed.host || ''}`;
                            if (!directoryMap.has(dirKey)) {
                                directoryMap.set(dirKey, { directory: fullDir, host: parsed.host || '', files: new Map() });
                            }
                            const dirEntry = directoryMap.get(dirKey)!;
                            parsed.files.forEach((f: Record<string, unknown>) => {
                                const fileKey = f.full_name || f.name || `${f.name}-${f.size}`;
                                if (!dirEntry.files.has(fileKey)) dirEntry.files.set(fileKey, f);
                            });
                        } else {
                            otherResponses.push({ id: r.id, content, parsed, isError: !!(r as any).is_error });
                        }
                    });
                    // If any response was rendered via a built-in structured renderer, suppress plain text
                    // raw fallback by default (user can toggle via BS button to reveal raw)
                    const hasBuiltinStructuredOutput = directoryMap.size > 0 ||
                        otherResponses.some(r => isStructuredParsed(r.parsed, r.content));
                    return (
                        <>
                            {/* Pagination bar for non-search mode when responses exceed limit */}
                            {paginatedResults === null && effectiveLimit > 0 && !showAllOutput && liveResponses.length > effectiveLimit && (() => {
                                const totalCount = task.response_count || liveResponses.length;
                                const pageCount = Math.max(1, Math.ceil(totalCount / effectiveLimit));
                                if (pageCount < 2) return null;
                                return (
                                    <div className="flex items-center justify-center gap-1.5 py-1.5 mb-2 border-b border-white/5 flex-wrap">
                                        <span className="text-[10px] font-mono text-gray-600 mr-2">
                                            ▲ {totalCount - effectiveLimit} older responses
                                        </span>
                                        <button
                                            onClick={() => { handlePageChange(1); }}
                                            className="px-2 py-0.5 text-[10px] font-mono border border-signal/30 text-signal hover:bg-signal/10 rounded transition-colors"
                                        >
                                            Browse Pages ({pageCount})
                                        </button>
                                        <button onClick={() => setShowAllOutput(true)}
                                            className="px-2 py-0.5 text-[10px] font-mono border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 rounded transition-colors">
                                            Show All
                                        </button>
                                    </div>
                                );
                            })()}
                            {ctxMenu && onFileAction && (
                                <ContextMenu
                                    menu={ctxMenu}
                                    onAction={(action, path, name) => onFileAction(action, path, name, ctxMenu.isDir)}
                                    onClose={() => setCtxMenu(null)}
                                />
                            )}
                            {Array.from(directoryMap.entries()).map(([dirKey, dirData]) => (
                                <div key={dirKey} className="space-y-1">
                                    <div className="text-signal font-bold text-xs flex items-center gap-2 pb-0.5">
                                        <span>📂</span>
                                        <span>{dirData.directory}</span>
                                        {dirData.host && <span className="text-gray-500 font-normal">({dirData.host})</span>}
                                    </div>
                                    {/* Column headers */}
                                    <div className="grid gap-x-3 px-1 py-0.5 text-[10px] text-gray-600 uppercase tracking-wider border-b border-white/10 select-none"
                                         style={{gridTemplateColumns:'1.2rem 1fr 7rem 8rem 5rem 7rem'}}>
                                        <span/>
                                        <span>Name</span>
                                        <span>Permissions</span>
                                        <span>Owner : Group</span>
                                        <span className="text-right">Size</span>
                                        <span>Modified</span>
                                    </div>
                                    <div className="space-y-0.5">
                                        {Array.from(dirData.files.values()).map((f: Record<string, unknown>, idx: number) => {
                                            const perms     = f.permissions || {};
                                            const permStr   = perms.permissions || '---------';
                                            const typeChar  = !f.is_file ? 'd' : (perms.symlink ? 'l' : '-');
                                            const fullPerm  = typeChar + permStr;
                                            const owner     = perms.user  || String(perms.uid ?? '-');
                                            const group     = perms.group || String(perms.gid ?? '-');
                                            const modTime   = fmtUnixTime(f.modify_time);
                                            const isSymlink = !!perms.symlink;
                                            const displayName = isSymlink ? `${f.name} → ${perms.symlink}` : f.name;
                                            return (
                                                <div
                                                    key={`${dirKey}-${idx}`}
                                                    className={cn(
                                                        "grid gap-x-3 px-1 py-0.5 rounded text-[11px] font-mono transition-colors items-center",
                                                        onFileAction ? "cursor-pointer hover:bg-signal/10 select-none" : "hover:bg-white/5"
                                                    )}
                                                    style={{gridTemplateColumns:'1.2rem 1fr 7rem 8rem 5rem 7rem'}}
                                                    onClick={() => handleFileRowClick(f, dirData.directory)}
                                                    onContextMenu={(e) => handleFileRowCtx(e, f, dirData.directory)}
                                                    title={onFileAction ? (f.is_file ? 'Click to cat · Right-click for more' : 'Click to ls · Right-click for more') : undefined}
                                                >
                                                    <span className="leading-none">{!f.is_file ? '📁' : isSymlink ? '🔗' : '📄'}</span>
                                                    <span
                                                        className={cn(
                                                            "truncate font-bold",
                                                            !f.is_file ? 'text-yellow-300' : isSymlink ? 'text-cyan-300' : 'text-blue-300'
                                                        )}
                                                        title={f.full_name || f.name}
                                                    >{displayName}</span>
                                                    <span className="text-green-400/90 tracking-tight">{fullPerm}</span>
                                                    <span className="text-purple-300/80 truncate">{owner}<span className="text-gray-600">:</span>{group}</span>
                                                    <span className="text-gray-300 text-right tabular-nums">{f.is_file ? fmtBytes(f.size) : '-'}</span>
                                                    <span className="text-gray-500 tabular-nums">{modTime}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {otherResponses.map((r) => {
                                const { id, content, parsed, isError } = r;
                                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.AdapterName !== undefined) {
                                    // Windows ifconfig / network adapter output
                                    return (
                                        <div key={id} className="space-y-2">
                                            {parsed.map((iface: Record<string, unknown>, ifIdx: number) => (
                                                <div key={ifIdx} className="border border-white/10 rounded bg-black/30 px-3 py-2">
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <Wifi size={12} className={iface.Status === 'Up' ? 'text-signal' : 'text-gray-600'} />
                                                        <span className="font-bold text-white text-xs">{iface.AdapterName}</span>
                                                        <span className={cn('text-[9px] px-1.5 py-0.5 uppercase font-bold border rounded-sm',
                                                            iface.Status === 'Up' ? 'text-signal border-signal/40 bg-signal/10' : 'text-gray-500 border-gray-600 bg-gray-800/30'
                                                        )}>{iface.Status}</span>
                                                        {iface.Description && <span className="text-gray-500 text-[10px]">{iface.Description}</span>}
                                                    </div>
                                                    <div className="grid text-[10px] gap-x-6 gap-y-0.5" style={{gridTemplateColumns:'repeat(2, auto) 1fr'}}>
                                                        {iface.AdressesV4?.filter(Boolean).length > 0 && <><span className="text-gray-500 whitespace-nowrap">IPv4</span><span className="text-blue-300">{iface.AdressesV4.join(', ')}</span><span/></>}
                                                        {iface.AdressesV6?.filter(Boolean).length > 0 && <><span className="text-gray-500 whitespace-nowrap">IPv6</span><span className="text-cyan-400/70">{iface.AdressesV6.join(', ')}</span><span/></>}
                                                        {iface.Gateways?.filter(Boolean).length > 0 && <><span className="text-gray-500 whitespace-nowrap">Gateway</span><span className="text-yellow-300/80">{iface.Gateways.join(', ')}</span><span/></>}
                                                        {iface.DnsServers?.filter(Boolean).length > 0 && <><span className="text-gray-500 whitespace-nowrap">DNS</span><span className="text-purple-300/70">{iface.DnsServers.join(', ')}</span><span/></>}
                                                        {iface.DhcpAddresses?.filter(Boolean).length > 0 && <><span className="text-gray-500 whitespace-nowrap">DHCP</span><span className="text-orange-300/70">{iface.DhcpAddresses.join(', ')}</span><span/></>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }
                                if (Array.isArray(parsed) && parsed.length > 0 &&
                                    parsed[0]?.local_port !== undefined && parsed[0]?.protocol !== undefined) {
                                    // ── Netstat output ──────────────────────────────────────
                                    const STATE_CLS: Record<string, string> = {
                                        Established: 'text-signal   border-signal/40   bg-signal/10',
                                        Listen:      'text-gray-500 border-gray-700/50  bg-gray-800/20',
                                        CloseWait:   'text-orange-400 border-orange-500/40 bg-orange-900/10',
                                        SynSent:     'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
                                        TimeWait:    'text-red-400  border-red-500/40   bg-red-900/10',
                                        FinWait1:    'text-red-400  border-red-500/40   bg-red-900/10',
                                        FinWait2:    'text-red-400  border-red-500/40   bg-red-900/10',
                                        SynReceived: 'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
                                    };
                                    const PORT_KNOWN: Record<number, string> = {
                                        80:'HTTP', 443:'HTTPS', 22:'SSH', 21:'FTP',
                                        3389:'RDP', 445:'SMB', 135:'RPC', 139:'NetBIOS',
                                        1433:'MSSQL', 1434:'MSSQL-UDP', 5985:'WinRM',
                                        5986:'WinRM-TLS', 3306:'MySQL', 5432:'PG',
                                        8080:'HTTP-ALT', 8443:'HTTPS-ALT', 25:'SMTP',
                                        110:'POP3', 143:'IMAP', 53:'DNS', 123:'NTP',
                                    };
                                    const PORT_HIGHLIGHT: Record<number, string> = {
                                        3389:'text-orange-300', 445:'text-red-400', 1433:'text-orange-300',
                                        5985:'text-orange-300', 5986:'text-orange-300', 22:'text-signal',
                                        80:'text-blue-300', 443:'text-blue-300', 135:'text-yellow-300/80',
                                    };
                                    // Dedup Listen/UDP rows: prefer IPv4 entry for each proto+port
                                    const seenKey = new Set<string>();
                                    const rows: Record<string, unknown>[] = [];
                                    for (const row of parsed) {
                                        const isPassive = row.state === 'Listen' || row.state === null;
                                        if (isPassive) {
                                            const k = `${row.protocol}-${row.local_port}`;
                                            if (seenKey.has(k)) continue;
                                            seenKey.add(k);
                                        }
                                        rows.push(row);
                                    }
                                    const tcpActive  = rows.filter(r => r.protocol === 'TCP' && r.state !== 'Listen').sort((a,b) => a.local_port - b.local_port);
                                    const tcpListen  = rows.filter(r => r.protocol === 'TCP' && r.state === 'Listen').sort((a,b) => a.local_port - b.local_port);
                                    const udpRows    = rows.filter(r => r.protocol === 'UDP').sort((a,b) => a.local_port - b.local_port);

                                    const fmtAddr = (addr: string, port: number) => {
                                        const clean = addr.replace(/^\[(.+)\]$/, '$1');
                                        const label = PORT_KNOWN[port];
                                        return { addr: clean, port, label };
                                    };
                                    const AddrCell = ({ addr, port, dim }: { addr: string; port: number; dim?: boolean }) => {
                                        const { addr: a, label } = fmtAddr(addr, port);
                                        const hlCls = PORT_HIGHLIGHT[port] || '';
                                        return (
                                            <span className="flex items-baseline gap-1 font-mono" title={`${a}:${port}`}>
                                                <span className={cn('text-gray-400 truncate max-w-[100px]', dim && 'opacity-40')}>{a}</span>
                                                <span className="text-white/20">:</span>
                                                <span className={cn('font-bold shrink-0', hlCls || (dim ? 'text-gray-500' : 'text-gray-200'))}>{port}</span>
                                                {label && <span className="text-[9px] text-gray-600 shrink-0">{label}</span>}
                                            </span>
                                        );
                                    };
                                    const tableHeader = (
                                        <div className="grid gap-x-3 px-1 py-0.5 text-[9px] text-gray-700 uppercase tracking-wider border-b border-white/10 select-none"
                                            style={{gridTemplateColumns:'3rem 1fr 1fr 5.5rem 3.5rem'}}>
                                            <span>Proto</span><span>Local</span><span>Remote</span><span>State</span><span>PID</span>
                                        </div>
                                    );
                                    const NetRow = ({ row }: { row: Record<string, unknown> }) => {
                                        const stCls = row.state ? (STATE_CLS[row.state] || 'text-gray-400 border-gray-600 bg-gray-800/20') : '';
                                        const isListen = row.state === 'Listen';
                                        return (
                                            <div className="grid gap-x-3 px-1 py-0.5 items-center text-[10px] hover:bg-white/5 transition-colors"
                                                style={{gridTemplateColumns:'3rem 1fr 1fr 5.5rem 3.5rem'}}>
                                                <span className={cn('font-bold text-[9px] uppercase', row.protocol === 'TCP' ? 'text-blue-400' : 'text-purple-400')}>
                                                    {row.protocol}{row.ip_version === 6 ? '6' : '4'}
                                                </span>
                                                <AddrCell addr={row.local_address} port={row.local_port} />
                                                <AddrCell addr={row.remote_address} port={row.remote_port} dim={row.remote_port === 0} />
                                                {row.state ? (
                                                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 border rounded-sm w-fit', stCls)}>
                                                        {row.state.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-700 text-[9px]">—</span>
                                                )}
                                                <span className={cn('font-mono', isListen ? 'text-gray-600' : 'text-gray-400')}>{row.pid || '—'}</span>
                                            </div>
                                        );
                                    };
                                    return (
                                        <div key={id} className="space-y-3 text-[10px]">
                                            {/* ── Active connections ── */}
                                            {tcpActive.length > 0 && (
                                                <div className="border border-white/10 rounded bg-black/20">
                                                    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10">
                                                        <Activity size={11} className="text-signal" />
                                                        <span className="text-[10px] font-bold tracking-widest text-signal uppercase">Active Connections</span>
                                                        <span className="text-gray-700">({tcpActive.length})</span>
                                                    </div>
                                                    {tableHeader}
                                                    {tcpActive.map((row, i) => <NetRow key={i} row={row} />)}
                                                </div>
                                            )}
                                            {/* ── Listening ports ── */}
                                            {tcpListen.length > 0 && (
                                                <details className="border border-white/10 rounded bg-black/20" open={tcpActive.length === 0}>
                                                    <summary className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none list-none hover:bg-white/5">
                                                        <Network size={11} className="text-blue-400 shrink-0" />
                                                        <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase">Listening Ports</span>
                                                        <span className="text-gray-700">({tcpListen.length})</span>
                                                        <ChevronRight size={11} className="text-gray-700 ml-auto details-chevron" />
                                                    </summary>
                                                    {tableHeader}
                                                    {tcpListen.map((row, i) => <NetRow key={i} row={row} />)}
                                                </details>
                                            )}
                                            {/* ── UDP ── */}
                                            {udpRows.length > 0 && (
                                                <details className="border border-white/10 rounded bg-black/20">
                                                    <summary className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none list-none hover:bg-white/5">
                                                        <Wifi size={11} className="text-purple-400 shrink-0" />
                                                        <span className="text-[10px] font-bold tracking-widest text-purple-400 uppercase">UDP</span>
                                                        <span className="text-gray-700">({udpRows.length})</span>
                                                        <ChevronRight size={11} className="text-gray-700 ml-auto" />
                                                    </summary>
                                                    {tableHeader}
                                                    {udpRows.map((row, i) => <NetRow key={i} row={row} />)}
                                                </details>
                                            )}
                                        </div>
                                    );
                                }
                                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.process_id !== undefined) {
                                    return (
                                        <div key={id} className="space-y-1">
                                            {parsed.map((p: Record<string, unknown>, idx: number) => (
                                                <details key={`${id}-proc-${idx}`} className="bg-white/5 border border-white/10 rounded px-2 py-1">
                                                    <summary className="flex items-center gap-3 cursor-pointer text-white">
                                                        <span className="font-bold truncate">{p.name || "(unknown)"} (PID {p.process_id})</span>
                                                        <span className="text-xs text-gray-400 truncate">{p.user || ""}</span>
                                                    </summary>
                                                    <div className="mt-2 text-xs text-gray-200 space-y-1 break-all">
                                                        {p.description && <div><span className="text-gray-500">Desc:</span> {p.description}</div>}
                                                        {p.bin_path && <div><span className="text-gray-500">Bin:</span> {p.bin_path}</div>}
                                                        {p.command_line && <div><span className="text-gray-500">Cmd:</span> {p.command_line}</div>}
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    );
                                }
                                // ── Mimikatz output ──────────────────────────────────────
                                const isMimikatz = !parsed && (
                                    content.includes('mimikatz(commandline) #') ||
                                    (content.includes('mimikatz') && content.includes('[*] Calling PE entry point'))
                                );
                                if (isMimikatz) {
                                    return <MimikatzBlock key={id} content={content} taskId={task.id} taskDisplayId={task.display_id} callbackHost={callbackHost || ''} />;
                                }
                                // Plain text fallback — hide when structured output is present (ls/ifconfig/etc)
                                if (hasBuiltinStructuredOutput) return null;
                                return <div key={id} className={cn("mb-1", isError ? "text-red-400 border-l-2 border-red-500/50 pl-2" : "")}>{content}</div>;
                            })}
                        </>
                    );
                })()}
                {/* Pagination bar (server-side search mode) */}
                {paginatedResults !== null && (() => {
                    const limit = effectiveStreamLimit || 50;
                    const pageCount = Math.max(1, Math.ceil(totalSearchCount / limit));
                    if (pageCount < 2) return (
                        <div className="text-[9px] text-gray-600 font-mono text-right mt-1">{totalSearchCount} result{totalSearchCount !== 1 ? 's' : ''}</div>
                    );
                    const startPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
                    const pages = Array.from({length: Math.min(5, pageCount)}, (_, i) => startPage + i).filter(p => p >= 1 && p <= pageCount);
                    return (
                        <div className="flex items-center justify-center gap-1 pt-2 border-t border-white/5 mt-2 flex-wrap">
                            <button onClick={() => handlePageChange(1)} disabled={currentPage <= 1}
                                className="px-1.5 py-0.5 text-[10px] font-mono border border-white/10 rounded disabled:opacity-30 hover:border-signal/40 hover:text-signal transition-colors">«</button>
                            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}
                                className="px-1.5 py-0.5 text-[10px] font-mono border border-white/10 rounded disabled:opacity-30 hover:border-signal/40 hover:text-signal transition-colors">‹</button>
                            {pages.map(p => (
                                <button key={p} onClick={() => handlePageChange(p)}
                                    className={cn('px-1.5 py-0.5 text-[10px] font-mono border rounded transition-colors',
                                        p === currentPage ? 'border-signal/50 bg-signal/15 text-signal' : 'border-white/10 hover:border-signal/40 hover:text-signal')}>
                                    {p}
                                </button>
                            ))}
                            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= pageCount}
                                className="px-1.5 py-0.5 text-[10px] font-mono border border-white/10 rounded disabled:opacity-30 hover:border-signal/40 hover:text-signal transition-colors">›</button>
                            <button onClick={() => handlePageChange(pageCount)} disabled={currentPage >= pageCount}
                                className="px-1.5 py-0.5 text-[10px] font-mono border border-white/10 rounded disabled:opacity-30 hover:border-signal/40 hover:text-signal transition-colors">»</button>
                            <span className="text-[9px] text-gray-500 font-mono ml-1">
                                {currentPage}/{pageCount} · {totalSearchCount} results
                            </span>
                            {/* Back to live button when browsing pages without search */}
                            {!searchText.trim() && (
                                <button
                                    onClick={() => { setPaginatedResults(null); setCurrentPage(1); setTotalSearchCount(0); }}
                                    className="ml-2 px-2 py-0.5 text-[10px] font-mono border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                                >
                                    ← LIVE
                                </button>
                            )}
                        </div>
                    );
                })()}
                {liveResponses.length === 0 && !paginatedResults && (
                    <span className="text-gray-600 italic opacity-50">Waiting for output...</span>
                )}
            </div>
            )}
            {/* Panel: reveals over right 1/3 via clipPath — no transform, no sibling repaint */}
            <AnimatePresence>
            {panelContent && (
                <motion.div
                    className="absolute right-0 top-0 bottom-0 w-1/3 min-w-[200px] bg-[#050a06] border-l border-signal/40 overflow-hidden flex flex-col"
                    initial={{ clipPath: 'inset(0 0% 0 100%)' }}
                    animate={{ clipPath: 'inset(0 0% 0 0%)' }}
                    exit={{ clipPath: 'inset(0 0% 0 100%)' }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                    {panelContent}
                </motion.div>
            )}
            </AnimatePresence>
            </div>
            {/* Credentials harvested by this task */}
            {task.credentials && task.credentials.length > 0 && (
                <div className="px-4 pb-2">
                    <TaskCredentialsPanel credentials={task.credentials} />
                </div>
            )}
            {/* Credentials harvested by this task */}
            {task.credentials && task.credentials.length > 0 && (
                <div className="px-4 pb-2">
                    <TaskCredentialsPanel credentials={task.credentials} />
                </div>
            )}
            {/* Sub-tasks */}
            <SubTaskBlock parentTaskId={task.id} callbackHost={callbackHost} scrollRoot={scrollRoot} />
            </motion.div>
            )}
            </AnimatePresence>
        </div>
        {/* OPSEC Check Details Dialog */}
        {opsecDialogOpen.open && (
            <MythicDialog fullWidth={true} maxWidth="md" open={opsecDialogOpen.open}
                onClose={() => setOpsecDialogOpen(d => ({...d, open: false}))}
                innerDialog={<TaskOpsecDialog task_id={task.id} view={opsecDialogOpen.view}
                    onClose={() => setOpsecDialogOpen(d => ({...d, open: false}))} />}
            />
        )}
        {/* Edit Tags Dialog */}
        {editTagsOpen && (
            <MythicDialog fullWidth={true} maxWidth="lg" open={editTagsOpen}
                onClose={() => setEditTagsOpen(false)}
                innerDialog={<ViewEditTagsDialog me={{}} target_object="task_id"
                    target_object_id={task.id} onClose={() => setEditTagsOpen(false)} />}
            />
        )}
        {/* Trigger Eventing Dialog */}
        {eventingOpen && (
            <MythicDialog fullWidth={true} maxWidth="xl" open={eventingOpen}
                onClose={() => setEventingOpen(false)}
                innerDialog={<EventTriggerContextSelectDialog
                    onClose={() => setEventingOpen(false)}
                    triggerContext={{ name: "task_id", value: task.id }} />}
            />
        )}
        {/* Token Information Dialog */}
        {tokenDialogOpen && task.token && (
            <MythicDialog fullWidth={true} maxWidth="md" open={tokenDialogOpen}
                onClose={() => setTokenDialogOpen(false)}
                innerDialog={<TaskTokenDialog token_id={task.token.id} onClose={() => setTokenDialogOpen(false)} />}
            />
        )}
        {/* Screenshot fullscreen modal */}
        {expandedScreenshot && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                onClick={() => setExpandedScreenshot(null)}>
                <div className="relative max-w-[95vw] max-h-[95vh] flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-mono text-gray-400">{expandedScreenshot.alt}</span>
                        <button onClick={() => setExpandedScreenshot(null)}
                            className="text-gray-400 hover:text-signal font-mono text-sm px-2">✕</button>
                    </div>
                    <img src={expandedScreenshot.src} alt={expandedScreenshot.alt}
                        className="object-contain rounded border border-white/10"
                        style={{maxWidth:'95vw', maxHeight:'88vh'}} />
                    <div className="text-center">
                        <a href={expandedScreenshot.src} download target="_blank" rel="noreferrer"
                            className="text-[10px] font-mono text-signal/70 hover:text-signal">⬇ Download</a>
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

// ============================================
// Console Terminal
// ============================================
