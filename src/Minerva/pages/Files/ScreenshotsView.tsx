import React, { useState, useEffect } from 'react'
import {
    Eye,
    Copy,
    Image,
    ChevronLeft,
    ChevronRight,
    X,
    Monitor,
    Tag,
    Trash2,
    ChevronUp,
    ChevronDown,
    Info,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion';
import type { FileMeta } from '../../types/files';
import { formatTimeAgo, b64DecodeUnicode, formatBytes } from './utils';
import { ConfirmDeleteDialog, TagsDisplay, BulkActionBar, CommentCell } from './FileTable';

export const ScreenshotCard = ({
    file, filename, isExpanded, idx, isSelected, onSelect,
    onOpenSlideshow, onToggleExpand, onDeleteFile, onUpdateComment, onEditTags,
}: {
    file: FileMeta; filename: string; isExpanded: boolean; idx: number;
    isSelected: boolean;
    onSelect: (id: number, sel: boolean) => void;
    onOpenSlideshow: () => void;
    onToggleExpand: () => void;
    onDeleteFile: (id: number) => void;
    onUpdateComment: (id: number, c: string) => void;
    onEditTags?: (file: FileMeta) => void;
}) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    return (
        <div className="group flex flex-col bg-black/40 border border-white/10 rounded overflow-hidden hover:border-purple-500/40 transition-colors">
            <AnimatePresence>
                {confirmDelete && (
                    <ConfirmDeleteDialog
                        filename={filename}
                        onConfirm={() => { onDeleteFile(file.id); setConfirmDelete(false); }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}
            </AnimatePresence>
            {/* Thumbnail */}
            <div className="relative aspect-video cursor-pointer overflow-hidden" onClick={onOpenSlideshow}>
                <img src={`/direct/download/${file.agent_file_id}`} alt={filename}
                    className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Eye size={22} className="text-white" />
                </div>
                {/* Checkbox overlay */}
                <div className="absolute top-1 left-1" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                        checked={isSelected}
                        onChange={e => onSelect(file.id, e.target.checked)}
                        className="rounded bg-black/60 border-white/30 w-3.5 h-3.5 cursor-pointer"
                    />
                </div>
            </div>
            {/* Info strip */}
            <div className="px-2 py-1.5 flex items-center gap-1.5 text-[9px] border-t border-white/10">
                <Monitor size={9} className="text-gray-500 shrink-0" />
                <span className="text-gray-400 truncate flex-1">{file.host || '—'}</span>
                <span className="text-gray-600">{formatBytes(file.size)}</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-600">{formatTimeAgo(file.timestamp)}</span>
                {onEditTags && (
                    <button onClick={e => { e.stopPropagation(); onEditTags(file); }} className="text-gray-700 hover:text-yellow-400 shrink-0" title="Edit Tags"><Tag size={10}/></button>
                )}
                <button onClick={() => setConfirmDelete(true)} className="text-gray-700 hover:text-red-400 shrink-0"><Trash2 size={10}/></button>
                <button onClick={onToggleExpand} className="text-gray-700 hover:text-gray-300 shrink-0">
                    {isExpanded ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                </button>
            </div>
            {/* Comment */}
            <div className="px-2 pb-1" onClick={e => e.stopPropagation()}>
                <CommentCell comment={file.comment || ''} fileId={file.id} onSave={onUpdateComment} />
            </div>
            {/* Tags */}
            {file.tags && file.tags.length > 0 && (
                <div className="px-2 pb-1.5"><TagsDisplay tags={file.tags} /></div>
            )}
            {/* Expanded details */}
            {isExpanded && (
                <div className="px-2 pb-2 text-[9px] text-gray-500 font-mono border-t border-white/5 pt-1.5 space-y-1">
                    <div className="flex gap-1.5"><span className="text-gray-700 w-8 shrink-0">MD5</span><span className="text-gray-400 break-all">{file.md5 || '—'}</span></div>
                    <div className="flex gap-1.5"><span className="text-gray-700 w-8 shrink-0">SHA1</span><span className="text-gray-400 break-all">{file.sha1 || '—'}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-gray-700 w-8 shrink-0">UUID</span>
                        <span className="text-gray-400 break-all flex-1">{file.agent_file_id}</span>
                        <button onClick={() => navigator.clipboard.writeText(file.agent_file_id)}><Copy size={9} className="text-gray-700 hover:text-gray-400"/></button>
                    </div>
                    {file.operator && <div className="flex gap-1.5"><span className="text-gray-700 w-8 shrink-0">Oper</span><span className="text-gray-400">{file.operator.username}</span></div>}
                    {file.task && <>
                        <div className="flex gap-1.5">
                            <span className="text-gray-700 w-8 shrink-0">Task</span>
                            <div className="flex flex-col gap-0.5">
                                <a href={`/new/callbacks/${file.task.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">C-{file.task.callback?.display_id}</a>
                                <a href={`/new/task/${file.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">T-{file.task.display_id}</a>
                                {file.task.comment && <span className="text-gray-500 italic">{file.task.comment}</span>}
                            </div>
                        </div>
                        {file.task.command && <div className="flex gap-1.5"><span className="text-gray-700 w-8 shrink-0">Cmd</span><span className="text-gray-400">{file.task.command.cmd}</span></div>}
                    </>}
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────
// Screenshots View — thumbnail grid + slideshow
// ──────────────────────────────────────────────────────────────────────────
export const ScreenshotsView = ({
    files, onDeleteFile, onUpdateComment, onCopy, onBulkDelete, onBulkDownload, onEditTags,
}: {
    files: FileMeta[];
    onDeleteFile: (id: number) => void;
    onUpdateComment: (id: number, c: string) => void;
    onCopy: (s: string) => void;
    onBulkDelete: (ids: Set<number>) => void;
    onBulkDownload: (ids: Set<number>) => void;
    onEditTags?: (file: FileMeta) => void;
}) => {
    const [slideshowIdx, setSlideshowIdx] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [selectedScreenshots, setSelectedScreenshots] = useState<Set<number>>(new Set());
    const toggleScreenshotSelect = (id: number, sel: boolean) =>
        setSelectedScreenshots(prev => { const s = new Set(prev); sel ? s.add(id) : s.delete(id); return s; });

    if (files.length === 0) return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-gray-600">
            <Image size={40} className="opacity-20" />
            <p className="font-mono text-sm">NO_SCREENSHOTS</p>
        </div>
    );

    return (
        <>
            <BulkActionBar
                selected={selectedScreenshots}
                allFiles={files}
                onBulkDownload={() => { onBulkDownload(selectedScreenshots); setSelectedScreenshots(new Set()); }}
                onBulkDelete={() => { onBulkDelete(selectedScreenshots); setSelectedScreenshots(new Set()); }}
                onClearSelection={() => setSelectedScreenshots(new Set())}
            />
            <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                    {files.map((file, idx) => {
                        const filename = b64DecodeUnicode(file.filename_text);
                        const isExpanded = expandedId === file.id;
                        return (
                            <ScreenshotCard
                                key={file.id}
                                file={file}
                                filename={filename}
                                isExpanded={isExpanded}
                                idx={idx}
                                isSelected={selectedScreenshots.has(file.id)}
                                onSelect={toggleScreenshotSelect}
                                onOpenSlideshow={() => setSlideshowIdx(idx)}
                                onToggleExpand={() => setExpandedId(isExpanded ? null : file.id)}
                                onDeleteFile={onDeleteFile}
                                onUpdateComment={onUpdateComment}
                                onEditTags={onEditTags}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Slideshow Modal */}
            {slideshowIdx !== null && (
                <ScreenshotSlideshowModal
                    files={files}
                    startIndex={slideshowIdx}
                    onClose={() => setSlideshowIdx(null)}
                />
            )}
        </>
    );
};

// ── Slideshow Modal ───────────────────────────
export const ScreenshotSlideshowModal = ({
    files, startIndex, onClose,
}: { files: FileMeta[]; startIndex: number; onClose: () => void; }) => {
    const [idx, setIdx] = useState(startIndex);
    const file = files[idx];

    const prev = () => setIdx(i => (i - 1 + files.length) % files.length);
    const next = () => setIdx(i => (i + 1) % files.length);

    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') prev();
            else if (e.key === 'ArrowRight') next();
            else if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!file) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center"
            onClick={onClose}>
            {/* Nav */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
                <span className="text-gray-500 font-mono text-xs">{idx + 1} / {files.length}</span>
                <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={20} className="text-gray-400"/></button>
            </div>
            {/* Prev */}
            <button onClick={e => { e.stopPropagation(); prev(); }}
                className="absolute left-4 p-2 bg-black/60 rounded-full hover:bg-white/10 transition-colors">
                <ChevronLeft size={24} className="text-white" />
            </button>
            {/* Image */}
            <img src={`/direct/download/${file.agent_file_id}`}
                alt={b64DecodeUnicode(file.filename_text)}
                className="max-w-[90vw] max-h-[80vh] object-contain rounded shadow-2xl"
                onClick={e => e.stopPropagation()} />
            {/* Next */}
            <button onClick={e => { e.stopPropagation(); next(); }}
                className="absolute right-4 p-2 bg-black/60 rounded-full hover:bg-white/10 transition-colors">
                <ChevronRight size={24} className="text-white" />
            </button>
            {/* Caption */}
            <div className="absolute bottom-4 text-center" onClick={e => e.stopPropagation()}>
                <p className="text-white text-sm font-mono">{b64DecodeUnicode(file.filename_text)}</p>
                <p className="text-gray-500 text-[10px]">{file.host} · {new Date(file.timestamp).toLocaleString()}</p>
            </div>
        </motion.div>
    );
};

// ──────────────────────────────────────────────────────────────────────────
// MythicFilesView — orchestrates search bar, bulk bar, table/grid
// ──────────────────────────────────────────────────────────────────────────
