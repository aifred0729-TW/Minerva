import React, { useState, useEffect } from 'react';
import { useMutation, useLazyQuery } from '@apollo/client';
import { GET_PROFILE_CONFIG, GET_PROFILE_OUTPUT, SET_PROFILE_CONFIG, START_STOP_PROFILE_MUTATION } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, Activity, FileText, Terminal, Save, Power, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface C2DetailsModalProps {
    profile: any;
    onClose: () => void;
    isOpen: boolean;
}

export function C2DetailsModal({ profile, onClose, isOpen }: C2DetailsModalProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'console'>('overview');
    const [configContent, setConfigContent] = useState('');
    const [consoleOutput, setConsoleOutput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Actions
    const [startStopProfile, { loading: toggling }] = useMutation(START_STOP_PROFILE_MUTATION);
    
    const [fetchConfig, { data: configData, loading: configLoading }] = useLazyQuery(GET_PROFILE_CONFIG, {
        fetchPolicy: "network-only"
    });

    const [fetchOutput, { data: outputData, loading: outputLoading }] = useLazyQuery(GET_PROFILE_OUTPUT, {
        fetchPolicy: "network-only"
    });

    const [saveConfig] = useMutation(SET_PROFILE_CONFIG);

    // Initial Fetch when tab changes or profile opens
    useEffect(() => {
        if (isOpen && profile) {
            if (activeTab === 'config') {
                fetchConfig({ variables: { container_name: profile.name, filename: "config.json" } });
            } else if (activeTab === 'console') {
                fetchOutput({ variables: { id: profile.id } });
            }
        }
    }, [activeTab, isOpen, profile, fetchConfig, fetchOutput]);

    // Update state when data arrives
    useEffect(() => {
        if (configData?.containerDownloadFile?.data) {
            try {
                setConfigContent(atob(configData.containerDownloadFile.data));
            } catch(e) {
                setConfigContent("Error decoding config file.");
            }
        }
    }, [configData]);

    useEffect(() => {
        if (outputData?.getProfileOutput) {
            setConsoleOutput(outputData.getProfileOutput.output || outputData.getProfileOutput.error || "No output.");
        }
    }, [outputData]);

    const handleSaveConfig = async () => {
        setIsSaving(true);
        try {
            const encoded = btoa(configContent);
            await saveConfig({
                variables: {
                    container_name: profile.name,
                    file_path: "config.json",
                    data: encoded
                }
            });
        } catch (e) {
            console.error("Failed to save config", e);
        }
        setIsSaving(false);
    };

    const handleToggle = async () => {
        if (!profile) return;
        try {
             await startStopProfile({
                variables: {
                    id: profile.id,
                    action: profile.running ? "stop" : "start"
                }
            });
            // Refetch output after toggle to show result
            setTimeout(() => {
                if (activeTab === 'console') fetchOutput({ variables: { id: profile.id } });
            }, 1000);
        } catch (e) {
            console.error(e);
        }
    };

    if (!profile) return null;

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
                            className="w-full max-w-5xl h-[85vh] bg-void border border-signal/50 shadow-[0_0_50px_rgba(34,197,94,0.2)] flex flex-col relative overflow-hidden rounded-lg"
                        >
                             {/* Decorative Corner Effects */}
                             <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-signal rounded-tl-lg pointer-events-none" />
                             <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-signal rounded-br-lg pointer-events-none" />

                            {/* Header */}
                            <div className="p-8 border-b border-ghost/30 bg-black/40 shrink-0 flex justify-between items-start relative z-10">
                                <div className="flex items-center gap-6">
                                     <div className={cn("p-4 border rounded-xl", profile.running ? "border-green-500 bg-green-500/10 text-green-400" : "border-red-500 bg-red-500/10 text-red-400")}>
                                        <Server size={32} />
                                     </div>
                                     <div>
                                        <div className="text-sm font-mono text-gray-500 mb-1 flex items-center gap-3">
                                            <span>SYSTEM_ID: {profile.id.toString().padStart(4, '0')}</span>
                                            <span className="text-gray-700">|</span>
                                            <span className="text-signal">SECURE_CHANNEL</span>
                                        </div>
                                        <h2 className="text-4xl font-bold font-mono text-signal tracking-wide uppercase">{profile.name}</h2>
                                     </div>
                                </div>
                                
                                <div className="flex items-center gap-6">
                                     <div className="flex flex-col items-end gap-2 text-sm font-mono">
                                        <div className={cn("flex items-center gap-2 px-3 py-1 rounded bg-black/50 border border-gray-800", profile.running ? "text-green-400 border-green-900" : "text-red-400 border-red-900")}>
                                            <Activity size={14} /> SERVER_{profile.running ? "ONLINE" : "OFFLINE"}
                                        </div>
                                        <div className={cn("flex items-center gap-2 px-3 py-1 rounded bg-black/50 border border-gray-800", profile.container_running ? "text-blue-400 border-blue-900" : "text-gray-400")}>
                                            <Activity size={14} /> CONTAINER_{profile.container_running ? "READY" : "STOPPED"}
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
                                    onClick={() => setActiveTab('console')}
                                    className={cn("px-8 py-4 transition-colors border-t-2 border-x border-b-0 rounded-t-lg relative top-[1px]", activeTab === 'console' ? "border-signal bg-void text-signal font-bold" : "border-transparent bg-transparent text-gray-500 hover:text-gray-300")}
                                >
                                    TERMINAL
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden relative bg-void/50 p-8 flex flex-col">
                                {activeTab === 'overview' && (
                                    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300 h-full overflow-y-auto cyber-scrollbar pr-2">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                            {/* Left Column: Description */}
                                            <div className="lg:col-span-2 space-y-3">
                                                <label className="text-sm font-mono text-gray-400 flex items-center gap-2 font-bold tracking-wider"><FileText size={16}/> CHANNEL_DESCRIPTION</label>
                                                <div className="p-6 border border-gray-800 bg-black/40 text-base text-gray-300 leading-relaxed font-mono rounded-lg min-h-[160px]">
                                                    {profile.description || "No description provided."}
                                                </div>
                                            </div>
                                            
                                            {/* Right Column: Metadata */}
                                            <div className="space-y-6">
                                                <div className="space-y-4">
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1">AUTHOR</label>
                                                        <div className="text-signal font-mono font-bold text-lg">{profile.author}</div>
                                                    </div>
                                                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                        <label className="text-xs font-mono text-gray-500 block mb-1">VERSION</label>
                                                        <div className="text-signal font-mono font-bold text-lg">v{profile.semver}</div>
                                                    </div>
                                                </div>
                                                
                                                <div className="p-4 bg-black/30 border border-gray-800 rounded-lg">
                                                     <label className="text-xs font-mono text-gray-500 block mb-3">SUPPORTED_ARCHITECTURES</label>
                                                     <div className="flex flex-wrap gap-2">
                                                        {profile.payloadtypec2profiles?.map((pt: any) => (
                                                            <span key={pt.payloadtype.name} className="px-3 py-1.5 bg-signal/10 border border-signal/30 text-xs font-mono text-signal rounded hover:bg-signal/20 transition-colors cursor-default">
                                                                {pt.payloadtype.name}
                                                            </span>
                                                        ))}
                                                        {(!profile.payloadtypec2profiles || profile.payloadtypec2profiles.length === 0) && (
                                                            <span className="text-gray-600 text-xs italic">NONE_DETECTED</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-800 pt-8 mt-4">
                                             <label className="text-sm font-mono text-gray-400 mb-4 block font-bold tracking-wider">SYSTEM_CONTROLS</label>
                                             <div className="flex gap-6">
                                                 <button
                                                    onClick={handleToggle}
                                                    disabled={toggling}
                                                    className={cn(
                                                        "flex-1 py-5 font-bold font-mono text-lg flex items-center justify-center gap-4 transition-all border rounded-xl group overflow-hidden relative shadow-lg",
                                                        profile.running 
                                                            ? "border-red-500/50 bg-red-900/20 text-red-400 hover:bg-red-500 hover:text-white hover:shadow-red-500/20" 
                                                            : "border-green-500/50 bg-green-900/20 text-green-400 hover:bg-green-500 hover:text-white hover:shadow-green-500/20"
                                                    )}
                                                >
                                                    <div className={cn("absolute inset-0 opacity-10 transition-transform duration-700 group-hover:scale-110", profile.running ? "bg-red-500" : "bg-green-500")} />
                                                    {toggling ? (
                                                        <><RefreshCw className="animate-spin" size={24} /> PROCESSING_SEQUENCE...</>
                                                    ) : (
                                                        <><Power size={24} /> {profile.running ? "TERMINATE_SERVICE" : "INITIALIZE_SERVICE"}</>
                                                    )}
                                                </button>
                                             </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'config' && (
                                    <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
                                        <div className="flex justify-between items-center mb-4 px-1">
                                            <div className="text-sm font-mono text-gray-400 flex items-center gap-2">
                                                <FileText size={16} /> /etc/c2_profiles/{profile.name}/config.json
                                            </div>
                                            <button 
                                                onClick={handleSaveConfig}
                                                disabled={isSaving || configLoading}
                                                className="px-6 py-2.5 bg-signal text-void font-bold text-sm font-mono flex items-center gap-2 hover:bg-white disabled:opacity-50 rounded transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                                            >
                                                {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                                                COMMIT_CHANGES
                                            </button>
                                        </div>
                                        <div className="flex-1 relative rounded-lg overflow-hidden border border-gray-700 bg-black/50 shadow-inner">
                                            {configLoading ? (
                                                <div className="absolute inset-0 flex items-center justify-center text-signal gap-3 bg-black/80 z-10 font-mono text-lg">
                                                    <RefreshCw className="animate-spin" size={24} /> DECRYPTING_CONFIG...
                                                </div>
                                            ) : (
                                                <textarea 
                                                    value={configContent}
                                                    onChange={(e) => setConfigContent(e.target.value)}
                                                    className="w-full h-full bg-transparent text-green-400 font-mono text-sm p-6 focus:outline-none resize-none cyber-scrollbar leading-relaxed"
                                                    spellCheck={false}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'console' && (
                                    <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
                                        <div className="flex justify-between items-center mb-4 px-1">
                                            <div className="text-sm font-mono text-gray-400 flex items-center gap-2">
                                                <Terminal size={16} /> LIVE_OUTPUT_STREAM
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => fetchOutput({ variables: { id: profile.id } })}
                                                    className="p-2.5 border border-gray-700 text-gray-400 hover:text-signal hover:border-signal rounded transition-colors"
                                                    title="Refresh Output"
                                                >
                                                    <RefreshCw size={18} className={outputLoading ? "animate-spin" : ""} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 bg-black border border-gray-800 p-6 font-mono text-sm text-gray-300 overflow-y-auto cyber-scrollbar whitespace-pre-wrap rounded-lg shadow-inner">
                                            {outputLoading ? "ESTABLISHING_UPLINK..." : consoleOutput}
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
