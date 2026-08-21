import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useApolloClient } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { usePageVisible } from '../../lib/usePageVisible';
import { useAppStore } from '../../store';
import { useShallow } from 'zustand/shallow';
import {
    Terminal, Folder, Activity, Info, Lock, Unlock, MessageSquare,
    Zap, XCircle, EyeOff, MoreHorizontal, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    GET_CALLBACK_DETAILS, GET_ALL_CALLBACKS_BY_DOMAIN,
    GET_EXIT_CALLBACK_COMMAND, CREATE_TASK_MUTATION,
    HIDE_CALLBACK_MUTATION, LOCK_CALLBACK_MUTATION,
    UPDATE_CALLBACK_DESCRIPTION_MUTATION,
} from '../../lib/api';
import { MythicDialog } from '../../components/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/EventTriggerContextSelect';
import { cn, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { RelativeTime } from './utils';
import { ConsoleTerminal } from './ConsoleTerminal';
import { InfoPanel } from './InfoPanel';
import { FileBrowserPanel } from './FileBrowserPanel';
import { ProcessList } from './ProcessList';
import { MeterpreterInfoPanel } from './MeterpreterInfoPanel';
import { MsfFileBrowserPanel } from './MsfFileBrowserPanel';
import { MsfProcessList } from './MsfProcessList';
import { getSessions as getMsfSessions, type MsfSession } from '../Metasploit/msfrpc';
import {
    getMsfLedgerSnapshot,
    MSF_DISPLAY_ID_OFFSET,
    pickMsfHost,
    pickMsfUser,
} from '../Callbacks/msfSyntheticCallbacks';
import { MsfConsoleBootChrome } from './MsfConsoleBootChrome';

export default function Console() {
    const { id } = useParams();
    const navigate = useNavigate();
    const client = useApolloClient();
    const { isSidebarCollapsed, consoleTabs, openConsoleTab, closeConsoleTab } = useAppStore(useShallow(s => ({ isSidebarCollapsed: s.isSidebarCollapsed, consoleTabs: s.consoleTabs, openConsoleTab: s.openConsoleTab, closeConsoleTab: s.closeConsoleTab })));
    const pageVisible = usePageVisible();
    const [activeTab, setActiveTab] = useState<'info' | 'files' | 'processes'>('info');

    // ── MSF session mode ────────────────────────────────────────────────────
    // MSF synthetic callbacks use a positive display_id (>=100000) so the
    // route is just `/console/<displayId>` — no special prefix. We still
    // accept the legacy `msf-<sid>` URL form for backward compatibility.
    const idParam = id || '';
    const idAsInt = parseInt(idParam, 10);
    const legacyMsfMatch = idParam.startsWith('msf-');
    const isMsf = legacyMsfMatch
        || (Number.isFinite(idAsInt) && idAsInt >= MSF_DISPLAY_ID_OFFSET);
    const msfSessionId = isMsf
        ? (legacyMsfMatch ? idParam.slice(4) : String(idAsInt - MSF_DISPLAY_ID_OFFSET))
        : '';
    // Seed from the synthetic-callback ledger so the Console renders the
    // host/user/platform chrome on the very first paint instead of waiting
    // on a fresh `session.list` RPC (which adds 100-500ms of "INITIALIZING…"
    // dead air). The background poll below still runs to keep the snapshot
    // fresh — the ledger is just our warm cache.
    const [msfSession, setMsfSession] = useState<MsfSession | null>(() =>
        isMsf && msfSessionId ? getMsfLedgerSnapshot(msfSessionId) : null,
    );
    const [msfConnectionLost, setMsfConnectionLost] = useState(false);
    const [msfRefreshKey, setMsfRefreshKey] = useState(0);

    useEffect(() => {
        if (!isMsf) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const all = await getMsfSessions();
                if (cancelled) return;
                const s = all[msfSessionId];
                if (s) {
                    setMsfSession(s);
                    setMsfConnectionLost(false);
                } else {
                    setMsfConnectionLost(true);
                }
            } catch {
                if (!cancelled) setMsfConnectionLost(true);
            }
        };
        tick();
        const iv = setInterval(() => { if (pageVisible) tick(); }, 5_000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [isMsf, msfSessionId, pageVisible, msfRefreshKey]);
    const [showCallbackMenu, setShowCallbackMenu] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
    const [descEditOpen, setDescEditOpen] = useState(false);
    const [descValue, setDescValue] = useState('');
    const [showEventingDialog, setShowEventingDialog] = useState(false);
    const cbMenuRef = useRef<HTMLDivElement>(null);
    const menuContentRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        if (!showCallbackMenu) return;
        const handler = (e: MouseEvent) => {
            const inBtn = cbMenuRef.current?.contains(e.target as Node);
            const inMenu = menuContentRef.current?.contains(e.target as Node);
            if (!inBtn && !inMenu) setShowCallbackMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showCallbackMenu]);

    const { data, loading, error } = useQuery<any>(GET_CALLBACK_DETAILS, {
        variables: { display_id: parseInt(id || '0') },
        pollInterval: pageVisible ? 5000 : 0,
        skip: isMsf,
    });

    const { data: allCallbacksData } = useQuery<any>(GET_ALL_CALLBACKS_BY_DOMAIN, {
        pollInterval: pageVisible ? 15000 : 0,
        // Only the 'info' tab renders this. It was polling an unbounded
        // all-callbacks selection every 15s for a panel the operator usually
        // is not looking at.
        skip: isMsf || activeTab !== 'info',
    });

    const [hideCallback] = useMutation<any>(HIDE_CALLBACK_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Callback hidden')
            : snackActions.error(d.updateCallback?.error || 'Failed'),
    });
    const [lockCallback] = useMutation<any>(LOCK_CALLBACK_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Callback lock state updated')
            : snackActions.error(d.updateCallback?.error || 'Failed'),
    });
    const [updateDescription] = useMutation<any>(UPDATE_CALLBACK_DESCRIPTION_MUTATION, {
        onCompleted: (d: any) => d.updateCallback?.status === 'success'
            ? snackActions.success('Description updated')
            : snackActions.error(d.updateCallback?.error || 'Failed'),
    });

    const [createTask] = useMutation<any>(CREATE_TASK_MUTATION);

    const handleExitCallback = async () => {
        if (!callback) return;
        try {
            const { data: exitData } = await client.query({
                query: GET_EXIT_CALLBACK_COMMAND,
                variables: { callback_id: callback.id },
                fetchPolicy: 'network-only',
            });
            const exitCmds = (exitData as any)?.callback_by_pk?.loadedcommands || [];
            if (exitCmds.length === 0) {
                snackActions.warning('No exit command loaded for this callback');
                return;
            }
            if (!window.confirm(`Task ${exitCmds[0].command.cmd} on Callback ${callback.display_id}?`)) return;
            await createTask({
                variables: {
                    callback_id: callback.id,
                    command: exitCmds[0].command.cmd,
                    params: '',
                    tasking_location: 'command_line',
                }
            });
            snackActions.success(`Tasked ${exitCmds[0].command.cmd}`);
        } catch (e: unknown) {
            snackActions.error('Failed to exit callback: ' + getErrorMessage(e));
        }
    };

    const callback = data?.callback?.[0];
    const allCallbacks = allCallbacksData?.callback || [];

    // Register tab in global store when data is available (Mythic OR MSF).
    useEffect(() => {
        if (isMsf && msfSession) {
            const sType = msfSession.type === 'meterpreter' ? 'METERPRETER' : 'MSF_SHELL';
            openConsoleTab({
                // Use the offset display_id so the tab id is a regular number
                // matching what shows in `/callbacks` — `C100003` looks like a
                // normal callback tab rather than the old "MSF-3" form.
                id: MSF_DISPLAY_ID_OFFSET + (parseInt(msfSessionId, 10) || 0),
                host: pickMsfHost(msfSession),
                user: pickMsfUser(msfSession),
                payloadType: sType,
            });
        } else if (callback) {
            openConsoleTab({
                id: callback.display_id,
                host: callback.host || '',
                user: callback.user || '',
                payloadType: callback.payload?.payloadtype?.name || '',
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callback?.display_id, isMsf, msfSession?.uuid]);

    if (isMsf) {
        if (!msfSession && !msfConnectionLost) {
            return (
                <MsfConsoleBootChrome
                    sessionId={msfSessionId}
                    isSidebarCollapsed={isSidebarCollapsed}
                />
            );
        }
    } else {
        if (loading && !callback) {
            return (
                <MsfConsoleBootChrome
                    sessionId={id || ''}
                    isSidebarCollapsed={isSidebarCollapsed}
                    mode="mythic"
                />
            );
        }
        if (error) {
            return (
                <MsfConsoleBootChrome
                    sessionId={id || ''}
                    isSidebarCollapsed={isSidebarCollapsed}
                    mode="mythic"
                    errorMessage={error.message}
                />
            );
        }
        if (!callback) {
            return (
                <MsfConsoleBootChrome
                    sessionId={id || ''}
                    isSidebarCollapsed={isSidebarCollapsed}
                    mode="mythic"
                    errorMessage="CALLBACK_NOT_FOUND"
                />
            );
        }
    }

    return (
        <div className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void overflow-hidden">

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}
            >
                {/* Multi-callback tab bar */}
                {consoleTabs.length > 1 && (
                    <div className="flex items-center gap-0 bg-machine/40 border-b border-signal/15 overflow-x-auto shrink-0 h-8">
                        {consoleTabs.map(tab => {
                            const isActive = tab.id === id || (typeof tab.id === 'number' && tab.id === parseInt(id || '0'));
                            return (
                                <div key={String(tab.id)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 h-full border-r border-signal/15 font-mono text-[11px] cursor-pointer select-none group shrink-0',
                                        isActive
                                            ? 'bg-signal/10 text-signal border-t-2 border-t-accent'
                                            : 'text-signal hover:bg-signal/5'
                                    )}
                                >
                                    <span onClick={() => navigate(`/console/${tab.id}`)} className="flex items-center gap-1">
                                        <span>C{tab.id}</span>
                                        <span className="text-signal/60">·</span>
                                        <span>{tab.host || `#${tab.id}`}</span>
                                    </span>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (isActive) {
                                                const idx = consoleTabs.findIndex(t => t.id === tab.id);
                                                const next = consoleTabs[idx + 1] ?? consoleTabs[idx - 1];
                                                closeConsoleTab(tab.id);
                                                navigate(next ? `/console/${next.id}` : '/callbacks');
                                            } else {
                                                closeConsoleTab(tab.id);
                                            }
                                        }}
                                        className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                                    >
                                        <X size={9} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
                {/* Header */}
                <header className="h-14 bg-machine/40 border-b border-signal/20 flex items-center px-6 justify-between backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border flex items-center justify-center border-signal bg-signal/10">
                            <Terminal size={20} className="text-signal" />
                        </div>
                        {isMsf ? (
                            <div>
                                <h1 className="text-lg font-bold tracking-[0.2em] flex items-center gap-2">
                                    <span className="text-signal">CALLBACK_{MSF_DISPLAY_ID_OFFSET + (parseInt(msfSessionId, 10) || 0)}</span>
                                    <span className="text-signal/60 text-sm">/</span>
                                    <span className="text-signal text-base">
                                        {msfSession ? `${pickMsfUser(msfSession)}@${pickMsfHost(msfSession)}` : 'msf@—'}
                                    </span>
                                </h1>
                                <div className="flex items-center gap-3 text-[11px] text-signal font-mono">
                                    <span className="flex items-center gap-1">
                                        {msfConnectionLost ? (
                                            <>
                                                <span className="w-2 h-2 bg-red-500 rounded-full" />
                                                DISCONNECTED
                                            </>
                                        ) : (
                                            <>
                                                <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                                                ONLINE
                                            </>
                                        )}
                                    </span>
                                    <span>•</span>
                                    <span className="uppercase tracking-[0.2em]">
                                        {msfSession?.type === 'meterpreter' ? 'METERPRETER' : 'MSF_SHELL'}
                                    </span>
                                    <span>•</span>
                                    <span>{msfSession?.platform || '—'} ({msfSession?.arch || '—'})</span>
                                    {msfSession?.via_exploit && (
                                        <>
                                            <span>•</span>
                                            <span className="text-accent truncate max-w-[260px]" title={msfSession.via_exploit}>
                                                via {msfSession.via_exploit}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <h1 className="text-lg font-bold tracking-widest flex items-center gap-2">
                                    <span className="text-signal">CALLBACK_{callback.display_id}</span>
                                    <span className="text-signal/60 text-sm">/</span>
                                    <span className="text-signal text-base">{callback.user}@{callback.host}</span>
                                </h1>
                                <div className="flex items-center gap-3 text-[11px] text-signal font-mono">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                                        ONLINE
                                    </span>
                                    <span>•</span>
                                    <span>{callback.payload?.payloadtype?.name}</span>
                                    <span>•</span>
                                    <span>{callback.os} ({callback.architecture})</span>
                                    {callback.domain && (
                                        <>
                                            <span>•</span>
                                            <span className="text-accent">{callback.domain}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {!isMsf && (
                            <div className="text-right hidden md:block">
                                <div className="text-[11px] text-signal uppercase tracking-[0.25em]">Last Seen</div>
                                <div className="text-signal font-mono text-sm"><RelativeTime value={callback.last_checkin} /></div>
                            </div>
                        )}
                        {/* Callback action menu — Mythic only */}
                        {!isMsf && <div ref={cbMenuRef}>
                            <button
                                onClick={(e) => {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                    setShowCallbackMenu(m => !m);
                                }}
                                className="p-2 rounded text-signal hover:text-accent hover:bg-signal/10 transition-colors"
                                title="Callback Actions"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                            {showCallbackMenu && createPortal(
                                <div ref={menuContentRef} className="w-56 bg-[#0a0a0a] border border-signal/30 shadow-[0_0_20px_rgba(74,222,128,0.15)] z-[9999] py-1"
                                    style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}>
                                    <div className="px-3 py-1.5 text-[10px] font-mono text-gray-600 uppercase tracking-widest border-b border-white/10 mb-1">
                                        CALLBACK_{callback.display_id} ACTIONS
                                    </div>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-signal/10 hover:text-signal transition-colors"
                                        onClick={() => {
                                            lockCallback({ variables: { callback_display_id: callback.display_id, locked: !callback.locked } });
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        {callback.locked ? <><Unlock size={13} className="text-yellow-400" /> Unlock Callback</> : <><Lock size={13} className="text-red-400" /> Lock Callback</>}
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-signal/10 hover:text-signal transition-colors"
                                        onClick={() => {
                                            setDescValue(callback.description || '');
                                            setDescEditOpen(true);
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        <MessageSquare size={13} className="text-blue-400" /> Edit Description
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-signal/10 hover:text-signal transition-colors"
                                        onClick={() => {
                                            setShowEventingDialog(true);
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        <Zap size={13} className="text-purple-400" /> Trigger Eventing
                                    </button>
                                    <div className="border-t border-white/10 my-1" />
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-red-500/10 hover:text-red-400 transition-colors text-orange-500/80"
                                        onClick={() => {
                                            handleExitCallback();
                                            setShowCallbackMenu(false);
                                        }}
                                    >
                                        <XCircle size={13} /> Exit Callback
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left font-mono hover:bg-red-500/10 hover:text-red-400 transition-colors text-red-500/70"
                                        onClick={() => {
                                            if (window.confirm(`Hide callback ${callback.display_id}? You can re-show it from the callbacks page.`)) {
                                                hideCallback({ variables: { callback_display_id: callback.display_id, active: false } });
                                                setShowCallbackMenu(false);
                                            }
                                        }}
                                    >
                                        <EyeOff size={13} /> Hide Callback
                                    </button>
                                </div>,
                                document.body
                            )}
                        </div>}
                    </div>
                </header>

                {/* Description edit — accordion below header (Mythic only) */}
                <AnimatePresence>
                {!isMsf && descEditOpen && (
                    <motion.div
                        className="overflow-hidden shrink-0"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="border-b border-signal/20 bg-black/50 px-5 pt-3 pb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-[3px] h-3.5 bg-signal inline-block" />
                                <span className="font-mono text-[10px] font-bold text-signal tracking-widest uppercase">Edit Description</span>
                            </div>
                            <textarea
                                value={descValue}
                                onChange={e => setDescValue(e.target.value)}
                                rows={3}
                                className="w-full bg-black/60 border border-gray-700 focus:border-signal px-3 py-2 text-white font-mono text-sm resize-y outline-none transition-colors"
                                placeholder="Enter description..."
                                autoFocus
                            />
                            <div className="flex justify-end gap-3 mt-3">
                                <button onClick={() => setDescEditOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs transition-colors">CANCEL</button>
                                <button
                                    onClick={() => {
                                        updateDescription({ variables: { callback_display_id: callback.display_id, description: descValue } });
                                        setDescEditOpen(false);
                                    }}
                                    className="px-5 py-2 bg-signal text-black font-mono text-xs font-bold hover:bg-white transition-colors"
                                >
                                    SAVE
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>

                {/* Main Content */}
                <div className="flex-1 p-3 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0 overflow-hidden">
                    <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
                        {isMsf ? (
                            <ConsoleTerminal
                                agentMode="msf"
                                msfSessionId={msfSessionId}
                                msfSessionType={msfSession?.type || 'meterpreter'}
                                msfConnectionLost={msfConnectionLost}
                                // Mythic-shaped scalars are required by the prop type; for MSF
                                // they're inert (all Apollo hooks are skipped). We derive a
                                // stable numeric identity from the session id so any local
                                // caches keyed by callbackId stay distinct between sessions.
                                callbackId={MSF_DISPLAY_ID_OFFSET + (parseInt(msfSessionId, 10) || 0)}
                                callbackDbId={-1}
                                callbackUUID={`msf-${msfSessionId}`}
                                payloadtypeName={msfSession?.type === 'meterpreter' ? 'METERPRETER' : 'MSF_SHELL'}
                                payloadtypeId={0}
                                callbackOs={msfSession?.platform || ''}
                                operationId={0}
                                callbackHost={msfSession ? pickMsfHost(msfSession) : ''}
                                callbackActive={!msfConnectionLost}
                                callbackLastCheckin={new Date().toISOString()}
                                callbackSleepInfo={null}
                            />
                        ) : (
                            <ConsoleTerminal
                                callbackId={callback.display_id}
                                callbackDbId={callback.id}
                                callbackUUID={callback.agent_callback_id}
                                payloadtypeName={callback.payload?.payloadtype?.name || ''}
                                payloadtypeId={callback.payload?.payloadtype?.id || 0}
                                callbackOs={callback.os || ''}
                                operationId={callback.operation_id || 0}
                                callbackHost={callback.host || ''}
                                callbackActive={!!callback.active}
                                callbackLastCheckin={callback.last_checkin || null}
                                callbackSleepInfo={callback.sleep_info || null}
                            />
                        )}
                    </div>

                    <div className="flex flex-col bg-machine/30 border border-signal/15 min-h-0 rounded-md overflow-hidden">
                        {/* Tabs — adapt to agent type */}
                        <div className="flex border-b border-signal/15 shrink-0">
                            {(isMsf
                                ? [
                                    { id: 'info' as const,      label: 'INFO',  icon: Info,     enabled: true },
                                    { id: 'files' as const,     label: 'FILES', icon: Folder,   enabled: msfSession?.type === 'meterpreter' },
                                    { id: 'processes' as const, label: 'PROCS', icon: Activity, enabled: msfSession?.type === 'meterpreter' },
                                ]
                                : [
                                    { id: 'info' as const,      label: 'INFO',  icon: Info,     enabled: true },
                                    { id: 'files' as const,     label: 'FILES', icon: Folder,   enabled: true },
                                    { id: 'processes' as const, label: 'PROCS', icon: Activity, enabled: true },
                                ]
                            ).map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => tab.enabled && setActiveTab(tab.id)}
                                    disabled={!tab.enabled}
                                    className={cn(
                                        'flex-1 py-3 text-xs font-bold tracking-[0.25em] flex items-center justify-center gap-2 transition-colors duration-200',
                                        activeTab === tab.id
                                            ? 'bg-signal text-void'
                                            : 'text-signal hover:bg-signal/10 disabled:opacity-40 disabled:hover:bg-transparent'
                                    )}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-hidden relative">
                            <div className="absolute inset-0 p-3 overflow-hidden flex flex-col">
                                {isMsf ? (
                                    <>
                                        {activeTab === 'info' && (
                                            <MeterpreterInfoPanel
                                                sessionId={msfSessionId}
                                                session={msfSession}
                                                connectionLost={msfConnectionLost}
                                                onKilled={() => {
                                                    closeConsoleTab(`msf-${msfSessionId}`);
                                                    navigate('/callbacks');
                                                }}
                                            />
                                        )}
                                        {activeTab === 'files' && (
                                            <MsfFileBrowserPanel
                                                sessionId={msfSessionId}
                                                session={msfSession}
                                            />
                                        )}
                                        {activeTab === 'processes' && (
                                            <MsfProcessList
                                                sessionId={msfSessionId}
                                                session={msfSession}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {activeTab === 'info' && <InfoPanel callback={callback} allCallbacks={allCallbacks} />}
                                        {activeTab === 'files' && <FileBrowserPanel host={callback.host} callbackId={callback.display_id} />}
                                        {activeTab === 'processes' && <ProcessList host={callback.host} />}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Eventing Trigger Dialog — Mythic only */}
            {!isMsf && showEventingDialog && callback && (
                <MythicDialog fullWidth={true} maxWidth="xl" open={showEventingDialog}
                    onClose={() => setShowEventingDialog(false)}
                    innerDialog={<EventTriggerContextSelectDialog
                        onClose={() => setShowEventingDialog(false)}
                        triggerContext={{ name: "callback_id", value: callback.id }} />}
                />
            )}
        </div>
    );
}
