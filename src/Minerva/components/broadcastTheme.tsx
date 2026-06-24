// ═════════════════════════════════════════════════════════════════════
//  broadcastTheme — shared visual language for important broadcasts
//
//  Used by:
//    - ImportantBroadcast (the top-of-screen alert bar)
//    - EventFeed (renders minerva_broadcast events as "broadcast cards")
//    - BroadcastComposerModal (live preview)
//
//  Single source of truth for icon + tone palette + message decoding.
// ═════════════════════════════════════════════════════════════════════
import React from 'react';
import { AlertTriangle, Siren, Radio, Bell } from 'lucide-react';
import type { BroadcastLevel } from '../lib/broadcastBus';

// -- Minerva warning triangle (identical to Login loading-screen SVG) --------

export function MinervaWarning({ size = 26, className }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 56 56" fill="none" className={className}>
            <path d="M28 4 L52 48 L4 48 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="miter" />
            <path d="M28 12 L46 44 L10 44 Z" stroke="currentColor" strokeWidth="0.5" fill="none" strokeLinejoin="miter" opacity="0.4" />
            <path d="M28 22 L28 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
            <path d="M28 38 L30 40 L28 42 L26 40 Z" fill="currentColor" />
        </svg>
    );
}

// -- Level palette -----------------------------------------------------------

export interface BroadcastTone {
    fg: string;
    border: string;
    glow: string;
    bar: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const LEVEL_TONE: Record<BroadcastLevel, BroadcastTone> = {
    info:     { fg: 'text-signal',     border: 'border-signal/70',     glow: 'rgba(220,220,255,0.50)', bar: 'bg-signal',     label: 'INFO',     icon: Bell           },
    warning:  { fg: 'text-yellow-300', border: 'border-yellow-400/70', glow: 'rgba(250,204,21,0.60)',  bar: 'bg-yellow-400', label: 'WARNING',  icon: AlertTriangle  },
    critical: { fg: 'text-red-300',    border: 'border-red-400/70',    glow: 'rgba(248,113,113,0.65)', bar: 'bg-red-400',    label: 'CRITICAL', icon: Siren          },
    ops:      { fg: 'text-cyan-300',   border: 'border-cyan-300/70',   glow: 'rgba(103,232,249,0.55)', bar: 'bg-cyan-400',   label: 'OPS',      icon: Radio          },
};

const VALID_LEVELS: ReadonlySet<string> = new Set<string>(['info', 'warning', 'critical', 'ops']);

// -- Decode operationeventlog.message produced by the composer ---------------

export interface DecodedBroadcast {
    level: BroadcastLevel;
    title: string;
    body?: string;
    from?: string;
}

export function parseBroadcastMessage(message: string): DecodedBroadcast | null {
    try {
        const obj = JSON.parse(message);
        if (!obj || obj.minerva_broadcast !== 1) return null;
        const level: BroadcastLevel = VALID_LEVELS.has(obj.level) ? obj.level : 'info';
        const title = typeof obj.title === 'string' && obj.title ? obj.title : 'BROADCAST';
        const body = typeof obj.body === 'string' && obj.body ? obj.body : undefined;
        const from = typeof obj.from === 'string' && obj.from ? obj.from : undefined;
        return { level, title, body, from };
    } catch {
        return null;
    }
}
