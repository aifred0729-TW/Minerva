import React, { useState, useEffect } from 'react';
import { useMutation } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import {
    Download,
    Eye,
    Copy,
    X,
    Tag,
    Trash2,
    Edit2,
    Globe,
    ExternalLink,
    FileText,
    XCircle,
    AlertTriangle,
}from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    GET_FILE_TAGTYPES, GET_FILE_TAGS, CREATE_TAG_MUTATION,
    UPDATE_TAG_MUTATION, DELETE_TAG_MUTATION,
    GET_C2_PROFILES_FOR_HOSTING, HOST_FILE_MUTATION,
} from '../../lib/api/files';
import type { FileMeta } from '../../types/files';
import { directDownloadUrl } from '../../lib/urls';
import { formatBytes } from './utils';
import { TagsDisplay } from './FileTable';

export const HostFileModal = ({ file, onClose }: { file: FileMeta; onClose: () => void }) => {
    const [selectedProfile, setSelectedProfile] = useState<{ id: number; name: string } | null>(null);
    const [hostUrl, setHostUrl] = useState('/');
    const [alertOnDownload, setAlertOnDownload] = useState(false);
    const [isHosting, setIsHosting] = useState(false);

    const { data: profileData, loading: profilesLoading } = useQuery<any>(GET_C2_PROFILES_FOR_HOSTING, { fetchPolicy: 'network-only' });
    const c2Profiles: { id: number; name: string }[] = profileData?.c2profile || [];

    const [hostFileMutation, { loading: hostLoading }] = useMutation<any>(HOST_FILE_MUTATION, {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

export const ViewEditTagsModal = ({ file, onClose }: { file: FileMeta; onClose: () => void }) => {
    const [tags, setTags] = useState<TagRecord[]>([]);
    const [tagtypes, setTagtypes] = useState<TagTypeRecord[]>([]);
    const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
    const [editTag, setEditTag] = useState<TagRecord | null>(null);
    const [formTagTypeId, setFormTagTypeId] = useState<number>(0);
    const [formSource, setFormSource] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formData, setFormData] = useState('{}');
    const [formDataError, setFormDataError] = useState('');

    const { refetch: refetchTags } = useQuery<any>(GET_FILE_TAGS, {
        variables: { filemeta_id: file.id },
        onCompleted: (d: any) => setTags(d.tag || []),
        fetchPolicy: 'network-only',
    });

    useQuery<any>(GET_FILE_TAGTYPES, {
        onCompleted: (d: any) => {
            setTagtypes(d.tagtype || []);
            if (d.tagtype?.length > 0) setFormTagTypeId(d.tagtype[0].id);
        },
        fetchPolicy: 'network-only',
    });

    const [createTag] = useMutation<any>(CREATE_TAG_MUTATION, {
        onCompleted: (d: any) => {
            if (d.createTag?.status === 'success') { snackActions.success('Tag created'); refetchTags(); setMode('list'); }
            else snackActions.error(d.createTag?.error || 'Failed to create tag');
        },
    });
    const [updateTag] = useMutation<any>(UPDATE_TAG_MUTATION, {
        onCompleted: () => { snackActions.success('Tag updated'); refetchTags(); setMode('list'); },
    });
    const [deleteTag] = useMutation<any>(DELETE_TAG_MUTATION, {
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

export const MediaPreviewModal = ({ file, onClose }: { file: FileMeta; onClose: () => void }) => {
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
                    <a href={directDownloadUrl(file.agent_file_id)} target="_blank" rel="noopener noreferrer"
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
                            <img src={directDownloadUrl(file.agent_file_id)} alt={filename}
                                className="max-w-full max-h-full object-contain" />
                        </div>
                    ) : mediaType === 'pdf' ? (
                        <embed src={directDownloadUrl(file.agent_file_id)}
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
                            <a href={directDownloadUrl(file.agent_file_id)} target="_blank" rel="noopener noreferrer"
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
export const FilePreviewModal = ({
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
                    <img src={directDownloadUrl(file.agent_file_id)} alt={b64DecodeUnicode(file.filename_text)}
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
                        <a href={directDownloadUrl(file.agent_file_id)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors">
                            <Download size={14} /> Download
                        </a>
                    )}
                    <button onClick={() => onCopy(file.agent_file_id)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded hover:bg-white/20 transition-colors">
                        <Copy size={14} /> Copy UUID
                    </button>
                    <a href={directDownloadUrl(file.agent_file_id)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20 rounded hover:bg-white/20 transition-colors">
                        <ExternalLink size={14} /> Open in New Tab
                    </a>
                </div>
            </div>
        </motion.div>
    </motion.div>
);
