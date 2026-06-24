import React, { useState, useEffect, useMemo } from 'react'
import { useReactiveVar } from "@apollo/client/react";
import { Skull, Monitor, Link2 } from 'lucide-react';
import { cn, getCallbackDeadThresholdSecs } from '../../lib/utils';
import { meState } from '../../lib/state';
import { secondsToRelative } from '../../lib/time';

export const loadingSound = process.env.PUBLIC_URL + '/audio/loading.m4a';

const CHECKIN_STATUS_REFRESH_MS = 1_000;

export const LastCheckinCell = ({
    lastCheckin, agentType, dead, sleepInfo,
    isP2P, initCallback, lastTaskProcessedAt, orphanTcpP2P,
}: {
    lastCheckin: string;
    agentType?: string;
    dead?: boolean;
    sleepInfo?: string;
    /** True when this callback's primary route is P2P (e.g. TCP). When
     *  set, the display switches to "time since last real response"
     *  semantics — see comment below. */
    isP2P?: boolean;
    /** Timestamp of when the callback was first established. Used as
     *  the baseline for P2P agents that haven't been tasked yet. */
    initCallback?: string;
    /** Most-recent task `status_timestamp_processed`. P2P agents use
     *  this instead of `last_checkin`; HTTP agents ignore it. */
    lastTaskProcessedAt?: string;
    /** TCP P2P callback with no active peer link → dead regardless of
     *  elapsed time, since no traffic can reach it. */
    orphanTcpP2P?: boolean;
}) => {
    const me = useReactiveVar(meState);
    const serverSkewMs = (me?.user?.server_skew) || 0;

    // ── P2P semantics ────────────────────────────────────────────────
    // For a TCP P2P (or any pure-P2P) callback, the parent agent's
    // beacons constantly relay the child's checkin token even when the
    // child itself is idle, so Mythic's `last_checkin` keeps resetting
    // to "now" — operator sees "0s ago" forever. The truer signal is
    // when the operator gave the child a command AND the child sent a
    // response back: that's what bumps `status_timestamp_processed` on
    // the most-recent task. We display "time since that moment", and
    // fall back to `init_callback` if the child has never been tasked.
    //
    // For non-P2P agents, behaviour is unchanged — `last_checkin` is
    // accurate because it reflects the agent's own beacons.
    const effectiveCheckin = isP2P
        ? (lastTaskProcessedAt || initCallback || lastCheckin)
        : lastCheckin;

    // Dynamic thresholds driven by the agent's own sleep interval so a 10-min
    // beacon isn't flagged dead 5 min after its last check-in. For P2P
    // callbacks the operator wants the timer to grow indefinitely, so
    // we use a much longer baseline that won't flip the cell to amber/red
    // until there's been hours of silence with no operator interaction.
    const dangerSecs = useMemo(
        () => isP2P ? 24 * 60 * 60 : getCallbackDeadThresholdSecs(sleepInfo),
        [isP2P, sleepInfo],
    );
    const warningSecs = useMemo(
        () => isP2P ? 4 * 60 * 60 : Math.max(60, Math.floor(dangerSecs * 0.6)),
        [isP2P, dangerSecs],
    );

    const calculateStatus = React.useCallback(() => {
        if (!effectiveCheckin) return { text: 'NEVER', color: 'text-gray-500', title: '', diffSecs: Infinity };
        try {
            const timeStr = effectiveCheckin.endsWith('Z') ? effectiveCheckin : `${effectiveCheckin}Z`;
            // `server_skew = serverNow - clientNow` (see lib/auth.ts), so we
            // ADD skew to clientNow to get the server's wall-clock view of
            // "now". Subtracting flips the sign and, whenever the server
            // clock is at all ahead of the client's, makes the diff negative
            // → `secondsToRelative` clamps it to "0s ago" — which is why
            // dead callbacks were appearing as if they'd just checked in.
            const diff = Math.floor((new Date().getTime() + serverSkewMs - new Date(timeStr).getTime()) / 1000);
            let color = 'text-green-500';
            if (diff > warningSecs) color = 'text-yellow-500';
            if (diff > dangerSecs)  color = 'text-red-500';
            return { text: secondsToRelative(diff), color, title: new Date(timeStr).toLocaleString(), diffSecs: diff };
        } catch { return { text: 'ERROR', color: 'text-red-500', title: '', diffSecs: Infinity }; }
    }, [effectiveCheckin, serverSkewMs, warningSecs, dangerSecs]);

    const [status, setStatus] = useState(calculateStatus);
    React.useEffect(() => {
        setStatus(calculateStatus());
        const iv = setInterval(() => setStatus(calculateStatus()), CHECKIN_STATUS_REFRESH_MS);
        return () => clearInterval(iv);
    }, [calculateStatus]);

    // Non-agent payloads (e.g. service workers) show blank
    if (agentType && agentType !== 'agent') return <span className="text-gray-600">—</span>;

    // Streaming / interactive shell — special 1970 timestamp
    if (lastCheckin && (lastCheckin.startsWith('1970') || lastCheckin === '1970-01-01T00:00:00')) {
        return (
            <span className="flex items-center gap-1 text-blue-400 font-mono text-xs">
                {dead && <Skull size={10} className="text-red-500 shrink-0" title="Dead" />}
                STREAMING
            </span>
        );
    }

    // TCP P2P callback with no active peer link → unreachable.
    // Time-based grace doesn't apply: without a parent connected, traffic
    // can never reach this node. Render as hard-dead immediately.
    if (orphanTcpP2P) {
        return (
            <span
                className="flex items-center gap-1.5 font-mono text-xs text-red-500"
                title="TCP P2P · no peer linked — unreachable"
            >
                <Skull size={10} className="text-red-500 shrink-0" />
                <span className="tracking-[0.18em] text-[10px] uppercase opacity-80">LINK</span>
                <span className="tabular-nums">DEAD</span>
            </span>
        );
    }

    // P2P-routed callback — distinct visual state.
    //
    // Semantics differ from a beacon-driven agent: there's no
    // self-driven check-in, only a parent agent relaying traffic.
    // The number we show is "time since last operator-driven response"
    // (see effectiveCheckin / dangerSecs above). Render as:
    //   [Link2 icon] LINK · <Xm idle>
    // with its own colour ramp on top of `text-signal`:
    //   - text-signal       → active link, no recent silence
    //   - text-amber-400    → warningSecs (4h) elapsed without commands
    //   - text-red-500      → dangerSecs (24h) elapsed; treat as stale
    // The chain glyph + "LINK" prefix makes it unmistakable to the
    // operator that this row is a relayed P2P session, not an HTTP
    // beacon — they're reading two different timers.
    if (isP2P) {
        const p2pTone =
            !!dead ? 'text-red-500' :
            status.diffSecs > dangerSecs ? 'text-red-500' :
            status.diffSecs > warningSecs ? 'text-amber-400' :
            'text-signal';
        const hasInteraction = !!lastTaskProcessedAt;
        const idleText = hasInteraction
            ? `${status.text.replace(' ago', '')} idle`
            : status.text.replace(' ago', '') + ' linked';
        return (
            <span
                className={cn(p2pTone, 'flex items-center gap-1.5 font-mono text-xs')}
                title={
                    hasInteraction
                        ? `P2P relay · last response ${status.title}`
                        : `P2P relay · linked at ${status.title} · no commands sent yet`
                }
            >
                {!!dead && <Skull size={10} className="text-red-500 shrink-0" title="Dead" />}
                <Link2 size={11} className="shrink-0 opacity-90" strokeWidth={2} />
                <span className="tracking-[0.18em] text-[10px] uppercase opacity-80">LINK</span>
                <span className="tabular-nums">{idleText}</span>
            </span>
        );
    }

    // Red skull: server confirmed dead OR client silence exceeds the dynamic threshold
    const clientDead = status.diffSecs > dangerSecs;
    const showRedSkull = !!dead || clientDead;

    return (
        <span className={cn(status.color, 'flex items-center gap-1')} title={status.title}>
            {showRedSkull && <Skull size={10} className="text-red-500 shrink-0" title={dead ? 'Dead' : 'Not responding'} />}
            {status.text}
        </span>
    );
};

/* ─────────── OS Platform Icons ─────────── */
export const WinIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
);
export const TuxIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/>
    </svg>
);
export const AppleIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
);
export const ChromeIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 0C8.21 0 4.831 1.757 2.625 4.501l3.863 6.648A5.088 5.088 0 0112 6.902c.919 0 1.784.25 2.558.691l3.866-6.654A11.957 11.957 0 0012 0zm5.793 3.75l-3.866 6.654a5.09 5.09 0 011.171 5.025L19.4 21.5A11.956 11.956 0 0024 12c0-3.141-1.222-5.994-3.207-8.094zM2.207 4.5A11.992 11.992 0 000 12c0 3.31 1.341 6.31 3.507 8.5l3.83-6.63A5.09 5.09 0 016.902 12a5.088 5.088 0 012.637-4.463L5.793 3.75A12.003 12.003 0 002.207 4.5zM12 8a4 4 0 100 8 4 4 0 000-8z"/>
    </svg>
);
export const AndroidIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M17.523 15.341c-.551 0-.999-.449-.999-1s.448-.999.999-.999c.551 0 .999.448.999.999s-.448 1-.999 1zm-11.046 0c-.551 0-.999-.449-.999-1s.448-.999.999-.999c.551 0 .999.448.999.999s-.448 1-.999 1zm11.405-6.02l1.997-3.459a.416.416 0 00-.152-.568.416.416 0 00-.568.152L17.137 8.9C15.59 8.244 13.853 7.851 12 7.851s-3.59.393-5.137 1.049L4.841 5.447a.416.416 0 00-.568-.152.416.416 0 00-.152.568l1.997 3.459C2.689 11.187.343 14.659 0 18.761h24c-.344-4.102-2.689-7.574-6.118-9.44z"/>
    </svg>
);
export const RobotIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73A2 2 0 0112 2M9 9a1 1 0 00-1 1v1a1 1 0 001 1h6a1 1 0 001-1v-1a1 1 0 00-1-1H9m-4 5v2h14v-2H5m2 4v2h2v-2H7m6 0v2h2v-2h-2z"/>
    </svg>
);
export const getPlatformIcon = (os: string, payloadType: string, size = 14, className = '') => {
    const o = (os || '').toLowerCase();
    const p = (payloadType || '').toLowerCase();
    if (o.includes('windows') || p === 'apollo') return <WinIcon size={size} className={className} />;
    if (o.includes('linux') || p === 'poseidon') return <TuxIcon size={size} className={className} />;
    if (o.includes('mac') || o.includes('darwin') || p === 'medusa') return <AppleIcon size={size} className={className} />;
    if (o.includes('android')) return <AndroidIcon size={size} className={className} />;
    if (o.includes('chrome') || o.includes('cros')) return <ChromeIcon size={size} className={className} />;
    if (p && p !== '' && p !== 'agent') return <RobotIcon size={size} className={className} />;
    return <Monitor size={size} className={className} />;
};

/* ─────────── JSON Syntax Highlight helper ─────────── */
type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct';
const TOKEN_COLORS: Record<TokenType, string> = {
    key: 'text-blue-300 font-semibold',
    string: 'text-emerald-300',
    number: 'text-yellow-300',
    boolean: 'text-orange-300',
    null: 'text-purple-300',
    punct: '',
};

function tokenizeJson(formatted: string): { type: TokenType; text: string }[] {
    const tokens: { type: TokenType; text: string }[] = [];
    const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\]:,\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(formatted)) !== null) {
        if (match[1] != null) tokens.push({ type: 'key', text: match[1] + ':' });
        else if (match[2] != null) tokens.push({ type: 'string', text: match[2] });
        else if (match[3] != null) tokens.push({ type: 'number', text: match[3] });
        else if (match[4] != null) tokens.push({ type: 'boolean', text: match[4] });
        else if (match[5] != null) tokens.push({ type: 'null', text: match[5] });
        else if (match[6] != null) tokens.push({ type: 'punct', text: match[6] });
    }
    return tokens;
}

export const JsonHighlight = ({ value }: { value: string }) => {
    const tokens = React.useMemo(() => {
        try {
            return tokenizeJson(JSON.stringify(JSON.parse(value), null, 2));
        } catch { return null; }
    }, [value]);
    if (!tokens) return null;
    return (
        <pre className="bg-black/60 border border-white/5 rounded p-2 text-xs font-mono overflow-auto max-h-[160px] cyber-scrollbar leading-relaxed">
            {tokens.map((t, i) =>
                t.type === 'punct' ? t.text : <span key={i} className={TOKEN_COLORS[t.type]}>{t.text}</span>
            )}
        </pre>
    );
};
