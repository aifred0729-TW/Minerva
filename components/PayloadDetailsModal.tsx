import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Terminal, Activity, Server, Hash, Calendar, Disc, Cpu, Layers, User, Command, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn, b64DecodeUnicode } from '../lib/utils';

interface PayloadDetailsModalProps {
    payload: any;
    onClose: () => void;
    isOpen: boolean;
    initialTab?: string;
}

export function PayloadDetailsModal({ payload, onClose, isOpen, initialTab = 'overview' }: PayloadDetailsModalProps) {
    const [activeTab, setActiveTab] = useState(initialTab);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    if (!payload) return null;

    const filename = payload.filemetum?.filename_text ? b64DecodeUnicode(payload.filemetum.filename_text) : (payload.uuid || "UNKNOWN_FILE");

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4"
                    >
                         {/* Modal Window */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-6xl h-[90vh] bg-void border border-signal/50 shadow-[0_0_50px_rgba(34,197,94,0.2)] flex flex-col relative overflow-hidden rounded-lg"
                        >
                             {/* Decorative Corner Effects */}
                             <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-signal rounded-tl-lg pointer-events-none" />
                             <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-signal rounded-br-lg pointer-events-none" />

                            {/* Header */}
                            <div className="p-8 border-b border-ghost/30 bg-black/40 shrink-0 flex justify-between items-start relative z-10">
                                <div className="flex items-center gap-6">
                                     <div className={cn("p-4 border rounded-xl", 
                                        payload.build_phase === 'success' ? "border-green-500 bg-green-500/10 text-green-400" : 
                                        payload.build_phase === 'error' ? "border-red-500 bg-red-500/10 text-red-400" : 
                                        "border-yellow-500 bg-yellow-500/10 text-yellow-400 animate-pulse"
                                     )}>
                                        <Disc size={32} />
                                     </div>
                                     <div>
                                        <div className="text-sm font-mono text-gray-500 mb-1 flex items-center gap-3">
                                            <span>UUID: {payload.uuid}</span>
                                            <span className="text-gray-700">|</span>
                                            <span className="text-signal">PAYLOAD_ARTIFACT</span>
                                        </div>
                                        <h2 className="text-3xl font-bold font-mono text-signal tracking-wide break-all line-clamp-1" title={filename}>
                                            {filename}
                                        </h2>
                                     </div>
                                </div>
                                
                                <div className="flex items-center gap-6">
                                     <div className="flex flex-col items-end gap-2 text-sm font-mono">
                                        <div className={cn("flex items-center gap-2 px-3 py-1 rounded bg-black/50 border border-gray-800", 
                                            payload.build_phase === 'success' ? "text-green-400 border-green-900" : 
                                            payload.build_phase === 'error' ? "text-red-400 border-red-900" : 
                                            "text-yellow-400 border-yellow-900"
                                        )}>
                                            <Activity size={14} /> BUILD_{payload.build_phase.toUpperCase()}
                                        </div>
                                     </div>
                                     <button onClick={onClose} className="p-3 hover:bg-red-500/20 hover:text-red-500 text-gray-500 transition-all rounded-full border border-transparent hover:border-red-500/50">
                                        <X size={28} />
                                    </button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-ghost/30 bg-black/60 text-sm font-mono shrink-0 px-8 pt-2 gap-2">
                                <button 
                                    onClick={() => setActiveTab('overview')}
                                    className={cn("px-8 py-4 transition-colors border-t-2 border-x border-b-0 rounded-t-lg relative top-[1px]", activeTab === 'overview' ? "border-signal bg-void text-signal font-bold" : "border-transparent bg-transparent text-gray-500 hover:text-gray-300")}
                                >
                                    OVERVIEW
                                </button>
                                <button 
                                    onClick={() => setActiveTab('config')}
                                    className={cn("px-8 py-4 transition-colors border-t-2 border-x border-b-0 rounded-t-lg relative top-[1px]", activeTab === 'config' ? "border-signal bg-void text-signal font-bold" : "border-transparent bg-transparent text-gray-500 hover:text-gray-300")}
                                >
                                    CONFIGURATION
                                </button>
                                <button 
                                    onClick={() => setActiveTab('build')}
                                    className={cn("px-8 py-4 transition-colors border-t-2 border-x border-b-0 rounded-t-lg relative top-[1px]", activeTab === 'build' ? "border-signal bg-void text-signal font-bold" : "border-transparent bg-transparent text-gray-500 hover:text-gray-300")}
                                >
                                    BUILD_LOGS
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden relative bg-void/50 p-8 flex flex-col">
                                {activeTab === 'overview' && (
                                    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300 h-full overflow-y-auto custom-scrollbar pr-2">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {/* Left Column: Metadata */}
                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <label className="text-sm font-mono text-gray-400 flex items-center gap-2 font-bold tracking-wider"><FileText size={16}/> DESCRIPTION</label>
                                                    <div className="p-4 border border-gray-800 bg-black/40 text-base text-gray-300 leading-relaxed font-mono rounded-lg">
                                                        {payload.description || "No description provided."}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1 flex items-center gap-2"><Cpu size={12}/> AGENT_TYPE</label>
                                                        <div className="text-signal font-mono font-bold text-lg">{payload.payloadtype?.name}</div>
                                                    </div>
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1 flex items-center gap-2"><Layers size={12}/> OS_TARGET</label>
                                                        <div className="text-signal font-mono font-bold text-lg">{payload.os}</div>
                                                    </div>
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1 flex items-center gap-2"><Calendar size={12}/> CREATED_AT</label>
                                                        <div className="text-gray-300 font-mono text-xs">{new Date(payload.creation_time).toLocaleString()}</div>
                                                    </div>
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1 flex items-center gap-2"><Hash size={12}/> FILE_SIZE</label>
                                                        <div className="text-gray-300 font-mono text-xs">{payload.filemetum?.size ? `${(payload.filemetum.size / 1024).toFixed(2)} KB` : "N/A"}</div>
                                                    </div>
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1 flex items-center gap-2"><User size={12}/> CREATOR</label>
                                                        <div className="text-gray-300 font-mono text-xs">{payload.operator?.username || "Unknown"}</div>
                                                    </div>
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1 flex items-center gap-2"><Activity size={12}/> CALLBACKS</label>
                                                        <div className="text-gray-300 font-mono text-xs">{payload.callback_allowed ? "ALLOWED" : "DISALLOWED"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Right Column: Hashes & C2 & Commands */}
                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <label className="text-sm font-mono text-gray-400 flex items-center gap-2 font-bold tracking-wider"><Hash size={16}/> INTEGRITY_HASHES</label>
                                                    <div className="space-y-2">
                                                        <div className="p-3 bg-black/30 border border-gray-800 rounded group">
                                                            <div className="text-[10px] text-gray-500 font-mono mb-1">MD5</div>
                                                            <div className="font-mono text-xs text-signal break-all select-all">{payload.filemetum?.md5 || "PENDING"}</div>
                                                        </div>
                                                        <div className="p-3 bg-black/30 border border-gray-800 rounded group">
                                                            <div className="text-[10px] text-gray-500 font-mono mb-1">SHA1</div>
                                                            <div className="font-mono text-xs text-signal break-all select-all">{payload.filemetum?.sha1 || "PENDING"}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="text-sm font-mono text-gray-400 flex items-center gap-2 font-bold tracking-wider"><Server size={16}/> C2_PROFILES</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {payload.payloadc2profiles?.map((pc: any) => (
                                                            <div key={pc.c2profile.name} className={cn(
                                                                "px-3 py-2 rounded border flex items-center gap-2 text-xs font-mono",
                                                                pc.c2profile.running ? "bg-green-900/20 border-green-500/30 text-green-400" : "bg-red-900/20 border-red-500/30 text-red-400"
                                                            )}>
                                                                <div className={cn("w-2 h-2 rounded-full", pc.c2profile.running ? "bg-green-500" : "bg-red-500")} />
                                                                {pc.c2profile.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="text-sm font-mono text-gray-400 flex items-center gap-2 font-bold tracking-wider"><Command size={16}/> INCLUDED_COMMANDS ({payload.payloadcommands?.length || 0})</label>
                                                    <div className="flex flex-wrap gap-1 max-h-[150px] overflow-y-auto custom-scrollbar p-2 border border-gray-800 bg-black/20 rounded">
                                                        {payload.payloadcommands?.map((pc: any) => (
                                                            <span key={pc.command.cmd} className="px-2 py-1 bg-white/5 border border-gray-700 text-[10px] font-mono text-gray-300 rounded">
                                                                {pc.command.cmd}
                                                            </span>
                                                        ))}
                                                        {(!payload.payloadcommands || payload.payloadcommands.length === 0) && (
                                                            <span className="text-gray-500 text-xs italic">NO_COMMANDS_FOUND</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'config' && (
                                    <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-gray-700 bg-white/5">
                                                    <th className="p-4 text-xs font-mono text-gray-400 w-1/3">PARAMETER</th>
                                                    <th className="p-4 text-xs font-mono text-gray-400">VALUE</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payload.buildparameterinstances?.map((param: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-gray-800 hover:bg-white/5 transition-colors">
                                                        <td className="p-4">
                                                            <div className="text-sm font-mono text-signal font-bold">{param.buildparameter.name}</div>
                                                            <div className="text-xs text-gray-500">{param.buildparameter.description}</div>
                                                        </td>
                                                        <td className="p-4 font-mono text-sm text-gray-300 break-all">
                                                            {String(param.value)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!payload.buildparameterinstances || payload.buildparameterinstances.length === 0) && (
                                                    <tr>
                                                        <td colSpan={2} className="p-8 text-center text-gray-500 font-mono text-sm italic">
                                                            NO_BUILD_PARAMETERS_CONFIGURED
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {activeTab === 'build' && (
                                    <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
                                        {/* Build Steps Timeline */}
                                        {payload.payload_build_steps && payload.payload_build_steps.length > 0 ? (
                                            <div className="mb-6 space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar border-b border-gray-800 pb-4">
                                                {payload.payload_build_steps.map((step: any) => (
                                                    <div key={step.step_number} className="flex items-start gap-4 p-2 hover:bg-white/5 rounded">
                                                        <div className={cn(
                                                            "mt-1 w-2 h-2 rounded-full shrink-0",
                                                            step.step_success ? "bg-green-500" : step.step_skip ? "bg-gray-500" : "bg-red-500"
                                                        )} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className={cn("font-bold font-mono text-sm", step.step_success ? "text-green-400" : step.step_skip ? "text-gray-400" : "text-red-400")}>
                                                                    {step.step_name}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                                                                    <Clock size={10} /> {new Date(step.start_time).toLocaleTimeString()}
                                                                </span>
                                                            </div>
                                                            {(step.step_stdout || step.step_stderr) && (
                                                                <div className="bg-black/50 p-2 rounded border border-gray-800 font-mono text-[10px] text-gray-400 whitespace-pre-wrap">
                                                                    {step.step_stdout}
                                                                    {step.step_stderr && <span className="text-red-400 block mt-1">{step.step_stderr}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center text-gray-500 font-mono text-sm border-b border-gray-800 mb-4">
                                                NO_DETAILED_BUILD_STEPS_RECORDED
                                            </div>
                                        )}

                                        {/* Raw Logs */}
                                        <div className="flex-1 bg-black border border-gray-800 p-6 font-mono text-xs text-gray-300 overflow-y-auto custom-scrollbar whitespace-pre-wrap rounded-lg shadow-inner">
                                            <div className="mb-2 text-gray-500 font-bold border-b border-gray-800 pb-1">RAW_OUTPUT_STREAM</div>
                                            {payload.build_message}
                                            {payload.build_stdout && (
                                                <>
                                                    <br/><br/>
                                                    <span className="text-green-500">=== STDOUT ===</span>
                                                    <br/>
                                                    {payload.build_stdout}
                                                </>
                                            )}
                                            {payload.build_stderr && (
                                                <>
                                                    <br/><br/>
                                                    <span className="text-red-500">=== STDERR ===</span>
                                                    <br/>
                                                    {payload.build_stderr}
                                                </>
                                            )}
                                            {!payload.build_message && !payload.build_stdout && !payload.build_stderr && (
                                                <span className="text-gray-600 italic">No raw output available.</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
