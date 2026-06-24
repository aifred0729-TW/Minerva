/**
 * Parsed output renderer for MSF console output.
 * Shared by Task History (post-mortem) and Launch Attack (live).
 *
 * Two views:
 *   PARSED — banner / params / log lines, classified by severity
 *   RAW    — original text, ANSI-stripped
 *
 * In live mode (autoScroll), the viewport sticks to the bottom whenever
 * new content arrives, the same way a tail-f terminal does.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Terminal, Eye, Code, ChevronRight, CheckCircle, Minus, AlertTriangle,
    Info, Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    parseMsfOutput, groupParams, stripAnsi,
    type MsfLogLine, type LogLevel, type ParamGroup,
} from './outputParser';

// Per design language: static text on dark bg is full-strength Minerva tokens —
// no `text-signal/X` opacity, no `text-gray-X`. Severity colours stay saturated
// because they're meaningful (success/error/warning), not decoration.
const LOG_LEVEL_STYLES: Record<LogLevel, { color: string; icon: React.ReactNode; bg: string }> = {
    success: { color: 'text-accent',   icon: <CheckCircle size={11} />,    bg: 'bg-accent/10' },
    error:   { color: 'text-red-500',  icon: <Minus size={11} />,          bg: 'bg-red-500/10' },
    warning: { color: 'text-amber-400',icon: <AlertTriangle size={11} />,  bg: 'bg-amber-500/10' },
    info:    { color: 'text-signal',   icon: <Info size={11} />,           bg: '' },
    debug:   { color: 'text-signal',   icon: <Code size={11} />,           bg: '' },
    plain:   { color: 'text-signal',   icon: null,                         bg: '' },
};

export function LogLineRow({ line }: { line: MsfLogLine }) {
    const style = LOG_LEVEL_STYLES[line.level];
    return (
        <div className={cn('flex items-start gap-2 px-3 py-1 font-mono text-xs', style.bg)}>
            {style.icon && <span className={cn('mt-0.5 shrink-0', style.color)}>{style.icon}</span>}
            {line.timestamp && (
                <span className="text-accent shrink-0 text-[10px]">{line.timestamp}</span>
            )}
            <span className={cn('break-all whitespace-pre-wrap', style.color)}>{line.message}</span>
        </div>
    );
}

export function ParsedParamsPanel({ groups }: { groups: ParamGroup[] }) {
    if (groups.length === 0) return null;
    const mainGroup = groups.find(g => g.label === 'Module Options');
    const nsGroups = groups.filter(g => g.label !== 'Module Options');
    return (
        <div className="space-y-2">
            {mainGroup && mainGroup.params.length > 0 && (
                <div className="border border-signal/20 bg-machine/40 p-3 rounded-md">
                    <div className="text-[10px] font-mono text-signal uppercase tracking-[0.25em] mb-2 flex items-center gap-1.5">
                        <Zap size={10} className="text-accent" /> Module Config
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                        {mainGroup.params.map(p => (
                            <div key={p.key} className="flex items-baseline gap-2 text-[11px] font-mono py-0.5">
                                <span className="text-signal shrink-0">{p.key}</span>
                                <span className="text-signal">→</span>
                                <span className={cn(
                                    'truncate font-bold',
                                    p.value === 'true' ? 'text-accent' :
                                        p.value === 'false' ? 'text-red-500' :
                                            'text-signal'
                                )}>{p.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {nsGroups.length > 0 && (
                <details className="group">
                    <summary className="flex items-center gap-2 cursor-pointer text-[10px] font-mono text-signal uppercase tracking-[0.25em] hover:text-accent transition-colors">
                        <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
                        ADVANCED DEFAULTS ({nsGroups.reduce((s, g) => s + g.params.length, 0)} params across {nsGroups.length} namespaces)
                    </summary>
                    <div className="mt-2 space-y-2 max-h-[250px] overflow-y-auto cyber-scrollbar">
                        {nsGroups.map(g => (
                            <div key={g.label} className="border border-signal/15 bg-machine/30 p-2 rounded-md">
                                <div className="text-[10px] font-mono text-signal uppercase tracking-[0.25em] mb-1.5">{g.label}::</div>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5">
                                    {g.params.map(p => {
                                        const shortKey = p.key.includes('::') ? p.key.split('::').slice(1).join('::') : p.key;
                                        return (
                                            <div key={p.key} className="flex items-baseline gap-1.5 text-[10px] font-mono py-0.5">
                                                <span className="text-signal shrink-0">{shortKey}</span>
                                                <span className={cn(
                                                    'truncate',
                                                    p.value === 'true' ? 'text-accent font-bold' :
                                                        p.value === 'false' ? 'text-red-500' :
                                                            'text-signal'
                                                )}>{p.value}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

interface ParsedOutputViewProps {
    output: string;
    /** Title shown next to the terminal icon (e.g. "CONSOLE #4"). */
    title?: React.ReactNode;
    /** Right-aligned status pill (e.g. busy/done indicator). */
    rightSlot?: React.ReactNode;
    /** Scroll to bottom whenever new content arrives. Default true. */
    autoScroll?: boolean;
    /** Fixed body height (CSS). Default '450px'. */
    bodyHeight?: string;
    /** Initial view mode. Default 'parsed'. */
    defaultMode?: 'parsed' | 'raw';
    /** Show a blinking cursor at the end while a command is in flight. */
    busy?: boolean;
}

export function ParsedOutputView({
    output,
    title,
    rightSlot,
    autoScroll = true,
    bodyHeight = '450px',
    defaultMode = 'parsed',
    busy = false,
}: ParsedOutputViewProps) {
    const [viewMode, setViewMode] = useState<'parsed' | 'raw'>(defaultMode);
    const parsed = useMemo(() => parseMsfOutput(output), [output]);
    const paramGroups = useMemo(() => groupParams(parsed.params), [parsed.params]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);

    // Track whether the user has scrolled away from the bottom; if they have,
    // don't yank them back when new content arrives.
    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        stickToBottomRef.current = nearBottom;
    };

    useEffect(() => {
        if (!autoScroll || !stickToBottomRef.current) return;
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [output, viewMode, autoScroll]);

    const cleanRaw = useMemo(() => stripAnsi(output), [output]);
    const successCount = parsed.logLines.filter(l => l.level === 'success').length;
    const errorCount = parsed.logLines.filter(l => l.level === 'error').length;

    return (
        <div className="border border-signal/20 bg-void overflow-hidden rounded-md">
            <div className="flex items-center justify-between px-4 py-2 border-b border-signal/15 bg-machine/40">
                <div className="flex items-center gap-2 text-xs font-mono text-signal uppercase tracking-[0.25em]">
                    <Terminal size={13} className="text-accent" />
                    {title}
                    {parsed.logLines.length > 0 && (
                        <span className="text-signal ml-1 text-[10px] normal-case tracking-normal">
                            · {successCount}<CheckCircle size={9} className="inline text-accent ml-0.5 mr-1" />
                            {errorCount > 0 && (
                                <>· {errorCount}<Minus size={9} className="inline text-red-500 ml-0.5" /></>
                            )}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setViewMode('parsed')}
                            className={cn(
                                'flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border rounded-sm transition-colors',
                                viewMode === 'parsed'
                                    ? 'border-accent bg-accent/10 text-accent font-bold'
                                    : 'border-signal/20 text-signal hover:border-signal/40'
                            )}
                            title="Show parsed view"
                        >
                            <Eye size={10} /> PARSED
                        </button>
                        <button
                            onClick={() => setViewMode('raw')}
                            className={cn(
                                'flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border rounded-sm transition-colors',
                                viewMode === 'raw'
                                    ? 'border-accent bg-accent/10 text-accent font-bold'
                                    : 'border-signal/20 text-signal hover:border-signal/40'
                            )}
                            title="Show raw output"
                        >
                            <Code size={10} /> RAW
                        </button>
                    </div>
                    {rightSlot}
                </div>
            </div>

            {viewMode === 'raw' ? (
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="p-4 font-mono text-xs text-signal overflow-y-auto cyber-scrollbar whitespace-pre-wrap leading-relaxed"
                    style={{ height: bodyHeight }}
                >
                    {cleanRaw || <span className="text-signal">Waiting for output...</span>}
                    {busy && <span className="text-accent animate-pulse">█</span>}
                </div>
            ) : (
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="overflow-y-auto cyber-scrollbar"
                    style={{ height: bodyHeight }}
                >
                    {parsed.hasBanner && (
                        <details className="group border-b border-signal/15">
                            <summary className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[10px] font-mono text-signal uppercase tracking-[0.25em] hover:text-accent transition-colors">
                                <ChevronRight size={9} className="group-open:rotate-90 transition-transform" />
                                BANNER / ASCII ART
                            </summary>
                            <div className="px-3 pb-2 font-mono text-[10px] text-signal whitespace-pre leading-tight overflow-x-auto">
                                {parsed.banner}
                            </div>
                        </details>
                    )}

                    {parsed.hasParams && (
                        <div className="border-b border-signal/15 p-3">
                            <ParsedParamsPanel groups={paramGroups} />
                        </div>
                    )}

                    {parsed.logLines.length > 0 && (
                        <div className="divide-y divide-signal/10 py-1">
                            {parsed.logLines.map((line, i) => (
                                <LogLineRow key={i} line={line} />
                            ))}
                        </div>
                    )}

                    {parsed.otherLines.length > 0 && (
                        <div className="px-3 py-2 border-t border-signal/15">
                            {parsed.otherLines.map((line, i) => (
                                <div key={i} className="font-mono text-xs text-signal py-0.5 whitespace-pre-wrap">{line}</div>
                            ))}
                        </div>
                    )}

                    {!parsed.hasBanner && !parsed.hasParams && parsed.logLines.length === 0 && parsed.otherLines.length === 0 && (
                        <div className="p-4 text-center text-signal font-mono text-xs">
                            Waiting for output...
                        </div>
                    )}

                    {busy && (
                        <div className="px-3 py-1 text-accent font-mono text-xs animate-pulse">█</div>
                    )}
                </div>
            )}
        </div>
    );
}
