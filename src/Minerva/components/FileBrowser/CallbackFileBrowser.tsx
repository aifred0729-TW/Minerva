import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useLazyQuery, useMutation, useSubscription } from '@apollo/client';
import {
    Folder,
    Home,
    ChevronRight,
    ChevronDown,
    Monitor,
    Server,
    HardDrive,
    Download,
    Upload,
    RefreshCw,
    Eye,
    Filter,
    Copy,
    FolderSearch,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    SlidersHorizontal,
    ClipboardList,
    Columns,
    UploadCloud,
    ChevronUp,
    MessageSquare,
    Trash2,
    History,
    XCircle,
    EyeOff,
    ShieldAlert,
    AlertCircle,
    FileIcon,
    CheckCircle2,
    Edit2,
}from 'lucide-react';
import { cn, formatBytes, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { useGetMythicSetting, useSetMythicSetting } from '../MythicSavedUserSetting';
import {
    GET_FILE_TREE_ROOT, GET_FILE_TREE_FOLDER_WITH_PARENTS,
    CREATE_TASK_MUTATION, MYTHICTREE_FILE_SUBSCRIPTION,
    FILEBROWSER_TASK_SUBSCRIPTION, GET_LOADED_COMMANDS_FOR_UI,
    UPDATE_MYTHICTREE_COMMENT,
} from '../../lib/api';
import type { FileNode, ContextMenuItemDef } from '../../types/files';
import type { ContextMenuState } from '../../types/console';
import { COLUMN_DEFS, getMetadata, getAllParentPaths, deduplicateById } from './utils';
import { ContextMenu, FileTreeNode, CommentEditModal, DownloadHistoryModal } from './FileTree';
import { MythicServerFiles } from './ServerFiles';

export const FileBrowser = ({ host, callbackId }: { host: string, callbackId: number }) => {
    // Tab state: 'callback' for target machine files, 'mythic' for C2 server files
    const [activeTab, setActiveTab] = useState<'callback' | 'mythic'>('callback');
    const [mythicSubTab, setMythicSubTab] = useState<'downloads' | 'uploads' | 'screenshots'>('downloads');

    return (
        <div className="flex flex-col h-full border border-ghost/30 bg-void rounded overflow-hidden">
            {/* Tab Headers */}
            <div className="flex border-b border-ghost/30 bg-black/30">
                <button
                    onClick={() => setActiveTab('callback')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 text-xs font-mono transition-colors border-b-2",
                        activeTab === 'callback' 
                            ? "text-signal border-signal bg-white/5" 
                            : "text-gray-400 border-transparent hover:text-white hover:bg-white/5"
                    )}
                >
                    <Monitor size={14} />
                    CALLBACK_FILES
                </button>
                <button
                    onClick={() => setActiveTab('mythic')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 text-xs font-mono transition-colors border-b-2",
                        activeTab === 'mythic' 
                            ? "text-signal border-signal bg-white/5" 
                            : "text-gray-400 border-transparent hover:text-white hover:bg-white/5"
                    )}
                >
                    <Server size={14} />
                    MYTHIC_C2_FILES
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'callback' ? (
                    <CallbackFileBrowser host={host} callbackId={callbackId} />
                ) : (
                    <MythicServerFiles subTab={mythicSubTab} setSubTab={setMythicSubTab} />
                )}
            </div>
        </div>
    );
};

// ============================================
// Callback File Browser (Target Machine Files)
// ============================================
export const CallbackFileBrowser = ({ host, callbackId }: { host: string, callbackId: number }) => {
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const [updateCommentMutation] = useMutation(UPDATE_MYTHICTREE_COMMENT);
    const fromNow = useRef<string>(new Date().toISOString());

    // ── Loaded commands cache (for dynamic action labels) ────────────
    // key = callback_id (number or string), value = array of loadedcommand objects
    const loadedCommandsRef = useRef<Record<number, Array<{ id: number; command: { id: number; cmd: string; supported_ui_features: string[] } }>>>({});
    const loadingCommandsRef = useRef<boolean>(false);
    const [getLoadedCommandsForUI] = useLazyQuery(GET_LOADED_COMMANDS_FOR_UI, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            if (data.loadedcommands?.length > 0) {
                const cbId: number = data.loadedcommands[0].callback_id;
                loadedCommandsRef.current[cbId] = data.loadedcommands;
            }
            loadingCommandsRef.current = false;
        },
        onError: () => { loadingCommandsRef.current = false; },
    });
    // Eagerly fetch commands for this callback on mount
    useEffect(() => {
        if (!loadedCommandsRef.current[callbackId]) {
            loadingCommandsRef.current = true;
            getLoadedCommandsForUI({ variables: { callback_id: callbackId } });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callbackId]);

    const getLoadedCommandForUIFeature = useCallback((cbId: number, uifeature: string) => {
        const cmds = loadedCommandsRef.current[cbId] || [];
        return cmds.find(c => c.command.supported_ui_features.includes(uifeature));
    }, []);

    // ── In-memory tree store ──────────────────────────────────
    // treeRootDataRef: full_path_text → FileNode (never cleared, accumulates)
    const treeRootDataRef = useRef<Record<string, FileNode>>({});
    // treeAdjMtx: parent_path_text → [child full_path_text, ...]  (state for re-renders)
    const [treeAdjMtx, setTreeAdjMtx] = useState<Record<string, string[]>>({});

    // ── Navigation ────────────────────────────────────────────
    const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
    const [currentPath, setCurrentPath] = useState<string>('');
    const navHistoryRef = useRef<(FileNode | null)[]>([null]);  // null = root
    const [historyIndex, setHistoryIndex] = useState<number>(0);

    // ── UI Feature toggles ────────────────────────────────────
    const [showDeletedFiles, setShowDeletedFiles] = useState(false);
    const [autoLsEmptyDirs, setAutoLsEmptyDirs] = useState<boolean>(() => {
        try { return localStorage.getItem('minerva_fb_auto_ls') === 'true'; } catch { return false; }
    });
    const autoLsSetting = useGetMythicSetting({setting_name:'autoTaskLsOnEmptyDirectories', default_value: false});
    const [setMythicSettingFn] = useSetMythicSetting() as any;
    useEffect(() => { setAutoLsEmptyDirs(!!autoLsSetting); }, [autoLsSetting]);
    const handleToggleAutoLs = () => {
        const next = !autoLsEmptyDirs;
        setAutoLsEmptyDirs(next);
        setMythicSettingFn({setting_name:'autoTaskLsOnEmptyDirectories', value: next});
        try { localStorage.setItem('minerva_fb_auto_ls', String(next)); } catch {}
    };

    // ── Table state ───────────────────────────────────────────
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [filterText, setFilterText] = useState('');
    const [showFilter, setShowFilter] = useState(false);

    // ── Column visibility (persisted) ─────────────────────────
    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        try {
            const s = localStorage.getItem('minerva_fb_columns');
            if (s) return JSON.parse(s);
        } catch {}
        return COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key);
    });
    const handleSetVisibleCols = (cols: string[]) => {
        setVisibleCols(cols);
        try { localStorage.setItem('minerva_fb_columns', JSON.stringify(cols)); } catch {}
    };
    const [showColDialog, setShowColDialog] = useState(false);

    // ── Per-column filters (persisted) ────────────────────────
    const [colFilters, setColFilters] = useState<Record<string, string>>(() => {
        try {
            const s = localStorage.getItem('minerva_fb_col_filters');
            if (s) return JSON.parse(s);
        } catch {}
        return {};
    });
    const setColFilter = (key: string, value: string) => {
        const next = { ...colFilters };
        if (value) next[key] = value; else delete next[key];
        setColFilters(next);
        try { localStorage.setItem('minerva_fb_col_filters', JSON.stringify(next)); } catch {}
    };
    const [filteringColKey, setFilteringColKey] = useState<string | null>(null);
    const [filterColInput, setFilterColInput] = useState('');

    // ── Upload dialog ─────────────────────────────────────────
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploadDestPath, setUploadDestPath] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    // ── Editable path bar ─────────────────────────────────────
    const [pathInputValue, setPathInputValue] = useState('/');
    useEffect(() => { setPathInputValue(currentPath || '/'); }, [currentPath]);

    // ── Modals ────────────────────────────────────────────────
    const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
    const [editingComment, setEditingComment] = useState<FileNode | null>(null);
    const [downloadHistoryNode, setDownloadHistoryNode] = useState<FileNode | null>(null);

    // ── Loading state ─────────────────────────────────────────
    const [folderLoading, setFolderLoading] = useState(false);
    const rootQueriedRef = useRef(false);

    // ────────────────────────────────────────────────────────────
    // MERGE HELPERS
    // ────────────────────────────────────────────────────────────
    const mergeNode = useCallback((node: FileNode) => {
        const key = node.full_path_text;
        const existing = treeRootDataRef.current[key];
        if (!existing) {
            treeRootDataRef.current[key] = { ...node };
        } else {
            treeRootDataRef.current[key] = {
                ...existing,
                ...node,
                deleted: node.deleted,
                has_children: node.has_children || existing.has_children,
                success: node.success !== null ? node.success : existing.success,
                comment: node.comment !== undefined ? node.comment : existing.comment,
                filemeta: deduplicateById([
                    ...(existing.filemeta || []),
                    ...(node.filemeta || [])
                ]),
                tags: deduplicateById([
                    ...(existing.tags || []),
                    ...(node.tags || [])
                ]),
            };
        }
    }, []);

    const mergeIntoAdjMtx = useCallback((nodes: FileNode[]) => {
        setTreeAdjMtx(prev => {
            const next = { ...prev };
            nodes.forEach(node => {
                const parent = node.parent_path_text;
                if (!next[parent]) next[parent] = [];
                if (!next[parent].includes(node.full_path_text)) {
                    next[parent] = [...next[parent], node.full_path_text];
                }
            });
            return next;
        });
    }, []);

    // ────────────────────────────────────────────────────────────
    // ROOT QUERY — loads all root-level entries once
    // ────────────────────────────────────────────────────────────
    const { loading: rootLoading } = useQuery(GET_FILE_TREE_ROOT, {
        variables: { host },
        onCompleted: (data) => {
            const nodes: FileNode[] = data.mythictree || [];
            nodes.forEach(mergeNode);
            mergeIntoAdjMtx(nodes);
            rootQueriedRef.current = true;
        },
        fetchPolicy: 'no-cache',
    });

    // ────────────────────────────────────────────────────────────
    // FOLDER LAZY QUERY — includes parents + self for full context
    // ────────────────────────────────────────────────────────────
    const [getFolderData] = useLazyQuery(GET_FILE_TREE_FOLDER_WITH_PARENTS, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            const allNodes: FileNode[] = [
                ...(data.parents || []),
                ...(data.children || []),
                ...(data.self || []),
            ];
            allNodes.forEach(mergeNode);
            mergeIntoAdjMtx(allNodes);
            setFolderLoading(false);

            // Update selected node with fresh server data
            if (data.self?.length > 0 && selectedNode) {
                const fresh = data.self[0];
                const merged = treeRootDataRef.current[fresh.full_path_text];
                if (merged) setSelectedNode({ ...merged });
            }

            // Auto-ls: if the folder is empty and option is enabled
            if (autoLsEmptyDirs && selectedNode && selectedNode.full_path_text !== '') {
                const children = data.children || [];
                if (children.length === 0 && data.self?.[0]?.success === null) {
                    doTask('ls', selectedNode.full_path_text, selectedNode.name_text, true);
                }
            }
        },
        onError: () => setFolderLoading(false),
    });

    // ────────────────────────────────────────────────────────────
    // TASK STATUS SUBSCRIPTION — surface file_browser task errors
    // ────────────────────────────────────────────────────────────
    const taskSubFromNow = useRef<string>(new Date().toISOString());
    useSubscription(FILEBROWSER_TASK_SUBSCRIPTION, {
        variables: { now: taskSubFromNow.current, callback_id: callbackId },
        onData: ({ data: subData }) => {
            const tasks: Array<{ id: number; display_id: number; status: string; command_name: string; opsec_pre_blocked: boolean; opsec_post_blocked: boolean }> =
                subData.data?.task_stream || [];
            tasks.forEach(t => {
                if (t.opsec_pre_blocked || t.opsec_post_blocked) {
                    snackActions.warning(`OPSEC block on '${t.command_name}' (task #${t.display_id})`);
                } else if (t.status === 'error') {
                    snackActions.error(`'${t.command_name}' failed (task #${t.display_id})`);
                }
            });
        },
    });

    // ────────────────────────────────────────────────────────────
    // REAL-TIME SUBSCRIPTION
    // ────────────────────────────────────────────────────────────
    useSubscription(MYTHICTREE_FILE_SUBSCRIPTION, {
        variables: { now: fromNow.current, host },
        onData: ({ data: subData }) => {
            const nodes: FileNode[] = subData.data?.mythictree_stream || [];
            if (nodes.length === 0) return;
            nodes.forEach(mergeNode);
            mergeIntoAdjMtx(nodes);
            // Refresh selected node if it was updated
            if (selectedNode) {
                const updated = nodes.find(n => n.full_path_text === selectedNode.full_path_text);
                if (updated) {
                    const merged = treeRootDataRef.current[selectedNode.full_path_text];
                    if (merged) setSelectedNode({ ...merged });
                }
            }
        },
    });

    // ────────────────────────────────────────────────────────────
    // NAVIGATION
    // ────────────────────────────────────────────────────────────
    const fetchFolder = useCallback((node: FileNode) => {
        setFolderLoading(true);
        const parents = getAllParentPaths(node.full_path_text);
        getFolderData({ variables: { parent_path_text: node.full_path_text, host, parents } });
    }, [getFolderData, host]);

    const navigateTo = useCallback((node: FileNode | null) => {
        const newIndex = historyIndex + 1;
        navHistoryRef.current = [...navHistoryRef.current.slice(0, newIndex), node];
        setHistoryIndex(newIndex);
        setSelectedNode(node);
        setCurrentPath(node?.full_path_text || '');
        setSelectedRows(new Set());
        if (node) fetchFolder(node);
    }, [historyIndex, fetchFolder]);

    const handleBack = () => {
        if (historyIndex <= 0) return;
        const newIdx = historyIndex - 1;
        const node = navHistoryRef.current[newIdx];
        setHistoryIndex(newIdx);
        setSelectedNode(node);
        setCurrentPath(node?.full_path_text || '');
        setSelectedRows(new Set());
        if (node) fetchFolder(node);
    };

    const handleForward = () => {
        if (historyIndex >= navHistoryRef.current.length - 1) return;
        const newIdx = historyIndex + 1;
        const node = navHistoryRef.current[newIdx];
        setHistoryIndex(newIdx);
        setSelectedNode(node);
        setCurrentPath(node?.full_path_text || '');
        setSelectedRows(new Set());
        if (node) fetchFolder(node);
    };

    const handleGoHome = () => navigateTo(null);

    const handleMoveUp = () => {
        if (!selectedNode) return;
        const parent = selectedNode.parent_path_text;
        if (parent === undefined || parent === selectedNode.full_path_text) return;
        const parentNode = treeRootDataRef.current[parent];
        if (parentNode) {
            navigateTo(parentNode);
        } else {
            const isWin = parent.includes('\\');
            const sep = isWin ? '\\' : '/';
            const grandParent = parent.split(sep).slice(0, -1).join(sep) || '';
            const syntheticParent: FileNode = {
                id: -1,
                name_text: parent.split(sep).pop() || parent,
                full_path_text: parent,
                parent_path_text: grandParent,
                can_have_children: true,
                tree_type: 'file',
                deleted: false,
                metadata: {},
                host,
            };
            navigateTo(syntheticParent);
        }
    };

    const handleNavigateToPath = (path: string) => {
        const normalized = path.replace(/[/\\]+$/, '') || '/';
        if (normalized === '/' || normalized === '') { handleGoHome(); return; }
        const cached = treeRootDataRef.current[normalized];
        if (cached) {
            navigateTo(cached);
        } else {
            // Synthesise a dir node, let fetchFolder populate it from the server
            const isWin = normalized.includes('\\');
            const sep = isWin ? '\\' : '/';
            const parts = normalized.split(sep);
            const synthetic: FileNode = {
                id: -1,
                name_text: parts[parts.length - 1] || normalized,
                full_path_text: normalized,
                parent_path_text: parts.slice(0, -1).join(sep) || '',
                can_have_children: true,
                tree_type: 'file',
                deleted: false,
                metadata: {},
                host,
            };
            navigateTo(synthetic);
        }
    };

    // ────────────────────────────────────────────────────────────
    // TASK HELPERS
    // ────────────────────────────────────────────────────────────
    const doTask = useCallback((command: string, path: string, name: string, _isDir: boolean, cbId?: number) => {
        const targetCb = cbId ?? callbackId;
        createTask({ variables: { callback_id: targetCb, command, params: path } })
            .then(() => snackActions.info(`Tasked '${command} ${name}'`))
            .catch((e: unknown) => snackActions.error(`${command} failed: ${e.message}`));
    }, [callbackId, createTask]);

    const handleRefresh = () => {
        if (selectedNode) {
            fetchFolder(selectedNode);
            doTask('ls', selectedNode.full_path_text || '.', selectedNode.name_text, true);
        }
    };

    // ────────────────────────────────────────────────────────────
    // UPLOAD HANDLER
    // ────────────────────────────────────────────────────────────
    const handleUploadSubmit = async () => {
        if (!uploadFile) { snackActions.warning('Select a file first'); return; }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('name', uploadFile.name);
            const resp = await fetch('/api/v1.4/files/', { method: 'POST', body: formData });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const agentFileId: string = json.agent_file_id || json.id;
            // Task the upload command
            const uploadCmd = getLoadedCommandForUIFeature(callbackId, 'file_browser:upload');
            const cmd = uploadCmd?.command?.cmd || 'upload';
            const path = uploadDestPath || (selectedNode?.full_path_text ?? '.');
            await createTask({ variables: {
                callback_id: callbackId,
                command: cmd,
                params: JSON.stringify({ remote_path: path, file_id: agentFileId })
            }});
            snackActions.success(`Upload tasked: ${uploadFile.name} → ${path}`);
            setUploadDialogOpen(false);
            setUploadFile(null);
            setUploadDestPath('');
        } catch (e: unknown) {
            snackActions.error(`Upload failed: ${e.message}`);
        } finally {
            setUploading(false);
        }
    };

    // ────────────────────────────────────────────────────────────
    // CONTEXT MENU ITEM BUILDER
    // ────────────────────────────────────────────────────────────
    const buildContextMenuItems = useCallback((node: FileNode | null, isDir: boolean): ContextMenuItemDef[] => {
        if (!node) return [];
        const lsCmd    = getLoadedCommandForUIFeature(callbackId, 'file_browser:list');
        const dlCmd    = getLoadedCommandForUIFeature(callbackId, isDir ? 'file_browser:download_folder' : 'file_browser:download');
        const rmCmd    = getLoadedCommandForUIFeature(callbackId, isDir ? 'file_browser:remove_folder' : 'file_browser:remove');
        const upCmd    = getLoadedCommandForUIFeature(callbackId, 'file_browser:upload');

        const __meta = getMetadata(node);
        const items: ContextMenuItemDef[] = [
            // Copy sub-menu
            {
                action: 'copy_menu', label: 'Copy to clipboard', icon: <ClipboardList size={13} />,
                children: [
                    { action: 'copy_name',     label: `Name`,          icon: <Copy size={11} /> },
                    { action: 'copy',          label: `Full path`,     icon: <Copy size={11} /> },
                    { action: 'copy_metadata', label: `Metadata JSON`, icon: <Copy size={11} /> },
                ]
            },
            { action: 'div0', label: '', divider: true },
        ];

        if (isDir) {
            items.push(
                { action: 'ls',        label: lsCmd ? `List (${lsCmd.command.cmd})` : 'List (unsupported)',              icon: <FolderSearch size={13} />, disabled: !lsCmd },
                { action: 'upload',    label: upCmd ? `Upload here (${upCmd.command.cmd})` : 'Upload here',              icon: <Upload size={13} /> },
                { action: 'edit_comment', label: 'Edit comment', icon: <MessageSquare size={13} /> },
                { action: 'div1', label: '', divider: true },
                { action: 'rm_folder', label: rmCmd ? `Remove folder (${rmCmd.command.cmd})` : 'Remove folder (unsupported)', icon: <Trash2 size={13} />, danger: true, disabled: !rmCmd },
            );
        } else {
            items.push(
                { action: 'cat',              label: 'View / cat',                                                              icon: <Eye size={13} /> },
                { action: 'download',         label: dlCmd ? `Download (${dlCmd.command.cmd})` : 'Download (unsupported)',  icon: <Download size={13} />, disabled: !dlCmd },
                { action: 'download_history', label: 'Download history',                                                       icon: <History size={13} /> },
                { action: 'edit_comment',     label: 'Edit comment',                                                           icon: <MessageSquare size={13} /> },
                { action: 'div1', label: '', divider: true },
                { action: 'rm',               label: rmCmd ? `Remove (${rmCmd.command.cmd})` : 'Remove (unsupported)',     icon: <Trash2 size={13} />, danger: true, disabled: !rmCmd },
            );
        }

        // Original callback sub-menu (node collected by a different callback)
        if (node.callback && node.callback.id !== callbackId) {
            const origId = node.callback.id;
            const origDisplay = node.callback.display_id;
            // Fetch commands for the original callback if not cached
            if (!loadedCommandsRef.current[origId]) {
                getLoadedCommandsForUI({ variables: { callback_id: origId } });
            }
            const origLs  = getLoadedCommandForUIFeature(origId, 'file_browser:list');
            const origDl  = getLoadedCommandForUIFeature(origId, isDir ? 'file_browser:download_folder' : 'file_browser:download');
            const origRm  = getLoadedCommandForUIFeature(origId, isDir ? 'file_browser:remove_folder' : 'file_browser:remove');
            items.push(
                { action: 'div2', label: '', divider: true },
                {
                    action: `orig_menu:${origId}`,
                    label: `Original Callback #${origDisplay}`,
                    icon: <Monitor size={13} />,
                    children: [
                        { action: `orig_ls:${origId}`,   label: origLs ? `List (${origLs.command.cmd})`     : 'List (unsupported)',     icon: <FolderSearch size={11} />, disabled: !origLs },
                        { action: `orig_dl:${origId}`,   label: origDl ? `Download (${origDl.command.cmd})` : 'Download (unsupported)', icon: <Download size={11} />,     disabled: !origDl },
                        { action: `orig_rm:${origId}`,   label: origRm ? `Remove (${origRm.command.cmd})`   : 'Remove (unsupported)',   icon: <Trash2 size={11} />,       disabled: !origRm, danger: true },
                    ]
                }
            );
        }

        return items;
    }, [callbackId, getLoadedCommandForUIFeature, getLoadedCommandsForUI]);

    const handleFileAction = useCallback((action: string, path: string, name: string, isDir: boolean) => {
        // Handle orig_* actions (task on the original callback)
        if (action.startsWith('orig_ls:') || action.startsWith('orig_dl:') || action.startsWith('orig_rm:')) {
            const [type, cbIdStr] = action.split(':');
            const targetCbId = parseInt(cbIdStr, 10);
            if (type === 'orig_ls')  doTask('ls',       path, name, true,  targetCbId);
            if (type === 'orig_dl')  doTask('download', path, name, false, targetCbId);
            if (type === 'orig_rm')  doTask('rm',       path, name, isDir, targetCbId);
            return;
        }
        if (action === 'ls') {
            doTask('ls', path, name, true);
        } else if (action === 'download') {
            doTask('download', path, name, false);
        } else if (action === 'cat') {
            doTask('cat', path, name, false);
        } else if (action === 'upload') {
            setUploadDestPath(path);
            setUploadDialogOpen(true);
        } else if (action === 'copy') {
            navigator.clipboard.writeText(path);
            snackActions.success('Path copied');
        } else if (action === 'copy_name') {
            const node = treeRootDataRef.current[path];
            navigator.clipboard.writeText(node?.name_text || name);
            snackActions.success('Name copied');
        } else if (action === 'copy_metadata') {
            const node = treeRootDataRef.current[path];
            const meta = node ? getMetadata(node) : {};
            navigator.clipboard.writeText(JSON.stringify(meta, null, 2));
            snackActions.success('Metadata JSON copied');
        } else if (action === 'edit_comment') {
            const node = treeRootDataRef.current[path];
            if (node) setEditingComment(node);
        } else if (action === 'download_history') {
            const node = treeRootDataRef.current[path];
            if (node) setDownloadHistoryNode(node);
        } else if (action === 'rm') {
            doTask('rm', path, name, false);
        } else if (action === 'rm_folder') {
            doTask('rm', path, name, true);
        }
    }, [doTask]);

    const handleSaveComment = useCallback((nodeId: number, comment: string) => {
        updateCommentMutation({ variables: { id: nodeId, comment } })
            .then(() => {
                // update local cache
                const node = Object.values(treeRootDataRef.current).find(n => n.id === nodeId);
                if (node) {
                    treeRootDataRef.current[node.full_path_text] = { ...node, comment };
                    // Force re-render by touching adjMtx
                    setTreeAdjMtx(prev => ({ ...prev }));
                }
                snackActions.success('Comment saved');
            })
            .catch((e: unknown) => snackActions.error('Failed to save comment: ' + getErrorMessage(e)));
    }, [updateCommentMutation]);

    // Bulk download via task for selected file rows
    const handleBulkDownload = () => {
        let count = 0;
        selectedRows.forEach(path => {
            const node = treeRootDataRef.current[path];
            if (node && !node.can_have_children) {
                doTask('download', path, node.name_text, false);
                count++;
            }
        });
        snackActions.info(`Tasked download for ${count} file(s)`);
        setSelectedRows(new Set());
    };

    // Bulk list — task ls on all selected directories
    const handleBulkList = () => {
        let count = 0;
        selectedRows.forEach(path => {
            const node = treeRootDataRef.current[path];
            if (node && node.can_have_children) {
                doTask('ls', path, node.name_text, true);
                count++;
            }
        });
        if (count === 0) snackActions.warning('No directories selected');
        else snackActions.info(`Tasked ls for ${count} director${count === 1 ? 'y' : 'ies'}`);
        setSelectedRows(new Set());
    };

    // Bulk remove — task rm on all selected files
    const handleBulkRemove = () => {
        let count = 0;
        selectedRows.forEach(path => {
            const node = treeRootDataRef.current[path];
            if (node) {
                doTask('rm', path, node.name_text, node.can_have_children);
                count++;
            }
        });
        if (count === 0) snackActions.warning('Nothing selected to remove');
        else snackActions.warning(`Tasked rm for ${count} item(s)`);
        setSelectedRows(new Set());
    };

    // ────────────────────────────────────────────────────────────
    // TABLE DATA COMPUTATION
    // ────────────────────────────────────────────────────────────
    const tableData: FileNode[] = React.useMemo(() => {
        const parentKey = selectedNode ? selectedNode.full_path_text : '';
        const childPaths = treeAdjMtx[parentKey] || [];
        let nodes = childPaths
            .map(p => treeRootDataRef.current[p])
            .filter((n): n is FileNode => !!n);

        // Filter deleted
        if (!showDeletedFiles) nodes = nodes.filter(n => !n.deleted);

        // Filter text (global)
        if (filterText) {
            const q = filterText.toLowerCase();
            nodes = nodes.filter(n =>
                n.name_text?.toLowerCase().includes(q) ||
                n.full_path_text?.toLowerCase().includes(q) ||
                n.comment?.toLowerCase().includes(q)
            );
        }

        // Per-column filters
        Object.entries(colFilters).forEach(([key, val]) => {
            if (!val) return;
            const q = val.toLowerCase();
            nodes = nodes.filter(n => {
                if (key === 'size' || key === 'modify_time') {
                    return String(getMetadata(n)[key] ?? '').toLowerCase().includes(q);
                }
                if (key === 'tags') {
                    return (n.tags || []).some(t => t.tagtype.name.toLowerCase().includes(q));
                }
                return String((n as any)[key] ?? '').toLowerCase().includes(q);
            });
        });

        // Sort
        if (sortKey) {
            nodes = [...nodes].sort((a, b) => {
                let aVal: any;
                let bVal: any;
                if (sortKey === 'size' || sortKey === 'modify_time') {
                    aVal = getMetadata(a)[sortKey] ?? '';
                    bVal = getMetadata(b)[sortKey] ?? '';
                } else {
                    aVal = (a as any)[sortKey] ?? '';
                    bVal = (b as any)[sortKey] ?? '';
                }
                const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
                return sortDir === 'asc' ? cmp : -cmp;
            });
        } else {
            // Default: dirs first, then files
            nodes = [...nodes].sort((a, b) => {
                if (a.can_have_children !== b.can_have_children) return a.can_have_children ? -1 : 1;
                return a.name_text.localeCompare(b.name_text);
            });
        }
        return nodes;
    }, [treeAdjMtx, selectedNode, showDeletedFiles, filterText, colFilters, sortKey, sortDir]);

    const isLoading = rootLoading || folderLoading;

    // ────────────────────────────────────────────────────────────
    // SORT TOGGLE
    // ────────────────────────────────────────────────────────────
    const toggleSort = (key: string) => {
        if (sortKey === key) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortKey(null); setSortDir('asc'); }
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    // Sort header icon
    const SortIcon = ({ k }: { k: string }) => {
        if (sortKey !== k) return <ChevronRight size={10} className="opacity-20" />;
        return sortDir === 'asc'
            ? <ChevronUp size={10} className="text-signal" />
            : <ChevronDown size={10} className="text-signal" />;
    };

    // ────────────────────────────────────────────────────────────
    // ROOT PATHS for tree sidebar
    // ────────────────────────────────────────────────────────────
    const rootPaths = treeAdjMtx[''] || [];

    // ────────────────────────────────────────────────────────────
    // DISPLAY FORMAT (mirrors OldReactUI's getDisplayFormat)
    // determines what to show in the table area when there's no data
    // ────────────────────────────────────────────────────────────
    const getDisplayFormat = (): 'normal' | 'fetchLocal' | 'fetchRemote' | 'showTask' => {
        if (!selectedNode) return 'normal';
        if (tableData.length > 0 || selectedNode.success === true) return 'normal';
        if (selectedNode.success === false) return 'showTask';
        if (selectedNode.has_children && selectedNode.success === null) return 'fetchLocal';
        return 'fetchRemote';
    };
    const displayFormat = getDisplayFormat();

    // Visible columns array (from COLUMN_DEFS filtered by state + always include actions)
    const activeCols = COLUMN_DEFS.filter(c => visibleCols.includes(c.key));

    // ────────────────────────────────────────────────────────────
    // RENDER
    // ────────────────────────────────────────────────────────────
    return (
        <div className="flex h-full overflow-hidden">
            {/* Context menu */}
            {ctxMenu && (
                <ContextMenu
                    menu={ctxMenu}
                    items={ctxMenu.items}
                    onAction={(action, path, name) => handleFileAction(action, path, name, ctxMenu.isDir)}
                    onClose={() => setCtxMenu(null)}
                />
            )}

            {/* Comment edit modal */}
            {editingComment && (
                <CommentEditModal
                    node={editingComment}
                    onClose={() => setEditingComment(null)}
                    onSave={handleSaveComment}
                />
            )}

            {/* Download history modal */}
            {downloadHistoryNode && (
                <DownloadHistoryModal
                    node={downloadHistoryNode}
                    onClose={() => setDownloadHistoryNode(null)}
                />
            )}

            {/* ── Upload dialog ─────────────────────────────── */}
            {uploadDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0f1117] border border-white/10 rounded-lg w-96 p-5 font-mono shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-signal font-mono uppercase tracking-widest">Upload File</span>
                            <button onClick={() => setUploadDialogOpen(false)} className="text-gray-500 hover:text-white"><XCircle size={14} /></button>
                        </div>

                        <label className="block text-[10px] text-gray-400 mb-1">Destination path</label>
                        <input
                            type="text"
                            value={uploadDestPath}
                            onChange={e => setUploadDestPath(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-signal/60 mb-3"
                            placeholder="./path/on/remote"
                        />

                        <label className="block text-[10px] text-gray-400 mb-1">File</label>
                        <input
                            ref={uploadInputRef}
                            type="file"
                            className="hidden"
                            onChange={e => setUploadFile(e.target.files?.[0] || null)}
                        />
                        <div
                            className="w-full border border-dashed border-white/20 rounded px-3 py-4 flex flex-col items-center gap-2 cursor-pointer hover:border-signal/40 transition-colors mb-4"
                            onClick={() => uploadInputRef.current?.click()}
                        >
                            <UploadCloud size={20} className="text-gray-500" />
                            {uploadFile ? (
                                <span className="text-xs text-signal">{uploadFile.name} ({formatBytes(uploadFile.size)})</span>
                            ) : (
                                <span className="text-[10px] text-gray-500">Click to select a file</span>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setUploadDialogOpen(false)}
                                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-white/10 rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUploadSubmit}
                                disabled={!uploadFile || uploading}
                                className="px-3 py-1.5 text-xs text-black bg-signal hover:bg-signal/80 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                                {uploading ? <RefreshCw size={11} className="animate-spin" /> : <UploadCloud size={11} />}
                                {uploading ? 'Uploading…' : 'Upload'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Column config dialog ──────────────────────── */}
            {showColDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0f1117] border border-white/10 rounded-lg w-72 p-5 font-mono shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-signal font-mono uppercase tracking-widest flex items-center gap-1.5">
                                <Columns size={12} /> Visible Columns
                            </span>
                            <button onClick={() => setShowColDialog(false)} className="text-gray-500 hover:text-white"><XCircle size={14} /></button>
                        </div>
                        <div className="space-y-1.5">
                            {COLUMN_DEFS.map(col => (
                                <label key={col.key} className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={visibleCols.includes(col.key)}
                                        onChange={e => {
                                            const next = e.target.checked
                                                ? [...visibleCols, col.key]
                                                : visibleCols.filter(k => k !== col.key);
                                            handleSetVisibleCols(next);
                                        }}
                                        className="rounded bg-black/40 border-white/20"
                                    />
                                    <span className="text-[11px] text-gray-300 group-hover:text-white transition-colors">{col.label}</span>
                                </label>
                            ))}
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                            <button
                                onClick={() => handleSetVisibleCols(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key))}
                                className="text-[10px] text-gray-500 hover:text-white transition-colors"
                            >
                                Reset defaults
                            </button>
                            <button
                                onClick={() => setShowColDialog(false)}
                                className="px-3 py-1 text-xs text-black bg-signal hover:bg-signal/80 rounded transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Per-column filter dialog ──────────────────── */}
            {filteringColKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0f1117] border border-white/10 rounded-lg w-72 p-5 font-mono shadow-xl">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-signal font-mono uppercase tracking-widest flex items-center gap-1.5">
                                <SlidersHorizontal size={11} /> Filter: {COLUMN_DEFS.find(c => c.key === filteringColKey)?.label || filteringColKey}
                            </span>
                            <button onClick={() => setFilteringColKey(null)} className="text-gray-500 hover:text-white"><XCircle size={14} /></button>
                        </div>
                        <input
                            autoFocus
                            type="text"
                            value={filterColInput}
                            onChange={e => setFilterColInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { setColFilter(filteringColKey, filterColInput); setFilteringColKey(null); }
                                if (e.key === 'Escape') setFilteringColKey(null);
                            }}
                            placeholder="Filter value… (Enter to apply)"
                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-signal/60 mb-4"
                        />
                        <div className="flex justify-between">
                            <button
                                onClick={() => { setColFilter(filteringColKey, ''); setFilteringColKey(null); }}
                                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            >
                                Clear filter
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => setFilteringColKey(null)} className="px-3 py-1 text-xs text-gray-400 border border-white/10 rounded hover:text-white transition-colors">Cancel</button>
                                <button
                                    onClick={() => { setColFilter(filteringColKey, filterColInput); setFilteringColKey(null); }}
                                    className="px-3 py-1 text-xs text-black bg-signal hover:bg-signal/80 rounded transition-colors"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Sidebar Tree ───────────────────────────────── */}
            <div className="w-60 border-r border-ghost/30 bg-black/20 flex flex-col">
                {/* Host header */}
                <div className="px-3 py-2 border-b border-ghost/30 font-mono text-[10px] flex items-center gap-2 text-gray-400 shrink-0">
                    <HardDrive size={11} className="text-signal shrink-0" />
                    <span className="truncate flex-1" title={host}>{host}</span>
                    {/* Show deleted toggle */}
                    <button
                        onClick={() => setShowDeletedFiles(v => !v)}
                        className={cn(
                            'p-0.5 rounded transition-colors',
                            showDeletedFiles ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
                        )}
                        title={showDeletedFiles ? 'Hide deleted files' : 'Show deleted files'}
                    >
                        <EyeOff size={11} />
                    </button>
                </div>

                {/* Tree */}
                <div className="flex-1 overflow-auto p-1">
                    {rootLoading && rootPaths.length === 0 ? (
                        <div className="text-center p-4 text-[10px] text-gray-500 animate-pulse">LOADING_TREE...</div>
                    ) : rootPaths.length === 0 ? (
                        <div className="text-center p-6 text-gray-600">
                            <Folder size={24} className="mx-auto mb-2 opacity-20" />
                            <p className="text-[10px] font-mono">NO_FILE_DATA</p>
                            <p className="text-[9px] text-gray-700 mt-1">Run 'ls' to browse</p>
                        </div>
                    ) : (
                        rootPaths.map(rp => (
                            <FileTreeNode
                                key={rp}
                                fullPath={rp}
                                level={0}
                                treeRootData={treeRootDataRef.current}
                                treeAdjMtx={treeAdjMtx}
                                selectedPath={currentPath}
                                showDeletedFiles={showDeletedFiles}
                                onSelect={navigateTo}
                                onFetchFolder={fetchFolder}
                                onFileContextMenu={(node, e) => {
                                    e.preventDefault();
                                    setCtxMenu({ x: e.clientX, y: e.clientY, isDir: node.can_have_children, path: node.full_path_text, name: node.name_text, items: buildContextMenuItems(node, node.can_have_children) });
                                }}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* ── Main Content ───────────────────────────────── */}
            <div className="flex-1 flex flex-col bg-black/10 overflow-hidden">

                {/* Toolbar */}
                <div className="shrink-0 border-b border-ghost/30 bg-white/5 flex items-center gap-1 px-2 py-1.5">
                    {/* Back */}
                    <button
                        onClick={handleBack}
                        disabled={historyIndex <= 0}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Back"
                    >
                        <ArrowLeft size={13} />
                    </button>
                    {/* Forward */}
                    <button
                        onClick={handleForward}
                        disabled={historyIndex >= navHistoryRef.current.length - 1}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Forward"
                    >
                        <ArrowRight size={13} />
                    </button>
                    {/* Home */}
                    <button
                        onClick={handleGoHome}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                        title="Root"
                    >
                        <Home size={13} />
                    </button>

                    {/* Move Up Directory */}
                    <button
                        onClick={handleMoveUp}
                        disabled={!selectedNode || !selectedNode.parent_path_text}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Parent directory"
                    >
                        <ArrowUp size={13} />
                    </button>

                    {/* Path bar — editable, press Enter to navigate */}
                    <input
                        type="text"
                        value={pathInputValue}
                        onChange={e => setPathInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleNavigateToPath(pathInputValue);
                            if (e.key === 'Escape') setPathInputValue(currentPath || '/');
                        }}
                        onBlur={() => setPathInputValue(currentPath || '/')}
                        className="flex-1 font-mono text-[10px] px-2 py-1 bg-black/30 rounded text-gray-300 mx-1 focus:outline-none focus:ring-1 focus:ring-signal/50 border border-transparent hover:border-white/10 focus:border-signal/50 transition-colors"
                        title="Type a path and press Enter to navigate"
                        spellCheck={false}
                    />

                    {/* Filter toggle */}
                    <button
                        onClick={() => setShowFilter(v => !v)}
                        className={cn(
                            'p-1 rounded transition-colors',
                            showFilter ? 'text-signal bg-signal/10' : 'text-gray-400 hover:text-white hover:bg-white/10'
                        )}
                        title="Filter"
                    >
                        <Filter size={13} />
                    </button>

                    {/* Auto-LS toggle */}
                    <button
                        onClick={handleToggleAutoLs}
                        className={cn(
                            'p-1 rounded transition-colors text-[9px] font-mono',
                            autoLsEmptyDirs ? 'text-yellow-400 bg-yellow-500/10' : 'text-gray-500 hover:text-white hover:bg-white/10'
                        )}
                        title={autoLsEmptyDirs ? 'Auto-ls ON' : 'Auto-ls OFF'}
                    >
                        AUTO
                    </button>

                    {/* Upload file */}
                    <button
                        onClick={() => { setUploadDestPath(selectedNode?.full_path_text || '.'); setUploadDialogOpen(true); }}
                        className="p-1 hover:bg-white/10 rounded text-green-400 hover:text-white transition-colors"
                        title="Upload file to this directory"
                    >
                        <UploadCloud size={13} />
                    </button>

                    {/* Column config */}
                    <button
                        onClick={() => setShowColDialog(true)}
                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                        title="Configure visible columns"
                    >
                        <Columns size={13} />
                    </button>

                    {/* Bulk actions — shown when rows are selected */}
                    {selectedRows.size > 0 && (
                        <div className="flex items-center gap-0.5">
                            <span className="font-mono text-[9px] text-gray-500 px-1">{selectedRows.size}✓</span>
                            <button
                                onClick={handleBulkDownload}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                title="Download all selected files"
                            >
                                <Download size={11} />
                                DL
                            </button>
                            <button
                                onClick={handleBulkList}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 rounded transition-colors"
                                title="List all selected directories"
                            >
                                <FolderSearch size={11} />
                                LS
                            </button>
                            <button
                                onClick={handleBulkRemove}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                title="Remove all selected items"
                            >
                                <Trash2 size={11} />
                                RM
                            </button>
                        </div>
                    )}

                    {/* Refresh */}
                    <button
                        onClick={handleRefresh}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-signal hover:text-white"
                        title="Refresh & LS"
                    >
                        <RefreshCw size={13} className={folderLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Filter bar (collapsible) */}
                {showFilter && (
                    <div className="shrink-0 border-b border-ghost/20 bg-black/20 px-3 py-1.5 flex items-center gap-2">
                        <Filter size={11} className="text-gray-500 shrink-0" />
                        <input
                            autoFocus
                            type="text"
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            placeholder="Filter by name, path, or comment..."
                            className="flex-1 bg-transparent text-[11px] font-mono text-white placeholder-gray-600 focus:outline-none"
                        />
                        {filterText && (
                            <button onClick={() => setFilterText('')} className="text-gray-500 hover:text-white">
                                <XCircle size={11} />
                            </button>
                        )}
                    </div>
                )}

                {/* Partial data warning — shown when node was listed but success is unknown */}
                {selectedNode?.success === null && tableData.length > 0 && (
                    <div className="shrink-0 border-b border-yellow-500/30 bg-yellow-500/5 px-3 py-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[10px] font-mono text-yellow-400">
                            <ShieldAlert size={11} className="shrink-0" />
                            <span>PARTIAL_DATA — cached results only. Task 'ls' for a complete listing.</span>
                        </div>
                        <button
                            onClick={handleRefresh}
                            className="text-[10px] font-mono text-yellow-400 hover:text-white flex items-center gap-1 shrink-0 hover:underline"
                        >
                            <RefreshCw size={10} />
                            Refresh
                        </button>
                    </div>
                )}

                {/* File Table */}
                <div className="flex-1 overflow-auto">
                    {isLoading && tableData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-600 font-mono text-xs animate-pulse">
                            LOADING...
                        </div>
                    ) : tableData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600 px-6 text-center">
                            {displayFormat === 'showTask' ? (
                                <>
                                    <AlertCircle size={28} className="opacity-40 text-red-400" />
                                    <span className="font-mono text-xs text-red-400">TASK_FAILED</span>
                                    <span className="font-mono text-[10px] text-gray-500">The last ls task returned an error. Retry below.</span>
                                </>
                            ) : displayFormat === 'fetchLocal' ? (
                                <>
                                    <Folder size={28} className="opacity-40 text-blue-400" />
                                    <span className="font-mono text-xs text-blue-300">CACHED_DATA_AVAILABLE</span>
                                    <span className="font-mono text-[10px] text-gray-500">Click the folder in the tree to load data from the local database.</span>
                                </>
                            ) : displayFormat === 'fetchRemote' ? (
                                <>
                                    <Folder size={28} className="opacity-30" />
                                    <span className="font-mono text-xs">NO_DATA</span>
                                    <span className="font-mono text-[10px] text-gray-500">No listing data available. Task 'ls' to fetch from the remote host.</span>
                                </>
                            ) : (
                                <>
                                    <Folder size={28} className="opacity-20" />
                                    <span className="font-mono text-xs">NO_FILE_DATA</span>
                                </>
                            )}
                            <button
                                onClick={() => {
                                    if (selectedNode) doTask('ls', selectedNode.full_path_text || '.', selectedNode.name_text, true);
                                    else doTask('ls', '.', '.', true);
                                }}
                                className="text-[10px] font-mono text-signal hover:underline"
                            >
                                Execute 'ls' here
                            </button>
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead className="bg-black/40 sticky top-0 z-10">
                                <tr className="font-mono text-[10px] text-gray-500 select-none">
                                    <th className="w-6 p-1.5 text-left">
                                        <input
                                            type="checkbox"
                                            className="rounded bg-black/40 border-white/20 cursor-pointer"
                                            checked={selectedRows.size > 0 && selectedRows.size === tableData.filter(n => !n.can_have_children).length}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    setSelectedRows(new Set(tableData.filter(n => !n.can_have_children).map(n => n.full_path_text)));
                                                } else {
                                                    setSelectedRows(new Set());
                                                }
                                            }}
                                        />
                                    </th>
                                    {activeCols.map(col => (
                                        <th
                                            key={col.key}
                                            className={cn(
                                                'p-1.5 text-left select-none',
                                                col.sortable ? 'cursor-pointer hover:text-white' : '',
                                                col.width,
                                                colFilters[col.key] ? 'text-signal' : ''
                                            )}
                                            onClick={() => col.sortable ? toggleSort(col.key) : undefined}
                                            onContextMenu={e => {
                                                e.preventDefault();
                                                setFilteringColKey(col.key);
                                                setFilterColInput(colFilters[col.key] || '');
                                            }}
                                            title={colFilters[col.key] ? `Filter: "${colFilters[col.key]}" (right-click to edit)` : 'Right-click to filter this column'}
                                        >
                                            <span className="flex items-center gap-0.5">
                                                {col.label}
                                                {colFilters[col.key] && <SlidersHorizontal size={8} className="text-signal" />}
                                                {col.sortable && <SortIcon k={col.key} />}
                                            </span>
                                        </th>
                                    ))}
                                    <th className="p-1.5 text-left w-28" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {tableData.map(item => {
                                    const meta = getMetadata(item);
                                    const isSelected = selectedRows.has(item.full_path_text);
                                    const hasDownloads = (item.filemeta?.length || 0) > 0;
                                    return (
                                        <tr
                                            key={item.full_path_text}
                                            className={cn(
                                                "hover:bg-white/5 group cursor-pointer transition-colors",
                                                isSelected && "bg-signal/10",
                                                item.deleted && "opacity-40"
                                            )}
                                            onClick={(e) => {
                                                if (e.ctrlKey || e.metaKey) {
                                                    // Multi-select toggle
                                                    setSelectedRows(prev => {
                                                        const next = new Set(prev);
                                                        next.has(item.full_path_text) ? next.delete(item.full_path_text) : next.add(item.full_path_text);
                                                        return next;
                                                    });
                                                } else {
                                                    if (item.can_have_children) {
                                                        navigateTo(item);
                                                    } else {
                                                        handleFileAction('cat', item.full_path_text, item.name_text, false);
                                                    }
                                                }
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setCtxMenu({ x: e.clientX, y: e.clientY, isDir: item.can_have_children, path: item.full_path_text, name: item.name_text, items: buildContextMenuItems(item, item.can_have_children) });
                                            }}
                                        >
                                            {/* Checkbox */}
                                            <td className="p-1.5" onClick={e => e.stopPropagation()}>
                                                {!item.can_have_children && (
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => {
                                                            setSelectedRows(prev => {
                                                                const next = new Set(prev);
                                                                e.target.checked ? next.add(item.full_path_text) : next.delete(item.full_path_text);
                                                                return next;
                                                            });
                                                        }}
                                                        className="rounded bg-black/40 border-white/20"
                                                    />
                                                )}
                                            </td>

                                            {/* Name — always visible */}
                                            <td className="p-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    {item.can_have_children
                                                        ? <Folder size={13} className={item.has_children ? 'text-yellow-500' : 'text-red-500/60'} />
                                                        : <FileIcon size={13} className="text-blue-400" />}
                                                    <span className={cn('truncate max-w-[200px]', item.deleted && 'line-through text-gray-500')}>
                                                        {item.name_text}
                                                    </span>
                                                    {item.success === true && <CheckCircle2 size={10} className="text-green-500 shrink-0" />}
                                                    {item.success === false && <AlertCircle size={10} className="text-red-500 shrink-0" />}
                                                </div>
                                            </td>

                                            {/* Size */}
                                            {activeCols.some(c => c.key === 'size') && (
                                                <td className="p-1.5 font-mono text-[10px] text-gray-400">
                                                    {meta.size ? formatBytes(Number(meta.size)) : '—'}
                                                </td>
                                            )}

                                            {/* Modified */}
                                            {activeCols.some(c => c.key === 'modify_time') && (
                                                <td className="p-1.5 font-mono text-[10px] text-gray-400 truncate max-w-[140px]">
                                                    {meta.modify_time || '—'}
                                                </td>
                                            )}

                                            {/* Comment */}
                                            {activeCols.some(c => c.key === 'comment') && (
                                                <td className="p-1.5 max-w-[130px]">
                                                    {item.comment ? (
                                                        <span className="text-[10px] text-gray-400 italic truncate block" title={item.comment}>
                                                            {item.comment}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-700 italic">—</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Tags */}
                                            {activeCols.some(c => c.key === 'tags') && (
                                            <td className="p-1.5">
                                                <div className="flex flex-wrap gap-0.5">
                                                    {(item.tags || []).slice(0, 3).map(t => (
                                                        <span
                                                            key={t.id}
                                                            className="text-[8px] px-1 py-0.5 rounded font-mono"
                                                            style={{ background: `${t.tagtype.color}30`, color: t.tagtype.color, border: `1px solid ${t.tagtype.color}50` }}
                                                            title={t.tagtype.name}
                                                        >
                                                            {t.tagtype.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            )}

                                            {/* Permissions */}
                                            {activeCols.some(c => c.key === 'permissions') && (
                                                <td className="p-1.5 font-mono text-[10px] text-gray-400">
                                                    {meta.permissions ? (
                                                        <span title={JSON.stringify(meta.permissions, null, 2)} className="cursor-help">
                                                            {typeof meta.permissions === 'object'
                                                                ? (meta.permissions as any).octal || JSON.stringify(meta.permissions).slice(0, 12)
                                                                : String(meta.permissions).slice(0, 12)}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                            )}

                                            {/* Actions */}
                                            <td className="p-1.5">
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {/* Download (task) */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleFileAction('download', item.full_path_text, item.name_text, false); }}
                                                        className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-white transition-colors"
                                                        title="Task download"
                                                    >
                                                        <Download size={12} />
                                                    </button>

                                                    {/* Download history (filemeta) */}
                                                    {hasDownloads && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDownloadHistoryNode(item); }}
                                                            className="p-1 hover:bg-white/10 rounded text-blue-300 hover:text-white transition-colors relative"
                                                            title={`${item.filemeta!.length} download(s) in history`}
                                                        >
                                                            <History size={12} />
                                                            <span className="absolute -top-0.5 -right-0.5 text-[7px] leading-none bg-blue-500 text-white rounded-full w-3 h-3 flex items-center justify-center">
                                                                {item.filemeta!.length}
                                                            </span>
                                                        </button>
                                                    )}

                                                    {/* Copy path */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.full_path_text); snackActions.success('Copied'); }}
                                                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                                                        title="Copy path"
                                                    >
                                                        <Copy size={12} />
                                                    </button>

                                                    {/* Edit comment */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingComment(item); }}
                                                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                                                        title="Edit comment"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================
// Mythic C2 Server Files
// ============================================
