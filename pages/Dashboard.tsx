import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Settings, Bell, RefreshCw } from 'lucide-react';
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
    RecentActivityCard
} from '../components/DashboardCards';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { GET_DASHBOARD_DATA } from '../lib/api';
import { cn } from '../lib/utils';
import { meState } from '../../cache';

import { Sidebar } from '../components/Sidebar';

export default function Dashboard() {
  const { startLogout, appState, setAppState } = useAppStore();
  const navigate = useNavigate();
  const me = useReactiveVar(meState);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  // @ts-ignore
  const userId = me?.user?.user_id || me?.user?.id || 0;

  // Fetch Real Data
  const { data, loading, error, refetch } = useQuery(GET_DASHBOARD_DATA, {
    variables: { operator_id: userId },
    pollInterval: 10000, // Auto-refresh every 10s
  });

  // Fix: Ensure appState is correct on refresh
  useEffect(() => {
    if (appState === 'LOGIN') {
        setAppState('DASHBOARD');
    }
  }, []);

  const container = {
    hidden: { opacity: 0, scale: 0.98 },
    show: {
      opacity: 1,
      scale: 1,
      transition: {
        staggerChildren: 0.08,
        duration: 0.4
      }
    },
    exit: {
        opacity: 0,
        scale: 1.05,
        filter: "blur(10px)",
        transition: {
            duration: 0.8,
            ease: "easeInOut"
        }
    }
  } as any;

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
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
  
  // Calculate task stats from the tasks array
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.completed === true).length;
  const errorTasks = tasks.filter((t: any) => t.status === 'error').length;
  const opsecTasks = tasks.filter((t: any) => 
    (t.opsec_pre_blocked === true && t.opsec_pre_bypassed !== true) ||
    (t.opsec_post_blocked === true && t.opsec_post_bypassed !== true)
  ).length;
  
  // Asset stats
  const credentials = data?.credential_aggregate?.aggregate?.count || 0;
  const keylogs = data?.keylog_aggregate?.aggregate?.count || 0;
  const downloads = data?.filemeta_aggregate?.aggregate?.count || 0;
  const uploads = data?.uploaded_files?.aggregate?.count || 0;
  const screenshots = data?.screenshot_aggregate?.aggregate?.count || 0;

  const activeOperation = {
      // @ts-ignore
      name: me?.user?.current_operation || "NONE",
      // @ts-ignore
      id: me?.user?.current_operation_id || 0
  };

  return (
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-x-hidden">
      <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />

      {/* Main Content Wrapper */}
      <div className={cn("transition-all duration-300 p-6 lg:p-12 min-h-screen", isSidebarCollapsed ? "ml-16" : "ml-64")}>
      
      {/* 包裹整個內容以進行 Exit Animation */}
      <AnimatePresence>
        {appState === 'DASHBOARD' && (
             <motion.div
                key="dashboard-content"
                variants={container}
                initial="hidden"
                animate="show"
                exit="exit"
             >
                  {/* Header */}
                  <header className="flex justify-between items-center mb-12 border-b border-ghost/30 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border border-signal rounded-full flex items-center justify-center bg-signal text-void font-bold text-xl">
                            M
                        </div>
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
                            <button 
                              onClick={() => refetch()} 
                              className={cn("p-2 hover:text-signal text-gray-400 transition-colors", loading && "animate-spin")}
                              title="Refresh"
                            >
                              <RefreshCw size={18}/>
                            </button>
                            <button className="p-2 hover:text-signal text-gray-400 transition-colors" title="Notifications">
                              <Bell size={20}/>
                              {opsecTasks > 0 && (
                                <span className="absolute -mt-4 ml-3 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                                  {opsecTasks}
                                </span>
                              )}
                            </button>
                            <button className="p-2 hover:text-signal text-gray-400 transition-colors" title="Settings"><Settings size={20}/></button>
                        </div>
                    </div>
                  </header>

                  {/* Main Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                     {/* Row 1: Key Metrics */}
                     <motion.div variants={item} className="lg:col-span-1" onClick={() => navigate('/callbacks')} style={{cursor: 'pointer'}}>
                        <ActiveCallbacksCard count={callbacks.length} totalCount={totalCallbacks} />
                     </motion.div>
                     <motion.div variants={item} className="lg:col-span-1" onClick={() => navigate('/payloads')} style={{cursor: 'pointer'}}>
                        <PayloadStatsCard count={payloadCount} />
                     </motion.div>
                     <motion.div variants={item} className="lg:col-span-1" onClick={() => navigate('/c2-profiles')} style={{cursor: 'pointer'}}>
                        <C2StatusCard profiles={c2profiles} />
                     </motion.div>
                     <motion.div variants={item} className="lg:col-span-1" onClick={() => navigate('/operations')} style={{cursor: 'pointer'}}>
                        <OngoingOperationsCard operations={operations} currentOpId={activeOperation?.id} totalOperations={totalOperations} />
                     </motion.div>

                     {/* Row 2: Data Panels */}
                     <motion.div variants={item} className="lg:col-span-2">
                        <CommandStatsCard 
                          tasks={tasks} 
                          totalTasks={totalTasks}
                          completedTasks={completedTasks}
                          errorTasks={errorTasks}
                          opsecTasks={opsecTasks}
                        />
                     </motion.div>
                     <motion.div variants={item} className="lg:col-span-1">
                        <QuickStatsCard 
                          credentials={credentials}
                          keylogs={keylogs}
                          downloads={downloads}
                          uploads={uploads}
                          screenshots={screenshots}
                        />
                     </motion.div>
                     <motion.div variants={item} className="lg:col-span-1">
                        <ActiveOperatorsCard operators={operators} />
                     </motion.div>

                     {/* Row 3: Recent Activity & Payloads */}
                     <motion.div variants={item} className="lg:col-span-2">
                        <RecentPayloadsCard payloads={payloads} />
                     </motion.div>
                     <motion.div variants={item} className="lg:col-span-2">
                        <RecentActivityCard tasks={tasks} />
                     </motion.div>
                     
                     {/* Row 4: Terminal / System Log */}
                     <motion.div variants={item} className="lg:col-span-4 border border-ghost/30 bg-black p-4 font-mono text-xs min-h-[200px] text-gray-400 relative overflow-hidden">
                         <div className="absolute top-2 right-2 text-gray-400/50"><Terminal size={16} /></div>
                         <div className="space-y-1">
                            <p className="text-signal">$ system_status.sh</p>
                            <p>Analyzing local environment... <span className="text-signal">[OK]</span></p>
                            <p>Fetching operation data... {loading ? <span className="text-yellow-500">[LOADING]</span> : <span className="text-signal">[OK]</span>}</p>
                            {callbacks.length > 0 && <p className="text-signal"> {'>'} Active Callbacks: {callbacks.length} / {totalCallbacks}</p>}
                            {c2profiles.length > 0 && <p> {'>'} C2 Profiles: {c2profiles.filter(p => p.running).length} running / {c2profiles.length} total</p>}
                            {totalTasks > 0 && <p> {'>'} Tasks Executed: {totalTasks} (Completed: {completedTasks}, Errors: {errorTasks})</p>}
                            {opsecTasks > 0 && <p className="text-yellow-500"> {'>'} OPSEC REVIEW PENDING: {opsecTasks} task(s) awaiting approval</p>}
                            {operators.length > 0 && <p> {'>'} Active Operators: {operators.map(o => o.username).join(', ')}</p>}
                            {downloads > 0 && <p className="text-blue-400"> {'>'} Files Downloaded: {downloads}</p>}
                            {credentials > 0 && <p className="text-yellow-400"> {'>'} Credentials Harvested: {credentials}</p>}
                            {screenshots > 0 && <p className="text-cyan-400"> {'>'} Screenshots Captured: {screenshots}</p>}
                            {error && <p className="text-red-500"> {'>'} ERROR: {error.message}</p>}
                            <p className="animate-pulse">_</p>
                         </div>
                     </motion.div>
                  </div>
             </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
