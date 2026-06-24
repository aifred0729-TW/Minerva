import React, { useState, useCallback, useMemo, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
    Folder, FolderOpen, ChevronRight, ChevronDown,
    File as FileIcon, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FileNode } from '../../types/files';

const ROW_HEIGHT = 28;

interface FlatRow {
    fullPath: string;
    level: number;
    node: FileNode;
    hasChildren: boolean;
    childCount: number;
}

interface VirtualFileTreeProps {
    rootPaths: string[];
    treeRootData: Record<string, FileNode>;
    treeAdjMtx: Record<string, string[]>;
    selectedPath: string;
    showDeletedFiles: boolean;
    onSelect: (node: FileNode) => void;
    onFetchFolder: (node: FileNode) => void;
    onFileContextMenu: (node: FileNode, e: React.MouseEvent) => void;
}

export const VirtualFileTree = ({
    rootPaths, treeRootData, treeAdjMtx, selectedPath,
    showDeletedFiles, onSelect, onFetchFolder, onFileContextMenu,
}: VirtualFileTreeProps) => {
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const fetchedRef = useRef<Set<string>>(new Set());

    const toggleExpand = useCallback((fullPath: string, node: FileNode) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(fullPath)) {
                next.delete(fullPath);
            } else {
                next.add(fullPath);
                if (!fetchedRef.current.has(fullPath) && (treeAdjMtx[fullPath] || []).length === 0) {
                    fetchedRef.current.add(fullPath);
                    onFetchFolder(node);
                }
            }
            return next;
        });
    }, [treeAdjMtx, onFetchFolder]);

    const flatRows = useMemo(() => {
        const rows: FlatRow[] = [];
        const walk = (paths: string[], level: number) => {
            for (const p of paths) {
                const node = treeRootData[p];
                if (!node) continue;
                if (node.deleted && !showDeletedFiles) continue;
                const childPaths = treeAdjMtx[p] || [];
                const dirChildren = childPaths.filter(cp => treeRootData[cp]?.can_have_children);
                rows.push({ fullPath: p, level, node, hasChildren: node.can_have_children, childCount: dirChildren.length });
                if (expandedPaths.has(p) && node.can_have_children) {
                    walk(dirChildren, level + 1);
                }
            }
        };
        walk(rootPaths, 0);
        return rows;
    }, [rootPaths, treeRootData, treeAdjMtx, showDeletedFiles, expandedPaths]);

    const Row = useCallback(({ index, style, ...rest }: { index: number; style: React.CSSProperties; [key: string]: any }) => {
        const row = flatRows[index];
        if (!row) return null;
        const { fullPath, level, node, hasChildren } = row;
        const isSelected = fullPath === selectedPath;
        const isExpanded = expandedPaths.has(fullPath);
        const filemeta = node.filemeta || [];
        const tags = node.tags || [];
        const hasContent = node.has_children || (treeAdjMtx[fullPath] || []).length > 0;

        return (
            <div style={style}
                className={cn(
                    "flex items-center gap-1 cursor-pointer hover:bg-white/5 transition-colors select-none text-xs group",
                    isSelected && "bg-signal/20 text-signal",
                    node.deleted && "opacity-40 line-through"
                )}
                onClick={() => onSelect(node)}
                onContextMenu={(e) => { e.preventDefault(); onFileContextMenu(node, e); }}
            >
                <div className="flex items-center gap-1 flex-1 min-w-0 h-full" style={{ paddingLeft: `${level * 12 + 4}px`, paddingRight: '4px' }}>
                    {hasChildren ? (
                        <span onClick={(e) => { e.stopPropagation(); toggleExpand(fullPath, node); }} className="p-0.5 hover:text-signal shrink-0">
                            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </span>
                    ) : (
                        <span className="w-[18px] shrink-0" />
                    )}
                    {hasChildren ? (
                        isExpanded
                            ? <FolderOpen size={13} className={hasContent ? 'text-yellow-500 shrink-0' : 'text-red-500/70 shrink-0'} />
                            : <Folder size={13} className={hasContent ? 'text-yellow-500 shrink-0' : 'text-red-500/70 shrink-0'} />
                    ) : (
                        <FileIcon size={13} className="text-blue-400 shrink-0" />
                    )}
                    <span className="ml-1 flex-1 truncate">{node.name_text || (level === 0 ? 'ROOT' : '')}</span>
                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        {tags.slice(0, 3).map((t: any) => (
                            <span key={t.id} className="w-1.5 h-1.5 rounded-full" style={{ background: t.tagtype.color || '#888' }} title={t.tagtype.name} />
                        ))}
                        {filemeta.length > 0 && (
                            <span className="text-[8px] px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-mono">{filemeta.length}⬇</span>
                        )}
                        {node.success === true && <CheckCircle2 size={9} className="text-green-500" />}
                        {node.success === false && <AlertCircle size={9} className="text-red-500" />}
                    </div>
                </div>
            </div>
        );
    }, [flatRows, selectedPath, expandedPaths, treeAdjMtx, onSelect, onFileContextMenu, toggleExpand]);

    if (flatRows.length === 0) {
        return (
            <div className="text-center p-6 text-gray-600">
                <Folder size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-[10px] font-mono">NO_FILE_DATA</p>
                <p className="text-[9px] text-gray-700 mt-1">Run 'ls' to browse</p>
            </div>
        );
    }

    return (
        <AutoSizer>
            {({ height, width }) => {
                if (!height || !width) return null;
                return (
                    <List
                        height={height}
                        width={width}
                        itemCount={flatRows.length}
                        itemSize={ROW_HEIGHT}
                        overscanCount={20}
                    >
                        {Row as any}
                    </List>
                );
            }}
        </AutoSizer>
    );
};
