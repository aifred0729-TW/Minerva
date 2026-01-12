import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    LayoutDashboard, 
    Terminal, 
    Box, 
    Settings, 
    LogOut, 
    ChevronLeft, 
    ChevronRight,
    Search,
    Database,
    Network,
    Layers,
    Users,
    Shield,
    Flame,
    Eye,
    Folder,
    Key,
    Target,
    FileText,
    Tag,
    Code,
    Zap
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { useOperationMode } from '../context/BattleModeContext';
import { NotificationBell } from './EventNotifications';

// Sidebar now uses global store for collapsed state
export function Sidebar() {
    const location = useLocation();
    const { startLogout, isSidebarCollapsed, setSidebarCollapsed, alertCount } = useAppStore();
    const { mode, toggleCombat, toggleRecon } = useOperationMode();

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: "DASHBOARD", path: "/dashboard", primary: true },
        { icon: <NotificationBell />, label: "EVENTS", path: "/events", hasAlert: true, primary: true },
        { icon: <ActivityIcon />, label: "CALLBACKS", path: "/callbacks", primary: true },
        { icon: <Box size={20} />, label: "PAYLOADS", path: "/payloads", primary: true },
        { icon: <Key size={20} />, label: "CREDENTIALS", path: "/credentials", primary: true },
        { icon: <Folder size={20} />, label: "FILES", path: "/files", primary: true },
        { icon: <Network size={20} />, label: "C2 PROFILES", path: "/c2-profiles", primary: true },
        { icon: <Shield size={20} />, label: "OPSEC", path: "/opsec", primary: true },
        { icon: <Users size={20} />, label: "USERS", path: "/users", primary: true },
        { icon: <Search size={20} />, label: "SEARCH", path: "/search", primary: true },
        { icon: <Settings size={20} />, label: "SETTINGS", path: "/settings", primary: true },
        // Secondary items (shown only when expanded)
        { icon: <Layers size={20} />, label: "OPERATIONS", path: "/operations", primary: false },
        { icon: <Terminal size={20} />, label: "CONSOLE", path: "/console", primary: false },
        { icon: <Database size={20} />, label: "ARTIFACTS", path: "/artifacts", primary: false },
        { icon: <Target size={20} />, label: "MITRE", path: "/mitre", primary: false },
        { icon: <FileText size={20} />, label: "REPORTING", path: "/reporting", primary: false },
        { icon: <Tag size={20} />, label: "TAGS", path: "/tags", primary: false },
        { icon: <Code size={20} />, label: "SCRIPTS", path: "/browser-scripts", primary: false },
        { icon: <Zap size={20} />, label: "EVENTING", path: "/eventing", primary: false },
    ];

    const isCombat = mode === 'combat';
    const isRecon = mode === 'recon';
    const isCollapsed = isSidebarCollapsed;
    const setIsCollapsed = setSidebarCollapsed;

    return (
        <motion.div 
            className={cn(
                "fixed left-0 top-0 h-screen bg-void border-r border-ghost/30 z-50 flex flex-col transition-all duration-300",
                isCollapsed ? "w-16" : "w-64"
            )}
            initial={false}
        >
            {/* Logo Area */}
            <div className="h-16 flex items-center border-b border-ghost/30 relative px-4">
                <div className="w-8 h-8 bg-signal text-void font-bold flex items-center justify-center rounded-sm shrink-0">
                    M
                </div>
                <AnimatePresence>
                    {!isCollapsed && (
                        <motion.span 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="font-bold tracking-[0.2em] text-lg text-signal whitespace-nowrap ml-4 overflow-hidden"
                        >
                            MINERVA
                        </motion.span>
                    )}
                </AnimatePresence>
                
                {/* Collapse Toggle */}
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-void border border-ghost/50 rounded-full flex items-center justify-center hover:border-signal text-gray-400 hover:text-signal transition-colors z-50"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 space-y-2 overflow-y-auto cyber-scrollbar overflow-x-hidden">
                {menuItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    // Hide secondary items when sidebar is collapsed
                    if (isCollapsed && !item.primary) {
                        return null;
                    }
                    
                    return (
                        <Link 
                            key={item.path} 
                            to={item.path}
                            className={cn(
                                "flex items-center gap-4 px-4 py-3 mx-2 rounded-md transition-all duration-200 group relative overflow-hidden",
                                isActive 
                                    ? "bg-signal/10 text-signal border border-signal/20" 
                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            )}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-signal shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
                            )}
                            
                            <span className={cn("relative z-10 transition-transform duration-300 shrink-0", isActive ? "scale-110" : "group-hover:scale-110")}>
                                {item.icon}
                            </span>

                            <AnimatePresence>
                                {!isCollapsed && (
                                    <motion.span
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="font-mono text-sm tracking-wider whitespace-nowrap"
                                    >
                                        {item.label}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </Link>
                    );
                })}
            </nav>

            {/* Mode Toggles */}
            <div className={cn("px-4 pb-2 pt-2 border-t border-ghost/10 space-y-2", isCollapsed ? "flex flex-col items-center" : "")}>
                {/* Recon Mode Toggle */}
                <button
                    onClick={toggleRecon}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 px-3 py-2 rounded border transition-all shadow-lg group relative overflow-hidden",
                        isRecon
                          ? "bg-yellow-500/20 border-yellow-400/60 text-yellow-100 hover:bg-yellow-500/30"
                          : "bg-black/40 border-gray-700/50 text-gray-400 hover:bg-white/5 hover:border-gray-500 hover:text-white"
                    )}
                    title={isRecon ? "Exit Recon Mode" : "Enter Recon Mode"}
                >
                    <Eye size={16} className={cn("transition-colors", isRecon ? "text-yellow-400 animate-pulse" : "text-gray-500 group-hover:text-yellow-500")} />
                    <AnimatePresence>
                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                className="font-mono text-xs tracking-wider whitespace-nowrap overflow-hidden"
                            >
                                {isRecon ? "RECON" : "RECON"}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>

                {/* Combat Mode Toggle */}
                <button
                    onClick={toggleCombat}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 px-3 py-2 rounded border transition-all shadow-lg group relative overflow-hidden",
                        isCombat
                          ? "bg-red-500/20 border-red-400/60 text-red-100 hover:bg-red-500/30"
                          : "bg-black/40 border-gray-700/50 text-gray-400 hover:bg-white/5 hover:border-gray-500 hover:text-white"
                    )}
                    title={isCombat ? "Disengage Combat Protocol" : "Engage Combat Protocol"}
                >
                    <Flame size={16} className={cn("transition-colors", isCombat ? "text-red-400 animate-pulse" : "text-gray-500 group-hover:text-red-500")} />
                    <AnimatePresence>
                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                className="font-mono text-xs tracking-wider whitespace-nowrap overflow-hidden"
                            >
                                {isCombat ? "COMBAT" : "COMBAT"}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>
            </div>

            {/* User / Footer */}
            <div className="p-4 border-t border-ghost/30 bg-black/20 overflow-hidden">
                <div className={cn("flex items-center gap-3 transition-all duration-300", isCollapsed ? "justify-center" : "")}>
                    <div className="w-8 h-8 rounded bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                        <Settings size={16} className="text-gray-400" />
                    </div>
                    <AnimatePresence>
                        {!isCollapsed && (
                            <>
                                <motion.div 
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: "auto" }}
                                    exit={{ opacity: 0, width: 0 }}
                                    className="flex-1 overflow-hidden whitespace-nowrap"
                                >
                                    <div className="text-xs font-mono text-gray-300 truncate">OPERATOR</div>
                                    <div className="text-[10px] text-green-500 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0"></span>
                                        ONLINE
                                    </div>
                                </motion.div>
                                <motion.button 
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0 }}
                                    onClick={startLogout} 
                                    className="text-gray-500 hover:text-red-500 transition-colors shrink-0"
                                >
                                    <LogOut size={18} />
                                </motion.button>
                            </>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}

// Custom Icons
function ActivityIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
    )
}
