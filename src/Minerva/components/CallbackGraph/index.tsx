import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import type { Callback, CallbackGraphEdge } from '../../types/callbacks';
import { useNavigate } from 'react-router-dom';
import {
    ReactFlow, Background, useNodesState, useEdgesState,
    getConnectedEdges, Node, Edge,
    Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useLazyQuery, useReactiveVar } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { meState } from '../../lib/state';
import { toSvg, toPng } from 'html-to-image';
import {
    GET_CALLBACK_GRAPH_EDGES, GET_CALLBACKS,
    HIDE_CALLBACK_MUTATION, LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION,
    ADD_EDGE_MUTATION, REMOVE_EDGE_MUTATION,
    GET_P2P_PROFILES_AND_CALLBACKS, GET_C2_PROFILES,
    GET_CUSTOM_GRAPH_NODES, CREATE_CUSTOM_GRAPH_NODE,
    UPDATE_CUSTOM_GRAPH_NODE, DELETE_CUSTOM_GRAPH_NODE,
    GET_CUSTOM_GRAPH_EDGES, CREATE_CUSTOM_GRAPH_EDGE,
    DELETE_CUSTOM_GRAPH_EDGE, GET_CALLBACK_GRAPH_EDGES_ALL,
    GET_LINK_COMMANDS_FOR_CALLBACK, CREATE_TASK_MUTATION,
    GET_LINK_FOCUS, SET_LINK_FOCUS, CLEAR_LINK_FOCUS,
} from '../../lib/api';
import {
    parseAgentStorageResults, prepareCreateNodeData,
    prepareUpdateNodeData, generateNextId, generateUniqueId,
    parseEdgeStorageResults, serializeEdgeData, generateEdgeUniqueId,
} from '../../lib/customGraphNodeService';
import { dbg, getErrorMessage, downloadDataUrl } from '../../lib/utils';
import { usePageVisible } from '../../lib/usePageVisible';
import { useLocalStorageState, typedStringSerializer, boolSerializer, boolInverseSerializer } from '../../lib/hooks';
import {
    Share2,
    Network,
    X,
    Plus,
    SlidersHorizontal,
    EyeOff,
    Code,
    Crosshair,
}from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import { useMsfSyntheticCallbacks, consolePathFor } from '../../pages/Callbacks/msfSyntheticCallbacks';
import { GraphModals } from './GraphModals';
import { GraphConfigPanel } from './GraphConfigPanel';
import { GraphContextMenus } from './GraphContextMenus';
import { BrowserScriptView } from './components/BrowserScriptView';
import { nodeTypes, edgeTypes, elk, getElkLayoutedElements } from './layout';

import { buildGraphData } from './buildGraphData';

const log = (...args: unknown[]) => dbg('graph', ...args);

// ── Layout constants ──
const GROUP_PAD = 30;
const NODE_WIDTH = 275;
const NODE_HEIGHT = 100;

interface CallbackGraphProps {
    filterCallbackIds?: number[];
}

/** Edge data stored alongside xyflow edges */
interface GraphEdgeData {
    origAnimated?: boolean;
    origStyle?: React.CSSProperties;
    commandName?: string;
    scriptName?: string;
    [key: string]: unknown;
}

/** Node data stored alongside xyflow nodes */
interface GraphNodeData {
    displayId?: number;
    host?: string;
    display_id?: number;
    isCustom?: boolean;
    isDimmed?: boolean;
    isHighlighted?: boolean;
    groupBy?: string;
    [key: string]: unknown;
}

export const CallbackGraph = React.memo(function CallbackGraph({ filterCallbackIds }: CallbackGraphProps = {}) {
    const pageVisible = usePageVisible();

    // Current operation scopes custom nodes/edges — items belonging to other
    // ops are hidden; legacy items (no operation_id) get adopted by the
    // current op on first edit.
    const me = useReactiveVar(meState);
    const currentOpId: number = (me?.user?.current_operation_id as number) ?? 0;
    const { data: callbacksData_raw, loading: callbacksLoading, refetch } = useQuery<any>(GET_CALLBACKS, { pollInterval: pageVisible ? 10000 : 0 });
    // Inject Metasploit sessions as synthetic Callback rows so they appear
    // as graph nodes alongside Mythic callbacks (grouped by host like any
    // other callback).
    const msfSynthetic = useMsfSyntheticCallbacks();
    const callbacksData = useMemo(
        () => callbacksData_raw
            ? { ...callbacksData_raw, callback: [...(callbacksData_raw.callback || []), ...msfSynthetic] }
            : (msfSynthetic.length > 0 ? { callback: msfSynthetic } : callbacksData_raw),
        [callbacksData_raw, msfSynthetic],
    );
    const { data: edgesData, refetch: refetchEdges } = useQuery<any>(GET_CALLBACK_GRAPH_EDGES, { pollInterval: pageVisible ? 10000 : 0 });
    const { data: p2pData, refetch: refetchP2P } = useQuery<any>(GET_P2P_PROFILES_AND_CALLBACKS, { fetchPolicy: "network-only" });
    const { data: allC2Data, refetch: refetchAllC2 } = useQuery<any>(GET_C2_PROFILES, { fetchPolicy: "network-only" });

    // Mutations
    const [hideCallback] = useMutation<any>(HIDE_CALLBACK_MUTATION);
    const [lockCallback] = useMutation<any>(LOCK_CALLBACK_MUTATION);
    const [updateDescription] = useMutation<any>(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [addEdge] = useMutation<any>(ADD_EDGE_MUTATION);
    const [removeEdge] = useMutation<any>(REMOVE_EDGE_MUTATION);
    const [createTask] = useMutation<any>(CREATE_TASK_MUTATION);

    const [nodes, setNodes, onNodesChange] = useNodesState([] as Node<Record<string, unknown>>[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge<Record<string, unknown>>[]);
    const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
    // Refs mirroring nodes/edges for stable callbacks that need current state
    const nodesRef = useRef<Node[]>([]);
    const edgesRef = useRef<Edge[]>([]);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    // Track selected node IDs for edge-highlight feature
    const selectedNodeIds = useRef<Set<string>>(new Set());
    const [isInitialRender, setIsInitialRender] = useState(true);
    const seenNodeIds = useRef(new Set<string>());
    const prevGraphDataRef = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
    const navigate = useNavigate();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; callback: Callback; nodeRect?: DOMRect | null } | null>(null);
    const [editDescriptionModal, setEditDescriptionModal] = useState<any | null>(null);
    const [newDescription, setNewDescription] = useState("");
    const [detailsModal, setDetailsModal] = useState<any | null>(null);
    const [setParentModal, setSetParentModal] = useState<any | null>(null);
    // Anchor in FLOW (canvas) coordinates so the panel sticks to the node when the
    // user pans/zooms — see LinkToParentPanel's screen-position computation.
    const [setParentAnchor, setSetParentAnchor] = useState<{ flowX: number; flowY: number; width: number; height: number } | null>(null);
    // Live viewport mirror — driven by ReactFlow's onMove. Used by panels that
    // anchor to flow-space positions so they re-render every pan/zoom frame.
    const [liveViewport, setLiveViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
    // ── Link Focus (global, persisted in agentstorage) ──────────────────────
    const autoLinkedCallbacksRef = useRef<Set<string>>(new Set());
    const [selectedProfile, setSelectedProfile] = useState<Record<string, unknown> | null>(null);
    const [selectedDestination, setSelectedDestination] = useState<Record<string, unknown> | null>(null);
    const [edgeLabel, setEdgeLabel] = useState("");
    const [isP2PConnection, setIsP2PConnection] = useState(true);
    
    // Custom Node State
    const [showCustomNodeModal, setShowCustomNodeModal] = useState(false);
    const [editCustomNodeModal, setEditCustomNodeModal] = useState<any | null>(null);
    const [customNodes, setCustomNodes] = useState<any[]>([]);
    const [customEdges, setCustomEdges] = useState<any[]>([]);
    const customEdgesRef = useRef<any[]>([]);
    // Keep ref in sync for non-setter reads
    useEffect(() => { customEdgesRef.current = customEdges; }, [customEdges]);
    const [customNodeForm, setCustomNodeForm] = useState({
        host: '',
        os: 'Windows',
        ip: '',
        user: '',
        description: '',
        architecture: 'x64'
    });
    const [showHiddenNodes, setShowHiddenNodes] = useState(false);
    const [showExportImportModal, setShowExportImportModal] = useState(false);
    const [exportData, setExportData] = useState('');
    const [importData, setImportData] = useState('');

    // ── Graph Config State (with localStorage persistence) ──
    const [showConfigPanel, setShowConfigPanel] = useState(false);
    const [layoutDir, setLayoutDir] = useLocalStorageState<'LR' | 'TB'>('mg_layoutDir', 'LR', typedStringSerializer<'LR' | 'TB'>());
    const [showAllEdges, setShowAllEdges] = useLocalStorageState('mg_showAllEdges', false, boolSerializer);
    const [groupBy, setGroupBy] = useLocalStorageState('mg_groupBy', 'None', typedStringSerializer<string>());
    const [nodeLabels, setNodeLabels] = useLocalStorageState<string[]>('mg_nodeLabels', ['host', 'ip']);
    const [packetFlowView, setPacketFlowView] = useLocalStorageState('mg_packetFlowView', true, boolInverseSerializer);
    const [mergeByHost, setMergeByHost] = useLocalStorageState('mg_mergeByHost', true, boolInverseSerializer);
    // Task for Edge state
    const [taskForEdgeModal, setTaskForEdgeModal] = useState<Record<string, unknown> | null>(null);
    const [taskForEdgeCommand, setTaskForEdgeCommand] = useState<Record<string, unknown> | null>(null);
    const [taskForEdgeParams, setTaskForEdgeParams] = useState('');
    const [taskingForEdge, setTaskingForEdge] = useState(false);

    // ── Eventing dialog ──
    const [showEventingDialog, setShowEventingDialog] = useState<Callback | null>(null);
    // ── Edge & pane context menus ──
    const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; edge: any } | null>(null);
    const [paneContextMenu, setPaneContextMenu] = useState<{ x: number; y: number } | null>(null);
    // ── Manually Remove Edge dialog ──
    const [removeEdgeModal, setRemoveEdgeModal] = useState<any[] | null>(null);
    // ── Manually Add Edge (P2P) dialog ──
    const [manuallyAddEdgeModal, setManuallyAddEdgeModal] = useState<Record<string, unknown> | null>(null);
    const [addEdgeSelectedProfile, setAddEdgeSelectedProfile] = useState<Record<string, unknown> | null>(null);
    const [addEdgeSelectedDest, setAddEdgeSelectedDest] = useState<Record<string, unknown> | null>(null);
    const [addEdgeDestOptions, setAddEdgeDestOptions] = useState<any[]>([]);
    // ── Graph view mode ──
    const [graphViewMode, setGraphViewMode] = useState<'CALLBACKS' | 'BROWSERSCRIPTS'>('CALLBACKS');
    // ── Download refs ──
    const graphContainerRef = useRef<HTMLDivElement>(null);

    // All-edges query (non-active edges, skip when not needed) — must come AFTER showAllEdges state declaration
    const { data: allEdgesData } = useQuery<any>(GET_CALLBACK_GRAPH_EDGES_ALL, {
        pollInterval: pageVisible ? 15000 : 0,
        skip: !showAllEdges
    });
    // Lazy query for link commands when Task-for-Edge dialog opens
    const [getLinkCommands, { data: linkCommandsData, loading: linkCommandsLoading }] = useLazyQuery<any>(GET_LINK_COMMANDS_FOR_CALLBACK, { fetchPolicy: 'network-only' });

    // GraphQL for custom nodes - use polling for real-time updates
    const { data: customNodesData, refetch: refetchCustomNodes } = useQuery<any>(GET_CUSTOM_GRAPH_NODES, {
        pollInterval: pageVisible ? 15000 : 0,
        fetchPolicy: 'network-only',
    });

    // ── Link Focus: global persistent state via agentstorage ────────────────
    const { data: linkFocusData } = useQuery<any>(GET_LINK_FOCUS, {
        pollInterval: pageVisible ? 10000 : 0,
        fetchPolicy: 'network-only',
    });
    const [setLinkFocusMutation] = useMutation<any>(SET_LINK_FOCUS);
    const [clearLinkFocusMutation] = useMutation<any>(CLEAR_LINK_FOCUS);

    // Derive focus state from live query
    const { linkFocusNodeId, linkFocusNodeLabel } = useMemo(() => {
        const row = linkFocusData?.agentstorage?.[0];
        if (!row) return { linkFocusNodeId: null, linkFocusNodeLabel: '' };
        try {
            let raw: string = row.data ?? '';
            // Hasura returns bytea as hex string \x...
            if (typeof raw === 'string' && raw.startsWith('\\x')) {
                raw = Array.from({ length: (raw.length - 2) / 2 },
                    (_, i) => String.fromCharCode(parseInt(raw.slice(2 + i * 2, 4 + i * 2), 16))
                ).join('');
            }
            const parsed = JSON.parse(decodeURIComponent(escape(atob(raw))));
            return { linkFocusNodeId: parsed.nodeId ?? null, linkFocusNodeLabel: parsed.label ?? '' };
        } catch { return { linkFocusNodeId: null, linkFocusNodeLabel: '' }; }
    }, [linkFocusData]);

    const handleSetLinkFocus = useCallback((nodeId: string, label: string) => {
        const data = btoa(unescape(encodeURIComponent(JSON.stringify({ nodeId, label }))));
        setLinkFocusMutation({ variables: { data } });
        autoLinkedCallbacksRef.current.clear();
    }, [setLinkFocusMutation]);

    const handleClearLinkFocus = useCallback(() => {
        clearLinkFocusMutation();
        autoLinkedCallbacksRef.current.clear();
    }, [clearLinkFocusMutation]);

    // GraphQL for custom edges - use polling for real-time updates
    const { data: customEdgesData, refetch: refetchCustomEdges } = useQuery<any>(GET_CUSTOM_GRAPH_EDGES, {
        pollInterval: pageVisible ? 15000 : 0,
        fetchPolicy: 'network-only',
    });

    const [createCustomNodeMutation] = useMutation<any>(CREATE_CUSTOM_GRAPH_NODE);
    const [updateCustomNodeMutation] = useMutation<any>(UPDATE_CUSTOM_GRAPH_NODE);
    const [deleteCustomNodeMutation] = useMutation<any>(DELETE_CUSTOM_GRAPH_NODE);
    const [createCustomEdgeMutation] = useMutation<any>(CREATE_CUSTOM_GRAPH_EDGE);
    const [deleteCustomEdgeMutation] = useMutation<any>(DELETE_CUSTOM_GRAPH_EDGE);

    // Sync custom nodes from GraphQL (agentstorage)
    useEffect(() => {
        log(' customNodesData changed:', customNodesData);
        
        if (customNodesData?.agentstorage) {
            log(' Found agentstorage data:', customNodesData.agentstorage);
            try {
                const parsedNodesRaw = parseAgentStorageResults(customNodesData.agentstorage);
                // Keep nodes belonging to the current operation, plus legacy
                // rows (no operation_id) that will be adopted on next edit.
                const parsedNodes = parsedNodesRaw.filter((n: any) =>
                    n.operation_id == null || n.operation_id === currentOpId
                );
                log(' Parsed nodes:', parsedNodes);

                const nodes = parsedNodes.map((node: any) => ({
                    id: `custom-${node.id}`,
                    db_id: node.id,
                    display_id: node.id, // Add display_id for compatibility
                    host: node.hostname,
                    ip: node.ip_address,
                    os: node.operating_system,
                    architecture: node.architecture,
                    user: node.username || 'N/A',
                    description: node.description || '',
                    isHidden: node.hidden || false,
                    isCustom: true,
                    timestamp: node.timestamp,
                    position: node.position,
                    parent_id: node.parent_id,
                    parent_type: node.parent_type,
                    c2profile: node.c2profile
                }));
                
                log(' Mapped internal nodes:', nodes);
                setCustomNodes(nodes);
                log(' setCustomNodes called with', nodes.length, 'nodes');
                
                // Generate edges from parent relationships
                // For callback parents: parent_id is the database primary key (c.id)
                // For custom parents: parent_id is the custom node's db_id
                const parentEdgesFromNodes = nodes
                    .filter((node: Record<string, unknown>) => node.parent_id !== undefined && node.parent_id !== null)
                    .map((node: Record<string, unknown>) => ({
                        id: `custom-edge-${node.db_id}`,
                        source: node.id,
                        target: node.parent_type === 'custom' ? `custom-${node.parent_id}` : String(node.parent_id),
                        sourceId: node.db_id,
                        targetId: node.parent_id,
                        c2profile: node.c2profile || ''
                    }));
                
                log(' Generated edges from parent relationships:', parentEdgesFromNodes);
                
                // Update edges while preserving callback->custom edges
                setCustomEdges(prevEdges => {
                    // Keep callback->custom edges (from database)
                    const callbackEdges = prevEdges.filter(e => e.id.includes('callback-'));
                    // Replace parent edges with new ones
                    log(' Merging parent edges:', parentEdgesFromNodes.length, 'with callback edges:', callbackEdges.length);
                    return [...parentEdgesFromNodes, ...callbackEdges];
                });
            } catch (error) {
                console.error('[CallbackGraph] Failed to parse custom nodes from agentstorage:', error);
                snackActions.error('Failed to load custom nodes: ' + (error as Error).message);
            }
        } else {
            log(' No agentstorage data in customNodesData');
        }
    }, [customNodesData, currentOpId]);

    // Sync custom edges from GraphQL (stored edges in agentstorage)
    useEffect(() => {
        log(' customEdgesData changed:', customEdgesData);

        if (customEdgesData?.agentstorage) {
            log(' Found custom edges data:', customEdgesData.agentstorage);
            try {
                const storedCallbackEdgesRaw = parseEdgeStorageResults(customEdgesData.agentstorage);
                // Hide edges that belong to a different operation; legacy
                // edges (no operation_id) are kept and rebound on next save.
                const storedCallbackEdges = storedCallbackEdgesRaw.filter((e: any) =>
                    e.operation_id == null || e.operation_id === currentOpId
                );
                log(' Parsed callback->custom edges:', storedCallbackEdges);
                
                // Update edges while preserving parent edges
                setCustomEdges(prevEdges => {
                    // Keep parent edges (custom node -> callback/custom)
                    const parentEdges = prevEdges.filter(e => e.id.startsWith('custom-edge-') && !e.id.includes('callback-'));
                    // Replace callback edges with stored ones
                    log(' Merging stored callback edges:', storedCallbackEdges.length, 'with parent edges:', parentEdges.length);
                    return [...parentEdges, ...storedCallbackEdges];
                });
            } catch (error) {
                console.error('[CallbackGraph] Failed to parse custom edges:', error);
            }
        } else {
            log(' No custom edges data, keeping only parent edges');
            // No stored edges, remove callback edges but keep parent edges
            setCustomEdges(prevEdges => prevEdges.filter(e => e.id.startsWith('custom-edge-') && !e.id.includes('callback-')));
        }
    }, [customEdgesData, currentOpId]);

    // Context menu handlers
    const handleContextMenu = useCallback((e: React.MouseEvent, callback: Callback, nodeRect: DOMRect | undefined) => {
        e.preventDefault();
        const x = e.clientX;
        const y = e.clientY;
        setContextMenu({ x, y, callback, nodeRect: nodeRect ?? null });
    }, []);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // Handlers
    const handleHide = async (callback: Callback) => {
        try {
            await hideCallback({ variables: { callback_display_id: callback.display_id, active: false } });
            snackActions.success(`Callback ${callback.display_id} hidden`);
            refetch();
        } catch (e: unknown) {
            snackActions.error("Failed to hide callback: " + getErrorMessage(e));
        }
        setContextMenu(null);
    };

    const handleLockToggle = async (callback: Callback) => {
        try {
            await lockCallback({ variables: { callback_display_id: callback.display_id, locked: !callback.locked } });
            snackActions.success(`Callback ${callback.display_id} ${callback.locked ? "unlocked" : "locked"}`);
            refetch();
        } catch (e: unknown) {
            snackActions.error("Failed to toggle lock: " + getErrorMessage(e));
        }
        setContextMenu(null);
    };

    const openEditDescription = (callback: Callback) => {
        setEditDescriptionModal(callback);
        setNewDescription(callback.description || "");
        setContextMenu(null);
    };

    const handleSaveDescription = async () => {
        if (!editDescriptionModal) return;
        try {
            await updateDescription({ variables: { callback_display_id: editDescriptionModal.display_id, description: newDescription } });
            snackActions.success("Description updated");
            refetch();
            setEditDescriptionModal(null);
        } catch (e: unknown) {
            snackActions.error("Failed to update description: " + getErrorMessage(e));
        }
    };

    const openSetParent = (callback: Callback, _anchor?: { x: number; y: number }) => {
        // Sync the live viewport from the ref so the first paint uses an
        // accurate transform (onMove only fires while the user actively pans).
        setLiveViewport(viewportRef.current);
        // Build the flow-space anchor. Preference order:
        //   1) The DOM rect captured at right-click time → derive flow coords
        //      via the current viewport. This is the most accurate source — it
        //      reflects the node's actual rendered box including padding/border
        //      that React Flow's `measured` sometimes misses or under-reports.
        //   2) Fall back to ReactFlow node.position + measured.
        const rfNode = nodes.find((n) => n.id === String(callback.id));
        const rect = contextMenu?.nodeRect;
        const vp = viewportRef.current;
        if (rect && vp.zoom > 0) {
            setSetParentAnchor({
                flowX:  (rect.left   - vp.x) / vp.zoom,
                flowY:  (rect.top    - vp.y) / vp.zoom,
                width:   rect.width  / vp.zoom,
                height:  rect.height / vp.zoom,
            });
        } else if (rfNode) {
            // Last-resort fallback (rect should always be present). Defaults are
            // intentionally larger than any real node so the panel always lands
            // *outside* the node box rather than over it. The callback node is
            // w-[250px] and ~100px tall; custom node is 128×128.
            const measured = (rfNode as any).measured ?? {};
            setSetParentAnchor({
                flowX: rfNode.position.x,
                flowY: rfNode.position.y,
                width: measured.width ?? 280,
                height: measured.height ?? 140,
            });
        } else {
            setSetParentAnchor(null);
        }
        setSetParentModal(callback);
        setSelectedProfile(null);
        setSelectedDestination(null);
        setEdgeLabel("");
        setIsP2PConnection(true);
        refetchP2P();
        refetchAllC2();
        setContextMenu(null);
    };

    const handleCreateCustomNode = async () => {
        log('[handleCreateCustomNode] === START ===');
        log('[handleCreateCustomNode] Form:', customNodeForm);
        
        if (!customNodeForm.host || !customNodeForm.ip) {
            console.error('[handleCreateCustomNode] Validation failed - missing host or IP');
            snackActions.error("Hostname and IP are required");
            return;
        }
        
        try {
            log('[handleCreateCustomNode] Parsing existing nodes...');
            // Generate next ID based on existing nodes
            const parsedNodes = customNodesData?.agentstorage 
                ? parseAgentStorageResults(customNodesData.agentstorage) 
                : [];
            log('[handleCreateCustomNode] Found', parsedNodes.length, 'existing nodes');
            log('[handleCreateCustomNode] Existing node IDs:', parsedNodes.map(n => n.id));
            
            const nextId = generateNextId(parsedNodes);
            log('[handleCreateCustomNode] Generated next ID:', nextId);
            
            // Prepare data for agentstorage
            log('[handleCreateCustomNode] Preparing node data...');
            const { unique_id, data } = prepareCreateNodeData({
                hostname: customNodeForm.host,
                ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os,
                architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined,
                description: customNodeForm.description,
                operation_id: currentOpId || undefined,
            }, nextId);
            
            log('[handleCreateCustomNode] unique_id:', unique_id);
            log('[handleCreateCustomNode] data (first 100 chars):', data.substring(0, 100));
            log('[handleCreateCustomNode] data length:', data.length);
            
            log('[handleCreateCustomNode] Calling createCustomNodeMutation...');
            const result = await createCustomNodeMutation({
                variables: {
                    unique_id,
                    data
                }
            });

            log('[handleCreateCustomNode] Mutation completed. Result:', result);
            
            if (result.data?.insert_agentstorage_one) {
                log('[handleCreateCustomNode] Created successfully:', result.data.insert_agentstorage_one);
                snackActions.success(`Custom node "${customNodeForm.host}" created`);
                setShowCustomNodeModal(false);
                
                // Force refetch to get updated data
                log('[handleCreateCustomNode] Refetching custom nodes...');
                await refetchCustomNodes();
                log('[handleCreateCustomNode] Refetch complete');
                
                // Reset form
                setCustomNodeForm({
                    host: '',
                    os: 'Windows',
                    ip: '',
                    user: '',
                    description: '',
                    architecture: 'x64'
                });
            } else {
                throw new Error('Failed to create node');
            }
        } catch (e: unknown) {
            console.error('Create custom node error:', e);
            snackActions.error("Failed to create custom node: " + getErrorMessage(e));
        }
    };
    
    const openEditCustomNode = (node: any) => {
        setEditCustomNodeModal(node);
        setCustomNodeForm({
            host: node.host,
            os: node.os,
            ip: node.ip,
            user: node.user,
            description: node.description || '',
            architecture: node.architecture
        });
        setContextMenu(null);
    };
    
    const handleUpdateCustomNode = async () => {
        if (!customNodeForm.host || !customNodeForm.ip) {
            snackActions.error("Hostname and IP are required");
            return;
        }

        try {
            // Prepare data for agentstorage update
            const { unique_id, data } = prepareUpdateNodeData({
                id: editCustomNodeModal.db_id,
                hostname: customNodeForm.host,
                ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os,
                architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined,
                description: customNodeForm.description,
                hidden: editCustomNodeModal.isHidden || false,
                operation_id: currentOpId || undefined,
            });
            
            const result = await updateCustomNodeMutation({
                variables: {
                    unique_id,
                    data
                }
            });

            if (result.data?.update_agentstorage?.affected_rows > 0) {
                snackActions.success('Custom node updated successfully');
                setEditCustomNodeModal(null);
                refetchCustomNodes();
                
                setCustomNodeForm({
                    host: '',
                    os: 'Windows',
                    ip: '',
                    user: '',
                    description: '',
                    architecture: 'x64'
                });
            } else {
                throw new Error('No rows updated');
            }
        } catch (e: unknown) {
            console.error('Update custom node error:', e);
            snackActions.error("Failed to update custom node: " + getErrorMessage(e));
        }
    };
    
    const handleDeleteCustomNode = async (node: any) => {
        try {
            const unique_id = generateUniqueId(node.db_id);
            
            const result = await deleteCustomNodeMutation({
                variables: {
                    unique_id
                }
            });

            if (result.data?.delete_agentstorage?.affected_rows > 0) {
                // Remove edges connected to this custom node (local only)
                setCustomEdges(prev =>
                    prev.filter(
                        (edge) => edge.source !== node.id && edge.target !== node.id
                    )
                );
                snackActions.success(`Custom node "${node.host}" deleted successfully`);
                setContextMenu(null);
                refetchCustomNodes();
            } else {
                throw new Error('Failed to delete node from database');
            }
        } catch (e: unknown) {
            console.error('Delete custom node error:', e);
            snackActions.error("Failed to delete custom node: " + getErrorMessage(e));
        }
    };
    
    const handleExportCustomNodes = () => {
        const exportObj = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            customNodes,
            customEdges
        };
        setExportData(JSON.stringify(exportObj, null, 2));
        setShowExportImportModal(true);
    };
    
    const handleImportCustomNodes = async () => {
        try {
            const importObj = JSON.parse(importData);
            if (!importObj.customNodes || !Array.isArray(importObj.customNodes)) {
                snackActions.error('Invalid import data format');
                return;
            }

            // ── Input validation ──
            const MAX_IMPORT_NODES = 200;
            const MAX_STRING_LEN = 500;
            if (importObj.customNodes.length > MAX_IMPORT_NODES) {
                snackActions.error(`Import limited to ${MAX_IMPORT_NODES} nodes`);
                return;
            }
            const sanitise = (v: unknown, fallback: string) => {
                if (typeof v !== 'string') return fallback;
                return v.slice(0, MAX_STRING_LEN).replace(/[<>"']/g, '');
            };
            
            // Create each imported node in the DB
            let createdCount = 0;
            const existingNodes = customNodesData?.agentstorage ? parseAgentStorageResults(customNodesData.agentstorage) : [];
            let importNextId = generateNextId(existingNodes);
            for (const node of importObj.customNodes) {
                if (typeof node !== 'object' || node === null) continue;
                try {
                    const { unique_id, data } = prepareCreateNodeData({
                        hostname: sanitise(node.host || node.hostname, 'Imported Node'),
                        ip_address: sanitise(node.ip || node.ip_address, '0.0.0.0'),
                        operating_system: sanitise(node.os || node.operating_system, 'Unknown'),
                        architecture: sanitise(node.architecture, 'x64'),
                        username: sanitise(node.user || node.username, '') || undefined,
                        description: sanitise(node.description, '') || undefined,
                        hidden: false,
                        operation_id: currentOpId || undefined,
                    }, importNextId++);
                    await createCustomNodeMutation({ variables: { unique_id, data } });
                    createdCount++;
                } catch (e: unknown) {
                    console.error('[Import] Failed to create node:', node, e);
                }
            }
            
            // Import custom edges (local merge — validate shape)
            if (importObj.customEdges && Array.isArray(importObj.customEdges)) {
                const validEdges = importObj.customEdges.filter(
                    (e: unknown) => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).id === 'string'
                );
                setCustomEdges(prev => {
                    const existingEdgeIds = new Set(prev.map((e: Record<string, unknown>) => e.id));
                    const newEdges = validEdges.filter((e: Record<string, unknown>) => !existingEdgeIds.has(e.id));
                    return [...prev, ...newEdges];
                });
            }
            
            await refetchCustomNodes();
            snackActions.success(`Imported ${createdCount} node${createdCount !== 1 ? 's' : ''}`);
            setShowExportImportModal(false);
            setImportData('');
        } catch (e: unknown) {
            snackActions.error('Failed to import: ' + getErrorMessage(e));
        }
    };
    
    const handleCopyExportData = () => {
        navigator.clipboard.writeText(exportData);
        snackActions.success('Copied to clipboard');
    };
    
    const handleSetParent = async () => {
        if (!setParentModal || !selectedProfile || !selectedDestination) {
            snackActions.error("Please select a C2 profile and destination node");
            return;
        }
        
        // Check if either node is a custom node
        const isSourceCustom = setParentModal.isCustom;
        const isDestCustom = selectedDestination.isCustom;
        
        log('[handleSetParent] isSourceCustom:', isSourceCustom, 'isDestCustom:', isDestCustom);
        log('[handleSetParent] setParentModal:', setParentModal);
        log('[handleSetParent] selectedDestination:', selectedDestination);
        
        if (isSourceCustom) {
            // Source is a custom node - need to update in database
            try {
                log('[handleSetParent] Updating custom node parent connection...');
                log('[handleSetParent] Source:', setParentModal.id, 'db_id:', setParentModal.db_id);
                log('[handleSetParent] Destination:', selectedDestination.id, 'display_id:', selectedDestination.display_id);
                
                // Find the full custom node data
                const sourceNode = customNodes.find(n => n.id === setParentModal.id);
                if (!sourceNode) {
                    console.error('[handleSetParent] Source node not found in customNodes:', setParentModal.id);
                    console.error('[handleSetParent] Available custom nodes:', customNodes.map(n => n.id));
                    snackActions.error("Source node not found");
                    return;
                }
                
                log('[handleSetParent] Found source node:', sourceNode);
                
                // Prepare updated node data with parent connection
                const { unique_id, data } = prepareUpdateNodeData({
                    id: sourceNode.db_id,
                    hostname: sourceNode.host,
                    ip_address: sourceNode.ip,
                    operating_system: sourceNode.os,
                    architecture: sourceNode.architecture,
                    username: sourceNode.user !== 'N/A' ? sourceNode.user : undefined,
                    description: sourceNode.description,
                    hidden: sourceNode.isHidden,
                    operation_id: currentOpId || undefined,
                    parent_id: (isDestCustom ? selectedDestination.db_id : selectedDestination.id) as string | number,
                    parent_type: isDestCustom ? 'custom' : 'callback',
                    c2profile: selectedProfile.name as string
                });
                
                log('[handleSetParent] Updating with parent_id:', isDestCustom ? selectedDestination.db_id : selectedDestination.display_id);
                
                const result = await updateCustomNodeMutation({
                    variables: { unique_id, data }
                });
                
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Linked to ${isDestCustom ? 'Custom Node' : 'Callback'} #${selectedDestination.display_id || selectedDestination.db_id}`);
                    refetchCustomNodes();
                } else {
                    snackActions.error("Failed to update custom node connection");
                }
            } catch (e: unknown) {
                console.error('[handleSetParent] Error:', e);
                snackActions.error("Failed to link: " + getErrorMessage(e));
            }
            setSetParentModal(null);
            setSetParentAnchor(null);
            return;
        }
        
        if (isDestCustom) {
            // Regular callback linking to custom node as parent
            // Store this as a custom edge in database (agentstorage)
            try {
                log('[handleSetParent] Creating custom edge: callback → custom node');
                log('[handleSetParent] Source (callback):', setParentModal.id, setParentModal.display_id);
                log('[handleSetParent] Destination (custom):', selectedDestination.id, selectedDestination.db_id);
                
                // Create edge object
                const edgeId = `callback-${setParentModal.display_id}-to-custom-${selectedDestination.db_id}`;
                const newEdge = {
                    id: edgeId,
                    source: String(setParentModal.id), // callback id
                    target: selectedDestination.id, // custom node id (format: "custom-1")
                    sourceId: setParentModal.display_id,
                    targetId: selectedDestination.db_id,
                    c2profile: selectedProfile.name,
                    operation_id: currentOpId || undefined,
                };
                
                log('[handleSetParent] Saving edge to database:', newEdge);
                
                // Delete ALL existing edges from this callback (read from ref, not setter)
                const existingEdgesFromCallback = customEdgesRef.current.filter(
                    (e: Record<string, unknown>) => e.source === String(setParentModal.id)
                );
                log('[handleSetParent] Found', existingEdgesFromCallback.length, 'existing edges to remove');
                
                for (const edge of existingEdgesFromCallback) {
                    try {
                        log('[handleSetParent] Deleting edge:', edge.id, 'unique_id:', generateEdgeUniqueId(edge.id));
                        await deleteCustomEdgeMutation({
                            variables: { unique_id: generateEdgeUniqueId(edge.id) }
                        });
                    } catch (delError: unknown) {
                        console.warn('[handleSetParent] Failed to delete edge:', edge.id, (delError as Error).message);
                        // Continue anyway - edge might not exist in DB
                    }
                }
                
                // Save to database
                const result = await createCustomEdgeMutation({
                    variables: {
                        unique_id: generateEdgeUniqueId(edgeId),
                        data: serializeEdgeData(newEdge as any)
                    }
                });
                
                if (result.data?.insert_agentstorage_one) {
                    snackActions.success(`Linked to Custom Node #${selectedDestination.db_id} (persistent)`);
                    // Refetch to update UI
                    await refetchCustomEdges();
                } else {
                    snackActions.error("Failed to save connection");
                }
            } catch (e: unknown) {
                console.error('[handleSetParent] Error creating custom edge:', e);
                snackActions.error("Failed to link: " + getErrorMessage(e));
            }
            setSetParentModal(null);
            setSetParentAnchor(null);
            return;
        }
        
        // Original database operation for regular callbacks
        try {
            // First, remove any existing edges where this callback is the source
            if (edgesData?.callbackgraphedge) {
                const existingEdges = edgesData.callbackgraphedge.filter(
                    (e: any) => e.source?.id === setParentModal.id && !e.end_timestamp
                );
                
                // Remove each existing edge
                for (const edge of existingEdges) {
                    try {
                        const result = await removeEdge({ variables: { edge_id: edge.id } });
                        if (result.data?.callbackgraphedge_remove?.status === "success") {
                            snackActions.info(`Removed existing link to Callback #${edge.destination?.display_id}`);
                        }
                    } catch (err: unknown) {
                        console.error("Failed to remove edge:", err);
                    }
                }
            }

            // Now add the new edge
            const addResult = await addEdge({
                variables: {
                    source_id: setParentModal.display_id,
                    destination_id: selectedDestination.display_id,
                    c2profile: selectedProfile.name
                }
            });
            
            if (addResult.data?.callbackgraphedge_add?.status === "success") {
                snackActions.success(`Linked to Callback #${selectedDestination.display_id}`);
            } else if (addResult.data?.callbackgraphedge_add?.error) {
                snackActions.error(`Failed to add edge: ${addResult.data.callbackgraphedge_add.error}`);
            } else {
                snackActions.success(`Linked to Callback #${selectedDestination.display_id}`);
            }
            
            // Refetch both callbacks and edges to update the graph
            refetch();
            refetchEdges();
            setSetParentModal(null);
            setSetParentAnchor(null);
        } catch (e: unknown) {
            snackActions.error("Failed to add edge: " + getErrorMessage(e));
        }
    };

    // Check if a callback has a parent connection (is source of an edge)
    const getParentEdge = useCallback((callbackId: number | string) => {
        const callbackIdStr = String(callbackId);
        
        // Check custom edges first (callback → custom node)
        // e.source is stored as string when edge is created
        const customEdge = customEdges.find(e => String(e.source) === callbackIdStr);
        if (customEdge) return customEdge;
        
        // Then check database edges
        if (!edgesData?.callbackgraphedge) return null;
        return edgesData.callbackgraphedge.find(
            (e: any) => e.source?.id === callbackId && !e.end_timestamp
        );
    }, [edgesData, customEdges]);

    // Disconnect from parent - removes the edge where this callback is the source
    const handleDisconnectParent = async (callback: Callback) => {
        log('[handleDisconnectParent] callback:', callback);
        log('[handleDisconnectParent] callback.id:', callback.id, 'type:', typeof callback.id);
        log('[handleDisconnectParent] callback.isCustom:', callback.isCustom);
        log('[handleDisconnectParent] customEdges:', customEdges.map(e => ({ id: e.id, source: e.source, target: e.target })));
        
        const parentEdge = getParentEdge(callback.id);
        log('[handleDisconnectParent] Found parentEdge:', parentEdge);
        
        if (!parentEdge) {
            snackActions.info("No parent connection found");
            setContextMenu(null);
            return;
        }

        // Check if it's a custom node disconnecting from its parent
        if (callback.isCustom) {
            try {
                log('[handleDisconnectParent] Removing parent from custom node:', callback.db_id);
                
                // Update the custom node to remove parent connection
                const { unique_id, data } = prepareUpdateNodeData({
                    id: callback.db_id as number,
                    hostname: callback.host,
                    ip_address: callback.ip,
                    operating_system: callback.os,
                    architecture: callback.architecture,
                    username: callback.user !== 'N/A' ? callback.user : undefined,
                    description: callback.description,
                    hidden: callback.isHidden,
                    operation_id: currentOpId || undefined,
                    parent_id: undefined,
                    parent_type: undefined,
                    c2profile: undefined
                });
                
                const result = await updateCustomNodeMutation({
                    variables: { unique_id, data }
                });
                
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success("Disconnected from parent");
                    refetchCustomNodes();
                } else {
                    snackActions.error("Failed to disconnect");
                }
            } catch (e: unknown) {
                console.error('[handleDisconnectParent] Error:', e);
                snackActions.error("Failed to disconnect: " + getErrorMessage(e));
            }
            setContextMenu(null);
            return;
        }

        // Check if it's a custom edge (callback → custom node connection)
        if (parentEdge.source && typeof parentEdge.source === 'string' && !parentEdge.id.startsWith('e')) {
            // This is a custom edge, remove it from database
            try {
                log('[handleDisconnectParent] Removing custom edge from database:', parentEdge.id);
                
                const result = await deleteCustomEdgeMutation({
                    variables: { unique_id: generateEdgeUniqueId(parentEdge.id) }
                });
                
                if (result.data?.delete_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Disconnected from Custom Node #${parentEdge.targetId}`);
                    refetchCustomEdges();
                } else {
                    snackActions.error("Failed to remove connection from database");
                }
            } catch (e: unknown) {
                console.error('[handleDisconnectParent] Error removing custom edge:', e);
                snackActions.error("Failed to disconnect: " + getErrorMessage(e));
            }
            setContextMenu(null);
            return;
        }

        // Handle database edge removal for regular callbacks
        try {
            const result = await removeEdge({ variables: { edge_id: parentEdge.id } });
            if (result.data?.callbackgraphedge_remove?.status === "success") {
                snackActions.success(`Disconnected from Callback #${parentEdge.destination?.display_id}`);
            } else if (result.data?.callbackgraphedge_remove?.error) {
                snackActions.error(`Failed to disconnect: ${result.data.callbackgraphedge_remove.error}`);
            }
            refetch();
            refetchEdges();
        } catch (e: unknown) {
            snackActions.error("Failed to disconnect: " + getErrorMessage(e));
        }
        setContextMenu(null);
    };

    const openDetails = (callback: Callback) => {
        setDetailsModal(callback);
        setContextMenu(null);
    };

    // ── Helper: restore all edge/node styles to originals ──
    const clearGraphSelection = useCallback(() => {
        selectedNodeIds.current.clear();
        setEdges(eds => eds.map(e => ({
            ...e,
            animated: (e.data as GraphEdgeData)?.origAnimated ?? e.animated,
            style: (e.data as GraphEdgeData)?.origStyle ? { ...(e.data as GraphEdgeData).origStyle } : e.style,
        })));
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, isDimmed: false, isHighlighted: false },
        })));
    }, [setEdges, setNodes]);

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'root' || node.type === 'groupBound') return;
        if (node.data?.isCustom) {
            snackActions.warning(`⚠ Custom Node "${node.data.host || node.data.display_id}" is a manually created reference node and cannot be directly controlled.`);
            return;
        }

        const selIds = selectedNodeIds.current;

        if (event.shiftKey) {
            if (selIds.has(node.id)) {
                selIds.delete(node.id);
            } else {
                selIds.add(node.id);
            }
        } else {
            if (selIds.size === 1 && selIds.has(node.id)) {
                clearGraphSelection();
                return;
            }
            selectedNodeIds.current = new Set([node.id]);
        }

        const currentSelIds = selectedNodeIds.current;

        if (currentSelIds.size === 0) {
            clearGraphSelection();
            return;
        }

        // Read current state from refs (stable — no dependency on nodes/edges)
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;
        const selNodes = currentNodes.filter(n => currentSelIds.has(n.id));
        const connectedEdges = getConnectedEdges(selNodes, currentEdges);
        const connectedEdgeIds = new Set(connectedEdges.map(e => e.id));

        const adjacentNodeIds = new Set<string>();
        connectedEdges.forEach(e => {
            if (!currentSelIds.has(e.source)) adjacentNodeIds.add(e.source);
            if (!currentSelIds.has(e.target)) adjacentNodeIds.add(e.target);
        });

        setEdges(eds => eds.map(e => {
            if (connectedEdgeIds.has(e.id)) {
                return {
                    ...e,
                    animated: true,
                    style: {
                        ...((e.data as GraphEdgeData)?.origStyle || e.style),
                        strokeWidth: 3,
                        opacity: 1,
                        filter: 'drop-shadow(0 0 4px #22c55e)',
                    },
                };
            }
            return {
                ...e,
                animated: false,
                style: {
                    ...((e.data as GraphEdgeData)?.origStyle || e.style),
                    opacity: 0.12,
                },
            };
        }));

        setNodes(nds => nds.map(n => {
            if (n.id === 'root') return n;
            const isSel = currentSelIds.has(n.id);
            const isAdj = adjacentNodeIds.has(n.id);
            return {
                ...n,
                data: { ...n.data, isHighlighted: isSel, isDimmed: !isSel && !isAdj },
            };
        }));
    }, [setEdges, setNodes, clearGraphSelection]);

    const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'root' || node.type === 'groupBound' || node.data?.isCustom) return;
        const data = node.data as Partial<Callback> | undefined;
        if (data?.display_id) {
            // Mythic + MSF share /console/<displayId>; Console picks mode by id range.
            navigate(consolePathFor(data as Callback));
        }
    }, [navigate]);
    
    // Link Focus: auto-link newly arriving callbacks to the designated focus node
    useEffect(() => {
        if (!linkFocusNodeId) return;
        const callbacks: Callback[] = callbacksData?.callback || [];
        callbacks.forEach((cb: Callback) => {
            const cbStrId = String(cb.id);
            if (autoLinkedCallbacksRef.current.has(cbStrId)) return; // already linked
            autoLinkedCallbacksRef.current.add(cbStrId);
            // Skip if the callback IS the focus node
            if (cbStrId === linkFocusNodeId) return;
            // Create a custom edge: source=child(callback), target=parent(focus node)
            const edgeId = `focus-link-${cbStrId}-to-${linkFocusNodeId}`;
            setCustomEdges(prev => {
                if (prev.some(e => e.id === edgeId)) return prev;
                return [...prev, {
                    id: edgeId,
                    source: cbStrId,
                    target: linkFocusNodeId,
                    c2profile: 'focus',
                }];
            });
        });
    }, [callbacksData, linkFocusNodeId]);

    // Track when initial animation should complete
    useEffect(() => {
        if (isInitialRender && callbacksData?.callback?.length > 0) {
            const timeout = setTimeout(() => {
                setIsInitialRender(false);
            }, 3000); // Allow 3 seconds for initial animations
            return () => clearTimeout(timeout);
        }
        return undefined;
    }, [callbacksData, isInitialRender]);

    // Transform data to React Flow format
    const graphData = useMemo(() => {
        const result = buildGraphData({
            callbacksData, edgesData, allEdgesData, showAllEdges, packetFlowView,
            nodeLabels, groupBy, filterCallbackIds, handleContextMenu, isInitialRender,
            customNodes, showHiddenNodes, customEdges, mergeByHost,
            seenNodeIds: seenNodeIds.current,
            prevGraphData: prevGraphDataRef.current,
        });
        prevGraphDataRef.current = result;
        return result;
    }, [callbacksData, edgesData, allEdgesData, showAllEdges, packetFlowView, nodeLabels, groupBy, filterCallbackIds, handleContextMenu, isInitialRender, customNodes, showHiddenNodes, customEdges, mergeByHost]);

    // Track previous edges to detect topology changes
    const prevEdgesRef = useRef<string>('');
    // Track structural hash to skip redundant ELK calls
    const prevStructuralHashRef = useRef<string>('');
    // Track positions of nodes the user has explicitly dragged — preserved across re-layouts
    const userDraggedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        userDraggedPositionsRef.current.set(node.id, node.position);
    }, []);

    // Keep the LINK_TO_PARENT anchor synced to the source node's flow POSITION
    // when the user drags the node (or layout re-positions it). We DELIBERATELY
    // do NOT touch width/height here: those were captured from the real DOMRect
    // inside openSetParent and are the only reliable size source — ReactFlow's
    // `measured` is frequently undefined or stale right after the panel opens,
    // and overwriting our accurate size with a fallback like `?? 180 / ?? 64`
    // shrinks the anchor box and causes the panel to overlap the node.
    useEffect(() => {
        if (!setParentModal) return;
        const rfNode = nodes.find((n) => n.id === String(setParentModal.id));
        if (!rfNode) return;
        setSetParentAnchor((prev) => {
            if (!prev) return prev; // anchor wasn't established yet — never seed here
            if (prev.flowX === rfNode.position.x && prev.flowY === rfNode.position.y) {
                return prev;
            }
            return { ...prev, flowX: rfNode.position.x, flowY: rfNode.position.y };
        });
    }, [nodes, setParentModal]);
    
    // Apply ELK layout when data changes (async)
    // ALL nodes (callbacks + custom) pass through ELK for a proper right-directed tree.
    // User-dragged node positions are preserved in userDraggedPositionsRef and restored after layout.
    React.useEffect(() => {
        if (graphData.nodes.length === 0) return;

        // Structural hash: skip ELK if node IDs, edge connections, and direction haven't changed
        const nodeIds = graphData.nodes.map(n => n.id).sort().join(',');
        const edgeIds = graphData.edges.map(e => `${e.source}->${e.target}`).sort().join(',');
        const structuralHash = `${nodeIds}|${edgeIds}|${layoutDir}|${groupBy}`;
        if (structuralHash === prevStructuralHashRef.current) return;
        prevStructuralHashRef.current = structuralHash;

        let cancelled = false;

        getElkLayoutedElements(graphData.nodes, graphData.edges, layoutDir).catch((err) => {
            if (!cancelled) console.error('[Minerva] ELK layout failed:', err);
        }).then((result) => {
            if (!result) return;
            const { nodes: layoutedNodes, edges: layoutedEdges } = result;
            if (cancelled) return;

            // Detect topology changes
            const edgeHash = graphData.edges
                .filter(e => !e.id.startsWith('root-'))
                .map(e => `${e.source}->${e.target}`)
                .sort()
                .join('|');
            const edgesChanged = edgeHash !== prevEdgesRef.current;
            prevEdgesRef.current = edgeHash;

            // When topology changes, forget all stored drag positions so the new ELK tree is clean
            if (edgesChanged) {
                userDraggedPositionsRef.current.clear();
            }

            // Compute group bounding-box overlay nodes when groupBy is active
            const computeGroupNodes = (finalNodes: Node[]): Node[] => {
                if (groupBy === 'None') return finalNodes.filter(n => n.type !== 'groupBound');
                const bounds = new Map<string, { mnX: number; mnY: number; mxX: number; mxY: number }>();
                finalNodes.forEach(n => {
                    if (n.id === 'root' || n.type === 'groupBound' || !n.data) return;
                    const gv = String((n.data as GraphNodeData)[groupBy] ?? '(none)');
                    const b = bounds.get(gv) ?? { mnX: Infinity, mnY: Infinity, mxX: -Infinity, mxY: -Infinity };
                    b.mnX = Math.min(b.mnX, n.position.x);
                    b.mnY = Math.min(b.mnY, n.position.y);
                    b.mxX = Math.max(b.mxX, n.position.x + NODE_WIDTH);
                    b.mxY = Math.max(b.mxY, n.position.y + NODE_HEIGHT);
                    bounds.set(gv, b);
                });
                const groupNodes: Node[] = [];
                bounds.forEach((b, gv) => {
                    if (b.mnX === Infinity) return;
                    groupNodes.push({
                        id: `group-${gv}`,
                        type: 'groupBound',
                        position: { x: b.mnX - GROUP_PAD, y: b.mnY - GROUP_PAD },
                        style: { width: b.mxX - b.mnX + GROUP_PAD * 2, height: b.mxY - b.mnY + GROUP_PAD * 2, zIndex: -10, pointerEvents: 'none' as const },
                        data: { groupBy, groupValue: gv },
                        selectable: false,
                        draggable: false,
                    } as unknown as Node);
                });
                return [...groupNodes, ...finalNodes.filter(n => n.type !== 'groupBound')];
            };

            setNodes((_prev: Node[]) => {
                // Apply ELK positions, then restore any user-dragged positions on top
                const resolved = layoutedNodes.map(n => {
                    const dragged = userDraggedPositionsRef.current.get(n.id);
                    return dragged ? { ...n, position: dragged } : n;
                });
                return computeGroupNodes(resolved);
            });
            setEdges((_prev: Edge[]) => layoutedEdges);
        });
        return () => { cancelled = true; };
    }, [graphData, layoutDir, groupBy, setNodes, setEdges]);

    // Get filtered callbacks for set parent modal - show ALL active callbacks and custom nodes
    const filteredCallbacksForParent = useMemo(() => {
        if (!setParentModal) return [];
        const allNodes = [...(callbacksData?.callback || []), ...customNodes];
        // Filter out the current callback/node — compare by id only (unique across types)
        // Custom nodes have id="custom-X", callbacks have numeric id — no collision
        return allNodes
            .filter((c: Callback) => c.id !== setParentModal.id)
            .sort((a: Callback, b: Callback) => {
                if (a.isCustom && !b.isCustom) return -1;
                if (!a.isCustom && b.isCustom) return 1;
                return (a.display_id ?? 0) - (b.display_id ?? 0);
            });
    }, [callbacksData, setParentModal, customNodes]);

    // ── Node dim effect when context menu is open ──
    useEffect(() => {
        const selectedId = contextMenu?.callback?.id ? String(contextMenu.callback.id) : null;
        setNodes(nds => nds.map(n => ({
            ...n,
            data: {
                ...n.data,
                isDimmed: selectedId !== null && n.id !== selectedId && n.id !== 'root',
            }
        })));
    }, [contextMenu, setNodes]);

    // ── Edge context menu handler ──
    const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
        e.preventDefault();
        e.stopPropagation();
        setEdgeContextMenu({ x: e.clientX, y: e.clientY, edge });
        setContextMenu(null);
        setPaneContextMenu(null);
    }, []);

    // ── Pane context menu handler ──
    const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
        e.preventDefault();
        setPaneContextMenu({ x: e.clientX, y: e.clientY });
        setContextMenu(null);
        setEdgeContextMenu(null);
    }, []);

    // ── Pane/edge click: close all context menus + clear dim ──
    const onPaneClick = useCallback(() => {
        setContextMenu(null);
        setEdgeContextMenu(null);
        setPaneContextMenu(null);
        clearGraphSelection();
    }, [clearGraphSelection]);

    // ── Manually Remove Edge ──
    const handleOpenRemoveEdge = useCallback((callback: any) => {
        const callbackId = callback.callback_id ?? callback.id;
        const activeEdges = (edgesData?.callbackgraphedge || []).filter(
            (e: any) => !e.end_timestamp && (e.source?.id === callbackId || e.destination?.id === callbackId)
        );
        if (activeEdges.length === 0) {
            snackActions.info('No active edges for this callback');
            setContextMenu(null);
            return;
        }
        setRemoveEdgeModal(activeEdges);
        setContextMenu(null);
    }, [edgesData]);

    // ── Manually Add P2P Edge ──
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
            snackActions.success(`P2P edge added → #${addEdgeSelectedDest.display_id}`);
            refetch();
            refetchEdges();
        } catch (e: unknown) {
            snackActions.error('Failed to add edge: ' + getErrorMessage(e));
        }
        setManuallyAddEdgeModal(null);
        setAddEdgeSelectedProfile(null);
        setAddEdgeSelectedDest(null);
        setAddEdgeDestOptions([]);
    }, [manuallyAddEdgeModal, addEdgeSelectedProfile, addEdgeSelectedDest, addEdge, refetch, refetchEdges]);

    // ── Download graph as SVG ──
    const handleDownloadSVG = useCallback(async () => {
        const el = graphContainerRef.current;
        if (!el) return;
        try {
            snackActions.info('Generating SVG...');
            const dataUrl = await toSvg(el, { backgroundColor: '#050505' });
            downloadDataUrl(dataUrl, 'network_topology.svg');
        } catch (e: unknown) {
            snackActions.error('SVG export failed: ' + getErrorMessage(e));
        }
    }, []);

    // ── Download graph as PNG ──
    const handleDownloadPNG = useCallback(async () => {
        const el = graphContainerRef.current;
        if (!el) return;
        try {
            snackActions.info('Generating image...');
            const dataUrl = await toPng(el, { backgroundColor: '#050505', pixelRatio: 2 });
            downloadDataUrl(dataUrl, 'network_topology.png');
        } catch (e: unknown) {
            snackActions.error('Download failed: ' + getErrorMessage(e));
        }
    }, []);

    return (
        <div ref={graphContainerRef} className="w-full h-full bg-[#050505] border border-ghost/30 relative overflow-hidden rounded-lg">
             {/* Control Buttons */}
             <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">

                {/* Link Focus Indicator */}
                {linkFocusNodeId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/40 rounded text-xs font-mono text-amber-400 animate-pulse">
                        <Crosshair size={12} className="shrink-0" />
                        <span className="max-w-[90px] truncate" title={linkFocusNodeLabel}>FOCUS: {linkFocusNodeLabel}</span>
                        <button
                            onClick={() => handleClearLinkFocus()}
                            className="ml-1 text-amber-500/60 hover:text-amber-300 transition-colors"
                            title="Clear Link Focus"
                        >
                            <X size={11} />
                        </button>
                    </div>
                )}

                {/* View Mode Toggle */}
                <div className="flex border border-signal/30 rounded overflow-hidden">
                    <button
                        onClick={() => setGraphViewMode('CALLBACKS')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono transition-colors ${
                            graphViewMode === 'CALLBACKS'
                                ? 'bg-signal/20 text-signal border-r border-signal/30'
                                : 'bg-black/60 text-gray-500 hover:text-signal/70 border-r border-signal/10'
                        }`}
                        title="Callback Graph View"
                    >
                        <Network size={13} /> CALLBACKS
                    </button>
                    <button
                        onClick={() => setGraphViewMode('BROWSERSCRIPTS')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono transition-colors ${
                            graphViewMode === 'BROWSERSCRIPTS'
                                ? 'bg-signal/20 text-signal'
                                : 'bg-black/60 text-gray-500 hover:text-signal/70'
                        }`}
                        title="Browserscript Graph View"
                    >
                        <Code size={13} /> SCRIPTS
                    </button>
                </div>
                <button
                    onClick={() => setShowHiddenNodes(!showHiddenNodes)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded transition-colors text-xs font-mono ${
                        showHiddenNodes 
                            ? 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-500/50 text-yellow-500'
                            : 'bg-gray-500/20 hover:bg-gray-500/30 border-gray-500/50 text-gray-400'
                    }`}
                    title={showHiddenNodes ? "Hide Hidden Nodes" : "Show Hidden Nodes"}
                >
                    <EyeOff size={14} />
                    {showHiddenNodes ? 'HIDE' : 'SHOW'} HIDDEN
                </button>
                {customNodes.length > 0 && (
                    <button
                        onClick={handleExportCustomNodes}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-400 rounded transition-colors text-xs font-mono"
                        title="Export/Import Custom Nodes"
                    >
                        <Share2 size={14} />
                        SHARE
                    </button>
                )}
                <button
                    onClick={() => setShowCustomNodeModal(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-signal/20 hover:bg-signal/30 border border-signal/50 text-signal rounded transition-colors text-xs font-mono"
                    title="Add Custom Node"
                >
                    <Plus size={14} />
                    ADD NODE
                </button>
                <button
                    onClick={() => setShowConfigPanel(p => !p)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded transition-colors text-xs font-mono ${
                        showConfigPanel
                            ? 'bg-signal/20 border-signal/60 text-signal'
                            : 'bg-black/60 border-signal/30 text-signal/70 hover:bg-signal/10 hover:border-signal/50'
                    }`}
                    title="Graph Configuration"
                >
                    <SlidersHorizontal size={14} />
                    CONFIG
                </button>
                </div>

                {/* Config Panel */}
                {showConfigPanel && (
                    <GraphConfigPanel
                        layoutDir={layoutDir} setLayoutDir={setLayoutDir}
                        showAllEdges={showAllEdges} setShowAllEdges={setShowAllEdges}
                        packetFlowView={packetFlowView} setPacketFlowView={setPacketFlowView}
                        mergeByHost={mergeByHost} setMergeByHost={setMergeByHost}
                        groupBy={groupBy} setGroupBy={setGroupBy}
                        nodeLabels={nodeLabels} setNodeLabels={setNodeLabels}
                        onDownloadPNG={handleDownloadPNG} onDownloadSVG={handleDownloadSVG}
                    />
                )}
            </div>
            
             {/* Loading/Error Indicators */}
             {(callbacksLoading && !callbacksData) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 text-signal font-mono text-xs">
                    LOADING_TOPOLOGY...
                </div>
            )}
            
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-[0.1] pointer-events-none" 
                 style={{ 
                     backgroundImage: `
                        linear-gradient(rgba(34, 197, 94, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(34, 197, 94, 0.1) 1px, transparent 1px)
                     `,
                     backgroundSize: '40px 40px'
                 }}>
            </div>

            {/* Filters for Edge Effects */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
              <defs>
                <filter id="glow-pulse" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>

            {graphViewMode === 'CALLBACKS' && (
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                    type: 'straight',
                    style: { stroke: '#ffffff', strokeWidth: 2, opacity: 0.95, zIndex: 200 },
                    animated: false
                }}
                defaultViewport={viewportRef.current}
                onMove={(_, viewport) => {
                    // Update both ref (used by camera-restoration logic) and the
                    // live state that drives flow-anchored panels (e.g. LINK_TO_PARENT).
                    viewportRef.current = viewport;
                    setLiveViewport(viewport);
                }}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                onEdgeContextMenu={onEdgeContextMenu}
                onPaneContextMenu={onPaneContextMenu}
                onPaneClick={onPaneClick}
                onNodeDragStop={onNodeDragStop}
                fitView
                fitViewOptions={{ padding: 0.5, minZoom: 0.1, maxZoom: 1 }}
                className="bg-transparent"
                minZoom={0.1}
                maxZoom={4}
                zoomOnScroll={true}
                panOnScroll={true}
                zoomOnDoubleClick={false}
            >
                <Background color="#333" gap={20} className="opacity-20" />
            </ReactFlow>
            )}

            <BrowserScriptView
                active={graphViewMode === 'BROWSERSCRIPTS'}
                onRemoveEdge={(cbInfo) => {
                    handleOpenRemoveEdge(cbInfo);
                }}
                onAddP2PEdge={(cbInfo) => {
                    setManuallyAddEdgeModal(cbInfo);
                    setAddEdgeSelectedProfile(null);
                    setAddEdgeSelectedDest(null);
                    setAddEdgeDestOptions([]);
                }}
                onTaskForEdge={(cbInfo) => {
                    setTaskForEdgeModal(cbInfo);
                    getLinkCommands({ variables: { callback_id: cbInfo.callback_id } });
                }}
            />
            
            {/* Status Overlay */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-mono text-signal bg-black/60 px-3 py-1 border border-signal/20 backdrop-blur-sm shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                    <div className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
                    {graphViewMode === 'BROWSERSCRIPTS' ? 'BROWSERSCRIPT_VIEW_ACTIVE' : 'NETWORK_TOPOLOGY_ACTIVE'}
                </div>
                {customNodes.length > 0 && graphViewMode === 'CALLBACKS' && (

                    <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-black/60 px-3 py-1 border border-cyan-500/20 backdrop-blur-sm">
                        <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                        {customNodes.length} CUSTOM_NODE{customNodes.length > 1 ? 'S' : ''}
                    </div>
                )}
            </div>

            <GraphContextMenus
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                edgeContextMenu={edgeContextMenu}
                setEdgeContextMenu={setEdgeContextMenu}
                paneContextMenu={paneContextMenu}
                setPaneContextMenu={setPaneContextMenu}
                linkFocusNodeId={linkFocusNodeId}
                edgesData={edgesData}
                setEdges={setEdges}
                setNodes={setNodes}
                removeEdgeMutation={removeEdge}
                onEditCustomNode={openEditCustomNode}
                onClearLinkFocus={handleClearLinkFocus}
                onSetLinkFocus={handleSetLinkFocus}
                onSetParent={openSetParent}
                getParentEdge={getParentEdge}
                onDisconnectParent={handleDisconnectParent}
                onDeleteCustomNode={handleDeleteCustomNode}
                onNavigateConsole={(displayId) => navigate(`/console/${displayId}`)}
                onOpenDetails={openDetails}
                onEditDescription={openEditDescription}
                onLockToggle={handleLockToggle}
                onHide={handleHide}
                onTaskForEdge={(cb, callbackId) => {
                    setTaskForEdgeModal(cb);
                    getLinkCommands({ variables: { callback_id: callbackId } });
                }}
                onRemoveEdge={handleOpenRemoveEdge}
                onAddP2PEdge={(cb) => {
                    setManuallyAddEdgeModal(cb);
                    setAddEdgeSelectedProfile(null);
                    setAddEdgeSelectedDest(null);
                    setAddEdgeDestOptions([]);
                }}
                onTriggerEventing={(cb) => setShowEventingDialog(cb)}
            />

            <GraphModals
                editDescriptionModal={editDescriptionModal}
                setEditDescriptionModal={setEditDescriptionModal}
                newDescription={newDescription}
                setNewDescription={setNewDescription}
                handleSaveDescription={handleSaveDescription}
                showCustomNodeModal={showCustomNodeModal}
                setShowCustomNodeModal={setShowCustomNodeModal}
                customNodeForm={customNodeForm}
                setCustomNodeForm={setCustomNodeForm}
                handleCreateCustomNode={handleCreateCustomNode}
                editCustomNodeModal={editCustomNodeModal}
                setEditCustomNodeModal={setEditCustomNodeModal}
                handleUpdateCustomNode={handleUpdateCustomNode}
                showExportImportModal={showExportImportModal}
                setShowExportImportModal={setShowExportImportModal}
                exportData={exportData}
                importData={importData}
                setImportData={setImportData}
                customNodesCount={customNodes.length}
                customEdgesCount={customEdges.length}
                handleCopyExportData={handleCopyExportData}
                handleImportCustomNodes={handleImportCustomNodes}
                setParentModal={setParentModal}
                setSetParentModal={setSetParentModal}
                setParentAnchor={setParentAnchor}
                setSetParentAnchor={setSetParentAnchor}
                liveViewport={liveViewport}
                selectedDestination={selectedDestination as any}
                setSelectedDestination={setSelectedDestination}
                selectedProfile={selectedProfile}
                setSelectedProfile={setSelectedProfile}
                isP2PConnection={isP2PConnection}
                setIsP2PConnection={setIsP2PConnection}
                edgeLabel={edgeLabel}
                setEdgeLabel={setEdgeLabel}
                filteredCallbacksForParent={filteredCallbacksForParent}
                p2pData={p2pData}
                allC2Data={allC2Data}
                handleSetParent={handleSetParent}
                detailsModal={detailsModal}
                setDetailsModal={setDetailsModal}
                openEditCustomNode={openEditCustomNode}
                taskForEdgeModal={taskForEdgeModal}
                setTaskForEdgeModal={setTaskForEdgeModal}
                taskForEdgeCommand={taskForEdgeCommand}
                setTaskForEdgeCommand={setTaskForEdgeCommand}
                taskForEdgeParams={taskForEdgeParams}
                setTaskForEdgeParams={setTaskForEdgeParams}
                taskingForEdge={taskingForEdge}
                setTaskingForEdge={setTaskingForEdge}
                linkCommandsData={linkCommandsData}
                linkCommandsLoading={linkCommandsLoading}
                createTask={createTask}
                showEventingDialog={showEventingDialog}
                setShowEventingDialog={setShowEventingDialog}
                manuallyAddEdgeModal={manuallyAddEdgeModal}
                setManuallyAddEdgeModal={setManuallyAddEdgeModal}
                addEdgeSelectedProfile={addEdgeSelectedProfile}
                setAddEdgeSelectedProfile={setAddEdgeSelectedProfile}
                addEdgeSelectedDest={addEdgeSelectedDest as any}
                setAddEdgeSelectedDest={setAddEdgeSelectedDest}
                addEdgeDestOptions={addEdgeDestOptions}
                setAddEdgeDestOptions={setAddEdgeDestOptions}
                handleManuallyAddEdge={handleManuallyAddEdge}
                removeEdgeModal={removeEdgeModal}
                setRemoveEdgeModal={setRemoveEdgeModal}
                removeEdge={removeEdge}
            />
        </div>
    );
});
