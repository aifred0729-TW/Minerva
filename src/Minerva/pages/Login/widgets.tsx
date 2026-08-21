import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { HEALTH_URL } from '../../lib/urls';
import { getServerHostname, serverHostnameFallback } from '../../lib/serverInfo';
import { HEALTH_CHECK_INTERVAL, HEALTH_CHECK_TIMEOUT_MS } from './timings';

/** The machine name Minerva runs on, resolved once and shared with the backdrop. */
export function useServerHostname() {
    const [name, setName] = useState(serverHostnameFallback);
    useEffect(() => {
        let alive = true;
        getServerHostname().then(h => { if (alive) setName(h); });
        return () => { alive = false; };
    }, []);
    return name;
}

// -----------------------------------------------------------------------------
// LIVE CLOCK
// -----------------------------------------------------------------------------

export const LiveClock = () => {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const time = now.toLocaleTimeString('en-GB', { hour12: false });
    return (
        <div className="flex items-center gap-2 text-[10px] font-mono text-signal tabular-nums">
            <Clock size={10} strokeWidth={2} className="shrink-0" />
            <span className="opacity-70">{date}</span>
            <span className="font-bold">{time}</span>
        </div>
    );
};

// -----------------------------------------------------------------------------
// SERVER STATUS INDICATOR (real ping)
// -----------------------------------------------------------------------------

export const ServerStatus = () => {
    const [status, setStatus] = useState<'CHECKING' | 'ONLINE' | 'OFFLINE'>('CHECKING');
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
            const start = performance.now();
            try {
                await fetch(HEALTH_URL, { method: 'GET', signal: controller.signal });
                clearTimeout(timeout);
                const elapsed = Math.round(performance.now() - start);
                if (mounted) { setStatus('ONLINE'); setLatency(elapsed); }
            } catch {
                clearTimeout(timeout);
                // Fallback: try the auth endpoint
                const controller2 = new AbortController();
                const timeout2 = setTimeout(() => controller2.abort(), HEALTH_CHECK_TIMEOUT_MS);
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
        const id = setInterval(check, HEALTH_CHECK_INTERVAL);
        return () => { mounted = false; clearInterval(id); };
    }, []);

    return (
        <div className="flex items-center gap-2.5">
            <div className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                status === 'ONLINE' && "bg-hud-trace shadow-[0_0_6px_rgba(132,217,255,0.8)]",
                status === 'OFFLINE' && "bg-red-400",
                status === 'CHECKING' && "bg-hud-route animate-pulse",
            )} />
            <span className={cn(
                "text-[10px] font-mono font-bold tracking-[0.2em]",
                status === 'ONLINE' && "text-hud-trace",
                status === 'OFFLINE' && "text-red-400",
                status === 'CHECKING' && "text-hud-route",
            )}>
                {status === 'CHECKING' ? 'CHECKING' : status}
            </span>
            {latency !== null && status === 'ONLINE' && (
                <span className="text-[10px] font-mono font-bold text-signal tabular-nums">{latency}ms</span>
            )}
        </div>
    );
};
