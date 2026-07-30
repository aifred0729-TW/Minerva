import React, { useState, useMemo, useEffect } from 'react'
import {
    Copy,
    ChevronRight,
    ChevronDown,
    Code,
    Search,
    X,
    Database,
    Layers,
    Hash,
    ExternalLink,
    Network,
    Wifi,
    Activity,
    Folder,
    Lock,
    Share2,
    HardDrive,
    Eye,
    EyeOff,
    Monitor,
    Server,
    Crown,
    Globe,
}from 'lucide-react';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-monokai';
import {
    OutputPanel, MythicTable, TerminalPanel, AutoTable,
    ACCENT, AMBER, PURPLE, ERR, MONO,
    fmtBytes, fmtUnixTime, tryParseJSON,
} from './core';
import type { MythicTableDef } from '../../types/output';
import { cn } from '../../lib/utils';
import { ProcessPanel } from './panels';
import { FilesPanel } from './panels';
import { ScreenshotPanel } from './panels';
import { fileDownloadUrl } from '../../lib/urls';
import { DownloadPanel } from './panels';
import { GraphPanel } from './graph';
import type { DecodedResponse, ParsedOutputProps } from '../../types/output';

export function JsonPanel({ data }: { data: object }) {
    const entries = Object.entries(data);
    return (
        <OutputPanel icon={<Hash size={11}/>} label="JSON" count={entries.length}>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {entries.map(([k, v]) => (
                    <React.Fragment key={k}>
                        <div className="pr-4 py-1 font-mono text-[11px] font-semibold whitespace-nowrap align-top"
                            style={{ color: '#00ffd177' }}>
                            {k}
                        </div>
                        <div className="py-1 font-mono text-[11.5px] break-all"
                            style={{
                                color: typeof v === 'number' ? '#a8d8ff'
                                    : typeof v === 'boolean' ? (v ? '#88ff88' : '#ff8888')
                                    : '#ccc',
                            }}>
                            {v === null || v === undefined
                                ? <span style={{ color: '#444' }}>—</span>
                                : typeof v === 'object'
                                    ? <span style={{ color: '#555' }}>{JSON.stringify(v)}</span>
                                    : String(v)}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </OutputPanel>
    );
}

// ─── ParsedOutput ─────────────────────────────────────────────────────────────

/**
 * ParsedOutput: auto-detects the shape of a decoded Mythic response and
 * renders the appropriate panel(s).
 *
 * Detection order:
 *   1. Error text → TerminalPanel (red)
 *   2. Non-JSON / empty → TerminalPanel
 *   3. Mythic browser-script object → plaintext + table[] + process_list + files + screenshot[] + download[]
 *   4. Array of objects → AutoTable inside OutputPanel
 *   5. Array of primitives → TerminalPanel
 *   6. Unrecognised object → JsonPanel
 */
export function ParsedOutput({ text = '', data: dataProp, isError }: ParsedOutputProps) {
    const parsed = useMemo(() => {
        if (dataProp !== undefined) return dataProp;
        if (!text.trim()) return null;
        try { return JSON.parse(text); } catch { return null; }
    }, [dataProp, text]);

    if (isError) return <TerminalPanel text={text} isError/>;
    if (!parsed)  return <TerminalPanel text={text}/>;

    // ── Mythic browser-script shape ──────────────────────────────────────────
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const hasMythicKey = (
            'plaintext'    in parsed ||
            'table'        in parsed ||
            'screenshot'   in parsed ||
            'download'     in parsed ||
            'process_list' in parsed ||
            'files'        in parsed ||
            'file_browser' in parsed
        );

        if (hasMythicKey) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sections: any[] = [];

            if (parsed.plaintext !== undefined)
                sections.push(<TerminalPanel key="pt" text={String(parsed.plaintext)}/>);

            if (Array.isArray(parsed.table))
                (parsed.table as MythicTableDef[]).forEach((tbl, i) =>
                    sections.push(<MythicTable key={`tbl-${i}`} tbl={tbl}/>));

            if (Array.isArray(parsed.process_list))
                sections.push(<ProcessPanel key="pl" procs={parsed.process_list}/>);

            if (Array.isArray(parsed.files))
                sections.push(<FilesPanel key="files" files={parsed.files}/>);

            if (parsed.file_browser?.files)
                sections.push(<FilesPanel key="fb" files={parsed.file_browser.files}/>);

            if (Array.isArray(parsed.screenshot))
                sections.push(<ScreenshotPanel key="scr" screenshots={parsed.screenshot}/>);

            if (Array.isArray(parsed.download))
                sections.push(<DownloadPanel key="dl" downloads={parsed.download}/>);

            return sections.length > 0 ? <>{sections}</> : <JsonPanel data={parsed}/>;
        }

        // unrecognised object
        return <JsonPanel data={parsed}/>;
    }

    // ── Array of objects → auto table ────────────────────────────────────────
    if (Array.isArray(parsed) && parsed.length > 0 &&
        typeof parsed[0] === 'object' && parsed[0] !== null) {
        return (
            <OutputPanel icon={<Database size={11}/>} label="TABLE" count={parsed.length}>
                <AutoTable rows={parsed}/>
            </OutputPanel>
        );
    }

    // ── Array of primitives ───────────────────────────────────────────────────
    if (Array.isArray(parsed))
        return <TerminalPanel text={parsed.map(String).join('\n')}/>;

    return <TerminalPanel text={text}/>;
}

// ─── BrowserScriptOutput ─────────────────────────────────────────────────────
// Full browser-script data renderer — mirrors Console.tsx's bsd rendering
// pipeline exactly. Use this instead of ParsedOutput when browserScriptData
// is available (i.e. the command has a registered browser script).

export function BrowserScriptOutput({ bsd }: { bsd: any }) {
    const [expandedScreenshot, setExpandedScreenshot] =
        useState<{ src: string; alt: string } | null>(null);
    const [activeTab, setActiveTab] = useState(0);

    useEffect(() => {
        if (!expandedScreenshot) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedScreenshot(null); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [expandedScreenshot]);

    // Reset tab index when bsd changes
    useEffect(() => { setActiveTab(0); }, [bsd]);

    return (
        <div className="space-y-2">
            {/* plaintext */}
            {bsd.plaintext !== undefined && (
                <TerminalPanel text={String(bsd.plaintext)}/>
            )}

            {/* table[] */}
            {Array.isArray(bsd.table) && bsd.table.map((tbl: any, i: number) => (
                <MythicTable key={i} tbl={tbl}/>
            ))}

            {/* process_list */}
            {Array.isArray(bsd.process_list) && (
                <ProcessPanel procs={bsd.process_list}/>
            )}

            {/* files / file_browser */}
            {Array.isArray(bsd.files) && (
                <FilesPanel files={bsd.files}/>
            )}
            {bsd.file_browser?.files && (
                <FilesPanel files={bsd.file_browser.files}/>
            )}

            {/* download[] */}
            {Array.isArray(bsd.download) && (
                <DownloadPanel downloads={bsd.download}/>
            )}

            {/* screenshot[] — with click-to-expand */}
            {Array.isArray(bsd.screenshot) && bsd.screenshot.length > 0 && (
                <OutputPanel
                    icon={<ExternalLink size={11}/>}
                    label="SCREENSHOT"
                    accent={PURPLE}
                    count={bsd.screenshot.length > 1 ? bsd.screenshot.length : undefined}>
                    <div className="space-y-3">
                        {bsd.screenshot.map((scr: any, i: number) => {
                            const src = fileDownloadUrl(scr.agent_file_id);
                            const alt = scr.plaintext || `Screenshot ${i + 1}`;
                            return (
                                <div key={i}>
                                    {scr.plaintext && (
                                        <div className="font-mono text-[11px] mb-1.5 pb-1 border-b"
                                            style={{ color: '#998', borderColor: `${PURPLE}22` }}>
                                            {scr.plaintext}
                                        </div>
                                    )}
                                    <img
                                        src={src} alt={alt}
                                        className="rounded-sm border w-full object-contain cursor-zoom-in transition-opacity hover:opacity-90"
                                        style={{ borderColor: `${PURPLE}33`, maxHeight: 340 }}
                                        onClick={() => setExpandedScreenshot({ src, alt })}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </OutputPanel>
            )}

            {/* media[] — inline audio/video player */}
            {Array.isArray(bsd.media) && bsd.media.map((m: any, i: number) => {
                const src = fileDownloadUrl(m.agent_file_id);
                const name: string = (m.name || m.plaintext || '').toLowerCase();
                const isAudio = /\.(mp3|ogg|wav|aac|flac|m4a)$/.test(name);
                const isVideo = /\.(mp4|webm|ogv|mov|avi|mkv)$/.test(name);
                return (
                    <OutputPanel key={i} icon={<ExternalLink size={11}/>} label="MEDIA">
                        {m.plaintext && (
                            <div className="font-mono text-[11px] mb-2" style={{ color: '#aaa' }}>{m.plaintext}</div>
                        )}
                        {isAudio ? (
                            <audio controls src={src} className="w-full h-8 max-w-sm"/>
                        ) : isVideo ? (
                            <video controls src={src}
                                className="max-w-full rounded-sm border border-white/10"
                                style={{ maxHeight: 240 }}/>
                        ) : (
                            <a href={src} target="_blank" rel="noreferrer"
                                className="font-mono text-[11px] flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                style={{ color: ACCENT }}>
                                ↗ View Media
                            </a>
                        )}
                    </OutputPanel>
                );
            })}

            {/* #3 — search[] — clickable Mythic search links */}
            {Array.isArray(bsd.search) && bsd.search.length > 0 && (
                <OutputPanel icon={<Search size={11}/>} label="SEARCH LINKS" count={bsd.search.length}>
                    <div className="space-y-1.5">
                        {bsd.search.map((s: any, i: number) => {
                            const label = s.name || s.plaintext || JSON.stringify(s);
                            const query = s.search || s.plaintext || '';
                            const href = `${window.location.origin}/new/search/?${query}`;
                            return (
                                <div key={i} className="flex items-start gap-2">
                                    {s.plaintext && (
                                        <span className="font-mono text-[11px]" style={{ color: '#ccc' }}>{s.plaintext}</span>
                                    )}
                                    <a href={href} target="_blank" rel="noreferrer"
                                        className="font-mono text-[11px] flex items-center gap-1 hover:underline transition-colors"
                                        style={{ color: ACCENT }}
                                        title={s.hoverText || 'View on Search Page'}>
                                        <Search size={9} className="shrink-0"/>
                                        {label}
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                </OutputPanel>
            )}

            {/* #2 — graph — dagre-style hierarchical layout with node icons & #18 auto-hide >50 */}
            {bsd.graph && (() => {
                type GNode = { id: string; label?: string; color?: string; img?: string; overlay_icon?: string; group?: string };
                type GEdge = { source: string; target: string; label?: string; color?: string };
                const gnodes: GNode[] = Array.isArray(bsd.graph.nodes) ? bsd.graph.nodes : [];
                const gedges: GEdge[] = Array.isArray(bsd.graph.edges) ? bsd.graph.edges : [];
                if (!gnodes.length) {
                    return (
                        <OutputPanel icon={<Network size={11}/>} label="GRAPH">
                            <pre className="font-mono text-[9px] overflow-auto max-h-40"
                                style={{ color: '#555' }}>{JSON.stringify(bsd.graph, null, 2)}</pre>
                        </OutputPanel>
                    );
                }
                return <GraphPanel nodes={gnodes} edges={gedges} rankDir={bsd.graph.rankDir || (bsd.graph.group_by ? 'TB' : 'LR')} />;
            })()}

            {/* #20 — tabs[] — full-featured tab switcher with all nested types */}
            {Array.isArray(bsd.tabs) && bsd.tabs.length > 0 && (() => {
                const currentTab = bsd.tabs[activeTab] || bsd.tabs[0];
                const renderTabContent = (t: any) => (
                    <div className="space-y-2">
                        {t.plaintext !== undefined && t.plaintext !== '' && <TerminalPanel text={String(t.plaintext)}/>}
                        {Array.isArray(t.table) && t.table.map((tbl: any, i: number) => <MythicTable key={i} tbl={tbl}/>)}
                        {Array.isArray(t.process_list) && <ProcessPanel procs={t.process_list}/>}
                        {Array.isArray(t.files) && <FilesPanel files={t.files}/>}
                        {t.file_browser?.files && <FilesPanel files={t.file_browser.files}/>}
                        {Array.isArray(t.download) && <DownloadPanel downloads={t.download}/>}
                        {t.screenshot?.agent_file_id && (
                            <img src={fileDownloadUrl(t.screenshot.agent_file_id)}
                                alt={t.screenshot.filename || 'screenshot'}
                                className="max-w-full rounded-sm border border-white/10 cursor-zoom-in" style={{ maxHeight: 300 }}
                                onClick={() => setExpandedScreenshot({ src: fileDownloadUrl(t.screenshot.agent_file_id), alt: t.screenshot.filename || '' })} />
                        )}
                        {Array.isArray(t.screenshot) && t.screenshot.length > 0 && (
                            <ScreenshotPanel screenshots={t.screenshot}/>
                        )}
                        {Array.isArray(t.media) && t.media.map((m: any, mi: number) => {
                            const src = fileDownloadUrl(m.agent_file_id);
                            const name: string = (m.name || m.plaintext || '').toLowerCase();
                            return <div key={mi}>{/\.(mp3|ogg|wav|aac|flac|m4a)$/.test(name) ? <audio controls src={src} className="w-full h-8 max-w-sm"/> : /\.(mp4|webm|ogv|mov)$/.test(name) ? <video controls src={src} className="max-w-full border border-white/10" style={{maxHeight:240}}/> : <a href={src} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 hover:opacity-80" style={{color:ACCENT}}>↗ View Media</a>}</div>;
                        })}
                        {Array.isArray(t.search) && t.search.length > 0 && t.search.map((s: any, si: number) => {
                            const href = `${window.location.origin}/new/search/?${s.search || s.plaintext || ''}`;
                            return <a key={si} href={href} target="_blank" rel="noreferrer" className="font-mono text-[11px] flex items-center gap-1 hover:underline" style={{color:ACCENT}}><Search size={9}/>{s.name || s.plaintext || ''}</a>;
                        })}
                    </div>
                );
                return (
                    <OutputPanel icon={<Layers size={11}/>} label="TABS" count={bsd.tabs.length}>
                        <div className="flex gap-0 flex-wrap border-b mb-2" style={{ borderColor: '#ffffff10' }}>
                            {bsd.tabs.map((t: any, ti: number) => (
                                <button key={ti} onClick={() => setActiveTab(ti)}
                                    className="px-3 py-1.5 font-mono text-[10px] border-b-2 transition-colors"
                                    style={ti === activeTab
                                        ? { borderColor: ACCENT, color: ACCENT, background: '#00ffd108' }
                                        : { borderColor: 'transparent', color: '#555' }}>
                                    {t.title || `Tab ${ti + 1}`}
                                </button>
                            ))}
                        </div>
                        {renderTabContent(currentTab)}
                    </OutputPanel>
                );
            })()}

            {/* Screenshot fullscreen modal */}
            {expandedScreenshot && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.85)' }}
                    onClick={() => setExpandedScreenshot(null)}>
                    <div
                        className="flex flex-col rounded-sm overflow-hidden shadow-2xl max-w-[90vw] max-h-[90vh]"
                        style={{ background: '#0a0a0a', border: `1px solid ${PURPLE}40` }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                            style={{ borderColor: `${PURPLE}22`, background: `${PURPLE}09` }}>
                            <span className="font-mono text-[10px] text-gray-400">{expandedScreenshot.alt}</span>
                            <div className="flex items-center gap-2">
                                <a href={expandedScreenshot.src} download target="_blank" rel="noreferrer"
                                    className="font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-opacity hover:opacity-80"
                                    style={{ color: AMBER, borderColor: `${AMBER}30`, background: `${AMBER}10` }}>
                                    ↓ save
                                </a>
                                <button onClick={() => setExpandedScreenshot(null)}
                                    className="text-gray-500 hover:text-white transition-colors p-0.5">
                                    <X size={14}/>
                                </button>
                            </div>
                        </div>
                        <img src={expandedScreenshot.src} alt={expandedScreenshot.alt}
                            className="block max-w-full max-h-[80vh] object-contain"/>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── IfconfigPanel ───────────────────────────────────────────────────────────

export function IfconfigPanel({ adapters }: { adapters: any[] }) {
    return (
        <OutputPanel icon={<Wifi size={11}/>} label="NETWORK INTERFACES" count={adapters.length}>
            <div className="space-y-2">
                {adapters.map((iface: any, i: number) => (
                    <div key={i} className="border rounded px-3 py-2"
                        style={{ background: '#080808', borderColor: '#ffffff0f' }}>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Wifi size={12} style={{ color: iface.Status === 'Up' ? ACCENT : '#555' }}/>
                            <span className="font-mono text-xs font-bold" style={{ color: '#fff' }}>
                                {iface.AdapterName}
                            </span>
                            <span className="font-mono text-[9px] px-1.5 py-0.5 uppercase font-bold border rounded-sm"
                                style={iface.Status === 'Up'
                                    ? { color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}10` }
                                    : { color: '#555', borderColor: '#333', background: '#1a1a1a' }}>
                                {iface.Status}
                            </span>
                            {iface.Description && (
                                <span className="font-mono text-[10px]" style={{ color: '#555' }}>{iface.Description}</span>
                            )}
                        </div>
                        <div className="grid text-[11px] gap-x-6 gap-y-0.5"
                            style={{ gridTemplateColumns: 'auto 1fr' }}>
                            {iface.AdressesV4?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>IPv4</span><span style={{ color: '#7ab8ff' }}>{iface.AdressesV4.join(', ')}</span></>
                            )}
                            {iface.AdressesV6?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>IPv6</span><span style={{ color: '#6be5c3' }}>{iface.AdressesV6.join(', ')}</span></>
                            )}
                            {iface.Gateways?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>Gateway</span><span style={{ color: '#ffd080' }}>{iface.Gateways.join(', ')}</span></>
                            )}
                            {iface.DnsServers?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>DNS</span><span style={{ color: '#c0a0ff' }}>{iface.DnsServers.join(', ')}</span></>
                            )}
                            {iface.DhcpAddresses?.filter(Boolean).length > 0 && (
                                <><span style={{ color: '#666' }}>DHCP</span><span style={{ color: '#ffb870' }}>{iface.DhcpAddresses.join(', ')}</span></>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </OutputPanel>
    );
}

// ─── NetstatPanel ─────────────────────────────────────────────────────────────

export function NetstatPanel({ rows }: { rows: any[] }) {
    const STATE_CLS: Record<string, { color: string; bg: string; border: string }> = {
        Established: { color: ACCENT,    bg: `${ACCENT}10`,   border: `${ACCENT}40` },
        Listen:      { color: '#555',    bg: '#1a1a1a',       border: '#333' },
        CloseWait:   { color: '#ffb870', bg: '#ffb87010',     border: '#ffb87040' },
        SynSent:     { color: '#ffd080', bg: '#ffd08010',     border: '#ffd08040' },
        TimeWait:    { color: '#ff7070', bg: '#ff707010',     border: '#ff707040' },
        FinWait1:    { color: '#ff7070', bg: '#ff707010',     border: '#ff707040' },
        FinWait2:    { color: '#ff7070', bg: '#ff707010',     border: '#ff707040' },
        SynReceived: { color: '#ffd080', bg: '#ffd08010',     border: '#ffd08040' },
    };
    const PORT_KNOWN: Record<number, string> = {
        80:'HTTP', 443:'HTTPS', 22:'SSH', 21:'FTP', 3389:'RDP', 445:'SMB', 135:'RPC',
        139:'NetBIOS', 1433:'MSSQL', 5985:'WinRM', 5986:'WinRM-TLS', 3306:'MySQL',
        5432:'PG', 8080:'HTTP-ALT', 8443:'HTTPS-ALT', 25:'SMTP', 53:'DNS', 123:'NTP',
    };
    const PORT_HL: Record<number, string> = {
        3389:'#ffa040', 445:'#ff6060', 1433:'#ffa040', 5985:'#ffa040', 5986:'#ffa040',
        22: ACCENT, 80:'#7ab8ff', 443:'#7ab8ff', 135:'#ffd080',
    };
    const seenKey = new Set<string>();
    const deduped: any[] = [];
    for (const row of rows) {
        if (row.state === 'Listen' || row.state === null) {
            const k = `${row.protocol}-${row.local_port}`;
            if (seenKey.has(k)) continue;
            seenKey.add(k);
        }
        deduped.push(row);
    }
    const tcpActive = deduped.filter(r => r.protocol === 'TCP' && r.state !== 'Listen').sort((a, b) => a.local_port - b.local_port);
    const tcpListen = deduped.filter(r => r.protocol === 'TCP' && r.state === 'Listen').sort((a, b) => a.local_port - b.local_port);
    const udpRows   = deduped.filter(r => r.protocol === 'UDP').sort((a, b) => a.local_port - b.local_port);

    const AddrCell = ({ addr, port, dim }: { addr: string; port: number; dim?: boolean }) => {
        const clean = addr.replace(/^\[(.+)\]$/, '$1');
        const label = PORT_KNOWN[port];
        const hlColor = PORT_HL[port];
        return (
            <span className="flex items-baseline gap-1 font-mono">
                <span className="truncate max-w-[100px]" style={{ color: dim ? '#333' : '#888' }}>{clean}</span>
                <span style={{ color: '#333' }}>:</span>
                <span className="font-bold shrink-0" style={{ color: hlColor || (dim ? '#555' : '#ccc') }}>{port}</span>
                {label && <span className="text-[9px] shrink-0" style={{ color: '#555' }}>{label}</span>}
            </span>
        );
    };
    const TableHeader = () => (
        <div className="grid gap-x-3 px-2 py-0.5 border-b text-[9px] uppercase tracking-wider select-none"
            style={{ borderColor: '#ffffff10', color: '#444', gridTemplateColumns: '3rem 1fr 1fr 5.5rem 3.5rem' }}>
            <span>Proto</span><span>Local</span><span>Remote</span><span>State</span><span>PID</span>
        </div>
    );
    const NetRow = ({ row }: { row: any }) => {
        const st = row.state ? (STATE_CLS[row.state] || { color: '#aaa', bg: '#1a1a1a', border: '#333' }) : null;
        return (
            <div className="grid gap-x-3 px-2 py-0.5 items-center text-[10px] transition-colors hover:bg-white/5"
                style={{ gridTemplateColumns: '3rem 1fr 1fr 5.5rem 3.5rem' }}>
                <span className="font-mono font-bold text-[9px] uppercase"
                    style={{ color: row.protocol === 'TCP' ? '#7ab8ff' : '#c0a0ff' }}>
                    {row.protocol}{row.ip_version === 6 ? '6' : '4'}
                </span>
                <AddrCell addr={row.local_address} port={row.local_port}/>
                <AddrCell addr={row.remote_address} port={row.remote_port} dim={row.remote_port === 0}/>
                {st ? (
                    <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 border rounded-sm w-fit"
                        style={{ color: st.color, background: st.bg, borderColor: st.border }}>
                        {row.state.toUpperCase()}
                    </span>
                ) : <span style={{ color: '#333' }}>—</span>}
                <span className="font-mono" style={{ color: row.state === 'Listen' ? '#444' : '#888' }}>
                    {row.pid || '—'}
                </span>
            </div>
        );
    };
    const Section = ({ label, items, color, icon, defaultOpen }: { label: string; items: any[]; color: string; icon: React.ReactNode; defaultOpen?: boolean }) => {
        const [open, setOpen] = useState(!!defaultOpen);
        return (
            <div className="border rounded overflow-hidden" style={{ borderColor: '#ffffff10', background: '#080808' }}>
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                    onClick={() => setOpen(o => !o)}>
                    <span style={{ color }}>{icon}</span>
                    <span className="font-mono font-bold text-[10px] uppercase tracking-widest" style={{ color }}>{label}</span>
                    <span className="text-[10px]" style={{ color: '#444' }}>({items.length})</span>
                    <ChevronRight size={10} className="ml-auto transition-transform" style={{ color: '#444', transform: open ? 'rotate(90deg)' : 'none' }}/>
                </button>
                {open && (<><TableHeader/>{items.map((r, i) => <NetRow key={i} row={r}/>)}</>)}
            </div>
        );
    };
    return (
        <OutputPanel icon={<Network size={11}/>} label="NETSTAT" count={deduped.length}>
            <div className="space-y-2">
                {tcpActive.length > 0 && (
                    <Section label="Active Connections" items={tcpActive} color={ACCENT} icon={<Activity size={11}/>} defaultOpen/>
                )}
                {tcpListen.length > 0 && (
                    <Section label="Listening Ports" items={tcpListen} color="#7ab8ff" icon={<Network size={11} style={{ color: '#7ab8ff' }}/>} defaultOpen={tcpActive.length === 0}/>
                )}
                {udpRows.length > 0 && (
                    <Section label="UDP" items={udpRows} color="#c0a0ff" icon={<Wifi size={11} style={{ color: '#c0a0ff' }}/>}/>
                )}
            </div>
        </OutputPanel>
    );
}

// ─── NetSharesPanel ───────────────────────────────────────────────────────────
// Renders Apollo's `net_shares` output following the Minerva 先進極簡 design
// language: signal/accent palette, mono uppercase labels with wide tracking,
// rounded-md tile chrome, semantic-color tier chips (the same red / cyan /
// purple / signal split the type-selector sidebar uses).
//
//   • ADMIN ($-suffixed)   → red    (lateral-movement target — surfaces first)
//   • DISK                 → accent (normal browsable share)
//   • IPC$                 → purple (named-pipe broker, deprioritised)
//   • OTHER                → signal (printer / unknown)
//
// Rows are a labelled 5-column table with a Summary band above. Operator
// reads the count strip first, then scans the table left-to-right:
// share → host → tier → access → comment.
type ShareTier = 'admin' | 'disk' | 'ipc' | 'other';
const SHARE_TIER_RANK: Record<ShareTier, number> = { admin: 0, disk: 1, other: 2, ipc: 3 };
const SHARE_TIER_META: Record<ShareTier, { label: string; chipCls: string; iconCls: string; icon: React.ReactNode }> = {
    admin: { label: 'ADMIN',  chipCls: 'border-red-500/40    bg-red-500/10    text-red-400',    iconCls: 'text-red-400',    icon: <Lock      size={11} strokeWidth={2}/> },
    disk:  { label: 'DISK',   chipCls: 'border-accent/40     bg-accent/10     text-accent',     iconCls: 'text-accent',     icon: <HardDrive size={11} strokeWidth={2}/> },
    ipc:   { label: 'IPC',    chipCls: 'border-purple-500/40 bg-purple-500/10 text-purple-400', iconCls: 'text-purple-400', icon: <Network   size={11} strokeWidth={2}/> },
    other: { label: 'OTHER',  chipCls: 'border-signal/30     bg-signal/[0.04] text-signal',     iconCls: 'text-signal',     icon: <Share2    size={11} strokeWidth={2}/> },
};

function classifyShare(name: string, type: string): ShareTier {
    const n = String(name || '');
    if (/^ADMIN\$$/i.test(n) || /^[A-Z]\$$/i.test(n)) return 'admin';
    if (/^IPC\$$/i.test(n)) return 'ipc';
    if (/disk/i.test(String(type || ''))) return 'disk';
    return 'other';
}

// "Special Reserved for IPC." → "Reserved · IPC"
// "Unknown type (2147483651)" → "Unknown"
// Keeps the type chip terse so it doesn't dominate the row.
function shortShareType(raw: string): string {
    const s = String(raw || '').trim();
    if (!s) return '—';
    if (/^Disk\s*Drive/i.test(s)) return 'Disk';
    if (/Special.*Reserved.*IPC/i.test(s)) return 'Reserved · IPC';
    if (/Print/i.test(s)) return 'Printer';
    if (/^Unknown\s+type/i.test(s)) return 'Unknown';
    return s;
}

export function NetSharesPanel({ rows }: { rows: any[] }) {
    const sorted = useMemo(() => [...rows].sort((a, b) => {
        const ta = SHARE_TIER_RANK[classifyShare(a.share_name, a.type)];
        const tb = SHARE_TIER_RANK[classifyShare(b.share_name, b.type)];
        if (ta !== tb) return ta - tb;
        return String(a.share_name || '').localeCompare(String(b.share_name || ''));
    }), [rows]);

    const readableCount = rows.filter(r => r.readable).length;
    const adminCount = rows.filter(r => classifyShare(r.share_name, r.type) === 'admin').length;
    const host = rows[0]?.computer_name || '';

    return (
        <OutputPanel
            icon={<Share2 size={11}/>}
            label={`NET SHARES${host ? ` · ${host}` : ''}`}
            count={rows.length}
        >
            <div className="space-y-2">
                {/* Summary strip — compact inline counts, tone-coded */}
                <div className="flex items-center gap-3 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-signal">
                    <span className="flex items-center gap-1.5 text-accent">
                        <Eye size={11}/> {readableCount} readable
                    </span>
                    {adminCount > 0 && (
                        <span className="flex items-center gap-1.5 text-red-400">
                            <Lock size={11}/> {adminCount} admin
                        </span>
                    )}
                    <span className="flex items-center gap-1.5">
                        <Share2 size={11}/> {rows.length} total
                    </span>
                </div>

                {/* Column header */}
                <div className="grid gap-x-3 px-2 py-1 border-b border-signal/15 font-mono text-[10px] uppercase tracking-wider text-signal select-none"
                    style={{ gridTemplateColumns: 'minmax(0,13rem) minmax(0,9rem) 9rem 5.5rem minmax(0,1fr)' }}>
                    <span>Share</span>
                    <span>Host</span>
                    <span>Type</span>
                    <span>Access</span>
                    <span>Comment</span>
                </div>

                {/* Rows — moderate density, inline */}
                <div className="rounded-sm overflow-hidden bg-black/40">
                    {sorted.map((r, i) => {
                        const tier = classifyShare(r.share_name, r.type);
                        const meta = SHARE_TIER_META[tier];
                        const shareName = String(r.share_name || '');
                        const uncPath = host && shareName ? `\\\\${host}\\${shareName}` : shareName;
                        return (
                            <div key={`${shareName}-${i}`}
                                className={cn(
                                    'grid gap-x-3 px-2 py-1.5 items-center font-mono text-[11px] transition-colors hover:bg-signal/[0.04]',
                                    i > 0 && 'border-t border-signal/10',
                                )}
                                style={{ gridTemplateColumns: 'minmax(0,13rem) minmax(0,9rem) 9rem 5.5rem minmax(0,1fr)' }}>
                                {/* Share name with tier icon + UNC tooltip */}
                                <div className="flex items-center gap-1.5 min-w-0" title={uncPath}>
                                    <span className={cn('shrink-0', meta.iconCls)}>{meta.icon}</span>
                                    <span className={cn('font-bold truncate', meta.iconCls)}>{shareName}</span>
                                </div>
                                {/* Host */}
                                <div className="flex items-center gap-1 min-w-0">
                                    <Monitor size={10} className="text-signal shrink-0"/>
                                    <span className="text-signal truncate">{r.computer_name || '—'}</span>
                                </div>
                                {/* Tier chip + verbose type concatenated */}
                                <span className={cn(
                                    'font-mono text-[10px] font-bold px-1.5 py-0.5 border rounded-sm w-fit truncate',
                                    meta.chipCls,
                                )} title={String(r.type || '')}>
                                    {meta.label}{tier === 'other' || tier === 'disk' || tier === 'ipc' ? ` · ${shortShareType(r.type)}` : ''}
                                </span>
                                {/* Readable badge */}
                                {r.readable ? (
                                    <span className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase text-accent w-fit">
                                        <Eye size={10}/> READ
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-sm border border-signal/25 px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase text-signal w-fit">
                                        <EyeOff size={10}/> NONE
                                    </span>
                                )}
                                {/* Comment */}
                                <span className="text-signal truncate" title={r.comment || ''}>
                                    {r.comment?.trim() || <span className="text-signal opacity-50">—</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </OutputPanel>
    );
}

// ─── NetDcListPanel ───────────────────────────────────────────────────────────
// Renders Apollo's `net_dclist` output as Minerva tile cards (per the design
// language's tile pattern: rounded-md border, label/value field rows, wide
// tracking on labels). Global-catalog DCs surface first with an amber accent
// — they're the high-value target for Kerberos AS-REQ/TGS-REQ and SPN
// queries, so the operator should triage them before the regular DCs.
//
// Each card:
//   ┌──────────────────────────────────────────────────────────┐
//   │ 🖧 DC01.contoso.local            [👑 GLOBAL CATALOG]     │
//   │ ──────────────────────────────────────────────────────── │
//   │ DOMAIN     contoso.local                                  │
//   │ FOREST     contoso.local                                  │
//   │ ADDRESSES  [192.168.200.1] [10.0.0.2]                     │
//   │ OS         Windows Server 2025 Standard Evaluation       │
//   └──────────────────────────────────────────────────────────┘

function splitIps(raw: any): string[] {
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    return String(raw || '')
        .split(/[,;\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

export function NetDcListPanel({ rows }: { rows: any[] }) {
    const sorted = useMemo(() => [...rows].sort((a, b) => {
        const ag = a.global_catalog ? 1 : 0;
        const bg = b.global_catalog ? 1 : 0;
        if (ag !== bg) return bg - ag; // GC first
        return String(a.computer_name || '').localeCompare(String(b.computer_name || ''));
    }), [rows]);

    const distinct = (key: string) => {
        const s = new Set<string>();
        for (const r of rows) if (r[key]) s.add(String(r[key]));
        return s.size;
    };
    const gcCount = rows.filter(r => !!r.global_catalog).length;

    return (
        <OutputPanel
            icon={<Server size={11}/>}
            label="DOMAIN CONTROLLERS"
            count={rows.length}
        >
            <div className="space-y-2">
                {/* Summary strip — inline, tone-coded */}
                <div className="flex items-center gap-3 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-signal">
                    {gcCount > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-400">
                            <Crown size={11}/> {gcCount} global catalog
                        </span>
                    )}
                    {distinct('domain') > 0 && (
                        <span className="flex items-center gap-1.5 text-accent">
                            <Network size={11}/> {distinct('domain')} domain{distinct('domain') > 1 ? 's' : ''}
                        </span>
                    )}
                    {distinct('forest') > 0 && (
                        <span className="flex items-center gap-1.5 text-purple-400">
                            <Layers size={11}/> {distinct('forest')} forest{distinct('forest') > 1 ? 's' : ''}
                        </span>
                    )}
                    <span className="flex items-center gap-1.5">
                        <Server size={11}/> {rows.length} dc total
                    </span>
                </div>

                {/* DC cards — stacked layout, fields inline per row */}
                <div className="space-y-1.5">
                    {sorted.map((dc, i) => {
                        const ips = splitIps(dc.ip_address);
                        const isGC = !!dc.global_catalog;
                        const nameToneCls = isGC ? 'text-amber-400' : 'text-accent';
                        const borderCls = isGC ? 'border-amber-400/30' : 'border-signal/15';
                        return (
                            <div
                                key={`${dc.computer_name}-${i}`}
                                className={cn(
                                    'rounded-sm border px-3 py-2 transition-colors hover:bg-signal/[0.04] bg-black/40',
                                    borderCls,
                                )}
                            >
                                {/* Header row: hostname + GC badge inline */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Server size={14} className={cn('shrink-0', nameToneCls)}/>
                                    <span
                                        className={cn('font-mono font-bold text-sm truncate', nameToneCls)}
                                        title={dc.computer_name}
                                    >
                                        {dc.computer_name || '(unknown)'}
                                    </span>
                                    {isGC && (
                                        <span className="inline-flex items-center gap-1 rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase text-amber-400">
                                            <Crown size={10}/> GLOBAL CATALOG
                                        </span>
                                    )}
                                </div>

                                {/* Domain / forest crumb — inline label + value pairs */}
                                {(dc.domain || dc.forest) && (
                                    <div className="mt-1.5 flex items-center gap-2 flex-wrap font-mono text-[11px] text-signal">
                                        {dc.domain && (
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-signal opacity-70">domain</span>
                                                <span className="font-bold text-signal">{dc.domain}</span>
                                            </span>
                                        )}
                                        {dc.domain && dc.forest && <span className="text-signal opacity-40">·</span>}
                                        {dc.forest && (
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-signal opacity-70">forest</span>
                                                <span className="font-bold text-purple-400">{dc.forest}</span>
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* IP chips row */}
                                {ips.length > 0 && (
                                    <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
                                        {ips.map((ip, ipIdx) => (
                                            <span
                                                key={`${ip}-${ipIdx}`}
                                                className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent"
                                            >
                                                <Globe size={10}/> {ip}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* OS version footer */}
                                {dc.os_version && (
                                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-signal" title={dc.os_version}>
                                        <Monitor size={11} className="text-signal shrink-0"/>
                                        <span className="truncate">{dc.os_version}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </OutputPanel>
    );
}

// ─── ProcessDetailPanel ───────────────────────────────────────────────────────

function ProcessDetailItem({ p }: { p: any }) {
    const [open, setOpen] = React.useState(false);
    return (
        <div className="border rounded px-2 py-1.5 transition-colors"
            style={{ border: '1px solid #ffffff0a', background: '#080808' }}>
            <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(o => !o)}>
                <ChevronRight size={10} className="shrink-0 transition-transform"
                    style={{ color: '#555', transform: open ? 'rotate(90deg)' : 'none' }}/>
                <span className="font-mono font-bold text-xs truncate" style={{ color: '#e0e0e0' }}>
                    {p.name || '(unknown)'}
                </span>
                <span className="font-mono text-[11px]" style={{ color: '#777' }}>PID {p.process_id}</span>
                {p.user && <span className="font-mono text-[10px] ml-auto shrink-0" style={{ color: '#888' }}>{p.user}</span>}
            </button>
            {open && (
                <div className="mt-1.5 pl-4 space-y-0.5 font-mono text-[11px]" style={{ color: '#999' }}>
                    {p.description  && <div><span style={{ color: '#555' }}>Desc: </span>{p.description}</div>}
                    {p.bin_path     && <div><span style={{ color: '#555' }}>Bin: </span>{p.bin_path}</div>}
                    {p.command_line && <div><span style={{ color: '#555' }}>Cmd: </span>{p.command_line}</div>}
                </div>
            )}
        </div>
    );
}

export function ProcessDetailPanel({ procs }: { procs: any[] }) {
    return (
        <OutputPanel icon={<Layers size={11}/>} label="PROCESS LIST" count={procs.length}>
            <div className="space-y-1">
                {procs.map((p: any, i: number) => <ProcessDetailItem key={i} p={p} />)}
            </div>
        </OutputPanel>
    );
}

// ─── DirectoryPanel ───────────────────────────────────────────────────────────

export function DirectoryPanel({ directory, host, files }: { directory: string; host?: string; files: any[] }) {
    return (
        <OutputPanel icon={<Folder size={11}/>} label={directory} count={files.length}>
            {/* Header row */}
            <div className="grid gap-x-3 px-1 py-0.5 border-b font-mono text-[9px] uppercase tracking-wider select-none mb-0.5"
                style={{ borderColor: `${ACCENT}18`, color: '#555',
                    gridTemplateColumns: '1.2rem 1fr 7rem 8rem 5rem 7rem' }}>
                <span/><span>Name</span><span>Permissions</span><span>Owner:Group</span>
                <span className="text-right">Size</span><span>Modified</span>
            </div>
            <div className="space-y-0">
                {files.map((f: any, idx: number) => {
                    const perms    = typeof f.permissions === 'object' && f.permissions !== null && !Array.isArray(f.permissions) ? f.permissions : {};
                    const permStr  = perms.permissions || '---------';
                    const typeChar = !f.is_file ? 'd' : (perms.symlink ? 'l' : '-');
                    const fullPerm = typeChar + permStr;
                    const owner    = perms.user  || String(perms.uid ?? '—');
                    const group    = perms.group || String(perms.gid ?? '—');
                    const modTime  = fmtUnixTime(f.modify_time);
                    const isDir    = !f.is_file;
                    const isLink   = !!perms.symlink;
                    const displayName = isLink ? `${f.name} → ${perms.symlink}` : f.name;
                    return (
                        <div key={idx} className="grid gap-x-3 px-1 py-0.5 rounded font-mono text-[11px] items-center transition-colors hover:bg-white/5"
                            style={{ gridTemplateColumns: '1.2rem 1fr 7rem 8rem 5rem 7rem' }}>
                            <span>{isDir ? '📁' : isLink ? '🔗' : '📄'}</span>
                            <span className="truncate font-bold"
                                style={{ color: isDir ? '#ffd080' : isLink ? '#7ab8ff' : '#aaddff' }}
                                title={f.full_name || f.name}>{displayName}</span>
                            <span style={{ color: '#5a5' }}>{fullPerm}</span>
                            <span className="truncate" style={{ color: '#c0a0ff' }}>
                                {owner}<span style={{ color: '#333' }}>:</span>{group}
                            </span>
                            <span className="text-right tabular-nums" style={{ color: '#aaa' }}>
                                {f.is_file ? fmtBytes(f.size) : '—'}
                            </span>
                            <span className="tabular-nums" style={{ color: '#555' }}>{modTime}</span>
                        </div>
                    );
                })}
            </div>
            {host && (
                <div className="mt-1 font-mono text-[10px]" style={{ color: '#444' }}>host: {host}</div>
            )}
        </OutputPanel>
    );
}

// ─── Mimikatz parsers ────────────────────────────────────────────────────────
const mzParseSam = (body: string) => {
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
const MZ_CMD_CLS: Record<string, { color: string; border: string; bg: string }> = {
    'privilege::debug':         { color: '#facc15', border: '#ca8a0440', bg: '#713f1210' },
    'sekurlsa::logonpasswords': { color: '#f87171', border: '#ef444440', bg: '#450a0a10' },
    'token::elevate':           { color: '#fb923c', border: '#f9731640', bg: '#43140910' },
    'lsadump::sam':             { color: '#f87171', border: '#ef444440', bg: '#450a0a10' },
    'lsadump::secrets':         { color: '#fb923c', border: '#f9731640', bg: '#43140910' },
    'lsadump::cache':           { color: '#fb923c', border: '#f9731640', bg: '#43140910' },
    'vault::cred /patch':       { color: '#facc15', border: '#ca8a0440', bg: '#713f1210' },
};
const isMzSensitiveSecret = (n: string) =>
    !n.startsWith('$MACHINE') && !n.startsWith('DPAPI') && !n.startsWith('NL$') && !n.includes('TELEMETRY');

// ─── MimikatzPanel ────────────────────────────────────────────────────────────
export function MimikatzPanel({ content }: { content: string }) {
    const mzParts = content.split(/mimikatz\(commandline\)\s*#\s*/);
    const mzHeader = mzParts[0];
    const mzSections: { cmd: string; body: string }[] = mzParts.slice(1).map(pt => {
        const nl = pt.indexOf('\n');
        return { cmd: nl >= 0 ? pt.substring(0, nl).trim() : pt.trim(), body: nl >= 0 ? pt.substring(nl + 1) : '' };
    });
    const verM = mzHeader.match(/mimikatz\s+(\d+\.\d+\.\d+[^\s]*)/);
    const mzVer = verM ? verM[1] : null;
    return (
        <div className="space-y-2">
            {/* Banner */}
            <div className="flex items-center gap-2 flex-wrap border-b pb-1.5" style={{ borderColor: '#7f1d1d50' }}>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                    style={{ color: '#f87171', borderColor: '#ef444460', background: '#450a0a25' }}>
                    ⚠ MIMIKATZ{mzVer ? ` ${mzVer}` : ''}
                </span>
                <span className="font-mono text-[9px]" style={{ color: '#555' }}>
                    {mzSections.length} command{mzSections.length !== 1 ? 's' : ''}
                </span>
            </div>
            {/* Command sections */}
            {mzSections.map((sec, si) => {
                const cls = MZ_CMD_CLS[sec.cmd] || { color: '#9ca3af', border: '#4b556350', bg: '#1f292e20' };
                const hasErr = /ERROR kuhl/i.test(sec.body);
                const hasOk  = /\bOK\b/.test(sec.body) || /Privilege.*OK/.test(sec.body);
                return (
                    <div key={si} className="border rounded-sm overflow-hidden"
                        style={{ borderColor: '#ffffff08', background: '#00000025' }}>
                        {/* cmd header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 border-b flex-wrap"
                            style={{ background: '#00000030', borderColor: '#ffffff05' }}>
                            <span className="font-mono text-[9px]" style={{ color: '#444' }}>mimikatz #</span>
                            <span className="font-mono text-[9px] font-bold px-2 py-0.5 border rounded-sm"
                                style={{ color: cls.color, borderColor: cls.border, background: cls.bg }}>{sec.cmd}</span>
                            {hasErr && <span className="font-bold text-[9px]" style={{ color: '#ef4444cc' }}>✗ FAILED</span>}
                            {hasOk  && <span className="font-bold text-[9px]" style={{ color: ACCENT }}>✓ OK</span>}
                        </div>
                        <div className="px-3 py-2 text-xs font-mono space-y-1.5">
                            {/* lsadump::sam */}
                            {sec.cmd === 'lsadump::sam' && (() => {
                                const domM = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const sysM = sec.body.match(/SysKey\s+:\s*([a-f0-9]+)/i);
                                const samM = sec.body.match(/SAMKey\s+:\s*([a-f0-9]+)/i);
                                const users = mzParseSam(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b" style={{ borderColor: '#ffffff08' }}>
                                            {domM && <span><span style={{ color: '#555' }}>Domain </span><span style={{ color: '#67e8f9', fontWeight: 700 }}>{domM[1].trim()}</span></span>}
                                            {sysM && <span><span style={{ color: '#555' }}>SysKey </span><span style={{ color: '#9ca3af' }}>{sysM[1]}</span></span>}
                                            {samM && <span><span style={{ color: '#555' }}>SAMKey </span><span style={{ color: '#9ca3af' }}>{samM[1]}</span></span>}
                                        </div>
                                        <div className="space-y-1.5">
                                            {users.map((u, ui) => (
                                                <div key={ui} className="border rounded-sm px-2 py-1.5"
                                                    style={{ borderColor: u.ntlm ? '#ef444440' : '#374151', background: u.ntlm ? '#450a0a20' : '#00000010', opacity: u.ntlm ? 1 : 0.6 }}>
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="font-bold text-sm" style={{ color: '#fff' }}>{u.name}</span>
                                                        <span style={{ color: '#6b7280', fontSize: 10 }}>RID {u.rid}</span>
                                                        {!u.ntlm && <span style={{ color: '#6b7280', fontSize: 10, fontStyle: 'italic' }}>no hash</span>}
                                                    </div>
                                                    {u.ntlm && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold tracking-wider uppercase" style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>NTLM</span>
                                                            <span className="select-all tracking-wide break-all flex-1" style={{ color: '#fecaca', fontSize: 13 }}>{u.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(u.ntlm)} className="p-0.5 rounded hover:bg-white/10" title="Copy NTLM">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {u.ntlmHist.length > 1 && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer" style={{ color: '#6b7280', fontSize: 10 }}>{u.ntlmHist.length} historical hashes</summary>
                                                            <div className="mt-1 pl-2 border-l space-y-0.5" style={{ borderColor: '#374151' }}>
                                                                {u.ntlmHist.slice(1).map((h, hi) => (
                                                                    <div key={hi} className="flex gap-2" style={{ fontSize: 10 }}>
                                                                        <span style={{ color: '#4b5563', width: 48, flexShrink: 0 }}>ntlm-{hi + 1}</span>
                                                                        <span className="select-all break-all flex-1" style={{ color: '#9ca3af' }}>{h}</span>
                                                                        <button onClick={() => navigator.clipboard.writeText(h)} className="p-0.5 rounded hover:bg-white/10"><Copy size={10} style={{ color: '#4b5563' }}/></button>
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
                            {/* lsadump::secrets */}
                            {sec.cmd === 'lsadump::secrets' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const secrets = mzParseSecrets(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b" style={{ borderColor: '#ffffff08' }}>
                                            {domM  && <span><span style={{ color: '#555' }}>Domain </span><span style={{ color: '#67e8f9', fontWeight: 700 }}>{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span style={{ color: '#555' }}>FQDN </span><span style={{ color: '#67e8f9cc' }}>{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {secrets.map((s, si2) => {
                                            const sens = isMzSensitiveSecret(s.name);
                                            const active = s.curText && sens;
                                            return (
                                                <div key={si2} className="border rounded-sm px-2 py-1.5"
                                                    style={{ borderColor: active ? '#ef444450' : '#374151', background: active ? '#450a0a25' : '#00000010' }}>
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <Lock size={11} style={{ color: active ? '#f87171' : '#6b7280', flexShrink: 0 }}/>
                                                        <span className="font-bold text-sm" style={{ color: active ? '#fff' : '#9ca3af' }}>{s.name}</span>
                                                    </div>
                                                    {s.error && <div style={{ color: '#f87171', fontSize: 10, marginBottom: 4 }}>{s.error}</div>}
                                                    {s.curText && (
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="font-bold uppercase tracking-wider" style={{ color: '#4ade80', fontSize: 10, flexShrink: 0 }}>cur</span>
                                                            <span className="select-all break-all flex-1" style={{ color: sens ? '#fecaca' : '#d1d5db', fontWeight: sens ? 700 : 400, fontSize: 13 }}>{s.curText}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curText!)} className="p-0.5 rounded hover:bg-white/10" title="Copy">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.curNtlm && (
                                                        <div className="flex gap-2.5 mt-0.5 items-center">
                                                            <span className="font-bold uppercase" style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>NTLM</span>
                                                            <span className="select-all break-all flex-1 tracking-wide" style={{ color: '#fecaca', fontSize: 13 }}>{s.curNtlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.curNtlm!)} className="p-0.5 rounded hover:bg-white/10">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.curSha1 && <div className="flex gap-2.5 mt-0.5 items-center"><span className="font-bold uppercase" style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>SHA1</span><span className="select-all break-all flex-1" style={{ color: '#9ca3af' }}>{s.curSha1}</span></div>}
                                                    {s.oldText && s.oldText !== s.curText && (
                                                        <div className="flex items-start gap-2 mt-1 pt-1 border-t" style={{ borderColor: '#ffffff08' }}>
                                                            <span className="font-bold uppercase tracking-wider" style={{ color: '#4b5563', fontSize: 10, flexShrink: 0, marginTop: 2 }}>old</span>
                                                            <span className="select-all break-all" style={{ color: '#6b7280' }}>{s.oldText}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {/* lsadump::cache */}
                            {sec.cmd === 'lsadump::cache' && (() => {
                                const domM  = sec.body.match(/Domain\s+:\s*([^\n]+)/);
                                const fqdnM = sec.body.match(/Domain FQDN\s+:\s*(.+)/);
                                const creds = mzParseCache(sec.body);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1.5 border-b" style={{ borderColor: '#ffffff08' }}>
                                            {domM  && <span><span style={{ color: '#555' }}>Domain </span><span style={{ color: '#67e8f9', fontWeight: 700 }}>{domM[1].trim()}</span></span>}
                                            {fqdnM && <span><span style={{ color: '#555' }}>FQDN </span><span style={{ color: '#67e8f9cc' }}>{fqdnM[1].trim()}</span></span>}
                                        </div>
                                        {creds.length === 0 && <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No cached credentials</div>}
                                        <div className="space-y-1.5">
                                            {creds.map((c, ci) => (
                                                <div key={ci} className="border rounded-sm px-2 py-1.5"
                                                    style={{ borderColor: '#f9731640', background: '#43140920' }}>
                                                    <div className="flex items-center gap-3 flex-wrap mb-1">
                                                        <span className="font-bold text-sm" style={{ color: '#fff' }}>{c.user}</span>
                                                        <span style={{ color: '#6b7280', fontSize: 10 }}>{c.slot}</span>
                                                        <span style={{ color: '#6b7280', fontSize: 10 }}>{c.date}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold uppercase tracking-wider" style={{ color: '#fb923c', fontSize: 10, flexShrink: 0 }}>MsCacheV2</span>
                                                        <span className="select-all break-all flex-1 tracking-wide" style={{ color: '#fed7aa', fontSize: 13 }}>{c.hash}</span>
                                                        <button onClick={() => navigator.clipboard.writeText(c.hash)} className="p-0.5 rounded hover:bg-white/10" title="Copy">
                                                            <Copy size={11} style={{ color: '#555' }}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* sekurlsa::logonpasswords */}
                            {sec.cmd === 'sekurlsa::logonpasswords' && (() => {
                                const sessions = mzParseLogon(sec.body);
                                return (
                                    <div className="space-y-1.5">
                                        {sessions.length === 0 && (
                                            <div style={{ color: '#f87171', fontSize: 10 }}>
                                                {sec.body.split('\n').find((l: string) => l.includes('ERROR')) || 'No credentials extracted'}
                                            </div>
                                        )}
                                        {sessions.map((s, si2) => {
                                            const label = `${s.domain && s.domain !== '(null)' ? s.domain + '\\' : ''}${s.user}`;
                                            return (
                                                <div key={si2} className="border rounded-sm px-2 py-2"
                                                    style={{ borderColor: '#ef444440', background: '#450a0a20' }}>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="font-bold text-sm flex-1" style={{ color: '#fff' }}>{label}</span>
                                                        {s.plaintext && <span className="font-bold px-1.5 py-0.5 border rounded-sm"
                                                            style={{ color: '#86efac', borderColor: '#22c55e50', background: '#14532d25', fontSize: 10, flexShrink: 0 }}>PLAINTEXT</span>}
                                                    </div>
                                                    {s.plaintext && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-bold uppercase" style={{ color: '#4ade80', fontSize: 10, flexShrink: 0 }}>PASS</span>
                                                            <span className="font-bold select-all flex-1" style={{ color: '#bbf7d0', fontSize: 13 }}>{s.plaintext}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.plaintext!)} className="p-0.5 rounded hover:bg-white/10" title="Copy password">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.ntlm && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-bold uppercase" style={{ color: '#f87171', fontSize: 10, flexShrink: 0 }}>NTLM</span>
                                                            <span className="select-all flex-1 tracking-wide" style={{ color: '#fecaca', fontSize: 13 }}>{s.ntlm}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(s.ntlm!)} className="p-0.5 rounded hover:bg-white/10" title="Copy hash">
                                                                <Copy size={11} style={{ color: '#555' }}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {s.sha1 && <div className="flex gap-2.5 items-center"><span className="font-bold uppercase" style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>SHA1</span><span className="select-all" style={{ color: '#9ca3af' }}>{s.sha1}</span></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {/* generic: privilege / token / vault / unknown */}
                            {sec.cmd !== 'lsadump::sam' && sec.cmd !== 'lsadump::secrets' &&
                             sec.cmd !== 'lsadump::cache' && sec.cmd !== 'sekurlsa::logonpasswords' && (
                                <div className="space-y-0.5">
                                    {sec.body.split('\n').filter((l: string) => l.trim()).map((line: string, li: number) => {
                                        const color =
                                            /^ERROR/i.test(line.trim())                   ? '#ef4444' :
                                            /Privilege.*OK|\bOK\b/.test(line)             ? ACCENT    :
                                            /NT AUTHORITY|S-1-5-|Impersonated/.test(line) ? '#fdba74' :
                                            /[a-f0-9]{32}/i.test(line)                   ? '#fecaca' :
                                            /^\s*\*/.test(line)                          ? '#e5e7eb' :
                                            '#d1d5db';
                                        return (
                                            <div key={li} style={{ fontSize: 11, lineHeight: '1.7', color,
                                                ...(/[a-f0-9]{32}/i.test(line) ? { letterSpacing: '0.05em' } : {}) }}>{line}</div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── hasBuiltinStructuredRenderer ────────────────────────────────────────────
/**
 * Returns true if any decoded response would be claimed by a built-in
 * specialist panel (ifconfig cards / netstat / ps detail / directory listing).
 * Used by SingleTaskView to decide whether to skip the browser-script output
 * in favour of the more detailed structured renderer.
 */
export function hasBuiltinStructuredRenderer(responses: DecodedResponse[]): boolean {
    return responses.some(r => {
        // Plain-text mimikatz output — check before JSON parse
        if (/mimikatz\s+\d+\.\d+|mimikatz\(commandline\)\s*#/i.test(r.text)) return true;
        const parsed = tryParseJSON(r.text);
        if (!parsed) return false;
        if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0 &&
            parsed.files[0]?.is_file !== undefined) return true;
        if (Array.isArray(parsed) && parsed.length > 0) {
            if (parsed[0]?.AdapterName !== undefined) return true;
            if (parsed[0]?.local_port !== undefined && parsed[0]?.protocol !== undefined) return true;
            if (parsed[0]?.process_id !== undefined) return true;
            if (parsed[0]?.share_name !== undefined && parsed[0]?.computer_name !== undefined) return true;
            if (parsed[0]?.computer_name !== undefined && parsed[0]?.forest !== undefined) return true;
        }
        return false;
    });
}

// ─── StructuredResponseOutput — auto-router for raw decoded responses ————————─
// Detects the data shape of each raw-decoded Mythic response chunk and picks
// the best specialist renderer. Mirrors Console.tsx’s fallback path exactly.

export function StructuredResponseOutput({ responses }: { responses: DecodedResponse[] }) {
    const groups = useMemo(() => {
        const directoryMap = new Map<string, { directory: string; host: string; files: Map<string, any> }>();
        const other: { resp: DecodedResponse; parsed: any }[] = [];
        responses.forEach(r => {
            const parsed = tryParseJSON(r.text);
            if (parsed && Array.isArray(parsed.files)) {
                // Build full directory path
                const fullDir = (() => {
                    const p: string = parsed.parent_path ?? '';
                    const n: string = parsed.name || '';
                    const isWin = /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\') ||
                                  (/^[A-Za-z]:/.test(n) && (n.includes('\\') || n.includes(':')));
                    if (isWin) {
                        if (/^[A-Za-z]:/.test(n) && (!p || p === '\\' || p === '/')) return n;
                        const stripped = p.replace(/[\\/]+$/, '');
                        return stripped ? `${stripped}\\${n}` : n;
                    }
                    if (p === '' || p === '/') return '/' + n;
                    return p.replace(/\/+$/, '') + '/' + n;
                })();
                const dirKey = `${fullDir}|${parsed.host || ''}`;
                if (!directoryMap.has(dirKey))
                    directoryMap.set(dirKey, { directory: fullDir, host: parsed.host || '', files: new Map() });
                const entry = directoryMap.get(dirKey)!;
                parsed.files.forEach((f: any) => {
                    const k = f.full_name || f.name || `${f.name}-${f.size}`;
                    if (!entry.files.has(k)) entry.files.set(k, f);
                });
            } else {
                other.push({ resp: r, parsed });
            }
        });
        return { directoryMap, other };
    }, [responses]);

    return (
        <div className="space-y-2">
            {/* Directory listings */}
            {Array.from(groups.directoryMap.entries()).map(([key, d]) => (
                <DirectoryPanel key={key} directory={d.directory} host={d.host} files={Array.from(d.files.values())}/>
            ))}
            {/* Per-response structured or plain rendering */}
            {groups.other.map(({ resp, parsed }) => {
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (parsed[0]?.AdapterName !== undefined)
                        return <IfconfigPanel key={resp.id} adapters={parsed}/>;
                    if (parsed[0]?.local_port !== undefined && parsed[0]?.protocol !== undefined)
                        return <NetstatPanel key={resp.id} rows={parsed}/>;
                    if (parsed[0]?.process_id !== undefined)
                        return <ProcessDetailPanel key={resp.id} procs={parsed}/>;
                    if (parsed[0]?.share_name !== undefined && parsed[0]?.computer_name !== undefined)
                        return <NetSharesPanel key={resp.id} rows={parsed}/>;
                    if (parsed[0]?.computer_name !== undefined && parsed[0]?.forest !== undefined)
                        return <NetDcListPanel key={resp.id} rows={parsed}/>;
                }
                if (/mimikatz\s+\d+\.\d+|mimikatz\(commandline\)\s*#/i.test(resp.text))
                    return <MimikatzPanel key={resp.id} content={resp.text}/>;
                return <ParsedOutput key={resp.id} text={resp.text} isError={resp.is_error}/>;
            })}
        </div>
    );
}

// ─── RawOutput ────────────────────────────────────────────────────────────────

export interface RawOutputProps {
    responses: DecodedResponse[];
}

/** Raw terminal view: exact decoded bytes, errors in red */
export function RawOutput({ responses }: RawOutputProps) {
    if (!responses.length)
        return <p className="font-mono text-[13px] animate-pulse" style={{ color: '#555' }}>waiting for output…</p>;
    return (
        <pre className="font-mono text-[13px] leading-[1.7] whitespace-pre-wrap break-words select-text"
            style={{ color: '#d0d0d0', fontFamily: MONO }}>
            {responses.map(r => (
                <span key={r.id} style={{ color: r.is_error ? ERR : undefined }}>{r.text}</span>
            ))}
        </pre>
    );
}

// ─── OutputModeToggle ─────────────────────────────────────────────────────────

export type OutputMode = 'parsed' | 'raw';

export interface OutputModeToggleProps {
    mode: OutputMode;
    onChange: (m: OutputMode) => void;
}

/** Inline [PARSED] [RAW] pill toggle, Minerva-styled */
export function OutputModeToggle({ mode, onChange }: OutputModeToggleProps) {
    return (
        <div className="flex items-center shrink-0">
            {(['parsed', 'raw'] as OutputMode[]).map(m => (
                <button key={m} onClick={() => onChange(m)}
                    className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors first:rounded-l-sm last:rounded-r-sm border"
                    style={{
                        background:   mode === m ? '#00ffd115' : 'transparent',
                        color:        mode === m ? ACCENT      : '#555',
                        borderColor:  mode === m ? '#00ffd140' : '#222',
                        fontWeight:   mode === m ? 700         : 400,
                    }}>
                    {m}
                </button>
            ))}
        </div>
    );
}

// ─── Ace syntax modes supported ──────────────────────────────────────────────
export const syntaxModes = [
    "csharp", "golang", "html", "json", "markdown", "ruby", "python", "java",
    "javascript", "yaml", "toml", "swift", "sql", "rust", "powershell", "pgsql",
    "perl", "php", "objectivec", "nginx", "makefile", "kotlin", "dockerfile", "sh", "ini", "apache_conf"
].sort();

/** AceEditor-based syntax highlighting panel for code/script output */
export function SyntaxHighlightPanel({ text, initialMode, wrapText }: {
    text: string;
    initialMode?: string;
    wrapText?: boolean;
}) {
    const [mode, setMode] = useState(initialMode || 'json');
    const [wrap, setWrap] = useState(wrapText ?? true);
    const [showDropdown, setShowDropdown] = useState(false);
    
    return (
        <OutputPanel icon={<Code size={14} />} label="SYNTAX_HIGHLIGHT" accent="#a78bfa">
            <div className="flex items-center gap-2 mb-2">
                <div className="relative">
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center gap-1 px-2 py-1 bg-black/60 border border-white/10 text-xs font-mono text-gray-300 hover:border-purple-500/40 transition-colors"
                    >
                        {mode} <ChevronDown size={10} />
                    </button>
                    {showDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-40 max-h-64 overflow-y-auto bg-black border border-white/20 z-50 py-1">
                            {syntaxModes.map(m => (
                                <button key={m} onClick={() => { setMode(m); setShowDropdown(false); }}
                                    className={`w-full text-left px-3 py-1 text-xs font-mono transition-colors ${mode === m ? 'text-purple-400 bg-purple-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setWrap(!wrap)}
                    className={`px-2 py-1 text-[10px] font-mono border transition-colors ${wrap ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}
                >
                    WRAP
                </button>
                <button onClick={() => { navigator.clipboard.writeText(text); }}
                    className="px-2 py-1 text-[10px] font-mono border border-white/10 text-gray-500 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1"
                >
                    <Copy size={10} /> COPY
                </button>
            </div>
            <div className="border border-white/10 overflow-hidden" style={{ minHeight: 200 }}>
                <AceEditor
                    mode={mode}
                    theme="monokai"
                    value={text}
                    name="syntax-highlight-panel"
                    readOnly={true}
                    width="100%"
                    height={`${Math.min(Math.max(text.split('\n').length * 16, 200), 600)}px`}
                    fontSize={12}
                    wrapEnabled={wrap}
                    showPrintMargin={false}
                    showGutter={true}
                    highlightActiveLine={false}
                    setOptions={{
                        useWorker: false,
                        showLineNumbers: true,
                        tabSize: 4,
                    }}
                    style={{ background: '#0a0a0a' }}
                />
            </div>
        </OutputPanel>
    );
}

/** Hex dump viewer for binary data */
export function HexViewerPanel({ data }: { data: string }) {
    const hexLines = useMemo(() => {
        const bytes: number[] = [];
        // Try to decode as base64 first
        try {
            const decoded = window.atob(data);
            for (let i = 0; i < decoded.length; i++) bytes.push(decoded.charCodeAt(i));
        } catch {
            // If not base64, treat as raw string
            for (let i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i));
        }
        const lines: { offset: string; hex: string; ascii: string }[] = [];
        for (let off = 0; off < bytes.length; off += 16) {
            const chunk = bytes.slice(off, off + 16);
            const hexParts = chunk.map(b => b.toString(16).padStart(2, '0'));
            while (hexParts.length < 16) hexParts.push('  ');
            const left = hexParts.slice(0, 8).join(' ');
            const right = hexParts.slice(8).join(' ');
            const ascii = chunk.map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
            lines.push({
                offset: off.toString(16).padStart(8, '0'),
                hex: `${left}  ${right}`,
                ascii,
            });
        }
        return lines;
    }, [data]);

    return (
        <OutputPanel icon={<Hash size={14} />} label="HEX_DUMP" accent="#f59e0b" count={hexLines.length}>
            <div className="font-mono text-[11px] bg-black/80 border border-white/10 overflow-auto max-h-[500px]">
                <div className="px-3 py-1 bg-white/5 border-b border-white/10 flex gap-1 text-gray-500">
                    <span className="w-[72px]">OFFSET</span>
                    <span className="flex-1">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
                    <span className="w-[140px]">ASCII</span>
                </div>
                {hexLines.map((line, i) => (
                    <div key={i} className="px-3 py-0.5 flex gap-1 hover:bg-white/5 transition-colors">
                        <span className="w-[72px] text-yellow-600/70 shrink-0">{line.offset}</span>
                        <span className="flex-1 text-signal/70">{line.hex}</span>
                        <span className="w-[140px] text-cyan-500/60 shrink-0">{line.ascii}</span>
                    </div>
                ))}
            </div>
        </OutputPanel>
    );
}
