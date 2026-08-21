import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { CONN, typeOut } from './connection';
import {
    BOOT_LINK_TICK_MS, BOOT_LOADED_HOLD_MS, BOOT_COMPUTE_TICK_MS,
    BOOT_COMPUTE_HOLD_MS, BOOT_DISSOLVE_MS, BOOT_EXIT_MS,
} from './timings';

const BOOT_SYMBOLS = [
    'callbackEngine', 'payloadRegistry', 'operationMgr', 'taskScheduler',
    'artifactStore', 'cryptoModule', 'eventBus', 'streamReady',
    'netInterface', 'authModule', 'memAllocator', 'deviceEnum',
    'tlsHandshake', 'keyExchange', 'certVerify', 'cachePreload',
    'watchdogTimer', 'sessionVault',
];

const BOOT_HEADER_LOADING = 'MINERVA LINK CONNECTED';
const BOOT_HEADER_LOADED  = 'CONNECTING';

const toHex = (n: number, width: number) =>
    (n >>> 0).toString(16).toUpperCase().padStart(width, '0');

/** One row of the micro boot log — decorative texture, mirrors a memory map dump. */
function makeBootRow(seed: number) {
    const base = 0x00040000 + seed * 0x1a40;
    return {
        id: seed,
        addr: toHex(0x10 + seed * 0x40, 8),
        sym: BOOT_SYMBOLS[seed % BOOT_SYMBOLS.length],
        from: toHex(base, 7),
        to: toHex(base + 0x7c8, 7),
        size: ((seed * 7) % 90 + 10).toString(),
    };
}

/** Subsystem manifest checked off during the COMPUTING act. */
const BOOT_MANIFEST: { group: string; items: string[] }[] = [
    { group: 'C2 CORE',          items: ['MYTHIC API GATEWAY', 'GRAPHQL STREAM', 'EVENT FEED'] },
    { group: 'PAYLOAD PIPELINE', items: ['PAYLOAD REGISTRY', 'BUILD WORKERS', 'MSF BRIDGE'] },
    { group: 'TRANSPORT',        items: ['HTTP PROFILE', 'WEBSOCKET PROFILE', 'SOCKS RELAY', 'DYNAMIC PORT BROKER', 'TUNNEL SUPERVISOR'] },
    { group: 'ARTIFACT STORE',   items: [] },
    { group: 'CALLBACK ENGINE',  items: ['LIVENESS MONITOR'] },
    { group: 'OPERATIONS',       items: ['TASK SCHEDULER'] },
];

/** Same manifest with a running item index, so reveal/ready windows stagger across groups. */
const BOOT_MANIFEST_INDEXED = (() => {
    let n = 0;
    return BOOT_MANIFEST.map(g => ({
        group: g.group,
        items: g.items.map(label => ({ label, idx: n++ })),
    }));
})();



type BootPhase = 'link' | 'loaded' | 'compute' | 'dissolve';

/**
 * `onDissolve` fires when the boot enters its last act — roughly a second
 * before the veil is gone. That is the parent's cue to mount the login
 * backdrop, so the tactical panel is already live and painting by the time it
 * is uncovered instead of snapping into existence at the handoff.
 */
const IntroSequence = ({ onComplete, onDissolve }: { onComplete: () => void; onDissolve?: () => void }) => {
    const [phase, setPhase] = useState<BootPhase>('link');
    const [loadingPercent, setLoadingPercent] = useState(0);
    const [computePercent, setComputePercent] = useState(0);
    const [bootRows, setBootRows] = useState<ReturnType<typeof makeBootRow>[]>([]);
    const [dotCount, setDotCount] = useState(0);
    const [rtt, setRtt] = useState(4.7);

    const loaded = phase !== 'link';
    const showPanel = phase === 'compute' || phase === 'dissolve';
    const dissolving = phase === 'dissolve';
    // Header label types itself in over the first quarter of the load.
    const typedRatio = Math.min(1, loadingPercent / 25);
    const header = loaded ? BOOT_HEADER_LOADED : BOOT_HEADER_LOADING;

    // ── Act 1: LINK — count 0→100 while the micro log churns ──
    useEffect(() => {
        const loadInterval = setInterval(() => {
            setLoadingPercent(prev => {
                if (prev >= 100) return 100;
                const increment = prev < 50 ? 3 : prev < 80 ? 2 : 1;
                return Math.min(prev + increment, 100);
            });
        }, BOOT_LINK_TICK_MS);

        let seed = 1;
        const rowInterval = setInterval(() => {
            setBootRows(prev => [...prev, makeBootRow(seed++)].slice(-3));
        }, 90);

        // Jittering link telemetry in the screen-edge chrome.
        const rttInterval = setInterval(() => {
            setRtt(Number((4.2 + Math.random() * 1.1).toFixed(1)));
        }, 320);

        return () => {
            clearInterval(loadInterval);
            clearInterval(rowInterval);
            clearInterval(rttInterval);
        };
    }, []);

    // ── Act 2: LOADED — dot stream, then hand off to the manifest ──
    useEffect(() => {
        if (loadingPercent < 100 || phase !== 'link') return;
        setPhase('loaded');
    }, [loadingPercent, phase]);

    useEffect(() => {
        if (phase !== 'loaded') return;
        const dotInterval = setInterval(() => {
            setDotCount(prev => (prev >= 64 ? prev : prev + 1));
        }, 22);
        const next = setTimeout(() => setPhase('compute'), BOOT_LOADED_HOLD_MS);
        return () => { clearInterval(dotInterval); clearTimeout(next); };
    }, [phase]);

    // ── Act 3: COMPUTING — manifest unfolds and checks itself off ──
    useEffect(() => {
        if (phase !== 'compute') return;
        const computeInterval = setInterval(() => {
            setComputePercent(prev => (prev >= 100 ? 100 : prev + 1));
        }, BOOT_COMPUTE_TICK_MS);
        return () => clearInterval(computeInterval);
    }, [phase]);

    // ── Act 4: DISSOLVE — erase the panel, then release the login form ──
    useEffect(() => {
        if (phase !== 'compute' || computePercent < 100) return;
        const hold = setTimeout(() => setPhase('dissolve'), BOOT_COMPUTE_HOLD_MS);
        return () => clearTimeout(hold);
    }, [phase, computePercent]);

    useEffect(() => {
        if (phase !== 'dissolve') return;
        onDissolve?.();
        const done = setTimeout(onComplete, BOOT_DISSOLVE_MS);
        return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    const statusText =
        phase === 'link'   ? `LOADING ${loadingPercent}%` :
        phase === 'loaded' ? 'LOADED' :
        phase === 'compute' && computePercent < 100 ? `COMPUTING ${computePercent}%` : '';

    const linkState =
        phase === 'link'   ? 'LINK PENDING' :
        phase === 'loaded' ? 'LINK ESTABLISHED' :
        phase === 'compute' ? 'SUBSYSTEM CHECK' : 'CONSOLE READY';

    const stripPercent = showPanel ? computePercent : loadingPercent;
    const cp = computePercent;

    return (
        /* The whole screen is a veil over the login view. On handoff it clears
           rather than being switched off: the readout lifts and blurs away
           first, then the black ground fades, uncovering the console that is
           already fading up underneath. */
        <motion.div
            className="fixed inset-0 z-50 bg-black text-white font-mono flex flex-col overflow-hidden"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: BOOT_EXIT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
        >
            <motion.div
                className="flex-1 flex flex-col items-center justify-center px-8"
                exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                transition={{ duration: 0.3, ease: [0.4, 0, 1, 1] }}
            >
                <div className="w-[min(90vw,520px)] mt-[4vh]">
                    {/* Upper stage — fixed height so the status frame never shifts */}
                    <div className="relative h-[248px] flex flex-col justify-end">
                        <AnimatePresence mode="wait">
                            {!showPanel ? (
                                <motion.div key="boot-link" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                    {/* Attention mark — centered over the block, retires once loaded */}
                                    <AnimatePresence>
                                        {!loaded && (
                                            <motion.div
                                                key="intro-mark"
                                                initial={{ opacity: 0, y: -6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.25 }}
                                                className="flex flex-col items-center gap-1 mb-10"
                                            >
                                                <svg width="34" height="34" viewBox="0 0 56 56" fill="none" className="text-white">
                                                    <path d="M28 6 L51 47 L5 47 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
                                                    <path d="M28 20 L28 33" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
                                                    <path d="M28 38 L30 40 L28 42 L26 40 Z" fill="currentColor" />
                                                </svg>
                                                <span className="text-[8px] font-bold tracking-[0.35em]">ATTENTION</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex items-end justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            {/* Header label — text types in, the untyped tail stays masked */}
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: 0.1, duration: 0.2 }}
                                                className="relative inline-block border border-white px-2 py-[3px] mb-1.5"
                                            >
                                                <span className="block text-[10px] font-bold tracking-[0.18em] leading-none">
                                                    {header}
                                                </span>
                                                {typedRatio < 1 && (
                                                    <div
                                                        className="absolute inset-y-[1px] right-[1px] bg-white mix-blend-difference"
                                                        style={{ left: `${typedRatio * 100}%` }}
                                                    />
                                                )}
                                            </motion.div>

                                            {/* Micro boot log */}
                                            <div className="h-[26px] overflow-hidden text-[7px] leading-[1.35] text-gray-300 tabular-nums">
                                                {loaded ? (
                                                    <>
                                                        <div className="tracking-[0.3em]">{'.'.repeat(Math.min(dotCount, 8))}</div>
                                                        <div className="tracking-[0.3em] truncate">{'.'.repeat(Math.max(0, dotCount - 8))}</div>
                                                    </>
                                                ) : (
                                                    bootRows.map(row => (
                                                        <motion.div
                                                            key={row.id}
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            transition={{ duration: 0.06 }}
                                                            className="truncate"
                                                        >
                                                            {`:  # ${row.addr}:   ${row.sym}:   0x${row.from} : 0x${row.to} : ${row.size} :`}
                                                        </motion.div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Brand tag — takes the mark's place once the link is up */}
                                        <AnimatePresence>
                                            {loaded && (
                                                <motion.div
                                                    key="intro-brand"
                                                    initial={{ opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="shrink-0 flex flex-col items-center"
                                                >
                                                    <svg width="26" height="26" viewBox="0 0 56 56" fill="none" className="text-white">
                                                        <path d="M28 4 L52 48 L4 48 Z" fill="currentColor" />
                                                        <path d="M28 20 L40 44 L16 44 Z" fill="black" />
                                                    </svg>
                                                    <div className="border border-white px-1 py-[1px] text-[5px] font-bold tracking-[0.2em] leading-tight text-center">
                                                        MINERVA<br />C2 FRAMEWORK
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            ) : (
                                /* Manifest panel — unfolds from the status frame's top edge */
                                <motion.div
                                    key="boot-manifest"
                                    className="relative w-full sm:w-[115%]"
                                    initial={{ scaleY: 0.03, opacity: 0.7 }}
                                    animate={{ scaleY: 1, opacity: 1 }}
                                    transition={{ duration: 0.28, ease: [0.76, 0, 0.24, 1] }}
                                    style={{ transformOrigin: 'bottom' }}
                                >
                                    {/* Detached port tag, outside the top-left corner */}
                                    <motion.div
                                        className="absolute -left-9 top-0 text-[6px] leading-[1.5] text-gray-300"
                                        animate={{ opacity: dissolving ? 0 : 1 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <svg width="9" height="9" viewBox="0 0 10 10" className="mb-1 text-white">
                                            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
                                            <path d="M1.5 8.5 L8.5 1.5" stroke="currentColor" strokeWidth="1" />
                                        </svg>
                                        <div>PORT</div>
                                        <div className="tabular-nums">{CONN.port}</div>
                                    </motion.div>

                                    <div className={cn(
                                        'h-[248px] flex overflow-hidden border transition-colors duration-300',
                                        dissolving ? 'border-dashed border-white/40' : 'border-white'
                                    )}>
                                        {/* Left column — subsystem checklist */}
                                        <div className="flex-1 min-w-0 flex flex-col px-3 py-2.5">
                                            <div className="flex-1 min-h-0 space-y-[6px]">
                                                {BOOT_MANIFEST_INDEXED.map((group, gi) => (
                                                    <motion.div
                                                        key={group.group}
                                                        className="flex items-center gap-2"
                                                        animate={{ opacity: dissolving ? 0 : 1 }}
                                                        transition={{ duration: 0.14, delay: dissolving ? gi * 0.05 : 0 }}
                                                    >
                                                        <div className="w-[38%] shrink-0 text-[7px] tracking-[0.12em] leading-none">
                                                            {typeOut(group.group, (cp - gi * 3) / 8)}
                                                        </div>
                                                        <div className={cn('w-px self-stretch', group.items.length ? 'bg-white/40' : 'bg-transparent')} />
                                                        <div className="flex-1 min-w-0 text-[6px] leading-[1.6] text-gray-300">
                                                            {group.items.map(({ label, idx }) => {
                                                                const revealAt = idx * 4;
                                                                const ready = cp >= revealAt + 40;
                                                                return (
                                                                    <motion.div
                                                                        key={label}
                                                                        className="flex items-center justify-between gap-2"
                                                                        animate={{ opacity: cp >= revealAt ? 1 : 0 }}
                                                                        transition={{ duration: 0.12 }}
                                                                    >
                                                                        <span className="truncate">{label}</span>
                                                                        <span className={cn('shrink-0', ready && 'text-white')}>
                                                                            {ready ? 'READY' : 'CHECKING'}
                                                                        </span>
                                                                    </motion.div>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                            <div className="flex gap-8 pt-1 text-[6px] tracking-[0.15em] text-gray-300 whitespace-nowrap">
                                                <span>MINERVA C2 · OPERATOR CONSOLE V2</span>
                                                <span>BOOTING SEQUENCE</span>
                                            </div>
                                        </div>

                                        {/* Right column — identity and stream spec */}
                                        <div className="w-[34%] shrink-0 border-l border-white/60 flex flex-col px-3 py-2.5">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <svg width="24" height="24" viewBox="0 0 56 56" fill="none" className="text-white shrink-0">
                                                    <path d="M28 4 L52 48 L4 48 Z" fill="currentColor" />
                                                    <path d="M28 20 L40 44 L16 44 Z" fill="black" />
                                                </svg>
                                                <div className="text-right min-w-0">
                                                    <div className="text-[9px] font-bold tracking-[0.25em] leading-none">MINERVA</div>
                                                    <div className="text-[4px] tracking-[0.1em] text-gray-300 mt-[3px]">ADVERSARY SIMULATION PLATFORM</div>
                                                </div>
                                            </div>

                                            <div className="text-[6px] leading-[1.7] text-gray-300">
                                                <div className="flex gap-2">
                                                    <span className="w-12 shrink-0">ENDPOINT</span>
                                                    <span className="truncate">{CONN.hostname}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="w-12 shrink-0">SCHEMA</span>
                                                    <span className="truncate">MVX-2.2.1 / GQL-1</span>
                                                </div>
                                            </div>

                                            <div className="border-t border-dashed border-white/30 my-2" />

                                            <div className="text-[6px] leading-[1.5] text-gray-300 tracking-[0.05em]">
                                                <div>{typeOut('------------------------------', (cp - 10) / 6)}</div>
                                                <div>{typeOut('--------', (cp - 16) / 4)}</div>
                                                <div>{typeOut('------------------------------', (cp - 22) / 8)}</div>
                                                <div>{typeOut('--------', (cp - 30) / 4)}</div>
                                            </div>

                                            <div className="mt-2 space-y-2 text-[6px] leading-[1.6] text-gray-300">
                                                <p>{typeOut('NODES = ACTIVE CALLBACKS; TASKS = QUEUED OPERATOR TASKS; LINKS = P2P EDGES PER CALLBACK; FRAMES = 20, % POLL WINDOW IN SECONDS', (cp - 34) / 24)}</p>
                                                <p>{typeOut('X = REPMAT(INT2BIT( NODES, TASKS, LINKS, FRAMES ));', (cp - 58) / 14)}</p>
                                                <p>{typeOut("INFO = MVINFO('MINERVA_001.MVX'); MVWRITE(FRAME, FILENAME, INFO)", (cp - 72) / 18)}</p>
                                            </div>

                                            <div className="mt-auto flex justify-between gap-2 pt-1 text-[6px] tracking-[0.15em] text-gray-300 whitespace-nowrap">
                                                <span>LINK {CONN.protocol}</span>
                                                <span>TLS 1.3 AES-256</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Status frame: hairline progress strip over a three-cell readout */}
                    <motion.div
                        initial={{ opacity: 0, scaleY: 0.6 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ delay: 0.25, duration: 0.25 }}
                        className="mt-3 border border-white p-[2px]"
                    >
                        <div className="h-[7px] border border-white/50 overflow-hidden">
                            <motion.div
                                className="h-full w-full bg-white origin-left"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: stripPercent / 100 }}
                                transition={{ ease: 'easeOut', duration: 0.25 }}
                            />
                        </div>

                        <div className="mt-[2px] flex items-stretch h-8">
                            <div className="flex items-center gap-1.5 pr-2 pl-1 border-r border-white/60">
                                <div className="w-[7px] h-[7px] rounded-full bg-white shrink-0" />
                                <div className="text-[5px] leading-[1.4] text-gray-300 whitespace-nowrap">
                                    <div>MINERVA C2</div>
                                    <div>OPERATOR CONSOLE</div>
                                    <div>{CONN.protocol} · {CONN.hostname}</div>
                                    <div>{linkState}</div>
                                </div>
                            </div>

                            <div className="flex-1 flex items-center justify-center">
                                <span className="text-[10px] font-bold tracking-[0.3em] tabular-nums">
                                    {statusText}
                                </span>
                            </div>

                            <div className="flex flex-col justify-center pl-2 pr-1 border-l border-white/60 text-[7px] tracking-[0.15em] text-right leading-[1.5] text-gray-300 whitespace-nowrap">
                                <div>BUILD 2.2.1</div>
                                <div>REV 22.0</div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* Screen-edge chrome */}
            <motion.div
                className="px-8 pb-5 w-full flex justify-between items-end text-[10px] font-bold tracking-[0.2em] uppercase text-gray-300"
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.24, ease: [0.4, 0, 1, 1] }}
            >
                <div>MINERVA COMMAND &amp; CONTROL</div>
                <div className="text-white">BOOTING SEQUENCE</div>
                <div className="flex gap-10">
                    <span className="tabular-nums">LINK {rtt.toFixed(1)} MS</span>
                    <span>TLS 1.3 AES-256</span>
                </div>
            </motion.div>
        </motion.div>
    );
};

// -----------------------------------------------------------------------------
// TRANSITION SCREEN
// -----------------------------------------------------------------------------

export default IntroSequence;
