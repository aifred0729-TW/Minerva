import ELK from 'elkjs/lib/elk.bundled.js';
import { Node, Edge } from '@xyflow/react';
import { CyberNode, RootNode, GroupBoundNode, TaskNode, BrowserscriptNode, BsCallbackNode } from './nodes';
import { PulseEdge, C2LabelEdge } from './edges';

export const nodeTypes = {
    custom: CyberNode,
    root: RootNode,
    groupBound: GroupBoundNode,
    taskNode: TaskNode,
    browserscriptNode: BrowserscriptNode,
    bsCallbackNode: BsCallbackNode,
};

export const edgeTypes = {
    pulse: PulseEdge,
    c2label: C2LabelEdge,
};

// Layout constants for beautiful node arrangement (horizontal left-to-right)
export const LAYOUT = {
    ROOT_X: 100,                   // Root node X position (left side)
    LEVEL_SPACING: 300,            // Horizontal spacing between levels
    NODE_HEIGHT: 150,              // Vertical spacing between nodes in same level
    CENTER_Y: 400,                 // Center Y position
    MAX_PER_COLUMN: 10,            // Maximum nodes per column before wrapping
};

// Improved tree layout function - horizontal left-to-right
// Edge direction (after swap): source (parent) → target (child)
// Parent is at lower level (left), child is at higher level (right)
// ELK instance (singleton to avoid repeated instantiation)
export const elk = new ELK();

// ELK-powered async layout — replaces BFS layout for smarter hierarchical positioning
export const getElkLayoutedElements = async (nodes: Node[], edges: Edge[], dir: 'LR' | 'TB' = 'LR'): Promise<{ nodes: Node[]; edges: Edge[] }> => {
    if (nodes.length === 0) return { nodes, edges };

    const elkDirection = dir === 'LR' ? 'RIGHT' : 'DOWN';

    // Build ELK graph — root gets a larger size, others standard callback node size
    const elkNodes = nodes.map(n => ({
        id: n.id,
        width: n.id === 'root' ? 140 : n.type === 'groupBound' ? 200 : 270,
        height: n.id === 'root' ? 140 : n.type === 'groupBound' ? 100 : 85,
    }));

    const nodeIdSet = new Set(nodes.map(n => n.id));
    // Only include edges where both endpoints exist in current node set
    const elkEdges = edges
        .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
        .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }));

    const elkGraph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': elkDirection,
            'elk.layered.spacing.nodeNodeBetweenLayers': '280',
            'elk.spacing.nodeNode': '120',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.edgeRouting': 'POLYLINE',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        },
        children: elkNodes,
        edges: elkEdges,
    };

    try {
        const result = await elk.layout(elkGraph);
        const posMap = new Map<string, { x: number; y: number }>();
        (result.children || []).forEach((n: any) => {
            posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        });

        const layoutedNodes = nodes.map(n => ({
            ...n,
            position: posMap.get(n.id) ?? n.position,
        }));

        return { nodes: layoutedNodes, edges };
    } catch (err) {
        console.warn('[CallbackGraph] ELK layout failed, using fallback BFS layout:', err);
        return getLayoutedElements(nodes, edges, dir);
    }
};

// Legacy BFS layout — kept as ELK fallback
export const getLayoutedElements = (nodes: Node[], edges: Edge[], dir: 'LR' | 'TB' = 'LR') => {
    // 1. Find root node
    const root = nodes.find(n => n.id === 'root');
    if (!root) return { nodes, edges };

    // Build set of all actual node IDs in this graph
    const nodeIds = new Set(nodes.map(n => n.id));

    // Build parent map from edges — ONLY where both endpoints are actual graph nodes.
    // Edges referencing invisible/phantom nodes are ignored to prevent incorrect levels.
    // Edge direction (after swap): source (parent) → target (child)
    // Custom edges OVERRIDE database edges so manual connections take priority
    const parentMap = new Map<string, string>();
    
    // First pass: database edges only (lower priority)
    edges.forEach(edge => {
        if (edge.id.startsWith('root-')) return;
        // Skip custom edges in first pass
        if (edge.id.startsWith('custom-edge-') || edge.id.startsWith('callback-')) return;
        // Only consider edges where BOTH endpoints are real graph nodes
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
        if (!parentMap.has(edge.target)) {
            parentMap.set(edge.target, edge.source);
        }
    });
    
    // Second pass: custom edges OVERRIDE any existing database parents
    edges.forEach(edge => {
        if (edge.id.startsWith('root-')) return;
        if (!edge.id.startsWith('custom-edge-') && !edge.id.startsWith('callback-')) return;
        // Only consider edges where BOTH endpoints are real graph nodes
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
        // Override - custom edges always take priority
        parentMap.set(edge.target, edge.source);
    });

    // Calculate levels using BFS from root for correct tree depth.
    const levels = new Map<string, number>();
    levels.set('root', 0);

    const childrenMap = new Map<string, string[]>();
    parentMap.forEach((parent, child) => {
        if (!childrenMap.has(parent)) childrenMap.set(parent, []);
        childrenMap.get(parent)!.push(child);
    });

    edges.forEach(edge => {
        if (edge.id.startsWith('root-') && nodeIds.has(edge.target)) {
            if (!parentMap.has(edge.target)) {
                if (!childrenMap.has('root')) childrenMap.set('root', []);
                childrenMap.get('root')!.push(edge.target);
            }
        }
    });

    const queue: string[] = ['root'];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLevel = levels.get(current) ?? 0;
        const children = childrenMap.get(current) || [];
        for (const child of children) {
            if (!levels.has(child)) {
                levels.set(child, currentLevel + 1);
                queue.push(child);
            }
        }
    }

    nodes.forEach(node => {
        if (!levels.has(node.id)) {
            levels.set(node.id, 1);
        }
    });

    const nodesByLevel = new Map<number, Node[]>();
    nodes.forEach(node => {
        const level = levels.get(node.id) ?? 1;
        if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
        nodesByLevel.get(level)!.push(node);
    });

    const layoutedNodes = nodes.map(node => {
        if (node.id === 'root') {
            return { ...node, position: { x: LAYOUT.ROOT_X, y: LAYOUT.CENTER_Y } };
        }
        
        const level = levels.get(node.id) ?? 1;
        const levelNodes = nodesByLevel.get(level) || [];
        levelNodes.sort((a, b) => a.id.localeCompare(b.id));
        const nodeIndex = levelNodes.findIndex(n => n.id === node.id);
        const basePos = LAYOUT.ROOT_X + level * LAYOUT.LEVEL_SPACING;
        const nodesInLevel = levelNodes.length;
        const columnCount = Math.ceil(nodesInLevel / LAYOUT.MAX_PER_COLUMN);
        const currentColumn = Math.floor(nodeIndex / LAYOUT.MAX_PER_COLUMN);
        const nodesInCurrentColumn = currentColumn === columnCount - 1 
            ? nodesInLevel % LAYOUT.MAX_PER_COLUMN || LAYOUT.MAX_PER_COLUMN
            : LAYOUT.MAX_PER_COLUMN;
        const indexInColumn = nodeIndex % LAYOUT.MAX_PER_COLUMN;
        const totalColumnHeight = (nodesInCurrentColumn - 1) * LAYOUT.NODE_HEIGHT;
        const startCross = LAYOUT.CENTER_Y - totalColumnHeight / 2;
        const crossPos = startCross + indexInColumn * LAYOUT.NODE_HEIGHT;
        const colOffset = currentColumn * LAYOUT.LEVEL_SPACING;
        
        return { ...node, position: { x: dir === 'TB' ? crossPos : basePos + colOffset, y: dir === 'TB' ? basePos : crossPos } };
    });

    return { nodes: layoutedNodes, edges };
};

