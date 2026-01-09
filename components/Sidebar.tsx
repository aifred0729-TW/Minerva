import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    LayoutDashboard, 
    Terminal, 
    Zap, 
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
    Shield
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
    const location = useLocation();
    const { startLogout } = useAppStore();

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: "DASHBOARD", path: "/dashboard" },
        { icon: <Layers size={20} />, label: "OPERATIONS", path: "/operations" },
        { icon: <Box size={20} />, label: "PAYLOADS", path: "/payloads" },
        { icon: <ActivityIcon />, label: "CALLBACKS", path: "/callbacks" },
        { icon: <Network size={20} />, label: "C2 PROFILES", path: "/c2-profiles" },
        { icon: <Terminal size={20} />, label: "CONSOLE", path: "/console" },
        { icon: <Shield size={20} />, label: "OPSEC", path: "/opsec" },
        { icon: <Database size={20} />, label: "ARTIFACTS", path: "/artifacts" },
        { icon: <Users size={20} />, label: "USERS", path: "/users" },
        { icon: <Search size={20} />, label: "SEARCH", path: "/search" },
    ];

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
            <nav className="flex-1 py-6 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
                {menuItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
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
