import React, { useState, useMemo } from 'react';
import { useMutation, useSubscription } from "@apollo/client/react";

import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import {
    SUB_PAYLOAD_TYPES, SUB_CONSUMING_CONTAINERS, SUB_TRANSLATION_CONTAINERS, SUB_CUSTOM_BROWSERS,
    TOGGLE_CONSUMING_DELETE, TOGGLE_PAYLOADTYPE_DELETE, TOGGLE_TRANSLATION_DELETE, TOGGLE_BROWSER_DELETE,
    TEST_WEBHOOK, TEST_LOG,
} from '../../lib/api';
import {
    Package,
    ChevronDown,
    ChevronRight,
    ArrowLeftRight,
    Layers,
    RefreshCw,
    Server,
    Radio,
    Webhook,
    FileText,
    Shield,
    Eye,
    ExternalLink,
    Puzzle,
    MonitorCog,
    Trash2,
    RotateCcw,
    Play,
    KeyRound,
    BookOpen,
    Wrench,
    Send,
    Folder,
    Boxes,
    Search,
    X,
    ArrowUpDown,
    Power,
    Zap,
}from 'lucide-react';
import { BuildParamsDialog } from './BuildParamsDialog';
import { CommandsDialog } from './CommandsDialog';
import { ContainerFilesDialog } from './ContainerFilesDialog';

// ── Helpers ────────────────────────────────────────────────────────────────────

const StatusDot = ({ running }: { running: boolean }) => (
    <span className={cn(
        'inline-block w-2 h-2 rounded-full shrink-0',
        running ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-500 shadow-[0_0_4px_#f87171]'
    )} title={running ? 'ONLINE' : 'OFFLINE'} />
);

const OsChip = ({ os }: { os: string }) => (
    <span className="px-1.5 py-0.5 text-[9px] font-mono border border-white/15 text-gray-400 rounded-sm uppercase tracking-widest">
        {os}
    </span>
);

const AgentTypeChip = ({ type }: { type: string }) => {
    const colors: Record<string, string> = {
        agent: 'border-signal/50 text-signal bg-signal/5',
        service: 'border-blue-400/50 text-blue-300 bg-blue-400/5',
        wrapper: 'border-purple-400/50 text-purple-300 bg-purple-400/5',
        command_augment: 'border-amber-400/50 text-amber-300 bg-amber-400/5',
    };
    const labels: Record<string, string> = {
        command_augment: 'cmd-aug',
    };
    return (
        <span className={cn('px-1.5 py-0.5 text-[9px] font-mono border rounded-sm uppercase tracking-wider', colors[type] ?? 'border-white/20 text-gray-400')}>
            {labels[type] ?? type}
        </span>
    );
};

// Agent SVG icon served by Mythic at /static/<name>_dark.svg; falls back to a Package glyph.
const AgentIcon = ({ name, size = 28 }: { name: string; size?: number }) => {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <div
                style={{ width: size, height: size }}
                className="flex items-center justify-center border border-white/10 bg-white/5 shrink-0 rounded-sm"
                title={name}
            >
                <Package size={Math.round(size * 0.55)} className="text-gray-400" />
            </div>
        );
    }
    return (
        <img
            src={`/static/${name}_dark.svg`}
            alt={name}
            title={name}
            onError={() => setFailed(true)}
            style={{ width: size, height: size }}
            className="object-contain shrink-0"
        />
    );
};

// ── Reusable action button (icon-only) ─────────────────────────────────────────

const ActionButton = ({
    onClick, href, title, disabled, color = 'text-gray-400 hover:text-signal hover:bg-signal/10', children,
}: {
    onClick?: () => void;
    href?: string;
    title: string;
    disabled?: boolean;
    color?: string;
    children: React.ReactNode;
}) => {
    const className = cn(
        'inline-flex items-center justify-center w-7 h-7 transition-colors shrink-0',
        disabled ? 'text-gray-700 cursor-not-allowed' : color
    );
    if (href) {
        return (
            <a href={disabled ? undefined : href} target="_blank" rel="noopener noreferrer" title={title} className={className}>
                {children}
            </a>
        );
    }
    return (
        <button onClick={disabled ? undefined : onClick} disabled={disabled} title={title} className={className}>
            {children}
        </button>
    );
};

// ── In-row confirm overlay ─────────────────────────────────────────────────────

const ConfirmOverlay = ({ open, label, danger, onYes, onCancel }: {
    open: boolean; label: string; danger: boolean; onYes: () => void; onCancel: () => void;
}) => {
    if (!open) return null;
    return (
        <div className="absolute inset-0 z-10 bg-black/85 backdrop-blur-sm flex items-center justify-center gap-2 px-4">
            <span className="text-xs font-mono text-gray-300">{label}</span>
            <button onClick={onYes}
                className={cn(
                    "px-3 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors",
                    danger ? "border-red-400/40 text-red-400 hover:bg-red-400/10" : "border-green-400/40 text-green-400 hover:bg-green-400/10"
                )}>
                Yes
            </button>
            <button onClick={onCancel}
                className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-gray-300 hover:bg-white/5 transition-colors">
                No
            </button>
        </div>
    );
};

// ── PayloadType Card ───────────────────────────────────────────────────────────

const PayloadTypeCard = ({ pt }: { pt: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [showBuildParams, setShowBuildParams] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [toggleDelete] = useMutation<any>(TOGGLE_PAYLOADTYPE_DELETE);

    const osArr: string[] = pt.supported_os
        ? pt.supported_os.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
    const commands: any[] = pt.commands ?? [];
    const isWrapper = !!pt.wrapper || pt.agent_type === 'wrapper';
    const docsHref = isWrapper ? `/docs/wrappers/${pt.name}` : `/docs/agents/${pt.name}`;
    const wrappedTypes: string[] = (pt.wrap_these_payload_types ?? [])
        .map((w: any) => w?.wrapped?.name)
        .filter(Boolean);

    const handleDelete = async () => {
        try {
            await toggleDelete({ variables: { payloadtype_id: pt.id, deleted: !pt.deleted } });
            snackActions.success(pt.deleted ? 'Restored' : 'Marked as deleted');
        } catch (e: any) {
            snackActions.error(e.message || 'Failed to update');
        }
        setConfirmingDelete(false);
    };

    return (
        <>
        <div className={cn(
            'relative border transition-all',
            pt.deleted
                ? 'border-red-500/30 bg-red-500/[0.03] opacity-60'
                : pt.container_running
                    ? 'border-signal/25 bg-signal/[0.03] hover:border-signal/50'
                    : 'border-red-500/20 bg-red-500/[0.03] hover:border-red-400/40'
        )}>
            {/* Header row */}
            <div className="flex items-center gap-2 px-4 py-3">
                <StatusDot running={pt.container_running} />
                <AgentIcon name={pt.name} size={28} />
                <div className="flex flex-col min-w-0 flex-1">
                    <span className={cn(
                        "font-mono text-sm text-white font-bold tracking-wide truncate",
                        pt.deleted && "line-through text-gray-500"
                    )}>{pt.name}</span>
                    {pt.author && (
                        <span className="text-[10px] text-gray-500 font-mono truncate">
                            by {pt.author}{pt.semver ? <span className="text-gray-600"> · v{pt.semver}</span> : null}
                        </span>
                    )}
                </div>
                <AgentTypeChip type={isWrapper ? 'wrapper' : (pt.agent_type ?? 'agent')} />
                <div className="hidden md:flex gap-1 flex-wrap">
                    {osArr.map(os => <OsChip key={os} os={os} />)}
                </div>
                <span className="text-[10px] text-gray-500 font-mono shrink-0 hidden sm:inline">
                    {commands.length} cmd{commands.length !== 1 ? 's' : ''}
                </span>
                {pt.supports_dynamic_loading && (
                    <span className="text-[9px] text-cyan-300 font-mono border border-cyan-400/30 px-1.5 py-0.5 rounded-sm shrink-0" title="Supports dynamic command loading">
                        <Zap size={8} className="inline mr-1" />DYN
                    </span>
                )}
                {pt.translation_container && (
                    <span className="text-[9px] text-purple-400 font-mono border border-purple-400/30 px-1.5 py-0.5 rounded-sm shrink-0" title={`Translation container: ${pt.translation_container.name}`}>
                        <ArrowLeftRight size={8} className="inline mr-1" />TRANS
                    </span>
                )}
                <div className="flex items-center gap-0.5 border-l border-white/10 pl-1.5 ml-1">
                    <ActionButton href={docsHref} title="Documentation">
                        <BookOpen size={12} />
                    </ActionButton>
                    <ActionButton onClick={() => setShowBuildParams(true)} title="Build Parameters">
                        <Wrench size={12} />
                    </ActionButton>
                    <ActionButton onClick={() => setShowCommands(true)} title="Commands">
                        <Send size={12} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => setShowFiles(true)}
                        disabled={!pt.container_running}
                        title={pt.container_running ? 'View Files' : 'Container offline'}
                    >
                        <Folder size={12} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => setConfirmingDelete(true)}
                        title={pt.deleted ? 'Restore' : 'Delete'}
                        color={pt.deleted ? 'text-gray-400 hover:text-green-400 hover:bg-green-400/10' : 'text-gray-400 hover:text-red-400 hover:bg-red-400/10'}
                    >
                        {pt.deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                    </ActionButton>
                </div>
                <button onClick={() => setExpanded(v => !v)}
                    className="text-gray-500 hover:text-signal transition-colors ml-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-white/5 px-4 py-3 space-y-3">
                    {pt.author && (
                        <p className="text-xs text-gray-400 font-mono">
                            <span className="text-gray-500 mr-2">AUTHOR</span>{pt.author}
                        </p>
                    )}
                    {pt.semver && (
                        <p className="text-xs text-gray-500 font-mono">
                            <span className="mr-2">VERSION</span><span className="text-gray-300">v{pt.semver}</span>
                        </p>
                    )}
                    {wrappedTypes.length > 0 && (
                        <p className="text-xs text-gray-400 font-mono">
                            <span className="text-gray-500 mr-2">WRAPS</span>
                            <span className="text-purple-300">{wrappedTypes.join(', ')}</span>
                        </p>
                    )}
                    {pt.note && (
                        <p className="text-xs text-gray-400 whitespace-pre-wrap">{pt.note}</p>
                    )}
                    {pt.translation_container && (
                        <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                            <ArrowLeftRight size={10} className="text-purple-400" />
                            <span className="text-gray-500 mr-1">TRANSLATION</span>
                            <span className="text-purple-300">{pt.translation_container.name}</span>
                            <StatusDot running={pt.translation_container.container_running} />
                        </p>
                    )}
                    {commands.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1.5 uppercase tracking-widest">Commands ({commands.length})</p>
                            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
                                {commands.map((c: any) => (
                                    <span key={c.id}
                                        title={c.description}
                                        className={cn(
                                            'px-1.5 py-0.5 text-[9px] font-mono border rounded-sm cursor-default',
                                            c.deleted && 'line-through opacity-40',
                                            c.needs_admin
                                                ? 'border-red-400/40 text-red-300 bg-red-400/5'
                                                : 'border-white/10 text-gray-400 hover:border-signal/30 hover:text-signal transition-colors'
                                        )}>
                                        {c.cmd}{c.needs_admin ? '*' : ''}
                                    </span>
                                ))}
                            </div>
                            {commands.some((c: any) => c.needs_admin) && (
                                <p className="text-[9px] text-red-400/70 font-mono mt-1">* requires admin</p>
                            )}
                        </div>
                    )}
                </div>
            )}
            <ConfirmOverlay
                open={confirmingDelete}
                label={`${pt.deleted ? 'Restore' : 'Delete'} ${pt.name}?`}
                danger={!pt.deleted}
                onYes={handleDelete}
                onCancel={() => setConfirmingDelete(false)}
            />
        </div>
        {showBuildParams && <BuildParamsDialog payloadName={pt.name} onClose={() => setShowBuildParams(false)} />}
        {showCommands && <CommandsDialog payloadName={pt.name} isWrapper={isWrapper} onClose={() => setShowCommands(false)} />}
        {showFiles && <ContainerFilesDialog containerName={pt.name} onClose={() => setShowFiles(false)} />}
        </>
    );
};

// ── Translation Container Row ──────────────────────────────────────────────────

const TranslationRow = ({ tc }: { tc: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [toggleDelete] = useMutation<any>(TOGGLE_TRANSLATION_DELETE);

    const supported: any[] = (tc.payloadtypes ?? tc.supported_payloadtypes ?? []).filter((p: any) => !p.deleted);
    const docsHref = `/docs/c2-profiles/${(tc.name || '').toLowerCase()}`;

    const handleDelete = async () => {
        try {
            await toggleDelete({ variables: { translationcontainer_id: tc.id, deleted: !tc.deleted } });
            snackActions.success(tc.deleted ? 'Restored' : 'Marked as deleted');
        } catch (e: any) {
            snackActions.error(e.message || 'Failed to update');
        }
        setConfirmingDelete(false);
    };

    return (
        <>
        <div className={cn(
            "relative border transition-all",
            tc.deleted ? "border-red-500/30 bg-red-500/[0.03] opacity-60" : "border-purple-400/20 bg-purple-400/[0.03] hover:border-purple-400/40"
        )}>
            <div className="flex items-center gap-2 px-4 py-3">
                <StatusDot running={tc.container_running} />
                <ArrowLeftRight size={12} className="text-purple-400 shrink-0" />
                <span className={cn(
                    "font-mono text-sm font-bold flex-1 truncate",
                    tc.deleted ? "line-through text-gray-500" : "text-purple-200"
                )}>{tc.name}</span>
                {supported.length > 0 && (
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">
                        {supported.length} payload{supported.length !== 1 ? 's' : ''}
                    </span>
                )}
                <div className="flex items-center gap-0.5 border-l border-white/10 pl-1.5 ml-1">
                    <ActionButton href={docsHref} title="Documentation">
                        <BookOpen size={12} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => setShowFiles(true)}
                        disabled={!tc.container_running}
                        title={tc.container_running ? 'View Files' : 'Container offline'}
                    >
                        <Folder size={12} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => setConfirmingDelete(true)}
                        title={tc.deleted ? 'Restore' : 'Delete'}
                        color={tc.deleted ? 'text-gray-400 hover:text-green-400 hover:bg-green-400/10' : 'text-gray-400 hover:text-red-400 hover:bg-red-400/10'}
                    >
                        {tc.deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                    </ActionButton>
                </div>
                <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-purple-400 transition-colors ml-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>
            {expanded && (
                <div className="border-t border-white/5 px-4 py-3 space-y-2">
                    {tc.author && (
                        <p className="text-xs text-gray-400 font-mono">
                            <span className="text-gray-500 mr-2">AUTHOR</span>{tc.author}
                        </p>
                    )}
                    {tc.semver && (
                        <p className="text-xs text-gray-500 font-mono">
                            <span className="mr-2">VERSION</span><span className="text-gray-300">v{tc.semver}</span>
                        </p>
                    )}
                    {tc.description && (
                        <p className="text-xs text-gray-400 whitespace-pre-wrap">{tc.description}</p>
                    )}
                    {supported.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">Supported Types</p>
                            <div className="flex flex-wrap gap-1">
                                {supported.map((p: any) => (
                                    <span key={p.id} className="px-1.5 py-0.5 text-[10px] font-mono border border-purple-400/25 text-purple-300 rounded-sm">{p.name}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <ConfirmOverlay
                open={confirmingDelete}
                label={`${tc.deleted ? 'Restore' : 'Delete'} ${tc.name}?`}
                danger={!tc.deleted}
                onYes={handleDelete}
                onCancel={() => setConfirmingDelete(false)}
            />
        </div>
        {showFiles && <ContainerFilesDialog containerName={tc.name} onClose={() => setShowFiles(false)} />}
        </>
    );
};

// ── Custom Browser Row ─────────────────────────────────────────────────────────

const CustomBrowserRow = ({ cb }: { cb: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [toggleDelete] = useMutation<any>(TOGGLE_BROWSER_DELETE);

    const columns: any[] = Array.isArray(cb.columns) ? cb.columns : [];
    const rowActions: any[] = Array.isArray(cb.row_actions) ? cb.row_actions : [];
    const extraInputs: any[] = Array.isArray(cb.extra_table_inputs) ? cb.extra_table_inputs : [];
    const exports = !!cb.export_function && cb.export_function !== '';

    const handleDelete = async () => {
        try {
            await toggleDelete({ variables: { custombrowser_id: cb.id, deleted: !cb.deleted } });
            snackActions.success(cb.deleted ? 'Restored' : 'Marked as deleted');
        } catch (e: any) {
            snackActions.error(e.message || 'Failed to update');
        }
        setConfirmingDelete(false);
    };

    return (
        <>
        <div className={cn(
            "relative border transition-all",
            cb.deleted ? "border-red-500/30 bg-red-500/[0.03] opacity-60" : "border-amber-400/20 bg-amber-400/[0.03] hover:border-amber-400/40"
        )}>
            <div className="flex items-center gap-2 px-4 py-3">
                <StatusDot running={cb.container_running} />
                <Boxes size={12} className="text-amber-400 shrink-0" />
                <span className={cn(
                    "font-mono text-sm font-bold flex-1 truncate",
                    cb.deleted ? "line-through text-gray-500" : "text-amber-200"
                )}>{cb.name}</span>
                {cb.type && <span className="text-[9px] text-gray-500 font-mono border border-white/10 px-1.5 py-0.5 rounded-sm uppercase">{cb.type}</span>}
                {exports && <span className="text-[9px] text-green-400 font-mono border border-green-400/30 px-1.5 py-0.5 rounded-sm">EXPORT</span>}
                <div className="flex items-center gap-0.5 border-l border-white/10 pl-1.5 ml-1">
                    <ActionButton
                        onClick={() => setShowFiles(true)}
                        disabled={!cb.container_running}
                        title={cb.container_running ? 'View Files' : 'Container offline'}
                    >
                        <Folder size={12} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => setConfirmingDelete(true)}
                        title={cb.deleted ? 'Restore' : 'Delete'}
                        color={cb.deleted ? 'text-gray-400 hover:text-green-400 hover:bg-green-400/10' : 'text-gray-400 hover:text-red-400 hover:bg-red-400/10'}
                    >
                        {cb.deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                    </ActionButton>
                </div>
                <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-amber-400 transition-colors ml-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>
            {expanded && (
                <div className="border-t border-white/5 px-4 py-3 space-y-3">
                    {cb.author && (
                        <p className="text-xs text-gray-400 font-mono">
                            <span className="text-gray-500 mr-2">AUTHOR</span>{cb.author}
                        </p>
                    )}
                    {cb.semver && (
                        <p className="text-xs text-gray-500 font-mono">
                            <span className="mr-2">VERSION</span><span className="text-gray-300">v{cb.semver}</span>
                        </p>
                    )}
                    {cb.description && <p className="text-xs text-gray-400 whitespace-pre-wrap">{cb.description}</p>}
                    {rowActions.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">Row Actions</p>
                            <div className="border border-white/10">
                                <div className="grid grid-cols-2 gap-2 px-2 py-1 bg-black/30 border-b border-white/10 text-[10px] font-mono text-gray-500 uppercase">
                                    <div>Action</div><div>UI Feature</div>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {rowActions.map((r: any, i: number) => (
                                        <div key={`${r.name}-${i}`} className="grid grid-cols-2 gap-2 px-2 py-1.5 text-xs">
                                            <span className="font-mono text-gray-300">{r.name}</span>
                                            <span className="font-mono text-cyan-300">{r.ui_feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {columns.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">Columns</p>
                            <div className="border border-white/10">
                                <div className="grid grid-cols-2 gap-2 px-2 py-1 bg-black/30 border-b border-white/10 text-[10px] font-mono text-gray-500 uppercase">
                                    <div>Display</div><div>Metadata Key</div>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {columns.map((c: any, i: number) => (
                                        <div key={`${c.name}-${i}`} className="grid grid-cols-2 gap-2 px-2 py-1.5 text-xs">
                                            <span className="font-mono text-gray-300">{c.name}</span>
                                            <span className="font-mono text-cyan-300">{c.key}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {extraInputs.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">Extra Task Parameters</p>
                            <div className="border border-white/10 divide-y divide-white/5">
                                {extraInputs.map((x: any, i: number) => (
                                    <div key={`${x.name}-${i}`} className="px-2 py-1.5 text-xs">
                                        <span className="font-mono text-cyan-300">{x.name}</span>
                                        <span className="text-gray-500 mx-2">·</span>
                                        <span className="font-mono text-gray-300">{x.display_name}</span>
                                        {x.description && <p className="text-[11px] text-gray-500 mt-0.5">{x.description}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <ConfirmOverlay
                open={confirmingDelete}
                label={`${cb.deleted ? 'Restore' : 'Delete'} ${cb.name}?`}
                danger={!cb.deleted}
                onYes={handleDelete}
                onCancel={() => setConfirmingDelete(false)}
            />
        </div>
        {showFiles && <ContainerFilesDialog containerName={cb.name} onClose={() => setShowFiles(false)} />}
        </>
    );
};

// ── Consuming Container Row ────────────────────────────────────────────────────

const WEBHOOK_EVENTS = ['new_alert', 'new_callback', 'new_custom', 'new_feedback', 'new_startup'] as const;
const LOG_EVENTS = ['new_artifact', 'new_callback', 'new_credential', 'new_file', 'new_keylog', 'new_payload', 'new_response', 'new_task'] as const;

const ConsumingRow = ({ cc }: { cc: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [idpMeta, setIdpMeta] = useState<{ name: string; data: string } | null>(null);
    const [showFiles, setShowFiles] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [toggleDelete] = useMutation<any>(TOGGLE_CONSUMING_DELETE);
    const [testWebhook] = useMutation<any>(TEST_WEBHOOK);
    const [testLog] = useMutation<any>(TEST_LOG);

    const isEventing = cc.type === 'eventing';
    const isAuth = cc.type === 'auth';
    const isWebhook = cc.type === 'webhook';
    const isLogger = cc.type === 'logging';

    // Subscriptions arrive as a JSON-array column. Each entry may be a JSON-encoded
    // string (eventing/auth) or a plain string (webhook/logger event names).
    // Parse each entry once so downstream rendering is uniform.
    const subs: any[] = useMemo(() => {
        const raw = Array.isArray(cc.subscriptions) ? cc.subscriptions : (cc.subscriptions ? [cc.subscriptions] : []);
        if (!isEventing && !isAuth) return raw;
        return raw.map((s: any) => {
            if (typeof s === 'object') return s;
            try { return JSON.parse(s); }
            catch { return isAuth ? { name: s, type: '' } : { name: '', description: s }; }
        });
    }, [cc.subscriptions, isEventing, isAuth]);

    const handleDelete = async () => {
        try {
            await toggleDelete({ variables: { id: cc.id, deleted: !cc.deleted } });
            snackActions.success(cc.deleted ? 'Restored' : 'Deleted');
        } catch (e: any) { snackActions.error(e.message); }
        setConfirmingDelete(false);
    };

    const handleTest = async (eventType: string) => {
        try {
            const mutation = isWebhook ? testWebhook : testLog;
            const { data } = await mutation({ variables: { service_type: eventType } });
            const result = isWebhook ? (data as any)?.consumingServicesTestWebhook : (data as any)?.consumingServicesTestLog;
            if (result?.status === 'success') snackActions.success(`Test ${eventType} sent`);
            else snackActions.error(result?.error || 'Test failed');
        } catch (e: any) { snackActions.error(e.message); }
    };

    const fetchIdpMetadata = async (idpName: string) => {
        try {
            const resp = await fetch(`/auth_metadata/${encodeURIComponent(cc.name)}/${encodeURIComponent(idpName)}`);
            const json = await resp.json();
            if (json.status === 'success') setIdpMeta({ name: idpName, data: json.metadata });
            else snackActions.error(json.error || 'Failed to fetch metadata');
        } catch (e: any) { snackActions.error(e.message); }
    };

    const parseSubscription = (sub: any, idx: number) => {
        if (isEventing && typeof sub === 'object' && sub !== null) {
            return (
                <div key={idx} className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
                    <span className="text-[10px] font-mono text-blue-300 font-bold min-w-[120px]">{sub.name}</span>
                    {sub.description && <span className="text-[10px] text-gray-400">{sub.description}</span>}
                </div>
            );
        }
        if (isAuth && typeof sub === 'object' && sub !== null) {
            return (
                <div key={idx} className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono border border-blue-400/25 text-blue-300 rounded-sm">{sub.name}</span>
                    {sub.type && <span className="text-[9px] text-gray-500 font-mono">[{sub.type}]</span>}
                    <button onClick={() => fetchIdpMetadata(sub.name)} title="Fetch IDP Metadata"
                        disabled={!cc.container_running}
                        className={cn(
                            "transition-colors",
                            cc.container_running ? "text-gray-500 hover:text-amber-400" : "text-gray-700 cursor-not-allowed"
                        )}>
                        <KeyRound size={10} />
                    </button>
                </div>
            );
        }
        const label = typeof sub === 'string' ? sub : JSON.stringify(sub);
        return <span key={idx} className="px-1.5 py-0.5 text-[10px] font-mono border border-blue-400/25 text-blue-300 rounded-sm">{label}</span>;
    };

    return (
        <>
        <div className={cn(
            "relative border transition-all",
            cc.deleted ? "border-red-500/20 bg-red-500/[0.03] opacity-60" : "border-blue-400/20 bg-blue-400/[0.03] hover:border-blue-400/40"
        )}>
            <div className="flex items-center gap-2 px-4 py-3">
                <StatusDot running={cc.container_running} />
                <Server size={12} className="text-blue-400 shrink-0" />
                <span className={cn("font-mono text-sm font-bold flex-1 truncate", cc.deleted ? "text-red-300 line-through" : "text-blue-200")}>{cc.name}</span>
                {cc.type && <span className="text-[9px] text-gray-500 font-mono border border-white/10 px-1.5 py-0.5 rounded-sm uppercase">{cc.type}</span>}
                {subs.length > 0 && (
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">{subs.length} sub{subs.length !== 1 ? 's' : ''}</span>
                )}
                <div className="flex items-center gap-0.5 border-l border-white/10 pl-1.5 ml-1">
                    <ActionButton
                        onClick={() => setShowFiles(true)}
                        disabled={!cc.container_running}
                        title={cc.container_running ? 'View Files' : 'Container offline'}
                        color="text-gray-400 hover:text-blue-400 hover:bg-blue-400/10"
                    >
                        <Folder size={12} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => setConfirmingDelete(true)}
                        title={cc.deleted ? 'Restore' : 'Delete'}
                        color={cc.deleted ? 'text-gray-400 hover:text-green-400 hover:bg-green-400/10' : 'text-gray-400 hover:text-red-400 hover:bg-red-400/10'}
                    >
                        {cc.deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                    </ActionButton>
                </div>
                <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-blue-400 transition-colors ml-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>
            {expanded && (
                <div className="border-t border-white/5 px-4 py-3 space-y-2">
                    {cc.description && <p className="text-xs text-gray-400">{cc.description}</p>}
                    {cc.semver && <p className="text-[10px] text-gray-500 font-mono">v{cc.semver}</p>}

                    {/* Test buttons for webhook/logger */}
                    {(isWebhook || isLogger) && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">Test Events</p>
                            <div className="flex flex-wrap gap-1">
                                {(isWebhook ? WEBHOOK_EVENTS : LOG_EVENTS).map(evt => {
                                    const subscribed = Array.isArray(cc.subscriptions) && cc.subscriptions.includes(evt);
                                    const enabled = subscribed && cc.container_running;
                                    return (
                                        <button key={evt} onClick={() => handleTest(evt)} disabled={!enabled}
                                            title={!subscribed ? 'Not subscribed' : !cc.container_running ? 'Container offline' : `Send test ${evt}`}
                                            className={cn(
                                                "flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono border rounded-sm transition-colors",
                                                enabled
                                                    ? "border-blue-400/20 text-blue-300 hover:border-signal/40 hover:text-signal"
                                                    : "border-white/5 text-gray-700 cursor-not-allowed"
                                            )}>
                                            <Play size={8} />{evt}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Subscriptions */}
                    {subs.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">
                                {isEventing ? 'Functions' : 'Subscriptions'}
                            </p>
                            {isEventing ? (
                                <div className="bg-black/20 rounded px-2 py-1">{subs.map((s, i) => parseSubscription(s, i))}</div>
                            ) : (
                                <div className="flex flex-wrap gap-1">{subs.map((s, i) => parseSubscription(s, i))}</div>
                            )}
                        </div>
                    )}

                    {/* IDP Metadata dialog */}
                    {idpMeta && (
                        <div className="bg-black/30 border border-amber-500/20 rounded p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-amber-400 font-mono uppercase tracking-widest">IDP Metadata — {idpMeta.name}</p>
                                <button onClick={() => setIdpMeta(null)} className="text-gray-500 hover:text-white transition-colors text-xs">✕</button>
                            </div>
                            <pre className="text-[10px] text-gray-300 font-mono whitespace-pre-wrap break-all max-h-64 overflow-auto bg-black/40 p-2 rounded">
                                {idpMeta.data}
                            </pre>
                        </div>
                    )}
                </div>
            )}
            <ConfirmOverlay
                open={confirmingDelete}
                label={`${cc.deleted ? 'Restore' : 'Delete'} ${cc.name}?`}
                danger={!cc.deleted}
                onYes={handleDelete}
                onCancel={() => setConfirmingDelete(false)}
            />
        </div>
        {showFiles && <ContainerFilesDialog containerName={cc.name} onClose={() => setShowFiles(false)} />}
        </>
    );
};

// ── Empty state hints per tab ────────────────────────────────────────────────

const EMPTY_HINTS: Record<string, { text: string; link?: string; linkText?: string }> = {
    agents: {
        text: 'Payload types are the backbone of Mythic — they define how agents operate. Install agents to get started.',
        link: 'https://github.com/MythicAgents',
        linkText: 'Browse MythicAgents on GitHub',
    },
    c2: {
        text: 'C2 Profiles define how agents connect back to Mythic. Install at least one to enable comms.',
        link: 'https://github.com/MythicC2Profiles',
        linkText: 'Browse C2 Profiles on GitHub',
    },
    translation: {
        text: 'Translation containers convert between custom message formats and Mythic\'s JSON. Only needed for non-standard agents.',
    },
    commandaugment: {
        text: 'Command augmentation containers add cross-agent commands (e.g., SOCKS, screencapture). These commands hook into any agent.',
        link: 'https://github.com/MythicAgents/forge',
        linkText: 'Example: Forge on GitHub',
    },
    thirdparty: {
        text: '3rd party / external service containers provide callback-like integrations (e.g., BloodHound, Ghostwriter).',
        link: 'https://github.com/MythicAgents',
        linkText: 'Browse 3rd party services',
    },
    webhooks: {
        text: 'Webhook containers react to new callbacks and other events by sending HTTP webhooks to external services.',
        link: 'https://github.com/MythicC2Profiles/basic_webhook',
        linkText: 'Example: basic_webhook',
    },
    loggers: {
        text: 'Logging containers stream task output and events to external logging platforms.',
        link: 'https://github.com/MythicC2Profiles/basic_logger',
        linkText: 'Example: basic_logger',
    },
    eventing: {
        text: 'Eventing containers run automated workflows triggered by Mythic events.',
        link: 'https://github.com/MythicAgents/hydra',
        linkText: 'Example: Hydra eventing',
    },
    auth: {
        text: 'Auth containers enable LDAP, SSO, or custom authentication backends for Mythic operators.',
    },
    browsers: {
        text: 'Custom browser containers define custom file/data format viewers displayed for specific payload types.',
    },
};

// ── PayloadTypes Page ──────────────────────────────────────────────────────────

type TabKey = 'agents' | 'c2' | 'translation' | 'commandaugment' | 'thirdparty' | 'webhooks' | 'loggers' | 'eventing' | 'auth' | 'browsers';

export default function PayloadTypes() {
    const { data: ptData, loading: ptLoading } = useSubscription<any>(SUB_PAYLOAD_TYPES, {
        onError: (err) => { console.error('[SUB_PAYLOAD_TYPES] subscription error:', err); },
    });
    const { data: ccData } = useSubscription<any>(SUB_CONSUMING_CONTAINERS, {
        onError: (err) => { console.error('[SUB_CONSUMING_CONTAINERS] subscription error:', err); },
    });
    const { data: tcData } = useSubscription<any>(SUB_TRANSLATION_CONTAINERS, {
        onError: (err) => { console.error('[SUB_TRANSLATION_CONTAINERS] subscription error:', err); },
    });
    const { data: cbData } = useSubscription<any>(SUB_CUSTOM_BROWSERS, {
        onError: (err) => { console.error('[SUB_CUSTOM_BROWSERS] subscription error:', err); },
    });
    const loading = ptLoading;

    const [activeTab, setActiveTab] = useState<TabKey>('agents');
    const [showDeleted, setShowDeleted] = useState(false);
    const [onlineOnly, setOnlineOnly] = useState(false);
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState<'name' | 'status' | 'commands'>('name');

    const allPayloadTypes: any[] = useMemo(() => ptData?.payloadtype ?? [], [ptData]);
    const allTranslationContainers: any[] = useMemo(() => tcData?.translationcontainer ?? [], [tcData]);
    const allConsumingContainers: any[] = useMemo(() => ccData?.consuming_container ?? [], [ccData]);
    const allCustomBrowsers: any[] = useMemo(() => cbData?.custombrowser ?? [], [cbData]);

    // Match against the searchable text fields exposed by each row type.
    const matchesQuery = (item: any): boolean => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        const hay = [
            item.name, item.author, item.note, item.description,
            item.type, item.agent_type, item.semver,
        ].filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(q)) return true;
        // also check command names for payloadtypes
        if (Array.isArray(item.commands)) {
            return item.commands.some((c: any) => c.cmd?.toLowerCase().includes(q));
        }
        return false;
    };

    const sortItems = (arr: any[]): any[] => {
        const copy = [...arr];
        switch (sortKey) {
            case 'status':
                copy.sort((a, b) => Number(!!b.container_running) - Number(!!a.container_running) || a.name.localeCompare(b.name));
                break;
            case 'commands':
                copy.sort((a, b) => ((b.commands?.length ?? 0) - (a.commands?.length ?? 0)) || a.name.localeCompare(b.name));
                break;
            default:
                copy.sort((a, b) => a.name.localeCompare(b.name));
        }
        return copy;
    };

    const applyFilters = (arr: any[]): any[] => {
        let out = arr;
        if (!showDeleted) out = out.filter(c => !c.deleted);
        if (onlineOnly) out = out.filter(c => c.container_running);
        out = out.filter(matchesQuery);
        return sortItems(out);
    };

    /* eslint-disable react-hooks/exhaustive-deps */
    const payloadTypes = useMemo(() => applyFilters(allPayloadTypes), [allPayloadTypes, showDeleted, onlineOnly, query, sortKey]);
    const translationContainers = useMemo(() => applyFilters(allTranslationContainers), [allTranslationContainers, showDeleted, onlineOnly, query, sortKey]);
    const consumingContainers = useMemo(() => applyFilters(allConsumingContainers), [allConsumingContainers, showDeleted, onlineOnly, query, sortKey]);
    const customBrowsers = useMemo(() => applyFilters(allCustomBrowsers), [allCustomBrowsers, showDeleted, onlineOnly, query, sortKey]);
    /* eslint-enable react-hooks/exhaustive-deps */

    // Split data into categories
    const agents = useMemo(() => payloadTypes.filter(p => p.agent_type === 'agent' || p.agent_type === 'wrapper'), [payloadTypes]);
    const commandAugments = useMemo(() => payloadTypes.filter(p => p.agent_type === 'command_augment'), [payloadTypes]);
    const thirdParty = useMemo(() => payloadTypes.filter(p => p.agent_type === 'service'), [payloadTypes]);
    const webhooks = useMemo(() => consumingContainers.filter(c => c.type === 'webhook'), [consumingContainers]);
    const loggers = useMemo(() => consumingContainers.filter(c => c.type === 'logging'), [consumingContainers]);
    const eventingContainers = useMemo(() => consumingContainers.filter(c => c.type === 'eventing'), [consumingContainers]);
    const authContainers = useMemo(() => consumingContainers.filter(c => c.type === 'auth'), [consumingContainers]);

    // Top-line counts — based on the unfiltered data, so the header reflects truth
    // even when the user has hidden deleted/offline items via the toolbar.
    const allServices = useMemo(
        () => [...allPayloadTypes, ...allTranslationContainers, ...allConsumingContainers, ...allCustomBrowsers],
        [allPayloadTypes, allTranslationContainers, allConsumingContainers, allCustomBrowsers]
    );
    const totalServices = allServices.filter(s => !s.deleted).length;
    const totalOnline = allServices.filter(s => !s.deleted && s.container_running).length;
    const totalDeleted = allServices.filter(s => s.deleted).length;

    const tabs: { key: TabKey; label: string; icon: React.ReactNode; items: any[] }[] = [
        { key: 'agents', label: 'AGENTS', icon: <Package size={12} />, items: agents },
        { key: 'c2', label: 'C2', icon: <Radio size={12} />, items: [] }, // C2 on separate page
        { key: 'translation', label: 'TRANSLATORS', icon: <ArrowLeftRight size={12} />, items: translationContainers },
        { key: 'commandaugment', label: 'CMD AUGMENTS', icon: <Puzzle size={12} />, items: commandAugments },
        { key: 'thirdparty', label: 'EXTERNAL', icon: <ExternalLink size={12} />, items: thirdParty },
        { key: 'webhooks', label: 'WEBHOOKS', icon: <Webhook size={12} />, items: webhooks },
        { key: 'loggers', label: 'LOGGERS', icon: <FileText size={12} />, items: loggers },
        { key: 'eventing', label: 'EVENTING', icon: <MonitorCog size={12} />, items: eventingContainers },
        { key: 'auth', label: 'AUTH', icon: <Shield size={12} />, items: authContainers },
        { key: 'browsers', label: 'BROWSERS', icon: <Eye size={12} />, items: customBrowsers },
    ];

    const renderEmptyState = (key: TabKey, icon: React.ReactNode) => {
        const hint = EMPTY_HINTS[key];
        const hasFilters = !!query.trim() || onlineOnly;
        return (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-600">
                <div className="opacity-30">{React.cloneElement(icon as React.ReactElement<any>, { size: 32 })}</div>
                {hasFilters ? (
                    <>
                        <p className="font-mono text-sm text-center max-w-md text-gray-400">No matches for your filters</p>
                        <button
                            onClick={() => { setQuery(''); setOnlineOnly(false); }}
                            className="text-xs text-signal/70 hover:text-signal font-mono flex items-center gap-1.5 transition-colors"
                        >
                            <X size={10} /> Clear filters
                        </button>
                    </>
                ) : (
                    <>
                        <p className="font-mono text-sm text-center max-w-md">No {tabs.find(t => t.key === key)?.label.toLowerCase() || 'services'} registered</p>
                        {hint && <p className="text-xs text-gray-500 text-center max-w-lg">{hint.text}</p>}
                        {hint?.link && (
                            <a href={hint.link} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-signal/70 hover:text-signal font-mono flex items-center gap-1.5 transition-colors">
                                <ExternalLink size={10} /> {hint.linkText || hint.link}
                            </a>
                        )}
                    </>
                )}
            </div>
        );
    };

    const renderTabContent = () => {
        const tab = tabs.find(t => t.key === activeTab);
        if (!tab) return null;

        // Special case: C2 is on a separate page
        if (activeTab === 'c2') {
            return (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
                    <Radio size={32} className="opacity-30" />
                    <p className="font-mono text-sm">C2 Profiles are managed on the dedicated C2 Profiles page</p>
                    <a href="/c2-profiles" className="text-xs text-signal/70 hover:text-signal font-mono flex items-center gap-1.5 transition-colors">
                        <ExternalLink size={10} /> Go to C2 Profiles →
                    </a>
                </div>
            );
        }

        const items = tab.items;
        if (items.length === 0 && !loading) return renderEmptyState(activeTab, tab.icon);

        // Render based on tab type
        if (activeTab === 'agents' || activeTab === 'commandaugment' || activeTab === 'thirdparty') {
            return (
                <div className="space-y-2">
                    {items.map((pt: any) => <PayloadTypeCard key={pt.id} pt={pt} />)}
                </div>
            );
        }
        if (activeTab === 'translation') {
            return (
                <div className="space-y-2">
                    {items.map((tc: any) => <TranslationRow key={tc.id} tc={tc} />)}
                </div>
            );
        }
        if (activeTab === 'browsers') {
            return (
                <div className="space-y-2">
                    {items.map((cb: any) => <CustomBrowserRow key={cb.id} cb={cb} />)}
                </div>
            );
        }
        // Consuming services (webhooks, loggers, eventing, auth)
        return (
            <div className="space-y-2">
                {items.map((cc: any) => <ConsumingRow key={cc.id} cc={cc} />)}
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-void text-ghost overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                {/* ── Header ── */}
                <div className="shrink-0 border-b border-white/10 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <Layers size={22} className="text-signal" />
                        <div className="min-w-0">
                            <h1 className="text-base font-bold font-mono text-white uppercase tracking-widest">Installed Services</h1>
                            <p className="text-[11px] text-gray-400 font-mono truncate">
                                {totalOnline}/{totalServices} online · {totalServices - totalOnline} offline{totalDeleted > 0 ? ` · ${totalDeleted} deleted` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Search */}
                        <div className="relative flex items-center">
                            <Search size={11} className="absolute left-2 text-gray-500 pointer-events-none" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search name / cmd / author"
                                className="bg-black/40 border border-white/15 pl-7 pr-7 py-1.5 text-xs font-mono text-gray-200 placeholder:text-gray-600 rounded-sm focus:border-signal/50 focus:outline-none w-56"
                            />
                            {query && (
                                <button
                                    onClick={() => setQuery('')}
                                    className="absolute right-1.5 text-gray-500 hover:text-white transition-colors"
                                    title="Clear search"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                        {/* Sort */}
                        <div className="relative flex items-center">
                            <ArrowUpDown size={11} className="absolute left-2 text-gray-500 pointer-events-none" />
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as any)}
                                className="appearance-none bg-black/40 border border-white/15 pl-7 pr-3 py-1.5 text-xs font-mono text-gray-300 rounded-sm focus:border-signal/50 focus:outline-none cursor-pointer"
                                title="Sort"
                            >
                                <option value="name">SORT: NAME</option>
                                <option value="status">SORT: STATUS</option>
                                <option value="commands">SORT: CMD COUNT</option>
                            </select>
                        </div>
                        {/* Online toggle */}
                        <button onClick={() => setOnlineOnly(v => !v)}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border rounded-sm transition-colors",
                                onlineOnly ? "border-green-400/40 text-green-400 bg-green-400/5" : "border-white/15 text-gray-500 hover:text-gray-300"
                            )}>
                            <Power size={11} />
                            {onlineOnly ? 'ONLINE ONLY' : 'ALL STATUS'}
                        </button>
                        {/* Deleted toggle */}
                        <button onClick={() => setShowDeleted(v => !v)}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border rounded-sm transition-colors",
                                showDeleted ? "border-red-400/40 text-red-400" : "border-white/15 text-gray-500 hover:text-gray-300"
                            )}>
                            <Trash2 size={11} />
                            {showDeleted ? 'HIDE DELETED' : 'SHOW DELETED'}
                        </button>
                        {/* Live */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-white/15 text-gray-500 rounded-sm"
                            title="Live updating via subscription">
                            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                            LIVE
                        </div>
                    </div>
                </div>

                {/* ── Tabs (scrollable) ── */}
                <div className="shrink-0 flex gap-0 border-b border-white/10 px-4 pt-2 overflow-x-auto cyber-scrollbar">
                    {tabs.map(t => {
                        const online = t.items.filter((i: any) => i.container_running).length;
                        const total = t.items.length;
                        return (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
                                    activeTab === t.key
                                        ? 'border-signal text-signal'
                                        : 'border-transparent text-gray-400 hover:text-white'
                                )}>
                                {t.icon}
                                {t.label}
                                {total > 0 && (
                                    <span className={cn(
                                        'px-1.5 py-0.5 text-[9px] rounded-sm font-bold ml-1',
                                        online === total
                                            ? 'bg-green-400/15 text-green-400'
                                            : online === 0
                                                ? 'bg-red-400/15 text-red-400'
                                                : 'bg-yellow-400/15 text-yellow-400'
                                    )}>
                                        {online}/{total}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && allPayloadTypes.length === 0 && (
                        <div className="flex items-center justify-center h-32 text-gray-400 font-mono text-sm tracking-widest animate-pulse">
                            LOADING...
                        </div>
                    )}
                    {renderTabContent()}
                </div>

            </div>
        </div>
    );
}
