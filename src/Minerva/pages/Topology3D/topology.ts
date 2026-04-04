import * as THREE from 'three';
import type { TopoNode, TopoNodeData, TopoEdge, SubnetZone } from '../../types/topology';
import { isCallbackAlive } from '../../lib/utils';

export const CORE_COLOR       = new THREE.Color('#22d3ee');   // cyan
export const CALLBACK_COLOR   = new THREE.Color('#22c55e');   // green
export const CALLBACK_DEAD    = new THREE.Color('#ef4444');   // red
export const CUSTOM_COLOR     = new THREE.Color('#f59e0b');   // amber
export const EDGE_COLOR       = new THREE.Color('#22d3ee');
export const EDGE_P2P_COLOR   = new THREE.Color('#a855f7');   // purple
export const SUBNET_COLOR     = new THREE.Color('#22c55e');
export const BG_COLOR         = '#050505';

export const NODE_RADIUS      = 0.4;
export const CORE_RADIUS      = 0.8;
export const CUSTOM_RADIUS    = 0.5;
export const SUBNET_PADDING   = 2.5;
export const NODE_SPACING     = 2.8;  // horizontal spacing between nodes in a row
export const MIN_CORE_DIST    = 5;    // Z distance from core to first depth layer
export const CHILD_RING_DIST  = 4;    // Z distance between depth layers

// ═══════════════════════════════════════════════
//  QuickHack Definitions (shared from lib/quickhacks)
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════
/** Deterministic /24 subnet from an IP string */
export function ipToSubnet(ip: string): string | null {
    if (!ip) return null;
    const m = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    return m ? `${m[1]}.0/24` : null;
}

export function getOSLabel(data: TopoNodeData): string {
    const os = String(data?.os || data?.operating_system || '').toLowerCase();
    if (os.includes('windows')) return 'WIN';
    if (os.includes('linux'))   return 'LNX';
    if (os.includes('mac'))     return 'MAC';
    return 'UNK';
}

export function getOSFullLabel(data: TopoNodeData): string {
    const os = String(data?.os || data?.operating_system || '').toLowerCase();
    if (os.includes('windows')) return 'Windows';
    if (os.includes('linux'))   return 'Linux';
    if (os.includes('mac'))     return 'macOS';
    return os || 'Unknown';
}

/** Extract clean primary IPv4 from callback ip field (may be JSON array or plain string) */
export function extractPrimaryIP(ip: any): string {
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
export function getPrivilegeLabel(data: TopoNodeData): string {
    const il = data?.integrity_level as number | string | undefined;
    if (il === 4 || il === 'SYSTEM') return 'SYSTEM';
    if (il === 3 || il === 'High')   return 'Admin';
    if (il === 2 || il === 'Medium') return 'User';
    if (il === 1 || il === 'Low')    return 'Low';
    // Fallback: check user field for hints
    const user = String(data?.user || '').toLowerCase();
    if (user === 'root' || user === 'system' || user.includes('nt authority')) return 'SYSTEM';
    if (data?.user) return String(data.user);
    return '';
}

// ═══════════════════════════════════════════════
//  Data Builder — transforms GQL data → 3D topology
// ═══════════════════════════════════════════════
export function buildTopology(
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

        // Sort: primary by subnet (cluster same-subnet nodes together),
        // secondary by parent X (keep subtrees together), tertiary by label
        const enriched = bucket.map(id => {
            const parent = parentOf.get(id);
            const parentX = parent && nodesMap.has(parent) ? nodesMap.get(parent)!.position.x : 0;
            const node = nodesMap.get(id)!;
            return { id, parentX, subnet: node.subnet || '', label: node.label };
        });
        enriched.sort((a, b) =>
            a.subnet.localeCompare(b.subnet) ||
            a.parentX - b.parentX ||
            a.label.localeCompare(b.label)
        );

        // Insert extra gap between different subnet groups so zone volumes don't overlap
        const SUBNET_GAP = NODE_SPACING * 0.8;
        let totalWidth = 0;
        for (let i = 0; i < enriched.length; i++) {
            if (i > 0) {
                totalWidth += NODE_SPACING;
                if (enriched[i].subnet !== enriched[i - 1].subnet) totalWidth += SUBNET_GAP;
            }
        }
        const rowZ = d * LAYER_SPACING_Z;
        let curX = -totalWidth / 2;

        for (let i = 0; i < enriched.length; i++) {
            if (i > 0) {
                curX += NODE_SPACING;
                if (enriched[i].subnet !== enriched[i - 1].subnet) curX += SUBNET_GAP;
            }
            const node = nodesMap.get(enriched[i].id)!;
            node.position.set(curX, 0, rowZ);
            positioned.add(enriched[i].id);
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
    // Only include node positions within the subnet; do NOT expand the zone toward
    // parent nodes in other subnets so that cross-subnet edges stay outside the volume.
    const subnetNodeSet = new Map<string, Set<string>>();
    subnetMap.forEach((nodeIds, cidr) => subnetNodeSet.set(cidr, new Set(nodeIds)));

    const subnets: SubnetZone[] = [];
    subnetMap.forEach((nodeIds, cidr) => {
        if (nodeIds.length < 2) return;
        const members = nodeIds.map(id => nodesMap.get(id)!);
        const positions = members.map(n => n.position);
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        positions.forEach(p => { min.min(p); max.max(p); });

        // Tight padding: use smaller padding on the Z-axis (depth direction) so the
        // zone doesn't extend toward parent layers where cross-subnet edges travel.
        const PAD_XY = SUBNET_PADDING;
        const PAD_Z  = Math.min(SUBNET_PADDING, LAYER_SPACING_Z * 0.25); // ≤25% of layer gap

        const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
        const size = new THREE.Vector3(
            max.x - min.x + PAD_XY * 2,
            max.y - min.y + PAD_XY * 2,
            max.z - min.z + PAD_Z * 2,
        );
        size.x = Math.max(size.x, 3);
        size.y = Math.max(size.y, 3);
        size.z = Math.max(size.z, 1.5); // keep Z tight so edges to other subnets stay outside
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
