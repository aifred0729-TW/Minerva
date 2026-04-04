import React from 'react';
import {
    AlertTriangle, Ban, Bell, BellOff, BookOpen,
    CheckCircle, Copy, Download, ExternalLink, FileJson, FileText,
    GitCompare, Globe2, Hash, Link, Link2, ListCheck, Package,
    PlayCircle, Radio, RefreshCw, Settings, Sliders, Terminal, X, XCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, SENSITIVE_PARAM_NAMES } from '../../lib/utils';
import { absoluteDownloadUrl } from '../../lib/urls';
import { snackActions } from '../../lib/snackbar';
import type { Payload } from '../../types/payloads';
import { ParseParamValue, BuildStatusBadge } from './components';
import { WrappedPayloadInfo } from './dialogs';

interface PayloadDetailsModalProps {
    payload: Payload;
    filename: string;
    me: any;
    allTags: any[];
    onClose: () => void;
    onDownload: () => void;
    onExportConfig: (uuid: string) => void;
    onRebuild: (uuid: string) => void;
    onRebuildFromConfig: (payload: Payload) => void;
    onShowRebuildWithEdits: () => void;
    onShowComparePayloads: () => void;
    onShowHostFile: () => void;
    onShowAddRemoveCommands: () => void;
    toLocalTime: (time: string, utc: boolean) => string;
}

export function PayloadDetailsModal({
    payload, filename, me, allTags,
    onClose, onDownload,
    onExportConfig, onRebuild, onRebuildFromConfig,
    onShowRebuildWithEdits, onShowComparePayloads,
    onShowHostFile, onShowAddRemoveCommands,
    toLocalTime,
}: PayloadDetailsModalProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-void border border-signal/30 rounded-lg w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-signal/30 bg-signal/5 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-signal font-mono tracking-wider">PAYLOAD DETAILS</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm text-gray-400 font-mono">{payload.uuid}</span>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(payload.uuid); snackActions.success('UUID copied'); }}
                                className="text-ghost hover:text-signal transition-colors"
                                title="Copy UUID"
                            >
                                <Copy size={14} />
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors">
                        <X size={24} />
                    </button>
                </div>
                
                {/* Content - Scrollable */}
                <div className="p-6 space-y-6 overflow-y-auto cyber-scrollbar flex-1">
                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2">
                        {payload.build_phase === 'success' && payload.filemetum && (
                            <>
                                <button
                                    onClick={onDownload}
                                    className="flex items-center gap-2 px-3 py-2 bg-matrix/20 border border-matrix/30 text-matrix rounded hover:bg-matrix/30 transition-colors font-mono text-sm"
                                >
                                    <Download size={14} />
                                    Download
                                </button>
                                <button
                                    onClick={() => {
                                        const url = absoluteDownloadUrl(payload.filemetum?.agent_file_id ?? '');
                                        navigator.clipboard.writeText(url);
                                        snackActions.success('Public download link copied');
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-signal/10 border border-signal/30 text-signal rounded hover:bg-signal/20 transition-colors font-mono text-sm"
                                >
                                    <Link size={14} />
                                    Copy Public Link
                                </button>
                                <button
                                    onClick={() => { onClose(); onShowHostFile(); }}
                                    className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                >
                                    <Globe2 size={14} />
                                    Host via C2
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => { onExportConfig(payload.uuid); }}
                            className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                        >
                            <FileText size={14} />
                            Export Config
                        </button>
                        <button
                            onClick={() => { onRebuild(payload.uuid); }}
                            className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                        >
                            <RefreshCw size={14} />
                            Rebuild
                        </button>
                        <button
                            onClick={() => { onClose(); onShowRebuildWithEdits(); }}
                            className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                        >
                            <FileJson size={14} />
                            Rebuild w/ Edits
                        </button>
                        {payload.build_phase === 'success' && (
                            <button
                                onClick={() => { onClose(); onRebuildFromConfig(payload); }}
                                className="flex items-center gap-2 px-3 py-2 bg-signal/10 border border-signal/30 text-signal rounded hover:bg-signal/20 transition-colors font-mono text-sm"
                            >
                                <Sliders size={14} />
                                Rebuild (Wizard)
                            </button>
                        )}
                        <button
                            onClick={() => { onClose(); onShowComparePayloads(); }}
                            className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                        >
                            <GitCompare size={14} />
                            Compare
                        </button>
                        <button
                            onClick={() => { onClose(); onShowAddRemoveCommands(); }}
                            className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                        >
                            <ListCheck size={14} />
                            Commands
                        </button>
                    </div>
                    
                    {/* Basic Info Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Payload Type</label>
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "w-8 h-8 rounded flex items-center justify-center border",
                                    payload.build_phase === 'success' 
                                        ? "bg-green-400/10 border-green-400/30" 
                                        : payload.build_phase === 'error' 
                                            ? "bg-red-400/10 border-red-400/30"
                                            : "bg-yellow-400/10 border-yellow-400/30"
                                )}>
                                    <Package size={16} className={cn(
                                        payload.build_phase === 'success' 
                                            ? "text-green-400" 
                                            : payload.build_phase === 'error' 
                                                ? "text-red-400"
                                                : "text-yellow-400"
                                    )} />
                                </div>
                                <div>
                                    <p className="text-signal font-mono text-sm">{payload.payloadtype.name}</p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-xs text-gray-500">v{payload.payloadtype.semver}</p>
                                        {payload.payload_type_semver && payload.payloadtype.semver &&
                                         payload.payload_type_semver !== payload.payloadtype.semver && (
                                            <span
                                                title={`Built with v${payload.payload_type_semver} — current container is v${payload.payloadtype.semver}`}
                                                className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-[9px] rounded font-mono cursor-help"
                                            >
                                                <AlertTriangle size={8} />
                                                STALE
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Filename</label>
                            <p className="text-white font-mono truncate" title={filename}>{filename}</p>
                            {payload.filemetum?.agent_file_id && (
                                <p className="text-xs text-gray-500 truncate">ID: {payload.filemetum.agent_file_id.substring(0, 12)}...</p>
                            )}
                        </div>
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Created</label>
                            <p className="text-gray-300 font-mono">{toLocalTime(payload.creation_time ?? '', (me?.user?.view_utc_time as boolean) ?? false)}</p>
                            {payload.operator && (
                                <p className="text-xs text-gray-500 font-mono">by {payload.operator.username}</p>
                            )}
                        </div>
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Build Status</label>
                            <BuildStatusBadge phase={payload.build_phase} />
                        </div>
                    </div>

                    {/* File Metadata */}
                    {payload.filemetum && (payload.filemetum.md5 || payload.filemetum.sha1 || payload.filemetum.size) && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2"><Hash size={12} /> File Metadata</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                                {payload.filemetum.md5 && (
                                    <div>
                                        <span className="text-gray-500 block">MD5</span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-signal/80 break-all text-xs">{payload.filemetum.md5}</span>
                                            <button
                                                title="Copy MD5"
                                                onClick={() => { navigator.clipboard.writeText(payload.filemetum!.md5 ?? ''); snackActions.success('MD5 copied'); }}
                                                className="shrink-0 text-ghost hover:text-signal transition-colors ml-1"
                                            >
                                                <Copy size={11} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {payload.filemetum.sha1 && (
                                    <div>
                                        <span className="text-gray-500 block">SHA1</span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-signal/80 break-all text-xs">{payload.filemetum.sha1}</span>
                                            <button
                                                title="Copy SHA1"
                                                onClick={() => { navigator.clipboard.writeText(payload.filemetum!.sha1 ?? ''); snackActions.success('SHA1 copied'); }}
                                                className="shrink-0 text-ghost hover:text-signal transition-colors ml-1"
                                            >
                                                <Copy size={11} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {payload.filemetum.size !== undefined && payload.filemetum.size > 0 && (
                                    <div>
                                        <span className="text-gray-500 block">Size</span>
                                        <span className="text-white">
                                            {payload.filemetum.size > 1048576
                                                ? `${(payload.filemetum.size / 1048576).toFixed(2)} MB`
                                                : payload.filemetum.size > 1024
                                                    ? `${(payload.filemetum.size / 1024).toFixed(1)} KB`
                                                    : `${payload.filemetum.size} B`}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Callback Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={cn(
                            "p-4 rounded border flex items-center justify-between",
                            payload.callback_alert 
                                ? "bg-matrix/10 border-matrix/30" 
                                : "bg-black/30 border-ghost/20"
                        )}>
                            <div className="flex items-center gap-3">
                                {payload.callback_alert ? <Bell size={20} className="text-matrix" /> : <BellOff size={20} className="text-ghost" />}
                                <div>
                                    <p className="text-sm font-mono text-white">Callback Alerts</p>
                                    <p className="text-xs text-gray-500">{payload.callback_alert ? 'Notifications enabled' : 'Notifications disabled'}</p>
                                </div>
                            </div>
                            <span className={cn(
                                "px-2 py-1 rounded text-xs font-mono",
                                payload.callback_alert ? "bg-matrix/20 text-matrix" : "bg-ghost/20 text-ghost"
                            )}>
                                {payload.callback_alert ? 'ON' : 'OFF'}
                            </span>
                        </div>
                        <div className={cn(
                            "p-4 rounded border flex items-center justify-between",
                            payload.callback_allowed 
                                ? "bg-matrix/10 border-matrix/30" 
                                : "bg-red-500/10 border-red-500/30"
                        )}>
                            <div className="flex items-center gap-3">
                                {payload.callback_allowed ? <CheckCircle size={20} className="text-matrix" /> : <Ban size={20} className="text-red-400" />}
                                <div>
                                    <p className="text-sm font-mono text-white">New Callbacks</p>
                                    <p className="text-xs text-gray-500">{payload.callback_allowed ? 'New callbacks allowed' : 'New callbacks blocked'}</p>
                                </div>
                            </div>
                            <span className={cn(
                                "px-2 py-1 rounded text-xs font-mono",
                                payload.callback_allowed ? "bg-matrix/20 text-matrix" : "bg-red-500/20 text-red-400"
                            )}>
                                {payload.callback_allowed ? 'ALLOWED' : 'BLOCKED'}
                            </span>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                        <label className="text-xs text-ghost uppercase tracking-wider block mb-2">Description</label>
                        <p className="text-gray-300">{payload.description || 'No description provided'}</p>
                    </div>

                    {/* C2 Profiles */}
                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3">C2 Profiles</label>
                        <div className="space-y-4">
                            {payload.payloadc2profiles.length > 0 ? (
                                payload.payloadc2profiles.map((pc, idx) => {
                                    const profileParams = (payload.c2profileparametersinstances || []).filter(
                                        inst => inst.c2profile.name === pc.c2profile.name
                                    );
                                    const hostInst = profileParams.find(p => p.c2profileparameter.name === 'callback_host' || p.c2profileparameter.name === 'host');
                                    const portInst = profileParams.find(p => p.c2profileparameter.name === 'callback_port' || p.c2profileparameter.name === 'port');
                                    const isActive = pc.c2profile.running && pc.c2profile.container_running;
                                    const isWaiting = !pc.c2profile.running && pc.c2profile.container_running;
                                    return (
                                        <div key={idx} className={cn(
                                            'rounded border',
                                            isActive ? 'border-matrix/30 bg-matrix/5' : isWaiting ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5'
                                        )}>
                                            <div className={cn(
                                                'flex items-center justify-between px-4 py-2 border-b',
                                                isActive ? 'border-matrix/20' : isWaiting ? 'border-yellow-500/20' : 'border-red-500/20'
                                            )}>
                                                <div className="flex items-center gap-2">
                                                    <Radio size={14} className={cn(pc.c2profile.running ? 'animate-pulse' : '', isActive ? 'text-matrix' : isWaiting ? 'text-yellow-400 animate-pulse' : 'text-red-400')} />
                                                    <span className={cn('font-mono text-sm font-bold', isActive ? 'text-matrix' : isWaiting ? 'text-yellow-400' : 'text-red-400')}>{pc.c2profile.name}</span>
                                                    {pc.c2profile.is_p2p && <span className="text-xs bg-purple-500/20 text-purple-400 px-1 rounded">P2P</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {(hostInst?.value || portInst?.value) && (
                                                        <div className="flex items-center gap-1.5 bg-signal/10 border border-signal/20 px-2 py-1 rounded font-mono text-xs">
                                                            <Globe2 size={11} className="text-signal/60" />
                                                            {hostInst?.value && <span className="text-signal font-bold">{hostInst.value}</span>}
                                                            {hostInst?.value && portInst?.value && <span className="text-gray-600">:</span>}
                                                            {portInst?.value && <span className="text-yellow-400 font-bold">{portInst.value}</span>}
                                                        </div>
                                                    )}
                                                    <span className={cn('text-xs px-2 py-0.5 rounded font-mono', isActive ? 'bg-matrix/20 text-matrix' : isWaiting ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400')}>
                                                        {isActive ? 'RUNNING' : isWaiting ? 'WAITING' : 'STOPPED'}
                                                    </span>
                                                </div>
                                            </div>
                                            {profileParams.length > 0 && (
                                                <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                                                    {profileParams.map((param, pi) => {
                                                        const isSensitive = SENSITIVE_PARAM_NAMES.has(param.c2profileparameter.name);
                                                        const isHostP = param.c2profileparameter.name === 'callback_host' || param.c2profileparameter.name === 'host';
                                                        const isPortP = param.c2profileparameter.name === 'callback_port' || param.c2profileparameter.name === 'port';
                                                        return (
                                                            <div key={pi} className="flex flex-col gap-0.5">
                                                                <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{param.c2profileparameter.name}</span>
                                                                {isHostP ? (
                                                                    <span className="text-signal font-bold font-mono text-xs break-all">{param.value || '—'}</span>
                                                                ) : isPortP ? (
                                                                    <span className="text-yellow-400 font-bold font-mono text-xs break-all">{param.value || '—'}</span>
                                                                ) : (
                                                                    <ParseParamValue value={param.value} parameterType={param.c2profileparameter.parameter_type} sensitive={isSensitive} />
                                                                )}
                                                                {param.enc_key_base64 && (
                                                                    <span className="text-[9px] font-mono text-gray-500">Enc: <span className="text-gray-400">{param.enc_key_base64.substring(0, 16)}…</span></span>
                                                                )}
                                                                {param.dec_key_base64 && (
                                                                    <span className="text-[9px] font-mono text-gray-500">Dec: <span className="text-gray-400">{param.dec_key_base64.substring(0, 16)}…</span></span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <span className="text-gray-500 text-sm">No C2 profiles configured</span>
                            )}
                        </div>
                    </div>

                    {/* Build Parameters */}
                    {payload.buildparameterinstances && payload.buildparameterinstances.length > 0 && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2">
                                <Settings size={12} /> Build Parameters
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                                {payload.buildparameterinstances.map((bp) => (
                                    <div key={bp.id} className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{bp.buildparameter.name}</span>
                                        {bp.buildparameter.description && (
                                            <span className="text-[9px] text-gray-600 font-mono">{bp.buildparameter.description}</span>
                                        )}
                                        <ParseParamValue value={bp.value} parameterType={bp.buildparameter.parameter_type} />
                                        {bp.enc_key_base64 && (
                                            <span className="text-[9px] font-mono text-gray-500">Enc: <span className="text-gray-400">{bp.enc_key_base64.substring(0, 16)}…</span></span>
                                        )}
                                        {bp.dec_key_base64 && (
                                            <span className="text-[9px] font-mono text-gray-500">Dec: <span className="text-gray-400">{bp.dec_key_base64.substring(0, 16)}…</span></span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Commands */}
                    {payload.payloadcommands && payload.payloadcommands.length > 0 && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2">
                                <Terminal size={12} /> Commands ({payload.payloadcommands.length})
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {[...payload.payloadcommands]
                                    .sort((a, b) => a.command.cmd.localeCompare(b.command.cmd))
                                    .map((pc) => {
                                        const cmdVer = pc.command.version;
                                        const loadedVer = pc.version;
                                        const isOutdated = cmdVer !== undefined && loadedVer !== undefined && cmdVer !== loadedVer;
                                        return (
                                            <div
                                                key={pc.id}
                                                title={isOutdated ? `Loaded: v${loadedVer}, Latest: v${cmdVer}` : `v${loadedVer}`}
                                                className={cn(
                                                    'flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono',
                                                    isOutdated
                                                        ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                                                        : 'bg-signal/10 border-signal/20 text-signal'
                                                )}
                                            >
                                                <span>{pc.command.cmd}</span>
                                                {loadedVer !== undefined && (
                                                    <span className={cn(
                                                        'text-[9px] px-1 rounded',
                                                        isOutdated ? 'bg-yellow-400/20 text-yellow-300' : 'bg-signal/20 text-signal/70'
                                                    )}>v{loadedVer}</span>
                                                )}
                                                {isOutdated && (
                                                    <span className="text-[9px] text-yellow-300/60">→v{cmdVer}</span>
                                                )}
                                                <a
                                                    href={`/docs/agents/${payload.payloadtype.name}/commands/${pc.command.cmd}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-ghost/40 hover:text-signal transition-colors"
                                                    title="Documentation"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <BookOpen size={9} />
                                                </a>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                            {payload.payloadcommands.some(pc => pc.command.version !== undefined && pc.version !== undefined && pc.command.version !== pc.version) && (
                                <p className="mt-2 text-[10px] text-yellow-400/70 font-mono">
                                    ⚠ Some commands are out of date. Use Add/Remove Commands to update.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Tags */}
                    {allTags.length > 0 && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-3">Tags</label>
                            <div className="flex flex-wrap gap-2">
                                {allTags.map((tag, idx) => (
                                    <span 
                                        key={idx}
                                        className="px-2 py-1 rounded text-xs font-mono"
                                        style={{ 
                                            backgroundColor: `${tag.tagtype?.color || '#666'}20`,
                                            borderColor: `${tag.tagtype?.color || '#666'}50`,
                                            color: tag.tagtype?.color || '#888',
                                            border: '1px solid'
                                        }}
                                    >
                                        {tag.tagtype?.name || 'Unknown'}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Build Message */}
                    {payload.build_message && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-2">Build Message / Stdout</label>
                            <pre className="p-3 bg-black/50 rounded border border-ghost/10 text-sm text-gray-300 font-mono overflow-x-auto max-h-40 cyber-scrollbar">
                                {payload.build_message}
                            </pre>
                        </div>
                    )}

                    {/* Build Errors */}
                    {payload.build_stderr && (
                        <div className="bg-red-500/5 p-4 rounded border border-red-500/30">
                            <label className="text-xs text-red-400 uppercase tracking-wider block mb-2">Build Errors</label>
                            <pre className="p-3 bg-black/50 rounded border border-red-500/20 text-sm text-red-400 font-mono overflow-x-auto max-h-40 cyber-scrollbar">
                                {payload.build_stderr}
                            </pre>
                        </div>
                    )}

                    {/* Build Steps */}
                    {payload.payload_build_steps && payload.payload_build_steps.length > 0 && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-3">Build Steps</label>
                            <div className="space-y-2">
                                {payload.payload_build_steps.map((step) => (
                                    <div 
                                        key={step.id}
                                        className={cn(
                                            "p-3 rounded border",
                                            step.step_success === true ? "bg-matrix/5 border-matrix/20" :
                                            step.step_success === false ? "bg-red-500/5 border-red-500/20" :
                                            "bg-ghost/5 border-ghost/20"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-ghost bg-ghost/10 px-2 py-0.5 rounded">#{step.step_number}</span>
                                                <span className="font-mono text-sm text-white">{step.step_name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {step.step_skip && <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">SKIPPED</span>}
                                                {step.step_success === true && <CheckCircle size={16} className="text-matrix" />}
                                                {step.step_success === false && <XCircle size={16} className="text-red-400" />}
                                            </div>
                                        </div>
                                        {step.step_description && (
                                            <p className="mt-1 text-[10px] text-gray-500 font-mono">{step.step_description}</p>
                                        )}
                                        {step.step_stdout && (
                                            <pre className="mt-2 text-xs text-gray-400 overflow-x-auto bg-black/30 p-2 rounded">{step.step_stdout}</pre>
                                        )}
                                        {step.step_stderr && (
                                            <pre className="mt-2 text-xs text-red-400 overflow-x-auto bg-red-500/5 p-2 rounded">{step.step_stderr}</pre>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Wrapped Payload + Eventing Origin */}
                    {(payload.wrapped_payload_id || payload.eventstepinstance) && (
                        <div className="bg-black/30 p-4 rounded border border-ghost/20">
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2">
                                <Link2 size={12} /> Origin
                            </label>
                            <div className="flex flex-col gap-2">
                                {payload.wrapped_payload_id && (
                                    <div className="flex flex-col gap-1 text-xs font-mono">
                                        <span className="text-gray-500">Wraps Payload:</span>
                                        <WrappedPayloadInfo payloadId={payload.wrapped_payload_id} />
                                    </div>
                                )}
                                {payload.eventstepinstance && (
                                    <div className="flex items-center gap-2 text-xs font-mono">
                                        <span className="text-gray-500">Triggered by Event:</span>
                                        <a
                                            href={`/new/eventing?eventgroup=${payload.eventstepinstance.eventgroupinstance.eventgroup.id}&eventgroupinstance=${payload.eventstepinstance.eventgroupinstance.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-signal hover:text-signal/80 transition-colors"
                                        >
                                            <PlayCircle size={11} />
                                            <span className="font-bold">{payload.eventstepinstance.eventgroupinstance.eventgroup.name}</span>
                                            <span className="text-gray-500">/ {payload.eventstepinstance.eventstep.name}</span>
                                            <ExternalLink size={9} className="text-ghost/50" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3">Metadata</label>
                        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                            <div>
                                <span className="text-gray-500">Payload ID:</span>
                                <span className="text-gray-300 ml-2">{payload.id}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Auto Generated:</span>
                                <span className={cn("ml-2", payload.auto_generated ? "text-yellow-400" : "text-gray-300")}>
                                    {payload.auto_generated ? 'Yes' : 'No'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500">Deleted:</span>
                                <span className={cn("ml-2", payload.deleted ? "text-red-400" : "text-gray-300")}>
                                    {payload.deleted ? 'Yes' : 'No'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500">Type Version:</span>
                                <span className="text-gray-300 ml-2">{payload.payload_type_semver}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Footer */}
                <div className="p-4 border-t border-ghost/30 flex justify-end shrink-0 bg-void">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-ghost/20 hover:bg-ghost/30 text-white rounded transition-colors font-mono"
                    >
                        Close
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
