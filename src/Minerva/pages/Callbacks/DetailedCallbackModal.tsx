import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
    Server,
    Info,
    FileText,
    RefreshCw,
    Download,
    ToggleRight,
    ToggleLeft,
    Bell,
    BellOff,
    Minus,
    Plus,
}from 'lucide-react';
import { cn, getErrorMessage, parseIPString } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    ADD_LOADED_COMMAND,
    REMOVE_LOADED_COMMAND,
    GET_CALLBACK_COMMANDS_FOR_TRANSFER,
    GET_RUNNING_EGRESS_C2_PROFILES,
    HOST_FILE_MUTATION,
    PAYLOAD_CALLBACK_ALLOWED_MUTATION,
    GET_CALLBACK_FULL_DETAILS,
} from '../../lib/api';
import { CyberModal } from '../../components/CyberModal';

export const DetailedCallbackModal = ({ callbackId, onClose }: { callbackId: number; onClose: () => void }) => {
    const { data, loading, refetch: refetchDetails } = useQuery(GET_CALLBACK_FULL_DETAILS, {
        variables: { callback_id: callbackId }, fetchPolicy: 'no-cache',
    });
    const { data: xferData } = useQuery(GET_CALLBACK_COMMANDS_FOR_TRANSFER, {
        variables: { callback_id: callbackId }, fetchPolicy: 'no-cache',
    });
    const [addCmd] = useMutation(ADD_LOADED_COMMAND);
    const [removeCmd] = useMutation(REMOVE_LOADED_COMMAND);
    const [updateCallbackAllowed] = useMutation(PAYLOAD_CALLBACK_ALLOWED_MUTATION);
    const [hostFileMutation] = useMutation(HOST_FILE_MUTATION);
    const { data: egressC2Data } = useQuery(GET_RUNNING_EGRESS_C2_PROFILES, { fetchPolicy: 'network-only' });
    const [cmdOpStatus, setCmdOpStatus] = useState<Record<number, 'adding' | 'removing' | 'done' | 'err'>>({});
    const [cmdBulkProgress, setCmdBulkProgress] = useState<{ current: number; total: number; type: 'adding' | 'removing' } | null>(null);
    const [hostFileModal, setHostFileModal] = useState(false);
    const [hostFileC2Id, setHostFileC2Id] = useState<number | null>(null);
    const [hostFileUrl, setHostFileUrl] = useState('/payload');
    const [hostFileAlert, setHostFileAlert] = useState(false);
    const cb = data?.callback_by_pk;
    const allPayloadCmds: any[] = xferData?.callback_by_pk?.payload?.payloadtype?.commands || [];
    const loadedCmdIds = new Set((cb?.loadedcommands || []).map((lc: any) => lc.command?.id));

    if (loading) return (
        <CyberModal title="CALLBACK_DETAILS" onClose={onClose} icon={<Info />}>
            <div className="flex items-center justify-center h-40"><RefreshCw size={20} className="animate-spin text-signal/50" /></div>
        </CyberModal>
    );
    if (!cb) return (
        <CyberModal title="CALLBACK_DETAILS" onClose={onClose} icon={<Info />}>
            <div className="text-gray-500 text-sm text-center py-8">No callback data found</div>
        </CyberModal>
    );

    const handleAddCommand = async (cmdId: number) => {
        setCmdOpStatus(p => ({ ...p, [cmdId]: 'adding' }));
        try {
            await addCmd({ variables: { command_id: cmdId, callback_id: callbackId } });
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            refetchDetails();
        } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
    };
    const handleRemoveCommand = async (loadedId: number, cmdId: number) => {
        setCmdOpStatus(p => ({ ...p, [cmdId]: 'removing' }));
        try {
            await removeCmd({ variables: { id: loadedId } });
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            refetchDetails();
        } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
    };

    // Bulk add/remove with progress tracking
    const handleBulkAddCommands = async (cmdIds: number[]) => {
        if (cmdIds.length === 0) return;
        setCmdBulkProgress({ current: 0, total: cmdIds.length, type: 'adding' });
        for (let i = 0; i < cmdIds.length; i++) {
            const cmdId = cmdIds[i];
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'adding' }));
            setCmdBulkProgress({ current: i + 1, total: cmdIds.length, type: 'adding' });
            try {
                await addCmd({ variables: { command_id: cmdId, callback_id: callbackId } });
                setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
        }
        await refetchDetails();
        setCmdBulkProgress(null);
    };
    const handleBulkRemoveCommands = async (cmdsToRemove: Array<{ loadedId: number; cmdId: number }>) => {
        if (cmdsToRemove.length === 0) return;
        setCmdBulkProgress({ current: 0, total: cmdsToRemove.length, type: 'removing' });
        for (let i = 0; i < cmdsToRemove.length; i++) {
            const { loadedId, cmdId } = cmdsToRemove[i];
            setCmdOpStatus(p => ({ ...p, [cmdId]: 'removing' }));
            setCmdBulkProgress({ current: i + 1, total: cmdsToRemove.length, type: 'removing' });
            try {
                await removeCmd({ variables: { id: loadedId } });
                setCmdOpStatus(p => ({ ...p, [cmdId]: 'done' }));
            } catch { setCmdOpStatus(p => ({ ...p, [cmdId]: 'err' })); }
        }
        await refetchDetails();
        setCmdBulkProgress(null);
    };

    const handleCallbackAllowedToggle = async () => {
        if (!cb?.payload?.uuid) return;
        const newVal = !(cb.payload.callback_allowed ?? true);
        try {
            await updateCallbackAllowed({ variables: { payload_uuid: cb.payload.uuid, callback_allowed: newVal } });
            snackActions.success(`Callback ${newVal ? 'allowed' : 'blocked'}`);
            refetchDetails();
        } catch (e: unknown) { snackActions.error('Failed: ' + getErrorMessage(e)); }
    };

    const handleHostFile = async () => {
        if (!hostFileC2Id || !hostFileUrl.trim()) {
            snackActions.warning('Select a C2 profile and enter a URL');
            return;
        }
        const fileUuid = cb?.payload?.filemetum?.agent_file_id;
        if (!fileUuid) { snackActions.error('No payload file available'); return; }
        try {
            const result: any = await hostFileMutation({
                variables: { c2_id: hostFileC2Id, file_uuid: fileUuid, host_url: hostFileUrl, alert_on_download: hostFileAlert, remove: false }
            });
            if (result?.data?.c2HostFile?.status === 'success') {
                snackActions.success('Payload hosted through C2');
                setHostFileModal(false);
            } else {
                snackActions.error(result?.data?.c2HostFile?.error || 'Failed to host payload');
            }
        } catch (e: unknown) { snackActions.error('Error: ' + getErrorMessage(e)); }
    };

    const fileId = cb.payload?.filemetum?.agent_file_id;

    return (
        <CyberModal title={`CALLBACK #${cb.display_id} — ${cb.user}@${cb.host}`} onClose={onClose} icon={<Info />}>
            <div className="max-h-[75vh] overflow-y-auto space-y-4 cyber-scrollbar pr-2 w-[580px] max-w-full">

                {/* CALLBACK INFO */}
                <DetailSection label="CALLBACK INFO" rows={[
                    ['Display ID', `#${cb.display_id}`],
                    ['Agent UUID', cb.agent_callback_id],
                    ['User', cb.user],
                    ['Host', cb.host],
                    ['Domain', cb.domain || '—'],
                    ['IP', parseIPString(cb.ip).join(', ')],
                    ['External IP', cb.external_ip || '—'],
                    ['OS', cb.os],
                    ['Architecture', cb.architecture],
                    ['PID', cb.pid],
                    ['Process Name', cb.process_name || '—'],
                    ['Integrity Level', cb.integrity_level],
                    ['Groups', (cb.mythictree_groups || []).join(', ') || '—'],
                    ['Sleep Info', cb.sleep_info || '—'],
                    ['Locked', cb.locked ? 'Yes' : 'No'],
                    ['Init Callback', cb.init_callback || '—'],
                    ['Last Checkin', cb.last_checkin ? new Date(cb.last_checkin + 'Z').toLocaleString() : '—'],
                    ['CWD', cb.cwd || '—'],
                    ['Impersonation', cb.impersonation_context || '—'],
                    ['Extra Info', cb.extra_info || '—'],
                    ['Description', cb.description || '—'],
                ]} />

                {/* PAYLOAD INFO */}
                <div>
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">PAYLOAD INFO</div>
                    <div className="space-y-1">
                        {[
                            ['Payload Type', cb.payload?.payloadtype?.name || '—'],
                            ['Creator', cb.payload?.operator?.username || '—'],
                            ['Payload UUID', cb.payload?.uuid || '—'],
                            ['Filename', cb.payload?.filemetum?.filename_text || '—'],
                            ['MD5', cb.payload?.filemetum?.md5 || '—'],
                            ['SHA1', cb.payload?.filemetum?.sha1 || '—'],
                            ['Payload OS', cb.payload?.os || '—'],
                            ['Created', cb.payload?.creation_time ? new Date(cb.payload.creation_time).toLocaleString() : '—'],
                        ].map(([k, v], i) => (
                            <div key={i} className="flex gap-3 text-xs">
                                <span className="text-gray-500 font-mono min-w-[140px] shrink-0">{k}</span>
                                <span className="text-gray-300 font-mono break-all">{String(v)}</span>
                            </div>
                        ))}
                        {fileId && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                                <a href={`/api/v1.4/files/download/${fileId}`} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-signal/30 text-signal/70 hover:text-signal hover:border-signal/60 transition-colors rounded-sm">
                                    <Download size={10} /> Download Payload
                                </a>
                                <button
                                    onClick={() => setHostFileModal(true)}
                                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-blue-500/30 text-blue-400/70 hover:text-blue-400 hover:border-blue-500/60 transition-colors rounded-sm"
                                >
                                    <Server size={10} /> Host Through C2
                                </button>
                            </div>
                        )}
                        {/* Callback Allowed Toggle */}
                        {cb.payload?.uuid && (
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                                <span className="text-gray-500 font-mono text-xs min-w-[140px] shrink-0">Callback Allowed</span>
                                <button
                                    onClick={handleCallbackAllowedToggle}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border transition-colors rounded-sm',
                                        (cb.payload.callback_allowed ?? true)
                                            ? 'border-signal/40 text-signal bg-signal/10 hover:bg-signal/20'
                                            : 'border-red-500/40 text-red-400 bg-red-900/10 hover:bg-red-900/20'
                                    )}
                                >
                                    {(cb.payload.callback_allowed ?? true)
                                        ? <><ToggleRight size={12} /> ALLOWED</>
                                        : <><ToggleLeft size={12} /> BLOCKED</>
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* HOST THROUGH C2 MODAL */}
                {hostFileModal && (
                    <CyberModal title="HOST_PAYLOAD_THROUGH_C2" onClose={() => setHostFileModal(false)} icon={<Server />}>
                        <div className="space-y-4 min-w-[360px]">
                            <p className="text-xs text-gray-400 font-mono">Select a running C2 profile to host the payload through.</p>

                            {/* C2 Profile Selector */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">C2_PROFILE</label>
                                <div className="grid gap-1.5 max-h-36 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {(egressC2Data?.c2profile || []).map((c2: any) => (
                                        <button
                                            key={c2.id}
                                            onClick={() => setHostFileC2Id(c2.id)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors',
                                                hostFileC2Id === c2.id
                                                    ? 'border-signal bg-signal/10 text-signal'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            )}
                                        >
                                            <Server size={12} /> {c2.name}
                                        </button>
                                    ))}
                                    {(egressC2Data?.c2profile || []).length === 0 && (
                                        <div className="text-gray-500 text-xs font-mono p-2 text-center">NO_RUNNING_C2_PROFILES</div>
                                    )}
                                </div>
                            </div>

                            {/* Host URL */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">HOST_URL</label>
                                <input
                                    value={hostFileUrl}
                                    onChange={e => setHostFileUrl(e.target.value)}
                                    placeholder="/payload"
                                    className="w-full bg-black/50 border border-gray-700 focus:border-signal/60 px-3 py-2 text-xs font-mono text-gray-200 outline-none transition-colors"
                                />
                            </div>

                            {/* Alert on download */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-gray-500">Alert on Download</span>
                                <button
                                    onClick={() => setHostFileAlert(p => !p)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border transition-colors rounded-sm',
                                        hostFileAlert
                                            ? 'border-orange-500/40 text-orange-400 bg-orange-900/10'
                                            : 'border-gray-700 text-gray-500'
                                    )}
                                >
                                    {hostFileAlert ? <><Bell size={11} /> ON</> : <><BellOff size={11} /> OFF</>}
                                </button>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setHostFileModal(false)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs">CANCEL</button>
                                <button
                                    onClick={handleHostFile}
                                    disabled={!hostFileC2Id || !hostFileUrl.trim()}
                                    className="px-4 py-2 border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    HOST_FILE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}

                {/* BUILD STEPS */}
                {(cb.payload?.payload_build_steps || []).length > 0 && (
                    <div>
                        <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">BUILD STEPS ({cb.payload.payload_build_steps.length})</div>
                        <div className="space-y-1">
                            {cb.payload.payload_build_steps.map((s: any) => (
                                <div key={s.id} className="flex items-start gap-2 text-xs font-mono">
                                    <span className={cn('shrink-0 mt-0.5', s.step_skip ? 'text-gray-600' : s.step_success ? 'text-green-400' : 'text-red-400')}>
                                        {s.step_skip ? '⊘' : s.step_success ? '✓' : '✗'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-gray-300">{s.step_name}</span>
                                        {s.step_description && <span className="text-gray-600 ml-2 text-[10px]">{s.step_description}</span>}
                                        {!s.step_success && !s.step_skip && s.step_stderr && (
                                            <pre className="text-red-400/80 text-[10px] mt-0.5 whitespace-pre-wrap break-all">{s.step_stderr}</pre>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* PORT FORWARDERS */}
                {(cb.callbackports || []).length > 0 && (
                    <DetailSection label={`PORT_FORWARDERS (${cb.callbackports.length})`}
                        rows={cb.callbackports.map((p: any) => [
                            `${p.port_type || 'port'} :${p.local_port}`,
                            p.remote_ip ? `→ ${p.remote_ip}:${p.remote_port || '?'}` : '(local only)'
                        ])} />
                )}

                {/* C2 PROFILE PARAMETERS */}
                {(cb.c2profileparametersinstances || []).length > 0 && (() => {
                    const byProfile: Record<string, any[]> = {};
                    cb.c2profileparametersinstances.forEach((pi: any) => {
                        const name = pi.c2profile?.name || '?';
                        if (!byProfile[name]) byProfile[name] = [];
                        byProfile[name].push(pi);
                    });
                    return Object.entries(byProfile).map(([profileName, params]) => (
                        <div key={profileName}>
                            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">C2 PARAMS — {profileName}</div>
                            <div className="space-y-1">
                                {params.map((pi: any, i: number) => (
                                    <div key={i} className="text-xs font-mono">
                                        <div className="flex gap-3">
                                            <span className="text-gray-500 min-w-[140px] shrink-0">{pi.c2profileparameter?.description || '?'}</span>
                                            <span className="text-gray-300 break-all">{pi.value || '—'}</span>
                                        </div>
                                        {(pi.enc_key_base64 || pi.dec_key_base64) && (
                                            <div className="ml-[152px] mt-0.5 space-y-0.5">
                                                {pi.enc_key_base64 && <div className="text-[10px] text-yellow-600/80">enc: {pi.enc_key_base64}</div>}
                                                {pi.dec_key_base64 && <div className="text-[10px] text-cyan-600/80">dec: {pi.dec_key_base64}</div>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ));
                })()}

                {/* BUILD PARAMETERS */}
                {(cb.payload?.buildparameterinstances || []).length > 0 && (
                    <DetailSection label="BUILD PARAMETERS"
                        rows={cb.payload.buildparameterinstances.map((bp: any) => [
                            bp.buildparameter?.description || '?',
                            bp.value || '—'
                        ])} />
                )}

                {/* LOADED COMMANDS */}
                <div>
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2 flex items-center gap-2">
                        LOADED COMMANDS ({(cb.loadedcommands || []).length})
                        {(cb.loadedcommands || []).length > 0 && (
                            <button
                                onClick={() => handleBulkRemoveCommands((cb.loadedcommands || []).map((lc: any) => ({ loadedId: lc.id, cmdId: lc.command?.id })))}
                                disabled={!!cmdBulkProgress}
                                className="ml-auto flex items-center gap-1 px-1.5 py-0.5 border border-red-500/20 text-red-500/60 hover:text-red-400 hover:border-red-500/40 transition-colors text-[9px] disabled:opacity-30"
                            >
                                <Minus size={8} /> REMOVE ALL
                            </button>
                        )}
                    </div>

                    {/* Bulk progress bar */}
                    {cmdBulkProgress && (
                        <div className="mb-2">
                            <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 mb-1">
                                <span>{cmdBulkProgress.type === 'adding' ? 'ADDING' : 'REMOVING'} COMMANDS...</span>
                                <span>{cmdBulkProgress.current}/{cmdBulkProgress.total}</span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded overflow-hidden">
                                <div
                                    className={cn('h-full transition-all duration-200', cmdBulkProgress.type === 'adding' ? 'bg-signal' : 'bg-red-500')}
                                    style={{ width: `${(cmdBulkProgress.current / cmdBulkProgress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        {(cb.loadedcommands || []).map((lc: any) => {
                            const st = cmdOpStatus[lc.command?.id];
                            return (
                                <div key={lc.id} className="flex items-center gap-3 text-xs font-mono">
                                    <span className="text-gray-300 flex-1">{lc.command?.cmd || '?'}</span>
                                    <span className="text-gray-600 text-[10px]">
                                        m:v{lc.command?.version || '?'} / l:v{lc.version || '?'}
                                    </span>
                                    {lc.command?.cmd && cb.payload?.payloadtype?.name && (
                                        <a href={`/docs/agents/${cb.payload.payloadtype.name}/commands/${lc.command.cmd}`} target="_blank" rel="noreferrer"
                                            className="flex items-center gap-1 px-1.5 py-0.5 border border-blue-500/30 text-blue-400 hover:bg-blue-900/20 transition-colors text-[10px]">
                                            <FileText size={8} /> DOCS
                                        </a>
                                    )}
                                    <button onClick={() => handleRemoveCommand(lc.id, lc.command?.id)}
                                        disabled={!!st && st !== 'done' && st !== 'err'}
                                        className="flex items-center gap-1 px-1.5 py-0.5 border border-red-500/30 text-red-400 hover:bg-red-900/20 transition-colors text-[10px] disabled:opacity-40">
                                        {st === 'removing' ? <RefreshCw size={8} className="animate-spin" /> : <Minus size={8} />} REMOVE
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    {/* Add commands from payload type */}
                    {allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).length > 0 && (
                        <details className="mt-3">
                            <summary className="cursor-pointer text-[10px] font-mono text-gray-600 hover:text-gray-400 transition-colors select-none uppercase tracking-widest flex items-center justify-between">
                                <span>+ Add Commands ({allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).length} available)</span>
                                <button
                                    onClick={(e) => { e.preventDefault(); handleBulkAddCommands(allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).map((c: any) => c.id)); }}
                                    disabled={!!cmdBulkProgress}
                                    className="flex items-center gap-1 px-1.5 py-0.5 border border-signal/20 text-signal/60 hover:text-signal hover:border-signal/40 transition-colors text-[9px] disabled:opacity-30"
                                >
                                    <Plus size={8} /> ADD ALL
                                </button>
                            </summary>
                            <div className="mt-2 space-y-1 border border-white/5 rounded p-2 max-h-48 overflow-y-auto cyber-scrollbar">
                                {allPayloadCmds.filter((c: any) => !loadedCmdIds.has(c.id)).map((cmd: Record<string, unknown>) => {
                                    const st = cmdOpStatus[cmd.id];
                                    return (
                                        <div key={cmd.id} className="flex items-center gap-3 text-xs font-mono">
                                            <span className="text-gray-400 flex-1">{cmd.cmd}</span>
                                            <button onClick={() => handleAddCommand(cmd.id)}
                                                disabled={!!st && st !== 'done' && st !== 'err'}
                                                className="flex items-center gap-1 px-1.5 py-0.5 border border-signal/30 text-signal/70 hover:bg-signal/10 transition-colors text-[10px] disabled:opacity-40">
                                                {st === 'adding' ? <RefreshCw size={8} className="animate-spin" /> : <Plus size={8} />} ADD
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                    )}
                </div>
            </div>
        </CyberModal>
    );
};

/* Helper: simple key-value section */
export const DetailSection = ({ label, rows }: { label: string; rows: [string, any][] }) => (
    <div>
        <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">{label}</div>
        <div className="space-y-1">
            {rows.map(([k, v], i) => (
                <div key={i} className="flex gap-3 text-xs">
                    <span className="text-gray-500 font-mono min-w-[140px] shrink-0">{k}</span>
                    <span className="text-gray-300 font-mono break-all">{String(v)}</span>
                </div>
            ))}
        </div>
    </div>
);

/* ─────────── Color Picker Modal ─────────── */

