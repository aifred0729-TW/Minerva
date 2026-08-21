import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, Globe2, Tag as TagIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { directDownloadUrl } from '../../lib/urls';
import { LABEL, type Tone } from '../../components/Instrument';
import type { PayloadTag, PayloadBuildStep, Payload } from '../../types/payloads';
import { createPortal } from 'react-dom';

/**
 * Payload list furniture — badges, chips and the build-step ribbon.
 *
 * These are the pieces the PAYLOADS OVERVIEW table is made of, so they follow
 * the console panel kit (`components/Instrument.tsx`) rather than inventing
 * their own palette: tones are named for the job (`live` / `warn` / `fail`),
 * every state ships as a WORD with the colour behind it, and no text on the
 * void surface is a faded grey. See docs/DESIGN_LANGUAGE.md §1 and §5.
 */

// ── Chip skin ───────────────────────────────────────────────────────────────
//
// One shape for every small state marker on this page. Border + wash + text
// all move together, so a chip is legible in greyscale and under any
// colour-vision deficiency — the wash alone would not be.

export const CHIP =
    'inline-flex w-fit items-center gap-1.5 rounded-sm border px-1.5 py-0.5 ' +
    'text-[11px] font-bold uppercase tracking-[0.1em] leading-[1.35]';

/* THE TONE IS THE BORDER AND THE TEXT, NEVER THE FILL.
 *
 * These used to be `border-accent/40 bg-accent/10` — and 10% of a green over
 * pure black composites to rgb(7,22,13), while the 40% border lands at
 * rgb(30,89,51). Sampling the rendered page gave exactly that: a field of ink
 * green. Neither number is a colour anyone chose; they are what alpha does to
 * a hue on black.
 *
 * So the hue is now carried at FULL strength by the two elements thin enough
 * to stay bright — a 1px rule and the glyphs — and the chip's body is an
 * achromatic lift that reads as "raised", not as "green". */
const CHIP_TONE: Record<Tone, string> = {
    signal: 'border-signal/30  bg-signal/[0.05] text-signal',
    live:   'border-accent     bg-signal/[0.05] text-accent',
    warn:   'border-amber-400  bg-signal/[0.05] text-amber-400',
    fail:   'border-red-400    bg-signal/[0.05] text-red-400',
    range:  'border-purple-400 bg-signal/[0.05] text-purple-400',
    idle:   'border-signal/20  bg-transparent   text-signal',
};

export const chipTone = (tone: Tone) => CHIP_TONE[tone];

/** Placeholder for a cell with nothing in it. Decoration, not content. */
export const EmDash = () => (
    <span aria-hidden="true" className="text-[13px] text-signal opacity-40">—</span>
);

export const ParseParamValue: React.FC<{
    value: string | null | undefined;
    parameterType: string;
    sensitive?: boolean;
}> = ({ value, parameterType, sensitive = false }) => {
    if (!value) return <EmDash />;
    if (sensitive && value.length > 8) {
        return <span className="italic text-signal opacity-70">{value.slice(0, 6)}••••</span>;
    }
    const pt = parameterType || '';
    if (pt === 'Boolean') {
        const boolVal = String(value).toLowerCase();
        return (boolVal === 'true' || boolVal === 't')
            ? <span className="font-bold text-accent">True</span>
            : <span className="font-bold text-red-400">False</span>;
    }
    if (pt === 'Dictionary') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            const display = JSON.stringify(parsed, null, 2);
            return (
                <pre className="cyber-scrollbar max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-sm border border-signal/15 bg-black/40 p-1.5 font-mono text-[11px] text-signal">{display}</pre>
            );
        } catch {
            return <span className="break-all text-signal">{value}</span>;
        }
    }
    if (pt === 'Array' || pt === 'ChooseMultiple') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (Array.isArray(parsed)) {
                return (
                    <div className="flex flex-wrap gap-1">
                        {parsed.map((item: unknown, i: number) => (
                            <span key={i} className={cn(CHIP, CHIP_TONE.signal, 'normal-case tracking-normal')}>{String(item)}</span>
                        ))}
                    </div>
                );
            }
        } catch { /* fall through */ }
        return <span className="break-all text-signal">{value}</span>;
    }
    if (pt === 'File') {
        return (
            <a href={directDownloadUrl(value)} target="_blank" rel="noopener noreferrer"
               className="font-mono text-[12px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                {value.substring(0, 16)}…
            </a>
        );
    }
    if (pt === 'FileMultiple') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (Array.isArray(parsed)) {
                return (
                    <div className="space-y-0.5">
                        {parsed.map((fileId: string, i: number) => (
                            <a key={i} href={directDownloadUrl(fileId)} target="_blank" rel="noopener noreferrer"
                               className="block font-mono text-[12px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                                {fileId.substring(0, 16)}…
                            </a>
                        ))}
                    </div>
                );
            }
        } catch { /* fall through */ }
        return <span className="break-all text-signal">{value}</span>;
    }
    return <span className="break-all text-signal">{value}</span>;
};

// ============================================
// Build state
// ============================================

/**
 * A build phase is a STATE, and the four Mythic reports are four different
 * operational facts:
 *
 *   success  → there is a file on disk to hand to a target        (`live`)
 *   building → a container is working on it right now             (`warn`)
 *   error    → the build failed and there is nothing to ship      (`fail`)
 *   anything else (submitted / queued) → accepted, not started    (`signal`)
 *
 * QUEUED is full-strength `signal` rather than amber: waiting in a queue is
 * the normal state of a payload someone just clicked BUILD on, and painting
 * it as a warning would make the one genuinely in-flight build unfindable.
 */
export type BuildState = { tone: Tone; label: string; icon: typeof CheckCircle; spin?: boolean };

export function buildState(phase: string): BuildState {
    switch (phase) {
        case 'success':  return { tone: 'live', label: 'Success', icon: CheckCircle };
        case 'building': return { tone: 'warn', label: 'Building', icon: Loader2, spin: true };
        case 'error':    return { tone: 'fail', label: 'Error', icon: XCircle };
        default:         return { tone: 'signal', label: phase || 'Pending', icon: Clock };
    }
}

/** Build phase as a chip: icon, word, tone. Never the colour on its own. */
export const BuildStatusBadge = ({ phase }: { phase: string }) => {
    const state = buildState(phase);
    const Icon = state.icon;
    return (
        <span className={cn(CHIP, CHIP_TONE[state.tone])}>
            <Icon
                size={11}
                strokeWidth={2}
                aria-hidden="true"
                className={cn('shrink-0', state.spin && 'animate-spin')}
            />
            {state.label}
        </span>
    );
};

// ============================================
// C2 status
// ============================================

/**
 * Egress readout for one payload.
 *
 * Same two booleans C2 PROFILES reads, same three answers, so a channel that
 * says DEGRADED over there cannot say "up" here: serving (`live`), container
 * up but not listening (`warn`), and neither (`fail`). The host:port line
 * underneath is an inline label-value pair — the host is the guidance, the
 * port is the fact, so the port is the bold one.
 */
export const C2StatusIndicator = ({ c2profiles, c2params }: {
    c2profiles: Payload['payloadc2profiles'];
    c2params?: Payload['c2profileparametersinstances'];
}) => {
    if (!c2profiles || c2profiles.length === 0) return <EmDash />;

    return (
        <div className="flex flex-col gap-1.5">
            {c2profiles.map((p, idx) => {
                const isRunning = p.c2profile.running && p.c2profile.container_running;
                const isWaiting = !p.c2profile.running && p.c2profile.container_running;
                const tone: Tone = isRunning ? 'live' : isWaiting ? 'warn' : 'fail';
                const profileParams = c2params?.filter(inst => inst.c2profile.name === p.c2profile.name) || [];
                const hostInst = profileParams.find(inst => inst.c2profileparameter.name === 'callback_host' || inst.c2profileparameter.name === 'host');
                const portInst = profileParams.find(inst => inst.c2profileparameter.name === 'callback_port' || inst.c2profileparameter.name === 'port');
                return (
                    <div key={idx} className="flex min-w-0 flex-col gap-1">
                        <span
                            title={isRunning ? 'Container up, server listening' : isWaiting ? 'Container up, server not listening' : 'Channel not serving'}
                            className={cn(CHIP, CHIP_TONE[tone], p.c2profile.is_p2p && 'border-dashed')}
                        >
                            <span aria-hidden="true" className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                tone === 'live' ? 'bg-accent' : tone === 'warn' ? 'bg-amber-400 animate-pulse' : 'bg-red-400',
                            )} />
                            <span className="normal-case tracking-normal">{p.c2profile.name}</span>
                            {p.c2profile.is_p2p && <span className="opacity-70">P2P</span>}
                        </span>
                        {(hostInst?.value || portInst?.value) && (
                            <span className="flex min-w-0 items-center gap-1.5 pl-0.5 font-mono text-[11px] text-signal">
                                <Globe2 size={10} strokeWidth={2} aria-hidden="true" className="shrink-0 opacity-60" />
                                {hostInst?.value && <span className="truncate opacity-70">{hostInst.value}</span>}
                                {hostInst?.value && portInst?.value && <span className="opacity-40">:</span>}
                                {portInst?.value && <span className="shrink-0 font-bold tabular-nums">{portInst.value}</span>}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// Tags
// ============================================

/**
 * Tags keep their operator-chosen colour — that colour IS the tag's identity,
 * and overriding it with palette tones would make two different tags look the
 * same. The shape around it is the console's, so a row of tags still reads as
 * part of this table.
 */
export const TagsDisplay = ({ tags }: { tags: PayloadTag[] }) => {
    if (!tags || tags.length === 0) return <EmDash />;

    return (
        <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
                <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-[1.35]"
                    style={{
                        backgroundColor: `${tag.tagtype.color}1f`,
                        color: tag.tagtype.color,
                        borderColor: `${tag.tagtype.color}59`,
                    }}
                >
                    <TagIcon size={10} strokeWidth={2} aria-hidden="true" />
                    {tag.tagtype.name}
                </span>
            ))}
        </div>
    );
};

// ============================================
// Build Step Detail Modal
// ============================================
const BuildStepDetailModal: React.FC<{
    step: PayloadBuildStep;
    onClose: () => void;
}> = ({ step, onClose }) => {
    const duration = React.useMemo(() => {
        if (!step.start_time || !step.end_time) return null;
        const ms = Math.abs(new Date(step.end_time).getTime() - new Date(step.start_time).getTime());
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    }, [step.start_time, step.end_time]);

    // Escape closes. A dialog that can only be dismissed by hitting its own
    // backdrop is a keyboard trap for anyone who opened it from the keyboard.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const state: { label: string; tone: Tone } =
        step.step_skip ? { label: 'Skipped', tone: 'idle' }
        : step.end_time === null && step.start_time ? { label: 'Running', tone: 'warn' }
        : step.end_time === null ? { label: 'Waiting', tone: 'signal' }
        : step.step_success ? { label: 'Success', tone: 'live' } : { label: 'Failed', tone: 'fail' };

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                role="dialog"
                aria-modal="true"
                aria-label={`Build step ${step.step_number + 1}: ${step.step_name}`}
                className="w-full max-w-lg overflow-hidden rounded-md border border-signal/20 bg-void/95 backdrop-blur-sm"
                onClick={e => e.stopPropagation()}
            >
                {/* Header strip — what this is, and how it is doing. */}
                <div className="flex items-center justify-between gap-3 border-b border-signal/15 px-4 py-3">
                    <h3 className={cn('min-w-0 truncate text-signal', LABEL)}>
                        Step {step.step_number + 1} · <span className="normal-case tracking-normal">{step.step_name}</span>
                    </h3>
                    <span className={cn(CHIP, CHIP_TONE[state.tone], 'shrink-0')}>{state.label}</span>
                </div>

                <div className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                        {duration && (
                            <span className="flex items-center gap-2">
                                <span className="text-signal opacity-70">Duration</span>
                                <span className="font-bold tabular-nums text-signal">{duration}</span>
                            </span>
                        )}
                        {step.start_time && (
                            <span className="flex items-center gap-2">
                                <span className="text-signal opacity-70">Started</span>
                                <span className="font-bold tabular-nums text-signal">{new Date(step.start_time).toLocaleTimeString()}</span>
                            </span>
                        )}
                    </div>
                    {step.step_description && (
                        <p className="border-l border-signal/25 pl-3 text-[13px] text-signal">{step.step_description}</p>
                    )}
                    {step.step_stdout && (
                        <div>
                            <div className={cn('mb-1.5 text-signal opacity-70', LABEL)}>Stdout</div>
                            <pre className="cyber-scrollbar max-h-40 overflow-x-auto rounded-sm border border-signal/15 bg-black/50 p-2 font-mono text-[12px] text-signal">{step.step_stdout}</pre>
                        </div>
                    )}
                    {step.step_stderr && (
                        <div>
                            <div className={cn('mb-1.5 text-red-400', LABEL)}>Stderr</div>
                            <pre className="cyber-scrollbar max-h-40 overflow-x-auto rounded-sm border border-red-400/25 bg-black/50 p-2 font-mono text-[12px] text-red-400">{step.step_stderr}</pre>
                        </div>
                    )}
                </div>

                {/* Footer strip. */}
                <div className="flex items-center justify-end border-t border-signal/15 px-4 py-2.5">
                    <button
                        onClick={onClose}
                        className="inline-flex min-h-[32px] items-center rounded-sm border border-signal/25 px-3 text-[12px] font-bold uppercase tracking-[0.1em] text-signal transition-colors hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                    >
                        Close
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// ============================================
// Build progress ribbon
// ============================================

/**
 * One dot per build step, in order, each one a button onto its own log.
 *
 * The dots are a progress ribbon, not decoration, so the state has to survive
 * greyscale: a finished step is a filled dot, a pending one is an empty ring,
 * and the running one is the only thing on the row that moves.
 */
export const BuildProgressSteps = ({ steps, buildPhase, isCombat = false }: { steps: PayloadBuildStep[]; buildPhase?: string; isCombat?: boolean }) => {
    const [detailStep, setDetailStep] = useState<PayloadBuildStep | null>(null);
    if (!steps || steps.length === 0) return null;

    // Filled at full strength or not filled at all — a dot at 60% alpha over
    // black is the ink version of its own colour, and eight of them in a row
    // is what made this ribbon read as olive.
    const dotClass = (s: PayloadBuildStep) => {
        if (s.step_skip) return 'border-signal/25 bg-transparent opacity-50';
        if (s.step_success === true) return 'border-accent bg-accent';
        if (s.step_success === false) return 'border-red-400 bg-red-400';
        if (s.start_time && !s.end_time) return cn('border-amber-400 bg-amber-400', !isCombat && 'animate-pulse');
        return 'border-signal/30 bg-transparent hover:border-signal/60';
    };

    const stateWord = (s: PayloadBuildStep) =>
        s.step_skip ? 'skipped'
        : s.step_success === true ? 'success'
        : s.step_success === false ? 'failed'
        : s.start_time && !s.end_time ? 'running' : 'waiting';

    const done = steps.filter(s => s.step_success === true || s.step_skip).length;

    return (
        <>
            <div
                className="mt-1.5 flex flex-wrap items-center gap-1"
                role="group"
                aria-label={`Build steps: ${done} of ${steps.length} complete`}
            >
                {steps.map((s) => (
                    <button
                        key={s.step_number}
                        type="button"
                        title={`Step ${s.step_number + 1}: ${s.step_name} — ${stateWord(s)}`}
                        aria-label={`Step ${s.step_number + 1}, ${s.step_name}, ${stateWord(s)}`}
                        onClick={() => setDetailStep(s)}
                        className={cn(
                            'h-2.5 w-2.5 shrink-0 rounded-full border transition-transform',
                            'hover:scale-150 focus-visible:scale-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                            dotClass(s),
                        )}
                    />
                ))}
                {buildPhase === 'building' && (
                    <span className="ml-1 font-mono text-[10px] tabular-nums text-signal opacity-70">
                        {done}/{steps.length}
                    </span>
                )}
            </div>
            {detailStep && (
                <BuildStepDetailModal step={detailStep} onClose={() => setDetailStep(null)} />
            )}
        </>
    );
};

// ============================================
// Confirm Dialog (replaces window.confirm)
// ============================================
