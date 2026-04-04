import React, { useState, useEffect, useRef } from 'react'
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery, useLazyQueryCompat as useLazyQuery} from "../../lib/useQueryCompat";
import { motion } from 'framer-motion';
import {
    X,
    Search,
    MinusCircle,
    PlusCircle,
    Package,
    ShieldAlert,
    PhoneCall,
    Upload,
    FileJson,
    Loader2,
    Play,
    GitCompare,
    Globe2,
    ListCheck,
    Tag as TagIcon,
    Check,
    ChevronUp,
    ChevronDown,
    Info,
}from 'lucide-react';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    addCommandMutation, addTagToPayloadMutation, createManualCallbackMutation,
    exportPayloadConfigQuery, getCommandsForPayloadQuery,
    getPayloadFullDetailsQuery, getPayloadsListQuery,
    getRunningC2ProfilesQuery, getTagTypesQuery,
    hostFileMutation, importPayloadMutation,
    removeCommandMutation, removeTagFromPayloadMutation,
} from '../../lib/api/payloads';
import type { Payload, PayloadTag } from '../../types/payloads';
import { ParseParamValue } from './components';
import { createPortal } from 'react-dom';

export const ConfirmDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmColor?: 'red' | 'green' | 'signal';
}> = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmColor = 'red' }) => {
    if (!open) return null;
    const colorMap = {
        red: 'bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/40',
        green: 'bg-matrix/20 border-matrix text-matrix hover:bg-matrix/40',
        signal: 'bg-signal/20 border-signal text-signal hover:bg-signal/40',
    };
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center gap-3">
                    <ShieldAlert size={20} className="text-red-400" />
                    <h3 className="font-mono font-bold text-signal tracking-widest">{title}</h3>
                </div>
                <div className="p-6 text-gray-300 text-sm">{message}</div>
                <div className="p-4 border-t border-ghost/30 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={`px-4 py-2 border rounded font-mono font-bold transition-colors ${colorMap[confirmColor]}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Create New Callback Dialog (manual form)
// ============================================
export const CreateNewCallbackDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    uuid: string;
    filename: string;
}> = ({ open, onClose, uuid, filename }) => {
    const [ip, setIp] = useState('');
    const [externalIp, setExternalIp] = useState('');
    const [host, setHost] = useState('');
    const [user, setUser] = useState('');
    const [domain, setDomain] = useState('');
    const [description, setDescription] = useState('');
    const [sleepInfo, setSleepInfo] = useState('');
    const [extraInfo, setExtraInfo] = useState('');
    const [processName, setProcessName] = useState('');

    const [createCallback, { loading }] = useMutation<any>(createManualCallbackMutation, {
        onCompleted: (data: any) => {
            if (data.createCallback.status === 'success') {
                snackActions.success('Callback created successfully');
                onClose();
            } else {
                snackActions.error(data.createCallback.error);
            }
        },
        onError: (err) => {
            snackActions.error(err.message);
            onClose();
        },
    });

    const handleSubmit = () => {
        createCallback({
            variables: {
                payloadUuid: uuid,
                callbackConfig: {
                    ip,
                    externalIp,
                    host,
                    user,
                    domain,
                    description,
                    sleepInfo,
                    extraInfo,
                    processName,
                },
            },
        });
    };

    if (!open) return null;

    const fields: { label: string; value: string; setter: (v: string) => void; placeholder?: string }[] = [
        { label: 'IP', value: ip, setter: setIp, placeholder: '192.168.1.100' },
        { label: 'External IP', value: externalIp, setter: setExternalIp, placeholder: '1.2.3.4' },
        { label: 'Host', value: host, setter: setHost, placeholder: 'DESKTOP-XXXXX' },
        { label: 'User', value: user, setter: setUser, placeholder: 'DOMAIN\\user' },
        { label: 'Domain', value: domain, setter: setDomain },
        { label: 'Process Name', value: processName, setter: setProcessName, placeholder: 'explorer.exe' },
        { label: 'Sleep Info', value: sleepInfo, setter: setSleepInfo, placeholder: '10s jitter 20%' },
        { label: 'Description', value: description, setter: setDescription },
        { label: 'Extra Info', value: extraInfo, setter: setExtraInfo },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <PhoneCall size={18} className="text-signal" />
                        <h3 className="font-mono font-bold text-signal tracking-widest">MANUALLY CREATE CALLBACK</h3>
                    </div>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={16} /></button>
                </div>
                <div className="p-4 border-b border-ghost/20 bg-yellow-500/5 text-ghost text-xs font-mono">
                    <span className="text-yellow-400 font-bold">NOTE:</span> Creates a callback for <span className="text-signal">{filename}</span> without triggering payload execution. Useful for webshells, manual sessions, or testing.
                </div>
                <div className="p-4 max-h-[55vh] overflow-y-auto space-y-2">
                    {fields.map(({ label, value, setter, placeholder }) => (
                        <div key={label} className="grid grid-cols-3 gap-2 items-center">
                            <label className="text-xs font-mono text-ghost uppercase tracking-wider col-span-1">{label}</label>
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => setter(e.target.value)}
                                placeholder={placeholder || ''}
                                className="col-span-2 bg-void border border-signal/20 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-signal/60 placeholder:text-ghost/30"
                            />
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-4 py-2 border border-signal bg-signal/20 text-signal font-mono rounded font-bold hover:bg-signal/40 transition-colors text-sm disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : 'Create Callback'}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Import Payload Config Dialog
// ============================================
export const ImportPayloadConfigDialog: React.FC<{
    open: boolean;
    onClose: () => void;
}> = ({ open, onClose }) => {
    const [fileName, setFileName] = React.useState('');
    const [fileContents, setFileContents] = React.useState('');
    const [importPayload] = useMutation<any>(importPayloadMutation, {
        onCompleted: (data: any) => {
            if (data.createPayload.status === 'success') {
                snackActions.info('Submitted payload to build pipeline');
                onClose();
            } else {
                snackActions.error(data.createPayload.error);
            }
        },
        onError: (e) => snackActions.error('Import failed: ' + e.message),
    });
    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setFileName(file.name);
            setFileContents(ev.target?.result as string);
        };
        reader.readAsText(file);
    };
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between">
                    <h3 className="font-mono font-bold text-signal tracking-widest flex items-center gap-2"><Upload size={16} /> IMPORT PAYLOAD CONFIG</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-xs text-gray-400 font-mono">Select a previously exported payload config JSON file to generate a new payload.</p>
                    <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-signal/40 rounded cursor-pointer hover:border-signal/70 hover:bg-signal/5 transition-colors">
                        <FileJson size={20} className="text-signal" />
                        <span className="text-sm text-gray-300 font-mono">{fileName || 'Select JSON File...'}</span>
                        <input type="file" accept=".json" hidden onChange={onFileChange} />
                    </label>
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors">Cancel</button>
                    <button
                        disabled={!fileContents}
                        onClick={() => importPayload({ variables: { payload: fileContents } })}
                        className="px-4 py-2 bg-signal text-void font-mono font-bold rounded hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Submit
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Rebuild With Edits Dialog
// ============================================
export const RebuildWithEditsDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    uuid: string;
}> = ({ open, onClose, uuid }) => {
    const [config, setConfig] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [importPayload] = useMutation<any>(importPayloadMutation, {
        onCompleted: (data: any) => {
            if (data.createPayload.status === 'success') snackActions.info('Submitted modified payload to build pipeline');
            else snackActions.error(data.createPayload.error);
        },
        onError: (e) => snackActions.error('Build failed: ' + e.message),
    });
    const [fetchConfig] = useLazyQuery<any>(exportPayloadConfigQuery, {
        fetchPolicy: 'no-cache',
        onCompleted: (data: any) => {
            setLoading(false);
            if (data.exportPayloadConfig.status === 'success') setConfig(data.exportPayloadConfig.config);
            else snackActions.error('Failed to load config: ' + data.exportPayloadConfig.error);
        },
        onError: (e) => { setLoading(false); snackActions.error(e.message); },
    });
    React.useEffect(() => {
        if (open && uuid) { setLoading(true); fetchConfig({ variables: { uuid } }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, uuid]);
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between shrink-0">
                    <h3 className="font-mono font-bold text-signal tracking-widest flex items-center gap-2"><FileJson size={16} /> REBUILD WITH MODIFIED CONFIG</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-hidden p-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-signal" size={32} /></div>
                    ) : (
                        <textarea
                            value={config}
                            onChange={(e) => setConfig(e.target.value)}
                            className="w-full h-full min-h-[400px] bg-black/60 border border-signal/30 text-signal p-3 font-mono text-xs focus:border-signal outline-none rounded resize-none cyber-scrollbar"
                            spellCheck={false}
                        />
                    )}
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors">Cancel</button>
                    <button
                        disabled={!config || loading}
                        onClick={() => { importPayload({ variables: { payload: config } }); onClose(); }}
                        className="px-4 py-2 bg-signal text-void font-mono font-bold rounded hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Play size={14} /> Create
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Compare Payloads Dialog
// ============================================
export const PayloadDetailColumn: React.FC<{ payloadId: number; isCombat?: boolean }> = ({ payloadId, isCombat = false }) => {
    const { data, loading } = useQuery<any>(getPayloadFullDetailsQuery, {
        variables: { payload_id: payloadId },
        fetchPolicy: 'cache-and-network',
        skip: !payloadId,
    });
    if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-signal" size={24} /></div>;
    if (!data?.payload?.[0]) return <div className="text-gray-500 p-4 font-mono text-sm">No data</div>;
    const p = data.payload[0];
    const fname = p.filemetum ? b64DecodeUnicode(p.filemetum.filename_text) : 'N/A';
    return (
        <div className="text-xs font-mono space-y-3 overflow-y-auto cyber-scrollbar h-full p-2">
            <div className="space-y-1">
                <div className="text-signal/60 uppercase tracking-wider text-[10px]">File</div>
                <div className="text-white">{fname}</div>
                <div className="text-gray-500">{p.filemetum?.md5 && `MD5: ${p.filemetum.md5}`}</div>
            </div>
            {p.buildparameterinstances?.length > 0 && (
                <div>
                    <div className="text-signal/60 uppercase tracking-wider text-[10px] mb-1">Build Parameters</div>
                    {p.buildparameterinstances.map((bp: any) => (
                        <div key={bp.id} className="flex justify-between text-gray-300 py-0.5 border-b border-ghost/10">
                            <span className="text-ghost">{bp.buildparameter.name}</span>
                            <div className="max-w-[60%] text-right"><ParseParamValue value={bp.value} parameterType={bp.buildparameter.parameter_type} /></div>
                        </div>
                    ))}
                </div>
            )}
            {p.c2profileparametersinstances?.length > 0 && (
                <div>
                    <div className="text-signal/60 uppercase tracking-wider text-[10px] mb-1">C2 Parameters</div>
                    {p.c2profileparametersinstances.map((c2: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-300 py-0.5 border-b border-ghost/10">
                            <span className="text-ghost">{c2.c2profile.name}/{c2.c2profileparameter.name}</span>
                            <div className="max-w-[60%] text-right"><ParseParamValue value={c2.value} parameterType={c2.c2profileparameter.parameter_type} /></div>
                        </div>
                    ))}
                </div>
            )}
            {p.payloadcommands?.length > 0 && (
                <div>
                    <div className="text-signal/60 uppercase tracking-wider text-[10px] mb-1">Commands ({p.payloadcommands.length})</div>
                    <div className="flex flex-wrap gap-1">
                        {p.payloadcommands.map((pc: any) => (
                            <span key={pc.id} className="px-1.5 py-0.5 bg-signal/10 text-signal border border-signal/20 rounded text-[10px]">{pc.command.cmd}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const ComparePayloadsDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    payloadId: number;
    isCombat?: boolean;
}> = ({ open, onClose, payloadId, isCombat = false }) => {
    const [payloads, setPayloads] = React.useState<Array<{ id: number; uuid: string; description: string; payloadtype: { name: string }; filemetum: { filename_text: string } }>>([]);
    const [leftId, setLeftId] = React.useState<number>(payloadId);
    const [rightId, setRightId] = React.useState<number>(0);
    const [leftWidth, setLeftWidth] = useState(50);
    const dragging = useRef(false);
    useQuery<any>(getPayloadsListQuery, {
        skip: !open,
        onCompleted: (data: any) => {
            setPayloads(data.payload);
            const others = data.payload.filter((p: any) => p.id !== payloadId);
            if (others.length > 0) setRightId(others[0].id);
        },
    });
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between shrink-0">
                    <h3 className="font-mono font-bold text-signal tracking-widest flex items-center gap-2"><GitCompare size={16} /> COMPARE PAYLOAD CONFIGURATIONS</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={20} /></button>
                </div>
                <div
                    className="flex flex-1 overflow-hidden select-none"
                    onMouseMove={(e) => {
                        if (!dragging.current) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
                        setLeftWidth(pct);
                    }}
                    onMouseUp={() => { dragging.current = false; }}
                    onMouseLeave={() => { dragging.current = false; }}
                >
                    {/* Left */}
                    <div className="flex flex-col min-w-0 overflow-hidden" style={{ width: `${leftWidth}%` }}>
                        <div className="p-2 border-b border-ghost/20 shrink-0">
                            <select
                                value={leftId}
                                onChange={(e) => setLeftId(Number(e.target.value))}
                                className="w-full bg-black/40 border border-ghost/30 text-gray-300 font-mono text-xs p-1.5 rounded focus:border-signal outline-none"
                            >
                                {payloads.map(p => (
                                    <option key={p.id} value={p.id}>
                                        [{p.payloadtype.name}] {b64DecodeUnicode(p.filemetum.filename_text)} - {p.description || 'No desc'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {leftId > 0 && <PayloadDetailColumn payloadId={leftId} isCombat={isCombat} />}
                        </div>
                    </div>
                    {/* Draggable divider */}
                    <div
                        className="w-1.5 bg-ghost/20 hover:bg-signal/50 active:bg-signal cursor-col-resize flex-shrink-0 transition-colors"
                        onMouseDown={() => { dragging.current = true; }}
                        title="Drag to resize"
                    />
                    {/* Right */}
                    <div className="flex flex-col min-w-0 overflow-hidden flex-1">
                        <div className="p-2 border-b border-ghost/20 shrink-0">
                            <select
                                value={rightId}
                                onChange={(e) => setRightId(Number(e.target.value))}
                                className="w-full bg-black/40 border border-ghost/30 text-gray-300 font-mono text-xs p-1.5 rounded focus:border-signal outline-none"
                            >
                                {payloads.map(p => (
                                    <option key={p.id} value={p.id}>
                                        [{p.payloadtype.name}] {b64DecodeUnicode(p.filemetum.filename_text)} - {p.description || 'No desc'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {rightId > 0 && <PayloadDetailColumn payloadId={rightId} isCombat={isCombat} />}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors">Close</button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Host File via C2 Profile Dialog
// ============================================
export const HostPayloadFileDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    fileUuid: string;
    fileName: string;
}> = ({ open, onClose, fileUuid, fileName }) => {
    const [c2Profiles, setC2Profiles] = React.useState<Array<{ id: number; name: string }>>([]);
    const [selectedC2Id, setSelectedC2Id] = React.useState<number>(0);
    const [hostUrl, setHostUrl] = React.useState('');
    const [alertOnDownload, setAlertOnDownload] = React.useState(false);
    useQuery<any>(getRunningC2ProfilesQuery, {
        skip: !open,
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            setC2Profiles(data.c2profile);
            if (data.c2profile.length > 0) setSelectedC2Id(data.c2profile[0].id);
        },
    });
    const [hostFile] = useMutation<any>(hostFileMutation, {
        onCompleted: (data: any) => {
            if (data.c2HostFile.status === 'success') { snackActions.info('File hosted via C2 profile'); onClose(); }
            else snackActions.error(data.c2HostFile.error);
        },
        onError: (e) => snackActions.error('Host failed: ' + e.message),
    });
    const submit = (remove = false) => {
        if (!hostUrl) { snackActions.warning('Supply a hosting path'); return; }
        if (!hostUrl.startsWith('/')) { snackActions.warning('Host URL must start with /'); return; }
        if (!selectedC2Id) { snackActions.warning('Select a running C2 profile'); return; }
        hostFile({ variables: { c2_id: selectedC2Id, file_uuid: fileUuid, host_url: hostUrl, alert_on_download: alertOnDownload, remove } });
    };
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between">
                    <h3 className="font-mono font-bold text-signal tracking-widest flex items-center gap-2"><Globe2 size={16} /> HOST FILE VIA C2</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs text-ghost font-mono uppercase tracking-wider block mb-1">File</label>
                        <p className="text-white font-mono text-sm">{fileName}</p>
                    </div>
                    <div>
                        <label className="text-xs text-ghost font-mono uppercase tracking-wider block mb-1">C2 Profile</label>
                        <select
                            value={selectedC2Id}
                            onChange={(e) => setSelectedC2Id(Number(e.target.value))}
                            className="w-full bg-black/40 border border-ghost/30 text-gray-300 font-mono text-sm p-2 rounded focus:border-signal outline-none"
                        >
                            {c2Profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            {c2Profiles.length === 0 && <option value={0}>No running egress C2 profiles</option>}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-ghost font-mono uppercase tracking-wider block mb-1">Hosting URL Path (starts with /)</label>
                        <input
                            value={hostUrl}
                            onChange={(e) => setHostUrl(e.target.value)}
                            placeholder="/path/to/file"
                            className="w-full bg-black/40 border border-ghost/30 text-gray-300 font-mono text-sm p-2 rounded focus:border-signal outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setAlertOnDownload(!alertOnDownload)}
                            className={cn("w-8 h-4 rounded-full transition-colors relative", alertOnDownload ? "bg-signal" : "bg-gray-700")}
                        >
                            <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform", alertOnDownload ? "left-4.5 translate-x-1" : "left-0.5")} />
                        </button>
                        <label className="text-sm text-gray-300 font-mono">Alert on download</label>
                    </div>
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors">Cancel</button>
                    <button onClick={() => submit(true)} className="px-4 py-2 border border-red-400/50 text-red-400 font-mono rounded hover:bg-red-400/10 transition-colors">Stop Hosting</button>
                    <button onClick={() => submit(false)} className="px-4 py-2 bg-signal text-void font-mono font-bold rounded hover:bg-white transition-colors">Host File</button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Add/Remove Commands Dialog
// ============================================
export const AddRemoveCommandsDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    uuid: string;
    payloadId: number;
}> = ({ open, onClose, uuid, payloadId }) => {
    const [notIncluded, setNotIncluded] = React.useState<Array<{ id: number; cmd: string }>>([]);
    const [included, setIncluded] = React.useState<Array<{ id: number; cmd: string }>>([]);
    const [filter, setFilter] = React.useState('');
    const [_saving, _setSaving] = React.useState(false);
    useQuery<any>(getCommandsForPayloadQuery, {
        variables: { uuid },
        skip: !open,
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            const loadedCmds = new Set(data.payloadcommand.map((pc: any) => pc.command.id));
            const inc = data.command.filter((c: any) => loadedCmds.has(c.id)).sort((a: any, b: any) => a.cmd < b.cmd ? -1 : 1);
            const notInc = data.command.filter((c: any) => !loadedCmds.has(c.id)).sort((a: any, b: any) => a.cmd < b.cmd ? -1 : 1);
            setIncluded(inc);
            setNotIncluded(notInc);
        },
    });
    const [addCmd] = useMutation<any>(addCommandMutation, {
        onError: (e) => snackActions.error('Failed to add: ' + e.message),
    });
    const [removeCmd] = useMutation<any>(removeCommandMutation, {
        onError: (e) => snackActions.error('Failed to remove: ' + e.message),
    });
    const moveToIncluded = (cmd: { id: number; cmd: string }) => {
        addCmd({ variables: { command_id: cmd.id, payload_id: payloadId } });
        setNotIncluded(prev => prev.filter(c => c.id !== cmd.id));
        setIncluded(prev => [...prev, cmd].sort((a, b) => a.cmd < b.cmd ? -1 : 1));
    };
    const moveToNotIncluded = (cmd: { id: number; cmd: string }) => {
        removeCmd({ variables: { command_id: cmd.id, payload_id: payloadId } });
        setIncluded(prev => prev.filter(c => c.id !== cmd.id));
        setNotIncluded(prev => [...prev, cmd].sort((a, b) => a.cmd < b.cmd ? -1 : 1));
    };
    if (!open) return null;
    const filteredNotIncluded = notIncluded.filter(c => c.cmd.toLowerCase().includes(filter.toLowerCase()));
    const filteredIncluded = included.filter(c => c.cmd.toLowerCase().includes(filter.toLowerCase()));
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between shrink-0">
                    <h3 className="font-mono font-bold text-signal tracking-widest flex items-center gap-2"><ListCheck size={16} /> ADD / REMOVE COMMANDS</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={20} /></button>
                </div>
                <div className="p-3 border-b border-ghost/20 shrink-0">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter commands..."
                            className="w-full bg-black/40 border border-ghost/30 text-gray-300 font-mono text-sm pl-8 pr-3 py-1.5 rounded focus:border-signal outline-none"
                        />
                    </div>
                </div>
                <div className="flex flex-1 overflow-hidden">
                    {/* Not Included */}
                    <div className="flex-1 flex flex-col min-w-0 border-r border-ghost/20">
                        <div className="px-3 py-2 text-xs text-ghost font-mono uppercase tracking-wider bg-black/20 shrink-0">
                            Not Included ({filteredNotIncluded.length})
                        </div>
                        <div className="flex-1 overflow-y-auto cyber-scrollbar">
                            {filteredNotIncluded.map(cmd => (
                                <button
                                    key={cmd.id}
                                    onClick={() => moveToIncluded(cmd)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:bg-signal/10 hover:text-signal transition-colors font-mono border-b border-ghost/10"
                                >
                                    <span>{cmd.cmd}</span>
                                    <PlusCircle size={14} className="text-green-400/50" />
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Included */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-xs text-matrix font-mono uppercase tracking-wider bg-black/20 shrink-0">
                            Included ({filteredIncluded.length})
                        </div>
                        <div className="flex-1 overflow-y-auto cyber-scrollbar">
                            {filteredIncluded.map(cmd => (
                                <button
                                    key={cmd.id}
                                    onClick={() => moveToNotIncluded(cmd)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-matrix hover:bg-red-400/10 hover:text-red-400 transition-colors font-mono border-b border-ghost/10"
                                >
                                    <span>{cmd.cmd}</span>
                                    <MinusCircle size={14} className="text-red-400/50" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-signal/20 border border-signal/30 text-signal font-mono rounded hover:bg-signal/30 transition-colors">Done</button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Tag Edit Dialog
// ============================================
export const TagEditDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    payloadId: number;
    currentTags: PayloadTag[];
    onTagsChanged: () => void;
}> = ({ open, onClose, payloadId, currentTags, onTagsChanged }) => {
    const [tagTypes, setTagTypes] = React.useState<Array<{ id: number; name: string; color: string }>>([]);
    useQuery<any>(getTagTypesQuery, {
        skip: !open,
        onCompleted: (data: any) => setTagTypes(data.tagtype),
    });
    const [addTag] = useMutation<any>(addTagToPayloadMutation, {
        onCompleted: () => { snackActions.success('Tag added'); onTagsChanged(); },
        onError: (e) => snackActions.error('Failed: ' + e.message),
    });
    const [removeTag] = useMutation<any>(removeTagFromPayloadMutation, {
        onCompleted: () => { snackActions.success('Tag removed'); onTagsChanged(); },
        onError: (e) => snackActions.error('Failed: ' + e.message),
    });
    const isTagged = (tagtypeId: number) => currentTags.some(t => t.tagtype.id === tagtypeId);
    const getTagId = (tagtypeId: number) => currentTags.find(t => t.tagtype.id === tagtypeId)?.id;
    const toggle = (tagtypeId: number) => {
        if (isTagged(tagtypeId)) {
            const tid = getTagId(tagtypeId);
            if (tid) removeTag({ variables: { tag_id: tid } });
        } else {
            addTag({ variables: { payload_id: payloadId, tagtype_id: tagtypeId } });
        }
    };
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-sm overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between">
                    <h3 className="font-mono font-bold text-signal tracking-widest flex items-center gap-2"><TagIcon size={16} /> EDIT TAGS</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 space-y-2 max-h-72 overflow-y-auto cyber-scrollbar">
                    {tagTypes.length === 0 && <p className="text-gray-500 font-mono text-sm text-center py-4">No tag types defined</p>}
                    {tagTypes.map(tt => {
                        const active = isTagged(tt.id);
                        return (
                            <button
                                key={tt.id}
                                onClick={() => toggle(tt.id)}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 rounded border transition-all font-mono text-sm",
                                    active ? 'border-opacity-50' : 'border-ghost/20 hover:border-ghost/40'
                                )}
                                style={active ? {
                                    backgroundColor: `${tt.color}20`,
                                    borderColor: `${tt.color}60`,
                                    color: tt.color
                                } : {}}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tt.color }} />
                                    <span>{tt.name}</span>
                                </div>
                                {active ? <Check size={14} /> : <span className="text-ghost text-xs">+ Add</span>}
                            </button>
                        );
                    })}
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-signal/20 border border-signal/30 text-signal font-mono rounded hover:bg-signal/30 transition-colors">Done</button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Payload Row Component
// ============================================
// Mini component to fetch and show wrapped payload info
export const WrappedPayloadInfo: React.FC<{ payloadId: number }> = ({ payloadId }) => {
    const [expanded, setExpanded] = useState(false);
    const { data, loading } = useQuery<any>(getPayloadFullDetailsQuery, {
        variables: { payload_id: payloadId },
        fetchPolicy: 'cache-first',
    });
    if (loading) return <span className="text-gray-500 font-mono text-xs flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> #{payloadId}</span>;
    const p = data?.payload?.[0];
    if (!p) return <span className="text-signal font-bold font-mono text-xs">#{payloadId}</span>;
    const fname = p.filemetum ? b64DecodeUnicode(p.filemetum.filename_text) : `#${payloadId}`;

    // Group C2 params by profile name
    const c2Groups = (p.c2profileparametersinstances || []).reduce((acc: Record<string, any[]>, inst: any) => {
        const name = inst.c2profile?.name || 'Unknown';
        if (!acc[name]) acc[name] = [];
        acc[name].push(inst);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <div className="border border-ghost/20 rounded overflow-hidden text-xs font-mono">
            {/* Collapsed header — always visible */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-signal/5 transition-colors text-left"
            >
                <Package size={11} className="text-signal/60 shrink-0" />
                <span className="text-signal font-bold truncate flex-1">{fname}</span>
                <span className="text-gray-500 shrink-0">({p.payloadtype?.name})</span>
                {expanded ? <ChevronUp size={11} className="text-ghost shrink-0" /> : <ChevronDown size={11} className="text-ghost shrink-0" />}
            </button>

            {/* Expanded nested details */}
            {expanded && (
                <div className="border-t border-ghost/20 divide-y divide-ghost/10">
                    {/* C2 Profiles */}
                    {Object.keys(c2Groups).length > 0 && (
                        <div className="p-2.5">
                            <span className="text-ghost/50 uppercase tracking-wider text-[10px] block mb-1.5">C2 Profiles</span>
                            {(Object.entries(c2Groups) as [string, any[]][]).map(([profileName, instances]) => (
                                <div key={profileName} className="mb-2 last:mb-0">
                                    <span className="text-signal/80 font-bold block">{profileName}</span>
                                    <div className="ml-2 mt-0.5 space-y-0.5">
                                        {instances.map((inst: any, i: number) => (
                                            <div key={i} className="flex justify-between gap-2">
                                                <span className="text-ghost/50 shrink-0">{inst.c2profileparameter?.name}:</span>
                                                <span className="text-gray-300 truncate" title={inst.value}>{inst.value || '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Build Parameters */}
                    {(p.buildparameterinstances || []).length > 0 && (
                        <div className="p-2.5">
                            <span className="text-ghost/50 uppercase tracking-wider text-[10px] block mb-1.5">Build Parameters</span>
                            <div className="space-y-0.5">
                                {p.buildparameterinstances.map((bpi: any, i: number) => (
                                    <div key={i} className="flex justify-between gap-2">
                                        <span className="text-ghost/50 shrink-0">{bpi.buildparameter?.name}:</span>
                                        <span className="text-gray-300 truncate" title={bpi.value}>{bpi.value || '—'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Build Steps */}
                    {(p.payload_build_steps || []).length > 0 && (
                        <div className="p-2.5">
                            <span className="text-ghost/50 uppercase tracking-wider text-[10px] block mb-1.5">Build Steps</span>
                            <div className="flex flex-wrap gap-1">
                                {p.payload_build_steps.map((step: any) => (
                                    <span
                                        key={step.step_number}
                                        title={`${step.step_name}${step.step_stdout ? '\n' + step.step_stdout : ''}${step.step_stderr ? '\nERR: ' + step.step_stderr : ''}`}
                                        className={cn(
                                            "w-2.5 h-2.5 rounded-full border cursor-default",
                                            step.step_skip ? "bg-ghost/20 border-ghost/30 opacity-50" :
                                            step.step_success === true ? "bg-matrix border-matrix" :
                                            step.step_success === false ? "bg-red-400 border-red-500" :
                                            "bg-signal/50 border-signal animate-pulse"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    {/* File Metadata */}
                    {p.filemetum && (p.filemetum.md5 || p.filemetum.sha1 || p.filemetum.size > 0) && (
                        <div className="p-2.5">
                            <span className="text-ghost/50 uppercase tracking-wider text-[10px] block mb-1.5">File Metadata</span>
                            {p.filemetum.md5 && (
                                <div className="flex justify-between gap-2">
                                    <span className="text-ghost/50">MD5:</span>
                                    <span className="text-gray-300 truncate">{p.filemetum.md5}</span>
                                </div>
                            )}
                            {p.filemetum.sha1 && (
                                <div className="flex justify-between gap-2">
                                    <span className="text-ghost/50">SHA1:</span>
                                    <span className="text-gray-300 truncate">{p.filemetum.sha1}</span>
                                </div>
                            )}
                            {p.filemetum.size > 0 && (
                                <div className="flex justify-between gap-2">
                                    <span className="text-ghost/50">Size:</span>
                                    <span className="text-gray-300">{p.filemetum.size > 1048576 ? `${(p.filemetum.size / 1048576).toFixed(2)} MB` : p.filemetum.size > 1024 ? `${(p.filemetum.size / 1024).toFixed(1)} KB` : `${p.filemetum.size} B`}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export interface PayloadRowProps {
    payload: Payload;
    onDelete: (uuid: string) => void;
    onRestore: (uuid: string) => void;
    onToggleAlert: (uuid: string, alert: boolean) => void;
    onToggleAllowed: (uuid: string, allowed: boolean) => void;
    onRebuild: (uuid: string) => void;
    onRebuildFromConfig: (payload: Payload) => void;
    onExportConfig: (uuid: string) => void;
    showDeleted: boolean;
    isCombat?: boolean;
    onTagsUpdated?: () => void;
}

// Dialog Component for viewing/editing text content
export const PayloadDialog: React.FC<{
    open: boolean;
    onClose: () => void;
    title: string;
    content: string;
    loading?: boolean;
    error?: string;
    editable?: boolean;
    onSave?: (value: string) => void;
}> = ({ open, onClose, title, content, loading, error, editable, onSave }) => {
    const [editValue, setEditValue] = useState(content);
    
    useEffect(() => {
        setEditValue(content);
    }, [content]);
    
    if (!open) return null;
    
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between">
                    <h3 className="font-mono font-bold text-signal tracking-widest">{title}</h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] cyber-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-signal" size={32} />
                        </div>
                    ) : error ? (
                        <div className="text-red-400 font-mono p-4 bg-red-400/10 border border-red-400/30 rounded">
                            {error}
                        </div>
                    ) : editable ? (
                        <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full h-48 bg-black/50 border border-ghost/30 text-signal p-3 font-mono text-sm focus:border-signal outline-none rounded"
                        />
                    ) : (
                        <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap bg-black/50 p-4 rounded border border-ghost/20 overflow-x-auto">
                            {content || 'No content available.'}
                        </pre>
                    )}
                </div>
                <div className="p-4 border-t border-ghost/30 flex justify-end gap-2">
                    {editable && onSave && (
                        <button 
                            onClick={() => { onSave(editValue); onClose(); }}
                            className="px-4 py-2 bg-signal text-void font-mono font-bold rounded hover:bg-white transition-colors"
                        >
                            Save
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors"
                    >
                        {editable ? 'Cancel' : 'Close'}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

