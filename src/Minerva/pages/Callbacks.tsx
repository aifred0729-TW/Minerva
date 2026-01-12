import React, { useState, useRef } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_CALLBACKS, HIDE_CALLBACK_MUTATION, LOCK_CALLBACK_MUTATION, UPDATE_CALLBACK_DESCRIPTION_MUTATION } from '../lib/api';
import { CyberTable } from '../components/CyberTable';
import { Terminal, Shield, Cpu, Activity, User, MoreVertical, Lock, Unlock, EyeOff, Eye, Edit, Trash2, Network, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { createPortal } from 'react-dom';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { CyberModal } from '../components/CyberModal';
import { CallbackGraph } from '../components/CallbackGraph';
// @ts-ignore
import loadingSound from '../soundeffect/loading.m4a';

const LastCheckinCell = ({ lastCheckin }: { lastCheckin: string }) => {
    const calculateTimeAgo = React.useCallback(() => {
        if (!lastCheckin) return { text: "NEVER", color: "text-gray-500" };
        
        try {
            const timeStr = lastCheckin.endsWith('Z') ? lastCheckin : `${lastCheckin}Z`;
            const last = new Date(timeStr).getTime();
            const now = new Date().getTime();
            const diff = Math.floor((now - last) / 1000); // seconds
            
            let color = "text-green-500";
            if (diff > 60) color = "text-yellow-500";
            if (diff > 300) color = "text-red-500";
            
            let timeText = `${diff}s ago`;
            if (diff < 0) timeText = "0s ago";
            else if (diff >= 86400) timeText = `${Math.floor(diff / 86400)}d ago`;
            else if (diff >= 3600) timeText = `${Math.floor(diff / 3600)}h ago`;
            else if (diff >= 60) timeText = `${Math.floor(diff / 60)}m ago`;

            return { text: timeText, color };
        } catch (e) {
            return { text: "ERROR", color: "text-red-500" };
        }
    }, [lastCheckin]);

    const [status, setStatus] = useState(calculateTimeAgo());

    React.useEffect(() => {
        setStatus(calculateTimeAgo());
        const interval = setInterval(() => {
            setStatus(calculateTimeAgo());
        }, 1000);
        return () => clearInterval(interval);
    }, [calculateTimeAgo]);

    return <span className={status.color}>{status.text}</span>;
};

export default function Callbacks() {
  const { isSidebarCollapsed } = useAppStore();
  
  // Play loading sound on mount
  React.useEffect(() => {
    const audio = new Audio(loadingSound);
    audio.volume = 0.5;
    audio.play().catch(e => console.error("Loading sound play failed:", e));
  }, []);

  const { data, loading, error, refetch } = useQuery(GET_CALLBACKS, {
    pollInterval: 5000,
  });
  const navigate = useNavigate();

  const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION);
  const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION);
  const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);

  const [actionsMenuOpenId, setActionsMenuOpenId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [editDescriptionCallback, setEditDescriptionCallback] = useState<any>(null);
  const [newDescription, setNewDescription] = useState("");
  const [showHiddenCallbacks, setShowHiddenCallbacks] = useState(false);

  const handleRowClick = (callback: any) => {
      // Navigate to Callback Console
      navigate(`/console/${callback.display_id}`); 
  };

  const handleActionsClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 5, left: rect.right - 160 });
    setActionsMenuOpenId(actionsMenuOpenId === id ? null : id);
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setActionsMenuOpenId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleHide = async (callback: any) => {
      try {
          await hideCallback({ variables: { callback_display_id: callback.display_id, active: false } });
          snackActions.success(`Callback ${callback.display_id} hidden`);
          refetch();
      } catch (e: any) {
          snackActions.error("Failed to hide callback: " + e.message);
      }
      setActionsMenuOpenId(null);
  };

  const handleShow = async (callback: any) => {
      try {
          await hideCallback({ variables: { callback_display_id: callback.display_id, active: true } });
          snackActions.success(`Callback ${callback.display_id} restored`);
          refetch();
      } catch (e: any) {
          snackActions.error("Failed to show callback: " + e.message);
      }
      setActionsMenuOpenId(null);
  };

  const handleLockToggle = async (callback: any) => {
      try {
          await lockCallback({ variables: { callback_display_id: callback.display_id, locked: !callback.locked } });
          snackActions.success(`Callback ${callback.display_id} ${callback.locked ? "unlocked" : "locked"}`);
          refetch();
      } catch (e: any) {
          snackActions.error("Failed to toggle lock: " + e.message);
      }
      setActionsMenuOpenId(null);
  };

  const openEditDescription = (callback: any) => {
      setEditDescriptionCallback(callback);
      setNewDescription(callback.description || "");
      setActionsMenuOpenId(null);
  };

  const handleSaveDescription = async () => {
      if (!editDescriptionCallback) return;
      try {
          await updateDescription({ variables: { callback_display_id: editDescriptionCallback.display_id, description: newDescription } });
          snackActions.success("Description updated");
          refetch();
          setEditDescriptionCallback(null);
      } catch (e: any) {
          snackActions.error("Failed to update description: " + e.message);
      }
  };

  const columns = [
    {
        header: "ID",
        cell: (row: any) => (
            <div className="flex items-center gap-2">
                <span className={row.active === false ? "text-gray-600" : "text-gray-400"}>#{row.display_id}</span>
                {row.locked && <Lock size={12} className="text-red-500" />}
                {row.active === false && <EyeOff size={12} className="text-yellow-500" title="Hidden" />}
            </div>
        )
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
        cell: (row: any) => <LastCheckinCell lastCheckin={row.last_checkin} />
    },
    {
        header: "DESCRIPTION",
        cell: (row: any) => (
            <span className="text-xs text-gray-500 italic truncate max-w-[150px] block" title={row.description}>
                {row.description || "No description"}
            </span>
        )
    },
    {
        header: "AGENT",
        cell: (row: any) => <span className="uppercase text-xs border border-ghost/30 px-2 py-0.5 rounded">{row.payload?.payloadtype?.name}</span>
    },
    {
        header: "",
        className: "w-10",
        cell: (row: any) => (
            <div className="relative">
                <button 
                    onClick={(e) => handleActionsClick(e, row.id)}
                    className="p-1 hover:text-signal text-gray-500 transition-colors"
                >
                    <MoreVertical size={16} />
                </button>
                {actionsMenuOpenId === row.id && createPortal(
                    <div 
                        className="fixed z-50 bg-black border border-signal/30 shadow-lg shadow-signal/10 w-48 backdrop-blur-md"
                        style={{ top: menuPosition.top, left: menuPosition.left }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-1 flex flex-col">
                            <button onClick={() => openEditDescription(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                <Edit size={14} /> Edit Description
                            </button>
                            <button onClick={() => handleLockToggle(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-left text-gray-300 hover:text-signal transition-colors">
                                {row.locked ? <Unlock size={14} /> : <Lock size={14} />} 
                                {row.locked ? "Unlock Callback" : "Lock Callback"}
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                            {row.active === false ? (
                                <button onClick={() => handleShow(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-green-900/30 text-xs text-left text-green-400 hover:text-green-300 transition-colors">
                                    <Eye size={14} /> Show Callback
                                </button>
                            ) : (
                                <button onClick={() => handleHide(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors">
                                    <EyeOff size={14} /> Hide Callback
                                </button>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        )
    }
  ];

  return (
    <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void">
        <Sidebar />
        
        <div className={cn("transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}>
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
                    <div className="flex gap-6 text-xs font-mono items-center">
                        <div className="text-right border-l border-ghost/20 pl-6">
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
            className="flex-1 h-full min-h-0 flex flex-col gap-6"
        >
            {/* Graph View Section - Top 60% */}
            <div className="h-[60%] min-h-[400px] border-b border-ghost/20 pb-6">
                <div className="flex items-center gap-2 mb-2 text-xs font-mono text-gray-400">
                    <Network size={14} className="text-signal" />
                    <span>NETWORK_TOPOLOGY</span>
                </div>
                <CallbackGraph />
            </div>

            {/* List View Section - Remaining space */}
            <div className="flex-1 min-h-0 overflow-auto">
                 <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                        <List size={14} className="text-signal" />
                        <span>AGENT_LIST</span>
                        {showHiddenCallbacks && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded">
                                SHOWING HIDDEN
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => setShowHiddenCallbacks(!showHiddenCallbacks)}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded",
                            showHiddenCallbacks 
                                ? "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30" 
                                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                        )}
                        title={showHiddenCallbacks ? "Hide inactive callbacks" : "Show hidden callbacks"}
                    >
                        {showHiddenCallbacks ? <Eye size={12} /> : <EyeOff size={12} />}
                        <span>{showHiddenCallbacks ? "HIDE_INACTIVE" : "SHOW_HIDDEN"}</span>
                    </button>
                </div>
            <CyberTable 
                data={(data?.callback || []).filter((c: any) => showHiddenCallbacks || c.active !== false)} 
                    columns={columns as any} 
                isLoading={loading}
                onRowClick={handleRowClick}
            />
            </div>
        </motion.div>
        </div>

        <AnimatePresence>
            {editDescriptionCallback && (
                <CyberModal 
                    title="EDIT_DESCRIPTION" 
                    onClose={() => setEditDescriptionCallback(null)}
                    icon={<Edit />}
                >
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                            <input 
                                type="text" 
                                value={newDescription} 
                                onChange={(e) => setNewDescription(e.target.value)} 
                                className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setEditDescriptionCallback(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                            <button 
                                onClick={handleSaveDescription}
                                className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors"
                            >
                                SAVE
                            </button>
                        </div>
                    </div>
                </CyberModal>
            )}
        </AnimatePresence>
    </div>
  );
}
