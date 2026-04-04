import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { useSubscription, useMutation } from "@apollo/client/react";
import { Terminal, CheckCircle, CornerDownLeft, WrapText, Palette, Search, XCircle, Key, Copy} from 'lucide-react';
import { STREAM_INTERACTIVE_SUBTASKS, CREATE_INTERACTIVE_TASK_MUTATION } from '../../lib/api';
import Anser from 'anser';
import { cn, b64DecodeUnicode } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';

const itzHandleTerminalCodes = (raw: string): string => {
    let out = raw.replaceAll('[?2004h', '').replaceAll('[?2004l', '');
    // Strip OSC title sequences (ESC ]0; ... BEL)
    let ti = out.indexOf(']0');
    if (ti >= 0) {
        const te = out.indexOf('\x07', ti);
        if (te >= 0) out = out.substring(0, ti) + out.substring(te + 1);
    }
    // Erase-to-end-of-display [J
    let cj = out.indexOf('[J');
    if (cj >= 0) {
        let nl = 0;
        for (let i = cj; i >= 0; i--) { if (out[i] === '\n') { nl = i; break; } }
        out = out.substring(0, nl + 1) + out.substring(cj + 2);
    }
    return out;
};

const INTERACTIVE_CTRL_TYPES = [
    { name: 'None',    value: -1, text: '' },
    { name: 'Tab',     value: 13, text: '^I' },
    { name: 'Backspace', value: 12, text: '^H' },
    { name: 'Exit',    value: 3,  text: 'exit' },
    { name: 'Escape',  value: 4,  text: '^[' },
    { name: 'Ctrl+A',  value: 5,  text: '^A' },
    { name: 'Ctrl+B',  value: 6,  text: '^B' },
    { name: 'Ctrl+C',  value: 7,  text: '^C' },
    { name: 'Ctrl+D',  value: 8,  text: '^D' },
    { name: 'Ctrl+E',  value: 9,  text: '^E' },
    { name: 'Ctrl+F',  value: 10, text: '^F' },
    { name: 'Ctrl+G',  value: 11, text: '^G' },
    { name: 'Ctrl+K',  value: 14, text: '^K' },
    { name: 'Ctrl+L',  value: 15, text: '^L' },
    { name: 'Ctrl+N',  value: 16, text: '^N' },
    { name: 'Ctrl+P',  value: 17, text: '^P' },
    { name: 'Ctrl+Q',  value: 18, text: '^Q' },
    { name: 'Ctrl+R',  value: 19, text: '^R' },
    { name: 'Ctrl+S',  value: 20, text: '^S' },
    { name: 'Ctrl+U',  value: 21, text: '^U' },
    { name: 'Ctrl+W',  value: 22, text: '^W' },
    { name: 'Ctrl+Y',  value: 23, text: '^Y' },
    { name: 'Ctrl+Z',  value: 24, text: '^Z' },
] as const;

const INTERACTIVE_ENTER_OPTS = [
    { name: 'None', value: '' },
    { name: 'LF',   value: '\n' },
    { name: 'CR',   value: '\r' },
    { name: 'CRLF', value: '\r\n' },
] as const;

// ============================================
// InteractiveTaskBlock
// ============================================
export const InteractiveTaskBlock = ({ taskId, task, liveResponses, callbackDisplayId, commandName, myUsername }: {
    taskId: number;
    task: any;
    liveResponses: any[];        // base64-encoded rows from TaskBlock's STREAM_TASK_RESPONSES
    callbackDisplayId: number;
    commandName: string;
    myUsername: string;
}) => {
    const PAGE_SIZE = 100;

    // ── Decode base64 responses ────────────────────────────────
    const decodedResponses = useMemo(() =>
        liveResponses.map(r => ({
            _type: 'response' as const,
            id: r.id,
            timestamp: r.timestamp,
            text: b64DecodeUnicode(r.response || ''),
            is_error: !!r.is_error,
        })),
        [liveResponses]
    );

    // ── Stream sent interactive sub-tasks ─────────────────────
    const [subTasks, setSubTasks] = useState<any[]>([]);
    const prevTaskIdRef = useRef(taskId);
    useSubscription<any>(STREAM_INTERACTIVE_SUBTASKS, {
        variables: { parent_task_id: taskId },
        fetchPolicy: 'no-cache',
        onData: ({ data: d }: any) => {
            const incoming: any[] = d?.data?.task_stream || [];
            if (!incoming.length) return;
            if (taskId !== prevTaskIdRef.current) {
                setSubTasks(incoming);
                prevTaskIdRef.current = taskId;
            } else {
                setSubTasks(prev =>
                    incoming.reduce((acc: any[], cur: any) => {
                        const idx = acc.findIndex(t => t.id === cur.id);
                        if (idx >= 0) { const next = [...acc]; next[idx] = cur; return next; }
                        return [...acc, cur];
                    }, [...prev])
                );
            }
        },
        onError: (err) => { console.error('[STREAM_INTERACTIVE_SUBTASKS] subscription error:', err); },
    });

    // ── Merge + sort responses and sent inputs ─────────────────
    const allOutputAll = useMemo(() => {
        const inputEntries = subTasks.map(t => ({
            _type: 'input' as const,
            id: t.id,
            timestamp: t.status_timestamp_preprocessing || t.timestamp,
            text: t.original_params || t.display_params || '',
            status: t.status as string,
        }));
        const merged = [...decodedResponses, ...inputEntries];
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return merged;
    }, [decodedResponses, subTasks]);

    // ── UI state ────────────────────────────────────────────────
    const [inputText, setInputText]       = useState('');
    const [useAnsi, setUseAnsi]           = useState(true);
    const [showStatus, setShowStatus]     = useState(true);
    const [wrapText, setWrapText]         = useState(true);
    const [ctrlType, setCtrlType]         = useState<(typeof INTERACTIVE_CTRL_TYPES)[number]>(INTERACTIVE_CTRL_TYPES[0]);
    const [enterOpt, setEnterOpt]         = useState<(typeof INTERACTIVE_ENTER_OPTS)[number]>(INTERACTIVE_ENTER_OPTS[1]);
    const [search, setSearch]             = useState('');
    const [currentPage, setCurrentPage]   = useState(1);
    const [historyIdx, setHistoryIdx]     = useState(-1);
    const inputRef         = useRef<HTMLInputElement>(null);
    const outputEndRef     = useRef<HTMLDivElement>(null);
    const outputContainerRef = useRef<HTMLDivElement>(null);

    // ── Mutation ────────────────────────────────────────────────
    const [createInteractiveTask] = useMutation<any>(CREATE_INTERACTIVE_TASK_MUTATION, {
        onError: (err: Error) => snackActions.error(err.message),
        update: (_: any, { data }: any) => {
            if (data?.createTask?.status === 'error') snackActions.error(data.createTask.error);
        },
    });

    // ── Filtered + paginated display ────────────────────────────
    const filteredOutput = useMemo(() => {
        if (!search.trim()) return allOutputAll;
        const s = search.toLowerCase();
        return allOutputAll.filter(e => e.text.toLowerCase().includes(s));
    }, [allOutputAll, search]);

    useEffect(() => { setCurrentPage(1); }, [search]);

    const pageCount = Math.max(1, Math.ceil(filteredOutput.length / PAGE_SIZE));
    const displayedOutput = useMemo(() =>
        filteredOutput.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filteredOutput, currentPage]
    );

    // ── Auto-scroll (my tasks only) ─────────────────────────────
    const isMyTask = task?.operator?.username === myUsername;
    const prevLenRef = useRef(0);
    useLayoutEffect(() => {
        const el = outputContainerRef.current;
        if (!el || !isMyTask || !outputEndRef.current) return;
        const grew = filteredOutput.length > prevLenRef.current;
        prevLenRef.current = filteredOutput.length;
        const onLastPage = currentPage === pageCount;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 500;
        if (grew && onLastPage && nearBottom && !search) {
            outputEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedOutput]);

    // ── History navigation ──────────────────────────────────────
    const historyOptions = useMemo(() =>
        subTasks
            .filter(t => (t.display_params?.length ?? 0) > 1 &&
                (t.interactive_task_type === 0 || t.interactive_task_type === 8))
            .sort((a: any, b: any) => b.id - a.id),
        [subTasks]
    );

    // ── Send handler ────────────────────────────────────────────
    const handleSend = useCallback(() => {
        if (!commandName) { snackActions.warning('Command name unknown for this task'); return; }
        const ctrl = ctrlType;
        const enter = enterOpt;
        let params: string;
        let originalParams: string;

        if (ctrl.value > 0) {
            if (ctrl.value === 8) {
                // Ctrl+D: no line ending
                params = inputText;
                originalParams = inputText + ctrl.text;
            } else if (ctrl.value === 4) {
                // Escape: escape prefix first, no line ending
                params = inputText + enter.value;
                originalParams = ctrl.text + inputText;
            } else {
                params = inputText + enter.value;
                originalParams = inputText + ctrl.text + enter.value;
            }
        } else {
            params = inputText + enter.value;
            originalParams = inputText + enter.value;
        }

        createInteractiveTask({
            variables: {
                callback_id: callbackDisplayId,
                command: commandName,
                params,
                original_params: originalParams,
                tasking_location: 'command_line',
                parameter_group_name: 'default',
                parent_task_id: taskId,
                interactive_task_type: ctrl.value > 0 ? ctrl.value : 0,
            },
        });
        setInputText('');
        setCtrlType(INTERACTIVE_CTRL_TYPES[0]);
        setHistoryIdx(-1);
    }, [inputText, ctrlType, enterOpt, commandName, callbackDisplayId, taskId, createInteractiveTask]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleSend();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const ni = Math.min(historyIdx + 1, historyOptions.length - 1);
            if (ni >= 0 && historyOptions[ni]) {
                setHistoryIdx(ni);
                setInputText(historyOptions[ni].display_params.trim());
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const ni = historyIdx - 1;
            if (ni < 0) { setHistoryIdx(-1); setInputText(''); }
            else if (historyOptions[ni]) { setHistoryIdx(ni); setInputText(historyOptions[ni].display_params.trim()); }
        }
    };

    // ── ANSI rendering (inline styles — no external CSS needed) ─
    const renderAnsiText = useCallback((text: string): React.ReactNode => {
        try {
            const tokens: any[] = Anser.ansiToJson(itzHandleTerminalCodes(text), {
                json: true,
                remove_empty: true,
            });
            return tokens.map((token, i) => {
                const style: React.CSSProperties = {
                    display: 'inline',
                    whiteSpace: wrapText ? 'pre-wrap' : 'pre',
                    wordBreak: wrapText ? 'break-all' : 'normal',
                };
                const fg = token.fg_truecolor || token.fg;
                const bg = token.bg_truecolor || token.bg;
                if (fg) style.color = `rgb(${fg})`;
                if (bg) style.backgroundColor = `rgb(${bg})`;
                if (token.decoration === 'bold')      style.fontWeight = 'bold';
                if (token.decoration === 'italic')    style.fontStyle = 'italic';
                if (token.decoration === 'underline') style.textDecoration = 'underline';
                if (token.decoration === 'reverse')   [style.color, style.backgroundColor] = [style.backgroundColor, style.color];
                return <span key={i} style={style}>{token.content}</span>;
            });
        } catch {
            return <span style={{ display: 'inline', whiteSpace: wrapText ? 'pre-wrap' : 'pre' }}>{itzHandleTerminalCodes(text)}</span>;
        }
    }, [wrapText]);

    // ── Entry renderer ──────────────────────────────────────────
    type Entry = { _type: 'response' | 'input'; id: number; text: string; is_error?: boolean; status?: string };
    const renderEntry = (entry: Entry, idx: number) => {
        const key = `${entry._type}-${entry.id}-${idx}`;
        const baseStyle: React.CSSProperties = {
            display: 'inline',
            margin: 0,
            whiteSpace: wrapText ? 'pre-wrap' : 'pre',
            wordBreak: wrapText ? 'break-all' : 'normal',
        };

        if (entry._type === 'response') {
            if (entry.is_error) {
                return (
                    <pre key={key} style={{ ...baseStyle, backgroundColor: '#1a0505', color: '#fca5a5' }}>
                        {entry.text}
                    </pre>
                );
            }
            return (
                <pre key={key} style={baseStyle}>
                    {useAnsi ? renderAnsiText(entry.text) : entry.text}
                </pre>
            );
        }

        // Input echo
        const statusIcon = showStatus
            ? (entry.status === 'completed' || entry.status === 'success')
                ? <CheckCircle size={9} className="inline text-green-400 mr-0.5 relative top-[-1px]" />
                : entry.status === 'submitted'
                    ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse mr-1 relative top-[-1px]" />
                    : null
            : null;
        return (
            <pre key={key} style={{ ...baseStyle, color: '#22d3ee', whiteSpace: 'pre-wrap' }}>
                {statusIcon}{entry.text}
            </pre>
        );
    };

    // ── Render ──────────────────────────────────────────────────
    return (
        <div className="flex flex-col rounded border border-purple-500/30 bg-black/60 overflow-hidden mt-2">

            {/* ── Header bar ── */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-950/30 border-b border-purple-500/20">
                <Terminal size={11} className="text-purple-400 shrink-0" />
                <span className="font-mono text-[10px] font-bold tracking-wider text-purple-300">INTERACTIVE TERMINAL</span>
                {commandName && (
                    <span className="font-mono text-[10px] text-purple-400/50">— {commandName}</span>
                )}
                {/* Right-side toggles */}
                <div className="ml-auto flex items-center gap-1">
                    <button
                        title={useAnsi ? 'Disable ANSI Color' : 'Enable ANSI Color'}
                        onClick={() => setUseAnsi(v => !v)}
                        className={cn('p-1 rounded border transition-colors',
                            useAnsi ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/5 text-gray-600 hover:text-gray-400')}>
                        <Palette size={10} />
                    </button>
                    <button
                        title={showStatus ? 'Hide Task Status Icons' : 'Show Task Status Icons'}
                        onClick={() => setShowStatus(v => !v)}
                        className={cn('p-1 rounded border transition-colors',
                            showStatus ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/5 text-gray-600 hover:text-gray-400')}>
                        <CheckCircle size={10} />
                    </button>
                    <button
                        title={wrapText ? 'Disable Text Wrap' : 'Enable Text Wrap'}
                        onClick={() => setWrapText(v => !v)}
                        className={cn('p-1 rounded border transition-colors',
                            wrapText ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/5 text-gray-600 hover:text-gray-400')}>
                        <WrapText size={10} />
                    </button>
                    <span className="font-mono text-[9px] text-gray-700 ml-1 select-none">
                        ↑↓  history
                    </span>
                </div>
            </div>

            {/* ── Output area ── */}
            <div
                ref={outputContainerRef}
                className="font-mono text-[11px] text-gray-200 px-2.5 py-2 overflow-y-auto bg-black/30 select-text"
                style={{ minHeight: '260px', maxHeight: '560px' }}>
                {displayedOutput.map((entry, idx) => renderEntry(entry as Entry, idx))}
                <div ref={outputEndRef} />
            </div>

            {/* ── Pagination bar ── */}
            {pageCount > 1 && (
                <div className="flex items-center justify-center gap-1 py-1 border-t border-white/5 bg-black/20 font-mono text-[10px]">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">«</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">‹</button>
                    {(() => {
                        const pages: (number | '...')[] = [];
                        if (pageCount <= 9) {
                            for (let i = 1; i <= pageCount; i++) pages.push(i);
                        } else {
                            pages.push(1);
                            if (currentPage > 4) pages.push('...');
                            const start = Math.max(2, currentPage - 2);
                            const end = Math.min(pageCount - 1, currentPage + 2);
                            for (let i = start; i <= end; i++) pages.push(i);
                            if (currentPage < pageCount - 3) pages.push('...');
                            pages.push(pageCount);
                        }
                        return pages.map((p, i) =>
                            p === '...'
                                ? <span key={`e${i}`} className="px-1 text-gray-600">…</span>
                                : <button key={p} onClick={() => setCurrentPage(p)}
                                    className={cn('px-1.5 py-0.5 rounded border transition-colors',
                                        p === currentPage ? 'border-signal/40 text-signal bg-signal/10' : 'border-white/10 text-gray-500 hover:text-gray-300')}>{p}</button>
                        );
                    })()}
                    <button onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">›</button>
                    <button onClick={() => setCurrentPage(pageCount)} disabled={currentPage === pageCount}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-30">»</button>
                    <span className="text-gray-600 ml-2">Total: {filteredOutput.length}</span>
                </div>
            )}

            {/* ── Search bar ── */}
            <div className="flex items-center gap-2 px-3 py-1 border-t border-white/5 bg-black/20">
                <Search size={9} className="text-gray-600 shrink-0" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="filter output..."
                    className="flex-1 bg-transparent font-mono text-[10px] text-gray-400 placeholder-gray-700 outline-none"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-400 transition-colors">
                        <XCircle size={9} />
                    </button>
                )}
            </div>

            {/* ── Input bar ── */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-purple-500/20 bg-black/40">
                {/* Control sequence selector */}
                <select
                    value={ctrlType.value}
                    onChange={e => {
                        const found = INTERACTIVE_CTRL_TYPES.find(c => c.value === Number(e.target.value));
                        if (found) setCtrlType(found);
                    }}
                    className="bg-black/60 border border-white/10 rounded font-mono text-[10px] text-gray-300 px-1.5 py-0.5 focus:outline-none focus:border-purple-400/40 min-w-[4.5rem] shrink-0 transition-colors">
                    {INTERACTIVE_CTRL_TYPES.map(o => (
                        <option key={o.value} value={o.value}>{o.name}</option>
                    ))}
                </select>

                {/* Main text input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={e => { setInputText(e.target.value); setHistoryIdx(-1); }}
                    onKeyDown={handleKeyDown}
                    placeholder=">_ type here..."
                    autoFocus
                    className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-gray-100 placeholder-gray-700 focus:outline-none focus:border-purple-400/30 transition-colors min-w-0"
                />

                {/* Line-ending selector */}
                <select
                    value={enterOpt.name}
                    onChange={e => {
                        const found = INTERACTIVE_ENTER_OPTS.find(o => o.name === e.target.value);
                        if (found) setEnterOpt(found);
                    }}
                    className="bg-black/60 border border-white/10 rounded font-mono text-[10px] text-gray-300 px-1.5 py-0.5 focus:outline-none focus:border-purple-400/40 w-[52px] shrink-0 transition-colors">
                    {INTERACTIVE_ENTER_OPTS.map(o => (
                        <option key={o.name} value={o.name}>{o.name}</option>
                    ))}
                </select>

                {/* Send button */}
                <button
                    onClick={handleSend}
                    title="Send (Enter)"
                    className="p-1.5 rounded border border-purple-500/30 bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 hover:border-purple-400/40 transition-colors shrink-0">
                    <CornerDownLeft size={11} />
                </button>
            </div>
        </div>
    );
};

/* ─────────── TaskCredentialsPanel ─────────── */
export const TaskCredentialsPanel = ({ credentials }: {
    credentials?: Array<{ id: number; account: string; realm: string; type: string; credential_text: string; comment: string; }>;
}) => {
    if (!credentials || credentials.length === 0) return null;
    const maxLen = 80;
    const shortCred = (s: string) => s?.length > maxLen ? s.slice(0, maxLen) + '…' : (s ?? '');
    const copyText = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        snackActions.success(`${label} copied`);
    };
    return (
        <div className="mt-2 border border-yellow-500/20 bg-yellow-900/5 rounded-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-yellow-500/20">
                <Key size={11} className="text-yellow-400 shrink-0" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-yellow-400">
                    {credentials.length} Credential{credentials.length !== 1 ? 's' : ''} Harvested by This Task
                </span>
            </div>
            <div className="divide-y divide-white/5">
                {credentials.map(cred => (
                    <div key={cred.id} className="px-3 py-2 flex items-center gap-3 text-xs font-mono flex-wrap">
                        <span className="text-[9px] px-1.5 py-0.5 border border-orange-500/30 bg-orange-900/20 text-orange-400 rounded-sm uppercase shrink-0">{cred.type}</span>
                        <span className="text-signal font-bold shrink-0">{cred.account}</span>
                        {cred.realm && <span className="text-gray-500 shrink-0 text-[10px]">@{cred.realm}</span>}
                        <span className="text-gray-400 flex-1 truncate min-w-0">{shortCred(cred.credential_text)}</span>
                        <button
                            onClick={() => copyText(cred.credential_text, 'Credential')}
                            className="shrink-0 p-1 hover:bg-white/10 rounded text-gray-600 hover:text-gray-300 transition-colors"
                            title="Copy credential">
                            <Copy size={11} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

