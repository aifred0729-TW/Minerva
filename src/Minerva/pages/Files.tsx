/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useLazyQuery, gql } from '@apollo/client';
import { GET_CALLBACKS } from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { FileBrowser } from '../components/FileBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { 
    Folder, FolderOpen, HardDrive, Terminal, User, Clock, Monitor, Server, 
    Wifi, WifiOff, Download, Upload, Image, Trash2, RefreshCw,
    Eye, Link2, FileText, ChevronDown, ChevronRight, Search,
    MoreVertical, ExternalLink, Copy, CheckCircle, XCircle,
    Package, AlertTriangle, Globe, Network, Archive, Edit2,
    Tag, Hash, MessageSquare, Fingerprint, Filter, ChevronLeft,
    ChevronUp, EyeOff, X, Info, Zap
} from 'lucide-react';
import { snackActions } from '../../components/utilities/Snackbar';
import { useAppStore } from '../store';

// ============================================
// Types
// ============================================
interface MachineInfo {
    host: string;
    domain: string;
    ip: string;
    callbacks: any[];
    activeCount: number;
    lastCheckin: string;
    users: string[];
    primaryCallback: any;
}

interface TagType { name: string; color: string; }
interface FileTag { id: number; tagtype: TagType; data: any; }

interface MythicTreeNode {
    id: number;
    full_path_text: string;
    host: string;
    comment: string;
    deleted: boolean;
    metadata?: string;
    can_have_children: boolean;
    filemeta?: Array<{ id: number; agent_file_id: string; complete: boolean; size: number; total_chunks: number; chunks_received: number; timestamp: string; task?: { comment?: string; }; }>;
    task?: { display_id: number; id: number; comment?: string; };
    callback?: { id: number; display_id: number; mythictree_groups?: string[]; };
    tags?: FileTag[];
}

interface FileMeta {
    id: number;
    agent_file_id: string;
    filename_text: string;
    full_remote_path_text: string;
    host: string;
    size: number;
    chunk_size?: number;
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
    task?: {
        display_id: number;
        comment?: string;
        command?: { cmd: string; id: number };
        callback?: { display_id: number; mythictree_groups?: string[] };
    };
    eventgroup?: { name: string; id: number } | null;
    copy_of_file?: FileMeta | null;
    tags?: FileTag[];
}

// ============================================
// GraphQL Queries & Mutations
// ============================================
const FILE_FRAGMENT = `
    id agent_file_id filename_text full_remote_path_text
    host size chunk_size complete deleted
    md5 sha1 timestamp comment chunks_received total_chunks
    operator { username }
    task {
        display_id comment
        command { cmd id }
        callback { display_id mythictree_groups }
    }
    eventgroup { name id }
    copy_of_file {
        id agent_file_id filename_text full_remote_path_text
        host size complete deleted md5 sha1 timestamp comment
        chunks_received total_chunks
        task {
            display_id comment
            command { cmd id }
            callback { display_id mythictree_groups }
        }
    }
    tags { id data tagtype { name color } }
`;

const GET_MYTHIC_FILES = gql`
    query GetMythicFiles($deleted: Boolean!) {
        downloads: filemeta(
            where: {
                is_download_from_agent: { _eq: true },
                is_screenshot: { _eq: false },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 2000
        ) { ${FILE_FRAGMENT} }
        uploads: filemeta(
            where: {
                is_download_from_agent: { _eq: false },
                is_screenshot: { _eq: false },
                is_payload: { _eq: false },
                eventgroup_id: { _is_null: true },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 2000
        ) { ${FILE_FRAGMENT} }
        screenshots: filemeta(
            where: {
                is_screenshot: { _eq: true },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 1000
        ) { ${FILE_FRAGMENT} }
        eventing: filemeta(
            where: {
                eventgroup_id: { _is_null: false },
                deleted: { _eq: $deleted }
            },
            order_by: { id: desc },
            limit: 2000
        ) { ${FILE_FRAGMENT} }
    }
`;

const DELETE_FILE_MUTATION = gql`
    mutation DeleteFile($file_id: Int) {
        deleteFile(file_id: $file_id) {
            status error file_ids
        }
    }
`;

const DELETE_FILES_BULK_MUTATION = gql`
    mutation DeleteFilesBulk($file_ids: [Int!]) {
        deleteFile(file_ids: $file_ids) {
            status error file_ids
        }
    }
`;

const DOWNLOAD_BULK_MUTATION = gql`
    mutation DownloadBulk($files: [String!]!) {
        download_bulk(files: $files) {
            status error file_id
        }
    }
`;

const UPDATE_FILE_COMMENT = gql`
    mutation UpdateFileComment($file_id: Int!, $comment: String!) {
        update_filemeta_by_pk(pk_columns: { id: $file_id }, _set: { comment: $comment }) {
            id comment
        }
    }
`;

const GET_TAGTYPES = gql`
    query GetTagTypes { tagtype(order_by: {name: asc}) { id name color description } }
`;

const GET_FILE_TAGS = gql`
    query GetFileTags($filemeta_id: Int!) {
        tag(where: {filemeta_id: {_eq: $filemeta_id}}, order_by: {tagtype: {name: asc}}) {
            id source url data
            tagtype { id name color description }
        }
    }
`;

const CREATE_TAG_MUTATION = gql`
    mutation CreateTag($filemeta_id: Int!, $tagtype_id: Int!, $source: String!, $url: String!, $data: jsonb!) {
        createTag(filemeta_id: $filemeta_id, tagtype_id: $tagtype_id, source: $source, url: $url, data: $data) {
            id status error
        }
    }
`;

const UPDATE_TAG_MUTATION = gql`
    mutation UpdateTag($tag_id: Int!, $source: String!, $url: String!, $data: jsonb!) {
        update_tag_by_pk(pk_columns: {id: $tag_id}, _set: {source: $source, url: $url, data: $data}) { id }
    }
`;

const DELETE_TAG_MUTATION = gql`
    mutation DeleteTag($tag_id: Int!) {
        delete_tag_by_pk(id: $tag_id) { id }
    }
`;

const UPDATE_MYTHICTREE_COMMENT = gql`
    mutation UpdateMythictreeComment($id: Int!, $comment: String!) {
        update_mythictree_by_pk(pk_columns: {id: $id}, _set: {comment: $comment}) { id comment }
    }
`;

const GET_TREE_TAGS = gql`
    query GetTreeTags($mythictree_id: Int!) {
        tag(where: {mythictree_id: {_eq: $mythictree_id}}, order_by: {tagtype: {name: asc}}) {
            id source url data
            tagtype { id name color description }
        }
    }
`;

const CREATE_TREE_TAG = gql`
    mutation CreateTreeTag($mythictree_id: Int!, $tagtype_id: Int!, $source: String!, $url: String!, $data: jsonb!) {
        createTag(mythictree_id: $mythictree_id, tagtype_id: $tagtype_id, source: $source, url: $url, data: $data) {
            id status error
        }
    }
`;

// ── Host via C2 ───────────────────────────────
const GET_C2_PROFILES = gql`
    query GetC2Profiles {
        c2profile(where: {deleted: {_eq: false}, container_running: {_eq: true}, is_p2p: {_eq: false}}, order_by: {name: asc}) {
            id name
        }
    }
`;

const HOST_FILE_MUTATION = gql`
    mutation HostFile($c2_id: Int!, $file_uuid: String!, $host_url: String!, $alert_on_download: Boolean, $remove: Boolean) {
        c2HostFile(c2_id: $c2_id, file_uuid: $file_uuid, host_url: $host_url, alert_on_download: $alert_on_download, remove: $remove) {
            status error
        }
    }
`;

// ── Server-side search (dynamic where clause via Hasura) ─────────────────
const SEARCH_FILEMETA_QUERY = gql`
    query SearchFilemeta($where: filemeta_bool_exp!, $offset: Int!, $limit: Int!) {
        filemeta(where: $where, offset: $offset, limit: $limit, order_by: {id: desc}) {
            ${FILE_FRAGMENT}
        }
        filemeta_aggregate(where: $where) {
            aggregate { count }
        }
    }
`;

const MYTHICTREE_FRAGMENT = `
    id full_path_text host comment deleted metadata can_have_children
    filemeta { id agent_file_id chunks_received complete size total_chunks timestamp }
    task { display_id id }
    callback { id display_id mythictree_groups }
    tags { id data tagtype { name color } }
`;

const SEARCH_MYTHICTREE_QUERY = gql`
    query SearchMythictree($where: mythictree_bool_exp!, $offset: Int!, $limit: Int!) {
        mythictree(where: $where, offset: $offset, limit: $limit, order_by: {id: desc}) {
            ${MYTHICTREE_FRAGMENT}
        }
        mythictree_aggregate(where: $where) {
            aggregate { count }
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
type SidebarView = 'machines' | 'downloads' | 'uploads' | 'screenshots' | 'eventing' | 'filebrowser';

const getIPRange = (ip: string): string => {
    try {
        const parsed = JSON.parse(ip)?.[0] || ip;
        const parts = parsed.split('.');
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        return parsed;
    } catch {
        const parts = (ip || '').split('.');
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        return ip || 'UNKNOWN';
    }
};

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
            <Sidebar />
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
const ConfirmDeleteDialog = ({
    filename, onConfirm, onCancel,
}: {
    filename: string; onConfirm: () => void; onCancel: () => void;
}) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={onCancel}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[#0b0f17] border border-red-500/30 rounded-lg p-5 max-w-sm w-full space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
                <Trash2 size={15} className="text-red-400 shrink-0" />
                <h3 className="text-white font-semibold text-sm">Delete File?</h3>
            </div>
            <p className="text-gray-400 text-xs font-mono break-all">
                {filename}
            </p>
            <p className="text-gray-500 text-[10px]">This action cannot be undone.</p>
            <div className="flex gap-2.5 pt-1">
                <button onClick={onConfirm}
                    className="flex-1 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-mono hover:bg-red-500/30 transition-colors">
                    DELETE
                </button>
                <button onClick={onCancel}
                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors">
                    CANCEL
                </button>
            </div>
        </motion.div>
    </motion.div>
);

// ── TagsDisplay ──────────────────────────────
const TagsDisplay = ({ tags }: { tags?: FileTag[] }) => {
    if (!tags || tags.length === 0) return <span className="text-gray-700 text-[9px]">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {tags.map(t => (
                <span
                    key={t.id}
                    className="px-1 py-0.5 rounded text-[9px] font-mono"
                    style={{
                        background: (t.tagtype?.color || '#666') + '30',
                        color: t.tagtype?.color || '#aaa',
                        border: `1px solid ${(t.tagtype?.color || '#666')}60`,
                    }}
                >
                    {t.tagtype?.name || 'tag'}
                </span>
            ))}
        </div>
    );
};

// ── CommentCell ───────────────────────────────
const CommentCell = ({ comment, fileId, onSave }: { comment: string; fileId: number; onSave: (id: number, c: string) => void }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(comment);

    const handleSave = () => {
        onSave(fileId, value);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setValue(comment); setEditing(false); } }}
                    className="flex-1 bg-black/60 border border-signal/40 rounded px-1.5 py-0.5 text-[10px] text-white font-mono min-w-0"
                    style={{ minWidth: 80 }}
                />
                <button onClick={handleSave} className="text-green-400 hover:text-green-300 p-0.5"><CheckCircle size={11} /></button>
                <button onClick={() => { setValue(comment); setEditing(false); }} className="text-gray-500 hover:text-gray-300 p-0.5"><X size={11} /></button>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1 group/comment cursor-pointer" onClick={e => { e.stopPropagation(); setEditing(true); }}>
            <span className="text-gray-400 text-[10px] truncate max-w-[100px]" title={comment}>{comment || <span className="text-gray-700">—</span>}</span>
            <Edit2 size={9} className="text-gray-700 group-hover/comment:text-gray-400 shrink-0 transition-colors" />
        </div>
    );
};

// ── ExpandedRowDetails ────────────────────────
const ExpandedRowDetails = ({
    file, colSpan, onCopy, onHostFile, showUTC,
}: {
    file: FileMeta; colSpan: number;
    onCopy: (s: string) => void;
    onHostFile?: (f: FileMeta) => void;
    showUTC?: boolean;
}) => {
    const displayTime = (ts: string) => {
        if (!ts) return '—';
        return showUTC
            ? new Date(ts).toISOString().replace('T', ' ').substring(0, 19) + ' Z'
            : new Date(ts).toLocaleString();
    };
    return (
    <tr>
        <td colSpan={colSpan} className="px-4 pb-3">
            <div className="bg-black/40 border border-white/10 rounded p-3 text-[10px] space-y-2">
                {/* Hash/UUID row */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <span className="text-gray-600 block">MD5</span>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-300 font-mono break-all">{file.md5 || '—'}</span>
                            {file.md5 && <button onClick={() => onCopy(file.md5)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={9}/></button>}
                        </div>
                    </div>
                    <div>
                        <span className="text-gray-600 block">SHA1</span>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-300 font-mono break-all">{file.sha1 || '—'}</span>
                            {file.sha1 && <button onClick={() => onCopy(file.sha1)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={9}/></button>}
                        </div>
                    </div>
                    <div>
                        <span className="text-gray-600 block">UUID</span>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-300 font-mono break-all">{file.agent_file_id}</span>
                            <button onClick={() => onCopy(file.agent_file_id)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={9}/></button>
                        </div>
                    </div>
                </div>

                {/* Operator / Task / Command / Time */}
                <div className="grid grid-cols-4 gap-4 pt-1 border-t border-white/5">
                    <div>
                        <span className="text-gray-600 block">Operator</span>
                        <span className="text-gray-300">{file.operator?.username || '—'}</span>
                    </div>
                    <div>
                        <span className="text-gray-600 block">Task</span>
                        {file.task ? (
                            <div className="flex flex-col gap-0.5">
                                <a href={`/new/callbacks/${file.task.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                    C-{file.task.callback?.display_id}
                                </a>
                                <a href={`/new/task/${file.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                    T-{file.task.display_id}
                                </a>
                                {file.task.comment && <span className="text-gray-500 italic">{file.task.comment}</span>}
                            </div>
                        ) : <span className="text-gray-700">—</span>}
                    </div>
                    <div>
                        <span className="text-gray-600 block">Command</span>
                        <span className="text-gray-300 font-mono">{file.task?.command?.cmd || '—'}</span>
                    </div>
                    <div>
                        <span className="text-gray-600 block">Timestamp</span>
                        <span className="text-gray-300">{displayTime(file.timestamp)}</span>
                    </div>
                </div>

                {/* Groups */}
                {file.task?.callback?.mythictree_groups && file.task.callback.mythictree_groups.length > 0 &&
                    !file.task.callback.mythictree_groups.every(g => g === 'Default') && (
                    <div className="pt-1 border-t border-white/5">
                        <span className="text-gray-600">Callback Groups: </span>
                        <span className="text-gray-300">{file.task.callback.mythictree_groups.join(', ')}</span>
                    </div>
                )}

                {/* Eventing workflow — clickable link */}
                {file.eventgroup && (
                    <div className="pt-1 border-t border-white/5 flex items-center gap-2">
                        <Zap size={10} className="text-yellow-400" />
                        <span className="text-gray-600">Eventing Workflow: </span>
                        <a href={`/new/eventing?eventgroup=${file.eventgroup.id}`} target="_blank" rel="noopener noreferrer"
                            className="text-yellow-300 hover:underline hover:text-yellow-200">
                            {file.eventgroup.name}
                        </a>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-1 border-t border-white/5 flex items-center flex-wrap gap-2">
                    {file.complete && (
                        <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/25 transition-colors">
                            <Download size={10} /> Download
                        </a>
                    )}
                    {onHostFile && (
                        <button onClick={() => onHostFile(file)}
                            className="flex items-center gap-1 px-2 py-1 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/25 transition-colors">
                            <Globe size={10} /> Host via C2
                        </button>
                    )}
                </div>

                {/* copy_of_file — full details matching OldReactUI */}
                {file.copy_of_file && (
                    <div className="pt-2 border-t border-blue-500/20">
                        <p className="text-blue-400 text-[9px] font-mono mb-2">
                            {b64DecodeUnicode(file.filename_text)} is a copy of the following file:
                        </p>
                        <div className="bg-blue-500/5 border border-blue-500/15 rounded p-2 space-y-2">
                            {/* Identifiers row */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <span className="text-gray-600 block">MD5</span>
                                    <span className="text-gray-300 font-mono break-all text-[9px]">{file.copy_of_file.md5 || '—'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block">SHA1</span>
                                    <span className="text-gray-300 font-mono break-all text-[9px]">{file.copy_of_file.sha1 || '—'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block">UUID</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-gray-300 font-mono break-all text-[9px]">{file.copy_of_file.agent_file_id}</span>
                                        <button onClick={() => onCopy(file.copy_of_file!.agent_file_id)} className="text-gray-600 hover:text-gray-300 shrink-0"><Copy size={8}/></button>
                                    </div>
                                </div>
                            </div>
                            {/* Destination / Task / Timestamp / Command row */}
                            <div className="grid grid-cols-4 gap-4 pt-1 border-t border-blue-500/10">
                                <div>
                                    <span className="text-gray-600 block">Destination</span>
                                    {file.copy_of_file.host && <p className="text-gray-400 text-[9px]"><b>Host:</b> {file.copy_of_file.host}</p>}
                                    {file.copy_of_file.task?.callback?.mythictree_groups &&
                                        file.copy_of_file.task.callback.mythictree_groups.length > 0 &&
                                        !file.copy_of_file.task.callback.mythictree_groups.every((g: string) => g === 'Default') && (
                                        <p className="text-gray-500 text-[9px]">Groups: {file.copy_of_file.task.callback.mythictree_groups.join(', ')}</p>
                                    )}
                                    {(() => {
                                        const p = b64DecodeUnicode(file.copy_of_file!.full_remote_path_text);
                                        if (!p) return null;
                                        return file.copy_of_file!.deleted ? (
                                            <p className="text-gray-500 text-[9px] break-all">{p}</p>
                                        ) : file.copy_of_file!.complete ? (
                                            <a href={`/direct/download/${file.copy_of_file!.agent_file_id}`} className="text-blue-400 hover:underline text-[9px] break-all">{p}</a>
                                        ) : (
                                            <p className="text-gray-400 text-[9px] break-all">{p} <span className="text-yellow-500">({file.copy_of_file!.chunks_received}/{file.copy_of_file!.total_chunks})</span></p>
                                        );
                                    })()}
                                </div>
                                <div>
                                    <span className="text-gray-600 block">Task</span>
                                    {file.copy_of_file.task ? (
                                        <div className="flex flex-col gap-0.5">
                                            <a href={`/new/callbacks/${file.copy_of_file.task.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-[9px]">C-{file.copy_of_file.task.callback?.display_id}</a>
                                            <a href={`/new/task/${file.copy_of_file.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-[9px]">T-{file.copy_of_file.task.display_id}</a>
                                            {file.copy_of_file.task.comment && <span className="text-gray-500 italic text-[9px]">{file.copy_of_file.task.comment}</span>}
                                        </div>
                                    ) : <span className="text-gray-700">—</span>}
                                </div>
                                <div>
                                    <span className="text-gray-600 block">Timestamp</span>
                                    <span className="text-gray-300 text-[9px]">{displayTime(file.copy_of_file.timestamp)}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block">Command</span>
                                    <span className="text-gray-300 font-mono text-[9px]">{file.copy_of_file.task?.command?.cmd || '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </td>
    </tr>
    );
};

// ── SearchFilterBar ───────────────────────────
const SearchFilterBar = ({
    searchQuery, onSearchChange,
    hostFilter, onHostFilterChange,
    searchField, onSearchFieldChange,
    showDeleted, onToggleDeleted,
    showUTC, onToggleUTC,
    totalCount, pageSize, currentPage, onPageChange,
}: {
    searchQuery: string; onSearchChange: (v: string) => void;
    hostFilter: string; onHostFilterChange: (v: string) => void;
    searchField: 'filename' | 'hash' | 'comment' | 'uuid' | 'tag'; onSearchFieldChange: (v: 'filename' | 'hash' | 'comment' | 'uuid' | 'tag') => void;
    showDeleted: boolean; onToggleDeleted: () => void;
    showUTC: boolean; onToggleUTC: () => void;
    totalCount: number; pageSize: number; currentPage: number; onPageChange: (p: number) => void;
}) => {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const fieldIcons: Record<string, React.ReactNode> = {
        filename: <FileText size={11}/>, hash: <Fingerprint size={11}/>,
        comment: <MessageSquare size={11}/>, uuid: <Hash size={11}/>,
        tag: <Tag size={11}/>,
    };
    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-black/30 border-b border-white/10 shrink-0 flex-wrap">
            {/* Search type */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded overflow-hidden">
                {(['filename', 'hash', 'comment', 'uuid', 'tag'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => onSearchFieldChange(f)}
                        title={f}
                        className={cn(
                            "px-2 py-1.5 text-[10px] font-mono flex items-center gap-1 transition-colors",
                            searchField === f ? "bg-signal/20 text-signal" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        {fieldIcons[f]}
                    </button>
                ))}
            </div>
            {/* Search */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-2 py-1">
                <Search size={11} className="text-gray-500 shrink-0" />
                <input
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder={`Search ${searchField}...`}
                    className="bg-transparent text-[10px] text-white font-mono outline-none w-36 placeholder:text-gray-700"
                />
                {searchQuery && <button onClick={() => onSearchChange('')} className="text-gray-600 hover:text-gray-300"><X size={10}/></button>}
            </div>
            {/* Host filter */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-2 py-1">
                <Monitor size={11} className="text-gray-500 shrink-0" />
                <input
                    value={hostFilter}
                    onChange={e => onHostFilterChange(e.target.value)}
                    placeholder="Filter by host..."
                    className="bg-transparent text-[10px] text-white font-mono outline-none w-28 placeholder:text-gray-700"
                />
                {hostFilter && <button onClick={() => onHostFilterChange('')} className="text-gray-600 hover:text-gray-300"><X size={10}/></button>}
            </div>
            {/* Show deleted */}
            <button
                onClick={onToggleDeleted}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-mono transition-colors",
                    showDeleted ? "border-red-500/50 text-red-400 bg-red-500/10" : "border-white/10 text-gray-500 hover:text-gray-300"
                )}
            >
                {showDeleted ? <Eye size={11}/> : <EyeOff size={11}/>}
                Deleted
            </button>
            {/* UTC toggle */}
            <button
                onClick={onToggleUTC}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-mono transition-colors",
                    showUTC ? "border-cyan-500/50 text-cyan-400 bg-cyan-500/10" : "border-white/10 text-gray-500 hover:text-gray-300"
                )}
            >
                <Clock size={11}/>
                {showUTC ? 'UTC' : 'LOCAL'}
            </button>
            {/* Spacer */}
            <div className="flex-1" />
            {/* Results count */}
            <span className="text-[10px] text-gray-600 font-mono">{totalCount} items</span>
            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-0.5 disabled:opacity-30 text-gray-400 hover:text-white"><ChevronLeft size={13}/></button>
                    <span className="text-[10px] text-gray-400 font-mono px-1">{currentPage}/{totalPages}</span>
                    <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-0.5 disabled:opacity-30 text-gray-400 hover:text-white"><ChevronRight size={13}/></button>
                </div>
            )}
        </div>
    );
};

// ── BulkActionBar ─────────────────────────────
const BulkActionBar = ({
    selected, allFiles, onBulkDownload, onBulkDelete, onClearSelection,
}: {
    selected: Set<number>; allFiles: FileMeta[];
    onBulkDownload: () => void; onBulkDelete: () => void;
    onClearSelection: () => void;
}) => {
    if (selected.size === 0) return null;
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-signal/5 border-b border-signal/20 shrink-0">
            <span className="text-[10px] text-signal font-mono">{selected.size} selected</span>
            <button onClick={onBulkDownload} className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] hover:bg-blue-500/30 transition-colors">
                <Archive size={11}/> Zip Download
            </button>
            <button onClick={onBulkDelete} className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px] hover:bg-red-500/30 transition-colors">
                <Trash2 size={11}/> Delete
            </button>
            <button onClick={onClearSelection} className="ml-auto text-gray-600 hover:text-gray-400 p-0.5"><X size={12}/></button>
        </div>
    );
};

// ============================================
// Domain-Grouped Machine List
// ============================================
const DomainGroupedMachines = ({
    groups,
    selectedMachine,
    onSelectMachine,
    isRecentlyActive,
}: {
    groups: { label: string; isDomain: boolean; machines: MachineInfo[] }[];
    selectedMachine: MachineInfo | null;
    onSelectMachine: (m: MachineInfo) => void;
    isRecentlyActive: (s: string) => boolean;
}) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggleGroup = (label: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(label) ? next.delete(label) : next.add(label);
            return next;
        });
    };

    return (
        <div className="pb-1">
            {groups.map(({ label, isDomain, machines }) => {
                const isCollapsed = collapsed.has(label);
                const anyActive = machines.some(m => isRecentlyActive(m.lastCheckin));
                return (
                    <div key={label}>
                        {/* Group header */}
                        <button
                            onClick={() => toggleGroup(label)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors text-left group"
                        >
                            {isCollapsed
                                ? <ChevronRight size={12} className="text-gray-400 group-hover:text-gray-200 shrink-0" />
                                : <ChevronDown  size={12} className="text-gray-400 group-hover:text-gray-200 shrink-0" />}
                            {isDomain
                                ? <Globe   size={12} className={anyActive ? "text-cyan-400 shrink-0" : "text-gray-400 shrink-0"} />
                                : <Network size={12} className={anyActive ? "text-cyan-400 shrink-0" : "text-gray-400 shrink-0"} />}
                            <span className={cn(
                                "font-mono text-[11px] truncate flex-1",
                                anyActive ? "text-white" : "text-gray-300"
                            )}>{label}</span>
                            <span className="text-[9px] text-gray-400 font-mono shrink-0">{machines.length}</span>
                        </button>

                        {/* Machines in group */}
                        {!isCollapsed && machines.map(machine => {
                            const isActive = isRecentlyActive(machine.lastCheckin);
                            const isSelected = selectedMachine?.host === machine.host;
                            return (
                                <div
                                    key={machine.host}
                                    onClick={() => onSelectMachine(machine)}
                                    className={cn(
                                        "flex items-center gap-2 pl-8 pr-3 py-1.5 cursor-pointer transition-all border-l-2",
                                        isSelected
                                            ? "bg-signal/10 border-signal"
                                            : "border-transparent hover:bg-white/5 hover:border-white/20"
                                    )}
                                >
                                    <Monitor size={11} className={isActive ? "text-signal shrink-0" : "text-gray-400 shrink-0"} />
                                    <span className={cn(
                                        "font-mono text-xs truncate flex-1",
                                        isSelected ? "text-signal" : isActive ? "text-white" : "text-gray-300"
                                    )}>
                                        {machine.host}
                                    </span>
                                    <span className="text-[9px] text-gray-400 font-mono shrink-0">{machine.users[0] || '?'}</span>
                                    {isActive
                                        ? <Wifi    size={9} className="text-green-400 shrink-0" />
                                        : <WifiOff size={9} className="text-gray-500 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};

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

// ──────────────────────────────────────────────────────────────────────────
// Generic File Table (used by Uploads, Downloads, Eventing)
// ──────────────────────────────────────────────────────────────────────────
interface FileTableProps {
    files: FileMeta[];
    accentColor: string;          // e.g. 'text-green-400'
    selectedFiles: Set<number>;
    onSelectFile: (id: number, sel: boolean) => void;
    onDeleteFile: (id: number) => void;
    onUpdateComment: (id: number, c: string) => void;
    onCopy: (s: string) => void;
    /** For uploads: group by host — staged vs deployed */
    groupByHost?: boolean;
    /** For uploads: show separate Destination column (full_remote_path + groups) */
    showDestination?: boolean;
    onPreviewMedia?: (file: FileMeta) => void;
    onEditTags?: (file: FileMeta) => void;
    showWorkflow?: boolean;
    showUTC?: boolean;
    onHostFile?: (file: FileMeta) => void;
}

const FileTable = ({
    files, accentColor, selectedFiles, onSelectFile, onDeleteFile, onUpdateComment, onCopy, groupByHost,
    showDestination, onPreviewMedia, onEditTags, showWorkflow, showUTC, onHostFile,
}: FileTableProps) => {
    const [sortKey, setSortKey] = useState<'timestamp' | 'filename_text' | 'size'>('timestamp');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['__staged__']));

    const toggleSort = (k: typeof sortKey) => {
        if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(k); setSortDir('desc'); }
    };

    const sortFn = (arr: FileMeta[]) => arr.slice().sort((a, b) => {
        const va = sortKey === 'size' ? a.size : sortKey === 'timestamp' ? a.timestamp : b64DecodeUnicode(a.filename_text).toLowerCase();
        const vb = sortKey === 'size' ? b.size : sortKey === 'timestamp' ? b.timestamp : b64DecodeUnicode(b.filename_text).toLowerCase();
        return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });

    const toggleRow = (id: number) => setExpandedRows(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const toggleGroup = (k: string) => setExpandedGroups(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
    const toggleGroupSelect = (groupFiles: FileMeta[]) => {
        const ids = groupFiles.map(f => f.id);
        const allSel = ids.every(id => selectedFiles.has(id));
        ids.forEach(id => onSelectFile(id, !allSel));
    };

    const SortIcon = ({ k }: { k: typeof sortKey }) =>
        sortKey !== k ? null : sortDir === 'asc'
            ? <ChevronUp size={9} className="inline ml-0.5" />
            : <ChevronDown size={9} className="inline ml-0.5" />;

    const COL_COUNT = 8 + (showWorkflow ? 1 : 0) + (showDestination ? 1 : 0); // checkbox, file, [destination], host, size, comment, tags, [workflow], time, actions
    const displayTime = (ts: string) => showUTC
        ? new Date(ts).toISOString().replace('T', ' ').substring(0, 19) + ' Z'
        : formatTimeAgo(ts);

    const FileRow = ({ file }: { file: FileMeta }) => {
        const pct = file.total_chunks > 0 ? Math.round((file.chunks_received / file.total_chunks) * 100) : 0;
        const filename = b64DecodeUnicode(file.filename_text) || 'unnamed';
        const remotePath = b64DecodeUnicode(file.full_remote_path_text);
        const isSel = selectedFiles.has(file.id);
        const isExpanded = expandedRows.has(file.id);
        const [confirmDelete, setConfirmDelete] = useState(false);

        return (
            <React.Fragment>
                {confirmDelete && (
                    <AnimatePresence>
                        <ConfirmDeleteDialog
                            filename={filename}
                            onConfirm={() => { onDeleteFile(file.id); setConfirmDelete(false); }}
                            onCancel={() => setConfirmDelete(false)}
                        />
                    </AnimatePresence>
                )}
                <tr
                    className={cn('group hover:bg-white/5 transition-colors cursor-pointer', isSel && 'bg-green-500/5', file.deleted && 'opacity-50')}
                    onClick={() => toggleRow(file.id)}
                >
                    <td className="p-2 w-8" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={e => onSelectFile(file.id, e.target.checked)}
                            className="rounded bg-black/40 border-white/20" />
                    </td>
                    <td className="p-2 min-w-0">
                        <div className="flex items-start gap-2 min-w-0">
                            <span className="shrink-0 mt-0.5">
                                {isExpanded ? <ChevronDown size={11} className="text-gray-500"/> : <ChevronRight size={11} className="text-gray-500"/>}
                            </span>
                            <FileText size={12} className={cn(accentColor, 'shrink-0 mt-0.5')} />
                            <div className="min-w-0">
                                {file.deleted ? (
                                    <span className="text-gray-500 text-xs line-through" title={filename}>{filename}</span>
                                ) : file.complete ? (
                                    <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                        className="text-white text-xs hover:underline" title={filename} onClick={e => e.stopPropagation()}>
                                        {filename}
                                    </a>
                                ) : (
                                    <span className="text-white text-xs" title={filename}>{filename}</span>
                                )}
                                {!showDestination && remotePath && <p className="text-[9px] text-gray-600 font-mono truncate mt-0.5" title={remotePath}>{remotePath}</p>}
                                {!file.complete && (
                                    <span className="text-yellow-500 text-[9px]">{file.chunks_received}/{file.total_chunks} chunks ({pct}%)</span>
                                )}
                            </div>
                        </div>
                    </td>
                    {/* Destination column (uploads only) */}
                    {showDestination && (
                        <td className="p-2 min-w-0">
                            <div className="text-[10px] space-y-0.5">
                                {file.task?.callback?.mythictree_groups && !file.task.callback.mythictree_groups.every((g: string) => g === 'Default') && (
                                    <p className="text-gray-500 font-mono text-[9px]">Groups: {file.task.callback.mythictree_groups.join(', ')}</p>
                                )}
                                {remotePath ? (
                                    file.deleted ? (
                                        <span className="text-gray-500 font-mono break-all">{remotePath}</span>
                                    ) : file.complete ? (
                                        <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                            className="text-green-400 hover:underline font-mono break-all" onClick={e => e.stopPropagation()}>{remotePath}</a>
                                    ) : (
                                        <span className="text-gray-400 font-mono break-all">{remotePath}</span>
                                    )
                                ) : <span className="text-gray-700">—</span>}
                            </div>
                        </td>
                    )}
                    <td className="p-2 w-28 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                        {file.host || <span className="text-gray-700">—</span>}
                    </td>
                    <td className="p-2 w-20 font-mono text-[10px] text-gray-400 whitespace-nowrap">{formatBytes(file.size)}</td>
                    <td className="p-2 w-32 max-w-[128px]" onClick={e => e.stopPropagation()}>
                        <CommentCell comment={file.comment || ''} fileId={file.id} onSave={onUpdateComment} />
                    </td>
                    <td className="p-2 w-28 max-w-[112px]">
                        <TagsDisplay tags={file.tags} />
                    </td>
                    {showWorkflow && (
                        <td className="p-2 w-32 font-mono text-[10px] whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {file.eventgroup ? (
                                <a href={`/new/eventing?eventgroup=${file.eventgroup.id}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-yellow-400 hover:underline hover:text-yellow-300">
                                    <Zap size={9}/> {file.eventgroup.name}
                                </a>
                            ) : <span className="text-gray-700">—</span>}
                        </td>
                    )}
                    <td className="p-2 w-24 text-gray-500 text-[10px] whitespace-nowrap">{displayTime(file.timestamp)}</td>
                    <td className="p-2 w-24" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {file.complete && !file.deleted && onPreviewMedia && (
                                <button onClick={() => onPreviewMedia(file)} className="p-1 hover:bg-white/10 rounded text-purple-400" title="Preview">
                                    <Eye size={11} />
                                </button>
                            )}
                            {file.complete && !file.deleted && (
                                <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                    className="p-1 hover:bg-white/10 rounded text-blue-400" title="Download">
                                    <Download size={11} />
                                </a>
                            )}
                            {onEditTags && (
                                <button onClick={() => onEditTags(file)} className="p-1 hover:bg-white/10 rounded text-yellow-400" title="Edit Tags">
                                    <Tag size={11} />
                                </button>
                            )}
                            <button onClick={() => onCopy(file.agent_file_id)} className="p-1 hover:bg-white/10 rounded text-gray-500" title="Copy UUID">
                                <Copy size={11} />
                            </button>
                            {!file.deleted && (
                                <button onClick={() => setConfirmDelete(true)} className="p-1 hover:bg-white/10 rounded text-red-400" title="Delete">
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    </td>
                </tr>
                {isExpanded && <ExpandedRowDetails file={file} colSpan={COL_COUNT} onCopy={onCopy} onHostFile={onHostFile} showUTC={showUTC} />}
            </React.Fragment>
        );
    };

    const GroupHeader = ({ groupKey, label, icon, groupFiles, labelClass }: {
        groupKey: string; label: string; icon: React.ReactNode;
        groupFiles: FileMeta[]; labelClass: string;
    }) => {
        const isOpen = expandedGroups.has(groupKey);
        const allSel = groupFiles.length > 0 && groupFiles.every(f => selectedFiles.has(f.id));
        const latest = groupFiles.reduce((t, f) => f.timestamp > t ? f.timestamp : t, '');
        return (
            <tr className="bg-black/40 hover:bg-white/5 cursor-pointer select-none" onClick={() => toggleGroup(groupKey)}>
                <td className="p-2 w-8" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={allSel} onChange={() => toggleGroupSelect(groupFiles)}
                        className="rounded bg-black/40 border-white/20" />
                </td>
                <td colSpan={COL_COUNT - 2} className="p-2">
                    <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown size={11} className="text-gray-500 shrink-0"/> : <ChevronRight size={11} className="text-gray-500 shrink-0"/>}
                        <span className={cn('shrink-0', labelClass)}>{icon}</span>
                        <span className={cn('font-mono text-[10px] uppercase tracking-widest', labelClass)}>{label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-400 ml-1">{groupFiles.length}</span>
                        {latest && <span className="ml-auto text-[9px] text-gray-600 font-mono">{formatTimeAgo(latest)}</span>}
                    </div>
                </td>
                <td className="p-2" />
            </tr>
        );
    };

    const thead = (
        <thead className="bg-black/60 sticky top-0 z-10 backdrop-blur-sm">
            <tr className="text-gray-500 font-mono text-[10px] border-b border-white/10">
                <th className="p-2 w-8">
                    <input type="checkbox"
                        checked={files.length > 0 && files.every(f => selectedFiles.has(f.id))}
                        onChange={e => files.forEach(f => onSelectFile(f.id, e.target.checked))}
                        className="rounded bg-black/40 border-white/20" />
                </th>
                <th className="p-2 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('filename_text')}>
                    {showDestination ? 'SOURCE' : 'FILENAME'} <SortIcon k="filename_text" />
                </th>
                {showDestination && <th className="p-2 text-left">DESTINATION</th>}
                <th className="p-2 text-left w-28">HOST</th>
                <th className="p-2 text-left w-20 cursor-pointer hover:text-white" onClick={() => toggleSort('size')}>
                    SIZE <SortIcon k="size" />
                </th>
                <th className="p-2 text-left w-32">COMMENT</th>
                <th className="p-2 text-left w-28">TAGS</th>
                {showWorkflow && <th className="p-2 text-left w-32">WORKFLOW</th>}
                <th className="p-2 text-left w-24 cursor-pointer hover:text-white" onClick={() => toggleSort('timestamp')}>
                    TIME <SortIcon k="timestamp" />
                </th>
                <th className="p-2 text-left w-24">ACTIONS</th>
            </tr>
        </thead>
    );

    if (files.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-gray-600">
                <FileText size={36} className="opacity-20" />
                <p className="font-mono text-sm">NO_FILES_FOUND</p>
            </div>
        );
    }

    if (groupByHost) {
        const staged = sortFn(files.filter(f => !f.host));
        const deployed = files.filter(f => !!f.host);
        const byHost = deployed.reduce<Record<string, FileMeta[]>>((acc, f) => { (acc[f.host] ??= []).push(f); return acc; }, {});
        const sortedHosts = Object.keys(byHost).sort();
        return (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                    {thead}
                    <tbody className="divide-y divide-white/5">
                        {staged.length > 0 && <>
                            <GroupHeader groupKey="__staged__" label="Staged — Server Only" icon={<Server size={11}/>} groupFiles={staged} labelClass="text-gray-400" />
                            {expandedGroups.has('__staged__') && staged.map(f => <FileRow key={f.id} file={f} />)}
                        </>}
                        {sortedHosts.map(host => {
                            const hf = sortFn(byHost[host]);
                            return (
                                <React.Fragment key={host}>
                                    <GroupHeader groupKey={host} label={host} icon={<Monitor size={11}/>} groupFiles={hf} labelClass="text-green-400" />
                                    {expandedGroups.has(host) && hf.map(f => <FileRow key={f.id} file={f} />)}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
                {thead}
                <tbody className="divide-y divide-white/5">
                    {sortFn(files).map(f => <FileRow key={f.id} file={f} />)}
                </tbody>
            </table>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────
// ScreenshotCard — single card in screenshot grid (has delete confirm)
// ──────────────────────────────────────────────────────────────────────────
const ScreenshotCard = ({
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
const ScreenshotsView = ({
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
const ScreenshotSlideshowModal = ({
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
const MythicFilesView = ({
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
const FileBrowserSearchTable = ({ nodes, count, onCopy }: {
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
const HostFileModal = ({ file, onClose }: { file: FileMeta; onClose: () => void }) => {
    const [selectedProfile, setSelectedProfile] = useState<{ id: number; name: string } | null>(null);
    const [hostUrl, setHostUrl] = useState('/');
    const [alertOnDownload, setAlertOnDownload] = useState(false);
    const [isHosting, setIsHosting] = useState(false);

    const { data: profileData, loading: profilesLoading } = useQuery(GET_C2_PROFILES, { fetchPolicy: 'network-only' });
    const c2Profiles: { id: number; name: string }[] = profileData?.c2profile || [];

    const [hostFileMutation, { loading: hostLoading }] = useMutation(HOST_FILE_MUTATION, {
        onCompleted: (d: any) => {
            if (d.c2HostFile?.status === 'success') {
                if (isHosting) {
                    snackActions.success(`File removed from hosting`);
                    setIsHosting(false);
                } else {
                    snackActions.success(`File hosted at ${hostUrl}`);
                    setIsHosting(true);
                }
            } else {
                snackActions.error(d.c2HostFile?.error || 'Operation failed');
            }
        },
        onError: (e) => snackActions.error(e.message),
    });

    const handleSubmit = () => {
        if (!selectedProfile) { snackActions.warning('Select a C2 profile first'); return; }
        hostFileMutation({
            variables: {
                c2_id: selectedProfile.id,
                file_uuid: file.agent_file_id,
                host_url: hostUrl,
                alert_on_download: alertOnDownload,
                remove: isHosting,
            },
        });
    };

    useEffect(() => {
        if (c2Profiles.length > 0 && !selectedProfile) setSelectedProfile(c2Profiles[0]);
    }, [c2Profiles.length]);

    const filename = b64DecodeUnicode(file.filename_text) || 'unnamed';

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                className="relative bg-[#0b0f17] border border-white/15 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Globe size={15} className="text-cyan-400" />
                        <h3 className="text-white font-semibold text-sm">Host File via C2</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors">
                        <X size={14} />
                    </button>
                </div>

                {/* File info */}
                <div className="bg-white/5 border border-white/10 rounded p-2.5 text-[10px]">
                    <p className="text-gray-400 font-mono break-all">{filename}</p>
                    <p className="text-gray-600 font-mono mt-0.5">{file.agent_file_id}</p>
                </div>

                {/* C2 Profile select */}
                <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">C2 Profile</label>
                    {profilesLoading ? (
                        <p className="text-gray-600 text-xs font-mono animate-pulse">Loading profiles...</p>
                    ) : c2Profiles.length === 0 ? (
                        <p className="text-red-400 text-xs font-mono">No running C2 profiles available</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {c2Profiles.map(p => (
                                <button key={p.id} onClick={() => setSelectedProfile(p)}
                                    className={cn(
                                        'px-2.5 py-1 rounded text-[11px] font-mono border transition-colors',
                                        selectedProfile?.id === p.id
                                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                            : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                                    )}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Host URL */}
                <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Host URL Path</label>
                    <input
                        type="text"
                        value={hostUrl}
                        onChange={e => setHostUrl(e.target.value)}
                        placeholder="/payload.exe"
                        className="w-full bg-black/40 border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-cyan-500/50"
                    />
                </div>

                {/* Alert on download */}
                <div className="flex items-center gap-2.5">
                    <button onClick={() => setAlertOnDownload(a => !a)}
                        className={cn(
                            'w-8 h-4 rounded-full transition-colors relative flex items-center',
                            alertOnDownload ? 'bg-cyan-500' : 'bg-white/10'
                        )}>
                        <span className={cn(
                            'w-3 h-3 rounded-full bg-white shadow transition-transform absolute',
                            alertOnDownload ? 'translate-x-4' : 'translate-x-0.5'
                        )} />
                    </button>
                    <span className="text-xs text-gray-400">Alert on download</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2.5 pt-1">
                    {isHosting && (
                        <button onClick={handleSubmit} disabled={hostLoading}
                            className="flex-1 py-2 bg-red-500/15 text-red-400 border border-red-500/30 rounded text-xs font-mono hover:bg-red-500/25 transition-colors disabled:opacity-50">
                            {hostLoading ? 'WORKING...' : 'STOP HOSTING'}
                        </button>
                    )}
                    <button onClick={handleSubmit} disabled={hostLoading || !selectedProfile || c2Profiles.length === 0}
                        className={cn(
                            'flex-1 py-2 rounded text-xs font-mono transition-colors disabled:opacity-50',
                            isHosting
                                ? 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                        )}>
                        {hostLoading ? 'WORKING...' : isHosting ? 'RE-HOST' : 'HOST FILE'}
                    </button>
                    <button onClick={onClose}
                        className="px-4 py-2 bg-white/5 text-gray-400 border border-white/10 rounded text-xs font-mono hover:bg-white/10 transition-colors">
                        CANCEL
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ── ViewEditTagsModal ─────────────────────────
interface TagRecord { id: number; source: string; url: string; data: any; tagtype: { id: number; name: string; color: string; description: string } }
interface TagTypeRecord { id: number; name: string; color: string; description: string }

const ViewEditTagsModal = ({ file, onClose }: { file: FileMeta; onClose: () => void }) => {
    const [tags, setTags] = useState<TagRecord[]>([]);
    const [tagtypes, setTagtypes] = useState<TagTypeRecord[]>([]);
    const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
    const [editTag, setEditTag] = useState<TagRecord | null>(null);
    const [formTagTypeId, setFormTagTypeId] = useState<number>(0);
    const [formSource, setFormSource] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formData, setFormData] = useState('{}');
    const [formDataError, setFormDataError] = useState('');

    const { refetch: refetchTags } = useQuery(GET_FILE_TAGS, {
        variables: { filemeta_id: file.id },
        onCompleted: (d: any) => setTags(d.tag || []),
        fetchPolicy: 'network-only',
    });

    useQuery(GET_TAGTYPES, {
        onCompleted: (d: any) => {
            setTagtypes(d.tagtype || []);
            if (d.tagtype?.length > 0) setFormTagTypeId(d.tagtype[0].id);
        },
        fetchPolicy: 'network-only',
    });

    const [createTag] = useMutation(CREATE_TAG_MUTATION, {
        onCompleted: (d: any) => {
            if (d.createTag?.status === 'success') { snackActions.success('Tag created'); refetchTags(); setMode('list'); }
            else snackActions.error(d.createTag?.error || 'Failed to create tag');
        },
    });
    const [updateTag] = useMutation(UPDATE_TAG_MUTATION, {
        onCompleted: () => { snackActions.success('Tag updated'); refetchTags(); setMode('list'); },
    });
    const [deleteTag] = useMutation(DELETE_TAG_MUTATION, {
        onCompleted: () => { snackActions.success('Tag deleted'); refetchTags(); },
    });

    const openCreate = () => {
        setEditTag(null);
        setFormSource(''); setFormUrl(''); setFormData('{}'); setFormDataError('');
        setMode('create');
    };
    const openEdit = (tag: TagRecord) => {
        setEditTag(tag);
        setFormSource(tag.source || '');
        setFormUrl(tag.url || '');
        try { setFormData(typeof tag.data === 'string' ? tag.data : JSON.stringify(tag.data, null, 2)); }
        catch { setFormData('{}'); }
        setFormDataError('');
        setMode('edit');
    };
    const handleSubmit = () => {
        let parsedData: any;
        try { parsedData = JSON.parse(formData); setFormDataError(''); }
        catch { setFormDataError('Invalid JSON format'); return; }
        if (mode === 'create') {
            createTag({ variables: { filemeta_id: file.id, tagtype_id: formTagTypeId, source: formSource, url: formUrl, data: parsedData } });
        } else if (mode === 'edit' && editTag) {
            updateTag({ variables: { tag_id: editTag.id, source: formSource, url: formUrl, data: parsedData } });
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-white/20 rounded-lg max-w-lg w-full overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                    <Tag size={16} className="text-yellow-400" />
                    <span className="font-mono text-sm text-white truncate flex-1">Tags — {b64DecodeUnicode(file.filename_text)}</span>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><XCircle size={18} className="text-gray-400"/></button>
                </div>
                {/* Content */}
                <div className="p-4 max-h-[70vh] overflow-auto space-y-3">
                    {mode === 'list' ? (
                        <>
                            {tags.length === 0 ? (
                                <p className="text-gray-500 text-xs font-mono text-center py-4">NO_TAGS</p>
                            ) : (
                                <div className="space-y-2">
                                    {tags.map(tag => (
                                        <div key={tag.id} className="flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/10 rounded">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-mono shrink-0"
                                                style={{ background: (tag.tagtype.color || '#666') + '30', color: tag.tagtype.color || '#aaa', border: `1px solid ${(tag.tagtype.color || '#666')}60` }}>
                                                {tag.tagtype.name}
                                            </span>
                                            {tag.source && <span className="text-gray-400 text-[10px] truncate flex-1">{tag.source}</span>}
                                            {!tag.source && <span className="flex-1" />}
                                            {tag.url && (
                                                <a href={tag.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 shrink-0" onClick={e => e.stopPropagation()}>
                                                    <ExternalLink size={10}/>
                                                </a>
                                            )}
                                            <button onClick={() => openEdit(tag)} className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-white shrink-0"><Edit2 size={11}/></button>
                                            <button onClick={() => deleteTag({ variables: { tag_id: tag.id } })} className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={11}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={openCreate}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-white/20 rounded text-[11px] text-gray-500 hover:text-white hover:border-white/40 transition-colors font-mono">
                                + Add Tag
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="text-[11px] text-gray-400 font-mono mb-1">{mode === 'create' ? 'New Tag' : 'Edit Tag'}</div>
                            {mode === 'create' && (
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500">Tag Type</label>
                                    <select value={formTagTypeId} onChange={e => setFormTagTypeId(Number(e.target.value))}
                                        className="w-full bg-black/60 border border-white/20 rounded px-2 py-1.5 text-[11px] text-white font-mono outline-none">
                                        {tagtypes.map(tt => (
                                            <option key={tt.id} value={tt.id}>{tt.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {mode === 'edit' && editTag && (
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono"
                                        style={{ background: (editTag.tagtype.color || '#666') + '30', color: editTag.tagtype.color || '#aaa', border: `1px solid ${(editTag.tagtype.color || '#666')}60` }}>
                                        {editTag.tagtype.name}
                                    </span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">Source</label>
                                <input value={formSource} onChange={e => setFormSource(e.target.value)}
                                    className="w-full bg-black/60 border border-white/20 rounded px-2 py-1.5 text-[11px] text-white font-mono outline-none focus:border-signal/50"
                                    placeholder="Source..." />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">URL</label>
                                <input value={formUrl} onChange={e => setFormUrl(e.target.value)}
                                    className="w-full bg-black/60 border border-white/20 rounded px-2 py-1.5 text-[11px] text-white font-mono outline-none focus:border-signal/50"
                                    placeholder="https://..." />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">JSON Data</label>
                                <textarea value={formData} onChange={e => setFormData(e.target.value)} rows={4}
                                    className="w-full bg-black/60 border border-white/20 rounded px-2 py-1.5 text-[11px] text-gray-300 font-mono outline-none resize-y focus:border-signal/50"
                                    placeholder="{}" />
                                {formDataError && <p className="text-red-400 text-[10px]">{formDataError}</p>}
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => setMode('list')} className="flex-1 px-3 py-2 border border-white/20 rounded text-[11px] text-gray-400 hover:text-white hover:border-white/40 transition-colors">Cancel</button>
                                <button onClick={handleSubmit} className="flex-1 px-3 py-2 bg-signal/20 border border-signal/40 rounded text-[11px] text-signal hover:bg-signal/30 transition-colors">
                                    {mode === 'create' ? 'Create' : 'Update'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ── MediaPreviewModal ─────────────────────────
const _imgExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
const _pdfExts = ['pdf'];
const _textExts = ['txt', 'log', 'ps1', 'json', 'xml', 'yaml', 'yml', 'cfg', 'config', 'ini', 'sh', 'bash', 'zsh', 'py', 'go', 'js', 'ts', 'cs', 'c', 'cpp', 'h', 'md', 'csv', 'toml', 'html', 'css'];
const getMediaType = (filename: string): 'image' | 'pdf' | 'text' | 'other' => {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (_imgExts.includes(ext)) return 'image';
    if (_pdfExts.includes(ext)) return 'pdf';
    if (_textExts.includes(ext)) return 'text';
    return 'other';
};

const MediaPreviewModal = ({ file, onClose }: { file: FileMeta; onClose: () => void }) => {
    const filename = b64DecodeUnicode(file.filename_text) || 'unnamed';
    const mediaType = getMediaType(filename);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);

    useEffect(() => {
        if (mediaType === 'text' && file.complete) {
            setTextLoading(true);
            fetch(`/direct/view/${file.agent_file_id}`)
                .then(r => r.text())
                .then(t => { setTextContent(t); setTextLoading(false); })
                .catch(() => { setTextContent('(Failed to load content)'); setTextLoading(false); });
        }
    }, [file.agent_file_id, mediaType, file.complete]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
            onClick={onClose}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-void border border-white/20 rounded-lg flex flex-col"
                style={{ width: '90vw', maxWidth: 1200, height: '90vh' }}
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
                    <Eye size={16} className="text-signal" />
                    <span className="font-mono text-sm text-white truncate flex-1">{filename}</span>
                    <span className="text-[10px] text-gray-500 font-mono uppercase px-2 py-0.5 bg-white/5 rounded">{mediaType}</span>
                    <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                        className="p-1 hover:bg-white/10 rounded text-blue-400" title="Download">
                        <Download size={16}/>
                    </a>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><XCircle size={18} className="text-gray-400"/></button>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-auto bg-black/40 min-h-0">
                    {!file.complete ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                            <AlertTriangle size={32} className="opacity-40" />
                            <p className="font-mono text-sm">FILE_INCOMPLETE — {file.chunks_received}/{file.total_chunks} chunks</p>
                        </div>
                    ) : mediaType === 'image' ? (
                        <div className="flex items-center justify-center h-full p-4">
                            <img src={`/direct/download/${file.agent_file_id}`} alt={filename}
                                className="max-w-full max-h-full object-contain" />
                        </div>
                    ) : mediaType === 'pdf' ? (
                        <embed src={`/direct/download/${file.agent_file_id}`}
                            type="application/pdf" className="w-full h-full" style={{ minHeight: '70vh' }} />
                    ) : mediaType === 'text' ? (
                        textLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <span className="text-gray-500 font-mono animate-pulse">LOADING...</span>
                            </div>
                        ) : (
                            <pre className="p-4 text-[11px] text-gray-300 font-mono whitespace-pre-wrap overflow-auto">{textContent}</pre>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                            <FileText size={48} className="opacity-20" />
                            <p className="font-mono text-sm">UNSUPPORTED_FORMAT</p>
                            <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-sm hover:bg-blue-500/30 transition-colors">
                                <Download size={14}/> Download File
                            </a>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// ── FilePreviewModal ──────────────────────────
const FilePreviewModal = ({
    file, onClose, onCopy,
}: { file: FileMeta; onClose: () => void; onCopy: (s: string) => void; }) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
        onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="bg-void border border-white/20 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-auto"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-void z-10">
                <div className="flex items-center gap-3">
                    <FileText size={20} className="text-signal" />
                    <div>
                        <h3 className="font-mono text-sm text-white">{b64DecodeUnicode(file.filename_text) || 'Unnamed'}</h3>
                        <p className="text-[10px] text-gray-500">{file.agent_file_id}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                    <XCircle size={20} className="text-gray-400" />
                </button>
            </div>
            {/* Screenshot preview */}
            {file.is_screenshot && (
                <div className="p-4 bg-black/40">
                    <img src={`/direct/download/${file.agent_file_id}`} alt={b64DecodeUnicode(file.filename_text)}
                        className="max-w-full rounded border border-white/10" />
                </div>
            )}
            {/* Details grid */}
            <div className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'HOST', value: file.host || '—' },
                        { label: 'SIZE', value: formatBytes(file.size) },
                        { label: 'TIMESTAMP', value: file.timestamp ? new Date(file.timestamp).toLocaleString() : '—' },
                        { label: 'STATUS', value: file.complete ? 'Complete' : `${file.chunks_received}/${file.total_chunks} chunks`, cls: file.complete ? 'text-green-400' : 'text-yellow-400' },
                        { label: 'OPERATOR', value: file.operator?.username || '—' },
                        { label: 'COMMAND', value: file.task?.command?.cmd || '—' },
                    ].map(({ label, value, cls }) => (
                        <div key={label}>
                            <span className="text-gray-500 text-[10px] block">{label}</span>
                            <span className={cn('text-white font-mono', cls)}>{value}</span>
                        </div>
                    ))}
                </div>
                {/* Hashes */}
                {[{ label: 'MD5', v: file.md5 }, { label: 'SHA1', v: file.sha1 }, { label: 'UUID', v: file.agent_file_id }].map(({ label, v }) => v ? (
                    <div key={label}>
                        <span className="text-gray-500 text-[10px] block">{label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-mono text-[10px] break-all">{v}</span>
                            <button onClick={() => onCopy(v)} className="shrink-0 p-0.5 hover:bg-white/10 rounded"><Copy size={10} className="text-gray-500"/></button>
                        </div>
                    </div>
                ) : null)}
                {/* Remote path */}
                {file.full_remote_path_text && (
                    <div>
                        <span className="text-gray-500 text-[10px] block">REMOTE PATH</span>
                        <span className="text-white font-mono text-[10px] break-all">{b64DecodeUnicode(file.full_remote_path_text)}</span>
                    </div>
                )}
                {/* Comment */}
                {file.comment && (
                    <div>
                        <span className="text-gray-500 text-[10px] block">COMMENT</span>
                        <span className="text-gray-300">{file.comment}</span>
                    </div>
                )}
                {/* Tags */}
                {file.tags && file.tags.length > 0 && (
                    <div>
                        <span className="text-gray-500 text-[10px] block">TAGS</span>
                        <TagsDisplay tags={file.tags} />
                    </div>
                )}
                {/* Task links */}
                {file.task && (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-gray-500 text-[10px] block">CALLBACK</span>
                            <a href={`/new/callbacks/${file.task.callback?.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">C-{file.task.callback?.display_id}</a>
                        </div>
                        <div>
                            <span className="text-gray-500 text-[10px] block">TASK</span>
                            <a href={`/new/task/${file.task.display_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">T-{file.task.display_id}</a>
                        </div>
                    </div>
                )}
                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-white/10">
                    {file.complete && (
                        <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors">
                            <Download size={14} /> Download
                        </a>
                    )}
                    <button onClick={() => onCopy(file.agent_file_id)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded hover:bg-white/20 transition-colors">
                        <Copy size={14} /> Copy UUID
                    </button>
                    <a href={`/direct/download/${file.agent_file_id}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded hover:bg-white/20 transition-colors">
                        <ExternalLink size={14} /> Open in New Tab
                    </a>
                </div>
            </div>
        </motion.div>
    </motion.div>
);
