import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useWindowEngaged } from '../../lib/useWindowEngaged';
import { Server, Terminal, Activity, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Console boot screen — shown while the session/callback metadata is still
 * being resolved. Matches the Minerva 先進極簡 design language: signal/accent
 * palette, mono uppercase labels with wide tracking, soft signal/20 borders,
 * pulse-accent for the live step. Replaces the legacy single-line
 * "INITIALIZING_MSF_SESSION..." placeholder.
 */
interface BootChromeProps {
    sessionId: string;
    isSidebarCollapsed: boolean;
    /** Default 'msf' shows the MSF connect script; 'mythic' shows the Mythic
     *  callback fetch script. Visually identical except for the headline. */
    mode?: 'msf' | 'mythic';
    /** When set, the chrome flips to error tone — used for "callback not
     *  found" and Apollo query errors. */
    errorMessage?: string;
}

type StepState = 'done' | 'live' | 'pending' | 'failed';

interface BootStep {
    label: string;
    state: StepState;
    detail?: string;
}

export function MsfConsoleBootChrome({
    sessionId,
    isSidebarCollapsed,
    mode = 'msf',
    errorMessage,
}: BootChromeProps) {
    // Animate the step progression on a short timer so the chrome doesn't
    // feel frozen during the typical 100-500ms RPC round-trip. The real
    // session metadata usually arrives during step 2, so most operators
    // never see step 3 light up — and that's fine, the chrome unmounts the
    // moment the parent has the data.
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (errorMessage) return;
        const t = setInterval(() => setTick(v => Math.min(v + 1, 3)), 240);
        return () => clearInterval(t);
    }, [errorMessage]);

    const steps: BootStep[] = errorMessage
        ? [
              { label: 'CONNECT', state: 'done', detail: 'msfrpc · authenticated' },
              { label: 'LOCATE', state: 'failed', detail: errorMessage },
              { label: 'ATTACH', state: 'pending' },
          ]
        : mode === 'msf'
        ? [
              {
                  label: 'CONNECT',
                  state: tick >= 1 ? 'done' : 'live',
                  detail: 'msfrpc · session.list',
              },
              {
                  label: 'LOCATE',
                  state: tick >= 2 ? 'done' : tick >= 1 ? 'live' : 'pending',
                  detail: `session ${sessionId}`,
              },
              {
                  label: 'ATTACH',
                  state: tick >= 3 ? 'done' : tick >= 2 ? 'live' : 'pending',
                  detail: 'broker · stdin/stdout',
              },
          ]
        : [
              {
                  label: 'QUERY',
                  state: tick >= 1 ? 'done' : 'live',
                  detail: 'mythic · callback_by_pk',
              },
              {
                  label: 'RESOLVE',
                  state: tick >= 2 ? 'done' : tick >= 1 ? 'live' : 'pending',
                  detail: `callback ${sessionId}`,
              },
              {
                  label: 'ATTACH',
                  state: tick >= 3 ? 'done' : tick >= 2 ? 'live' : 'pending',
                  detail: 'subscriptions · tasks/output',
              },
          ];

    const headline =
        errorMessage
            ? mode === 'msf' ? 'SESSION_UNAVAILABLE' : 'CALLBACK_UNAVAILABLE'
            : mode === 'msf' ? 'ESTABLISHING_SESSION' : 'ESTABLISHING_CONSOLE';
    const subline =
        errorMessage
            ? mode === 'msf'
                ? 'MSF session not present in workspace.'
                : 'Mythic callback metadata could not be loaded.'
            : mode === 'msf'
                ? 'Connecting to the Metasploit RPC broker and locating the requested session.'
                : 'Fetching callback metadata and binding the task subscription.';

    return (
        <div
            className={cn(
                'min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void',
                'transition-all duration-300 flex items-center justify-center',
                isSidebarCollapsed ? 'pl-16' : 'pl-64',
            )}
        >
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full max-w-xl mx-6 rounded-md border border-signal/20 bg-machine/30 px-6 py-5 space-y-5"
            >
                {/* Header band — mirrors the Step intro pattern from the
                 *  design doc: tiny tracking-[0.3em] label up top, then a
                 *  large titled headline, then a short descriptive line. */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-signal">
                            MINERVA · {mode === 'msf' ? 'MSF CONSOLE' : 'MYTHIC CONSOLE'}
                        </span>
                        <span
                            className={cn(
                                'flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] uppercase',
                                errorMessage ? 'text-red-500' : 'text-accent',
                            )}
                        >
                            <span
                                className={cn(
                                    'h-1.5 w-1.5 rounded-full',
                                    errorMessage
                                        ? 'bg-red-500'
                                        : 'bg-accent animate-pulse',
                                )}
                            />
                            {errorMessage ? 'BLOCKED' : 'CONNECTING'}
                        </span>
                    </div>
                    <div className="text-2xl font-bold tracking-[0.15em] text-signal font-mono">
                        {headline}
                    </div>
                    <div className="text-xs text-signal">{subline}</div>
                </div>

                {/* Target row — what we're trying to attach to. */}
                <div className="flex items-stretch gap-3 rounded-md border border-signal/15 bg-black/40 p-3">
                    <div className="rounded-md bg-signal/5 border border-signal/15 p-2 flex items-center justify-center">
                        {mode === 'msf' ? (
                            <Server size={20} strokeWidth={1.8} className="text-signal" />
                        ) : (
                            <Terminal size={20} strokeWidth={1.8} className="text-signal" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="space-y-0.5">
                            <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-signal">
                                Target
                            </div>
                            <div className="font-mono text-sm font-bold tracking-[0.15em] text-signal truncate">
                                {mode === 'msf' ? `SESSION_${sessionId || '—'}` : `CALLBACK_${sessionId || '—'}`}
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-signal">
                                Channel
                            </div>
                            <div className="font-mono text-sm tracking-[0.1em] text-signal truncate">
                                {mode === 'msf' ? 'msfrpc' : 'hasura · graphql'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Step ladder. The "live" step gets an accent pulse, "done"
                 *  steps a static accent dot, "pending" steps a hollow ghost
                 *  ring, "failed" a red ring + red detail. No HUD chamfers,
                 *  no L-ticks — just signal/15 row separators. */}
                <div className="rounded-md border border-signal/15 bg-black/40 overflow-hidden">
                    {steps.map((s, i) => (
                        <div
                            key={s.label}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5',
                                i !== steps.length - 1 && 'border-b border-signal/10',
                            )}
                        >
                            <StepDot state={s.state} />
                            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                                <span
                                    className={cn(
                                        'font-mono text-xs tracking-[0.25em] uppercase font-bold',
                                        s.state === 'pending' ? 'text-signal opacity-50' : 'text-signal',
                                    )}
                                >
                                    {s.label}
                                </span>
                                <span
                                    className={cn(
                                        'font-mono text-[11px] truncate',
                                        s.state === 'failed' ? 'text-red-500' :
                                        s.state === 'pending' ? 'text-signal opacity-50' :
                                        'text-signal',
                                    )}
                                    title={s.detail}
                                >
                                    {s.detail || '—'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer status strip — Result-banner style from design doc.
                 *  Animated shimmer in the connecting state, static error in
                 *  the failed state. */}
                {errorMessage ? (
                    <div className="border-t border-signal/15 pt-3 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-red-500 shrink-0" />
                        <span className="font-mono text-xs text-red-500 truncate">
                            {errorMessage}
                        </span>
                    </div>
                ) : (
                    <div className="border-t border-signal/15 pt-3 space-y-2">
                        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] uppercase">
                            <span className="text-signal">Working</span>
                            <span className="text-signal flex items-center gap-1.5">
                                <Layers size={11} strokeWidth={2} />
                                {mode === 'msf' ? 'METASPLOIT RPC' : 'MYTHIC API'}
                                <span className="text-signal opacity-60">·</span>
                                <Activity size={11} strokeWidth={2} className="text-accent" />
                            </span>
                        </div>
                        <ShimmerBar />
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function StepDot({ state }: { state: StepState }) {
    if (state === 'live') {
        return (
            <span className="relative flex items-center justify-center w-3 h-3 shrink-0">
                <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-accent" />
            </span>
        );
    }
    if (state === 'done') {
        return <span className="h-2 w-2 rounded-full bg-accent shrink-0" />;
    }
    if (state === 'failed') {
        return <span className="h-2.5 w-2.5 rounded-full border border-red-500 bg-red-500/20 shrink-0" />;
    }
    return <span className="h-2 w-2 rounded-full border border-signal/40 shrink-0" />;
}

function ShimmerBar() {
    // A boot can sit on screen while the operator goes and does something else.
    // Framer's `repeat: Infinity` runs off its own rAF loop, which CSS
    // `animation-play-state` cannot pause, so it needs the gate explicitly.
    const engaged = useWindowEngaged();
    return (
        <div className="relative h-[3px] w-full overflow-hidden rounded-sm bg-signal/10">
            <motion.div
                className="absolute inset-y-0 w-1/3 bg-accent/80 rounded-sm"
                initial={{ x: '-100%' }}
                animate={engaged ? { x: ['-30%', '130%'] } : { x: '-30%' }}
                transition={engaged
                    ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0 }}
            />
        </div>
    );
}
