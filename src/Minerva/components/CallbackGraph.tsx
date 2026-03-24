import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
// @ts-ignore
import ELK from 'elkjs/lib/elk.bundled.js';
import { 
    ReactFlow, 
    Background, 

    useNodesState,
    useEdgesState,
    getConnectedEdges,
    Node,
    Edge,
    Handle,
    Position,
    BaseEdge,
    EdgeProps,
    getStraightPath,
    EdgeLabelRenderer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { toSvg, toPng } from 'html-to-image';
import { MythicDialog } from '../../components/MythicComponents/MythicDialog';
import { EventTriggerContextSelectDialog } from '../../components/pages/Eventing/EventTriggerContextSelect';
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
    DELETE_CUSTOM_GRAPH_EDGE,
    GET_CALLBACK_GRAPH_EDGES_ALL,
    GET_LINK_COMMANDS_FOR_CALLBACK,
    CREATE_TASK_MUTATION,
    GET_CALLBACKS_WITH_BROWSERSCRIPTS,
    GET_LINK_FOCUS,
    SET_LINK_FOCUS,
    CLEAR_LINK_FOCUS,
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
import { Terminal, Cpu, User, Share2, Hexagon, Shield, Network, Monitor, Skull, Lock, Unlock, Eye, EyeOff, Edit, Info, GitBranch, X, ChevronRight, Plus, Settings, SlidersHorizontal, ArrowLeftRight, ArrowUpDown, Zap, Wifi, Link2, RefreshCw, CheckSquare, Square, ChevronDown, LayoutGrid, Camera, Trash2, FileImage, Code, SplitSquareHorizontal, Crosshair } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { snackActions } from '../../components/utilities/Snackbar';
import { CyberModal } from './CyberModal';
import { isCallbackAlive } from '../lib/utils';

// Debug mode - set to false in production for performance
const DEBUG_GRAPH = false;
const log = (...args: any[]) => DEBUG_GRAPH && console.log('[CallbackGraph]', ...args);

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

// Android icon
const AndroidIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M17.523 15.341c-.551 0-.999-.449-.999-1s.448-.999.999-.999c.551 0 .999.448.999.999s-.448 1-.999 1zm-11.046 0c-.551 0-.999-.449-.999-1s.448-.999.999-.999c.551 0 .999.448.999.999s-.448 1-.999 1zm11.405-6.02l1.997-3.459a.416.416 0 00-.152-.568.416.416 0 00-.568.152L17.137 8.9C15.59 8.244 13.853 7.851 12 7.851s-3.59.393-5.137 1.049L4.841 5.447a.416.416 0 00-.568-.152.416.416 0 00-.152.568l1.997 3.459C2.689 11.187.343 14.659 0 18.761h24c-.344-4.102-2.689-7.574-6.118-9.44z"/>
    </svg>
);
// Chrome icon
const ChromeIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 0C8.21 0 4.831 1.757 2.625 4.501l3.863 6.648A5.088 5.088 0 0112 6.902c.919 0 1.784.25 2.558.691l3.866-6.654A11.957 11.957 0 0012 0zm5.793 3.75l-3.866 6.654a5.09 5.09 0 011.171 5.025L19.4 21.5A11.956 11.956 0 0024 12c0-3.141-1.222-5.994-3.207-8.094zM2.207 4.5A11.992 11.992 0 000 12c0 3.31 1.341 6.31 3.507 8.5l3.83-6.63A5.09 5.09 0 016.902 12a5.088 5.088 0 012.637-4.463L5.793 3.75A12.003 12.003 0 002.207 4.5zM12 8a4 4 0 100 8 4 4 0 000-8z"/>
    </svg>
);
// Get OS icon based on OS string or payload type
const getOSIcon = (os: string, payloadType: string, size: number = 16, className: string = "") => {
    const osStr = (os || '').toLowerCase();
    const type = (payloadType || '').toLowerCase();
    if (osStr.includes('windows') || type === 'apollo') return <WindowsIcon size={size} className={className} />;
    if (osStr.includes('linux') || type === 'poseidon') return <LinuxIcon size={size} className={className} />;
    if (osStr.includes('mac') || osStr.includes('darwin') || type === 'medusa') return <MacOSIcon size={size} className={className} />;
    if (osStr.includes('android')) return <AndroidIcon size={size} className={className} />;
    if (osStr.includes('chrome') || osStr.includes('cros')) return <ChromeIcon size={size} className={className} />;
    // Named payload type on unknown OS — show a generic robot/agent icon
    if (type && type !== '' && type !== 'agent') return <Network size={size} className={className} />;
    return <Monitor size={size} className={className} />;
};

const CyberNode = ({ data, dragging }: any) => {
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
    
    // Parse time to determining status — uses sleep_info interval×3 as threshold
    const deadCheck = useMemo(() => {
        // Custom nodes are never "dead"
        if (data.isCustom) return false;
        // isCallbackAlive uses sleep_info for a proper threshold
        return !isCallbackAlive({ active: data.active, last_checkin: data.last_checkin, sleep_info: data.sleep_info });
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
                style={
                    data.isHighlighted
                        ? { boxShadow: '0 0 18px 4px rgba(34,197,94,0.55)', outline: '1.5px solid rgba(34,197,94,0.7)', transition: 'opacity 0.3s, filter 0.3s, box-shadow 0.3s, outline 0.3s' }
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
    // C2 profile icon loading
    const [c2ImgLoaded, setC2ImgLoaded] = useState(false);
    const [c2ImgError, setC2ImgError] = useState(false);
    const c2IconName = String(label || '').split(',')[0].trim();
    const c2IconUrl = (c2IconName && c2IconName !== 'Linked' && c2IconName !== 'Custom' && c2IconName !== '')
        ? `/direct/download/${c2IconName}/icon.svg` : null;
  
    return (
      <>
        <BaseEdge path={edgePath} style={style} />
        {/* Edge Label via HTML overlay for icon + text */}
        {label && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: 'none',
                zIndex: 10,
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-white/95 border border-black/20 text-gray-800 text-[10px] font-semibold font-mono whitespace-nowrap rounded-sm"
            >
              {c2IconUrl && !c2ImgError && (
                <img
                  src={c2IconUrl}
                  onLoad={() => setC2ImgLoaded(true)}
                  onError={() => setC2ImgError(true)}
                  style={{ width: 11, height: 11, objectFit: 'contain', opacity: c2ImgLoaded ? 1 : 0 }}
                  alt=""
                />
              )}
              {String(label)}
            </div>
          </EdgeLabelRenderer>
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

// Group bound container node for groupBy visual clustering
const GroupBoundNode = ({ data }: any) => (
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
const TaskNode = ({ data }: any) => (
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
const BrowserscriptNode = ({ data }: any) => (
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

// Edge with C2 profile icon label via EdgeLabelRenderer
const C2LabelEdge = ({ id, sourceX, sourceY, targetX, targetY, style, data, label }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const profileName = String(label || '').split(',')[0].trim();
    const iconUrl = (profileName && profileName !== 'Linked' && profileName !== 'Custom' && profileName !== '')
        ? `/direct/download/${profileName}/icon.svg` : null;
    return (
        <>
            <BaseEdge id={id} path={edgePath} style={style} />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'none',
                        }}
                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-mono bg-black/80 border border-white/15 text-gray-400 whitespace-nowrap"
                    >
                        {iconUrl && !imgError && (
                            <img
                                src={iconUrl}
                                onLoad={() => setImgLoaded(true)}
                                onError={() => setImgError(true)}
                                style={{ width: 11, height: 11, objectFit: 'contain', opacity: imgLoaded ? 1 : 0 }}
                                alt=""
                            />
                        )}
                        {String(label)}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

// BsCallbackNode — lightweight callback node used in the BrowserScript graph view
const BsCallbackNode = ({ data }: any) => {
    const isSelected = data._selected;
    const anySelected = data._anySelected;
    return (
        <div
            style={{
                minWidth: 110,
                ...(anySelected && !isSelected ? { opacity: 0.2, filter: 'grayscale(1)', transition: 'opacity 0.2s, filter 0.2s' } : {}),
                ...(isSelected ? { boxShadow: '0 0 12px 2px rgba(34,197,94,0.5)', outline: '1.5px solid rgba(34,197,94,0.7)', transition: 'box-shadow 0.2s' } : {}),
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

const nodeTypes = {
    custom: CyberNode,
    root: RootNode,
    groupBound: GroupBoundNode,
    taskNode: TaskNode,
    browserscriptNode: BrowserscriptNode,
    bsCallbackNode: BsCallbackNode,
};

const edgeTypes = {
    pulse: PulseEdge,
    c2label: C2LabelEdge,
};

// Layout constants for beautiful node arrangement (horizontal left-to-right)
const LAYOUT = {
    ROOT_X: 100,                   // Root node X position (left side)
    LEVEL_SPACING: 300,            // Horizontal spacing between levels
    NODE_HEIGHT: 150,              // Vertical spacing between nodes in same level
    CENTER_Y: 400,                 // Center Y position
    MAX_PER_COLUMN: 10,            // Maximum nodes per column before wrapping
};

// Improved tree layout function - horizontal left-to-right
// Edge direction (after swap): source (parent) → target (child)
// Parent is at lower level (left), child is at higher level (right)
// ELK instance (singleton to avoid repeated instantiation)
const elk = new ELK();

// ELK-powered async layout — replaces BFS layout for smarter hierarchical positioning
const getElkLayoutedElements = async (nodes: Node[], edges: Edge[], dir: 'LR' | 'TB' = 'LR'): Promise<{ nodes: Node[]; edges: Edge[] }> => {
    if (nodes.length === 0) return { nodes, edges };

    const elkDirection = dir === 'LR' ? 'RIGHT' : 'DOWN';

    // Build ELK graph — root gets a larger size, others standard callback node size
    const elkNodes = nodes.map(n => ({
        id: n.id,
        width: n.id === 'root' ? 140 : n.type === 'groupBound' ? 200 : 270,
        height: n.id === 'root' ? 140 : n.type === 'groupBound' ? 100 : 85,
    }));

    const nodeIdSet = new Set(nodes.map(n => n.id));
    // Only include edges where both endpoints exist in current node set
    const elkEdges = edges
        .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
        .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }));

    const elkGraph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': elkDirection,
            'elk.layered.spacing.nodeNodeBetweenLayers': '280',
            'elk.spacing.nodeNode': '120',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.edgeRouting': 'POLYLINE',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        },
        children: elkNodes,
        edges: elkEdges,
    };

    try {
        const result = await elk.layout(elkGraph);
        const posMap = new Map<string, { x: number; y: number }>();
        (result.children || []).forEach((n: any) => {
            posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        });

        const layoutedNodes = nodes.map(n => ({
            ...n,
            position: posMap.get(n.id) ?? n.position,
        }));

        return { nodes: layoutedNodes, edges };
    } catch (err) {
        console.warn('[CallbackGraph] ELK layout failed, using fallback BFS layout:', err);
        return getLayoutedElements(nodes, edges, dir);
    }
};

// Legacy BFS layout — kept as ELK fallback
const getLayoutedElements = (nodes: Node[], edges: Edge[], dir: 'LR' | 'TB' = 'LR') => {
    // 1. Find root node
    const root = nodes.find(n => n.id === 'root');
    if (!root) return { nodes, edges };

    // Build set of all actual node IDs in this graph
    const nodeIds = new Set(nodes.map(n => n.id));

    // Build parent map from edges — ONLY where both endpoints are actual graph nodes.
    // Edges referencing invisible/phantom nodes are ignored to prevent incorrect levels.
    // Edge direction (after swap): source (parent) → target (child)
    // Custom edges OVERRIDE database edges so manual connections take priority
    const parentMap = new Map<string, string>();
    
    // First pass: database edges only (lower priority)
    edges.forEach(edge => {
        if (edge.id.startsWith('root-')) return;
        // Skip custom edges in first pass
        if (edge.id.startsWith('custom-edge-') || edge.id.startsWith('callback-')) return;
        // Only consider edges where BOTH endpoints are real graph nodes
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
        if (!parentMap.has(edge.target)) {
            parentMap.set(edge.target, edge.source);
        }
    });
    
    // Second pass: custom edges OVERRIDE any existing database parents
    edges.forEach(edge => {
        if (edge.id.startsWith('root-')) return;
        if (!edge.id.startsWith('custom-edge-') && !edge.id.startsWith('callback-')) return;
        // Only consider edges where BOTH endpoints are real graph nodes
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
        // Override - custom edges always take priority
        parentMap.set(edge.target, edge.source);
    });

    // Calculate levels using BFS from root for correct tree depth.
    const levels = new Map<string, number>();
    levels.set('root', 0);

    const childrenMap = new Map<string, string[]>();
    parentMap.forEach((parent, child) => {
        if (!childrenMap.has(parent)) childrenMap.set(parent, []);
        childrenMap.get(parent)!.push(child);
    });

    edges.forEach(edge => {
        if (edge.id.startsWith('root-') && nodeIds.has(edge.target)) {
            if (!parentMap.has(edge.target)) {
                if (!childrenMap.has('root')) childrenMap.set('root', []);
                childrenMap.get('root')!.push(edge.target);
            }
        }
    });

    const queue: string[] = ['root'];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLevel = levels.get(current) ?? 0;
        const children = childrenMap.get(current) || [];
        for (const child of children) {
            if (!levels.has(child)) {
                levels.set(child, currentLevel + 1);
                queue.push(child);
            }
        }
    }

    nodes.forEach(node => {
        if (!levels.has(node.id)) {
            levels.set(node.id, 1);
        }
    });

    const nodesByLevel = new Map<number, Node[]>();
    nodes.forEach(node => {
        const level = levels.get(node.id) ?? 1;
        if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
        nodesByLevel.get(level)!.push(node);
    });

    const layoutedNodes = nodes.map(node => {
        if (node.id === 'root') {
            return { ...node, position: { x: LAYOUT.ROOT_X, y: LAYOUT.CENTER_Y } };
        }
        
        const level = levels.get(node.id) ?? 1;
        const levelNodes = nodesByLevel.get(level) || [];
        levelNodes.sort((a, b) => a.id.localeCompare(b.id));
        const nodeIndex = levelNodes.findIndex(n => n.id === node.id);
        const basePos = LAYOUT.ROOT_X + level * LAYOUT.LEVEL_SPACING;
        const nodesInLevel = levelNodes.length;
        const columnCount = Math.ceil(nodesInLevel / LAYOUT.MAX_PER_COLUMN);
        const currentColumn = Math.floor(nodeIndex / LAYOUT.MAX_PER_COLUMN);
        const nodesInCurrentColumn = currentColumn === columnCount - 1 
            ? nodesInLevel % LAYOUT.MAX_PER_COLUMN || LAYOUT.MAX_PER_COLUMN
            : LAYOUT.MAX_PER_COLUMN;
        const indexInColumn = nodeIndex % LAYOUT.MAX_PER_COLUMN;
        const totalColumnHeight = (nodesInCurrentColumn - 1) * LAYOUT.NODE_HEIGHT;
        const startCross = LAYOUT.CENTER_Y - totalColumnHeight / 2;
        const crossPos = startCross + indexInColumn * LAYOUT.NODE_HEIGHT;
        const colOffset = currentColumn * LAYOUT.LEVEL_SPACING;
        
        return { ...node, position: { x: dir === 'TB' ? crossPos : basePos + colOffset, y: dir === 'TB' ? basePos : crossPos } };
    });

    return { nodes: layoutedNodes, edges };
};

interface CallbackGraphProps {
    filterCallbackIds?: Set<string>;
}

export function CallbackGraph({ filterCallbackIds }: CallbackGraphProps = {}) {
    const { data: callbacksData, loading: callbacksLoading, error: callbacksError, refetch } = useQuery(GET_CALLBACKS, { pollInterval: 10000 });
    const { data: edgesData, loading: edgesLoading, error: edgesError, refetch: refetchEdges } = useQuery(GET_CALLBACK_GRAPH_EDGES, { pollInterval: 10000 });
    const { data: p2pData, refetch: refetchP2P } = useQuery(GET_P2P_PROFILES_AND_CALLBACKS, { fetchPolicy: "network-only" });
    const { data: allC2Data, refetch: refetchAllC2 } = useQuery(GET_C2_PROFILES, { fetchPolicy: "network-only" });

    // Mutations
    const [hideCallback] = useMutation(HIDE_CALLBACK_MUTATION);
    const [lockCallback] = useMutation(LOCK_CALLBACK_MUTATION);
    const [updateDescription] = useMutation(UPDATE_CALLBACK_DESCRIPTION_MUTATION);
    const [addEdge] = useMutation(ADD_EDGE_MUTATION);
    const [removeEdge] = useMutation(REMOVE_EDGE_MUTATION);
    const [createTask] = useMutation(CREATE_TASK_MUTATION);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
    const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
    // Track selected node IDs for edge-highlight feature
    const selectedNodeIds = useRef<Set<string>>(new Set());
    const [isInitialRender, setIsInitialRender] = useState(true);
    const seenNodeIds = useRef(new Set<string>());
    const prevGraphDataRef = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
    const navigate = useNavigate();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; callback: any } | null>(null);
    const [editDescriptionModal, setEditDescriptionModal] = useState<any | null>(null);
    const [newDescription, setNewDescription] = useState("");
    const [detailsModal, setDetailsModal] = useState<any | null>(null);
    const [setParentModal, setSetParentModal] = useState<any | null>(null);
    // ── Link Focus (global, persisted in agentstorage) ──────────────────────
    const autoLinkedCallbacksRef = useRef<Set<string>>(new Set());
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

    // ── Graph Config State (with localStorage persistence) ──
    const [showConfigPanel, setShowConfigPanel] = useState(false);
    const [layoutDir, setLayoutDir] = useState<'LR' | 'TB'>(() => {
        try { return (localStorage.getItem('mg_layoutDir') as 'LR' | 'TB') || 'LR'; } catch { return 'LR'; }
    });
    const [showAllEdges, setShowAllEdges] = useState(() => {
        try { return localStorage.getItem('mg_showAllEdges') === 'true'; } catch { return false; }
    });
    const [groupBy, setGroupBy] = useState(() => {
        try { return localStorage.getItem('mg_groupBy') || 'None'; } catch { return 'None'; }
    });
    const [nodeLabels, setNodeLabels] = useState<string[]>(() => {
        try { const s = localStorage.getItem('mg_nodeLabels'); return s ? JSON.parse(s) : ['host', 'ip']; } catch { return ['host', 'ip']; }
    });
    const [packetFlowView, setPacketFlowView] = useState(() => {
        try { return localStorage.getItem('mg_packetFlowView') !== 'false'; } catch { return true; }
    });
    const [mergeByHost, setMergeByHost] = useState(() => {
        try { return localStorage.getItem('mg_mergeByHost') !== 'false'; } catch { return true; }
    });
    // Task for Edge state
    const [taskForEdgeModal, setTaskForEdgeModal] = useState<any>(null);
    const [taskForEdgeCommand, setTaskForEdgeCommand] = useState<any>(null);
    const [taskForEdgeParams, setTaskForEdgeParams] = useState('');
    const [taskingForEdge, setTaskingForEdge] = useState(false);

    // ── Eventing dialog ──
    const [showEventingDialog, setShowEventingDialog] = useState<any>(null);
    // ── Edge & pane context menus ──
    const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; edge: any } | null>(null);
    const [paneContextMenu, setPaneContextMenu] = useState<{ x: number; y: number } | null>(null);
    // ── Manually Remove Edge dialog ──
    const [removeEdgeModal, setRemoveEdgeModal] = useState<any[] | null>(null);
    // ── Manually Add Edge (P2P) dialog ──
    const [manuallyAddEdgeModal, setManuallyAddEdgeModal] = useState<any>(null);
    const [addEdgeSelectedProfile, setAddEdgeSelectedProfile] = useState<any>(null);
    const [addEdgeSelectedDest, setAddEdgeSelectedDest] = useState<any>(null);
    const [addEdgeDestOptions, setAddEdgeDestOptions] = useState<any[]>([]);
    // ── Graph view mode ──
    const [graphViewMode, setGraphViewMode] = useState<'CALLBACKS' | 'BROWSERSCRIPTS'>('CALLBACKS');
    // ── Download refs ──
    const graphContainerRef = useRef<HTMLDivElement>(null);
    const bsContainerRef = useRef<HTMLDivElement>(null);
    // ── BrowserScript view state ──
    const [bsHiddenNodeIds, setBsHiddenNodeIds] = useState<Set<string>>(new Set());
    const [bsContextMenu, setBsContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const [bsLayoutDir, setBsLayoutDir] = useState<'LR' | 'TB'>('LR');
    const [bsSelectedNodeIds, setBsSelectedNodeIds] = useState<Set<string>>(new Set());
    const [bsEdgeCtxMenu, setBsEdgeCtxMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);
    const [bsPaneCtxMenu, setBsPaneCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const [bsElkData, setBsElkData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
    const [bsGroupBy, setBsGroupBy] = useState<string>('None');
    const [bsShowLargeGraph, setBsShowLargeGraph] = useState(false);

    // Persist graph config to localStorage
    useEffect(() => { localStorage.setItem('mg_layoutDir', layoutDir); }, [layoutDir]);
    useEffect(() => { localStorage.setItem('mg_showAllEdges', String(showAllEdges)); }, [showAllEdges]);
    useEffect(() => { localStorage.setItem('mg_groupBy', groupBy); }, [groupBy]);
    useEffect(() => { localStorage.setItem('mg_nodeLabels', JSON.stringify(nodeLabels)); }, [nodeLabels]);
    useEffect(() => { localStorage.setItem('mg_packetFlowView', String(packetFlowView)); }, [packetFlowView]);
    useEffect(() => { localStorage.setItem('mg_mergeByHost', String(mergeByHost)); }, [mergeByHost]);

    // All-edges query (non-active edges, skip when not needed) — must come AFTER showAllEdges state declaration
    const { data: allEdgesData } = useQuery(GET_CALLBACK_GRAPH_EDGES_ALL, {
        pollInterval: 15000,
        skip: !showAllEdges
    });
    // Lazy query for link commands when Task-for-Edge dialog opens
    const [getLinkCommands, { data: linkCommandsData, loading: linkCommandsLoading }] = useLazyQuery(GET_LINK_COMMANDS_FOR_CALLBACK, { fetchPolicy: 'network-only' });

    // Browserscript relationship data (loaded on demand when BROWSERSCRIPTS view is active)
    const { data: bsData, refetch: refetchBS } = useQuery(GET_CALLBACKS_WITH_BROWSERSCRIPTS, {
        fetchPolicy: 'network-only',
        skip: graphViewMode !== 'BROWSERSCRIPTS',
        pollInterval: graphViewMode === 'BROWSERSCRIPTS' ? 10000 : 0,
    });

    // Build raw (unpositioned) nodes/edges from bsData — just structure, no layout
    const bsRawData = React.useMemo(() => {
        if (!bsData?.callback) return { nodes: [], edges: [] };
        const rawNodes: any[] = [];
        const rawEdges: any[] = [];
        const scriptIds = new Set<string>();
        bsData.callback.forEach((cb: any) => {
            const cbNodeId = `cb-${cb.id}`;
            const payloadType = cb.payload?.payloadtype?.name || 'agent';
            rawNodes.push({
                id: cbNodeId,
                type: 'bsCallbackNode',
                position: { x: 0, y: 0 },
                data: {
                    displayId: cb.display_id,
                    host: cb.host || cb.ip || '',
                    user: cb.user || '',
                    ip: cb.ip || '',
                    domain: cb.domain || '',
                    os: cb.os || '',
                    payloadType,
                    buttons: [
                        { type: 'interact', label: 'Interact', displayId: cb.display_id },
                    ],
                },
            });
            const scripts: any[] = [];
            (cb.loadedcommands || []).forEach((lc: any) => {
                (lc.command?.browserscripts || []).forEach((bs: any) => {
                    scripts.push({ ...bs, _payloadType: payloadType });
                });
            });
            scripts.forEach((bs: any) => {
                const bsNodeId = `bs-${bs.id}`;
                if (!scriptIds.has(bsNodeId)) {
                    scriptIds.add(bsNodeId);
                    rawNodes.push({
                        id: bsNodeId,
                        type: 'browserscriptNode',
                        position: { x: 0, y: 0 },
                        data: {
                            label: bs.name,
                            name: bs.name,
                            command: bs.command?.cmd || '',
                            agentIcon: bs._payloadType,
                            // overlay_img: agent icon as JSX (rendered in BrowserscriptNode)
                            overlay_img: bs._payloadType ? (
                                <img src={`/static/${bs._payloadType}_dark.svg`} alt=""
                                    style={{ width: 14, height: 14, objectFit: 'contain' }}
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : null,
                        },
                    });
                }
                rawEdges.push({
                    id: `e-${cbNodeId}-${bsNodeId}-${bs.id}`,
                    source: cbNodeId,
                    target: bsNodeId,
                    label: bs.command?.cmd || '',
                    style: { stroke: '#22c55e44', strokeWidth: 1 },
                    animated: false,
                    data: { commandName: bs.command?.cmd || '', scriptName: bs.name || '' },
                });
            });
        });
        return { nodes: rawNodes, edges: rawEdges };
    }, [bsData]);

    // Run ELK layout whenever raw data or layout direction changes
    useEffect(() => {
        if (bsRawData.nodes.length === 0) { setBsElkData({ nodes: [], edges: [] }); return; }
        let cancelled = false;
        const elkNodes = bsRawData.nodes.map((n: any) => ({
            id: n.id,
            width: n.type === 'bsCallbackNode' ? 120 : 140,
            height: n.type === 'bsCallbackNode' ? 80 : 64,
        }));
        const nodeIdSet = new Set(bsRawData.nodes.map((n: any) => n.id));
        const elkEdges = bsRawData.edges
            .filter((e: any) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
            .map((e: any) => ({ id: e.id, sources: [e.source], targets: [e.target] }));
        const elkDirection = bsLayoutDir === 'LR' ? 'RIGHT' : 'DOWN';
        elk.layout({
            id: 'bs-root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': elkDirection,
                'elk.layered.spacing.nodeNodeBetweenLayers': '80',
                'elk.spacing.nodeNode': '40',
            },
            children: elkNodes,
            edges: elkEdges,
        }).then((result: any) => {
            if (cancelled) return;
            const posMap = new Map<string, { x: number; y: number }>();
            (result.children || []).forEach((n: any) => { posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }); });
            setBsElkData({
                nodes: bsRawData.nodes.map((n: any) => ({ ...n, position: posMap.get(n.id) ?? n.position })),
                edges: bsRawData.edges,
            });
        }).catch(() => {
            if (!cancelled) setBsElkData(bsRawData);
        });
        return () => { cancelled = true; };
    }, [bsRawData, bsLayoutDir]);

    // BrowserScript graph with hidden-node filtering applied (uses ELK-laid-out data)
    const bsVisibleGraphData = React.useMemo(() => {
        if (bsHiddenNodeIds.size === 0) return bsElkData;
        const visibleIds = new Set(
            bsElkData.nodes.filter((n: any) => !bsHiddenNodeIds.has(n.id)).map((n: any) => n.id)
        );
        return {
            nodes: bsElkData.nodes.filter((n: any) => !bsHiddenNodeIds.has(n.id)),
            edges: bsElkData.edges.filter((e: any) => visibleIds.has(e.source) && visibleIds.has(e.target)),
        };
    }, [bsElkData, bsHiddenNodeIds]);

    // Add selection visual feedback on top of visible data
    const bsDisplayData = React.useMemo(() => {
        const { nodes, edges } = bsVisibleGraphData;
        if (bsSelectedNodeIds.size === 0) return { nodes, edges };
        const selNodes = nodes.filter((n: any) => bsSelectedNodeIds.has(n.id));
        const connectedEdges = getConnectedEdges(selNodes, edges);
        const connectedEdgeIds = new Set(connectedEdges.map((e: any) => e.id));
        return {
            nodes: nodes.map((n: any) => ({
                ...n,
                data: { ...n.data, _selected: bsSelectedNodeIds.has(n.id), _anySelected: true },
            })),
            edges: edges.map((e: any) => ({
                ...e,
                style: connectedEdgeIds.has(e.id)
                    ? { stroke: '#22c55e', strokeWidth: 2, opacity: 1 }
                    : { stroke: '#22c55e22', strokeWidth: 1, opacity: 0.2 },
            })),
        };
    }, [bsVisibleGraphData, bsSelectedNodeIds]);

    // BrowserScript group_by overlay: compute bounding GroupBoundNode overlays
    const bsFinalDisplayData = React.useMemo(() => {
        const { nodes, edges } = bsDisplayData;
        if (bsGroupBy === 'None') return { nodes: nodes.filter((n: any) => n.type !== 'groupBound'), edges };
        const PAD = 28, NODE_W = 120, NODE_H = 80;
        const bounds = new Map<string, { mnX: number; mnY: number; mxX: number; mxY: number }>();
        nodes.forEach((n: any) => {
            if (n.type === 'groupBound') return;
            const val = n.type === 'bsCallbackNode' ? String((n.data as any)[bsGroupBy] ?? '(none)') : null;
            if (!val) return;
            const b = bounds.get(val) ?? { mnX: Infinity, mnY: Infinity, mxX: -Infinity, mxY: -Infinity };
            b.mnX = Math.min(b.mnX, n.position.x);
            b.mnY = Math.min(b.mnY, n.position.y);
            b.mxX = Math.max(b.mxX, n.position.x + NODE_W);
            b.mxY = Math.max(b.mxY, n.position.y + NODE_H);
            bounds.set(val, b);
        });
        const groupNodes: any[] = [];
        bounds.forEach((b, gv) => {
            if (b.mnX === Infinity) return;
            groupNodes.push({
                id: `bs-group-${gv}`,
                type: 'groupBound',
                position: { x: b.mnX - PAD, y: b.mnY - PAD },
                style: { width: b.mxX - b.mnX + PAD * 2, height: b.mxY - b.mnY + PAD * 2, zIndex: -10, pointerEvents: 'none' },
                data: { groupBy: bsGroupBy, groupValue: gv },
                selectable: false, draggable: false,
            });
        });
        return { nodes: [...groupNodes, ...nodes.filter((n: any) => n.type !== 'groupBound')], edges };
    }, [bsDisplayData, bsGroupBy]);

    // GraphQL for custom nodes - use polling for real-time updates
    const { data: customNodesData, refetch: refetchCustomNodes } = useQuery(GET_CUSTOM_GRAPH_NODES, {
        pollInterval: 15000,
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first'
    });

    // ── Link Focus: global persistent state via agentstorage ────────────────
    const { data: linkFocusData } = useQuery(GET_LINK_FOCUS, {
        pollInterval: 10000,
        fetchPolicy: 'network-only',
    });
    const [setLinkFocusMutation] = useMutation(SET_LINK_FOCUS);
    const [clearLinkFocusMutation] = useMutation(CLEAR_LINK_FOCUS);

    // Derive focus state from live query
    const { linkFocusNodeId, linkFocusNodeLabel } = useMemo(() => {
        const row = linkFocusData?.agentstorage?.[0];
        if (!row) return { linkFocusNodeId: null, linkFocusNodeLabel: '' };
        try {
            let raw: string = row.data ?? '';
            // Hasura returns bytea as hex string \x...
            if (typeof raw === 'string' && raw.startsWith('\\x')) {
                raw = Array.from({ length: (raw.length - 2) / 2 },
                    (_, i) => String.fromCharCode(parseInt(raw.slice(2 + i * 2, 4 + i * 2), 16))
                ).join('');
            }
            const parsed = JSON.parse(decodeURIComponent(escape(atob(raw))));
            return { linkFocusNodeId: parsed.nodeId ?? null, linkFocusNodeLabel: parsed.label ?? '' };
        } catch { return { linkFocusNodeId: null, linkFocusNodeLabel: '' }; }
    }, [linkFocusData]);

    const handleSetLinkFocus = useCallback((nodeId: string, label: string) => {
        const data = btoa(unescape(encodeURIComponent(JSON.stringify({ nodeId, label }))));
        setLinkFocusMutation({ variables: { data } });
        autoLinkedCallbacksRef.current.clear();
    }, [setLinkFocusMutation]);

    const handleClearLinkFocus = useCallback(() => {
        clearLinkFocusMutation();
        autoLinkedCallbacksRef.current.clear();
    }, [clearLinkFocusMutation]);

    // GraphQL for custom edges - use polling for real-time updates
    const { data: customEdgesData, refetch: refetchCustomEdges } = useQuery(GET_CUSTOM_GRAPH_EDGES, {
        pollInterval: 15000,
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first'
    });

    const [createCustomNodeMutation] = useMutation(CREATE_CUSTOM_GRAPH_NODE);
    const [updateCustomNodeMutation] = useMutation(UPDATE_CUSTOM_GRAPH_NODE);
    const [deleteCustomNodeMutation] = useMutation(DELETE_CUSTOM_GRAPH_NODE);
    const [createCustomEdgeMutation] = useMutation(CREATE_CUSTOM_GRAPH_EDGE);
    const [deleteCustomEdgeMutation] = useMutation(DELETE_CUSTOM_GRAPH_EDGE);

    // Sync custom nodes from GraphQL (agentstorage)
    useEffect(() => {
        log(' customNodesData changed:', customNodesData);
        
        if (customNodesData?.agentstorage) {
            log(' Found agentstorage data:', customNodesData.agentstorage);
            try {
                const parsedNodes = parseAgentStorageResults(customNodesData.agentstorage);
                log(' Parsed nodes:', parsedNodes);
                
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
                
                log(' Mapped internal nodes:', nodes);
                setCustomNodes(nodes);
                log(' setCustomNodes called with', nodes.length, 'nodes');
                
                // Generate edges from parent relationships
                // For callback parents: parent_id is the database primary key (c.id)
                // For custom parents: parent_id is the custom node's db_id
                const parentEdgesFromNodes = nodes
                    .filter((node: any) => node.parent_id !== undefined && node.parent_id !== null)
                    .map((node: any) => ({
                        id: `custom-edge-${node.db_id}`,
                        source: node.id,
                        target: node.parent_type === 'custom' ? `custom-${node.parent_id}` : String(node.parent_id),
                        sourceId: node.db_id,
                        targetId: node.parent_id,
                        c2profile: node.c2profile || ''
                    }));
                
                log(' Generated edges from parent relationships:', parentEdgesFromNodes);
                
                // Update edges while preserving callback->custom edges
                setCustomEdges(prevEdges => {
                    // Keep callback->custom edges (from database)
                    const callbackEdges = prevEdges.filter(e => e.id.includes('callback-'));
                    // Replace parent edges with new ones
                    log(' Merging parent edges:', parentEdgesFromNodes.length, 'with callback edges:', callbackEdges.length);
                    return [...parentEdgesFromNodes, ...callbackEdges];
                });
            } catch (error) {
                console.error('[CallbackGraph] Failed to parse custom nodes from agentstorage:', error);
                snackActions.error('Failed to load custom nodes: ' + (error as Error).message);
            }
        } else {
            log(' No agentstorage data in customNodesData');
        }
    }, [customNodesData]);

    // Sync custom edges from GraphQL (stored edges in agentstorage)
    useEffect(() => {
        log(' customEdgesData changed:', customEdgesData);
        
        if (customEdgesData?.agentstorage) {
            log(' Found custom edges data:', customEdgesData.agentstorage);
            try {
                const storedCallbackEdges = parseEdgeStorageResults(customEdgesData.agentstorage);
                log(' Parsed callback->custom edges:', storedCallbackEdges);
                
                // Update edges while preserving parent edges
                setCustomEdges(prevEdges => {
                    // Keep parent edges (custom node -> callback/custom)
                    const parentEdges = prevEdges.filter(e => e.id.startsWith('custom-edge-') && !e.id.includes('callback-'));
                    // Replace callback edges with stored ones
                    log(' Merging stored callback edges:', storedCallbackEdges.length, 'with parent edges:', parentEdges.length);
                    return [...parentEdges, ...storedCallbackEdges];
                });
            } catch (error) {
                console.error('[CallbackGraph] Failed to parse custom edges:', error);
            }
        } else {
            log(' No custom edges data, keeping only parent edges');
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
        log('[handleCreateCustomNode] === START ===');
        log('[handleCreateCustomNode] Form:', customNodeForm);
        
        if (!customNodeForm.host || !customNodeForm.ip) {
            console.error('[handleCreateCustomNode] Validation failed - missing host or IP');
            snackActions.error("Hostname and IP are required");
            return;
        }
        
        try {
            log('[handleCreateCustomNode] Parsing existing nodes...');
            // Generate next ID based on existing nodes
            const parsedNodes = customNodesData?.agentstorage 
                ? parseAgentStorageResults(customNodesData.agentstorage) 
                : [];
            log('[handleCreateCustomNode] Found', parsedNodes.length, 'existing nodes');
            log('[handleCreateCustomNode] Existing node IDs:', parsedNodes.map(n => n.id));
            
            const nextId = generateNextId(parsedNodes);
            log('[handleCreateCustomNode] Generated next ID:', nextId);
            
            // Prepare data for agentstorage
            log('[handleCreateCustomNode] Preparing node data...');
            const { unique_id, data } = prepareCreateNodeData({
                hostname: customNodeForm.host,
                ip_address: customNodeForm.ip,
                operating_system: customNodeForm.os,
                architecture: customNodeForm.architecture,
                username: customNodeForm.user || undefined,
                description: customNodeForm.description
            }, nextId);
            
            log('[handleCreateCustomNode] unique_id:', unique_id);
            log('[handleCreateCustomNode] data (first 100 chars):', data.substring(0, 100));
            log('[handleCreateCustomNode] data length:', data.length);
            
            log('[handleCreateCustomNode] Calling createCustomNodeMutation...');
            const result = await createCustomNodeMutation({
                variables: {
                    unique_id,
                    data
                }
            });

            log('[handleCreateCustomNode] Mutation completed. Result:', result);
            
            if (result.data?.insert_agentstorage_one) {
                log('[handleCreateCustomNode] Created successfully:', result.data.insert_agentstorage_one);
                snackActions.success(`Custom node "${customNodeForm.host}" created`);
                setShowCustomNodeModal(false);
                
                // Force refetch to get updated data
                log('[handleCreateCustomNode] Refetching custom nodes...');
                await refetchCustomNodes();
                log('[handleCreateCustomNode] Refetch complete');
                
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
    
    const handleImportCustomNodes = async () => {
        try {
            const importObj = JSON.parse(importData);
            if (!importObj.customNodes || !Array.isArray(importObj.customNodes)) {
                snackActions.error('Invalid import data format');
                return;
            }
            
            // Create each imported node in the DB
            let createdCount = 0;
            const existingNodes = customNodesData?.agentstorage ? parseAgentStorageResults(customNodesData.agentstorage) : [];
            let importNextId = generateNextId(existingNodes);
            for (const node of importObj.customNodes) {
                try {
                    const { unique_id, data } = prepareCreateNodeData({
                        hostname: node.host || node.hostname || 'Imported Node',
                        ip_address: node.ip || node.ip_address || '0.0.0.0',
                        operating_system: node.os || node.operating_system || 'Unknown',
                        architecture: node.architecture || 'x64',
                        username: node.user || node.username || undefined,
                        description: node.description || undefined,
                        hidden: false,
                    }, importNextId++);
                    await createCustomNodeMutation({ variables: { unique_id, data } });
                    createdCount++;
                } catch (e: any) {
                    console.error('[Import] Failed to create node:', node, e);
                }
            }
            
            // Import custom edges (local merge)
            if (importObj.customEdges && Array.isArray(importObj.customEdges)) {
                const existingEdgeIds = new Set(customEdges.map((e: any) => e.id));
                const newEdges = importObj.customEdges.filter((e: any) => !existingEdgeIds.has(e.id));
                setCustomEdges([...customEdges, ...newEdges]);
            }
            
            await refetchCustomNodes();
            snackActions.success(`Imported ${createdCount} node${createdCount !== 1 ? 's' : ''}`);
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
        
        log('[handleSetParent] isSourceCustom:', isSourceCustom, 'isDestCustom:', isDestCustom);
        log('[handleSetParent] setParentModal:', setParentModal);
        log('[handleSetParent] selectedDestination:', selectedDestination);
        
        if (isSourceCustom) {
            // Source is a custom node - need to update in database
            try {
                log('[handleSetParent] Updating custom node parent connection...');
                log('[handleSetParent] Source:', setParentModal.id, 'db_id:', setParentModal.db_id);
                log('[handleSetParent] Destination:', selectedDestination.id, 'display_id:', selectedDestination.display_id);
                
                // Find the full custom node data
                const sourceNode = customNodes.find(n => n.id === setParentModal.id);
                if (!sourceNode) {
                    console.error('[handleSetParent] Source node not found in customNodes:', setParentModal.id);
                    console.error('[handleSetParent] Available custom nodes:', customNodes.map(n => n.id));
                    snackActions.error("Source node not found");
                    return;
                }
                
                log('[handleSetParent] Found source node:', sourceNode);
                
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
                    parent_id: isDestCustom ? selectedDestination.db_id : selectedDestination.id,
                    parent_type: isDestCustom ? 'custom' : 'callback',
                    c2profile: selectedProfile.name
                });
                
                log('[handleSetParent] Updating with parent_id:', isDestCustom ? selectedDestination.db_id : selectedDestination.display_id);
                
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
                log('[handleSetParent] Creating custom edge: callback → custom node');
                log('[handleSetParent] Source (callback):', setParentModal.id, setParentModal.display_id);
                log('[handleSetParent] Destination (custom):', selectedDestination.id, selectedDestination.db_id);
                
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
                
                log('[handleSetParent] Saving edge to database:', newEdge);
                
                // Delete ALL existing edges from this callback (query from current edges data)
                const existingEdgesFromCallback = customEdges.filter(e => e.source === String(setParentModal.id));
                log('[handleSetParent] Found', existingEdgesFromCallback.length, 'existing edges to remove');
                
                for (const edge of existingEdgesFromCallback) {
                    try {
                        log('[handleSetParent] Deleting edge:', edge.id, 'unique_id:', generateEdgeUniqueId(edge.id));
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
        const callbackIdStr = String(callbackId);
        
        // Check custom edges first (callback → custom node)
        // e.source is stored as string when edge is created
        const customEdge = customEdges.find(e => String(e.source) === callbackIdStr);
        if (customEdge) return customEdge;
        
        // Then check database edges
        if (!edgesData?.callbackgraphedge) return null;
        return edgesData.callbackgraphedge.find(
            (e: any) => e.source?.id === callbackId && !e.end_timestamp
        );
    }, [edgesData, customEdges]);

    // Disconnect from parent - removes the edge where this callback is the source
    const handleDisconnectParent = async (callback: any) => {
        log('[handleDisconnectParent] callback:', callback);
        log('[handleDisconnectParent] callback.id:', callback.id, 'type:', typeof callback.id);
        log('[handleDisconnectParent] callback.isCustom:', callback.isCustom);
        log('[handleDisconnectParent] customEdges:', customEdges.map(e => ({ id: e.id, source: e.source, target: e.target })));
        
        const parentEdge = getParentEdge(callback.id);
        log('[handleDisconnectParent] Found parentEdge:', parentEdge);
        
        if (!parentEdge) {
            snackActions.info("No parent connection found");
            setContextMenu(null);
            return;
        }

        // Check if it's a custom node disconnecting from its parent
        if (callback.isCustom) {
            try {
                log('[handleDisconnectParent] Removing parent from custom node:', callback.db_id);
                
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
                log('[handleDisconnectParent] Removing custom edge from database:', parentEdge.id);
                
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

    // ── Helper: restore all edge/node styles to originals ──
    const clearGraphSelection = useCallback(() => {
        selectedNodeIds.current.clear();
        setEdges(eds => eds.map(e => ({
            ...e,
            animated: (e.data as any)?.origAnimated ?? e.animated,
            style: (e.data as any)?.origStyle ? { ...(e.data as any).origStyle } : e.style,
        })));
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, isDimmed: false, isHighlighted: false },
        })));
    }, [setEdges, setNodes]);

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'root' || node.type === 'groupBound') return;
        if (node.data?.isCustom) {
            snackActions.warning(`⚠ Custom Node "${node.data.host || node.data.display_id}" is a manually created reference node and cannot be directly controlled.`);
            return;
        }

        const selIds = selectedNodeIds.current;

        if (event.shiftKey) {
            // Shift+click: toggle node in/out of multi-selection
            if (selIds.has(node.id)) {
                selIds.delete(node.id);
            } else {
                selIds.add(node.id);
            }
        } else {
            // Single click: if already the only selected node, clear; else select only this node
            if (selIds.size === 1 && selIds.has(node.id)) {
                clearGraphSelection();
                return;
            }
            selectedNodeIds.current = new Set([node.id]);
        }

        const currentSelIds = selectedNodeIds.current;

        if (currentSelIds.size === 0) {
            clearGraphSelection();
            return;
        }

        // Get connected edges for ALL selected nodes (union)
        const currentNodes = nodes;
        const currentEdges = edges;
        const selNodes = currentNodes.filter(n => currentSelIds.has(n.id));
        const connectedEdges = getConnectedEdges(selNodes, currentEdges);
        const connectedEdgeIds = new Set(connectedEdges.map(e => e.id));

        // Determine which non-selected nodes are adjacent (connected via an edge)
        const adjacentNodeIds = new Set<string>();
        connectedEdges.forEach(e => {
            if (!currentSelIds.has(e.source)) adjacentNodeIds.add(e.source);
            if (!currentSelIds.has(e.target)) adjacentNodeIds.add(e.target);
        });

        // Update edge styles: highlight connected, dim the rest
        setEdges(eds => eds.map(e => {
            if (connectedEdgeIds.has(e.id)) {
                return {
                    ...e,
                    animated: true,
                    style: {
                        ...((e.data as any)?.origStyle || e.style),
                        strokeWidth: 3,
                        opacity: 1,
                        filter: 'drop-shadow(0 0 4px #22c55e)',
                    },
                };
            }
            return {
                ...e,
                animated: false,
                style: {
                    ...((e.data as any)?.origStyle || e.style),
                    opacity: 0.12,
                },
            };
        }));

        // Update node states: selected = highlighted, adjacent = visible, others = dimmed
        setNodes(nds => nds.map(n => {
            if (n.id === 'root') return n;
            const isSel = currentSelIds.has(n.id);
            const isAdj = adjacentNodeIds.has(n.id);
            return {
                ...n,
                data: {
                    ...n.data,
                    isHighlighted: isSel,
                    isDimmed: !isSel && !isAdj,
                },
            };
        }));
    }, [nodes, edges, setEdges, setNodes, clearGraphSelection]);

    const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'root' || node.type === 'groupBound' || node.data?.isCustom) return;
        if (node.data?.display_id) {
            navigate(`/console/${node.data.display_id}`);
        }
    }, [navigate]);
    
    // Link Focus: auto-link newly arriving callbacks to the designated focus node
    useEffect(() => {
        if (!linkFocusNodeId) return;
        const callbacks: any[] = callbacksData?.callback || [];
        callbacks.forEach((cb: any) => {
            const cbStrId = String(cb.id);
            if (autoLinkedCallbacksRef.current.has(cbStrId)) return; // already linked
            autoLinkedCallbacksRef.current.add(cbStrId);
            // Skip if the callback IS the focus node
            if (cbStrId === linkFocusNodeId) return;
            // Create a custom edge: source=child(callback), target=parent(focus node)
            const edgeId = `focus-link-${cbStrId}-to-${linkFocusNodeId}`;
            setCustomEdges(prev => {
                if (prev.some(e => e.id === edgeId)) return prev;
                return [...prev, {
                    id: edgeId,
                    source: cbStrId,
                    target: linkFocusNodeId,
                    c2profile: 'focus',
                }];
            });
        });
    }, [callbacksData, linkFocusNodeId]);

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
        // Get callbacks array safely (empty array if loading/undefined)
        const callbacks = callbacksData?.callback || [];
        
        // Only return empty if BOTH are truly empty (not during loading)
        // If we have previous data and current is empty, return previous to prevent flickering
        if (callbacks.length === 0 && customNodes.length === 0) {
            // If we have cached data, return it during loading/refetch
            if (prevGraphDataRef.current.nodes.length > 0) {
                return prevGraphDataRef.current;
            }
            return { nodes: [], edges: [] };
        }

        // Filter callbacks based on showHiddenNodes toggle
        let visibleCallbacks = showHiddenNodes 
            ? [...callbacks]
            : callbacks.filter((c: any) => c.active !== false);

        // Apply filterCallbackIds (from Callbacks.tsx column filters)
        if (filterCallbackIds && filterCallbackIds.size > 0) {
            visibleCallbacks = visibleCallbacks.filter((c: any) => filterCallbackIds.has(String(c.display_id)));
        }

        // Apply groupBy sorting so related callbacks cluster together in layout
        if (groupBy !== 'None') {
            visibleCallbacks = [...visibleCallbacks].sort((a: any, b: any) => {
                const av = String(a[groupBy] ?? '');
                const bv = String(b[groupBy] ?? '');
                return av.localeCompare(bv);
            });
        }
        
        // ── Merge by host: group callbacks per machine, keep best representative ──
        let mergedCallbacks = visibleCallbacks;
        // Maps merged representative id → all original callback ids (for edge remapping)
        const mergedIdMap = new Map<string, string[]>();
        if (mergeByHost && visibleCallbacks.length > 0) {
            const privLevel = (c: any) => {
                const il = Number(c.integrity_level ?? 0);
                if (il >= 4) return 4; // SYSTEM / root
                if (il === 3) return 3; // Admin
                if (il === 2) return 2; // User
                return 1;
            };
            const byHost = new Map<string, any[]>();
            for (const c of visibleCallbacks) {
                const key = (c.host || '').toLowerCase();
                if (!byHost.has(key)) byHost.set(key, []);
                byHost.get(key)!.push(c);
            }
            mergedCallbacks = [];
            for (const [, group] of byHost) {
                // Sort: alive first → highest privilege → newest
                group.sort((a: any, b: any) => {
                    const aAlive = isCallbackAlive(a) ? 1 : 0;
                    const bAlive = isCallbackAlive(b) ? 1 : 0;
                    if (bAlive !== aAlive) return bAlive - aAlive;
                    const ap = privLevel(a), bp = privLevel(b);
                    if (bp !== ap) return bp - ap;
                    return Number(b.display_id ?? 0) - Number(a.display_id ?? 0);
                });
                const rep = { ...group[0], _hostSessions: group };
                mergedCallbacks.push(rep);
                mergedIdMap.set(String(rep.id), group.map((c: any) => String(c.id)));
            }
        }

        const allCallbacks = [...mergedCallbacks, ...customNodes];

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
                    process_name: c.process_name || '',
                    // C2 profiles for this callback (for edge labels)
                    c2profiles: c.callbackc2profiles?.map((cp: any) => cp.c2profile?.name).filter(Boolean) || [],
                    // Configurable node labels to display
                    nodeLabels: nodeLabels,
                    // Host-merged sessions (only present when mergeByHost is on)
                    hostSessions: c._hostSessions || null,
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
        // In Mythic: e.source = child (further from root), e.destination = parent (closer to root)
        // packetFlowView=true (default): arrows show packet flow child→root (egress direction)
        // packetFlowView=false: arrows show connection direction parent→child (connection view)
        const activeEdgesSource = showAllEdges ? allEdgesData : edgesData;
        if (activeEdgesSource?.callbackgraphedge) {
            activeEdgesSource.callbackgraphedge.forEach((e: any) => {
                const isActive = !e.end_timestamp;
                if ((!showAllEdges && !isActive) || !e.source || !e.destination) return;
                // packetFlowView: show how packets flow (child sends to parent = egress)
                const [edgeSrc, edgeTgt] = packetFlowView
                    ? [String(e.source.id), String(e.destination.id)]  // child→parent (packet egress)
                    : [String(e.destination.id), String(e.source.id)]; // parent→child (connection view)
                flowEdges.push({
                    id: `e${e.destination.id}-${e.source.id}`,
                    source: edgeSrc,
                    target: edgeTgt,
                    type: 'c2label',
                    animated: isActive,
                    style: {
                        stroke: isActive ? '#22c55e' : '#ef4444',
                        strokeWidth: 2,
                        strokeDasharray: isActive ? undefined : '6,4',
                        opacity: isActive ? 1 : 0.6,
                    },
                    label: e.c2profile?.name || 'Linked',
                    data: {
                        origStyle: {
                            stroke: isActive ? '#22c55e' : '#ef4444',
                            strokeWidth: 2,
                            strokeDasharray: isActive ? undefined : '6,4',
                            opacity: isActive ? 1 : 0.6,
                        },
                        origAnimated: isActive,
                    }
                });
            });
        }
        
        // Add custom edges (for custom nodes)
        // Custom edges follow same convention: e.source = child, e.target = parent
        // Swap to parent→child for left→right layout
        customEdges.forEach((e: any) => {
            flowEdges.push({
                id: e.id,
                source: String(e.target), // parent (closer to root, on left)
                target: String(e.source), // child (further from root, on right)
                animated: false,
                style: { stroke: '#ffffff', strokeWidth: 2 }, // White straight line
                // No markerEnd — no arrow, just a straight line
                label: e.c2profile || 'Custom',
                data: {
                    origStyle: { stroke: '#ffffff', strokeWidth: 2 },
                    origAnimated: false,
                }
            });
        });

        // When mergeByHost is active, remap edges so they point to representative nodes
        if (mergeByHost && mergedIdMap.size > 0) {
            // Build reverse map: original callback id → representative id
            const childToRep = new Map<string, string>();
            for (const [repId, childIds] of mergedIdMap) {
                for (const cid of childIds) {
                    if (cid !== repId) childToRep.set(cid, repId);
                }
            }
            // Remap edge endpoints and deduplicate
            const seen = new Set<string>();
            for (let i = flowEdges.length - 1; i >= 0; i--) {
                const e = flowEdges[i];
                if (childToRep.has(e.source)) e.source = childToRep.get(e.source)!;
                if (childToRep.has(e.target)) e.target = childToRep.get(e.target)!;
                // Remove self-loops and duplicates
                const key = `${e.source}->${e.target}`;
                if (e.source === e.target || seen.has(key)) {
                    flowEdges.splice(i, 1);
                } else {
                    seen.add(key);
                }
            }
        }

        // Get all visible node IDs (excluding root)
        const visibleNodeIds = new Set(flowNodes.filter(n => n.id !== 'root').map(n => n.id));
        
        // Find nodes that have a parent connection to another VISIBLE callback
        // After direction swap: source=parent, target=child
        // So target nodes are the ones WITH a parent
        const nodesWithParent = new Set(
            flowEdges
                .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target) && e.source !== e.target)
                .map(e => e.target)
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
                    style: { stroke: '#ffffff', strokeWidth: 2 },
                    label: c2Label,
                    labelStyle: { fill: '#a0aec0', fontSize: 11, fontWeight: 500 },
                    labelBgStyle: { fill: 'rgba(0, 0, 0, 0.6)', fillOpacity: 0.8 },
                    labelBgPadding: [5, 3] as [number, number],
                    data: { active: isRecent, timestamp: timestamp, highIntegrity: Number(n.data?.integrity_level || 0) > 2, origStyle: { stroke: '#ffffff', strokeWidth: 2 }, origAnimated: false }
                });
            });

        const result = { nodes: flowNodes, edges: flowEdges };
        // Cache the result for use during loading/refetch states
        prevGraphDataRef.current = result;
        return result;
    }, [callbacksData, edgesData, allEdgesData, showAllEdges, packetFlowView, nodeLabels, groupBy, filterCallbackIds, handleContextMenu, isInitialRender, customNodes, showHiddenNodes, customEdges, mergeByHost]);

    // Track previous edges to detect topology changes
    const prevEdgesRef = useRef<string>('');
    // Track positions of nodes the user has explicitly dragged — preserved across re-layouts
    const userDraggedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        userDraggedPositionsRef.current.set(node.id, node.position);
    }, []);
    
    // Apply ELK layout when data changes (async)
    // ALL nodes (callbacks + custom) pass through ELK for a proper right-directed tree.
    // User-dragged node positions are preserved in userDraggedPositionsRef and restored after layout.
    React.useEffect(() => {
        if (graphData.nodes.length === 0) return;
        let cancelled = false;

        getElkLayoutedElements(graphData.nodes, graphData.edges, layoutDir).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
            if (cancelled) return;

            // Detect topology changes
            const edgeHash = graphData.edges
                .filter(e => !e.id.startsWith('root-'))
                .map(e => `${e.source}->${e.target}`)
                .sort()
                .join('|');
            const edgesChanged = edgeHash !== prevEdgesRef.current;
            prevEdgesRef.current = edgeHash;

            // When topology changes, forget all stored drag positions so the new ELK tree is clean
            if (edgesChanged) {
                userDraggedPositionsRef.current.clear();
            }

            // Compute group bounding-box overlay nodes when groupBy is active
            const computeGroupNodes = (finalNodes: Node[]): Node[] => {
                if (groupBy === 'None') return finalNodes.filter(n => n.type !== 'groupBound');
                const PAD = 30, NODE_W = 275, NODE_H = 100;
                const bounds = new Map<string, { mnX: number; mnY: number; mxX: number; mxY: number }>();
                finalNodes.forEach(n => {
                    if (n.id === 'root' || n.type === 'groupBound' || !n.data) return;
                    const gv = String((n.data as any)[groupBy] ?? '(none)');
                    const b = bounds.get(gv) ?? { mnX: Infinity, mnY: Infinity, mxX: -Infinity, mxY: -Infinity };
                    b.mnX = Math.min(b.mnX, n.position.x);
                    b.mnY = Math.min(b.mnY, n.position.y);
                    b.mxX = Math.max(b.mxX, n.position.x + NODE_W);
                    b.mxY = Math.max(b.mxY, n.position.y + NODE_H);
                    bounds.set(gv, b);
                });
                const groupNodes: Node[] = [];
                bounds.forEach((b, gv) => {
                    if (b.mnX === Infinity) return;
                    groupNodes.push({
                        id: `group-${gv}`,
                        type: 'groupBound',
                        position: { x: b.mnX - PAD, y: b.mnY - PAD },
                        style: { width: b.mxX - b.mnX + PAD * 2, height: b.mxY - b.mnY + PAD * 2, zIndex: -10, pointerEvents: 'none' as any },
                        data: { groupBy, groupValue: gv },
                        selectable: false,
                        draggable: false,
                    } as unknown as Node);
                });
                return [...groupNodes, ...finalNodes.filter(n => n.type !== 'groupBound')];
            };

            // @ts-ignore
            setNodes(() => {
                // Apply ELK positions, then restore any user-dragged positions on top
                const resolved = layoutedNodes.map(n => {
                    const dragged = userDraggedPositionsRef.current.get(n.id);
                    return dragged ? { ...n, position: dragged } : n;
                });
                return computeGroupNodes(resolved);
            });
            // @ts-ignore
            setEdges(layoutedEdges as Edge[]);
        });
        return () => { cancelled = true; };
    }, [graphData, layoutDir, groupBy, setNodes, setEdges]);

    // Get filtered callbacks for set parent modal - show ALL active callbacks and custom nodes
    const filteredCallbacksForParent = useMemo(() => {
        if (!setParentModal) return [];
        const allNodes = [...(callbacksData?.callback || []), ...customNodes];
        // Filter out the current callback/node — compare by id only (unique across types)
        // Custom nodes have id="custom-X", callbacks have numeric id — no collision
        return allNodes
            .filter((c: any) => c.id !== setParentModal.id)
            .sort((a: any, b: any) => {
                if (a.isCustom && !b.isCustom) return -1;
                if (!a.isCustom && b.isCustom) return 1;
                return (a.display_id ?? 0) - (b.display_id ?? 0);
            });
    }, [callbacksData, setParentModal, customNodes]);

    // ── Node dim effect when context menu is open ──
    useEffect(() => {
        const selectedId = contextMenu?.callback?.id ? String(contextMenu.callback.id) : null;
        setNodes(nds => nds.map(n => ({
            ...n,
            data: {
                ...n.data,
                isDimmed: selectedId !== null && n.id !== selectedId && n.id !== 'root',
            }
        })));
    }, [contextMenu, setNodes]);

    // ── Edge context menu handler ──
    const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
        e.preventDefault();
        e.stopPropagation();
        setEdgeContextMenu({ x: e.clientX, y: e.clientY, edge });
        setContextMenu(null);
        setPaneContextMenu(null);
    }, []);

    // ── Pane context menu handler ──
    const onPaneContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setPaneContextMenu({ x: e.clientX, y: e.clientY });
        setContextMenu(null);
        setEdgeContextMenu(null);
    }, []);

    // ── Pane/edge click: close all context menus + clear dim ──
    const onPaneClick = useCallback(() => {
        setContextMenu(null);
        setEdgeContextMenu(null);
        setPaneContextMenu(null);
        clearGraphSelection();
    }, [clearGraphSelection]);

    // ── Manually Remove Edge ──
    const handleOpenRemoveEdge = useCallback((callback: any) => {
        const callbackId = callback.callback_id ?? callback.id;
        const activeEdges = (edgesData?.callbackgraphedge || []).filter(
            (e: any) => !e.end_timestamp && (e.source?.id === callbackId || e.destination?.id === callbackId)
        );
        if (activeEdges.length === 0) {
            snackActions.info('No active edges for this callback');
            setContextMenu(null);
            return;
        }
        setRemoveEdgeModal(activeEdges);
        setContextMenu(null);
    }, [edgesData]);

    // ── Manually Add P2P Edge ──
    const handleManuallyAddEdge = useCallback(async () => {
        if (!manuallyAddEdgeModal || !addEdgeSelectedProfile || !addEdgeSelectedDest) {
            snackActions.warning('Select a P2P profile and destination callback');
            return;
        }
        try {
            await addEdge({
                variables: {
                    source_id: manuallyAddEdgeModal.display_id ?? manuallyAddEdgeModal.callback_id,
                    destination_id: addEdgeSelectedDest.display_id,
                    c2profile: addEdgeSelectedProfile.name,
                },
            });
            snackActions.success(`P2P edge added → #${addEdgeSelectedDest.display_id}`);
            refetch();
            refetchEdges();
        } catch (e: any) {
            snackActions.error('Failed to add edge: ' + e.message);
        }
        setManuallyAddEdgeModal(null);
        setAddEdgeSelectedProfile(null);
        setAddEdgeSelectedDest(null);
        setAddEdgeDestOptions([]);
    }, [manuallyAddEdgeModal, addEdgeSelectedProfile, addEdgeSelectedDest, addEdge, refetch, refetchEdges]);

    // ── Download graph as SVG ──
    const handleDownloadSVG = useCallback(async () => {
        const el = graphContainerRef.current;
        if (!el) return;
        try {
            snackActions.info('Generating SVG...');
            const dataUrl = await toSvg(el, { backgroundColor: '#050505' });
            const link = document.createElement('a');
            link.download = 'network_topology.svg';
            link.href = dataUrl;
            link.click();
        } catch (e: any) {
            snackActions.error('SVG export failed: ' + e.message);
        }
    }, []);

    // ── Download graph as PNG ──
    const handleDownloadPNG = useCallback(async () => {
        const el = graphContainerRef.current;
        if (!el) return;
        try {
            snackActions.info('Generating image...');
            const dataUrl = await toPng(el, { backgroundColor: '#050505', pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = 'network_topology.png';
            link.href = dataUrl;
            link.click();
        } catch (e: any) {
            snackActions.error('Download failed: ' + e.message);
        }
    }, []);

    // ── Download BrowserScript view as SVG ──
    const handleBsDownloadSvg = useCallback(async () => {
        const el = bsContainerRef.current;
        if (!el) return;
        try {
            snackActions.info('Generating SVG...');
            const dataUrl = await toSvg(el, { backgroundColor: '#050505' });
            const link = document.createElement('a');
            link.download = 'browserscript_graph.svg';
            link.href = dataUrl;
            link.click();
        } catch (e: any) {
            snackActions.error('SVG export failed: ' + e.message);
        }
    }, []);

    // ── BrowserScript node context-menu handler ──
    // ── BrowserScript view event handlers ──────────────────────────────────
    const onBsNodeClick = useCallback((event: React.MouseEvent, node: any) => {
        setBsContextMenu(null);
        setBsEdgeCtxMenu(null);
        setBsPaneCtxMenu(null);
        setBsSelectedNodeIds(prev => {
            const next = new Set(prev);
            if (event.shiftKey) {
                // Shift+click: toggle
                if (next.has(node.id)) { next.delete(node.id); } else { next.add(node.id); }
            } else {
                // Single click: select only this, or deselect if already sole selection
                if (next.size === 1 && next.has(node.id)) { next.clear(); } else { next.clear(); next.add(node.id); }
            }
            return next;
        });
    }, []);

    const onBsEdgeContextMenu = useCallback((event: React.MouseEvent, edge: any) => {
        event.preventDefault();
        setBsEdgeCtxMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
        setBsContextMenu(null);
        setBsPaneCtxMenu(null);
    }, []);

    const onBsPaneContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        setBsPaneCtxMenu({ x: event.clientX, y: event.clientY });
        setBsContextMenu(null);
        setBsEdgeCtxMenu(null);
    }, []);

    const onBsNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
        event.preventDefault();
        setBsContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
        setBsEdgeCtxMenu(null);
        setBsPaneCtxMenu(null);
    }, []);

    return (
        <div ref={graphContainerRef} className="w-full h-full bg-[#050505] border border-ghost/30 relative overflow-hidden rounded-lg">
             {/* Control Buttons */}
             <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">

                {/* Link Focus Indicator */}
                {linkFocusNodeId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/40 rounded text-xs font-mono text-amber-400 animate-pulse">
                        <Crosshair size={12} className="shrink-0" />
                        <span className="max-w-[90px] truncate" title={linkFocusNodeLabel}>FOCUS: {linkFocusNodeLabel}</span>
                        <button
                            onClick={() => handleClearLinkFocus()}
                            className="ml-1 text-amber-500/60 hover:text-amber-300 transition-colors"
                            title="Clear Link Focus"
                        >
                            <X size={11} />
                        </button>
                    </div>
                )}

                {/* View Mode Toggle */}
                <div className="flex border border-signal/30 rounded overflow-hidden">
                    <button
                        onClick={() => setGraphViewMode('CALLBACKS')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono transition-colors ${
                            graphViewMode === 'CALLBACKS'
                                ? 'bg-signal/20 text-signal border-r border-signal/30'
                                : 'bg-black/60 text-gray-500 hover:text-signal/70 border-r border-signal/10'
                        }`}
                        title="Callback Graph View"
                    >
                        <Network size={13} /> CALLBACKS
                    </button>
                    <button
                        onClick={() => setGraphViewMode('BROWSERSCRIPTS')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono transition-colors ${
                            graphViewMode === 'BROWSERSCRIPTS'
                                ? 'bg-signal/20 text-signal'
                                : 'bg-black/60 text-gray-500 hover:text-signal/70'
                        }`}
                        title="Browserscript Graph View"
                    >
                        <Code size={13} /> SCRIPTS
                    </button>
                </div>
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
                <button
                    onClick={() => setShowConfigPanel(p => !p)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded transition-colors text-xs font-mono ${
                        showConfigPanel
                            ? 'bg-signal/20 border-signal/60 text-signal'
                            : 'bg-black/60 border-signal/30 text-signal/70 hover:bg-signal/10 hover:border-signal/50'
                    }`}
                    title="Graph Configuration"
                >
                    <SlidersHorizontal size={14} />
                    CONFIG
                </button>
                </div>

                {/* Config Panel */}
                {showConfigPanel && (
                    <div className="bg-black/95 border border-signal/40 rounded p-3 w-64 flex flex-col gap-3 backdrop-blur-xl shadow-xl shadow-black/60 text-xs font-mono">
                        <div className="text-signal font-bold tracking-widest border-b border-signal/20 pb-2">GRAPH_CONFIG</div>

                        {/* Layout Direction */}
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-[11px]">LAYOUT_DIRECTION</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setLayoutDir('LR')}
                                    className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${layoutDir === 'LR' ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                                >
                                    <ArrowLeftRight size={12} /> LR
                                </button>
                                <button
                                    onClick={() => setLayoutDir('TB')}
                                    className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${layoutDir === 'TB' ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                                >
                                    <ArrowUpDown size={12} /> TB
                                </button>
                            </div>
                        </div>

                        {/* Edge Visibility */}
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-[11px]">EDGE_VISIBILITY</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowAllEdges(false)}
                                    className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${!showAllEdges ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                                >
                                    <Wifi size={12} /> ACTIVE
                                </button>
                                <button
                                    onClick={() => setShowAllEdges(true)}
                                    className={`flex items-center gap-1 px-3 py-1.5 border rounded flex-1 justify-center ${showAllEdges ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                                >
                                    <RefreshCw size={12} /> ALL
                                </button>
                            </div>
                        </div>

                        {/* Packet Flow View */}
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-[11px]">PACKET_FLOW_VIEW</span>
                            <button
                                onClick={() => setPacketFlowView(p => !p)}
                                className={`flex items-center gap-1 px-3 py-1.5 border rounded ${packetFlowView ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                            >
                                <Zap size={12} />
                                {packetFlowView ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        {/* Merge By Host */}
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-[11px]">MERGE_BY_HOST</span>
                            <button
                                onClick={() => setMergeByHost(p => !p)}
                                className={`flex items-center gap-1 px-3 py-1.5 border rounded ${mergeByHost ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-500 hover:border-signal/30 hover:text-signal/60'}`}
                            >
                                <Monitor size={12} />
                                {mergeByHost ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        {/* Group By */}
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-[11px]">GROUP_BY</span>
                            <div className="relative">
                                <select
                                    value={groupBy}
                                    onChange={e => setGroupBy(e.target.value)}
                                    className="w-full bg-black border border-signal/30 text-signal text-xs font-mono px-2 py-1.5 rounded appearance-none pr-6 focus:outline-none focus:border-signal/60"
                                >
                                    {['None','host','user','ip','domain','os','process_name'].map(v => (
                                        <option key={v} value={v}>{v.toUpperCase()}</option>
                                    ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-signal/60 pointer-events-none" />
                            </div>
                        </div>

                        {/* Node Labels */}
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-400 text-[11px]">NODE_LABELS</span>
                            <div className="flex flex-wrap gap-1">
                                {['host','ip','display_id','user','domain','os','pid','description','architecture'].map(lbl => {
                                    const active = nodeLabels.includes(lbl);
                                    return (
                                        <button
                                            key={lbl}
                                            onClick={() => setNodeLabels(prev => active ? prev.filter(x => x !== lbl) : [...prev, lbl])}
                                            className={`flex items-center gap-1 px-2 py-1 border rounded text-[10px] ${active ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-600 hover:border-signal/30 hover:text-signal/50'}`}
                                        >
                                            {active ? <CheckSquare size={10} /> : <Square size={10} />}
                                            {lbl}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Download */}
                        <div className="border-t border-signal/10 pt-2 flex flex-col gap-1">
                            <button
                                onClick={handleDownloadPNG}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black border border-white/10 text-gray-400 hover:border-signal/40 hover:text-signal rounded text-[11px] font-mono transition-colors"
                            >
                                <Camera size={12} /> DOWNLOAD PNG
                            </button>
                            <button
                                onClick={handleDownloadSVG}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-400 rounded text-[11px] font-mono transition-colors"
                            >
                                <FileImage size={12} /> DOWNLOAD SVG
                            </button>
                        </div>
                    </div>
                )}
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

            {graphViewMode === 'CALLBACKS' && (
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
                    style: { stroke: '#ffffff', strokeWidth: 2, opacity: 0.95, zIndex: 200 },
                    animated: false
                }}
                defaultViewport={viewportRef.current}
                onMoveEnd={(_, viewport) => { viewportRef.current = viewport; }}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                onEdgeContextMenu={onEdgeContextMenu}
                onPaneContextMenu={onPaneContextMenu}
                onPaneClick={onPaneClick}
                onNodeDragStop={onNodeDragStop}
                fitView
                fitViewOptions={{ padding: 0.5, minZoom: 0.1, maxZoom: 1 }}
                className="bg-transparent"
                minZoom={0.1}
                maxZoom={4}
                zoomOnScroll={true}
                panOnScroll={true}
                zoomOnDoubleClick={false}
            >
                <Background color="#333" gap={20} className="opacity-20" />
            </ReactFlow>
            )}

            {graphViewMode === 'BROWSERSCRIPTS' && (
            <div ref={bsContainerRef} className="absolute inset-0">

            {/* Large graph guard — ≥50 nodes hidden by default */}
            {bsElkData.nodes.length >= 50 && !bsShowLargeGraph ? (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="border border-yellow-500/40 bg-black/90 px-8 py-6 text-center font-mono">
                        <div className="text-yellow-400 text-sm mb-1">LARGE_GRAPH_DETECTED</div>
                        <div className="text-gray-500 text-xs mb-4">{bsElkData.nodes.length} nodes · {bsElkData.edges.length} edges</div>
                        <button
                            onClick={() => setBsShowLargeGraph(true)}
                            className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 text-xs hover:bg-cyan-500/30 transition-colors">
                            SHOW_GRAPH
                        </button>
                    </div>
                </div>
            ) : (
            <ReactFlow
                nodes={bsFinalDisplayData.nodes}
                edges={bsFinalDisplayData.edges}
                nodeTypes={nodeTypes}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ padding: 0.4, minZoom: 0.05, maxZoom: 2 }}
                className="bg-transparent"
                minZoom={0.05}
                maxZoom={4}
                zoomOnScroll={true}
                panOnScroll={true}
                zoomOnDoubleClick={false}
                onNodeClick={onBsNodeClick}
                onNodeDoubleClick={(_e, node) => {
                    if (node.id.startsWith('cb-')) {
                        navigate(`/console/${(node.data as any).displayId}`);
                    }
                }}
                onNodeContextMenu={onBsNodeContextMenu}
                onEdgeContextMenu={onBsEdgeContextMenu}
                onPaneContextMenu={onBsPaneContextMenu}
                onPaneClick={() => {
                    setBsContextMenu(null);
                    setBsEdgeCtxMenu(null);
                    setBsPaneCtxMenu(null);
                    setBsSelectedNodeIds(new Set());
                }}
            >
                <Background color="#111" gap={20} className="opacity-30" />
                {bsFinalDisplayData.nodes.filter((n: any) => n.type !== 'groupBound').length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-gray-600 text-sm font-mono border border-gray-800 px-6 py-4 bg-black/60">
                            {bsHiddenNodeIds.size > 0 ? 'ALL_NODES_HIDDEN' : 'NO_BROWSERSCRIPTS_LOADED'}
                        </div>
                    </div>
                )}
            </ReactFlow>
            )}

            {/* BS Floating Controls Toolbar */}
            <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-auto">
                <button
                    onClick={handleBsDownloadSvg}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded transition-colors"
                    title="Export SVG">
                    <FileImage size={11} /> SVG
                </button>
                <button
                    onClick={() => setBsLayoutDir(d => d === 'LR' ? 'TB' : 'LR')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded transition-colors"
                    title={bsLayoutDir === 'LR' ? 'Switch to Top-Bottom' : 'Switch to Left-Right'}>
                    {bsLayoutDir === 'LR' ? <ArrowUpDown size={11} /> : <ArrowLeftRight size={11} />}
                    {bsLayoutDir === 'LR' ? 'TB' : 'LR'}
                </button>
                {bsHiddenNodeIds.size > 0 && (
                    <button
                        onClick={() => setBsHiddenNodeIds(new Set())}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded transition-colors"
                        title="Revert all hidden">
                        <Eye size={11} /> REVERT
                    </button>
                )}
                <div className="relative">
                    <select
                        value={bsGroupBy}
                        onChange={e => setBsGroupBy(e.target.value)}
                        className="w-full bg-black/90 border border-cyan-500/30 text-cyan-400 text-xs font-mono px-2 py-1.5 rounded appearance-none pr-5 focus:outline-none focus:border-cyan-500/60"
                        title="Group by field">
                        {['None','host','user','ip','domain','os'].map(v => (
                            <option key={v} value={v}>{v === 'None' ? 'GROUP_BY' : v.toUpperCase()}</option>
                        ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-cyan-400/60 pointer-events-none" />
                </div>
            </div>

            {/* Node context menu */}
            {bsContextMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: bsContextMenu.y, left: bsContextMenu.x, zIndex: 9999 }}
                    className="bg-[#0a0a0a] border border-cyan-500/30 rounded shadow-lg py-1 min-w-[180px]"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Resolve node data & callback info */}
                    {(() => {
                        const nd = bsFinalDisplayData.nodes.find((n: any) => n.id === bsContextMenu.nodeId)?.data;
                        const isCbNode = bsContextMenu.nodeId.startsWith('cb-');
                        const cbIntId = isCbNode ? parseInt(bsContextMenu.nodeId.replace('cb-', ''), 10) : null;
                        const cbInfo = (isCbNode && cbIntId != null)
                            ? { callback_id: cbIntId, display_id: nd?.displayId, host: nd?.host || '' }
                            : null;
                        return (
                            <>
                                {/* Header */}
                                {nd && (
                                    <div className="px-3 py-1.5 border-b border-cyan-500/10 mb-0.5">
                                        <div className="text-[10px] font-mono text-cyan-500/50">
                                            {isCbNode ? `CALLBACK #${nd.displayId}` : nd.name || nd.label || 'SCRIPT'}
                                        </div>
                                        {isCbNode && nd.host && <div className="text-[10px] font-mono text-gray-600">{nd.host}</div>}
                                    </div>
                                )}
                                {/* data.buttons[] — dynamic action buttons */}
                                {nd?.buttons?.map((btn: any, i: number) => {
                                    if (btn.type === 'interact') return (
                                        <button key={i}
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                            onClick={() => { navigate(`/console/${btn.displayId}`); setBsContextMenu(null); }}>
                                            <Terminal size={11} /> {btn.label || 'Interact'}
                                        </button>
                                    );
                                    return null;
                                })}
                                {/* Hide / Show controls */}
                                <div className="h-px bg-white/10 my-0.5" />
                                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                    onClick={() => {
                                        setBsHiddenNodeIds(prev => { const s = new Set(prev); s.add(bsContextMenu.nodeId); return s; });
                                        setBsContextMenu(null);
                                    }}>
                                    <EyeOff size={11} /> Hide Node
                                </button>
                                {bsSelectedNodeIds.size > 0 && (
                                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                        onClick={() => {
                                            const toHide = new Set<string>(
                                                bsVisibleGraphData.nodes
                                                    .filter((n: any) => !bsSelectedNodeIds.has(n.id))
                                                    .map((n: any) => n.id)
                                            );
                                            setBsHiddenNodeIds(prev => new Set([...prev, ...toHide]));
                                            setBsSelectedNodeIds(new Set());
                                            setBsContextMenu(null);
                                        }}>
                                        <Eye size={11} /> Show Only Selected
                                    </button>
                                )}
                                {bsHiddenNodeIds.size > 0 && (
                                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                                        onClick={() => { setBsHiddenNodeIds(new Set()); setBsContextMenu(null); }}>
                                        <Eye size={11} /> Revert Hidden
                                    </button>
                                )}
                                {/* Edge operations — only for callback nodes (cb-*) */}
                                {cbInfo && (
                                    <>
                                        <div className="h-px bg-white/10 my-0.5" />
                                        {/* Remove Edge */}
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-orange-400 hover:bg-orange-900/20 hover:text-orange-300 flex items-center gap-2"
                                            onClick={() => {
                                                handleOpenRemoveEdge(cbInfo);
                                                setBsContextMenu(null);
                                            }}>
                                            <Trash2 size={11} /> Remove Edge
                                        </button>
                                        {/* Add P2P Edge */}
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-cyan-400 hover:bg-cyan-900/20 hover:text-cyan-300 flex items-center gap-2"
                                            onClick={() => {
                                                setManuallyAddEdgeModal(cbInfo);
                                                setAddEdgeSelectedProfile(null);
                                                setAddEdgeSelectedDest(null);
                                                setAddEdgeDestOptions([]);
                                                setBsContextMenu(null);
                                            }}>
                                            <Plus size={11} /> Add P2P Edge
                                        </button>
                                        {/* Task for Edge (Link) */}
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-blue-400 hover:bg-blue-900/20 hover:text-blue-300 flex items-center gap-2"
                                            onClick={() => {
                                                setTaskForEdgeModal(cbInfo);
                                                getLinkCommands({ variables: { callback_id: cbInfo.callback_id } });
                                                setBsContextMenu(null);
                                            }}>
                                            <Link2 size={11} /> Task for Edge
                                        </button>
                                    </>
                                )}
                                {/* Cancel */}
                                <div className="h-px bg-white/10 my-0.5" />
                                <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-500 hover:bg-white/5 hover:text-gray-400 flex items-center gap-2"
                                    onClick={() => setBsContextMenu(null)}>
                                    <X size={11} /> Cancel
                                </button>
                            </>
                        );
                    })()}
                </div>,
                document.body
            )}

            {/* Edge context menu */}
            {bsEdgeCtxMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: bsEdgeCtxMenu.y, left: bsEdgeCtxMenu.x, zIndex: 9999 }}
                    className="bg-[#0a0a0a] border border-cyan-500/30 rounded shadow-lg py-1 min-w-[160px]"
                >
                    {/* data.buttons[] — dynamic action buttons from edge data */}
                    {(() => {
                        const ed = bsFinalDisplayData.edges.find((e: any) => e.id === bsEdgeCtxMenu.edgeId);
                        if (ed?.data?.commandName) return (
                            <div className="px-3 py-1 text-[10px] font-mono text-cyan-500/60 border-b border-cyan-500/10 mb-0.5">
                                CMD: {ed.data.commandName}
                            </div>
                        );
                        return null;
                    })()}
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                        onClick={() => {
                            setBsHiddenNodeIds(prev => {
                                const edge = bsVisibleGraphData.edges.find((e: any) => e.id === bsEdgeCtxMenu.edgeId);
                                if (!edge) return prev;
                                const s = new Set(prev);
                                s.add(edge.source); s.add(edge.target);
                                return s;
                            });
                            setBsEdgeCtxMenu(null);
                        }}>
                        <EyeOff size={11} /> Hide Edge Nodes
                    </button>
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-gray-400 flex items-center gap-2"
                        onClick={() => setBsEdgeCtxMenu(null)}>
                        <X size={11} /> Cancel
                    </button>
                </div>,
                document.body
            )}

            {/* Pane context menu (right-click empty space) */}
            {bsPaneCtxMenu && createPortal(
                <div
                    style={{ position: 'fixed', top: bsPaneCtxMenu.y, left: bsPaneCtxMenu.x, zIndex: 9999 }}
                    className="bg-[#0a0a0a] border border-cyan-500/30 rounded shadow-lg py-1 min-w-[160px]"
                >
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                        onClick={() => { setBsSelectedNodeIds(new Set()); setBsPaneCtxMenu(null); }}>
                        <CheckSquare size={11} /> Unselect All
                    </button>
                    {bsHiddenNodeIds.size > 0 && (
                        <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2"
                            onClick={() => { setBsHiddenNodeIds(new Set()); setBsPaneCtxMenu(null); }}>
                            <Eye size={11} /> Revert All Hidden
                        </button>
                    )}
                    <button className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:bg-cyan-500/10 hover:text-gray-400 flex items-center gap-2"
                        onClick={() => setBsPaneCtxMenu(null)}>
                        <X size={11} /> Cancel
                    </button>
                </div>,
                document.body
            )}
            </div>
            )}
            
            {/* Status Overlay */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-mono text-signal bg-black/60 px-3 py-1 border border-signal/20 backdrop-blur-sm shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                    <div className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
                    {graphViewMode === 'BROWSERSCRIPTS' ? 'BROWSERSCRIPT_VIEW_ACTIVE' : 'NETWORK_TOPOLOGY_ACTIVE'}
                </div>
                {customNodes.length > 0 && graphViewMode === 'CALLBACKS' && (

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

                                {/* Link Focus */}
                                {linkFocusNodeId === String(contextMenu.callback.id) ? (
                                    <button
                                        onClick={() => { handleClearLinkFocus(); setContextMenu(null); }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/30 text-xs text-left text-amber-400 hover:text-amber-300 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-400" />
                                        <span>Clear Link Focus</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            handleSetLinkFocus(String(contextMenu.callback.id), contextMenu.callback.host || contextMenu.callback.description || `Node ${contextMenu.callback.display_id}`);
                                            setContextMenu(null);
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/20 text-xs text-left text-amber-500/80 hover:text-amber-400 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-500/80" />
                                        <span>Set as Link Focus</span>
                                    </button>
                                )}

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
                                {/* Interact */}
                                <button
                                    onClick={() => { navigate(`/console/${contextMenu.callback.display_id}`); setContextMenu(null); }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-signal hover:text-white transition-colors group font-semibold"
                                >
                                    <Terminal size={14} className="text-signal" />
                                    <span>Interact (Console)</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

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

                                {/* Link Focus */}
                                {linkFocusNodeId === String(contextMenu.callback.id) ? (
                                    <button
                                        onClick={() => { handleClearLinkFocus(); setContextMenu(null); }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/30 text-xs text-left text-amber-400 hover:text-amber-300 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-400" />
                                        <span>Clear Link Focus</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            handleSetLinkFocus(String(contextMenu.callback.id), contextMenu.callback.host || `#${contextMenu.callback.display_id}`);
                                            setContextMenu(null);
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-amber-900/20 text-xs text-left text-amber-500/80 hover:text-amber-400 transition-colors group"
                                    >
                                        <Crosshair size={14} className="text-amber-500/80" />
                                        <span>Set as Link Focus</span>
                                    </button>
                                )}

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

                                <div className="h-px bg-white/10 my-1" />

                                {/* Task for Edge (Link) */}
                                <button
                                    onClick={() => {
                                        setTaskForEdgeModal(contextMenu.callback);
                                        getLinkCommands({ variables: { callback_id: contextMenu.callback.callback_id } });
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-900/30 text-xs text-left text-blue-400 hover:text-blue-300 transition-colors group"
                                >
                                    <Link2 size={14} className="text-blue-400" />
                                    <span>Task for Edge</span>
                                </button>

                                {/* Remove Edge */}
                                <button
                                    onClick={() => handleOpenRemoveEdge(contextMenu.callback)}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors group"
                                >
                                    <Trash2 size={14} className="text-orange-500" />
                                    <span>Remove Edge</span>
                                </button>

                                {/* Add P2P Edge */}
                                <button
                                    onClick={() => {
                                        setManuallyAddEdgeModal(contextMenu.callback);
                                        setAddEdgeSelectedProfile(null);
                                        setAddEdgeSelectedDest(null);
                                        setAddEdgeDestOptions([]);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-cyan-900/30 text-xs text-left text-cyan-400 hover:text-cyan-300 transition-colors group"
                                >
                                    <Plus size={14} className="text-cyan-500" />
                                    <span>Add P2P Edge</span>
                                </button>

                                <div className="h-px bg-white/10 my-1" />

                                {/* Trigger Eventing */}
                                <button
                                    onClick={() => {
                                        setShowEventingDialog(contextMenu.callback);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-purple-900/30 text-xs text-left text-purple-400 hover:text-purple-300 transition-colors group"
                                >
                                    <Zap size={14} className="text-purple-400" />
                                    <span>Trigger Eventing</span>
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>,
                document.body
            )}

            {/* Edge Context Menu */}
            {edgeContextMenu && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="fixed z-[9999] bg-black/95 border border-white/20 w-44 backdrop-blur-xl rounded shadow-2xl overflow-hidden"
                    style={{ top: edgeContextMenu.y, left: edgeContextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-1">
                        {/* Remove DB edge */}
                        {edgeContextMenu.edge.id?.startsWith('e') && !edgeContextMenu.edge.id?.startsWith('edge-') && (() => {
                            const parts = edgeContextMenu.edge.id.replace(/^e/, '').split('-');
                            const destId = Number(parts[0]);
                            const srcId = Number(parts[1]);
                            const dbEdge = edgesData?.callbackgraphedge?.find((e: any) =>
                                !e.end_timestamp && e.destination?.id === destId && e.source?.id === srcId
                            );
                            if (!dbEdge) return null;
                            return (
                                <button
                                    key="remove"
                                    onClick={async () => {
                                        try {
                                            await removeEdge({ variables: { edge_id: dbEdge.id } });
                                            snackActions.success('Edge removed');
                                        } catch (err: any) {
                                            snackActions.error('Failed: ' + err.message);
                                        }
                                        setEdgeContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-orange-900/30 text-xs text-left text-orange-400 hover:text-orange-300 transition-colors w-full rounded"
                                >
                                    <Trash2 size={13} className="text-orange-500" />
                                    <span>Remove Edge</span>
                                </button>
                            );
                        })()}
                        <button
                            onClick={() => {
                                setEdges(eds => eds.filter(e => e.id !== edgeContextMenu.edge.id));
                                setEdgeContextMenu(null);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors w-full rounded"
                        >
                            <EyeOff size={13} className="text-gray-500" />
                            <span>Hide Edge (local)</span>
                        </button>
                    </div>
                </motion.div>,
                document.body
            )}

            {/* Pane Context Menu */}
            {paneContextMenu && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="fixed z-[9999] bg-black/95 border border-white/20 w-44 backdrop-blur-xl rounded shadow-2xl overflow-hidden"
                    style={{ top: paneContextMenu.y, left: paneContextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-1">
                        <button
                            onClick={() => {
                                setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isDimmed: false } })));
                                setPaneContextMenu(null);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-signal/10 text-xs text-left text-gray-300 hover:text-signal transition-colors w-full rounded"
                        >
                            <Eye size={13} className="text-gray-500" />
                            <span>Unselect All</span>
                        </button>

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
                                    <span className="text-[11px] text-gray-600">({customNodes.length} nodes, {customEdges.length} edges)</span>
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
                                                                <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1 py-0.5 rounded border border-cyan-500/30">CUSTOM</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-gray-600 flex items-center gap-2">
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
                                                    <span className="text-[11px] uppercase text-gray-600 border border-gray-700 px-1.5 py-0.5">
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
                                                    <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
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
                                                            <span className="text-[11px] text-green-500 border border-green-800 px-1">RUNNING</span>
                                                        ) : (
                                                            <span className="text-[11px] text-red-500 border border-red-800 px-1">STOPPED</span>
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
                                        <span className={`text-[11px] px-1.5 py-0.5 border ${
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

            {/* Task for Edge Modal */}
            <AnimatePresence>
                {taskForEdgeModal && (
                    <CyberModal
                        title="TASK_FOR_EDGE"
                        onClose={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }}
                        icon={<Link2 />}
                    >
                        <div className="space-y-4 min-w-[380px]">
                            <div className="text-xs text-gray-400 font-mono">
                                Callback #{taskForEdgeModal.display_id} — {taskForEdgeModal.host}
                            </div>

                            {linkCommandsLoading && (
                                <div className="text-signal text-xs font-mono animate-pulse">LOADING_COMMANDS...</div>
                            )}

                            {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) === 0 && (
                                <div className="text-gray-500 text-xs font-mono">No link commands loaded on this callback.</div>
                            )}

                            {!linkCommandsLoading && (linkCommandsData?.loadedcommands?.length ?? 0) > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-gray-400">SELECT_COMMAND</div>
                                    {linkCommandsData!.loadedcommands.map((lc: any) => (
                                        <button
                                            key={lc.command.id}
                                            onClick={() => { setTaskForEdgeCommand(lc.command); setTaskForEdgeParams(''); }}
                                            className={`w-full flex items-center gap-2 px-3 py-2 border rounded text-xs font-mono text-left transition-colors ${taskForEdgeCommand?.id === lc.command.id ? 'bg-signal/20 border-signal/60 text-signal' : 'bg-black border-white/10 text-gray-400 hover:border-signal/40 hover:text-signal/70'}`}
                                        >
                                            <Zap size={12} />
                                            <span className="font-bold">{lc.command.cmd}</span>
                                            {lc.command.description && <span className="text-gray-600 truncate">— {lc.command.description}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {taskForEdgeCommand && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-mono text-gray-400">PARAMS (JSON or raw)</label>
                                    <textarea
                                        value={taskForEdgeParams}
                                        onChange={e => setTaskForEdgeParams(e.target.value)}
                                        rows={3}
                                        placeholder='{}'
                                        className="w-full bg-black/50 border border-gray-700 p-2 text-signal focus:border-signal outline-none font-mono text-xs resize-none"
                                    />
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => { setTaskForEdgeModal(null); setTaskForEdgeCommand(null); setTaskForEdgeParams(''); }}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm"
                                >
                                    CANCEL
                                </button>
                                <button
                                    disabled={!taskForEdgeCommand || taskingForEdge}
                                    onClick={async () => {
                                        if (!taskForEdgeCommand) return;
                                        setTaskingForEdge(true);
                                        try {
                                            await createTask({
                                                variables: {
                                                    callback_id: taskForEdgeModal.callback_id,
                                                    command: taskForEdgeCommand.cmd,
                                                    params: taskForEdgeParams || '{}',
                                                    token_id: 0
                                                }
                                            });
                                            snackActions.success(`Tasked: ${taskForEdgeCommand.cmd}`);
                                            setTaskForEdgeModal(null);
                                            setTaskForEdgeCommand(null);
                                            setTaskForEdgeParams('');
                                        } catch (e: any) {
                                            snackActions.error('Task failed: ' + e.message);
                                        } finally {
                                            setTaskingForEdge(false);
                                        }
                                    }}
                                    className="px-6 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {taskingForEdge ? 'TASKING...' : 'TASK'}
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>

            {/* Eventing Dialog */}
            {showEventingDialog && (
                <MythicDialog
                    fullWidth={true}
                    maxWidth="xl"
                    open={!!showEventingDialog}
                    onClose={() => setShowEventingDialog(null)}
                    innerDialog={
                        <EventTriggerContextSelectDialog
                            onClose={() => setShowEventingDialog(null)}
                            triggerContext={{ name: 'callback_id', value: showEventingDialog.id }}
                        />
                    }
                />
            )}

            {/* Remove Edge Modal */}
            <AnimatePresence>
                {/* Manually Add P2P Edge Modal */}
                {manuallyAddEdgeModal && (
                    <CyberModal
                        title="ADD_P2P_EDGE"
                        onClose={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                        icon={<Plus />}
                    >
                        <div className="space-y-4 min-w-[380px]">
                            <p className="text-xs text-gray-400 font-mono">
                                Source: <span className="text-signal">#{manuallyAddEdgeModal.display_id ?? manuallyAddEdgeModal.callback_id}</span>
                                {manuallyAddEdgeModal.host && <span className="text-gray-500 ml-2">({manuallyAddEdgeModal.host})</span>}
                            </p>

                            {/* Profile selector */}
                            <div>
                                <label className="block text-xs font-mono text-gray-500 mb-2">P2P_PROFILE</label>
                                <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                    {p2pData?.c2profile?.map((profile: any) => (
                                        <button
                                            key={profile.id}
                                            onClick={() => {
                                                setAddEdgeSelectedProfile(profile);
                                                setAddEdgeSelectedDest(null);
                                                const srcId = manuallyAddEdgeModal.id ?? manuallyAddEdgeModal.callback_id;
                                                const dests = (profile.callbackc2profiles || [])
                                                    .map((cp: any) => cp.callback)
                                                    .filter((c: any) => c && c.id !== srcId);
                                                setAddEdgeDestOptions(dests);
                                            }}
                                            className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                addEdgeSelectedProfile?.id === profile.id
                                                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                            }`}
                                        >
                                            <GitBranch size={14} />
                                            <span>{profile.name}</span>
                                            <span className="ml-auto text-[11px] text-cyan-600 uppercase border border-cyan-800 px-1">P2P</span>
                                        </button>
                                    ))}
                                    {(!p2pData?.c2profile || p2pData.c2profile.length === 0) && (
                                        <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_P2P_PROFILES_AVAILABLE</div>
                                    )}
                                </div>
                            </div>

                            {/* Destination selector */}
                            {addEdgeSelectedProfile && (
                                <div>
                                    <label className="block text-xs font-mono text-gray-500 mb-2">DESTINATION_CALLBACK</label>
                                    <div className="grid gap-2 max-h-32 overflow-y-auto border border-gray-800 p-2 bg-black/30">
                                        {addEdgeDestOptions.map((cb: any) => (
                                            <button
                                                key={cb.id}
                                                onClick={() => setAddEdgeSelectedDest(cb)}
                                                className={`flex items-center gap-2 px-3 py-2 border text-left text-xs font-mono transition-colors ${
                                                    addEdgeSelectedDest?.id === cb.id
                                                        ? 'border-signal bg-signal/10 text-signal'
                                                        : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                }`}
                                            >
                                                <Monitor size={14} />
                                                <span>#{cb.display_id}</span>
                                                {cb.description && <span className="text-gray-500 ml-1 truncate max-w-[140px]">{cb.description}</span>}
                                            </button>
                                        ))}
                                        {addEdgeDestOptions.length === 0 && (
                                            <div className="text-gray-500 text-xs font-mono p-3 text-center">NO_CALLBACKS_WITH_PROFILE</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => { setManuallyAddEdgeModal(null); setAddEdgeSelectedProfile(null); setAddEdgeSelectedDest(null); setAddEdgeDestOptions([]); }}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-xs"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleManuallyAddEdge}
                                    disabled={!addEdgeSelectedProfile || !addEdgeSelectedDest}
                                    className="px-4 py-2 border border-signal/50 bg-signal/10 text-signal hover:bg-signal/20 hover:border-signal font-mono text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    CONFIRM_EDGE
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}

                {removeEdgeModal && (
                    <CyberModal
                        title="REMOVE_EDGE"
                        onClose={() => setRemoveEdgeModal(null)}
                        icon={<Trash2 />}
                    >
                        <div className="space-y-3 min-w-[340px]">
                            <p className="text-xs text-gray-400 font-mono mb-2">Select an active edge to remove:</p>
                            {removeEdgeModal.map((e: any) => (
                                <button
                                    key={e.id}
                                    onClick={async () => {
                                        try {
                                            await removeEdge({ variables: { edge_id: e.id } });
                                            snackActions.success('Edge removed');
                                        } catch (err: any) {
                                            snackActions.error('Failed: ' + err.message);
                                        }
                                        setRemoveEdgeModal(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-orange-500/40 rounded text-xs font-mono text-left text-gray-300 hover:text-orange-300 hover:bg-orange-900/20 transition-colors"
                                >
                                    <Trash2 size={12} className="text-orange-500 shrink-0" />
                                    <span>
                                        #{e.source?.display_id} → #{e.destination?.display_id}
                                        {e.c2profile?.name && <span className="text-gray-500 ml-2">[{e.c2profile.name}]</span>}
                                    </span>
                                </button>
                            ))}
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => setRemoveEdgeModal(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white font-mono text-sm"
                                >
                                    CANCEL
                                </button>
                            </div>
                        </div>
                    </CyberModal>
                )}
            </AnimatePresence>
        </div>
    );
}