/* =============================================================================
 *  CyberPanel — the shared anchored-panel design system
 *  ---------------------------------------------------------------------------
 *  One vocabulary for every floating surface in the console: the 3D context
 *  menus, LINK_TO_PARENT, and the QuickHack stack. It is the login screen's
 *  docked panel (DESIGN_LANGUAGE Section 6) shrunk to popover scale —
 *  header strip / body / footer strip over glass — with the rows drawn as
 *  actual controls so they read as pressable before the pointer arrives.
 *
 *  Rules this module encodes, so no consumer has to re-decide them:
 *    - glass: `border-signal/20 bg-void/80 backdrop-blur-sm rounded-md`;
 *    - rows: 1px frame + faint fill at rest, brighter frame on hover, a
 *      focus ring in the row's own tone, and a targeting bar that drops in
 *      on the left edge under pointer/focus;
 *    - the right edge stays EMPTY unless it carries state — actions get a
 *      chevron on hover, states get a chip;
 *    - `hud-*` stays on the login screen (Section 1), so the instrument tone
 *      here is `accent` and the destructive tone is `red-400`;
 *  Scale note: `components/Instrument.tsx` is the page-level kit (InstrumentPanel,
 *  DataRow, Rail, Readout). This module is its floating-surface sibling — use
 *  Instrument for panels that live in a page, CyberPanel for anything that
 *  opens over the top of one.
 *
 *    - Cyberpunk is rationed to two motions: one scan streak across the
 *      header as the panel lands, and the hover targeting bar. Nothing is
 *      added to the resting frame.
 * ===========================================================================*/
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export type PanelTone = 'default' | 'active' | 'danger' | 'muted';

/** Row label colour. Static text is never dimmed (Section 1 contrast rule) —
 *  only the disabled/pending tone uses opacity. */
export const TONE_TEXT: Record<PanelTone, string> = {
    default: 'text-signal',
    active: 'text-accent',
    danger: 'text-red-400',
    muted: 'text-signal opacity-40',
};

/** Icons are decoration, so alpha is allowed on them (Section 1). */
export const TONE_ICON: Record<PanelTone, string> = {
    default: 'text-signal/70',
    active: 'text-accent',
    danger: 'text-red-400',
    muted: 'text-signal/40',
};

/** Resting surface + hover. One layer, no glow stacking (Section 10 #10). */
export const TONE_SURFACE: Record<PanelTone, string> = {
    default: 'border-signal/15 bg-signal/[0.04] hover:border-signal/50 hover:bg-signal/[0.10] active:bg-signal/[0.14]',
    active: 'border-accent/40 bg-accent/[0.06] hover:border-accent hover:bg-accent/[0.12] active:bg-accent/[0.16]',
    danger: 'border-red-400/25 bg-red-400/[0.05] hover:border-red-400/70 hover:bg-red-400/[0.12] active:bg-red-400/[0.16]',
    muted: 'border-signal/10 bg-transparent',
};

/** Focus is never removed, only re-drawn in the row's own tone. */
export const TONE_FOCUS: Record<PanelTone, string> = {
    default: 'focus-visible:ring-signal/60',
    active: 'focus-visible:ring-accent',
    danger: 'focus-visible:ring-red-400',
    muted: 'focus-visible:ring-signal/40',
};

/** The targeting bar that drops in on the row's left edge. */
export const TONE_BAR: Record<PanelTone, string> = {
    default: 'bg-signal',
    active: 'bg-accent',
    danger: 'bg-red-400',
    muted: 'bg-signal/40',
};

export const TONE_CHIP: Record<PanelTone, string> = {
    default: 'border-signal/25 bg-void/50 text-signal',
    active: 'border-accent/50 bg-accent/10 text-accent',
    danger: 'border-red-400/40 bg-red-400/10 text-red-400',
    muted: 'border-signal/15 bg-transparent text-signal opacity-40',
};

/** Every focusable row carries this, so the roving-focus handler can walk a
 *  panel without each consumer registering anything. */
export const PANEL_ITEM_ATTR = 'data-panelitem';

/** Shared frame for a row-shaped control. Exported so panels that need a
 *  custom row body (the link picker's two-line tiles) still get the exact
 *  same surface, focus ring and geometry. */
export const panelRowClass = (tone: PanelTone, disabled?: boolean) => cn(
    'group/row relative overflow-hidden w-full flex items-center gap-2.5 rounded-sm border px-2.5 py-[6px]',
    'text-left text-[11px] transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
    TONE_FOCUS[tone],
    disabled ? 'cursor-not-allowed' : 'cursor-pointer',
    TONE_SURFACE[tone],
);

/** The left-edge targeting bar. Drop it inside anything using panelRowClass. */
export const PanelBar = ({ tone = 'default' as PanelTone }) => (
    <span
        aria-hidden="true"
        className={cn(
            'absolute left-0 inset-y-0 w-[2px] origin-center scale-y-0 transition-transform duration-150',
            'group-hover/row:scale-y-100 group-focus-visible/row:scale-y-100',
            TONE_BAR[tone],
        )}
    />
);

/** Anchor / dismiss / keyboard behaviour for popovers fired from a pointer.
 *  Placement flips rather than merely clamping: opening near the bottom of
 *  the viewport puts the panel above the cursor instead of under it. */
export const useAnchoredPanel = (
    x: number,
    y: number,
    onClose: () => void,
    opts?: { focusOnOpen?: boolean; closeOnTab?: boolean },
) => {
    const focusOnOpen = opts?.focusOnOpen ?? true;
    const closeOnTab = opts?.closeOnTab ?? true;
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: y, left: x });

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || (closeOnTab && e.key === 'Tab')) onClose();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose, closeOnTab]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { width: w, height: h } = el.getBoundingClientRect();
        const pad = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const top = (y + h > vh - pad && y - h > pad) ? y - h : Math.min(y, Math.max(pad, vh - h - pad));
        const left = (x + w > vw - pad && x - w > pad) ? x - w : Math.min(x, Math.max(pad, vw - w - pad));
        setPos(prev => (prev.top === top && prev.left === left ? prev : { top, left }));
        // The panel itself takes focus (not the first row) so the keyboard is
        // live immediately without lighting a row the mouse is nowhere near.
        if (focusOnOpen) el.focus({ preventScroll: true });
    }, [x, y, focusOnOpen]);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const list = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>(`[${PANEL_ITEM_ATTR}]:not([disabled])`) ?? [],
        );
        if (!list.length) return;
        e.preventDefault();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        const next =
            e.key === 'Home' ? list[0]
            : e.key === 'End' ? list[list.length - 1]
            : e.key === 'ArrowDown' ? list[(at + 1) % list.length]
            : list[(at <= 0 ? list.length : at) - 1];
        next?.focus();
    }, []);

    return { ref, pos, onKeyDown };
};

/** One-shot scan streak — the panel's arrival, not a permanent decoration. */
export const PanelStreak = () => {
    const reduce = useReducedMotion();
    if (reduce) return null;
    return (
        <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-signal/20 to-transparent"
            initial={{ x: '-140%' }}
            animate={{ x: '340%' }}
            transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1], delay: 0.06 }}
        />
    );
};

/** The glass panel: header strip, body, footer strip. */
export const PanelShell = ({
    innerRef, pos, width, onKeyDown, icon: Icon, iconTone = 'text-accent',
    title, subtitle, badge, badgeTone, onClose, role = 'menu', ariaLabel,
    footer, footerLeft, footerRight, footerTone, bodyClass, className, children,
}: {
    innerRef?: React.RefObject<HTMLDivElement | null>;
    /** Fixed-position anchor. Omit for a panel positioned by its parent. */
    pos?: { top: number; left: number };
    width?: number;
    onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    icon: LucideIcon;
    iconTone?: string;
    title: string;
    /** Second header line — what this panel is pointed at. */
    subtitle?: string;
    badge?: string;
    badgeTone?: string;
    /** When given, the header grows a close control on its right edge. */
    onClose?: () => void;
    role?: string;
    ariaLabel?: string;
    /** Full custom footer (action buttons). Wins over footerLeft/Right. */
    footer?: React.ReactNode;
    footerLeft?: string;
    footerRight?: string;
    footerTone?: string;
    bodyClass?: string;
    className?: string;
    children: React.ReactNode;
}) => {
    const reduce = useReducedMotion();
    return (
        <motion.div
            ref={innerRef}
            role={role}
            tabIndex={-1}
            aria-orientation={role === 'menu' ? 'vertical' : undefined}
            aria-label={ariaLabel ?? title}
            onKeyDown={onKeyDown}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.14, ease: [0.22, 0.68, 0, 1] }}
            style={pos ? { top: pos.top, left: pos.left, width } : { width }}
            className={cn(
                'rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm font-mono focus:outline-none pointer-events-auto',
                pos && 'fixed z-[9999]',
                className,
            )}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            {/* Header strip — left says what this is, right says how it is */}
            <div className="relative overflow-hidden flex items-center gap-3 px-4 py-2.5 border-b border-signal/15">
                <PanelStreak />
                <div className="relative flex items-center gap-2.5 min-w-0 flex-1">
                    <Icon size={13} strokeWidth={2} aria-hidden="true" className={cn('shrink-0', iconTone)} />
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold tracking-[0.25em] text-signal truncate">{title}</div>
                        {subtitle && (
                            <div className="text-[10px] tracking-[0.15em] text-signal opacity-70 truncate mt-0.5">{subtitle}</div>
                        )}
                    </div>
                </div>
                {badge && (
                    <span className={cn('relative text-[10px] font-bold tracking-[0.2em] shrink-0', badgeTone ?? 'text-signal opacity-70')}>
                        {badge}
                    </span>
                )}
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className={cn(
                            'relative shrink-0 rounded-sm border border-signal/15 p-1 text-signal/70 transition-colors',
                            'hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-400',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400',
                        )}
                    >
                        <X size={11} strokeWidth={2} aria-hidden="true" />
                    </button>
                )}
            </div>

            {/* Internal scroll — the strips stay put however long the body gets
                (Section 4: 頁面 chrome 永遠不動). */}
            <div className={cn('py-1.5 overflow-y-auto custom-scrollbar', bodyClass ?? 'max-h-[min(56vh,520px)]')}>
                {children}
            </div>

            {(footer || footerLeft || footerRight) && (
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-signal/15">
                    {footer ?? (
                        <>
                            <span className="text-[10px] tracking-[0.2em] text-signal opacity-70 truncate">{footerLeft}</span>
                            {footerRight && (
                                <span className={cn('text-[10px] font-bold tracking-[0.2em] shrink-0 tabular-nums', footerTone ?? 'text-signal')}>
                                    {footerRight}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}
        </motion.div>
    );
};

/** Group label + hairline, with an optional count on the right. */
export const PanelGroup = ({ label, count, hint, children }: {
    label: string;
    count?: number;
    hint?: string;
    children: React.ReactNode;
}) => (
    <div className="pt-1.5 first:pt-0" role="group" aria-label={label}>
        <div className="flex items-center gap-2.5 px-4 pb-1">
            <span className="text-[10px] font-bold tracking-[0.25em] text-signal opacity-70 shrink-0">{label}</span>
            {hint && <span className="text-[10px] tracking-[0.15em] text-accent shrink-0">{hint}</span>}
            <span aria-hidden="true" className="flex-1 h-px bg-signal/15" />
            {typeof count === 'number' && (
                <span className="text-[10px] font-bold tracking-[0.15em] text-signal opacity-70 tabular-nums shrink-0">
                    {count.toString().padStart(2, '0')}
                </span>
            )}
        </div>
        <div className="px-3 space-y-1">{children}</div>
    </div>
);

export const PanelChip = ({ text, tone = 'default' as PanelTone, className }: {
    text: string;
    tone?: PanelTone;
    className?: string;
}) => (
    <span className={cn(
        'shrink-0 rounded-[3px] border px-1.5 py-[1px] text-[10px] font-bold tracking-[0.12em] tabular-nums leading-[1.4]',
        TONE_CHIP[tone],
        className,
    )}>
        {text}
    </span>
);

/** A row-shaped control.
 *
 *  `confirmLabel` arms the row instead of firing it — the second press
 *  commits. Reserved for actions that cannot be undone. */
export const PanelRow = ({
    icon: Icon, label, detail, status, tone = 'default', statusTone, onClick, disabled, title,
    checked, selected, confirmLabel, confirmStatus, children,
}: {
    icon?: LucideIcon;
    label?: string;
    /** Secondary text on the same line — an inline label-value pair, the one
     *  place Section 1 allows opacity on text. */
    detail?: string;
    status?: string;
    tone?: PanelTone;
    /** Chip tone when it differs from the row's own (an OFF toggle sits on a
     *  normal row but reports a muted state). */
    statusTone?: PanelTone;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
    /** Toggle: reports on/off to AT. */
    checked?: boolean;
    /** Single-choice picker: reports the pick to AT and tones the row. */
    selected?: boolean;
    confirmLabel?: string;
    confirmStatus?: string;
    /** Custom body, for rows that need more than label + detail. */
    children?: React.ReactNode;
}) => {
    const [armed, setArmed] = useState(false);
    const resolved: PanelTone = disabled ? 'muted' : armed ? 'danger' : selected ? 'active' : tone;

    // An armed row disarms itself — an operator who walked away should not
    // come back to a destructive action waiting one click away.
    useEffect(() => {
        if (!armed) return;
        const id = setTimeout(() => setArmed(false), 4000);
        return () => clearTimeout(id);
    }, [armed]);

    const fire = () => {
        if (disabled) return;
        if (confirmLabel && !armed) { setArmed(true); return; }
        setArmed(false);
        onClick?.();
    };

    const role = selected !== undefined ? 'menuitemradio'
        : checked !== undefined ? 'menuitemcheckbox'
        : 'menuitem';

    return (
        <button
            type="button"
            role={role}
            aria-checked={selected ?? checked}
            aria-disabled={disabled || undefined}
            aria-label={armed ? confirmLabel : undefined}
            {...{ [PANEL_ITEM_ATTR]: '' }}
            title={title}
            disabled={disabled}
            onClick={fire}
            onBlur={() => setArmed(false)}
            className={panelRowClass(resolved, disabled)}
        >
            <PanelBar tone={resolved} />
            {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" className={cn('shrink-0', TONE_ICON[resolved])} />}
            {children ?? (
                <>
                    <span className={cn('truncate tracking-[0.1em]', TONE_TEXT[resolved])}>
                        {armed ? confirmLabel : label}
                    </span>
                    {detail && <span className="truncate text-[10px] text-signal opacity-70">{detail}</span>}
                </>
            )}
            <span aria-hidden="true" className="flex-1" />
            {(armed ? confirmStatus : status) ? (
                <PanelChip text={(armed ? confirmStatus : status) as string} tone={armed ? 'danger' : (statusTone ?? resolved)} />
            ) : (
                /* Action rows carry no badge — the label already says what they
                   do. A chevron slides in under the pointer instead, so the
                   right edge stays empty until it means something. */
                <ChevronRight
                    size={11}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={cn(
                        'shrink-0 opacity-0 -translate-x-1 transition-all duration-150',
                        'group-hover/row:opacity-70 group-hover/row:translate-x-0',
                        'group-focus-visible/row:opacity-70 group-focus-visible/row:translate-x-0',
                        TONE_ICON[resolved],
                    )}
                />
            )}
        </button>
    );
};

/** Same grammar, read-only — no frame, no chip. The absence of a control
 *  frame is what tells the operator this row is a fact, not a button. */
export const PanelReadout = ({ label, value, valueTone }: {
    label: string;
    value: string;
    valueTone?: string;
}) => (
    <div className="w-full flex items-baseline gap-2.5 px-4 py-[7px] text-[11px]">
        <span className="whitespace-nowrap tracking-[0.1em] text-signal opacity-70">{label}</span>
        <span aria-hidden="true" className="flex-1" />
        <span className={cn('shrink-0 font-bold tracking-[0.15em]', valueTone ?? 'text-signal')}>{value}</span>
    </div>
);

/** The panel's one headline action.
 *
 *  It rides the SAME row geometry as everything else in the panel — same
 *  height, same padding, same type size, same left alignment. Emphasis is
 *  carried by tone (an accent frame and fill) and by the chevron that stays
 *  visible instead of appearing on hover. It used to be a full-width 38px
 *  centred CTA borrowed from the login screen, which put a page-scale button
 *  on top of a 30px menu and read as a different component entirely
 *  (UX: a consistent size scale is what makes a list scannable). */
export const PanelPrimary = ({
    icon: Icon, label, hint, tone = 'accent', onClick, disabled, className,
}: {
    icon?: LucideIcon;
    label: string;
    hint?: string;
    tone?: 'accent' | 'danger';
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}) => (
    <div className="px-3 pb-1.5">
        <button
            type="button"
            role="menuitem"
            {...{ [PANEL_ITEM_ATTR]: '' }}
            onClick={onClick}
            disabled={disabled}
            aria-label={hint ? `${label} ${hint}` : label}
            className={cn(
                'group/cta flex w-full items-center gap-2.5 rounded-sm border px-2.5 py-[6px]',
                'text-left text-[11px] font-bold transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
                disabled
                    ? 'cursor-not-allowed border-signal/15 bg-transparent text-signal opacity-40'
                    : tone === 'danger'
                        ? 'cursor-pointer border-red-400/60 bg-red-400/10 text-red-400 hover:bg-red-400 hover:text-void focus-visible:ring-red-400'
                        : 'cursor-pointer border-accent/60 bg-accent/10 text-accent hover:bg-accent hover:text-void focus-visible:ring-accent',
                className,
            )}
        >
            {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />}
            <span className="truncate tracking-[0.12em]">{label}</span>
            <span aria-hidden="true" className="flex-1" />
            {hint && <span className="shrink-0 tabular-nums opacity-70">{hint}</span>}
            {!disabled && (
                <ChevronRight
                    size={11}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 transition-transform duration-150 group-hover/cta:translate-x-0.5"
                />
            )}
        </button>
    </div>
);

/** Secondary action — same geometry, quieter frame. */
export const PanelGhost = ({ icon: Icon, label, onClick, className }: {
    icon?: LucideIcon;
    label: string;
    onClick: () => void;
    className?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'flex min-h-[32px] items-center justify-center gap-2 rounded-md border border-signal/20 px-3',
            'text-[10px] font-bold tracking-[0.25em] text-signal transition-colors duration-150 cursor-pointer',
            'hover:border-signal/50 hover:bg-signal/[0.08]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal/60',
            className,
        )}
    >
        {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" />}
        {label}
    </button>
);

/** Two-up (or n-up) segmented choice — P2P vs EGRESS and friends. */
export const PanelSegment = <T extends string>({ options, value, onChange }: {
    options: { value: T; label: string; icon?: LucideIcon }[];
    value: T;
    onChange: (v: T) => void;
}) => (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
        {options.map(o => {
            const on = o.value === value;
            const Icon = o.icon;
            return (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    {...{ [PANEL_ITEM_ATTR]: '' }}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'flex min-h-[32px] items-center justify-center gap-2 rounded-sm border px-2',
                        'text-[10px] font-bold tracking-[0.2em] transition-colors duration-150 cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
                        on
                            ? 'border-accent/60 bg-accent/10 text-accent focus-visible:ring-accent'
                            : 'border-signal/15 bg-signal/[0.04] text-signal hover:border-signal/50 hover:bg-signal/[0.10] focus-visible:ring-signal/60',
                    )}
                >
                    {Icon && <Icon size={11} strokeWidth={2} aria-hidden="true" />}
                    {o.label}
                </button>
            );
        })}
    </div>
);

/** Text input in the panel's language — the login screen's input row. */
export const PanelInput = ({ value, onChange, placeholder, prefix, ariaLabel }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    prefix?: string;
    ariaLabel?: string;
}) => (
    <div className="relative">
        {prefix && (
            <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-signal opacity-70">
                {prefix}
            </span>
        )}
        <input
            type="text"
            value={value}
            aria-label={ariaLabel}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
                'w-full min-h-[32px] rounded-sm border border-signal/15 bg-signal/[0.04] py-1.5 pr-2.5',
                'text-[11px] tracking-[0.1em] text-signal transition-colors',
                'placeholder:text-signal/40 hover:border-signal/50',
                'focus:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                prefix ? 'pl-7' : 'pl-2.5',
            )}
        />
    </div>
);

/** Quiet placeholder for an empty list. */
export const PanelEmpty = ({ text }: { text: string }) => (
    <div className="rounded-sm border border-dashed border-signal/15 px-3 py-3 text-center text-[10px] tracking-[0.2em] text-signal opacity-70">
        {text}
    </div>
);
