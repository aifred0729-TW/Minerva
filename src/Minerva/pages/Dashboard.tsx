import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Bell, RefreshCw, Eye, EyeOff, Sliders } from 'lucide-react';
import { useQuery, useReactiveVar } from '@apollo/client';
import { 
    ActiveCallbacksCard, 
    RecentPayloadsCard, 
    OngoingOperationsCard,
    CommandStatsCard,
    C2StatusCard,
    PayloadStatsCard,
    QuickStatsCard,
    ActiveOperatorsCard,
    RecentActivityCard,
    TopCommandsPieCard,
    TaskStatusPieCard,
    HostContextPieCard,
    UserContextPieCard,
} from '../components/DashboardCards';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { GET_DASHBOARD_DATA } from '../lib/api';
import { cn } from '../lib/utils';
import { meState } from '../../cache';

import { Sidebar } from '../components/Sidebar';

// ── Dashboard Perspective/Widget System ──────────────────────────────────────
type WidgetKey =
  | 'activeCallbacks' | 'payloadStats' | 'c2Status' | 'operations'
  | 'commandStats' | 'quickStats' | 'activeOperators' | 'recentPayloads'
  | 'recentActivity' | 'terminalLog'
  | 'topCommandsPie' | 'taskStatusPie' | 'hostContextPie' | 'userContextPie';

interface WidgetDef {
    key: WidgetKey;
    label: string;
    cols: number; // lg:col-span-N
}

const ALL_WIDGETS: WidgetDef[] = [
    { key: 'activeCallbacks', label: 'Active Callbacks', cols: 1 },
    { key: 'payloadStats', label: 'Payload Stats', cols: 1 },
    { key: 'c2Status', label: 'C2 Infrastructure', cols: 1 },
    { key: 'operations', label: 'Operation Status', cols: 1 },
    { key: 'commandStats', label: 'Command Statistics', cols: 2 },
    { key: 'quickStats', label: 'Asset Collection', cols: 1 },
    { key: 'activeOperators', label: 'Active Operators', cols: 1 },
    { key: 'topCommandsPie', label: 'Top Commands (Pie)', cols: 2 },
    { key: 'taskStatusPie', label: 'Task Status (Pie)', cols: 2 },
    { key: 'hostContextPie', label: 'Callbacks by Host', cols: 2 },
    { key: 'userContextPie', label: 'Callbacks by User', cols: 2 },
    { key: 'recentPayloads', label: 'Recent Payloads', cols: 2 },
    { key: 'recentActivity', label: 'Recent Activity', cols: 2 },
    { key: 'terminalLog', label: 'System Terminal', cols: 4 },
];

type Perspective = 'operator' | 'lead' | 'custom';

const OPERATOR_WIDGETS: WidgetKey[] = [
    'activeCallbacks', 'payloadStats', 'c2Status', 'operations',
    'commandStats', 'quickStats', 'activeOperators',
    'recentPayloads', 'recentActivity', 'terminalLog',
];

const LEAD_WIDGETS: WidgetKey[] = [
    'activeCallbacks', 'c2Status', 'operations', 'activeOperators',
    'topCommandsPie', 'taskStatusPie',
    'hostContextPie', 'userContextPie',
    'commandStats', 'quickStats',
    'recentActivity', 'terminalLog',
];

function loadCustomWidgets(): WidgetKey[] {
    try {
        const stored = localStorage.getItem('minerva-dashboard-widgets');
        if (stored) return JSON.parse(stored);
    } catch {}
    return ALL_WIDGETS.map(w => w.key);
}

function saveCustomWidgets(keys: WidgetKey[]) {
    try { localStorage.setItem('minerva-dashboard-widgets', JSON.stringify(keys)); } catch {}
}

const COL_SPAN: Record<number, string> = { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4' };

function loadPerspective(): Perspective {
    try {
        const stored = localStorage.getItem('minerva-dashboard-perspective');
        if (stored === 'operator' || stored === 'lead' || stored === 'custom') return stored;
    } catch {}
    return 'operator';
}

export default function Dashboard() {
  const { startLogout, appState, setAppState, isSidebarCollapsed } = useAppStore();
  const navigate = useNavigate();
  const me = useReactiveVar(meState);
  // @ts-ignore
  const userId = me?.user?.user_id || me?.user?.id || 0;

  const { data, loading, error, refetch } = useQuery(GET_DASHBOARD_DATA, {
    variables: { operator_id: userId },
    pollInterval: 10000,
  });

  // Perspective state
  const [perspective, setPerspective] = useState<Perspective>(loadPerspective);
  const [customWidgets, setCustomWidgets] = useState<WidgetKey[]>(loadCustomWidgets);
  const [editing, setEditing] = useState(false);

  const handlePerspectiveChange = useCallback((p: Perspective) => {
      setPerspective(p);
      setEditing(false);
      try { localStorage.setItem('minerva-dashboard-perspective', p); } catch {}
  }, []);

  const toggleWidget = useCallback((key: WidgetKey) => {
      setCustomWidgets(prev => {
          const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
          saveCustomWidgets(next);
          return next;
      });
  }, []);

  const visibleWidgetKeys = useMemo(() => {
      switch (perspective) {
          case 'lead': return LEAD_WIDGETS;
          case 'custom': return customWidgets;
          default: return OPERATOR_WIDGETS;
      }
  }, [perspective, customWidgets]);

  const visibleWidgets = useMemo(() =>
      ALL_WIDGETS.filter(w => visibleWidgetKeys.includes(w.key)),
  [visibleWidgetKeys]);

  useEffect(() => {
    if (appState === 'LOGIN') setAppState('DASHBOARD');
  }, []);

  const container = {
    hidden: { opacity: 0, y: 20, filter: 'blur(12px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { staggerChildren: 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, scale: 1.04, filter: "blur(12px)", transition: { duration: 0.6, ease: "easeInOut" } }
  } as any;
  const item = {
    hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as any } }
  };

  // Safe data extraction
  const callbacks = data?.callback || [];
  const totalCallbacks = data?.all_callbacks?.length || 0;
  const payloads = data?.payload || [];
  const payloadCount = data?.payload_aggregate?.aggregate?.count || 0;
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
  const activeOperation = { name: (me as any)?.user?.current_operation || "NONE", id: (me as any)?.user?.current_operation_id || 0 };

  // Widget renderer
  const renderWidget = (key: WidgetKey) => {
      switch (key) {
          case 'activeCallbacks': return <div onClick={() => navigate('/callbacks')} style={{cursor:'pointer'}}><ActiveCallbacksCard count={callbacks.length} totalCount={totalCallbacks} /></div>;
          case 'payloadStats': return <div onClick={() => navigate('/payloads')} style={{cursor:'pointer'}}><PayloadStatsCard count={payloadCount} /></div>;
          case 'c2Status': return <div onClick={() => navigate('/c2-profiles')} style={{cursor:'pointer'}}><C2StatusCard profiles={c2profiles} /></div>;
          case 'operations': return <div onClick={() => navigate('/operations')} style={{cursor:'pointer'}}><OngoingOperationsCard operations={operations} currentOpId={activeOperation?.id} totalOperations={totalOperations} /></div>;
          case 'commandStats': return <CommandStatsCard tasks={tasks} totalTasks={totalTasks} completedTasks={completedTasks} errorTasks={errorTasks} opsecTasks={opsecTasks} />;
          case 'quickStats': return <QuickStatsCard credentials={credentials} keylogs={keylogs} downloads={downloads} uploads={uploads} screenshots={screenshots} />;
          case 'activeOperators': return <ActiveOperatorsCard operators={operators} />;
          case 'recentPayloads': return <RecentPayloadsCard payloads={payloads} />;
          case 'recentActivity': return <RecentActivityCard tasks={tasks} />;
          case 'topCommandsPie': return <TopCommandsPieCard tasks={tasks} />;
          case 'taskStatusPie': return <TaskStatusPieCard tasks={tasks} />;
          case 'hostContextPie': return <HostContextPieCard callbacks={callbacks} />;
          case 'userContextPie': return <UserContextPieCard callbacks={callbacks} />;
          case 'terminalLog': return (
              <div className="border border-ghost/30 bg-black p-4 font-mono text-xs min-h-[200px] text-gray-400 relative overflow-hidden">
                  <div className="absolute top-2 right-2 text-gray-400/50"><Terminal size={16} /></div>
                  <div className="space-y-1">
                      <p className="text-signal">$ system_status.sh</p>
                      <p>Analyzing local environment... {loading ? <span className="text-yellow-500">[LOADING]</span> : <span className="text-signal">[OK]</span>}</p>
                      {callbacks.length > 0 && <p className="text-signal"> {'>'} Active Callbacks: {callbacks.length} / {totalCallbacks}</p>}
                      {c2profiles.length > 0 && <p> {'>'} C2 Profiles: {c2profiles.filter((p:any) => p.running).length} running / {c2profiles.length} total</p>}
                      {totalTasks > 0 && <p> {'>'} Tasks Executed: {totalTasks} (Completed: {completedTasks}, Errors: {errorTasks})</p>}
                      {opsecTasks > 0 && <p className="text-yellow-500"> {'>'} OPSEC REVIEW PENDING: {opsecTasks} task(s) awaiting approval</p>}
                      {operators.length > 0 && <p> {'>'} Active Operators: {operators.map((o:any) => o.username).join(', ')}</p>}
                      {downloads > 0 && <p className="text-blue-400"> {'>'} Files Downloaded: {downloads}</p>}
                      {credentials > 0 && <p className="text-yellow-400"> {'>'} Credentials Harvested: {credentials}</p>}
                      {screenshots > 0 && <p className="text-cyan-400"> {'>'} Screenshots Captured: {screenshots}</p>}
                      {error && <p className="text-red-500"> {'>'} ERROR: {error.message}</p>}
                      <p className="animate-pulse">_</p>
                  </div>
              </div>
          );
          default: return null;
      }
  };

  return (
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-x-hidden">
      <Sidebar />
      <div className={cn("transition-all duration-300 p-6 lg:p-12 min-h-screen", isSidebarCollapsed ? "ml-16" : "ml-64")}>
      <AnimatePresence>
        {appState === 'DASHBOARD' && (
             <motion.div key="dashboard-content" variants={container} initial="hidden" animate="show" exit="exit">
                  {/* Header */}
                  <header className="flex justify-between items-center mb-8 border-b border-ghost/30 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border border-signal rounded-full flex items-center justify-center bg-signal text-void font-bold text-xl">M</div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">MINERVA</h1>
                            <p className="text-xs text-gray-400 font-mono tracking-widest">C2_OPERATIONS_CENTER</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-4 text-gray-400 text-xs font-mono">
                            <span className="flex items-center gap-2">
                                <span className={cn("w-2 h-2 rounded-full", loading ? "bg-yellow-500 animate-pulse" : error ? "bg-red-500" : "bg-signal animate-pulse")}></span>
                                {error ? "CONNECTION_ERROR" : "GATEWAY_ONLINE"}
                            </span>
                            <span>|</span>
                            <span>OP: {activeOperation?.name || "NONE"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => refetch()} className={cn("p-2 hover:text-signal text-gray-400 transition-colors", loading && "animate-spin")} title="Refresh"><RefreshCw size={18}/></button>
                            <button className="p-2 hover:text-signal text-gray-400 transition-colors relative" title="Notifications">
                              <Bell size={20}/>
                              {opsecTasks > 0 && <span className="absolute -mt-4 ml-3 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{opsecTasks}</span>}
                            </button>
                        </div>
                    </div>
                  </header>

                  {/* Perspective Tabs */}
                  <div className="flex items-center gap-4 mb-6 border-b border-white/8 pb-3">
                      <div className="flex gap-0">
                          {(['operator', 'lead', 'custom'] as Perspective[]).map(p => (
                              <button
                                  key={p}
                                  onClick={() => handlePerspectiveChange(p)}
                                  className={cn(
                                      'px-4 py-1.5 text-xs font-mono uppercase tracking-widest border-b-2 transition-colors -mb-[13px]',
                                      perspective === p ? 'border-signal text-signal' : 'border-transparent text-gray-500 hover:text-white'
                                  )}
                              >
                                  {p}
                              </button>
                          ))}
                      </div>
                      {/* Custom mode: edit toggle */}
                      {perspective === 'custom' && (
                          <button
                              onClick={() => setEditing(e => !e)}
                              className={cn('ml-auto flex items-center gap-1.5 px-3 py-1 text-xs font-mono border rounded transition-colors',
                                  editing ? 'border-signal/50 text-signal bg-signal/10' : 'border-white/15 text-gray-400 hover:text-white')}
                          >
                              <Sliders size={12} /> {editing ? 'DONE' : 'EDIT'}
                          </button>
                      )}
                  </div>

                  {/* Custom mode: widget selector */}
                  <AnimatePresence>
                      {perspective === 'custom' && editing && (
                          <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden mb-6"
                          >
                              <div className="border border-white/10 bg-black/40 rounded p-4">
                                  <div className="text-[10px] font-mono text-gray-500 mb-3 uppercase tracking-widest">Toggle Widgets</div>
                                  <div className="flex flex-wrap gap-2">
                                      {ALL_WIDGETS.map(w => {
                                          const active = customWidgets.includes(w.key);
                                          return (
                                              <button
                                                  key={w.key}
                                                  onClick={() => toggleWidget(w.key)}
                                                  className={cn(
                                                      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border rounded transition-colors',
                                                      active ? 'border-signal/40 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-white'
                                                  )}
                                              >
                                                  {active ? <Eye size={11} /> : <EyeOff size={11} />}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                     {visibleWidgets.map(w => (
                         <motion.div key={w.key} variants={item} className={COL_SPAN[w.cols] || 'lg:col-span-1'}>
                             {renderWidget(w.key)}
                         </motion.div>
                     ))}
                  </div>
             </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
