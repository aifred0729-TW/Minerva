/* =============================================================================
 *  LinkPanel parts — shared building blocks for the LINK_TO_PARENT UI used by
 *  both the 2D CallbackGraph and the 3D Topology view.
 *
 *  Design language: Cyberpunk 2077 HUD silhouette × Minerva minimalist palette.
 *      surface        — bg-void / bg-black
 *      primary text   — text-signal (white, never faded)
 *      accent         — text-accent (green) for active / live signals
 *      dead callbacks — text-red-500 (the only non-monochrome exception, kept
 *                       consistent with the existing Skull convention)
 *      borders        — signal/30~50 thin, accent for active states
 *      shape          — chamfered bottom-right corner via clip-path
 * ===========================================================================*/
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/* ── Chamfered (angled) bottom-right clip-path — signature silhouette ─── */
export const PANEL_CHAMFER  = 'polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%)';
export const TILE_CHAMFER   = 'polygon(0 0, 100% 0, 100% calc(100% - 8px),  calc(100% - 8px)  100%, 0 100%)';
export const BUTTON_CHAMFER = 'polygon(0 0, 100% 0, 100% calc(100% - 6px),  calc(100% - 6px)  100%, 0 100%)';

/* ── Decorative L-shape corner ticks bracketing panel edges ─────────── */
export const CornerTicks: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
    const anchor = side === 'left' ? 'left-0' : 'right-0';
    const skipBottom = side === 'right'; // chamfered corner is bottom-right
    return (
        <>
            <div className={cn('pointer-events-none absolute z-10 top-0 h-px w-3 bg-signal', anchor)} />
            <div className={cn('pointer-events-none absolute z-10 top-0 w-px h-3 bg-signal', anchor)} />
            {!skipBottom && (
                <>
                    <div className={cn('pointer-events-none absolute z-10 bottom-0 h-px w-3 bg-signal', anchor)} />
                    <div className={cn('pointer-events-none absolute z-10 bottom-0 w-px h-3 bg-signal', anchor)} />
                </>
            )}
        </>
    );
};

/* ── Section header with icon + label + optional hint/count + live LEDs ── */
export const Section: React.FC<{
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    count?: number;
    children: React.ReactNode;
}> = ({ label, hint, icon, count, children }) => (
    <div>
        <div className="mb-2 flex items-center gap-2">
            {icon && (
                <span className="flex items-center justify-center w-5 h-5 border border-signal/40 bg-signal/[0.04] text-accent">
                    {icon}
                </span>
            )}
            <span className="text-[10px] uppercase tracking-[0.3em] text-signal">{label}</span>
            {hint && <span className="text-[9px] uppercase tracking-[0.25em] text-accent">{hint}</span>}
            {typeof count === 'number' && (
                <span className="border border-signal/40 px-1.5 py-px text-[9px] tracking-[0.2em] text-signal">
                    {count.toString().padStart(2, '0')}
                </span>
            )}
            <span className="h-px flex-1 bg-signal/30" />
            <span className="flex items-center gap-1">
                <span className="h-1 w-1 bg-accent animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="h-1 w-1 bg-accent animate-pulse" style={{ animationDelay: '180ms' }} />
                <span className="h-1 w-1 bg-accent animate-pulse" style={{ animationDelay: '360ms' }} />
            </span>
        </div>
        {children}
    </div>
);

/* ── Clickable row used for target nodes & profiles ─────────────────── */
export const SelectableTile: React.FC<{
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ selected, onClick, children }) => (
    <button
        onClick={onClick}
        style={{ clipPath: TILE_CHAMFER }}
        className={cn(
            'group relative flex w-full items-center gap-2 pl-3 pr-5 py-2 text-left text-[11px] text-signal',
            'border-l-2 transition-all duration-150',
            'hover:scale-[1.005] active:scale-[0.99]',
            selected
                ? 'border-l-accent bg-signal/10 shadow-[inset_0_0_12px_rgba(34,197,94,0.12)]'
                : 'border-l-signal/30 bg-signal/[0.03] hover:border-l-signal hover:bg-signal/[0.07] hover:shadow-[inset_0_0_10px_rgba(255,255,255,0.04)]'
        )}
    >
        <span className={cn(
            'absolute left-1 transition-all duration-200 pointer-events-none',
            selected
                ? 'opacity-100 translate-x-0 text-accent'
                : 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-signal'
        )}>
            <ChevronRight size={10} strokeWidth={3} />
        </span>
        {children}
    </button>
);

/* ── Two-up toggle (e.g. P2P vs EGRESS) ─────────────────────────────── */
export const ChamferedToggle: React.FC<{
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        style={{ clipPath: TILE_CHAMFER }}
        className={cn(
            'group flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] uppercase tracking-[0.3em] transition-all duration-150',
            'hover:scale-[1.02] active:scale-[0.98]',
            active
                ? 'bg-signal text-void font-bold shadow-[0_0_16px_rgba(255,255,255,0.18)]'
                : 'bg-signal/[0.04] text-signal border-l-2 border-l-signal/40 hover:border-l-accent hover:bg-signal/10 hover:shadow-[0_0_12px_rgba(34,197,94,0.18)]'
        )}
    >
        <span className={cn('transition-transform duration-200', active ? '' : 'group-hover:translate-x-0.5')}>
            {icon}
        </span>
        <span>{label}</span>
    </button>
);

/* ── Footer action button — primary (solid accent w/ pulsing glow) or ghost ── */
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
                onClick={onClick}
                style={{ clipPath: BUTTON_CHAMFER }}
                className={cn(
                    'group flex items-center gap-1.5 px-4 py-2 text-[11px] uppercase tracking-[0.25em] font-bold',
                    'border border-signal/50 text-signal transition-all duration-150',
                    'hover:scale-[1.03] hover:border-signal hover:bg-signal/10 active:scale-[0.97]'
                )}
            >
                {icon}
                <span>{children}</span>
            </button>
        );
    }
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{ clipPath: BUTTON_CHAMFER }}
            className={cn(
                'group flex items-center gap-2 px-5 py-2 text-[11px] uppercase tracking-[0.3em] font-bold transition-all duration-150',
                disabled
                    ? 'cursor-not-allowed bg-signal/10 text-signal opacity-40'
                    : [
                        'bg-accent text-void',
                        'shadow-[0_0_22px_rgba(34,197,94,0.45)]',
                        'hover:scale-[1.04] hover:shadow-[0_0_30px_rgba(34,197,94,0.7)] hover:bg-signal',
                        'active:scale-[0.97]',
                    ]
            )}
        >
            {icon}
            <span>{children}</span>
            {!disabled && (
                <ChevronRight size={12} strokeWidth={3} className="transition-transform duration-200 group-hover:translate-x-1" />
            )}
        </button>
    );
};

/* ── Running/Stopped status pill with pulsing LED ───────────────────── */
export const StatusPill: React.FC<{ running: boolean }> = ({ running }) => (
    <span className={cn(
        'flex items-center gap-1.5 border px-1.5 py-px text-[9px] uppercase tracking-[0.2em] shrink-0',
        running
            ? 'border-accent/60 bg-accent/10 text-accent shadow-[0_0_8px_rgba(34,197,94,0.25)]'
            : 'border-signal/40 text-signal'
    )}>
        <span className={cn(
            'h-1 w-1 rounded-full',
            running ? 'bg-accent animate-pulse shadow-[0_0_4px_currentColor] text-accent' : 'bg-signal text-signal'
        )} />
        {running ? 'RUNNING' : 'STOPPED'}
    </span>
);

/* ── Empty placeholder tile ─────────────────────────────────────────── */
export const EmptyTile: React.FC<{ text: string }> = ({ text }) => (
    <div
        style={{ clipPath: TILE_CHAMFER }}
        className="border-l-2 border-l-signal/30 bg-signal/[0.03] pl-3 pr-5 py-3 text-center text-[10px] uppercase tracking-[0.3em] text-signal"
    >
        {text}
    </div>
);
