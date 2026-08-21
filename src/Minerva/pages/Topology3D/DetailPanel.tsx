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
    RotateCw,
    Copy,
    Cpu,
    ShieldOff,
    Flame,
    KeyRound,
}from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
    useAnchoredPanel as useAnchoredMenu,
    PanelShell as MenuPanel,
    PanelGroup as MenuGroup,
    PanelRow as MenuRow,
    PanelReadout as MenuReadout,
    PanelPrimary as MenuPrimary,
} from '../../components/CyberPanel';
import { cn, isCallbackAlive } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { UPDATE_CALLBACK_DESCRIPTION_MUTATION, UPDATE_IPS_MUTATION } from '../../lib/api';
import type { TopoNode, TopoNodeData, TopoEdge, SubnetZone } from '../../types/topology';
import { extractPrimaryIP, getOSFullLabel, getPrivilege } from './topology';
import { extractAllIPs } from '../../lib/quickhacks';
import { cycleDefense, hostKeyOf, useHostDefense } from './defenseMarks';
import { MatrixRow, markState, type MatrixState } from './defenseMatrix';
import { CyberEnvironment, SmartOrbitControls, SubnetSystem, DataBeamEdge, NodeSphere, createSubnetRegistry } from './SceneObjects';

/* =============================================================================
   3D CONTEXT MENUS
   -----------------------------------------------------------------------------
   Node, scene-background and subnet right-click menus. The panel language —
   glass shell, framed rows, state chips, targeting bar, roving focus — lives
   in `components/CyberPanel`, shared with LINK_TO_PARENT and the QuickHack
   stack so all three floating surfaces stay one instrument.
============================================================================= */

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
    /** Hides the whole machine — every session on it, not just the
     *  representative one (see handleHideNode). */
    onHide: (node: TopoNode) => void;
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
    const { ref, pos, onKeyDown } = useAnchoredMenu(x, y, onClose);

    const isCallback = node.type === 'callback';
    const isCustom = node.type === 'custom';
    const cb = node.data!;
    const nodeIdForFocus = String(cb?.id ?? node.id);
    const isFocused = linkFocusNodeId === nodeIdForFocus;
    const hasParent = cb?.id != null && !!getParentEdge(cb.id);
    // A topology node is a MACHINE, so "hide node" has to account for every
    // session living on it — hiding only the representative left the node on
    // screen, which read as the action doing nothing.
    const sessionCount = (node.allCallbacks?.length ?? (node.data ? 1 : 0));

    // One derived state feeds the header icon, the badge and its tone, so the
    // panel can never read "ALIVE" in one place and "LOCKED" in another.
    const headerBadge = cb?.locked ? 'LOCKED' : node.type === 'core' ? 'HUB' : isCustom ? 'CUSTOM' : node.alive ? 'ALIVE' : 'DEAD';
    const headerTone = cb?.locked ? 'text-red-400' : node.type === 'core' ? 'text-accent' : isCustom ? 'text-signal opacity-70' : node.alive ? 'text-accent' : 'text-red-400';
    const headerIcon = node.type === 'core' ? Cpu : isCustom ? Edit : Terminal;
    const primaryIp = extractPrimaryIP(cb?.ip) || '';

    const focusRow = (
        <MenuRow
            icon={Crosshair}
            label="LINK FOCUS"
            status={isFocused ? 'ON' : undefined}
            tone={isFocused ? 'active' : 'default'}
            checked={isFocused}
            onClick={() => {
                if (isFocused) onClearLinkFocus();
                else onSetLinkFocus(nodeIdForFocus, cb?.host || cb?.description || `#${cb?.display_id ?? node.label}`);
                onClose();
            }}
        />
    );

    const parentRows = (
        <>
            <MenuRow icon={GitBranch} label="PARENT LINK" onClick={() => onSetParent(node)} />
            {hasParent && (
                <MenuRow icon={X} label="PARENT CUT" tone="danger" onClick={() => onDisconnectParent(node)} />
            )}
        </>
    );

    return createPortal(
        <MenuPanel
            innerRef={ref}
            pos={pos}
            onKeyDown={onKeyDown}
            width={272}
            icon={headerIcon}
            iconTone={headerTone}
            title={node.label}
            badge={headerBadge}
            badgeTone={headerTone}
            footerLeft={isCallback ? (primaryIp || getOSFullLabel(cb) || 'CALLBACK') : isCustom ? 'CUSTOM NODE' : 'MINERVA CORE'}
            footerRight={isCallback && cb?.display_id != null ? `C-${cb.display_id}` : undefined}
        >
            {isCallback && (
                <>
                    {/* Interact (Console)
                     *  If the operator picked a specific session in the
                     *  DetailPanel (`preferredDisplayId`), navigate into
                     *  *that* session — otherwise fall back to the
                     *  representative callback on the node. */}
                    <MenuPrimary
                        icon={Terminal}
                        label="INTERACT"
                        hint={preferredDisplayId != null && preferredDisplayId !== cb.display_id ? `C-${preferredDisplayId}` : undefined}
                        onClick={() => {
                            const targetId = preferredDisplayId ?? cb.display_id ?? 0;
                            onNavigateConsole(targetId);
                            onClose();
                        }}
                    />

                    <MenuGroup label="SESSION">
                        <MenuRow icon={Info} label="VIEW DETAILS" onClick={() => onViewDetails(node)} />
                        <MenuRow icon={Edit} label="DESCRIPTION" onClick={() => onEditDescription(node)} />
                        <MenuRow
                            icon={cb?.locked ? Unlock : Lock}
                            label="CALLBACK LOCK"
                            status={cb?.locked ? 'LOCKED' : 'OPEN'}
                            tone={cb?.locked ? 'danger' : 'default'}
                            checked={!!cb?.locked}
                            onClick={() => { onLock(cb.display_id ?? 0, !cb.locked); onClose(); }}
                        />
                        <MenuRow
                            icon={EyeOff}
                            label="HIDE NODE"
                            status={sessionCount > 1 ? `${sessionCount}` : undefined}
                            title={
                                sessionCount > 1
                                    ? `Hides all ${sessionCount} sessions on this machine — restore from the scene menu's HIDDEN NODES layer`
                                    : "Reversible — restore from the scene menu's HIDDEN NODES layer"
                            }
                            onClick={() => { onHide(node); onClose(); }}
                        />
                    </MenuGroup>

                    <MenuGroup label="LINK">
                        {focusRow}
                        {parentRows}
                    </MenuGroup>

                    <MenuGroup label="EDGE">
                        <MenuRow icon={Link2} label="EDGE TASK" onClick={() => onTaskForEdge(node)} />
                        <MenuRow icon={Plus} label="P2P EDGE" onClick={() => onAddP2PEdge(node)} />
                        <MenuRow icon={Trash2} label="EDGE REMOVE" tone="danger" onClick={() => onRemoveEdge(node)} />
                    </MenuGroup>

                    <MenuGroup label="OPS">
                        <MenuRow icon={Zap} label="EVENTING" onClick={() => onEventing(node)} />
                        {/* QUICKHACK — opens the floating panel near the node */}
                        <MenuRow
                            icon={Shield}
                            label="QUICKHACK"
                            status={node.alive ? 'ARMED' : 'OFFLINE'}
                            tone="danger"
                            disabled={!node.alive}
                            title={node.alive ? undefined : 'Target offline — quickhack unavailable'}
                            onClick={() => { onQuickHack(node); onClose(); }}
                        />
                    </MenuGroup>
                </>
            )}

            {isCustom && (
                <>
                    <MenuPrimary icon={Edit} label="EDIT NODE" onClick={() => onEditCustomNode(node)} />

                    <MenuGroup label="LINK">
                        {focusRow}
                        {parentRows}
                    </MenuGroup>

                    <MenuGroup label="NODE">
                        {/* The only irreversible row in these menus — it deletes
                            straight through to agentstorage, so it arms first. */}
                        <MenuRow
                            icon={XCircle}
                            label="DELETE NODE"
                            tone="danger"
                            confirmLabel="CONFIRM WIPE"
                            confirmStatus="AGAIN"
                            onClick={() => onDeleteCustomNode(node)}
                        />
                    </MenuGroup>
                </>
            )}

            {node.type === 'core' && (
                <>
                    <MenuReadout label="ROLE" value="HUB" />
                    <MenuReadout label="STATE" value="ONLINE" valueTone="text-accent" />
                </>
            )}
        </MenuPanel>,
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
    hiddenSubnets, onRestoreSubnet, onRestoreAllSubnets,
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
    /** Network spaces the operator has hidden. Persisted across reloads, so
     *  this menu is the only way back — it lists them by CIDR so a space can
     *  be restored individually, plus a bulk undo for "hide all the things". */
    hiddenSubnets?: string[];
    onRestoreSubnet?: (cidr: string) => void;
    onRestoreAllSubnets?: () => void;
}) => {
    const { ref, pos, onKeyDown } = useAnchoredMenu(x, y, onClose);
    const layersOn = [showSubnets, showInactive, showHidden].filter(Boolean).length;
    const hidden = hiddenSubnets ?? [];

    /** Toggle rows borrow the checklist's ON / PENDING tones so the whole
     *  layer stack reads down the right edge in one glance. */
    const toggle = (icon: LucideIcon, label: string, on: boolean, fn: () => void) => (
        <MenuRow
            icon={icon}
            label={label}
            status={on ? 'ON' : 'OFF'}
            tone={on ? 'active' : 'default'}
            statusTone={on ? 'active' : 'muted'}
            checked={on}
            onClick={() => { fn(); onClose(); }}
        />
    );

    return createPortal(
        <MenuPanel
            innerRef={ref}
            pos={pos}
            onKeyDown={onKeyDown}
            width={268}
            icon={Crosshair}
            title="TOPOLOGY"
            badge="SCENE"
            footerLeft={hidden.length > 0 ? `${hidden.length} SPACE${hidden.length > 1 ? 'S' : ''} HIDDEN` : 'SCENE CONTROL'}
            footerRight={`${layersOn} / 3 ON`}
        >
            <MenuPrimary icon={Plus} label="NEW NODE" onClick={() => { onCreateCustomNode(); onClose(); }} />

            <MenuGroup label="SCENE">
                <MenuRow icon={RotateCw} label="REFRESH" onClick={() => { onRefresh(); onClose(); }} />
            </MenuGroup>

            <MenuGroup label="LAYERS">
                {toggle(Globe, 'SUBNET ZONES', showSubnets, onToggleSubnets)}
                {toggle(Link2, 'INACTIVE EDGES', showInactive, onToggleInactive)}
                {toggle(EyeOff, 'HIDDEN NODES', showHidden, onToggleHidden)}
            </MenuGroup>

            {/* Hidden network spaces — the way back. The hide list survives
                reloads, so without this group a buried CIDR would be gone for
                good. Each row restores one space; the last row restores the
                lot. Rows stay listed even when the CIDR is absent from the
                current scene, because it reappears the moment a callback in
                that space checks in again. */}
            {hidden.length > 0 && (
                <MenuGroup label="HIDDEN SPACES" count={hidden.length}>
                    {hidden.map(cidr => (
                        <MenuRow
                            key={cidr}
                            icon={Eye}
                            label={cidr}
                            status="SHOW"
                            tone="active"
                            title={`Restore ${cidr}`}
                            onClick={() => { onRestoreSubnet?.(cidr); onClose(); }}
                        />
                    ))}
                    {hidden.length > 1 && onRestoreAllSubnets && (
                        <MenuRow
                            icon={Eye}
                            label="RESTORE ALL"
                            status={String(hidden.length)}
                            onClick={() => { onRestoreAllSubnets(); onClose(); }}
                        />
                    )}
                </MenuGroup>
            )}
        </MenuPanel>,
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
    const { ref, pos, onKeyDown } = useAnchoredMenu(x, y, onClose);

    const copyCidr = useCallback(() => {
        try { navigator.clipboard?.writeText?.(cidr); } catch { /* clipboard denied */ }
        snackActions.success(`Copied ${cidr}`);
        onClose();
    }, [cidr, onClose]);

    const mask = cidr.includes('/') ? `/${cidr.split('/')[1]}` : '';

    return createPortal(
        <MenuPanel
            innerRef={ref}
            pos={pos}
            onKeyDown={onKeyDown}
            width={256}
            icon={Globe}
            title={cidr}
            badge="SUBNET"
            footerLeft="NETWORK SPACE"
            footerRight={mask || undefined}
        >
            <MenuGroup label="SPACE">
                <MenuRow icon={Copy} label="COPY CIDR" onClick={copyCidr} />
                <MenuRow
                    icon={EyeOff}
                    label="HIDE SPACE"
                    title="Reversible — restore from the scene menu's HIDDEN SPACES group"
                    onClick={() => { onHide(cidr); onClose(); }}
                />
            </MenuGroup>
        </MenuPanel>,
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

    // ── Defence matrix state ───────────────────────────────────────────
    // AV/EDR and firewall are operator marks (Mythic reports neither);
    // privilege is derived live so it can never go stale. Read above the
    // `!node` guard — hooks cannot sit behind an early return.
    const hostKey = hostKeyOf(cb?.host || node?.label);
    const defense = useHostDefense(hostKey);

    if (!node) return null;
    const isCallback = node.type === 'callback';

    // Aliveness drives the header status dot — accent green for live,
    // signal/red for dead/unknown. Per design language: no saturated
    // emerald, no opacity on text.
    const alive = isCallback && cb ? (cb.active !== false && isCallbackAlive(cb, edges)) : null;
    const privInfo = isCallback && cb ? getPrivilege(cb) : { label: '', tier: 'unknown' as const, unix: false };
    const priv = privInfo.label;

    const privState: MatrixState =
        privInfo.tier === 'max' ? 'won'
        : privInfo.tier === 'elevated' || privInfo.tier === 'unknown' ? 'unknown'
        : 'lost';
    const wonCount = [markState(defense.av), markState(defense.fw), privState].filter(v => v === 'won').length;
    const privClass = privInfo.tier === 'max'
        ? 'text-red-500'
        : privInfo.tier === 'elevated'
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
            {/* Header — a filled, inverted strip in the netrunner-console idiom:
                the machine's name reads as a plate, the fill carries liveness,
                and the machine-readable meta sits on the right at readout size. */}
            <header className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                alive === false ? 'bg-red-400 text-void' : alive === true ? 'bg-accent text-void' : 'bg-signal text-void',
            )}>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold uppercase tracking-[0.2em]">
                        {node.label}
                    </div>
                </div>
                <div className="hidden sm:block shrink-0 text-right text-[10px] font-bold leading-[1.35] tracking-[0.12em] tabular-nums text-void/80">
                    <div>{isCallback && cb ? `C-${cb.display_id}` : node.type.toUpperCase()}</div>
                    <div>{alive === false ? 'LINK DOWN' : alive === true ? 'LINK LIVE' : 'NO LINK'}</div>
                </div>
                <button
                    onClick={onClose}
                    className="shrink-0 rounded-sm border border-void/40 p-1 text-void transition-colors hover:bg-void/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-void"
                    title="Close"
                    aria-label="Close"
                >
                    <XCircle size={13} strokeWidth={2} aria-hidden="true" />
                </button>
            </header>

            {/* Meta line — the reference's PAGE TYPE / LOAD ADDRESS block, but
                carrying facts the operator can act on. */}
            <div className="flex items-center gap-2 border-b border-signal/15 px-4 py-1.5 text-[10px] tracking-[0.12em] text-signal opacity-70">
                <span className="truncate">
                    {isCallback && cb
                        ? [cb.payload?.payloadtype?.name?.toUpperCase() || 'AGENT', getOSFullLabel(cb).toUpperCase(), cb.architecture?.toUpperCase()].filter(Boolean).join(' · ')
                        : node.type === 'core' ? 'MINERVA CORE' : 'CUSTOM NODE'}
                </span>
                <span aria-hidden="true" className="flex-1" />
                {isCallback && cb?.pid != null && <span className="shrink-0 tabular-nums">PID {cb.pid}</span>}
            </div>

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
                                                    const sPrivInfo = getPrivilege(s);
                                                    const sPriv = sPrivInfo.label;
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
                                                                    sPrivInfo.tier === 'max' ? 'text-red-500' :
                                                                        sPrivInfo.tier === 'elevated' ? 'text-amber-400' : 'text-signal',
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

            {/* DEFENCE MATRIX — pinned to the bottom of the panel, the last
                thing read before a decision: is anything still watching, is
                anything still blocking, and do we own the box. */}
            {isCallback && cb && (
                <div className="border-t border-signal/15 px-3 pb-3 pt-2">
                    <div className="mb-1.5 flex items-center gap-2.5 px-1">
                        <span className="shrink-0 text-[10px] font-bold tracking-[0.25em] text-signal opacity-70">
                            {'//DEFENCE_MATRIX'}
                        </span>
                        <span aria-hidden="true" className="h-px flex-1 bg-signal/15" />
                        <span className="shrink-0 text-[10px] font-bold tabular-nums tracking-[0.15em] text-signal opacity-70">
                            {wonCount} / 3
                        </span>
                    </div>
                    <div className="space-y-1">
                        <MatrixRow
                            state={markState(defense.av)}
                            badge={defense.av === 'bypassed' ? 'BYPASSED' : defense.av === 'active' ? 'ACTIVE' : 'UNKNOWN'}
                            title="ANTI-VIRUS / EDR"
                            detail={
                                defense.av === 'bypassed' ? 'Endpoint protection neutralised'
                                : defense.av === 'active' ? 'Endpoint protection still running'
                                : 'Not assessed — click to mark'
                            }
                            icon={defense.av === 'bypassed' ? ShieldOff : Shield}
                            hint="Click to cycle: UNKNOWN → BYPASSED → ACTIVE"
                            onClick={() => cycleDefense(hostKey, 'av')}
                        />
                        <MatrixRow
                            state={markState(defense.fw)}
                            badge={defense.fw === 'bypassed' ? 'DISABLED' : defense.fw === 'active' ? 'ACTIVE' : 'UNKNOWN'}
                            title="FIREWALL"
                            detail={
                                defense.fw === 'bypassed' ? 'Host firewall down or holed'
                                : defense.fw === 'active' ? 'Host firewall still filtering'
                                : 'Not assessed — click to mark'
                            }
                            icon={Flame}
                            hint="Click to cycle: UNKNOWN → DISABLED → ACTIVE"
                            onClick={() => cycleDefense(hostKey, 'fw')}
                        />
                        <MatrixRow
                            state={privState}
                            badge={priv || 'UNKNOWN'}
                            title="PRIVILEGE"
                            detail={
                                privState === 'won' ? (privInfo.unix ? 'Running as root — full control' : 'Running as SYSTEM — full control')
                                : privInfo.tier === 'elevated' ? 'Elevated admin, but not SYSTEM'
                                : 'Unprivileged session'
                            }
                            icon={KeyRound}
                            hint="Derived from the session's integrity level"
                        />
                    </div>
                </div>
            )}
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
