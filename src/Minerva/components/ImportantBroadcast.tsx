// =====================================================================
//  ImportantBroadcast — cyberpunk HUD alert strip
//
//  Anchored so the Minerva triangle icon is at top-center of screen.
//  When a broadcast fires, the panel extends RIGHTWARD from the icon,
//  revealing info with a terminal-scan aesthetic.
//
//  - Icon: Minerva warning triangle (same SVG as the loading screen)
//  - Expands rightward, not a popup/modal
//  - Medium sized, top-center, 15 s TTL with countdown bar
//  - Reappear bug: latestId ref prevents phantom re-expansion
// =====================================================================
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBroadcastStore, type Broadcast } from '../lib/broadcastBus';
import { MinervaWarning, LEVEL_TONE, type BroadcastTone } from './broadcastTheme';
import { cn } from '../lib/utils';

type Tone = BroadcastTone;

// Layout constants (px) — bumped for stronger presence without overwhelming
const ICON_W  = 60;   // icon box — its CENTER is pinned at left: 50%
const PANEL_W = 540;  // total expanded width
const BAR_H   = 60;

// -- Decorators --------------------------------------------------------------

function Scanlines() {
    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.6) 0,rgba(255,255,255,0.6) 1px,transparent 1px,transparent 4px)' }}
        />
    );
}

// Only left-side corners — the right edge is "open" because the panel just
// extended there, giving the feel of a live terminal draw.
function LeftCorners({ tone }: { tone: Tone }) {
    const c = cn('pointer-events-none absolute', tone.fg.replace('text-', 'bg-'));
    return (
        <>
            <div className={cn(c, 'top-0 left-0 h-px w-4')} />
            <div className={cn(c, 'top-0 left-0 w-px h-4')} />
            <div className={cn(c, 'bottom-[3px] left-0 h-px w-4')} />
            <div className={cn(c, 'bottom-[3px] left-0 w-px h-4')} />
        </>
    );
}

// Terminal-scan line that sweeps left → right during reveal
function ScanSweep({ expand }: { expand: boolean }) {
    return (
        <motion.div
            className="pointer-events-none absolute top-0 bottom-[3px] w-px bg-white/60 z-20"
            initial={{ left: ICON_W, opacity: 0.8 }}
            animate={expand
                ? { left: PANEL_W, opacity: 0 }
                : { left: ICON_W,  opacity: 0.8 }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
        />
    );
}

// Countdown bar that drains over ttlMs
function CountdownBar({ ttlMs, tone }: { ttlMs: number; tone: Tone }) {
    return (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/[0.05]">
            <motion.div
                className={cn('h-full origin-left', tone.bar)}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: ttlMs / 1000, ease: 'linear' }}
            />
        </div>
    );
}

// -- Main panel --------------------------------------------------------------

interface PanelProps {
    broadcast: Broadcast;
    tone: Tone;
    queueIndex: number;
    queueTotal: number;
    onCycle: (dir: 1 | -1) => void;
    onDismiss: () => void;
}

function BroadcastPanel({ broadcast, tone, queueIndex, queueTotal, onCycle, onDismiss }: PanelProps) {
    const ttlMs = broadcast.ttlMs ?? 15_000;
    const [swept, setSwept] = useState(false);

    // Trigger scan-sweep a beat after mount
    useEffect(() => {
        const t = setTimeout(() => setSwept(true), 40);
        return () => clearTimeout(t);
    }, []);

    return (
        // Container grows from icon-only width to full panel width.
        // overflow:hidden clips the inner fixed-width row during expansion,
        // creating the rightward-reveal effect.
        <motion.div
            key={broadcast.id}
            className={cn(
                'relative overflow-hidden border bg-black/92 backdrop-blur-sm',
                tone.border,
            )}
            style={{
                boxShadow: `0 0 0 1px rgba(0,0,0,0.55), 0 4px 28px -4px ${tone.glow}`,
            }}
            initial={{ width: ICON_W, opacity: 1 }}
            animate={{ width: PANEL_W, opacity: 1 }}
            exit={{ width: ICON_W, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
            <Scanlines />
            <LeftCorners tone={tone} />
            <ScanSweep expand={swept} />

            {/* Inner row is always PANEL_W wide; overflow:hidden on parent clips it */}
            <div className="flex items-stretch" style={{ width: PANEL_W, height: BAR_H }}>

                {/* Icon box */}
                <div className={cn(
                    'relative flex-shrink-0 grid place-items-center border-r',
                    tone.border,
                )} style={{ width: ICON_W }}>
                    {/* Ping ring */}
                    <span className={cn(
                        'absolute inset-2 border animate-ping opacity-20 rounded-sm',
                        tone.border,
                    )} />
                    <MinervaWarning size={28} className={cn('relative z-10', tone.fg)} />
                </div>

                {/* Content */}
                <div className="flex-1 flex items-center gap-3 px-3.5 min-w-0">

                    {/* Animated vertical separator */}
                    <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.25, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
                        className={cn('w-px h-6 flex-shrink-0 origin-center', tone.fg.replace('text-', 'bg-'))}
                    />

                    {/* Level badge */}
                    <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.41, duration: 0.2 }}
                        className={cn(
                            'text-[10px] font-mono font-bold tracking-[0.2em] border px-2 py-0.5 flex-shrink-0',
                            tone.fg, tone.border,
                        )}
                    >
                        {tone.label}
                    </motion.span>

                    {/* Title + message */}
                    <div className="flex flex-col min-w-0 flex-1">
                        <motion.span
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.44, duration: 0.22 }}
                            className={cn('text-base font-mono font-bold tracking-widest leading-tight truncate', tone.fg)}
                        >
                            {broadcast.title.toUpperCase()}
                        </motion.span>
                        {broadcast.message && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.52, duration: 0.2 }}
                                className="text-xs text-gray-200 font-mono truncate leading-tight mt-0.5"
                            >
                                {broadcast.message}
                            </motion.span>
                        )}
                    </div>

                    {/* Queue counter */}
                    {queueTotal > 1 && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.52 }}
                            className="text-[9px] font-mono text-gray-500 flex-shrink-0 tabular-nums"
                        >
                            {queueIndex + 1}/{queueTotal}
                        </motion.span>
                    )}
                </div>

                {/* Controls */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.18 }}
                    className="flex items-center gap-0 pr-2 pl-1 flex-shrink-0"
                >
                    {queueTotal > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={() => onCycle(-1)}
                                className={cn('p-1.5 transition-colors hover:text-white', tone.fg)}
                                title="Previous"
                            >
                                <ChevronLeft size={11} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onCycle(1)}
                                className={cn('p-1.5 transition-colors hover:text-white', tone.fg)}
                                title="Next"
                            >
                                <ChevronRight size={11} />
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="p-1.5 text-gray-600 hover:text-gray-200 transition-colors"
                        title="Dismiss"
                    >
                        <X size={11} />
                    </button>
                </motion.div>
            </div>

            <CountdownBar ttlMs={ttlMs} tone={tone} />
        </motion.div>
    );
}

// -- Exported component ------------------------------------------------------

export function ImportantBroadcast() {
    const broadcasts = useBroadcastStore(s => s.broadcasts);
    const dismiss    = useBroadcastStore(s => s.dismiss);
    const [activeIdx, setActiveIdx] = useState(0);

    // Clamp when list shrinks
    useEffect(() => {
        if (broadcasts.length > 0 && activeIdx >= broadcasts.length) {
            setActiveIdx(broadcasts.length - 1);
        }
    }, [broadcasts.length, activeIdx]);

    // Jump to newest only when a genuinely NEW broadcast id arrives.
    // Tracking the id (not the full array) means Zustand's dismiss()
    // does NOT re-trigger this effect, preventing phantom re-expansion.
    const latestId = broadcasts.length > 0 ? broadcasts[broadcasts.length - 1].id : null;
    const prevLatestId = useRef<string | null>(null);
    useEffect(() => {
        if (latestId && latestId !== prevLatestId.current) {
            prevLatestId.current = latestId;
            setActiveIdx(broadcasts.length - 1);
        }
    }, [latestId, broadcasts.length]);

    const broadcast = broadcasts.length > 0 ? (broadcasts[activeIdx] ?? broadcasts[0]) : null;
    const tone = broadcast ? LEVEL_TONE[broadcast.level] : null;

    return (
        // Outer wrapper is centered via left:50% + translateX(-50%). As the
        // inner panel animates its width from ICON_W → PANEL_W the translate
        // recomputes against the live width every frame, so the whole bar
        // stays horizontally centered throughout the reveal animation.
        <div
            className="fixed z-[9998] pointer-events-none"
            style={{ top: 12, left: '50%', transform: 'translateX(-50%)' }}
        >
            <div className="pointer-events-auto">
                {/* No `initial={false}` — we WANT the first broadcast to play
                    its rightward-extension animation. */}
                <AnimatePresence mode="wait">
                    {broadcast && tone && (
                        <BroadcastPanel
                            key={broadcast.id}
                            broadcast={broadcast}
                            tone={tone}
                            queueIndex={activeIdx}
                            queueTotal={broadcasts.length}
                            onCycle={(dir) => setActiveIdx(i => (i + dir + broadcasts.length) % broadcasts.length)}
                            onDismiss={() => dismiss(broadcast.id)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default ImportantBroadcast;
