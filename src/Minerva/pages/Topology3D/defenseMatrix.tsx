import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DefenseState } from './defenseMarks';

/* =============================================================================
   DEFENCE MATRIX — the three states an operator checks before they act
   -----------------------------------------------------------------------------
   Drawn in the netrunner-console idiom the operator asked for (see
   docs/DESIGN_LANGUAGE Section 11.1): a won state fills the row and inverts
   its text, a losing state stays dark and red, an unassessed one stays quiet.

   Two of the three are operator marks, because Mythic reports neither
   endpoint-protection nor firewall state — click cycles
   UNKNOWN → BYPASSED → ACTIVE and the mark is remembered per host
   (see `defenseMarks.ts`). PRIVILEGE is derived live from the callback's
   integrity level and is therefore read-only.
============================================================================= */

export type MatrixState = 'won' | 'lost' | 'unknown';

const MATRIX_SURFACE: Record<MatrixState, string> = {
    won: 'border-accent bg-accent text-void',
    lost: 'border-red-400/40 bg-red-400/[0.06] text-red-400',
    unknown: 'border-signal/15 bg-signal/[0.04] text-signal',
};

const MATRIX_BADGE: Record<MatrixState, string> = {
    won: 'border-void/45 text-void',
    lost: 'border-red-400/50 text-red-400',
    unknown: 'border-signal/25 text-signal opacity-70',
};

export const MatrixRow = ({
    state, badge, title, detail, icon: Icon, onClick, hint, chamfer, className, style,
}: {
    state: MatrixState;
    badge: string;
    title: string;
    detail: string;
    icon: LucideIcon;
    /** Omitted for derived rows — they are readouts, not controls. */
    onClick?: () => void;
    hint?: string;
    /** clip-path for the reference's cut right edge. Only the dossier passes
     *  it; the docked panel keeps the console's plain rounded row. */
    chamfer?: string;
    className?: string;
    style?: React.CSSProperties;
}) => {
    const body = (
        <>
            <span className={cn(
                'shrink-0 rounded-[2px] border px-1.5 py-[1px] text-[10px] font-bold tracking-[0.12em]',
                MATRIX_BADGE[state],
            )}>
                {badge}
            </span>
            <Icon size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold tracking-[0.15em]">{title}</span>
                <span className={cn('block truncate text-[10px] tracking-[0.05em]', state === 'won' ? 'text-void/75' : 'opacity-70')}>
                    {detail}
                </span>
            </span>
        </>
    );
    const shell = cn(
        'flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors duration-150',
        chamfer ? 'pr-5' : 'rounded-sm',
        MATRIX_SURFACE[state],
        className,
    );
    const shape = { ...(chamfer ? { clipPath: chamfer } : null), ...style };
    if (!onClick) return <div className={shell} style={shape} title={hint}>{body}</div>;
    return (
        <button
            type="button"
            onClick={onClick}
            title={hint}
            style={shape}
            className={cn(
                shell, 'cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset',
                state === 'won' ? 'hover:bg-accent/85 focus-visible:ring-void'
                    : state === 'lost' ? 'hover:bg-red-400/[0.14] hover:border-red-400/70 focus-visible:ring-red-400'
                    : 'hover:bg-signal/[0.10] hover:border-signal/50 focus-visible:ring-signal/60',
            )}
        >
            {body}
        </button>
    );
};

/** Operator mark → row state. `bypassed` is the win: the defence is down. */
export const markState = (v: DefenseState): MatrixState =>
    v === 'bypassed' ? 'won' : v === 'active' ? 'lost' : 'unknown';
