import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber'
import { createPortal } from 'react-dom';
import { useMutation } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal,
    Info,
    X,
    Shield,
    Globe,
    Lock,
    Unlock,
    EyeOff,
    Edit,
    Zap,
    ChevronDown,
    GitBranch,
    Link2,
    Crosshair,
    Trash2,
    Plus,
    XCircle,
}from 'lucide-react';
import { cn, isCallbackAlive } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { UPDATE_CALLBACK_DESCRIPTION_MUTATION, UPDATE_IPS_MUTATION } from '../../lib/api';
import type { TopoNode, TopoEdge, SubnetZone } from '../../types/topology';
import { extractPrimaryIP, getOSFullLabel, getPrivilegeLabel } from './topology';
import { extractAllIPs } from '../../lib/quickhacks';
import { CyberEnvironment, SmartOrbitControls, SubnetVolume, DataBeamEdge, NodeSphere } from './SceneObjects';

export const ContextMenu3D = ({
    x, y, node, onClose,
    onNavigateConsole, onLock, onHide,
    onViewDetails, onEditDescription, onEditCustomNode, onDeleteCustomNode,
    onSetLinkFocus, onClearLinkFocus, linkFocusNodeId,
    onSetParent, onDisconnectParent, getParentEdge,
    onTaskForEdge, onRemoveEdge, onAddP2PEdge, onEventing,
    onQuickHack,
}: {
    x: number; y: number; node: TopoNode;
    onClose: () => void;
    onNavigateConsole: (displayId: number) => void;
    onLock: (displayId: number, locked: boolean) => void;
    onHide: (displayId: number) => void;
    onViewDetails: (node: TopoNode) => void;
    onEditDescription: (node: TopoNode) => void;
    onEditCustomNode: (node: TopoNode) => void;
    onDeleteCustomNode: (node: TopoNode) => void;
    onSetLinkFocus: (nodeId: string, label: string) => void;
    onClearLinkFocus: () => void;
    linkFocusNodeId: string | null;
    onSetParent: (node: TopoNode) => void;
    onDisconnectParent: (node: TopoNode) => void;
    getParentEdge: (callbackId: number | string) => any;
    onTaskForEdge: (node: TopoNode) => void;
    onRemoveEdge: (node: TopoNode) => void;
    onAddP2PEdge: (node: TopoNode) => void;
    onEventing: (node: TopoNode) => void;
    onQuickHack: (node: TopoNode) => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [adjustedPos, setAdjustedPos] = useState<{ top: number; left: number }>({ top: y, left: x });

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    useEffect(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 8;
        let newTop = y;
        let newLeft = x;
        if (y + rect.height > vh - pad) {
            newTop = Math.max(pad, vh - rect.height - pad);
        }
        if (x + rect.width > vw - pad) {
            newLeft = Math.max(pad, vw - rect.width - pad);
        }
        if (newTop !== adjustedPos.top || newLeft !== adjustedPos.left) {
            setAdjustedPos({ top: newTop, left: newLeft });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [x, y]);

    const isCallback = node.type === 'callback';
    const isCustom = node.type === 'custom';
    const cb = node.data;
    const nodeIdForFocus = String(cb?.id ?? node.id);
    const isFocused = linkFocusNodeId === nodeIdForFocus;
    const hasParent = cb?.id != null && getParentEdge(cb.id);

    const menuStyle: React.CSSProperties = {
        top: adjustedPos.top,
        left: adjustedPos.left,
    };

    const btnClass = "w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors";
    const sepClass = "border-t border-white/10 my-1";

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] w-56 bg-[#0a0a0a]/95 backdrop-blur-md border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] py-1 font-mono text-xs overflow-visible pointer-events-auto"
            style={menuStyle}
            onMouseDown={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1 flex items-center justify-between">
                <span>{node.label} — {node.type.toUpperCase()}</span>
                {isCallback && cb?.locked && <Lock size={10} className="text-red-500" />}
            </div>

            {isCallback && (
                <>
                    {/* Interact (Console) */}
                    <button className={`${btnClass} text-cyan-400 font-semibold`}
                        onClick={() => { onNavigateConsole(cb.display_id); onClose(); }}>
                        <Terminal size={12} className="text-cyan-400" /> Interact (Console)
                    </button>
                    <div className={sepClass} />

                    {/* View Details */}
                    <button className={btnClass} onClick={() => onViewDetails(node)}>
                        <Info size={12} className="text-gray-500" /> View Details
                    </button>

                    {/* Edit Description */}
                    <button className={btnClass} onClick={() => onEditDescription(node)}>
                        <Edit size={12} className="text-gray-500" /> Edit Description
                    </button>

                    {/* Lock/Unlock */}
                    <button className={btnClass}
                        onClick={() => { onLock(cb.display_id, !cb.locked); onClose(); }}>
                        {cb.locked
                            ? <><Unlock size={12} className="text-yellow-400" /> Unlock Callback</>
                            : <><Lock size={12} className="text-red-400" /> Lock Callback</>}
                    </button>
                    <div className={sepClass} />

                    {/* Link Focus */}
                    {isFocused ? (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-400 hover:bg-amber-900/30 hover:text-amber-300 transition-colors"
                            onClick={() => { onClearLinkFocus(); onClose(); }}>
                            <Crosshair size={12} className="text-amber-400" /> Clear Link Focus
                        </button>
                    ) : (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-500/80 hover:bg-amber-900/20 hover:text-amber-400 transition-colors"
                            onClick={() => { onSetLinkFocus(nodeIdForFocus, cb.host || `#${cb.display_id}`); onClose(); }}>
                            <Crosshair size={12} className="text-amber-500/80" /> Set as Link Focus
                        </button>
                    )}

                    {/* Link to Parent */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                        onClick={() => onSetParent(node)}>
                        <GitBranch size={12} className="text-blue-500" /> Link to Parent
                    </button>

                    {/* Disconnect from Parent */}
                    {hasParent && (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors"
                            onClick={() => onDisconnectParent(node)}>
                            <X size={12} className="text-orange-500" /> Disconnect from Parent
                        </button>
                    )}
                    <div className={sepClass} />

                    {/* Hide Callback */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                        onClick={() => { onHide(cb.display_id); onClose(); }}>
                        <EyeOff size={12} className="text-red-500" /> Hide Callback
                    </button>
                    <div className={sepClass} />

                    {/* Task for Edge */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                        onClick={() => onTaskForEdge(node)}>
                        <Link2 size={12} className="text-blue-400" /> Task for Edge
                    </button>

                    {/* Remove Edge */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors"
                        onClick={() => onRemoveEdge(node)}>
                        <Trash2 size={12} className="text-orange-500" /> Remove Edge
                    </button>

                    {/* Add P2P Edge */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-cyan-400 hover:bg-cyan-900/30 hover:text-cyan-300 transition-colors"
                        onClick={() => onAddP2PEdge(node)}>
                        <Plus size={12} className="text-cyan-500" /> Add P2P Edge
                    </button>
                    <div className={sepClass} />

                    {/* Trigger Eventing */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-purple-400 hover:bg-purple-900/30 hover:text-purple-300 transition-colors"
                        onClick={() => onEventing(node)}>
                        <Zap size={12} className="text-purple-400" /> Trigger Eventing
                    </button>
                    <div className={sepClass} />

                    {/* ── QUICKHACK — opens floating panel near node ── */}
                    {node.alive ? (
                        <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#ff003c]/10"
                            style={{ color: '#ff003c' }}
                            onClick={() => { onQuickHack(node); onClose(); }}
                        >
                            <Shield size={12} style={{ color: '#ff003c' }} />
                            <span className="font-bold tracking-wider text-[11px]">QUICKHACK</span>
                        </button>
                    ) : (
                        <div
                            className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-not-allowed opacity-40"
                            style={{ color: '#666' }}
                            title="Target offline — quickhack unavailable"
                        >
                            <Shield size={12} style={{ color: '#666' }} />
                            <span className="font-bold tracking-wider text-[11px]">QUICKHACK</span>
                            <span className="ml-auto text-[9px] text-red-500/60">OFFLINE</span>
                        </div>
                    )}
                </>
            )}

            {isCustom && (
                <>
                    {/* Edit Custom Node */}
                    <button className={btnClass} onClick={() => onEditCustomNode(node)}>
                        <Edit size={12} className="text-gray-500" /> Edit Node
                    </button>
                    <div className={sepClass} />

                    {/* Link Focus */}
                    {isFocused ? (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-400 hover:bg-amber-900/30 hover:text-amber-300 transition-colors"
                            onClick={() => { onClearLinkFocus(); onClose(); }}>
                            <Crosshair size={12} className="text-amber-400" /> Clear Link Focus
                        </button>
                    ) : (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-500/80 hover:bg-amber-900/20 hover:text-amber-400 transition-colors"
                            onClick={() => { onSetLinkFocus(nodeIdForFocus, cb?.host || cb?.description || `Node ${cb?.display_id}`); onClose(); }}>
                            <Crosshair size={12} className="text-amber-500/80" /> Set as Link Focus
                        </button>
                    )}

                    {/* Link to Parent */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                        onClick={() => onSetParent(node)}>
                        <GitBranch size={12} className="text-blue-500" /> Link to Parent
                    </button>

                    {/* Disconnect from Parent */}
                    {hasParent && (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors"
                            onClick={() => onDisconnectParent(node)}>
                            <X size={12} className="text-orange-500" /> Disconnect from Parent
                        </button>
                    )}
                    <div className={sepClass} />

                    {/* Delete Custom Node */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                        onClick={() => onDeleteCustomNode(node)}>
                        <X size={12} className="text-red-500" /> Delete Node
                    </button>
                </>
            )}

            {node.type === 'core' && (
                <div className="px-3 py-2 text-gray-500 italic text-[10px]">Central Minerva hub</div>
            )}
        </div>,
        document.body
    );
};

/** Detail HUD panel for selected node — futuristic minimalist, with inline editing */
export const DetailPanel = ({ node, onClose }: { node: TopoNode | null; onClose: () => void }) => {
    // Session selector — allow switching between callbacks on the same machine
    const [selectedSessionIdx, setSelectedSessionIdx] = useState(0);
    const [showSessionPicker, setShowSessionPicker] = useState(false);
    const sessions = node ? (node.allCallbacks ?? (node.data ? [node.data] : [])) : [];
    const cb = sessions[selectedSessionIdx] ?? node?.data;

    // Reset session index when node changes
    useEffect(() => { setSelectedSessionIdx(0); setShowSessionPicker(false); }, [node?.id]);

    // All IPs parsed from the callback
    const allIPs = useMemo(() => {
        if (!cb?.ip) return [];
        return extractAllIPs(cb.ip);
    }, [cb?.ip]);

    // Editable state
    const [editingDesc, setEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState('');
    const [showIPPicker, setShowIPPicker] = useState(false);

    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [updateIPs] = useMutation(UPDATE_IPS_MUTATION);

    const handleSaveDesc = useCallback(async () => {
        if (!cb?.display_id) return;
        try {
            await updateDescription({ variables: { callback_display_id: cb.display_id, description: descDraft } });
            snackActions.success('Description updated');
        } catch { snackActions.error('Failed to update description'); }
        setEditingDesc(false);
    }, [cb?.display_id, descDraft, updateDescription]);

    const handleSetPrimaryIP = useCallback(async (ip: string) => {
        if (!cb?.display_id) return;
        const reordered = [ip, ...allIPs.filter(i => i !== ip)];
        try {
            await updateIPs({ variables: { callback_display_id: cb.display_id, ip: reordered } });
            snackActions.success(`Primary IP set to ${ip}`);
        } catch { snackActions.error('Failed to update IP'); }
        setShowIPPicker(false);
    }, [cb?.display_id, allIPs, updateIPs]);

    if (!node) return null;
    const isCallback = node.type === 'callback';
    const accentColor = `#${node.color.getHexString()}`;

    return (
        <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-4 top-20 w-80 z-50"
            style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.88) 0%, rgba(10,10,20,0.92) 100%)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: `0 0 1px ${accentColor}40, 0 0 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`,
                clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
            }}
        >
            {/* Top accent line */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }} />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}, 0 0 2px ${accentColor}` }}
                    />
                    <span className="font-mono text-sm font-semibold text-white/90 tracking-wide">{node.label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 tracking-[0.15em] uppercase"
                        style={{ color: `${accentColor}cc`, border: `1px solid ${accentColor}30` }}
                    >
                        {node.type}
                    </span>
                </div>
                <button onClick={onClose} className="text-gray-600 hover:text-white/60 transition-colors">
                    <XCircle size={14} />
                </button>
            </div>

            {/* Separator */}
            <div className="mx-4 h-px" style={{ background: `linear-gradient(90deg, ${accentColor}20, transparent)` }} />

            {/* Body */}
            <div className="p-4 space-y-2 text-xs font-mono">
                {isCallback && cb && (
                    <>
                        {/* Session selector — when multiple callbacks on same machine */}
                        {sessions.length > 1 && (
                            <div className="mb-2">
                                <button
                                    onClick={() => setShowSessionPicker(!showSessionPicker)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors rounded-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        <Terminal size={10} className="text-cyan-400 shrink-0" />
                                        <span className="text-[10px] text-white/90 font-mono">
                                            C-{cb.display_id}
                                        </span>
                                        <span className={cn(
                                            "text-[8px] px-1 py-px rounded font-mono",
                                            cb.active !== false && isCallbackAlive(cb) ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                        )}>
                                            {cb.active !== false && isCallbackAlive(cb) ? 'ALIVE' : 'DEAD'}
                                        </span>
                                        <span className={cn(
                                            "text-[8px] px-1 py-px rounded font-mono",
                                            getPrivilegeLabel(cb) === 'SYSTEM' || getPrivilegeLabel(cb) === 'root' ? "bg-red-500/15 text-red-400" :
                                            getPrivilegeLabel(cb) === 'Admin' ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-gray-500"
                                        )}>
                                            {getPrivilegeLabel(cb) || cb.user || '?'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-gray-500 font-mono">{selectedSessionIdx + 1}/{sessions.length}</span>
                                        <ChevronDown size={10} className={cn("text-gray-500 transition-transform", showSessionPicker && "rotate-180")} />
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {showSessionPicker && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="border border-white/10 border-t-0 bg-black/60 max-h-40 overflow-y-auto cyber-scrollbar">
                                                {sessions.map((s: any, i: number) => {
                                                    const sAlive = s.active !== false && isCallbackAlive(s);
                                                    const sPriv = getPrivilegeLabel(s);
                                                    return (
                                                        <button
                                                            key={s.display_id}
                                                            onClick={() => { setSelectedSessionIdx(i); setShowSessionPicker(false); setEditingDesc(false); setShowIPPicker(false); }}
                                                            className={cn(
                                                                "w-full px-2 py-1.5 text-left hover:bg-cyan-500/10 transition-colors flex items-center gap-2",
                                                                i === selectedSessionIdx ? "bg-cyan-500/10" : ""
                                                            )}
                                                        >
                                                            {i === selectedSessionIdx && <div className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />}
                                                            <span className="text-[10px] text-white/80 font-mono w-10 shrink-0">C-{s.display_id}</span>
                                                            <span className={cn(
                                                                "text-[8px] px-1 py-px rounded shrink-0",
                                                                sAlive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/15 text-red-400/60"
                                                            )}>
                                                                {sAlive ? 'ALIVE' : 'DEAD'}
                                                            </span>
                                                            <span className={cn(
                                                                "text-[8px] px-1 py-px rounded shrink-0",
                                                                sPriv === 'SYSTEM' || sPriv === 'root' ? "text-red-400" :
                                                                sPriv === 'Admin' ? "text-amber-400" : "text-gray-500"
                                                            )}>
                                                                {sPriv || '?'}
                                                            </span>
                                                            <span className="text-[9px] text-gray-600 font-mono truncate">{s.user || '?'}</span>
                                                            <span className="text-[9px] text-gray-700 font-mono ml-auto shrink-0">{s.payload?.payloadtype?.name || '?'}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        <InfoRow label="HOST" value={cb.host || '—'} accent={accentColor} />
                        <InfoRow label="USER" value={cb.user || '—'} accent={accentColor} />

                        {/* IP — clickable to show picker when multiple IPs */}
                        <div className="flex justify-between items-start gap-3 py-0.5 group">
                            <span className="text-[10px] tracking-[0.12em] text-gray-600 shrink-0 pt-px">IP</span>
                            <div className="text-right">
                                <button
                                    onClick={() => allIPs.length > 1 && setShowIPPicker(!showIPPicker)}
                                    className={cn(
                                        "text-[11px] text-right break-all text-white/90",
                                        allIPs.length > 1 && "hover:text-cyan-300 cursor-pointer"
                                    )}
                                    style={{ textShadow: `0 0 8px ${accentColor}40` }}
                                    title={allIPs.length > 1 ? 'Click to change primary IP' : undefined}
                                >
                                    {extractPrimaryIP(cb.ip) || '—'}
                                    {allIPs.length > 1 && (
                                        <ChevronDown size={10} className="inline ml-1 text-gray-500" />
                                    )}
                                </button>
                                <AnimatePresence>
                                    {showIPPicker && allIPs.length > 1 && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden mt-1"
                                        >
                                            <div className="border border-white/10 bg-black/60 py-0.5">
                                                {allIPs.map(ip => (
                                                    <button
                                                        key={ip}
                                                        onClick={() => handleSetPrimaryIP(ip)}
                                                        className={cn(
                                                            "w-full px-2 py-1 text-[10px] text-left hover:bg-cyan-500/10 transition-colors flex items-center gap-1.5",
                                                            ip === extractPrimaryIP(cb.ip) ? "text-cyan-400" : "text-gray-400"
                                                        )}
                                                    >
                                                        {ip === extractPrimaryIP(cb.ip) && <div className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />}
                                                        {ip}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <InfoRow label="OS" value={getOSFullLabel(cb) || '—'} accent={accentColor} />
                        <InfoRow label="ARCH" value={cb.architecture || '—'} accent={accentColor} />
                        <InfoRow label="AGENT" value={cb.payload?.payloadtype?.name || '—'} accent={accentColor} />
                        <InfoRow label="PRIV" value={getPrivilegeLabel(cb) || '—'} accent={accentColor} valueClass={
                            getPrivilegeLabel(cb) === 'SYSTEM' || getPrivilegeLabel(cb) === 'root' ? 'text-red-400' :
                            getPrivilegeLabel(cb) === 'Admin' ? 'text-amber-400' : undefined
                        } />
                        <InfoRow label="PID" value={String(cb.pid ?? '—')} accent={accentColor} />
                        <InfoRow label="PROC" value={cb.process_name || '—'} accent={accentColor} />
                        <div className="pt-1">
                            <InfoRow label="STATUS"
                                value={cb.active !== false && isCallbackAlive(cb) ? 'ALIVE' : 'DEAD'}
                                accent={accentColor}
                                valueClass={cb.active !== false && isCallbackAlive(cb) ? 'text-emerald-400' : 'text-red-400'}
                            />
                        </div>

                        {/* DESC — inline editable */}
                        <div className="flex justify-between items-start gap-3 py-0.5 group">
                            <span className="text-[10px] tracking-[0.12em] text-gray-600 shrink-0 pt-px">DESC</span>
                            <div className="flex-1 min-w-0 text-right">
                                {editingDesc ? (
                                    <div className="flex flex-col items-end gap-1">
                                        <textarea
                                            autoFocus
                                            value={descDraft}
                                            onChange={e => setDescDraft(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveDesc(); } if (e.key === 'Escape') setEditingDesc(false); }}
                                            rows={2}
                                            className="w-full bg-black/60 border border-cyan-500/30 px-2 py-1 text-[10px] text-white font-mono resize-none focus:outline-none focus:border-cyan-500/60"
                                        />
                                        <div className="flex gap-1">
                                            <button onClick={() => setEditingDesc(false)} className="text-[8px] px-1.5 py-0.5 text-gray-500 hover:text-white border border-white/10 hover:border-white/30 transition-colors">ESC</button>
                                            <button onClick={handleSaveDesc} className="text-[8px] px-1.5 py-0.5 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors">SAVE</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setDescDraft(cb.description || ''); setEditingDesc(true); }}
                                        className="text-[11px] text-gray-400 text-right break-all hover:text-cyan-300 cursor-pointer transition-colors"
                                        title="Click to edit description"
                                    >
                                        {cb.description || <span className="text-gray-600 italic">click to add</span>}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
                {node.type === 'custom' && (
                    <>
                        <InfoRow label="HOST" value={cb?.hostname || node.label} accent={accentColor} />
                        <InfoRow label="IP" value={cb?.ip_address || '—'} accent={accentColor} highlight />
                        <InfoRow label="OS" value={cb?.operating_system || '—'} accent={accentColor} />
                        <InfoRow label="C2" value={cb?.c2profile || '—'} accent={accentColor} />
                    </>
                )}
                {node.type === 'core' && (
                    <div className="text-gray-600 text-center py-4 tracking-widest text-[10px]">
                        <Globe size={20} className="mx-auto mb-2 text-cyan-500/60" />
                        MINERVA CORE
                    </div>
                )}
                {node.subnet && (
                    <InfoRow label="SUBNET" value={node.subnet} accent={accentColor} valueClass="text-green-400/80" />
                )}
            </div>

            {/* Bottom accent line */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)` }} />
        </motion.div>
    );
};

export const InfoRow = ({ label, value, accent, valueClass, highlight }: {
    label: string; value: string; accent?: string; valueClass?: string; highlight?: boolean;
}) => (
    <div className="flex justify-between items-start gap-3 py-0.5 group">
        <span className="text-[10px] tracking-[0.12em] text-gray-600 shrink-0 pt-px">{label}</span>
        <span className={cn(
            "text-right break-all text-[11px]",
            valueClass || (highlight ? 'text-white/90' : 'text-gray-400'),
        )}
        style={highlight ? { textShadow: `0 0 8px ${accent || '#fff'}40` } : undefined}
        >{value}</span>
    </div>
);

/** Stats HUD bar — bottom left, futuristic minimal */
export const StatsHUD = ({ nodes, edges, subnets }: { nodes: TopoNode[]; edges: TopoEdge[]; subnets: SubnetZone[] }) => {
    const machines = nodes.filter(n => n.type === 'callback');
    const totalCbs = machines.reduce((s, n) => s + (n.callbackCount || 1), 0);
    const alive = machines.filter(n => n.alive).length;
    const dead  = machines.length - alive;
    const custom = nodes.filter(n => n.type === 'custom').length;

    return (
        <div
            className="absolute bottom-4 left-4 z-40 flex items-center gap-5 px-5 py-2.5 font-mono text-[10px]"
            style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(5,5,15,0.88) 100%)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 0 1px rgba(34,211,238,0.15), 0 0 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            }}
        >
            <StatBadge label="MACH" value={machines.length} color="text-emerald-400/80" />
            <div className="w-px h-3 bg-white/5" />
            <StatBadge label="CB" value={totalCbs} color="text-emerald-400/80" />
            <div className="w-px h-3 bg-white/5" />
            <StatBadge label="LIVE" value={alive} color="text-emerald-400/80" />
            <StatBadge label="DEAD" value={dead} color="text-red-400/70" />
            <div className="w-px h-3 bg-white/5" />
            <StatBadge label="CUST" value={custom} color="text-amber-400/70" />
            <StatBadge label="EDGE" value={edges.length} color="text-cyan-400/70" />
            <StatBadge label="NET" value={subnets.length} color="text-green-400/70" />
        </div>
    );
};

export const StatBadge = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-gray-700 tracking-[0.1em]">{label}</span>
        <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    </div>
);

// ═══════════════════════════════════════════════
//  Scene Compositor — wires data → 3D objects
// ═══════════════════════════════════════════════
/** Runs inside Canvas — projects a 3D world position to screen coords every frame */
/** Runs inside Canvas — projects a 3D world position to screen coords, throttled */
export const ScreenProjector = ({
    worldPos,
    onProject,
    worldOffset,
}: {
    worldPos: THREE.Vector3;
    onProject: (screen: { x: number; y: number }) => void;
    worldOffset?: [number, number, number];
}) => {
    const { camera, gl } = useThree();
    const vec = useMemo(() => new THREE.Vector3(), []);
    const lastScreen = useRef({ x: 0, y: 0 });

    useFrame(() => {
        vec.copy(worldPos);
        if (worldOffset) vec.add(new THREE.Vector3(worldOffset[0], worldOffset[1], worldOffset[2]));
        vec.project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const x = (vec.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-vec.y * 0.5 + 0.5) * rect.height + rect.top;
        // Only update state if position changed meaningfully (>1px)
        if (Math.abs(x - lastScreen.current.x) > 1 || Math.abs(y - lastScreen.current.y) > 1) {
            lastScreen.current = { x, y };
            onProject({ x, y });
        }
    });

    return null;
};

export const TopologyScene = ({
    nodes, edges, subnets,
    selectedId, onSelect, onContextMenu,
    dragNodeId, setDragNodeId, onDragEnd: onDragEndProp, showSubnets,
    pickingDimNodes,
}: {
    nodes: TopoNode[];
    edges: TopoEdge[];
    subnets: SubnetZone[];
    selectedId: string | null;
    onSelect: (id: string, screenPos?: { x: number; y: number }) => void;
    onContextMenu: (e: ThreeEvent<MouseEvent>, id: string) => void;
    dragNodeId: string | null;
    setDragNodeId: (id: string | null) => void;
    onDragEnd: (id: string, pos: THREE.Vector3) => void;
    showSubnets: boolean;
    pickingDimNodes?: Set<string> | null;
}) => {
    const nodeMap = useMemo(() => {
        const m = new Map<string, TopoNode>();
        nodes.forEach(n => m.set(n.id, n));
        return m;
    }, [nodes]);

    const handleDragStart = useCallback((id: string) => setDragNodeId(id), [setDragNodeId]);
    const handleDragEnd = useCallback((id: string, pos: THREE.Vector3) => {
        setDragNodeId(null);
        onDragEndProp(id, pos);
    }, [setDragNodeId, onDragEndProp]);

    return (
        <>
            <CyberEnvironment />
            <SmartOrbitControls dragActive={dragNodeId !== null} />

            {/* Subnet volumes (render first → behind nodes) */}
            {showSubnets && subnets.map(zone => (
                <SubnetVolume key={zone.cidr} zone={zone} />
            ))}

            {/* Edges */}
            {edges.map(edge => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;
                return (
                    <DataBeamEdge
                        key={edge.id}
                        sourcePos={src.position}
                        targetPos={tgt.position}
                        color={edge.color}
                        isP2P={edge.isP2P}
                        label={edge.label}
                    />
                );
            })}

            {/* Nodes */}
            {nodes.map(node => (
                <NodeSphere
                    key={node.id}
                    node={node}
                    isSelected={selectedId === node.id}
                    onSelect={onSelect}
                    onContextMenu={onContextMenu}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    pickingDim={pickingDimNodes ? (pickingDimNodes.has(node.id) ? 'dim' : 'brighten') : null}
                    subnetZones={showSubnets ? subnets : undefined}
                />
            ))}
        </>
    );
};

// ═══════════════════════════════════════════════
//  Page Component
// ═══════════════════════════════════════════════
