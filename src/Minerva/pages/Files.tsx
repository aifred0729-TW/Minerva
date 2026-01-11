import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { GET_CALLBACKS } from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { FileBrowser } from '../components/FileBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { 
    Folder, HardDrive, Terminal, User, Clock, Monitor, Server, 
    Wifi, WifiOff, Download, Upload, Image, Trash2, RefreshCw,
    Eye, Link2, FileText, ChevronDown, ChevronRight, Search,
    MoreVertical, ExternalLink, Copy, CheckCircle, XCircle,
    Package, AlertTriangle
} from 'lucide-react';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { useAppStore } from '../store';

// ============================================
// Types
// ============================================
interface MachineInfo {
    host: string;
    callbacks: any[];
    activeCount: number;
    lastCheckin: string;
    users: string[];
    primaryCallback: any;
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
    operator?: { username: string };
    task?: { display_id: number; callback?: { display_id: number } };
}

// ============================================
// GraphQL Queries & Mutations
// ============================================
const GET_MYTHIC_FILES = gql`
    query GetMythicFiles {
        downloads: filemeta(
            where: {
                is_download_from_agent: { _eq: true },
                is_screenshot: { _eq: false },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 200
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
            task { display_id callback { display_id } }
        }
        uploads: filemeta(
            where: {
                is_download_from_agent: { _eq: false },
                is_screenshot: { _eq: false },
                is_payload: { _eq: false },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 200
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
            task { display_id callback { display_id } }
        }
        screenshots: filemeta(
            where: {
                is_screenshot: { _eq: true },
                deleted: { _eq: false }
            },
            order_by: { id: desc },
            limit: 100
        ) {
            id
            agent_file_id
            filename_text
            host
            size
            complete
            timestamp
            task { display_id callback { display_id } }
        }
    }
`;

const DELETE_FILE_MUTATION = gql`
    mutation DeleteFile($file_id: Int!) {
        deleteFile(file_id: $file_id) {
            status
            error
            file_ids
        }
    }
`;

const DOWNLOAD_BULK_MUTATION = gql`
    mutation DownloadBulk($files: [String!]!) {
        download_bulk(files: $files) {
            status
            error
            file_id
        }
    }
`;

// ============================================
// Utility Functions
// ============================================

// Base64 decode for filenames (handles UTF-8)
const b64DecodeUnicode = (str: string): string => {
    if (!str) return '';
    try {
        // First attempt: atob + UTF-8 decode
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
        // Not base64 encoded, return as-is
        return str;
    }
};

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
};

// Upload function
const uploadFileToMythic = async (file: File, comment: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('comment', comment);
    
    try {
        const response = await fetch('/api/v1.4/task_upload_file_webhook', {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'MythicSource': 'web'
            }
        });
        
        const data = await response.json();
        return data?.agent_file_id || null;
    } catch (error) {
        console.error('Upload error:', error);
        return null;
    }
};

// ============================================
// Sidebar Category Types
// ============================================
type SidebarView = 'machines' | 'downloads' | 'uploads' | 'screenshots';

// ============================================
// Main Component
// ============================================
export default function Files() {
    const { isSidebarCollapsed } = useAppStore();
    const [selectedMachine, setSelectedMachine] = useState<MachineInfo | null>(null);
    const [sidebarView, setSidebarView] = useState<SidebarView>('machines');
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [previewFile, setPreviewFile] = useState<FileMeta | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Queries
    const { data: callbacksData, loading: callbacksLoading } = useQuery(GET_CALLBACKS, {
        variables: { limit: 100, offset: 0 },
        pollInterval: 10000
    });

    const { data: filesData, loading: filesLoading, refetch: refetchFiles } = useQuery(GET_MYTHIC_FILES, {
        pollInterval: 15000
    });

    // Mutations
    const [deleteFile] = useMutation(DELETE_FILE_MUTATION, {
        onCompleted: (data) => {
            if (data.deleteFile.status === 'success') {
                snackActions.success('File deleted');
                refetchFiles();
            } else {
                snackActions.error(data.deleteFile.error);
            }
        }
    });

    const [downloadBulk] = useMutation(DOWNLOAD_BULK_MUTATION, {
        onCompleted: (data) => {
            if (data.download_bulk.status === 'success') {
                snackActions.success('Bulk download ready');
                window.open(`/direct/download/${data.download_bulk.file_id}`, '_blank');
            } else {
                snackActions.error(data.download_bulk.error);
            }
        }
    });

    const callbacks = callbacksData?.callback || [];
    const downloads = filesData?.downloads || [];
    const uploads = filesData?.uploads || [];
    const screenshots = filesData?.screenshots || [];

    // Group callbacks by host
    const machines: MachineInfo[] = useMemo(() => {
        const machineMap = new Map<string, MachineInfo>();
        
        callbacks.forEach((cb: any) => {
            const host = cb.host || 'UNKNOWN';
            if (!machineMap.has(host)) {
                machineMap.set(host, {
                    host,
                    callbacks: [],
                    activeCount: 0,
                    lastCheckin: cb.last_checkin,
                    users: [],
                    primaryCallback: cb
                });
            }
            
            const machine = machineMap.get(host)!;
            machine.callbacks.push(cb);
            
            const lastCheckin = new Date(cb.last_checkin);
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (lastCheckin > fiveMinutesAgo) {
                machine.activeCount++;
            }
            
            if (cb.user && !machine.users.includes(cb.user)) {
                machine.users.push(cb.user);
            }
            
            if (new Date(cb.last_checkin) > new Date(machine.lastCheckin)) {
                machine.lastCheckin = cb.last_checkin;
                machine.primaryCallback = cb;
            }
        });
        
        return Array.from(machineMap.values()).sort((a, b) => 
            new Date(b.lastCheckin).getTime() - new Date(a.lastCheckin).getTime()
        );
    }, [callbacks]);

    const isRecentlyActive = (lastCheckin: string) => {
        const checkinTime = new Date(lastCheckin);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        return checkinTime > fiveMinutesAgo;
    };

    // File filtering
    const getFilteredFiles = (files: FileMeta[]) => {
        if (!searchQuery) return files;
        const query = searchQuery.toLowerCase();
        return files.filter(f => 
            b64DecodeUnicode(f.filename_text)?.toLowerCase().includes(query) ||
            f.host?.toLowerCase().includes(query) ||
            b64DecodeUnicode(f.full_remote_path_text)?.toLowerCase().includes(query)
        );
    };

    // Handlers
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            snackActions.info(`Uploading ${file.name}...`);
            
            const result = await uploadFileToMythic(file, `Uploaded via Minerva UI`);
            if (result) {
                snackActions.success(`${file.name} uploaded successfully`);
            } else {
                snackActions.error(`Failed to upload ${file.name}`);
            }
        }
        
        refetchFiles();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteFile = (fileId: number) => {
        deleteFile({ variables: { file_id: fileId } });
    };

    const handleBulkDownload = () => {
        const selectedFileIds = Array.from(selectedFiles);
        const files = [...downloads, ...uploads].filter(f => selectedFileIds.includes(f.id));
        const agentFileIds = files.map(f => f.agent_file_id);
        
        if (agentFileIds.length > 0) {
            snackActions.info('Creating zip archive...');
            downloadBulk({ variables: { files: agentFileIds } });
        }
    };

    const handleSelectFile = (fileId: number, selected: boolean) => {
        const newSet = new Set(selectedFiles);
        if (selected) {
            newSet.add(fileId);
        } else {
            newSet.delete(fileId);
        }
        setSelectedFiles(newSet);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success('Copied to clipboard');
    };

    // Get current files based on view
    const getCurrentFiles = (): FileMeta[] => {
        switch (sidebarView) {
            case 'downloads': return getFilteredFiles(downloads);
            case 'uploads': return getFilteredFiles(uploads);
            case 'screenshots': return getFilteredFiles(screenshots);
            default: return [];
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen bg-void text-signal font-sans flex overflow-hidden"
        >
            <Sidebar />
            
            {/* Hidden file input */}
            <input 
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
            />
            
            <div className={cn("flex-1 flex flex-col transition-all duration-300 p-6 lg:p-12", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                
                {/* Header */}
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded">
                            <Folder size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">FILE MANAGER</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/files/browser</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedFiles.size > 0 && (
                            <button
                                onClick={handleBulkDownload}
                                className="flex items-center gap-2 px-4 py-2 border border-blue-500 text-blue-400 font-mono text-xs hover:bg-blue-500/20 transition-colors rounded"
                            >
                                <Download size={14} />
                                DOWNLOAD {selectedFiles.size} FILES
                            </button>
                        )}
                        <button
                            onClick={handleUploadClick}
                            className="flex items-center gap-2 px-6 py-3 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all rounded"
                        >
                            <Upload size={18} />
                            UPLOAD FILE
                        </button>
                        <button
                            onClick={() => refetchFiles()}
                            className="p-2 border border-gray-700 hover:border-signal text-gray-400 hover:text-signal transition-colors rounded-full"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Left Sidebar - Categories & Machines */}
                    <div className="w-64 border-r border-white/10 bg-black/30 flex flex-col">
                        {/* Category Tabs */}
                        <div className="border-b border-white/10">
                            {/* Machines Section */}
                            <div 
                                onClick={() => { setSidebarView('machines'); setSelectedMachine(null); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors",
                                    sidebarView === 'machines' ? "bg-signal/10 text-signal" : "text-gray-400 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Monitor size={14} />
                                <span className="font-mono text-xs">TARGET_MACHINES</span>
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-white/10 rounded">{machines.length}</span>
                            </div>
                            
                            {/* Divider */}
                            <div className="px-3 py-1.5 border-t border-white/5">
                                <span className="text-[9px] text-gray-600 font-mono">MYTHIC_C2_FILES</span>
                            </div>
                            
                            {/* Downloads */}
                            <div 
                                onClick={() => { setSidebarView('downloads'); setSelectedMachine(null); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                    sidebarView === 'downloads' ? "bg-blue-500/10 text-blue-400" : "text-gray-400 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Download size={14} />
                                <span className="font-mono text-xs">DOWNLOADS</span>
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-white/10 rounded">{downloads.length}</span>
                            </div>
                            
                            {/* Uploads */}
                            <div 
                                onClick={() => { setSidebarView('uploads'); setSelectedMachine(null); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                    sidebarView === 'uploads' ? "bg-green-500/10 text-green-400" : "text-gray-400 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Upload size={14} />
                                <span className="font-mono text-xs">UPLOADS</span>
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-white/10 rounded">{uploads.length}</span>
                            </div>
                            
                            {/* Screenshots */}
                            <div 
                                onClick={() => { setSidebarView('screenshots'); setSelectedMachine(null); }}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                    sidebarView === 'screenshots' ? "bg-purple-500/10 text-purple-400" : "text-gray-400 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Image size={14} />
                                <span className="font-mono text-xs">SCREENSHOTS</span>
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-white/10 rounded">{screenshots.length}</span>
                            </div>
                        </div>

                        {/* List Content */}
                        <div className="flex-1 overflow-auto">
                            {sidebarView === 'machines' ? (
                                /* Machine List */
                                <div className="divide-y divide-white/5">
                                    {callbacksLoading ? (
                                        <div className="p-4 text-center text-gray-500 font-mono text-xs animate-pulse">
                                            SCANNING...
                                        </div>
                                    ) : machines.length === 0 ? (
                                        <div className="p-4 text-center">
                                            <Terminal size={20} className="mx-auto text-gray-600 mb-2" />
                                            <p className="text-gray-500 text-[10px] font-mono">NO_TARGETS</p>
                                        </div>
                                    ) : (
                                        machines.map((machine) => {
                                            const isActive = isRecentlyActive(machine.lastCheckin);
                                            const isSelected = selectedMachine?.host === machine.host;
                                            
                                            return (
                                                <div
                                                    key={machine.host}
                                                    onClick={() => setSelectedMachine(machine)}
                                                    className={cn(
                                                        "p-2.5 cursor-pointer transition-all",
                                                        isSelected 
                                                            ? "bg-signal/10 border-l-2 border-signal" 
                                                            : "hover:bg-white/5 border-l-2 border-transparent"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Monitor size={12} className={isActive ? "text-signal" : "text-gray-600"} />
                                                        <span className={cn(
                                                            "font-mono text-xs truncate flex-1",
                                                            isSelected ? "text-signal" : "text-white"
                                                        )}>
                                                            {machine.host}
                                                        </span>
                                                        {isActive ? (
                                                            <Wifi size={10} className="text-green-400" />
                                                        ) : (
                                                            <WifiOff size={10} className="text-gray-600" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[9px] text-gray-600 mt-1 ml-4">
                                                        <span>{machine.callbacks.length} cb</span>
                                                        <span>•</span>
                                                        <span>{machine.users[0] || '?'}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            ) : (
                                /* File List Preview */
                                <div className="p-2">
                                    {/* Search */}
                                    <div className="relative mb-2">
                                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="text"
                                            placeholder="Search files..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded pl-7 pr-2 py-1.5 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-signal/50"
                                        />
                                    </div>
                                    
                                    {/* Quick Stats */}
                                    <div className="text-[9px] text-gray-500 mb-2 font-mono">
                                        {getCurrentFiles().length} files • {formatBytes(getCurrentFiles().reduce((acc, f) => acc + (f.size || 0), 0))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {sidebarView === 'machines' && !selectedMachine ? (
                            /* Welcome Screen */
                            <WelcomeScreen 
                                machines={machines} 
                                isRecentlyActive={isRecentlyActive}
                                downloads={downloads.length}
                                uploads={uploads.length}
                            />
                        ) : sidebarView === 'machines' && selectedMachine ? (
                            /* Machine File Browser */
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <MachineHeader machine={selectedMachine} isRecentlyActive={isRecentlyActive} />
                                <div className="flex-1 overflow-hidden">
                                    <FileBrowser 
                                        host={selectedMachine.host} 
                                        callbackId={selectedMachine.primaryCallback.display_id} 
                                    />
                                </div>
                            </div>
                        ) : (
                            /* Mythic Files View */
                            <MythicFilesView
                                files={getCurrentFiles()}
                                type={sidebarView}
                                loading={filesLoading}
                                selectedFiles={selectedFiles}
                                onSelectFile={handleSelectFile}
                                onDeleteFile={handleDeleteFile}
                                onPreviewFile={setPreviewFile}
                                onCopy={copyToClipboard}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {previewFile && (
                    <FilePreviewModal 
                        file={previewFile} 
                        onClose={() => setPreviewFile(null)}
                        onCopy={copyToClipboard}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ============================================
// Sub-Components
// ============================================

const WelcomeScreen = ({ 
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

const MachineHeader = ({ machine, isRecentlyActive }: { machine: MachineInfo, isRecentlyActive: (s: string) => boolean }) => (
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

const MythicFilesView = ({ 
    files, type, loading, selectedFiles, onSelectFile, onDeleteFile, onPreviewFile, onCopy 
}: { 
    files: FileMeta[], 
    type: SidebarView, 
    loading: boolean,
    selectedFiles: Set<number>,
    onSelectFile: (id: number, selected: boolean) => void,
    onDeleteFile: (id: number) => void,
    onPreviewFile: (file: FileMeta) => void,
    onCopy: (text: string) => void
}) => {
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-gray-500 font-mono text-sm animate-pulse">LOADING_FILES...</div>
            </div>
        );
    }

    if (type === 'screenshots') {
        return (
            <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-4 gap-3">
                    {files.map((file) => (
                        <div
                            key={file.id}
                            onClick={() => onPreviewFile(file)}
                            className="relative aspect-video bg-black/40 rounded border border-white/10 overflow-hidden group cursor-pointer hover:border-purple-500/50 transition-colors"
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
                            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black to-transparent">
                                <div className="flex items-center gap-1 text-[9px] text-gray-300">
                                    <Monitor size={9} />
                                    {file.host}
                                </div>
                                <div className="text-[8px] text-gray-500">{formatTimeAgo(file.timestamp)}</div>
                            </div>
                        </div>
                    ))}
                </div>
                {files.length === 0 && (
                    <div className="text-center py-20">
                        <Image size={40} className="mx-auto text-gray-600 mb-3" />
                        <p className="text-gray-500 font-mono text-sm">NO_SCREENSHOTS</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
                <thead className="bg-black/40 sticky top-0 z-10">
                    <tr className="text-gray-500 font-mono text-[10px]">
                        <th className="p-2 text-left w-8">
                            <input type="checkbox" className="rounded bg-black/40 border-white/20" />
                        </th>
                        <th className="p-2 text-left">FILENAME</th>
                        <th className="p-2 text-left w-28">HOST</th>
                        <th className="p-2 text-left w-20">SIZE</th>
                        <th className="p-2 text-left w-24">STATUS</th>
                        <th className="p-2 text-left w-28">TIME</th>
                        <th className="p-2 text-left w-24">ACTIONS</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {files.map((file) => (
                        <tr key={file.id} className="hover:bg-white/5 group">
                            <td className="p-2">
                                <input 
                                    type="checkbox" 
                                    checked={selectedFiles.has(file.id)}
                                    onChange={(e) => onSelectFile(file.id, e.target.checked)}
                                    className="rounded bg-black/40 border-white/20"
                                />
                            </td>
                            <td className="p-2">
                                <div className="flex items-center gap-2">
                                    <FileText size={14} className={type === 'downloads' ? "text-blue-400" : "text-green-400"} />
                                    <div className="truncate max-w-xs">
                                        <span className="text-white">{b64DecodeUnicode(file.filename_text) || 'unnamed'}</span>
                                        {file.full_remote_path_text && (
                                            <p className="text-[9px] text-gray-600 truncate">{b64DecodeUnicode(file.full_remote_path_text)}</p>
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td className="p-2 text-gray-400 font-mono text-[10px]">{file.host || '-'}</td>
                            <td className="p-2 text-gray-400 font-mono">{formatBytes(file.size)}</td>
                            <td className="p-2">
                                {file.complete ? (
                                    <span className="flex items-center gap-1 text-green-400 text-[10px]">
                                        <CheckCircle size={10} />
                                        Complete
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-yellow-400 text-[10px]">
                                        <AlertTriangle size={10} />
                                        {Math.round((file.chunks_received / file.total_chunks) * 100)}%
                                    </span>
                                )}
                            </td>
                            <td className="p-2 text-gray-500 text-[10px]">{formatTimeAgo(file.timestamp)}</td>
                            <td className="p-2">
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {file.complete && (
                                        <a
                                            href={`/direct/download/${file.agent_file_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 hover:bg-white/10 rounded text-blue-400"
                                            title="Download"
                                        >
                                            <Download size={12} />
                                        </a>
                                    )}
                                    <button
                                        onClick={() => onPreviewFile(file)}
                                        className="p-1 hover:bg-white/10 rounded text-gray-400"
                                        title="Details"
                                    >
                                        <Eye size={12} />
                                    </button>
                                    <button
                                        onClick={() => onCopy(file.agent_file_id)}
                                        className="p-1 hover:bg-white/10 rounded text-gray-400"
                                        title="Copy ID"
                                    >
                                        <Copy size={12} />
                                    </button>
                                    <button
                                        onClick={() => onDeleteFile(file.id)}
                                        className="p-1 hover:bg-white/10 rounded text-red-400"
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {files.length === 0 && (
                <div className="text-center py-20">
                    <FileText size={40} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-500 font-mono text-sm">NO_FILES_FOUND</p>
                </div>
            )}
        </div>
    );
};

const FilePreviewModal = ({ 
    file, onClose, onCopy 
}: { 
    file: FileMeta, 
    onClose: () => void,
    onCopy: (text: string) => void
}) => (
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
            {file.is_screenshot && (
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
                                <button onClick={() => onCopy(file.md5)} className="p-1 hover:bg-white/10 rounded">
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
                                <button onClick={() => onCopy(file.sha1)} className="p-1 hover:bg-white/10 rounded">
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
                        onClick={() => onCopy(file.agent_file_id)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded text-xs hover:bg-white/20 transition-colors"
                    >
                        <Copy size={14} />
                        Copy File ID
                    </button>
                    <a
                        href={`/direct/download/${file.agent_file_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded text-xs hover:bg-white/20 transition-colors"
                    >
                        <ExternalLink size={14} />
                        Open in New Tab
                    </a>
                </div>
            </div>
        </motion.div>
    </motion.div>
);
