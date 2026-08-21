import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/utils';

/**
 * Instrument — the console's panel kit.
 *
 * It takes the *structure* of the login screen: a panel is a header strip /
 * body / footer strip, state is a word rather than a colour, and progress is a
 * framed rail. That structure is what makes a rectangle read as an instrument.
 *
 * It deliberately does NOT take the login screen's texture. The login is a
 * single panel an operator looks at for four seconds, so it can afford 10px
 * type, letter-spacing at 0.3em, dotted leaders and all-caps values. A console
 * is where the same operator reads sixteen panels of real data for an hour, and
 * at that dose those become noise: sub-12px body text is a legibility
 * anti-pattern, dotted leaders fight the eye on every row, and upper-casing
 * values destroys the word shapes that make a hostname or a filename
 * recognisable at a glance.
 *
 * So: labels are small, spaced and uppercase — they are furniture. **Values are
 * 13px, normally spaced, and keep their real casing** — they are the content.
 *
 * WHAT DOES NOT COME ACROSS FROM THE LOGIN PAGE AT ALL
 *  - The `hud-field` / `hud-route` / `hud-trace` palette. DESIGN_LANGUAGE.md
 *    Section 1 scopes those three tokens to the login screen; the structure
 *    travels, the colour does not.
 *  - The boot screen's hex dumps, micro type and scanline overlays.
 *
 * TONES ARE NAMED FOR THE JOB, NOT THE COLOUR, so a widget cannot quietly
 * borrow "the green one" for something that is not a live/healthy state.
 */
export type Tone = 'signal' | 'live' | 'warn' | 'fail' | 'range' | 'idle';

const TONE_TEXT: Record<Tone, string> = {
    signal: 'text-signal',
    live: 'text-accent',
    warn: 'text-amber-400',
    fail: 'text-red-400',
    range: 'text-purple-400',
    idle: 'text-signal opacity-45',
};

const TONE_FILL: Record<Tone, string> = {
    signal: 'bg-signal',
    live: 'bg-accent',
    warn: 'bg-amber-400',
    fail: 'bg-red-400',
    range: 'bg-purple-400',
    idle: 'bg-signal/30',
};

/** Stroke colours, for SVG where a Tailwind class cannot reach. */
const TONE_STROKE: Record<Tone, string> = {
    signal: 'rgb(var(--color-signal))',
    live: 'rgb(var(--color-accent))',
    warn: '#fbbf24',
    fail: '#f87171',
    range: '#c084fc',
    idle: 'rgb(var(--color-signal) / 0.45)',
};
export const toneStroke = (tone: Tone) => TONE_STROKE[tone];

export const toneText = (tone: Tone) => TONE_TEXT[tone];
export const toneFill = (tone: Tone) => TONE_FILL[tone];

/**
 * THE TYPE SCALE. Six steps, and nothing off it.
 *
 * This started as eleven ad-hoc sizes — 11/12/13/16/26/28/30/34/36/38/46 —
 * picked one card at a time. The top six were within a few pixels of each
 * other, which is not a hierarchy: if two numbers are meant to rank
 * differently they have to differ visibly, and if they rank the same they
 * should be the same size. Ratios here are ~1.25–1.4 between steps.
 *
 *   11  label / meta      13  body        16  emphasis
 *   26  readout           32  headline    44  hero
 */
export const TYPE = {
    label: 'text-[11px]',
    body: 'text-[13px]',
    emphasis: 'text-[16px]',
    readout: 'text-[26px]',
    headline: 'text-[32px]',
    hero: 'text-[44px]',
} as const;

/** Shared label treatment: the only place caps and wide tracking are used. */
export const LABEL = 'text-[11px] font-bold uppercase tracking-[0.14em]';

/**
 * THE TOOLBAR CHIP.
 *
 * Every console toggle is the same object: a bordered chip that NAMES A MODE
 * and lights up while that mode is engaged. Naming the mode rather than the
 * click is the whole point — a button reading "SHOW DEAD" tells you nothing
 * about whether dead rows are in the list you are looking at, and a row count
 * you cannot reconcile with the filters is a row count you cannot act on.
 *
 * Lit states are tone-coded from the set above, not from a fresh palette:
 * live = a mode that shows more, warn = one that reveals what is normally
 * suppressed, fail = one that touches dead sessions, range = filtering.
 */
export const TOOL_BTN = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal disabled:cursor-not-allowed';
export const TOOL_IDLE = 'border-signal/20 text-signal hover:border-signal/45 hover:bg-signal/5';
/* A tone NEVER appears as a low-alpha fill. 10% of a colour over pure black is
 * that colour's ink version — a green wash lands at rgb(7,22,13), which is the
 * muddy "ink green" the palette forbids. The tone lives in the border and the
 * text at FULL strength; the surface lift underneath is achromatic, so the
 * chip has a body without the body having a hue. */
export const TOOL_ON: Record<Tone, string> = {
    signal: 'border-signal bg-signal text-void',
    live: 'border-accent bg-signal/[0.06] text-accent',
    warn: 'border-amber-400 bg-signal/[0.06] text-amber-400',
    fail: 'border-red-400 bg-signal/[0.06] text-red-400',
    range: 'border-purple-400 bg-signal/[0.06] text-purple-400',
    idle: 'border-signal/20 text-signal opacity-60',
};

/**
 * A read-only state marker — a toolbar chip's shape with nothing to press.
 *
 * It gets its OWN tone map rather than reusing `TOOL_ON`: an engaged toggle
 * inverts to solid signal-on-void so it reads as pressed, and a marker that
 * inverted the same way would look like a control the operator had switched on.
 * A marker only ever outlines.
 */
const CHIP_TONE: Record<Tone, string> = {
    signal: 'border-signal/35 text-signal',
    live: 'border-accent text-accent',
    warn: 'border-amber-400 text-amber-400',
    fail: 'border-red-400 text-red-400',
    range: 'border-purple-400 text-purple-400',
    idle: 'border-signal/20 text-signal',
};

export function ToolChip({ tone = 'signal', className, children }: {
    tone?: Tone;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <span className={cn(
            'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]',
            CHIP_TONE[tone], className,
        )}>
            {children}
        </span>
    );
}

/**
 * Status is NEVER carried by colour alone.
 *
 * Not a style preference — a measured one. Running the dataviz palette
 * validator over this console's status set against the void surface puts the
 * accent green and the amber at ΔE 6.2 under protanopia, inside the band that
 * is only legal with secondary encoding. A bare coloured dot for UP vs
 * DEGRADED is therefore unreadable to a red-deficient operator, so every state
 * ships as a word. The dot, where present, sits behind the word as decoration.
 */
export function StatusWord({ tone, children, dot = false, className }: {
    tone: Tone;
    children: React.ReactNode;
    dot?: boolean;
    className?: string;
}) {
    return (
        <span className={cn(
            'inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]',
            TONE_TEXT[tone], className,
        )}>
            {dot && <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', TONE_FILL[tone])} />}
            {children}
        </span>
    );
}

/**
 * The panel: header strip, body, footer strip.
 *
 * The strips are the whole idea — a header that says what this is and how it is
 * doing, and a footer that says where the numbers came from, so no panel is
 * ever a bare box of figures with no provenance.
 */
export function InstrumentPanel({
    title, icon, badge, badgeTone = 'signal', footerLeft, footerRight,
    children, className, bodyClassName, onClick, ariaLabel,
}: {
    title: string;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
    badgeTone?: Tone;
    footerLeft?: React.ReactNode;
    footerRight?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    onClick?: () => void;
    ariaLabel?: string;
}) {
    const interactive = !!onClick;
    return (
        <section
            aria-label={ariaLabel ?? title}
            className={cn(
                // `overflow-hidden` is what makes a resizable panel honest: without
                // it, dragging the height down leaves the content standing
                // outside the border instead of the panel clipping it.
                'flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm',
                'transition-colors duration-200',
                interactive && 'cursor-pointer hover:border-signal/45',
                className,
            )}
            {...(interactive ? {
                role: 'button',
                tabIndex: 0,
                onClick,
                onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); }
                },
            } : {})}
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-signal/15 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && <span className={cn('shrink-0', TONE_TEXT[badgeTone])}>{icon}</span>}
                    <h3 className={cn('truncate text-signal', LABEL)}>{title}</h3>
                </div>
                {badge != null && (
                    <span className={cn('shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] tabular-nums', TONE_TEXT[badgeTone])}>
                        {badge}
                    </span>
                )}
            </header>

            {/* flex column, not a plain block: panels are now resizable, and a
                list inside one has to be able to take the height it is given.
                `min-h-0` is what lets a flex child actually shrink to allow its
                own overflow to scroll. */}
            {/* `min-h-0` is what lets this shrink below its content at all — a
                flex child will not, unless told. `overflow-y-auto` rather than
                `hidden` so a panel dragged shorter than its content becomes
                scrollable instead of silently truncating it.
                Panels that already own an inner `flex-1 min-h-0` scroller never
                trigger this one: their content sizes exactly to the space, so
                there is no second scrollbar. */}
            <div className={cn('cyber-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-4', bodyClassName)}>
                {children}
            </div>

            {(footerLeft != null || footerRight != null) && (
                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-signal/15 px-4 py-2.5">
                    <span className="min-w-0 truncate text-[11px] text-signal opacity-70">{footerLeft}</span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-signal">{footerRight}</span>
                </footer>
            )}
        </section>
    );
}

/**
 * One line of a list: name on the left, state on the right, hairline between.
 *
 * This replaced a dotted leader (`name ......... UP`). The leader is a login
 * flourish that works for four rows and turns into visual static at forty; a
 * plain baseline rule does the same job of carrying the eye across, without
 * competing with the text for attention.
 *
 * `label` keeps its own casing on purpose — hostnames, filenames and command
 * names are recognised by their shape.
 */
export function DataRow({ label, state, tone = 'signal', title, meta, className }: {
    label: React.ReactNode;
    state: React.ReactNode;
    tone?: Tone;
    title?: string;
    /** Secondary detail, shown after the label at reduced emphasis. */
    meta?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn(
            'flex items-center justify-between gap-3 border-b border-signal/10 py-2 text-[13px] last:border-0',
            className,
        )}>
            <span className="flex min-w-0 items-center gap-2 truncate text-signal" title={title}>
                {label}
                {meta != null && <span className="shrink-0 text-[11px] text-signal opacity-60">{meta}</span>}
            </span>
            <span className={cn('shrink-0 text-[11px] font-bold tabular-nums', TONE_TEXT[tone])}>{state}</span>
        </div>
    );
}

/**
 * The framed rail. An outer frame with the fill running inside it — a single
 * bare bar reads as decoration, the frame is what makes it an instrument.
 *
 * Fills with `scaleX`, never `width`: width relayouts the element every frame,
 * and this rail can be on screen a dozen times at once.
 */
export function Rail({ pct, tone = 'signal', className, height = 8 }: {
    pct: number;
    tone?: Tone;
    className?: string;
    height?: number;
}) {
    const reduce = useReducedMotion();
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    return (
        <div className={cn('rounded-sm border border-signal/35 p-[2px]', className)}>
            <div className="relative overflow-hidden" style={{ height }}>
                <motion.div
                    className={cn('absolute inset-y-0 left-0 w-full origin-left', TONE_FILL[tone])}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: clamped / 100 }}
                    // Pure deceleration: the rail arrives at a value rather than
                    // running to it at a constant rate.
                    transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0, 0, 0.2, 1] }}
                />
            </div>
        </div>
    );
}

/** Big number + label. A dashboard's job is that some numbers read across the
 *  room, so this is the one element allowed to be loud. */
export function Readout({ value, sub, label, tone = 'signal', size = 'text-[26px]', className }: {
    value: React.ReactNode;
    sub?: React.ReactNode;
    /** Omit where the panel header already names the number. */
    label?: React.ReactNode;
    tone?: Tone;
    size?: string;
    className?: string;
}) {
    return (
        <div className={cn('min-w-0', className)}>
            <div className={cn('font-bold leading-none tabular-nums', size, TONE_TEXT[tone])}>
                {value}
                {sub != null && <span className="ml-1.5 text-[13px] font-medium text-signal opacity-60">{sub}</span>}
            </div>
            {label != null && label !== '' && (
                <div className={cn('mt-2 truncate text-signal opacity-70', LABEL)}>{label}</div>
            )}
        </div>
    );
}

/**
 * One row of a ranked distribution: name, magnitude bar, value, share.
 *
 * This replaced the dashboard's donut charts. A donut is only right for
 * part-to-whole at a glance with roughly six segments or fewer; these lists ran
 * ten near-equal slices through a ten-colour cycling palette, which is two
 * charting anti-patterns at once (close values in a pie, and more than ~7
 * colour classes carrying meaning). Ranked bars answer the same question — who
 * is biggest, by how much — and carry identity in the *label*, so no
 * categorical palette is needed and colour-vision deficiency cannot scramble it.
 */
export function ChannelRow({ label, value, pct, tone = 'signal', title, share }: {
    label: React.ReactNode;
    value: React.ReactNode;
    pct: number;
    tone?: Tone;
    title?: string;
    share?: React.ReactNode;
}) {
    const reduce = useReducedMotion();
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    return (
        <div className="flex items-center gap-3 text-[13px]">
            <span className="w-[36%] shrink-0 truncate text-signal" title={title}>{label}</span>
            <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-signal/10">
                <motion.div
                    className={cn('absolute inset-y-0 left-0 w-full origin-left rounded-full', TONE_FILL[tone])}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: clamped / 100 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.55, ease: [0, 0, 0.2, 1] }}
                />
            </div>
            <span className="w-9 shrink-0 text-right font-bold tabular-nums text-signal">{value}</span>
            {share != null && (
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-signal opacity-60">{share}</span>
            )}
        </div>
    );
}

/**
 * Donut — part-to-whole, at a glance.
 *
 * Reserved for the one case that earns it: a small fixed set of segments
 * (six or fewer) whose *proportion* is the question. It is the wrong chart for
 * a ranked list of near-equal values — that is what `ChannelRow` is for — but
 * it is the right one for "how is the task queue divided", and it gives the
 * console a second shape so the page is not an unbroken field of rows.
 *
 * Segment order is load-bearing, not decorative: adjacent wedges are the pairs
 * a reader has to tell apart, so the achromatic steps sit between the accent
 * green and the amber. Validated in that order — worst adjacent pair ΔE 15.4
 * under deuteranopia, where the naive green-beside-amber order scored 6.2.
 *
 * A 2px surface-coloured gap separates the wedges so the boundary is a shape
 * cue rather than only a colour change, and the legend carries a chip, a name
 * and a number, so identity never rests on hue alone.
 */
export function Donut({ segments, size = 128, thickness = 18, total, centerLabel }: {
    segments: { label: string; value: number; hex: string }[];
    size?: number;
    thickness?: number;
    total: number;
    centerLabel?: string;
}) {
    const live = segments.filter(s => s.value > 0);
    const r = size / 2;
    const radius = r - thickness / 2;
    const circumference = 2 * Math.PI * radius;
    // A 2px gap expressed in degrees, so wedges read as separate objects.
    const gapPx = 2;

    let offset = 0;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
            aria-label={`${total} total across ${live.length} states`}>
            <circle
                cx={r} cy={r} r={radius} fill="none"
                stroke="rgb(var(--color-signal) / 0.08)" strokeWidth={thickness}
            />
            {total > 0 && live.map(s => {
                const len = (s.value / total) * circumference;
                const dash = Math.max(0, len - gapPx);
                const el = (
                    <circle
                        key={s.label}
                        cx={r} cy={r} r={radius} fill="none"
                        stroke={s.hex} strokeWidth={thickness}
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offset}
                        transform={`rotate(-90 ${r} ${r})`}
                    />
                );
                offset += len;
                return el;
            })}
            <text
                x={r} y={r - 2} textAnchor="middle" dominantBaseline="middle"
                fill="rgb(var(--color-signal))" fontSize={size * 0.26} fontWeight="700"
            >
                {total}
            </text>
            {centerLabel && (
                <text
                    x={r} y={r + size * 0.16} textAnchor="middle" dominantBaseline="middle"
                    fill="rgb(var(--color-signal) / 0.6)" fontSize={size * 0.09}
                >
                    {centerLabel}
                </text>
            )}
        </svg>
    );
}

/** Legend row for a donut: chip, name, count, share. */
export function LegendRow({ hex, label, value, share }: {
    hex: string;
    label: React.ReactNode;
    value: React.ReactNode;
    share?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-2.5 text-[13px]">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: hex }} />
            <span className="min-w-0 flex-1 truncate text-signal">{label}</span>
            <span className="shrink-0 font-bold tabular-nums text-signal">{value}</span>
            {share != null && (
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-signal opacity-60">{share}</span>
            )}
        </div>
    );
}

/**
 * Meter — a single ratio against a known limit.
 *
 * The right form when the denominator is real ("12 of 18 callbacks", "4 of 5
 * profiles up"): a track that *is* the limit, a fill that is the value, and an
 * optional target tick. A gauge would say the same thing in ten times the
 * space, and a one-bar bar chart would say it with axes nobody reads.
 *
 * The track is the same ramp as the fill rather than a foreign grey, so the
 * empty part reads as "the rest of this same quantity" instead of a different
 * material.
 */
export function Meter({ value, max, tone = 'signal', target, height = 10, className }: {
    value: number;
    max: number;
    tone?: Tone;
    /** Optional goal, drawn as a tick across the track. */
    target?: number;
    height?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    const targetPct = target != null && max > 0 ? Math.max(0, Math.min(100, (target / max) * 100)) : null;
    return (
        <div className={cn('relative w-full overflow-hidden rounded-full bg-signal/10', className)} style={{ height }}>
            <motion.div
                className={cn('absolute inset-y-0 left-0 w-full origin-left rounded-full', TONE_FILL[tone])}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: pct / 100 }}
                transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0, 0, 0.2, 1] }}
            />
            {targetPct != null && (
                <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-0.5 bg-signal"
                    style={{ left: `calc(${targetPct}% - 1px)` }}
                />
            )}
        </div>
    );
}

/**
 * Radial arc — progress around a ring, with the readout living inside it.
 *
 * Used where the quantity is genuinely cyclical or bounded and deserves to be
 * the centrepiece of its panel. Everywhere else a `Meter` is the cheaper,
 * more legible answer.
 */
export function RadialArc({ pct, size = 132, thickness = 10, tone = 'signal', children }: {
    pct: number;
    size?: number;
    thickness?: number;
    tone?: Tone;
    children?: React.ReactNode;
}) {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    const r = size / 2;
    const radius = r - thickness / 2;
    const circumference = 2 * Math.PI * radius;
    const hex = TONE_STROKE[tone];
    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <circle cx={r} cy={r} r={radius} fill="none" stroke="rgb(var(--color-signal) / 0.1)" strokeWidth={thickness} />
                <circle
                    cx={r} cy={r} r={radius} fill="none" stroke={hex} strokeWidth={thickness} strokeLinecap="round"
                    strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
                    transform={`rotate(-90 ${r} ${r})`}
                    style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0,0,0.2,1), stroke 300ms linear' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
        </div>
    );
}

/**
 * Column chart — binned magnitude over time.
 *
 * Discrete bins, so columns rather than an area: an area implies you could read
 * a value between two hours, and you cannot. One hue with brightness carrying
 * magnitude is the sequential case, so no categorical colour appears in it.
 *
 * The peak gridline is what turns a row of bars into a chart — without a
 * labelled reference the heights are decorative.
 */
export function ColumnChart({ values, height = 120, tone = 'signal', highlightLast = true, formatTip }: {
    values: number[];
    height?: number;
    tone?: Tone;
    highlightLast?: boolean;
    formatTip?: (value: number, index: number) => string;
}) {
    const max = Math.max(1, ...values);
    return (
        <div className="relative w-full" style={{ height }}>
            {/* Peak reference line, labelled — the thing that makes it a chart. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-signal/20" />
            <span aria-hidden="true" className="pointer-events-none absolute -top-1 right-0 text-[11px] tabular-nums text-signal opacity-50">
                {max}
            </span>
            <div className="flex h-full items-end gap-1">
                {values.map((v, i) => {
                    const isLast = highlightLast && i === values.length - 1;
                    return (
                        <div key={`col-${i}`} className="group/col relative flex h-full flex-1 items-end">
                            <div
                                className={cn(
                                    'w-full rounded-t-sm transition-[height] duration-500',
                                    TONE_FILL[tone],
                                    isLast && 'ring-1 ring-accent',
                                )}
                                style={{
                                    height: `${Math.max(2, (v / max) * 100)}%`,
                                    opacity: 0.28 + (v / max) * 0.72,
                                }}
                            />
                            {formatTip && (
                                <div className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-sm border border-signal/30 bg-void px-2 py-1 text-[11px] text-signal group-hover/col:block">
                                    {formatTip(v, i)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * LineChart — tempo over time, as an envelope plus the lines that matter.
 *
 * THE SERIES ARE TOLD APART BY MARK, NOT BY HUE. That is not a stylistic
 * preference: the obvious palette here — issued white, completed green,
 * errored red — puts completed and errored at ΔE 1.1 under deuteranopia.
 * They are the single most important pair on the chart to distinguish (did the
 * work land or did it fail?) and to a red-deficient operator they would be the
 * same line. So the total becomes a filled area, and only two strokes remain,
 * separated by ΔE 28.7.
 *
 * Strokes use `vector-effect: non-scaling-stroke` because the viewBox is
 * stretched horizontally to fill the panel; without it a 2px line becomes a
 * smear at wide sizes and a hairline at narrow ones.
 */
export function LineChart({ series, envelope, height = 190, xLabels, formatTip }: {
    /** Stroked series. Two is the sensible maximum here; see the note above. */
    series: { label: string; values: number[]; tone: Tone; dashed?: boolean }[];
    /** The context total, drawn as a filled area behind the lines. */
    envelope?: { label: string; values: number[] };
    height?: number;
    /** Three labels: start, middle, end of the axis. */
    xLabels?: [string, string, string];
    formatTip?: (index: number) => React.ReactNode;
}) {
    const [hover, setHover] = React.useState<number | null>(null);
    const rafRef = React.useRef<number | null>(null);
    React.useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);
    const W = 600;
    const H = 200;

    // Geometry depends only on the data. Recomputing it inside the render body
    // meant every pixel of mouse movement re-walked all 48 points of every
    // series and rebuilt their path strings, purely to move a crosshair.
    const geom = React.useMemo(() => {
        const n = Math.max(
            envelope?.values.length ?? 0,
            ...series.map(s => s.values.length),
            2,
        );
        const max = Math.max(
            1,
            ...(envelope?.values ?? []),
            ...series.flatMap(s => s.values),
        );
        const x = (i: number) => (i / Math.max(1, n - 1)) * W;
        const y = (v: number) => H - (v / max) * (H - 8);
        const toPath = (values: number[]) =>
            values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        return {
            n, max, x,
            envelopePath: envelope ? `${toPath(envelope.values)} L ${W} ${H} L 0 ${H} Z` : null,
            seriesPaths: series.map(sr => ({ ...sr, d: toPath(sr.values) })),
        };
    }, [envelope, series]);

    const { n, max, x } = geom;

    return (
        <div className="w-full">
            {/* Legend carries the MARK, not just the colour, so the difference
                survives greyscale, print and colour-vision deficiency. */}
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                {envelope && (
                    <span className="flex items-center gap-1.5 text-[11px] text-signal opacity-70">
                        <span aria-hidden="true" className="h-2.5 w-4 rounded-[1px] bg-signal/25" />
                        {envelope.label}
                    </span>
                )}
                {series.map(s => (
                    <span key={s.label} className={cn('flex items-center gap-1.5 text-[11px]', TONE_TEXT[s.tone])}>
                        <svg width="16" height="8" aria-hidden="true">
                            <line
                                x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2"
                                strokeDasharray={s.dashed ? '4 3' : undefined}
                            />
                        </svg>
                        {s.label}
                    </span>
                ))}
            </div>

            <div
                className="relative w-full"
                style={{ height }}
                onMouseLeave={() => setHover(null)}
                // Coalesced to one update per animation frame. A pointer can
                // fire mousemove far faster than the screen refreshes, and each
                // one was a setState and a re-render.
                onMouseMove={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
                    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
                    if (rafRef.current !== null) return;
                    rafRef.current = requestAnimationFrame(() => {
                        rafRef.current = null;
                        setHover(idx);
                    });
                }}
            >
                {/* Gridlines, recessive. The top one is labelled — without a
                    reference value the heights mean nothing. */}
                {[0, 0.5, 1].map(f => (
                    <div
                        key={f} aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 border-t border-signal/10"
                        style={{ top: `${f * 100}%` }}
                    />
                ))}
                <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 -translate-y-1/2 bg-void px-1 text-[11px] tabular-nums text-signal opacity-50">
                    {max}
                </span>

                <svg
                    width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                    role="img" aria-label={`${series.map(s => s.label).join(' and ')} over time`}
                >
                    {geom.envelopePath && (
                        <path d={geom.envelopePath} fill="rgb(var(--color-signal) / 0.14)" />
                    )}
                    {geom.seriesPaths.map(s => (
                        <path
                            key={s.label}
                            d={s.d}
                            fill="none"
                            stroke={TONE_STROKE[s.tone]}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            strokeDasharray={s.dashed ? '6 4' : undefined}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    {hover != null && (
                        <line
                            x1={x(hover)} y1={0} x2={x(hover)} y2={H}
                            stroke="rgb(var(--color-signal) / 0.45)" strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    )}
                </svg>

                {hover != null && formatTip && (
                    <div
                        className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-sm border border-signal/30 bg-void px-2 py-1.5 text-[11px] text-signal"
                        style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }}
                    >
                        {formatTip(hover)}
                    </div>
                )}
            </div>

            {xLabels && (
                <div className="mt-2 flex justify-between border-t border-signal/10 pt-2 text-[11px] text-signal opacity-55">
                    <span>{xLabels[0]}</span><span>{xLabels[1]}</span><span>{xLabels[2]}</span>
                </div>
            )}
        </div>
    );
}

/** A status square for grids of many same-shaped things (hosts, profiles). */
export function StatusTile({ label, state, tone, meta, onClick }: {
    label: React.ReactNode;
    state: React.ReactNode;
    tone: Tone;
    meta?: React.ReactNode;
    onClick?: () => void;
}) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'min-w-0 rounded-sm border border-signal/15 bg-signal/[0.02] px-3 py-2.5',
                onClick && 'cursor-pointer transition-colors hover:border-signal/40',
            )}
        >
            <div className="flex items-center gap-2">
                <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', TONE_FILL[tone])} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-signal">{label}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className={cn('text-[11px] font-bold', TONE_TEXT[tone])}>{state}</span>
                {meta != null && <span className="shrink-0 text-[11px] text-signal opacity-55">{meta}</span>}
            </div>
        </div>
    );
}

/** Tiny share ring — how much of a total one class accounts for. */
export function ShareRing({ pct, hex, size = 34, thickness = 4 }: {
    pct: number;
    hex: string;
    size?: number;
    thickness?: number;
}) {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    const r = size / 2;
    const radius = r - thickness / 2;
    const c = 2 * Math.PI * radius;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
            <circle cx={r} cy={r} r={radius} fill="none" stroke="rgb(var(--color-signal) / 0.12)" strokeWidth={thickness} />
            <circle
                cx={r} cy={r} r={radius} fill="none" stroke={hex} strokeWidth={thickness} strokeLinecap="round"
                strokeDasharray={`${(clamped / 100) * c} ${c}`} transform={`rotate(-90 ${r} ${r})`}
                style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0,0,0.2,1)' }}
            />
        </svg>
    );
}

/** Initials block. People are easier to find by monogram than by reading. */
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
    const initials = (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-sm border border-signal/30 bg-signal/10 font-bold text-signal"
            style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
            {initials}
        </span>
    );
}

/** Empty state — a sentence, not a shrug. */
export function NoData({ children = 'No data yet' }: { children?: React.ReactNode }) {
    return (
        <div className="flex h-full min-h-[72px] items-center justify-center text-[13px] text-signal opacity-50">
            {children}
        </div>
    );
}
