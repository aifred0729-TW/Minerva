import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Bell, RefreshCw, Eye, EyeOff, Sliders, Activity, History } from 'lucide-react';
import { useQuery, useReactiveVar } from "@apollo/client/react";
import { usePageVisible } from '../lib/usePageVisible';
import {
    KpiStrip,
    MissionHeroBanner,
    OperationTempoCard,
    TaskPipelineCard,
    OperationCard,
    C2MatrixCard,
    CallbackSurfaceCard,
    ActivityStreamCard,
    AssetStripCard,
    RecentPayloadsCard,
    AlertsCard,
    AttentionCard,
    deriveIssues,
    FootprintCard,
    ReachCard,
    TradecraftCard,
} from '../components/DashboardCards';
import { StatusWord, type Tone } from '../components/Instrument';
import { useAppStore } from '../store';
import { useShallow } from 'zustand/shallow';
import { useNavigate } from 'react-router-dom';
import { GET_DASHBOARD_DATA, GET_DASHBOARD_HISTORY } from '../lib/api';
import { useLazyQueryCompat } from '../lib/useQueryCompat';
import { cn } from '../lib/utils';
import { meState } from '../lib/state';
import { parseSchedule } from '../lib/operationSchedule';
import { getSkewedNow } from '../lib/time';
import { pushBroadcast } from '../lib/broadcastBus';
import * as kv from '../lib/mythicKVStore';
import {
    ALL_WIDGETS,
    OPERATOR_PRESET,
    LEAD_PRESET,
    allKeys,
    canonRoot,
    dropAsRow,
    dropBeside,
    hasWidget,
    parseLayout,
    seedLayout,
    serializeLayout,
    toggleWidget as toggleWidgetIn,
    type Axis,
    type Layout,
    type WidgetKey,
} from '../lib/dashboardLayout';
import {
    LayoutView,
    createDropStore,
    moveLabel,
    type DropTarget,
} from '../components/DashboardLayout';
import { useDragAutoScroll, useLayoutGestures } from '../lib/useLayoutGestures';

// ── Dashboard layout ────────────────────────────────────────────────────────
//
// The panel catalogue, the presets and every layout operation live in
// `lib/dashboardLayout` — a tree of splits, with no React in it. They moved out
// of this file when the layout stopped being two fixed levels (row → column →
// panel) and became a tree that nests without limit: the shape is where all the
// hard cases are, and out here it can be tested without a DOM.
//
// What stays in this file is the part that genuinely needs the browser: turning
// a node into elements, turning a pointer into a resize, and remembering the
// result.


// ── Analysis window ─────────────────────────────────────────────────────────

/**
 * This is a real `_gte` bound on the task query, not a label over a row limit,
 * so it has to be the operator's choice: an operation that ran last month is
 * entirely invisible through a 24h window, and one running right now is drowned
 * by a 90-day one.
 */
const RANGES = [
    { key: '24h', label: '24h', hours: 24 },
    { key: '7d', label: '7 days', hours: 24 * 7 },
    { key: '30d', label: '30 days', hours: 24 * 30 },
    { key: 'all', label: 'All time', hours: 24 * 365 * 5 },
] as const;
type RangeKey = typeof RANGES[number]['key'];
const RANGE_KEY = 'minerva-dashboard-range';
kv.manageKey(RANGE_KEY);

function loadRange(): RangeKey {
    const v = kv.getItem(RANGE_KEY);
    return RANGES.some(r => r.key === v) ? (v as RangeKey) : '7d';
}

// The dashboard entrance is CSS (`.mv-panel-enter` in index.css), not framer
// variants. Variants are resolved by reference and re-evaluated when a subtree
// re-renders, so a 10-second poll replayed the whole staggered entrance; a CSS
// animation is bound to the element and can only run again if the element is
// actually remounted. The page keeps a framer exit, which has no such problem
// because it runs on unmount.

// ── Perspective ─────────────────────────────────────────────────────────────

type Perspective = 'operator' | 'lead' | 'custom';

// ── Storage ─────────────────────────────────────────────────────────────────
//
// Layout and perspective live in Mythic's operator preferences, not in this
// browser.
//
// `mythicKVStore` is a localStorage-shaped façade over
// `updateOperatorPreferences`, the same mechanism Mythic's own dashboard uses
// for `customDashboardElements`. Arranging your console and then losing it
// because you opened a different browser — or a different machine mid-operation
// — is a real cost for a tool people run from more than one place.
//
// Older keys are READ and never written, so an operator who arranged their
// dashboard under a previous model keeps that arrangement, and an older Minerva
// build still finds a layout it can parse rather than one it cannot.
const LAYOUT_KEY = 'minerva-layout-v3';
const LEGACY_KEYS = ['minerva-custom-rows-v2', 'minerva-custom-rows-v1'];
const PERSPECTIVE_KEY = 'minerva-dashboard-perspective';

// Both written keys must be registered, or `setItem` writes to localStorage and
// never schedules the flush to Mythic — the sync would silently not happen.
kv.manageKey(LAYOUT_KEY);
kv.manageKey(PERSPECTIVE_KEY);

// `kv.getItem` already falls back to localStorage when a key has not been
// hydrated from preferences yet, which is also what carries an operator's
// pre-existing local layout across to the server on their next save.
function loadLayout(): Layout {
    for (const key of [LAYOUT_KEY, ...LEGACY_KEYS]) {
        const parsed = parseLayout(kv.getItem(key));
        if (parsed) return parsed;
    }
    return seedLayout();
}

function saveLayout(encoded: string) {
    kv.setItem(LAYOUT_KEY, encoded);
}


/**
 * The only thing on this page that ticks every second.
 *
 * It used to be a `now` state in the Dashboard body, which re-rendered all
 * fourteen panels once a second — every SVG path, every table, every donut —
 * to update one text node. Isolating the interval in a leaf component means
 * the tick costs exactly one text node again.
 */
const DataFreshness = React.memo(function DataFreshness({ lastUpdated }: { lastUpdated: number | null }) {
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(id);
    }, []);
    if (!lastUpdated) return <>Waiting for data</>;
    // "Changed", not "Updated": a quiet feed legitimately reports a large
    // number here, and calling that "updated" reads as a stalled connection.
    return <>Changed {Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s ago</>;
});

function loadPerspective(): Perspective {
    const stored = kv.getItem(PERSPECTIVE_KEY);
    if (stored === 'operator' || stored === 'lead' || stored === 'custom') return stored;
    return 'operator';
}

export default function Dashboard() {
    const { appState, setAppState, isSidebarCollapsed } = useAppStore(useShallow(s => ({ appState: s.appState, setAppState: s.setAppState, isSidebarCollapsed: s.isSidebarCollapsed })));
    const pageVisible = usePageVisible();
    const navigate = useNavigate();
    const me = useReactiveVar(meState);

    // Every operation-owned table in the query is filtered on this. Hasura would
    // otherwise scope most of them to *all* of the operator's operations while
    // scoping callbacks to just the current one, so the panels would be
    // computed over different populations. Skip entirely until we know which
    // operation we are in — a query with operation_id 0 returns a confident,
    // empty dashboard, which is worse than an obviously loading one.
    const operationId = me?.user?.current_operation_id || 0;
    // Mythic carries a per-operator clock preference and 19 files in its own UI
    // honour it. Panels that print a time should follow the operator, not this
    // machine's locale.
    const viewUtc = (me?.user?.view_utc_time as boolean) ?? false;

    const [range, setRange] = useState<RangeKey>(loadRange);
    const rangeDef = RANGES.find(r => r.key === range) ?? RANGES[1];
    // Recomputed only when the range changes, not on every render — a `since`
    // that moves every frame would make Apollo refetch continuously.
    // The analysis window is re-anchored every ten minutes, NOT every minute.
    //
    // `since` is a query variable, and changing a variable makes Apollo treat
    // it as a different query: `data` goes undefined until the new result
    // lands. With a minute cadence that meant the entire dashboard blanked and
    // re-filled once a minute — every counter to zero, the gateway badge
    // flipping — which is far worse than the window drifting. Ten minutes on a
    // 24h window is 0.7% of drift, and the `previousData` fallback below means
    // even that re-anchor is invisible.
    const [sinceAnchor, setSinceAnchor] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setSinceAnchor(Date.now()), 10 * 60_000);
        return () => clearInterval(id);
    }, []);
    const since = useMemo(
        () => new Date(sinceAnchor - rangeDef.hours * 3600_000).toISOString().replace('Z', ''),
        [rangeDef.hours, sinceAnchor],
    );

    /**
     * Full-history analysis, on demand.
     *
     * The live query is capped at 2000 tasks because it runs every 10 seconds;
     * that cap is what limits the tempo chart's window. This fires once, when
     * asked, with no limit at all — the same trade Mythic's own dashboard makes
     * permanently, offered here as a second gear rather than the only one.
     */
    const [loadHistory, { data: historyData, loading: historyLoading }] =
        useLazyQueryCompat<any>(GET_DASHBOARD_HISTORY, { fetchPolicy: 'network-only' });
    const historyTasks: any[] | null = historyData?.task ?? null;

    const { data: fresh, loading, error, refetch } = useQuery<any>(GET_DASHBOARD_DATA, {
        variables: { operation_id: operationId, since },
        skip: !operationId,
        pollInterval: pageVisible ? 10000 : 0,
    });

    /**
     * Keep showing the last good result while a new one is in flight — but only
     * if it belongs to the operation currently on screen.
     *
     * Apollo sets `data` to undefined whenever the query identity changes, and
     * every extraction below falls back to `[]` or 0, so a bare `??` fallback
     * is what stops the console emptying itself during a routine poll.
     *
     * `previousData` alone is NOT safe here. It is not variables-aware and is
     * never cleared, so switching operation renders the *previous* operation's
     * footholds, credentials and artifacts under the new operation's name, with
     * a green "online" badge and no cue that anything is stale. On a red-team
     * console that is not a flicker, it is showing the operator someone else's
     * targets. So the last good result is kept with the operation id it was
     * fetched for, and discarded the moment that id changes.
     */
    const [lastGood, setLastGood] = useState<{ opId: number; data: any } | null>(null);
    useEffect(() => {
        if (fresh) setLastGood({ opId: operationId, data: fresh });
    }, [fresh, operationId]);

    const data = fresh ?? (lastGood?.opId === operationId ? lastGood.data : undefined);

    /**
     * Four states, because three of them used to render as the fourth.
     *
     * `skip` does not mean "loading": Apollo's standby result is
     * `{ loading: false, data: undefined }`, so an operator with no current
     * operation used to get a permanent green "Gateway online / Nominal" over
     * a dashboard of zeros. An empty console that claims to be healthy is worse
     * than one that admits it has nothing.
     */
    const phase: 'no-operation' | 'first-load' | 'switching' | 'ready' =
        !operationId ? 'no-operation'
        : data ? 'ready'
        : lastGood ? 'switching'
        : 'first-load';
    const hasData = phase === 'ready';

    // Perspective state
    const [perspective, setPerspective] = useState<Perspective>(loadPerspective);
    const [layout, setLayout] = useState<Layout>(loadLayout);

    /**
     * Every layout edit goes through here: canonicalise, persist, render.
     *
     * The comparison is on the serialised form, not on identity. Each operation
     * rebuilds the tree, so identity always differs — including for the moves
     * that genuinely change nothing, like pushing the top row further up. Those
     * would otherwise re-render the page and write to Mythic's preferences on
     * every press.
     *
     * That serialisation is then the one handed to storage rather than being
     * thrown away and recomputed, and the last one written is remembered, so a
     * run of edits costs one encode each instead of three.
     */
    const savedRef = React.useRef<string | null>(null);
    const editLayout = useCallback((fn: (prev: Layout) => Layout) => {
        setLayout(prev => {
            const next = canonRoot(fn(prev));
            const encoded = serializeLayout(next);
            if (encoded === (savedRef.current ?? serializeLayout(prev))) return prev;
            savedRef.current = encoded;
            // Before hydration, hold the write rather than pinning this key as
            // "touched" against preferences that have not arrived.
            if (kv.isHydrated()) saveLayout(encoded);
            else pendingSaveRef.current = encoded;
            return next;
        });
    }, []);

    // Read by the hydration subscription below without making it re-subscribe.
    const editingRef = React.useRef(false);

    /**
     * Adopt the server-side layout when it arrives.
     *
     * `loadLayout` reads the KV store exactly once, at mount — but Mythic's
     * operator preferences are hydrated asynchronously, and the Dashboard is
     * the landing route, so it usually mounts first. Without this the operator
     * got the localStorage copy (or the seed layout on a fresh browser), and
     * the first edit then flushed that seed *up* to Mythic, overwriting the
     * real layout. That is the exact failure the server-side persistence was
     * added to prevent.
     *
     * Only adopted while the operator has not started editing, so hydration
     * arriving mid-drag cannot yank the layout out from under them.
     */
    const adoptedRef = React.useRef(false);
    useEffect(() => {
        const adopt = () => {
            if (adoptedRef.current || editingRef.current) return;
            adoptedRef.current = true;
            setLayout(loadLayout());
            // The layout just changed without going through `editLayout`, so
            // what it last wrote no longer describes what is on screen. Left
            // stale, an edit that happened to reproduce that exact tree would
            // compare equal and be dropped instead of applied.
            savedRef.current = null;
            setPerspective(loadPerspective());
        };
        // Preferences can arrive before this effect runs, and then no
        // subscription will ever fire — `hydrateFromPreferences` only emits for
        // keys it actually carries, and a fresh operator has none of ours.
        if (kv.isHydrated()) adopt();
        // Every key, current and legacy: an operator who has not edited since
        // the layout model changed has nothing under the current key at all, so
        // hydration would announce only the old one, no adoption would fire, and
        // their real layout would sit in Mythic unread until the first edit
        // overwrote it.
        const unsubs = [LAYOUT_KEY, ...LEGACY_KEYS].map(k => kv.subscribe(k, adopt));
        return () => unsubs.forEach(u => u());
    }, []);

    /**
     * Do not flush a layout upwards until we know it is the operator's own.
     *
     * `kv.setItem` marks a key as touched, and `hydrateFromPreferences` then
     * skips touched keys forever — so a single edit made in the window before
     * preferences land pins the local fallback (usually the seed preset) in
     * place and flushes it over the real server-side layout. That is exactly the
     * failure server-side persistence exists to prevent, and it needs only a
     * click on Custom and one drag to happen. Edits made in that window stay on
     * screen and in localStorage; they reach Mythic once we know what we would
     * be overwriting.
     */
    const pendingSaveRef = React.useRef<string | null>(null);
    useEffect(() => {
        if (kv.isHydrated()) return;
        let done = false;
        const flush = () => {
            if (done || !kv.isHydrated()) return;
            done = true;
            const pending = pendingSaveRef.current;
            pendingSaveRef.current = null;
            if (pending) saveLayout(pending);
        };
        const id = setInterval(flush, 250);
        return () => clearInterval(id);
    }, []);

    const [editing, setEditing] = useState(false);
    editingRef.current = editing;
    const [dragKey, setDragKey] = useState<WidgetKey | null>(null);

    // Width and height dragging, the arrow-key equivalents, and the page
    // scrolling that the HTML5 drag API declines to do. All of it is layout
    // behaviour rather than dashboard behaviour, so it lives with the layout.
    const {
        panelRefs, splitRefs, resizing, heighting,
        startWidthDrag, startHeightDrag, nudgeResize, movePanel, nudgeHeight, clearHeight,
    } = useLayoutGestures(editLayout);
    useDragAutoScroll(dragKey, panelRefs);

    const handlePerspectiveChange = useCallback((p: Perspective) => {
        setPerspective(p);
        setEditing(false);
        kv.setItem(PERSPECTIVE_KEY, p);
    }, []);

    const toggleWidget = useCallback((key: WidgetKey) => {
        editLayout(prev => toggleWidgetIn(prev, key));
    }, [editLayout]);

    useEffect(() => {
        if (appState === 'LOGIN') setAppState('DASHBOARD');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);



    // Safe data extraction
    // These are memoised, unlike their plain neighbours, because each feeds a
    // useMemo dependency list. `x || []` returns a fresh array on every render,
    // so without this the derived issue list and the latency percentile
    // recompute on every tick of the 1Hz freshness clock.
    const callbacks: any[] = useMemo(() => data?.callback || [], [data?.callback]);
    const totalCallbacks = data?.all_callbacks?.length || 0;
    const payloads: any[] = useMemo(() => data?.payload || [], [data?.payload]);
    // Memoised, unlike its neighbours, because `|| []` mints a fresh array on
    // every render and this one feeds a useMemo dependency list — without it
    // the schedule lookup below re-runs on every tick of the 1Hz clock.
    const operations: any[] = useMemo(() => data?.operation || [], [data?.operation]);
    const totalOperations = data?.all_operations?.length || 0;
    const c2profiles: any[] = useMemo(() => data?.c2profile || [], [data?.c2profile]);
    const tasks: any[] = useMemo(() => data?.task || [], [data?.task]);
    const operators: any[] = useMemo(() => data?.operators || [], [data?.operators]);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.completed === true).length;
    const errorTasks = tasks.filter((t: any) => t.status === 'error').length;
    const opsecTasks = tasks.filter((t: any) => (t.opsec_pre_blocked === true && t.opsec_pre_bypassed !== true) || (t.opsec_post_blocked === true && t.opsec_post_bypassed !== true)).length;
    const credentials = data?.credential_aggregate?.aggregate?.count || 0;
    const keylogs = data?.keylog_aggregate?.aggregate?.count || 0;
    const downloads = data?.filemeta_aggregate?.aggregate?.count || 0;
    const uploads = data?.uploaded_files?.aggregate?.count || 0;
    const screenshots = data?.screenshot_aggregate?.aggregate?.count || 0;
    const activeOperation = { name: me?.user?.current_operation || "NONE", id: me?.user?.current_operation_id || 0 };
    const operatorName = me?.user?.username || 'UNKNOWN';

    // When data last actually CHANGED. State, not a ref: a ref written in an
    // effect does not schedule a render, so reading it during render yields the
    // value from before the effect ran and the first arrival still rendered
    // "Waiting for data".
    //
    // KNOWN LIMIT, stated because the label is easy to over-read: Apollo emits
    // nothing at all when a poll returns deep-equal data, so on a quiet
    // operation this climbs past the poll interval even though the gateway is
    // answering every 10s. It reports "last change", not "last contact" — the
    // label below says so. Reporting true liveness needs a poll-completion
    // signal (networkStatus), not `data` identity.
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    useEffect(() => { if (data) setLastUpdated(Date.now()); }, [data]);

    // A coarse tick, purely so time-dependent derivations re-run.
    //
    // `isCallbackAlive` reads Date.now(). Memoising anything that calls it on
    // data alone freezes it: a callback going quiet is precisely the case
    // where its row STOPS changing, so the panel would keep printing "Active"
    // for a node that has gone dark — the failure the project's rule about
    // never using the `dead` column exists to prevent.
    const [livenessTick, setLivenessTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setLivenessTick(n => n + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    // Stable per-destination handlers. Inline arrows here would hand every
    // panel a new function on every render, which defeats React.memo on the
    // panels entirely — the memo compares props by identity.
    const goCallbacks = useCallback(() => navigate('/callbacks'), [navigate]);
    const goOpsec = useCallback(() => navigate('/opsec'), [navigate]);
    const goOperations = useCallback(() => navigate('/operations'), [navigate]);
    const goEvents = useCallback(() => navigate('/events'), [navigate]);
    const goTunnels = useCallback(() => navigate('/tunnels'), [navigate]);
    const goMitre = useCallback(() => navigate('/mitre'), [navigate]);
    const goPath = useCallback((href: string) => navigate(href), [navigate]);

    // p99 latency, needed by the issue derivation below. Same clocks as the
    // Task pipeline panel: processed - preprocessing, nulls excluded.
    const latencyP99 = useMemo(() => {
        const durs = tasks
            .map((t: any) => {
                const a = t?.status_timestamp_preprocessing ? Date.parse(`${t.status_timestamp_preprocessing}Z`) : 0;
                const b = t?.status_timestamp_processed ? Date.parse(`${t.status_timestamp_processed}Z`) : 0;
                return a && b ? b - a : null;
            })
            .filter((d: number | null): d is number => d !== null && d >= 0)
            .sort((x: number, y: number) => x - y);
        return durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.99))] : 0;
    }, [tasks]);

    // Sources added once the query was widened past the original seven tables.
    // All memoised for the same reason as the block above: each is a prop of a
    // React.memo'd panel, and `x || []` returns a fresh array every render, so
    // without this the memo compares unequal every time and the panel — plus
    // all of its own internal memos — recomputes on every Dashboard render.
    const events: any[] = useMemo(() => data?.operationeventlog || [], [data?.operationeventlog]);
    const recentTasks: any[] = useMemo(() => data?.recentTasks || [], [data?.recentTasks]);
    const recentCredentials: any[] = useMemo(() => data?.recentCredentials || [], [data?.recentCredentials]);
    const openAlerts = data?.open_alerts?.aggregate?.count || 0;
    const artifacts: any[] = useMemo(() => data?.taskartifact || [], [data?.taskartifact]);
    const artifactTotal = data?.taskartifact_aggregate?.aggregate?.count || 0;
    const cleanupPending = data?.cleanup_pending?.aggregate?.count || 0;
    const payloadsOnHost: any[] = useMemo(() => data?.payloadonhost || [], [data?.payloadonhost]);
    // No aggregate available to the operator role — this is the size of the
    // fetched slice, and the panel labels it as such rather than as a total.
    const hostTotal = payloadsOnHost.length;
    const credentialRows: any[] = useMemo(() => data?.credential || [], [data?.credential]);
    const edges: any[] = useMemo(() => data?.callbackgraphedge || [], [data?.callbackgraphedge]);
    const ports: any[] = useMemo(() => data?.callbackport || [], [data?.callbackport]);
    const attackTasks: any[] = useMemo(() => data?.attacktask || [], [data?.attacktask]);

    const c2Running = c2profiles.filter((p: any) => p.running).length;
    const c2Down = c2profiles.length - c2Running;

    // Link presentation, derived once. The top rail, the hero panel and the
    // system status panel all report the gateway's state; computing it in three
    // places is how a console ends up saying Online and Fault at the same time.
    //
    // This is one of the very few places the accent green survives. Colour on
    // this page marks the exception, not the baseline — a console that is green
    // whenever nothing is wrong has spent its loudest channel on its least
    // interesting state, and the amber that actually needs an operator drowns
    // in it. "The C2 is breathing" is the one nominal fact worth a colour.
    // An error while we still hold a result is a failed *refresh*, not a dead
    // gateway — the difference matters, because one of them means stop what you
    // are doing. And "no operation selected" is not a health state at all.
    const linkTone: Tone =
        phase === 'no-operation' ? 'idle'
        : error && !hasData ? 'fail'
        : error ? 'warn'
        : phase !== 'ready' ? 'warn'
        : 'live';
    const linkWord =
        phase === 'no-operation' ? 'No operation selected'
        : error && !hasData ? 'Gateway offline'
        : error ? 'Refresh failed'
        : phase === 'switching' ? 'Loading operation'
        : phase === 'first-load' ? 'Connecting'
        : 'Gateway online';

    // Everything Attention Required renders, derived once. Operation health is
    // then a summary of that same list — so the headline state and the list of
    // problems can never contradict each other, which is exactly what an
    // independently-computed score allowed.
    // `livenessTick` is a deliberate cache key, and the lint rule cannot see why:
    // deriveIssues calls isCallbackAlive, which reads Date.now() rather than any
    // value in this dependency list. Without the tick the derived issues — and
    // the operation-health state built from them — freeze at the last data
    // change, which is precisely the case where a callback has gone quiet.
    const issues = useMemo(() => {
        return deriveIssues({
            callbacks, edges, c2profiles, tasks,
            opsecTasks, openAlerts, cleanupPending,
            latency: { p99: latencyP99, outstanding: 0 },
            payloads,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callbacks, edges, c2profiles, tasks, opsecTasks, openAlerts, cleanupPending, latencyP99, payloads, livenessTick]);

    const health = useMemo(() => {
        const critical = issues.filter(i => i.tone === 'fail').length;
        if (critical > 0) return {
            label: 'Degraded',
            detail: `${critical} critical ${critical === 1 ? 'issue' : 'issues'}, ${issues.length} total`,
            tone: 'fail' as Tone,
        };
        if (issues.length > 0) return {
            label: 'Attention',
            detail: `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} to review`,
            tone: 'warn' as Tone,
        };
        return { label: 'Nominal', detail: 'No open issues', tone: 'live' as Tone };
    }, [issues]);

    // ── Operation schedule (T-/T+) ────────────────────────────────────
    const currentOpRow = useMemo(
        () => operations.find((op: any) => op.id === activeOperation?.id) || operations[0],
        [operations, activeOperation?.id]
    );
    const schedule = useMemo(
        () => parseSchedule(currentOpRow?.banner_text),
        [currentOpRow?.banner_text]
    );
    const startMs = schedule.startMs;
    const opName = currentOpRow?.name || activeOperation?.name || 'OPERATION';

    // Scheduler: 1 Hz tick — pushes T-30s and T-0 broadcasts (each fires once via key dedupe).
    // Audio (callback.mp3) is played automatically by broadcastBus on every successful push.
    useEffect(() => {
        if (!startMs) return;
        const fireIfDue = () => {
            const now = getSkewedNow().getTime();
            const remainingMs = startMs - now;

            // Pre-start broadcast: T-30s (fires once when countdown enters 30 s window)
            if (remainingMs <= 30_000 && remainingMs > 0) {
                pushBroadcast({
                    level: 'warning',
                    title: `T-30 :: ${opName}`,
                    message: 'Operation begins in 30 seconds — all operators stand by.',
                    key: `op-${currentOpRow?.id}-${startMs}-pre`,
                    ttlMs: 15_000,
                });
            }

            // Go broadcast: T-0 (fires once within +/- 5 s of start)
            if (remainingMs <= 0 && remainingMs > -5_000) {
                pushBroadcast({
                    level: 'critical',
                    title: `T-0 :: ${opName} LIVE`,
                    message: 'Operation has started — execute as briefed.',
                    key: `op-${currentOpRow?.id}-${startMs}-go`,
                    ttlMs: 15_000,
                });
            }
        };
        fireIfDue();
        const id = setInterval(fireIfDue, 1000);
        return () => clearInterval(id);
    }, [startMs, opName, currentOpRow?.id]);

    // Widget renderer
    const renderWidget = useCallback((key: WidgetKey) => {
        switch (key) {
            case 'kpiStrip':
                return <KpiStrip
                    callbacks={callbacks}
                    totalCallbacks={totalCallbacks}
                    tasks={tasks}
                    totalTasks={totalTasks}
                    completedTasks={completedTasks}
                    errorTasks={errorTasks}
                    opsecTasks={opsecTasks}
                    onCallbacks={goCallbacks}
                    onOpsec={goOpsec}
                />;
            case 'tempo':
                return <OperationTempoCard
                    tasks={historyTasks ?? tasks}
                    full={!!historyTasks}
                    sliceSize={tasks.length}
                />;
            case 'taskPipeline':
                return <TaskPipelineCard
                    tasks={tasks}
                    totalTasks={totalTasks}
                    completedTasks={completedTasks}
                    errorTasks={errorTasks}
                    opsecTasks={opsecTasks}
                />;
            case 'operation':
                return <OperationCard
                    startMs={startMs}
                    operations={operations}
                    currentOpId={activeOperation?.id}
                    totalOperations={totalOperations}
                    operators={operators}
                    onOpen={goOperations}
                    viewUtc={viewUtc}
                />;
            case 'c2Matrix':
                return <C2MatrixCard profiles={c2profiles} />;
            case 'callbackSurface':
                return <CallbackSurfaceCard callbacks={callbacks} edges={edges} onOpen={goCallbacks} />;
            case 'attention':
                return <AttentionCard issues={issues} onNavigate={goPath} />;
            case 'activityStream':
                return <ActivityStreamCard
                    tasks={recentTasks}
                    callbacks={callbacks}
                    credentials={recentCredentials}
                    edges={edges}
                    onOpen={goEvents}
                />;
            case 'assetStrip':
                return <AssetStripCard
                    credentials={credentials}
                    keylogs={keylogs}
                    downloads={downloads}
                    uploads={uploads}
                    screenshots={screenshots}
                    credentialRows={credentialRows}
                />;
            case 'recentPayloads':
                return <RecentPayloadsCard payloads={payloads} />;
            case 'alerts':
                return <AlertsCard events={events} openAlerts={openAlerts} onOpen={goEvents} />;
            case 'footprint':
                return <FootprintCard
                    artifacts={artifacts}
                    payloadsOnHost={payloadsOnHost}
                    artifactTotal={artifactTotal}
                    cleanupPending={cleanupPending}
                    hostTotal={hostTotal}
                />;
            case 'reach':
                return <ReachCard edges={edges} ports={ports} callbacks={callbacks} onOpen={goTunnels} />;
            case 'tradecraft':
                return <TradecraftCard attackTasks={attackTasks} onOpen={goMitre} />;
            default:
                return null;
        }
    // Every panel's data, listed in full so the identity of this function is a
    // reliable signal that something a panel renders has actually changed.
    // Deliberately exhaustive rather than `[]`: a missed entry here is a panel
    // that quietly keeps showing the previous operation's numbers, and this is a
    // console people make targeting decisions on.
    }, [
        activeOperation?.id, artifactTotal, artifacts, attackTasks, c2profiles, callbacks,
        cleanupPending, completedTasks, credentialRows, credentials, downloads, edges,
        errorTasks, events, goCallbacks, goEvents, goMitre, goOperations, goOpsec, goPath,
        goTunnels, historyTasks, hostTotal, issues, keylogs, openAlerts, operations, operators,
        opsecTasks, payloads, payloadsOnHost, ports, recentCredentials, recentTasks,
        screenshots, startMs, tasks, totalCallbacks, totalOperations, totalTasks, uploads,
        viewUtc,
    ]);

    // ── Wiring the layout view ──────────────────────────────────────────
    //
    // The tree itself is rendered by `components/DashboardLayout`. What stays
    // here is the state it reads and the callbacks it fires, because those are
    // what own the data and the storage.
    const presetLayout = useMemo(
        () => (perspective === 'lead' ? LEAD_PRESET() : OPERATOR_PRESET()),
        [perspective],
    );
    const shownKeys = useMemo(() => allKeys(layout), [layout]);
    /** Entrance-stagger position per panel, so it runs down the page in reading order. */
    const order = useMemo(
        () => new Map(allKeys(perspective === 'custom' ? layout : presetLayout).map((k, i) => [k, i + 1])),
        [layout, presetLayout, perspective],
    );

    /**
     * The page's entrance animation, and when to stop applying it.
     *
     * `.mv-panel-enter` holds a panel invisible for `index × 45ms` and then
     * fades it in. That is right on arrival and wrong on every edit afterwards:
     * a move remounts the panel, restarting the animation, so the card the
     * operator just moved vanished for up to a second. The class is dropped once
     * the arrival is over — long enough after mount that no in-flight animation
     * is cut short — and re-armed when the perspective changes, because that is
     * a genuine arrival of a different layout.
     */
    const [entranceDone, setEntranceDone] = useState(false);
    useEffect(() => {
        setEntranceDone(false);
        // The last panel starts at 13 × 45ms and runs for 400ms.
        const id = setTimeout(() => setEntranceDone(true), 1200);
        return () => clearTimeout(id);
    }, [perspective]);

    /**
     * Restore focus after an arrow-button move.
     *
     * A move that changes a panel's parent remounts it, which destroys the
     * button that was just pressed — focus falls back to `<body>` and the
     * operator has to tab all the way in again to press it twice. Measured at
     * 42% of presses. The replacement button carries the same accessible name,
     * so that is what we re-find it by.
     */
    const pendingFocusRef = React.useRef<string | null>(null);
    const onMove = useCallback((key: WidgetKey, axis: Axis, dir: -1 | 1) => {
        pendingFocusRef.current = moveLabel(key, axis, dir);
        movePanel(key, axis, dir);
    }, [movePanel]);
    React.useLayoutEffect(() => {
        const want = pendingFocusRef.current;
        if (!want) return;
        pendingFocusRef.current = null;
        // Only steal focus back if the move actually took it — a move that did
        // not remount anything has left focus where it belongs.
        if (document.activeElement && document.activeElement !== document.body) return;
        document.querySelector<HTMLElement>(`[aria-label="${want}"]`)?.focus();
    }, [layout]);

    /**
     * The drop target, deliberately NOT React state.
     *
     * `dragover` fires at pointer rate, and routing it through state re-rendered
     * the whole page — every card, wrapper and closure — on every move. Measured
     * in the running console that was ~40ms a move, so the drag lurched along at
     * about 25fps and got worse the more panels were on screen, which is exactly
     * backwards. The indicators subscribe to this store instead and each reads
     * one primitive, so a move wakes the two panels whose indicator changed.
     */
    const [drops] = useState(createDropStore);

    const onDragStart = useCallback((key: WidgetKey) => setDragKey(key), []);
    const onDragEnd = useCallback(() => { setDragKey(null); drops.set(null); }, [drops]);
    const onDropBeside = useCallback((t: DropTarget) => {
        const moved = dragKey;
        if (!moved || t.kind !== 'beside') return;
        editLayout(prev => dropBeside(prev, moved, t.anchor, t.side));
        setDragKey(null); drops.set(null);
    }, [dragKey, drops, editLayout]);
    const onDropRow = useCallback((beforeIdx: number) => {
        const moved = dragKey;
        if (!moved) return;
        editLayout(prev => dropAsRow(prev, moved, beforeIdx));
        setDragKey(null); drops.set(null);
    }, [dragKey, drops, editLayout]);

    const ctx = useMemo(() => ({
        editing, dragKey, resizing, heighting, order, drops, panelRefs, splitRefs,
        animate: !entranceDone,
        renderWidget,
        onDragStart, onDragEnd, onDropBeside, onDropRow,
        onMove,
        onWidthDown: startWidthDrag,
        onWidthNudge: nudgeResize,
        onHeightDown: startHeightDrag,
        onHeightNudge: nudgeHeight,
        onHeightClear: clearHeight,
    }), [
        editing, dragKey, resizing, heighting, order, drops, renderWidget, panelRefs, splitRefs,
        entranceDone, onDragStart, onDragEnd, onDropBeside, onDropRow, onMove,
        startWidthDrag, nudgeResize, startHeightDrag, nudgeHeight, clearHeight,
    ]);

    return (
        <div className="min-h-screen bg-void text-signal font-mono selection:bg-signal selection:text-void overflow-x-hidden">
            {/* No top padding: the instrument rail is the console's own top edge
                and has to reach it, or page content scrolls through the gap
                above it. Horizontal padding stays and the rail bleeds back out
                through negative margins. */}
            <div className={cn(
                "transition-all duration-300 px-6 lg:px-10 pt-0 pb-6 min-h-screen",
                isSidebarCollapsed ? "ml-16" : "ml-64",
            )}>
                <AnimatePresence>
                    {appState === 'DASHBOARD' && (
                        <motion.div
                            key="dashboard-content"
                            // `initial={false}` and no variants: this wrapper now
                            // exists only to animate the EXIT when the operator
                            // leaves. The entrance is CSS on the panels
                            // themselves, so arriving data cannot replay it.
                            initial={false}
                            exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)', transition: { duration: 0.35, ease: 'easeInOut' } }}
                        >
                            {/* ── Top instrument rail ──────────────────────────────
                                The login screen's screen-edge chrome, adapted to a
                                page that scrolls: sticky rather than fixed, so it
                                behaves as the console's own top edge and the
                                readouts on it never leave the operator's view.
                                Identity left, link state and controls right — the
                                same left-says-what / right-says-how-it-is-doing
                                split every panel below it uses. */}
                            <header className="sticky top-0 z-30 -mx-6 mb-5 flex items-center justify-between gap-4 border-b border-signal/20 bg-void/90 px-6 py-2.5 backdrop-blur-sm lg:-mx-10 lg:px-10">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <Shield size={14} strokeWidth={2} className="shrink-0 text-signal" aria-hidden="true" />
                                    <h1 className="text-[13px] font-bold tracking-[0.14em] text-signal">MINERVA</h1>
                                    <span className="hidden text-[13px] text-signal opacity-60 sm:inline">
                                        Operation command center
                                    </span>
                                    <span aria-hidden="true" className="hidden h-3 w-px bg-signal/20 sm:inline-block" />
                                    <span className="hidden min-w-0 truncate text-[13px] text-signal md:inline">
                                        <span className="opacity-60">Operation</span>{' '}
                                        <span className="font-bold">{activeOperation?.name || 'None'}</span>
                                    </span>
                                </div>

                                <div className="flex shrink-0 items-center gap-4">
                                    {/* One atomic status message rather than a bare
                                        live number, so a screen reader is told what
                                        changed instead of just hearing a digit. */}
                                    <StatusWord tone={linkTone} dot className="hidden md:inline-flex">
                                        <span role="status" aria-atomic="true">{linkWord}</span>
                                    </StatusWord>
                                    {/* Data freshness, not a promise. "Refreshes
                                        every 10s" says what is configured; this
                                        says when data actually last arrived,
                                        which is what tells you the feed died. */}
                                    <span className="hidden text-[13px] tabular-nums text-signal opacity-60 lg:inline">
                                        <DataFreshness lastUpdated={lastUpdated} />
                                    </span>

                                    {/* Analysis window — a real query bound. */}
                                    <div role="group" aria-label="Analysis window"
                                        className="hidden overflow-hidden rounded-sm border border-signal/20 sm:inline-flex">
                                        {RANGES.map(r => (
                                            <button
                                                key={r.key}
                                                onClick={() => { setRange(r.key); kv.setItem(RANGE_KEY, r.key); }}
                                                aria-pressed={range === r.key}
                                                className={cn(
                                                    'min-h-[32px] px-3 text-[12px] transition-colors',
                                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                                                    range === r.key ? 'bg-signal text-void' : 'text-signal hover:bg-signal/10',
                                                )}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => loadHistory({ variables: { operation_id: operationId } })}
                                        disabled={historyLoading || !operationId}
                                        title={historyTasks
                                            ? 'Reload the full task history for this operation'
                                            : 'Load every task in this operation, not just the newest 500'}
                                        aria-label="Load full operation history"
                                        className={cn(
                                            'hidden h-8 items-center gap-2 rounded-sm border px-3 text-[12px] transition-colors sm:inline-flex',
                                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                            historyTasks
                                                ? 'border-signal/45 text-signal'
                                                : 'border-signal/20 text-signal hover:border-signal/40',
                                            historyLoading && 'opacity-60',
                                        )}
                                    >
                                        <History size={13} strokeWidth={2} aria-hidden="true"
                                            className={cn(historyLoading && 'animate-spin')} />
                                        {historyLoading ? 'Loading…' : historyTasks ? 'Full history' : 'Analyse all'}
                                    </button>
                                    <button
                                        onClick={() => { void refetch().catch(() => { /* surfaced by `error` below */ }); }}
                                        title="Refresh"
                                        aria-label="Refresh dashboard data"
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-sm border border-signal/20 text-signal transition-colors',
                                            'hover:border-signal/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                            loading && 'animate-spin',
                                        )}
                                    >
                                        <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                    <button
                                        onClick={() => navigate('/opsec')}
                                        title="OPSEC review queue"
                                        aria-label={`OPSEC review queue, ${opsecTasks} pending`}
                                        className="relative flex h-8 w-8 items-center justify-center rounded-sm border border-signal/20 text-signal transition-colors hover:border-signal/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                                    >
                                        <Bell size={13} strokeWidth={2} aria-hidden="true" />
                                        {opsecTasks > 0 && (
                                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-void bg-amber-400 px-1 text-[9px] font-bold tabular-nums text-void">
                                                {opsecTasks}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </header>

                            {/* Mission Hero Banner — always shown, anchors the page */}
                            <div
                                className="mv-panel-enter mb-5"
                                style={{ '--mv-panel-index': 0 } as React.CSSProperties}
                            >
                                <MissionHeroBanner
                                    operationName={activeOperation?.name || 'NONE'}
                                    operatorName={operatorName}
                                    callbackCount={callbacks.length}
                                    totalCallbacks={totalCallbacks}
                                    c2Running={c2Running}
                                    c2Total={c2profiles.length}
                                    health={health}
                                    // Same semantics as the top rail: a refresh in
                                    // flight over data we already have is not a
                                    // loading state the operator needs to see, but
                                    // an operation switch very much is.
                                    loading={phase !== 'ready'}
                                    error={!!error && !hasData}
                                    viewUtc={viewUtc}
                                />
                            </div>

                            {/* ── Perspective selector ─────────────────────────────
                                A segmented control rather than underlined tabs:
                                the active segment inverts (bg-signal / text-void),
                                which is the loudest thing on the page and is
                                exactly what the operator needs to be certain of
                                before reading anything below it. */}
                            <div className="mb-5 flex flex-wrap items-center gap-3">
                                <div
                                    role="tablist"
                                    aria-label="Dashboard perspective"
                                    className="inline-flex overflow-hidden rounded-sm border border-signal/20"
                                >
                                    {(['operator', 'lead'] as Perspective[]).map(p => (
                                        <button
                                            key={p}
                                            role="tab"
                                            aria-selected={perspective === p}
                                            onClick={() => handlePerspectiveChange(p)}
                                            className={cn(
                                                'min-h-[36px] px-5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                                                perspective === p
                                                    ? 'bg-signal text-void'
                                                    : 'text-signal hover:bg-signal/10',
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => {
                                        if (perspective !== 'custom') {
                                            handlePerspectiveChange('custom');
                                            setEditing(true);
                                        } else {
                                            setEditing(e => !e);
                                        }
                                    }}
                                    aria-pressed={perspective === 'custom' && editing}
                                    className={cn(
                                        'inline-flex min-h-[36px] items-center gap-2 rounded-sm border px-4 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                        perspective === 'custom' && editing
                                            ? 'border-signal bg-signal text-void'
                                            : perspective === 'custom'
                                                ? 'border-signal/40 text-signal hover:border-signal'
                                                : 'border-signal/20 text-signal hover:border-signal/40',
                                    )}
                                >
                                    <Sliders size={12} strokeWidth={2} aria-hidden="true" />
                                    {perspective === 'custom' && editing ? 'Done' : 'Custom'}
                                </button>

                                {perspective === 'custom' && editing && (
                                    <span className="text-[13px] text-signal opacity-60">
                                        Drop a panel on another's left or right edge to sit beside it, on its top or
                                        bottom half to sit above or below — inside a column, inside a row, as deep as
                                        you like. Side bars resize, bottom bar sets height.
                                    </span>
                                )}
                            </div>

                            {/* Custom mode: widget selector (toggle visibility) */}
                            <AnimatePresence>
                                {perspective === 'custom' && editing && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden mb-5"
                                    >
                                        <div className="rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm">
                                            <div className="flex items-center justify-between gap-3 border-b border-signal/15 px-4 py-2">
                                                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal">Panel selection</span>
                                                <span className="text-[11px] tabular-nums text-signal opacity-70">
                                                    {shownKeys.length} of {ALL_WIDGETS.length} shown
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 p-4">
                                                {ALL_WIDGETS.map(w => {
                                                    const active = hasWidget(layout, w.key);
                                                    return (
                                                        <button
                                                            key={w.key}
                                                            onClick={() => toggleWidget(w.key)}
                                                            aria-pressed={active}
                                                            className={cn(
                                                                'inline-flex min-h-[36px] items-center gap-2 rounded-sm border px-3.5 text-[13px] transition-colors',
                                                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                                                active
                                                                    ? 'border-signal/50 bg-signal/10 text-signal'
                                                                    : 'border-signal/20 text-signal opacity-50 hover:opacity-100',
                                                            )}
                                                        >
                                                            {active
                                                                ? <Eye size={12} strokeWidth={2} aria-hidden="true" />
                                                                : <EyeOff size={12} strokeWidth={2} aria-hidden="true" />}
                                                            {w.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ── Layout ──────────────────────────────────────────
                                One recursive view for both paths. A preset is
                                the same tree an operator builds by hand, so a
                                second renderer would only mean two places to fix
                                whenever a panel's sizing rules change. */}
                            <LayoutView
                                layout={perspective === 'custom' ? layout : presetLayout}
                                ctx={ctx}
                                interactive={perspective === 'custom'}
                            />

                            {/* ── Bottom instrument rail ───────────────────────────
                                The other half of the screen frame. Sticky rather
                                than fixed so it sits inside the sidebar-offset
                                content column instead of running underneath the
                                sidebar. Carries the four counts an operator
                                should never have to scroll to find. */}
                            <div className="sticky bottom-0 z-30 -mx-6 mt-5 flex items-center justify-between gap-4 border-t border-signal/20 bg-void/90 px-6 py-2 backdrop-blur-sm lg:-mx-10 lg:px-10">
                                <div className="flex min-w-0 items-center gap-5 overflow-hidden">
                                    <span className="flex shrink-0 items-center gap-2 text-[13px]">
                                        <Activity size={13} strokeWidth={2} className="text-signal" aria-hidden="true" />
                                        <span className="text-signal opacity-60">Callbacks</span>
                                        <span className="font-bold tabular-nums text-signal">{callbacks.length}/{totalCallbacks}</span>
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-2 text-[13px] sm:flex">
                                        <span className="text-signal opacity-60">Tasks</span>
                                        <span className="font-bold tabular-nums text-signal">{totalTasks}</span>
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-2 text-[13px] md:flex">
                                        <span className="text-signal opacity-60">OPSEC</span>
                                        <StatusWord tone={opsecTasks > 0 ? 'warn' : 'signal'}>
                                            {opsecTasks > 0 ? `${opsecTasks} pending` : 'Clear'}
                                        </StatusWord>
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-2 text-[13px] lg:flex">
                                        <span className="text-signal opacity-60">C2</span>
                                        <StatusWord tone={c2profiles.length > 0 && c2Down === 0 ? 'signal' : c2Running > 0 ? 'warn' : 'fail'}>
                                            {c2Running}/{c2profiles.length} up
                                        </StatusWord>
                                    </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-5">
                                    <span className="hidden items-center gap-2 text-[13px] md:flex">
                                        <span className="text-signal opacity-60">Health</span>
                                        <StatusWord tone={health.tone}>{health.label}</StatusWord>
                                    </span>
                                    <span className="text-[13px] text-signal opacity-60">Build 2.2.0</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
