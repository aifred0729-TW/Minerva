import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSubscription } from "@apollo/client/react";
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Crosshair, Globe, Hash, Users }from 'lucide-react';
import { Group, Vector3 } from 'three';
import { cn } from '../../lib/utils';
import type { TopoNode, QuickHackExecution } from '../../types/topology';
import { QuickHackDef, QuickHackVariable, isHackCompatible, formatAgentTypes } from '../../lib/quickhacks';
import { extractPrimaryIP } from './topology';
import { isCallbackAlive } from '../../lib/utils';
import { playDoneQH } from '../../lib/soundEffects';
import { LucideIcon } from '../../lib/iconMap';
import { createPortal } from 'react-dom';
import { useFrame } from '@react-three/fiber';
import { SUBSCRIBE_TASK_STATUS_BY_ID } from '../../lib/api';
import type { Callback } from '../../types';
import { isMsfCallback } from '../Callbacks/msfSyntheticCallbacks';
import {
    useAnchoredPanel, PanelShell, PanelGroup, PanelRow, PanelChip, PanelBar,
    panelRowClass, PANEL_ITEM_ATTR, TONE_TEXT, TONE_ICON, type PanelTone,
} from '../../components/CyberPanel';

const QUICKHACK_EXIT_DELAY_MS = 2_200;
const QUICKHACK_REMOVE_DELAY_MS = 2_700;
const QUICKHACK_TIMEOUT_EXIT_DELAY_MS = 1_700;
const QUICKHACK_TIMEOUT_REMOVE_DELAY_MS = 2_200;

const glitchStyleId = 'quickhack-glitch-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(glitchStyleId)) {
    const style = document.createElement('style');
    style.id = glitchStyleId;
    style.textContent = `
        @keyframes qh-scanline {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100vh); }
        }
        @keyframes qh-glitch-skew {
            0%   { transform: skewX(0deg); }
            20%  { transform: skewX(-2deg); }
            40%  { transform: skewX(1.5deg); }
            60%  { transform: skewX(-1deg); }
            80%  { transform: skewX(0.5deg); }
            100% { transform: skewX(0deg); }
        }
        @keyframes qh-flicker {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.97; }
            51% { opacity: 0.4; }
            52% { opacity: 0.98; }
        }
        @keyframes qh-data-rain {
            0%   { transform: translateY(-10px); opacity: 0; }
            10%  { opacity: 1; }
            90%  { opacity: 1; }
            100% { transform: translateY(10px); opacity: 0; }
        }
        @keyframes qh-progress-glow {
            0%, 100% { box-shadow: 0 0 8px var(--qh-color), 0 0 2px var(--qh-color); }
            50% { box-shadow: 0 0 20px var(--qh-color), 0 0 6px var(--qh-color), 0 0 40px color-mix(in srgb, var(--qh-color) 30%, transparent); }
        }
        @keyframes qh-upload-pulse {
            0%, 100% { transform: scaleX(1); }
            50% { transform: scaleX(1.02); }
        }
    `;
    document.head.appendChild(style);
}

/** QuickHack floating panel — appears near the target node like CP2077 scan tooltip */
export const QuickHackPanel = ({
    node,
    screenPos,
    onSelectHack,
    onClose,
    hacks,
    pendingHackId,
}: {
    node: TopoNode;
    screenPos: { x: number; y: number };
    onSelectHack: (hack: QuickHackDef) => void;
    onClose: () => void;
    hacks: QuickHackDef[];
    /** When the agent picker is open, the hack the operator already chose is dimmed-highlighted so the context stays visible. */
    pendingHackId?: string | null;
}) => {
    const cb = node.data;

    // Resolve the agent type from the node's payload info
    const nodeAgentType = cb?.payload?.payloadtype?.name?.toLowerCase() ?? null;

    // Position: anchor to the top-right of the node, offset by 40px right and
    // 60px up. `useAnchoredPanel` then flips/clamps it inside the viewport and
    // wires Esc / outside-click / arrow-key roving focus.
    const { ref, pos, onKeyDown } = useAnchoredPanel(
        screenPos.x + 40,
        Math.max(screenPos.y - 60, 8),
        onClose,
    );

    return createPortal(
        <>
            {/* Leash from the node to the panel — the one piece of Cyberpunk
                staging the panel keeps, because it says WHICH node is armed. */}
            <svg
                className="pointer-events-none fixed z-[9998]"
                style={{ left: screenPos.x, top: pos.top + 26, width: Math.max(2, pos.left - screenPos.x), height: 2, overflow: 'visible' }}
            >
                <line x1="0" y1="1" x2={Math.max(2, pos.left - screenPos.x)} y2="1"
                    stroke="rgba(248,113,113,0.5)" strokeWidth="1" strokeDasharray="3 2" />
                <circle cx="0" cy="1" r="2.5" fill="rgba(248,113,113,0.85)" />
            </svg>

            <PanelShell
                innerRef={ref}
                pos={pos}
                width={288}
                onKeyDown={onKeyDown}
                icon={Crosshair}
                iconTone="text-red-400"
                title="QUICKHACK"
                subtitle={`${cb?.host || node.label}${cb?.ip ? ` · ${extractPrimaryIP(cb.ip)}` : ''}`}
                badge={nodeAgentType ? nodeAgentType.toUpperCase() : undefined}
                badgeTone="text-signal opacity-70"
                onClose={onClose}
                footerLeft="TARGET ARMED"
                footerRight={cb?.display_id != null ? `C-${cb.display_id}` : undefined}
            >
                <PanelGroup label="HACKS" count={hacks.length}>
                    {hacks.map(hack => {
                        const compatible = isHackCompatible(hack, nodeAgentType);
                        const isPending = pendingHackId === hack.id;
                        // One tone system for the whole console: armed hacks are
                        // `danger`, the one already chosen is `active`, an agent
                        // that cannot run it is `muted`.
                        const tone: PanelTone = !compatible ? 'muted' : isPending ? 'active' : 'danger';
                        const meta = [
                            (hack.steps ?? []).length > 1 ? `${hack.steps.length} STEPS` : null,
                            hack.variables && hack.variables.length > 0
                                ? `${hack.variables.length} VAR${hack.variables.length !== 1 ? 'S' : ''}` : null,
                        ].filter(Boolean).join(' · ');
                        return (
                            <button
                                key={hack.id}
                                type="button"
                                role="menuitem"
                                {...{ [PANEL_ITEM_ATTR]: '' }}
                                disabled={!compatible || isPending}
                                onClick={() => compatible && !isPending && onSelectHack(hack)}
                                title={!compatible ? `Incompatible: requires ${formatAgentTypes(hack.agentTypes)}` : hack.description}
                                className={cn(panelRowClass(tone, !compatible || isPending), 'flex-col items-stretch gap-1 py-2')}
                            >
                                <PanelBar tone={tone} />
                                <span className="flex items-center gap-2.5">
                                    <LucideIcon name={hack.icon} size={12} className={cn('shrink-0', TONE_ICON[tone])} />
                                    <span className={cn('truncate tracking-[0.1em] font-bold', TONE_TEXT[tone])}>
                                        {hack.name}
                                    </span>
                                    <span aria-hidden="true" className="flex-1" />
                                    {isPending
                                        ? <PanelChip text="CHOSEN" tone="active" />
                                        : !compatible
                                            ? <PanelChip text="N/A" tone="muted" />
                                            : meta
                                                ? <PanelChip text={meta} tone="default" />
                                                : null}
                                </span>
                                <span className="pl-[22px] text-left text-[10px] leading-relaxed text-signal opacity-70 line-clamp-2">
                                    {hack.description}
                                </span>
                            </button>
                        );
                    })}
                </PanelGroup>
            </PanelShell>
        </>,
        document.body
    );
};

// ── Agent picker — secondary panel that opens to the right of the
//    QuickHackPanel when the targeted node hosts more than one
//    compatible agent (e.g. Apollo + Meterpreter on the same machine).
//    Operator picks which agent the chosen hack should run against.

/** QuickHack agent picker — opens to the right of QuickHackPanel when
 *  the node has more than one candidate callback for the chosen hack. */
export const QuickHackAgentPicker = ({
    hack,
    candidates,
    screenPos,
    onSelectCallback,
    onCancel,
}: {
    hack: QuickHackDef;
    candidates: Callback[];
    /** Where the QuickHackPanel is positioned. The picker offsets to its right. */
    screenPos: { x: number; y: number };
    onSelectCallback: (cb: Callback) => void;
    onCancel: () => void;
}) => {
    // QuickHackPanel sits at +40px from the node with width 288. Stack the
    // picker to its right with a small gap; useAnchoredPanel folds it back
    // inside the viewport (and flips it left) when there is no room.
    const panelLeft = Math.min(screenPos.x + 40, window.innerWidth - 300);
    const panelTop = Math.max(screenPos.y - 60, 8);
    const { ref, pos, onKeyDown } = useAnchoredPanel(panelLeft + 296, panelTop, onCancel);

    return createPortal(
        <PanelShell
            innerRef={ref}
            pos={pos}
            width={256}
            onKeyDown={onKeyDown}
            icon={Users}
            iconTone="text-red-400"
            title="PICK AGENT"
            subtitle={hack.name}
            onClose={onCancel}
            footerLeft="ONE MACHINE · MANY AGENTS"
            footerRight={`${candidates.length}`}
        >
            <PanelGroup label="CANDIDATES" count={candidates.length}>
                {candidates.map(cb => {
                    // Canonical aliveness check — `active` is the hidden-by-operator
                    // flag, not the dead flag. For Mythic callbacks the truth is in
                    // `last_checkin` vs `sleep_info`; for MSF synthetic dead rows the
                    // factory pins `last_checkin` to 1970 so the same check returns
                    // false. `cb.dead` is also honoured for the rare case MSF marks it
                    // before the ledger writes the dead timestamp.
                    const alive = !cb.dead && isCallbackAlive(cb);
                    const ptype = (cb.payload?.payloadtype?.name || (isMsfCallback(cb) ? 'meterpreter' : 'agent')).toUpperCase();
                    const tone: PanelTone = alive ? 'default' : 'muted';
                    return (
                        <button
                            key={cb.id}
                            type="button"
                            role="menuitem"
                            {...{ [PANEL_ITEM_ATTR]: '' }}
                            disabled={!alive}
                            onClick={() => onSelectCallback(cb)}
                            title={!alive ? 'Callback is dead' : `${cb.user || '?'}@${cb.host || cb.ip || '?'}`}
                            className={cn(panelRowClass(tone, !alive), 'flex-col items-stretch gap-1 py-2')}
                        >
                            <PanelBar tone={tone} />
                            <span className="flex items-center gap-2.5">
                                <span className={cn('font-bold tabular-nums tracking-[0.1em]', TONE_TEXT[tone])}>
                                    C-{cb.display_id}
                                </span>
                                <span className="truncate text-[10px] text-signal opacity-70">{ptype}</span>
                                <span aria-hidden="true" className="flex-1" />
                                <PanelChip text={alive ? 'ALIVE' : 'DEAD'} tone={alive ? 'active' : 'danger'} />
                            </span>
                            <span className="truncate pl-[2px] text-left text-[10px] leading-tight text-signal opacity-70">
                                {cb.user || '?'}@{cb.host || cb.ip || '?'}
                                {cb.description ? ` · ${cb.description}` : ''}
                            </span>
                        </button>
                    );
                })}
            </PanelGroup>
        </PanelShell>,
        document.body
    );
};

/** QuickHack variable picker — small box next to the progress icon for IP or Port input */
export const QuickHackVarPicker = ({
    variable,
    value,
    onSetValue,
    accentColor,
    onRequestNodePick,
    isPickingNode,
    portInputOpen,
    onTogglePortInput,
}: {
    variable: QuickHackVariable;
    value: string;
    onSetValue: (val: string) => void;
    accentColor: string;
    onRequestNodePick: () => void;
    isPickingNode: boolean;
    portInputOpen: boolean;
    onTogglePortInput: () => void;
}) => {
    const isFilled = value.length > 0;

    // Hybrid IP input: default mode is "click a node to pick its IP". The
    // moment the operator types a printable char while the picker is armed,
    // we flip into a free-text inline input pre-filled with that key — so a
    // muscle-memory operator who reflexively typed `10.0.0.5` instead of
    // hunting the node doesn't lose the keystroke. The picking mode itself
    // is toggled off on transition so subsequent node clicks don't fight
    // the text input below.
    const [ipInputMode, setIpInputMode] = useState(false);
    const ipInputRef = useRef<HTMLInputElement | null>(null);

    // Listen for the first keystroke while in node-picking mode and flip
    // into text-input mode. Cancel cleanly if the operator exits picking
    // without typing.
    useEffect(() => {
        if (variable.type !== 'ip') return;
        if (!isPickingNode || ipInputMode) return;
        const isIpChar = (k: string) => /^[0-9a-fA-F.:]$/.test(k);
        const onKey = (e: KeyboardEvent) => {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            // Ignore keys while the operator is already typing in another
            // form field somewhere on the page.
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
            if (!isIpChar(e.key) && e.key !== 'Backspace') return;
            e.preventDefault();
            const initial = e.key === 'Backspace' ? '' : e.key;
            onSetValue(initial);
            setIpInputMode(true);
            // Toggle picking off — typing was the operator's choice and we
            // don't want a stray node click to wipe the field they're
            // actively editing.
            onRequestNodePick();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [variable.type, isPickingNode, ipInputMode, onSetValue, onRequestNodePick]);

    // Autofocus the input the moment it mounts so the next keystroke lands
    // in the field with the seed char already in place.
    useEffect(() => {
        if (ipInputMode && ipInputRef.current) {
            const el = ipInputRef.current;
            el.focus();
            // Cursor at end so the seed char isn't selected/replaced.
            const len = el.value.length;
            try { el.setSelectionRange(len, len); } catch { /* ignore */ }
        }
    }, [ipInputMode]);

    if (variable.type === 'ip') {
        return (
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-1"
            >
                {ipInputMode ? (
                    <input
                        ref={ipInputRef}
                        type="text"
                        value={value}
                        onChange={e => {
                            const v = e.target.value.replace(/[^0-9a-fA-F.:]/g, '').slice(0, 45);
                            onSetValue(v);
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                setIpInputMode(false);
                                (e.target as HTMLInputElement).blur();
                            } else if (e.key === 'Escape') {
                                onSetValue('');
                                setIpInputMode(false);
                            }
                        }}
                        onBlur={() => setIpInputMode(false)}
                        placeholder="IP"
                        className="w-[112px] rounded-sm border border-accent/50 bg-void/80 px-2 py-1 text-[10px] font-mono tracking-[0.1em] text-signal transition-colors placeholder:text-signal/40 focus:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    />
                ) : (
                    <button
                        onClick={onRequestNodePick}
                        className={cn(
                            'flex items-center gap-1 rounded-sm border px-1.5 py-1 cursor-pointer',
                            'text-[10px] font-mono font-bold tracking-[0.12em] transition-colors duration-150',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
                            // Armed → accent (the console's "live" tone); set → plain
                            // signal; still empty → amber, the palette's one tone for
                            // "required but not filled in" (Section 1).
                            isPickingNode ? 'border-accent/60 bg-accent/10 text-accent focus-visible:ring-accent'
                                : isFilled ? 'border-signal/25 bg-void/50 text-signal focus-visible:ring-signal/60'
                                : 'border-amber-400/40 bg-amber-400/[0.06] text-amber-400 focus-visible:ring-amber-400',
                        )}
                        style={{
                            boxShadow: isPickingNode ? `0 0 8px ${accentColor}30` : 'none',
                            animation: isPickingNode ? 'qh-flicker 1.5s ease-in-out infinite' : undefined,
                        }}
                        title={
                            isPickingNode
                                ? 'Click a node to select its IP, or type to enter one manually'
                                : isFilled ? value : 'Click to pick target IP'
                        }
                    >
                        <Globe size={9} strokeWidth={2} aria-hidden="true" />
                        {isFilled
                            ? <span className="max-w-[80px] truncate">{value}</span>
                            : <span>{isPickingNode ? 'PICK / TYPE' : 'IP'}</span>
                        }
                    </button>
                )}
            </motion.div>
        );
    }

    // Number type
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-1"
        >
            <button
                onClick={onTogglePortInput}
                className={cn(
                    'flex items-center gap-1 rounded-sm border px-1.5 py-1 cursor-pointer',
                    'text-[10px] font-mono font-bold tracking-[0.12em] transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
                    portInputOpen ? 'border-accent/60 bg-accent/10 text-accent focus-visible:ring-accent'
                        : isFilled ? 'border-signal/25 bg-void/50 text-signal focus-visible:ring-signal/60'
                        : 'border-amber-400/40 bg-amber-400/[0.06] text-amber-400 focus-visible:ring-amber-400',
                )}
                style={{ boxShadow: portInputOpen ? `0 0 8px ${accentColor}30` : 'none' }}
                title={isFilled ? `Number: ${value}` : 'Click to enter number'}
            >
                <Hash size={9} strokeWidth={2} aria-hidden="true" />
                {isFilled ? <span>{value}</span> : <span>NUM</span>}
            </button>
            <AnimatePresence>
                {portInputOpen && (
                    <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <input
                            autoFocus
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={value}
                            onChange={e => {
                                const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                                onSetValue(v);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') onTogglePortInput(); }}
                            placeholder="NUM"
                            className="w-[52px] rounded-sm border border-accent/50 bg-void/80 px-1.5 py-1 text-center text-[10px] font-mono tracking-[0.1em] text-signal transition-colors placeholder:text-signal/40 focus:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/** IP address selection submenu — shown when a node has multiple IPs */
export const IPSelectionMenu = ({
    ips,
    onSelect,
    screenPos,
}: {
    ips: string[];
    onSelect: (ip: string) => void;
    screenPos: { x: number; y: number };
}) => {
    // No dismiss handler of its own: the parent owns when this closes, so the
    // panel only borrows the placement + roving-focus half of the hook.
    const { ref, pos, onKeyDown } = useAnchoredPanel(screenPos.x + 30, screenPos.y - 10, () => {});

    return createPortal(
        <PanelShell
            innerRef={ref}
            pos={pos}
            width={224}
            onKeyDown={onKeyDown}
            icon={Globe}
            title="SELECT IP"
            footerLeft="TARGET ADDRESS"
            footerRight={`${ips.length}`}
            className="z-[10002]"
        >
            <PanelGroup label="ADDRESSES" count={ips.length}>
                {ips.map(ip => (
                    <PanelRow key={ip} icon={Globe} label={ip} onClick={() => onSelect(ip)} />
                ))}
            </PanelGroup>
        </PanelShell>,
        document.body
    );
};

/** QuickHack floating icon — Cyberpunk 2077-style indicator above target node */
export const QuickHackOverlay = ({
    execution,
    onClose,
    onResume,
    onUpdateVarValue,
    onRequestNodePick,
    nodePickingVarKey,
    nodes,
}: {
    execution: QuickHackExecution;
    onClose: () => void;
    onResume: (execId: string) => void;
    onUpdateVarValue: (execId: string, key: string, value: string) => void;
    onRequestNodePick: (execId: string, varKey: string) => void;
    nodePickingVarKey: string | null;
    nodes: TopoNode[];
}) => {
    const { hack, phase, progress, variableValues, execId } = execution;
    const isTimeout = phase === 'timeout';
    const isAwaiting = phase === 'awaiting_input';
    const accentColor = phase === 'error' ? '#ff003c' : isTimeout ? '#ff6600' : isAwaiting ? '#f59e0b' : hack.color;
    const isActive = phase === 'uploading' || phase === 'processing';
    const [isExiting, setIsExiting] = useState(false);
    const [openPortKey, setOpenPortKey] = useState<string | null>(null);

    const variables = hack.variables ?? [];
    const allFilled = variables.every(v => (variableValues[v.key] ?? '').length > 0);

    // Auto-close after completion/error/timeout — trigger exit animation first
    useEffect(() => {
        if (phase === 'completed' || phase === 'error') {
            const exitTimer = setTimeout(() => setIsExiting(true), QUICKHACK_EXIT_DELAY_MS);
            const removeTimer = setTimeout(onClose, QUICKHACK_REMOVE_DELAY_MS);
            return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
        }
        if (phase === 'timeout') {
            const exitTimer = setTimeout(() => setIsExiting(true), QUICKHACK_TIMEOUT_EXIT_DELAY_MS);
            const removeTimer = setTimeout(onClose, QUICKHACK_TIMEOUT_REMOVE_DELAY_MS);
            return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
        }
        return undefined;
    }, [phase, onClose]);

    const handleIconClick = useCallback(() => {
        if (!isAwaiting) return;
        if (allFilled) {
            onResume(execId);
        }
    }, [isAwaiting, allFilled, onResume, execId]);

    const size = 44;

    return (
        <div
            className={cn("font-mono transition-opacity duration-300", isAwaiting ? 'pointer-events-auto' : 'pointer-events-none', isExiting ? 'opacity-0' : 'opacity-100')}
        >
            <div className="flex items-start gap-2">
                {/* Icon container with vertical progress fill */}
                <div
                    className={cn("relative shrink-0", isAwaiting && "cursor-pointer")}
                    style={{ width: size, height: size }}
                    onClick={handleIconClick}
                    title={isAwaiting ? (allFilled ? 'Click to execute' : 'Fill all variables first') : undefined}
                >
                    {/* Background fill — rises from bottom as progress increases */}
                    <div className="absolute inset-0 overflow-hidden" style={{
                        clipPath: 'polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)',
                    }}>
                        {/* Dark base */}
                        <div className="absolute inset-0" style={{
                            background: `rgba(0,0,0,0.85)`,
                        }} />
                        {/* Rising fill */}
                        <motion.div
                            className="absolute inset-x-0 bottom-0"
                            initial={{ height: '0%' }}
                            animate={{ height: `${progress}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            style={{
                                background: `linear-gradient(0deg, ${accentColor}cc, ${accentColor}40)`,
                            }}
                        />
                        {/* Shimmer on active */}
                        {isActive && (
                            <motion.div
                                className="absolute inset-x-0 bottom-0"
                                initial={{ height: '0%' }}
                                animate={{ height: `${progress}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                style={{
                                    background: `linear-gradient(0deg, transparent 0%, ${accentColor}50 80%, ${accentColor}90 100%)`,
                                    animation: 'qh-flicker 1.5s ease-in-out infinite',
                                }}
                            />
                        )}
                        {/* Pulsing fill for awaiting input */}
                        {isAwaiting && (
                            <motion.div
                                className="absolute inset-0"
                                animate={{ opacity: [0.1, 0.25, 0.1] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                style={{ background: `${accentColor}40` }}
                            />
                        )}
                    </div>

                    {/* Border outline — octagon shape */}
                    <svg className="absolute inset-0" width={size} height={size} viewBox="0 0 44 44">
                        <polygon
                            points="6.6,0 37.4,0 44,6.6 44,37.4 37.4,44 6.6,44 0,37.4 0,6.6"
                            fill="none"
                            stroke={accentColor}
                            strokeWidth="1.5"
                            opacity={isActive ? 0.8 : isAwaiting ? 0.7 : (phase === 'completed' ? 0.5 : 0.6)}
                        >
                            {(isActive || isAwaiting) && (
                                <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2s" repeatCount="indefinite" />
                            )}
                        </polygon>
                    </svg>

                    {/* Center icon */}
                    <div className="absolute inset-0 flex items-center justify-center select-none"
                        style={{ color: accentColor, filter: (isActive || isAwaiting) ? `drop-shadow(0 0 4px ${accentColor})` : undefined }}>
                        <LucideIcon name={hack.icon} size={18} />
                    </div>

                    {/* Awaiting input: show play icon overlay when all filled */}
                    {isAwaiting && allFilled && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div className="w-5 h-5 flex items-center justify-center rounded-full"
                                style={{ background: `${accentColor}40` }}>
                                <ChevronRight size={12} style={{ color: accentColor }} strokeWidth={3} />
                            </div>
                        </motion.div>
                    )}

                    {/* Completion checkmark overlay */}
                    {phase === 'completed' && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div className="absolute inset-0" style={{
                                clipPath: 'polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)',
                                background: `${accentColor}30`,
                            }} />
                        </motion.div>
                    )}

                    {/* Error X overlay */}
                    {phase === 'error' && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <X size={20} style={{ color: '#ff003c' }} strokeWidth={3} />
                        </motion.div>
                    )}

                    {/* Timeout flash overlay */}
                    {isTimeout && (
                        <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: [1, 0, 1, 0, 1] }}
                            transition={{ duration: 1.2, ease: 'easeInOut' }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <X size={20} style={{ color: '#ff6600' }} strokeWidth={3} />
                        </motion.div>
                    )}
                </div>

                {/* Variable pickers — shown to the right of the icon during awaiting_input */}
                <AnimatePresence>
                    {isAwaiting && variables.length > 0 && (
                        <motion.div
                            key="var-pickers"
                            initial={{ opacity: 0, x: -6, width: 0 }}
                            animate={{ opacity: 1, x: 0, width: 'auto' }}
                            exit={{ opacity: 0, x: -6, width: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col gap-1 pt-1 pointer-events-auto overflow-hidden"
                        >
                            {variables.map(v => (
                                <QuickHackVarPicker
                                    key={v.key}
                                    variable={v}
                                    value={variableValues[v.key] ?? ''}
                                    onSetValue={val => onUpdateVarValue(execId, v.key, val)}
                                    accentColor={accentColor}
                                    onRequestNodePick={() => onRequestNodePick(execId, v.key)}
                                    isPickingNode={v.type === 'ip' && nodePickingVarKey === v.key}
                                    portInputOpen={openPortKey === v.key}
                                    onTogglePortInput={() => setOpenPortKey(openPortKey === v.key ? null : v.key)}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Label below icon */}
            <div className="text-center mt-1" style={{ width: size }}>
                <div className="text-[8px] tracking-[0.15em] uppercase font-bold"
                    style={{
                        color: accentColor,
                        textShadow: `0 0 6px ${accentColor}60`,
                        animation: isActive ? 'qh-flicker 2s ease-in-out infinite'
                            : isTimeout ? 'qh-flicker 0.3s ease-in-out 2'
                            : isAwaiting ? 'qh-flicker 3s ease-in-out infinite' : undefined,
                    }}>
                    {phase === 'completed' ? 'DONE'
                        : phase === 'error' ? 'FAILED'
                        : isTimeout ? 'TIMED OUT'
                        : isAwaiting ? (allFilled ? 'READY' : 'CONFIGURE')
                        : execution.totalSteps > 1
                            ? `${execution.currentStep + 1}/${execution.totalSteps}`
                            : hack.name}
                </div>
            </div>
        </div>
    );
};

/** Wrapper that monitors task subscription and drives completion + timeout */
/** Headless component that monitors task subscription + timeout for a QuickHack execution.
 *  Must be rendered OUTSIDE Canvas (in ApolloProvider tree). */
export const QuickHackSubscriptionMonitor = ({
    execution,
    onUpdate,
    onRemove,
    intervalRef,
}: {
    execution: QuickHackExecution;
    onUpdate: (execId: string, updater: (prev: QuickHackExecution) => QuickHackExecution) => void;
    onRemove: (execId: string) => void;
    intervalRef: React.MutableRefObject<Map<string, ReturnType<typeof setInterval>>>;
}) => {
    const { data: taskData } = useSubscription<any>(SUBSCRIBE_TASK_STATUS_BY_ID, {
        variables: { task_id: execution.taskId },
        skip: !execution.taskId,
        onError: (err) => { console.error('[SUBSCRIBE_TASK_STATUS_BY_ID] subscription error:', err); },
    });

    // Detect completion from subscription
    useEffect(() => {
        if (!taskData?.task_by_pk) return;
        const task = taskData.task_by_pk;
        if (task.completed && execution.phase === 'processing') {
            const iv = intervalRef.current.get(execution.execId);
            if (iv) { clearInterval(iv); intervalRef.current.delete(execution.execId); }
            const isError = task.status === 'error';
            playDoneQH();
            // Extract the first error response text, fallback to generic message
            const errorResponse = task.responses?.find((r: any) => r.is_error);
            const errorMsg = isError
                ? (errorResponse?.response || 'Task completed with errors')
                : undefined;
            onUpdate(execution.execId, prev => ({
                ...prev,
                phase: isError ? 'error' : 'completed',
                progress: 100,
                errorMsg,
            }));
        }
    }, [taskData, execution.phase, execution.execId, intervalRef, onUpdate]);

    // Timeout: if no completion after 60 seconds, mark as timed out
    useEffect(() => {
        if (execution.phase !== 'uploading' && execution.phase !== 'processing') return;
        const elapsed = Date.now() - execution.startTime;
        const remaining = Math.max(0, 60000 - elapsed);
        const timer = setTimeout(() => {
            const iv = intervalRef.current.get(execution.execId);
            if (iv) { clearInterval(iv); intervalRef.current.delete(execution.execId); }
            onUpdate(execution.execId, prev => {
                if (prev.phase === 'uploading' || prev.phase === 'processing') {
                    playDoneQH();
                    return { ...prev, phase: 'timeout', errorMsg: 'Connection timed out — target not responding' };
                }
                return prev;
            });
        }, remaining);
        return () => clearTimeout(timer);
    }, [execution.phase, execution.startTime, execution.execId, intervalRef, onUpdate]);

    return null;
};

/** Group that follows a node's live position each frame (for drag tracking). */
export const NodeFollower = ({ nodeRef, fallback, yOffset, children }: {
    nodeRef: { current: TopoNode | null };
    fallback: Vector3;
    yOffset: number;
    children: React.ReactNode;
}) => {
    const groupRef = useRef<Group>(null!);
    useFrame(() => {
        const pos = nodeRef.current?.position ?? fallback;
        groupRef.current.position.set(pos.x, pos.y + yOffset, pos.z);
    });
    return <group ref={groupRef}>{children}</group>;
};

/** Visual wrapper for QuickHackOverlay — rendered inside Canvas <Html>.
 *  No Apollo hooks here (Canvas portal has no ApolloProvider). */
export const QuickHackOverlayWrapper = ({
    execution,
    onRemove,
    onResume,
    onUpdateVarValue,
    onRequestNodePick,
    nodePickingVarKey,
    intervalRef,
    nodes,
}: {
    execution: QuickHackExecution;
    onRemove: (execId: string) => void;
    onResume: (execId: string) => void;
    onUpdateVarValue: (execId: string, key: string, value: string) => void;
    onRequestNodePick: (execId: string, varKey: string) => void;
    nodePickingVarKey: string | null;
    intervalRef: React.MutableRefObject<Map<string, ReturnType<typeof setInterval>>>;
    nodes: TopoNode[];
}) => {
    const handleClose = useCallback(() => {
        const iv = intervalRef.current.get(execution.execId);
        if (iv) { clearInterval(iv); intervalRef.current.delete(execution.execId); }
        onRemove(execution.execId);
    }, [intervalRef, execution.execId, onRemove]);

    return (
        <QuickHackOverlay
            execution={execution}
            onClose={handleClose}
            onResume={onResume}
            onUpdateVarValue={onUpdateVarValue}
            onRequestNodePick={onRequestNodePick}
            nodePickingVarKey={nodePickingVarKey}
            nodes={nodes}
        />
    );
};

/** Context menu portal positioned at screen coords — full-featured matching CallbackGraph */
