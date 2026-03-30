import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react'
import {
    ChevronRight,
    Key,
    Eye,
    Search,
    Syringe,
    Skull,
    Camera,
    X,
    List,
    Layers,
    ClipboardCopy as Clipboard,
    FileText,
    Minimize2,
    Maximize2,
    ChevronLeft,
    Database,
    Info,
}from 'lucide-react';
import { OutputPanel, OutputCallbackContext, ACCENT, AMBER, PURPLE, ARCH_COLOR } from './core';
import type { MythicScreenshot, MythicDownload } from '../../types/output';
import { TaskFromUIButton } from '../TaskFromUIButton';
import { DatabasePanel } from './graph';

interface ProcessContextMenu {
    x: number;
    y: number;
    proc: any;
}

export function ProcessPanel({ procs }: { procs: any[] }) {
    const callbackId = useContext(OutputCallbackContext);
    const [ctxMenu, setCtxMenu] = useState<ProcessContextMenu | null>(null);
    const [filter, setFilter]   = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ctxMenu) return;
        const h = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [ctxMenu]);

    const handleRowContext = useCallback((e: React.MouseEvent, proc: any) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, proc });
    }, []);

    const [activeProcessAction, setActiveProcessAction] = useState<{ uifeature: string; proc: any } | null>(null);
    const doProcessAction = useCallback((uifeature: string, proc: any) => {
        if (!callbackId) return;
        setCtxMenu(null);
        setActiveProcessAction({ uifeature, proc });
    }, [callbackId]);

    const filtered = useMemo(() => {
        if (!filter.trim()) return procs;
        const f = filter.toLowerCase();
        return procs.filter((p: any) => {
            const name = (p.name ?? p.process_name ?? '').toLowerCase();
            const pid  = String(p.process_id ?? p.pid ?? '');
            const user = (p.user ?? '').toLowerCase();
            const path = (p.bin_path ?? p.path ?? '').toLowerCase();
            return name.includes(f) || pid.includes(f) || user.includes(f) || path.includes(f);
        });
    }, [procs, filter]);

    return (
        <>
        <OutputPanel icon={<Layers size={11}/>} label="PROCESS LIST" count={procs.length}
            toolbar={
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2" style={{ color: '#555' }}/>
                        <input
                            type="text"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder="Filter..."
                            className="h-5 pl-5 pr-2 bg-black/50 border border-white/10 text-[10px] font-mono text-white placeholder-gray-600 focus:border-[#00ffd133] focus:outline-none w-28"
                        />
                    </div>
                    {filter && (
                        <span className="font-mono text-[9px]" style={{ color: ACCENT }}>{filtered.length}/{procs.length}</span>
                    )}
                </div>
            }>
            <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-full font-mono">
                    <thead>
                        <tr style={{ background: '#00ffd10c' }}>
                            {['PID','PPID','NAME','ARCH','USER','PATH'].map(h => (
                                <th key={h}
                                    className="px-2 py-1.5 border-b text-left text-[10px] tracking-wider uppercase whitespace-nowrap"
                                    style={{ borderColor: '#00ffd122', color: '#00ffd1bb' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p: any, ri: number) => {
                            const arch = p.architecture ?? p.arch ?? '';
                            return (
                                <tr key={ri}
                                    style={{ background: ri % 2 === 0 ? 'transparent' : '#ffffff03' }}
                                    className="transition-colors hover:bg-[#00ffd10a] cursor-context-menu"
                                    onContextMenu={(e) => handleRowContext(e, p)}>
                                    <td className="px-2 py-1 border-b tabular-nums text-right"
                                        style={{ borderColor: '#ffffff07', color: '#a8d8ff' }}>
                                        {p.process_id ?? p.pid ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b tabular-nums text-right"
                                        style={{ borderColor: '#ffffff07', color: '#667' }}>
                                        {p.parent_process_id ?? p.ppid ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b font-semibold max-w-[180px] truncate"
                                        style={{ borderColor: '#ffffff07', color: '#e0e0e0' }}>
                                        {p.name ?? p.process_name ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b" style={{ borderColor: '#ffffff07' }}>
                                        {arch && (
                                            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold"
                                                style={{
                                                    background: `${ARCH_COLOR[arch] ?? '#555'}22`,
                                                    color: ARCH_COLOR[arch] ?? '#aaa',
                                                }}>
                                                {arch}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-1 border-b max-w-[120px] truncate"
                                        style={{ borderColor: '#ffffff07', color: '#aaa' }}>
                                        {p.user ?? ''}
                                    </td>
                                    <td className="px-2 py-1 border-b max-w-[200px] truncate"
                                        style={{ borderColor: '#ffffff07', color: '#666', fontSize: '10px' }}>
                                        {p.bin_path ?? p.path ?? ''}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Process context menu */}
            {ctxMenu && (
                <div ref={menuRef}
                    className="fixed z-[9999] border rounded shadow-xl"
                    style={{
                        left: ctxMenu.x, top: ctxMenu.y,
                        background: '#111', borderColor: '#333',
                        minWidth: 200,
                    }}>
                    <div className="px-3 py-1.5 border-b text-[10px] font-mono font-bold"
                        style={{ borderColor: '#222', color: '#888' }}>
                        PID {ctxMenu.proc.process_id ?? ctxMenu.proc.pid} — {ctxMenu.proc.name ?? ctxMenu.proc.process_name ?? 'process'}
                    </div>
                    <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                        style={{ color: '#fbbf24' }}
                        onClick={() => { navigator.clipboard.writeText(JSON.stringify(ctxMenu.proc, null, 2)); setCtxMenu(null); }}>
                        <Clipboard size={12}/> Copy Process Info
                    </button>
                    {callbackId && (
                        <>
                            <div className="border-t" style={{ borderColor: '#222' }}/>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#fbbf24' }}
                                onClick={() => doProcessAction('process_browser:inject', ctxMenu.proc)}>
                                <Syringe size={12}/> Inject
                            </button>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#fbbf24' }}
                                onClick={() => doProcessAction('process_browser:list_tokens', ctxMenu.proc)}>
                                <List size={12}/> List Tokens
                            </button>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#ef4444' }}
                                onClick={() => doProcessAction('process_browser:steal_token', ctxMenu.proc)}>
                                <Key size={12}/> Steal Token
                            </button>
                            <button className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
                                style={{ color: '#ef4444' }}
                                onClick={() => { if (window.confirm(`Kill PID ${ctxMenu.proc.process_id ?? ctxMenu.proc.pid}?`)) doProcessAction('process_browser:kill', ctxMenu.proc); }}>
                                <Skull size={12}/> Kill Process
                            </button>
                        </>
                    )}
                </div>
            )}
        </OutputPanel>
        {/* TaskFromUIButton for process actions */}
        {activeProcessAction && callbackId && (
            <TaskFromUIButton
                callback_id={callbackId}
                ui_feature={activeProcessAction.uifeature}
                parameters={JSON.stringify({ process_id: activeProcessAction.proc.process_id ?? activeProcessAction.proc.pid, architecture: activeProcessAction.proc.architecture ?? activeProcessAction.proc.arch ?? '' })}
                onTasked={() => setActiveProcessAction(null)}
                dontShowSuccessDialog={true}
            />
        )}
    </>
    );
}

// ─── FilesPanel ───────────────────────────────────────────────────────────────

export function FilesPanel({ files }: { files: any[] }) {
    return (
        <OutputPanel icon={<FileText size={11}/>} label="FILE LISTING" count={files.length}>
            <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-full font-mono">
                    <thead>
                        <tr style={{ background: '#00ffd10c' }}>
                            {['NAME','SIZE','PERMISSIONS','OWNER','MODIFIED'].map(h => (
                                <th key={h}
                                    className="px-2 py-1.5 border-b text-left text-[10px] tracking-wider uppercase whitespace-nowrap"
                                    style={{ borderColor: '#00ffd122', color: '#00ffd1bb' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((f: any, ri: number) => {
                            const isDir = f.is_file === false || f.type === 'dir' || f.type === 'directory';
                            const sz    = f.size;
                            const sizeStr = sz !== undefined
                                ? sz > 1_048_576 ? `${(sz / 1_048_576).toFixed(1)}M`
                                : sz > 1024      ? `${(sz / 1024).toFixed(1)}K`
                                :                  `${sz}B`
                                : '';
                            return (
                                <tr key={ri}
                                    style={{ background: ri % 2 === 0 ? 'transparent' : '#ffffff03' }}
                                    className="transition-colors hover:bg-[#00ffd10a]">
                                    <td className="px-2 py-1.5 border-b font-semibold"
                                        style={{ borderColor: '#ffffff07', color: isDir ? ACCENT : '#d0d0d0' }}>
                                        <span style={{ marginRight: 5, opacity: 0.6 }}>{isDir ? '📁' : '📄'}</span>
                                        {(() => { const n = f.name ?? f.filename ?? ''; return typeof n === 'object' ? JSON.stringify(n) : String(n); })()}
                                    </td>
                                    <td className="px-2 py-1.5 border-b tabular-nums text-right"
                                        style={{ borderColor: '#ffffff07', color: '#a8d8ff' }}>{sizeStr}</td>
                                    <td className="px-2 py-1.5 border-b font-mono"
                                        style={{ borderColor: '#ffffff07', color: '#888', fontSize: '10px' }}>
                                        {(() => {
                                            const p = f.permissions ?? f.perms;
                                            if (p === null || p === undefined) return '';
                                            if (typeof p === 'object') {
                                                // Array of ACE objects (Windows)
                                                if (Array.isArray(p)) {
                                                    return p.map((ace: any, ai: number) => (
                                                        <span key={ai} title={JSON.stringify(ace)}
                                                            className="block truncate max-w-[120px]"
                                                            style={{ color: '#8ab', fontSize: '10px' }}>
                                                            {ace.account ?? ace.rights ?? JSON.stringify(ace)}
                                                        </span>
                                                    ));
                                                }
                                                // Single ACE / generic permissions object
                                                const acc = (p as any).account;
                                                return acc
                                                    ? <span title={JSON.stringify(p)} style={{ color: '#8ab' }}>{acc}</span>
                                                    : <span title={JSON.stringify(p)} style={{ color: '#555' }}>{JSON.stringify(p)}</span>;
                                            }
                                            return String(p);
                                        })()}
                                    </td>
                                    <td className="px-2 py-1.5 border-b"
                                        style={{ borderColor: '#ffffff07', color: '#777', fontSize: '10px' }}>
                                        {(() => {
                                            const o = f.owner ?? f.user;
                                            if (o === null || o === undefined) return '';
                                            return typeof o === 'object' ? JSON.stringify(o) : String(o);
                                        })()}
                                    </td>
                                    <td className="px-2 py-1.5 border-b"
                                        style={{ borderColor: '#ffffff07', color: '#555', fontSize: '10px' }}>
                                        {(() => {
                                            const m = f.modify_time ?? f.modified;
                                            if (m === null || m === undefined) return '';
                                            return typeof m === 'object' ? JSON.stringify(m) : String(m);
                                        })()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </OutputPanel>
    );
}

// ─── ScreenshotPanel ──────────────────────────────────────────────────────────

export function ScreenshotPanel({ screenshots }: { screenshots: MythicScreenshot[] }) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [viewMode, setViewMode]     = useState<'gallery' | 'single'>(screenshots.length > 3 ? 'single' : 'gallery');
    const [expandedImg, setExpandedImg] = useState<{ src: string; alt: string } | null>(null);
    const total = screenshots.length;

    useEffect(() => {
        if (!expandedImg) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedImg(null); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [expandedImg]);

    return (
        <OutputPanel
            icon={<Camera size={11}/>}
            label="SCREENSHOT"
            accent={PURPLE}
            count={total > 1 ? total : undefined}
            toolbar={total > 1 ? (
                <div className="flex items-center gap-1">
                    <button onClick={() => setViewMode(m => m === 'gallery' ? 'single' : 'gallery')}
                        className="p-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: '#888' }}
                        title={viewMode === 'gallery' ? 'Single view' : 'Gallery view'}>
                        {viewMode === 'gallery' ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
                    </button>
                    {viewMode === 'single' && (
                        <>
                            <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                                disabled={currentIdx === 0}
                                className="p-0.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
                                style={{ color: PURPLE }}>
                                <ChevronLeft size={14}/>
                            </button>
                            <span className="font-mono text-[10px] px-1" style={{ color: '#888' }}>
                                {currentIdx + 1}/{total}
                            </span>
                            <button onClick={() => setCurrentIdx(i => Math.min(total - 1, i + 1))}
                                disabled={currentIdx >= total - 1}
                                className="p-0.5 rounded transition-colors hover:bg-white/10 disabled:opacity-30"
                                style={{ color: PURPLE }}>
                                <ChevronRight size={14}/>
                            </button>
                        </>
                    )}
                </div>
            ) : undefined}>
            <div className="space-y-3">
                {(viewMode === 'single' ? [screenshots[currentIdx]] : screenshots)
                    .filter(Boolean)
                    .map((scr, i) => {
                        const idx = viewMode === 'single' ? currentIdx : i;
                        const src = `/api/v1.4/files/download/${scr.agent_file_id}`;
                        const alt = scr.plaintext || `Screenshot ${idx + 1}`;
                        return (
                            <div key={idx}>
                                {scr.plaintext && (
                                    <div className="font-mono text-[11px] mb-1.5 pb-1 border-b"
                                        style={{ color: '#998', borderColor: `${PURPLE}22` }}>
                                        {scr.plaintext}
                                    </div>
                                )}
                                <img
                                    src={src}
                                    alt={alt}
                                    className="rounded-sm border w-full object-contain cursor-zoom-in transition-opacity hover:opacity-90"
                                    style={{ borderColor: `${PURPLE}33`, maxHeight: 340 }}
                                    onClick={() => setExpandedImg({ src, alt })}
                                />
                            </div>
                        );
                    })}
            </div>

            {/* Fullscreen modal */}
            {expandedImg && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.85)' }}
                    onClick={() => setExpandedImg(null)}>
                    <div className="flex flex-col rounded-sm overflow-hidden shadow-2xl max-w-[90vw] max-h-[90vh]"
                        style={{ background: '#0a0a0a', border: `1px solid ${PURPLE}40` }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                            style={{ borderColor: `${PURPLE}22`, background: `${PURPLE}09` }}>
                            <span className="font-mono text-[10px] text-gray-400">{expandedImg.alt}</span>
                            <div className="flex items-center gap-2">
                                <a href={expandedImg.src} download target="_blank" rel="noreferrer"
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-opacity hover:opacity-80"
                                    style={{ color: AMBER, borderColor: `${AMBER}30`, background: `${AMBER}10` }}>
                                    ↓ save
                                </a>
                                <button onClick={() => setExpandedImg(null)}
                                    className="text-gray-500 hover:text-white transition-colors p-0.5">
                                    <X size={14}/>
                                </button>
                            </div>
                        </div>
                        <img src={expandedImg.src} alt={expandedImg.alt}
                            className="block max-w-full max-h-[80vh] object-contain"/>
                    </div>
                </div>
            )}
        </OutputPanel>
    );
}

// ─── DownloadPanel ────────────────────────────────────────────────────────────

export function DownloadPanel({ downloads }: { downloads: MythicDownload[] }) {
    return (
        <OutputPanel icon={<Database size={11}/>} label="DOWNLOADS" accent={AMBER} count={downloads.length}>
            <div className="space-y-2">
                {downloads.map((dl, i) => {
                    const href = `/api/v1.4/files/download/${dl.agent_file_id}`;
                    const fname = dl.name || dl.plaintext || 'file';
                    return (
                        <div key={i}
                            className="flex items-center gap-3 p-2 rounded-sm"
                            style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}20` }}>
                            <Database size={12} style={{ color: AMBER, flexShrink: 0 }}/>
                            <span className="font-mono text-[12px] flex-1 truncate" style={{ color: '#ccc' }}>
                                {fname}
                            </span>
                            <button
                                onClick={() => navigator.clipboard.writeText(window.location.origin + href)}
                                className="font-mono text-[10px] px-2 py-1 rounded-sm transition-colors hover:opacity-100"
                                title="Copy link"
                                style={{ color: '#888', background: '#ffffff08', border: '1px solid #ffffff15', opacity: 0.7 }}>
                                <Clipboard size={10}/>
                            </button>
                            <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[11px] px-2 py-1 rounded-sm transition-colors hover:opacity-100"
                                title="Preview in new tab"
                                style={{ color: '#60a5fa', background: '#60a5fa15', border: '1px solid #60a5fa30', opacity: 0.8 }}>
                                <Eye size={10}/>
                            </a>
                            <a
                                href={href}
                                download={fname}
                                className="font-mono text-[11px] px-2 py-1 rounded-sm transition-colors hover:opacity-100"
                                style={{ color: AMBER, background: `${AMBER}15`, border: `1px solid ${AMBER}30`, opacity: 0.8 }}>
                                ↓ save
                            </a>
                        </div>
                    );
                })}
            </div>
        </OutputPanel>
    );
}

// ─── #12 MediaPanel — Combined 4-tab viewer (Preview / Text / Hex / Database) ─

export function MediaPanel({ agentFileId, filename }: { agentFileId: string; filename?: string }) {
    const [activeTab, setActiveTab] = useState<'preview' | 'text' | 'hex' | 'database'>('preview');
    const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);
    const [textContent, setTextContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [__mimeType, setMimeType] = useState('');
    const src = `/api/v1.4/files/download/${agentFileId}`;
    const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
    const isImage = ['png','jpg','jpeg','gif','bmp','webp','svg','ico'].includes(ext);
    const isAudio = ['mp3','wav','ogg','flac','m4a','aac'].includes(ext);
    const isVideo = ['mp4','webm','mkv','avi','mov'].includes(ext);
    const isDb = ['db','sqlite','sqlite3'].includes(ext);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(src);
                setMimeType(resp.headers.get('content-type') || '');
                const buf = await resp.arrayBuffer();
                if (cancelled) return;
                const bytes = new Uint8Array(buf);
                setRawBytes(bytes);
                try { setTextContent(new TextDecoder().decode(bytes)); } catch { setTextContent('[binary data]'); }
                setLoading(false);
                // Auto-select best tab
                if (isDb) setActiveTab('database');
                else if (isImage || isAudio || isVideo) setActiveTab('preview');
                else setActiveTab('text');
            } catch { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentFileId]);

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: 'preview', label: 'PREVIEW' },
        { id: 'text',    label: 'TEXT' },
        { id: 'hex',     label: 'HEX' },
        ...(isDb ? [{ id: 'database' as const, label: 'DATABASE' }] : []),
    ];

    const hexDump = useMemo(() => {
        if (!rawBytes || activeTab !== 'hex') return '';
        const lines: string[] = [];
        const len = Math.min(rawBytes.length, 8192); // limit to 8KB for hex display
        for (let i = 0; i < len; i += 16) {
            const slice = rawBytes.slice(i, i + 16);
            const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(slice).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
            lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
        }
        if (rawBytes.length > len) lines.push(`\n... truncated (${rawBytes.length} total bytes)`);
        return lines.join('\n');
    }, [rawBytes, activeTab]);

    return (
        <OutputPanel icon={<Eye size={11}/>} label={filename || 'MEDIA'} accent={PURPLE}
            toolbar={
                <div className="flex items-center gap-0.5">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors rounded-sm"
                            style={{
                                color: activeTab === t.id ? '#000' : '#888',
                                background: activeTab === t.id ? ACCENT : 'transparent',
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>
            }>
            {loading && <div className="font-mono text-[10px] py-4 text-center" style={{ color: '#555' }}>Loading file…</div>}
            {!loading && activeTab === 'preview' && (
                <div className="space-y-2">
                    {isImage && <img src={src} alt={filename} className="max-w-full max-h-[400px] object-contain rounded-sm border" style={{ borderColor: `${PURPLE}33` }}/>}
                    {isAudio && <audio src={src} controls className="w-full"/>}
                    {isVideo && <video src={src} controls className="w-full max-h-[400px] rounded-sm"/>}
                    {!isImage && !isAudio && !isVideo && (
                        <div className="font-mono text-[11px] text-gray-500 py-4 text-center">
                            No preview available. <a href={src} download={filename} className="text-signal hover:underline">Download file</a>
                        </div>
                    )}
                </div>
            )}
            {!loading && activeTab === 'text' && (
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-auto"
                    style={{ color: '#ccc' }}>
                    {textContent.slice(0, 500000) || '[empty]'}
                </pre>
            )}
            {!loading && activeTab === 'hex' && (
                <pre className="font-mono text-[10px] leading-relaxed max-h-[400px] overflow-auto"
                    style={{ color: '#a8d8ff' }}>
                    {hexDump || '[empty]'}
                </pre>
            )}
            {!loading && activeTab === 'database' && isDb && (
                <DatabasePanel agentFileId={agentFileId} filename={filename}/>
            )}
        </OutputPanel>
    );
}

// ─── GraphPanel (#2, #18) ─────────────────────────────────────────────────────
// Dagre-style hierarchical layout with icon support and auto-hide for >50 nodes

