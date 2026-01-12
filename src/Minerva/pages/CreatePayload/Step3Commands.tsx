import React, { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@apollo/client';
import { GET_COMMANDS } from './queries';
import { Disc, CheckSquare, Square, Search, Check, X, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface Step3Props {
    payloadType: string;
    currentCommands: string[];
    onUpdate: (commands: string[]) => void;
}

// Memoized Command Item Component
const CommandItem = memo(({ cmd, isSelected, onToggle, onEnter, onLeave, onMove }: any) => {
    return (
        <button
            onClick={() => onToggle(cmd.cmd)}
            onMouseEnter={(e) => onEnter(e, cmd)}
            onMouseLeave={onLeave}
            onMouseMove={onMove}
            className={cn(
                "flex items-start gap-3 p-2 text-left border transition-all duration-150 group h-full relative overflow-hidden",
                isSelected 
                    ? "border-signal bg-white/10" 
                    : "border-transparent hover:border-gray-700 bg-transparent hover:bg-white/5"
            )}
        >
            <div className={cn("mt-0.5 shrink-0 transition-colors", isSelected ? "text-signal" : "text-gray-700 group-hover:text-gray-500")}>
                {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            </div>
            <div className="overflow-hidden min-w-0 z-10">
                <div className={cn("font-bold font-mono text-xs truncate transition-colors", isSelected ? "text-signal" : "text-gray-400 group-hover:text-gray-300")}>
                    {cmd.cmd}
                </div>
                {cmd.description && (
                    <div className="text-[10px] text-gray-600 line-clamp-1 mt-0.5 leading-tight group-hover:text-gray-500">
                        {cmd.description}
                    </div>
                )}
            </div>
            {/* Hover scanline effect */}
            {!isSelected && <div className="absolute inset-0 bg-signal/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500 pointer-events-none" />}
        </button>
    );
});

export function Step3Commands({ payloadType, currentCommands, onUpdate }: Step3Props) {
    const { data, loading, error } = useQuery(GET_COMMANDS, {
        variables: { payloadType: payloadType }
    });

    const [filter, setFilter] = useState("");
    const [commands, setCommands] = useState<any[]>([]);

    // Tooltip State
    const [hoveredCmd, setHoveredCmd] = useState<any | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [showTooltip, setShowTooltip] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (data?.command) {
            setCommands(data.command);
            
            // Initial selection logic (e.g., suggested commands)
            if (currentCommands.length === 0) {
                 const initialSelection = data.command
                    .filter((c: any) => c.attributes?.suggested_command)
                    .map((c: any) => c.cmd);
                 if (initialSelection.length > 0) onUpdate(initialSelection);
            }
        }
    }, [data]);

    const toggleCommand = useCallback((cmd: string) => {
        if (currentCommands.includes(cmd)) {
            onUpdate(currentCommands.filter(c => c !== cmd));
        } else {
            onUpdate([...currentCommands, cmd]);
        }
    }, [currentCommands, onUpdate]);

    // Memoize filtered commands for performance
    const filteredCommands = useMemo(() => {
        if (!filter) return commands;
        return commands.filter(c => c.cmd.toLowerCase().includes(filter.toLowerCase()));
    }, [commands, filter]);

    const selectAllVisible = () => {
        const visibleCmds = filteredCommands.map(c => c.cmd);
        const toAdd = visibleCmds.filter(c => !currentCommands.includes(c));
        onUpdate([...currentCommands, ...toAdd]);
    };

    const deselectAllVisible = () => {
        const visibleCmds = filteredCommands.map(c => c.cmd);
        onUpdate(currentCommands.filter(c => !visibleCmds.includes(c)));
    };

    const calculatePosition = (e: React.MouseEvent) => {
        const offset = 15; 
        const x = e.clientX + offset;
        const y = e.clientY + offset;
        
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const tooltipWidth = 320;
        const tooltipHeight = 250; // Estimated max height

        // Flip horizontally if overflow
        const finalX = x + tooltipWidth > screenWidth ? e.clientX - tooltipWidth - offset : x;
        // Flip vertically if overflow
        const finalY = y + tooltipHeight > screenHeight ? e.clientY - tooltipHeight - offset : y;

        return { x: finalX, y: finalY };
    };

    const handleMouseEnter = useCallback((e: React.MouseEvent, cmd: any) => {
        setTooltipPos(calculatePosition(e));
        
        timerRef.current = setTimeout(() => {
            setHoveredCmd(cmd);
            setShowTooltip(true);
        }, 200); // 200ms delay
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Always update position if we are tracking (either timer active or tooltip showing)
        if (timerRef.current || showTooltip) {
            setTooltipPos(calculatePosition(e));
        }
    }, [showTooltip]);

    const handleMouseLeave = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowTooltip(false);
        setHoveredCmd(null);
    }, []);

    if (loading) return <div className="flex items-center gap-2 text-signal"><Disc className="animate-spin" /> LOADING_COMMANDS...</div>;
    if (error) return <div className="text-red-500">ERROR_LOADING_COMMANDS: {error.message}</div>;

    return (
        <div className="h-full flex flex-col relative">
            <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
                    <input 
                        type="text" 
                        placeholder="FILTER_COMMANDS..." 
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full bg-black/30 border border-gray-700 py-2 pl-10 pr-4 text-signal font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                    />
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                    <button 
                        onClick={selectAllVisible}
                        className="flex-1 md:flex-none px-4 py-2 border border-green-900/50 bg-green-900/10 hover:bg-green-900/20 text-green-400 hover:text-green-300 text-xs font-mono font-bold transition-all flex items-center justify-center gap-2"
                    >
                        <Check size={14} /> SELECT_VISIBLE
                    </button>
                    <button 
                        onClick={deselectAllVisible}
                        className="flex-1 md:flex-none px-4 py-2 border border-red-900/50 bg-red-900/10 hover:bg-red-900/20 text-red-400 hover:text-red-300 text-xs font-mono font-bold transition-all flex items-center justify-center gap-2"
                    >
                        <X size={14} /> DESELECT_VISIBLE
                    </button>
                </div>
            </div>

            <div className="flex-1 border border-ghost/30 bg-black/20 p-1 cyber-scrollbar overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
                    {filteredCommands.map(cmd => (
                        <CommandItem
                            key={cmd.id}
                            cmd={cmd}
                            isSelected={currentCommands.includes(cmd.cmd)}
                            onToggle={toggleCommand}
                            onEnter={handleMouseEnter}
                            onLeave={handleMouseLeave}
                            onMove={handleMouseMove}
                        />
                    ))}
                </div>
            </div>
            
            <div className="mt-2 text-[10px] font-mono text-gray-500 flex justify-between px-1">
                <span>TOTAL: {commands.length}</span>
                <span>SELECTED: <span className="text-signal">{currentCommands.length}</span></span>
            </div>

            {/* Tooltip Portal - Render to body to avoid parent transform issues */}
            {createPortal(
                <AnimatePresence>
                    {showTooltip && hoveredCmd && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="fixed z-[9999] w-80 bg-void/95 border border-signal backdrop-blur-xl shadow-[0_0_30px_rgba(34,197,94,0.3)] rounded-lg pointer-events-none overflow-hidden"
                            style={{ top: tooltipPos.y, left: tooltipPos.x }}
                        >
                            {/* Header */}
                            <div className="bg-signal/10 p-3 border-b border-signal/30 flex items-center justify-between">
                                <span className="font-bold font-mono text-signal text-sm flex items-center gap-2">
                                    <Terminal size={14} /> {hoveredCmd.cmd}
                                </span>
                                {hoveredCmd.needs_admin && (
                                    <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 border border-red-500/30 rounded">ELEVATED</span>
                                )}
                            </div>
                            
                            {/* Body */}
                            <div className="p-4 space-y-3">
                                <div>
                                    <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider">Description</div>
                                    <p className="text-xs text-gray-300 leading-relaxed font-mono">
                                        {hoveredCmd.description || "No description provided."}
                                    </p>
                                </div>
                                
                                {hoveredCmd.help_cmd && (
                                    <div>
                                        <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider">Usage</div>
                                        <div className="text-xs text-signal/80 font-mono bg-black/50 p-2 border border-gray-800 rounded break-all">
                                            {hoveredCmd.help_cmd}
                                        </div>
                                    </div>
                                )}

                                 {/* Attributes */}
                                 {hoveredCmd.attributes && Object.keys(hoveredCmd.attributes).length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider">Attributes</div>
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(hoveredCmd.attributes).map(([key, val]: [string, any]) => (
                                                val && (
                                                    <span key={key} className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 border border-gray-800 rounded">
                                                        {key}
                                                    </span>
                                                )
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Decorative Corner */}
                            <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-signal" />
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-signal" />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
