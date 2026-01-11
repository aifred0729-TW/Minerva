import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Terminal, Shield, Server, Wifi, Check, Laptop, Cpu, Activity, Database, Layers, Box, Hexagon, AlertTriangle, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { loginUser } from '../lib/api';
import { successfulLogin } from '../../cache';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// -----------------------------------------------------------------------------
// TYPES & MOCK DATA
// -----------------------------------------------------------------------------

type ViewMode = 'INTRO' | 'LOGIN' | 'HANDSHAKE';
type CheckStatus = 'PENDING' | 'CHECKING' | 'OK' | 'FAIL';

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
}

const INITIAL_CHECKS: CheckItem[] = [
  { id: 'dns', label: 'RESOLVING_HOST', status: 'PENDING' },
  { id: 'handshake', label: 'TLS_HANDSHAKE', status: 'PENDING' },
  { id: 'auth', label: 'VERIFYING_CREDENTIALS', status: 'PENDING' },
  { id: 'integrity', label: 'INTEGRITY_CHECK', status: 'PENDING' },
  { id: 'session', label: 'ESTABLISHING_SESSION', status: 'PENDING' },
];

const MOCK_LOGS = [
  "INIT_SEQUENCE_STARTED...",
  "LOADING_MODULES... [OK]",
  "ESTABLISHING_SECURE_LINK... [OK]",
  "CHECKING_INTEGRITY... [VERIFIED]",
  "WAITING_FOR_OPERATOR_AUTH..."
];

const DASHBOARD_PRELOAD_DATA = [
    { icon: <Activity size={14} />, text: "SYNCING_CALLBACKS..." },
    { icon: <Box size={14} />, text: "LOADING_PAYLOADS..." },
    { icon: <Layers size={14} />, text: "FETCHING_OPERATIONS..." },
    { icon: <Database size={14} />, text: "UPDATING_ARTIFACTS..." },
];

// -----------------------------------------------------------------------------
// COMPONENT
// -----------------------------------------------------------------------------

const IntroSequence = ({ onComplete }: { onComplete: () => void }) => {
    // Loading progress state
    const [loadingPercent, setLoadingPercent] = useState(0);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);

    // Terminal data pool - rapid scrolling simulation
    const terminalDataPool = [
        "INIT: Loading kernel modules...",
        "0x00000000: BIOS_ROM_CHECK ................ OK",
        "0x00010000: MEM_ALLOCATION 4096KB ......... OK", 
        "SCAN: Searching targets 0x00000000 to 0x77FFFFFF",
        "0x00180808: DEVICE_ENUM ................... OK",
        "0x00240000: NET_INTERFACE eth0 ............ UP",
        "0x00340000: CRYPTO_MODULE AES-256 ......... READY",
        "LINK: Establishing secure tunnel...",
        "0x00400000: TLS_HANDSHAKE v1.3 ............ OK",
        "0x00480000: CERT_VERIFY SHA256 ............ PASS",
        "0x00500000: KEY_EXCHANGE ECDHE ............ OK",
        "PROF: Loading user profile...",
        "0x00600000: AUTH_MODULE ................... READY",
        "0x00700000: SESSION_TOKEN ................. GEN",
        "0x00800000: BIOMETRIC_SCAN ................ INIT",
        "0x00900000: NEURAL_LINK ................... SYNC",
        "0x00A00000: IMPLANT_CHECK ................. OK",
        "0x00B00000: CYBERWARE_DIAG ................ PASS",
        "DATA: Synchronizing remote assets...",
        "0x00C00000: CACHE_PRELOAD 2048KB .......... OK",
        "0x00D00000: BUFFER_INIT ................... OK",
        "0x00E00000: STREAM_READY .................. OK",
        "SYS: Finalizing boot sequence...",
        "0x00F00000: WATCHDOG_TIMER ................ SET",
        "0x01000000: INTERRUPT_VECTOR .............. OK",
        "BOOT: All systems nominal. Ready."
    ];

    useEffect(() => {
        // Loading bar animation - smooth progress to 100%
        const loadInterval = setInterval(() => {
            setLoadingPercent(prev => {
                if (prev >= 100) {
                    clearInterval(loadInterval);
                    return 100;
                }
                const increment = prev < 50 ? 3 : prev < 80 ? 2 : 1;
                return Math.min(prev + increment, 100);
            });
        }, 40);

        // Rapid terminal line feed - like real terminal scrolling
        let lineIndex = 0;
        const terminalInterval = setInterval(() => {
            if (lineIndex < terminalDataPool.length) {
                setTerminalLines(prev => {
                    const newLines = [...prev, terminalDataPool[lineIndex]];
                    // Keep only last 4 lines visible (scroll effect)
                    return newLines.slice(-4);
                });
                lineIndex++;
            }
        }, 80); // Fast - new line every 80ms

        // Complete after animation
        const completeTimer = setTimeout(onComplete, 3000);

        return () => {
            clearInterval(loadInterval);
            clearInterval(terminalInterval);
            clearTimeout(completeTimer);
        };
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black text-white font-mono flex flex-col overflow-hidden">
            
            {/* Main Content - Centered */}
            <div className="flex-1 flex flex-col items-center justify-center px-8">
                
                {/* Warning Icon - Hard Sci-Fi Angular Design */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-6"
                >
                    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-white">
                        {/* Outer Triangle - Sharp edges */}
                        <path 
                            d="M28 4 L52 48 L4 48 Z" 
                            stroke="currentColor" 
                            strokeWidth="1.5" 
                            fill="none"
                            strokeLinejoin="miter"
                        />
                        {/* Inner Triangle - Creates depth */}
                        <path 
                            d="M28 12 L46 44 L10 44 Z" 
                            stroke="currentColor" 
                            strokeWidth="0.5" 
                            fill="none"
                            strokeLinejoin="miter"
                            opacity="0.4"
                        />
                        {/* Exclamation - Angular style */}
                        <path 
                            d="M28 22 L28 34" 
                            stroke="currentColor" 
                            strokeWidth="2.5" 
                            strokeLinecap="square"
                        />
                        {/* Exclamation dot - Diamond shape */}
                        <path 
                            d="M28 38 L30 40 L28 42 L26 40 Z" 
                            fill="currentColor"
                        />
                    </svg>
                </motion.div>

                {/* ATTENTION Label */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-[10px] tracking-[0.4em] font-bold mb-8"
                >
                    ATTENTION
                </motion.div>

                {/* Main Container Box */}
                <motion.div 
                    initial={{ opacity: 0, scaleY: 0.8 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="w-full max-w-lg"
                >
                    {/* PERSONAL LINK CONNECTED Label */}
                    <div className="border border-white/60 inline-block px-3 py-1 text-[9px] tracking-wider font-bold mb-3">
                        PERSONAL LINK CONNECTED
                    </div>

                    {/* Terminal Output - Rapid Scrolling */}
                    <div className="text-[8px] text-gray-400 mb-4 h-16 overflow-hidden font-mono bg-black/50 border border-white/10 p-2">
                        {terminalLines.map((line, i) => (
                            <motion.div
                                key={`${i}-${line}`}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.05 }}
                                className="truncate leading-tight"
                            >
                                <span className="text-gray-600">&gt;</span> {line}
                            </motion.div>
                        ))}
                    </div>

                    {/* Loading Bar Container */}
                    <div className="border border-white flex items-stretch h-8 relative bg-black">
                        {/* Left Info Block */}
                        <div className="border-r border-white px-2 flex items-center gap-2 text-[8px] bg-black z-10">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                            <span className="text-gray-400">SYS:ACTIVE</span>
                        </div>

                        {/* Progress Bar Area */}
                        <div className="flex-1 relative overflow-hidden">
                            {/* White Fill */}
                            <motion.div 
                                className="absolute inset-0 bg-white origin-left"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: loadingPercent / 100 }}
                                transition={{ ease: "linear" }}
                            />
                            
                            {/* LOADING Text - Mix Blend */}
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference z-10">
                                <span className="text-xs font-bold tracking-[0.3em]">
                                    LOADING {loadingPercent}%
                                </span>
                            </div>
                        </div>

                        {/* Right Info Block */}
                        <div className="border-l border-white px-3 flex flex-col justify-center text-[8px] bg-black z-10 text-right">
                            <div>BUILD 92.4</div>
                            <div className="text-gray-500">REV 2.0</div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Footer */}
            <div className="p-6 w-full flex justify-between items-end text-[10px] font-bold tracking-widest uppercase">
                <div className="text-gray-500">RIPPERDOC SURGICAL SOFTWARE V2</div>
                <div className="text-white">BOOTING SEQUENCE</div>
                <div className="text-right text-gray-500">
                    <span>FIR SK 4.0 MFS</span>
                    <span className="ml-8">FLAIR TRS SMMP</span>
                </div>
            </div>
        </div>
    );
};

export default function Login() {
  const navigate = useNavigate();
  const { setAppState, appState, isLoggingOut, reset } = useAppStore();
  
  // 如果是登出狀態回來，初始設為 HANDSHAKE 以執行反向動畫
  const [viewMode, setViewMode] = useState<ViewMode>(isLoggingOut ? 'HANDSHAKE' : 'INTRO');
  
  // Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  
  // Handshake Animation State
  const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS);
  const [clientIp, setClientIp] = useState('127.0.0.1');
  const [handshakeStage, setHandshakeStage] = useState<'CONNECTING' | 'VERIFYING' | 'GRANTED' | 'FAILED'>('CONNECTING');
  const [visiblePackets, setVisiblePackets] = useState<number[]>([]);

  useEffect(() => {
    // 嘗試獲取真實 IP 或從 window location 獲取
    setClientIp(window.location.hostname || "127.0.0.1"); 
    
    // 如果是登出流程，執行反向動畫邏輯
    if (isLoggingOut) {
        setHandshakeStage('GRANTED'); // 從已連接狀態開始
        // 立即觸發反向動畫
        runLogoutSequence();
    } else {
        setAppState('LOGIN');
    }
  }, [isLoggingOut]);

  const runLogoutSequence = async () => {
      // Step 1: 撤銷授權狀態
      await new Promise(r => setTimeout(r, 500));
      setHandshakeStage('VERIFYING'); // 檢查清單消失/收起
      
      // Step 2: 斷開連線
      await new Promise(r => setTimeout(r, 800));
      setHandshakeStage('CONNECTING'); // 連線斷開
      
      // Step 3: 回到 Login Form
      await new Promise(r => setTimeout(r, 1500));
      setViewMode('LOGIN');
      reset(); // 重置 Store 狀態
  };

  // ---------------------------------------------------------------------------
  // LOGIC: Transition to Handshake & Run Checks
  // ---------------------------------------------------------------------------
  const startHandshake = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setViewMode('HANDSHAKE'); // Switch View
    setHandshakeStage('CONNECTING');
    setAppState('HANDSHAKE');

    // Step 1: Connecting Animation (Cable extending)
    await new Promise(r => setTimeout(r, 1000)); 
    
    // Step 2: Start Checks
    setHandshakeStage('VERIFYING');
    
    // Animate Dashboard Data Preloading
    const packetInterval = setInterval(() => {
        setVisiblePackets(prev => {
            if (prev.length < DASHBOARD_PRELOAD_DATA.length) {
                return [...prev, prev.length];
            }
            return prev;
        });
    }, 800);

    // Run Checks 1-2 (DNS, TLS)
    for (let i = 0; i < 2; i++) {
        setChecks(prev => prev.map((item, index) => index === i ? { ...item, status: 'CHECKING' } : item));
        await new Promise(r => setTimeout(r, 400));
        setChecks(prev => prev.map((item, index) => index === i ? { ...item, status: 'OK' } : item));
    }

    // Check 3: AUTHENTICATION (The Real API Call)
    setChecks(prev => prev.map((item, index) => index === 2 ? { ...item, status: 'CHECKING' } : item));
    
    try {
        const result = await loginUser(username, password);
        
        if (result && result.access_token) {
            // AUTH SUCCESS
            setChecks(prev => prev.map((item, index) => index === 2 ? { ...item, status: 'OK' } : item));
            
            // Run remaining checks
            for (let i = 3; i < INITIAL_CHECKS.length; i++) {
                setChecks(prev => prev.map((item, index) => index === i ? { ...item, status: 'CHECKING' } : item));
                await new Promise(r => setTimeout(r, 300));
                setChecks(prev => prev.map((item, index) => index === i ? { ...item, status: 'OK' } : item));
            }

            clearInterval(packetInterval);

            // Step 3: Access Granted
            setHandshakeStage('GRANTED');
            
            // Use Mythic's standard login handler to update global state
            try {
                successfulLogin(result);
            } catch (e) {
                console.error("Failed to update global state", e);
            }

            // Save Token (redundant if successfulLogin works, but safe fallback)
            localStorage.setItem('access_token', result.access_token);
            if(result.user_id) localStorage.setItem('user_id', String(result.user_id));

            setTimeout(() => {
                setAppState('DASHBOARD');
                navigate('/dashboard');
            }, 800);

        } else {
            // AUTH FAILED
            throw new Error("Invalid Credentials");
        }
    } catch (error) {
        clearInterval(packetInterval);
        setChecks(prev => prev.map((item, index) => index === 2 ? { ...item, status: 'FAIL' } : item));
        setHandshakeStage('FAILED');
        setLoginError("AUTHENTICATION FAILED: INVALID CREDENTIALS");
        
        // Return to login after delay
        setTimeout(() => {
            setViewMode('LOGIN');
            // Reset checks for next try
            setChecks(INITIAL_CHECKS);
        }, 2000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-void relative overflow-hidden text-signal font-mono">
        <AnimatePresence mode="wait">
            
            {/* ====================================================================
                VIEW 0: INTRO SEQUENCE
               ==================================================================== */}
            {viewMode === 'INTRO' && (
                <IntroSequence key="intro" onComplete={() => setViewMode('LOGIN')} />
            )}

            {/* ====================================================================
                VIEW 1: LOGIN (Traditional Layout)
               ==================================================================== */}
            {viewMode === 'LOGIN' && (
                <motion.div 
                    key="login-view"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                    transition={{ duration: 0.5 }}
                    className="flex w-full h-screen"
                >
                    {/* LEFT PANEL: Server Status (Static) */}
                    <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 border-r border-ghost/30 relative bg-void">
                         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>
                         <div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-3 h-3 bg-signal animate-pulse"></div>
                                <span className="font-mono text-signal tracking-[0.3em] text-sm">MYTHIC_SERVER_STATUS</span>
                            </div>
                            <h2 className="text-6xl font-bold text-gray-100 opacity-20 select-none tracking-tighter">MINERVA<br />SYSTEM</h2>
                        </div>

                        <div className="flex-1 flex flex-col justify-center gap-8">
                             <div className="grid grid-cols-2 gap-4">
                                <div className="border border-ghost/50 p-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 text-gray-400 group-hover:text-signal transition-colors"><Server size={20}/></div>
                                    <div className="text-gray-400 text-xs font-mono mb-1">CORE_UPTIME</div>
                                    <div className="text-2xl text-signal font-mono">99.98%</div>
                                    <div className="h-0.5 w-full bg-ghost/30 mt-3 overflow-hidden"><div className="h-full bg-signal w-[99%]"></div></div>
                                </div>
                                <div className="border border-ghost/50 p-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 text-gray-400 group-hover:text-signal transition-colors"><Cpu size={20}/></div>
                                    <div className="text-gray-400 text-xs font-mono mb-1">CPU_LOAD</div>
                                    <div className="text-2xl text-signal font-mono">12.4%</div>
                                    <div className="h-0.5 w-full bg-ghost/30 mt-3 overflow-hidden"><div className="h-full bg-signal w-[12%] animate-pulse"></div></div>
                                </div>
                                <div className="border border-ghost/50 p-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 text-gray-400 group-hover:text-signal transition-colors"><Wifi size={20}/></div>
                                    <div className="text-gray-400 text-xs font-mono mb-1">LATENCY</div>
                                    <div className="text-2xl text-signal font-mono">24ms</div>
                                </div>
                                 <div className="border border-ghost/50 p-4 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 text-gray-400 group-hover:text-signal transition-colors"><Shield size={20}/></div>
                                    <div className="text-gray-400 text-xs font-mono mb-1">ENCRYPTION</div>
                                    <div className="text-2xl text-signal font-mono">AES-256</div>
                                </div>
                            </div>
                            <div className="font-mono text-xs text-gray-400 space-y-1 pl-2 border-l border-ghost/30">
                                {MOCK_LOGS.map((log, i) => (
                                    <motion.div 
                                        key={i} 
                                        initial={{ opacity: 0, x: -10 }} 
                                        animate={{ opacity: 1, x: 0 }} 
                                        transition={{ delay: i * 0.1 + 0.5 }}
                                        className="text-gray-400"
                                    >
                                        {`> ${log}`}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                         <div className="font-mono text-[10px] text-gray-400 flex justify-between uppercase">
                            <span>Secure Connection</span><span>Port: 7443</span>
                        </div>
                    </div>

                    {/* RIGHT PANEL: Login Form */}
                    <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
                         <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }} className="w-full max-w-md">
                            <div className="mb-12">
                                <div className="inline-block p-3 border border-signal rounded-full mb-6"><Terminal size={32} className="text-signal" /></div>
                                <h1 className="text-4xl font-bold tracking-[0.2em] text-signal mb-2">IDENTIFY</h1>
                                <p className="text-gray-400 font-mono text-sm tracking-widest">PLEASE AUTHENTICATE</p>
                            </div>

                            {loginError && (
                                <div className="mb-6 p-3 border border-red-500 bg-red-500/10 text-red-500 text-xs font-mono">
                                    {`> ERROR: ${loginError}`}
                                </div>
                            )}

                            <form onSubmit={startHandshake} className="space-y-8">
                                <div className="space-y-6">
                                    <div className="relative group/input">
                                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full bg-transparent border-b border-ghost py-3 text-signal focus:border-signal focus:outline-none transition-colors font-mono tracking-wider pl-8 text-lg" placeholder="OPERATOR_ID" />
                                        <span className="absolute left-0 top-3 text-gray-400 group-focus-within/input:text-signal transition-colors">{'>'}</span>
                                    </div>
                                    <div className="relative group/input">
                                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-transparent border-b border-ghost py-3 text-signal focus:border-signal focus:outline-none transition-colors font-mono tracking-wider pl-8 text-lg" placeholder="PASSPHRASE" />
                                        <Lock size={16} className="absolute left-0 top-4 text-gray-400 group-focus-within/input:text-signal transition-colors" />
                                    </div>
                                </div>
                                <button type="submit" className="w-full bg-signal text-void font-bold py-4 hover:bg-void hover:text-signal border border-transparent hover:border-signal transition-all duration-300 font-mono tracking-widest relative overflow-hidden group/btn text-sm">
                                    <span className="relative z-10 flex items-center justify-center gap-2">INITIALIZE_SESSION</span>
                                    <div className="absolute inset-0 bg-white transform translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 z-0"></div>
                                </button>
                            </form>
                        </motion.div>
                    </div>
                </motion.div>
            )}


            {/* ====================================================================
                VIEW 2: HANDSHAKE (Connection Animation)
               ==================================================================== */}
            {viewMode === 'HANDSHAKE' && (
                 <motion.div 
                    key="handshake-view"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }} // Add explicit exit for fade out when switching back to Login
                    transition={{ duration: 1 }} 
                    className="flex w-full h-screen relative"
                >
                     {/* LEFT: Server Node */}
                     <div className="hidden lg:flex flex-col justify-center items-center w-1/2 relative z-10">
                        <motion.div 
                            // Manually animate Y position
                            animate={{ y: (handshakeStage === 'VERIFYING' || handshakeStage === 'GRANTED' || handshakeStage === 'FAILED') ? -60 : 0 }}
                            transition={{ duration: 0.8, ease: "easeInOut" }}
                            className="relative z-20 flex flex-col items-center gap-6"
                        >
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} className={cn("w-24 h-24 border rounded-full flex items-center justify-center bg-void relative transition-colors duration-500", handshakeStage === 'FAILED' ? "border-red-500" : "border-ghost/50")}>
                                <Server size={40} className={handshakeStage === 'FAILED' ? "text-red-500" : "text-signal"} />
                                {handshakeStage === 'VERIFYING' && (
                                    <motion.div animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 border border-signal rounded-full" />
                                )}
                            </motion.div>
                            <div className="text-center">
                                <h2 className="text-xl font-bold tracking-widest">MYTHIC_CORE</h2>
                                <p className={cn(
                                    "text-xs mt-1 transition-colors duration-300",
                                    isLoggingOut && handshakeStage === 'CONNECTING' ? "text-red-500 animate-pulse" : 
                                    handshakeStage === 'FAILED' ? "text-red-500" : "text-green-500"
                                )}>
                                    {isLoggingOut && handshakeStage === 'CONNECTING' ? 'STATUS: TERMINATING SESSION' : 
                                     handshakeStage === 'FAILED' ? 'STATUS: ACCESS DENIED' : 'STATUS: ONLINE'}
                                </p>
                            </div>
                            
                            {/* Absolute position check list to avoid pushing layout */}
                            <AnimatePresence>
                                {(handshakeStage === 'VERIFYING' || handshakeStage === 'GRANTED' || handshakeStage === 'FAILED') && !isLoggingOut && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 20 }} 
                                        animate={{ opacity: 1, y: 0 }} 
                                        exit={{ opacity: 0, y: 10 }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                        className="absolute top-full mt-8 w-64 space-y-3 bg-void/90 p-4 border border-ghost/30 backdrop-blur-md"
                                    >
                                        {checks.map((check) => (
                                            <div key={check.id} className="flex items-center justify-between text-xs">
                                                <span className={cn(
                                                    check.status === 'OK' ? "text-signal" : "text-gray-400",
                                                    check.status === 'CHECKING' && "animate-pulse text-signal",
                                                    check.status === 'FAIL' && "text-red-500 font-bold"
                                                )}>
                                                    {check.label}
                                                </span>
                                                {check.status === 'CHECKING' && <Activity size={12} className="animate-spin text-signal"/>}
                                                {check.status === 'OK' && <Check size={12} className="text-green-500"/>}
                                                {check.status === 'FAIL' && <span className="text-red-500">FAILED</span>}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>

                    {/* CONNECTION LINE & FLOATING DATA */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[2px] z-0 pointer-events-none hidden lg:block">
                        <div className="w-full h-full bg-ghost/20"></div>
                        <motion.div 
                            initial={{ width: 0, right: 0, left: "auto" }} // Start from right (Client side)
                            animate={{ 
                                width: (handshakeStage === 'GRANTED' && !isLoggingOut) ? 0 : 
                                       (handshakeStage === 'CONNECTING' && isLoggingOut) ? 0 : // Shrink on logout
                                       (handshakeStage === 'FAILED') ? "50%" : // Break line on fail
                                       "100%", 
                                right: 0, 
                                left: "auto", 
                                opacity: (handshakeStage === 'GRANTED' && !isLoggingOut) ? 0 : 
                                         (handshakeStage === 'FAILED') ? 0.5 : 1 
                            }}
                            transition={{ duration: 1.5, ease: "easeInOut" }}
                            className={cn("absolute top-0 h-full shadow-[0_0_10px_rgba(255,255,255,0.8)]", handshakeStage === 'FAILED' ? "bg-red-500" : "bg-signal")}
                        />
                        
                        {/* Floating Data Packets */}
                        <AnimatePresence>
                            {handshakeStage === 'VERIFYING' && visiblePackets.map((idx) => {
                                const data = DASHBOARD_PRELOAD_DATA[idx] || DASHBOARD_PRELOAD_DATA[0]; // Fallback to avoid crash
                                const randomY = (idx % 2 === 0 ? -40 : 40) + (Math.random() * 20 - 10);
                                return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: "100%", y: randomY }} // Start at right (Client)
                                        animate={{ opacity: [0, 1, 1, 0], x: "0%" }} // Move to left (Server)
                                        transition={{ duration: 2, ease: "linear" }}
                                        className="absolute top-0 right-0 flex items-center gap-2 text-[10px] text-signal font-mono bg-void/80 px-2 py-1 border border-ghost/50 whitespace-nowrap"
                                        style={{ top: "50%", marginTop: -15 }} // Center vertically relative to line
                                    >
                                        {data.icon}
                                        {data.text}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>

                    {/* RIGHT: Client Node */}
                    <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 relative z-10">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} className="w-24 h-24 border border-ghost/50 rounded-full flex items-center justify-center bg-void mb-6">
                            <Laptop size={40} className="text-signal" />
                        </motion.div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold tracking-widest">OPERATOR_NODE</h2>
                            <div className="text-xs text-gray-400 mt-2 space-y-1">
                                <p>IP: {clientIp}</p>
                                <p>USER: {username.toUpperCase() || 'UNKNOWN'}</p>
                            </div>
                        </div>
                        <div className="mt-12 font-mono text-sm text-signal animate-pulse">
                            {handshakeStage === 'CONNECTING' && !isLoggingOut && 'ESTABLISHING UP-LINK...'}
                            {handshakeStage === 'CONNECTING' && isLoggingOut && 'TERMINATING SESSION...'}
                            {handshakeStage === 'VERIFYING' && 'PERFORMING SECURITY CHECKS...'}
                            {handshakeStage === 'GRANTED' && !isLoggingOut && 'ACCESS GRANTED'}
                            {handshakeStage === 'FAILED' && <span className="text-red-500">ACCESS DENIED</span>}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
}
