import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CONN, type ConnInfo } from './connection';
import { CLOSE_ANIMATION_DELAY_MS, LOGIN_NAV_DELAY_MS } from './timings';

/** Permissions released on the welcome screen, one card each. */
const GRANT_LOCKS = [
    { id: 'auth', label: 'AUTHORISATION' },
    { id: 'session', label: 'SESSION VAULT' },
    { id: 'relay', label: 'RELAY CHANNEL' },
    { id: 'tasks', label: 'TASK QUEUE' },
    { id: 'artifacts', label: 'ARTIFACT STORE' },
];

/** Card breach schedule, in ms. Shared so later moves can wait on the last one. */
const LOCK_FIRST_MS = 200;
const LOCK_STAGGER_MS = 85;
const LOCK_BREACH_MS = 300;
/** Last card released, derived rather than hand-set so the two cannot drift. */
const LOCKS_DONE_MS =
    LOCK_FIRST_MS + (GRANT_LOCKS.length - 1) * LOCK_STAGGER_MS + LOCK_BREACH_MS;

type LockState = 'locked' | 'breaching' | 'released';

/**
 * One permission lock, following Ref/lock.gif: a card with a chamfered
 * bottom-left corner and a padlock riding its top-right edge, running
 * LOCKED -> BREACHING (tumblers solving) -> RELEASED (shackle springs off, the
 * card fills, a glyph lands).
 *
 * Purely presentational, and drawn entirely in `currentColor`. Both of the
 * stacked panel layers render the same cards from the same state, so a card
 * cannot be a frame out of step between them, and each layer's own text colour
 * is all that distinguishes them.
 */
const PermissionLock = React.memo(function PermissionLock(
    { label, state }: { label: string; state: LockState },
) {
    const open = state === 'released';
    const spring = { type: 'spring' as const, stiffness: 420, damping: 14 };

    return (
        <div className="flex items-center gap-3">
            <div className="relative w-[26px] h-[32px] shrink-0">
                <motion.div
                    className="absolute -top-[6px] right-[2px] z-10 w-[9px] h-[9px] border-[2px] border-current"
                    animate={open ? { x: 6, y: -5, rotate: 18 } : { x: 0, y: 0, rotate: 0 }}
                    transition={spring}
                />
                <motion.div
                    className="absolute -top-[11px] right-[4px] z-10 w-[5px] h-[6px] border-[2px] border-b-0 border-current"
                    animate={open ? { x: 8, y: -7, rotate: 24 } : { x: 0, y: 0, rotate: 0 }}
                    transition={spring}
                />

                <div
                    className="absolute inset-0 border-[1.5px] border-current overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 24% 100%, 0 80%)' }}
                >
                    {/* scaleY, not height: height relayouts the card every frame. */}
                    <motion.div
                        className="absolute inset-0 bg-current origin-bottom"
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: open ? 1 : state === 'breaching' ? 0.2 : 0 }}
                        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
                        style={{ opacity: 0.2 }}
                    />

                    <AnimatePresence>
                        {state === 'breaching' && (
                            <motion.div
                                className="absolute inset-0 flex flex-col justify-evenly px-[3px]"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.1 }}
                            >
                                {[0, 1, 2].map(row => (
                                    <div key={row} className="relative h-[1.5px] w-full bg-current opacity-30">
                                        {/* x, not left: same reason. */}
                                        <motion.div
                                            className="absolute left-0 top-1/2 h-[6px] w-[6px] -translate-y-1/2 bg-current"
                                            initial={{ x: 0 }}
                                            animate={{ x: 14 }}
                                            transition={{ delay: row * 0.09, duration: 0.26, ease: 'linear' }}
                                        />
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {open && (
                            <motion.svg
                                viewBox="0 0 24 24"
                                className="absolute inset-0 m-auto w-[15px] h-[15px]"
                                initial={{ opacity: 0, scale: 0.5, rotate: -70 }}
                                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                            >
                                <path
                                    d="M12 3.5 a8.5 8.5 0 0 1 8.5 8.5 M12 20.5 a8.5 8.5 0 0 1 -8.5 -8.5"
                                    stroke="currentColor" strokeWidth="3.4" fill="none" strokeLinecap="square"
                                />
                                <circle cx="12" cy="12" r="2.8" fill="currentColor" />
                            </motion.svg>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="min-w-0 leading-none">
                <div className="text-[9px] font-bold tracking-[0.16em] truncate">{label}</div>
                <div className="mt-1 text-[7px] font-bold tracking-[0.2em] opacity-70">
                    {open ? 'RELEASED' : state === 'breaching' ? 'BREACHING' : 'LOCKED'}
                </div>
            </div>
        </div>
    );
});

/**
 * One welcome layout, rendered once per contrast state; colour is the only
 * difference between the two copies.
 *
 * Defined at module scope, NOT inside TransitionScreen. A component declared in
 * a render body is a brand-new type on every render, so React unmounts and
 * remounts the whole subtree each time any state changes — and this screen
 * changes state a dozen times as the locks breach. Every entry animation would
 * restart on each one, which is what made the sequence judder.
 */
const WelcomePanel = React.memo(function WelcomePanel({
    light, lockStates, released, username, conn,
}: {
    light: boolean;
    lockStates: LockState[];
    released: number;
    username: string;
    conn: ConnInfo;
}) {
    return (
        <div className={cn('flex h-full flex-col', light ? 'text-void' : 'text-signal')}>
            <div className={cn(
                'flex items-center justify-between gap-3 px-4 py-2',
                light ? 'bg-void text-signal' : 'bg-signal text-void',
            )}>
                <span className="text-[11px] font-bold tracking-[0.3em]">ACCESS GRANTED</span>
                <span className="text-[9px] font-bold tracking-[0.2em] opacity-80 tabular-nums">
                    {released} / {GRANT_LOCKS.length} RELEASED
                </span>
            </div>

            <div className="flex flex-1 gap-6 px-5 py-5">
                <div className={cn(
                    'flex shrink-0 flex-col gap-2.5 border-r pr-5',
                    light ? 'border-void/20' : 'border-signal/20',
                )}>
                    {GRANT_LOCKS.map((lock, i) => (
                        <PermissionLock key={lock.id} label={lock.label} state={lockStates[i]} />
                    ))}
                </div>

                <div className="flex min-w-0 flex-col justify-center">
                    {/* scale + opacity, not letterSpacing: animating tracking
                        reflows the wordmark on every frame. */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                        className="origin-left text-[38px] sm:text-[46px] leading-none font-bold tracking-[0.24em] select-none"
                    >
                        MINERVA
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.32, duration: 0.24 }}
                        className="mt-4 text-[11px] font-bold tracking-[0.26em] truncate"
                    >
                        WELCOME, {username.toUpperCase() || 'OPERATOR'}
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.44, duration: 0.24 }}
                        className="mt-2 text-[9px] font-bold tracking-[0.2em] opacity-70 truncate"
                    >
                        {conn.protocol} · {conn.hostname}
                    </motion.div>
                </div>
            </div>

            <div className={cn(
                'flex items-center justify-between gap-3 px-4 py-2',
                light ? 'bg-void text-signal' : 'bg-signal text-void',
            )}>
                <span className="text-[9px] font-bold tracking-[0.2em] opacity-80">
                    MINERVA C2 · OPERATOR CONSOLE
                </span>
                <span className="text-[11px] font-bold tracking-[0.3em]">SESSION OPEN</span>
            </div>
        </div>
    );
});

/**
 * Access granted — a welcome beat, NOT a loading screen.
 *
 * Choreography from Ref/UI.gif: a sweep travels RIGHT TO LEFT, then the high
 * contrast state expands LEFT TO RIGHT.
 *
 * The inversion is done by rendering the SAME layout twice, stacked, and
 * clipping the light copy open from the left. Nothing is cross-faded, so no
 * element ever disappears — the wipe's edge simply passes over each object and
 * that object is high contrast from then on. Cross-fading two different layers
 * instead makes the whole panel blink out mid-transition, which is exactly what
 * this arrangement avoids. Lock state lives in the parent for the same reason:
 * both copies must be identical, down to the frame.
 *
 * MINERVA is present from the first frame, in both copies. It is the point of
 * the screen; it should not wait for the lighting to change to exist.
 *
 * There is deliberately no progress rail: the work is already finished by the
 * time this shows, and a bar implying otherwise made an earlier version read as
 * a loading screen bolted onto a welcome screen.
 */
const TransitionScreen = ({ username, onComplete }: { username: string; onComplete: () => void }) => {
    const [lockStates, setLockStates] = useState<LockState[]>(
        () => GRANT_LOCKS.map(() => 'locked'),
    );
    const [sweeping, setSweeping] = useState(false);
    const [lit, setLit] = useState(false);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        const setAt = (i: number, s: LockState) =>
            setLockStates(prev => { const next = [...prev]; next[i] = s; return next; });

        const timers = GRANT_LOCKS.flatMap((_, i) => {
            const at = LOCK_FIRST_MS + i * LOCK_STAGGER_MS;
            return [
                setTimeout(() => setAt(i, 'breaching'), at),
                setTimeout(() => setAt(i, 'released'), at + LOCK_BREACH_MS),
            ];
        });

        timers.push(setTimeout(() => setSweeping(true), LOCKS_DONE_MS + 120));
        timers.push(setTimeout(() => setLit(true), LOCKS_DONE_MS + 380));
        timers.push(setTimeout(() => setClosing(true), CLOSE_ANIMATION_DELAY_MS));
        timers.push(setTimeout(onComplete, LOGIN_NAV_DELAY_MS));
        return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const released = lockStates.filter(s => s === 'released').length;

    return (
        <motion.div
            key="transition-screen"
            className="fixed inset-0 z-[9999] bg-void flex items-center justify-center overflow-hidden font-mono"
            // Fades up over the handshake panel's own exit. Arriving at full
            // opacity instead snaps the whole screen to solid void in one
            // frame, which is the only cut left in the login chain.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
        >
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'repeating-linear-gradient(0deg, rgba(255,58,52,0.020) 0px, rgba(255,58,52,0.020) 1px, transparent 1px, transparent 3px)' }}
            />

            <div className="pointer-events-none absolute inset-0 hidden md:block text-[10px] font-bold tracking-[0.2em] text-signal opacity-70">
                <div className="absolute top-6 left-6 flex items-center gap-2.5">
                    <Shield size={14} strokeWidth={2} className="text-signal" />
                    <span className="text-signal">MINERVA C2</span>
                </div>
                <div className="absolute bottom-6 left-6">{CONN.protocol} · {CONN.port}</div>
                <div className="absolute bottom-6 right-6">BUILD 2.2.0</div>
            </div>

            <div className="relative z-10 w-full flex justify-center px-6">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    // One expression per prop: spreading a second `animate` over
                    // the first silently wins and drops the entry animation.
                    animate={closing ? { opacity: 1, y: 0, scaleY: 0.004 } : { opacity: 1, y: 0, scaleY: 1 }}
                    transition={closing
                        ? { delay: 0.2, duration: 0.16, ease: [0.76, 0, 0.24, 1] }
                        : { duration: 0.3, ease: [0, 0, 0.2, 1] }}
                    className="relative w-[min(94vw,660px)] min-h-[300px] border border-signal/30 overflow-hidden"
                    style={{ transformOrigin: 'center center' }}
                >
                    {/* Base copy: light on dark. Always present, never faded. */}
                    <div className="absolute inset-0">
                        <WelcomePanel light={false} lockStates={lockStates} released={released}
                            username={username} conn={CONN} />
                    </div>

                    {/* High-contrast copy, clipped open from the left. Same layout,
                        so objects convert in place as the edge crosses them. */}
                    <motion.div
                        className="absolute inset-0 bg-signal"
                        style={{ willChange: 'clip-path' }}
                        initial={{ clipPath: 'inset(0 100% 0 0)' }}
                        animate={{ clipPath: lit ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
                        transition={{ duration: 0.38, ease: [0.76, 0, 0.24, 1] }}
                    >
                        <WelcomePanel light lockStates={lockStates} released={released}
                            username={username} conn={CONN} />
                    </motion.div>

                    {/* Close: the panel's own two bars run together like shutters,
                        then the frame collapses onto the seam they meet at. Built
                        from elements already on screen, so the welcome shuts
                        itself rather than being switched off. */}
                    <motion.div
                        className="absolute inset-x-0 top-0 z-50 bg-void origin-top"
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: closing ? 1 : 0 }}
                        transition={{ duration: 0.2, ease: [0.76, 0, 0.24, 1] }}
                        style={{ height: '50.5%' }}
                    />
                    <motion.div
                        className="absolute inset-x-0 bottom-0 z-50 bg-void origin-bottom"
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: closing ? 1 : 0 }}
                        transition={{ duration: 0.2, ease: [0.76, 0, 0.24, 1] }}
                        style={{ height: '50.5%' }}
                    />

                    {/* The right-to-left pass that precedes the change. */}
                    <AnimatePresence>
                        {sweeping && !lit && (
                            <motion.div
                                className="absolute inset-y-0 w-[26%] pointer-events-none"
                                style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--color-signal) / 0.22), transparent)' }}
                                initial={{ left: '100%' }}
                                animate={{ left: '-30%' }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'linear' }}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* The seam, thrown outward as the frame lets go of it. */}
            <AnimatePresence>
                {closing && (
                    <motion.div
                        className="absolute left-0 right-0 h-px bg-signal"
                        style={{ boxShadow: '0 0 18px 3px rgba(255,255,255,0.9)', top: '50%' }}
                        initial={{ opacity: 0, scaleX: 0.35 }}
                        animate={{ opacity: [0, 1, 1, 0], scaleX: [0.35, 0.35, 1, 1.06] }}
                        transition={{ delay: 0.2, duration: 0.4, times: [0, 0.25, 0.7, 1], ease: 'easeOut' }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default TransitionScreen;
