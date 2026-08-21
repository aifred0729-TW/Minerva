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
import { BuildStatusBadge, CHIP, chipTone, EmDash } from './components';
import { LABEL, type Tone } from '../../components/Instrument';

const MENU_MIN_SPACE_BELOW = 280;

/* Row furniture — deliberately the same strings PayloadRow uses, so the two
 * kinds of row cannot drift apart visually. */
const CELL_OPEN = 'cursor-pointer transition-colors hover:bg-signal/[0.06]';
const ICON_BTN =
    'inline-flex h-8 w-8 items-center justify-center rounded-sm text-signal transition-colors ' +
    'hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal';
const MENU_ITEM =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal';
const MENU_SECTION =
    'border-y border-signal/10 bg-signal/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-signal';
const GHOST_BTN =
    'inline-flex min-h-[32px] items-center gap-1.5 rounded-sm border border-signal/25 px-3 text-[12px] font-bold uppercase ' +
    'tracking-[0.1em] text-signal transition-colors hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal';
const PRIMARY_BTN =
    'inline-flex min-h-[32px] items-center gap-1.5 rounded-sm border border-accent bg-accent px-3.5 text-[12px] font-bold uppercase ' +
    'tracking-[0.1em] text-void transition-colors hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-void focus-visible:ring-accent';

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

    /* C2 pill — `live` when we have a host AND a port (the payload is wired
       up), `warn` when only half of the pair is set, `fail` when neither is.
       For exec/single-stage payloads with no networking at all the column
       shows an em-dash, the same as a Mythic payload with no profile. */
    const hasConn = !!(lhost || lport || rhosts);
    const connTone: Tone = (lhost && lport) ? 'live' : (lhost || lport || rhosts) ? 'warn' : 'fail';

    return (
        <>
            <motion.tr
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: isCombat ? 0.08 : 0.15 }}
                className="border-b border-signal/10 transition-colors hover:bg-signal/[0.03]"
            >
                {/* Actions */}
                <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-0.5">
                        <button
                            ref={buttonRef}
                            onClick={() => (showMenu ? setShowMenu(false) : openMenu())}
                            aria-label="Payload actions"
                            aria-haspopup="menu"
                            aria-expanded={showMenu}
                            title="Payload actions"
                            className={ICON_BTN}
                        >
                            <MoreVertical size={15} strokeWidth={2} />
                        </button>
                        <button
                            onClick={handleCopyPublicLink}
                            disabled={linkBusy}
                            className={cn(ICON_BTN, linkBusy && 'cursor-wait opacity-50 hover:bg-transparent')}
                            title={record.uploadedFileId ? 'Copy Public Download Link' : 'Publish & Copy Public Download Link'}
                            aria-label={record.uploadedFileId ? 'Copy public download link' : 'Publish and copy public download link'}
                        >
                            <LinkIcon size={15} strokeWidth={2} />
                        </button>
                        <button
                            onClick={handleDownload}
                            className={cn(ICON_BTN, 'hover:bg-signal/10 hover:text-accent')}
                            title="Download Payload"
                            aria-label="Download payload"
                        >
                            <Download size={15} strokeWidth={2} />
                        </button>
                    </div>
                </td>

                {/* Agent / module — the same shape a Mythic row uses, so an
                    msfvenom payload sits in the list as a peer rather than as a
                    visitor. The stage (meterpreter, shell, …) stands in for the
                    Mythic payload type name. */}
                <td className="px-3 py-3 align-top">
                    {/* Centred against the square, exactly as PayloadRow is —
                        the two row kinds sit in the same column. */}
                    <div className="flex items-center gap-2.5">
                        <span className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border",
                            chipTone('live'),
                        )}>
                            <Package size={15} strokeWidth={2} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate font-mono text-[13px] font-bold text-signal">{stageLabel}</span>
                                <span className={cn(CHIP, chipTone('signal'), 'cursor-default')} title="Generated with msfvenom">
                                    MSF
                                </span>
                            </div>
                            <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-signal">
                                <span className="opacity-70">{facets.platform}</span>
                                {facets.arch !== 'any' && (
                                    <>
                                        <span className="opacity-40">·</span>
                                        <span className="font-bold">{facets.arch}</span>
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                </td>

                {/* File — operator-renamable. Clicking it opens the options
                    modal, the same way clicking a Mythic filename opens that
                    payload's configuration. */}
                <td
                    className={cn(CELL_OPEN, "px-3 py-3 align-top")}
                    onClick={() => setShowOptions(true)}
                >
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="max-w-[250px] truncate font-mono text-[13px] text-signal" title={filename}>
                            {filename}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-signal opacity-60">
                            {record.id.substring(0, 8)}…
                        </span>
                    </div>
                </td>

                {/* Progress — msfvenom generation is one-shot, so instead of a
                    step ribbon the column enumerates the facts of the build:
                    staging, format, encoder, size. */}
                <td className="px-3 py-3 align-top">
                    <div className="flex flex-col items-start gap-1">
                        <BuildStatusBadge phase="success" />
                        <div className="flex flex-wrap items-center gap-1">
                            <StepPill label={facets.staging} />
                            <StepPill label={record.format} />
                            {record.encoder && record.encoder !== 'none' && (
                                <StepPill label={record.encoder} tone="live" />
                            )}
                            <StepPill label={sizeStr} tone="idle" />
                        </div>
                    </div>
                </td>

                {/* Description — the full module path, because that is exactly
                    what was built (windows/meterpreter/reverse_tcp), with the
                    provenance line under it. */}
                <td
                    className={cn(CELL_OPEN, "px-3 py-3 align-top")}
                    onClick={() => setShowOptions(true)}
                >
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="max-w-md truncate font-mono text-[13px] text-signal" title={record.module}>
                            {record.module}
                        </span>
                        <span className="font-mono text-[11px] text-signal opacity-60">
                            {toLocalTime(record.createdAt, false)}{record.createdBy ? ` · ${record.createdBy}` : ''}
                        </span>
                    </div>
                </td>

                {/* C2 Status — the same pill a Mythic row shows, with the
                    connection style (reverse_tcp / bind_tcp / …) standing in
                    for the profile name and HOST:PORT beneath it. */}
                <td
                    className={cn(CELL_OPEN, "px-3 py-3 align-top")}
                    onClick={() => setShowOptions(true)}
                >
                    {hasConn ? (
                        <div className="flex min-w-0 flex-col gap-1">
                            <span className={cn(CHIP, chipTone(connTone))}>
                                <span aria-hidden="true" className={cn(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    connTone === 'live' ? 'bg-accent' : connTone === 'warn' ? 'bg-amber-400 animate-pulse' : 'bg-red-400',
                                )} />
                                <span className="normal-case tracking-normal">{connLabel}</span>
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5 pl-0.5 font-mono text-[11px] text-signal">
                                <Globe2 size={10} strokeWidth={2} aria-hidden="true" className="shrink-0 opacity-60" />
                                {lhost && <span className="truncate opacity-70">{lhost}</span>}
                                {rhosts && !lhost && <span className="truncate opacity-70">{rhosts}</span>}
                                {(lhost || rhosts) && lport && <span className="opacity-40">:</span>}
                                {lport && <span className="shrink-0 font-bold tabular-nums">{lport}</span>}
                            </span>
                        </div>
                    ) : <EmDash />}
                </td>

                {/* Tags — the encoder is the closest analogue msfvenom carries. */}
                <td className="px-3 py-3 align-top">
                    {record.encoder && record.encoder !== 'none' ? (
                        <span className={cn(CHIP, chipTone('live'), 'normal-case tracking-normal')}>
                            {record.encoder}
                        </span>
                    ) : <EmDash />}
                </td>
            </motion.tr>

            {/* Action menu portal */}
            {showMenu && createPortal(
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ top: menuPos.top, left: menuPos.left, position: 'fixed', zIndex: 9999 }}
                    role="menu"
                    aria-label="Payload actions"
                    className="cyber-scrollbar w-64 overflow-y-auto rounded-md border border-signal/20 bg-void/95 py-1 font-mono shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
                >
                    <div className={cn(MENU_SECTION, 'border-t-0')}>File</div>
                    <MenuItem icon={<Edit3 size={14} />}    label="Rename"             onClick={() => { setShowRename(true); setShowMenu(false); }} />
                    <MenuItem icon={<Download size={14} />} label="Download Payload"   onClick={handleDownload} />
                    <MenuItem
                        icon={<LinkIcon size={14} />}
                        label={record.uploadedFileId ? 'Copy Public Download Link' : 'Publish & Copy Public Link'}
                        onClick={handleCopyPublicLink}
                    />
                    <MenuItem icon={<Copy size={14} />}     label="Copy msfvenom Cmd"  onClick={handleCopyOptions} />
                    <div className="border-t border-signal/10 my-1" />
                    <div className={MENU_SECTION}>View</div>
                    <MenuItem icon={<Info size={14} />}     label="View Options"       onClick={() => { setShowOptions(true); setShowMenu(false); }} />
                    <div className="border-t border-signal/10 my-1" />
                    <div className="border-y border-red-400/20 bg-red-400/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">Danger</div>
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
                        role="dialog"
                        aria-modal="true"
                        aria-label="Payload options"
                        className="flex max-h-[80vh] w-[560px] flex-col overflow-hidden rounded-md border border-signal/20 bg-void/95 font-mono shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
                    >
                        {/* Header strip — what this is, and how it is doing. */}
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-signal/15 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <Package size={14} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" />
                                <span className={cn('truncate text-signal', LABEL)}>Payload · options</span>
                            </div>
                            <button
                                onClick={() => setShowOptions(false)}
                                aria-label="Close"
                                className={ICON_BTN}
                            >
                                <X size={14} strokeWidth={2} />
                            </button>
                        </div>
                        <div className="cyber-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                            <Field label="MODULE"   value={record.module} />
                            <Field label="STAGE"    value={`${stageLabel} (${facets.staging})`} />
                            <Field label="PLATFORM" value={`${facets.platform}${facets.arch !== 'any' ? ` · ${facets.arch}` : ''}`} />
                            <Field label="FORMAT"   value={record.format} />
                            {record.encoder && <Field label="ENCODER" value={record.encoder} />}
                            <Field label="SIZE"     value={`${record.size.toLocaleString()} bytes (${sizeStr})`} />
                            <Field label="CREATED"  value={`${toLocalTime(record.createdAt, false)}${record.createdBy ? ' · ' + record.createdBy : ''}`} />
                            <Field label="FILENAME" value={filename} />
                            <div className="pt-2">
                                <div className={cn('mb-2 text-signal', LABEL)}>Options</div>
                                <div className="divide-y divide-signal/10 rounded-sm border border-signal/15 bg-signal/[0.03]">
                                    {Object.entries(record.options).filter(([_, v]) => v != null && v !== '').map(([k, v]) => (
                                        <div key={k} className="flex items-baseline gap-3 px-3 py-1.5">
                                            <span className={cn('w-32 shrink-0 text-signal opacity-70', LABEL)}>{k}</span>
                                            <span className="break-all text-[13px] font-bold text-signal">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-signal/15 px-4 py-2.5">
                            <button
                                onClick={() => setShowOptions(false)}
                                className={GHOST_BTN}
                            >
                                Close
                            </button>
                            <button
                                onClick={handleDownload}
                                className={PRIMARY_BTN}
                            >
                                <Download size={12} strokeWidth={2} aria-hidden="true" /> Download
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
        role="menuitem"
        className={cn(
            MENU_ITEM,
            danger ? 'text-red-400 hover:bg-red-400/10' : 'text-signal hover:bg-signal/10',
        )}
    >
        {icon} {label}
    </button>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-baseline gap-3">
        <span className={cn('w-24 shrink-0 text-signal opacity-70', LABEL)}>{label}</span>
        <span className="break-all text-[13px] font-bold text-signal">{value}</span>
    </div>
);

/** Small pill used in the PROGRESS column to enumerate generation facts
 *  (staging, format, encoder, size). Tones come from the shared chip scale, so
 *  it is the same object the rest of the table is built from. */
const StepPill: React.FC<{ label: string; tone?: Tone }> = ({ label, tone = 'signal' }) => (
    <span className={cn(CHIP, chipTone(tone), 'px-1.5 py-0 text-[10px] tracking-[0.08em]')}>
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
                role="dialog"
                aria-modal="true"
                aria-label="Rename payload"
                className="w-[440px] overflow-hidden rounded-md border border-signal/20 bg-void/95 font-mono shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
            >
                <div className="flex items-center justify-between gap-3 border-b border-signal/15 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <Edit3 size={14} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" />
                        <span className={cn('truncate text-signal', LABEL)}>Rename · payload</span>
                    </div>
                    <button onClick={onClose} aria-label="Close" className={ICON_BTN}>
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>
                <div className="space-y-2.5 p-4">
                    <label htmlFor="msf-rename" className={cn('block text-signal', LABEL)}>Display name</label>
                    <input
                        id="msf-rename"
                        ref={inputRef}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onSave(value); if (e.key === 'Escape') onClose(); }}
                        className="min-h-[38px] w-full rounded-sm border border-signal/20 bg-black/40 px-3 py-2 font-mono text-[13px] text-signal transition-colors hover:border-signal/40 focus:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    />
                    <p className="text-[11px] text-signal opacity-70">
                        File extension follows the chosen format automatically.
                    </p>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-signal/15 px-4 py-2.5">
                    <button onClick={onClose} className={GHOST_BTN}>
                        Cancel
                    </button>
                    <button onClick={() => onSave(value)} className={PRIMARY_BTN}>
                        <CheckCircle size={12} strokeWidth={2} aria-hidden="true" /> Save
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
