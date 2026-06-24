import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Book, ExternalLink, Search, X, ChevronRight, User, Hash, Layers,
    AlertTriangle, Radio,
} from 'lucide-react';
import type { CommandDefinition, CommandParameter } from '../../types/commands';

/**
 * Parsed `help` overlay for the Mythic console. Replaces the agent-side
 * help dump with a Minerva command index that surfaces the upstream
 * documentation URL per command. Two modes:
 *
 *   • `index`  — searchable list of every loaded command grouped by
 *                payload type, with cmd name, full description, param
 *                count, and a `DOCS` chip per row.
 *   • `detail` — one command's full record: description, usage,
 *                parameter groups, choices/defaults, and a prominent
 *                documentation button.
 *
 * Triggered from `ConsoleTerminal.handleSend` when the operator types
 * `help` or `help <cmd>`; no Mythic task is created. The panel deploys
 * with a horizontal "broadcast" expand — scaleX from a thin scanline to
 * full width — which carries the cyberpunk HUD-deploy feel without
 * polluting the rest of the UI.
 */

export type LoadedCmd = CommandDefinition & {
    commandparameters: CommandParameter[];
    payloadtype?: { name?: string };
    author?: string;
    version?: number | string;
    help_cmd?: string;
};

/** Mythic agent doc URLs follow the docs.mythic-c2.net Hugo convention:
 *  `/agents/<payload>/commands/<cmd>/`. Returns null when we don't know
 *  the payload type (e.g. the synthetic `help` / `clear` entries). */
export function docUrlForCommand(cmd: LoadedCmd): string | null {
    const pt = cmd.payloadtype?.name?.toLowerCase();
    if (!pt) return null;
    if (cmd.cmd === 'help' || cmd.cmd === 'clear') return null;
    return `https://docs.mythic-c2.net/agents/${pt}/commands/${cmd.cmd}`;
}

interface HelpPanelProps {
    open: boolean;
    mode: 'index' | 'detail';
    target?: LoadedCmd;
    commands: LoadedCmd[];
    onClose: () => void;
    onOpenDetail: (cmd: LoadedCmd) => void;
    onOpenIndex: () => void;
}

// ── Broadcast deploy animation ────────────────────────────────────────────
// Multi-stage open: a thin scanline streaks across at half-height, then the
// panel expands vertically from that line, body fades in last. Matches the
// "antenna unfolding" feel the operator asked for without going full HUD.
const STREAK_DURATION = 0.18;
const DEPLOY_DURATION = 0.32;

export function HelpPanel({
    open,
    mode,
    target,
    commands,
    onClose,
    onOpenDetail,
    onOpenIndex,
}: HelpPanelProps) {
    const [query, setQuery] = useState('');

    const visibleCmds = useMemo(() => {
        const real = commands.filter(c => c.cmd !== 'help' && c.cmd !== 'clear');
        if (!query.trim()) return real;
        const q = query.trim().toLowerCase();
        return real.filter(c =>
            c.cmd.toLowerCase().includes(q) ||
            (c.description || '').toLowerCase().includes(q),
        );
    }, [commands, query]);

    // Group by payloadtype.name for multi-agent callbacks.
    const grouped = useMemo(() => {
        const m = new Map<string, LoadedCmd[]>();
        for (const c of visibleCmds) {
            const k = c.payloadtype?.name || 'commands';
            const arr = m.get(k) || [];
            arr.push(c);
            m.set(k, arr);
        }
        m.forEach(arr => arr.sort((a, b) => a.cmd.localeCompare(b.cmd)));
        return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [visibleCmds]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-[2px]"
                        onClick={onClose}
                    />
                    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 py-6 pointer-events-none">
                        {/* Outer broadcast wrapper — scanline streak then full panel */}
                        <div className="relative pointer-events-auto w-full max-w-[1280px]"
                             style={{ width: 'min(94vw, 1280px)', maxHeight: 'calc(100vh - 48px)' }}>
                            {/* Streak scanline that pre-announces the deploy */}
                            <motion.div
                                initial={{ scaleX: 0, opacity: 0.9 }}
                                animate={{ scaleX: 1, opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: STREAK_DURATION, ease: [0.22, 1, 0.36, 1] }}
                                className="absolute left-0 right-0 top-1/2 h-[2px] pointer-events-none origin-center"
                                style={{
                                    background: 'linear-gradient(90deg, transparent 0%, #22d3ee 40%, #22d3ee 60%, transparent 100%)',
                                    boxShadow: '0 0 12px rgba(34,211,238,0.7)',
                                    transform: 'translateY(-50%)',
                                }}
                            />

                            {/* Panel proper — vertical unfold from the scanline */}
                            <motion.div
                                initial={{ scaleY: 0.02, opacity: 0.8 }}
                                animate={{ scaleY: 1, opacity: 1 }}
                                exit={{ scaleY: 0.02, opacity: 0 }}
                                transition={{
                                    duration: DEPLOY_DURATION,
                                    delay: STREAK_DURATION * 0.55,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                className="relative flex flex-col rounded-md border border-cyan-400/40 bg-machine/50 backdrop-blur overflow-hidden"
                                style={{
                                    boxShadow: '0 0 30px rgba(34,211,238,0.12), 0 0 60px rgba(0,0,0,0.6) inset',
                                    maxHeight: 'calc(100vh - 48px)',
                                    transformOrigin: 'center',
                                }}
                            >
                                {/* Corner ticks — HUD broadcast feel */}
                                <CornerTicks />

                                {/* Subtle scanlines + chromatic stripe */}
                                <div
                                    className="absolute inset-0 pointer-events-none opacity-[0.06]"
                                    style={{
                                        backgroundImage:
                                            'repeating-linear-gradient(0deg, rgba(34,211,238,0.6) 0 1px, transparent 1px 3px)',
                                    }}
                                />
                                <div
                                    className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent, #22d3ee 50%, transparent)',
                                        boxShadow: '0 0 8px rgba(34,211,238,0.6)',
                                    }}
                                />

                                {/* Body content fades in last */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{
                                        delay: STREAK_DURATION * 0.55 + DEPLOY_DURATION * 0.6,
                                        duration: 0.22,
                                    }}
                                    className="relative flex flex-col min-h-0 flex-1"
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-6 py-3.5 border-b border-cyan-400/25 bg-black/50 shrink-0 relative">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="flex items-center gap-2 px-2 py-1 rounded-sm border border-cyan-400/40 bg-cyan-500/10 shrink-0">
                                                <span className="relative flex items-center justify-center w-2 h-2">
                                                    <span className="absolute inset-0 rounded-full bg-cyan-400/40 animate-ping" />
                                                    <span className="relative h-1.5 w-1.5 rounded-full bg-cyan-400" />
                                                </span>
                                                <Radio size={11} strokeWidth={2} className="text-cyan-300" />
                                                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cyan-200 font-bold">
                                                    Broadcast
                                                </span>
                                            </span>
                                            <span className="font-mono text-base font-bold tracking-[0.3em] uppercase text-signal">
                                                Help
                                            </span>
                                            {mode === 'detail' && target ? (
                                                <>
                                                    <ChevronRight size={12} className="text-signal shrink-0" />
                                                    <button
                                                        onClick={onOpenIndex}
                                                        className="font-mono text-[10px] tracking-[0.2em] uppercase text-signal hover:text-accent transition-colors shrink-0"
                                                    >
                                                        Index
                                                    </button>
                                                    <ChevronRight size={12} className="text-signal shrink-0" />
                                                    <span className="font-mono text-base tracking-[0.1em] text-signal truncate font-bold">
                                                        {target.cmd}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="font-mono text-xs tabular-nums tracking-[0.15em] text-signal">
                                                    {String(visibleCmds.length).padStart(2, '0')} CMDS LOCKED ON
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={onClose}
                                            className="text-signal hover:text-red-400 transition-colors p-1"
                                            title="Close (Esc)"
                                        >
                                            <X size={16} strokeWidth={2} />
                                        </button>
                                    </div>

                                    {/* Body */}
                                    <div className="flex-1 min-h-0 overflow-y-auto cyber-scrollbar">
                                        {mode === 'detail' && target ? (
                                            <DetailView cmd={target} />
                                        ) : (
                                            <IndexView
                                                groups={grouped}
                                                query={query}
                                                onQueryChange={setQuery}
                                                onOpenDetail={onOpenDetail}
                                            />
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between px-6 py-2.5 border-t border-cyan-400/25 bg-black/50 shrink-0 font-mono text-[10px] tracking-[0.25em] uppercase">
                                        <span className="flex items-center gap-2 text-signal">
                                            <span>Channel:</span>
                                            <code className="px-1.5 py-0.5 rounded-sm border border-cyan-400/40 text-cyan-300">
                                                help &lt;cmd&gt;
                                            </code>
                                            <span>for detail</span>
                                        </span>
                                        <span className="text-signal">Esc · Close</span>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}

function CornerTicks() {
    const common = 'absolute w-3 h-3 pointer-events-none';
    const stroke = '#22d3ee';
    return (
        <>
            <span className={`${common} top-0 left-0`}>
                <span className="absolute top-0 left-0 w-3 h-[1px]" style={{ background: stroke }} />
                <span className="absolute top-0 left-0 h-3 w-[1px]" style={{ background: stroke }} />
            </span>
            <span className={`${common} top-0 right-0`}>
                <span className="absolute top-0 right-0 w-3 h-[1px]" style={{ background: stroke }} />
                <span className="absolute top-0 right-0 h-3 w-[1px]" style={{ background: stroke }} />
            </span>
            <span className={`${common} bottom-0 left-0`}>
                <span className="absolute bottom-0 left-0 w-3 h-[1px]" style={{ background: stroke }} />
                <span className="absolute bottom-0 left-0 h-3 w-[1px]" style={{ background: stroke }} />
            </span>
            <span className={`${common} bottom-0 right-0`}>
                <span className="absolute bottom-0 right-0 w-3 h-[1px]" style={{ background: stroke }} />
                <span className="absolute bottom-0 right-0 h-3 w-[1px]" style={{ background: stroke }} />
            </span>
        </>
    );
}

// ── Index view ────────────────────────────────────────────────────────────

function IndexView({
    groups,
    query,
    onQueryChange,
    onOpenDetail,
}: {
    groups: [string, LoadedCmd[]][];
    query: string;
    onQueryChange: (q: string) => void;
    onOpenDetail: (cmd: LoadedCmd) => void;
}) {
    return (
        <div className="p-6 space-y-6">
            {/* Search */}
            <div className="relative">
                <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300" />
                <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={e => onQueryChange(e.target.value)}
                    placeholder="Filter by name or description…"
                    className="w-full bg-black/60 border border-cyan-400/30 rounded-md text-signal font-mono text-sm pl-10 pr-3 py-2.5 focus:border-cyan-400/70 focus:outline-none transition-colors placeholder:text-signal placeholder:opacity-50"
                />
            </div>

            {groups.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs tracking-[0.3em] uppercase text-signal">
                    No Commands Match
                </div>
            ) : (
                groups.map(([groupName, cmds]) => (
                    <div key={groupName} className="space-y-2">
                        <div className="flex items-center justify-between pb-1.5 border-b border-cyan-400/20">
                            <span className="font-mono text-[10px] tracking-[0.35em] uppercase text-cyan-300 font-bold">
                                ◢ {groupName}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums tracking-[0.2em] text-signal">
                                {String(cmds.length).padStart(2, '0')} channels
                            </span>
                        </div>
                        {/* Two-column grid so the cmd name never truncates and
                            description has room to breathe. */}
                        <div className="rounded-md border border-cyan-400/20 bg-black/40 overflow-hidden divide-y divide-cyan-400/10">
                            {cmds.map(cmd => (
                                <CommandRow key={`${groupName}-${cmd.cmd}`} cmd={cmd} onOpen={() => onOpenDetail(cmd)} />
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

function CommandRow({ cmd, onOpen }: { cmd: LoadedCmd; onOpen: () => void }) {
    const paramCount = (cmd.commandparameters || []).length;
    const docUrl = docUrlForCommand(cmd);
    return (
        <div className="grid grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3 hover:bg-cyan-500/[0.05] transition-colors group">
            <button
                onClick={onOpen}
                className="text-left font-mono text-sm font-bold tracking-[0.05em] text-cyan-200 group-hover:text-cyan-100 truncate"
                title={cmd.cmd}
            >
                {cmd.cmd}
            </button>
            <button
                onClick={onOpen}
                className="text-left font-mono text-xs text-signal leading-snug line-clamp-2"
                title={cmd.description || ''}
            >
                {cmd.description?.trim() || <span className="opacity-60 italic">No description provided.</span>}
            </button>
            <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-[0.15em] uppercase text-signal shrink-0">
                <Hash size={10} strokeWidth={2} className="text-cyan-300" />
                {String(paramCount).padStart(2, '0')}
            </span>
            {docUrl ? (
                <a
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${cmd.cmd} docs`}
                    className="flex items-center gap-1 font-mono text-[10px] tracking-[0.25em] uppercase text-cyan-300 hover:text-cyan-100 transition-colors shrink-0 border border-cyan-400/40 hover:border-cyan-300 rounded-sm px-2 py-0.5"
                    onClick={e => e.stopPropagation()}
                >
                    Docs <ExternalLink size={10} strokeWidth={2} />
                </a>
            ) : (
                <span className="w-[60px]" />
            )}
        </div>
    );
}

// ── Detail view ───────────────────────────────────────────────────────────

function DetailView({ cmd }: { cmd: LoadedCmd }) {
    const docUrl = docUrlForCommand(cmd);
    // Group parameters by parameter_group_name so the operator sees the
    // available calling shapes at a glance (e.g. Default vs ExistingFile
    // for `upload`).
    const groupedParams = useMemo(() => {
        const params = cmd.commandparameters || [];
        const m = new Map<string, CommandParameter[]>();
        for (const p of params) {
            const k = p.parameter_group_name || 'Default';
            const arr = m.get(k) || [];
            arr.push(p);
            m.set(k, arr);
        }
        m.forEach(arr => arr.sort((a, b) => a.ui_position - b.ui_position));
        return Array.from(m.entries());
    }, [cmd.commandparameters]);
    const params = cmd.commandparameters || [];

    return (
        <div className="p-6 space-y-6">
            {/* Title row */}
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-baseline gap-3 min-w-0">
                        <span className="font-mono text-3xl font-bold tracking-[0.05em] text-cyan-200">
                            {cmd.cmd}
                        </span>
                        {cmd.payloadtype?.name && (
                            <span className="rounded-sm border border-cyan-400/40 px-2 py-0.5 font-mono text-[10px] tracking-[0.25em] uppercase text-cyan-300 shrink-0">
                                {cmd.payloadtype.name}
                            </span>
                        )}
                        {cmd.version != null && (
                            <span className="font-mono text-[10px] tracking-[0.15em] tabular-nums text-signal shrink-0">
                                v{cmd.version}
                            </span>
                        )}
                    </div>
                    {docUrl && (
                        <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-md border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-200 hover:bg-cyan-500/20 hover:border-cyan-300 transition-colors shadow-[0_0_14px_rgba(34,211,238,0.18)]"
                        >
                            <Book size={12} strokeWidth={2} />
                            Documentation
                            <ExternalLink size={11} strokeWidth={2} />
                        </a>
                    )}
                </div>
                {cmd.description?.trim() ? (
                    <div className="font-mono text-sm text-signal leading-relaxed whitespace-pre-wrap">
                        {cmd.description}
                    </div>
                ) : (
                    <div className="font-mono text-xs text-signal opacity-70 italic">
                        No description provided by the agent.
                    </div>
                )}
                {cmd.help_cmd && cmd.help_cmd !== cmd.cmd && (
                    <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300">Usage</span>
                        <code className="font-mono text-xs text-signal bg-black/60 border border-cyan-400/30 rounded-sm px-2 py-1">
                            {cmd.help_cmd}
                        </code>
                    </div>
                )}
                {cmd.author && (
                    <div className="flex items-center gap-2 font-mono text-[11px] text-signal">
                        <User size={11} strokeWidth={2} className="text-cyan-300" />
                        <span>{cmd.author}</span>
                    </div>
                )}
            </div>

            {/* Parameters */}
            {params.length === 0 ? (
                <div className="rounded-md border border-cyan-400/20 bg-black/40 px-4 py-3 font-mono text-xs text-signal">
                    No parameters.
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-cyan-400/20">
                        <Layers size={12} strokeWidth={2} className="text-cyan-300" />
                        <span className="font-mono text-[10px] tracking-[0.35em] uppercase text-cyan-300 font-bold">Parameters</span>
                        <span className="font-mono text-[10px] tabular-nums tracking-[0.15em] text-signal">
                            {String(params.length).padStart(2, '0')}
                        </span>
                    </div>
                    {groupedParams.map(([groupName, groupParams]) => (
                        <div key={groupName} className="rounded-md border border-cyan-400/20 bg-black/40 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-400/10">
                                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cyan-300 font-bold">
                                    Group · {groupName}
                                </span>
                                <span className="font-mono text-[10px] tabular-nums tracking-[0.15em] text-signal">
                                    {String(groupParams.length).padStart(2, '0')} FIELDS
                                </span>
                            </div>
                            <div className="divide-y divide-cyan-400/10">
                                {groupParams.map(p => (
                                    <ParamRow key={`${groupName}-${p.cli_name || p.name}`} p={p} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ParamRow({ p }: { p: CommandParameter }) {
    return (
        <div className="px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-sm font-bold tracking-[0.05em] text-cyan-200">
                    {p.cli_name || p.name}
                </code>
                <span className="rounded-sm border border-cyan-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.25em] uppercase text-cyan-300">
                    {p.parameter_type}
                </span>
                {p.required && (
                    <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.25em] uppercase text-amber-400">
                        <AlertTriangle size={9} strokeWidth={2} />
                        Required
                    </span>
                )}
                {p.cli_name && p.name && p.cli_name !== p.name && (
                    <span className="font-mono text-[10px] tracking-[0.1em] text-signal">
                        alias · {p.name}
                    </span>
                )}
            </div>
            {p.description?.trim() ? (
                <div className="font-mono text-xs text-signal leading-relaxed whitespace-pre-wrap">
                    {p.description}
                </div>
            ) : (
                <div className="font-mono text-[11px] text-signal opacity-70 italic">
                    No description provided.
                </div>
            )}
            {p.choices && Array.isArray(p.choices) && p.choices.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-300">choices</span>
                    {(p.choices as string[]).slice(0, 12).map((c: string) => (
                        <span key={c} className="rounded-sm border border-cyan-400/20 bg-cyan-500/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-signal">
                            {c}
                        </span>
                    ))}
                    {(p.choices as string[]).length > 12 && (
                        <span className="font-mono text-[10px] text-signal">
                            +{(p.choices as string[]).length - 12} more
                        </span>
                    )}
                </div>
            )}
            {p.default_value && String(p.default_value).length > 0 && (
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-300">default</span>
                    <code className="font-mono text-[11px] text-signal">{String(p.default_value)}</code>
                </div>
            )}
        </div>
    );
}
