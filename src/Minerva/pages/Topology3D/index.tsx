import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import type { Callback, CallbackGraphEdge } from '../../types/callbacks';
import { ACESFilmicToneMapping, Vector3 } from 'three';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { useMutation, useLazyQuery, useSubscription, useReactiveVar, useApolloClient } from "@apollo/client/react";
import { meState } from '../../lib/state';
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal,
    Eye,
    Info,
    Settings,
    Plus,
    Monitor,
    Shield,
    Zap,
    Network,
    RefreshCw,
    Lock,
    EyeOff,
    Edit,
    Box as BoxIcon,
    GitBranch,
    Link2,
    Trash2,
    Cable,
}from 'lucide-react';
import { useAppStore } from '../../store';
import { cn, getErrorMessage, isCallbackAlive } from '../../lib/utils';
import { useMsfSyntheticCallbacks, MSF_DISPLAY_ID_OFFSET, isMsfCallback, subscribeMsfNewSession, pickMsfHost } from '../Callbacks/msfSyntheticCallbacks';
import * as mythicKV from '../../lib/mythicKVStore';
import { snackActions } from '../../lib/snackbar';
import {
    GET_CALLBACKS,
    GET_CALLBACK_GRAPH_EDGES,
    GET_P2P_PROFILES_AND_CALLBACKS,
    GET_C2_PROFILES,
    GET_CUSTOM_GRAPH_NODES,
    CREATE_CUSTOM_GRAPH_NODE,
    UPDATE_CUSTOM_GRAPH_NODE,
    DELETE_CUSTOM_GRAPH_NODE,
    GET_CUSTOM_GRAPH_EDGES,
    CREATE_CUSTOM_GRAPH_EDGE,
    DELETE_CUSTOM_GRAPH_EDGE,
    HIDE_CALLBACK_MUTATION,
    LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION,
    CREATE_TASK_MUTATION,
    GET_LINK_COMMANDS_FOR_CALLBACK,
    ADD_EDGE_MUTATION,
    REMOVE_EDGE_MUTATION,
    GET_LINK_FOCUS,
    SET_LINK_FOCUS,
    CLEAR_LINK_FOCUS,
    CALLBACKPORT_STREAM,
}from '../../lib/api';
import type { CallbackPort } from '../../types/tunnels';
import { TunnelLayer, TunnelLayerLegend } from './TunnelLayer';
import {
    parseAgentStorageResults,
    prepareCreateNodeData,
    prepareUpdateNodeData,
    generateNextId,
    generateUniqueId,
    parseEdgeStorageResults,
    serializeEdgeData,
    generateEdgeUniqueId,
}from '../../lib/customGraphNodeService';
import { MythicDialog } from '../../components/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { CyberModal } from '../../components/CyberModal';
import type { TopoNode, QuickHackExecution } from '../../types/topology';
import { QuickHackDef, QuickHackStep, useQuickHacks, hackNeedsInput, resolveParams, getHackSteps, extractAllIPs, isMinervaAction, parseMinervaAction, isHackCompatible } from '../../lib/quickhacks';
import { msfSessionIdOf } from '../Callbacks/msfSyntheticCallbacks';
import { MsfSocksDialog } from '../Callbacks/MsfSocksDialog';
import { playThreeLoad, playSelectQH, playDoneQH } from '../../lib/soundEffects';
import { BG_COLOR, buildTopology, extractPrimaryIP } from './topology';
import { QuickHackOverlayWrapper, QuickHackSubscriptionMonitor, NodeFollower } from './QuickHack';
import { ContextMenu3D, BackgroundContextMenu3D, SubnetContextMenu3D, DetailPanel, StatsHUD, ScreenProjector, TopologyScene } from './DetailPanel';
import { Html } from '@react-three/drei';
import { QuickHackPanel, QuickHackAgentPicker, IPSelectionMenu } from './QuickHack';
import { Topology3DModals } from './Topology3DModals';
import { usePageVisible } from '../../lib/usePageVisible';

export default function Topology3D() {
    const navigate = useNavigate();
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const { hacks: quickHacks } = useQuickHacks();

    const pageVisible = usePageVisible();

    // Current operation scopes custom nodes/edges — items belonging to other
    // ops are filtered out, legacy items (no operation_id) get adopted by the
    // current op on first edit.
    const me = useReactiveVar(meState);
    const apolloClient = useApolloClient();
    const currentOpId: number = (me?.user?.current_operation_id as number) ?? 0;

    // Play 3D loading sound on mount
    useEffect(() => { playThreeLoad(); }, []);

    // ── Data fetching (matching 2D CallbackGraph queries) ──
    const { data: callbacksData, refetch: refetchCallbacks } = useQuery<any>(GET_CALLBACKS, { variables: { limit: 5000 }, pollInterval: pageVisible ? 10000 : 0 });
    const { data: edgesData, loading: edgesLoading, refetch: refetchEdges } = useQuery<any>(GET_CALLBACK_GRAPH_EDGES, { pollInterval: pageVisible ? 10000 : 0 });
    // Mirror the latest edges array into a ref so the dispatcher (whose
    // closure is created on createTask/apolloClient changes only) can
    // see the current edge list without forcing a rebind.
    useEffect(() => {
        currentEdgesRef.current = edgesData?.callbackgraphedge ?? [];
    }, [edgesData]);
    const { data: customNodesData, refetch: refetchCustomNodes } = useQuery<any>(GET_CUSTOM_GRAPH_NODES);
    const { data: customEdgesData, refetch: refetchCustomEdges } = useQuery<any>(GET_CUSTOM_GRAPH_EDGES);
    const { data: linkFocusData } = useQuery<any>(GET_LINK_FOCUS, { pollInterval: pageVisible ? 10000 : 0 });

    // Live tunnel ports — only subscribed while page is visible.
    useSubscription<any>(CALLBACKPORT_STREAM, {
        skip: !pageVisible,
        fetchPolicy: 'no-cache',
        onData: ({ data }: any) => {
            const incoming: CallbackPort[] = data?.data?.callbackport_stream || [];
            if (!incoming.length) return;
            setTunnelPorts(prev => {
                const next = [...prev];
                incoming.forEach(cur => {
                    const idx = next.findIndex(p => p.id === cur.id);
                    if (idx > -1) next[idx] = cur;
                    else            next.unshift(cur);
                });
                return next;
            });
        },
    });

    const [hideCallback] = useMutation<any>(HIDE_CALLBACK_MUTATION, {
        onCompleted: (d: any) => {
            if (d.updateCallback?.status === 'success') {
                snackActions.success('Callback hidden');
                refetchCallbacks();
                refetchEdges();
            } else {
                snackActions.error(d.updateCallback?.error || 'Failed');
            }
        },
    });
    const [lockCallback] = useMutation<any>(LOCK_CALLBACK_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Lock state updated') : snackActions.error(d.updateCallback?.error || 'Failed'),
    });
    const [updateDescription] = useMutation<any>(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [addEdge] = useMutation<any>(ADD_EDGE_MUTATION);
    const [removeEdge] = useMutation<any>(REMOVE_EDGE_MUTATION);
    const [createTask] = useMutation<any>(CREATE_TASK_MUTATION);
    const [createCustomNodeMutation] = useMutation<any>(CREATE_CUSTOM_GRAPH_NODE);
    const [updateCustomNodeMutation] = useMutation<any>(UPDATE_CUSTOM_GRAPH_NODE);
    const [deleteCustomNodeMutation] = useMutation<any>(DELETE_CUSTOM_GRAPH_NODE);
    const [createCustomEdgeMutation] = useMutation<any>(CREATE_CUSTOM_GRAPH_EDGE);
    const [deleteCustomEdgeMutation] = useMutation<any>(DELETE_CUSTOM_GRAPH_EDGE);
    const [setLinkFocusMutation] = useMutation<any>(SET_LINK_FOCUS);
    const [clearLinkFocusMutation] = useMutation<any>(CLEAR_LINK_FOCUS);

    const { data: p2pData, refetch: refetchP2P } = useQuery<any>(GET_P2P_PROFILES_AND_CALLBACKS, { fetchPolicy: 'network-only' });
    const { data: allC2Data, refetch: refetchAllC2 } = useQuery<any>(GET_C2_PROFILES, { fetchPolicy: 'network-only' });
    const [getLinkCommands, { data: linkCommandsData, loading: linkCommandsLoading }] = useLazyQuery<any>(GET_LINK_COMMANDS_FOR_CALLBACK, { fetchPolicy: 'network-only' });

    // ── State ──
    const [showInactive, setShowInactive] = useState(true);
    const [showHidden, setShowHidden] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
    /** Right-click on a subnet volume → per-CIDR action menu. */
    const [subnetCtxMenu, setSubnetCtxMenu] = useState<{ x: number; y: number; cidr: string } | null>(null);
    /** CIDRs the operator has chosen to hide. Stored per session — not
     *  persisted across reloads, matching how the global "show subnets"
     *  toggle behaves. Cleared by the "Restore Hidden Network Spaces"
     *  background-menu entry. */
    const [hiddenSubnets, setHiddenSubnets] = useState<Set<string>>(() => new Set());
    const [createCustomNodeModal, setCreateCustomNodeModal] = useState(false);
    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const [showSubnets, setShowSubnets] = useState(true);
    const [showTunnels, setShowTunnels] = useState(true);
    const [tunnelPorts, setTunnelPorts] = useState<CallbackPort[]>([]);
    const [selectedTunnelPortId, setSelectedTunnelPortId] = useState<number | null>(null);
    const [showToolMenu, setShowToolMenu] = useState(false);
    const toolMenuRef = useRef<HTMLDivElement>(null);

    // ── Modal/Dialog State ──
    const [editDescriptionModal, setEditDescriptionModal] = useState<Callback | null>(null);
    const [newDescription, setNewDescription] = useState('');
    const [detailsModal, setDetailsModal] = useState<Callback | null>(null);
    const [setParentModal, setSetParentModal] = useState<Callback | null>(null);
    // Source TopoNode for the LINK_TO_PARENT panel — we need the live Vector3 so
    // a ScreenProjector inside the Canvas can update setParentScreenPos every
    // frame (the panel slides out from the node like the CP2077 quickhack menu).
    const [setParentNode, setSetParentNode] = useState<TopoNode | null>(null);
    const [setParentScreenPos, setSetParentScreenPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [selectedProfile, setSelectedProfile] = useState<Record<string, unknown> | null>(null);
    const [selectedDestination, setSelectedDestination] = useState<Record<string, unknown> | null>(null);
    const [edgeLabel, setEdgeLabel] = useState('');
    const [isP2PConnection, setIsP2PConnection] = useState(true);
    const [editCustomNodeModal, setEditCustomNodeModal] = useState<Callback | null>(null);
    const [customNodeForm, setCustomNodeForm] = useState({ host: '', os: 'Windows', ip: '', user: '', description: '', architecture: 'x64' });
    const [taskForEdgeModal, setTaskForEdgeModal] = useState<Record<string, unknown> | null>(null);
    const [taskForEdgeCommand, setTaskForEdgeCommand] = useState<Record<string, unknown> | null>(null);
    const [taskForEdgeParams, setTaskForEdgeParams] = useState('');
    const [taskingForEdge, setTaskingForEdge] = useState(false);
    const [showEventingDialog, setShowEventingDialog] = useState<Callback | null>(null);
    const [removeEdgeModal, setRemoveEdgeModal] = useState<any[] | null>(null);
    const [manuallyAddEdgeModal, setManuallyAddEdgeModal] = useState<Callback | null>(null);
    const [addEdgeSelectedProfile, setAddEdgeSelectedProfile] = useState<Record<string, unknown> | null>(null);
    const [addEdgeSelectedDest, setAddEdgeSelectedDest] = useState<Record<string, unknown> | null>(null);
    const [addEdgeDestOptions, setAddEdgeDestOptions] = useState<any[]>([]);
    const autoLinkedCallbacksRef = useRef(new Set<string>());

    // ── QuickHack state ──
    const [quickHackTarget, setQuickHackTarget] = useState<TopoNode | null>(null);  // floating panel target
    const [quickHackScreenPos, setQuickHackScreenPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    // When the target node hosts multiple compatible agents (e.g. Apollo +
    // Meterpreter on the same host), we hold the chosen hack here and
    // render a secondary picker until the operator picks an agent.
    const [agentPickFor, setAgentPickFor] = useState<{ hack: QuickHackDef; candidates: Callback[] } | null>(null);
    // Multiple simultaneous executions keyed by execId
    const [quickHackExecs, setQuickHackExecs] = useState<Map<string, QuickHackExecution>>(new Map());
    // MSF SOCKS dialog — opened by the `minerva://msf-socks-dialog` action
    // step on the built-in SOCKS Quickhack when invoked on a meterpreter
    // node. Lives at the page root so it survives even after the
    // QuickHack panel closes.
    const [socksDialogFor, setSocksDialogFor] = useState<any | null>(null);
    // Track which execIds have already had their error/timeout toasted so we don't repeat
    const reportedExecErrors = useRef<Set<string>>(new Set());
    // (quickhack exec overlays are rendered in 3D via Html — no screen projection needed)
    const quickHackIntervalRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    // Node-picking mode for IP variable: { execId, varKey } when active
    const [nodePickingFor, setNodePickingFor] = useState<{ execId: string; varKey: string } | null>(null);
    // Multi-IP selection submenu state
    const [ipSelectionMenu, setIPSelectionMenu] = useState<{ ips: string[]; screenPos: { x: number; y: number }; execId: string; varKey: string } | null>(null);

    // ── Operator-picked session per node ─────────────────────────────────
    // When a host has multiple callbacks grouped under one machine node, the
    // DetailPanel exposes a session picker. The pick is stored in the
    // persisted Zustand store (`topologySessionPicks`) so it survives:
    //   • SPA navigation away (Callbacks / Payloads / etc.) and back
    //   • Hard page reload (zustand `persist` middleware → localStorage)
    // Keyed by TopoNode.id; value is the picked callback's display_id.
    const preferredSessionByNode = useAppStore(s => s.topologySessionPicks);
    const setTopologySessionPick = useAppStore(s => s.setTopologySessionPick);
    const handlePickNodeSession = useCallback((nodeId: string, displayId: number) => {
        setTopologySessionPick(nodeId, displayId);
    }, [setTopologySessionPick]);
    const preferredDisplayIdFor = useCallback((node: TopoNode | null | undefined): number | null => {
        if (!node) return null;
        const picked = preferredSessionByNode[node.id];
        if (picked == null) return null;
        // Verify the picked id still corresponds to a live callback on this
        // machine — operators kill / hide sessions, and a stale pick from a
        // previous session should silently fall back to the representative.
        const all = (node.allCallbacks as Array<{ display_id?: number }> | undefined) ?? [];
        if (all.some(c => c?.display_id === picked)) return picked;
        return null;
    }, [preferredSessionByNode]);

    // ── QuickHack: toast error/timeout messages in top-right snackbar ──
    useEffect(() => {
        for (const exec of quickHackExecs.values()) {
            if (reportedExecErrors.current.has(exec.execId)) continue;
            if (exec.phase === 'error') {
                reportedExecErrors.current.add(exec.execId);
                snackActions.error(
                    `[${exec.hack.name}] ${exec.callbackHost}: ${exec.errorMsg || 'Task failed'}`
                );
            } else if (exec.phase === 'timeout') {
                reportedExecErrors.current.add(exec.execId);
                snackActions.warning(
                    `[${exec.hack.name}] ${exec.callbackHost}: Timed out`
                );
            }
        }
    }, [quickHackExecs]);

    // Close tool menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (toolMenuRef.current && !toolMenuRef.current.contains(e.target as Node)) {
                setShowToolMenu(false);
            }
        };
        if (showToolMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showToolMenu]);

    // Persist user-dragged positions across topology rebuilds (until page refresh)
    const userPositions = useRef<Map<string, Vector3>>(new Map());
    // Live mirror of the most recent callbackgraphedge query result —
    // dispatcher closures (created once per `createTask` change) can
    // read the freshest edge list without rebinding the callback.
    const currentEdgesRef = useRef<any[]>([]);
    // Bumping this forces the topology useMemo to re-run, even if the
    // upstream data is byte-identical (Apollo caches re-deliver the same
    // reference). Used by the right-click "Refresh Topology" action to
    // recompute the tree layout from scratch.
    const [layoutEpoch, setLayoutEpoch] = useState(0);

    // ── Explicitly-disconnected node set ──
    // When the operator runs "Disconnect Parent" we record the affected node
    // here. `buildTopology` skips those nodes in its orphan-rescue step
    // (step 5), so the right-click action visibly persists instead of the
    // node snapping back to a MINERVA-core edge. Persisted via Mythic
    // operator preferences so it survives reloads and follows the operator.
    const DISCONNECTED_KEY = 'minerva_topology3d_disconnected';
    const [disconnectedNodes, setDisconnectedNodes] = useState<Set<string>>(() => {
        try {
            mythicKV.manageKey(DISCONNECTED_KEY);
            const raw = mythicKV.getItem(DISCONNECTED_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(parsed) ? parsed : []);
        } catch { return new Set(); }
    });
    useEffect(() => {
        const onChange = () => {
            try {
                const raw = mythicKV.getItem(DISCONNECTED_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                setDisconnectedNodes(new Set(Array.isArray(parsed) ? parsed : []));
            } catch { /* ignore */ }
        };
        return mythicKV.subscribe(DISCONNECTED_KEY, onChange);
    }, []);
    const writeDisconnected = useCallback((next: Set<string>) => {
        setDisconnectedNodes(next);
        mythicKV.manageKey(DISCONNECTED_KEY);
        mythicKV.setItem(DISCONNECTED_KEY, JSON.stringify([...next]));
    }, []);
    const markDisconnected = useCallback((nodeId: string) => {
        if (!nodeId) return;
        const next = new Set(disconnectedNodes);
        next.add(nodeId);
        writeDisconnected(next);
    }, [disconnectedNodes, writeDisconnected]);
    const clearDisconnected = useCallback((nodeId: string) => {
        if (!nodeId) return;
        if (!disconnectedNodes.has(nodeId)) return;
        const next = new Set(disconnectedNodes);
        next.delete(nodeId);
        writeDisconnected(next);
    }, [disconnectedNodes, writeDisconnected]);

    // ── New MSF session → reset its host's disconnect flag ──
    //
    // A fresh meterpreter session is the operator's latest declaration
    // of intent on that host — they want it visible and connected to
    // Minerva core, not parked in the disconnected zone because of an
    // older "Disconnect Parent" action on a now-stale C2 relationship.
    // buildTopology runs orphan-rescue immediately after this clears
    // (next layout cycle), so the new MSF callback's machine node
    // routes to core with a normal tree-edge instead of being parked.
    useEffect(() => {
        const off = subscribeMsfNewSession(ev => {
            const host = pickMsfHost(ev.snapshot);
            if (!host) return;
            const machineId = `machine-${host.toLowerCase()}`;
            clearDisconnected(machineId);
        });
        return off;
    }, [clearDisconnected]);

    // ── Build topology ──
    // Visibility rule: belongs to current operation OR legacy (no operation_id).
    // Legacy items are surfaced under the active op and rebound to it the next
    // time they are edited; items owned by a different op are hidden.
    const belongsToCurrentOp = useCallback((item: any) => {
        const opId = item?.operation_id;
        if (opId == null) return true;
        return opId === currentOpId;
    }, [currentOpId]);

    const customNodes: any[] = useMemo(() => {
        if (!customNodesData?.agentstorage) return [];
        return parseAgentStorageResults(customNodesData.agentstorage).filter(belongsToCurrentOp);
    }, [customNodesData, belongsToCurrentOp]);

    const customEdges = useMemo(() => {
        if (!customEdgesData?.agentstorage) return [];
        return parseEdgeStorageResults(customEdgesData.agentstorage).filter(belongsToCurrentOp);
    }, [customEdgesData, belongsToCurrentOp]);

    // Parse Link Focus setting (matching 2D CallbackGraph behavior)
    const linkFocusNodeId = useMemo(() => {
        const row = linkFocusData?.agentstorage?.[0];
        if (!row) return null;
        try {
            const raw = row.data;
            let parsed: any = null;
            if (typeof raw === 'string') {
                try { parsed = JSON.parse(raw); } catch {
                    try { parsed = JSON.parse(decodeURIComponent(escape(atob(raw)))); } catch {
                        if (raw.startsWith('\\x')) {
                            const hex = raw.substring(2);
                            const bytes = hex.match(/.{1,2}/g);
                            if (bytes) {
                                const b64 = bytes.map((b: string) => String.fromCharCode(parseInt(b, 16))).join('');
                                parsed = JSON.parse(decodeURIComponent(escape(atob(b64))));
                            }
                        }
                    }
                }
            } else {
                parsed = raw;
            }
            return parsed?.nodeId ?? null;
        } catch { return null; }
    }, [linkFocusData]);

    // Metasploit sessions appear as host-level nodes in the 3D map. Live
    // list is reused below for focus-edge building and the buildTopology
    // input.
    const msfSynthetic = useMsfSyntheticCallbacks();

    // Generate focus link edges — auto-link all callbacks to the focus node
    // Matches 2D behavior: every callback gets a focus edge to the designated node
    const focusEdges = useMemo(() => {
        if (!linkFocusNodeId) return [];
        const cbs = [...(callbacksData?.callback || []), ...msfSynthetic];
        return cbs
            .filter((cb: Callback) => String(cb.id) !== linkFocusNodeId)
            .map((cb: Callback) => ({
                source: String(cb.id),          // child
                target: linkFocusNodeId,         // parent (focus node)
                c2profile: 'focus',
            }));
    }, [callbacksData, msfSynthetic, linkFocusNodeId]);

    const { nodes, edges, subnets } = useMemo(() => {
        const allCallbacks = [...(callbacksData?.callback || []), ...msfSynthetic];
        const topo = buildTopology(
            edgesData?.callbackgraphedge || [],
            allCallbacks,
            customNodes,
            customEdges,
            focusEdges,
            showInactive,
            showHidden,
            disconnectedNodes,
        );
        // Re-apply user-dragged positions so nodes stay where they were moved
        for (const node of topo.nodes) {
            const saved = userPositions.current.get(node.id);
            if (saved) node.position.copy(saved);
        }
        return topo;
    // `layoutEpoch` is intentionally part of the deps so "Refresh Topology"
    // can force a layout recompute even when upstream data is unchanged.
    }, [edgesData, callbacksData, msfSynthetic, customNodes, customEdges, focusEdges, showInactive, showHidden, disconnectedNodes, layoutEpoch]);


    const selectedNode = useMemo(() =>
        nodes.find(n => n.id === selectedId) || null,
        [nodes, selectedId]
    );

    // Apply the operator's per-CIDR hide list. Done at this layer so the
    // shared subnet registry inside TopologyScene also forgets the hidden
    // zones (its AABB-cleanup useEffect keys on the rendered subnet set).
    const visibleSubnets = useMemo(
        () => hiddenSubnets.size === 0
            ? subnets
            : subnets.filter(s => !hiddenSubnets.has(s.cidr)),
        [subnets, hiddenSubnets],
    );

    // Compute which nodes to dim during PICK NODE mode (core + the hacking node itself)
    const pickingDimNodes = useMemo(() => {
        if (!nodePickingFor) return null;
        const exec = quickHackExecs.get(nodePickingFor.execId);
        if (!exec) return null;
        const dimSet = new Set<string>();
        dimSet.add('core'); // always dim the Minerva core node
        // Find the node that owns the executing callback and dim it too
        for (const n of nodes) {
            if (n.type === 'callback' && n.data?.id === exec.callbackId) {
                dimSet.add(n.id);
                break;
            }
        }
        return dimSet;
    }, [nodePickingFor, quickHackExecs, nodes]);

    // ── Handlers ──
    // Data-only refresh — used by the toolbar "Refresh Data" button. Pulls
    // fresh callbacks/edges/custom nodes but keeps the operator's manually
    // arranged layout intact.
    const handleRefreshData = useCallback(() => {
        refetchCallbacks();
        refetchEdges();
        refetchCustomNodes();
        refetchCustomEdges();
        snackActions.info('Topology data refreshed');
    }, [refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges]);

    // Full refresh — used by the right-click "Refresh Topology" menu item.
    // Drops any user-dragged positions and bumps `layoutEpoch` so the
    // topology useMemo re-runs and the tree layout is recomputed from
    // scratch. Identical-data refetches still trigger a re-layout because
    // the epoch dep changes.
    const handleRefresh = useCallback(() => {
        userPositions.current.clear();
        setLayoutEpoch(e => e + 1);
        refetchCallbacks();
        refetchEdges();
        refetchCustomNodes();
        refetchCustomEdges();
        snackActions.info('Topology refreshed & layout reset');
    }, [refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges]);

    // Ref to hold node-pick handler so handleSelect doesn't depend on its definition order
    const nodePickHandlerRef = useRef<((node: TopoNode, pos: { x: number; y: number }) => boolean) | null>(null);

    const handleSelect = useCallback((id: string, clickScreenPos?: { x: number; y: number }) => {
        // If in node-picking mode for IP variable, intercept the click
        if (nodePickingFor && nodePickHandlerRef.current) {
            const clickedNode = nodes.find(n => n.id === id);
            if (clickedNode) {
                const fallback = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                const consumed = nodePickHandlerRef.current(clickedNode, clickScreenPos ?? fallback);
                if (consumed) return;
            }
        }
        setSelectedId(prev => prev === id ? null : id);
        setCtxMenu(null);
    }, [nodePickingFor, nodes]);

    // Drag handlers only mutate the userPositions ref, so keep them identity-
    // stable — passing fresh lambdas would defeat NodeSphere's React.memo and
    // re-render every sphere on each poll / hover tick.
    const handleNodeDragMove = useCallback((id: string, pos: Vector3) => {
        userPositions.current.set(id, pos.clone());
    }, []);
    const handleNodeDragEnd = useCallback((id: string, pos: Vector3) => {
        userPositions.current.set(id, pos.clone());
    }, []);

    const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>, nodeId: string) => {
        const nativeEvent = e.nativeEvent || (e as unknown as MouseEvent);
        setSubnetCtxMenu(null);
        setBgMenu(null);
        setCtxMenu({
            x: nativeEvent.clientX ?? (e as unknown as MouseEvent).clientX ?? 0,
            y: nativeEvent.clientY ?? (e as unknown as MouseEvent).clientY ?? 0,
            nodeId,
        });
    }, []);

    /** Right-click on a network-space volume → pop the per-CIDR menu and
     *  suppress every other right-click handler (node menu, background
     *  menu) so they don't fight over the same event. */
    const handleSubnetContextMenu = useCallback((e: ThreeEvent<MouseEvent>, cidr: string) => {
        const nativeEvent = e.nativeEvent || (e as unknown as MouseEvent);
        setCtxMenu(null);
        setBgMenu(null);
        setSubnetCtxMenu({
            x: nativeEvent.clientX ?? (e as unknown as MouseEvent).clientX ?? 0,
            y: nativeEvent.clientY ?? (e as unknown as MouseEvent).clientY ?? 0,
            cidr,
        });
    }, []);

    const handleHideSubnet = useCallback((cidr: string) => {
        setHiddenSubnets(prev => {
            const next = new Set(prev);
            next.add(cidr);
            return next;
        });
    }, []);

    const handleRestoreAllSubnets = useCallback(() => {
        setHiddenSubnets(new Set());
    }, []);

    const handleNavigateConsole = useCallback((displayId: number) => {
        // Mythic + MSF share `/console/<displayId>` — Console picks MSF mode
        // by display_id range (see MSF_DISPLAY_ID_OFFSET).
        navigate(`/console/${displayId}`);
    }, [navigate]);

    const handleLockCallback = useCallback((displayId: number, locked: boolean) => {
        lockCallback({ variables: { callback_display_id: displayId, locked } });
    }, [lockCallback]);

    const handleHideCallback = useCallback((displayId: number) => {
        hideCallback({ variables: { callback_display_id: displayId, active: false } });
    }, [hideCallback]);

    // ── Context Menu Action Handlers (matching CallbackGraph) ──

    /** Helper: find the callback data object from a TopoNode for use in modals */
    const resolveCallbackData = useCallback((node: TopoNode): any => {
        if (node.type === 'custom') {
            // Parsed CustomGraphNode only has `id` (the agentstorage row id used in
            // `minerva_customnode_{id}`). 2D CallbackGraph remaps it to `db_id`, but
            // 3D consumes the raw struct, so fall back to `id` to keep delete / edit /
            // disconnect mutations addressing the right row.
            const customId = node.data?.db_id ?? node.data?.id;
            return { ...node.data, isCustom: true, id: node.data?.id, db_id: customId, display_id: node.data?.display_id ?? node.data?.id, host: node.label, ip: node.sublabel || node.data?.ip, os: node.data?.os || node.data?.operating_system, architecture: node.data?.architecture, user: node.data?.user, description: node.data?.description, callback_id: node.data?.id, isHidden: (node.data as any)?.isHidden ?? (node.data as any)?.hidden };
        }
        // callback type — data is the representative callback
        const cb = node.data;
        return { ...cb, isCustom: false, id: cb?.id, callback_id: cb?.display_id, display_id: cb?.display_id, host: cb?.host, ip: extractPrimaryIP(cb?.ip), os: cb?.os || cb?.operating_system, architecture: cb?.architecture, user: cb?.user, description: cb?.description, locked: cb?.locked, integrity_level: cb?.integrity_level, domain: cb?.domain, pid: cb?.pid, sleep_info: cb?.sleep_info, payloadType: cb?.payload?.payloadtype?.name };
    }, []);

    const openDetails = useCallback((node: TopoNode) => {
        setDetailsModal(resolveCallbackData(node));
        setCtxMenu(null);
    }, [resolveCallbackData]);

    const openEditDescription = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        setEditDescriptionModal(d);
        setNewDescription(d.description || '');
        setCtxMenu(null);
    }, [resolveCallbackData]);

    const handleSaveDescription = useCallback(async () => {
        if (!editDescriptionModal) return;
        try {
            await updateDescription({ variables: { callback_display_id: editDescriptionModal.display_id, description: newDescription } });
            snackActions.success('Description updated');
            refetchCallbacks();
            setEditDescriptionModal(null);
        } catch (e: unknown) {
            snackActions.error('Failed to update description: ' + getErrorMessage(e));
        }
    }, [editDescriptionModal, newDescription, updateDescription, refetchCallbacks]);

    const handleSetLinkFocus = useCallback((nodeId: string, label: string) => {
        const data = btoa(unescape(encodeURIComponent(JSON.stringify({ nodeId, label }))));
        setLinkFocusMutation({ variables: { data } });
        autoLinkedCallbacksRef.current.clear();
    }, [setLinkFocusMutation]);

    const handleClearLinkFocus = useCallback(() => {
        clearLinkFocusMutation();
        autoLinkedCallbacksRef.current.clear();
    }, [clearLinkFocusMutation]);

    const openSetParent = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        setSetParentModal(d);
        setSetParentNode(node);              // keep TopoNode so ScreenProjector can track its world position
        setSelectedProfile(null);
        setSelectedDestination(null);
        setEdgeLabel('');
        setIsP2PConnection(true);
        refetchP2P();
        refetchAllC2();
        setCtxMenu(null);
    }, [resolveCallbackData, refetchP2P, refetchAllC2]);

    const getParentEdge = useCallback((callbackId: number | string) => {
        const callbackIdStr = String(callbackId);
        const customEdge = customEdges.find(e => String(e.source) === callbackIdStr);
        if (customEdge) return customEdge;
        if (!edgesData?.callbackgraphedge) return null;
        return edgesData.callbackgraphedge.find((e: CallbackGraphEdge) => e.source?.id === callbackId && !e.end_timestamp);
    }, [edgesData, customEdges]);

    const handleDisconnectParent = useCallback(async (node: TopoNode) => {
        const callback: any = resolveCallbackData(node);
        const parentEdge = getParentEdge(callback.id);
        if (!parentEdge) {
            snackActions.info('No parent connection found');
            setCtxMenu(null);
            return;
        }
        // Record the operator's intent BEFORE the mutation fires so the
        // next topology rebuild (triggered by refetchEdges) sees the
        // disconnected flag and skips the auto-rescue-to-core edge.
        markDisconnected(node.id);
        if (callback.isCustom) {
            try {
                const { unique_id, data } = prepareUpdateNodeData({
                    id: callback.db_id, hostname: callback.host, ip_address: callback.ip,
                    operating_system: callback.os, architecture: callback.architecture,
                    username: callback.user !== 'N/A' ? callback.user : undefined,
                    description: callback.description, hidden: callback.isHidden,
                    operation_id: currentOpId || undefined,
                    parent_id: undefined, parent_type: undefined, c2profile: undefined,
                });
                const result = await updateCustomNodeMutation({ variables: { unique_id, data } });
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success('Disconnected from parent');
                    refetchCustomNodes();
                } else {
                    snackActions.error('Failed to disconnect');
                }
            } catch (e: unknown) {
                snackActions.error('Failed to disconnect: ' + getErrorMessage(e));
            }
            setCtxMenu(null);
            return;
        }
        if (parentEdge.source && typeof parentEdge.source === 'string' && !parentEdge.id.startsWith('e')) {
            try {
                const result = await deleteCustomEdgeMutation({ variables: { unique_id: generateEdgeUniqueId(parentEdge.id) } });
                if (result.data?.delete_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Disconnected from Custom Node #${parentEdge.targetId}`);
                    refetchCustomEdges();
                } else {
                    snackActions.error('Failed to remove connection');
                }
            } catch (e: unknown) {
                snackActions.error('Failed to disconnect: ' + getErrorMessage(e));
            }
            setCtxMenu(null);
            return;
        }
        try {
            const result = await removeEdge({ variables: { edge_id: parentEdge.id } });
            if (result.data?.callbackgraphedge_remove?.status === 'success') {
                snackActions.success(`Disconnected from Callback #${parentEdge.destination?.display_id}`);
            } else if (result.data?.callbackgraphedge_remove?.error) {
                snackActions.error(`Failed: ${result.data.callbackgraphedge_remove.error}`);
            }
            refetchCallbacks();
            refetchEdges();
        } catch (e: unknown) {
            snackActions.error('Failed to disconnect: ' + getErrorMessage(e));
        }
        setCtxMenu(null);
    }, [resolveCallbackData, getParentEdge, currentOpId, updateCustomNodeMutation, deleteCustomEdgeMutation, removeEdge, refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges, markDisconnected]);

    const openEditCustomNode = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        setEditCustomNodeModal(d);
        setCustomNodeForm({
            host: d.host || '', os: d.os || 'Windows', ip: d.ip || '',
            user: d.user || '', description: d.description || '', architecture: d.architecture || 'x64',
        });
        setCtxMenu(null);
    }, [resolveCallbackData]);

    const handleUpdateCustomNode = useCallback(async () => {
        if (!customNodeForm.host || !customNodeForm.ip) {
            snackActions.error('Hostname and IP are required');
            return;
        }
        try {
            const { unique_id, data } = prepareUpdateNodeData({
                id: editCustomNodeModal!.db_id as number, hostname: customNodeForm.host, ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os, architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined, description: customNodeForm.description,
                hidden: editCustomNodeModal!.isHidden || false,
                operation_id: currentOpId || undefined,
            });
            const result = await updateCustomNodeMutation({ variables: { unique_id, data } });
            if (result.data?.update_agentstorage?.affected_rows > 0) {
                snackActions.success('Custom node updated');
                setEditCustomNodeModal(null);
                refetchCustomNodes();
                setCustomNodeForm({ host: '', os: 'Windows', ip: '', user: '', description: '', architecture: 'x64' });
            } else {
                throw new Error('No rows updated');
            }
        } catch (e: unknown) {
            snackActions.error('Failed to update: ' + getErrorMessage(e));
        }
    }, [editCustomNodeModal, customNodeForm, currentOpId, updateCustomNodeMutation, refetchCustomNodes]);

    const openCreateCustomNode = useCallback(() => {
        setCustomNodeForm({ host: '', os: 'Windows', ip: '', user: '', description: '', architecture: 'x64' });
        setCreateCustomNodeModal(true);
    }, []);

    const handleCreateCustomNode = useCallback(async () => {
        if (!customNodeForm.host || !customNodeForm.ip) {
            snackActions.error('Hostname and IP are required');
            return;
        }
        try {
            const existingNodes = customNodesData?.agentstorage
                ? parseAgentStorageResults(customNodesData.agentstorage)
                : [];
            const nextId = generateNextId(existingNodes);
            const { unique_id, data } = prepareCreateNodeData({
                hostname: customNodeForm.host,
                ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os,
                architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined,
                description: customNodeForm.description,
                operation_id: currentOpId || undefined,
            }, nextId);
            const result = await createCustomNodeMutation({ variables: { unique_id, data } });
            if (result.data?.insert_agentstorage_one) {
                snackActions.success(`Custom node "${customNodeForm.host}" created`);
                setCreateCustomNodeModal(false);
                refetchCustomNodes();
                setCustomNodeForm({ host: '', os: 'Windows', ip: '', user: '', description: '', architecture: 'x64' });
            } else {
                throw new Error('Insert returned no row');
            }
        } catch (e: unknown) {
            snackActions.error('Failed to create: ' + getErrorMessage(e));
        }
    }, [customNodeForm, customNodesData, currentOpId, createCustomNodeMutation, refetchCustomNodes]);

    const handleDeleteCustomNode = useCallback(async (node: TopoNode) => {
        const d: any = resolveCallbackData(node);
        try {
            const unique_id = generateUniqueId(d.db_id);
            const result = await deleteCustomNodeMutation({ variables: { unique_id } });
            if (result.data?.delete_agentstorage?.affected_rows > 0) {
                snackActions.success(`Custom node "${d.host}" deleted`);
                refetchCustomNodes();
            } else {
                throw new Error('Failed to delete');
            }
        } catch (e: unknown) {
            snackActions.error('Failed to delete: ' + getErrorMessage(e));
        }
        setCtxMenu(null);
    }, [resolveCallbackData, deleteCustomNodeMutation, refetchCustomNodes]);

    const handleOpenRemoveEdge = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        const callbackId = d.callback_id ?? d.id;
        const activeEdges = (edgesData?.callbackgraphedge || []).filter(
            (e: CallbackGraphEdge) => !e.end_timestamp && (e.source?.id === callbackId || e.destination?.id === callbackId)
        );
        if (activeEdges.length === 0) {
            snackActions.info('No active edges for this callback');
            setCtxMenu(null);
            return;
        }
        setRemoveEdgeModal(activeEdges);
        setCtxMenu(null);
    }, [resolveCallbackData, edgesData]);

    const openManuallyAddEdge = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        setManuallyAddEdgeModal(d);
        setAddEdgeSelectedProfile(null);
        setAddEdgeSelectedDest(null);
        setAddEdgeDestOptions([]);
        setCtxMenu(null);
    }, [resolveCallbackData]);

    const handleManuallyAddEdge = useCallback(async () => {
        if (!manuallyAddEdgeModal || !addEdgeSelectedProfile || !addEdgeSelectedDest) {
            snackActions.warning('Select a P2P profile and destination callback');
            return;
        }
        try {
            await addEdge({
                variables: {
                    source_id: manuallyAddEdgeModal.display_id ?? manuallyAddEdgeModal.callback_id,
                    destination_id: addEdgeSelectedDest.display_id,
                    c2profile: addEdgeSelectedProfile.name,
                },
            });
            snackActions.success('Edge added');
            refetchEdges();
            setManuallyAddEdgeModal(null);
            setAddEdgeSelectedProfile(null);
            setAddEdgeSelectedDest(null);
            setAddEdgeDestOptions([]);
        } catch (e: unknown) {
            snackActions.error('Failed: ' + getErrorMessage(e));
        }
    }, [manuallyAddEdgeModal, addEdgeSelectedProfile, addEdgeSelectedDest, addEdge, refetchEdges]);

    const openTaskForEdge = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        setTaskForEdgeModal(d);
        getLinkCommands({ variables: { callback_id: d.callback_id } });
        setCtxMenu(null);
    }, [resolveCallbackData, getLinkCommands]);

    const openEventing = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        setShowEventingDialog(d);
        setCtxMenu(null);
    }, [resolveCallbackData]);

    // ── QuickHack: open floating panel near node ──
    const handleOpenQuickHack = useCallback((node: TopoNode) => {
        setCtxMenu(null);
        // Block QuickHack on dead nodes
        if (!node.alive) {
            snackActions.error('Target offline — quickhack unavailable');
            return;
        }
        setQuickHackTarget(node);
        playSelectQH();
    }, []);

    // ── QuickHack multi-execution helpers ──
    const updateExec = useCallback((execId: string, updater: (prev: QuickHackExecution) => QuickHackExecution) => {
        setQuickHackExecs(prev => {
            const exec = prev.get(execId);
            if (!exec) return prev;
            const next = new Map(prev);
            next.set(execId, updater(exec));
            return next;
        });
    }, []);

    const removeExec = useCallback((execId: string) => {
        setQuickHackExecs(prev => {
            const next = new Map(prev);
            next.delete(execId);
            return next;
        });
    }, []);

    // ── QuickHack: dispatch a `minerva://<action>` step client-side ──
    //
    // Returns once the action has been initiated. The step is considered
    // "complete" the moment the side effect starts (e.g. dialog shown) —
    // we don't block the Quickhack panel while the operator interacts
    // with whatever the action opens. Errors propagate to the caller so
    // sendQuickHackTask can mark the exec as `error`.
    const dispatchMinervaAction = useCallback(async (actionKey: string, exec: QuickHackExecution, step: QuickHackStep): Promise<void> => {
        const cb = exec.callback;
        const requireMsfSession = (): string => {
            if (!cb) throw new Error('No target callback');
            const sid = msfSessionIdOf(cb);
            if (!sid) throw new Error('Target is not an MSF session');
            return sid;
        };

        switch (actionKey) {
            // Open the per-operation MSF SOCKS dialog (route editor).
            // Kept around for the Callbacks ⋮ menu entry — the SOCKS
            // Quickhack itself uses `msf-autoroute` instead so it can
            // attach the session without any operator confirmation.
            case 'msf-socks-dialog': {
                requireMsfSession();
                setSocksDialogFor(cb);
                return;
            }

            // Silent SOCKS attach for a meterpreter session: runs
            // `post/multi/manage/autoroute autoadd` to discover every
            // network the target can reach, merges with the IPs MSF
            // already knows about, and adds them all to the operation
            // tunnel. Once the operator connects to the SOCKS port
            // every reachable subnet is available — no dialog,
            // no confirmation, no second click.
            case 'msf-autoroute': {
                const sid = requireMsfSession();
                const opId = me.user?.current_operation_id ?? 0;
                if (!opId) throw new Error('No active operation');
                const [{ runAutorouteForSession, ensureOperationSocks, addSessionRoutes, suggestSubnetsFromIps }, { extractAllIPs }] = await Promise.all([
                    import('../Metasploit/msfSocks'),
                    import('../../lib/quickhacks'),
                ]);
                // Make sure the per-operation SOCKS server is up before
                // we start pushing routes at it.
                await ensureOperationSocks(opId);
                // Cheap path first — derive /24s from the callback's IPs.
                const ipDerived = suggestSubnetsFromIps(extractAllIPs((cb as any).ip));
                // Thorough path — run autoroute against the target.
                let discovered: string[] = [];
                try { discovered = await runAutorouteForSession(sid); } catch { /* keep IP-derived */ }
                const merged = [...new Set([...ipDerived, ...discovered])];
                if (merged.length === 0) {
                    throw new Error('No reachable subnets found on this session');
                }
                await addSessionRoutes(opId, sid, merged);
                snackActions.success(`Autoroute attached MSF-${sid}: ${merged.length} subnet${merged.length === 1 ? '' : 's'}`);
                return;
            }

            // Run a raw meterpreter command on the target session.
            // params is the command literal (already resolved for {{VARS}}).
            case 'msf-command': {
                const sid = requireMsfSession();
                const cmd = (step.params || '').trim();
                if (!cmd) throw new Error('msf-command step has empty params');
                // Record a Minerva-side MSF task so Console + history pick it up.
                const sessionType = (cb as any)?._msfSessionType || 'meterpreter';
                const operator = (window as any).Minerva?.meUsername || 'quickhack';
                // Lazy-import so this file doesn't bring the whole MSF
                // task machinery into the 3D scene's bundle chunk eagerly.
                const [{ createTask: createMsfTask }, { sessionMeterpreterWrite, sessionShellWrite }] = await Promise.all([
                    import('../Console/msfTaskStore'),
                    import('../Metasploit/msfrpc'),
                ]);
                createMsfTask({
                    sessionId: sid,
                    sessionType,
                    command: cmd,
                    operator,
                    origin: 'sidekick',
                });
                if (sessionType === 'meterpreter') {
                    await sessionMeterpreterWrite(sid, cmd + '\n');
                } else {
                    await sessionShellWrite(sid, cmd + '\n');
                }
                return;
            }

            // Run an MSF module on the target session.
            // params is JSON: { type, name, options }. Options support
            // {{VARS}} via resolveParams up the stack; we also auto-inject
            // SESSION=<sid> if the operator left it out.
            case 'msf-module': {
                const sid = requireMsfSession();
                const raw = (step.params || '').trim();
                if (!raw) throw new Error('msf-module step has empty params');
                let parsed: any;
                try { parsed = JSON.parse(raw); }
                catch (e) { throw new Error(`msf-module params is not valid JSON: ${(e as Error).message}`); }
                const type = String(parsed.type || '').toLowerCase();
                const name = String(parsed.name || '');
                if (!type || !name) throw new Error('msf-module needs both `type` and `name`');
                const options: Record<string, string> = { ...(parsed.options ?? {}) };
                if (!('SESSION' in options) && (type === 'post' || type === 'exploit')) {
                    options.SESSION = sid;
                }
                // Record a task entry so Console history shows the module run.
                const operator = (window as any).Minerva?.meUsername || 'quickhack';
                const [{ createTask: createMsfTask }, { executeModule }] = await Promise.all([
                    import('../Console/msfTaskStore'),
                    import('../Metasploit/msfrpc'),
                ]);
                createMsfTask({
                    sessionId: sid,
                    sessionType: (cb as any)?._msfSessionType || 'meterpreter',
                    command: `${type}/${name}`,
                    params: JSON.stringify(options),
                    operator,
                    origin: 'sidekick',
                });
                await executeModule(type, name, options);
                return;
            }

            // Establish a TCP P2P link from this callback to a remote
            // listener. Agent-side command names vary (Apollo: link_tcp,
            // Poseidon: link, others differ), so we look up whichever
            // loadedcommand on this callback advertises the
            // `graph_view:link` UI feature — same selection logic Mythic's
            // built-in TASK ON EDGE dialog uses — then task it with the
            // resolved `<TARGET_IP> <TARGET_PORT>` params via parsed_cli.
            case 'link': {
                if (!cb) throw new Error('No target callback');
                const argStr = (step.params || '').trim();
                if (!argStr) throw new Error('link step needs TARGET_IP and TARGET_PORT');
                // Quickhack ships `<IP> <PORT>` — split here so we can
                // rebuild the agent-shaped JSON below.
                const parts = argStr.split(/\s+/);
                const targetIp = parts[0] ?? '';
                const targetPortStr = parts[1] ?? '';
                if (!targetIp || !targetPortStr) {
                    throw new Error(`link step expects "<IP> <PORT>", got "${argStr}"`);
                }
                const targetPort = parseInt(targetPortStr, 10);
                if (!Number.isFinite(targetPort)) {
                    throw new Error(`link port "${targetPortStr}" is not a number`);
                }

                const { GET_ALL_LOADED_COMMANDS_FOR_CALLBACK } = await import('../../lib/api/callbackManagement');
                const all = await apolloClient.query<any>({
                    query: GET_ALL_LOADED_COMMANDS_FOR_CALLBACK,
                    variables: { callback_id: cb.id },
                    fetchPolicy: 'network-only',
                });
                const loaded: any[] = all.data?.loadedcommands ?? [];

                // Pick the link command: prefer one whose UI features
                // declare `graph_view:link`; otherwise match the cmd
                // name by `/^link(_|$)/i`. Bare `link` wins ties.
                const score = (lc: any): number => {
                    const cmd = lc?.command;
                    if (!cmd?.cmd) return -1;
                    const feats: string[] = cmd.supported_ui_features ?? [];
                    if (feats.includes?.('graph_view:link')) return 3;
                    if (cmd.cmd.toLowerCase() === 'link') return 2;
                    if (/^link(_|$)/i.test(cmd.cmd)) return 1;
                    return -1;
                };
                const ranked = loaded
                    .map(lc => ({ lc, s: score(lc) }))
                    .filter(x => x.s >= 0)
                    .sort((a, b) => b.s - a.s);
                const chosen = ranked[0]?.lc?.command;
                if (!chosen?.cmd) {
                    throw new Error('No TCP-link command found on this callback. Load `link` (or `link_tcp`) from the Commands menu first.');
                }
                const linkCmd: string = chosen.cmd;

                // Introspect the command's parameter list to find the
                // host/address field and the port field — Apollo's
                // link_tcp uses `address`+`port`; Poseidon's link uses
                // `host`+`port`. Fall back to "host" + "port" if the
                // metadata isn't available.
                const params: any[] = chosen.commandparameters ?? [];
                const findParam = (re: RegExp): any | undefined =>
                    params.find(p => typeof p?.name === 'string' && re.test(p.name));
                // Prefer string-typed params for the address slot, number for port.
                const ipParam =
                    findParam(/^(address|host|remote_?host|target_?host|target_?ip|ip)$/i)
                    ?? params.find(p => typeof p?.name === 'string' && /(host|address|ip)/i.test(p.name));
                const portParam =
                    findParam(/^(port|remote_?port|target_?port)$/i)
                    ?? params.find(p => typeof p?.name === 'string' && /port/i.test(p.name));
                const ipKey = ipParam?.name ?? 'host';
                const portKey = portParam?.name ?? 'port';

                // Build the JSON body the agent expects. tasking_location
                // is left blank so Mythic uses `command_line` (JSON), the
                // shape Apollo's link_tcp.ParseArgString wants — its
                // json.Unmarshal would choke on a CLI-form string like
                // "172.16.0.1 6767" ("invalid character '.'").
                const jsonParams = JSON.stringify({ [ipKey]: targetIp, [portKey]: targetPort });

                const result = await createTask({
                    variables: {
                        callback_id: cb.display_id,
                        command: linkCmd,
                        params: jsonParams,
                        original_params: jsonParams,
                        token_id: 0,
                    },
                });
                const taskResult: any = (result as any).data?.createTask;
                if (taskResult?.status === 'error') {
                    throw new Error(taskResult.error || `${linkCmd} task failed`);
                }
                return;
            }

            // Inverse of `link`. Apollo's `unlink_tcp` sometimes succeeds
            // at the agent level but never tells Mythic to close the
            // callbackgraphedge — leaving Minerva to render the link
            // indefinitely. We do two things to make the visual state
            // match reality:
            //   1. Best-effort run the agent's unlink command (so an
            //      operator who hasn't already unlinked manually gets
            //      the agent side closed). Errors are swallowed because
            //      the user often gets here AFTER doing manual unlink.
            //   2. Force-close every active P2P callbackgraphedge whose
            //      destination is this callback (= where this callback
            //      is the parent of a P2P link). callbackgraphedge_remove
            //      is the canonical way to mark `end_timestamp`, and
            //      buildTopology already filters those out, so the line
            //      vanishes on the next edge poll.
            case 'unlink': {
                if (!cb) throw new Error('No target callback');
                const edges: any[] = (currentEdgesRef.current ?? []) as any[];
                const targets = edges.filter(e =>
                    !e.end_timestamp &&
                    e.c2profile?.is_p2p &&
                    e.destination?.id === cb.id,
                );
                if (targets.length === 0) {
                    throw new Error('No active P2P links sourced at this callback.');
                }

                // Best-effort: pick the loaded `unlink*` command and task
                // each linked child. Errors swallowed — see comment above.
                const { GET_ALL_LOADED_COMMANDS_FOR_CALLBACK } = await import('../../lib/api/callbackManagement');
                let unlinkCmdName: string | undefined;
                let unlinkParamMeta: any[] = [];
                try {
                    const all = await apolloClient.query<any>({
                        query: GET_ALL_LOADED_COMMANDS_FOR_CALLBACK,
                        variables: { callback_id: cb.id },
                        fetchPolicy: 'network-only',
                    });
                    const loaded: any[] = all.data?.loadedcommands ?? [];
                    const candidates = loaded
                        .map(l => l?.command)
                        .filter(c => typeof c?.cmd === 'string' && /^unlink(_|$)/i.test(c.cmd));
                    candidates.sort((a, b) =>
                        (a.cmd.toLowerCase() === 'unlink' ? 0 : 1) -
                        (b.cmd.toLowerCase() === 'unlink' ? 0 : 1),
                    );
                    unlinkCmdName = candidates[0]?.cmd;
                    unlinkParamMeta = candidates[0]?.commandparameters ?? [];
                } catch { /* fall through to edge-close only */ }

                // For each active P2P edge: optional unlink task, then
                // remove the edge. Done sequentially so removeEdge's
                // refetch doesn't race with the createTask response.
                for (const edge of targets) {
                    if (unlinkCmdName) {
                        try {
                            // Build params from the child callback's
                            // address/port if the unlink command takes
                            // them. Apollo's unlink_tcp accepts either
                            // a remote_id (preferred) or address/port.
                            const childIp = edge.source?.ip
                                ? String(edge.source.ip).split(/[",\[\]\s]+/).filter(Boolean)[0]
                                : '';
                            const findParam = (re: RegExp) =>
                                unlinkParamMeta.find(p => typeof p?.name === 'string' && re.test(p.name));
                            const idParam = findParam(/^(remote_?id|callback_?id|child)/i);
                            const ipParam = findParam(/^(address|host|remote_?host|target_?host|target_?ip|ip)$/i)
                                ?? unlinkParamMeta.find(p => /(host|address|ip)/i.test(p?.name ?? ''));
                            const portParam = findParam(/^(port|remote_?port|target_?port)$/i)
                                ?? unlinkParamMeta.find(p => /port/i.test(p?.name ?? ''));
                            const body: Record<string, any> = {};
                            if (idParam) body[idParam.name] = edge.source?.id;
                            if (ipParam && childIp) body[ipParam.name] = childIp;
                            if (portParam) body[portParam.name] = 0; // best-effort; agent often only needs one of these
                            const params = JSON.stringify(body);
                            await createTask({
                                variables: {
                                    callback_id: cb.display_id,
                                    command: unlinkCmdName,
                                    params,
                                    original_params: params,
                                    token_id: 0,
                                },
                            });
                        } catch { /* swallow — proceed to edge close */ }
                    }
                    try { await removeEdge({ variables: { edge_id: edge.id } }); } catch { /* ignore */ }
                }
                return;
            }

            default:
                throw new Error(`Unknown minerva:// action "${actionKey}"`);
        }
    }, [createTask, apolloClient, removeEdge]);

    // ── QuickHack: actually send the task to Mythic (used by both initial exec and resume) ──
    const sendQuickHackTask = useCallback(async (execId: string, exec: QuickHackExecution, resolvedSteps: QuickHackStep[]) => {
        const total = resolvedSteps.length;
        // Track whether any step was sent to Mythic. If the entire exec
        // consists of client-side `minerva://` actions, there's no taskId
        // for the subscription to watch, so we mark phase: 'completed'
        // ourselves at the end of the loop.
        let dispatchedToMythic = false;

        for (let i = 0; i < total; i++) {
            const step = resolvedSteps[i];
            // Progress band per step: evenly divide 0-90 across steps
            const bandStart = (i / total) * 90;
            const bandUploadEnd = bandStart + (0.33 / total) * 90;   // first third of band = uploading
            const bandEnd = ((i + 1) / total) * 90;

            // Client-side Minerva action — dispatch immediately, animate
            // through this step's progress band, then continue.
            if (isMinervaAction(step)) {
                updateExec(execId, prev => ({ ...prev, phase: 'uploading', progress: bandStart, currentStep: i }));
                try {
                    await dispatchMinervaAction(parseMinervaAction(step), exec, step);
                } catch (e: unknown) {
                    playDoneQH();
                    updateExec(execId, prev => ({
                        ...prev, phase: 'error', progress: bandStart,
                        errorMsg: `Step ${i + 1}/${total} (${step.command}): ${(e as Error).message}`,
                    }));
                    return;
                }
                updateExec(execId, prev => ({ ...prev, progress: bandEnd, currentStep: i + 1 }));
                continue;
            }

            // Start upload animation for this step
            updateExec(execId, prev => ({ ...prev, phase: 'uploading', progress: bandStart, currentStep: i }));

            let prog = bandStart;
            const oldIv = quickHackIntervalRef.current.get(execId);
            if (oldIv) clearInterval(oldIv);
            quickHackIntervalRef.current.set(execId, setInterval(() => {
                prog += 1.5 + Math.random() * 2;
                if (prog >= bandUploadEnd) prog = bandUploadEnd;
                setQuickHackExecs(prev => {
                    const e = prev.get(execId);
                    if (!e) return prev;
                    const next = new Map(prev);
                    next.set(execId, { ...e, progress: Math.min(prog, bandUploadEnd) });
                    return next;
                });
            }, 100));

            try {
                const result = await createTask({
                    variables: {
                        callback_id: exec.callbackId,
                        command: step.command,
                        params: step.params,
                        original_params: step.params,
                        tasking_location: 'parsed_cli',
                        token_id: 0,
                    },
                });
                const taskResult = result.data?.createTask;
                if (taskResult?.status === 'error') {
                    const iv = quickHackIntervalRef.current.get(execId);
                    if (iv) { clearInterval(iv); quickHackIntervalRef.current.delete(execId); }
                    playDoneQH();
                    updateExec(execId, prev => ({
                        ...prev, phase: 'error', progress: prog,
                        errorMsg: `Step ${i + 1}/${total} (${step.command}): ${taskResult.error}`,
                    }));
                    return;
                }

                const newTaskId = taskResult?.id;
                const iv = quickHackIntervalRef.current.get(execId);
                if (iv) { clearInterval(iv); quickHackIntervalRef.current.delete(execId); }
                dispatchedToMythic = true;
                updateExec(execId, prev => ({ ...prev, taskId: newTaskId, phase: 'processing', progress: bandUploadEnd }));

                // Processing animation for this step
                let processingProg = bandUploadEnd;
                await new Promise<void>((resolve) => {
                    quickHackIntervalRef.current.set(execId, setInterval(() => {
                        processingProg += 0.3 + Math.random() * 0.8;
                        if (processingProg >= bandEnd) {
                            processingProg = bandEnd;
                            const civ = quickHackIntervalRef.current.get(execId);
                            if (civ) { clearInterval(civ); quickHackIntervalRef.current.delete(execId); }
                            resolve();
                        }
                        setQuickHackExecs(prev => {
                            const e = prev.get(execId);
                            if (!e) return prev;
                            const next = new Map(prev);
                            next.set(execId, { ...e, progress: Math.min(processingProg, bandEnd) });
                            return next;
                        });
                    }, 200));
                });

            } catch (e: unknown) {
                const iv = quickHackIntervalRef.current.get(execId);
                if (iv) { clearInterval(iv); quickHackIntervalRef.current.delete(execId); }
                playDoneQH();
                updateExec(execId, prev => ({
                    ...prev, phase: 'error', progress: prog,
                    errorMsg: `Step ${i + 1}/${total} (${step.command}): ${(e as Error).message}`,
                }));
                return;
            }
        }
        // All steps completed.
        // - If at least one step went through Mythic, the task subscription
        //   in QuickHackOverlay finalises the exec to 'completed'/'error'.
        // - If every step was a client-side `minerva://` action, there's no
        //   taskId to subscribe on — finalise here.
        if (!dispatchedToMythic) {
            playDoneQH();
            updateExec(execId, prev => ({ ...prev, phase: 'completed', progress: 100 }));
        }
    }, [createTask, updateExec, dispatchMinervaAction]);

    // ── QuickHack: run a hack against a *specific* callback. Shared by
    //    the single-agent path and the multi-agent picker. ──
    const executeQuickHackForCallback = useCallback(async (hack: QuickHackDef, node: TopoNode, rawCb: Callback) => {
        const agentType: string | undefined = (rawCb as any)?.payload?.payloadtype?.name?.toLowerCase();
        const steps = getHackSteps(hack, agentType);
        const execId = `qhx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const needsInput = hackNeedsInput(hack, agentType);
        const exec: QuickHackExecution = {
            hack,
            // Mythic's createTask GraphQL takes `callback_id` but the
            // resolver looks it up against `callback.display_id`
            // (`WHERE callback.display_id=$1`). The previous
            // implementation in handleExecuteQuickHack passed
            // `d.callback_id` which `resolveCallbackData` defines as
            // `cb.display_id` — same thing. Passing the table PK
            // (`rawCb.id`) makes Mythic respond "Failed to get
            // callback information".
            callbackId: rawCb.display_id,
            callbackDisplayId: rawCb.display_id,
            callbackHost: rawCb.host || rawCb.ip || 'unknown',
            agentType,
            callback: rawCb,
            taskId: null,
            phase: needsInput ? 'awaiting_input' : 'uploading',
            progress: 0,
            startTime: Date.now(),
            nodePosition: node.position.clone(),
            execId,
            variableValues: {},
            currentStep: 0,
            totalSteps: steps.length,
        };
        setQuickHackExecs(prev => new Map(prev).set(execId, exec));
        if (!needsInput) {
            await sendQuickHackTask(execId, exec, steps);
        }
    }, [sendQuickHackTask]);

    // ── QuickHack: execute a specific hack from the floating panel ──
    //    Multi-agent hosts (e.g. Apollo + Meterpreter on the same machine)
    //    defer execution and open the agent picker; single-candidate hosts
    //    execute immediately as before. ──
    const handleExecuteQuickHack = useCallback(async (hack: QuickHackDef) => {
        if (!quickHackTarget) return;
        const node = quickHackTarget;
        const allCbs: Callback[] = (node.allCallbacks as Callback[] | undefined)
            ?? (node.data ? [node.data as unknown as Callback] : []);
        // Only alive, hack-compatible callbacks count as candidates. Use
        // `isCallbackAlive` (sleep_info-aware) rather than the operator's
        // hidden flag — see comment in QuickHackAgentPicker for the same
        // reasoning. Dead callbacks still show up in the picker for
        // multi-agent disambiguation visibility, but the filter excludes
        // them so a single-candidate node never auto-picks a dead row.
        const edgesNow = edgesData?.callbackgraphedge ?? [];
        const candidates = allCbs.filter(cb => {
            if (cb.dead) return false;
            if (!isCallbackAlive(cb, edgesNow)) return false;
            const t = (cb as any)?.payload?.payloadtype?.name?.toLowerCase?.();
            return isHackCompatible(hack, t);
        });
        if (candidates.length > 1) {
            // Keep the QuickHackPanel mounted so the operator still sees
            // which hack they chose; the picker opens to its right.
            setAgentPickFor({ hack, candidates });
            return;
        }
        // Single (or zero) candidate — fall through to the existing flow.
        const target = candidates[0] ?? (node.data as unknown as Callback | null);
        if (!target) return;
        setQuickHackTarget(null);
        setAgentPickFor(null);
        await executeQuickHackForCallback(hack, node, target);
    }, [quickHackTarget, executeQuickHackForCallback]);

    const handlePickAgent = useCallback(async (cb: Callback) => {
        if (!quickHackTarget || !agentPickFor) return;
        const { hack } = agentPickFor;
        const node = quickHackTarget;
        setQuickHackTarget(null);
        setAgentPickFor(null);
        await executeQuickHackForCallback(hack, node, cb);
    }, [quickHackTarget, agentPickFor, executeQuickHackForCallback]);

    // ── QuickHack: resume after all variables are filled ──
    const handleResumeQuickHack = useCallback(async (execId: string) => {
        const exec = quickHackExecs.get(execId);
        if (!exec || exec.phase !== 'awaiting_input') return;
        const vars = exec.hack.variables ?? [];
        const allFilled = vars.every(v => (exec.variableValues[v.key] ?? '').length > 0);
        if (!allFilled) return;
        // Clear any active node-picking
        setNodePickingFor(null);
        setIPSelectionMenu(null);
        // Resolve params for all steps — variant by agent type, then
        // substitute {{KEY}} placeholders.
        const steps = getHackSteps(exec.hack, exec.agentType);
        const resolvedSteps = steps.map(s => ({
            command: s.command,
            params: resolveParams(s.params, vars, exec.variableValues),
        }));
        await sendQuickHackTask(execId, exec, resolvedSteps);
    }, [quickHackExecs, sendQuickHackTask]);

    // ── QuickHack: update a variable value ──
    const handleUpdateVarValue = useCallback((execId: string, key: string, value: string) => {
        updateExec(execId, prev => ({
            ...prev,
            variableValues: { ...prev.variableValues, [key]: value },
        }));
    }, [updateExec]);

    // ── QuickHack: request node picking mode for IP variable ──
    const handleRequestNodePick = useCallback((execId: string, varKey: string) => {
        // Toggle: if already picking for this key, cancel
        if (nodePickingFor?.execId === execId && nodePickingFor?.varKey === varKey) {
            setNodePickingFor(null);
            setIPSelectionMenu(null);
        } else {
            setNodePickingFor({ execId, varKey });
            setIPSelectionMenu(null);
        }
    }, [nodePickingFor]);

    // ── QuickHack: handle node click during IP picking mode ──
    const handleNodeClickForIPPick = useCallback((node: TopoNode, clickScreenPos: { x: number; y: number }) => {
        if (!nodePickingFor) return false; // not in picking mode
        const cb = node.data;
        if (!cb) return false;
        const allIPs = extractAllIPs(cb.ip ?? cb.ip_address);
        if (allIPs.length === 0) {
            snackActions.error('No IP address found on this node');
            return true;
        }
        if (allIPs.length === 1) {
            // Single IP — set directly
            handleUpdateVarValue(nodePickingFor.execId, nodePickingFor.varKey, allIPs[0]);
            setNodePickingFor(null);
        } else {
            // Multiple IPs — show submenu
            setIPSelectionMenu({
                ips: allIPs,
                screenPos: clickScreenPos,
                execId: nodePickingFor.execId,
                varKey: nodePickingFor.varKey,
            });
        }
        return true; // consumed the click
    }, [nodePickingFor, handleUpdateVarValue]);

    // ── QuickHack: handle IP selection from submenu ──
    const handleIPSelected = useCallback((ip: string) => {
        if (!ipSelectionMenu) return;
        handleUpdateVarValue(ipSelectionMenu.execId, ipSelectionMenu.varKey, ip);
        setIPSelectionMenu(null);
        setNodePickingFor(null);
    }, [ipSelectionMenu, handleUpdateVarValue]);

    // Keep nodePickHandlerRef in sync with the latest handler
    nodePickHandlerRef.current = handleNodeClickForIPPick;

    // Cleanup all quickhack intervals on unmount
    useEffect(() => {
        return () => {
            quickHackIntervalRef.current.forEach(iv => clearInterval(iv));
            // eslint-disable-next-line react-hooks/exhaustive-deps
            quickHackIntervalRef.current.clear();
        };
    }, []);

    const handleSetParent = useCallback(async () => {
        if (!setParentModal || !selectedProfile || !selectedDestination) {
            snackActions.error('Please select a C2 profile and destination node');
            return;
        }
        const isSourceCustom = setParentModal.isCustom;
        const isDestCustom = selectedDestination.isCustom;

        if (isSourceCustom) {
            try {
                const sourceNode = customNodes.find((n: any) => n.id === setParentModal.id);
                if (!sourceNode) { snackActions.error('Source node not found'); return; }
                const { unique_id, data } = prepareUpdateNodeData({
                    id: sourceNode.id, hostname: sourceNode.hostname, ip_address: sourceNode.ip_address,
                    operating_system: sourceNode.operating_system, architecture: sourceNode.architecture,
                    username: sourceNode.username || undefined,
                    description: sourceNode.description, hidden: sourceNode.hidden || false,
                    operation_id: currentOpId || undefined,
                    parent_id: (isDestCustom ? selectedDestination.db_id : selectedDestination.id) as string | number,
                    parent_type: isDestCustom ? 'custom' : 'callback', c2profile: selectedProfile.name as string,
                });
                const result = await updateCustomNodeMutation({ variables: { unique_id, data } });
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Linked to ${isDestCustom ? 'Custom Node' : 'Callback'} #${selectedDestination.display_id || selectedDestination.db_id}`);
                    refetchCustomNodes();
                } else {
                    snackActions.error('Failed to update connection');
                }
            } catch (e: unknown) {
                snackActions.error('Failed to link: ' + getErrorMessage(e));
            }
            setSetParentModal(null);
            setSetParentNode(null);
            return;
        }

        // MSF synthetic callbacks (IT-DEV etc.) only exist in Minerva's
        // synthetic layer — they're NOT rows in Mythic's `callback` table,
        // so `callbackgraphedge_add` returns "sql: no rows in result set"
        // for any edge that references them. Route through the custom-edge
        // store (`agentstorage`) instead, which accepts arbitrary string
        // IDs and is exactly what we already do for custom nodes.
        const isSourceMsf = isMsfCallback(setParentModal as any);
        const isDestMsf   = isMsfCallback(selectedDestination as any);

        if (isDestCustom || isSourceMsf || isDestMsf) {
            try {
                const sourceKey = isSourceMsf
                    ? `msf-${(setParentModal as any)._msfSessionId
                            ?? (setParentModal.display_id - MSF_DISPLAY_ID_OFFSET)}`
                    : `callback-${setParentModal.display_id}`;
                const destDisplayId = Number(selectedDestination.display_id) || 0;
                const destKey = isDestCustom
                    ? `custom-${selectedDestination.db_id}`
                    : isDestMsf
                        ? `msf-${(selectedDestination as any)._msfSessionId
                                ?? (destDisplayId - MSF_DISPLAY_ID_OFFSET)}`
                        : `callback-${destDisplayId}`;
                const edgeId = `${sourceKey}-to-${destKey}`;
                const newEdge = {
                    id: edgeId,
                    source: String(setParentModal.id),
                    target: String(selectedDestination.id),
                    sourceId: setParentModal.display_id,
                    targetId: isDestCustom ? selectedDestination.db_id : selectedDestination.display_id,
                    c2profile: selectedProfile.name,
                    operation_id: currentOpId || undefined,
                };
                // Drop any pre-existing custom edge from this source so the
                // node ends up with at most one parent (matches the
                // dest=custom branch's behaviour).
                const existingEdgesFromSource = customEdges.filter((e: any) => e.source === String(setParentModal.id));
                for (const edge of existingEdgesFromSource) {
                    try { await deleteCustomEdgeMutation({ variables: { unique_id: generateEdgeUniqueId(edge.id) } }); } catch {}
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                const result = await createCustomEdgeMutation({ variables: { unique_id: generateEdgeUniqueId(edgeId), data: serializeEdgeData(newEdge as any) } });
                if (result.data?.insert_agentstorage_one) {
                    const destLabel =
                        isDestCustom ? `Custom Node #${selectedDestination.db_id}` :
                        isDestMsf    ? `MSF-${(selectedDestination as any)._msfSessionId ?? selectedDestination.display_id}` :
                        `Callback #${selectedDestination.display_id}`;
                    snackActions.success(`Linked to ${destLabel}`);
                    if (setParentNode?.id) clearDisconnected(setParentNode.id);
                    refetchCustomEdges();
                } else {
                    snackActions.error('Failed to save connection');
                }
            } catch (e: unknown) {
                snackActions.error('Failed to link: ' + getErrorMessage(e));
            }
            setSetParentModal(null);
            setSetParentNode(null);
            return;
        }

        // Regular callback → callback
        try {
            if (edgesData?.callbackgraphedge) {
                const existingEdges = edgesData.callbackgraphedge.filter((e: CallbackGraphEdge) => e.source?.id === setParentModal.id && !e.end_timestamp);
                for (const edge of existingEdges) {
                    try {
                        const result = await removeEdge({ variables: { edge_id: edge.id } });
                        if (result.data?.callbackgraphedge_remove?.status === 'success') {
                            snackActions.info(`Removed existing link to Callback #${edge.destination?.display_id}`);
                        }
                    } catch {}
                }
            }
            const addResult = await addEdge({ variables: { source_id: setParentModal.display_id, destination_id: selectedDestination.display_id, c2profile: selectedProfile.name } });
            if (addResult.data?.callbackgraphedge_add?.status === 'success') {
                snackActions.success(`Linked to Callback #${selectedDestination.display_id}`);
            } else if (addResult.data?.callbackgraphedge_add?.error) {
                snackActions.error(`Failed: ${addResult.data.callbackgraphedge_add.error}`);
            } else {
                snackActions.success(`Linked to Callback #${selectedDestination.display_id}`);
            }
            // Operator explicitly re-attached this node — drop the
            // disconnected flag so future orphaning auto-rescues again.
            if (setParentNode?.id) clearDisconnected(setParentNode.id);
            refetchCallbacks();
            refetchEdges();
            setSetParentModal(null);
            setSetParentNode(null);
        } catch (e: unknown) {
            snackActions.error('Failed to add edge: ' + getErrorMessage(e));
        }
    }, [setParentModal, selectedProfile, selectedDestination, customNodes, customEdges, edgesData, currentOpId,
        updateCustomNodeMutation, deleteCustomEdgeMutation, createCustomEdgeMutation, removeEdge, addEdge,
        refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges,
        setParentNode, clearDisconnected]);

    const filteredCallbacksForParent = useMemo(() => {
        if (!setParentModal) return [];
        // Map raw CustomGraphNode → Callback-compatible shape for the modal
        const mappedCustomNodes = customNodes.map((n: any) => ({
            id: `custom-${n.id}`,
            db_id: n.id,
            display_id: n.id,
            host: n.hostname,
            ip: n.ip_address,
            os: n.operating_system,
            architecture: n.architecture,
            user: n.username || 'N/A',
            description: n.description || '',
            isHidden: n.hidden || false,
            isCustom: true as const,
            timestamp: n.timestamp,
            parent_id: n.parent_id,
            parent_type: n.parent_type,
            c2profile: n.c2profile,
            integrity_level: 2,
            payload: null,
        }));
        const allNodes = [...(callbacksData?.callback || []), ...mappedCustomNodes];
        return allNodes
            .filter((c: any) => {
                // Exclude the node being linked (same node, different id format for custom)
                if (setParentModal.isCustom && c.isCustom) return c.db_id !== setParentModal.id;
                if (!setParentModal.isCustom && !c.isCustom) return c.id !== setParentModal.id;
                return true;
            })
            .sort((a: any, b: any) => {
                if (a.isCustom && !b.isCustom) return -1;
                if (!a.isCustom && b.isCustom) return 1;
                return (a.display_id ?? 0) - (b.display_id ?? 0);
            });
    }, [callbacksData, setParentModal, customNodes]);

    const ctxNode = useMemo(() =>
        ctxMenu ? nodes.find(n => n.id === ctxMenu.nodeId) || null : null,
        [ctxMenu, nodes]
    );

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500/30 selection:text-white overflow-hidden">
            <div className={cn(
                "flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden relative",
                isSidebarCollapsed ? "ml-16" : "ml-64"
            )}>
                {/* Top toolbar */}
                <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-3 pointer-events-auto">
                        <div className="bg-black/70 backdrop-blur-md border border-cyan-500/20 px-4 py-2 flex items-center gap-3">
                            <Network size={16} className="text-cyan-400" />
                            <span className="font-mono text-sm font-bold tracking-widest text-cyan-400">3D CYBER-TOPOLOGY</span>
                            {edgesLoading && (
                                <RefreshCw size={14} className="text-cyan-400 animate-spin" />
                            )}
                        </div>
                    </div>

                    <div className="relative pointer-events-auto" ref={toolMenuRef}>
                        <button
                            onClick={() => setShowToolMenu(v => !v)}
                            className={cn(
                                "px-3 py-2 text-xs font-mono border transition-colors bg-black/70 backdrop-blur-md",
                                showToolMenu
                                    ? "border-cyan-500/30 text-cyan-400"
                                    : "border-white/10 text-gray-500 hover:text-cyan-400 hover:border-cyan-500/30"
                            )}
                            title="Topology settings"
                        >
                            <Settings size={14} />
                        </button>

                        <AnimatePresence>
                            {showToolMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                    transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute right-0 top-full mt-2 w-56 bg-[#0a0a0a]/95 backdrop-blur-md border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.1)] py-1 font-mono text-xs z-50"
                                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
                                >
                                    <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1">
                                        DISPLAY OPTIONS
                                    </div>
                                    <button
                                        onClick={() => setShowSubnets(v => !v)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-cyan-500/10 transition-colors"
                                    >
                                        <BoxIcon size={12} className={showSubnets ? 'text-purple-400' : 'text-gray-600'} />
                                        <span className={showSubnets ? 'text-purple-400' : 'text-gray-500'}>Subnet Zones</span>
                                        <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 border', showSubnets ? 'border-purple-500/30 text-purple-400' : 'border-white/10 text-gray-600')}>
                                            {showSubnets ? 'ON' : 'OFF'}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => setShowTunnels(v => !v)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-cyan-500/10 transition-colors"
                                    >
                                        <Cable size={12} className={showTunnels ? 'text-emerald-400' : 'text-gray-600'} />
                                        <span className={showTunnels ? 'text-emerald-400' : 'text-gray-500'}>Tunnel Flows</span>
                                        <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 border', showTunnels ? 'border-emerald-500/30 text-emerald-400' : 'border-white/10 text-gray-600')}>
                                            {showTunnels ? 'ON' : 'OFF'}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => setShowInactive(v => !v)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-cyan-500/10 transition-colors"
                                    >
                                        {showInactive ? <Eye size={12} className="text-cyan-400" /> : <EyeOff size={12} className="text-gray-600" />}
                                        <span className={showInactive ? 'text-cyan-400' : 'text-gray-500'}>Inactive Edges</span>
                                        <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 border', showInactive ? 'border-cyan-500/30 text-cyan-400' : 'border-white/10 text-gray-600')}>
                                            {showInactive ? 'ON' : 'OFF'}
                                        </span>
                                    </button>
                                    <div className="border-t border-white/10 my-1" />
                                    <button
                                        onClick={() => { handleRefreshData(); setShowToolMenu(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-400 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
                                        title="Re-fetch callbacks/edges; keeps your current node layout"
                                    >
                                        <RefreshCw size={12} />
                                        <span>Refresh Data</span>
                                    </button>
                                    <button
                                        onClick={() => { handleRefresh(); setShowToolMenu(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-400 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
                                        title="Re-fetch and reset the layout — dragged positions are discarded"
                                    >
                                        <RefreshCw size={12} />
                                        <span>Refresh Topology</span>
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Three.js Canvas */}
                <Canvas
                    camera={{ position: [0, 8, 20], fov: 55, near: 0.1, far: 200 }}
                    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                    // frameloop="always" — continuous render so useFrame-driven
                    // animations (rotations, emissive pulses, edge dashes) update
                    // every frame. Demand mode caused visible stutter where
                    // animations only ticked on pointer events / invalidate().
                    frameloop="always"
                    dpr={[1, 1.5]}
                    onCreated={({ gl }) => {
                        gl.setClearColor(BG_COLOR);
                        gl.toneMapping = ACESFilmicToneMapping;
                        gl.toneMappingExposure = 1.2;
                    }}
                    onPointerMissed={(e: MouseEvent) => {
                        // r3f forwards the native MouseEvent; button 2 = right-click.
                        // A right-click on empty background opens the global menu;
                        // any other click clears all overlays.
                        if (e.button === 2) {
                            setBgMenu({ x: e.clientX, y: e.clientY });
                            setCtxMenu(null);
                            setSubnetCtxMenu(null);
                            return;
                        }
                        setSelectedId(null);
                        setCtxMenu(null);
                        setBgMenu(null);
                        setSubnetCtxMenu(null);
                        setQuickHackTarget(null);
                        setIPSelectionMenu(null);
                    }}
                    // Suppress the native browser context menu so our overlay
                    // is the only thing the user sees on right-click.
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ width: '100%', height: '100%' }}
                >
                    <Suspense fallback={null}>
                        <TopologyScene
                            nodes={nodes}
                            edges={edges}
                            subnets={visibleSubnets}
                            selectedId={selectedId}
                            onSelect={handleSelect}
                            onContextMenu={handleContextMenu}
                            dragNodeId={dragNodeId}
                            setDragNodeId={setDragNodeId}
                            onDragMove={handleNodeDragMove}
                            onDragEnd={handleNodeDragEnd}
                            showSubnets={showSubnets}
                            pickingDimNodes={pickingDimNodes}
                            onSubnetContextMenu={handleSubnetContextMenu}
                        />

                        {/* Tunnel-flow overlay — shows tunnel traffic running on
                            top of the existing callback graph. Hover any flow
                            for full port + callback details. */}
                        {showTunnels && tunnelPorts.length > 0 && (
                            <TunnelLayer
                                ports={tunnelPorts.filter(p => !p.deleted)}
                                nodes={nodes}
                                corePos={nodes.find(n => n.id === 'core')?.position ?? new Vector3(0, 0, 0)}
                                selectedPortId={selectedTunnelPortId}
                                onSelectPort={(id) => setSelectedTunnelPortId(prev => prev === id ? null : id)}
                            />
                        )}
                        {/* Project quickhack target node position to screen */}
                        {quickHackTarget && (
                            <ScreenProjector
                                worldPos={quickHackTarget.position}
                                onProject={setQuickHackScreenPos}
                            />
                        )}
                        {/* Project LINK_TO_PARENT source node position to screen each frame */}
                        {setParentNode && (
                            <ScreenProjector
                                worldPos={setParentNode.position}
                                onProject={setSetParentScreenPos}
                            />
                        )}
                        {/* QuickHack execution overlays — rendered in 3D space above target nodes */}
                        {(() => {
                            const groups = new Map<number, QuickHackExecution[]>();
                            for (const exec of quickHackExecs.values()) {
                                const arr = groups.get(exec.callbackId) || [];
                                arr.push(exec);
                                groups.set(exec.callbackId, arr);
                            }
                            return Array.from(groups.entries()).map(([callbackId, execs]) => {
                                const liveNode = nodes.find(n => n.allCallbacks?.some((c: Callback) => c.id === callbackId)) ?? null;
                                const nodeRef = { current: liveNode };
                                return (
                                <NodeFollower key={callbackId} nodeRef={nodeRef} fallback={execs[0].nodePosition} yOffset={1.5}>
                                    <Html center style={{ pointerEvents: 'none' }}>
                                        <div className="flex items-start gap-[6px] pointer-events-none" style={{ transform: 'translateY(-50%)' }}>
                                            {execs.map(exec => (
                                                <QuickHackOverlayWrapper
                                                    key={exec.execId}
                                                    execution={exec}
                                                    onRemove={removeExec}
                                                    onResume={handleResumeQuickHack}
                                                    onUpdateVarValue={handleUpdateVarValue}
                                                    onRequestNodePick={handleRequestNodePick}
                                                    nodePickingVarKey={nodePickingFor?.execId === exec.execId ? nodePickingFor.varKey : null}
                                                    intervalRef={quickHackIntervalRef}
                                                    nodes={nodes}
                                                />
                                            ))}
                                        </div>
                                    </Html>
                                </NodeFollower>
                            );});
                        })()}
                    </Suspense>
                </Canvas>

                {/* Headless subscription monitors — must be outside Canvas for ApolloProvider context */}
                {Array.from(quickHackExecs.values()).map(exec => (
                    <QuickHackSubscriptionMonitor
                        key={exec.execId}
                        execution={exec}
                        onUpdate={updateExec}
                        onRemove={removeExec}
                        intervalRef={quickHackIntervalRef}
                    />
                ))}

                {/* 2D Overlay: Stats */}
                <StatsHUD nodes={nodes} edges={edges} subnets={subnets} />

                {/* 2D Overlay: Context Menu */}
                {ctxMenu && ctxNode && (
                    <ContextMenu3D
                        x={ctxMenu.x}
                        y={ctxMenu.y}
                        node={ctxNode}
                        onClose={() => setCtxMenu(null)}
                        onNavigateConsole={handleNavigateConsole}
                        preferredDisplayId={preferredDisplayIdFor(ctxNode)}
                        onLock={handleLockCallback}
                        onHide={handleHideCallback}
                        onViewDetails={openDetails}
                        onEditDescription={openEditDescription}
                        onEditCustomNode={openEditCustomNode}
                        onDeleteCustomNode={handleDeleteCustomNode}
                        onSetLinkFocus={handleSetLinkFocus}
                        onClearLinkFocus={handleClearLinkFocus}
                        linkFocusNodeId={linkFocusNodeId}
                        onSetParent={openSetParent}
                        onDisconnectParent={handleDisconnectParent}
                        getParentEdge={getParentEdge}
                        onTaskForEdge={openTaskForEdge}
                        onRemoveEdge={handleOpenRemoveEdge}
                        onAddP2PEdge={openManuallyAddEdge}
                        onEventing={openEventing}
                        onQuickHack={handleOpenQuickHack}
                    />
                )}

                {/* 2D Overlay: Background Context Menu (right-click on empty scene) */}
                {bgMenu && (
                    <BackgroundContextMenu3D
                        x={bgMenu.x}
                        y={bgMenu.y}
                        onClose={() => setBgMenu(null)}
                        onCreateCustomNode={openCreateCustomNode}
                        onRefresh={handleRefresh}
                        onToggleSubnets={() => setShowSubnets(v => !v)}
                        showSubnets={showSubnets}
                        onToggleInactive={() => setShowInactive(v => !v)}
                        showInactive={showInactive}
                        onToggleHidden={() => setShowHidden(v => !v)}
                        showHidden={showHidden}
                        hiddenSubnetCount={hiddenSubnets.size}
                        onRestoreAllSubnets={handleRestoreAllSubnets}
                    />
                )}

                {/* 2D Overlay: Per-CIDR Subnet Context Menu */}
                {subnetCtxMenu && (
                    <SubnetContextMenu3D
                        x={subnetCtxMenu.x}
                        y={subnetCtxMenu.y}
                        cidr={subnetCtxMenu.cidr}
                        onClose={() => setSubnetCtxMenu(null)}
                        onHide={handleHideSubnet}
                    />
                )}

                {/* QuickHack floating panel — anchored near the target node */}
                <AnimatePresence>
                    {quickHackTarget && quickHackTarget.type === 'callback' && (
                        <QuickHackPanel
                            node={quickHackTarget}
                            screenPos={quickHackScreenPos}
                            onSelectHack={handleExecuteQuickHack}
                            onClose={() => { setQuickHackTarget(null); setAgentPickFor(null); }}
                            hacks={quickHacks}
                            pendingHackId={agentPickFor?.hack.id ?? null}
                        />
                    )}
                </AnimatePresence>

                {/* Agent picker — opens to the right of the QuickHack panel
                    when the target node has more than one compatible agent. */}
                <AnimatePresence>
                    {quickHackTarget && agentPickFor && (
                        <QuickHackAgentPicker
                            hack={agentPickFor.hack}
                            candidates={agentPickFor.candidates}
                            screenPos={quickHackScreenPos}
                            onSelectCallback={handlePickAgent}
                            onCancel={() => setAgentPickFor(null)}
                        />
                    )}
                </AnimatePresence>

                {/* QuickHack execution overlays are now rendered inside the Canvas via Html */}

                {/* IP selection submenu — shown when a node has multiple IPs during IP picking */}
                {ipSelectionMenu && (
                    <IPSelectionMenu
                        ips={ipSelectionMenu.ips}
                        onSelect={handleIPSelected}
                        screenPos={ipSelectionMenu.screenPos}
                    />
                )}

                {/* 2D Overlay: Detail Panel */}
                <AnimatePresence>
                    {selectedNode && (
                        <DetailPanel
                            node={selectedNode}
                            onClose={() => setSelectedId(null)}
                            onSessionPick={handlePickNodeSession}
                            preferredDisplayId={preferredDisplayIdFor(selectedNode)}
                            edges={edgesData?.callbackgraphedge}
                        />
                    )}
                </AnimatePresence>

                {/* Right-edge HUD column — system legend on top, tunnel
                    legend stacked under it (when the overlay is on).
                    Bottom-right of the screen is reserved for the global
                    music player so panels never overlap. */}
                <div className="absolute top-20 right-4 z-30 flex flex-col gap-2 items-end pointer-events-none max-h-[calc(100vh-7rem)] overflow-y-auto cyber-scrollbar">
                    {/* System legend (always visible) */}
                    <div
                        className="px-4 py-3 font-mono text-[9px] space-y-2 pointer-events-auto"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(5,5,15,0.88) 100%)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 0 1px rgba(34,211,238,0.1), 0 0 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                            clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                        }}
                    >
                        <div className="text-signal uppercase tracking-[0.2em] text-[9px] font-bold mb-1.5">SYS.LEGEND</div>
                        <LegendItem color="#22d3ee" shape="octahedron" label="CORE" />
                        <LegendItem color="#22c55e" shape="sphere" label="ALIVE" />
                        <LegendItem color="#ff6b6b" shape="sphere" label="HIGH PRIV" />
                        <LegendItem color="#ef4444" shape="sphere" label="DEAD" />
                        <LegendItem color="#f59e0b" shape="cube" label="CUSTOM" />
                        <LegendItem color="#22d3ee" shape="line" label="C2" />
                        <LegendItem color="#a855f7" shape="line" label="P2P" />
                        <LegendItem color="#22c55e" shape="box" label="SUBNET" />
                    </div>

                    {/* Tunnel HUD: clear-focus chip + flow legend
                        (only visible when there's something to legend) */}
                    {showTunnels && tunnelPorts.some(p => !p.deleted) && (
                        <>
                            {selectedTunnelPortId !== null && (
                                <button
                                    onClick={() => setSelectedTunnelPortId(null)}
                                    className="pointer-events-auto px-2.5 py-1 border border-yellow-500/40 text-yellow-400 font-mono text-[10px] tracking-widest hover:bg-yellow-500/10 transition-colors"
                                >
                                    CLEAR TUNNEL FOCUS
                                </button>
                            )}
                            <div className="pointer-events-auto">
                                <TunnelLayerLegend />
                            </div>
                        </>
                    )}
                </div>

                <Topology3DModals
                    editDescriptionModal={editDescriptionModal}
                    setEditDescriptionModal={setEditDescriptionModal}
                    newDescription={newDescription}
                    setNewDescription={setNewDescription}
                    handleSaveDescription={handleSaveDescription}
                    editCustomNodeModal={editCustomNodeModal}
                    setEditCustomNodeModal={setEditCustomNodeModal}
                    customNodeForm={customNodeForm}
                    setCustomNodeForm={setCustomNodeForm}
                    handleUpdateCustomNode={handleUpdateCustomNode}
                    createCustomNodeModal={createCustomNodeModal}
                    setCreateCustomNodeModal={setCreateCustomNodeModal}
                    handleCreateCustomNode={handleCreateCustomNode}
                    detailsModal={detailsModal}
                    setDetailsModal={setDetailsModal}
                    setParentModal={setParentModal}
                    setSetParentModal={(v) => { setSetParentModal(v); if (v === null) setSetParentNode(null); }}
                    setParentScreenPos={setParentScreenPos}
                    filteredCallbacksForParent={filteredCallbacksForParent}
                    callbackEdges={edgesData?.callbackgraphedge || []}
                    selectedDestination={selectedDestination}
                    setSelectedDestination={setSelectedDestination}
                    isP2PConnection={isP2PConnection}
                    setIsP2PConnection={setIsP2PConnection}
                    selectedProfile={selectedProfile}
                    setSelectedProfile={setSelectedProfile}
                    edgeLabel={edgeLabel}
                    setEdgeLabel={setEdgeLabel}
                    p2pData={p2pData}
                    allC2Data={allC2Data}
                    handleSetParent={handleSetParent}
                    taskForEdgeModal={taskForEdgeModal}
                    setTaskForEdgeModal={setTaskForEdgeModal}
                    taskForEdgeCommand={taskForEdgeCommand}
                    setTaskForEdgeCommand={setTaskForEdgeCommand}
                    taskForEdgeParams={taskForEdgeParams}
                    setTaskForEdgeParams={setTaskForEdgeParams}
                    taskingForEdge={taskingForEdge}
                    setTaskingForEdge={setTaskingForEdge}
                    linkCommandsLoading={linkCommandsLoading}
                    linkCommandsData={linkCommandsData}
                    createTask={createTask}
                    showEventingDialog={showEventingDialog}
                    setShowEventingDialog={setShowEventingDialog}
                    manuallyAddEdgeModal={manuallyAddEdgeModal}
                    setManuallyAddEdgeModal={setManuallyAddEdgeModal}
                    addEdgeSelectedProfile={addEdgeSelectedProfile}
                    setAddEdgeSelectedProfile={setAddEdgeSelectedProfile}
                    addEdgeSelectedDest={addEdgeSelectedDest}
                    setAddEdgeSelectedDest={setAddEdgeSelectedDest}
                    addEdgeDestOptions={addEdgeDestOptions}
                    setAddEdgeDestOptions={setAddEdgeDestOptions}
                    handleManuallyAddEdge={handleManuallyAddEdge}
                    removeEdgeModal={removeEdgeModal}
                    setRemoveEdgeModal={setRemoveEdgeModal}
                    removeEdge={removeEdge}
                />
                {/* MSF SOCKS Routes dialog — opened by the SOCKS Quickhack on a meterpreter node. */}
                {socksDialogFor && (() => {
                    const sid = msfSessionIdOf(socksDialogFor);
                    if (!sid) return null;
                    return (
                        <MsfSocksDialog
                            open={true}
                            onClose={() => setSocksDialogFor(null)}
                            sessionId={sid}
                            label={`${socksDialogFor.user ?? ''}@${socksDialogFor.host ?? ''}`}
                            ipField={socksDialogFor.ip}
                        />
                    );
                })()}
            </div>
        </div>
    );
}

const LegendItem = ({ color, shape, label }: { color: string; shape: string; label: string }) => (
    <div className="flex items-center gap-2">
        {shape === 'sphere' && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />}
        {shape === 'octahedron' && <div className="w-2 h-2 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />}
        {shape === 'cube' && <div className="w-2 h-2" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />}
        {shape === 'line' && <div className="w-3.5 h-px" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />}
        {shape === 'box' && <div className="w-2.5 h-2 border" style={{ borderColor: `${color}90`, boxShadow: `0 0 4px ${color}40` }} />}
        <span className="text-signal tracking-[0.1em]">{label}</span>
    </div>
);
