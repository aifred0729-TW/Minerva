import React, { useMemo, useEffect, useState } from 'react';
import {
    Activity, Box, Terminal, Server, Key, Download, Upload, Image, Shield,
    Clock, CheckCircle, AlertTriangle, Radio, Zap, Timer, Calendar,
    TrendingUp, TrendingDown, Minus, Siren, Footprints, Network, Crosshair,
} from 'lucide-react';
import { tDelta } from '../lib/operationSchedule';
import { getSkewedNow } from '../lib/time';
import { isCallbackAlive } from '../lib/utils';
import { cn } from '../lib/utils';
import {
    InstrumentPanel, DataRow, Readout, ChannelRow, Donut, LegendRow,
    Meter, RadialArc, LineChart, StatusTile, ShareRing, Avatar,
    StatusWord, NoData, toneText, toneStroke, toneFill, LABEL, type Tone,
} from './Instrument';

/**
 * Dashboard widgets, built on the console panel kit.
 *
 * Each widget is one instrument: a header strip saying what it is and how it is
 * doing, a body of readouts / rows / ranked bars, and a footer strip giving the
 * numbers their provenance.
 *
 * Legibility rules that override the login screen's own styling, because this
 * is a surface an operator reads for an hour rather than four seconds:
 * body text is 13px (never the login's 10–11px), values keep their real casing
 * so word shapes stay recognisable, and only short labels are uppercased.
 *
 * Three DESIGN_LANGUAGE.md violations the old cards had accumulated are fixed
 * here on the way past:
 *   - `text-gray-100/200/300/400` throughout (anti-pattern 12) and faded white
 *     on black (anti-pattern 1) — now Minerva palette, full-strength ink.
 *   - `-500`-level saturated colour and a ten-entry cycling chart palette
 *     (anti-pattern 3) — now semantic tones only, no categorical palette at all.
 *   - An SVG noise wash plus scanline overlay on every card (anti-pattern 2).
 *
 * @see docs/DESIGN_LANGUAGE.md Section 6 (screen frame) and Section 7 (motion)
 */

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Payload filenames arrive base64-encoded often enough to be worth decoding. */
function decodeFilename(filename: string | undefined): string {
    if (!filename) return 'Unknown';
    try {
        if (/^[A-Za-z0-9+/=]+$/.test(filename) && filename.length > 10) {
            const decoded = atob(filename);
            if (/^[\x20-\x7E]+$/.test(decoded)) return decoded;
        }
        return filename;
    } catch {
        return filename;
    }
}

/** Mythic hands back naive UTC strings; normalise before parsing. */
function parseStamp(v: unknown): number {
    if (typeof v !== 'string' || !v) return 0;
    const ms = new Date(v.endsWith('Z') ? v : `${v}Z`).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

/**
 * When the operator issued this task.
 *
 * NOT `timestamp`. That column is the row's last-updated time and lands within
 * microseconds of completion, so using it here plots when work *finished*
 * while the axis says it was issued. `status_timestamp_preprocessing` is the
 * real submission clock; `timestamp` is only a fallback for rows so old or so
 * broken that the status clock never got written.
 */
function taskIssuedAt(t: any): number {
    return parseStamp(t?.status_timestamp_preprocessing) || parseStamp(t?.timestamp);
}

/** When the agent finished. 0 when the task is still outstanding. */
function taskFinishedAt(t: any): number {
    return parseStamp(t?.status_timestamp_processed);
}

/** Round-trip latency in ms, or null while the task is still outstanding. */
function taskLatency(t: any): number | null {
    const a = taskIssuedAt(t);
    const b = taskFinishedAt(t);
    if (!a || !b) return null;
    const d = b - a;
    return d >= 0 ? d : null;
}

/** Kept for the activity stream, which wants "last activity", not issue time. */
function parseTaskTime(t: any): number {
    return parseStamp(t?.timestamp) || taskIssuedAt(t);
}

function bucketByMinute(tasks: any[], buckets = 30, windowMs = 30 * 60 * 1000): number[] {
    const now = Date.now();
    const arr = new Array(buckets).fill(0);
    tasks.forEach(t => {
        const ts = parseTaskTime(t);
        if (!ts) return;
        const age = now - ts;
        if (age < 0 || age > windowMs) return;
        const idx = Math.min(buckets - 1, Math.floor((windowMs - age) / (windowMs / buckets)));
        arr[idx]++;
    });
    return arr;
}

/**
 * Bucket tasks by issue time, into a window the data can actually support.
 *
 * The query returns the newest N tasks, not a fixed time window, so the span
 * is measured from the data rather than assumed. There is deliberately NO cap:
 * an operation that has been running for weeks should show weeks. The measured
 * span is returned so the axis can be labelled with the truth, whatever it
 * turns out to be.
 *
 * Buckets by `status_timestamp_preprocessing` — the true submission clock.
 * The obvious choice, `timestamp`, is the row's last-updated time and sits
 * microseconds from completion, so bucketing by it silently turns a
 * "tasks issued" chart into a "tasks finished" chart.
 *
 * Outcomes are counted against the bucket the task was *issued* in, which is
 * the more useful reading: it shows when the failures were being created.
 */
function bucketTempo(tasks: any[], buckets = 48) {
    const stamped = tasks.map(t => ({ t, ts: taskIssuedAt(t) })).filter(x => x.ts > 0);
    const issued = new Array(buckets).fill(0);
    const completed = new Array(buckets).fill(0);
    const errored = new Array(buckets).fill(0);
    if (stamped.length === 0) return { issued, completed, errored, spanMs: 0, endMs: Date.now() };

    const endMs = Date.now();
    // reduce, not Math.min(...spread): the history query is unbounded, and a
    // spread of ~150k arguments throws RangeError in V8.
    const oldest = stamped.reduce((m, x) => (x.ts < m ? x.ts : m), stamped[0].ts);
    const spanMs = Math.max(60_000, endMs - oldest);
    const step = spanMs / buckets;

    stamped.forEach(({ t, ts }) => {
        const age = endMs - ts;
        if (age < 0 || age > spanMs) return;
        const idx = Math.min(buckets - 1, Math.floor((spanMs - age) / step));
        issued[idx]++;
        const { word } = taskState(t);
        if (word === 'Done') completed[idx]++;
        else if (word === 'Error') errored[idx]++;
    });
    return { issued, completed, errored, spanMs, endMs };
}

/** "45m" / "3h 20m" / "12d" — the window is no longer bounded to a day, so
 *  this has to stay readable when an operation has been running for months. */
function humanSpan(ms: number): string {
    if (ms <= 0) return '—';
    const m = Math.round(ms / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) {
        const rem = m % 60;
        return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
    }
    const d = Math.floor(h / 24);
    const remH = h % 24;
    return remH === 0 ? `${d}d` : `${d}d ${remH}h`;
}

function timeAgo(ts: number): string {
    if (!ts) return '—';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

/**
 * A clock that re-renders ONLY itself.
 *
 * `useLiveClock` re-renders whatever component calls it. At 1Hz in a panel
 * that also draws an avatar list or a three-bay hero, that is a full subtree
 * reconciliation every second to move one digit. Anything ticking faster than
 * the 10s poll should be a leaf like this instead.
 */
const LiveTime = React.memo(function LiveTime({ format, intervalMs = 1000 }: {
    format: (now: Date) => React.ReactNode;
    intervalMs?: number;
}) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return <>{format(now)}</>;
});

function useLiveClock(intervalMs = 1000) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

/** Rank a frequency map into rows, folding the tail into one "Other".
 *
 *  The fold is the point: past roughly seven rows a ranked list stops being
 *  scannable and the tail is noise. One row keeps the total honest without
 *  pretending the 14th command matters. */
function rankBuckets(freq: Record<string, number>, keep = 6) {
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, keep);
    const tail = sorted.slice(keep);
    const tailSum = tail.reduce((s, [, v]) => s + v, 0);
    const rows = head.map(([label, value]) => ({ label, value }));
    if (tailSum > 0) rows.push({ label: `Other (${tail.length})`, value: tailSum });
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const max = rows.length ? Math.max(...rows.map(r => r.value)) : 1;
    return { rows, total, max };
}

// `callbackGrowth` lived here and charted cumulative footholds from
// `init_callback`. It went with the ranked-bars version of Callback Surface:
// that panel is now a table of which nodes exist and whether they are talking,
// which is the question asked first. Foothold growth over time is still
// derivable from `callback.init_callback` if it earns a panel of its own —
// it must not be folded into Operation Tempo, because tasks and callbacks are
// different units and that would mean a dual axis.

/**
 * `callback.os` is a multi-line uname dump, e.g.
 *   "Linux\nRedTeamLab\n6.19.14+kali-amd64\n#1 SMP ...\nx86_64"
 * Rendering it raw turns one table row into five. The first line is the useful
 * part; the rest belongs in the callback detail view.
 */
function shortOs(os: unknown): string {
    if (typeof os !== 'string' || !os) return '—';
    return os.split('\n')[0].trim().slice(0, 24) || '—';
}

/** Percentile from an already-sorted array. */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Human latency: sub-second in ms, then seconds, then minutes. */
function humanMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60_000)}m`;
}

/** Round-trip latency profile across the fetched window.
 *
 *  Buckets are log-ish rather than linear because that is how the data
 *  actually falls — measured on 417 real paired rows: p50 2.45s, p90 9.83s,
 *  p99 193s. Linear buckets would put 80% of tasks in one bar. */
const LATENCY_BUCKETS: [string, number, number][] = [
    ['Under 1s', 0, 1000],
    ['1–5s', 1000, 5000],
    ['5–30s', 5000, 30_000],
    ['30s–2m', 30_000, 120_000],
    ['Over 2m', 120_000, Number.POSITIVE_INFINITY],
];

function latencyProfile(tasks: any[]) {
    const durs: number[] = [];
    let outstanding = 0;
    tasks.forEach(t => {
        const d = taskLatency(t);
        if (d === null) { outstanding++; return; }
        durs.push(d);
    });
    durs.sort((a, b) => a - b);
    const bins = LATENCY_BUCKETS.map(([label, lo, hi]) => ({
        label, value: durs.filter(d => d >= lo && d < hi).length,
    }));
    return {
        durs, outstanding, bins,
        p50: percentile(durs, 0.5),
        p90: percentile(durs, 0.9),
        p99: percentile(durs, 0.99),
        max: bins.length ? Math.max(1, ...bins.map(b => b.value)) : 1,
    };
}

/** Task status → semantic tone + word. Never a bare colour: see `StatusWord`. */
function taskState(task: any): { tone: Tone; word: string } {
    const isOpsec = (task.opsec_pre_blocked && !task.opsec_pre_bypassed)
        || (task.opsec_post_blocked && !task.opsec_post_bypassed);
    if (isOpsec) return { tone: 'warn', word: 'OPSEC' };
    if (task.status === 'error') return { tone: 'fail', word: 'Error' };
    if (task.completed || task.status === 'completed') return { tone: 'signal', word: 'Done' };
    if (['processing', 'delegating', 'processed'].includes(task.status)) return { tone: 'signal', word: 'Running' };
    return { tone: 'idle', word: 'Queued' };
}

// ─────────────────────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────

interface SparklineProps {
    values: number[];
    width?: number;
    height?: number;
    color?: string;
    fill?: boolean;
    className?: string;
}

/** Trend shape only — deliberately unlabelled and unaxed. The number beside it
 *  is the value; this says which way it has been going. */
export function Sparkline({ values, width = 104, height = 32, color, fill = true, className }: SparklineProps) {
    if (!values || values.length === 0) return <svg width={width} height={height} className={className} aria-hidden="true" />;
    const max = Math.max(1, ...values);
    const stepX = width / Math.max(1, values.length - 1);
    const points = values.map((v, i) => {
        const x = i * stepX;
        const y = height - 2 - (v / max) * (height - 4);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const linePath = `M ${points.join(' L ')}`;
    const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
    const stroke = color || 'rgb(var(--color-signal))';
    const last = values[values.length - 1];
    const lx = (values.length - 1) * stepX;
    const ly = height - 2 - (last / max) * (height - 4);
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
            {fill && <path d={areaPath} fill={stroke} opacity={0.1} />}
            <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={2.4} fill={stroke} />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI TILE + STRIP
// ─────────────────────────────────────────────────────────────────────────────

const TONE_HEX: Record<Tone, string> = {
    signal: 'rgb(var(--color-signal))',
    live: 'rgb(var(--color-accent))',
    warn: '#fbbf24',
    fail: '#f87171',
    range: '#c084fc',
    idle: 'rgb(var(--color-signal) / 0.45)',
};

interface KpiTileProps {
    label: string;
    value: number | string;
    unit?: string;
    icon?: React.ReactNode;
    spark?: number[];
    delta?: number;
    tone?: Tone;
    hint?: string;
    onClick?: () => void;
    /** Supply both to draw a meter instead of a sparkline. */
    ratio?: { value: number; max: number };
}

/**
 * One headline number, with the graphic that actually fits it.
 *
 * Both references agree on the split, so it is not a taste call: a value with a
 * real denominator ("12 of 18 callbacks") is a *ratio against a limit* and wants
 * a meter, while a value with no ceiling ("2.4 tasks/min") is a *current value
 * plus trend* and wants a sparkline. Putting a sparkline under a bounded ratio
 * throws away the one fact the reader needs — how much headroom is left.
 */
export function KpiTile({ label, value, unit, icon, spark, delta, tone = 'signal', hint, onClick, ratio }: KpiTileProps) {
    const TrendIcon = typeof delta === 'number' ? (delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus) : null;
    // Direction, not judgement: higher throughput is not "good", so the
    // arrow carries the meaning and the colour stays neutral.
    const trendTone: Tone = typeof delta === 'number' && delta !== 0 ? 'signal' : 'idle';
    return (
        <InstrumentPanel
            title={label}
            icon={icon}
            badgeTone={tone}
            badge={TrendIcon ? (
                <span className={cn('inline-flex items-center gap-1', toneText(trendTone))}>
                    <TrendIcon size={12} strokeWidth={2} aria-hidden="true" />
                    {Math.abs(delta!).toFixed(0)}%
                </span>
            ) : undefined}
            onClick={onClick}
            footerLeft={hint}
        >
            <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-end justify-between gap-3">
                    {/* No label: the header strip already names this number. */}
                    <Readout value={value} sub={unit} tone={tone} size="text-[32px]" />
                    {!ratio && spark && spark.length > 0 && (
                        <Sparkline values={spark} color={toneStroke(tone)} />
                    )}
                </div>
                {ratio && (
                    <div className="space-y-1.5">
                        <Meter value={ratio.value} max={ratio.max} tone={tone} />
                        <div className="flex justify-between text-[11px] tabular-nums text-signal opacity-55">
                            <span>0</span>
                            <span>{ratio.max}</span>
                        </div>
                    </div>
                )}
            </div>
        </InstrumentPanel>
    );
}

interface KpiStripProps {
    callbacks: any[];
    totalCallbacks: number;
    tasks: any[];
    totalTasks: number;
    completedTasks: number;
    errorTasks: number;
    opsecTasks: number;
    onCallbacks?: () => void;
    onOpsec?: () => void;
}

export const KpiStrip = React.memo(function KpiStrip({
    callbacks, totalCallbacks, tasks, totalTasks, completedTasks, errorTasks, opsecTasks,
    onCallbacks, onOpsec,
}: KpiStripProps) {
    const m30 = useMemo(() => bucketByMinute(tasks, 30, 30 * 60 * 1000), [tasks]);
    const last5min = useMemo(() => m30.slice(-5).reduce((a, b) => a + b, 0), [m30]);
    const prev5min = useMemo(() => m30.slice(-10, -5).reduce((a, b) => a + b, 0), [m30]);
    const tasksPerMinute = (last5min / 5).toFixed(1);
    const throughputDelta = prev5min === 0 ? (last5min > 0 ? 100 : 0) : ((last5min - prev5min) / prev5min) * 100;

    const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const opsecSpark = useMemo(() => bucketByMinute(
        tasks.filter(t => (t.opsec_pre_blocked && !t.opsec_pre_bypassed) || (t.opsec_post_blocked && !t.opsec_post_bypassed)),
        24, 60 * 60 * 1000,
    ), [tasks]);
    const errorRate = totalTasks > 0 ? (errorTasks / totalTasks) * 100 : 0;

    return (
        // h-full + overflow so a shortened cell clips this the way every other
        // widget is clipped by its InstrumentPanel — this is the one root that
        // is a bare grid rather than a panel.
        <div className="grid h-full grid-cols-2 gap-4 overflow-y-auto lg:grid-cols-4">
            <KpiTile
                label="Active callbacks"
                value={callbacks.length}
                unit={`of ${totalCallbacks}`}
                icon={<Radio size={13} strokeWidth={2} />}
                ratio={{ value: callbacks.length, max: Math.max(totalCallbacks, 1) }}
                tone={callbacks.length > 0 ? 'signal' : 'idle'}
                hint={callbacks.length > 0 ? 'Beacons live' : 'No contact'}
                onClick={onCallbacks}
            />
            <KpiTile
                label="Task throughput"
                value={tasksPerMinute}
                unit="per min"
                icon={<Zap size={13} strokeWidth={2} />}
                spark={m30}
                delta={throughputDelta}
                tone="signal"
                hint={`${last5min} tasks in the last 5 minutes`}
            />
            <KpiTile
                label="Success rate"
                value={`${successRate.toFixed(0)}%`}
                icon={<CheckCircle size={13} strokeWidth={2} />}
                ratio={{ value: Math.round(successRate), max: 100 }}
                tone={successRate >= 80 ? 'signal' : successRate >= 50 ? 'warn' : 'fail'}
                hint={`${completedTasks} of ${totalTasks} done · ${errorRate.toFixed(0)}% errored`}
            />
            <KpiTile
                label="OPSEC pending"
                value={opsecTasks}
                unit={opsecTasks > 0 ? 'to review' : 'clear'}
                icon={<AlertTriangle size={13} strokeWidth={2} />}
                spark={opsecSpark}
                tone={opsecTasks > 0 ? 'warn' : 'signal'}
                hint={opsecTasks > 0 ? 'Awaiting approval' : 'No blocked tasks'}
                onClick={onOpsec}
            />
        </div>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// THREAT GAUGE + MISSION HERO
// ─────────────────────────────────────────────────────────────────────────────

// ThreatGauge and computeThreatScore were removed deliberately.
//
// The score was `min(60, opsec*12) + min(30, errRate*60) + min(25, c2Down*40)`
// — three invented weights summed into a number out of 100 that no operator
// could explain, act on, or check. A dial that cannot be reasoned about is
// worse than no dial: it looks authoritative. What it was gesturing at is now
// answered concretely by Attention Required, which names the actual problem
// and links to the thing that fixes it.

interface MissionHeroProps {
    operationName: string;
    operatorName: string;
    callbackCount: number;
    totalCallbacks: number;
    c2Running: number;
    c2Total: number;
    /** Derived from the same issue list Attention Required renders, so the two
     *  can never disagree about whether the operation is in trouble. */
    health: { label: string; detail: string; tone: Tone };
    loading?: boolean;
    error?: boolean;
    /** Mythic's per-operator clock preference. */
    viewUtc?: boolean;
}

/** The console's headline instrument. Three bays under one set of strips:
 *  who and where, when, and how exposed. */
export const MissionHeroBanner = React.memo(function MissionHeroBanner({
    operationName, operatorName, callbackCount, totalCallbacks,
    c2Running, c2Total, health, loading, error, viewUtc = false,
}: MissionHeroProps) {
    // No useLiveClock here: the hero holds the operation name, health state and
    // two counters, none of which change every second. Only the clock ticks.
    // No `new Date()` captured at render: it would freeze beside a live clock,
    // so at midnight the time reads 00:00:0x next to yesterday's date — the very
    // pair this panel exists to let an operator cross-check.
    // The operator's preference decides which clock is the big one. Both stay
    // on screen — during an operation the offset between them is something you
    // want to be able to check, not something to hide behind a setting.
    // primary/secondary now live inside the <LiveTime> leaves below; only the
    // labels and the date are needed at this level.
    const primaryLabel = viewUtc ? 'UTC' : 'Local';
    const secondaryLabel = viewUtc ? 'Local' : 'UTC';
    const formatDate = (d: Date) => viewUtc
        ? d.toISOString().slice(0, 10)
        : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    const linkTone: Tone = error ? 'fail' : loading ? 'warn' : 'live';
    const linkWord = error ? 'Gateway offline' : loading ? 'Syncing' : 'Gateway online';

    return (
        <InstrumentPanel
            title="Mission control"
            icon={<Shield size={14} strokeWidth={2} />}
            badgeTone={linkTone}
            badge={linkWord}
            footerLeft={<>Operator <span className="font-medium opacity-100">{operatorName}</span></>}
            footerRight={<>{primaryLabel} <LiveTime intervalMs={30_000} format={formatDate} /></>}
            bodyClassName="p-0"
        >
            <div className="grid grid-cols-1 md:grid-cols-3">
                {/* Identity */}
                <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-6">
                    <span className={cn('text-signal opacity-70', LABEL)}>Active operation</span>
                    <span className="truncate text-[32px] font-bold leading-none text-signal" title={operationName}>
                        {operationName}
                    </span>
                    <StatusWord tone={linkTone} dot>{linkWord}</StatusWord>
                </div>

                {/* Clock + counters */}
                <div className="flex flex-col items-center justify-center gap-2 border-signal/15 px-5 py-6 md:border-x">
                    <span className={cn('text-signal opacity-70', LABEL)}>{primaryLabel}</span>
                    <span className="text-[44px] font-bold leading-none tabular-nums tracking-[0.03em] text-signal">
                        <LiveTime format={d => viewUtc
                            ? `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
                            : `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`} />
                    </span>
                    <span className="text-[13px] tabular-nums text-signal opacity-60">
                        {secondaryLabel}{' '}
                        <LiveTime format={d => viewUtc
                            ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
                            : `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`} />
                    </span>
                    <div className="mt-3 grid w-full max-w-[260px] grid-cols-2 gap-4">
                        <Readout
                            value={callbackCount} sub={`of ${totalCallbacks}`} label="Callbacks"
                            tone={callbackCount > 0 ? 'signal' : 'idle'} size="text-[26px]"
                        />
                        <Readout
                            value={c2Running} sub={`of ${c2Total}`} label="C2 online"
                            tone={c2Total > 0 && c2Running === c2Total ? 'signal' : c2Running > 0 ? 'warn' : 'fail'}
                            size="text-[26px]"
                        />
                    </div>
                </div>

                {/* Threat posture */}
                {/* Health is a STATE, not a score. It says what is wrong and how
                    many things are wrong — both checkable — instead of an
                    invented number out of 100 that nobody can argue with. */}
                <div className="flex flex-col justify-center gap-3 px-5 py-6">
                    <span className={cn('text-signal opacity-70', LABEL)}>Operation health</span>
                    <span className={cn('text-[32px] font-bold leading-none', toneText(health.tone))}>
                        {health.label}
                    </span>
                    <span className="text-[13px] text-signal opacity-70">{health.detail}</span>
                </div>
            </div>
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// CALLBACK SURFACE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The nodes themselves, not a chart about them.
 *
 * This was two ranked bar charts ("by host", "by user"). Those answer a
 * distribution question, but the first question an operator asks is *which
 * boxes do I control, and are they still talking*. So it is a compact table of
 * the callbacks that matter most, with the full list one click away — the
 * dashboard summarises, the Callbacks page manages.
 *
 * Liveness comes from `isCallbackAlive`, never `callback.dead`: that column
 * lags by up to a minute and is container-dependent, so live nodes read DEAD.
 * The helper measures `last_checkin` against a threshold derived from the
 * agent's own `sleep_info`, which is why a long sleeper is not "silent".
 */
export const CallbackSurfaceCard = React.memo(function CallbackSurfaceCard({ callbacks = [], edges = [], onOpen }: {
    callbacks?: any[];
    edges?: any[];
    onOpen?: () => void;
}) {
    // The tick is a DEPENDENCY, not just a re-render trigger. isCallbackAlive
    // reads Date.now(); memoising on `callbacks` alone freezes the Active/Silent
    // column at the last data change — and a node going quiet is exactly the
    // case where its row stops changing.
    const tick = useLiveClock(30_000);

    const rows = useMemo(() => callbacks
        .map(c => ({ c, alive: isCallbackAlive(c, edges), seen: parseStamp(c.last_checkin) }))
        // Silent nodes first. A callback that stopped talking is the one worth
        // seeing, and a plain "newest check-in" sort buries it at the bottom.
        .sort((a, b) => (a.alive === b.alive ? b.seen - a.seen : a.alive ? 1 : -1))
        // eslint-disable-next-line react-hooks/exhaustive-deps
        .slice(0, 8), [callbacks, edges, tick]);

    const alive = useMemo(
        () => callbacks.filter(c => isCallbackAlive(c, edges)).length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [callbacks, edges, tick]);
    const silent = callbacks.length - alive;
    const hosts = new Set(callbacks.map(c => c.host || 'Unknown')).size;
    const users = new Set(callbacks.map(c => c.user || 'Unknown')).size;
    const concentrated = callbacks.length > 2 && users === 1 && hosts > 1;

    return (
        <InstrumentPanel
            title="Callback surface"
            icon={<Radio size={14} strokeWidth={2} />}
            badgeTone={silent > 0 ? 'warn' : 'signal'}
            badge={`${alive} of ${callbacks.length} live`}
            footerLeft={concentrated
                ? `One account across ${hosts} hosts`
                : `${hosts} ${hosts === 1 ? 'host' : 'hosts'} · ${users} ${users === 1 ? 'user' : 'users'}`}
            footerRight={callbacks.length > rows.length ? `View all ${callbacks.length} →` : 'View all →'}
            onClick={onOpen}
        >
            {callbacks.length === 0 ? <NoData>No callbacks in this operation</NoData> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                        <thead>
                            <tr className="border-b border-signal/15">
                                {['Host', 'User', 'Agent', 'OS', 'Last seen', 'Status'].map(h => (
                                    <th key={h} className={cn('whitespace-nowrap pb-2 pr-4 text-signal opacity-70', LABEL)}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ c, alive: isAlive, seen }) => (
                                <tr key={c.id} className="border-b border-signal/10 last:border-0">
                                    <td className="max-w-[150px] truncate py-2 pr-4 text-signal" title={c.host}>
                                        {c.host || '—'}
                                        {c.domain ? <span className="opacity-55"> · {c.domain}</span> : null}
                                    </td>
                                    <td className="max-w-[130px] truncate py-2 pr-4 text-signal" title={c.user}>
                                        {c.user || '—'}
                                        {Number(c.integrity_level) >= 3
                                            ? <span className="ml-1.5 text-[11px] font-bold text-amber-400">HIGH</span>
                                            : null}
                                    </td>
                                    <td className="whitespace-nowrap py-2 pr-4 text-signal opacity-70">
                                        {c.payload?.payloadtype?.name || '—'}
                                    </td>
                                    <td className="max-w-[150px] truncate py-2 pr-4 text-signal opacity-70"
                                        title={typeof c.os === 'string' ? c.os : ''}>
                                        {shortOs(c.os)}{c.architecture ? ` ${c.architecture}` : ''}
                                    </td>
                                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-signal opacity-70">
                                        {seen ? `${timeAgo(seen)} ago` : '—'}
                                    </td>
                                    <td className="py-2">
                                        <StatusWord tone={isAlive ? 'live' : 'warn'} dot>
                                            {isAlive ? 'Active' : 'Silent'}
                                        </StatusWord>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </InstrumentPanel>
    );
});

/**
 * Task pipeline — state, volume and content in one panel.
 *
 * Three panels used to split this: a donut of task states, a "Command
 * statistics" block whose four counters were the same states again, and a "Top
 * commands" list computed by literally the same `rankBuckets` call as the
 * statistics block's own frequency chart. The operator was reading the same
 * numbers three times in three shapes.
 *
 * Now: the donut says what shape the queue is in, the counters give the exact
 * figures, and the ranked bars say what the queue is actually made of. One
 * panel, one question — "what is the pipeline doing, and with what".
 *
 * Donut segment order is deliberate and validated: the achromatic Done and
 * Queued steps sit between the accent green and the amber, which takes the
 * worst adjacent pair from ΔE 6.2 to 15.4 under deuteranopia.
 */
export const TaskPipelineCard = React.memo(function TaskPipelineCard({ tasks = [], totalTasks = 0, completedTasks = 0, errorTasks = 0, opsecTasks = 0 }: {
    tasks?: any[]; totalTasks?: number; completedTasks?: number; errorTasks?: number; opsecTasks?: number;
}) {
    const segments = useMemo(() => {
        let done = 0, error = 0, running = 0, queued = 0, opsec = 0;
        tasks.forEach(t => {
            const { word } = taskState(t);
            if (word === 'OPSEC') opsec++;
            else if (word === 'Error') error++;
            else if (word === 'Done') done++;
            else if (word === 'Running') running++;
            else queued++;
        });
        return [
            { label: 'Done', value: done, hex: TONE_HEX.signal },
            { label: 'Running', value: running, hex: TONE_HEX.live },
            { label: 'Queued', value: queued, hex: 'rgb(var(--color-signal) / 0.45)' },
            { label: 'OPSEC hold', value: opsec, hex: TONE_HEX.warn },
            { label: 'Error', value: error, hex: TONE_HEX.fail },
        ];
    }, [tasks]);

    const { rows, max } = useMemo(() => {
        const freq: Record<string, number> = {};
        tasks.forEach(t => { if (t.command_name) freq[t.command_name] = (freq[t.command_name] || 0) + 1; });
        return rankBuckets(freq, 6);
    }, [tasks]);

    const latency = useMemo(() => latencyProfile(tasks), [tasks]);
    const total = segments.reduce((s, b) => s + b.value, 0);

    return (
        <InstrumentPanel
            title="Task pipeline"
            icon={<CheckCircle size={14} strokeWidth={2} />}
            badgeTone={errorTasks > 0 ? 'fail' : opsecTasks > 0 ? 'warn' : 'signal'}
            badge={`${totalTasks} tasks`}
            footerLeft={latency.durs.length > 0
                ? `Median round trip ${humanMs(latency.p50)} across ${latency.durs.length} completed`
                : 'State, then what the queue is made of'}
            footerRight={`${rows.length} distinct commands`}
        >
            {total === 0 ? <NoData>No tasks yet</NoData> : (
                <div className="flex h-full flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-5">
                        <Donut segments={segments} total={total} centerLabel="TASKS" size={124} />
                        <div className="min-w-[160px] flex-1 space-y-2">
                            {segments.filter(x => x.value > 0).map(x => (
                                <LegendRow
                                    key={x.label} hex={x.hex} label={x.label} value={x.value}
                                    share={`${Math.round((x.value / total) * 100)}%`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Round-trip latency. Nothing else on the page says how
                        long the operator waits, and on a C2 that number is the
                        agent's sleep interval showing through. */}
                    {latency.durs.length > 0 && (
                        <div className="border-t border-signal/15 pt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className={cn('text-signal opacity-70', LABEL)}>Round-trip latency</span>
                                <span className="text-[13px] tabular-nums text-signal">
                                    <span className="opacity-60">p50</span> {humanMs(latency.p50)}
                                    <span className="ml-2 opacity-60">p90</span> {humanMs(latency.p90)}
                                    <span className="ml-2 opacity-60">p99</span> {humanMs(latency.p99)}
                                </span>
                            </div>
                            <div className="mt-3 space-y-2.5">
                                {latency.bins.map(bin => (
                                    <ChannelRow
                                        key={bin.label} label={bin.label} title={bin.label} value={bin.value}
                                        pct={latency.max > 0 ? (bin.value / latency.max) * 100 : 0}
                                    />
                                ))}
                            </div>
                            {latency.outstanding > 0 && (
                                <div className="mt-2.5 text-[11px] text-signal opacity-55">
                                    {latency.outstanding} still outstanding — not counted
                                </div>
                            )}
                        </div>
                    )}

                    {rows.length > 0 && (
                        <div className="space-y-2.5 border-t border-signal/15 pt-4">
                            <div className={cn('text-signal opacity-70', LABEL)}>Most-run commands</div>
                            {rows.map(r => (
                                <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                                    pct={max > 0 ? (r.value / max) * 100 : 0} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Operation tempo — the page's centrepiece.
 *
 * It absorbs what used to be three separate panels' worth of the same
 * question: a 24h volume chart, a success-rate percentage, and an error count.
 * Separately they said "there was work", "most of it worked" and "some of it
 * didn't", and the operator had to hold all three in their head to notice that
 * the failures were all in the last twenty minutes. Together, on one time axis,
 * that is the first thing you see.
 */
export const OperationTempoCard = React.memo(function OperationTempoCard({ tasks = [], full = false, sliceSize = 0 }: {
    tasks?: any[];
    /** True when fed by the on-demand unbounded history rather than the poll. */
    full?: boolean;
    /** How many rows the live poll carries, for the "partial" caption. */
    sliceSize?: number;
}) {
    const { issued, completed, errored, spanMs } = useMemo(() => bucketTempo(tasks), [tasks]);
    const totalIssued = issued.reduce((a, b) => a + b, 0);
    const totalErrored = errored.reduce((a, b) => a + b, 0);
    const totalDone = completed.reduce((a, b) => a + b, 0);
    const errRate = totalIssued > 0 ? (totalErrored / totalIssued) * 100 : 0;
    const tone: Tone = errRate >= 20 ? 'fail' : errRate >= 5 ? 'warn' : 'signal';
    const span = humanSpan(spanMs);
    const half = humanSpan(spanMs / 2);

    return (
        <InstrumentPanel
            title="Operation tempo"
            icon={<Activity size={14} strokeWidth={2} />}
            badgeTone={tone}
            badge={totalIssued > 0 ? `${errRate.toFixed(0)}% errored` : undefined}
            // The window is whatever the fetched rows genuinely cover, so it is
            // stated rather than assumed. Claiming "24h" over twenty minutes of
            // data is the kind of chart that gets someone killed.
            footerLeft={totalIssued === 0
                ? 'No tasks in range'
                : full
                    ? `Full history · ${totalIssued} tasks over ${span}`
                    : `Newest ${sliceSize || totalIssued} tasks · ${span} — use "Analyse all" for the whole operation`}
            footerRight={`${totalDone} done · ${totalErrored} errored`}
        >
            {totalIssued === 0 ? <NoData>No task history yet</NoData> : (
                <LineChart
                    envelope={{ label: 'Issued', values: issued }}
                    series={[
                        { label: 'Completed', values: completed, tone: 'signal' },
                        { label: 'Errored', values: errored, tone: 'fail' },
                    ]}
                    xLabels={[`${span} ago`, `${half} ago`, 'Now']}
                    formatTip={i => (
                        <span className="tabular-nums">
                            {issued[i]} issued · {completed[i]} done · {errored[i]} errored
                        </span>
                    )}
                />
            )}
        </InstrumentPanel>
    );
});

/**
 * Live activity — a product event timeline, not a log tail.
 *
 * The old version listed tasks. An operation produces more kinds of event than
 * that, and the interesting ones are often not tasks at all: a new foothold
 * landing, a credential dropping out of a task's output. Those were visible
 * only as a counter ticking up somewhere else on the page.
 *
 * Each entry is typed, names its primary entity, carries one line of context
 * and a relative time. Deliberately no stdout, no raw response bodies, no full
 * event messages — this answers "what just happened", and anything longer
 * belongs on the page that owns it.
 */
export const ActivityStreamCard = React.memo(function ActivityStreamCard({ tasks = [], callbacks = [], credentials = [], edges = [], onOpen }: {
    tasks?: any[];
    callbacks?: any[];
    credentials?: any[];
    edges?: any[];
    onOpen?: () => void;
}) {
    useLiveClock(15_000);

    const events = useMemo(() => {
        type Ev = { id: string; kind: string; entity: string; context?: string; at: number; tone: Tone };
        const out: Ev[] = [];

        tasks.forEach((t, i) => {
            // Only the word is reused here; the feed maps its own tone below,
            // because a routine completed task should not be as loud in a
            // timeline as it is in a status column.
            const { word } = taskState(t);
            const who = t.operator?.username ? `@${t.operator.username}` : (t.callback?.host || '');
            out.push({
                id: `t-${t.id ?? i}`,
                kind: word === 'Error' ? 'Task failed' : word === 'OPSEC' ? 'Task held' : 'Task',
                entity: t.command_name || '—',
                context: [who, t.callback?.host && who !== t.callback.host ? t.callback.host : null]
                    .filter(Boolean).join(' · ') || undefined,
                at: parseStamp(t.timestamp) || taskIssuedAt(t),
                tone: word === 'Error' ? 'fail' : word === 'OPSEC' ? 'warn' : 'signal',
            });
        });

        // A new foothold is the single most interesting thing that can happen
        // during an operation and it never appeared in this feed before.
        callbacks.forEach(c => {
            const at = parseStamp(c.init_callback);
            if (!at) return;
            out.push({
                id: `c-${c.id}`,
                kind: 'New callback',
                entity: c.host || `#${c.display_id}`,
                context: [c.user, c.payload?.payloadtype?.name].filter(Boolean).join(' · ') || undefined,
                at,
                tone: 'live',
            });
        });

        credentials.forEach(cr => {
            const at = parseStamp(cr.timestamp);
            if (!at) return;
            out.push({
                id: `cr-${cr.id}`,
                kind: 'Credential',
                entity: cr.account || 'credential',
                context: cr.realm || undefined,
                at,
                tone: 'range',
            });
        });

        return out.filter(e => e.at > 0).sort((a, b) => b.at - a.at).slice(0, 18);
    }, [tasks, callbacks, credentials]);

    const failures = events.filter(e => e.tone === 'fail').length;

    return (
        <InstrumentPanel
            title="Live activity"
            icon={<Clock size={14} strokeWidth={2} />}
            badgeTone={failures > 0 ? 'fail' : events.length > 0 ? 'signal' : 'idle'}
            badge={failures > 0 ? `${failures} failed` : events.length > 0 ? 'Streaming' : 'Idle'}
            footerLeft="Tasks, footholds and collection, newest first"
            footerRight="View event feed →"
            onClick={onOpen}
        >
            {events.length === 0 ? <NoData>Nothing has happened yet</NoData> : (
                <div className="cyber-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                    {events.map(e => (
                        <div key={e.id} className="flex items-baseline gap-3 border-b border-signal/10 py-2 text-[13px] last:border-0">
                            <span className="w-11 shrink-0 tabular-nums text-signal opacity-55">{timeAgo(e.at)}</span>
                            <StatusWord tone={e.tone} className="w-[96px] shrink-0">{e.kind}</StatusWord>
                            <span className="min-w-0 flex-1 truncate text-signal" title={e.entity}>{e.entity}</span>
                            {e.context && (
                                <span className="hidden max-w-[160px] shrink-0 truncate text-signal opacity-60 sm:inline" title={e.context}>
                                    {e.context}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// INFRASTRUCTURE / OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Infrastructure reads as a fleet, not a list: one tile per profile so the
 *  shape of the outage is visible before any name is read, with a ring giving
 *  the single "how much of it is up" number. */
export const C2MatrixCard = React.memo(function C2MatrixCard({ profiles = [] }: { profiles?: any[] }) {
    const running = profiles.filter(p => p.running).length;
    const total = profiles.length;
    const containers = profiles.filter(p => p.container_running).length;
    const healthPct = total > 0 ? (running / total) * 100 : 0;
    const tone: Tone = total === 0 ? 'idle' : healthPct === 100 ? 'signal' : healthPct >= 50 ? 'warn' : 'fail';

    return (
        <InstrumentPanel
            title="C2 infrastructure"
            icon={<Server size={14} strokeWidth={2} />}
            badgeTone={tone}
            badge={`${running} of ${total} up`}
            footerLeft={`${containers} containers running`}
            footerRight={`${Math.round(healthPct)}% healthy`}
        >
            {total === 0 ? <NoData>No C2 profiles found</NoData> : (
                <div className="flex h-full flex-wrap items-start gap-5">
                    <div className="flex flex-col items-center gap-2">
                        <RadialArc pct={healthPct} tone={tone} size={116} thickness={9}>
                            <span className={cn('text-[26px] font-bold leading-none tabular-nums', toneText(tone))}>
                                {running}
                            </span>
                            <span className="mt-1 text-[11px] text-signal opacity-55">of {total} up</span>
                        </RadialArc>
                    </div>
                    <div className="grid min-w-[220px] flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                        {profiles.map(p => (
                            <StatusTile
                                key={p.id}
                                label={p.name}
                                state={p.running ? 'Up' : 'Down'}
                                tone={p.running ? 'signal' : 'fail'}
                                meta={p.is_p2p ? 'P2P' : 'Egress'}
                            />
                        ))}
                    </div>
                </div>
            )}
        </InstrumentPanel>
    );
});

/**
 * Half-spans for the T-timeline axis, in milliseconds.
 *
 * The axis takes the smallest step that still leaves NOW inside the window, so
 * the marker never pins against an edge and the scale steps up on its own as
 * the operation runs: minutes out it is a five-minute axis, a week in it is a
 * thirty-day one. Same instrument, honest scale, no operator input.
 */
const TIMELINE_HALVES = [
    5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 3_600_000, 24 * 3_600_000,
    3 * 86_400_000, 7 * 86_400_000, 30 * 86_400_000, 90 * 86_400_000,
    365 * 86_400_000,
];

/** One-unit duration for an axis end label: 5m, 6h, 30d. */
function formatSpan(ms: number): string {
    if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
    return `${Math.round(ms / 86_400_000)}d`;
}

/**
 * The operation timeline — one number line with T-0 nailed to the centre.
 *
 * The countdown above it says HOW LONG. This says WHERE: which side of the
 * start we stand on, and how far along, against a span the axis states at both
 * ends. That stated span is the whole difference from the radial arc this card
 * used to carry — the ring encoded position in an unlabelled window, so the
 * graphic meant nothing without the number sitting inside it. A number line
 * with its ends labelled is readable on its own.
 *
 * Own clock, own subtree. The avatar roster under it must not reconcile every
 * second to move a marker, so this ticks as a leaf — and only as fast as the
 * marker actually moves: at a 30-day span a 1 Hz tick is a repaint for a
 * fraction of a pixel.
 */
const ScheduleTimeline = React.memo(function ScheduleTimeline({ startMs, tone }: {
    startMs: number;
    tone: Tone;
}) {
    const [nowMs, setNowMs] = useState(() => getSkewedNow().getTime());
    const delta = nowMs - startMs;           // negative before T-0, positive after
    const magnitude = Math.abs(delta);
    const half = TIMELINE_HALVES.find(h => magnitude <= h * 0.9) ?? magnitude / 0.9;

    const tickMs = half <= 15 * 60_000 ? 1_000 : half <= 6 * 3_600_000 ? 5_000 : 30_000;
    useEffect(() => {
        const id = setInterval(() => setNowMs(getSkewedNow().getTime()), tickMs);
        return () => clearInterval(id);
    }, [tickMs]);

    const nowPct = Math.max(0, Math.min(100, 50 + (delta / half) * 50));
    // The lit run is always centre-to-marker: before T-0 it is the lead time
    // still to burn, after T-0 it is the time in play. Direction carries which.
    const from = Math.min(50, nowPct);
    const to = Math.max(50, nowPct);
    const pre = delta < 0;
    const span = formatSpan(half);
    const move = 'transition-[left,width] duration-700 ease-out motion-reduce:transition-none';

    return (
        <div className="mt-3">
            <div
                className="relative h-7"
                role="img"
                aria-label={`Operation timeline, ${span} either side of T-0, now ${pre ? 'before' : 'after'} start`}
            >
                {/* Axis, and the two ends the labels below are naming. */}
                <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-signal/20" />
                <div aria-hidden="true" className="absolute inset-y-1.5 left-0 w-px bg-signal/25" />
                <div aria-hidden="true" className="absolute inset-y-1.5 right-0 w-px bg-signal/25" />
                {/* Half-way ticks: without them the marker's distance from the
                    centre is a guess between two labels a card-width apart. */}
                {[25, 75].map(p => (
                    <div
                        key={p} aria-hidden="true"
                        className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-signal/15"
                        style={{ left: `${p}%` }}
                    />
                ))}

                <div
                    aria-hidden="true"
                    className={cn('absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full', toneFill(tone), move)}
                    style={{ left: `${from}%`, width: `${to - from}%` }}
                />

                {/* T-0 last, so the zero line stays legible across the fill. */}
                <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-signal" />
                {/* NOW: a point plotted on the line, ringed in the page colour
                    so it separates from the run it sits at the end of. */}
                <div
                    aria-hidden="true"
                    className={cn(
                        'absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-void',
                        toneFill(tone), move,
                    )}
                    style={{ left: `${nowPct}%` }}
                />
            </div>

            {/* Full-strength ink on all three, per DESIGN_LANGUAGE.md's contrast
                rule — the hierarchy is carried by weight and tone, not by
                fading the ends of the axis into the background. */}
            <div className="relative mt-1 h-[13px] text-[11px] tabular-nums text-signal">
                <span className="absolute left-0 top-0">{`T-${span}`}</span>
                <span className={cn('absolute left-1/2 top-0 -translate-x-1/2 font-bold', toneText(tone))}>T-0</span>
                <span className="absolute right-0 top-0">{`T+${span}`}</span>
            </div>
        </div>
    );
});

/**
 * Operation — the whole "where are we, and who is on it" question.
 *
 * Was three panels: a countdown, a briefing that repeated the operation's name
 * and member count, and an operator roster. They were all facets of one thing,
 * and split apart the operator had to look in three places to answer "is it
 * running yet, and is anyone here".
 */
export const OperationCard = React.memo(function OperationCard({
    startMs, operations = [], currentOpId, totalOperations = 0, operators = [], onOpen,
    viewUtc = false,
}: {
    startMs: number | null;
    operations?: any[];
    currentOpId?: number;
    totalOperations?: number;
    operators?: any[];
    onOpen?: () => void;
    viewUtc?: boolean;
}) {
    // No useLiveClock: the avatar roster below must not re-render every second.
    // The countdown itself is a <LiveTime> leaf.
    const td = tDelta(startMs);
    const isPre = td?.sign === -1;
    const within60s = !!td && td.sign === -1 && td.totalSeconds <= 60;

    const currentOp = operations.find(op => op.id === currentOpId) || operations[0];
    const memberCount = currentOp?.operatoroperations?.length || 0;

    const tone: Tone = !td ? 'idle' : within60s ? 'warn' : 'signal';
    const phase = !td ? 'Unscheduled' : within60s ? 'Imminent' : isPre ? 'Pre-ops' : 'In-ops';

    return (
        <InstrumentPanel
            title="Operation"
            icon={<Timer size={14} strokeWidth={2} />}
            badgeTone={tone}
            badge={phase}
            footerLeft={startMs
                ? `${isPre ? 'Starts' : 'Started'} ${viewUtc
                    ? `${new Date(startMs).toISOString().replace('T', ' ').slice(0, 16)} UTC`
                    : new Date(startMs).toLocaleString()}`
                : 'No start time set — schedule it in Operations'}
            footerRight={`${operations.length} running · ${totalOperations} total`}
            onClick={onOpen}
        >
            <div className="flex h-full flex-col gap-4">
                <div>
                    <div className={cn('text-signal opacity-70', LABEL)}>Active</div>
                    <div className="mt-1.5 truncate text-[26px] font-bold leading-none text-signal" title={currentOp?.name}>
                        {currentOp?.name || 'None'}
                    </div>
                </div>

                {td ? (
                    /* The clock, then the line it sits on.
                     *
                     * This was a radial arc with the time inside it. The ring
                     * encoded position in an arbitrary ±4h window, which is not
                     * a quantity anyone reads off a circle — the number was
                     * doing all the work and the graphic was decoration around
                     * it. What was missing was never the geometry, it was the
                     * stated scale: a countdown answers "how long", and an axis
                     * with both ends labelled answers "where", which is the
                     * question T-0 exists to anchor. So: readout, then a number
                     * line running T- through T-0 into T+. */
                    <div>
                        <div className={cn('text-signal opacity-70', LABEL)}>
                            {isPre ? 'Starts in' : 'Running for'}
                        </div>
                        {/* One atomic status message rather than a bare live
                            number, so a screen reader is told what it hears. */}
                        <div
                            className="mt-2 flex items-baseline gap-2"
                            role="status" aria-atomic="true"
                        >
                            <span className={cn('text-[16px] font-bold', toneText(tone))}>{td.prefix}</span>
                            <span className={cn('text-[32px] font-bold leading-none tabular-nums', toneText(tone))}>
                                <LiveTime format={() => {
                                    const t = tDelta(startMs);
                                    return t ? `${t.days > 0 ? `${t.days}d ` : ''}${t.hh}:${t.mm}:${t.ss}` : '—';
                                }} />
                            </span>
                        </div>
                        <ScheduleTimeline startMs={startMs!} tone={tone} />
                    </div>
                ) : (
                    <div className="flex items-center gap-3 text-[13px]">
                        <Calendar size={18} strokeWidth={2} className="shrink-0 text-signal opacity-60" aria-hidden="true" />
                        <span className="text-signal opacity-70">No start time set for this operation.</span>
                    </div>
                )}

                <div className="border-t border-signal/15 pt-4">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className={cn('text-signal opacity-70', LABEL)}>On this operation</span>
                        <span className="text-[13px] tabular-nums text-signal">
                            {operators.length} online · {memberCount} assigned
                        </span>
                    </div>
                    {operators.length === 0 ? (
                        <div className="mt-3 text-[13px] text-signal opacity-50">No operators online</div>
                    ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {operators.slice(0, 10).map(op => {
                                const last = op.last_login
                                    ? new Date(op.last_login.endsWith?.('Z') ? op.last_login : `${op.last_login}Z`).getTime()
                                    : 0;
                                return (
                                    <span
                                        key={op.id}
                                        className="flex items-center gap-2 rounded-sm border border-signal/15 py-1 pl-1 pr-2.5"
                                        title={`${op.username}${last ? ` · seen ${timeAgo(last)} ago` : ''}`}
                                    >
                                        <Avatar name={op.username} size={24} />
                                        <span className="max-w-[110px] truncate text-[13px] text-signal">{op.username}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY / PEOPLE
// ─────────────────────────────────────────────────────────────────────────────

export const RecentPayloadsCard = React.memo(function RecentPayloadsCard({ payloads = [] }: { payloads?: any[] }) {
    const built = payloads.filter(p => p.build_phase === 'success').length;
    return (
        <InstrumentPanel
            title="Recent payloads"
            icon={<Box size={14} strokeWidth={2} />}
            badgeTone={payloads.length > 0 ? 'signal' : 'idle'}
            badge={`${built} of ${payloads.length} built`}
            footerLeft="Filename and build phase"
            footerRight={`${payloads.length} shown`}
        >
            {payloads.length === 0 ? <NoData>No payloads generated yet</NoData> : (
                <div>
                    {/* How much of the batch actually built, before any name is
                        read — the rows below answer "which one" afterwards. */}
                    <Meter
                        value={built} max={payloads.length} height={8}
                        tone={built === payloads.length ? 'signal' : 'warn'}
                    />
                    <div className="mt-3">
                        {payloads.map((p, i) => {
                            const filename = decodeFilename(p.filemetum?.filename_text);
                            const phase: string = p.build_phase || 'unknown';
                            const tone: Tone = phase === 'success' ? 'signal' : phase === 'building' ? 'warn' : 'fail';
                            return (
                                <DataRow
                                    key={p.id || `p-${i}`}
                                    label={filename}
                                    meta={p.payloadtype?.name}
                                    title={filename}
                                    state={phase.charAt(0).toUpperCase() + phase.slice(1)}
                                    tone={tone}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </InstrumentPanel>
    );
});

interface AssetStripProps {
    credentials?: number;
    keylogs?: number;
    downloads?: number;
    uploads?: number;
    screenshots?: number;
}

/** Each class gets a ring showing its share of everything collected, so the
 *  strip answers "what is this operation actually yielding" at a glance rather
 *  than only "how many of each". */
export const AssetStripCard = React.memo(function AssetStripCard({
    credentials = 0, keylogs = 0, downloads = 0, uploads = 0, screenshots = 0, credentialRows = [],
}: AssetStripProps & { credentialRows?: any[] }) {
    // Each class keeps its own hue so the strip is navigable without reading:
    // the eye goes straight to "the amber one" for credentials. This is not
    // colour-alone — every tile carries an icon and a written label too — and
    // the five were validated together as a categorical set (worst adjacent
    // pair ΔE 21.7 deutan, 27.4 normal, all above 3:1 on the void surface).
    // Deliberately no accent green — that is a reserved status colour and must
    // not double as "series 3", or a class label starts reading as a health state.
    const stats = [
        { label: 'Credentials', value: credentials, Icon: Key, hex: '#fbbf24' },
        { label: 'Keylogs', value: keylogs, Icon: Terminal, hex: '#f472b6' },
        { label: 'Downloads', value: downloads, Icon: Download, hex: 'rgb(var(--color-signal))' },
        { label: 'Uploads', value: uploads, Icon: Upload, hex: '#c084fc' },
        { label: 'Screenshots', value: screenshots, Icon: Image, hex: '#fb923c' },
    ];
    const collected = stats.reduce((s, x) => s + x.value, 0);

    const byRealm = useMemo(() => {
        const freq: Record<string, number> = {};
        credentialRows.forEach(c => {
            const r = (c.realm || '').trim() || 'No realm';
            freq[r] = (freq[r] || 0) + 1;
        });
        return rankBuckets(freq, 5);
    }, [credentialRows]);

    const byType = useMemo(() => {
        const freq: Record<string, number> = {};
        credentialRows.forEach(c => {
            const t = (c.type || '').trim() || 'Unknown';
            freq[t] = (freq[t] || 0) + 1;
        });
        return rankBuckets(freq, 5);
    }, [credentialRows]);

    return (
        <InstrumentPanel
            title="Asset collection"
            icon={<Shield size={14} strokeWidth={2} />}
            badgeTone={collected > 0 ? 'signal' : 'idle'}
            badge={`${collected} items`}
            footerLeft={credentialRows.length > 0
                ? `Credential split across the newest ${credentialRows.length} of ${credentials}`
                : 'Harvested during this operation'}
            footerRight={`${stats.filter(s => s.value > 0).length} of ${stats.length} classes`}
        >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {stats.map(({ label, value, Icon, hex }) => {
                    const share = collected > 0 ? (value / collected) * 100 : 0;
                    return (
                        <div key={label} className="flex items-center gap-3 rounded-sm border border-signal/15 px-3.5 py-3">
                            <div className="relative shrink-0">
                                <ShareRing pct={share} hex={value > 0 ? hex : 'rgb(var(--color-signal) / 0.2)'} size={40} />
                                <Icon
                                    size={16} strokeWidth={2} aria-hidden="true"
                                    style={value > 0 ? { color: hex } : undefined}
                                    className={cn('absolute inset-0 m-auto', value === 0 && 'text-signal opacity-30')}
                                />
                            </div>
                            <div className="min-w-0">
                                <div
                                    className={cn('text-[26px] font-bold leading-none tabular-nums', value === 0 && 'text-signal opacity-30')}
                                    style={value > 0 ? { color: hex } : undefined}
                                >
                                    {value}
                                </div>
                                <div className={cn('mt-1.5 truncate text-signal opacity-70', LABEL)}>{label}</div>
                                {collected > 0 && (
                                    <div className="mt-0.5 text-[11px] tabular-nums text-signal opacity-50">
                                        {Math.round(share)}% of haul
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Credentials were a bare number before. The realm split is what
                turns "1,248 credentials" into "we own this domain" — and the
                slice is bounded, so it says what it actually covers. */}
            {byRealm.rows.length > 0 && (
                <div className="mt-4 grid gap-x-6 gap-y-4 border-t border-signal/15 pt-4 sm:grid-cols-2">
                    <div className="space-y-2.5">
                        <div className={cn('text-signal opacity-70', LABEL)}>Credentials by realm</div>
                        {byRealm.rows.map(r => (
                            <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                                pct={byRealm.max > 0 ? (r.value / byRealm.max) * 100 : 0} />
                        ))}
                    </div>
                    <div className="space-y-2.5">
                        <div className={cn('text-signal opacity-70', LABEL)}>By type</div>
                        {byType.rows.map(r => (
                            <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                                pct={byType.max > 0 ? (r.value / byType.max) * 100 : 0} />
                        ))}
                    </div>
                </div>
            )}
        </InstrumentPanel>
    );
});

export type { Tone };

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mythic's own event log, which nothing on this console was reading.
 *
 * SCOPED TO WARNINGS, and that scoping is the whole design. `resolved` is not
 * a triage state for every level — nobody ever resolves a login record — so
 * "unresolved events" counts 3,950 on a real instance, of which 2,774 are
 * auth and 626 are debug. A badge showing 3,950 would be pure alarm fatigue.
 * Warnings only gives 86, which is the number that means something, and it is
 * the same definition EventFeed.tsx and the sidebar badge already use.
 *
 * The headline count comes from `operation.alert_count`, computed server-side,
 * so this panel and the sidebar can never disagree.
 */
export const AlertsCard = React.memo(function AlertsCard({ events = [], openAlerts = 0, onOpen }: {
    events?: any[];
    openAlerts?: number;
    onOpen?: () => void;
}) {
    useLiveClock(15_000);
    const open = events.filter(e => !e.resolved);
    const shown = open.length > 0 ? open : events;
    const tone: Tone = openAlerts > 0 ? 'warn' : 'signal';

    return (
        <InstrumentPanel
            title="Alerts"
            icon={<Siren size={14} strokeWidth={2} />}
            badgeTone={tone}
            badge={openAlerts > 0 ? `${openAlerts} open` : 'All clear'}
            footerLeft={open.length > 0 ? 'Unresolved first' : 'Recently resolved'}
            footerRight="Warnings only"
            onClick={onOpen}
        >
            {shown.length === 0 ? <NoData>No warnings raised</NoData> : (
                <div className="cyber-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                    {shown.slice(0, 12).map((e, i) => (
                        <DataRow
                            key={e.id ?? `e-${i}`}
                            label={String(e.message ?? '—').replace(/\s+/g, ' ').slice(0, 90)}
                            title={String(e.message ?? '')}
                            meta={e.level}
                            state={e.resolved ? 'Resolved' : `${timeAgo(parseStamp(e.timestamp))} ago`}
                            tone={e.resolved ? 'idle' : 'warn'}
                        />
                    ))}
                </div>
            )}
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// FOOTPRINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this operation has left on other people's disks.
 *
 * Two sources that only mean something together: artifacts the agents reported
 * creating, and payloads actually dropped onto hosts. `payloadonhost` had
 * never been queried anywhere in Minerva, so "what did we leave, and where"
 * genuinely had no answer in the product.
 */
export const FootprintCard = React.memo(function FootprintCard({ artifacts = [], payloadsOnHost = [], artifactTotal = 0, cleanupPending = 0, hostTotal = 0 }: {
    artifacts?: any[];
    payloadsOnHost?: any[];
    artifactTotal?: number;
    cleanupPending?: number;
    hostTotal?: number;
}) {
    const byKind = useMemo(() => {
        const freq: Record<string, number> = {};
        artifacts.forEach(a => {
            const k = a.base_artifact || 'Unknown';
            freq[k] = (freq[k] || 0) + 1;
        });
        return rankBuckets(freq, 5);
    }, [artifacts]);

    const hosts = useMemo(() => {
        const freq: Record<string, number> = {};
        [...artifacts, ...payloadsOnHost].forEach(x => {
            const h = x.host || 'Unknown';
            freq[h] = (freq[h] || 0) + 1;
        });
        return rankBuckets(freq, 5);
    }, [artifacts, payloadsOnHost]);

    const tone: Tone = cleanupPending > 0 ? 'warn' : 'signal';

    return (
        <InstrumentPanel
            title="Footprint"
            icon={<Footprints size={14} strokeWidth={2} />}
            badgeTone={tone}
            badge={cleanupPending > 0 ? `${cleanupPending} to clean up` : `${artifactTotal} artifacts`}
            footerLeft={hostTotal >= 60
                ? '60+ payloads dropped on hosts (showing most recent)'
                : `${hostTotal} ${hostTotal === 1 ? 'payload' : 'payloads'} dropped on hosts`}
            footerRight={`${byKind.rows.length} artifact kinds`}
        >
            {artifactTotal === 0 && hostTotal === 0 ? <NoData>Nothing left behind yet</NoData> : (
                <div className="flex h-full flex-col gap-4">
                    <div className="grid grid-cols-3 gap-3">
                        <Readout value={artifactTotal} label="Artifacts" size="text-[26px]" />
                        <Readout
                            value={hostTotal >= 60 ? '60+' : hostTotal} label="On disk" size="text-[26px]"
                        />
                        <Readout
                            value={cleanupPending} label="To clean" size="text-[26px]"
                            tone={cleanupPending > 0 ? 'warn' : 'idle'}
                        />
                    </div>
                    <div className="grid gap-x-6 gap-y-4 border-t border-signal/15 pt-4 sm:grid-cols-2">
                        <div className="space-y-2.5">
                            <div className={cn('text-signal opacity-70', LABEL)}>By kind</div>
                            {byKind.rows.length === 0 ? <NoData>None</NoData> : byKind.rows.map(r => (
                                <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                                    pct={byKind.max > 0 ? (r.value / byKind.max) * 100 : 0} />
                            ))}
                        </div>
                        <div className="space-y-2.5">
                            <div className={cn('text-signal opacity-70', LABEL)}>By host</div>
                            {hosts.rows.length === 0 ? <NoData>None</NoData> : hosts.rows.map(r => (
                                <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                                    pct={hosts.max > 0 ? (r.value / hosts.max) * 100 : 0} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// REACH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How traffic actually moves — P2P relays and tunnel throughput together.
 *
 * `callbackgraphedge` gives the mesh (which callback routes through which) and
 * `callbackport` gives the bytes genuinely pushed through SOCKS and port
 * forwards. Neither was on the console: infrastructure was a list of profiles
 * that were "up", with nothing saying whether anything was flowing through them.
 */
export const ReachCard = React.memo(function ReachCard({ edges = [], ports = [], callbacks = [], onOpen }: {
    edges?: any[];
    ports?: any[];
    callbacks?: any[];
    onOpen?: () => void;
}) {
    // `live` used to be computed here, outside the memo that depends on it —
    // a fresh array identity every render, so `relays` never held. Same
    // anti-pattern as the `|| []` extractions in Dashboard.tsx, one file over.
    const live = useMemo(() => edges.filter(e => !e.end_timestamp), [edges]);
    const relays = useMemo(() => {
        const byId = new Map<number, string>();
        callbacks.forEach(c => byId.set(c.display_id, c.host || String(c.display_id)));
        const freq: Record<string, number> = {};
        live.forEach(e => {
            const k = byId.get(e.source_id) || `Callback ${e.source_id}`;
            freq[k] = (freq[k] || 0) + 1;
        });
        return rankBuckets(freq, 5);
    }, [live, callbacks]);

    const sent = ports.reduce((n, p) => n + (p.bytes_sent || 0), 0);
    const recv = ports.reduce((n, p) => n + (p.bytes_received || 0), 0);
    const fmt = (b: number) =>
        b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB`
        : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB`
        : b >= 1e3 ? `${(b / 1e3).toFixed(0)} KB` : `${b} B`;

    return (
        <InstrumentPanel
            title="Reach"
            icon={<Network size={14} strokeWidth={2} />}
            badgeTone={live.length > 0 ? 'signal' : 'idle'}
            badge={`${live.length} live ${live.length === 1 ? 'link' : 'links'}`}
            footerLeft={`${edges.length} edges seen, ${edges.length - live.length} closed`}
            footerRight={`${ports.length} open ${ports.length === 1 ? 'tunnel' : 'tunnels'}`}
            onClick={onOpen}
        >
            {edges.length === 0 && ports.length === 0 ? <NoData>No relays or tunnels</NoData> : (
                <div className="flex h-full flex-col gap-4">
                    <div className="grid grid-cols-3 gap-3">
                        <Readout value={live.length} label="Live links" size="text-[26px]" />
                        <Readout value={fmt(sent)} label="Sent" size="text-[26px]" />
                        <Readout value={fmt(recv)} label="Received" size="text-[26px]" />
                    </div>

                    {relays.rows.length > 0 && (
                        <div className="space-y-2.5 border-t border-signal/15 pt-4">
                            <div className={cn('text-signal opacity-70', LABEL)}>Busiest relays</div>
                            {relays.rows.map(r => (
                                <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                                    pct={relays.max > 0 ? (r.value / relays.max) * 100 : 0} tone="range" />
                            ))}
                        </div>
                    )}

                    {ports.length > 0 && (
                        <div className="border-t border-signal/15 pt-4">
                            <div className={cn('mb-2 text-signal opacity-70', LABEL)}>Tunnels</div>
                            {ports.slice(0, 6).map(p => (
                                <DataRow
                                    key={p.id}
                                    label={`${p.port_type || 'tunnel'} :${p.local_port ?? '—'}`}
                                    meta={p.remote_ip ? `${p.remote_ip}:${p.remote_port ?? ''}` : undefined}
                                    state={fmt((p.bytes_sent || 0) + (p.bytes_received || 0))}
                                    tone="signal"
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// TRADECRAFT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which MITRE tactics this operation has actually exercised.
 *
 * `attacktask` maps tasks to techniques and had never reached the console, so
 * the answer to "what does our activity look like to a defender" lived only in
 * a separate page nobody opens mid-operation.
 *
 * Mythic stores `tactic` as a JSON-ish string (`["Execution"]`), sometimes with
 * several tactics per technique, so it is parsed rather than shown raw.
 */
export const TradecraftCard = React.memo(function TradecraftCard({ attackTasks = [], onOpen }: { attackTasks?: any[]; onOpen?: () => void }) {
    const { rows, max, techniques } = useMemo(() => {
        const freq: Record<string, number> = {};
        const seen = new Set<string>();
        attackTasks.forEach(a => {
            const at = a?.attack;
            if (!at) return;
            if (at.t_num) seen.add(at.t_num);
            let tactics: string[] = [];
            try {
                const parsed = JSON.parse(at.tactic ?? '[]');
                tactics = Array.isArray(parsed) ? parsed : [String(parsed)];
            } catch {
                tactics = at.tactic ? [String(at.tactic)] : [];
            }
            (tactics.length ? tactics : ['Unmapped']).forEach(t => {
                freq[t] = (freq[t] || 0) + 1;
            });
        });
        const r = rankBuckets(freq, 7);
        return { ...r, techniques: seen.size };
    }, [attackTasks]);

    return (
        <InstrumentPanel
            title="Tradecraft"
            icon={<Crosshair size={14} strokeWidth={2} />}
            badgeTone={techniques > 0 ? 'signal' : 'idle'}
            badge={`${techniques} ${techniques === 1 ? 'technique' : 'techniques'}`}
            footerLeft="ATT&CK tactics exercised, by task count"
            footerRight={`${attackTasks.length} mapped tasks`}
            onClick={onOpen}
        >
            {rows.length === 0 ? <NoData>No tasks mapped to ATT&CK yet</NoData> : (
                <div className="space-y-2.5">
                    {rows.map(r => (
                        <ChannelRow key={r.label} label={r.label} title={r.label} value={r.value}
                            pct={max > 0 ? (r.value / max) * 100 : 0} />
                    ))}
                </div>
            )}
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTENTION REQUIRED
// ─────────────────────────────────────────────────────────────────────────────

export interface Issue {
    id: string;
    category: string;
    problem: string;
    subject?: string;
    context?: string;
    tone: Tone;
    href?: string;
}

/**
 * Turn telemetry into a list of things to do.
 *
 * This is the difference between a dashboard and a monitor. Everywhere else on
 * the page reports a quantity; this names a problem, points at the object it
 * concerns, gives the number that makes it a problem, and links to the screen
 * that fixes it. If nothing needs doing it says so plainly rather than
 * inventing severity to look busy.
 *
 * Derivation is deliberately conservative — every rule here is something an
 * operator would act on, not something that merely looks anomalous.
 */
export function deriveIssues(input: {
    callbacks: any[];
    edges: any[];
    c2profiles: any[];
    tasks: any[];
    opsecTasks: number;
    openAlerts: number;
    cleanupPending: number;
    latency: { p99: number; outstanding: number };
    payloads: any[];
}): Issue[] {
    const issues: Issue[] = [];

    // Callbacks that have stopped checking in on their own schedule. Uses the
    // project's liveness helper, never the `dead` column — that lags by up to
    // a minute and is container-dependent, so live nodes read as DEAD.
    const silent = input.callbacks.filter(c => !isCallbackAlive(c, input.edges));
    if (silent.length > 0) {
        issues.push({
            id: 'cb-silent',
            category: 'Callback',
            problem: `${silent.length} ${silent.length === 1 ? 'callback has' : 'callbacks have'} not checked in as expected`,
            subject: silent.slice(0, 3).map(c => c.host || `#${c.display_id}`).join(', ')
                + (silent.length > 3 ? ` +${silent.length - 3}` : ''),
            tone: 'warn',
            href: '/callbacks',
        });
    }

    const down = input.c2profiles.filter(p => !p.running);
    if (down.length > 0) {
        issues.push({
            id: 'c2-down',
            category: 'Infrastructure',
            problem: `${down.length} C2 ${down.length === 1 ? 'profile is' : 'profiles are'} not running`,
            subject: down.map(p => p.name).slice(0, 3).join(', '),
            tone: 'fail',
            href: '/c2-profiles',
        });
    }

    if (input.opsecTasks > 0) {
        issues.push({
            id: 'opsec',
            category: 'OPSEC',
            problem: `${input.opsecTasks} ${input.opsecTasks === 1 ? 'task is' : 'tasks are'} blocked awaiting approval`,
            context: 'Nothing runs on these until someone decides',
            tone: 'warn',
            href: '/opsec',
        });
    }

    const errored = input.tasks.filter(t => taskState(t).word === 'Error').length;
    if (errored > 0 && input.tasks.length > 0) {
        const rate = (errored / input.tasks.length) * 100;
        if (rate >= 10) {
            issues.push({
                id: 'task-errors',
                category: 'Task execution',
                problem: `${rate.toFixed(0)}% of tasks in this window failed`,
                context: `${errored} of ${input.tasks.length}`,
                tone: rate >= 25 ? 'fail' : 'warn',
                href: '/events',
            });
        }
    }

    // 30s is generous for a C2 round trip even allowing for agent sleep; past
    // that the tail is worth a look rather than an alarm.
    if (input.latency.p99 > 30_000) {
        issues.push({
            id: 'latency',
            category: 'Task execution',
            problem: 'Execution latency exceeded the normal range',
            context: `p99 is ${humanMs(input.latency.p99)}`,
            tone: 'warn',
            href: '/callbacks',
        });
    }

    if (input.openAlerts > 0) {
        issues.push({
            id: 'alerts',
            category: 'Alerts',
            problem: `${input.openAlerts} unresolved ${input.openAlerts === 1 ? 'warning' : 'warnings'} from Mythic`,
            tone: 'warn',
            href: '/events',
        });
    }

    if (input.cleanupPending > 0) {
        issues.push({
            id: 'cleanup',
            category: 'Footprint',
            problem: `${input.cleanupPending} ${input.cleanupPending === 1 ? 'artifact needs' : 'artifacts need'} cleanup`,
            context: 'Still on target disks',
            tone: 'warn',
            href: '/artifacts',
        });
    }

    const failedBuilds = input.payloads.filter(p => p.build_phase && p.build_phase !== 'success' && p.build_phase !== 'building');
    if (failedBuilds.length > 0) {
        issues.push({
            id: 'builds',
            category: 'Payloads',
            problem: `${failedBuilds.length} payload ${failedBuilds.length === 1 ? 'build' : 'builds'} did not complete`,
            tone: 'fail',
            href: '/payloads',
        });
    }

    // Worst first — a list that buries a dead C2 under a cleanup reminder is
    // a list nobody reads to the bottom of.
    const rank: Record<Tone, number> = { fail: 0, warn: 1, range: 2, signal: 3, live: 4, idle: 5 };
    return issues.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export const AttentionCard = React.memo(function AttentionCard({ issues, onNavigate }: {
    issues: Issue[];
    onNavigate?: (href: string) => void;
}) {
    const worst: Tone = issues.some(i => i.tone === 'fail') ? 'fail'
        : issues.length > 0 ? 'warn' : 'live';

    return (
        <InstrumentPanel
            title="Attention required"
            icon={<AlertTriangle size={14} strokeWidth={2} />}
            badgeTone={worst}
            badge={issues.length > 0 ? `${issues.length} open` : 'Nothing'}
            footerLeft={issues.length > 0 ? 'Worst first' : 'No action needed right now'}
            footerRight={issues.length > 0 ? `${issues.filter(i => i.tone === 'fail').length} critical` : '—'}
        >
            {issues.length === 0 ? (
                <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2">
                    <CheckCircle size={22} strokeWidth={2} className="text-accent" aria-hidden="true" />
                    <span className="text-[13px] text-signal">Everything is behaving</span>
                    <span className="text-[11px] text-signal opacity-55">
                        Callbacks checking in, C2 up, no blocked tasks
                    </span>
                </div>
            ) : (
                <div className="cyber-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {issues.map(issue => {
                        const clickable = !!issue.href && !!onNavigate;
                        return (
                            <div
                                key={issue.id}
                                onClick={clickable ? () => onNavigate!(issue.href!) : undefined}
                                role={clickable ? 'button' : undefined}
                                tabIndex={clickable ? 0 : undefined}
                                onKeyDown={clickable ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate!(issue.href!); }
                                } : undefined}
                                className={cn(
                                    'rounded-sm border border-signal/15 px-3.5 py-3 transition-colors',
                                    clickable && 'cursor-pointer hover:border-signal/40',
                                )}
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <StatusWord tone={issue.tone}>{issue.category}</StatusWord>
                                    {clickable && (
                                        <span className="shrink-0 text-[11px] text-signal opacity-60">Open →</span>
                                    )}
                                </div>
                                <div className="mt-1.5 text-[13px] text-signal">{issue.problem}</div>
                                {issue.subject && (
                                    <div className="mt-1 truncate text-[11px] text-signal opacity-70" title={issue.subject}>
                                        {issue.subject}
                                    </div>
                                )}
                                {issue.context && (
                                    <div className="mt-1 text-[11px] text-signal opacity-55">{issue.context}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </InstrumentPanel>
    );
});
