/**
 * MSF SOCKS Routes dialog — per-operation tunnel viewer + per-session
 * route editor.
 *
 * The tunnel itself is started automatically by `MsfSocksBootstrap` at
 * app boot for the current operation. This dialog is the operator's
 * window into:
 *   - The single host port serving the entire operation
 *   - A copy-able proxychains4 config line
 *   - Per-session route lists (read-only for non-focused sessions,
 *     editable textarea for the session whose row opened this dialog)
 *   - Optional "Stop Tunnel" escape hatch (the bootstrap will restart
 *     it on the next session unless the operator stays in dialog).
 *
 * The dialog opens from the Callbacks row's ⋮ menu and from the 3D
 * SOCKS quickhack invocation on a meterpreter node.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Network, Copy, Power, Loader2, RefreshCw } from 'lucide-react';
import { useReactiveVar } from '@apollo/client/react';
import { CyberModal } from '../../components/CyberModal';
import { snackActions } from '../../lib/snackbar';
import { parseIPString } from '../../lib/utils';
import { meState } from '../../lib/state';
import {
    addSessionRoutes,
    removeSessionRoutes,
    stopOperationSocks,
    ensureOperationSocks,
    suggestSubnetsFromIps,
} from '../Metasploit/msfSocks';
import {
    useMsfOperationTunnel,
    type MsfOperationTunnel,
} from '../Metasploit/msfTunnelStore';
import { MSF_SOCKS_PORT_MIN, MSF_SOCKS_PORT_MAX } from '../../lib/msfSocksAllocator';

interface Props {
    open: boolean;
    onClose: () => void;
    /** The session whose row opened the dialog (its routes get the editable textarea). */
    sessionId: string;
    /** "user@host" for the focused-session chip. */
    label: string;
    /** Raw `ip` field from that callback — used to pre-fill auto-detected /24s. */
    ipField: string | null | undefined;
}

export function MsfSocksDialog({ open, onClose, sessionId, label, ipField }: Props) {
    const me = useReactiveVar(meState);
    const opId = me.user?.current_operation_id ?? 0;
    const tunnel = useMsfOperationTunnel(opId);

    // Pre-fill the editable textarea from this session's current routes
    // (if any) or from auto-detected /24s derived from the callback IPs.
    const initialSubnets = useMemo(() => {
        const cached = tunnel?.sessions?.[sessionId]?.subnets;
        if (cached && cached.length > 0) return cached;
        const ips = parseIPString(ipField || '');
        return suggestSubnetsFromIps(ips);
    }, [tunnel, sessionId, ipField]);

    const [subnetText, setSubnetText] = useState(initialSubnets.join('\n'));
    const [busy, setBusy] = useState(false);
    const [hostHint, setHostHint] = useState<string>(window.location.hostname || 'mythic-host');

    useEffect(() => {
        if (open) setSubnetText(initialSubnets.join('\n'));
    }, [open, initialSubnets]);

    const parseSubnets = (text: string): string[] =>
        text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

    const handleApply = async () => {
        if (!opId) {
            snackActions.error('No active operation.');
            return;
        }
        const subnets = parseSubnets(subnetText);
        setBusy(true);
        try {
            // Ensure the per-op SOCKS exists, then push routes for THIS session.
            await ensureOperationSocks(opId);
            await addSessionRoutes(opId, sessionId, subnets);
            snackActions.success(subnets.length > 0
                ? `Routes saved (${subnets.length} subnet${subnets.length > 1 ? 's' : ''})`
                : 'Routes cleared');
        } catch (e: any) {
            snackActions.error(e?.message || 'Failed to update routes');
        } finally {
            setBusy(false);
        }
    };

    const handleDetachSession = async () => {
        if (!opId) return;
        if (!window.confirm(`Detach session MSF-${sessionId} from the operation tunnel?`)) return;
        setBusy(true);
        try {
            await removeSessionRoutes(opId, sessionId);
            snackActions.success('Session detached');
        } catch (e: any) {
            snackActions.error(e?.message || 'Detach failed');
        } finally {
            setBusy(false);
        }
    };

    const handleStopTunnel = async () => {
        if (!opId) return;
        if (!window.confirm(
            'Stop the entire SOCKS proxy for this operation?\n\n' +
            'All teammates will lose access. The bootstrap will reopen it when the next session arrives.'
        )) return;
        setBusy(true);
        try {
            await stopOperationSocks(opId);
            snackActions.success('Operation SOCKS stopped');
            onClose();
        } catch (e: any) {
            snackActions.error(e?.message || 'Stop failed');
        } finally {
            setBusy(false);
        }
    };

    const otherSessions = useMemo(() => {
        if (!tunnel) return [];
        return Object.entries(tunnel.sessions)
            .filter(([sid]) => sid !== sessionId)
            .map(([sid, info]) => ({ sid, subnets: info.subnets, attachedAt: info.attachedAt }));
    }, [tunnel, sessionId]);

    // Closed-state guard below every hook. Above them it skipped the useMemo
    // further down, so opening the dialog changed the hook count mid-life —
    // React's "rendered more hooks than during the previous render" crash.
    if (!open) return null;

    const focusedExistingSubnets = tunnel?.sessions[sessionId]?.subnets ?? [];

    return (
        <CyberModal
            onClose={busy ? () => { /* block close while busy */ } : onClose}
            title={tunnel ? 'MSF SOCKS — Operation Tunnel' : 'MSF SOCKS — Starting…'}
            icon={<Network />}
            maxWidth="max-w-2xl"
        >
            <div className="space-y-5">
                {/* Operation summary */}
                <OperationSummary
                    tunnel={tunnel}
                    opId={opId}
                    hostHint={hostHint}
                    onHostHintChange={setHostHint}
                />

                {/* Focused session: editable routes */}
                <FocusedSessionEditor
                    sessionId={sessionId}
                    label={label}
                    subnetText={subnetText}
                    onSubnetTextChange={setSubnetText}
                    existing={focusedExistingSubnets}
                    onDetach={handleDetachSession}
                    onApply={handleApply}
                    busy={busy}
                />

                {/* Other attached sessions in this operation */}
                {otherSessions.length > 0 && (
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ghost mb-2">
                            Other routed sessions ({otherSessions.length})
                        </div>
                        <div className="space-y-1">
                            {otherSessions.map(s => (
                                <div key={s.sid}
                                     className="flex items-start gap-3 text-xs font-mono bg-black/40 border border-white/10 px-3 py-2">
                                    <span className="text-signal w-20 shrink-0">MSF-{s.sid}</span>
                                    <span className="flex-1 text-ghost">
                                        {s.subnets.length > 0 ? s.subnets.join('  ·  ') : '— (no routes)'}
                                    </span>
                                    <span className="text-[10px] text-ghost shrink-0">
                                        {new Date(s.attachedAt).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                    <button
                        onClick={handleStopTunnel}
                        disabled={busy || !tunnel}
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider bg-red-500/5 text-red-400/80 hover:bg-red-500/15 border border-red-500/20 transition-colors disabled:opacity-30"
                        title="Stop the operation SOCKS — bootstrap will reopen on next session"
                    >
                        <Power size={12} /> Stop Op Tunnel
                    </button>
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-ghost hover:text-signal transition-colors disabled:opacity-30"
                    >
                        Close
                    </button>
                </div>
            </div>
        </CyberModal>
    );
}

function OperationSummary({
    tunnel, opId, hostHint, onHostHintChange,
}: {
    tunnel: MsfOperationTunnel | undefined;
    opId: number;
    hostHint: string;
    onHostHintChange: (s: string) => void;
}) {
    if (!tunnel) {
        return (
            <div className="bg-black/40 border border-amber-500/30 px-3 py-3 text-xs font-mono text-amber-300 flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                Bootstrapping SOCKS for operation #{opId} (range {MSF_SOCKS_PORT_MIN}-{MSF_SOCKS_PORT_MAX})…
            </div>
        );
    }
    const line = `socks5 ${hostHint || 'mythic-host'} ${tunnel.port}`;
    const sessionCount = Object.keys(tunnel.sessions).length;
    const copy = () => {
        navigator.clipboard.writeText(line);
        snackActions.success('proxychains4 line copied');
    };
    return (
        <>
            <div className="grid grid-cols-4 gap-3 text-xs font-mono">
                <Field label="Operation" value={`#${opId}`} />
                <Field label="Host port" value={String(tunnel.port)} highlight />
                <Field label="Sessions" value={String(sessionCount)} />
                <Field label="Job id" value={tunnel.jobId ?? '—'} />
            </div>
            <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ghost mb-2">
                    proxychains4.conf — append to <span className="text-signal">[ProxyList]</span>
                </div>
                <div className="flex gap-2 items-stretch">
                    <input
                        value={hostHint}
                        onChange={e => onHostHintChange(e.target.value)}
                        placeholder="mythic-host or IP"
                        className="w-32 font-mono text-xs bg-black/40 border border-white/10 px-2 py-1 text-signal focus:outline-none focus:border-accent/40"
                    />
                    <div className="flex-1 font-mono text-sm bg-black/60 border border-accent/30 px-3 py-2 text-accent flex items-center">
                        {line}
                    </div>
                    <button
                        onClick={copy}
                        className="px-3 text-xs font-mono uppercase tracking-wider text-ghost hover:text-signal border border-white/10 hover:border-white/20 transition-colors"
                        title="Copy proxychains line"
                    >
                        <Copy size={14} />
                    </button>
                </div>
            </div>
        </>
    );
}

function FocusedSessionEditor({
    sessionId, label, subnetText, onSubnetTextChange, existing, onDetach, onApply, busy,
}: {
    sessionId: string;
    label: string;
    subnetText: string;
    onSubnetTextChange: (s: string) => void;
    existing: string[];
    onDetach: () => void;
    onApply: () => void;
    busy: boolean;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ghost">
                    Routes for <span className="text-signal">MSF-{sessionId}</span>
                    <span className="text-ghost"> · {label}</span>
                </div>
                {existing.length > 0 && (
                    <button onClick={onDetach}
                            disabled={busy}
                            className="text-[10px] font-mono text-red-400 hover:text-red-300 disabled:opacity-30">
                        Detach
                    </button>
                )}
            </div>
            <textarea
                value={subnetText}
                onChange={e => onSubnetTextChange(e.target.value)}
                spellCheck={false}
                rows={4}
                placeholder="192.168.1.0/24"
                className="w-full font-mono text-sm bg-black/40 border border-white/10 px-3 py-2 text-signal placeholder:text-ghost/50 focus:outline-none focus:border-accent/40 resize-none"
            />
            <div className="flex items-center justify-between mt-2">
                <div className="text-[10px] font-mono text-ghost">
                    One CIDR per line. Bare IPs default to /24.
                </div>
                <button
                    onClick={onApply}
                    disabled={busy}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 transition-colors disabled:opacity-30"
                >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                    Apply
                </button>
            </div>
        </div>
    );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="bg-black/40 border border-white/10 px-3 py-2">
            <div className="text-[9px] tracking-[0.25em] text-ghost mb-1 uppercase">{label}</div>
            <div className={`text-sm tabular-nums ${highlight ? 'text-accent' : 'text-signal'}`}>{value}</div>
        </div>
    );
}
