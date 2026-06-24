// ═════════════════════════════════════════════════════════════════════
//  Important Broadcast bus — global queue for top-center alerts.
//
//  Used by the <ImportantBroadcast /> bar mounted in Layout. Any code
//  may push a broadcast via pushBroadcast(). The bar collapses to a
//  pulsing AlertTriangle by default and expands rightward with a
//  cyberpunk reveal when one is active.
// ═════════════════════════════════════════════════════════════════════
import { create } from 'zustand';
import { playCallback } from './soundEffects';

export type BroadcastLevel = 'info' | 'warning' | 'critical' | 'ops';

export interface Broadcast {
    id: string;
    level: BroadcastLevel;
    title: string;
    message?: string;
    /** Created-at ms */
    ts: number;
    /** Auto-collapse to icon-only after this many ms (still kept until ttl). 0 = never collapse. */
    holdMs?: number;
    /** Total time to keep in queue. 0 = persist until dismissed. */
    ttlMs?: number;
    /** Optional dedupe key — only one broadcast per key kept. */
    key?: string;
}

interface BroadcastState {
    broadcasts: Broadcast[];
    pushBroadcast: (b: Omit<Broadcast, 'id' | 'ts'> & { id?: string; ts?: number }) => string;
    dismiss: (id: string) => void;
    clear: () => void;
    /** Returns true if a broadcast with this dedupe key has already been pushed. */
    hasKey: (key: string) => boolean;
}

const _firedKeys = new Set<string>();

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
    broadcasts: [],
    pushBroadcast: (input) => {
        const id = input.id || `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const ts = input.ts || Date.now();
        const key = input.key;
        if (key) {
            if (_firedKeys.has(key)) return id;
            _firedKeys.add(key);
        }
        const broadcast: Broadcast = {
            id,
            level: input.level,
            title: input.title,
            message: input.message,
            ts,
            holdMs: input.holdMs ?? 6000,
            ttlMs: input.ttlMs ?? 30_000,
            key,
        };
        // Play callback audio every time a broadcast is actually queued
        playCallback();
        set(s => {
            // If a broadcast with the same key already exists, replace it
            const filtered = key ? s.broadcasts.filter(b => b.key !== key) : s.broadcasts;
            return { broadcasts: [...filtered, broadcast] };
        });
        const ttl = broadcast.ttlMs;
        if (ttl && ttl > 0) {
            setTimeout(() => get().dismiss(id), ttl);
        }
        return id;
    },
    // Guard: if the id is not present, return the SAME state reference so
    // Zustand skips the re-render entirely. Previously `.filter()` always
    // created a new array reference even when nothing was removed, which
    // caused ImportantBroadcast's useEffect to fire after ttlMs-based
    // dismissal and phantom-re-expand an already-gone broadcast.
    dismiss: (id) => set(s => {
        const next = s.broadcasts.filter(b => b.id !== id);
        if (next.length === s.broadcasts.length) return s; // nothing changed
        return { broadcasts: next };
    }),
    clear: () => set({ broadcasts: [] }),
    hasKey: (key) => _firedKeys.has(key),
}));

/** Convenience helper for non-React code. */
export function pushBroadcast(b: Omit<Broadcast, 'id' | 'ts'> & { id?: string; ts?: number }) {
    return useBroadcastStore.getState().pushBroadcast(b);
}
