/* =============================================================================
 *  LinkPanel parts — shared building blocks for the LINK_TO_PARENT UI used by
 *  both the 2D CallbackGraph and the 3D Topology view.
 *
 *  These used to carry their own loud-HUD silhouette (chamfered clip-paths,
 *  L-shaped corner ticks, inverted ID blocks, glow stacks). They now speak the
 *  same language as every other floating surface in the console — the shared
 *  `components/CyberPanel` vocabulary: glass shell, framed rows, state chips,
 *  a targeting bar on hover. The Cyberpunk feel is carried by motion and by
 *  the accent tone, not by extra chrome.
 * ===========================================================================*/
import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    PANEL_ITEM_ATTR, PanelBar, PanelChip, panelRowClass, TONE_ICON,
    type PanelTone,
} from '../CyberPanel';

/* ── Section header: label, optional icon/hint/count, hairline ──────── */
export const Section: React.FC<{
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    count?: number;
    children: React.ReactNode;
}> = ({ label, hint, icon, count, children }) => (
    <div>
        <div className="mb-1.5 flex items-center gap-2.5">
            {icon && <span className="shrink-0 text-accent">{icon}</span>}
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-signal opacity-70 shrink-0">{label}</span>
            {hint && <span className="text-[10px] tracking-[0.15em] text-accent shrink-0">{hint}</span>}
            <span aria-hidden="true" className="h-px flex-1 bg-signal/15" />
            {typeof count === 'number' && (
                <span className="shrink-0 text-[10px] font-bold tracking-[0.15em] text-signal opacity-70 tabular-nums">
                    {count.toString().padStart(2, '0')}
                </span>
            )}
        </div>
        <div className="space-y-1">{children}</div>
    </div>
);

/* ── Single-choice row — target machines, C2 profiles ───────────────── */
export const SelectableTile: React.FC<{
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ selected, onClick, children }) => {
    const tone: PanelTone = selected ? 'active' : 'default';
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            {...{ [PANEL_ITEM_ATTR]: '' }}
            onClick={onClick}
            className={panelRowClass(tone)}
        >
            <PanelBar tone={tone} />
            {children}
            <span aria-hidden="true" className="flex-1" />
            <ChevronRight
                size={11}
                strokeWidth={2}
                aria-hidden="true"
                className={cn(
                    'shrink-0 transition-all duration-150',
                    selected
                        ? 'opacity-100 text-accent'
                        : cn('opacity-0 -translate-x-1 group-hover/row:opacity-70 group-hover/row:translate-x-0 group-focus-visible/row:opacity-70 group-focus-visible/row:translate-x-0', TONE_ICON[tone]),
                )}
            />
        </button>
    );
};

/* ── Segmented choice (P2P vs EGRESS) ───────────────────────────────── */
export const ChamferedToggle: React.FC<{
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
    <button
        type="button"
        role="radio"
        aria-checked={active}
        {...{ [PANEL_ITEM_ATTR]: '' }}
        onClick={onClick}
        className={cn(
            'flex min-h-[34px] items-center justify-center gap-2 rounded-sm border px-2',
            'text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
            active
                ? 'border-accent/60 bg-accent/10 text-accent focus-visible:ring-accent'
                : 'border-signal/15 bg-signal/[0.04] text-signal hover:border-signal/50 hover:bg-signal/[0.10] focus-visible:ring-signal/60',
        )}
    >
        <span aria-hidden="true" className={active ? 'text-accent' : 'text-signal/70'}>{icon}</span>
        <span>{label}</span>
    </button>
);

/* ── Footer actions — one primary, the rest ghosts ───────────────────── */
export const ActionButton: React.FC<{
    variant: 'ghost' | 'primary';
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    children: React.ReactNode;
}> = ({ variant, onClick, icon, disabled, children }) => {
    if (variant === 'ghost') {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    'flex min-h-[32px] items-center gap-2 rounded-md border border-signal/20 px-3',
                    'text-[10px] font-bold uppercase tracking-[0.25em] text-signal transition-colors duration-150 cursor-pointer',
                    'hover:border-signal/50 hover:bg-signal/[0.08]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal/60',
                )}
            >
                {icon}
                <span>{children}</span>
            </button>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'group/cta flex min-h-[32px] items-center gap-2 rounded-md border px-3',
                'text-[10px] font-bold uppercase tracking-[0.25em] transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                disabled
                    ? 'cursor-not-allowed border-signal/20 bg-transparent text-signal opacity-40'
                    : 'cursor-pointer border-accent bg-accent/[0.08] text-accent hover:bg-accent hover:text-void',
            )}
        >
            {icon}
            <span>{children}</span>
            {!disabled && (
                <ChevronRight size={12} strokeWidth={2} aria-hidden="true"
                    className="transition-transform duration-200 group-hover/cta:translate-x-1" />
            )}
        </button>
    );
};

/* ── Running/Stopped state chip ─────────────────────────────────────── */
export const StatusPill: React.FC<{ running: boolean }> = ({ running }) => (
    <PanelChip text={running ? 'RUNNING' : 'STOPPED'} tone={running ? 'active' : 'muted'} />
);

/* ── Quiet placeholder for an empty list ────────────────────────────── */
export const EmptyTile: React.FC<{ text: string }> = ({ text }) => (
    <div className="rounded-sm border border-dashed border-signal/15 px-3 py-3 text-center text-[10px] uppercase tracking-[0.2em] text-signal opacity-70">
        {text}
    </div>
);

/* ── Small labelled icon used in Section headers ─────────────────────── */
export const SectionIcon: React.FC<{ icon: LucideIcon }> = ({ icon: Icon }) => (
    <Icon size={11} strokeWidth={2} aria-hidden="true" className="text-accent" />
);
