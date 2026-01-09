import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
    ReactFlow, 
    Background, 
    Controls, 
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    Node,
    Edge,
    Handle,
    Position,
    BaseEdge,
    EdgeProps,
    getStraightPath
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@apollo/client';
import { GET_CALLBACK_GRAPH_EDGES, GET_CALLBACKS } from '../lib/api';
// @ts-ignore
import { Terminal, Cpu, User, Share2, Hexagon, Shield, Network, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Windows Icon SVG Component
const WindowsIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
);

// Linux Icon SVG Component (Tux)
const LinuxIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.166-.166.216-.264.068-.135.097-.265.079-.39-.02-.135-.089-.259-.202-.353a.547.547 0 00-.4-.135c-.147.018-.266.076-.357.166-.09.09-.152.193-.18.307a.559.559 0 00.007.283c.029.097.078.18.161.262-.057.023-.113.078-.166.126-.085.085-.186.125-.319.165l-.045.015a.867.867 0 01-.074-.32 1.556 1.556 0 01-.028-.324c.018-.22.065-.463.146-.7.08-.249.193-.465.334-.657.141-.192.295-.346.46-.445a.912.912 0 01.532-.166zm-2.625.084c.088 0 .177.017.26.043a.928.928 0 01.476.358c.136.174.212.39.225.63.017.245-.017.49-.09.733-.07.24-.165.47-.26.684l-.004.007c-.012.024-.014.047-.015.071v.093c-.004.135-.014.259-.058.38a.846.846 0 01-.225.353 1.58 1.58 0 01-.257-.135c-.145-.105-.228-.166-.324-.262-.055-.055-.094-.097-.16-.16l-.015-.019c.05-.062.111-.146.162-.207.065-.078.109-.166.133-.256.025-.09.019-.185-.02-.27-.044-.09-.115-.155-.212-.195a.451.451 0 00-.274-.017c-.094.021-.169.073-.224.146a.448.448 0 00-.098.235.456.456 0 00.055.248c.037.07.086.123.153.168-.085.09-.133.166-.233.32-.176.26-.18.39-.263.585-.096-.092-.17-.198-.216-.319a1.42 1.42 0 01-.065-.373c0-.135.015-.267.047-.397.037-.132.09-.256.16-.373a1.4 1.4 0 01.292-.316c.123-.104.266-.183.427-.233a.914.914 0 01.26-.043zM8.071 6.643c.086.09.166.166.259.238a.59.59 0 01-.016.116.61.61 0 01-.053.132c.009.009.012.014.024.023.017.017.033.036.05.053.062.055.132.098.209.129.048.02.1.034.152.042a.608.608 0 01-.01.048.61.61 0 00-.011.132c.007.058.023.116.052.169l.01.02a.74.74 0 01-.105.067c-.13.067-.261.135-.367.24-.136.126-.263.27-.389.405l-.028.029c-.114.116-.228.166-.376.166a.667.667 0 01-.264-.044 1.153 1.153 0 01-.247-.133 3.108 3.108 0 01-.263-.201 4.446 4.446 0 01-.481-.485c-.114-.125-.216-.26-.293-.384a1.463 1.463 0 01-.168-.37c-.012-.066-.012-.132.009-.193.024-.057.065-.104.12-.147.055-.043.123-.08.202-.105a.879.879 0 01.245-.048c.223-.009.409.051.586.115.178.065.345.14.499.222l.075.04c.046.03.08.058.122.089zm7.946-.137c.09.05.178.1.27.151.181.098.35.199.497.315a.957.957 0 01.271.324c.05.105.053.2.016.288a.594.594 0 01-.177.245 2.18 2.18 0 01-.309.225 4.456 4.456 0 01-.655.354c-.11.048-.22.092-.33.132a1.18 1.18 0 01-.346.068.594.594 0 01-.313-.082.66.66 0 01-.198-.199c-.095-.132-.171-.253-.267-.383a1.447 1.447 0 00-.12-.149c-.017-.016-.03-.032-.048-.048l-.003-.002.001-.002.01-.017c.058-.102.113-.2.16-.294.042-.089.073-.173.097-.251v-.001l.013.013c.027.03.07.062.133.104a.5.5 0 00.176.076.56.56 0 00.109.01.347.347 0 00.243-.099.504.504 0 00.122-.174.513.513 0 00.04-.169c.003-.091-.01-.165-.04-.228a.577.577 0 00-.101-.162c.035-.035.085-.08.129-.12.037-.043.076-.08.117-.112.053-.044.095-.078.148-.103a.48.48 0 01.148-.055zm-6.54 4.668c.066 0 .128.021.178.057.05.037.09.09.112.157.024.064.029.131.016.197a.476.476 0 01-.095.183.615.615 0 01-.17.132.698.698 0 01-.212.068 1.09 1.09 0 01-.232.013.71.71 0 01-.22-.043.56.56 0 01-.18-.102.41.41 0 01-.12-.173.372.372 0 01-.018-.21.417.417 0 01.085-.18c.047-.053.107-.097.178-.13a.792.792 0 01.236-.072.895.895 0 01.246.003.694.694 0 01.196.1zm5.097.041c.066-.004.133.007.193.032a.516.516 0 01.169.097c.05.044.091.098.124.158.03.058.046.119.046.18a.358.358 0 01-.08.222.508.508 0 01-.188.152.698.698 0 01-.245.073.833.833 0 01-.258-.008.659.659 0 01-.23-.082.495.495 0 01-.166-.14.404.404 0 01-.08-.196.362.362 0 01.032-.19c.03-.06.075-.113.131-.157a.645.645 0 01.192-.108.67.67 0 01.21-.038l.15.005z"/>
    </svg>
);

// macOS Icon SVG Component
const MacOSIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
);

// Get OS icon based on OS string or payload type
const getOSIcon = (os: string, payloadType: string, size: number = 16, className: string = "") => {
    const osStr = (os || '').toLowerCase();
    const type = (payloadType || '').toLowerCase();

    if (osStr.includes('windows') || type === 'apollo') {
        return <WindowsIcon size={size} className={className} />;
    } else if (osStr.includes('linux') || type === 'poseidon') {
        return <LinuxIcon size={size} className={className} />;
    } else if (osStr.includes('mac') || osStr.includes('darwin') || type === 'medusa') {
        return <MacOSIcon size={size} className={className} />;
    }
    // Default: generic icon
    return <Monitor size={size} className={className} />;
};

const CyberNode = ({ data }: any) => {
    const isHighIntegrity = data.integrity_level > 2;
    // Base colors (Final state)
    const finalBorderColor = isHighIntegrity ? "border-yellow-500" : "border-signal/50";
    const finalGlowColor = isHighIntegrity ? "bg-yellow-500/20" : "bg-signal/20";
    const finalTextColor = isHighIntegrity ? "text-yellow-500" : "text-signal";
    
    const payloadType = data.payloadType || '';
    const os = data.os || '';
    const animationDelay = data.animationDelay || 0;
    const shouldAnimate = data.isNewNode;
    
    const [isHovered, setIsHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, align: 'right' });
    const nodeRef = useRef<HTMLDivElement>(null);

    // Calculate last checkin with live update
    const calculateTimeAgo = useCallback(() => {
        if (!data.last_checkin) return "NEVER";
        try {
            const timeStr = data.last_checkin.endsWith('Z') ? data.last_checkin : `${data.last_checkin}Z`;
            const last = new Date(timeStr).getTime();
            const now = new Date().getTime();
            const diff = Math.floor((now - last) / 1000); 
            
            if (diff < 0) return "0s ago";
            if (diff < 60) return `${diff}s ago`;
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            return `${Math.floor(diff / 86400)}d ago`;
        } catch (e) {
            return "ERROR";
        }
    }, [data.last_checkin]);

    const [lastCheckinText, setLastCheckinText] = useState(calculateTimeAgo());

    useEffect(() => {
        setLastCheckinText(calculateTimeAgo()); // Initial update
        const interval = setInterval(() => {
            setLastCheckinText(calculateTimeAgo());
        }, 1000);
        return () => clearInterval(interval);
    }, [calculateTimeAgo]);

    // Handle tooltip positioning
    const handleMouseEnter = () => {
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

    // 1. Container: Reveal via clip-path (No width animation) to avoid layout thrashing
    const containerVariants = {
        hidden: { 
            opacity: 0, 
            scale: 0.8,
            clipPath: "inset(0 100% 0 0)", // Start fully clipped from right
            borderColor: "#ffffff", // Initial white border
            filter: "blur(5px)"
        },
        visible: { 
            opacity: 1, 
            scale: 1,
            clipPath: "inset(0 0% 0 0)", // Reveal to full width
            borderColor: isHighIntegrity ? "#eab308" : "rgba(34, 197, 94, 0.5)", // Transition to color
            filter: "blur(0px)",
            transition: {
                clipPath: { delay: animationDelay + 0.2, duration: 0.5, ease: "easeOut" }, // Faster, snappier reveal
                borderColor: { delay: animationDelay + 1.0, duration: 1.2, ease: "easeInOut" }, // Faster colorize
                opacity: { duration: 0.4, delay: animationDelay },
                scale: { duration: 0.4, delay: animationDelay },
                filter: { duration: 0.4, delay: animationDelay }
            }
        }
    };

    // 2. Content Reveal: Elements that appear after expansion
    const contentRevealVariants = {
        hidden: { opacity: 0, x: -5 },
        visible: { 
            opacity: 1, 
            x: 0,
            transition: { delay: animationDelay + 0.8, duration: 0.4, ease: "easeOut" } // Faster content reveal
        }
    };

    // 3. Icon Reveal
    const iconRevealVariants = {
        hidden: { scale: 0, opacity: 0 },
        visible: { 
            scale: 1, 
            opacity: 1,
            transition: { delay: animationDelay + 0.7, type: "spring", stiffness: 300, damping: 20 } // Snappy pop-in
        }
    };

    // 4. Glow Reveal
    const glowVariants = {
        hidden: { opacity: 0 },
        visible: { 
            opacity: 1, 
            transition: { delay: animationDelay + 1.0, duration: 1.2, ease: "easeInOut" } // Match border color timing
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
            transition: { delay: animationDelay + 0.5, duration: 0.4, ease: "easeOut" } // Faster wipe
        }
    };

    return (
        <>
            <motion.div 
                ref={nodeRef}
                className="relative"
                initial={shouldAnimate ? "hidden" : "visible"}
                animate="visible"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Hexagonal Glow Background - Appears Last */}
                <motion.div 
                    className={`absolute -inset-1 ${finalGlowColor} blur-md rounded-lg group-hover:bg-opacity-40 transition-all duration-500`}
                    variants={glowVariants}
                />
                
                {/* Main Container */}
                <motion.div 
                    className={`relative bg-[#050505] border p-3 shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center gap-3 overflow-hidden`}
                    style={{
                        borderWidth: '1px',
                        // clipPath handled by variants
                    }}
                    variants={containerVariants}
                >
                    <Handle type="target" position={Position.Top} className="!opacity-0 pointer-events-none !w-3 !h-3" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                    
                    {/* OS Icon - Appears after expansion */}
                    <motion.div
                        variants={iconRevealVariants}
                        className={isHighIntegrity ? "animate-pulse" : ""}
                        style={{ color: "#ffffff" }} // Start white
                        animate={{ 
                            color: isHighIntegrity ? "#eab308" : "#22c55e", // Transition to status color
                            transition: { delay: animationDelay + 1.0, duration: 1.2, ease: "easeInOut" } // Match new faster timing
                        }}
                    >
                        {getOSIcon(os, payloadType, 24, "currentColor")}
                    </motion.div>

                    {/* Info Container */}
                    <div className="flex flex-col min-w-0 whitespace-nowrap"> 
                        {/* Hostname - Appears after expansion (Step 2) */}
                        <motion.span 
                            className="font-bold text-sm tracking-wide block" 
                            variants={hostnameVariants}
                            // style={{ color: "#ffffff" }} // removed, handled by animate below
                            initial="hidden" // Ensure initial state is applied
                            animate={{ 
                                color: "#e5e7eb", // Transition to gray-200
                                clipPath: "inset(0 0 0 0)", // Ensure visible state includes clipPath
                                transition: { 
                                    color: { delay: animationDelay + 1.0, duration: 1.2, ease: "easeInOut" },
                                    clipPath: { delay: animationDelay + 0.5, duration: 0.4, ease: "easeOut" }
                                }
                            }}
                        >
                            {data.host}
                        </motion.span>
                        
                        {/* IP - Appears after hostname (Step 3) */}
                        <motion.span 
                            variants={contentRevealVariants}
                            className="text-xs font-mono text-gray-500 truncate block" // Added block
                        >
                            {data.ip}
                        </motion.span>
                    </div>

                    {/* Status Indicator - Appears last */}
                    <motion.div 
                        variants={contentRevealVariants}
                        className="ml-auto flex gap-1 pl-2"
                    >
                        <div className={`w-2 h-2 ${isHighIntegrity ? "bg-yellow-500" : "bg-signal"} rounded-full animate-pulse shadow-[0_0_5px_currentColor]`}></div>
                    </motion.div>

                    {/* Decorative Elements - Color transition (Step 4) */}
                    <motion.div 
                        className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2"
                        initial={{ borderColor: "#ffffff", opacity: 0 }}
                        animate={{ 
                            borderColor: isHighIntegrity ? "#eab308" : "#22c55e", 
                            opacity: 1 
                        }}
                        transition={{ 
                            opacity: { delay: animationDelay + 0.2, duration: 0.2 },
                            borderColor: { delay: animationDelay + 1.0, duration: 1.2, ease: "easeInOut" } // Match new faster timing
                        }}
                    />
                    <motion.div 
                        className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2"
                        initial={{ borderColor: "#ffffff", opacity: 0 }}
                        animate={{ 
                            borderColor: isHighIntegrity ? "#eab308" : "#22c55e", 
                            opacity: 1 
                        }}
                        transition={{ 
                            opacity: { delay: animationDelay + 0.2, duration: 0.2 },
                            borderColor: { delay: animationDelay + 1.0, duration: 1.2, ease: "easeInOut" } // Match new faster timing
                        }}
                    />
                    
                    <Handle type="source" position={Position.Bottom} className="!opacity-0 pointer-events-none !w-3 !h-3" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                </motion.div>
            </motion.div>

            {/* Portal Tooltip (No changes needed here) */}
            {isHovered && createPortal(
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
                            <div className={`absolute inset-0 opacity-10 bg-[linear-gradient(transparent_0%,${isHighIntegrity ? '#eab308' : '#22c55e'}_50%,transparent_100%)] bg-[length:100%_200%] animate-[scan_3s_linear_infinite] pointer-events-none`}></div>
                            
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
                                        <span className={`font-mono text-sm font-bold ${finalTextColor}`}>NODE_{data.display_id}</span>
                                        {data.pid && <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-1.5 rounded">PID {data.pid}</span>}
                                    </div>
                                    {isHighIntegrity && (
                                        <div className="flex items-center gap-1 bg-yellow-500/20 px-1.5 py-0.5 rounded border border-yellow-500/50">
                                            <Shield size={10} className="text-yellow-500" />
                                            <span className="text-[9px] font-bold text-yellow-500">ADMIN</span>
                                        </div>
                                    )}
                                </div>

                                {/* Main Info Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-0.5 col-span-2">
                                        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">User @ Domain</span>
                                        <div className="flex items-center gap-1.5">
                                            <User size={12} className="text-gray-400 shrink-0" />
                                            <span className="text-xs text-white truncate font-mono">
                                                {data.user}
                                                {data.domain && <span className="text-gray-500">@{data.domain}</span>}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">OS / Arch</span>
                                        <div className="flex items-center gap-1.5">
                                            <Cpu size={12} className="text-gray-400 shrink-0" />
                                            <span className="text-xs text-white truncate font-mono">
                                                {os || 'Unknown'} {data.architecture && `(${data.architecture})`}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">Agent</span>
                                        <div className="flex items-center gap-1.5">
                                            <Terminal size={12} className="text-gray-400 shrink-0" />
                                            <span className="text-xs text-white uppercase font-mono">{payloadType}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Last Checkin Bar */}
                                <div className="bg-white/5 rounded p-2 border border-white/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-mono text-gray-500 uppercase">Last Checkin</span>
                                        <span className={`text-[10px] font-mono font-bold ${lastCheckinText.includes('s') ? 'text-green-500' : 'text-red-400'}`}>
                                            {lastCheckinText}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                                        <motion.div 
                                            className={`h-full ${lastCheckinText.includes('s') ? 'bg-green-500' : 'bg-red-500'}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: lastCheckinText.includes('s') ? '100%' : '30%' }}
                                            transition={{ duration: 1 }}
                                        />
                                    </div>
                                </div>

                                {/* Description if available */}
                                {data.description && (
                                    <div className="text-[10px] text-gray-400 italic border-t border-white/10 pt-2">
                                        "{data.description}"
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

const RootNode = ({ data }: any) => {
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
                animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.1, 0.3]
                }}
                transition={{ 
                    duration: 3, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                }}
            />
            <motion.div 
                className="absolute -inset-4 bg-signal/10 blur-xl rounded-full"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                    scale: [1, 1.1, 1],
                    opacity: [0.5, 0.2, 0.5]
                }}
                transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    ease: "easeInOut",
                    delay: 0.5
                }}
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
                    animate={{ 
                        scale: [1, 1.5 + i * 0.3],
                        opacity: [0.5, 0]
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.6,
                        ease: "easeOut"
                    }}
                />
            ))}
            
            <motion.div 
                className="relative w-32 h-32 flex flex-col items-center justify-center bg-black border-2 border-signal shadow-[0_0_30px_rgba(34,197,94,0.3)]"
                style={{
                    clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
                }}
                animate={{
                    boxShadow: [
                        "0 0 30px rgba(34,197,94,0.3)",
                        "0 0 50px rgba(34,197,94,0.5)",
                        "0 0 30px rgba(34,197,94,0.3)"
                    ]
                }}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            >
                {/* 隱藏的連接點，置中以確保連線從圖形中心出發 */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="!opacity-0 pointer-events-none !w-3 !h-3"
                    style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                />
                <Handle
                    type="target"
                    position={Position.Top}
                    className="!opacity-0 pointer-events-none !w-3 !h-3"
                    style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                />
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
                >
                    <Network size={32} className="text-signal mb-2" />
                </motion.div>
                <motion.div 
                    className="text-signal font-bold tracking-widest text-xs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                >
                    MINERVA
                </motion.div>
                <motion.div 
                    className="text-[10px] text-gray-500 font-mono"
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

const PulseEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data
  }: EdgeProps) => {
    const [edgePath] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });
  
    // Use timestamp as key to trigger animation restart
    const timestamp = data?.timestamp;
  
    return (
      <>
        <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
        {data?.active && (
          <g>
             <circle r="4" fill="#ffffff" filter="url(#glow-pulse)" opacity="0">
                <animateMotion 
                    key={timestamp}
                    dur="1.5s" 
                    repeatCount="1" 
                    path={edgePath} 
                    keyPoints="1;0"
                    keyTimes="0;1"
                    calcMode="linear"
                    fill="remove"
                />
                <animate 
                    key={`${timestamp}-opacity`}
                    attributeName="opacity" 
                    values="1;1" 
                    dur="1.5s" 
                    repeatCount="1" 
                    fill="remove"
                />
             </circle>
          </g>
        )}
      </>
    );
  };

const nodeTypes = {
    custom: CyberNode,
    root: RootNode
};

const edgeTypes = {
    pulse: PulseEdge
};

// Simple manual tree layout function
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    // 1. Identify Root
    const root = nodes.find(n => n.id === 'root');
    if (!root) return { nodes, edges };

    const layoutedNodes = nodes.map(node => {
        if (node.id === 'root') {
            return { ...node, position: { x: 400, y: 50 } };
        }
        return node;
    });

    // 2. Arrange Callbacks (Level 1)
    // Find all nodes connected to root
    const rootEdges = edges.filter(e => e.source === 'root' || e.target === 'root');
    const level1NodeIds = new Set(rootEdges.map(e => e.source === 'root' ? e.target : e.source));
    
    // Simple grid layout for level 1
    const yLevel1 = 300; // Increased spacing
    
    // Sort nodes so display is consistent (e.g. by ID)
    const level1Nodes = layoutedNodes.filter(n => level1NodeIds.has(n.id)).sort((a,b) => a.id.localeCompare(b.id));
    
    // Calculate total width to center them
    const nodeWidth = 250;
    const totalWidth = level1Nodes.length * nodeWidth;
    let startX = 400 - (totalWidth / 2) + (nodeWidth / 2); // Center relative to root at 400

    level1Nodes.forEach((node, index) => {
        node.position = { x: startX + (index * nodeWidth), y: yLevel1 };
    });

    // 3. Handle deeper levels (simplified for now: just pile them below if P2P)
    // For now, if there are nodes NOT in level1 and NOT root, we place them further down
    const otherNodes = layoutedNodes.filter(n => n.id !== 'root' && !level1NodeIds.has(n.id));
    otherNodes.forEach((node, index) => {
         node.position = { x: 100 + (index * 250), y: 500 };
    });

    return { nodes: layoutedNodes, edges };
};

export function CallbackGraph() {
    const { data: callbacksData, loading: callbacksLoading, error: callbacksError } = useQuery(GET_CALLBACKS, { pollInterval: 5000 });
    const { data: edgesData, loading: edgesLoading, error: edgesError } = useQuery(GET_CALLBACK_GRAPH_EDGES, { pollInterval: 5000 });

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
    const [isInitialRender, setIsInitialRender] = useState(true);
    const seenNodeIds = useRef(new Set<string>());
    const navigate = useNavigate();

    const onNodeClick = useCallback((event: any, node: Node) => {
        if (node.type === 'custom' && node.data?.display_id) {
            navigate(`/console/${node.data.display_id}`);
        }
    }, [navigate]);
    
    // Track when initial animation should complete
    useEffect(() => {
        if (isInitialRender && callbacksData?.callback?.length > 0) {
            const timeout = setTimeout(() => {
                setIsInitialRender(false);
            }, 3000); // Allow 3 seconds for initial animations
            return () => clearTimeout(timeout);
        }
    }, [callbacksData, isInitialRender]);

    // Transform data to React Flow format
    const graphData = useMemo(() => {
        if (!callbacksData?.callback) return { nodes: [], edges: [] };

        const flowNodes: Node[] = callbacksData.callback.map((c: any, index: number) => {
            const nodeId = String(c.id);
            const isNewNode = !seenNodeIds.current.has(nodeId);
            
            // Calculate animation delay: only animate on initial render or for new nodes
            let animationDelay = 0;
            if (isInitialRender) {
                // During initial render, stagger all nodes from center outward
                animationDelay = 0.3 + (index * 0.08); // 0.8/0.15 -> 0.3/0.08
            } else if (isNewNode) {
                // New nodes after initial render get a quick animation
                animationDelay = 0.1;
            }
            
            // Mark node as seen
            seenNodeIds.current.add(nodeId);
            
            return {
                id: nodeId,
                type: 'custom',
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                position: { x: 0, y: 0 },
                data: { 
                    display_id: c.display_id, 
                    user: c.user, 
                    host: c.host,
                    ip: (() => { try { return JSON.parse(c.ip)[0] } catch(e) { return c.ip } })(),
                    integrity_level: c.integrity_level,
                    payloadType: c.payload?.payloadtype?.name || '',
                    os: c.os,
                    last_checkin: c.last_checkin,
                    pid: c.pid, // Add PID
                    architecture: c.architecture, // Add Architecture
                    domain: c.domain, // Add Domain
                    description: c.description, // Add Description
                    animationDelay: animationDelay,
                    isNewNode: isNewNode || isInitialRender,
                    label: `Callback ${c.display_id}` 
                },
            };
        });

        // Add "Minerva" root node
        flowNodes.push({
            id: 'root',
            type: 'root',
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            data: { label: 'Minerva C2' },
            position: { x: 400, y: 50 },
        });

        const flowEdges: Edge[] = [];
        
        // Add edges from database
        if (edgesData?.callbackgraphedge) {
            edgesData.callbackgraphedge.forEach((e: any) => {
                if (!e.end_timestamp && e.source && e.destination) { // Only active edges and valid source/dest
                    flowEdges.push({
                        id: `e${e.source.id}-${e.destination.id}`,
                        source: String(e.source.id),
                        target: String(e.destination.id),
                        animated: false,
                        style: { stroke: '#ffffff', strokeWidth: 2.5 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' },
                        label: e.c2profile?.name || 'Linked'
                    });
                }
            });
        }

        // Ensure EVERY callback has一條直連 Minerva 的連線
        const existingRootEdges = new Set(
            flowEdges
                .filter(e => e.source === 'root')
                .map(e => e.target)
        );

        flowNodes
            .filter(n => n.id !== 'root')
            .forEach((n) => {
                if (!existingRootEdges.has(n.id)) {
                    // Check if recent checkin (< 5s)
                    let isRecent = false;
                    let timestamp = '';
                    if (n.data?.last_checkin) {
                        try {
                            const timeStr = n.data.last_checkin.endsWith('Z') ? n.data.last_checkin : `${n.data.last_checkin}Z`;
                            timestamp = timeStr;
                            const last = new Date(timeStr).getTime();
                            const now = new Date().getTime();
                            const diff = (now - last) / 1000;
                            if (diff < 5) isRecent = true;
                        } catch(e) {}
                    }

                    flowEdges.push({
                        id: `root-${n.id}`,
                        source: 'root',
                        target: n.id,
                        type: 'pulse',
                        animated: false,
                        style: { stroke: '#ffffff', strokeWidth: 2.5 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' },
                        data: { active: isRecent, timestamp: timestamp, highIntegrity: n.data.integrity_level > 2 }
                    });
                }
            });

        return { nodes: flowNodes, edges: flowEdges };
    }, [callbacksData, edgesData]);

    // Apply layout when data changes
    React.useEffect(() => {
        if (graphData.nodes.length > 0) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(graphData.nodes, graphData.edges);

            // 保留既有節點的位置，僅為新節點設定 layout 位置，避免視角跳動
            setNodes((prev) => {
                const prevMap = new Map(prev.map(n => [n.id, n]));
                return layoutedNodes.map((n) => {
                    const existing = prevMap.get(n.id);
                    if (existing && existing.position) {
                        return { ...n, position: existing.position };
                    }
                    return n;
                });
            });
            setEdges(layoutedEdges);
        }
    }, [graphData, setNodes, setEdges]);

    return (
        <div className="w-full h-full bg-[#050505] border border-ghost/30 relative overflow-hidden rounded-lg">
             {/* Loading/Error Indicators */}
             {(callbacksLoading && !callbacksData) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 text-signal font-mono text-xs">
                    LOADING_TOPOLOGY...
                </div>
            )}
            
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-[0.1] pointer-events-none" 
                 style={{ 
                     backgroundImage: `
                        linear-gradient(rgba(34, 197, 94, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(34, 197, 94, 0.1) 1px, transparent 1px)
                     `,
                     backgroundSize: '40px 40px'
                 }}>
            </div>

            {/* Filters for Edge Effects */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
              <defs>
                <filter id="glow-pulse" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                    type: 'straight',
                    style: { stroke: '#ffffff', strokeWidth: 2.5, opacity: 0.95, zIndex: 200 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' },
                    animated: true
                }}
                defaultViewport={viewportRef.current}
                onMoveEnd={(_, viewport) => { viewportRef.current = viewport; }}
                onNodeClick={onNodeClick}
                fitView
                fitViewOptions={{ padding: 0.5, minZoom: 0.1, maxZoom: 1 }}
                className="bg-transparent"
                minZoom={0.1}
                maxZoom={4}
            >
                <Background color="#333" gap={20} className="opacity-20" />
                <Controls className="bg-black/80 border border-signal/30 text-signal fill-signal !rounded-none" />
                <MiniMap 
                    nodeColor={() => '#22c55e'} 
                    maskColor="rgba(0, 0, 0, 0.8)" 
                    className="bg-black/90 border border-signal/30 !rounded-none"
                />
            </ReactFlow>
            
            {/* Status Overlay */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-xs font-mono text-signal bg-black/60 px-3 py-1 border border-signal/20 backdrop-blur-sm shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                    <div className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
                    NETWORK_TOPOLOGY_ACTIVE
                </div>
            </div>
        </div>
    );
}