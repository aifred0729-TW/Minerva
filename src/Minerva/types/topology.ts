// ═══════════════════════════════════════════════
//  3D Topology domain types
// ═══════════════════════════════════════════════
import { Color, Vector3 } from 'three';
import type { QuickHackDef } from '../lib/quickhacks';
import type { Callback } from './callbacks';

/**
 * Data payload carried by a topology node.
 * Stores a raw Callback object (type==='callback'), CustomGraphNode (type==='custom'), or null (core).
 * Properties from both Callback and CustomGraphNode are listed for type-safe access;
 * the index signature covers any additional dynamic properties.
 */
export interface TopoNodeData {
    // ── Shared / Callback properties ──
    id?: number;
    display_id?: number;
    host?: string;
    user?: string;
    ip?: string;
    os?: string;
    domain?: string;
    architecture?: string;
    description?: string;
    locked?: boolean;
    active?: boolean;
    dead?: boolean;
    integrity_level?: number;
    pid?: number;
    sleep_info?: string;
    last_checkin?: string;
    init_callback?: string;
    process_name?: string;
    process_short_name?: string;
    external_ip?: string;
    extra_info?: string;
    payload?: { payloadtype: { name: string; agent_type?: string } };
    callbackc2profiles?: Array<{ c2profile: { name: string; is_p2p: boolean } }>;
    callbackports?: Array<Record<string, unknown>>;
    color?: string;
    // ── CustomGraphNode properties ──
    hostname?: string;
    ip_address?: string;
    operating_system?: string;
    username?: string;
    db_id?: number;
    hidden?: boolean;
    c2profile?: string;
    parent_id?: number | string;
    parent_type?: 'callback' | 'custom';
    timestamp?: string;
    // ── Extended / runtime properties ──
    isCustom?: boolean;
    callback_id?: number;
    _edgeActive?: boolean;
    /** Index signature for any other dynamic properties */
    [key: string]: unknown;
}

export interface TopoNode {
    id: string;
    type: 'core' | 'callback' | 'custom';
    label: string;
    sublabel: string;
    position: Vector3;
    color: Color;
    radius: number;
    alive: boolean;
    data: TopoNodeData | null;
    allCallbacks?: Callback[];
    subnet?: string;
    callbackCount?: number;
    callbackIds?: number[];
    osLabel?: string;
    privilege?: string;
    ipAddress?: string;
}

export interface TopoEdge {
    id: string;
    source: string;
    target: string;
    color: Color;
    isP2P: boolean;
    label: string;
    /**
     * Position within an edge "bundle" — the set of TopoEdges that
     * share the same undirected node pair. Used by the renderer to
     * fan parallel edges out into perpendicular bezier curves so a
     * node hosting multiple C2 profiles (e.g. http + tcp) doesn't
     * draw both lines on top of each other.
     */
    bundleIndex?: number;
    bundleCount?: number;
}

export interface SubnetZone {
    cidr: string;
    center: Vector3;
    size: Vector3;
    nodeIds: string[];
}

export interface QuickHackExecution {
    hack: QuickHackDef;
    callbackId: number;
    callbackDisplayId: number;
    callbackHost: string;
    /**
     * Lowercased agent type derived from the target node's payload type at
     * launch time. Used to pick the right variant from `hack.agentSteps`
     * and to dispatch `minerva://` client-side actions.
     */
    agentType?: string;
    /** Reference to the live Callback object (or custom node data); used by `minerva://` action handlers. */
    callback?: any;
    taskId: number | null;
    phase: 'awaiting_input' | 'uploading' | 'processing' | 'completed' | 'error' | 'timeout';
    progress: number;
    startTime: number;
    errorMsg?: string;
    nodePosition: Vector3;
    execId: string;
    variableValues: Record<string, string>;
    currentStep: number;
    totalSteps: number;
}
