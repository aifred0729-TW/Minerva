import React from 'react';
import { parseIPString } from '../../lib/utils';
import type { CbRow, StatusTier } from '../../types/tasks';
import { b64Decode as b64DecodeLib } from '../../components/OutputRenderer';

// ─── helpers ──────────────────────────────────────────────────────────────────

export const fmtTs  = (ts?: string | null) => ts ? new Date(ts).toLocaleString() : '—';
export const fmtHM  = (ts?: string | null) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export const b64Decode = b64DecodeLib;

export const parseFirstIP = (ip: string): string => parseIPString(ip)[0] || ip || '';

export const domainKey = (cb: CbRow): string => {
    if (cb.domain?.trim() && cb.domain.trim() !== '-') return cb.domain.trim().toUpperCase();
    const ip = parseFirstIP(cb.ip ?? '');
    const p  = ip.split('.');
    return p.length >= 3 ? `${p[0]}.${p[1]}.${p[2]}.x` : 'UNKNOWN';
};

export const isDomainKey = (k: string) => !/^\d+\.\d+\.\d+\.x$/.test(k) && k !== 'UNKNOWN';

/** domain → host → sessions */
export const buildTree = (cbs: CbRow[]) => {
    const domMap = new Map<string, Map<string, CbRow[]>>();
    for (const cb of cbs) {
        const dk = domainKey(cb);
        if (!domMap.has(dk)) domMap.set(dk, new Map());
        const hm   = domMap.get(dk)!;
        const host = (cb.host || `C${cb.display_id}`).toUpperCase();
        if (!hm.has(host)) hm.set(host, []);
        hm.get(host)!.push(cb);
    }
    return new Map([...domMap.entries()].sort(([a], [b]) => {
        if (isDomainKey(a) && !isDomainKey(b)) return -1;
        if (!isDomainKey(a) && isDomainKey(b)) return 1;
        return a.localeCompare(b);
    }));
};

export const statusTier = (s: string): StatusTier => {
    const l = (s ?? '').toLowerCase();
    if (l.includes('complet') || l.includes('success')) return 'ok';
    if (l.includes('error'))   return 'error';
    if (l.includes('process')) return 'running';
    if (l.includes('submit'))  return 'pending';
    return 'idle';
};

export const TIER_COLOR: Record<StatusTier, string> = {
    ok:      '#00ff9d',
    error:   '#ff4444',
    running: '#ffbe00',
    pending: '#00c2ff',
    idle:    '#555',
};

export const TIER_LABEL: Record<StatusTier, string> = {
    ok: 'DONE', error: 'ERR', running: 'RUN', pending: 'WAIT', idle: '—',
};

// ─── tiny atoms ───────────────────────────────────────────────────────────────

export const Dot = ({ tier, size = 8 }: { tier: StatusTier; size?: number }) => (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: size, height: size }}>
        {tier === 'running' && (
            <span className="mv-dot-ring" style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: TIER_COLOR['running'],
            }}/>
        )}
        <span style={{
            width: size, height: size, borderRadius: '50%',
            backgroundColor: TIER_COLOR[tier],
            boxShadow: tier !== 'idle' ? `0 0 6px ${TIER_COLOR[tier]}88` : undefined,
            display: 'inline-block', position: 'relative',
        }}/>
    </span>
);

export const CbBadge = ({ id }: { id: number }) => (
    <span className="inline-flex items-center px-2 h-5 font-mono text-[11px] border border-[#00ffd140] text-[#00ffd1] bg-[#00ffd110] rounded-sm leading-none whitespace-nowrap font-semibold">
        C{id}
    </span>
);

export const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-white/[0.06] last:border-0">
        <span className="font-mono text-[11px] text-[#888] uppercase tracking-[0.1em] self-start pt-0.5">{label}</span>
        <span className="font-mono text-[13px] text-[#e0e0e0] min-w-0 break-all">{value ?? <span className="text-[#666]">—</span>}</span>
    </div>
);

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-6 mb-2 font-mono text-[11px] text-[#666] uppercase tracking-[0.15em]">{children}</p>
);
