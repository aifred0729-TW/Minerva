import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useLazyQuery } from "@apollo/client/react";
import { GET_PAYLOAD_TYPES, GET_EXISTING_PAYLOADS, GET_PAYLOAD_INSTANCE_PARAMS } from './queries';
import { ChevronRight, Disc, Check, Monitor, Command, Terminal, Smartphone, Server, Globe, Database } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { PayloadsList } from './PayloadsList';
import { Routes, Route, Navigate } from 'react-router-dom';

import { useAppStore } from '../../store';
import { Step2Configuration, getDefaultValueForType } from './Step2Configuration';
import { Step3Commands } from './Step3Commands';
import { Step4C2Profiles } from './Step4C2Profiles';
import { Step5Build } from './Step5Build';
import { snackActions } from '../../lib/snackbar';

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
        payloadTypeInfo: any | null;
    }>({
        os: '',
        payloadType: '',
        buildParameters: [],
        commands: [],
        c2Profiles: [],
        payloadTypeInfo: null,
    });
    const [showNoC2Confirm, setShowNoC2Confirm] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const rebuildStateRef = useRef<{ fromPayloadId: number; fromPayloadOS: string; fromPayloadType: string } | null>(
        (location.state as any)?.fromPayloadId
            ? {
                  fromPayloadId: (location.state as any).fromPayloadId,
                  fromPayloadOS: (location.state as any).fromPayloadOS,
                  fromPayloadType: (location.state as any).fromPayloadType,
              }
            : null
    );
    // Data Fetching
    const { data: payloadTypesData, loading: loadingTypes } = useQuery<any>(GET_PAYLOAD_TYPES);

    // Lazy queries for "Continue from Existing"
    const [getExistingPayloads, { data: existingPayloadsData }] = useLazyQuery<any>(GET_EXISTING_PAYLOADS, { fetchPolicy: "network-only" });
    const [getPayloadInstanceParams] = useLazyQuery<any>(GET_PAYLOAD_INSTANCE_PARAMS, { fetchPolicy: "network-only" });

    // Derived Data
    const [availableOS, setAvailableOS] = useState<string[]>([]);
    const [payloadTypesPerOS, setPayloadTypesPerOS] = useState<Record<string, any[]>>({});
    const [existingPayloads, setExistingPayloads] = useState<any[]>([]);
    const [showExisting, setShowExisting] = useState(false);

    useEffect(() => {
        if (payloadTypesData?.payloadtype) {
            const types = payloadTypesData.payloadtype;
            const osMap: Record<string, any[]> = {};
            const osSet = new Set<string>();
            types.forEach((pt: any) => {
                const osList = Array.isArray(pt.supported_os)
                    ? pt.supported_os
                    : (() => { try { return JSON.parse(pt.supported_os); } catch (e) { return []; } })();
                osList.forEach((os: string) => {
                    osSet.add(os);
                    if (!osMap[os]) osMap[os] = [];
                    osMap[os].push(pt);
                });
            });
            setAvailableOS(Array.from(osSet).sort());
            setPayloadTypesPerOS(osMap);
        }
    }, [payloadTypesData]);

    // Fetch existing payloads when os+payloadType are selected
    useEffect(() => {
        if (config.os && config.payloadType) {
            getExistingPayloads({ variables: { payloadType: config.payloadType, os: config.os } });
            setShowExisting(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.os, config.payloadType]);

    useEffect(() => {
        if (existingPayloadsData?.payload) {
            setExistingPayloads(existingPayloadsData.payload.filter((p: any) => p.build_phase === "success"));
        }
    }, [existingPayloadsData]);

    // Auto-load config when navigating from Payloads "Rebuild from Config (Wizard)"
    useEffect(() => {
        const rs = rebuildStateRef.current;
        if (!rs || !payloadTypesData?.payloadtype) return;
        // Only fire once
        rebuildStateRef.current = null;
        // Clear location state so refresh doesn't re-trigger
        window.history.replaceState({}, '');
        // Auto-set OS + payloadType
        setConfig(prev => ({ ...prev, os: rs.fromPayloadOS, payloadType: rs.fromPayloadType }));
        // Give state a tick to settle, then load the full config
        setTimeout(() => {
            handleLoadExistingPayload(rs.fromPayloadId);
        }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payloadTypesData]);

    const handlePayloadTypeInfoLoad = useCallback((info: any) => {
        setConfig(prev => ({ ...prev, payloadTypeInfo: info }));
    }, []);

    const handleLoadExistingPayload = async (payloadId: number) => {
        try {
            const { data } = await getPayloadInstanceParams({ variables: { payload_id: payloadId } });
            if (!data?.payload_by_pk) return;
            const payload = data.payload_by_pk;
            const ptData = payload.payloadtype;

            // Reconstruct build parameters
            const buildParams = ptData.buildparameters.map((param: any) => {
                const instance = payload.buildparameterinstances.find((bi: any) => bi.build_parameter_id === param.id);
                let val: any;
                if (instance) {
                    // Parse raw DB string values into proper JS types based on parameter_type
                    const rawVal = instance.value;
                    if (param.parameter_type === "File") {
                        val = { name: rawVal, legacy: true };
                    } else if (["Array", "ChooseMultiple", "TypedArray", "FileMultiple"].includes(param.parameter_type)) {
                        if (Array.isArray(rawVal)) {
                            val = rawVal;
                        } else if (typeof rawVal === 'string' && rawVal !== '') {
                            try { val = JSON.parse(rawVal); if (!Array.isArray(val)) val = []; } catch (e) { val = []; }
                        } else { val = []; }
                    } else if (param.parameter_type === "Number") {
                        val = rawVal !== '' && rawVal !== null && rawVal !== undefined ? Number(rawVal) : 0;
                    } else if (param.parameter_type === "Boolean") {
                        val = rawVal === "true" || rawVal === true;
                    } else if (param.parameter_type === "Dictionary") {
                        if (typeof rawVal === 'string' && rawVal !== '') {
                            try { val = JSON.parse(rawVal); } catch (e) { val = getDefaultValueForType(param); }
                        } else { val = getDefaultValueForType(param); }
                    } else {
                        val = rawVal;
                    }
                } else {
                    // No instance found, use default value
                    val = getDefaultValueForType(param);
                }
                return { ...param, value: val };
            });

            // Reconstruct commands
            const commands = payload.payloadcommands.map((pc: any) => pc.command.cmd);

            // Reconstruct C2 profiles
            const c2ProfilesGrouped: Record<string, any[]> = {};
            payload.c2profileparametersinstances.forEach((ci: any) => {
                const c2name = ci.c2profileparameter?.c2profile?.name;
                if (!c2name) return;
                if (!c2ProfilesGrouped[c2name]) {
                    c2ProfilesGrouped[c2name] = [];
                }
                c2ProfilesGrouped[c2name].push(ci);
            });

            const c2Profiles = Object.entries(c2ProfilesGrouped).map(([name, instances]: [string, any[]]) => {
                const firstInst = instances[0];
                const c2profile = firstInst?.c2profileparameter?.c2profile;
                const params = instances.map((ci: any) => ({
                    ...ci.c2profileparameter,
                    value: ci.value,
                    trackedValue: ci.value,
                    error: false,
                    choices: Array.isArray(ci.c2profileparameter?.choices)
                        ? ci.c2profileparameter.choices
                        : (() => { try { return JSON.parse(ci.c2profileparameter?.choices || "[]"); } catch (e) { return []; } })(),
                }));
                return {
                    ...c2profile,
                    id: c2profile?.id,
                    is_p2p: c2profile?.is_p2p,
                    c2profileparametersinstances: c2profile?.c2profileparametersinstances || [],
                    c2profileparameters: params,
                    instance_id: Date.now() + Math.random(),
                    selected_instance: "None",
                };
            });

            setConfig(prev => ({
                ...prev,
                buildParameters: buildParams,
                commands,
                c2Profiles,
                payloadTypeInfo: {
                    file_extension: ptData.file_extension,
                    agent_type: ptData.agent_type,
                    supports_multiple_c2_in_build: ptData.supports_multiple_c2_in_build,
                    supports_multiple_c2_instances_in_build: ptData.supports_multiple_c2_instances_in_build,
                    c2_parameter_deviations: ptData.c2_parameter_deviations,
                },
            }));

            snackActions.info("Loaded configuration from existing payload. Proceeding to build step.");
            setCurrentStep(4); // Jump to build step
        } catch (e) {
            snackActions.error("Failed to load existing payload configuration");
        }
    };

    const handleNext = () => {
        // Check no-C2 confirmation for agent type
        if (currentStep === 3 && config.c2Profiles.length === 0 && config.payloadTypeInfo?.agent_type === "agent") {
            setShowNoC2Confirm(true);
            return;
        }
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
    };

    return (
        <div className="h-full bg-void text-signal font-sans p-6 lg:p-12 flex flex-col">
            {/* Header & Stepper */}
            <div className="mb-8 shrink-0">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Terminal size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">PAYLOAD GENERATOR</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                GENERATE PAYLOAD
                            </p>
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
                                                    onClick={() => setConfig({ ...config, os, payloadType: '', buildParameters: [], commands: [], c2Profiles: [], payloadTypeInfo: null })}
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
                                                        onClick={() => setConfig({ ...config, payloadType: pt.name, buildParameters: [], commands: [], c2Profiles: [], payloadTypeInfo: null })}
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

                                        {/* Continue from Existing Payload */}
                                        {config.os && config.payloadType && existingPayloads.length > 0 && (
                                            <div className="mt-4 border border-ghost/30 bg-black/40">
                                                <button
                                                    onClick={() => setShowExisting(!showExisting)}
                                                    className="w-full p-3 px-4 bg-white/5 border-b border-ghost/30 flex items-center gap-2 text-left hover:bg-white/10 transition-colors"
                                                >
                                                    <Database size={14} className="text-signal" />
                                                    <span className="font-mono text-xs font-bold text-signal tracking-wider">
                                                        CONTINUE_FROM_EXISTING ({existingPayloads.length})
                                                    </span>
                                                    <ChevronRight size={14} className={cn("ml-auto text-gray-400 transition-transform", showExisting && "rotate-90")} />
                                                </button>
                                                {showExisting && (
                                                    <div className="divide-y divide-gray-800">
                                                        {existingPayloads.map((p: any) => (
                                                            <button
                                                                key={p.id}
                                                                onClick={() => handleLoadExistingPayload(p.id)}
                                                                className="w-full p-3 px-4 text-left hover:bg-white/5 transition-colors flex items-center justify-between group"
                                                            >
                                                                <div>
                                                                    <div className="font-mono text-sm text-gray-300 group-hover:text-signal transition-colors">
                                                                        {p.description || p.filemetum?.filename_text || p.uuid}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">
                                                                        {new Date(p.creation_time).toLocaleString()} · {p.uuid.slice(0, 8)}...
                                                                    </div>
                                                                </div>
                                                                <ChevronRight size={14} className="text-gray-600 group-hover:text-signal transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
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
                                    onUpdate={(params) => setConfig(prev => ({ ...prev, buildParameters: params }))}
                                    onPayloadTypeInfoLoad={handlePayloadTypeInfoLoad}
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
                                    onUpdate={(cmds) => setConfig(prev => ({ ...prev, commands: cmds }))}
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
                                    onUpdate={(profiles) => setConfig(prev => ({ ...prev, c2Profiles: profiles }))}
                                    payloadTypeInfo={config.payloadTypeInfo}
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

                {/* No-C2 Confirmation Dialog */}
                {showNoC2Confirm && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
                        <div className="border border-signal bg-void p-6 max-w-sm w-full mx-4 space-y-4 font-mono">
                            <div className="text-signal font-bold text-sm tracking-widest">WARNING: NO_C2_CONFIGURED</div>
                            <p className="text-xs text-gray-400">
                                No C2 profiles have been configured. This agent may not be able to communicate back.
                                Are you sure you want to proceed?
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowNoC2Confirm(false);
                                        setCurrentStep(currentStep + 1);
                                    }}
                                    className="flex-1 py-2 bg-signal text-void font-bold text-xs hover:bg-white transition-colors"
                                >
                                    PROCEED_ANYWAY
                                </button>
                                <button
                                    onClick={() => setShowNoC2Confirm(false)}
                                    className="flex-1 py-2 border border-gray-700 text-gray-400 font-bold text-xs hover:border-signal hover:text-signal transition-colors"
                                >
                                    CANCEL
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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
    const isSidebarCollapsed = useAppStore(s => s.isSidebarCollapsed);

    return (
        <div className="h-screen bg-void text-signal font-sans selection:bg-signal selection:text-void flex">
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
