// ═══════════════════════════════════════════════
//  3D Topology domain types
// ═══════════════════════════════════════════════
import * as THREE from 'three';
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
    position: THREE.Vector3;
    color: THREE.Color;
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
    color: THREE.Color;
    isP2P: boolean;
    label: string;
}

export interface SubnetZone {
    cidr: string;
    center: THREE.Vector3;
    size: THREE.Vector3;
    nodeIds: string[];
}

export interface QuickHackExecution {
    hack: QuickHackDef;
    callbackId: number;
    callbackDisplayId: number;
    callbackHost: string;
    taskId: number | null;
    phase: 'awaiting_input' | 'uploading' | 'processing' | 'completed' | 'error' | 'timeout';
    progress: number;
    startTime: number;
    errorMsg?: string;
    nodePosition: THREE.Vector3;
    execId: string;
    variableValues: Record<string, string>;
    currentStep: number;
    totalSteps: number;
}
