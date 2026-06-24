import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useSubscription, useQuery } from "@apollo/client/react";
import { useLazyQueryCompat as useLazyQuery } from "../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell,
    Search,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Info,
    RefreshCw,
    ChevronDown,
    CheckCheck,
    Flag,
    MoreVertical,
    Bug,
    Shield,
    Users,
    Terminal,
    Server,
    Filter,
    Megaphone
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { snackActions } from '../lib/snackbar';
import { meState } from '../lib/state';
import { useReactiveVar } from "@apollo/client/react";
import { toLocalTime } from '../lib/time';
import {
    GET_EVENT_FEED,
    GET_EVENT_FEED_WITH_RESOLVED,
    SUBSCRIBE_EVENTS,
    UPDATE_RESOLUTION,
    UPDATE_TO_WARNING,
    RESOLVE_ALL_VIEWABLE,
    RESOLVE_ALL_ERRORS,
    GET_MY_OPERATION_ROLE,
} from '../lib/api';
import { BroadcastComposerModal } from '../components/BroadcastComposerModal';
import { MinervaWarning, LEVEL_TONE, parseBroadcastMessage } from '../components/broadcastTheme';

// ============================================
// Types
// ============================================
interface EventLog {
    id: number;
    level: string;
    message: string;
    resolved: boolean;
    timestamp: string;
    count: number;
    source: string;
    warning: boolean;
    operator?: { username: string };
}

type LevelFilter = 'all' | 'warning_unresolved' | 'warning_resolved' | 'info' | 'debug' | 'api' | 'auth' | 'agent';

// ============================================
// Minerva Broadcast Event Row
//   Renders an operationeventlog entry whose source === 'minerva_broadcast'
//   using the same visual language as the top-of-screen broadcast bar.
// ============================================
const MinervaBroadcastEventRow = ({ event, viewUtc }: { event: EventLog; viewUtc: boolean }) => {
    const decoded = parseBroadcastMessage(event.message);
    if (!decoded) return null;
    const tone = LEVEL_TONE[decoded.level];
    const Icon = tone.icon;
    return (
        <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
                'relative mb-2 border bg-black/85 overflow-hidden',
                tone.border,
            )}
            style={{ boxShadow: `0 0 0 1px rgba(0,0,0,0.55), 0 4px 26px -8px ${tone.glow}` }}
        >
            {/* Scanlines */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.6) 0,rgba(255,255,255,0.6) 1px,transparent 1px,transparent 4px)' }}
            />
            {/* Corner brackets */}
            <span className={cn('pointer-events-none absolute top-0 left-0 h-px w-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute top-0 left-0 w-px h-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute top-0 right-0 h-px w-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute top-0 right-0 w-px h-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute bottom-0 left-0 h-px w-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute bottom-0 left-0 w-px h-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute bottom-0 right-0 h-px w-5', tone.fg.replace('text-', 'bg-'))} />
            <span className={cn('pointer-events-none absolute bottom-0 right-0 w-px h-5', tone.fg.replace('text-', 'bg-'))} />

            <div className="relative flex items-stretch">
                {/* Triangle column */}
                <div className={cn('relative flex-shrink-0 grid place-items-center border-r px-5', tone.border)}>
                    <span className={cn('absolute inset-3 border animate-ping opacity-15 rounded-sm', tone.border)} />
                    <MinervaWarning size={36} className={cn('relative z-10', tone.fg)} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-mono font-bold tracking-[0.22em] border px-2 py-0.5', tone.fg, tone.border)}>
                            <Icon size={10} /> {tone.label}
                        </span>
                        <span className="text-[10px] font-mono text-gray-300 uppercase tracking-widest flex items-center gap-1">
                            <Megaphone size={10} /> BROADCAST
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">#{event.id}</span>
                        {event.count > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-signal/10 text-signal rounded">×{event.count}</span>
                        )}
                    </div>

                    <div className={cn('text-lg font-mono font-bold tracking-widest leading-tight uppercase truncate', tone.fg)}>
                        {decoded.title}
                    </div>

                    {decoded.body && (
                        <div className="mt-1.5 text-sm text-gray-100 font-mono leading-snug whitespace-pre-wrap break-words">
                            {decoded.body}
                        </div>
                    )}

                    <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] font-mono text-gray-300">
                        <span className="flex items-center gap-1">
                            <Users size={11} className="text-gray-300" />
                            {decoded.from || event.operator?.username || 'unknown'}
                        </span>
                        <span className="text-gray-500">·</span>
                        <span className="tabular-nums">{toLocalTime(event.timestamp, viewUtc)}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

// ============================================
// Event Item Component
// ============================================
const EventItem = ({ 
    event, 
    onResolve, 
    onMakeWarning,
    viewUtc
}: { 
    event: EventLog; 
    onResolve: (id: number, resolved: boolean) => void;
    onMakeWarning: (id: number) => void;
    viewUtc: boolean;
}) => {
    const [showMenu, setShowMenu] = useState(false);

    const getIcon = () => {
        if (event.warning) {
            return event.resolved 
                ? <CheckCircle size={16} className="text-green-500" />
                : <AlertTriangle size={16} className="text-amber-400" />;
        }
        
        switch (event.level) {
            case 'debug': return <Bug size={16} className="text-purple-400" />;
            case 'api': return <Server size={16} className="text-blue-400" />;
            case 'auth': return <Shield size={16} className="text-yellow-400" />;
            case 'agent': return <Terminal size={16} className="text-cyan-400" />;
            default: return <Info size={16} className="text-cyan-400" />;
        }
    };

    const getBorderColor = () => {
        if (event.warning && !event.resolved) return 'border-l-amber-500';
        if (event.warning && event.resolved) return 'border-l-green-500';
        return 'border-l-cyan-500/30';
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
                "relative bg-black/40 border border-signal/10 border-l-4 mb-2 hover:bg-signal/5 transition-colors",
                getBorderColor(),
                event.warning && !event.resolved && "bg-amber-500/5"
            )}
        >
            <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-signal/10 rounded">
                            {getIcon()}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">
                                    #{event.id}
                                </span>
                                <span className="text-xs text-signal/60 uppercase tracking-wider">
                                    {event.level}
                                </span>
                                {event.count > 1 && (
                                    <span className="text-xs px-1.5 py-0.5 bg-signal/10 text-signal rounded">
                                        ×{event.count}
                                    </span>
                                )}
                                {event.operator?.username && (
                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <Users size={10} />
                                        {event.operator.username}
                                    </span>
                                )}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                                {toLocalTime(event.timestamp, viewUtc)}
                            </div>
                        </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="relative">
                        <button 
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-1 text-gray-500 hover:text-signal transition-colors"
                        >
                            <MoreVertical size={16} />
                        </button>
                        
                        <AnimatePresence>
                            {showMenu && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-40" 
                                        onClick={() => setShowMenu(false)} 
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="absolute right-0 top-8 z-50 bg-black border border-signal/30 shadow-lg min-w-[140px]"
                                    >
                                        {event.warning ? (
                                            <button
                                                onClick={() => {
                                                    onResolve(event.id, !event.resolved);
                                                    setShowMenu(false);
                                                }}
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-signal/10 transition-colors flex items-center gap-2"
                                            >
                                                {event.resolved ? (
                                                    <>
                                                        <XCircle size={14} className="text-amber-400" />
                                                        Unresolve
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle size={14} className="text-green-400" />
                                                        Resolve
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    onMakeWarning(event.id);
                                                    setShowMenu(false);
                                                }}
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-signal/10 transition-colors flex items-center gap-2"
                                            >
                                                <Flag size={14} className="text-amber-400" />
                                                Make Warning
                                            </button>
                                        )}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
                
                {/* Message */}
                <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words pl-10 overflow-x-auto">
                    {event.message}
                </pre>
                
                {/* Source */}
                {event.source && (
                    <div className="text-[10px] text-gray-600 font-mono mt-2 pl-10">
                        source: {event.source}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ============================================
// Main Page Component
// ============================================
export default function EventFeed() {
    const { isSidebarCollapsed, alertCount } = useAppStore(useShallow(s => ({ isSidebarCollapsed: s.isSidebarCollapsed, alertCount: s.alertCount })));
    const me = useReactiveVar(meState);
    const viewUtc = (me?.user?.view_utc_time as boolean) || false;
    
    const [events, setEvents] = useState<EventLog[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<LevelFilter>(alertCount > 0 ? 'warning_unresolved' : 'info');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [fromNow] = useState(new Date().toISOString());
    const DEFAULT_PAGE_LIMIT = 100;
    const [pageData, setPageData] = useState({ totalCount: 0, limit: DEFAULT_PAGE_LIMIT, offset: 0 });

    // ── Broadcast permission check (admin or lead in current op) ──────
    const isAdmin = !!me?.user?.admin;
    const currentUserId: number = (me?.user?.user_id as number) ?? (me?.user?.id as number) ?? 0;
    const currentOpId: number = (me?.user?.current_operation_id as number) ?? 0;
    const currentOpName: string | undefined = me?.user?.current_operation as string | undefined;
    const { data: roleData } = useQuery<any>(GET_MY_OPERATION_ROLE, {
        variables: { user_id: currentUserId, op_id: currentOpId },
        skip: !currentUserId || !currentOpId || isAdmin,
        fetchPolicy: 'cache-and-network',
    });
    const isLeadInCurrent = !!roleData?.operatoroperation?.some((oo: any) => oo.view_mode === 'lead');
    const canBroadcast = isAdmin || isLeadInCurrent;

    const levelOptions: { value: LevelFilter; label: string; icon: React.ReactNode }[] = [
        { value: 'all', label: 'All Levels', icon: <Filter size={14} /> },
        { value: 'warning_unresolved', label: 'Warnings (Unresolved)', icon: <AlertTriangle size={14} className="text-amber-400" /> },
        { value: 'warning_resolved', label: 'Warnings (Resolved)', icon: <CheckCircle size={14} className="text-green-400" /> },
        { value: 'info', label: 'Info', icon: <Info size={14} className="text-cyan-400" /> },
        { value: 'debug', label: 'Debug', icon: <Bug size={14} className="text-purple-400" /> },
        { value: 'api', label: 'API', icon: <Server size={14} className="text-blue-400" /> },
        { value: 'auth', label: 'Auth', icon: <Shield size={14} className="text-yellow-400" /> },
        { value: 'agent', label: 'Agent', icon: <Terminal size={14} className="text-cyan-400" /> },
    ];

    // Subscription for real-time updates
    useSubscription<any>(SUBSCRIBE_EVENTS, {
        variables: { fromNow },
        fetchPolicy: "no-cache",
        onData: ({ data }: { data: any } ) => {
            if (data.data?.operationeventlog_stream) {
                const newEvents = data.data.operationeventlog_stream;
                setEvents(prev => {
                    const updated = newEvents.reduce((acc: EventLog[], event: EventLog) => {
                        const idx = acc.findIndex(e => e.id === event.id);
                        if (idx > -1) {
                            acc[idx] = event;
                            return acc;
                        }
                        return [event, ...acc];
                    }, [...prev]);
                    return updated.sort((a: EventLog, b: EventLog) => b.id - a.id);
                });
            }
        },
        onError: (err) => { console.error('[SUBSCRIBE_EVENTS] subscription error:', err); },
    });

    const [fetchEvents] = useLazyQuery<any>(GET_EVENT_FEED, {
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
            setEvents(data.operationeventlog);
            setPageData(prev => ({ 
                ...prev, 
                totalCount: data.operationeventlog_aggregate.aggregate.count 
            }));
        }
    });

    const [fetchEventsWithResolved] = useLazyQuery<any>(GET_EVENT_FEED_WITH_RESOLVED, {
        fetchPolicy: "no-cache",
        onCompleted: (data: any) => {
            setEvents(data.operationeventlog);
            setPageData(prev => ({ 
                ...prev, 
                totalCount: data.operationeventlog_aggregate.aggregate.count 
            }));
        }
    });

    const [updateResolution] = useMutation<any>(UPDATE_RESOLUTION, {
        onCompleted: (data: any) => {
            const updated = data.update_operationeventlog_by_pk;
            setEvents(prev => prev.map(e => 
                e.id === updated.id ? { ...e, resolved: updated.resolved } : e
            ));
            snackActions.success(updated.resolved ? 'Event resolved' : 'Event unresolved');
        }
    });

    const [updateToWarning] = useMutation<any>(UPDATE_TO_WARNING, {
        onCompleted: (data: any) => {
            const updated = data.update_operationeventlog_by_pk;
            setEvents(prev => prev.map(e => 
                e.id === updated.id ? { ...e, warning: true, resolved: false } : e
            ));
            snackActions.success('Event marked as warning');
        }
    });

    const [resolveViewable] = useMutation<any>(RESOLVE_ALL_VIEWABLE, {
        onCompleted: (data: any) => {
            const ids = data.update_operationeventlog.returning.map((e: any) => e.id);
            setEvents(prev => prev.map(e => 
                ids.includes(e.id) ? { ...e, resolved: true } : e
            ));
            snackActions.success(`Resolved ${ids.length} events`);
        }
    });

    const [resolveAll] = useMutation<any>(RESOLVE_ALL_ERRORS, {
        onCompleted: (data: any) => {
            const ids = data.update_operationeventlog.returning.map((e: any) => e.id);
            setEvents(prev => prev.map(e => 
                ids.includes(e.id) ? { ...e, resolved: true } : e
            ));
            snackActions.success(`Resolved ${ids.length} events`);
        }
    });

    const loadEvents = useCallback((level?: LevelFilter) => {
        const currentLevel = level ?? levelFilter;
        const searchStr = searchQuery ? `%${searchQuery}%` : '%_%';
        
        if (currentLevel === 'warning_unresolved') {
            fetchEventsWithResolved({
                variables: { offset: 0, limit: pageData.limit, search: searchStr, level: '%_%', resolved: false }
            });
        } else if (currentLevel === 'warning_resolved') {
            fetchEventsWithResolved({
                variables: { offset: 0, limit: pageData.limit, search: searchStr, level: '%_%', resolved: true }
            });
        } else {
            const levelStr = currentLevel === 'all' ? '%_%' : `%${currentLevel}%`;
            fetchEvents({
                variables: { offset: 0, limit: pageData.limit, search: searchStr, level: levelStr }
            });
        }
    }, [levelFilter, searchQuery, pageData.limit, fetchEvents, fetchEventsWithResolved]);

    useEffect(() => {
        loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleResolve = (id: number, resolved: boolean) => {
        updateResolution({ variables: { id, resolved } });
    };

    const handleMakeWarning = (id: number) => {
        updateToWarning({ variables: { id } });
    };

    const handleResolveViewable = () => {
        const ids = events.filter(e => e.warning && !e.resolved).map(e => e.id);
        if (ids.length === 0) {
            snackActions.info('No viewable warnings to resolve');
            return;
        }
        resolveViewable({ variables: { ids } });
    };

    const handleResolveAll = () => {
        resolveAll();
    };

    const handleSearch = () => {
        loadEvents();
    };

    const handleLevelChange = (level: LevelFilter) => {
        setLevelFilter(level);
        setShowFilterMenu(false);
        loadEvents(level);
    };

    const unresolvedCount = events.filter(e => e.warning && !e.resolved).length;

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                    "transition-all duration-300 p-6 lg:p-12 min-h-screen flex flex-col",
                    isSidebarCollapsed ? "ml-16" : "ml-64"
                )}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded relative">
                            <Bell size={24} className="text-white" />
                            {alertCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                                    {alertCount > 99 ? '99+' : alertCount}
                                </span>
                            )}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">EVENT FEED</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                SYSTEM EVENT LOGS
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {canBroadcast && (
                            <button
                                onClick={() => setShowBroadcast(true)}
                                title={isLeadInCurrent ? 'Broadcast as lead' : 'Broadcast as admin'}
                                className="flex items-center gap-2 px-4 py-2 border border-yellow-400/50 text-yellow-300 hover:text-yellow-200 hover:border-yellow-300/80 hover:bg-yellow-400/10 font-mono text-sm uppercase tracking-widest transition-colors group"
                            >
                                <Megaphone size={15} className="group-hover:scale-110 transition-transform" />
                                Broadcast
                            </button>
                        )}
                        <button
                            onClick={handleResolveViewable}
                            className="flex items-center gap-2 px-4 py-2 border border-signal/30 text-signal hover:bg-signal/10 transition-colors text-sm"
                        >
                            <CheckCircle size={16} />
                            Resolve Viewable ({unresolvedCount})
                        </button>
                        <button
                            onClick={handleResolveAll}
                            className="flex items-center gap-2 px-4 py-2 bg-signal text-void font-bold text-sm hover:bg-white transition-colors"
                        >
                            <CheckCheck size={16} />
                            Resolve All
                        </button>
                    </div>
                </header>

                {/* Search & Filter Bar */}
                <div className="flex gap-4 mb-6 shrink-0">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search events..."
                            className="w-full bg-black/60 border border-signal/30 px-4 py-3 pr-12 text-sm text-white focus:outline-none focus:border-signal font-mono"
                        />
                        <button
                            onClick={handleSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-signal hover:bg-signal/10 transition-colors"
                        >
                            <Search size={18} />
                        </button>
                    </div>
                    
                    {/* Level Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className="flex items-center gap-2 px-4 py-3 bg-black/60 border border-signal/30 text-sm hover:border-signal transition-colors min-w-[200px]"
                        >
                            {levelOptions.find(o => o.value === levelFilter)?.icon}
                            <span>{levelOptions.find(o => o.value === levelFilter)?.label}</span>
                            <ChevronDown size={16} className="ml-auto" />
                        </button>
                        
                        <AnimatePresence>
                            {showFilterMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowFilterMenu(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute top-full left-0 right-0 z-50 mt-1 bg-black border border-signal/30 shadow-lg"
                                    >
                                        {levelOptions.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => handleLevelChange(option.value)}
                                                className={cn(
                                                    "w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-signal/10 transition-colors",
                                                    levelFilter === option.value && "bg-signal/10 text-signal"
                                                )}
                                            >
                                                {option.icon}
                                                {option.label}
                                            </button>
                                        ))}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    
                    <button
                        onClick={() => loadEvents()}
                        className="p-3 border border-signal/30 text-signal hover:bg-signal/10 transition-colors"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>

                {/* Stats Bar */}
                <div className="flex gap-4 mb-6 shrink-0">
                    <div className="px-4 py-2 bg-black/40 border border-signal/20">
                        <span className="text-xs text-gray-500 uppercase">Total</span>
                        <span className="ml-2 text-signal font-mono">{pageData.totalCount}</span>
                    </div>
                    <div className="px-4 py-2 bg-black/40 border border-signal/20">
                        <span className="text-xs text-gray-500 uppercase">Viewing</span>
                        <span className="ml-2 text-signal font-mono">{events.length}</span>
                    </div>
                    {unresolvedCount > 0 && (
                        <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30">
                            <span className="text-xs text-amber-400 uppercase">Unresolved Warnings</span>
                            <span className="ml-2 text-amber-400 font-mono">{unresolvedCount}</span>
                        </div>
                    )}
                </div>

                {/* Events List */}
                <div className="flex-1 overflow-y-auto">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                            <Bell size={48} className="mb-4 opacity-30" />
                            <p className="text-lg font-mono">No events found</p>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {events.map(event => (
                                parseBroadcastMessage(event.message) !== null ? (
                                    <MinervaBroadcastEventRow
                                        key={event.id}
                                        event={event}
                                        viewUtc={viewUtc}
                                    />
                                ) : (
                                    <EventItem
                                        key={event.id}
                                        event={event}
                                        onResolve={handleResolve}
                                        onMakeWarning={handleMakeWarning}
                                        viewUtc={viewUtc}
                                    />
                                )
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </motion.div>

            <AnimatePresence>
                {showBroadcast && (
                    <BroadcastComposerModal
                        key="broadcast"
                        onClose={() => setShowBroadcast(false)}
                        operationName={currentOpName}
                        senderUsername={(me?.user?.username as string | undefined)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
