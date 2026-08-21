import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useReactiveVar } from "@apollo/client/react";
import { useLazyQueryCompat as useLazyQuery } from "../../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertCircle, ArrowLeftRight, Ban, Bell, BellOff,
    Bot, CheckCircle, Download, FileJson,
    FileText, Fingerprint, FlaskConical, GitCompare, Info, Link,
    ListCheck, MessageSquare, MoreVertical, Package, PhoneCall,
    RefreshCw, RotateCcw, Settings, Sliders,
    Zap, Tag as TagIcon, Edit3, Globe2, Trash2 } from 'lucide-react';
import { cn, b64DecodeUnicode, downloadDataUrl } from '../../lib/utils';
import { directDownloadUrl, absoluteDownloadUrl } from '../../lib/urls';
import { snackActions } from '../../lib/snackbar';
import { meState } from '../../lib/state';
import { toLocalTime } from '../../lib/time';
import {
    updateFilenameMutation,
    updatePayloadDescriptionMutation,
    checkAgentConfigQuery,
    generateRedirectRulesQuery,
    generateIOCsQuery,
    generateSampleMessageQuery,
    createFakeCallbackMutation,
}from '../../lib/api/payloads';
import type { Payload } from '../../types/payloads';
import { getAnimDuration } from './utils';
import { BuildStatusBadge, C2StatusIndicator, TagsDisplay, BuildProgressSteps, CHIP, chipTone, EmDash, buildState } from './components';
import {
    ConfirmDialog,
    CreateNewCallbackDialog,
    RebuildWithEditsDialog,
    ComparePayloadsDialog,
    HostPayloadFileDialog,
    AddRemoveCommandsDialog,
    TagEditDialog,
    PayloadDialog,
}from './dialogs';
import { PayloadDetailsModal } from './PayloadDetailsModal';

const MENU_MIN_SPACE_BELOW = 300;

/* ── Row furniture ────────────────────────────────────────────────────────
 *
 * The cells that open the payload's configuration all share one affordance,
 * and the icon buttons all share one hit area, so a row cannot end up with
 * three slightly different versions of the same gesture.
 */

/** A cell that opens the details modal. */
const CELL_OPEN = 'cursor-pointer transition-colors hover:bg-signal/[0.06]';

/** 32px square icon button — the console's secondary control size. */
const ICON_BTN =
    'inline-flex h-8 w-8 items-center justify-center rounded-sm text-signal transition-colors ' +
    'hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal';

/** One menu row. */
const MENU_ITEM =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-signal transition-colors ' +
    'hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal';

/** A menu section strip. The strip is what separates the sections, so the
 *  label itself does not have to be dimmed to stay out of the way. */
const MENU_SECTION =
    'border-y border-signal/10 bg-signal/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-signal';


interface PayloadRowProps {
    payload: Payload;
    onDelete: (uuid: string) => void;
    onRestore: (uuid: string) => void;
    onToggleAlert: (uuid: string, alert: boolean) => void;
    onToggleAllowed: (uuid: string, allowed: boolean) => void;
    onRebuild: (uuid: string) => void;
    onRebuildFromConfig: (payload: Payload) => void;
    onExportConfig: (uuid: string) => void;
    showDeleted: boolean;
    isCombat?: boolean;
    onTagsUpdated?: () => void;
}

export const PayloadRow = ({ 
    payload, 
    onDelete, 
    onRestore, 
    onToggleAlert, 
    onToggleAllowed,
    onRebuild,
    onRebuildFromConfig,
    onExportConfig,
    showDeleted,
    isCombat = false,
    onTagsUpdated,
}: PayloadRowProps) => {
    // Item 1: Read UTC time preference from current operator
    const me = useReactiveVar(meState);
    const [showMenu, setShowMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [showDetails, setShowDetails] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const portalMenuRef = useRef<HTMLDivElement>(null);
    
    // Dialog states
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
    const [showBuildMessageDialog, setShowBuildMessageDialog] = useState(false);
    const [showBuildErrorDialog, setShowBuildErrorDialog] = useState(false);
    const [showRedirectRulesDialog, setShowRedirectRulesDialog] = useState(false);
    const [showConfigCheckDialog, setShowConfigCheckDialog] = useState(false);
    const [showIOCDialog, setShowIOCDialog] = useState(false);
    const [showSampleMessageDialog, setShowSampleMessageDialog] = useState(false);
    // New dialog states
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [showConfirmFakeCallback, setShowConfirmFakeCallback] = useState(false);
    const [showCreateCallbackDialog, setShowCreateCallbackDialog] = useState(false);
    const [_showImportConfig, _setShowImportConfig] = useState(false);
    const [showRebuildWithEdits, setShowRebuildWithEdits] = useState(false);
    const [showComparePayloads, setShowComparePayloads] = useState(false);
    const [showHostFile, setShowHostFile] = useState(false);
    const [showAddRemoveCommands, setShowAddRemoveCommands] = useState(false);
    const [showTagEdit, setShowTagEdit] = useState(false);
    
    // Loading states for queries
    const [redirectRulesContent, setRedirectRulesContent] = useState('');
    const [configCheckContent, setConfigCheckContent] = useState('');
    const [iocContent, setIOCContent] = useState('');
    const [sampleMessageContent, setSampleMessageContent] = useState('');
    const [dialogLoading, setDialogLoading] = useState(false);
    const [dialogError, setDialogError] = useState('');
    
    // Mutations
    const [updateFilename] = useMutation<any>(updateFilenameMutation, {
        onCompleted: () => snackActions.success('Filename updated'),
        onError: (e) => snackActions.error('Failed to update filename: ' + e.message)
    });
    
    const [updateDescription] = useMutation<any>(updatePayloadDescriptionMutation, {
        onCompleted: () => snackActions.success('Description updated'),
        onError: (e) => snackActions.error('Failed to update description: ' + e.message)
    });
    
    const [createFakeCallback] = useMutation<any>(createFakeCallbackMutation, {
        onCompleted: (data: any) => {
            if (data.createFakeCallback.status === 'success') {
                snackActions.success('Fake callback created!');
            } else {
                snackActions.error(data.createFakeCallback.error);
            }
        },
        onError: (e) => snackActions.error('Failed to create fake callback: ' + e.message)
    });
    
    // Lazy queries
    const [fetchRedirectRules] = useLazyQuery<any>(generateRedirectRulesQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            setDialogLoading(false);
            if (data.redirect_rules.status === 'success') {
                setRedirectRulesContent(data.redirect_rules.output || 'No redirect rules generated.');
            } else {
                setDialogError(data.redirect_rules.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });
    
    const [fetchConfigCheck] = useLazyQuery<any>(checkAgentConfigQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            setDialogLoading(false);
            if (data.config_check.status === 'success') {
                setConfigCheckContent(data.config_check.output || 'Configuration is valid.');
            } else {
                setDialogError(data.config_check.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });
    
    const [fetchIOCs] = useLazyQuery<any>(generateIOCsQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            setDialogLoading(false);
            if (data.c2GetIOC.status === 'success') {
                setIOCContent(data.c2GetIOC.output || 'No IOCs generated.');
            } else {
                setDialogError(data.c2GetIOC.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });
    
    const [fetchSampleMessage] = useLazyQuery<any>(generateSampleMessageQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data: any) => {
            setDialogLoading(false);
            if (data.c2SampleMessage.status === 'success') {
                setSampleMessageContent(data.c2SampleMessage.output || 'No sample message available.');
            } else {
                setDialogError(data.c2SampleMessage.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });

    const filename = payload.filemetum?.filename_text 
        ? b64DecodeUnicode(payload.filemetum.filename_text) 
        : 'N/A';

    // One tone per row, read once: the identity square, the PROGRESS chip and
    // the details modal all have to agree about what this build is doing.
    const buildTone = buildState(payload.build_phase).tone;

    const handleDownload = () => {
        if (payload.filemetum?.agent_file_id) {
            downloadDataUrl(directDownloadUrl(payload.filemetum.agent_file_id), filename);
        }
    };

    // Close menu when clicking outside
    useEffect(() => {
        if (!showMenu) return;
        
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const isOutsideButton = buttonRef.current && !buttonRef.current.contains(target);
            const isOutsidePortal = portalMenuRef.current && !portalMenuRef.current.contains(target);
            
            if (isOutsideButton && isOutsidePortal) {
                setShowMenu(false);
            }
        };
        
        // Delay adding listener to prevent immediate close
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);
        
        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

    if (payload.deleted && !showDeleted) return null;

    // Item 6: keep payload tags and file tags separated for layered display
    const payloadTags = payload.tags || [];
    const fileTags = payload.filemetum?.tags || [];
    const allTags = [...payloadTags, ...fileTags];

    return (
        <>
            <motion.tr
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: getAnimDuration(0.15, isCombat) }}
                className={cn(
                    "border-b border-signal/10 transition-colors hover:bg-signal/[0.03]",
                    payload.deleted && "opacity-45",
                )}
            >
                {/* Actions */}
                <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-0.5">
                        <div className="relative">
                            <button
                                ref={buttonRef}
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    // Calculate position to prevent overflow
                                    const menuHeight = Math.min(500, window.innerHeight - 40); // Max menu height
                                    const menuWidth = 256; // w-64 = 256px
                                    
                                    // Calculate optimal top position
                                    let top = rect.bottom + 5;
                                    const spaceBelow = window.innerHeight - rect.bottom - 20;
                                    const spaceAbove = rect.top - 20;
                                    
                                    // If not enough space below, try above or adjust
                                    if (spaceBelow < MENU_MIN_SPACE_BELOW && spaceAbove > spaceBelow) {
                                        // Show above the button
                                        top = Math.max(10, rect.top - Math.min(menuHeight, spaceAbove));
                                    } else if (top + menuHeight > window.innerHeight - 10) {
                                        top = Math.max(10, window.innerHeight - menuHeight - 10);
                                    }
                                    
                                    // Ensure left doesn't overflow
                                    let left = rect.left;
                                    if (left + menuWidth > window.innerWidth - 10) {
                                        left = window.innerWidth - menuWidth - 10;
                                    }
                                    
                                    setMenuPosition({ top, left });
                                    setShowMenu(!showMenu);
                                }}
                                aria-label="Payload actions"
                                aria-haspopup="menu"
                                aria-expanded={showMenu}
                                title="Payload actions"
                                className={ICON_BTN}
                            >
                                <MoreVertical size={15} strokeWidth={2} />
                            </button>
                            
                            {showMenu && createPortal(
                                <motion.div
                                    ref={portalMenuRef}
                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                    style={{ 
                                        position: 'fixed', 
                                        top: menuPosition.top, 
                                        left: menuPosition.left,
                                        zIndex: 99999,
                                        maxHeight: `calc(100vh - ${menuPosition.top + 20}px)`,
                                        minHeight: '200px'
                                    }}
                                    role="menu"
                                    aria-label="Payload actions"
                                    className="cyber-scrollbar w-64 overflow-y-auto rounded-md border border-signal/20 bg-void/95 py-1 font-mono shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
                                >
                                    {/* File Operations */}
                                    <div className={cn(MENU_SECTION, 'border-t-0')}>File</div>
                                        
                                        <button
                                            onClick={() => { setShowRenameDialog(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <Edit3 size={14} />
                                            Rename File
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowDescriptionDialog(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <MessageSquare size={14} />
                                            Edit Description
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* View Operations */}
                                        <div className={MENU_SECTION}>View</div>
                                        
                                        <button
                                            onClick={() => { setShowDetails(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <Info size={14} />
                                            View Payload Configuration
                                        </button>
                                        
                                        <button
                                            onClick={() => { onExportConfig(payload.uuid); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <FileText size={14} />
                                            Export Payload Config
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* Build Operations */}
                                        <div className={MENU_SECTION}>Build</div>
                                        
                                        <button
                                            onClick={() => { setShowBuildMessageDialog(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <FileText size={14} />
                                            View Build Message/Stdout
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowBuildErrorDialog(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <AlertCircle size={14} />
                                            View Build Errors
                                        </button>
                                        
                                        <button
                                            onClick={() => { onRebuild(payload.uuid); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <RefreshCw size={14} />
                                            Trigger New Build
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowRebuildWithEdits(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <FileJson size={14} />
                                            Trigger New Build With Edits
                                        </button>

                                        {payload.build_phase === 'success' && (
                                            <button
                                                onClick={() => { onRebuildFromConfig(payload); setShowMenu(false); }}
                                                className={MENU_ITEM}
                                            >
                                                <Sliders size={14} />
                                                Rebuild from Config (Wizard)
                                            </button>
                                        )}

                                        <div className="border-t border-signal/10 my-1" />

                                        {/* File Operations - Advanced */}
                                        <div className={MENU_SECTION}>Advanced</div>
                                        
                                        <button
                                            onClick={() => { setShowComparePayloads(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <GitCompare size={14} />
                                            Compare Payload Configuration
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowAddRemoveCommands(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <ListCheck size={14} />
                                            Add / Remove Commands
                                        </button>
                                        
                                        {payload.build_phase === 'success' && payload.filemetum && (
                                            <button
                                                onClick={() => { setShowHostFile(true); setShowMenu(false); }}
                                                className={MENU_ITEM}
                                            >
                                                <Globe2 size={14} />
                                                Host File via C2 Profile
                                            </button>
                                        )}
                                        
                                        <button
                                            onClick={() => { setShowTagEdit(true); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            <TagIcon size={14} />
                                            Edit Tags
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* Callback Settings */}
                                        <div className={MENU_SECTION}>Callbacks</div>
                                        
                                        <button
                            onClick={() => { setShowCreateCallbackDialog(true); setShowMenu(false); }}
                            className={cn(MENU_ITEM, 'items-start')}
                        >
                            <PhoneCall size={14} className="mt-0.5 shrink-0" />
                            <div className="text-left">
                                <div>Manually Create Callback</div>
                                <div className="text-[11px] text-signal opacity-60">Full configuration form</div>
                            </div>
                        </button>

                        <button
                            onClick={() => { setShowConfirmFakeCallback(true); setShowMenu(false); }}
                            className={cn(MENU_ITEM, 'items-start')}
                        >
                            <Zap size={14} className="mt-0.5 shrink-0" />
                            <div className="text-left">
                                <div>Quick Fake Callback</div>
                                <div className="text-[11px] text-signal opacity-60">Auto-filled with random data</div>
                            </div>
                        </button>

                        <button
                                            onClick={() => { onToggleAlert(payload.uuid, !payload.callback_alert); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            {payload.callback_alert ? <BellOff size={14} /> : <Bell size={14} />}
                                            {payload.callback_alert ? 'Disable Callback Alerts' : 'Enable Callback Alerts'}
                                        </button>
                                        
                                        <button
                                            onClick={() => { onToggleAllowed(payload.uuid, !payload.callback_allowed); setShowMenu(false); }}
                                            className={MENU_ITEM}
                                        >
                                            {payload.callback_allowed ? <Ban size={14} /> : <CheckCircle size={14} />}
                                            {payload.callback_allowed ? 'Block New Callbacks' : 'Allow New Callbacks'}
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* Generate Operations */}
                                        <div className={MENU_SECTION}>Generate</div>
                                        
                                        <button
                                            onClick={() => { 
                                                setDialogLoading(true);
                                                setDialogError('');
                                                setShowRedirectRulesDialog(true);
                                                fetchRedirectRules({ variables: { uuid: payload.uuid } });
                                                setShowMenu(false);
                                            }}
                                            className={MENU_ITEM}
                                        >
                                            <ArrowLeftRight size={14} />
                                            Generate Redirect Rules
                                        </button>
                                        
                                        <button
                                            onClick={() => { 
                                                setDialogLoading(true);
                                                setDialogError('');
                                                setShowConfigCheckDialog(true);
                                                fetchConfigCheck({ variables: { uuid: payload.uuid } });
                                                setShowMenu(false);
                                            }}
                                            className={MENU_ITEM}
                                        >
                                            <Settings size={14} />
                                            Check Agent C2 Configuration
                                        </button>
                                        
                                        <button
                                            onClick={() => { 
                                                setDialogLoading(true);
                                                setDialogError('');
                                                setShowIOCDialog(true);
                                                fetchIOCs({ variables: { uuid: payload.uuid } });
                                                setShowMenu(false);
                                            }}
                                            className={MENU_ITEM}
                                        >
                                            <Fingerprint size={14} />
                                            Generate IOCs
                                        </button>
                                        
                                        <button
                                            onClick={() => { 
                                                setDialogLoading(true);
                                                setDialogError('');
                                                setShowSampleMessageDialog(true);
                                                fetchSampleMessage({ variables: { uuid: payload.uuid } });
                                                setShowMenu(false);
                                            }}
                                            className={MENU_ITEM}
                                        >
                                            <FlaskConical size={14} />
                                            Generate Sample Message
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />

                                        <div className="border-y border-red-400/20 bg-red-400/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">Danger</div>
                                        
                                        {payload.deleted ? (
                                            <button
                                                onClick={() => { setShowConfirmDelete(true); setShowMenu(false); }}
                                                className={cn(MENU_ITEM, 'text-accent hover:bg-signal/10')}
                                            >
                                                <RotateCcw size={14} />
                                                Restore Payload
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => { setShowConfirmDelete(true); setShowMenu(false); }}
                                                className={cn(MENU_ITEM, 'text-red-400 hover:bg-red-400/10')}
                                            >
                                                <Trash2 size={14} />
                                                Delete Payload from Disk
                                            </button>
                                        )}
                                    </motion.div>,
                                document.body
                            )}
                        </div>
                        
                        {payload.build_phase === 'success' && payload.filemetum && (
                            <>
                                <button
                                    onClick={() => {
                                        const url = absoluteDownloadUrl(payload.filemetum?.agent_file_id ?? '');
                                        navigator.clipboard.writeText(url);
                                        snackActions.success('Public download link copied to clipboard');
                                    }}
                                    className={ICON_BTN}
                                    title="Copy Public Download Link"
                                    aria-label="Copy public download link"
                                >
                                    <Link size={15} strokeWidth={2} />
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className={cn(ICON_BTN, 'hover:bg-signal/10 hover:text-accent')}
                                    title="Download Payload"
                                    aria-label="Download payload"
                                >
                                    <Download size={15} strokeWidth={2} />
                                </button>
                            </>
                        )}
                    </div>
                </td>

                {/* Agent / module — identity, not status.
                    The tone lives in the square and in the PROGRESS chip; the
                    agent name stays `signal` and keeps its real casing, so two
                    rows with different build phases still look like the same
                    kind of thing. */}
                <td className="px-3 py-3 align-top">
                    {/* `items-center`, not `items-start`: the agent name is the
                        square's label, so it reads centred against it. The
                        optional "no alerts" line joins the same block, and the
                        pair centres together rather than the name riding up to
                        the square's top edge. */}
                    <div className="flex items-center gap-2.5">
                        <span className={cn(
                            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border",
                            chipTone(buildTone),
                        )}>
                            <Package size={15} strokeWidth={2} aria-hidden="true" />
                            {!payload.callback_allowed && (
                                <span
                                    title="New callbacks blocked"
                                    className="absolute -right-1 -top-1 rounded-full bg-void text-red-400"
                                >
                                    <Ban size={10} strokeWidth={2.5} />
                                </span>
                            )}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate font-mono text-[13px] font-bold text-signal">
                                    {payload.wrapped_payload_id && payload.payload?.payloadtype?.name
                                        ? payload.payload.payloadtype.name
                                        : payload.payloadtype.name}
                                </span>
                                {payload.wrapped_payload_id && (
                                    <span
                                        title={`Wrapped by ${payload.payloadtype.name}`}
                                        className={cn(CHIP, chipTone('range'), 'cursor-default')}
                                    >
                                        <Package size={9} strokeWidth={2} aria-hidden="true" /> Wrap
                                    </span>
                                )}
                            </div>
                            {!payload.callback_alert && (
                                <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-signal">
                                    <BellOff size={10} strokeWidth={2} aria-hidden="true" className="opacity-70" />
                                    <span className="opacity-70">no alerts</span>
                                </span>
                            )}
                        </div>
                    </div>
                </td>

                {/* File — the name keeps its casing because a filename is
                    recognised by its shape, and the short UUID under it is the
                    thing operators paste into a search. */}
                <td className={cn(CELL_OPEN, "px-3 py-3 align-top")} onClick={() => setShowDetails(true)}>
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                            {payload.auto_generated && payload.task && (
                                <a
                                    href={`/new/task/${payload.task.display_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Auto-generated by task"
                                    aria-label="Open the task that generated this payload"
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 text-amber-400 transition-colors hover:text-amber-300"
                                >
                                    <Bot size={13} strokeWidth={2} />
                                </a>
                            )}
                            {payload.auto_generated && !payload.task && (
                                <span title="Auto-generated payload" className="shrink-0 text-amber-400">
                                    <Bot size={13} strokeWidth={2} aria-hidden="true" />
                                </span>
                            )}
                            <span className="max-w-[250px] truncate font-mono text-[13px] text-signal" title={filename}>
                                {filename}
                            </span>
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-signal opacity-60">
                            {payload.uuid.substring(0, 8)}…
                        </span>
                    </div>
                </td>

                {/* Progress — the phase as a word, then one dot per build
                    step so a stalled build shows WHERE it stalled. */}
                <td className={cn(CELL_OPEN, "px-3 py-3 align-top")} onClick={() => setShowDetails(true)}>
                    <div className="flex flex-col items-start">
                        <BuildStatusBadge phase={payload.build_phase} />
                        <BuildProgressSteps steps={payload.payload_build_steps} buildPhase={payload.build_phase} isCombat={isCombat} />
                    </div>
                </td>

                {/* Description */}
                <td className={cn(CELL_OPEN, "px-3 py-3 align-top")} onClick={() => setShowDetails(true)}>
                    {payload.description
                        ? <span className="line-clamp-2 text-[13px] text-signal">{payload.description}</span>
                        : <EmDash />}
                </td>

                {/* C2 Status */}
                <td className={cn(CELL_OPEN, "px-3 py-3 align-top")} onClick={() => setShowDetails(true)}>
                    <C2StatusIndicator
                        c2profiles={
                            payload.payloadc2profiles.length > 0
                                ? payload.payloadc2profiles
                                : payload.payload?.payloadc2profiles || []
                        }
                        c2params={
                            (payload.c2profileparametersinstances && payload.c2profileparametersinstances.length > 0)
                                ? payload.c2profileparametersinstances
                                : payload.payload?.c2profileparametersinstances
                        }
                    />
                </td>

                {/* Tags — payload tags first, then the file's own, labelled,
                    because they are two different things that look alike. */}
                <td className="px-3 py-3 align-top">
                    <div className="flex items-start gap-2">
                        <div className={cn(CELL_OPEN, "min-w-0 flex-1 rounded-sm")} onClick={() => setShowDetails(true)}>
                            {(payloadTags.length > 0 || fileTags.length > 0) ? (
                                <div className="space-y-1">
                                    {payloadTags.length > 0 && <TagsDisplay tags={payloadTags} />}
                                    {fileTags.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1">
                                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-signal opacity-70">file</span>
                                            <TagsDisplay tags={fileTags} />
                                        </div>
                                    )}
                                </div>
                            ) : <EmDash />}
                        </div>
                        <button
                            onClick={() => setShowTagEdit(true)}
                            title="Edit Tags"
                            aria-label="Edit tags"
                            className={cn(ICON_BTN, "shrink-0")}
                        >
                            <Edit3 size={13} strokeWidth={2} />
                        </button>
                    </div>
                </td>
            </motion.tr>

            {/* Details Modal */}
            <AnimatePresence>
                {showDetails && (
                    <PayloadDetailsModal
                        payload={payload}
                        filename={filename}
                        me={me}
                        allTags={allTags}
                        onClose={() => setShowDetails(false)}
                        onDownload={handleDownload}
                        onExportConfig={onExportConfig}
                        onRebuild={onRebuild}
                        onRebuildFromConfig={onRebuildFromConfig}
                        onShowRebuildWithEdits={() => setShowRebuildWithEdits(true)}
                        onShowComparePayloads={() => setShowComparePayloads(true)}
                        onShowHostFile={() => setShowHostFile(true)}
                        onShowAddRemoveCommands={() => setShowAddRemoveCommands(true)}
                        toLocalTime={toLocalTime}
                    />
                )}
            </AnimatePresence>
            
            {/* Rename File Dialog */}
            <PayloadDialog
                open={showRenameDialog}
                onClose={() => setShowRenameDialog(false)}
                title="RENAME FILE"
                content={filename}
                editable
                onSave={(newFilename) => {
                    if (payload.filemetum?.id) {
                        // Note: bytea type in GraphQL handles the encoding automatically
                        updateFilename({ 
                            variables: { 
                                file_id: payload.filemetum.id, 
                                filename: newFilename 
                            } 
                        });
                    }
                }}
            />
            
            {/* Edit Description Dialog */}
            <PayloadDialog
                open={showDescriptionDialog}
                onClose={() => setShowDescriptionDialog(false)}
                title="EDIT DESCRIPTION"
                content={payload.description || ''}
                editable
                onSave={(newDescription) => {
                    updateDescription({ 
                        variables: { 
                            payload_uuid: payload.uuid, 
                            description: newDescription 
                        } 
                    });
                }}
            />
            
            {/* Build Message Dialog */}
            <PayloadDialog
                open={showBuildMessageDialog}
                onClose={() => setShowBuildMessageDialog(false)}
                title="BUILD MESSAGE / STDOUT"
                content={[
                    payload.build_message ? `[Message]\n${payload.build_message}` : '',
                    payload.build_stdout  ? `[Stdout]\n${payload.build_stdout}`  : '',
                ].filter(Boolean).join('\n\n') || 'No build message or stdout available.'}
            />
            
            {/* Build Error Dialog */}
            <PayloadDialog
                open={showBuildErrorDialog}
                onClose={() => setShowBuildErrorDialog(false)}
                title="BUILD ERRORS"
                content={payload.build_stderr || 'No build errors.'}
            />
            
            {/* Redirect Rules Dialog */}
            <PayloadDialog
                open={showRedirectRulesDialog}
                onClose={() => setShowRedirectRulesDialog(false)}
                title="REDIRECT RULES"
                content={redirectRulesContent}
                loading={dialogLoading}
                error={dialogError}
            />
            
            {/* Config Check Dialog */}
            <PayloadDialog
                open={showConfigCheckDialog}
                onClose={() => setShowConfigCheckDialog(false)}
                title="AGENT C2 CONFIGURATION CHECK"
                content={configCheckContent}
                loading={dialogLoading}
                error={dialogError}
            />
            
            {/* IOC Dialog */}
            <PayloadDialog
                open={showIOCDialog}
                onClose={() => setShowIOCDialog(false)}
                title="INDICATORS OF COMPROMISE"
                content={iocContent}
                loading={dialogLoading}
                error={dialogError}
            />
            
            {/* Sample Message Dialog */}
            <PayloadDialog
                open={showSampleMessageDialog}
                onClose={() => setShowSampleMessageDialog(false)}
                title="SAMPLE MESSAGE"
                content={sampleMessageContent}
                loading={dialogLoading}
                error={dialogError}
            />
            
            {/* Confirm Delete / Restore Dialog */}
            <ConfirmDialog
                open={showConfirmDelete}
                onClose={() => setShowConfirmDelete(false)}
                onConfirm={() => {
                    if (payload.deleted) onRestore(payload.uuid);
                    else onDelete(payload.uuid);
                }}
                title={payload.deleted ? 'RESTORE PAYLOAD' : 'DELETE PAYLOAD'}
                message={payload.deleted
                    ? 'Mark payload as not deleted so you can get callbacks. Does not recreate the payload on disk.'
                    : 'Delete the payload from disk and mark as deleted. No new callbacks can be generated from this payload.'}
                confirmLabel={payload.deleted ? 'Restore' : 'Delete'}
                confirmColor={payload.deleted ? 'green' : 'red'}
            />
            
            {/* Manually Create Callback Dialog */}
            <CreateNewCallbackDialog
                open={showCreateCallbackDialog}
                onClose={() => setShowCreateCallbackDialog(false)}
                uuid={payload.uuid}
                filename={payload.filemetum?.filename_text || payload.uuid}
            />

            {/* Confirm Fake Callback Dialog */}
            <ConfirmDialog
                open={showConfirmFakeCallback}
                onClose={() => setShowConfirmFakeCallback(false)}
                onConfirm={() => createFakeCallback({ variables: { payloadUUID: payload.uuid } })}
                title="GENERATE FAKE CALLBACK"
                message="Generate a fake callback from this payload for testing purposes?"
                confirmLabel="Generate"
                confirmColor="green"
            />
            
            {/* Rebuild With Edits Dialog */}
            <RebuildWithEditsDialog
                open={showRebuildWithEdits}
                onClose={() => setShowRebuildWithEdits(false)}
                uuid={payload.uuid}
            />
            
            {/* Compare Payloads Dialog */}
            <ComparePayloadsDialog
                open={showComparePayloads}
                onClose={() => setShowComparePayloads(false)}
                payloadId={payload.id}
                isCombat={isCombat}
            />
            
            {/* Host File Dialog */}
            {payload.filemetum && (
                <HostPayloadFileDialog
                    open={showHostFile}
                    onClose={() => setShowHostFile(false)}
                    fileUuid={payload.filemetum.agent_file_id}
                    fileName={filename}
                />
            )}
            
            {/* Add / Remove Commands Dialog */}
            <AddRemoveCommandsDialog
                open={showAddRemoveCommands}
                onClose={() => setShowAddRemoveCommands(false)}
                uuid={payload.uuid}
                payloadId={payload.id}
            />
            
            {/* Tag Edit Dialog */}
            <TagEditDialog
                open={showTagEdit}
                onClose={() => setShowTagEdit(false)}
                payloadId={payload.id}
                currentTags={payload.tags || []}
                onTagsChanged={() => onTagsUpdated?.()}
            />
        </>
    );
};

// ============================================
// Tab Navigation Component
// ============================================
