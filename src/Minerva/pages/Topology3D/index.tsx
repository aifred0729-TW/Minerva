import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import type { Callback, CallbackGraphEdge } from '../../types/callbacks';
import * as THREE from 'three';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { useMutation, useLazyQuery } from "@apollo/client/react";
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
}from 'lucide-react';
import { useAppStore } from '../../store';
import { cn, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    GET_CALLBACKS,
    GET_CALLBACK_GRAPH_EDGES,
    GET_P2P_PROFILES_AND_CALLBACKS,
    GET_C2_PROFILES,
    GET_CUSTOM_GRAPH_NODES,
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
}from '../../lib/api';
import {
    parseAgentStorageResults,
    prepareUpdateNodeData,
    generateUniqueId,
    parseEdgeStorageResults,
    serializeEdgeData,
    generateEdgeUniqueId,
}from '../../lib/customGraphNodeService';
import { MythicDialog } from '../../components/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { CyberModal } from '../../components/CyberModal';
import type { TopoNode, QuickHackExecution } from '../../types/topology';
import { QuickHackDef, QuickHackStep, useQuickHacks, hackNeedsInput, resolveParams, getHackSteps, extractAllIPs } from '../../lib/quickhacks';
import { playThreeLoad, playSelectQH, playDoneQH } from '../../lib/soundEffects';
import { BG_COLOR, buildTopology, extractPrimaryIP } from './topology';
import { QuickHackOverlayWrapper, QuickHackSubscriptionMonitor, NodeFollower } from './QuickHack';
import { ContextMenu3D, DetailPanel, StatsHUD, ScreenProjector, TopologyScene } from './DetailPanel';
import { Html } from '@react-three/drei';
import { QuickHackPanel, IPSelectionMenu } from './QuickHack';
import { Topology3DModals } from './Topology3DModals';
import { usePageVisible } from '../../lib/usePageVisible';

export default function Topology3D() {
    const navigate = useNavigate();
    const { isSidebarCollapsed } = useAppStore();
    const quickHacks = useQuickHacks();

    const pageVisible = usePageVisible();

    // Play 3D loading sound on mount
    useEffect(() => { playThreeLoad(); }, []);

    // ── Data fetching (matching 2D CallbackGraph queries) ──
    const { data: callbacksData, refetch: refetchCallbacks } = useQuery<any>(GET_CALLBACKS, { variables: { limit: 5000 }, pollInterval: pageVisible ? 10000 : 0 });
    const { data: edgesData, loading: edgesLoading, refetch: refetchEdges } = useQuery<any>(GET_CALLBACK_GRAPH_EDGES, { pollInterval: pageVisible ? 10000 : 0 });
    const { data: customNodesData, refetch: refetchCustomNodes } = useQuery<any>(GET_CUSTOM_GRAPH_NODES);
    const { data: customEdgesData, refetch: refetchCustomEdges } = useQuery<any>(GET_CUSTOM_GRAPH_EDGES);
    const { data: linkFocusData } = useQuery<any>(GET_LINK_FOCUS, { pollInterval: pageVisible ? 10000 : 0 });

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
    const [showHidden, _setShowHidden] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const [showSubnets, setShowSubnets] = useState(true);
    const [showToolMenu, setShowToolMenu] = useState(false);
    const toolMenuRef = useRef<HTMLDivElement>(null);

    // ── Modal/Dialog State ──
    const [editDescriptionModal, setEditDescriptionModal] = useState<Callback | null>(null);
    const [newDescription, setNewDescription] = useState('');
    const [detailsModal, setDetailsModal] = useState<Callback | null>(null);
    const [setParentModal, setSetParentModal] = useState<Callback | null>(null);
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
    // Multiple simultaneous executions keyed by execId
    const [quickHackExecs, setQuickHackExecs] = useState<Map<string, QuickHackExecution>>(new Map());
    // (quickhack exec overlays are rendered in 3D via Html — no screen projection needed)
    const quickHackIntervalRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    // Node-picking mode for IP variable: { execId, varKey } when active
    const [nodePickingFor, setNodePickingFor] = useState<{ execId: string; varKey: string } | null>(null);
    // Multi-IP selection submenu state
    const [ipSelectionMenu, setIPSelectionMenu] = useState<{ ips: string[]; screenPos: { x: number; y: number }; execId: string; varKey: string } | null>(null);

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
    const userPositions = useRef<Map<string, THREE.Vector3>>(new Map());

    // ── Build topology ──
    const customNodes: any[] = useMemo(() => {
        if (!customNodesData?.agentstorage) return [];
        return parseAgentStorageResults(customNodesData.agentstorage);
    }, [customNodesData]);

    const customEdges = useMemo(() => {
        if (!customEdgesData?.agentstorage) return [];
        return parseEdgeStorageResults(customEdgesData.agentstorage);
    }, [customEdgesData]);

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

    // Generate focus link edges — auto-link all callbacks to the focus node
    // Matches 2D behavior: every callback gets a focus edge to the designated node
    const focusEdges = useMemo(() => {
        if (!linkFocusNodeId) return [];
        const cbs = callbacksData?.callback || [];
        return cbs
            .filter((cb: Callback) => String(cb.id) !== linkFocusNodeId)
            .map((cb: Callback) => ({
                source: String(cb.id),          // child
                target: linkFocusNodeId,         // parent (focus node)
                c2profile: 'focus',
            }));
    }, [callbacksData, linkFocusNodeId]);

    const { nodes, edges, subnets } = useMemo(() => {
        const topo = buildTopology(
            edgesData?.callbackgraphedge || [],
            callbacksData?.callback || [],
            customNodes,
            customEdges,
            focusEdges,
            showInactive,
            showHidden,
        );
        // Re-apply user-dragged positions so nodes stay where they were moved
        for (const node of topo.nodes) {
            const saved = userPositions.current.get(node.id);
            if (saved) node.position.copy(saved);
        }
        return topo;
    }, [edgesData, callbacksData, customNodes, customEdges, focusEdges, showInactive, showHidden]);

    const selectedNode = useMemo(() =>
        nodes.find(n => n.id === selectedId) || null,
        [nodes, selectedId]
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
    const handleRefresh = useCallback(() => {
        refetchCallbacks();
        refetchEdges();
        refetchCustomNodes();
        refetchCustomEdges();
        snackActions.info('Topology refreshed');
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

    const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>, nodeId: string) => {
        const nativeEvent = e.nativeEvent || (e as unknown as MouseEvent);
        setCtxMenu({
            x: nativeEvent.clientX ?? (e as unknown as MouseEvent).clientX ?? 0,
            y: nativeEvent.clientY ?? (e as unknown as MouseEvent).clientY ?? 0,
            nodeId,
        });
    }, []);

    const handleNavigateConsole = useCallback((displayId: number) => {
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
            return { ...node.data, isCustom: true, id: node.data?.id, db_id: node.data?.db_id, display_id: node.data?.display_id, host: node.label, ip: node.sublabel || node.data?.ip, os: node.data?.os || node.data?.operating_system, architecture: node.data?.architecture, user: node.data?.user, description: node.data?.description, callback_id: node.data?.id };
        }
        // callback type — data is the representative callback
        const cb = node.data;
        return { ...cb, isCustom: false, id: cb?.id, callback_id: cb?.id, display_id: cb?.display_id, host: cb?.host, ip: extractPrimaryIP(cb?.ip), os: cb?.os || cb?.operating_system, architecture: cb?.architecture, user: cb?.user, description: cb?.description, locked: cb?.locked, integrity_level: cb?.integrity_level, domain: cb?.domain, pid: cb?.pid, sleep_info: cb?.sleep_info, payloadType: cb?.payload?.payloadtype?.name };
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
        if (callback.isCustom) {
            try {
                const { unique_id, data } = prepareUpdateNodeData({
                    id: callback.db_id, hostname: callback.host, ip_address: callback.ip,
                    operating_system: callback.os, architecture: callback.architecture,
                    username: callback.user !== 'N/A' ? callback.user : undefined,
                    description: callback.description, hidden: callback.isHidden,
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
    }, [resolveCallbackData, getParentEdge, updateCustomNodeMutation, deleteCustomEdgeMutation, removeEdge, refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges]);

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
    }, [editCustomNodeModal, customNodeForm, updateCustomNodeMutation, refetchCustomNodes]);

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

    // ── QuickHack: actually send the task to Mythic (used by both initial exec and resume) ──
    const sendQuickHackTask = useCallback(async (execId: string, exec: QuickHackExecution, resolvedSteps: QuickHackStep[]) => {
        const total = resolvedSteps.length;

        for (let i = 0; i < total; i++) {
            const step = resolvedSteps[i];
            // Progress band per step: evenly divide 0-90 across steps
            const bandStart = (i / total) * 90;
            const bandUploadEnd = bandStart + (0.33 / total) * 90;   // first third of band = uploading
            const bandEnd = ((i + 1) / total) * 90;

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
        // All steps completed — the task subscription will handle final completion
    }, [createTask, updateExec]);

    // ── QuickHack: execute a specific hack from the floating panel ──
    const handleExecuteQuickHack = useCallback(async (hack: QuickHackDef) => {
        if (!quickHackTarget) return;
        const d = resolveCallbackData(quickHackTarget);
        setQuickHackTarget(null); // close the panel

        const steps = getHackSteps(hack);
        const execId = `qhx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const needsInput = hackNeedsInput(hack);
        const exec: QuickHackExecution = {
            hack,
            callbackId: d.callback_id ?? d.id,
            callbackDisplayId: d.display_id,
            callbackHost: d.host || d.ip || 'unknown',
            taskId: null,
            phase: needsInput ? 'awaiting_input' : 'uploading',
            progress: 0,
            startTime: Date.now(),
            nodePosition: quickHackTarget.position.clone(),
            execId,
            variableValues: {},
            currentStep: 0,
            totalSteps: steps.length,
        };
        setQuickHackExecs(prev => new Map(prev).set(execId, exec));

        // If no variables needed, send immediately
        if (!needsInput) {
            await sendQuickHackTask(execId, exec, steps);
        }
    }, [quickHackTarget, resolveCallbackData, sendQuickHackTask]);

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
        // Resolve params for all steps
        const steps = getHackSteps(exec.hack);
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
        const allIPs = extractAllIPs(cb.ip);
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
                    id: sourceNode.db_id, hostname: sourceNode.host, ip_address: sourceNode.ip,
                    operating_system: sourceNode.os, architecture: sourceNode.architecture,
                    username: sourceNode.user !== 'N/A' ? sourceNode.user : undefined,
                    description: sourceNode.description, hidden: sourceNode.isHidden,
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
            return;
        }

        if (isDestCustom) {
            try {
                const edgeId = `callback-${setParentModal.display_id}-to-custom-${selectedDestination.db_id}`;
                const newEdge = {
                    id: edgeId, source: String(setParentModal.id), target: selectedDestination.id,
                    sourceId: setParentModal.display_id, targetId: selectedDestination.db_id,
                    c2profile: selectedProfile.name,
                };
                const existingEdgesFromCallback = customEdges.filter((e: any) => e.source === String(setParentModal.id));
                for (const edge of existingEdgesFromCallback) {
                    try { await deleteCustomEdgeMutation({ variables: { unique_id: generateEdgeUniqueId(edge.id) } }); } catch {}
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                const result = await createCustomEdgeMutation({ variables: { unique_id: generateEdgeUniqueId(edgeId), data: serializeEdgeData(newEdge as any) } });
                if (result.data?.insert_agentstorage_one) {
                    snackActions.success(`Linked to Custom Node #${selectedDestination.db_id}`);
                    refetchCustomEdges();
                } else {
                    snackActions.error('Failed to save connection');
                }
            } catch (e: unknown) {
                snackActions.error('Failed to link: ' + getErrorMessage(e));
            }
            setSetParentModal(null);
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
            refetchCallbacks();
            refetchEdges();
            setSetParentModal(null);
        } catch (e: unknown) {
            snackActions.error('Failed to add edge: ' + getErrorMessage(e));
        }
    }, [setParentModal, selectedProfile, selectedDestination, customNodes, customEdges, edgesData,
        updateCustomNodeMutation, deleteCustomEdgeMutation, createCustomEdgeMutation, removeEdge, addEdge,
        refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges]);

    const filteredCallbacksForParent = useMemo(() => {
        if (!setParentModal) return [];
        const allNodes = [...(callbacksData?.callback || []), ...customNodes];
        return allNodes
            .filter((c: Callback) => c.id !== setParentModal.id)
            .sort((a: Callback, b: Callback) => {
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
                                        onClick={() => { handleRefresh(); setShowToolMenu(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-400 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
                                    >
                                        <RefreshCw size={12} />
                                        <span>Refresh Data</span>
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
                    onCreated={({ gl }) => {
                        gl.setClearColor(BG_COLOR);
                        gl.toneMapping = THREE.ACESFilmicToneMapping;
                        gl.toneMappingExposure = 1.2;
                    }}
                    onPointerMissed={() => { setSelectedId(null); setCtxMenu(null); setQuickHackTarget(null); setIPSelectionMenu(null); }}
                    style={{ width: '100%', height: '100%' }}
                >
                    <Suspense fallback={null}>
                        <TopologyScene
                            nodes={nodes}
                            edges={edges}
                            subnets={subnets}
                            selectedId={selectedId}
                            onSelect={handleSelect}
                            onContextMenu={handleContextMenu}
                            dragNodeId={dragNodeId}
                            setDragNodeId={setDragNodeId}
                            onDragEnd={(id, pos) => userPositions.current.set(id, pos.clone())}
                            showSubnets={showSubnets}
                            pickingDimNodes={pickingDimNodes}
                        />
                        {/* Project quickhack target node position to screen */}
                        {quickHackTarget && (
                            <ScreenProjector
                                worldPos={quickHackTarget.position}
                                onProject={setQuickHackScreenPos}
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

                {/* QuickHack floating panel — anchored near the target node */}
                <AnimatePresence>
                    {quickHackTarget && quickHackTarget.type === 'callback' && (
                        <QuickHackPanel
                            node={quickHackTarget}
                            screenPos={quickHackScreenPos}
                            onSelectHack={handleExecuteQuickHack}
                            onClose={() => setQuickHackTarget(null)}
                            hacks={quickHacks}
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
                        />
                    )}
                </AnimatePresence>

                {/* Legend */}
                <div
                    className="absolute bottom-4 right-4 z-40 px-4 py-3 font-mono text-[9px] space-y-2"
                    style={{
                        background: 'linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(5,5,15,0.88) 100%)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        boxShadow: '0 0 1px rgba(34,211,238,0.1), 0 0 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                        clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                    }}
                >
                    <div className="text-gray-700 uppercase tracking-[0.2em] text-[8px] mb-1">SYS.LEGEND</div>
                    <LegendItem color="#22d3ee" shape="octahedron" label="CORE" />
                    <LegendItem color="#22c55e" shape="sphere" label="ALIVE" />
                    <LegendItem color="#ff6b6b" shape="sphere" label="HIGH PRIV" />
                    <LegendItem color="#ef4444" shape="sphere" label="DEAD" />
                    <LegendItem color="#f59e0b" shape="cube" label="CUSTOM" />
                    <LegendItem color="#22d3ee" shape="line" label="C2" />
                    <LegendItem color="#a855f7" shape="line" label="P2P" />
                    <LegendItem color="#22c55e" shape="box" label="SUBNET" />
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
                    detailsModal={detailsModal}
                    setDetailsModal={setDetailsModal}
                    setParentModal={setParentModal}
                    setSetParentModal={setSetParentModal}
                    filteredCallbacksForParent={filteredCallbacksForParent}
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
        <span className="text-gray-500 tracking-[0.1em]">{label}</span>
    </div>
);
