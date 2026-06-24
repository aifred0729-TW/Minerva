import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber'
import { createPortal } from 'react-dom';
import { useMutation } from "@apollo/client/react";
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal,
    Info,
    X,
    Shield,
    Globe,
    Lock,
    Unlock,
    Eye,
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
import { Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { UPDATE_CALLBACK_DESCRIPTION_MUTATION, UPDATE_IPS_MUTATION } from '../../lib/api';
import type { TopoNode, TopoNodeData, TopoEdge, SubnetZone } from '../../types/topology';
import { extractPrimaryIP, getOSFullLabel, getPrivilegeLabel } from './topology';
import { extractAllIPs } from '../../lib/quickhacks';
import { CyberEnvironment, SmartOrbitControls, SubnetSystem, DataBeamEdge, NodeSphere, createSubnetRegistry } from './SceneObjects';

export const ContextMenu3D = ({
    x, y, node, onClose,
    onNavigateConsole, onLock, onHide,
    onViewDetails, onEditDescription, onEditCustomNode, onDeleteCustomNode,
    onSetLinkFocus, onClearLinkFocus, linkFocusNodeId,
    onSetParent, onDisconnectParent, getParentEdge,
    onTaskForEdge, onRemoveEdge, onAddP2PEdge, onEventing,
    onQuickHack,
    preferredDisplayId,
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
    /** Operator's per-node session pick (from the DetailPanel) — when set,
     *  "Interact (Console)" navigates to this display_id instead of the
     *  representative callback's. Null/undefined ⇒ use the representative
     *  (current behaviour). */
    preferredDisplayId?: number | null;
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
    const cb = node.data!;
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
                    {/* Interact (Console)
                     *  If the operator picked a specific session in the
                     *  DetailPanel (`preferredDisplayId`), navigate into
                     *  *that* session — otherwise fall back to the
                     *  representative callback on the node. */}
                    <button className={`${btnClass} text-cyan-400 font-semibold`}
                        onClick={() => {
                            const targetId = preferredDisplayId ?? cb.display_id ?? 0;
                            onNavigateConsole(targetId);
                            onClose();
                        }}>
                        <Terminal size={12} className="text-cyan-400" /> Interact (Console)
                        {preferredDisplayId != null && preferredDisplayId !== cb.display_id && (
                            <span className="ml-auto text-[10px] text-cyan-400/70 tabular-nums">→ C-{preferredDisplayId}</span>
                        )}
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
                        onClick={() => { onLock(cb.display_id ?? 0, !cb.locked); onClose(); }}>
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
                        onClick={() => { onHide(cb.display_id ?? 0); onClose(); }}>
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

/** Context menu shown on right-clicks over empty scene background.
 *  Provides global actions that aren't tied to any specific node. */
export const BackgroundContextMenu3D = ({
    x, y, onClose, onCreateCustomNode, onRefresh,
    onToggleSubnets, showSubnets,
    onToggleInactive, showInactive,
    onToggleHidden, showHidden,
    hiddenSubnetCount, onRestoreAllSubnets,
}: {
    x: number; y: number;
    onClose: () => void;
    onCreateCustomNode: () => void;
    onRefresh: () => void;
    onToggleSubnets: () => void;
    showSubnets: boolean;
    onToggleInactive: () => void;
    showInactive: boolean;
    onToggleHidden: () => void;
    showHidden: boolean;
    /** Per-CIDR hide tracking — when >0 we surface a one-shot restore
     *  entry so the operator can recover from "hide all the things"
     *  without remembering which network spaces they buried. */
    hiddenSubnetCount?: number;
    onRestoreAllSubnets?: () => void;
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
        if (y + rect.height > vh - pad) newTop = Math.max(pad, vh - rect.height - pad);
        if (x + rect.width > vw - pad) newLeft = Math.max(pad, vw - rect.width - pad);
        if (newTop !== adjustedPos.top || newLeft !== adjustedPos.left) {
            setAdjustedPos({ top: newTop, left: newLeft });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [x, y]);

    const btnClass = "w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors";
    const sepClass = "border-t border-white/10 my-1";

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] w-56 bg-[#0a0a0a]/95 backdrop-blur-md border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] py-1 font-mono text-xs overflow-visible pointer-events-auto"
            style={{ top: adjustedPos.top, left: adjustedPos.left }}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1">
                Topology Actions
            </div>

            <button className={`${btnClass} text-cyan-400 font-semibold`}
                onClick={() => { onCreateCustomNode(); onClose(); }}>
                <Plus size={12} className="text-cyan-400" /> New Custom Node
            </button>

            <button className={btnClass}
                onClick={() => { onRefresh(); onClose(); }}>
                <Crosshair size={12} className="text-gray-500" /> Refresh Topology
            </button>

            <div className={sepClass} />

            <button className={btnClass}
                onClick={() => { onToggleSubnets(); onClose(); }}>
                <Globe size={12} className={showSubnets ? 'text-emerald-400' : 'text-gray-500'} />
                <span>Subnet Zones</span>
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 border ${showSubnets ? 'border-emerald-500/30 text-emerald-400' : 'border-white/10 text-gray-600'}`}>
                    {showSubnets ? 'ON' : 'OFF'}
                </span>
            </button>

            {/* Per-CIDR restore entry — only rendered when at least one
                network space is individually hidden via the subnet
                context menu. Bulk-undo so the operator doesn't have to
                hunt for the volumes they hid. */}
            {hiddenSubnetCount != null && hiddenSubnetCount > 0 && onRestoreAllSubnets && (
                <button className={btnClass}
                    onClick={() => { onRestoreAllSubnets(); onClose(); }}>
                    <Eye size={12} className="text-emerald-400" />
                    <span>Restore Hidden Network Spaces</span>
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 border border-emerald-500/30 text-emerald-400">
                        {hiddenSubnetCount}
                    </span>
                </button>
            )}

            <button className={btnClass}
                onClick={() => { onToggleInactive(); onClose(); }}>
                <Info size={12} className={showInactive ? 'text-cyan-400' : 'text-gray-500'} />
                <span>Inactive Edges</span>
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 border ${showInactive ? 'border-cyan-500/30 text-cyan-400' : 'border-white/10 text-gray-600'}`}>
                    {showInactive ? 'ON' : 'OFF'}
                </span>
            </button>

            <button className={btnClass}
                onClick={() => { onToggleHidden(); onClose(); }}>
                <EyeOff size={12} className={showHidden ? 'text-cyan-400' : 'text-gray-500'} />
                <span>Hidden Callbacks</span>
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 border ${showHidden ? 'border-cyan-500/30 text-cyan-400' : 'border-white/10 text-gray-600'}`}>
                    {showHidden ? 'ON' : 'OFF'}
                </span>
            </button>
        </div>,
        document.body
    );
};

/**
 * Right-click menu for a network-space volume. Fired when the operator
 * right-clicks the translucent subnet zone in the 3D scene (the mesh inside
 * SubnetVolume forwards the event). Currently a single action — hide this
 * specific CIDR — but kept structurally identical to the other 3D context
 * menus so future per-zone tools (open in browser, copy CIDR to clipboard,
 * etc.) can slot in cleanly.
 */
export const SubnetContextMenu3D = ({
    x, y, cidr, onClose, onHide,
}: {
    x: number; y: number;
    cidr: string;
    onClose: () => void;
    onHide: (cidr: string) => void;
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
        if (y + rect.height > vh - pad) newTop = Math.max(pad, vh - rect.height - pad);
        if (x + rect.width > vw - pad)  newLeft = Math.max(pad, vw - rect.width - pad);
        if (newTop !== adjustedPos.top || newLeft !== adjustedPos.left) {
            setAdjustedPos({ top: newTop, left: newLeft });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [x, y]);

    const copyCidr = useCallback(() => {
        try { navigator.clipboard?.writeText?.(cidr); } catch { /* clipboard denied */ }
        snackActions.success(`Copied ${cidr}`);
        onClose();
    }, [cidr, onClose]);

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] w-60 bg-[#0a0a0a]/95 backdrop-blur-md border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.18)] py-1 font-mono text-xs overflow-visible pointer-events-auto"
            style={{ top: adjustedPos.top, left: adjustedPos.left }}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-emerald-400/80 uppercase tracking-widest border-b border-white/10 mb-1">
                <Globe size={11} className="text-emerald-400" />
                <span className="truncate">{cidr}</span>
            </div>

            <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-red-500/15 hover:text-red-300 transition-colors"
                onClick={() => { onHide(cidr); onClose(); }}
            >
                <EyeOff size={12} className="text-red-400" />
                Hide This Network Space
            </button>

            <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
                onClick={copyCidr}
            >
                <Crosshair size={12} className="text-gray-500" />
                Copy CIDR
            </button>
        </div>,
        document.body,
    );
};

/** Detail HUD panel for selected node — futuristic minimalist, with inline editing */
export const DetailPanel = ({
    node,
    onClose,
    onSessionPick,
    preferredDisplayId,
    edges,
}: {
    node: TopoNode | null;
    onClose: () => void;
    /** Bubble the operator's session pick up to the topology page so the
     *  context-menu "Interact (Console)" navigates to the picked session. */
    onSessionPick?: (nodeId: string, displayId: number) => void;
    /** Saved per-node pick from the page state. Used to seed the panel
     *  when reopening so the operator's pick survives close→reopen. */
    preferredDisplayId?: number | null;
    /** Raw GQL edges — fed to isCallbackAlive so TCP P2P orphans
     *  (P2P-only with no active peer) are flagged dead immediately. */
    edges?: any[] | null;
}) => {
    // Session selector — allow switching between callbacks on the same machine.
    //
    // The pick is keyed by `display_id` (stable identity), NOT by array
    // index. Earlier versions stored a local `selectedSessionIdx` and that
    // index silently re-bound to a different callback whenever the topology
    // re-sorted `allCallbacks` (alive-first / privilege / age tie-breaks
    // shuffle on every poll), which read to the operator as "my pick keeps
    // resetting". By deriving the index from `preferredDisplayId` on every
    // render we guarantee the picker stays nailed to the same callback
    // until the operator picks a different one — or the picked callback
    // disappears from the node entirely (killed / hidden), in which case
    // we fall back to slot 0.
    const [showSessionPicker, setShowSessionPicker] = useState(false);
    const sessions: TopoNodeData[] = node ? ((node.allCallbacks as TopoNodeData[] | undefined) ?? (node.data ? [node.data] : [])) : [];
    const selectedSessionIdx = useMemo(() => {
        if (!sessions.length) return 0;
        if (preferredDisplayId != null) {
            const idx = sessions.findIndex(s => s?.display_id === preferredDisplayId);
            if (idx >= 0) return idx;
        }
        return 0;
    }, [sessions, preferredDisplayId]);
    const cb: TopoNodeData | null = sessions[selectedSessionIdx] ?? node?.data ?? null;

    // Close the dropdown when switching to a different node.
    useEffect(() => {
        setShowSessionPicker(false);
    }, [node?.id]);

    // All IPs parsed from the focused callback. Used to compute the
    // "reordered" array when an operator picks a primary IP — Mythic stores
    // a list and uses the first element as primary, so reordering preserves
    // the rest of the focused callback's interfaces.
    const allIPs = useMemo(() => {
        if (!cb?.ip) return [];
        return extractAllIPs(cb.ip);
    }, [cb?.ip]);

    // Aggregated IP map: every interface ever reported by ANY callback on
    // this machine, mapped to the list of callback display_ids that
    // reported it. Lets the operator pick a primary from the full set of
    // interfaces observed across all sessions on the host (not just the
    // one currently focused). The "set as primary" action still applies to
    // the focused callback only — Mythic's IP field is per-callback.
    const aggregatedIPs = useMemo(() => {
        const map = new Map<string, number[]>();
        for (const s of sessions) {
            if (!s?.ip) continue;
            for (const ip of extractAllIPs(s.ip)) {
                const arr = map.get(ip) || [];
                if (typeof s.display_id === 'number' && !arr.includes(s.display_id)) arr.push(s.display_id);
                map.set(ip, arr);
            }
        }
        // Sort: IPv4 first, then IPv6; within each, lexical for stability.
        const isV4 = (s: string) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s);
        return [...map.entries()].sort((a, b) => {
            const av4 = isV4(a[0]); const bv4 = isV4(b[0]);
            if (av4 !== bv4) return av4 ? -1 : 1;
            return a[0].localeCompare(b[0]);
        });
    }, [sessions]);

    // Editable state
    const [editingDesc, setEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState('');
    const [showIPPicker, setShowIPPicker] = useState(false);

    const [updateDescription] = useMutation<any>(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [updateIPs] = useMutation<any>(UPDATE_IPS_MUTATION);

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

    // Aliveness drives the header status dot — accent green for live,
    // signal/red for dead/unknown. Per design language: no saturated
    // emerald, no opacity on text.
    const alive = isCallback && cb ? (cb.active !== false && isCallbackAlive(cb, edges)) : null;
    const priv = isCallback && cb ? getPrivilegeLabel(cb) : '';
    const privClass = priv === 'SYSTEM' || priv === 'root'
        ? 'text-red-500'
        : priv === 'Admin'
            ? 'text-amber-400'
            : 'text-signal';

    return (
        <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-4 top-20 w-[380px] z-50 bg-void/85 backdrop-blur-md border border-signal/20 rounded-md overflow-hidden"
            style={{ boxShadow: '0 0 24px rgba(0,0,0,0.55)' }}
        >
            {/* Header — label + agent chip + status dot + close */}
            <header className="flex items-start gap-3 px-4 py-3 border-b border-signal/15 bg-machine/40">
                <span
                    className={cn(
                        'mt-1.5 w-2 h-2 rounded-full shrink-0',
                        alive === true && 'bg-accent animate-pulse',
                        alive === false && 'bg-red-500',
                        alive === null && 'bg-signal/40',
                    )}
                />
                <div className="flex-1 min-w-0">
                    <div className="text-base font-bold tracking-[0.18em] text-signal truncate uppercase">
                        {node.label}
                    </div>
                    <div className="text-[10px] tracking-[0.25em] text-signal uppercase mt-0.5 truncate">
                        {isCallback && cb
                            ? <>{cb.payload?.payloadtype?.name || 'AGENT'} · #{cb.display_id}</>
                            : node.type === 'core'
                                ? 'MINERVA CORE'
                                : node.type.toUpperCase()}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-signal hover:text-red-500 transition-colors p-1 -m-1"
                    title="Close"
                >
                    <XCircle size={16} />
                </button>
            </header>

            {/* Status strip — alive + priv + pid in one compact row */}
            {isCallback && cb && (
                <div className="px-4 py-2 flex items-center gap-2 border-b border-signal/15 flex-wrap">
                    <span
                        className={cn(
                            'text-[10px] tracking-[0.2em] px-2 py-0.5 border rounded uppercase font-bold',
                            alive
                                ? 'text-accent border-accent/40 bg-accent/10'
                                : 'text-red-500 border-red-500/40 bg-red-500/10',
                        )}
                    >
                        {alive ? 'ALIVE' : 'DEAD'}
                    </span>
                    {priv && (
                        <span
                            className={cn(
                                'text-[10px] tracking-[0.15em] px-2 py-0.5 border rounded uppercase font-bold border-signal/30',
                                privClass,
                            )}
                        >
                            {priv}
                        </span>
                    )}
                    {typeof cb.pid === 'number' && cb.pid > 0 && (
                        <span className="text-[10px] tracking-[0.15em] text-signal ml-auto tabular-nums">
                            PID {cb.pid}
                        </span>
                    )}
                </div>
            )}

            {/* Body */}
            <div className="p-4 space-y-3 font-mono">
                {isCallback && cb && (
                    <>
                        {/* Session selector — only when host has >1 callback */}
                        {sessions.length > 1 && (
                            <div>
                                <div className="text-[10px] tracking-[0.25em] text-signal uppercase mb-2">
                                    Session
                                    <span className="ml-2 tabular-nums">{selectedSessionIdx + 1} / {sessions.length}</span>
                                </div>
                                <button
                                    onClick={() => setShowSessionPicker(!showSessionPicker)}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-signal/[0.04] border border-signal/20 hover:border-signal/40 transition-colors rounded-md"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        <Terminal size={12} className="text-signal shrink-0" />
                                        <span className="text-xs text-signal font-mono tabular-nums">C-{cb.display_id}</span>
                                        <span className="text-[10px] text-signal truncate">{cb.user || '—'}</span>
                                    </span>
                                    <ChevronDown size={12} className={cn('text-signal transition-transform shrink-0', showSessionPicker && 'rotate-180')} />
                                </button>
                                <AnimatePresence>
                                    {showSessionPicker && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="overflow-hidden mt-1"
                                        >
                                            <div className="border border-signal/15 bg-void/80 rounded-md max-h-48 overflow-y-auto cyber-scrollbar">
                                                {sessions.map((s: any, i: number) => {
                                                    const sAlive = s.active !== false && isCallbackAlive(s, edges);
                                                    const sPriv = getPrivilegeLabel(s);
                                                    const isFocused = i === selectedSessionIdx;
                                                    return (
                                                        <button
                                                            key={s.display_id}
                                                            onClick={() => {
                                                                setShowSessionPicker(false);
                                                                setEditingDesc(false);
                                                                setShowIPPicker(false);
                                                                // Lift the pick to the page —
                                                                // this is the *only* source of
                                                                // truth for which session is
                                                                // selected. The derived
                                                                // `selectedSessionIdx` above will
                                                                // re-resolve on the next render
                                                                // and stay locked to this
                                                                // display_id across data refreshes.
                                                                if (node && typeof s.display_id === 'number') {
                                                                    onSessionPick?.(node.id, s.display_id);
                                                                }
                                                            }}
                                                            className={cn(
                                                                'w-full px-3 py-2 text-left transition-colors flex items-center gap-2 text-xs',
                                                                isFocused
                                                                    ? 'bg-accent/10 border-l-2 border-accent text-signal'
                                                                    : 'hover:bg-signal/[0.04] border-l-2 border-transparent text-signal',
                                                            )}
                                                        >
                                                            <span className="text-signal font-mono tabular-nums w-12 shrink-0">C-{s.display_id}</span>
                                                            <span
                                                                className={cn(
                                                                    'text-[9px] tracking-[0.15em] px-1.5 py-0.5 border rounded shrink-0 uppercase',
                                                                    sAlive
                                                                        ? 'text-accent border-accent/40'
                                                                        : 'text-red-500 border-red-500/40',
                                                                )}
                                                            >
                                                                {sAlive ? 'ALIVE' : 'DEAD'}
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    'text-[10px] tracking-[0.12em] shrink-0 uppercase',
                                                                    sPriv === 'SYSTEM' || sPriv === 'root' ? 'text-red-500' :
                                                                        sPriv === 'Admin' ? 'text-amber-400' : 'text-signal',
                                                                )}
                                                            >
                                                                {sPriv || '—'}
                                                            </span>
                                                            <span className="text-[10px] text-signal truncate flex-1">{s.user || '—'}</span>
                                                            <span className="text-[9px] text-signal tracking-[0.15em] uppercase ml-auto shrink-0">
                                                                {s.payload?.payloadtype?.name || '—'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        <InfoRow label="HOST" value={cb.host || '—'} />
                        <InfoRow label="USER" value={cb.user || '—'} />

                        {/* IP — aggregated across every callback on this host */}
                        {(() => {
                            const focusedPrimary = extractPrimaryIP(cb.ip);
                            const canPick = aggregatedIPs.length > 1
                                || (aggregatedIPs.length === 1 && aggregatedIPs[0][0] !== focusedPrimary);
                            return (
                                <div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[10px] tracking-[0.25em] text-signal uppercase shrink-0">IP</span>
                                        <button
                                            onClick={() => canPick && setShowIPPicker(!showIPPicker)}
                                            className={cn(
                                                'text-xs text-signal text-right break-all flex items-center gap-1.5 min-w-0',
                                                canPick && 'hover:text-accent cursor-pointer',
                                            )}
                                            title={
                                                canPick
                                                    ? `${aggregatedIPs.length} interface${aggregatedIPs.length === 1 ? '' : 's'} across ${sessions.length} callback${sessions.length === 1 ? '' : 's'} — click to change primary`
                                                    : undefined
                                            }
                                        >
                                            <span className="break-all">{focusedPrimary || '—'}</span>
                                            {canPick && <ChevronDown size={10} className="text-signal shrink-0" />}
                                        </button>
                                    </div>
                                    <AnimatePresence>
                                        {showIPPicker && canPick && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden mt-2"
                                            >
                                                <div className="border border-signal/15 bg-void/80 rounded-md max-h-56 overflow-y-auto cyber-scrollbar">
                                                    <div className="px-3 py-1.5 text-[10px] tracking-[0.25em] text-signal uppercase border-b border-signal/15 flex items-center justify-between">
                                                        <span>Interfaces · {aggregatedIPs.length}</span>
                                                        <span className="tabular-nums">Set primary for C-{cb.display_id}</span>
                                                    </div>
                                                    {aggregatedIPs.map(([ip, reporterIds]) => {
                                                        const isPrimary = ip === focusedPrimary;
                                                        const focusedHasIt = allIPs.includes(ip);
                                                        return (
                                                            <button
                                                                key={ip}
                                                                onClick={() => handleSetPrimaryIP(ip)}
                                                                className={cn(
                                                                    'w-full px-3 py-1.5 text-xs text-left transition-colors border-l-2',
                                                                    isPrimary
                                                                        ? 'bg-accent/10 border-accent text-accent'
                                                                        : 'hover:bg-signal/[0.04] border-transparent text-signal',
                                                                )}
                                                                // Reporter callback ids are kept in the
                                                                // tooltip so they're still queryable, but
                                                                // not rendered in the row — with many
                                                                // callbacks the inline list squeezed the
                                                                // IP into a tight column.
                                                                title={focusedHasIt
                                                                    ? `Reported by C-${reporterIds.join(', C-')}`
                                                                    : `Reported only by C-${reporterIds.join(', C-')} — click to adopt this interface as C-${cb.display_id}'s primary`
                                                                }
                                                            >
                                                                <span className="break-all font-mono">{ip}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })()}

                        <InfoRow label="OS" value={getOSFullLabel(cb) || '—'} />
                        <InfoRow label="ARCH" value={cb.architecture || '—'} />
                        <InfoRow label="AGENT" value={cb.payload?.payloadtype?.name || '—'} />
                        <InfoRow label="PROC" value={cb.process_name || '—'} />
                        {node.subnet && <InfoRow label="SUBNET" value={node.subnet} valueClass="text-accent" />}

                        {/* DESC — inline editable */}
                        <div className="pt-2 border-t border-signal/15">
                            <div className="text-[10px] tracking-[0.25em] text-signal uppercase mb-1.5">Description</div>
                            {editingDesc ? (
                                <div className="space-y-2">
                                    <textarea
                                        autoFocus
                                        value={descDraft}
                                        onChange={e => setDescDraft(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveDesc(); }
                                            if (e.key === 'Escape') setEditingDesc(false);
                                        }}
                                        rows={2}
                                        className="w-full bg-void/80 border border-accent/40 rounded-md px-2 py-1.5 text-xs text-signal font-mono resize-none focus:outline-none focus:border-accent"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => setEditingDesc(false)}
                                            className="text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 text-signal border border-signal/30 hover:border-signal/60 rounded-md transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveDesc}
                                            className="text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 text-accent border border-accent/40 hover:bg-accent/10 rounded-md transition-colors"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setDescDraft(cb.description || ''); setEditingDesc(true); }}
                                    className="w-full text-left text-xs text-signal break-words hover:text-accent transition-colors"
                                    title="Click to edit description"
                                >
                                    {cb.description || <span className="text-signal italic opacity-60">Click to add a note…</span>}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {node.type === 'custom' && (
                    <>
                        <InfoRow label="HOST" value={cb?.hostname || node.label} />
                        <InfoRow label="IP" value={cb?.ip_address || '—'} />
                        <InfoRow label="OS" value={cb?.operating_system || '—'} />
                        <InfoRow label="C2" value={cb?.c2profile || '—'} />
                        {node.subnet && <InfoRow label="SUBNET" value={node.subnet} valueClass="text-accent" />}
                    </>
                )}

                {node.type === 'core' && (
                    <div className="text-signal text-center py-6 tracking-[0.25em] text-xs uppercase">
                        <Globe size={22} className="mx-auto mb-3 text-accent" strokeWidth={1.6} />
                        Minerva Core
                    </div>
                )}
            </div>
        </motion.div>
    );
};

/**
 * Two-column info row — label left (mono uppercase, wide tracking),
 * value right (mono, breakable). All text in pure `text-signal` per
 * the design language contrast rule; semantic accents (alive/dead/
 * elevated-priv) come through `valueClass` overrides at the call site.
 */
export const InfoRow = ({ label, value, valueClass }: {
    label: string;
    value: string;
    /** Optional accent override (e.g. text-accent for SUBNET). */
    valueClass?: string;
}) => (
    <div className="flex items-baseline justify-between gap-3 group">
        <span className="text-[10px] tracking-[0.25em] text-signal uppercase shrink-0">{label}</span>
        <span className={cn('text-xs text-right break-all font-mono', valueClass || 'text-signal')}>{value}</span>
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
            <StatBadge label="MACH" value={machines.length} color="text-emerald-400" />
            <div className="w-px h-3 bg-white/15" />
            <StatBadge label="CB" value={totalCbs} color="text-emerald-400" />
            <div className="w-px h-3 bg-white/15" />
            <StatBadge label="LIVE" value={alive} color="text-emerald-400" />
            <StatBadge label="DEAD" value={dead} color="text-red-400" />
            <div className="w-px h-3 bg-white/15" />
            <StatBadge label="CUST" value={custom} color="text-amber-400" />
            <StatBadge label="EDGE" value={edges.length} color="text-cyan-400" />
            <StatBadge label="NET" value={new Set(subnets.map(s => s.cidr)).size} color="text-green-400" />
        </div>
    );
};

export const StatBadge = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-signal tracking-[0.1em] font-bold">{label}</span>
        <span className={cn("font-bold tabular-nums", color)}>{value}</span>
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
    worldPos: Vector3;
    onProject: (screen: { x: number; y: number }) => void;
    worldOffset?: [number, number, number];
}) => {
    const { camera, gl } = useThree();
    const vec = useMemo(() => new Vector3(), []);
    const lastScreen = useRef({ x: 0, y: 0 });

    useFrame(() => {
        vec.copy(worldPos);
        if (worldOffset) vec.add(new Vector3(worldOffset[0], worldOffset[1], worldOffset[2]));
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

export const TopologyScene = React.memo(({
    nodes, edges, subnets,
    selectedId, onSelect, onContextMenu,
    dragNodeId, setDragNodeId, onDragMove, onDragEnd: onDragEndProp, showSubnets,
    pickingDimNodes,
    onSubnetContextMenu,
}: {
    nodes: TopoNode[];
    edges: TopoEdge[];
    subnets: SubnetZone[];
    selectedId: string | null;
    onSelect: (id: string, screenPos?: { x: number; y: number }) => void;
    onContextMenu: (e: ThreeEvent<MouseEvent>, id: string) => void;
    dragNodeId: string | null;
    setDragNodeId: (id: string | null) => void;
    onDragMove?: (id: string, pos: Vector3) => void;
    onDragEnd: (id: string, pos: Vector3) => void;
    showSubnets: boolean;
    pickingDimNodes?: Set<string> | null;
    /** Right-click on a subnet volume — passes the volume's CIDR so the
     *  page can pop a per-network-space context menu. */
    onSubnetContextMenu?: (e: ThreeEvent<MouseEvent>, cidr: string) => void;
}) => {
    const nodeMap = useMemo(() => {
        const m = new Map<string, TopoNode>();
        nodes.forEach(n => m.set(n.id, n));
        return m;
    }, [nodes]);

    // Shared subnet registry — SubnetSystem writes live AABBs + colour
    // assignments into it every frame; NodeSphere reads from it when
    // clamping drags so the operator can't push a node into a foreign
    // subnet's *current* (post-drag) bounds.
    const subnetRegistry = useMemo(() => createSubnetRegistry(), []);

    const handleDragStart = useCallback((id: string) => setDragNodeId(id), [setDragNodeId]);
    const handleDragEnd = useCallback((id: string, pos: Vector3) => {
        setDragNodeId(null);
        onDragEndProp(id, pos);
    }, [setDragNodeId, onDragEndProp]);

    return (
        <>
            <CyberEnvironment />
            <SmartOrbitControls dragActive={dragNodeId !== null} />

            {/* Subnet volumes — fused per cidr by SubnetSystem so a host
                with members across rows still shows as one volume, and
                overlapping cidrs get distinct colours via greedy
                assignment from the shared palette. */}
            {showSubnets && (
                <SubnetSystem
                    subnets={subnets}
                    nodes={nodes}
                    registry={subnetRegistry}
                    onContextMenu={onSubnetContextMenu}
                />
            )}

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
                        bundleIndex={edge.bundleIndex}
                        bundleCount={edge.bundleCount}
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
                    onDragMove={onDragMove}
                    onDragEnd={handleDragEnd}
                    pickingDim={pickingDimNodes ? (pickingDimNodes.has(node.id) ? 'dim' : 'brighten') : null}
                    subnetZones={showSubnets ? subnets : undefined}
                    subnetRegistry={showSubnets ? subnetRegistry : undefined}
                />
            ))}
        </>
    );
});

// ═══════════════════════════════════════════════
//  Page Component
// ═══════════════════════════════════════════════
