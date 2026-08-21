import React, {
    useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { useMutation, useReactiveVar } from '@apollo/client/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    AlertTriangle, Copy, Crown, Eye, EyeOff, KeyRound, Link2, Plus, Power,
    RefreshCw, Search, ShieldCheck, ShieldOff, SquarePen, Trash2, UserCog,
    UserPlus, Users as UsersIcon, X,
} from 'lucide-react';

import {
    CREATE_INVITE_LINK,
    CREATE_OPERATOR_MUTATION,
    GET_INVITE_LINKS,
    GET_OPERATIONS_LIST,
    GET_OPERATORS,
    UPDATE_INVITE_LINK,
    UPDATE_OPERATOR_PASSWORD_MUTATION,
    UPDATE_OPERATOR_STATUS_MUTATION,
    UPDATE_OPERATOR_USERNAME_MUTATION,
} from '../lib/api';
import { useQueryCompat as useQuery } from '../lib/useQueryCompat';
import { usePageVisible } from '../lib/usePageVisible';
import { copyStringToClipboard } from '../lib/clipboard';
import { snackActions } from '../lib/snackbar';
import { meState } from '../lib/state';
import { toLocalTimeShort } from '../lib/time';
import { cn, getErrorMessage } from '../lib/utils';
import {
    Avatar, DataRow, LABEL, Meter, NoData, StatusWord, toneText, type Tone,
} from '../components/Instrument';
import { useAppStore } from '../store';
import type {
    AccountState, Assignment, InviteEntry, InviteLinkRecord, InviteState,
    OperatorRecord, RosterEntry,
} from '../types/users';

/**
 * User management — who can reach this server, and with what.
 *
 * WHAT THIS PAGE IS FOR, AND WHY IT LOOKS LIKE THIS
 *
 * The previous version was a wall of cards: eleven accounts as eleven tiles,
 * each carrying five action buttons, on a page whose own tab bar, stat strip
 * and filter bar were three separate slabs of chrome above them. Every card
 * repeated the same five verbs, so 55 buttons competed for attention while the
 * one question an admin opens this page with — *is anyone on this server
 * over-privileged, dormant, or locked out* — was nowhere on it. Cards also
 * scale wrong: the answer to "who signed in last" is a column you scan, not
 * eleven boxes you read.
 *
 * So the cards become one ranked list with an inspector beside it, and the
 * space they wasted goes to a posture panel that answers the question above
 * before the operator reads a single row. The structure is the one the Login
 * screen established and the Dashboard and C2 Profiles pages already run: a
 * page is a top rail / body / bottom rail, and every box inside it is an
 * instrument with a header strip saying what it is and how it is doing
 * (`components/Instrument.tsx`, DESIGN_LANGUAGE.md §5–§6). What does NOT
 * travel from the login screen is its texture — no `hud-*` palette, no dotted
 * leaders, no corner chrome, no 10px type. This is a surface an admin reads
 * carefully, not one they glance at for four seconds.
 *
 * The old page also carried four of §10's anti-patterns: faded white text on
 * black (`text-white/45…/95` throughout), a `text-cyan-300` field label,
 * `-500`-level saturated status colour, and `rounded-lg` cards. All four are
 * gone: Minerva palette only, semantic tones, and every state ships as a WORD
 * rather than a bare coloured dot.
 *
 * TWO CORRECTNESS FIXES CAME WITH THE REDESIGN
 *  - `admin` and `active` were two independent badges, so a disabled
 *    administrator read as ADMIN + INACTIVE and the reader had to combine
 *    them. They are now one mutually-exclusive state (`types/users.ts`).
 *  - Invite links were rendered as VALID / EXHAUSTED / EXPIRED. Mythic sets
 *    `valid = used < total` and has no expiry clock at all, so EXHAUSTED was
 *    unreachable and every spent link read "EXPIRED" — a word promising a
 *    deadline that does not exist. Two states now: OPEN and SPENT.
 *
 * PERMISSIONS. Account mutations are `mythic_admin`-only in Mythic; renaming
 * and password changes are additionally allowed on your own account. Controls
 * the signed-in operator cannot use are disabled *with the reason in their
 * title*, rather than left clickable to fail with a Hasura schema error. The
 * page also refuses to let an admin disable, demote or delete their own
 * account — that is the one mistake here with no undo path through the UI.
 *
 * @see docs/DESIGN_LANGUAGE.md §5 (panel kit), §6 (screen frame), §7 (motion)
 */

// ─────────────────────────────────────────────────────────────────────────────
// DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One word per account. `disabled` outranks `admin` because a disabled account
 * administers nothing — the privilege is dormant, and showing both at once
 * asks the reader to resolve a contradiction the server already resolved.
 */
function accountStateOf(o: OperatorRecord): AccountState {
    if (!o.active) return 'disabled';
    return o.admin ? 'admin' : 'operator';
}

const ACCOUNT_META: Record<AccountState, { label: string; tone: Tone; hex: string; blurb: string }> = {
    admin: {
        label: 'Admin', tone: 'warn',
        hex: '#fbbf24',
        blurb: 'Full server administration',
    },
    operator: {
        label: 'Operator', tone: 'live',
        hex: 'rgb(var(--color-accent))',
        blurb: 'Signs in and runs tasking',
    },
    disabled: {
        // `signal`, not `idle`: `idle` renders the word itself at 45% ink,
        // which measures under AA against the void. A disabled account is a
        // state someone chose deliberately and has to stay readable; it is
        // de-emphasised by its ring colour, not by being hard to read.
        label: 'Disabled', tone: 'signal',
        hex: 'rgb(var(--color-signal) / 0.28)',
        blurb: 'Cannot sign in',
    },
};

/**
 * Reading order for the split bar and the class rail alike.
 *
 * Operators first because they are the bulk of a roster, admins next because
 * they are what an audit is looking for, disabled last because it is the
 * absence of standing. The bar and the rail use the same order so the two read
 * as one statement rather than two lists of the same three words.
 */
const SPLIT_ORDER: AccountState[] = ['operator', 'admin', 'disabled'];

const INVITE_META: Record<InviteState, { label: string; tone: Tone }> = {
    open: { label: 'Open', tone: 'live' },
    spent: { label: 'Spent', tone: 'signal' },
};

function inviteStateOf(l: InviteLinkRecord): InviteState {
    return l.used < l.total ? 'open' : 'spent';
}

/** Mythic stamps timestamps without a zone; the "Z" is what makes them UTC. */
function toMs(stamp: string | null | undefined): number | null {
    if (!stamp) return null;
    const ms = new Date(stamp.endsWith('Z') ? stamp : `${stamp}Z`).getTime();
    return Number.isFinite(ms) ? ms : null;
}

/** "4m ago" / "12d ago" — a duration, and never a fake precision. */
function agoLabel(from: number | null, now: number): string {
    if (from == null) return 'Never';
    const s = Math.max(0, Math.round((now - from) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function plural(n: number, one: string, many = `${one}s`) {
    return n === 1 ? one : many;
}

/** A clock that exists only to re-age relative timestamps. */
function useTick(intervalMs: number, enabled = true) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        const id = setInterval(() => setTick(n => n + 1), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, enabled]);
    return tick;
}

/**
 * One clock for every relative timestamp on the page.
 *
 * Each `Ago` used to own a 60s interval, so a roster of 300 accounts ran 300
 * timers to produce a single identical re-render wave — plus one more per
 * `Freshness`, which renders twice. The provider ticks once; consumers still
 * re-render together, which is the point, but the page holds two timers instead
 * of three hundred.
 */
const TickContext = React.createContext(0);

function TickProvider({ children }: { children: React.ReactNode }) {
    const minute = useTick(60_000);
    return <TickContext.Provider value={minute}>{children}</TickContext.Provider>;
}

/**
 * Freshness, as a leaf that re-renders only itself. It says when data last
 * *arrived*, not how often the page is configured to ask — a promise about
 * polling stays cheerful while the feed is dead.
 */
const Freshness = React.memo(function Freshness({ lastUpdated }: { lastUpdated: number | null }) {
    // Its own 5s clock, deliberately: freshness is the one readout whose whole
    // job is to move, and it is a single text node with no subtree behind it.
    const now = useTick(5_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const label = useMemo(() => agoLabel(lastUpdated, Date.now()), [lastUpdated, now]);
    return <>{label}</>;
});

/** Relative age, re-aged by the page's shared minute tick. */
const Ago = React.memo(function Ago({ ms }: { ms: number | null }) {
    const minute = React.useContext(TickContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const label = useMemo(() => agoLabel(ms, Date.now()), [ms, minute]);
    return <>{label}</>;
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CONTROLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Segmented control. The active segment inverts (`bg-signal` / `text-void`)
 * rather than taking a colour wash — the same decision as the Dashboard's
 * perspective switch and the nav rail's active row. Inversion survives
 * greyscale and every colour-vision deficiency; a tint does not.
 */
function Segmented<K extends string>({ options, value, onChange, ariaLabel }: {
    options: { key: K; label: string; count?: number }[];
    value: K;
    onChange: (k: K) => void;
    ariaLabel: string;
}) {
    // `radiogroup`, not `tablist`: these pick one value out of a set and there
    // is no `aria-controls`-able panel behind them, so "tab 2 of 3" would be
    // describing furniture that does not exist.
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

/** Privilege as a chip: one fact, carried by a word as well as a tone. */
function RoleChip({ state, className }: { state: AccountState; className?: string }) {
    const meta = ACCOUNT_META[state];
    return (
        <span
            title={meta.blurb}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]',
                state === 'admin' ? 'border-amber-400/40 bg-amber-400/10 text-amber-400'
                    : state === 'operator' ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-signal/25 bg-signal/[0.04] text-signal',
                className,
            )}
        >
            {state === 'admin' ? <Crown size={10} strokeWidth={2} aria-hidden="true" />
                : state === 'operator' ? <ShieldCheck size={10} strokeWidth={2} aria-hidden="true" />
                    : <ShieldOff size={10} strokeWidth={2} aria-hidden="true" />}
            {meta.label}
        </span>
    );
}

/** The signed-in operator's own row, marked once and unmistakably. */
function SelfChip() {
    return (
        <span
            title="This is the account you are signed in as"
            className="inline-flex shrink-0 items-center rounded-sm border border-signal/40 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-signal"
        >
            You
        </span>
    );
}

/** A count that recedes at zero, so a non-zero one is what the eye lands on. */
function Count({ value, of, className }: { value: number; of?: number; className?: string }) {
    return (
        <span className={cn('tabular-nums', className)}>
            <span className={value > 0 ? 'font-bold text-signal' : 'text-signal opacity-45'}>{value}</span>
            {of != null && of > 0 && <span className="text-[11px] text-signal opacity-50">/{of}</span>}
        </span>
    );
}

const GHOST_BUTTON =
    'flex min-h-[34px] items-center justify-center gap-1.5 rounded-sm border border-signal/20 px-3 '
    + 'text-[11px] font-bold uppercase tracking-[0.1em] text-signal transition-colors '
    + 'hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal '
    + 'disabled:cursor-not-allowed disabled:border-signal/15 disabled:opacity-45 disabled:hover:border-signal/15';

const ICON_BUTTON =
    'flex h-8 w-8 items-center justify-center rounded-sm border border-signal/20 text-signal transition-colors '
    + 'hover:border-signal/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal';

// ─────────────────────────────────────────────────────────────────────────────
// DIALOG KIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The page's one dialog shell: header strip / body / footer strip, the same
 * three-part instrument every panel here is.
 *
 * `aria-modal="true"` is a promise that the rest of the page is unavailable
 * while this is open, so it ships with the trap that makes the promise true —
 * focus goes in, stays in under Tab, and returns to whatever opened the
 * dialog when it closes. Escape closes from anywhere, including after a click
 * on the dimmed page, which is why the listener is on `window`.
 */
function Dialog({ label, title, icon, tone = 'signal', onClose, children, footer }: {
    label: string;
    title: string;
    icon: React.ReactNode;
    tone?: Tone;
    onClose: () => void;
    children: React.ReactNode;
    footer: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        // Captured once: by cleanup time the ref is already null, so a cleanup
        // reading it could never tell where focus had been.
        const panel = panelRef.current;
        // The first field, if there is one — a dialog that opens with focus on
        // its own frame costs every keyboard user an extra Tab.
        const firstField = panel?.querySelector<HTMLElement>('input, select, textarea');
        (firstField ?? panel)?.focus();

        const onTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !panel) return;
            const stops = Array.from(panel.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            )).filter(el => el.offsetParent !== null || el === document.activeElement);
            if (stops.length === 0) { e.preventDefault(); panel.focus(); return; }
            const first = stops[0];
            const last = stops[stops.length - 1];
            const active = document.activeElement;
            if (!panel.contains(active)) { e.preventDefault(); first.focus(); return; }
            if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
            else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        };
        window.addEventListener('keydown', onTab);
        return () => {
            window.removeEventListener('keydown', onTab);
            opener?.focus?.();
        };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onClick={onClose}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-void/85 p-4 backdrop-blur-sm sm:p-6"
        >
            <motion.section
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                // Panels settle: quick in, long tail. No spring — a spring is a
                // physical metaphor and nothing here is an object being released.
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                transition={{ duration: 0.3, ease: [0.22, 0.68, 0, 1] }}
                onClick={e => e.stopPropagation()}
                className="flex max-h-[88vh] w-full max-w-[470px] flex-col overflow-hidden rounded-md border border-signal/25 bg-void font-mono text-signal focus:outline-none"
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-signal/15 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className={cn('shrink-0', toneText(tone))} aria-hidden="true">{icon}</span>
                        <span className={cn('shrink-0 text-signal opacity-70', LABEL)}>{label}</span>
                        <h2 className="min-w-0 truncate text-[16px] font-bold text-signal" title={title}>{title}</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close dialog" className={ICON_BUTTON}>
                        <X size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                </header>

                <div className="cyber-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

                <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-signal/15 px-5 py-3">
                    {footer}
                </footer>
            </motion.section>
        </motion.div>
    );
}

/**
 * A field is a visible label, a control, and — when it is wrong — a message
 * beside the control that named it. An error reachable only from a summary at
 * the top of a form is an error a screen reader user has to go hunting for,
 * so `aria-describedby` points the input at its own message.
 */
function Field({ label, hint, error, htmlFor, children }: {
    label: string;
    hint?: React.ReactNode;
    error?: string | null;
    htmlFor: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor={htmlFor} className={cn('text-signal', LABEL)}>{label}</label>
                {hint != null && <span className="text-[11px] text-signal opacity-60">{hint}</span>}
            </div>
            {children}
            {error && (
                <p id={`${htmlFor}-error`} className="mt-1.5 flex items-center gap-1.5 text-[12px] text-red-400">
                    <AlertTriangle size={11} strokeWidth={2} aria-hidden="true" />
                    {error}
                </p>
            )}
        </div>
    );
}

const INPUT_CLASS =
    'min-h-[38px] w-full rounded-sm border border-signal/20 bg-black/30 px-3 text-[13px] text-signal '
    + 'transition-colors placeholder:text-signal/45 hover:border-signal/40 '
    + 'focus:border-signal/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-signal '
    + 'disabled:cursor-not-allowed disabled:opacity-50';

function TextInput({ id, error, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; error?: string | null }) {
    return (
        <input
            {...rest}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(INPUT_CLASS, error && 'border-red-400/60')}
        />
    );
}

/**
 * A password field an operator can read back.
 *
 * Typing a credential blind into a confirm-twice form is how mismatches
 * happen; the toggle is the fix, and it is a real button with an accessible
 * name rather than an icon that only a mouse can find.
 */
function PasswordInput({ id, error, value, onChange, placeholder, autoComplete = 'new-password' }: {
    id: string;
    error?: string | null;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    /** Always a NEW password here — never `current-password`, which would let a
     *  manager fill the signed-in admin's own credential into another
     *  operator's account. */
    autoComplete?: string;
}) {
    const [shown, setShown] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={shown ? 'text' : 'password'}
                value={value}
                autoComplete={autoComplete}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(INPUT_CLASS, 'pr-10', error && 'border-red-400/60')}
            />
            <button
                type="button"
                onClick={() => setShown(s => !s)}
                aria-label={shown ? 'Hide password' : 'Show password'}
                aria-pressed={shown}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-signal transition-colors hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
            >
                {shown ? <EyeOff size={13} strokeWidth={2} aria-hidden="true" /> : <Eye size={13} strokeWidth={2} aria-hidden="true" />}
            </button>
        </div>
    );
}

function SubmitButton({ children, disabled, busy, destructive, onClick, type = 'submit' }: {
    children: React.ReactNode;
    disabled?: boolean;
    busy?: boolean;
    destructive?: boolean;
    onClick?: () => void;
    type?: 'submit' | 'button';
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || busy}
            className={cn(
                'inline-flex min-h-[36px] items-center justify-center gap-2 rounded-sm border px-5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                disabled || busy
                    ? 'cursor-not-allowed border-signal/20 text-signal opacity-50'
                    : destructive
                        ? 'border-red-400/60 text-red-400 hover:bg-red-400/10 hover:border-red-400'
                        : 'border-accent bg-accent text-void hover:bg-accent/90',
            )}
        >
            {busy && <RefreshCw size={12} strokeWidth={2} className="animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
}

function CancelButton({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={cn(GHOST_BUTTON, 'px-4')}>Cancel</button>
    );
}

/**
 * What a disabled primary action is waiting for.
 *
 * A greyed-out button with nothing beside it is a dead end — the reader has to
 * guess which field is at fault. This is §5's `[● Pick: X]` hint, in the
 * footer where the blocked control is.
 */
function BlockedHint({ children }: { children: React.ReactNode }) {
    return (
        <span className="mr-auto flex min-w-0 items-center gap-1.5 text-[12px] text-amber-400">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span className="truncate">{children}</span>
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS LEDGER + CLASS RAIL
// ─────────────────────────────────────────────────────────────────────────────

interface RosterStats {
    total: number;
    active: number;
    disabled: number;
    admin: number;
    operator: number;
    /** Accounts flagged admin at all, enabled or not. */
    adminAccounts: number;
    dormant: number;
    inviteOpen: number;
    seatsLeft: number;
}

/**
 * The roster as one bar, not a ring.
 *
 * A donut is the right chart for four-ish shares an operator studies; this
 * page's shares live in a strip 96px tall above a working list, and a ring in
 * that space would either shrink past reading or push the list off the fold.
 * A single stacked bar answers the same part-to-whole question in a form that
 * is naturally wide and short, and it puts the three classes in the same left
 * -to-right order as the rail beside it, so the two read as one statement.
 */
function SplitBar({ segments, total }: {
    segments: { label: string; value: number; hex: string }[];
    total: number;
}) {
    if (total <= 0) {
        return <div aria-hidden="true" className="mt-3 h-2.5 w-full rounded-sm bg-signal/10" />;
    }
    return (
        <div
            role="img"
            aria-label={segments.map(sg => `${sg.value} ${sg.label}`).join(', ')}
            className="mt-3 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-sm bg-signal/10"
        >
            {segments.filter(sg => sg.value > 0).map(sg => (
                <span
                    key={sg.label}
                    title={`${sg.label} · ${sg.value}`}
                    style={{ flexGrow: sg.value, backgroundColor: sg.hex }}
                    className="min-w-[3px]"
                />
            ))}
        </div>
    );
}

/** One reading on the ledger: what it is, the number, and what the number means. */
function LedgerCell({ label, value, sub, tone = 'signal', foot }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    tone?: Tone;
    foot?: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-5 py-4">
            <span className={cn('text-signal opacity-70', LABEL)}>{label}</span>
            <div className="flex items-baseline gap-2">
                <span className={cn('text-[32px] font-bold leading-none tabular-nums', toneText(tone))}>{value}</span>
                {sub != null && <span className="text-[13px] tabular-nums text-signal opacity-60">{sub}</span>}
            </div>
            {foot != null && <div className="min-w-0 truncate">{foot}</div>}
        </div>
    );
}

/**
 * Posture as a LEDGER STRIP rather than a hero panel.
 *
 * The other instrument pages open with a tall three-column panel because their
 * subject is a fleet whose distribution is the story. A roster's story is
 * shorter — how many can sign in, how many hold privilege, how many never
 * arrived — and it does not deserve a third of the viewport before the list
 * an admin came here to work. So this is a strip: four readings on one row,
 * hairline-divided, with the provenance line the panels carry underneath.
 */
const AccessLedger = React.memo(function AccessLedger({ stats, lastUpdated }: {
    stats: RosterStats;
    lastUpdated: number | null;
}) {
    const segments = SPLIT_ORDER.map(k => ({
        label: ACCOUNT_META[k].label, value: stats[k], hex: ACCOUNT_META[k].hex,
    }));
    const share = (n: number) => stats.total > 0 ? `${Math.round((n / stats.total) * 100)}%` : '0%';
    // One expression, read by both the number and the bar beneath it.
    const signInTone: Tone = stats.active === 0 ? 'fail'
        : stats.active === stats.total ? 'live' : 'signal';

    return (
        <section
            aria-label="Access posture"
            className="overflow-hidden rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm"
        >
            <div className="flex flex-col divide-y divide-signal/15 md:flex-row md:divide-x md:divide-y-0">
                {/* ── The roster, split by what each account may do. ── */}
                <div className="min-w-0 flex-[1.7] px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className={cn('text-signal opacity-70', LABEL)}>Privilege split</span>
                        <span className="text-[11px] tabular-nums text-signal opacity-60">
                            {stats.total} registered
                        </span>
                    </div>
                    <SplitBar segments={segments} total={stats.total} />
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                        {segments.map(sg => (
                            <span key={sg.label} className="flex items-center gap-2 text-[13px] text-signal">
                                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: sg.hex }} />
                                {sg.label}
                                <span className="font-bold tabular-nums">{sg.value}</span>
                                <span className="text-[11px] tabular-nums text-signal opacity-55">{share(sg.value)}</span>
                            </span>
                        ))}
                    </div>
                </div>

                <LedgerCell
                    label="Can sign in"
                    value={stats.active}
                    sub={`of ${stats.total}`}
                    tone={signInTone}
                    foot={<>
                        <Meter
                            className="mt-0.5"
                            value={stats.active}
                            max={stats.total}
                            height={6}
                            tone={signInTone}
                        />
                        <span className="mt-1.5 block text-[13px] text-signal opacity-60">
                            {stats.disabled > 0
                                ? `${stats.disabled} ${plural(stats.disabled, 'account')} locked out`
                                : 'nobody is locked out'}
                        </span>
                    </>}
                />

                <LedgerCell
                    label="Never arrived"
                    value={stats.dormant}
                    tone={stats.dormant > 0 ? 'warn' : 'signal'}
                    foot={<span className="text-[13px] text-signal opacity-60">
                        {stats.dormant > 0 ? 'issued, never signed in' : 'every account has been used'}
                    </span>}
                />

                <LedgerCell
                    label="Invites open"
                    value={stats.inviteOpen}
                    tone={stats.inviteOpen > 0 ? 'live' : 'signal'}
                    foot={<span className="text-[13px] text-signal opacity-60">
                        {stats.inviteOpen > 0
                            ? `${stats.seatsLeft} ${plural(stats.seatsLeft, 'seat')} unclaimed`
                            : 'no unclaimed access'}
                    </span>}
                />
            </div>

            {/* Provenance. No panel here is a bare box of figures with no source. */}
            <div className="flex items-center justify-between gap-3 border-t border-signal/15 px-5 py-2">
                <span className="min-w-0 truncate text-[11px] text-signal opacity-70">
                    Polled every 10s · updated <span className="font-medium opacity-100"><Freshness lastUpdated={lastUpdated} /></span>
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-signal">
                    {stats.adminAccounts} admin {plural(stats.adminAccounts, 'account')}
                </span>
            </div>
        </section>
    );
});

// ── Class rail ───────────────────────────────────────────────────────────────

/** What the board is showing. The rail owns it; there is no second filter. */
type ClassKey = 'all' | AccountState | 'invites';

const CLASS_META: Record<ClassKey, {
    label: string;
    noun: string;
    icon: React.ReactNode;
    /** Inverted block when selected — the loudest fact on the rail. */
    active: string;
    /** Resting ink. The class's own colour, never a greyed-out label. */
    ink: string;
}> = {
    all: {
        label: 'All accounts', noun: 'registered',
        icon: <UsersIcon size={16} strokeWidth={2} aria-hidden="true" />,
        active: 'bg-signal text-void', ink: 'text-signal',
    },
    admin: {
        label: 'Admins', noun: 'enabled',
        icon: <Crown size={16} strokeWidth={2} aria-hidden="true" />,
        // `text-black`, not `text-void`: amber is a fixed colour and the light
        // theme's void is near-white, which would vanish on it.
        active: 'bg-amber-400 text-black', ink: 'text-amber-400',
    },
    operator: {
        label: 'Operators', noun: 'enabled',
        icon: <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />,
        // Same reason as the amber tile above: `text-void` is near-white in the
        // light theme and measures 2.9:1 on this green. `text-black` is 6.3:1.
        active: 'bg-accent text-black', ink: 'text-accent',
    },
    disabled: {
        label: 'Disabled', noun: 'locked out',
        icon: <ShieldOff size={16} strokeWidth={2} aria-hidden="true" />,
        active: 'bg-signal text-void', ink: 'text-signal',
    },
    invites: {
        label: 'Invite links', noun: 'issued',
        icon: <Link2 size={16} strokeWidth={2} aria-hidden="true" />,
        active: 'bg-purple-400 text-black', ink: 'text-purple-400',
    },
};

const CLASS_ORDER: ClassKey[] = ['all', 'admin', 'operator', 'disabled', 'invites'];

/**
 * The access-class rail — this page's structural signature.
 *
 * DESIGN_LANGUAGE.md §5 keeps a vertical inverted selector for pages split
 * into four-to-six parallel classes, each carrying its own semantic colour and
 * its own body of data. A roster is exactly that: privilege IS the category,
 * and the four classes are the four answers to "what may this account do".
 * That is why the filters here are a rail rather than the segmented strip the
 * fleet pages use — those filter one kind of thing by state, this switches
 * between classes of standing, and the last entry switches entity kind
 * entirely (accounts → invite links), which a state filter has no business
 * doing.
 *
 * Selection inverts the whole tile. A tint is not enough: which class you are
 * looking at has to be certain before a single row below is read, and only
 * inversion survives greyscale and every colour-vision deficiency.
 */
const ClassRail = React.memo(function ClassRail({ value, counts, onChange }: {
    value: ClassKey;
    counts: Record<ClassKey, number>;
    onChange: (k: ClassKey) => void;
}) {
    const groupRef = useRef<HTMLDivElement>(null);

    /**
     * Roving focus, because `role="radiogroup"` is a promise.
     *
     * Declaring the role tells a screen-reader user "radio, 1 of 5" and that
     * the arrow keys move between them. Five independent tab stops with no key
     * handling makes both halves of that announcement false. One tab stop
     * enters the group, arrows move and select, Home/End jump.
     */
    const move = useCallback((delta: number) => {
        const idx = CLASS_ORDER.indexOf(value);
        const next = delta === 0
            ? (idx === 0 ? CLASS_ORDER.length - 1 : 0)
            : (idx + delta + CLASS_ORDER.length) % CLASS_ORDER.length;
        const target = CLASS_ORDER[next];
        onChange(target);
        groupRef.current?.querySelector<HTMLButtonElement>(`[data-class-key="${target}"]`)?.focus();
    }, [value, onChange]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown': case 'ArrowRight': e.preventDefault(); move(1); break;
            case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); move(-1); break;
            case 'Home': e.preventDefault(); onChange(CLASS_ORDER[0]); break;
            case 'End': e.preventDefault(); onChange(CLASS_ORDER[CLASS_ORDER.length - 1]); break;
            default: break;
        }
    }, [move, onChange]);

    return (
        <div className="flex shrink-0 flex-col border-b border-signal/15 min-[1700px]:w-[13.5rem] min-[1700px]:border-b-0 min-[1700px]:border-r">
            <span className={cn('hidden px-4 pb-2 pt-3 text-signal opacity-70 min-[1700px]:block', LABEL)}>Access class</span>
            <div
                ref={groupRef}
                role="radiogroup"
                aria-label="Access class"
                onKeyDown={onKeyDown}
                className="flex flex-wrap min-[1700px]:flex-col min-[1700px]:flex-nowrap"
            >
                {CLASS_ORDER.map(k => {
                    const meta = CLASS_META[k];
                    const active = k === value;
                    return (
                        <React.Fragment key={k}>
                            {/* Invite links are not a class of account, so the rail
                                admits it with a rule rather than pretending. */}
                            {k === 'invites' && (
                                <span aria-hidden="true" className="my-2 w-px shrink-0 bg-signal/15 min-[1700px]:mx-3 min-[1700px]:h-px min-[1700px]:w-auto" />
                            )}
                            <button
                                type="button"
                                role="radio"
                                data-class-key={k}
                                aria-checked={active}
                                tabIndex={active ? 0 : -1}
                                onClick={() => onChange(k)}
                                className={cn(
                                    'flex min-h-[48px] shrink-0 items-center gap-2.5 border border-transparent px-3.5 text-left transition-colors min-[1700px]:w-full',
                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                                    active
                                        ? cn(meta.active, 'font-bold')
                                        : cn(meta.ink, 'hover:bg-signal/[0.06]'),
                                )}
                            >
                                {meta.icon}
                                <span className="flex min-w-0 flex-col leading-tight">
                                    <span className="truncate text-[12px] font-bold uppercase tracking-[0.1em]">
                                        {meta.label}
                                    </span>
                                    <span className={cn('text-[11px] tabular-nums', active ? 'opacity-75' : 'opacity-70')}>
                                        {counts[k]} {meta.noun}
                                    </span>
                                </span>
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// ROSTER LIST
// ─────────────────────────────────────────────────────────────────────────────

/** Column widths live here so the header strip and every row cannot drift. */
const COL = {
    // Privilege never drops. The comment here used to say role outranks the
    // timestamps and then hid the chip below `sm` anyway, leaving an
    // `aria-hidden` coloured dot as the only signal — colour alone, which the
    // panel kit's own measurement (accent vs amber at ΔE 6.2 under protanopia)
    // rules out. It is now always rendered; the timestamps are what give way.
    role: 'w-24 shrink-0 flex',
    seen: 'w-[5.5rem] shrink-0 hidden lg:block text-right',
    ops: 'w-11 shrink-0 hidden 2xl:block text-right',
    state: 'w-24 shrink-0 pl-3',
};

function RosterListHeader() {
    return (
        <div className="flex shrink-0 items-center gap-3 border-b border-signal/15 px-4 py-2 pr-10">
            {/* Stands in for the row's status dot, so the header label sits over
                the names rather than 20px to their left. */}
            <span aria-hidden="true" className="h-2 w-2 shrink-0" />
            <span className={cn('min-w-0 flex-1 text-signal opacity-70', LABEL)}>Account</span>
            <span className={cn(COL.role, 'text-signal opacity-70', LABEL)}>Role</span>
            <span className={cn(COL.seen, 'text-signal opacity-70', LABEL)}>Last seen</span>
            <span
                title="Operations you can see — Hasura hides memberships in operations you are not in"
                className={cn(COL.ops, 'text-signal opacity-70', LABEL)}
            >
                Ops
            </span>
            <span className={cn(COL.state, 'text-signal opacity-70', LABEL)}>Sign-in</span>
        </div>
    );
}

/**
 * One account. The row is a single button and the enable/disable control is
 * its sibling pinned over the right edge — never a button inside a button,
 * which is both invalid markup and unreachable from a keyboard.
 *
 * `data-account-id` is how arrow-key navigation finds a row to focus: one data
 * attribute and a query on the scroller, rather than a ref-registering
 * callback prop that would be a fresh closure every render and defeat `memo`.
 */
const OperatorLine = React.memo(function OperatorLine({
    entry, selected, busy, canToggle, onSelect, onToggle,
}: {
    entry: RosterEntry;
    selected: boolean;
    busy: boolean;
    canToggle: boolean;
    onSelect: (id: number) => void;
    onToggle: (entry: RosterEntry) => void;
}) {
    const enabled = entry.state !== 'disabled';

    return (
        <div className="relative">
            <button
                type="button"
                data-account-id={entry.id}
                onClick={() => onSelect(entry.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                    'flex w-full items-center gap-3 border-b border-signal/10 px-4 py-2.5 pr-10 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                    selected ? 'bg-signal/[0.07]' : 'hover:bg-signal/[0.035]',
                )}
            >
                {/* Selection is a shape as well as a wash: the bar is visible
                    when the tint is not, e.g. at low contrast settings. */}
                <span
                    aria-hidden="true"
                    className={cn(
                        'absolute inset-y-0 left-0 w-[2px] transition-opacity',
                        selected ? 'bg-accent opacity-100' : 'opacity-0',
                    )}
                />
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden="true">
                    <span className={cn(
                        'h-2 w-2 rounded-full',
                        entry.state === 'admin' ? 'bg-amber-400'
                            : entry.state === 'operator' ? 'bg-accent' : 'bg-signal/25',
                    )} />
                </span>

                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    {/* Real casing: a handle is recognised by its shape. */}
                    <span className="truncate text-[13px] font-medium text-signal" title={entry.username}>
                        {entry.username}
                    </span>
                    {entry.isSelf && <SelfChip />}
                    <span className="shrink-0 text-[11px] tabular-nums text-signal opacity-55">
                        #{entry.id}
                    </span>
                    {entry.record.email && (
                        <span className="hidden min-w-0 truncate text-[11px] text-signal opacity-60 sm:inline" title={entry.record.email}>
                            {entry.record.email}
                        </span>
                    )}
                </span>

                <span className={cn(COL.role, 'items-center')}><RoleChip state={entry.state} /></span>
                <span className={cn(COL.seen, 'text-[13px]')}>
                    <span className={entry.lastLoginMs == null ? 'text-signal opacity-45' : 'tabular-nums text-signal'}>
                        <Ago ms={entry.lastLoginMs} />
                    </span>
                </span>
                <span className={cn(COL.ops, 'text-[13px]')}><Count value={entry.assignments.length} /></span>
                <span className={COL.state}>
                    <StatusWord tone={busy ? 'warn' : enabled ? 'live' : 'signal'}>
                        {busy ? 'Working' : enabled ? 'Enabled' : 'Disabled'}
                    </StatusWord>
                </span>
            </button>

            <button
                type="button"
                onClick={() => onToggle(entry)}
                disabled={busy || !canToggle}
                title={!canToggle
                    ? (entry.isSelf
                        ? 'You cannot disable the account you are signed in as'
                        : 'Only a Mythic admin can enable or disable an account')
                    : busy ? `Working on ${entry.username}`
                        : enabled ? `Disable ${entry.username}` : `Enable ${entry.username}`}
                aria-label={busy
                    ? `${entry.username}, working`
                    : enabled ? `Disable ${entry.username}` : `Enable ${entry.username}`}
                className={cn(
                    'absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                    busy ? 'border-amber-400/40 text-amber-400'
                        : !canToggle ? 'cursor-not-allowed border-signal/15 text-signal opacity-40'
                            : enabled ? 'border-signal/20 text-signal hover:border-red-400/60 hover:text-red-400'
                                : 'border-signal/20 text-signal hover:border-accent hover:text-accent',
                )}
            >
                {busy
                    ? <RefreshCw size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                    : <Power size={13} strokeWidth={2} aria-hidden="true" />}
            </button>
        </div>
    );
});

/** Loading shown as the instrument it will become, not as a spinner. */
function ListSkeleton() {
    return (
        <div aria-hidden="true" className="divide-y divide-signal/10">
            {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-signal/15" />
                    <span className="h-3 flex-1 animate-pulse rounded-sm bg-signal/10"
                        style={{ maxWidth: `${34 + ((i * 17) % 32)}%`, animationDelay: `${i * 90}ms` }} />
                    <span className="hidden h-3 w-16 animate-pulse rounded-sm bg-signal/[0.07] md:block"
                        style={{ animationDelay: `${i * 90}ms` }} />
                    <span className="h-3 w-[6rem] animate-pulse rounded-sm bg-signal/[0.07]"
                        style={{ animationDelay: `${i * 90}ms` }} />
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVITE LIST
// ─────────────────────────────────────────────────────────────────────────────

const ICOL = {
    assign: 'w-[8rem] shrink-0 hidden lg:block',
    usage: 'w-16 shrink-0 hidden md:block text-right',
    state: 'w-24 shrink-0 pl-3',
};

function InviteListHeader() {
    return (
        <div className="flex shrink-0 items-center gap-3 border-b border-signal/15 px-4 py-2 pr-10">
            <span aria-hidden="true" className="h-2 w-2 shrink-0" />
            <span className={cn('min-w-0 flex-1 text-signal opacity-70', LABEL)}>Invite code</span>
            <span className={cn(ICOL.assign, 'text-signal opacity-70', LABEL)}>Assignment</span>
            <span className={cn(ICOL.usage, 'text-signal opacity-70', LABEL)}>Used</span>
            <span className={cn(ICOL.state, 'text-signal opacity-70', LABEL)}>State</span>
        </div>
    );
}

const InviteLine = React.memo(function InviteLine({ entry, selected, onSelect, onCopy }: {
    entry: InviteEntry;
    selected: boolean;
    onSelect: (code: string) => void;
    onCopy: (entry: InviteEntry) => void;
}) {
    const l = entry.record;
    const meta = INVITE_META[entry.state];

    return (
        <div className="relative">
            <button
                type="button"
                data-invite-code={entry.code}
                onClick={() => onSelect(entry.code)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                    'flex w-full items-center gap-3 border-b border-signal/10 px-4 py-2.5 pr-10 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal',
                    selected ? 'bg-signal/[0.07]' : 'hover:bg-signal/[0.035]',
                )}
            >
                <span
                    aria-hidden="true"
                    className={cn('absolute inset-y-0 left-0 w-[2px] transition-opacity', selected ? 'bg-accent opacity-100' : 'opacity-0')}
                />
                <span aria-hidden="true" className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    entry.state === 'open' ? 'bg-accent' : 'bg-signal/25',
                )} />

                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium text-signal" title={entry.code}>{entry.code}</span>
                    {l.name && (
                        <span className="hidden min-w-0 truncate text-[11px] text-signal opacity-60 sm:inline" title={l.name}>
                            {l.name}
                        </span>
                    )}
                </span>

                <span className={cn(ICOL.assign, 'truncate text-[13px] text-signal')}>
                    {l.operation_id > 0
                        ? <span className="capitalize">{l.operation_role || 'member'}</span>
                        : <span className="opacity-45">None</span>}
                </span>
                <span className={cn(ICOL.usage, 'text-[13px]')}><Count value={l.used} of={l.total} /></span>
                <span className={ICOL.state}><StatusWord tone={meta.tone}>{meta.label}</StatusWord></span>
            </button>

            <button
                type="button"
                onClick={() => onCopy(entry)}
                disabled={entry.state !== 'open'}
                title={entry.state === 'open' ? `Copy the link for ${entry.code}` : 'Every seat on this link is used'}
                aria-label={`Copy invite link ${entry.code}`}
                className={cn(
                    'absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                    entry.state === 'open'
                        ? 'border-signal/20 text-signal hover:border-accent hover:text-accent'
                        : 'cursor-not-allowed border-signal/15 text-signal opacity-40',
                )}
            >
                <Copy size={13} strokeWidth={2} aria-hidden="true" />
            </button>
        </div>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The inspector shell — identity first.
 *
 * The fleet pages open a detail panel with a `LABEL`-sized strip, because a
 * channel is a machine and its name is a string. The subject here is a person
 * (or a link handed to one), and the first thing an admin has to be sure of is
 * *which* one — so this panel opens with a monogram block and a 16px name
 * rather than a caps-and-tracking header. Everything under it is the same
 * hairline-strip construction as the rest of the console.
 */
function InspectorShell({ mark, title, chips, status, statusTone, footerLeft, footerRight, ariaLabel, children }: {
    mark: React.ReactNode;
    title: string;
    chips?: React.ReactNode;
    status: string;
    statusTone: Tone;
    footerLeft?: React.ReactNode;
    footerRight?: React.ReactNode;
    ariaLabel: string;
    children: React.ReactNode;
}) {
    return (
        <section
            aria-label={ariaLabel}
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm"
        >
            <header className="flex shrink-0 items-start gap-3 border-b border-signal/15 px-5 py-4">
                {mark}
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[16px] font-bold leading-tight text-signal" title={title}>{title}</h2>
                    {chips != null && <div className="mt-2 flex flex-wrap items-center gap-2">{chips}</div>}
                </div>
                <StatusWord tone={statusTone} dot className="mt-0.5">{status}</StatusWord>
            </header>

            <div className="cyber-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-5">{children}</div>

            {(footerLeft != null || footerRight != null) && (
                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-signal/15 px-5 py-2.5">
                    <span className="min-w-0 truncate text-[11px] text-signal opacity-70">{footerLeft}</span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-signal">{footerRight}</span>
                </footer>
            )}
        </section>
    );
}

/** The empty inspector, as a panel rather than a hole in the layout. */
function InspectorEmpty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-signal/20 bg-void/40 px-6 text-center">
            <span className="text-signal opacity-40" aria-hidden="true">{icon}</span>
            <span className="text-[13px] text-signal opacity-55">{children}</span>
        </section>
    );
}

/**
 * A stated fact: label above, value below.
 *
 * The list pages put label left / value right on a hairline, which is the
 * right form for forty rows of the same shape. Five facts about one person is
 * not that shape — stacked pairs in two columns read as a record card, fit the
 * narrower panel this page gives the inspector, and stop a long email from
 * colliding with its own label.
 */
function Fact({ label, value, tone = 'signal', title, wide }: {
    label: string;
    value: React.ReactNode;
    tone?: Tone;
    title?: string;
    wide?: boolean;
}) {
    return (
        <div className={cn('min-w-0', wide && 'col-span-2')}>
            <dt className={cn('text-signal opacity-70', LABEL)}>{label}</dt>
            <dd className={cn('mt-1 truncate text-[13px] font-medium', toneText(tone))} title={title}>{value}</dd>
        </div>
    );
}

/** A section inside the inspector: rule, label, content. */
function Block({ label, meta, children, className }: {
    label: string;
    meta?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('mt-5 border-t border-signal/15 pt-4 first:mt-0 first:border-0 first:pt-0', className)}>
            <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-signal opacity-70', LABEL)}>{label}</span>
                {meta != null && <span className="text-[11px] tabular-nums text-signal opacity-60">{meta}</span>}
            </div>
            <div className="mt-2.5">{children}</div>
        </div>
    );
}

const OperatorInspector = React.memo(function OperatorInspector({
    entry, busy, viewUtc, canAdminister, lastEnabledAdmin, onToggleActive, onToggleAdmin, onRename, onPassword, onDelete,
}: {
    entry: RosterEntry | null;
    busy: boolean;
    viewUtc: boolean;
    canAdminister: boolean;
    /** True when disabling or demoting this account would leave no admin. */
    lastEnabledAdmin: boolean;
    onToggleActive: (e: RosterEntry) => void;
    onToggleAdmin: (e: RosterEntry) => void;
    onRename: (e: RosterEntry) => void;
    onPassword: (e: RosterEntry) => void;
    onDelete: (e: RosterEntry) => void;
}) {
    if (!entry) {
        return (
            <InspectorEmpty icon={<UserCog size={26} strokeWidth={1.6} />}>
                Pick an account to see its standing, its operations, and what can be done to it.
            </InspectorEmpty>
        );
    }

    const enabled = entry.state !== 'disabled';
    const isAdmin = entry.record.admin;
    // Every destructive verb is blocked on your own account: it is the one
    // mistake on this page with no way back through the UI.
    const selfBlocked = entry.isSelf;
    const canEditIdentity = canAdminister || entry.isSelf;

    const guardTitle = (verb: string) => selfBlocked
        ? `You cannot ${verb} the account you are signed in as`
        : canAdminister ? undefined : `Only a Mythic admin can ${verb} an account`;

    // Rendered, not just put in a `title` — see the note on the Actions block.
    const blockedReason = selfBlocked
        ? 'This is the account you are signed in as. Disabling, demoting or deleting it is blocked so you cannot lock yourself out.'
        : !canAdminister
            ? 'Only a Mythic admin can enable, disable, promote or delete an account.'
            : null;

    return (
        <InspectorShell
            ariaLabel={`Account ${entry.username}`}
            mark={<Avatar name={entry.username} size={40} />}
            title={entry.username}
            status={busy ? 'Working' : enabled ? 'Enabled' : 'Disabled'}
            statusTone={busy ? 'warn' : enabled ? 'live' : 'signal'}
            chips={<>
                <RoleChip state={entry.state} />
                {entry.isSelf && <SelfChip />}
                <span className="text-[11px] tabular-nums text-signal opacity-60">id {entry.id}</span>
            </>}
            footerLeft={<>Created {entry.createdMs != null ? toLocalTimeShort(entry.record.creation_time, viewUtc) : 'unknown'}</>}
            footerRight={<>{entry.assignments.length} {plural(entry.assignments.length, 'operation')}</>}
        >
            {/* Keyed on the account so switching selection cross-fades rather
                than snapping — §7's no-hard-cut rule at inline scale, so 200ms. */}
            <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                className="flex min-h-0 flex-1 flex-col"
            >
                {/* Outside the `Block` run: `Block` resets its own top rule with
                    `first:`, and a banner occupying that slot would push the
                    first real section into a rule it should not have. */}
                {lastEnabledAdmin && (
                    <div role="status" className="mb-5 flex items-start gap-2 rounded-sm border border-amber-400/40 bg-amber-400/[0.06] px-3 py-2">
                        <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span className="text-[13px] leading-relaxed text-amber-400">
                            The only enabled admin. Disabling or demoting this account leaves nobody able to
                            administer Mythic.
                        </span>
                    </div>
                )}

                <Block label="Record" className="mt-0 border-0 pt-0">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                        <Fact
                            label="Privilege"
                            value={isAdmin ? 'Administrator' : 'Standard'}
                            tone={isAdmin ? 'warn' : 'signal'}
                        />
                        <Fact
                            label="Sign-in"
                            value={enabled ? 'Enabled' : 'Disabled'}
                            tone={enabled ? 'live' : 'signal'}
                        />
                        <Fact
                            label="Last seen"
                            value={<Ago ms={entry.lastLoginMs} />}
                            tone={entry.lastLoginMs == null ? 'warn' : 'signal'}
                            title={entry.lastLoginMs != null ? toLocalTimeShort(entry.record.last_login, viewUtc) : 'Never signed in'}
                        />
                        <Fact
                            label="Registered"
                            value={entry.createdMs != null ? <Ago ms={entry.createdMs} /> : 'unknown'}
                            title={entry.createdMs != null ? toLocalTimeShort(entry.record.creation_time, viewUtc) : undefined}
                        />
                        <Fact
                            wide
                            label="Email"
                            value={entry.record.email || 'Not set'}
                            title={entry.record.email || undefined}
                        />
                    </dl>
                </Block>

                {/* An account matters because of what it can reach. */}
                <Block
                    label="Operations"
                    meta={entry.assignments.length > 0 ? entry.assignments.length : undefined}
                >
                    {entry.assignments.length === 0 ? (
                        <span className="text-[13px] text-signal opacity-55">
                            Not a member of any operation you can see
                        </span>
                    ) : (
                        <ul className="space-y-1">
                            {entry.assignments.map(a => (
                                <li
                                    key={a.id}
                                    className="flex items-center justify-between gap-3 rounded-sm border border-signal/15 bg-signal/[0.03] px-2.5 py-1.5"
                                >
                                    <span className="min-w-0 truncate text-[13px] text-signal" title={a.name}>
                                        {a.name}
                                        {a.complete && (
                                            <span className="ml-2 text-[11px] text-signal opacity-55">complete</span>
                                        )}
                                    </span>
                                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-signal opacity-75">
                                        {a.role}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Block>

                {/* Controls are pinned to the bottom so they never move as the
                    record above them grows or shrinks. */}
                <div className="mt-auto pt-5">
                    <Block label="Actions">
                        {blockedReason && (
                            <p className="mb-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-400">
                                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                {blockedReason}
                            </p>
                        )}
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => onToggleActive(entry)}
                                disabled={busy || selfBlocked || !canAdminister}
                                title={guardTitle(enabled ? 'disable' : 'enable')}
                                className={cn(
                                    'flex min-h-[38px] w-full items-center justify-center gap-2 rounded-sm border text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                    busy || selfBlocked || !canAdminister
                                        ? 'cursor-not-allowed border-signal/20 text-signal opacity-50'
                                        : enabled
                                            ? 'border-red-400/50 text-red-400 hover:border-red-400 hover:bg-red-400/10'
                                            : 'border-accent bg-accent text-void hover:bg-accent/90',
                                )}
                            >
                                {busy
                                    ? <><RefreshCw size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />Working</>
                                    : <><Power size={13} strokeWidth={2} aria-hidden="true" />{enabled ? 'Disable sign-in' : 'Enable sign-in'}</>}
                            </button>

                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => onRename(entry)}
                                    disabled={!canEditIdentity}
                                    title={canEditIdentity ? undefined : 'You can only rename your own account'}
                                    className={GHOST_BUTTON}
                                >
                                    <SquarePen size={12} strokeWidth={2} aria-hidden="true" />Rename
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onPassword(entry)}
                                    disabled={!canEditIdentity}
                                    title={canEditIdentity ? undefined : 'You can only change your own credentials'}
                                    className={GHOST_BUTTON}
                                >
                                    <KeyRound size={12} strokeWidth={2} aria-hidden="true" />Password
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onToggleAdmin(entry)}
                                    disabled={busy || selfBlocked || !canAdminister}
                                    title={guardTitle(isAdmin ? 'demote' : 'promote')}
                                    className={cn(
                                        GHOST_BUTTON,
                                        !(busy || selfBlocked || !canAdminister) && !isAdmin
                                            && 'hover:border-amber-400/60 hover:text-amber-400',
                                    )}
                                >
                                    {isAdmin
                                        ? <><ShieldOff size={12} strokeWidth={2} aria-hidden="true" />Demote</>
                                        : <><Crown size={12} strokeWidth={2} aria-hidden="true" />Promote</>}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => onDelete(entry)}
                                disabled={busy || selfBlocked || !canAdminister}
                                title={guardTitle('delete')}
                                className={cn(
                                    'flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-sm border text-[11px] font-bold uppercase tracking-[0.1em] transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                    busy || selfBlocked || !canAdminister
                                        ? 'cursor-not-allowed border-signal/15 text-signal opacity-45'
                                        : 'border-signal/20 text-signal hover:border-red-400/60 hover:text-red-400',
                                )}
                            >
                                <Trash2 size={12} strokeWidth={2} aria-hidden="true" />Delete account
                            </button>
                        </div>
                    </Block>
                </div>
            </motion.div>
        </InspectorShell>
    );
});

const InviteInspector = React.memo(function InviteInspector({
    entry, viewUtc, operationNames, onCopy, onEdit,
}: {
    entry: InviteEntry | null;
    viewUtc: boolean;
    /** id → name for every operation the caller can see, complete ones too. */
    operationNames: ReadonlyMap<number, string>;
    onCopy: (e: InviteEntry) => void;
    onEdit: (e: InviteEntry) => void;
}) {
    if (!entry) {
        return (
            <InspectorEmpty icon={<Link2 size={26} strokeWidth={1.6} />}>
                Pick an invite to see what it grants and how much of it is left.
            </InspectorEmpty>
        );
    }

    const l = entry.record;
    const meta = INVITE_META[entry.state];
    const created = toMs(l.created_at);
    const operation = l.operation_id > 0
        ? operationNames.get(l.operation_id) ?? `Operation ${l.operation_id}`
        : null;

    return (
        <InspectorShell
            ariaLabel={`Invite ${l.code}`}
            mark={
                <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-purple-400/40 bg-purple-400/10 text-purple-400"
                >
                    <Link2 size={18} strokeWidth={2} />
                </span>
            }
            title={l.code}
            status={meta.label}
            statusTone={meta.tone}
            chips={<>
                <span className="min-w-0 truncate text-[13px] text-signal">
                    {l.name || 'No description'}
                </span>
            </>}
            footerLeft={<>Issued by <span className="font-medium opacity-100">{l.operator || 'unknown'}</span></>}
            footerRight={<>{entry.remaining} {plural(entry.remaining, 'seat')} left</>}
        >
            <motion.div
                key={l.code}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                className="flex min-h-0 flex-1 flex-col"
            >
                <Block label="Seats" meta={`${l.used} of ${l.total} used`}>
                    <Meter value={l.used} max={l.total} tone={entry.state === 'open' ? 'live' : 'idle'} />
                    <p className="mt-2 text-[13px] text-signal opacity-60">
                        {entry.state === 'open'
                            ? `${entry.remaining} more ${plural(entry.remaining, 'account')} can register with this code.`
                            : 'Every seat is claimed; this code no longer registers anyone.'}
                    </p>
                </Block>

                <Block label="Grant">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                        <Fact
                            label="Operation"
                            value={operation ?? 'None'}
                            title={operation ? `id ${l.operation_id}` : undefined}
                        />
                        <Fact
                            label="Role on join"
                            value={operation ? (l.operation_role || 'member') : '—'}
                        />
                        <Fact
                            wide
                            label="Issued"
                            value={created != null ? <Ago ms={created} /> : 'unknown'}
                            title={created != null ? toLocalTimeShort(l.created_at, viewUtc) : undefined}
                        />
                    </dl>
                </Block>

                <Block label="Link">
                    <p className="break-all rounded-sm border border-signal/20 bg-black/40 px-3 py-2 text-[12px] leading-relaxed text-signal">
                        {l.link}
                    </p>
                </Block>

                <div className="mt-auto pt-5">
                    <Block label="Actions">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => onCopy(entry)}
                                disabled={entry.state !== 'open'}
                                title={entry.state === 'open' ? undefined : 'Every seat on this link is used'}
                                className={cn(GHOST_BUTTON, entry.state === 'open' && 'hover:border-accent hover:text-accent')}
                            >
                                <Copy size={12} strokeWidth={2} aria-hidden="true" />Copy link
                            </button>
                            <button type="button" onClick={() => onEdit(entry)} className={GHOST_BUTTON}>
                                <SquarePen size={12} strokeWidth={2} aria-hidden="true" />Edit seats
                            </button>
                        </div>
                    </Block>
                </div>
            </motion.div>
        </InspectorShell>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// DIALOGS
// ─────────────────────────────────────────────────────────────────────────────

const MIN_PASSWORD = 12;

function CreateAccountDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const uid = useId();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [email, setEmail] = useState('');
    const [createOp, { loading }] = useMutation<any>(CREATE_OPERATOR_MUTATION);

    const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
    const mismatch = confirm.length > 0 && confirm !== password;
    const ready = username.trim().length > 0 && password.length >= MIN_PASSWORD && confirm === password;
    const blocked = !username.trim() ? 'Name the account'
        : password.length < MIN_PASSWORD ? `Password needs ${MIN_PASSWORD} characters`
            : confirm !== password ? 'Confirm the password'
                : null;

    // The event is optional so the same handler serves the form's Enter key and
    // the footer button, which lives outside the form.
    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!ready) return;
        try {
            const { data } = await createOp({
                variables: { username: username.trim(), password, email: email.trim() || '', bot: false },
            });
            // Mythic refuses inside a 200 OK, with the reason in `error`. Unread,
            // a refused create is indistinguishable from a successful one.
            if (data?.createOperator?.status === 'success') {
                snackActions.success(`Account ${username.trim()} created`);
                onDone();
            } else {
                snackActions.error(data?.createOperator?.error || 'Mythic refused to create the account');
            }
        } catch (err) {
            snackActions.error(`Could not create the account — ${getErrorMessage(err)}`);
        }
    };

    return (
        <Dialog
            label="New"
            title="Operator account"
            icon={<UserPlus size={14} strokeWidth={2} />}
            onClose={onClose}
            footer={<>
                {blocked && <BlockedHint>{blocked}</BlockedHint>}
                <CancelButton onClick={onClose} />
                <SubmitButton onClick={submit} type="button" disabled={!ready} busy={loading}>Create</SubmitButton>
            </>}
        >
            <form onSubmit={submit} className="space-y-4">
                <Field label="Username" htmlFor={`${uid}-user`} hint="Shown on every task this account runs">
                    <TextInput
                        id={`${uid}-user`} type="text" value={username} autoComplete="off"
                        onChange={e => setUsername(e.target.value)} placeholder="operator handle"
                    />
                </Field>
                <Field
                    label="Password" htmlFor={`${uid}-pass`}
                    hint={`${MIN_PASSWORD} characters minimum`}
                    error={tooShort ? `Use at least ${MIN_PASSWORD} characters` : null}
                >
                    <PasswordInput id={`${uid}-pass`} value={password} onChange={setPassword}
                        error={tooShort ? 'short' : null} />
                </Field>
                <Field label="Confirm password" htmlFor={`${uid}-confirm`} error={mismatch ? 'The two passwords do not match' : null}>
                    <PasswordInput id={`${uid}-confirm`} value={confirm} onChange={setConfirm}
                        error={mismatch ? 'mismatch' : null} />
                </Field>
                <Field label="Email" htmlFor={`${uid}-email`} hint="Optional">
                    <TextInput id={`${uid}-email`} type="email" value={email} autoComplete="off"
                        onChange={e => setEmail(e.target.value)} placeholder="operator@domain" />
                </Field>
                {/* A submit input the browser can trigger on Enter without the
                    footer button living inside the form. */}
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
        </Dialog>
    );
}

function RenameDialog({ entry, onClose, onDone }: { entry: RosterEntry; onClose: () => void; onDone: () => void }) {
    const uid = useId();
    const [username, setUsername] = useState(entry.username);
    const [rename, { loading }] = useMutation<any>(UPDATE_OPERATOR_USERNAME_MUTATION);
    const changed = username.trim().length > 0 && username.trim() !== entry.username;

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!changed) return;
        try {
            await rename({ variables: { id: entry.id, username: username.trim() } });
            snackActions.success(`Renamed to ${username.trim()}`);
            onDone();
        } catch (err) {
            // Hasura answers a denied update with "field
            // 'update_operator_by_pk' not found in type: 'mutation_root'" —
            // a true sentence about a schema and a useless one about
            // this operator's permissions.
            const raw = getErrorMessage(err);
            snackActions.error(/not found in type|permission/i.test(raw)
                ? 'Only a Mythic admin can rename another account.'
                : `Could not rename the account — ${raw}`);
        }
    };

    return (
        <Dialog
            label="Rename"
            title={entry.username}
            icon={<SquarePen size={14} strokeWidth={2} />}
            onClose={onClose}
            footer={<>
                {!changed && <BlockedHint>Type a different handle</BlockedHint>}
                <CancelButton onClick={onClose} />
                <SubmitButton type="button" onClick={submit} disabled={!changed} busy={loading}>Save</SubmitButton>
            </>}
        >
            <form onSubmit={submit} className="space-y-4">
                <p className="text-[13px] leading-relaxed text-signal">
                    Tasking already attributed to this account keeps pointing at it — the handle changes, the
                    history does not.
                </p>
                <Field label="Username" htmlFor={`${uid}-user`} hint={`id ${entry.id}`}>
                    <TextInput id={`${uid}-user`} type="text" value={username} autoComplete="off"
                        onChange={e => setUsername(e.target.value)} />
                </Field>
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
        </Dialog>
    );
}

function CredentialsDialog({ entry, onClose, onDone }: { entry: RosterEntry; onClose: () => void; onDone: () => void }) {
    const uid = useId();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [email, setEmail] = useState(entry.record.email || '');
    const [update, { loading }] = useMutation<any>(UPDATE_OPERATOR_PASSWORD_MUTATION);

    const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
    const mismatch = confirm.length > 0 && confirm !== password;
    const ready = password.length >= MIN_PASSWORD && confirm === password;
    const blocked = password.length < MIN_PASSWORD ? `Password needs ${MIN_PASSWORD} characters`
        : confirm !== password ? 'Confirm the password'
            : null;

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!ready) return;
        try {
            const { data } = await update({
                variables: { user_id: entry.id, new_password: password, email: email.trim() },
            });
            const out = data?.updatePasswordAndEmail;
            if (out?.status === 'error') {
                const raw = out.error || '';
                if (/duplicate key|operator_email_key|unique constraint/i.test(raw)) {
                    // The password write commits before the email write, so this
                    // failure is about the email alone — and the new password is
                    // already live. Saying "failed" here would send the operator
                    // back to retry with a credential that no longer works.
                    snackActions.warning(
                        `Password for ${entry.username} was changed, but the email could not be saved `
                        + '(server rejects a blank email on a unique column). Set a unique email, or apply '
                        + 'scripts/mythic_change.sh Patch 10.',
                    );
                    onDone();
                    return;
                }
                snackActions.error(raw || 'Mythic refused the credential change');
                return;
            }
            snackActions.success(`Credentials updated for ${entry.username}`);
            onDone();
        } catch (err) {
            snackActions.error(`Could not update credentials — ${getErrorMessage(err)}`);
        }
    };

    return (
        <Dialog
            label="Credentials"
            title={entry.username}
            icon={<KeyRound size={14} strokeWidth={2} />}
            tone="warn"
            onClose={onClose}
            footer={<>
                {blocked && <BlockedHint>{blocked}</BlockedHint>}
                <CancelButton onClick={onClose} />
                <SubmitButton type="button" onClick={submit} disabled={!ready} busy={loading}>Update</SubmitButton>
            </>}
        >
            <form onSubmit={submit} className="space-y-4">
                <p className="text-[13px] leading-relaxed text-signal">
                    Existing sessions for this account are not signed out. Disable the account first if the
                    credential is believed burned.
                </p>
                <Field label="New password" htmlFor={`${uid}-pass`} hint={`${MIN_PASSWORD} characters minimum`}
                    error={tooShort ? `Use at least ${MIN_PASSWORD} characters` : null}>
                    <PasswordInput id={`${uid}-pass`} value={password} onChange={setPassword}
                        error={tooShort ? 'short' : null} />
                </Field>
                <Field label="Confirm password" htmlFor={`${uid}-confirm`} error={mismatch ? 'The two passwords do not match' : null}>
                    <PasswordInput id={`${uid}-confirm`} value={confirm} onChange={setConfirm}
                        error={mismatch ? 'mismatch' : null} />
                </Field>
                <Field label="Email" htmlFor={`${uid}-email`} hint="Optional">
                    <TextInput id={`${uid}-email`} type="email" value={email} autoComplete="off"
                        onChange={e => setEmail(e.target.value)} placeholder="operator@domain" />
                </Field>
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
        </Dialog>
    );
}

function DeleteAccountDialog({ entry, busy, onClose, onConfirm }: {
    entry: RosterEntry;
    busy: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    return (
        <Dialog
            label="Delete"
            title={entry.username}
            icon={<Trash2 size={14} strokeWidth={2} />}
            tone="fail"
            onClose={onClose}
            footer={<>
                <CancelButton onClick={onClose} />
                <SubmitButton type="button" destructive onClick={onConfirm} busy={busy}>Delete account</SubmitButton>
            </>}
        >
            <div className="space-y-4">
                <div role="alert" className="flex items-start gap-2 rounded-sm border border-red-400/40 bg-red-400/[0.06] px-3 py-2.5">
                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
                    <span className="text-[13px] leading-relaxed text-red-400">
                        This cannot be undone from the interface. Mythic marks the account deleted and it stops
                        appearing on this roster.
                    </span>
                </div>
                <div>
                    <DataRow label="Account" state={entry.username} />
                    <DataRow label="Privilege" state={entry.record.admin ? 'Administrator' : 'Standard'}
                        tone={entry.record.admin ? 'warn' : 'signal'} />
                    <DataRow label="Operations" state={entry.assignments.length} />
                    <DataRow label="Last seen" state={<Ago ms={entry.lastLoginMs} />} />
                </div>
                <p className="text-[13px] leading-relaxed text-signal">
                    Tasking, payloads and callbacks this account created stay in the operation record — deleting
                    the account removes the login, not the history. Disable it instead if you only need to stop
                    the sign-in.
                </p>
            </div>
        </Dialog>
    );
}

const SELECT_CLASS =
    'min-h-[38px] w-full rounded-sm border border-signal/20 bg-black/30 px-3 text-[13px] text-signal '
    + 'transition-colors hover:border-signal/40 focus:border-signal/60 focus:outline-none '
    + 'focus-visible:ring-1 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-50';

function InviteDialog({ existing, operations, onClose, onDone }: {
    existing: InviteEntry | null;
    operations: { id: number; name: string }[];
    onClose: () => void;
    onDone: () => void;
}) {
    const uid = useId();
    const isCreate = !existing;
    const [name, setName] = useState(existing?.record.name || '');
    const [shortCode, setShortCode] = useState(existing?.code || '');
    const [operationId, setOperationId] = useState(existing?.record.operation_id || 0);
    const [role, setRole] = useState(existing?.record.operation_role || 'operator');
    // The raw string, coerced on read: `parseInt(...) || 1` on every keystroke
    // rewrote the field to "1" the instant it was cleared to be retyped.
    const [totalText, setTotalText] = useState(String(existing?.record.total ?? 1));
    const total = Math.max(1, parseInt(totalText, 10) || 1);

    const [createLink, { loading: creating }] = useMutation<any>(CREATE_INVITE_LINK);
    const [updateLink, { loading: updating }] = useMutation<any>(UPDATE_INVITE_LINK);

    const used = existing?.record.used ?? 0;
    const tooFewSeats = !isCreate && total < used;
    const unchanged = !isCreate && total === (existing?.record.total ?? 0);

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (tooFewSeats || unchanged) return;
        try {
            if (isCreate) {
                const { data } = await createLink({
                    variables: {
                        name, short_code: shortCode, operation_id: operationId,
                        operation_role: operationId > 0 ? role : '', total,
                    },
                });
                if (data?.createInviteLink?.status === 'success') {
                    copyStringToClipboard(data.createInviteLink.link);
                    snackActions.success('Invite created — link copied to clipboard');
                    onDone();
                } else {
                    snackActions.error(data?.createInviteLink?.error || 'Mythic refused to create the invite');
                }
            } else {
                const { data } = await updateLink({ variables: { code: shortCode, total } });
                if (data?.updateInviteLink?.status === 'success') {
                    snackActions.success('Invite updated');
                    onDone();
                } else {
                    snackActions.error(data?.updateInviteLink?.error || 'Mythic refused the invite change');
                }
            }
        } catch (err) {
            snackActions.error(`Could not save the invite — ${getErrorMessage(err)}`);
        }
    };

    return (
        <Dialog
            label={isCreate ? 'New' : 'Edit'}
            title={isCreate ? 'Invite link' : existing!.code}
            icon={<Link2 size={14} strokeWidth={2} />}
            onClose={onClose}
            footer={<>
                {unchanged && !tooFewSeats && <BlockedHint>Change the seat count</BlockedHint>}
                <CancelButton onClick={onClose} />
                <SubmitButton type="button" onClick={submit} disabled={tooFewSeats || unchanged} busy={creating || updating}>
                    {isCreate ? 'Generate' : 'Save'}
                </SubmitButton>
            </>}
        >
            <form onSubmit={submit} className="space-y-4">
                <div className="flex items-start gap-2 rounded-sm border border-amber-400/40 bg-amber-400/[0.06] px-3 py-2.5">
                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <span className="text-[13px] leading-relaxed text-amber-400">
                        Invite links live in memory. Every one of them is dropped when Mythic restarts.
                    </span>
                </div>

                <Field label="Description" htmlFor={`${uid}-name`} hint={isCreate ? 'Optional' : 'Fixed once issued'}>
                    <TextInput id={`${uid}-name`} type="text" value={name} disabled={!isCreate}
                        onChange={e => setName(e.target.value)} placeholder="What this link is for" />
                </Field>

                <Field label="Invite code" htmlFor={`${uid}-code`} hint={isCreate ? 'Blank to generate one' : 'Fixed once issued'}>
                    <TextInput id={`${uid}-code`} type="text" value={shortCode} disabled={!isCreate}
                        onChange={e => setShortCode(e.target.value)} placeholder="auto" />
                </Field>

                <Field label="Join operation" htmlFor={`${uid}-op`} hint={isCreate ? undefined : 'Fixed once issued'}>
                    <select
                        id={`${uid}-op`} value={operationId} disabled={!isCreate}
                        onChange={e => setOperationId(parseInt(e.target.value, 10))}
                        className={SELECT_CLASS}
                    >
                        <option value={0}>No operation — account only</option>
                        {operations.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                    </select>
                </Field>

                {operationId > 0 && (
                    <Field label="Role on join" htmlFor={`${uid}-role`} hint={isCreate ? undefined : 'Fixed once issued'}>
                        <select
                            id={`${uid}-role`} value={role} disabled={!isCreate}
                            onChange={e => setRole(e.target.value)}
                            className={SELECT_CLASS}
                        >
                            <option value="operator">Operator — full tasking</option>
                            <option value="spectator">Spectator — read only</option>
                        </select>
                    </Field>
                )}

                <Field
                    label="Seats" htmlFor={`${uid}-total`}
                    hint={isCreate ? 'How many accounts this link may create' : `${used} already used`}
                    error={tooFewSeats ? `Already used ${used} — seats cannot go below that` : null}
                >
                    <TextInput
                        id={`${uid}-total`} type="number" min={1} value={totalText}
                        onChange={e => setTotalText(e.target.value)}
                        onBlur={() => setTotalText(String(total))}
                        error={tooFewSeats ? 'low' : null}
                    />
                </Field>
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
        </Dialog>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

type RosterSort = 'role' | 'name' | 'seen';
type InviteFilter = 'all' | InviteState;

const ROSTER_SORTS: { key: RosterSort; label: string }[] = [
    { key: 'role', label: 'Role' },
    { key: 'name', label: 'Name' },
    { key: 'seen', label: 'Seen' },
];

const INVITE_FILTERS: { key: InviteFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'spent', label: 'Spent' },
];

/** Admins first: the accounts whose privilege an audit is looking for. */
const ROLE_RANK: Record<AccountState, number> = { admin: 0, operator: 1, disabled: 2 };

type ModalState =
    | { kind: 'create' }
    | { kind: 'rename'; id: number }
    | { kind: 'password'; id: number }
    | { kind: 'delete'; id: number }
    | { kind: 'invite'; code: string | null }
    | null;

const POLL_INTERVAL_MS = 10_000;
/** Invites move on human timescales; the roster moves on session timescales. */
const INVITE_POLL_INTERVAL_MS = 30_000;

export default function UsersPage() {
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);
    const reduce = useReducedMotion();
    const pageVisible = usePageVisible();
    const me = useReactiveVar(meState);
    const myId = me.user?.user_id ?? me.user?.id ?? null;
    const viewUtc = !!me.user?.view_utc_time;

    // One selector, not three. The rail owns which class the board is showing,
    // and `invites` is a class of standing rather than a second page — so
    // there is no separate section switch to keep in sync with it.
    const [classKey, setClassKey] = useState<ClassKey>('all');
    const [inviteFilter, setInviteFilter] = useState<InviteFilter>('all');
    const [sort, setSort] = useState<RosterSort>('role');
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    const [modal, setModal] = useState<ModalState>(null);
    // A set, not an id: two status mutations can be in flight at once, and a
    // single `pendingId` would clear the wrong row's spinner on the first
    // response back.
    const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set());
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const showingInvites = classKey === 'invites';

    const { data, loading, error, refetch, networkStatus } = useQuery<{ operator: OperatorRecord[] }>(GET_OPERATORS, {
        pollInterval: pageVisible ? POLL_INTERVAL_MS : 0,
        fetchPolicy: 'network-only',
        // Required for the freshness stamp below: without it `loading` never
        // toggles for a poll and `networkStatus` never leaves `ready`.
        notifyOnNetworkStatusChange: true,
    });

    // Invite links come from a Mythic action, not a table, so a server with
    // invites disabled answers `status: "error"` inside a 200. That is a fact
    // about the server's configuration, not an incident — it belongs in the
    // panel that would have listed them, not in a toast on every page load.
    // Polled, not fetched once: the ledger prints "Invites open" beside numbers
    // that refresh every 10s, and a figure that only moved on a manual refresh
    // was quietly the oldest thing on the panel.
    const { data: inviteData, loading: invitesLoading, refetch: refetchInvites } =
        useQuery<any>(GET_INVITE_LINKS, {
            fetchPolicy: 'no-cache',
            pollInterval: pageVisible ? INVITE_POLL_INTERVAL_MS : 0,
        });

    const { data: opsData } = useQuery<any>(GET_OPERATIONS_LIST, { fetchPolicy: 'cache-first' });

    const [updateStatus] = useMutation<any>(UPDATE_OPERATOR_STATUS_MUTATION);

    // Stamped when a request COMPLETES, not when the answer differs — see the
    // `notifyOnNetworkStatusChange` note above.
    useEffect(() => {
        if (!loading && (data || error)) setLastUpdated(Date.now());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, networkStatus]);

    // ── Derivation ──────────────────────────────────────────────────────────
    // One pass, one memo. Relative ages read `Date.now()`, but the *stats* do
    // not, so the tick that re-ages the rows lives in the leaf components
    // rather than invalidating this whole derivation twice a minute.
    const { roster, rosterStats } = useMemo(() => {
        const list = data?.operator ?? [];
        let admin = 0, operator = 0, disabled = 0, adminAccounts = 0, dormant = 0;

        const roster = list.map<RosterEntry>(o => {
            const state = accountStateOf(o);
            if (state === 'admin') admin++;
            else if (state === 'operator') operator++;
            else disabled++;
            if (o.admin) adminAccounts++;

            const lastLoginMs = toMs(o.last_login);
            if (lastLoginMs == null) dormant++;

            const assignments: Assignment[] = [];
            for (const link of o.operatoroperations ?? []) {
                const op = link?.operation;
                if (!op || op.deleted) continue;
                assignments.push({ id: op.id, name: op.name, role: link.view_mode || 'operator', complete: op.complete });
            }
            assignments.sort((a, b) => a.name.localeCompare(b.name));

            return {
                record: o,
                id: o.id,
                username: o.username,
                state,
                isSelf: myId != null && o.id === myId,
                lastLoginMs,
                createdMs: toMs(o.creation_time),
                assignments,
            };
        });

        return {
            roster,
            rosterStats: {
                total: roster.length,
                active: admin + operator,
                disabled,
                admin,
                operator,
                adminAccounts,
                dormant,
            },
        };
    }, [data, myId]);

    const { invites, inviteStats, inviteError } = useMemo(() => {
        const payload = inviteData?.getInviteLinks;
        if (payload?.status === 'error') {
            return {
                invites: [] as InviteEntry[],
                inviteStats: { open: 0, spent: 0, seatsLeft: 0 },
                inviteError: payload.error || 'This server did not return its invite links',
            };
        }
        const links: InviteLinkRecord[] = payload?.links ?? [];
        let open = 0, spent = 0, seatsLeft = 0;
        const invites = links.map<InviteEntry>(l => {
            const state = inviteStateOf(l);
            const remaining = Math.max(0, l.total - l.used);
            if (state === 'open') { open++; seatsLeft += remaining; } else spent++;
            return { record: l, code: l.code, state, remaining };
        });
        return { invites, inviteStats: { open, spent, seatsLeft }, inviteError: null as string | null };
    }, [inviteData]);

    const stats: RosterStats = useMemo(() => ({
        ...rosterStats,
        inviteOpen: inviteStats.open,
        seatsLeft: inviteStats.seatsLeft,
    }), [rosterStats, inviteStats]);

    /**
     * Health is a STATE with its evidence, not a score out of a hundred — and
     * the order matters: an unadministered server outranks a merely
     * over-privileged one, and both outrank a dormant seat.
     */
    const health = useMemo<{ label: string; tone: Tone; detail: string }>(() => {
        if (stats.total === 0) return { label: 'No accounts', tone: 'idle', detail: 'Nothing registered' };
        if (stats.active === 0) return { label: 'Locked out', tone: 'fail', detail: 'No account can sign in' };
        if (stats.admin === 0) {
            return {
                label: 'Unadministered', tone: 'fail',
                detail: stats.adminAccounts > 0 ? 'Every admin account is disabled' : 'No admin account exists',
            };
        }
        if (stats.admin === stats.active && stats.active > 1) {
            return { label: 'Over-privileged', tone: 'warn', detail: 'Every enabled account is an admin' };
        }
        if (stats.dormant > 0) {
            return {
                label: 'Dormant seats', tone: 'warn',
                detail: `${stats.dormant} ${plural(stats.dormant, 'account')} never signed in`,
            };
        }
        if (stats.disabled > 0) {
            return {
                label: 'Partial', tone: 'signal',
                detail: `${stats.disabled} ${plural(stats.disabled, 'account')} disabled`,
            };
        }
        return { label: 'Nominal', tone: 'live', detail: 'Every account in use' };
    }, [stats]);

    /**
     * Whether the signed-in operator may administer accounts — read off the
     * roster, not off the session.
     *
     * Mythic's `/auth` payload carries username, ids, operation and
     * `view_utc_time`, and no `admin` flag at all
     * (`webserver/controllers/login.go`). `meState().user.admin` is therefore
     * always undefined, and gating on it would disable every control on this
     * page for everyone, including a Mythic admin. The operator table is
     * readable by every role and does carry `admin`, so the authoritative
     * answer is already in the query this page runs. Until it arrives the
     * answer is "no", which fails closed.
     */
    const isMythicAdmin = useMemo(
        () => roster.some(r => r.isSelf && r.record.admin),
        [roster],
    );

    /** The account whose demotion or disabling would leave nobody in charge. */
    const soleAdminId = useMemo(() => {
        if (stats.admin !== 1) return null;
        return roster.find(r => r.state === 'admin')?.id ?? null;
    }, [roster, stats.admin]);

    const classCounts = useMemo<Record<ClassKey, number>>(() => ({
        all: stats.total,
        admin: stats.admin,
        operator: stats.operator,
        disabled: stats.disabled,
        invites: invites.length,
    }), [stats, invites.length]);

    // The filter runs on a DEFERRED copy of the query. Each keystroke otherwise
    // re-filters, re-sorts and hands framer-motion a new list to measure before
    // the character appears. The field itself stays on `query`, so it is never
    // the thing that lags.
    const deferredQuery = useDeferredValue(query);

    const rosterRows = useMemo(() => {
        const q = deferredQuery.trim().toLowerCase();
        let list = classKey === 'all' || classKey === 'invites'
            ? roster.slice()
            : roster.filter(r => r.state === classKey);
        if (q) {
            list = list.filter(r =>
                r.username.toLowerCase().includes(q)
                || (r.record.email || '').toLowerCase().includes(q)
                || String(r.id) === q
                || r.assignments.some(a => a.name.toLowerCase().includes(q)));
        }
        return list.sort((a, b) => {
            if (sort === 'name') return a.username.localeCompare(b.username);
            if (sort === 'seen') {
                // Never-signed-in sorts last rather than first: "no timestamp"
                // is not "oldest timestamp", and putting it at the top buries
                // the accounts that are actually stale.
                if (a.lastLoginMs == null && b.lastLoginMs == null) return a.username.localeCompare(b.username);
                if (a.lastLoginMs == null) return 1;
                if (b.lastLoginMs == null) return -1;
                return b.lastLoginMs - a.lastLoginMs;
            }
            return (ROLE_RANK[a.state] - ROLE_RANK[b.state]) || a.username.localeCompare(b.username);
        });
    }, [roster, classKey, deferredQuery, sort]);

    const inviteRows = useMemo(() => {
        const q = deferredQuery.trim().toLowerCase();
        let list = inviteFilter === 'all' ? invites.slice() : invites.filter(i => i.state === inviteFilter);
        if (q) {
            list = list.filter(i =>
                i.code.toLowerCase().includes(q)
                || (i.record.name || '').toLowerCase().includes(q)
                || (i.record.operator || '').toLowerCase().includes(q));
        }
        // Open first, then most recently issued — an admin comes here to hand
        // out access, so the links that can still be handed out lead.
        return list.sort((a, b) => {
            if (a.state !== b.state) return a.state === 'open' ? -1 : 1;
            return (toMs(b.record.created_at) ?? 0) - (toMs(a.record.created_at) ?? 0);
        });
    }, [invites, inviteFilter, deferredQuery]);

    /**
     * Selection is DERIVED, not synced. An effect that watched the rows and
     * wrote the selection whenever the current one filtered out would render
     * once with an empty inspector and again with the fallback, and the panel
     * would visibly blink. `selectedId` still holds the operator's actual
     * choice, so switching a class away and back restores it.
     */
    const activeId = selectedId != null && rosterRows.some(r => r.id === selectedId)
        ? selectedId
        : rosterRows[0]?.id ?? null;
    const selected = useMemo(
        () => (activeId == null ? null : roster.find(r => r.id === activeId) ?? null),
        [roster, activeId],
    );

    const activeCode = selectedCode != null && inviteRows.some(i => i.code === selectedCode)
        ? selectedCode
        : inviteRows[0]?.code ?? null;
    const selectedInvite = useMemo(
        () => (activeCode == null ? null : invites.find(i => i.code === activeCode) ?? null),
        [invites, activeCode],
    );

    // Two shapes from one query: the dropdown may only offer operations an
    // invite can still join, but the inspector has to be able to name a
    // completed or archived one an existing invite already points at.
    const operations = useMemo(() => {
        const list = (opsData?.operation ?? []).filter((o: any) => !o.deleted && !o.complete);
        return [...list].sort((a: any, b: any) => a.name.localeCompare(b.name));
    }, [opsData]);

    const operationNames = useMemo(() => {
        const map = new Map<number, string>();
        for (const o of opsData?.operation ?? []) map.set(o.id, o.name);
        return map;
    }, [opsData]);

    // ── Mutations ───────────────────────────────────────────────────────────
    const clearPending = useCallback((id: number) => {
        setPending(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    /**
     * One path for every status change, because Mythic answers all three the
     * same way: a 200 OK carrying `status: "error"`. Read as a plain success,
     * a refused promotion is indistinguishable from an applied one — the
     * spinner clears, the row does not move, and the admin clicks again.
     */
    const runStatus = useCallback((
        entry: RosterEntry,
        vars: { active?: boolean; admin?: boolean; deleted?: boolean },
        done: string,
        verb: string,
        onSettled?: () => void,
    ) => {
        const id = entry.id;
        setPending(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
        updateStatus({ variables: { operator_id: id, ...vars } })
            .then(async res => {
                const out = res.data?.updateOperatorStatus;
                if (out?.status === 'error') {
                    snackActions.error(out.error || `Mythic refused to ${verb} ${entry.username}`);
                    return;
                }
                snackActions.success(done);
                // Awaited, not fired and forgotten: `finally` clears the row's
                // spinner, and clearing it before the new data lands leaves the
                // row showing its old state, quiet, for a whole round trip.
                await refetch().catch(() => { /* surfaced by `error` on the next render */ });
            })
            .catch(err => {
                const raw = getErrorMessage(err);
                snackActions.error(/not found in type|permission|denied/i.test(raw)
                    ? `Only a Mythic admin can ${verb} an account.`
                    : `Could not ${verb} ${entry.username} — ${raw}`);
            })
            .finally(() => { clearPending(id); onSettled?.(); });
    }, [updateStatus, refetch, clearPending]);

    const handleToggleActive = useCallback((entry: RosterEntry) => {
        const enable = entry.state === 'disabled';
        runStatus(entry, { active: enable },
            `${entry.username} ${enable ? 'enabled' : 'disabled'}`,
            enable ? 'enable' : 'disable');
    }, [runStatus]);

    const handleToggleAdmin = useCallback((entry: RosterEntry) => {
        const promote = !entry.record.admin;
        runStatus(entry, { admin: promote },
            `${entry.username} ${promote ? 'promoted to admin' : 'demoted to standard'}`,
            promote ? 'promote' : 'demote');
    }, [runStatus]);

    // The dialog stays up until the mutation settles, so its button can show
    // the work happening. Closing first made `busy` unreachable and left the
    // most destructive action on the page with no feedback at all.
    const handleDelete = useCallback((entry: RosterEntry) => {
        runStatus(entry, { deleted: true }, `${entry.username} deleted`, 'delete', () => setModal(null));
    }, [runStatus]);

    const handleCopyInvite = useCallback((entry: InviteEntry) => {
        copyStringToClipboard(entry.record.link);
        snackActions.success(`Invite ${entry.code} copied to clipboard`);
    }, []);

    const handleRefresh = useCallback(() => {
        void refetch().catch(() => { /* surfaced by `error` */ });
        void refetchInvites().catch(() => { /* surfaced in the invite panel */ });
    }, [refetch, refetchInvites]);

    // Stable identities, or the memo on both inspectors never bails out.
    const openRename = useCallback((e: RosterEntry) => setModal({ kind: 'rename', id: e.id }), []);
    const openPassword = useCallback((e: RosterEntry) => setModal({ kind: 'password', id: e.id }), []);
    const openDelete = useCallback((e: RosterEntry) => setModal({ kind: 'delete', id: e.id }), []);
    const openInviteEdit = useCallback((e: InviteEntry) => setModal({ kind: 'invite', code: e.code }), []);

    const handleClassChange = useCallback((k: ClassKey) => {
        // The query means different things on either side of the rail's rule
        // (accounts vs invite links), so it does not follow the operator
        // across it. Read from state rather than from inside the updater —
        // a second setState called from a reducer runs twice under StrictMode
        // and is not a place state is allowed to be set.
        if ((classKey === 'invites') !== (k === 'invites')) setQuery('');
        setClassKey(k);
    }, [classKey]);

    // ── Keyboard ────────────────────────────────────────────────────────────
    const moveSelection = useCallback((delta: number) => {
        if (!showingInvites) {
            if (rosterRows.length === 0) return;
            const idx = rosterRows.findIndex(r => r.id === activeId);
            const next = idx < 0 ? 0 : Math.max(0, Math.min(rosterRows.length - 1, idx + delta));
            const target = rosterRows[next];
            if (!target) return;
            setSelectedId(target.id);
            // Queried rather than held in a ref map: the map would cost every
            // row a fresh callback prop on every render, and the browser
            // scrolls a focused element into view for free.
            listRef.current?.querySelector<HTMLButtonElement>(`[data-account-id="${target.id}"]`)?.focus();
            return;
        }
        if (inviteRows.length === 0) return;
        const idx = inviteRows.findIndex(i => i.code === activeCode);
        const next = idx < 0 ? 0 : Math.max(0, Math.min(inviteRows.length - 1, idx + delta));
        const target = inviteRows[next];
        if (!target) return;
        setSelectedCode(target.code);
        listRef.current
            ?.querySelector<HTMLButtonElement>(`[data-invite-code="${CSS.escape(target.code)}"]`)
            ?.focus();
    }, [showingInvites, rosterRows, inviteRows, activeId, activeCode]);

    const onListKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    }, [moveSelection]);

    // `/` focuses search — the one shortcut worth having on a list page, and it
    // must not fire while the operator is typing into something else.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            // A dialog is modal: nothing behind it may take focus, and focus
            // inside one usually sits on a button rather than a field, so the
            // tag check below is not enough on its own.
            if (document.querySelector('[role="dialog"]')) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Derived chrome ──────────────────────────────────────────────────────
    const showSkeleton = showingInvites ? invitesLoading && !inviteData : loading && !data;
    const feedTone: Tone = error ? 'fail' : showSkeleton ? 'warn' : 'live';
    const feedWord = error ? 'Feed lost' : showSkeleton ? 'Loading' : 'Live';
    /**
     * Why a privileged control is unavailable — three answers, not one.
     *
     * `isMythicAdmin` is derived from the roster, so it is false while the
     * query is in flight and false forever if it fails. Reporting either as
     * "only a Mythic admin can do this" tells an actual admin something untrue
     * about their own account.
     */
    const privilegeReason = isMythicAdmin ? undefined
        : loading && !data ? 'Checking your privileges…'
            : error ? 'Cannot verify your privileges — the roster feed is down'
                : 'Only a Mythic admin can issue accounts or invites';
    const classMeta = CLASS_META[classKey];
    const shownCount = showingInvites ? inviteRows.length : rosterRows.length;
    const poolCount = showingInvites ? invites.length : classCounts[classKey];

    const modalEntry = modal && 'id' in modal ? roster.find(r => r.id === modal.id) ?? null : null;
    const modalInvite = modal?.kind === 'invite' && modal.code
        ? invites.find(i => i.code === modal.code) ?? null
        : null;

    return (
        <TickProvider>
        <div className="min-h-screen overflow-x-hidden bg-void font-mono text-signal selection:bg-signal selection:text-void">
            <div className={cn(
                'flex h-screen flex-col overflow-hidden px-6 pb-5 pt-0 transition-all duration-300 lg:px-10',
                isSidebarCollapsed ? 'ml-16' : 'ml-64',
            )}>
                {/* ── Top instrument rail ──────────────────────────────────────
                    The console's own top edge, identical in construction to the
                    other pages': identity left, posture and controls right.
                    This is the frame; what hangs inside it is this page's. */}
                <header className="-mx-6 flex shrink-0 items-center justify-between gap-4 border-b border-signal/20 bg-void/90 px-6 py-2.5 backdrop-blur-sm lg:-mx-10 lg:px-10">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <UsersIcon size={14} strokeWidth={2} className="shrink-0 text-signal" aria-hidden="true" />
                        <h1 className="text-[13px] font-bold tracking-[0.14em] text-signal">USER MANAGEMENT</h1>
                        <span className="hidden text-[13px] text-signal opacity-60 sm:inline">Operator access control</span>
                        <span aria-hidden="true" className="hidden h-3 w-px bg-signal/20 sm:inline-block" />
                        <span className="hidden min-w-0 truncate text-[13px] text-signal md:inline">
                            <span className="opacity-60">Enabled</span>{' '}
                            <span className="font-bold tabular-nums">{stats.active}/{stats.total}</span>
                        </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                        <StatusWord tone={health.tone} dot className="hidden md:inline-flex">
                            <span role="status" aria-atomic="true">{health.label}</span>
                        </StatusWord>
                        <span className="hidden text-[13px] tabular-nums text-signal opacity-60 lg:inline">
                            <Freshness lastUpdated={lastUpdated} />
                        </span>
                        <button
                            onClick={handleRefresh}
                            title="Refresh the roster and invite links"
                            aria-label="Refresh"
                            className={ICON_BUTTON}
                        >
                            <RefreshCw
                                size={13} strokeWidth={2} aria-hidden="true"
                                className={cn(loading && !reduce && 'animate-spin')}
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => setModal(showingInvites ? { kind: 'invite', code: null } : { kind: 'create' })}
                            disabled={!isMythicAdmin}
                            // The label is `sm:inline`, so below that the icon is
                            // the whole button and `aria-hidden` leaves it nameless.
                            aria-label={showingInvites ? 'New invite' : 'New account'}
                            title={privilegeReason}
                            className={cn(
                                'inline-flex min-h-[32px] items-center gap-2 rounded-sm border px-3 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal',
                                isMythicAdmin
                                    ? 'border-accent bg-accent text-void hover:bg-accent/90'
                                    : 'cursor-not-allowed border-signal/20 text-signal opacity-50',
                            )}
                        >
                            {showingInvites
                                ? <><Plus size={13} strokeWidth={2} aria-hidden="true" /><span className="hidden sm:inline">New invite</span></>
                                : <><UserPlus size={13} strokeWidth={2} aria-hidden="true" /><span className="hidden sm:inline">New account</span></>}
                        </button>
                    </div>
                </header>

                {/* ── Access ledger ──────────────────────────────────────────── */}
                <div className="mv-panel-enter mt-4 shrink-0" style={{ '--mv-panel-index': 0 } as React.CSSProperties}>
                    <AccessLedger stats={stats} lastUpdated={lastUpdated} />
                </div>

                {/* ── Board: class rail + list, then the inspector ──────────────
                    `<main>`: without a landmark a screen reader user has no way
                    to skip the rails and the ledger to reach the roster.

                    The inspector is a fixed 26rem rather than a third of the
                    page: a record card does not get wider with the window, and
                    the roster — which does have columns that want the room —
                    takes everything else. */}
                <main className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:overflow-visible">
                    <section
                        aria-label={showingInvites ? 'Invite links' : 'Operator accounts'}
                        className="mv-panel-enter flex min-h-[45vh] flex-col overflow-hidden rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm xl:h-full xl:min-h-0 min-[1700px]:flex-row"
                        style={{ '--mv-panel-index': 1 } as React.CSSProperties}
                    >
                        <ClassRail value={classKey} counts={classCounts} onChange={handleClassChange} />

                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                            {/* ── Toolbar strip. The panel's header IS the tool
                                 bar here: what you are looking at on the left,
                                 how you are looking at it on the right. */}
                            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-signal/15 px-4 py-2.5">
                                <span className={cn('shrink-0', classMeta.ink)} aria-hidden="true">{classMeta.icon}</span>
                                <h2 className={cn('shrink-0 text-signal', LABEL)}>{classMeta.label}</h2>
                                <span
                                    role="status"
                                    aria-live="polite"
                                    aria-atomic="true"
                                    className={cn('shrink-0 text-[11px] font-bold tabular-nums', toneText(feedTone))}
                                >
                                    <span aria-hidden="true">{shownCount}/{poolCount}</span>
                                    <span className="sr-only">
                                        {shownCount} of {poolCount} {showingInvites ? 'invites' : 'accounts'} shown
                                    </span>
                                </span>

                                <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
                                    <div className="relative min-w-[150px] max-w-[300px] flex-1">
                                        <Search
                                            size={13} strokeWidth={2} aria-hidden="true"
                                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-signal opacity-60"
                                        />
                                        <input
                                            ref={searchRef}
                                            value={query}
                                            onChange={e => setQuery(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
                                            placeholder={showingInvites ? 'Filter invites…' : 'Filter accounts…'}
                                            aria-label={showingInvites ? 'Filter invites' : 'Filter accounts'}
                                            className={cn(
                                                'min-h-[32px] w-full rounded-sm border border-signal/20 bg-black/30 pl-9 pr-8 text-[13px] text-signal',
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

                                    {showingInvites
                                        ? <Segmented options={INVITE_FILTERS} value={inviteFilter} onChange={setInviteFilter} ariaLabel="Filter invites by state" />
                                        : <Segmented options={ROSTER_SORTS} value={sort} onChange={setSort} ariaLabel="Sort accounts" />}
                                </div>
                            </div>

                            {error && !showingInvites && (
                                <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-red-400/30 bg-red-400/[0.06] px-4 py-2.5">
                                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
                                    <span className="text-[13px] text-red-400">
                                        {error.message || 'The operator query failed.'}
                                    </span>
                                </div>
                            )}
                            {inviteError && showingInvites && (
                                <div role="status" className="flex shrink-0 items-start gap-2 border-b border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5">
                                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                                    <span className="text-[13px] text-amber-400">{inviteError}</span>
                                </div>
                            )}

                            {showingInvites ? <InviteListHeader /> : <RosterListHeader />}

                            {/* `relative`: an exiting row is positioned against
                                this scroller rather than some ancestor. */}
                            <div
                                ref={listRef}
                                className="cyber-scrollbar relative min-h-0 flex-1 overflow-y-auto"
                                onKeyDown={onListKeyDown}
                            >
                                {showSkeleton ? <ListSkeleton /> : showingInvites ? (
                                    inviteRows.length === 0 ? (
                                        <NoData>
                                            {inviteError
                                                ? 'Invite links are unavailable on this server'
                                                : query.trim()
                                                    ? `Nothing matches “${query.trim()}”`
                                                    : invites.length === 0
                                                        ? 'No invite link has been issued since the last restart'
                                                        : 'No invite is in this state'}
                                        </NoData>
                                    ) : (
                                        <AnimatePresence initial={false}>
                                            {inviteRows.map(i => (
                                                <motion.div
                                                    key={i.code}
                                                    initial={reduce ? false : { opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                                                    transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                                                >
                                                    <InviteLine
                                                        entry={i}
                                                        selected={i.code === activeCode}
                                                        onSelect={setSelectedCode}
                                                        onCopy={handleCopyInvite}
                                                    />
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    )
                                ) : rosterRows.length === 0 ? (
                                    <NoData>
                                        {query.trim()
                                            ? `Nothing matches “${query.trim()}”`
                                            : stats.total === 0
                                                ? 'No operator accounts exist on this server'
                                                : `No account is ${classKey === 'all' ? 'on the roster' : `in the ${CLASS_META[classKey].label.toLowerCase()} class`}`}
                                    </NoData>
                                ) : (
                                    <AnimatePresence initial={false}>
                                        {rosterRows.map(r => (
                                            <motion.div
                                                key={r.id}
                                                initial={reduce ? false : { opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                                                transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                                            >
                                                <OperatorLine
                                                    entry={r}
                                                    selected={r.id === activeId}
                                                    busy={pending.has(r.id)}
                                                    canToggle={isMythicAdmin && !r.isSelf}
                                                    onSelect={setSelectedId}
                                                    onToggle={handleToggleActive}
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>

                            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-signal/15 px-4 py-2.5">
                                <span className="min-w-0 truncate text-[11px] text-signal opacity-70">
                                    ↑↓ moves · / filters · a row inspects
                                </span>
                                <span className="shrink-0 text-[11px] font-medium tabular-nums text-signal">
                                    {showingInvites
                                        ? <>{inviteStats.seatsLeft} {plural(inviteStats.seatsLeft, 'seat')} outstanding</>
                                        : <>{stats.admin} admin {plural(stats.admin, 'account')} enabled</>}
                                </span>
                            </div>
                        </div>
                    </section>

                    <div
                        className="mv-panel-enter min-h-[360px] xl:h-full xl:min-h-0"
                        style={{ '--mv-panel-index': 2 } as React.CSSProperties}
                    >
                        {showingInvites ? (
                            <InviteInspector
                                entry={selectedInvite}
                                viewUtc={viewUtc}
                                operationNames={operationNames}
                                onCopy={handleCopyInvite}
                                onEdit={openInviteEdit}
                            />
                        ) : (
                            <OperatorInspector
                                entry={selected}
                                busy={selected != null && pending.has(selected.id)}
                                viewUtc={viewUtc}
                                canAdminister={isMythicAdmin}
                                lastEnabledAdmin={selected != null && selected.id === soleAdminId}
                                onToggleActive={handleToggleActive}
                                onToggleAdmin={handleToggleAdmin}
                                onRename={openRename}
                                onPassword={openPassword}
                                onDelete={openDelete}
                            />
                        )}
                    </div>
                </main>

                {/* ── Bottom instrument rail ─────────────────────────────────── */}
                <div className="-mx-6 mt-4 flex shrink-0 items-center justify-between gap-4 border-t border-signal/20 bg-void/90 px-6 py-2 backdrop-blur-sm lg:-mx-10 lg:px-10">
                    <div className="flex min-w-0 items-center gap-5 overflow-hidden">
                        <span className="flex shrink-0 items-center gap-2 text-[13px]">
                            <UsersIcon size={13} strokeWidth={2} className="text-signal" aria-hidden="true" />
                            <span className="text-signal opacity-60">Enabled</span>
                            <span className="font-bold tabular-nums text-signal">{stats.active}/{stats.total}</span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 text-[13px] sm:flex">
                            <span className="text-signal opacity-60">Admins</span>
                            <StatusWord tone={stats.admin === 0 ? 'fail' : 'warn'}>
                                {stats.admin === 0 ? 'None' : `${stats.admin} enabled`}
                            </StatusWord>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 text-[13px] md:flex">
                            <span className="text-signal opacity-60">Dormant</span>
                            <StatusWord tone={stats.dormant > 0 ? 'warn' : 'signal'}>
                                {stats.dormant > 0 ? `${stats.dormant} never signed in` : 'None'}
                            </StatusWord>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 text-[13px] lg:flex">
                            <span className="text-signal opacity-60">Invites</span>
                            <span className="font-bold tabular-nums text-signal">{stats.inviteOpen} open</span>
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

            <AnimatePresence>
                {modal?.kind === 'create' && (
                    <CreateAccountDialog
                        key="create"
                        onClose={() => setModal(null)}
                        onDone={() => { setModal(null); handleRefresh(); }}
                    />
                )}
                {modal?.kind === 'rename' && modalEntry && (
                    <RenameDialog
                        key="rename"
                        entry={modalEntry}
                        onClose={() => setModal(null)}
                        onDone={() => { setModal(null); handleRefresh(); }}
                    />
                )}
                {modal?.kind === 'password' && modalEntry && (
                    <CredentialsDialog
                        key="password"
                        entry={modalEntry}
                        onClose={() => setModal(null)}
                        onDone={() => { setModal(null); handleRefresh(); }}
                    />
                )}
                {modal?.kind === 'delete' && modalEntry && (
                    <DeleteAccountDialog
                        key="delete"
                        entry={modalEntry}
                        busy={pending.has(modalEntry.id)}
                        onClose={() => setModal(null)}
                        onConfirm={() => handleDelete(modalEntry)}
                    />
                )}
                {modal?.kind === 'invite' && (
                    <InviteDialog
                        key="invite"
                        existing={modalInvite}
                        operations={operations}
                        onClose={() => setModal(null)}
                        onDone={() => { setModal(null); handleRefresh(); }}
                    />
                )}
            </AnimatePresence>
        </div>
        </TickProvider>
    );
}
