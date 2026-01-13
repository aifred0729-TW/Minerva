import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@apollo/client';
import { GET_PAYLOAD_TYPES } from './queries';
import { ChevronRight, Disc, Check, Monitor, Command, Terminal, Smartphone, Server, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { PayloadsList } from './PayloadsList';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from '../../components/Sidebar';
import { useAppStore } from '../../store';
import { Step2Configuration } from './Step2Configuration';
import { Step3Commands } from './Step3Commands';
import { Step4C2Profiles } from './Step4C2Profiles';
import { Step5Build } from './Step5Build';

const STEPS = [
    'TARGET_SYSTEM',
    'CONFIGURATION',
    'COMMAND_SELECTION',
    'C2_CHANNELS',
    'COMPILATION'
];

const getOSIcon = (os: string) => {
    const lower = os.toLowerCase();
    if (lower.includes('windows')) return <Monitor size={24} />;
    if (lower.includes('mac') || lower.includes('darwin')) return <Command size={24} />;
    if (lower.includes('linux')) return <Terminal size={24} />;
    if (lower.includes('android') || lower.includes('ios')) return <Smartphone size={24} />;
    if (lower.includes('chrome')) return <Globe size={24} />;
    return <Server size={24} />;
};

const getOSInfo = (os: string) => {
    const lower = os.toLowerCase();
    if (lower.includes('windows')) return "Microsoft Windows based operating systems.";
    if (lower.includes('mac') || lower.includes('darwin')) return "Apple macOS desktop environment.";
    if (lower.includes('linux')) return "Linux kernel based systems and distributions.";
    if (lower.includes('android')) return "Mobile operating system based on Linux kernel.";
    if (lower.includes('chrome')) return "Web-based operating system by Google.";
    return "Unknown or generic operating system environment.";
};

// Simplified animation variants for better performance
const pageVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.1 } }
};

const PayloadCreationWizard = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [config, setConfig] = useState<{
        os: string;
        payloadType: string;
        buildParameters: any[];
        commands: string[];
        c2Profiles: any[];
    }>({
        os: '',
        payloadType: '',
        buildParameters: [],
        commands: [],
        c2Profiles: []
    });
    const navigate = useNavigate();

    // Data Fetching
    const { data: payloadTypesData, loading: loadingTypes } = useQuery(GET_PAYLOAD_TYPES);

    // Derived Data
    const [availableOS, setAvailableOS] = useState<string[]>([]);
    const [payloadTypesPerOS, setPayloadTypesPerOS] = useState<Record<string, any[]>>({});

    useEffect(() => {
        if (payloadTypesData?.payloadtype) {
            const types = payloadTypesData.payloadtype;
            const osMap: Record<string, any[]> = {};
            const osSet = new Set<string>();

            types.forEach((pt: any) => {
                if (Array.isArray(pt.supported_os)) {
                    pt.supported_os.forEach((os: string) => {
                        osSet.add(os);
                        if (!osMap[os]) osMap[os] = [];
                        osMap[os].push(pt);
                    });
                } else if (typeof pt.supported_os === 'string') {
                    try {
                         const parsed = JSON.parse(pt.supported_os);
                         if (Array.isArray(parsed)) {
                             parsed.forEach((os: string) => {
                                 osSet.add(os);
                                 if (!osMap[os]) osMap[os] = [];
                                 osMap[os].push(pt);
                             });
                         }
                    } catch(e) {}
                }
            });

            setAvailableOS(Array.from(osSet).sort());
            setPayloadTypesPerOS(osMap);
        }
    }, [payloadTypesData]);

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        } else {
            navigate('/payloads');
        }
    };

    const isNextDisabled = () => {
        if (currentStep === 0) return !config.os || !config.payloadType;
        return false;
    }

    return (
        <div className="h-full bg-void text-signal font-sans p-6 lg:p-12 flex flex-col">
            {/* Header & Stepper */}
            <div className="mb-8 shrink-0">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-signal bg-signal/10 rounded">
                            <Terminal size={24} className="text-signal" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest">PAYLOAD GENERATOR</h1>
                            <p className="text-xs text-gray-400 font-mono">/root/payloads/generate</p>
                        </div>
                    </div>
                    <div className="text-xs font-mono text-gray-400">
                        SYSTEM_STATUS: <span className="text-green-500">ONLINE</span>
                    </div>
                </div>

                {/* Stepper */}
                <div className="flex items-center justify-between relative">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gray-800 -z-10"></div>
                    {STEPS.map((step, index) => (
                        <div key={step} className="flex flex-col items-center gap-2 bg-void px-2">
                            <div className={cn(
                                "w-4 h-4 rounded-full border border-current flex items-center justify-center transition-all duration-300",
                                index <= currentStep ? "border-signal bg-signal text-void" : "border-gray-600 text-gray-600",
                                index === currentStep && "ring-4 ring-signal/20"
                            )}>
                                {index < currentStep ? <Check size={10} /> : <div className="w-1.5 h-1.5 bg-current rounded-full" />}
                            </div>
                            <span className={cn(
                                "text-[10px] font-mono tracking-wider uppercase transition-colors duration-300",
                                index <= currentStep ? "text-signal" : "text-gray-600"
                            )}>
                                {step}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 border border-ghost/30 bg-black/40 backdrop-blur-sm relative flex flex-col min-h-0">
                <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none">
                    <Disc size={100} className={loadingTypes ? "animate-spin" : ""} />
                </div>

                <div className="p-8 flex-1 overflow-y-auto cyber-scrollbar">
                    <AnimatePresence mode="wait">
                        {currentStep === 0 && (
                            <motion.div
                                key="step1"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="space-y-8"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h2 className="text-xl font-mono text-signal flex items-center gap-2">
                                            <span className="text-signal/50">01.</span> TARGET_SYSTEM
                                        </h2>
                                        <div className="flex flex-col gap-3">
                                            {availableOS.map(os => (
                                                <button
                                                    key={os}
                                                    onClick={() => setConfig({ ...config, os, payloadType: '' })}
                                                    className={cn(
                                                        "w-full p-4 border text-left transition-all duration-200 hover:bg-white/5 flex items-center gap-4 group",
                                                        config.os === os 
                                                            ? "border-signal text-signal bg-white/5" 
                                                            : "border-gray-700 text-gray-400 hover:border-gray-500"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "p-3 rounded-full border transition-colors",
                                                        config.os === os 
                                                            ? "border-signal bg-signal text-void"
                                                            : "border-ghost/30 bg-white/5 group-hover:border-signal group-hover:text-signal"
                                                    )}>
                                                        {getOSIcon(os)}
                                                    </div>
                                                    <div>
                                                        <div className={cn(
                                                            "font-mono text-lg font-bold transition-colors",
                                                            config.os === os ? "text-signal" : "group-hover:text-signal"
                                                        )}>{os}</div>
                                                        <div className="text-xs text-gray-400 font-mono mt-1">{getOSInfo(os)}</div>
                                                    </div>
                                                    <ChevronRight className={cn(
                                                        "ml-auto transition-all",
                                                        config.os === os ? "opacity-100 text-signal" : "opacity-0 group-hover:opacity-100 text-gray-500"
                                                    )} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h2 className="text-xl font-mono text-signal flex items-center gap-2">
                                            <span className="text-signal/50">02.</span> AGENT_ARCH
                                        </h2>
                                        
                                        {!config.os && (
                                            <div className="h-full flex items-center justify-center border border-dashed border-gray-800 text-gray-600 font-mono text-sm p-8">
                                                AWAITING_SYSTEM_SELECTION...
                                            </div>
                                        )}

                                        {config.os && (
                                            <div className="space-y-3">
                                                {payloadTypesPerOS[config.os]?.map((pt: any) => (
                                                    <button
                                                        key={pt.id}
                                                        onClick={() => setConfig({ ...config, payloadType: pt.name })}
                                                        className={cn(
                                                            "w-full p-4 border text-left transition-all duration-200 group",
                                                            config.payloadType === pt.name
                                                                ? "border-signal bg-white/5" 
                                                                : "border-gray-700 hover:border-gray-500 hover:bg-white/5"
                                                        )}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className={cn(
                                                                "font-bold font-mono text-lg",
                                                                config.payloadType === pt.name ? "text-signal" : "text-gray-300"
                                                            )}>{pt.name}</span>
                                                            <span className="text-xs bg-gray-800 px-2 py-1 text-gray-400 font-mono">v{pt.semver}</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 font-mono line-clamp-2">{pt.note}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        
                        {currentStep === 1 && (
                            <motion.div
                                key="step2"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="h-full"
                            >
                                <Step2Configuration 
                                    payloadType={config.payloadType} 
                                    os={config.os}
                                    currentConfig={config.buildParameters}
                                    onUpdate={(params) => setConfig({ ...config, buildParameters: params })}
                                />
                            </motion.div>
                        )}

                        {currentStep === 2 && (
                            <motion.div
                                key="step3"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="h-full"
                            >
                                <Step3Commands 
                                    payloadType={config.payloadType}
                                    currentCommands={config.commands}
                                    onUpdate={(cmds) => setConfig({ ...config, commands: cmds })}
                                />
                            </motion.div>
                        )}

                        {currentStep === 3 && (
                            <motion.div
                                key="step4"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="h-full"
                            >
                                <Step4C2Profiles 
                                    payloadType={config.payloadType}
                                    os={config.os}
                                    currentC2Profiles={config.c2Profiles}
                                    onUpdate={(profiles) => setConfig({ ...config, c2Profiles: profiles })}
                                />
                            </motion.div>
                        )}

                        {currentStep === 4 && (
                            <motion.div
                                key="step5"
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="h-full"
                            >
                                <Step5Build config={config} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer / Controls */}
                <div className="p-6 border-t border-ghost/30 bg-black/20 flex justify-between items-center shrink-0">
                    <button
                        onClick={handleBack}
                        className="px-6 py-2 border border-gray-700 text-gray-400 font-mono text-sm hover:text-signal hover:border-signal disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        BACK
                    </button>
                    
                    {currentStep < STEPS.length - 1 && (
                        <button
                            onClick={handleNext}
                            disabled={isNextDisabled()}
                            className="px-8 py-2 bg-signal text-void font-bold font-mono text-sm hover:bg-white hover:shadow-[0_0_15px_rgba(255,255,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                        >
                            NEXT_PHASE <ChevronRight size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// Main component for /payloads route
export default function CreatePayloadRouter() {
    const { isSidebarCollapsed } = useAppStore();

    return (
        <div className="h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void flex">
            <Sidebar />
            
            <div className={cn("transition-all duration-300 flex-1 h-full", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                <Routes>
                    <Route path="/" element={<PayloadsList />} />
                    <Route path="/new" element={<PayloadCreationWizard />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </div>
        </div>
    );
}
