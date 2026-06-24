import React, { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useQueryCompat, useLazyQueryCompat } from '../../lib/useQueryCompat';
import { Folder, Upload, Download, Edit, Trash2, FileText, Save } from 'lucide-react';
import { CyberModal } from '../../components/CyberModal';
import { snackActions } from '../../lib/snackbar';
import { cn } from '../../lib/utils';
import {
    LIST_CONTAINER_FILES,
    REMOVE_CONTAINER_FILE,
    DOWNLOAD_CONTAINER_FILE,
    WRITE_CONTAINER_FILE,
} from '../../lib/api';

const downloadBlob = (data: string, filename: string) => {
    const bytes = atob(data);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

function FileEditor({ containerName, filename, onClose }: { containerName: string; filename: string; onClose: () => void }) {
    const [content, setContent] = useState<string>('');
    const [loaded, setLoaded] = useState(false);
    const [getFile, { loading: loadingFile }] = useLazyQueryCompat<any>(DOWNLOAD_CONTAINER_FILE, {
        fetchPolicy: 'network-only',
    });
    const [writeFile, { loading: writing }] = useMutation<any>(WRITE_CONTAINER_FILE);

    React.useEffect(() => {
        let cancelled = false;
        getFile({ variables: { container_name: containerName, filename } }).then((res: any) => {
            if (cancelled) return;
            const result = res?.data?.containerDownloadFile;
            if (result?.status === 'success') {
                try {
                    const decoded = atob(result.data);
                    setContent(decoded);
                } catch {
                    setContent(result.data || '');
                }
                setLoaded(true);
            } else {
                snackActions.error(result?.error || 'Failed to load file');
            }
        });
        return () => { cancelled = true; };
    }, [containerName, filename, getFile]);

    const handleSave = async () => {
        try {
            const encoded = btoa(unescape(encodeURIComponent(content)));
            const res: any = await writeFile({ variables: { container_name: containerName, file_path: filename, data: encoded } });
            const result = res?.data?.containerWriteFile;
            if (result?.status === 'success') {
                snackActions.success('File saved');
                onClose();
            } else {
                snackActions.error(result?.error || 'Failed to save');
            }
        } catch (e: any) {
            snackActions.error(e.message || 'Failed to save');
        }
    };

    return (
        <CyberModal title={`EDIT · ${filename}`} icon={<FileText />} onClose={onClose} maxWidth="max-w-5xl">
            {loadingFile && !loaded ? (
                <div className="text-center text-gray-400 font-mono py-8 animate-pulse">LOADING…</div>
            ) : (
                <>
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        spellCheck={false}
                        className="w-full h-[60vh] bg-black/60 border border-white/10 px-3 py-2 font-mono text-xs text-gray-200 focus:border-signal/50 focus:outline-none resize-none cyber-scrollbar"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest text-gray-300 border border-white/15 hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={writing}
                            className={cn(
                                "px-4 py-1.5 text-xs font-mono uppercase tracking-widest border transition-colors flex items-center gap-1.5",
                                writing
                                    ? "border-white/10 text-gray-500 cursor-not-allowed"
                                    : "border-signal/40 text-signal hover:bg-signal/10"
                            )}
                        >
                            <Save size={12} /> Save
                        </button>
                    </div>
                </>
            )}
        </CyberModal>
    );
}

export function ContainerFilesDialog({ containerName, onClose }: { containerName: string; onClose: () => void }) {
    const { data, loading, error, refetch } = useQueryCompat<any>(LIST_CONTAINER_FILES, {
        variables: { container_name: containerName },
        fetchPolicy: 'network-only',
    });
    const [removeFile] = useMutation<any>(REMOVE_CONTAINER_FILE);
    const [writeFile] = useMutation<any>(WRITE_CONTAINER_FILE);
    const [getFile] = useLazyQueryCompat<any>(DOWNLOAD_CONTAINER_FILE, { fetchPolicy: 'network-only' });
    const [editing, setEditing] = useState<string | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const result = data?.containerListFiles;
    const files: string[] = result?.files ?? [];

    const handleUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = evt.target.files;
        if (!fileList || fileList.length === 0) return;
        for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i];
            // Read as binary string then base64-encode (matches Mythic reference impl)
            const reader = new FileReader();
            await new Promise<void>((resolve) => {
                reader.onload = async (e) => {
                    const contents = e.target?.result as string;
                    try {
                        const res: any = await writeFile({
                            variables: { container_name: containerName, file_path: f.name, data: btoa(contents) },
                        });
                        const r = res?.data?.containerWriteFile;
                        if (r?.status === 'success') {
                            snackActions.success(`Uploaded ${f.name}`);
                        } else {
                            snackActions.error(r?.error || `Failed to upload ${f.name}`);
                        }
                    } catch (err: any) {
                        snackActions.error(err.message || `Failed to upload ${f.name}`);
                    }
                    resolve();
                };
                reader.readAsBinaryString(f);
            });
        }
        evt.target.value = '';
        refetch();
    };

    const handleDownload = async (filename: string) => {
        try {
            const res: any = await getFile({ variables: { container_name: containerName, filename } });
            const r = res?.data?.containerDownloadFile;
            if (r?.status === 'success') {
                downloadBlob(r.data, filename);
            } else {
                snackActions.error(r?.error || 'Failed to download');
            }
        } catch (e: any) {
            snackActions.error(e.message || 'Failed to download');
        }
    };

    const handleRemove = async (filename: string) => {
        try {
            const res: any = await removeFile({ variables: { container_name: containerName, filename } });
            const r = res?.data?.containerRemoveFile;
            if (r?.status === 'success') {
                snackActions.success(`Removed ${filename}`);
                refetch();
            } else {
                snackActions.error(r?.error || 'Failed to remove');
            }
        } catch (e: any) {
            snackActions.error(e.message || 'Failed to remove');
        }
        setConfirmRemove(null);
    };

    return (
        <>
            <CyberModal title={`${containerName} · FILES`} icon={<Folder />} onClose={onClose} maxWidth="max-w-3xl">
                <div className="flex justify-end mb-3">
                    <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-signal/40 text-signal hover:bg-signal/10 transition-colors"
                    >
                        <Upload size={12} /> Upload File
                    </button>
                </div>
                {loading && <div className="text-center text-gray-400 font-mono py-8 animate-pulse">LOADING…</div>}
                {error && <div className="text-red-400 font-mono text-sm py-4">Error: {error.message}</div>}
                {!loading && result?.status !== 'success' && result?.error && (
                    <div className="text-red-400 font-mono text-sm py-4">{result.error}</div>
                )}
                {!loading && files.length === 0 && result?.status === 'success' && (
                    <div className="text-center text-gray-500 font-mono py-8">No files in container</div>
                )}
                {files.length > 0 && (
                    <div className="border border-white/10">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-black/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-gray-500">
                            <div className="col-span-9">File</div>
                            <div className="col-span-3 text-right">Actions</div>
                        </div>
                        <div className="divide-y divide-white/5 max-h-[55vh] overflow-y-auto cyber-scrollbar">
                            {files.map(f => (
                                <div key={f} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-xs hover:bg-white/5">
                                    <div className="col-span-9 font-mono text-gray-300 break-all">{f}</div>
                                    <div className="col-span-3 flex items-center justify-end gap-1">
                                        <button
                                            onClick={() => handleDownload(f)}
                                            title="Download"
                                            className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-green-400 hover:bg-green-400/10 transition-colors"
                                        >
                                            <Download size={12} />
                                        </button>
                                        <button
                                            onClick={() => setEditing(f)}
                                            title="Edit"
                                            className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                                        >
                                            <Edit size={12} />
                                        </button>
                                        <button
                                            onClick={() => setConfirmRemove(f)}
                                            title="Delete"
                                            className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CyberModal>
            {editing && (
                <FileEditor
                    containerName={containerName}
                    filename={editing}
                    onClose={() => { setEditing(null); refetch(); }}
                />
            )}
            {confirmRemove && (
                <CyberModal title="REMOVE FILE" icon={<Trash2 />} onClose={() => setConfirmRemove(null)} maxWidth="max-w-md">
                    <p className="text-sm text-gray-300 mb-1">Remove <code className="text-red-400 font-mono">{confirmRemove}</code> from <code className="text-cyan-300 font-mono">{containerName}</code>?</p>
                    <p className="text-xs text-gray-500 mb-4">This cannot be undone.</p>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setConfirmRemove(null)}
                            className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest text-gray-300 border border-white/15 hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleRemove(confirmRemove)}
                            className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                </CyberModal>
            )}
        </>
    );
}
