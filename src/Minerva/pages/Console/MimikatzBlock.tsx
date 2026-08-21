import React, { useState, useMemo, useEffect } from 'react';
import { useMutation, useApolloClient } from "@apollo/client/react";
import { Key, Copy, Lock, Activity } from 'lucide-react';
import { CHECK_EXISTING_CREDENTIAL, CREATE_CREDENTIAL_MUT } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
    mzSplitSections,
    mzParseSam,
    mzParseSecrets,
    mzParseCache,
    mzParseLogon,
    mzParseDCSync,
    mzExtractAllCreds,
    mzIsSensitiveSecret,
} from '../../lib/mimikatzParser';

export { mzParseSam };

const CMD_CLS_MAP: Record<string, string> = {
    'privilege::debug':         'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
    'sekurlsa::logonpasswords': 'text-red-400   border-red-500/40   bg-red-900/10',
    'sekurlsa::ekeys':          'text-red-400   border-red-500/40   bg-red-900/10',
    'token::elevate':           'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::sam':             'text-red-400   border-red-500/40   bg-red-900/10',
    'lsadump::secrets':         'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::cache':           'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::dcsync':          'text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-900/10',
    'vault::cred /patch':       'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
};
// Cmd matching used by the renderer below; matches the base command so flag
// variants like `lsadump::dcsync /user:CORP\\Administrator` still resolve.
const baseCmdOf = (cmd: string): string => cmd.split(/\s+/)[0];

export const MimikatzBlock = ({ content, taskId, taskDisplayId, callbackHost, taskCommand }: {
    content: string; taskId: number; taskDisplayId: number; callbackHost: string;
    /** Originating command name (e.g. `sekurlsa::logonpasswords`). Used to
     *  synthesise a section header when the captured response has no
     *  leading `mimikatz(commandline) #` line — the typical shape for an
     *  MSF shell-mode task where each operator command is its own task and
     *  the prompt only shows up at the end of the response. */
    taskCommand?: string;
}) => {
    const client = useApolloClient();
    const [createCred] = useMutation<any>(CREATE_CREDENTIAL_MUT);
    const [vaultState, setVaultState] = useState<'idle'|'saving'|'saved'>('idle');
    const [savedCount, setSavedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);

    // ── Pre-split normalisation ──
    // Mythic's `execute-assembly mimikatz` produces a transcript where each
    // command is preceded by the prompt — mzSplitSections happily splits.
    // MSF shell-mode produces one task per command with the prompt only at
    // the END (or not at all), so the same split yields zero useful
    // sections. Detect that, synthesise a leading prompt from the task's
    // command name, and re-split — gives us a single section whose body is
    // the actual output (LSASS dump, NTLM hashes, etc.).
    let parserInput = content;
    {
        const initial = mzSplitSections(parserInput);
        if (!initial.sections.some(s => s.body.trim().length > 0)) {
            const synthCmd = (taskCommand && taskCommand.trim()) || '(shell)';
            parserInput = `mimikatz(commandline) # ${synthCmd}\n${content}`;
        }
    }
    const { sections: mzSections, version: mzVer } = mzSplitSections(parserInput);

    // Extract all harvestable creds (stable reference via memo keyed on taskId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const extractedCreds = useMemo(() => mzExtractAllCreds(mzSections), [taskId]);

    // Auto-save – once per task per session, with duplicate detection
    useEffect(() => {
        const key = `mz_v_${taskId}`;
        const existing = sessionStorage.getItem(key);
        if (existing !== null) {
            setVaultState('saved');
            setSavedCount(Number(sessionStorage.getItem(key + '_cnt') || 0));
            setSkippedCount(Number(sessionStorage.getItem(key + '_skip') || 0));
            return;
        }
        if (extractedCreds.length === 0) return;
        setVaultState('saving');
        (async () => {
            let saved = 0;
            let skipped = 0;
            for (const c of extractedCreds) {
                try {
                    const account = c.account || '(unknown)';
                    const realm   = c.realm   || '';
                    // Check if this credential already exists
                    const { data: checkData } = await client.query({
                        query: CHECK_EXISTING_CREDENTIAL,
                        variables: { account, realm, credential: c.credential, type: c.credType },
                        fetchPolicy: 'no-cache',
                    });
                    if ((checkData as any)?.credential?.length > 0) {
                        skipped++;
                        continue; // already exists, skip
                    }
                    const ts = new Date().toISOString().slice(0, 10);
                    const res = await createCred({ variables: {
                        account,
                        realm,
                        credential: c.credential,
                        type:    c.credType,
                        comment: `[AUTO:mimikatz] ${c.source} · Task #${taskDisplayId} · Host: ${callbackHost} · ${ts}`,
                    }});
                    if (res.data?.createCredential?.status !== 'error') saved++;
                } catch { /* ignore individual failures */ }
            }
            sessionStorage.setItem(key, '1');
            sessionStorage.setItem(key + '_cnt', String(saved));
            sessionStorage.setItem(key + '_skip', String(skipped));
            setVaultState('saved');
            setSavedCount(saved);
            setSkippedCount(skipped);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId]); // intentionally run once per task only

    const isSensitiveSecret = mzIsSensitiveSecret;

    return (
        <div className="space-y-2">
            {/* ── Banner ── */}
            <div className="flex items-center gap-2 flex-wrap border-b border-red-900/30 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-red-500/60 bg-red-900/25 text-red-400 rounded-sm">
                    ⚠ MIMIKATZ{mzVer ? ` ${mzVer}` : ''}
                </span>
                <span className="text-[9px] text-gray-600 font-mono">{mzSections.length} command{mzSections.length !== 1 ? 's' : ''}</span>
                {extractedCreds.length > 0 && (
                    <span className="text-[9px] text-red-400/70 font-mono">
                        · {extractedCreds.length} credential{extractedCreds.length !== 1 ? 's' : ''} extracted
                    </span>
                )}
                <span className="ml-auto">
                    {vaultState === 'saving' && (
                        <span className="flex items-center gap-1 text-[9px] text-yellow-400/80 font-mono animate-pulse">
                            <Activity size={10} className="animate-spin shrink-0" /> Saving to vault…
                        </span>
                    )}
                    {vaultState === 'saved' && extractedCreds.length > 0 && (
                        <span className="flex items-center gap-1 text-[9px] text-signal/80 font-mono">
                            <Key size={10} className="shrink-0" /> {savedCount} cred{savedCount !== 1 ? 's' : ''} saved to vault
                            {skippedCount > 0 && (
                                <span className="text-gray-500 ml-1">({skippedCount} duplicate{skippedCount !== 1 ? 's' : ''} skipped)</span>
                            )}
                        </span>
                    )}
                </span>
            </div>

            {/* ── Command sections ── */}
            {mzSections.map((sec, si) => {
                const baseCmd = baseCmdOf(sec.cmd);
                const cmdCls  = CMD_CLS_MAP[sec.cmd] || CMD_CLS_MAP[baseCmd] || 'text-gray-400 border-gray-600/50 bg-gray-800/20';
                const hasErr  = /ERROR kuhl/.test(sec.body);
                const hasOk   = /\bOK\b/.test(sec.body) || /Privilege.*OK/.test(sec.body);
                return (
                    <div key={si} className="border border-white/10 rounded-sm overflow-hidden bg-black/25">
                        {/* cmd header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30 border-b border-white/5 flex-wrap">
                            <span className="text-gray-700 text-[9px] font-mono shrink-0">mimikatz #</span>
                            <span className={cn('text-[9px] font-bold px-2 py-0.5 border rounded-sm shrink-0', cmdCls)}>{sec.cmd}</span>
                            {hasErr && <span className="text-red-500/80 text-[9px] font-bold">✗ FAILED</span>}
                            {hasOk  && <span className="text-signal text-[9px] font-bold">✓ OK</span>}
                        </div>
                        <div className="px-3 py-2 text-xs font-mono">

                            {/* ── lsadump::sam ── */}
                            {baseCmd === 'lsadump::sam' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const sysM  = sec.body.match(/SysKey\s+:\s*([a-f0-9]+)/i);
                                const samM  = sec.body.match(/SAMKey\s+:\s*([a-f0-9]+)/i);
                                const users = mzParseSam(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b border-white/5">
                                            {domM && <span><span className="text-gray-500">Domain </span><span className="text-cyan-300 font-bold">{domM[1].trim()}</span></span>}
                                            {sysM && <span><span className="text-gray-500">SysKey </span><span className="text-gray-400">{sysM[1]}</span></span>}
                                            {samM && <span><span className="text-gray-500">SAMKey </span><span className="text-gray-400">{samM[1]}</span></span>}
                                        </div>
                                        <div className="space-y-1.5">
                                            {users.map((u, ui) => (
                                                <div key={ui} className={cn('border rounded-sm px-2 py-1.5', u.ntlm ? 'border-red-500/40 bg-red-950/20' : 'border-gray-700/30 bg-black/10 opacity-60')}>
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="text-white font-bold text-sm">{u.name}</span>
                                                        <span className="text-gray-500 text-[10px]">RID {u.rid}</span>
                                                        {!u.ntlm && <span className="text-gray-500 italic text-[10px]">no hash</span>}
                                                    </div>
                                                    {u.ntlm && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase shrink-0">NTLM</span>
                                                            <span className="text-red-200 select-all text-[13px] tracking-wide break-all flex-1">{u.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(u.ntlm)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy hash"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {u.ntlmHist.length > 1 && (
                                                        <details className="mt-1">
                                                            <summary className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">{u.ntlmHist.length} historical hashes</summary>
                                                            <div className="mt-1 pl-2 border-l border-gray-700 space-y-0.5">
                                                                {u.ntlmHist.slice(1).map((h, hi) => (
                                                                    <div key={hi} className="flex gap-2 text-[10px]">
                                                                        <span className="text-gray-600 w-12 shrink-0">ntlm-{hi+1}</span>
                                                                        <span className="text-gray-400 select-all break-all flex-1">{h}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(h)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={10} className="text-gray-600 hover:text-white" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── lsadump::secrets ── */}
                            {baseCmd === 'lsadump::secrets' && (() => {
                                const domM   = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM  = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const secrets = mzParseSecrets(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b border-white/5">
                                            {domM  && <span><span className="text-gray-500">Domain </span><span className="text-cyan-300 font-bold">{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span className="text-gray-500">FQDN </span><span className="text-cyan-300/80">{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {secrets.map((s, si2) => {
                                            const sens = isSensitiveSecret(s.name);
                                            const active = s.curText && sens;
                                            return (
                                                <div key={si2} className={cn('border rounded-sm px-2 py-1.5', active ? 'border-red-500/50 bg-red-950/25' : 'border-gray-700/30 bg-black/10')}>
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <Lock size={11} className={cn('shrink-0', active ? 'text-red-400' : 'text-gray-600')} />
                                                        <span className={cn('font-bold text-sm', active ? 'text-white' : 'text-gray-400')}>{s.name}</span>
                                                    </div>
                                                    {s.error && <div className="text-red-400 text-[10px] mb-1">{s.error}</div>}
                                                    {s.curText && (
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-[10px] text-green-400 uppercase font-bold tracking-wider shrink-0">cur</span>
                                                            <span className={cn('select-all break-all flex-1 text-[13px]', sens ? 'text-red-200 font-bold' : 'text-gray-300')}>{s.curText}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curText!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.curNtlm && (
                                                        <div className="flex gap-2.5 mt-0.5 items-center">
                                                            <span className="text-[10px] text-red-400 font-bold uppercase shrink-0">NTLM</span>
                                                            <span className="text-red-200 select-all break-all flex-1 text-[13px] tracking-wide">{s.curNtlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curNtlm!)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.curSha1 && <div className="flex gap-2.5 mt-0.5 items-center"><span className="text-[10px] text-gray-500 font-bold uppercase shrink-0">SHA1</span><span className="text-gray-400 select-all break-all flex-1">{s.curSha1}</span></div>}
                                                    {s.oldText && s.oldText !== s.curText && (
                                                        <div className="flex items-start gap-2 mt-1 pt-1 border-t border-white/5">
                                                            <span className="text-[10px] text-gray-600 uppercase font-bold tracking-wider shrink-0 mt-0.5">old</span>
                                                            <span className="text-gray-500 select-all break-all">{s.oldText}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* ── lsadump::cache ── */}
                            {baseCmd === 'lsadump::cache' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const creds = mzParseCache(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b border-white/5">
                                            {domM  && <span><span className="text-gray-500">Domain </span><span className="text-cyan-300 font-bold">{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span className="text-gray-500">FQDN </span><span className="text-cyan-300/80">{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {creds.length === 0 && <div className="text-gray-500 italic">No cached credentials</div>}
                                        <div className="space-y-1.5">
                                            {creds.map((c, ci) => (
                                                <div key={ci} className="border border-orange-500/40 bg-orange-950/20 rounded-sm px-2 py-1.5">
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="text-white font-bold text-sm">{c.user}</span>
                                                        <span className="text-gray-500 text-[10px]">{c.slot}</span>
                                                        <span className="text-gray-500 text-[10px]">{c.date}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-orange-400 uppercase font-bold tracking-wider shrink-0">MsCacheV2</span>
                                                        <span className="text-orange-200 select-all break-all text-[13px] tracking-wide flex-1">{c.hash}</span>
                                                        <button onClick={() => navigator.clipboard.writeText(c.hash)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── sekurlsa::logonpasswords ── */}
                            {baseCmd === 'sekurlsa::logonpasswords' && (() => {
                                const sessions = mzParseLogon(sec.body);
                                const sessionsWithCreds = sessions.filter(s => s.providers.length > 0);
                                return (
                                    <div className="space-y-1.5">
                                        {sessionsWithCreds.length === 0 && (
                                            <div className="text-red-400 text-[10px]">
                                                {sec.body.split('\n').find((l: string) => l.includes('ERROR')) || 'No credentials extracted'}
                                            </div>
                                        )}
                                        {sessionsWithCreds.map((s, si2) => {
                                            const sessLabel = `${s.sessionDomain ? s.sessionDomain + '\\' : ''}${s.sessionUser}`;
                                            const hasPlain  = s.providers.some(p => p.plaintext);
                                            return (
                                                <div key={si2} className="border border-red-500/40 bg-red-950/20 rounded-sm px-2 py-2">
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <span className="text-white font-bold text-sm">{sessLabel}</span>
                                                        {s.sessionType && (
                                                            <span className="text-[9px] text-gray-400 font-mono">{s.sessionType}</span>
                                                        )}
                                                        {hasPlain && <span className="text-[10px] px-1.5 py-0.5 border border-green-500/50 text-green-300 bg-green-900/25 rounded-sm font-bold shrink-0 ml-auto">PLAINTEXT</span>}
                                                    </div>
                                                    <div className="space-y-1">
                                                        {s.providers.map((p, pi) => {
                                                            // Show per-provider Username if it differs from the session user
                                                            const userDiffers = p.user !== s.sessionUser || p.domain !== s.sessionDomain;
                                                            const subLabel    = `${p.domain ? p.domain + '\\' : ''}${p.user}`;
                                                            return (
                                                                <div key={pi} className="border-l-2 border-red-500/30 pl-2 py-0.5 space-y-0.5">
                                                                    <div className="flex items-center gap-2 text-[10px]">
                                                                        <span className="text-gray-500 font-mono uppercase tracking-wider w-16 shrink-0">{p.provider}</span>
                                                                        {userDiffers && (
                                                                            <span className="text-cyan-300 font-mono text-[10px] truncate">{subLabel}</span>
                                                                        )}
                                                                    </div>
                                                                    {p.plaintext && (
                                                                        <div className="flex items-center gap-2 ml-16">
                                                                            <span className="text-[10px] text-green-400 font-bold uppercase shrink-0 w-12">PASS</span>
                                                                            <span className="text-green-200 font-bold select-all flex-1 text-[13px] break-all">{p.plaintext}</span>
                                                                            <button onClick={() => navigator.clipboard.writeText(p.plaintext!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy password"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                                        </div>
                                                                    )}
                                                                    {p.ntlm && (
                                                                        <div className="flex items-center gap-2 ml-16">
                                                                            <span className="text-[10px] text-red-400 font-bold uppercase shrink-0 w-12">NTLM</span>
                                                                            <span className="text-red-200 select-all flex-1 text-[13px] tracking-wide break-all">{p.ntlm}</span>
                                                                            <button onClick={() => navigator.clipboard.writeText(p.ntlm!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy hash"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                                        </div>
                                                                    )}
                                                                    {p.sha1 && (
                                                                        <div className="flex gap-2 items-center ml-16">
                                                                            <span className="text-[10px] text-gray-500 font-bold uppercase shrink-0 w-12">SHA1</span>
                                                                            <span className="text-gray-400 select-all break-all flex-1">{p.sha1}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* ── lsadump::dcsync ── */}
                            {baseCmd === 'lsadump::dcsync' && (() => {
                                const entries = mzParseDCSync(sec.body);
                                if (entries.length === 0) {
                                    return <div className="text-red-400 text-[10px] italic">No dcsync user records parsed (try running with /user:&lt;target&gt;)</div>;
                                }
                                return (
                                    <div className="space-y-2">
                                        {entries.map((e, ei) => {
                                            const histNTLM = e.ntlmHistory.filter(h => h !== e.ntlm);
                                            const curKeys  = e.kerberosKeys.filter(k => !k.old);
                                            const oldKeys  = e.kerberosKeys.filter(k => k.old);
                                            return (
                                                <div key={ei} className="border border-fuchsia-500/40 bg-fuchsia-950/15 rounded-sm px-2 py-2">
                                                    {/* User / domain header */}
                                                    <div className="flex items-center gap-3 flex-wrap mb-2">
                                                        <span className="text-white font-bold text-sm">{e.user}</span>
                                                        {e.domain && <span className="text-cyan-300 font-bold text-[11px]">{e.domain}</span>}
                                                        {e.rid && <span className="text-gray-500 text-[10px]">RID {e.rid}</span>}
                                                        {e.sid && <span className="text-gray-500 text-[10px] font-mono truncate max-w-[260px]" title={e.sid}>{e.sid}</span>}
                                                    </div>

                                                    {/* Current NTLM */}
                                                    {e.ntlm && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider shrink-0 w-12">NTLM</span>
                                                            <span className="text-red-200 select-all text-[13px] tracking-wide break-all flex-1">{e.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(e.ntlm)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy hash"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}

                                                    {/* Historical NTLM */}
                                                    {histNTLM.length > 0 && (
                                                        <details className="mt-1">
                                                            <summary className="text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer">{histNTLM.length} historical NTLM hash{histNTLM.length !== 1 ? 'es' : ''}</summary>
                                                            <div className="mt-1 pl-2 border-l border-gray-700 space-y-0.5">
                                                                {histNTLM.map((h, hi) => (
                                                                    <div key={hi} className="flex gap-2 text-[10px] items-center">
                                                                        <span className="text-gray-500 w-12 shrink-0">ntlm-{hi + 1}</span>
                                                                        <span className="text-red-300/90 select-all break-all flex-1 font-mono">{h}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(h)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={10} className="text-gray-500 hover:text-white" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}

                                                    {/* LM history */}
                                                    {e.lmHistory.length > 0 && (
                                                        <details className="mt-1">
                                                            <summary className="text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer">{e.lmHistory.length} LM hash{e.lmHistory.length !== 1 ? 'es' : ''}</summary>
                                                            <div className="mt-1 pl-2 border-l border-gray-700 space-y-0.5">
                                                                {e.lmHistory.map((h, hi) => (
                                                                    <div key={hi} className="flex gap-2 text-[10px] items-center">
                                                                        <span className="text-gray-500 w-12 shrink-0">lm-{hi}</span>
                                                                        <span className="text-orange-300/90 select-all break-all flex-1 font-mono">{h}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(h)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={10} className="text-gray-500 hover:text-white" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}

                                                    {/* Kerberos keys */}
                                                    {(curKeys.length > 0 || oldKeys.length > 0) && (
                                                        <details className="mt-1.5" open>
                                                            <summary className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 cursor-pointer font-semibold tracking-wider uppercase">
                                                                Kerberos Keys ({curKeys.length}{oldKeys.length > 0 ? ` + ${oldKeys.length} old` : ''})
                                                            </summary>
                                                            <div className="mt-1 pl-2 border-l border-fuchsia-500/30 space-y-0.5">
                                                                {curKeys.map((k, ki) => (
                                                                    <div key={'cur' + ki} className="flex gap-2 text-[10px] items-center">
                                                                        <span className="text-fuchsia-300 font-bold w-28 shrink-0 uppercase tracking-wider">{k.keyType}</span>
                                                                        <span className="text-fuchsia-100 select-all break-all flex-1 font-mono">{k.value}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(k.value)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={10} className="text-gray-500 hover:text-white" /></button>
                                                                    </div>
                                                                ))}
                                                                {oldKeys.map((k, ki) => (
                                                                    <div key={'old' + ki} className="flex gap-2 text-[10px] items-center opacity-60">
                                                                        <span className="text-fuchsia-300/70 font-bold w-28 shrink-0 uppercase tracking-wider">{k.keyType} <span className="text-gray-500 font-normal">old</span></span>
                                                                        <span className="text-fuchsia-100/70 select-all break-all flex-1 font-mono">{k.value}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(k.value)} className="p-0.5 hover:bg-white/10 rounded" title="Copy"><Copy size={10} className="text-gray-500 hover:text-white" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* ── generic / privilege / token / vault ── */}
                            {baseCmd !== 'lsadump::sam' && baseCmd !== 'lsadump::secrets' &&
                             baseCmd !== 'lsadump::cache' && baseCmd !== 'sekurlsa::logonpasswords' &&
                             baseCmd !== 'lsadump::dcsync' && (
                                <div className="space-y-0.5">
                                    {sec.body.split('\n').filter((l: string) => l.trim()).map((line: string, li: number) => (
                                        <div key={li} className={cn('text-[11px] leading-relaxed',
                                            /^ERROR/i.test(line.trim())                  ? 'text-red-400 font-bold' :
                                            /Privilege.*OK|\bOK\b/.test(line)            ? 'text-signal font-bold' :
                                            /NT AUTHORITY|S-1-5-|Impersonated/.test(line)? 'text-orange-300 font-semibold' :
                                            /[a-f0-9]{32}/i.test(line)                  ? 'text-red-200 font-mono tracking-wide' :
                                            /^\s*\*/.test(line)                         ? 'text-gray-200' :
                                            'text-gray-300'
                                        )}>{line}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ============================================
// Interactive Terminal Helpers
// ============================================
