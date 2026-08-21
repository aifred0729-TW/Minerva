import React, { useState } from 'react';
import { useLazyQuery } from "@apollo/client/react";
import { useNavigate } from 'react-router-dom';
import {
    FileText, Key, Keyboard, Shield, Database,
    Layers, User, Loader2, ChevronDown, ExternalLink, Wifi,
    Box, MessageSquare,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toLocalTime } from '../../lib/time';
import { GET_TASK_RESPONSES } from '../../lib/api/search';
import { useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';

// ── Result Components ─────────────────────────────────────────────────────────

export const TaskResult = ({ task }: { task: any }) => {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const [fetchResponses, { data: respData, loading: respLoading }] = useLazyQuery<any>(GET_TASK_RESPONSES, { fetchPolicy: 'no-cache' });
    // `response` is reachable through task.callback.operation_id, whose Hasura
    // filter is `_in X-Hasura-operations` — scope it to the current operation.
    const currentOperationId = useReactiveVar(meState)?.user?.current_operation_id as number | undefined;

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!expanded) {
            fetchResponses({ variables: { task_id: task.id, operation_id: currentOperationId } });
        }
        setExpanded(prev => !prev);
    };

    const responses = respData?.response || [];

    return (
    <div className="border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="p-3 cursor-pointer"
            onClick={() => task.callback?.display_id && navigate(`/console/${task.callback.display_id}`)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-signal font-mono text-sm font-bold">{task.command_name}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono uppercase",
                            task.status === "success" || task.status === "completed" ? "bg-green-500/10 text-green-400" :
                            task.status?.includes("error") ? "bg-red-500/10 text-red-400" :
                            "bg-gray-500/10 text-gray-400"
                        )}>{task.status}</span>
                        <ExternalLink size={10} className="text-gray-600" />
                    </div>
                    <p className="text-gray-300 font-mono text-xs truncate">{task.display_params || task.original_params || '(no parameters)'}</p>
                    {task.comment && <p className="text-gray-500 text-xs mt-1 italic">"{task.comment}"</p>}
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1 justify-end"><User size={11} />{task.operator?.username}</div>
                    <div>Callback #{task.callback?.display_id} · {task.callback?.host}</div>
                    <div>{toLocalTime(task.timestamp, false)}</div>
                </div>
            </div>
        </div>
        {/* Expand toggle for inline response viewer */}
        <div className="border-t border-ghost/10 px-3 py-1 flex items-center gap-2">
            <button onClick={handleExpand}
                className="flex items-center gap-1 text-[10px] font-mono text-gray-500 hover:text-signal transition-colors">
                <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
                {expanded ? 'HIDE' : 'VIEW'} RESPONSE
            </button>
            <span className="text-[10px] text-gray-600 font-mono">Task #{task.id}</span>
        </div>
        {expanded && (
            <div className="border-t border-ghost/10 px-3 py-2 max-h-[400px] overflow-auto bg-black/30">
                {respLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 size={16} className="text-signal animate-spin" />
                        <span className="text-xs text-gray-500 font-mono">Loading responses...</span>
                    </div>
                )}
                {!respLoading && responses.length === 0 && (
                    <div className="text-xs text-gray-600 font-mono py-2 text-center">No responses</div>
                )}
                {!respLoading && responses.length > 0 && (
                    <div className="space-y-1">
                        {responses.map((r: Record<string, unknown>) => {
                            let decoded = '';
                            try { decoded = atob(String(r.response_escape ?? '')); } catch { decoded = String(r.response_escape ?? ''); }
                            return (
                                <pre key={String(r.id)}
                                    className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-gray-300 bg-black/20 rounded px-2 py-1 border border-ghost/10">
                                    {decoded}
                                </pre>
                            );
                        })}
                    </div>
                )}
            </div>
        )}
    </div>
    );
};

export const CallbackResult = ({ callback }: { callback: any }) => {
    const navigate = useNavigate();
    return (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20 cursor-pointer"
        onClick={() => navigate(`/console/${callback.display_id}`)}>
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-signal font-bold">#{callback.display_id}</span>
                    <span className={cn("w-2 h-2 rounded-full", callback.active ? "bg-green-400 animate-pulse" : "bg-gray-600")} />
                    <span className="text-xs text-gray-400 font-mono">{callback.payload?.payloadtype?.name}</span>
                    <ExternalLink size={10} className="text-gray-600" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <div><span className="text-gray-500">Host:</span><span className="ml-1.5 text-white font-mono">{callback.host}</span></div>
                    <div><span className="text-gray-500">User:</span><span className="ml-1.5 text-white font-mono">{callback.user}</span></div>
                    <div><span className="text-gray-500">IP:</span><span className="ml-1.5 text-white font-mono">{callback.ip}</span></div>
                    <div><span className="text-gray-500">PID:</span><span className="ml-1.5 text-white font-mono">{callback.pid}</span></div>
                </div>
                {callback.description && <p className="text-gray-500 text-xs mt-1 italic">{callback.description}</p>}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Last: {toLocalTime(callback.last_checkin, false)}</div>
                <div>Init: {toLocalTime(callback.init_callback, false)}</div>
            </div>
        </div>
    </div>
    );
};

export const FileResult = ({ file }: { file: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <FileText size={14} className="text-signal shrink-0" />
                    <span className="text-white font-mono text-sm truncate">{file.filename_text}</span>
                    {file.is_screenshot && <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded shrink-0">Screenshot</span>}
                    {file.is_download_from_agent && <span className="px-1.5 py-0.5 bg-signal/10 text-signal text-[10px] rounded shrink-0">Download</span>}
                    {!file.is_download_from_agent && !file.is_screenshot && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] rounded shrink-0">Upload</span>}
                </div>
                {file.full_remote_path_text && <p className="text-gray-400 font-mono text-xs truncate">{file.full_remote_path_text}</p>}
                {file.comment && <p className="text-gray-500 text-xs mt-1 italic">"{file.comment}"</p>}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Host: {file.host}</div>
                <div>Callback #{file.task?.callback?.display_id}</div>
                <div>{file.complete ? 'Complete' : `${file.chunks_received}/${file.total_chunks}`}</div>
            </div>
        </div>
    </div>
);

export const CredentialResult = ({ credential }: { credential: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Key size={14} className="text-yellow-400" />
                    <span className="text-white font-mono font-bold">{credential.account}</span>
                    <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 text-[10px] rounded">{credential.type}</span>
                </div>
                <div className="text-xs"><span className="text-gray-500">Realm:</span><span className="ml-1.5 text-white font-mono">{credential.realm || 'N/A'}</span></div>
                <div className="text-xs mt-0.5 font-mono text-green-400 truncate">{credential.credential_text}</div>
                {credential.comment && <p className="text-gray-500 text-xs mt-1 italic">"{credential.comment}"</p>}
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>By: {credential.operator?.username}</div>
                <div>{toLocalTime(credential.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

export const ArtifactResult = ({ artifact }: { artifact: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Database size={14} className="text-orange-400" />
                    <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] rounded">{artifact.base_artifact}</span>
                </div>
                <p className="text-white font-mono text-sm">{artifact.artifact_text}</p>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Host: {artifact.host}</div>
                <div>Cmd: {artifact.task?.command_name}</div>
                <div>Callback #{artifact.task?.callback?.display_id}</div>
            </div>
        </div>
    </div>
);

export const KeylogResult = ({ keylog }: { keylog: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Keyboard size={14} className="text-purple-400" />
                    <span className="text-white text-sm">{keylog.window}</span>
                </div>
                <p className="text-green-400 font-mono text-sm bg-black/30 p-2 rounded break-all">{keylog.keystrokes_text}</p>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>User: {keylog.user}</div>
                <div>Host: {keylog.task?.callback?.host}</div>
                <div>{toLocalTime(keylog.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

export const PayloadResult = ({ payload }: { payload: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Box size={14} className="text-signal" />
                    <span className="text-signal font-mono">{payload.payloadtype?.name}</span>
                    <span className={cn("px-1.5 py-0.5 text-[10px] rounded",
                        payload.build_phase === "success" ? "bg-green-500/10 text-green-400" :
                        payload.build_phase === "error" ? "bg-red-500/10 text-red-400" :
                        "bg-gray-500/10 text-gray-400"
                    )}>{payload.build_phase}</span>
                </div>
                <p className="text-white font-mono text-sm">{payload.filemetum?.filename_text || payload.uuid}</p>
                {payload.description && <p className="text-gray-500 text-xs mt-1">{payload.description}</p>}
            </div>
            <div className="text-right text-xs text-gray-500">
                <div>{toLocalTime(payload.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

export const TokenResult = ({ token }: { token: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Shield size={14} className="text-blue-400" />
                    <span className="text-white font-mono font-bold">{token.user}</span>
                    <span className="text-gray-500 text-xs">ID: {token.token_id}</span>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Host: {token.task?.callback?.host}</div>
                <div>Callback #{token.task?.callback?.display_id}</div>
                <div>{toLocalTime(token.timestamp, false)}</div>
            </div>
        </div>
    </div>
);

export const ProcessResult = ({ process }: { process: any }) => {
    let metadata: any = {};
    try { metadata = typeof process.metadata === 'string' ? JSON.parse(process.metadata) : process.metadata || {}; } catch {}
    return (
        <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Layers size={14} className="text-cyan-400" />
                        <span className="text-white font-mono font-bold">{process.name_text}</span>
                        {metadata.process_id && <span className="text-gray-500 text-xs">PID: {metadata.process_id}</span>}
                    </div>
                    <p className="text-gray-400 font-mono text-xs truncate">{process.full_path_text}</p>
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div>Host: {process.host}</div>
                    <div>Callback #{process.task?.callback?.display_id}</div>
                </div>
            </div>
        </div>
    );
};

export const SocksResult = ({ socks }: { socks: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Wifi size={14} className="text-emerald-400" />
                    <span className="text-white font-mono font-bold">Port {socks.local_port}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded">{socks.port_type || 'SOCKS'}</span>
                </div>
                <div className="text-xs text-gray-400">
                    <span>Sent: {socks.bytes_sent ?? 0}B</span>
                    <span className="mx-2">·</span>
                    <span>Received: {socks.bytes_received ?? 0}B</span>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                <div>Callback #{socks.callback?.display_id}</div>
                <div>{socks.callback?.host} · {socks.callback?.user}</div>
            </div>
        </div>
    </div>
);

export const TagResultItem = ({ tag }: { tag: any }) => (
    <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
        <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <Database size={14} style={{ color: tag.tagtype?.color || '#888' }} />
                    <span className="text-white font-mono font-bold" style={{ color: tag.tagtype?.color }}>{tag.tagtype?.name || 'Tag'}</span>
                    {tag.source && <span className="text-gray-500 text-xs">source: {tag.source}</span>}
                </div>
                {tag.data && <p className="text-gray-300 font-mono text-xs">{typeof tag.data === 'string' ? tag.data : JSON.stringify(tag.data)}</p>}
                {tag.url && <p className="text-xs text-signal hover:underline mt-0.5"><a href={tag.url} target="_blank" rel="noreferrer">{tag.url}</a></p>}
            </div>
        </div>
    </div>
);

export const BrowserResult = ({ browser }: { browser: any }) => {
    let metadata: any = {};
    try { metadata = typeof browser.metadata === 'string' ? JSON.parse(browser.metadata) : browser.metadata || {}; } catch {}
    return (
        <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <ExternalLink size={14} className="text-teal-400" />
                        <span className="text-white font-mono font-bold">{browser.name_text}</span>
                        {metadata.size !== undefined && <span className="text-gray-500 text-xs">{metadata.size}B</span>}
                    </div>
                    <p className="text-gray-400 font-mono text-xs truncate">{browser.full_path_text}</p>
                    {browser.comment && <p className="text-gray-500 text-xs mt-1 italic">"{browser.comment}"</p>}
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div>Host: {browser.host}</div>
                    <div>Callback #{browser.task?.callback?.display_id}</div>
                    <div>{toLocalTime(browser.timestamp, false)}</div>
                </div>
            </div>
        </div>
    );
};

const INTERACTIVE_TYPE_LABELS: Record<number, string> = { 0: 'PTY', 1: 'File Browser', 2: 'Process Browser' };

export const InteractiveTaskResult = ({ task }: { task: any }) => {
    const navigate = useNavigate();
    const typeName = task.interactive_task_type != null
        ? INTERACTIVE_TYPE_LABELS[task.interactive_task_type] ?? `Type ${task.interactive_task_type}`
        : 'Unknown';
    return (
        <div className="p-3 border border-ghost/20 rounded hover:border-signal/30 transition-colors bg-black/20 cursor-pointer"
            onClick={() => task.callback?.display_id && navigate(`/console/${task.callback.display_id}`)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <MessageSquare size={14} className="text-amber-400" />
                        <span className="text-signal font-mono text-sm font-bold">{task.command_name}</span>
                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] rounded font-mono">{typeName}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono uppercase",
                            task.status === "success" || task.status === "completed" ? "bg-green-500/10 text-green-400" :
                            task.status?.includes("error") ? "bg-red-500/10 text-red-400" :
                            "bg-gray-500/10 text-gray-400"
                        )}>{task.status}</span>
                    </div>
                    <p className="text-gray-300 font-mono text-xs truncate">{task.display_params || task.original_params || '(no parameters)'}</p>
                    {task.comment && <p className="text-gray-500 text-xs mt-1 italic">"{task.comment}"</p>}
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1 justify-end"><User size={11} />{task.operator?.username}</div>
                    <div>Callback #{task.callback?.display_id} · {task.callback?.host}</div>
                    <div>{toLocalTime(task.timestamp, false)}</div>
                </div>
            </div>
        </div>
    );
};
