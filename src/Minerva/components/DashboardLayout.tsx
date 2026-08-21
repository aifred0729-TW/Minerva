/**
 * The dashboard layout, rendered.
 *
 * One recursive component over the split tree in `lib/dashboardLayout`. Both the
 * presets and an operator's own arrangement come through here — a preset is the
 * same tree, so a second renderer would only mean two places to fix whenever a
 * panel's sizing rules change.
 *
 * The interesting problem here is not the recursion, it is what re-renders
 * during a drag. `dragover` fires continuously, and routing the drop target
 * through React state re-rendered the whole page — all fourteen cards and every
 * wrapper, closure and handle around them — on every pointer move. Measured in
 * the running console that was ~40ms per move: a drag that should track the
 * pointer instead lurched at roughly 25fps, and it got worse the more panels
 * were on screen, which is exactly backwards.
 *
 * So the drop target lives in a tiny external store instead, and the only
 * things subscribed to it are the indicator leaves — each reading one
 * primitive, its own side. A pointer move now re-renders the two panels whose
 * indicator actually changed, and nothing else. Everything that changes rarely
 * (which panel is being dragged, whether we are editing, which divider is being
 * resized) stays in ordinary React state, where it belongs.
 */
import React, { memo, useCallback, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { cn } from '../lib/utils';
import {
    GRID_COLS,
    MIN_HEIGHT,
    floorFor,
    labelOf,
    keysOf,
    reactKeyOf,
    type Axis,
    type Layout,
    type LayoutNode,
    type Side,
    type SplitNode,
    type WidgetKey,
} from '../lib/dashboardLayout';

// ── Drop targets ────────────────────────────────────────────────────────────
//
// Where a dragged panel would land, stated relative to the panel under the
// pointer (`anchor`) rather than as a position in the tree. Reshaping the tree
// moves every position in it — including, sometimes, the target's own — and an
// index-based target carried a correction term for each way that could happen.
// An anchor survives untouched: the panel it names is by construction not the
// one being dragged, so it is still there afterwards and can simply be looked
// up again.
export type DropTarget =
    | { kind: 'beside'; anchor: WidgetKey; side: Side }
    | { kind: 'row'; beforeIdx: number };

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
    if (a === b) return true;
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'row' && b.kind === 'row') return a.beforeIdx === b.beforeIdx;
    if (a.kind === 'beside' && b.kind === 'beside') return a.anchor === b.anchor && a.side === b.side;
    return false;
}

/**
 * The one piece of state a drag changes at pointer rate.
 *
 * Deliberately not React state. `useSyncExternalStore` lets each indicator
 * subscribe to the slice it draws, so a pointer move wakes the two panels whose
 * indicator changed rather than the entire page.
 */
export interface DropStore {
    get(): DropTarget | null;
    set(next: DropTarget | null): void;
    subscribe(fn: () => void): () => void;
}

export function createDropStore(): DropStore {
    let target: DropTarget | null = null;
    const subs = new Set<() => void>();
    return {
        get: () => target,
        set(next) {
            // The same guard the old React version needed, for the same reason:
            // `dragover` repeats at pointer rate and most of those events mean
            // exactly what the last one meant.
            if (sameTarget(target, next)) return;
            target = next;
            subs.forEach(fn => fn());
        },
        subscribe(fn) {
            subs.add(fn);
            return () => { subs.delete(fn); };
        },
    };
}

/**
 * Which drop a pointer position over a panel means.
 *
 * Four zones, and they are the whole vocabulary of the tree: the left and right
 * bands put the panel beside this one, the top and bottom halves put it above
 * or below. Whether that makes a sibling or a whole new level is the layout
 * model's problem, not the pointer's — which is exactly why unlimited nesting
 * needs no extra gesture.
 *
 * The edge bands are wide (28%) because they are the harder aim: dropping
 * BESIDE a panel has to be reachable without catching its resize handle, while
 * the two halves fill everything left over and cannot be missed.
 */
const EDGE_BAND = 0.28;
export function hitTest(rect: DOMRect, clientX: number, clientY: number, anchor: WidgetKey): DropTarget {
    const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
    if (x < EDGE_BAND) return { kind: 'beside', anchor, side: 'left' };
    if (x > 1 - EDGE_BAND) return { kind: 'beside', anchor, side: 'right' };
    return { kind: 'beside', anchor, side: y < 0.5 ? 'top' : 'bottom' };
}

// ── Wiring handed down the tree ─────────────────────────────────────────────
//
// One object rather than a dozen props, and memoised by the page, so that a
// branch's memo comparison is a handful of identity checks. Everything in here
// changes rarely — on an edit, or at the two ends of a drag — which is what
// makes the memo worth having.
export interface LayoutContext {
    editing: boolean;
    /**
     * Whether panels should play the staggered entrance.
     *
     * False once the page's own entrance is over. A move remounts the panel it
     * moved (its DOM ancestry changed), and a remounted element restarts its CSS
     * animation from the beginning — including `animation-delay`, which is the
     * panel's reading position times 45ms. A panel low on the page therefore sat
     * at `opacity: 0` for up to 630ms and then faded in over 400ms: a second of
     * blank exactly where the operator was looking to see where it landed.
     */
    animate: boolean;
    /** Which panel is in flight, for the ghosting. Changes twice per drag. */
    dragKey: WidgetKey | null;
    resizing: { splitId: string; boundary: number } | null;
    heighting: WidgetKey | null;
    /** Entrance-stagger position per panel, in reading order. */
    order: Map<WidgetKey, number>;
    drops: DropStore;
    panelRefs: React.MutableRefObject<Map<WidgetKey, HTMLDivElement>>;
    splitRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
    renderWidget: (key: WidgetKey) => React.ReactNode;
    onDragStart: (key: WidgetKey) => void;
    onDragEnd: () => void;
    onDropBeside: (target: DropTarget) => void;
    onDropRow: (beforeIdx: number) => void;
    onMove: (key: WidgetKey, axis: Axis, dir: -1 | 1) => void;
    onWidthDown: (e: React.PointerEvent, splitId: string, boundary: number, sizes: number[]) => void;
    onWidthNudge: (splitId: string, boundary: number, delta: number) => void;
    onHeightDown: (e: React.PointerEvent, key: WidgetKey) => void;
    onHeightNudge: (key: WidgetKey, delta: number) => void;
    onHeightClear: (key: WidgetKey) => void;
}

// ── Indicators ──────────────────────────────────────────────────────────────

/**
 * Where the dragged panel would land, drawn on the panel under the pointer.
 *
 * A vertical bar means "beside this one", a horizontal bar means "above or
 * below it" — the two gestures have to be told apart at a glance, mid-drag.
 *
 * `rgb(var(--tok) / a)`, not `rgba(var(--tok), a)`: the tokens are
 * space-separated channels, so the comma form produced an invalid colour and
 * the glow silently never rendered.
 */
const DropMark = memo(function DropMark({ drops, panelKey, enabled }: {
    drops: DropStore;
    panelKey: WidgetKey;
    enabled: boolean;
}) {
    const side = useSyncExternalStore(drops.subscribe, () => {
        const t = drops.get();
        return t && t.kind === 'beside' && t.anchor === panelKey ? t.side : null;
    });
    if (!enabled || !side) return null;
    const vertical = side === 'left' || side === 'right';
    return (
        <div
            aria-hidden="true"
            className={cn(
                'absolute z-30 rounded-sm bg-signal pointer-events-none shadow-[0_0_8px_rgb(var(--color-signal)/0.8)]',
                vertical
                    ? cn('top-2 bottom-2 w-1', side === 'left' ? '-left-3' : '-right-3')
                    : cn('inset-x-2 h-1', side === 'top' ? '-top-3' : '-bottom-3'),
            )}
        />
    );
});

/** The bar between two page rows: drop here for a full-width row of its own. */
const RowDropZone = memo(function RowDropZone({ drops, beforeIdx, dragging, onDropRow }: {
    drops: DropStore;
    beforeIdx: number;
    dragging: boolean;
    onDropRow: (beforeIdx: number) => void;
}) {
    const armed = useSyncExternalStore(drops.subscribe, () => {
        const t = drops.get();
        return !!t && t.kind === 'row' && t.beforeIdx === beforeIdx;
    });
    const lit = dragging && armed;
    return (
        <div
            className={cn(
                'w-full flex items-center justify-center rounded transition-all duration-150 select-none text-[12px] uppercase tracking-[0.1em]',
                lit
                    ? 'h-12 mb-1 border border-dashed border-signal/60 bg-signal/10 text-signal'
                    : 'h-3 mb-0 border border-dashed border-signal/10 text-transparent',
            )}
            onDragOver={e => {
                e.preventDefault(); e.stopPropagation();
                if (dragging) drops.set({ kind: 'row', beforeIdx });
            }}
            onDragLeave={() => drops.set(null)}
            onDrop={e => {
                e.preventDefault();
                if (dragging) onDropRow(beforeIdx);
            }}
        >
            {lit ? 'NEW ROW' : null}
        </div>
    );
});

// ── Handles ─────────────────────────────────────────────────────────────────

/**
 * The divider a node shares with the sibling to its right.
 *
 * It hangs off the node itself rather than off the parent, because the parent
 * is a grid and a divider drawn there would have to know track positions the
 * browser has already worked out.
 */
const WidthHandle = memo(function WidthHandle({ ctx, parent, index, label }: {
    ctx: LayoutContext;
    parent: SplitNode;
    index: number;
    label: string;
}) {
    const { onWidthDown, onWidthNudge, resizing } = ctx;
    const active = resizing?.splitId === parent.id && resizing?.boundary === index;
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize width of ${label}`}
            // A focusable separator is a range widget, and ARIA 1.2 requires
            // `aria-valuenow` on one. Without it a screen-reader user tabs here,
            // presses an arrow and is told nothing about where the split moved —
            // the control is operable but silent.
            aria-valuenow={Math.round(parent.kids[index].size * 10) / 10}
            aria-valuemin={Math.round(floorFor(parent.kids.length) * 10) / 10}
            aria-valuemax={GRID_COLS}
            aria-valuetext={`${Math.round((parent.kids[index].size / GRID_COLS) * 100)}% of the row`}
            tabIndex={0}
            draggable={false}
            onPointerDown={e => onWidthDown(e, parent.id, index, parent.kids.map(k => k.size))}
            onKeyDown={e => {
                // Keyboard resize: the drag is pointer-only otherwise.
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    onWidthNudge(parent.id, index, e.key === 'ArrowLeft' ? -1 : 1);
                }
            }}
            // 24px of hit area (WCAG 2.5.8), even though the visible bar is
            // 4px — and a real focus ring, because `outline-none` with no
            // replacement is just removing the indicator.
            className={cn(
                'absolute -right-6 top-0 bottom-0 z-30 hidden w-6 cursor-col-resize',
                'items-center justify-center lg:flex',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal',
            )}
        >
            <span className={cn(
                'h-10 w-1 rounded-full transition-colors',
                active ? 'bg-signal' : 'bg-signal/25 hover:bg-signal/60',
            )} />
        </div>
    );
});

/**
 * The panel's own bottom edge. Double-click clears the height back to
 * content-sized — otherwise a panel that has been given a height can never go
 * back to growing with its content. It sits in the 12px of gap below, so inside
 * a stack it stays clear of the next panel's header.
 */
const HeightHandle = memo(function HeightHandle({ ctx, panelKey, label, pinned }: {
    ctx: LayoutContext;
    panelKey: WidgetKey;
    label: string;
    /** The pinned height in pixels, or null when the panel sizes to content. */
    pinned: number | null;
}) {
    const { onHeightDown, onHeightNudge, onHeightClear, heighting } = ctx;
    return (
        <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Resize height of ${label}`}
            aria-valuenow={pinned ?? undefined}
            aria-valuemin={MIN_HEIGHT}
            aria-valuetext={pinned ? `${pinned} pixels` : 'Sized to content'}
            tabIndex={0}
            draggable={false}
            onPointerDown={e => onHeightDown(e, panelKey)}
            onDoubleClick={() => onHeightClear(panelKey)}
            onKeyDown={e => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    onHeightNudge(panelKey, e.key === 'ArrowUp' ? -24 : 24);
                }
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    onHeightClear(panelKey);
                }
            }}
            title={pinned
                ? 'Drag to resize · double-click, Backspace or Delete to fit content'
                : 'Drag to set a fixed height'}
            className="absolute inset-x-0 -bottom-3 z-30 flex h-6 cursor-row-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
        >
            <span className={cn(
                'h-1 w-10 rounded-full transition-colors',
                heighting === panelKey ? 'bg-signal' : 'bg-signal/25 hover:bg-signal/60',
            )} />
        </div>
    );
});

/**
 * Move buttons and the grab affordance.
 *
 * WCAG 2.5.7 requires a single-pointer alternative to any author-controlled
 * drag, and with a tree there is more to reproduce than "swap with the panel
 * next door": left/right walk the columns and pull a panel out of a nest,
 * up/down walk the stack and push it into the next one.
 */
const MOVES: [word: string, Icon: typeof ChevronLeft, axis: Axis, dir: -1 | 1][] = [
    ['left', ChevronLeft, 'h', -1],
    ['up', ChevronUp, 'v', -1],
    ['down', ChevronDown, 'v', 1],
    ['right', ChevronRight, 'h', 1],
];

/**
 * The accessible name of one move button.
 *
 * Exported because a move that changes a panel's parent remounts it, which
 * destroys the button the operator just pressed and drops focus to `<body>`.
 * The page re-finds the new button by this name and restores focus, so the
 * arrow keys stay usable for a second press — without which the WCAG 2.5.7
 * drag alternative is unusable in practice.
 */
export const moveLabel = (key: WidgetKey, axis: Axis, dir: -1 | 1): string => {
    const entry = MOVES.find(([, , a, d]) => a === axis && d === dir)!;
    return `Move ${labelOf(key)} ${entry[0]}`;
};

const MoveButtons = memo(function MoveButtons({ panelKey, label, onMove, enabled }: {
    panelKey: WidgetKey;
    label: string;
    onMove: (key: WidgetKey, axis: Axis, dir: -1 | 1) => void;
    enabled: boolean;
}) {
    return (
        // Anchored on BOTH edges and allowed to wrap: the cluster is 136px
        // wide, and a panel in a deep nest or a nine-across row can be 96px.
        // Pinned only on the right it hung outside the panel and overlapped the
        // neighbour's cluster.
        <div className="absolute inset-x-1.5 top-1.5 z-20 flex flex-wrap items-start justify-end gap-1">
            {MOVES.map(([word, Icon, axis, dir]) => (
                <button
                    key={word}
                    type="button"
                    aria-label={`Move ${label} ${word}`}
                    disabled={!enabled}
                    onClick={() => onMove(panelKey, axis, dir)}
                    className="flex h-6 w-6 items-center justify-center rounded-sm border border-signal/30 bg-void text-signal transition-colors hover:border-signal disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal"
                >
                    <Icon size={12} strokeWidth={2} aria-hidden="true" />
                </button>
            ))}
            <span
                aria-hidden="true"
                className="flex h-6 w-6 cursor-grab items-center justify-center rounded-sm border border-signal/30 bg-void text-signal transition-colors hover:border-signal active:cursor-grabbing"
            >
                <GripVertical size={13} strokeWidth={2} />
            </span>
        </div>
    );
});

// ── The tree ────────────────────────────────────────────────────────────────

/**
 * How a node sizes itself, which depends entirely on which way its parent runs.
 *
 * In a row the grid hands out the width and the node stretches. In a column the
 * node takes its content's height and shares the slack with its siblings —
 * `flex-auto`, NOT `flex-1`, because flex-1's zero basis ignores content and
 * would hand a three-number readout the same height as the task table beside
 * it. An explicit height opts out of both.
 */
const fitClass = (parentDir: Axis, pinned: boolean) =>
    parentDir === 'v' ? (pinned ? 'flex-none' : 'min-h-0 flex-auto') : '';

const PanelCell = memo(function PanelCell({ node, parent, index, ctx }: {
    node: Extract<LayoutNode, { t: 'p' }>;
    parent: SplitNode;
    index: number;
    ctx: LayoutContext;
}) {
    const { key, h } = node;
    const { editing, dragKey } = ctx;
    const label = labelOf(key);
    const hasDivider = editing && parent.dir === 'h' && index < parent.kids.length - 1;

    // Bound to the widget key, so the ref survives every reshaping of the tree
    // around it. Delete rather than store null, or a hidden panel leaves a
    // detached node behind for a later lookup to find.
    const setRef = useCallback((el: HTMLDivElement | null) => {
        if (el) ctx.panelRefs.current.set(key, el);
        else ctx.panelRefs.current.delete(key);
    }, [ctx.panelRefs, key]);

    return (
        <div
            ref={setRef}
            style={{
                ...(h ? { height: h } : {}),
                '--mv-panel-index': ctx.order.get(key) ?? 1,
            } as React.CSSProperties}
            className={cn(
                // Custom mode was once the one layout with no entrance — panels
                // simply appeared while the presets faded in.
                'relative min-w-0',
                ctx.animate && 'mv-panel-enter',
                fitClass(parent.dir, !!h),
                dragKey === key && 'opacity-40 ring-2 ring-signal/40 rounded',
            )}
            draggable={editing}
            // Gated on `editing`, not merely on `dragKey`. A preset is rendered
            // by this same component, and leaving live drop handlers on it means
            // anything that ever set `dragKey` outside custom mode would write
            // preset-relative moves into the operator's saved custom tree.
            onDragStart={editing ? (e => { e.dataTransfer.effectAllowed = 'move'; ctx.onDragStart(key); }) : undefined}
            onDragEnd={editing ? ctx.onDragEnd : undefined}
            onDragOver={editing ? (e => {
                e.preventDefault(); e.stopPropagation();
                if (!dragKey || dragKey === key) return;
                ctx.drops.set(hitTest(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY, key));
            }) : undefined}
            onDrop={editing ? (e => {
                e.preventDefault();
                if (!dragKey || dragKey === key) return;
                ctx.onDropBeside(hitTest(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY, key));
            }) : undefined}
        >
            <DropMark drops={ctx.drops} panelKey={key} enabled={!!dragKey && dragKey !== key} />
            {editing && (
                <MoveButtons panelKey={key} label={label} onMove={ctx.onMove} enabled={ctx.order.size > 1} />
            )}
            {ctx.renderWidget(key)}
            {hasDivider && <WidthHandle ctx={ctx} parent={parent} index={index} label={label} />}
            {editing && <HeightHandle ctx={ctx} panelKey={key} label={label} pinned={h} />}
        </div>
    );
});

/**
 * One node of the tree. A row is a grid whose tracks are its children's shares;
 * a column is a flex stack. Nothing here knows how deep it is, which is the
 * entire reason depth is unlimited.
 */
export const LayoutBranch = memo(function LayoutBranch({ node, parent, index, ctx }: {
    node: LayoutNode;
    parent: SplitNode;
    index: number;
    ctx: LayoutContext;
}) {
    if (node.t === 'p') return <PanelCell node={node} parent={parent} index={index} ctx={ctx} />;

    const isRow = node.dir === 'h';
    const hasDivider = ctx.editing && parent.dir === 'h' && index < parent.kids.length - 1;
    return (
        <div
            ref={el => {
                if (el) ctx.splitRefs.current.set(node.id, el);
                else ctx.splitRefs.current.delete(node.id);
            }}
            className={cn(
                'relative min-w-0',
                fitClass(parent.dir, false),
                isRow
                    // Below `lg` every row collapses to a single column:
                    // twelfths of a phone are not a layout.
                    ? 'grid grid-cols-1 items-stretch gap-4 lg:[grid-template-columns:var(--row-cols)]'
                    : 'flex flex-col gap-4',
            )}
            style={isRow
                ? ({ '--row-cols': node.kids.map(k => `minmax(0, ${k.size}fr)`).join(' ') } as React.CSSProperties)
                : undefined}
        >
            {node.kids.map((kid, i) => (
                <LayoutBranch key={reactKeyOf(kid)} node={kid} parent={node} index={i} ctx={ctx} />
            ))}
            {hasDivider && (
                <WidthHandle ctx={ctx} parent={parent} index={index}
                    label={keysOf(node).map(labelOf).join(', ')} />
            )}
        </div>
    );
});

/** The page's rows, with the new-row drop bars between them while editing. */
export function LayoutView({ layout, ctx, interactive }: {
    layout: Layout;
    ctx: LayoutContext;
    /** Custom mode: drop bars and the empty state. Presets get neither. */
    interactive: boolean;
}) {
    if (!interactive) {
        return (
            <div className="flex flex-col gap-4">
                {layout.kids.map((node, i) => (
                    <LayoutBranch key={reactKeyOf(node)} node={node} parent={layout} index={i} ctx={ctx} />
                ))}
            </div>
        );
    }
    return (
        <div className="flex flex-col">
            {layout.kids.map((node, i) => (
                <React.Fragment key={reactKeyOf(node)}>
                    {ctx.editing && (
                        <RowDropZone drops={ctx.drops} beforeIdx={i} dragging={!!ctx.dragKey} onDropRow={ctx.onDropRow} />
                    )}
                    <div className="mb-4">
                        <LayoutBranch node={node} parent={layout} index={i} ctx={ctx} />
                    </div>
                </React.Fragment>
            ))}
            {ctx.editing && (
                <RowDropZone drops={ctx.drops} beforeIdx={layout.kids.length} dragging={!!ctx.dragKey} onDropRow={ctx.onDropRow} />
            )}
            {layout.kids.length === 0 && (
                <div className="rounded-md border border-dashed border-signal/20 px-6 py-10 text-center text-[13px] text-signal opacity-70">
                    Every panel is hidden. Turn one back on above.
                </div>
            )}
        </div>
    );
}
