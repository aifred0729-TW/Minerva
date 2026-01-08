import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_CALLBACKS } from '../lib/api';
import { CyberTable } from '../components/CyberTable';
import { Terminal, Shield, Cpu, Activity, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';

export default function Callbacks() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const { data, loading, error } = useQuery(GET_CALLBACKS, {
    pollInterval: 5000,
  });
  const navigate = useNavigate();

  const handleRowClick = (callback: any) => {
      // Navigate to Callback Console
      navigate(`/console/${callback.display_id}`); 
  };

  const columns = [
    {
        header: "ID",
        cell: (row: any) => <span className="text-gray-400">#{row.display_id}</span>
    },
    {
        header: "USER",
        cell: (row: any) => (
            <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400" />
                <span className={row.integrity_level > 2 ? "text-yellow-500 font-bold" : "text-signal"}>
                    {row.user}
                </span>
                {row.integrity_level > 2 && <Shield size={12} className="text-yellow-500" />}
            </div>
        )
    },
    {
        header: "HOST",
        accessorKey: "host"
    },
    {
        header: "IP",
        cell: (row: any) => {
            try {
                const ips = JSON.parse(row.ip);
                return ips.length > 0 ? ips[0] : "UNKNOWN";
            } catch (e) {
                return row.ip || "UNKNOWN";
            }
        }
    },
    {
        header: "OS",
        cell: (row: any) => (
            <div className="flex items-center gap-2 text-xs">
                <Cpu size={14} className="text-gray-400" />
                <span>{row.os} ({row.architecture})</span>
            </div>
        )
    },
    {
        header: "PID",
        accessorKey: "pid",
        className: "font-mono text-gray-400"
    },
    {
        header: "LAST CHECKIN",
        cell: (row: any) => {
            // Calculate time difference
            const last = new Date(row.last_checkin).getTime();
            const now = new Date().getTime();
            const diff = Math.floor((now - last) / 1000); // seconds
            
            let color = "text-green-500";
            if (diff > 60) color = "text-yellow-500";
            if (diff > 300) color = "text-red-500";

            return <span className={color}>{diff}s ago</span>
        }
    },
    {
        header: "AGENT",
        cell: (row: any) => <span className="uppercase text-xs border border-ghost/30 px-2 py-0.5 rounded">{row.payload?.payloadtype?.name}</span>
    }
  ];

  return (
    <div className="h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-hidden flex">
        <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />
        
        <div className={cn(
            "flex-1 h-full overflow-hidden flex flex-col transition-all duration-300 relative",
            isSidebarCollapsed ? "ml-16" : "ml-64"
        )}>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12">
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded">
                            <Activity size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">ACTIVE CALLBACKS</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/agents/list</p>
                        </div>
                    </div>
                    
                    {/* Stats Summary */}
                    <div className="flex gap-6 text-xs font-mono">
                        <div className="text-right">
                            <div className="text-gray-400">TOTAL_AGENTS</div>
                            <div className="text-xl text-signal">{data?.callback?.length || 0}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-gray-400">HIGH_INTEGRITY</div>
                            <div className="text-xl text-yellow-500">
                                {data?.callback?.filter((c: any) => c.integrity_level > 2).length || 0}
                            </div>
                        </div>
                    </div>
                </header>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <CyberTable 
                        data={data?.callback || []} 
                        columns={columns} 
                        isLoading={loading}
                        onRowClick={handleRowClick}
                    />
                </motion.div>
            </div>
        </div>
    </div>
  );
}
