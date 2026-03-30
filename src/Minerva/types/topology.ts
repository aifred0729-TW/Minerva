// ═══════════════════════════════════════════════
//  3D Topology domain types
// ═══════════════════════════════════════════════
import * as THREE from 'three';
import type { QuickHackDef } from '../lib/quickhacks';
import type { Callback } from './callbacks';

/** Data payload carried by a topology node */
export interface TopoNodeData {
    /** Callback data (when type === 'callback') */
    callback?: Callback;
    /** Custom node data (when type === 'custom') */
    customNode?: {
        id: number;
        host: string;
        ip: string;
        os: string;
        description: string;
    };
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
    data: TopoNodeData;
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
