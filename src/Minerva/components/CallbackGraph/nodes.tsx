import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, BaseEdge, EdgeLabelRenderer, EdgeProps, getStraightPath } from '@xyflow/react'
import { Terminal, Cpu, User, Shield, Network, Skull, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion';
import { isCallbackAlive } from '../../lib/utils';
import { timeAgo } from '../../lib/time';
import { useWindowEngaged } from '../../lib/useWindowEngaged';
import { getOSIcon } from '../OSIcons';

// ── Node data type definitions ──────────────────────────────────────────────

/** Data carried by the main CyberNode (callback graph nodes) */
export interface CyberNodeData {
    callback_id: number;
    display_id: number;
    db_id?: number;
    user: string;
    host: string;
    ip: string;
    integrity_level: number;
    payloadType: string;
    os: string;
    last_checkin: string;
    pid: number;
    architecture: string;
    domain: string;
    description: string;
    locked: boolean;
    sleep_info: string;
    animationDelay: number;
    isNewNode: boolean;
    label: string;
    onContextMenu?: (e: React.MouseEvent, info: Record<string, unknown>, rect?: DOMRect) => void;
    isCustom: boolean;
    process_name: string;
    c2profiles: string[];
    nodeLabels: string[];
    hostSessions?: Array<Record<string, unknown>> | null;
    active?: boolean;
    isHighlighted?: boolean;
    isDimmed?: boolean;
    [key: string]: unknown;
}

/** Data carried by the root "Minerva" node */
export interface RootNodeData {
    label: string;
    [key: string]: unknown;
}

/** Data for group bounding box overlay nodes */
export interface GroupBoundNodeData {
    groupBy: string;
    groupValue: string;
    [key: string]: unknown;
}

/** Data for task sub-graph nodes */
export interface TaskNodeData {
    label?: string;
    id?: string;
    status?: string;
    [key: string]: unknown;
}

/** Data for browserscript nodes */
export interface BrowserscriptNodeData {
    label?: string;
    name?: string;
    command?: string;
    agentIcon?: string;
    img?: string;
    overlay_img?: React.ReactNode;
    data?: { label?: string };
    [key: string]: unknown;
}

/** Data for BsCallback (lightweight callback in BrowserScript view) */
export interface BsCallbackNodeData {
    displayId: number;
    host?: string;
    payloadType?: string;
    _selected?: boolean;
    _anySelected?: boolean;
    [key: string]: unknown;
}

export const CyberNode = ({ data, dragging }: { data: CyberNodeData; dragging?: boolean }) => {
    const isHighIntegrity = data.integrity_level > 2;
    // Base colors (Final state)
    const finalBorderColor = isHighIntegrity ? "border-yellow-500" : "border-signal/50";
    const finalTextColor = isHighIntegrity ? "text-yellow-500" : "text-signal";
    
    const payloadType = data.payloadType || '';
    const os = data.os || '';
    const animationDelay = data.animationDelay || 0;
    const shouldAnimate = data.isNewNode;
    
    const [isHovered, setIsHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, align: 'right' });
    const [logoLoaded, setLogoLoaded] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const nodeRef = useRef<HTMLDivElement>(null);
    // Try to load a dynamic agent icon from Mythic (falls back to OS icon on error)
    const agentIconUrl = (!data.isCustom && payloadType && payloadType.toLowerCase() !== 'agent')
        ? `/direct/download/${payloadType}/icon.svg` : null;

    // Context menu handler
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (data.onContextMenu) {
            const rect = nodeRef.current?.getBoundingClientRect();
            data.onContextMenu(e, {
                id: data.callback_id,
                display_id: data.display_id,
                description: data.description,
                locked: data.locked,
                host: data.host,
                user: data.user,
                ip: data.ip,
                pid: data.pid,
                os: data.os,
                architecture: data.architecture,
                domain: data.domain,
                integrity_level: data.integrity_level,
                sleep_info: data.sleep_info,
                payloadType: data.payloadType,
                last_checkin: data.last_checkin,
                isCustom: data.isCustom || false, // 必須傳遞 isCustom 屬性
                db_id: data.db_id, // 對於 custom nodes，需要 db_id
            }, rect);
        }
    }, [data]);

    // Calculate last checkin with live update
    const calculateTimeAgo = useCallback(() => {
        if (data.isCustom) return "N/A";
        if (!data.last_checkin) return "NEVER";
        return timeAgo(data.last_checkin);
    }, [data.last_checkin, data.isCustom]);

    const [lastCheckinText, setLastCheckinText] = useState(calculateTimeAgo());

    useEffect(() => {
        setLastCheckinText(calculateTimeAgo()); // Initial update
        const interval = setInterval(() => {
            setLastCheckinText(calculateTimeAgo());
        }, 5000);
        return () => clearInterval(interval);
    }, [calculateTimeAgo]);

    const [showDeadState, setShowDeadState] = useState(false);
    
    // Parse time to determining status — uses sleep_info interval×3 as threshold
    const deadCheck = useMemo(() => {
        // Custom nodes are never "dead"
        if (data.isCustom) return false;
        // isCallbackAlive uses sleep_info for a proper threshold
        return !isCallbackAlive({ active: data.active, last_checkin: data.last_checkin, sleep_info: data.sleep_info });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastCheckinText, data.last_checkin, data.isCustom, data.active, data.sleep_info]);

    // Delay the "Dead" appearance to allow entry animations to complete first
    useEffect(() => {
        // Entry animations take approx 1s - 1.5s plus the animationDelay prop
        // We wait a bit longer to ensure stability before transitioning to dead state
        const delay = (data.animationDelay || 0) * 1000 + 1200; // Wait 1.2s (just after icon finishes)
        const timer = setTimeout(() => {
            setShowDeadState(true);
        }, delay);
        return () => clearTimeout(timer);
    }, [data.animationDelay]);

    const isDead = deadCheck && showDeadState;

    // Determine colors
    let mainColor = "#4ade80"; // Green default
    // borderColor Tailwind class (reserved for future skinning)
    let glowColor = "bg-signal/20";

    if (isDead) {
        mainColor = "#ef4444"; // Red
        glowColor = "bg-red-500/0"; 
    } else if (isHighIntegrity) {
        mainColor = "#eab308"; // Yellow
        glowColor = "bg-yellow-500/20";
    }

    // Clear hover state when dragging starts
    useEffect(() => {
        if (dragging) {
            setIsHovered(false);
        }
    }, [dragging]);

    // Handle tooltip positioning
    const handleMouseEnter = () => {
        if (dragging) return; // Don't show tooltip while dragging
        if (nodeRef.current) {
            const rect = nodeRef.current.getBoundingClientRect();
            const TOOLTIP_WIDTH = 300;
            const TOOLTIP_GAP = 15;
            const PADDING = 20;

            let x = rect.right + TOOLTIP_GAP;
            let align = 'right';

            if (x + TOOLTIP_WIDTH > window.innerWidth - PADDING) {
                x = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
                align = 'left';
            }

            let y = rect.top;
            const ESTIMATED_HEIGHT = 250;
            if (y + ESTIMATED_HEIGHT > window.innerHeight - PADDING) {
                y = window.innerHeight - ESTIMATED_HEIGHT - PADDING;
            }
            if (y < PADDING) y = PADDING;

            setTooltipPos({ x, y, align });
            setIsHovered(true);
        }
    };

    // --- Animation Variants ---

    // 2. Content Reveal: Elements that appear after expansion
    const contentRevealVariants = {
        hidden: { opacity: 0, x: -5 },
        visible: { 
            opacity: 1, 
            x: 0,
            transition: { delay: animationDelay + 0.8, duration: 0.4 }
        }
    };

    // 4. Glow Reveal
    const glowVariants = {
        hidden: { opacity: 0 },
        visible: { 
            opacity: 1, 
            transition: { delay: animationDelay + 1.0, duration: 1.2 } // Match border color timing
        }
    };

    // 5. Hostname Reveal (Typewriter-ish effect via clip-path)
    const hostnameVariants = {
        hidden: { 
            clipPath: "inset(0 100% 0 0)",
            opacity: 1 
        },
        visible: { 
            clipPath: "inset(0 0 0 0)",
            opacity: 1,
            transition: { delay: animationDelay + 0.5, duration: 0.4 } // Faster wipe
        }
    };

    return (
        <>
            <motion.div 
                ref={nodeRef}
                className="relative cursor-pointer"
                initial={shouldAnimate ? "hidden" : "visible"}
                animate="visible"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setIsHovered(false)}
                onContextMenu={handleContextMenu}
                style={
                    data.isHighlighted
                        ? { boxShadow: '0 0 18px 4px rgba(74,222,128,0.55)', outline: '1.5px solid rgba(74,222,128,0.7)', transition: 'opacity 0.3s, filter 0.3s, box-shadow 0.3s, outline 0.3s' }
                        : data.isDimmed
                            ? { opacity: 0.15, filter: 'grayscale(1)', transition: 'opacity 0.3s, filter 0.3s, box-shadow 0.3s, outline 0.3s' }
                            : { transition: 'opacity 0.3s, filter 0.3s, box-shadow 0.3s, outline 0.3s' }
                }
            >
                {/* Hexagonal Glow Background - Appears Last */}
                <motion.div 
                    className={`absolute -inset-1 ${glowColor} blur-md rounded-lg group-hover:bg-opacity-40 transition-all duration-500`}
                    variants={glowVariants}
                />
                
                {/* Main Container */}
                <motion.div 
                        initial={{ backgroundColor: "#050505", borderColor: "#ffffff", opacity: 0, scale: 0.8, filter: "blur(5px)", clipPath: "inset(0 100% 0 0)" }}
                        animate={{
                            backgroundColor: isDead ? "#dc2626" : "#050505", // red-600 hex
                            borderColor: isDead ? "#ef4444" : (isHighIntegrity ? "#eab308" : "rgba(74,222,128, 0.5)"),
                            opacity: 1,
                            scale: 1,
                            filter: "blur(0px)",
                            clipPath: "inset(0 0% 0 0)",
                            transition: {
                                backgroundColor: { duration: 0.3, ease: "easeInOut" },
                                borderColor: { delay: 0.5, duration: 1.0, ease: "easeInOut" }, // Keep white during expansion
                                default: { duration: 0.5 }
                            }
                        }}
                        // Fixed width to prevent dynamic resizing based on hostname length
                        className={`relative border p-3.5 shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center gap-3 overflow-hidden w-[250px]`}
                    > 
                     
                    <Handle type="target" position={Position.Left} className="!opacity-0 pointer-events-none !w-3 !h-3" style={{ top: '50%', left: 0, transform: 'translate(-50%, -50%)' }} />
                    
                    {/* OS Icon or Skull - Appears after expansion */}
                    <motion.div
                        className={(isHighIntegrity && !isDead) ? "animate-pulse" : ""}
                        style={{ color: "#ffffff" }}
                        initial={{ color: "#ffffff", opacity: 0, scale: 0 }}
                        animate={{ 
                            color: isDead ? "#000000" : mainColor, 
                            opacity: 1,
                            scale: 1,
                            transition: { 
                                color: { delay: isDead ? 0 : animationDelay + 1.0, duration: 0.8 }, // Stay white briefly then fade
                                default: { delay: isDead ? 0 : animationDelay + 0.4, duration: 0.6 } // Use default for opacity/scale
                            }
                        }}
                    >
                        {isDead ? (
                            <Skull size={24} className="text-black" />
                        ) : agentIconUrl && !logoError ? (
                            <div className="relative flex items-center justify-center" style={{ width: 24, height: 24 }}>
                                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: logoLoaded ? 0 : 1, transition: 'opacity 0.3s' }}>
                                    {getOSIcon(os, payloadType, 24, "currentColor")}
                                </span>
                                <img
                                    src={agentIconUrl}
                                    onLoad={() => setLogoLoaded(true)}
                                    onError={() => setLogoError(true)}
                                    style={{ width: 24, height: 24, objectFit: 'contain', opacity: logoLoaded ? 1 : 0, position: 'absolute', inset: 0, transition: 'opacity 0.3s' }}
                                    alt={payloadType}
                                />
                            </div>
                        ) : (
                            getOSIcon(os, payloadType, 24, "currentColor")
                        )}
                    </motion.div>

                    {/* Info Container */}
                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden"> 
                        {/* Hostname - Appears after expansion (Step 2) */}
                        <motion.span 
                            className="font-bold text-base tracking-wide block truncate" 
                            variants={hostnameVariants}
                            initial="hidden" 
                            animate={{ 
                                color: isDead ? "#000000" : "#e5e7eb", 
                                clipPath: "inset(0 0 0 0)", 
                                transition: { 
                                    color: { duration: 1.0 }, 
                                    clipPath: { delay: animationDelay + 0.5, duration: 0.4, ease: "easeOut" }
                                }
                            }}
                        >
                            {data.host}
                        </motion.span>
                        
                        {/* IP - Appears after hostname (Step 3) */}
                        <motion.span 
                            variants={contentRevealVariants}
                            className={`text-[13px] font-mono truncate block ${isDead ? "text-black/80" : "text-gray-500"}`}
                        >
                            {data.ip}
                        </motion.span>
                        {/* Extra labels based on nodeLabels config */}
                        {(data.nodeLabels || []).filter((l: string) => l !== 'host' && l !== 'ip').map((label: string) => {
                            const val = label === 'display_id' ? `#${data.display_id}` :
                                        label === 'user' ? data.user :
                                        label === 'domain' ? data.domain :
                                        label === 'os' ? data.os :
                                        label === 'pid' ? `PID:${data.pid}` :
                                        label === 'description' ? data.description :
                                        label === 'architecture' ? data.architecture : null;
                            if (!val) return null;
                            return <motion.span key={label} variants={contentRevealVariants}
                                className={`text-[11px] font-mono truncate block ${isDead ? 'text-black/60' : 'text-gray-600'}`}>{val}</motion.span>;
                        })}
                    </div>

                    {/* Status Indicator - Appears last */}
                    <motion.div
                        variants={contentRevealVariants}
                        className="ml-auto flex items-center gap-1.5 pl-2"
                    >
                        {data.hostSessions && data.hostSessions.length > 1 && (
                            <span className="text-[9px] font-mono bg-signal/15 text-signal/90 px-1.5 py-0.5 rounded border border-signal/20">{data.hostSessions.length}</span>
                        )}
                        <div className={`w-2 h-2 ${isDead ? "bg-black" : (isHighIntegrity ? "bg-yellow-500" : "bg-signal")} rounded-full animate-pulse shadow-[0_0_5px_currentColor] transition-colors duration-1000`}></div>
                    </motion.div>

                    {/* Decorative Elements - Color transition (Step 4) */}
                    <motion.div 
                        className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2"
                        initial={{ borderColor: "#ffffff", opacity: 0 }}
                        animate={{ 
                            borderColor: isDead ? "#000000" : (isHighIntegrity ? "#eab308" : "#4ade80"), 
                            opacity: 1 
                        }}
                        transition={{ 
                            opacity: { delay: animationDelay + 0.2, duration: 0.2 },
                            borderColor: { delay: isDead ? 0 : animationDelay + 1.0, duration: 1.2, ease: "easeInOut" }
                        }}
                    />
                    <motion.div 
                        className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2"
                        initial={{ borderColor: "#ffffff", opacity: 0 }}
                        animate={{ 
                            borderColor: isDead ? "#000000" : (isHighIntegrity ? "#eab308" : "#4ade80"), 
                            opacity: 1 
                        }}
                        transition={{ 
                            opacity: { delay: animationDelay + 0.2, duration: 0.2 },
                            borderColor: { delay: isDead ? 0 : animationDelay + 1.0, duration: 1.2, ease: "easeInOut" }
                        }}
                    />
                    
                    <Handle type="source" position={Position.Right} className="!opacity-0 pointer-events-none !w-3 !h-3" style={{ top: '50%', right: 0, left: 'auto', transform: 'translate(50%, -50%)' }} />
                </motion.div>
            </motion.div>

            {/* Portal Tooltip - only show when hovered AND not dragging */}
            {isHovered && !dragging && createPortal(
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, x: tooltipPos.align === 'right' ? -10 : 10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed z-[9999] w-[280px] pointer-events-none"
                        style={{ 
                            left: tooltipPos.x, 
                            top: tooltipPos.y,
                        }}
                    >
                        <div className={`bg-black/90 backdrop-blur-xl border ${finalBorderColor} p-4 rounded shadow-[0_0_30px_rgba(0,0,0,0.8)] relative overflow-hidden`}>
                            {/* Animated scanning line background */}
                            <div className={`absolute inset-0 opacity-10 bg-[linear-gradient(transparent_0%,${isHighIntegrity ? '#eab308' : '#4ade80'}_50%,transparent_100%)] bg-[length:100%_200%] animate-[scan_3s_linear_infinite] pointer-events-none`}></div>
                            
                            {/* Connector Line Indicator */}
                            {tooltipPos.align === 'right' ? (
                                <div className={`absolute top-6 -left-1.5 w-3 h-3 bg-black border-l border-b ${finalBorderColor} transform rotate-45`}></div>
                            ) : (
                                <div className={`absolute top-6 -right-1.5 w-3 h-3 bg-black border-r border-t ${finalBorderColor} transform rotate-45`}></div>
                            )}

                            <div className="space-y-4 relative z-10">
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-mono text-base font-bold ${finalTextColor}`}>NODE_{data.display_id}</span>
                                        {data.pid && <span className="text-[11px] font-mono text-gray-500 bg-white/5 px-1.5 rounded">PID {data.pid}</span>}
                                    </div>
                                    {isHighIntegrity && (
                                        <div className="flex items-center gap-1 bg-yellow-500/20 px-1.5 py-0.5 rounded border border-yellow-500/50">
                                            <Shield size={10} className="text-yellow-500" />
                                            <span className="text-[10px] font-bold text-yellow-500">ADMIN</span>
                                        </div>
                                    )}
                                </div>

                                {/* Main Info Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-0.5 col-span-2">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">User @ Domain</span>
                                        <div className="flex items-center gap-1.5">
                                            <User size={13} className="text-gray-400 shrink-0" />
                                            <span className="text-[13px] text-white truncate font-mono">
                                                {data.user}
                                                {data.domain && <span className="text-gray-500">@{data.domain}</span>}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">OS / Arch</span>
                                        <div className="flex items-center gap-1.5">
                                            <Cpu size={13} className="text-gray-400 shrink-0" />
                                            <span className="text-[13px] text-white truncate font-mono">
                                                {os || 'Unknown'} {data.architecture && `(${data.architecture})`}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Agent</span>
                                        <div className="flex items-center gap-1.5">
                                            <Terminal size={13} className="text-gray-400 shrink-0" />
                                            <span className="text-[13px] text-white uppercase font-mono">{payloadType}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Last Checkin Bar */}
                                <div className="bg-white/5 rounded p-2 border border-white/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase">Last Checkin</span>
                                        <span className={`text-[11px] font-mono font-bold ${
                                            data.isCustom ? 'text-cyan-400' : 
                                            (lastCheckinText.includes('s') ? 'text-green-500' : 'text-red-400')
                                        }`}>
                                            {lastCheckinText}
                                        </span>
                                    </div>
                                    {!data.isCustom && (
                                        <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                                            <motion.div 
                                                className={`h-full ${lastCheckinText.includes('s') ? 'bg-green-500' : 'bg-red-500'}`}
                                                initial={{ width: 0 }}
                                                animate={{ width: lastCheckinText.includes('s') ? '100%' : '30%' }}
                                                transition={{ duration: 1 }}
                                            />
                                        </div>
                                    )}
                                    {data.isCustom && (
                                        <div className="text-[10px] text-cyan-400 mt-1 italic">
                                            Custom node - no active connection
                                        </div>
                                    )}
                                </div>

                                {/* Description if available */}
                                {data.description && (
                                    <div className="text-[11px] text-gray-400 italic border-t border-white/10 pt-2">
                                        "{data.description}"
                                    </div>
                                )}

                                {/* Host sessions list (when merged by host) */}
                                {data.hostSessions && data.hostSessions.length > 1 && (
                                    <div className="border-t border-white/10 pt-2 space-y-1">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">SESSIONS ON HOST ({data.hostSessions.length})</span>
                                        <div className="max-h-28 overflow-y-auto space-y-0.5 cyber-scrollbar">
                                            {data.hostSessions.map((s: any) => {
                                                const sAlive = isCallbackAlive(s);
                                                const sPriv = Number(s.integrity_level ?? 0);
                                                const isRep = s.id === data.callback_id;
                                                return (
                                                    <div key={s.id} className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11px] font-mono ${isRep ? 'bg-signal/10 border border-signal/20' : 'bg-white/5'}`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${sAlive ? 'bg-green-500' : 'bg-red-500'}`} />
                                                        <span className="text-gray-300">#{s.display_id}</span>
                                                        <span className="text-gray-500">{s.user}</span>
                                                        {sPriv >= 3 && <Shield size={9} className="text-yellow-500" />}
                                                        <span className="text-gray-600 ml-auto">{s.payload?.payloadtype?.name || ''}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Interaction hint */}
                                {!data.isCustom && (
                                    <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-mono text-gray-600">
                                        <span>CLICK: highlight edges</span>
                                        <span>DBL-CLICK: interact</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};

/**
 * Framer drives `repeat: Infinity` from its own rAF loop, writing inline styles
 * on the main thread every frame — CSS `animation-play-state` cannot touch it,
 * so the idle-window rule in index.css does not apply here. RootNode is mounted
 * for as long as the Callbacks page is open and animates two `blur-2xl`/`blur-xl`
 * filters under a changing scale, plus a box-shadow — the two most expensive
 * things there are to animate. Unfocused, that ran forever for nobody.
 *
 * IDLE_TRANSITION has duration 0, so blurring the window snaps each element to
 * its rest pose instead of spending one last cycle getting there.
 */
const IDLE_TRANSITION = { duration: 0 } as const;

export const RootNode = ({ data }: { data: RootNodeData }) => {
    const engaged = useWindowEngaged();
    return (
        <motion.div 
            className="relative group"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ 
                duration: 0.6, // 1.2 -> 0.6
                ease: [0.34, 1.56, 0.64, 1], // Custom spring-like bezier
                type: "spring",
                bounce: 0.5
            }}
        >
            {/* Animated outer glow rings */}
            <motion.div 
                className="absolute -inset-8 bg-signal/5 blur-2xl rounded-full"
                initial={{ scale: 0, opacity: 0 }}
                animate={engaged
                    ? { scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }
                    : { scale: 1, opacity: 0.3 }}
                transition={engaged
                    ? { duration: 3, repeat: Infinity, ease: "easeInOut" }
                    : IDLE_TRANSITION}
            />
            <motion.div 
                className="absolute -inset-4 bg-signal/10 blur-xl rounded-full"
                initial={{ scale: 0, opacity: 0 }}
                animate={engaged
                    ? { scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }
                    : { scale: 1, opacity: 0.5 }}
                transition={engaged
                    ? { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }
                    : IDLE_TRANSITION}
            />
            
            {/* Ripple effect rings */}
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className="absolute inset-0 border-2 border-signal/30 rounded-full"
                    style={{ 
                        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
                    }}
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={engaged
                        ? { scale: [1, 1.5 + i * 0.3], opacity: [0.5, 0] }
                        : { scale: 1, opacity: 0 }}
                    transition={engaged
                        ? { duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }
                        : IDLE_TRANSITION}
                />
            ))}
            
            <motion.div 
                className="relative w-32 h-32 flex flex-col items-center justify-center bg-black border-2 border-signal shadow-[0_0_30px_rgba(74,222,128,0.3)]"
                style={{
                    clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
                }}
                animate={engaged
                    ? {
                        boxShadow: [
                            "0 0 30px rgba(74,222,128,0.3)",
                            "0 0 50px rgba(74,222,128,0.5)",
                            "0 0 30px rgba(74,222,128,0.3)"
                        ]
                    }
                    : { boxShadow: "0 0 30px rgba(74,222,128,0.3)" }}
                transition={engaged
                    ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                    : IDLE_TRANSITION}
            >
                {/* 隱藏的連接點 - 水平佈局：source 在右側，target 在左側 */}
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!opacity-0 pointer-events-none !w-3 !h-3"
                    style={{ top: '50%', right: 0, left: 'auto', transform: 'translate(50%, -50%)' }}
                />
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!opacity-0 pointer-events-none !w-3 !h-3"
                    style={{ top: '50%', left: 0, transform: 'translate(-50%, -50%)' }}
                />
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
                >
                    <Network size={32} className="text-signal mb-2" />
                </motion.div>
                <motion.div 
                    className="text-signal font-bold tracking-widest text-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                >
                    MINERVA
                </motion.div>
                <motion.div 
                    className="text-[11px] text-gray-500 font-mono"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.4 }}
                >
                    C2_CORE
                </motion.div>
                
                <motion.div 
                    className="absolute inset-0 border border-signal/20 scale-75" 
                    style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 0.75, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                />
            </motion.div>
        </motion.div>
    );
};

// Group bound container node for groupBy visual clustering
export const GroupBoundNode = ({ data }: { data: GroupBoundNodeData }) => (
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
        <div className="absolute inset-0 border border-signal/10 bg-signal/[0.025] rounded-sm" />
        <div className="absolute top-0 left-4" style={{ transform: 'translateY(-50%)' }}>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#080808] border border-signal/20 text-[9px] font-mono tracking-widest whitespace-nowrap">
                <span className="text-signal/30 uppercase">{data.groupBy}</span>
                <span className="text-gray-400">{data.groupValue || '(none)'}</span>
            </span>
        </div>
    </div>
);

// TaskNode — used in task-relationship sub-graphs (similar to OldReactUI TaskNode)
export const TaskNode = ({ data }: { data: TaskNodeData }) => (
    <div className="flex flex-col items-center" style={{ minWidth: 80, maxWidth: 160 }}>
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <div className="border border-blue-500/40 bg-blue-900/20 rounded px-2 py-1 text-[10px] font-mono text-blue-300 text-center max-w-full overflow-hidden">
            <div className="text-blue-500/60 text-[8px] uppercase tracking-widest mb-0.5">TASK</div>
            <div className="truncate" title={data.label}>{data.label || `#${data.id}`}</div>
            {data.status && (
                <div className={`text-[8px] mt-0.5 ${data.status === 'success' ? 'text-signal' : data.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                    {data.status.toUpperCase()}
                </div>
            )}
        </div>
        <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
);

// BrowserscriptNode — used in browserscript-relationship sub-graphs
export const BrowserscriptNode = ({ data }: { data: BrowserscriptNodeData }) => (
    <div className="flex flex-col items-center gap-1">
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <div className="relative flex flex-col items-center">
            {data.img ? (
                <div className="relative w-10 h-10">
                    <img src={data.img} alt="" className="w-10 h-10 object-contain" style={{ filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.6))' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    {data.overlay_img && (
                        <div className="absolute top-0 right-0 w-5 h-5">{data.overlay_img}</div>
                    )}
                </div>
            ) : (
                <div className="w-10 h-10 border border-purple-500/40 bg-purple-900/20 rounded-full flex items-center justify-center">
                    <span className="text-purple-400 text-[10px] font-mono">BS</span>
                </div>
            )}
            <div className="text-[9px] font-mono text-purple-300 text-center mt-0.5 max-w-[80px] truncate">
                {data.label || data.data?.label || ''}
            </div>
        </div>
        <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
);

// BsCallbackNode — lightweight callback node used in the BrowserScript graph view
export const BsCallbackNode = ({ data }: { data: BsCallbackNodeData }) => {
    const isSelected = data._selected;
    const anySelected = data._anySelected;
    return (
        <div
            style={{
                minWidth: 110,
                ...(anySelected && !isSelected ? { opacity: 0.2, filter: 'grayscale(1)', transition: 'opacity 0.2s, filter 0.2s' } : {}),
                ...(isSelected ? { boxShadow: '0 0 12px 2px rgba(74,222,128,0.5)', outline: '1.5px solid rgba(74,222,128,0.7)', transition: 'box-shadow 0.2s' } : {}),
            }}
            className="flex flex-col items-center gap-1 px-3 py-2 border rounded font-mono text-xs bg-[#0a1a0a] border-signal/40 text-signal"
        >
            <Handle type="target" position={Position.Left} isConnectable={false} />
            {data.payloadType && (
                <img src={`/static/${data.payloadType}_dark.svg`} alt={data.payloadType}
                    className="w-5 h-5 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <span className="font-bold text-[10px]">#{data.displayId}</span>
            {data.host && <span className="text-[9px] text-signal/60 truncate max-w-[100px]">{data.host}</span>}
            <Handle type="source" position={Position.Right} isConnectable={false} />
        </div>
    );
};
