import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_C2_PROFILES, START_STOP_PROFILE_MUTATION } from '../lib/api';
import { CyberTable } from '../components/CyberTable';
import { Radio, Power, RefreshCw, Activity, Server, Settings, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { C2DetailsModal } from '../components/C2DetailsModal';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store';

export default function C2Profiles() {
  const { isSidebarCollapsed } = useAppStore();
  
  const { data, loading, refetch } = useQuery(GET_C2_PROFILES, {
    pollInterval: 10000,
    fetchPolicy: 'cache-and-network',
  });

  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [startStopProfile] = useMutation(START_STOP_PROFILE_MUTATION, {
      onCompleted: () => {
          setProcessingId(null);
          setTimeout(refetch, 1000);
      },
      onError: () => {
          setProcessingId(null);
      }
  });

  const handleToggle = useCallback((id: number, currentStatus: boolean) => {
      setProcessingId(id);
      startStopProfile({
          variables: {
              id: id,
              action: currentStatus ? "stop" : "start"
          }
      });
  }, [startStopProfile]);

  const columns = useMemo(() => [
    {
        header: "NAME / INFO",
        cell: (row: any) => (
            <div className="flex items-center gap-4">
                <div className={cn(
                    "w-3 h-3 rounded-full transition-colors duration-300 shrink-0",
                    row.running ? "bg-green-500 shadow-[0_0_8px_#22c55e]" : "bg-red-500"
                )} />
                <div className="flex flex-col gap-1">
                    <div className="font-bold text-signal tracking-wide flex items-center gap-2 text-base">
                        {row.name}
                        {row.is_p2p && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 border border-blue-800 rounded">P2P</span>}
                    </div>
                    <div className="text-xs text-gray-400 font-mono flex gap-3">
                        <span><span className="text-gray-600">AUTH:</span> {row.author}</span>
                        <span><span className="text-gray-600">VER:</span> {row.semver}</span>
                    </div>
                </div>
            </div>
        )
    },
    {
        header: "SUPPORTED_ARCH",
        className: "hidden lg:table-cell",
        cell: (row: any) => (
            <div className="flex flex-wrap gap-1 max-w-[200px]">
                {row.payloadtypec2profiles?.map((pt: any) => (
                    <span key={pt.payloadtype.name} className="px-1.5 py-0.5 bg-white/5 border border-gray-700 text-[10px] font-mono text-gray-300">
                        {pt.payloadtype.name}
                    </span>
                ))}
            </div>
        )
    },
    {
        header: "DESCRIPTION",
        accessorKey: "description",
        className: "hidden md:table-cell text-gray-400 italic text-sm max-w-md truncate"
    },
    {
        header: "STATUS_CHECKS",
        cell: (row: any) => (
            <div className="flex flex-col gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                    <Server size={14} className={row.container_running ? "text-green-500" : "text-red-500"} />
                    <span className={row.container_running ? "text-green-500" : "text-red-500"}>
                        CONTAINER: {row.container_running ? "UP" : "DOWN"}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Activity size={14} className={row.running ? "text-green-500" : "text-red-500"} />
                    <span className={row.running ? "text-green-500" : "text-red-500"}>
                        SERVER: {row.running ? "LISTENING" : "STOPPED"}
                    </span>
                </div>
            </div>
        )
    },
    {
        header: "ACTIONS",
        cell: (row: any) => {
            const isProcessing = processingId === row.id;
            return (
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleToggle(row.id, row.running); }}
                        disabled={isProcessing}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 border transition-all duration-300 font-mono text-xs font-bold min-w-[150px] justify-center rounded",
                            row.running 
                                ? "border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500" 
                                : "border-green-500/50 text-green-400 hover:bg-green-500/10 hover:border-green-500",
                            isProcessing && "opacity-70 cursor-wait border-yellow-500 text-yellow-500"
                        )}
                    >
                        {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Power size={14} />}
                        {isProcessing ? "PROCESSING..." : (row.running ? "STOP_PROFILE" : "START_PROFILE")}
                    </button>
                    
                    <button
                        onClick={(e) => { e.stopPropagation(); setSelectedProfile(row); }}
                        className="p-1.5 border border-gray-700 text-gray-400 hover:text-signal hover:border-signal transition-colors rounded"
                    >
                        <Settings size={16} />
                    </button>
                </div>
            );
        }
    }
  ], [processingId, handleToggle]);

  return (
    <div className="h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-hidden flex">
        <Sidebar />
        
        <div className={cn(
            "flex-1 h-full overflow-hidden flex flex-col transition-all duration-300 relative",
            isSidebarCollapsed ? "ml-16" : "ml-64"
        )}>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12">
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded">
                            <Radio size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">C2 PROFILES</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/network/profiles • {data?.c2profile?.length || 0} CHANNELS_DETECTED</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => refetch()} 
                        className="p-2 border border-gray-700 hover:border-signal text-gray-400 hover:text-signal transition-colors rounded-full"
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </header>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="will-change-transform"
                >
                    <CyberTable 
                        data={data?.c2profile || []} 
                        columns={columns} 
                        isLoading={loading}
                        onRowClick={(row) => setSelectedProfile(row)}
                    />
                </motion.div>
            </div>
            
            {/* Detailed Modal */}
            <C2DetailsModal 
                profile={selectedProfile} 
                isOpen={!!selectedProfile} 
                onClose={() => setSelectedProfile(null)} 
            />
        </div>
    </div>
  );
}
