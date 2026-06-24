/* =============================================================================
 *  MsfPayloadRow — row renderer for Metasploit-generated payloads.
 *
 *  Visual is intentionally identical to the Mythic `PayloadRow` so MSF entries
 *  drop into the same table without any "this came from msfvenom" decoration:
 *      Actions · Agent Type · Filename · Build Status · Description · C2 · Tags
 *
 *  Storage:
 *    - Mutating ops (rename / delete) write through to BOTH localStorage and
 *      Mythic agentstorage so other operators see the change instantly.
 *
 *  This file is the entire row + menu + options modal + rename dialog so we
 *  don't bleed MSF-specific concerns back into the shared components module.
 * ===========================================================================*/
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@apollo/client/react';
import { motion } from 'framer-motion';
import {
    MoreVertical, Download, Trash2, Info, Copy, Package, X, Edit3, Globe2,
    CheckCircle, Link as LinkIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { getAuthHeaders } from '../../lib/auth';
import { TASK_UPLOAD_URL, absoluteDownloadUrl } from '../../lib/urls';
import {
    type MsfPayloadRecord, deleteLocalPayload, saveLocalPayload,
    b64ToBytes, suggestFilename, encodeRecordForAgentStorage,
    classifyMsfModule,
} from '../../lib/msfPayloads';
import { DELETE_MSF_PAYLOAD, UPSERT_MSF_PAYLOAD, msfPayloadUniqueIdFor } from '../../lib/api/msfPayloads';
import { useReactiveVar } from '@apollo/client/react';
import { meState } from '../../lib/state';
import { toLocalTime } from '../../lib/time';
import { BuildStatusBadge } from './components';

const MENU_MIN_SPACE_BELOW = 280;

interface MsfPayloadRowProps {
    record: MsfPayloadRecord;
    onDeleted: (id: string) => void;
    onUpdated?: (record: MsfPayloadRecord) => void;
    isCombat?: boolean;
}

export const MsfPayloadRow: React.FC<MsfPayloadRowProps> = ({ record, onDeleted, onUpdated, isCombat }) => {
    const [showMenu, setShowMenu] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [showRename, setShowRename] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const [deleteMsfPayload] = useMutation<any>(DELETE_MSF_PAYLOAD);
    const [upsertMsfPayload] = useMutation<any>(UPSERT_MSF_PAYLOAD);
    // Operation scope — every row mutation has to target the per-op
    // unique_id namespace so we don't accidentally delete / overwrite
    // another operation's payload row.
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;

    /* ── close menu on outside click ──────────────────────────────────── */
    useEffect(() => {
        if (!showMenu) return;
        const onDown = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)
            ) setShowMenu(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showMenu]);

    const openMenu = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const flipUp = window.innerHeight - rect.bottom < MENU_MIN_SPACE_BELOW;
        setMenuPos({
            top: flipUp ? rect.top - 260 : rect.bottom + 4,
            left: Math.max(8, rect.left - 200),
        });
        setShowMenu(true);
    };

    const handleDownload = () => {
        const bytes = b64ToBytes(record.bytesB64);
        const blob = new Blob([bytes as any], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setShowMenu(false);
    };

    const handleCopyOptions = async () => {
        const lines = Object.entries(record.options)
            .filter(([_, v]) => v != null && v !== '')
            .map(([k, v]) => `${k}=${v}`);
        await navigator.clipboard.writeText(
            `msfvenom -p ${record.module} ${lines.join(' ')} -f ${record.format} -o ${filename}`,
        );
        snackActions.success('msfvenom command copied');
        setShowMenu(false);
    };

    /* ── Copy Public Download Link ──────────────────────────────────────────
       Mirrors Mythic's "Copy Public Download Link". MSF bytes don't live on
       Mythic's filemeta by default — they're in agentstorage as base64. So
       the first call uploads the bytes through TASK_UPLOAD_URL to materialise
       a real Mythic filemeta row, then caches the agent_file_id back onto the
       MsfPayloadRecord so subsequent copies don't re-upload. */
    const [linkBusy, setLinkBusy] = useState(false);
    const handleCopyPublicLink = async () => {
        setShowMenu(false);
        try {
            let fileId = record.uploadedFileId;
            if (!fileId) {
                setLinkBusy(true);
                const bytes = b64ToBytes(record.bytesB64);
                const blob = new Blob([bytes as any], { type: 'application/octet-stream' });
                const form = new FormData();
                form.append('file', blob, filename);
                form.append('comment', `MSF payload · ${record.module}`);
                const res = await fetch(TASK_UPLOAD_URL, {
                    method: 'POST',
                    body: form,
                    headers: getAuthHeaders(),
                });
                if (!res.ok) throw new Error(`upload failed: ${res.status}`);
                const data = await res.json();
                fileId = data?.agent_file_id;
                if (!fileId) throw new Error('no agent_file_id in upload response');
                // Cache on the record so we don't re-upload next time.
                const updated: MsfPayloadRecord = { ...record, uploadedFileId: fileId };
                saveLocalPayload(opId, updated);
                onUpdated?.(updated);
                upsertMsfPayload({
                    variables: {
                        unique_id: msfPayloadUniqueIdFor(opId, updated.id),
                        data: encodeRecordForAgentStorage(updated),
                    },
                }).catch(() => { /* local cache already has it */ });
            }
            const url = absoluteDownloadUrl(fileId);
            await navigator.clipboard.writeText(url);
            snackActions.success('Public download link copied');
        } catch (e: any) {
            snackActions.error(`Failed to publish payload: ${e?.message || 'unknown error'}`);
        } finally {
            setLinkBusy(false);
        }
    };

    const handleDelete = async () => {
        deleteLocalPayload(opId, record.id);
        try {
            await deleteMsfPayload({ variables: { unique_id: msfPayloadUniqueIdFor(opId, record.id) } });
        } catch {
            // Local copy already gone; agentstorage delete is best-effort.
        }
        snackActions.success('MSF payload deleted');
        onDeleted(record.id);
        setShowMenu(false);
    };

    /* ── Rename: update record.name, push to local + agentstorage ───────── */
    /*  Apply optimistically — push to the parent state and close the dialog
        BEFORE awaiting the agentstorage mutation. The row reflects instantly;
        the cross-operator sync happens in the background and a failure just
        logs (local copy already covers this operator). */
    const handleRename = (newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) {
            snackActions.error('Name cannot be empty');
            return;
        }
        if (trimmed === record.name) {
            setShowRename(false);
            return;
        }
        const updated: MsfPayloadRecord = { ...record, name: trimmed };
        saveLocalPayload(opId, updated);
        onUpdated?.(updated);
        snackActions.success('Payload renamed');
        setShowRename(false);
        // Background fan-out — failures are non-fatal.
        upsertMsfPayload({
            variables: {
                unique_id: msfPayloadUniqueIdFor(opId, updated.id),
                data: encodeRecordForAgentStorage(updated),
            },
        }).catch(() => {
            /* local + this operator already updated; just couldn't sync */
        });
    };

    /* ── Derived data ────────────────────────────────────────────────────── */
    const facets = classifyMsfModule(record.module);
    const filename = suggestFilename(record);
    const stageLabel = facets.stage === 'other' ? record.module.split('/').pop() || record.module : facets.stage;
    const connLabel = facets.conn !== 'none' ? facets.conn : facets.stage;
    const lhost = record.options.LHOST || record.options.RHOST;
    const lport = record.options.LPORT || record.options.RPORT;
    const rhosts = record.options.RHOSTS;
    const sizeKb = (record.size / 1024).toFixed(record.size > 1024 ? 1 : 2);
    const sizeStr = record.size >= 1024 * 1024
        ? `${(record.size / (1024 * 1024)).toFixed(2)} MB`
        : `${sizeKb} KB`;

    /* C2 pill — green if we have a host AND port (looks "wired up"), yellow
       if we only have one half, red if neither. For exec/single-stage payloads
       with no networking the column shows N/A like Mythic does. */
    const hasConn = !!(lhost || lport || rhosts);
    const c2Color = (lhost && lport) ? 'green' : (lhost || lport || rhosts) ? 'yellow' : 'red';

    return (
        <>
            <motion.tr
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: isCombat ? 0.08 : 0.15 }}
                className="border-b border-gray-800 hover:bg-white/5 transition-colors"
            >
                {/* Actions */}
                <td className="px-3 py-4">
                    <div className="flex items-center gap-1">
                        <button
                            ref={buttonRef}
                            onClick={() => (showMenu ? setShowMenu(false) : openMenu())}
                            className="p-1.5 rounded hover:bg-signal/10 text-gray-500 hover:text-signal transition-colors"
                        >
                            <MoreVertical size={16} />
                        </button>
                        <button
                            onClick={handleCopyPublicLink}
                            disabled={linkBusy}
                            className={cn(
                                'p-1.5 rounded text-gray-500 transition-colors',
                                linkBusy
                                    ? 'opacity-50 cursor-wait'
                                    : 'hover:bg-signal/10 hover:text-signal',
                            )}
                            title={record.uploadedFileId ? 'Copy Public Download Link' : 'Publish & Copy Public Download Link'}
                        >
                            <LinkIcon size={16} />
                        </button>
                        <button
                            onClick={handleDownload}
                            className="p-1.5 rounded hover:bg-green-400/10 text-gray-500 hover:text-green-400 transition-colors"
                            title="Download Payload"
                        >
                            <Download size={16} />
                        </button>
                    </div>
                </td>

                {/* Agent Type — same shape as Mythic's PayloadRow. Stage (e.g.
                    meterpreter, shell) takes the place of the Mythic payload
                    type name; the colored package square keeps the visual
                    identical so MSF rows blend in. */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded flex items-center justify-center border bg-green-400/10 border-green-400/30">
                            <Package size={16} className="text-green-400" />
                        </div>
                        <div>
                            <div className="font-mono text-sm text-green-400">
                                {stageLabel}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">
                                {facets.platform}{facets.arch !== 'any' && ` · ${facets.arch}`}
                            </div>
                        </div>
                    </div>
                </td>

                {/* Filename — operator-renamable. Click opens options modal
                    same way clicking a Mythic filename opens details. */}
                <td
                    className="px-4 py-3 cursor-pointer hover:bg-signal/5"
                    onClick={() => setShowOptions(true)}
                >
                    <div className="flex flex-col">
                        <span className="font-mono text-sm text-white truncate max-w-[250px] hover:text-signal transition-colors" title={filename}>
                            {filename}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                            {record.id.substring(0, 8)}...
                        </span>
                    </div>
                </td>

                {/* Build Status — MSF generation is one-shot, but we still
                    surface the same SUCCESS badge plus an inline step ribbon
                    listing module · format · encoder · size so the column
                    isn't empty next to a Mythic row with build steps. */}
                <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                        <BuildStatusBadge phase="success" />
                        <div className="flex items-center gap-1 flex-wrap">
                            <StepPill label={facets.staging.toUpperCase()} />
                            <StepPill label={record.format.toUpperCase()} />
                            {record.encoder && record.encoder !== 'none' && (
                                <StepPill label={record.encoder} variant="accent" />
                            )}
                            <StepPill label={sizeStr} variant="muted" />
                        </div>
                    </div>
                </td>

                {/* Description — show the full module path so operators see
                    exactly what was built (windows/meterpreter/reverse_tcp).
                    Below: who/when. */}
                <td
                    className="px-4 py-3 cursor-pointer hover:bg-signal/5"
                    onClick={() => setShowOptions(true)}
                >
                    <div className="flex flex-col">
                        <span className="font-mono text-sm text-gray-300 truncate max-w-md" title={record.module}>
                            {record.module}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                            {toLocalTime(record.createdAt, false)}{record.createdBy ? ` · ${record.createdBy}` : ''}
                        </span>
                    </div>
                </td>

                {/* C2 Status — mirror Mythic's profile pill with
                    HOST:PORT (or RHOSTS for bind-style payloads). The
                    connection style (reverse_tcp / bind_tcp / ...) takes the
                    place of the c2profile.name. */}
                <td
                    className="px-4 py-3 cursor-pointer hover:bg-signal/5"
                    onClick={() => setShowOptions(true)}
                >
                    {hasConn ? (
                        <div className="flex flex-col gap-0.5">
                            <span className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono border w-fit',
                                c2Color === 'green'  && 'text-green-400 bg-green-400/10 border-green-400/30',
                                c2Color === 'yellow' && 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
                                c2Color === 'red'    && 'text-red-400 bg-red-400/10 border-red-400/30',
                            )}>
                                <span className={cn(
                                    'w-1.5 h-1.5 rounded-full',
                                    c2Color === 'green'  && 'bg-green-400',
                                    c2Color === 'yellow' && 'bg-yellow-400 animate-pulse',
                                    c2Color === 'red'    && 'bg-red-400',
                                )} />
                                {connLabel}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500 pl-1">
                                <Globe2 size={9} className="text-signal/40" />
                                {lhost && (
                                    <span className="text-signal/70 truncate max-w-[150px]">{lhost}</span>
                                )}
                                {rhosts && !lhost && (
                                    <span className="text-signal/70 truncate max-w-[150px]">{rhosts}</span>
                                )}
                                {(lhost || rhosts) && lport && <span>:</span>}
                                {lport && <span className="text-yellow-400/80 font-bold">{lport}</span>}
                            </div>
                        </div>
                    ) : (
                        <span className="text-gray-500 text-xs font-mono">—</span>
                    )}
                </td>

                {/* Tags — encoder is the closest analogue MSF carries. */}
                <td className="px-4 py-3">
                    {record.encoder && record.encoder !== 'none' ? (
                        <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono"
                            style={{
                                backgroundColor: 'rgba(34,197,94,0.12)',
                                color: '#22c55e',
                                border: '1px solid rgba(34,197,94,0.30)',
                            }}
                        >
                            {record.encoder}
                        </span>
                    ) : (
                        <span className="text-gray-500 text-xs font-mono">—</span>
                    )}
                </td>
            </motion.tr>

            {/* Action menu portal */}
            {showMenu && createPortal(
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ top: menuPos.top, left: menuPos.left, position: 'fixed', zIndex: 9999 }}
                    className="w-64 bg-void/95 backdrop-blur-md border border-signal/30 shadow-2xl shadow-signal/10 py-1 overflow-y-auto"
                >
                    <div className="px-3 py-1 text-xs font-mono text-signal/50 uppercase tracking-wider border-b border-signal/10 bg-signal/5">File</div>
                    <MenuItem icon={<Edit3 size={14} />}    label="Rename"             onClick={() => { setShowRename(true); setShowMenu(false); }} />
                    <MenuItem icon={<Download size={14} />} label="Download Payload"   onClick={handleDownload} />
                    <MenuItem
                        icon={<LinkIcon size={14} />}
                        label={record.uploadedFileId ? 'Copy Public Download Link' : 'Publish & Copy Public Link'}
                        onClick={handleCopyPublicLink}
                    />
                    <MenuItem icon={<Copy size={14} />}     label="Copy msfvenom Cmd"  onClick={handleCopyOptions} />
                    <div className="border-t border-signal/10 my-1" />
                    <div className="px-3 py-1 text-xs font-mono text-ghost/50 uppercase tracking-wider">View</div>
                    <MenuItem icon={<Info size={14} />}     label="View Options"       onClick={() => { setShowOptions(true); setShowMenu(false); }} />
                    <div className="border-t border-signal/10 my-1" />
                    <div className="px-3 py-1 text-xs font-mono text-red-400/50 uppercase tracking-wider border-b border-red-400/10 bg-red-400/5">Danger</div>
                    <MenuItem icon={<Trash2 size={14} />}   label="Delete Payload"     onClick={handleDelete} danger />
                </motion.div>,
                document.body,
            )}

            {/* Rename dialog — direct conditional render. AnimatePresence
                wrapping createPortal was unreliable (Portal nodes aren't
                tracked as motion children), which left the dialog invisible
                even though `showRename` flipped to true. */}
            {showRename && createPortal(
                <RenameDialog
                    initial={record.name}
                    onClose={() => setShowRename(false)}
                    onSave={handleRename}
                />,
                document.body,
            )}

            {/* Options modal */}
            {showOptions && createPortal(
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={() => setShowOptions(false)}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        className="w-[560px] max-h-[80vh] flex flex-col bg-black border border-signal/40 shadow-lg shadow-signal/10 font-mono"
                    >
                        <div className="flex items-center justify-between border-b border-signal/30 px-4 py-3">
                            <div className="flex items-center gap-2 text-signal">
                                <Package size={14} className="text-green-400" />
                                <span className="text-[11px] tracking-[0.3em]">PAYLOAD · OPTIONS</span>
                            </div>
                            <button onClick={() => setShowOptions(false)} className="text-signal hover:text-accent">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 cyber-scrollbar text-xs">
                            <Field label="MODULE"   value={record.module} />
                            <Field label="STAGE"    value={`${stageLabel} (${facets.staging})`} />
                            <Field label="PLATFORM" value={`${facets.platform}${facets.arch !== 'any' ? ` · ${facets.arch}` : ''}`} />
                            <Field label="FORMAT"   value={record.format} />
                            {record.encoder && <Field label="ENCODER" value={record.encoder} />}
                            <Field label="SIZE"     value={`${record.size.toLocaleString()} bytes (${sizeStr})`} />
                            <Field label="CREATED"  value={`${toLocalTime(record.createdAt, false)}${record.createdBy ? ' · ' + record.createdBy : ''}`} />
                            <Field label="FILENAME" value={filename} />
                            <div className="pt-2">
                                <div className="text-[10px] tracking-[0.25em] text-green-400 mb-2">OPTIONS</div>
                                <div className="border border-signal/30 bg-signal/[0.03] divide-y divide-signal/15">
                                    {Object.entries(record.options).filter(([_, v]) => v != null && v !== '').map(([k, v]) => (
                                        <div key={k} className="flex items-baseline gap-3 px-3 py-1.5">
                                            <span className="text-signal/70 text-[10px] tracking-widest w-32 shrink-0">{k}</span>
                                            <span className="text-signal break-all">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="border-t border-signal/30 px-4 py-3 flex justify-end gap-2">
                            <button
                                onClick={handleDownload}
                                className="flex items-center gap-1.5 px-4 py-1.5 border border-green-400 bg-green-400 text-void font-mono text-[11px] tracking-[0.25em] font-bold hover:bg-signal hover:border-signal"
                            >
                                <Download size={11} /> DOWNLOAD
                            </button>
                            <button
                                onClick={() => setShowOptions(false)}
                                className="px-4 py-1.5 border border-signal/40 font-mono text-[11px] tracking-[0.25em] text-signal hover:bg-signal/10"
                            >
                                CLOSE
                            </button>
                        </div>
                    </motion.div>
                </motion.div>,
                document.body,
            )}
        </>
    );
};

/* ── Local helpers (kept private to this file) ─────────────────────────── */

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
    <button
        onClick={onClick}
        className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-sm font-mono transition-colors text-left',
            danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-gray-300 hover:bg-signal/10 hover:text-signal',
        )}
    >
        {icon} {label}
    </button>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-baseline gap-3">
        <span className="text-signal/70 text-[10px] tracking-[0.25em] uppercase w-24 shrink-0">{label}</span>
        <span className="text-signal break-all">{value}</span>
    </div>
);

/** Small pill used in the Build Status column to enumerate generation
 *  facts (staging, format, encoder, size). Three visual variants keep the
 *  hierarchy readable without colour overload. */
const StepPill: React.FC<{ label: string; variant?: 'default' | 'accent' | 'muted' }> = ({ label, variant = 'default' }) => (
    <span className={cn(
        'inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono tracking-wider border rounded',
        variant === 'accent' && 'text-green-400 bg-green-400/10 border-green-400/30',
        variant === 'muted'  && 'text-gray-500 border-gray-700',
        variant === 'default' && 'text-signal/80 border-signal/30 bg-signal/5',
    )}>
        {label}
    </span>
);

/** Rename dialog — keeps `record.name` as the editable display name; the
 *  filename is derived from it so the operator gets a sensible extension
 *  without having to think about format suffix conventions. */
const RenameDialog: React.FC<{ initial: string; onClose: () => void; onSave: (v: string) => void }> = ({ initial, onClose, onSave }) => {
    const [value, setValue] = useState(initial);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.select(); }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-[440px] bg-black border border-signal/40 shadow-lg shadow-signal/10 font-mono"
            >
                <div className="flex items-center justify-between border-b border-signal/30 px-4 py-3">
                    <div className="flex items-center gap-2 text-signal">
                        <Edit3 size={14} className="text-green-400" />
                        <span className="text-[11px] tracking-[0.3em]">RENAME · PAYLOAD</span>
                    </div>
                    <button onClick={onClose} className="text-signal hover:text-accent">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="text-[10px] text-signal/60 tracking-widest uppercase">Display Name</div>
                    <input
                        ref={inputRef}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onSave(value); if (e.key === 'Escape') onClose(); }}
                        className="w-full bg-black border border-signal/30 text-signal text-sm font-mono px-3 py-2 outline-none focus:border-green-400/60"
                    />
                    <div className="text-[10px] text-signal/50 font-mono">
                        File extension follows the chosen format automatically.
                    </div>
                </div>
                <div className="border-t border-signal/30 px-4 py-3 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 border border-signal/40 font-mono text-[11px] tracking-[0.25em] text-signal hover:bg-signal/10"
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={() => onSave(value)}
                        className="flex items-center gap-1.5 px-4 py-1.5 border border-green-400 bg-green-400 text-void font-mono text-[11px] tracking-[0.25em] font-bold hover:bg-signal hover:border-signal"
                    >
                        <CheckCircle size={11} /> SAVE
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
