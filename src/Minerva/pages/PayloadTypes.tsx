import React, { useState, useMemo } from 'react';
import { useMutation, useSubscription } from "@apollo/client/react";

import { cn } from '../lib/utils';
import { snackActions } from '../lib/snackbar';
import {
    SUB_PAYLOAD_TYPES, SUB_CONSUMING_CONTAINERS, SUB_TRANSLATION_CONTAINERS, SUB_CUSTOM_BROWSERS,
    TOGGLE_CONSUMING_DELETE, TEST_WEBHOOK, TEST_LOG,
} from '../lib/api';
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
}from 'lucide-react';

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
    };
    return (
        <span className={cn('px-1.5 py-0.5 text-[9px] font-mono border rounded-sm uppercase', colors[type] ?? 'border-white/20 text-gray-400')}>
            {type}
        </span>
    );
};

// ── PayloadType Card ───────────────────────────────────────────────────────────

const PayloadTypeCard = ({ pt }: { pt: any }) => {
    const [expanded, setExpanded] = useState(false);
    const osArr: string[] = pt.supported_os
        ? pt.supported_os.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
    const commands: any[] = pt.commands ?? [];

    return (
        <div className={cn(
            'border transition-all',
            pt.container_running
                ? 'border-signal/25 bg-signal/3 hover:border-signal/50'
                : 'border-red-500/20 bg-red-500/3 hover:border-red-400/40'
        )}>
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-3">
                <StatusDot running={pt.container_running} />
                <span className="font-mono text-sm text-white font-bold tracking-wide flex-1 truncate">{pt.name}</span>
                <AgentTypeChip type={pt.agent_type ?? 'agent'} />
                <div className="hidden sm:flex gap-1 flex-wrap">
                    {osArr.map(os => <OsChip key={os} os={os} />)}
                </div>
                <span className="text-[10px] text-gray-500 font-mono shrink-0">
                    {commands.length} cmd{commands.length !== 1 ? 's' : ''}
                </span>
                {pt.translation_container && (
                    <span className="text-[9px] text-purple-400 font-mono border border-purple-400/30 px-1.5 py-0.5 rounded-sm shrink-0" title="Has translation container">
                        <ArrowLeftRight size={8} className="inline mr-1" />TRANS
                    </span>
                )}
                <button onClick={() => setExpanded(v => !v)}
                    className="text-gray-500 hover:text-signal transition-colors">
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
                    {pt.note && (
                        <p className="text-xs text-gray-400">{pt.note}</p>
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
        </div>
    );
};

// ── Translation Container Row ──────────────────────────────────────────────────

const TranslationRow = ({ tc }: { tc: any }) => {
    const [expanded, setExpanded] = useState(false);
    const supported: any[] = tc.supported_payloadtypes ?? [];
    return (
        <div className="border border-purple-400/20 bg-purple-400/3 hover:border-purple-400/40 transition-all">
            <div className="flex items-center gap-3 px-4 py-3">
                <StatusDot running={tc.container_running} />
                <ArrowLeftRight size={12} className="text-purple-400 shrink-0" />
                <span className="font-mono text-sm text-purple-200 font-bold flex-1 truncate">{tc.name}</span>
                {supported.length > 0 && (
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">
                        {supported.length} payload{supported.length !== 1 ? 's' : ''}
                    </span>
                )}
                <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-purple-400 transition-colors">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>
            {expanded && (
                <div className="border-t border-white/5 px-4 py-3 space-y-2">
                    {tc.note && <p className="text-xs text-gray-400">{tc.note}</p>}
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
        </div>
    );
};

// ── Consuming Container Row ────────────────────────────────────────────────────

const WEBHOOK_EVENTS = ['new_alert', 'new_callback', 'new_custom', 'new_feedback', 'new_startup'] as const;
const LOG_EVENTS = ['new_artifact', 'new_callback', 'new_credential', 'new_file', 'new_keylog', 'new_payload', 'new_response', 'new_task'] as const;

const ConsumingRow = ({ cc }: { cc: any }) => {
    const [expanded, setExpanded] = useState(false);
    const [idpMeta, setIdpMeta] = useState<{ name: string; data: string } | null>(null);
    const [toggleDelete] = useMutation(TOGGLE_CONSUMING_DELETE);
    const [testWebhook] = useMutation(TEST_WEBHOOK);
    const [testLog] = useMutation(TEST_LOG);

    const subs: any[] = Array.isArray(cc.subscriptions) ? cc.subscriptions : (cc.subscriptions ? [cc.subscriptions] : []);
    const isEventing = cc.type === 'eventing';
    const isAuth = cc.type === 'auth';
    const isWebhook = cc.type === 'webhook';
    const isLogger = cc.type === 'logging';

    const handleDelete = async () => {
        try {
            await toggleDelete({ variables: { id: cc.id, deleted: !cc.deleted } });
            snackActions.success(cc.deleted ? 'Restored' : 'Deleted');
        } catch (e: any) { snackActions.error(e.message); }
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
                        className="text-gray-500 hover:text-amber-400 transition-colors">
                        <KeyRound size={10} />
                    </button>
                </div>
            );
        }
        const label = typeof sub === 'string' ? sub : JSON.stringify(sub);
        return <span key={idx} className="px-1.5 py-0.5 text-[10px] font-mono border border-blue-400/25 text-blue-300 rounded-sm">{label}</span>;
    };

    return (
        <div className={cn("border transition-all", cc.deleted ? "border-red-500/20 bg-red-500/3 opacity-60" : "border-blue-400/20 bg-blue-400/3 hover:border-blue-400/40")}>
            <div className="flex items-center gap-3 px-4 py-3">
                <StatusDot running={cc.container_running} />
                <Server size={12} className="text-blue-400 shrink-0" />
                <span className={cn("font-mono text-sm font-bold flex-1 truncate", cc.deleted ? "text-red-300 line-through" : "text-blue-200")}>{cc.name}</span>
                {cc.type && <span className="text-[9px] text-gray-500 font-mono border border-white/10 px-1.5 py-0.5 rounded-sm uppercase">{cc.type}</span>}
                {subs.length > 0 && (
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">{subs.length} sub{subs.length !== 1 ? 's' : ''}</span>
                )}
                <button onClick={handleDelete} title={cc.deleted ? 'Restore' : 'Delete'}
                    className="text-gray-500 hover:text-red-400 transition-colors">
                    {cc.deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                </button>
                <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-blue-400 transition-colors">
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
                                {(isWebhook ? WEBHOOK_EVENTS : LOG_EVENTS).map(evt => (
                                    <button key={evt} onClick={() => handleTest(evt)}
                                        className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono border border-blue-400/20 text-blue-300 rounded-sm hover:border-signal/40 hover:text-signal transition-colors">
                                        <Play size={8} />{evt}
                                    </button>
                                ))}
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
        </div>
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const payloadTypes: any[] = ptData?.payloadtype ?? [];
    const translationContainers: any[] = tcData?.translationcontainer ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const allConsumingContainers: any[] = ccData?.consumingcontainer ?? [];
    const consumingContainers = useMemo(
        () => showDeleted ? allConsumingContainers : allConsumingContainers.filter((c: any) => !c.deleted),
        [allConsumingContainers, showDeleted]
    );
    const customBrowsers: any[] = cbData?.custombrowser ?? [];

    // Split data into categories
    const agents = useMemo(() => payloadTypes.filter(p => p.agent_type === 'agent' || p.agent_type === 'wrapper'), [payloadTypes]);
    const commandAugments = useMemo(() => payloadTypes.filter(p => p.agent_type === 'command_augment'), [payloadTypes]);
    const thirdParty = useMemo(() => payloadTypes.filter(p => p.agent_type === 'service'), [payloadTypes]);
    const webhooks = useMemo(() => consumingContainers.filter(c => c.type === 'webhook'), [consumingContainers]);
    const loggers = useMemo(() => consumingContainers.filter(c => c.type === 'logging'), [consumingContainers]);
    const eventingContainers = useMemo(() => consumingContainers.filter(c => c.type === 'eventing'), [consumingContainers]);
    const authContainers = useMemo(() => consumingContainers.filter(c => c.type === 'auth'), [consumingContainers]);

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
        return (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-600">
                <div className="opacity-30">{React.cloneElement(icon as React.ReactElement<any>, { size: 32 })}</div>
                <p className="font-mono text-sm text-center max-w-md">No {tabs.find(t => t.key === key)?.label.toLowerCase() || 'services'} registered</p>
                {hint && (
                    <p className="text-xs text-gray-500 text-center max-w-lg">{hint.text}</p>
                )}
                {hint?.link && (
                    <a href={hint.link} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-signal/70 hover:text-signal font-mono flex items-center gap-1.5 transition-colors">
                        <ExternalLink size={10} /> {hint.linkText || hint.link}
                    </a>
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
        // Consuming services (webhooks, loggers, eventing, auth) and browsers
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
                <div className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Layers size={22} className="text-signal" />
                        <div>
                            <h1 className="text-base font-bold font-mono text-white uppercase tracking-widest">Installed Services</h1>
                            <p className="text-xs text-gray-400 font-mono">Agents, translators, consumers &amp; browsers</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-white/15 text-gray-500 rounded-sm"
                        title="Live updating via subscription">
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                        LIVE
                    </div>
                    <button onClick={() => setShowDeleted(v => !v)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border rounded-sm transition-colors",
                            showDeleted ? "border-red-400/40 text-red-400" : "border-white/15 text-gray-500 hover:text-gray-300"
                        )}>
                        <Trash2 size={11} />
                        {showDeleted ? 'HIDE DELETED' : 'SHOW DELETED'}
                    </button>
                </div>

                {/* ── Tabs (scrollable) ── */}
                <div className="shrink-0 flex gap-0 border-b border-white/8 px-4 pt-2 overflow-x-auto cyber-scrollbar">
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
                    {loading && payloadTypes.length === 0 && (
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
