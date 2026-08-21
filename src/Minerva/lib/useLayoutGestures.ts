/**
 * The two pointer gestures the dashboard layout needs, and the one the HTML5
 * drag API refuses to provide.
 *
 * They live here rather than in the page because they are layout behaviour, not
 * dashboard behaviour: the page owns the data, the query and the chrome, while
 * everything below owns pixels. Keeping them in `Dashboard.tsx` meant every
 * change to a resize clamp landed in the same file as the GraphQL extraction.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    GRID_COLS,
    MIN_HEIGHT,
    applyHeight,
    applyMove,
    applyResize,
    floorFor,
    heightOf,
    type Axis,
    type Layout,
    type WidgetKey,
} from './dashboardLayout';

/**
 * Node id → its element, so a gesture can measure what it is dragging.
 *
 * Keyed by id — the widget key for a panel, a generated id for a split — and
 * never by position: a resize or a drop reshapes the tree around a node, and an
 * index-keyed lookup would then find a detached element or, worse, the wrong
 * live one.
 */
export type PanelRefs = React.MutableRefObject<Map<WidgetKey, HTMLDivElement>>;
export type SplitRefs = React.MutableRefObject<Map<string, HTMLDivElement>>;

export interface LayoutGestures {
    panelRefs: PanelRefs;
    splitRefs: SplitRefs;
    resizing: { splitId: string; boundary: number } | null;
    heighting: WidgetKey | null;
    startWidthDrag: (e: React.PointerEvent, splitId: string, boundary: number, spans: number[]) => void;
    startHeightDrag: (e: React.PointerEvent, key: WidgetKey) => void;
    nudgeResize: (splitId: string, boundary: number, delta: number) => void;
    movePanel: (key: WidgetKey, axis: Axis, dir: -1 | 1) => void;
    nudgeHeight: (key: WidgetKey, delta: number) => void;
    clearHeight: (key: WidgetKey) => void;
}

/**
 * Width and height dragging.
 *
 * The drag writes to the DOM directly and only commits to React state when the
 * pointer is released. That is what makes it feel continuous: going through
 * state meant a re-render per movement, and an earlier whole-column version
 * meant the panel sat still until the pointer had crossed a twelfth of the
 * screen and then jumped. Here the grid tracks the pointer every frame, and
 * React hears about it once, at the end.
 */
export function useLayoutGestures(
    editLayout: (fn: (prev: Layout) => Layout) => void,
): LayoutGestures {
    const splitRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
    const panelRefs = React.useRef<Map<WidgetKey, HTMLDivElement>>(new Map());
    const [resizing, setResizing] = useState<{ splitId: string; boundary: number } | null>(null);
    const [heighting, setHeighting] = useState<WidgetKey | null>(null);

    const dragState = React.useRef<
        | { kind: 'width'; splitId: string; boundary: number; startX: number; colPx: number;
            spans: number[]; live: number[]; raf: number | null }
        | { kind: 'height'; key: WidgetKey; startY: number;
            startH: number; live: number; raf: number | null }
        | null
    >(null);

    const startWidthDrag = useCallback((e: React.PointerEvent, splitId: string, boundary: number, spans: number[]) => {
        const rowEl = splitRefs.current.get(splitId);
        if (!rowEl) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragState.current = {
            kind: 'width', splitId, boundary,
            startX: e.clientX,
            // The split's OWN width, not the page's: nested rows are narrower
            // than the page, and a twelfth of the wrong one makes the panel
            // travel at a different speed than the pointer.
            colPx: rowEl.getBoundingClientRect().width / GRID_COLS,
            spans: [...spans], live: [...spans], raf: null,
        };
        setResizing({ splitId, boundary });
    }, []);

    const startHeightDrag = useCallback((e: React.PointerEvent, key: WidgetKey) => {
        const el = panelRefs.current.get(key);
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const h = el.getBoundingClientRect().height;
        dragState.current = {
            kind: 'height', key,
            startY: e.clientY, startH: h, live: h, raf: null,
        };
        setHeighting(key);
    }, []);

    useEffect(() => {
        if (!resizing && !heighting) return;

        const paint = () => {
            const st = dragState.current;
            if (!st) return;
            st.raf = null;
            if (st.kind === 'width') {
                const rowEl = splitRefs.current.get(st.splitId);
                if (rowEl) {
                    rowEl.style.gridTemplateColumns = st.live.map(v => `minmax(0, ${v}fr)`).join(' ');
                }
            } else {
                const el = panelRefs.current.get(st.key);
                if (el) el.style.height = `${st.live}px`;
            }
        };

        const move = (ev: PointerEvent) => {
            const st = dragState.current;
            if (!st) return;
            if (st.kind === 'width') {
                if (st.colPx <= 0) return;
                const wanted = (ev.clientX - st.startX) / st.colPx;
                const l = st.spans[st.boundary];
                const r = st.spans[st.boundary + 1];
                // Same floor the commit uses, or the live preview would let the
                // operator drag somewhere the release then refuses.
                const floor = floorFor(st.spans.length);
                const applied = Math.max(floor - l, Math.min(r - floor, wanted));
                st.live = [...st.spans];
                st.live[st.boundary] = l + applied;
                st.live[st.boundary + 1] = r - applied;
            } else {
                st.live = Math.max(MIN_HEIGHT, st.startH + (ev.clientY - st.startY));
            }
            // One paint per frame, whatever the pointer's report rate.
            if (st.raf === null) st.raf = requestAnimationFrame(paint);
        };

        const end = () => {
            const st = dragState.current;
            dragState.current = null;
            setResizing(null);
            setHeighting(null);
            if (!st) return;
            if (st.raf !== null) cancelAnimationFrame(st.raf);

            if (st.kind === 'width') {
                // Hand the inline style back to React, then commit once.
                const rowEl = splitRefs.current.get(st.splitId);
                if (rowEl) rowEl.style.gridTemplateColumns = '';
                const delta = st.live[st.boundary] - st.spans[st.boundary];
                editLayout(prev => applyResize(prev, st.splitId, st.boundary, delta));
            } else if (st.live !== st.startH) {
                // Only if the pointer actually travelled. A plain click on the
                // bar used to pin the panel's current height into storage — the
                // tooltip says "drag to set a fixed height", and a click is not
                // a drag. The panel then silently stopped growing with its
                // content, recoverable only by a double-click the operator had
                // no reason to try.
                //
                // Leave the final height ON the element rather than clearing it.
                //
                // The width path clears safely because it writes
                // `gridTemplateColumns` while React owns `--row-cols` — two
                // different properties. Height is the one React itself renders,
                // and React only writes a style property whose *value* changed
                // between renders. Releasing without moving commits the same
                // number React already has, so the diff is a no-op, nothing is
                // rewritten, and the cleared inline height stayed cleared: the
                // panel collapsed while storage still claimed 300px.
                const el = panelRefs.current.get(st.key);
                if (el) el.style.height = `${Math.max(MIN_HEIGHT, Math.round(st.live))}px`;
                editLayout(prev => applyHeight(prev, st.key, st.live));
            }
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            // Unmounting mid-drag: the scheduled frame would otherwise still
            // fire and write to a detached node.
            const st = dragState.current;
            if (st?.raf != null) cancelAnimationFrame(st.raf);
            dragState.current = null;
        };
    }, [resizing, heighting, editLayout]);

    const nudgeResize = useCallback((splitId: string, boundary: number, delta: number) => {
        editLayout(prev => applyResize(prev, splitId, boundary, delta));
    }, [editLayout]);

    /** Arrow-button moves: the same two axes the drag has, without a pointer. */
    const movePanel = useCallback((key: WidgetKey, axis: Axis, dir: -1 | 1) => {
        editLayout(prev => applyMove(prev, key, axis, dir));
    }, [editLayout]);

    const nudgeHeight = useCallback((key: WidgetKey, delta: number) => {
        editLayout(prev => {
            // Measured, not assumed: a panel with no explicit height has to grow
            // from whatever it currently occupies, or the first press snaps it
            // to some default and the operator loses the size they had.
            const base = heightOf(prev, key)
                ?? panelRefs.current.get(key)?.getBoundingClientRect().height
                ?? MIN_HEIGHT;
            return applyHeight(prev, key, base + delta);
        });
    }, [editLayout]);

    const clearHeight = useCallback((key: WidgetKey) => {
        editLayout(prev => applyHeight(prev, key, null));
    }, [editLayout]);

    return {
        panelRefs, splitRefs, resizing, heighting,
        startWidthDrag, startHeightDrag, nudgeResize, movePanel, nudgeHeight, clearHeight,
    };
}

/**
 * Scroll the page while a panel is dragged over its top or bottom edge.
 *
 * The HTML5 drag API does not scroll the page. A fourteen-panel layout is two
 * or three screens tall, so without this the only reachable drop targets are
 * the ones that happened to be visible when the drag started — moving a panel
 * from the top of the layout to the bottom was simply not a gesture the
 * operator could perform.
 *
 * The pointer's depth into a band at the edge becomes a scroll speed, applied
 * once per animation frame: a nudge past the edge creeps, holding the pointer
 * at the very edge runs. Speed has to be proportional, not fixed, or the
 * operator is choosing between "too slow to cross a screen" and "overshoots
 * the target".
 */
export function useDragAutoScroll(dragKey: WidgetKey | null, panelRefs: PanelRefs): void {
    useEffect(() => {
        if (!dragKey) return;
        /** How deep the pointer must be into the edge for a full-speed scroll. */
        const BAND = 120;
        const MAX_STEP = 24;

        // The document scrolls today, but the panel is not the only thing that
        // could end up inside a scroller tomorrow, so ask the DOM rather than
        // assume. Starting from the dragged panel's own wrapper — NOT from the
        // element under the pointer — keeps this from grabbing a panel's
        // internal list scroller and scrolling that instead of the page.
        const scroller = (() => {
            let el: HTMLElement | null = panelRefs.current.get(dragKey)?.parentElement ?? null;
            while (el) {
                const oy = getComputedStyle(el).overflowY;
                // The margin is not fussiness. `overflow-x: hidden` on the page
                // root computes overflow-y to `auto` whether it was asked for or
                // not, so the walk meets a container that reports as scrollable
                // and has a pixel or two of rounding slack; scrolling THAT moves
                // nothing while the page stays put.
                if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight - el.clientHeight > 8) return el;
                el = el.parentElement;
            }
            return null;
        })();

        const viewportHeight = () => (scroller ? scroller.getBoundingClientRect().height : window.innerHeight);
        const viewportTop = () => (scroller ? scroller.getBoundingClientRect().top : 0);

        let pointerY = -1;
        let raf: number | null = null;

        const step = () => {
            raf = null;
            if (pointerY >= 0) {
                const top = viewportTop();
                const depthTop = pointerY - top;
                const depthBottom = top + viewportHeight() - pointerY;
                let delta = 0;
                if (depthTop < BAND) delta = -MAX_STEP * Math.min(1, (BAND - depthTop) / BAND);
                else if (depthBottom < BAND) delta = MAX_STEP * Math.min(1, (BAND - depthBottom) / BAND);
                if (delta !== 0) {
                    if (scroller) scroller.scrollTop += delta;
                    else window.scrollBy(0, delta);
                }
            }
            raf = requestAnimationFrame(step);
        };

        // CAPTURE phase, and that is not a detail — it is the whole reason this
        // works. Both the panel and the row-bar `dragover` handlers call
        // `stopPropagation()`, so a bubble-phase listener here hears nothing
        // while the pointer is over a panel, which is very nearly the whole
        // page. The symptom was not "no scrolling": `pointerY` simply kept its
        // last value from a gap between panels, so holding the pointer at the
        // top of the screen over a card carried on scrolling DOWN, and the drop
        // target ran away from the operator. Capture runs before any target
        // handler, so nothing downstream can silence it.
        const track = (e: DragEvent) => { pointerY = e.clientY; };
        window.addEventListener('dragover', track, true);
        raf = requestAnimationFrame(step);
        return () => {
            window.removeEventListener('dragover', track, true);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, [dragKey, panelRefs]);
}
