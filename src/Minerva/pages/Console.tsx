/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useSubscription, useLazyQuery, gql, useReactiveVar, useApolloClient } from '@apollo/client';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store';
import { meState } from '../../cache';
import { 
    GET_CALLBACK_DETAILS, 
    GET_FILE_TREE_ROOT, 
    GET_FILE_TREE_FOLDER, 
    GET_PROCESS_TREE, 
    STREAM_CALLBACK_TASKS, 
    CREATE_TASK_MUTATION,
    GET_ALL_CALLBACKS_BY_DOMAIN,
    GET_LOADED_COMMANDS_SUBSCRIPTION,
    GET_UPLOADED_FILES,
    GET_BUILT_PAYLOADS,
    REISSUE_TASK_MUTATION,
    REISSUE_TASK_HANDLER_MUTATION,
    UPDATE_TASK_COMMENT_MUTATION,
    GET_TASK_COMMENT_QUERY,
    GET_TASK_PARAMS_QUERY,
    GET_TASK_STDOUT_STDERR_QUERY,
    GET_ALL_TASK_RESPONSES,
    HIDE_CALLBACK_MUTATION,
    LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION,
    SUBSCRIPTION_CALLBACK_TOKENS,
    GET_OPERATORS_IN_OPERATION,
    STREAM_SUBTASKS,
    GET_KILL_COMMAND,
    STREAM_TASK_RESPONSES,
    GET_BROWSERSCRIPT,
    GET_RESPONSES_PAGINATED,
    GET_RESPONSES_ALL_SEARCH,
    STREAM_INTERACTIVE_SUBTASKS,
    CREATE_INTERACTIVE_TASK_MUTATION,
    GET_DYNAMIC_QUERY_PARAMS,
    CALLBACK_CONTEXT_SUBSCRIPTION,
    GET_EXIT_CALLBACK_COMMAND,
    GET_PROCESS_HOSTS,
} from '../lib/api';
import Anser from 'anser';
import { TaskOpsecDialog } from '../../components/pages/Callbacks/TaskOpsecDialog';
import { TaskTokenDialog } from '../../components/pages/Callbacks/TaskTokenDialog';
import { ViewEditTagsDialog } from '../../components/MythicComponents/MythicTag';
import { EventTriggerContextSelectDialog } from '../../components/pages/Eventing/EventTriggerContextSelect';
import { toPng } from 'html-to-image';
import { 
    Terminal, Cpu, Folder, FolderOpen, File, Activity, Server, Shield, Clock, Wifi, HardDrive, 
    Command, Play, PlayCircle, List, ArrowRight, User, Monitor, Info, ChevronRight, ChevronDown,
    RefreshCw, Download, Eye, FileText, Home, Network, Skull, LayoutList, GitBranch,
    Copy, ClipboardCopy, Globe, Hash, Zap, Lock, Unlock, XCircle, AlertTriangle, Upload, FolderSearch,
    MessageSquare, Search, RotateCcw, FileDown, SlidersHorizontal, Bug, ExternalLink,
    MoreHorizontal, CheckCircle, EyeOff, Filter, Key, ChevronUp, AlertCircle, Users,
    Tag, Image, Palette, WrapText, CornerDownLeft, SendHorizontal, X, Rows3, ListTree
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, isCallbackAlive } from '../lib/utils';
import {
    MythicTable,
    TerminalPanel,
    ProcessPanel,
    FilesPanel,
    DownloadPanel,
    ScreenshotPanel,
    OutputCallbackContext,
} from '../components/OutputRenderer';
import { snackActions } from '../../components/utilities/Snackbar';
import { validate as uuidValidate } from 'uuid';
import { MythicDialog } from '../../components/MythicComponents/MythicDialog';
import { TaskParametersDialog } from '../../components/pages/Callbacks/TaskParametersDialog';
import { useGetMythicSetting } from '../../components/MythicComponents/MythicSavedUserSetting';
import { operatorSettingDefaults } from '../../cache';

// ============================================
// Helper functions
// ============================================
const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const parseIP = (ip: string): string => {
    try { return JSON.parse(ip)?.[0] || ip; } catch { return ip || 'N/A'; }
};

const getIPRange = (ip: string): string => {
    const parsed = parseIP(ip);
    const parts = parsed.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return parsed;
};


const timeSince = (dateStr: string): string => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
};

// ============================================
// Filter Options
// ============================================
interface FilterOptions {
    operatorsList: string[];
    commentsFlag: boolean;
    commandsList: string[];
    everythingButList: string[];
    parameterString: string;
    hideErrors: boolean;
    hideBrowserScripts: boolean;
}
const defaultFilterOptions: FilterOptions = {
    operatorsList: [],
    commentsFlag: false,
    commandsList: [],
    everythingButList: [],
    parameterString: '',
    hideErrors: false,
    hideBrowserScripts: false,
};
const isFilterActive = (f: FilterOptions): boolean =>
    f.operatorsList.length > 0 ||
    f.commentsFlag ||
    f.commandsList.length > 0 ||
    f.everythingButList.length > 0 ||
    f.parameterString.trim() !== '' ||
    f.hideErrors ||
    f.hideBrowserScripts;

const applyFilterToTask = (task: any, f: FilterOptions, myUsername?: string): boolean => {
    // Hide "help" tasks issued by other operators (OldReactUI parity)
    if (myUsername && (task.display_params || '').includes('help') && task.operator?.username !== myUsername) {
        return false;
    }
    if (f.hideBrowserScripts) {
        if ((task.tasking_location || '').includes('browser')) return false;
    }
    if (f.operatorsList.length > 0) {
        if (!f.operatorsList.includes(task.operator?.username || '')) return false;
    }
    if (f.commentsFlag) {
        if (!task.comment) return false;
    }
    if (f.commandsList.length > 0) {
        if (!f.commandsList.includes(task.command_name || '')) return false;
    }
    if (f.everythingButList.length > 0) {
        if (f.everythingButList.includes(task.command_name || '')) return false;
    }
    if (f.parameterString.trim()) {
        try {
            const re = new RegExp(f.parameterString, 'i');
            if (!re.test(task.display_params || '')) return false;
        } catch {
            if (!(task.display_params || '').toLowerCase().includes(f.parameterString.toLowerCase())) return false;
        }
    }
    if (f.hideErrors) {
        if ((task.status || '').toLowerCase().includes('error')) return false;
    }
    return true;
};

// ============================================
// SubTaskBlock — recursive sub-task renderer
// ============================================
const SubTaskBlock = ({ parentTaskId, depth = 0, callbackHost, scrollRoot }: {
    parentTaskId: number;
    depth?: number;
    callbackHost?: string;
    scrollRoot?: React.RefObject<HTMLDivElement>;
}) => {
    const [subTaskMap, setSubTaskMap] = useState<Map<number, any>>(new Map());
    useSubscription(STREAM_SUBTASKS, {
        variables: { parent_task_id: parentTaskId },
        onData: ({ data: d }: any) => {
            const incoming: any[] = d?.data?.task_stream || [];
            setSubTaskMap(prev => {
                const next = new Map(prev);
                incoming.forEach((t: any) => next.set(t.id, { ...(next.get(t.id) || {}), ...t }));
                return next;
            });
        },
    });
    const subTasks = useMemo(() => [...subTaskMap.values()].sort((a, b) => a.id - b.id), [subTaskMap]);
    if (subTasks.length === 0) return null;
    const indent = depth * 16;
    return (
        <div style={{ marginLeft: indent + 8 }} className="mt-2 border-l border-signal/20 pl-3 space-y-2">
            {subTasks.map((sub: any) => {
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
                                {responses.map((r: any) => b64DecodeUnicode(r.response || '')).join('')}
                            </div>
                        )}
                        <SubTaskBlock parentTaskId={sub.id} depth={depth + 1} callbackHost={callbackHost} scrollRoot={scrollRoot} />
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// Token type
// ============================================
interface CallbackToken {
    token_id: number;
    id: number;
    user: string;
    description: string;
}

// ============================================
// OS Icons
// ============================================
const WindowsIcon = ({ size = 16 }: { size?: number }) => (
    <svg viewBox="0 0 88 88" style={{ width: size, height: size }} fill="currentColor">
        <path d="M0 12.402l35.687-4.86.016 34.423-35.67.203L0 12.402zm35.67 33.529l.028 34.453L.028 75.48.001 46.096l35.67-.165zm4.275-38.35l47.96-6.791.139 38.65-48.067.264-.031-32.123zm.062 36.333l47.996.227-.123 38.835-47.906-6.666.033-32.396z"/>
    </svg>
);
const LinuxIcon = ({ size = 16 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="currentColor">
        <path d="M12.504 0c-.155 0-.311.004-.466.012-4.209.212-6.772 2.992-7.49 5.793C4.244 7.185 4.5 8.7 5.5 9.5c1 .8 2 1.5 2.5 3 .5 1.5 1 3.5 2 4.5s2.5 1.5 3.5 1.5 2.5-.5 3.5-1.5 1.5-3 2-4.5c.5-1.5 1.5-2.2 2.5-3 1-.8 1.256-2.315.952-3.695-.718-2.801-3.281-5.581-7.49-5.793A8.67 8.67 0 0012.504 0z" opacity="0.7"/>
    </svg>
);
const MacOSIcon = ({ size = 16 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.98 1.07-3.11-1.04.05-2.29.69-3.02 1.55-.65.75-1.21 1.95-1.06 3.04 1.15.09 2.33-.63 3.01-1.48" />
    </svg>
);
const getOSIcon = (os: string, payloadType?: string, size = 16) => {
    const lowerOS = os?.toLowerCase() || "";
    const lowerType = payloadType?.toLowerCase() || "";
    if (lowerOS.includes("windows") || lowerType.includes("apollo")) return <WindowsIcon size={size} />;
    if (lowerOS.includes("linux") || lowerType.includes("poseidon")) return <LinuxIcon size={size} />;
    if (lowerOS.includes("mac") || lowerOS.includes("darwin")) return <MacOSIcon size={size} />;
    return <Monitor size={size} />;
};

// ============================================
// Context Menu
// ============================================
interface ContextMenuState {
    x: number;
    y: number;
    isDir: boolean;
    path: string;
    name: string;
}

const ContextMenu = ({ menu, onAction, onClose }: {
    menu: ContextMenuState;
    onAction: (action: string, path: string, name: string) => void;
    onClose: () => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const items = menu.isDir
        ? [
            { action: 'ls',     label: 'List directory',  icon: <FolderSearch size={13} /> },
            { action: 'upload', label: 'Upload file here', icon: <Upload size={13} /> },
          ]
        : [
            { action: 'cat',      label: 'View / cat',  icon: <Eye size={13} /> },
            { action: 'download', label: 'Download',     icon: <Download size={13} /> },
            { action: 'copy',     label: 'Copy path',    icon: <Copy size={13} /> },
          ];

    return (
        <div
            ref={ref}
            className="fixed z-[9999] bg-black/95 border border-signal/40 rounded shadow-xl min-w-[160px] py-1 font-mono text-xs"
            style={{ top: menu.y, left: menu.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-3 py-1.5 border-b border-white/10 text-gray-500 truncate max-w-[200px]" title={menu.path}>
                {menu.isDir ? '📁' : '📄'} {menu.name}
            </div>
            {items.map(({ action, label, icon }) => (
                <button
                    key={action}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors"
                    onClick={() => { onAction(action, menu.path, menu.name); onClose(); }}
                >
                    <span className="text-signal/70">{icon}</span>
                    {label}
                </button>
            ))}
        </div>
    );
};

// ============================================
// Task Block
// ============================================

// response_text is stored as base64(bytea) via PostgreSQL encode(response, 'base64')
// Always decode it – same logic as MythicReactUI's ResponseDisplay.js b64DecodeUnicode
const b64DecodeUnicode = (str: string): string => {
    if (!str || str.length === 0) return "";
    try {
        const text = window.atob(str);
        const length = text.length;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) bytes[i] = text.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        try { return decodeURIComponent(window.atob(str)); } catch {
            try { return window.atob(str); } catch {
                return str;
            }
        }
    }
};

const normalizeUnixPath = (path: string): string => {
    if (!path || path === '.' || path === '..') return path;
    // Windows absolute path (has backslash or starts with drive letter + slash)
    if (path.includes('\\') || /^[A-Za-z]:[\\/]/.test(path)) return path;
    // Windows drive root without trailing slash (e.g. "C:") → "C:\"
    if (/^[A-Za-z]:$/.test(path)) return path + '\\';
    return path.startsWith('/') ? path : '/' + path;
};

// Filter BrowserScript output by search text (OldReactUI filterOutput parity)
const filterBrowserScriptOutput = (scriptData: any, search: string): any => {
    if (!search) return scriptData;
    const s = search.toLowerCase();
    const copied: any = { ...scriptData };
    if (scriptData.plaintext !== undefined) {
        copied.plaintext = scriptData.plaintext.toLowerCase().includes(s) ? scriptData.plaintext : '';
    }
    if (Array.isArray(scriptData.table)) {
        copied.table = scriptData.table.map((t: any) => ({
            ...t,
            rows: (t.rows || []).filter((row: any) =>
                Object.values(row).some((cell: any) =>
                    (cell?.plaintext !== undefined && String(cell.plaintext).toLowerCase().includes(s)) ||
                    (cell?.button?.value !== undefined && JSON.stringify(cell.button.value).toLowerCase().includes(s))
                )
            ),
        }));
    }
    return copied;
};

// ============================================
// Task Panel Layout (title bar + scrollable body)
// Used as content inside the ConsoleTerminal scoped panel
// ============================================
const InlineModal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="w-[3px] h-4 bg-signal inline-block" />
                    <span className="font-mono text-[11px] font-bold text-signal tracking-widest uppercase">{title}</span>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-0.5"><XCircle size={15} /></button>
            </div>
            <div className="flex-1 overflow-auto p-5 cyber-scrollbar">{children}</div>
        </div>
    );
};

// Task Comment Modal
const TaskCommentModal = ({ taskId, onClose }: { taskId: number; onClose: () => void }) => {
    const [comment, setComment] = useState('');
    const { loading } = useQuery(GET_TASK_COMMENT_QUERY, {
        variables: { task_id: taskId },
        onCompleted: (d: any) => setComment(d.task_by_pk?.comment || ''),
        fetchPolicy: 'network-only',
    });
    const [updateComment, { loading: saving }] = useMutation(UPDATE_TASK_COMMENT_MUTATION);
    const handleSave = () => {
        updateComment({ variables: { task_id: taskId, comment } })
            .then(() => { snackActions.success('Comment saved'); onClose(); })
            .catch(() => snackActions.error('Failed to save comment'));
    };
    return (
        <InlineModal title="EDIT_TASK_COMMENT" onClose={onClose}>
            {loading ? (
                <div className="text-gray-500 animate-pulse font-mono text-sm py-4 text-center">Loading...</div>
            ) : (
                <>
                    <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={4}
                        className="w-full bg-black/60 border border-gray-700 focus:border-signal px-3 py-2 text-white font-mono text-sm resize-y outline-none transition-colors"
                        placeholder="Add a comment..."
                        autoFocus
                    />
                    <div className="flex justify-end gap-3 mt-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs transition-colors">CANCEL</button>
                        <button onClick={handleSave} disabled={saving}
                            className="px-5 py-2 bg-signal text-black font-mono text-xs font-bold hover:bg-white disabled:opacity-50 transition-colors">
                            {saving ? 'SAVING…' : 'SAVE'}
                        </button>
                    </div>
                </>
            )}
        </InlineModal>
    );
};

// Task Parameters Modal
const TaskParamsModal = ({ taskId, onClose }: { taskId: number; onClose: () => void }) => {
    const [text, setText] = useState('');
    const { loading } = useQuery(GET_TASK_PARAMS_QUERY, {
        variables: { task_id: taskId },
        onCompleted: (d: any) => {
            const t = d.task_by_pk;
            if (!t) { setText('Task not found'); return; }
            let s = `Original Parameters:\n${t.original_params ?? '(none)'}`;
            s += `\n\nDisplay Parameters:\n${t.display_params ?? '(none)'}`;
            s += `\n\nAgent Parameters:\n${t.params ?? '(none)'}`;
            s += `\n\nMythic Parsed Parameters:\n${t.mythic_parsed_params ?? '(none)'}`;
            s += `\n\nTasking Location:   ${t.tasking_location ?? '-'}`;
            s += `\nParameter Group:    ${t.parameter_group_name ?? '-'}`;
            if (t.command) s += `\nPayload Type:       ${t.command.payloadtype?.name ?? '-'}`;
            s += `\n\n──── TIMESTAMPS ────────────────────────`;
            s += `\nSubmitted:       ${t.status_timestamp_preprocessing ?? '-'}`;
            s += `\nAgent Pickup:    ${t.status_timestamp_processing ?? '-'}`;
            s += `\nFirst Response:  ${t.status_timestamp_processed ?? '-'}`;
            s += `\nLast Update:     ${t.timestamp ?? '-'}`;
            setText(s);
        },
        fetchPolicy: 'network-only',
    });
    return (
        <InlineModal title="TASK_PARAMETERS_AND_TIMESTAMPS" onClose={onClose}>
            {loading ? (
                <div className="text-gray-500 animate-pulse font-mono text-sm py-4 text-center">Loading...</div>
            ) : (
                <pre className="text-gray-200 text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed">{text}</pre>
            )}
        </InlineModal>
    );
};

// Task Stdout/Stderr Modal
const TaskStdoutStderrModal = ({ taskId, onClose }: { taskId: number; onClose: () => void }) => {
    const [text, setText] = useState('');
    const { loading } = useQuery(GET_TASK_STDOUT_STDERR_QUERY, {
        variables: { task_id: taskId },
        onCompleted: (d: any) => {
            const t = d.task_by_pk;
            if (!t) { setText('Task not found'); return; }
            const hasContent = (t.stdout && t.stdout.trim()) || (t.stderr && t.stderr.trim());
            if (!hasContent) { setText('(No stdout/stderr recorded for this task)'); return; }
            setText(`[STDOUT]:\n${t.stdout || '(empty)'}\n\n[STDERR]:\n${t.stderr || '(empty)'}`);
        },
        fetchPolicy: 'network-only',
    });
    return (
        <InlineModal title="TASK_STDOUT_STDERR" onClose={onClose}>
            {loading ? (
                <div className="text-gray-500 animate-pulse font-mono text-sm py-4 text-center">Loading...</div>
            ) : (
                <pre className="text-gray-200 text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed">{text}</pre>
            )}
        </InlineModal>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mimikatz: module-level parsers + auto-harvest credential mutation
// ─────────────────────────────────────────────────────────────────────────────
const CHECK_EXISTING_CREDENTIAL = gql`
    query CheckExistingCredential($account: String!, $realm: String!, $credential: String!, $type: String!) {
        credential(
            limit: 1
            where: {
                account: { _eq: $account }
                realm: { _eq: $realm }
                credential_text: { _eq: $credential }
                type: { _eq: $type }
                deleted: { _eq: false }
            }
        ) { id }
    }
`;
const CREATE_CREDENTIAL_MUT = gql`
    mutation AutoHarvestCredential($account: String!, $realm: String!, $credential: String!, $type: String!, $comment: String!) {
        createCredential(account: $account, realm: $realm, credential: $credential, credential_type: $type, comment: $comment) {
            status error id
        }
    }
`;

const mzParseSam = (body: string) => {
    const users: { rid: string; name: string; ntlm: string; ntlmHist: string[] }[] = [];
    body.split(/(?=RID\s+:)/).forEach(block => {
        const rM = block.match(/RID\s+:\s+\S+\s+\((\d+)\)/);
        const nM = block.match(/User\s+:\s+(\S+)/);
        const hM = block.match(/Hash NTLM:\s*([a-f0-9]{32})/i);
        if (rM && nM) {
            const hist = [...block.matchAll(/ntlm-\s*\d+:\s*([a-f0-9]{32})/gi)].map(m => m[1]);
            users.push({ rid: rM[1], name: nM[1].trim(), ntlm: hM ? hM[1] : '', ntlmHist: hist });
        }
    });
    return users;
};

const mzParseSecrets = (body: string) =>
    body.split(/\nSecret\s+:/).slice(1).map(block => {
        const nl2 = block.indexOf('\n');
        const name = block.substring(0, nl2).trim();
        return {
            name,
            curText: block.match(/cur\/text:\s*(.+)/)?.[1].trim(),
            curNtlm: block.match(/NTLM:([a-f0-9]{32})/i)?.[1],
            curSha1: block.match(/SHA1:([a-f0-9]+)/i)?.[1],
            oldText: block.match(/old\/text:\s*(.+)/)?.[1].trim(),
            error:   block.match(/ERROR\s+(.+)/)?.[0].trim(),
        };
    });

const mzParseCache = (body: string) =>
    body.split(/(?=\[NL\$)/).flatMap(block => {
        const sM = block.match(/\[(NL\$\d+)\s+-\s+([^\]]+)\]/);
        const uM = block.match(/User\s+:\s*([^\n]+)/);
        const hM = block.match(/MsCacheV2\s+:\s*([a-f0-9]+)/i);
        return (sM && uM && hM) ? [{ slot: sM[1], date: sM[2].trim(), user: uM[1].trim(), hash: hM[1].trim() }] : [];
    });

const mzParseLogon = (body: string) =>
    body.split(/Authentication Id\s*:/).slice(1).flatMap(block => {
        const uM = block.match(/User Name\s+:\s*(.+)/);
        if (!uM || uM[1].trim() === '(null)') return [];
        const dM  = block.match(/Domain\s+:\s*(.+)/);
        const nM  = block.match(/\*\s+NTLM\s*:\s*([a-f0-9]{32})/i);
        const sM  = block.match(/\*\s+SHA1\s*:\s*([a-f0-9]+)/i);
        const ptM = block.match(/\*\s+Password\s*:\s*(.+)/);
        return [{ user: uM[1].trim(), domain: dM?.[1].trim() || '', ntlm: nM?.[1], sha1: sM?.[1], plaintext: ptM && ptM[1].trim() !== '(null)' ? ptM[1].trim() : undefined }];
    });

interface MzExtractedCred { account: string; realm: string; credential: string; credType: 'hash'|'plaintext'; source: string; }

const mzExtractAllCreds = (sections: { cmd: string; body: string }[]): MzExtractedCred[] => {
    const out: MzExtractedCred[] = [];
    const isSensitiveSecret = (n: string) =>
        !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');
    sections.forEach(sec => {
        if (sec.cmd === 'lsadump::sam') {
            const domain = sec.body.match(/Domain\s+:\s*([^\n]+)/)?.[1]?.trim() || '';
            mzParseSam(sec.body).forEach(u => { if (u.ntlm) out.push({ account: u.name, realm: domain, credential: u.ntlm, credType: 'hash', source: 'lsadump::sam' }); });
        } else if (sec.cmd === 'sekurlsa::logonpasswords') {
            mzParseLogon(sec.body).forEach(s => {
                const dom = (s.domain && s.domain !== '(null)') ? s.domain : '';
                if (s.ntlm)      out.push({ account: s.user, realm: dom, credential: s.ntlm,      credType: 'hash',      source: 'sekurlsa::logonpasswords' });
                if (s.plaintext) out.push({ account: s.user, realm: dom, credential: s.plaintext, credType: 'plaintext', source: 'sekurlsa::logonpasswords' });
            });
        } else if (sec.cmd === 'lsadump::secrets') {
            const domain = sec.body.match(/Domain\s+:\s*([^\n]+)/)?.[1]?.trim() || '';
            mzParseSecrets(sec.body).forEach(s => {
                if (s.curNtlm)                        out.push({ account: s.name, realm: domain, credential: s.curNtlm, credType: 'hash',      source: 'lsadump::secrets' });
                if (s.curText && isSensitiveSecret(s.name)) out.push({ account: s.name, realm: domain, credential: s.curText, credType: 'plaintext', source: 'lsadump::secrets' });
            });
        } else if (sec.cmd === 'lsadump::cache') {
            const domain = sec.body.match(/Domain\s+:\s*([^\n]+)/)?.[1]?.trim() || '';
            mzParseCache(sec.body).forEach(c => { out.push({ account: c.user, realm: domain, credential: c.hash, credType: 'hash', source: 'lsadump::cache (MsCacheV2)' }); });
        }
    });
    return out;
};

const CMD_CLS_MAP: Record<string, string> = {
    'privilege::debug':         'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
    'sekurlsa::logonpasswords': 'text-red-400   border-red-500/40   bg-red-900/10',
    'token::elevate':           'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::sam':             'text-red-400   border-red-500/40   bg-red-900/10',
    'lsadump::secrets':        'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::cache':           'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'vault::cred /patch':       'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
};

const MimikatzBlock = ({ content, taskId, taskDisplayId, callbackHost }: {
    content: string; taskId: number; taskDisplayId: number; callbackHost: string;
}) => {
    const client = useApolloClient();
    const [createCred] = useMutation(CREATE_CREDENTIAL_MUT);
    const [vaultState, setVaultState] = useState<'idle'|'saving'|'saved'>('idle');
    const [savedCount, setSavedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);

    const mzParts   = content.split(/mimikatz\(commandline\)\s*#\s*/);
    const mzHeader  = mzParts[0];
    const mzSections: {cmd:string; body:string}[] = mzParts.slice(1).map(pt => {
        const nl = pt.indexOf('\n');
        return { cmd: nl >= 0 ? pt.substring(0, nl).trim() : pt.trim(), body: nl >= 0 ? pt.substring(nl + 1) : '' };
    });
    const verM  = mzHeader.match(/mimikatz\s+(\d+\.\d+\.\d+[^\s]*)/);
    const mzVer = verM ? verM[1] : null;

    // Extract all harvestable creds (stable reference via memo keyed on taskId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const extractedCreds = useMemo(() => mzExtractAllCreds(mzSections), [taskId]);

    // Auto-save – once per task per session, with duplicate detection
    useEffect(() => {
        const key = `mz_v_${taskId}`;
        const existing = sessionStorage.getItem(key);
        if (existing !== null) {
            setVaultState('saved');
            setSavedCount(Number(sessionStorage.getItem(key + '_cnt') || 0));
            setSkippedCount(Number(sessionStorage.getItem(key + '_skip') || 0));
            return;
        }
        if (extractedCreds.length === 0) return;
        setVaultState('saving');
        (async () => {
            let saved = 0;
            let skipped = 0;
            for (const c of extractedCreds) {
                try {
                    const account = c.account || '(unknown)';
                    const realm   = c.realm   || '';
                    // Check if this credential already exists
                    const { data: checkData } = await client.query({
                        query: CHECK_EXISTING_CREDENTIAL,
                        variables: { account, realm, credential: c.credential, type: c.credType },
                        fetchPolicy: 'no-cache',
                    });
                    if (checkData?.credential?.length > 0) {
                        skipped++;
                        continue; // already exists, skip
                    }
                    const ts = new Date().toISOString().slice(0, 10);
                    const res = await createCred({ variables: {
                        account,
                        realm,
                        credential: c.credential,
                        type:    c.credType,
                        comment: `[AUTO:mimikatz] ${c.source} · Task #${taskDisplayId} · Host: ${callbackHost} · ${ts}`,
                    }});
                    if (res.data?.createCredential?.status !== 'error') saved++;
                } catch { /* ignore individual failures */ }
            }
            sessionStorage.setItem(key, '1');
            sessionStorage.setItem(key + '_cnt', String(saved));
            sessionStorage.setItem(key + '_skip', String(skipped));
            setVaultState('saved');
            setSavedCount(saved);
            setSkippedCount(skipped);
        })();
    }, [taskId]); // intentionally run once per task only

    const isSensitiveSecret = (n: string) =>
        !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');

    return (
        <div className="space-y-2">
            {/* ── Banner ── */}
            <div className="flex items-center gap-2 flex-wrap border-b border-red-900/30 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-red-500/60 bg-red-900/25 text-red-400 rounded-sm">
                    ⚠ MIMIKATZ{mzVer ? ` ${mzVer}` : ''}
                </span>
                <span className="text-[9px] text-gray-600 font-mono">{mzSections.length} command{mzSections.length !== 1 ? 's' : ''}</span>
                {extractedCreds.length > 0 && (
                    <span className="text-[9px] text-red-400/70 font-mono">
                        · {extractedCreds.length} credential{extractedCreds.length !== 1 ? 's' : ''} extracted
                    </span>
                )}
                <span className="ml-auto">
                    {vaultState === 'saving' && (
                        <span className="flex items-center gap-1 text-[9px] text-yellow-400/80 font-mono animate-pulse">
                            <Activity size={10} className="animate-spin shrink-0" /> Saving to vault…
                        </span>
                    )}
                    {vaultState === 'saved' && extractedCreds.length > 0 && (
                        <span className="flex items-center gap-1 text-[9px] text-signal/80 font-mono">
                            <Key size={10} className="shrink-0" /> {savedCount} cred{savedCount !== 1 ? 's' : ''} saved to vault
                            {skippedCount > 0 && (
                                <span className="text-gray-500 ml-1">({skippedCount} duplicate{skippedCount !== 1 ? 's' : ''} skipped)</span>
                            )}
                        </span>
                    )}
                </span>
            </div>

            {/* ── Command sections ── */}
            {mzSections.map((sec, si) => {
                const cmdCls  = CMD_CLS_MAP[sec.cmd] || 'text-gray-400 border-gray-600/50 bg-gray-800/20';
                const hasErr  = /ERROR kuhl/.test(sec.body);
                const hasOk   = /\bOK\b/.test(sec.body) || /Privilege.*OK/.test(sec.body);
                return (
                    <div key={si} className="border border-white/8 rounded-sm overflow-hidden bg-black/25">
                        {/* cmd header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30 border-b border-white/5 flex-wrap">
                            <span className="text-gray-700 text-[9px] font-mono shrink-0">mimikatz #</span>
                            <span className={cn('text-[9px] font-bold px-2 py-0.5 border rounded-sm shrink-0', cmdCls)}>{sec.cmd}</span>
                            {hasErr && <span className="text-red-500/80 text-[9px] font-bold">✗ FAILED</span>}
                            {hasOk  && <span className="text-signal text-[9px] font-bold">✓ OK</span>}
                        </div>
                        <div className="px-3 py-2 text-xs font-mono">

                            {/* ── lsadump::sam ── */}
                            {sec.cmd === 'lsadump::sam' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const sysM  = sec.body.match(/SysKey\s+:\s*([a-f0-9]+)/i);
                                const samM  = sec.body.match(/SAMKey\s+:\s*([a-f0-9]+)/i);
                                const users = mzParseSam(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b border-white/5">
                                            {domM && <span><span className="text-gray-500">Domain </span><span className="text-cyan-300 font-bold">{domM[1].trim()}</span></span>}
                                            {sysM && <span><span className="text-gray-500">SysKey </span><span className="text-gray-400">{sysM[1]}</span></span>}
                                            {samM && <span><span className="text-gray-500">SAMKey </span><span className="text-gray-400">{samM[1]}</span></span>}
                                        </div>
                                        <div className="space-y-1.5">
                                            {users.map((u, ui) => (
                                                <div key={ui} className={cn('border rounded-sm px-2 py-1.5', u.ntlm ? 'border-red-500/40 bg-red-950/20' : 'border-gray-700/30 bg-black/10 opacity-60')}>
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="text-white font-bold text-sm">{u.name}</span>
                                                        <span className="text-gray-500 text-[10px]">RID {u.rid}</span>
                                                        {!u.ntlm && <span className="text-gray-500 italic text-[10px]">no hash</span>}
                                                    </div>
                                                    {u.ntlm && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase shrink-0">NTLM</span>
                                                            <span className="text-red-200 select-all text-[13px] tracking-wide break-all flex-1">{u.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(u.ntlm)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy hash"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {u.ntlmHist.length > 1 && (
                                                        <details className="mt-1">
                                                            <summary className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">{u.ntlmHist.length} historical hashes</summary>
                                                            <div className="mt-1 pl-2 border-l border-gray-700 space-y-0.5">
                                                                {u.ntlmHist.slice(1).map((h, hi) => (
                                                                    <div key={hi} className="flex gap-2 text-[10px]">
                                                                        <span className="text-gray-600 w-12 shrink-0">ntlm-{hi+1}</span>
                                                                        <span className="text-gray-400 select-all break-all flex-1">{h}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(h)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={10} className="text-gray-600 hover:text-white" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── lsadump::secrets ── */}
                            {sec.cmd === 'lsadump::secrets' && (() => {
                                const domM   = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM  = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const secrets = mzParseSecrets(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b border-white/5">
                                            {domM  && <span><span className="text-gray-500">Domain </span><span className="text-cyan-300 font-bold">{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span className="text-gray-500">FQDN </span><span className="text-cyan-300/80">{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {secrets.map((s, si2) => {
                                            const sens = isSensitiveSecret(s.name);
                                            const active = s.curText && sens;
                                            return (
                                                <div key={si2} className={cn('border rounded-sm px-2 py-1.5', active ? 'border-red-500/50 bg-red-950/25' : 'border-gray-700/30 bg-black/10')}>
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <Lock size={11} className={cn('shrink-0', active ? 'text-red-400' : 'text-gray-600')} />
                                                        <span className={cn('font-bold text-sm', active ? 'text-white' : 'text-gray-400')}>{s.name}</span>
                                                    </div>
                                                    {s.error && <div className="text-red-400 text-[10px] mb-1">{s.error}</div>}
                                                    {s.curText && (
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-[10px] text-green-400 uppercase font-bold tracking-wider shrink-0">cur</span>
                                                            <span className={cn('select-all break-all flex-1 text-[13px]', sens ? 'text-red-200 font-bold' : 'text-gray-300')}>{s.curText}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curText!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.curNtlm && (
                                                        <div className="flex gap-2.5 mt-0.5 items-center">
                                                            <span className="text-[10px] text-red-400 font-bold uppercase shrink-0">NTLM</span>
                                                            <span className="text-red-200 select-all break-all flex-1 text-[13px] tracking-wide">{s.curNtlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curNtlm!)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.curSha1 && <div className="flex gap-2.5 mt-0.5 items-center"><span className="text-[10px] text-gray-500 font-bold uppercase shrink-0">SHA1</span><span className="text-gray-400 select-all break-all flex-1">{s.curSha1}</span></div>}
                                                    {s.oldText && s.oldText !== s.curText && (
                                                        <div className="flex items-start gap-2 mt-1 pt-1 border-t border-white/5">
                                                            <span className="text-[10px] text-gray-600 uppercase font-bold tracking-wider shrink-0 mt-0.5">old</span>
                                                            <span className="text-gray-500 select-all break-all">{s.oldText}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* ── lsadump::cache ── */}
                            {sec.cmd === 'lsadump::cache' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const creds = mzParseCache(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b border-white/5">
                                            {domM  && <span><span className="text-gray-500">Domain </span><span className="text-cyan-300 font-bold">{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span className="text-gray-500">FQDN </span><span className="text-cyan-300/80">{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {creds.length === 0 && <div className="text-gray-500 italic">No cached credentials</div>}
                                        <div className="space-y-1.5">
                                            {creds.map((c, ci) => (
                                                <div key={ci} className="border border-orange-500/40 bg-orange-950/20 rounded-sm px-2 py-1.5">
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="text-white font-bold text-sm">{c.user}</span>
                                                        <span className="text-gray-500 text-[10px]">{c.slot}</span>
                                                        <span className="text-gray-500 text-[10px]">{c.date}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-orange-400 uppercase font-bold tracking-wider shrink-0">MsCacheV2</span>
                                                        <span className="text-orange-200 select-all break-all text-[13px] tracking-wide flex-1">{c.hash}</span>
                                                        <button onClick={() => navigator.clipboard.writeText(c.hash)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── sekurlsa::logonpasswords ── */}
                            {sec.cmd === 'sekurlsa::logonpasswords' && (() => {
                                const sessions = mzParseLogon(sec.body);
                                return (
                                    <div className="space-y-1.5">
                                        {sessions.length === 0 && (
                                            <div className="text-red-400 text-[10px]">
                                                {sec.body.split('\n').find((l: string) => l.includes('ERROR')) || 'No credentials extracted'}
                                            </div>
                                        )}
                                        {sessions.map((s, si2) => {
                                            const label = `${s.domain && s.domain !== '(null)' ? s.domain + '\\' : ''}${s.user}`;
                                            return (
                                                <div key={si2} className="border border-red-500/40 bg-red-950/20 rounded-sm px-2 py-2">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="text-white font-bold text-sm flex-1">{label}</span>
                                                        {s.plaintext && <span className="text-[10px] px-1.5 py-0.5 border border-green-500/50 text-green-300 bg-green-900/25 rounded-sm font-bold shrink-0">PLAINTEXT</span>}
                                                    </div>
                                                    {s.plaintext && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] text-green-400 font-bold uppercase shrink-0">PASS</span>
                                                            <span className="text-green-200 font-bold select-all flex-1 text-[13px]">{s.plaintext}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.plaintext!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy password"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.ntlm && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] text-red-400 font-bold uppercase shrink-0">NTLM</span>
                                                            <span className="text-red-200 select-all flex-1 text-[13px] tracking-wide">{s.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.ntlm!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy hash"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.sha1 && <div className="flex gap-2.5 items-center"><span className="text-[10px] text-gray-500 font-bold uppercase shrink-0">SHA1</span><span className="text-gray-400 select-all">{s.sha1}</span></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* ── generic / privilege / token / vault ── */}
                            {sec.cmd !== 'lsadump::sam' && sec.cmd !== 'lsadump::secrets' &&
                             sec.cmd !== 'lsadump::cache' && sec.cmd !== 'sekurlsa::logonpasswords' && (
                                <div className="space-y-0.5">
                                    {sec.body.split('\n').filter((l: string) => l.trim()).map((line: string, li: number) => (
                                        <div key={li} className={cn('text-[11px] leading-relaxed',
                                            /^ERROR/i.test(line.trim())                  ? 'text-red-400 font-bold' :
                                            /Privilege.*OK|\bOK\b/.test(line)            ? 'text-signal font-bold' :
                                            /NT AUTHORITY|S-1-5-|Impersonated/.test(line)? 'text-orange-300 font-semibold' :
                                            /[a-f0-9]{32}/i.test(line)                  ? 'text-red-200 font-mono tracking-wide' :
                                            /^\s*\*/.test(line)                         ? 'text-gray-200' :
                                            'text-gray-300'
                                        )}>{line}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// Interactive Terminal Helpers
// ============================================
const itzHandleTerminalCodes = (raw: string): string => {
    let out = raw.replaceAll('[?2004h', '').replaceAll('[?2004l', '');
    // Strip OSC title sequences (ESC ]0; ... BEL)
    let ti = out.indexOf(']0');
    if (ti >= 0) {
        const te = out.indexOf('\x07', ti);
        if (te >= 0) out = out.substring(0, ti) + out.substring(te + 1);
    }
    // Erase-to-end-of-display [J
    let cj = out.indexOf('[J');
    if (cj >= 0) {
        let nl = 0;
        for (let i = cj; i >= 0; i--) { if (out[i] === '\n') { nl = i; break; } }
        out = out.substring(0, nl + 1) + out.substring(cj + 2);
    }
    return out;
};

const INTERACTIVE_CTRL_TYPES = [
    { name: 'None',    value: -1, text: '' },
    { name: 'Tab',     value: 13, text: '^I' },
    { name: 'Backspace', value: 12, text: '^H' },
    { name: 'Exit',    value: 3,  text: 'exit' },
    { name: 'Escape',  value: 4,  text: '^[' },
    { name: 'Ctrl+A',  value: 5,  text: '^A' },
    { name: 'Ctrl+B',  value: 6,  text: '^B' },
    { name: 'Ctrl+C',  value: 7,  text: '^C' },
    { name: 'Ctrl+D',  value: 8,  text: '^D' },
    { name: 'Ctrl+E',  value: 9,  text: '^E' },
    { name: 'Ctrl+F',  value: 10, text: '^F' },
    { name: 'Ctrl+G',  value: 11, text: '^G' },
    { name: 'Ctrl+K',  value: 14, text: '^K' },
    { name: 'Ctrl+L',  value: 15, text: '^L' },
    { name: 'Ctrl+N',  value: 16, text: '^N' },
    { name: 'Ctrl+P',  value: 17, text: '^P' },
    { name: 'Ctrl+Q',  value: 18, text: '^Q' },
    { name: 'Ctrl+R',  value: 19, text: '^R' },
    { name: 'Ctrl+S',  value: 20, text: '^S' },
    { name: 'Ctrl+U',  value: 21, text: '^U' },
    { name: 'Ctrl+W',  value: 22, text: '^W' },
    { name: 'Ctrl+Y',  value: 23, text: '^Y' },
    { name: 'Ctrl+Z',  value: 24, text: '^Z' },
] as const;

const INTERACTIVE_ENTER_OPTS = [
    { name: 'None', value: '' },
    { name: 'LF',   value: '\n' },
    { name: 'CR',   value: '\r' },
    { name: 'CRLF', value: '\r\n' },
] as const;

// ============================================
// InteractiveTaskBlock
// ============================================
const InteractiveTaskBlock = ({ taskId, task, liveResponses, callbackDisplayId, commandName, myUsername }: {
    taskId: number;
    task: any;
    liveResponses: any[];        // base64-encoded rows from TaskBlock's STREAM_TASK_RESPONSES
    callbackDisplayId: number;
    commandName: string;
    myUsername: string;
}) => {
    const PAGE_SIZE = 100;

    // ── Decode base64 responses ────────────────────────────────
    const decodedResponses = useMemo(() =>
        liveResponses.map(r => ({
            _type: 'response' as const,
            id: r.id,
            timestamp: r.timestamp,
            text: b64DecodeUnicode(r.response || ''),
            is_error: !!r.is_error,
        })),
        [liveResponses]
    );

    // ── Stream sent interactive sub-tasks ─────────────────────
    const [subTasks, setSubTasks] = useState<any[]>([]);
    const prevTaskIdRef = useRef(taskId);
    useSubscription(STREAM_INTERACTIVE_SUBTASKS, {
        variables: { parent_task_id: taskId },
        fetchPolicy: 'no-cache',
        onData: ({ data: d }: any) => {
            const incoming: any[] = d?.data?.task_stream || [];
            if (!incoming.length) return;
            if (taskId !== prevTaskIdRef.current) {
                setSubTasks(incoming);
                prevTaskIdRef.current = taskId;
            } else {
                setSubTasks(prev =>
                    incoming.reduce((acc: any[], cur: any) => {
                        const idx = acc.findIndex(t => t.id === cur.id);
                        if (idx >= 0) { const next = [...acc]; next[idx] = cur; return next; }
                        return [...acc, cur];
                    }, [...prev])
                );
            }
        },
    });

    // ── Merge + sort responses and sent inputs ─────────────────
    const allOutputAll = useMemo(() => {
        const inputEntries = subTasks.map(t => ({
            _type: 'input' as const,
            id: t.id,
            timestamp: t.status_timestamp_preprocessing || t.timestamp,
            text: t.original_params || t.display_params || '',
            status: t.status as string,
        }));
        const merged = [...decodedResponses, ...inputEntries];
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return merged;
    }, [decodedResponses, subTasks]);

    // ── UI state ────────────────────────────────────────────────
    const [inputText, setInputText]       = useState('');
    const [useAnsi, setUseAnsi]           = useState(true);
    const [showStatus, setShowStatus]     = useState(true);
    const [wrapText, setWrapText]         = useState(true);
    const [ctrlType, setCtrlType]         = useState<(typeof INTERACTIVE_CTRL_TYPES)[number]>(INTERACTIVE_CTRL_TYPES[0]);
    const [enterOpt, setEnterOpt]         = useState<(typeof INTERACTIVE_ENTER_OPTS)[number]>(INTERACTIVE_ENTER_OPTS[1]);
    const [search, setSearch]             = useState('');
    const [currentPage, setCurrentPage]   = useState(1);
    const [historyIdx, setHistoryIdx]     = useState(-1);
    const inputRef         = useRef<HTMLInputElement>(null);
    const outputEndRef     = useRef<HTMLDivElement>(null);
    const outputContainerRef = useRef<HTMLDivElement>(null);

    // ── Mutation ────────────────────────────────────────────────
    const [createInteractiveTask] = useMutation(CREATE_INTERACTIVE_TASK_MUTATION, {
        onError: (err: any) => snackActions.error(err.message),
        update: (_: any, { data }: any) => {
            if (data?.createTask?.status === 'error') snackActions.error(data.createTask.error);
        },
    });

    // ── Filtered + paginated display ────────────────────────────
    const filteredOutput = useMemo(() => {
        if (!search.trim()) return allOutputAll;
        const s = search.toLowerCase();
        return allOutputAll.filter(e => e.text.toLowerCase().includes(s));
    }, [allOutputAll, search]);

    useEffect(() => { setCurrentPage(1); }, [search]);

    const pageCount = Math.max(1, Math.ceil(filteredOutput.length / PAGE_SIZE));
    const displayedOutput = useMemo(() =>
        filteredOutput.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filteredOutput, currentPage]
    );

    // ── Auto-scroll (my tasks only) ─────────────────────────────
    const isMyTask = task?.operator?.username === myUsername;
    const prevLenRef = useRef(0);
    useLayoutEffect(() => {
        const el = outputContainerRef.current;
        if (!el || !isMyTask || !outputEndRef.current) return;
        const grew = filteredOutput.length > prevLenRef.current;
        prevLenRef.current = filteredOutput.length;
        const onLastPage = currentPage === pageCount;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 500;
        if (grew && onLastPage && nearBottom && !search) {
            outputEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        }
    }, [displayedOutput]);

    // ── History navigation ──────────────────────────────────────
    const historyOptions = useMemo(() =>
        subTasks
            .filter(t => (t.display_params?.length ?? 0) > 1 &&
                (t.interactive_task_type === 0 || t.interactive_task_type === 8))
            .sort((a: any, b: any) => b.id - a.id),
        [subTasks]
    );

    // ── Send handler ────────────────────────────────────────────
    const handleSend = useCallback(() => {
        if (!commandName) { snackActions.warning('Command name unknown for this task'); return; }
        const ctrl = ctrlType;
        const enter = enterOpt;
        let params: string;
        let originalParams: string;

        if (ctrl.value > 0) {
            if (ctrl.value === 8) {
                // Ctrl+D: no line ending
                params = inputText;
                originalParams = inputText + ctrl.text;
            } else if (ctrl.value === 4) {
                // Escape: escape prefix first, no line ending
                params = inputText + enter.value;
                originalParams = ctrl.text + inputText;
            } else {
                params = inputText + enter.value;
                originalParams = inputText + ctrl.text + enter.value;
            }
        } else {
            params = inputText + enter.value;
            originalParams = inputText + enter.value;
        }

        createInteractiveTask({
            variables: {
                callback_id: callbackDisplayId,
                command: commandName,
                params,
                original_params: originalParams,
                tasking_location: 'command_line',
                parameter_group_name: 'default',
                parent_task_id: taskId,
                interactive_task_type: ctrl.value > 0 ? ctrl.value : 0,
            },
        });
        setInputText('');
        setCtrlType(INTERACTIVE_CTRL_TYPES[0]);
        setHistoryIdx(-1);
    }, [inputText, ctrlType, enterOpt, commandName, callbackDisplayId, taskId, createInteractiveTask]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleSend();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const ni = Math.min(historyIdx + 1, historyOptions.length - 1);
            if (ni >= 0 && historyOptions[ni]) {
                setHistoryIdx(ni);
                setInputText(historyOptions[ni].display_params.trim());
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const ni = historyIdx - 1;
            if (ni < 0) { setHistoryIdx(-1); setInputText(''); }
            else if (historyOptions[ni]) { setHistoryIdx(ni); setInputText(historyOptions[ni].display_params.trim()); }
        }
    };

    // ── ANSI rendering (inline styles — no external CSS needed) ─
    const renderAnsiText = useCallback((text: string): React.ReactNode => {
        try {
            const tokens: any[] = Anser.ansiToJson(itzHandleTerminalCodes(text), {
                json: true,
                remove_empty: true,
            });
            return tokens.map((token, i) => {
                const style: React.CSSProperties = {
                    display: 'inline',
                    whiteSpace: wrapText ? 'pre-wrap' : 'pre',
                    wordBreak: wrapText ? 'break-all' : 'normal',
                };
                const fg = token.fg_truecolor || token.fg;
                const bg = token.bg_truecolor || token.bg;
                if (fg) style.color = `rgb(${fg})`;
                if (bg) style.backgroundColor = `rgb(${bg})`;
                if (token.decoration === 'bold')      style.fontWeight = 'bold';
                if (token.decoration === 'italic')    style.fontStyle = 'italic';
                if (token.decoration === 'underline') style.textDecoration = 'underline';
                if (token.decoration === 'reverse')   [style.color, style.backgroundColor] = [style.backgroundColor, style.color];
                return <span key={i} style={style}>{token.content}</span>;
            });
        } catch {
            return <span style={{ display: 'inline', whiteSpace: wrapText ? 'pre-wrap' : 'pre' }}>{itzHandleTerminalCodes(text)}</span>;
        }
    }, [wrapText]);

    // ── Entry renderer ──────────────────────────────────────────
    type Entry = { _type: 'response' | 'input'; id: number; text: string; is_error?: boolean; status?: string };
    const renderEntry = (entry: Entry, idx: number) => {
        const key = `${entry._type}-${entry.id}-${idx}`;
        const baseStyle: React.CSSProperties = {
            display: 'inline',
            margin: 0,
            whiteSpace: wrapText ? 'pre-wrap' : 'pre',
            wordBreak: wrapText ? 'break-all' : 'normal',
        };

        if (entry._type === 'response') {
            if (entry.is_error) {
                return (
                    <pre key={key} style={{ ...baseStyle, backgroundColor: '#1a0505', color: '#fca5a5' }}>
                        {entry.text}
                    </pre>
                );
            }
            return (
                <pre key={key} style={baseStyle}>
                    {useAnsi ? renderAnsiText(entry.text) : entry.text}
                </pre>
            );
        }

        // Input echo
        const statusIcon = showStatus
            ? (entry.status === 'completed' || entry.status === 'success')
                ? <CheckCircle size={9} className="inline text-green-400 mr-0.5 relative top-[-1px]" />
                : entry.status === 'submitted'
                    ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse mr-1 relative top-[-1px]" />
                    : null
            : null;
        return (
            <pre key={key} style={{ ...baseStyle, color: '#22d3ee', whiteSpace: 'pre-wrap' }}>
                {statusIcon}{entry.text}
            </pre>
        );
    };

    // ── Render ──────────────────────────────────────────────────
    return (
        <div className="flex flex-col rounded border border-purple-500/30 bg-black/60 overflow-hidden mt-2">

            {/* ── Header bar ── */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-950/30 border-b border-purple-500/20">
                <Terminal size={11} className="text-purple-400 shrink-0" />
                <span className="font-mono text-[10px] font-bold tracking-wider text-purple-300">INTERACTIVE TERMINAL</span>
                {commandName && (
                    <span className="font-mono text-[10px] text-purple-400/50">— {commandName}</span>
                )}
                {/* Right-side toggles */}
                <div className="ml-auto flex items-center gap-1">
                    <button
                        title={useAnsi ? 'Disable ANSI Color' : 'Enable ANSI Color'}
                        onClick={() => setUseAnsi(v => !v)}
                        className={cn('p-1 rounded border transition-colors',
                            useAnsi ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/5 text-gray-600 hover:text-gray-400')}>
                        <Palette size={10} />
                    </button>
                    <button
                        title={showStatus ? 'Hide Task Status Icons' : 'Show Task Status Icons'}
                        onClick={() => setShowStatus(v => !v)}
                        className={cn('p-1 rounded border transition-colors',
                            showStatus ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/5 text-gray-600 hover:text-gray-400')}>
                        <CheckCircle size={10} />
                    </button>
                    <button
                        title={wrapText ? 'Disable Text Wrap' : 'Enable Text Wrap'}
                        onClick={() => setWrapText(v => !v)}
                        className={cn('p-1 rounded border transition-colors',
                            wrapText ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/5 text-gray-600 hover:text-gray-400')}>
                        <WrapText size={10} />
                    </button>
                    <span className="font-mono text-[9px] text-gray-700 ml-1 select-none">
                        ↑↓  history
                    </span>
                </div>
            </div>

            {/* ── Output area ── */}
            <div
                ref={outputContainerRef}
                className="font-mono text-[11px] text-gray-200 px-2.5 py-2 overflow-y-auto bg-black/30 select-text"
                style={{ minHeight: '260px', maxHeight: '560px' }}>
                {displayedOutput.map((entry, idx) => renderEntry(entry as Entry, idx))}
                <div ref={outputEndRef} />
            </div>

            {/* ── Pagination bar ── */}
            {pageCount > 1 && (
                <div className="flex items-center justify-center gap-1 py-1 border-t border-white/5 bg-black/20 font-mono text-[10px]">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">«</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">‹</button>
                    {(() => {
                        const pages: (number | '...')[] = [];
                        if (pageCount <= 9) {
                            for (let i = 1; i <= pageCount; i++) pages.push(i);
                        } else {
                            pages.push(1);
                            if (currentPage > 4) pages.push('...');
                            const start = Math.max(2, currentPage - 2);
                            const end = Math.min(pageCount - 1, currentPage + 2);
                            for (let i = start; i <= end; i++) pages.push(i);
                            if (currentPage < pageCount - 3) pages.push('...');
                            pages.push(pageCount);
                        }
                        return pages.map((p, i) =>
                            p === '...'
                                ? <span key={`e${i}`} className="px-1 text-gray-600">…</span>
                                : <button key={p} onClick={() => setCurrentPage(p)}
                                    className={cn('px-1.5 py-0.5 rounded border transition-colors',
                                        p === currentPage ? 'border-signal/40 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-gray-300')}>{p}</button>
                        );
                    })()}
                    <button onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">›</button>
                    <button onClick={() => setCurrentPage(pageCount)} disabled={currentPage === pageCount}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">»</button>
                    <span className="text-gray-600 ml-2">Total: {filteredOutput.length}</span>
                </div>
            )}

            {/* ── Search bar ── */}
            <div className="flex items-center gap-2 px-3 py-1 border-t border-white/5 bg-black/20">
                <Search size={9} className="text-gray-600 shrink-0" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="filter output..."
                    className="flex-1 bg-transparent font-mono text-[10px] text-gray-400 placeholder-gray-700 outline-none"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-400 transition-colors">
                        <XCircle size={9} />
                    </button>
                )}
            </div>

            {/* ── Input bar ── */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-purple-500/20 bg-black/40">
                {/* Control sequence selector */}
                <select
                    value={ctrlType.value}
                    onChange={e => {
                        const found = INTERACTIVE_CTRL_TYPES.find(c => c.value === Number(e.target.value));
                        if (found) setCtrlType(found);
                    }}
                    className="bg-black/60 border border-white/10 rounded font-mono text-[10px] text-gray-300 px-1.5 py-0.5 focus:outline-none focus:border-purple-400/40 min-w-[4.5rem] shrink-0 transition-colors">
                    {INTERACTIVE_CTRL_TYPES.map(o => (
                        <option key={o.value} value={o.value}>{o.name}</option>
                    ))}
                </select>

                {/* Main text input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={e => { setInputText(e.target.value); setHistoryIdx(-1); }}
                    onKeyDown={handleKeyDown}
                    placeholder=">_ type here..."
                    autoFocus
                    className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-gray-100 placeholder-gray-700 focus:outline-none focus:border-purple-400/30 transition-colors min-w-0"
                />

                {/* Line-ending selector */}
                <select
                    value={enterOpt.name}
                    onChange={e => {
                        const found = INTERACTIVE_ENTER_OPTS.find(o => o.name === e.target.value);
                        if (found) setEnterOpt(found);
                    }}
                    className="bg-black/60 border border-white/10 rounded font-mono text-[10px] text-gray-300 px-1.5 py-0.5 focus:outline-none focus:border-purple-400/40 w-[52px] shrink-0 transition-colors">
                    {INTERACTIVE_ENTER_OPTS.map(o => (
                        <option key={o.name} value={o.name}>{o.name}</option>
                    ))}
                </select>

                {/* Send button */}
                <button
                    onClick={handleSend}
                    title="Send (Enter)"
                    className="p-1.5 rounded border border-purple-500/30 bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 hover:border-purple-400/40 transition-colors shrink-0">
                    <CornerDownLeft size={11} />
                </button>
            </div>
        </div>
    );
};

/* ─────────── TaskCredentialsPanel ─────────── */
const TaskCredentialsPanel = ({ credentials }: {
    credentials?: Array<{ id: number; account: string; realm: string; type: string; credential_text: string; comment: string; }>;
}) => {
    if (!credentials || credentials.length === 0) return null;
    const maxLen = 80;
    const shortCred = (s: string) => s?.length > maxLen ? s.slice(0, maxLen) + '…' : (s ?? '');
    const copyText = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success(`${label} copied`);
    };
    return (
        <div className="mt-2 border border-yellow-500/20 bg-yellow-900/5 rounded-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-yellow-500/20">
                <Key size={11} className="text-yellow-400 shrink-0" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-yellow-400">
                    {credentials.length} Credential{credentials.length !== 1 ? 's' : ''} Harvested by This Task
                </span>
            </div>
            <div className="divide-y divide-white/5">
                {credentials.map(cred => (
                    <div key={cred.id} className="px-3 py-2 flex items-center gap-3 text-xs font-mono flex-wrap">
                        <span className="text-[9px] px-1.5 py-0.5 border border-orange-500/30 bg-orange-900/20 text-orange-400 rounded-sm uppercase shrink-0">{cred.type}</span>
                        <span className="text-signal font-bold shrink-0">{cred.account}</span>
                        {cred.realm && <span className="text-gray-500 shrink-0 text-[10px]">@{cred.realm}</span>}
                        <span className="text-gray-400 flex-1 truncate min-w-0">{shortCred(cred.credential_text)}</span>
                        <button
                            onClick={() => copyText(cred.credential_text, 'Credential')}
                            className="shrink-0 p-1 hover:bg-white/10 rounded text-gray-600 hover:text-gray-300 transition-colors"
                            title="Copy credential">
                            <Copy size={11} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TaskBlock = ({ task, callbackHost, onFileAction, scrollRoot, onReveal, myUsername, collapseAllEpoch, expandAllEpoch, defaultCollapsed }: {
    task: any;
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
    const useDisplayParamsForCLIHistory: boolean = useGetMythicSetting({setting_name: 'useDisplayParamsForCLIHistory', default_value: operatorSettingDefaults.useDisplayParamsForCLIHistory ?? true});
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
        onCompleted: (d: any) => {
            setPaginatedResults(d.response || []);
            setTotalSearchCount(d.response_aggregate?.aggregate?.count || 0);
        },
    });
    const [fetchAllSearchResponses] = useLazyQuery(GET_RESPONSES_ALL_SEARCH, {
        fetchPolicy: 'network-only',
        onCompleted: (d: any) => {
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
        onData: ({ data: d }: any) => {
            const incoming: any[] = d?.data?.response_stream || [];
            if (incoming.length === 0) return;
            setLiveResponses(prev => {
                const next = [...prev];
                incoming.forEach((r: any) => {
                    const idx = next.findIndex((x: any) => x.id === r.id);
                    if (idx >= 0) next[idx] = r;
                    else next.push(r);
                });
                next.sort((a: any, b: any) => a.id - b.id);
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
        onCompleted: (d: any) => {
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
            const rawResponseArray = liveResponses.map((r: any) => b64DecodeUnicode(r.response || ''));
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
        onCompleted: (d: any) => {
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
        onCompleted: (d: any) => d.createTask?.status === 'error'
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
        onCompleted: (d: any) => d.reissue_task.status === 'success'
            ? snackActions.success('Task reissued successfully')
            : snackActions.error('Reissue failed: ' + d.reissue_task.error),
        onError: () => snackActions.error('Failed to reissue task'),
    });
    const [reissueTaskHandler] = useMutation(REISSUE_TASK_HANDLER_MUTATION, {
        onCompleted: (d: any) => d.reissue_task_handler.status === 'success'
            ? snackActions.success('Task handler reissued')
            : snackActions.warning('Reissue handler failed: ' + d.reissue_task_handler.error),
        onError: () => snackActions.error('Failed to reissue task handler'),
    });
    const [fetchAllResponses] = useLazyQuery(GET_ALL_TASK_RESPONSES, {
        fetchPolicy: 'network-only',
        onCompleted: (d: any) => {
            const text = (d.response || []).reduce((acc: string, r: any) => acc + b64DecodeUnicode(r.response || ''), '');
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

    const buildPath = (f: any, directory: string): string => {
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

    const handleFileRowClick = (f: any, directory: string) => {
        if (!onFileAction) return;
        const fullPath = buildPath(f, directory);
        if (!f.is_file) {
            onFileAction('ls', fullPath, f.name, true);
        } else {
            onFileAction('cat', fullPath, f.name, false);
        }
    };

    const handleFileRowCtx = (e: React.MouseEvent, f: any, directory: string) => {
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
                            {task.tags.map((tag: any) => (
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
                            const text = liveResponses.map((r: any) => b64DecodeUnicode(r.response || '')).join('');
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
                    const bsd: any = searchText.trim() ? filterBrowserScriptOutput(browserScriptData, searchText) : browserScriptData;
                    return (
                        <div className="mb-2 space-y-2">
                            {/* plaintext — shared TerminalPanel */}
                            {bsd.plaintext !== undefined && (
                                <TerminalPanel text={String(bsd.plaintext)}/>
                            )}
                            {/* table[] — shared MythicTable */}
                            {Array.isArray(bsd.table) && bsd.table.map((tbl: any, i: number) => (
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
                            {showMediaSetting && Array.isArray(bsd.media) && bsd.media.map((m: any, i: number) => {
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
                                    {bsd.search.map((s: any, si: number) => {
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
                                const renderTabContent = (t: any) => (
                                    <div className="space-y-2">
                                        {/* plaintext */}
                                        {t.plaintext !== undefined && t.plaintext !== '' && (
                                            <TerminalPanel text={String(t.plaintext)} />
                                        )}
                                        {/* table[] */}
                                        {Array.isArray(t.table) && t.table.map((tbl: any, ti: number) => (
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
                                        {showMediaSetting && Array.isArray(t.media) && t.media.map((m: any, mi: number) => {
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
                                                {t.search.map((s: any, si: number) => {
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
                                            {bsd.tabs.map((t: any, ti: number) => (
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
                    const otherResponses: { id: string; content: string; parsed: any; isError: boolean }[] = [];
                    const isStructuredParsed = (parsed: any, text: string): boolean => {
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
                    responsesToRender.forEach((r: any) => {
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
                            parsed.files.forEach((f: any) => {
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
                                        {Array.from(dirData.files.values()).map((f: any, idx: number) => {
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
                                            {parsed.map((iface: any, ifIdx: number) => (
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
                                    const rows: any[] = [];
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
                                    const NetRow = ({ row }: { row: any }) => {
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
                                            {parsed.map((p: any, idx: number) => (
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
const ConsoleTerminal = ({
    callbackId, callbackDbId, callbackUUID, payloadtypeName, payloadtypeId, callbackOs, operationId, callbackHost,
    callbackActive, callbackLastCheckin, callbackSleepInfo,
}: {
    callbackId: number;
    callbackDbId: number;
    callbackUUID: string;
    payloadtypeName: string;
    payloadtypeId: number;
    callbackOs: string;
    operationId: number;
    callbackHost: string;
    callbackActive: boolean;
    callbackLastCheckin: string | null;
    callbackSleepInfo: string | null;
}) => {
    const me = useReactiveVar(meState);
    const isDead = !isCallbackAlive({ active: callbackActive, last_checkin: callbackLastCheckin ?? undefined, sleep_info: callbackSleepInfo ?? undefined });
    const [collapseAllEpoch, setCollapseAllEpoch] = useState(0);
    // #8 — Expand All Tasks
    const [expandAllEpoch, setExpandAllEpoch] = useState(0);
    // #14 — Task view mode: 'expanded' = all open (console-like), 'compact' = collapsed by default (accordion-like)
    const [taskViewMode, setTaskViewMode] = useState<'expanded' | 'compact'>(() => {
        try { return (localStorage.getItem('minerva-taskViewMode') as any) || 'expanded'; } catch { return 'expanded'; }
    });
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [input, setInput] = useState('');
    const [commandPayloadType, setCommandPayloadType] = useState('');
    const [commandInfo, setCommandInfo] = useState<any>({});
    const [openParametersDialog, setOpenParametersDialog] = useState(false);
    const loadedOptions = useRef<any[]>([]);
    const taskOptionsIndex = useRef(-1);

    // ---- Filter state ----
    const [filterOptions, setFilterOptions] = useState<FilterOptions>(defaultFilterOptions);
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    // ---- Token (impersonation) state ----
    const [selectedToken, setSelectedToken] = useState<CallbackToken | null>(null);
    const [availableTokens, setAvailableTokens] = useState<CallbackToken[]>([]);
    const [showTokenMenu, setShowTokenMenu] = useState(false);
    const tokenMenuRef = useRef<HTMLDivElement>(null);

    // ---- Operator list for filter UI ----
    const [operatorUsernames, setOperatorUsernames] = useState<string[]>([]);

    // ---- Tab Completion state ----
    const tabCompletionIndex = useRef(-1);
    const tabCompletionOptions = useRef<string[]>([]);
    const tabCompletionBase = useRef('');
    const tabCompletionMode = useRef<'command' | 'param_name' | 'param_value'>('command');
    const [tabLoading, setTabLoading] = useState(false);

    // ---- Reverse Search (Ctrl+R) state ----
    const [reverseSearchActive, setReverseSearchActive] = useState(false);
    const [reverseSearchText, setReverseSearchText] = useState('');
    const reverseSearchIndex = useRef(0);
    const reverseSearchRef = useRef<HTMLInputElement>(null);

    // ---- Tasking Context state ----
    const [callbackContext, setCallbackContext] = useState<any>({});
    const hideTaskingContext: boolean = useGetMythicSetting({setting_name: 'hideTaskingContext', default_value: operatorSettingDefaults.hideTaskingContext ?? false});
    const taskingContextFields: string[] = useGetMythicSetting({setting_name: 'taskingContextFields', default_value: operatorSettingDefaults.taskingContextFields ?? ['impersonation_context', 'cwd']});
    const useDisplayParamsForCLIHistory: boolean = useGetMythicSetting({setting_name: 'useDisplayParamsForCLIHistory', default_value: operatorSettingDefaults.useDisplayParamsForCLIHistory ?? true});

    // ---- Command Disambiguation state ----
    const [disambiguationOptions, setDisambiguationOptions] = useState<any[]>([]);
    const [showDisambiguation, setShowDisambiguation] = useState(false);
    const pendingDisambiguationInput = useRef('');

    // ---- Dynamic Query Params mutation (for tab completion) ----
    const [getDynamicParams] = useMutation(GET_DYNAMIC_QUERY_PARAMS);

    // ---- Callback Context subscription ----
    useSubscription(CALLBACK_CONTEXT_SUBSCRIPTION, {
        variables: { callback_id: callbackDbId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        onData: ({ data: subData }: any) => {
            const ctx = subData?.data?.callback_stream?.[0];
            if (ctx) {
                const newCtx = { ...ctx };
                try { const ips = JSON.parse(newCtx.ip); newCtx.ip = ips[0]; } catch { /* keep raw ip */ }
                setCallbackContext(newCtx);
            }
        },
    });

    const [createTask, { loading: tasking }] = useMutation(CREATE_TASK_MUTATION, {
        onCompleted: (data: any) => {
            if (data?.createTask?.status === 'error') {
                snackActions.error(data.createTask.error || 'Task creation failed');
            }
        },
        onError: (err: any) => {
            console.error('Tasking failed:', err);
            snackActions.error('Failed to create task: ' + (err?.message || 'Unknown error'));
        }
    });

    // Use task_stream subscription for real-time task + response updates.
    // The task timestamp is bumped by a DB trigger whenever a new response row is inserted,
    // so the stream naturally re-fires and delivers fresh inline responses.
    const [taskMap, setTaskMap] = useState<Map<number, any>>(new Map());
    const { loading } = useSubscription(STREAM_CALLBACK_TASKS, {
        variables: { callback_display_id: callbackId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        onData: ({ data: streamData }: any) => {
            const incoming: any[] = streamData?.data?.task_stream;
            if (!incoming?.length) return;
            setTaskMap(prev => {
                const next = new Map(prev);
                incoming.forEach((t: any) => next.set(t.id, t));
                return next;
            });
        }
    });

    const tasks = useMemo(
        () => {
            const all = [...taskMap.values()].sort((a, b) => a.id - b.id);
            if (!isFilterActive(filterOptions)) return all;
            return all.filter(t => applyFilterToTask(t, filterOptions, me.user?.username));
        },
        [taskMap, filterOptions]
    );

    // Track whether the user is pinned to the bottom.
    // Starts true so the initial task batches always auto-scroll.
    const isAtBottom = useRef(true);
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        // scrollTo with the latest scrollHeight — called after DOM mutations via useLayoutEffect
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
        isAtBottom.current = true;
    }, []);

    // Called by TaskBlock via useLayoutEffect AFTER the output DOM has grown.
    // Only re-pins if the user was already at the bottom.
    const handleTaskReveal = useCallback(() => {
        if (isAtBottom.current) scrollToBottom();
    }, [scrollToBottom]);

    // Scroll to bottom once when the first batch of tasks arrives on initial load.
    // Never auto-scrolls again when the user submits new commands.
    const hasInitialScrolled = useRef(false);
    useLayoutEffect(() => {
        if (tasks.length === 0 || hasInitialScrolled.current) return;
        scrollToBottom();
        hasInitialScrolled.current = true;
    }, [tasks, scrollToBottom]);

    useEffect(() => { inputRef.current?.focus(); }, []);
    // Re-focus input whenever the mutation finishes (tasking goes false → true → false)
    useEffect(() => { if (!tasking) inputRef.current?.focus(); }, [tasking]);

    // Subscribe to loaded commands for this callback
    useSubscription(GET_LOADED_COMMANDS_SUBSCRIPTION, {
        variables: { callback_id: callbackDbId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        onData: ({ data: subData }: any) => {
            if (!subData?.data?.loadedcommands) return;
            const cmds = subData.data.loadedcommands.map((c: any) => {
                const cmdData = { ...c.command };
                cmdData.commandparameters = [...(cmdData.commandparameters || [])].sort(
                    (a: any, b: any) => a.ui_position > b.ui_position ? 1 : -1
                );
                return cmdData;
            });
            cmds.push({ cmd: "help", description: "Get help for a command or info about loaded commands", commandparameters: [], attributes: { supported_os: [] } });
            cmds.push({ cmd: "clear", description: "Clear 'submitted' jobs from being pulled down by an agent", commandparameters: [], attributes: { supported_os: [] } });
            cmds.sort((a: any, b: any) => a.cmd > b.cmd ? 1 : -1);
            loadedOptions.current = cmds;
        }
    });

    // Subscribe to callback tokens (for impersonation)
    useSubscription(SUBSCRIPTION_CALLBACK_TOKENS, {
        variables: { callback_id: callbackDbId },
        fetchPolicy: "network-only",
        shouldResubscribe: true,
        onData: ({ data: subData }: any) => {
            const tokens: CallbackToken[] = (subData?.data?.callbacktoken || []).map((ct: any) => ct.token).filter(Boolean);
            setAvailableTokens(tokens);
            if (tokens.length === 0) setSelectedToken(null);
        }
    });

    // Load operators for filter panel
    useQuery(GET_OPERATORS_IN_OPERATION, {
        variables: { operation_id: operationId },
        skip: !operationId,
        onCompleted: (data: any) => {
            setOperatorUsernames((data?.operation_by_pk?.operators || []).map((op: any) => op.username));
        }
    });

    // Close token dropdown on outside click
    useEffect(() => {
        if (!showTokenMenu) return;
        const handler = (e: MouseEvent) => {
            if (tokenMenuRef.current && !tokenMenuRef.current.contains(e.target as Node)) setShowTokenMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showTokenMenu]);

    // ---- Parsing helpers (ported from OldReactUI CallbacksTabsTaskingInput) ----

    const GetDefaultValueForType = (parameter_type: string): any => {
        switch (parameter_type) {
            case "string": return "";
            case "typedArray": case "array": return [];
            case "number": return 0;
            case "boolean": return true;
            default: return undefined;
        }
    };

    const parseToArgv = (str: string): string[] => {
        const res: string[] = [];
        if (!str || typeof str !== 'string') return res;
        let sQuoted = false, dQuoted = false, backslash = false;
        let buffer = '';
        str.split('').forEach((value) => {
            if ((sQuoted || dQuoted) && value === "\\") {
                if (!backslash) { backslash = true; return; }
                else { backslash = false; buffer += "\\"; return; }
            }
            if (!sQuoted && !dQuoted) {
                if (value === `'`) {
                    if (backslash) { backslash = false; buffer += "'"; return; }
                    sQuoted = true; buffer += value; return;
                } else if (value === '"') {
                    if (backslash) { backslash = false; buffer += '"'; return; }
                    dQuoted = true; buffer += value; return;
                } else if (value === " ") {
                    if (backslash) { backslash = false; buffer += "\\"; }
                    if (buffer.length > 0) {
                        if (buffer[buffer.length - 1] === buffer[0] && [`'`, `"`].includes(buffer[0])) {
                            res.push(buffer.slice(1, -1));
                        } else { res.push(buffer); }
                    }
                    buffer = ''; return;
                }
            }
            if (sQuoted && value === `'`) {
                if (backslash) { buffer += "'"; backslash = false; return; }
                sQuoted = false;
                buffer += (buffer.length > 0) ? value : value + value;
                return;
            }
            if (dQuoted && value === `"`) {
                if (backslash) { buffer += '"'; backslash = false; return; }
                dQuoted = false;
                buffer += (buffer.length > 0) ? value : value + value;
                return;
            }
            if (backslash) { buffer += `\\${value}`; backslash = false; }
            else { buffer += value; }
        });
        if (backslash) buffer += "\\";
        if (buffer.length > 0) {
            if (buffer[buffer.length - 1] === buffer[0] && [`'`, `"`].includes(buffer[0])) {
                res.push(buffer.slice(1, -1));
            } else { res.push(buffer); }
        }
        if (dQuoted) throw new SyntaxError('unexpected end of string while looking for matching double quote');
        if (sQuoted) throw new SyntaxError('unexpected end of string while looking for matching single quote');
        return res;
    };

    const parseArgvToDict = (argv: string[], cmd: any): any => {
        const stringArgs: string[] = [], booleanArgs: string[] = [], arrayArgs: string[] = [];
        const typedArrayArgs: string[] = [], numberArgs: string[] = [], fileArgs: string[] = [], complexArgs: string[] = [];
        const allCLINames: string[] = [];
        for (let i = 0; i < cmd.commandparameters.length; i++) {
            allCLINames.push("-" + cmd.commandparameters[i].cli_name);
            switch (cmd.commandparameters[i].parameter_type) {
                case "ChooseOne": case "ChooseOneCustom": case "String": stringArgs.push("-" + cmd.commandparameters[i].cli_name); break;
                case "Number": numberArgs.push("-" + cmd.commandparameters[i].cli_name); break;
                case "Boolean": booleanArgs.push("-" + cmd.commandparameters[i].cli_name); break;
                case "Array": case "ChooseMultiple": arrayArgs.push("-" + cmd.commandparameters[i].cli_name); break;
                case "TypedArray": typedArrayArgs.push("-" + cmd.commandparameters[i].cli_name); break;
                case "File": fileArgs.push("-" + cmd.commandparameters[i].cli_name); break;
                default: complexArgs.push("-" + cmd.commandparameters[i].cli_name);
            }
        }
        const result: any = { "_": [] };
        let current_argument = "", current_argument_type = "";
        for (let i = 0; i < argv.length; i++) {
            const value = argv[i];
            if (current_argument === "") {
                if (stringArgs.includes(value)) { current_argument_type = "string"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("string"); }
                else if (booleanArgs.includes(value)) { current_argument_type = "boolean"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("boolean"); }
                else if (arrayArgs.includes(value)) { current_argument_type = "array"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("array"); }
                else if (typedArrayArgs.includes(value)) { current_argument_type = "typedArray"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("typedArray"); }
                else if (numberArgs.includes(value)) { current_argument_type = "number"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("number"); }
                else if (fileArgs.includes(value)) { current_argument_type = "file"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("string"); }
                else if (complexArgs.includes(value)) { current_argument_type = "complex"; current_argument = value; if (i === argv.length - 1) result[value.slice(1)] = GetDefaultValueForType("string"); }
                else { result["_"].push(value); current_argument = ""; current_argument_type = ""; }
            } else {
                if (allCLINames.includes(value)) {
                    if (result[current_argument.slice(1)] === undefined) result[current_argument.slice(1)] = GetDefaultValueForType(current_argument_type);
                    current_argument = ""; current_argument_type = ""; i -= 1; continue;
                }
                switch (current_argument_type) {
                    case "string":
                        result[current_argument.slice(1)] = value; current_argument = ""; current_argument_type = ""; break;
                    case "file":
                        if (uuidValidate(value)) { result[current_argument.slice(1)] = value; current_argument = ""; current_argument_type = ""; break; }
                        snackActions.warning("File type value must be UUID of uploaded file: " + value); return undefined;
                    case "boolean":
                        if (["false", "true"].includes(value.toLowerCase())) {
                            result[current_argument.slice(1)] = value.toLowerCase() !== "false";
                        } else { result[current_argument.slice(1)] = true; }
                        current_argument = ""; current_argument_type = ""; break;
                    case "number":
                        try {
                            const num = Number(value);
                            if (isNaN(num)) { snackActions.warning("Failed to parse number: " + value); return undefined; }
                            result[current_argument.slice(1)] = num;
                        } catch (error) { snackActions.warning("Failed to parse number: " + error); return undefined; }
                        current_argument = ""; current_argument_type = ""; break;
                    case "typedArray":
                        if (stringArgs.includes(value)) { current_argument_type = "string"; current_argument = value; }
                        else if (booleanArgs.includes(value)) { current_argument_type = "boolean"; current_argument = value; }
                        else if (arrayArgs.includes(value)) { current_argument_type = "typedArray"; current_argument = value; }
                        else if (numberArgs.includes(value)) { current_argument_type = "number"; current_argument = value; }
                        else {
                            if (result[current_argument.slice(1)] === undefined) result[current_argument.slice(1)] = [["", value]];
                            else result[current_argument.slice(1)].push(["", value]);
                        }
                        break;
                    case "array":
                        if (stringArgs.includes(value)) { current_argument_type = "string"; current_argument = value; }
                        else if (booleanArgs.includes(value)) { current_argument_type = "boolean"; current_argument = value; }
                        else if (arrayArgs.includes(value)) { current_argument_type = "array"; current_argument = value; }
                        else if (numberArgs.includes(value)) { current_argument_type = "number"; current_argument = value; }
                        else {
                            if (result[current_argument.slice(1)] === undefined) result[current_argument.slice(1)] = [value];
                            else result[current_argument.slice(1)].push(value);
                        }
                        break;
                    case "complex":
                        try { result[current_argument.slice(1)] = JSON.parse(value); } catch { result[current_argument.slice(1)] = value; }
                        current_argument = ""; current_argument_type = ""; break;
                    default: break;
                }
            }
        }
        return result;
    };

    const parseCommandLine = (command_line: string, cmd: any): any => {
        if (command_line.length > 0 && command_line[0] === "{") {
            try {
                const json_arguments = JSON.parse(command_line);
                json_arguments["_"] = [];
                return json_arguments;
            } catch (error) {
                snackActions.warning("Failed to parse custom JSON command line: " + error);
                return undefined;
            }
        }
        try {
            const argv = parseToArgv(command_line);
            return parseArgvToDict(argv, cmd);
        } catch (error) {
            snackActions.warning("Failed to parse command line: " + error);
            return undefined;
        }
    };

    const determineCommandGroupName = (cmd: any, parsed: any): string[] | undefined => {
        if (cmd.commandparameters.length === 0) return [];
        if (!parsed) return [];
        let cmdGroupOptions: string[] = cmd.commandparameters.reduce((prev: string[], cur: any) => {
            if (prev.includes(cur.parameter_group_name)) return prev;
            return [...prev, cur.parameter_group_name];
        }, []);
        for (const key of Object.keys(parsed)) {
            if (key !== "_") {
                const paramGroups: string[] = [];
                let foundParamGroup = false;
                for (let i = 0; i < cmd.commandparameters.length; i++) {
                    if (cmd.commandparameters[i]["cli_name"] === key || cmd.commandparameters[i]["display_name"] === key || cmd.commandparameters[i]["name"] === key) {
                        foundParamGroup = true;
                        paramGroups.push(cmd.commandparameters[i]["parameter_group_name"]);
                    }
                }
                const intersection = cmdGroupOptions.reduce((prev: string[], cur: string) => {
                    if (paramGroups.includes(cur)) return [...prev, cur];
                    return prev;
                }, []);
                if (intersection.length === 0) {
                    if (foundParamGroup) return undefined;
                } else { cmdGroupOptions = [...intersection]; }
            }
        }
        return cmdGroupOptions;
    };

    const simplifyGroupNameChoices = (groupNames: string[], cmd: any, parsed: any): string => {
        const finalGroupNames: string[] = [];
        for (let i = 0; i < groupNames.length; i++) {
            let foundAllRequired = true;
            for (let j = 0; j < cmd.commandparameters.length; j++) {
                if (cmd.commandparameters[j]["parameter_group_name"] === groupNames[i]) {
                    if (cmd.commandparameters[j].required &&
                        parsed[cmd.commandparameters[j].cli_name] === undefined &&
                        parsed[cmd.commandparameters[j].name] === undefined) {
                        foundAllRequired = false;
                    }
                }
            }
            if (foundAllRequired) finalGroupNames.push(groupNames[i]);
        }
        if (finalGroupNames.length === 0) return "";
        if (finalGroupNames.length === 1) return finalGroupNames[0];
        return "";
    };

    const fillOutPositionalArguments = (cmd: any, parsed: any, groupNames: string[], inputMessage: string): any => {
        const parsedCopy = { ...parsed, "_": [...parsed["_"]] };
        parsedCopy["_"].shift(); // remove command name
        if (cmd.commandparameters.length === 0 || groupNames.length === 0) return parsedCopy;
        const usedGroupName = groupNames.includes("Default") ? "Default" : groupNames[0];
        const groupParameters = cmd.commandparameters
            .filter((c: any) => c.parameter_group_name === usedGroupName)
            .sort((a: any, b: any) => a.ui_position < b.ui_position ? -1 : 1);
        const unSatisfied: any[] = groupParameters.filter((p: any) => !(p["cli_name"] in parsedCopy));
        for (let i = 0; i < unSatisfied.length; i++) {
            if (parsedCopy["_"].length === 0) break;
            const temp = parsedCopy["_"].shift();
            switch (unSatisfied[i]["parameter_type"]) {
                case "ChooseOne": case "ChooseOneCustom": case "String": parsedCopy[unSatisfied[i]["cli_name"]] = temp; break;
                case "Number":
                    try {
                        const n = Number(temp);
                        if (isNaN(n)) { snackActions.warning("Failed to parse number: " + temp); return undefined; }
                        parsedCopy[unSatisfied[i]["cli_name"]] = n;
                    } catch (err) { snackActions.warning("Failed to parse number: " + err); return undefined; }
                    break;
                case "Boolean":
                    if (temp.toLowerCase() === "false") parsedCopy[unSatisfied[i]["cli_name"]] = false;
                    else if (temp.toLowerCase() === "true") parsedCopy[unSatisfied[i]["cli_name"]] = true;
                    else { snackActions.warning("Failed to parse boolean: " + temp); return undefined; }
                    break;
                case "Array": case "TypedArray": case "FileMultiple": case "ChooseMultiple":
                    if (parsedCopy[unSatisfied[i]["cli_name"]]) parsedCopy[unSatisfied[i]["cli_name"]].push(temp);
                    else parsedCopy[unSatisfied[i]["cli_name"]] = [temp];
                    i -= 1; break;
                default: parsedCopy[unSatisfied[i]["cli_name"]] = temp; break;
            }
        }
        // If there are still leftover positional args and unsatisfied params, greedily assign to last param
        if (unSatisfied.length > 0 && parsedCopy["_"].length > 0) {
            let temp = "";
            let negativeIndex = inputMessage.length;
            for (let pci = parsedCopy["_"].length - 1; pci >= 0; pci--) {
                const startIndex = inputMessage.lastIndexOf(parsedCopy["_"][pci], negativeIndex);
                negativeIndex = startIndex - 1;
                if (inputMessage[startIndex - 1] === "'") {
                    if (startIndex + parsedCopy["_"][pci].length + 1 < inputMessage.length && inputMessage[startIndex + parsedCopy["_"][pci].length + 1] === "'")
                        temp = "'" + parsedCopy["_"][pci] + "' " + temp;
                    else temp = parsedCopy["_"][pci] + " " + temp;
                } else if (inputMessage[startIndex - 1] === '"') {
                    if (startIndex + parsedCopy["_"][pci].length < inputMessage.length && inputMessage[startIndex + parsedCopy["_"][pci].length] === '"')
                        temp = '"' + parsedCopy["_"][pci] + '" ' + temp;
                    else temp = parsedCopy["_"][pci] + " " + temp;
                } else { temp = parsedCopy["_"][pci] + " " + temp; }
                temp = temp.trim();
            }
            const lastParam = unSatisfied[unSatisfied.length - 1];
            switch (lastParam["parameter_type"]) {
                case "ChooseOne": case "ChooseOneCustom": case "String":
                    parsedCopy[lastParam["cli_name"]] = (parsedCopy[lastParam["cli_name"]] ? parsedCopy[lastParam["cli_name"]] + " " : "") + temp; break;
                case "Number":
                    try { const n = Number(temp); if (isNaN(n)) { snackActions.warning("Failed to parse number: " + temp); return undefined; } parsedCopy[lastParam["cli_name"]] = n; }
                    catch (err) { snackActions.warning("Failed to parse number: " + err); return undefined; }
                    break;
                case "Boolean":
                    if (temp.toLowerCase() === "false") parsedCopy[lastParam["cli_name"]] = false;
                    else if (temp.toLowerCase() === "true") parsedCopy[lastParam["cli_name"]] = true;
                    else { snackActions.warning("Failed to parse boolean: " + temp); return undefined; }
                    break;
                case "Array": case "TypedArray": case "FileMultiple": case "ChooseMultiple":
                    parsedCopy[lastParam["cli_name"]] = [parsedCopy[lastParam["cli_name"]], ...parsedCopy["_"]]; break;
                default: parsedCopy[lastParam["cli_name"]] = temp; break;
            }
            parsedCopy["_"] = [];
        }
        return parsedCopy;
    };

    const onCreateTask = (params: any) => {
        createTask({ variables: {
            callback_id: params.callback_id,
            command: params.command,
            params: params.params,
            files: params.files,
            tasking_location: params.tasking_location,
            original_params: params.original_params,
            parameter_group_name: params.parameter_group_name,
            payload_type: params.payload_type,
            ...(selectedToken ? { token_id: selectedToken.token_id } : {}),
        }});
    };

    const submitParametersDialog = (cmd: string, parameters: string, files: any, selectedParameterGroup: string, payload_type: string) => {
        setOpenParametersDialog(false);
        onCreateTask({
            callback_id: callbackId,
            command: cmd,
            params: parameters,
            files,
            tasking_location: "modal",
            parameter_group_name: selectedParameterGroup,
            payload_type,
        });
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const processCommandAndCommandLine = (cmd: any, currentInput: string) => {
        const splitMessage = currentInput.trim().split(" ");
        const paramsStr = splitMessage.slice(1).join(" ");
        let cmdGroupName: string[] = ["Default"];
        let parsedWithPositionalParameters: any = {};
        let failed_json_parse = true;
        try {
            parsedWithPositionalParameters = JSON.parse(paramsStr);
            if (['string', 'number', 'boolean', null].includes(typeof parsedWithPositionalParameters)) throw new Error("not a dict");
            const groups = determineCommandGroupName(cmd, parsedWithPositionalParameters);
            if (groups === undefined) { snackActions.warning("Two or more of the specified parameters can't be used together"); return; }
            cmdGroupName = groups; cmdGroupName.sort();
            failed_json_parse = false;
        } catch { failed_json_parse = true; }

        if (failed_json_parse) {
            let parsed = parseCommandLine(paramsStr, cmd);
            if (parsed === undefined) return;
            parsed = { ...parsed };
            const groups = determineCommandGroupName(cmd, parsed);
            if (groups === undefined) { snackActions.warning("Two or more of the specified parameters can't be used together"); return; }
            cmdGroupName = groups; cmdGroupName.sort();
            if (cmd.commandparameters.length > 0) {
                parsed["_"].unshift(cmd);
                parsedWithPositionalParameters = fillOutPositionalArguments(cmd, parsed, cmdGroupName, currentInput);
                if (parsedWithPositionalParameters === undefined) return;
                if (parsedWithPositionalParameters["_"].length > 0) {
                    snackActions.warning("Too many positional arguments given. Did you mean to quote some of them?"); return;
                }
            } else {
                parsedWithPositionalParameters = parsed;
            }
        }

        const originalParams = paramsStr;

        // Check if a popup dialog is needed (file param missing or required params missing)
        if (cmd.commandparameters.length > 0) {
            const fileParamExists = cmd.commandparameters.find((param: any) => {
                if (param.parameter_type === "File" && cmdGroupName.includes(param.parameter_group_name)) {
                    if (!(param.cli_name in parsedWithPositionalParameters || param.name in parsedWithPositionalParameters || param.display_name in parsedWithPositionalParameters)) return true;
                    if (param.cli_name in parsedWithPositionalParameters && uuidValidate(parsedWithPositionalParameters[param.cli_name])) return false;
                    if (param.name in parsedWithPositionalParameters && uuidValidate(parsedWithPositionalParameters[param.name])) return false;
                    if (param.display_name in parsedWithPositionalParameters && uuidValidate(parsedWithPositionalParameters[param.display_name])) return false;
                }
                return false;
            });
            let missingRequiredParams = false;
            if (cmdGroupName.length === 1) {
                const missingParams = cmd.commandparameters.filter((param: any) =>
                    param.required && param.parameter_group_name === cmdGroupName[0] &&
                    !(param.cli_name in parsedWithPositionalParameters || param.name in parsedWithPositionalParameters || param.display_name in parsedWithPositionalParameters)
                );
                if (missingParams.length > 0) missingRequiredParams = true;
            }
            if (fileParamExists || missingRequiredParams) {
                setCommandInfo({ ...cmd, "parsedParameters": parsedWithPositionalParameters, groupName: cmdGroupName[0] || "Default" });
                setOpenParametersDialog(true);
                return;
            }
        }

        // Resolve ambiguous group names
        let finalGroupName = cmdGroupName;
        if (finalGroupName.length > 1) {
            if (finalGroupName.includes("Default")) {
                finalGroupName = ["Default"];
            } else {
                const simplified = simplifyGroupNameChoices(finalGroupName, cmd, parsedWithPositionalParameters);
                if (simplified === "") {
                    setCommandInfo({ ...cmd, "parsedParameters": parsedWithPositionalParameters, groupName: cmdGroupName[0] || "Default" });
                    setOpenParametersDialog(true);
                    return;
                }
                finalGroupName = [simplified];
            }
        }

        const cleanParsed = { ...parsedWithPositionalParameters };
        delete cleanParsed["_"];

        onCreateTask({
            callback_id: callbackId,
            command: cmd.cmd,
            params: cmd.commandparameters.length > 0 ? JSON.stringify(cleanParsed) : originalParams,
            tasking_location: "parsed_cli",
            original_params: originalParams,
            parameter_group_name: finalGroupName[0] || "Default",
            payload_type: cmd.payloadtype?.name,
        });
    };

    const handleSend = (currentInput: string) => {
        if (!currentInput.trim() || tasking) return;
        const trimmed = currentInput.trim();
        const cmdName = trimmed.split(" ")[0];
        const cmds = loadedOptions.current.filter((l: any) => l.cmd === cmdName);
        if (!cmds || cmds.length === 0) {
            snackActions.warning("Unknown (or not loaded) command: " + cmdName);
            return;
        }
        let cmd = cmds[0];
        if (cmds.length > 1 && commandPayloadType !== "") {
            const byType = cmds.find((c: any) => c?.payloadtype?.name === commandPayloadType);
            if (byType) cmd = byType;
        } else if (cmds.length > 1) {
            const byType = cmds.find((c: any) => c?.payloadtype?.name === payloadtypeName);
            if (byType) cmd = byType;
            else {
                // Multiple commands with same name from different payload types — disambiguation
                pendingDisambiguationInput.current = trimmed;
                setDisambiguationOptions(cmds);
                setShowDisambiguation(true);
                return;
            }
        }
        processCommandAndCommandLine(cmd, trimmed);
        setInput('');
        setCommandPayloadType('');
        taskOptionsIndex.current = -1;
        inputRef.current?.focus();
    };

    const handleDisambiguationSelect = (cmd: any) => {
        setShowDisambiguation(false);
        setDisambiguationOptions([]);
        setCommandPayloadType(cmd?.payloadtype?.name || '');
        processCommandAndCommandLine(cmd, pendingDisambiguationInput.current);
        setInput('');
        pendingDisambiguationInput.current = '';
        taskOptionsIndex.current = -1;
        inputRef.current?.focus();
    };

    const [uploadTarget, setUploadTarget] = useState<string | null>(null);

    const onFileAction = useCallback((action: string, path: string, name: string, isDir: boolean) => {
        const p = normalizeUnixPath(path);
        if (action === 'ls') {
            handleSend(`ls ${p}`);
        } else if (action === 'cat') {
            handleSend(`cat ${p}`);
        } else if (action === 'download') {
            handleSend(`download ${p}`);
        } else if (action === 'upload') {
            setUploadTarget(p);
        } else if (action === 'copy') {
            navigator.clipboard.writeText(p);
            snackActions.success('Path copied');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleSend]);

    const tasksHistory = useMemo(() => [...tasks].reverse(), [tasks]);

    // ---- Tab Completion helpers ----
    const getTabCompletionForCommands = (partial: string, reverse: boolean) => {
        const cmds = loadedOptions.current;
        if (cmds.length === 0) return;
        // Build matched list: startsWith first, then includes
        const starts = cmds.filter((c: any) => c.cmd.startsWith(partial)).map((c: any) => c.cmd);
        const includes = cmds.filter((c: any) => !c.cmd.startsWith(partial) && c.cmd.includes(partial)).map((c: any) => c.cmd);
        const allMatches = [...new Set([...starts, ...includes])];
        if (allMatches.length === 0) return;
        if (tabCompletionOptions.current.length === 0 || tabCompletionBase.current !== partial) {
            tabCompletionOptions.current = allMatches;
            tabCompletionBase.current = partial;
            tabCompletionIndex.current = -1;
            tabCompletionMode.current = 'command';
        }
        const opts = tabCompletionOptions.current;
        if (reverse) {
            tabCompletionIndex.current = tabCompletionIndex.current <= 0 ? opts.length - 1 : tabCompletionIndex.current - 1;
        } else {
            tabCompletionIndex.current = tabCompletionIndex.current >= opts.length - 1 ? 0 : tabCompletionIndex.current + 1;
        }
        setInput(opts[tabCompletionIndex.current] + ' ');
    };

    const getTabCompletionForParams = (cmdName: string, currentParams: string, reverse: boolean) => {
        const cmd = loadedOptions.current.find((c: any) => c.cmd === cmdName);
        if (!cmd || !cmd.commandparameters || cmd.commandparameters.length === 0) return;

        // Parse what's already been specified
        let parsed: any = {};
        try { parsed = parseCommandLine(currentParams, cmd) || {}; } catch { /* ignore */ }
        const specifiedKeys = Object.keys(parsed).filter(k => k !== '_');

        // Get all possible groups and determine active groups based on what's specified
        let possibleGroups = cmd.commandparameters.reduce((acc: string[], p: any) => {
            if (!acc.includes(p.parameter_group_name)) acc.push(p.parameter_group_name);
            return acc;
        }, []);

        // Filter groups by specified params
        for (const key of specifiedKeys) {
            const paramGroups = cmd.commandparameters
                .filter((p: any) => p.cli_name === key || p.name === key || p.display_name === key)
                .map((p: any) => p.parameter_group_name);
            if (paramGroups.length > 0) {
                possibleGroups = possibleGroups.filter((g: string) => paramGroups.includes(g));
            }
        }
        const activeGroup = possibleGroups.length > 0 ? possibleGroups[0] : 'Default';

        // Get params for this group, required first then optional
        const groupParams = cmd.commandparameters
            .filter((p: any) => p.parameter_group_name === activeGroup)
            .sort((a: any, b: any) => (b.required ? 1 : 0) - (a.required ? 1 : 0) || a.ui_position - b.ui_position);

        // Filter out already specified params
        const available = groupParams.filter((p: any) =>
            !specifiedKeys.includes(p.cli_name) && !specifiedKeys.includes(p.name) && !specifiedKeys.includes(p.display_name)
        );

        const cliNames = available.map((p: any) => '-' + p.cli_name);
        if (cliNames.length === 0) return;

        if (tabCompletionOptions.current.length === 0 || tabCompletionMode.current !== 'param_name') {
            tabCompletionOptions.current = cliNames;
            tabCompletionIndex.current = -1;
            tabCompletionMode.current = 'param_name';
        }
        const opts = tabCompletionOptions.current;
        if (reverse) {
            tabCompletionIndex.current = tabCompletionIndex.current <= 0 ? opts.length - 1 : tabCompletionIndex.current - 1;
        } else {
            tabCompletionIndex.current = tabCompletionIndex.current >= opts.length - 1 ? 0 : tabCompletionIndex.current + 1;
        }
        // Append the param name to the end of current input
        const parts = input.trimEnd().split(/\s+/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.startsWith('-')) parts.pop();
        setInput(parts.join(' ') + ' ' + opts[tabCompletionIndex.current] + ' ');
    };

    const getTabCompletionForParamValues = async (cmdName: string, paramCliName: string, partial: string, reverse: boolean) => {
        const cmd = loadedOptions.current.find((c: any) => c.cmd === cmdName);
        if (!cmd) return;
        const param = cmd.commandparameters.find((p: any) => p.cli_name === paramCliName);
        if (!param) return;

        // If param has static choices
        if (param.choices && param.choices.length > 0) {
            const matches = param.choices.filter((c: string) => c.toLowerCase().includes(partial.toLowerCase()));
            if (matches.length === 0) return;
            if (tabCompletionOptions.current.length === 0 || tabCompletionMode.current !== 'param_value') {
                tabCompletionOptions.current = matches;
                tabCompletionIndex.current = -1;
                tabCompletionMode.current = 'param_value';
            }
            const opts = tabCompletionOptions.current;
            if (reverse) {
                tabCompletionIndex.current = tabCompletionIndex.current <= 0 ? opts.length - 1 : tabCompletionIndex.current - 1;
            } else {
                tabCompletionIndex.current = tabCompletionIndex.current >= opts.length - 1 ? 0 : tabCompletionIndex.current + 1;
            }
            const parts = input.trimEnd().split(/\s+/);
            parts.pop(); // remove partial value
            setInput(parts.join(' ') + ' ' + opts[tabCompletionIndex.current] + ' ');
            return;
        }

        // If param has dynamic_query_function
        if (param.dynamic_query_function) {
            setTabLoading(true);
            try {
                const result = await getDynamicParams({
                    variables: {
                        callback: callbackId,
                        command: cmdName,
                        payload_type: payloadtypeName,
                        parameter_name: param.name,
                        other_parameters: {},
                    }
                });
                const choices = result?.data?.dynamic_query_function?.choices || [];
                if (choices.length > 0) {
                    const matches = choices.filter((c: string) => c.toLowerCase().includes(partial.toLowerCase()));
                    tabCompletionOptions.current = matches.length > 0 ? matches : choices;
                    tabCompletionIndex.current = -1;
                    tabCompletionMode.current = 'param_value';
                    tabCompletionIndex.current = 0;
                    const parts = input.trimEnd().split(/\s+/);
                    if (partial) parts.pop();
                    setInput(parts.join(' ') + ' ' + tabCompletionOptions.current[0] + ' ');
                }
            } catch (err) {
                console.error('Dynamic query failed:', err);
            } finally {
                setTabLoading(false);
            }
            return;
        }
    };

    const handleTab = (reverse: boolean) => {
        const trimmed = input.trimStart();
        const parts = trimmed.split(/\s+/);
        if (parts.length <= 1 && !trimmed.includes(' ')) {
            // Tab on partial command name (or empty)
            getTabCompletionForCommands(trimmed, reverse);
        } else {
            // Tab after first word — check if we're naming a param or giving a value
            const cmdName = parts[0];
            const lastPart = parts[parts.length - 1];
            if (lastPart.startsWith('-') || trimmed.endsWith(' ')) {
                // We're trying to complete a parameter name
                const currentParams = parts.slice(1).join(' ');
                getTabCompletionForParams(cmdName, currentParams, reverse);
            } else {
                // We might be completing a parameter value — find which param
                // Walk backwards to find the last -paramName
                let paramName = '';
                for (let i = parts.length - 2; i >= 1; i--) {
                    if (parts[i].startsWith('-')) { paramName = parts[i].slice(1); break; }
                }
                if (paramName) {
                    getTabCompletionForParamValues(cmdName, paramName, lastPart, reverse);
                } else {
                    // Positional arg — try param names
                    const currentParams = parts.slice(1).join(' ');
                    getTabCompletionForParams(cmdName, currentParams, reverse);
                }
            }
        }
    };

    // ---- Reverse Search helpers ----
    const reverseSearchResults = useMemo(() => {
        if (!reverseSearchText.trim()) return [];
        const query = reverseSearchText.toLowerCase();
        return tasksHistory.filter(t => {
            const str = ((t.command_name || '') + ' ' + (t.display_params || t.original_params || '') + ' ' + (t.original_params || '')).toLowerCase();
            return str.includes(query);
        });
    }, [reverseSearchText, tasksHistory]);

    const handleReverseSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape' || (e.key === 'r' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            setReverseSearchActive(false);
            setReverseSearchText('');
            inputRef.current?.focus();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            // Accept current match and exit
            if (reverseSearchResults.length > 0) {
                const task = reverseSearchResults[reverseSearchIndex.current] || reverseSearchResults[0];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                setInput(histP.trim());
            }
            setReverseSearchActive(false);
            setReverseSearchText('');
            inputRef.current?.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            // Submit the matched command
            if (reverseSearchResults.length > 0) {
                const task = reverseSearchResults[reverseSearchIndex.current] || reverseSearchResults[0];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                handleSend(histP.trim());
            }
            setReverseSearchActive(false);
            setReverseSearchText('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (reverseSearchResults.length > 0) {
                reverseSearchIndex.current = Math.min(reverseSearchIndex.current + 1, reverseSearchResults.length - 1);
                const task = reverseSearchResults[reverseSearchIndex.current];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                setInput(histP.trim());
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (reverseSearchResults.length > 0) {
                reverseSearchIndex.current = Math.max(reverseSearchIndex.current - 1, 0);
                const task = reverseSearchResults[reverseSearchIndex.current];
                const histP = (task.command_name || '') + ' ' + (task.display_params || task.original_params || '');
                setInput(histP.trim());
            }
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Tab Completion
        if (e.key === 'Tab') {
            e.preventDefault();
            handleTab(e.shiftKey);
            return;
        }
        // Reverse Search toggle
        if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (reverseSearchActive) {
                setReverseSearchActive(false);
                setReverseSearchText('');
            } else {
                setReverseSearchActive(true);
                setReverseSearchText('');
                reverseSearchIndex.current = 0;
                setTimeout(() => reverseSearchRef.current?.focus(), 0);
            }
            return;
        }
        // Shift+Enter — force popup dialog
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            const trimmed = input.trim();
            if (!trimmed) return;
            const cmdName = trimmed.split(' ')[0];
            const cmds = loadedOptions.current.filter((l: any) => l.cmd === cmdName);
            if (cmds.length === 0) { snackActions.warning("Unknown command: " + cmdName); return; }
            const cmd = cmds.length > 1 ? (cmds.find((c: any) => c?.payloadtype?.name === payloadtypeName) || cmds[0]) : cmds[0];
            setCommandInfo({ ...cmd, parsedParameters: {}, groupName: 'Default' });
            setOpenParametersDialog(true);
            return;
        }
        // Ctrl+Enter / Meta+Enter — insert newline
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setInput(prev => prev + '\n');
            return;
        }
        // Regular Enter — submit
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend(input);
            // Reset tab completion state
            tabCompletionOptions.current = [];
            tabCompletionIndex.current = -1;
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (tasksHistory.length === 0) return;
            const newIndex = Math.min(taskOptionsIndex.current + 1, tasksHistory.length - 1);
            taskOptionsIndex.current = newIndex;
            const task = tasksHistory[newIndex];
            const histParams_up = useDisplayParamsForCLIHistory
                ? (task.display_params || task.original_params || '')
                : (task.original_params || task.display_params || '');
            const historyStr = ((task.command_name || '') + (histParams_up ? ' ' + histParams_up : '')).trim();
            setInput(historyStr.trim());
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (tasksHistory.length === 0) return;
            if (taskOptionsIndex.current <= 0) { taskOptionsIndex.current = -1; setInput(''); return; }
            const newIndex = taskOptionsIndex.current - 1;
            taskOptionsIndex.current = newIndex;
            const task = tasksHistory[newIndex];
            const histParams_dn = useDisplayParamsForCLIHistory
                ? (task.display_params || task.original_params || '')
                : (task.original_params || task.display_params || '');
            const historyStr = ((task.command_name || '') + (histParams_dn ? ' ' + histParams_dn : '')).trim();
            setInput(historyStr.trim());
        } else {
            if (taskOptionsIndex.current !== -1) taskOptionsIndex.current = -1;
            // Reset tab completion when typing anything else
            tabCompletionOptions.current = [];
            tabCompletionIndex.current = -1;
        }
    };

    return (
        <OutputCallbackContext.Provider value={callbackId}>
            <div className="flex flex-col h-full font-mono text-sm relative overflow-hidden bg-black/80 border border-signal/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px]"></div>
            {/* Terminal header */}
            <div className={cn(
                "p-2.5 border-b flex items-center justify-between z-10 shrink-0",
                isDead
                    ? "bg-red-600 border-red-500"
                    : "bg-signal/10 border-signal/20"
            )}>
                <div className="flex items-center gap-2">
                    {isDead
                        ? <Skull size={16} className="text-black" />
                        : getOSIcon(callbackOs, payloadtypeName, 16)
                    }
                    <span className={cn("font-bold tracking-wider text-sm", isDead ? "text-black" : "text-signal")}>
                        {isDead ? 'SESSION_DEAD' : 'TERMINAL_UPLINK'}
                    </span>
                    {/* Active filter indicator */}
                    {isFilterActive(filterOptions) && (
                        <span className={cn(
                            "flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 border rounded",
                            isDead ? "border-black/30 bg-black/20 text-black" : "border-yellow-500/50 bg-yellow-900/30 text-yellow-300"
                        )}>
                            <Filter size={10} /> Filtered
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {loadedOptions.current.length > 2 && (
                        <span className={cn("text-[10px] font-mono", isDead ? "text-black/60" : "text-signal/50")}>{loadedOptions.current.length - 2} cmds loaded</span>
                    )}
                    {/* Collapse-all button */}
                    <button
                        title="Collapse All Tasks"
                        onClick={() => setCollapseAllEpoch(e => e + 1)}
                        className={cn("p-1.5 rounded transition-colors", isDead ? "text-black/60 hover:bg-black/20" : "text-gray-500 hover:text-signal hover:bg-signal/10")}
                    >
                        <ChevronUp size={14} />
                    </button>
                    {/* #8 — Expand-all button */}
                    <button
                        title="Expand All Tasks"
                        onClick={() => setExpandAllEpoch(e => e + 1)}
                        className={cn("p-1.5 rounded transition-colors", isDead ? "text-black/60 hover:bg-black/20" : "text-gray-500 hover:text-signal hover:bg-signal/10")}
                    >
                        <ChevronDown size={14} />
                    </button>
                    {/* #14 — View mode toggle: expanded (console) vs compact (accordion) */}
                    <button
                        title={taskViewMode === 'expanded' ? 'Switch to Compact View (accordion)' : 'Switch to Expanded View (console)'}
                        onClick={() => {
                            const next = taskViewMode === 'expanded' ? 'compact' : 'expanded';
                            setTaskViewMode(next);
                            try { localStorage.setItem('minerva-taskViewMode', next); } catch {}
                            // When switching to compact, collapse all; when switching to expanded, expand all
                            if (next === 'compact') setCollapseAllEpoch(e => e + 1);
                            else setExpandAllEpoch(e => e + 1);
                        }}
                        className={cn("p-1.5 rounded transition-colors", isDead ? "text-black/60 hover:bg-black/20" : taskViewMode === 'compact' ? "text-signal bg-signal/10" : "text-gray-500 hover:text-signal hover:bg-signal/10")}
                    >
                        {taskViewMode === 'compact' ? <ListTree size={14} /> : <Rows3 size={14} />}
                    </button>
                    {/* Filter toggle */}
                    <button
                        title="Toggle Task Filters"
                        onClick={() => setShowFilterPanel(s => !s)}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            isDead
                                ? (showFilterPanel || isFilterActive(filterOptions) ? "text-black bg-black/20" : "text-black/60 hover:bg-black/20")
                                : (showFilterPanel || isFilterActive(filterOptions)
                                    ? "text-yellow-400 bg-yellow-500/15 hover:bg-yellow-500/25"
                                    : "text-gray-500 hover:text-signal hover:bg-signal/10")
                        )}
                    >
                        <SlidersHorizontal size={14} />
                    </button>
                    <div className={cn("w-2.5 h-2.5 rounded-full", isDead ? "bg-black/40" : "bg-signal animate-pulse")}></div>
                </div>
            </div>

            {/* ── Filter Panel ─────────────────────────────────────────────── */}
            <AnimatePresence>
            {showFilterPanel && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden z-10 shrink-0"
                >
                    <div className="bg-[#0a0f0a] border-b border-yellow-500/25 px-4 py-3 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-yellow-400 flex items-center gap-2">
                                <Filter size={12} />
                                Task Filters
                                {isFilterActive(filterOptions) && (
                                    <span className="text-[11px] text-yellow-400/60 font-normal">
                                        — {tasks.length} / {taskMap.size} shown
                                    </span>
                                )}
                            </span>
                            <button
                                onClick={() => setFilterOptions(defaultFilterOptions)}
                                className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                            >
                                Clear all
                            </button>
                        </div>

                        {/* Quick toggles */}
                        <div className="flex items-center flex-wrap gap-2">
                            {[
                                { key: 'hideErrors',        label: 'Hide errors',         activeClass: 'border-red-500/60 bg-red-950 text-red-300',    icon: <AlertCircle size={12}/> },
                                { key: 'commentsFlag',      label: 'Has comment',         activeClass: 'border-blue-500/60 bg-blue-950 text-blue-300',  icon: <MessageSquare size={12}/> },
                                { key: 'hideBrowserScripts',label: 'Hide browser tasks',  activeClass: 'border-orange-500/60 bg-orange-950 text-orange-300', icon: <EyeOff size={12}/> },
                            ].map(({ key, label, activeClass, icon }) => {
                                const active = (filterOptions as any)[key];
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setFilterOptions(f => ({ ...f, [key]: !active }))}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-medium transition-colors',
                                            active ? activeClass : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30 bg-white/3'
                                        )}
                                    >
                                        {icon}{label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Parameter search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                            <input
                                type="text"
                                value={filterOptions.parameterString}
                                onChange={e => setFilterOptions(f => ({ ...f, parameterString: e.target.value }))}
                                placeholder="Filter by parameters (supports regex)…"
                                className="w-full bg-black/50 border border-white/10 focus:border-yellow-500/50 rounded px-3 py-1.5 pl-8 text-sm text-white placeholder-gray-600 font-mono outline-none transition-colors"
                            />
                            {filterOptions.parameterString && (
                                <button onClick={() => setFilterOptions(f => ({ ...f, parameterString: '' }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                                    <XCircle size={13} />
                                </button>
                            )}
                        </div>

                        {/* Operators */}
                        {operatorUsernames.length > 0 && (
                            <div>
                                <p className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1.5">
                                    <Users size={12} /> Operators
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {operatorUsernames.map(op => {
                                        const active = filterOptions.operatorsList.includes(op);
                                        return (
                                            <button key={op}
                                                onClick={() => setFilterOptions(f => ({
                                                    ...f,
                                                    operatorsList: active ? f.operatorsList.filter(o => o !== op) : [...f.operatorsList, op]
                                                }))}
                                                className={cn(
                                                    'text-xs px-2.5 py-1 border rounded transition-colors font-mono',
                                                    active ? 'border-signal/50 bg-signal/10 text-signal' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                                                )}
                                            >
                                                {op}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Command filters */}
                        {loadedOptions.current.length > 2 && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-gray-400 font-medium mb-1.5">Show only</p>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto cyber-scrollbar">
                                        {loadedOptions.current.filter((c: any) => c.cmd !== 'help' && c.cmd !== 'clear').map((c: any) => {
                                            const active = filterOptions.commandsList.includes(c.cmd);
                                            return (
                                                <button key={c.cmd}
                                                    onClick={() => setFilterOptions(f => ({
                                                        ...f,
                                                        commandsList: active ? f.commandsList.filter(x => x !== c.cmd) : [...f.commandsList, c.cmd],
                                                        everythingButList: active ? f.everythingButList : f.everythingButList.filter(x => x !== c.cmd),
                                                    }))}
                                                    className={cn(
                                                        'text-xs px-2 py-0.5 border rounded transition-colors font-mono',
                                                        active ? 'border-signal/50 bg-signal/10 text-signal' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/25'
                                                    )}
                                                >
                                                    {c.cmd}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 font-medium mb-1.5">Exclude</p>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto cyber-scrollbar">
                                        {loadedOptions.current.filter((c: any) => c.cmd !== 'help' && c.cmd !== 'clear').map((c: any) => {
                                            const active = filterOptions.everythingButList.includes(c.cmd);
                                            return (
                                                <button key={c.cmd}
                                                    onClick={() => setFilterOptions(f => ({
                                                        ...f,
                                                        everythingButList: active ? f.everythingButList.filter(x => x !== c.cmd) : [...f.everythingButList, c.cmd],
                                                        commandsList: active ? f.commandsList : f.commandsList.filter(x => x !== c.cmd),
                                                    }))}
                                                    className={cn(
                                                        'text-xs px-2 py-0.5 border rounded transition-colors font-mono',
                                                        active ? 'border-red-500/50 bg-red-950 text-red-300' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/25'
                                                    )}
                                                >
                                                    {c.cmd}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 space-y-4 cyber-scrollbar z-10">
                {tasks.map((task: any) => <TaskBlock key={task.id} task={task} callbackHost={callbackHost} onFileAction={onFileAction} scrollRoot={scrollContainerRef} onReveal={handleTaskReveal} myUsername={me.user?.username} collapseAllEpoch={collapseAllEpoch} expandAllEpoch={expandAllEpoch} defaultCollapsed={taskViewMode === 'compact'} />)}
                {tasks.length === 0 && !loading && (
                    <div className="text-gray-500 italic opacity-50 text-center mt-10 text-sm">
                        {isFilterActive(filterOptions)
                            ? 'No tasks match the current filters.'
                            : 'Session initialized. Ready for input.'}
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* ── Tasking Context Badges ─────────────────────── */}
            {!hideTaskingContext && Object.keys(callbackContext).length > 0 && (
                <div className="px-3 py-1.5 bg-black/60 border-t border-white/5 flex flex-wrap gap-1.5 z-10 shrink-0"
                     style={{ borderLeftColor: callbackContext.color || undefined, borderLeftWidth: callbackContext.color ? 3 : 0 }}>
                    {(Array.isArray(taskingContextFields) ? taskingContextFields : ['impersonation_context', 'cwd']).map((field: string) => {
                        let val = callbackContext[field];
                        if (val === undefined || val === null || val === '') return null;
                        let label = field;
                        let color = 'text-gray-400 border-gray-700 bg-gray-900/40';
                        switch(field) {
                            case 'impersonation_context':
                                if (!val) return null;
                                label = 'User'; color = 'text-purple-300 border-purple-500/40 bg-purple-900/20';
                                break;
                            case 'cwd': label = 'Dir'; color = 'text-blue-300 border-blue-500/40 bg-blue-900/20'; break;
                            case 'user':
                                label = 'User';
                                if ((callbackContext.integrity_level || 0) > 2) val = val + '*';
                                color = 'text-cyan-300 border-cyan-500/40 bg-cyan-900/20';
                                break;
                            case 'host': label = 'Host'; color = 'text-green-300 border-green-500/40 bg-green-900/20'; break;
                            case 'ip': label = 'IP'; color = 'text-yellow-300 border-yellow-500/40 bg-yellow-900/20'; break;
                            case 'pid': label = 'PID'; color = 'text-orange-300 border-orange-500/40 bg-orange-900/20'; break;
                            case 'architecture': label = 'Arch'; color = 'text-indigo-300 border-indigo-500/40 bg-indigo-900/20'; break;
                            case 'process_short_name': label = 'Proc'; color = 'text-pink-300 border-pink-500/40 bg-pink-900/20'; break;
                            case 'extra_info': label = ''; color = 'text-amber-300 border-amber-500/40 bg-amber-900/20'; break;
                        }
                        return (
                            <span key={field} className={cn('text-[10px] font-mono px-1.5 py-0.5 border rounded-sm', color)}>
                                {label ? `${label}: ` : ''}{String(val)}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* ── Reverse Search Bar ─────────────────────── */}
            <AnimatePresence>
            {reverseSearchActive && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="overflow-hidden z-10 shrink-0"
                >
                    <div className="px-3 py-2 bg-[#0a0d14] border-t border-blue-500/25 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-blue-400 shrink-0 tracking-wider">reverse-i-search:</span>
                        <input
                            ref={reverseSearchRef}
                            type="text"
                            value={reverseSearchText}
                            onChange={e => { setReverseSearchText(e.target.value); reverseSearchIndex.current = 0; }}
                            onKeyDown={handleReverseSearchKeyDown}
                            className="flex-1 bg-transparent border-none outline-none text-blue-200 placeholder-blue-800 font-mono text-sm"
                            placeholder="type to search history..."
                            autoFocus
                        />
                        <span className="text-[10px] text-gray-600 font-mono shrink-0">
                            {reverseSearchResults.length > 0 ? `${reverseSearchIndex.current + 1}/${reverseSearchResults.length}` : '0 matches'}
                        </span>
                        <button onClick={() => { setReverseSearchActive(false); setReverseSearchText(''); inputRef.current?.focus(); }}
                            className="text-gray-500 hover:text-white transition-colors p-0.5"><X size={12} /></button>
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            {/* ── Tab loading indicator ─────────────────────── */}
            {tabLoading && (
                <div className="px-3 py-1 bg-black/60 border-t border-signal/10 flex items-center gap-2 z-10 shrink-0">
                    <Activity size={12} className="animate-spin text-signal" />
                    <span className="text-[10px] font-mono text-signal/60">Fetching dynamic parameters...</span>
                </div>
            )}

            {/* Input bar */}
            <div className="p-3 bg-black border-t border-signal/20 flex items-center gap-2 z-10 shrink-0">
                {/* Token selector pill — only shown when tokens are available */}
                {availableTokens.length > 0 && (
                    <div className="relative shrink-0" ref={tokenMenuRef}>
                        <button
                            title={selectedToken ? `Impersonating: ${selectedToken.user}` : 'Select Token for Impersonation'}
                            onClick={() => setShowTokenMenu(m => !m)}
                            className={cn(
                                "flex items-center gap-1 px-2 py-1 border rounded-sm text-[10px] font-mono transition-colors",
                                selectedToken
                                    ? "border-orange-500/60 bg-orange-900/20 text-orange-300"
                                    : "border-gray-700 text-gray-500 hover:text-white hover:border-gray-500"
                            )}
                        >
                            <Key size={10} />
                            {selectedToken ? selectedToken.user.split('\\').pop() || selectedToken.user : 'TOKEN'}
                        </button>
                        {showTokenMenu && (
                            <div className="absolute bottom-full mb-1 left-0 w-52 bg-black/97 border border-orange-500/30 shadow-lg z-50 py-1 font-mono text-xs">
                                <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1">
                                    TOKEN_IMPERSONATION
                                </div>
                                <button
                                    className={cn("w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors",
                                        !selectedToken ? "text-signal bg-signal/10" : "text-gray-400 hover:text-white hover:bg-white/5"
                                    )}
                                    onClick={() => { setSelectedToken(null); setShowTokenMenu(false); }}
                                >
                                    <Key size={11} className="shrink-0" /> Default Token
                                </button>
                                {availableTokens.map(tok => (
                                    <button
                                        key={tok.token_id}
                                        className={cn("w-full text-left px-3 py-1.5 flex items-start gap-2 transition-colors",
                                            selectedToken?.token_id === tok.token_id
                                                ? "text-orange-300 bg-orange-900/25"
                                                : "text-gray-300 hover:text-white hover:bg-white/5"
                                        )}
                                        onClick={() => { setSelectedToken(tok); setShowTokenMenu(false); }}
                                    >
                                        <Key size={11} className="shrink-0 mt-0.5 text-orange-400" />
                                        <div className="min-w-0">
                                            <div className="truncate font-bold">{tok.user}</div>
                                            {tok.description && <div className="text-[10px] text-gray-600 truncate">{tok.description}</div>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <span className="text-signal animate-pulse font-bold text-base">$</span>
                <input
                    ref={inputRef} type="text" value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        if (taskOptionsIndex.current !== -1) taskOptionsIndex.current = -1;
                        // Reset tab completion on manual typing
                        tabCompletionOptions.current = [];
                        tabCompletionIndex.current = -1;
                    }}
                    onKeyDown={onKeyDown}
                    disabled={tasking}
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 font-mono text-sm disabled:opacity-50"
                    placeholder={tasking ? "Transmitting..." : selectedToken ? `[${selectedToken.user}] Enter command...` : "Enter command... (Tab=autocomplete, Ctrl+R=search)"}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                />
                <div className="flex items-center gap-1 shrink-0">
                    {/* Payload type SVG icon */}
                    {commandPayloadType !== '' && (
                        <img
                            src={`/static/${commandPayloadType}_dark.svg`}
                            title={commandPayloadType}
                            alt={commandPayloadType}
                            className="w-6 h-6 shrink-0 opacity-70"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    )}
                    <span className="text-[9px] text-gray-700 font-mono hidden lg:inline">Tab ↹ | Ctrl+R</span>
                    <button onClick={() => handleSend(input)} disabled={tasking} className="p-1.5 hover:bg-white/10 rounded text-signal transition-colors disabled:opacity-50">
                        {tasking ? <Activity size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                    </button>
                </div>
            </div>

            {/* ── Command Disambiguation Dialog ─────────────── */}
            {showDisambiguation && disambiguationOptions.length > 0 && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={() => setShowDisambiguation(false)}>
                    <div className="bg-[#0a0f0a] border border-signal/40 p-5 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(34,197,94,0.15)]"
                         onClick={e => e.stopPropagation()}
                         style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>
                        <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle size={16} className="text-yellow-400" />
                            <span className="font-mono text-sm text-yellow-400 font-bold tracking-wider">COMMAND DISAMBIGUATION</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Multiple payload types have a command with this name. Select which one to use:</p>
                        <div className="space-y-2">
                            {disambiguationOptions.map((cmd: any, idx: number) => (
                                <button key={idx}
                                    onClick={() => handleDisambiguationSelect(cmd)}
                                    className="w-full flex items-center gap-3 px-4 py-3 border border-white/10 hover:border-signal/50 hover:bg-signal/5 transition-colors text-left"
                                >
                                    <Command size={14} className="text-signal shrink-0" />
                                    <div>
                                        <div className="font-mono text-sm text-white">{cmd.cmd}</div>
                                        <div className="text-[10px] text-gray-500">
                                            {cmd?.payloadtype?.name || 'unknown'} • {cmd.description?.slice(0, 80) || 'No description'}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowDisambiguation(false)} className="mt-3 w-full py-2 text-xs font-mono text-gray-500 hover:text-white border border-white/10 hover:border-white/25 transition-colors">CANCEL</button>
                    </div>
                </div>
            )}

            {openParametersDialog && (
                <MythicDialog fullWidth={true} maxWidth="lg" open={openParametersDialog}
                    onClose={() => setOpenParametersDialog(false)}
                    innerDialog={
                        <TaskParametersDialog
                            command={commandInfo}
                            callback_id={callbackDbId}
                            payloadtype_id={payloadtypeId}
                            operation_id={operationId}
                            onSubmit={submitParametersDialog}
                            onClose={() => setOpenParametersDialog(false)}
                        />
                    }
                />
            )}
            {uploadTarget !== null && (
                <UploadToAgentModal
                    targetPath={uploadTarget}
                    callbackId={callbackId}
                    onClose={() => setUploadTarget(null)}
                />
            )}
            </div>
        </OutputCallbackContext.Provider>
    );
};

// ============================================
// Enhanced Info Panel
// ============================================
const InfoPanel = ({ callback, allCallbacks }: { callback: any, allCallbacks: any[] }) => {
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

    const InfoRow = ({ label, value, icon: Icon, mono = true, color }: any) => (
        <div className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-b-0">
            <div className="w-5 flex items-center justify-center shrink-0">
                {Icon && <Icon size={14} className={color || "text-signal/70"} />}
            </div>
            <span className="text-[11px] text-gray-500 uppercase w-20 shrink-0">{label}</span>
            <span className={cn("text-[13px] break-all flex-1 min-w-0", mono ? "font-mono" : "", color || "text-white")}>
                {value || <span className="text-gray-600">N/A</span>}
            </span>
        </div>
    );

    let sleepInfo = 'N/A';
    try {
        if (callback.sleep_info) {
            const sleep = JSON.parse(callback.sleep_info);
            if (sleep.interval !== undefined) sleepInfo = `${sleep.interval}s / ${sleep.jitter || 0}% jitter`;
        }
    } catch { }

    const currentDomain = callback?.domain;
    const currentIPRange = getIPRange(callback?.ip);

    // Machine-centric grouping: group all callbacks by host
    const relatedMachines = useMemo(() => {
        if (!allCallbacks || allCallbacks.length === 0) return [];
        
        const hostMap = new Map<string, any[]>();
        allCallbacks.forEach((cb: any) => {
            if (cb.display_id === callback.display_id) return;
            
            let isRelated = false;
            if (currentDomain && currentDomain !== '') {
                if (cb.domain === currentDomain) isRelated = true;
            } else {
                if (getIPRange(cb.ip) === currentIPRange) isRelated = true;
            }
            
            if (isRelated) {
                const host = cb.host || 'unknown';
                if (!hostMap.has(host)) hostMap.set(host, []);
                hostMap.get(host)!.push(cb);
            }
        });

        return Array.from(hostMap.entries()).map(([host, callbacks]) => {
            // Sort callbacks: alive first, then by integrity_level desc, then dead last
            callbacks.sort((a: any, b: any) => {
                const aAlive = isCallbackAlive(a);
                const bAlive = isCallbackAlive(b);
                if (aAlive !== bAlive) return aAlive ? -1 : 1;
                const aActive = a.active;
                const bActive = b.active;
                if (aActive !== bActive) return aActive ? -1 : 1;
                // Higher integrity first
                const aIL = Number(a.integrity_level || 0);
                const bIL = Number(b.integrity_level || 0);
                if (aIL !== bIL) return bIL - aIL;
                return 0;
            });

            const best = callbacks[0]; // Best callback to navigate to
            const hasActive = callbacks.some((c: any) => c.active);
            const alive = callbacks.some((c: any) => isCallbackAlive(c));
            const highestIL = Math.max(...callbacks.map((c: any) => Number(c.integrity_level || 0)));

            return {
                host,
                ip: parseIP(best.ip),
                os: best.os,
                user: best.user,
                domain: best.domain,
                payloadType: best.payload?.payloadtype?.name,
                display_id: best.display_id,
                last_checkin: best.last_checkin,
                integrity_level: highestIL,
                active: hasActive,
                alive,
                callbackCount: callbacks.length,
                callbacks,
            };
        }).sort((a, b) => {
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            if (a.active !== b.active) return a.active ? -1 : 1;
            // Higher integrity first among same status
            if (a.integrity_level !== b.integrity_level) return b.integrity_level - a.integrity_level;
            return a.host.localeCompare(b.host);
        });
    }, [allCallbacks, callback?.display_id, currentDomain, currentIPRange]);

    if (!callback) return null;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Callback Details */}
            <div className="shrink-0 overflow-auto max-h-[45%] cyber-scrollbar pr-1">
                <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Shield size={12} className="text-signal" />
                    CALLBACK_DETAILS
                </div>
                <div className="bg-black/30 rounded border border-white/5 p-2 mb-3">
                    <InfoRow label="ID" value={`#${callback.display_id}`} icon={Hash} />
                    <InfoRow label="User" value={callback.user} icon={User} />
                    <InfoRow label="Host" value={callback.host} icon={Server} />
                    <InfoRow label="Domain" value={callback.domain} icon={Globe} />
                    <InfoRow label="IP" value={parseIP(callback.ip)} icon={Wifi} />
                    <InfoRow label="OS" value={`${callback.os || 'N/A'} (${callback.architecture || '?'})`} icon={Cpu} />
                    <InfoRow label="PID" value={callback.pid} icon={Activity} />
                    <InfoRow label="Process" value={callback.process_name} icon={Terminal} />
                    <InfoRow label="Agent" value={callback.payload?.payloadtype?.name} icon={Zap} />
                    <InfoRow label="Sleep" value={sleepInfo} icon={Clock} />
                    <InfoRow label="Locked" value={callback.locked ? "Yes" : "No"} icon={callback.locked ? Lock : Unlock} color={callback.locked ? "text-red-400" : "text-gray-400"} />
                    <InfoRow label="Checkin" value={callback.last_checkin ? timeSince(callback.last_checkin) : 'N/A'} icon={Clock} color="text-signal" />
                    {callback.description && <InfoRow label="Desc" value={callback.description} icon={Info} mono={false} />}
                </div>
            </div>

            {/* Domain / Network Machines */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="text-[11px] text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Network size={12} className="text-cyan-400" />
                        {currentDomain ? `DOMAIN: ${currentDomain}` : `NET: ${currentIPRange}`}
                        <span className="text-gray-600 text-[11px]">({relatedMachines.length})</span>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => setViewMode('list')}
                            className={cn("p-1.5 rounded transition-colors", viewMode === 'list' ? "bg-signal/20 text-signal" : "text-gray-600 hover:text-white")}
                            title="List View">
                            <LayoutList size={14} />
                        </button>
                        <button onClick={() => setViewMode('graph')}
                            className={cn("p-1.5 rounded transition-colors", viewMode === 'graph' ? "bg-signal/20 text-signal" : "text-gray-600 hover:text-white")}
                            title="Graph View">
                            <GitBranch size={14} />
                        </button>
                    </div>
                </div>

                {relatedMachines.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-xs font-mono">
                        NO_RELATED_MACHINES_FOUND
                    </div>
                ) : viewMode === 'list' ? (
                    <MachineListView machines={relatedMachines} currentCallback={callback} allCallbacks={allCallbacks} navigate={navigate} />
                ) : (
                    <MachineGraphView machines={relatedMachines} currentCallback={callback} navigate={navigate} />
                )}
            </div>
        </div>
    );
};

// ============================================
// Machine List View
// ============================================
const MachineListView = ({ machines, currentCallback, allCallbacks, navigate }: {
    machines: any[], currentCallback: any, allCallbacks: any[], navigate: any
}) => {
    const [expandedHost, setExpandedHost] = useState<string | null>(null);

    // Other sessions on the same host as the current callback (excluding current)
    const currentHostSessions = useMemo(() => {
        if (!allCallbacks) return [];
        return allCallbacks
            .filter((cb: any) => cb.host === currentCallback.host && cb.display_id !== currentCallback.display_id)
            .sort((a: any, b: any) => {
                const aAlive = isCallbackAlive(a);
                const bAlive = isCallbackAlive(b);
                if (aAlive !== bAlive) return aAlive ? -1 : 1;
                return (b.integrity_level || 0) - (a.integrity_level || 0);
            });
    }, [allCallbacks, currentCallback.host, currentCallback.display_id]);

    const SessionRow = ({ cb, isCurrent = false }: { cb: any, isCurrent?: boolean }) => {
        const alive = isCallbackAlive(cb);
        const dead = !alive;
        return (
            <button
                onClick={() => !isCurrent && navigate(`/console/${cb.display_id}`)}
                disabled={isCurrent}
                className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors",
                    isCurrent && dead  ? "cursor-default bg-red-600 border border-red-500" :
                    isCurrent          ? "cursor-default bg-signal/10 border border-signal/20" :
                    dead               ? "bg-red-600/25 hover:bg-red-600/35 border border-red-500/50" :
                                         "hover:bg-white/10 border border-transparent"
                )}
            >
                <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-mono font-bold",
                    dead       ? "bg-black/30 text-black" :
                    isCurrent  ? "bg-signal/20 text-signal" :
                                  "bg-white/10 text-gray-300"
                )}>
                    {cb.display_id}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn(
                            "text-[11px] font-mono font-bold",
                            dead      ? "text-black" :
                            isCurrent ? "text-signal" :
                                         "text-white"
                        )}>
                            {cb.user || '?'}
                        </span>
                        {cb.integrity_level >= 3 && (
                            <span className={cn("text-[9px] px-1 rounded font-mono", dead ? "bg-black/20 text-black" : "bg-yellow-500/20 text-yellow-400")}>HIGH</span>
                        )}
                        {isCurrent && (
                            <span className={cn("text-[9px] px-1 rounded font-mono", dead ? "bg-black/20 text-black" : "bg-signal/20 text-signal")}>HERE</span>
                        )}
                    </div>
                    <div className={cn("text-[10px] mt-0.5", dead ? "text-black/60" : "text-gray-500")}>
                        {cb.process_name || cb.payload?.payloadtype?.name || '?'}
                        <span className="mx-1">·</span>
                        {timeSince(cb.last_checkin)}
                    </div>
                </div>
                <div className={cn("w-2 h-2 rounded-full shrink-0",
                    dead ? "bg-black/40" : "bg-signal animate-pulse"
                )} />
            </button>
        );
    };

    return (
        <div className="flex-1 overflow-auto cyber-scrollbar space-y-1.5 pr-1">
            {/* Current machine — always shown, expandable when same host has other sessions */}
            {(() => {
                const curDead = !isCallbackAlive(currentCallback);
                return (
                <div className={cn("rounded border overflow-hidden", curDead ? "bg-red-600 border-red-500" : "bg-signal/10 border-signal/30")}>
                <button
                    onClick={() => currentHostSessions.length > 0 && setExpandedHost(
                        expandedHost === '__current__' ? null : '__current__'
                    )}
                    className={cn(
                        "w-full flex items-center gap-2.5 p-2.5 text-left transition-colors",
                        currentHostSessions.length > 0 ? (curDead ? "hover:bg-black/10 cursor-pointer" : "hover:bg-signal/10 cursor-pointer") : "cursor-default"
                    )}
                >
                    <div className={cn("w-7 h-7 rounded flex items-center justify-center shrink-0", curDead ? "bg-black/20 text-black" : "bg-signal/20 text-signal")}>
                        {getOSIcon(currentCallback.os, currentCallback.payload?.payloadtype?.name, 14)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-mono font-bold truncate", curDead ? "text-black" : "text-signal")}>{currentCallback.host}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono", curDead ? "bg-black/20 text-black" : "bg-signal/20 text-signal")}>CURRENT</span>
                            {currentHostSessions.length > 0 && (
                                <span className={cn("text-[10px] px-1 rounded font-mono", curDead ? "bg-black/20 text-black" : "bg-white/10 text-gray-400")}>
                                    +{currentHostSessions.length}
                                </span>
                            )}
                        </div>
                        <div className={cn("flex items-center gap-2 text-[11px] mt-0.5", curDead ? "text-black/70" : "text-gray-500")}>
                            <span>{currentCallback.user}</span>
                            <span>•</span>
                            <span>{parseIP(currentCallback.ip)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className={cn("w-2.5 h-2.5 rounded-full", curDead ? "bg-black/40" : "bg-signal animate-pulse")} />
                        {currentHostSessions.length > 0 && (
                            <ChevronRight size={13} className={cn(
                                curDead ? "text-black/60" : "text-gray-500",
                                "transition-transform",
                                expandedHost === '__current__' ? "rotate-90" : ""
                            )} />
                        )}
                    </div>
                </button>

                {/* Expanded sessions for current host */}
                {expandedHost === '__current__' && (
                    <div className={cn("border-t px-2 py-1.5 space-y-0.5", curDead ? "border-black/20 bg-black/10" : "border-signal/20 bg-black/20")}>
                        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1 px-2">Sessions on {currentCallback.host}</div>
                        <SessionRow cb={currentCallback} isCurrent={true} />
                        {currentHostSessions.map((cb: any) => (
                            <SessionRow key={cb.display_id} cb={cb} />
                        ))}
                    </div>
                )}
            </div>
                ); })()}

            {/* Related machines */}
            {machines.map((m, idx) => {
                const isDead = !m.active || !m.alive;
                const hasMultiple = m.callbackCount > 1;
                const isExpanded = expandedHost === m.host;
                return (
                    <div key={`${m.host}-${idx}`} className={cn(
                        "rounded border overflow-hidden transition-all",
                        isDead ? "bg-red-600 border-red-500" : "border-white/10 hover:border-signal/30"
                    )}>
                        <button
                            onClick={() => {
                                if (hasMultiple) {
                                    setExpandedHost(isExpanded ? null : m.host);
                                } else {
                                    navigate(`/console/${m.display_id}`);
                                }
                            }}
                            className={cn(
                                "w-full flex items-center gap-2.5 p-2.5 text-left transition-colors",
                                isDead ? "hover:bg-black/10" : "bg-black/30 hover:bg-white/5"
                            )}
                        >
                            <div className={cn(
                                "w-7 h-7 rounded flex items-center justify-center shrink-0",
                                isDead ? "bg-black/20 text-black" : "bg-white/10 text-white"
                            )}>
                                {isDead ? <Skull size={14} className="text-black" /> : getOSIcon(m.os, m.payloadType, 14)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-sm font-mono font-bold truncate",
                                        isDead ? "text-black" : "text-white"
                                    )}>
                                        {m.host}
                                    </span>
                                    {hasMultiple && (
                                        <span className={cn("text-[10px] px-1 py-0 rounded font-mono", isDead ? "bg-black/20 text-black" : "bg-white/10 text-gray-400")}>
                                            ×{m.callbackCount}
                                        </span>
                                    )}
                                    {m.integrity_level >= 3 && (
                                        <span className={cn("text-[10px] px-1 py-0 rounded font-mono", isDead ? "bg-black/20 text-black" : "bg-yellow-500/20 text-yellow-400")}>
                                            HIGH
                                        </span>
                                    )}
                                </div>
                                <div className={cn("flex items-center gap-2 text-[11px] mt-0.5", isDead ? "text-black/70" : "text-gray-500")}>
                                    <span>{m.user}</span>
                                    <span>•</span>
                                    <span>{m.ip}</span>
                                    <span>•</span>
                                    <span className={isDead ? "text-black/80" : "text-signal"}>
                                        {timeSince(m.last_checkin)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className={cn(
                                    "w-2.5 h-2.5 rounded-full",
                                    isDead ? "bg-black/40" : "bg-signal animate-pulse"
                                )} />
                                {hasMultiple && (
                                    <ChevronRight size={13} className={cn(
                                        isDead ? "text-black/60" : "text-gray-500",
                                        "transition-transform",
                                        isExpanded ? "rotate-90" : ""
                                    )} />
                                )}
                            </div>
                        </button>

                        {/* Expanded session list */}
                        {isExpanded && (
                            <div className={cn(
                                "border-t px-2 py-1.5 space-y-0.5",
                                isDead ? "border-black/20 bg-black/10" : "border-white/10 bg-black/20"
                            )}>
                                <div className={cn("text-[9px] uppercase tracking-wider mb-1 px-2", isDead ? "text-black/50" : "text-gray-600")}>Sessions on {m.host}</div>
                                {m.callbacks.map((cb: any) => (
                                    <SessionRow key={cb.display_id} cb={cb} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// Machine Graph View (radial from current)
// ============================================
const MachineGraphView = ({ machines, currentCallback, navigate }: { machines: any[], currentCallback: any, navigate: any }) => {
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    
    const graphNodes = useMemo(() => {
        const centerX = 150;
        const centerY = 130;
        const radius = 90;
        
        const nodes: { x: number; y: number; machine: any; isSelf: boolean }[] = [];
        nodes.push({ x: centerX, y: centerY, machine: { ...currentCallback, host: currentCallback.host, alive: true, active: true }, isSelf: true });
        
        const count = machines.length;
        machines.forEach((m, i) => {
            const angle = (2 * Math.PI * i / count) - Math.PI / 2;
            const r = radius + (count > 6 ? (i % 2) * 30 : 0);
            nodes.push({
                x: centerX + r * Math.cos(angle),
                y: centerY + r * Math.sin(angle),
                machine: m,
                isSelf: false,
            });
        });
        return nodes;
    }, [machines, currentCallback]);

    return (
        <div className="flex-1 overflow-hidden relative bg-black/20 rounded border border-white/5">
            <svg width="100%" height="100%" viewBox="0 0 300 260" className="absolute inset-0">
                {graphNodes.slice(1).map((node, i) => (
                    <line key={`line-${i}`}
                        x1={graphNodes[0].x} y1={graphNodes[0].y}
                        x2={node.x} y2={node.y}
                        stroke={node.machine.alive ? "#22c55e" : "#ef4444"}
                        strokeWidth={node.machine.alive ? 1.5 : 0.8}
                        strokeDasharray={node.machine.alive ? "none" : "4 2"}
                        opacity={0.4}
                    />
                ))}
                <circle cx={graphNodes[0]?.x} cy={graphNodes[0]?.y} r="20" fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.3">
                    <animate attributeName="r" values="20;35;20" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
                </circle>
            </svg>

            {graphNodes.map((node, i) => {
                // Dead = explicitly inactive OR session timed out (not alive)
                const isDead = (!node.machine.active || !node.machine.alive) && !node.isSelf;
                const isHovered = hoveredNode === i;
                return (
                    <div key={i} className="absolute" style={{
                        left: `${(node.x / 300) * 100}%`,
                        top: `${(node.y / 260) * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: isHovered ? 50 : 1,
                    }}>
                        <button
                            onClick={() => {
                                if (!node.isSelf && node.machine.display_id) navigate(`/console/${node.machine.display_id}`);
                            }}
                            onMouseEnter={() => setHoveredNode(i)}
                            onMouseLeave={() => setHoveredNode(null)}
                            className={cn(
                                "flex flex-col items-center group transition-transform",
                                node.isSelf ? "cursor-default" : "cursor-pointer hover:scale-110"
                            )}
                            title={`${node.machine.host} (${node.machine.user || '?'}) - ${node.machine.ip || '?'}`}
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                                node.isSelf 
                                    ? "bg-signal/30 border-signal text-signal shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                                    : isDead
                                        ? "bg-red-500 border-red-400 text-black"
                                        : "bg-black/80 border-signal/50 text-signal group-hover:border-signal"
                            )}>
                                {isDead ? <Skull size={14} className="text-black" /> : getOSIcon(node.machine.os, node.machine.payloadType, 14)}
                            </div>
                            <span className={cn(
                                "text-[10px] font-mono mt-0.5 max-w-[70px] truncate",
                                node.isSelf ? "text-signal font-bold" 
                                    : isDead ? "text-red-400 font-bold"
                                        : "text-gray-300"
                            )}>
                                {node.machine.host}
                            </span>
                        </button>

                        {/* Hover card */}
                        {isHovered && !node.isSelf && (
                            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black/95 border border-white/20 rounded p-2 min-w-[140px] z-50 pointer-events-none shadow-lg">
                                <div className={cn("text-xs font-mono font-bold mb-1", isDead ? "text-red-400" : "text-signal")}>
                                    {node.machine.host}
                                </div>
                                <div className="text-[10px] text-gray-400 space-y-0.5 font-mono">
                                    <div>User: <span className="text-white">{node.machine.user || 'N/A'}</span></div>
                                    <div>IP: <span className="text-white">{node.machine.ip || 'N/A'}</span></div>
                                    <div>OS: <span className="text-white">{node.machine.os || 'N/A'}</span></div>
                                    <div>Sessions: <span className="text-white">{node.machine.callbackCount || 1}</span></div>
                                    <div>Status: <span className={isDead ? "text-red-400 font-bold" : "text-signal"}>
                                        {isDead ? "DEAD" : "ALIVE"}
                                    </span></div>
                                    <div>Last: <span className="text-white">{timeSince(node.machine.last_checkin)}</span></div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// File Browser — Tree Structure
// ============================================
interface FileNode {
    id: string;
    name_text: string;
    full_path_text: string;
    parent_path_text: string;
    can_have_children: boolean;
    tree_type: string;
    deleted: boolean;
    metadata: string;
    host: string;
    has_children?: boolean;
    success?: boolean | null;
    filemeta?: { id: number; agent_file_id: string; filename_text: string; } | null;
}

const getMetadata = (node: FileNode) => {
    try { return JSON.parse(node.metadata); } catch { return {}; }
};

const deduplicateNodes = (nodes: FileNode[]): FileNode[] => {
    if (!nodes || nodes.length === 0) return [];
    const seen = new Map<string, FileNode>();
    nodes.forEach(node => {
        const key = node.full_path_text;
        if (!seen.has(key)) seen.set(key, node);
    });
    return Array.from(seen.values());
};

// ============================================
// Upload to Agent Modal
// ============================================
// ── helper: push local file to Mythic file store, return agent_file_id ──────
const uploadFileToMythic = async (file: File, comment: string): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    form.append('comment', comment);
    const res = await fetch('/api/v1.4/task_upload_file_webhook', {
        method: 'POST',
        body: form,
        headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
            MythicSource: 'web',
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status === 'error') throw new Error(json.error || 'Upload rejected');
    if (!json.agent_file_id) throw new Error('No file ID returned');
    return json.agent_file_id as string;
};

const UploadToAgentModal = ({ targetPath, callbackId, onClose }: {
    targetPath: string; callbackId: number; onClose: () => void;
}) => {
    const [createTask, { loading: tasking }] = useMutation(CREATE_TASK_MUTATION);
    const { data, loading, refetch } = useQuery(GET_UPLOADED_FILES, { fetchPolicy: 'network-only' });
    const { data: payloadData, loading: payloadLoading } = useQuery(GET_BUILT_PAYLOADS, { fetchPolicy: 'network-only' });

    // tab: 'library' | 'payloads' | 'local'
    const [tab, setTab] = useState<'library' | 'payloads' | 'local'>('library');

    // ── library tab state ────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // ── payloads tab state ───────────────────────────────────────────────────
    const [payloadSearch, setPayloadSearch] = useState('');
    const [selectedPayloadFileId, setSelectedPayloadFileId] = useState<string | null>(null);

    // ── shared state ─────────────────────────────────────────────────────────
    const [remotePath, setRemotePath] = useState(targetPath);
    const [overwrite, setOverwrite] = useState(false);
    const pathEdited = React.useRef(false);

    // ── local upload tab state ───────────────────────────────────────────────
    const [localFile, setLocalFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const joinDestPath = (dir: string, fname: string) => {
        if (!dir) return fname;
        const isWin = /^[A-Za-z]:[\\/]/.test(dir) || dir.includes('\\');
        if (isWin) return dir.replace(/[\\/]+$/, '') + '\\' + fname;
        return dir.replace(/\/$/, '') + '/' + fname;
    };

    const files = (data?.filemeta || []).filter((f: any) => {
        const name = b64DecodeUnicode(f.filename_text).toLowerCase();
        return name.includes(search.toLowerCase());
    });
    const selectedFile = files.find((f: any) => f.agent_file_id === selectedId);

    // ── submit (all tabs share this) ─────────────────────────────────────────
    const onSubmit = async () => {
        let fileId = tab === 'payloads' ? selectedPayloadFileId : selectedId;

        // If on local tab: push the local file to Mythic first
        if (tab === 'local') {
            if (!localFile) { snackActions.warning('Select a file to upload'); return; }
            setUploading(true);
            setUploadProgress('Uploading to Mythic…');
            try {
                fileId = await uploadFileToMythic(localFile, `Uploaded via Minerva console · ${localFile.name}`);
                setUploadProgress('Sending to agent…');
                await refetch();
            } catch (err: any) {
                snackActions.error('File upload failed: ' + (err.message || 'unknown error'));
                setUploading(false);
                setUploadProgress('');
                return;
            }
        }

        if (!fileId) { snackActions.warning('Select a file first'); return; }
        try {
            const { data: result } = await createTask({
                variables: {
                    callback_id: callbackId,
                    command: 'upload',
                    params: JSON.stringify({ file: fileId, remote_path: remotePath, overwrite }),
                    tasking_location: 'parsed_cli',
                    parameter_group_name: 'Default',
                },
            });
            if (result?.createTask?.status === 'error') throw new Error(result.createTask.error);
            const payloadEntry = tab === 'payloads'
                ? (payloadData?.payload || []).find((x: any) => x.filemetum?.agent_file_id === selectedPayloadFileId)
                : null;
            const fname = localFile?.name
                ?? (payloadEntry ? b64DecodeUnicode(payloadEntry.filemetum?.filename_text || selectedPayloadFileId) : null)
                ?? (selectedFile ? b64DecodeUnicode(selectedFile.filename_text) : fileId);
            snackActions.success(`Tasked upload: ${fname} → ${remotePath || '(agent dir)'}`);
            onClose();
        } catch (err: any) {
            snackActions.error(err.message || 'Upload task failed');
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    };

    // ── drag-and-drop handlers ────────────────────────────────────────────────
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) pickLocalFile(f);
    };
    const pickLocalFile = (f: File) => {
        setLocalFile(f);
        if (!pathEdited.current) setRemotePath(joinDestPath(targetPath, f.name));
    };

    const isBusy = tasking || uploading;

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={onClose}>
            <div className="bg-[#0a0e14] border border-signal/30 shadow-[0_0_30px_rgba(34,211,238,0.1)] w-full max-w-xl flex flex-col relative overflow-hidden"
                style={{ maxHeight: '88vh' }}
                onClick={e => e.stopPropagation()}>
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-signal to-transparent opacity-60 pointer-events-none" />

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
                    <Upload size={17} className="text-signal shrink-0" />
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold tracking-widest text-white uppercase">UPLOAD_TO_AGENT</h2>
                        <p className="text-[11px] text-gray-500 font-mono truncate" title={targetPath}>
                            Target: {targetPath || '(agent root)'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors"><XCircle size={16} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10 shrink-0">
                    {(['library', 'payloads', 'local'] as const).map(t => (
                        <button key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                'flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest font-mono transition-colors',
                                tab === t
                                    ? 'text-signal border-b-2 border-signal bg-signal/5'
                                    : 'text-gray-600 hover:text-gray-400'
                            )}>
                            {t === 'library' ? '📦  Library' : t === 'payloads' ? '🚀  Payloads' : '💻  Upload New'}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden flex flex-col px-5 py-4 gap-3 min-h-0">

                    {/* ── LIBRARY TAB ────────────────────────────────────────────────── */}
                    {tab === 'library' && (
                        <>
                            <div>
                                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 block">Select File from Mythic</label>
                                <input
                                    autoFocus
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    placeholder="Filter by filename..."
                                    className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-1.5 text-white outline-none font-mono text-xs"
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto cyber-scrollbar border border-gray-800 min-h-[120px]">
                                {loading ? (
                                    <div className="flex items-center justify-center h-24 text-gray-600 font-mono text-xs animate-pulse">LOADING...</div>
                                ) : files.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-24 text-gray-700 font-mono text-xs gap-1">
                                        <Upload size={20} className="opacity-30" />
                                        <span>No uploaded files found</span>
                                        <button onClick={() => setTab('local')}
                                            className="mt-1 text-signal/60 hover:text-signal text-[10px] underline transition-colors">
                                            ↑ Upload a new file
                                        </button>
                                    </div>
                                ) : files.map((f: any) => {
                                    const fname = b64DecodeUnicode(f.filename_text);
                                    const sel = selectedId === f.agent_file_id;
                                    return (
                                        <button key={f.agent_file_id}
                                            className={cn(
                                                'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-white/5 last:border-b-0',
                                                sel ? 'bg-signal/15 text-signal' : 'hover:bg-white/5 text-gray-200'
                                            )}
                                            onClick={() => {
                                                setSelectedId(f.agent_file_id);
                                                if (!pathEdited.current) setRemotePath(joinDestPath(targetPath, fname));
                                            }}>
                                            <FileText size={13} className={sel ? 'text-signal shrink-0' : 'text-blue-400 shrink-0'} />
                                            <span className="flex-1 font-mono text-xs truncate" title={fname}>{fname}</span>
                                            <span className="text-[10px] text-gray-600 font-mono shrink-0">{formatBytes(f.size || 0)}</span>
                                            {f.comment && <span className="text-[10px] text-gray-700 font-mono truncate max-w-[80px]" title={f.comment}>{f.comment}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* ── PAYLOADS TAB ──────────────────────────────────────────────── */}
                    {tab === 'payloads' && (() => {
                        const payloads = (payloadData?.payload || []).filter((p: any) => {
                            const name = b64DecodeUnicode(p.filemetum?.filename_text || '').toLowerCase();
                            const desc = (p.description || '').toLowerCase();
                            const type = (p.payloadtype?.name || '').toLowerCase();
                            const q = payloadSearch.toLowerCase();
                            return name.includes(q) || desc.includes(q) || type.includes(q);
                        });
                        return (
                            <>
                                <div>
                                    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 block">Built Payloads</label>
                                    <input
                                        autoFocus
                                        value={payloadSearch} onChange={e => setPayloadSearch(e.target.value)}
                                        placeholder="Filter by name, type, or description..."
                                        className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-1.5 text-white outline-none font-mono text-xs"
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto cyber-scrollbar border border-gray-800 min-h-[120px]">
                                    {payloadLoading ? (
                                        <div className="flex items-center justify-center h-24 text-gray-600 font-mono text-xs animate-pulse">LOADING...</div>
                                    ) : payloads.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-24 text-gray-700 font-mono text-xs gap-1">
                                            <Upload size={20} className="opacity-30" />
                                            <span>No built payloads found</span>
                                        </div>
                                    ) : payloads.map((p: any) => {
                                        const fname = b64DecodeUnicode(p.filemetum?.filename_text || p.uuid);
                                        const fileId = p.filemetum?.agent_file_id;
                                        const sel = selectedPayloadFileId === fileId;
                                        const typeName = p.payloadtype?.name || '?';
                                        const size = p.filemetum?.size || 0;
                                        return (
                                            <button key={p.id}
                                                disabled={!fileId}
                                                className={cn(
                                                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-white/5 last:border-b-0',
                                                    !fileId ? 'opacity-40 cursor-not-allowed' :
                                                    sel ? 'bg-signal/15 text-signal' : 'hover:bg-white/5 text-gray-200'
                                                )}
                                                onClick={() => {
                                                    if (!fileId) return;
                                                    setSelectedPayloadFileId(fileId);
                                                    if (!pathEdited.current) setRemotePath(joinDestPath(targetPath, fname));
                                                }}>
                                                <span className={cn('text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0',
                                                    sel ? 'bg-signal/20 text-signal' : 'bg-purple-900/40 text-purple-300')}>
                                                    {typeName}
                                                </span>
                                                <span className="flex-1 font-mono text-xs truncate" title={fname}>{fname}</span>
                                                <span className="text-[10px] text-gray-600 font-mono shrink-0">{formatBytes(size)}</span>
                                                {p.description && (
                                                    <span className="text-[10px] text-gray-700 font-mono truncate max-w-[80px]" title={p.description}>{p.description}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}

                    {/* ── LOCAL UPLOAD TAB ───────────────────────────────────────────── */}
                    {tab === 'local' && (
                        <>
                            {/* Hidden file input */}
                            <input ref={fileInputRef} type="file" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) pickLocalFile(f); }} />

                            {/* Drop zone */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded cursor-pointer transition-all py-8 px-4 select-none',
                                    dragOver
                                        ? 'border-signal bg-signal/10 scale-[1.01]'
                                        : localFile
                                            ? 'border-signal/40 bg-signal/5'
                                            : 'border-gray-700 hover:border-gray-500 hover:bg-white/3'
                                )}>
                                {localFile ? (
                                    <>
                                        <FileText size={28} className="text-signal" />
                                        <span className="text-white font-mono text-sm font-bold text-center break-all">{localFile.name}</span>
                                        <span className="text-gray-500 text-[11px]">{formatBytes(localFile.size)} · click to change</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={28} className="text-gray-600" />
                                        <span className="text-gray-400 font-mono text-xs text-center">
                                            Drag &amp; drop a file here<br />
                                            <span className="text-gray-600">or click to browse</span>
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Upload progress */}
                            {uploading && (
                                <div className="flex items-center gap-2 text-signal text-[11px] font-mono animate-pulse">
                                    <Activity size={13} className="animate-spin shrink-0" />
                                    {uploadProgress}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── SHARED: Remote path + overwrite ───────────────────────────── */}
                    <div>
                        <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 block">Remote Destination Path</label>
                        <input
                            value={remotePath} onChange={e => { pathEdited.current = true; setRemotePath(e.target.value); }}
                            placeholder="e.g. C:\Windows\Temp\file.exe  (empty = agent's CWD)"
                            className="w-full bg-black/50 border border-gray-700 focus:border-signal px-3 py-1.5 text-white outline-none font-mono text-xs"
                        />
                    </div>

                    <button type="button" onClick={() => setOverwrite(o => !o)}
                        className={cn(
                            'flex items-center gap-3 px-3 py-2 border transition-colors text-left',
                            overwrite
                                ? 'border-yellow-500/40 bg-yellow-900/10 text-yellow-400'
                                : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                        )}>
                        <div className={cn('w-8 h-4 rounded-full relative transition-colors shrink-0', overwrite ? 'bg-yellow-500/60' : 'bg-gray-700')}>
                            <span className={cn('absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform', overwrite ? 'translate-x-4' : 'translate-x-0')} />
                        </div>
                        <span className="font-mono text-xs">Overwrite if file exists</span>
                    </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0">
                    <div className="text-[11px] font-mono text-signal truncate max-w-[55%]">
                        {tab === 'library' && selectedFile && (
                            <span title={b64DecodeUnicode(selectedFile.filename_text)}>
                                ✓ {b64DecodeUnicode(selectedFile.filename_text)}
                            </span>
                        )}
                        {tab === 'payloads' && selectedPayloadFileId && (() => {
                            const p = (payloadData?.payload || []).find((x: any) => x.filemetum?.agent_file_id === selectedPayloadFileId);
                            const fname = p ? b64DecodeUnicode(p.filemetum?.filename_text || selectedPayloadFileId) : selectedPayloadFileId;
                            return <span title={fname}>✓ {fname}</span>;
                        })()}
                        {tab === 'local' && localFile && !uploading && (
                            <span title={localFile.name}>✓ {localFile.name}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} disabled={isBusy}
                            className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs transition-colors disabled:opacity-40">
                            CANCEL
                        </button>
                        <button onClick={onSubmit}
                            disabled={isBusy || (tab === 'library' ? !selectedId : tab === 'payloads' ? !selectedPayloadFileId : !localFile)}
                            className="px-6 py-2 bg-signal text-void font-bold font-mono text-xs hover:bg-white disabled:opacity-50 transition-colors flex items-center gap-2">
                            {isBusy
                                ? <><Activity size={12} className="animate-spin" />{uploadProgress || 'WORKING…'}</>
                                : <><Upload size={12} />UPLOAD</>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Single tree node component
const FileTreeItem = ({ 
    node, host, callbackId, level, selectedFile, onSelectFile, expandedPaths, onToggleExpand, onFileAction, showDeletedFiles
}: { 
    node: FileNode; host: string; callbackId: number; level: number; 
    selectedFile: FileNode | null; onSelectFile: (n: FileNode) => void;
    expandedPaths: Set<string>; onToggleExpand: (path: string) => void;
    onFileAction?: (action: string, path: string, name: string, isDir: boolean) => void;
    showDeletedFiles?: boolean;
}) => {
    const isFolder = node.can_have_children;
    const isExpanded = expandedPaths.has(node.full_path_text);
    const isSelected = selectedFile?.full_path_text === node.full_path_text;
    const isDeleted = !!node.deleted;
    const meta = getMetadata(node);
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

    // Auto-fetch (and poll) folder contents whenever this node is expanded.
    // pollInterval keeps the listing fresh after an `ls` task completes without
    // requiring the user to manually collapse+re-expand.
    const { data, loading } = useQuery(GET_FILE_TREE_FOLDER, {
        variables: { parent_path_text: node.full_path_text, host },
        skip: !isExpanded || !isFolder,
        fetchPolicy: 'network-only',
        pollInterval: isExpanded && isFolder ? 4000 : 0,
    });

    const handleClick = () => {
        if (isFolder) {
            onToggleExpand(node.full_path_text);
        } else {
            onSelectFile(node);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        if (!onFileAction) return;
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, isDir: isFolder, path: normalizeUnixPath(node.full_path_text), name: node.name_text });
    };

    const allChildren = deduplicateNodes(data?.children || []).sort((a: FileNode, b: FileNode) => {
        if (a.can_have_children !== b.can_have_children) return a.can_have_children ? -1 : 1;
        return a.name_text.localeCompare(b.name_text);
    });
    const children = showDeletedFiles ? allChildren : allChildren.filter((c: FileNode) => !c.deleted);

    // Three-state folder coloring:
    //   YELLOW  — confirmed has children: DB has_children=true, OR success=true (was listed), OR fetch returned items
    //   RED     — confirmed empty: fetch returned 0 items after a successful listing (data loaded, no children)
    //   GRAY    — unknown: never fetched, has_children not set — don't penalise with red
    const fetchedAndEmpty = data !== undefined && !loading && children.length === 0;
    const confirmedHasContent = isFolder && (
        (node.has_children === true) ||
        (node.success === true && node.has_children !== false) ||
        (data !== undefined && children.length > 0)
    );
    // hasContent drives yellow; only show red when we KNOW it's empty (fetched + empty result)
    const hasContent = confirmedHasContent;
    const folderColorClass = isDeleted ? 'text-gray-600' :
        !isFolder ? '' :
        confirmedHasContent  ? 'text-yellow-500' :
        fetchedAndEmpty      ? 'text-red-500'    :
        'text-gray-500';
    const folderTextClass = isDeleted ? 'text-gray-600' :
        !isFolder ? '' :
        confirmedHasContent  ? 'text-yellow-200' :
        fetchedAndEmpty      ? 'text-red-400'    :
        'text-gray-400';

    return (
        <div>
            {ctxMenu && onFileAction && (
                <ContextMenu
                    menu={ctxMenu}
                    onAction={(action, path, name) => onFileAction(action, path, name, isFolder)}
                    onClose={() => setCtxMenu(null)}
                />
            )}
            <div
                className={cn(
                    "flex items-center gap-1.5 py-1 px-1 cursor-pointer transition-colors group text-[13px]",
                    isDeleted ? "opacity-50" : "",
                    isSelected ? "bg-signal/15 text-signal" : "hover:bg-white/5"
                )}
                style={{ paddingLeft: `${level * 14 + 4}px` }}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {/* Expand/collapse icon */}
                {isFolder ? (
                    <span className="w-4 flex items-center justify-center shrink-0 text-gray-500 group-hover:text-signal">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                ) : <span className="w-4" />}

                {/* Icon — yellow if confirmed content, red if confirmed empty, gray if unknown */}
                {isFolder ? (
                    isExpanded ? <FolderOpen size={15} className={folderColorClass} /> 
                              : <Folder size={15} className={folderColorClass} />
                ) : (
                    <FileText size={15} className={isDeleted ? 'text-gray-600' : 'text-blue-400'} />
                )}

                {/* Name */}
                <span className={cn(
                    "font-mono truncate flex-1",
                    isDeleted ? 'line-through text-gray-600' :
                    isFolder 
                        ? folderTextClass
                        : "text-white group-hover:text-signal"
                )} title={node.full_path_text}>
                    {node.name_text || (level === 0 ? "/" : "")}
                </span>

                {/* Size for files */}
                {!isFolder && meta.size !== undefined && (
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">{formatBytes(meta.size)}</span>
                )}
            </div>

            {/* Children */}
            {isFolder && isExpanded && (
                <div>
                    {loading ? (
                        <div className="text-[11px] text-gray-600 font-mono animate-pulse" style={{ paddingLeft: `${(level + 1) * 14 + 20}px` }}>
                            Loading...
                        </div>
                    ) : children.length > 0 ? (
                        children.map((child: FileNode) => (
                            <FileTreeItem
                                key={child.full_path_text}
                                node={child}
                                host={host}
                                callbackId={callbackId}
                                level={level + 1}
                                selectedFile={selectedFile}
                                onSelectFile={onSelectFile}
                                expandedPaths={expandedPaths}
                                onToggleExpand={onToggleExpand}
                                onFileAction={onFileAction}
                                showDeletedFiles={showDeletedFiles}
                            />
                        ))
                    ) : (
                        <div className="text-[11px] text-red-400/60 font-mono italic" style={{ paddingLeft: `${(level + 1) * 14 + 20}px` }}>
                            Empty or not yet listed
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const FileBrowserPanel = ({ host, callbackId, onFileAction: externalOnFileAction }: { host: string, callbackId: number, onFileAction?: (action: string, path: string, name: string, isDir: boolean) => void }) => {
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [currentRefreshPath, setCurrentRefreshPath] = useState('.');
    const [uploadTarget, setUploadTarget] = useState<string | null>(null);
    const [showDeletedFiles, setShowDeletedFiles] = useState(false);

    const { data: rootData, loading: rootLoading } = useQuery(GET_FILE_TREE_ROOT, {
        variables: { host },
        fetchPolicy: 'network-only',
        pollInterval: 4000,
    });

    const handleToggleExpand = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    }, []);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await createTask({
                variables: { callback_id: callbackId, command: "ls", params: JSON.stringify({path: ".", depth: 1}), tasking_location: "parsed_cli", parameter_group_name: "Default", original_params: "." }
            });
            snackActions.info("Tasked 'ls .' (root)");
            setTimeout(() => setIsRefreshing(false), 2000);
        } catch (e: any) {
            snackActions.error("Failed to task 'ls': " + e.message);
            setIsRefreshing(false);
        }
    }, [callbackId, createTask]);

    const handleDownload = useCallback((node: FileNode) => {
        const p = normalizeUnixPath(node.full_path_text);
        createTask({
            variables: { callback_id: callbackId, command: "download", params: p, tasking_location: "command_line", original_params: p }
        }).then(() => snackActions.info(`Tasked download for ${node.name_text}`))
          .catch((e: any) => snackActions.error("Download failed: " + e.message));
    }, [callbackId, createTask]);

    const handleViewFile = useCallback((node: FileNode) => {
        setSelectedFile(node);
        const p = normalizeUnixPath(node.full_path_text);
        createTask({
            variables: { callback_id: callbackId, command: "cat", params: p, tasking_location: "command_line", original_params: p }
        }).then(() => snackActions.info(`Tasked 'cat ${node.name_text}'`))
          .catch((e: any) => snackActions.error("Failed to read file: " + e.message));
    }, [callbackId, createTask]);

    const handleFileAction = useCallback((action: string, path: string, name: string, isDir: boolean) => {
        const p = normalizeUnixPath(path);
        if (action === 'ls') {
            createTask({ variables: { callback_id: callbackId, command: 'ls', params: JSON.stringify({path: p, depth: 1}), tasking_location: "parsed_cli", parameter_group_name: "Default", original_params: p } })
                .then(() => snackActions.info(`Tasked 'ls ${p}'`))
                .catch((e: any) => snackActions.error('ls failed: ' + e.message));
        } else if (action === 'download') {
            createTask({ variables: { callback_id: callbackId, command: 'download', params: p, tasking_location: "command_line", original_params: p } })
                .then(() => snackActions.info(`Tasked download: ${name}`))
                .catch((e: any) => snackActions.error('Download failed: ' + e.message));
        } else if (action === 'cat') {
            createTask({ variables: { callback_id: callbackId, command: 'cat', params: p, tasking_location: "command_line", original_params: p } })
                .then(() => snackActions.info(`Tasked 'cat ${name}'`))
                .catch((e: any) => snackActions.error('cat failed: ' + e.message));
        } else if (action === 'upload') {
            setUploadTarget(p);
        } else if (action === 'copy') {
            navigator.clipboard.writeText(p);
            snackActions.success('Path copied');
        }
        externalOnFileAction?.(action, p, name, isDir);
    }, [callbackId, createTask, externalOnFileAction]);

    const rootNodes = deduplicateNodes(rootData?.mythictree || []).sort((a: FileNode, b: FileNode) => {
        if (a.can_have_children !== b.can_have_children) return a.can_have_children ? -1 : 1;
        return a.name_text.localeCompare(b.name_text);
    });

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {uploadTarget !== null && (
                <UploadToAgentModal
                    targetPath={uploadTarget}
                    callbackId={callbackId}
                    onClose={() => setUploadTarget(null)}
                />
            )}
            {/* Toolbar */}
            <div className="shrink-0 flex items-center gap-2 mb-2 bg-black/30 rounded p-2 border border-white/5">
                <HardDrive size={14} className="text-signal shrink-0" />
                <span className="text-xs font-mono text-gray-400 truncate flex-1" title={host}>{host}</span>
                <button
                    onClick={() => setShowDeletedFiles(v => !v)}
                    className={cn("p-1.5 rounded transition-colors shrink-0 text-[10px] font-mono", showDeletedFiles ? "text-orange-400 bg-orange-400/10 border border-orange-400/30" : "text-gray-600 hover:text-gray-400 hover:bg-white/5")}
                    title={showDeletedFiles ? "Hide previously-seen files" : "Show previously-seen files"}
                >
                    <EyeOff size={13} />
                </button>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={cn("p-1.5 rounded transition-colors shrink-0", isRefreshing ? "text-signal animate-spin" : "text-gray-400 hover:text-signal hover:bg-white/10")}
                    title="Refresh (sends 'ls' to target)"
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Legend */}
            <div className="shrink-0 flex items-center gap-3 mb-1 text-[10px] font-mono px-1">
                <span className="flex items-center gap-1"><Folder size={10} className="text-yellow-500" /> Has content</span>
                <span className="flex items-center gap-1"><Folder size={10} className="text-gray-500" /> Not listed</span>
                <span className="flex items-center gap-1"><Folder size={10} className="text-red-500" /> Empty</span>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-auto cyber-scrollbar pr-1">
                {rootLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-500 text-xs font-mono animate-pulse">
                        SCANNING_FILESYSTEM...
                    </div>
                ) : rootNodes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 text-xs font-mono">
                        <Folder size={28} className="mb-2 opacity-30" />
                        <span className="text-sm">NO_FILE_DATA</span>
                        <span className="text-[11px] mt-1 text-gray-700">Execute 'ls' to browse</span>
                        <button onClick={handleRefresh} className="mt-3 px-3 py-1.5 bg-signal/10 border border-signal/30 text-signal rounded text-xs hover:bg-signal/20 transition-colors flex items-center gap-1.5">
                            <RefreshCw size={12} /> SCAN
                        </button>
                    </div>
                ) : (
                    rootNodes.map((node: FileNode) => (
                        <FileTreeItem
                            key={node.full_path_text}
                            node={node}
                            host={host}
                            callbackId={callbackId}
                            level={0}
                            selectedFile={selectedFile}
                            onSelectFile={setSelectedFile}
                            expandedPaths={expandedPaths}
                            onToggleExpand={handleToggleExpand}
                            onFileAction={handleFileAction}
                            showDeletedFiles={showDeletedFiles}
                        />
                    ))
                )}
            </div>

            {/* Selected file detail panel */}
            <AnimatePresence>
                {selectedFile && !selectedFile.can_have_children && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0 mt-2 overflow-hidden"
                    >
                        <div className="bg-black/40 border border-white/10 rounded p-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-mono text-signal truncate flex-1">{selectedFile.name_text}</span>
                                <button onClick={() => setSelectedFile(null)} className="p-0.5 hover:bg-white/10 rounded text-gray-500">
                                    <XCircle size={14} />
                                </button>
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono space-y-0.5">
                                <div>Path: {selectedFile.full_path_text}</div>
                                {(() => {
                                    const meta = getMetadata(selectedFile);
                                    return (
                                        <>
                                            {meta.size !== undefined && <div>Size: {formatBytes(meta.size)}</div>}
                                            {meta.modify_time && <div>Modified: {meta.modify_time}</div>}
                                            {meta.permissions && <div>Perms: {JSON.stringify(meta.permissions)}</div>}
                                            {meta.owner && <div>Owner: {meta.owner}</div>}
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="flex gap-1.5 mt-2">
                                <button onClick={() => handleDownload(selectedFile)}
                                    className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded text-[11px] hover:bg-blue-500/20">
                                    <Download size={11} /> Download
                                </button>
                                <button onClick={() => handleViewFile(selectedFile)}
                                    className="flex items-center gap-1 px-2 py-1 bg-signal/10 border border-signal/30 text-signal rounded text-[11px] hover:bg-signal/20">
                                    <Eye size={11} /> Cat
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(selectedFile.full_path_text); snackActions.success("Path copied"); }}
                                    className="flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 text-gray-400 rounded text-[11px] hover:bg-white/10">
                                    <Copy size={11} /> Path
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================
// Process List
// ============================================
const parseProcessMetadata = (proc: any) => {
    let details: any = {};
    try {
        if (typeof proc.metadata === 'string') details = JSON.parse(proc.metadata);
        else if (typeof proc.metadata === 'object' && proc.metadata !== null) details = proc.metadata;
    } catch (e) {}
    return {
        pid: details.process_id ?? details.pid ?? 0,
        ppid: details.parent_process_id ?? details.ppid ?? 0,
        user: details.user || "Unknown",
        arch: details.architecture || details.arch || "",
        integrityLevel: details.integrity_level ?? "-",
        sessionId: details.session_id ?? "-",
        binPath: details.bin_path || details.path || "-",
        cmdLine: details.command_line || details.cmd || "-",
        description: details.description || "",
        signer: details.signer || "",
        companyName: details.company_name || "",
        windowTitle: details.window_title || "",
    };
};

interface ProcessNode {
    proc: any;
    details: ReturnType<typeof parseProcessMetadata>;
    children: ProcessNode[];
    depth: number;
}

const buildProcessTree = (processes: any[]): ProcessNode[] => {
    const pidMap = new Map<number, ProcessNode>();
    const allNodes: ProcessNode[] = [];
    processes.forEach(proc => {
        const details = parseProcessMetadata(proc);
        const node: ProcessNode = { proc, details, children: [], depth: 0 };
        pidMap.set(details.pid, node);
        allNodes.push(node);
    });
    const rootNodes: ProcessNode[] = [];
    allNodes.forEach(node => {
        const parentNode = pidMap.get(node.details.ppid);
        if (parentNode && parentNode !== node) parentNode.children.push(node);
        else rootNodes.push(node);
    });
    const sortAndSetDepth = (nodes: ProcessNode[], depth: number) => {
        nodes.sort((a, b) => a.details.pid - b.details.pid);
        nodes.forEach(node => { node.depth = depth; sortAndSetDepth(node.children, depth + 1); });
    };
    sortAndSetDepth(rootNodes, 0);
    const flattenTree = (nodes: ProcessNode[]): ProcessNode[] => {
        const result: ProcessNode[] = [];
        nodes.forEach(node => { result.push(node); result.push(...flattenTree(node.children)); });
        return result;
    };
    return flattenTree(rootNodes);
};

const ProcessList = ({ host }: { host: string }) => {
    const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());
    const [selectedHost, setSelectedHost] = useState(host);
    const [allExpanded, setAllExpanded] = useState(false);

    // Fetch all available process hosts
    const { data: hostsData } = useQuery(GET_PROCESS_HOSTS, { fetchPolicy: 'cache-and-network' });
    const allHosts: string[] = React.useMemo(() => {
        const hosts = (hostsData?.mythictree || []).map((h: any) => h.host).filter(Boolean);
        // Ensure current callback host is always in list
        if (host && !hosts.includes(host)) hosts.unshift(host);
        return [...new Set(hosts)] as string[];
    }, [hostsData, host]);

    const { data, loading, error, refetch } = useQuery(GET_PROCESS_TREE, {
        variables: { host: selectedHost }, pollInterval: 10000
    });

    const rawProcesses = data?.mythictree || [];
    const processMap = new Map<string, any>();
    rawProcesses.forEach((proc: any) => {
        const key = proc.full_path_text || proc.name_text || proc.id;
        if (!processMap.has(key)) processMap.set(key, proc);
    });
    const processTree = buildProcessTree(Array.from(processMap.values()));

    const toggleExpand = (pid: number) => {
        setExpandedPids(prev => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid); else next.add(pid);
            return next;
        });
    };

    const handleExpandAll = () => {
        const allPids = new Set(processTree.map(n => n.details.pid));
        setExpandedPids(allPids);
        setAllExpanded(true);
    };
    const handleCollapseAll = () => {
        setExpandedPids(new Set());
        setAllExpanded(false);
    };

    if (loading && processTree.length === 0) return <div className="p-4 text-gray-500 animate-pulse font-mono text-sm flex items-center justify-center h-full">SCANNING_PROCESS_MEMORY...</div>;
    if (error) return <div className="p-4 text-red-500 font-mono text-sm">PROC_ERROR: {error.message}</div>;

    if (processTree.length === 0) {
        return (
            <div className="h-full p-4 text-gray-400 font-mono text-sm flex flex-col items-center justify-center">
                <Activity size={28} className="mb-2 opacity-50 text-red-500" />
                <p className="text-base text-signal">NO_PROCESS_DATA</p>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    Execute <span className="text-white font-bold">ps</span> to capture processes
                </p>
                <button onClick={() => refetch()} className="mt-4 px-3 py-1.5 bg-signal/10 hover:bg-signal/20 border border-signal/30 text-signal rounded transition-all flex items-center gap-2 text-sm">
                    <Activity size={14} /> REFRESH
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Host selector + actions bar */}
            <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-white/10 bg-black/30">
                <Globe size={12} className="text-gray-500 shrink-0" />
                <select
                    value={selectedHost}
                    onChange={e => setSelectedHost(e.target.value)}
                    className="flex-1 bg-transparent text-xs font-mono text-white border border-white/15 rounded px-1.5 py-1 appearance-none cursor-pointer hover:border-signal/40 transition-colors min-w-0"
                    title="Select host to browse processes"
                >
                    {allHosts.map(h => (
                        <option key={h} value={h} className="bg-gray-900 text-white">{h}{h === host ? ' (current)' : ''}</option>
                    ))}
                </select>
                <button onClick={handleExpandAll} title="Expand All" className="p-1 text-gray-500 hover:text-signal transition-colors"><ChevronDown size={12} /></button>
                <button onClick={handleCollapseAll} title="Collapse All" className="p-1 text-gray-500 hover:text-signal transition-colors"><ChevronUp size={12} /></button>
                <button onClick={() => refetch()} title="Refresh" className="p-1 text-gray-500 hover:text-signal transition-colors"><RefreshCw size={12} /></button>
                <span className="text-[10px] text-gray-600 font-mono shrink-0">{processTree.length}</span>
            </div>
            {/* Process table */}
            <div className="flex-1 overflow-auto cyber-scrollbar">
                <table className="w-full text-[13px] font-mono text-left border-collapse">
                    <thead className="bg-black/40 text-gray-500 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                            <th className="p-2 font-normal border-b border-white/10 w-16">PID</th>
                            <th className="p-2 font-normal border-b border-white/10">NAME</th>
                            <th className="p-2 font-normal border-b border-white/10 w-20">USER</th>
                            <th className="p-2 font-normal border-b border-white/10 w-12">ARCH</th>
                            <th className="p-2 font-normal border-b border-white/10 w-10">IL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {processTree.map((node) => {
                            const { proc, details, children, depth } = node;
                            const { pid, ppid, user, arch, integrityLevel, binPath, cmdLine, sessionId, description, signer } = details;
                            const isExpanded = expandedPids.has(pid);
                            const indent = depth * 14;
                            
                            return (
                                <React.Fragment key={proc.id}>
                                    <tr className={cn("hover:bg-white/5 transition-colors group cursor-pointer", isExpanded ? "bg-white/10" : "")} onClick={() => toggleExpand(pid)}>
                                        <td className="p-2 text-signal font-bold">{pid || "---"}</td>
                                        <td className="p-2">
                                            <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
                                                {depth > 0 && <span className="text-gray-600 mr-1">└</span>}
                                                {children.length > 0 && <span className="text-signal mr-1">{isExpanded ? '▼' : '▶'}</span>}
                                                <span className="text-white group-hover:text-yellow-400 transition-colors truncate" title={proc.name_text}>{proc.name_text}</span>
                                            </div>
                                        </td>
                                        <td className="p-2 text-gray-400 truncate max-w-[90px]" title={user}>{user}</td>
                                        <td className="p-2 text-gray-500 text-[11px]">{arch}</td>
                                        <td className="p-2 text-gray-500 text-[11px]">{integrityLevel !== '-' ? integrityLevel : ''}</td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-black/50">
                                            <td colSpan={5} className="p-2.5">
                                                <div className="text-xs text-gray-200 space-y-1 break-all" style={{ marginLeft: `${indent + 14}px` }}>
                                                    <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
                                                        <div><span className="text-gray-500">PID:</span> <span className="text-signal">{pid}</span></div>
                                                        <div><span className="text-gray-500">PPID:</span> <span className="text-gray-300">{ppid}</span></div>
                                                        <div><span className="text-gray-500">Session:</span> <span className="text-gray-300">{sessionId}</span></div>
                                                        <div><span className="text-gray-500">Arch:</span> <span className="text-gray-300">{arch}</span></div>
                                                        <div><span className="text-gray-500">IL:</span> <span className="text-gray-300">{integrityLevel}</span></div>
                                                        {signer && <div><span className="text-gray-500">Signed:</span> <span className="text-gray-300">{signer}</span></div>}
                                                    </div>
                                                    {binPath !== '-' && <div className="text-[11px]"><span className="text-gray-500">Bin:</span> <span className="text-gray-300 select-all">{binPath}</span></div>}
                                                    {cmdLine !== '-' && <div className="text-[11px]"><span className="text-gray-500">Cmd:</span> <span className="text-gray-300 select-all">{cmdLine}</span></div>}
                                                    {description && <div className="text-[11px]"><span className="text-gray-500">Desc:</span> <span className="text-gray-300">{description}</span></div>}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ============================================
// Main Console Page
// ============================================
export default function Console() {
    const { id } = useParams();
    const navigate = useNavigate();
    const client = useApolloClient();
    const { isSidebarCollapsed, consoleTabs, openConsoleTab, closeConsoleTab } = useAppStore();
    const [activeTab, setActiveTab] = useState<'info' | 'files' | 'processes'>('info');
    const [showCallbackMenu, setShowCallbackMenu] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
    const [descEditOpen, setDescEditOpen] = useState(false);
    const [descValue, setDescValue] = useState('');
    const [showEventingDialog, setShowEventingDialog] = useState(false);
    const cbMenuRef = useRef<HTMLDivElement>(null);
    const menuContentRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        if (!showCallbackMenu) return;
        const handler = (e: MouseEvent) => {
            const inBtn = cbMenuRef.current?.contains(e.target as Node);
            const inMenu = menuContentRef.current?.contains(e.target as Node);
            if (!inBtn && !inMenu) setShowCallbackMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showCallbackMenu]);

    const { data, loading, error } = useQuery(GET_CALLBACK_DETAILS, {
        variables: { display_id: parseInt(id || '0') },
        pollInterval: 5000
    });

    const { data: allCallbacksData } = useQuery(GET_ALL_CALLBACKS_BY_DOMAIN, {
        pollInterval: 15000
    });

    const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Callback hidden')
            : snackActions.error(d.updateCallback?.error || 'Failed'),
    });
    const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Callback lock state updated')
            : snackActions.error(d.updateCallback?.error || 'Failed'),
    });
    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Description updated')
            : snackActions.error(d.updateCallback?.error || 'Failed'),
    });

    const [createTask] = useMutation(CREATE_TASK_MUTATION);

    const handleExitCallback = async () => {
        if (!callback) return;
        try {
            const { data: exitData } = await client.query({
                query: GET_EXIT_CALLBACK_COMMAND,
                variables: { callback_id: callback.id },
                fetchPolicy: 'network-only',
            });
            const exitCmds = exitData?.callback_by_pk?.loadedcommands || [];
            if (exitCmds.length === 0) {
                snackActions.warning('No exit command loaded for this callback');
                return;
            }
            if (!window.confirm(`Task ${exitCmds[0].command.cmd} on Callback ${callback.display_id}?`)) return;
            await createTask({
                variables: {
                    callback_id: callback.id,
                    command: exitCmds[0].command.cmd,
                    params: '',
                    tasking_location: 'command_line',
                }
            });
            snackActions.success(`Tasked ${exitCmds[0].command.cmd}`);
        } catch (e: any) {
            snackActions.error('Failed to exit callback: ' + e.message);
        }
    };

    const callback = data?.callback?.[0];
    const allCallbacks = allCallbacksData?.callback || [];

    // Register tab in global store when callback data loads
    useEffect(() => {
        if (callback) {
            openConsoleTab({
                id: callback.display_id,
                host: callback.host || '',
                user: callback.user || '',
                payloadType: callback.payload?.payloadtype?.name || '',
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callback?.display_id]);

    if (loading && !callback) return <div className="bg-black text-signal p-10 font-mono text-base">INITIALIZING_CONSOLE...</div>;
    if (error) return <div className="bg-black text-red-500 p-10 font-mono text-base">CONNECTION_ERROR: {error.message}</div>;
    if (!callback) return <div className="bg-black text-red-500 p-10 font-mono text-base">ERROR: CALLBACK_NOT_FOUND</div>;

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-hidden">
            <Sidebar />
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Multi-callback tab bar */}
                {consoleTabs.length > 1 && (
                    <div className="flex items-center gap-0 bg-black/80 border-b border-signal/10 overflow-x-auto shrink-0 h-8">
                        {consoleTabs.map(tab => (
                            <div key={tab.id}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 h-full border-r border-signal/10 font-mono text-[11px] cursor-pointer select-none group shrink-0',
                                    tab.id === parseInt(id || '0')
                                        ? 'bg-signal/10 text-signal border-t-2 border-t-signal'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                )}
                            >
                                <span onClick={() => navigate(`/console/${tab.id}`)}>
                                    C{tab.id}&nbsp;·&nbsp;{tab.host || `#${tab.id}`}
                                </span>
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        const currentId = parseInt(id || '0');
                                        if (tab.id === currentId) {
                                            const idx = consoleTabs.findIndex(t => t.id === tab.id);
                                            const next = consoleTabs[idx + 1] ?? consoleTabs[idx - 1];
                                            closeConsoleTab(tab.id);
                                            navigate(next ? `/console/${next.id}` : '/console-matrix');
                                        } else {
                                            closeConsoleTab(tab.id);
                                        }
                                    }}
                                    className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                                >
                                    <X size={9} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {/* Header */}
                <header className="h-14 bg-black/50 border-b border-signal/20 flex items-center px-6 justify-between backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border border-signal bg-signal/10 flex items-center justify-center">
                            <Terminal size={20} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-widest flex items-center gap-2">
                                <span className="text-signal">CALLBACK_{callback.display_id}</span>
                                <span className="text-gray-500 text-sm">/</span>
                                <span className="text-white text-base">{callback.user}@{callback.host}</span>
                            </h1>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500 font-mono">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 bg-signal rounded-full animate-pulse"></span>
                                    ONLINE
                                </span>
                                <span>•</span>
                                <span>{callback.payload?.payloadtype?.name}</span>
                                <span>•</span>
                                <span>{callback.os} ({callback.architecture})</span>
                                {callback.domain && (
                                    <>
                                        <span>•</span>
                                        <span className="text-cyan-400">{callback.domain}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden md:block">
                            <div className="text-[11px] text-gray-500 uppercase">Last Seen</div>
                            <div className="text-signal font-mono text-sm">{timeSince(callback.last_checkin)}</div>
                        </div>
                        {/* Callback action menu */}
                        <div ref={cbMenuRef}>
                            <button
                                onClick={(e) => {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                    setShowCallbackMenu(m => !m);
                                }}
                                className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Callback Actions"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                            {showCallbackMenu && createPortal(
                                <div ref={menuContentRef} className="w-56 bg-[#0a0a0a] border border-signal/30 shadow-[0_0_20px_rgba(34,197,94,0.15)] z-[9999] py-1"
                                    style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}>
                                    <div className="px-3 py-1.5 text-[10px] font-mono text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1">
                                        CALLBACK_{callback.display_id} ACTIONS
                                    </div>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-signal/10 hover:text-signal transition-colors"
                                        onClick={() => {
                                            lockCallback({ variables: { callback_display_id: callback.display_id, locked: !callback.locked } });
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        {callback.locked ? <><Unlock size={13} className="text-yellow-400" /> Unlock Callback</> : <><Lock size={13} className="text-red-400" /> Lock Callback</>}
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-signal/10 hover:text-signal transition-colors"
                                        onClick={() => {
                                            setDescValue(callback.description || '');
                                            setDescEditOpen(true);
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        <MessageSquare size={13} className="text-blue-400" /> Edit Description
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-signal/10 hover:text-signal transition-colors"
                                        onClick={() => {
                                            setShowEventingDialog(true);
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        <Zap size={13} className="text-purple-400" /> Trigger Eventing
                                    </button>
                                    <div className="border-t border-white/10 my-1" />
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-red-500/10 hover:text-red-400 transition-colors text-orange-500/80"
                                        onClick={() => {
                                            handleExitCallback();
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        <XCircle size={13} /> Exit Callback
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-red-500/10 hover:text-red-400 transition-colors text-red-500/70"
                                        onClick={() => {
                                            if (window.confirm(`Hide callback ${callback.display_id}? You can re-show it from the callbacks page.`)) {
                                                hideCallback({ variables: { callback_display_id: callback.display_id, active: false } });
                                                setShowCallbackMenu(false);
                                            }
                                        }}
                                    >
                                        <EyeOff size={13} /> Hide Callback
                                    </button>
                                </div>,
                                document.body
                            )}
                        </div>
                    </div>
                </header>

                {/* Description edit — accordion below header */}
                <AnimatePresence>
                {descEditOpen && (
                    <motion.div
                        className="overflow-hidden shrink-0"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="border-b border-signal/20 bg-black/50 px-5 pt-3 pb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-[3px] h-3.5 bg-signal inline-block" />
                                <span className="font-mono text-[10px] font-bold text-signal tracking-widest uppercase">Edit Description</span>
                            </div>
                            <textarea
                                value={descValue}
                                onChange={e => setDescValue(e.target.value)}
                                rows={3}
                                className="w-full bg-black/60 border border-gray-700 focus:border-signal px-3 py-2 text-white font-mono text-sm resize-y outline-none transition-colors"
                                placeholder="Enter description..."
                                autoFocus
                            />
                            <div className="flex justify-end gap-3 mt-3">
                                <button onClick={() => setDescEditOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs transition-colors">CANCEL</button>
                                <button
                                    onClick={() => {
                                        updateDescription({ variables: { callback_display_id: callback.display_id, description: descValue } });
                                        setDescEditOpen(false);
                                    }}
                                    className="px-5 py-2 bg-signal text-black font-mono text-xs font-bold hover:bg-white transition-colors"
                                >
                                    SAVE
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>

                {/* Main Content */}
                <div className="flex-1 p-3 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0 overflow-hidden">
                    <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
                        <ConsoleTerminal
                                callbackId={callback.display_id}
                                callbackDbId={callback.id}
                                callbackUUID={callback.agent_callback_id}
                                payloadtypeName={callback.payload?.payloadtype?.name || ''}
                                payloadtypeId={callback.payload?.payloadtype?.id || 0}
                                callbackOs={callback.os || ''}
                                operationId={callback.operation_id || 0}
                                callbackHost={callback.host || ''}
                                callbackActive={!!callback.active}
                                callbackLastCheckin={callback.last_checkin || null}
                                callbackSleepInfo={callback.sleep_info || null}
                            />
                    </div>

                    <div className="flex flex-col bg-black/40 border border-white/10 min-h-0 rounded overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b border-white/10 shrink-0">
                            {[
                                { id: 'info', label: 'INFO', icon: Info },
                                { id: 'files', label: 'FILES', icon: Folder },
                                { id: 'processes', label: 'PROCS', icon: Activity },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={cn(
                                        "flex-1 py-3 text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-colors duration-200",
                                        activeTab === tab.id 
                                            ? "bg-signal text-black" 
                                            : "text-gray-500 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 p-3 overflow-hidden relative">
                            <div className="absolute inset-0 p-3 overflow-hidden flex flex-col">
                                {activeTab === 'info' && <InfoPanel callback={callback} allCallbacks={allCallbacks} />}
                                {activeTab === 'files' && <FileBrowserPanel host={callback.host} callbackId={callback.display_id} />}
                                {activeTab === 'processes' && <ProcessList host={callback.host} />}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Eventing Trigger Dialog */}
            {showEventingDialog && (
                <MythicDialog fullWidth={true} maxWidth="xl" open={showEventingDialog}
                    onClose={() => setShowEventingDialog(false)}
                    innerDialog={<EventTriggerContextSelectDialog
                        onClose={() => setShowEventingDialog(false)}
                        triggerContext={{ name: "callback_id", value: callback.id }} />}
                />
            )}
        </div>
    );
}
