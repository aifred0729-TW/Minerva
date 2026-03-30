import React, { useState } from 'react';
import {
    Download,
    Upload,
    Trash2,
    Eye,
    Copy,
    CheckCircle,
    Tag,
    Hash,
    MessageSquare,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Search,
    Edit2,
    X,
    Globe,
    Clock,
    FileText,
    Zap,
    Fingerprint,
    Monitor,
    EyeOff,
    ChevronLeft,
    Archive,
    Network,
    Wifi,
    WifiOff,
    HardDrive,
    User,
    Server,
}from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import type { FileTag, FileMeta, MachineInfo } from '../../types/files';
import { formatBytes, formatTimeAgo, b64DecodeUnicode } from './utils';

export const ConfirmDeleteDialog = ({
    filename, onConfirm, onCancel,
}: {
    filename: string; onConfirm: () => void; onCancel: () => void;
}) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={onCancel}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[#0b0f17] border border-red-500/30 rounded-lg p-5 max-w-sm w-full space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
                <Trash2 size={15} className="text-red-400 shrink-0" />
                <h3 className="text-white font-semibold text-sm">Delete File?</h3>
            </div>
            <p className="text-gray-400 text-xs font-mono break-all">
                {filename}
            </p>
            <p className="text-gray-500 text-[10px]">This action cannot be undone.</p>
            <div className="flex gap-2.5 pt-1">
                <button onClick={onConfirm}
                    className="flex-1 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-mono hover:bg-red-500/30 transition-colors">
                    DELETE
                </button>
                <button onClick={onCancel}
                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors">
                    CANCEL
                </button>
            </div>
        </motion.div>
    </motion.div>
);

// ── TagsDisplay ──────────────────────────────
export const TagsDisplay = ({ tags }: { tags?: FileTag[] }) => {
    if (!tags || tags.length === 0) return <span className="text-gray-700 text-[9px]">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {tags.map(t => (
                <span
                    key={t.id}
                    className="px-1 py-0.5 rounded text-[9px] font-mono"
                    style={{
                        background: (t.tagtype?.color || '#666') + '30',
                        color: t.tagtype?.color || '#aaa',
                        border: `1px solid ${(t.tagtype?.color || '#666')}60`,
                    }}
                >
                    {t.tagtype?.name || 'tag'}
                </span>
            ))}
        </div>
    );
};

// ── CommentCell ───────────────────────────────
export const CommentCell = ({ comment, fileId, onSave }: { comment: string; fileId: number; onSave: (id: number, c: string) => void }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(comment);

    const handleSave = () => {
        onSave(fileId, value);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setValue(comment); setEditing(false); } }}
                    className="flex-1 bg-black/60 border border-signal/40 rounded px-1.5 py-0.5 text-[10px] text-white font-mono min-w-0"
                    style={{ minWidth: 80 }}
                />
                <button onClick={handleSave} className="text-green-400 hover:text-green-300 p-0.5"><CheckCircle size={11} /></button>
                <button onClick={() => { setValue(comment); setEditing(false); }} className="text-gray-500 hover:text-gray-300 p-0.5"><X size={11} /></button>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1 group/comment cursor-pointer" onClick={e => { e.stopPropagation(); setEditing(true); }}>
            <span className="text-gray-400 text-[10px] truncate max-w-[100px]" title={comment}>{comment || <span className="text-gray-700">—</span>}</span>
            <Edit2 size={9} className="text-gray-700 group-hover/comment:text-gray-400 shrink-0 transition-colors" />
        </div>
    );
};

// ── ExpandedRowDetails ────────────────────────
export const ExpandedRowDetails = ({
    file, colSpan, onCopy, onHostFile, showUTC,
}: {
    file: FileMeta; colSpan: number;
    onCopy: (s: string) => void;
    onHostFile?: (f: FileMeta) => void;
    showUTC?: boolean;
}) => {
    const displayTime = (ts: string) => {
        if (!ts) return '—';
        return showUTC
            ? new Date(ts).toISOString().replace('T', ' ').substring(0, 19) + ' Z'
            : new Date(ts).toLocaleString();
    };
    return (
    <tr>
        <td colSpan={colSpan} className="px-4 pb-3">
            <div className="bg-black/40 border border-white/10 rounded p-3 text-[10px] space-y-2">
                {/* Hash/UUID row */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <span className="text-gray-600 block">MD5</span>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-300 font-mono break-all">{file.md5 || '—'}</span>
                            {file.md5 && <button onClick={() => onCopy(file.md5)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={9}/></button>}
                        </div>
                    </div>
                    <div>
                        <span className="text-gray-600 block">SHA1</span>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-300 font-mono break-all">{file.sha1 || '—'}</span>
                            {file.sha1 && <button onClick={() => onCopy(file.sha1)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={9}/></button>}
                        </div>
                    </div>
                    <div>
                        <span className="text-gray-600 block">UUID</span>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-300 font-mono break-all">{file.agent_file_id}</span>
                            <button onClick={() => onCopy(file.agent_file_id)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={9}/></button>
                        </div>
                    </div>
                </div>

                {/* Operator / Task / Command / Time */}
                <div className="grid grid-cols-4 gap-4 pt-1 border-t border-white/5">
                    <div>
                        <span className="text-gray-600 block">Operator</span>
                        <span className="text-gray-300">{file.operator?.username || '—'}</span>
                    </div>
                    <div>
                        <span className="text-gray-600 block">Task</span>
                        {file.task ? (
                            <div className="flex flex-col gap-0.5">
                                <a href={`/new/callbacks/${file.task.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                    C-{file.task.callback?.display_id}
                                </a>
                                <a href={`/new/task/${file.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                    T-{file.task.display_id}
                                </a>
                                {file.task.comment && <span className="text-gray-500 italic">{file.task.comment}</span>}
                            </div>
                        ) : <span className="text-gray-700">—</span>}
                    </div>
                    <div>
                        <span className="text-gray-600 block">Command</span>
                        <span className="text-gray-300 font-mono">{file.task?.command?.cmd || '—'}</span>
                    </div>
                    <div>
                        <span className="text-gray-600 block">Timestamp</span>
                        <span className="text-gray-300">{displayTime(file.timestamp)}</span>
                    </div>
                </div>

                {/* Groups */}
                {file.task?.callback?.mythictree_groups && file.task.callback.mythictree_groups.length > 0 &&
                    !file.task.callback.mythictree_groups.every(g => g === 'Default') && (
                    <div className="pt-1 border-t border-white/5">
                        <span className="text-gray-600">Callback Groups: </span>
                        <span className="text-gray-300">{file.task.callback.mythictree_groups.join(', ')}</span>
                    </div>
                )}

                {/* Eventing workflow — clickable link */}
                {file.eventgroup && (
                    <div className="pt-1 border-t border-white/5 flex items-center gap-2">
                        <Zap size={10} className="text-yellow-400" />
                        <span className="text-gray-600">Eventing Workflow: </span>
                        <a href={`/new/eventing?eventgroup=${file.eventgroup.id}`} target="_blank" rel="noopener noreferrer"
                            className="text-yellow-300 hover:underline hover:text-yellow-200">
                            {file.eventgroup.name}
                        </a>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-1 border-t border-white/5 flex items-center flex-wrap gap-2">
                    {file.complete && (
                        <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/25 transition-colors">
                            <Download size={10} /> Download
                        </a>
                    )}
                    {onHostFile && (
                        <button onClick={() => onHostFile(file)}
                            className="flex items-center gap-1 px-2 py-1 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/25 transition-colors">
                            <Globe size={10} /> Host via C2
                        </button>
                    )}
                </div>

                {/* copy_of_file — full details matching OldReactUI */}
                {file.copy_of_file && (
                    <div className="pt-2 border-t border-blue-500/20">
                        <p className="text-blue-400 text-[9px] font-mono mb-2">
                            {b64DecodeUnicode(file.filename_text)} is a copy of the following file:
                        </p>
                        <div className="bg-blue-500/5 border border-blue-500/15 rounded p-2 space-y-2">
                            {/* Identifiers row */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <span className="text-gray-600 block">MD5</span>
                                    <span className="text-gray-300 font-mono break-all text-[9px]">{file.copy_of_file.md5 || '—'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block">SHA1</span>
                                    <span className="text-gray-300 font-mono break-all text-[9px]">{file.copy_of_file.sha1 || '—'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block">UUID</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-gray-300 font-mono break-all text-[9px]">{file.copy_of_file.agent_file_id}</span>
                                        <button onClick={() => onCopy(file.copy_of_file!.agent_file_id)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={8}/></button>
                                    </div>
                                </div>
                            </div>
                            {/* Destination / Task / Timestamp / Command row */}
                            <div className="grid grid-cols-4 gap-4 pt-1 border-t border-blue-500/10">
                                <div>
                                    <span className="text-gray-600 block">Destination</span>
                                    {file.copy_of_file.host && <p className="text-gray-400 text-[9px]"><b>Host:</b> {file.copy_of_file.host}</p>}
                                    {file.copy_of_file.task?.callback?.mythictree_groups &&
                                        file.copy_of_file.task.callback.mythictree_groups.length > 0 &&
                                        !file.copy_of_file.task.callback.mythictree_groups.every((g: string) => g === 'Default') && (
                                        <p className="text-gray-500 text-[9px]">Groups: {file.copy_of_file.task.callback.mythictree_groups.join(', ')}</p>
                                    )}
                                    {(() => {
                                        const p = b64DecodeUnicode(file.copy_of_file!.full_remote_path_text);
                                        if (!p) return null;
                                        return file.copy_of_file!.deleted ? (
                                            <p className="text-gray-500 text-[9px] break-all">{p}</p>
                                        ) : file.copy_of_file!.complete ? (
                                            <a href={`/direct/download/${file.copy_of_file!.agent_file_id}`} className="text-blue-400 hover:underline text-[9px] break-all">{p}</a>
                                        ) : (
                                            <p className="text-gray-400 text-[9px] break-all">{p} <span className="text-yellow-500">({file.copy_of_file!.chunks_received}/{file.copy_of_file!.total_chunks})</span></p>
                                        );
                                    })()}
                                </div>
                                <div>
                                    <span className="text-gray-600 block">Task</span>
                                    {file.copy_of_file.task ? (
                                        <div className="flex flex-col gap-0.5">
                                            <a href={`/new/callbacks/${file.copy_of_file.task.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-[9px]">C-{file.copy_of_file.task.callback?.display_id}</a>
                                            <a href={`/new/task/${file.copy_of_file.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-[9px]">T-{file.copy_of_file.task.display_id}</a>
                                            {file.copy_of_file.task.comment && <span className="text-gray-500 italic text-[9px]">{file.copy_of_file.task.comment}</span>}
                                        </div>
                                    ) : <span className="text-gray-700">—</span>}
                                </div>
                                <div>
                                    <span className="text-gray-600 block">Timestamp</span>
                                    <span className="text-gray-300 text-[9px]">{displayTime(file.copy_of_file.timestamp)}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block">Command</span>
                                    <span className="text-gray-300 font-mono text-[9px]">{file.copy_of_file.task?.command?.cmd || '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </td>
    </tr>
    );
};

// ── SearchFilterBar ───────────────────────────
export const SearchFilterBar = ({
    searchQuery, onSearchChange,
    hostFilter, onHostFilterChange,
    searchField, onSearchFieldChange,
    showDeleted, onToggleDeleted,
    showUTC, onToggleUTC,
    totalCount, pageSize, currentPage, onPageChange,
}: {
    searchQuery: string; onSearchChange: (v: string) => void;
    hostFilter: string; onHostFilterChange: (v: string) => void;
    searchField: 'filename' | 'hash' | 'comment' | 'uuid' | 'tag'; onSearchFieldChange: (v: 'filename' | 'hash' | 'comment' | 'uuid' | 'tag') => void;
    showDeleted: boolean; onToggleDeleted: () => void;
    showUTC: boolean; onToggleUTC: () => void;
    totalCount: number; pageSize: number; currentPage: number; onPageChange: (p: number) => void;
}) => {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const fieldIcons: Record<string, React.ReactNode> = {
        filename: <FileText size={11}/>, hash: <Fingerprint size={11}/>,
        comment: <MessageSquare size={11}/>, uuid: <Hash size={11}/>,
        tag: <Tag size={11}/>,
    };
    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-black/30 border-b border-white/10 shrink-0 flex-wrap">
            {/* Search type */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded overflow-hidden">
                {(['filename', 'hash', 'comment', 'uuid', 'tag'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => onSearchFieldChange(f)}
                        title={f}
                        className={cn(
                            "px-2 py-1.5 text-[10px] font-mono flex items-center gap-1 transition-colors",
                            searchField === f ? "bg-signal/20 text-signal" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        {fieldIcons[f]}
                    </button>
                ))}
            </div>
            {/* Search */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-2 py-1">
                <Search size={11} className="text-gray-500 shrink-0" />
                <input
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder={`Search ${searchField}...`}
                    className="bg-transparent text-[10px] text-white font-mono outline-none w-36 placeholder:text-gray-700"
                />
                {searchQuery && <button onClick={() => onSearchChange('')} className="text-gray-600 hover:text-gray-300"><X size={10}/></button>}
            </div>
            {/* Host filter */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-2 py-1">
                <Monitor size={11} className="text-gray-500 shrink-0" />
                <input
                    value={hostFilter}
                    onChange={e => onHostFilterChange(e.target.value)}
                    placeholder="Filter by host..."
                    className="bg-transparent text-[10px] text-white font-mono outline-none w-28 placeholder:text-gray-700"
                />
                {hostFilter && <button onClick={() => onHostFilterChange('')} className="text-gray-600 hover:text-gray-300"><X size={10}/></button>}
            </div>
            {/* Show deleted */}
            <button
                onClick={onToggleDeleted}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-mono transition-colors",
                    showDeleted ? "border-red-500/50 text-red-400 bg-red-500/10" : "border-white/10 text-gray-500 hover:text-gray-300"
                )}
            >
                {showDeleted ? <Eye size={11}/> : <EyeOff size={11}/>}
                Deleted
            </button>
            {/* UTC toggle */}
            <button
                onClick={onToggleUTC}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-mono transition-colors",
                    showUTC ? "border-cyan-500/50 text-cyan-400 bg-cyan-500/10" : "border-white/10 text-gray-500 hover:text-gray-300"
                )}
            >
                <Clock size={11}/>
                {showUTC ? 'UTC' : 'LOCAL'}
            </button>
            {/* Spacer */}
            <div className="flex-1" />
            {/* Results count */}
            <span className="text-[10px] text-gray-600 font-mono">{totalCount} items</span>
            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-0.5 disabled:opacity-30 text-gray-400 hover:text-white"><ChevronLeft size={13}/></button>
                    <span className="text-[10px] text-gray-400 font-mono px-1">{currentPage}/{totalPages}</span>
                    <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-0.5 disabled:opacity-30 text-gray-400 hover:text-white"><ChevronRight size={13}/></button>
                </div>
            )}
        </div>
    );
};

// ── BulkActionBar ─────────────────────────────
export const BulkActionBar = ({
    selected, allFiles, onBulkDownload, onBulkDelete, onClearSelection,
}: {
    selected: Set<number>; allFiles: FileMeta[];
    onBulkDownload: () => void; onBulkDelete: () => void;
    onClearSelection: () => void;
}) => {
    if (selected.size === 0) return null;
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-signal/5 border-b border-signal/20 shrink-0">
            <span className="text-[10px] text-signal font-mono">{selected.size} selected</span>
            <button onClick={onBulkDownload} className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] hover:bg-blue-500/30 transition-colors">
                <Archive size={11}/> Zip Download
            </button>
            <button onClick={onBulkDelete} className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px] hover:bg-red-500/30 transition-colors">
                <Trash2 size={11}/> Delete
            </button>
            <button onClick={onClearSelection} className="ml-auto text-gray-600 hover:text-gray-400 p-0.5"><X size={12}/></button>
        </div>
    );
};

// ============================================
// Domain-Grouped Machine List
// ============================================
export const DomainGroupedMachines = ({
    groups,
    selectedMachine,
    onSelectMachine,
    isRecentlyActive,
}: {
    groups: { label: string; isDomain: boolean; machines: MachineInfo[] }[];
    selectedMachine: MachineInfo | null;
    onSelectMachine: (m: MachineInfo) => void;
    isRecentlyActive: (s: string) => boolean;
}) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggleGroup = (label: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(label) ? next.delete(label) : next.add(label);
            return next;
        });
    };

    return (
        <div className="pb-1">
            {groups.map(({ label, isDomain, machines }) => {
                const isCollapsed = collapsed.has(label);
                const anyActive = machines.some(m => isRecentlyActive(m.lastCheckin));
                return (
                    <div key={label}>
                        {/* Group header */}
                        <button
                            onClick={() => toggleGroup(label)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors text-left group"
                        >
                            {isCollapsed
                                ? <ChevronRight size={12} className="text-gray-400 group-hover:text-gray-200 shrink-0" />
                                : <ChevronDown  size={12} className="text-gray-400 group-hover:text-gray-200 shrink-0" />}
                            {isDomain
                                ? <Globe   size={12} className={anyActive ? "text-cyan-400 shrink-0" : "text-gray-400 shrink-0"} />
                                : <Network size={12} className={anyActive ? "text-cyan-400 shrink-0" : "text-gray-400 shrink-0"} />}
                            <span className={cn(
                                "font-mono text-[11px] truncate flex-1",
                                anyActive ? "text-white" : "text-gray-300"
                            )}>{label}</span>
                            <span className="text-[9px] text-gray-400 font-mono shrink-0">{machines.length}</span>
                        </button>

                        {/* Machines in group */}
                        {!isCollapsed && machines.map(machine => {
                            const isActive = isRecentlyActive(machine.lastCheckin);
                            const isSelected = selectedMachine?.host === machine.host;
                            return (
                                <div
                                    key={machine.host}
                                    onClick={() => onSelectMachine(machine)}
                                    className={cn(
                                        "flex items-center gap-2 pl-8 pr-3 py-1.5 cursor-pointer transition-all border-l-2",
                                        isSelected
                                            ? "bg-signal/10 border-signal"
                                            : "border-transparent hover:bg-white/5 hover:border-white/20"
                                    )}
                                >
                                    <Monitor size={11} className={isActive ? "text-signal shrink-0" : "text-gray-400 shrink-0"} />
                                    <span className={cn(
                                        "font-mono text-xs truncate flex-1",
                                        isSelected ? "text-signal" : isActive ? "text-white" : "text-gray-300"
                                    )}>
                                        {machine.host}
                                    </span>
                                    <span className="text-[9px] text-gray-400 font-mono shrink-0">{machine.users[0] || '?'}</span>
                                    {isActive
                                        ? <Wifi    size={9} className="text-green-400 shrink-0" />
                                        : <WifiOff size={9} className="text-gray-500 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};

export const WelcomeScreen = ({ 
    machines, 
    isRecentlyActive,
    downloads,
    uploads
}: { 
    machines: MachineInfo[], 
    isRecentlyActive: (s: string) => boolean,
    downloads: number,
    uploads: number
}) => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-signal/10 rounded-lg flex items-center justify-center border border-signal/30 mb-4">
            <HardDrive size={32} className="text-signal" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">SELECT A TARGET</h2>
        <p className="text-gray-500 text-sm max-w-md mb-6">
            Choose a target machine or browse Mythic C2 files from the sidebar.
        </p>
        
        <div className="grid grid-cols-4 gap-3 max-w-2xl text-left">
            <div className="p-3 bg-black/40 border border-white/10 rounded">
                <Monitor size={16} className="text-signal mb-2" />
                <h3 className="text-[10px] font-bold text-white">TARGETS</h3>
                <p className="text-lg text-signal font-bold">{machines.length}</p>
            </div>
            <div className="p-3 bg-black/40 border border-white/10 rounded">
                <Wifi size={16} className="text-green-400 mb-2" />
                <h3 className="text-[10px] font-bold text-white">ACTIVE</h3>
                <p className="text-lg text-green-400 font-bold">{machines.filter(m => isRecentlyActive(m.lastCheckin)).length}</p>
            </div>
            <div className="p-3 bg-black/40 border border-white/10 rounded">
                <Download size={16} className="text-blue-400 mb-2" />
                <h3 className="text-[10px] font-bold text-white">DOWNLOADS</h3>
                <p className="text-lg text-blue-400 font-bold">{downloads}</p>
            </div>
            <div className="p-3 bg-black/40 border border-white/10 rounded">
                <Upload size={16} className="text-green-400 mb-2" />
                <h3 className="text-[10px] font-bold text-white">UPLOADS</h3>
                <p className="text-lg text-green-400 font-bold">{uploads}</p>
            </div>
        </div>
    </div>
);

export const MachineHeader = ({ machine, isRecentlyActive }: { machine: MachineInfo, isRecentlyActive: (s: string) => boolean }) => (
    <div className="h-10 bg-black/40 border-b border-white/10 flex items-center px-4 gap-3 shrink-0">
        <Monitor size={14} className="text-signal" />
        <span className="font-mono text-sm text-white font-bold">{machine.host}</span>
        <div className="w-px h-4 bg-white/20" />
        <User size={12} className="text-gray-500" />
        <span className="text-xs text-gray-400">{machine.users.join(', ')}</span>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex gap-1">
            {machine.callbacks.slice(0, 5).map((cb: any) => (
                <span 
                    key={cb.id}
                    className={cn(
                        "text-[9px] px-1 py-0.5 rounded font-mono",
                        isRecentlyActive(cb.last_checkin) ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-500"
                    )}
                >
                    #{cb.display_id}
                </span>
            ))}
        </div>
    </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Generic File Table (used by Uploads, Downloads, Eventing)
// ──────────────────────────────────────────────────────────────────────────
interface FileTableProps {
    files: FileMeta[];
    accentColor: string;          // e.g. 'text-green-400'
    selectedFiles: Set<number>;
    onSelectFile: (id: number, sel: boolean) => void;
    onDeleteFile: (id: number) => void;
    onUpdateComment: (id: number, c: string) => void;
    onCopy: (s: string) => void;
    /** For uploads: group by host — staged vs deployed */
    groupByHost?: boolean;
    /** For uploads: show separate Destination column (full_remote_path + groups) */
    showDestination?: boolean;
    onPreviewMedia?: (file: FileMeta) => void;
    onEditTags?: (file: FileMeta) => void;
    showWorkflow?: boolean;
    showUTC?: boolean;
    onHostFile?: (file: FileMeta) => void;
}

export const FileTable = ({
    files, accentColor, selectedFiles, onSelectFile, onDeleteFile, onUpdateComment, onCopy, groupByHost,
    showDestination, onPreviewMedia, onEditTags, showWorkflow, showUTC, onHostFile,
}: FileTableProps) => {
    const [sortKey, setSortKey] = useState<'timestamp' | 'filename_text' | 'size'>('timestamp');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['__staged__']));

    const toggleSort = (k: typeof sortKey) => {
        if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(k); setSortDir('desc'); }
    };

    const sortFn = (arr: FileMeta[]) => arr.slice().sort((a, b) => {
        const va = sortKey === 'size' ? a.size : sortKey === 'timestamp' ? a.timestamp : b64DecodeUnicode(a.filename_text).toLowerCase();
        const vb = sortKey === 'size' ? b.size : sortKey === 'timestamp' ? b.timestamp : b64DecodeUnicode(b.filename_text).toLowerCase();
        return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });

    const toggleRow = (id: number) => setExpandedRows(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const toggleGroup = (k: string) => setExpandedGroups(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
    const toggleGroupSelect = (groupFiles: FileMeta[]) => {
        const ids = groupFiles.map(f => f.id);
        const allSel = ids.every(id => selectedFiles.has(id));
        ids.forEach(id => onSelectFile(id, !allSel));
    };

    const SortIcon = ({ k }: { k: typeof sortKey }) =>
        sortKey !== k ? null : sortDir === 'asc'
            ? <ChevronUp size={9} className="inline ml-0.5" />
            : <ChevronDown size={9} className="inline ml-0.5" />;

    const COL_COUNT = 8 + (showWorkflow ? 1 : 0) + (showDestination ? 1 : 0); // checkbox, file, [destination], host, size, comment, tags, [workflow], time, actions
    const displayTime = (ts: string) => showUTC
        ? new Date(ts).toISOString().replace('T', ' ').substring(0, 19) + ' Z'
        : formatTimeAgo(ts);

    const FileRow = ({ file }: { file: FileMeta }) => {
        const pct = file.total_chunks > 0 ? Math.round((file.chunks_received / file.total_chunks) * 100) : 0;
        const filename = b64DecodeUnicode(file.filename_text) || 'unnamed';
        const remotePath = b64DecodeUnicode(file.full_remote_path_text);
        const isSel = selectedFiles.has(file.id);
        const isExpanded = expandedRows.has(file.id);
        const [confirmDelete, setConfirmDelete] = useState(false);

        return (
            <React.Fragment>
                {confirmDelete && (
                    <AnimatePresence>
                        <ConfirmDeleteDialog
                            filename={filename}
                            onConfirm={() => { onDeleteFile(file.id); setConfirmDelete(false); }}
                            onCancel={() => setConfirmDelete(false)}
                        />
                    </AnimatePresence>
                )}
                <tr
                    className={cn('group hover:bg-white/5 transition-colors cursor-pointer', isSel && 'bg-green-500/5', file.deleted && 'opacity-50')}
                    onClick={() => toggleRow(file.id)}
                >
                    <td className="p-2 w-8" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={e => onSelectFile(file.id, e.target.checked)}
                            className="rounded bg-black/40 border-white/20" />
                    </td>
                    <td className="p-2 min-w-0">
                        <div className="flex items-start gap-2 min-w-0">
                            <span className="shrink-0 mt-0.5">
                                {isExpanded ? <ChevronDown size={11} className="text-gray-500"/> : <ChevronRight size={11} className="text-gray-500"/>}
                            </span>
                            <FileText size={12} className={cn(accentColor, 'shrink-0 mt-0.5')} />
                            <div className="min-w-0">
                                {file.deleted ? (
                                    <span className="text-gray-500 text-xs line-through" title={filename}>{filename}</span>
                                ) : file.complete ? (
                                    <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                        className="text-white text-xs hover:underline" title={filename} onClick={e => e.stopPropagation()}>
                                        {filename}
                                    </a>
                                ) : (
                                    <span className="text-white text-xs" title={filename}>{filename}</span>
                                )}
                                {!showDestination && remotePath && <p className="text-[9px] text-gray-600 font-mono truncate mt-0.5" title={remotePath}>{remotePath}</p>}
                                {!file.complete && (
                                    <span className="text-yellow-500 text-[9px]">{file.chunks_received}/{file.total_chunks} chunks ({pct}%)</span>
                                )}
                            </div>
                        </div>
                    </td>
                    {/* Destination column (uploads only) */}
                    {showDestination && (
                        <td className="p-2 min-w-0">
                            <div className="text-[10px] space-y-0.5">
                                {file.task?.callback?.mythictree_groups && !file.task.callback.mythictree_groups.every((g: string) => g === 'Default') && (
                                    <p className="text-gray-500 font-mono text-[9px]">Groups: {file.task.callback.mythictree_groups.join(', ')}</p>
                                )}
                                {remotePath ? (
                                    file.deleted ? (
                                        <span className="text-gray-500 font-mono break-all">{remotePath}</span>
                                    ) : file.complete ? (
                                        <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                            className="text-green-400 hover:underline font-mono break-all" onClick={e => e.stopPropagation()}>{remotePath}</a>
                                    ) : (
                                        <span className="text-gray-400 font-mono break-all">{remotePath}</span>
                                    )
                                ) : <span className="text-gray-700">—</span>}
                            </div>
                        </td>
                    )}
                    <td className="p-2 w-28 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                        {file.host || <span className="text-gray-700">—</span>}
                    </td>
                    <td className="p-2 w-20 font-mono text-[10px] text-gray-400 whitespace-nowrap">{formatBytes(file.size)}</td>
                    <td className="p-2 w-32 max-w-[128px]" onClick={e => e.stopPropagation()}>
                        <CommentCell comment={file.comment || ''} fileId={file.id} onSave={onUpdateComment} />
                    </td>
                    <td className="p-2 w-28 max-w-[112px]">
                        <TagsDisplay tags={file.tags} />
                    </td>
                    {showWorkflow && (
                        <td className="p-2 w-32 font-mono text-[10px] whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {file.eventgroup ? (
                                <a href={`/new/eventing?eventgroup=${file.eventgroup.id}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-yellow-400 hover:underline hover:text-yellow-300">
                                    <Zap size={9}/> {file.eventgroup.name}
                                </a>
                            ) : <span className="text-gray-700">—</span>}
                        </td>
                    )}
                    <td className="p-2 w-24 text-gray-500 text-[10px] whitespace-nowrap">{displayTime(file.timestamp)}</td>
                    <td className="p-2 w-24" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {file.complete && !file.deleted && onPreviewMedia && (
                                <button onClick={() => onPreviewMedia(file)} className="p-1 hover:bg-white/10 rounded text-purple-400" title="Preview">
                                    <Eye size={11} />
                                </button>
                            )}
                            {file.complete && !file.deleted && (
                                <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                    className="p-1 hover:bg-white/10 rounded text-blue-400" title="Download">
                                    <Download size={11} />
                                </a>
                            )}
                            {onEditTags && (
                                <button onClick={() => onEditTags(file)} className="p-1 hover:bg-white/10 rounded text-yellow-400" title="Edit Tags">
                                    <Tag size={11} />
                                </button>
                            )}
                            <button onClick={() => onCopy(file.agent_file_id)} className="p-1 hover:bg-white/10 rounded text-gray-500" title="Copy UUID">
                                <Copy size={11} />
                            </button>
                            {!file.deleted && (
                                <button onClick={() => setConfirmDelete(true)} className="p-1 hover:bg-white/10 rounded text-red-400" title="Delete">
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    </td>
                </tr>
                {isExpanded && <ExpandedRowDetails file={file} colSpan={COL_COUNT} onCopy={onCopy} onHostFile={onHostFile} showUTC={showUTC} />}
            </React.Fragment>
        );
    };

    const GroupHeader = ({ groupKey, label, icon, groupFiles, labelClass }: {
        groupKey: string; label: string; icon: React.ReactNode;
        groupFiles: FileMeta[]; labelClass: string;
    }) => {
        const isOpen = expandedGroups.has(groupKey);
        const allSel = groupFiles.length > 0 && groupFiles.every(f => selectedFiles.has(f.id));
        const latest = groupFiles.reduce((t, f) => f.timestamp > t ? f.timestamp : t, '');
        return (
            <tr className="bg-black/40 hover:bg-white/5 cursor-pointer select-none" onClick={() => toggleGroup(groupKey)}>
                <td className="p-2 w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={allSel} onChange={() => toggleGroupSelect(groupFiles)}
                        className="rounded bg-black/40 border-white/20" />
                </td>
                <td colSpan={COL_COUNT - 2} className="p-2">
                    <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown size={11} className="text-gray-500 shrink-0"/> : <ChevronRight size={11} className="text-gray-500 shrink-0"/>}
                        <span className={cn('shrink-0', labelClass)}>{icon}</span>
                        <span className={cn('font-mono text-[10px] uppercase tracking-widest', labelClass)}>{label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-400 ml-1">{groupFiles.length}</span>
                        {latest && <span className="ml-auto text-[9px] text-gray-600 font-mono">{formatTimeAgo(latest)}</span>}
                    </div>
                </td>
                <td className="p-2" />
            </tr>
        );
    };

    const thead = (
        <thead className="bg-black/60 sticky top-0 z-10 backdrop-blur-sm">
            <tr className="text-gray-500 font-mono text-[10px] border-b border-white/10">
                <th className="p-2 w-8">
                    <input type="checkbox"
                        checked={files.length > 0 && files.every(f => selectedFiles.has(f.id))}
                        onChange={e => files.forEach(f => onSelectFile(f.id, e.target.checked))}
                        className="rounded bg-black/40 border-white/20" />
                </th>
                <th className="p-2 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('filename_text')}>
                    {showDestination ? 'SOURCE' : 'FILENAME'} <SortIcon k="filename_text" />
                </th>
                {showDestination && <th className="p-2 text-left">DESTINATION</th>}
                <th className="p-2 text-left w-28">HOST</th>
                <th className="p-2 text-left w-20 cursor-pointer hover:text-white" onClick={() => toggleSort('size')}>
                    SIZE <SortIcon k="size" />
                </th>
                <th className="p-2 text-left w-32">COMMENT</th>
                <th className="p-2 text-left w-28">TAGS</th>
                {showWorkflow && <th className="p-2 text-left w-32">WORKFLOW</th>}
                <th className="p-2 text-left w-24 cursor-pointer hover:text-white" onClick={() => toggleSort('timestamp')}>
                    TIME <SortIcon k="timestamp" />
                </th>
                <th className="p-2 text-left w-24">ACTIONS</th>
            </tr>
        </thead>
    );

    if (files.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-gray-600">
                <FileText size={36} className="opacity-20" />
                <p className="font-mono text-sm">NO_FILES_FOUND</p>
            </div>
        );
    }

    if (groupByHost) {
        const staged = sortFn(files.filter(f => !f.host));
        const deployed = files.filter(f => !!f.host);
        const byHost = deployed.reduce<Record<string, FileMeta[]>>((acc, f) => { (acc[f.host] ??= []).push(f); return acc; }, {});
        const sortedHosts = Object.keys(byHost).sort();
        return (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                    {thead}
                    <tbody className="divide-y divide-white/5">
                        {staged.length > 0 && <>
                            <GroupHeader groupKey="__staged__" label="Staged — Server Only" icon={<Server size={11}/>} groupFiles={staged} labelClass="text-gray-400" />
                            {expandedGroups.has('__staged__') && staged.map(f => <FileRow key={f.id} file={f} />)}
                        </>}
                        {sortedHosts.map(host => {
                            const hf = sortFn(byHost[host]);
                            return (
                                <React.Fragment key={host}>
                                    <GroupHeader groupKey={host} label={host} icon={<Monitor size={11}/>} groupFiles={hf} labelClass="text-green-400" />
                                    {expandedGroups.has(host) && hf.map(f => <FileRow key={f.id} file={f} />)}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
                {thead}
                <tbody className="divide-y divide-white/5">
                    {sortFn(files).map(f => <FileRow key={f.id} file={f} />)}
                </tbody>
            </table>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────
// ScreenshotCard — single card in screenshot grid (has delete confirm)
// ──────────────────────────────────────────────────────────────────────────
