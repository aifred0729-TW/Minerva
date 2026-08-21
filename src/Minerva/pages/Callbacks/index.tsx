import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Callback, CallbackGraphEdge, CallbackC2Profile, CallbackTag } from '../../types';
import { useQuery, useSubscription, useMutation, useLazyQuery, useApolloClient, useReactiveVar } from "@apollo/client/react";
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import {
    Terminal,
    Shield,
    Activity,
    User,
    MoreVertical,
    Lock,
    Unlock,
    EyeOff,
    Eye,
    Edit,
    Network,
    List,
    Skull,
    Columns,
    Square,
    CheckSquare,
    Folder,
    FolderSearch,
    Download,
    Globe,
    Wifi,
    X,
    Filter,
    ChevronDown,
    Tag,
    Zap,
    Copy,
    FileText,
    ExternalLink,
    Info,
    Layers,
    XCircle,
    Clock,
    Bell,
    BellOff,
    Palette,
    Upload,
    ChevronRight,
    GitBranch,
    Monitor,
    Settings,
    SplitSquareHorizontal,
    LayoutGrid,
}from 'lucide-react';
import { useAppStore } from '../../store';
import { meState } from '../../lib/state';
import { isCallbackAlive, isOrphanedTcpP2P, cn, getErrorMessage, parseIPString, parseFirstIP, downloadBlob } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { CyberTable } from '../../components/CyberTable';
import { InstrumentPanel, StatusWord, ToolChip, toneText, TOOL_BTN, TOOL_IDLE, TOOL_ON, type Tone } from '../../components/Instrument';
import { CyberModal } from '../../components/CyberModal';
import { MythicDialog } from '../../components/MythicDialog';
import { ViewEditTagsDialog } from '../../components/MythicTag';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { CallbackGraph } from '../../components/CallbackGraph';
import {
    GET_CALLBACKS,
    SUBSCRIPTION_CALLBACKS,
    GET_CALLBACK_GRAPH_EDGES,
    HIDE_CALLBACK_MUTATION,
    LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION,
    UPDATE_DESCRIPTION_AND_COLOR_MUTATION,
    EXPORT_CALLBACK_CONFIG,
    HIDE_CALLBACKS_BULK,
    GET_EXIT_CALLBACK_COMMAND,
    CREATE_TASK_MUTATION,
    UPDATE_SLEEP_INFO_MUTATION,
    UPDATE_CALLBACK_TRIGGER_MUTATION,
    UPDATE_CALLBACK_COLOR_MUTATION,
    UPDATE_IPS_MUTATION,
    UPDATE_CALLBACK_GROUPS_MUTATION,
    GET_CUSTOM_BROWSERS,
}from '../../lib/api';
import { killSession as killMsfSession } from '../Metasploit/msfrpc';
import { useMsfSyntheticCallbacks, removeMsfSessionFromLedger, clearDeadMsfSessions, msfSessionIdOf, setMsfSessionHidden } from './msfSyntheticCallbacks';
import { MsfSocksDialog } from './MsfSocksDialog';
import { useAllMsfTunnels } from '../Metasploit/msfTunnelStore';
import { loadingSound, LastCheckinCell, getPlatformIcon, JsonHighlight } from './utils';
import { DetailedCallbackModal } from './DetailedCallbackModal';
import { C2PathDialog } from './C2PathDialog';
import {
    COLOR_PRESETS, CallbackColorPickerModal, IPSelectorModal,
    ModifyGroupsModal, OpenMultipleDialog, TaskMultipleDialog,
    ImportConfigModal, AlertTriggerModal, ColumnFilterInput,
} from './dialogs';

const CONTEXT_MENU_MAX_HEIGHT = 600;
const MENU_MIN_SPACE_BELOW = 260;

// ── Row action menu kit ─────────────────────────────────────────────────────
//
// The two menus below (Mythic rows and MSF rows) are deliberately identical in
// look, so a meterpreter session reads as just another agent rather than as a
// second-class row with its own furniture. Sharing the class strings is what
// keeps them that way as either list grows.
//
// Item colour is reserved for consequence, not for category: a neutral action
// is plain signal, and only destroy/hide/exit take a tone. Twenty menu entries
// in six different hues is a legend the operator has to learn before they can
// use the menu at all.

const MENU_SURFACE = 'fixed z-50 w-64 overflow-y-auto cyber-scrollbar rounded-md border border-signal/25 bg-void/95 shadow-lg shadow-black/50 backdrop-blur-md';
const MENU_HEAD = 'border-b border-signal/15 px-3 py-2';
const MENU_SECTION = 'px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-signal opacity-70';
const MENU_ITEM = 'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-[12px] text-signal transition-colors hover:bg-signal/10';
const MENU_ITEM_WARN = 'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-[12px] text-amber-400 transition-colors hover:bg-amber-400/10';
const MENU_ITEM_FAIL = 'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-[12px] text-red-400 transition-colors hover:bg-red-400/10';
const MENU_ITEM_LIVE = 'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-[12px] text-accent transition-colors hover:bg-accent/10';
const MENU_RULE = 'my-1 h-px bg-signal/15';

// ── Form kit ────────────────────────────────────────────────────────────────
//
// The dialogs on this page are the login screen's field treatment at console
// density: a spaced uppercase label above, a bordered field that brightens on
// hover and takes a visible ring on focus. Focus rings are load-bearing here —
// several of these dialogs are reached from a context menu with the keyboard.

const FIELD_LABEL = 'block text-[10px] font-bold uppercase tracking-[0.18em] text-signal';
const FIELD_HINT = 'text-[11px] text-signal opacity-70';
const FIELD_INPUT = 'w-full rounded-md border border-signal/20 bg-black/40 px-3 py-2 font-mono text-[13px] text-signal transition-colors placeholder:text-signal/40 hover:border-signal/40 focus:border-signal/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-signal';
const BTN_GHOST = 'inline-flex h-9 items-center gap-1.5 rounded-sm border border-signal/20 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-signal transition-colors hover:border-signal/45 hover:bg-signal/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal';
const BTN_PRIMARY = 'inline-flex h-9 items-center gap-1.5 rounded-sm border border-signal bg-signal px-5 text-[11px] font-bold uppercase tracking-[0.14em] text-void transition-colors hover:bg-signal/85 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal';

/**
 * One readout in the rail's instrument cluster.
 *
 * Label above, count below, zero-padded and tabular so the cluster does not
 * reflow every time a callback checks in — a number that jiggles in the corner
 * of the eye reads as an alarm.
 */
function RailStat({ label, value, tone = 'signal', title }: {
    label: string;
    value: number;
    tone?: Tone;
    title?: string;
}) {
    return (
        <div title={title}
            className="flex min-w-[76px] flex-col justify-center gap-0.5 border-r border-signal/15 px-3 py-1 last:border-r-0">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">{label}</span>
            <span className={cn('text-[15px] font-bold leading-none tabular-nums', toneText(tone))}>
                {value.toString().padStart(2, '0')}
            </span>
        </div>
    );
}

export default function Callbacks() {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    React.useEffect(() => {
        const audio = new Audio(loadingSound);
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }, []);
    // Fallback path only (the subscription below is preferred), but it still
    // must not inherit the document's 50-row default — otherwise a subscription
    // failure degrades to a silently truncated table.
    const { data: queryData, loading, refetch } = useQuery<any>(GET_CALLBACKS, { variables: { limit: 5000 }, fetchPolicy: 'network-only' });
    const { data: subData } = useSubscription<any>(SUBSCRIPTION_CALLBACKS, {
        onError: (err) => { console.error('[SUBSCRIPTION_CALLBACKS] subscription error:', err); },
    });
    const data = useMemo(() => subData ? { callback: subData.callback } : queryData, [subData, queryData]);
    // No pollInterval. `CallbackGraph` is mounted unconditionally on this page
    // (the topology panel above the agent list) and polls this exact document —
    // no variables, same cache entry — every 10s. Two pollers meant two full
    // unbounded `callbackgraphedge` fetches every 10s, each one carrying the
    // nested source AND destination callback row for all 244 edges. This hook
    // is a watchQuery over the same normalised fields, so it still sees every
    // refresh the graph's poller writes; it just no longer fetches its own.
    const { data: edgesData } = useQuery<any>(GET_CALLBACK_GRAPH_EDGES);
    const { data: customBrowsersData } = useQuery<any>(GET_CUSTOM_BROWSERS);
    // Stable reference so an absent result doesn't hand the column defs a fresh
    // [] each render (which would ripple into the un-memoized column closures).
    const customBrowsers = useMemo(() => customBrowsersData?.custombrowser || [], [customBrowsersData]);

    // ── MSF session injection ─────────────────────────────────────────────
    // MSF sessions are surfaced through a shared hook so the 2D CallbackGraph
    // and the 3D Topology view see the same set of synthetic nodes.
    const msfCallbacks = useMsfSyntheticCallbacks();
    const me = useReactiveVar(meState);
    const navigate = useNavigate();
    const [hideCallback] = useMutation<any>(HIDE_CALLBACK_MUTATION);
    const [lockCallback] = useMutation<any>(LOCK_CALLBACK_MUTATION);
    const [updateDescription] = useMutation<any>(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [exportConfig] = useLazyQuery<any>(EXPORT_CALLBACK_CONFIG, { fetchPolicy: 'no-cache' });
    const [createTask] = useMutation<any>(CREATE_TASK_MUTATION);
    const [updateSleepInfo] = useMutation<any>(UPDATE_SLEEP_INFO_MUTATION);
    const [updateTrigger] = useMutation<any>(UPDATE_CALLBACK_TRIGGER_MUTATION);
    const [updateCallbackColor] = useMutation<any>(UPDATE_CALLBACK_COLOR_MUTATION);
    const [updateDescriptionAndColor] = useMutation<any>(UPDATE_DESCRIPTION_AND_COLOR_MUTATION);
    const [updateCallbackIPs] = useMutation<any>(UPDATE_IPS_MUTATION);
    const [updateCallbackGroups] = useMutation<any>(UPDATE_CALLBACK_GROUPS_MUTATION);
    const [bulkHideCallbacks] = useMutation<any>(HIDE_CALLBACKS_BULK);
    const client = useApolloClient();
    const [actionsMenuOpenId, setActionsMenuOpenId] = useState<number | null>(null);
    const [socksDialogFor, setSocksDialogFor] = useState<Callback | null>(null);
    const msfTunnels = useAllMsfTunnels();
    const [showEventingDialog, setShowEventingDialog] = useState<Callback | null>(null);
    const [sleepEditCallback, setSleepEditCallback] = useState<Callback | null>(null);
    const [sleepEditValue, setSleepEditValue] = useState('');
    const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number; maxH: number }>({ top: 0, left: 0, maxH: CONTEXT_MENU_MAX_HEIGHT });
    const [editDescriptionCallback, setEditDescriptionCallback] = useState<Callback | null>(null);
    const [newDescription, setNewDescription] = useState("");
    const [newColor, setNewColor] = useState('');
    const [showHiddenCallbacks, setShowHiddenCallbacks] = useState(false);
    const [hideDead, setHideDead] = useState(false);
    const [groupByHost, setGroupByHost] = useState(true);
    const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
    const [detailCallbackId, setDetailCallbackId] = useState<number | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>(() => {
        try { const s = localStorage.getItem('minerva_cb_col_filters'); return s ? JSON.parse(s) : {}; } catch { return {}; }
    });
    const setColFilter = (col: string, val: string) => setColumnFilters(p => ({ ...p, [col]: val }));
    // How many columns are actually narrowing the list. Counted once here
    // rather than re-scanning the filter map in four places in the JSX, and it
    // is what the toolbar chip and the panel footer both report — a filter the
    // operator cannot see is a row count they cannot trust.
    const activeFilterCount = useMemo(
        () => Object.values(columnFilters).filter(v => v.trim()).length,
        [columnFilters],
    );
    useEffect(() => { localStorage.setItem('minerva_cb_col_filters', JSON.stringify(columnFilters)); }, [columnFilters]);

    // ── Operator display settings (persisted) ──
    const [operatorSettings, setOperatorSettings] = useState<{
        interactType: 'console' | 'new_window' | 'console_tab';
        hideOperatorNames: boolean;
        fontSize: number;
        taskingContextFields: string[];
    }>(() => {
        try {
            const s = localStorage.getItem('minerva_op_settings');
            const parsed = s ? JSON.parse(s) : {};
            return {
                interactType: parsed.interactType ?? 'console',
                hideOperatorNames: parsed.hideOperatorNames ?? false,
                fontSize: parsed.fontSize ?? 12,
                taskingContextFields: parsed.taskingContextFields ?? [],
            };
        } catch {
            return { interactType: 'console', hideOperatorNames: false, fontSize: 12, taskingContextFields: [] };
        }
    });
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    useEffect(() => { localStorage.setItem('minerva_op_settings', JSON.stringify(operatorSettings)); }, [operatorSettings]);

    // ── NEW: Feature state vars ──
    const [colorEditCallback, setColorEditCallback] = useState<Callback | null>(null);
    const [ipSelectCallback, setIpSelectCallback] = useState<Callback | null>(null);
    const [modifyGroupsCallback, setModifyGroupsCallback] = useState<Callback | null>(null);
    const [showImportConfig, setShowImportConfig] = useState(false);
    const [showTaskMultiple, setShowTaskMultiple] = useState(false);
    const [showOpenMultiple, setShowOpenMultiple] = useState(false);
    const [c2PathCallback, setC2PathCallback] = useState<Callback | null>(null);
    const [alertTriggerCallback, setAlertTriggerCallback] = useState<Callback | null>(null);
    const [tagEditCallbackId, setTagEditCallbackId] = useState<number | null>(null);
    const [showBulkEventingDialog, setShowBulkEventingDialog] = useState(false);
    const [osPopupText, setOsPopupText] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
    const [splitCallbackRow, setSplitCallbackRow] = useState<Callback | null>(null);
    const [splitSecondId, setSplitSecondId] = useState<number | null>(null);
    // ── Selected row highlight ──
    const [selectedCallbackId, setSelectedCallbackId] = useState<number | null>(null);
    const highlightAppliedRef = React.useRef(false);
    const { displayId: urlDisplayId } = useParams<{ displayId?: string }>();

    // Auto-highlight + scroll when navigating via /callbacks/:displayId deep-link
    useEffect(() => {
        if (!urlDisplayId || highlightAppliedRef.current) return;
        const targetDisplayId = parseInt(urlDisplayId, 10);
        const cb = (data?.callback || []).find((c: Callback) => c.display_id === targetDisplayId);
        if (cb) {
            setSelectedCallbackId(cb.id);
            highlightAppliedRef.current = true;
        }
    }, [data, urlDisplayId]);
    const handleSort = (key: string) => {
        if (sortKey === key) {
            if (sortDir === 'ASC') setSortDir('DESC');
            else { setSortKey(null); setSortDir('ASC'); } // third state: no sort
        } else { setSortKey(key); setSortDir('ASC'); }
    };

    // ── Column visibility ──
    const TOGGLEABLE_COLS = ['USER', 'HOST', 'IP', 'EXTERNAL IP', 'OS', 'PID', 'LAST CHECKIN', 'DESCRIPTION', 'AGENT', 'DOMAIN', 'ARCHITECTURE', 'GROUPS', 'SLEEP', 'C2', 'PROCESS NAME', 'TAGS'] as const;
    type ColKey = typeof TOGGLEABLE_COLS[number];
    const DEFAULT_VISIBLE: ColKey[] = ['USER', 'HOST', 'IP', 'PID', 'LAST CHECKIN', 'DESCRIPTION', 'AGENT', 'DOMAIN', 'TAGS'];
    const [columnOrder, setColumnOrder] = useState<ColKey[]>(() => {
        try { const s = localStorage.getItem('minerva_cb_col_order'); return s ? JSON.parse(s) : [...TOGGLEABLE_COLS]; } catch { return [...TOGGLEABLE_COLS]; }
    });
    const [dragCol, setDragCol] = useState<ColKey | null>(null);
    const [dropCol, setDropCol] = useState<ColKey | null>(null);
    // Persist column order
    useEffect(() => { localStorage.setItem('minerva_cb_col_order', JSON.stringify(columnOrder)); }, [columnOrder]);

    const handleExitCallback = async (cb: Callback) => {
        setActionsMenuOpenId(null);
        try {
            const { data: exitData } = await client.query({
                query: GET_EXIT_CALLBACK_COMMAND,
                variables: { callback_id: cb.id },
                fetchPolicy: 'network-only',
            });
            const exitCmds = (exitData as any)?.callback_by_pk?.loadedcommands || [];
            if (exitCmds.length === 0) { snackActions.warning('No exit command loaded for this callback'); return; }
            if (!window.confirm(`Task ${exitCmds[0].command.cmd} on Callback ${cb.display_id}?`)) return;
            await createTask({ variables: { callback_id: cb.id, command: exitCmds[0].command.cmd, params: '', tasking_location: 'command_line' } });
            snackActions.success(`Tasked ${exitCmds[0].command.cmd}`);
        } catch (e: unknown) { snackActions.error('Failed to exit callback: ' + getErrorMessage(e)); }
    };

    const handleSaveSleep = async () => {
        if (!sleepEditCallback) return;
        try {
            await updateSleepInfo({ variables: { callback_display_id: sleepEditCallback.display_id, sleep_info: sleepEditValue } });
            snackActions.success('Sleep info updated');
            refetch();
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setSleepEditCallback(null);
    };

    const handleSaveAlertTrigger = async (minutes: number | null) => {
        if (!alertTriggerCallback) return;
        try {
            if (minutes === null) {
                await updateTrigger({ variables: { callback_display_id: alertTriggerCallback.display_id, trigger_on_checkin_after_time: null } });
                snackActions.success('Alert trigger removed');
            } else {
                const dt = new Date(Date.now() + minutes * 60000).toISOString();
                await updateTrigger({ variables: { callback_display_id: alertTriggerCallback.display_id, trigger_on_checkin_after_time: dt } });
                snackActions.success(`Alert trigger set for ${minutes} min`);
            }
            refetch();
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setAlertTriggerCallback(null);
    };
    const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
        try { const s = localStorage.getItem('minerva_cb_visible_cols'); return s ? new Set(JSON.parse(s) as ColKey[]) : new Set(DEFAULT_VISIBLE); } catch { return new Set(DEFAULT_VISIBLE); }
    });
    // Persist visible column settings
    useEffect(() => { localStorage.setItem('minerva_cb_visible_cols', JSON.stringify([...visibleCols])); }, [visibleCols]);
    const [panelTab, setPanelTab] = useState<'BULK' | 'COLS'>('COLS');
    const [showPanel, setShowPanel] = useState(false);
    const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
    const toggleBulkSelect = (displayId: number) =>
        setBulkSelected(prev => { const n = new Set(prev); n.has(displayId) ? n.delete(displayId) : n.add(displayId); return n; });
    const toggleCol = (key: ColKey) =>
        setVisibleCols(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

    // ── Column header right-click context menu ──
    const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; col: any } | null>(null);
    const [headerFilterInput, setHeaderFilterInput] = useState('');
    const handleHeaderRightClick = useCallback((col: any, e: React.MouseEvent) => {
        e.preventDefault();
        if (!col.filterKey) return;
        setHeaderFilterInput(columnFilters[col.filterKey] || '');
        setHeaderMenu({ x: e.clientX, y: e.clientY, col });
    }, [columnFilters]);
    useEffect(() => {
        if (!headerMenu) return;
        const close = () => setHeaderMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [headerMenu]);

    const handleInteract = useCallback((row: Callback, newWindow = false) => {
        // Both Mythic and MSF callbacks share `/console/<displayId>` — the
        // Console page picks MSF mode when display_id >= MSF_DISPLAY_ID_OFFSET.
        if (newWindow || operatorSettings.interactType === 'new_window') {
            window.open(`/new/callbacks/${row.display_id}`, '_blank');
        } else if (operatorSettings.interactType === 'console_tab') {
            window.open(`/console/${row.display_id}`, '_blank');
        } else {
            navigate(`/console/${row.display_id}`);
        }
    }, [operatorSettings.interactType, navigate]);

    // Single-click: select row only; Double-click: interact (navigate)
    const handleRowClick = (callback: Callback) => {
        setSelectedCallbackId(prev => prev === callback.id ? null : callback.id);
    };
    const handleRowDoubleClick = useCallback((callback: Callback) => {
        handleInteract(callback);
    }, [handleInteract]);

    // Auto-scroll to selected row whenever it changes
    useEffect(() => {
        if (selectedCallbackId === null) return;
        const el = document.querySelector(`[data-cb-id="${selectedCallbackId}"]`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [selectedCallbackId]);

    const handleActionsClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 5;
        const spaceAbove = rect.top - 5;
        const menuW = 256; // w-64
        const left = Math.max(4, Math.min(rect.right - menuW, window.innerWidth - menuW - 4));
        if (spaceBelow >= MENU_MIN_SPACE_BELOW || spaceBelow >= spaceAbove) {
            // Open downward
            setMenuPosition({ top: rect.bottom + 5, left, maxH: Math.max(180, spaceBelow - 4) });
        } else {
            // Open upward — not enough space below
            setMenuPosition({ bottom: window.innerHeight - rect.top + 5, left, maxH: Math.max(180, spaceAbove - 4) });
        }
        setActionsMenuOpenId(actionsMenuOpenId === id ? null : id);
    };
    React.useEffect(() => {
        const handleClickOutside = () => setActionsMenuOpenId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleHide = async (cb: Callback) => {
        // MSF synthetic callbacks aren't in Mythic's DB — flipping the
        // `active` column via HIDE_CALLBACK_MUTATION would 404. Honour
        // the same UX by toggling the operator-side `hidden` flag in
        // the local ledger; the synthetic factory maps that to
        // `active: false` so the standard "Hide Hidden" filter does
        // the right thing without a server round trip.
        if (cb._isMsfSession) {
            const sid = cb._msfSessionId as string | undefined;
            if (sid) { setMsfSessionHidden(sid, true); snackActions.success(`Callback ${cb.display_id} hidden`); }
            setActionsMenuOpenId(null);
            return;
        }
        try { await hideCallback({ variables: { callback_display_id: cb.display_id, active: false } }); snackActions.success(`Callback ${cb.display_id} hidden`); refetch(); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setActionsMenuOpenId(null);
    };
    const handleShow = async (cb: Callback) => {
        if (cb._isMsfSession) {
            const sid = cb._msfSessionId as string | undefined;
            if (sid) { setMsfSessionHidden(sid, false); snackActions.success(`Callback ${cb.display_id} restored`); }
            setActionsMenuOpenId(null);
            return;
        }
        try { await hideCallback({ variables: { callback_display_id: cb.display_id, active: true } }); snackActions.success(`Callback ${cb.display_id} restored`); refetch(); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setActionsMenuOpenId(null);
    };
    const handleLockToggle = async (cb: Callback) => {
        try { await lockCallback({ variables: { callback_display_id: cb.display_id, locked: !cb.locked } }); snackActions.success(`Callback ${cb.display_id} ${cb.locked ? "unlocked" : "locked"}`); refetch(); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setActionsMenuOpenId(null);
    };
    const openEditDescription = (cb: Callback) => { setEditDescriptionCallback(cb); setNewDescription(cb.description || ""); setNewColor(cb.color || ''); setActionsMenuOpenId(null); };
    const handleExportConfig = async (cb: Callback) => {
        setActionsMenuOpenId(null);
        if (!cb.agent_callback_id) { snackActions.error('No agent_callback_id'); return; }
        try {
            const { data: ed } = await exportConfig({ variables: { agent_callback_id: cb.agent_callback_id } });
            if (ed?.exportCallbackConfig?.status === 'success') {
                const blob = new Blob([JSON.stringify(ed.exportCallbackConfig.config, null, 2)], { type: 'application/json' });
                downloadBlob(blob, `${cb.agent_callback_id}.json`);
                snackActions.success('Config exported');
            } else { snackActions.error(ed?.exportCallbackConfig?.error || 'Export failed'); }
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
    };

    const handleSaveColor = async (color: string) => {
        if (!colorEditCallback) return;
        const normalized = ['#ffffff', '#000000', '#FFFFFF', '#000000'].includes(color) ? '' : color;
        try {
            await updateCallbackColor({ variables: { callback_display_id: colorEditCallback.display_id, color: normalized } });
            snackActions.success(normalized ? `Color set to ${normalized}` : 'Color cleared');
            refetch();
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setColorEditCallback(null);
    };

    const handleSaveDescriptionAndColor = async (desc: string, color: string) => {
        if (!editDescriptionCallback) return;
        const normalized = ['#ffffff', '#000000', '#FFFFFF', '#000000'].includes(color) ? '' : color;
        try {
            await updateDescriptionAndColor({ variables: {
                callback_display_id: editDescriptionCallback.display_id,
                description: desc || '',
                color: normalized,
            }});
            snackActions.success('Description and color updated');
            refetch();
            setEditDescriptionCallback(null);
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
    };

    const handleSaveIPs = async (ips: string[]) => {
        if (!ipSelectCallback) return;
        try {
            await updateCallbackIPs({ variables: { callback_display_id: ipSelectCallback.display_id, ip: ips } });
            snackActions.success('Primary IP updated');
            refetch();
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setIpSelectCallback(null);
    };

    const handleSaveGroups = async (groups: string[]) => {
        if (!modifyGroupsCallback) return;
        try {
            await updateCallbackGroups({ variables: { callback_display_id: modifyGroupsCallback.display_id, mythictree_groups: groups } });
            snackActions.success('Groups updated');
            refetch();
        } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setModifyGroupsCallback(null);
    };

    const handleBulkHide = async () => {
        const ids = [...bulkSelected];
        try {
            await bulkHideCallbacks({ variables: { callback_display_ids: ids } });
            snackActions.success(`${ids.length} callbacks hidden`);
            setBulkSelected(new Set());
            refetch();
        } catch (e: unknown) { snackActions.error('Bulk hide failed: ' + getErrorMessage(e)); }
    };

    // ── C2 egress status map ──
    const callbackEgressStatus = useMemo(() => {
        const map = new Map<number, { hasActiveEgress: boolean; isP2POnly: boolean; hasActiveP2PPeer: boolean }>();
        const edges = edgesData?.callbackgraphedge || [];
        edges.forEach((edge: CallbackGraphEdge) => {
            [edge.source?.id, edge.destination?.id].filter(Boolean).forEach((id: number) => {
                if (!map.has(id)) map.set(id, { hasActiveEgress: false, isP2POnly: true, hasActiveP2PPeer: false });
                const entry = map.get(id)!;
                if (!edge.c2profile?.is_p2p && edge.end_timestamp === null) entry.hasActiveEgress = true;
                if (!edge.c2profile?.is_p2p) entry.isP2POnly = false;
                if (edge.c2profile?.is_p2p && edge.end_timestamp === null) entry.hasActiveP2PPeer = true;
            });
        });
        return map;
    }, [edgesData]);

    const edgesForOrphanCheck = edgesData?.callbackgraphedge as CallbackGraphEdge[] | undefined;

    // ── Rail counters ──────────────────────────────────────────────────────
    //
    // Counted over the SAME population the list below shows — Mythic callbacks
    // and MSF sessions in one stream. Counting only Mythic up here while the
    // table renders both is how a rail starts quietly lying about the size of
    // the operation.
    const allCallbacks = useMemo(
        () => [...((data?.callback || []) as Callback[]), ...msfCallbacks],
        [data, msfCallbacks],
    );
    const totalCallbacks = allCallbacks.length;
    // Liveness is derived, never read off Mythic's `dead` column: that column
    // is updated by a container-side sweep and lags a full sleep interval, so a
    // node that is answering right now can still be flagged dead there.
    const aliveCallbacks = useMemo(
        () => allCallbacks.filter(c => c.active !== false && isCallbackAlive(c, edgesForOrphanCheck)).length,
        [allCallbacks, edgesForOrphanCheck],
    );
    const highIntegrityCount = useMemo(
        () => allCallbacks.filter(c => c.integrity_level > 2).length,
        [allCallbacks],
    );
    const liveTone: Tone = totalCallbacks === 0 ? 'idle' : aliveCallbacks === 0 ? 'fail' : 'live';
    const liveWord = totalCallbacks === 0
        ? 'NO CALLBACKS'
        : aliveCallbacks === 0 ? 'NONE LIVE' : `${aliveCallbacks} LIVE`;

    // ── Per-column filter + sort logic ──
    const filteredData = useMemo(() => {
        // Mythic callbacks + MSF synthetic sessions in one stream
        const combined = [...(data?.callback || []), ...msfCallbacks];
        let rows = combined.filter((c: Callback) =>
            (showHiddenCallbacks || c.active !== false) && (!hideDead || isCallbackAlive(c, edgesForOrphanCheck)));
        const filters = Object.entries(columnFilters).filter(([, v]) => v.trim());
        if (filters.length > 0) {
            rows = rows.filter((row: Callback) => {
                return filters.every(([col, val]) => {
                    const v = val.toLowerCase();
                    switch (col) {
                        case 'USER': return (row.user || '').toLowerCase().includes(v);
                        case 'HOST': return (row.host || '').toLowerCase().includes(v);
                        case 'IP': return (row.ip || '').toLowerCase().includes(v);
                        case 'EXTERNAL IP': return (row.external_ip || '').toLowerCase().includes(v);
                        case 'OS': return (row.os || '').toLowerCase().includes(v);
                        case 'PID': return String(row.pid || '').includes(v);
                        case 'DESCRIPTION': return (row.description || '').toLowerCase().includes(v);
                        case 'AGENT': return (row.payload?.payloadtype?.name || '').toLowerCase().includes(v);
                        case 'DOMAIN': return (row.domain || '').toLowerCase().includes(v);
                        case 'ARCHITECTURE': return (row.architecture || '').toLowerCase().includes(v);
                        case 'GROUPS': return (row.mythictree_groups || []).join(',').toLowerCase().includes(v);
                        case 'SLEEP': return (row.sleep_info || '').toLowerCase().includes(v);
                        case 'PROCESS NAME': return (row.process_name || '').toLowerCase().includes(v);
                        case 'C2': return (row.callbackc2profiles || []).map((cp: CallbackC2Profile) => cp.c2profile?.name || '').join(',').toLowerCase().includes(v);
                        case 'TAGS': return (row.tags || []).map((t: CallbackTag) => t.tagtype?.name || '').join(',').toLowerCase().includes(v);
                        default: return true;
                    }
                });
            });
        }
        if (sortKey) {
            rows = [...rows].sort((a, b) => {
                let av: string | number | undefined, bv: string | number | undefined;
                switch (sortKey) {
                    case 'ip': av = parseFirstIP(a.ip); bv = parseFirstIP(b.ip); break;
                    default: av = (a as Record<string, unknown>)[sortKey] as string | number | undefined; bv = (b as Record<string, unknown>)[sortKey] as string | number | undefined;
                }
                if (av == null) return 1; if (bv == null) return -1;
                // Timestamp sort: 1970 (STREAMING callbacks) always sort to the bottom in ASC, top in DESC
                if (sortKey === 'last_checkin') {
                    const is1970A = !av || String(av).startsWith('1970');
                    const is1970B = !bv || String(bv).startsWith('1970');
                    if (is1970A && is1970B) return 0;
                    if (is1970A) return sortDir === 'ASC' ? 1 : -1;
                    if (is1970B) return sortDir === 'ASC' ? -1 : 1;
                    const strA = String(av); const strB = String(bv);
                    const da = new Date(strA.endsWith('Z') ? strA : strA + 'Z').getTime();
                    const db = new Date(strB.endsWith('Z') ? strB : strB + 'Z').getTime();
                    return sortDir === 'ASC' ? da - db : db - da;
                }
                // #4/#5 — IPv4 numeric + IPv6 full-expansion comparison
                if (sortKey === 'ip') {
                    const strA = String(av), strB = String(bv);
                    // IPv6 normalizer: expand to 8 groups of 4 hex digits
                    const normalizeIPv6 = (s: string): string | null => {
                        if (!s.includes(':')) return null;
                        let addr = s;
                        // Strip zone ID
                        const zi = addr.indexOf('%'); if (zi !== -1) addr = addr.slice(0, zi);
                        // Handle ::
                        if (addr.includes('::')) {
                            const parts = addr.split('::');
                            const left = parts[0] ? parts[0].split(':') : [];
                            const right = parts[1] ? parts[1].split(':') : [];
                            const fill = 8 - left.length - right.length;
                            const mid = Array(Math.max(0, fill)).fill('0000');
                            const groups = [...left, ...mid, ...right];
                            return groups.map(g => g.padStart(4, '0')).join(':');
                        }
                        const groups = addr.split(':');
                        if (groups.length !== 8) return null;
                        return groups.map(g => g.padStart(4, '0')).join(':');
                    };
                    // Try IPv4 first
                    const ipParts = (s: string) => s.split('.').map(Number);
                    const pa = ipParts(strA), pb = ipParts(strB);
                    if (pa.length === 4 && pb.length === 4 && pa.every(n => !isNaN(n)) && pb.every(n => !isNaN(n))) {
                        for (let i = 0; i < 4; i++) {
                            if (pa[i] !== pb[i]) { const cmp = pa[i] - pb[i]; return sortDir === 'ASC' ? cmp : -cmp; }
                        }
                        return 0;
                    }
                    // Try IPv6
                    const v6a = normalizeIPv6(strA), v6b = normalizeIPv6(strB);
                    if (v6a && v6b) {
                        const cmpV6 = v6a.localeCompare(v6b);
                        return sortDir === 'ASC' ? cmpV6 : -cmpV6;
                    }
                }
                const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
                return sortDir === 'ASC' ? cmp : -cmp;
            });
        }
        return rows;
    }, [data, msfCallbacks, showHiddenCallbacks, hideDead, columnFilters, sortKey, sortDir, edgesForOrphanCheck]);

    // Group callbacks by host — show best per machine, expandable to see others
    const displayData = useMemo(() => {
        if (!groupByHost) return filteredData;
        const hostMap = new Map<string, any[]>();
        for (const cb of filteredData) {
            const key = (cb.host || `unknown-${cb.id}`).toLowerCase();
            const arr = hostMap.get(key) || [];
            arr.push(cb);
            hostMap.set(key, arr);
        }
        const result: Callback[] = [];
        const privOrder = (c: Callback) => {
            const il = c.integrity_level as string | number;
            if (il === 4 || il === 'SYSTEM') return 4;
            if (il === 3 || il === 'High') return 3;
            if ((c.user || '').toLowerCase() === 'root' || (c.user || '').toLowerCase().includes('nt authority')) return 4;
            if (il === 2 || il === 'Medium') return 2;
            return 1;
        };
        for (const [hostKey, cbs] of hostMap.entries()) {
            // Sort: alive first → highest privilege → newest
            const sorted = [...cbs].sort((a, b) => {
                const aAlive = a.active !== false && isCallbackAlive(a, edgesForOrphanCheck) ? 1 : 0;
                const bAlive = b.active !== false && isCallbackAlive(b, edgesForOrphanCheck) ? 1 : 0;
                if (bAlive !== aAlive) return bAlive - aAlive;
                const aPriv = privOrder(a), bPriv = privOrder(b);
                if (bPriv !== aPriv) return bPriv - aPriv;
                return (b.display_id || 0) - (a.display_id || 0);
            });
            const rep = { ...sorted[0], _hostKey: hostKey, _childCallbacks: sorted.length > 1 ? sorted.slice(1) : undefined, _totalSessions: sorted.length };
            result.push(rep);
            // If expanded, inject child rows
            if (expandedHosts.has(hostKey) && sorted.length > 1) {
                for (const child of sorted.slice(1)) {
                    result.push({ ...child, _isChildRow: true, _hostKey: hostKey });
                }
            }
        }
        return result;
    }, [filteredData, groupByHost, expandedHosts]);

    const toggleHostExpand = useCallback((hostKey: string) => {
        setExpandedHosts(prev => {
            const next = new Set(prev);
            if (next.has(hostKey)) next.delete(hostKey);
            else next.add(hostKey);
            return next;
        });
    }, []);

    const filteredCallbackIds = useMemo(() => {
        const hasActiveFilters = Object.values(columnFilters).some(v => v.trim());
        if (!hasActiveFilters) return undefined;
        return filteredData.map((c: Callback) => c.display_id);
    }, [columnFilters, filteredData]);

    // ── Column definitions ──
    const ALL_COLS: Record<string, { header: string; filterKey?: string; sortKey?: string; cell?: (row: Callback) => React.ReactNode; accessorKey?: string; className?: string }> = {
        USER: {
            header: "USER", filterKey: 'USER', sortKey: 'user',
            cell: (row: Callback) => (
                <div className="flex items-center gap-2 flex-wrap">
                    <User size={14} className="shrink-0 text-signal opacity-60" />
                    <span className={row.integrity_level > 2 ? 'font-bold text-amber-400' : 'text-signal'}>{row.user}</span>
                    {row.impersonation_context && (
                        <span className="text-[10px] text-signal opacity-70" title={`Impersonating: ${row.impersonation_context}`}>[{row.impersonation_context}]</span>
                    )}
                    {row.integrity_level > 2 && <Shield size={12} className="text-amber-400" />}
                </div>
            )
        },
        HOST: { header: "HOST", accessorKey: "host", filterKey: 'HOST', sortKey: 'host' },
        IP: {
            header: "IP", filterKey: 'IP', sortKey: 'ip',
            cell: (row: Callback) => {
                let ips: string[] = [];
                if (Array.isArray(row.ip)) { ips = row.ip; }
                else { ips = parseIPString(row.ip); }
                if (ips.length > 1) return (
                    <button onClick={e => { e.stopPropagation(); setIpSelectCallback(row); }}
                        className="flex items-center gap-1 text-signal hover:underline font-mono text-xs"
                        title={`${ips.length} IPs — click to select primary`}>
                        {ips[0]} <ChevronDown size={10} className="text-signal opacity-60" />
                    </button>
                );
                return <span className="font-mono text-xs">{ips[0] || 'UNKNOWN'}</span>;
            }
        },
        'EXTERNAL IP': {
            header: "EXT IP", filterKey: 'EXTERNAL IP',
            cell: (row: Callback) => <span className="text-signal">{row.external_ip || "—"}</span>
        },
        OS: {
            header: "OS", filterKey: 'OS', sortKey: 'os',
            cell: (row: Callback) => (
                <button onClick={e => { e.stopPropagation(); if (row.os) setOsPopupText(row.os); }}
                    className="flex items-center gap-2 text-xs group" title={row.os ? 'Click to view full OS string' : undefined}>
                    {getPlatformIcon(row.os, row.payload?.payloadtype?.name, 14, 'text-signal')}
                    <span className="max-w-[80px] truncate text-signal transition-colors group-hover:text-accent">{row.os || '—'}</span>
                </button>
            )
        },
        PID: { header: "PID", accessorKey: "pid", className: "font-mono text-signal", filterKey: 'PID', sortKey: 'pid' },
        "LAST CHECKIN": {
            header: "LAST CHECKIN", sortKey: 'last_checkin',
            cell: (row: Callback) => {
                // A callback is treated as "P2P-routed" only when every
                // attached C2 profile is P2P — at least one direct C2
                // (HTTP/HTTPS/etc.) means the agent has its own beacon
                // and last_checkin is reliable.
                const profiles = row.callbackc2profiles ?? [];
                const isP2P = profiles.length > 0 && profiles.every(p => p?.c2profile?.is_p2p);
                const lastTaskProcessedAt = row.tasks?.[0]?.status_timestamp_processed;
                const orphanTcpP2P = isOrphanedTcpP2P(row, edgesForOrphanCheck);
                return (
                    <LastCheckinCell
                        lastCheckin={row.last_checkin}
                        agentType={row.payload?.payloadtype?.agent_type}
                        dead={row.dead}
                        sleepInfo={row.sleep_info}
                        isP2P={isP2P}
                        initCallback={row.init_callback}
                        lastTaskProcessedAt={lastTaskProcessedAt}
                        orphanTcpP2P={orphanTcpP2P}
                    />
                );
            },
        },
        DESCRIPTION: {
            header: "DESCRIPTION", filterKey: 'DESCRIPTION', sortKey: 'description',
            cell: (row: Callback) => row.description
                ? <span className="block max-w-[150px] truncate text-xs text-signal" title={row.description}>{row.description}</span>
                : <span className="text-xs text-signal opacity-50" title="No description">—</span>
        },
        AGENT: {
            header: "AGENT", filterKey: 'AGENT',
            cell: (row: Callback) => <span className="rounded-sm border border-signal/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-signal">{row.payload?.payloadtype?.name}</span>
        },
        DOMAIN: { header: "DOMAIN", filterKey: 'DOMAIN', sortKey: 'domain', cell: (row: Callback) => <span className="text-signal">{row.domain || "—"}</span> },
        ARCHITECTURE: { header: "ARCH", filterKey: 'ARCHITECTURE', cell: (row: Callback) => <span className="text-xs uppercase text-signal">{row.architecture || "—"}</span> },
        GROUPS: {
            header: "GROUPS", filterKey: 'GROUPS',
            cell: (row: Callback) => {
                const groups = row.mythictree_groups || [];
                return groups.length > 0
                    ? <div className="flex flex-wrap gap-1">{groups.map((g: string) => <span key={g} className="text-[10px] font-mono px-1.5 py-0.5 bg-signal/10 text-signal border border-signal/20 rounded-sm">{g}</span>)}</div>
                    : <span className="text-signal opacity-50">—</span>;
            }
        },
        SLEEP: {
            header: "SLEEP", filterKey: 'SLEEP',
            cell: (row: Callback) => (
                <button onClick={e => { e.stopPropagation(); setSleepEditCallback(row); setSleepEditValue(row.sleep_info || ''); }}
                    className="flex items-center gap-1.5 group" title="Click to edit sleep info">
                    <Clock size={10} className={row.sleep_info ? 'text-signal opacity-70' : 'text-amber-400'} />
                    <span className="font-mono text-xs text-signal transition-colors group-hover:text-accent">{row.sleep_info || '—'}</span>
                </button>
            )
        },
        C2: {
            header: "C2", filterKey: 'C2',
            cell: (row: Callback) => {
                const profiles = row.callbackc2profiles || [];
                const egress = callbackEgressStatus.get(row.id);
                const hasActive = egress?.hasActiveEgress ?? false;
                const hasEgress = profiles.some((cp: CallbackC2Profile) => !cp.c2profile?.is_p2p);
                return (
                    <button onClick={e => { e.stopPropagation(); setC2PathCallback(row); }}
                        title="View C2 Path" className="flex flex-wrap gap-1 items-center hover:opacity-80 transition-opacity cursor-pointer text-left">
                        {profiles.length > 0 && (
                            <span title={hasActive ? 'Active egress route' : (hasEgress ? 'Egress offline' : 'P2P only')}
                                className={cn('mr-0.5 inline-block h-2 w-2 shrink-0 rounded-full',
                                    hasActive ? 'bg-accent' : (hasEgress ? 'bg-red-400' : 'bg-purple-400'))} />
                        )}
                        {profiles.map((cp: CallbackC2Profile, i: number) => (
                            <span key={i} className={cn("rounded-sm border px-1.5 py-0.5 text-[10px] font-mono",
                                cp.c2profile?.is_p2p ? "border-purple-400/40 bg-purple-400/10 text-purple-400" : "border-signal/25 text-signal")}>
                                {cp.c2profile?.name}{cp.c2profile?.is_p2p ? ' (P2P)' : ''}
                            </span>
                        ))}
                        {profiles.length === 0 && <span className="text-signal opacity-60 transition-opacity hover:opacity-100"><GitBranch size={12} /></span>}
                    </button>
                );
            }
        },
        'PROCESS NAME': {
            header: "PROC", filterKey: 'PROCESS NAME',
            cell: (row: Callback) => <span className="font-mono text-xs text-signal" title={row.process_name || undefined}>{row.process_short_name || row.process_name || '—'}</span>
        },
        TAGS: {
            header: "TAGS", filterKey: 'TAGS',
            cell: (row: Callback) => {
                const tags = row.tags || [];
                return (
                    <div className="flex flex-wrap gap-1 items-center">
                        {tags.map((t: CallbackTag) => (
                            <span key={t.id} className="text-[10px] font-mono px-1.5 py-0.5 border rounded-sm"
                                style={{ color: t.tagtype?.color || '#888', borderColor: (t.tagtype?.color || '#888') + '40', backgroundColor: (t.tagtype?.color || '#888') + '15' }}>
                                {t.tagtype?.name || '?'}
                            </span>
                        ))}
                        <button onClick={e => { e.stopPropagation(); setTagEditCallbackId(row.id); }}
                            className="p-0.5 text-signal opacity-60 transition-all hover:text-amber-400 hover:opacity-100" title="Edit Tags">
                            <Tag size={10} />
                        </button>
                    </div>
                );
            }
        },
    };

    const columns = [
        {
            header: "",
            className: "w-8 pl-2",
            cell: (row: Callback) => panelTab === 'BULK' && showPanel ? (
                <button onClick={e => { e.stopPropagation(); toggleBulkSelect(row.display_id); }} className="p-0.5 text-signal opacity-60 transition-opacity hover:opacity-100" aria-label={`Select callback ${row.display_id} for bulk actions`}>
                    {bulkSelected.has(row.display_id) ? <CheckSquare size={14} className="text-accent opacity-100" /> : <Square size={14} />}
                </button>
            ) : null
        },
        {
            header: "ID",
            cell: (row: Callback) => (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Interact icon — reflects current interactType setting */}
                    <button
                        onClick={e => { e.stopPropagation(); handleInteract(row); }}
                        title={`Interact — ${operatorSettings.interactType}`}
                        className={cn(
                            'p-0.5 rounded transition-colors shrink-0',
                            row.locked
                                ? 'text-red-400 opacity-80 hover:opacity-100'
                                : row.integrity_level > 2
                                    ? 'text-amber-400'
                                    : 'text-signal opacity-70 hover:opacity-100'
                        )}>
                        {row.locked
                            ? <Lock size={12} />
                            : operatorSettings.interactType === 'console_tab'
                                ? <ExternalLink size={12} />
                                : operatorSettings.interactType === 'new_window'
                                    ? <LayoutGrid size={12} />
                                    : <Terminal size={12} />}
                    </button>
                    {row.dead && <span title="Dead"><Skull size={11} className="text-red-400" /></span>}
                    {!row.dead && isOrphanedTcpP2P(row, edgesForOrphanCheck) && <span title="TCP P2P · no peer linked"><Skull size={11} className="text-red-400" /></span>}
                    {!row.dead && !isOrphanedTcpP2P(row, edgesForOrphanCheck) && !isCallbackAlive(row) && <span title="Not responding"><Skull size={11} className="text-amber-400" /></span>}
                    <span className={cn('tabular-nums text-signal', row.active === false && 'opacity-50')}>
                        #{row.display_id}
                    </span>
                    {row.active === false && <span title="Hidden"><EyeOff size={11} className="text-amber-400" /></span>}
                    {row.trigger_on_checkin_after_time && <span title="Alert trigger set"><Bell size={9} className="text-amber-400" /></span>}
                    {(row.callbackports || []).length > 0 && (
                        <span title={(row.callbackports).map((p: any) => {
                                const base = `${p.port_type}: ${p.local_port}`;
                                const remote = p.remote_ip ? ` → ${p.remote_ip}:${p.remote_port || '?'}` : '';
                                const creds = p.username ? ` (${p.username}${p.password ? ':' + p.password : ''})` : '';
                                return base + remote + creds;
                            }).join('\n')}
                            className="flex cursor-help items-center gap-0.5 rounded-sm border border-accent/40 bg-accent/10 px-1 font-mono text-[9px] text-accent">
                            <Wifi size={8} className="shrink-0" />
                            {(row.callbackports).some((p: any) => p.port_type === 'socks') ? 'SOCKS' : 'PORT'}
                        </span>
                    )}
                </div>
            )
        },
        ...columnOrder.filter(k => visibleCols.has(k)).map(k => ALL_COLS[k]),
        {
            header: "",
            className: "w-10",
            cell: (row: Callback) => (
                <div className="relative">
                    <button onClick={(e) => handleActionsClick(e, row.id)} aria-label={`Actions for callback ${row.display_id}`} className="p-1 text-signal opacity-60 transition-opacity hover:opacity-100"><MoreVertical size={16} /></button>
                    {actionsMenuOpenId === row.id && createPortal(
                        row._isMsfSession ? (
                        // MSF callback menu — visually identical to the
                        // Mythic menu so meterpreter rows feel like just
                        // another agent. The action set is a subset (we
                        // skip the Mythic-only mutations Apollo/etc need
                        // — lock/edit/eventing — because they'd write
                        // to the Mythic callback table by display_id and
                        // our synthetic ids don't exist there).
                        <div className={MENU_SURFACE} style={{ top: menuPosition.top, bottom: menuPosition.bottom, left: menuPosition.left, maxHeight: menuPosition.maxH }} onClick={e => e.stopPropagation()}>
                            <div className={MENU_HEAD}>
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">Callback #{row.display_id}</div>
                                <div className="truncate text-[12px] font-bold text-signal">{row.user}@{row.host}</div>
                            </div>
                            <div className="p-1 flex flex-col">
                                <div className={MENU_SECTION}>Tasking Views</div>
                                <button onClick={() => { handleInteract(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Terminal size={14} /> Interact (Console)</button>
                                <button onClick={() => { window.open(`/console/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className={MENU_ITEM}><ExternalLink size={14} /> Console (New Tab)</button>
                                <button onClick={() => { navigator.clipboard.writeText(`#${row.display_id} ${row.user}@${row.host}`); snackActions.success('Copied'); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Copy size={14} /> Copy Identity</button>
                                <div className={MENU_RULE} />
                                {/* SOCKS routes — always available on alive rows. The
                                    operation-wide tunnel auto-starts at boot; this
                                    dialog edits which subnets this session contributes. */}
                                {!row.dead && (() => {
                                    const sid = msfSessionIdOf(row);
                                    const attached = sid ? msfTunnels.some(t => sid in t.sessions) : false;
                                    return (
                                        <button onClick={() => { setSocksDialogFor(row); setActionsMenuOpenId(null); }}
                                                className={MENU_ITEM}>
                                            <Wifi size={14} /> {attached ? 'SOCKS Routes (Active)' : 'SOCKS Routes…'}
                                        </button>
                                    );
                                })()}
                                <div className={MENU_RULE} />
                                {/* Kill — only meaningful while still alive */}
                                {!row.dead && (
                                    <button onClick={async () => {
                                        if (!window.confirm(`Kill callback #${row.display_id}?`)) return;
                                        try { await killMsfSession(String(row._msfSessionId)); snackActions.success(`Callback #${row.display_id} killed`); } catch (e: any) { snackActions.error(e?.message || 'Kill failed'); }
                                        setActionsMenuOpenId(null);
                                    }} className={MENU_ITEM_FAIL}><XCircle size={14} /> Kill Session</button>
                                )}
                                {/* Hide / Show — mirrors the Mythic hide UX but
                                    stored client-side because MSF synthetic
                                    callbacks aren't in Mythic's DB. */}
                                {row.active === false ? (
                                    <button onClick={() => handleShow(row)} className={MENU_ITEM}>
                                        <Eye size={14} /> Show Callback
                                    </button>
                                ) : (
                                    <button onClick={() => handleHide(row)} className={MENU_ITEM_FAIL}>
                                        <EyeOff size={14} /> Hide Callback
                                    </button>
                                )}
                                {/* Remove from list — drops the entry from the local ledger */}
                                <button onClick={() => {
                                    const ok = row.dead
                                        ? true
                                        : window.confirm(`Drop callback #${row.display_id} from the list?\n\nThis only hides it locally; the session itself is not killed.`);
                                    if (!ok) return;
                                    removeMsfSessionFromLedger(String(row._msfSessionId));
                                    snackActions.success(`Callback #${row.display_id} removed`);
                                    setActionsMenuOpenId(null);
                                }} className={MENU_ITEM_WARN}>
                                    <EyeOff size={14} /> {row.dead ? 'Remove from List' : 'Remove from List (local)'}
                                </button>
                            </div>
                        </div>
                        ) : (
                        <div className={MENU_SURFACE} style={{ top: menuPosition.top, bottom: menuPosition.bottom, left: menuPosition.left, maxHeight: menuPosition.maxH }} onClick={e => e.stopPropagation()}>
                            <div className={MENU_HEAD}>
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">Callback #{row.display_id}</div>
                                <div className="truncate text-[12px] font-bold text-signal">{row.user}@{row.host}</div>
                            </div>
                            <div className="p-1 flex flex-col">
                                {/* ── TASKING VIEWS ── */}
                                <div className={MENU_SECTION}>Tasking Views</div>
                                <button onClick={() => { navigate(`/console/${row.display_id}`); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Terminal size={14} /> Interact (Console)</button>
                                <button onClick={() => { window.open(`/console/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className={MENU_ITEM}><ExternalLink size={14} /> Console (New Tab)</button>
                                <button onClick={() => { setSplitCallbackRow(row); setSplitSecondId(null); setActionsMenuOpenId(null); }} className={MENU_ITEM}><SplitSquareHorizontal size={14} /> Split Console</button>
                                <button onClick={() => { window.open(`/new/callbacks/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className={MENU_ITEM}><LayoutGrid size={14} /> Expand Callback</button>
                                <div className={MENU_RULE} />
                                <button onClick={() => openEditDescription(row)} className={MENU_ITEM}><Edit size={14} /> Edit Description</button>
                                <button onClick={() => handleLockToggle(row)} className={MENU_ITEM}>
                                    {row.locked ? <Unlock size={14} /> : <Lock size={14} />} {row.locked ? `Unlock (${operatorSettings.hideOperatorNames ? '\u2022\u2022\u2022' : (row.locked_operator?.username || '?')})` : "Lock"}
                                </button>
                                <div className={MENU_RULE} />
                                {/* ── BROWSERS ── */}
                                <div className={MENU_SECTION}>Browsers</div>
                                <button onClick={() => { navigate(`/console/${row.display_id}?tab=files`); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Folder size={14} /> File Browser</button>
                                <button onClick={() => { navigate(`/console/${row.display_id}?tab=process`); setActionsMenuOpenId(null); }} className={MENU_ITEM}><FolderSearch size={14} /> Process Browser</button>
                                {customBrowsers.map((cb_: Callback) => (
                                    <button key={cb_.id} onClick={() => { navigate(`/console/${row.display_id}?tab=custom_browser&name=${encodeURIComponent(cb_.name || '')}`); setActionsMenuOpenId(null); }}
                                        className={MENU_ITEM}><List size={14} /> {cb_.name}</button>
                                ))}
                                <div className={MENU_RULE} />
                                {/* ── METADATA ── */}
                                <div className={MENU_SECTION}>Metadata</div>
                                <button onClick={() => { setDetailCallbackId(row.id); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Info size={14} /> View Details</button>
                                <button onClick={() => handleExportConfig(row)} className={MENU_ITEM}><Download size={14} /> Export Config</button>
                                <button onClick={() => { navigator.clipboard.writeText(row.agent_callback_id || ''); snackActions.success('UUID copied'); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Copy size={14} /> Copy UUID</button>
                                <button onClick={() => { setSleepEditCallback(row); setSleepEditValue(row.sleep_info || ''); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Clock size={14} /> Edit Sleep Info</button>
                                <button onClick={() => { setAlertTriggerCallback(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}>
                                    {row.trigger_on_checkin_after_time ? <><BellOff size={14} className="text-amber-400" /> Remove Alert Trigger</> : <><Bell size={14} /> Set Alert Trigger</>}
                                </button>
                                <button onClick={() => { setShowEventingDialog(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Zap size={14} className="text-purple-400" aria-hidden="true" /> Trigger Eventing</button>
                                <button onClick={() => { setShowOpenMultiple(true); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Layers size={14} /> Other Callbacks…</button>
                                <div className={MENU_RULE} />
                                {/* ── BULK ACTIONS ── */}
                                <div className={MENU_SECTION}>Bulk Actions</div>
                                <button onClick={() => { toggleBulkSelect(row.display_id); setPanelTab('BULK'); setShowPanel(true); setActionsMenuOpenId(null); }}
                                    className={MENU_ITEM}>
                                    {bulkSelected.has(row.display_id) ? <CheckSquare size={14} className="text-signal" /> : <Square size={14} />} {bulkSelected.has(row.display_id) ? 'Deselect for Bulk' : 'Select for Bulk'}
                                </button>
                                <button onClick={() => { setShowTaskMultiple(true); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Terminal size={14} /> Task Multiple…</button>
                                <button onClick={() => { setShowBulkEventingDialog(true); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Zap size={14} className="text-purple-400" aria-hidden="true" /> Start Eventing (Multiple)…</button>
                                <div className={MENU_RULE} />
                                {/* ── CUSTOMIZATION ── */}
                                <div className={MENU_SECTION}>Customization</div>
                                <button onClick={() => { setColorEditCallback(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Palette size={14} /> Set Row Color</button>
                                <button onClick={() => { setIpSelectCallback(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Globe size={14} /> Select Primary IP</button>
                                <button onClick={() => { setModifyGroupsCallback(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}><Layers size={14} /> Modify Groups</button>
                                <button onClick={() => { setC2PathCallback(row); setActionsMenuOpenId(null); }} className={MENU_ITEM}><GitBranch size={14} /> View C2 Path</button>
                                <div className={MENU_RULE} />
                                <button onClick={() => handleExitCallback(row)} className={MENU_ITEM_WARN}><XCircle size={14} /> Exit Callback</button>
                                <div className={MENU_RULE} />
                                {row.active === false ? (
                                    <button onClick={() => handleShow(row)} className={MENU_ITEM_LIVE}><Eye size={14} /> Show Callback</button>
                                ) : (
                                    <button onClick={() => handleHide(row)} className={MENU_ITEM_FAIL}><EyeOff size={14} /> Hide Callback</button>
                                )}
                            </div>
                        </div>
                        ),
                        document.body
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="min-h-screen bg-void text-signal font-mono selection:bg-signal selection:text-void">
            {/* No top padding: the instrument rail is this console's own top
                edge and has to reach it. Horizontal padding stays and the rail
                bleeds back out through negative margins — the same construction
                the dashboard uses, so the two pages share one skyline. */}
            <div className={cn(
                "transition-all duration-300 flex h-screen flex-col overflow-hidden px-6 lg:px-10 pt-0 pb-6",
                isSidebarCollapsed ? "ml-16" : "ml-64",
            )}>
                {/* ── Top instrument rail ─────────────────────────────────────
                    Identity on the left, state and controls on the right — the
                    same what-this-is / how-it-is-doing split the login frame
                    and the dashboard rail both use. */}
                <header className="z-30 -mx-6 mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-signal/20 bg-void/90 px-6 py-2.5 backdrop-blur-sm lg:-mx-10 lg:px-10">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <Activity size={14} strokeWidth={2} className="shrink-0 text-signal" aria-hidden="true" />
                        <h1 className="shrink-0 text-[13px] font-bold tracking-[0.14em] text-signal">ACTIVE CALLBACKS</h1>
                        <span className="hidden text-[13px] text-signal opacity-60 lg:inline">Live agent sessions</span>
                        <span aria-hidden="true" className="hidden h-3 w-px shrink-0 bg-signal/20 md:inline-block" />
                        {/* Liveness ships as a word, never as a bare colour: the
                            accent green and the amber sit close enough under
                            protanopia that a dot alone cannot carry the state.
                            The count itself is derived from isCallbackAlive, not
                            from Mythic's `dead` column, which lags a full sleep
                            interval behind the truth. */}
                        <StatusWord tone={liveTone} dot className="hidden md:inline-flex">
                            <span role="status" aria-atomic="true">{liveWord}</span>
                        </StatusWord>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                        <div className="hidden items-stretch overflow-hidden rounded-sm border border-signal/20 md:inline-flex">
                            <RailStat label="Total" value={totalCallbacks} title="Every callback in this operation, hidden ones included" />
                            <RailStat label="Live" value={aliveCallbacks} tone={aliveCallbacks > 0 ? 'live' : 'fail'} title="Callbacks still checking in" />
                            <RailStat label="Elevated" value={highIntegrityCount} tone="warn" title="Callbacks running at high integrity or above" />
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowSettingsModal(true)} title="Display settings" aria-label="Display settings"
                                className={cn(TOOL_BTN, TOOL_IDLE)}>
                                <Settings size={12} strokeWidth={2} aria-hidden="true" /> Settings
                            </button>
                            <button onClick={() => setShowImportConfig(true)} title="Import a callback config from another Mythic server" aria-label="Import callback config"
                                className={cn(TOOL_BTN, TOOL_IDLE)}>
                                <Upload size={12} strokeWidth={2} aria-hidden="true" /> Import
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-4">
                    {/* ── Topology ────────────────────────────────────────────
                        The graph draws its own canvas edge-to-edge; the panel
                        supplies the frame, so the graph's own border is off. */}
                    <div className="mv-panel-enter h-[54%] min-h-[300px] shrink-0" style={{ '--mv-panel-index': 0 } as React.CSSProperties}>
                        <InstrumentPanel
                            title="NETWORK TOPOLOGY"
                            icon={<Network size={13} strokeWidth={2} />}
                            badge={filteredCallbackIds ? `${filteredCallbackIds.length} MATCHING` : `${totalCallbacks} NODES`}
                            badgeTone={filteredCallbackIds ? 'range' : 'signal'}
                            bodyClassName="p-0 overflow-y-hidden"
                        >
                            <div className="min-h-0 flex-1">
                                <CallbackGraph filterCallbackIds={filteredCallbackIds} />
                            </div>
                        </InstrumentPanel>
                    </div>

                    {/* ── Agent list ──────────────────────────────────────────
                        Header strip names it, footer strip says where the count
                        came from, and everything between scrolls inside the
                        panel — the page chrome never moves. */}
                    <div className="mv-panel-enter flex min-h-0 flex-1 flex-col" style={{ '--mv-panel-index': 1 } as React.CSSProperties}>
                        <InstrumentPanel
                            title="AGENT LIST"
                            icon={<List size={13} strokeWidth={2} />}
                            badge={`${filteredData.length} SHOWN`}
                            bodyClassName="p-0 overflow-y-hidden"
                            footerLeft={
                                <>
                                    {groupByHost
                                        ? <>Showing <span className="font-bold">{displayData.length}</span> row{displayData.length === 1 ? '' : 's'} over <span className="font-bold">{filteredData.length}</span> of {totalCallbacks} callbacks</>
                                        : <>Showing <span className="font-bold">{filteredData.length}</span> of {totalCallbacks} callbacks</>}
                                    {activeFilterCount > 0 && <> · {activeFilterCount} column filter{activeFilterCount > 1 ? 's' : ''}</>}
                                    {hideDead && <> · dead withheld</>}
                                </>
                            }
                            footerRight={sortKey ? `${sortKey} ${sortDir}` : 'Unsorted'}
                        >
                            {/* Toolbar. Every control here is the same object —
                                a bordered chip naming a mode, lit while that mode
                                is engaged — so the operator reads the row's state
                                without reading its labels. */}
                            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-signal/15 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {showHiddenCallbacks && <ToolChip tone="warn"><Eye size={10} strokeWidth={2} /> Hidden shown</ToolChip>}
                                    {activeFilterCount > 0 && <ToolChip tone="range"><Filter size={10} strokeWidth={2} /> {activeFilterCount} filtered</ToolChip>}
                                    {panelTab === 'BULK' && showPanel && bulkSelected.size > 0 && <ToolChip tone="live"><CheckSquare size={10} strokeWidth={2} /> {bulkSelected.size} selected</ToolChip>}
                                    {!showHiddenCallbacks && activeFilterCount === 0 && !(panelTab === 'BULK' && showPanel && bulkSelected.size > 0) && (
                                        <span className="text-[11px] text-signal opacity-60">No filters applied</span>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button onClick={() => setShowFilters(!showFilters)} aria-pressed={showFilters}
                                        title="Per-column filters"
                                        className={cn(TOOL_BTN, showFilters ? TOOL_ON.range : TOOL_IDLE)}>
                                        <Filter size={11} strokeWidth={2} aria-hidden="true" /> Filter
                                    </button>
                                    <button onClick={() => setGroupByHost(!groupByHost)} aria-pressed={groupByHost}
                                        title={groupByHost ? "Show all callbacks individually" : "Group callbacks by host"}
                                        className={cn(TOOL_BTN, groupByHost ? TOOL_ON.live : TOOL_IDLE)}>
                                        <Layers size={11} strokeWidth={2} aria-hidden="true" /> Group by host
                                    </button>
                                    {/* The chip names the filter, not the click.
                                        Lit = dead sessions are being withheld —
                                        which is the fact the operator has to be
                                        able to read off the toolbar before
                                        trusting the row count. */}
                                    <button onClick={() => setHideDead(!hideDead)} aria-pressed={hideDead}
                                        title={hideDead ? "Show dead sessions" : "Hide dead sessions"}
                                        className={cn(TOOL_BTN, hideDead ? TOOL_ON.fail : TOOL_IDLE)}>
                                        <Skull size={11} strokeWidth={2} aria-hidden="true" /> Hide dead
                                    </button>
                                    <button onClick={() => setShowHiddenCallbacks(!showHiddenCallbacks)} aria-pressed={showHiddenCallbacks}
                                        title={showHiddenCallbacks ? "Hide the callbacks that were hidden from this operation" : "Also show callbacks hidden from this operation"}
                                        className={cn(TOOL_BTN, showHiddenCallbacks ? TOOL_ON.warn : TOOL_IDLE)}>
                                        {showHiddenCallbacks ? <Eye size={11} strokeWidth={2} aria-hidden="true" /> : <EyeOff size={11} strokeWidth={2} aria-hidden="true" />} Show hidden
                                    </button>
                                    <div role="group" aria-label="Side panel" className="inline-flex h-7 shrink-0 overflow-hidden rounded-sm border border-signal/20">
                                        <button onClick={() => { setPanelTab('BULK'); setShowPanel(p => panelTab === 'BULK' ? !p : true); }}
                                            aria-pressed={showPanel && panelTab === 'BULK'}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors',
                                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                                                showPanel && panelTab === 'BULK' ? 'bg-signal text-void' : 'text-signal hover:bg-signal/10',
                                            )}>
                                            <CheckSquare size={11} strokeWidth={2} aria-hidden="true" /> Bulk
                                        </button>
                                        <span aria-hidden="true" className="w-px bg-signal/20" />
                                        <button onClick={() => { setPanelTab('COLS'); setShowPanel(p => panelTab === 'COLS' ? !p : true); }}
                                            aria-pressed={showPanel && panelTab === 'COLS'}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors',
                                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                                                showPanel && panelTab === 'COLS' ? 'bg-signal text-void' : 'text-signal hover:bg-signal/10',
                                            )}>
                                            <Columns size={11} strokeWidth={2} aria-hidden="true" /> Cols
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Per-column filter row */}
                            {showFilters && (
                                <div className="shrink-0 border-b border-signal/15 bg-signal/[0.03] px-3 py-2.5">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Column filters</span>
                                        {activeFilterCount > 0 && (
                                            <button onClick={() => setColumnFilters({})}
                                                className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-signal/20 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-signal transition-colors hover:border-red-400/50 hover:text-red-400">
                                                <X size={10} strokeWidth={2} aria-hidden="true" /> Clear all
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {TOGGLEABLE_COLS.filter(k => visibleCols.has(k) && ALL_COLS[k].filterKey).map(k => (
                                            <div key={k} className="flex flex-col gap-1">
                                                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-signal opacity-70">{k}</span>
                                                <ColumnFilterInput value={columnFilters[k] || ''} onChange={v => setColFilter(k, v)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* COLS / BULK panel */}
                            {showPanel && (
                                <div className="shrink-0 border-b border-signal/15 bg-signal/[0.03] px-3 py-2.5">
                                    {panelTab === 'COLS' && (
                                        <>
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">
                                                    Visible columns <span className="opacity-60">— drag to reorder</span>
                                                </span>
                                                <button onClick={() => { setVisibleCols(new Set(DEFAULT_VISIBLE)); setColumnOrder([...TOGGLEABLE_COLS]); }}
                                                    className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-signal/20 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-signal transition-colors hover:border-amber-400/50 hover:text-amber-400">
                                                    Reset to defaults
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                {columnOrder.map(key => (
                                                    <label key={key}
                                                        draggable
                                                        onDragStart={() => { setDragCol(key); setDropCol(null); }}
                                                        onDragOver={(e) => { e.preventDefault(); setDropCol(key); }}
                                                        onDragEnter={() => setDropCol(key)}
                                                        onDragLeave={() => setDropCol(null)}
                                                        onDrop={() => {
                                                            if (dragCol && dragCol !== key) {
                                                                setColumnOrder(prev => {
                                                                    const n = [...prev];
                                                                    const fromIdx = n.indexOf(dragCol);
                                                                    const toIdx = n.indexOf(key);
                                                                    n.splice(fromIdx, 1);
                                                                    n.splice(toIdx, 0, dragCol);
                                                                    return n;
                                                                });
                                                            }
                                                            setDragCol(null);
                                                            setDropCol(null);
                                                        }}
                                                        className={cn(
                                                            "flex w-32 cursor-grab items-center gap-2 rounded-sm border px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-signal transition-colors",
                                                            dragCol === key && "opacity-40",
                                                            dropCol === key && dragCol !== key
                                                                ? "border-accent/60 bg-accent/10 text-accent"
                                                                : "border-transparent hover:border-signal/25 hover:bg-signal/5",
                                                        )}>
                                                        <button onClick={() => toggleCol(key)} className="shrink-0" aria-label={`Toggle ${key} column`}>
                                                            {visibleCols.has(key)
                                                                ? <CheckSquare size={13} strokeWidth={2} className="text-accent" />
                                                                : <Square size={13} strokeWidth={2} className="text-signal opacity-50" />}
                                                        </button>
                                                        <span className="truncate">{key}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {panelTab === 'BULK' && (
                                        <>
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Bulk actions</span>
                                                <span className="text-[11px] text-signal">
                                                    <span className="opacity-70">Selected</span>{' '}
                                                    <span className="font-bold tabular-nums">{bulkSelected.size}</span>
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button onClick={() => { const shown = filteredData; setBulkSelected(new Set(shown.map((c: Callback) => c.display_id))); }}
                                                    className={cn(TOOL_BTN, TOOL_IDLE)}>
                                                    <CheckSquare size={11} strokeWidth={2} aria-hidden="true" /> Select all
                                                </button>
                                                <button onClick={() => setBulkSelected(new Set())}
                                                    className={cn(TOOL_BTN, TOOL_IDLE)}>
                                                    <Square size={11} strokeWidth={2} aria-hidden="true" /> Clear
                                                </button>
                                                <button disabled={bulkSelected.size === 0} onClick={handleBulkHide}
                                                    className={cn(TOOL_BTN, 'border-red-400/45 text-red-400 hover:border-red-400 hover:bg-red-400/10 disabled:opacity-30')}>
                                                    <EyeOff size={11} strokeWidth={2} aria-hidden="true" /> Hide selected
                                                </button>
                                                <button disabled={bulkSelected.size === 0} onClick={() => setShowTaskMultiple(true)}
                                                    className={cn(TOOL_BTN, TOOL_IDLE, 'disabled:opacity-30')}>
                                                    <Terminal size={11} strokeWidth={2} aria-hidden="true" /> Task multiple
                                                </button>
                                                <button disabled={bulkSelected.size === 0} onClick={() => setShowBulkEventingDialog(true)}
                                                    className={cn(TOOL_BTN, 'border-purple-400/45 text-purple-400 hover:border-purple-400 hover:bg-purple-400/10 disabled:opacity-30')}>
                                                    <Zap size={11} strokeWidth={2} aria-hidden="true" /> Trigger eventing
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Tasking context bar — the identity the console will
                                task against, pinned above the list so it is never
                                a guess. Label muted, value bold: the value is the
                                thing being read. */}
                            {selectedCallbackId && (operatorSettings.taskingContextFields?.length ?? 0) > 0 && (() => {
                                const selCb = filteredData.find((r: Callback) => r.id === selectedCallbackId);
                                if (!selCb) return null;
                                const tryParseIP = (ip: string) => { try { const p = JSON.parse(ip); return Array.isArray(p) ? p.join(', ') : ip; } catch { return ip; } };
                                const fieldLabel: Record<string, string> = { user:'USER', host:'HOST', ip:'IP', pid:'PID', cwd:'CWD', impersonation_context:'IMPERSONATION', architecture:'ARCH', process_short_name:'PROC', extra_info:'EXTRA' };
                                return (
                                    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-signal/15 bg-accent/[0.06] px-3 py-1.5 text-[11px]">
                                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">CTX #{selCb.display_id}</span>
                                        {operatorSettings.taskingContextFields.map(field => {
                                            let val = (selCb as Record<string, unknown>)[field] ?? '—';
                                            if (field === 'ip') val = tryParseIP(val as string);
                                            if (!val || val === '—') return null;
                                            return (
                                                <span key={field} className="flex items-center gap-1.5 text-signal">
                                                    <span className="opacity-70">{fieldLabel[field] ?? field.toUpperCase()}</span>
                                                    <span className="font-bold">{String(val)}</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            <div className="min-h-0 flex-1">
                                <CyberTable
                                    variant="instrument"
                                    maxHeight="100%"
                                    data={displayData}
                                    columns={columns}
                                    isLoading={loading}
                                    onRowClick={(row: Callback) => {
                                        // If this is a group header with children, toggle expand on the group indicator area
                                        handleRowClick(row);
                                    }}
                                    onRowDoubleClick={handleRowDoubleClick}
                                    getRowColor={(row: Callback) => {
                                        if (row._isChildRow) return '#1a2a3a';
                                        if (row.id === selectedCallbackId) return '#4ade80';
                                        return row.color || undefined;
                                    }}
                                    sortKey={sortKey}
                                    sortDir={sortDir}
                                    onSort={handleSort}
                                    onHeaderRightClick={handleHeaderRightClick}
                                    rowFontSize={operatorSettings.fontSize}
                                    renderRowPrefix={groupByHost ? (row: Callback) => {
                                        if (row._isChildRow) {
                                            return (
                                                <span className="inline-flex items-center pl-3 pr-1">
                                                    <span className="mr-2 h-4 border-l border-signal/25" />
                                                    <span className="text-[9px] text-signal opacity-60">└</span>
                                                </span>
                                            );
                                        }
                                        if (row._totalSessions! > 1) {
                                            return (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleHostExpand(row._hostKey!); }}
                                                    className="inline-flex items-center gap-1 pr-1 text-signal transition-colors hover:text-accent"
                                                    title={`${row._totalSessions} sessions on this host`}
                                                >
                                                    <ChevronRight size={12} className={cn("transition-transform", expandedHosts.has(row._hostKey!) && "rotate-90")} />
                                                    <span className="rounded-sm bg-signal/10 px-1 text-[9px] font-bold tabular-nums text-signal">{row._totalSessions}</span>
                                                </button>
                                            );
                                        }
                                        return null;
                                    } : undefined}
                                />
                            </div>
                        </InstrumentPanel>
                    </div>
                </div>
            </div>
            {/* Edit Description Modal */}
            <AnimatePresence>
                {editDescriptionCallback && (
                    <CyberModal title="EDIT_DESCRIPTION" onClose={() => setEditDescriptionCallback(null)} icon={<Edit />}>
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className={FIELD_LABEL}>Description</label>
                                    <button
                                        onClick={() => {
                                            try {
                                                const parsed = JSON.parse(newDescription);
                                                setNewDescription(JSON.stringify(parsed, null, 2));
                                                snackActions.success('JSON formatted');
                                            } catch {
                                                snackActions.warning('Not valid JSON — cannot format');
                                            }
                                        }}
                                        className={cn(TOOL_BTN, TOOL_IDLE)}
                                        title="Auto-format if valid JSON"
                                    >
                                        <FileText size={9} /> FORMAT JSON
                                    </button>
                                </div>
                                <textarea
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    className={cn(FIELD_INPUT, 'min-h-[60px] max-h-[200px] resize-y')}
                                    autoFocus
                                    rows={3}
                                />
                                {/* JSON syntax highlight preview */}
                                {newDescription && (newDescription.trimStart().startsWith('{') || newDescription.trimStart().startsWith('[')) && (() => {
                                    let valid = false;
                                    try { JSON.parse(newDescription); valid = true; } catch {}
                                    if (valid) return (
                                        <div className="mt-1.5">
                                            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">JSON preview</div>
                                            <JsonHighlight value={newDescription} />
                                        </div>
                                    );
                                    return <div className="mt-1 flex items-center gap-1.5 text-[11px] text-red-400"><XCircle size={10} strokeWidth={2} /> Invalid JSON</div>;
                                })()}
                            </div>
                            <div>
                                <label className={cn(FIELD_LABEL, "mb-2")}>Row colour <span className="font-normal opacity-70">— optional</span></label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {COLOR_PRESETS.map(c => (
                                        <button key={c || 'none'} onClick={() => setNewColor(c || '')}
                                            className={cn('w-6 h-6 rounded border transition-all hover:scale-110',
                                                newColor === (c || '') ? 'border-signal ring-1 ring-signal/50 scale-110' : 'border-signal/25')}
                                            style={{ backgroundColor: c || 'transparent' }}
                                            title={c || 'Clear color'}>
                                            {!c && <X size={12} className="m-auto text-signal opacity-70" />}
                                        </button>
                                    ))}
                                    <input type="color" value={newColor || '#1a1a1a'} onChange={e => setNewColor(e.target.value)}
                                        className="h-7 w-7 cursor-pointer rounded border border-signal/25 bg-transparent" title="Custom color" />
                                    {newColor && (
                                        <span className="text-[10px] font-mono text-signal">{newColor}</span>
                                    )}
                                </div>
                            </div>
                            {/* Color preview — dark + light mode */}
                            {newColor && (
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">Colour preview</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 h-7 flex items-center px-3 border rounded" style={{ backgroundColor: '#0a0a0a', borderColor: newColor + '60' }}>
                                            <span className="text-white text-[11px] font-mono truncate drop-shadow-sm">{newDescription || '◆ dark mode preview'}</span>
                                        </div>
                                        <div className="flex-1 h-7 flex items-center px-3 border rounded" style={{ backgroundColor: '#f5f5f5', borderColor: newColor + '60' }}>
                                            <span className="text-black text-[11px] font-mono truncate">{newDescription || '◆ light mode preview'}</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 w-full rounded" style={{ backgroundColor: newColor }} />
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditDescriptionCallback(null)} className={BTN_GHOST}>Cancel</button>
                                <button onClick={() => handleSaveDescriptionAndColor(newDescription, newColor)} className={BTN_PRIMARY}>Save</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
            {/* Detailed Callback Info Modal */}
            <AnimatePresence>
                {detailCallbackId !== null && <DetailedCallbackModal callbackId={detailCallbackId} onClose={() => setDetailCallbackId(null)} />}
            </AnimatePresence>
            {/* Split Console Modal */}
            <AnimatePresence>
                {splitCallbackRow && (
                    <CyberModal title="SPLIT_CONSOLE" onClose={() => setSplitCallbackRow(null)} icon={<SplitSquareHorizontal />}>
                        <div className="space-y-4 min-w-[340px]">
                            <p className="text-[12px] text-signal">
                                <span className="opacity-70">Primary</span>{' '}
                                <span className="font-bold tabular-nums">#{splitCallbackRow.display_id}</span>
                                <span className="ml-2 opacity-70">{splitCallbackRow.user}@{splitCallbackRow.host}</span>
                            </p>
                            <div>
                                <label className={cn(FIELD_LABEL, "mb-2")}>Select second callback</label>
                                <div className="cyber-scrollbar grid max-h-48 gap-1 overflow-y-auto rounded-md border border-signal/20 bg-black/30 p-2">
                                    {(data?.callback || [])
                                        .filter((c: Callback) => c.id !== splitCallbackRow.id && c.active !== false)
                                        .map((c: Callback) => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSplitSecondId(c.display_id)}
                                            className={cn(
                                                'flex items-center gap-2 rounded-sm border px-3 py-2 text-left text-[12px] transition-colors',
                                                splitSecondId === c.display_id
                                                    ? 'border-accent bg-accent/10 text-accent'
                                                    : 'border-signal/20 text-signal hover:border-signal/45 hover:bg-signal/5'
                                            )}
                                        >
                                            <Monitor size={12} className="shrink-0" />
                                            <span>#{c.display_id}</span>
                                            <span className="opacity-70">{c.user}@{c.host}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSplitCallbackRow(null)} className={BTN_GHOST}>Cancel</button>
                                <button
                                    onClick={() => {
                                        if (!splitSecondId) return;
                                        const w = window.screen.width;
                                        const h = window.screen.height;
                                        const halfW = Math.floor(w / 2);
                                        window.open(`/new/callbacks/${splitCallbackRow.display_id}`, '_blank', `width=${halfW},height=${h},left=0,top=0`);
                                        window.open(`/new/callbacks/${splitSecondId}`, '_blank', `width=${halfW},height=${h},left=${halfW},top=0`);
                                        setSplitCallbackRow(null);
                                    }}
                                    disabled={!splitSecondId}
                                    className={BTN_PRIMARY}
                                >
                                    <SplitSquareHorizontal size={12} strokeWidth={2} aria-hidden="true" />Open split
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
            {/* Sleep Edit Modal */}
            <AnimatePresence>
                {sleepEditCallback && (
                    <CyberModal title="EDIT_SLEEP_INFO" onClose={() => setSleepEditCallback(null)} icon={<Clock />}>
                        <div className="space-y-4">
                            <div>
                                <label className={cn(FIELD_LABEL, "mb-2")}>Sleep info — callback #{sleepEditCallback.display_id}</label>
                                <input type="text" value={sleepEditValue} onChange={e => setSleepEditValue(e.target.value)}
                                    className={FIELD_INPUT}
                                    placeholder="e.g. 10s, 30s with 20% jitter"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveSleep(); }}
                                />
                            </div>
                            <p className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2.5 text-[11px] text-amber-400">
                                <Info size={13} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
                                This does not task the agent — it only updates the alive/dead tracking threshold in Mythic.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setSleepEditCallback(null)} className={BTN_GHOST}>Cancel</button>
                                <button onClick={handleSaveSleep} className={BTN_PRIMARY}>Save</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
            {/* Eventing Trigger Dialog */}
            {showEventingDialog && (
                <MythicDialog fullWidth={true} maxWidth="xl" open={!!showEventingDialog}
                    onClose={() => setShowEventingDialog(null)}
                    innerDialog={<EventTriggerContextSelectDialog
                        onClose={() => setShowEventingDialog(null)}
                        triggerContext={{ name: "callback_id", value: showEventingDialog.id }} />}
                />
            )}
            {/* Color Picker Modal */}
            <AnimatePresence>
                {colorEditCallback && (
                    <CallbackColorPickerModal callback={colorEditCallback}
                        onClose={() => setColorEditCallback(null)}
                        onSave={handleSaveColor} />
                )}
            </AnimatePresence>
            {/* IP Selector Modal */}
            <AnimatePresence>
                {ipSelectCallback && (
                    <IPSelectorModal callback={ipSelectCallback}
                        onClose={() => setIpSelectCallback(null)}
                        onSave={handleSaveIPs} />
                )}
            </AnimatePresence>
            {/* Modify Groups Modal */}
            <AnimatePresence>
                {modifyGroupsCallback && (
                    <ModifyGroupsModal callback={modifyGroupsCallback}
                        allCallbacks={data?.callback || []}
                        onClose={() => setModifyGroupsCallback(null)}
                        onSave={handleSaveGroups} />
                )}
            </AnimatePresence>
            {/* C2 Path Dialog */}
            <AnimatePresence>
                {c2PathCallback && (
                    <C2PathDialog callbackId={c2PathCallback.id}
                        displayId={c2PathCallback.display_id}
                        onClose={() => setC2PathCallback(null)} />
                )}
            </AnimatePresence>
            {/* MSF SOCKS Tunnel Dialog */}
            <AnimatePresence>
                {socksDialogFor && (() => {
                    const sid = msfSessionIdOf(socksDialogFor);
                    if (!sid) return null;
                    return (
                        <MsfSocksDialog
                            open={true}
                            onClose={() => setSocksDialogFor(null)}
                            sessionId={sid}
                            label={`${socksDialogFor.user}@${socksDialogFor.host}`}
                            ipField={socksDialogFor.ip as any}
                        />
                    );
                })()}
            </AnimatePresence>
            {/* Open Multiple Modal */}
            <AnimatePresence>
                {showOpenMultiple && (
                    <OpenMultipleDialog allCallbacks={data?.callback || []} onClose={() => setShowOpenMultiple(false)} />
                )}
            </AnimatePresence>
            {/* Task Multiple Dialog */}
            <AnimatePresence>
                {showTaskMultiple && bulkSelected.size > 0 && (
                    <TaskMultipleDialog selectedDisplayIds={[...bulkSelected]}
                        allCallbacks={data?.callback || []}
                        onClose={() => setShowTaskMultiple(false)} />
                )}
            </AnimatePresence>
            {/* Import Config Modal */}
            <AnimatePresence>
                {showImportConfig && (
                    <ImportConfigModal onClose={() => setShowImportConfig(false)} />
                )}
            </AnimatePresence>
            {/* Alert Trigger Modal */}
            <AnimatePresence>
                {alertTriggerCallback && (
                    <AlertTriggerModal
                        callback={alertTriggerCallback}
                        onClose={() => setAlertTriggerCallback(null)}
                        onSave={handleSaveAlertTrigger}
                    />
                )}
            </AnimatePresence>
            {/* Tag Edit Dialog */}
            {tagEditCallbackId !== null && (
                <MythicDialog fullWidth maxWidth="md" open={tagEditCallbackId !== null}
                    onClose={() => { setTagEditCallbackId(null); refetch(); }}
                    innerDialog={<ViewEditTagsDialog me={me} target_object="callback_id" target_object_id={tagEditCallbackId}
                        onClose={() => { setTagEditCallbackId(null); refetch(); }} />}
                />
            )}
            {/* Bulk Eventing Dialog */}
            {showBulkEventingDialog && bulkSelected.size > 0 && (
                <MythicDialog fullWidth maxWidth="xl" open={showBulkEventingDialog}
                    onClose={() => setShowBulkEventingDialog(false)}
                    innerDialog={<EventTriggerContextSelectDialog
                        onClose={() => setShowBulkEventingDialog(false)}
                        triggerContext={{ name: "callback_ids", value: [...bulkSelected] }} />}
                />
            )}
            {/* OS Full String Popup */}
            <AnimatePresence>
                {osPopupText && (
                    <CyberModal title="OS_DETAILS" onClose={() => setOsPopupText(null)} icon={<Monitor size={16} />}>
                        <div className="space-y-3 min-w-[320px]">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">Full OS string</div>
                            <pre className="select-all whitespace-pre-wrap break-all rounded-md border border-signal/20 bg-black/40 p-3 font-mono text-[12px] text-signal">{osPopupText}</pre>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => { navigator.clipboard.writeText(osPopupText); snackActions.success('Copied'); }} className={BTN_GHOST}><Copy size={12} strokeWidth={2} aria-hidden="true" /> Copy</button>
                                <button onClick={() => setOsPopupText(null)} className={BTN_PRIMARY}>Close</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Column Header Right-click Menu */}
            {headerMenu && createPortal(
                <div className={cn(MENU_SURFACE, 'z-[9990]')}
                    style={{ top: headerMenu.y, left: headerMenu.x }}
                    onClick={e => e.stopPropagation()}>
                    <div className={MENU_HEAD}>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">Column</div>
                        <div className="truncate text-[12px] font-bold text-signal">{headerMenu.col.header}</div>
                    </div>
                    <div className="p-2 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal opacity-70">Filter column</div>
                        <div className="flex gap-1">
                            <input
                                autoFocus
                                type="text"
                                value={headerFilterInput}
                                onChange={e => setHeaderFilterInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { setColFilter(headerMenu.col.filterKey, headerFilterInput); setHeaderMenu(null); } if (e.key === 'Escape') setHeaderMenu(null); }}
                                className={cn(FIELD_INPUT, 'flex-1 px-2 py-1 text-[12px]')}
                                placeholder="Filter value..."
                            />
                            <button onClick={() => { setColFilter(headerMenu.col.filterKey, headerFilterInput); setHeaderMenu(null); }}
                                className={cn(TOOL_BTN, TOOL_ON.signal)}>Set</button>
                        </div>
                        {columnFilters[headerMenu.col.filterKey] && (
                            <button onClick={() => { setColFilter(headerMenu.col.filterKey, ''); setHeaderMenu(null); }}
                                className={MENU_ITEM_FAIL}>
                                <X size={10} strokeWidth={2} aria-hidden="true" /> Clear filter for this column
                            </button>
                        )}
                        <div className={MENU_RULE} />
                        {headerMenu.col.sortKey && (
                            <button onClick={() => { setSortKey(headerMenu.col.sortKey); setSortDir('ASC'); setHeaderMenu(null); }}
                                className={MENU_ITEM}>
                                Sort ascending
                            </button>
                        )}
                        {headerMenu.col.sortKey && (
                            <button onClick={() => { setSortKey(headerMenu.col.sortKey); setSortDir('DESC'); setHeaderMenu(null); }}
                                className={MENU_ITEM}>
                                Sort descending
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Operator Settings Modal */}
            <AnimatePresence>
                {showSettingsModal && (
                    <CyberModal title="OPERATOR_SETTINGS" onClose={() => setShowSettingsModal(false)} icon={<Settings />}>
                        <div className="space-y-6 min-w-[340px]">
                            {/* Interact Type */}
                            <div className="space-y-2">
                                <div className={FIELD_LABEL}>Interact type</div>
                                <div className={FIELD_HINT}>How rows and the Interact button open callbacks</div>
                                <div className="flex gap-2">
                                    {([
                                        { value: 'console', label: 'CONSOLE', icon: <Terminal size={12} /> },
                                        { value: 'console_tab', label: 'NEW_TAB', icon: <ExternalLink size={12} /> },
                                        { value: 'new_window', label: 'SPLIT_WIN', icon: <LayoutGrid size={12} /> },
                                    ] as const).map(({ value: v, label: lbl, icon }) => (
                                        <button
                                            key={v}
                                            onClick={() => setOperatorSettings(s => ({ ...s, interactType: v }))}
                                            aria-pressed={operatorSettings.interactType === v}
                                            className={cn(
                                                'flex flex-1 items-center justify-center gap-1.5 rounded-sm border px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors',
                                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                                operatorSettings.interactType === v
                                                    ? 'border-signal bg-signal text-void'
                                                    : 'border-signal/20 text-signal hover:border-signal/45 hover:bg-signal/5',
                                            )}
                                        >
                                            {icon}{lbl}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Hide Operator Names */}
                            <div className="flex items-center justify-between gap-4 border-t border-signal/10 py-3">
                                <div className="min-w-0">
                                    <div className={FIELD_LABEL}>Hide operator names</div>
                                    <div className={cn(FIELD_HINT, "mt-1")}>Mask usernames in lock / ownership displays</div>
                                </div>
                                <button
                                    onClick={() => setOperatorSettings(s => ({ ...s, hideOperatorNames: !s.hideOperatorNames }))}
                                    aria-pressed={operatorSettings.hideOperatorNames}
                                    className={cn(TOOL_BTN, operatorSettings.hideOperatorNames ? TOOL_ON.signal : TOOL_IDLE)}
                                >
                                    {operatorSettings.hideOperatorNames ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            {/* Font Size / Row Height */}
                            <div className="border-t border-signal/10 py-3">
                                <div className="mb-2 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className={FIELD_LABEL}>Row font size</div>
                                        <div className={cn(FIELD_HINT, "mt-1")}>Controls table row height and text size</div>
                                    </div>
                                    <span className="shrink-0 text-[15px] font-bold tabular-nums text-signal">{operatorSettings.fontSize}<span className="ml-0.5 text-[11px] opacity-70">px</span></span>
                                </div>
                                <input
                                    type="range" min={10} max={18} step={1}
                                    value={operatorSettings.fontSize}
                                    onChange={e => setOperatorSettings(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                                    className="w-full accent-signal"
                                />
                                <div className="mt-1 flex justify-between text-[9px] tabular-nums text-signal opacity-70">
                                    <span>10</span><span>12</span><span>14</span><span>16</span><span>18</span>
                                </div>
                            </div>

                            {/* Tasking Context Fields */}
                            <div className="border-t border-signal/10 py-3">
                                <div className={FIELD_LABEL}>Tasking context fields</div>
                                <div className={cn(FIELD_HINT, "mb-2 mt-1")}>Fields shown in the tasking context bar when a callback is selected</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {['user', 'host', 'ip', 'pid', 'cwd', 'impersonation_context', 'architecture', 'process_short_name', 'extra_info'].map(field => {
                                        const active = (operatorSettings.taskingContextFields || []).includes(field);
                                        return (
                                            <button key={field}
                                                onClick={() => setOperatorSettings(s => {
                                                    const cur = s.taskingContextFields || [];
                                                    return { ...s, taskingContextFields: active ? cur.filter(f => f !== field) : [...cur, field] };
                                                })}
                                                aria-pressed={active}
                                                className={cn(
                                                    'rounded-sm border px-2 py-0.5 text-[10px] font-mono transition-colors',
                                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                                    active ? 'border-signal bg-signal text-void' : 'border-signal/20 text-signal hover:border-signal/45 hover:bg-signal/5',
                                                )}
                                            >
                                                {field}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Filter Persistence / Settings Sync */}
                            <div className="border-t border-signal/10 pt-3">
                                <div className="space-y-1.5 text-[11px] text-signal">
                                    <div className="flex items-center gap-1.5"><CheckSquare size={11} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" /> Column filters persist across sessions (local)</div>
                                    <div className="flex items-center gap-1.5"><CheckSquare size={11} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" /> Column visibility persists across sessions (local)</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button onClick={() => {
                                            const exp = { visibleCols: [...visibleCols], columnOrder, columnFilters, operatorSettings };
                                            downloadBlob(new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' }), 'minerva_settings.json');
                                        }} className={cn(TOOL_BTN, TOOL_IDLE)}>
                                            <Download size={11} strokeWidth={2} aria-hidden="true" /> Export settings
                                        </button>
                                        <label className={cn(TOOL_BTN, TOOL_IDLE, 'cursor-pointer')}>
                                            <Upload size={11} strokeWidth={2} aria-hidden="true" /> Import settings
                                            <input type="file" accept=".json" className="sr-only" onChange={e => {
                                                const file = e.target.files?.[0]; if (!file) return;
                                                file.text().then(txt => {
                                                    try {
                                                        const imp = JSON.parse(txt);
                                                        if (imp.visibleCols) setVisibleCols(new Set(imp.visibleCols as ColKey[]));
                                                        if (imp.columnOrder) setColumnOrder(imp.columnOrder);
                                                        if (imp.columnFilters) setColumnFilters(imp.columnFilters);
                                                        if (imp.operatorSettings) setOperatorSettings(imp.operatorSettings);
                                                        snackActions.success('Settings imported successfully');
                                                        setShowSettingsModal(false);
                                                    } catch { snackActions.error('Invalid settings file'); }
                                                });
                                            }} />
                                        </label>
                                        <button onClick={() => { localStorage.removeItem('minerva_cb_col_filters'); setColumnFilters({}); }} className={cn(TOOL_BTN, 'border-signal/20 text-signal hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-400')}>
                                            <X size={11} strokeWidth={2} aria-hidden="true" /> Clear saved filters
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
        </div>
    );
}
