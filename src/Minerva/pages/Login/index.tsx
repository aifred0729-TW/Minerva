import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Shield, Activity, AlertTriangle, Globe, Fingerprint, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useShallow } from 'zustand/shallow';
// Leaf module, not the `lib/api` barrel. Login is eager (App.tsx imports it
// directly, not through lazyRetry), and the barrel re-exports all 28 api
// modules — so two symbols dragged every gql document in the app into the
// entry bundle and made the browser run graphql's parser over all 423 of
// them before the login screen could paint.
import { loginUser, LOGIN_TIMED_OUT } from '../../lib/api/settings';
import { successfulLogin } from '../../lib/auth';
import { playEnter, playAuthed } from '../../lib/soundEffects';
import { cn } from '../../lib/utils';
import type { ViewMode, CheckItem } from '../../types/login';
import LoginBackdrop from '../../components/LoginBackdrop';
import IntroSequence from './BootSequence';
import TransitionScreen from './WelcomeScreen';
import { LiveClock, ServerStatus, useServerHostname } from './widgets';
import { CONN } from './connection';
import {
    DELAY_CONNECTING, DELAY_CHECK_STEP, DELAY_SESSION_SETUP, DELAY_PACKET_TICK,
    DELAY_LOGOUT_SHORT, DELAY_LOGOUT_MID, DELAY_LOGOUT_LONG, DELAY_AUTH_FAIL_MSG,
} from './timings';

const INITIAL_CHECKS: CheckItem[] = [
    { id: 'conn', label: 'SERVER_CONNECTION', status: 'PENDING' },
    { id: 'tls', label: 'TLS_HANDSHAKE', status: 'PENDING' },
    { id: 'auth', label: 'VERIFYING_CREDENTIALS', status: 'PENDING' },
    { id: 'session', label: 'ESTABLISHING_SESSION', status: 'PENDING' },
];

const DASHBOARD_PRELOAD_DATA = [
    'SYNCING_CALLBACKS...',
    'LOADING_PAYLOADS...',
    'FETCHING_OPERATIONS...',
    'UPDATING_ARTIFACTS...',
];

// =============================================================================
// MAIN LOGIN COMPONENT
// =============================================================================

export default function Login() {
    const navigate = useNavigate();
    const { setAppState, isLoggingOut, reset, beginSessionOpen } = useAppStore(useShallow(s => ({ setAppState: s.setAppState, isLoggingOut: s.isLoggingOut, reset: s.reset, beginSessionOpen: s.beginSessionOpen })));

    const [viewMode, setViewMode] = useState<ViewMode>(isLoggingOut ? 'HANDSHAKE' : 'INTRO');
    /**
     * The backdrop is expensive to spin up, so it does not run underneath the
     * boot screen for its whole length — the boot sequence flips this on as it
     * starts to dissolve, which leaves the canvas about a second to warm up
     * behind the veil before anyone sees it.
     */
    const [backdropLive, setBackdropLive] = useState(viewMode !== 'INTRO');

    // Login Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Handshake Animation State
    const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS);
    const [handshakeStage, setHandshakeStage] = useState<'CONNECTING' | 'VERIFYING' | 'GRANTED' | 'FAILED'>('CONNECTING');
    const [visiblePackets, setVisiblePackets] = useState<number[]>([]);
    const packetIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const failResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /**
     * Set on unmount. The handshake and logout chains are multi-second `await`
     * sequences; without this they keep running after the page is gone, and
     * `reset()` at the end of the logout chain would wipe the global store out
     * from under whatever mounted in its place.
     */
    const aliveRef = useRef(true);

    /** Sleep that reports whether the component is still mounted afterwards. */
    const wait = (ms: number) => new Promise<boolean>(r => setTimeout(() => r(aliveRef.current), ms));

    const serverHostname = useServerHostname();

    // Handshake presentation, derived once so the frame's header, rail, and
    // footer can never disagree about what stage the link is in.
    const terminating = isLoggingOut && handshakeStage === 'CONNECTING';
    const linkTitle =
        terminating ? 'TERMINATING SESSION' :
        handshakeStage === 'FAILED' ? 'LINK REJECTED' :
        handshakeStage === 'GRANTED' ? 'LINK ESTABLISHED' : 'ESTABLISHING UP-LINK';
    const linkBadge =
        terminating ? 'CLOSING' :
        handshakeStage === 'FAILED' ? 'DENIED' :
        handshakeStage === 'GRANTED' ? 'GRANTED' :
        handshakeStage === 'VERIFYING' ? 'VERIFYING' : 'DIALLING';
    const linkStatusLine =
        terminating ? 'SESSION CLOSING' :
        handshakeStage === 'FAILED' ? 'ACCESS DENIED' :
        handshakeStage === 'GRANTED' ? 'ACCESS GRANTED' :
        handshakeStage === 'VERIFYING' ? 'PERFORMING SECURITY CHECKS' : 'DIALLING NODE';
    const linkTone = handshakeStage === 'FAILED' || terminating ? 'text-red-400' : 'text-hud-trace';
    const linkBar = handshakeStage === 'FAILED' || terminating ? 'bg-red-400' : 'bg-hud-trace';
    const linkPercent =
        terminating ? '20%' :
        handshakeStage === 'FAILED' ? '45%' :
        handshakeStage === 'GRANTED' ? '100%' :
        handshakeStage === 'VERIFYING' ? '70%' : '25%';
    // A multi-step process has to say which step it is on, not just that it is busy.
    const checksDone = checks.filter(c => c.status === 'OK').length;
    const linkBusy = !terminating && handshakeStage !== 'GRANTED' && handshakeStage !== 'FAILED';

    // Clean up packetInterval on unmount
    useEffect(() => {
        return () => {
            aliveRef.current = false;
            if (packetIntervalRef.current) clearInterval(packetIntervalRef.current);
            if (failResetRef.current) clearTimeout(failResetRef.current);
        };
    }, []);

    useEffect(() => {
        if (isLoggingOut) {
            setHandshakeStage('GRANTED');
            runLogoutSequence();
        } else {
            setAppState('LOGIN');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggingOut]);

    const runLogoutSequence = async () => {
        if (!await wait(DELAY_LOGOUT_SHORT)) return;
        setHandshakeStage('VERIFYING');
        if (!await wait(DELAY_LOGOUT_MID)) return;
        setHandshakeStage('CONNECTING');
        if (!await wait(DELAY_LOGOUT_LONG)) return;
        setViewMode('LOGIN');
        reset();
    };

    // ---------------------------------------------------------------------------
    // HANDSHAKE FLOW
    // ---------------------------------------------------------------------------
    const startHandshake = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        playEnter();
        setLoginError(null);
        setViewMode('HANDSHAKE');
        setHandshakeStage('CONNECTING');
        setAppState('HANDSHAKE');

        const loginPromise = loginUser(username, password).catch(() => null);

        if (!await wait(DELAY_CONNECTING)) return;

        // Step 2: Start Checks
        setHandshakeStage('VERIFYING');

        const packetInterval = setInterval(() => {
            setVisiblePackets(prev => {
                if (prev.length < DASHBOARD_PRELOAD_DATA.length) return [...prev, prev.length];
                return prev;
            });
        }, DELAY_PACKET_TICK);
        packetIntervalRef.current = packetInterval;

        // Check 1: Server Connection
        setChecks(prev => prev.map((item, i) => i === 0 ? { ...item, status: 'CHECKING' } : item));
        if (!await wait(DELAY_CHECK_STEP)) return;
        setChecks(prev => prev.map((item, i) => i === 0 ? { ...item, status: 'OK' } : item));

        // Check 2: TLS
        setChecks(prev => prev.map((item, i) => i === 1 ? { ...item, status: 'CHECKING' } : item));
        if (!await wait(DELAY_CHECK_STEP)) return;
        setChecks(prev => prev.map((item, i) => i === 1 ? { ...item, status: 'OK' } : item));

        // Check 3: Credentials (real auth)
        setChecks(prev => prev.map((item, i) => i === 2 ? { ...item, status: 'CHECKING' } : item));

        try {
            const result = await loginPromise;

            if (result === LOGIN_TIMED_OUT) throw new Error('TIMEOUT');

            if (result && result.access_token) {
                setChecks(prev => prev.map((item, i) => i === 2 ? { ...item, status: 'OK' } : item));
                playAuthed();

                // Check 4: Establish session
                setChecks(prev => prev.map((item, i) => i === 3 ? { ...item, status: 'CHECKING' } : item));
                if (!await wait(DELAY_SESSION_SETUP)) return;
                setChecks(prev => prev.map((item, i) => i === 3 ? { ...item, status: 'OK' } : item));

                clearInterval(packetInterval);
                packetIntervalRef.current = null;
                setHandshakeStage('GRANTED');

                // The dashboard is code-split, so the route swap would
                // otherwise start with a chunk fetch and flash the Suspense
                // fallback straight after the welcome screen. Same module
                // specifier as App.tsx's lazy import, so this warms the very
                // chunk that route is about to ask for — and the welcome
                // screen gives it a couple of seconds to land.
                import('../Dashboard').catch(() => {
                    /* lazyRetry on the route handles a genuinely failed fetch */
                });

                try {
                    successfulLogin(result);
                } catch (e) {
                    console.error("Failed to update global state", e);
                }

                // user_id is stored separately for dashboard queries
                if (result.user_id) localStorage.setItem('user_id', String(result.user_id));

                setViewMode('TRANSITIONING');
            } else {
                throw new Error("Invalid Credentials");
            }
        } catch (error) {
            clearInterval(packetInterval);
            packetIntervalRef.current = null;
            const timedOut = (error as Error)?.message === 'TIMEOUT';
            setChecks(prev => prev.map((item, i) => i === 2 ? { ...item, status: 'FAIL' } : item));
            setHandshakeStage('FAILED');
            // A silent server and a rejected credential are different problems
            // and want different next actions from the operator.
            setLoginError(timedOut
                ? "NO RESPONSE FROM NODE — CHECK THE C2 IS REACHABLE"
                : "AUTHENTICATION FAILED — INVALID CREDENTIALS");

            failResetRef.current = setTimeout(() => {
                failResetRef.current = null;
                setViewMode('LOGIN');
                setChecks(INITIAL_CHECKS);
                setVisiblePackets([]);
                setIsSubmitting(false);
            }, DELAY_AUTH_FAIL_MSG);
            return;
        }
        setIsSubmitting(false);
    };

    return (
        <div className="min-h-screen w-full bg-void relative overflow-hidden text-signal font-mono">
            {/* Held outside the view switch on purpose: remounting it per view
                would restart the panel's scene clock and snap the acquisition
                mid-cycle. The same glass carries the operator from the form
                through the handshake. The wrapper only ever fades — the panel
                inside it is never remounted — so the glass arrives and leaves
                on a dissolve instead of appearing and vanishing in a frame. */}
            <AnimatePresence>
                {backdropLive && viewMode !== 'TRANSITIONING' && (
                    <motion.div
                        key="backdrop"
                        className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <LoginBackdrop />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">

                {/* ============================================================
                    VIEW 1: LOGIN FORM
                   ============================================================ */}
                {viewMode === 'LOGIN' && (
                    <motion.div
                        key="login-view"
                        // Settles in from slightly under size, because it most
                        // often enters underneath the boot veil clearing and a
                        // flat opacity ramp reads as a pop through it.
                        //
                        // Deliberately no blur on the way IN: a resting
                        // `filter`, even `blur(0px)`, makes this element a
                        // backdrop root, and the auth panel's `backdrop-blur`
                        // would then have nothing behind it to sample. Only the
                        // exit — which is leaving anyway — can afford one.
                        initial={{ opacity: 0, scale: 0.99 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
                        transition={{ duration: 0.55, ease: [0.22, 0.68, 0, 1] }}
                        className="relative w-full h-screen overflow-hidden"
                    >
                        {/* ── Screen-edge chrome, echoing the boot sequence ── */}
                        <div className="pointer-events-none absolute inset-0 hidden md:block">
                            <div className="absolute top-6 left-6 flex items-center gap-2.5">
                                <Shield size={14} strokeWidth={2} className="text-signal" />
                                <span className="text-[10px] font-bold tracking-[0.3em] text-signal">MINERVA C2</span>
                                <span className="text-[10px] tracking-[0.2em] text-signal opacity-70">OPERATOR CONSOLE</span>
                            </div>

                            <div className="absolute top-6 right-6 flex items-center gap-5">
                                <span className="text-[10px] font-bold tracking-[0.2em] text-signal truncate max-w-[22ch]">NODE {serverHostname}</span>
                                <ServerStatus />
                            </div>

                            <div className="absolute bottom-6 left-6 flex items-center gap-6 text-[10px] font-mono">
                                <span className="flex items-center gap-2">
                                    <Globe size={10} strokeWidth={2} className="text-signal" />
                                    <span className="text-signal opacity-70">PORT</span>
                                    <span className="font-bold text-signal tabular-nums">{CONN.port}</span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <Lock size={10} strokeWidth={2} className={CONN.secure ? 'text-hud-trace' : 'text-signal'} />
                                    <span className={cn('font-bold', CONN.secure ? 'text-hud-trace' : 'text-signal')}>
                                        {CONN.protocol}
                                    </span>
                                </span>
                            </div>

                            <div className="absolute bottom-6 right-6 flex items-center gap-6">
                                <LiveClock />
                                <span className="text-[10px] font-bold tracking-[0.2em] text-signal opacity-70">BUILD 2.2.1</span>
                            </div>
                        </div>

                        {/* ── Auth panel, docked right so the map node stays visible ── */}
                        <div className="relative z-10 h-full flex items-center justify-center lg:justify-end px-6 lg:pr-[8vw]">
                            <motion.div
                                // Lands just after the boot veil has cleared,
                                // so the panel is the first thing that moves on
                                // the uncovered console rather than something
                                // half-arrived behind it.
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.55, ease: [0.22, 0.68, 0, 1], delay: 0.22 }}
                                className="w-full max-w-[420px] border border-signal/20 bg-void/80 backdrop-blur-sm rounded-md"
                            >
                                {/* Panel header strip */}
                                <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-signal/15">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Fingerprint size={13} strokeWidth={2} className="text-hud-trace shrink-0" />
                                        <span className="text-[10px] font-bold tracking-[0.25em] text-signal truncate">
                                            SECURE TERMINAL
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold tracking-[0.2em] text-signal opacity-70 shrink-0">
                                        SL-8 01
                                    </span>
                                </div>

                                <div className="p-5 sm:p-6">
                                    <h1 className="text-2xl font-bold tracking-[0.15em] text-signal">IDENTIFY</h1>
                                    <p className="mt-1.5 text-[11px] tracking-[0.15em] text-signal opacity-70">
                                        OPERATOR AUTHENTICATION REQUIRED
                                    </p>

                                    {/* Status is edge chrome on desktop; inline on small screens */}
                                    <div className="md:hidden mt-4">
                                        <ServerStatus />
                                    </div>

                                    <AnimatePresence>
                                        {loginError && (
                                            <motion.div
                                                key="login-error"
                                                role="alert"
                                                id="login-error"
                                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                animate={{ opacity: 1, height: 'auto', marginTop: 20 }}
                                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="flex items-start gap-2 rounded-md border border-red-400/40 bg-red-400/[0.08] px-3 py-2.5">
                                                    <AlertTriangle size={13} strokeWidth={2} className="text-red-400 shrink-0 mt-px" />
                                                    <span className="text-[11px] text-red-400">{loginError}</span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <form onSubmit={startHandshake} className="mt-6 space-y-5">
                                        <div>
                                            <label
                                                htmlFor="operator-id"
                                                className="block mb-2 text-[10px] font-bold tracking-[0.25em] text-signal"
                                            >
                                                OPERATOR ID
                                            </label>
                                            <div className="relative">
                                                <span
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-signal opacity-70"
                                                >
                                                    {'>'}
                                                </span>
                                                <input
                                                    id="operator-id"
                                                    type="text"
                                                    value={username}
                                                    onChange={(e) => setUsername(e.target.value)}
                                                    required
                                                    autoFocus
                                                    autoComplete="username"
                                                    aria-invalid={!!loginError}
                                                    aria-describedby={loginError ? 'login-error' : undefined}
                                                    className="w-full min-h-[44px] rounded-md border border-signal/20 bg-black/40 pl-9 pr-3 py-2.5 text-sm tracking-[0.1em] text-signal transition-colors placeholder:text-signal/40 hover:border-signal/40 focus:border-hud-trace focus:outline-none focus-visible:ring-1 focus-visible:ring-hud-trace"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label
                                                htmlFor="passphrase"
                                                className="block mb-2 text-[10px] font-bold tracking-[0.25em] text-signal"
                                            >
                                                PASSPHRASE
                                            </label>
                                            <div className="relative">
                                                <Lock
                                                    size={13}
                                                    strokeWidth={2}
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-signal opacity-70"
                                                />
                                                <input
                                                    id="passphrase"
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    required
                                                    autoComplete="current-password"
                                                    aria-invalid={!!loginError}
                                                    aria-describedby={loginError ? 'login-error' : undefined}
                                                    className="w-full min-h-[44px] rounded-md border border-signal/20 bg-black/40 pl-9 pr-3 py-2.5 text-sm tracking-[0.1em] text-signal transition-colors placeholder:text-signal/40 hover:border-signal/40 focus:border-hud-trace focus:outline-none focus-visible:ring-1 focus-visible:ring-hud-trace"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className={cn(
                                                'group/btn relative flex w-full min-h-[48px] items-center justify-center gap-2.5',
                                                'rounded-md border text-[11px] font-bold tracking-[0.25em] transition-all duration-200',
                                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-hud-route focus-visible:ring-offset-2 focus-visible:ring-offset-void',
                                                isSubmitting
                                                    ? 'cursor-not-allowed border-signal/20 bg-transparent text-signal opacity-60'
                                                    : 'cursor-pointer border-hud-route bg-hud-route/[0.08] text-hud-route hover:bg-hud-route hover:text-void hover:shadow-[0_0_18px_rgba(255,201,46,0.25)]',
                                            )}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Activity size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                                                    AUTHENTICATING
                                                </>
                                            ) : (
                                                <>
                                                    INITIALIZE SESSION
                                                    <ChevronRight
                                                        size={13}
                                                        strokeWidth={2}
                                                        aria-hidden="true"
                                                        className="transition-transform duration-200 group-hover/btn:translate-x-1"
                                                    />
                                                </>
                                            )}
                                        </button>
                                    </form>
                                </div>

                                {/* Panel footer */}
                                <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-signal/15">
                                    <span className="text-[10px] tracking-[0.2em] text-signal opacity-70">
                                        AUTHORIZED OPERATORS ONLY
                                    </span>
                                    <span className="text-[10px] font-bold tracking-[0.2em] text-signal">
                                        {CONN.secure ? 'TLS 1.3' : 'PLAINTEXT'}
                                    </span>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}

                {/* ============================================================
                    VIEW 2: TRANSITION
                   ============================================================ */}
                {viewMode === 'TRANSITIONING' && (
                    <TransitionScreen
                        key="transitioning"
                        username={username}
                        onComplete={() => {
                            setAppState('DASHBOARD');
                            // Raise the curtain BEFORE navigating. `navigate`
                            // unmounts this whole route in the same commit, so
                            // nothing rendered here can cover the swap — the
                            // curtain lives above <Routes> and survives it.
                            beginSessionOpen();
                            navigate('/dashboard');
                        }}
                    />
                )}

                {/* ============================================================
                    VIEW 3: HANDSHAKE ANIMATION
                   ============================================================ */}
                {viewMode === 'HANDSHAKE' && (
                    <motion.div
                        key="handshake-view"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, filter: 'blur(6px)', scale: 0.98, transition: { duration: 0.25 } }}
                        transition={{ duration: 0.35 }}
                        className="relative w-full h-screen overflow-hidden"
                    >
                        {/* Same screen-edge chrome the form had, so the two views
                            read as one console rather than two screens. */}
                        <div className="pointer-events-none absolute inset-0 hidden md:block">
                            <div className="absolute top-6 left-6 flex items-center gap-2.5">
                                <Shield size={14} strokeWidth={2} className="text-signal" />
                                <span className="text-[10px] font-bold tracking-[0.3em] text-signal">MINERVA C2</span>
                                <span className="text-[10px] tracking-[0.2em] text-signal opacity-70">OPERATOR CONSOLE</span>
                            </div>
                            <div className="absolute top-6 right-6 flex items-center gap-5">
                                <span className="text-[10px] font-bold tracking-[0.2em] text-signal truncate max-w-[22ch]">
                                    NODE {serverHostname}
                                </span>
                                <ServerStatus />
                            </div>
                            <div className="absolute bottom-6 left-6 flex items-center gap-6 text-[10px] font-mono">
                                <span className="flex items-center gap-2">
                                    <Globe size={10} strokeWidth={2} className="text-signal" />
                                    <span className="text-signal opacity-70">PORT</span>
                                    <span className="font-bold text-signal tabular-nums">{CONN.port}</span>
                                </span>
                                <span className="flex items-center gap-2">
                                    <Lock size={10} strokeWidth={2} className={CONN.secure ? 'text-hud-trace' : 'text-signal'} />
                                    <span className={cn('font-bold', CONN.secure ? 'text-hud-trace' : 'text-signal')}>
                                        {CONN.protocol}
                                    </span>
                                </span>
                            </div>
                            <div className="absolute bottom-6 right-6 flex items-center gap-6">
                                <LiveClock />
                                <span className="text-[10px] font-bold tracking-[0.2em] text-signal opacity-70">BUILD 2.2.1</span>
                            </div>
                        </div>

                        {/* Link frame, docked where the form was so nothing jumps. */}
                        <div className="relative z-10 h-full flex items-center justify-center lg:justify-end px-6 lg:pr-[8vw]">
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, ease: [0.22, 0.68, 0, 1] }}
                                role="status"
                                aria-busy={linkBusy}
                                className="w-full max-w-[460px] border border-signal/20 bg-void/80 backdrop-blur-sm rounded-md"
                            >
                                <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-signal/15">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Fingerprint size={13} strokeWidth={2} className={cn('shrink-0', linkTone)} />
                                        <span className="text-[10px] font-bold tracking-[0.25em] text-signal truncate">
                                            {linkTitle}
                                        </span>
                                    </div>
                                    <span className={cn('text-[10px] font-bold tracking-[0.2em] shrink-0', linkTone)}>
                                        {linkBadge}
                                    </span>
                                </div>

                                <div className="p-5 sm:p-6">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-signal opacity-70 text-[10px] font-bold tracking-[0.25em]">OPERATOR</span>
                                        <span className="text-sm font-bold tracking-[0.15em] text-signal truncate">
                                            {username.toUpperCase() || 'UNKNOWN'}
                                        </span>
                                    </div>

                                    {/* Link rail — the boot sequence's progress strip. */}
                                    <div className="mt-4 flex items-baseline justify-between gap-3">
                                        <span className="text-[10px] font-bold tracking-[0.25em] text-signal opacity-70">LINK</span>
                                        <span className="text-[10px] font-bold tracking-[0.2em] text-signal tabular-nums">
                                            STEP {Math.min(checksDone + (linkBusy ? 1 : 0), checks.length)} / {checks.length}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 border border-signal/40 p-[2px] rounded-sm">
                                        <div className="relative h-[7px] overflow-hidden">
                                            <motion.div
                                                className={cn('absolute inset-y-0 left-0', linkBar)}
                                                initial={{ width: '0%' }}
                                                animate={{ width: linkPercent }}
                                                // Decelerating: the rail arrives at each
                                                // stage rather than running at a constant rate.
                                                transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
                                            />
                                        </div>
                                    </div>

                                    {/* Checks in the boot manifest's grammar: label,
                                        dotted leader, status. */}
                                    <ul className="mt-5 space-y-2" aria-live="polite">
                                        {checks.map((check, i) => (
                                            <motion.li
                                                key={check.id}
                                                initial={{ opacity: 0, x: -6 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.2, delay: i * 0.06 }}
                                                className="flex items-baseline gap-2 text-[11px]"
                                            >
                                                <span className="text-signal whitespace-nowrap">{check.label}</span>
                                                <span aria-hidden="true" className="flex-1 min-w-0 overflow-hidden text-signal opacity-25 tracking-[0.3em]">
                                                    ....................................................
                                                </span>
                                                <span className={cn(
                                                    'shrink-0 font-bold tracking-[0.15em]',
                                                    check.status === 'OK' && 'text-hud-trace',
                                                    check.status === 'CHECKING' && 'text-hud-route',
                                                    check.status === 'FAIL' && 'text-red-400',
                                                    check.status === 'PENDING' && 'text-signal opacity-40',
                                                )}>
                                                    {check.status === 'CHECKING' ? 'CHECKING'
                                                        : check.status === 'OK' ? 'OK'
                                                        : check.status === 'FAIL' ? 'FAILED' : 'PENDING'}
                                                </span>
                                            </motion.li>
                                        ))}
                                    </ul>

                                    {/* Preload stream, replacing the floating packets:
                                        same information, in the console's own voice. */}
                                    <div className="mt-5 h-[46px] overflow-hidden border-l border-signal/15 pl-3">
                                        <AnimatePresence initial={false}>
                                            {handshakeStage === 'VERIFYING' && visiblePackets.slice(-3).map(idx => {
                                                const text = DASHBOARD_PRELOAD_DATA[idx] ?? DASHBOARD_PRELOAD_DATA[0];
                                                return (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, y: 8 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.18 }}
                                                        className="flex items-center gap-2 text-[10px] tracking-[0.1em] text-hud-trace leading-[1.5]"
                                                    >
                                                        <span className="opacity-70">&rsaquo;</span>
                                                        {text}
                                                    </motion.div>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-signal/15">
                                    <span className={cn('text-[10px] font-bold tracking-[0.2em]', linkTone)}>
                                        {linkStatusLine}
                                    </span>
                                    <span className="text-[10px] tracking-[0.2em] text-signal opacity-70">
                                        {CONN.secure ? 'TLS 1.3' : 'PLAINTEXT'}
                                    </span>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ============================================================
                VIEW 0: INTRO SEQUENCE

                Deliberately NOT part of the view switch above. That switch is
                `mode="wait"`, which forbids overlap — the boot screen would
                have to be gone before the login form was allowed to start,
                which is exactly the cut this sits outside of. Here the veil
                fades out over the same frames the console fades in, and its
                own z-50 keeps it on top for the crossover.
               ============================================================ */}
            <AnimatePresence>
                {viewMode === 'INTRO' && (
                    <IntroSequence
                        key="intro"
                        onDissolve={() => setBackdropLive(true)}
                        onComplete={() => setViewMode('LOGIN')}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}


