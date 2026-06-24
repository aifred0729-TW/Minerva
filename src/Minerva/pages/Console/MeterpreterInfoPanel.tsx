/**
 * MeterpreterInfoPanel — side panel content for MSF sessions inside the
 * unified /console/:id page. Replaces InfoPanel when the route points at an
 * MSF session.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Copy, Crosshair, CircleStop, ArrowUpRight } from 'lucide-react';
import { snackActions } from '../../lib/snackbar';
import { killSession as killMsfSession, type MsfSession } from '../Metasploit/msfrpc';
import { pickMsfUser, pickMsfHost } from '../Callbacks/msfSyntheticCallbacks';

interface MeterpreterInfoPanelProps {
    sessionId: string;
    session: MsfSession | null;
    connectionLost: boolean;
    onKilled: () => void;
}

function InfoRow({ label, value, mono = true }: { label: string; value?: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-signal uppercase tracking-[0.25em]">{label}</span>
            <span className={mono ? 'text-[12px] font-mono text-signal break-all' : 'text-[12px] text-signal break-all'}>
                {value || <span className="text-signal/60">—</span>}
            </span>
        </div>
    );
}

export function MeterpreterInfoPanel({ sessionId, session, connectionLost, onKilled }: MeterpreterInfoPanelProps) {
    const sessionType = session?.type || 'meterpreter';
    // `username` is often empty on freshly-opened meterpreter sessions; the
    // real user lives inside `info` ("user @ hostname"). Same for hostname —
    // session_host is an IP, the actual hostname is parsed from `info`.
    const resolvedUser = session ? pickMsfUser(session) : null;
    const resolvedHost = session ? pickMsfHost(session) : null;

    const handleKill = async () => {
        if (!window.confirm(`Kill MSF session ${sessionId}?`)) return;
        try {
            await killMsfSession(sessionId);
            snackActions.success(`Session ${sessionId} killed`);
            onKilled();
        } catch (e: any) {
            snackActions.error(`Failed to kill session: ${e?.message || e}`);
        }
    };

    return (
        <div className="h-full overflow-y-auto cyber-scrollbar pr-1 space-y-4">
            {/* Session identity */}
            <section className="border border-signal/20 bg-machine/40 p-3 rounded-md space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-signal uppercase tracking-[0.25em]">
                        <Crosshair size={12} className="text-red-500" />
                        Session
                    </div>
                    <span className="text-[10px] font-mono text-signal border border-signal/30 px-2 py-0.5 rounded-sm uppercase tracking-[0.2em]">
                        {sessionType}
                    </span>
                </div>
                <InfoRow label="MSF ID" value={<span className="text-red-500 font-bold">MSF-{sessionId}</span>} />
                <InfoRow label="STATUS" value={
                    connectionLost
                        ? <span className="text-red-500 font-bold">DISCONNECTED</span>
                        : <span className="text-accent font-bold">LIVE</span>
                } />
                <InfoRow label="USERNAME" value={resolvedUser} />
                <InfoRow label="WORKSPACE" value={session?.workspace} />
            </section>

            {/* Target */}
            <section className="border border-signal/20 bg-machine/40 p-3 rounded-md space-y-3">
                <div className="text-[11px] font-mono text-signal uppercase tracking-[0.25em]">Target</div>
                <InfoRow label="HOSTNAME" value={resolvedHost} />
                <InfoRow
                    label="ADDRESS"
                    value={session
                        ? `${session.session_host || session.target_host || '—'}${session.session_port ? ':' + session.session_port : ''}`
                        : undefined}
                />
                <InfoRow label="PLATFORM" value={session ? `${session.platform || '—'} / ${session.arch || '—'}` : undefined} />
                <InfoRow label="TUNNEL" value={session?.tunnel_peer || session?.tunnel_local} />
                <InfoRow label="ROUTES" value={session?.routes} />
            </section>

            {/* Origin */}
            <section className="border border-signal/20 bg-machine/40 p-3 rounded-md space-y-3">
                <div className="text-[11px] font-mono text-signal uppercase tracking-[0.25em]">Origin</div>
                <InfoRow label="VIA EXPLOIT" value={session?.via_exploit} />
                <InfoRow label="VIA PAYLOAD" value={session?.via_payload} />
                <InfoRow label="INFO" value={session?.info} />
                <InfoRow label="DESC" value={session?.desc} />
            </section>

            {/* Identity / UUID */}
            <section className="border border-signal/20 bg-machine/40 p-3 rounded-md space-y-3">
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-mono text-signal uppercase tracking-[0.25em]">UUIDs</div>
                    {session?.uuid && (
                        <button
                            onClick={() => { navigator.clipboard.writeText(session.uuid); snackActions.success('UUID copied'); }}
                            className="flex items-center gap-1 text-[10px] font-mono text-signal hover:text-accent transition-colors"
                        >
                            <Copy size={10} /> COPY
                        </button>
                    )}
                </div>
                <InfoRow label="SESSION UUID" value={session?.uuid} />
                <InfoRow label="EXPLOIT UUID" value={session?.exploit_uuid} />
            </section>

            {/* Quick command hints — meterpreter-only */}
            {sessionType === 'meterpreter' && (
                <section className="border border-signal/20 bg-machine/40 p-3 rounded-md space-y-2">
                    <div className="text-[11px] font-mono text-signal uppercase tracking-[0.25em]">Quick Commands</div>
                    <ul className="text-[11px] font-mono text-signal space-y-0.5">
                        <li><span className="text-accent">sysinfo</span> — host fingerprint</li>
                        <li><span className="text-accent">getuid</span> — effective user</li>
                        <li><span className="text-accent">getpid</span> / <span className="text-accent">ps</span> — process list</li>
                        <li><span className="text-accent">ls</span> / <span className="text-accent">pwd</span> — filesystem</li>
                        <li><span className="text-accent">download</span> &lt;path&gt; — pull file</li>
                        <li><span className="text-accent">background</span> — return to msfconsole</li>
                    </ul>
                </section>
            )}

            {/* Actions */}
            <section className="border border-signal/20 bg-machine/40 p-3 rounded-md space-y-2">
                <div className="text-[11px] font-mono text-signal uppercase tracking-[0.25em]">Actions</div>
                <Link
                    to="/callbacks"
                    className="flex items-center justify-between text-[11px] font-mono text-signal border border-signal/20 hover:border-accent hover:text-accent px-2.5 py-1.5 rounded-sm transition-colors"
                >
                    <span>Back to Callbacks</span>
                    <ArrowUpRight size={11} />
                </Link>
                <button
                    onClick={handleKill}
                    disabled={connectionLost}
                    className="w-full flex items-center justify-between text-[11px] font-mono text-red-500 border border-red-500/40 hover:bg-red-500/10 px-2.5 py-1.5 rounded-sm transition-colors disabled:opacity-40"
                >
                    <span>Kill Session</span>
                    <CircleStop size={11} />
                </button>
            </section>
        </div>
    );
}
