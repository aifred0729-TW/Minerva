import React, { useState } from 'react';
import { useSubscription, useMutation } from "@apollo/client/react";
import { Link } from 'react-router-dom';

import { useAppStore } from '../store';
import { SUBSCRIPTION_CONSOLE_CALLBACKS, UPDATE_CALLBACK_DESCRIPTION_MUTATION } from '../lib/api';
import { timeAgo } from '../lib/time';
import {
    Terminal, Monitor, Globe, Network, ChevronRight,
    Crown, Wifi, Skull, Pencil, Check, X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, isCallbackAlive, parseFirstIP } from '../lib/utils';
import { snackActions } from '../lib/snackbar';

// ── helpers ──────────────────────────────────────────────────────────────────

/** A session is "dead" if isCallbackAlive (sleep_info-aware) returns false */
const isSessionDead = (session: any): boolean => !isCallbackAlive(session);

function ipToRange(ipStr: string): string {
    const ip = parseFirstIP(ipStr);
    if (!ip) return 'UNKNOWN_NETWORK';
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return 'UNKNOWN_NETWORK';
}

/** Strip domain suffix from FQDN so the same machine always maps to one HostCard.
 *  e.g. "WORKSTATION1.CORP.LOCAL" with domain "CORP.LOCAL" → "WORKSTATION1" */
function normalizeHost(host: string, domain: string): string {
    if (!host) return 'UNKNOWN_HOST';
    let h = host.toUpperCase();
    if (domain) {
        const d = domain.toUpperCase();
        if (h.endsWith('.' + d)) {
            h = h.slice(0, -(d.length + 1));
        }
    }
    return h;
}

interface CallbackGroup {
    hosts: Record<string, any[]>;
    isDomain: boolean;
}

function groupCallbacks(callbacks: any[]): Record<string, CallbackGroup> {
    const groups: Record<string, CallbackGroup> = {};

    for (const cb of callbacks) {
        let groupKey: string;
        let isDomain = false;

        if (cb.domain && cb.domain.trim() !== '') {
            groupKey = cb.domain.toUpperCase();
            isDomain = true;
        } else {
            groupKey = ipToRange(cb.ip);
        }

        if (!groups[groupKey]) {
            groups[groupKey] = { hosts: {}, isDomain };
        }

        const host = normalizeHost(cb.host, cb.domain);
        if (!groups[groupKey].hosts[host]) {
            groups[groupKey].hosts[host] = [];
        }
        groups[groupKey].hosts[host].push(cb);
    }

    // Sort sessions within each host: alive first, then highest integrity, then dead last
    for (const group of Object.values(groups)) {
        for (const host of Object.keys(group.hosts)) {
            group.hosts[host].sort((a, b) => {
                const aDead = isSessionDead(a);
                const bDead = isSessionDead(b);
                if (aDead !== bDead) return aDead ? 1 : -1; // Alive first
                return (b.integrity_level ?? 0) - (a.integrity_level ?? 0); // Then by integrity
            });
        }
    }

    return groups;
}

// ── sub-components ────────────────────────────────────────────────────────────

const INTEGRITY_META: Record<number, { label: string; color: string; glow: string }> = {
    1: { label: 'LOW',    color: 'text-gray-400 border-gray-600/60 bg-gray-800/40',                  glow: '' },
    2: { label: 'MEDIUM', color: 'text-blue-400 border-blue-500/50 bg-blue-900/20',                  glow: '' },
    3: { label: 'HIGH',   color: 'text-orange-400 border-orange-500/50 bg-orange-900/20',             glow: 'shadow-[0_0_6px_rgba(251,146,60,0.3)]' },
    4: { label: 'SYSTEM', color: 'text-red-400 border-red-500/50 bg-red-900/20',                     glow: 'shadow-[0_0_8px_rgba(239,68,68,0.4)]' },
};

const IntegrityBadge = ({ level }: { level: number }) => {
    const meta = INTEGRITY_META[level] ?? { label: 'UNK', color: 'text-gray-500 border-gray-700 bg-black/30', glow: '' };
    return (
        <span className={cn('text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border rounded-sm', meta.color, meta.glow)}>
            {meta.label}
        </span>
    );
};

const OSIcon = ({ os, payloadType }: { os: string; payloadType: string }) => {
    const lowerOS = (os || '').toLowerCase();
    const lowerPT = (payloadType || '').toLowerCase();
    if (lowerOS.includes('windows') || lowerPT.includes('apollo'))
        return <Monitor size={15} className="text-blue-400" />;
    if (lowerOS.includes('linux') || lowerPT.includes('poseidon'))
        return <Terminal size={15} className="text-green-400" />;
    if (lowerOS.includes('mac') || lowerOS.includes('darwin'))
        return <Monitor size={15} className="text-gray-300" />;
    return <Monitor size={15} className="text-gray-500" />;
};

const SessionRow = ({ session, isBest }: { session: any; isBest: boolean }) => {
    const dead = isSessionDead(session);
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState(session.description || '');
    const [updateDesc, { loading: saving }] = useMutation<any>(UPDATE_CALLBACK_DESCRIPTION_MUTATION);

    const saveName = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        try {
            await updateDesc({ variables: { callback_display_id: session.display_id, description: nameValue.trim() } });
            snackActions.success('Session name updated');
        } catch { snackActions.error('Failed to save name'); }
        setEditingName(false);
    };

    const ago = timeAgo(session.last_checkin);

    return (
        <div className={cn(
            'rounded-sm transition-all duration-200 border group',
            dead
                ? 'bg-red-600 border-red-500 hover:bg-red-500 hover:border-red-400'
                : isBest
                    ? 'bg-signal/5 border-signal/25 hover:bg-signal/12 hover:border-signal/50'
                    : 'bg-white/3 border-transparent hover:bg-white/6 hover:border-white/10'
        )}>
            <Link
                to={`/console/${session.display_id}`}
                className="flex items-center justify-between px-3 py-2"
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {dead
                        ? <Skull size={14} className="text-black shrink-0" />
                        : isBest && <Crown size={10} className="text-yellow-400 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                                'font-mono text-xs font-semibold truncate max-w-[120px]',
                                dead ? 'text-black' : 'text-white'
                            )}>
                                {session.user || 'unknown'}
                            </span>
                            {dead
                                ? <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border rounded-sm bg-black/30 text-black border-black/40">DEAD</span>
                                : <IntegrityBadge level={session.integrity_level ?? 2} />
                            }
                        </div>
                        {/* Custom name / description */}
                        {!editingName && session.description && (
                            <div className={cn('text-[10px] font-mono mt-0.5 truncate italic', dead ? 'text-black/70' : 'text-signal/70')}>
                                {session.description}
                            </div>
                        )}
                        <div className={cn(
                            'text-[10px] font-mono mt-0.5 truncate',
                            dead ? 'text-black/70' : 'text-gray-500'
                        )}>
                            #{session.display_id} · {session.payload?.payloadtype?.name || 'N/A'} · {ago}
                        </div>
                    </div>
                </div>
                <ChevronRight
                    size={14}
                    className={cn(
                        'transition-colors shrink-0 ml-2',
                        dead ? 'text-black/50 group-hover:text-black' : 'text-gray-600 group-hover:text-signal'
                    )}
                />
            </Link>
            {/* Inline name edit bar */}
            {editingName ? (
                <div className="flex items-center gap-1 px-2 pb-1.5" onClick={e => e.stopPropagation()}>
                    <input
                        autoFocus
                        value={nameValue}
                        onChange={e => setNameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveName(e as unknown as React.MouseEvent); if (e.key === 'Escape') setEditingName(false); }}
                        placeholder="Custom session name…"
                        className="flex-1 bg-black/60 border border-gray-600 focus:border-signal px-2 py-0.5 text-white font-mono text-[10px] outline-none"
                    />
                    <button onClick={saveName} disabled={saving} className="p-1 text-signal hover:text-white transition-colors disabled:opacity-50"><Check size={12} /></button>
                    <button onClick={e => { e.stopPropagation(); setEditingName(false); }} className="p-1 text-gray-500 hover:text-white transition-colors"><X size={12} /></button>
                </div>
            ) : (
                <div className="flex justify-end px-2 pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setEditingName(true); }}
                        title="Set custom session name"
                        className={cn('p-0.5 rounded transition-colors', dead ? 'text-black/50 hover:text-black' : 'text-gray-600 hover:text-signal')}
                    ><Pencil size={10} /></button>
                </div>
            )}
        </div>
    );
};

const HostCard = ({ host, sessions }: { host: string; sessions: any[] }) => {
    const [expanded, setExpanded] = useState(false);
    const best = sessions[0];
    const payloadType = best?.payload?.payloadtype?.name || '';
    const shown = expanded ? sessions : sessions.slice(0, 1);
    const extraCount = sessions.length - 1;
    const allDead = sessions.every(s => isSessionDead(s));
    const aliveCount = sessions.filter(s => !isSessionDead(s)).length;
    const deadCount = sessions.length - aliveCount;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'border transition-colors duration-300 flex flex-col',
                allDead
                    ? 'border-red-500/50 bg-red-950/30 hover:border-red-400/60'
                    : 'border-ghost/30 bg-black/60 hover:border-signal/25'
            )}
        >
            {/* Card header */}
            <div className={cn(
                'border-b px-4 py-2.5 flex items-center justify-between',
                allDead
                    ? 'bg-red-900/30 border-red-500/30'
                    : 'bg-white/5 border-ghost/20'
            )}>
                <div className="flex items-center gap-2 min-w-0">
                    {allDead
                        ? <Skull size={15} className="text-red-400" />
                        : <OSIcon os={best?.os || ''} payloadType={payloadType} />
                    }
                    <span className={cn(
                        'font-mono text-sm font-bold tracking-wider truncate',
                        allDead ? 'text-red-400' : 'text-white'
                    )}>{host}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {allDead ? (
                        <>
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-[10px] text-red-400 font-mono font-bold">{sessions.length} DEAD</span>
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
                            <span className="text-[10px] text-signal font-mono font-bold">
                                {aliveCount}{deadCount > 0 ? ` · ${deadCount} ☠` : ''}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Sessions */}
            <div className="p-2 space-y-1.5 flex-1">
                {shown.map((s, idx) => (
                    <SessionRow
                        key={s.id}
                        session={s}
                        isBest={idx === 0 && !isSessionDead(sessions[0])}
                    />
                ))}

                {extraCount > 0 && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full text-[10px] font-mono text-gray-500 hover:text-signal transition-colors py-1.5 flex items-center justify-center gap-1 border border-dashed border-ghost/20 hover:border-signal/20 rounded-sm"
                    >
                        {expanded
                            ? '▲ COLLAPSE'
                            : `+ ${extraCount} MORE SESSION${extraCount !== 1 ? 'S' : ''}`}
                    </button>
                )}
            </div>
        </motion.div>
    );
};

const DomainSection = ({
    groupName,
    group,
    index,
}: {
    groupName: string;
    group: CallbackGroup;
    index: number;
}) => {
    // Sort host cards: alive hosts first (by highest integrity), then all-dead hosts last
    const hostEntries = Object.entries(group.hosts).sort(([, aSessions], [, bSessions]) => {
        const aAlive = aSessions.some(s => !isSessionDead(s));
        const bAlive = bSessions.some(s => !isSessionDead(s));
        if (aAlive !== bAlive) return aAlive ? -1 : 1;
        if (aAlive) {
            const aMaxIL = Math.max(0, ...aSessions.filter(s => !isSessionDead(s)).map((s: any) => s.integrity_level ?? 0));
            const bMaxIL = Math.max(0, ...bSessions.filter(s => !isSessionDead(s)).map((s: any) => s.integrity_level ?? 0));
            if (aMaxIL !== bMaxIL) return bMaxIL - aMaxIL;
        }
        return 0;
    });
    const totalSessions = hostEntries.reduce((n, [, sessions]) => n + sessions.length, 0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
        >
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-signal/15" />
                <div className="flex items-center gap-2 bg-black/70 border border-signal/20 px-4 py-1.5 rounded-sm shrink-0">
                    {group.isDomain
                        ? <Globe size={13} className="text-signal" />
                        : <Network size={13} className="text-signal" />}
                    <span className="font-mono text-xs text-signal tracking-widest font-bold">{groupName}</span>
                    <span className="text-[10px] text-gray-500 font-mono ml-1">
                        {hostEntries.length} HOST{hostEntries.length !== 1 ? 'S' : ''} · {totalSessions} SESSION{totalSessions !== 1 ? 'S' : ''}
                    </span>
                </div>
                <div className="h-px flex-1 bg-signal/15" />
            </div>

            {/* Host grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {hostEntries.map(([host, sessions]) => (
                    <HostCard key={host} host={host} sessions={sessions} />
                ))}
            </div>
        </motion.div>
    );
};

// ── main page ─────────────────────────────────────────────────────────────────

export default function ConsoleSelection() {
    const { isSidebarCollapsed } = useAppStore();
    const [hideDead, setHideDead] = useState(false);
    const { data, loading } = useSubscription<any>(SUBSCRIPTION_CONSOLE_CALLBACKS, {
        onError: (err) => { console.error('[SUBSCRIPTION_CONSOLE_CALLBACKS] subscription error:', err); },
    });

    const callbacks: any[] = data?.callback || [];
    const filteredCallbacks = hideDead ? callbacks.filter(cb => !isSessionDead(cb)) : callbacks;
    const groups = groupCallbacks(filteredCallbacks);
    // Sort groups: domains/ranges with at least one alive session first
    const groupEntries = Object.entries(groups).sort(([, aGroup], [, bGroup]) => {
        const aAlive = Object.values(aGroup.hosts).some((sessions: any[]) => sessions.some(s => !isSessionDead(s)));
        const bAlive = Object.values(bGroup.hosts).some((sessions: any[]) => sessions.some(s => !isSessionDead(s)));
        if (aAlive !== bAlive) return aAlive ? -1 : 1;
        return 0;
    });
    const totalSessions = callbacks.length;
    const aliveSessions = callbacks.filter(cb => !isSessionDead(cb)).length;
    const deadSessions = totalSessions - aliveSessions;

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    'transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden',
                    isSidebarCollapsed ? 'ml-16' : 'ml-64'
                )}
            >
                {/* ── Header ── */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Terminal size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">CONSOLE MATRIX</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                {loading ? 'SCANNING...' : (
                                    <>
                                        {aliveSessions} ACTIVE{deadSessions > 0 ? ` · ${deadSessions} DEAD` : ''} · {totalSessions} TOTAL
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setHideDead(!hideDead)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 border text-xs font-mono transition-colors',
                                hideDead
                                    ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:border-red-400/70 hover:text-red-300'
                                    : 'border-ghost/30 hover:border-signal/40 text-gray-500 hover:text-signal'
                            )}
                            title={hideDead ? 'Show dead sessions' : 'Hide dead sessions'}
                        >
                            <Skull size={14} />
                            {hideDead ? 'SHOWING_DEAD' : 'HIDE_DEAD'}
                        </button>
                        <button
                            onClick={() => {}}
                            className="flex items-center gap-2 px-3 py-2 border border-ghost/30 text-gray-700 cursor-default font-mono text-xs" title="Live subscription active">
                            <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
                            LIVE
                        </button>
                    </div>
                </header>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    {!loading && totalSessions === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                            <Terminal size={48} className="mb-4 opacity-20" />
                            <div className="font-mono text-sm tracking-widest">NO_ACTIVE_SESSIONS</div>
                            <div className="text-xs mt-2 opacity-50">Awaiting callbacks...</div>
                        </div>
                    )}

                    {loading && totalSessions === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                            <Wifi size={40} className="mb-4 opacity-30 animate-pulse" />
                            <div className="font-mono text-sm tracking-widest animate-pulse">SCANNING_NETWORK...</div>
                        </div>
                    )}

                    <div className="space-y-10">
                        {groupEntries.map(([groupName, group], idx) => (
                            <DomainSection
                                key={groupName}
                                groupName={groupName}
                                group={group}
                                index={idx}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Legend ── */}
                {totalSessions > 0 && (
                    <div className="border-t border-ghost/10 py-3 flex items-center gap-6 shrink-0">
                        <div className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">LEGEND:</div>
                        {[
                            { level: 4, icon: <Crown size={10} className="text-yellow-400" /> },
                            { level: 3 },
                            { level: 2 },
                            { level: 1 },
                        ].map(({ level, icon }) => (
                            <div key={level} className="flex items-center gap-1.5">
                                {icon}
                                <IntegrityBadge level={level} />
                                {level === 4 && (
                                    <span className="text-[10px] text-gray-600 font-mono">= Default entry</span>
                                )}
                            </div>
                        ))}
                        <div className="w-px h-4 bg-ghost/20" />
                        <div className="flex items-center gap-1.5">
                            <Skull size={12} className="text-red-400" />
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border rounded-sm bg-red-600 text-black border-red-500">DEAD</span>
                            <span className="text-[10px] text-gray-600 font-mono">= Timed out / Deactivated</span>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
