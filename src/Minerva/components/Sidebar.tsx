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
    CircleDot,
    Sun,
    Moon
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { cn } from '../lib/utils';
import { useOperationMode, type OperationMode } from '../context/BattleModeContext';
import { playEnter } from '../lib/soundEffects';
import { useTheme } from '../context/ThemeContext';
import { NotificationBell } from './EventNotifications';
import { useGetMythicSetting } from './MythicSavedUserSetting';
// Leaf module on purpose — importing this from '../pages/Settings' pulled the
// entire Settings page (framer-motion, DraggableList, @hello-pangea/dnd) into
// the eager entry bundle and defeated its lazyRetry split.
import { DEFAULT_SIDEBAR_SHORTCUTS } from '../pages/Settings/sidebarItems';
import { UserAvatar } from './UserAvatar';
import { LABEL, StatusWord } from './Instrument';
import { useReactiveVar, useApolloClient } from "@apollo/client/react";
import { meState } from '../lib/state';
import { performLogout } from '../lib/auth';
import { resetCredentialCache } from '../pages/Metasploit/msfrpc';

/**
 * The navigation rail — the console's left edge.
 *
 * Built as the vertical twin of the login screen's docked panel and the
 * dashboard's top rail: header strip / body / footer strips, one palette, and
 * state carried by a word or an inversion rather than by a glow. What it
 * deliberately drops from the old rail:
 *
 *  - `text-gray-400/500` labels. DESIGN_LANGUAGE §1's contrast rule is that
 *    every static text element is pure `text-signal` or a semantic colour;
 *    grey-on-black reads as disabled, and here it was applied to 25 of 27
 *    navigation targets — the whole rail read as switched off.
 *  - Hardcoded `rgba(34,211,238,…)` cyan glows. `signal` is a themed token
 *    (white in dark, near-black in light); a literal cyan shadow underneath it
 *    was a second, un-themed accent that the light theme could not follow.
 *  - `border-ghost/30` frames and `shadow-lg` stacks (§10 anti-patterns 10-11)
 *    for `border-signal/20`, the border every panel in the console already uses.
 *  - `scale-110` on hover (§8: hover changes the border and the surface, it
 *    does not move the target under the cursor).
 *
 * Accessibility, because a 64px rail is icon-only for 27 destinations: every
 * collapsed control carries an `aria-label`, the current route is marked with
 * `aria-current="page"` rather than by colour alone, and every control has a
 * 2px inset focus ring — a rail with `overflow-hidden` clips an outset one.
 */

const NAV_ICON = 18;

interface NavItem {
    icon: React.ReactNode;
    label: string;
    path: string;
    key?: string;
    external?: boolean;
}

// Module scope: 27 element descriptors that never change. Rebuilding them on
// every route change also rebuilt the `orderedItems` memo's input identity,
// which is why that memo needed an eslint-disable to stay honest.
const MENU_ITEMS: NavItem[] = [
    { icon: <LayoutDashboard size={NAV_ICON} strokeWidth={2} />, label: "DASHBOARD", path: "/dashboard" },
    { icon: <NotificationBell size={NAV_ICON} />, label: "EVENTS", path: "/events" },
    { icon: <ActivityIcon />, label: "CALLBACKS", path: "/callbacks" },
    { icon: <Terminal size={NAV_ICON} strokeWidth={2} />, label: "CONSOLE", path: "/console" },
    { icon: <ListTodo size={NAV_ICON} strokeWidth={2} />, label: "TASKS", path: "/task" },
    { icon: <Box size={NAV_ICON} strokeWidth={2} />, label: "PAYLOADS", path: "/payloads" },
    { icon: <Key size={NAV_ICON} strokeWidth={2} />, label: "CREDENTIALS", path: "/credentials" },
    { icon: <Folder size={NAV_ICON} strokeWidth={2} />, label: "FILES", path: "/files" },
    { icon: <Network size={NAV_ICON} strokeWidth={2} />, label: "C2 PROFILES", path: "/c2-profiles" },
    { icon: <Waypoints size={NAV_ICON} strokeWidth={2} />, label: "TUNNELS", path: "/tunnels" },
    { icon: <Zap size={NAV_ICON} strokeWidth={2} />, label: "QUICKHACK", path: "/quickhacks" },
    { icon: <Users size={NAV_ICON} strokeWidth={2} />, label: "USERS", path: "/users" },
    { icon: <Search size={NAV_ICON} strokeWidth={2} />, label: "SEARCH", path: "/search" },
    { icon: <Globe size={NAV_ICON} strokeWidth={2} />, label: "3D TOPOLOGY", path: "/topology" },
    { icon: <Server size={NAV_ICON} strokeWidth={2} />, label: "METASPLOIT", path: "/metasploit" },
    { icon: <Settings size={NAV_ICON} strokeWidth={2} />, label: "SETTINGS", path: "/settings" },
    { icon: <Shield size={NAV_ICON} strokeWidth={2} />, label: "OPSEC", path: "/opsec" },
    { icon: <Layers size={NAV_ICON} strokeWidth={2} />, label: "OPERATIONS", path: "/operations" },
    { icon: <Database size={NAV_ICON} strokeWidth={2} />, label: "ARTIFACTS", path: "/artifacts" },
    { icon: <Target size={NAV_ICON} strokeWidth={2} />, label: "MITRE", path: "/mitre" },
    { icon: <FileText size={NAV_ICON} strokeWidth={2} />, label: "REPORTING", path: "/reporting" },
    { icon: <Tag size={NAV_ICON} strokeWidth={2} />, label: "TAGS", path: "/tags" },
    { icon: <Code size={NAV_ICON} strokeWidth={2} />, label: "SCRIPTS", path: "/browser-scripts" },
    { icon: <Zap size={NAV_ICON} strokeWidth={2} />, label: "EVENTING", path: "/eventing" },
    { icon: <Package size={NAV_ICON} strokeWidth={2} />, label: "PKG TYPES", path: "/payload-types" },
    { icon: <BookOpen size={NAV_ICON} strokeWidth={2} />, label: "JUPYTER", path: "/jupyter", key: "jupyter", external: true },
    { icon: <Braces size={NAV_ICON} strokeWidth={2} />, label: "GRAPHQL", path: "/console", key: "graphql", external: true },
];

const itemKey = (m: NavItem) => m.key ?? m.path.replace(/^\//, '');

/**
 * Operation mode is one exclusive value, so it is one segmented control, the
 * same shape the dashboard uses for its perspective switch — not three
 * independent-looking toggles that happen to cancel each other.
 *
 * NORMAL is the state the rail sits in all day, so it gets the quiet active
 * treatment; RECON and COMBAT invert into their own colour because engaging
 * them is exactly the fact the operator must not be able to miss. Inversions
 * use `text-black`, not `text-void` — `void` is near-white in the light theme
 * and would put white text on amber.
 */
const MODES: { key: OperationMode; label: string; icon: typeof Eye; on: string; tint: string; title: string }[] = [
    { key: 'normal', label: 'NORMAL', icon: CircleDot, on: 'bg-signal/10 font-bold text-signal', tint: 'text-signal', title: 'Standard operation' },
    { key: 'recon', label: 'RECON', icon: Eye, on: 'bg-amber-400 text-black', tint: 'text-amber-400', title: 'Recon mode — passive collection posture' },
    { key: 'combat', label: 'COMBAT', icon: Flame, on: 'bg-red-400 text-black', tint: 'text-red-400', title: 'Combat mode — active engagement posture' },
];

/** Focus ring: inset, because the rail clips anything drawn outside a row. */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal';

/** Secondary square control, matching the dashboard rail's icon buttons. */
const ICON_BTN = cn(
    'flex shrink-0 items-center justify-center rounded-sm border border-signal/20 text-signal',
    'transition-colors duration-200 hover:border-signal/45 hover:bg-signal/10',
    FOCUS,
);

/** Browser reachability. The old rail printed a hardcoded ONLINE, which is the
 *  one thing a status light must never do. */
function useBrowserOnline() {
    const [online, setOnline] = React.useState(() => navigator.onLine);
    React.useEffect(() => {
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, []);
    return online;
}

export function Sidebar() {
    const location = useLocation();
    const { startLogout, isSidebarCollapsed, setSidebarCollapsed } = useAppStore(useShallow(s => ({ startLogout: s.startLogout, isSidebarCollapsed: s.isSidebarCollapsed, setSidebarCollapsed: s.setSidebarCollapsed })));
    // Sign out used to be `startLogout()` alone — a zustand flag and a route
    // change. Tokens, the Apollo cache and the MSF KV singletons all survived
    // into the next operator's session on the same browser. performLogout does
    // the actual teardown; startLogout still drives the exit animation.
    const apolloClient = useApolloClient();
    const handleLogout = React.useCallback(() => {
        void performLogout(apolloClient).finally(() => {
            resetCredentialCache();
            startLogout();
        });
    }, [apolloClient, startLogout]);
    const { mode, setMode } = useOperationMode();
    const { theme, toggleTheme } = useTheme();
    const me = useReactiveVar(meState);
    const username = me?.user?.username || 'OPERATOR';
    // navigator.onLine only reports whether the OS has an interface up — it
    // reads ONLINE while the GraphQL websocket is dead, which for a C2 console
    // is the misleading direction. Combine it with the link state the websocket
    // now actually reports.
    const browserOnline = useBrowserOnline();
    const badConnection = useReactiveVar(meState).badConnection;
    const online = browserOnline && !badConnection;

    // Apply sideShortcuts setting — filter & reorder
    const sideShortcuts = useGetMythicSetting({ setting_name: 'sideShortcuts', default_value: DEFAULT_SIDEBAR_SHORTCUTS });
    const orderedItems = React.useMemo(() => {
        if (!Array.isArray(sideShortcuts) || sideShortcuts.length === 0) return MENU_ITEMS;
        const shortcutSet = new Set(sideShortcuts as string[]);
        const byKey = new Map(MENU_ITEMS.map(m => [itemKey(m), m]));
        const ordered: NavItem[] = [];
        for (const key of sideShortcuts as string[]) {
            const item = byKey.get(key);
            if (item) ordered.push(item);
        }
        // add any remaining items not in the setting (new items added after setting was saved)
        for (const item of MENU_ITEMS) {
            if (!shortcutSet.has(itemKey(item))) ordered.push(item);
        }
        return ordered;
    }, [sideShortcuts]);

    const isCollapsed = isSidebarCollapsed;
    const setIsCollapsed = setSidebarCollapsed;

    return (
        <div
            className={cn(
                "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-signal/20 bg-void",
                "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[width]",
                isCollapsed ? "w-16" : "w-64"
            )}
        >
            {/* ── Header strip ─────────────────────────────────────────────
                The login panel's `⊙ SECURE TERMINAL … SL-8 01` strip, turned
                vertical: mark and wordmark say what this is, the control on the
                right says how it is presented. h-16 matches the page headers
                the console already ships (Artifacts, MITRE, Reporting, Tags),
                so the rail's first rule lines up with the page's. */}
            <div className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-signal/20 px-3">
                {isCollapsed ? (
                    // At 64px there is room for one control, so the mark IS the
                    // control: it holds the identity at rest and states its
                    // action on hover, rather than spending a second row on a
                    // button or hanging one off the rail's edge.
                    <button
                        type="button"
                        onClick={() => setIsCollapsed(false)}
                        aria-label="Expand navigation rail"
                        aria-expanded={false}
                        title="EXPAND RAIL"
                        className={cn('group relative mx-auto flex h-11 w-11 items-center justify-center rounded-sm transition-colors duration-200 hover:bg-signal/10', FOCUS)}
                    >
                        <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-signal text-[15px] font-bold text-void transition-opacity duration-200 group-hover:opacity-0">
                            M
                        </span>
                        <ChevronRight
                            size={16}
                            strokeWidth={2}
                            aria-hidden="true"
                            className="absolute text-signal opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        />
                    </button>
                ) : (
                    <>
                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-signal text-[15px] font-bold text-void">
                            M
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[0.22em] text-signal">
                            MINERVA
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsCollapsed(true)}
                            aria-label="Collapse navigation rail"
                            aria-expanded={true}
                            title="COLLAPSE RAIL"
                            className={cn(ICON_BTN, 'h-8 w-8')}
                        >
                            <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                    </>
                )}
            </div>

            {/* ── Navigation ──────────────────────────────────────────────── */}
            <nav
                aria-label="Primary"
                className={cn("sidebar-nav flex-1 overflow-y-auto overflow-x-hidden py-3", isCollapsed ? "px-2.5" : "px-2")}
            >
                <ul className={cn(isCollapsed ? "space-y-1" : "space-y-0.5")}>
                    {orderedItems.map((item) => {
                        const isActive = !item.external && location.pathname.startsWith(item.path);

                        const Wrapper = item.external ? 'a' : Link;
                        const wrapperProps: any = item.external
                            ? { href: item.path, target: '_blank', rel: 'noopener noreferrer' }
                            : { to: item.path, onClick: () => { if (!isActive && item.path === '/callbacks') playEnter(); } };

                        return (
                            <li key={itemKey(item)}>
                                <Wrapper
                                    {...wrapperProps}
                                    // The collapsed rail is icon-only, so the
                                    // accessible name cannot come from the
                                    // (absent) label — and `title` alone is not
                                    // one. Named in both states: an external
                                    // link says so before it is followed.
                                    aria-label={
                                        item.external
                                            ? `${item.label} (opens in a new tab)`
                                            : isCollapsed ? item.label : undefined
                                    }
                                    aria-current={isActive ? 'page' : undefined}
                                    title={isCollapsed ? item.label : undefined}
                                    className={cn(
                                        "relative flex items-center rounded-sm transition-colors duration-200",
                                        FOCUS,
                                        isCollapsed
                                            ? "mx-auto h-11 w-11 justify-center"
                                            : "min-h-[44px] gap-3 px-3 py-2",
                                        // The dashboard's segmented control
                                        // inverts its active segment because
                                        // "which one am I on" has to be the
                                        // loudest fact on the surface. Same
                                        // question here, same answer — and it
                                        // survives greyscale and every form of
                                        // colour-vision deficiency, which a
                                        // tinted background does not.
                                        isActive
                                            ? "bg-signal text-void"
                                            : "text-signal hover:bg-signal/10"
                                    )}
                                >
                                    <span className="shrink-0">{item.icon}</span>

                                    {!isCollapsed && (
                                        <span className={cn(
                                            "min-w-0 flex-1 truncate text-[12px] tracking-[0.12em]",
                                            isActive ? "font-bold" : "font-medium",
                                        )}>
                                            {item.label}
                                        </span>
                                    )}
                                    {item.external && !isCollapsed && (
                                        <ExternalLink size={11} strokeWidth={2} aria-hidden="true" className="shrink-0 opacity-70" />
                                    )}
                                </Wrapper>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* ── Mode strip ───────────────────────────────────────────────
                One exclusive value, one control. */}
            <div className={cn("shrink-0 border-t border-signal/15", isCollapsed ? "px-2.5 py-3" : "px-3 py-3")}>
                {isCollapsed ? (
                    <div role="group" aria-label="Operation mode" className="flex flex-col items-center gap-1">
                        {MODES.map(m => {
                            const active = mode === m.key;
                            return (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => setMode(m.key)}
                                    aria-pressed={active}
                                    aria-label={`${m.label} mode`}
                                    title={m.title}
                                    className={cn(
                                        'flex h-11 w-11 items-center justify-center rounded-sm transition-colors duration-200',
                                        FOCUS,
                                        active ? m.on : 'hover:bg-signal/10',
                                    )}
                                >
                                    <m.icon size={16} strokeWidth={2} aria-hidden="true"
                                        className={cn('shrink-0', !active && m.tint)} />
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        <div className={cn(LABEL, "mb-2 text-signal")}>MODE</div>
                        <div role="group" aria-label="Operation mode" className="flex overflow-hidden rounded-sm border border-signal/20">
                            {MODES.map((m, i) => {
                                const active = mode === m.key;
                                return (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => setMode(m.key)}
                                        aria-pressed={active}
                                        title={m.title}
                                        className={cn(
                                            'flex min-h-[38px] flex-1 items-center justify-center gap-1.5',
                                            'text-[10px] font-bold uppercase tracking-[0.08em] transition-colors duration-200',
                                            FOCUS,
                                            i > 0 && 'border-l border-signal/15',
                                            active ? m.on : 'text-signal hover:bg-signal/10',
                                        )}
                                    >
                                        <m.icon size={11} strokeWidth={2} aria-hidden="true"
                                            className={cn('shrink-0', !active && m.tint)} />
                                        {m.label}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ── Operator strip ──────────────────────────────────────────
                The login panel's footer strip: who is at the console, and
                whether the console can still reach anything. The username
                keeps its real casing — it is a value, not furniture. */}
            <div className={cn("shrink-0 border-t border-signal/20 bg-signal/[0.03]", isCollapsed ? "px-2.5 py-3" : "px-3 py-3")}>
                {isCollapsed ? (
                    <div className="flex flex-col items-center gap-1">
                        <UserAvatar username={username} size={32} editable />
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                            className={cn(ICON_BTN, 'h-11 w-11 border-transparent hover:border-signal/45')}
                        >
                            {theme === 'light'
                                ? <Sun size={16} strokeWidth={2} aria-hidden="true" />
                                : <Moon size={16} strokeWidth={2} aria-hidden="true" />}
                        </button>
                        <button
                            type="button"
                            onClick={handleLogout}
                            aria-label="Sign out"
                            title="Sign out"
                            className={cn(ICON_BTN, 'h-11 w-11 border-transparent hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-400')}
                        >
                            <LogOut size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5">
                        <UserAvatar username={username} size={32} editable />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] text-signal" title={username}>{username}</div>
                            <StatusWord tone={online ? 'live' : 'fail'} dot className="mt-1">
                                <span role="status" aria-atomic="true">{online ? 'ONLINE' : 'OFFLINE'}</span>
                            </StatusWord>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                            className={cn(ICON_BTN, 'h-8 w-8')}
                        >
                            {theme === 'light'
                                ? <Sun size={14} strokeWidth={2} aria-hidden="true" />
                                : <Moon size={14} strokeWidth={2} aria-hidden="true" />}
                        </button>
                        <button
                            type="button"
                            onClick={startLogout}
                            aria-label="Sign out"
                            title="Sign out"
                            className={cn(ICON_BTN, 'h-8 w-8 hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-400')}
                        >
                            <LogOut size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Custom Icons
function ActivityIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={NAV_ICON} height={NAV_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
    )
}
