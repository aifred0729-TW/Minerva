/**
 * Topology3D.tsx — Three-Dimensional Cyber-Topology Map for Minerva C2
 *
 * A fully interactive 3D network topology visualization built on Three.js
 * (via @react-three/fiber + @react-three/drei).
 *
 * Design aesthetic: Cyberpunk 2077 minimalism — deep charcoal bg, neon accents,
 * glassmorphism HUD panels, flowing data-beam edges, wireframe subnet volumes.
 *
 * Data model:
 *   - Minerva Core (central hub)
 *   - Custom Nodes (relay / proxy nodes from agentstorage)
 *   - Callback Nodes (victim endpoints from callbackgraphedge)
 *   - Subnet Zones (auto-grouped by /24 CIDR from callback IPs)
 *
 * Interactions:  Orbit / zoom / pan (OrbitControls),
 *                drag nodes with physics spring-back,
 *                right-click context menu on any 3D object,
 *                click to select + HUD detail panel
 */

// R3F global JSX types → see src/react-three-fiber.d.ts

import React, {
    useRef, useMemo, useCallback, useState, useEffect, Suspense,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line, Html, Billboard } from '@react-three/drei';
import { useQuery, useMutation, useLazyQuery, useSubscription } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCw, Maximize2, Minimize2, Eye, EyeOff,
    Server, Monitor, Cpu, Globe, Wifi,
    Lock, Unlock, XCircle, MessageSquare,
    Terminal, Activity, Zap, Box as BoxIcon, Network,
    ChevronRight, ChevronDown, Copy, Download, Settings,
    Edit, Info, GitBranch, X, Plus, Link2, Trash2, Crosshair, Shield, Hash,
} from 'lucide-react';

import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store';
import { cn, isCallbackAlive } from '../lib/utils';
import { snackActions } from '../../components/utilities/Snackbar';
import {
    GET_CALLBACK_GRAPH_EDGES,
    GET_CALLBACKS,
    GET_CUSTOM_GRAPH_NODES,
    GET_CUSTOM_GRAPH_EDGES,
    GET_LINK_FOCUS,
    HIDE_CALLBACK_MUTATION,
    LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION,
    ADD_EDGE_MUTATION,
    REMOVE_EDGE_MUTATION,
    GET_P2P_PROFILES_AND_CALLBACKS,
    GET_C2_PROFILES,
    UPDATE_CUSTOM_GRAPH_NODE,
    DELETE_CUSTOM_GRAPH_NODE,
    CREATE_CUSTOM_GRAPH_EDGE,
    DELETE_CUSTOM_GRAPH_EDGE,
    GET_LINK_COMMANDS_FOR_CALLBACK,
    CREATE_TASK_MUTATION,
    SET_LINK_FOCUS,
    CLEAR_LINK_FOCUS,
    SUBSCRIBE_TASK_STATUS_BY_ID,
    UPDATE_IPS_MUTATION,
} from '../lib/api';
import {
    parseAgentStorageResults,
    parseEdgeStorageResults,
    prepareUpdateNodeData,
    generateUniqueId,
    serializeEdgeData,
    generateEdgeUniqueId,
} from '../lib/customGraphNodeService';
import { CyberModal } from '../components/CyberModal';
import { MythicDialog } from '../../components/MythicComponents/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/pages/Eventing/EventTriggerContextSelect';
import { createPortal } from 'react-dom';

// ═══════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════
const CORE_COLOR       = new THREE.Color('#22d3ee');   // cyan
const CALLBACK_COLOR   = new THREE.Color('#22c55e');   // green
const CALLBACK_DEAD    = new THREE.Color('#ef4444');   // red
const CUSTOM_COLOR     = new THREE.Color('#f59e0b');   // amber
const EDGE_COLOR       = new THREE.Color('#22d3ee');
const EDGE_P2P_COLOR   = new THREE.Color('#a855f7');   // purple
const SUBNET_COLOR     = new THREE.Color('#22c55e');
const BG_COLOR         = '#050505';

const NODE_RADIUS      = 0.4;
const CORE_RADIUS      = 0.8;
const CUSTOM_RADIUS    = 0.5;
const SUBNET_PADDING   = 2.5;
const NODE_SPACING     = 2.8;  // horizontal spacing between nodes in a row
const MIN_CORE_DIST    = 5;    // Z distance from core to first depth layer
const CHILD_RING_DIST  = 4;    // Z distance between depth layers

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════
interface TopoNode {
    id: string;
    type: 'core' | 'callback' | 'custom';
    label: string;
    sublabel: string;
    position: THREE.Vector3;
    color: THREE.Color;
    radius: number;
    alive: boolean;
    data: any;    // raw callback / custom node payload (representative)
    allCallbacks?: any[];     // all callbacks grouped on this machine (sorted best-first)
    subnet?: string;
    callbackCount?: number;   // how many callbacks grouped into this machine node
    callbackIds?: number[];   // display_ids of all grouped callbacks
    osLabel?: string;         // e.g. "Windows", "Linux", "macOS"
    privilege?: string;       // e.g. "SYSTEM", "root", "user"
    ipAddress?: string;       // primary clean IPv4 address
}
interface TopoEdge {
    id: string;
    source: string;
    target: string;
    color: THREE.Color;
    isP2P: boolean;
    label: string;
}
interface SubnetZone {
    cidr: string;
    center: THREE.Vector3;
    size: THREE.Vector3;
    nodeIds: string[];
}

// ═══════════════════════════════════════════════
//  QuickHack Definitions (shared from lib/quickhacks)
// ═══════════════════════════════════════════════
import { QuickHackDef, QuickHackVariable, useQuickHacks, hackNeedsInput, resolveParams, extractAllIPs } from '../lib/quickhacks';
import { playThreeLoad, playSelectQH, playDoneQH } from '../lib/soundEffects';

/** QuickHack execution state */
interface QuickHackExecution {
    hack: QuickHackDef;
    callbackId: number;
    callbackDisplayId: number;
    callbackHost: string;
    taskId: number | null;
    phase: 'awaiting_input' | 'uploading' | 'processing' | 'completed' | 'error' | 'timeout';
    progress: number;         // 0-100
    startTime: number;
    errorMsg?: string;
    nodePosition: THREE.Vector3;  // 3D position for screen projection
    execId: string;           // unique key for multi-execution support
    variableValues: Record<string, string>;  // filled variable values keyed by variable key
}

// ═══════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════
/** Deterministic /24 subnet from an IP string */
function ipToSubnet(ip: string): string | null {
    if (!ip) return null;
    const m = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    return m ? `${m[1]}.0/24` : null;
}

function getOSLabel(data: any): string {
    const os = (data?.os || data?.operating_system || '').toLowerCase();
    if (os.includes('windows')) return 'WIN';
    if (os.includes('linux'))   return 'LNX';
    if (os.includes('mac'))     return 'MAC';
    return 'UNK';
}

function getOSFullLabel(data: any): string {
    const os = (data?.os || data?.operating_system || '').toLowerCase();
    if (os.includes('windows')) return 'Windows';
    if (os.includes('linux'))   return 'Linux';
    if (os.includes('mac'))     return 'macOS';
    return os || 'Unknown';
}

/** Extract clean primary IPv4 from callback ip field (may be JSON array or plain string) */
function extractPrimaryIP(ip: any): string {
    if (!ip) return '';
    let candidates: string[] = [];
    if (typeof ip === 'string') {
        // Might be a JSON array like '["10.9.20.13","fe80::..."]' or plain IP
        const trimmed = ip.trim();
        if (trimmed.startsWith('[')) {
            try { candidates = JSON.parse(trimmed); } catch { candidates = [trimmed]; }
        } else {
            candidates = [trimmed];
        }
    } else if (Array.isArray(ip)) {
        candidates = ip.map(String);
    } else {
        return String(ip);
    }
    // Prefer IPv4 over IPv6
    const ipv4 = candidates.find(c => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(c.trim()));
    return ipv4?.trim() || candidates[0]?.trim() || '';
}

/** Get privilege/integrity display string */
function getPrivilegeLabel(data: any): string {
    const il = data?.integrity_level;
    if (il === 4 || il === 'SYSTEM') return 'SYSTEM';
    if (il === 3 || il === 'High')   return 'Admin';
    if (il === 2 || il === 'Medium') return 'User';
    if (il === 1 || il === 'Low')    return 'Low';
    // Fallback: check user field for hints
    const user = (data?.user || '').toLowerCase();
    if (user === 'root' || user === 'system' || user.includes('nt authority')) return 'SYSTEM';
    if (data?.user) return data.user;
    return '';
}

// ═══════════════════════════════════════════════
//  Data Builder — transforms GQL data → 3D topology
// ═══════════════════════════════════════════════
function buildTopology(
    edges: any[],
    callbacks: any[],
    customNodes: any[],
    customEdges: any[],
    focusEdges: { source: string; target: string; c2profile: string }[],
    showInactive: boolean,
    showHidden: boolean,
): { nodes: TopoNode[]; edges: TopoEdge[]; subnets: SubnetZone[] } {
    const nodesMap = new Map<string, TopoNode>();
    const topoEdges: TopoEdge[] = [];

    // — Core —
    nodesMap.set('core', {
        id: 'core', type: 'core', label: 'MINERVA', sublabel: 'CORE',
        position: new THREE.Vector3(0, 0, 0),
        color: CORE_COLOR, radius: CORE_RADIUS, alive: true, data: null,
    });

    // — Build complete callbacks map from both queries —
    const callbacksById = new Map<number, any>();
    for (const cb of callbacks) {
        callbacksById.set(cb.id, cb);
    }

    const seenCallbacks = new Set<number>();
    const allCallbacks: any[] = [];
    const rawEdges: { srcCbId: number; dstCbId: number; edgeId: number; c2profile: any; isP2P: boolean }[] = [];

    // Collect callbacks from edges
    for (const e of edges) {
        const isActive = e.end_timestamp === null;
        if (!showInactive && !isActive) continue;
        for (const cb of [e.source, e.destination]) {
            if (cb && !seenCallbacks.has(cb.id)) {
                seenCallbacks.add(cb.id);
                const full = callbacksById.get(cb.id);
                allCallbacks.push({ ...cb, ...full, _edgeActive: isActive });
            }
        }
        if (e.source && e.destination) {
            rawEdges.push({
                srcCbId: e.source.id,
                dstCbId: e.destination.id,
                edgeId: e.id,
                c2profile: e.c2profile,
                isP2P: e.c2profile?.is_p2p ?? false,
            });
        }
    }

    // Add callbacks from callbacks query that have NO edges
    for (const cb of callbacks) {
        if (!seenCallbacks.has(cb.id)) {
            seenCallbacks.add(cb.id);
            allCallbacks.push({ ...cb, _edgeActive: false });
        }
    }

    // — Group callbacks by host (machine) —
    // Filter out hidden (active===false) callbacks unless showHidden is on
    const hostGroups = new Map<string, any[]>();
    for (const cb of allCallbacks) {
        // Hidden filter: if callback is inactive AND showHidden is off, skip
        if (cb.active === false && !showHidden) continue;
        const key = (cb.host || `unknown-${cb.id}`).toLowerCase();
        const arr = hostGroups.get(key) || [];
        arr.push(cb);
        hostGroups.set(key, arr);
    }

    // cbId → machine node id mapping (for edge remapping)
    const cbIdToNodeId = new Map<number, string>();

    // ── First pass: create TopoNode for each machine (position deferred) ──
    const machineNodes: { nodeId: string; hostKey: string; node: TopoNode; os: string; subnet: string; alive: boolean }[] = [];
    hostGroups.forEach((cbs, hostKey) => {
        const nodeId = `machine-${hostKey}`;
        // Sort: alive first → highest privilege → newest
        const privOrder = (c: any) => {
            const il = c.integrity_level;
            if (il === 4 || il === 'SYSTEM') return 4;
            if (il === 3 || il === 'High') return 3;
            if ((c.user || '').toLowerCase() === 'root' || (c.user || '').toLowerCase().includes('nt authority')) return 4;
            if (il === 2 || il === 'Medium') return 2;
            return 1;
        };
        const sorted = [...cbs].sort((a, b) => {
            const aAlive = a.active !== false && isCallbackAlive(a) ? 1 : 0;
            const bAlive = b.active !== false && isCallbackAlive(b) ? 1 : 0;
            if (bAlive !== aAlive) return bAlive - aAlive;
            const aPriv = privOrder(a), bPriv = privOrder(b);
            if (bPriv !== aPriv) return bPriv - aPriv;
            return (b.display_id || 0) - (a.display_id || 0);
        });
        const rep = sorted[0];
        const anyAlive = sorted.some(c => c.active !== false && isCallbackAlive(c));
        const primaryIP = extractPrimaryIP(rep.ip);
        const subnet = ipToSubnet(primaryIP) || 'unknown';
        const os = getOSLabel(rep);

        for (const c of cbs) cbIdToNodeId.set(c.id, nodeId);
        const osFullLabel = getOSFullLabel(rep);
        const privilege = getPrivilegeLabel(rep);
        const isHighPriv = (rep.integrity_level === 4 || rep.integrity_level === 'SYSTEM' ||
            (rep.user || '').toLowerCase() === 'root' ||
            (rep.user || '').toLowerCase().includes('nt authority'));

        const topoNode: TopoNode = {
            id: nodeId, type: 'callback',
            label: rep.host || `Host-${rep.display_id}`,
            sublabel: cbs.length > 1
                ? `${cbs.length} callbacks · ${primaryIP || '?'}`
                : `${rep.user || '?'}@${rep.host || '?'}`,
            position: new THREE.Vector3(),
            color: anyAlive ? (isHighPriv ? new THREE.Color('#ff6b6b') : CALLBACK_COLOR) : CALLBACK_DEAD,
            radius: NODE_RADIUS, alive: anyAlive, data: rep,
            allCallbacks: sorted,
            subnet: subnet !== 'unknown' ? subnet : undefined,
            callbackCount: cbs.length,
            callbackIds: sorted.map(c => c.display_id),
            osLabel: osFullLabel,
            privilege: privilege,
            ipAddress: primaryIP,
        };
        nodesMap.set(nodeId, topoNode);
        machineNodes.push({ nodeId, hostKey, node: topoNode, os, subnet, alive: anyAlive });
    });

    // ── Tree-hierarchy layout: position nodes based on parent-child topology ──
    // First build all edges to determine tree structure, then position by tree depth

    // — Custom Nodes (positioned later in tree layout) —
    const visibleCustom = customNodes.filter(cn => !cn.hidden);
    visibleCustom.forEach((cn, i) => {
        const nodeId = `custom-${cn.id}`;
        nodesMap.set(nodeId, {
            id: nodeId, type: 'custom',
            label: cn.hostname || `Node-${cn.id}`,
            sublabel: cn.ip_address || '',
            position: new THREE.Vector3(),
            color: CUSTOM_COLOR, radius: CUSTOM_RADIUS, alive: true, data: cn,
        });
    });

    // — Build edges matching 2D CallbackGraph logic —
    const edgeDedup = new Set<string>();
    const nodesWithParent = new Set<string>();
    // Track parent→children for tree layout
    const childrenOf = new Map<string, Set<string>>();
    const parentOf = new Map<string, string>();

    const addTreeEdge = (parentId: string, childId: string) => {
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
        childrenOf.get(parentId)!.add(childId);
        parentOf.set(childId, parentId);
    };

    // 1) Database edges: map source→child, destination→parent
    for (const re of rawEdges) {
        const childNode = cbIdToNodeId.get(re.srcCbId);
        const parentNode = cbIdToNodeId.get(re.dstCbId);
        if (!childNode) continue;

        if (re.isP2P) {
            // P2P: direct link between two machines
            if (!parentNode || childNode === parentNode) continue;
            const dedupKey = `${parentNode}→${childNode}→${re.c2profile?.name || ''}`;
            if (edgeDedup.has(dedupKey)) continue;
            edgeDedup.add(dedupKey);
            topoEdges.push({
                id: `edge-${re.edgeId}`,
                source: parentNode,
                target: childNode,
                color: EDGE_P2P_COLOR,
                isP2P: true,
                label: re.c2profile?.name || '',
            });
            nodesWithParent.add(childNode);
            addTreeEdge(parentNode, childNode);
        } else {
            // Non-P2P: child talks to parent (parent may be another callback or same host)
            if (parentNode && parentNode !== childNode) {
                const dedupKey = `${parentNode}→${childNode}→${re.c2profile?.name || ''}`;
                if (edgeDedup.has(dedupKey)) continue;
                edgeDedup.add(dedupKey);
                topoEdges.push({
                    id: `edge-${re.edgeId}`,
                    source: parentNode,
                    target: childNode,
                    color: EDGE_COLOR,
                    isP2P: false,
                    label: re.c2profile?.name || '',
                });
                nodesWithParent.add(childNode);
                addTreeEdge(parentNode, childNode);
            }
            // If parentNode === childNode (same host), skip self-edge;
            // child will be connected to core via orphan logic below
        }
    }

    // 2) Custom edges: source = child callback/custom, target = parent callback/custom
    //    Remap raw callback IDs to machine node IDs
    customEdges.forEach(ce => {
        const remapId = (raw: string): string => {
            // Try numeric callback ID → machine node
            const numId = Number(raw);
            if (!isNaN(numId) && cbIdToNodeId.has(numId)) return cbIdToNodeId.get(numId)!;
            // Already a node ID (e.g. "custom-5")
            if (nodesMap.has(raw)) return raw;
            return raw;
        };
        const src = remapId(ce.source);   // child
        const tgt = remapId(ce.target);   // parent
        if (!nodesMap.has(src) || !nodesMap.has(tgt) || src === tgt) return;
        const dedupKey = `${tgt}→${src}→${ce.c2profile || ''}`;
        if (edgeDedup.has(dedupKey)) return;
        edgeDedup.add(dedupKey);
        topoEdges.push({
            id: `cue-${ce.id}`,
            source: tgt,   // parent → child (tree direction)
            target: src,
            color: CUSTOM_COLOR, isP2P: false,
            label: ce.c2profile || '',
        });
        nodesWithParent.add(src);
        addTreeEdge(tgt, src);
    });

    // 3) Custom node built-in parent links
    visibleCustom.forEach(cn => {
        const nodeId = `custom-${cn.id}`;
        if (cn.parent_id != null && cn.parent_type === 'callback') {
            const parentMachine = cbIdToNodeId.get(Number(cn.parent_id));
            if (parentMachine && nodesMap.has(parentMachine)) {
                const dedupKey = `${parentMachine}→${nodeId}→${cn.c2profile || ''}`;
                if (!edgeDedup.has(dedupKey)) {
                    edgeDedup.add(dedupKey);
                    topoEdges.push({
                        id: `ce-${cn.id}-parent`,
                        source: parentMachine,
                        target: nodeId,
                        color: CUSTOM_COLOR, isP2P: false,
                        label: cn.c2profile || '',
                    });
                    nodesWithParent.add(nodeId);
                    addTreeEdge(parentMachine, nodeId);
                }
            }
        } else if (cn.parent_id != null && cn.parent_type === 'custom') {
            const parentCustom = `custom-${cn.parent_id}`;
            if (nodesMap.has(parentCustom)) {
                const dedupKey = `${parentCustom}→${nodeId}→${cn.c2profile || ''}`;
                if (!edgeDedup.has(dedupKey)) {
                    edgeDedup.add(dedupKey);
                    topoEdges.push({
                        id: `ce-${cn.id}-parent`,
                        source: parentCustom,
                        target: nodeId,
                        color: CUSTOM_COLOR, isP2P: false,
                        label: cn.c2profile || '',
                    });
                    nodesWithParent.add(nodeId);
                    addTreeEdge(parentCustom, nodeId);
                }
            }
        }
    });

    // 4) Focus link edges — matching 2D Link Focus auto-connect behavior
    //    source = child callback ID, target = focus node ID
    for (const fe of focusEdges) {
        const remapFocusId = (raw: string): string => {
            const numId = Number(raw);
            if (!isNaN(numId) && cbIdToNodeId.has(numId)) return cbIdToNodeId.get(numId)!;
            if (nodesMap.has(raw)) return raw;
            return raw;
        };
        const childId = remapFocusId(fe.source);
        const parentId = remapFocusId(fe.target);
        if (!nodesMap.has(childId) || !nodesMap.has(parentId) || childId === parentId) continue;
        const dedupKey = `${parentId}→${childId}→${fe.c2profile}`;
        if (edgeDedup.has(dedupKey)) continue;
        edgeDedup.add(dedupKey);
        topoEdges.push({
            id: `focus-${childId}-${parentId}`,
            source: parentId,
            target: childId,
            color: EDGE_COLOR,
            isP2P: false,
            label: fe.c2profile || '',
        });
        nodesWithParent.add(childId);
        addTreeEdge(parentId, childId);
    }

    // 5) Connect orphan nodes (no parent) to MINERVA core — same as 2D root logic
    nodesMap.forEach((node, nodeId) => {
        if (nodeId === 'core') return;
        if (nodesWithParent.has(nodeId)) return;
        topoEdges.push({
            id: `root-${nodeId}`,
            source: 'core',
            target: nodeId,
            color: node.type === 'custom' ? CUSTOM_COLOR : EDGE_COLOR,
            isP2P: false,
            label: '',
        });
        addTreeEdge('core', nodeId);
    });

    // ── Subnet-aware tree-hierarchy positioning ──
    // Step 1: Build subnet groups for clustering
    const subnetMap = new Map<string, string[]>();
    nodesMap.forEach(n => {
        if (n.subnet) {
            const arr = subnetMap.get(n.subnet) || [];
            arr.push(n.id);
            subnetMap.set(n.subnet, arr);
        }
    });

    // Step 2: Grid-aligned hierarchical layout
    // BFS from core assigns each node a depth level. Within each level, nodes are
    // arranged on a clean horizontal row (X-axis) centered at X=0, with each depth
    // at a fixed Z offset. Same-subnet nodes are grouped adjacently for tidy bounding boxes.
    const positioned = new Set<string>();
    nodesMap.get('core')!.position.set(0, 0, 0);
    positioned.add('core');

    // 2a) BFS to determine depth of each node
    const nodeDepth = new Map<string, number>();
    nodeDepth.set('core', 0);
    const bfsQueue: string[] = ['core'];
    const depthBuckets = new Map<number, string[]>();
    depthBuckets.set(0, ['core']);

    while (bfsQueue.length > 0) {
        const current = bfsQueue.shift()!;
        const children = childrenOf.get(current);
        if (!children) continue;
        const d = nodeDepth.get(current)! + 1;
        children.forEach(childId => {
            if (nodeDepth.has(childId)) return;
            if (!nodesMap.has(childId)) return;
            nodeDepth.set(childId, d);
            bfsQueue.push(childId);
            if (!depthBuckets.has(d)) depthBuckets.set(d, []);
            depthBuckets.get(d)!.push(childId);
        });
    }

    // Catch disconnected nodes not reached by BFS
    nodesMap.forEach((_, nodeId) => {
        if (nodeId === 'core') return;
        if (!nodeDepth.has(nodeId)) {
            nodeDepth.set(nodeId, 1);
            if (!depthBuckets.has(1)) depthBuckets.set(1, []);
            depthBuckets.get(1)!.push(nodeId);
        }
    });

    // 2b) Position each depth row on a clean grid
    const LAYER_SPACING_Z = CHILD_RING_DIST + 1;
    const maxDepth = Math.max(...Array.from(depthBuckets.keys()));

    for (let d = 1; d <= maxDepth; d++) {
        const bucket = depthBuckets.get(d);
        if (!bucket || bucket.length === 0) continue;

        // Sort: primary by parent X (cluster subtrees), secondary by subnet, tertiary by label
        const enriched = bucket.map(id => {
            const parent = parentOf.get(id);
            const parentX = parent && nodesMap.has(parent) ? nodesMap.get(parent)!.position.x : 0;
            const node = nodesMap.get(id)!;
            return { id, parentX, subnet: node.subnet || '', label: node.label };
        });
        enriched.sort((a, b) =>
            a.parentX - b.parentX ||
            a.subnet.localeCompare(b.subnet) ||
            a.label.localeCompare(b.label)
        );

        const sortedIds = enriched.map(e => e.id);
        const count = sortedIds.length;
        const rowZ = d * LAYER_SPACING_Z;
        const totalWidth = (count - 1) * NODE_SPACING;
        const startX = -totalWidth / 2;

        for (let i = 0; i < count; i++) {
            const node = nodesMap.get(sortedIds[i])!;
            node.position.set(startX + i * NODE_SPACING, 0, rowZ);
            positioned.add(sortedIds[i]);
        }
    }

    // 2c) Re-center core between its direct children for balanced look
    const coreChildren = [...(childrenOf.get('core') || [])];
    if (coreChildren.length > 0) {
        let minX = Infinity, maxX = -Infinity;
        for (const cid of coreChildren) {
            const n = nodesMap.get(cid);
            if (n) { minX = Math.min(minX, n.position.x); maxX = Math.max(maxX, n.position.x); }
        }
        nodesMap.get('core')!.position.set((minX + maxX) / 2, 0, -MIN_CORE_DIST);
    } else {
        nodesMap.get('core')!.position.set(0, 0, -MIN_CORE_DIST);
    }

    // Step 3: Apply Y-axis variation for same-subnet nodes across multiple depth rows
    // This preserves the existing vertical stacking aesthetic
    subnetMap.forEach((nodeIds) => {
        if (nodeIds.length < 2) return;
        const members = nodeIds.map(id => nodesMap.get(id)!);
        // If members span multiple depth rows, add slight Y variation within each subnet
        const rows = new Set(members.map(n => n.position.z));
        if (rows.size > 1) {
            let yOff = 0;
            let lastZ = -Infinity;
            members.sort((a, b) => a.position.z - b.position.z || a.position.x - b.position.x);
            for (const node of members) {
                if (node.position.z !== lastZ) { yOff += 0.8; lastZ = node.position.z; }
                node.position.y = yOff - 0.8;
            }
        }
    });

    // — Subnet Zones (computed from final positions) —
    const subnets: SubnetZone[] = [];
    subnetMap.forEach((nodeIds, cidr) => {
        if (nodeIds.length < 2) return;
        const positions = nodeIds.map(id => nodesMap.get(id)!.position);
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        positions.forEach(p => { min.min(p); max.max(p); });
        const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
        const size = new THREE.Vector3().subVectors(max, min).addScalar(SUBNET_PADDING * 2);
        size.x = Math.max(size.x, 3);
        size.y = Math.max(size.y, 3);
        size.z = Math.max(size.z, 3);
        subnets.push({ cidr, center, size, nodeIds });
    });

    return {
        nodes: Array.from(nodesMap.values()),
        edges: topoEdges.filter(e => nodesMap.has(e.source) && nodesMap.has(e.target)),
        subnets,
    };
}

// ═══════════════════════════════════════════════
//  3D Components
// ═══════════════════════════════════════════════

/** Geometric minimalist self-luminous node */
const NodeSphere = React.memo(({
    node, isSelected, onSelect, onContextMenu, onDragStart, onDragEnd, pickingDim,
}: {
    node: TopoNode;
    isSelected: boolean;
    onSelect: (id: string, screenPos?: { x: number; y: number }) => void;
    onContextMenu: (e: ThreeEvent<MouseEvent>, id: string) => void;
    onDragStart: (id: string) => void;
    onDragEnd: (id: string, pos: THREE.Vector3) => void;
    pickingDim?: 'dim' | 'brighten' | null;
}) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    const groupRef = useRef<THREE.Group>(null!);
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);
    const { camera, raycaster, gl } = useThree();
    const dragPlane = useRef(new THREE.Plane());
    const dragOffset = useRef(new THREE.Vector3());

    const r = node.radius;

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            if (node.type === 'core') {
                meshRef.current.rotation.y = t * 0.2;
                meshRef.current.rotation.x = t * 0.15;
            } else {
                meshRef.current.rotation.y = t * 0.1;
            }
            // Breathing emissive pulse for alive nodes
            if (node.alive && node.type !== 'core') {
                const mat = meshRef.current.material as THREE.MeshStandardMaterial;
                let base = isSelected ? 3.0 : hovered ? 2.0 : 1.2;
                if (pickingDim === 'dim') base *= 0.25;
                else if (pickingDim === 'brighten') base *= 1.3;
                mat.emissiveIntensity = base + Math.sin(t * 1.5 + node.position.x * 2) * (pickingDim === 'dim' ? 0.1 : 0.4);
            }
            // Dim core node during picking
            if (node.type === 'core' && pickingDim === 'dim') {
                const mat = meshRef.current.material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = 0.3;
            }
        }
    });

    const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.button === 2) return;
        setDragging(true);
        onDragStart(node.id);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        dragPlane.current.setFromNormalAndCoplanarPoint(camDir, node.position);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane.current, intersection);
        dragOffset.current.subVectors(node.position, intersection);
        (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
        gl.domElement.style.cursor = 'grabbing';
    }, [camera, raycaster, gl, node.id, node.position, onDragStart]);

    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (!dragging) return;
        e.stopPropagation();
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane.current, intersection);
        if (intersection) {
            const newPos = intersection.add(dragOffset.current);
            node.position.copy(newPos);
            if (groupRef.current) groupRef.current.position.copy(newPos);
        }
    }, [dragging, raycaster, node]);

    const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (!dragging) return;
        e.stopPropagation();
        setDragging(false);
        onDragEnd(node.id, node.position.clone());
        gl.domElement.style.cursor = 'auto';
    }, [dragging, gl, node.id, node.position, onDragEnd]);

    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const nativeEvent = e.nativeEvent || (e as any);
        onSelect(node.id, { x: nativeEvent.clientX ?? 0, y: nativeEvent.clientY ?? 0 });
    }, [node.id, onSelect]);

    const handleRightClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onContextMenu(e, node.id);
    }, [node.id, onContextMenu]);

    const color = useMemo(() => node.color.getHex(), [node.color]);
    const colorStr = useMemo(() => `#${node.color.getHexString()}`, [node.color]);

    return (
        <group ref={groupRef} position={node.position}>
            {/* ── Main geometric body (self-emitting) ── */}
            <mesh
                ref={meshRef}
                onClick={handleClick}
                onContextMenu={handleRightClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOver={() => { setHovered(true); gl.domElement.style.cursor = 'pointer'; }}
                onPointerOut={() => { setHovered(false); if (!dragging) gl.domElement.style.cursor = 'auto'; }}
            >
                {node.type === 'core' ? (
                    <icosahedronGeometry args={[r, 0]} />
                ) : node.type === 'custom' ? (
                    <tetrahedronGeometry args={[r * 1.1, 0]} />
                ) : (
                    <octahedronGeometry args={[r * 0.85, 0]} />
                )}
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={pickingDim === 'dim' ? 0.3 : isSelected ? 3.0 : hovered ? 2.0 : pickingDim === 'brighten' ? 1.5 : 1.2}
                    toneMapped={false}
                />
            </mesh>

            {/* ── Point light — the node illuminates its surroundings ── */}
            <pointLight
                color={color}
                intensity={pickingDim === 'dim' ? 0.1 : isSelected ? 2 : hovered ? 1 : pickingDim === 'brighten' ? 0.6 : 0.4}
                distance={isSelected ? 5 : 3}
                decay={2}
            />

            {/* ── Label ── */}
            <Billboard position={[0, -r - 0.35, 0]}>
                <Text
                    fontSize={0.22}
                    color={isSelected ? '#ffffff' : colorStr}
                    anchorX="center"
                    anchorY="top"
                    outlineWidth={0.02}
                    outlineColor="#000000"
                    font={undefined}
                    fontWeight="bold"
                >
                    {node.label}
                </Text>
            </Billboard>
            {/* ── Info lines: IP, OS, Privilege ── */}
            {node.type === 'callback' && (
                <>
                    <Billboard position={[0, -r - 0.6, 0]}>
                        <Text
                            fontSize={0.14}
                            color="#8ec8f8"
                            anchorX="center"
                            anchorY="top"
                            outlineWidth={0.01}
                            outlineColor="#000000"
                            font={undefined}
                        >
                            {node.ipAddress || '?.?.?.?'}
                        </Text>
                    </Billboard>
                    <Billboard position={[0, -r - 0.78, 0]}>
                        <Text
                            fontSize={0.12}
                            color="#aaa"
                            anchorX="center"
                            anchorY="top"
                            outlineWidth={0.01}
                            outlineColor="#000000"
                            font={undefined}
                        >
                            {[node.osLabel, node.privilege].filter(Boolean).join(' · ')}
                        </Text>
                    </Billboard>
                    {(node.callbackCount ?? 0) > 1 && (
                        <Billboard position={[0, -r - 0.94, 0]}>
                            <Text
                                fontSize={0.11}
                                color="#888"
                                anchorX="center"
                                anchorY="top"
                                outlineWidth={0.01}
                                outlineColor="#000000"
                                font={undefined}
                            >
                                {`${node.callbackCount} callbacks`}
                            </Text>
                        </Billboard>
                    )}
                </>
            )}
            {node.type !== 'callback' && (
                <Billboard position={[0, -r - 0.6, 0]}>
                    <Text
                        fontSize={0.12}
                        color="#666666"
                        anchorX="center"
                        anchorY="top"
                        outlineWidth={0.01}
                        outlineColor="#000000"
                        font={undefined}
                    >
                        {node.sublabel}
                    </Text>
                </Billboard>
            )}
        </group>
    );
});
NodeSphere.displayName = 'NodeSphere';

/** Animated data-beam edge */
const DataBeamEdge = React.memo(({
    sourcePos, targetPos, color, isP2P, label,
}: {
    sourcePos: THREE.Vector3;
    targetPos: THREE.Vector3;
    color: THREE.Color;
    isP2P: boolean;
    label: string;
}) => {
    const dashRef = useRef<any>(null);
    const mainLineRef = useRef<any>(null);
    const billboardRef = useRef<THREE.Group>(null);

    // Update line geometry + label every frame so edges follow dragged nodes
    useFrame(({ clock }) => {
        if (dashRef.current) {
            dashRef.current.dashOffset = -clock.getElapsedTime() * 1.5;
        }
        const pts = [sourcePos.toArray(), targetPos.toArray()] as [number[], number[]];
        if (mainLineRef.current?.geometry) {
            mainLineRef.current.geometry.setPositions(pts.flat());
        }
        if (dashRef.current?.geometry) {
            dashRef.current.geometry.setPositions(pts.flat());
        }
        if (billboardRef.current) {
            const mx = (sourcePos.x + targetPos.x) * 0.5;
            const my = (sourcePos.y + targetPos.y) * 0.5 + 0.3;
            const mz = (sourcePos.z + targetPos.z) * 0.5;
            billboardRef.current.position.set(mx, my, mz);
        }
    });

    const points = useMemo(() => [sourcePos, targetPos], [sourcePos, targetPos]);

    const colorHex = useMemo(() => `#${color.getHexString()}`, [color]);

    return (
        <group>
            {/* Main line */}
            <Line
                ref={mainLineRef}
                points={points}
                color={colorHex}
                lineWidth={isP2P ? 1.5 : 1}
                transparent
                opacity={0.4}
            />
            {/* Flowing dashes */}
            <Line
                ref={dashRef}
                points={points}
                color={colorHex}
                lineWidth={isP2P ? 2 : 1.5}
                dashed
                dashSize={0.3}
                dashScale={1}
                gapSize={0.6}
                transparent
                opacity={0.8}
            />
            {/* Label at midpoint — always faces camera */}
            {label && (
                <Billboard ref={billboardRef}>
                    <Text
                        fontSize={0.12}
                        color={colorHex}
                        anchorX="center"
                        anchorY="bottom"
                        outlineWidth={0.01}
                        outlineColor="#000000"
                        font={undefined}
                    >
                        {label}
                    </Text>
                </Billboard>
            )}
        </group>
    );
});
DataBeamEdge.displayName = 'DataBeamEdge';

/** Futuristic subnet zone — translucent volume with glowing scan-line edges */
const SubnetVolume = React.memo(({ zone }: { zone: SubnetZone }) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    const edgesRef = useRef<THREE.LineSegments>(null!);
    const glowRef = useRef<THREE.LineSegments>(null!);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
                0.015 + Math.sin(t * 0.4) * 0.008;
        }
        // Subtle edge glow pulse
        if (edgesRef.current) {
            (edgesRef.current.material as THREE.LineBasicMaterial).opacity =
                0.35 + Math.sin(t * 0.8) * 0.15;
        }
        if (glowRef.current) {
            (glowRef.current.material as THREE.LineBasicMaterial).opacity =
                0.08 + Math.sin(t * 0.8) * 0.04;
        }
    });

    const edgesGeo = useMemo(() => {
        const box = new THREE.BoxGeometry(zone.size.x, zone.size.y, zone.size.z);
        return new THREE.EdgesGeometry(box);
    }, [zone.size]);

    const subnetHex = SUBNET_COLOR.getHex();
    const subnetStr = `#${SUBNET_COLOR.getHexString()}`;

    return (
        <group position={zone.center}>
            {/* Ultra-thin translucent fill */}
            <mesh ref={meshRef}>
                <boxGeometry args={[zone.size.x, zone.size.y, zone.size.z]} />
                <meshBasicMaterial
                    color={subnetHex}
                    transparent
                    opacity={0.015}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Outer glow pass (thicker, very faint) */}
            <lineSegments ref={glowRef} geometry={edgesGeo}>
                <lineBasicMaterial
                    color={subnetHex}
                    transparent
                    opacity={0.1}
                    linewidth={3}
                />
            </lineSegments>
            {/* Inner crisp edge */}
            <lineSegments ref={edgesRef} geometry={edgesGeo}>
                <lineBasicMaterial
                    color={subnetHex}
                    transparent
                    opacity={0.4}
                />
            </lineSegments>
            {/* Corner accent dots — 4 top corners for futuristic mark */}
            {[
                [zone.size.x / 2, zone.size.y / 2, zone.size.z / 2],
                [-zone.size.x / 2, zone.size.y / 2, zone.size.z / 2],
                [zone.size.x / 2, zone.size.y / 2, -zone.size.z / 2],
                [-zone.size.x / 2, zone.size.y / 2, -zone.size.z / 2],
            ].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]}>
                    <sphereGeometry args={[0.04, 8, 8]} />
                    <meshBasicMaterial color={subnetHex} toneMapped={false} />
                </mesh>
            ))}
            {/* CIDR Label — minimalist, slightly above */}
            <Billboard position={[0, zone.size.y / 2 + 0.2, 0]}>
                <Text
                    fontSize={0.22}
                    color={subnetStr}
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.015}
                    outlineColor="#000000"
                    font={undefined}
                    letterSpacing={0.08}
                >
                    {`◇ ${zone.cidr}`}
                </Text>
            </Billboard>
            {/* Node count micro-label */}
            <Billboard position={[0, zone.size.y / 2 + 0.02, 0]}>
                <Text
                    fontSize={0.12}
                    color="#555"
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.01}
                    outlineColor="#000000"
                    font={undefined}
                    letterSpacing={0.05}
                >
                    {`${zone.nodeIds.length} nodes`}
                </Text>
            </Billboard>
        </group>
    );
});
SubnetVolume.displayName = 'SubnetVolume';

/** Infinite ground grid — fades to horizon using a custom shader on a large plane */
const infiniteGridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
        uColor1: { value: new THREE.Color('#2a5a6a') },
        uColor2: { value: new THREE.Color('#15303e') },
    },
    vertexShader: `
        varying vec3 vWorldPos;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec3 vWorldPos;
        void main() {
            vec2 coord = vWorldPos.xz;
            // Major grid lines every 2 units
            vec2 grid1 = abs(fract(coord / 2.0 - 0.5) - 0.5) / fwidth(coord / 2.0);
            float lineMajor = min(grid1.x, grid1.y);
            // Minor grid lines every 0.5 units
            vec2 grid2 = abs(fract(coord / 0.5 - 0.5) - 0.5) / fwidth(coord / 0.5);
            float lineMinor = min(grid2.x, grid2.y);
            // Distance fade
            float dist = length(coord);
            float fade = 1.0 - smoothstep(40.0, 200.0, dist);
            // Combine
            float major = 1.0 - min(lineMajor, 1.0);
            float minor = 1.0 - min(lineMinor, 1.0);
            vec3 color = mix(uColor2, uColor1, major);
            float alpha = (major * 0.9 + minor * 0.25) * fade;
            gl_FragColor = vec4(color, alpha);
        }
    `,
});

const InfiniteGrid = ({ y = -8 }: { y?: number }) => {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]} material={infiniteGridMaterial}>
            <planeGeometry args={[600, 600, 1, 1]} />
        </mesh>
    );
};

/** Ambient environment — grid, particles, lighting */
const CyberEnvironment = () => {
    const particlesRef = useRef<THREE.Points>(null!);
    const particleCount = 500;

    const particlePositions = useMemo(() => {
        const arr = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            arr[i * 3]     = (Math.random() - 0.5) * 60;
            arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 60;
        }
        return arr;
    }, []);

    useFrame(({ clock }) => {
        if (particlesRef.current) {
            particlesRef.current.rotation.y = clock.getElapsedTime() * 0.01;
        }
    });

    return (
        <>
            <ambientLight intensity={0.15} />
            <pointLight position={[0, 10, 0]} intensity={0.8} color="#22d3ee" distance={50} />
            <pointLight position={[-10, -5, 10]} intensity={0.3} color="#a855f7" distance={30} />

            {/* Infinite ground grid */}
            <InfiniteGrid y={-8} />

            {/* Floating particles */}
            <points ref={particlesRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={particleCount}
                        array={particlePositions}
                        itemSize={3}
                    />
                </bufferGeometry>
                <pointsMaterial
                    size={0.04}
                    color="#22d3ee"
                    transparent
                    opacity={0.3}
                    sizeAttenuation
                    depthWrite={false}
                />
            </points>
        </>
    );
};

/** Controls wrapper — disables orbit while dragging a node */
const SmartOrbitControls = ({ dragActive }: { dragActive: boolean }) => {
    const controlsRef = useRef<any>(null);
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.enabled = !dragActive;
        }
    }, [dragActive]);
    return (
        <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            minDistance={3}
            maxDistance={80}
            makeDefault
        />
    );
};

// ═══════════════════════════════════════════════
//  HUD (2D overlay) Components
// ═══════════════════════════════════════════════

// ── Glitch keyframes (injected once) ──
const glitchStyleId = 'quickhack-glitch-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(glitchStyleId)) {
    const style = document.createElement('style');
    style.id = glitchStyleId;
    style.textContent = `
        @keyframes qh-scanline {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100vh); }
        }
        @keyframes qh-glitch-skew {
            0%   { transform: skewX(0deg); }
            20%  { transform: skewX(-2deg); }
            40%  { transform: skewX(1.5deg); }
            60%  { transform: skewX(-1deg); }
            80%  { transform: skewX(0.5deg); }
            100% { transform: skewX(0deg); }
        }
        @keyframes qh-flicker {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.97; }
            51% { opacity: 0.4; }
            52% { opacity: 0.98; }
        }
        @keyframes qh-data-rain {
            0%   { transform: translateY(-10px); opacity: 0; }
            10%  { opacity: 1; }
            90%  { opacity: 1; }
            100% { transform: translateY(10px); opacity: 0; }
        }
        @keyframes qh-progress-glow {
            0%, 100% { box-shadow: 0 0 8px var(--qh-color), 0 0 2px var(--qh-color); }
            50% { box-shadow: 0 0 20px var(--qh-color), 0 0 6px var(--qh-color), 0 0 40px color-mix(in srgb, var(--qh-color) 30%, transparent); }
        }
        @keyframes qh-upload-pulse {
            0%, 100% { transform: scaleX(1); }
            50% { transform: scaleX(1.02); }
        }
    `;
    document.head.appendChild(style);
}

/** QuickHack floating panel — appears near the target node like CP2077 scan tooltip */
const QuickHackPanel = ({
    node,
    screenPos,
    onSelectHack,
    onClose,
    hacks,
}: {
    node: TopoNode;
    screenPos: { x: number; y: number };
    onSelectHack: (hack: QuickHackDef) => void;
    onClose: () => void;
    hacks: QuickHackDef[];
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const cb = node.data;
    const accentColor = '#ff003c';

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Position: anchor to top-right of the node, offset by 40px right and 60px up
    const panelX = screenPos.x + 40;
    const panelY = screenPos.y - 60;

    // Clamp to viewport
    const clampedX = Math.min(panelX, window.innerWidth - 280);
    const clampedY = Math.max(panelY, 8);

    return createPortal(
        <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: -10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[9999] w-[260px] font-mono"
            style={{ left: clampedX, top: clampedY }}
        >
            {/* Connector line from node to panel */}
            <svg className="absolute pointer-events-none" style={{
                left: -40, top: 60, width: 44, height: 2, overflow: 'visible',
            }}>
                <line x1="0" y1="1" x2="40" y2="1" stroke={`${accentColor}60`} strokeWidth="1" strokeDasharray="3 2" />
                <circle cx="0" cy="1" r="2" fill={accentColor} opacity="0.6" />
            </svg>

            <div style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.97) 0%, rgba(15,5,10,0.98) 100%)',
                border: `1px solid ${accentColor}35`,
                boxShadow: `0 0 30px ${accentColor}15, 0 0 60px rgba(0,0,0,0.6)`,
                clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
            }}>
                {/* Top accent line */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}40, transparent)` }} />

                {/* Header */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Crosshair size={10} style={{ color: accentColor }} />
                        <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: accentColor }}>
                            Quickhack
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-400">
                            #{cb?.display_id}
                        </span>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X size={10} />
                        </button>
                    </div>
                </div>

                {/* Target info strip */}
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-white/5 bg-white/[0.02]">
                    <Monitor size={9} className="text-gray-400" />
                    <span className="text-[9px] text-gray-300 truncate">{cb?.host || node.label}</span>
                    {cb?.ip && <span className="text-[8px] text-gray-400 ml-auto">{extractPrimaryIP(cb.ip)}</span>}
                </div>

                {/* QuickHack list */}
                <div className="py-1">
                    {hacks.map(hack => (
                        <button
                            key={hack.id}
                            onClick={() => onSelectHack(hack)}
                            onMouseEnter={() => setHoveredId(hack.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            className="w-full px-3 py-2 text-left transition-all duration-150 relative"
                            style={{
                                background: hoveredId === hack.id ? `${hack.color}0d` : 'transparent',
                            }}
                        >
                            {/* Hover left accent */}
                            {hoveredId === hack.id && (
                                <motion.div
                                    layoutId="qh-accent"
                                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                                    style={{ background: hack.color }}
                                />
                            )}

                            <div className="flex items-center gap-2">
                                <span className="text-xs">{hack.icon}</span>
                                <span className="text-[11px] font-bold tracking-wider" style={{ color: hoveredId === hack.id ? hack.color : `${hack.color}dd` }}>
                                    {hack.name}
                                </span>
                                {hack.variables && hack.variables.length > 0 && (
                                    <span className="ml-auto text-[8px] px-1 py-px border opacity-60"
                                        style={{ borderColor: `${hack.color}40`, color: `${hack.color}aa` }}>
                                        {hack.variables.length} VAR{hack.variables.length !== 1 ? 'S' : ''}
                                    </span>
                                )}
                            </div>
                            <div className="text-[8px] text-gray-400 mt-0.5 pl-[22px] leading-relaxed">
                                {hack.description}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Bottom accent */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}15, transparent)` }} />
            </div>
        </motion.div>,
        document.body
    );
};

/** QuickHack variable picker — small box next to the progress icon for IP or Port input */
const QuickHackVarPicker = ({
    variable,
    value,
    onSetValue,
    accentColor,
    onRequestNodePick,
    isPickingNode,
    portInputOpen,
    onTogglePortInput,
}: {
    variable: QuickHackVariable;
    value: string;
    onSetValue: (val: string) => void;
    accentColor: string;
    onRequestNodePick: () => void;
    isPickingNode: boolean;
    portInputOpen: boolean;
    onTogglePortInput: () => void;
}) => {
    const isFilled = value.length > 0;

    if (variable.type === 'ip') {
        return (
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-1"
            >
                <button
                    onClick={onRequestNodePick}
                    className="flex items-center gap-1 px-1.5 py-1 border text-[8px] font-mono tracking-wider transition-all cursor-pointer"
                    style={{
                        borderColor: isPickingNode ? `${accentColor}80` : isFilled ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.15)',
                        background: isPickingNode ? `${accentColor}15` : isFilled ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.7)',
                        color: isFilled ? '#22d3ee' : isPickingNode ? accentColor : '#666',
                        boxShadow: isPickingNode ? `0 0 8px ${accentColor}30` : 'none',
                        animation: isPickingNode ? 'qh-flicker 1.5s ease-in-out infinite' : undefined,
                    }}
                    title={isPickingNode ? 'Click a node to select IP' : isFilled ? value : 'Click to pick target IP'}
                >
                    <Globe size={8} />
                    {isFilled
                        ? <span className="max-w-[80px] truncate">{value}</span>
                        : <span>{isPickingNode ? 'PICK NODE' : 'IP'}</span>
                    }
                </button>
            </motion.div>
        );
    }

    // Port type
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-1"
        >
            <button
                onClick={onTogglePortInput}
                className="flex items-center gap-1 px-1.5 py-1 border text-[8px] font-mono tracking-wider transition-all cursor-pointer"
                style={{
                    borderColor: portInputOpen ? `${accentColor}80` : isFilled ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.15)',
                    background: portInputOpen ? `${accentColor}15` : isFilled ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.7)',
                    color: isFilled ? '#f59e0b' : portInputOpen ? accentColor : '#666',
                }}
                title={isFilled ? `Port: ${value}` : 'Click to enter port'}
            >
                <Hash size={8} />
                {isFilled ? <span>{value}</span> : <span>PORT</span>}
            </button>
            <AnimatePresence>
                {portInputOpen && (
                    <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <input
                            autoFocus
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={value}
                            onChange={e => {
                                const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                                onSetValue(v);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') onTogglePortInput(); }}
                            placeholder="PORT"
                            className="w-[52px] bg-black/80 border border-amber-500/30 px-1.5 py-1 text-[9px] font-mono text-amber-400 placeholder-gray-700 focus:border-amber-400/60 focus:outline-none transition-colors text-center"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/** IP address selection submenu — shown when a node has multiple IPs */
const IPSelectionMenu = ({
    ips,
    onSelect,
    screenPos,
}: {
    ips: string[];
    onSelect: (ip: string) => void;
    screenPos: { x: number; y: number };
}) => {
    return createPortal(
        <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[10002] font-mono"
            style={{ left: screenPos.x + 30, top: screenPos.y - 10 }}
        >
            <div style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.94) 0%, rgba(5,15,20,0.96) 100%)',
                border: '1px solid rgba(34,211,238,0.25)',
                boxShadow: '0 0 20px rgba(34,211,238,0.08), 0 0 40px rgba(0,0,0,0.5)',
            }}>
                <div className="h-[1px]" style={{ background: 'linear-gradient(90deg, #22d3ee, rgba(34,211,238,0.2), transparent)' }} />
                <div className="px-2 py-1.5 text-[8px] text-gray-600 uppercase tracking-[0.2em] border-b border-white/5">
                    SELECT IP
                </div>
                <div className="py-0.5">
                    {ips.map(ip => (
                        <button
                            key={ip}
                            onClick={() => onSelect(ip)}
                            className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-cyan-300/80 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors flex items-center gap-2"
                        >
                            <Globe size={8} className="text-cyan-500/50 shrink-0" />
                            {ip}
                        </button>
                    ))}
                </div>
            </div>
        </motion.div>,
        document.body
    );
};

/** QuickHack floating icon — Cyberpunk 2077-style indicator above target node */
const QuickHackOverlay = ({
    execution,
    onClose,
    onResume,
    onUpdateVarValue,
    onRequestNodePick,
    nodePickingVarKey,
    nodes,
}: {
    execution: QuickHackExecution;
    onClose: () => void;
    onResume: (execId: string) => void;
    onUpdateVarValue: (execId: string, key: string, value: string) => void;
    onRequestNodePick: (execId: string, varKey: string) => void;
    nodePickingVarKey: string | null;
    nodes: TopoNode[];
}) => {
    const { hack, phase, progress, variableValues, execId } = execution;
    const isTimeout = phase === 'timeout';
    const isAwaiting = phase === 'awaiting_input';
    const accentColor = phase === 'error' ? '#ff003c' : isTimeout ? '#ff6600' : isAwaiting ? '#f59e0b' : hack.color;
    const isActive = phase === 'uploading' || phase === 'processing';
    const [isExiting, setIsExiting] = useState(false);
    const [openPortKey, setOpenPortKey] = useState<string | null>(null);

    const variables = hack.variables ?? [];
    const allFilled = variables.every(v => (variableValues[v.key] ?? '').length > 0);

    // Auto-close after completion/error/timeout — trigger exit animation first
    useEffect(() => {
        if (phase === 'completed' || phase === 'error') {
            const exitTimer = setTimeout(() => setIsExiting(true), 2200);
            const removeTimer = setTimeout(onClose, 2700);
            return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
        }
        if (phase === 'timeout') {
            const exitTimer = setTimeout(() => setIsExiting(true), 1700);
            const removeTimer = setTimeout(onClose, 2200);
            return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
        }
    }, [phase, onClose]);

    const handleIconClick = useCallback(() => {
        if (!isAwaiting) return;
        if (allFilled) {
            onResume(execId);
        }
    }, [isAwaiting, allFilled, onResume, execId]);

    const size = 44;

    return (
        <div
            className={cn("font-mono transition-opacity duration-300", isAwaiting ? 'pointer-events-auto' : 'pointer-events-none', isExiting ? 'opacity-0' : 'opacity-100')}
        >
            <div className="flex items-start gap-2">
                {/* Icon container with vertical progress fill */}
                <div
                    className={cn("relative shrink-0", isAwaiting && "cursor-pointer")}
                    style={{ width: size, height: size }}
                    onClick={handleIconClick}
                    title={isAwaiting ? (allFilled ? 'Click to execute' : 'Fill all variables first') : undefined}
                >
                    {/* Background fill — rises from bottom as progress increases */}
                    <div className="absolute inset-0 overflow-hidden" style={{
                        clipPath: 'polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)',
                    }}>
                        {/* Dark base */}
                        <div className="absolute inset-0" style={{
                            background: `rgba(0,0,0,0.85)`,
                        }} />
                        {/* Rising fill */}
                        <motion.div
                            className="absolute inset-x-0 bottom-0"
                            initial={{ height: '0%' }}
                            animate={{ height: `${progress}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            style={{
                                background: `linear-gradient(0deg, ${accentColor}cc, ${accentColor}40)`,
                            }}
                        />
                        {/* Shimmer on active */}
                        {isActive && (
                            <motion.div
                                className="absolute inset-x-0 bottom-0"
                                initial={{ height: '0%' }}
                                animate={{ height: `${progress}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                style={{
                                    background: `linear-gradient(0deg, transparent 0%, ${accentColor}50 80%, ${accentColor}90 100%)`,
                                    animation: 'qh-flicker 1.5s ease-in-out infinite',
                                }}
                            />
                        )}
                        {/* Pulsing fill for awaiting input */}
                        {isAwaiting && (
                            <motion.div
                                className="absolute inset-0"
                                animate={{ opacity: [0.1, 0.25, 0.1] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                style={{ background: `${accentColor}40` }}
                            />
                        )}
                    </div>

                    {/* Border outline — octagon shape */}
                    <svg className="absolute inset-0" width={size} height={size} viewBox="0 0 44 44">
                        <polygon
                            points="6.6,0 37.4,0 44,6.6 44,37.4 37.4,44 6.6,44 0,37.4 0,6.6"
                            fill="none"
                            stroke={accentColor}
                            strokeWidth="1.5"
                            opacity={isActive ? 0.8 : isAwaiting ? 0.7 : (phase === 'completed' ? 0.5 : 0.6)}
                        >
                            {(isActive || isAwaiting) && (
                                <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2s" repeatCount="indefinite" />
                            )}
                        </polygon>
                    </svg>

                    {/* Center icon */}
                    <div className="absolute inset-0 flex items-center justify-center text-lg select-none"
                        style={{ filter: (isActive || isAwaiting) ? `drop-shadow(0 0 4px ${accentColor})` : undefined }}>
                        {hack.icon}
                    </div>

                    {/* Awaiting input: show play icon overlay when all filled */}
                    {isAwaiting && allFilled && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div className="w-5 h-5 flex items-center justify-center rounded-full"
                                style={{ background: `${accentColor}40` }}>
                                <ChevronRight size={12} style={{ color: accentColor }} strokeWidth={3} />
                            </div>
                        </motion.div>
                    )}

                    {/* Completion checkmark overlay */}
                    {phase === 'completed' && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div className="absolute inset-0" style={{
                                clipPath: 'polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)',
                                background: `${accentColor}30`,
                            }} />
                        </motion.div>
                    )}

                    {/* Error X overlay */}
                    {phase === 'error' && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <X size={20} style={{ color: '#ff003c' }} strokeWidth={3} />
                        </motion.div>
                    )}

                    {/* Timeout flash overlay */}
                    {isTimeout && (
                        <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: [1, 0, 1, 0, 1] }}
                            transition={{ duration: 1.2, ease: 'easeInOut' }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <X size={20} style={{ color: '#ff6600' }} strokeWidth={3} />
                        </motion.div>
                    )}
                </div>

                {/* Variable pickers — shown to the right of the icon during awaiting_input */}
                <AnimatePresence>
                    {isAwaiting && variables.length > 0 && (
                        <motion.div
                            key="var-pickers"
                            initial={{ opacity: 0, x: -6, width: 0 }}
                            animate={{ opacity: 1, x: 0, width: 'auto' }}
                            exit={{ opacity: 0, x: -6, width: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col gap-1 pt-1 pointer-events-auto overflow-hidden"
                        >
                            {variables.map(v => (
                                <QuickHackVarPicker
                                    key={v.key}
                                    variable={v}
                                    value={variableValues[v.key] ?? ''}
                                    onSetValue={val => onUpdateVarValue(execId, v.key, val)}
                                    accentColor={accentColor}
                                    onRequestNodePick={() => onRequestNodePick(execId, v.key)}
                                    isPickingNode={v.type === 'ip' && nodePickingVarKey === v.key}
                                    portInputOpen={openPortKey === v.key}
                                    onTogglePortInput={() => setOpenPortKey(openPortKey === v.key ? null : v.key)}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Label below icon */}
            <div className="text-center mt-1" style={{ width: size }}>
                <div className="text-[8px] tracking-[0.15em] uppercase font-bold"
                    style={{
                        color: accentColor,
                        textShadow: `0 0 6px ${accentColor}60`,
                        animation: isActive ? 'qh-flicker 2s ease-in-out infinite'
                            : isTimeout ? 'qh-flicker 0.3s ease-in-out 2'
                            : isAwaiting ? 'qh-flicker 3s ease-in-out infinite' : undefined,
                    }}>
                    {phase === 'completed' ? 'DONE'
                        : phase === 'error' ? 'FAILED'
                        : isTimeout ? 'TIMED OUT'
                        : isAwaiting ? (allFilled ? 'READY' : 'CONFIGURE')
                        : hack.name}
                </div>
            </div>
        </div>
    );
};

/** Wrapper that monitors task subscription and drives completion + timeout */
/** Headless component that monitors task subscription + timeout for a QuickHack execution.
 *  Must be rendered OUTSIDE Canvas (in ApolloProvider tree). */
const QuickHackSubscriptionMonitor = ({
    execution,
    onUpdate,
    onRemove,
    intervalRef,
}: {
    execution: QuickHackExecution;
    onUpdate: (execId: string, updater: (prev: QuickHackExecution) => QuickHackExecution) => void;
    onRemove: (execId: string) => void;
    intervalRef: React.MutableRefObject<Map<string, ReturnType<typeof setInterval>>>;
}) => {
    const { data: taskData } = useSubscription(SUBSCRIBE_TASK_STATUS_BY_ID, {
        variables: { task_id: execution.taskId },
        skip: !execution.taskId,
    });

    // Detect completion from subscription
    useEffect(() => {
        if (!taskData?.task_by_pk) return;
        const task = taskData.task_by_pk;
        if (task.completed && execution.phase === 'processing') {
            const iv = intervalRef.current.get(execution.execId);
            if (iv) { clearInterval(iv); intervalRef.current.delete(execution.execId); }
            const isError = task.status === 'error';
            playDoneQH();
            onUpdate(execution.execId, prev => ({
                ...prev,
                phase: isError ? 'error' : 'completed',
                progress: 100,
                errorMsg: isError ? 'Task completed with errors' : undefined,
            }));
        }
    }, [taskData, execution.phase, execution.execId, intervalRef, onUpdate]);

    // Timeout: if no completion after 60 seconds, mark as timed out
    useEffect(() => {
        if (execution.phase !== 'uploading' && execution.phase !== 'processing') return;
        const elapsed = Date.now() - execution.startTime;
        const remaining = Math.max(0, 60000 - elapsed);
        const timer = setTimeout(() => {
            const iv = intervalRef.current.get(execution.execId);
            if (iv) { clearInterval(iv); intervalRef.current.delete(execution.execId); }
            onUpdate(execution.execId, prev => {
                if (prev.phase === 'uploading' || prev.phase === 'processing') {
                    playDoneQH();
                    return { ...prev, phase: 'timeout', errorMsg: 'Connection timed out — target not responding' };
                }
                return prev;
            });
        }, remaining);
        return () => clearTimeout(timer);
    }, [execution.phase, execution.startTime, execution.execId, intervalRef, onUpdate]);

    return null;
};

/** Group that follows a node's live position each frame (for drag tracking). */
const NodeFollower = ({ nodeRef, fallback, yOffset, children }: {
    nodeRef: { current: TopoNode | null };
    fallback: THREE.Vector3;
    yOffset: number;
    children: React.ReactNode;
}) => {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame(() => {
        const pos = nodeRef.current?.position ?? fallback;
        groupRef.current.position.set(pos.x, pos.y + yOffset, pos.z);
    });
    return <group ref={groupRef}>{children}</group>;
};

/** Visual wrapper for QuickHackOverlay — rendered inside Canvas <Html>.
 *  No Apollo hooks here (Canvas portal has no ApolloProvider). */
const QuickHackOverlayWrapper = ({
    execution,
    onRemove,
    onResume,
    onUpdateVarValue,
    onRequestNodePick,
    nodePickingVarKey,
    intervalRef,
    nodes,
}: {
    execution: QuickHackExecution;
    onRemove: (execId: string) => void;
    onResume: (execId: string) => void;
    onUpdateVarValue: (execId: string, key: string, value: string) => void;
    onRequestNodePick: (execId: string, varKey: string) => void;
    nodePickingVarKey: string | null;
    intervalRef: React.MutableRefObject<Map<string, ReturnType<typeof setInterval>>>;
    nodes: TopoNode[];
}) => {
    const handleClose = useCallback(() => {
        const iv = intervalRef.current.get(execution.execId);
        if (iv) { clearInterval(iv); intervalRef.current.delete(execution.execId); }
        onRemove(execution.execId);
    }, [intervalRef, execution.execId, onRemove]);

    return (
        <QuickHackOverlay
            execution={execution}
            onClose={handleClose}
            onResume={onResume}
            onUpdateVarValue={onUpdateVarValue}
            onRequestNodePick={onRequestNodePick}
            nodePickingVarKey={nodePickingVarKey}
            nodes={nodes}
        />
    );
};

/** Context menu portal positioned at screen coords — full-featured matching CallbackGraph */
const ContextMenu3D = ({
    x, y, node, onClose,
    onNavigateConsole, onLock, onHide,
    onViewDetails, onEditDescription, onEditCustomNode, onDeleteCustomNode,
    onSetLinkFocus, onClearLinkFocus, linkFocusNodeId,
    onSetParent, onDisconnectParent, getParentEdge,
    onTaskForEdge, onRemoveEdge, onAddP2PEdge, onEventing,
    onQuickHack,
}: {
    x: number; y: number; node: TopoNode;
    onClose: () => void;
    onNavigateConsole: (displayId: number) => void;
    onLock: (displayId: number, locked: boolean) => void;
    onHide: (displayId: number) => void;
    onViewDetails: (node: TopoNode) => void;
    onEditDescription: (node: TopoNode) => void;
    onEditCustomNode: (node: TopoNode) => void;
    onDeleteCustomNode: (node: TopoNode) => void;
    onSetLinkFocus: (nodeId: string, label: string) => void;
    onClearLinkFocus: () => void;
    linkFocusNodeId: string | null;
    onSetParent: (node: TopoNode) => void;
    onDisconnectParent: (node: TopoNode) => void;
    getParentEdge: (callbackId: number | string) => any;
    onTaskForEdge: (node: TopoNode) => void;
    onRemoveEdge: (node: TopoNode) => void;
    onAddP2PEdge: (node: TopoNode) => void;
    onEventing: (node: TopoNode) => void;
    onQuickHack: (node: TopoNode) => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [adjustedPos, setAdjustedPos] = useState<{ top: number; left: number }>({ top: y, left: x });

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    useEffect(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 8;
        let newTop = y;
        let newLeft = x;
        if (y + rect.height > vh - pad) {
            newTop = Math.max(pad, vh - rect.height - pad);
        }
        if (x + rect.width > vw - pad) {
            newLeft = Math.max(pad, vw - rect.width - pad);
        }
        if (newTop !== adjustedPos.top || newLeft !== adjustedPos.left) {
            setAdjustedPos({ top: newTop, left: newLeft });
        }
    }, [x, y]);

    const isCallback = node.type === 'callback';
    const isCustom = node.type === 'custom';
    const cb = node.data;
    const nodeIdForFocus = String(cb?.id ?? node.id);
    const isFocused = linkFocusNodeId === nodeIdForFocus;
    const hasParent = cb?.id != null && getParentEdge(cb.id);

    const menuStyle: React.CSSProperties = {
        top: adjustedPos.top,
        left: adjustedPos.left,
    };

    const btnClass = "w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors";
    const sepClass = "border-t border-white/10 my-1";

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] w-56 bg-[#0a0a0a]/95 backdrop-blur-md border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] py-1 font-mono text-xs overflow-visible pointer-events-auto"
            style={menuStyle}
            onMouseDown={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1 flex items-center justify-between">
                <span>{node.label} — {node.type.toUpperCase()}</span>
                {isCallback && cb?.locked && <Lock size={10} className="text-red-500" />}
            </div>

            {isCallback && (
                <>
                    {/* Interact (Console) */}
                    <button className={`${btnClass} text-cyan-400 font-semibold`}
                        onClick={() => { onNavigateConsole(cb.display_id); onClose(); }}>
                        <Terminal size={12} className="text-cyan-400" /> Interact (Console)
                    </button>
                    <div className={sepClass} />

                    {/* View Details */}
                    <button className={btnClass} onClick={() => onViewDetails(node)}>
                        <Info size={12} className="text-gray-500" /> View Details
                    </button>

                    {/* Edit Description */}
                    <button className={btnClass} onClick={() => onEditDescription(node)}>
                        <Edit size={12} className="text-gray-500" /> Edit Description
                    </button>

                    {/* Lock/Unlock */}
                    <button className={btnClass}
                        onClick={() => { onLock(cb.display_id, !cb.locked); onClose(); }}>
                        {cb.locked
                            ? <><Unlock size={12} className="text-yellow-400" /> Unlock Callback</>
                            : <><Lock size={12} className="text-red-400" /> Lock Callback</>}
                    </button>
                    <div className={sepClass} />

                    {/* Link Focus */}
                    {isFocused ? (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-400 hover:bg-amber-900/30 hover:text-amber-300 transition-colors"
                            onClick={() => { onClearLinkFocus(); onClose(); }}>
                            <Crosshair size={12} className="text-amber-400" /> Clear Link Focus
                        </button>
                    ) : (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-500/80 hover:bg-amber-900/20 hover:text-amber-400 transition-colors"
                            onClick={() => { onSetLinkFocus(nodeIdForFocus, cb.host || `#${cb.display_id}`); onClose(); }}>
                            <Crosshair size={12} className="text-amber-500/80" /> Set as Link Focus
                        </button>
                    )}

                    {/* Link to Parent */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                        onClick={() => onSetParent(node)}>
                        <GitBranch size={12} className="text-blue-500" /> Link to Parent
                    </button>

                    {/* Disconnect from Parent */}
                    {hasParent && (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors"
                            onClick={() => onDisconnectParent(node)}>
                            <X size={12} className="text-orange-500" /> Disconnect from Parent
                        </button>
                    )}
                    <div className={sepClass} />

                    {/* Hide Callback */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                        onClick={() => { onHide(cb.display_id); onClose(); }}>
                        <EyeOff size={12} className="text-red-500" /> Hide Callback
                    </button>
                    <div className={sepClass} />

                    {/* Task for Edge */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                        onClick={() => onTaskForEdge(node)}>
                        <Link2 size={12} className="text-blue-400" /> Task for Edge
                    </button>

                    {/* Remove Edge */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors"
                        onClick={() => onRemoveEdge(node)}>
                        <Trash2 size={12} className="text-orange-500" /> Remove Edge
                    </button>

                    {/* Add P2P Edge */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-cyan-400 hover:bg-cyan-900/30 hover:text-cyan-300 transition-colors"
                        onClick={() => onAddP2PEdge(node)}>
                        <Plus size={12} className="text-cyan-500" /> Add P2P Edge
                    </button>
                    <div className={sepClass} />

                    {/* Trigger Eventing */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-purple-400 hover:bg-purple-900/30 hover:text-purple-300 transition-colors"
                        onClick={() => onEventing(node)}>
                        <Zap size={12} className="text-purple-400" /> Trigger Eventing
                    </button>
                    <div className={sepClass} />

                    {/* ── QUICKHACK — opens floating panel near node ── */}
                    {node.alive ? (
                        <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#ff003c]/10"
                            style={{ color: '#ff003c' }}
                            onClick={() => { onQuickHack(node); onClose(); }}
                        >
                            <Shield size={12} style={{ color: '#ff003c' }} />
                            <span className="font-bold tracking-wider text-[11px]">QUICKHACK</span>
                        </button>
                    ) : (
                        <div
                            className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-not-allowed opacity-40"
                            style={{ color: '#666' }}
                            title="Target offline — quickhack unavailable"
                        >
                            <Shield size={12} style={{ color: '#666' }} />
                            <span className="font-bold tracking-wider text-[11px]">QUICKHACK</span>
                            <span className="ml-auto text-[9px] text-red-500/60">OFFLINE</span>
                        </div>
                    )}
                </>
            )}

            {isCustom && (
                <>
                    {/* Edit Custom Node */}
                    <button className={btnClass} onClick={() => onEditCustomNode(node)}>
                        <Edit size={12} className="text-gray-500" /> Edit Node
                    </button>
                    <div className={sepClass} />

                    {/* Link Focus */}
                    {isFocused ? (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-400 hover:bg-amber-900/30 hover:text-amber-300 transition-colors"
                            onClick={() => { onClearLinkFocus(); onClose(); }}>
                            <Crosshair size={12} className="text-amber-400" /> Clear Link Focus
                        </button>
                    ) : (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-500/80 hover:bg-amber-900/20 hover:text-amber-400 transition-colors"
                            onClick={() => { onSetLinkFocus(nodeIdForFocus, cb?.host || cb?.description || `Node ${cb?.display_id}`); onClose(); }}>
                            <Crosshair size={12} className="text-amber-500/80" /> Set as Link Focus
                        </button>
                    )}

                    {/* Link to Parent */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                        onClick={() => onSetParent(node)}>
                        <GitBranch size={12} className="text-blue-500" /> Link to Parent
                    </button>

                    {/* Disconnect from Parent */}
                    {hasParent && (
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors"
                            onClick={() => onDisconnectParent(node)}>
                            <X size={12} className="text-orange-500" /> Disconnect from Parent
                        </button>
                    )}
                    <div className={sepClass} />

                    {/* Delete Custom Node */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                        onClick={() => onDeleteCustomNode(node)}>
                        <X size={12} className="text-red-500" /> Delete Node
                    </button>
                </>
            )}

            {node.type === 'core' && (
                <div className="px-3 py-2 text-gray-500 italic text-[10px]">Central Minerva hub</div>
            )}
        </div>,
        document.body
    );
};

/** Detail HUD panel for selected node — futuristic minimalist, with inline editing */
const DetailPanel = ({ node, onClose }: { node: TopoNode | null; onClose: () => void }) => {
    if (!node) return null;
    const isCallback = node.type === 'callback';
    const accentColor = `#${node.color.getHexString()}`;

    // Session selector — allow switching between callbacks on the same machine
    const [selectedSessionIdx, setSelectedSessionIdx] = useState(0);
    const [showSessionPicker, setShowSessionPicker] = useState(false);
    const sessions = node.allCallbacks ?? (node.data ? [node.data] : []);
    const cb = sessions[selectedSessionIdx] ?? node.data;

    // Reset session index when node changes
    useEffect(() => { setSelectedSessionIdx(0); setShowSessionPicker(false); }, [node.id]);

    // All IPs parsed from the callback
    const allIPs = useMemo(() => {
        if (!cb?.ip) return [];
        return extractAllIPs(cb.ip);
    }, [cb?.ip]);

    // Editable state
    const [editingDesc, setEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState('');
    const [showIPPicker, setShowIPPicker] = useState(false);

    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [updateIPs] = useMutation(UPDATE_IPS_MUTATION);

    const handleSaveDesc = useCallback(async () => {
        if (!cb?.display_id) return;
        try {
            await updateDescription({ variables: { callback_display_id: cb.display_id, description: descDraft } });
            snackActions.success('Description updated');
        } catch { snackActions.error('Failed to update description'); }
        setEditingDesc(false);
    }, [cb?.display_id, descDraft, updateDescription]);

    const handleSetPrimaryIP = useCallback(async (ip: string) => {
        if (!cb?.display_id) return;
        const reordered = [ip, ...allIPs.filter(i => i !== ip)];
        try {
            await updateIPs({ variables: { callback_display_id: cb.display_id, ip: reordered } });
            snackActions.success(`Primary IP set to ${ip}`);
        } catch { snackActions.error('Failed to update IP'); }
        setShowIPPicker(false);
    }, [cb?.display_id, allIPs, updateIPs]);

    return (
        <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-4 top-20 w-80 z-50"
            style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.88) 0%, rgba(10,10,20,0.92) 100%)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: `0 0 1px ${accentColor}40, 0 0 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`,
                clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
            }}
        >
            {/* Top accent line */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }} />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}, 0 0 2px ${accentColor}` }}
                    />
                    <span className="font-mono text-sm font-semibold text-white/90 tracking-wide">{node.label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 tracking-[0.15em] uppercase"
                        style={{ color: `${accentColor}cc`, border: `1px solid ${accentColor}30` }}
                    >
                        {node.type}
                    </span>
                </div>
                <button onClick={onClose} className="text-gray-600 hover:text-white/60 transition-colors">
                    <XCircle size={14} />
                </button>
            </div>

            {/* Separator */}
            <div className="mx-4 h-px" style={{ background: `linear-gradient(90deg, ${accentColor}20, transparent)` }} />

            {/* Body */}
            <div className="p-4 space-y-2 text-xs font-mono">
                {isCallback && cb && (
                    <>
                        {/* Session selector — when multiple callbacks on same machine */}
                        {sessions.length > 1 && (
                            <div className="mb-2">
                                <button
                                    onClick={() => setShowSessionPicker(!showSessionPicker)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors rounded-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        <Terminal size={10} className="text-cyan-400 shrink-0" />
                                        <span className="text-[10px] text-white/90 font-mono">
                                            C-{cb.display_id}
                                        </span>
                                        <span className={cn(
                                            "text-[8px] px-1 py-px rounded font-mono",
                                            cb.active !== false && isCallbackAlive(cb) ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                        )}>
                                            {cb.active !== false && isCallbackAlive(cb) ? 'ALIVE' : 'DEAD'}
                                        </span>
                                        <span className={cn(
                                            "text-[8px] px-1 py-px rounded font-mono",
                                            getPrivilegeLabel(cb) === 'SYSTEM' || getPrivilegeLabel(cb) === 'root' ? "bg-red-500/15 text-red-400" :
                                            getPrivilegeLabel(cb) === 'Admin' ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-gray-500"
                                        )}>
                                            {getPrivilegeLabel(cb) || cb.user || '?'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-gray-500 font-mono">{selectedSessionIdx + 1}/{sessions.length}</span>
                                        <ChevronDown size={10} className={cn("text-gray-500 transition-transform", showSessionPicker && "rotate-180")} />
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {showSessionPicker && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="border border-white/10 border-t-0 bg-black/60 max-h-40 overflow-y-auto cyber-scrollbar">
                                                {sessions.map((s: any, i: number) => {
                                                    const sAlive = s.active !== false && isCallbackAlive(s);
                                                    const sPriv = getPrivilegeLabel(s);
                                                    return (
                                                        <button
                                                            key={s.display_id}
                                                            onClick={() => { setSelectedSessionIdx(i); setShowSessionPicker(false); setEditingDesc(false); setShowIPPicker(false); }}
                                                            className={cn(
                                                                "w-full px-2 py-1.5 text-left hover:bg-cyan-500/10 transition-colors flex items-center gap-2",
                                                                i === selectedSessionIdx ? "bg-cyan-500/10" : ""
                                                            )}
                                                        >
                                                            {i === selectedSessionIdx && <div className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />}
                                                            <span className="text-[10px] text-white/80 font-mono w-10 shrink-0">C-{s.display_id}</span>
                                                            <span className={cn(
                                                                "text-[8px] px-1 py-px rounded shrink-0",
                                                                sAlive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/15 text-red-400/60"
                                                            )}>
                                                                {sAlive ? 'ALIVE' : 'DEAD'}
                                                            </span>
                                                            <span className={cn(
                                                                "text-[8px] px-1 py-px rounded shrink-0",
                                                                sPriv === 'SYSTEM' || sPriv === 'root' ? "text-red-400" :
                                                                sPriv === 'Admin' ? "text-amber-400" : "text-gray-500"
                                                            )}>
                                                                {sPriv || '?'}
                                                            </span>
                                                            <span className="text-[9px] text-gray-600 font-mono truncate">{s.user || '?'}</span>
                                                            <span className="text-[9px] text-gray-700 font-mono ml-auto shrink-0">{s.payload?.payloadtype?.name || '?'}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        <InfoRow label="HOST" value={cb.host || '—'} accent={accentColor} />
                        <InfoRow label="USER" value={cb.user || '—'} accent={accentColor} />

                        {/* IP — clickable to show picker when multiple IPs */}
                        <div className="flex justify-between items-start gap-3 py-0.5 group">
                            <span className="text-[10px] tracking-[0.12em] text-gray-600 shrink-0 pt-px">IP</span>
                            <div className="text-right">
                                <button
                                    onClick={() => allIPs.length > 1 && setShowIPPicker(!showIPPicker)}
                                    className={cn(
                                        "text-[11px] text-right break-all text-white/90",
                                        allIPs.length > 1 && "hover:text-cyan-300 cursor-pointer"
                                    )}
                                    style={{ textShadow: `0 0 8px ${accentColor}40` }}
                                    title={allIPs.length > 1 ? 'Click to change primary IP' : undefined}
                                >
                                    {extractPrimaryIP(cb.ip) || '—'}
                                    {allIPs.length > 1 && (
                                        <ChevronDown size={10} className="inline ml-1 text-gray-500" />
                                    )}
                                </button>
                                <AnimatePresence>
                                    {showIPPicker && allIPs.length > 1 && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden mt-1"
                                        >
                                            <div className="border border-white/10 bg-black/60 py-0.5">
                                                {allIPs.map(ip => (
                                                    <button
                                                        key={ip}
                                                        onClick={() => handleSetPrimaryIP(ip)}
                                                        className={cn(
                                                            "w-full px-2 py-1 text-[10px] text-left hover:bg-cyan-500/10 transition-colors flex items-center gap-1.5",
                                                            ip === extractPrimaryIP(cb.ip) ? "text-cyan-400" : "text-gray-400"
                                                        )}
                                                    >
                                                        {ip === extractPrimaryIP(cb.ip) && <div className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />}
                                                        {ip}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <InfoRow label="OS" value={getOSFullLabel(cb) || '—'} accent={accentColor} />
                        <InfoRow label="ARCH" value={cb.architecture || '—'} accent={accentColor} />
                        <InfoRow label="AGENT" value={cb.payload?.payloadtype?.name || '—'} accent={accentColor} />
                        <InfoRow label="PRIV" value={getPrivilegeLabel(cb) || '—'} accent={accentColor} valueClass={
                            getPrivilegeLabel(cb) === 'SYSTEM' || getPrivilegeLabel(cb) === 'root' ? 'text-red-400' :
                            getPrivilegeLabel(cb) === 'Admin' ? 'text-amber-400' : undefined
                        } />
                        <InfoRow label="PID" value={String(cb.pid ?? '—')} accent={accentColor} />
                        <InfoRow label="PROC" value={cb.process_name || '—'} accent={accentColor} />
                        <div className="pt-1">
                            <InfoRow label="STATUS"
                                value={cb.active !== false && isCallbackAlive(cb) ? 'ALIVE' : 'DEAD'}
                                accent={accentColor}
                                valueClass={cb.active !== false && isCallbackAlive(cb) ? 'text-emerald-400' : 'text-red-400'}
                            />
                        </div>

                        {/* DESC — inline editable */}
                        <div className="flex justify-between items-start gap-3 py-0.5 group">
                            <span className="text-[10px] tracking-[0.12em] text-gray-600 shrink-0 pt-px">DESC</span>
                            <div className="flex-1 min-w-0 text-right">
                                {editingDesc ? (
                                    <div className="flex flex-col items-end gap-1">
                                        <textarea
                                            autoFocus
                                            value={descDraft}
                                            onChange={e => setDescDraft(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveDesc(); } if (e.key === 'Escape') setEditingDesc(false); }}
                                            rows={2}
                                            className="w-full bg-black/60 border border-cyan-500/30 px-2 py-1 text-[10px] text-white font-mono resize-none focus:outline-none focus:border-cyan-500/60"
                                        />
                                        <div className="flex gap-1">
                                            <button onClick={() => setEditingDesc(false)} className="text-[8px] px-1.5 py-0.5 text-gray-500 hover:text-white border border-white/10 hover:border-white/30 transition-colors">ESC</button>
                                            <button onClick={handleSaveDesc} className="text-[8px] px-1.5 py-0.5 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors">SAVE</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setDescDraft(cb.description || ''); setEditingDesc(true); }}
                                        className="text-[11px] text-gray-400 text-right break-all hover:text-cyan-300 cursor-pointer transition-colors"
                                        title="Click to edit description"
                                    >
                                        {cb.description || <span className="text-gray-600 italic">click to add</span>}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
                {node.type === 'custom' && (
                    <>
                        <InfoRow label="HOST" value={cb?.hostname || node.label} accent={accentColor} />
                        <InfoRow label="IP" value={cb?.ip_address || '—'} accent={accentColor} highlight />
                        <InfoRow label="OS" value={cb?.operating_system || '—'} accent={accentColor} />
                        <InfoRow label="C2" value={cb?.c2profile || '—'} accent={accentColor} />
                    </>
                )}
                {node.type === 'core' && (
                    <div className="text-gray-600 text-center py-4 tracking-widest text-[10px]">
                        <Globe size={20} className="mx-auto mb-2 text-cyan-500/60" />
                        MINERVA CORE
                    </div>
                )}
                {node.subnet && (
                    <InfoRow label="SUBNET" value={node.subnet} accent={accentColor} valueClass="text-green-400/80" />
                )}
            </div>

            {/* Bottom accent line */}
            <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)` }} />
        </motion.div>
    );
};

const InfoRow = ({ label, value, accent, valueClass, highlight }: {
    label: string; value: string; accent?: string; valueClass?: string; highlight?: boolean;
}) => (
    <div className="flex justify-between items-start gap-3 py-0.5 group">
        <span className="text-[10px] tracking-[0.12em] text-gray-600 shrink-0 pt-px">{label}</span>
        <span className={cn(
            "text-right break-all text-[11px]",
            valueClass || (highlight ? 'text-white/90' : 'text-gray-400'),
        )}
        style={highlight ? { textShadow: `0 0 8px ${accent || '#fff'}40` } : undefined}
        >{value}</span>
    </div>
);

/** Stats HUD bar — bottom left, futuristic minimal */
const StatsHUD = ({ nodes, edges, subnets }: { nodes: TopoNode[]; edges: TopoEdge[]; subnets: SubnetZone[] }) => {
    const machines = nodes.filter(n => n.type === 'callback');
    const totalCbs = machines.reduce((s, n) => s + (n.callbackCount || 1), 0);
    const alive = machines.filter(n => n.alive).length;
    const dead  = machines.length - alive;
    const custom = nodes.filter(n => n.type === 'custom').length;

    return (
        <div
            className="absolute bottom-4 left-4 z-40 flex items-center gap-5 px-5 py-2.5 font-mono text-[10px]"
            style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(5,5,15,0.88) 100%)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 0 1px rgba(34,211,238,0.15), 0 0 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            }}
        >
            <StatBadge label="MACH" value={machines.length} color="text-emerald-400/80" />
            <div className="w-px h-3 bg-white/5" />
            <StatBadge label="CB" value={totalCbs} color="text-emerald-400/80" />
            <div className="w-px h-3 bg-white/5" />
            <StatBadge label="LIVE" value={alive} color="text-emerald-400/80" />
            <StatBadge label="DEAD" value={dead} color="text-red-400/70" />
            <div className="w-px h-3 bg-white/5" />
            <StatBadge label="CUST" value={custom} color="text-amber-400/70" />
            <StatBadge label="EDGE" value={edges.length} color="text-cyan-400/70" />
            <StatBadge label="NET" value={subnets.length} color="text-green-400/70" />
        </div>
    );
};

const StatBadge = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-gray-700 tracking-[0.1em]">{label}</span>
        <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    </div>
);

// ═══════════════════════════════════════════════
//  Scene Compositor — wires data → 3D objects
// ═══════════════════════════════════════════════
/** Runs inside Canvas — projects a 3D world position to screen coords every frame */
/** Runs inside Canvas — projects a 3D world position to screen coords, throttled */
const ScreenProjector = ({
    worldPos,
    onProject,
    worldOffset,
}: {
    worldPos: THREE.Vector3;
    onProject: (screen: { x: number; y: number }) => void;
    worldOffset?: [number, number, number];
}) => {
    const { camera, gl } = useThree();
    const vec = useMemo(() => new THREE.Vector3(), []);
    const lastScreen = useRef({ x: 0, y: 0 });

    useFrame(() => {
        vec.copy(worldPos);
        if (worldOffset) vec.add(new THREE.Vector3(worldOffset[0], worldOffset[1], worldOffset[2]));
        vec.project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const x = (vec.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-vec.y * 0.5 + 0.5) * rect.height + rect.top;
        // Only update state if position changed meaningfully (>1px)
        if (Math.abs(x - lastScreen.current.x) > 1 || Math.abs(y - lastScreen.current.y) > 1) {
            lastScreen.current = { x, y };
            onProject({ x, y });
        }
    });

    return null;
};

const TopologyScene = ({
    nodes, edges, subnets,
    selectedId, onSelect, onContextMenu,
    dragNodeId, setDragNodeId, onDragEnd: onDragEndProp, showSubnets,
    pickingDimNodes,
}: {
    nodes: TopoNode[];
    edges: TopoEdge[];
    subnets: SubnetZone[];
    selectedId: string | null;
    onSelect: (id: string, screenPos?: { x: number; y: number }) => void;
    onContextMenu: (e: ThreeEvent<MouseEvent>, id: string) => void;
    dragNodeId: string | null;
    setDragNodeId: (id: string | null) => void;
    onDragEnd: (id: string, pos: THREE.Vector3) => void;
    showSubnets: boolean;
    pickingDimNodes?: Set<string> | null;
}) => {
    const nodeMap = useMemo(() => {
        const m = new Map<string, TopoNode>();
        nodes.forEach(n => m.set(n.id, n));
        return m;
    }, [nodes]);

    const handleDragStart = useCallback((id: string) => setDragNodeId(id), [setDragNodeId]);
    const handleDragEnd = useCallback((id: string, pos: THREE.Vector3) => {
        setDragNodeId(null);
        onDragEndProp(id, pos);
    }, [setDragNodeId, onDragEndProp]);

    return (
        <>
            <CyberEnvironment />
            <SmartOrbitControls dragActive={dragNodeId !== null} />

            {/* Subnet volumes (render first → behind nodes) */}
            {showSubnets && subnets.map(zone => (
                <SubnetVolume key={zone.cidr} zone={zone} />
            ))}

            {/* Edges */}
            {edges.map(edge => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;
                return (
                    <DataBeamEdge
                        key={edge.id}
                        sourcePos={src.position}
                        targetPos={tgt.position}
                        color={edge.color}
                        isP2P={edge.isP2P}
                        label={edge.label}
                    />
                );
            })}

            {/* Nodes */}
            {nodes.map(node => (
                <NodeSphere
                    key={node.id}
                    node={node}
                    isSelected={selectedId === node.id}
                    onSelect={onSelect}
                    onContextMenu={onContextMenu}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    pickingDim={pickingDimNodes ? (pickingDimNodes.has(node.id) ? 'dim' : 'brighten') : null}
                />
            ))}
        </>
    );
};

// ═══════════════════════════════════════════════
//  Page Component
// ═══════════════════════════════════════════════
export default function Topology3D() {
    const navigate = useNavigate();
    const { isSidebarCollapsed } = useAppStore();
    const quickHacks = useQuickHacks();

    // Play 3D loading sound on mount
    useEffect(() => { playThreeLoad(); }, []);

    // ── Data fetching (matching 2D CallbackGraph queries) ──
    const { data: callbacksData, refetch: refetchCallbacks } = useQuery(GET_CALLBACKS, { variables: { limit: 5000 }, pollInterval: 10000 });
    const { data: edgesData, loading: edgesLoading, refetch: refetchEdges } = useQuery(GET_CALLBACK_GRAPH_EDGES, { pollInterval: 10000 });
    const { data: customNodesData, refetch: refetchCustomNodes } = useQuery(GET_CUSTOM_GRAPH_NODES);
    const { data: customEdgesData, refetch: refetchCustomEdges } = useQuery(GET_CUSTOM_GRAPH_EDGES);
    const { data: linkFocusData } = useQuery(GET_LINK_FOCUS, { pollInterval: 10000 });

    const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION, {
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
    const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Lock state updated') : snackActions.error(d.updateCallback?.error || 'Failed'),
    });
    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [addEdge] = useMutation(ADD_EDGE_MUTATION);
    const [removeEdge] = useMutation(REMOVE_EDGE_MUTATION);
    const [createTask] = useMutation(CREATE_TASK_MUTATION);
    const [updateCustomNodeMutation] = useMutation(UPDATE_CUSTOM_GRAPH_NODE);
    const [deleteCustomNodeMutation] = useMutation(DELETE_CUSTOM_GRAPH_NODE);
    const [createCustomEdgeMutation] = useMutation(CREATE_CUSTOM_GRAPH_EDGE);
    const [deleteCustomEdgeMutation] = useMutation(DELETE_CUSTOM_GRAPH_EDGE);
    const [setLinkFocusMutation] = useMutation(SET_LINK_FOCUS);
    const [clearLinkFocusMutation] = useMutation(CLEAR_LINK_FOCUS);

    const { data: p2pData, refetch: refetchP2P } = useQuery(GET_P2P_PROFILES_AND_CALLBACKS, { fetchPolicy: 'network-only' });
    const { data: allC2Data, refetch: refetchAllC2 } = useQuery(GET_C2_PROFILES, { fetchPolicy: 'network-only' });
    const [getLinkCommands, { data: linkCommandsData, loading: linkCommandsLoading }] = useLazyQuery(GET_LINK_COMMANDS_FOR_CALLBACK, { fetchPolicy: 'network-only' });

    // ── State ──
    const [showInactive, setShowInactive] = useState(true);
    const [showHidden, setShowHidden] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const [showSubnets, setShowSubnets] = useState(true);
    const [showToolMenu, setShowToolMenu] = useState(false);
    const toolMenuRef = useRef<HTMLDivElement>(null);

    // ── Modal/Dialog State ──
    const [editDescriptionModal, setEditDescriptionModal] = useState<any>(null);
    const [newDescription, setNewDescription] = useState('');
    const [detailsModal, setDetailsModal] = useState<any>(null);
    const [setParentModal, setSetParentModal] = useState<any>(null);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);
    const [selectedDestination, setSelectedDestination] = useState<any>(null);
    const [edgeLabel, setEdgeLabel] = useState('');
    const [isP2PConnection, setIsP2PConnection] = useState(true);
    const [editCustomNodeModal, setEditCustomNodeModal] = useState<any>(null);
    const [customNodeForm, setCustomNodeForm] = useState({ host: '', os: 'Windows', ip: '', user: '', description: '', architecture: 'x64' });
    const [taskForEdgeModal, setTaskForEdgeModal] = useState<any>(null);
    const [taskForEdgeCommand, setTaskForEdgeCommand] = useState<any>(null);
    const [taskForEdgeParams, setTaskForEdgeParams] = useState('');
    const [taskingForEdge, setTaskingForEdge] = useState(false);
    const [showEventingDialog, setShowEventingDialog] = useState<any>(null);
    const [removeEdgeModal, setRemoveEdgeModal] = useState<any>(null);
    const [manuallyAddEdgeModal, setManuallyAddEdgeModal] = useState<any>(null);
    const [addEdgeSelectedProfile, setAddEdgeSelectedProfile] = useState<any>(null);
    const [addEdgeSelectedDest, setAddEdgeSelectedDest] = useState<any>(null);
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
    const customNodes = useMemo(() => {
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
            let parsed: any;
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
            .filter((cb: any) => String(cb.id) !== linkFocusNodeId)
            .map((cb: any) => ({
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
        const nativeEvent = e.nativeEvent || (e as any);
        setCtxMenu({
            x: nativeEvent.clientX ?? (e as any).clientX ?? 0,
            y: nativeEvent.clientY ?? (e as any).clientY ?? 0,
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
    const resolveCallbackData = useCallback((node: TopoNode) => {
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
        } catch (e: any) {
            snackActions.error('Failed to update description: ' + e.message);
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
        return edgesData.callbackgraphedge.find((e: any) => e.source?.id === callbackId && !e.end_timestamp);
    }, [edgesData, customEdges]);

    const handleDisconnectParent = useCallback(async (node: TopoNode) => {
        const callback = resolveCallbackData(node);
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
            } catch (e: any) {
                snackActions.error('Failed to disconnect: ' + e.message);
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
            } catch (e: any) {
                snackActions.error('Failed to disconnect: ' + e.message);
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
        } catch (e: any) {
            snackActions.error('Failed to disconnect: ' + e.message);
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
                id: editCustomNodeModal.db_id, hostname: customNodeForm.host, ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os, architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined, description: customNodeForm.description,
                hidden: editCustomNodeModal.isHidden || false,
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
        } catch (e: any) {
            snackActions.error('Failed to update: ' + e.message);
        }
    }, [editCustomNodeModal, customNodeForm, updateCustomNodeMutation, refetchCustomNodes]);

    const handleDeleteCustomNode = useCallback(async (node: TopoNode) => {
        const d = resolveCallbackData(node);
        try {
            const unique_id = generateUniqueId(d.db_id);
            const result = await deleteCustomNodeMutation({ variables: { unique_id } });
            if (result.data?.delete_agentstorage?.affected_rows > 0) {
                snackActions.success(`Custom node "${d.host}" deleted`);
                refetchCustomNodes();
            } else {
                throw new Error('Failed to delete');
            }
        } catch (e: any) {
            snackActions.error('Failed to delete: ' + e.message);
        }
        setCtxMenu(null);
    }, [resolveCallbackData, deleteCustomNodeMutation, refetchCustomNodes]);

    const handleOpenRemoveEdge = useCallback((node: TopoNode) => {
        const d = resolveCallbackData(node);
        const callbackId = d.callback_id ?? d.id;
        const activeEdges = (edgesData?.callbackgraphedge || []).filter(
            (e: any) => !e.end_timestamp && (e.source?.id === callbackId || e.destination?.id === callbackId)
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
        } catch (e: any) {
            snackActions.error('Failed: ' + e.message);
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
    const sendQuickHackTask = useCallback(async (execId: string, exec: QuickHackExecution, finalParams: string) => {
        // Start upload animation
        updateExec(execId, prev => ({ ...prev, phase: 'uploading', progress: 0, startTime: Date.now() }));

        let prog = 0;
        const oldIv = quickHackIntervalRef.current.get(execId);
        if (oldIv) clearInterval(oldIv);
        quickHackIntervalRef.current.set(execId, setInterval(() => {
            prog += 1.5 + Math.random() * 2;
            if (prog >= 30) prog = 30;
            setQuickHackExecs(prev => {
                const e = prev.get(execId);
                if (!e) return prev;
                const next = new Map(prev);
                next.set(execId, { ...e, progress: Math.min(prog, 30) });
                return next;
            });
        }, 100));

        try {
            const result = await createTask({
                variables: {
                    callback_id: exec.callbackId,
                    command: exec.hack.command,
                    params: finalParams,
                    original_params: finalParams,
                    tasking_location: 'parsed_cli',
                    token_id: 0,
                },
            });
            const taskResult = result.data?.createTask;
            if (taskResult?.status === 'error') {
                const iv = quickHackIntervalRef.current.get(execId);
                if (iv) { clearInterval(iv); quickHackIntervalRef.current.delete(execId); }
                playDoneQH();
                updateExec(execId, prev => ({ ...prev, phase: 'error', progress: prog, errorMsg: taskResult.error }));
                return;
            }

            const newTaskId = taskResult?.id;
            const iv = quickHackIntervalRef.current.get(execId);
            if (iv) { clearInterval(iv); quickHackIntervalRef.current.delete(execId); }
            updateExec(execId, prev => ({ ...prev, taskId: newTaskId, phase: 'processing', progress: 35 }));

            let processingProg = 35;
            quickHackIntervalRef.current.set(execId, setInterval(() => {
                processingProg += 0.3 + Math.random() * 0.8;
                if (processingProg >= 90) processingProg = 90;
                setQuickHackExecs(prev => {
                    const e = prev.get(execId);
                    if (!e) return prev;
                    const next = new Map(prev);
                    next.set(execId, { ...e, progress: Math.min(processingProg, 90) });
                    return next;
                });
            }, 200));

        } catch (e: any) {
            const iv = quickHackIntervalRef.current.get(execId);
            if (iv) { clearInterval(iv); quickHackIntervalRef.current.delete(execId); }
            playDoneQH();
            updateExec(execId, prev => ({ ...prev, phase: 'error', progress: prog, errorMsg: (e as Error).message }));
        }
    }, [createTask, updateExec]);

    // ── QuickHack: execute a specific hack from the floating panel ──
    const handleExecuteQuickHack = useCallback(async (hack: QuickHackDef) => {
        if (!quickHackTarget) return;
        const d = resolveCallbackData(quickHackTarget);
        setQuickHackTarget(null); // close the panel

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
        };
        setQuickHackExecs(prev => new Map(prev).set(execId, exec));

        // If no variables needed, send immediately
        if (!needsInput) {
            await sendQuickHackTask(execId, exec, hack.params);
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
        // Resolve params with variable values
        const finalParams = resolveParams(exec.hack.params, vars, exec.variableValues);
        await sendQuickHackTask(execId, exec, finalParams);
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
                    parent_id: isDestCustom ? selectedDestination.db_id : selectedDestination.id,
                    parent_type: isDestCustom ? 'custom' : 'callback', c2profile: selectedProfile.name,
                });
                const result = await updateCustomNodeMutation({ variables: { unique_id, data } });
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Linked to ${isDestCustom ? 'Custom Node' : 'Callback'} #${selectedDestination.display_id || selectedDestination.db_id}`);
                    refetchCustomNodes();
                } else {
                    snackActions.error('Failed to update connection');
                }
            } catch (e: any) {
                snackActions.error('Failed to link: ' + e.message);
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
                const result = await createCustomEdgeMutation({ variables: { unique_id: generateEdgeUniqueId(edgeId), data: serializeEdgeData(newEdge) } });
                if (result.data?.insert_agentstorage_one) {
                    snackActions.success(`Linked to Custom Node #${selectedDestination.db_id}`);
                    refetchCustomEdges();
                } else {
                    snackActions.error('Failed to save connection');
                }
            } catch (e: any) {
                snackActions.error('Failed to link: ' + e.message);
            }
            setSetParentModal(null);
            return;
        }

        // Regular callback → callback
        try {
            if (edgesData?.callbackgraphedge) {
                const existingEdges = edgesData.callbackgraphedge.filter((e: any) => e.source?.id === setParentModal.id && !e.end_timestamp);
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
        } catch (e: any) {
            snackActions.error('Failed to add edge: ' + e.message);
        }
    }, [setParentModal, selectedProfile, selectedDestination, customNodes, customEdges, edgesData,
        updateCustomNodeMutation, deleteCustomEdgeMutation, createCustomEdgeMutation, removeEdge, addEdge,
        refetchCallbacks, refetchEdges, refetchCustomNodes, refetchCustomEdges]);

    const filteredCallbacksForParent = useMemo(() => {
        if (!setParentModal) return [];
        const allNodes = [...(callbacksData?.callback || []), ...customNodes];
        return allNodes
            .filter((c: any) => c.id !== setParentModal.id)
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
            <Sidebar />

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
                                const liveNode = nodes.find(n => n.allCallbacks?.some((c: any) => c.id === callbackId)) ?? null;
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

                {/* ═══════════════════════════════════════════════ */}
                {/*  Modal Dialogs (matching CallbackGraph)        */}
                {/* ═══════════════════════════════════════════════ */}

                {/* Edit Description Modal */}
                <AnimatePresence>
                    {editDescriptionModal && (
                        <CyberModal
                            title="EDIT_DESCRIPTION"
                            onClose={() => setEditDescriptionModal(null)}
                            icon={<Edit />}
                        >
                            <div className="space-y-4">
                                <div className="text-xs text-gray-400 font-mono mb-2">
                                    Callback #{editDescriptionModal.display_id} - {editDescriptionModal.host}
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                    <input
                                        type="text"
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setEditDescriptionModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                    <button
                                        onClick={handleSaveDescription}
                                        className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors"
                                    >
                                        SAVE
                                    </button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>

                {/* Edit Custom Node Modal */}
                <AnimatePresence>
                    {editCustomNodeModal && (
                        <CyberModal
                            title="EDIT_CUSTOM_NODE"
                            onClose={() => setEditCustomNodeModal(null)}
                            icon={<Edit />}
                        >
                            <div className="space-y-4">
                                <div className="text-xs text-gray-400 mb-4">
                                    Edit custom node #{editCustomNodeModal.display_id} - {editCustomNodeModal.host}
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">HOSTNAME *</label>
                                    <input type="text" value={customNodeForm.host}
                                        onChange={(e) => setCustomNodeForm({...customNodeForm, host: e.target.value})}
                                        placeholder="TARGET-PC-01"
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">OPERATING SYSTEM *</label>
                                    <select value={customNodeForm.os}
                                        onChange={(e) => setCustomNodeForm({...customNodeForm, os: e.target.value})}
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm">
                                        <option value="Windows">Windows</option>
                                        <option value="Linux">Linux</option>
                                        <option value="macOS">macOS</option>
                                        <option value="Unknown">Unknown</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">IP ADDRESS *</label>
                                    <input type="text" value={customNodeForm.ip}
                                        onChange={(e) => setCustomNodeForm({...customNodeForm, ip: e.target.value})}
                                        placeholder="192.168.1.100"
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">ARCHITECTURE</label>
                                    <select value={customNodeForm.architecture}
                                        onChange={(e) => setCustomNodeForm({...customNodeForm, architecture: e.target.value})}
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm">
                                        <option value="x64">x64</option>
                                        <option value="x86">x86</option>
                                        <option value="arm64">ARM64</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">USER</label>
                                    <input type="text" value={customNodeForm.user}
                                        onChange={(e) => setCustomNodeForm({...customNodeForm, user: e.target.value})}
                                        placeholder="Administrator"
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                    <textarea value={customNodeForm.description}
                                        onChange={(e) => setCustomNodeForm({...customNodeForm, description: e.target.value})}
                                        placeholder="Target system details..."
                                        rows={3}
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-sm resize-none" />
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <button onClick={() => setEditCustomNodeModal(null)}
                                        className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                    <button onClick={handleUpdateCustomNode}
                                        className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors">UPDATE</button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>

                {/* Details Modal */}
                <AnimatePresence>
                    {detailsModal && (
                        <CyberModal
                            title={detailsModal.isCustom ? "CUSTOM_NODE_DETAILS" : "CALLBACK_DETAILS"}
                            onClose={() => setDetailsModal(null)}
                            icon={<Info />}
                        >
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-3 bg-black/30 border border-gray-800">
                                    <div className={`p-2 border ${
                                        detailsModal.isCustom
                                            ? 'border-cyan-500 bg-cyan-500/10'
                                            : (detailsModal.integrity_level > 2 ? 'border-yellow-500 bg-yellow-500/10' : 'border-cyan-500 bg-cyan-500/10')
                                    }`}>
                                        <Terminal size={20} className={detailsModal.isCustom ? 'text-cyan-500' : (detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-cyan-500')} />
                                    </div>
                                    <div>
                                        <div className="text-lg font-bold text-white font-mono">
                                            {detailsModal.isCustom ? 'CUSTOM_NODE' : 'CALLBACK'} #{detailsModal.display_id}
                                            {detailsModal.locked && <Lock size={14} className="inline ml-2 text-red-500" />}
                                        </div>
                                        <div className="text-xs text-gray-500">{detailsModal.host}</div>
                                    </div>
                                    {!detailsModal.isCustom && detailsModal.integrity_level > 2 && (
                                        <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-yellow-500/20 border border-yellow-500/50">
                                            <Shield size={12} className="text-yellow-500" />
                                            <span className="text-xs font-bold text-yellow-500">ADMIN</span>
                                        </div>
                                    )}
                                    {detailsModal.isCustom && (
                                        <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-cyan-500/20 border border-cyan-500/50">
                                            <span className="text-xs font-bold text-cyan-400">CUSTOM</span>
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                    <div className="space-y-1"><div className="text-gray-500">USER</div><div className="text-white">{detailsModal.user}</div></div>
                                    {!detailsModal.isCustom && <div className="space-y-1"><div className="text-gray-500">DOMAIN</div><div className="text-white">{detailsModal.domain || 'N/A'}</div></div>}
                                    <div className="space-y-1"><div className="text-gray-500">IP_ADDRESS</div><div className="text-white">{detailsModal.ip}</div></div>
                                    {!detailsModal.isCustom && <div className="space-y-1"><div className="text-gray-500">PID</div><div className="text-white">{detailsModal.pid}</div></div>}
                                    <div className="space-y-1"><div className="text-gray-500">OS</div><div className="text-white">{detailsModal.os}</div></div>
                                    <div className="space-y-1"><div className="text-gray-500">ARCHITECTURE</div><div className="text-white">{detailsModal.architecture}</div></div>
                                    {!detailsModal.isCustom && (
                                        <>
                                            <div className="space-y-1"><div className="text-gray-500">AGENT</div><div className="text-white uppercase">{detailsModal.payloadType}</div></div>
                                            <div className="space-y-1"><div className="text-gray-500">INTEGRITY</div><div className={detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-white'}>Level {detailsModal.integrity_level}</div></div>
                                        </>
                                    )}
                                </div>
                                {!detailsModal.isCustom && detailsModal.sleep_info && (
                                    <div className="p-3 bg-black/30 border border-gray-800">
                                        <div className="text-xs font-mono text-gray-500 mb-1">SLEEP_INFO</div>
                                        <div className="text-sm font-mono text-cyan-400">{detailsModal.sleep_info}</div>
                                    </div>
                                )}
                                <div className="p-3 bg-black/30 border border-gray-800">
                                    <div className="text-xs font-mono text-gray-500 mb-1">DESCRIPTION</div>
                                    <div className="text-sm text-gray-300 italic">{detailsModal.description || 'No description set'}</div>
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={() => setDetailsModal(null)}
                                        className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors">CLOSE</button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>

                {/* Set Parent / Link to Parent Modal */}
                <AnimatePresence>
                    {setParentModal && (
                        <CyberModal
                            title="LINK_TO_PARENT"
                            onClose={() => setSetParentModal(null)}
                            icon={<GitBranch />}
                        >
                            <div className="space-y-4">
                                <div className="text-xs text-gray-400 font-mono mb-2">
                                    Link {setParentModal.isCustom ? 'Custom Node' : 'Callback'} #{setParentModal.display_id} ({setParentModal.host}) to another node.
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">TARGET_NODE</label>
                                    <div className="grid gap-2 max-h-48 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                        {filteredCallbacksForParent.length > 0 ? (
                                            filteredCallbacksForParent.map((callback: any) => {
                                                const ip = callback.isCustom ? callback.ip : (() => { try { return JSON.parse(callback.ip)[0] } catch { return callback.ip } })();
                                                return (
                                                    <button key={callback.id} onClick={() => setSelectedDestination(callback)}
                                                        className={`flex items-center gap-3 px-3 py-2.5 border text-left text-xs font-mono transition-colors ${
                                                            selectedDestination?.id === callback.id
                                                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-white/5'
                                                        }`}>
                                                        <div className={`w-2 h-2 rounded-full ${callback.isCustom ? 'bg-cyan-500' : (callback.integrity_level > 2 ? 'bg-yellow-500' : 'bg-green-500')}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold">#{callback.display_id}</span>
                                                                <span className="text-gray-500">@</span>
                                                                <span className="truncate">{callback.host}</span>
                                                                {callback.isCustom && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1 py-0.5 border border-cyan-500/30">CUSTOM</span>}
                                                            </div>
                                                            <div className="text-[11px] text-gray-600 flex items-center gap-2">
                                                                <span>{callback.user}</span><span>·</span><span>{ip}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-[11px] uppercase text-gray-600 border border-gray-700 px-1.5 py-0.5">
                                                            {callback.isCustom ? 'CUSTOM' : callback.payload?.payloadtype?.name}
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_OTHER_NODES_AVAILABLE</div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">CONNECTION_TYPE</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setIsP2PConnection(true); setSelectedProfile(null); }}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-mono transition-colors ${
                                                isP2PConnection ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                            }`}>
                                            <GitBranch size={14} /><span>P2P</span>
                                        </button>
                                        <button onClick={() => { setIsP2PConnection(false); setSelectedProfile(null); }}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-mono transition-colors ${
                                                !isP2PConnection ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                            }`}>
                                            <Network size={14} /><span>EGRESS</span>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">{isP2PConnection ? 'P2P_PROFILE' : 'C2_PROFILE'}</label>
                                    <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                        {isP2PConnection ? (
                                            <>
                                                {p2pData?.c2profile?.map((profile: any) => (
                                                    <button key={profile.id} onClick={() => setSelectedProfile(profile)}
                                                        className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                            selectedProfile?.id === profile.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                        }`}>
                                                        <GitBranch size={14} /><span>{profile.name}</span>
                                                        <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                                    </button>
                                                ))}
                                                {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                                    <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES_AVAILABLE</div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {allC2Data?.c2profile?.filter((p: any) => !p.is_p2p).map((profile: any) => (
                                                    <button key={profile.id} onClick={() => setSelectedProfile(profile)}
                                                        className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                            selectedProfile?.id === profile.id ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                        }`}>
                                                        <Network size={14} /><span>{profile.name}</span>
                                                        <div className="ml-auto flex items-center gap-1">
                                                            {profile.running
                                                                ? <span className="text-[11px] text-green-500 border border-green-800 px-1">RUNNING</span>
                                                                : <span className="text-[11px] text-red-500 border border-red-800 px-1">STOPPED</span>}
                                                        </div>
                                                    </button>
                                                ))}
                                                {(!allC2Data?.c2profile?.filter((p: any) => !p.is_p2p)?.length) && (
                                                    <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_EGRESS_PROFILES_AVAILABLE</div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-1">EDGE_LABEL <span className="text-gray-600">(optional)</span></label>
                                    <input type="text" value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)}
                                        placeholder="e.g., SMB Link, Internal Pivot..."
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-xs placeholder:text-gray-600" />
                                </div>
                                {selectedDestination && selectedProfile && (
                                    <div className={`p-3 border text-xs font-mono ${isP2PConnection ? 'bg-cyan-900/20 border-cyan-500/30' : 'bg-purple-900/20 border-purple-500/30'}`}>
                                        <div className={`mb-2 flex items-center gap-2 ${isP2PConnection ? 'text-cyan-400' : 'text-purple-400'}`}>
                                            {isP2PConnection ? <GitBranch size={12} /> : <Network size={12} />}
                                            <span>LINK_SUMMARY</span>
                                            <span className={`text-[11px] px-1.5 py-0.5 border ${isP2PConnection ? 'border-cyan-600 text-cyan-500' : 'border-purple-600 text-purple-500'}`}>
                                                {isP2PConnection ? 'P2P' : 'EGRESS'}
                                            </span>
                                        </div>
                                        <div className="text-gray-300 flex items-center gap-2 flex-wrap">
                                            <span className="text-cyan-400 font-bold">#{setParentModal.display_id}</span>
                                            <span className="text-gray-600">({setParentModal.host})</span>
                                            <span className={isP2PConnection ? 'text-cyan-500' : 'text-purple-500'}>→</span>
                                            <span className={`px-2 py-0.5 ${isP2PConnection ? 'bg-cyan-900/50 text-cyan-400' : 'bg-purple-900/50 text-purple-400'}`}>{selectedProfile.name}</span>
                                            <span className={isP2PConnection ? 'text-cyan-500' : 'text-purple-500'}>→</span>
                                            <span className="text-cyan-400 font-bold">#{selectedDestination.display_id}</span>
                                            <span className="text-gray-600">({selectedDestination.host})</span>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => setSetParentModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                    <button onClick={handleSetParent} disabled={!selectedProfile || !selectedDestination}
                                        className={`px-6 py-2 font-bold font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                            isP2PConnection ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-purple-600 text-white hover:bg-purple-500'
                                        }`}>CREATE_LINK</button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>

                {/* Task for Edge Modal */}
                <AnimatePresence>
                    {taskForEdgeModal && (
                        <CyberModal
                            title="TASK_FOR_EDGE"
                            onClose={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }}
                            icon={<Link2 />}
                        >
                            <div className="space-y-4 min-w-[380px]">
                                <div className="text-xs text-gray-400 font-mono">
                                    Callback #{taskForEdgeModal.display_id} — {taskForEdgeModal.host}
                                </div>
                                {linkCommandsLoading && (
                                    <div className="text-cyan-400 text-xs font-mono animate-pulse">LOADING_COMMANDS...</div>
                                )}
                                {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) === 0 && (
                                    <div className="text-gray-500 text-xs font-mono">No link commands loaded on this callback.</div>
                                )}
                                {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-xs font-mono text-gray-400">SELECT_COMMAND</div>
                                        {linkCommandsData!.loadedcommands.map((lc: any) => (
                                            <button key={lc.command.id}
                                                onClick={() => { setTaskForEdgeCommand(lc.command); setTaskForEdgeParams(''); }}
                                                className={`w-full flex items-center gap-2 px-3 py-2 border text-xs font-mono text-left transition-colors ${
                                                    taskForEdgeCommand?.id === lc.command.id
                                                        ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
                                                        : 'bg-black border-white/10 text-gray-400 hover:border-cyan-500/40 hover:text-cyan-400/70'
                                                }`}>
                                                <Zap size={12} />
                                                <span className="font-bold">{lc.command.cmd}</span>
                                                {lc.command.description && <span className="text-gray-600 truncate">— {lc.command.description}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {taskForEdgeCommand && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-mono text-gray-400">PARAMS (JSON or raw)</label>
                                        <textarea value={taskForEdgeParams} onChange={e => setTaskForEdgeParams(e.target.value)}
                                            rows={3} placeholder='{}'
                                            className="w-full bg-black/50 border border-gray-700 p-2 text-cyan-400 focus:border-cyan-500 outline-none font-mono text-xs resize-none" />
                                    </div>
                                )}
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }}
                                        className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                    <button disabled={!taskForEdgeCommand || taskingForEdge}
                                        onClick={async () => {
                                            if (!taskForEdgeCommand) return;
                                            setTaskingForEdge(true);
                                            try {
                                                await createTask({ variables: { callback_id: taskForEdgeModal.callback_id, command: taskForEdgeCommand.cmd, params: taskForEdgeParams || '{}', token_id: 0 } });
                                                snackActions.success(`Tasked: ${taskForEdgeCommand.cmd}`);
                                                setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams('');
                                            } catch (e: any) {
                                                snackActions.error('Task failed: ' + e.message);
                                            } finally {
                                                setTaskingForEdge(false);
                                            }
                                        }}
                                        className="px-6 py-2 bg-cyan-500 text-black font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                        {taskingForEdge ? 'TASKING...' : 'TASK'}
                                    </button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>

                {/* Eventing Dialog */}
                {showEventingDialog && (
                    <MythicDialog
                        fullWidth={true}
                        maxWidth="xl"
                        open={!!showEventingDialog}
                        onClose={() => setShowEventingDialog(null)}
                        innerDialog={
                            <EventTriggerContextSelectDialog
                                onClose={() => setShowEventingDialog(null)}
                                triggerContext={{ name: 'callback_id', value: showEventingDialog.id }}
                            />
                        }
                    />
                )}

                {/* Add P2P Edge Modal */}
                <AnimatePresence>
                    {manuallyAddEdgeModal && (
                        <CyberModal
                            title="ADD_P2P_EDGE"
                            onClose={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                            icon={<Plus />}
                        >
                            <div className="space-y-4 min-w-[380px]">
                                <p className="text-xs text-gray-400 font-mono">
                                    Source: <span className="text-cyan-400">#{manuallyAddEdgeModal.display_id ?? manuallyAddEdgeModal.callback_id}</span>
                                    {manuallyAddEdgeModal.host && <span className="text-gray-500 ml-2">({manuallyAddEdgeModal.host})</span>}
                                </p>
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">P2P_PROFILE</label>
                                    <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                        {p2pData?.c2profile?.map((profile: any) => (
                                            <button key={profile.id}
                                                onClick={() => {
                                                    setAddEdgeSelectedProfile(profile);
                                                    setAddEdgeSelectedDest(null);
                                                    const srcId = manuallyAddEdgeModal.id ?? manuallyAddEdgeModal.callback_id;
                                                    const dests = (profile.callbackc2profiles || []).map((cp: any) => cp.callback).filter((c: any) => c && c.id !== srcId);
                                                    setAddEdgeDestOptions(dests);
                                                }}
                                                className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                    addEdgeSelectedProfile?.id === profile.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                }`}>
                                                <GitBranch size={14} /><span>{profile.name}</span>
                                                <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                            </button>
                                        ))}
                                        {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                            <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES_AVAILABLE</div>
                                        )}
                                    </div>
                                </div>
                                {addEdgeSelectedProfile && (
                                    <div>
                                        <label className="block text-xs font-mono text-gray-500 mb-2">DESTINATION_CALLBACK</label>
                                        <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                            {addEdgeDestOptions.map((cb: any) => (
                                                <button key={cb.id} onClick={() => setAddEdgeSelectedDest(cb)}
                                                    className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                        addEdgeSelectedDest?.id === cb.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}>
                                                    <Monitor size={14} /><span>#{cb.display_id}</span>
                                                    {cb.description && <span className="text-gray-500 ml-1 truncate max-w-[140px]">{cb.description}</span>}
                                                </button>
                                            ))}
                                            {addEdgeDestOptions.length === 0 && (
                                                <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_CALLBACKS_WITH_PROFILE</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                                        className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                                    <button onClick={handleManuallyAddEdge} disabled={!addEdgeSelectedProfile || !addEdgeSelectedDest}
                                        className="px-4 py-2 border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500 font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                        CONFIRM_EDGE
                                    </button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>

                {/* Remove Edge Modal */}
                <AnimatePresence>
                    {removeEdgeModal && (
                        <CyberModal
                            title="REMOVE_EDGE"
                            onClose={() => setRemoveEdgeModal(null)}
                            icon={<Trash2 />}
                        >
                            <div className="space-y-3 min-w-[340px]">
                                <p className="text-xs text-gray-400 font-mono mb-2">Select an active edge to remove:</p>
                                {removeEdgeModal.map((e: any) => (
                                    <button key={e.id}
                                        onClick={async () => {
                                            try {
                                                await removeEdge({ variables: { edge_id: e.id } });
                                                snackActions.success('Edge removed');
                                            } catch (err: any) {
                                                snackActions.error('Failed: ' + err.message);
                                            }
                                            setRemoveEdgeModal(null);
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-orange-500/40 text-xs font-mono text-left text-gray-300 hover:text-orange-300 hover:bg-orange-900/20 transition-colors">
                                        <Trash2 size={12} className="text-orange-500 shrink-0" />
                                        <span>
                                            #{e.source?.display_id} → #{e.destination?.display_id}
                                            {e.c2profile?.name && <span className="text-gray-500 ml-2">[{e.c2profile.name}]</span>}
                                        </span>
                                    </button>
                                ))}
                                <div className="flex justify-end pt-2">
                                    <button onClick={() => setRemoveEdgeModal(null)}
                                        className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                </div>
                            </div>
                        </CyberModal>
                    )}
                </AnimatePresence>
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
