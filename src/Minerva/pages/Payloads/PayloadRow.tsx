import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useLazyQuery, useReactiveVar } from '@apollo/client'
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertCircle, AlertTriangle, ArrowLeftRight, Ban, Bell, BellOff,
    BookOpen, Bot, CheckCircle, Copy, Download, ExternalLink, FileJson,
    FileText, Fingerprint, FlaskConical, GitCompare, Hash, Info, Link,
    ListCheck, MessageSquare, MoreVertical, Package, PhoneCall, PlayCircle,
    Radio, RefreshCw, RotateCcw, Settings, Sliders, Terminal, XCircle,
    Zap, Tag as TagIcon, Edit3, Globe2, Trash2, X, Link2} from 'lucide-react';
import { cn, b64DecodeUnicode } from '../../lib/utils';
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
import { ParseParamValue, BuildStatusBadge, C2StatusIndicator, TagsDisplay, BuildProgressSteps } from './components';
import {
    ConfirmDialog,
    CreateNewCallbackDialog,
    RebuildWithEditsDialog,
    ComparePayloadsDialog,
    HostPayloadFileDialog,
    AddRemoveCommandsDialog,
    TagEditDialog,
    WrappedPayloadInfo,
    PayloadDialog,
}from './dialogs';

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
    const [__showImportConfig, __setShowImportConfig] = useState(false);
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
    const [updateFilename] = useMutation(updateFilenameMutation, {
        onCompleted: () => snackActions.success('Filename updated'),
        onError: (e) => snackActions.error('Failed to update filename: ' + e.message)
    });
    
    const [updateDescription] = useMutation(updatePayloadDescriptionMutation, {
        onCompleted: () => snackActions.success('Description updated'),
        onError: (e) => snackActions.error('Failed to update description: ' + e.message)
    });
    
    const [createFakeCallback] = useMutation(createFakeCallbackMutation, {
        onCompleted: (data) => {
            if (data.createFakeCallback.status === 'success') {
                snackActions.success('Fake callback created!');
            } else {
                snackActions.error(data.createFakeCallback.error);
            }
        },
        onError: (e) => snackActions.error('Failed to create fake callback: ' + e.message)
    });
    
    // Lazy queries
    const [fetchRedirectRules] = useLazyQuery(generateRedirectRulesQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
            setDialogLoading(false);
            if (data.redirect_rules.status === 'success') {
                setRedirectRulesContent(data.redirect_rules.output || 'No redirect rules generated.');
            } else {
                setDialogError(data.redirect_rules.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });
    
    const [fetchConfigCheck] = useLazyQuery(checkAgentConfigQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
            setDialogLoading(false);
            if (data.config_check.status === 'success') {
                setConfigCheckContent(data.config_check.output || 'Configuration is valid.');
            } else {
                setDialogError(data.config_check.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });
    
    const [fetchIOCs] = useLazyQuery(generateIOCsQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
            setDialogLoading(false);
            if (data.c2GetIOC.status === 'success') {
                setIOCContent(data.c2GetIOC.output || 'No IOCs generated.');
            } else {
                setDialogError(data.c2GetIOC.error);
            }
        },
        onError: (e) => { setDialogLoading(false); setDialogError(e.message); }
    });
    
    const [fetchSampleMessage] = useLazyQuery(generateSampleMessageQuery, {
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
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
            const link = document.createElement('a');
            link.href = `/direct/download/${payload.filemetum.agent_file_id}`;
            link.click();
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
                                    if (spaceBelow < 300 && spaceAbove > spaceBelow) {
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
                                        const url = `${window.location.origin}/direct/download/${payload.filemetum?.agent_file_id}`;
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
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowDetails(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-void border border-signal/30 rounded-lg w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-signal/30 bg-signal/5 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-signal font-mono tracking-wider">PAYLOAD DETAILS</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-sm text-gray-400 font-mono">{payload.uuid}</span>
                                        <button 
                                            onClick={() => { navigator.clipboard.writeText(payload.uuid); snackActions.success('UUID copied'); }}
                                            className="text-ghost hover:text-signal transition-colors"
                                            title="Copy UUID"
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                </div>
                                <button onClick={() => setShowDetails(false)} className="text-ghost hover:text-signal transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            
                            {/* Content - Scrollable */}
                            <div className="p-6 space-y-6 overflow-y-auto cyber-scrollbar flex-1">
                                {/* Quick Actions */}
                                <div className="flex flex-wrap gap-2">
                                    {payload.build_phase === 'success' && payload.filemetum && (
                                        <>
                                            <button
                                                onClick={handleDownload}
                                                className="flex items-center gap-2 px-3 py-2 bg-matrix/20 border border-matrix/30 text-matrix rounded hover:bg-matrix/30 transition-colors font-mono text-sm"
                                            >
                                                <Download size={14} />
                                                Download
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const url = `${window.location.origin}/direct/download/${payload.filemetum?.agent_file_id}`;
                                                    navigator.clipboard.writeText(url);
                                                    snackActions.success('Public download link copied');
                                                }}
                                                className="flex items-center gap-2 px-3 py-2 bg-signal/10 border border-signal/30 text-signal rounded hover:bg-signal/20 transition-colors font-mono text-sm"
                                            >
                                                <Link size={14} />
                                                Copy Public Link
                                            </button>
                                            <button
                                                onClick={() => setShowHostFile(true)}
                                                className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                            >
                                                <Globe2 size={14} />
                                                Host via C2
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => { onExportConfig(payload.uuid); }}
                                        className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                    >
                                        <FileText size={14} />
                                        Export Config
                                    </button>
                                    <button
                                        onClick={() => { onRebuild(payload.uuid); }}
                                        className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                    >
                                        <RefreshCw size={14} />
                                        Rebuild
                                    </button>
                                    <button
                                        onClick={() => { setShowDetails(false); setShowRebuildWithEdits(true); }}
                                        className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                    >
                                        <FileJson size={14} />
                                        Rebuild w/ Edits
                                    </button>
                                    {payload.build_phase === 'success' && (
                                        <button
                                            onClick={() => { setShowDetails(false); onRebuildFromConfig(payload); }}
                                            className="flex items-center gap-2 px-3 py-2 bg-signal/10 border border-signal/30 text-signal rounded hover:bg-signal/20 transition-colors font-mono text-sm"
                                        >
                                            <Sliders size={14} />
                                            Rebuild (Wizard)
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setShowDetails(false); setShowComparePayloads(true); }}
                                        className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                    >
                                        <GitCompare size={14} />
                                        Compare
                                    </button>
                                    <button
                                        onClick={() => { setShowDetails(false); setShowAddRemoveCommands(true); }}
                                        className="flex items-center gap-2 px-3 py-2 bg-ghost/10 border border-ghost/30 text-gray-300 rounded hover:bg-ghost/20 transition-colors font-mono text-sm"
                                    >
                                        <ListCheck size={14} />
                                        Commands
                                    </button>
                                </div>
                                
                                {/* Basic Info Grid */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Payload Type</label>
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "w-8 h-8 rounded flex items-center justify-center border",
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
                                            </div>
                                            <div>
                                                <p className="text-signal font-mono text-sm">{payload.payloadtype.name}</p>
                                                {/* Item 5: version mismatch STALE badge */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className="text-xs text-gray-500">v{payload.payloadtype.semver}</p>
                                                    {payload.payload_type_semver && payload.payloadtype.semver &&
                                                     payload.payload_type_semver !== payload.payloadtype.semver && (
                                                        <span
                                                            title={`Built with v${payload.payload_type_semver} — current container is v${payload.payloadtype.semver}`}
                                                            className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-[9px] rounded font-mono cursor-help"
                                                        >
                                                            <AlertTriangle size={8} />
                                                            STALE
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Filename</label>
                                        <p className="text-white font-mono truncate" title={filename}>{filename}</p>
                                        {payload.filemetum?.agent_file_id && (
                                            <p className="text-xs text-gray-500 truncate">ID: {payload.filemetum.agent_file_id.substring(0, 12)}...</p>
                                        )}
                                    </div>
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Created</label>
                                        {/* Item 1: use creation_time + operator UTC preference */}
                                        <p className="text-gray-300 font-mono">{toLocalTime(payload.creation_time, me?.user?.view_utc_time ?? false)}</p>
                                        {payload.operator && (
                                            <p className="text-xs text-gray-500 font-mono">by {payload.operator.username}</p>
                                        )}
                                    </div>
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Build Status</label>
                                        <BuildStatusBadge phase={payload.build_phase} />
                                    </div>
                                </div>

                                {/* File Metadata */}
                                {payload.filemetum && (payload.filemetum.md5 || payload.filemetum.sha1 || payload.filemetum.size) && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2"><Hash size={12} /> File Metadata</label>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                                            {payload.filemetum.md5 && (
                                                <div>
                                                    <span className="text-gray-500 block">MD5</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-signal/80 break-all text-xs">{payload.filemetum.md5}</span>
                                                        <button
                                                            title="Copy MD5"
                                                            onClick={() => { navigator.clipboard.writeText(payload.filemetum.md5); snackActions.success('MD5 copied'); }}
                                                            className="shrink-0 text-ghost hover:text-signal transition-colors ml-1"
                                                        >
                                                            <Copy size={11} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {payload.filemetum.sha1 && (
                                                <div>
                                                    <span className="text-gray-500 block">SHA1</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-signal/80 break-all text-xs">{payload.filemetum.sha1}</span>
                                                        <button
                                                            title="Copy SHA1"
                                                            onClick={() => { navigator.clipboard.writeText(payload.filemetum.sha1); snackActions.success('SHA1 copied'); }}
                                                            className="shrink-0 text-ghost hover:text-signal transition-colors ml-1"
                                                        >
                                                            <Copy size={11} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {payload.filemetum.size !== undefined && payload.filemetum.size > 0 && (
                                                <div>
                                                    <span className="text-gray-500 block">Size</span>
                                                    <span className="text-white">
                                                        {payload.filemetum.size > 1048576
                                                            ? `${(payload.filemetum.size / 1048576).toFixed(2)} MB`
                                                            : payload.filemetum.size > 1024
                                                                ? `${(payload.filemetum.size / 1024).toFixed(1)} KB`
                                                                : `${payload.filemetum.size} B`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Callback Settings */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={cn(
                                        "p-4 rounded border flex items-center justify-between",
                                        payload.callback_alert 
                                            ? "bg-matrix/10 border-matrix/30" 
                                            : "bg-black/30 border-ghost/20"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            {payload.callback_alert ? <Bell size={20} className="text-matrix" /> : <BellOff size={20} className="text-ghost" />}
                                            <div>
                                                <p className="text-sm font-mono text-white">Callback Alerts</p>
                                                <p className="text-xs text-gray-500">{payload.callback_alert ? 'Notifications enabled' : 'Notifications disabled'}</p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-1 rounded text-xs font-mono",
                                            payload.callback_alert ? "bg-matrix/20 text-matrix" : "bg-ghost/20 text-ghost"
                                        )}>
                                            {payload.callback_alert ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <div className={cn(
                                        "p-4 rounded border flex items-center justify-between",
                                        payload.callback_allowed 
                                            ? "bg-matrix/10 border-matrix/30" 
                                            : "bg-red-500/10 border-red-500/30"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            {payload.callback_allowed ? <CheckCircle size={20} className="text-matrix" /> : <Ban size={20} className="text-red-400" />}
                                            <div>
                                                <p className="text-sm font-mono text-white">New Callbacks</p>
                                                <p className="text-xs text-gray-500">{payload.callback_allowed ? 'New callbacks allowed' : 'New callbacks blocked'}</p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-1 rounded text-xs font-mono",
                                            payload.callback_allowed ? "bg-matrix/20 text-matrix" : "bg-red-500/20 text-red-400"
                                        )}>
                                            {payload.callback_allowed ? 'ALLOWED' : 'BLOCKED'}
                                        </span>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                    <label className="text-xs text-ghost uppercase tracking-wider block mb-2">Description</label>
                                    <p className="text-gray-300">{payload.description || 'No description provided'}</p>
                                </div>

                                {/* C2 Profiles */}
                                <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                    <label className="text-xs text-ghost uppercase tracking-wider block mb-3">C2 Profiles</label>
                                    <div className="space-y-4">
                                        {payload.payloadc2profiles.length > 0 ? (
                                            payload.payloadc2profiles.map((pc, idx) => {
                                                const profileParams = (payload.c2profileparametersinstances || []).filter(
                                                    inst => inst.c2profile.name === pc.c2profile.name
                                                );
                                                const hostInst = profileParams.find(p => p.c2profileparameter.name === 'callback_host' || p.c2profileparameter.name === 'host');
                                                const portInst = profileParams.find(p => p.c2profileparameter.name === 'callback_port' || p.c2profileparameter.name === 'port');
                                                const isActive = pc.c2profile.running && pc.c2profile.container_running;
                                                const isWaiting = !pc.c2profile.running && pc.c2profile.container_running;
                                                const SENSITIVE = new Set(['AESPSK', 'aespsk', 'proxyPass']);
                                                return (
                                                    <div key={idx} className={cn(
                                                        'rounded border',
                                                        isActive ? 'border-matrix/30 bg-matrix/5' : isWaiting ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5'
                                                    )}>
                                                        {/* Profile header */}
                                                        <div className={cn(
                                                            'flex items-center justify-between px-4 py-2 border-b',
                                                            isActive ? 'border-matrix/20' : isWaiting ? 'border-yellow-500/20' : 'border-red-500/20'
                                                        )}>
                                                            <div className="flex items-center gap-2">
                                                                <Radio size={14} className={cn(pc.c2profile.running ? 'animate-pulse' : '', isActive ? 'text-matrix' : isWaiting ? 'text-yellow-400 animate-pulse' : 'text-red-400')} />
                                                                <span className={cn('font-mono text-sm font-bold', isActive ? 'text-matrix' : isWaiting ? 'text-yellow-400' : 'text-red-400')}>{pc.c2profile.name}</span>
                                                                {pc.c2profile.is_p2p && <span className="text-xs bg-purple-500/20 text-purple-400 px-1 rounded">P2P</span>}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {/* Prominent host:port */}
                                                                {(hostInst?.value || portInst?.value) && (
                                                                    <div className="flex items-center gap-1.5 bg-signal/10 border border-signal/20 px-2 py-1 rounded font-mono text-xs">
                                                                        <Globe2 size={11} className="text-signal/60" />
                                                                        {hostInst?.value && <span className="text-signal font-bold">{hostInst.value}</span>}
                                                                        {hostInst?.value && portInst?.value && <span className="text-gray-600">:</span>}
                                                                        {portInst?.value && <span className="text-yellow-400 font-bold">{portInst.value}</span>}
                                                                    </div>
                                                                )}
                                                                <span className={cn('text-xs px-2 py-0.5 rounded font-mono', isActive ? 'bg-matrix/20 text-matrix' : isWaiting ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400')}>
                                                                    {isActive ? 'RUNNING' : isWaiting ? 'WAITING' : 'STOPPED'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {/* Parameters */}
                                                        {profileParams.length > 0 && (
                                                            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                                                                {profileParams.map((param, pi) => {
                                                                    const isSensitive = SENSITIVE.has(param.c2profileparameter.name);
                                                                    const isHostP = param.c2profileparameter.name === 'callback_host' || param.c2profileparameter.name === 'host';
                                                                    const isPortP = param.c2profileparameter.name === 'callback_port' || param.c2profileparameter.name === 'port';
                                                                    return (
                                                                        <div key={pi} className="flex flex-col gap-0.5">
                                                                            <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{param.c2profileparameter.name}</span>
                                                                            {isHostP ? (
                                                                                <span className="text-signal font-bold font-mono text-xs break-all">{param.value || '—'}</span>
                                                                            ) : isPortP ? (
                                                                                <span className="text-yellow-400 font-bold font-mono text-xs break-all">{param.value || '—'}</span>
                                                                            ) : (
                                                                                <ParseParamValue value={param.value} parameterType={param.c2profileparameter.parameter_type} sensitive={isSensitive} />
                                                                            )}
                                                                            {param.enc_key_base64 && (
                                                                                <span className="text-[9px] font-mono text-gray-500">Enc: <span className="text-gray-400">{param.enc_key_base64.substring(0, 16)}…</span></span>
                                                                            )}
                                                                            {param.dec_key_base64 && (
                                                                                <span className="text-[9px] font-mono text-gray-500">Dec: <span className="text-gray-400">{param.dec_key_base64.substring(0, 16)}…</span></span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <span className="text-gray-500 text-sm">No C2 profiles configured</span>
                                        )}
                                    </div>
                                </div>

                                {/* Build Parameters */}
                                {payload.buildparameterinstances && payload.buildparameterinstances.length > 0 && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2">
                                            <Settings size={12} /> Build Parameters
                                        </label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                                            {payload.buildparameterinstances.map((bp) => (
                                                <div key={bp.id} className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{bp.buildparameter.name}</span>
                                                    {bp.buildparameter.description && (
                                                        <span className="text-[9px] text-gray-600 font-mono">{bp.buildparameter.description}</span>
                                                    )}
                                                    <ParseParamValue value={bp.value} parameterType={bp.buildparameter.parameter_type} />
                                                    {bp.enc_key_base64 && (
                                                        <span className="text-[9px] font-mono text-gray-500">Enc: <span className="text-gray-400">{bp.enc_key_base64.substring(0, 16)}…</span></span>
                                                    )}
                                                    {bp.dec_key_base64 && (
                                                        <span className="text-[9px] font-mono text-gray-500">Dec: <span className="text-gray-400">{bp.dec_key_base64.substring(0, 16)}…</span></span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Commands */}
                                {payload.payloadcommands && payload.payloadcommands.length > 0 && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2">
                                            <Terminal size={12} /> Commands ({payload.payloadcommands.length})
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[...payload.payloadcommands]
                                                .sort((a, b) => a.command.cmd.localeCompare(b.command.cmd))
                                                .map((pc) => {
                                                    const cmdVer = pc.command.version;
                                                    const loadedVer = pc.version;
                                                    const isOutdated = cmdVer !== undefined && loadedVer !== undefined && cmdVer !== loadedVer;
                                                    return (
                                                        <div
                                                            key={pc.id}
                                                            title={isOutdated ? `Loaded: v${loadedVer}, Latest: v${cmdVer}` : `v${loadedVer}`}
                                                            className={cn(
                                                                'flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono',
                                                                isOutdated
                                                                    ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                                                                    : 'bg-signal/10 border-signal/20 text-signal'
                                                            )}
                                                        >
                                                            <span>{pc.command.cmd}</span>
                                                            {loadedVer !== undefined && (
                                                                <span className={cn(
                                                                    'text-[9px] px-1 rounded',
                                                                    isOutdated ? 'bg-yellow-400/20 text-yellow-300' : 'bg-signal/20 text-signal/70'
                                                                )}>v{loadedVer}</span>
                                                            )}
                                                            {isOutdated && (
                                                                <span className="text-[9px] text-yellow-300/60">→v{cmdVer}</span>
                                                            )}
                                                            <a
                                                                href={`/docs/agents/${payload.payloadtype.name}/commands/${pc.command.cmd}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-ghost/40 hover:text-signal transition-colors"
                                                                title="Documentation"
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <BookOpen size={9} />
                                                            </a>
                                                        </div>
                                                    );
                                                })
                                            }
                                        </div>
                                        {payload.payloadcommands.some(pc => pc.command.version !== undefined && pc.version !== undefined && pc.command.version !== pc.version) && (
                                            <p className="mt-2 text-[10px] text-yellow-400/70 font-mono">
                                                ⚠ Some commands are out of date. Use Add/Remove Commands to update.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Tags */}
                                {allTags.length > 0 && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3">Tags</label>
                                        <div className="flex flex-wrap gap-2">
                                            {allTags.map((tag, idx) => (
                                                <span 
                                                    key={idx}
                                                    className="px-2 py-1 rounded text-xs font-mono"
                                                    style={{ 
                                                        backgroundColor: `${tag.tagtype?.color || '#666'}20`,
                                                        borderColor: `${tag.tagtype?.color || '#666'}50`,
                                                        color: tag.tagtype?.color || '#888',
                                                        border: '1px solid'
                                                    }}
                                                >
                                                    {tag.tagtype?.name || 'Unknown'}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Build Message */}
                                {payload.build_message && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-2">Build Message / Stdout</label>
                                        <pre className="p-3 bg-black/50 rounded border border-ghost/10 text-sm text-gray-300 font-mono overflow-x-auto max-h-40 cyber-scrollbar">
                                            {payload.build_message}
                                        </pre>
                                    </div>
                                )}

                                {/* Build Errors */}
                                {payload.build_stderr && (
                                    <div className="bg-red-500/5 p-4 rounded border border-red-500/30">
                                        <label className="text-xs text-red-400 uppercase tracking-wider block mb-2">Build Errors</label>
                                        <pre className="p-3 bg-black/50 rounded border border-red-500/20 text-sm text-red-400 font-mono overflow-x-auto max-h-40 cyber-scrollbar">
                                            {payload.build_stderr}
                                        </pre>
                                    </div>
                                )}

                                {/* Build Steps */}
                                {payload.payload_build_steps && payload.payload_build_steps.length > 0 && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3">Build Steps</label>
                                        <div className="space-y-2">
                                            {payload.payload_build_steps.map((step) => (
                                                <div 
                                                    key={step.id}
                                                    className={cn(
                                                        "p-3 rounded border",
                                                        step.step_success === true ? "bg-matrix/5 border-matrix/20" :
                                                        step.step_success === false ? "bg-red-500/5 border-red-500/20" :
                                                        "bg-ghost/5 border-ghost/20"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-ghost bg-ghost/10 px-2 py-0.5 rounded">#{step.step_number}</span>
                                                            <span className="font-mono text-sm text-white">{step.step_name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {step.step_skip && <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">SKIPPED</span>}
                                                            {step.step_success === true && <CheckCircle size={16} className="text-matrix" />}
                                                            {step.step_success === false && <XCircle size={16} className="text-red-400" />}
                                                        </div>
                                                    </div>
                                                    {step.step_description && (
                                                        <p className="mt-1 text-[10px] text-gray-500 font-mono">{step.step_description}</p>
                                                    )}
                                                    {step.step_stdout && (
                                                        <pre className="mt-2 text-xs text-gray-400 overflow-x-auto bg-black/30 p-2 rounded">{step.step_stdout}</pre>
                                                    )}
                                                    {step.step_stderr && (
                                                        <pre className="mt-2 text-xs text-red-400 overflow-x-auto bg-red-500/5 p-2 rounded">{step.step_stderr}</pre>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Wrapped Payload + Eventing Origin */}
                                {(payload.wrapped_payload_id || payload.eventstepinstance) && (
                                    <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                        <label className="text-xs text-ghost uppercase tracking-wider block mb-3 flex items-center gap-2">
                                            <Link2 size={12} /> Origin
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            {payload.wrapped_payload_id && (
                                                <div className="flex flex-col gap-1 text-xs font-mono">
                                                    <span className="text-gray-500">Wraps Payload:</span>
                                                    <WrappedPayloadInfo payloadId={payload.wrapped_payload_id} />
                                                </div>
                                            )}
                                            {payload.eventstepinstance && (
                                                <div className="flex items-center gap-2 text-xs font-mono">
                                                    <span className="text-gray-500">Triggered by Event:</span>
                                                    <a
                                                        href={`/new/eventing?eventgroup=${payload.eventstepinstance.eventgroupinstance.eventgroup.id}&eventgroupinstance=${payload.eventstepinstance.eventgroupinstance.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-signal hover:text-signal/80 transition-colors"
                                                    >
                                                        <PlayCircle size={11} />
                                                        <span className="font-bold">{payload.eventstepinstance.eventgroupinstance.eventgroup.name}</span>
                                                        <span className="text-gray-500">/ {payload.eventstepinstance.eventstep.name}</span>
                                                        <ExternalLink size={9} className="text-ghost/50" />
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Metadata */}
                                <div className="bg-black/30 p-4 rounded border border-ghost/20">
                                    <label className="text-xs text-ghost uppercase tracking-wider block mb-3">Metadata</label>
                                    <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                                        <div>
                                            <span className="text-gray-500">Payload ID:</span>
                                            <span className="text-gray-300 ml-2">{payload.id}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Auto Generated:</span>
                                            <span className={cn("ml-2", payload.auto_generated ? "text-yellow-400" : "text-gray-300")}>
                                                {payload.auto_generated ? 'Yes' : 'No'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Deleted:</span>
                                            <span className={cn("ml-2", payload.deleted ? "text-red-400" : "text-gray-300")}>
                                                {payload.deleted ? 'Yes' : 'No'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Type Version:</span>
                                            <span className="text-gray-300 ml-2">{payload.payload_type_semver}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Footer */}
                            <div className="p-4 border-t border-ghost/30 flex justify-end shrink-0 bg-void">
                                <button
                                    onClick={() => setShowDetails(false)}
                                    className="px-6 py-2 bg-ghost/20 hover:bg-ghost/30 text-white rounded transition-colors font-mono"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
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
