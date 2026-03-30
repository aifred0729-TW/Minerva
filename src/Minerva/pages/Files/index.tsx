/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import {
    DELETE_FILE_MUTATION,
    DELETE_FILES_BULK_MUTATION,
    DOWNLOAD_BULK_MUTATION,
    SEARCH_FILEMETA_QUERY,
    SEARCH_MYTHICTREE_QUERY,
    UPDATE_FILE_COMMENT,
    GET_CALLBACKS,
} from '../../lib/api';
import { GET_MYTHIC_FILES } from '../../lib/api/files';
import { FileBrowser } from '../../components/FileBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import type { MythicTreeNode } from '../../types/files';
import { Folder, Terminal, Monitor, Server, Download, Upload, Image, RefreshCw, Search, Zap } from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import { useAppStore } from '../../store';
import type { MachineInfo, FileMeta } from '../../types/files';
import { uploadFileToMythic, getIPRange, type SidebarView } from './utils';
import { DomainGroupedMachines, WelcomeScreen, MachineHeader } from './FileTable';
import { MythicFilesView } from './MythicFilesView';
import { HostFileModal, ViewEditTagsModal, MediaPreviewModal, FilePreviewModal } from './modals';

export default function Files() {
    const { isSidebarCollapsed } = useAppStore();
    const [selectedMachine, setSelectedMachine] = useState<MachineInfo | null>(null);
    const [sidebarView, setSidebarView] = useState<SidebarView>('machines');
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [hostFilter, setHostFilter] = useState('');
    const [searchField, setSearchField] = useState<'filename' | 'hash' | 'comment' | 'uuid' | 'tag'>('filename');
    const [showDeleted, setShowDeleted] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 20;
    const [previewFile, setPreviewFile] = useState<FileMeta | null>(null);
    const [mediaPreviewFile, setMediaPreviewFile] = useState<FileMeta | null>(null);
    const [tagEditFile, setTagEditFile] = useState<FileMeta | null>(null);
    const [hostFileTarget, setHostFileTarget] = useState<FileMeta | null>(null);
    const [screenshotIndex, setScreenshotIndex] = useState<number | null>(null);
    const [showUTC, setShowUTC] = useState(() => localStorage.getItem('minerva_utc') === 'true');
    // server-side search results (null = use polling data)
    const [searchResults, setSearchResults] = useState<FileMeta[] | null>(null);
    const [searchResultCount, setSearchResultCount] = useState(0);
    const [fileBrowserResults, setFileBrowserResults] = useState<MythicTreeNode[]>([]);
    const [fileBrowserCount, setFileBrowserCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { data: callbacksData, loading: callbacksLoading } = useQuery(GET_CALLBACKS, {
        variables: { limit: 100, offset: 0 },
        pollInterval: 10000
    });

    const { data: filesData, loading: filesLoading, refetch: refetchFiles } = useQuery(GET_MYTHIC_FILES, {
        variables: { deleted: showDeleted },
        pollInterval: 15000
    });

    const [deleteFile] = useMutation(DELETE_FILE_MUTATION, {
        onCompleted: (data) => {
            if (data.deleteFile.status === 'success') {
                snackActions.success('File deleted');
                refetchFiles();
            } else snackActions.error(data.deleteFile.error);
        }
    });

    const [deleteFilesBulk] = useMutation(DELETE_FILES_BULK_MUTATION, {
        onCompleted: (data) => {
            if (data.deleteFile.status === 'success') {
                snackActions.success(`Deleted ${data.deleteFile.file_ids?.length ?? 0} file(s)`);
                setSelectedFiles(new Set());
                refetchFiles();
            } else snackActions.error(data.deleteFile.error);
        }
    });

    const [downloadBulk] = useMutation(DOWNLOAD_BULK_MUTATION, {
        onCompleted: (data) => {
            if (data.download_bulk.status === 'success') {
                const fid = data.download_bulk.file_id;
                window.open(`/direct/download/${fid}`, '_blank');
                snackActions.success(
                    `ZIP ready — click to download`,
                    { onClick: () => window.open(`/direct/download/${fid}`, '_blank'), autoClose: 10000 } as any
                );
            } else snackActions.error(data.download_bulk.error);
        }
    });

    const [updateComment] = useMutation(UPDATE_FILE_COMMENT, {
        onCompleted: () => {
            snackActions.success('Comment updated');
            refetchFiles();
        }
    });

    // ── Server-side search lazy queries ──
    const [executeSearch, { loading: searchLoading }] = useLazyQuery(SEARCH_FILEMETA_QUERY, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            setSearchResults(data.filemeta.map((f: any) => ({
                ...f,
                filename_text: f.filename_text,
                full_remote_path_text: f.full_remote_path_text,
            })));
            setSearchResultCount(data.filemeta_aggregate?.aggregate?.count ?? 0);
        },
    });
    const [executeTreeSearch, { loading: treeSearchLoading }] = useLazyQuery(SEARCH_MYTHICTREE_QUERY, {
        fetchPolicy: 'no-cache',
        onCompleted: (data) => {
            setFileBrowserResults(data.mythictree || []);
            setFileBrowserCount(data.mythictree_aggregate?.aggregate?.count ?? 0);
        },
    });

    // Build Hasura where clause for filemeta server-side search
    const buildFilemetaWhere = useCallback((type: SidebarView, sq: string, hf: string, field: string, del: boolean): any => {
        const base: any = { deleted: { _eq: del } };
        if (hf.trim()) base.host = { _ilike: `%${hf.trim()}%` };
        if (type === 'downloads') Object.assign(base, { is_download_from_agent: { _eq: true }, is_screenshot: { _eq: false } });
        else if (type === 'uploads') Object.assign(base, { is_download_from_agent: { _eq: false }, is_screenshot: { _eq: false }, is_payload: { _eq: false }, eventgroup_id: { _is_null: true } });
        else if (type === 'screenshots') Object.assign(base, { is_screenshot: { _eq: true } });
        else if (type === 'eventing') Object.assign(base, { eventgroup_id: { _is_null: false } });
        if (sq.trim()) {
            const s = sq.trim();
            if (field === 'filename') base._or = [{ filename_utf8: { _ilike: `%${s}%` } }, { full_remote_path_utf8: { _ilike: `%${s}%` } }];
            else if (field === 'hash') {
                // Eventing Workflows don't have meaningful hash tracking — skip silently (same as FileBrowser)
                if (type !== 'eventing') {
                    base._or = [{ md5: { _ilike: `%${s}%` } }, { sha1: { _ilike: `%${s}%` } }];
                }
            }
            else if (field === 'comment') base.comment = { _ilike: `%${s}%` };
            else if (field === 'uuid') base.agent_file_id = { _ilike: `%${s}%` };
            else if (field === 'tag') base.tags = { _or: [
                { tagtype: { name: { _ilike: `%${s}%` } } },
                { data: { _cast: { String: { _ilike: `%${s}%` } } } },
            ]};
        }
        return base;
    }, []);

    const buildMythictreeWhere = useCallback((sq: string, hf: string, field: string, del: boolean): any => {
        const base: any = { deleted: { _eq: del }, tree_type: { _eq: 'file' } };
        if (hf.trim()) base.host = { _ilike: `%${hf.trim()}%` };
        if (sq.trim()) {
            const s = sq.trim();
            if (field === 'filename') base.full_path_text = { _ilike: `%${s}%` };
            else if (field === 'comment') base.comment = { _ilike: `%${s}%` };
            else if (field === 'tag') base.tags = { _or: [
                { tagtype: { name: { _ilike: `%${s}%` } } },
                { data: { _cast: { String: { _ilike: `%${s}%` } } } },
            ]};
            // hash/uuid: FileBrowser doesn't track these — caller handles the warning
        }
        return base;
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const callbacks = callbacksData?.callback || [];
    const downloads = filesData?.downloads || [];
    const uploads = filesData?.uploads || [];
    const screenshots = filesData?.screenshots || [];
    const eventing = filesData?.eventing || [];

    // Group callbacks by host
    const machines: MachineInfo[] = useMemo(() => {
        const machineMap = new Map<string, MachineInfo>();
        callbacks.forEach((cb: any) => {
            const host = cb.host || 'UNKNOWN';
            if (!machineMap.has(host)) {
                machineMap.set(host, { host, domain: cb.domain || '', ip: cb.ip || '', callbacks: [], activeCount: 0, lastCheckin: cb.last_checkin, users: [], primaryCallback: cb });
            }
            const machine = machineMap.get(host)!;
            machine.callbacks.push(cb);
            const lastCheckin = new Date(cb.last_checkin);
            if (lastCheckin > new Date(Date.now() - 5 * 60 * 1000)) machine.activeCount++;
            if (cb.user && !machine.users.includes(cb.user)) machine.users.push(cb.user);
            if (new Date(cb.last_checkin) > new Date(machine.lastCheckin)) {
                machine.lastCheckin = cb.last_checkin;
                machine.primaryCallback = cb;
                machine.domain = cb.domain || machine.domain;
                machine.ip = cb.ip || machine.ip;
            }
        });
        return Array.from(machineMap.values()).sort((a, b) => new Date(b.lastCheckin).getTime() - new Date(a.lastCheckin).getTime());
    }, [callbacks]);

    const machineGroups = useMemo(() => {
        const groupMap = new Map<string, { label: string; isDomain: boolean; machines: MachineInfo[] }>();
        machines.forEach(m => {
            const key = m.domain ? m.domain.toLowerCase() : getIPRange(m.ip);
            const isDomain = !!m.domain;
            if (!groupMap.has(key)) groupMap.set(key, { label: m.domain || getIPRange(m.ip), isDomain, machines: [] });
            groupMap.get(key)!.machines.push(m);
        });
        return Array.from(groupMap.values()).sort((a, b) => {
            if (a.isDomain !== b.isDomain) return a.isDomain ? -1 : 1;
            return a.label.localeCompare(b.label);
        });
    }, [machines]);

    const isRecentlyActive = (lastCheckin: string) =>
        new Date(lastCheckin) > new Date(Date.now() - 5 * 60 * 1000);

    // Client-side filter
    const getFilteredFiles = useCallback((files: FileMeta[]): FileMeta[] => {
        let filtered = files;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(f => {
                switch (searchField) {
                    case 'hash': return (f.md5 || '').toLowerCase().includes(q) || (f.sha1 || '').toLowerCase().includes(q);
                    case 'comment': return (f.comment || '').toLowerCase().includes(q);
                    case 'uuid': return (f.agent_file_id || '').toLowerCase().includes(q);
                    case 'tag': return (f.tags || []).some(t =>
                        (t.tagtype?.name || '').toLowerCase().includes(q) ||
                        JSON.stringify(t.data ?? {}).toLowerCase().includes(q));
                    default: // filename
                        return b64DecodeUnicode(f.filename_text).toLowerCase().includes(q) ||
                               b64DecodeUnicode(f.full_remote_path_text).toLowerCase().includes(q);
                }
            });
        }
        if (hostFilter.trim()) {
            const hq = hostFilter.toLowerCase();
            filtered = filtered.filter(f => (f.host || '').toLowerCase().includes(hq));
        }
        return filtered;
    }, [searchQuery, hostFilter, searchField]);

    const handleDeleteFile = (fileId: number) => deleteFile({ variables: { file_id: fileId } });

    const handleBulkDelete = (ids: Set<number>) => {
        if (ids.size === 0) return;
        deleteFilesBulk({ variables: { file_ids: Array.from(ids) } });
    };

    const handleBulkDownload = (ids: Set<number>, sourceFiles: FileMeta[]) => {
        const agentIds = sourceFiles.filter(f => ids.has(f.id) && f.complete).map(f => f.agent_file_id);
        if (agentIds.length > 0) { snackActions.info('Building ZIP...'); downloadBulk({ variables: { files: agentIds } }); }
    };

    const handleSelectFile = (fileId: number, selected: boolean) => {
        setSelectedFiles(prev => { const s = new Set(prev); selected ? s.add(fileId) : s.delete(fileId); return s; });
    };

    const handleUploadClick = () => fileInputRef.current?.click();

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            snackActions.info(`Uploading ${file.name}...`);
            const result = await uploadFileToMythic(file, `Uploaded via Minerva UI`);
            if (result) snackActions.success(`${file.name} uploaded successfully`);
            else snackActions.error(`Failed to upload ${file.name}`);
        }
        refetchFiles();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success('Copied to clipboard');
    };

    // Switch view — reset page / selection
    const switchView = (v: SidebarView) => {
        setSidebarView(v);
        setSelectedMachine(null);
        setSelectedFiles(new Set());
        setCurrentPage(1);
        setSearchQuery('');
        setHostFilter('');
        setSearchResults(null);
        setFileBrowserResults([]);
    };

    const handleUpdateComment = (fileId: number, comment: string) =>
        updateComment({ variables: { file_id: fileId, comment } });

    const getCurrentFiles = (): FileMeta[] => {
        // Use server-side search results when active
        if (searchResults !== null) return searchResults;
        switch (sidebarView) {
            case 'downloads': return getFilteredFiles(downloads);
            case 'uploads': return getFilteredFiles(uploads);
            case 'screenshots': return getFilteredFiles(screenshots);
            case 'eventing': return getFilteredFiles(eventing);
            default: return [];
        }
    };

    const getCurrentCount = (): number => {
        if (searchResults !== null) return searchResultCount;
        return getCurrentFiles().length;
    };

    const screenshotUrls = screenshots.map((f: FileMeta) => f.agent_file_id);

    // ── URL state persistence ————————————————————————─
    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        const views: SidebarView[] = ['downloads','uploads','screenshots','eventing','filebrowser'];
        if (p.has('view') && views.includes(p.get('view') as SidebarView)) setSidebarView(p.get('view') as SidebarView);
        if (p.has('search')) setSearchQuery(p.get('search')!);
        if (p.has('host'))   setHostFilter(p.get('host')!);
        const fields = ['filename','hash','comment','uuid','tag'] as const;
        if (p.has('field') && fields.includes(p.get('field') as any)) setSearchField(p.get('field') as any);
        if (p.has('deleted')) setShowDeleted(p.get('deleted') === 'true');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (sidebarView === 'machines') return;
        const p = new URLSearchParams();
        if (sidebarView !== 'downloads') p.set('view', sidebarView);
        if (searchQuery)  p.set('search', searchQuery);
        if (hostFilter)   p.set('host', hostFilter);
        if (searchField !== 'filename') p.set('field', searchField);
        if (showDeleted)  p.set('deleted', 'true');
        const newUrl = p.toString() ? `?${p.toString()}` : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
    }, [sidebarView, searchQuery, hostFilter, searchField, showDeleted]);

    // ── Persist UTC preference to localStorage ──
    useEffect(() => { localStorage.setItem('minerva_utc', showUTC ? 'true' : 'false'); }, [showUTC]);

    // ── Server-side search trigger (debounced, fires when search/filter changes) ──
    useEffect(() => {
        if (sidebarView === 'machines') return;
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        // If no search/host filter, revert to polling data
        if (!searchQuery.trim() && !hostFilter.trim()) { setSearchResults(null); return; }
        // FileBrowser doesn't track hashes or UUIDs — warn and bail
        if (sidebarView === 'filebrowser' && (searchField === 'hash' || searchField === 'uuid')) {
            snackActions.warning(`FileBrowser doesn't track file ${searchField === 'hash' ? 'hashes' : 'UUIDs'}`);
            setFileBrowserResults([]);
            setFileBrowserCount(0);
            return;
        }
        // Eventing Workflows don't track hashes — warn and bail
        if (sidebarView === 'eventing' && searchField === 'hash') {
            snackActions.warning(`Eventing Workflows don't track file hashes`);
            setSearchResults(null);
            return;
        }
        searchDebounceRef.current = setTimeout(() => {
            const offset = (currentPage - 1) * PAGE_SIZE;
            if (sidebarView === 'filebrowser') {
                executeTreeSearch({ variables: { where: buildMythictreeWhere(searchQuery, hostFilter, searchField, showDeleted), offset, limit: PAGE_SIZE } });
            } else {
                executeSearch({ variables: { where: buildFilemetaWhere(sidebarView, searchQuery, hostFilter, searchField, showDeleted), offset, limit: PAGE_SIZE } });
            }
        }, 350);
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, hostFilter, searchField, showDeleted, sidebarView, currentPage]);

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-hidden">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                className={cn("flex-1 flex flex-col transition-all duration-300 p-6 lg:p-12", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Folder size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">FILE MANAGER</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                FILE BROWSER
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleUploadClick}
                            className="flex items-center gap-2 px-6 py-3 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all rounded"
                        >
                            <Upload size={18} /> UPLOAD FILE
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
                    {/* Left Sidebar */}
                    <div className="w-64 border-r border-white/10 bg-black/30 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-auto">
                            {/* ── MYTHIC C2 FILES ── */}
                            <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                                <Server size={12} className="text-cyan-400" />
                                <span className="text-[10px] font-mono text-gray-300 uppercase tracking-wider font-semibold">Mythic C2 Files</span>
                            </div>
                            {([
                                { view: 'downloads'   as SidebarView, icon: <Download size={13}/>,  label: 'Downloads',          count: downloads.length,    ac: 'text-blue-300 bg-blue-500/15' },
                                { view: 'uploads'     as SidebarView, icon: <Upload size={13}/>,    label: 'Uploads',            count: uploads.length,      ac: 'text-green-300 bg-green-500/15' },
                                { view: 'screenshots' as SidebarView, icon: <Image size={13}/>,     label: 'Screenshots',        count: screenshots.length,  ac: 'text-purple-300 bg-purple-500/15' },
                                { view: 'eventing'    as SidebarView, icon: <Zap size={13}/>,        label: 'Eventing Workflows', count: eventing.length,     ac: 'text-yellow-300 bg-yellow-500/15' },
                                { view: 'filebrowser' as SidebarView, icon: <Search size={13}/>,     label: 'File Browser Search', count: fileBrowserCount,   ac: 'text-cyan-300 bg-cyan-500/15' },
                            ]).map(({ view, icon, label, count, ac }) => (
                                <div
                                    key={view}
                                    onClick={() => switchView(view)}
                                    className={cn(
                                        "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
                                        sidebarView === view && !selectedMachine ? ac : "text-gray-300 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    {icon}
                                    <span className="font-mono text-xs">{label}</span>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-300">{count}</span>
                                </div>
                            ))}

                            {/* ── TARGET MACHINES ── */}
                            <div className="mt-2 border-t border-white/10">
                                <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                                    <Monitor size={12} className="text-signal" />
                                    <span className="text-[10px] font-mono text-gray-300 uppercase tracking-wider font-semibold">Target Machines</span>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-300">{machines.length}</span>
                                </div>
                                {callbacksLoading ? (
                                    <div className="px-3 py-2 text-[10px] text-gray-300 font-mono animate-pulse">SCANNING...</div>
                                ) : machines.length === 0 ? (
                                    <div className="px-3 py-3 text-center">
                                        <Terminal size={16} className="mx-auto text-gray-500 mb-1" />
                                        <p className="text-gray-400 text-[10px] font-mono">NO_TARGETS</p>
                                    </div>
                                ) : (
                                    <DomainGroupedMachines groups={machineGroups} selectedMachine={selectedMachine}
                                        onSelectMachine={(m) => { setSelectedMachine(m); setSidebarView('machines'); }}
                                        isRecentlyActive={isRecentlyActive} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {sidebarView === 'machines' && !selectedMachine ? (
                            <WelcomeScreen machines={machines} isRecentlyActive={isRecentlyActive}
                                downloads={downloads.length} uploads={uploads.length} />
                        ) : sidebarView === 'machines' && selectedMachine ? (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <MachineHeader machine={selectedMachine} isRecentlyActive={isRecentlyActive} />
                                <div className="flex-1 overflow-hidden">
                                    <FileBrowser host={selectedMachine.host} callbackId={selectedMachine.primaryCallback.display_id} />
                                </div>
                            </div>
                        ) : (
                                <MythicFilesView
                                    allFiles={getCurrentFiles()}
                                    fileBrowserResults={fileBrowserResults}
                                    fileBrowserCount={fileBrowserCount}
                                    serverPaged={searchResults !== null}
                                    totalCount={getCurrentCount()}
                                    type={sidebarView}
                                    loading={filesLoading || searchLoading || treeSearchLoading}
                                selectedFiles={selectedFiles}
                                onSelectFile={handleSelectFile}
                                onDeleteFile={handleDeleteFile}
                                onBulkDelete={handleBulkDelete}
                                onBulkDownload={handleBulkDownload}
                                onUpdateComment={handleUpdateComment}
                                onPreviewFile={setPreviewFile}
                                onCopy={copyToClipboard}
                                searchQuery={searchQuery}
                                onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1); }}
                                hostFilter={hostFilter}
                                onHostFilterChange={(v) => { setHostFilter(v); setCurrentPage(1); }}
                                searchField={searchField}
                                onSearchFieldChange={setSearchField}
                                showDeleted={showDeleted}
                                onToggleDeleted={() => { setShowDeleted(d => !d); refetchFiles(); }}
                                currentPage={currentPage}
                                onPageChange={setCurrentPage}
                                pageSize={PAGE_SIZE}
                                screenshotIndex={screenshotIndex}
                                onScreenshotIndex={setScreenshotIndex}
                                screenshotUrls={screenshotUrls}
                                showUTC={showUTC}
                                onToggleUTC={() => setShowUTC(u => !u)}
                                onPreviewMedia={setMediaPreviewFile}
                                onEditTags={setTagEditFile}
                                onHostFile={setHostFileTarget}
                            />
                        )}
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {previewFile && (
                    <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onCopy={copyToClipboard} />
                )}
                {mediaPreviewFile && (
                    <MediaPreviewModal file={mediaPreviewFile} onClose={() => setMediaPreviewFile(null)} />
                )}
                {tagEditFile && (
                    <ViewEditTagsModal file={tagEditFile} onClose={() => { setTagEditFile(null); refetchFiles(); }} />
                )}
                {hostFileTarget && (
                    <HostFileModal file={hostFileTarget} onClose={() => setHostFileTarget(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================
// Sub-Components
// ============================================

// ── ConfirmDeleteDialog ───────────────────────
