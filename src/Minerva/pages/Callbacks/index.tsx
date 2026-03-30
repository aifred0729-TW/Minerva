import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Callback, CallbackGraphEdge, CallbackC2Profile, CallbackTag } from '../../types';
import { useQuery, useSubscription, useMutation, useLazyQuery, useApolloClient, useReactiveVar } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
import { isCallbackAlive, cn, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { CyberTable } from '../../components/CyberTable';
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
import { loadingSound, LastCheckinCell, getPlatformIcon, JsonHighlight } from './utils';
import { DetailedCallbackModal } from './DetailedCallbackModal';
import { C2PathDialog } from './C2PathDialog';
import {
    COLOR_PRESETS, CallbackColorPickerModal, IPSelectorModal,
    ModifyGroupsModal, OpenMultipleDialog, TaskMultipleDialog,
    ImportConfigModal, AlertTriggerModal, ColumnFilterInput,
} from './dialogs';

export default function Callbacks() {
    const { isSidebarCollapsed } = useAppStore();
    React.useEffect(() => {
        const audio = new Audio(loadingSound);
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }, []);
    const { data: queryData, loading, refetch } = useQuery(GET_CALLBACKS, { fetchPolicy: 'network-only' });
    const { data: subData } = useSubscription(SUBSCRIPTION_CALLBACKS);
    const data = useMemo(() => subData ? { callback: subData.callback } : queryData, [subData, queryData]);
    const { data: edgesData } = useQuery(GET_CALLBACK_GRAPH_EDGES, { pollInterval: 10000 });
    const { data: customBrowsersData } = useQuery(GET_CUSTOM_BROWSERS);
    const customBrowsers = customBrowsersData?.custombrowser || [];
    const me = useReactiveVar(meState);
    const navigate = useNavigate();
    const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION);
    const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION);
    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [exportConfig] = useLazyQuery(EXPORT_CALLBACK_CONFIG, { fetchPolicy: 'no-cache' });
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const [updateSleepInfo] = useMutation(UPDATE_SLEEP_INFO_MUTATION);
    const [updateTrigger] = useMutation(UPDATE_CALLBACK_TRIGGER_MUTATION);
    const [updateCallbackColor] = useMutation(UPDATE_CALLBACK_COLOR_MUTATION);
    const [updateDescriptionAndColor] = useMutation(UPDATE_DESCRIPTION_AND_COLOR_MUTATION);
    const [updateCallbackIPs] = useMutation(UPDATE_IPS_MUTATION);
    const [updateCallbackGroups] = useMutation(UPDATE_CALLBACK_GROUPS_MUTATION);
    const [bulkHideCallbacks] = useMutation(HIDE_CALLBACKS_BULK);
    const client = useApolloClient();
    const [actionsMenuOpenId, setActionsMenuOpenId] = useState<number | null>(null);
    const [showEventingDialog, setShowEventingDialog] = useState<unknown>(null);
    const [sleepEditCallback, setSleepEditCallback] = useState<unknown>(null);
    const [sleepEditValue, setSleepEditValue] = useState('');
    const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number; maxH: number }>({ top: 0, left: 0, maxH: 600 });
    const [editDescriptionCallback, setEditDescriptionCallback] = useState<unknown>(null);
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
    const [colorEditCallback, setColorEditCallback] = useState<unknown>(null);
    const [ipSelectCallback, setIpSelectCallback] = useState<unknown>(null);
    const [modifyGroupsCallback, setModifyGroupsCallback] = useState<unknown>(null);
    const [showImportConfig, setShowImportConfig] = useState(false);
    const [showTaskMultiple, setShowTaskMultiple] = useState(false);
    const [showOpenMultiple, setShowOpenMultiple] = useState(false);
    const [c2PathCallback, setC2PathCallback] = useState<unknown>(null);
    const [alertTriggerCallback, setAlertTriggerCallback] = useState<unknown>(null);
    const [tagEditCallbackId, setTagEditCallbackId] = useState<number | null>(null);
    const [showBulkEventingDialog, setShowBulkEventingDialog] = useState(false);
    const [osPopupText, setOsPopupText] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
    const [splitCallbackRow, setSplitCallbackRow] = useState<unknown>(null);
    const [splitSecondId, setSplitSecondId] = useState<number | null>(null);
    // ── Selected row highlight ──
    const [selectedCallbackId, setSelectedCallbackId] = useState<number | null>(null);
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
            const exitCmds = exitData?.callback_by_pk?.loadedcommands || [];
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
    const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; col: string } | null>(null);
    const [headerFilterInput, setHeaderFilterInput] = useState('');
    const handleHeaderRightClick = useCallback((col: string, e: React.MouseEvent) => {
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
        if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
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
        try { await hideCallback({ variables: { callback_display_id: cb.display_id, active: false } }); snackActions.success(`Callback ${cb.display_id} hidden`); refetch(); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setActionsMenuOpenId(null);
    };
    const handleShow = async (cb: Callback) => {
        try { await hideCallback({ variables: { callback_display_id: cb.display_id, active: true } }); snackActions.success(`Callback ${cb.display_id} restored`); refetch(); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setActionsMenuOpenId(null);
    };
    const handleLockToggle = async (cb: Callback) => {
        try { await lockCallback({ variables: { callback_display_id: cb.display_id, locked: !cb.locked } }); snackActions.success(`Callback ${cb.display_id} ${cb.locked ? "unlocked" : "locked"}`); refetch(); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
        setActionsMenuOpenId(null);
    };
    const openEditDescription = (cb: Callback) => { setEditDescriptionCallback(cb); setNewDescription(cb.description || ""); setNewColor(cb.color || ''); setActionsMenuOpenId(null); };
    const __handleSaveDescription = async () => {
        if (!editDescriptionCallback) return;
        try { await updateDescription({ variables: { callback_display_id: editDescriptionCallback.display_id, description: newDescription } }); snackActions.success("Description updated"); refetch(); setEditDescriptionCallback(null); } catch (e: unknown) { snackActions.error(getErrorMessage(e)); }
    };
    const handleExportConfig = async (cb: Callback) => {
        setActionsMenuOpenId(null);
        if (!cb.agent_callback_id) { snackActions.error('No agent_callback_id'); return; }
        try {
            const { data: ed } = await exportConfig({ variables: { agent_callback_id: cb.agent_callback_id } });
            if (ed?.exportCallbackConfig?.status === 'success') {
                const blob = new Blob([JSON.stringify(ed.exportCallbackConfig.config, null, 2)], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cb.agent_callback_id}.json`; a.click(); URL.revokeObjectURL(a.href);
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
        const map = new Map<number, { hasActiveEgress: boolean; isP2POnly: boolean }>();
        const edges = edgesData?.callbackgraphedge || [];
        edges.forEach((edge: CallbackGraphEdge) => {
            [edge.source?.id, edge.destination?.id].filter(Boolean).forEach((id: number) => {
                if (!map.has(id)) map.set(id, { hasActiveEgress: false, isP2POnly: true });
                const entry = map.get(id)!;
                if (!edge.c2profile?.is_p2p && edge.end_timestamp === null) entry.hasActiveEgress = true;
                if (!edge.c2profile?.is_p2p) entry.isP2POnly = false;
            });
        });
        return map;
    }, [edgesData]);

    // ── Per-column filter + sort logic ──
    const filteredData = useMemo(() => {
        let rows = (data?.callback || []).filter((c: Callback) =>
            (showHiddenCallbacks || c.active !== false) && (!hideDead || isCallbackAlive(c)));
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
                    case 'ip': try { av = JSON.parse(a.ip)[0]; bv = JSON.parse(b.ip)[0]; } catch { av = a.ip; bv = b.ip; } break;
                    default: av = (a as any)[sortKey]; bv = (b as any)[sortKey];
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
    }, [data, showHiddenCallbacks, hideDead, columnFilters, sortKey, sortDir]);

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
            const il = c.integrity_level;
            if (il === 4 || il === 'SYSTEM') return 4;
            if (il === 3 || il === 'High') return 3;
            if ((c.user || '').toLowerCase() === 'root' || (c.user || '').toLowerCase().includes('nt authority')) return 4;
            if (il === 2 || il === 'Medium') return 2;
            return 1;
        };
        for (const [hostKey, cbs] of hostMap.entries()) {
            // Sort: alive first → highest privilege → newest
            const sorted = [...cbs].sort((a, b) => {
                const aAlive = a.active !== false && isCallbackAlive(a) ? 1 : 0;
                const bAlive = b.active !== false && isCallbackAlive(b) ? 1 : 0;
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
        return new Set<string>(filteredData.map((c: Callback) => String(c.display_id)));
    }, [columnFilters, filteredData]);

    // ── Column definitions ──
    const ALL_COLS: Record<string, { header: string; filterKey?: string; sortKey?: string; cell?: (row: Callback) => React.ReactNode; accessorKey?: string; className?: string }> = {
        USER: {
            header: "USER", filterKey: 'USER', sortKey: 'user',
            cell: (row: Callback) => (
                <div className="flex items-center gap-2 flex-wrap">
                    <User size={14} className="text-gray-400 shrink-0" />
                    <span className={row.integrity_level > 2 ? 'text-yellow-500 font-bold' : 'text-signal'}>{row.user}</span>
                    {row.impersonation_context && (
                        <span className="text-[10px] text-gray-500 font-mono" title={`Impersonating: ${row.impersonation_context}`}>[{row.impersonation_context}]</span>
                    )}
                    {row.integrity_level > 2 && <Shield size={12} className="text-yellow-500" />}
                </div>
            )
        },
        HOST: { header: "HOST", accessorKey: "host", filterKey: 'HOST', sortKey: 'host' },
        IP: {
            header: "IP", filterKey: 'IP', sortKey: 'ip',
            cell: (row: Callback) => {
                let ips: string[] = [];
                if (Array.isArray(row.ip)) { ips = row.ip; }
                else { try { const parsed = JSON.parse(row.ip); ips = Array.isArray(parsed) ? parsed : [parsed]; } catch { ips = row.ip ? [String(row.ip)] : []; } }
                if (ips.length > 1) return (
                    <button onClick={e => { e.stopPropagation(); setIpSelectCallback(row); }}
                        className="flex items-center gap-1 text-signal hover:underline font-mono text-xs"
                        title={`${ips.length} IPs — click to select primary`}>
                        {ips[0]} <ChevronDown size={10} className="text-gray-500" />
                    </button>
                );
                return <span className="font-mono text-xs">{ips[0] || 'UNKNOWN'}</span>;
            }
        },
        'EXTERNAL IP': {
            header: "EXT IP", filterKey: 'EXTERNAL IP',
            cell: (row: Callback) => <span className="text-gray-400">{row.external_ip || "—"}</span>
        },
        OS: {
            header: "OS", filterKey: 'OS', sortKey: 'os',
            cell: (row: Callback) => (
                <button onClick={e => { e.stopPropagation(); if (row.os) setOsPopupText(row.os); }}
                    className="flex items-center gap-2 text-xs group" title={row.os ? 'Click to view full OS string' : undefined}>
                    {getPlatformIcon(row.os, row.payload?.payloadtype?.name, 14, 'text-gray-300')}
                    <span className="text-gray-400 truncate max-w-[80px] group-hover:text-gray-200 transition-colors">{row.os || '—'}</span>
                </button>
            )
        },
        PID: { header: "PID", accessorKey: "pid", className: "font-mono text-gray-400", filterKey: 'PID', sortKey: 'pid' },
        "LAST CHECKIN": { header: "LAST CHECKIN", sortKey: 'last_checkin', cell: (row: Callback) => <LastCheckinCell lastCheckin={row.last_checkin} agentType={row.payload?.payloadtype?.agent_type} dead={row.dead} /> },
        DESCRIPTION: {
            header: "DESCRIPTION", filterKey: 'DESCRIPTION', sortKey: 'description',
            cell: (row: Callback) => <span className="text-xs text-gray-500 italic truncate max-w-[150px] block" title={row.description}>{row.description || "No description"}</span>
        },
        AGENT: {
            header: "AGENT", filterKey: 'AGENT',
            cell: (row: Callback) => <span className="uppercase text-xs border border-ghost/30 px-2 py-0.5 rounded">{row.payload?.payloadtype?.name}</span>
        },
        DOMAIN: { header: "DOMAIN", filterKey: 'DOMAIN', sortKey: 'domain', cell: (row: Callback) => <span className="text-gray-400">{row.domain || "—"}</span> },
        ARCHITECTURE: { header: "ARCH", filterKey: 'ARCHITECTURE', cell: (row: Callback) => <span className="text-gray-400 uppercase text-xs">{row.architecture || "—"}</span> },
        GROUPS: {
            header: "GROUPS", filterKey: 'GROUPS',
            cell: (row: Callback) => {
                const groups = row.mythictree_groups || [];
                return groups.length > 0
                    ? <div className="flex flex-wrap gap-1">{groups.map((g: string) => <span key={g} className="text-[10px] font-mono px-1.5 py-0.5 bg-signal/10 text-signal border border-signal/20 rounded-sm">{g}</span>)}</div>
                    : <span className="text-gray-600">—</span>;
            }
        },
        SLEEP: {
            header: "SLEEP", filterKey: 'SLEEP',
            cell: (row: Callback) => (
                <button onClick={e => { e.stopPropagation(); setSleepEditCallback(row); setSleepEditValue(row.sleep_info || ''); }}
                    className="flex items-center gap-1.5 group" title="Click to edit sleep info">
                    <Clock size={10} className={row.sleep_info ? 'text-blue-400 group-hover:text-blue-300' : 'text-yellow-500/60 group-hover:text-yellow-400'} />
                    <span className="text-gray-400 text-xs font-mono group-hover:text-gray-200 transition-colors">{row.sleep_info || '—'}</span>
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
                                className={cn('inline-block w-2 h-2 rounded-full shrink-0 mr-0.5',
                                    hasActive ? 'bg-green-400' : (hasEgress ? 'bg-red-500' : 'bg-purple-400'))} />
                        )}
                        {profiles.map((cp: CallbackC2Profile, i: number) => (
                            <span key={i} className={cn("text-[10px] font-mono px-1.5 py-0.5 border rounded-sm",
                                cp.c2profile?.is_p2p ? "border-purple-500/30 text-purple-400 bg-purple-500/10" : "border-blue-500/30 text-blue-400 bg-blue-500/10")}>
                                {cp.c2profile?.name}{cp.c2profile?.is_p2p ? ' (P2P)' : ''}
                            </span>
                        ))}
                        {profiles.length === 0 && <span className="text-gray-500 hover:text-blue-400 transition-colors"><GitBranch size={12} /></span>}
                    </button>
                );
            }
        },
        'PROCESS NAME': {
            header: "PROC", filterKey: 'PROCESS NAME',
            cell: (row: Callback) => <span className="text-gray-400 text-xs font-mono" title={row.process_name || undefined}>{row.process_short_name || row.process_name || '—'}</span>
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
                            className="p-0.5 text-gray-600 hover:text-yellow-400 transition-colors" title="Edit Tags">
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
                <button onClick={e => { e.stopPropagation(); toggleBulkSelect(row.display_id); }} className="text-gray-500 hover:text-signal p-0.5">
                    {bulkSelected.has(row.display_id) ? <CheckSquare size={14} className="text-signal" /> : <Square size={14} />}
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
                                ? 'text-red-500/80 hover:text-red-400'
                                : row.integrity_level > 2
                                    ? 'text-red-500 hover:text-red-400'
                                    : 'text-signal/50 hover:text-signal'
                        )}>
                        {row.locked
                            ? <Lock size={12} />
                            : operatorSettings.interactType === 'console_tab'
                                ? <ExternalLink size={12} />
                                : operatorSettings.interactType === 'new_window'
                                    ? <LayoutGrid size={12} />
                                    : <Terminal size={12} />}
                    </button>
                    {row.dead && <span title="Dead"><Skull size={11} className="text-red-500" /></span>}
                    {!row.dead && !isCallbackAlive(row) && <span title="Not responding"><Skull size={11} className="text-yellow-600 opacity-50" /></span>}
                    <span className={row.active === false ? "text-gray-600" : "text-gray-400"}>#{row.display_id}</span>
                    {row.active === false && <span title="Hidden"><EyeOff size={11} className="text-yellow-500" /></span>}
                    {row.trigger_on_checkin_after_time && <span title="Alert trigger set"><Bell size={9} className="text-orange-400" /></span>}
                    {(row.callbackports || []).length > 0 && (
                        <span title={(row.callbackports).map((p: { port_type: string; local_port: number; remote_port: number; remote_ip: string }) => {
                                const base = `${p.port_type}: ${p.local_port}`;
                                const remote = p.remote_ip ? ` → ${p.remote_ip}:${p.remote_port || '?'}` : '';
                                const creds = p.username ? ` (${p.username}${p.password ? ':' + p.password : ''})` : '';
                                return base + remote + creds;
                            }).join('\n')}
                            className="text-[9px] px-1 border border-cyan-500/40 text-cyan-400 bg-cyan-900/20 rounded-sm font-mono cursor-help flex items-center gap-0.5">
                            <Wifi size={8} className="shrink-0" />
                            {(row.callbackports).some((p: { port_type: string }) => p.port_type === 'socks') ? 'SOCKS' : 'PORT'}
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
                    <button onClick={(e) => handleActionsClick(e, row.id)} className="p-1 hover:text-signal text-gray-500 transition-colors"><MoreVertical size={16} /></button>
                    {actionsMenuOpenId === row.id && createPortal(
                        <div className="fixed z-50 bg-black border border-signal/30 shadow-lg shadow-signal/10 w-64 backdrop-blur-md overflow-y-auto" style={{ top: menuPosition.top, bottom: menuPosition.bottom, left: menuPosition.left, maxHeight: menuPosition.maxH }} onClick={e => e.stopPropagation()}>
                            <div className="px-3 py-2 border-b border-white/10">
                                <div className="text-[10px] font-mono text-gray-500">CALLBACK #{row.display_id}</div>
                                <div className="text-xs text-gray-300">{row.user}@{row.host}</div>
                            </div>
                            <div className="p-1 flex flex-col">
                                {/* ── TASKING VIEWS ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Tasking Views</div>
                                <button onClick={() => { navigate(`/console/${row.display_id}`); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Terminal size={14} /> Interact (Console)</button>
                                <button onClick={() => { window.open(`/console/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><ExternalLink size={14} /> Console (New Tab)</button>
                                <button onClick={() => { setSplitCallbackRow(row); setSplitSecondId(null); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-cyan-400 transition-colors"><SplitSquareHorizontal size={14} className="text-cyan-500" /> Split Console</button>
                                <button onClick={() => { window.open(`/new/callbacks/${row.display_id}`, '_blank'); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><LayoutGrid size={14} /> Expand Callback</button>
                                <div className="h-px bg-white/10 my-1" />
                                <button onClick={() => openEditDescription(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Edit size={14} /> Edit Description</button>
                                <button onClick={() => handleLockToggle(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors">
                                    {row.locked ? <Unlock size={14} /> : <Lock size={14} />} {row.locked ? `Unlock (${operatorSettings.hideOperatorNames ? '\u2022\u2022\u2022' : (row.locked_operator?.username || '?')})` : "Lock"}
                                </button>
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── BROWSERS ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Browsers</div>
                                <button onClick={() => { navigate(`/console/${row.display_id}?tab=files`); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Folder size={14} /> File Browser</button>
                                <button onClick={() => { navigate(`/console/${row.display_id}?tab=process`); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><FolderSearch size={14} /> Process Browser</button>
                                {customBrowsers.map((cb_: Callback) => (
                                    <button key={cb_.id} onClick={() => { navigate(`/console/${row.display_id}?tab=custom_browser&name=${encodeURIComponent(cb_.name)}`); setActionsMenuOpenId(null); }}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><List size={14} /> {cb_.name}</button>
                                ))}
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── METADATA ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Metadata</div>
                                <button onClick={() => { setDetailCallbackId(row.id); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Info size={14} /> View Details</button>
                                <button onClick={() => handleExportConfig(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Download size={14} /> Export Config</button>
                                <button onClick={() => { navigator.clipboard.writeText(row.agent_callback_id || ''); snackActions.success('UUID copied'); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Copy size={14} /> Copy UUID</button>
                                <button onClick={() => { setSleepEditCallback(row); setSleepEditValue(row.sleep_info || ''); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Clock size={14} /> Edit Sleep Info</button>
                                <button onClick={() => { setAlertTriggerCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors">
                                    {row.trigger_on_checkin_after_time ? <><BellOff size={14} className="text-orange-400" /> Remove Alert Trigger</> : <><Bell size={14} /> Set Alert Trigger</>}
                                </button>
                                <button onClick={() => { setShowEventingDialog(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-purple-400 transition-colors"><Zap size={14} className="text-purple-400" /> Trigger Eventing</button>
                                <button onClick={() => { setShowOpenMultiple(true); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Layers size={14} /> Other Callbacks…</button>
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── BULK ACTIONS ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Bulk Actions</div>
                                <button onClick={() => { toggleBulkSelect(row.display_id); setPanelTab('BULK'); setShowPanel(true); setActionsMenuOpenId(null); }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors">
                                    {bulkSelected.has(row.display_id) ? <CheckSquare size={14} className="text-signal" /> : <Square size={14} />} {bulkSelected.has(row.display_id) ? 'Deselect for Bulk' : 'Select for Bulk'}
                                </button>
                                <button onClick={() => { setShowTaskMultiple(true); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-blue-400 transition-colors"><Terminal size={14} className="text-blue-400" /> Task Multiple…</button>
                                <button onClick={() => { setShowBulkEventingDialog(true); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-purple-400 transition-colors"><Zap size={14} className="text-purple-400" /> Start Eventing (Multiple)…</button>
                                <div className="h-px bg-white/10 my-1" />
                                {/* ── CUSTOMIZATION ── */}
                                <div className="px-3 py-1 text-[10px] font-mono text-gray-600 uppercase">Customization</div>
                                <button onClick={() => { setColorEditCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Palette size={14} /> Set Row Color</button>
                                <button onClick={() => { setIpSelectCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Globe size={14} /> Select Primary IP</button>
                                <button onClick={() => { setModifyGroupsCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-signal transition-colors"><Layers size={14} /> Modify Groups</button>
                                <button onClick={() => { setC2PathCallback(row); setActionsMenuOpenId(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-xs text-gray-300 hover:text-blue-400 transition-colors"><GitBranch size={14} className="text-blue-400" /> View C2 Path</button>
                                <div className="h-px bg-white/10 my-1" />
                                <button onClick={() => handleExitCallback(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-orange-900/30 text-xs text-orange-400 hover:text-orange-300 transition-colors"><XCircle size={14} /> Exit Callback</button>
                                <div className="h-px bg-white/10 my-1" />
                                {row.active === false ? (
                                    <button onClick={() => handleShow(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-green-900/30 text-xs text-green-400 hover:text-green-300 transition-colors"><Eye size={14} /> Show Callback</button>
                                ) : (
                                    <button onClick={() => handleHide(row)} className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/30 text-xs text-red-400 hover:text-red-300 transition-colors"><EyeOff size={14} /> Hide Callback</button>
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
            <div className={cn("transition-all duration-300 p-6 lg:p-12 h-screen flex flex-col overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                <header className="flex justify-between items-center mb-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded"><Activity size={24} className="text-white" /></div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">ACTIVE CALLBACKS</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                ACTIVE AGENTS
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-6 text-sm font-mono items-center">
                        <button onClick={() => setShowSettingsModal(true)} title="Display settings"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-ghost/30 rounded transition-colors">
                            <Settings size={12} /> SETTINGS
                        </button>
                        <button onClick={() => setShowImportConfig(true)} title="Import Callback Config from another Mythic server"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-ghost/30 rounded transition-colors">
                            <Upload size={12} /> IMPORT
                        </button>
                        <div className="text-right border-l border-ghost/20 pl-6">
                            <div className="text-gray-400">TOTAL_AGENTS</div>
                            <div className="text-xl text-signal">{data?.callback?.length || 0}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-gray-400">HIGH_INTEGRITY</div>
                            <div className="text-xl text-yellow-500">{data?.callback?.filter((c: Callback) => c.integrity_level > 2).length || 0}</div>
                        </div>
                    </div>
                </header>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex-1 h-full min-h-0 flex flex-col gap-6">
                    {/* Graph View */}
                    <div className="h-[60%] min-h-[400px] border-b border-ghost/20 pb-6">
                        <div className="flex items-center gap-2 mb-2 text-xs font-mono text-gray-400"><Network size={14} className="text-signal" /><span>NETWORK_TOPOLOGY</span></div>
                        <CallbackGraph filterCallbackIds={filteredCallbackIds} />
                    </div>
                    {/* Table View */}
                    <div className="flex-1 min-h-0 overflow-auto">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                                <List size={14} className="text-signal" /><span>AGENT_LIST</span>
                                {showHiddenCallbacks && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded">SHOWING HIDDEN</span>}
                                {panelTab === 'BULK' && showPanel && bulkSelected.size > 0 && <span className="px-2 py-0.5 bg-signal/20 text-signal text-[10px] rounded">{bulkSelected.size} SELECTED</span>}
                                {Object.values(columnFilters).some(v => v.trim()) && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded"><Filter size={10} className="inline mr-1" />FILTERED</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", showFilters ? "bg-purple-500/20 text-purple-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")} title="Per-column filters">
                                    <Filter size={12} /><span>FILTER</span>
                                </button>
                                <button onClick={() => setGroupByHost(!groupByHost)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", groupByHost ? "bg-signal/20 text-signal hover:bg-signal/30" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")} title={groupByHost ? "Show all callbacks individually" : "Group callbacks by host"}>
                                    <Layers size={12} /><span>{groupByHost ? "GROUPED" : "GROUP"}</span>
                                </button>
                                <button onClick={() => setHideDead(!hideDead)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", hideDead ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")} title={hideDead ? "Show dead sessions" : "Hide dead sessions"}>
                                    <Skull size={12} /><span>{hideDead ? "SHOWING_DEAD" : "HIDE_DEAD"}</span>
                                </button>
                                <button onClick={() => setShowHiddenCallbacks(!showHiddenCallbacks)} className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-mono transition-colors rounded", showHiddenCallbacks ? "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30" : "text-gray-500 hover:text-gray-300 hover:bg-white/5")}>
                                    {showHiddenCallbacks ? <Eye size={12} /> : <EyeOff size={12} />}
                                    <span>{showHiddenCallbacks ? "HIDE_INACTIVE" : "SHOW_HIDDEN"}</span>
                                </button>
                                <div className="flex items-center border border-ghost/30 rounded overflow-hidden">
                                    <button onClick={() => { setPanelTab('BULK'); setShowPanel(p => panelTab === 'BULK' ? !p : true); }} className={cn("px-2 py-1 text-[11px] font-mono transition-colors", showPanel && panelTab === 'BULK' ? "bg-signal/20 text-signal" : "text-gray-500 hover:text-gray-300")}>BULK</button>
                                    <div className="w-px h-4 bg-ghost/30" />
                                    <button onClick={() => { setPanelTab('COLS'); setShowPanel(p => panelTab === 'COLS' ? !p : true); }} className={cn("flex items-center gap-1 px-2 py-1 text-[11px] font-mono transition-colors", showPanel && panelTab === 'COLS' ? "bg-signal/20 text-signal" : "text-gray-500 hover:text-gray-300")}><Columns size={11} /> COLS</button>
                                </div>
                            </div>
                        </div>
                        {/* Per-column filter row */}
                        {showFilters && (
                            <div className="mb-2 border border-purple-500/20 bg-void/80 p-2 flex flex-wrap gap-2">
                                {TOGGLEABLE_COLS.filter(k => visibleCols.has(k) && ALL_COLS[k].filterKey).map(k => (
                                    <div key={k} className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-mono text-gray-600 uppercase">{k}</span>
                                        <ColumnFilterInput value={columnFilters[k] || ''} onChange={v => setColFilter(k, v)} />
                                    </div>
                                ))}
                                {Object.values(columnFilters).some(v => v.trim()) && (
                                    <button onClick={() => setColumnFilters({})} className="self-end text-[10px] font-mono text-gray-500 hover:text-red-400 px-2 py-1 border border-white/10 hover:border-red-500/30 transition-colors">CLEAR ALL</button>
                                )}
                            </div>
                        )}
                        {/* COLS / BULK panel */}
                        {showPanel && (
                            <div className="mb-2 border border-ghost/30 bg-void/80 p-3 text-xs font-mono">
                                {panelTab === 'COLS' && (
                                    <>
                            <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-2">Visible Columns <span className="text-gray-700">(drag to reorder)</span></p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
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
                                                        "flex items-center gap-2 cursor-grab transition-colors text-gray-400 w-32 px-1 py-0.5 rounded border",
                                                        dragCol === key && "opacity-40",
                                                        dropCol === key && dragCol !== key
                                                            ? "border-signal/60 bg-signal/10 text-signal"
                                                            : "border-transparent hover:text-signal"
                                                    )}>
                                                    <button onClick={() => toggleCol(key)} className="shrink-0">
                                                        {visibleCols.has(key) ? <CheckSquare size={13} className="text-signal" /> : <Square size={13} className="text-gray-600" />}
                                                    </button>
                                                    <span className="uppercase text-[11px]">{key}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-2 flex justify-end">
                                            <button onClick={() => { setVisibleCols(new Set(DEFAULT_VISIBLE)); setColumnOrder([...TOGGLEABLE_COLS]); }}
                                                className="text-[10px] font-mono text-gray-600 hover:text-orange-400 border border-ghost/20 hover:border-orange-500/30 px-2 py-0.5 transition-colors">
                                                RESET TO DEFAULTS
                                            </button>
                                        </div>
                                    </>
                                )}
                                {panelTab === 'BULK' && (
                                    <>
                                        <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-2">Bulk Actions</p>
                                        <p className="text-gray-500 mb-2">{bulkSelected.size} selected</p>
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={() => { const shown = filteredData; setBulkSelected(new Set(shown.map((c: Callback) => c.display_id))); }} className="px-2 py-1 border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/40 transition-colors">SELECT ALL</button>
                                            <button onClick={() => setBulkSelected(new Set())} className="px-2 py-1 border border-ghost/30 text-gray-400 hover:text-signal hover:border-signal/40 transition-colors">CLEAR</button>
                                            <button disabled={bulkSelected.size === 0} onClick={handleBulkHide} className="px-2 py-1 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-30">HIDE SELECTED</button>
                                            <button disabled={bulkSelected.size === 0} onClick={() => setShowTaskMultiple(true)}
                                                className="flex items-center gap-1.5 px-2 py-1 border border-blue-500/40 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-30">
                                                <Terminal size={11} /> TASK MULTIPLE
                                            </button>
                                            <button disabled={bulkSelected.size === 0} onClick={() => setShowBulkEventingDialog(true)}
                                                className="flex items-center gap-1.5 px-2 py-1 border border-purple-500/40 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-30">
                                                <Zap size={11} /> TRIGGER EVENTING
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Tasking Context Bar */}
                        {selectedCallbackId && (operatorSettings.taskingContextFields?.length ?? 0) > 0 && (() => {
                            const selCb = filteredData.find((r: Callback) => r.id === selectedCallbackId);
                            if (!selCb) return null;
                            const tryParseIP = (ip: string) => { try { const p = JSON.parse(ip); return Array.isArray(p) ? p.join(', ') : ip; } catch { return ip; } };
                            const fieldLabel: Record<string, string> = { user:'USER', host:'HOST', ip:'IP', pid:'PID', cwd:'CWD', impersonation_context:'IMPERSONATION', architecture:'ARCH', process_short_name:'PROC', extra_info:'EXTRA' };
                            return (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 border-b border-signal/10 bg-signal/5 text-[10px] font-mono">
                                    <span className="text-signal/50 uppercase tracking-widest shrink-0">CTX#{(selCb as any).display_id}</span>
                                    {operatorSettings.taskingContextFields.map(field => {
                                        let val = (selCb as any)[field] ?? '—';
                                        if (field === 'ip') val = tryParseIP(val);
                                        if (!val || val === '—') return null;
                                        return (
                                            <span key={field} className="flex items-center gap-1">
                                                <span className="text-gray-600">{fieldLabel[field] ?? field.toUpperCase()}:</span>
                                                <span className="text-gray-300">{String(val)}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        <CyberTable
                            data={displayData}
                            columns={columns as any}
                            isLoading={loading}
                            onRowClick={(row: Callback) => {
                                // If this is a group header with children, toggle expand on the group indicator area
                                handleRowClick(row);
                            }}
                            onRowDoubleClick={handleRowDoubleClick}
                            getRowColor={(row: Callback) => {
                                if (row._isChildRow) return '#1a2a3a';
                                if (row.id === selectedCallbackId) return '#22c55e';
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
                                        <span className="inline-flex items-center pl-3 pr-1 text-gray-600">
                                            <span className="border-l border-gray-700 h-4 mr-2" />
                                            <span className="text-[9px] font-mono text-gray-600">└</span>
                                        </span>
                                    );
                                }
                                if (row._totalSessions > 1) {
                                    return (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleHostExpand(row._hostKey); }}
                                            className="inline-flex items-center gap-1 pr-1 text-gray-400 hover:text-signal transition-colors"
                                            title={`${row._totalSessions} sessions on this host`}
                                        >
                                            <ChevronRight size={12} className={cn("transition-transform", expandedHosts.has(row._hostKey) && "rotate-90")} />
                                            <span className="text-[9px] font-mono bg-signal/10 text-signal/80 px-1 rounded">{row._totalSessions}</span>
                                        </button>
                                    );
                                }
                                return null;
                            } : undefined}
                        />
                    </div>
                </motion.div>
            </div>
            {/* Edit Description Modal */}
            <AnimatePresence>
                {editDescriptionCallback && (
                    <CyberModal title="EDIT_DESCRIPTION" onClose={() => setEditDescriptionCallback(null)} icon={<Edit />}>
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-mono text-gray-500">DESCRIPTION</label>
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
                                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-gray-600 hover:text-signal border border-ghost/20 hover:border-signal/30 transition-colors"
                                        title="Auto-format if valid JSON"
                                    >
                                        <FileText size={9} /> FORMAT JSON
                                    </button>
                                </div>
                                <textarea
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-y min-h-[60px] max-h-[200px]"
                                    autoFocus
                                    rows={3}
                                />
                                {/* JSON syntax highlight preview */}
                                {newDescription && (newDescription.trimStart().startsWith('{') || newDescription.trimStart().startsWith('[')) && (() => {
                                    let valid = false;
                                    try { JSON.parse(newDescription); valid = true; } catch {}
                                    if (valid) return (
                                        <div className="mt-1.5">
                                            <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">JSON PREVIEW</div>
                                            <JsonHighlight value={newDescription} />
                                        </div>
                                    );
                                    return <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-red-400/60"><XCircle size={10} /> Invalid JSON</div>;
                                })()}
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">ROW COLOR (optional)</label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {COLOR_PRESETS.map(c => (
                                        <button key={c || 'none'} onClick={() => setNewColor(c || '')}
                                            className={cn('w-6 h-6 rounded border transition-all hover:scale-110',
                                                newColor === (c || '') ? 'border-signal ring-1 ring-signal/50 scale-110' : 'border-white/20')}
                                            style={{ backgroundColor: c || 'transparent' }}
                                            title={c || 'Clear color'}>
                                            {!c && <X size={12} className="text-gray-500 m-auto" />}
                                        </button>
                                    ))}
                                    <input type="color" value={newColor || '#1a1a1a'} onChange={e => setNewColor(e.target.value)}
                                        className="w-7 h-7 rounded border border-white/20 cursor-pointer bg-transparent" title="Custom color" />
                                    {newColor && (
                                        <span className="text-[10px] font-mono text-signal">{newColor}</span>
                                    )}
                                </div>
                            </div>
                            {/* Color preview — dark + light mode */}
                            {newColor && (
                                <div className="space-y-1">
                                    <label className="text-[9px] font-mono text-gray-600 uppercase tracking-widest">Color Preview</label>
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
                                <button onClick={() => setEditDescriptionCallback(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={() => handleSaveDescriptionAndColor(newDescription, newColor)} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
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
                            <p className="text-xs text-gray-400 font-mono">
                                Primary: <span className="text-signal">#{splitCallbackRow.display_id}</span>
                                <span className="text-gray-500 ml-2">{splitCallbackRow.user}@{splitCallbackRow.host}</span>
                            </p>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">SELECT_SECOND_CALLBACK</label>
                                <div className="grid gap-1 max-h-48 overflow-y-auto border border-gray-800 p-2 bg-black/30 cyber-scrollbar">
                                    {(data?.callback || [])
                                        .filter((c: Callback) => c.id !== splitCallbackRow.id && c.active !== false)
                                        .map((c: Callback) => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSplitSecondId(c.display_id)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors',
                                                splitSecondId === c.display_id
                                                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            )}
                                        >
                                            <Monitor size={12} className="shrink-0" />
                                            <span>#{c.display_id}</span>
                                            <span className="text-gray-500">{c.user}@{c.host}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSplitCallbackRow(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
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
                                    className="px-4 py-2 border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500 font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <SplitSquareHorizontal size={12} className="inline mr-1.5" />OPEN_SPLIT
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
                                <label className="block text-xs font-mono text-gray-500 mb-1">SLEEP INFO (Callback #{sleepEditCallback.display_id})</label>
                                <input type="text" value={sleepEditValue} onChange={e => setSleepEditValue(e.target.value)}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                                    placeholder="e.g. 10s, 30s with 20% jitter"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveSleep(); }}
                                />
                            </div>
                            <p className="text-[10px] font-mono text-amber-400/70 border border-amber-500/20 bg-amber-900/10 px-2 py-1 rounded">
                                ⚠ This does not task the agent — it only updates the alive/dead tracking threshold in Mythic.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setSleepEditCallback(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button onClick={handleSaveSleep} className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors">SAVE</button>
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
                            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Full OS String</div>
                            <pre className="bg-black/50 border border-white/10 rounded p-3 text-signal/90 font-mono text-xs break-all whitespace-pre-wrap select-all">{osPopupText}</pre>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => { navigator.clipboard.writeText(osPopupText); snackActions.success('Copied'); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-ghost/30 text-gray-400 hover:text-white hover:border-signal/50 transition-colors"><Copy size={12} /> COPY</button>
                                <button onClick={() => setOsPopupText(null)} className="px-4 py-1.5 text-xs font-mono bg-signal text-void font-bold hover:bg-white transition-colors">CLOSE</button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Column Header Right-click Menu */}
            {headerMenu && createPortal(
                <div className="fixed z-[9990] bg-black border border-signal/30 shadow-xl w-64 backdrop-blur-md rounded-sm"
                    style={{ top: headerMenu.y, left: headerMenu.x }}
                    onClick={e => e.stopPropagation()}>
                    <div className="px-3 py-2 border-b border-white/10">
                        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">COLUMN: {headerMenu.col.header}</div>
                    </div>
                    <div className="p-2 space-y-2">
                        <div className="text-[10px] font-mono text-gray-500 uppercase">Filter Column</div>
                        <div className="flex gap-1">
                            <input
                                autoFocus
                                type="text"
                                value={headerFilterInput}
                                onChange={e => setHeaderFilterInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { setColFilter(headerMenu.col.filterKey, headerFilterInput); setHeaderMenu(null); } if (e.key === 'Escape') setHeaderMenu(null); }}
                                className="flex-1 bg-black/60 border border-ghost/40 text-signal text-xs font-mono px-2 py-1 focus:border-signal/50 outline-none"
                                placeholder="Filter value..."
                            />
                            <button onClick={() => { setColFilter(headerMenu.col.filterKey, headerFilterInput); setHeaderMenu(null); }}
                                className="px-2 py-1 bg-signal/20 border border-signal/40 text-signal hover:bg-signal/30 text-xs font-mono transition-colors">SET</button>
                        </div>
                        {columnFilters[headerMenu.col.filterKey] && (
                            <button onClick={() => { setColFilter(headerMenu.col.filterKey, ''); setHeaderMenu(null); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-red-400 hover:bg-red-900/20 border border-red-500/20 transition-colors">
                                <X size={10} /> Clear Filter for this column
                            </button>
                        )}
                        <div className="h-px bg-white/10" />
                        {headerMenu.col.sortKey && (
                            <button onClick={() => { setSortKey(headerMenu.col.sortKey); setSortDir('ASC'); setHeaderMenu(null); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-gray-400 hover:bg-white/5 transition-colors">
                                Sort ASC
                            </button>
                        )}
                        {headerMenu.col.sortKey && (
                            <button onClick={() => { setSortKey(headerMenu.col.sortKey); setSortDir('DESC'); setHeaderMenu(null); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-gray-400 hover:bg-white/5 transition-colors">
                                Sort DESC
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
                                <div className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">INTERACT_TYPE</div>
                                <div className="text-[10px] text-gray-600 font-mono">How rows and the Interact button open callbacks</div>
                                <div className="flex gap-2">
                                    {([
                                        { value: 'console', label: 'CONSOLE', icon: <Terminal size={12} /> },
                                        { value: 'console_tab', label: 'NEW_TAB', icon: <ExternalLink size={12} /> },
                                        { value: 'new_window', label: 'SPLIT_WIN', icon: <LayoutGrid size={12} /> },
                                    ] as const).map(({ value: v, label: lbl, icon }) => (
                                        <button
                                            key={v}
                                            onClick={() => setOperatorSettings(s => ({ ...s, interactType: v }))}
                                            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 border rounded text-xs font-mono transition-colors ${
                                                operatorSettings.interactType === v
                                                    ? 'bg-signal/20 border-signal/60 text-signal'
                                                    : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/70'
                                            }`}
                                        >
                                            {icon}{lbl}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Hide Operator Names */}
                            <div className="flex items-center justify-between py-2 border-t border-white/5">
                                <div>
                                    <div className="text-[11px] font-mono text-gray-300">HIDE_OPERATOR_NAMES</div>
                                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">Mask usernames in lock / ownership displays</div>
                                </div>
                                <button
                                    onClick={() => setOperatorSettings(s => ({ ...s, hideOperatorNames: !s.hideOperatorNames }))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-mono transition-colors ${
                                        operatorSettings.hideOperatorNames
                                            ? 'bg-signal/20 border-signal/60 text-signal'
                                            : 'bg-black border-white/10 text-gray-500 hover:border-signal/30'
                                    }`}
                                >
                                    {operatorSettings.hideOperatorNames ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            {/* Font Size / Row Height */}
                            <div className="py-2 border-t border-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-[11px] font-mono text-gray-300">ROW_FONT_SIZE</div>
                                        <div className="text-[10px] text-gray-600 font-mono mt-0.5">Controls table row height and text size</div>
                                    </div>
                                    <span className="text-signal font-mono text-xs">{operatorSettings.fontSize}px</span>
                                </div>
                                <input
                                    type="range" min={10} max={18} step={1}
                                    value={operatorSettings.fontSize}
                                    onChange={e => setOperatorSettings(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                                    className="w-full accent-signal"
                                />
                                <div className="flex justify-between text-[9px] font-mono text-gray-600 mt-1">
                                    <span>10</span><span>12</span><span>14</span><span>16</span><span>18</span>
                                </div>
                            </div>

                            {/* Tasking Context Fields */}
                            <div className="py-2 border-t border-white/5">
                                <div className="text-[11px] font-mono text-gray-300 mb-1">TASKING_CONTEXT_FIELDS</div>
                                <div className="text-[10px] text-gray-600 font-mono mb-2">Fields shown in the tasking context bar when a callback is selected</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {['user', 'host', 'ip', 'pid', 'cwd', 'impersonation_context', 'architecture', 'process_short_name', 'extra_info'].map(field => {
                                        const active = (operatorSettings.taskingContextFields || []).includes(field);
                                        return (
                                            <button key={field}
                                                onClick={() => setOperatorSettings(s => {
                                                    const cur = s.taskingContextFields || [];
                                                    return { ...s, taskingContextFields: active ? cur.filter(f => f !== field) : [...cur, field] };
                                                })}
                                                className={`px-2 py-0.5 text-[10px] font-mono border rounded-sm transition-colors ${active ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                                            >
                                                {field}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Filter Persistence / Settings Sync */}
                            <div className="border-t border-white/5 pt-3">
                                <div className="text-[10px] font-mono text-gray-600 space-y-1">
                                    <div className="flex items-center gap-1.5 text-signal/50"><CheckSquare size={10} /> Column filters persist across sessions (local)</div>
                                    <div className="flex items-center gap-1.5 text-signal/50"><CheckSquare size={10} /> Column visibility persists across sessions (local)</div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <button onClick={() => {
                                            const exp = { visibleCols: [...visibleCols], columnOrder, columnFilters, operatorSettings };
                                            const a = document.createElement('a');
                                            a.download = 'minerva_settings.json';
                                            a.href = URL.createObjectURL(new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' }));
                                            a.click(); URL.revokeObjectURL(a.href);
                                        }} className="flex items-center gap-1.5 px-2 py-1 border border-white/10 hover:border-signal/30 text-gray-500 hover:text-signal rounded transition-colors">
                                            <Download size={10} /> EXPORT_SETTINGS
                                        </button>
                                        <label className="flex items-center gap-1.5 px-2 py-1 border border-white/10 hover:border-signal/30 text-gray-500 hover:text-signal rounded transition-colors cursor-pointer">
                                            <Upload size={10} /> IMPORT_SETTINGS
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
                                        <button onClick={() => { localStorage.removeItem('minerva_cb_col_filters'); setColumnFilters({}); }} className="flex items-center gap-1.5 px-2 py-1 mt-0 border border-white/10 hover:border-red-500/30 text-gray-500 hover:text-red-400 rounded transition-colors">
                                            <X size={10} /> CLEAR_SAVED_FILTERS
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
