/**
 * MSF → synthetic Callback adapter + reactive hook.
 *
 * Why this exists: the operator should see Metasploit sessions on every
 * Mythic-derived surface — the Callbacks table, the 2D CallbackGraph
 * (network topology), the 3D Topology, host-group counts, etc. Each of
 * those reads a callback array. By synthesising MSF sessions into the
 * Callback shape once and merging that array into every view, the rest
 * of the codebase needs zero per-feature MSF handling.
 *
 * Identity scheme (kept large/positive so rows render as ordinary
 * Mythic-shaped `#N` callbacks, not as a special "MSF-N" variant):
 *   id          = -100000 - numericMsfId       (negative — used as React
 *                                                key, no collision risk)
 *   display_id  = MSF_DISPLAY_ID_OFFSET + sid  (e.g. 100003 for sid 3)
 * The display_id is the only identifier shown to the operator; an MSF
 * session is detected purely by `display_id >= MSF_DISPLAY_ID_OFFSET`
 * (or the legacy `_isMsfSession`/agent_callback_id checks).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useReactiveVar } from '@apollo/client/react';
import type { Callback } from '../../types';
import { usePageVisible } from '../../lib/usePageVisible';
import { getSessions as getMsfSessions, workspaceForOperation, type MsfSession } from '../Metasploit/msfrpc';
import * as mythicKV from '../../lib/mythicKVStore';
import { meState } from '../../lib/state';

/** Numeric offset that separates MSF synthetic display_ids from Mythic ones.
 *  Mythic display_ids start at 1 per operation and rarely reach 5 figures,
 *  so 100000 is a safe partition. */
export const MSF_DISPLAY_ID_OFFSET = 100000;

const POLL_INTERVAL_MS = 8_000;
const LEDGER_KEY = 'minerva_msf_session_ledger';
/** ISO string used to mark dead callbacks — matches Mythic's "1970" sentinel. */
const DEAD_TIMESTAMP = '1970-01-01T00:00:00.000Z';

// ── Session ledger ────────────────────────────────────────────────────────
// MSF-RPC's `session.list` only returns currently-attached sessions, so a
// killed/disconnected session would vanish from the UI. Mythic callbacks
// stay visible with a death indicator; we mirror that by keeping a local
// ledger of every session we've ever seen, marking entries dead when they
// stop appearing in the live list. The ledger is persisted to localStorage
// so dead rows survive page reloads.

interface MsfLedgerEntry {
    sessionId: string;
    /** Most recent MSF-RPC snapshot. Frozen at time-of-death once dead=true. */
    snapshot: MsfSession;
    firstSeen: string;
    lastSeen: string;
    dead: boolean;
    diedAt?: string;
    /**
     * Mythic operation that "owns" this session. Pinned to whatever
     * operation the operator was in when MSF first surfaced the
     * session. Once set it never changes (the session belongs to that
     * engagement). Filtering on this is what stops a meterpreter
     * established in op A from leaking into op B's Callbacks list.
     *
     * Legacy entries written before this field existed leave it
     * undefined; on the next reconcile inside any operation, they get
     * back-filled to that op so they reappear instead of vanishing.
     */
    operationId?: number;
    /** Operator-toggled hide flag — synthetic callback then reports active=false. */
    hidden?: boolean;
}

type Ledger = Record<string, MsfLedgerEntry>;

const ledgerListeners = new Set<() => void>();
let ledgerCache: Ledger | null = null;
const EMPTY_CALLBACKS: Callback[] = [];

function readLedger(): Ledger {
    if (ledgerCache) return ledgerCache;
    mythicKV.manageKey(LEDGER_KEY);
    try {
        const raw = mythicKV.getItem(LEDGER_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        ledgerCache = parsed && typeof parsed === 'object' ? (parsed as Ledger) : {};
    } catch {
        ledgerCache = {};
    }
    return ledgerCache;
}

function writeLedger(next: Ledger) {
    ledgerCache = next;
    mythicKV.manageKey(LEDGER_KEY);
    mythicKV.setItem(LEDGER_KEY, JSON.stringify(next));
    ledgerListeners.forEach(fn => { try { fn(); } catch { /* swallow */ } });
}

function subscribeLedger(fn: () => void): () => void {
    ledgerListeners.add(fn);
    return () => { ledgerListeners.delete(fn); };
}

/**
 * Permanently drop a session from the ledger. Useful for dead rows the
 * operator no longer cares about.
 */
export function removeMsfSessionFromLedger(sessionId: string): void {
    const prev = readLedger();
    if (!(sessionId in prev)) return;
    const { [sessionId]: _, ...rest } = prev;
    writeLedger(rest);
}

/**
 * Toggle the operator-side `hidden` flag on a session. Synthetic
 * callback then reports `active: false` so the standard "Hide
 * Hidden" filter on the Callbacks page picks it up — the same UX
 * a Mythic callback's HIDE_CALLBACK_MUTATION produces, but stored
 * client-side because MSF synthetic ids don't exist in Mythic's DB.
 */
export function setMsfSessionHidden(sessionId: string, hidden: boolean): void {
    const prev = readLedger();
    const entry = prev[sessionId];
    if (!entry) return;
    if (!!entry.hidden === hidden) return;
    writeLedger({ ...prev, [sessionId]: { ...entry, hidden } });
}

/**
 * Synchronous lookup — returns the most recent MSF-RPC snapshot for a
 * session id, or null if the ledger has never seen it. Used by the Console
 * page to render immediately on mount instead of waiting on a fresh
 * `session.list` round-trip; the background poller then keeps the snapshot
 * fresh. Returns the live snapshot even for entries flagged `dead` so the
 * Console can render "session terminated" chrome with the last-known host
 * info rather than a blank.
 */
export function getMsfLedgerSnapshot(sessionId: string): MsfSession | null {
    const ledger = readLedger();
    return ledger[sessionId]?.snapshot ?? null;
}

/** Drop all dead entries in one go. */
export function clearDeadMsfSessions(): number {
    const prev = readLedger();
    const next: Ledger = {};
    let removed = 0;
    for (const [id, entry] of Object.entries(prev)) {
        if (entry.dead) { removed++; continue; }
        next[id] = entry;
    }
    if (removed > 0) writeLedger(next);
    return removed;
}

/**
 * Merge a fresh `session.list` result into the ledger.
 *  - new ids → add as alive
 *  - existing alive ids → bump lastSeen, refresh snapshot
 *  - existing ids missing from live → flip to dead with diedAt timestamp
 */
// ── New-session event bus ────────────────────────────────────────────────
// Mythic plays a sound + shows a toast when a callback first connects. We
// mirror that: every time the reconciler inserts a brand-new ledger entry
// it fires this event. Sessions that resurrect (entry exists but was dead)
// also count as "new" arrivals.
//
// First-reconcile suppression: on initial page load we'll insert one entry
// per session already running on MSF-RPC. Firing N sounds for sessions the
// operator already knows about would be noise — we skip emission for the
// very first reconcile pass.
export interface MsfNewSessionEvent {
    sessionId: string;
    snapshot: MsfSession;
    resurrected: boolean;
}
type NewSessionListener = (e: MsfNewSessionEvent) => void;
const newSessionListeners = new Set<NewSessionListener>();
let firstReconcileDone = false;

export function subscribeMsfNewSession(fn: NewSessionListener): () => void {
    newSessionListeners.add(fn);
    return () => { newSessionListeners.delete(fn); };
}

function reconcileLedger(live: Record<string, MsfSession>): boolean {
    const prev = readLedger();
    const next: Ledger = { ...prev };
    const now = new Date().toISOString();
    // Operation that "owns" any newly-seen session this tick. Legacy
    // entries (no operationId set yet) also get back-filled to this op
    // — without it they would stay invisible in every operation forever.
    const currentOpId = meState().user?.current_operation_id ?? 0;
    let dirty = false;
    const fresh: MsfNewSessionEvent[] = [];

    for (const [id, snapshot] of Object.entries(live)) {
        const existing = next[id];
        if (!existing) {
            next[id] = { sessionId: id, snapshot, firstSeen: now, lastSeen: now, dead: false, operationId: currentOpId || undefined };
            dirty = true;
            fresh.push({ sessionId: id, snapshot, resurrected: false });
        } else if (existing.dead) {
            // Same session id is back online — treat as an arrival. Keep
            // the original operationId; a resurrected session belongs to
            // the same engagement it started in.
            next[id] = { ...existing, snapshot, lastSeen: now, dead: false, diedAt: undefined };
            dirty = true;
            fresh.push({ sessionId: id, snapshot, resurrected: true });
        } else if (existing.operationId == null && currentOpId) {
            // Back-fill legacy entries (no operationId) — meaningful
            // change, persist it.
            next[id] = { ...existing, snapshot, lastSeen: now, operationId: currentOpId };
            dirty = true;
        } else {
            // Steady state: a healthy session re-confirmed by the poll.
            // We skip persisting a lastSeen bump when the *snapshot*
            // hasn't changed, because writing lastSeen=now every 8s
            // churns mythicKV unnecessarily. Aliveness freshness is
            // handled separately by the per-poll snapshot rebuild
            // (see `pollTick` below), which makes `last_checkin`
            // refresh without touching the ledger.
            const snapshotChanged = JSON.stringify(existing.snapshot) !== JSON.stringify(snapshot);
            if (snapshotChanged) {
                next[id] = { ...existing, snapshot, lastSeen: now };
                dirty = true;
            }
        }
    }

    const liveSet = new Set(Object.keys(live));
    for (const id of Object.keys(next)) {
        const entry = next[id];
        if (!liveSet.has(id) && !entry.dead) {
            next[id] = { ...entry, dead: true, diedAt: now };
            dirty = true;
        }
    }

    if (dirty) writeLedger(next);

    // Don't pop the channel for sessions that already existed on first load.
    if (firstReconcileDone && fresh.length > 0) {
        for (const ev of fresh) {
            newSessionListeners.forEach(fn => { try { fn(ev); } catch { /* swallow */ } });
        }
    }
    firstReconcileDone = true;
    return dirty;
}

// ── Stable snapshot derivation for useSyncExternalStore ───────────────────
// React requires getSnapshot() to return the same reference when the store
// hasn't changed. Cache on the ledger reference (which writeLedger swaps
// every mutation) so we recompute Callback[] only when needed.
let lastLedgerRef: Ledger | null = null;
let lastSnapshotResult: Callback[] = EMPTY_CALLBACKS;

function getSnapshotCallbacks(): Callback[] {
    const ledger = readLedger();
    if (ledger === lastLedgerRef) return lastSnapshotResult;
    lastLedgerRef = ledger;
    lastSnapshotResult = Object.values(ledger).map(entry => msfSessionToCallback(
        entry.sessionId,
        entry.snapshot,
        {
            dead: entry.dead,
            lastSeen: entry.lastSeen,
            diedAt: entry.diedAt,
            operationId: entry.operationId,
            hidden: entry.hidden,
        },
    ));
    return lastSnapshotResult;
}

// MSF doesn't fill `session_host`/`username` consistently. The `info` field
// on a meterpreter session is the actual ground truth — it's formatted as
// `"<user> @ <hostname>"` (e.g. `NT AUTHORITY\SYSTEM @ WIN-DC01`,
// `root @ ubuntu-test`). We parse it once and prefer it over the raw fields.
const INFO_USER_HOST_RE = /^(.+?)\s*@\s*(.+?)\s*$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

function looksLikeIp(s: string | undefined | null): boolean {
    if (!s) return false;
    if (IPV4_RE.test(s)) return true;
    // IPv6: at least two colons and only hex / colon / brackets.
    if (s.includes(':') && /^[\[\]0-9a-fA-F:%.]+$/.test(s)) return true;
    return false;
}

export function parseMsfSessionInfo(info: string | undefined | null): { user: string | null; host: string | null } {
    if (!info) return { user: null, host: null };
    const m = INFO_USER_HOST_RE.exec(info.trim());
    if (!m) return { user: null, host: null };
    const user = m[1].trim() || null;
    const hostRaw = m[2].trim() || null;
    // Some meterpreter builds slip extra metadata after the host (e.g.
    // `WIN-DC01 (Build 19045)`) — strip parenthetical suffixes.
    const host = hostRaw ? hostRaw.replace(/\s*\([^)]*\)\s*$/, '').trim() || null : null;
    return { user, host };
}

/** Pick the best hostname for an MSF session, preferring info → non-IP fields → IP fallback. */
export function pickMsfHost(s: MsfSession): string {
    const parsed = parseMsfSessionInfo(s.info).host;
    if (parsed && !looksLikeIp(parsed)) return parsed;
    if (s.session_host && !looksLikeIp(s.session_host)) return s.session_host;
    if (s.target_host && !looksLikeIp(s.target_host)) return s.target_host;
    // Last-resort fallbacks: hostname is unknown, fall back to IP / 'unknown'.
    return s.session_host || s.target_host || s.tunnel_peer?.split(':')[0] || 'unknown';
}

/** Pick the best username for an MSF session. */
export function pickMsfUser(s: MsfSession): string {
    if (s.username && s.username.toLowerCase() !== 'unknown') return s.username;
    const parsed = parseMsfSessionInfo(s.info).user;
    if (parsed) return parsed;
    return 'msf';
}

/** Convert one MSF session record into a Callback-shaped object. */
export function msfSessionToCallback(id: string, s: MsfSession, options: { dead?: boolean; lastSeen?: string; diedAt?: string; operationId?: number; hidden?: boolean } = {}): Callback {
    const numericId = parseInt(id, 10) || 0;
    const host = pickMsfHost(s);
    const user = pickMsfUser(s);
    // `ip` should always be an IP — fall back through the IP-shaped fields.
    const ip = s.session_host || s.target_host || s.tunnel_peer?.split(':')[0] || '';
    const dead = !!options.dead;
    // Pin dead rows to the 1970 sentinel so `isCallbackAlive` returns false
    // and the existing "Hide Dead" filter / topology colouring picks them up
    // without per-MSF special cases.
    //
    // Alive rows use *now* — not the stored `lastSeen`. Reason: the
    // ledger isn't rewritten every poll (we skip churning mythicKV
    // when nothing changed), so `lastSeen` can be ~5 min stale and
    // `isCallbackAlive` would flip the row to DEAD even though MSF
    // is still listing the session. The snapshot is rebuilt on every
    // successful poll (see pollTick), so `Date.now()` here means
    // "alive as of the most recent poll" — exactly what we want.
    const lastCheckin = dead ? DEAD_TIMESTAMP : new Date().toISOString();
    return {
        id: -100000 - numericId,
        display_id: MSF_DISPLAY_ID_OFFSET + numericId, // MSF rows live above 100000
        user,
        host,
        pid: 0,
        ip,
        // 3D topology uses `host` as the node label — keep it pointed at the
        // human-readable hostname; the IP lives on `ip` for tooltips.
        external_ip: '',
        domain: '',
        os: s.platform || '',
        architecture: s.arch || '',
        integrity_level: 0,
        last_checkin: lastCheckin,
        init_callback: new Date().toISOString(),
        description: s.info || s.desc || '',
        sleep_info: '',
        locked: false,
        locked_operator: null,
        // `active: false` mirrors Mythic's hidden-by-operator flag —
        // standard Callbacks filters and "Show Hidden" toggle pick it up
        // without any per-MSF special case.
        active: !options.hidden,
        dead,
        color: '',
        mythictree_groups: [],
        process_name: '',
        process_short_name: '',
        agent_callback_id: `msf-${id}`,
        extra_info: s.via_payload || '',
        trigger_on_checkin_after_time: null,
        cwd: '',
        impersonation_context: '',
        callbackports: [],
        payload: {
            id: 0,
            description: s.desc || s.info || '',
            uuid: `msf-${id}`,
            payloadtype: {
                id: 0,
                name: s.type === 'meterpreter' ? 'METERPRETER' : 'MSF_SHELL',
                agent_type: 'agent',
            },
        } as Callback['payload'],
        callbackc2profiles: [],
        tags: [],
        operation_id: options.operationId,
        _isMsfSession: true,
        _msfSessionId: id,
        _msfSessionType: s.type,
        _msfSession: s,
        _msfDiedAt: options.diedAt,
        _operationId: options.operationId,
    } as Callback;
}

// ── Module-level singleton MSF polling loop ──────────────────────────────
//
// Why singleton: `useMsfSyntheticCallbacks` is read from at least six
// components (Callbacks, CallbackGraph, Tunnels, ConsoleSelection,
// Topology3D, MsfSocksBootstrap). If each instance ran its own
// `setInterval` + initial `tick()`, opening Callbacks (which mounts two
// of them simultaneously, on top of the bootstrap that's already
// running) would fire 4-6 concurrent `getSessions` RPCs in parallel
// — under React strict mode that doubles, and the ledger writes from
// each successful reply churned the snapshot cache so every subscriber
// re-rendered repeatedly. The page felt frozen.
//
// Singleton fix: the polling loop lives at module scope, started once
// on first hook mount, paused when no subscriber is visible. Every
// consumer just reads the shared ledger via useSyncExternalStore.
let pollingStarted = false;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let pollingPaused = false;
// Concurrency guard — a slow MSF RPC (network blip, daemon busy) used to
// let setInterval queue overlapping ticks, multiplying request load while
// the daemon was already struggling. Now if the previous poll hasn't
// settled, the next interval simply skips.
let pollInFlight = false;
// Throttled re-render heartbeat (see NOTIFY_REFRESH_MS). Tracks when we
// last called the ledger listeners so that even in steady state we still
// refresh the snapshot occasionally to keep `last_checkin = Date.now()`
// fresh enough for `isCallbackAlive`.
let lastNotifyAt = 0;
/**
 * Minimum gap between subscriber notifications when nothing in the
 * ledger has actually changed. Previously every poll (every 8s) forced
 * a snapshot rebuild + listener fan-out so the `last_checkin` timestamp
 * stayed fresh — but every page that consumes synthetic callbacks
 * re-rendered every 8s as a result (Callbacks, CallbackGraph, Topology3D,
 * Tunnels, ConsoleSelection, and the global MsfSocksBootstrap). Even
 * routes that don't show MSF data paid the cost because MsfSocksBootstrap
 * lives at the App shell.
 *
 * 30s is well below the default 5-minute alive threshold, so synthetic
 * MSF rows still surface as alive without the per-poll churn. Real
 * structural changes (new session, dead session, snapshot diff) still
 * notify immediately.
 */
const NOTIFY_REFRESH_MS = 30_000;

async function pollTick(): Promise<void> {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
        const live = await getMsfSessions();
        const dirty = reconcileLedger(live);
        const now = Date.now();
        // Notify on real change, OR on the slow heartbeat to keep
        // `last_checkin` stamped from `msfSessionToCallback` (Date.now())
        // fresh enough for `isCallbackAlive`. Skipping the per-tick
        // notification in steady state is what removed the global UI
        // re-render storm.
        if (dirty || (now - lastNotifyAt) >= NOTIFY_REFRESH_MS) {
            lastLedgerRef = null;
            lastNotifyAt = now;
            ledgerListeners.forEach(fn => { try { fn(); } catch { /* swallow */ } });
        }
    } catch {
        // MSF-RPC unreachable — preserve previous state. Don't mark
        // anything dead from a connection blip; a real disappearance
        // only counts when we get a successful empty list back.
    } finally {
        pollInFlight = false;
    }
}
function startPollingOnce(): void {
    if (pollingStarted) return;
    pollingStarted = true;
    // Initial fetch on the first mount so the page renders the current
    // ledger straight away rather than waiting up to 8s for the first
    // interval tick.
    pollTick();
    pollingTimer = setInterval(() => { if (!pollingPaused) pollTick(); }, POLL_INTERVAL_MS);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            pollingPaused = document.visibilityState !== 'visible';
        });
        pollingPaused = document.visibilityState !== 'visible';
    }
}

/**
 * Subscribe to the persisted MSF ledger and convert it into Callback-shaped
 * rows. The first hook mount starts the *single* shared polling loop;
 * subsequent mounts only attach as ledger subscribers — no extra RPCs.
 *
 * Dead sessions stay visible until the operator removes them, matching how
 * Mythic shows callbacks with `dead: true` rather than dropping them.
 */
export function useMsfSyntheticCallbacks(): Callback[] {
    // `usePageVisible` was previously gated per-instance; now visibility
    // is tracked once at module scope (see startPollingOnce). The hook
    // call here is preserved so any consumer still using its return is
    // not affected — but our gating no longer depends on it.
    usePageVisible();
    useEffect(() => { startPollingOnce(); }, []);

    const all = useSyncExternalStore(
        subscribeLedger,
        getSnapshotCallbacks,
        getSnapshotCallbacks,
    );

    // Scope to the current Mythic operation. Two filters in priority
    // order — both must pass for the session to surface:
    //   1. MSF workspace match — every MsfSession ships with its
    //      `workspace` field. We map current op → `mythic-op-{id}`
    //      (see `workspaceForOperation` in msfrpc). Sessions tagged
    //      with that workspace belong to this op; everything else is
    //      filtered out. This is the *real* isolation — even if Op A's
    //      operator opens Minerva for Op B, Op A's sessions don't
    //      appear because their MSF-side workspace doesn't match.
    //   2. Operator-side `_operationId` first-sight fallback for
    //      sessions whose MSF workspace is missing/blank (sessions
    //      created before Minerva's workspace bootstrap landed).
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    return useMemo(() => {
        if (!opId) return all;
        const expectedWs = workspaceForOperation(opId);
        return all.filter(cb => {
            const session = (cb as any)._msfSession as MsfSession | undefined;
            const ws = session?.workspace?.trim();
            if (ws) return ws === expectedWs;
            // No workspace tag (legacy / pre-bootstrap session) — fall
            // back to client-side first-sight tagging.
            const cbOp = (cb as any)._operationId;
            return cbOp == null || cbOp === opId;
        });
    }, [all, opId]);
}

/**
 * Detect whether a Callback row came from MSF. Cheap, never throws —
 * downstream code (graph routing, node click handlers, context menus)
 * can use this without importing the hook.
 */
export function isMsfCallback(cb: Pick<Callback, 'display_id' | 'agent_callback_id'> & { _isMsfSession?: boolean }): boolean {
    if (cb._isMsfSession === true) return true;
    if (typeof cb.display_id === 'number' && cb.display_id >= MSF_DISPLAY_ID_OFFSET) return true;
    if (typeof cb.agent_callback_id === 'string' && cb.agent_callback_id.startsWith('msf-')) return true;
    return false;
}

/** Detect MSF by a raw display_id (number or numeric string from URL). */
export function isMsfDisplayId(displayId: number | string | undefined | null): boolean {
    if (displayId === undefined || displayId === null) return false;
    const n = typeof displayId === 'number' ? displayId : parseInt(displayId, 10);
    if (!Number.isFinite(n)) return false;
    return n >= MSF_DISPLAY_ID_OFFSET;
}

/** Recover the underlying MSF session id from a synthetic Callback. */
export function msfSessionIdOf(cb: Pick<Callback, 'display_id' | 'agent_callback_id'> & { _msfSessionId?: string }): string | null {
    if (cb._msfSessionId) return String(cb._msfSessionId);
    if (typeof cb.agent_callback_id === 'string' && cb.agent_callback_id.startsWith('msf-')) {
        return cb.agent_callback_id.slice(4);
    }
    if (typeof cb.display_id === 'number' && cb.display_id >= MSF_DISPLAY_ID_OFFSET) {
        return String(cb.display_id - MSF_DISPLAY_ID_OFFSET);
    }
    return null;
}

/**
 * Pick the right console route for a row. Both Mythic and MSF use
 * `/console/<displayId>` — the Console page detects MSF by display_id range.
 */
export function consolePathFor(cb: Pick<Callback, 'display_id' | 'agent_callback_id'> & { _isMsfSession?: boolean; _msfSessionId?: string }): string {
    return `/console/${cb.display_id}`;
}
