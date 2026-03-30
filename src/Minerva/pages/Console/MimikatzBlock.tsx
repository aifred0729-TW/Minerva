import React, { useState, useMemo, useEffect } from 'react';
import { useMutation, useApolloClient } from '@apollo/client';
import { Key, Copy, Lock, Activity } from 'lucide-react';
import { CHECK_EXISTING_CREDENTIAL, CREATE_CREDENTIAL_MUT } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { MzExtractedCred } from '../../types/console';

export const mzParseSam = (body: string) => {
    const users: { rid: string; name: string; ntlm: string; ntlmHist: string[] }[] = [];
    body.split(/(?=RID\s+:)/).forEach(block => {
        const rM = block.match(/RID\s+:\s+\S+\s+\((\d+)\)/);
        const nM = block.match(/User\s+:\s+(\S+)/);
        const hM = block.match(/Hash NTLM:\s*([a-f0-9]{32})/i);
        if (rM && nM) {
            const hist = [...block.matchAll(/ntlm-\s*\d+:\s*([a-f0-9]{32})/gi)].map(m => m[1]);
            users.push({ rid: rM[1], name: nM[1].trim(), ntlm: hM ? hM[1] : '', ntlmHist: hist });
        }
    });
    return users;
};

const mzParseSecrets = (body: string) =>
    body.split(/\nSecret\s+:/).slice(1).map(block => {
        const nl2 = block.indexOf('\n');
        const name = block.substring(0, nl2).trim();
        return {
            name,
            curText: block.match(/cur\/text:\s*(.+)/)?.[1].trim(),
            curNtlm: block.match(/NTLM:([a-f0-9]{32})/i)?.[1],
            curSha1: block.match(/SHA1:([a-f0-9]+)/i)?.[1],
            oldText: block.match(/old\/text:\s*(.+)/)?.[1].trim(),
            error:   block.match(/ERROR\s+(.+)/)?.[0].trim(),
        };
    });

const mzParseCache = (body: string) =>
    body.split(/(?=\[NL\$)/).flatMap(block => {
        const sM = block.match(/\[(NL\$\d+)\s+-\s+([^\]]+)\]/);
        const uM = block.match(/User\s+:\s*([^\n]+)/);
        const hM = block.match(/MsCacheV2\s+:\s*([a-f0-9]+)/i);
        return (sM && uM && hM) ? [{ slot: sM[1], date: sM[2].trim(), user: uM[1].trim(), hash: hM[1].trim() }] : [];
    });

const mzParseLogon = (body: string) =>
    body.split(/Authentication Id\s*:/).slice(1).flatMap(block => {
        const uM = block.match(/User Name\s+:\s*(.+)/);
        if (!uM || uM[1].trim() === '(null)') return [];
        const dM  = block.match(/Domain\s+:\s*(.+)/);
        const nM  = block.match(/\*\s+NTLM\s*:\s*([a-f0-9]{32})/i);
        const sM  = block.match(/\*\s+SHA1\s*:\s*([a-f0-9]+)/i);
        const ptM = block.match(/\*\s+Password\s*:\s*(.+)/);
        return [{ user: uM[1].trim(), domain: dM?.[1].trim() || '', ntlm: nM?.[1], sha1: sM?.[1], plaintext: ptM && ptM[1].trim() !== '(null)' ? ptM[1].trim() : undefined }];
    });

const mzExtractAllCreds = (sections: { cmd: string; body: string }[]): MzExtractedCred[] => {
    const out: MzExtractedCred[] = [];
    const isSensitiveSecret = (n: string) =>
        !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');
    sections.forEach(sec => {
        if (sec.cmd === 'lsadump::sam') {
            const domain = sec.body.match(/Domain\s+:\s*([^\n]+)/)?.[1]?.trim() || '';
            mzParseSam(sec.body).forEach(u => { if (u.ntlm) out.push({ account: u.name, realm: domain, credential: u.ntlm, credType: 'hash', source: 'lsadump::sam' }); });
        } else if (sec.cmd === 'sekurlsa::logonpasswords') {
            mzParseLogon(sec.body).forEach(s => {
                const dom = (s.domain && s.domain !== '(null)') ? s.domain : '';
                if (s.ntlm)      out.push({ account: s.user, realm: dom, credential: s.ntlm,      credType: 'hash',      source: 'sekurlsa::logonpasswords' });
                if (s.plaintext) out.push({ account: s.user, realm: dom, credential: s.plaintext, credType: 'plaintext', source: 'sekurlsa::logonpasswords' });
            });
        } else if (sec.cmd === 'lsadump::secrets') {
            const domain = sec.body.match(/Domain\s+:\s*([^\n]+)/)?.[1]?.trim() || '';
            mzParseSecrets(sec.body).forEach(s => {
                if (s.curNtlm)                        out.push({ account: s.name, realm: domain, credential: s.curNtlm, credType: 'hash',      source: 'lsadump::secrets' });
                if (s.curText && isSensitiveSecret(s.name)) out.push({ account: s.name, realm: domain, credential: s.curText, credType: 'plaintext', source: 'lsadump::secrets' });
            });
        } else if (sec.cmd === 'lsadump::cache') {
            const domain = sec.body.match(/Domain\s+:\s*([^\n]+)/)?.[1]?.trim() || '';
            mzParseCache(sec.body).forEach(c => { out.push({ account: c.user, realm: domain, credential: c.hash, credType: 'hash', source: 'lsadump::cache (MsCacheV2)' }); });
        }
    });
    return out;
};

const CMD_CLS_MAP: Record<string, string> = {
    'privilege::debug':         'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
    'sekurlsa::logonpasswords': 'text-red-400   border-red-500/40   bg-red-900/10',
    'token::elevate':           'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::sam':             'text-red-400   border-red-500/40   bg-red-900/10',
    'lsadump::secrets':        'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'lsadump::cache':           'text-orange-400 border-orange-500/40 bg-orange-900/10',
    'vault::cred /patch':       'text-yellow-400 border-yellow-500/40 bg-yellow-900/10',
};

export const MimikatzBlock = ({ content, taskId, taskDisplayId, callbackHost }: {
    content: string; taskId: number; taskDisplayId: number; callbackHost: string;
}) => {
    const client = useApolloClient();
    const [createCred] = useMutation(CREATE_CREDENTIAL_MUT);
    const [vaultState, setVaultState] = useState<'idle'|'saving'|'saved'>('idle');
    const [savedCount, setSavedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);

    const mzParts   = content.split(/mimikatz\(commandline\)\s*#\s*/);
    const mzHeader  = mzParts[0];
    const mzSections: {cmd:string; body:string}[] = mzParts.slice(1).map(pt => {
        const nl = pt.indexOf('\n');
        return { cmd: nl >= 0 ? pt.substring(0, nl).trim() : pt.trim(), body: nl >= 0 ? pt.substring(nl + 1) : '' };
    });
    const verM  = mzHeader.match(/mimikatz\s+(\d+\.\d+\.\d+[^\s]*)/);
    const mzVer = verM ? verM[1] : null;

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
                    if (checkData?.credential?.length > 0) {
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

    const isSensitiveSecret = (n: string) =>
        !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');

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
                const cmdCls  = CMD_CLS_MAP[sec.cmd] || 'text-gray-400 border-gray-600/50 bg-gray-800/20';
                const hasErr  = /ERROR kuhl/.test(sec.body);
                const hasOk   = /\bOK\b/.test(sec.body) || /Privilege.*OK/.test(sec.body);
                return (
                    <div key={si} className="border border-white/8 rounded-sm overflow-hidden bg-black/25">
                        {/* cmd header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30 border-b border-white/5 flex-wrap">
                            <span className="text-gray-700 text-[9px] font-mono shrink-0">mimikatz #</span>
                            <span className={cn('text-[9px] font-bold px-2 py-0.5 border rounded-sm shrink-0', cmdCls)}>{sec.cmd}</span>
                            {hasErr && <span className="text-red-500/80 text-[9px] font-bold">✗ FAILED</span>}
                            {hasOk  && <span className="text-signal text-[9px] font-bold">✓ OK</span>}
                        </div>
                        <div className="px-3 py-2 text-xs font-mono">

                            {/* ── lsadump::sam ── */}
                            {sec.cmd === 'lsadump::sam' && (() => {
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
                            {sec.cmd === 'lsadump::secrets' && (() => {
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
                            {sec.cmd === 'lsadump::cache' && (() => {
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
                            {sec.cmd === 'sekurlsa::logonpasswords' && (() => {
                                const sessions = mzParseLogon(sec.body);
                                return (
                                    <div className="space-y-1.5">
                                        {sessions.length === 0 && (
                                            <div className="text-red-400 text-[10px]">
                                                {sec.body.split('\n').find((l: string) => l.includes('ERROR')) || 'No credentials extracted'}
                                            </div>
                                        )}
                                        {sessions.map((s, si2) => {
                                            const label = `${s.domain && s.domain !== '(null)' ? s.domain + '\\' : ''}${s.user}`;
                                            return (
                                                <div key={si2} className="border border-red-500/40 bg-red-950/20 rounded-sm px-2 py-2">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="text-white font-bold text-sm flex-1">{label}</span>
                                                        {s.plaintext && <span className="text-[10px] px-1.5 py-0.5 border border-green-500/50 text-green-300 bg-green-900/25 rounded-sm font-bold shrink-0">PLAINTEXT</span>}
                                                    </div>
                                                    {s.plaintext && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] text-green-400 font-bold uppercase shrink-0">PASS</span>
                                                            <span className="text-green-200 font-bold select-all flex-1 text-[13px]">{s.plaintext}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.plaintext!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy password"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.ntlm && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] text-red-400 font-bold uppercase shrink-0">NTLM</span>
                                                            <span className="text-red-200 select-all flex-1 text-[13px] tracking-wide">{s.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.ntlm!)} className="p-0.5 hover:bg-white/10 rounded shrink-0" title="Copy hash"><Copy size={11} className="text-gray-500 hover:text-white" /></button>
                                                        </div>
                                                    )}
                                                    {s.sha1 && <div className="flex gap-2.5 items-center"><span className="text-[10px] text-gray-500 font-bold uppercase shrink-0">SHA1</span><span className="text-gray-400 select-all">{s.sha1}</span></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* ── generic / privilege / token / vault ── */}
                            {sec.cmd !== 'lsadump::sam' && sec.cmd !== 'lsadump::secrets' &&
                             sec.cmd !== 'lsadump::cache' && sec.cmd !== 'sekurlsa::logonpasswords' && (
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
