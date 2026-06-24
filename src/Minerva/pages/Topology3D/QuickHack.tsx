import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSubscription } from "@apollo/client/react";
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Crosshair, Monitor, Globe, Hash, AlertTriangle, Users }from 'lucide-react';
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
    const panelRef = useRef<HTMLDivElement>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const cb = node.data;
    const accentColor = '#ff003c';

    // Resolve the agent type from the node's payload info
    const nodeAgentType = cb?.payload?.payloadtype?.name?.toLowerCase() ?? null;

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Position: anchor to top-right of the node, offset by 40px right and 60px up
    const panelX = screenPos.x + 40;
    const panelY = screenPos.y - 60;

    // Clamp to viewport
    const clampedX = Math.min(panelX, window.innerWidth - 280);
    const clampedY = Math.max(panelY, 8);

    return createPortal(
        <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: -10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[9999] w-[260px] font-mono"
            style={{ left: clampedX, top: clampedY }}
        >
            {/* Connector line from node to panel */}
            <svg className="absolute pointer-events-none" style={{
                left: -40, top: 60, width: 44, height: 2, overflow: 'visible',
            }}>
                <line x1="0" y1="1" x2="40" y2="1" stroke={`${accentColor}60`} strokeWidth="1" strokeDasharray="3 2" />
                <circle cx="0" cy="1" r="2" fill={accentColor} opacity="0.6" />
            </svg>

            <div style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.97) 0%, rgba(15,5,10,0.98) 100%)',
                border: `1px solid ${accentColor}35`,
                boxShadow: `0 0 30px ${accentColor}15, 0 0 60px rgba(0,0,0,0.6)`,
                clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
            }}>
                {/* Top accent line */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}40, transparent)` }} />

                {/* Header */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Crosshair size={10} style={{ color: accentColor }} />
                        <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: accentColor }}>
                            Quickhack
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400">
                            #{cb?.display_id}
                        </span>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X size={10} />
                        </button>
                    </div>
                </div>

                {/* Target info strip */}
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-white/5 bg-white/[0.02]">
                    <Monitor size={9} className="text-gray-400" />
                    <span className="text-[9px] text-gray-300 truncate">{cb?.host || node.label}</span>
                    {cb?.ip && <span className="text-[8px] text-gray-400 ml-auto">{extractPrimaryIP(cb.ip)}</span>}
                </div>

                {/* Agent type indicator strip */}
                {nodeAgentType && (
                    <div className="px-3 py-1 flex items-center gap-1.5 border-b border-white/5 bg-white/[0.01]">
                        <span className="text-[8px] text-gray-600 uppercase tracking-[0.15em]">AGENT</span>
                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-px"
                            style={{ color: '#22d3ee', border: '1px solid rgba(34,211,238,0.25)', background: 'rgba(34,211,238,0.06)' }}>
                            {nodeAgentType}
                        </span>
                    </div>
                )}

                {/* QuickHack list */}
                <div className="py-1">
                    {hacks.map(hack => {
                        const compatible = isHackCompatible(hack, nodeAgentType);
                        const isPending = pendingHackId === hack.id;
                        return (
                            <button
                                key={hack.id}
                                onClick={() => compatible && !isPending && onSelectHack(hack)}
                                onMouseEnter={() => setHoveredId(hack.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                disabled={!compatible || isPending}
                                className={cn(
                                    "w-full px-3 py-2 text-left transition-all duration-150 relative",
                                    !compatible && "cursor-not-allowed opacity-40",
                                    isPending && "cursor-default"
                                )}
                                style={{
                                    background: isPending
                                        ? `${hack.color}1f`
                                        : compatible && hoveredId === hack.id ? `${hack.color}0d` : 'transparent',
                                    borderLeft: isPending ? `2px solid ${hack.color}` : undefined,
                                }}
                                title={!compatible ? `Incompatible: requires ${formatAgentTypes(hack.agentTypes)}` : undefined}
                            >
                                {/* Hover left accent — only for compatible */}
                                {compatible && hoveredId === hack.id && (
                                    <motion.div
                                        layoutId="qh-accent"
                                        className="absolute left-0 top-0 bottom-0 w-[2px]"
                                        style={{ background: hack.color }}
                                    />
                                )}

                                <div className="flex items-center gap-2">
                                    <LucideIcon name={hack.icon} size={14} style={{ color: compatible ? hack.color : '#555' }} />
                                    <span className="text-[11px] font-bold tracking-wider"
                                        style={{ color: compatible && hoveredId === hack.id ? hack.color : compatible ? `${hack.color}dd` : '#555' }}>
                                        {hack.name}
                                    </span>
                                    <span className="ml-auto flex items-center gap-1">
                                        {/* Agent type restriction badge */}
                                        {hack.agentTypes && hack.agentTypes.length > 0 && (
                                            <span className={cn(
                                                "text-[7px] px-1 py-px border tracking-wider",
                                                !compatible
                                                    ? "border-red-500/30 text-red-400/60"
                                                    : "border-white/15 text-gray-500"
                                            )}>
                                                {hack.agentTypes.map(a => a.toUpperCase()).join('/')}
                                            </span>
                                        )}
                                        {(hack.steps ?? []).length > 1 && (
                                            <span className="text-[8px] px-1 py-px border opacity-60"
                                                style={{ borderColor: `${hack.color}40`, color: `${hack.color}aa` }}>
                                                {hack.steps.length} STEPS
                                            </span>
                                        )}
                                        {hack.variables && hack.variables.length > 0 && (
                                            <span className="text-[8px] px-1 py-px border opacity-60"
                                                style={{ borderColor: `${hack.color}40`, color: `${hack.color}aa` }}>
                                                {hack.variables.length} VAR{hack.variables.length !== 1 ? 'S' : ''}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="text-[8px] text-gray-400 mt-0.5 pl-[22px] leading-relaxed">
                                    {hack.description}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Bottom accent */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}15, transparent)` }} />
            </div>
        </motion.div>,
        document.body
    );
};

// ── Agent picker — secondary panel that opens to the right of the
//    QuickHackPanel when the targeted node hosts more than one
//    compatible agent (e.g. Apollo + Meterpreter on the same machine).
//    Operator picks which agent the chosen hack should run against.

/** Per-agent accent: Mythic agents collapse to a single cyan tone, MSF
 *  sessions get red, anything unknown falls back to signal. Kept inline
 *  so callers don't have to reach into a separate colour table. */
function pickAgentAccent(cb: Callback): { fg: string; border: string; bg: string; label: string } {
    const ptype = (cb.payload?.payloadtype?.name || '').toLowerCase();
    const isMsf = isMsfCallback(cb);
    if (isMsf) {
        return {
            fg: '#ff6b6b',
            border: 'rgba(255,107,107,0.35)',
            bg: 'rgba(255,107,107,0.06)',
            label: (ptype || 'meterpreter').toUpperCase(),
        };
    }
    return {
        fg: '#22d3ee',
        border: 'rgba(34,211,238,0.35)',
        bg: 'rgba(34,211,238,0.06)',
        label: (ptype || 'agent').toUpperCase(),
    };
}

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
    const panelRef = useRef<HTMLDivElement>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const accentColor = hack.color;

    // Close on outside click — but allow clicks back on the QuickHackPanel.
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!panelRef.current) return;
            const target = e.target as Node;
            if (panelRef.current.contains(target)) return;
            // Heuristic: if the click landed on something else inside the
            // QuickHack portal stack (the left panel), keep us open. That
            // panel is the only sibling we want to coexist with.
            onCancel();
        };
        const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
        return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
    }, [onCancel]);

    // QuickHackPanel sits at clampedX with width 260; +40px connector. Stack
    // the picker to its right with a small gap. If we'd overflow the right
    // viewport edge, fall back to the left of the panel.
    const panelLeft = Math.min(screenPos.x + 40, window.innerWidth - 280);
    const panelTop = Math.max(screenPos.y - 60, 8);
    const desiredLeft = panelLeft + 268;
    const pickerWidth = 240;
    const pickerLeft = desiredLeft + pickerWidth + 4 > window.innerWidth
        ? Math.max(8, panelLeft - pickerWidth - 8)
        : desiredLeft;

    return createPortal(
        <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[9999] font-mono"
            style={{ left: pickerLeft, top: panelTop, width: pickerWidth }}
        >
            <div style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.97) 0%, rgba(10,8,14,0.98) 100%)',
                border: `1px solid ${accentColor}35`,
                boxShadow: `0 0 30px ${accentColor}15, 0 0 60px rgba(0,0,0,0.6)`,
                clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
            }}>
                {/* Top accent line, matching QuickHackPanel */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}40, transparent)` }} />

                {/* Header */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Users size={10} style={{ color: accentColor }} />
                        <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: accentColor }}>
                            Pick agent
                        </span>
                    </div>
                    <button onClick={onCancel} className="text-signal hover:text-accent transition-colors">
                        <X size={10} />
                    </button>
                </div>

                {/* Hack context strip */}
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-white/5 bg-white/[0.02]">
                    <LucideIcon name={hack.icon} size={11} style={{ color: accentColor }} />
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: accentColor }}>
                        {hack.name}
                    </span>
                    <span className="ml-auto text-[8px] text-signal tracking-[0.15em]">
                        {candidates.length} CANDIDATES
                    </span>
                </div>

                {/* Candidate list */}
                <div className="py-1 max-h-[55vh] overflow-y-auto cyber-scrollbar">
                    {candidates.map(cb => {
                        const accent = pickAgentAccent(cb);
                        // Canonical aliveness check — `active` is the
                        // hidden-by-operator flag, not the dead flag.
                        // For Mythic callbacks the truth is in
                        // `last_checkin` vs `sleep_info`; for MSF
                        // synthetic dead rows the factory pins
                        // `last_checkin` to 1970 so the same check
                        // returns false. `cb.dead` is also honoured
                        // for the rare case MSF marks it before the
                        // ledger writes the dead timestamp.
                        const alive = !cb.dead && isCallbackAlive(cb);
                        const hovered = hoveredId === cb.id;
                        return (
                            <button
                                key={cb.id}
                                onClick={() => onSelectCallback(cb)}
                                onMouseEnter={() => setHoveredId(cb.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                disabled={!alive}
                                className={cn(
                                    "w-full px-3 py-2 text-left transition-all duration-150 relative",
                                    !alive && "opacity-40 cursor-not-allowed",
                                )}
                                style={{
                                    background: alive && hovered ? `${accent.fg}10` : 'transparent',
                                    borderLeft: hovered ? `2px solid ${accent.fg}` : '2px solid transparent',
                                }}
                                title={!alive ? 'Callback is dead' : undefined}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-px"
                                          style={{ color: accent.fg, border: `1px solid ${accent.border}`, background: accent.bg }}>
                                        {accent.label}
                                    </span>
                                    <span className="text-[11px] font-bold text-signal tabular-nums">
                                        #{cb.display_id}
                                    </span>
                                    <span className="ml-auto flex items-center gap-1">
                                        <span className={cn("w-1.5 h-1.5 rounded-full", alive ? "bg-accent animate-pulse" : "bg-red-500")} />
                                        <span className="text-[8px] tracking-[0.2em] text-signal">
                                            {alive ? 'ALIVE' : 'DEAD'}
                                        </span>
                                    </span>
                                </div>
                                <div className="text-[9px] text-signal mt-0.5 pl-[2px] leading-tight truncate">
                                    {cb.user || '?'}@{cb.host || cb.ip || '?'}
                                </div>
                                {cb.description && (
                                    <div className="text-[8px] text-signal/85 mt-0.5 pl-[2px] leading-tight truncate">
                                        {cb.description}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}15, transparent)` }} />
            </div>
        </motion.div>,
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
                        className="w-[112px] px-1.5 py-1 text-[9px] font-mono tracking-wider focus:outline-none transition-colors"
                        style={{
                            background: 'rgba(0,0,0,0.85)',
                            border: '1px solid rgba(34,211,238,0.5)',
                            color: '#22d3ee',
                        }}
                    />
                ) : (
                    <button
                        onClick={onRequestNodePick}
                        className="flex items-center gap-1 px-1.5 py-1 border text-[8px] font-mono tracking-wider transition-all cursor-pointer"
                        style={{
                            borderColor: isPickingNode ? `${accentColor}80` : isFilled ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.15)',
                            background: isPickingNode ? `${accentColor}15` : isFilled ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.7)',
                            color: isFilled ? '#22d3ee' : isPickingNode ? accentColor : '#666',
                            boxShadow: isPickingNode ? `0 0 8px ${accentColor}30` : 'none',
                            animation: isPickingNode ? 'qh-flicker 1.5s ease-in-out infinite' : undefined,
                        }}
                        title={
                            isPickingNode
                                ? 'Click a node to select its IP, or type to enter one manually'
                                : isFilled ? value : 'Click to pick target IP'
                        }
                    >
                        <Globe size={8} />
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
                className="flex items-center gap-1 px-1.5 py-1 border text-[8px] font-mono tracking-wider transition-all cursor-pointer"
                style={{
                    borderColor: portInputOpen ? `${accentColor}80` : isFilled ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.15)',
                    background: portInputOpen ? `${accentColor}15` : isFilled ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.7)',
                    color: isFilled ? '#f59e0b' : portInputOpen ? accentColor : '#666',
                }}
                title={isFilled ? `Number: ${value}` : 'Click to enter number'}
            >
                <Hash size={8} />
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
                            className="w-[52px] bg-black/80 border border-amber-500/30 px-1.5 py-1 text-[9px] font-mono text-amber-400 placeholder-gray-700 focus:border-amber-400/60 focus:outline-none transition-colors text-center"
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
    return createPortal(
        <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[10002] font-mono"
            style={{ left: screenPos.x + 30, top: screenPos.y - 10 }}
        >
            <div style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.94) 0%, rgba(5,15,20,0.96) 100%)',
                border: '1px solid rgba(34,211,238,0.25)',
                boxShadow: '0 0 20px rgba(34,211,238,0.08), 0 0 40px rgba(0,0,0,0.5)',
            }}>
                <div className="h-[1px]" style={{ background: 'linear-gradient(90deg, #22d3ee, rgba(34,211,238,0.2), transparent)' }} />
                <div className="px-2 py-1.5 text-[8px] text-gray-600 uppercase tracking-[0.2em] border-b border-white/5">
                    SELECT IP
                </div>
                <div className="py-0.5">
                    {ips.map(ip => (
                        <button
                            key={ip}
                            onClick={() => onSelect(ip)}
                            className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-cyan-300/80 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors flex items-center gap-2"
                        >
                            <Globe size={8} className="text-cyan-500/50 shrink-0" />
                            {ip}
                        </button>
                    ))}
                </div>
            </div>
        </motion.div>,
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
