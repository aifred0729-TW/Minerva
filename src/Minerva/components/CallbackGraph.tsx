import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
    ReactFlow, 
    Background, 
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
import { useQuery, useMutation } from '@apollo/client';
import { 
    GET_CALLBACK_GRAPH_EDGES, 
    GET_CALLBACKS, 
    HIDE_CALLBACK_MUTATION, 
    LOCK_CALLBACK_MUTATION, 
    UPDATE_CALLBACK_DESCRIPTION_MUTATION, 
    ADD_EDGE_MUTATION, 
    REMOVE_EDGE_MUTATION, 
    GET_P2P_PROFILES_AND_CALLBACKS, 
    GET_C2_PROFILES,
    GET_CUSTOM_GRAPH_NODES,
    CREATE_CUSTOM_GRAPH_NODE,
    UPDATE_CUSTOM_GRAPH_NODE,
    DELETE_CUSTOM_GRAPH_NODE,
    GET_CUSTOM_GRAPH_EDGES,
    CREATE_CUSTOM_GRAPH_EDGE,
    DELETE_CUSTOM_GRAPH_EDGE
} from '../lib/api';
import { 
    parseAgentStorageResults, 
    prepareCreateNodeData, 
    prepareUpdateNodeData, 
    generateNextId,
    generateUniqueId,
    parseEdgeStorageResults,
    serializeEdgeData,
    generateEdgeUniqueId
} from '../lib/customGraphNodeService';
// @ts-ignore
import { Terminal, Cpu, User, Share2, Hexagon, Shield, Network, Monitor, Skull, Lock, Unlock, EyeOff, Edit, Info, GitBranch, X, ChevronRight, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { snackActions } from '../../Archive/components/utilities/Snackbar';
import { CyberModal } from './CyberModal';

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
        // Custom nodes don't have real checkin times
        if (data.isCustom) return "N/A";
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
    }, [data.last_checkin, data.isCustom]);

    const [lastCheckinText, setLastCheckinText] = useState(calculateTimeAgo());

    useEffect(() => {
        setLastCheckinText(calculateTimeAgo()); // Initial update
        const interval = setInterval(() => {
            setLastCheckinText(calculateTimeAgo());
        }, 1000);
        return () => clearInterval(interval);
    }, [calculateTimeAgo]);

    const [showDeadState, setShowDeadState] = useState(false);
    
    // Parse time to determining status
    const deadCheck = useMemo(() => {
        // Custom nodes are never "dead"
        if (data.isCustom) return false;
        if (!data.last_checkin) return false;
        try {
            const timeStr = data.last_checkin.endsWith('Z') ? data.last_checkin : `${data.last_checkin}Z`;
            const last = new Date(timeStr).getTime();
            const now = new Date().getTime();
            const diff = (now - last) / 1000;
            return diff > 300; // > 5 minutes
        } catch(e) {
            return false;
        }
    }, [lastCheckinText, data.last_checkin, data.isCustom]);

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
    let mainColor = "#22c55e"; // Green default
    let borderColor = "border-signal/50"; 
    let glowColor = "bg-signal/20";
    let textColor = "text-signal";
    let bgColor = "bg-[#050505]";

    if (isDead) {
        mainColor = "#ef4444"; // Red
        borderColor = "border-red-500/50";
        glowColor = "bg-red-500/0"; 
        textColor = "text-black";
        bgColor = "bg-red-600";
    } else if (isHighIntegrity) {
        mainColor = "#eab308"; // Yellow
        borderColor = "border-yellow-500";
        glowColor = "bg-yellow-500/20";
        textColor = "text-yellow-500";
    }

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
            borderColor: isDead ? "#ef4444" : (isHighIntegrity ? "#eab308" : "rgba(34, 197, 94, 0.5)"), // Transition to color
            filter: "blur(0px)",
            transition: {
                clipPath: { delay: animationDelay + 0.2, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }, // Faster, snappier reveal
                borderColor: { delay: animationDelay + 1.0, duration: 1.2, ease: [0.42, 0, 0.58, 1] }, // Faster colorize
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
            transition: { delay: animationDelay + 0.8, duration: 0.4 }
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
                            borderColor: isDead ? "#ef4444" : (isHighIntegrity ? "#eab308" : "rgba(34, 197, 94, 0.5)"),
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
                        className={`relative border p-3 shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center gap-3 overflow-hidden w-[230px]`}
                    > 
                     
                    <Handle type="target" position={Position.Top} className="!opacity-0 pointer-events-none !w-3 !h-3" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                    
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
                        ) : (
                            getOSIcon(os, payloadType, 24, "currentColor")
                        )}
                    </motion.div>

                    {/* Info Container */}
                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden"> 
                        {/* Hostname - Appears after expansion (Step 2) */}
                        <motion.span 
                            className="font-bold text-sm tracking-wide block truncate" 
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
                            className={`text-xs font-mono truncate block ${isDead ? "text-black/80" : "text-gray-500"}`}
                        >
                            {data.ip}
                        </motion.span>
                    </div>

                    {/* Status Indicator - Appears last */}
                    <motion.div 
                        variants={contentRevealVariants}
                        className="ml-auto flex gap-1 pl-2"
                    >
                        <div className={`w-2 h-2 ${isDead ? "bg-black" : (isHighIntegrity ? "bg-yellow-500" : "bg-signal")} rounded-full animate-pulse shadow-[0_0_5px_currentColor] transition-colors duration-1000`}></div>
                    </motion.div>

                    {/* Decorative Elements - Color transition (Step 4) */}
                    <motion.div 
                        className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2"
                        initial={{ borderColor: "#ffffff", opacity: 0 }}
                        animate={{ 
                            borderColor: isDead ? "#000000" : (isHighIntegrity ? "#eab308" : "#22c55e"), 
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
                            borderColor: isDead ? "#000000" : (isHighIntegrity ? "#eab308" : "#22c55e"), 
                            opacity: 1 
                        }}
                        transition={{ 
                            opacity: { delay: animationDelay + 0.2, duration: 0.2 },
                            borderColor: { delay: isDead ? 0 : animationDelay + 1.0, duration: 1.2, ease: "easeInOut" }
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
                                        <span className={`text-[10px] font-mono font-bold ${
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
                                        <div className="text-[9px] text-cyan-400 mt-1 italic">
                                            Custom node - no active connection
                                        </div>
                                    )}
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
    data,
    label
  }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getStraightPath({
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
        {/* Edge Label */}
        {label && (
          <g transform={`translate(${labelX}, ${labelY})`}>
            <rect
              x={-((String(label).length * 5 + 8) / 2)}
              y={-9}
              width={String(label).length * 5 + 8}
              height={18}
              rx={4}
              fill="rgba(255, 255, 255, 0.95)"
              stroke="rgba(0, 0, 0, 0.2)"
              strokeWidth={1}
            />
            <text
              style={{
                fontSize: 10,
                fontWeight: 600,
                fill: '#1a1a1a',
              }}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {String(label)}
            </text>
          </g>
        )}
        {data?.active && (
          <g>
             <circle r="4" fill="#ffffff" filter="url(#glow-pulse)" opacity="0">
                <animateMotion 
                    key={String(timestamp || '')}
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
    const { data: callbacksData, loading: callbacksLoading, error: callbacksError, refetch } = useQuery(GET_CALLBACKS, { pollInterval: 5000 });
    const { data: edgesData, loading: edgesLoading, error: edgesError, refetch: refetchEdges } = useQuery(GET_CALLBACK_GRAPH_EDGES, { pollInterval: 5000 });
    const { data: p2pData, refetch: refetchP2P } = useQuery(GET_P2P_PROFILES_AND_CALLBACKS, { fetchPolicy: "network-only" });
    const { data: allC2Data, refetch: refetchAllC2 } = useQuery(GET_C2_PROFILES, { fetchPolicy: "network-only" });

    // Mutations
    const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION);
    const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION);
    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [addEdge] = useMutation(ADD_EDGE_MUTATION);
    const [removeEdge] = useMutation(REMOVE_EDGE_MUTATION);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
    const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
    const [isInitialRender, setIsInitialRender] = useState(true);
    const seenNodeIds = useRef(new Set<string>());
    const navigate = useNavigate();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; callback: any } | null>(null);
    const [editDescriptionModal, setEditDescriptionModal] = useState<any | null>(null);
    const [newDescription, setNewDescription] = useState("");
    const [detailsModal, setDetailsModal] = useState<any | null>(null);
    const [setParentModal, setSetParentModal] = useState<any | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);
    const [selectedDestination, setSelectedDestination] = useState<any>(null);
    const [edgeLabel, setEdgeLabel] = useState("");
    const [isP2PConnection, setIsP2PConnection] = useState(true);
    
    // Custom Node State
    const [showCustomNodeModal, setShowCustomNodeModal] = useState(false);
    const [editCustomNodeModal, setEditCustomNodeModal] = useState<any | null>(null);
    const [customNodes, setCustomNodes] = useState<any[]>([]);
    const [customEdges, setCustomEdges] = useState<any[]>([]);
    const [customNodeForm, setCustomNodeForm] = useState({
        host: '',
        os: 'Windows',
        ip: '',
        user: '',
        description: '',
        architecture: 'x64'
    });
    const [showHiddenNodes, setShowHiddenNodes] = useState(false);
    const [showExportImportModal, setShowExportImportModal] = useState(false);
    const [exportData, setExportData] = useState('');
    const [importData, setImportData] = useState('');

    // GraphQL for custom nodes - use polling for real-time updates
    const { data: customNodesData, refetch: refetchCustomNodes } = useQuery(GET_CUSTOM_GRAPH_NODES, {
        pollInterval: 5000,
        fetchPolicy: 'network-only'
    });

    // GraphQL for custom edges - use polling for real-time updates
    const { data: customEdgesData, refetch: refetchCustomEdges } = useQuery(GET_CUSTOM_GRAPH_EDGES, {
        pollInterval: 5000,
        fetchPolicy: 'network-only'
    });

    const [createCustomNodeMutation] = useMutation(CREATE_CUSTOM_GRAPH_NODE);
    const [updateCustomNodeMutation] = useMutation(UPDATE_CUSTOM_GRAPH_NODE);
    const [deleteCustomNodeMutation] = useMutation(DELETE_CUSTOM_GRAPH_NODE);
    const [createCustomEdgeMutation] = useMutation(CREATE_CUSTOM_GRAPH_EDGE);
    const [deleteCustomEdgeMutation] = useMutation(DELETE_CUSTOM_GRAPH_EDGE);

    // Sync custom nodes from GraphQL (agentstorage)
    useEffect(() => {
        console.log('[CallbackGraph] customNodesData changed:', customNodesData);
        
        if (customNodesData?.agentstorage) {
            console.log('[CallbackGraph] Found agentstorage data:', customNodesData.agentstorage);
            try {
                const parsedNodes = parseAgentStorageResults(customNodesData.agentstorage);
                console.log('[CallbackGraph] Parsed nodes:', parsedNodes);
                
                const nodes = parsedNodes.map((node: any) => ({
                    id: `custom-${node.id}`,
                    db_id: node.id,
                    display_id: node.id, // Add display_id for compatibility
                    host: node.hostname,
                    ip: node.ip_address,
                    os: node.operating_system,
                    architecture: node.architecture,
                    user: node.username || 'N/A',
                    description: node.description || '',
                    isHidden: node.hidden || false,
                    isCustom: true,
                    timestamp: node.timestamp,
                    position: node.position,
                    parent_id: node.parent_id,
                    parent_type: node.parent_type,
                    c2profile: node.c2profile
                }));
                
                console.log('[CallbackGraph] Mapped internal nodes:', nodes);
                setCustomNodes(nodes);
                console.log('[CallbackGraph] setCustomNodes called with', nodes.length, 'nodes');
                
                // Generate edges from parent relationships
                const parentEdgesFromNodes = nodes
                    .filter((node: any) => node.parent_id !== undefined && node.parent_id !== null)
                    .map((node: any) => ({
                        id: `custom-edge-${node.db_id}`,
                        source: node.id,
                        target: node.parent_type === 'custom' ? `custom-${node.parent_id}` : node.parent_id,
                        sourceId: node.db_id,
                        targetId: node.parent_id,
                        c2profile: node.c2profile || ''
                    }));
                
                console.log('[CallbackGraph] Generated edges from parent relationships:', parentEdgesFromNodes);
                
                // Update edges while preserving callback->custom edges
                setCustomEdges(prevEdges => {
                    // Keep callback->custom edges (from database)
                    const callbackEdges = prevEdges.filter(e => e.id.includes('callback-'));
                    // Replace parent edges with new ones
                    console.log('[CallbackGraph] Merging parent edges:', parentEdgesFromNodes.length, 'with callback edges:', callbackEdges.length);
                    return [...parentEdgesFromNodes, ...callbackEdges];
                });
            } catch (error) {
                console.error('[CallbackGraph] Failed to parse custom nodes from agentstorage:', error);
                snackActions.error('Failed to load custom nodes: ' + (error as Error).message);
            }
        } else {
            console.log('[CallbackGraph] No agentstorage data in customNodesData');
        }
    }, [customNodesData]);

    // Sync custom edges from GraphQL (stored edges in agentstorage)
    useEffect(() => {
        console.log('[CallbackGraph] customEdgesData changed:', customEdgesData);
        
        if (customEdgesData?.agentstorage) {
            console.log('[CallbackGraph] Found custom edges data:', customEdgesData.agentstorage);
            try {
                const storedCallbackEdges = parseEdgeStorageResults(customEdgesData.agentstorage);
                console.log('[CallbackGraph] Parsed callback->custom edges:', storedCallbackEdges);
                
                // Update edges while preserving parent edges
                setCustomEdges(prevEdges => {
                    // Keep parent edges (custom node -> callback/custom)
                    const parentEdges = prevEdges.filter(e => e.id.startsWith('custom-edge-') && !e.id.includes('callback-'));
                    // Replace callback edges with stored ones
                    console.log('[CallbackGraph] Merging stored callback edges:', storedCallbackEdges.length, 'with parent edges:', parentEdges.length);
                    return [...parentEdges, ...storedCallbackEdges];
                });
            } catch (error) {
                console.error('[CallbackGraph] Failed to parse custom edges:', error);
            }
        } else {
            console.log('[CallbackGraph] No custom edges data, keeping only parent edges');
            // No stored edges, remove callback edges but keep parent edges
            setCustomEdges(prevEdges => prevEdges.filter(e => e.id.startsWith('custom-edge-') && !e.id.includes('callback-')));
        }
    }, [customEdgesData]);

    // Context menu handlers
    const handleContextMenu = useCallback((e: React.MouseEvent, callback: any, nodeRect: DOMRect | undefined) => {
        e.preventDefault();
        const x = e.clientX;
        const y = e.clientY;
        setContextMenu({ x, y, callback });
    }, []);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // Handlers
    const handleHide = async (callback: any) => {
        try {
            await hideCallback({ variables: { callback_display_id: callback.display_id, active: false } });
            snackActions.success(`Callback ${callback.display_id} hidden`);
            refetch();
        } catch (e: any) {
            snackActions.error("Failed to hide callback: " + e.message);
        }
        setContextMenu(null);
    };

    const handleLockToggle = async (callback: any) => {
        try {
            await lockCallback({ variables: { callback_display_id: callback.display_id, locked: !callback.locked } });
            snackActions.success(`Callback ${callback.display_id} ${callback.locked ? "unlocked" : "locked"}`);
            refetch();
        } catch (e: any) {
            snackActions.error("Failed to toggle lock: " + e.message);
        }
        setContextMenu(null);
    };

    const openEditDescription = (callback: any) => {
        setEditDescriptionModal(callback);
        setNewDescription(callback.description || "");
        setContextMenu(null);
    };

    const handleSaveDescription = async () => {
        if (!editDescriptionModal) return;
        try {
            await updateDescription({ variables: { callback_display_id: editDescriptionModal.display_id, description: newDescription } });
            snackActions.success("Description updated");
            refetch();
            setEditDescriptionModal(null);
        } catch (e: any) {
            snackActions.error("Failed to update description: " + e.message);
        }
    };

    const openSetParent = (callback: any) => {
        setSetParentModal(callback);
        setSelectedProfile(null);
        setSelectedDestination(null);
        setEdgeLabel("");
        setIsP2PConnection(true);
        refetchP2P();
        refetchAllC2();
        setContextMenu(null);
    };

    const handleCreateCustomNode = async () => {
        console.log('[handleCreateCustomNode] === START ===');
        console.log('[handleCreateCustomNode] Form:', customNodeForm);
        
        if (!customNodeForm.host || !customNodeForm.ip) {
            console.error('[handleCreateCustomNode] Validation failed - missing host or IP');
            snackActions.error("Hostname and IP are required");
            return;
        }
        
        try {
            console.log('[handleCreateCustomNode] Parsing existing nodes...');
            // Generate next ID based on existing nodes
            const parsedNodes = customNodesData?.agentstorage 
                ? parseAgentStorageResults(customNodesData.agentstorage) 
                : [];
            console.log('[handleCreateCustomNode] Found', parsedNodes.length, 'existing nodes');
            console.log('[handleCreateCustomNode] Existing node IDs:', parsedNodes.map(n => n.id));
            
            const nextId = generateNextId(parsedNodes);
            console.log('[handleCreateCustomNode] Generated next ID:', nextId);
            
            // Prepare data for agentstorage
            console.log('[handleCreateCustomNode] Preparing node data...');
            const { unique_id, data } = prepareCreateNodeData({
                hostname: customNodeForm.host,
                ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os,
                architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined,
                description: customNodeForm.description
            }, nextId);
            
            console.log('[handleCreateCustomNode] unique_id:', unique_id);
            console.log('[handleCreateCustomNode] data (first 100 chars):', data.substring(0, 100));
            console.log('[handleCreateCustomNode] data length:', data.length);
            
            console.log('[handleCreateCustomNode] Calling createCustomNodeMutation...');
            const result = await createCustomNodeMutation({
                variables: {
                    unique_id,
                    data
                }
            });

            console.log('[handleCreateCustomNode] Mutation completed. Result:', result);
            
            if (result.data?.insert_agentstorage_one) {
                console.log('[handleCreateCustomNode] Created successfully:', result.data.insert_agentstorage_one);
                snackActions.success(`Custom node "${customNodeForm.host}" created`);
                setShowCustomNodeModal(false);
                
                // Force refetch to get updated data
                console.log('[handleCreateCustomNode] Refetching custom nodes...');
                await refetchCustomNodes();
                console.log('[handleCreateCustomNode] Refetch complete');
                
                // Reset form
                setCustomNodeForm({
                    host: '',
                    os: 'Windows',
                    ip: '',
                    user: '',
                    description: '',
                    architecture: 'x64'
                });
            } else {
                throw new Error('Failed to create node');
            }
        } catch (e: any) {
            console.error('Create custom node error:', e);
            snackActions.error("Failed to create custom node: " + e.message);
        }
    };
    
    const openEditCustomNode = (node: any) => {
        setEditCustomNodeModal(node);
        setCustomNodeForm({
            host: node.host,
            os: node.os,
            ip: node.ip,
            user: node.user,
            description: node.description || '',
            architecture: node.architecture
        });
        setContextMenu(null);
    };
    
    const handleUpdateCustomNode = async () => {
        if (!customNodeForm.host || !customNodeForm.ip) {
            snackActions.error("Hostname and IP are required");
            return;
        }

        try {
            // Prepare data for agentstorage update
            const { unique_id, data } = prepareUpdateNodeData({
                id: editCustomNodeModal.db_id,
                hostname: customNodeForm.host,
                ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os,
                architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined,
                description: customNodeForm.description,
                hidden: editCustomNodeModal.isHidden || false
            });
            
            const result = await updateCustomNodeMutation({
                variables: {
                    unique_id,
                    data
                }
            });

            if (result.data?.update_agentstorage?.affected_rows > 0) {
                snackActions.success('Custom node updated successfully');
                setEditCustomNodeModal(null);
                refetchCustomNodes();
                
                setCustomNodeForm({
                    host: '',
                    os: 'Windows',
                    ip: '',
                    user: '',
                    description: '',
                    architecture: 'x64'
                });
            } else {
                throw new Error('No rows updated');
            }
        } catch (e: any) {
            console.error('Update custom node error:', e);
            snackActions.error("Failed to update custom node: " + e.message);
        }
    };
    
    const handleDeleteCustomNode = async (node: any) => {
        try {
            const unique_id = generateUniqueId(node.db_id);
            
            const result = await deleteCustomNodeMutation({
                variables: {
                    unique_id
                }
            });

            if (result.data?.delete_agentstorage?.affected_rows > 0) {
                // Remove edges connected to this custom node (local only)
                setCustomEdges(
                    customEdges.filter(
                        (edge) => edge.source !== node.id && edge.target !== node.id
                    )
                );
                snackActions.success(`Custom node "${node.host}" deleted successfully`);
                setContextMenu(null);
                refetchCustomNodes();
            } else {
                throw new Error('Failed to delete node from database');
            }
        } catch (e: any) {
            console.error('Delete custom node error:', e);
            snackActions.error("Failed to delete custom node: " + e.message);
        }
    };
    
    const handleExportCustomNodes = () => {
        const exportObj = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            customNodes,
            customEdges
        };
        setExportData(JSON.stringify(exportObj, null, 2));
        setShowExportImportModal(true);
    };
    
    const handleImportCustomNodes = () => {
        try {
            const importObj = JSON.parse(importData);
            if (!importObj.customNodes || !Array.isArray(importObj.customNodes)) {
                snackActions.error('Invalid import data format');
                return;
            }
            
            // Import custom edges (local only)
            if (importObj.customEdges && Array.isArray(importObj.customEdges)) {
                const existingEdgeIds = new Set(customEdges.map((e: any) => e.id));
                const newEdges = importObj.customEdges.filter((e: any) => !existingEdgeIds.has(e.id));
                setCustomEdges([...customEdges, ...newEdges]);
            }
            
            snackActions.success(`Import data ready - nodes will be created in the backend`);
            setShowExportImportModal(false);
            setImportData('');
        } catch (e: any) {
            snackActions.error('Failed to import: ' + e.message);
        }
    };
    
    const handleCopyExportData = () => {
        navigator.clipboard.writeText(exportData);
        snackActions.success('Copied to clipboard');
    };
    
    const handleSetParent = async () => {
        if (!setParentModal || !selectedProfile || !selectedDestination) {
            snackActions.error("Please select a C2 profile and destination node");
            return;
        }
        
        // Check if either node is a custom node
        const isSourceCustom = setParentModal.isCustom;
        const isDestCustom = selectedDestination.isCustom;
        
        console.log('[handleSetParent] isSourceCustom:', isSourceCustom, 'isDestCustom:', isDestCustom);
        console.log('[handleSetParent] setParentModal:', setParentModal);
        console.log('[handleSetParent] selectedDestination:', selectedDestination);
        
        if (isSourceCustom) {
            // Source is a custom node - need to update in database
            try {
                console.log('[handleSetParent] Updating custom node parent connection...');
                console.log('[handleSetParent] Source:', setParentModal.id, 'db_id:', setParentModal.db_id);
                console.log('[handleSetParent] Destination:', selectedDestination.id, 'display_id:', selectedDestination.display_id);
                
                // Find the full custom node data
                const sourceNode = customNodes.find(n => n.id === setParentModal.id);
                if (!sourceNode) {
                    console.error('[handleSetParent] Source node not found in customNodes:', setParentModal.id);
                    console.error('[handleSetParent] Available custom nodes:', customNodes.map(n => n.id));
                    snackActions.error("Source node not found");
                    return;
                }
                
                console.log('[handleSetParent] Found source node:', sourceNode);
                
                // Prepare updated node data with parent connection
                const { unique_id, data } = prepareUpdateNodeData({
                    id: sourceNode.db_id,
                    hostname: sourceNode.host,
                    ip_address: sourceNode.ip,
                    operating_system: sourceNode.os,
                    architecture: sourceNode.architecture,
                    username: sourceNode.user !== 'N/A' ? sourceNode.user : undefined,
                    description: sourceNode.description,
                    hidden: sourceNode.isHidden,
                    parent_id: isDestCustom ? selectedDestination.db_id : selectedDestination.display_id,
                    parent_type: isDestCustom ? 'custom' : 'callback',
                    c2profile: selectedProfile.name
                });
                
                console.log('[handleSetParent] Updating with parent_id:', isDestCustom ? selectedDestination.db_id : selectedDestination.display_id);
                
                const result = await updateCustomNodeMutation({
                    variables: { unique_id, data }
                });
                
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Linked to ${isDestCustom ? 'Custom Node' : 'Callback'} #${selectedDestination.display_id || selectedDestination.db_id}`);
                    refetchCustomNodes();
                } else {
                    snackActions.error("Failed to update custom node connection");
                }
            } catch (e: any) {
                console.error('[handleSetParent] Error:', e);
                snackActions.error("Failed to link: " + e.message);
            }
            setSetParentModal(null);
            return;
        }
        
        if (isDestCustom) {
            // Regular callback linking to custom node as parent
            // Store this as a custom edge in database (agentstorage)
            try {
                console.log('[handleSetParent] Creating custom edge: callback → custom node');
                console.log('[handleSetParent] Source (callback):', setParentModal.id, setParentModal.display_id);
                console.log('[handleSetParent] Destination (custom):', selectedDestination.id, selectedDestination.db_id);
                
                // Create edge object
                const edgeId = `callback-${setParentModal.display_id}-to-custom-${selectedDestination.db_id}`;
                const newEdge = {
                    id: edgeId,
                    source: String(setParentModal.id), // callback id
                    target: selectedDestination.id, // custom node id (format: "custom-1")
                    sourceId: setParentModal.display_id,
                    targetId: selectedDestination.db_id,
                    c2profile: selectedProfile.name
                };
                
                console.log('[handleSetParent] Saving edge to database:', newEdge);
                
                // Delete ALL existing edges from this callback (query from current edges data)
                const existingEdgesFromCallback = customEdges.filter(e => e.source === String(setParentModal.id));
                console.log('[handleSetParent] Found', existingEdgesFromCallback.length, 'existing edges to remove');
                
                for (const edge of existingEdgesFromCallback) {
                    try {
                        console.log('[handleSetParent] Deleting edge:', edge.id, 'unique_id:', generateEdgeUniqueId(edge.id));
                        await deleteCustomEdgeMutation({
                            variables: { unique_id: generateEdgeUniqueId(edge.id) }
                        });
                    } catch (delError: any) {
                        console.warn('[handleSetParent] Failed to delete edge:', edge.id, delError.message);
                        // Continue anyway - edge might not exist in DB
                    }
                }
                
                // Small delay to ensure deletion completes
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Save to database
                const result = await createCustomEdgeMutation({
                    variables: {
                        unique_id: generateEdgeUniqueId(edgeId),
                        data: serializeEdgeData(newEdge)
                    }
                });
                
                if (result.data?.insert_agentstorage_one) {
                    snackActions.success(`Linked to Custom Node #${selectedDestination.db_id} (persistent)`);
                    // Refetch to update UI
                    await refetchCustomEdges();
                } else {
                    snackActions.error("Failed to save connection");
                }
            } catch (e: any) {
                console.error('[handleSetParent] Error creating custom edge:', e);
                snackActions.error("Failed to link: " + e.message);
            }
            setSetParentModal(null);
            return;
        }
        
        // Original database operation for regular callbacks
        try {
            // First, remove any existing edges where this callback is the source
            if (edgesData?.callbackgraphedge) {
                const existingEdges = edgesData.callbackgraphedge.filter(
                    (e: any) => e.source?.id === setParentModal.id && !e.end_timestamp
                );
                
                // Remove each existing edge
                for (const edge of existingEdges) {
                    try {
                        const result = await removeEdge({ variables: { edge_id: edge.id } });
                        if (result.data?.callbackgraphedge_remove?.status === "success") {
                            snackActions.info(`Removed existing link to Callback #${edge.destination?.display_id}`);
                        }
                    } catch (err: any) {
                        console.error("Failed to remove edge:", err);
                    }
                }
            }

            // Now add the new edge
            const addResult = await addEdge({
                variables: {
                    source_id: setParentModal.display_id,
                    destination_id: selectedDestination.display_id,
                    c2profile: selectedProfile.name
                }
            });
            
            if (addResult.data?.callbackgraphedge_add?.status === "success") {
                snackActions.success(`Linked to Callback #${selectedDestination.display_id}`);
            } else if (addResult.data?.callbackgraphedge_add?.error) {
                snackActions.error(`Failed to add edge: ${addResult.data.callbackgraphedge_add.error}`);
            } else {
                snackActions.success(`Linked to Callback #${selectedDestination.display_id}`);
            }
            
            // Refetch both callbacks and edges to update the graph
            refetch();
            refetchEdges();
            setSetParentModal(null);
        } catch (e: any) {
            snackActions.error("Failed to add edge: " + e.message);
        }
    };

    // Check if a callback has a parent connection (is source of an edge)
    const getParentEdge = useCallback((callbackId: number | string) => {
        // Check custom edges first
        const customEdge = customEdges.find(e => e.source === callbackId);
        if (customEdge) return customEdge;
        
        // Then check database edges
        if (!edgesData?.callbackgraphedge) return null;
        return edgesData.callbackgraphedge.find(
            (e: any) => e.source?.id === callbackId && !e.end_timestamp
        );
    }, [edgesData]);

    // Disconnect from parent - removes the edge where this callback is the source
    const handleDisconnectParent = async (callback: any) => {
        const parentEdge = getParentEdge(callback.id);
        if (!parentEdge) {
            snackActions.info("No parent connection found");
            setContextMenu(null);
            return;
        }

        // Check if it's a custom node
        if (callback.isCustom) {
            try {
                console.log('[handleDisconnectParent] Removing parent from custom node:', callback.db_id);
                
                // Update the custom node to remove parent connection
                const { unique_id, data } = prepareUpdateNodeData({
                    id: callback.db_id,
                    hostname: callback.host,
                    ip_address: callback.ip,
                    operating_system: callback.os,
                    architecture: callback.architecture,
                    username: callback.user !== 'N/A' ? callback.user : undefined,
                    description: callback.description,
                    hidden: callback.isHidden,
                    parent_id: undefined,
                    parent_type: undefined,
                    c2profile: undefined
                });
                
                const result = await updateCustomNodeMutation({
                    variables: { unique_id, data }
                });
                
                if (result.data?.update_agentstorage?.affected_rows > 0) {
                    snackActions.success("Disconnected from parent");
                    refetchCustomNodes();
                } else {
                    snackActions.error("Failed to disconnect");
                }
            } catch (e: any) {
                console.error('[handleDisconnectParent] Error:', e);
                snackActions.error("Failed to disconnect: " + e.message);
            }
            setContextMenu(null);
            return;
        }

        // Check if it's a custom edge (callback → custom node connection)
        if (parentEdge.source && typeof parentEdge.source === 'string' && !parentEdge.id.startsWith('e')) {
            // This is a custom edge, remove it from database
            try {
                console.log('[handleDisconnectParent] Removing custom edge from database:', parentEdge.id);
                
                const result = await deleteCustomEdgeMutation({
                    variables: { unique_id: generateEdgeUniqueId(parentEdge.id) }
                });
                
                if (result.data?.delete_agentstorage?.affected_rows > 0) {
                    snackActions.success(`Disconnected from Custom Node #${parentEdge.targetId}`);
                    refetchCustomEdges();
                } else {
                    snackActions.error("Failed to remove connection from database");
                }
            } catch (e: any) {
                console.error('[handleDisconnectParent] Error removing custom edge:', e);
                snackActions.error("Failed to disconnect: " + e.message);
            }
            setContextMenu(null);
            return;
        }

        // Handle database edge removal for regular callbacks
        try {
            const result = await removeEdge({ variables: { edge_id: parentEdge.id } });
            if (result.data?.callbackgraphedge_remove?.status === "success") {
                snackActions.success(`Disconnected from Callback #${parentEdge.destination?.display_id}`);
            } else if (result.data?.callbackgraphedge_remove?.error) {
                snackActions.error(`Failed to disconnect: ${result.data.callbackgraphedge_remove.error}`);
            }
            refetch();
            refetchEdges();
        } catch (e: any) {
            snackActions.error("Failed to disconnect: " + e.message);
        }
        setContextMenu(null);
    };

    const openDetails = (callback: any) => {
        setDetailsModal(callback);
        setContextMenu(null);
    };

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
        if (!callbacksData?.callback && customNodes.length === 0) return { nodes: [], edges: [] };

        // Filter callbacks based on showHiddenNodes toggle
        const visibleCallbacks = showHiddenNodes 
            ? (callbacksData?.callback || [])
            : (callbacksData?.callback || []).filter((c: any) => c.active !== false);
        
        const allCallbacks = [...visibleCallbacks, ...customNodes];
        
        const flowNodes: Node[] = allCallbacks.map((c: any, index: number) => {
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
                    callback_id: c.id,
                    display_id: c.display_id, 
                    db_id: c.db_id, // For custom nodes
                    user: c.user, 
                    host: c.host,
                    ip: c.isCustom ? c.ip : (() => { try { return JSON.parse(c.ip)[0] } catch(e) { return c.ip } })(),
                    integrity_level: c.integrity_level,
                    payloadType: c.payloadType || c.payload?.payloadtype?.name || '',
                    os: c.os,
                    last_checkin: c.last_checkin,
                    pid: c.pid,
                    architecture: c.architecture,
                    domain: c.domain,
                    description: c.description,
                    locked: c.locked,
                    sleep_info: c.sleep_info,
                    animationDelay: animationDelay,
                    isNewNode: isNewNode || isInitialRender,
                    label: `${c.isCustom ? 'Custom Node' : 'Callback'} ${c.display_id}`,
                    onContextMenu: handleContextMenu,
                    isCustom: c.isCustom || false,
                    // C2 profiles for this callback (for edge labels)
                    c2profiles: c.callbackc2profiles?.map((cp: any) => cp.c2profile?.name).filter(Boolean) || [],
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
        
        // Add custom edges (for custom nodes)
        customEdges.forEach((e: any) => {
            flowEdges.push({
                id: e.id,
                source: String(e.source),
                target: String(e.target),
                animated: false,
                style: { stroke: '#00ffff', strokeWidth: 2.5 }, // Cyan for custom edges
                markerEnd: { type: MarkerType.ArrowClosed, color: '#00ffff' },
                label: e.c2profile || 'Custom'
            });
        });

        // Get all visible node IDs (excluding root)
        const visibleNodeIds = new Set(flowNodes.filter(n => n.id !== 'root').map(n => n.id));
        
        // Find nodes that have a parent connection to another VISIBLE callback
        // Only edges where BOTH source and target are visible callbacks count as parent connections
        const nodesWithParent = new Set(
            flowEdges
                .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target) && e.source !== e.target)
                .map(e => e.source)
        );

        // Only add Minerva connection for nodes that DON'T have a parent connection
        flowNodes
            .filter(n => n.id !== 'root')
            .forEach((n) => {
                // Skip if this node already has a parent (is a source in any edge to another visible node)
                if (nodesWithParent.has(n.id)) {
                    return;
                }

                // Check if recent checkin (< 5s)
                let isRecent = false;
                let timestamp = '';
                if (n.data?.last_checkin) {
                    try {
                        const lastCheckin = String(n.data.last_checkin);
                        const timeStr = lastCheckin.endsWith('Z') ? lastCheckin : `${lastCheckin}Z`;
                        timestamp = timeStr;
                        const last = new Date(timeStr).getTime();
                        const now = new Date().getTime();
                        const diff = (now - last) / 1000;
                        if (diff < 5) isRecent = true;
                    } catch(e) {}
                }

                // Get C2 profile names for this callback
                const c2Profiles = Array.isArray(n.data?.c2profiles) ? n.data.c2profiles : [];
                const c2Label = c2Profiles.length > 0 ? c2Profiles.join(', ') : '';

                flowEdges.push({
                    id: `root-${n.id}`,
                    source: 'root',
                    target: n.id,
                    type: 'pulse',
                    animated: false,
                    style: { stroke: '#ffffff', strokeWidth: 2.5 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' },
                    label: c2Label,
                    labelStyle: { fill: '#a0aec0', fontSize: 10, fontWeight: 500 },
                    labelBgStyle: { fill: 'rgba(0, 0, 0, 0.6)', fillOpacity: 0.8 },
                    labelBgPadding: [4, 2] as [number, number],
                    data: { active: isRecent, timestamp: timestamp, highIntegrity: Number(n.data?.integrity_level || 0) > 2 }
                });
            });

        return { nodes: flowNodes, edges: flowEdges };
    }, [callbacksData, edgesData, handleContextMenu, isInitialRender, customNodes, showHiddenNodes, customEdges]);

    // Apply layout when data changes
    React.useEffect(() => {
        if (graphData.nodes.length > 0) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(graphData.nodes, graphData.edges);

            // 保留既有節點的位置，僅為新節點設定 layout 位置，避免視角跳動
            // @ts-ignore
            setNodes((prev: Node[]) => {
                const prevMap = new Map(prev.map(n => [n.id, n]));
                return layoutedNodes.map((n) => {
                    const existing = prevMap.get(n.id);
                    if (existing && existing.position) {
                        return { ...n, position: existing.position };
                    }
                    return n;
                });
            });
            // @ts-ignore
            setEdges(layoutedEdges as Edge[]);
        }
    }, [graphData, setNodes, setEdges]);

    // Get filtered callbacks for set parent modal - show ALL active callbacks and custom nodes
    const filteredCallbacksForParent = useMemo(() => {
        if (!setParentModal) return [];
        const allNodes = [...(callbacksData?.callback || []), ...customNodes];
        // Filter out the current callback/node from the list
        return allNodes.filter(
            (c: any) => c.id !== setParentModal.id && c.display_id !== setParentModal.display_id
        ) || [];
    }, [callbacksData, setParentModal, customNodes]);

    return (
        <div className="w-full h-full bg-[#050505] border border-ghost/30 relative overflow-hidden rounded-lg">
             {/* Control Buttons */}
             <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <button
                    onClick={() => setShowHiddenNodes(!showHiddenNodes)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded transition-colors text-xs font-mono ${
                        showHiddenNodes 
                            ? 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-500/50 text-yellow-500'
                            : 'bg-gray-500/20 hover:bg-gray-500/30 border-gray-500/50 text-gray-400'
                    }`}
                    title={showHiddenNodes ? "Hide Hidden Nodes" : "Show Hidden Nodes"}
                >
                    <EyeOff size={14} />
                    {showHiddenNodes ? 'HIDE' : 'SHOW'} HIDDEN
                </button>
                {customNodes.length > 0 && (
                    <button
                        onClick={handleExportCustomNodes}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-400 rounded transition-colors text-xs font-mono"
                        title="Export/Import Custom Nodes"
                    >
                        <Share2 size={14} />
                        SHARE
                    </button>
                )}
                <button
                    onClick={() => setShowCustomNodeModal(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-signal/20 hover:bg-signal/30 border border-signal/50 text-signal rounded transition-colors text-xs font-mono"
                    title="Add Custom Node"
                >
                    <Plus size={14} />
                    ADD NODE
                </button>
            </div>
            
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
                zoomOnScroll={true}
                panOnScroll={false}
                zoomOnDoubleClick={false}
            >
                <Background color="#333" gap={20} className="opacity-20" />
            </ReactFlow>
            
            {/* Status Overlay */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-mono text-signal bg-black/60 px-3 py-1 border border-signal/20 backdrop-blur-sm shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                    <div className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
                    NETWORK_TOPOLOGY_ACTIVE
                </div>
                {customNodes.length > 0 && (
                    <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-black/60 px-3 py-1 border border-cyan-500/20 backdrop-blur-sm">
                        <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                        {customNodes.length} CUSTOM_NODE{customNodes.length > 1 ? 'S' : ''}
                    </div>
                )}
            </div>

            {/* Context Menu Portal */}
            {contextMenu && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed z-[9999] bg-black/95 border border-signal/40 shadow-lg shadow-signal/20 w-56 backdrop-blur-xl"
                    style={{ 
                        top: contextMenu.y, 
                        left: contextMenu.x,
                        transform: contextMenu.x > window.innerWidth - 250 ? 'translateX(-100%)' : 'none'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-signal/20 flex items-center justify-between">
                        <span className="text-xs font-mono text-signal font-bold">
                            {contextMenu.callback.isCustom ? 'CUSTOM_NODE_' : 'CALLBACK_'}{contextMenu.callback.display_id}
                        </span>
                        {contextMenu.callback.locked && (
                            <Lock size={12} className="text-red-500" />
                        )}
                    </div>

                    <div className="p-1 flex flex-col">
                        {contextMenu.callback.isCustom ? (
                            /* Custom Node Options */
                            <>
                                {/* Edit Custom Node */}
                                <button 
                                    onClick={() => openEditCustomNode(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    <Edit size={14} className="text-gray-500 group-hover:text-signal" /> 
                                    <span>Edit Node</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                {/* Set Parent Edge */}
                                <button 
                                    onClick={() => openSetParent(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-900/30 text-xs text-left text-blue-400 hover:text-blue-300 transition-colors group"
                                >
                                    <GitBranch size={14} className="text-blue-500" /> 
                                    <span>Link to Parent</span>
                                </button>

                                {/* Disconnect from Parent - only show if has parent */}
                                {getParentEdge(contextMenu.callback.id) && (
                                    <button 
                                        onClick={() => handleDisconnectParent(contextMenu.callback)} 
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors group"
                                    >
                                        <X size={14} className="text-orange-500" /> 
                                        <span>Disconnect from Parent</span>
                                    </button>
                                )}

                                <div className="h-px bg-white/10 my-1" />

                                {/* Delete Custom Node */}
                                <button 
                                    onClick={() => handleDeleteCustomNode(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors group"
                                >
                                    <X size={14} className="text-red-500" /> 
                                    <span>Delete Node</span>
                                </button>
                            </>
                        ) : (
                            /* Regular Callback Options */
                            <>
                                {/* View Details */}
                                <button 
                                    onClick={() => openDetails(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    <Info size={14} className="text-gray-500 group-hover:text-signal" /> 
                                    <span>View Details</span>
                                    <ChevronRight size={12} className="ml-auto text-gray-600" />
                                </button>

                                {/* Edit Description */}
                                <button 
                                    onClick={() => openEditDescription(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    <Edit size={14} className="text-gray-500 group-hover:text-signal" /> 
                                    <span>Edit Description</span>
                                </button>

                                {/* Lock/Unlock */}
                                <button 
                                    onClick={() => handleLockToggle(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors group"
                                >
                                    {contextMenu.callback.locked ? (
                                        <>
                                            <Unlock size={14} className="text-gray-500 group-hover:text-signal" /> 
                                            <span>Unlock Callback</span>
                                        </>
                                    ) : (
                                        <>
                                            <Lock size={14} className="text-gray-500 group-hover:text-signal" /> 
                                            <span>Lock Callback</span>
                                        </>
                                    )}
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                {/* Set Parent Edge */}
                                <button 
                                    onClick={() => openSetParent(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-900/30 text-xs text-left text-blue-400 hover:text-blue-300 transition-colors group"
                                >
                                    <GitBranch size={14} className="text-blue-500" /> 
                                    <span>Link to Parent</span>
                                </button>

                                {/* Disconnect from Parent - only show if has parent */}
                                {getParentEdge(contextMenu.callback.id) && (
                                    <button 
                                        onClick={() => handleDisconnectParent(contextMenu.callback)} 
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors group"
                                    >
                                        <X size={14} className="text-orange-500" /> 
                                        <span>Disconnect from Parent</span>
                                    </button>
                                )}

                                <div className="h-px bg-white/10 my-1" />

                                {/* Hide Callback */}
                                <button 
                                    onClick={() => handleHide(contextMenu.callback)} 
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-red-900/30 text-xs text-left text-red-400 hover:text-red-300 transition-colors group"
                                >
                                    <EyeOff size={14} className="text-red-500" /> 
                                    <span>Hide Callback</span>
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>,
                document.body
            )}

            {/* Edit Description Modal */}
            <AnimatePresence>
                {editDescriptionModal && (
                    <CyberModal 
                        title="EDIT_DESCRIPTION" 
                        onClose={() => setEditDescriptionModal(null)}
                        icon={<Edit />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 font-mono mb-2">
                                Callback #{editDescriptionModal.display_id} - {editDescriptionModal.host}
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <input 
                                    type="text" 
                                    value={newDescription} 
                                    onChange={(e) => setNewDescription(e.target.value)} 
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditDescriptionModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button 
                                    onClick={handleSaveDescription}
                                    className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors"
                                >
                                    SAVE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Custom Node Modal */}
            <AnimatePresence>
                {showCustomNodeModal && (
                    <CyberModal 
                        title="CREATE_CUSTOM_NODE" 
                        onClose={() => setShowCustomNodeModal(false)}
                        icon={<Plus />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 mb-4">
                                Create a custom node to represent external systems or planned targets in the topology.
                            </div>
                            
                            {/* Hostname */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">HOSTNAME *</label>
                                <input 
                                    type="text" 
                                    value={customNodeForm.host}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, host: e.target.value})}
                                    placeholder="TARGET-PC-01"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                            </div>
                            
                            {/* OS */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">OPERATING SYSTEM *</label>
                                <select
                                    value={customNodeForm.os}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, os: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                >
                                    <option value="Windows">Windows</option>
                                    <option value="Linux">Linux</option>
                                    <option value="macOS">macOS</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            
                            {/* IP */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">IP ADDRESS *</label>
                                <input 
                                    type="text" 
                                    value={customNodeForm.ip}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, ip: e.target.value})}
                                    placeholder="192.168.1.100"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                            </div>
                            
                            {/* Architecture */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">ARCHITECTURE</label>
                                <select
                                    value={customNodeForm.architecture}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, architecture: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                >
                                    <option value="x64">x64</option>
                                    <option value="x86">x86</option>
                                    <option value="arm64">ARM64</option>
                                </select>
                            </div>
                            
                            {/* User */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">USER</label>
                                <input 
                                    type="text" 
                                    value={customNodeForm.user}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, user: e.target.value})}
                                    placeholder="Administrator"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                            </div>
                            
                            {/* Description */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <textarea 
                                    value={customNodeForm.description}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, description: e.target.value})}
                                    placeholder="Target system details..."
                                    rows={3}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-none"
                                />
                            </div>
                            
                            <div className="flex justify-end gap-3 pt-4">
                                <button 
                                    onClick={() => setShowCustomNodeModal(false)}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm"
                                >
                                    CANCEL
                                </button>
                                <button 
                                    onClick={handleCreateCustomNode}
                                    className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors"
                                >
                                    CREATE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Edit Custom Node Modal */}
            <AnimatePresence>
                {editCustomNodeModal && (
                    <CyberModal 
                        title="EDIT_CUSTOM_NODE" 
                        onClose={() => setEditCustomNodeModal(null)}
                        icon={<Edit />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 mb-4">
                                Edit custom node #{editCustomNodeModal.display_id} - {editCustomNodeModal.host}
                            </div>
                            
                            {/* Hostname */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">HOSTNAME *</label>
                                <input 
                                    type="text" 
                                    value={customNodeForm.host}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, host: e.target.value})}
                                    placeholder="TARGET-PC-01"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                            </div>
                            
                            {/* OS */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">OPERATING SYSTEM *</label>
                                <select
                                    value={customNodeForm.os}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, os: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                >
                                    <option value="Windows">Windows</option>
                                    <option value="Linux">Linux</option>
                                    <option value="macOS">macOS</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            
                            {/* IP */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">IP ADDRESS *</label>
                                <input 
                                    type="text" 
                                    value={customNodeForm.ip}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, ip: e.target.value})}
                                    placeholder="192.168.1.100"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                            </div>
                            
                            {/* Architecture */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">ARCHITECTURE</label>
                                <select
                                    value={customNodeForm.architecture}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, architecture: e.target.value})}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                >
                                    <option value="x64">x64</option>
                                    <option value="x86">x86</option>
                                    <option value="arm64">ARM64</option>
                                </select>
                            </div>
                            
                            {/* User */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">USER</label>
                                <input 
                                    type="text" 
                                    value={customNodeForm.user}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, user: e.target.value})}
                                    placeholder="Administrator"
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm"
                                />
                            </div>
                            
                            {/* Description */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">DESCRIPTION</label>
                                <textarea 
                                    value={customNodeForm.description}
                                    onChange={(e) => setCustomNodeForm({...customNodeForm, description: e.target.value})}
                                    placeholder="Target system details..."
                                    rows={3}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-sm resize-none"
                                />
                            </div>
                            
                            <div className="flex justify-end gap-3 pt-4">
                                <button 
                                    onClick={() => setEditCustomNodeModal(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm"
                                >
                                    CANCEL
                                </button>
                                <button 
                                    onClick={handleUpdateCustomNode}
                                    className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors"
                                >
                                    UPDATE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Export/Import Custom Nodes Modal */}
            <AnimatePresence>
                {showExportImportModal && (
                    <CyberModal 
                        title="SHARE_CUSTOM_NODES" 
                        onClose={() => {
                            setShowExportImportModal(false);
                            setImportData('');
                        }}
                        icon={<Share2 />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 mb-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded">
                                <div className="flex items-start gap-2">
                                    <Info size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                                    <div>
                                        <div className="font-bold text-cyan-400 mb-1">GraphQL Server Storage</div>
                                        <div>Custom nodes are stored on the Mythic server and synchronized in real-time across all clients. Export for backup or migration purposes.</div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Export Section */}
                            <div className="border-t border-gray-800 pt-4">
                                <label className="block text-xs font-mono text-gray-500 mb-2 flex items-center gap-2">
                                    <span>EXPORT_DATA</span>
                                    <span className="text-[10px] text-gray-600">({customNodes.length} nodes, {customEdges.length} edges)</span>
                                </label>
                                <textarea 
                                    value={exportData}
                                    readOnly
                                    rows={8}
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal font-mono text-xs resize-none"
                                    placeholder="Export data will appear here..."
                                />
                                <button 
                                    onClick={handleCopyExportData}
                                    className="w-full mt-2 px-4 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30 font-mono text-sm transition-colors"
                                >
                                    COPY_TO_CLIPBOARD
                                </button>
                            </div>
                            
                            {/* Import Section */}
                            <div className="border-t border-gray-800 pt-4">
                                <label className="block text-xs font-mono text-gray-500 mb-2">IMPORT_DATA</label>
                                <textarea 
                                    value={importData}
                                    onChange={(e) => setImportData(e.target.value)}
                                    rows={8}
                                    placeholder="Paste exported data here..."
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-xs resize-none"
                                />
                                <button 
                                    onClick={handleImportCustomNodes}
                                    disabled={!importData.trim()}
                                    className="w-full mt-2 px-4 py-2 bg-signal/20 border border-signal/50 text-signal hover:bg-signal/30 font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    IMPORT_NODES
                                </button>
                            </div>
                            
                            <div className="flex justify-end pt-2">
                                <button 
                                    onClick={() => {
                                        setShowExportImportModal(false);
                                        setImportData('');
                                    }}
                                    className="px-6 py-2 text-gray-400 hover:text-white font-mono text-sm"
                                >
                                    CLOSE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Set Parent Modal */}
            <AnimatePresence>
                {setParentModal && (
                    <CyberModal 
                        title="LINK_TO_PARENT" 
                        onClose={() => setSetParentModal(null)}
                        icon={<GitBranch />}
                    >
                        <div className="space-y-4">
                            <div className="text-xs text-gray-400 font-mono mb-2">
                                Link {setParentModal.isCustom ? 'Custom Node' : 'Callback'} #{setParentModal.display_id} ({setParentModal.host}) to another node.
                            </div>

                            {/* Destination Callback Selection - Show ALL active callbacks and custom nodes */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">TARGET_NODE</label>
                                <div className="grid gap-2 max-h-48 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {filteredCallbacksForParent.length > 0 ? (
                                        filteredCallbacksForParent.map((callback: any) => {
                                            const ip = callback.isCustom ? callback.ip : (() => { try { return JSON.parse(callback.ip)[0] } catch(e) { return callback.ip } })();
                                            return (
                                                <button
                                                    key={callback.id}
                                                    onClick={() => setSelectedDestination(callback)}
                                                    className={`flex items-center gap-3 px-3 py-2.5 border text-left text-xs font-mono transition-colors ${
                                                        selectedDestination?.id === callback.id 
                                                            ? 'border-signal bg-signal/10 text-signal' 
                                                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-white/5'
                                                    }`}
                                                >
                                                    <div className={`w-2 h-2 rounded-full ${callback.isCustom ? 'bg-cyan-500' : (callback.integrity_level > 2 ? 'bg-yellow-500' : 'bg-signal')}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold">#{callback.display_id}</span>
                                                            <span className="text-gray-500">@</span>
                                                            <span className="truncate">{callback.host}</span>
                                                            {callback.isCustom && (
                                                                <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1 py-0.5 rounded border border-cyan-500/30">CUSTOM</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-gray-600 flex items-center gap-2">
                                                            <span>{callback.user}</span>
                                                            <span>•</span>
                                                            <span>{ip}</span>
                                                            {callback.description && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="italic truncate">{callback.description}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] uppercase text-gray-600 border border-gray-700 px-1.5 py-0.5">
                                                        {callback.isCustom ? 'CUSTOM' : callback.payload?.payloadtype?.name}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <div className="text-gray-500 text-xs font-mono p-3 text-center">
                                            NO_OTHER_CALLBACKS_AVAILABLE
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Connection Type Toggle */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">CONNECTION_TYPE</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setIsP2PConnection(true);
                                            setSelectedProfile(null);
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-mono transition-colors ${
                                            isP2PConnection 
                                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' 
                                                : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                        }`}
                                    >
                                        <GitBranch size={14} />
                                        <span>P2P</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsP2PConnection(false);
                                            setSelectedProfile(null);
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-mono transition-colors ${
                                            !isP2PConnection 
                                                ? 'border-purple-500 bg-purple-500/10 text-purple-400' 
                                                : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                        }`}
                                    >
                                        <Network size={14} />
                                        <span>EGRESS</span>
                                    </button>
                                </div>
                            </div>

                            {/* C2 Profile Selection */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">
                                    {isP2PConnection ? 'P2P_PROFILE' : 'C2_PROFILE'}
                                </label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {isP2PConnection ? (
                                        // P2P Profiles
                                        <>
                                            {p2pData?.c2profile?.map((profile: any) => (
                                                <button
                                                    key={profile.id}
                                                    onClick={() => setSelectedProfile(profile)}
                                                    className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                        selectedProfile?.id === profile.id 
                                                            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' 
                                                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}
                                                >
                                                    <GitBranch size={14} />
                                                    <span>{profile.name}</span>
                                                    <span className="ml-auto text-[10px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                                </button>
                                            ))}
                                            {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                                <div className="text-gray-500 text-xs font-mono p-3 text-center">
                                                    NO_P2P_PROFILES_AVAILABLE
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        // Non-P2P (Egress) Profiles
                                        <>
                                            {allC2Data?.c2profile?.filter((p: any) => !p.is_p2p).map((profile: any) => (
                                                <button
                                                    key={profile.id}
                                                    onClick={() => setSelectedProfile(profile)}
                                                    className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                        selectedProfile?.id === profile.id 
                                                            ? 'border-purple-500 bg-purple-500/10 text-purple-400' 
                                                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}
                                                >
                                                    <Network size={14} />
                                                    <span>{profile.name}</span>
                                                    <div className="ml-auto flex items-center gap-1">
                                                        {profile.running ? (
                                                            <span className="text-[10px] text-green-500 border border-green-800 px-1">RUNNING</span>
                                                        ) : (
                                                            <span className="text-[10px] text-red-500 border border-red-800 px-1">STOPPED</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                            {(!allC2Data?.c2profile?.filter((p: any) => !p.is_p2p)?.length) && (
                                                <div className="text-gray-500 text-xs font-mono p-3 text-center">
                                                    NO_EGRESS_PROFILES_AVAILABLE
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Edge Label/Note (Optional) */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-1">EDGE_LABEL <span className="text-gray-600">(optional)</span></label>
                                <input 
                                    type="text" 
                                    value={edgeLabel} 
                                    onChange={(e) => setEdgeLabel(e.target.value)} 
                                    placeholder="e.g., SMB Link, Internal Pivot..."
                                    className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-xs placeholder:text-gray-600"
                                />
                            </div>

                            {/* Summary */}
                            {selectedDestination && selectedProfile && (
                                <div className={`p-3 border text-xs font-mono ${
                                    isP2PConnection 
                                        ? 'bg-cyan-900/20 border-cyan-500/30' 
                                        : 'bg-purple-900/20 border-purple-500/30'
                                }`}>
                                    <div className={`mb-2 flex items-center gap-2 ${isP2PConnection ? 'text-cyan-400' : 'text-purple-400'}`}>
                                        {isP2PConnection ? <GitBranch size={12} /> : <Network size={12} />}
                                        <span>LINK_SUMMARY</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 border ${
                                            isP2PConnection 
                                                ? 'border-cyan-600 text-cyan-500' 
                                                : 'border-purple-600 text-purple-500'
                                        }`}>
                                            {isP2PConnection ? 'P2P' : 'EGRESS'}
                                        </span>
                                    </div>
                                    <div className="text-gray-300 flex items-center gap-2 flex-wrap">
                                        <span className="text-signal font-bold">#{setParentModal.display_id}</span>
                                        <span className="text-gray-600">({setParentModal.host})</span>
                                        <span className={isP2PConnection ? 'text-cyan-500' : 'text-purple-500'}>→</span>
                                        <span className={`px-2 py-0.5 ${isP2PConnection ? 'bg-cyan-900/50 text-cyan-400' : 'bg-purple-900/50 text-purple-400'}`}>
                                            {selectedProfile.name}
                                        </span>
                                        <span className={isP2PConnection ? 'text-cyan-500' : 'text-purple-500'}>→</span>
                                        <span className="text-signal font-bold">#{selectedDestination.display_id}</span>
                                        <span className="text-gray-600">({selectedDestination.host})</span>
                                    </div>
                                    {edgeLabel && (
                                        <div className="mt-2 text-gray-500 italic">
                                            Label: "{edgeLabel}"
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSetParentModal(null)} className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm">CANCEL</button>
                                <button 
                                    onClick={handleSetParent}
                                    disabled={!selectedProfile || !selectedDestination}
                                    className={`px-6 py-2 font-bold font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                        isP2PConnection 
                                            ? 'bg-cyan-600 text-white hover:bg-cyan-500' 
                                            : 'bg-purple-600 text-white hover:bg-purple-500'
                                    }`}
                                >
                                    CREATE_LINK
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Details Modal */}
            <AnimatePresence>
                {detailsModal && (
                    <CyberModal 
                        title={detailsModal.isCustom ? "CUSTOM_NODE_DETAILS" : "CALLBACK_DETAILS"}
                        onClose={() => setDetailsModal(null)}
                        icon={<Info />}
                    >
                        <div className="space-y-4">
                            {/* Header Info */}
                            <div className="flex items-center gap-4 p-3 bg-black/30 border border-gray-800">
                                <div className={`p-2 border ${
                                    detailsModal.isCustom 
                                        ? 'border-cyan-500 bg-cyan-500/10' 
                                        : (detailsModal.integrity_level > 2 ? 'border-yellow-500 bg-yellow-500/10' : 'border-signal bg-signal/10')
                                }`}>
                                    <Terminal size={20} className={detailsModal.isCustom ? 'text-cyan-500' : (detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-signal')} />
                                </div>
                                <div>
                                    <div className="text-lg font-bold text-white font-mono">
                                        {detailsModal.isCustom ? 'CUSTOM_NODE' : 'CALLBACK'} #{detailsModal.display_id}
                                        {detailsModal.locked && <Lock size={14} className="inline ml-2 text-red-500" />}
                                    </div>
                                    <div className="text-xs text-gray-500">{detailsModal.host}</div>
                                </div>
                                {!detailsModal.isCustom && detailsModal.integrity_level > 2 && (
                                    <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-yellow-500/20 border border-yellow-500/50">
                                        <Shield size={12} className="text-yellow-500" />
                                        <span className="text-xs font-bold text-yellow-500">ADMIN</span>
                                    </div>
                                )}
                                {detailsModal.isCustom && (
                                    <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-cyan-500/20 border border-cyan-500/50">
                                        <span className="text-xs font-bold text-cyan-400">CUSTOM</span>
                                    </div>
                                )}
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                <div className="space-y-1">
                                    <div className="text-gray-500">USER</div>
                                    <div className="text-white">{detailsModal.user}</div>
                                </div>
                                {!detailsModal.isCustom && (
                                    <div className="space-y-1">
                                        <div className="text-gray-500">DOMAIN</div>
                                        <div className="text-white">{detailsModal.domain || 'N/A'}</div>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <div className="text-gray-500">IP_ADDRESS</div>
                                    <div className="text-white">{detailsModal.ip}</div>
                                </div>
                                {!detailsModal.isCustom && (
                                    <div className="space-y-1">
                                        <div className="text-gray-500">PID</div>
                                        <div className="text-white">{detailsModal.pid}</div>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <div className="text-gray-500">OS</div>
                                    <div className="text-white">{detailsModal.os}</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-gray-500">ARCHITECTURE</div>
                                    <div className="text-white">{detailsModal.architecture}</div>
                                </div>
                                {!detailsModal.isCustom && (
                                    <>
                                        <div className="space-y-1">
                                            <div className="text-gray-500">AGENT</div>
                                            <div className="text-white uppercase">{detailsModal.payloadType}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-gray-500">INTEGRITY</div>
                                            <div className={detailsModal.integrity_level > 2 ? 'text-yellow-500' : 'text-white'}>
                                                Level {detailsModal.integrity_level}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Sleep Info - Only for callbacks */}
                            {!detailsModal.isCustom && detailsModal.sleep_info && (
                                <div className="p-3 bg-black/30 border border-gray-800">
                                    <div className="text-xs font-mono text-gray-500 mb-1">SLEEP_INFO</div>
                                    <div className="text-sm font-mono text-signal">{detailsModal.sleep_info}</div>
                                </div>
                            )}

                            {/* Description */}
                            <div className="p-3 bg-black/30 border border-gray-800">
                                <div className="text-xs font-mono text-gray-500 mb-1">DESCRIPTION</div>
                                <div className="text-sm text-gray-300 italic">
                                    {detailsModal.description || 'No description set'}
                                </div>
                            </div>
                            
                            {/* Edit button for custom nodes */}
                            {detailsModal.isCustom && (
                                <button
                                    onClick={() => {
                                        openEditCustomNode(detailsModal);
                                        setDetailsModal(null);
                                    }}
                                    className="w-full px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 font-mono text-sm transition-colors"
                                >
                                    EDIT_NODE
                                </button>
                            )}

                            <div className="flex justify-end">
                                <button 
                                    onClick={() => setDetailsModal(null)} 
                                    className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
        </div>
    );
}