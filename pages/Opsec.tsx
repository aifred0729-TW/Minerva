import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { motion } from 'framer-motion';
import { GET_OPSEC_QUEUE, REQUEST_OPSEC_BYPASS } from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../lib/utils';
import { Shield, AlertTriangle, RefreshCw, Terminal } from 'lucide-react';

const statusBadge = (text: string, variant: 'warn' | 'ok' | 'info') => {
    const colors = variant === 'warn'
        ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
        : variant === 'ok'
        ? 'bg-green-500/20 text-green-300 border-green-400/50'
        : 'bg-sky-500/20 text-sky-300 border-sky-400/50';
    return <span className={cn('px-2 py-1 rounded text-[10px] uppercase tracking-wider border', colors)}>{text}</span>;
};

const Opsec = () => {
    const { data, loading, error, refetch } = useQuery(GET_OPSEC_QUEUE, { pollInterval: 5000 });
    const [approve] = useMutation(REQUEST_OPSEC_BYPASS, { onCompleted: () => refetch() });
    const [selected, setSelected] = useState<any>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

    const tasks = data?.task || [];

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void flex overflow-hidden transition-colors duration-1000"
        >
            <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />

            <div className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                <div className="p-6 lg:p-12 flex-1 flex flex-col">
                <header className="flex justify-between items-center mb-8 transition-colors duration-1000">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded transition-colors duration-1000">
                            <Shield size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">OPSEC REVIEW QUEUE</h1>
                            <p className="text-xs text-gray-400 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                                PENDING / BYPASS REQUESTS
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="flex items-center gap-2 text-xs px-6 py-3 border border-signal/40 hover:bg-signal/10 rounded transition-colors duration-1000"
                    >
                        <RefreshCw size={12} /> REFRESH
                    </button>
                </header>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto">
                    <div className="bg-black/40 border border-white/10 rounded overflow-auto custom-scrollbar transition-colors duration-1000">
                        <table className="w-full text-xs font-mono text-left border-collapse">
                            <thead className="bg-white/5 text-gray-500 sticky top-0 z-10 backdrop-blur-sm transition-colors duration-1000">
                                <tr>
                                    <th className="p-2 font-normal border-b border-white/10 w-14 transition-colors duration-1000">ID</th>
                                    <th className="p-2 font-normal border-b border-white/10 transition-colors duration-1000">CMD</th>
                                    <th className="p-2 font-normal border-b border-white/10 transition-colors duration-1000">CALLBACK</th>
                                    <th className="p-2 font-normal border-b border-white/10 transition-colors duration-1000">OPERATOR</th>
                                    <th className="p-2 font-normal border-b border-white/10 w-24 transition-colors duration-1000">STATUS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading && (
                                    <tr><td colSpan={5} className="p-3 text-gray-500">Loading...</td></tr>
                                )}
                                {error && (
                                    <tr><td colSpan={5} className="p-3 text-red-500">Error: {error.message}</td></tr>
                                )}
                                {!loading && tasks.length === 0 && (
                                    <tr><td colSpan={5} className="p-3 text-gray-500">No pending opsec tasks.</td></tr>
                                )}
                                {tasks.map((t: any) => {
                                    const pre = t.opsec_pre_blocked && !t.opsec_pre_bypassed;
                                    const post = t.opsec_post_blocked && !t.opsec_post_bypassed;
                                    return (
                                        <tr
                                            key={t.id}
                                            className={cn("hover:bg-white/5 cursor-pointer", selected?.id === t.id ? "bg-white/10" : "")}
                                            onClick={() => setSelected(t)}
                                        >
                                            <td className="p-2 text-signal font-bold transition-colors duration-1000">{t.display_id}</td>
                                            <td className="p-2 text-white truncate" title={t.display_params}>
                                                {t.command_name} {t.display_params}
                                            </td>
                                            <td className="p-2 text-gray-300">
                                                #{t.callback?.display_id} {t.callback?.user}@{t.callback?.host}
                                            </td>
                                            <td className="p-2 text-gray-400">{t.operator?.username || "-"}</td>
                                            <td className="p-2">
                                                {pre && statusBadge("pre-blocked", "warn")}
                                                {post && !pre && statusBadge("post-blocked", "warn")}
                                                {!pre && !post && statusBadge("ok", "ok")}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded p-4 text-xs text-gray-200 space-y-3 overflow-auto transition-colors duration-1000">
                        <div className="text-signal font-bold text-sm flex items-center gap-2 transition-colors duration-1000">
                            <AlertTriangle size={14} /> DETAIL
                        </div>
                        {!selected && (
                            <div className="text-gray-500">Select a task from the list.</div>
                        )}
                        {selected && (
                            <>
                                <div><span className="text-gray-500">Task:</span> #{selected.display_id} {selected.command_name} {selected.display_params}</div>
                                <div><span className="text-gray-500">Callback:</span> #{selected.callback?.display_id} {selected.callback?.user}@{selected.callback?.host}</div>
                                <div><span className="text-gray-500">Operator:</span> {selected.operator?.username || "-"}</div>
                                <div className="space-y-2">
                                    {selected.opsec_pre_blocked && !selected.opsec_pre_bypassed && (
                                        <div className="p-2 bg-amber-500/10 border border-amber-400/30 rounded">
                                            <div className="text-amber-300 font-bold">Pre-Check Blocked</div>
                                            <div className="whitespace-pre-wrap text-gray-200">{selected.opsec_pre_message || "No message"}</div>
                                        </div>
                                    )}
                                    {selected.opsec_post_blocked && !selected.opsec_post_bypassed && (
                                        <div className="p-2 bg-amber-500/10 border border-amber-400/30 rounded">
                                            <div className="text-amber-300 font-bold">Post-Check Blocked</div>
                                            <div className="whitespace-pre-wrap text-gray-200">{selected.opsec_post_message || "No message"}</div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => approve({ variables: { task_id: selected.id } })}
                                        className="px-3 py-2 bg-signal/20 border border-signal/40 rounded text-signal hover:bg-signal/30 transition-colors duration-1000"
                                    >
                                        Request Bypass / Approve
                                    </button>
                                    <button
                                        onClick={() => refetch()}
                                        className="px-3 py-2 bg-white/5 border border-white/20 rounded text-gray-200 hover:bg-white/10 transition-colors"
                                    >
                                        Refresh
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Opsec;
