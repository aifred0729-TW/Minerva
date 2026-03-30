import React from 'react';
import { Search, FolderOpen, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { MythicTreeNode, FileMeta } from '../../types/files';
import { formatBytes, type SidebarView } from './utils';
import { SearchFilterBar, BulkActionBar, FileTable, TagsDisplay } from './FileTable';
import { ScreenshotsView } from './ScreenshotsView';

export const MythicFilesView = ({
    allFiles, type, loading, selectedFiles, onSelectFile, onDeleteFile,
    onBulkDelete, onBulkDownload, onUpdateComment, onCopy,
    searchQuery, onSearchChange, hostFilter, onHostFilterChange,
    searchField, onSearchFieldChange, showDeleted, onToggleDeleted,
    currentPage, onPageChange, pageSize,
    screenshotIndex, onScreenshotIndex, screenshotUrls,
    showUTC, onToggleUTC, onPreviewMedia, onEditTags,
    fileBrowserResults, fileBrowserCount, onHostFile, serverPaged, totalCount, onPreviewFile,
}: {
    allFiles: FileMeta[]; type: SidebarView; loading: boolean;
    selectedFiles: Set<number>;
    onSelectFile: (id: number, sel: boolean) => void;
    onDeleteFile: (id: number) => void;
    onBulkDelete: (ids: Set<number>) => void;
    onBulkDownload: (ids: Set<number>, src: FileMeta[]) => void;
    onUpdateComment: (id: number, c: string) => void;
    onCopy: (s: string) => void;
    searchQuery: string; onSearchChange: (v: string) => void;
    hostFilter: string; onHostFilterChange: (v: string) => void;
    searchField: 'filename' | 'hash' | 'comment' | 'uuid' | 'tag';
    onSearchFieldChange: (v: 'filename' | 'hash' | 'comment' | 'uuid' | 'tag') => void;
    showDeleted: boolean; onToggleDeleted: () => void;
    currentPage: number; onPageChange: (p: number) => void; pageSize: number;
    screenshotIndex: number | null; onScreenshotIndex: (i: number | null) => void;
    screenshotUrls: string[];
    showUTC: boolean; onToggleUTC: () => void;
    onPreviewMedia: (file: FileMeta) => void;
    onEditTags: (file: FileMeta) => void;
    fileBrowserResults: MythicTreeNode[];
    fileBrowserCount: number;
    onPreviewFile?: (file: FileMeta | null) => void;
    onHostFile?: (f: FileMeta) => void;
    serverPaged?: boolean;
    totalCount?: number;
}) => {
    if (loading) return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500 font-mono text-sm animate-pulse">LOADING_FILES...</div>
        </div>
    );

    // For screenshots we don't paginate
    const isScreenshots = type === 'screenshots';
    // When server returns a pre-paged slice, don't re-slice locally
    const isServerPaged = serverPaged;
    const paged = isScreenshots || isServerPaged ? allFiles : allFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Selected files relative to current view's source
    const selectedInView = new Set([...selectedFiles].filter(id => allFiles.some(f => f.id === id)));

    const accentMap: Record<SidebarView, string> = {
        downloads: 'text-blue-400', uploads: 'text-green-400',
        screenshots: 'text-purple-400', eventing: 'text-yellow-400', machines: 'text-signal',
        filebrowser: 'text-cyan-400',
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search / filter bar */}
            <SearchFilterBar
                searchQuery={searchQuery} onSearchChange={onSearchChange}
                hostFilter={hostFilter} onHostFilterChange={onHostFilterChange}
                searchField={searchField} onSearchFieldChange={onSearchFieldChange}
                showDeleted={showDeleted} onToggleDeleted={onToggleDeleted}
                showUTC={showUTC} onToggleUTC={onToggleUTC}
                totalCount={totalCount ?? allFiles.length} pageSize={pageSize}
                currentPage={currentPage} onPageChange={onPageChange}
            />

            {/* Bulk action bar */}
            <BulkActionBar
                selected={selectedInView}
                allFiles={allFiles}
                onBulkDownload={() => onBulkDownload(selectedInView, allFiles)}
                onBulkDelete={() => onBulkDelete(selectedInView)}
                onClearSelection={() => allFiles.forEach(f => onSelectFile(f.id, false))}
            />

            {/* Content */}
            {isScreenshots ? (
                <ScreenshotsView
                    files={allFiles}
                    onDeleteFile={onDeleteFile}
                    onUpdateComment={onUpdateComment}
                    onCopy={onCopy}
                    onBulkDelete={onBulkDelete}
                    onBulkDownload={(ids) => onBulkDownload(ids, allFiles)}
                    onEditTags={onEditTags}
                />
            ) : type === 'filebrowser' ? (
                <FileBrowserSearchTable nodes={fileBrowserResults} count={fileBrowserCount} onCopy={onCopy} />
            ) : (
                <FileTable
                    files={paged}
                    accentColor={accentMap[type]}
                    selectedFiles={selectedFiles}
                    onSelectFile={onSelectFile}
                    onDeleteFile={onDeleteFile}
                    onUpdateComment={onUpdateComment}
                    onCopy={onCopy}
                    groupByHost={type === 'uploads'}
                    showDestination={type === 'uploads'}
                    onPreviewMedia={onPreviewMedia}
                    onEditTags={onEditTags}
                    showWorkflow={type === 'eventing'}
                    showUTC={showUTC}
                    onHostFile={onHostFile}
                />
            )}
        </div>
    );
};

// ── FileBrowserSearchTable ────────────────────
export const FileBrowserSearchTable = ({ nodes, count, onCopy }: {
    nodes: MythicTreeNode[]; count: number; onCopy: (s: string) => void;
}) => {
    if (nodes.length === 0) return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-gray-600">
            <Search size={36} className="opacity-20" />
            <p className="font-mono text-sm">NO_RESULTS</p>
            <p className="text-xs text-gray-700">Enter a search query to browse the file system</p>
        </div>
    );
    return (
        <div className="flex-1 overflow-auto">
            <div className="px-3 py-1.5 bg-cyan-500/5 border-b border-cyan-500/20 text-[10px] text-cyan-400 font-mono">
                {count} FILE BROWSER RESULTS
            </div>
            <table className="w-full text-xs border-collapse">
                <thead className="bg-black/60 sticky top-0 z-10 backdrop-blur-sm">
                    <tr className="text-gray-500 font-mono text-[10px] border-b border-white/10">
                        <th className="p-2 text-left">PATH</th>
                        <th className="p-2 text-left w-28">HOST</th>
                        <th className="p-2 text-left w-20">SIZE</th>
                        <th className="p-2 text-left w-20">TASK</th>
                        <th className="p-2 text-left w-28">TAGS</th>
                        <th className="p-2 text-left">COMMENT</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {nodes.map(node => {
                        const size = node.filemeta?.[0]?.size ?? (node.metadata ? (() => { try { return JSON.parse(node.metadata!).size; } catch { return 0; } })() : 0);
                        return (
                            <tr key={node.id} className={cn('hover:bg-white/5 transition-colors', node.deleted && 'opacity-40')}>
                                <td className="p-2 min-w-0">
                                    <div className="flex items-center gap-2">
                                        {node.can_have_children
                                            ? <FolderOpen size={11} className="text-yellow-400 shrink-0"/>
                                            : <FileText size={11} className="text-cyan-400 shrink-0"/>}
                                        <span className="font-mono text-[10px] text-gray-300 break-all">{node.full_path_text}</span>
                                    </div>
                                </td>
                                <td className="p-2 w-28 font-mono text-[10px] text-gray-400">{node.host || '—'}</td>
                                <td className="p-2 w-20 font-mono text-[10px] text-gray-400">
                                    {node.filemeta?.[0]?.complete === false
                                        ? <span className="text-yellow-500">{node.filemeta[0].chunks_received}/{node.filemeta[0].total_chunks}</span>
                                        : formatBytes(size)}
                                </td>
                                <td className="p-2 w-20">
                                    {node.task ? (
                                        <div className="flex flex-col gap-0.5">
                                            <a href={`/new/callbacks/${node.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-[9px]">C-{node.callback?.display_id}</a>
                                            <a href={`/new/task/${node.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-[9px]">T-{node.task.display_id}</a>
                                            {(node.filemeta?.[0]?.task?.comment || node.task?.comment) && (
                                                <span className="text-gray-500 italic text-[9px]">{node.filemeta?.[0]?.task?.comment || node.task?.comment}</span>
                                            )}
                                        </div>
                                    ) : <span className="text-gray-700 text-[10px]">—</span>}
                                </td>
                                <td className="p-2 w-28"><TagsDisplay tags={node.tags || []} /></td>
                                <td className="p-2 text-gray-500 text-[10px] italic">{node.comment}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ── HostFileModal ─────────────────────────────
