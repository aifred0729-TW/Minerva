/**
 * MsfFileBrowserPanel — Files tab for Metasploit sessions.
 *
 * Layout, chrome, and node styling match Mythic's FileBrowserPanel/
 * FileTreeItem 1:1. The only difference is the data source: instead of
 * the Mythic `mythictree` GraphQL query, the tree is built from
 * `msfFsCache` (which itself lives in the Mythic operator-preferences
 * blob, see `lib/mythicKVStore.ts`).
 *
 * Behaviour that matches Mythic:
 *   • Nothing runs on mount. No auto-`pwd`, no auto-`ls`. The panel just
 *     reflects whatever is already cached. Operators run `ls` manually
 *     via the refresh button or the right-click "List directory" action,
 *     same way they would in Mythic.
 *   • The Refresh button issues a single `ls` task against the current
 *     working directory ("." — meterpreter resolves it).
 *   • Right-click context menu on a folder gives `List directory` and
 *     `Upload file here`; on a file `View / cat`, `Download`, `Copy path`.
 *   • Three-state folder colouring: accent = known content, red =
 *     listed-but-empty, neutral signal = not listed yet.
 *   • Bottom detail card appears when a file is selected, with the same
 *     Download / Cat / Copy actions Mythic has.
 *
 * Upload flow:
 *   • "Mythic Library" tab picks from `filemeta`. Mythic's storage is
 *     bind-mounted as /mythic_files in the MSF container, so the source
 *     path becomes /mythic_files/<agent_file_id> directly.
 *   • "MSF Server Path" tab is the manual fallback.
 */
import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
    Folder, FolderOpen, ChevronRight, ChevronDown,
    RefreshCw, AlertTriangle, X, Upload, Library, HardDrive, Search,
    FileText, Download, Eye, Copy, XCircle, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@apollo/client/react';
import { cn, b64DecodeUnicode, formatBytes } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { useMsfSession } from './useMsfSession';
import type { MsfSession } from '../Metasploit/msfrpc';
import { GET_UPLOADED_FILES } from '../../lib/api';
import {
    getState as getFsState,
    setListing,
    subscribe as subscribeFs,
    parseLsOutput,
    parentPath,
    joinPath,
    isWindowsPath,
    type FsEntry,
    type FsListing,
} from './msfFsCache';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuState } from '../../types/console';

interface Props {
    sessionId: string;
    session: MsfSession | null;
}

// ── Tree model ────────────────────────────────────────────────────────────

interface TreeNode {
    type: 'dir' | 'file';
    path: string;
    name: string;
    // dir
    listedAt?: string;
    hasContent?: boolean;
    isEmpty?: boolean;
    children?: TreeNode[];
    // file
    entry?: FsEntry;
}

function normalisePath(p: string): string {
    if (!p) return p;
    if (isWindowsPath(p) && /^[A-Za-z]:[\\/]$/.test(p)) return p;
    if (p === '/') return p;
    return p.replace(/[\\/]+$/, '');
}

function leafName(path: string): string {
    const norm = normalisePath(path);
    if (isWindowsPath(norm)) {
        if (/^[A-Za-z]:[\\]?$/.test(norm)) return norm;
        const idx = norm.lastIndexOf('\\');
        return idx >= 0 ? norm.slice(idx + 1) : norm;
    }
    if (norm === '/') return '/';
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(idx + 1) || '/' : norm;
}

function buildTree(listings: Record<string, FsListing>): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const cachedPaths = Object.keys(listings);
    if (cachedPaths.length === 0) return [];

    for (const p of cachedPaths) {
        nodeMap.set(p, {
            type: 'dir',
            path: p,
            name: leafName(p),
            listedAt: listings[p].listedAt,
            hasContent: listings[p].entries.some(e => e.name !== '..'),
            isEmpty: listings[p].entries.every(e => e.name === '..'),
            children: [],
        });
    }

    for (const p of cachedPaths) {
        const dirNode = nodeMap.get(p)!;
        for (const entry of listings[p].entries) {
            if (entry.name === '..' || entry.name === '.') continue;
            const childPath = joinPath(p, entry.name);
            if (entry.isDir) {
                if (!nodeMap.has(childPath)) {
                    nodeMap.set(childPath, {
                        type: 'dir', path: childPath, name: entry.name, children: [],
                    });
                }
                dirNode.children!.push(nodeMap.get(childPath)!);
            } else {
                dirNode.children!.push({
                    type: 'file', path: childPath, name: entry.name, entry,
                });
            }
        }
    }

    // Stitch parent placeholders all the way up to the filesystem root.
    // Critically, when we reach the root (`C:\` on Windows, `/` on POSIX)
    // we still CREATE a placeholder for it instead of bailing out — that
    // way a freshly-listed `C:\Windows` doesn't render as its own tree
    // root; the operator sees the proper `C:\` → `Windows` hierarchy.
    const ensureAncestors = (path: string): TreeNode => {
        const norm = normalisePath(path);
        const existing = nodeMap.get(norm);
        if (existing) return existing;
        const node: TreeNode = {
            type: 'dir', path: norm, name: leafName(norm), children: [],
        };
        nodeMap.set(norm, node);
        const parent = parentPath(norm);
        if (parent !== norm) {
            const parentNode = ensureAncestors(parent);
            if (!parentNode.children!.some(c => c.path === norm)) {
                parentNode.children!.push(node);
            }
        }
        return node;
    };
    for (const p of cachedPaths) {
        const parent = parentPath(p);
        if (parent !== p) {
            const parentNode = ensureAncestors(parent);
            if (!parentNode.children!.some(c => c.path === p)) {
                parentNode.children!.push(nodeMap.get(p)!);
            }
        }
    }

    const allChildPaths = new Set<string>();
    for (const n of nodeMap.values()) {
        if (n.children) for (const c of n.children) allChildPaths.add(c.path);
    }
    const roots = Array.from(nodeMap.values()).filter(n => !allChildPaths.has(n.path));

    const sortNode = (n: TreeNode) => {
        if (!n.children) return;
        n.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        n.children.forEach(sortNode);
    };
    roots.forEach(sortNode);
    roots.sort((a, b) => a.path.localeCompare(b.path));
    return roots;
}

function quotedPath(p: string): string {
    return p.includes(' ') || p.includes('\\') ? `"${p}"` : p;
}

// ── FileTreeItem (visual clone of the Mythic version) ────────────────────

interface NodeProps {
    node: TreeNode;
    level: number;
    selected: TreeNode | null;
    onSelect: (n: TreeNode) => void;
    expandedPaths: Set<string>;
    onToggle: (path: string) => void;
    onContextMenu: (e: React.MouseEvent, n: TreeNode) => void;
}

function MsfFileTreeItem({ node, level, selected, onSelect, expandedPaths, onToggle, onContextMenu }: NodeProps) {
    const isFolder = node.type === 'dir';
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selected?.path === node.path;

    const fetchedAndEmpty = isFolder && node.listedAt !== undefined && !node.hasContent;
    const confirmedHasContent = isFolder && node.hasContent === true;

    // Same three-state colour scheme Mythic uses, mapped to Minerva palette.
    const folderColorClass = !isFolder ? ''
        : confirmedHasContent ? 'text-accent'
        : fetchedAndEmpty     ? 'text-red-500'
        : 'text-signal/70';
    const folderTextClass = !isFolder ? ''
        : confirmedHasContent ? 'text-accent'
        : fetchedAndEmpty     ? 'text-red-400'
        : 'text-signal';

    const handleClick = () => {
        if (isFolder) onToggle(node.path);
        else onSelect(node);
    };

    return (
        <div>
            <div
                className={cn(
                    'flex items-center gap-1.5 py-1 px-1 cursor-pointer transition-colors group text-[13px]',
                    isSelected ? 'bg-signal/15 text-signal' : 'hover:bg-white/5',
                )}
                style={{ paddingLeft: `${level * 14 + 4}px` }}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node)}
                title={node.path}
            >
                {isFolder ? (
                    <span className="w-4 flex items-center justify-center shrink-0 text-signal/70 group-hover:text-accent">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                ) : <span className="w-4" />}

                {isFolder ? (
                    isExpanded
                        ? <FolderOpen size={15} className={folderColorClass} />
                        : <Folder     size={15} className={folderColorClass} />
                ) : (
                    <FileText size={15} className="text-signal" />
                )}

                <span className={cn(
                    'font-mono truncate flex-1',
                    isFolder ? folderTextClass : 'text-signal group-hover:text-accent',
                )}>
                    {node.name || (level === 0 ? '/' : '')}
                </span>

                {!isFolder && node.entry?.size !== undefined && (
                    <span className="text-[10px] text-signal/80 font-mono shrink-0">{formatBytes(node.entry.size)}</span>
                )}
            </div>

            {isFolder && isExpanded && (
                <div>
                    {(node.children?.length ?? 0) > 0 ? (
                        node.children!.map(c => (
                            <MsfFileTreeItem
                                key={c.path}
                                node={c}
                                level={level + 1}
                                selected={selected}
                                onSelect={onSelect}
                                expandedPaths={expandedPaths}
                                onToggle={onToggle}
                                onContextMenu={onContextMenu}
                            />
                        ))
                    ) : (
                        <div
                            className="text-[11px] text-red-400/60 font-mono italic"
                            style={{ paddingLeft: `${(level + 1) * 14 + 20}px` }}
                        >
                            {node.listedAt ? 'Empty or not yet listed' : 'Right-click → List directory to fetch'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Mythic library picker (unchanged from previous revision) ─────────────

interface MythicLibFile {
    agent_file_id: string;
    filename_text: string;
    size?: number;
    comment?: string;
    operator?: { username?: string };
}

function MythicLibraryPicker({ onPick }: { onPick: (file: MythicLibFile, decodedName: string) => void }) {
    const { data, loading, error } = useQuery<any>(GET_UPLOADED_FILES, { fetchPolicy: 'network-only' });
    const [query, setQuery] = useState('');

    const rows = useMemo<MythicLibFile[]>(() => {
        const all: MythicLibFile[] = (data?.filemeta as MythicLibFile[]) || [];
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter(f => b64DecodeUnicode(f.filename_text).toLowerCase().includes(q));
    }, [data, query]);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5 border border-signal/20 rounded-sm px-2 py-1">
                <Search size={11} className="text-signal" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter Mythic library…"
                    className="flex-1 bg-transparent text-[12px] font-mono text-signal focus:outline-none placeholder:text-signal/60"
                    autoFocus
                />
                {rows.length > 0 && (
                    <span className="text-[10px] font-mono text-signal/80 shrink-0">{rows.length} match{rows.length === 1 ? '' : 'es'}</span>
                )}
            </div>
            <div className="border border-signal/15 rounded-sm bg-void/80 max-h-[240px] overflow-y-auto cyber-scrollbar">
                {loading && (
                    <div className="px-3 py-4 text-[11px] font-mono text-signal flex items-center gap-2">
                        <Loader2 size={11} className="animate-spin" /> Loading Mythic library…
                    </div>
                )}
                {error && <div className="px-3 py-2 text-[11px] font-mono text-red-500">{error.message}</div>}
                {!loading && !error && rows.length === 0 && (
                    <div className="px-3 py-4 text-center text-[11px] font-mono text-signal/80">
                        {query ? 'No files match.' : 'No files in Mythic library — upload one in the Files page first.'}
                    </div>
                )}
                {rows.map(f => {
                    const name = b64DecodeUnicode(f.filename_text);
                    return (
                        <button
                            key={f.agent_file_id}
                            onClick={() => onPick(f, name)}
                            className="w-full text-left px-2.5 py-1.5 border-b border-signal/10 hover:bg-signal/5 transition-colors group"
                            title={f.comment || f.agent_file_id}
                        >
                            <div className="flex items-center gap-2 text-[12px] font-mono">
                                <FileText size={11} className="text-accent shrink-0" />
                                <span className="text-signal truncate flex-1">{name}</span>
                                <span className="text-signal/80 text-[10px] tabular-nums shrink-0">
                                    {f.size !== undefined ? formatBytes(f.size) : '—'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[9px] font-mono text-signal/80 ml-5">
                                <span className="truncate">{f.agent_file_id}</span>
                                {f.operator?.username && <span>· {f.operator.username}</span>}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function joinRemote(dir: string, name: string): string {
    const sepCh = isWindowsPath(dir) ? '\\' : '/';
    const trimmed = dir.endsWith(sepCh) ? dir.slice(0, -1) : dir;
    return `${trimmed}${sepCh}${name}`;
}

function UploadDialog({ targetDir, sessionType, onSubmit, onClose }: {
    targetDir: string;
    sessionType: string;
    onSubmit: (localPath: string, remotePath: string) => void;
    onClose: () => void;
}) {
    const sepCh = isWindowsPath(targetDir) ? '\\' : '/';
    const [mode, setMode] = useState<'library' | 'manual'>('library');
    const [picked, setPicked] = useState<{ uuid: string; name: string } | null>(null);
    const [manualSource, setManualSource] = useState('');
    const [remotePath, setRemotePath] = useState(targetDir.endsWith(sepCh) ? targetDir : targetDir + sepCh);

    const canSubmit = sessionType === 'meterpreter' && remotePath.trim() && (
        (mode === 'library' && picked) || (mode === 'manual' && manualSource.trim())
    );

    const handleSubmit = () => {
        if (!canSubmit) return;
        const source = mode === 'library'
            ? `/mythic_files/${picked!.uuid}`
            : manualSource.trim();
        onSubmit(source, remotePath.trim());
    };

    return (
        <div className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
            <div className="border border-signal/30 bg-machine/90 rounded-md p-4 w-[560px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[12px] font-mono uppercase tracking-[0.25em] text-signal">
                        <Upload size={13} className="text-accent" /> Meterpreter Upload
                    </div>
                    <button onClick={onClose} className="text-signal hover:text-red-500"><X size={14} /></button>
                </div>
                <div className="flex gap-1 mb-3">
                    <button onClick={() => setMode('library')}
                        className={cn('flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono border transition-colors rounded-sm',
                            mode === 'library' ? 'border-accent bg-accent/10 text-accent' : 'border-signal/30 text-signal hover:bg-signal/5')}>
                        <Library size={11} /> Mythic Library
                    </button>
                    <button onClick={() => setMode('manual')}
                        className={cn('flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono border transition-colors rounded-sm',
                            mode === 'manual' ? 'border-accent bg-accent/10 text-accent' : 'border-signal/30 text-signal hover:bg-signal/5')}>
                        <HardDrive size={11} /> MSF Server Path
                    </button>
                </div>
                {sessionType !== 'meterpreter' && (
                    <div className="mb-3 border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-mono text-amber-400">
                        Shell sessions can't use meterpreter upload — fall back to `wget`/`curl` from the terminal.
                    </div>
                )}
                {mode === 'library' ? (
                    picked ? (
                        <div className="mb-3 border border-signal/20 rounded-sm bg-void/60 px-2.5 py-1.5">
                            <div className="flex items-center gap-2 text-[12px] font-mono">
                                <Library size={11} className="text-accent shrink-0" />
                                <span className="text-signal truncate flex-1">{picked.name}</span>
                                <button onClick={() => setPicked(null)} className="text-[10px] font-mono text-signal hover:text-red-500">change</button>
                            </div>
                            <div className="text-[10px] font-mono text-signal/80 ml-5">/mythic_files/{picked.uuid}</div>
                        </div>
                    ) : (
                        <MythicLibraryPicker onPick={(f, name) => {
                            setPicked({ uuid: f.agent_file_id, name });
                            setRemotePath(joinRemote(targetDir, name));
                        }} />
                    )
                ) : (
                    <label className="block mb-3">
                        <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-signal mb-1">
                            Source (on MSF server filesystem)
                        </span>
                        <input value={manualSource} onChange={(e) => setManualSource(e.target.value)}
                            placeholder="/tmp/payload.exe"
                            className="w-full bg-void border border-signal/30 px-2 py-1 font-mono text-[12px] text-signal focus:outline-none focus:border-accent rounded-sm" />
                    </label>
                )}
                <label className="block">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-signal mb-1">Destination (on target)</span>
                    <input value={remotePath} onChange={(e) => setRemotePath(e.target.value)}
                        className="w-full bg-void border border-signal/30 px-2 py-1 font-mono text-[12px] text-signal focus:outline-none focus:border-accent rounded-sm" />
                </label>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="border border-signal/30 text-signal px-3 py-1 text-[11px] font-mono hover:bg-signal/5 rounded-sm">Cancel</button>
                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className="bg-accent text-void px-3 py-1 text-[11px] font-mono font-bold rounded-sm hover:bg-accent/80 disabled:opacity-40">
                        Upload
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────

export function MsfFileBrowserPanel({ sessionId, session }: Props) {
    const sessionType = session?.type || 'meterpreter';
    const isMeterpreter = sessionType === 'meterpreter';
    const { runAndWait } = useMsfSession(sessionId, sessionType, true);

    const fsState = useSyncExternalStore(
        useCallback((cb: () => void) => subscribeFs(sessionId, cb), [sessionId]),
        useCallback(() => getFsState(sessionId), [sessionId]),
        useCallback(() => getFsState(sessionId), [sessionId]),
    );
    const tree = useMemo(() => buildTree(fsState.listings), [fsState.listings]);

    // ── Selection / expand / refresh state ───────────────────────────────
    const [selected, setSelected] = useState<TreeNode | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
        const init = new Set<string>();
        for (const p of Object.keys(fsState.listings)) init.add(p);
        return init;
    });
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
    const [busyPath, setBusyPath] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadFor, setUploadFor] = useState<string | null>(null);

    const handleToggleExpand = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

    // ── Manual `ls` task. Mirrors Mythic's Refresh / right-click "ls" ────
    const doLs = useCallback(async (path: string) => {
        setBusyPath(path);
        setError(null);
        try {
            const cmd = isMeterpreter ? `ls ${quotedPath(path)}` : `ls -la ${quotedPath(path)}`;
            const task = await runAndWait(cmd, { origin: 'file-browser', timeoutMs: 15_000 });
            const { entries, listingPath } = parseLsOutput(task.response_text);
            const finalPath = listingPath || path;
            if (entries.length > 0 || finalPath) {
                setListing(sessionId, finalPath, entries);
                setExpandedPaths(prev => {
                    const next = new Set(prev);
                    next.add(finalPath);
                    return next;
                });
            }
        } catch (e: any) {
            setError(e?.message || `ls failed for ${path}`);
        } finally {
            setBusyPath(null);
        }
    }, [runAndWait, sessionId, isMeterpreter]);

    // ── Refresh = ls of "." (current cwd), matching Mythic SCAN behaviour ─
    const handleRefresh = useCallback(async () => {
        await doLs('.');
    }, [doLs]);

    // ── Context menu actions ──────────────────────────────────────────────
    const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
        e.preventDefault();
        setCtxMenu({
            x: e.clientX, y: e.clientY,
            isDir: node.type === 'dir',
            path: node.path,
            name: node.name,
        });
    }, []);

    const onContextAction = useCallback(async (action: string, path: string, name: string) => {
        setCtxMenu(null);
        if (action === 'ls') { await doLs(path); return; }
        if (action === 'upload') { setUploadFor(path); return; }
        if (action === 'cat') {
            await runAndWait(`cat ${quotedPath(path)}`, { origin: 'file-browser', timeoutMs: 15_000 });
            snackActions.success(`cat ${name} dispatched — see console output`);
            return;
        }
        if (action === 'download') {
            if (!window.confirm(`Download ${name}?\n\nFile will be pulled to MSF's loot directory on the server.`)) return;
            await runAndWait(`download ${quotedPath(path)}`, { origin: 'file-browser', timeoutMs: 30_000 });
            snackActions.success(`download ${name} dispatched — see MSF loot directory`);
            return;
        }
        if (action === 'copy') {
            navigator.clipboard.writeText(path);
            snackActions.success('Path copied');
            return;
        }
    }, [doLs, runAndWait]);

    const handleUploadSubmit = useCallback(async (localPath: string, remotePath: string) => {
        setUploadFor(null);
        try {
            await runAndWait(`upload ${quotedPath(localPath)} ${quotedPath(remotePath)}`, {
                origin: 'file-browser',
                timeoutMs: 60_000,
            });
            snackActions.success(`upload ${localPath} → ${remotePath} dispatched`);
            await doLs(parentPath(remotePath));
        } catch (e: any) {
            snackActions.error(e?.message || 'upload failed');
        }
    }, [runAndWait, doLs]);

    // ── Selected-file action handlers (bottom card) ──────────────────────
    const handleSelectedDownload = useCallback(async () => {
        if (!selected || selected.type !== 'file') return;
        if (!window.confirm(`Download ${selected.name}?`)) return;
        await runAndWait(`download ${quotedPath(selected.path)}`, { origin: 'file-browser', timeoutMs: 30_000 });
        snackActions.success(`download ${selected.name} dispatched`);
    }, [selected, runAndWait]);

    const handleSelectedCat = useCallback(async () => {
        if (!selected || selected.type !== 'file') return;
        await runAndWait(`cat ${quotedPath(selected.path)}`, { origin: 'file-browser', timeoutMs: 15_000 });
        snackActions.success(`cat ${selected.name} dispatched — see console output`);
    }, [selected, runAndWait]);

    const host = session?.session_host || session?.target_host || '';

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Toolbar — matches Mythic's host bar */}
            <div className="shrink-0 flex items-center gap-2 mb-2 bg-machine/40 rounded-md px-2 py-1.5 border border-signal/15">
                <HardDrive size={14} className="text-signal shrink-0" />
                <span className="text-xs font-mono text-signal truncate flex-1" title={host}>
                    {host || '— host unknown —'}
                </span>
                <button
                    onClick={handleRefresh}
                    disabled={busyPath !== null}
                    className={cn(
                        'p-1.5 rounded transition-colors shrink-0',
                        busyPath ? 'text-accent' : 'text-signal hover:text-accent hover:bg-signal/10'
                    )}
                    title="Refresh — sends `ls .` to the target"
                >
                    {busyPath ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            {/* Legend — same as Mythic */}
            <div className="shrink-0 flex items-center gap-3 mb-1 text-[10px] font-mono px-1 text-signal/80">
                <span className="flex items-center gap-1"><Folder size={10} className="text-accent" /> Has content</span>
                <span className="flex items-center gap-1"><Folder size={10} className="text-signal/70" /> Not listed</span>
                <span className="flex items-center gap-1"><Folder size={10} className="text-red-500" /> Empty</span>
            </div>

            {/* Error banner */}
            {error && (
                <div className="shrink-0 border border-red-500/30 bg-red-500/10 px-2 py-1.5 flex items-center gap-2 rounded-md mb-2">
                    <AlertTriangle size={12} className="text-red-500 shrink-0" />
                    <span className="text-[11px] font-mono text-red-500 break-all flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="text-signal hover:text-red-500"><X size={11} /></button>
                </div>
            )}

            {/* Tree */}
            <div className="flex-1 overflow-auto cyber-scrollbar pr-1">
                {tree.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-signal/80 text-xs font-mono">
                        <Folder size={28} className="mb-2 opacity-30 text-signal" />
                        <span className="text-sm text-signal">NO_FILE_DATA</span>
                        <span className="text-[11px] mt-1 text-signal/80">Run `ls` to populate the tree</span>
                        <button
                            onClick={handleRefresh}
                            disabled={busyPath !== null}
                            className="mt-3 px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-sm text-xs hover:bg-accent/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                            <RefreshCw size={12} className={busyPath ? 'animate-spin' : ''} /> SCAN
                        </button>
                    </div>
                ) : (
                    tree.map((node) => (
                        <MsfFileTreeItem
                            key={node.path}
                            node={node}
                            level={0}
                            selected={selected}
                            onSelect={setSelected}
                            expandedPaths={expandedPaths}
                            onToggle={handleToggleExpand}
                            onContextMenu={handleContextMenu}
                        />
                    ))
                )}
            </div>

            {/* Selected file detail card */}
            <AnimatePresence>
                {selected && selected.type === 'file' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0 mt-2 overflow-hidden"
                    >
                        <div className="bg-machine/40 border border-signal/15 rounded-md p-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-mono text-signal truncate flex-1">{selected.name}</span>
                                <button onClick={() => setSelected(null)} className="p-0.5 hover:bg-white/10 rounded-sm text-signal">
                                    <XCircle size={14} />
                                </button>
                            </div>
                            <div className="text-[11px] text-signal/80 font-mono space-y-0.5">
                                <div className="break-all">Path: {selected.path}</div>
                                {selected.entry?.size !== undefined && <div>Size: {formatBytes(selected.entry.size)}</div>}
                                {selected.entry?.mtime && <div>Modified: {selected.entry.mtime}</div>}
                                {selected.entry?.mode && <div>Mode: {selected.entry.mode}</div>}
                            </div>
                            <div className="flex gap-1.5 mt-2">
                                <button onClick={handleSelectedDownload}
                                    className="flex items-center gap-1 px-2 py-1 bg-accent/10 border border-accent/30 text-accent rounded-sm text-[11px] hover:bg-accent/20">
                                    <Download size={11} /> Download
                                </button>
                                <button onClick={handleSelectedCat}
                                    className="flex items-center gap-1 px-2 py-1 bg-signal/10 border border-signal/30 text-signal rounded-sm text-[11px] hover:bg-signal/20">
                                    <Eye size={11} /> Cat
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(selected.path); snackActions.success('Path copied'); }}
                                    className="flex items-center gap-1 px-2 py-1 bg-machine/40 border border-signal/15 text-signal rounded-sm text-[11px] hover:bg-signal/5">
                                    <Copy size={11} /> Path
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Right-click menu */}
            {ctxMenu && (
                <ContextMenu
                    menu={ctxMenu}
                    onAction={onContextAction}
                    onClose={() => setCtxMenu(null)}
                />
            )}

            {/* Upload modal */}
            {uploadFor && (
                <UploadDialog
                    targetDir={uploadFor}
                    sessionType={sessionType}
                    onSubmit={handleUploadSubmit}
                    onClose={() => setUploadFor(null)}
                />
            )}

        </div>
    );
}
