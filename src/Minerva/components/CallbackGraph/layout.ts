import ELK from 'elkjs/lib/elk-api.js';
import ELKBundled from 'elkjs/lib/elk.bundled.js';
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
/**
 * ELK in a REAL web worker.
 *
 * `elk.bundled.js` + `new ELK()` selects elkjs's *fake* worker, whose
 * postMessage is a setTimeout(…, 0) that runs the layout in-process. `await`
 * there is a macrotask boundary, not concurrency: the layout still blocks the
 * main thread, and the operator's UI freezes for its whole duration.
 *
 * That was survivable only while CallbackGraph was accidentally capped at 50
 * nodes by the `$limit: Int = 50` document default. Lifting that cap (so the
 * graph stops hiding most of the operation) puts the real node count through
 * ELK — 206 callbacks / 243 edges on this instance — with BRANDES_KOEPF and
 * LAYER_SWEEP, which is exactly the case that measured 583 ms median and a
 * 1,248 ms event-loop stall.
 *
 * webpack 5 understands `new Worker(new URL(...))` natively, and the elk-api
 * promise surface is identical, so no consumer changes.
 */
const createWorkerElk = () => new ELK({
    workerFactory: () => new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)),
});

/**
 * Worker if we can get one, in-process ELK if we cannot.
 *
 * The fallback is not defensive padding: a browser that refuses the worker
 * (blob/worker CSP, an ancient engine) would otherwise leave the graph unable to
 * lay out at all. Degrading to the previous main-thread behaviour is strictly
 * better than a blank canvas, and it keeps this change from being able to make
 * anything worse than it already was.
 */
/** Minimal shape of what ELK hands back — enough for the consumer below. */
interface ElkLayoutResult {
    children?: { id: string; x?: number; y?: number; width?: number; height?: number }[];
}
interface ElkFacade { layout: (graph: unknown) => Promise<ElkLayoutResult>; }

export const elk: ElkFacade = (() => {
    try {
        return createWorkerElk() as unknown as ElkFacade;
    } catch (err) {
        console.warn('[Minerva] ELK web worker unavailable — falling back to main-thread layout.', err);
        return new ELKBundled() as unknown as ElkFacade;
    }
})();

/**
 * Ceiling on the aspect-fill stretch below.
 *
 * Without it a two-layer topology in a very wide panel would pull its layers
 * kilometres apart chasing the target ratio, and the operator would be reading
 * a pair of nodes joined by an edge with no visible middle.
 */
const MAX_LAYER_STRETCH = 2.4;

/**
 * Spread the layers to match the box the tree has to live in.
 *
 * ELK lays out for a square-ish world. This panel is not square — it is a wide,
 * short band, roughly 4:1 — and a right-directed tree of three layers comes out
 * near 2.5:1. The camera then fits on HEIGHT, and the difference shows up as two
 * columns of dead black either side, nearly half the panel, with the topology
 * reading as a small clump instead of as the operation.
 *
 * The only free variable is the gap between layers: node boxes are a fixed size
 * and moving them apart never resizes them. So solve for the gap growth that
 * lands the bounding box on the target ratio. `span` is the distance the last
 * layer's LEFT edge travels — the widest box's own width rides along at the end
 * and must come out of the target before dividing, or the tree overshoots.
 *
 * Never compresses. In a tall, narrow box ELK's own spacing is already the right
 * answer, and pulling layers together would start overlapping the C2 edge labels.
 */
const stretchLayersToAspect = (
    children: { id: string; x?: number; y?: number; width?: number; height?: number }[],
    targetAspect: number,
): number => {
    if (children.length < 2 || !Number.isFinite(targetAspect) || targetAspect <= 0) return 1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, widest = 0;
    for (const n of children) {
        const x = n.x ?? 0, y = n.y ?? 0, w = n.width ?? 0, h = n.height ?? 0;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y + h);
        widest = Math.max(widest, w);
    }
    const bw = maxX - minX, bh = maxY - minY;
    if (bw <= 0 || bh <= 0 || bw / bh >= targetAspect) return 1;
    const span = bw - widest;
    if (span <= 1) return 1;
    const stretch = (bh * targetAspect - widest) / span;
    return Math.max(1, Math.min(MAX_LAYER_STRETCH, stretch));
};

// ELK-powered async layout — replaces BFS layout for smarter hierarchical positioning
export const getElkLayoutedElements = async (
    nodes: Node[],
    edges: Edge[],
    dir: 'LR' | 'TB' = 'LR',
    /** width/height of the box this will be framed in, when it is known. */
    targetAspect?: number,
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
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
        const children = result.children || [];
        // Only the RIGHT-directed tree stacks its layers along x; in DOWN mode
        // the layers run vertically and stretching x would just smear the rows.
        const stretch = dir === 'LR' && targetAspect ? stretchLayersToAspect(children, targetAspect) : 1;
        const originX = children.reduce((mn, n) => Math.min(mn, n.x ?? 0), Infinity);
        const posMap = new Map<string, { x: number; y: number }>();
        children.forEach((n) => {
            const x = n.x ?? 0;
            posMap.set(n.id, { x: originX + (x - originX) * stretch, y: n.y ?? 0 });
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

