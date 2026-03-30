import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import {
    Download,
    Upload,
    Image,
    Eye,
    Clock,
    Copy,
    RefreshCw,
    ChevronDown,
    Monitor,
    ZoomIn,
    ZoomOut,
    Link2,
    ChevronRight,
    ChevronLeft,
    FileText,
    HardDrive,
    ChevronUp,
    CheckCircle2,
    Server,
    XCircle,
}from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatBytes, b64DecodeUnicode } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { GET_MYTHIC_DOWNLOADS, GET_MYTHIC_UPLOADS, GET_MYTHIC_SCREENSHOTS } from '../../lib/api';
import type { FileMeta } from '../../types/files';

export const MythicServerFiles = ({ 
    subTab, 
    setSubTab 
}: { 
    subTab: 'downloads' | 'uploads' | 'screenshots', 
    setSubTab: (tab: 'downloads' | 'uploads' | 'screenshots') => void 
}) => {
    const [previewFile, setPreviewFile] = useState<FileMeta | null>(null);
    
    const { data: downloadsData, loading: downloadsLoading, refetch: refetchDownloads } = useQuery(GET_MYTHIC_DOWNLOADS, {
        skip: subTab !== 'downloads',
        pollInterval: 15000
    });

    const { data: uploadsData, loading: uploadsLoading, refetch: refetchUploads } = useQuery(GET_MYTHIC_UPLOADS, {
        skip: subTab !== 'uploads',
        pollInterval: 15000
    });

    const { data: screenshotsData, loading: screenshotsLoading, refetch: refetchScreenshots } = useQuery(GET_MYTHIC_SCREENSHOTS, {
        skip: subTab !== 'screenshots',
        pollInterval: 15000
    });

    const handleRefresh = () => {
        if (subTab === 'downloads') refetchDownloads();
        else if (subTab === 'uploads') refetchUploads();
        else refetchScreenshots();
    };

    const getCurrentData = () => {
        if (subTab === 'downloads') return { data: downloadsData?.filemeta || [], loading: downloadsLoading };
        if (subTab === 'uploads') return { data: uploadsData?.filemeta || [], loading: uploadsLoading };
        return { data: screenshotsData?.filemeta || [], loading: screenshotsLoading };
    };

    const { data: files, loading } = getCurrentData();

    return (
        <div className="flex flex-col h-full relative">
            {/* Sub-tabs */}
            <div className="flex items-center border-b border-ghost/30 bg-black/20 px-2">
                <button
                    onClick={() => setSubTab('downloads')}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono transition-colors",
                        subTab === 'downloads' ? "text-blue-400 border-b border-blue-400" : "text-gray-500 hover:text-white"
                    )}
                >
                    <Download size={12} />
                    DOWNLOADS
                </button>
                <button
                    onClick={() => setSubTab('uploads')}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono transition-colors",
                        subTab === 'uploads' ? "text-green-400 border-b border-green-400" : "text-gray-500 hover:text-white"
                    )}
                >
                    <Upload size={12} />
                    UPLOADS
                </button>
                <button
                    onClick={() => setSubTab('screenshots')}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono transition-colors",
                        subTab === 'screenshots' ? "text-purple-400 border-b border-purple-400" : "text-gray-500 hover:text-white"
                    )}
                >
                    <Image size={12} />
                    SCREENSHOTS
                </button>

                <div className="flex-1" />
                <button
                    onClick={handleRefresh}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                    title="Refresh"
                >
                    <RefreshCw size={12} />
                </button>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500 font-mono text-xs">
                        LOADING_FILES...
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 font-mono text-xs">
                        <FileText size={32} className="mb-2 opacity-30" />
                        <span>NO_{subTab.toUpperCase()}_FOUND</span>
                    </div>
                ) : subTab === 'screenshots' ? (
                    <ScreenshotGrid files={files} onPreview={setPreviewFile} />
                ) : subTab === 'uploads' ? (
                    <UploadsView files={files} onPreview={setPreviewFile} />
                ) : (
                    <FileMetaList files={files} type={subTab} onPreview={setPreviewFile} />
                )}
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {previewFile && (
                    <FilePreviewModal 
                        file={previewFile} 
                        onClose={() => setPreviewFile(null)}
                        allFiles={subTab === 'screenshots' ? files : undefined}
                        onNavigate={subTab === 'screenshots' ? setPreviewFile : undefined}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// File list for downloads/uploads
export const FileMetaList = ({ files, type, onPreview }: { files: FileMeta[], type: 'downloads' | 'uploads', onPreview: (file: FileMeta) => void }) => {
    const handleDownloadFile = (file: FileMeta) => {
        if (file.agent_file_id) {
            window.open(`/direct/download/${file.agent_file_id}`, '_blank');
        }
    };

    return (
        <div className="divide-y divide-white/5">
            {files.map((file) => (
                <div
                    key={file.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors group"
                >
                    <div className={cn(
                        "p-2 rounded",
                        type === 'downloads' ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400"
                    )}>
                        {type === 'downloads' ? <Download size={14} /> : <Upload size={14} />}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-white truncate" title={b64DecodeUnicode(file.filename_text)}>
                                {b64DecodeUnicode(file.filename_text) || 'unnamed'}
                            </span>
                            {!file.complete && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                                    {Math.round((file.chunks_received / file.total_chunks) * 100)}%
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
                            {file.host && (
                                <span className="flex items-center gap-1">
                                    <Monitor size={10} />
                                    {file.host}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <HardDrive size={10} />
                                {formatBytes(file.size)}
                            </span>
                            {file.task && (
                                <span className="flex items-center gap-1">
                                    <Link2 size={10} />
                                    Task #{file.task.display_id}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(file.timestamp).toLocaleString()}
                            </span>
                        </div>
                        {file.full_remote_path_text && (
                            <div className="text-[9px] text-gray-600 truncate mt-0.5" title={b64DecodeUnicode(file.full_remote_path_text)}>
                                {b64DecodeUnicode(file.full_remote_path_text)}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {file.complete && (
                            <button
                                onClick={() => handleDownloadFile(file)}
                                className="p-1.5 hover:bg-white/10 rounded text-blue-400 hover:text-white"
                                title="Download from Mythic"
                            >
                                <Download size={14} />
                            </button>
                        )}
                        <button
                            onClick={() => onPreview(file)}
                            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                            title="View Details"
                        >
                            <Eye size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── Uploads view: table with host-grouped sections ───────────────────────
export const UploadsView = ({ files, onPreview }: { files: FileMeta[]; onPreview: (f: FileMeta) => void }) => {
    const [expandedHosts, setExpandedHosts] = useState<Set<string>>(() => new Set(['__staged__']));
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [sortKey, setSortKey] = useState<'timestamp' | 'filename_text' | 'size'>('timestamp');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const handleDownload = (file: FileMeta) => {
        if (file.agent_file_id) window.open(`/direct/download/${file.agent_file_id}`, '_blank');
    };
    const toggleHost = (h: string) => setExpandedHosts(prev => {
        const next = new Set(prev);
        next.has(h) ? next.delete(h) : next.add(h);
        return next;
    });
    const toggleSort = (k: typeof sortKey) => {
        if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(k); setSortDir('desc'); }
    };
    const sortFiles = (arr: FileMeta[]) => arr.slice().sort((a, b) => {
        let va: string | number = '';
        let vb: string | number = '';
        if (sortKey === 'timestamp')     { va = a.timestamp; vb = b.timestamp; }
        else if (sortKey === 'size')     { va = a.size; vb = b.size; }
        else if (sortKey === 'filename_text') { va = b64DecodeUnicode(a.filename_text).toLowerCase(); vb = b64DecodeUnicode(b.filename_text).toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const toggleSelectFile = (id: number) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectGroup = (groupFiles: FileMeta[]) => {
        const ids = groupFiles.map(f => f.id);
        const allSelected = ids.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Set(prev);
            if (allSelected) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    };

    const staged   = files.filter(f => !f.host);
    const deployed = files.filter(f => !!f.host);
    const byHost = deployed.reduce<Record<string, FileMeta[]>>((acc, f) => {
        (acc[f.host] ??= []).push(f);
        return acc;
    }, {});
    const sortedHosts = Object.keys(byHost).sort((a, b) => a.localeCompare(b));

    const SortIcon = ({ k }: { k: typeof sortKey }) =>
        sortKey === k ? (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />) : null;

    const FileRow = ({ file }: { file: FileMeta }) => {
        const isSelected = selected.has(file.id);
        const remotePath = file.full_remote_path_text ? b64DecodeUnicode(file.full_remote_path_text) : null;
        const filename   = b64DecodeUnicode(file.filename_text) || 'unnamed';
        const pct = file.total_chunks > 0 ? Math.round((file.chunks_received / file.total_chunks) * 100) : 0;
        return (
            <tr className={cn("group hover:bg-white/5 transition-colors", isSelected && "bg-signal/5")}>
                {/* Checkbox */}
                <td className="pl-3 pr-1 py-2 w-7" onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectFile(file.id)}
                        className="rounded bg-black/40 border-white/20 cursor-pointer"
                    />
                </td>
                {/* Filename + remote path */}
                <td className="px-2 py-2 max-w-0">
                    <div className="flex items-start gap-1.5">
                        <FileText size={13} className="text-green-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <div className="font-mono text-xs text-white truncate" title={filename}>{filename}</div>
                            {remotePath && (
                                <div className="text-[9px] text-gray-600 font-mono truncate mt-0.5" title={remotePath}>
                                    {remotePath}
                                </div>
                            )}
                        </div>
                    </div>
                </td>
                {/* Host */}
                <td className="px-2 py-2 w-32">
                    {file.host ? (
                        <span className="text-[10px] font-mono text-signal/80">{file.host}</span>
                    ) : (
                        <span className="text-[10px] text-gray-600">—</span>
                    )}
                </td>
                {/* Size */}
                <td className="px-2 py-2 w-24 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                    {formatBytes(file.size)}
                </td>
                {/* Status */}
                <td className="px-2 py-2 w-24">
                    {file.complete ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <CheckCircle2 size={10} /> Complete
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                            <RefreshCw size={9} className="animate-spin" />
                            {pct}%
                        </span>
                    )}
                </td>
                {/* Time */}
                <td className="px-2 py-2 w-28 font-mono text-[10px] text-gray-500 whitespace-nowrap">
                    {(() => {
                        const d = new Date(file.timestamp);
                        const diff = Date.now() - d.getTime();
                        const mins = Math.floor(diff / 60000);
                        const hrs  = Math.floor(diff / 3600000);
                        const days = Math.floor(diff / 86400000);
                        if (mins < 60)  return `${mins}m ago`;
                        if (hrs < 24)   return `${hrs}h ago`;
                        return `${days}d ago`;
                    })()}
                </td>
                {/* Actions */}
                <td className="pr-2 py-2 w-24">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {file.complete && (
                            <button
                                onClick={() => handleDownload(file)}
                                className="p-1.5 hover:bg-white/10 rounded text-blue-400 hover:text-white"
                                title="Download from Mythic server"
                            >
                                <Download size={13} />
                            </button>
                        )}
                        <button
                            onClick={() => onPreview(file)}
                            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                            title="View details"
                        >
                            <Eye size={13} />
                        </button>
                        <button
                            onClick={() => { navigator.clipboard.writeText(file.agent_file_id); snackActions.success('Copied'); }}
                            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                            title="Copy file ID"
                        >
                            <Copy size={13} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    const GroupHeader = ({ groupKey, label, icon, groupFiles, accent }: {
        groupKey: string; label: string; icon: React.ReactNode;
        groupFiles: FileMeta[]; accent: string;
    }) => {
        const isOpen = expandedHosts.has(groupKey);
        const allSel = groupFiles.length > 0 && groupFiles.every(f => selected.has(f.id));
        const latest = groupFiles.reduce((t, f) => f.timestamp > t ? f.timestamp : t, '');
        return (
            <tr
                className="bg-black/40 cursor-pointer hover:bg-white/5 transition-colors select-none"
                onClick={() => toggleHost(groupKey)}
            >
                <td className="pl-3 pr-1 py-1.5" onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={allSel}
                        onChange={() => toggleSelectGroup(groupFiles)}
                        className="rounded bg-black/40 border-white/20 cursor-pointer"
                    />
                </td>
                <td colSpan={5} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown size={10} className="text-gray-500 shrink-0" /> : <ChevronRight size={10} className="text-gray-500 shrink-0" />}
                        <span className={cn("shrink-0", accent)}>{icon}</span>
                        <span className={cn("text-[10px] font-mono uppercase tracking-widest", accent)}>{label}</span>
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono ml-1", accent === 'text-green-400' ? 'bg-green-500/15 text-green-400' : 'bg-gray-600/25 text-gray-400')}>
                            {groupFiles.length}
                        </span>
                        {latest && (
                            <span className="text-[9px] font-mono text-gray-600 ml-auto pr-1">
                                {new Date(latest).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </td>
                <td />
            </tr>
        );
    };

    if (files.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 font-mono text-xs">
                <Upload size={28} className="mb-2 opacity-20" />
                <span>NO_UPLOADS_FOUND</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Bulk toolbar */}
            {selected.size > 0 && (
                <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-signal/5 font-mono">
                    <span className="text-[10px] text-signal">{selected.size} selected</span>
                    <button
                        onClick={() => {
                            files.filter(f => selected.has(f.id) && f.complete)
                                .forEach(f => window.open(`/direct/download/${f.agent_file_id}`, '_blank'));
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                    >
                        <Download size={10} /> Download all
                    </button>
                    <button
                        onClick={() => setSelected(new Set())}
                        className="ml-auto text-[10px] text-gray-500 hover:text-white transition-colors"
                    >
                        Clear
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                    {/* Sticky header */}
                    <thead className="sticky top-0 z-10 bg-black/80 backdrop-blur-sm">
                        <tr className="font-mono text-[10px] text-gray-500 border-b border-white/10 select-none">
                            <th className="pl-3 pr-1 py-2 w-7">
                                <input
                                    type="checkbox"
                                    checked={files.length > 0 && files.every(f => selected.has(f.id))}
                                    onChange={() => {
                                        if (files.every(f => selected.has(f.id))) setSelected(new Set());
                                        else setSelected(new Set(files.map(f => f.id)));
                                    }}
                                    className="rounded bg-black/40 border-white/20 cursor-pointer"
                                />
                            </th>
                            <th className="px-2 py-2 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('filename_text')}>
                                <span className="flex items-center gap-1">FILENAME <SortIcon k="filename_text" /></span>
                            </th>
                            <th className="px-2 py-2 text-left w-32">HOST</th>
                            <th className="px-2 py-2 text-left w-24 cursor-pointer hover:text-white" onClick={() => toggleSort('size')}>
                                <span className="flex items-center gap-1">SIZE <SortIcon k="size" /></span>
                            </th>
                            <th className="px-2 py-2 text-left w-24">STATUS</th>
                            <th className="px-2 py-2 text-left w-28 cursor-pointer hover:text-white" onClick={() => toggleSort('timestamp')}>
                                <span className="flex items-center gap-1">TIME <SortIcon k="timestamp" /></span>
                            </th>
                            <th className="pr-2 py-2 text-left w-24">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {/* ── Staged (server only) ─────────────────── */}
                        {staged.length > 0 && (
                            <>
                                <GroupHeader
                                    groupKey="__staged__"
                                    label="Staged — Server Only"
                                    icon={<Server size={10} />}
                                    groupFiles={staged}
                                    accent="text-gray-400"
                                />
                                {expandedHosts.has('__staged__') &&
                                    sortFiles(staged).map(f => <FileRow key={f.id} file={f} />)}
                            </>
                        )}

                        {/* ── Per-host sections ────────────────────── */}
                        {sortedHosts.map(host => (
                            <React.Fragment key={host}>
                                <GroupHeader
                                    groupKey={host}
                                    label={host}
                                    icon={<Monitor size={10} />}
                                    groupFiles={byHost[host]}
                                    accent="text-green-400"
                                />
                                {expandedHosts.has(host) &&
                                    sortFiles(byHost[host]).map(f => <FileRow key={f.id} file={f} />)}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Screenshot grid
export const ScreenshotGrid = ({ files, onPreview }: { files: FileMeta[], onPreview: (file: FileMeta) => void }) => {
    return (
        <div className="grid grid-cols-3 gap-2 p-2">
            {files.map((file) => (
                <div
                    key={file.id}
                    onClick={() => onPreview(file)}
                    className="relative aspect-video bg-black/40 rounded border border-ghost/30 overflow-hidden group cursor-pointer hover:border-purple-500/50 transition-colors"
                >
                    <img
                        src={`/direct/download/${file.agent_file_id}`}
                        alt={b64DecodeUnicode(file.filename_text)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye size={24} className="text-white" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/80 text-[9px] font-mono">
                        <div className="flex items-center gap-1 text-gray-400 truncate">
                            <Monitor size={10} />
                            {file.host}
                        </div>
                        <div className="text-gray-500 truncate">
                            {new Date(file.timestamp).toLocaleString()}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// File Preview Modal
export const FilePreviewModal = ({ file, onClose, allFiles, onNavigate }: { file: FileMeta, onClose: () => void, allFiles?: FileMeta[], onNavigate?: (file: FileMeta) => void }) => {
    const [zoom, setZoom] = useState(false);
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success('Copied to clipboard');
    };

    const isScreenshot = file.is_screenshot;
    const currentIdx = allFiles ? allFiles.findIndex(f => f.id === file.id) : -1;
    const canPrev = currentIdx > 0;
    const canNext = allFiles ? currentIdx < allFiles.length - 1 : false;
    const handlePrev = () => { if (canPrev && allFiles && onNavigate) onNavigate(allFiles[currentIdx - 1]); setZoom(false); };
    const handleNext = () => { if (canNext && allFiles && onNavigate) onNavigate(allFiles[currentIdx + 1]); setZoom(false); };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-white/20 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText size={20} className="text-signal" />
                        <div>
                            <h3 className="font-mono text-sm text-white">{b64DecodeUnicode(file.filename_text) || 'Unnamed File'}</h3>
                            <p className="text-[10px] text-gray-500">{file.agent_file_id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <XCircle size={20} className="text-gray-400" />
                    </button>
                </div>

                {/* Screenshot Preview with stepper */}
                {isScreenshot && (
                    <div className="relative bg-black/40">
                        <div className={cn("p-4 flex items-start justify-center", zoom ? "overflow-auto" : "")}>
                            <img 
                                src={`/direct/download/${file.agent_file_id}`}
                                alt={b64DecodeUnicode(file.filename_text)}
                                className={cn(
                                    "rounded border border-white/10 transition-all",
                                    zoom ? "max-w-none cursor-zoom-out" : "max-w-full cursor-zoom-in"
                                )}
                                onClick={() => setZoom(z => !z)}
                            />
                        </div>
                        {/* Stepper navigation */}
                        {allFiles && allFiles.length > 1 && (
                            <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-black/60">
                                <button
                                    onClick={handlePrev}
                                    disabled={!canPrev}
                                    className={cn("flex items-center gap-1 px-3 py-1 text-xs font-mono rounded border transition-colors", canPrev ? "border-signal/30 text-signal hover:bg-signal/10" : "border-gray-800 text-gray-700 cursor-not-allowed")}
                                >
                                    <ChevronLeft size={14} /> PREV
                                </button>
                                <span className="text-[10px] font-mono text-gray-500">
                                    {currentIdx + 1} / {allFiles.length}
                                </span>
                                <button
                                    onClick={handleNext}
                                    disabled={!canNext}
                                    className={cn("flex items-center gap-1 px-3 py-1 text-xs font-mono rounded border transition-colors", canNext ? "border-signal/30 text-signal hover:bg-signal/10" : "border-gray-800 text-gray-700 cursor-not-allowed")}
                                >
                                    NEXT <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                        {/* Zoom toggle */}
                        <button
                            onClick={() => setZoom(z => !z)}
                            className="absolute top-2 right-2 p-1.5 bg-black/70 border border-white/10 rounded text-gray-400 hover:text-white transition-colors"
                            title={zoom ? "Zoom out" : "Zoom in"}
                        >
                            {zoom ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
                        </button>
                    </div>
                )}

                {/* Details */}
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                            <label className="text-gray-500 text-[10px]">HOST</label>
                            <p className="text-white font-mono">{file.host || '-'}</p>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px]">SIZE</label>
                            <p className="text-white font-mono">{formatBytes(file.size)}</p>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px]">TIMESTAMP</label>
                            <p className="text-white font-mono">{new Date(file.timestamp).toLocaleString()}</p>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px]">STATUS</label>
                            <p className={file.complete ? "text-green-400" : "text-yellow-400"}>
                                {file.complete ? 'Complete' : `${file.chunks_received}/${file.total_chunks} chunks`}
                            </p>
                        </div>
                        {file.md5 && (
                            <div className="col-span-2">
                                <label className="text-gray-500 text-[10px]">MD5</label>
                                <div className="flex items-center gap-2">
                                    <p className="text-white font-mono text-[10px] break-all">{file.md5}</p>
                                    <button onClick={() => copyToClipboard(file.md5)} className="p-1 hover:bg-white/10 rounded">
                                        <Copy size={10} className="text-gray-400" />
                                    </button>
                                </div>
                            </div>
                        )}
                        {file.sha1 && (
                            <div className="col-span-2">
                                <label className="text-gray-500 text-[10px]">SHA1</label>
                                <div className="flex items-center gap-2">
                                    <p className="text-white font-mono text-[10px] break-all">{file.sha1}</p>
                                    <button onClick={() => copyToClipboard(file.sha1)} className="p-1 hover:bg-white/10 rounded">
                                        <Copy size={10} className="text-gray-400" />
                                    </button>
                                </div>
                            </div>
                        )}
                        {file.full_remote_path_text && (
                            <div className="col-span-2">
                                <label className="text-gray-500 text-[10px]">REMOTE PATH</label>
                                <p className="text-white font-mono text-[10px] break-all">{b64DecodeUnicode(file.full_remote_path_text)}</p>
                            </div>
                        )}
                        {file.comment && (
                            <div className="col-span-2">
                                <label className="text-gray-500 text-[10px]">COMMENT</label>
                                <p className="text-gray-300 text-sm">{file.comment}</p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-white/10">
                        {file.complete && (
                            <a
                                href={`/direct/download/${file.agent_file_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-xs hover:bg-blue-500/30 transition-colors"
                            >
                                <Download size={14} />
                                Download
                            </a>
                        )}
                        <button
                            onClick={() => copyToClipboard(file.agent_file_id)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded text-xs hover:bg-white/20 transition-colors"
                        >
                            <Copy size={14} />
                            Copy File ID
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
