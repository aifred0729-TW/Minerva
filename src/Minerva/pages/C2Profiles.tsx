import React, { useState, useMemo, useCallback } from 'react';
import { useSubscription, useMutation } from '@apollo/client';
import { SUB_C2_PROFILES, START_STOP_PROFILE_MUTATION, TOGGLE_C2_PROFILE_DELETE } from '../lib/api';
import { Radio, Power, RefreshCw, Settings, Trash2, RotateCcw, Eye, EyeOff, Server, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { C2DetailsModal } from '../components/C2DetailsModal';

import { useAppStore } from '../store';
import type { StatusGroup } from '../types/c2profiles';

/* ═══════════════════════════════════════════════════════
   Status Column Board — Mission Control Layout
   Three vertical lanes showing profile status at a glance
═══════════════════════════════════════════════════════ */

const LANE_CONFIG: Record<StatusGroup, {
    label: string; sub: string;
    dot: string; text: string; border: string; headerBg: string; glow: string;
}> = {
    active: {
        label: "ACTIVE", sub: "All systems nominal",
        dot: "bg-green-500 shadow-[0_0_8px_#22c55e]",
        text: "text-green-400", border: "border-green-500/25",
        headerBg: "bg-green-500/[0.04]", glow: "shadow-[0_0_40px_rgba(34,197,94,0.04)]",
    },
    degraded: {
        label: "DEGRADED", sub: "Partial service",
        dot: "bg-amber-500 shadow-[0_0_8px_#f59e0b]",
        text: "text-amber-400", border: "border-amber-500/25",
        headerBg: "bg-amber-500/[0.04]", glow: "shadow-[0_0_40px_rgba(245,158,11,0.04)]",
    },
    offline: {
        label: "OFFLINE", sub: "Service stopped",
        dot: "bg-red-500/70",
        text: "text-red-400/70", border: "border-white/[0.06]",
        headerBg: "bg-white/[0.015]", glow: "",
    },
};

/* ── Profile Tile ──────────────────────────────────── */
interface TileProps {
    profile: any;
    group: StatusGroup;
    isProcessing: boolean;
    onToggle: (id: number, running: boolean) => void;
    onDelete: (id: number, deleted: boolean) => void;
    onOpenModal: (p: Record<string, unknown>) => void;
}

function ProfileTile({ profile, group, isProcessing, onToggle, onDelete, onOpenModal }: TileProps) {
    const [expanded, setExpanded] = useState(false);
    const cfg = LANE_CONFIG[group];

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: profile.deleted ? 0.45 : 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8, transition: { duration: 0.25 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
                "group relative border bg-black/30 transition-colors duration-200",
                cfg.border,
                "hover:bg-white/[0.03]"
            )}
        >
            {/* Accent top edge */}
            <div className={cn("absolute top-0 inset-x-0 h-px", group === 'active' ? "bg-green-500/40" : group === 'degraded' ? "bg-amber-500/30" : "bg-white/5")} />

            {/* Main row */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
                {/* Status dot */}
                <div className="relative shrink-0">
                    <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                    {group === 'active' && <div className={cn("absolute inset-0 w-2 h-2 rounded-full mv-dot-ring", cfg.dot)} />}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-signal text-[13px] tracking-wide truncate">{profile.name}</span>
                        {profile.is_p2p && <span className="text-[8px] font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1 py-px tracking-widest">P2P</span>}
                        {profile.deleted && <span className="text-[8px] font-mono font-bold text-gray-500 bg-white/5 border border-white/8 px-1 py-px tracking-widest">DEL</span>}
                    </div>
                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">
                        {profile.author} &middot; v{profile.semver}
                    </div>
                </div>

                {/* Sub-system indicators (compact) */}
                <div className="shrink-0 flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full", profile.container_running ? "bg-green-500/80" : "bg-gray-700")} title={profile.container_running ? "Container running" : "Container stopped"} />
                    <div className={cn("w-1.5 h-1.5 rounded-full", profile.running ? "bg-green-500/80" : "bg-gray-700")} title={profile.running ? "Server listening" : "Server stopped"} />
                </div>

                {/* Expand chevron */}
                <div className="shrink-0 text-gray-700 group-hover:text-gray-500 transition-colors">
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
                            {/* Sub-system detail */}
                            <div className="flex gap-2">
                                <div className={cn("flex-1 flex items-center gap-2 px-2.5 py-2 border text-[10px] font-mono tracking-wider", profile.container_running ? "border-green-500/15 text-green-400/80" : "border-white/5 text-gray-600")}>
                                    <Cpu size={11} /> CONTAINER {profile.container_running ? "UP" : "DOWN"}
                                </div>
                                <div className={cn("flex-1 flex items-center gap-2 px-2.5 py-2 border text-[10px] font-mono tracking-wider", profile.running ? "border-green-500/15 text-green-400/80" : "border-white/5 text-gray-600")}>
                                    <Server size={11} /> SERVER {profile.running ? "UP" : "DOWN"}
                                </div>
                            </div>

                            {/* Description */}
                            {profile.description && (
                                <p className="text-[11px] text-gray-500 leading-relaxed font-mono">{profile.description}</p>
                            )}

                            {/* Agent tags */}
                            {profile.payloadtypec2profiles?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {profile.payloadtypec2profiles.map((pt: any) => (
                                        <span key={pt.payloadtype.name} className="px-1.5 py-0.5 text-[9px] font-mono text-gray-500 bg-white/3 border border-white/5 tracking-wider">
                                            {pt.payloadtype.name}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-1.5 pt-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggle(profile.id, profile.running); }}
                                    disabled={isProcessing}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2 border text-[10px] font-mono font-bold tracking-widest transition-all",
                                        isProcessing
                                            ? "border-yellow-500/30 text-yellow-500 bg-yellow-500/5 cursor-wait"
                                            : profile.running
                                                ? "border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                                                : "border-green-500/20 text-green-400 hover:bg-green-500/10 hover:border-green-500/40"
                                    )}
                                >
                                    {isProcessing
                                        ? <><RefreshCw size={11} className="animate-spin" /> WAIT</>
                                        : <><Power size={11} /> {profile.running ? "STOP" : "START"}</>
                                    }
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenModal(profile); }}
                                    className="px-3 py-2 border border-white/8 text-gray-600 hover:text-signal hover:border-signal/30 transition-all"
                                    title="Config & Terminal"
                                >
                                    <Settings size={12} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(profile.id, profile.deleted); }}
                                    className={cn(
                                        "px-3 py-2 border transition-all",
                                        profile.deleted
                                            ? "border-white/8 text-gray-600 hover:text-green-400 hover:bg-green-500/10"
                                            : "border-white/8 text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                                    )}
                                    title={profile.deleted ? "Restore" : "Delete"}
                                >
                                    {profile.deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ── Status Lane (column) ──────────────────────────── */
function StatusLane({ group, profiles, processingId, onToggle, onDelete, onOpenModal }: {
    group: StatusGroup;
    profiles: any[];
    processingId: number | null;
    onToggle: (id: number, running: boolean) => void;
    onDelete: (id: number, deleted: boolean) => void;
    onOpenModal: (p: Record<string, unknown>) => void;
}) {
    const cfg = LANE_CONFIG[group];

    return (
        <div className={cn("flex-1 flex flex-col min-w-0 border border-white/[0.04] bg-black/20 overflow-hidden", cfg.glow)}>
            {/* Lane Header */}
            <div className={cn("shrink-0 px-5 py-4 border-b border-white/5", cfg.headerBg)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className={cn("w-2.5 h-2.5 rounded-full", cfg.dot)} />
                            {group === 'active' && profiles.length > 0 && (
                                <div className={cn("absolute inset-0 w-2.5 h-2.5 rounded-full mv-dot-ring", cfg.dot)} />
                            )}
                        </div>
                        <div>
                            <div className={cn("text-xs font-mono font-bold tracking-[0.3em]", cfg.text)}>{cfg.label}</div>
                            <div className="text-[9px] font-mono text-gray-600 mt-0.5 tracking-wide">{cfg.sub}</div>
                        </div>
                    </div>
                    <div className={cn("text-2xl font-bold font-mono leading-none", profiles.length > 0 ? cfg.text : "text-gray-700/50")}>
                        {profiles.length}
                    </div>
                </div>
            </div>

            {/* Lane Body */}
            <div className="flex-1 overflow-y-auto cyber-scrollbar p-2 space-y-1.5">
                <AnimatePresence mode="popLayout">
                    {profiles.map((p: Record<string, unknown>) => (
                        <ProfileTile
                            key={p.id}
                            profile={p}
                            group={group}
                            isProcessing={processingId === p.id}
                            onToggle={onToggle}
                            onDelete={onDelete}
                            onOpenModal={onOpenModal}
                        />
                    ))}
                </AnimatePresence>

                {profiles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-700/50">
                        <Radio size={20} className="mb-2" />
                        <span className="text-[9px] font-mono tracking-[0.2em]">EMPTY</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Main Page ─────────────────────────────────────── */
export default function C2Profiles() {
    const { isSidebarCollapsed } = useAppStore();
    const { data, loading } = useSubscription(SUB_C2_PROFILES);

    const [modalProfile, setModalProfile] = useState<unknown>(null);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [showDeleted, setShowDeleted] = useState(false);

    const [startStopProfile] = useMutation(START_STOP_PROFILE_MUTATION, {
        onCompleted: () => setProcessingId(null),
        onError: () => setProcessingId(null),
    });
    const [toggleDelete] = useMutation(TOGGLE_C2_PROFILE_DELETE, {
        onError: (err) => console.error('Failed to toggle delete status', err),
    });

    const handleDelete = useCallback((id: number, currentDeleted: boolean) => {
        toggleDelete({ variables: { c2profile_id: id, deleted: !currentDeleted } });
    }, [toggleDelete]);

    const handleToggle = useCallback((id: number, currentStatus: boolean) => {
        setProcessingId(id);
        startStopProfile({ variables: { id, action: currentStatus ? "stop" : "start" } });
    }, [startStopProfile]);

    const allProfiles = useMemo(() => data?.c2profile || [], [data]);

    // Group into lanes
    const lanes = useMemo(() => {
        const active: any[] = [];
        const degraded: any[] = [];
        const offline: any[] = [];

        allProfiles.forEach((p: Record<string, unknown>) => {
            if (p.deleted && !showDeleted) return;
            if (p.deleted) { offline.push(p); return; }
            if (p.running && p.container_running) { active.push(p); }
            else if (p.running || p.container_running) { degraded.push(p); }
            else { offline.push(p); }
        });

        return { active, degraded, offline };
    }, [allProfiles, showDeleted]);

    const stats = useMemo(() => {
        const a = allProfiles.filter((p: Record<string, unknown>) => !p.deleted);
        return {
            total: a.length,
            deleted: allProfiles.length - a.length,
        };
    }, [allProfiles]);

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
            <div className={cn(
                "transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden",
                isSidebarCollapsed ? "ml-16" : "ml-64"
            )}>
                {/* ── Header Bar ───────────────────────────────── */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Radio size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">C2 PROFILES</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                {stats.total} CHANNELS REGISTERED
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Quick stats inline */}
                        <div className="hidden md:flex items-center gap-4 text-[10px] font-mono mr-4">
                            <span className="flex items-center gap-1.5">
                                <span className={cn("w-1.5 h-1.5 rounded-full", lanes.active.length > 0 ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-gray-700")} />
                                <span className={lanes.active.length > 0 ? "text-green-400" : "text-gray-600"}>{lanes.active.length}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className={cn("w-1.5 h-1.5 rounded-full", lanes.degraded.length > 0 ? "bg-amber-500" : "bg-gray-700")} />
                                <span className={lanes.degraded.length > 0 ? "text-amber-400" : "text-gray-600"}>{lanes.degraded.length}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className={cn("w-1.5 h-1.5 rounded-full", lanes.offline.length > 0 ? "bg-red-500/70" : "bg-gray-700")} />
                                <span className={lanes.offline.length > 0 ? "text-red-400/70" : "text-gray-600"}>{lanes.offline.length}</span>
                            </span>
                        </div>

                        <button
                            onClick={() => setShowDeleted(prev => !prev)}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono tracking-wider border transition-all",
                                showDeleted
                                    ? "border-amber-500/30 text-amber-400 bg-amber-500/5"
                                    : "border-white/8 text-gray-600 hover:text-gray-400 hover:border-white/15"
                            )}
                        >
                            {showDeleted ? <Eye size={11} /> : <EyeOff size={11} />}
                            {stats.deleted > 0 && <span>({stats.deleted})</span>}
                        </button>

                        <div className={cn("p-1.5 border border-white/8 text-gray-600", loading && "text-signal")} title="Live subscription active">
                            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        </div>
                    </div>
                </header>

                {/* ── Column Board ──────────────────────────────── */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar">
                    {loading && allProfiles.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 font-mono text-xs gap-2">
                            <RefreshCw className="animate-spin" size={14} />
                            SCANNING INFRASTRUCTURE...
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="h-full flex gap-3 lg:gap-4"
                        >
                            <StatusLane group="active"   profiles={lanes.active}   processingId={processingId} onToggle={handleToggle} onDelete={handleDelete} onOpenModal={setModalProfile} />
                            <StatusLane group="degraded" profiles={lanes.degraded} processingId={processingId} onToggle={handleToggle} onDelete={handleDelete} onOpenModal={setModalProfile} />
                            <StatusLane group="offline"  profiles={lanes.offline}  processingId={processingId} onToggle={handleToggle} onDelete={handleDelete} onOpenModal={setModalProfile} />
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Full Detail Modal */}
            <C2DetailsModal
                profile={modalProfile}
                isOpen={!!modalProfile}
                onClose={() => setModalProfile(null)}
            />
        </div>
    );
}
