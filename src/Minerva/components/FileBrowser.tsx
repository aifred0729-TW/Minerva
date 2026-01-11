import React, { useState, useEffect } from 'react';
import { useQuery, useLazyQuery, useMutation, gql } from '@apollo/client';
import { GET_FILE_TREE_ROOT, GET_FILE_TREE_FOLDER, CREATE_TASK_MUTATION } from '../lib/api';
import { Folder, File as FileIcon, FolderOpen, Download, Upload, Trash2, RefreshCw, Home, ChevronRight, ChevronDown, Monitor, Server, HardDrive, Eye, Image, Link2, Clock, User, FileText, XCircle, Copy } from 'lucide-react';
import { CyberTable } from './CyberTable';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { snackActions } from '../../Archive/components/utilities/Snackbar';

// Types
interface FileNode {
    id: string; // or number, based on API. Mythic usually uses IDs.
    name_text: string;
    full_path_text: string;
    parent_path_text: string;
    can_have_children: boolean;
    tree_type: string;
    deleted: boolean;
    metadata: string; // JSON string
    host: string;
    modify_time?: string;
    size?: number;
}

interface FileMeta {
    id: number;
    agent_file_id: string;
    filename_text: string;
    full_remote_path_text: string;
    host: string;
    size: number;
    complete: boolean;
    deleted: boolean;
    is_download_from_agent: boolean;
    is_screenshot: boolean;
    is_payload: boolean;
    md5: string;
    sha1: string;
    timestamp: string;
    comment: string;
    chunks_received: number;
    total_chunks: number;
    operator?: {
        username: string;
    };
    task?: {
        display_id: number;
        callback?: {
            display_id: number;
        };
    };
}

// GraphQL queries for Mythic server files
const GET_MYTHIC_DOWNLOADS = gql`
    query GetMythicDownloads {
        filemeta(
            where: {
                is_download_from_agent: { _eq: true },
                is_screenshot: { _eq: false },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 100
        ) {
            id
            agent_file_id
            filename_text
            full_remote_path_text
            host
            size
            complete
            deleted
            md5
            sha1
            timestamp
            comment
            chunks_received
            total_chunks
            operator { username }
            task {
                display_id
                callback { display_id }
            }
        }
    }
`;

const GET_MYTHIC_UPLOADS = gql`
    query GetMythicUploads {
        filemeta(
            where: {
                is_download_from_agent: { _eq: false },
                is_screenshot: { _eq: false },
                is_payload: { _eq: false },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 100
        ) {
            id
            agent_file_id
            filename_text
            full_remote_path_text
            host
            size
            complete
            deleted
            md5
            sha1
            timestamp
            comment
            chunks_received
            total_chunks
            operator { username }
            task {
                display_id
                callback { display_id }
            }
        }
    }
`;

const GET_MYTHIC_SCREENSHOTS = gql`
    query GetMythicScreenshots {
        filemeta(
            where: {
                is_screenshot: { _eq: true },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 50
        ) {
            id
            agent_file_id
            filename_text
            host
            size
            complete
            timestamp
            task {
                display_id
                callback { display_id }
            }
        }
    }
`;

// Helper: Format bytes to human readable
const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper: Base64 decode for filenames (handles UTF-8)
const b64DecodeUnicode = (str: string): string => {
    if (!str) return '';
    try {
        const decoded = window.atob(str);
        try {
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
                bytes[i] = decoded.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        } catch {
            return decoded;
        }
    } catch {
        return str;
    }
};

// Helper to deduplicate nodes by full_path_text
// This handles the case where multiple callbacks on the same host create duplicate entries
const deduplicateNodes = (nodes: FileNode[]): FileNode[] => {
    if (!nodes || nodes.length === 0) return [];
    const seen = new Map<string, FileNode>();
    nodes.forEach(node => {
        // Use full_path_text as unique key
        // Keep the first (or latest based on id) entry
        const key = node.full_path_text;
        if (!seen.has(key)) {
            seen.set(key, node);
        }
    });
    return Array.from(seen.values());
};

// Helper to parse metadata
const getMetadata = (node: FileNode) => {
    try {
        const meta = JSON.parse(node.metadata);
        return meta;
    } catch {
        return {};
    }
}

// Tree Node Component
const FileTreeNode = ({ node, host, selectedPath, onSelect, level = 0 }: { 
    node: FileNode, 
    host: string, 
    selectedPath: string, 
    onSelect: (node: FileNode) => void,
    level?: number 
}) => {
    const [expanded, setExpanded] = useState(false);
    const [getFolder, { data, loading }] = useLazyQuery(GET_FILE_TREE_FOLDER, {
        variables: { parent_path_text: node.full_path_text, host }
    });

    const isSelected = node.full_path_text === selectedPath;
    const hasChildren = node.can_have_children;

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!expanded) {
            getFolder();
        }
        setExpanded(!expanded);
    };

    const handleClick = () => {
        onSelect(node);
    };

    return (
        <div>
           <div 
                className={cn(
                    "flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-white/5 transition-colors select-none text-xs truncate",
                    isSelected && "bg-signal/20 text-signal"
                )}
                style={{ paddingLeft: `${level * 12 + 4}px` }}
                onClick={handleClick}
            >
                {hasChildren ? (
                     <div onClick={handleExpand} className="p-0.5 hover:text-signal">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                     </div>
                ) : <span className="w-[14px]"></span>}
                
                {hasChildren ? (
                    expanded ? <FolderOpen size={14} className="text-yellow-500" /> : <Folder size={14} className="text-yellow-500" />
                ) : <FileIcon size={14} className="text-blue-400" />}
                
                <span className="ml-1">{node.name_text || (level === 0 ? "ROOT" : "")}</span>
           </div>
           
           {expanded && (
               <div className="border-l border-white/10 ml-2">
                   {loading ? (
                       <div className="pl-4 py-1 text-[10px] text-gray-500">LOADING...</div>
                   ) : (
                       deduplicateNodes(data?.children || []).map((child: FileNode) => (
                           child.can_have_children && (
                               <FileTreeNode 
                                   key={child.full_path_text} 
                                   node={child} 
                                   host={host}
                                   selectedPath={selectedPath}
                                   onSelect={onSelect}
                                   level={level + 1}
                               />
                           )
                       ))
                   )}
               </div>
           )}
        </div>
    );
};


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
const CallbackFileBrowser = ({ host, callbackId }: { host: string, callbackId: number }) => {
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const [currentPath, setCurrentPath] = useState<string>("");
    const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const { data: rootData, loading: rootLoading } = useQuery(GET_FILE_TREE_ROOT, {
        variables: { host }
    });

    const [getFolderContents, { data: folderData, loading: folderLoading, refetch: refetchFolder }] = useLazyQuery(GET_FILE_TREE_FOLDER, {
        fetchPolicy: 'network-only'
    });

    useEffect(() => {
        if (selectedNode) {
            getFolderContents({
                variables: { parent_path_text: selectedNode.full_path_text, host }
            });
            setCurrentPath(selectedNode.full_path_text);
        }
    }, [selectedNode, refreshTrigger, host]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
        refetchFolder();
        if (selectedNode) {
            createTask({
                variables: {
                    callback_id: callbackId,
                    command: "ls",
                    params: selectedNode.full_path_text || ".",
                }
            }).then(() => {
                snackActions.info("Tasked 'ls'");
            }).catch(e => {
                snackActions.error("Failed to task 'ls': " + e.message);
            });
        }
    };

    const handleDownload = (node: FileNode) => {
        createTask({
            variables: {
                callback_id: callbackId,
                command: "download",
                params: node.full_path_text,
            }
        }).then(() => {
            snackActions.info(`Tasked download for ${node.name_text}`);
        }).catch(e => {
            snackActions.error("Download task failed: " + e.message);
        });
    };

    const columns = [
        {
            header: "Name",
            accessorKey: "name_text" as keyof FileNode,
            cell: (item: FileNode) => (
                <div className="flex items-center gap-2">
                    {item.can_have_children ? <Folder size={14} className="text-yellow-500" /> : <FileIcon size={14} className="text-blue-400" />}
                    <span>{item.name_text}</span>
                </div>
            )
        },
        {
            header: "Size",
            cell: (item: FileNode) => {
                const meta = getMetadata(item);
                const size = meta.size || 0;
                return <span className="font-mono text-xs opacity-70">{formatBytes(size)}</span>
            }
        },
        {
            header: "Modified",
            cell: (item: FileNode) => {
                const meta = getMetadata(item);
                return <span className="font-mono text-xs opacity-70">{meta.modify_time || "-"}</span>
            }
        },
        {
            header: "",
            cell: (item: FileNode) => (
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item);
                        }}
                        className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-white"
                        title="Download"
                    >
                        <Download size={14} />
                    </button>
                </div>
            )
        }
    ];

    const handleRowClick = (item: FileNode) => {
        if (item.can_have_children) {
            setSelectedNode(item);
        }
    };

    const rawTableData = selectedNode
        ? ((folderData && folderData.children) ? folderData.children : [])
        : (rootData && rootData.mythictree ? rootData.mythictree : []);
    const tableData = deduplicateNodes(rawTableData);
    const isLoading = selectedNode ? folderLoading : rootLoading;

    return (
        <div className="flex h-full overflow-hidden">
            {/* Sidebar Tree */}
            <div className="w-56 border-r border-ghost/30 bg-black/20 flex flex-col">
                <div className="p-2 border-b border-ghost/30 font-mono text-[10px] flex items-center gap-2 text-gray-400">
                    <HardDrive size={12} className="text-signal" />
                    <span className="truncate" title={host}>{host}</span>
                </div>
                <div className="flex-1 overflow-auto p-1 scrollbar-thin scrollbar-thumb-ghost/30">
                    {rootLoading ? (
                        <div className="text-center p-4 text-xs text-gray-500">LOADING...</div>
                    ) : (
                        deduplicateNodes(rootData?.mythictree || []).map((root: FileNode) => (
                            <FileTreeNode
                                key={root.full_path_text}
                                node={root}
                                host={host}
                                selectedPath={currentPath}
                                onSelect={setSelectedNode}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-black/10">
                {/* Toolbar */}
                <div className="h-9 border-b border-ghost/30 flex items-center px-3 gap-3 bg-white/5">
                    <button
                        onClick={() => setSelectedNode(null)}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                        title="Home"
                    >
                        <Home size={14} />
                    </button>

                    <div className="flex-1 font-mono text-[10px] truncate px-2 py-1 bg-black/30 rounded text-gray-300">
                        {currentPath || "/"}
                    </div>

                    <button
                        onClick={handleRefresh}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-signal hover:text-white"
                        title="Refresh & LS"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-auto bg-void relative">
                    <CyberTable
                        data={tableData}
                        columns={columns}
                        onRowClick={handleRowClick}
                        isLoading={isLoading}
                    />

                    {!isLoading && tableData.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 font-mono text-xs pointer-events-none">
                            <Folder size={32} className="mb-2 opacity-30" />
                            <span>NO_FILE_DATA</span>
                            <span className="text-[10px] mt-1 text-gray-500">Execute 'ls' to browse files</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================
// Mythic C2 Server Files
// ============================================
const MythicServerFiles = ({ 
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
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// File list for downloads/uploads
const FileMetaList = ({ files, type, onPreview }: { files: FileMeta[], type: 'downloads' | 'uploads', onPreview: (file: FileMeta) => void }) => {
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

// Screenshot grid
const ScreenshotGrid = ({ files, onPreview }: { files: FileMeta[], onPreview: (file: FileMeta) => void }) => {
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
const FilePreviewModal = ({ file, onClose }: { file: FileMeta, onClose: () => void }) => {
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success('Copied to clipboard');
    };

    const isScreenshot = file.is_screenshot;

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

                {/* Screenshot Preview */}
                {isScreenshot && (
                    <div className="p-4 bg-black/40">
                        <img 
                            src={`/direct/download/${file.agent_file_id}`}
                            alt={b64DecodeUnicode(file.filename_text)}
                            className="max-w-full rounded border border-white/10"
                        />
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
