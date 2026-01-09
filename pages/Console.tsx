import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useLazyQuery, useMutation } from '@apollo/client';
import { Sidebar } from '../components/Sidebar';
import { GET_CALLBACK_DETAILS, GET_FILE_TREE_ROOT, GET_FILE_TREE_FOLDER, GET_PROCESS_TREE, GET_CALLBACK_TASKS, CREATE_TASK_MUTATION } from '../lib/api';
import { Terminal, Cpu, Folder, FolderOpen, File, Activity, Server, Shield, Clock, Wifi, HardDrive, Command, Play, PlayCircle, List, ArrowRight, User, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

// --- Sub-components ---

// --- Sub-components ---

const TaskBlock = ({ task }: { task: any }) => {
    let time = "---";
    try {
        time = new Date(task.timestamp).toLocaleTimeString();
    } catch(e) {}
    
    let statusColor = "text-yellow-500";
    let borderColor = "border-yellow-500/50";
    
    const status = (task.status || "").toLowerCase();
    
    if (status.includes("error")) {
        statusColor = "text-red-500";
        borderColor = "border-red-500/50";
    } else if (status === "completed" || status === "success") {
        statusColor = "text-signal";
        borderColor = "border-signal/50";
    }

    // Helpers
    const tryParseJSON = (str: string) => {
        try {
            return JSON.parse(str);
        } catch {
            return null;
        }
    };

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes < 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    };

    return (
        <div className={cn("mb-4 border-l-2 pl-4 py-2 bg-white/5 rounded-r transition-all group hover:bg-white/10", borderColor)}>
            {/* Header */}
            <div className="flex items-center gap-2 text-[10px] font-mono mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <span className="text-blue-400 font-bold">{task.operator?.username || "Unknown"}</span>
                <span>@</span>
                <span>CALLBACK {task.display_id}</span>
                <span className="mx-1">|</span>
                <span>{time}</span>
            </div>

            {/* Command Line */}
            <div className="font-mono text-sm text-white font-bold mb-3 flex items-start gap-2">
                <span className="text-signal mt-0.5">$</span>
                <div className="break-all">
                    <span className="text-yellow-200">{task.command_name}</span> 
                    <span className="ml-2 text-gray-300">{task.display_params}</span>
                </div>
            </div>

            {/* Status Bar */}
            <div className={cn("text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-2", statusColor)}>
                {status}
                {status !== "completed" && status !== "success" && !status.includes("error") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>
                )}
            </div>

            {/* Output */}
            <div className="font-mono text-xs text-gray-200 whitespace-pre-wrap break-words bg-black/40 p-3 rounded border border-white/5 shadow-inner select-text space-y-2">
                {task.responses?.map((r: any) => {
                    let content = r.response;
                    try {
                        const clean = content.replace(/\s/g, '');
                        if (clean.length > 0 && clean.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(clean)) {
                            const binary = atob(clean);
                            const bytes = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                            content = new TextDecoder("utf-8").decode(bytes);
                        }
                    } catch(e) {}

                    // Try JSON formatting for file listings
                    const parsed = tryParseJSON(content);
                    // File listing formatting
                    if (parsed && parsed.files && Array.isArray(parsed.files)) {
                        return (
                            <div key={r.id} className="space-y-2">
                                <div className="text-signal font-bold text-xs">
                                    Directory: {parsed.directory || parsed.name || parsed.parent_path || "Unknown"} ({parsed.host || ""})
                                </div>
                                <div className="space-y-1">
                                    {parsed.files.map((f: any, idx: number) => (
                                        <div
                                            key={`${r.id}-${idx}`}
                                            className="grid grid-cols-6 gap-2 bg-white/5 border border-white/10 p-2 rounded"
                                        >
                                            <div className="col-span-2 text-white truncate" title={f.full_name || f.name}>
                                                {f.is_file ? "📄" : "📁"} {f.name}
                                            </div>
                                            <div className="text-gray-400 truncate" title={f.full_name}>{f.full_name}</div>
                                            <div className="text-gray-400">{f.is_file ? formatBytes(f.size) : "-"}</div>
                                            <div className="text-gray-500 truncate" title={f.extended_attributes}>{f.extended_attributes || "-"}</div>
                                            <div className="text-gray-500 truncate" title={f.owner}>{f.owner || "-"}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    // Process list formatting
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.process_id !== undefined) {
                        return (
                            <div key={r.id} className="space-y-1">
                                {parsed.map((p: any, idx: number) => (
                                    <details
                                        key={`${r.id}-proc-${idx}`}
                                        className="bg-white/5 border border-white/10 rounded px-2 py-1"
                                    >
                                        <summary className="flex items-center gap-3 cursor-pointer text-white">
                                            <span className="font-bold truncate">
                                                {p.name || "(unknown)"} (PID {p.process_id}) {p.window_title ? `- ${p.window_title}` : ""}
                                            </span>
                                            <span className="text-xs text-gray-400 truncate">{p.user || ""}</span>
                                            <span className="text-xs text-gray-500">PPID {p.parent_process_id ?? "-"}</span>
                                            <span className="text-xs text-gray-500">IL {p.integrity_level ?? "-"}</span>
                                            <span className="text-xs text-gray-500">{p.architecture || ""}</span>
                                        </summary>
                                        <div className="mt-2 text-xs text-gray-200 space-y-1 break-all">
                                            {p.description && <div><span className="text-gray-500">Desc:</span> {p.description}</div>}
                                            {p.company_name && <div><span className="text-gray-500">Company:</span> {p.company_name}</div>}
                                            {p.signer && <div><span className="text-gray-500">Signer:</span> {p.signer}</div>}
                                            {p.bin_path && <div><span className="text-gray-500">Bin:</span> {p.bin_path}</div>}
                                            {p.command_line && <div><span className="text-gray-500">Cmd:</span> {p.command_line}</div>}
                                            <div className="flex gap-4 text-gray-500">
                                                <span>Session: {p.session_id ?? "-"}</span>
                                                <span>Start: {p.start_time ?? "-"}</span>
                                            </div>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        );
                    }

                    return <div key={r.id} className="mb-1">{content}</div>
                })}
                {(!task.responses || task.responses.length === 0) && (
                    <span className="text-gray-600 italic opacity-50">Waiting for output...</span>
                )}
            </div>
        </div>
    );
};

const ConsoleTerminal = ({ callbackId, callbackUUID }: { callbackId: number, callbackUUID: string }) => {
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [input, setInput] = useState('');
    const [createTask, { loading: tasking }] = useMutation(CREATE_TASK_MUTATION);
    
    // Poll for tasks
    const { data, loading, startPolling, stopPolling } = useQuery(GET_CALLBACK_TASKS, {
        variables: { callback_display_id: callbackId },
        pollInterval: 2000,
        fetchPolicy: "network-only"
    });

    useEffect(() => {
        startPolling(2000);
        return () => stopPolling();
    }, [startPolling, stopPolling]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [data, loading]);

    useEffect(() => {
        // Auto focus input on load
        inputRef.current?.focus();
    }, []);

    const handleSend = async () => {
        if (input.trim() && !tasking) {
            const trimmed = input.trim();
            const firstSpace = trimmed.indexOf(' ');
            let command = trimmed;
            let params = "";
            
            if (firstSpace !== -1) {
                command = trimmed.substring(0, firstSpace);
                params = trimmed.substring(firstSpace + 1);
            }

            try {
                await createTask({
                    variables: {
                        callback_id: callbackId,
                        command,
                        params
                    }
                });
                setInput('');
                inputRef.current?.focus();
            } catch (err) {
                console.error("Tasking failed:", err);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    };

    const tasks = data?.task || [];

    return (
        <div className="flex flex-col h-full bg-black/80 border border-signal/30 font-mono text-sm shadow-[0_0_20px_rgba(34,197,94,0.1)] relative overflow-hidden">
            {/* Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px]"></div>
            
            {/* Header */}
            <div className="bg-signal/10 p-2 border-b border-signal/20 flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-signal" />
                    <span className="text-signal font-bold tracking-wider text-xs">TERMINAL_UPLINK</span>
                </div>
                <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-signal animate-pulse"></div>
                </div>
            </div>

            {/* Output */}
            <div className="flex-1 overflow-auto p-4 space-y-4 custom-scrollbar z-10">
                {tasks.map((task: any) => (
                    <TaskBlock key={task.id} task={task} />
                ))}
                {tasks.length === 0 && !loading && (
                    <div className="text-gray-500 italic opacity-50 text-center mt-10">
                        Session initialized. Ready for input.
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-black border-t border-signal/20 flex items-center gap-2 z-10 shrink-0">
                <span className="text-signal animate-pulse font-bold">$</span>
                <input 
                    ref={inputRef}
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={tasking}
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 font-mono disabled:opacity-50"
                    placeholder={tasking ? "Transmitting..." : "Enter command..."}
                    autoFocus
                />
                <button 
                    onClick={handleSend}
                    disabled={tasking}
                    className="p-1 hover:bg-white/10 rounded text-signal transition-colors disabled:opacity-50"
                >
                    {tasking ? <Activity size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                </button>
            </div>
        </div>
    );
};

const WindowsIcon = () => (
    <svg viewBox="0 0 88 88" className="w-full h-full" fill="currentColor">
        <path d="M0 12.402l35.687-4.86.016 34.423-35.67.203L0 12.402zm35.67 33.529l.028 34.453L.028 75.48.001 46.096l35.67-.165zm4.275-38.35l47.96-6.791.139 38.65-48.067.264-.031-32.123zm.062 36.333l47.996.227-.123 38.835-47.906-6.666.033-32.396z"/>
    </svg>
);
const LinuxIcon = () => (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.5c2.5 0 4.5 2 4.5 4.5S14.5 11.5 12 11.5 7.5 9.5 7.5 7 9.5 2.5 12 2.5zm0 19c-3.5 0-6.5-2-6.5-5.5S8.5 10.5 12 10.5s6.5 2 6.5 5.5-3 12-6.5 12z" /> 
        <path d="M20.057 16.518c.245.545.215 1.17-.082 1.688-.296.518-.832.846-1.428.875-1.127.054-2.185.346-3.136.815-.93.458-1.76.994-2.505 1.583-.346.273-.77.42-1.205.42-.42 0-.83-.138-1.173-.395-.73-.55-1.543-1.05-2.45-1.474-.937-.44-1.98-.71-3.093-.76-.596-.026-1.133-.355-1.43-.873-.298-.518-.328-1.143-.083-1.69.873-1.95 2.38-3.56 4.318-4.57 1.056-.55 2.222-.84 3.408-.84 1.258 0 2.484.324 3.58.945 1.86.99 3.42 2.52 4.28 4.27zM12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z" opacity="0.5"/>
    </svg>
);
const MacOSIcon = () => (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.98 1.07-3.11-1.04.05-2.29.69-3.02 1.55-.65.75-1.21 1.95-1.06 3.04 1.15.09 2.33-.63 3.01-1.48" />
    </svg>
);

const NodePreview = ({ callback }: { callback: any }) => {
    const getOSIcon = (os: string, payloadType: string) => {
        const lowerOS = os?.toLowerCase() || "";
        const lowerType = payloadType?.toLowerCase() || "";
        if (lowerOS.includes("windows") || lowerType.includes("apollo")) return <WindowsIcon />;
        if (lowerOS.includes("linux") || lowerType.includes("poseidon")) return <LinuxIcon />;
        if (lowerOS.includes("mac") || lowerOS.includes("darwin")) return <MacOSIcon />;
        return <Monitor size={24} />;
    };

    return (
        <div className="mt-auto pt-6 border-t border-white/10 flex flex-col items-center pb-4">
             <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-4">NODE_TOPOLOGY_PREVIEW</div>
             <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Hexagon Border */}
                <div className="absolute inset-0 border border-signal/30 bg-signal/5" 
                     style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} 
                />
                
                {/* Inner Hexagon */}
                <div className="absolute inset-2 border border-signal/10" 
                     style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} 
                />
                
                {/* Glow */}
                <div className="absolute inset-0 bg-signal/10 blur-xl rounded-full animate-pulse" />
                
                {/* Icon */}
                <div className="w-12 h-12 text-signal relative z-10 drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]">
                    {getOSIcon(callback.os, callback.payload?.payloadtype?.name)}
                </div>
                
                {/* Hostname Label */}
                <div className="absolute -bottom-4 bg-black/90 border border-signal/50 px-3 py-1 text-[10px] font-mono text-signal shadow-[0_0_10px_rgba(34,197,94,0.3)] whitespace-nowrap z-20">
                    {callback.host}
                </div>
             </div>
        </div>
    );
};

// --- File Browser Logic ---

const FileTreeNode = ({ node, host, level = 0, onContextMenu }: any) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [children, setChildren] = useState<any[]>([]);
    
    const [getFolder, { loading, data }] = useLazyQuery(GET_FILE_TREE_FOLDER, {
        fetchPolicy: 'network-only'
    });

    useEffect(() => {
        if (data?.children) {
            setChildren(data.children);
        }
    }, [data]);

    const handleToggle = async () => {
        if (!node.can_have_children) return;
        
        setIsExpanded(!isExpanded);
        
        if (!isExpanded && children.length === 0) {
            getFolder({
                variables: {
                    parent_path_text: node.full_path_text,
                    host: host
                }
            });
        }
    };

    return (
        <div className="select-none">
            <div 
                className={cn(
                    "flex items-center gap-2 py-1 px-2 hover:bg-white/5 cursor-pointer text-xs font-mono transition-colors border-l border-transparent hover:border-signal/20",
                    isExpanded ? "text-signal" : "text-gray-400"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={handleToggle}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenu?.(e, node);
                }}
            >
                {node.can_have_children ? (
                    isExpanded ? <FolderOpen size={14} className="text-yellow-500" /> : <Folder size={14} className="text-yellow-500/70" />
                ) : (
                    <File size={14} className="text-blue-400/70" />
                )}
                <span className="truncate">{node.name_text || node.filemeta?.filename_text || "Unknown"}</span>
            </div>
            
            {isExpanded && (
                <div className="border-l border-white/5 ml-2">
                    {loading ? (
                        <div className="pl-6 py-1 text-gray-600 text-[10px] animate-pulse flex items-center gap-2">
                            <span className="w-2 h-2 bg-signal/50 rounded-full animate-ping"></span>
                            ACCESSING_DISK...
                        </div>
                    ) : (
                        children.map(child => (
                            <FileTreeNode 
                                key={child.id} 
                                node={child} 
                                host={host}
                                level={level + 1} 
                                onContextMenu={onContextMenu}
                            />
                        ))
                    )}
                    {!loading && children.length === 0 && (
                        <div className="pl-8 py-1 text-gray-600 text-[10px] italic">EMPTY_DIRECTORY</div>
                    )}
                </div>
            )}
        </div>
    );
};

const FileBrowser = ({ host, callbackId }: { host: string, callbackId: number }) => {
    const [menuPos, setMenuPos] = useState<{x:number, y:number} | null>(null);
    const [menuNode, setMenuNode] = useState<any>(null);
    const [createTask] = useMutation(CREATE_TASK_MUTATION);

    const closeMenu = () => {
        setMenuPos(null);
        setMenuNode(null);
    };

    const handleContextMenu = (e: React.MouseEvent, node: any) => {
        e.preventDefault();
        e.stopPropagation();
        // Use page coordinates so it isn't clipped by scroll containers
        setMenuPos({ x: e.pageX, y: e.pageY });
        setMenuNode(node);
    };

    const { data, loading, error, refetch } = useQuery(GET_FILE_TREE_ROOT, {
        variables: { host: host }
    });

    const runTask = async (command: string, params: string) => {
        try {
            await createTask({
                variables: {
                    callback_id: callbackId,
                    command,
                    params,
                }
            });
        } catch (e) {
            console.error("Tasking failed:", e);
        } finally {
            closeMenu();
        }
    };

    if (loading) return <div className="p-4 text-gray-500 animate-pulse font-mono text-xs flex items-center justify-center h-full">INITIALIZING_VFS...</div>;
    if (error) return <div className="p-4 text-red-500 font-mono text-xs">VFS_ERROR: {error.message}</div>;

    const files = data?.mythictree || [];

    if (files.length === 0) {
        return (
             <div className="h-full p-4 text-gray-400 font-mono text-xs flex flex-col items-center justify-center border border-dashed border-gray-700 bg-black/20">
                <Folder size={32} className="mb-2 opacity-50 text-yellow-500" />
                <p className="text-lg text-signal">NO_FILE_SYSTEM_DATA</p>
                <p className="text-[10px] text-gray-500 mt-2 text-center max-w-xs">
                    No file listing found for this host. Execute <span className="text-white font-bold">ls</span> command in the terminal to populate the VFS.
                </p>
                <button 
                    onClick={() => refetch()}
                    className="mt-6 px-4 py-2 bg-signal/10 hover:bg-signal/20 border border-signal/30 text-signal rounded transition-all flex items-center gap-2 text-xs"
                >
                    <Activity size={12} className="animate-spin-slow" />
                    REFRESH_VIEW
                </button>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto custom-scrollbar pr-2 relative" onClick={closeMenu} onContextMenu={(e)=>e.preventDefault()}>
            {files.map((node: any) => (
                                <FileTreeNode key={node.id} node={node} host={host} onContextMenu={handleContextMenu} />
            ))}

            {menuPos && menuNode && (
                <div
                    className="fixed z-50 bg-black/95 border border-signal/40 rounded shadow-lg text-xs font-mono text-white"
                    style={{ top: menuPos.y, left: menuPos.x, minWidth: 160 }}
                    onClick={(e)=>e.stopPropagation()}
                >
                    <div className="px-3 py-2 border-b border-white/10">
                        {menuNode.name_text || menuNode.filemeta?.filename_text || "item"}
                    </div>
                    <button
                        className="w-full text-left px-3 py-2 hover:bg-white/10"
                        onClick={() => runTask("ls", menuNode.full_path_text || menuNode.name_text || "")}
                    >
                        ls
                    </button>
                    {!menuNode.can_have_children && (
                        <button
                            className="w-full text-left px-3 py-2 hover:bg-white/10"
                            onClick={() => runTask("download", menuNode.full_name || menuNode.name_text || "")}
                        >
                            download
                        </button>
                    )}
                    <button
                        className="w-full text-left px-3 py-2 hover:bg-white/10"
                        onClick={() => runTask("upload", menuNode.full_path_text || menuNode.name_text || "")}
                    >
                        upload
                    </button>
                </div>
            )}
        </div>
    );
};

const ProcessList = ({ host }: { host: string }) => {
    const [expanded, setExpanded] = useState<number | null>(null);
    const { data, loading, error, refetch } = useQuery(GET_PROCESS_TREE, {
        variables: { host },
        pollInterval: 10000
    });

    if (loading) return <div className="p-4 text-gray-500 animate-pulse font-mono text-xs flex items-center justify-center h-full">SCANNING_PROCESS_MEMORY...</div>;
    if (error) return <div className="p-4 text-red-500 font-mono text-xs">PROC_ERROR: {error.message}</div>;

    const processes = data?.mythictree || [];

    if (processes.length === 0) {
        return (
             <div className="h-full p-4 text-gray-400 font-mono text-xs flex flex-col items-center justify-center border border-dashed border-gray-700 bg-black/20">
                <Activity size={32} className="mb-2 opacity-50 text-red-500" />
                <p className="text-lg text-signal">NO_PROCESS_DATA</p>
                <p className="text-[10px] text-gray-500 mt-2 text-center max-w-xs">
                    Process list is empty. Execute <span className="text-white font-bold">ps</span> command in the terminal to capture running processes.
                </p>
                <button 
                    onClick={() => refetch()}
                    className="mt-6 px-4 py-2 bg-signal/10 hover:bg-signal/20 border border-signal/30 text-signal rounded transition-all flex items-center gap-2 text-xs"
                >
                    <Activity size={12} />
                    REFRESH_DATA
                </button>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto custom-scrollbar">
            <table className="w-full text-xs font-mono text-left border-collapse">
                <thead className="bg-black/40 text-gray-500 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                        <th className="p-2 font-normal border-b border-white/10 w-16">PID</th>
                        <th className="p-2 font-normal border-b border-white/10">NAME</th>
                        <th className="p-2 font-normal border-b border-white/10 hidden sm:table-cell">USER</th>
                        <th className="p-2 font-normal border-b border-white/10 hidden md:table-cell w-20">ARCH</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {processes.map((proc: any) => {
                        let details: any = {};
                        try {
                            details = JSON.parse(proc.metadata);
                        } catch (e) {}
                        
                        const pid = details.process_id || details.pid || "---";
                        const user = details.user || "Unknown";
                        const arch = details.architecture || "";

                        const isOpen = expanded === proc.id;
                        return (
                            <React.Fragment key={proc.id}>
                                <tr
                                    className={cn("hover:bg-white/5 transition-colors group cursor-pointer", isOpen ? "bg-white/10" : "")}
                                    onClick={() => setExpanded(isOpen ? null : proc.id)}
                                >
                                <td className="p-2 text-signal font-bold">{pid}</td>
                                <td className="p-2 text-white group-hover:text-yellow-400 transition-colors truncate max-w-[150px]" title={proc.name_text}>
                                    {proc.name_text}
                                </td>
                                <td className="p-2 text-gray-400 hidden sm:table-cell truncate max-w-[100px]" title={user}>{user}</td>
                                <td className="p-2 text-gray-500 hidden md:table-cell">{arch}</td>
                                </tr>
                                {isOpen && (
                                    <tr className="bg-black/50">
                                        <td colSpan={4} className="p-3">
                                            <div className="text-xs text-gray-200 space-y-1 break-all">
                                                <div className="text-signal font-bold">Process Detail</div>
                                                <div className="text-white">{proc.name_text} (PID {pid})</div>
                                                <div className="text-gray-400">User: {user}</div>
                                                <div className="text-gray-400">Arch: {arch}</div>
                                                <div className="text-gray-400">Integrity: {details.integrity_level ?? "-"}</div>
                                                <div className="text-gray-400">Session: {details.session_id ?? "-"}</div>
                                                <div className="text-gray-400 break-all">Bin: {details.bin_path || "-"}</div>
                                                <div className="text-gray-400 break-all">Cmd: {details.command_line || "-"}</div>
                                                {details.description && <div className="text-gray-500">Desc: {details.description}</div>}
                                                {details.signer && <div className="text-gray-500">Signer: {details.signer}</div>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const InfoPanel = ({ callback }: { callback: any }) => {
    if (!callback) return null;
    
    const InfoRow = ({ label, value, icon: Icon }: any) => (
        <div className="flex flex-col gap-1 mb-4">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-1 mb-1">
                {Icon && <Icon size={14} className="text-signal" />} 
                {label}
            </span>
            <span className="text-sm font-mono text-white break-all pl-6">
                {value || <span className="text-gray-600">N/A</span>}
            </span>
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            <div className="overflow-auto pr-2 flex-1 custom-scrollbar">
                <InfoRow label="Callback ID" value={callback.display_id} icon={Shield} />
                <InfoRow label="User" value={callback.user} icon={User} />
                <InfoRow label="Host" value={callback.host} icon={Server} />
                <InfoRow label="Domain" value={callback.domain} icon={Wifi} />
                <InfoRow label="IP Address" value={(() => {
                    try { return JSON.parse(callback.ip)[0] } catch(e) { return callback.ip }
                })()} icon={Wifi} />
                <InfoRow label="OS / Arch" value={`${callback.os} (${callback.architecture})`} icon={Cpu} />
                <InfoRow label="Process ID" value={callback.pid} icon={Activity} />
                <InfoRow label="Agent Type" value={callback.payload?.payloadtype?.name} icon={Terminal} />
                <InfoRow label="Last Checkin" value={callback.last_checkin} icon={Clock} />
                <InfoRow label="Description" value={callback.description} icon={List} />
            </div>
            
            {/* Node Preview */}
            <NodePreview callback={callback} />
        </div>
    );
};

export default function Console() {
    const { id } = useParams();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const [activeTab, setActiveTab] = useState<'info' | 'files' | 'processes'>('info');
    
    const { data, loading, error } = useQuery(GET_CALLBACK_DETAILS, {
        variables: { display_id: parseInt(id || '0') },
        pollInterval: 5000
    });

    const callback = data?.callback?.[0];

    if (loading && !callback) return <div className="bg-black text-signal p-10 font-mono">INITIALIZING_CONSOLE...</div>;
    if (error) return <div className="bg-black text-red-500 p-10 font-mono">CONNECTION_ERROR: {error.message}</div>;
    if (!callback) return <div className="bg-black text-red-500 p-10 font-mono">ERROR: CALLBACK_NOT_FOUND</div>;

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.5, ease: "circOut" }}
            className="min-h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void flex overflow-hidden"
        >
            <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />
            
            <div className={cn("flex-1 transition-all duration-300 flex flex-col h-screen overflow-hidden", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header Bar */}
                <header className="h-16 bg-black/50 border-b border-signal/20 flex items-center px-6 justify-between backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border border-signal bg-signal/10 flex items-center justify-center">
                            <Terminal size={20} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-widest flex items-center gap-2">
                                <span className="text-yellow-500">CALLBACK_{callback.display_id}</span>
                                <span className="text-gray-500 text-xs">/</span>
                                <span className="text-white text-sm">{callback.user}@{callback.host}</span>
                            </h1>
                            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                ONLINE - AES256 ENCRYPTED
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <div className="text-[10px] text-gray-500 uppercase">Last Seen</div>
                            <div className="text-signal font-mono">{new Date(callback.last_checkin).toLocaleTimeString()}</div>
                        </div>
                    </div>
                </header>

                {/* Main Content Grid */}
                <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 overflow-hidden">
                    
                    {/* Left Column: Console (Takes up 2/3 space on large screens) */}
                    <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
                        <ConsoleTerminal callbackId={callback.display_id} callbackUUID={callback.agent_callback_id} />
                    </div>

                    {/* Right Column: Tools & Info (Takes up 1/3 space) */}
                    <div className="flex flex-col bg-black/40 border border-white/10 min-h-0">
                        {/* Tabs */}
                        <div className="flex border-b border-white/10">
                            {[
                                { id: 'info', label: 'INFO', icon: Shield },
                                { id: 'files', label: 'FILES', icon: Folder },
                                { id: 'processes', label: 'PROCS', icon: Activity },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={cn(
                                        "flex-1 py-3 text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-colors",
                                        activeTab === tab.id 
                                            ? "bg-signal text-black" 
                                            : "text-gray-500 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 p-4 overflow-auto relative">
                            <div className="absolute inset-0 p-4">
                                {activeTab === 'info' && <InfoPanel callback={callback} />}
                                {activeTab === 'files' && <FileBrowser host={callback.host} callbackId={callback.display_id} />}
                                {activeTab === 'processes' && <ProcessList host={callback.host} />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
