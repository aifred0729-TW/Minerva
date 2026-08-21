/**
 * Dashboard layout — a tree of splits.
 *
 * The page is a tree. A split arranges its children along one axis ('h' side by
 * side, 'v' stacked) and a panel is a leaf. Nesting is unbounded: a column of a
 * row can hold another row, whose columns can hold further rows, for as long as
 * the operator keeps dividing.
 *
 * The model used to be exactly two levels — row → column → panel — and that
 * covered the common arrangements and nothing else. The moment one half of a
 * row wanted its own two-across arrangement there was no shape in the model to
 * say it, and the answer could only ever be "add a third level", then a fourth.
 * A tree ends that: every operation below is defined on a NODE rather than on a
 * (row, column, item) triple, so depth costs nothing and each new level is not
 * another set of index arithmetic to get wrong.
 *
 * Width is a share of the parent row; height is the content's, or a number the
 * operator pins on a card. That asymmetry is deliberate and predates the tree:
 * this is a page that scrolls, not a viewport-filling app, so making height
 * proportional too would squeeze panels rather than let the page grow.
 *
 * Everything here is pure. The React page owns the DOM and the storage; this
 * module owns the shape, which is what makes the shape testable.
 */

// ── Panel catalogue ─────────────────────────────────────────────────────────
//
// Fourteen panels, down from sixteen. The cut was not for tidiness — six of the
// old panels were the same information in a second shape (two task streams, the
// same command ranking computed twice, callbacks faceted by host and again by
// user). Reading the same number three times in three shapes is not three
// pieces of information; it is one piece and two chances to misread it.
export type WidgetKey =
    | 'kpiStrip'
    | 'tempo'
    | 'taskPipeline'
    | 'operation'
    | 'c2Matrix'
    | 'callbackSurface'
    | 'activityStream'
    | 'assetStrip'
    | 'recentPayloads'
    | 'attention'
    | 'alerts'
    | 'footprint'
    | 'reach'
    | 'tradecraft';

export interface WidgetDef {
    key: WidgetKey;
    label: string;
}

export const ALL_WIDGETS: WidgetDef[] = [
    { key: 'kpiStrip', label: 'Headline numbers' },
    { key: 'tempo', label: 'Operation tempo' },
    { key: 'taskPipeline', label: 'Task pipeline' },
    { key: 'operation', label: 'Operation' },
    { key: 'c2Matrix', label: 'C2 infrastructure' },
    { key: 'callbackSurface', label: 'Callback surface' },
    { key: 'activityStream', label: 'Activity stream' },
    { key: 'assetStrip', label: 'Asset collection' },
    { key: 'recentPayloads', label: 'Recent payloads' },
    { key: 'attention', label: 'Attention required' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'footprint', label: 'Footprint' },
    { key: 'reach', label: 'Reach' },
    { key: 'tradecraft', label: 'Tradecraft' },
];

const WIDGET_KEYS = new Set<string>(ALL_WIDGETS.map(w => w.key));

export const isWidgetKey = (v: unknown): v is WidgetKey => typeof v === 'string' && WIDGET_KEYS.has(v);
export const labelOf = (key: WidgetKey): string => ALL_WIDGETS.find(w => w.key === key)?.label ?? key;

// ── Geometry constants ──────────────────────────────────────────────────────

/**
 * Widths are shares of twelve rather than free pixels, at every level of the
 * tree. Twelfths are what let panel edges line up between sibling rows instead
 * of landing a pixel or two apart, which is most of what separates a composed
 * dashboard from a pile of boxes.
 */
export const GRID_COLS = 12;
/** Narrower than this and a panel's header strip stops being readable. */
export const MIN_SPAN = 2;
/** Below this a panel has room for its header strip and nothing else. */
export const MIN_HEIGHT = 160;

// ── Node types ──────────────────────────────────────────────────────────────

export type Axis = 'h' | 'v';
export type Side = 'left' | 'right' | 'top' | 'bottom';

export const axisOf = (side: Side): Axis => (side === 'left' || side === 'right' ? 'h' : 'v');
const isAfter = (side: Side) => side === 'right' || side === 'bottom';

/**
 * A panel. `size` is its share of the parent row's width and is meaningless
 * inside a column; `h` is an explicit pixel height, or null to take the
 * content's height and share whatever slack the column has.
 *
 * `id` is the widget key. A widget appears at most ONCE in a layout — the drop
 * model addresses targets by the key of the panel under the pointer, which is
 * what makes it immune to the reshaping a move causes, and that only works if a
 * key names exactly one panel. `parseLayout` enforces it.
 */
export type PanelNode = { t: 'p'; id: string; key: WidgetKey; size: number; h: number | null };

/**
 * A split. `size` is its share of the parent row's width, exactly as a panel's.
 *
 * Split ids are generated, never stored: they exist so a move can name "the
 * column I am leaving" for one operation, and nothing outside a session needs
 * to refer to them.
 */
export type SplitNode = { t: 's'; id: string; dir: Axis; size: number; kids: LayoutNode[] };

export type LayoutNode = PanelNode | SplitNode;

/** The whole layout: always a vertical split, whose children are the page's rows. */
export type Layout = SplitNode;

let seq = 0;
const nextId = () => `s${++seq}`;

export const panel = (key: WidgetKey, size: number = GRID_COLS, h: number | null = null): PanelNode =>
    ({ t: 'p', id: key, key, size, h });

export const split = (dir: Axis, kids: LayoutNode[], size: number = GRID_COLS): SplitNode =>
    ({ t: 's', id: nextId(), dir, size, kids });

/** Every widget in a subtree, in reading order. */
export function keysOf(node: LayoutNode): WidgetKey[] {
    return node.t === 'p' ? [node.key] : node.kids.flatMap(keysOf);
}

/**
 * A React key for a node: its widget membership, not its position.
 *
 * Keying on order means an arrow-key move rebuilds every element after the
 * moved one — losing scroll positions, chart hover state, the focus on the
 * button the operator just pressed, and restarting every interval inside.
 * Membership is unique because a widget appears once, and it survives both a
 * reorder and a column turning into a row.
 */
export const reactKeyOf = (node: LayoutNode): string =>
    node.t === 'p' ? node.key : [...keysOf(node)].sort().join('|');

// ── Canonical form ──────────────────────────────────────────────────────────

/**
 * The narrowest a child of an n-wide row may be.
 *
 * Normally MIN_SPAN — below a sixth of the row a panel's header strip stops
 * being readable. But a row CAN hold more children than that allows, because
 * nothing caps how many times an operator divides a row, and there MIN_SPAN is
 * wider than an even share. Holding the floor at MIN_SPAN in that case is a
 * trap: every child is already under it, so the resize clamp inverts, refuses
 * every drag in both directions, and the row can only be repaired by moving
 * panels out of it. Half an even share keeps a row resizable at any width.
 */
export const floorFor = (n: number): number => Math.min(MIN_SPAN, GRID_COLS / (2 * Math.max(1, n)));

/**
 * Force one split's children to sum to GRID_COLS, respecting that floor.
 *
 * Sizes are CONTINUOUS, not whole columns. They started as whole columns so
 * edges would line up, but whole columns are exactly what a drag feels as
 * notches — the panel sat still while the pointer crossed a twelfth of the
 * screen, then jumped. Alignment was the rationale; the notch was the
 * operator's experience of it, and the notch wins. Rounding happens only when
 * writing to storage.
 */
export function normaliseSizes(kids: LayoutNode[]): LayoutNode[] {
    if (kids.length === 0) return kids;
    const floor = floorFor(kids.length);
    const floored = kids.map(k => ({
        ...k,
        size: Math.max(floor, Number.isFinite(k.size) && k.size > 0 ? k.size : floor),
    }));
    const total = floored.reduce((n, k) => n + k.size, 0);
    // A non-finite total makes every ratio below NaN or 0. `readNode` clamps
    // sizes so storage cannot reach this, but a caller building nodes directly
    // still can, and the failure is silent and permanent once saved.
    if (!Number.isFinite(total)) return floored.map(k => ({ ...k, size: GRID_COLS / kids.length }));
    if (Math.abs(total - GRID_COLS) < 1e-6) return floored;
    // Scale proportionally rather than nudging one child at a time: a float size
    // has no "off by one" to walk off, and scaling keeps the operator's chosen
    // ratios intact instead of quietly favouring whichever child is widest.
    const slack = total - kids.length * floor;
    const target = GRID_COLS - kids.length * floor;
    if (slack <= 1e-6 || target <= 0) return floored.map(k => ({ ...k, size: GRID_COLS / kids.length }));
    return floored.map(k => ({ ...k, size: floor + (k.size - floor) * (target / slack) }));
}

/**
 * Put a subtree back into canonical form. Returns null if nothing is left.
 *
 * Three rules, and every mutation below relies on all three:
 *
 *   - a split with no children disappears;
 *   - a split with one child IS that child, standing in the space the split
 *     held — otherwise every removal leaves a wrapper behind and the tree
 *     silently grows a layer per edit;
 *   - a split absorbs any child split of the same axis, because two nested rows
 *     ARE one row, and leaving the wrapper gives the operator a divider that
 *     moves two panels at once for no visible reason.
 *
 * Without canonicalisation the tree still renders — it just accumulates
 * structure the operator never asked for and cannot see, and every subsequent
 * drag lands somewhere slightly surprising.
 */
export function canon(node: LayoutNode): LayoutNode | null {
    if (node.t === 'p') return node;
    const kids: LayoutNode[] = [];
    for (const raw of node.kids) {
        const k = canon(raw);
        if (!k) continue;
        if (k.t === 's' && k.dir === node.dir) {
            // Absorbed children keep their proportions: each grandchild's share
            // of the child scales down to the child's share of this split.
            const scale = k.size / GRID_COLS;
            for (const g of k.kids) kids.push({ ...g, size: g.size * scale });
        } else {
            kids.push(k);
        }
    }
    if (kids.length === 0) return null;
    if (kids.length === 1) return { ...kids[0], size: node.size };
    return {
        ...node,
        kids: node.dir === 'h'
            ? normaliseSizes(kids)
            // A column's children have no width of their own — they are as wide
            // as the column. Stating it keeps a node's `size` meaning exactly
            // one thing wherever it is read.
            : kids.map(k => (k.size === GRID_COLS ? k : { ...k, size: GRID_COLS })),
    };
}

/** Canonicalise, and guarantee the result is still a vertical root of rows. */
export function canonRoot(root: SplitNode): Layout {
    const c = canon(root);
    if (!c) return split('v', []);
    if (c.t === 's' && c.dir === 'v') return c.size === GRID_COLS ? c : { ...c, size: GRID_COLS };
    return split('v', [{ ...c, size: GRID_COLS }]);
}

// ── Lookup ──────────────────────────────────────────────────────────────────

/** One step of a path: the split, and which of its children the path went into. */
export type Step = { split: SplitNode; index: number };

/**
 * The chain of splits from the root down to `id`'s parent, or null.
 *
 * Everything positional is derived from this rather than stored, which is why a
 * reshaped tree needs no index fixups anywhere else in the file.
 */
export function locate(root: SplitNode, id: string): Step[] | null {
    const walk = (node: SplitNode, chain: Step[]): Step[] | null => {
        for (let i = 0; i < node.kids.length; i++) {
            const k = node.kids[i];
            const here = [...chain, { split: node, index: i }];
            if (k.id === id) return here;
            if (k.t === 's') {
                const found = walk(k, here);
                if (found) return found;
            }
        }
        return null;
    };
    return walk(root, []);
}

/** The node itself, or null. */
export function findNode(root: SplitNode, id: string): LayoutNode | null {
    if (root.id === id) return root;
    const path = locate(root, id);
    if (!path) return null;
    const last = path[path.length - 1];
    return last.split.kids[last.index];
}

export const hasWidget = (root: SplitNode, key: WidgetKey): boolean => !!locate(root, key);

/** Every panel in the layout, in reading order. */
export const allKeys = (root: SplitNode): WidgetKey[] => keysOf(root);

// ── Mutation ────────────────────────────────────────────────────────────────

/** Replace one split's children wholesale, then canonicalise. */
function withKids(root: SplitNode, splitId: string, kids: LayoutNode[]): Layout {
    const rewrite = (node: SplitNode): SplitNode => ({
        ...node,
        kids: (node.id === splitId ? kids : node.kids).map(k => (k.t === 's' ? rewrite(k) : k)),
    });
    return canonRoot(rewrite(root));
}

/**
 * Lift a node out of the tree.
 *
 * The returned node keeps its own size and height, so a wide panel dragged
 * elsewhere does not silently shrink to an even share — the operator's sizing
 * survives a move.
 */
export function removeNode(root: SplitNode, id: string): { root: Layout; node: LayoutNode | null } {
    let found: LayoutNode | null = null;
    const strip = (node: SplitNode): SplitNode => ({
        ...node,
        kids: node.kids
            .filter(k => {
                if (k.id !== id) return true;
                found = k;
                return false;
            })
            .map(k => (k.t === 's' ? strip(k) : k)),
    });
    const stripped = strip(root);
    return { root: found ? canonRoot(stripped) : root, node: found };
}

/**
 * Put `item` immediately beside `anchorId`, on the given side.
 *
 * This is the whole of the drop model, and the whole reason depth is free:
 *
 *   - if the anchor's parent already runs along that axis, `item` becomes a
 *     sibling — a new column in the row, or a new panel in the column;
 *   - if it does not, the anchor is REPLACED by a split of the needed axis
 *     holding the two of them, in the space the anchor held.
 *
 * The second case is where new levels come from. Dropping a panel on the left
 * edge of a panel that lives in a column turns that one slot of the column into
 * a two-across row, and doing it again inside either half nests once more,
 * without limit.
 */
export function insertBeside(root: SplitNode, anchorId: string, item: LayoutNode, side: Side): Layout {
    const axis = axisOf(side);
    const after = isAfter(side);

    const walk = (node: SplitNode): SplitNode | null => {
        for (let i = 0; i < node.kids.length; i++) {
            const k = node.kids[i];
            if (k.id === anchorId) {
                const kids = [...node.kids];
                if (node.dir === axis) {
                    // An even share, NOT whatever width the panel had where it
                    // came from. A panel lifted out of a full-width row carries
                    // size 12, so dropping it into a row made it claim half of
                    // it and `normaliseSizes` squeezed the incumbents to fit —
                    // geometrically, so eight successive drops left a 6:1 spread
                    // with six panels under the minimum and their headers
                    // clipped. A newcomer asking for its fair share leaves the
                    // row balanced and the incumbents' ratios intact.
                    kids.splice(i + (after ? 1 : 0), 0, { ...item, size: GRID_COLS / (kids.length + 1) });
                } else {
                    const half = GRID_COLS / 2;
                    const pair: LayoutNode[] = after
                        ? [{ ...k, size: half }, { ...item, size: half }]
                        : [{ ...item, size: half }, { ...k, size: half }];
                    kids[i] = split(axis, pair, k.size);
                }
                return { ...node, kids };
            }
            if (k.t === 's') {
                const sub = walk(k);
                if (sub) return { ...node, kids: node.kids.map((x, j) => (j === i ? sub : x)) };
            }
        }
        return null;
    };

    // Beside the root itself means beside the whole page: a new first or last
    // row, which is the only reading of it that does not lose the layout.
    if (anchorId === root.id) return insertRow(root, item, after ? root.kids.length : 0);
    const next = walk(root);
    return next ? canonRoot(next) : root;
}

/** Put `item` in as a full-width row of its own at the top level. */
export function insertRow(root: SplitNode, item: LayoutNode, beforeIdx: number): Layout {
    const kids = [...root.kids];
    kids.splice(Math.max(0, Math.min(beforeIdx, kids.length)), 0, { ...item, size: GRID_COLS });
    return canonRoot({ ...root, kids });
}

/** Move an existing panel to sit beside `anchorId` — the drag-and-drop path. */
export function dropBeside(root: SplitNode, key: WidgetKey, anchorId: string, side: Side): Layout {
    if (key === anchorId) return root;
    const { root: without, node } = removeNode(root, key);
    if (!node) return root;
    // The anchor is never the panel being moved and never one of its ancestors,
    // so removing the panel cannot have destroyed it — but a layout arriving
    // from another browser mid-drag could have, and dropping the panel would
    // then lose it entirely.
    if (!findNode(without, anchorId)) return insertRow(without, node, without.kids.length);
    return insertBeside(without, anchorId, node, side);
}

/**
 * Move an existing panel to a new top-level row — the drop bars between rows.
 *
 * The destination is remembered as the ROW ID it should land above, captured
 * before the panel is lifted, rather than as an index corrected afterwards.
 *
 * An index cannot survive the removal. Lifting a panel can make the page
 * SHORTER (its row held nothing else) or LONGER (its row collapses to a column,
 * which the root then absorbs into several rows) — and an earlier version only
 * modelled the first. On the shipped operator preset, dropping `callbackSurface`
 * on the bottom bar left it second from last, because removing it turned one row
 * into two and every index below was then off by one in the unmodelled
 * direction. An anchor is immune: the row it names is not the row being emptied,
 * so it is still there afterwards and can simply be looked up again.
 */
export function dropAsRow(root: SplitNode, key: WidgetKey, beforeIdx: number): Layout {
    // Every row from the drop bar downwards, in order, remembered by id before
    // the panel is lifted. The first of them that still exists afterwards is
    // where the panel goes.
    const below = root.kids.slice(Math.max(0, beforeIdx)).map(k => k.id);
    const { root: without, node } = removeNode(root, key);
    if (!node) return root;
    for (const id of below) {
        const at = without.kids.findIndex(k => k.id === id);
        if (at >= 0) return insertRow(without, node, at);
    }
    // Nothing below survived — either the bar was the last one, or every row
    // under it was dissolved by the lift. Either way the panel belongs at the
    // end, which is what the operator pointed at.
    return insertRow(without, node, without.kids.length);
}

/** Which top-level row a widget sits in, or -1. */
export function locateRowIndex(root: SplitNode, key: WidgetKey): number {
    const path = locate(root, key);
    return path && path.length > 0 ? path[0].index : -1;
}

/**
 * Move `delta` columns across the boundary between children `i` and `i+1` of a
 * split.
 *
 * Only the two neighbours change — the rest of the row keeps its widths, so a
 * resize is a local negotiation rather than a reflow of everything, and the row
 * still sums to GRID_COLS without renormalising.
 */
export function applyResize(root: SplitNode, splitId: string, boundary: number, delta: number): Layout {
    const target = findNode(root, splitId);
    if (!target || target.t !== 's') return root;
    const kids = target.kids;
    if (boundary < 0 || boundary >= kids.length - 1 || Math.abs(delta) < 1e-6) return root;
    const left = kids[boundary];
    const right = kids[boundary + 1];
    // Against the row's own floor, not a flat MIN_SPAN. In an over-subscribed
    // row every child is already under MIN_SPAN, so a flat clamp inverts — the
    // outer Math.max then wins for every delta including large negatives, and
    // dragging either way pushes the neighbour to zero, or past it, to a
    // negative track that makes the whole grid-template invalid.
    const floor = floorFor(kids.length);
    const lo = floor - left.size;
    const hi = right.size - floor;
    if (lo > hi) return root;
    const applied = Math.max(lo, Math.min(hi, delta));
    if (Math.abs(applied) < 1e-6) return root;
    const next = [...kids];
    next[boundary] = { ...left, size: left.size + applied };
    next[boundary + 1] = { ...right, size: right.size - applied };
    // Not `withKids`: canonicalising here would be a no-op on structure but
    // would rebuild every node, and this runs once per resize gesture anyway.
    const rewrite = (node: SplitNode): SplitNode => ({
        ...node,
        kids: (node.id === splitId ? next : node.kids).map(k => (k.t === 's' ? rewrite(k) : k)),
    });
    return rewrite(root);
}

/**
 * Set one panel's explicit height, or clear it back to content-sized.
 *
 * Addressed by widget key: a height drag can outlive the position it started
 * from (a keyboard move during the drag, a layout adopted from another
 * browser), and the key is the one handle on a panel that reshaping cannot
 * invalidate.
 */
export function applyHeight(root: SplitNode, key: WidgetKey, h: number | null): Layout {
    const rewrite = (node: SplitNode): SplitNode => ({
        ...node,
        kids: node.kids.map(k => {
            if (k.t === 'p') {
                return k.key === key
                    ? { ...k, h: h === null ? null : Math.max(MIN_HEIGHT, Math.round(h)) }
                    : k;
            }
            return rewrite(k);
        }),
    });
    return rewrite(root);
}

/** The explicit height of a panel, or null. */
export function heightOf(root: SplitNode, key: WidgetKey): number | null {
    const node = findNode(root, key);
    return node && node.t === 'p' ? node.h : null;
}

/**
 * Move a panel one slot along an axis — the pointer-free equivalent of the drag.
 *
 * WCAG 2.5.7 requires a single-pointer alternative to any author-controlled
 * drag, and with a tree there is more to reproduce than "swap with the panel
 * next door". The rule is the one a tiling window manager uses: walk up from
 * the panel looking for the nearest ancestor split that runs along this axis
 * AND has somewhere to go in this direction.
 *
 *   - found at the panel's own parent → swap with that neighbour, widths and
 *     all, which is what "move left" means when there is a left to move to;
 *   - found further up → the panel leaves its subtree and lands beside that
 *     neighbour at that level, which is how a panel gets OUT of a nest;
 *   - found nowhere → the panel steps into the adjacent page row, or gets a new
 *     row of its own if there is none. That last case is the only way a new
 *     top-level row appears without a pointer, so it has to be reachable.
 */
export function applyMove(root: SplitNode, key: WidgetKey, axis: Axis, dir: -1 | 1): Layout {
    const path = locate(root, key);
    if (!path) return root;

    for (let level = path.length - 1; level >= 0; level--) {
        const { split: parent, index } = path[level];
        if (parent.dir !== axis) continue;
        const target = index + dir;
        if (target < 0 || target >= parent.kids.length) continue;

        const neighbour = parent.kids[target];

        if (level === path.length - 1) {
            // The neighbour is a split: step INTO it rather than hopping over.
            //
            // Without this the buttons cannot reach a position the drag can. A
            // panel could be moved beside a column but never into it, so any
            // stacked arrangement was pointer-only — which is precisely what
            // WCAG 2.5.7 forbids, and no amount of pressing got you there.
            //
            // The landing spot is named by the neighbour's edge CHILD, not by
            // the neighbour itself, because lifting this panel may dissolve the
            // neighbour: it can be left as its parent's only child, collapse
            // upward, and be absorbed by a grandparent running the same way. The
            // child survives all of that and still names the right place.
            //
            // NOT at the page level, though. The root's children are the page's
            // rows, read top to bottom, and there "down" means "later in the
            // page" — merging a row into the row below because the operator
            // pressed down is a horizontal placement in answer to a vertical
            // press. Joining a row sideways is what left/right already do from a
            // full-width row, so nothing becomes unreachable.
            if (neighbour.t === 's' && level > 0) {
                const edge = dir === 1 ? neighbour.kids[0] : neighbour.kids[neighbour.kids.length - 1];
                const side: Side = neighbour.dir === 'v'
                    ? (dir === 1 ? 'top' : 'bottom')
                    : (dir === 1 ? 'left' : 'right');
                const { root: without, node } = removeNode(root, key);
                if (!node) return root;
                if (!findNode(without, edge.id)) return without;
                return insertBeside(without, edge.id, node, side);
            }
            const kids = [...parent.kids];
            [kids[index], kids[target]] = [kids[target], kids[index]];
            return withKids(root, parent.id, kids);
        }
        // Leaving a nest: land beside the neighbour at THIS level rather than
        // inside it, so a move is one predictable step and not a plunge into
        // whatever happens to be nested over there.
        const neighbourId = neighbour.id;
        const { root: without, node } = removeNode(root, key);
        if (!node) return root;
        if (!findNode(without, neighbourId)) return without;
        return insertBeside(without, neighbourId, node, dir === 1 ? (axis === 'h' ? 'left' : 'top')
                                                                 : (axis === 'h' ? 'right' : 'bottom'));
    }

    // Nothing on this axis has room: step into the neighbouring page row.
    const rowIdx = path[0].index;
    const destRow = rowIdx + dir;
    const { root: without, node } = removeNode(root, key);
    if (!node) return root;
    if (destRow < 0 || destRow >= root.kids.length) {
        // No row that way at all — a new one, at the top or the bottom.
        return insertRow(without, node, destRow < 0 ? 0 : without.kids.length);
    }
    const neighbourId = root.kids[destRow].id;
    if (!findNode(without, neighbourId)) return insertRow(without, node, Math.max(0, destRow));
    // Entering a row from the left lands at its left edge and vice versa, so the
    // panel keeps travelling the way it was pushed.
    return insertBeside(without, neighbourId, node, axis === 'h'
        ? (dir === 1 ? 'left' : 'right')
        : (dir === 1 ? 'top' : 'bottom'));
}

/** Add a hidden panel back, or take a shown one away. */
export function toggleWidget(root: SplitNode, key: WidgetKey): Layout {
    if (hasWidget(root, key)) return removeNode(root, key).root;
    // A newly shown panel arrives on its own full-width row, which is the one
    // placement that is never ambiguous.
    return insertRow(root, panel(key), root.kids.length);
}

// ── Presets ─────────────────────────────────────────────────────────────────

const row = (kids: LayoutNode[], size: number = GRID_COLS) => split('h', kids, size);
const col = (kids: LayoutNode[], size: number = GRID_COLS) => split('v', kids, size);

/**
 * Which panels stack is not free choice.
 *
 * A card whose body is a fixed-size drawing (the tempo chart's 190px plot) or a
 * table (the callback surface) leaves whitespace when stretched, while one built
 * around a `flex-1` scroller (attention, alerts, the activity stream) simply
 * shows more rows. So the elastic cards go where a stretch has to land, and a
 * stack is only put beside a neighbour tall enough to earn it.
 *
 * Reading order is deliberate too: the four headline numbers, then whether work
 * is flowing and what the queue is made of, then the estate and what needs an
 * operator, then posture, then what it has all produced.
 */
export const OPERATOR_PRESET = (): Layout => canonRoot(col([
    panel('kpiStrip'),
    // Flow over time beside the queue right now — the two halves of "is work
    // getting done", at almost exactly the same height.
    row([panel('tempo', 8), panel('taskPipeline', 4)]),
    // The estate, beside what needs me and whether the C2 holding it is up.
    // Attention leads the stack because it is the panel an operator acts on,
    // and being elastic it absorbs whatever the surface table does not use.
    row([panel('callbackSurface', 8), col([panel('attention'), panel('c2Matrix')], 4)]),
    row([panel('footprint', 4), panel('reach', 4), panel('tradecraft', 4)]),
    panel('assetStrip'),
    // The worst gap in the old layout: one short operation card beside the
    // tallest panel on the page. Alerts now fills the rest of that column.
    row([panel('activityStream', 8), col([panel('operation'), panel('alerts')], 4)]),
    panel('recentPayloads'),
]));

/**
 * The lead reads posture before detail: triage and the estate above the
 * pipeline, and the payload list dropped entirely — filenames are an operator's
 * concern.
 */
export const LEAD_PRESET = (): Layout => canonRoot(col([
    panel('kpiStrip'),
    row([col([panel('attention'), panel('c2Matrix')], 4), panel('callbackSurface', 8)]),
    row([panel('tempo', 8), panel('taskPipeline', 4)]),
    row([panel('footprint', 4), panel('reach', 4), panel('tradecraft', 4)]),
    panel('assetStrip'),
    row([col([panel('operation'), panel('alerts')], 4), panel('activityStream', 8)]),
]));

// ── Storage ─────────────────────────────────────────────────────────────────
//
// Serialised shape (v3), kept short because it lives inside Mythic's operator
// preferences blob alongside everything else:
//
//   panel: { p: <widget key>, s: <size>, h?: <pixels> }
//   split: { d: 'h' | 'v',    s: <size>, k: [ ...nodes ] }
//
// The top level is the array of page rows. Ids are not stored: they are a
// within-session handle for "the column I am leaving", nothing more.

type RawNode = Record<string, unknown>;

function writeNode(node: LayoutNode): RawNode {
    const size = Math.round(node.size * 100) / 100;
    if (node.t === 'p') {
        return node.h ? { p: node.key, s: size, h: Math.round(node.h) } : { p: node.key, s: size };
    }
    return { d: node.dir, s: size, k: node.kids.map(writeNode) };
}

export function serializeLayout(root: Layout): string {
    return JSON.stringify(root.kids.map(writeNode));
}

/**
 * Read one stored node, in ANY shape this layout has ever been saved in.
 *
 * Four generations are accepted, because an operator who arranged their console
 * two versions ago should open it and find it, not find the seed:
 *
 *   v0  "kpiStrip"                        a bare key, before panels resized
 *   v1  { key, span, h }                  a flat cell, one panel per column
 *   v2  { span, items: [...] }            a column of stacked panels
 *   v3  { p | d, s, k }                   a node of the tree
 *
 * An array is a v0/v1/v2 row: a horizontal split of whatever it holds.
 */
/**
 * Deepest tree accepted from storage.
 *
 * Far beyond anything an operator builds by hand, and far below the ~2000
 * levels at which this mutual recursion exhausts the stack. Without a cap, a
 * deep enough stored payload throws a RangeError out of `parseLayout` — and
 * since the layout is read during render, that killed the whole Dashboard route
 * and kept killing it on every reload, because the poisoned value is read back
 * from preferences each time. A cap turns a persistent denial of the landing
 * page into one truncated branch.
 */
const MAX_DEPTH = 64;

function readNode(v: unknown, depth: number = 0): LayoutNode | null {
    if (depth > MAX_DEPTH) return null;
    if (typeof v === 'string') return isWidgetKey(v) ? panel(v) : null;
    if (Array.isArray(v)) {
        const kids = v.map(k => readNode(k, depth + 1)).filter((k): k is LayoutNode => !!k);
        return kids.length ? split('h', kids) : null;
    }
    if (!v || typeof v !== 'object') return null;
    const o = v as RawNode;

    // Clamped to the grid, not merely "positive". `normaliseSizes` sums the
    // children before scaling them, and a stored 1e308 makes that sum Infinity,
    // which collapses every child to the floor and leaves the row summing to 4
    // instead of 12 — then serialises that back out, so the corruption sticks.
    const rawSize = Number(o.s ?? o.span ?? o.size);
    const size = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, GRID_COLS) : GRID_COLS;

    // v3 split
    if (o.d === 'h' || o.d === 'v') {
        const kids = Array.isArray(o.k)
            ? (o.k as unknown[]).map(k => readNode(k, depth + 1)).filter((k): k is LayoutNode => !!k)
            : [];
        return kids.length ? split(o.d, kids, size) : null;
    }
    // v2 column
    if (Array.isArray(o.items)) {
        const kids = (o.items as unknown[]).map(k => readNode(k, depth + 1)).filter((k): k is LayoutNode => !!k);
        return kids.length ? split('v', kids, size) : null;
    }
    // v3 panel, or a v1/v2 cell
    const key = o.p ?? o.key;
    if (!isWidgetKey(key)) return null;
    const rawH = Number(o.h);
    return panel(key, size, Number.isFinite(rawH) && rawH > 0 ? rawH : null);
}

/**
 * Drop every widget that is unknown or already placed.
 *
 * A layout saved before the panels were consolidated still names widgets that
 * no longer exist, and those would otherwise render as invisible empty columns
 * that silently eat a share of every row's width. Duplicates are worse: they
 * survive every other filter, and then the drop model resolves an anchor to
 * whichever copy comes first while React reconciles two panels under one key.
 * Surviving bad storage is this function's entire job.
 */
function dedupe(node: LayoutNode, seen: Set<string>, depth: number = 0): LayoutNode | null {
    if (depth > MAX_DEPTH) return null;
    if (node.t === 'p') {
        if (!isWidgetKey(node.key) || seen.has(node.key)) return null;
        seen.add(node.key);
        return node;
    }
    const kids = node.kids.map(k => dedupe(k, seen, depth + 1)).filter((k): k is LayoutNode => !!k);
    return kids.length ? { ...node, kids } : null;
}

/**
 * Read a stored layout, or null if there is nothing usable in it.
 *
 * The try/catch covers the WHOLE body, not just `JSON.parse`. Everything after
 * it — `readNode`, `dedupe`, `canon` — is recursion over attacker-shaped data,
 * and this function is called during render: anything it throws takes the
 * Dashboard route down with it, permanently, because the same stored value is
 * read again on every mount. Returning null costs the operator their
 * arrangement once; throwing costs them the page until someone clears storage
 * by hand.
 */
export function parseLayout(raw: string | null): Layout | null {
    if (!raw) return null;
    try {
        const saved: unknown = JSON.parse(raw);
        if (!Array.isArray(saved)) return null;
        const rows = saved.map(v => readNode(v, 0)).filter((k): k is LayoutNode => !!k);
        if (!rows.length) return null;
        const cleaned = dedupe(split('v', rows), new Set<string>());
        if (!cleaned || cleaned.t !== 's') return null;
        const layout = canonRoot(cleaned);
        return layout.kids.length ? layout : null;
    } catch {
        return null;
    }
}

/** A fresh copy of the operator preset, for a console that has never been arranged. */
export const seedLayout = (): Layout => OPERATOR_PRESET();
