// ═══════════════════════════════════════════════
//  Payloads – pure utility helpers
// ═══════════════════════════════════════════════
import React from 'react';
import { Monitor, Terminal, Smartphone, Globe, Command, Server} from 'lucide-react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { PayloadTypeData } from '../../types/payloads';

export const getAnimDuration = (baseDuration: number, isCombat: boolean) => isCombat ? baseDuration / 2 : baseDuration;

export const getOSInfo = (os: string) => {
    const lower = os.toLowerCase();
    if (lower.includes('windows')) return { 
        desc: "Microsoft Windows operating systems including Windows 10, 11, and Server editions.",
        color: "text-blue-400",
        bg: "bg-blue-400/10",
        border: "border-blue-400/30"
    };
    if (lower.includes('mac') || lower.includes('darwin')) return { 
        desc: "Apple macOS desktop environment for Intel and Apple Silicon processors.",
        color: "text-gray-200",
        bg: "bg-gray-200/10",
        border: "border-gray-200/30"
    };
    if (lower.includes('linux')) return { 
        desc: "Linux-based operating systems including Ubuntu, CentOS, Debian, and more.",
        color: "text-yellow-400",
        bg: "bg-yellow-400/10",
        border: "border-yellow-400/30"
    };
    if (lower.includes('android')) return { 
        desc: "Android mobile operating system based on the Linux kernel.",
        color: "text-accent",
        bg: "bg-signal/[0.06]",
        border: "border-accent"
    };
    if (lower.includes('chrome')) return { 
        desc: "Chrome OS and web-based operating system environments.",
        color: "text-red-400",
        bg: "bg-red-400/10",
        border: "border-red-400/30"
    };
    return { 
        desc: "Generic or custom operating system environment.",
        color: "text-signal",
        bg: "bg-signal/10",
        border: "border-signal/30"
    };
};

// ============================================
// Create Payload Embed Component
// ============================================
export const PAYLOAD_STEPS = ['SELECT AGENT', 'CONFIGURATION', 'COMMANDS', 'C2 PROFILES', 'BUILD'];

export const getOSIcon = (os: string) => {
    const lower = os.toLowerCase();
    if (lower.includes('windows')) return <Monitor size={20} />;
    if (lower.includes('mac') || lower.includes('darwin')) return <Command size={20} />;
    if (lower.includes('linux')) return <Terminal size={20} />;
    if (lower.includes('android') || lower.includes('ios')) return <Smartphone size={20} />;
    if (lower.includes('chrome')) return <Globe size={20} />;
    return <Server size={20} />;
};

// Command Tooltip Component
export const CommandTooltip: React.FC<{
    cmd: PayloadTypeData['commands'][0];
    position: { x: number; y: number };
    isCombat?: boolean;
}> = ({ cmd, position, isCombat = false }) => {
    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: getAnimDuration(0.1, isCombat) }}
            className="fixed z-[9999] w-80 pointer-events-none"
            style={{ top: position.y, left: position.x }}
        >
            {/* Cyberpunk styled tooltip */}
            <div className="bg-void/95 border border-signal backdrop-blur-xl shadow-[0_0_30px_rgba(0,255,255,0.2)] overflow-hidden">
                {/* Header with scanline effect */}
                <div className="bg-signal/10 p-3 border-b border-signal/30 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-signal/5 to-transparent animate-pulse" />
                    <div className="flex items-center justify-between relative z-10">
                        <span className="font-bold font-mono text-signal text-sm flex items-center gap-2">
                            <Terminal size={14} /> {cmd.cmd}
                        </span>
                        {cmd.needs_admin && (
                            <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 border border-red-500/30 font-mono">
                                ELEVATED
                            </span>
                        )}
                    </div>
                </div>
                
                {/* Body */}
                <div className="p-4 space-y-3">
                    <div>
                        <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">
                            DESCRIPTION
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                            {cmd.description || "No description provided."}
                        </p>
                    </div>
                    
                    {cmd.help_cmd && (
                        <div>
                            <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">
                                USAGE
                            </div>
                            <div className="text-xs text-signal/80 font-mono bg-black/50 p-2 border border-gray-800 break-all">
                                {cmd.help_cmd}
                            </div>
                        </div>
                    )}

                    {cmd.attributes && Object.keys(cmd.attributes).length > 0 && (
                        <div>
                            <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">
                                ATTRIBUTES
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(cmd.attributes).map(([key, val]: [string, any]) => (
                                    val && (
                                        <span key={key} className="text-[10px] bg-signal/10 text-signal px-1.5 py-0.5 border border-signal/30 font-mono">
                                            {key.replace(/_/g, ' ').toUpperCase()}
                                        </span>
                                    )
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Decorative corners */}
                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-signal" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-signal" />
            </div>
        </motion.div>,
        document.body
    );
};

