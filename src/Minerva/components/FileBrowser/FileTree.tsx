import React, { useState, useEffect, useRef } from 'react';
import {
    Folder,
    FolderOpen,
    Download,
    ChevronRight,
    ChevronDown,
    MessageSquare,
    History,
    File as FileIcon,
    XCircle,
    CheckCircle2,
    AlertCircle,
}from 'lucide-react';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { directDownloadUrl } from '../../lib/urls';
import type { FileNode, ContextMenuItemDef } from '../../types/files';

interface ContextMenuState {
    x: number;
    y: number;
    isDir: boolean;
    path: string;
    name: string;
    items: ContextMenuItemDef[];
}

// Submenu item with hover-activated nested panel
export const ContextSubmenuItem = ({ item, menu, onAction, onClose }: {
    item: ContextMenuItemDef;
    menu: ContextMenuState;
    onAction: (action: string, path: string, name: string) => void;
    onClose: () => void;
}) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-signal/70">{item.icon}</span>
                    {item.label}
                </div>
                <ChevronRight size={10} className="text-gray-500 shrink-0" />
            </button>
            {open && (
                <div className="absolute left-full top-0 z-[10000] bg-black/95 border border-signal/40 rounded shadow-xl min-w-[170px] py-1 font-mono text-xs">
                    {(item.children || []).map(child =>
                        child.divider ? (
                            <div key={child.action} className="border-t border-white/10 my-0.5" />
                        ) : (
                            <button
                                key={child.action}
                                disabled={child.disabled}
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                                    child.danger && 'hover:bg-red-500/20 hover:text-red-400'
                                )}
                                onClick={() => { if (!child.disabled) { onAction(child.action, menu.path, menu.name); onClose(); } }}
                            >
                                <span className={cn('text-signal/70', child.danger && 'text-red-500/70')}>{child.icon}</span>
                                {child.label}
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

export const ContextMenu = ({ menu, items, onAction, onClose }: {
    menu: ContextMenuState;
    items: ContextMenuItemDef[];
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

    return (
        <div
            ref={ref}
            className="fixed z-[9999] bg-black/95 border border-signal/40 rounded shadow-xl min-w-[180px] py-1 font-mono text-xs"
            style={{ top: menu.y, left: menu.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-3 py-1.5 border-b border-white/10 text-gray-500 truncate max-w-[220px]" title={menu.path}>
                {menu.isDir ? '📁' : '📄'} {menu.name}
            </div>
            {items.map((item) =>
                item.divider ? (
                    <div key={item.action} className="border-t border-white/10 my-0.5" />
                ) : item.children?.length ? (
                    <ContextSubmenuItem key={item.action} item={item} menu={menu} onAction={onAction} onClose={onClose} />
                ) : (
                    <button
                        key={item.action}
                        disabled={item.disabled}
                        className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-white hover:bg-signal/20 hover:text-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                            item.danger && 'hover:bg-red-500/20 hover:text-red-400'
                        )}
                        onClick={() => { if (!item.disabled) { onAction(item.action, menu.path, menu.name); onClose(); } }}
                    >
                        <span className={cn('text-signal/70', item.danger && 'text-red-500/70')}>{item.icon}</span>
                        {item.label}
                    </button>
                )
            )}
        </div>
    );
};

// ============================================
// Tree Node Component  (cache-driven, no per-node queries)
// ============================================
interface FileTreeNodeProps {
    fullPath: string;
    level: number;
    treeRootData: Record<string, FileNode>;
    treeAdjMtx: Record<string, string[]>;
    selectedPath: string;
    showDeletedFiles: boolean;
    onSelect: (node: FileNode) => void;
    onFetchFolder: (node: FileNode) => void;
    onFileContextMenu: (node: FileNode, e: React.MouseEvent) => void;
}

export const FileTreeNode = ({
    fullPath, level, treeRootData, treeAdjMtx, selectedPath,
    showDeletedFiles, onSelect, onFetchFolder, onFileContextMenu
}: FileTreeNodeProps) => {
    const [expanded, setExpanded] = useState(false);
    const node = treeRootData[fullPath];
    if (!node) return null;
    if (node.deleted && !showDeletedFiles) return null;

    const isSelected = fullPath === selectedPath;
    const childPaths = treeAdjMtx[fullPath] || [];
    const dirChildPaths = childPaths.filter(p => treeRootData[p]?.can_have_children);
    const hasContent = node.has_children || childPaths.length > 0;
    const filemeta = node.filemeta || [];
    const tags = node.tags || [];

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!expanded && childPaths.length === 0) {
            // First expand — trigger lazy fetch
            onFetchFolder(node);
        }
        setExpanded(v => !v);
    };

    return (
        <div>
            <div
                className={cn(
                    "flex items-center gap-1 py-1 cursor-pointer hover:bg-white/5 transition-colors select-none text-xs group",
                    isSelected && "bg-signal/20 text-signal",
                    node.deleted && "opacity-40 line-through"
                )}
                style={{ paddingLeft: `${level * 12 + 4}px`, paddingRight: '4px' }}
                onClick={() => onSelect(node)}
                onContextMenu={(e) => { e.preventDefault(); onFileContextMenu(node, e); }}
            >
                {/* Expand chevron */}
                {node.can_have_children ? (
                    <span onClick={handleExpand} className="p-0.5 hover:text-signal shrink-0">
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                ) : (
                    <span className="w-[18px] shrink-0" />
                )}

                {/* Icon */}
                {node.can_have_children ? (
                    expanded
                        ? <FolderOpen size={13} className={hasContent ? 'text-yellow-500 shrink-0' : 'text-red-500/70 shrink-0'} />
                        : <Folder size={13} className={hasContent ? 'text-yellow-500 shrink-0' : 'text-red-500/70 shrink-0'} />
                ) : (
                    <FileIcon size={13} className="text-blue-400 shrink-0" />
                )}

                {/* Name */}
                <span className="ml-1 flex-1 truncate">{node.name_text || (level === 0 ? 'ROOT' : '')}</span>

                {/* Indicators */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    {/* Tag dots */}
                    {tags.slice(0, 3).map(t => (
                        <span
                            key={t.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: t.tagtype.color || '#888' }}
                            title={t.tagtype.name}
                        />
                    ))}
                    {/* filemeta (download available) badge */}
                    {filemeta.length > 0 && (
                        <span className="text-[8px] px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-mono">
                            {filemeta.length}⬇
                        </span>
                    )}
                    {/* success indicator */}
                    {node.success === true && <CheckCircle2 size={9} className="text-green-500" />}
                    {node.success === false && <AlertCircle size={9} className="text-red-500" />}
                </div>
            </div>

            {/* Children */}
            {expanded && (
                <div className="border-l border-white/10">
                    {childPaths.length === 0 ? (
                        <div className="pl-6 py-1 text-[9px] text-gray-600 font-mono">EMPTY</div>
                    ) : (
                        dirChildPaths.map(childPath => (
                            <FileTreeNode
                                key={childPath}
                                fullPath={childPath}
                                level={level + 1}
                                treeRootData={treeRootData}
                                treeAdjMtx={treeAdjMtx}
                                selectedPath={selectedPath}
                                showDeletedFiles={showDeletedFiles}
                                onSelect={onSelect}
                                onFetchFolder={onFetchFolder}
                                onFileContextMenu={onFileContextMenu}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================
// Comment Edit Modal
// ============================================
export const CommentEditModal = ({
    node, onClose, onSave
}: {
    node: FileNode;
    onClose: () => void;
    onSave: (nodeId: number, comment: string) => void;
}) => {
    const [value, setValue] = useState(node.comment || '');
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-void border border-signal/30 rounded-lg p-4 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={14} className="text-signal" />
                    <span className="font-mono text-xs text-white">EDIT COMMENT</span>
                </div>
                <div className="text-[10px] text-gray-500 mb-2 font-mono truncate">{node.name_text}</div>
                <textarea
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded px-2 py-1.5 text-xs text-white font-mono resize-none h-20 focus:outline-none focus:border-signal/50"
                    placeholder="Add a comment..."
                />
                <div className="flex gap-2 mt-3 justify-end">
                    <button onClick={onClose} className="px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded transition-colors">CANCEL</button>
                    <button
                        onClick={() => { onSave(node.id, value); onClose(); }}
                        className="px-3 py-1.5 text-xs font-mono bg-signal text-void font-bold hover:bg-white transition-colors rounded"
                    >SAVE</button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// Download History Modal
// ============================================
export const DownloadHistoryModal = ({
    node, onClose
}: {
    node: FileNode;
    onClose: () => void;
}) => {
    const filemeta = node.filemeta || [];
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-void border border-signal/30 rounded-lg p-4 w-[500px] max-h-[70vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <History size={14} className="text-signal" />
                        <span className="font-mono text-xs text-white">DOWNLOAD HISTORY</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><XCircle size={16} className="text-gray-400" /></button>
                </div>
                <div className="text-[10px] text-gray-500 mb-3 font-mono">{node.full_path_text}</div>
                <div className="flex-1 overflow-auto">
                    {filemeta.length === 0 ? (
                        <div className="text-center py-8 text-gray-600 font-mono text-xs">NO_DOWNLOAD_HISTORY</div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {filemeta.map(f => (
                                <div key={f.id} className="flex items-center gap-3 py-2 px-1 hover:bg-white/5 group">
                                    <Download size={12} className="text-blue-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-white font-mono truncate">{b64DecodeUnicode(f.filename_text)}</div>
                                        <div className="text-[9px] text-gray-500 font-mono">{f.agent_file_id}</div>
                                    </div>
                                    <a
                                        href={directDownloadUrl(f.agent_file_id)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-blue-400 transition-opacity"
                                        title="Download file"
                                    >
                                        <Download size={12} />
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

