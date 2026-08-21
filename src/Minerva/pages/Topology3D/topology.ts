import { Color, Vector3 } from 'three';
import type { TopoNode, TopoNodeData, TopoEdge, SubnetZone } from '../../types/topology';
import { isCallbackAlive } from '../../lib/utils';
import { extractAllIPs } from '../../lib/quickhacks';

export const CORE_COLOR       = new Color('#22d3ee');   // cyan
export const CALLBACK_COLOR   = new Color('#22c55e');   // green
export const CALLBACK_DEAD    = new Color('#ef4444');   // red
export const CUSTOM_COLOR     = new Color('#f59e0b');   // amber
export const EDGE_COLOR       = new Color('#22d3ee');
export const EDGE_P2P_COLOR   = new Color('#a855f7');   // purple
export const SUBNET_COLOR     = new Color('#22c55e');
export const BG_COLOR         = '#050505';


export const NODE_RADIUS      = 0.4;
export const CORE_RADIUS      = 0.8;
export const CUSTOM_RADIUS    = 0.5;
// Tightened spacing — keeps nodes legible while minimizing edge length.
// NODE_SPACING ≈ 5.5 × NODE_RADIUS still leaves plenty of breathing room.
export const SUBNET_PADDING   = 1.6;
export const NODE_SPACING     = 2.2;  // horizontal spacing between nodes in a row
export const MIN_CORE_DIST    = 4;    // Z distance from core to first depth layer
export const CHILD_RING_DIST  = 3;    // Z distance between depth layers

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
export type PrivilegeTier = 'max' | 'elevated' | 'user' | 'unknown';

export interface PrivilegeInfo {
    /** What to print: SYSTEM / ROOT / ADMIN / USER / LOW, or '' when unknown. */
    label: string;
    tier: PrivilegeTier;
    /** True for linux/macOS/BSD/Android sessions — callers say "root", not "SYSTEM". */
    unix: boolean;
}

/** Windows integrity levels are numeric (or the names Mythic sometimes sends). */
function integrityNumber(il: unknown): number {
    if (typeof il === 'number') return il;
    if (il === 'SYSTEM') return 4;
    if (il === 'High') return 3;
    if (il === 'Medium') return 2;
    if (il === 'Low') return 1;
    return NaN;
}

function isUnixSession(data: TopoNodeData, user: string): boolean {
    const os = String(data?.os || data?.operating_system || '').toLowerCase();
    if (os.includes('windows')) return false;
    if (/linux|mac|darwin|bsd|unix|android|solaris/.test(os)) return true;
    // OS not reported: the account name still gives it away.
    if (user === 'root' || user.startsWith('root@') || user.includes('uid=0')) return true;
    if (user.includes('nt authority') || user.includes('\\')) return false;
    return false;
}

/**
 * Privilege, read the way the target platform actually works.
 *
 * Windows has a ladder — SYSTEM sits above an elevated admin, which sits above
 * a normal user — so `integrity_level` carries real meaning there.
 *
 * Unix does not. The question is binary: is this session uid 0 or not. A
 * `sudo`-capable account still runs unprivileged until it escalates, and
 * Mythic reports no sudo membership, so there is no honest "elevated" tier to
 * show on Linux/macOS — and calling root "SYSTEM" was simply the wrong word.
 * Several Linux agents also report a Windows-ish integrity level for root, so
 * `il >= 3` is accepted as a root signal alongside the account name.
 */
export function getPrivilege(data: TopoNodeData): PrivilegeInfo {
    const user = String(data?.user || '').trim().toLowerCase();
    const unix = isUnixSession(data, user);
    const il = integrityNumber(data?.integrity_level);

    if (unix) {
        const isRoot = user === 'root' || user.startsWith('root@') || user.includes('uid=0') || il >= 3;
        if (isRoot) return { label: 'ROOT', tier: 'max', unix };
        if (!user && !Number.isFinite(il)) return { label: '', tier: 'unknown', unix };
        return { label: 'USER', tier: 'user', unix };
    }

    if (il >= 4 || user === 'system' || user.includes('nt authority')) return { label: 'SYSTEM', tier: 'max', unix };
    if (il === 3) return { label: 'ADMIN', tier: 'elevated', unix };
    if (il === 2) return { label: 'USER', tier: 'user', unix };
    if (il === 1) return { label: 'LOW', tier: 'user', unix };
    if (user) return { label: user.toUpperCase(), tier: 'unknown', unix };
    return { label: '', tier: 'unknown', unix };
}

/** Display label only — see `getPrivilege` for the tier a caller should branch on. */
export function getPrivilegeLabel(data: TopoNodeData): string {
    return getPrivilege(data).label;
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
    /**
     * Node ids the operator explicitly disconnected (via the right-click
     * "Disconnect Parent" action). They are NOT auto-rescued to MINERVA core
     * in step 5; instead they get parked in a disconnected zone so the
     * operator's intent is honoured visually. Pass `null` / undefined to
     * preserve the legacy auto-rescue behaviour.
     */
    disconnectedNodes?: ReadonlySet<string> | null,
): { nodes: TopoNode[]; edges: TopoEdge[]; subnets: SubnetZone[] } {
    const nodesMap = new Map<string, TopoNode>();
    const topoEdges: TopoEdge[] = [];

    // — Core —
    nodesMap.set('core', {
        id: 'core', type: 'core', label: 'MINERVA', sublabel: 'CORE',
        position: new Vector3(0, 0, 0),
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

    // Per-node subnet membership — a multi-homed machine (or a host group
    // whose callbacks span different NICs / pivot networks) needs to land
    // inside every /24 zone its IPs touch, not just the one its primary IP
    // happens to fall in. Layout sorting still uses the node's `subnet`
    // (primary-IP-derived) to keep tree column order stable; the zone
    // visualisation reads from this multi-membership map instead. Built
    // alongside node construction below and consumed when subnetMap is
    // populated.
    const nodeSubnets = new Map<string, Set<string>>();
    const addNodeSubnet = (nodeId: string, cidr: string | null | undefined) => {
        if (!cidr) return;
        if (!nodeSubnets.has(nodeId)) nodeSubnets.set(nodeId, new Set());
        nodeSubnets.get(nodeId)!.add(cidr);
    };

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
        // Precompute liveness once per callback — isCallbackAlive runs a
        // JSON.parse(sleep_info) plus a full edge scan, so calling it inside
        // the comparator would recompute it O(k·log k) times per host, and
        // `anyAlive` below would repeat it a final time.
        const aliveById = new Map<unknown, boolean>();
        for (const c of cbs) aliveById.set(c.id, c.active !== false && isCallbackAlive(c, edges));
        const sorted = [...cbs].sort((a, b) => {
            const aAlive = aliveById.get(a.id) ? 1 : 0;
            const bAlive = aliveById.get(b.id) ? 1 : 0;
            if (bAlive !== aAlive) return bAlive - aAlive;
            const aPriv = privOrder(a), bPriv = privOrder(b);
            if (bPriv !== aPriv) return bPriv - aPriv;
            // Final tiebreak: prefer the *oldest* display_id. This keeps
            // the machine's representative callback stable when newer
            // callbacks join the same host (e.g. a brand-new TCP linker
            // callback spawned by AMPLIFICATION). Picking the newest
            // used to cause the machine's primary IP/subnet to flip to
            // the linker's address, which shifted the node's
            // subnet-rank-driven column in the tidy tree — visible to
            // the operator as nodes jumping after AMPLIFICATION.
            return (a.display_id || 0) - (b.display_id || 0);
        });
        const rep = sorted[0];
        const anyAlive = sorted.some(c => aliveById.get(c.id));
        const primaryIP = extractPrimaryIP(rep.ip);
        const subnet = ipToSubnet(primaryIP) || 'unknown';
        const os = getOSLabel(rep);

        for (const c of cbs) cbIdToNodeId.set(c.id, nodeId);
        const osFullLabel = getOSFullLabel(rep);
        const privilege = getPrivilegeLabel(rep);

        const topoNode: TopoNode = {
            id: nodeId, type: 'callback',
            label: rep.host || `Host-${rep.display_id}`,
            sublabel: cbs.length > 1
                ? `${cbs.length} callbacks · ${primaryIP || '?'}`
                : `${rep.user || '?'}@${rep.host || '?'}`,
            position: new Vector3(),
            color: anyAlive ? CALLBACK_COLOR : CALLBACK_DEAD,
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

        // Multi-IP membership — sweep every callback's IP list, not just
        // the rep's primary, so a multi-homed host (e.g. a pivot with a
        // 10.x interface and a 172.x interface) is enclosed by both zones.
        for (const c of cbs) {
            for (const oneIp of extractAllIPs(c.ip)) {
                addNodeSubnet(nodeId, ipToSubnet(oneIp));
            }
        }
    });

    // ── Tree-hierarchy layout: position nodes based on parent-child topology ──
    // First build all edges to determine tree structure, then position by tree depth

    // — Custom Nodes (positioned later in tree layout) —
    const visibleCustom = customNodes.filter(cn => !cn.hidden);
    visibleCustom.forEach((cn, i) => {
        const nodeId = `custom-${cn.id}`;
        const customIP = extractPrimaryIP(cn.ip_address);
        const customSubnet = ipToSubnet(customIP);
        nodesMap.set(nodeId, {
            id: nodeId, type: 'custom',
            label: cn.hostname || `Node-${cn.id}`,
            sublabel: cn.ip_address || '',
            position: new Vector3(),
            color: CUSTOM_COLOR, radius: CUSTOM_RADIUS, alive: true, data: cn,
            subnet: customSubnet || undefined,
            ipAddress: customIP || undefined,
        });
        // Custom nodes can also carry multiple IPs (operator-entered hostname
        // pointing at a multi-homed asset). Honor every IP, not just the
        // primary, for subnet-zone membership.
        for (const oneIp of extractAllIPs(cn.ip_address)) {
            addNodeSubnet(nodeId, ipToSubnet(oneIp));
        }
    });

    // — Tree edges, one per child ——————————————————————————————————————
    //
    // Operator-visible rule: **每個 node 永遠只連到上一層 parent**.
    // A child gets *exactly one* incoming edge — the one that claimed
    // its parent slot first. We collapse:
    //   • parallel C2 profiles between the same machine pair (http + tcp
    //     between A and B used to render as two curved bundles — they
    //     now resolve to a single edge),
    //   • skip-level P2P jumps (a child that already has an HTTP route
    //     to core does NOT also get a purple line to some other branch
    //     of the tree — the layout-stability guarantee from
    //     AMPLIFICATION takes precedence over showing the wire),
    //   • duplicate sources (one machine grouping N callbacks all
    //     pointing at the same upstream renders one edge, not N).
    //
    // Pass order matters: the FIRST claim wins.
    //   1. DB non-P2P (canonical C2 routes)
    //   2. Custom-node operator-defined parents
    //   3. Custom edges
    //   4. Focus-link edges
    //   5. Orphan-rescue → core (anything still parentless grounds here)
    //   6. DB P2P (only fills slots nothing else claimed — typically
    //      agents that exist *only* via a P2P link)
    const nodesWithParent = new Set<string>();
    const childrenOf = new Map<string, Set<string>>();
    const parentOf = new Map<string, string>();
    interface ParentEdgeMeta {
        edgeId: string;
        label: string;
        isP2P: boolean;
        color: Color;
    }
    const parentMeta = new Map<string, ParentEdgeMeta>();

    const claimParent = (
        parentId: string,
        childId: string,
        meta: ParentEdgeMeta,
    ): boolean => {
        if (!nodesMap.has(parentId) || !nodesMap.has(childId)) return false;
        if (parentId === childId) return false;
        if (parentOf.has(childId)) return false; // first-claim-wins
        // Cycle guard: the operator can end up with two active P2P edges for
        // the same pair pointing opposite ways (e.g. one auto-added by the
        // agent's `link` command, the other from a manual "Set Parent" with
        // swapped roles). Without this check the second claim would create
        // a back-edge A→B→A; the downstream tree walk's reachesCore guard
        // then correctly detects the cycle and reparents BOTH nodes to
        // `core` — which is the "first-connected TCP node connects to
        // Minerva instead of its parent" bug. Walk the proposed parent's
        // existing ancestor chain; if we'd find `childId` up there, refuse.
        let cursor: string | undefined = parentId;
        const guard = new Set<string>();
        while (cursor && cursor !== 'core' && !guard.has(cursor)) {
            if (cursor === childId) return false; // would close a cycle
            guard.add(cursor);
            cursor = parentOf.get(cursor);
        }
        parentOf.set(childId, parentId);
        parentMeta.set(childId, meta);
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
        childrenOf.get(parentId)!.add(childId);
        nodesWithParent.add(childId);
        return true;
    };

    // The `source` / `destination` columns on `callbackgraphedge` carry
    // *two opposing conventions* depending on who created the row:
    //
    //   • Agent-emitted P2P edges (Apollo's `link.cs`, etc.) put the
    //     *runner* of the link command on `Source` and the new peer on
    //     `Destination`. The runner is the agent that already has the
    //     C2 uplink (typically HTTP to Mythic) — i.e. the topology
    //     parent. The peer is the freshly-deployed bind agent being
    //     tunneled, i.e. the topology child. Apollo even tags the
    //     row with `EdgeDirection.SourceToDestination`, meaning
    //     commands flow `source → destination` ≡ parent → child.
    //
    //   • Mythic UI `Set Parent` (callbackgraphedge_add webhook) and
    //     all our local custom-edge / focus-edge code call the *child*
    //     `source` and the *parent* `destination` — i.e. "this callback
    //     is the source whose parent we're setting to that destination".
    //
    // Both conventions land in the same DB column. We disambiguate by
    // `isP2P`: P2P rows use Apollo's convention, non-P2P rows use the
    // Mythic UI convention. Without this branch, P2P agents end up
    // visualised with their relationship inverted — the C2-having agent
    // gets put *under* its own peer, and any other nodes that were
    // parented to that C2 agent are dragged down by one layer, which is
    // the "数个 p2p node 横向排列在第一层 + 其他节点跨层连接" bug.
    // "Has non-P2P egress" flag per callback id. A callback with a direct C2
    // profile (HTTP / DNS / push C2) reaches Mythic on its own — it's always
    // the upstream side of any P2P link it appears in. Drives the
    // re-orientation logic inside tryClaimDbEdge and the canonical-direction
    // sort that feeds the P2P pass, so the cycle guard never has to rely on
    // edge-row insertion order. Built BEFORE the first tryClaimDbEdge call
    // so the non-P2P pass doesn't accidentally read an undefined map.
    const cbHasNonP2pEgress = new Map<number, boolean>();
    for (const cb of allCallbacks) {
        const profiles: Array<{ c2profile?: { is_p2p?: boolean } | null }> = cb?.callbackc2profiles || [];
        const hasDirect = profiles.some(p => p?.c2profile && p.c2profile.is_p2p === false);
        cbHasNonP2pEgress.set(cb.id, hasDirect);
    }

    const tryClaimDbEdge = (re: typeof rawEdges[number]) => {
        let parentCbId: number, childCbId: number;
        if (re.isP2P) {
            // For P2P, the DB row can have either orientation depending on
            // who wrote it (agent's `link` reports src=parent; Mythic UI's
            // Set Parent action writes src=child). Re-orient from egress —
            // whichever side has a non-P2P (direct C2) profile is upstream
            // and therefore the topology parent. When both or neither has
            // direct egress, fall back to Apollo's convention (src=parent).
            const srcEgress = cbHasNonP2pEgress.get(re.srcCbId) === true;
            const dstEgress = cbHasNonP2pEgress.get(re.dstCbId) === true;
            if (srcEgress && !dstEgress)      { parentCbId = re.srcCbId; childCbId = re.dstCbId; }
            else if (!srcEgress && dstEgress) { parentCbId = re.dstCbId; childCbId = re.srcCbId; }
            else                              { parentCbId = re.srcCbId; childCbId = re.dstCbId; }
        } else {
            // Non-P2P: Mythic UI convention (source = child).
            parentCbId = re.dstCbId;
            childCbId  = re.srcCbId;
        }
        const parentNode = cbIdToNodeId.get(parentCbId);
        const childNode  = cbIdToNodeId.get(childCbId);
        if (!childNode || !parentNode) return;
        claimParent(parentNode, childNode, {
            edgeId: `edge-${re.edgeId}`,
            label: re.c2profile?.name || '',
            isP2P: re.isP2P,
            color: re.isP2P ? EDGE_P2P_COLOR : EDGE_COLOR,
        });
    };
    for (const re of rawEdges) if (!re.isP2P) tryClaimDbEdge(re);

    // 2) Custom node built-in parent links — operator-declared upstream
    //    for custom nodes. Run before custom edges so a custom node's
    //    own `parent_id` wins over a possibly-conflicting custom edge.
    visibleCustom.forEach(cn => {
        const nodeId = `custom-${cn.id}`;
        if (cn.parent_id == null) return;
        let parentId: string | undefined;
        if (cn.parent_type === 'callback') {
            parentId = cbIdToNodeId.get(Number(cn.parent_id));
        } else if (cn.parent_type === 'custom') {
            parentId = `custom-${cn.parent_id}`;
        }
        if (!parentId) return;
        claimParent(parentId, nodeId, {
            edgeId: `ce-${cn.id}-parent`,
            label: cn.c2profile || '',
            isP2P: false,
            color: CUSTOM_COLOR,
        });
    });

    // 3) Custom edges — operator-drawn extra topology.
    customEdges.forEach(ce => {
        const remapId = (raw: string): string => {
            const numId = Number(raw);
            if (!isNaN(numId) && cbIdToNodeId.has(numId)) return cbIdToNodeId.get(numId)!;
            if (nodesMap.has(raw)) return raw;
            return raw;
        };
        const childId = remapId(ce.source);
        const parentId = remapId(ce.target);
        claimParent(parentId, childId, {
            edgeId: `cue-${ce.id}`,
            label: ce.c2profile || '',
            isP2P: false,
            color: CUSTOM_COLOR,
        });
    });

    // 4) Focus link edges (operator's 2D Link Focus parity)
    for (const fe of focusEdges) {
        const remapFocusId = (raw: string): string => {
            const numId = Number(raw);
            if (!isNaN(numId) && cbIdToNodeId.has(numId)) return cbIdToNodeId.get(numId)!;
            if (nodesMap.has(raw)) return raw;
            return raw;
        };
        const childId = remapFocusId(fe.source);
        const parentId = remapFocusId(fe.target);
        claimParent(parentId, childId, {
            edgeId: `focus-${childId}-${parentId}`,
            label: fe.c2profile || '',
            isP2P: false,
            color: EDGE_COLOR,
        });
    }

    // 5) DB P2P edges — claim a tree parent *before* orphan-rescue runs.
    //    Pass order matters here: if we run orphan-rescue first, every
    //    P2P-only agent (typical AMPLIFICATION / link target: an SMB / TCP
    //    bind agent with no HTTP path of its own) gets `core` as its
    //    parent under the first-claim-wins rule, and this P2P pass
    //    silently no-ops — the operator then sees the linked agent
    //    floating under MINERVA core even though the DB has a fresh
    //    `callbackgraphedge` row pointing at its real parent. Moving
    //    this pass ahead of orphan-rescue closes that race.
    //
    //    HTTP-connected agents that pick up an additional P2P link via
    //    AMPLIFICATION are NOT re-parented here — passes 1-4 above
    //    already claimed their HTTP/custom/focus parent slot, and
    //    `claimParent` is first-claim-wins, so the P2P attempt is a
    //    no-op for them. The tree-stability guarantee (no relayout on
    //    link) is preserved.
    // Sort P2P edges by canonical-direction score before iterating so the
    // cycle guard in claimParent always preserves the right direction.
    // The DB can hold two opposing rows for the same pair when both agents
    // independently report the link; without this sort, whichever insertion
    // order Mythic returned would silently decide which side ends up the
    // tree parent. Score per edge (higher = strongly canonical):
    //   +2  src has direct C2 egress, dst does not  → src is clearly upstream
    //   +1  src has direct C2 egress, dst also has  → src still slightly preferred
    //    0  neither has direct egress (deep chain)
    //   -1  dst has direct egress, src does not     → row is inverted; skip first
    // For ties, prefer the lower callback id (older callback acts as parent,
    // matching operator intuition that the first-connected node is closer to root).
    const directionScore = (re: typeof rawEdges[number]): number => {
        // For P2P, Apollo's convention is src=parent. So src having egress means
        // the row's natural direction matches the topology; dst having egress
        // means the row is inverted.
        const srcEgress = cbHasNonP2pEgress.get(re.srcCbId) === true;
        const dstEgress = cbHasNonP2pEgress.get(re.dstCbId) === true;
        if (srcEgress && !dstEgress) return 2;
        if (srcEgress && dstEgress)  return 1;
        if (!srcEgress && dstEgress) return -1;
        return 0;
    };
    const p2pEdges = rawEdges.filter(e => e.isP2P);
    p2pEdges.sort((a, b) => {
        const ds = directionScore(b) - directionScore(a);
        if (ds !== 0) return ds;
        const aMin = Math.min(a.srcCbId, a.dstCbId);
        const bMin = Math.min(b.srcCbId, b.dstCbId);
        return aMin - bMin;
    });
    for (const re of p2pEdges) tryClaimDbEdge(re);

    // 6) Orphan-rescue → core. Every node that *still* doesn't have a
    //    parent (no HTTP, no custom, no focus, no P2P) grounds at MINERVA
    //    core so the operator never sees a floating node.
    //    `disconnectedNodes` arg is kept for backward compat and is no
    //    longer consulted here — operators kept ending up with truly-
    //    isolated rows when an unlink closed a P2P parent.
    const explicitlyDisconnected: string[] = [];
    void disconnectedNodes; // intentionally unused — see comment
    nodesMap.forEach((node, nodeId) => {
        if (nodeId === 'core') return;
        if (nodesWithParent.has(nodeId)) return;
        claimParent('core', nodeId, {
            edgeId: `root-${nodeId}`,
            label: '',
            isP2P: false,
            color: node.type === 'custom' ? CUSTOM_COLOR : EDGE_COLOR,
        });
    });

    // Materialize the one-edge-per-child set.
    parentMeta.forEach((meta, childId) => {
        const parentId = parentOf.get(childId)!;
        topoEdges.push({
            id: meta.edgeId,
            source: parentId,
            target: childId,
            color: meta.color,
            isP2P: meta.isP2P,
            label: meta.label,
        });
    });

    // ── Tidy-tree positioning with subnet-aware sibling sorting ──
    // Step 1: Build subnet groups. Used both as a tie-break when ordering
    // siblings under the same parent, and to draw subnet bounding zones.
    // A node lands in EVERY subnet any of its IPs maps to (see nodeSubnets
    // above), so a multi-homed pivot belongs to both the 10.0.0/24 zone
    // and the 192.0.2.0/24 zone simultaneously and the operator sees both
    // network spaces enclose it.
    const subnetMap = new Map<string, string[]>();
    nodeSubnets.forEach((cidrs, nodeId) => {
        for (const cidr of cidrs) {
            const arr = subnetMap.get(cidr) || [];
            arr.push(nodeId);
            subnetMap.set(cidr, arr);
        }
    });

    // Subnet column order by IP-numeric value. Sorting CIDRs by their 32-bit
    // network address guarantees that IP-adjacent /24s (e.g. 172.16.116/24 and
    // 172.16.117/24) end up as neighbors on screen, regardless of how many
    // cross-subnet edges they share. This matches how operators mentally model
    // the network — adjacent third-octet subnets in the same /16 belong
    // physically next to each other. Unparseable / unknown subnet labels sort
    // last and stable-alpha to keep the order deterministic.
    const subnetNumeric = (cidr: string): number => {
        const m = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)/);
        if (!m) return Number.MAX_SAFE_INTEGER;
        const [, a, b, c, d] = m;
        return ((+a) * 0x1000000 + (+b) * 0x10000 + (+c) * 0x100 + (+d));
    };
    const subnetOrder = Array.from(subnetMap.keys()).sort((a, b) => {
        const diff = subnetNumeric(a) - subnetNumeric(b);
        return diff !== 0 ? diff : a.localeCompare(b);
    });

    const subnetIndex = new Map<string, number>();
    subnetOrder.forEach((s, i) => subnetIndex.set(s, i));
    const subnetRank = (s: string | undefined) =>
        s && subnetIndex.has(s) ? subnetIndex.get(s)! : subnetOrder.length;

    // Step 2: Tidy-tree layout (Reingold–Tilford style).
    //
    //     Why this and not the old lane-based grid:
    //     The previous layout reserved one X-column per subnet across every
    //     depth row. That kept subnet members vertically aligned, but it
    //     forced cross-subnet parent→child edges to slash diagonally across
    //     foreign lanes — and in branchy trees, sibling subtrees ended up
    //     interleaved inside the same lane, making it impossible to tell
    //     which parent owned which child.
    //
    //     A tidy tree fixes both. Each node owns a horizontal footprint equal
    //     to the sum of its children's footprints (leaves = one slot). Every
    //     parent sits centered above its children, every subtree occupies a
    //     contiguous X range, and adjacent subtrees never overlap. That
    //     guarantees zero edge crossings between true tree edges — the only
    //     line crossings left in the scene are real graph cross-links (e.g.
    //     P2P shortcuts, multi-parent links), which is information, not
    //     noise.
    const positioned = new Set<string>();
    const LAYER_SPACING_Z = CHILD_RING_DIST + 1;

    // Build a strict tree from parentOf. Under the one-edge-per-child rule
    // above, parentOf is first-claim-wins, so whatever it holds now is the
    // canonical parent for layout. Any node whose parent chain doesn't
    // ground in 'core' (cycle or dangling) gets reparented to core so the
    // recursive walk terminates.
    const treeChildren = new Map<string, string[]>();
    nodesMap.forEach((_, nodeId) => treeChildren.set(nodeId, []));

    const reachesCore = (id: string): boolean => {
        const seen = new Set<string>();
        let cur: string | undefined = id;
        while (cur && cur !== 'core') {
            if (seen.has(cur)) return false;
            seen.add(cur);
            cur = parentOf.get(cur);
        }
        return cur === 'core';
    };

    nodesMap.forEach((_, nodeId) => {
        if (nodeId === 'core') return;
        let p = parentOf.get(nodeId);
        if (!p || !nodesMap.has(p) || !reachesCore(nodeId)) p = 'core';
        treeChildren.get(p)!.push(nodeId);
    });

    // Sort siblings: same subnet clustered together (so subnet zones stay
    // tight), then by label for a stable order. This is the only place subnet
    // affinity influences layout — it does NOT pin nodes across the tree.
    treeChildren.forEach(kids => {
        kids.sort((a, b) => {
            const sa = subnetRank(nodesMap.get(a)!.subnet);
            const sb = subnetRank(nodesMap.get(b)!.subnet);
            if (sa !== sb) return sa - sb;
            const la = nodesMap.get(a)!.label;
            const lb = nodesMap.get(b)!.label;
            return la.localeCompare(lb);
        });
    });

    // Each leaf reserves SLOT horizontal width; an inner node's subtree width
    // is the sum of its children's widths (no extra gap — adjacent leaves end
    // up exactly NODE_SPACING apart center-to-center, which matches what the
    // old grid layout produced for densely packed rows).
    const SLOT = NODE_SPACING;
    const subtreeWidth = new Map<string, number>();
    const computeWidth = (id: string): number => {
        const kids = treeChildren.get(id) || [];
        let w: number;
        if (kids.length === 0) {
            w = SLOT;
        } else {
            w = 0;
            for (const k of kids) w += computeWidth(k);
        }
        subtreeWidth.set(id, w);
        return w;
    };
    computeWidth('core');

    // Place each node at the center of its allotted footprint, walking depth
    // first. Inner nodes get re-centered on the midpoint of their first and
    // last child so the parent visually sits directly above its subtree.
    const placeNode = (id: string, leftX: number, depth: number): void => {
        const w = subtreeWidth.get(id) ?? SLOT;
        const kids = treeChildren.get(id) || [];
        const z = id === 'core' ? -MIN_CORE_DIST : depth * LAYER_SPACING_Z;

        if (kids.length === 0) {
            nodesMap.get(id)!.position.set(leftX + w / 2, 0, z);
            positioned.add(id);
            return;
        }

        let cursor = leftX;
        let firstCenter = 0;
        let lastCenter = 0;
        for (let i = 0; i < kids.length; i++) {
            const cw = subtreeWidth.get(kids[i]) ?? SLOT;
            placeNode(kids[i], cursor, depth + 1);
            const cx = nodesMap.get(kids[i])!.position.x;
            if (i === 0) firstCenter = cx;
            if (i === kids.length - 1) lastCenter = cx;
            cursor += cw;
        }

        const centerX = (firstCenter + lastCenter) / 2;
        nodesMap.get(id)!.position.set(centerX, 0, z);
        positioned.add(id);
    };

    const rootWidth = subtreeWidth.get('core') ?? SLOT;
    placeNode('core', -rootWidth / 2, 0);

    // Park explicitly-disconnected nodes in a dedicated zone off to the right
    // of the main tree. They have no edges, so the tree layout never touches
    // them; positioning them deterministically keeps them visible (rather
    // than stacked at the origin) without implying any topology relation.
    if (explicitlyDisconnected.length > 0) {
        const treeMaxX = (() => {
            let max = 0;
            nodesMap.forEach(n => {
                if (positioned.has(n.id)) max = Math.max(max, n.position.x);
            });
            return max;
        })();
        const ZONE_GAP = NODE_SPACING * 2.5;
        const COLUMN_SPACING = NODE_SPACING;
        const ROW_SPACING = NODE_SPACING * 0.9;
        const COLS = 3;
        const baseX = treeMaxX + ZONE_GAP;
        explicitlyDisconnected
            .slice()
            .sort((a, b) => (nodesMap.get(a)!.label).localeCompare(nodesMap.get(b)!.label))
            .forEach((nodeId, i) => {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const node = nodesMap.get(nodeId)!;
                node.position.set(
                    baseX + col * COLUMN_SPACING,
                    row * -ROW_SPACING,
                    -MIN_CORE_DIST,
                );
                positioned.add(nodeId);
            });
    }

    // — Subnet Zones —
    // The tidy tree may scatter a subnet across non-adjacent subtrees, so the
    // merged AABB strategy will frequently fail the "no foreign node inside"
    // check and fall back to per-row volumes. That fallback is the common path
    // now; the merged AABB still wins when every member of a subnet happens to
    // live inside a single contiguous subtree.
    const subnets: SubnetZone[] = [];
    const PAD_XY = SUBNET_PADDING;
    const PAD_Z  = Math.min(SUBNET_PADDING, LAYER_SPACING_Z * 0.25); // ≤25% of layer gap

    subnetMap.forEach((nodeIds, cidr) => {
        if (nodeIds.length < 2) return;

        const ownSet = new Set(nodeIds);
        const members: TopoNode[] = nodeIds
            .map(id => nodesMap.get(id))
            .filter((n): n is TopoNode => !!n);
        if (members.length < 2) return;

        // Candidate merged AABB across all rows
        const mMin = new Vector3(Infinity, Infinity, Infinity);
        const mMax = new Vector3(-Infinity, -Infinity, -Infinity);
        members.forEach(n => { mMin.min(n.position); mMax.max(n.position); });

        const mergedMinX = mMin.x - PAD_XY;
        const mergedMaxX = mMax.x + PAD_XY;
        const mergedMinY = mMin.y - PAD_XY;
        const mergedMaxY = mMax.y + PAD_XY;
        const mergedMinZ = mMin.z - PAD_Z;
        const mergedMaxZ = mMax.z + PAD_Z;

        // Is any foreign-subnet node inside the merged volume?
        let mergeSafe = true;
        for (const [otherId, otherNode] of nodesMap) {
            if (ownSet.has(otherId)) continue;
            if (otherId === 'core') continue;
            const p = otherNode.position;
            if (
                p.x >= mergedMinX && p.x <= mergedMaxX &&
                p.y >= mergedMinY && p.y <= mergedMaxY &&
                p.z >= mergedMinZ && p.z <= mergedMaxZ
            ) {
                mergeSafe = false;
                break;
            }
        }

        if (mergeSafe) {
            const center = new Vector3(
                (mergedMinX + mergedMaxX) / 2,
                (mergedMinY + mergedMaxY) / 2,
                (mergedMinZ + mergedMaxZ) / 2,
            );
            const size = new Vector3(
                Math.max(mergedMaxX - mergedMinX, 3),
                Math.max(mergedMaxY - mergedMinY, 3),
                Math.max(mergedMaxZ - mergedMinZ, 1.5),
            );
            subnets.push({
                cidr,
                center,
                size,
                nodeIds: members.map(n => n.id),
            });
            return;
        }

        // Fallback: per-row volumes. Tidy-tree may split a subnet across
        // sibling subtrees, so the merged AABB would engulf a foreign node;
        // emit one zone per depth row instead.
        const byZ = new Map<number, TopoNode[]>();
        for (const node of members) {
            const z = node.position.z;
            const arr = byZ.get(z) || [];
            arr.push(node);
            byZ.set(z, arr);
        }

        byZ.forEach(rowMembers => {
            const positions = rowMembers.map(n => n.position);
            const min = new Vector3(Infinity, Infinity, Infinity);
            const max = new Vector3(-Infinity, -Infinity, -Infinity);
            positions.forEach(p => { min.min(p); max.max(p); });

            const center = new Vector3().addVectors(min, max).multiplyScalar(0.5);
            const size = new Vector3(
                max.x - min.x + PAD_XY * 2,
                max.y - min.y + PAD_XY * 2,
                max.z - min.z + PAD_Z * 2,
            );
            size.x = Math.max(size.x, 3);
            size.y = Math.max(size.y, 3);
            size.z = Math.max(size.z, 1.5);

            subnets.push({
                cidr,
                center,
                size,
                nodeIds: rowMembers.map(n => n.id),
            });
        });
    });

    // One-edge-per-child means every pair has exactly one straight line —
    // no bundle fan-out needed. Leave the fields explicit so the renderer
    // (which still reads bundleIndex/bundleCount) doesn't fan curves.
    const visibleEdges = topoEdges.filter(e => nodesMap.has(e.source) && nodesMap.has(e.target));
    for (const e of visibleEdges) {
        e.bundleIndex = 0;
        e.bundleCount = 1;
    }

    return {
        nodes: Array.from(nodesMap.values()),
        edges: visibleEdges,
        subnets,
    };
}

// ═══════════════════════════════════════════════
//  3D Components
// ═══════════════════════════════════════════════

/** Geometric minimalist self-luminous node */
