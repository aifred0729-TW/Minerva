import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Shield, Server, Check, Laptop, Activity, Database, Layers, Box, AlertTriangle, Clock, Globe, Fingerprint, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { loginUser } from '../lib/api';
import { successfulLogin } from '../lib/auth';
import { playEnter, playAuthed } from '../lib/soundEffects';
import type { ViewMode, CheckItem } from '../types/login';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_CHECKS: CheckItem[] = [
  { id: 'conn', label: 'SERVER_CONNECTION', status: 'PENDING' },
  { id: 'tls', label: 'TLS_HANDSHAKE', status: 'PENDING' },
  { id: 'auth', label: 'VERIFYING_CREDENTIALS', status: 'PENDING' },
  { id: 'session', label: 'ESTABLISHING_SESSION', status: 'PENDING' },
];

const DASHBOARD_PRELOAD_DATA = [
    { icon: <Activity size={14} />, text: "SYNCING_CALLBACKS..." },
    { icon: <Box size={14} />, text: "LOADING_PAYLOADS..." },
    { icon: <Layers size={14} />, text: "FETCHING_OPERATIONS..." },
    { icon: <Database size={14} />, text: "UPDATING_ARTIFACTS..." },
];

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function getConnectionInfo() {
    const loc = window.location;
    return {
        hostname: loc.hostname || '127.0.0.1',
        port: loc.port || (loc.protocol === 'https:' ? '443' : '80'),
        protocol: loc.protocol === 'https:' ? 'HTTPS' : 'HTTP',
        secure: loc.protocol === 'https:',
    };
}

// -----------------------------------------------------------------------------
// INTRO SEQUENCE
// -----------------------------------------------------------------------------

const IntroSequence = ({ onComplete }: { onComplete: () => void }) => {
    const [loadingPercent, setLoadingPercent] = useState(0);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);

    const terminalDataPool = [
        "INIT: Loading Minerva core modules...",
        "0x00000000: KERNEL_CHECK .................. OK",
        "0x00010000: MEM_ALLOCATION 4096KB ......... OK",
        "0x00180808: DEVICE_ENUM ................... OK",
        "0x00240000: NET_INTERFACE ................. UP",
        "0x00340000: CRYPTO_MODULE AES-256-GCM ..... READY",
        "LINK: Establishing secure tunnel...",
        "0x00400000: TLS_HANDSHAKE v1.3 ............ OK",
        "0x00480000: CERT_VERIFY ................... PASS",
        "0x00500000: KEY_EXCHANGE ECDHE ............ OK",
        "CORE: Loading C2 framework...",
        "0x00600000: AUTH_MODULE ................... READY",
        "0x00700000: CALLBACK_ENGINE ............... INIT",
        "0x00800000: PAYLOAD_REGISTRY .............. SYNC",
        "0x00900000: OPERATION_MANAGER ............. READY",
        "0x00A00000: TASK_SCHEDULER ................ READY",
        "0x00B00000: ARTIFACT_STORE ................ OK",
        "DATA: Synchronizing remote assets...",
        "0x00C00000: CACHE_PRELOAD 2048KB .......... OK",
        "0x00D00000: EVENT_BUS ..................... OK",
        "0x00E00000: STREAM_READY .................. OK",
        "SYS: Finalizing boot sequence...",
        "0x00F00000: WATCHDOG_TIMER ................ SET",
        "BOOT: All systems nominal. Awaiting operator."
    ];

    useEffect(() => {
        const loadInterval = setInterval(() => {
            setLoadingPercent(prev => {
                if (prev >= 100) { clearInterval(loadInterval); return 100; }
                const increment = prev < 50 ? 3 : prev < 80 ? 2 : 1;
                return Math.min(prev + increment, 100);
            });
        }, 40);

        let lineIndex = 0;
        const terminalInterval = setInterval(() => {
            if (lineIndex < terminalDataPool.length) {
                setTerminalLines(prev => [...prev, terminalDataPool[lineIndex]].slice(-4));
                lineIndex++;
            }
        }, 80);

        const completeTimer = setTimeout(onComplete, 3000);

        return () => {
            clearInterval(loadInterval);
            clearInterval(terminalInterval);
            clearTimeout(completeTimer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black text-white font-mono flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col items-center justify-center px-8">
                {/* Minerva Logo Mark */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-6"
                >
                    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-white">
                        <path d="M28 4 L52 48 L4 48 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="miter" />
                        <path d="M28 12 L46 44 L10 44 Z" stroke="currentColor" strokeWidth="0.5" fill="none" strokeLinejoin="miter" opacity="0.4" />
                        <path d="M28 22 L28 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
                        <path d="M28 38 L30 40 L28 42 L26 40 Z" fill="currentColor" />
                    </svg>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-[10px] tracking-[0.4em] font-bold mb-8"
                >
                    MINERVA C2 — INITIALIZING
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scaleY: 0.8 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="w-full max-w-lg"
                >
                    <div className="border border-white/60 inline-block px-3 py-1 text-[9px] tracking-wider font-bold mb-3">
                        SECURE LINK ESTABLISHED
                    </div>

                    <div className="text-[8px] text-gray-400 mb-4 h-16 overflow-hidden font-mono bg-black/50 border border-white/10 p-2">
                        {terminalLines.map((line, i) => (
                            <motion.div
                                key={`${i}-${line}`}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.05 }}
                                className="truncate leading-tight"
                            >
                                <span className="text-gray-600">&gt;</span> {line}
                            </motion.div>
                        ))}
                    </div>

                    <div className="border border-white flex items-stretch h-8 relative bg-black">
                        <div className="border-r border-white px-2 flex items-center gap-2 text-[8px] bg-black z-10">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                            <span className="text-gray-400">SYS:ACTIVE</span>
                        </div>
                        <div className="flex-1 relative overflow-hidden">
                            <motion.div
                                className="absolute inset-0 bg-white origin-left"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: loadingPercent / 100 }}
                                transition={{ ease: "linear" }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference z-10">
                                <span className="text-xs font-bold tracking-[0.3em]">
                                    LOADING {loadingPercent}%
                                </span>
                            </div>
                        </div>
                        <div className="border-l border-white px-3 flex flex-col justify-center text-[8px] bg-black z-10 text-right">
                            <div>MINERVA</div>
                            <div className="text-gray-500">C2 FRAMEWORK</div>
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className="p-6 w-full flex justify-between items-end text-[10px] font-bold tracking-widest uppercase">
                <div className="text-gray-500">MINERVA COMMAND & CONTROL</div>
                <div className="text-white">BOOT SEQUENCE</div>
                <div className="text-right text-gray-500">
                    <span>{getConnectionInfo().protocol}</span>
                    <span className="ml-8">{getConnectionInfo().hostname}</span>
                </div>
            </div>
        </div>
    );
};

// -----------------------------------------------------------------------------
// TRANSITION SCREEN
// -----------------------------------------------------------------------------

const TransitionScreen = ({ username, onComplete }: { username: string; onComplete: () => void }) => {
    const [compressing, setCompressing] = useState(false);

    useEffect(() => {
        const compressTimer = setTimeout(() => setCompressing(true), 1900);
        const navTimer = setTimeout(onComplete, 2250);
        return () => { clearTimeout(compressTimer); clearTimeout(navTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <motion.div
            key="transition-screen"
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 4px)' }}
            />
            <motion.div
                className="absolute inset-0 bg-signal pointer-events-none"
                initial={{ opacity: 0.45 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            />
            <motion.div
                className="relative z-10 w-full flex items-center justify-center"
                animate={compressing ? { scaleY: 0 } : { scaleY: 1 }}
                transition={compressing ? { duration: 0.22, ease: [0.76, 0, 0.24, 1] } : {}}
                style={{ transformOrigin: 'center center' }}
            >
                <div className="text-center font-mono select-none">
                    <motion.div
                        initial={{ opacity: 0, letterSpacing: '0.1em' }}
                        animate={{ opacity: 1, letterSpacing: '0.55em' }}
                        transition={{ delay: 0.25, duration: 0.7, ease: 'easeOut' }}
                        className="text-[9px] text-signal/50 uppercase mb-5"
                    >
                        SYSTEM ACCESS CONFIRMED
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.82, filter: 'blur(12px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        className="text-[52px] leading-none font-bold tracking-[0.25em] text-signal mb-4"
                    >
                        Minerva
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.45 }}
                        transition={{ delay: 0.75, duration: 0.4 }}
                        className="text-[11px] tracking-[0.35em] text-signal mb-8"
                    >
                        {username.toUpperCase() || 'OPERATOR'}
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.65, duration: 0.2 }}
                        className="mx-auto w-72 h-px bg-white/10 relative overflow-hidden mb-4"
                    >
                        <motion.div
                            className="absolute inset-y-0 left-0 bg-signal"
                            style={{ boxShadow: '0 0 8px rgba(34,197,94,0.8)' }}
                            initial={{ width: '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ delay: 0.75, duration: 1.0, ease: [0.4, 0, 0.2, 1] }}
                        />
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.0, duration: 0.3 }}
                        className="text-[9px] tracking-[0.35em] text-signal/30 animate-pulse"
                    >
                        INITIALIZING_DASHBOARD...
                    </motion.div>
                </div>
            </motion.div>
            <AnimatePresence>
                {compressing && (
                    <motion.div
                        className="absolute left-0 right-0 h-px bg-signal"
                        style={{ boxShadow: '0 0 16px 3px rgba(34,197,94,0.9)', top: '50%' }}
                        initial={{ opacity: 1, scaleX: 1 }}
                        animate={{ opacity: 0, scaleX: 0.3 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// -----------------------------------------------------------------------------
// LIVE CLOCK
// -----------------------------------------------------------------------------

const LiveClock = () => {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const time = now.toLocaleTimeString('en-GB', { hour12: false });
    return (
        <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12} />
            <span className="font-mono">{date}</span>
            <span className="font-mono text-signal">{time}</span>
        </div>
    );
};

// -----------------------------------------------------------------------------
// SERVER STATUS INDICATOR (real ping)
// -----------------------------------------------------------------------------

const ServerStatus = () => {
    const [status, setStatus] = useState<'CHECKING' | 'ONLINE' | 'OFFLINE'>('CHECKING');
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const start = performance.now();
            try {
                await fetch('/api/v1.0/health', { method: 'GET', signal: controller.signal });
                clearTimeout(timeout);
                const elapsed = Math.round(performance.now() - start);
                if (mounted) { setStatus('ONLINE'); setLatency(elapsed); }
            } catch {
                clearTimeout(timeout);
                // Fallback: try the auth endpoint
                const controller2 = new AbortController();
                const timeout2 = setTimeout(() => controller2.abort(), 5000);
                try {
                    const start2 = performance.now();
                    await fetch('/auth', { method: 'OPTIONS', signal: controller2.signal });
                    clearTimeout(timeout2);
                    const elapsed2 = Math.round(performance.now() - start2);
                    if (mounted) { setStatus('ONLINE'); setLatency(elapsed2); }
                } catch {
                    clearTimeout(timeout2);
                    if (mounted) setStatus('OFFLINE');
                }
            }
        };
        check();
        const id = setInterval(check, 30000);
        return () => { mounted = false; clearInterval(id); };
    }, []);

    return (
        <div className="flex items-center gap-3">
            <div className={cn(
                "w-2 h-2 rounded-full",
                status === 'ONLINE' && "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]",
                status === 'OFFLINE' && "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
                status === 'CHECKING' && "bg-yellow-500 animate-pulse",
            )} />
            <span className={cn(
                "text-xs font-mono tracking-wider",
                status === 'ONLINE' && "text-green-500",
                status === 'OFFLINE' && "text-red-500",
                status === 'CHECKING' && "text-yellow-500",
            )}>
                {status === 'CHECKING' ? 'CHECKING...' : status}
            </span>
            {latency !== null && status === 'ONLINE' && (
                <span className="text-[10px] text-gray-500 font-mono">{latency}ms</span>
            )}
        </div>
    );
};

// =============================================================================
// MAIN LOGIN COMPONENT
// =============================================================================

export default function Login() {
    const navigate = useNavigate();
    const { setAppState, __appState, isLoggingOut, reset } = useAppStore();

    const [viewMode, setViewMode] = useState<ViewMode>(isLoggingOut ? 'HANDSHAKE' : 'INTRO');

    // Login Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Handshake Animation State
    const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS);
    const [handshakeStage, setHandshakeStage] = useState<'CONNECTING' | 'VERIFYING' | 'GRANTED' | 'FAILED'>('CONNECTING');
    const [visiblePackets, setVisiblePackets] = useState<number[]>([]);

    const connInfo = getConnectionInfo();

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
        await new Promise(r => setTimeout(r, 500));
        setHandshakeStage('VERIFYING');
        await new Promise(r => setTimeout(r, 800));
        setHandshakeStage('CONNECTING');
        await new Promise(r => setTimeout(r, 1500));
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

        // Step 1: Connecting Animation
        await new Promise(r => setTimeout(r, 1000));

        // Step 2: Start Checks
        setHandshakeStage('VERIFYING');

        const packetInterval = setInterval(() => {
            setVisiblePackets(prev => {
                if (prev.length < DASHBOARD_PRELOAD_DATA.length) return [...prev, prev.length];
                return prev;
            });
        }, 800);

        // Check 1: Server Connection
        setChecks(prev => prev.map((item, i) => i === 0 ? { ...item, status: 'CHECKING' } : item));
        await new Promise(r => setTimeout(r, 400));
        setChecks(prev => prev.map((item, i) => i === 0 ? { ...item, status: 'OK' } : item));

        // Check 2: TLS
        setChecks(prev => prev.map((item, i) => i === 1 ? { ...item, status: 'CHECKING' } : item));
        await new Promise(r => setTimeout(r, 400));
        setChecks(prev => prev.map((item, i) => i === 1 ? { ...item, status: 'OK' } : item));

        // Check 3: Credentials (real auth)
        setChecks(prev => prev.map((item, i) => i === 2 ? { ...item, status: 'CHECKING' } : item));

        try {
            const result = await loginPromise;

            if (result && result.access_token) {
                setChecks(prev => prev.map((item, i) => i === 2 ? { ...item, status: 'OK' } : item));
                const __authedSoundPromise = playAuthed();

                // Check 4: Establish session
                setChecks(prev => prev.map((item, i) => i === 3 ? { ...item, status: 'CHECKING' } : item));
                await new Promise(r => setTimeout(r, 300));
                setChecks(prev => prev.map((item, i) => i === 3 ? { ...item, status: 'OK' } : item));

                clearInterval(packetInterval);
                setHandshakeStage('GRANTED');

                try {
                    successfulLogin(result);
                } catch (e) {
                    console.error("Failed to update global state", e);
                }

                localStorage.setItem('access_token', result.access_token);
                if (result.user_id) localStorage.setItem('user_id', String(result.user_id));

                setViewMode('TRANSITIONING');
            } else {
                throw new Error("Invalid Credentials");
            }
        } catch (error) {
            clearInterval(packetInterval);
            setChecks(prev => prev.map((item, i) => i === 2 ? { ...item, status: 'FAIL' } : item));
            setHandshakeStage('FAILED');
            setLoginError("AUTHENTICATION FAILED — INVALID CREDENTIALS");

            setTimeout(() => {
                setViewMode('LOGIN');
                setChecks(INITIAL_CHECKS);
                setVisiblePackets([]);
                setIsSubmitting(false);
            }, 2000);
            return;
        }
        setIsSubmitting(false);
    };

    return (
        <div className="min-h-screen w-full bg-void relative overflow-hidden text-signal font-mono">
            <AnimatePresence mode="wait">

                {/* ============================================================
                    VIEW 0: INTRO SEQUENCE
                   ============================================================ */}
                {viewMode === 'INTRO' && (
                    <IntroSequence key="intro" onComplete={() => setViewMode('LOGIN')} />
                )}

                {/* ============================================================
                    VIEW 1: LOGIN FORM
                   ============================================================ */}
                {viewMode === 'LOGIN' && (
                    <motion.div
                        key="login-view"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                        transition={{ duration: 0.5 }}
                        className="flex w-full h-screen"
                    >
                        {/* LEFT PANEL: Minerva C2 Identity & Connection Info */}
                        <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 border-r border-ghost/30 relative bg-void">
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>

                            {/* Top: Brand */}
                            <div>
                                <div className="flex items-center gap-3 mb-6">
                                    <Shield size={18} className="text-signal" />
                                    <span className="font-mono text-signal tracking-[0.3em] text-sm">MINERVA C2</span>
                                </div>
                                <h2 className="text-6xl font-bold text-gray-100 opacity-20 select-none tracking-tighter">
                                    MINERVA<br />SYSTEM
                                </h2>
                            </div>

                            {/* Center: Connection Details */}
                            <div className="flex-1 flex flex-col justify-center gap-6">
                                {/* Server Status */}
                                <div className="border border-ghost/50 p-5 relative overflow-hidden">
                                    <div className="text-[10px] tracking-[0.3em] text-gray-500 mb-3 uppercase">Server Status</div>
                                    <ServerStatus />
                                </div>

                                {/* Connection Info Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="border border-ghost/50 p-4">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500 mb-2 flex items-center gap-2">
                                            <Globe size={10} />
                                            HOST
                                        </div>
                                        <div className="text-sm text-signal font-mono truncate">{connInfo.hostname}</div>
                                    </div>
                                    <div className="border border-ghost/50 p-4">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500 mb-2 flex items-center gap-2">
                                            <ChevronRight size={10} />
                                            PORT
                                        </div>
                                        <div className="text-sm text-signal font-mono">{connInfo.port}</div>
                                    </div>
                                    <div className="border border-ghost/50 p-4">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500 mb-2 flex items-center gap-2">
                                            <Lock size={10} />
                                            PROTOCOL
                                        </div>
                                        <div className={cn(
                                            "text-sm font-mono",
                                            connInfo.secure ? "text-green-500" : "text-yellow-500"
                                        )}>
                                            {connInfo.protocol}
                                            {connInfo.secure && <span className="text-[9px] ml-2 text-gray-500">ENCRYPTED</span>}
                                        </div>
                                    </div>
                                    <div className="border border-ghost/50 p-4">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500 mb-2 flex items-center gap-2">
                                            <Clock size={10} />
                                            LOCAL TIME
                                        </div>
                                        <LiveClock />
                                    </div>
                                </div>

                                {/* Session Info */}
                                <div className="border-l-2 border-ghost/30 pl-4 space-y-2">
                                    <div className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Session</div>
                                    <div className="text-xs text-gray-400 font-mono">
                                        <span className="text-gray-500">STATUS:</span> AWAITING AUTHENTICATION
                                    </div>
                                    <div className="text-xs text-gray-400 font-mono">
                                        <span className="text-gray-500">TOKEN:</span> —
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="font-mono text-[10px] text-gray-500 flex justify-between uppercase">
                                <span>Minerva C2 Framework</span>
                                <span>{connInfo.protocol} · Port {connInfo.port}</span>
                            </div>
                        </div>

                        {/* RIGHT PANEL: Login Form */}
                        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                                className="w-full max-w-md"
                            >
                                <div className="mb-12">
                                    <div className="inline-block p-3 border border-signal rounded-full mb-6">
                                        <Fingerprint size={32} className="text-signal" />
                                    </div>
                                    <h1 className="text-4xl font-bold tracking-[0.2em] text-signal mb-2">IDENTIFY</h1>
                                    <p className="text-gray-400 font-mono text-sm tracking-widest">OPERATOR AUTHENTICATION REQUIRED</p>

                                    {/* Mobile-only: show connection info */}
                                    <div className="lg:hidden mt-4 flex items-center gap-4 text-xs text-gray-500 font-mono">
                                        <ServerStatus />
                                    </div>
                                </div>

                                {loginError && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mb-6 p-3 border border-red-500/50 bg-red-500/10 text-red-400 text-xs font-mono flex items-center gap-2"
                                    >
                                        <AlertTriangle size={14} />
                                        {loginError}
                                    </motion.div>
                                )}

                                <form onSubmit={startHandshake} className="space-y-8">
                                    <div className="space-y-6">
                                        <div className="relative group/input">
                                            <input
                                                type="text"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                required
                                                autoFocus
                                                autoComplete="username"
                                                className="w-full bg-transparent border-b border-ghost py-3 text-signal focus:border-signal focus:outline-none transition-colors font-mono tracking-wider pl-8 text-lg"
                                                placeholder="OPERATOR_ID"
                                            />
                                            <span className="absolute left-0 top-3 text-gray-400 group-focus-within/input:text-signal transition-colors">{'>'}</span>
                                        </div>
                                        <div className="relative group/input">
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                autoComplete="current-password"
                                                className="w-full bg-transparent border-b border-ghost py-3 text-signal focus:border-signal focus:outline-none transition-colors font-mono tracking-wider pl-8 text-lg"
                                                placeholder="PASSPHRASE"
                                            />
                                            <Lock size={16} className="absolute left-0 top-4 text-gray-400 group-focus-within/input:text-signal transition-colors" />
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={cn(
                                            "w-full bg-signal text-void font-bold py-4 border border-transparent font-mono tracking-widest relative overflow-hidden group/btn text-sm transition-all duration-300",
                                            isSubmitting
                                                ? "opacity-50 cursor-not-allowed"
                                                : "hover:bg-void hover:text-signal hover:border-signal"
                                        )}
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-2">
                                            {isSubmitting ? 'AUTHENTICATING...' : 'INITIALIZE_SESSION'}
                                        </span>
                                        {!isSubmitting && (
                                            <div className="absolute inset-0 bg-white transform translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 z-0"></div>
                                        )}
                                    </button>
                                </form>

                                {/* Footer hint */}
                                <div className="mt-8 text-center text-[10px] text-gray-600 font-mono tracking-wider">
                                    MINERVA C2 — AUTHORIZED OPERATORS ONLY
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
                        exit={{ opacity: 0, filter: 'blur(6px)', scale: 0.97, transition: { duration: 0.25 } }}
                        transition={{ duration: 1 }}
                        className="flex w-full h-screen relative"
                    >
                        {/* LEFT: Server Node */}
                        <div className="hidden lg:flex flex-col justify-center items-center w-1/2 relative z-10">
                            <motion.div
                                animate={{ y: (handshakeStage === 'VERIFYING' || handshakeStage === 'GRANTED' || handshakeStage === 'FAILED') ? -60 : 0 }}
                                transition={{ duration: 0.8, ease: "easeInOut" }}
                                className="relative z-20 flex flex-col items-center gap-6"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                    className={cn(
                                        "w-24 h-24 border rounded-full flex items-center justify-center bg-void relative transition-colors duration-500",
                                        handshakeStage === 'FAILED' ? "border-red-500" : "border-ghost/50"
                                    )}
                                >
                                    <Server size={40} className={handshakeStage === 'FAILED' ? "text-red-500" : "text-signal"} />
                                    {handshakeStage === 'VERIFYING' && (
                                        <motion.div
                                            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                                            transition={{ repeat: Infinity, duration: 2 }}
                                            className="absolute inset-0 border border-signal rounded-full"
                                        />
                                    )}
                                </motion.div>
                                <div className="text-center">
                                    <h2 className="text-xl font-bold tracking-widest">MINERVA_CORE</h2>
                                    <p className={cn(
                                        "text-xs mt-1 transition-colors duration-300",
                                        isLoggingOut && handshakeStage === 'CONNECTING' ? "text-red-500 animate-pulse" :
                                        handshakeStage === 'FAILED' ? "text-red-500" : "text-green-500"
                                    )}>
                                        {isLoggingOut && handshakeStage === 'CONNECTING' ? 'STATUS: TERMINATING SESSION' :
                                         handshakeStage === 'FAILED' ? 'STATUS: ACCESS DENIED' : 'STATUS: ONLINE'}
                                    </p>
                                </div>

                                {/* Check List */}
                                <AnimatePresence>
                                    {(handshakeStage === 'VERIFYING' || handshakeStage === 'GRANTED' || handshakeStage === 'FAILED') && !isLoggingOut && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            transition={{ duration: 0.5, delay: 0.2 }}
                                            className="absolute top-full mt-8 w-64 space-y-3 bg-void/90 p-4 border border-ghost/30 backdrop-blur-md"
                                        >
                                            {checks.map((check) => (
                                                <div key={check.id} className="flex items-center justify-between text-xs">
                                                    <span className={cn(
                                                        check.status === 'OK' ? "text-signal" : "text-gray-400",
                                                        check.status === 'CHECKING' && "animate-pulse text-signal",
                                                        check.status === 'FAIL' && "text-red-500 font-bold"
                                                    )}>
                                                        {check.label}
                                                    </span>
                                                    {check.status === 'CHECKING' && <Activity size={12} className="animate-spin text-signal" />}
                                                    {check.status === 'OK' && <Check size={12} className="text-green-500" />}
                                                    {check.status === 'FAIL' && <span className="text-red-500 text-[10px]">FAILED</span>}
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </div>

                        {/* CONNECTION LINE & FLOATING DATA */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[2px] z-0 pointer-events-none hidden lg:block">
                            <div className="w-full h-full bg-ghost/20"></div>
                            <motion.div
                                initial={{ width: 0, right: 0, left: "auto" }}
                                animate={{
                                    width: (handshakeStage === 'GRANTED' && !isLoggingOut) ? 0 :
                                           (handshakeStage === 'CONNECTING' && isLoggingOut) ? 0 :
                                           (handshakeStage === 'FAILED') ? "50%" : "100%",
                                    right: 0,
                                    left: "auto",
                                    opacity: (handshakeStage === 'GRANTED' && !isLoggingOut) ? 0 :
                                             (handshakeStage === 'FAILED') ? 0.5 : 1
                                }}
                                transition={{ duration: 1.5, ease: "easeInOut" }}
                                className={cn(
                                    "absolute top-0 h-full shadow-[0_0_10px_rgba(255,255,255,0.8)]",
                                    handshakeStage === 'FAILED' ? "bg-red-500" : "bg-signal"
                                )}
                            />

                            {/* Floating Data Packets */}
                            <AnimatePresence>
                                {handshakeStage === 'VERIFYING' && visiblePackets.map((idx) => {
                                    const data = DASHBOARD_PRELOAD_DATA[idx] || DASHBOARD_PRELOAD_DATA[0];
                                    const randomY = (idx % 2 === 0 ? -40 : 40) + (Math.random() * 20 - 10);
                                    return (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: "100%", y: randomY }}
                                            animate={{ opacity: [0, 1, 1, 0], x: "0%" }}
                                            transition={{ duration: 2, ease: "linear" }}
                                            className="absolute top-0 right-0 flex items-center gap-2 text-[10px] text-signal font-mono bg-void/80 px-2 py-1 border border-ghost/50 whitespace-nowrap"
                                            style={{ top: "50%", marginTop: -15 }}
                                        >
                                            {data.icon}
                                            {data.text}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>

                        {/* RIGHT: Client Node */}
                        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 relative z-10">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                                className="w-24 h-24 border border-ghost/50 rounded-full flex items-center justify-center bg-void mb-6"
                            >
                                <Laptop size={40} className="text-signal" />
                            </motion.div>
                            <div className="text-center">
                                <h2 className="text-xl font-bold tracking-widest">OPERATOR_NODE</h2>
                                <div className="text-xs text-gray-400 mt-2 space-y-1">
                                    <p>HOST: {connInfo.hostname}</p>
                                    <p>USER: {username.toUpperCase() || 'UNKNOWN'}</p>
                                </div>
                            </div>
                            <div className="mt-12 font-mono text-sm text-signal animate-pulse">
                                {handshakeStage === 'CONNECTING' && !isLoggingOut && 'ESTABLISHING UP-LINK...'}
                                {handshakeStage === 'CONNECTING' && isLoggingOut && 'TERMINATING SESSION...'}
                                {handshakeStage === 'VERIFYING' && 'PERFORMING SECURITY CHECKS...'}
                                {handshakeStage === 'GRANTED' && !isLoggingOut && 'ACCESS GRANTED'}
                                {handshakeStage === 'FAILED' && <span className="text-red-500">ACCESS DENIED</span>}
                            </div>

                            {/* Mobile: show checks inline */}
                            <div className="lg:hidden mt-8">
                                {(handshakeStage === 'VERIFYING' || handshakeStage === 'GRANTED' || handshakeStage === 'FAILED') && !isLoggingOut && (
                                    <div className="w-64 space-y-3 bg-void/90 p-4 border border-ghost/30">
                                        {checks.map((check) => (
                                            <div key={check.id} className="flex items-center justify-between text-xs">
                                                <span className={cn(
                                                    check.status === 'OK' ? "text-signal" : "text-gray-400",
                                                    check.status === 'CHECKING' && "animate-pulse text-signal",
                                                    check.status === 'FAIL' && "text-red-500 font-bold"
                                                )}>
                                                    {check.label}
                                                </span>
                                                {check.status === 'CHECKING' && <Activity size={12} className="animate-spin text-signal" />}
                                                {check.status === 'OK' && <Check size={12} className="text-green-500" />}
                                                {check.status === 'FAIL' && <span className="text-red-500 text-[10px]">FAILED</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
