import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from "@apollo/client/react";
import {
    Folder,
    FolderOpen,
    File,
    ChevronRight,
    ChevronDown,
    Upload,
    Download,
    RefreshCw,
    Copy,
    FileText,
    Eye,
    HardDrive,
    XCircle,
    Activity,
    EyeOff,
}from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CREATE_TASK_MUTATION, GET_BUILT_PAYLOADS, GET_FILE_TREE_FOLDER,
    GET_FILE_TREE_ROOT, GET_UPLOADED_FILES,
} from '../../lib/api';
import { cn, b64DecodeUnicode, formatBytes, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { usePageVisible } from '../../lib/usePageVisible';
import { normalizeUnixPath, getMetadata, deduplicateNodes, uploadFileToMythic } from './utils';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuState, ConsoleFileNode } from '../../types/console';

const REFRESH_INDICATOR_DURATION_MS = 2_000;

export const UploadToAgentModal = ({ targetPath, callbackId, onClose }: {
    targetPath: string; callbackId: number; onClose: () => void;
}) => {
    const [createTask, { loading: tasking }] = useMutation<any>(CREATE_TASK_MUTATION);
    const { data, loading, refetch } = useQuery<any>(GET_UPLOADED_FILES, { fetchPolicy: 'network-only' });
    const { data: payloadData, loading: payloadLoading } = useQuery<any>(GET_BUILT_PAYLOADS, { fetchPolicy: 'network-only' });

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
                                            : 'border-gray-700 hover:border-gray-500 hover:bg-white/[0.03]'
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

// Folder-listing poll rates. See the comment on the poller in FileTreeItem.
const FOLDER_POLL_FAST_MS = 4000;
const FOLDER_POLL_SLOW_MS = 30000;
const FOLDER_POLL_FAST_WINDOW_MS = 60000;

// Single tree node component
export const FileTreeItem = ({ 
    node, host, callbackId, level, selectedFile, onSelectFile, expandedPaths, onToggleExpand, onFileAction, showDeletedFiles
}: { 
    node: ConsoleFileNode; host: string; callbackId: number; level: number; 
    selectedFile: ConsoleFileNode | null; onSelectFile: (n: ConsoleFileNode) => void;
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
    const pageVisible = usePageVisible();

    // Auto-fetch (and poll) folder contents whenever this node is expanded.
    // pollInterval keeps the listing fresh after an `ls` task completes without
    // requiring the user to manually collapse+re-expand.
    //
    // This is one poller PER EXPANDED FOLDER, and the tree keeps every folder
    // the operator ever opened expanded. At a flat 4s that was 15 network-only
    // requests a minute each — a browsed tree with eight folders open sat at
    // 120 req/min forever, long after the `ls` that motivated the polling had
    // landed. So the fast rate is now a window: 4s for the first minute after
    // this folder is expanded (which covers the `ls` round-trip the comment
    // above is about), then a 30s steady state. Collapsing and re-expanding
    // opens a fresh fast window.
    const [pollMs, setPollMs] = useState(FOLDER_POLL_FAST_MS);
    useEffect(() => {
        if (!isExpanded || !isFolder) return;
        setPollMs(FOLDER_POLL_FAST_MS);
        const id = setTimeout(() => setPollMs(FOLDER_POLL_SLOW_MS), FOLDER_POLL_FAST_WINDOW_MS);
        return () => clearTimeout(id);
    }, [isExpanded, isFolder]);
    const { data, loading } = useQuery<any>(GET_FILE_TREE_FOLDER, {
        variables: { parent_path_text: node.full_path_text, host },
        skip: !isExpanded || !isFolder,
        fetchPolicy: 'network-only',
        pollInterval: pageVisible && isExpanded && isFolder ? pollMs : 0,
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

    const allChildren = deduplicateNodes(data?.children || []).sort((a: ConsoleFileNode, b: ConsoleFileNode) => {
        if (a.can_have_children !== b.can_have_children) return a.can_have_children ? -1 : 1;
        return a.name_text.localeCompare(b.name_text);
    });
    const children = showDeletedFiles ? allChildren : allChildren.filter((c: ConsoleFileNode) => !c.deleted);

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
    const _hasContent = confirmedHasContent;
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
                        children.map((child: ConsoleFileNode) => (
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

export const FileBrowserPanel = ({ host, callbackId, onFileAction: externalOnFileAction }: { host: string, callbackId: number, onFileAction?: (action: string, path: string, name: string, isDir: boolean) => void }) => {
    const pageVisible = usePageVisible();
    const [createTask] = useMutation<any>(CREATE_TASK_MUTATION);
    const [selectedFile, setSelectedFile] = useState<ConsoleFileNode | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [_currentRefreshPath, _setCurrentRefreshPath] = useState('.');
    const [uploadTarget, setUploadTarget] = useState<string | null>(null);
    const [showDeletedFiles, setShowDeletedFiles] = useState(false);

    React.useEffect(() => {
        return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }, []);

    const { data: rootData, loading: rootLoading } = useQuery<any>(GET_FILE_TREE_ROOT, {
        variables: { host },
        fetchPolicy: 'network-only',
        pollInterval: pageVisible ? 4000 : 0,
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
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), REFRESH_INDICATOR_DURATION_MS);
        } catch (e: unknown) {
            snackActions.error("Failed to task 'ls': " + getErrorMessage(e));
            setIsRefreshing(false);
        }
    }, [callbackId, createTask]);

    const handleDownload = useCallback((node: ConsoleFileNode) => {
        const p = normalizeUnixPath(node.full_path_text);
        createTask({
            variables: { callback_id: callbackId, command: "download", params: p, tasking_location: "command_line", original_params: p }
        }).then(() => snackActions.info(`Tasked download for ${node.name_text}`))
          .catch((e: unknown) => snackActions.error("Download failed: " + getErrorMessage(e)));
    }, [callbackId, createTask]);

    const handleViewFile = useCallback((node: ConsoleFileNode) => {
        setSelectedFile(node);
        const p = normalizeUnixPath(node.full_path_text);
        createTask({
            variables: { callback_id: callbackId, command: "cat", params: p, tasking_location: "command_line", original_params: p }
        }).then(() => snackActions.info(`Tasked 'cat ${node.name_text}'`))
          .catch((e: unknown) => snackActions.error("Failed to read file: " + getErrorMessage(e)));
    }, [callbackId, createTask]);

    const handleFileAction = useCallback((action: string, path: string, name: string, isDir: boolean) => {
        const p = normalizeUnixPath(path);
        if (action === 'ls') {
            createTask({ variables: { callback_id: callbackId, command: 'ls', params: JSON.stringify({path: p, depth: 1}), tasking_location: "parsed_cli", parameter_group_name: "Default", original_params: p } })
                .then(() => snackActions.info(`Tasked 'ls ${p}'`))
                .catch((e: unknown) => snackActions.error('ls failed: ' + getErrorMessage(e)));
        } else if (action === 'download') {
            createTask({ variables: { callback_id: callbackId, command: 'download', params: p, tasking_location: "command_line", original_params: p } })
                .then(() => snackActions.info(`Tasked download: ${name}`))
                .catch((e: unknown) => snackActions.error('Download failed: ' + getErrorMessage(e)));
        } else if (action === 'cat') {
            createTask({ variables: { callback_id: callbackId, command: 'cat', params: p, tasking_location: "command_line", original_params: p } })
                .then(() => snackActions.info(`Tasked 'cat ${name}'`))
                .catch((e: unknown) => snackActions.error('cat failed: ' + getErrorMessage(e)));
        } else if (action === 'upload') {
            setUploadTarget(p);
        } else if (action === 'copy') {
            navigator.clipboard.writeText(p);
            snackActions.success('Path copied');
        }
        externalOnFileAction?.(action, p, name, isDir);
    }, [callbackId, createTask, externalOnFileAction]);

    const rootNodes = deduplicateNodes(rootData?.mythictree || []).sort((a: ConsoleFileNode, b: ConsoleFileNode) => {
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
                    rootNodes.map((node: ConsoleFileNode) => (
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
