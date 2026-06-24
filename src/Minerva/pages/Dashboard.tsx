import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Terminal, Bell, RefreshCw, Eye, EyeOff, Sliders, GripVertical } from 'lucide-react';
import { useQuery, useReactiveVar } from "@apollo/client/react";
import { usePageVisible } from '../lib/usePageVisible';
import {
    RecentPayloadsCard,
    CommandStatsCard,
    ActiveOperatorsCard,
    RecentActivityCard,
    TopCommandsPieCard,
    TaskStatusPieCard,
    HostContextPieCard,
    UserContextPieCard,
    MissionHeroBanner,
    KpiStrip,
    ActivityHeatmapCard,
    LiveActivityFeedCard,
    C2MatrixCard,
    OperationBriefingCard,
    AssetStripCard,
    OperatorsPanelCard,
    OperationCountdownCard,
    computeThreatScore,
} from '../components/DashboardCards';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { useNavigate } from 'react-router-dom';
import { GET_DASHBOARD_DATA } from '../lib/api';
import { cn } from '../lib/utils';
import { meState } from '../lib/state';
import { parseSchedule, tDelta } from '../lib/operationSchedule';
import { getSkewedNow } from '../lib/time';
import { pushBroadcast } from '../lib/broadcastBus';

// ── Dashboard Perspective/Widget System ──────────────────────────────────────
type WidgetKey =
    | 'kpiStrip'
    | 'operationCountdown'
    | 'activityHeatmap'
    | 'taskStatusPie'
    | 'topCommandsPie'
    | 'c2Matrix'
    | 'operationBriefing'
    | 'liveFeed'
    | 'recentPayloads'
    | 'assetStrip'
    | 'operatorsPanel'
    | 'commandStats'
    | 'hostContextPie'
    | 'userContextPie'
    | 'recentActivity'
    | 'terminalLog';

interface WidgetDef {
    key: WidgetKey;
    label: string;
    cols: number; // lg:col-span-N (out of 4)
}

const ALL_WIDGETS: WidgetDef[] = [
    { key: 'kpiStrip', label: 'KPI Strip', cols: 4 },
    { key: 'operationCountdown', label: 'Operation Schedule (T-/T+)', cols: 2 },
    { key: 'activityHeatmap', label: '24h Activity Heatmap', cols: 2 },
    { key: 'taskStatusPie', label: 'Task Status', cols: 1 },
    { key: 'topCommandsPie', label: 'Top Commands', cols: 1 },
    { key: 'c2Matrix', label: 'C2 Infrastructure', cols: 2 },
    { key: 'operationBriefing', label: 'Operation Briefing', cols: 2 },
    { key: 'liveFeed', label: 'Live Task Stream', cols: 2 },
    { key: 'recentPayloads', label: 'Recent Payloads', cols: 4 },
    { key: 'assetStrip', label: 'Asset Collection', cols: 4 },
    { key: 'operatorsPanel', label: 'Operators', cols: 1 },
    { key: 'commandStats', label: 'Command Stats', cols: 3 },
    { key: 'hostContextPie', label: 'Callbacks by Host', cols: 2 },
    { key: 'userContextPie', label: 'Callbacks by User', cols: 2 },
    { key: 'recentActivity', label: 'Recent Activity', cols: 2 },
    { key: 'terminalLog', label: 'System Terminal', cols: 4 },
];

type Perspective = 'operator' | 'lead' | 'custom';

// ── Flex-row layout definitions ─────────────────────────────────────────────
// Each row fills 100 % width; flex weights control relative card widths.
// All cards in the same row stretch to the tallest card's height.
type FlexRowItem = { key: WidgetKey; flex: number };
type FlexRow = FlexRowItem[];

const OPERATOR_ROWS: FlexRow[] = [
    [{ key: 'kpiStrip', flex: 1 }],
    [{ key: 'operationCountdown', flex: 2 }, { key: 'taskStatusPie', flex: 1 }, { key: 'topCommandsPie', flex: 1 }],
    [{ key: 'activityHeatmap', flex: 1 }, { key: 'c2Matrix', flex: 1 }],
    [{ key: 'operatorsPanel', flex: 1 }, { key: 'commandStats', flex: 3 }],
    [{ key: 'operationBriefing', flex: 1 }, { key: 'liveFeed', flex: 1 }],
    [{ key: 'recentPayloads', flex: 1 }],
    [{ key: 'assetStrip', flex: 1 }],
    [{ key: 'terminalLog', flex: 1 }],
];

const LEAD_ROWS: FlexRow[] = [
    [{ key: 'kpiStrip', flex: 1 }],
    [{ key: 'operationCountdown', flex: 2 }, { key: 'taskStatusPie', flex: 1 }, { key: 'topCommandsPie', flex: 1 }],
    [{ key: 'activityHeatmap', flex: 1 }, { key: 'c2Matrix', flex: 1 }],
    [{ key: 'operatorsPanel', flex: 1 }, { key: 'commandStats', flex: 3 }],
    [{ key: 'operationBriefing', flex: 1 }, { key: 'liveFeed', flex: 1 }],
    [{ key: 'hostContextPie', flex: 1 }, { key: 'userContextPie', flex: 1 }],
    [{ key: 'recentPayloads', flex: 1 }],
    [{ key: 'assetStrip', flex: 1 }],
    [{ key: 'terminalLog', flex: 1 }],
];

// Flat key lists derived from rows (used for perspective switching)
const OPERATOR_WIDGETS: WidgetKey[] = OPERATOR_ROWS.flat().map(r => r.key);
const LEAD_WIDGETS: WidgetKey[] = LEAD_ROWS.flat().map(r => r.key);

// ── Custom drag mode: row-based layout ──────────────────────────────────────
type CustomRow = WidgetKey[];
type DropTarget =
    | { kind: 'in-row'; rowIdx: number; insertIdx: number }
    | { kind: 'new-row'; beforeIdx: number };

function loadCustomRows(): CustomRow[] {
    try {
        const raw = localStorage.getItem('minerva-custom-rows-v1');
        if (raw) return JSON.parse(raw);
    } catch { }
    return OPERATOR_ROWS.map(row => row.map(r => r.key));
}

function saveCustomRows(rows: CustomRow[]) {
    try { localStorage.setItem('minerva-custom-rows-v1', JSON.stringify(rows)); } catch { }
}

/** Remove key from rows, compact empty rows, then re-insert at target position within an existing row. */
function applyDropInRow(rows: CustomRow[], key: WidgetKey, targetRowIdx: number, targetInsertIdx: number): CustomRow[] {
    const origRowIdx = rows.findIndex(row => row.includes(key));
    const origColIdx = origRowIdx >= 0 ? rows[origRowIdx].indexOf(key) : -1;
    const origRowSingleton = origRowIdx >= 0 && rows[origRowIdx].length === 1;
    const without = rows.map(row => row.filter(k => k !== key)).filter(row => row.length > 0);
    // If the original row was removed (was a singleton), subsequent row indices shift down by 1
    const adjRow = origRowSingleton && origRowIdx < targetRowIdx ? targetRowIdx - 1 : targetRowIdx;
    // If inserting into the same row after the removed item, shift insert index left by 1
    const adjCol = (!origRowSingleton && origRowIdx === adjRow && origColIdx < targetInsertIdx)
        ? targetInsertIdx - 1 : targetInsertIdx;
    const result = without.map(r => [...r]);
    if (adjRow >= result.length) {
        result.push([key]);
    } else {
        result[adjRow].splice(Math.max(0, adjCol), 0, key);
    }
    return result;
}

/** Remove key from rows, compact empty rows, then re-insert as a new standalone row. */
function applyDropNewRow(rows: CustomRow[], key: WidgetKey, beforeIdx: number): CustomRow[] {
    const origRowIdx = rows.findIndex(row => row.includes(key));
    const origRowSingleton = origRowIdx >= 0 && rows[origRowIdx].length === 1;
    const without = rows.map(row => row.filter(k => k !== key)).filter(row => row.length > 0);
    const adjBefore = origRowSingleton && origRowIdx < beforeIdx ? beforeIdx - 1 : beforeIdx;
    const result = without.map(r => [...r]);
    result.splice(Math.max(0, adjBefore), 0, [key]);
    return result;
}

function loadPerspective(): Perspective {
    try {
        const stored = localStorage.getItem('minerva-dashboard-perspective');
        if (stored === 'operator' || stored === 'lead' || stored === 'custom') return stored;
    } catch { }
    return 'operator';
}

export default function Dashboard() {
    const { appState, setAppState, isSidebarCollapsed } = useAppStore(useShallow(s => ({ appState: s.appState, setAppState: s.setAppState, isSidebarCollapsed: s.isSidebarCollapsed })));
    const pageVisible = usePageVisible();
    const navigate = useNavigate();
    const me = useReactiveVar(meState);
    const userId = me?.user?.user_id || me?.user?.id || 0;

    const { data, loading, error, refetch } = useQuery<any>(GET_DASHBOARD_DATA, {
        variables: { operator_id: userId },
        pollInterval: pageVisible ? 10000 : 0,
    });

    // Perspective state
    const [perspective, setPerspective] = useState<Perspective>(loadPerspective);
    const [customRows, setCustomRows] = useState<CustomRow[]>(loadCustomRows);
    const [editing, setEditing] = useState(false);
    const [dragKey, setDragKey] = useState<WidgetKey | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

    const handlePerspectiveChange = useCallback((p: Perspective) => {
        setPerspective(p);
        setEditing(false);
        try { localStorage.setItem('minerva-dashboard-perspective', p); } catch { }
    }, []);

    const toggleWidget = useCallback((key: WidgetKey) => {
        setCustomRows(prev => {
            const isPresent = prev.some(row => row.includes(key));
            const next = isPresent
                ? prev.map(row => row.filter(k => k !== key)).filter(row => row.length > 0)
                : [...prev, [key]];
            saveCustomRows(next);
            return next;
        });
    }, []);

    const visibleWidgetKeys = useMemo(() => {
        switch (perspective) {
            case 'lead': return LEAD_WIDGETS;
            case 'custom': return customRows.flat();
            default: return OPERATOR_WIDGETS;
        }
    }, [perspective, customRows]);

    const visibleWidgets = useMemo(() =>
        ALL_WIDGETS.filter(w => visibleWidgetKeys.includes(w.key)),
        [visibleWidgetKeys]);

    useEffect(() => {
        if (appState === 'LOGIN') setAppState('DASHBOARD');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const container: Variants = {
        hidden: { opacity: 0, y: 20, filter: 'blur(12px)' },
        show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { staggerChildren: 0.05, duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
        exit: { opacity: 0, scale: 1.04, filter: "blur(12px)", transition: { duration: 0.5, ease: "easeInOut" } }
    };
    const item: Variants = {
        hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
        show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }
    };

    // Safe data extraction
    const callbacks = data?.callback || [];
    const totalCallbacks = data?.all_callbacks?.length || 0;
    const payloads = data?.payload || [];
    const operations = data?.operation || [];
    const totalOperations = data?.all_operations?.length || 0;
    const c2profiles = data?.c2profile || [];
    const tasks = data?.task || [];
    const operators = data?.operators || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.completed === true).length;
    const errorTasks = tasks.filter((t: any) => t.status === 'error').length;
    const opsecTasks = tasks.filter((t: any) => (t.opsec_pre_blocked === true && t.opsec_pre_bypassed !== true) || (t.opsec_post_blocked === true && t.opsec_post_bypassed !== true)).length;
    const credentials = data?.credential_aggregate?.aggregate?.count || 0;
    const keylogs = data?.keylog_aggregate?.aggregate?.count || 0;
    const downloads = data?.filemeta_aggregate?.aggregate?.count || 0;
    const uploads = data?.uploaded_files?.aggregate?.count || 0;
    const screenshots = data?.screenshot_aggregate?.aggregate?.count || 0;
    const activeOperation = { name: me?.user?.current_operation || "NONE", id: me?.user?.current_operation_id || 0 };
    const operatorName = me?.user?.username || 'UNKNOWN';

    const c2Running = c2profiles.filter((p: any) => p.running).length;
    const c2Down = c2profiles.length - c2Running;

    const threatScore = useMemo(() => computeThreatScore({
        opsecTasks, errorTasks, totalTasks, c2Down, c2Total: c2profiles.length,
    }), [opsecTasks, errorTasks, totalTasks, c2Down, c2profiles.length]);

    // ── Operation schedule (T-/T+) ────────────────────────────────────
    const currentOpRow = useMemo(
        () => operations.find((op: any) => op.id === activeOperation?.id) || operations[0],
        [operations, activeOperation?.id]
    );
    const schedule = useMemo(
        () => parseSchedule(currentOpRow?.banner_text),
        [currentOpRow?.banner_text]
    );
    const startMs = schedule.startMs;
    const opName = currentOpRow?.name || activeOperation?.name || 'OPERATION';

    // Scheduler: 1 Hz tick — pushes T-30s and T-0 broadcasts (each fires once via key dedupe).
    // Audio (callback.mp3) is played automatically by broadcastBus on every successful push.
    useEffect(() => {
        if (!startMs) return;
        const fireIfDue = () => {
            const now = getSkewedNow().getTime();
            const remainingMs = startMs - now;

            // Pre-start broadcast: T-30s (fires once when countdown enters 30 s window)
            if (remainingMs <= 30_000 && remainingMs > 0) {
                pushBroadcast({
                    level: 'warning',
                    title: `T-30 :: ${opName}`,
                    message: 'Operation begins in 30 seconds — all operators stand by.',
                    key: `op-${currentOpRow?.id}-${startMs}-pre`,
                    ttlMs: 15_000,
                });
            }

            // Go broadcast: T-0 (fires once within +/- 5 s of start)
            if (remainingMs <= 0 && remainingMs > -5_000) {
                pushBroadcast({
                    level: 'critical',
                    title: `T-0 :: ${opName} LIVE`,
                    message: 'Operation has started — execute as briefed.',
                    key: `op-${currentOpRow?.id}-${startMs}-go`,
                    ttlMs: 15_000,
                });
            }
        };
        fireIfDue();
        const id = setInterval(fireIfDue, 1000);
        return () => clearInterval(id);
    }, [startMs, opName, currentOpRow?.id]);

    // Widget renderer
    const renderWidget = (key: WidgetKey) => {
        switch (key) {
            case 'kpiStrip':
                return <KpiStrip
                    callbacks={callbacks}
                    totalCallbacks={totalCallbacks}
                    tasks={tasks}
                    totalTasks={totalTasks}
                    completedTasks={completedTasks}
                    errorTasks={errorTasks}
                    opsecTasks={opsecTasks}
                    onCallbacks={() => navigate('/callbacks')}
                    onOpsec={() => navigate('/opsec')}
                />;
            case 'operationCountdown':
                return <OperationCountdownCard startMs={startMs} operationName={opName} />;
            case 'activityHeatmap': return <ActivityHeatmapCard tasks={tasks} />;
            case 'taskStatusPie': return <TaskStatusPieCard tasks={tasks} />;
            case 'topCommandsPie': return <TopCommandsPieCard tasks={tasks} />;
            case 'c2Matrix':
                return <div className="h-full" onClick={() => navigate('/c2-profiles')} style={{ cursor: 'pointer' }}>
                    <C2MatrixCard profiles={c2profiles} />
                </div>;
            case 'operationBriefing':
                return <div className="h-full" onClick={() => navigate('/operations')} style={{ cursor: 'pointer' }}>
                    <OperationBriefingCard operations={operations} currentOpId={activeOperation?.id} totalOperations={totalOperations} />
                </div>;
            case 'liveFeed': return <LiveActivityFeedCard tasks={tasks} />;
            case 'recentPayloads':
                return <div className="h-full" onClick={() => navigate('/payloads')} style={{ cursor: 'pointer' }}>
                    <RecentPayloadsCard payloads={payloads} />
                </div>;
            case 'assetStrip': return <AssetStripCard credentials={credentials} keylogs={keylogs} downloads={downloads} uploads={uploads} screenshots={screenshots} />;
            case 'operatorsPanel': return <OperatorsPanelCard operators={operators} />;
            case 'commandStats': return <CommandStatsCard tasks={tasks} totalTasks={totalTasks} completedTasks={completedTasks} errorTasks={errorTasks} opsecTasks={opsecTasks} />;
            case 'hostContextPie': return <HostContextPieCard callbacks={callbacks} />;
            case 'userContextPie': return <UserContextPieCard callbacks={callbacks} />;
            case 'recentActivity': return <RecentActivityCard tasks={tasks} />;
            case 'terminalLog': return (
                <div className="h-full border border-ghost/40 bg-black p-5 font-mono text-sm min-h-[220px] text-gray-100 relative overflow-hidden leading-relaxed rounded">
                    <div className="absolute top-3 right-3 text-gray-300"><Terminal size={18} /></div>
                    <div className="space-y-1.5">
                        <p className="text-signal font-semibold">$ system_status.sh</p>
                        <p>Analyzing local environment... {loading ? <span className="text-yellow-400 font-semibold">[LOADING]</span> : <span className="text-signal font-semibold">[OK]</span>}</p>
                        {callbacks.length > 0 && <p className="text-signal"> {'>'} Active Callbacks: {callbacks.length} / {totalCallbacks}</p>}
                        {c2profiles.length > 0 && <p> {'>'} C2 Profiles: {c2Running} running / {c2profiles.length} total</p>}
                        {totalTasks > 0 && <p> {'>'} Tasks Executed: {totalTasks} (Completed: {completedTasks}, Errors: {errorTasks})</p>}
                        {opsecTasks > 0 && <p className="text-yellow-400 font-semibold"> {'>'} OPSEC REVIEW PENDING: {opsecTasks} task(s) awaiting approval</p>}
                        {operators.length > 0 && <p> {'>'} Active Operators: {operators.map((o: any) => o.username).join(', ')}</p>}
                        {downloads > 0 && <p className="text-blue-300"> {'>'} Files Downloaded: {downloads}</p>}
                        {credentials > 0 && <p className="text-yellow-300"> {'>'} Credentials Harvested: {credentials}</p>}
                        {screenshots > 0 && <p className="text-cyan-300"> {'>'} Screenshots Captured: {screenshots}</p>}
                        <p className="text-gray-200"> {'>'} Composite Threat Index: <span className="text-signal font-semibold">{threatScore}/100</span></p>
                        {error && <p className="text-red-400 font-semibold"> {'>'} ERROR: {error.message}</p>}
                        <p className="animate-pulse text-signal">_</p>
                    </div>
                </div>
            );
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-x-hidden">
            <div className={cn("transition-all duration-300 p-6 lg:p-10 min-h-screen", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                <AnimatePresence>
                    {appState === 'DASHBOARD' && (
                        <motion.div key="dashboard-content" variants={container} initial="hidden" animate="show" exit="exit">
                            {/* Header */}
                            <header className="flex justify-between items-center mb-6 border-b border-ghost/40 pb-5">
                                <div className="flex items-center gap-4">
                                    <div className="w-11 h-11 flex items-center justify-center">
                                        <img src={require('../../assets/minerva.png')} alt="Minerva Logo" className="w-11 h-11 object-contain" draggable="false" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-bold tracking-widest">MINERVA</h1>
                                        <p className="text-sm text-gray-200 font-mono tracking-widest">C2_OPERATIONS_CENTER</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="hidden md:flex items-center gap-4 text-gray-100 text-sm font-mono">
                                        <span className="flex items-center gap-2">
                                            <span className={cn("w-2.5 h-2.5 rounded-full", loading ? "bg-yellow-500 animate-pulse" : error ? "bg-red-500" : "bg-signal animate-pulse")}></span>
                                            {error ? "CONNECTION_ERROR" : "GATEWAY_ONLINE"}
                                        </span>
                                        <span className="text-gray-400">|</span>
                                        <span>OP: <span className="text-signal font-semibold">{activeOperation?.name || "NONE"}</span></span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => refetch()} className={cn("p-2 hover:text-signal text-gray-200 transition-colors", loading && "animate-spin")} title="Refresh"><RefreshCw size={20} /></button>
                                        <button className="p-2 hover:text-signal text-gray-200 transition-colors relative" title="Notifications">
                                            <Bell size={22} />
                                            {opsecTasks > 0 && <span className="absolute -mt-4 ml-3 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{opsecTasks}</span>}
                                        </button>
                                    </div>
                                </div>
                            </header>

                            {/* Mission Hero Banner — always shown, anchors the page */}
                            <motion.div variants={item} className="mb-5">
                                <MissionHeroBanner
                                    operationName={activeOperation?.name || 'NONE'}
                                    operatorName={operatorName}
                                    callbackCount={callbacks.length}
                                    totalCallbacks={totalCallbacks}
                                    c2Running={c2Running}
                                    c2Total={c2profiles.length}
                                    threatScore={threatScore}
                                    loading={loading}
                                    error={!!error}
                                />
                            </motion.div>

                            {/* Perspective Tabs */}
                            <div className="flex items-center gap-4 mb-5 border-b border-white/15 pb-3">
                                <div className="flex gap-0">
                                    {(['operator', 'lead'] as Perspective[]).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => handlePerspectiveChange(p)}
                                            className={cn(
                                                'px-5 py-2 text-sm font-mono uppercase tracking-widest border-b-2 transition-colors -mb-[13px] font-semibold',
                                                perspective === p ? 'border-signal text-signal' : 'border-transparent text-gray-300 hover:text-white'
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => {
                                        if (perspective !== 'custom') {
                                            handlePerspectiveChange('custom');
                                            setEditing(true);
                                        } else {
                                            setEditing(e => !e);
                                        }
                                    }}
                                    className={cn(
                                        'ml-4 flex items-center gap-2 px-4 py-1.5 text-sm font-mono border rounded transition-all duration-200 font-semibold',
                                        perspective === 'custom' && editing
                                            ? 'border-signal text-signal bg-signal/15 shadow-[0_0_12px_rgba(var(--color-signal),0.25)]'
                                            : perspective === 'custom'
                                            ? 'border-signal/40 text-signal hover:border-signal'
                                            : 'border-white/25 text-gray-200 hover:text-white hover:border-white/50'
                                    )}
                                >
                                    <Sliders size={14} />
                                    {perspective === 'custom' && editing ? 'DONE' : 'CUSTOM'}
                                </button>
                            </div>

                            {/* Custom mode: widget selector (toggle visibility) */}
                            <AnimatePresence>
                                {perspective === 'custom' && editing && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden mb-6"
                                    >
                                        <div className="border border-white/15 bg-black/50 rounded p-5">
                                            <div className="text-sm font-mono text-gray-200 mb-3 uppercase tracking-widest font-semibold">Toggle Widgets — drag handles appear on each card</div>
                                            <div className="flex flex-wrap gap-2">
                                                {ALL_WIDGETS.map(w => {
                                                    const active = customRows.flat().includes(w.key);
                                                    return (
                                                        <button
                                                            key={w.key}
                                                            onClick={() => toggleWidget(w.key)}
                                                            className={cn(
                                                                'flex items-center gap-2 px-3.5 py-2 text-sm font-mono border rounded transition-colors',
                                                                active ? 'border-signal/60 text-signal bg-signal/15' : 'border-white/20 text-gray-200 hover:text-white hover:border-white/40'
                                                            )}
                                                        >
                                                            {active ? <Eye size={13} /> : <EyeOff size={13} />}
                                                            {w.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Main Grid */}
                            {perspective === 'custom' ? (
                                // ── CUSTOM mode: flex row-based drag-and-drop ────────────────
                                // Each row is a flex container. Drop zones appear between cards
                                // (detected via cursor position on card hover) and between rows
                                // (thin horizontal bars that expand on hover during drag).
                                <div className="flex flex-col">
                                    {customRows.map((row, rowIdx) => (
                                        <React.Fragment key={rowIdx}>
                                            {/* ── New-row insertion zone ABOVE this row ── */}
                                            {editing && (
                                                <div
                                                    className={cn(
                                                        'w-full flex items-center justify-center rounded transition-all duration-150 select-none text-xs font-mono tracking-widest',
                                                        dragKey && dropTarget?.kind === 'new-row' && dropTarget.beforeIdx === rowIdx
                                                            ? 'h-12 mb-1 border-2 border-dashed border-signal/70 bg-signal/10 text-signal/60'
                                                            : 'h-3 mb-0 border border-dashed border-white/10 text-transparent'
                                                    )}
                                                    onDragOver={e => {
                                                        e.preventDefault(); e.stopPropagation();
                                                        if (dragKey) setDropTarget({ kind: 'new-row', beforeIdx: rowIdx });
                                                    }}
                                                    onDragLeave={() => setDropTarget(null)}
                                                    onDrop={e => {
                                                        e.preventDefault();
                                                        if (!dragKey) return;
                                                        setCustomRows(prev => { const next = applyDropNewRow(prev, dragKey, rowIdx); saveCustomRows(next); return next; });
                                                        setDragKey(null); setDropTarget(null);
                                                    }}
                                                >
                                                    {dragKey && dropTarget?.kind === 'new-row' && dropTarget.beforeIdx === rowIdx ? 'NEW ROW' : null}
                                                </div>
                                            )}
                                            {/* ── Row ── */}
                                            <div className="flex gap-5 items-stretch mb-5">
                                                {row.map((key, colIdx) => (
                                                    <div
                                                        key={key}
                                                        style={{ flex: 1, minWidth: 0 }}
                                                        className={cn(
                                                            'relative',
                                                            dragKey === key && 'opacity-40 ring-2 ring-signal/40 rounded'
                                                        )}
                                                        draggable={editing}
                                                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragKey(key); }}
                                                        onDragEnd={() => { setDragKey(null); setDropTarget(null); }}
                                                        onDragOver={e => {
                                                            e.preventDefault(); e.stopPropagation();
                                                            if (!dragKey || dragKey === key) return;
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const relX = e.clientX - rect.left;
                                                            const insertIdx = relX < rect.width / 2 ? colIdx : colIdx + 1;
                                                            setDropTarget({ kind: 'in-row', rowIdx, insertIdx });
                                                        }}
                                                        onDrop={e => {
                                                            e.preventDefault();
                                                            if (!dragKey || dragKey === key) return;
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const relX = e.clientX - rect.left;
                                                            const insertIdx = relX < rect.width / 2 ? colIdx : colIdx + 1;
                                                            setCustomRows(prev => { const next = applyDropInRow(prev, dragKey, rowIdx, insertIdx); saveCustomRows(next); return next; });
                                                            setDragKey(null); setDropTarget(null);
                                                        }}
                                                    >
                                                        {/* Left-edge insertion indicator */}
                                                        {dragKey && dragKey !== key && dropTarget?.kind === 'in-row' && dropTarget.rowIdx === rowIdx && dropTarget.insertIdx === colIdx && (
                                                            <div className="absolute -left-3 top-2 bottom-2 w-1.5 bg-signal rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(var(--color-signal),0.8)]" />
                                                        )}
                                                        {/* Right-edge insertion indicator */}
                                                        {dragKey && dragKey !== key && dropTarget?.kind === 'in-row' && dropTarget.rowIdx === rowIdx && dropTarget.insertIdx === colIdx + 1 && (
                                                            <div className="absolute -right-3 top-2 bottom-2 w-1.5 bg-signal rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(var(--color-signal),0.8)]" />
                                                        )}
                                                        {/* Drag handle */}
                                                        {editing && (
                                                            <div className="absolute top-2 right-2 z-20 p-1.5 cursor-grab active:cursor-grabbing bg-black/70 border border-white/20 rounded text-gray-300 hover:text-signal transition-colors select-none">
                                                                <GripVertical size={14} />
                                                            </div>
                                                        )}
                                                        {renderWidget(key)}
                                                    </div>
                                                ))}
                                            </div>
                                        </React.Fragment>
                                    ))}
                                    {/* ── New-row insertion zone AFTER last row ── */}
                                    {editing && (
                                        <div
                                            className={cn(
                                                'w-full flex items-center justify-center rounded transition-all duration-150 select-none text-xs font-mono tracking-widest',
                                                dragKey && dropTarget?.kind === 'new-row' && dropTarget.beforeIdx === customRows.length
                                                    ? 'h-12 border-2 border-dashed border-signal/70 bg-signal/10 text-signal/60'
                                                    : 'h-3 border border-dashed border-white/10 text-transparent'
                                            )}
                                            onDragOver={e => {
                                                e.preventDefault(); e.stopPropagation();
                                                if (dragKey) setDropTarget({ kind: 'new-row', beforeIdx: customRows.length });
                                            }}
                                            onDragLeave={() => setDropTarget(null)}
                                            onDrop={e => {
                                                e.preventDefault();
                                                if (!dragKey) return;
                                                setCustomRows(prev => { const next = applyDropNewRow(prev, dragKey, customRows.length); saveCustomRows(next); return next; });
                                                setDragKey(null); setDropTarget(null);
                                            }}
                                        >
                                            {dragKey && dropTarget?.kind === 'new-row' && dropTarget.beforeIdx === customRows.length ? 'NEW ROW' : null}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // Flex-row grid: each row fills 100% width, cards stretch to
                                // the row's tallest card height — no whitespace by construction.
                                <div className="flex flex-col gap-5">
                                    {(perspective === 'lead' ? LEAD_ROWS : OPERATOR_ROWS).map((row, rowIdx) => (
                                        <div key={rowIdx} className="flex gap-5 items-stretch">
                                            {row.map(({ key, flex: flexWeight }) => (
                                                <motion.div
                                                    key={key}
                                                    variants={item}
                                                    style={{ flex: flexWeight, minWidth: 0 }}
                                                >
                                                    {renderWidget(key)}
                                                </motion.div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
