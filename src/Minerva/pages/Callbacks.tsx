/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useSubscription, useMutation, useLazyQuery, useApolloClient, useReactiveVar } from '@apollo/client';
import {
    GET_CALLBACKS, SUBSCRIPTION_CALLBACKS, GET_CALLBACK_GRAPH_EDGES, GET_CALLBACK_GRAPH_EDGES_ALL,
    HIDE_CALLBACK_MUTATION, LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION, UPDATE_DESCRIPTION_AND_COLOR_MUTATION, EXPORT_CALLBACK_CONFIG,
    GET_CALLBACK_FULL_DETAILS, HIDE_CALLBACKS_BULK,
    GET_EXIT_CALLBACK_COMMAND, CREATE_TASK_MUTATION,
    UPDATE_SLEEP_INFO_MUTATION, UPDATE_CALLBACK_TRIGGER_MUTATION,
    UPDATE_CALLBACK_COLOR_MUTATION, UPDATE_IPS_MUTATION,
    UPDATE_CALLBACK_GROUPS_MUTATION, IMPORT_CALLBACK_CONFIG,
    CREATE_TASK_BULK, GET_CALLBACK_C2_PATHS,
    GET_CALLBACKS_FOR_BULK_TASK, GET_CUSTOM_BROWSERS,
    ADD_LOADED_COMMAND, REMOVE_LOADED_COMMAND, GET_CALLBACK_COMMANDS_FOR_TRANSFER,
    PAYLOAD_CALLBACK_ALLOWED_MUTATION, HOST_FILE_MUTATION, GET_RUNNING_EGRESS_C2_PROFILES,
    ADD_EDGE_MUTATION, REMOVE_EDGE_MUTATION, GET_P2P_PROFILES_AND_CALLBACKS, GET_LINK_COMMANDS_FOR_CALLBACK,
} from '../lib/api';
import { MythicDialog } from '../../components/MythicComponents/MythicDialog';
import { ViewEditTagsDialog } from '../../components/MythicComponents/MythicTag';
import { meState } from '../../cache';
import { EventTriggerContextSelectDialog } from '../../components/pages/Eventing/EventTriggerContextSelect';
import { isCallbackAlive, cn } from '../lib/utils';
import { CyberTable } from '../components/CyberTable';
import {
    Terminal, Shield, Activity, User, MoreVertical, Lock, Unlock, EyeOff, Eye,
    Edit, Network, List, Skull, Columns, Square, CheckSquare, Folder, FolderSearch,
    Download, Globe, Wifi, WifiOff, Search, X, Filter, ChevronDown, Tag, Zap, Copy,
    FileText, ExternalLink, Info, RefreshCw, Layers, Hash, XCircle, Clock, Bell, BellOff,
    Palette, Upload, Plus, Minus, ChevronRight, GitBranch, CheckCircle, Monitor, Settings, SlidersHorizontal,
    SplitSquareHorizontal, ToggleLeft, ToggleRight, Server, LayoutGrid, Camera, FileImage,
    ArrowUpDown, ArrowLeftRight, Link2, Trash2,
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { createPortal } from 'react-dom';
import { snackActions } from '../../components/utilities/Snackbar';
import { CyberModal } from '../components/CyberModal';
import {
    ReactFlow,
    Background,

    useNodesState,
    useEdgesState,
    BaseEdge,
    Handle,
    Position,
    getStraightPath,
    EdgeLabelRenderer,
    EdgeProps,
    ReactFlowProvider,
    useReactFlow,
} from '@xyflow/react';
// @ts-ignore
import ELK from 'elkjs/lib/elk.bundled.js';
import { toSvg, toPng } from 'html-to-image';
import { CallbackGraph } from '../components/CallbackGraph';
const loadingSound = process.env.PUBLIC_URL + '/audio/loading.m4a';
const _c2Elk = new ELK();

/* ─────────── LastCheckinCell ─────────── */
const LastCheckinCell = ({ lastCheckin, agentType, dead }: { lastCheckin: string; agentType?: string; dead?: boolean }) => {
    const me = useReactiveVar(meState) as any;
    const serverSkewMs = (me?.user?.server_skew) || 0;

    // Non-agent payloads (e.g. service workers) show blank
    if (agentType && agentType !== 'agent') return <span className="text-gray-600">—</span>;

    // Streaming / interactive shell — special 1970 timestamp
    if (lastCheckin && (lastCheckin.startsWith('1970') || lastCheckin === '1970-01-01T00:00:00')) {
        return (
            <span className="flex items-center gap-1 text-blue-400 font-mono text-xs">
                {dead && <Skull size={10} className="text-red-500 shrink-0" />}
                STREAMING
            </span>
        );
    }

    const calculateTimeAgo = React.useCallback(() => {
        if (!lastCheckin) return { text: "NEVER", color: "text-gray-500", title: '' };
        try {
            const timeStr = lastCheckin.endsWith('Z') ? lastCheckin : `${lastCheckin}Z`;
            const last = new Date(timeStr).getTime();
            const now = new Date().getTime() - serverSkewMs;
            const diff = Math.floor((now - last) / 1000);
            let color = "text-green-500";
            if (diff > 60) color = "text-yellow-500";
            if (diff > 300) color = "text-red-500";
            let timeText = `${diff}s ago`;
            if (diff < 0) timeText = "0s ago";
            else if (diff >= 86400) timeText = `${Math.floor(diff / 86400)}d ago`;
            else if (diff >= 3600) timeText = `${Math.floor(diff / 3600)}h ago`;
            else if (diff >= 60) timeText = `${Math.floor(diff / 60)}m ago`;
            const title = new Date(timeStr).toLocaleString();
            return { text: timeText, color, title };
        } catch { return { text: "ERROR", color: "text-red-500", title: '' }; }
    }, [lastCheckin, serverSkewMs]);
    const [status, setStatus] = useState(calculateTimeAgo());
    React.useEffect(() => {
        setStatus(calculateTimeAgo());
        const interval = setInterval(() => setStatus(calculateTimeAgo()), 1000);
        return () => clearInterval(interval);
    }, [calculateTimeAgo]);
    return (
        <span className={cn(status.color, "flex items-center gap-1")} title={status.title}>
            {dead && <Skull size={10} className="text-red-500 shrink-0" />}
            {status.text}
        </span>
    );
};

/* ─────────── OS Platform Icons ─────────── */
const WinIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
);
const TuxIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/>
    </svg>
);
const AppleIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
);
const ChromeIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 0C8.21 0 4.831 1.757 2.625 4.501l3.863 6.648A5.088 5.088 0 0112 6.902c.919 0 1.784.25 2.558.691l3.866-6.654A11.957 11.957 0 0012 0zm5.793 3.75l-3.866 6.654a5.09 5.09 0 011.171 5.025L19.4 21.5A11.956 11.956 0 0024 12c0-3.141-1.222-5.994-3.207-8.094zM2.207 4.5A11.992 11.992 0 000 12c0 3.31 1.341 6.31 3.507 8.5l3.83-6.63A5.09 5.09 0 016.902 12a5.088 5.088 0 012.637-4.463L5.793 3.75A12.003 12.003 0 002.207 4.5zM12 8a4 4 0 100 8 4 4 0 000-8z"/>
    </svg>
);
const AndroidIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M17.523 15.341c-.551 0-.999-.449-.999-1s.448-.999.999-.999c.551 0 .999.448.999.999s-.448 1-.999 1zm-11.046 0c-.551 0-.999-.449-.999-1s.448-.999.999-.999c.551 0 .999.448.999.999s-.448 1-.999 1zm11.405-6.02l1.997-3.459a.416.416 0 00-.152-.568.416.416 0 00-.568.152L17.137 8.9C15.59 8.244 13.853 7.851 12 7.851s-3.59.393-5.137 1.049L4.841 5.447a.416.416 0 00-.568-.152.416.416 0 00-.152.568l1.997 3.459C2.689 11.187.343 14.659 0 18.761h24c-.344-4.102-2.689-7.574-6.118-9.44z"/>
    </svg>
);
const RobotIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73A2 2 0 0112 2M9 9a1 1 0 00-1 1v1a1 1 0 001 1h6a1 1 0 001-1v-1a1 1 0 00-1-1H9m-4 5v2h14v-2H5m2 4v2h2v-2H7m6 0v2h2v-2h-2z"/>
    </svg>
);
const getPlatformIcon = (os: string, payloadType: string, size = 14, className = '') => {
    const o = (os || '').toLowerCase();
    const p = (payloadType || '').toLowerCase();
    if (o.includes('windows') || p === 'apollo') return <WinIcon size={size} className={className} />;
    if (o.includes('linux') || p === 'poseidon') return <TuxIcon size={size} className={className} />;
    if (o.includes('mac') || o.includes('darwin') || p === 'medusa') return <AppleIcon size={size} className={className} />;
    if (o.includes('android')) return <AndroidIcon size={size} className={className} />;
    if (o.includes('chrome') || o.includes('cros')) return <ChromeIcon size={size} className={className} />;
    if (p && p !== '' && p !== 'agent') return <RobotIcon size={size} className={className} />;
    return <Monitor size={size} className={className} />;
};

/* ─────────── JSON Syntax Highlight helper ─────────── */
const JsonHighlight = ({ value }: { value: string }) => {
    const html = React.useMemo(() => {
        try {
            const formatted = JSON.stringify(JSON.parse(value), null, 2);
            // Tokenize: keys → blue, string values → green, numbers → yellow, booleans → orange, null → purple
            return formatted
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/(")((?:[^"\\]|\\.)*)(")\s*:/g, '<span class="text-blue-300 font-semibold">"$2"</span>:')
                .replace(/: (")((?:[^"\\]|\\.)*)(")(,?)$/gm, (_m: string, _q1: string, s: string, _q2: string, comma: string) => `: <span class="text-emerald-300">"${s}"</span>${comma}`)
                .replace(/: (-?\d+\.?\d*)(,?)$/gm, (_m: string, n: string, c: string) => `: <span class="text-yellow-300">${n}</span>${c}`)
                .replace(/: (true|false)(,?)$/gm, (_m: string, b: string, c: string) => `: <span class="text-orange-300">${b}</span>${c}`)
                .replace(/: (null)(,?)$/gm, (_m: string, _n: string, c: string) => `: <span class="text-purple-300">null</span>${c}`);
        } catch { return ''; }
    }, [value]);
    if (!html) return null;
    return (
        <pre
            className="bg-black/60 border border-white/5 rounded p-2 text-xs font-mono overflow-auto max-h-[160px] cyber-scrollbar leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

/* ─────────── Detailed Callback Info Modal ─────────── */
const DetailedCallbackModal = ({ callbackId, onClose }: { callbackId: number; onClose: () => void }) => {
    const { data, loading, refetch: refetchDetails } = useQuery(GET_CALLBACK_FULL_DETAILS, {
        variables: { callback_id: callbackId }, fetchPolicy: 'no-cache',
    });
    const { data: xferData } = useQuery(GET_CALLBACK_COMMANDS_FOR_TRANSFER, {
        variables: { callback_id: callbackId }, fetchPolicy: 'no-cache',
    });
    const [addCmd] = useMutation(ADD_LOADED_COMMAND);
    const [removeCmd] = useMutation(REMOVE_LOADED_COMMAND);
    const [updateCallbackAllowed] = useMutation(PAYLOAD_CALLBACK_ALLOWED_MUTATION);
    const [hostFileMutation] = useMutation(HOST_FILE_MUTATION);
    const { data: egressC2Data } = useQuery(GET_RUNNING_EGRESS_C2_PROFILES, { fetchPolicy: 'network-only' });
    const [cmdOpStatus, setCmdOpStatus] = useState<Record<number, 'adding' | 'removing' | 'done' | 'err'>>({});
    const [cmdBulkProgress, setCmdBulkProgress] = useState<{ current: number; total: number; type: 'adding' | 'removing' } | null>(null);
    const [hostFileModal, setHostFileModal] = useState(false);
    const [hostFileC2Id, setHostFileC2Id] = useState<number | null>(null);
    const [hostFileUrl, setHostFileUrl] = useState('/payload');
    const [hostFileAlert, setHostFileAlert] = useState(false);
    const cb = data?.callback_by_pk;
    const allPayloadCmds: any[] = xferData?.callback_by_pk?.payload?.payloadtype?.commands || [];
    const loadedCmdIds = new Set((cb?.loadedcommands || []).map((lc: any) => lc.command?.id));

    if (loading) return (
        <CyberModal title="CALLBACK_DETAILS" onClose={onClose} icon={<Info />}>
            <div className="flex items-center justify-center h-40"><RefreshCw size={20} className="animate-spin text-signal/50" /></div>
        </CyberModal>
    );
    if (!cb) return (
        <CyberModal title="CALLBACK_DETAILS" onClose={onClose} icon={<Info />}>
            <div className="text-gray-500 text-sm text-center py-8">No callback data found</div>
        </CyberModal>
    );

    const parseIP = (ip: string) => { try { return JSON.parse(ip); } catch { return [ip]; } };

    const handleAddCommand = async (cmdId: number) => {
        setCmdOpStatus(p => ({ ...p, [cmdId]: 'adding' }));
        try {
            await addCmd({ variables: { command_id: cmdId, callback_id: callbackId } });
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            refetchDetails();
        } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
    };
    const handleRemoveCommand = async (loadedId: number, cmdId: number) => {
        setCmdOpStatus(p => ({ ...p, [cmdId]: 'removing' }));
        try {
            await removeCmd({ variables: { id: loadedId } });
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            refetchDetails();
        } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
    };

    // Bulk add/remove with progress tracking
    const handleBulkAddCommands = async (cmdIds: number[]) => {
        if (cmdIds.length === 0) return;
        setCmdBulkProgress({ current: 0, total: cmdIds.length, type: 'adding' });
        for (let i = 0; i < cmdIds.length; i++) {
            const cmdId = cmdIds[i];
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'adding' }));
            setCmdBulkProgress({ current: i + 1, total: cmdIds.length, type: 'adding' });
            try {
                await addCmd({ variables: { command_id: cmdId, callback_id: callbackId } });
                setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
        }
        await refetchDetails();
        setCmdBulkProgress(null);
    };
    const handleBulkRemoveCommands = async (cmdsToRemove: Array<{ loadedId: number; cmdId: number }>) => {
        if (cmdsToRemove.length === 0) return;
        setCmdBulkProgress({ current: 0, total: cmdsToRemove.length, type: 'removing' });
        for (let i = 0; i < cmdsToRemove.length; i++) {
            const { loadedId, cmdId } = cmdsToRemove[i];
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'removing' }));
            setCmdBulkProgress({ current: i + 1, total: cmdsToRemove.length, type: 'removing' });
            try {
                await removeCmd({ variables: { id: loadedId } });
                setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
        }
        await refetchDetails();
        setCmdBulkProgress(null);
    };

    const handleCallbackAllowedToggle = async () => {
        if (!cb?.payload?.uuid) return;
        const newVal = !(cb.payload.callback_allowed ?? true);
        try {
            await updateCallbackAllowed({ variables: { payload_uuid: cb.payload.uuid, callback_allowed: newVal } });
            snackActions.success(`Callback ${newVal ? 'allowed' : 'blocked'}`);
            refetchDetails();
        } catch (e: any) { snackActions.error('Failed: ' + e.message); }
    };

    const handleHostFile = async () => {
        if (!hostFileC2Id || !hostFileUrl.trim()) {
            snackActions.warning('Select a C2 profile and enter a URL');
            return;
        }
        const fileUuid = cb?.payload?.filemetum?.agent_file_id;
        if (!fileUuid) { snackActions.error('No payload file available'); return; }
        try {
            const result: any = await hostFileMutation({
                variables: { c2_id: hostFileC2Id, file_uuid: fileUuid, host_url: hostFileUrl, alert_on_download: hostFileAlert, remove: false }
            });
            if (result?.data?.c2HostFile?.status === 'success') {
                snackActions.success('Payload hosted through C2');
                setHostFileModal(false);
            } else {
                snackActions.error(result?.data?.c2HostFile?.error || 'Failed to host payload');
            }
        } catch (e: any) { snackActions.error('Error: ' + e.message); }
    };

    const fileId = cb.payload?.filemetum?.agent_file_id;

    return (
        <CyberModal title={`CALLBACK #${cb.display_id} — ${cb.user}@${cb.host}`} onClose={onClose} icon={<Info />}>
            <div className="max-h-[75vh] overflow-y-auto space-y-4 cyber-scrollbar pr-2 w-[580px] max-w-full">

                {/* CALLBACK INFO */}
                <DetailSection label="CALLBACK INFO" rows={[
                    ['Display ID', `#${cb.display_id}`],
                    ['Agent UUID', cb.agent_callback_id],
                    ['User', cb.user],
                    ['Host', cb.host],
                    ['Domain', cb.domain || '—'],
                    ['IP', parseIP(cb.ip).join(', ')],
                    ['External IP', cb.external_ip || '—'],
                    ['OS', cb.os],
                    ['Architecture', cb.architecture],
                    ['PID', cb.pid],
                    ['Process Name', cb.process_name || '—'],
                    ['Integrity Level', cb.integrity_level],
                    ['Groups', (cb.mythictree_groups || []).join(', ') || '—'],
                    ['Sleep Info', cb.sleep_info || '—'],
                    ['Locked', cb.locked ? 'Yes' : 'No'],
                    ['Init Callback', cb.init_callback || '—'],
                    ['Last Checkin', cb.last_checkin ? new Date(cb.last_checkin + 'Z').toLocaleString() : '—'],
                    ['CWD', cb.cwd || '—'],
                    ['Impersonation', cb.impersonation_context || '—'],
                    ['Extra Info', cb.extra_info || '—'],
                    ['Description', cb.description || '—'],
                ]} />

                {/* PAYLOAD INFO */}
                <div>
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">PAYLOAD INFO</div>
                    <div className="space-y-1">
                        {[
                            ['Payload Type', cb.payload?.payloadtype?.name || '—'],
                            ['Creator', cb.payload?.operator?.username || '—'],
                            ['Payload UUID', cb.payload?.uuid || '—'],
                            ['Filename', cb.payload?.filemetum?.filename_text || '—'],
                            ['MD5', cb.payload?.filemetum?.md5 || '—'],
                            ['SHA1', cb.payload?.filemetum?.sha1 || '—'],
                            ['Payload OS', cb.payload?.os || '—'],
                            ['Created', cb.payload?.creation_time ? new Date(cb.payload.creation_time).toLocaleString() : '—'],
                        ].map(([k, v], i) => (
                            <div key={i} className="flex gap-3 text-xs">
                                <span className="text-gray-500 font-mono min-w-[140px] shrink-0">{k}</span>
                                <span className="text-gray-300 font-mono break-all">{String(v)}</span>
                            </div>
                        ))}
                        {fileId && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                                <a href={`/api/v1.4/files/download/${fileId}`} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-signal/30 text-signal/70 hover:text-signal hover:border-signal/60 transition-colors rounded-sm">
                                    <Download size={10} /> Download Payload
                                </a>
                                <button
                                    onClick={() => setHostFileModal(true)}
                                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-blue-500/30 text-blue-400/70 hover:text-blue-400 hover:border-blue-500/60 transition-colors rounded-sm"
                                >
                                    <Server size={10} /> Host Through C2
                                </button>
                            </div>
                        )}
                        {/* Callback Allowed Toggle */}
                        {cb.payload?.uuid && (
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                                <span className="text-gray-500 font-mono text-xs min-w-[140px] shrink-0">Callback Allowed</span>
                                <button
                                    onClick={handleCallbackAllowedToggle}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border transition-colors rounded-sm',
                                        (cb.payload.callback_allowed ?? true)
                                            ? 'border-signal/40 text-signal bg-signal/10 hover:bg-signal/20'
                                            : 'border-red-500/40 text-red-400 bg-red-900/10 hover:bg-red-900/20'
                                    )}
                                >
                                    {(cb.payload.callback_allowed ?? true)
                                        ? <><ToggleRight size={12} /> ALLOWED</>
                                        : <><ToggleLeft size={12} /> BLOCKED</>
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* HOST THROUGH C2 MODAL */}
                {hostFileModal && (
                    <CyberModal title="HOST_PAYLOAD_THROUGH_C2" onClose={() => setHostFileModal(false)} icon={<Server />}>
                        <div className="space-y-4 min-w-[360px]">
                            <p className="text-xs text-gray-400 font-mono">Select a running C2 profile to host the payload through.</p>

                            {/* C2 Profile Selector */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">C2_PROFILE</label>
                                <div className="grid gap-1.5 max-h-36 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {(egressC2Data?.c2profile || []).map((c2: any) => (
                                        <button
                                            key={c2.id}
                                            onClick={() => setHostFileC2Id(c2.id)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors',
                                                hostFileC2Id === c2.id
                                                    ? 'border-signal bg-signal/10 text-signal'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            )}
                                        >
                                            <Server size={12} /> {c2.name}
                                        </button>
                                    ))}
                                    {(egressC2Data?.c2profile || []).length === 0 && (
                                        <div className="text-gray-500 text-xs font-mono p-2 text-center">NO_RUNNING_C2_PROFILES</div>
                                    )}
                                </div>
                            </div>

                            {/* Host URL */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">HOST_URL</label>
                                <input
                                    value={hostFileUrl}
                                    onChange={e => setHostFileUrl(e.target.value)}
                                    placeholder="/payload"
                                    className="w-full bg-black/50 border border-gray-700 focus:border-signal/60 px-3 py-2 text-xs font-mono text-gray-200 outline-none transition-colors"
                                />
                            </div>

                            {/* Alert on download */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-gray-500">Alert on Download</span>
                                <button
                                    onClick={() => setHostFileAlert(p => !p)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border transition-colors rounded-sm',
                                        hostFileAlert
                                            ? 'border-orange-500/40 text-orange-400 bg-orange-900/10'
                                            : 'border-gray-700 text-gray-500'
                                    )}
                                >
                                    {hostFileAlert ? <><Bell size={11} /> ON</> : <><BellOff size={11} /> OFF</>}
                                </button>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setHostFileModal(false)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                                <button
                                    onClick={handleHostFile}
                                    disabled={!hostFileC2Id || !hostFileUrl.trim()}
                                    className="px-4 py-2 border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    HOST_FILE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}

                {/* BUILD STEPS */}
                {(cb.payload?.payload_build_steps || []).length > 0 && (
                    <div>
                        <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">BUILD STEPS ({cb.payload.payload_build_steps.length})</div>
                        <div className="space-y-1">
                            {cb.payload.payload_build_steps.map((s: any) => (
                                <div key={s.id} className="flex items-start gap-2 text-xs font-mono">
                                    <span className={cn('shrink-0 mt-0.5', s.step_skip ? 'text-gray-600' : s.step_success ? 'text-green-400' : 'text-red-400')}>
                                        {s.step_skip ? '⊘' : s.step_success ? '✓' : '✗'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-gray-300">{s.step_name}</span>
                                        {s.step_description && <span className="text-gray-600 ml-2 text-[10px]">{s.step_description}</span>}
                                        {!s.step_success && !s.step_skip && s.step_stderr && (
                                            <pre className="text-red-400/80 text-[10px] mt-0.5 whitespace-pre-wrap break-all">{s.step_stderr}</pre>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* PORT FORWARDERS */}
                {(cb.callbackports || []).length > 0 && (
                    <DetailSection label={`PORT_FORWARDERS (${cb.callbackports.length})`}
                        rows={cb.callbackports.map((p: any) => [
                            `${p.port_type || 'port'} :${p.local_port}`,
                            p.remote_ip ? `→ ${p.remote_ip}:${p.remote_port || '?'}` : '(local only)'
                        ])} />
                )}

                {/* C2 PROFILE PARAMETERS */}
                {(cb.c2profileparametersinstances || []).length > 0 && (() => {
                    const byProfile: Record<string, any[]> = {};
                    cb.c2profileparametersinstances.forEach((pi: any) => {
                        const name = pi.c2profile?.name || '?';
                        if (!byProfile[name]) byProfile[name] = [];
                        byProfile[name].push(pi);
                    });
                    return Object.entries(byProfile).map(([profileName, params]) => (
                        <div key={profileName}>
                            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">C2 PARAMS — {profileName}</div>
                            <div className="space-y-1">
                                {params.map((pi: any, i: number) => (
                                    <div key={i} className="text-xs font-mono">
                                        <div className="flex gap-3">
                                            <span className="text-gray-500 min-w-[140px] shrink-0">{pi.c2profileparameter?.description || '?'}</span>
                                            <span className="text-gray-300 break-all">{pi.value || '—'}</span>
                                        </div>
                                        {(pi.enc_key_base64 || pi.dec_key_base64) && (
                                            <div className="ml-[152px] mt-0.5 space-y-0.5">
                                                {pi.enc_key_base64 && <div className="text-[10px] text-yellow-600/80">enc: {pi.enc_key_base64}</div>}
                                                {pi.dec_key_base64 && <div className="text-[10px] text-cyan-600/80">dec: {pi.dec_key_base64}</div>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ));
                })()}

                {/* BUILD PARAMETERS */}
                {(cb.payload?.buildparameterinstances || []).length > 0 && (
                    <DetailSection label="BUILD PARAMETERS"
                        rows={cb.payload.buildparameterinstances.map((bp: any) => [
                            bp.buildparameter?.description || '?',
                            bp.value || '—'
                        ])} />
                )}

                {/* LOADED COMMANDS */}
                <div>
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2 flex items-center gap-2">
                        LOADED COMMANDS ({(cb.loadedcommands || []).length})
                        {(cb.loadedcommands || []).length > 0 && (
                            <button
                                onClick={() => handleBulkRemoveCommands((cb.loadedcommands || []).map((lc: any) => ({ loadedId: lc.id, cmdId: lc.command?.id })))}
                                disabled={!!cmdBulkProgress}
                                className="ml-auto flex items-center gap-1 px-1.5 py-0.5 border border-red-500/20 text-red-500/60 hover:text-red-400 hover:border-red-500/40 transition-colors text-[9px] disabled:opacity-30"
                            >
                                <Minus size={8} /> REMOVE ALL
                            </button>
                        )}
                    </div>

                    {/* Bulk progress bar */}
                    {cmdBulkProgress && (
                        <div className="mb-2">
                            <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 mb-1">
                                <span>{cmdBulkProgress.type === 'adding' ? 'ADDING' : 'REMOVING'} COMMANDS...</span>
                                <span>{cmdBulkProgress.current}/{cmdBulkProgress.total}</span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded overflow-hidden">
                                <div
                                    className={cn('h-full transition-all duration-200', cmdBulkProgress.type === 'adding' ? 'bg-signal' : 'bg-red-500')}
                                    style={{ width: `${(cmdBulkProgress.current / cmdBulkProgress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        {(cb.loadedcommands || []).map((lc: any) => {
                            const st = cmdOpStatus[lc.command?.id];
                            return (
                                <div key={lc.id} className="flex items-center gap-3 text-xs font-mono">
                                    <span className="text-gray-300 flex-1">{lc.command?.cmd || '?'}</span>
                                    <span className="text-gray-600 text-[10px]">
                                        m:v{lc.command?.version || '?'} / l:v{lc.version || '?'}
                                    </span>
                                    {lc.command?.cmd && cb.payload?.payloadtype?.name && (
                                        <a href={`/docs/agents/${cb.payload.payloadtype.name}/commands/${lc.command.cmd}`} target="_blank" rel="noreferrer"
                                            className="flex items-center gap-1 px-1.5 py-0.5 border border-blue-500/30 text-blue-400 hover:bg-blue-900/20 transition-colors text-[10px]">
                                            <FileText size={8} /> DOCS
                                        </a>
                                    )}
                                    <button onClick={() => handleRemoveCommand(lc.id, lc.command?.id)}
                                        disabled={!!st && st !== 'done' && st !== 'err'}
                                        className="flex items-center gap-1 px-1.5 py-0.5 border border-red-500/30 text-red-400 hover:bg-red-900/20 transition-colors text-[10px] disabled:opacity-40">
                                        {st === 'removing' ? <RefreshCw size={8} className="animate-spin" /> : <Minus size={8} />} REMOVE
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    {/* Add commands from payload type */}
                    {allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).length > 0 && (
                        <details className="mt-3">
                            <summary className="cursor-pointer text-[10px] font-mono text-gray-600 hover:text-gray-400 transition-colors select-none uppercase tracking-widest flex items-center justify-between">
                                <span>+ Add Commands ({allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).length} available)</span>
                                <button
                                    onClick={(e) => { e.preventDefault(); handleBulkAddCommands(allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).map((c: any) => c.id)); }}
                                    disabled={!!cmdBulkProgress}
                                    className="flex items-center gap-1 px-1.5 py-0.5 border border-signal/20 text-signal/60 hover:text-signal hover:border-signal/40 transition-colors text-[9px] disabled:opacity-30"
                                >
                                    <Plus size={8} /> ADD ALL
                                </button>
                            </summary>
                            <div className="mt-2 space-y-1 border border-white/5 rounded p-2 max-h-48 overflow-y-auto cyber-scrollbar">
                                {allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).map((cmd: any) => {
                                    const st = cmdOpStatus[cmd.id];
                                    return (
                                        <div key={cmd.id} className="flex items-center gap-3 text-xs font-mono">
                                            <span className="text-gray-400 flex-1">{cmd.cmd}</span>
                                            <button onClick={() => handleAddCommand(cmd.id)}
                                                disabled={!!st && st !== 'done' && st !== 'err'}
                                                className="flex items-center gap-1 px-1.5 py-0.5 border border-signal/30 text-signal/70 hover:bg-signal/10 transition-colors text-[10px] disabled:opacity-40">
                                                {st === 'adding' ? <RefreshCw size={8} className="animate-spin" /> : <Plus size={8} />} ADD
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                    )}
                </div>
            </div>
        </CyberModal>
    );
};

/* Helper: simple key-value section */
const DetailSection = ({ label, rows }: { label: string; rows: [string, any][] }) => (
    <div>
        <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">{label}</div>
        <div className="space-y-1">
            {rows.map(([k, v], i) => (
                <div key={i} className="flex gap-3 text-xs">
                    <span className="text-gray-500 font-mono min-w-[140px] shrink-0">{k}</span>
                    <span className="text-gray-300 font-mono break-all">{String(v)}</span>
                </div>
            ))}
        </div>
    </div>
);

/* ─────────── Color Picker Modal ─────────── */
const COLOR_PRESETS = [
    '', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff',
];

const CallbackColorPickerModal = ({ callback, onClose, onSave }: {
    callback: any; onClose: () => void; onSave: (color: string) => void;
}) => {
    const [selectedColor, setSelectedColor] = useState(callback.color || '');
    const [customColor, setCustomColor] = useState(callback.color || '');
    return (
        <CyberModal title="SET_CALLBACK_COLOR" onClose={onClose} icon={<Palette />}>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-2 uppercase tracking-wider">Preset Colors</label>
                    <div className="flex flex-wrap gap-2">
                        {COLOR_PRESETS.map(c => (
                            <button key={c || 'none'} onClick={() => { setSelectedColor(c); setCustomColor(c); }}
                                className={cn('w-8 h-8 rounded border-2 transition-all',
                                    selectedColor === c ? 'border-signal scale-110' : 'border-white/20 hover:border-white/50')}
                                style={{ backgroundColor: c || 'transparent' }}
                                title={c || 'None (default)'}>
                                {!c && <X size={14} className="text-gray-500 m-auto" />}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Custom Color</label>
                    <div className="flex gap-2 items-center">
                        <input type="color" value={customColor || '#00ff41'}
                            onChange={e => { setCustomColor(e.target.value); setSelectedColor(e.target.value); }}
                            className="w-10 h-10 rounded cursor-pointer border border-white/20 bg-transparent" />
                        <input type="text" value={customColor} onChange={e => { setCustomColor(e.target.value); setSelectedColor(e.target.value); }}
                            className="flex-1 bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                            placeholder="#rrggbb" />
                        {selectedColor && (
                            <div className="w-10 h-10 rounded border border-white/20" style={{ backgroundColor: selectedColor }} />
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={() => onSave(selectedColor)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── IP Multi-selector Inner Dialog ─────────── */
const IPSelectorModal = ({ callback, onClose, onSave }: {
    callback: any; onClose: () => void; onSave: (ips: string[]) => void;
}) => {
    const parseIPs = (ip: string): string[] => {
        try { const r = JSON.parse(ip); return Array.isArray(r) ? r : [r]; } catch { return ip ? [ip] : []; }
    };
    const allIPs = parseIPs(callback.ip);
    const [primaryIdx, setPrimaryIdx] = useState(0);
    if (allIPs.length <= 1) {
        setTimeout(onClose, 0);
        return null;
    }
    const reordered = [allIPs[primaryIdx], ...allIPs.filter((_, i) => i !== primaryIdx)];
    return (
        <CyberModal title="SELECT_PRIMARY_IP" onClose={onClose} icon={<Globe />}>
            <div className="space-y-3">
                <p className="text-xs text-gray-500 font-mono">Select which IP to display as primary for Callback #{callback.display_id}</p>
                <div className="space-y-1">
                    {allIPs.map((ip, i) => (
                        <button key={i} onClick={() => setPrimaryIdx(i)}
                            className={cn('w-full flex items-center gap-3 px-3 py-2 border rounded font-mono text-sm transition-colors text-left',
                                primaryIdx === i ? 'border-signal/50 bg-signal/10 text-signal' : 'border-white/10 text-gray-300 hover:border-signal/30 hover:bg-white/5')}>
                            {primaryIdx === i ? <CheckCircle size={14} className="text-signal shrink-0" /> : <Globe size={14} className="text-gray-500 shrink-0" />}
                            {ip}
                            {i === 0 && <span className="ml-auto text-[10px] text-gray-500 font-mono">current primary</span>}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={() => onSave(reordered)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Modify MythicTree Groups Modal ─────────── */
const ModifyGroupsModal = ({ callback, allCallbacks, onClose, onSave }: {
    callback: any; allCallbacks?: any[]; onClose: () => void; onSave: (groups: string[]) => void;
}) => {
    const [groups, setGroups] = useState<string[]>((callback.mythictree_groups || []).filter(Boolean));
    const [newGroup, setNewGroup] = useState('');
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [showAllGroups, setShowAllGroups] = useState(false);

    const addGroup = () => {
        const g = newGroup.trim();
        if (g && !groups.includes(g)) { setGroups(prev => [...prev, g]); }
        setNewGroup('');
    };
    const removeGroup = (g: string) => setGroups(prev => prev.filter(x => x !== g));

    const applyBulk = () => {
        const newGroups = bulkText.split(/[\n,]+/).map(g => g.trim()).filter(Boolean);
        setGroups(prev => {
            const merged = [...prev];
            newGroups.forEach(g => { if (!merged.includes(g)) merged.push(g); });
            return merged;
        });
        setBulkText('');
        setBulkMode(false);
    };

    // Collect all unique groups from all callbacks for the VIEW ALL section
    const allGroups = useMemo(() => {
        if (!allCallbacks) return [];
        const s = new Set<string>();
        allCallbacks.forEach((cb: any) => (cb.mythictree_groups || []).forEach((g: string) => { if (g) s.add(g); }));
        return [...s].sort();
    }, [allCallbacks]);

    return (
        <CyberModal title="MODIFY_CALLBACK_GROUPS" onClose={onClose} icon={<Layers />}>
            <div className="space-y-4 min-w-[360px] max-w-[480px]">
                <p className="text-xs text-gray-500 font-mono">Modify MythicTree groups for Callback #{callback.display_id} ({callback.user}@{callback.host})</p>

                {/* Input mode toggle */}
                <div className="flex gap-2">
                    <button onClick={() => setBulkMode(false)}
                        className={cn('px-2 py-0.5 text-[10px] font-mono border transition-colors', !bulkMode ? 'border-signal/50 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:border-signal/30')}>
                        SINGLE
                    </button>
                    <button onClick={() => setBulkMode(true)}
                        className={cn('px-2 py-0.5 text-[10px] font-mono border transition-colors', bulkMode ? 'border-signal/50 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:border-signal/30')}>
                        BULK INPUT
                    </button>
                </div>

                {!bulkMode ? (
                    <div className="flex gap-2">
                        <input type="text" value={newGroup} onChange={e => setNewGroup(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addGroup()}
                            className="flex-1 bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                            placeholder="Add group name..." autoFocus />
                        <button onClick={addGroup} disabled={!newGroup.trim()}
                            className="px-3 py-2 bg-signal/20 border border-signal/40 text-signal hover:bg-signal/30 transition-colors disabled:opacity-30">
                            <Plus size={14} />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <textarea
                            value={bulkText}
                            onChange={e => setBulkText(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-y min-h-[80px]"
                            placeholder="One group name per line (or comma-separated)&#10;e.g.&#10;web-servers&#10;internal&#10;domain-joined"
                            autoFocus
                        />
                        <button onClick={applyBulk} disabled={!bulkText.trim()}
                            className="w-full py-1.5 bg-signal/20 border border-signal/40 text-signal hover:bg-signal/30 transition-colors disabled:opacity-30 text-xs font-mono">
                            APPLY BULK GROUPS
                        </button>
                    </div>
                )}

                {/* Current groups */}
                <div className="min-h-[60px] flex flex-wrap gap-2">
                    {groups.length === 0 && <span className="text-gray-600 font-mono text-xs italic">No groups assigned — callback will be hidden from File/Process Browser</span>}
                    {groups.map(g => (
                        <span key={g} className="flex items-center gap-1 px-2 py-1 bg-signal/10 border border-signal/30 text-signal text-xs font-mono rounded">
                            {g}
                            <button onClick={() => removeGroup(g)} className="ml-1 text-signal/60 hover:text-red-400 transition-colors"><X size={10} /></button>
                        </span>
                    ))}
                </div>

                {/* View All Groups (across all callbacks) */}
                {allGroups.length > 0 && (
                    <div className="border border-white/10 rounded overflow-hidden">
                        <button
                            onClick={() => setShowAllGroups(p => !p)}
                            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                        >
                            <span className="flex items-center gap-1.5"><Layers size={10} /> VIEW ALL GROUPS ({allGroups.length} in use across all callbacks)</span>
                            <ChevronDown size={10} className={cn('transition-transform duration-200', showAllGroups && 'rotate-180')} />
                        </button>
                        {showAllGroups && (
                            <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-t border-white/5 pt-2 bg-black/20">
                                {allGroups.map(g => (
                                    <button key={g}
                                        onClick={() => { if (!groups.includes(g)) setGroups(prev => [...prev, g]); }}
                                        title={groups.includes(g) ? 'Already assigned' : 'Click to add to this callback'}
                                        className={cn(
                                            'flex items-center gap-1 px-2 py-0.5 border text-[10px] font-mono rounded transition-colors',
                                            groups.includes(g)
                                                ? 'border-signal/20 text-signal/40 bg-signal/5 cursor-default'
                                                : 'border-white/10 text-gray-400 hover:border-signal/40 hover:text-signal hover:bg-signal/5 cursor-pointer'
                                        )}>
                                        {groups.includes(g) ? <CheckCircle size={8} className="text-signal/40" /> : <Plus size={8} />}
                                        {g}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={() => onSave(groups)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── C2 Path Dialog ─────────── */
// Custom node type for C2 graph: Agent node
const C2AgentNode = ({ data }: any) => {
    const labelFields: string[] = data.labelFields || ['displayId', 'user', 'host'];
    const showField = (f: string) => labelFields.includes(f);
    return (
        <div className={cn(
            'flex flex-col items-center gap-1 px-3 py-2 border rounded font-mono text-xs min-w-[80px] transition-all',
            data._selected ? 'ring-1 ring-signal/80 brightness-110 ' : '',
            data._dimmed ? 'opacity-20 grayscale ' : '',
            data.isMythic
                ? 'border-signal/60 bg-signal/10 text-signal'
                : data.active
                    ? 'border-white/30 bg-black/60 text-white'
                    : 'border-red-500/30 bg-red-900/10 text-red-400'
        )}>
            <Handle type="target" position={Position.Left} isConnectable={false} />
            {data.isMythic ? (
                <span className="text-[10px] font-bold tracking-widest text-signal">MYTHIC</span>
            ) : (
                <>
                    <img
                        src={`/static/${data.payloadType}_dark.svg`}
                        alt={data.payloadType}
                        className="w-6 h-6 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {showField('displayId') && <span className="text-[10px] font-bold">#{data.displayId}</span>}
                    {showField('user') && data.user && <span className="text-[9px] text-gray-400 truncate max-w-[100px]">{data.user}</span>}
                    {showField('host') && data.host && <span className="text-[9px] text-gray-300 truncate max-w-[100px]">{data.host}</span>}
                    {showField('ip') && data.ip && <span className="text-[9px] text-blue-400/70 truncate max-w-[100px]">{data.ip}</span>}
                    {showField('type') && <span className="text-[9px] text-purple-400/70">{data.payloadType}</span>}
                    <span className={cn('text-[8px] mt-0.5', data.active ? 'text-signal' : 'text-red-400')}>
                        {data.active ? '● ACTIVE' : '○ INACTIVE'}
                    </span>
                </>
            )}
            <Handle type="source" position={Position.Right} isConnectable={false} />
        </div>
    );
};

// Custom edge for C2 graph
const C2PathEdge = ({ id, sourceX, sourceY, targetX, targetY, style, data, label }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const isP2P = data?.isP2P;
    const isActive = data?.active !== false;
    return (
        <>
            <BaseEdge id={id} path={edgePath} style={{
                ...style,
                stroke: isActive ? (isP2P ? '#a78bfa' : '#22c55e') : '#ef4444',
                strokeWidth: 1.5,
                strokeDasharray: isActive ? undefined : '6 3',
            }} />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'none',
                        }}
                        className={cn(
                            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border whitespace-nowrap',
                            isActive
                                ? isP2P ? 'bg-black/90 border-purple-500/40 text-purple-300' : 'bg-black/90 border-signal/30 text-signal'
                                : 'bg-black/90 border-red-500/30 text-red-400'
                        )}
                    >
                        {String(label)}
                        <span className="text-[8px] opacity-60">{isP2P ? ' P2P' : ''}</span>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

const c2PathNodeTypes = { agentNode: C2AgentNode };
const c2PathEdgeTypes = { c2path: C2PathEdge };

// Inner graph component (needs to be inside ReactFlowProvider)
const C2PathGraphInner = ({
    edges, onNodeCtxMenu, labelFields = ['displayId', 'user', 'host'], groupBy = 'None', onHideNodeIds,
}: {
    edges: any[];
    onNodeCtxMenu?: (event: React.MouseEvent, nodeId: string, nodeData: any) => void;
    labelFields?: string[];
    groupBy?: string;
    onHideNodeIds?: (ids: string[]) => void;
}) => {
    const { fitView } = useReactFlow();
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const [c2LayoutDir, setC2LayoutDir] = useState<'LR' | 'TB'>('LR');
    const [c2SelectedIds, setC2SelectedIds] = useState<Set<string>>(new Set());
    const [c2EdgeCtxMenu, setC2EdgeCtxMenu] = useState<{ x: number; y: number; edge: any } | null>(null);
    const [c2PaneCtxMenu, setC2PaneCtxMenu] = useState<{ x: number; y: number } | null>(null);

    // Build raw nodes and edges (unpositioned)
    const { rawNodes, rawEdges } = useMemo(() => {
        const nodeMap = new Map<string, any>();
        nodeMap.set('Mythic', {
            id: 'Mythic', type: 'agentNode', position: { x: 0, y: 0 },
            data: { isMythic: true, active: true, label: 'Mythic', labelFields },
        });
        edges.forEach((edge: any) => {
            [edge.source, edge.destination].forEach((node: any) => {
                if (!node) return;
                const nodeId = String(node.id);
                if (!nodeMap.has(nodeId)) {
                    nodeMap.set(nodeId, {
                        id: nodeId, type: 'agentNode', position: { x: 0, y: 0 },
                        data: {
                            isMythic: false, active: node.active, displayId: node.display_id,
                            user: node.user || '', host: node.host || '', ip: node.ip || '',
                            payloadType: node.payload?.payloadtype?.name || 'agent',
                            label: `#${node.display_id}`,
                            labelFields,
                        },
                    });
                }
            });
        });
        const rawEdgesArr: any[] = edges.map((edge: any) => {
            const isP2P = edge.c2profile?.is_p2p;
            const isActive = !edge.end_timestamp;
            return {
                id: `edge-${edge.id}`,
                source: !isP2P ? String(edge.source?.id) : String(edge.source?.id),
                target: !isP2P ? 'Mythic' : String(edge.destination?.id),
                type: 'c2path', label: edge.c2profile?.name || (isP2P ? 'P2P' : ''),
                animated: isActive, data: { isP2P, active: isActive, edgeId: edge.id,
                    sourceId: String(edge.source?.id), destId: String(edge.destination?.id ?? 'Mythic') },
            };
        });
        return { rawNodes: Array.from(nodeMap.values()), rawEdges: rawEdgesArr };
    }, [edges, labelFields]);

    // ELK-layouted state
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [flowEdgeState, setFlowEdgeState, onEdgesChange] = useEdgesState(rawEdges);

    useEffect(() => {
        setFlowEdgeState(rawEdges);
    }, [rawEdges]);

    // Run ELK layout when raw nodes or layout direction change
    useEffect(() => {
        if (rawNodes.length === 0) return;
        let cancelled = false;
        const elkNodes = rawNodes.map(n => ({
            id: n.id,
            width: n.id === 'Mythic' ? 90 : 160,
            height: n.id === 'Mythic' ? 50 : 80,
        }));
        const nodeIdSet = new Set(rawNodes.map(n => n.id));
        const elkEdges = rawEdges
            .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
            .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }));
        _c2Elk.layout({
            id: 'c2-root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': c2LayoutDir === 'LR' ? 'RIGHT' : 'DOWN',
                'elk.layered.spacing.nodeNodeBetweenLayers': '100',
                'elk.spacing.nodeNode': '40',
            },
            children: elkNodes,
            edges: elkEdges,
        }).then((result: any) => {
            if (cancelled) return;
            const posMap = new Map<string, { x: number; y: number }>();
            (result.children || []).forEach((n: any) => { posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }); });
            setNodes(rawNodes.map(n => ({ ...n, position: posMap.get(n.id) ?? n.position })));
            setTimeout(() => fitView({ padding: 0.3 }), 80);
        }).catch(() => {
            if (!cancelled) { setNodes(rawNodes); setTimeout(() => fitView({ padding: 0.3 }), 80); }
        });
        return () => { cancelled = true; };
    }, [rawNodes, c2LayoutDir]);

    // Apply selection visual feedback + groupBy overlays
    const displayNodes = useMemo(() => {
        const withSel = nodes.map((n: any) => ({
            ...n,
            data: {
                ...n.data,
                _selected: c2SelectedIds.has(n.id),
                _dimmed: c2SelectedIds.size > 0 && !c2SelectedIds.has(n.id),
            },
        }));
        if (groupBy === 'None') return withSel.filter((n: any) => n.type !== 'c2group');
        const PAD = 24, NODE_W = 160, NODE_H = 80;
        const bounds = new Map<string, { mnX: number; mnY: number; mxX: number; mxY: number }>();
        withSel.forEach((n: any) => {
            if (n.type === 'c2group') return;
            const val = String((n.data as any)[groupBy] ?? '(none)');
            const b = bounds.get(val) ?? { mnX: Infinity, mnY: Infinity, mxX: -Infinity, mxY: -Infinity };
            b.mnX = Math.min(b.mnX, n.position.x);
            b.mnY = Math.min(b.mnY, n.position.y);
            b.mxX = Math.max(b.mxX, n.position.x + NODE_W);
            b.mxY = Math.max(b.mxY, n.position.y + NODE_H);
            bounds.set(val, b);
        });
        const groupNodes: any[] = [];
        bounds.forEach((b, gv) => {
            if (b.mnX === Infinity) return;
            groupNodes.push({
                id: `c2group-${gv}`, type: 'c2group',
                position: { x: b.mnX - PAD, y: b.mnY - PAD },
                style: { width: b.mxX - b.mnX + PAD * 2, height: b.mxY - b.mnY + PAD * 2, zIndex: -10, pointerEvents: 'none',
                    border: '1px dashed #22c55e33', borderRadius: 4, backgroundColor: '#22c55e05' },
                data: { label: gv },
                selectable: false, draggable: false,
            });
        });
        return [...groupNodes, ...withSel.filter((n: any) => n.type !== 'c2group')];
    }, [nodes, c2SelectedIds, groupBy]);

    const handleExportSVG = useCallback(async () => {
        const el = containerRef.current;
        if (!el) return;
        try {
            const dataUrl = await toSvg(el, { backgroundColor: '#050505' });
            const a = document.createElement('a'); a.download = 'c2_graph.svg'; a.href = dataUrl; a.click();
        } catch {}
    }, []);

    const handleExportPNG = useCallback(async () => {
        const el = containerRef.current;
        if (!el) return;
        try {
            const dataUrl = await toPng(el, { backgroundColor: '#050505', pixelRatio: 2 });
            const a = document.createElement('a'); a.download = 'c2_graph.png'; a.href = dataUrl; a.click();
        } catch {}
    }, []);

    const onC2NodeClick = useCallback((event: React.MouseEvent, node: any) => {
        if (node.type === 'c2group') return;
        if (event.shiftKey) {
            setC2SelectedIds(prev => {
                const s = new Set(prev);
                s.has(node.id) ? s.delete(node.id) : s.add(node.id);
                return s;
            });
        } else {
            setC2SelectedIds(prev => prev.size === 1 && prev.has(node.id) ? new Set() : new Set([node.id]));
        }
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <ReactFlow
            nodes={displayNodes}
            edges={flowEdgeState}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={c2PathNodeTypes}
            edgeTypes={c2PathEdgeTypes}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="bg-transparent"
            minZoom={0.2}
            maxZoom={3}
            defaultEdgeOptions={{ type: 'c2path' }}
            panOnScroll={true}
            onNodeClick={onC2NodeClick}
            onEdgeContextMenu={(event, edge) => {
                event.preventDefault();
                setC2EdgeCtxMenu({ x: event.clientX, y: event.clientY, edge });
                setC2PaneCtxMenu(null);
            }}
            onPaneContextMenu={(event: any) => {
                event.preventDefault();
                setC2PaneCtxMenu({ x: event.clientX, y: event.clientY });
                setC2EdgeCtxMenu(null);
            }}
            onPaneClick={() => {
                setC2SelectedIds(new Set());
                setC2EdgeCtxMenu(null);
                setC2PaneCtxMenu(null);
            }}
            onNodeContextMenu={(event, node) => {
                event.preventDefault();
                setC2EdgeCtxMenu(null);
                setC2PaneCtxMenu(null);
                onNodeCtxMenu?.(event as unknown as React.MouseEvent, node.id, node.data);
            }}
        >
            <Background color="#333" gap={20} className="opacity-20" />
        </ReactFlow>

        {/* Floating C2 toolbar — layout toggle + export */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 pointer-events-auto">
            <button
                onClick={() => setC2LayoutDir(d => d === 'LR' ? 'TB' : 'LR')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/90 border border-signal/30 text-signal text-[10px] font-mono hover:bg-signal/10 rounded transition-colors"
                title={c2LayoutDir === 'LR' ? 'Switch to Top-Bottom' : 'Switch to Left-Right'}>
                {c2LayoutDir === 'LR'
                    ? <><ArrowUpDown size={10} /> TB</>
                    : <><ArrowLeftRight size={10} /> LR</>}
            </button>
            <button onClick={handleExportSVG}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/90 border border-signal/30 text-signal text-[10px] font-mono hover:bg-signal/10 rounded transition-colors"
                title="Export SVG">
                <FileImage size={10} /> SVG
            </button>
            <button onClick={handleExportPNG}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/90 border border-signal/30 text-signal text-[10px] font-mono hover:bg-signal/10 rounded transition-colors"
                title="Export PNG">
                <Camera size={10} /> PNG
            </button>
        </div>

        {/* Edge context menu */}
        {c2EdgeCtxMenu && createPortal(
            <div
                style={{ position: 'fixed', top: c2EdgeCtxMenu.y, left: c2EdgeCtxMenu.x, zIndex: 9999 }}
                className="bg-[#0a0a0a] border border-signal/30 rounded shadow-lg py-1 min-w-[150px]"
            >
                {c2EdgeCtxMenu.edge?.label && (
                    <div className="px-3 py-1 text-[10px] font-mono text-signal/50 border-b border-signal/10 mb-0.5">
                        {String(c2EdgeCtxMenu.edge.label)}{c2EdgeCtxMenu.edge.data?.isP2P ? ' (P2P)' : ''}
                    </div>
                )}
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-signal flex items-center gap-2"
                    onClick={() => {
                        const e = c2EdgeCtxMenu.edge;
                        if (e?.data?.sourceId && onHideNodeIds) onHideNodeIds([e.data.sourceId, e.data.destId].filter(Boolean));
                        setC2EdgeCtxMenu(null);
                    }}>
                    <EyeOff size={11} /> Hide Edge Nodes
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-gray-400 flex items-center gap-2"
                    onClick={() => setC2EdgeCtxMenu(null)}>
                    <X size={11} /> Cancel
                </button>
            </div>,
            document.body
        )}

        {/* Pane context menu */}
        {c2PaneCtxMenu && createPortal(
            <div
                style={{ position: 'fixed', top: c2PaneCtxMenu.y, left: c2PaneCtxMenu.x, zIndex: 9999 }}
                className="bg-[#0a0a0a] border border-signal/30 rounded shadow-lg py-1 min-w-[150px]"
            >
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-signal flex items-center gap-2"
                    onClick={() => { setC2SelectedIds(new Set()); setC2PaneCtxMenu(null); }}>
                    <CheckSquare size={11} /> Unselect All
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-signal/10 hover:text-gray-400 flex items-center gap-2"
                    onClick={() => setC2PaneCtxMenu(null)}>
                    <X size={11} /> Cancel
                </button>
            </div>,
            document.body
        )}
        </div>
    );
};

const C2PathDialog = ({ callbackId, displayId, onClose }: { callbackId: number; displayId: number; onClose: () => void }) => {
    const { data, loading } = useQuery(GET_CALLBACK_C2_PATHS, {
        variables: { callback_id: callbackId }, fetchPolicy: 'no-cache',
    });
    const { data: p2pData } = useQuery(GET_P2P_PROFILES_AND_CALLBACKS);
    const [getLinkCmds, { data: linkCmdsData }] = useLazyQuery(GET_LINK_COMMANDS_FOR_CALLBACK);
    const [removeEdge] = useMutation(REMOVE_EDGE_MUTATION);
    const [addEdge] = useMutation(ADD_EDGE_MUTATION);
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const navigate = useNavigate();
    const edges = data?.callbackgraphedge || [];
    const [showList, setShowList] = useState(false);
    const [c2CtxMenu, setC2CtxMenu] = useState<{ x: number; y: number; nodeId: string; displayId?: number; isMythic?: boolean } | null>(null);
    const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
    const [c2LabelFields, setC2LabelFields] = useState<string[]>(['displayId', 'host', 'user']);
    const [c2GroupBy, setC2GroupBy] = useState<string>('None');

    // Edge operation modals
    const [removeEdgeModal, setRemoveEdgeModal] = useState<any[] | null>(null);
    const [addEdgeSourceCb, setAddEdgeSourceCb] = useState<any>(null);
    const [addEdgeSelectedProfile, setAddEdgeSelectedProfile] = useState<any>(null);
    const [addEdgeSelectedDest, setAddEdgeSelectedDest] = useState<any>(null);
    const [addEdgeDestOptions, setAddEdgeDestOptions] = useState<any[]>([]);
    const [taskForEdgeModal, setTaskForEdgeModal] = useState<any>(null);
    const [taskForEdgeCommand, setTaskForEdgeCommand] = useState<string>('');
    const [taskForEdgeParams, setTaskForEdgeParams] = useState<string>('');

    // Filter edges by hidden node IDs
    const filteredEdges = useMemo(() =>
        edges.filter((e: any) =>
            !hiddenNodeIds.has(String(e.source?.id)) &&
            !hiddenNodeIds.has(String(e.destination?.id))
        ),
    [edges, hiddenNodeIds]);

    // Find node data from edges
    const allNodes = useMemo(() => {
        const nodes: Record<string, any> = {};
        edges.forEach((e: any) => {
            if (e.source?.id) nodes[String(e.source.id)] = e.source;
            if (e.destination?.id) nodes[String(e.destination.id)] = e.destination;
        });
        return nodes;
    }, [edges]);

    const handleNodeCtxMenu = useCallback((event: React.MouseEvent, nodeId: string, nodeData: any) => {
        event.preventDefault();
        setC2CtxMenu({ x: event.clientX, y: event.clientY, nodeId, displayId: nodeData?.displayId, isMythic: nodeData?.isMythic });
    }, []);

    const handleHideNodeIds = useCallback((ids: string[]) => {
        setHiddenNodeIds(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s; });
    }, []);

    const handleOpenRemoveEdgeModal = useCallback(() => {
        const activeEdges = edges.filter((e: any) => !e.end_timestamp);
        setRemoveEdgeModal(activeEdges);
    }, [edges]);

    const handleOpenAddEdgeModal = useCallback(() => {
        const cb = c2CtxMenu ? allNodes[c2CtxMenu.nodeId] : null;
        if (cb) {
            setAddEdgeSourceCb(cb);
            setAddEdgeSelectedProfile(null);
            setAddEdgeSelectedDest(null);
            setAddEdgeDestOptions([]);
        }
    }, [c2CtxMenu, allNodes]);

    const handleManuallyAddEdge = useCallback(async () => {
        if (!addEdgeSourceCb || !addEdgeSelectedProfile || !addEdgeSelectedDest) return;
        try {
            await addEdge({
                variables: {
                    source_id: addEdgeSourceCb.id,
                    destination_id: addEdgeSelectedDest.id,
                    c2profile: addEdgeSelectedProfile.name,
                },
            });
            snackActions.success('P2P edge added');
            setAddEdgeSourceCb(null);
            setAddEdgeSelectedProfile(null);
            setAddEdgeSelectedDest(null);
            setAddEdgeDestOptions([]);
        } catch (err: any) {
            snackActions.error('Failed: ' + err.message);
        }
    }, [addEdgeSourceCb, addEdgeSelectedProfile, addEdgeSelectedDest, addEdge]);

    const handleTaskForEdge = useCallback(async () => {
        if (!taskForEdgeModal || !taskForEdgeCommand) return;
        try {
            await createTask({
                variables: {
                    callback_id: taskForEdgeModal.id,
                    command: taskForEdgeCommand,
                    params: taskForEdgeParams,
                },
            });
            snackActions.success('Task created');
            setTaskForEdgeModal(null);
            setTaskForEdgeCommand('');
            setTaskForEdgeParams('');
        } catch (err: any) {
            snackActions.error('Failed: ' + err.message);
        }
    }, [taskForEdgeModal, taskForEdgeCommand, taskForEdgeParams, createTask]);

    const allLabelFields = ['displayId', 'host', 'user', 'ip', 'type'];
    const toggleLabel = (f: string) => setC2LabelFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

    return (
        <CyberModal title={`C2_PATH — CALLBACK #${displayId}`} onClose={onClose} icon={<GitBranch />}>
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <RefreshCw size={20} className="animate-spin text-signal/50" />
                </div>
            ) : edges.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-8 font-mono">No active C2 edges found</div>
            ) : (
                <div className="flex flex-col gap-3">
                    {/* Controls row */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* View toggle */}
                        <div className="flex items-center gap-1 text-xs font-mono">
                            <button
                                onClick={() => setShowList(false)}
                                className={cn('px-3 py-1 border transition-colors', !showList ? 'border-signal text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-gray-300')}
                            >
                                GRAPH
                            </button>
                            <button
                                onClick={() => setShowList(true)}
                                className={cn('px-3 py-1 border transition-colors', showList ? 'border-signal text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-gray-300')}
                            >
                                LIST
                            </button>
                        </div>
                        {/* Group By */}
                        <div className="flex items-center gap-1.5 text-xs font-mono">
                            <span className="text-gray-500">GROUP</span>
                            <div className="relative">
                                <select
                                    value={c2GroupBy}
                                    onChange={e => setC2GroupBy(e.target.value)}
                                    className="bg-black border border-signal/20 text-signal text-xs font-mono px-2 py-1 rounded appearance-none pr-5 focus:outline-none focus:border-signal/50"
                                >
                                    {['None','host','user','ip'].map(v => (
                                        <option key={v} value={v}>{v === 'None' ? 'NONE' : v.toUpperCase()}</option>
                                    ))}
                                </select>
                                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-signal/60 pointer-events-none" />
                            </div>
                        </div>
                        {/* Label Fields */}
                        <div className="flex items-center gap-1 text-xs font-mono flex-wrap">
                            {['displayId','host','user','ip','type'].map(f => {
                                const active = c2LabelFields.includes(f);
                                return (
                                    <button key={f}
                                        onClick={() => toggleLabel(f)}
                                        className={cn('flex items-center gap-0.5 px-2 py-0.5 border rounded text-[10px] transition-colors',
                                            active ? 'bg-signal/20 border-signal/50 text-signal' : 'bg-black border-white/10 text-gray-600 hover:border-signal/30 hover:text-signal/50')}>
                                        {active ? <CheckSquare size={9} /> : <Square size={9} />}{f}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="ml-auto text-gray-600 text-[10px] font-mono">{edges.length} edge{edges.length !== 1 ? 's' : ''}</span>
                    </div>

                    {showList ? (
                        /* List view (original) */
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto cyber-scrollbar">
                            {edges.map((edge: any) => {
                                const src = edge.source;
                                const dst = edge.destination;
                                const isEgress = !edge.c2profile?.is_p2p;
                                return (
                                    <div key={edge.id} className="border border-white/10 rounded p-3 space-y-2 bg-black/30">
                                        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
                                            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                                                isEgress ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30')}>
                                                {edge.c2profile?.name || '?'} • {isEgress ? 'Egress' : 'P2P'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={cn('flex flex-col text-xs font-mono p-2 border rounded flex-1',
                                                src?.active ? 'border-signal/30 bg-signal/5' : 'border-red-500/30 bg-red-900/10')}>
                                                <span className="text-gray-500 text-[9px] uppercase mb-0.5">SOURCE</span>
                                                <span className="text-white font-bold">#{src?.display_id} {src?.user}@{src?.host}</span>
                                                <span className="text-gray-500">{(() => { try { return JSON.parse(src?.ip || '[]')[0]; } catch { return src?.ip || '?'; } })()}</span>
                                                <span className={src?.active ? 'text-signal' : 'text-red-400'}>
                                                    {src?.active ? '● Active' : '○ Inactive'}
                                                </span>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-500 shrink-0" />
                                            <div className={cn('flex flex-col text-xs font-mono p-2 border rounded flex-1',
                                                dst?.active ? 'border-blue-500/30 bg-blue-900/10' : 'border-red-500/30 bg-red-900/10')}>
                                                <span className="text-gray-500 text-[9px] uppercase mb-0.5">DESTINATION</span>
                                                <span className="text-white font-bold">#{dst?.display_id} {dst?.user}@{dst?.host}</span>
                                                <span className="text-gray-500">{(() => { try { return JSON.parse(dst?.ip || '[]')[0]; } catch { return dst?.ip || '?'; } })()}</span>
                                                <span className={dst?.active ? 'text-blue-400' : 'text-red-400'}>
                                                    {dst?.active ? '● Active' : '○ Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* Graph view */
                        <div style={{ height: '60vh', minHeight: 320 }} className="border border-signal/20 rounded overflow-hidden bg-black/40">
                            <ReactFlowProvider>
                                <C2PathGraphInner
                                    edges={filteredEdges}
                                    onNodeCtxMenu={handleNodeCtxMenu}
                                    labelFields={c2LabelFields}
                                    groupBy={c2GroupBy}
                                    onHideNodeIds={handleHideNodeIds}
                                />
                            </ReactFlowProvider>
                        </div>
                    )}
                </div>
            )}

            {/* Node context menu */}
            {c2CtxMenu && createPortal(
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setC2CtxMenu(null)} />
                    <div
                        className="fixed z-[9999] bg-black/95 border border-signal/30 shadow-lg w-48 backdrop-blur-lg"
                        style={{ top: c2CtxMenu.y, left: c2CtxMenu.x }}
                    >
                        <div className="px-3 py-2 border-b border-white/5 text-[10px] font-mono text-gray-500">
                            {c2CtxMenu.isMythic ? 'MYTHIC_SERVER' : `CALLBACK #${c2CtxMenu.displayId ?? c2CtxMenu.nodeId}`}
                        </div>
                        {!c2CtxMenu.isMythic && c2CtxMenu.displayId && (
                            <button
                                onClick={() => { navigate(`/console/${c2CtxMenu.displayId}`); setC2CtxMenu(null); onClose(); }}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors w-full text-left"
                            >
                                <Terminal size={12} /> Interact
                            </button>
                        )}
                        <div className="border-t border-white/5 my-1" />
                        {!c2CtxMenu.isMythic && c2CtxMenu.displayId && (
                            <>
                                <button
                                    onClick={() => { handleOpenRemoveEdgeModal(); setC2CtxMenu(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-orange-900/20 text-xs text-orange-400 hover:text-orange-300 transition-colors w-full text-left"
                                >
                                    <Trash2 size={12} /> Remove Edge
                                </button>
                                <button
                                    onClick={() => { handleOpenAddEdgeModal(); setC2CtxMenu(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-cyan-900/20 text-xs text-cyan-400 hover:text-cyan-300 transition-colors w-full text-left"
                                >
                                    <Plus size={12} /> Add P2P Edge
                                </button>
                                <button
                                    onClick={() => { setTaskForEdgeModal(c2CtxMenu ? allNodes[c2CtxMenu.nodeId] : null); setC2CtxMenu(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-blue-900/20 text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-left"
                                >
                                    <Link2 size={12} /> Task for Edge
                                </button>
                                <div className="border-t border-white/5 my-1" />
                            </>
                        )}
                        <button
                            onClick={() => { setHiddenNodeIds(p => { const n = new Set(p); n.add(c2CtxMenu.nodeId); return n; }); setC2CtxMenu(null); }}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-yellow-900/20 text-xs text-yellow-400 hover:text-yellow-300 transition-colors w-full text-left"
                        >
                            <EyeOff size={12} /> Hide from Graph
                        </button>
                    </div>
                </>,
                document.body
            )}

            {/* Remove Edge Modal */}
            {removeEdgeModal && (
                <CyberModal
                    title="REMOVE_EDGE"
                    onClose={() => setRemoveEdgeModal(null)}
                    icon={<Trash2 />}
                >
                    <div className="space-y-3 min-w-[340px]">
                        <p className="text-xs text-gray-400 font-mono mb-2">Select an active edge to remove:</p>
                        {removeEdgeModal.map((e: any) => (
                            <button
                                key={e.id}
                                onClick={async () => {
                                    try {
                                        await removeEdge({ variables: { edge_id: e.id } });
                                        snackActions.success('Edge removed');
                                    } catch (err: any) {
                                        snackActions.error('Failed: ' + err.message);
                                    }
                                    setRemoveEdgeModal(null);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-orange-500/40 rounded text-xs font-mono text-left text-gray-300 hover:text-orange-300 hover:bg-orange-900/20 transition-colors"
                            >
                                <Trash2 size={12} className="text-orange-500 shrink-0" />
                                <span>
                                    #{e.source?.display_id} → #{e.destination?.display_id}
                                    {e.c2profile?.name && <span className="text-gray-500 ml-2">[{e.c2profile.name}]</span>}
                                </span>
                            </button>
                        ))}
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setRemoveEdgeModal(null)}
                                className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}

            {/* Add P2P Edge Modal */}
            {addEdgeSourceCb && (
                <CyberModal
                    title="ADD_P2P_EDGE"
                    onClose={() => { setAddEdgeSourceCb(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                    icon={<Plus />}
                >
                    <div className="space-y-4 min-w-[380px]">
                        <p className="text-xs text-gray-400 font-mono">
                            Source: <span className="text-signal">#{addEdgeSourceCb.display_id}</span>
                            {addEdgeSourceCb.host && <span className="text-gray-500 ml-2">({addEdgeSourceCb.host})</span>}
                        </p>

                        {/* Profile selector */}
                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-2">P2P_PROFILE</label>
                            <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                {p2pData?.c2profile?.map((profile: any) => (
                                    <button
                                        key={profile.id}
                                        onClick={() => {
                                            setAddEdgeSelectedProfile(profile);
                                            setAddEdgeSelectedDest(null);
                                            const dests = (profile.callbackc2profiles || [])
                                                .map((cp: any) => cp.callback)
                                                .filter((c: any) => c && c.id !== addEdgeSourceCb.id);
                                            setAddEdgeDestOptions(dests);
                                        }}
                                        className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                            addEdgeSelectedProfile?.id === profile.id
                                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                        }`}
                                    >
                                        <GitBranch size={14} />
                                        <span>{profile.name}</span>
                                        <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                    </button>
                                ))}
                                {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                    <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES</div>
                                )}
                            </div>
                        </div>

                        {/* Destination selector */}
                        {addEdgeSelectedProfile && (
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">DESTINATION_CALLBACK</label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {addEdgeDestOptions.map((cb: any) => (
                                        <button
                                            key={cb.id}
                                            onClick={() => setAddEdgeSelectedDest(cb)}
                                            className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                addEdgeSelectedDest?.id === cb.id
                                                    ? 'border-signal bg-signal/10 text-signal'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            }`}
                                        >
                                            <Monitor size={14} />
                                            <span>#{cb.display_id}</span>
                                            {cb.description && <span className="text-gray-500 ml-1 truncate max-w-[140px]">{cb.description}</span>}
                                        </button>
                                    ))}
                                    {addEdgeDestOptions.length === 0 && (
                                        <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_CALLBACKS</div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => { setAddEdgeSourceCb(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                                className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleManuallyAddEdge}
                                disabled={!addEdgeSelectedProfile || !addEdgeSelectedDest}
                                className="px-4 py-2 border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                CONFIRM_EDGE
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}

            {/* Task for Edge Modal */}
            {taskForEdgeModal && (
                <CyberModal
                    title="TASK_FOR_EDGE"
                    onClose={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(''); setTaskForEdgeParams(''); }}
                    icon={<Link2 />}
                >
                    <div className="space-y-4 min-w-[340px]">
                        <p className="text-xs text-gray-400 font-mono">
                            Callback #{taskForEdgeModal.display_id} — {taskForEdgeModal.host}
                        </p>

                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-2">COMMAND</label>
                            <input
                                type="text"
                                value={taskForEdgeCommand}
                                onChange={(e) => setTaskForEdgeCommand(e.target.value)}
                                className="w-full px-3 py-2 bg-black border border-white/10 text-white text-xs font-mono focus:border-signal/30 focus:outline-none"
                                placeholder="e.g. ls, whoami"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-2">PARAMETERS (optional)</label>
                            <textarea
                                value={taskForEdgeParams}
                                onChange={(e) => setTaskForEdgeParams(e.target.value)}
                                className="w-full px-3 py-2 bg-black border border-white/10 text-white text-xs font-mono focus:border-signal/30 focus:outline-none resize-none"
                                rows={3}
                                placeholder="JSON parameters"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(''); setTaskForEdgeParams(''); }}
                                className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleTaskForEdge}
                                disabled={!taskForEdgeCommand}
                                className="px-4 py-2 border border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500 font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                TASK
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}
        </CyberModal>
    );
};

/* ─────────── Open Multiple Callbacks Dialog ─────────── */
type OpenMultipleMode = 'interact' | 'console' | 'files' | 'process';
const OpenMultipleDialog = ({ allCallbacks, onClose }: { allCallbacks: any[]; onClose: () => void }) => {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [mode, setMode] = useState<OpenMultipleMode>('interact');
    const active = allCallbacks.filter((c: any) => c.active !== false);
    const toggleSel = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const handleOpen = () => {
        if (mode === 'console') {
            // interactConsole — open console/terminal view in new tab
            [...selected].forEach(id => window.open(`/console/${id}`, '_blank'));
        } else {
            const suffix = mode === 'files' ? '?tab=files' : mode === 'process' ? '?tab=process' : '';
            [...selected].forEach(id => window.open(`/new/callbacks/${id}${suffix}`, '_blank'));
        }
        onClose();
    };
    const modeLabel: Record<OpenMultipleMode, string> = {
        interact: 'EXPAND', console: 'CONSOLE', files: 'FILES', process: 'PROCESSES',
    };
    const modeDesc: Record<OpenMultipleMode, string> = {
        interact: 'Full expand view', console: 'Console/terminal view', files: 'File browser', process: 'Process browser',
    };
    return (
        <CyberModal title="OPEN_MULTIPLE_CALLBACKS" onClose={onClose} icon={<ExternalLink />}>
            <div className="space-y-4">
                <div className="flex gap-1.5 text-xs font-mono flex-wrap">
                    {(['interact', 'console', 'files', 'process'] as OpenMultipleMode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)} title={modeDesc[m]}
                            className={cn('px-3 py-1 border transition-colors uppercase', mode === m ? 'border-signal text-signal bg-signal/10' : 'border-ghost/30 text-gray-500 hover:text-gray-300')}>
                            {modeLabel[m]}
                        </button>
                    ))}
                </div>
                <div className="text-[10px] font-mono text-gray-600">{modeDesc[mode]} — each opens in a new browser tab</div>
                <div className="max-h-64 overflow-y-auto cyber-scrollbar space-y-0.5">
                    {active.map((cb: any) => (
                        <label key={cb.id} className={cn('flex items-center gap-2 px-2 py-1.5 cursor-pointer border transition-colors',
                            selected.has(cb.display_id) ? 'border-signal/40 bg-signal/5 text-signal' : 'border-transparent text-gray-400 hover:text-gray-200')}>
                            <input type="checkbox" className="sr-only" checked={selected.has(cb.display_id)} onChange={() => toggleSel(cb.display_id)} />
                            {selected.has(cb.display_id) ? <CheckSquare size={12} className="text-signal shrink-0" /> : <Square size={12} className="text-gray-600 shrink-0" />}
                            <span className="font-mono text-xs">#{cb.display_id}</span>
                            <span className="text-signal text-xs">{cb.user}</span>
                            <span className="text-gray-500 text-xs">@{cb.host}</span>
                            <span className="ml-auto text-[10px] text-gray-600 border border-ghost/20 px-1">{cb.payload?.payloadtype?.name}</span>
                        </label>
                    ))}
                </div>
                <div className="flex items-center gap-2 justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => setSelected(new Set(active.map((c: any) => c.display_id)))} className="text-[10px] font-mono text-gray-500 hover:text-signal">SELECT ALL</button>
                        <button onClick={() => setSelected(new Set())} className="text-[10px] font-mono text-gray-500 hover:text-red-400">CLEAR</button>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button onClick={handleOpen} disabled={selected.size === 0}
                            className="px-5 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 flex items-center gap-2">
                            <ExternalLink size={13} /> OPEN {selected.size > 0 ? selected.size : ''}
                        </button>
                    </div>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Task Multiple Dialog ─────────── */
const TaskMultipleDialog = ({ selectedDisplayIds, allCallbacks, onClose }: {
    selectedDisplayIds: number[]; allCallbacks: any[]; onClose: () => void;
}) => {
    const [command, setCommand] = useState('');
    const [params, setParams] = useState('');
    const [tasking, setTasking] = useState(false);
    const [createTaskBulk] = useMutation(CREATE_TASK_BULK);

    // Determine the payloadtype_id from the first selected callback — enforce same agent type
    const firstSelected = allCallbacks.find(c => selectedDisplayIds.includes(c.display_id));
    const payloadTypeId = firstSelected?.payload?.payloadtype?.id;
    const payloadTypeName = firstSelected?.payload?.payloadtype?.name;

    // Filter to only callbacks with the same payload type (prevent mixed-agent tasking)
    const compatibleIds = useMemo(() => {
        if (!payloadTypeId) return selectedDisplayIds;
        const compatSet = new Set(
            allCallbacks
                .filter(c => c.payload?.payloadtype?.id === payloadTypeId)
                .map(c => c.display_id)
        );
        return selectedDisplayIds.filter(id => compatSet.has(id));
    }, [selectedDisplayIds, allCallbacks, payloadTypeId]);

    const incompatibleCount = selectedDisplayIds.length - compatibleIds.length;

    const handleSubmit = async () => {
        if (!command.trim() || compatibleIds.length === 0) return;
        setTasking(true);
        try {
            const result = await createTaskBulk({
                variables: {
                    callback_ids: compatibleIds,
                    command: command.trim(),
                    params: params,
                    payload_type: payloadTypeName || '',
                    tasking_location: 'command_line',
                    original_params: params,
                    parameter_group_name: 'Default',
                }
            });
            if (result.data?.createTask?.status === 'error') {
                snackActions.error(result.data.createTask.error);
            } else {
                snackActions.success(`Tasked ${compatibleIds.length} callbacks: ${command}`);
                onClose();
            }
        } catch (e: any) {
            snackActions.error('Bulk task failed: ' + e.message);
        } finally {
            setTasking(false);
        }
    };

    return (
        <CyberModal title="TASK_MULTIPLE_CALLBACKS" onClose={onClose} icon={<Terminal />}>
            <div className="space-y-4">
                <div className="text-xs font-mono space-y-1">
                    <div className="text-gray-500">
                        Tasking <span className="text-signal font-bold">{compatibleIds.length}</span> callback{compatibleIds.length !== 1 ? 's' : ''}
                        {payloadTypeName && <span className="text-gray-400"> (agent: <span className="text-blue-400">{payloadTypeName}</span>)</span>}
                    </div>
                    {incompatibleCount > 0 && (
                        <div className="text-orange-400 text-[11px]">
                            ⚠ {incompatibleCount} selected callback{incompatibleCount > 1 ? 's' : ''} skipped (different agent type)
                        </div>
                    )}
                    <div className="text-gray-600 text-[10px]">
                        IDs: {compatibleIds.map(id => `#${id}`).join(', ')}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Command</label>
                    <input type="text" value={command} onChange={e => setCommand(e.target.value)}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                        placeholder="e.g. ls, shell, ps" autoFocus />
                </div>
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Parameters (optional)</label>
                    <input type="text" value={params} onChange={e => setParams(e.target.value)}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                        placeholder="e.g. -path C:\Windows" />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={handleSubmit} disabled={tasking || !command.trim() || compatibleIds.length === 0}
                        className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 flex items-center gap-2">
                        {tasking ? <><Activity size={13} className="animate-spin" /> TASKING…</> : <><Terminal size={13} /> TASK ALL</>}
                    </button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Import Config Modal ─────────── */
const ImportConfigModal = ({ onClose }: { onClose: () => void }) => {
    const [fileName, setFileName] = useState('');
    const [fileContents, setFileContents] = useState('');
    const [importConfig] = useMutation(IMPORT_CALLBACK_CONFIG);
    const inputRef = useRef<HTMLInputElement>(null);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = ev => setFileContents(ev.target?.result as string || '');
        reader.readAsBinaryString(file);
    };

    const handleSubmit = async () => {
        if (!fileContents) { snackActions.warning('Select a config file first'); return; }
        try {
            const config = JSON.parse(fileContents);
            const result = await importConfig({ variables: { config } });
            if (result.data?.importCallbackConfig?.status === 'success') {
                snackActions.success('Callback imported successfully');
                onClose();
            } else {
                snackActions.error(result.data?.importCallbackConfig?.error || 'Import failed');
            }
        } catch (e: any) {
            snackActions.error('Failed to parse config: ' + e.message);
        }
    };

    return (
        <CyberModal title="IMPORT_CALLBACK_CONFIG" onClose={onClose} icon={<Upload />}>
            <div className="space-y-4">
                <p className="text-xs text-gray-500 font-mono">Import a callback config exported from another Mythic server to interact with that callback from here.</p>
                <div>
                    <input ref={inputRef} type="file" accept=".json" onChange={onFileChange} className="hidden" />
                    <button onClick={() => inputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-600 hover:border-signal/50 text-gray-400 hover:text-signal transition-colors font-mono text-sm">
                        <Upload size={16} />
                        {fileName || 'Select Config File (.json)'}
                    </button>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                    <button onClick={handleSubmit} disabled={!fileContents}
                        className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40">
                        IMPORT
                    </button>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Alert Trigger Modal ─────────── */
const AlertTriggerModal = ({ callback, onClose, onSave }: {
    callback: any; onClose: () => void; onSave: (minutes: number | null) => void;
}) => {
    const hasTrigger = !!callback.trigger_on_checkin_after_time;
    const [minutes, setMinutes] = useState(10);
    return (
        <CyberModal title="SET_ALERT_TRIGGER" onClose={onClose} icon={<Bell />}>
            <div className="space-y-4">
                <p className="text-xs text-gray-500 font-mono">
                    Alert after Callback #{callback.display_id} ({callback.user}@{callback.host}) hasn't checked in for N minutes.
                    {hasTrigger && <><br/><span className="text-orange-400 font-bold">Alert trigger is currently active.</span></>}
                </p>

                <div className="space-y-2 bg-black/30 border border-white/5 rounded p-3">
                    <p className="text-[10px] text-gray-400 font-mono leading-relaxed">
                        This adjusts how long, in minutes, this callback must <span className="font-bold">not</span> checkin before finally checking in to trigger an <span className="font-bold">eventing workflow</span> (trigger is callback_checkin).
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono leading-relaxed">
                        A zero value means never trigger.
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono leading-relaxed">
                        If no eventing workflow for <span className="font-bold">callback_checkin</span> that matches the right payload_types and supported_os restrictions, then nothing will happen.
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1 uppercase tracking-wider">Minutes without checkin</label>
                    <input type="number" min="1" value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 1)}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm" autoFocus />
                </div>
                <div className="flex justify-between gap-3">
                    {hasTrigger && <button onClick={() => onSave(null)} className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-900/30 font-mono text-sm">REMOVE TRIGGER</button>}
                    <div className="flex gap-3 ml-auto">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                        <button onClick={() => onSave(minutes)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SET TRIGGER</button>
                    </div>
                </div>
            </div>
        </CyberModal>
    );
};

/* ─────────── Per-column filter input ─────────── */
const ColumnFilterInput = ({ value, onChange, placeholder = 'Filter...' }: {
    value: string; onChange: (v: string) => void; placeholder?: string;
}) => (
    <div className="relative">
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className="w-full bg-black/60 border border-white/10 text-gray-300 text-[10px] font-mono px-2 py-0.5 focus:outline-none focus:border-signal/30 rounded-sm placeholder-gray-600"
            onClick={e => e.stopPropagation()} />
        {value && <button onClick={e => { e.stopPropagation(); onChange(''); }} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"><X size={10} /></button>}
    </div>
);

/* ─────────── Main Callbacks Page ─────────── */
export default function Callbacks() {
    const { isSidebarCollapsed } = useAppStore();
    React.useEffect(() => {
        const audio = new Audio(loadingSound);
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }, []);
    const { data: queryData, loading, refetch } = useQuery(GET_CALLBACKS, { fetchPolicy: 'network-only' });
    const { data: subData } = useSubscription(SUBSCRIPTION_CALLBACKS);
    const data = useMemo(() => subData ? { callback: subData.callback } : queryData, [subData, queryData]);
    const { data: edgesData } = useQuery(GET_CALLBACK_GRAPH_EDGES, { pollInterval: 10000 });
    const { data: customBrowsersData } = useQuery(GET_CUSTOM_BROWSERS);
    const customBrowsers = customBrowsersData?.custombrowser || [];
    const me = useReactiveVar(meState);
    const navigate = useNavigate();
    const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION);
    const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION);
    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [exportConfig] = useLazyQuery(EXPORT_CALLBACK_CONFIG, { fetchPolicy: 'no-cache' });
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const [updateSleepInfo] = useMutation(UPDATE_SLEEP_INFO_MUTATION);
    const [updateTrigger] = useMutation(UPDATE_CALLBACK_TRIGGER_MUTATION);
    const [updateCallbackColor] = useMutation(UPDATE_CALLBACK_COLOR_MUTATION);
    const [updateDescriptionAndColor] = useMutation(UPDATE_DESCRIPTION_AND_COLOR_MUTATION);
    const [updateCallbackIPs] = useMutation(UPDATE_IPS_MUTATION);
    const [updateCallbackGroups] = useMutation(UPDATE_CALLBACK_GROUPS_MUTATION);
    const [bulkHideCallbacks] = useMutation(HIDE_CALLBACKS_BULK);
    const client = useApolloClient();
    const [actionsMenuOpenId, setActionsMenuOpenId] = useState<number | null>(null);
    const [showEventingDialog, setShowEventingDialog] = useState<any>(null);
    const [sleepEditCallback, setSleepEditCallback] = useState<any>(null);
    const [sleepEditValue, setSleepEditValue] = useState('');
    const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number; maxH: number }>({ top: 0, left: 0, maxH: 600 });
    const [editDescriptionCallback, setEditDescriptionCallback] = useState<any>(null);
    const [newDescription, setNewDescription] = useState("");
    const [newColor, setNewColor] = useState('');
    const [showHiddenCallbacks, setShowHiddenCallbacks] = useState(false);
    const [hideDead, setHideDead] = useState(false);
    const [groupByHost, setGroupByHost] = useState(true);
    const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
    const [detailCallbackId, setDetailCallbackId] = useState<number | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>(() => {
        try { const s = localStorage.getItem('minerva_cb_col_filters'); return s ? JSON.parse(s) : {}; } catch { return {}; }
    });
    const setColFilter = (col: string, val: string) => setColumnFilters(p => ({ ...p, [col]: val }));
    useEffect(() => { localStorage.setItem('minerva_cb_col_filters', JSON.stringify(columnFilters)); }, [columnFilters]);

    // ── Operator display settings (persisted) ──
    const [operatorSettings, setOperatorSettings] = useState<{
        interactType: 'console' | 'new_window' | 'console_tab';
        hideOperatorNames: boolean;
        fontSize: number;
        taskingContextFields: string[];
    }>(() => {
        try {
            const s = localStorage.getItem('minerva_op_settings');
            const parsed = s ? JSON.parse(s) : {};
            return {
                interactType: parsed.interactType ?? 'console',
                hideOperatorNames: parsed.hideOperatorNames ?? false,
                fontSize: parsed.fontSize ?? 12,
                taskingContextFields: parsed.taskingContextFields ?? [],
            };
        } catch {
            return { interactType: 'console', hideOperatorNames: false, fontSize: 12, taskingContextFields: [] };
        }
    });
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    useEffect(() => { localStorage.setItem('minerva_op_settings', JSON.stringify(operatorSettings)); }, [operatorSettings]);

    // ── NEW: Feature state vars ──
    const [colorEditCallback, setColorEditCallback] = useState<any>(null);
    const [ipSelectCallback, setIpSelectCallback] = useState<any>(null);
    const [modifyGroupsCallback, setModifyGroupsCallback] = useState<any>(null);
    const [showImportConfig, setShowImportConfig] = useState(false);
    const [showTaskMultiple, setShowTaskMultiple] = useState(false);
    const [showOpenMultiple, setShowOpenMultiple] = useState(false);
    const [c2PathCallback, setC2PathCallback] = useState<any>(null);
    const [alertTriggerCallback, setAlertTriggerCallback] = useState<any>(null);
    const [tagEditCallbackId, setTagEditCallbackId] = useState<number | null>(null);
    const [showBulkEventingDialog, setShowBulkEventingDialog] = useState(false);
    const [osPopupText, setOsPopupText] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
    const [splitCallbackRow, setSplitCallbackRow] = useState<any>(null);
    const [splitSecondId, setSplitSecondId] = useState<number | null>(null);
    // ── Selected row highlight ──
    const [selectedCallbackId, setSelectedCallbackId] = useState<number | null>(null);
    const handleSort = (key: string) => {
        if (sortKey === key) {
            if (sortDir === 'ASC') setSortDir('DESC');
            else { setSortKey(null); setSortDir('ASC'); } // third state: no sort
        } else { setSortKey(key); setSortDir('ASC'); }
    };

    // ── Column visibility ──
    const TOGGLEABLE_COLS = ['USER', 'HOST', 'IP', 'EXTERNAL IP', 'OS', 'PID', 'LAST CHECKIN', 'DESCRIPTION', 'AGENT', 'DOMAIN', 'ARCHITECTURE', 'GROUPS', 'SLEEP', 'C2', 'PROCESS NAME', 'TAGS'] as const;
    type ColKey = typeof TOGGLEABLE_COLS[number];
    const DEFAULT_VISIBLE: ColKey[] = ['USER', 'HOST', 'IP', 'PID', 'LAST CHECKIN', 'DESCRIPTION', 'AGENT', 'DOMAIN', 'TAGS'];
    const [columnOrder, setColumnOrder] = useState<ColKey[]>(() => {
        try { const s = localStorage.getItem('minerva_cb_col_order'); return s ? JSON.parse(s) : [...TOGGLEABLE_COLS]; } catch { return [...TOGGLEABLE_COLS]; }
    });
    const [dragCol, setDragCol] = useState<ColKey | null>(null);
    const [dropCol, setDropCol] = useState<ColKey | null>(null);
    // Persist column order
    useEffect(() => { localStorage.setItem('minerva_cb_col_order', JSON.stringify(columnOrder)); }, [columnOrder]);

    const handleExitCallback = async (cb: any) => {
        setActionsMenuOpenId(null);
        try {
            const { data: exitData } = await client.query({
                query: GET_EXIT_CALLBACK_COMMAND,
                variables: { callback_id: cb.id },
                fetchPolicy: 'network-only',
            });
            const exitCmds = exitData?.callback_by_pk?.loadedcommands || [];
            if (exitCmds.length === 0) { snackActions.warning('No exit command loaded for this callback'); return; }
            if (!window.confirm(`Task ${exitCmds[0].command.cmd} on Callback ${cb.display_id}?`)) return;
            await createTask({ variables: { callback_id: cb.id, command: exitCmds[0].command.cmd, params: '', tasking_location: 'command_line' } });
            snackActions.success(`Tasked ${exitCmds[0].command.cmd}`);
        } catch (e: any) { snackActions.error('Failed to exit callback: ' + e.message); }
    };

    const handleSaveSleep = async () => {
        if (!sleepEditCallback) return;
        try {
            await updateSleepInfo({ variables: { callback_display_id: sleepEditCallback.display_id, sleep_info: sleepEditValue } });
            snackActions.success('Sleep info updated');
            refetch();
        } catch (e: any) { snackActions.error(e.message); }
        setSleepEditCallback(null);
    };

    const handleSaveAlertTrigger = async (minutes: number | null) => {
        if (!alertTriggerCallback) return;
        try {
            if (minutes === null) {
                await updateTrigger({ variables: { callback_display_id: alertTriggerCallback.display_id, trigger_on_checkin_after_time: null } });
                snackActions.success('Alert trigger removed');
            } else {
                const dt = new Date(Date.now() + minutes * 60000).toISOString();
                await updateTrigger({ variables: { callback_display_id: alertTriggerCallback.display_id, trigger_on_checkin_after_time: dt } });
                snackActions.success(`Alert trigger set for ${minutes} min`);
            }
            refetch();
        } catch (e: any) { snackActions.error(e.message); }
        setAlertTriggerCallback(null);
    };
    const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
        try { const s = localStorage.getItem('minerva_cb_visible_cols'); return s ? new Set(JSON.parse(s) as ColKey[]) : new Set(DEFAULT_VISIBLE); } catch { return new Set(DEFAULT_VISIBLE); }
    });
    // Persist visible column settings
    useEffect(() => { localStorage.setItem('minerva_cb_visible_cols', JSON.stringify([...visibleCols])); }, [visibleCols]);
    const [panelTab, setPanelTab] = useState<'BULK' | 'COLS'>('COLS');
    const [showPanel, setShowPanel] = useState(false);
    const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
    const toggleBulkSelect = (displayId: number) =>
        setBulkSelected(prev => { const n = new Set(prev); n.has(displayId) ? n.delete(displayId) : n.add(displayId); return n; });
    const toggleCol = (key: ColKey) =>
        setVisibleCols(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

    // ── Column header right-click context menu ──
    const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; col: any } | null>(null);
    const [headerFilterInput, setHeaderFilterInput] = useState('');
    const handleHeaderRightClick = useCallback((col: any, e: React.MouseEvent) => {
        e.preventDefault();
        if (!col.filterKey) return;
        setHeaderFilterInput(columnFilters[col.filterKey] || '');
        setHeaderMenu({ x: e.clientX, y: e.clientY, col });
    }, [columnFilters]);
    useEffect(() => {
        if (!headerMenu) return;
        const close = () => setHeaderMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [headerMenu]);

    const handleInteract = useCallback((row: any, newWindow = false) => {
        if (newWindow || operatorSettings.interactType === 'new_window') {
            window.open(`/new/callbacks/${row.display_id}`, '_blank');
        } else if (operatorSettings.interactType === 'console_tab') {
            window.open(`/console/${row.display_id}`, '_blank');
        } else {
            navigate(`/console/${row.display_id}`);
        }
    }, [operatorSettings.interactType, navigate]);

    // Single-click: select row only; Double-click: interact (navigate)
    const handleRowClick = (callback: any) => {
        setSelectedCallbackId(prev => prev === callback.id ? null : callback.id);
    };
    const handleRowDoubleClick = useCallback((callback: any) => {
        handleInteract(callback);
    }, [handleInteract]);

    // Auto-scroll to selected row whenever it changes
    useEffect(() => {
        if (selectedCallbackId === null) return;
        const el = document.querySelector(`[data-cb-id="${selectedCallbackId}"]`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [selectedCallbackId]);

    const handleActionsClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 5;
        const spaceAbove = rect.top - 5;
        const menuW = 256; // w-64
        const left = Math.max(4, Math.min(rect.right - menuW, window.innerWidth - menuW - 4));
        if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
            // Open downward
            setMenuPosition({ top: rect.bottom + 5, left, maxH: Math.max(180, spaceBelow - 4) });
        } else {
            // Open upward — not enough space below
            setMenuPosition({ bottom: window.innerHeight - rect.top + 5, left, maxH: Math.max(180, spaceAbove - 4) });
        }
        setActionsMenuOpenId(actionsMenuOpenId === id ? null : id);
    };
    React.useEffect(() => {
        const handleClickOutside = () => setActionsMenuOpenId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleHide = async (cb: any) => {
        try { await hideCallback({ variables: { callback_display_id: cb.display_id, active: false } }); snackActions.success(`Callback ${cb.display_id} hidden`); refetch(); } catch (e: any) { snackActions.error(e.message); }
        setActionsMenuOpenId(null);
    };
    const handleShow = async (cb: any) => {
        try { await hideCallback({ variables: { callback_display_id: cb.display_id, active: true } }); snackActions.success(`Callback ${cb.display_id} restored`); refetch(); } catch (e: any) { snackActions.error(e.message); }
        setActionsMenuOpenId(null);
    };
    const handleLockToggle = async (cb: any) => {
        try { await lockCallback({ variables: { callback_display_id: cb.display_id, locked: !cb.locked } }); snackActions.success(`Callback ${cb.display_id} ${cb.locked ? "unlocked" : "locked"}`); refetch(); } catch (e: any) { snackActions.error(e.message); }
        setActionsMenuOpenId(null);
    };
    const openEditDescription = (cb: any) => { setEditDescriptionCallback(cb); setNewDescription(cb.description || ""); setNewColor(cb.color || ''); setActionsMenuOpenId(null); };
    const handleSaveDescription = async () => {
        if (!editDescriptionCallback) return;
        try { await updateDescription({ variables: { callback_display_id: editDescriptionCallback.display_id, description: newDescription } }); snackActions.success("Description updated"); refetch(); setEditDescriptionCallback(null); } catch (e: any) { snackActions.error(e.message); }
    };
    const handleExportConfig = async (cb: any) => {
        setActionsMenuOpenId(null);
        if (!cb.agent_callback_id) { snackActions.error('No agent_callback_id'); return; }
        try {
            const { data: ed } = await exportConfig({ variables: { agent_callback_id: cb.agent_callback_id } });
            if (ed?.exportCallbackConfig?.status === 'success') {
                const blob = new Blob([JSON.stringify(ed.exportCallbackConfig.config, null, 2)], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cb.agent_callback_id}.json`; a.click(); URL.revokeObjectURL(a.href);
                snackActions.success('Config exported');
            } else { snackActions.error(ed?.exportCallbackConfig?.error || 'Export failed'); }
        } catch (e: any) { snackActions.error(e.message); }
    };

    const handleSaveColor = async (color: string) => {
        if (!colorEditCallback) return;
        const normalized = ['#ffffff', '#000000', '#FFFFFF', '#000000'].includes(color) ? '' : color;
        try {
            await updateCallbackColor({ variables: { callback_display_id: colorEditCallback.display_id, color: normalized } });
            snackActions.success(normalized ? `Color set to ${normalized}` : 'Color cleared');
            refetch();
        } catch (e: any) { snackActions.error(e.message); }
        setColorEditCallback(null);
    };

    const handleSaveDescriptionAndColor = async (desc: string, color: string) => {
        if (!editDescriptionCallback) return;
        const normalized = ['#ffffff', '#000000', '#FFFFFF', '#000000'].includes(color) ? '' : color;
        try {
            await updateDescriptionAndColor({ variables: {
                callback_display_id: editDescriptionCallback.display_id,
                description: desc || '',
                color: normalized,
            }});
            snackActions.success('Description and color updated');
            refetch();
            setEditDescriptionCallback(null);
        } catch (e: any) { snackActions.error(e.message); }
    };

    const handleSaveIPs = async (ips: string[]) => {
        if (!ipSelectCallback) return;
        try {
            await updateCallbackIPs({ variables: { callback_display_id: ipSelectCallback.display_id, ip: ips } });
            snackActions.success('Primary IP updated');
            refetch();
        } catch (e: any) { snackActions.error(e.message); }
        setIpSelectCallback(null);
    };

    const handleSaveGroups = async (groups: string[]) => {
        if (!modifyGroupsCallback) return;
        try {
            await updateCallbackGroups({ variables: { callback_display_id: modifyGroupsCallback.display_id, mythictree_groups: groups } });
            snackActions.success('Groups updated');
            refetch();
        } catch (e: any) { snackActions.error(e.message); }
        setModifyGroupsCallback(null);
    };

    const handleBulkHide = async () => {
        const ids = [...bulkSelected];
        try {
            await bulkHideCallbacks({ variables: { callback_display_ids: ids } });
            snackActions.success(`${ids.length} callbacks hidden`);
            setBulkSelected(new Set());
            refetch();
        } catch (e: any) { snackActions.error('Bulk hide failed: ' + e.message); }
    };

    // ── C2 egress status map ──
    const callbackEgressStatus = useMemo(() => {
        const map = new Map<number, { hasActiveEgress: boolean; isP2POnly: boolean }>();
        const edges = edgesData?.callbackgraphedge || [];
        edges.forEach((edge: any) => {
            [edge.source?.id, edge.destination?.id].filter(Boolean).forEach((id: number) => {
                if (!map.has(id)) map.set(id, { hasActiveEgress: false, isP2POnly: true });
                const entry = map.get(id)!;
                if (!edge.c2profile?.is_p2p && edge.end_timestamp === null) entry.hasActiveEgress = true;
                if (!edge.c2profile?.is_p2p) entry.isP2POnly = false;
            });
        });
        return map;
    }, [edgesData]);

    // ── Per-column filter + sort logic ──
    const filteredData = useMemo(() => {
        let rows = (data?.callback || []).filter((c: any) =>
            (showHiddenCallbacks || c.active !== false) && (!hideDead || isCallbackAlive(c)));
        const filters = Object.entries(columnFilters).filter(([, v]) => v.trim());
        if (filters.length > 0) {
            rows = rows.filter((row: any) => {
                return filters.every(([col, val]) => {
                    const v = val.toLowerCase();
                    switch (col) {
                        case 'USER': return (row.user || '').toLowerCase().includes(v);
                        case 'HOST': return (row.host || '').toLowerCase().includes(v);
                        case 'IP': return (row.ip || '').toLowerCase().includes(v);
                        case 'EXTERNAL IP': return (row.external_ip || '').toLowerCase().includes(v);
                        case 'OS': return (row.os || '').toLowerCase().includes(v);
                        case 'PID': return String(row.pid || '').includes(v);
                        case 'DESCRIPTION': return (row.description || '').toLowerCase().includes(v);
                        case 'AGENT': return (row.payload?.payloadtype?.name || '').toLowerCase().includes(v);
                        case 'DOMAIN': return (row.domain || '').toLowerCase().includes(v);
                        case 'ARCHITECTURE': return (row.architecture || '').toLowerCase().includes(v);
                        case 'GROUPS': return (row.mythictree_groups || []).join(',').toLowerCase().includes(v);
                        case 'SLEEP': return (row.sleep_info || '').toLowerCase().includes(v);
                        case 'PROCESS NAME': return (row.process_name || '').toLowerCase().includes(v);
                        case 'C2': return (row.callbackc2profiles || []).map((cp: any) => cp.c2profile?.name || '').join(',').toLowerCase().includes(v);
                        case 'TAGS': return (row.tags || []).map((t: any) => t.tagtype?.name || '').join(',').toLowerCase().includes(v);
                        default: return true;
                    }
                });
            });
        }
        if (sortKey) {
            rows = [...rows].sort((a, b) => {
                let av: any, bv: any;
                switch (sortKey) {
                    case 'ip': try { av = JSON.parse(a.ip)[0]; bv = JSON.parse(b.ip)[0]; } catch { av = a.ip; bv = b.ip; } break;
                    default: av = (a as any)[sortKey]; bv = (b as any)[sortKey];
                }
                if (av == null) return 1; if (bv == null) return -1;
                // Timestamp sort: 1970 (STREAMING callbacks) always sort to the bottom in ASC, top in DESC
                if (sortKey === 'last_checkin') {
                    const is1970A = !av || String(av).startsWith('1970');
                    const is1970B = !bv || String(bv).startsWith('1970');
                    if (is1970A && is1970B) return 0;
                    if (is1970A) return sortDir === 'ASC' ? 1 : -1;
                    if (is1970B) return sortDir === 'ASC' ? -1 : 1;
                    const strA = String(av); const strB = String(bv);
                    const da = new Date(strA.endsWith('Z') ? strA : strA + 'Z').getTime();
                    const db = new Date(strB.endsWith('Z') ? strB : strB + 'Z').getTime();
                    return sortDir === 'ASC' ? da - db : db - da;
                }
                // #4/#5 — IPv4 numeric + IPv6 full-expansion comparison
                if (sortKey === 'ip') {
                    const strA = String(av), strB = String(bv);
                    // IPv6 normalizer: expand to 8 groups of 4 hex digits
                    const normalizeIPv6 = (s: string): string | null => {
                        if (!s.includes(':')) return null;
                        let addr = s;
                        // Strip zone ID
                        const zi = addr.indexOf('%'); if (zi !== -1) addr = addr.slice(0, zi);
                        // Handle ::
                        if (addr.includes('::')) {
                            const parts = addr.split('::');
                            const left = parts[0] ? parts[0].split(':') : [];
                            const right = parts[1] ? parts[1].split(':') : [];
                            const fill = 8 - left.length - right.length;
                            const mid = Array(Math.max(0, fill)).fill('0000');
                            const groups = [...left, ...mid, ...right];
                            return groups.map(g => g.padStart(4, '0')).join(':');
                        }
                        const groups = addr.split(':');
                        if (groups.length !== 8) return null;
                        return groups.map(g => g.padStart(4, '0')).join(':');
                    };
                    // Try IPv4 first
                    const ipParts = (s: string) => s.split('.').map(Number);
                    const pa = ipParts(strA), pb = ipParts(strB);
                    if (pa.length === 4 && pb.length === 4 && pa.every(n => !isNaN(n)) && pb.every(n => !isNaN(n))) {
                        for (let i = 0; i < 4; i++) {
                            if (pa[i] !== pb[i]) { const cmp = pa[i] - pb[i]; return sortDir === 'ASC' ? cmp : -cmp; }
                        }
                        return 0;
                    }
                    // Try IPv6
                    const v6a = normalizeIPv6(strA), v6b = normalizeIPv6(strB);
                    if (v6a && v6b) {
                        const cmpV6 = v6a.localeCompare(v6b);
                        return sortDir === 'ASC' ? cmpV6 : -cmpV6;
                    }
                }
                const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
                return sortDir === 'ASC' ? cmp : -cmp;
            });
        }
        return rows;
    }, [data, showHiddenCallbacks, hideDead, columnFilters, sortKey, sortDir]);

    // Group callbacks by host — show best per machine, expandable to see others
    const displayData = useMemo(() => {
        if (!groupByHost) return filteredData;
        const hostMap = new Map<string, any[]>();
        for (const cb of filteredData) {
            const key = (cb.host || `unknown-${cb.id}`).toLowerCase();
            const arr = hostMap.get(key) || [];
            arr.push(cb);
            hostMap.set(key, arr);
        }
        const result: any[] = [];
        const privOrder = (c: any) => {
            const il = c.integrity_level;
            if (il === 4 || il === 'SYSTEM') return 4;
            if (il === 3 || il === 'High') return 3;
            if ((c.user || '').toLowerCase() === 'root' || (c.user || '').toLowerCase().includes('nt authority')) return 4;
            if (il === 2 || il === 'Medium') return 2;
            return 1;
        };
        for (const [hostKey, cbs] of hostMap.entries()) {
            // Sort: alive first → highest privilege → newest
            const sorted = [...cbs].sort((a, b) => {
                const aAlive = a.active !== false && isCallbackAlive(a) ? 1 : 0;
                const bAlive = b.active !== false && isCallbackAlive(b) ? 1 : 0;
                if (bAlive !== aAlive) return bAlive - aAlive;
                const aPriv = privOrder(a), bPriv = privOrder(b);
                if (bPriv !== aPriv) return bPriv - aPriv;
                return (b.display_id || 0) - (a.display_id || 0);
            });
            const rep = { ...sorted[0], _hostKey: hostKey, _childCallbacks: sorted.length > 1 ? sorted.slice(1) : undefined, _totalSessions: sorted.length };
            result.push(rep);
            // If expanded, inject child rows
            if (expandedHosts.has(hostKey) && sorted.length > 1) {
                for (const child of sorted.slice(1)) {
                    result.push({ ...child, _isChildRow: true, _hostKey: hostKey });
                }
            }
        }
        return result;
    }, [filteredData, groupByHost, expandedHosts]);

    const toggleHostExpand = useCallback((hostKey: string) => {
        setExpandedHosts(prev => {
            const next = new Set(prev);
            if (next.has(hostKey)) next.delete(hostKey);
            else next.add(hostKey);
            return next;
        });
    }, []);

    const filteredCallbackIds = useMemo(() => {
        const hasActiveFilters = Object.values(columnFilters).some(v => v.trim());
        if (!hasActiveFilters) return undefined;
        return new Set<string>(filteredData.map((c: any) => String(c.display_id)));
    }, [columnFilters, filteredData]);

    // ── Column definitions ──
    const ALL_COLS: Record<string, { header: string; filterKey?: string; sortKey?: string; cell?: (row: any) => React.ReactNode; accessorKey?: string; className?: string }> = {
        USER: {
            header: "USER", filterKey: 'USER', sortKey: 'user',
            cell: (row: any) => (
                <div className="flex items-center gap-2 flex-wrap">
                    <User size={14} className="text-gray-400 shrink-0" />
                    <span className={row.integrity_level > 2 ? 'text-yellow-500 font-bold' : 'text-signal'}>{row.user}</span>
                    {row.impersonation_context && (
                        <span className="text-[10px] text-gray-500 font-mono" title={`Impersonating: ${row.impersonation_context}`}>[{row.impersonation_context}]</span>
                    )}
                    {row.integrity_level > 2 && <Shield size={12} className="text-yellow-500" />}
                </div>
            )
        },
        HOST: { header: "HOST", accessorKey: "host", filterKey: 'HOST', sortKey: 'host' },
        IP: {
            header: "IP", filterKey: 'IP', sortKey: 'ip',
            cell: (row: any) => {
                let ips: string[] = [];
                if (Array.isArray(row.ip)) { ips = row.ip; }
                else { try { const parsed = JSON.parse(row.ip); ips = Array.isArray(parsed) ? parsed : [parsed]; } catch { ips = row.ip ? [String(row.ip)] : []; } }
                if (ips.length > 1) return (
                    <button onClick={e => { e.stopPropagation(); setIpSelectCallback(row); }}
                        className="flex items-center gap-1 text-signal hover:underline font-mono text-xs"
                        title={`${ips.length} IPs — click to select primary`}>
                        {ips[0]} <ChevronDown size={10} className="text-gray-500" />
                    </button>
                );
                return <span className="font-mono text-xs">{ips[0] || 'UNKNOWN'}</span>;
            }
        },
        'EXTERNAL IP': {
            header: "EXT IP", filterKey: 'EXTERNAL IP',
            cell: (row: any) => <span className="text-gray-400">{row.external_ip || "—"}</span>
        },
        OS: {
            header: "OS", filterKey: 'OS', sortKey: 'os',
            cell: (row: any) => (
                <button onClick={e => { e.stopPropagation(); if (row.os) setOsPopupText(row.os); }}
                    className="flex items-center gap-2 text-xs group" title={row.os ? 'Click to view full OS string' : undefined}>
                    {getPlatformIcon(row.os, row.payload?.payloadtype?.name, 14, 'text-gray-300')}
                    <span className="text-gray-400 truncate max-w-[80px] group-hover:text-gray-200 transition-colors">{row.os || '—'}</span>
                </button>
            )
        },
        PID: { header: "PID", accessorKey: "pid", className: "font-mono text-gray-400", filterKey: 'PID', sortKey: 'pid' },
        "LAST CHECKIN": { header: "LAST CHECKIN", sortKey: 'last_checkin', cell: (row: any) => <LastCheckinCell lastCheckin={row.last_checkin} agentType={row.payload?.payloadtype?.agent_type} dead={row.dead} /> },
        DESCRIPTION: {
            header: "DESCRIPTION", filterKey: 'DESCRIPTION', sortKey: 'description',
            cell: (row: any) => <span className="text-xs text-gray-500 italic truncate max-w-[150px] block" title={row.description}>{row.description || "No description"}</span>
        },
        AGENT: {
            header: "AGENT", filterKey: 'AGENT',
            cell: (row: any) => <span className="uppercase text-xs border border-ghost/30 px-2 py-0.5 rounded">{row.payload?.payloadtype?.name}</span>
        },
        DOMAIN: { header: "DOMAIN", filterKey: 'DOMAIN', sortKey: 'domain', cell: (row: any) => <span className="text-gray-400">{row.domain || "—"}</span> },
        ARCHITECTURE: { header: "ARCH", filterKey: 'ARCHITECTURE', cell: (row: any) => <span className="text-gray-400 uppercase text-xs">{row.architecture || "—"}</span> },
        GROUPS: {
            header: "GROUPS", filterKey: 'GROUPS',
            cell: (row: any) => {
                const groups = row.mythictree_groups || [];
                return groups.length > 0
                    ? <div className="flex flex-wrap gap-1">{groups.map((g: string) => <span key={g} className="text-[10px] font-mono px-1.5 py-0.5 bg-signal/10 text-signal border border-signal/20 rounded-sm">{g}</span>)}</div>
                    : <span className="text-gray-600">—</span>;
            }
        },
        SLEEP: {
            header: "SLEEP", filterKey: 'SLEEP',
            cell: (row: any) => (
                <button onClick={e => { e.stopPropagation(); setSleepEditCallback(row); setSleepEditValue(row.sleep_info || ''); }}
                    className="flex items-center gap-1.5 group" title="Click to edit sleep info">
                    <Clock size={10} className={row.sleep_info ? 'text-blue-400 group-hover:text-blue-300' : 'text-yellow-500/60 group-hover:text-yellow-400'} />
                    <span className="text-gray-400 text-xs font-mono group-hover:text-gray-200 transition-colors">{row.sleep_info || '—'}</span>
                </button>
            )
        },
        C2: {
            header: "C2", filterKey: 'C2',
            cell: (row: any) => {
                const profiles = row.callbackc2profiles || [];
                const egress = callbackEgressStatus.get(row.id);
                const hasActive = egress?.hasActiveEgress ?? false;
                const hasEgress = profiles.some((cp: any) => !cp.c2profile?.is_p2p);
                return (
                    <button onClick={e => { e.stopPropagation(); setC2PathCallback(row); }}
                        title="View C2 Path" className="flex flex-wrap gap-1 items-center hover:opacity-80 transition-opacity cursor-pointer text-left">
                        {profiles.length > 0 && (
                            <span title={hasActive ? 'Active egress route' : (hasEgress ? 'Egress offline' : 'P2P only')}
                                className={cn('inline-block w-2 h-2 rounded-full shrink-0 mr-0.5',
                                    hasActive ? 'bg-green-400' : (hasEgress ? 'bg-red-500' : 'bg-purple-400'))} />
                        )}
                        {profiles.map((cp: any, i: number) => (
                            <span key={i} className={cn("text-[10px] font-mono px-1.5 py-0.5 border rounded-sm",
                                cp.c2profile?.is_p2p ? "border-purple-500/30 text-purple-400 bg-purple-500/10" : "border-blue-500/30 text-blue-400 bg-blue-500/10")}>
                                {cp.c2profile?.name}{cp.c2profile?.is_p2p ? ' (P2P)' : ''}
                            </span>
                        ))}
                        {profiles.length === 0 && <span className="text-gray-500 hover:text-blue-400 transition-colors"><GitBranch size={12} /></span>}
                    </button>
                );
            }
        },
        'PROCESS NAME': {
            header: "PROC", filterKey: 'PROCESS NAME',
            cell: (row: any) => <span className="text-gray-400 text-xs font-mono" title={row.process_name || undefined}>{row.process_short_name || row.process_name || '—'}</span>
        },
        TAGS: {
            header: "TAGS", filterKey: 'TAGS',
            cell: (row: any) => {
                const tags = row.tags || [];
                return (
                    <div className="flex flex-wrap gap-1 items-center">
                        {tags.map((t: any) => (
                            <span key={t.id} className="text-[10px] font-mono px-1.5 py-0.5 border rounded-sm"
                                style={{ color: t.tagtype?.color || '#888', borderColor: (t.tagtype?.color || '#888') + '40', backgroundColor: (t.tagtype?.color || '#888') + '15' }}>
                                {t.tagtype?.name || '?'}
                            </span>
                        ))}
                        <button onClick={e => { e.stopPropagation(); setTagEditCallbackId(row.id); }}
                            className="p-0.5 text-gray-600 hover:text-yellow-400 transition-colors" title="Edit Tags">
                            <Tag size={10} />
                        </button>
                    </div>
                );
            }
        },
    };

    const columns = [
        {
            header: "",
            className: "w-8 pl-2",
            cell: (row: any) => panelTab === 'BULK' && showPanel ? (
                <button onClick={e => { e.stopPropagation(); toggleBulkSelect(row.display_id); }} className="text-gray-500 hover:text-signal p-0.5">
                    {bulkSelected.has(row.display_id) ? <CheckSquare size={14} className="text-signal" /> : <Square size={14} />}
                </button>
            ) : null
        },
        {
            header: "ID",
            cell: (row: any) => (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Interact icon — reflects current interactType setting */}
                    <button
                        onClick={e => { e.stopPropagation(); handleInteract(row); }}
                        title={`Interact — ${operatorSettings.interactType}`}
                        className={cn(
                            'p-0.5 rounded transition-colors shrink-0',
                            row.locked
                                ? 'text-red-500/80 hover:text-red-400'
                                : row.integrity_level > 2
                                    ? 'text-red-500 hover:text-red-400'
                                    : 'text-signal/50 hover:text-signal'
                        )}>
                        {row.locked
                            ? <Lock size={12} />
                            : operatorSettings.interactType === 'console_tab'
                                ? <ExternalLink size={12} />
                                : operatorSettings.interactType === 'new_window'
                                    ? <LayoutGrid size={12} />
                                    : <Terminal size={12} />}
                    </button>
                    {row.dead && <span title="Dead"><Skull size={11} className="text-red-500" /></span>}
                    {!row.dead && !isCallbackAlive(row) && <span title="Not responding"><Skull size={11} className="text-yellow-600 opacity-50" /></span>}
                    <span className={row.active === false ? "text-gray-600" : "text-gray-400"}>#{row.display_id}</span>
                    {row.active === false && <span title="Hidden"><EyeOff size={11} className="text-yellow-500" /></span>}
                    {row.trigger_on_checkin_after_time && <span title="Alert trigger set"><Bell size={9} className="text-orange-400" /></span>}
                    {(row.callbackports || []).length > 0 && (
                        <span title={(row.callbackports as any[]).map((p: any) => {
                                const base = `${p.port_type}: ${p.local_port}`;
                                const remote = p.remote_ip ? ` → ${p.remote_ip}:${p.remote_port || '?'}` : '';
                                const creds = p.username ? ` (${p.username}${p.password ? ':' + p.password : ''})` : '';
                                return base + remote + creds;
                            }).join('\n')}
                            className="text-[9px] px-1 border border-cyan-500/40 text-cyan-400 bg-cyan-900/20 rounded-sm font-mono cursor-help flex items-center gap-0.5">
                            <Wifi size={8} className="shrink-0" />
                            {(row.callbackports as any[]).some((p: any) => p.port_type === 'socks') ? 'SOCKS' : 'PORT'}
                        </span>
                    )}
                </div>
            )
        },
        ...columnOrder.filter(k => visibleCols.has(k)).map(k => ALL_COLS[k]),
        {
            header: "",
            className: "w-10",
            cell: (row: any) => (
                <div className="relative">
                    <button onClick={(e) => handleActionsClick(e, row.id)} className="p-1 hover:text-signal text-gray-500 transition-colors"><MoreVertical size={16} /></button>
                    {actionsMenuOpenId === row.id && createPortal(
                        <div className="fixed z-50 bg-black border border-signal/30 shadow-lg shadow-signal/10 w-64 backdrop-blur-md overflow-y-auto" style={{ top: menuPosition.top, bottom: menuPosition.bottom, left: menuPosition.left, maxHeight: menuPosition.maxH }} onClick={e => e.stopPropagation()}>
                            <div className="px-3 py-2 border-b border-white/10">
                                <div className="text-[10px] font-mono text-gray-500">CALLBACK #{row.display_id}</div>
                                <div className="text-xs text-gray-300">{row.user}@{row.host}</div>
                            </div>
                            <div className="p-1 flex flex-col">
                                {/* ── TASKING VIEWS ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Tasking Views</div>
                                <button onClick={() => { navigate(`/console/${row.display_id}`); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Terminal size={14} /> Interact (Console)</button>
                                <button onClick={() => { window.open(`/console/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><ExternalLink size={14} /> Console (New Tab)</button>
                                <button onClick={() => { setSplitCallbackRow(row); setSplitSecondId(null); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-cyan-400 transition-colors"><SplitSquareHorizontal size={14} className="text-cyan-500" /> Split Console</button>
                                <button onClick={() => { window.open(`/new/callbacks/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><LayoutGrid size={14} /> Expand Callback</button>
                                <div className="h-px bg-white/10 my-1" />
                                <button onClick={() => openEditDescription(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Edit size={14} /> Edit Description</button>
                                <button onClick={() => handleLockToggle(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors">
                                    {row.locked ? <Unlock size={14} /> : <Lock size={14} />} {row.locked ? `Unlock (${operatorSettings.hideOperatorNames ? '\u2022\u2022\u2022' : (row.locked_operator?.username || '?')})` : "Lock"}
                                </button>
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── BROWSERS ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Browsers</div>
                                <button onClick={() => { navigate(`/console/${row.display_id}?tab=files`); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Folder size={14} /> File Browser</button>
                                <button onClick={() => { navigate(`/console/${row.display_id}?tab=process`); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><FolderSearch size={14} /> Process Browser</button>
                                {customBrowsers.map((cb_: any) => (
                                    <button key={cb_.id} onClick={() => { navigate(`/console/${row.display_id}?tab=custom_browser&name=${encodeURIComponent(cb_.name)}`); setActionsMenuOpenId(null); }}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><List size={14} /> {cb_.name}</button>
                                ))}
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── METADATA ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Metadata</div>
                                <button onClick={() => { setDetailCallbackId(row.id); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Info size={14} /> View Details</button>
                                <button onClick={() => handleExportConfig(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Download size={14} /> Export Config</button>
                                <button onClick={() => { navigator.clipboard.writeText(row.agent_callback_id || ''); snackActions.success('UUID copied'); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Copy size={14} /> Copy UUID</button>
                                <button onClick={() => { setSleepEditCallback(row); setSleepEditValue(row.sleep_info || ''); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Clock size={14} /> Edit Sleep Info</button>
                                <button onClick={() => { setAlertTriggerCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors">
                                    {row.trigger_on_checkin_after_time ? <><BellOff size={14} className="text-orange-400" /> Remove Alert Trigger</> : <><Bell size={14} /> Set Alert Trigger</>}
                                </button>
                                <button onClick={() => { setShowEventingDialog(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-purple-400 transition-colors"><Zap size={14} className="text-purple-400" /> Trigger Eventing</button>
                                <button onClick={() => { setShowOpenMultiple(true); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Layers size={14} /> Other Callbacks…</button>
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── BULK ACTIONS ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Bulk Actions</div>
                                <button onClick={() => { toggleBulkSelect(row.display_id); setPanelTab('BULK'); setShowPanel(true); setActionsMenuOpenId(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors">
                                    {bulkSelected.has(row.display_id) ? <CheckSquare size={14} className="text-signal" /> : <Square size={14} />} {bulkSelected.has(row.display_id) ? 'Deselect for Bulk' : 'Select for Bulk'}
                                </button>
                                <button onClick={() => { setShowTaskMultiple(true); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-blue-400 transition-colors"><Terminal size={14} className="text-blue-400" /> Task Multiple…</button>
                                <button onClick={() => { setShowBulkEventingDialog(true); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-purple-400 transition-colors"><Zap size={14} className="text-purple-400" /> Start Eventing (Multiple)…</button>
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── CUSTOMIZATION ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Customization</div>
                                <button onClick={() => { setColorEditCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Palette size={14} /> Set Row Color</button>
                                <button onClick={() => { setIpSelectCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Globe size={14} /> Select Primary IP</button>
                                <button onClick={() => { setModifyGroupsCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Layers size={14} /> Modify Groups</button>
                                <button onClick={() => { setC2PathCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-blue-400 transition-colors"><GitBranch size={14} className="text-blue-400" /> View C2 Path</button>
                                <div className="h-px bg-white/10 my-1" />
                                <button onClick={() => handleExitCallback(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-orange-900/30 text-xs text-orange-400 hover:text-orange-300 transition-colors"><XCircle size={14} /> Exit Callback</button>
                                <div className="h-px bg-white/10 my-1" />
                                {row.active === false ? (
                                    <button onClick={() => handleShow(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-green-900/30 text-xs text-green-400 hover:text-green-300 transition-colors"><Eye size={14} /> Show Callback</button>
                                ) : (
                                    <button onClick={() => handleHide(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/30 text-xs text-red-400 hover:text-red-300 transition-colors"><EyeOff size={14} /> Hide Callback</button>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <Sidebar />
            <div className={cn("transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded"><Activity size={24} className="text-white" /></div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">ACTIVE CALLBACKS</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                ACTIVE AGENTS
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-6 text-sm font-mono items-center">
                        <button onClick={() => setShowSettingsModal(true)} title="Display settings"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-ghost/30 rounded transition-colors">
                            <Settings size={12} /> SETTINGS
                        </button>
                        <button onClick={() => setShowImportConfig(true)} title="Import Callback Config from another Mythic server"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-ghost/30 rounded transition-colors">
                            <Upload size={12} /> IMPORT
                        </button>
                        <div className="text-right border-l border-ghost/20 pl-6">
                            <div className="text-gray-400">TOTAL_AGENTS</div>
                            <div className="text-xl text-signal">{data?.callback?.length || 0}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-gray-400">HIGH_INTEGRITY</div>
                            <div className="text-xl text-yellow-500">{data?.callback?.filter((c: any) => c.integrity_level > 2).length || 0}</div>
                        </div>
                    </div>
                </header>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex-1 h-full min-h-0 flex flex-col gap-6">
                    {/* Graph View */}
                    <div className="h-[60%] min-h-[400px] border-b border-ghost/20 pb-6">
                        <div className="flex items-center gap-2 mb-2 text-xs font-mono text-gray-400"><Network size={14} className="text-signal" /><span>NETWORK_TOPOLOGY</span></div>
                        <CallbackGraph filterCallbackIds={filteredCallbackIds} />
                    </div>
                    {/* Table View */}
                    <div className="flex-1 min-h-0 overflow-auto">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                                <List size={14} className="text-signal" /><span>AGENT_LIST</span>
                                {showHiddenCallbacks && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded">SHOWING HIDDEN</span>}
                                {panelTab === 'BULK' && showPanel && bulkSelected.size > 0 && <span className="px-2 py-0.5 bg-signal/20 text-signal text-[10px] rounded">{bulkSelected.size} SELECTED</span>}
                                {Object.values(columnFilters).some(v => v.trim()) && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded"><Filter size={10} className="inline mr-1" />FILTERED</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", showFilters ? "bg-purple-500/20 text-purple-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")} title="Per-column filters">
                                    <Filter size={12} /><span>FILTER</span>
                                </button>
                                <button onClick={() => setGroupByHost(!groupByHost)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", groupByHost ? "bg-signal/20 text-signal hover:bg-signal/30" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")} title={groupByHost ? "Show all callbacks individually" : "Group callbacks by host"}>
                                    <Layers size={12} /><span>{groupByHost ? "GROUPED" : "GROUP"}</span>
                                </button>
                                <button onClick={() => setHideDead(!hideDead)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", hideDead ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")} title={hideDead ? "Show dead sessions" : "Hide dead sessions"}>
                                    <Skull size={12} /><span>{hideDead ? "SHOWING_DEAD" : "HIDE_DEAD"}</span>
                                </button>
                                <button onClick={() => setShowHiddenCallbacks(!showHiddenCallbacks)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", showHiddenCallbacks ? "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
                                    {showHiddenCallbacks ? <Eye size={12} /> : <EyeOff size={12} />}
                                    <span>{showHiddenCallbacks ? "HIDE_INACTIVE" : "SHOW_HIDDEN"}</span>
                                </button>
                                <div className="flex items-center border border-ghost/30 rounded overflow-hidden">
                                    <button onClick={() => { setPanelTab('BULK'); setShowPanel(p => panelTab === 'BULK' ? !p : true); }} className={cn("px-2 py-1 text-[11px] font-mono transition-colors", showPanel && panelTab === 'BULK' ? "bg-signal/20 text-signal" : "text-gray-500 hover:text-gray-300")}>BULK</button>
                                    <div className="w-px h-4 bg-ghost/30" />
                                    <button onClick={() => { setPanelTab('COLS'); setShowPanel(p => panelTab === 'COLS' ? !p : true); }} className={cn("flex items-center gap-1 px-2 py-1 text-[11px] font-mono transition-colors", showPanel && panelTab === 'COLS' ? "bg-signal/20 text-signal" : "text-gray-500 hover:text-gray-300")}><Columns size={11} /> COLS</button>
                                </div>
                            </div>
                        </div>
                        {/* Per-column filter row */}
                        {showFilters && (
                            <div className="mb-2 border border-purple-500/20 bg-void/80 p-2 flex flex-wrap gap-2">
                                {TOGGLEABLE_COLS.filter(k => visibleCols.has(k) && ALL_COLS[k].filterKey).map(k => (
                                    <div key={k} className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-mono text-gray-600 uppercase">{k}</span>
                                        <ColumnFilterInput value={columnFilters[k] || ''} onChange={v => setColFilter(k, v)} />
                                    </div>
                                ))}
                                {Object.values(columnFilters).some(v => v.trim()) && (
                                    <button onClick={() => setColumnFilters({})} className="self-end text-[10px] font-mono text-gray-500 hover:text-red-400 px-2 py-1 border border-white/10 hover:border-red-500/30 transition-colors">CLEAR ALL</button>
                                )}
                            </div>
                        )}
                        {/* COLS / BULK panel */}
                        {showPanel && (
                            <div className="mb-2 border border-ghost/30 bg-void/80 p-3 text-xs font-mono">
                                {panelTab === 'COLS' && (
                                    <>
                            <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-2">Visible Columns <span className="text-gray-700">(drag to reorder)</span></p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {columnOrder.map(key => (
                                                <label key={key}
                                                    draggable
                                                    onDragStart={() => { setDragCol(key); setDropCol(null); }}
                                                    onDragOver={(e) => { e.preventDefault(); setDropCol(key); }}
                                                    onDragEnter={() => setDropCol(key)}
                                                    onDragLeave={() => setDropCol(null)}
                                                    onDrop={() => {
                                                        if (dragCol && dragCol !== key) {
                                                            setColumnOrder(prev => {
                                                                const n = [...prev];
                                                                const fromIdx = n.indexOf(dragCol);
                                                                const toIdx = n.indexOf(key);
                                                                n.splice(fromIdx, 1);
                                                                n.splice(toIdx, 0, dragCol);
                                                                return n;
                                                            });
                                                        }
                                                        setDragCol(null);
                                                        setDropCol(null);
                                                    }}
                                                    className={cn(
                                                        "flex items-center gap-2 cursor-grab transition-colors text-gray-400 w-32 px-1 py-0.5 rounded border",
                                                        dragCol === key && "opacity-40",
                                                        dropCol === key && dragCol !== key
                                                            ? "border-signal/60 bg-signal/10 text-signal"
                                                            : "border-transparent hover:text-signal"
                                                    )}>
                                                    <button onClick={() => toggleCol(key)} className="shrink-0">
                                                        {visibleCols.has(key) ? <CheckSquare size={13} className="text-signal" /> : <Square size={13} className="text-gray-600" />}
                                                    </button>
                                                    <span className="uppercase text-[11px]">{key}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-2 flex justify-end">
                                            <button onClick={() => { setVisibleCols(new Set(DEFAULT_VISIBLE)); setColumnOrder([...TOGGLEABLE_COLS]); }}
                                                className="text-[10px] font-mono text-gray-600 hover:text-orange-400 border border-ghost/20 hover:border-orange-500/30 px-2 py-0.5 transition-colors">
                                                RESET TO DEFAULTS
                                            </button>
                                        </div>
                                    </>
                                )}
                                {panelTab === 'BULK' && (
                                    <>
                                        <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-2">Bulk Actions</p>
                                        <p className="text-gray-500 mb-2">{bulkSelected.size} selected</p>
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={() => { const shown = filteredData; setBulkSelected(new Set(shown.map((c: any) => c.display_id))); }} className="px-2 py-1 border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/40 transition-colors">SELECT ALL</button>
                                            <button onClick={() => setBulkSelected(new Set())} className="px-2 py-1 border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/40 transition-colors">CLEAR</button>
                                            <button disabled={bulkSelected.size === 0} onClick={handleBulkHide} className="px-2 py-1 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-30">HIDE SELECTED</button>
                                            <button disabled={bulkSelected.size === 0} onClick={() => setShowTaskMultiple(true)}
                                                className="flex items-center gap-1.5 px-2 py-1 border border-blue-500/40 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-30">
                                                <Terminal size={11} /> TASK MULTIPLE
                                            </button>
                                            <button disabled={bulkSelected.size === 0} onClick={() => setShowBulkEventingDialog(true)}
                                                className="flex items-center gap-1.5 px-2 py-1 border border-purple-500/40 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-30">
                                                <Zap size={11} /> TRIGGER EVENTING
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Tasking Context Bar */}
                        {selectedCallbackId && (operatorSettings.taskingContextFields?.length ?? 0) > 0 && (() => {
                            const selCb = filteredData.find((r: any) => r.id === selectedCallbackId);
                            if (!selCb) return null;
                            const tryParseIP = (ip: string) => { try { const p = JSON.parse(ip); return Array.isArray(p) ? p.join(', ') : ip; } catch { return ip; } };
                            const fieldLabel: Record<string, string> = { user:'USER', host:'HOST', ip:'IP', pid:'PID', cwd:'CWD', impersonation_context:'IMPERSONATION', architecture:'ARCH', process_short_name:'PROC', extra_info:'EXTRA' };
                            return (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 border-b border-signal/10 bg-signal/5 text-[10px] font-mono">
                                    <span className="text-signal/50 uppercase tracking-widest shrink-0">CTX#{(selCb as any).display_id}</span>
                                    {operatorSettings.taskingContextFields.map(field => {
                                        let val = (selCb as any)[field] ?? '—';
                                        if (field === 'ip') val = tryParseIP(val);
                                        if (!val || val === '—') return null;
                                        return (
                                            <span key={field} className="flex items-center gap-1">
                                                <span className="text-gray-600">{fieldLabel[field] ?? field.toUpperCase()}:</span>
                                                <span className="text-gray-300">{String(val)}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        <CyberTable
                            data={displayData}
                            columns={columns as any}
                            isLoading={loading}
                            onRowClick={(row: any) => {
                                // If this is a group header with children, toggle expand on the group indicator area
                                handleRowClick(row);
                            }}
                            onRowDoubleClick={handleRowDoubleClick}
                            getRowColor={(row: any) => {
                                if (row._isChildRow) return '#1a2a3a';
                                if (row.id === selectedCallbackId) return '#22c55e';
                                return row.color || undefined;
                            }}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            onHeaderRightClick={handleHeaderRightClick}
                            rowFontSize={operatorSettings.fontSize}
                            renderRowPrefix={groupByHost ? (row: any) => {
                                if (row._isChildRow) {
                                    return (
                                        <span className="inline-flex items-center pl-3 pr-1 text-gray-600">
                                            <span className="border-l border-gray-700 h-4 mr-2" />
                                            <span className="text-[9px] font-mono text-gray-600">└</span>
                                        </span>
                                    );
                                }
                                if (row._totalSessions > 1) {
                                    return (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleHostExpand(row._hostKey); }}
                                            className="inline-flex items-center gap-1 pr-1 text-gray-400 hover:text-signal transition-colors"
                                            title={`${row._totalSessions} sessions on this host`}
                                        >
                                            <ChevronRight size={12} className={cn("transition-transform", expandedHosts.has(row._hostKey) && "rotate-90")} />
                                            <span className="text-[9px] font-mono bg-signal/10 text-signal/80 px-1 rounded">{row._totalSessions}</span>
                                        </button>
                                    );
                                }
                                return null;
                            } : undefined}
                        />
                    </div>
                </motion.div>
            </div>
            {/* Edit Description Modal */}
            <AnimatePresence>
                {editDescriptionCallback && (
                    <CyberModal title="EDIT_DESCRIPTION" onClose={() => setEditDescriptionCallback(null)} icon={<Edit />}>
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-mono text-gray-500">DESCRIPTION</label>
                                    <button
                                        onClick={() => {
                                            try {
                                                const parsed = JSON.parse(newDescription);
                                                setNewDescription(JSON.stringify(parsed, null, 2));
                                                snackActions.success('JSON formatted');
                                            } catch {
                                                snackActions.warning('Not valid JSON — cannot format');
                                            }
                                        }}
                                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-gray-600 hover:text-signal border border-ghost/20 hover:border-signal/30 transition-colors"
                                        title="Auto-format if valid JSON"
                                    >
                                        <FileText size={9} /> FORMAT JSON
                                    </button>
                                </div>
                                <textarea
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-y min-h-[60px] max-h-[200px]"
                                    autoFocus
                                    rows={3}
                                />
                                {/* JSON syntax highlight preview */}
                                {newDescription && (newDescription.trimStart().startsWith('{') || newDescription.trimStart().startsWith('[')) && (() => {
                                    let valid = false;
                                    try { JSON.parse(newDescription); valid = true; } catch {}
                                    if (valid) return (
                                        <div className="mt-1.5">
                                            <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">JSON PREVIEW</div>
                                            <JsonHighlight value={newDescription} />
                                        </div>
                                    );
                                    return <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-red-400/60"><XCircle size={10} /> Invalid JSON</div>;
                                })()}
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">ROW COLOR (optional)</label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {COLOR_PRESETS.map(c => (
                                        <button key={c || 'none'} onClick={() => setNewColor(c || '')}
                                            className={cn('w-6 h-6 rounded border transition-all hover:scale-110',
                                                newColor === (c || '') ? 'border-signal ring-1 ring-signal/50 scale-110' : 'border-white/20')}
                                            style={{ backgroundColor: c || 'transparent' }}
                                            title={c || 'Clear color'}>
                                            {!c && <X size={12} className="text-gray-500 m-auto" />}
                                        </button>
                                    ))}
                                    <input type="color" value={newColor || '#1a1a1a'} onChange={e => setNewColor(e.target.value)}
                                        className="w-7 h-7 rounded border border-white/20 cursor-pointer bg-transparent" title="Custom color" />
                                    {newColor && (
                                        <span className="text-[10px] font-mono text-signal">{newColor}</span>
                                    )}
                                </div>
                            </div>
                            {/* Color preview — dark + light mode */}
                            {newColor && (
                                <div className="space-y-1">
                                    <label className="text-[9px] font-mono text-gray-600 uppercase tracking-widest">Color Preview</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 h-7 flex items-center px-3 border rounded" style={{ backgroundColor: '#0a0a0a', borderColor: newColor + '60' }}>
                                            <span className="text-white text-[11px] font-mono truncate drop-shadow-sm">{newDescription || '◆ dark mode preview'}</span>
                                        </div>
                                        <div className="flex-1 h-7 flex items-center px-3 border rounded" style={{ backgroundColor: '#f5f5f5', borderColor: newColor + '60' }}>
                                            <span className="text-black text-[11px] font-mono truncate">{newDescription || '◆ light mode preview'}</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 w-full rounded" style={{ backgroundColor: newColor }} />
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditDescriptionCallback(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={() => handleSaveDescriptionAndColor(newDescription, newColor)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
            {/* Detailed Callback Info Modal */}
            <AnimatePresence>
                {detailCallbackId !== null && <DetailedCallbackModal callbackId={detailCallbackId} onClose={() => setDetailCallbackId(null)} />}
            </AnimatePresence>
            {/* Split Console Modal */}
            <AnimatePresence>
                {splitCallbackRow && (
                    <CyberModal title="SPLIT_CONSOLE" onClose={() => setSplitCallbackRow(null)} icon={<SplitSquareHorizontal />}>
                        <div className="space-y-4 min-w-[340px]">
                            <p className="text-xs text-gray-400 font-mono">
                                Primary: <span className="text-signal">#{splitCallbackRow.display_id}</span>
                                <span className="text-gray-500 ml-2">{splitCallbackRow.user}@{splitCallbackRow.host}</span>
                            </p>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">SELECT_SECOND_CALLBACK</label>
                                <div className="grid gap-1 max-h-48 overflow-y-auto border border-gray-800 p-2 bg-black/30 cyber-scrollbar">
                                    {(data?.callback || [])
                                        .filter((c: any) => c.id !== splitCallbackRow.id && c.active !== false)
                                        .map((c: any) => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSplitSecondId(c.display_id)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors',
                                                splitSecondId === c.display_id
                                                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            )}
                                        >
                                            <Monitor size={12} className="shrink-0" />
                                            <span>#{c.display_id}</span>
                                            <span className="text-gray-500">{c.user}@{c.host}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSplitCallbackRow(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                                <button
                                    onClick={() => {
                                        if (!splitSecondId) return;
                                        const w = window.screen.width;
                                        const h = window.screen.height;
                                        const halfW = Math.floor(w / 2);
                                        window.open(`/new/callbacks/${splitCallbackRow.display_id}`, '_blank', `width=${halfW},height=${h},left=0,top=0`);
                                        window.open(`/new/callbacks/${splitSecondId}`, '_blank', `width=${halfW},height=${h},left=${halfW},top=0`);
                                        setSplitCallbackRow(null);
                                    }}
                                    disabled={!splitSecondId}
                                    className="px-4 py-2 border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500 font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <SplitSquareHorizontal size={12} className="inline mr-1.5" />OPEN_SPLIT
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
            {/* Sleep Edit Modal */}
            <AnimatePresence>
                {sleepEditCallback && (
                    <CyberModal title="EDIT_SLEEP_INFO" onClose={() => setSleepEditCallback(null)} icon={<Clock />}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">SLEEP INFO (Callback #{sleepEditCallback.display_id})</label>
                                <input type="text" value={sleepEditValue} onChange={e => setSleepEditValue(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                                    placeholder="e.g. 10s, 30s with 20% jitter"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveSleep(); }}
                                />
                            </div>
                            <p className="text-[10px] font-mono text-amber-400/70 border border-amber-500/20 bg-amber-900/10 px-2 py-1 rounded">
                                ⚠ This does not task the agent — it only updates the alive/dead tracking threshold in Mythic.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setSleepEditCallback(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={handleSaveSleep} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
            {/* Eventing Trigger Dialog */}
            {showEventingDialog && (
                <MythicDialog fullWidth={true} maxWidth="xl" open={!!showEventingDialog}
                    onClose={() => setShowEventingDialog(null)}
                    innerDialog={<EventTriggerContextSelectDialog
                        onClose={() => setShowEventingDialog(null)}
                        triggerContext={{ name: "callback_id", value: showEventingDialog.id }} />}
                />
            )}
            {/* Color Picker Modal */}
            <AnimatePresence>
                {colorEditCallback && (
                    <CallbackColorPickerModal callback={colorEditCallback}
                        onClose={() => setColorEditCallback(null)}
                        onSave={handleSaveColor} />
                )}
            </AnimatePresence>
            {/* IP Selector Modal */}
            <AnimatePresence>
                {ipSelectCallback && (
                    <IPSelectorModal callback={ipSelectCallback}
                        onClose={() => setIpSelectCallback(null)}
                        onSave={handleSaveIPs} />
                )}
            </AnimatePresence>
            {/* Modify Groups Modal */}
            <AnimatePresence>
                {modifyGroupsCallback && (
                    <ModifyGroupsModal callback={modifyGroupsCallback}
                        allCallbacks={data?.callback || []}
                        onClose={() => setModifyGroupsCallback(null)}
                        onSave={handleSaveGroups} />
                )}
            </AnimatePresence>
            {/* C2 Path Dialog */}
            <AnimatePresence>
                {c2PathCallback && (
                    <C2PathDialog callbackId={c2PathCallback.id}
                        displayId={c2PathCallback.display_id}
                        onClose={() => setC2PathCallback(null)} />
                )}
            </AnimatePresence>
            {/* Open Multiple Modal */}
            <AnimatePresence>
                {showOpenMultiple && (
                    <OpenMultipleDialog allCallbacks={data?.callback || []} onClose={() => setShowOpenMultiple(false)} />
                )}
            </AnimatePresence>
            {/* Task Multiple Dialog */}
            <AnimatePresence>
                {showTaskMultiple && bulkSelected.size > 0 && (
                    <TaskMultipleDialog selectedDisplayIds={[...bulkSelected]}
                        allCallbacks={data?.callback || []}
                        onClose={() => setShowTaskMultiple(false)} />
                )}
            </AnimatePresence>
            {/* Import Config Modal */}
            <AnimatePresence>
                {showImportConfig && (
                    <ImportConfigModal onClose={() => setShowImportConfig(false)} />
                )}
            </AnimatePresence>
            {/* Alert Trigger Modal */}
            <AnimatePresence>
                {alertTriggerCallback && (
                    <AlertTriggerModal
                        callback={alertTriggerCallback}
                        onClose={() => setAlertTriggerCallback(null)}
                        onSave={handleSaveAlertTrigger}
                    />
                )}
            </AnimatePresence>
            {/* Tag Edit Dialog */}
            {tagEditCallbackId !== null && (
                <MythicDialog fullWidth maxWidth="md" open={tagEditCallbackId !== null}
                    onClose={() => { setTagEditCallbackId(null); refetch(); }}
                    innerDialog={<ViewEditTagsDialog me={me} target_object="callback_id" target_object_id={tagEditCallbackId}
                        onClose={() => { setTagEditCallbackId(null); refetch(); }} />}
                />
            )}
            {/* Bulk Eventing Dialog */}
            {showBulkEventingDialog && bulkSelected.size > 0 && (
                <MythicDialog fullWidth maxWidth="xl" open={showBulkEventingDialog}
                    onClose={() => setShowBulkEventingDialog(false)}
                    innerDialog={<EventTriggerContextSelectDialog
                        onClose={() => setShowBulkEventingDialog(false)}
                        triggerContext={{ name: "callback_ids", value: [...bulkSelected] }} />}
                />
            )}
            {/* OS Full String Popup */}
            <AnimatePresence>
                {osPopupText && (
                    <CyberModal title="OS_DETAILS" onClose={() => setOsPopupText(null)} icon={<Monitor size={16} />}>
                        <div className="space-y-3 min-w-[320px]">
                            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Full OS String</div>
                            <pre className="bg-black/50 border border-white/10 rounded p-3 text-signal/90 font-mono text-xs break-all whitespace-pre-wrap select-all">{osPopupText}</pre>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => { navigator.clipboard.writeText(osPopupText); snackActions.success('Copied'); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-ghost/30 text-gray-400 hover:text-white hover:border-signal/50 transition-colors"><Copy size={12} /> COPY</button>
                                <button onClick={() => setOsPopupText(null)} className="px-4 py-1.5 text-xs font-mono bg-signal text-void font-bold hover:bg-white transition-colors">CLOSE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Column Header Right-click Menu */}
            {headerMenu && createPortal(
                <div className="fixed z-[9990] bg-black border border-signal/30 shadow-xl w-64 backdrop-blur-md rounded-sm"
                    style={{ top: headerMenu.y, left: headerMenu.x }}
                    onClick={e => e.stopPropagation()}>
                    <div className="px-3 py-2 border-b border-white/10">
                        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">COLUMN: {headerMenu.col.header}</div>
                    </div>
                    <div className="p-2 space-y-2">
                        <div className="text-[10px] font-mono text-gray-500 uppercase">Filter Column</div>
                        <div className="flex gap-1">
                            <input
                                autoFocus
                                type="text"
                                value={headerFilterInput}
                                onChange={e => setHeaderFilterInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { setColFilter(headerMenu.col.filterKey, headerFilterInput); setHeaderMenu(null); } if (e.key === 'Escape') setHeaderMenu(null); }}
                                className="flex-1 bg-black/60 border border-ghost/40 text-signal text-xs font-mono px-2 py-1 focus:border-signal/50 outline-none"
                                placeholder="Filter value..."
                            />
                            <button onClick={() => { setColFilter(headerMenu.col.filterKey, headerFilterInput); setHeaderMenu(null); }}
                                className="px-2 py-1 bg-signal/20 border border-signal/40 text-signal hover:bg-signal/30 text-xs font-mono transition-colors">SET</button>
                        </div>
                        {columnFilters[headerMenu.col.filterKey] && (
                            <button onClick={() => { setColFilter(headerMenu.col.filterKey, ''); setHeaderMenu(null); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-red-400 hover:bg-red-900/20 border border-red-500/20 transition-colors">
                                <X size={10} /> Clear Filter for this column
                            </button>
                        )}
                        <div className="h-px bg-white/10" />
                        {headerMenu.col.sortKey && (
                            <button onClick={() => { setSortKey(headerMenu.col.sortKey); setSortDir('ASC'); setHeaderMenu(null); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-gray-400 hover:bg-white/5 transition-colors">
                                Sort ASC
                            </button>
                        )}
                        {headerMenu.col.sortKey && (
                            <button onClick={() => { setSortKey(headerMenu.col.sortKey); setSortDir('DESC'); setHeaderMenu(null); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-gray-400 hover:bg-white/5 transition-colors">
                                Sort DESC
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Operator Settings Modal */}
            <AnimatePresence>
                {showSettingsModal && (
                    <CyberModal title="OPERATOR_SETTINGS" onClose={() => setShowSettingsModal(false)} icon={<Settings />}>
                        <div className="space-y-6 min-w-[340px]">
                            {/* Interact Type */}
                            <div className="space-y-2">
                                <div className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">INTERACT_TYPE</div>
                                <div className="text-[10px] text-gray-600 font-mono">How rows and the Interact button open callbacks</div>
                                <div className="flex gap-2">
                                    {([
                                        { value: 'console', label: 'CONSOLE', icon: <Terminal size={12} /> },
                                        { value: 'console_tab', label: 'NEW_TAB', icon: <ExternalLink size={12} /> },
                                        { value: 'new_window', label: 'SPLIT_WIN', icon: <LayoutGrid size={12} /> },
                                    ] as const).map(({ value: v, label: lbl, icon }) => (
                                        <button
                                            key={v}
                                            onClick={() => setOperatorSettings(s => ({ ...s, interactType: v }))}
                                            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 border rounded text-xs font-mono transition-colors ${
                                                operatorSettings.interactType === v
                                                    ? 'bg-signal/20 border-signal/60 text-signal'
                                                    : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/70'
                                            }`}
                                        >
                                            {icon}{lbl}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Hide Operator Names */}
                            <div className="flex items-center justify-between py-2 border-t border-white/5">
                                <div>
                                    <div className="text-[11px] font-mono text-gray-300">HIDE_OPERATOR_NAMES</div>
                                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">Mask usernames in lock / ownership displays</div>
                                </div>
                                <button
                                    onClick={() => setOperatorSettings(s => ({ ...s, hideOperatorNames: !s.hideOperatorNames }))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-mono transition-colors ${
                                        operatorSettings.hideOperatorNames
                                            ? 'bg-signal/20 border-signal/60 text-signal'
                                            : 'bg-black border-white/10 text-gray-500 hover:border-signal/30'
                                    }`}
                                >
                                    {operatorSettings.hideOperatorNames ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            {/* Font Size / Row Height */}
                            <div className="py-2 border-t border-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-[11px] font-mono text-gray-300">ROW_FONT_SIZE</div>
                                        <div className="text-[10px] text-gray-600 font-mono mt-0.5">Controls table row height and text size</div>
                                    </div>
                                    <span className="text-signal font-mono text-xs">{operatorSettings.fontSize}px</span>
                                </div>
                                <input
                                    type="range" min={10} max={18} step={1}
                                    value={operatorSettings.fontSize}
                                    onChange={e => setOperatorSettings(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                                    className="w-full accent-signal"
                                />
                                <div className="flex justify-between text-[9px] font-mono text-gray-600 mt-1">
                                    <span>10</span><span>12</span><span>14</span><span>16</span><span>18</span>
                                </div>
                            </div>

                            {/* Tasking Context Fields */}
                            <div className="py-2 border-t border-white/5">
                                <div className="text-[11px] font-mono text-gray-300 mb-1">TASKING_CONTEXT_FIELDS</div>
                                <div className="text-[10px] text-gray-600 font-mono mb-2">Fields shown in the tasking context bar when a callback is selected</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {['user', 'host', 'ip', 'pid', 'cwd', 'impersonation_context', 'architecture', 'process_short_name', 'extra_info'].map(field => {
                                        const active = (operatorSettings.taskingContextFields || []).includes(field);
                                        return (
                                            <button key={field}
                                                onClick={() => setOperatorSettings(s => {
                                                    const cur = s.taskingContextFields || [];
                                                    return { ...s, taskingContextFields: active ? cur.filter(f => f !== field) : [...cur, field] };
                                                })}
                                                className={`px-2 py-0.5 text-[10px] font-mono border rounded-sm transition-colors ${active ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                                            >
                                                {field}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Filter Persistence / Settings Sync */}
                            <div className="border-t border-white/5 pt-3">
                                <div className="text-[10px] font-mono text-gray-600 space-y-1">
                                    <div className="flex items-center gap-1.5 text-signal/50"><CheckSquare size={10} /> Column filters persist across sessions (local)</div>
                                    <div className="flex items-center gap-1.5 text-signal/50"><CheckSquare size={10} /> Column visibility persists across sessions (local)</div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <button onClick={() => {
                                            const exp = { visibleCols: [...visibleCols], columnOrder, columnFilters, operatorSettings };
                                            const a = document.createElement('a');
                                            a.download = 'minerva_settings.json';
                                            a.href = URL.createObjectURL(new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' }));
                                            a.click(); URL.revokeObjectURL(a.href);
                                        }} className="flex items-center gap-1.5 px-2 py-1 border border-white/10 hover:border-signal/30 text-gray-500 hover:text-signal rounded transition-colors">
                                            <Download size={10} /> EXPORT_SETTINGS
                                        </button>
                                        <label className="flex items-center gap-1.5 px-2 py-1 border border-white/10 hover:border-signal/30 text-gray-500 hover:text-signal rounded transition-colors cursor-pointer">
                                            <Upload size={10} /> IMPORT_SETTINGS
                                            <input type="file" accept=".json" className="sr-only" onChange={e => {
                                                const file = e.target.files?.[0]; if (!file) return;
                                                file.text().then(txt => {
                                                    try {
                                                        const imp = JSON.parse(txt);
                                                        if (imp.visibleCols) setVisibleCols(new Set(imp.visibleCols as ColKey[]));
                                                        if (imp.columnOrder) setColumnOrder(imp.columnOrder);
                                                        if (imp.columnFilters) setColumnFilters(imp.columnFilters);
                                                        if (imp.operatorSettings) setOperatorSettings(imp.operatorSettings);
                                                        snackActions.success('Settings imported successfully');
                                                        setShowSettingsModal(false);
                                                    } catch { snackActions.error('Invalid settings file'); }
                                                });
                                            }} />
                                        </label>
                                        <button onClick={() => { localStorage.removeItem('minerva_cb_col_filters'); setColumnFilters({}); }} className="flex items-center gap-1.5 px-2 py-1 mt-0 border border-white/10 hover:border-red-500/30 text-gray-500 hover:text-red-400 rounded transition-colors">
                                            <X size={10} /> CLEAR_SAVED_FILTERS
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
        </div>
    );
}