import React from 'react';
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
    Globe,
    Server,
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
    Zap,
    Waypoints,
    Package,
    ListTodo,
    BookOpen,
    Braces,
    ExternalLink,
    Sun,
    Moon
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { cn } from '../lib/utils';
import { useOperationMode } from '../context/BattleModeContext';
import { playEnter } from '../lib/soundEffects';
import { useTheme } from '../context/ThemeContext';
import { NotificationBell } from './EventNotifications';
import { useGetMythicSetting } from './MythicSavedUserSetting';
import { DEFAULT_SIDEBAR_SHORTCUTS } from '../pages/Settings';
import { UserAvatar } from './UserAvatar';
import { useReactiveVar } from "@apollo/client/react";
import { meState } from '../lib/state';

// Sidebar now uses global store for collapsed state
export function Sidebar() {
    const location = useLocation();
    const { startLogout, isSidebarCollapsed, setSidebarCollapsed } = useAppStore(useShallow(s => ({ startLogout: s.startLogout, isSidebarCollapsed: s.isSidebarCollapsed, setSidebarCollapsed: s.setSidebarCollapsed })));
    const { mode, toggleCombat, toggleRecon } = useOperationMode();
    const { theme, toggleTheme } = useTheme();
    const me = useReactiveVar(meState);
    const username = me?.user?.username || 'OPERATOR';

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: "DASHBOARD", path: "/dashboard" },
        { icon: <NotificationBell />, label: "EVENTS", path: "/events", hasAlert: true },
        { icon: <ActivityIcon />, label: "CALLBACKS", path: "/callbacks" },
        { icon: <Terminal size={20} />, label: "CONSOLE", path: "/console" },
        { icon: <ListTodo size={20} />, label: "TASKS", path: "/task" },
        { icon: <Box size={20} />, label: "PAYLOADS", path: "/payloads" },
        { icon: <Key size={20} />, label: "CREDENTIALS", path: "/credentials" },
        { icon: <Folder size={20} />, label: "FILES", path: "/files" },
        { icon: <Network size={20} />, label: "C2 PROFILES", path: "/c2-profiles" },
        { icon: <Waypoints size={20} />, label: "TUNNELS",   path: "/tunnels" },
        { icon: <Zap size={20} />, label: "QUICKHACK", path: "/quickhacks" },
        { icon: <Users size={20} />, label: "USERS", path: "/users" },
        { icon: <Search size={20} />, label: "SEARCH", path: "/search" },
        { icon: <Globe size={20} />, label: "3D TOPOLOGY", path: "/topology" },
        { icon: <Server size={20} />, label: "METASPLOIT", path: "/metasploit" },
        { icon: <Settings size={20} />, label: "SETTINGS", path: "/settings" },
        { icon: <Shield size={20} />, label: "OPSEC", path: "/opsec" },
        { icon: <Layers size={20} />, label: "OPERATIONS", path: "/operations" },
        { icon: <Database size={20} />, label: "ARTIFACTS", path: "/artifacts" },
        { icon: <Target size={20} />, label: "MITRE", path: "/mitre" },
        { icon: <FileText size={20} />, label: "REPORTING", path: "/reporting" },
        { icon: <Tag size={20} />, label: "TAGS", path: "/tags" },
        { icon: <Code size={20} />, label: "SCRIPTS", path: "/browser-scripts" },
        { icon: <Zap size={20} />, label: "EVENTING", path: "/eventing" },
        { icon: <Package size={20} />, label: "PKG TYPES", path: "/payload-types" },
        { icon: <BookOpen size={20} />, label: "JUPYTER", path: "/jupyter", key: "jupyter", external: true },
        { icon: <Braces size={20} />, label: "GRAPHQL", path: "/console", key: "graphql", external: true },
    ];

    // Apply sideShortcuts setting — filter & reorder
    const sideShortcuts = useGetMythicSetting({setting_name:'sideShortcuts', default_value: DEFAULT_SIDEBAR_SHORTCUTS});
    const orderedItems = React.useMemo(() => {
        if (!Array.isArray(sideShortcuts) || sideShortcuts.length === 0) return menuItems;
        const shortcutSet = new Set(sideShortcuts as string[]);
        const getKey = (m: typeof menuItems[number]) => ('key' in m ? m.key : undefined) ?? m.path.replace(/^\//, '');
        const byKey = new Map(menuItems.map(m => [getKey(m), m]));
        const ordered: typeof menuItems = [];
        for (const key of sideShortcuts as string[]) {
            const item = byKey.get(key);
            if (item) ordered.push(item);
        }
        // add any remaining items not in the setting (new items added after setting was saved)
        for (const item of menuItems) {
            const key = getKey(item);
            if (!shortcutSet.has(key)) ordered.push(item);
        }
        return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sideShortcuts]);

    const isCombat = mode === 'combat';
    const isRecon = mode === 'recon';
    const isCollapsed = isSidebarCollapsed;
    const setIsCollapsed = setSidebarCollapsed;

    return (
        <div
            className={cn(
                "fixed left-0 top-0 h-screen bg-void border-r border-ghost/30 z-50 flex flex-col",
                "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[width]",
                isCollapsed ? "w-16" : "w-64"
            )}
        >
            {/* Logo Area */}
            <div className="h-16 flex items-center border-b border-ghost/30 relative shrink-0">
                <div className="flex items-center pl-4 overflow-hidden flex-1 min-w-0">
                    <div className="w-8 h-8 bg-signal text-void font-bold flex items-center justify-center rounded-sm shrink-0">
                        M
                    </div>
                    <span
                        className={cn(
                            "font-bold tracking-[0.2em] text-lg text-signal whitespace-nowrap ml-4 transition-opacity duration-200",
                            isCollapsed ? "opacity-0" : "opacity-100"
                        )}
                    >
                        MINERVA
                    </span>
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-void border border-ghost/50 rounded-full flex items-center justify-center hover:border-signal text-gray-400 hover:text-signal transition-colors z-50"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className={cn(
                "flex-1 overflow-y-auto overflow-x-hidden sidebar-nav",
                isCollapsed ? "py-4 space-y-1" : "py-6 space-y-2"
            )}>
                {orderedItems.map((item) => {
                    const isActive = !item.external && location.pathname.startsWith(item.path);

                    const Wrapper = item.external ? 'a' : Link;
                    const wrapperProps: any = item.external
                        ? { href: item.path, target: '_blank', rel: 'noopener noreferrer' }
                        : { to: item.path, onClick: () => { if (!isActive && item.path === '/callbacks') playEnter(); } };

                    return (
                        <Wrapper
                            key={'key' in item ? item.key : item.path}
                            title={isCollapsed ? item.label : undefined}
                            {...wrapperProps}
                            className={cn(
                                "group relative overflow-hidden rounded-md transition-colors duration-200",
                                isCollapsed
                                    ? "mx-auto flex h-11 w-11 items-center justify-center"
                                    : "mx-2 flex items-center gap-4 px-4 py-3",
                                isActive
                                    ? isCollapsed
                                        ? "bg-signal/10 text-signal shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25),0_0_18px_-6px_rgba(34,211,238,0.45)]"
                                        : "bg-signal/10 text-signal border border-signal/20"
                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            )}
                        >
                            {isActive && !isCollapsed && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-signal shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
                            )}
                            {isActive && isCollapsed && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-signal shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
                            )}

                            <span className={cn("relative z-10 transition-transform duration-300 shrink-0", isActive ? "scale-110" : "group-hover:scale-110")}>
                                {item.icon}
                            </span>

                            {!isCollapsed && (
                                <span className="font-mono text-sm tracking-wider whitespace-nowrap">
                                    {item.label}
                                </span>
                            )}
                            {item.external && !isCollapsed && (
                                <ExternalLink size={12} className="ml-auto text-ghost/40 shrink-0" />
                            )}
                        </Wrapper>
                    );
                })}
            </nav>

            {/* Mode Toggles */}
            <div className={cn(
                "border-t border-ghost/10 overflow-hidden shrink-0",
                isCollapsed
                    ? "flex flex-col items-center gap-1 py-3"
                    : "px-4 pb-2 pt-2 space-y-2"
            )}>
                {/* Recon Mode Toggle */}
                <button
                    onClick={toggleRecon}
                    className={cn(
                        "group relative overflow-hidden transition-colors duration-200",
                        isCollapsed
                            ? "h-11 w-11 flex items-center justify-center rounded-md"
                            : "w-full flex items-center justify-center gap-2 px-3 py-2 rounded border shadow-lg",
                        isRecon
                          ? isCollapsed
                              ? "bg-yellow-500/15 text-yellow-100 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.45),0_0_16px_-4px_rgba(250,204,21,0.5)]"
                              : "bg-yellow-500/20 border-yellow-400/60 text-yellow-100 hover:bg-yellow-500/30"
                          : isCollapsed
                              ? "text-gray-400 hover:bg-white/5 hover:text-yellow-300"
                              : "bg-black/40 border-gray-700/50 text-gray-400 hover:bg-white/5 hover:border-gray-500 hover:text-white"
                    )}
                    title={isRecon ? "Exit Recon Mode" : "Enter Recon Mode"}
                >
                    <Eye size={16} className={cn("transition-colors shrink-0", isRecon ? "text-yellow-400 animate-pulse" : "text-gray-500 group-hover:text-yellow-500")} />
                    {!isCollapsed && (
                        <span className="font-mono text-xs tracking-wider whitespace-nowrap">RECON</span>
                    )}
                </button>

                {/* Combat Mode Toggle */}
                <button
                    onClick={toggleCombat}
                    className={cn(
                        "group relative overflow-hidden transition-colors duration-200",
                        isCollapsed
                            ? "h-11 w-11 flex items-center justify-center rounded-md"
                            : "w-full flex items-center justify-center gap-2 px-3 py-2 rounded border shadow-lg",
                        isCombat
                          ? isCollapsed
                              ? "bg-red-500/15 text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.45),0_0_16px_-4px_rgba(248,113,113,0.5)]"
                              : "bg-red-500/20 border-red-400/60 text-red-100 hover:bg-red-500/30"
                          : isCollapsed
                              ? "text-gray-400 hover:bg-white/5 hover:text-red-300"
                              : "bg-black/40 border-gray-700/50 text-gray-400 hover:bg-white/5 hover:border-gray-500 hover:text-white"
                    )}
                    title={isCombat ? "Disengage Combat Protocol" : "Engage Combat Protocol"}
                >
                    <Flame size={16} className={cn("transition-colors shrink-0", isCombat ? "text-red-400 animate-pulse" : "text-gray-500 group-hover:text-red-500")} />
                    {!isCollapsed && (
                        <span className="font-mono text-xs tracking-wider whitespace-nowrap">COMBAT</span>
                    )}
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className={cn(
                        "group relative overflow-hidden transition-colors duration-200",
                        isCollapsed
                            ? "h-11 w-11 flex items-center justify-center rounded-md"
                            : "w-full flex items-center justify-center gap-2 px-3 py-2 rounded border shadow-lg",
                        theme === 'light'
                          ? isCollapsed
                              ? "bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.4),0_0_14px_-4px_rgba(251,191,36,0.45)]"
                              : "bg-amber-400/15 border-amber-300/50 text-amber-200 hover:bg-amber-400/25"
                          : isCollapsed
                              ? "text-gray-400 hover:bg-white/5 hover:text-blue-300"
                              : "bg-black/40 border-gray-700/50 text-gray-400 hover:bg-white/5 hover:border-gray-500 hover:text-white"
                    )}
                    title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
                >
                    {theme === 'light'
                        ? <Sun size={16} className="text-amber-400 shrink-0" />
                        : <Moon size={16} className="text-gray-500 group-hover:text-blue-400 transition-colors shrink-0" />
                    }
                    {!isCollapsed && (
                        <span className="font-mono text-xs tracking-wider whitespace-nowrap">
                            {theme === 'light' ? "LIGHT" : "DARK"}
                        </span>
                    )}
                </button>
            </div>

            {/* User / Footer */}
            <div className="p-4 border-t border-ghost/30 bg-black/20 overflow-hidden shrink-0">
                <div className={cn("flex items-center gap-3", isCollapsed ? "justify-center" : "")}>
                    <UserAvatar username={username} size={32} editable />
                    {!isCollapsed && (
                        <>
                            <div className="flex-1 overflow-hidden whitespace-nowrap">
                                <div className="text-xs font-mono text-gray-300 truncate">{username}</div>
                                <div className="text-[10px] text-green-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0"></span>
                                    ONLINE
                                </div>
                            </div>
                            <button
                                onClick={startLogout}
                                className="text-gray-500 hover:text-red-500 transition-colors shrink-0"
                            >
                                <LogOut size={18} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
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
