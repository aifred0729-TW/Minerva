import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useSubscription } from '@apollo/client/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    Activity, AlertTriangle, Archive, ArchiveRestore, Cpu, Network, Package, Power,
    Radio, RefreshCw, ScrollText, Search, Server, Settings2, Share2, Users, Waypoints,
} from 'lucide-react';

import { SUB_C2_PROFILES, START_STOP_PROFILE_MUTATION, TOGGLE_C2_PROFILE_DELETE } from '../lib/api';
import { cn, getErrorMessage, isCallbackAlive } from '../lib/utils';
import { snackActions } from '../lib/snackbar';
import { C2DetailsModal } from '../components/C2DetailsModal';
import {
    DataRow, Donut, InstrumentPanel, LABEL, LegendRow, Meter, NoData, Readout,
    StatusWord, toneText, type Tone,
} from '../components/Instrument';
import { useAppStore } from '../store';
import type { C2Channel, C2ProfileRecord, ChannelState, WorkbenchTab } from '../types/c2profiles';

/**
 * C2 Profiles — egress control.
 *
 * WHAT THIS PAGE IS FOR, AND WHY IT LOOKS LIKE THIS
 *
 * The previous version was a three-lane kanban board: ACTIVE / DEGRADED /
 * OFFLINE, each lane a full-height column. With the seven profiles a real
 * install ships, two lanes sat empty and the third held four cards — roughly
 * 8% of the screen carrying content. Worse, a kanban implies you move things
 * between columns, and you do not: a profile's lane is a *readout*, not a
 * place. So the lanes become one ranked list, and the space they wasted goes
 * to the two things an operator actually needs and could not see before —
 * fleet posture at the top, and the selected channel's full record beside it.
 *
 * The structure is the login screen's, by way of the Dashboard: a page is a
 * top rail / body / bottom rail, and every box inside it is an instrument with
 * a header strip that says what it is and how it is doing. That is the part of
 * `pages/Login/` that travels (DESIGN_LANGUAGE.md §6, and the note at the top
 * of `components/Instrument.tsx`). What does NOT travel is its texture: no
 * `hud-*` palette, no dotted leaders, no corner chrome, no 10px type. This is
 * a surface an operator reads for an hour, not for four seconds.
 *
 * The old page also carried three anti-patterns it inherited (§10):
 * `text-gray-500/600/700` on black (1, 12), `-500`-level saturated colour for
 * status (3), and status carried by a bare coloured dot with no word. All
 * three are gone: Minerva palette only, semantic tones, and every state ships
 * as a word with the dot behind it as decoration.
 *
 * DATA. Liveness is `isCallbackAlive`, never Mythic's `dead` column — that
 * lags a minute and is container-dependent, so live nodes read DEAD. Callback
 * and payload counts come from the two nested arrays on the subscription and
 * are scoped to the current operation by Hasura permissions, so "4 callbacks"
 * means four in *this* operation, which is the only number worth showing here.
 *
 * @see docs/DESIGN_LANGUAGE.md §5 (panel kit), §6 (screen frame), §7 (motion)
 */

// ─────────────────────────────────────────────────────────────────────────────
// DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mythic reports two independent booleans, and their four combinations are
 * four different operational facts — not a single "up/down".
 *
 *   container + server  → online, actually serving
 *   one of the two      → degraded, and this is the state worth waking up for
 *   neither             → stopped, which is usually deliberate
 *   deleted             → archived, shelved rather than broken
 *
 * The old model folded `deleted` into "offline", so a channel someone retired
 * last month sat in the same lane as one that fell over five minutes ago.
 */
function stateOf(p: C2ProfileRecord): ChannelState {
    if (p.deleted) return 'archived';
    if (p.running && p.container_running) return 'online';
    if (p.running || p.container_running) return 'degraded';
    return 'stopped';
}

/**
 * Tone per state, and the ring colour that goes with it.
 *
 * STOPPED is full-strength `signal`, not the dim `idle` tone: a stopped
 * channel is a real state an operator chose, and a column of half-faded words
 * is exactly the "black background, faded white text" the design language
 * forbids. `idle` is kept for ARCHIVED, where dimness *is* the meaning.
 */
const STATE_META: Record<ChannelState, { label: string; tone: Tone; hex: string; blurb: string }> = {
    online: {
        label: 'Online', tone: 'live',
        hex: 'rgb(var(--color-accent))',
        blurb: 'Container up, server listening',
    },
    degraded: {
        label: 'Degraded', tone: 'warn',
        hex: '#fbbf24',
        blurb: 'Half the channel is down',
    },
    stopped: {
        label: 'Stopped', tone: 'signal',
        hex: 'rgb(var(--color-signal) / 0.65)',
        blurb: 'Registered, not serving',
    },
    archived: {
        // `signal`, not `idle`, for the same reason STOPPED is: `idle` renders
        // the word itself at 45% ink, which measured 4.42:1 — under AA for
        // small text. Archived is de-emphasised by its ring colour and by
        // living behind its own filter tab, not by being hard to read.
        label: 'Archived', tone: 'signal',
        hex: 'rgb(var(--color-signal) / 0.22)',
        blurb: 'Shelved, hidden from the fleet',
    },
};

/**
 * Ring order is load-bearing, not decorative: adjacent wedges are the pairs a
 * reader has to tell apart, so the achromatic step sits between the accent
 * green and the amber, and the dim archived wedge closes the circle so green
 * and amber never touch at the wrap-around either.
 */
const RING_ORDER: ChannelState[] = ['online', 'stopped', 'degraded', 'archived'];

/**
 * A clock that only exists to re-age things.
 *
 * `enabled` is not a nicety. This tick invalidates the page's whole derivation
 * memo, so on a server where no callback has ever used a C2 profile it would
 * rebuild every channel object twice a minute to produce identical numbers.
 * No callbacks, nothing to age, no interval.
 */
function useTick(intervalMs: number, enabled = true) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        const id = setInterval(() => setTick(n => n + 1), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, enabled]);
    return tick;
}

/** "12s ago" / "4m ago" — data freshness, not a promise about polling. */
function agoLabel(from: number | null, now: number): string {
    if (from == null) return 'never';
    const s = Math.max(0, Math.round((now - from) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

/**
 * Freshness, as a leaf that re-renders only itself.
 *
 * It says when data last *arrived*, not how often the page is configured to
 * ask — a promise about polling stays cheerful while the feed is dead. At 5s
 * it would drag the whole page's reconciliation with it if it lived any
 * higher up, so it does not.
 */
const Freshness = React.memo(function Freshness({ lastUpdated }: { lastUpdated: number | null }) {
    const now = useTick(5_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const label = useMemo(() => agoLabel(lastUpdated, Date.now()), [lastUpdated, now]);
    return <>{label}</>;
});

function plural(n: number, one: string, many = `${one}s`) {
    return n === 1 ? one : many;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CONTROLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Segmented control. The active segment inverts (`bg-signal` / `text-void`)
 * rather than taking a colour wash — the same decision as the Dashboard's
 * perspective switch and the nav rail's active row. Inversion survives
 * greyscale and every colour-vision deficiency; a tint does not, and "which
 * slice am I looking at" has to be certain before anything below it is read.
 */
function Segmented<K extends string>({ options, value, onChange, ariaLabel }: {
    options: { key: K; label: string; count?: number }[];
    value: K;
    onChange: (k: K) => void;
    ariaLabel: string;
}) {
    // `radiogroup`, not `tablist`. These pick one value out of a set; there is
    // no tabpanel behind them and nothing is `aria-controls`-able, so a screen
    // reader announcing "tab 2 of 3" for a sort order is describing furniture
    // that does not exist. The modal's section switcher IS a tablist and keeps
    // that role.
    return (
        <div role="radiogroup" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-sm border border-signal/20">
            {options.map(o => {
                const active = o.key === value;
                return (
                    <button
                        key={o.key}
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(o.key)}
                        className={cn(
                            'inline-flex min-h-[34px] items-center gap-2 px-3.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                            active ? 'bg-signal text-void' : 'text-signal hover:bg-signal/10',
                        )}
                    >
                        {o.label}
                        {o.count != null && (
                            <span className={cn('tabular-nums', active ? 'opacity-70' : 'opacity-55')}>{o.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/** Routing class as a chip. Two facts, not a colour: where the traffic goes,
 *  and whether Mythic itself is in the path. */
function RoutingChip({ profile, className }: { profile: C2ProfileRecord; className?: string }) {
    const p2p = !!profile.is_p2p;
    return (
        <span
            title={p2p
                ? 'Peer-to-peer: traffic is relayed by another agent, not sent to the server directly'
                : 'Egress: agents reach the Mythic server over this channel directly'}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]',
                p2p ? 'border-purple-400/40 bg-purple-400/10 text-purple-400' : 'border-signal/25 bg-signal/[0.04] text-signal',
                className,
            )}
        >
            {p2p ? <Share2 size={10} strokeWidth={2} aria-hidden="true" /> : <Waypoints size={10} strokeWidth={2} aria-hidden="true" />}
            {p2p ? 'P2P' : 'Egress'}
        </span>
    );
}

/** A count that recedes when it is zero, so a non-zero one is the thing the
 *  eye lands on. Full-strength ink for anything that is actually there.
 *
 *  `of` is the denominator when there is one worth showing: "0/34" says
 *  thirty-four agents were built onto this channel and none are answering,
 *  which is a very different fact from a channel nobody ever used. */
function Count({ value, of, className }: { value: number; of?: number; className?: string }) {
    return (
        <span className={cn('tabular-nums', className)}>
            <span className={value > 0 ? 'font-bold text-signal' : 'text-signal opacity-45'}>{value}</span>
            {of != null && of > 0 && (
                <span className="text-[11px] text-signal opacity-50">/{of}</span>
            )}
        </span>
    );
}

/** Version, or nothing. A profile with no semver rendered as "v—", which is
 *  three characters of noise on every row that has nothing to say. */
function Version({ semver }: { semver?: string }) {
    if (!semver) return null;
    return <span className="shrink-0 text-[11px] tabular-nums text-signal opacity-60">v{semver}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FLEET POSTURE (hero)
// ─────────────────────────────────────────────────────────────────────────────

interface FleetStats {
    total: number;
    fleet: number;
    online: number;
    degraded: number;
    stopped: number;
    archived: number;
    egress: number;
    p2p: number;
    liveCallbacks: number;
    totalCallbacks: number;
    payloads: number;
    agentTypes: number;
}

const FleetPosture = React.memo(function FleetPosture({ stats, health, lastUpdated }: {
    stats: FleetStats;
    health: { label: string; tone: Tone; detail: string };
    lastUpdated: number | null;
}) {
    const ringSegments = RING_ORDER
        .map(s => ({ label: STATE_META[s].label, value: stats[s], hex: STATE_META[s].hex }))
        .filter(s => s.value > 0);

    const share = (n: number) => stats.total > 0 ? `${Math.round((n / stats.total) * 100)}%` : '0%';

    return (
        <InstrumentPanel
            title="Egress posture"
            icon={<Radio size={14} strokeWidth={2} />}
            badgeTone={health.tone}
            badge={health.label}
            footerLeft={<>Live subscription · updated <span className="font-medium opacity-100"><Freshness lastUpdated={lastUpdated} /></span></>}
            footerRight={<>{stats.egress} egress · {stats.p2p} P2P{stats.archived > 0 ? ` · ${stats.archived} archived` : ''}</>}
            bodyClassName="p-0"
        >
            <div className="grid grid-cols-1 md:grid-cols-3">
                {/* ── Serving. The one number this page exists to answer. ── */}
                <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-5">
                    <span className={cn('text-signal opacity-70', LABEL)}>Channels serving</span>
                    <div className="flex items-baseline gap-2.5">
                        <span className={cn(
                            'text-[44px] font-bold leading-none tabular-nums',
                            toneText(stats.online === 0 ? 'fail' : stats.online === stats.fleet ? 'live' : 'signal'),
                        )}>
                            {stats.online}
                        </span>
                        <span className="text-[16px] tabular-nums text-signal opacity-60">of {stats.fleet}</span>
                    </div>
                    {/* A meter, not a bar chart: the denominator is real — every
                        registered channel is a slot that could be serving. */}
                    <Meter
                        value={stats.online}
                        max={stats.fleet}
                        tone={stats.online === 0 ? 'fail' : stats.degraded > 0 ? 'warn' : 'live'}
                    />
                    <StatusWord tone={health.tone} dot>{health.detail}</StatusWord>
                </div>

                {/* ── Distribution. Four states, a fixed set, proportion is the
                     question — the one case a donut is the right chart. ── */}
                <div className="flex items-center gap-5 border-signal/15 px-5 py-5 md:border-x">
                    {stats.total > 0 ? (
                        <>
                            <Donut
                                segments={ringSegments}
                                total={stats.total}
                                size={116}
                                thickness={16}
                                centerLabel="registered"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                                {RING_ORDER.map(s => (
                                    <LegendRow
                                        key={s}
                                        hex={STATE_META[s].hex}
                                        label={STATE_META[s].label}
                                        value={stats[s]}
                                        share={share(stats[s])}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <NoData>No C2 profiles installed on this server</NoData>
                    )}
                </div>

                {/* ── Load. A channel matters because things ride it. ── */}
                <div className="flex flex-col justify-center gap-3 px-5 py-5">
                    <span className={cn('text-signal opacity-70', LABEL)}>Riding these channels</span>
                    <div className="grid grid-cols-3 gap-3">
                        {/* NOT `idle` when the count is zero. `idle` is 45%
                            ink, and `Readout`'s `sub` adds its own 60% on top —
                            the two multiply to 27%, which measured 2.19:1
                            against the void. A zero is a fact an operator has
                            to be able to read, so the emphasis is carried by
                            the tone of the live case only. */}
                        <Readout
                            value={stats.liveCallbacks}
                            sub={stats.totalCallbacks > stats.liveCallbacks ? `of ${stats.totalCallbacks}` : undefined}
                            label="Live agents"
                            tone={stats.liveCallbacks > 0 ? 'live' : 'signal'}
                        />
                        <Readout value={stats.payloads} label="Payloads" tone="signal" />
                        <Readout value={stats.agentTypes} label="Agent types" tone="signal" />
                    </div>
                    <p className="text-[13px] text-signal opacity-60">
                        Counts are scoped to the current operation.
                    </p>
                </div>
            </div>
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL LIST
// ─────────────────────────────────────────────────────────────────────────────

/** Column widths live here so the header strip and every row cannot drift. */
const COL = {
    routing: 'w-[6rem] shrink-0 hidden xl:flex',
    agents: 'w-20 shrink-0 hidden md:block text-right',
    payloads: 'w-16 shrink-0 hidden lg:block text-right',
    state: 'w-[7.5rem] shrink-0 pl-4',
};

function ChannelListHeader() {
    return (
        <div className="flex shrink-0 items-center gap-3 border-b border-signal/15 px-4 py-2 pr-12">
            {/* Stands in for the row's status dot, so the header label sits
                over the names rather than 20px to their left. */}
            <span aria-hidden="true" className="h-2 w-2 shrink-0" />
            <span className={cn('min-w-0 flex-1 text-signal opacity-70', LABEL)}>Channel</span>
            <span className={cn(COL.routing, 'text-signal opacity-70', LABEL)}>Routing</span>
            <span className={cn(COL.agents, 'text-signal opacity-70', LABEL)}>Agents</span>
            <span className={cn(COL.payloads, 'text-signal opacity-70', LABEL)}>Builds</span>
            <span className={cn(COL.state, 'text-signal opacity-70', LABEL)}>State</span>
        </div>
    );
}

/**
 * One channel. A row is a single button, and the power control is its sibling
 * pinned over the right edge — never a button inside a button, which is both
 * invalid and unreachable for a keyboard.
 *
 * `data-channel-id` is how arrow-key navigation finds a row to focus. The
 * first version threaded a ref-registering callback down as a prop, which
 * meant a fresh closure on every parent render and therefore a `React.memo`
 * that never once hit. One data attribute and a query on the scroller does the
 * same job with no props at all, so every prop this component takes is now
 * either a primitive or a value that genuinely changed.
 */
const ChannelLine = React.memo(function ChannelLine({
    channel, selected, busy, onSelect, onToggle,
}: {
    channel: C2Channel;
    selected: boolean;
    busy: boolean;
    onSelect: (id: number) => void;
    onToggle: (channel: C2Channel) => void;
}) {
    const meta = STATE_META[channel.state];
    const p = channel.profile;
    const canToggle = channel.state !== 'archived';

    return (
        <div className="relative">
            <button
                type="button"
                data-channel-id={channel.id}
                onClick={() => onSelect(channel.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                    'flex w-full items-center gap-3 border-b border-signal/10 px-4 py-2.5 pr-12 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                    selected ? 'bg-signal/[0.07]' : 'hover:bg-signal/[0.035]',
                )}
            >
                {/* Selection is a shape, not only a wash: the bar is visible
                    when the tint is not, e.g. at low contrast settings. */}
                <span
                    aria-hidden="true"
                    className={cn(
                        'absolute inset-y-0 left-0 w-[2px] transition-opacity',
                        selected ? 'bg-accent opacity-100' : 'opacity-0',
                    )}
                />
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden="true">
                    <span className={cn('h-2 w-2 rounded-full', channel.state === 'online' ? 'bg-accent'
                        : channel.state === 'degraded' ? 'bg-amber-400'
                            : channel.state === 'stopped' ? 'bg-signal/60' : 'bg-signal/25')} />
                    {channel.state === 'online' && (
                        <span className="mv-dot-ring absolute h-2 w-2 rounded-full bg-accent" />
                    )}
                </span>

                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    {/* Real casing: a profile name is recognised by its shape. */}
                    <span className="truncate text-[13px] font-medium text-signal" title={p.name}>{p.name}</span>
                    <Version semver={p.semver} />
                    <span className="hidden min-w-0 truncate text-[11px] text-signal opacity-60 sm:inline" title={p.author}>
                        {p.author}
                    </span>
                </span>

                <span className={cn(COL.routing, 'items-center')}><RoutingChip profile={p} /></span>
                <span className={cn(COL.agents, 'text-[13px]')}>
                    <Count value={channel.liveCallbacks} of={channel.totalCallbacks} />
                </span>
                <span className={cn(COL.payloads, 'text-[13px]')}><Count value={channel.payloads} /></span>
                <span className={COL.state}>
                    <StatusWord tone={meta.tone}>{busy ? 'Working' : meta.label}</StatusWord>
                </span>
            </button>

            {canToggle && (
                <button
                    type="button"
                    onClick={() => onToggle(channel)}
                    disabled={busy}
                    title={busy ? `Working on ${p.name}` : p.running ? `Stop ${p.name}` : `Start ${p.name}`}
                    aria-label={busy
                        ? `${p.name}, working`
                        : p.running ? `Stop ${p.name}` : `Start ${p.name}`}
                    className={cn(
                        'absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm border transition-colors',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                        busy ? 'border-amber-400/40 text-amber-400'
                            : p.running ? 'border-signal/20 text-signal hover:border-red-400/60 hover:text-red-400'
                                : 'border-signal/20 text-signal hover:border-accent hover:text-accent',
                    )}
                >
                    {busy
                        ? <RefreshCw size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                        : <Power size={13} strokeWidth={2} aria-hidden="true" />}
                </button>
            )}
        </div>
    );
});

/** Loading is shown as the instrument it will become, not as a spinner and a
 *  sentence: the header strip, the columns and six rows are already true. */
function ChannelSkeleton() {
    return (
        <div aria-hidden="true" className="divide-y divide-signal/10">
            {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-signal/15" />
                    <span className="h-3 flex-1 animate-pulse rounded-sm bg-signal/10"
                        style={{ maxWidth: `${38 + ((i * 13) % 30)}%`, animationDelay: `${i * 90}ms` }} />
                    <span className="hidden h-3 w-16 animate-pulse rounded-sm bg-signal/[0.07] md:block"
                        style={{ animationDelay: `${i * 90}ms` }} />
                    <span className="h-3 w-[6.5rem] animate-pulse rounded-sm bg-signal/[0.07]"
                        style={{ animationDelay: `${i * 90}ms` }} />
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The selected channel's full record.
 *
 * This is the side preview panel the design language asks for whenever a list
 * is a chooser (§4): the list answers "which channels exist and how are they",
 * the inspector answers "what exactly is this one, and what can I do to it".
 * It replaces an accordion that pushed every other row down the moment you
 * asked a question about one of them.
 */
const ChannelInspector = React.memo(function ChannelInspector({
    channel, busy, onToggle, onArchive, onOpenWorkbench,
}: {
    channel: C2Channel | null;
    busy: boolean;
    onToggle: (c: C2Channel) => void;
    onArchive: (c: C2Channel) => void;
    onOpenWorkbench: (c: C2Channel, tab: WorkbenchTab) => void;
}) {
    if (!channel) {
        return (
            <InstrumentPanel title="Channel" icon={<Server size={14} strokeWidth={2} />} badge="—">
                <NoData>Select a channel to inspect it</NoData>
            </InstrumentPanel>
        );
    }

    const p = channel.profile;
    const meta = STATE_META[channel.state];
    const archived = channel.state === 'archived';
    const registered = p.creation_time ? String(p.creation_time).slice(0, 10) : '—';

    return (
        <InstrumentPanel
            title={p.name}
            ariaLabel={`Channel ${p.name}`}
            icon={<Server size={14} strokeWidth={2} />}
            badge={busy ? 'Working' : meta.label}
            badgeTone={busy ? 'warn' : meta.tone}
            footerLeft={<>Registered {registered}</>}
            footerRight={<>id {p.id}</>}
        >
            {/* The whole body is keyed on the profile so switching selection
                cross-fades rather than snapping — §7's no-hard-cut rule at
                inline scale, so 200ms, not 500. */}
            <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                className="flex min-h-0 flex-1 flex-col"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <RoutingChip profile={p} />
                    {p.is_server_routed && (
                        <span
                            title="Traffic for this channel is proxied through the Mythic server itself"
                            className="inline-flex items-center gap-1.5 rounded-sm border border-signal/25 bg-signal/[0.04] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-signal"
                        >
                            <Network size={10} strokeWidth={2} aria-hidden="true" /> Server routed
                        </span>
                    )}
                    <Version semver={p.semver} />
                    <span className="min-w-0 truncate text-[11px] text-signal opacity-60">{p.author}</span>
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-signal">
                    {p.description || 'This profile ships no description.'}
                </p>

                {/* ── Subsystems. The two booleans that produced the state, so
                     "degraded" is never a verdict without its evidence. ── */}
                <div className="mt-4">
                    <span className={cn('text-signal opacity-70', LABEL)}>Subsystems</span>
                    <div className="mt-1.5">
                        <DataRow
                            label={<span className="flex items-center gap-2"><Cpu size={13} strokeWidth={2} aria-hidden="true" />Container</span>}
                            state={p.container_running ? 'Up' : 'Down'}
                            tone={p.container_running ? 'live' : 'signal'}
                        />
                        <DataRow
                            label={<span className="flex items-center gap-2"><Radio size={13} strokeWidth={2} aria-hidden="true" />C2 server</span>}
                            state={p.running ? 'Listening' : 'Stopped'}
                            tone={p.running ? 'live' : 'signal'}
                        />
                        <DataRow
                            label={<span className="flex items-center gap-2"><Users size={13} strokeWidth={2} aria-hidden="true" />Live agents</span>}
                            state={`${channel.liveCallbacks} of ${channel.totalCallbacks}`}
                            tone={channel.liveCallbacks > 0 ? 'live' : 'signal'}
                        />
                        <DataRow
                            label={<span className="flex items-center gap-2"><Package size={13} strokeWidth={2} aria-hidden="true" />Payloads built</span>}
                            state={channel.payloads}
                            tone="signal"
                        />
                    </div>
                </div>

                {/* ── Agents. Which payload types can even speak this. ── */}
                <div className="mt-4">
                    <span className={cn('text-signal opacity-70', LABEL)}>
                        Supported agents {channel.agents.length > 0 && (
                            <span className="tabular-nums opacity-80">· {channel.agents.length}</span>
                        )}
                    </span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {channel.agents.length === 0 && (
                            <span className="text-[13px] text-signal opacity-55">No agent declares support for this profile</span>
                        )}
                        {channel.agents.map(a => (
                            <span key={a} className="rounded-sm border border-signal/25 bg-signal/[0.04] px-2 py-0.5 text-[11px] text-signal">
                                {a}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── Controls. Pushed to the bottom of the panel so they are
                     always in the same place regardless of body length. ── */}
                <div className="mt-auto space-y-2 pt-5">
                    <button
                        type="button"
                        onClick={() => onToggle(channel)}
                        disabled={busy || archived}
                        title={archived ? 'Restore this channel before starting it' : undefined}
                        className={cn(
                            'flex min-h-[38px] w-full items-center justify-center gap-2 rounded-sm border text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                            busy || archived
                                ? 'cursor-not-allowed border-signal/20 text-signal opacity-50'
                                : p.running
                                    ? 'border-red-400/50 text-red-400 hover:bg-red-400/10 hover:border-red-400'
                                    : 'border-accent bg-accent text-void hover:bg-accent/90',
                        )}
                    >
                        {busy
                            ? <><RefreshCw size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />Working</>
                            : <><Power size={13} strokeWidth={2} aria-hidden="true" />{p.running ? 'Stop channel' : 'Start channel'}</>}
                    </button>

                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => onOpenWorkbench(channel, 'config')}
                            className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-sm border border-signal/20 text-[11px] font-bold uppercase tracking-[0.1em] text-signal transition-colors hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                        >
                            <Settings2 size={12} strokeWidth={2} aria-hidden="true" />Config
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpenWorkbench(channel, 'console')}
                            className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-sm border border-signal/20 text-[11px] font-bold uppercase tracking-[0.1em] text-signal transition-colors hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                        >
                            <ScrollText size={12} strokeWidth={2} aria-hidden="true" />Log
                        </button>
                        <button
                            type="button"
                            onClick={() => onArchive(channel)}
                            className={cn(
                                'flex min-h-[34px] items-center justify-center gap-1.5 rounded-sm border text-[11px] font-bold uppercase tracking-[0.1em] transition-colors',
                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                archived
                                    ? 'border-signal/20 text-signal hover:border-accent hover:text-accent'
                                    : 'border-signal/20 text-signal hover:border-red-400/60 hover:text-red-400',
                            )}
                        >
                            {archived
                                ? <><ArchiveRestore size={12} strokeWidth={2} aria-hidden="true" />Restore</>
                                : <><Archive size={12} strokeWidth={2} aria-hidden="true" />Archive</>}
                        </button>
                    </div>
                </div>
            </motion.div>
        </InstrumentPanel>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | ChannelState;
type SortKey = 'triage' | 'name' | 'load';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'triage', label: 'Triage' },
    { key: 'name', label: 'Name' },
    { key: 'load', label: 'Load' },
];

/** The mutations, typed. `useMutation<any>` costs nothing at the call site and
 *  everything at the response: `res.data.startStopProfile.error` type-checks
 *  whatever you spell it, so a rename upstream lands as a runtime undefined. */
interface StartStopData { startStopProfile: { status: string; error: string | null; output: string | null } | null }
interface StartStopVars { id: number; action: 'start' | 'stop' }
interface ToggleDeleteData { update_c2profile_by_pk: { id: number; deleted: boolean } | null }
interface ToggleDeleteVars { c2profile_id: number; deleted: boolean }

/** Triage order: what is broken, then what is working, then what is off.
 *  A "sort by state" that put ONLINE first would bury the one row that needs
 *  an operator — the same reason the Dashboard sorts silent callbacks first. */
const TRIAGE_RANK: Record<ChannelState, number> = { degraded: 0, online: 1, stopped: 2, archived: 3 };

export default function C2Profiles() {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const reduce = useReducedMotion();
    const { data, loading, error } = useSubscription<{ c2profile: C2ProfileRecord[] }>(SUB_C2_PROFILES);

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [filter, setFilter] = useState<FilterKey>('all');
    const [sort, setSort] = useState<SortKey>('triage');
    const [query, setQuery] = useState('');
    // A set, not an id. Two mutations can be in flight at once, and a single
    // `processingId` could only remember the last one: the first response back
    // cleared the OTHER row's spinner, so a row still waiting on its own
    // mutation stopped saying so. (It does not, and never did, claim to track
    // the container past the ACK — Mythic moves that asynchronously and the
    // subscription is what reports it.)
    const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set());
    const [workbench, setWorkbench] = useState<{ id: number; tab: WorkbenchTab } | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const profiles = data?.c2profile;
    // Nothing to age unless some callback rides some channel; see `useTick`.
    const hasCallbackLinks = useMemo(
        () => (profiles ?? []).some(p => (p.callbackc2profiles?.length ?? 0) > 0),
        [profiles],
    );
    // Liveness reads Date.now(), so the tick is a real dependency of the
    // derivation below — without it the live/silent split freezes at the last
    // data change, which is exactly when a node going quiet stops showing.
    const tick = useTick(30_000, hasCallbackLinks);

    useEffect(() => {
        if (data) setLastUpdated(Date.now());
    }, [data]);

    // No inline options object on either hook: it would be a fresh object every
    // render, and errors are handled per call below, where the id being acted
    // on is still in scope.
    const [startStopProfile] = useMutation<StartStopData, StartStopVars>(START_STOP_PROFILE_MUTATION);
    const [toggleDelete] = useMutation<ToggleDeleteData, ToggleDeleteVars>(TOGGLE_C2_PROFILE_DELETE);

    const clearPending = useCallback((id: number) => {
        setPending(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const handleToggle = useCallback((channel: C2Channel) => {
        const { id } = channel;
        const verb = channel.profile.running ? 'stop' : 'start';
        setPending(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
        // Resolved per call rather than through the hook's `onCompleted`, which
        // has no idea which profile it is answering for.
        startStopProfile({ variables: { id, action: verb } })
            .then(res => {
                // Mythic refuses a start inside a 200 OK: `status: "error"` with
                // the reason in `output`, not a GraphQL error. Unread, a refused
                // start is indistinguishable from a successful one — the spinner
                // clears, the row does not move, and the operator clicks again.
                const out = res.data?.startStopProfile;
                if (out?.status === 'error') {
                    snackActions.error(out.output || out.error || `Could not ${verb} ${channel.name}`);
                }
            })
            .catch(err => snackActions.error(`Failed to ${verb} ${channel.name} — ${getErrorMessage(err)}`))
            .finally(() => clearPending(id));
    }, [startStopProfile, clearPending]);

    const handleArchive = useCallback((channel: C2Channel) => {
        const verb = channel.profile.deleted ? 'restore' : 'archive';
        toggleDelete({ variables: { c2profile_id: channel.id, deleted: !channel.profile.deleted } })
            .catch(err => {
                // `update_c2profile` is granted to mythic_admin only, so for
                // every other role Hasura answers "field
                // 'update_c2profile_by_pk' not found in type: 'mutation_root'".
                // That is a true sentence about a schema and a useless one
                // about an operator's permissions.
                const raw = getErrorMessage(err);
                snackActions.error(/not found in type|permission/i.test(raw)
                    ? `Only a Mythic admin can ${verb} a C2 profile.`
                    : `Could not ${verb} ${channel.name} — ${raw}`);
            });
    }, [toggleDelete]);

    const handleWorkbench = useCallback((channel: C2Channel, tab: WorkbenchTab) => {
        setWorkbench({ id: channel.id, tab });
    }, []);

    const closeWorkbench = useCallback(() => setWorkbench(null), []);

    // ── Derivation ──────────────────────────────────────────────────────────
    // One pass, one memo. The first version derived per-channel counts here and
    // then walked `callbackc2profiles` a second time to build the fleet totals,
    // calling `isCallbackAlive` twice for every callback on the server. The
    // fleet figures cannot be summed from the per-channel ones — a callback can
    // ride two profiles and would be counted twice — so they are collected as
    // id sets during the same traversal instead.
    const { channels, stats } = useMemo<{ channels: C2Channel[]; stats: FleetStats }>(() => {
        const list = profiles ?? [];
        const liveIds = new Set<number>();
        const seenIds = new Set<number>();
        const payloadIds = new Set<number>();
        const agentTypes = new Set<string>();
        let online = 0, degraded = 0, stopped = 0, archived = 0, egress = 0, p2p = 0;

        const channels = list.map<C2Channel>(p => {
            const state = stateOf(p);
            const inFleet = state !== 'archived';

            if (state === 'online') online++;
            else if (state === 'degraded') degraded++;
            else if (state === 'stopped') stopped++;
            else archived++;
            if (inFleet) (p.is_p2p ? p2p++ : egress++);

            let live = 0, total = 0;
            for (const link of p.callbackc2profiles ?? []) {
                const cb = link?.callback;
                if (!cb) continue;
                total++;
                // `active: false` means an operator hid it, not that it died,
                // so it still counts as a callback — just not a live one.
                const alive = cb.active !== false && isCallbackAlive(cb);
                if (alive) live++;
                if (inFleet) {
                    seenIds.add(cb.id);
                    if (alive) liveIds.add(cb.id);
                }
            }

            let payloads = 0;
            for (const link of p.payloadc2profiles ?? []) {
                if (!link?.payload || link.payload.deleted) continue;
                payloads++;
                if (inFleet) payloadIds.add(link.payload.id);
            }

            const agents: string[] = [];
            for (const link of p.payloadtypec2profiles ?? []) {
                if (!link?.payloadtype || link.payloadtype.deleted) continue;
                agents.push(link.payloadtype.name);
                if (inFleet) agentTypes.add(link.payloadtype.name);
            }

            return {
                profile: p, id: p.id, name: p.name, state,
                liveCallbacks: live, totalCallbacks: total, payloads, agents,
            };
        });

        return {
            channels,
            stats: {
                total: channels.length,
                fleet: channels.length - archived,
                online, degraded, stopped, archived, egress, p2p,
                liveCallbacks: liveIds.size,
                totalCallbacks: seenIds.size,
                payloads: payloadIds.size,
                agentTypes: agentTypes.size,
            },
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profiles, tick]);

    /** Health is a STATE with its evidence, not a score out of a hundred. */
    const health = useMemo<{ label: string; tone: Tone; detail: string }>(() => {
        if (stats.fleet === 0) return { label: 'No channels', tone: 'idle', detail: 'Nothing registered' };
        if (stats.online === 0) return { label: 'Dark', tone: 'fail', detail: 'No channel is serving' };
        if (stats.degraded > 0) {
            return {
                label: 'Degraded', tone: 'warn',
                detail: `${stats.degraded} ${plural(stats.degraded, 'channel')} half up`,
            };
        }
        if (stats.stopped > 0) {
            return {
                label: 'Partial', tone: 'signal',
                detail: `${stats.stopped} ${plural(stats.stopped, 'channel')} stopped`,
            };
        }
        return { label: 'Nominal', tone: 'live', detail: 'Every channel serving' };
    }, [stats]);

    // The filter runs on a DEFERRED copy of the query. Each keystroke otherwise
    // re-filters, re-sorts and hands framer-motion a new list to measure and
    // animate before the character appears — the input goes gummy exactly when
    // an operator is typing fast. The field itself stays on `query`, so it is
    // never the thing that lags.
    const deferredQuery = useDeferredValue(query);

    const rows = useMemo(() => {
        const q = deferredQuery.trim().toLowerCase();
        let list = channels.filter(c => filter === 'all' ? c.state !== 'archived' : c.state === filter);
        if (q) {
            list = list.filter(c =>
                c.name.toLowerCase().includes(q)
                || (c.profile.author || '').toLowerCase().includes(q)
                || (c.profile.description || '').toLowerCase().includes(q)
                || c.agents.some(a => a.toLowerCase().includes(q)));
        }
        return list.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'load') {
                return (b.liveCallbacks - a.liveCallbacks)
                    || (b.payloads - a.payloads)
                    || a.name.localeCompare(b.name);
            }
            return (TRIAGE_RANK[a.state] - TRIAGE_RANK[b.state]) || a.name.localeCompare(b.name);
        });
    }, [channels, filter, deferredQuery, sort]);

    /**
     * Selection is DERIVED, not synced.
     *
     * This was an effect that watched `rows` and wrote `selectedId` whenever
     * the current one filtered out — which meant every arrival of data rendered
     * once with an empty inspector, then again with the fallback, and the panel
     * visibly blinked. Falling back during render costs nothing and never shows
     * the intermediate state. `selectedId` still holds the operator's actual
     * choice, so switching a filter away and back restores it.
     */
    const activeId = selectedId != null && rows.some(r => r.id === selectedId)
        ? selectedId
        : rows[0]?.id ?? null;

    const selected = useMemo(
        () => (activeId == null ? null : channels.find(c => c.id === activeId) ?? null),
        [channels, activeId],
    );

    const workbenchProfile = useMemo(
        () => (workbench == null ? null : channels.find(c => c.id === workbench.id)?.profile ?? null),
        [channels, workbench],
    );

    const tabs = useMemo(() => ([
        { key: 'all' as FilterKey, label: 'All', count: stats.fleet },
        { key: 'online' as FilterKey, label: 'Online', count: stats.online },
        { key: 'degraded' as FilterKey, label: 'Degraded', count: stats.degraded },
        { key: 'stopped' as FilterKey, label: 'Stopped', count: stats.stopped },
        { key: 'archived' as FilterKey, label: 'Archived', count: stats.archived },
    ]), [stats]);

    // ── Keyboard ────────────────────────────────────────────────────────────
    const moveSelection = useCallback((delta: number) => {
        if (rows.length === 0) return;
        const idx = rows.findIndex(r => r.id === activeId);
        const next = idx < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + delta));
        const target = rows[next];
        if (!target) return;
        setSelectedId(target.id);
        // Queried, not held in a ref map: the map cost every row a fresh
        // callback prop on every render, and the browser scrolls a focused
        // element into view for free.
        listRef.current
            ?.querySelector<HTMLButtonElement>(`[data-channel-id="${target.id}"]`)
            ?.focus();
    }, [rows, activeId]);

    const onListKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    }, [moveSelection]);

    // `/` focuses search — the one shortcut worth having on a list page, and
    // it must not fire while the operator is typing into something else.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const showSkeleton = loading && !data;
    const feedTone: Tone = error ? 'fail' : showSkeleton ? 'warn' : 'live';
    const feedWord = error ? 'Feed lost' : showSkeleton ? 'Connecting' : 'Live';

    return (
        <div className="min-h-screen overflow-x-hidden bg-void font-mono text-signal selection:bg-signal selection:text-void">
            <div className={cn(
                'flex h-screen flex-col overflow-hidden px-6 pb-5 pt-0 transition-all duration-300 lg:px-10',
                isSidebarCollapsed ? 'ml-16' : 'ml-64',
            )}>
                {/* ── Top instrument rail ──────────────────────────────────────
                    The login screen's screen-edge chrome, as the console's own
                    top edge: identity left, link state and controls right. The
                    same split every panel below it uses. */}
                <header className="-mx-6 flex shrink-0 items-center justify-between gap-4 border-b border-signal/20 bg-void/90 px-6 py-2.5 backdrop-blur-sm lg:-mx-10 lg:px-10">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <Radio size={14} strokeWidth={2} className="shrink-0 text-signal" aria-hidden="true" />
                        <h1 className="text-[13px] font-bold tracking-[0.14em] text-signal">C2 PROFILES</h1>
                        <span className="hidden text-[13px] text-signal opacity-60 sm:inline">Egress channel control</span>
                        <span aria-hidden="true" className="hidden h-3 w-px bg-signal/20 sm:inline-block" />
                        <span className="hidden min-w-0 truncate text-[13px] text-signal md:inline">
                            <span className="opacity-60">Serving</span>{' '}
                            <span className="font-bold tabular-nums">{stats.online}/{stats.fleet}</span>
                        </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                        <StatusWord tone={health.tone} dot className="hidden md:inline-flex">
                            <span role="status" aria-atomic="true">{health.label}</span>
                        </StatusWord>
                        <span className="hidden text-[13px] tabular-nums text-signal opacity-60 lg:inline">
                            <Freshness lastUpdated={lastUpdated} />
                        </span>
                        {/* No refresh button: this page is a live subscription,
                            and a button that pretends to fetch would be a lie.
                            What the operator needs is whether the feed is up —
                            hence a readout, and an `Activity` glyph rather than
                            a refresh arrow that would claim to be clickable. */}
                        <span className={cn(
                            'inline-flex h-8 items-center gap-2 rounded-sm border px-3 text-[12px] font-bold uppercase tracking-[0.1em]',
                            error ? 'border-red-400/50 text-red-400' : 'border-signal/20 text-signal',
                        )}>
                            <Activity
                                size={13} strokeWidth={2} aria-hidden="true"
                                className={cn(showSkeleton && !reduce && 'animate-pulse')}
                            />
                            {feedWord}
                        </span>
                    </div>
                </header>

                {/* ── Fleet posture ──────────────────────────────────────────── */}
                <div className="mv-panel-enter mt-4 shrink-0" style={{ '--mv-panel-index': 0 } as React.CSSProperties}>
                    <FleetPosture stats={stats} health={health} lastUpdated={lastUpdated} />
                </div>

                {/* ── Controls ───────────────────────────────────────────────── */}
                <div
                    className="mv-panel-enter mt-4 flex shrink-0 flex-wrap items-center gap-3"
                    style={{ '--mv-panel-index': 1 } as React.CSSProperties}
                >
                    <Segmented options={tabs} value={filter} onChange={setFilter} ariaLabel="Filter channels by state" />

                    <div className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
                        <Search
                            size={13} strokeWidth={2} aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-signal opacity-60"
                        />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
                            placeholder="Filter by name, author, agent…"
                            aria-label="Filter channels"
                            className={cn(
                                'min-h-[34px] w-full rounded-sm border border-signal/20 bg-black/30 pl-9 pr-9 text-[13px] text-signal',
                                'transition-colors placeholder:text-signal/45 hover:border-signal/40',
                                'focus:border-signal/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                            )}
                        />
                        <kbd
                            aria-hidden="true"
                            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-signal/20 px-1 text-[10px] text-signal opacity-50"
                        >
                            /
                        </kbd>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={cn('hidden text-signal opacity-70 sm:inline', LABEL)}>Sort</span>
                        <Segmented options={SORTS} value={sort} onChange={setSort} ariaLabel="Sort channels" />
                    </div>
                </div>

                {/* ── Board: list + inspector ──────────────────────────────────
                    `<main>`: the page had no landmark at all, so a screen
                    reader user had no way to skip the rails and the hero to
                    get to the channels. */}
                <main className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-3 lg:overflow-visible">
                    <div
                        className="mv-panel-enter min-h-[45vh] lg:col-span-2 lg:h-full lg:min-h-0"
                        style={{ '--mv-panel-index': 2 } as React.CSSProperties}
                    >
                        <InstrumentPanel
                            title="Channels"
                            icon={<Network size={14} strokeWidth={2} />}
                            badge={`${rows.length}/${stats.total}`}
                            badgeTone={feedTone}
                            ariaLabel="C2 channels"
                            footerLeft={error
                                ? <span className="text-red-400">Subscription error — showing the last known state</span>
                                : <>↑↓ moves · / filters · a row inspects</>}
                            footerRight={<>{stats.liveCallbacks} live {plural(stats.liveCallbacks, 'agent')}</>}
                            bodyClassName="p-0 overflow-hidden"
                        >
                            <ChannelListHeader />

                            {error && (
                                <div role="alert" className="flex items-start gap-2 border-b border-red-400/30 bg-red-400/[0.06] px-4 py-2.5">
                                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
                                    <span className="text-[13px] text-red-400">
                                        {error.message || 'The C2 profile feed dropped.'}
                                    </span>
                                </div>
                            )}

                            {/* `relative`: `popLayout` absolutely positions a
                                row while it leaves, and it has to resolve
                                against this scroller, not some ancestor. */}
                            <div
                                ref={listRef}
                                className="cyber-scrollbar relative min-h-0 flex-1 overflow-y-auto"
                                onKeyDown={onListKeyDown}
                            >
                                {showSkeleton ? <ChannelSkeleton /> : rows.length === 0 ? (
                                    <NoData>
                                        {query.trim()
                                            ? `Nothing matches “${query.trim()}”`
                                            : stats.total === 0
                                                ? 'No C2 profiles are installed on this Mythic server'
                                                : filter === 'archived'
                                                    ? 'No archived channels'
                                                    : 'No channel is in this state'}
                                    </NoData>
                                ) : (
                                    <AnimatePresence initial={false} mode="popLayout">
                                        {rows.map(c => (
                                            <motion.div
                                                key={c.id}
                                                layout={reduce ? false : 'position'}
                                                initial={reduce ? false : { opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                                                transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                                            >
                                                <ChannelLine
                                                    channel={c}
                                                    selected={c.id === activeId}
                                                    busy={pending.has(c.id)}
                                                    onSelect={setSelectedId}
                                                    onToggle={handleToggle}
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>
                        </InstrumentPanel>
                    </div>

                    <div
                        className="mv-panel-enter min-h-[360px] lg:h-full lg:min-h-0"
                        style={{ '--mv-panel-index': 3 } as React.CSSProperties}
                    >
                        <ChannelInspector
                            channel={selected}
                            busy={selected != null && pending.has(selected.id)}
                            onToggle={handleToggle}
                            onArchive={handleArchive}
                            onOpenWorkbench={handleWorkbench}
                        />
                    </div>
                </main>

                {/* ── Bottom instrument rail ─────────────────────────────────── */}
                <div className="-mx-6 mt-4 flex shrink-0 items-center justify-between gap-4 border-t border-signal/20 bg-void/90 px-6 py-2 backdrop-blur-sm lg:-mx-10 lg:px-10">
                    <div className="flex min-w-0 items-center gap-5 overflow-hidden">
                        <span className="flex shrink-0 items-center gap-2 text-[13px]">
                            <Radio size={13} strokeWidth={2} className="text-signal" aria-hidden="true" />
                            <span className="text-signal opacity-60">Serving</span>
                            <span className="font-bold tabular-nums text-signal">{stats.online}/{stats.fleet}</span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 text-[13px] sm:flex">
                            <span className="text-signal opacity-60">Degraded</span>
                            <StatusWord tone={stats.degraded > 0 ? 'warn' : 'signal'}>
                                {stats.degraded > 0 ? `${stats.degraded} ${plural(stats.degraded, 'channel')}` : 'None'}
                            </StatusWord>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 text-[13px] md:flex">
                            <span className="text-signal opacity-60">Agents</span>
                            <span className="font-bold tabular-nums text-signal">{stats.liveCallbacks}/{stats.totalCallbacks}</span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 text-[13px] lg:flex">
                            <span className="text-signal opacity-60">Payloads</span>
                            <span className="font-bold tabular-nums text-signal">{stats.payloads}</span>
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-5">
                        <span className="hidden items-center gap-2 text-[13px] md:flex">
                            <span className="text-signal opacity-60">Feed</span>
                            <StatusWord tone={feedTone}>{feedWord}</StatusWord>
                        </span>
                        <span className="text-[13px] text-signal opacity-60">Build 2.2.1</span>
                    </div>
                </div>
            </div>

            {/* The workbench is addressed by id and re-reads the live channel
                on every push, not a snapshot taken when it opened. Pressing
                START inside it used to leave its own header reading DEGRADED
                until it was closed and reopened. */}
            <C2DetailsModal
                profile={workbenchProfile}
                initialTab={workbench?.tab ?? 'overview'}
                isOpen={!!workbench}
                onClose={closeWorkbench}
            />
        </div>
    );
}
