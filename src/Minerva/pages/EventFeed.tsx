import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useLazyQuery, useSubscription, gql } from '@apollo/client';
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
    Filter
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { meState } from '../../cache';
import { useReactiveVar } from '@apollo/client';
import { toLocalTime } from '../../Archive/components/utilities/Time';

// ============================================
// GraphQL Queries & Mutations
// ============================================
const GET_EVENT_FEED = gql`
    query GetEventFeed($offset: Int!, $limit: Int!, $search: String!, $level: String!) {
        operationeventlog(
            where: {
                deleted: {_eq: false}, 
                message: {_ilike: $search}, 
                level: {_ilike: $level}
            }, 
            order_by: {id: desc}, 
            limit: $limit, 
            offset: $offset
        ) {
            id
            level
            message
            resolved
            timestamp
            count
            source
            warning
            operator {
                username
            }
        }
        operationeventlog_aggregate(
            where: {
                deleted: {_eq: false}, 
                message: {_ilike: $search}, 
                level: {_ilike: $level}
            }
        ) {
            aggregate {
                count
            }
        }
    }
`;

const GET_EVENT_FEED_WITH_RESOLVED = gql`
    query GetEventFeedWithResolved($offset: Int!, $limit: Int!, $search: String!, $level: String!, $resolved: Boolean!) {
        operationeventlog(
            where: {
                deleted: {_eq: false}, 
                message: {_ilike: $search}, 
                level: {_like: $level},
                resolved: {_eq: $resolved},
                warning: {_eq: true}
            }, 
            order_by: {id: desc}, 
            limit: $limit, 
            offset: $offset
        ) {
            id
            level
            message
            resolved
            timestamp
            count
            source
            warning
            operator {
                username
            }
        }
        operationeventlog_aggregate(
            where: {
                deleted: {_eq: false}, 
                message: {_ilike: $search}, 
                level: {_like: $level},
                resolved: {_eq: $resolved},
                warning: {_eq: true}
            }
        ) {
            aggregate {
                count
            }
        }
    }
`;

const SUBSCRIBE_EVENTS = gql`
    subscription SubscribeEventFeed($fromNow: timestamp!) {
        operationeventlog_stream(
            cursor: {initial_value: {timestamp: $fromNow}, ordering: ASC}, 
            batch_size: 10, 
            where: {deleted: {_eq: false}}
        ) {
            id
            level
            message
            resolved
            timestamp
            count
            source
            warning
            operator {
                username
            }
        }
    }
`;

const UPDATE_RESOLUTION = gql`
    mutation UpdateResolution($id: Int!, $resolved: Boolean!) {
        update_operationeventlog_by_pk(pk_columns: {id: $id}, _set: {resolved: $resolved}) {
            id
            resolved
        }
    }
`;

const UPDATE_TO_WARNING = gql`
    mutation UpdateToWarning($id: Int!) {
        update_operationeventlog_by_pk(pk_columns: {id: $id}, _set: {warning: true, resolved: false}) {
            id
            warning
            resolved
        }
    }
`;

const RESOLVE_ALL_VIEWABLE = gql`
    mutation ResolveAllViewable($ids: [Int]!) {
        update_operationeventlog(where: {id: {_in: $ids}, warning: {_eq: true}}, _set: {resolved: true}) {
            returning {
                id
                resolved
            }
        }
    }
`;

const RESOLVE_ALL_ERRORS = gql`
    mutation ResolveAllErrors {
        update_operationeventlog(where: {resolved: {_eq: false}, warning: {_eq: true}}, _set: {resolved: true}) {
            returning {
                id
                resolved
            }
        }
    }
`;

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
    const { isSidebarCollapsed, alertCount } = useAppStore();
    const me = useReactiveVar(meState);
    // @ts-ignore
    const viewUtc = me?.user?.view_utc_time || false;
    
    const [events, setEvents] = useState<EventLog[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<LevelFilter>(alertCount > 0 ? 'warning_unresolved' : 'info');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [fromNow] = useState(new Date().toISOString());
    const [pageData, setPageData] = useState({ totalCount: 0, limit: 100, offset: 0 });

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
    useSubscription(SUBSCRIBE_EVENTS, {
        variables: { fromNow },
        fetchPolicy: "no-cache",
        onData: ({ data }) => {
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
        }
    });

    const [fetchEvents] = useLazyQuery(GET_EVENT_FEED, {
        fetchPolicy: "no-cache",
        onCompleted: (data) => {
            setEvents(data.operationeventlog);
            setPageData(prev => ({ 
                ...prev, 
                totalCount: data.operationeventlog_aggregate.aggregate.count 
            }));
        }
    });

    const [fetchEventsWithResolved] = useLazyQuery(GET_EVENT_FEED_WITH_RESOLVED, {
        fetchPolicy: "no-cache",
        onCompleted: (data) => {
            setEvents(data.operationeventlog);
            setPageData(prev => ({ 
                ...prev, 
                totalCount: data.operationeventlog_aggregate.aggregate.count 
            }));
        }
    });

    const [updateResolution] = useMutation(UPDATE_RESOLUTION, {
        onCompleted: (data) => {
            const updated = data.update_operationeventlog_by_pk;
            setEvents(prev => prev.map(e => 
                e.id === updated.id ? { ...e, resolved: updated.resolved } : e
            ));
            snackActions.success(updated.resolved ? 'Event resolved' : 'Event unresolved');
        }
    });

    const [updateToWarning] = useMutation(UPDATE_TO_WARNING, {
        onCompleted: (data) => {
            const updated = data.update_operationeventlog_by_pk;
            setEvents(prev => prev.map(e => 
                e.id === updated.id ? { ...e, warning: true, resolved: false } : e
            ));
            snackActions.success('Event marked as warning');
        }
    });

    const [resolveViewable] = useMutation(RESOLVE_ALL_VIEWABLE, {
        onCompleted: (data) => {
            const ids = data.update_operationeventlog.returning.map((e: any) => e.id);
            setEvents(prev => prev.map(e => 
                ids.includes(e.id) ? { ...e, resolved: true } : e
            ));
            snackActions.success(`Resolved ${ids.length} events`);
        }
    });

    const [resolveAll] = useMutation(RESOLVE_ALL_ERRORS, {
        onCompleted: (data) => {
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
            <Sidebar />
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                    "transition-all duration-300 p-6 lg:p-12 min-h-screen flex flex-col",
                    isSidebarCollapsed ? "ml-16" : "ml-64"
                )}
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded relative">
                            <Bell size={24} className="text-signal" />
                            {alertCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                                    {alertCount > 99 ? '99+' : alertCount}
                                </span>
                            )}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">EVENT FEED</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/system/logs</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
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
                                <EventItem
                                    key={event.id}
                                    event={event}
                                    onResolve={handleResolve}
                                    onMakeWarning={handleMakeWarning}
                                    viewUtc={viewUtc}
                                />
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
