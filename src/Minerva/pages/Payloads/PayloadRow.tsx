import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useReactiveVar } from "@apollo/client/react";
import { useLazyQueryCompat as useLazyQuery } from "../../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertCircle, ArrowLeftRight, Ban, Bell, BellOff,
    Bot, CheckCircle, Copy, Download, FileJson,
    FileText, Fingerprint, FlaskConical, GitCompare, Info, Link,
    ListCheck, MessageSquare, MoreVertical, Package, PhoneCall,
    RefreshCw, RotateCcw, Settings, Sliders,
    Zap, Tag as TagIcon, Edit3, Globe2, Trash2, X } from 'lucide-react';
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
import { BuildStatusBadge, C2StatusIndicator, TagsDisplay, BuildProgressSteps } from './components';
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
                    "border-b border-gray-800 hover:bg-white/5 transition-colors",
                    payload.deleted && "opacity-50"
                )}
            >
                {/* Actions */}
                <td className="px-3 py-4">
                    <div className="flex items-center gap-1">
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
                                className="p-1.5 rounded hover:bg-signal/10 text-gray-500 hover:text-signal transition-colors"
                            >
                                <MoreVertical size={16} />
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
                                    className="w-64 bg-void/95 backdrop-blur-md border border-signal/30 shadow-2xl shadow-signal/10 py-1 overflow-y-auto"
                                >
                                    {/* File Operations */}
                                    <div className="px-3 py-1 text-xs font-mono text-signal/50 uppercase tracking-wider border-b border-signal/10 bg-signal/5">File</div>
                                        
                                        <button
                                            onClick={() => { setShowRenameDialog(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <Edit3 size={14} />
                                            Rename File
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowDescriptionDialog(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <MessageSquare size={14} />
                                            Edit Description
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* View Operations */}
                                        <div className="px-3 py-1 text-xs font-mono text-ghost/50 uppercase tracking-wider">View</div>
                                        
                                        <button
                                            onClick={() => { setShowDetails(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <Info size={14} />
                                            View Payload Configuration
                                        </button>
                                        
                                        <button
                                            onClick={() => { onExportConfig(payload.uuid); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <FileText size={14} />
                                            Export Payload Config
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* Build Operations */}
                                        <div className="px-3 py-1 text-xs font-mono text-ghost/50 uppercase tracking-wider">Build</div>
                                        
                                        <button
                                            onClick={() => { setShowBuildMessageDialog(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <FileText size={14} />
                                            View Build Message/Stdout
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowBuildErrorDialog(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <AlertCircle size={14} />
                                            View Build Errors
                                        </button>
                                        
                                        <button
                                            onClick={() => { onRebuild(payload.uuid); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <RefreshCw size={14} />
                                            Trigger New Build
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowRebuildWithEdits(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <FileJson size={14} />
                                            Trigger New Build With Edits
                                        </button>

                                        {payload.build_phase === 'success' && (
                                            <button
                                                onClick={() => { onRebuildFromConfig(payload); setShowMenu(false); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                            >
                                                <Sliders size={14} />
                                                Rebuild from Config (Wizard)
                                            </button>
                                        )}

                                        <div className="border-t border-signal/10 my-1" />

                                        {/* File Operations - Advanced */}
                                        <div className="px-3 py-1 text-xs font-mono text-ghost/50 uppercase tracking-wider">Advanced</div>
                                        
                                        <button
                                            onClick={() => { setShowComparePayloads(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <GitCompare size={14} />
                                            Compare Payload Configuration
                                        </button>
                                        
                                        <button
                                            onClick={() => { setShowAddRemoveCommands(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <ListCheck size={14} />
                                            Add / Remove Commands
                                        </button>
                                        
                                        {payload.build_phase === 'success' && payload.filemetum && (
                                            <button
                                                onClick={() => { setShowHostFile(true); setShowMenu(false); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                            >
                                                <Globe2 size={14} />
                                                Host File via C2 Profile
                                            </button>
                                        )}
                                        
                                        <button
                                            onClick={() => { setShowTagEdit(true); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <TagIcon size={14} />
                                            Edit Tags
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* Callback Settings */}
                                        <div className="px-3 py-1 text-xs font-mono text-ghost/50 uppercase tracking-wider">Callbacks</div>
                                        
                                        <button
                            onClick={() => { setShowCreateCallbackDialog(true); setShowMenu(false); }}
                            className="w-full flex items-start gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                        >
                            <PhoneCall size={14} className="mt-0.5 shrink-0" />
                            <div className="text-left">
                                <div>Manually Create Callback</div>
                                <div className="text-xs text-ghost/50 font-normal">Full configuration form</div>
                            </div>
                        </button>

                        <button
                            onClick={() => { setShowConfirmFakeCallback(true); setShowMenu(false); }}
                            className="w-full flex items-start gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                        >
                            <Zap size={14} className="mt-0.5 shrink-0" />
                            <div className="text-left">
                                <div>Quick Fake Callback</div>
                                <div className="text-xs text-ghost/50 font-normal">Auto-filled with random data</div>
                            </div>
                        </button>

                        <button
                                            onClick={() => { onToggleAlert(payload.uuid, !payload.callback_alert); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            {payload.callback_alert ? <BellOff size={14} /> : <Bell size={14} />}
                                            {payload.callback_alert ? 'Disable Callback Alerts' : 'Enable Callback Alerts'}
                                        </button>
                                        
                                        <button
                                            onClick={() => { onToggleAllowed(payload.uuid, !payload.callback_allowed); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            {payload.callback_allowed ? <Ban size={14} /> : <CheckCircle size={14} />}
                                            {payload.callback_allowed ? 'Block New Callbacks' : 'Allow New Callbacks'}
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />
                                        
                                        {/* Generate Operations */}
                                        <div className="px-3 py-1 text-xs font-mono text-ghost/50 uppercase tracking-wider">Generate</div>
                                        
                                        <button
                                            onClick={() => { 
                                                setDialogLoading(true);
                                                setDialogError('');
                                                setShowRedirectRulesDialog(true);
                                                fetchRedirectRules({ variables: { uuid: payload.uuid } });
                                                setShowMenu(false);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
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
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
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
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
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
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-signal/10 hover:text-signal transition-colors"
                                        >
                                            <FlaskConical size={14} />
                                            Generate Sample Message
                                        </button>
                                        
                                        <div className="border-t border-signal/10 my-1" />

                                        <div className="px-3 py-1 text-xs font-mono text-red-400/50 uppercase tracking-wider border-b border-red-400/10 bg-red-400/5">Danger</div>
                                        
                                        {payload.deleted ? (
                                            <button
                                                onClick={() => { setShowConfirmDelete(true); setShowMenu(false); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-matrix hover:bg-matrix/10 transition-colors"
                                            >
                                                <RotateCcw size={14} />
                                                Restore Payload
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => { setShowConfirmDelete(true); setShowMenu(false); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
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
                                    className="p-1.5 rounded hover:bg-signal/10 text-gray-500 hover:text-signal transition-colors"
                                    title="Copy Public Download Link"
                                >
                                    <Link size={16} />
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="p-1.5 rounded hover:bg-green-400/10 text-gray-500 hover:text-green-400 transition-colors"
                                    title="Download Payload"
                                >
                                    <Download size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </td>

                {/* Agent Type - Color based on build status */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "w-8 h-8 rounded flex items-center justify-center border relative",
                            payload.build_phase === 'success' 
                                ? "bg-green-400/10 border-green-400/30" 
                                : payload.build_phase === 'error' 
                                    ? "bg-red-400/10 border-red-400/30"
                                    : "bg-yellow-400/10 border-yellow-400/30"
                        )}>
                            <Package size={16} className={cn(
                                payload.build_phase === 'success' 
                                    ? "text-green-400" 
                                    : payload.build_phase === 'error' 
                                        ? "text-red-400"
                                        : "text-yellow-400"
                            )} />
                            {!payload.callback_allowed && (
                                <span title="New callbacks blocked" className="absolute -top-1 -right-1 text-red-400 bg-void rounded-full"><Ban size={9} /></span>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className={cn(
                                    "font-mono text-sm",
                                    payload.build_phase === 'success' 
                                        ? "text-green-400" 
                                        : payload.build_phase === 'error' 
                                            ? "text-red-400"
                                            : "text-yellow-400"
                                )}>
                                    {payload.wrapped_payload_id && payload.payload?.payloadtype?.name
                                        ? payload.payload.payloadtype.name
                                        : payload.payloadtype.name}
                                </span>
                                {payload.wrapped_payload_id && (
                                    <span
                                        title={`Wrapped by ${payload.payloadtype.name}`}
                                        className="inline-flex items-center px-1 py-0.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-[9px] rounded font-mono gap-0.5 cursor-default"
                                    >
                                        <Package size={9} /> WRAP
                                    </span>
                                )}
                            </div>
                            {!payload.callback_alert && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <BellOff size={10} className="text-yellow-500" />
                                    <span className="text-[10px] text-yellow-500/70 font-mono">no alerts</span>
                                </div>
                            )}
                        </div>
                    </div>
                </td>

                {/* Filename - clickable to show details */}
                <td className="px-4 py-3 cursor-pointer hover:bg-signal/5" onClick={() => setShowDetails(true)}>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            {payload.auto_generated && payload.task && (
                                <a
                                    href={`/new/task/${payload.task.display_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Auto-generated by task"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-yellow-400 hover:text-yellow-300 transition-colors shrink-0"
                                >
                                    <Bot size={14} />
                                </a>
                            )}
                            {payload.auto_generated && !payload.task && (
                                <span title="Auto-generated payload" className="text-yellow-400/60 shrink-0"><Bot size={14} /></span>
                            )}
                            <span className="font-mono text-sm text-white truncate max-w-[250px] hover:text-signal transition-colors" title={filename}>
                                {filename}
                            </span>
                        </div>
                        <span className="text-xs text-gray-500 font-mono">
                            {payload.uuid.substring(0, 8)}...
                        </span>
                    </div>
                </td>

                {/* Build Status - clickable to show details */}
                <td className="px-4 py-3 cursor-pointer hover:bg-signal/5" onClick={() => setShowDetails(true)}>
                    <div className="flex flex-col">
                        <BuildStatusBadge phase={payload.build_phase} />
                        <BuildProgressSteps steps={payload.payload_build_steps} buildPhase={payload.build_phase} isCombat={isCombat} />
                    </div>
                </td>

                {/* Description - clickable to show details */}
                <td className="px-4 py-3 cursor-pointer hover:bg-signal/5" onClick={() => setShowDetails(true)}>
                    <span className="text-sm text-gray-400 line-clamp-2">{payload.description || '—'}</span>
                </td>

                {/* C2 Status - clickable to show details */}
                <td className="px-4 py-3 cursor-pointer hover:bg-signal/5" onClick={() => setShowDetails(true)}>
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

                {/* Tags - clickable to show details, with quick edit button */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 cursor-pointer hover:bg-signal/5" onClick={() => setShowDetails(true)}>
                            {(payloadTags.length > 0 || fileTags.length > 0) ? (
                                <div className="space-y-1">
                                    {payloadTags.length > 0 && <TagsDisplay tags={payloadTags} />}
                                    {fileTags.length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <span className="text-[9px] text-ghost/40 font-mono uppercase tracking-wider">file:</span>
                                            <TagsDisplay tags={fileTags} />
                                        </div>
                                    )}
                                </div>
                            ) : <span className="text-gray-500 text-xs font-mono">—</span>}
                        </div>
                        <button
                            onClick={() => setShowTagEdit(true)}
                            title="Edit Tags"
                            className="p-1 text-gray-600 hover:text-signal transition-colors shrink-0"
                        >
                            <Edit3 size={12} />
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
