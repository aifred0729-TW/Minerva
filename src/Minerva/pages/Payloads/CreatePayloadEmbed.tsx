import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation } from "@apollo/client/react";
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Box, Check, CheckCircle, ChevronLeft, ChevronRight,
    Disc, FileText, Package, Plus, Radio, Settings, Sliders,
    Terminal, XCircle, Loader2, Search} from 'lucide-react';
import { cn, getErrorMessage } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { useBattleMode } from '../../context/BattleModeContext';
import { GET_PAYLOAD_TYPES, CREATE_PAYLOAD } from '../../lib/api/payloads';
import type { PayloadTypeData, C2Profile, C2ProfileInstance, Payload } from '../../types/payloads';
import { getAnimDuration, getOSInfo, getOSIcon, PAYLOAD_STEPS, CommandTooltip } from './utils';
import { CyberDropdown } from '../../components/CyberDropdown';
import { CreateWrapperWizard } from '../CreateWrapper';
import { CreateMsfPayloadEmbed } from './CreateMsfPayloadEmbed';

/** Quick hint shown on the METASPLOIT agent tile. Mirrors the prefix mapping
 *  in CreateMsfPayloadEmbed so the tile text stays accurate. */
const OS_TO_MSF_HINT: Record<string, string> = {
    Windows: 'windows', Linux: 'linux', macOS: 'osx', OSX: 'osx',
    Mac: 'osx', Android: 'android', iOS: 'apple_ios',
    FreeBSD: 'freebsd', OpenBSD: 'openbsd', NetBSD: 'netbsd',
    Solaris: 'solaris', AIX: 'aix', 'HP-UX': 'hpux', UNIX: 'unix',
};

/** Operating systems that Metasploit supports but Mythic typically doesn't.
 *  These appear in the Step 0 TARGET SYSTEM list alongside Mythic-supported
 *  OSes so the operator can see the full reach without leaving the page. */
const MSF_ONLY_OS_LIST = [
    'Android',
    'iOS',
    'FreeBSD',
    'OpenBSD',
    'NetBSD',
    'Solaris',
    'AIX',
    'HP-UX',
] as const;

export const CreatePayloadEmbed: React.FC<{
    onComplete: () => void;
}> = ({ onComplete }) => {
    const { active: isCombat } = useBattleMode();
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedOS, setSelectedOS] = useState<string>('');
    const [selectedPayloadType, setSelectedPayloadType] = useState<PayloadTypeData | null>(null);
    // Source picker — Mythic (default) or Metasploit. When 'msf' is chosen on
    // Step 0, the wizard hands off to CreateMsfPayloadEmbed for that OS.
    const [createSource, setCreateSource] = useState<'mythic' | 'msf'>('mythic');
    const [showMsfEmbed, setShowMsfEmbed] = useState(false);
    const [buildParams, setBuildParams] = useState<Record<string, any>>({});
    const [selectedCommands, setSelectedCommands] = useState<string[]>([]);
    const [c2ProfileInstances, setC2ProfileInstances] = useState<C2ProfileInstance[]>([]);
    const [description, setDescription] = useState('Created via Minerva');
    const [filename, setFilename] = useState('');
    const [building, setBuilding] = useState(false);
    const [buildResult, setBuildResult] = useState<{ status: string; error?: string; uuid?: string } | null>(null);
    const [commandFilter, setCommandFilter] = useState('');
    
    // C2 Profile selection state - now requires explicit ADD action
    const [selectedC2ToAdd, setSelectedC2ToAdd] = useState<string>('');
    
    // Tooltip state
    const [hoveredCommand, setHoveredCommand] = useState<PayloadTypeData['commands'][0] | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const tooltipTimer = useRef<NodeJS.Timeout | null>(null);

    const { data: payloadTypesData, loading: loadingTypes } = useQuery<any>(GET_PAYLOAD_TYPES);
    const [createPayload] = useMutation<any>(CREATE_PAYLOAD);

    // Group payload types by OS. Then append MSF-only OSes (no Mythic agents
    // for them, but operators can still generate MSF payloads targeting those
    // platforms). The `mythicOSes` Set lets the renderer distinguish the two.
    const { availableOS, payloadTypesByOS, mythicOSes } = React.useMemo(() => {
        const osSet = new Set<string>();
        const osMap: Record<string, PayloadTypeData[]> = {};

        if (payloadTypesData?.payloadtype) {
            payloadTypesData.payloadtype.forEach((pt: PayloadTypeData) => {
                const osArray = Array.isArray(pt.supported_os) ? pt.supported_os : [];
                osArray.forEach((os: string) => {
                    osSet.add(os);
                    if (!osMap[os]) osMap[os] = [];
                    osMap[os].push(pt);
                });
            });
        }

        const mythicOS = new Set(osSet);
        for (const o of MSF_ONLY_OS_LIST) osSet.add(o);
        // Sort: Mythic-supported first (so the most common targets head the
        // list), then MSF-only block.
        const sorted = Array.from(osSet).sort((a, b) => {
            const aMythic = mythicOS.has(a) ? 0 : 1;
            const bMythic = mythicOS.has(b) ? 0 : 1;
            return aMythic !== bMythic ? aMythic - bMythic : a.localeCompare(b);
        });
        return { availableOS: sorted, payloadTypesByOS: osMap, mythicOSes: mythicOS };
    }, [payloadTypesData]);

    // Initialize build params when payload type is selected
    useEffect(() => {
        if (selectedPayloadType) {
            const params: Record<string, unknown> = {};
            selectedPayloadType.buildparameters.forEach(bp => {
                if (bp.parameter_type === 'Boolean') {
                    params[bp.name] = bp.default_value === 'true' || bp.default_value === true;
                } else {
                    params[bp.name] = bp.default_value;
                }
            });
            setBuildParams(params);
            setC2ProfileInstances([]);
            setSelectedCommands([]);
        }
    }, [selectedPayloadType]);

    // Group build parameters
    const groupedBuildParams = React.useMemo(() => {
        if (!selectedPayloadType) return {};
        return selectedPayloadType.buildparameters.reduce((acc, bp) => {
            const group = bp.group_name || 'BASIC OPTIONS';
            if (!acc[group]) acc[group] = [];
            acc[group].push(bp);
            return acc;
        }, {} as Record<string, typeof selectedPayloadType.buildparameters>);
    }, [selectedPayloadType]);

    // Filtered commands
    const filteredCommands = React.useMemo(() => {
        if (!selectedPayloadType) return [];
        if (!commandFilter) return selectedPayloadType.commands;
        return selectedPayloadType.commands.filter(c => 
            c.cmd.toLowerCase().includes(commandFilter.toLowerCase()) ||
            c.description?.toLowerCase().includes(commandFilter.toLowerCase())
        );
    }, [selectedPayloadType, commandFilter]);

    // C2 Profile Helpers
    const addC2ProfileInstance = (profile: C2Profile) => {
        const defaultParams: Record<string, any> = {};
        profile.c2profileparameters.forEach(p => {
            if (p.parameter_type === 'Boolean') {
                defaultParams[p.name] = p.default_value === 'true' || p.default_value === true;
            } else if (p.parameter_type === 'Date') {
                const tmpDate = new Date();
                tmpDate.setDate(tmpDate.getDate() + parseInt(String(p.default_value) || '30'));
                defaultParams[p.name] = tmpDate.toISOString().slice(0, 10);
            } else if (p.parameter_type === 'Dictionary') {
                // Dictionary default_value is a JSON string, parse it
                if (typeof p.default_value === 'string') {
                    try {
                        defaultParams[p.name] = JSON.parse(p.default_value);
                    } catch (e) {
                        defaultParams[p.name] = {};
                    }
                } else {
                    defaultParams[p.name] = p.default_value || {};
                }
            } else if (p.parameter_type === 'Array' || p.parameter_type === 'ChooseMultiple') {
                if (typeof p.default_value === 'string') {
                    try {
                        defaultParams[p.name] = JSON.parse(p.default_value);
                    } catch (e) {
                        defaultParams[p.name] = [];
                    }
                } else {
                    defaultParams[p.name] = p.default_value || [];
                }
            } else if (p.parameter_type === 'Number') {
                defaultParams[p.name] = Number(p.default_value) || 0;
            } else {
                defaultParams[p.name] = p.default_value;
            }
        });
        
        setC2ProfileInstances([...c2ProfileInstances, {
            profile,
            instance_id: Date.now(),
            parameters: defaultParams
        }]);
        // Clear selection after adding
        setSelectedC2ToAdd('');
    };

    const handleAddC2Profile = () => {
        if (!selectedC2ToAdd || !selectedPayloadType) return;
        const profile = selectedPayloadType.payloadtypec2profiles.find(
            p => p.c2profile.id === parseInt(selectedC2ToAdd)
        );
        if (profile) {
            addC2ProfileInstance(profile.c2profile);
        }
    };

    const removeC2ProfileInstance = (instanceId: number) => {
        setC2ProfileInstances(c2ProfileInstances.filter(i => i.instance_id !== instanceId));
    };

    const updateC2InstanceParam = (instanceId: number, paramName: string, value: any) => {
        setC2ProfileInstances(c2ProfileInstances.map(inst => 
            inst.instance_id === instanceId 
                ? { ...inst, parameters: { ...inst.parameters, [paramName]: value } }
                : inst
        ));
    };

    // Tooltip handlers
    const handleCommandMouseEnter = (e: React.MouseEvent, cmd: PayloadTypeData['commands'][0]) => {
        const offset = 15;
        const x = e.clientX + offset;
        const y = e.clientY + offset;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const tooltipWidth = 320;
        const tooltipHeight = 250;
        
        const finalX = x + tooltipWidth > screenWidth ? e.clientX - tooltipWidth - offset : x;
        const finalY = y + tooltipHeight > screenHeight ? e.clientY - tooltipHeight - offset : y;
        
        setTooltipPosition({ x: finalX, y: finalY });
        tooltipTimer.current = setTimeout(() => {
            setHoveredCommand(cmd);
        }, 200);
    };

    const handleCommandMouseMove = (e: React.MouseEvent) => {
        if (hoveredCommand || tooltipTimer.current) {
            const offset = 15;
            const x = e.clientX + offset;
            const y = e.clientY + offset;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const tooltipWidth = 320;
            const tooltipHeight = 250;
            
            const finalX = x + tooltipWidth > screenWidth ? e.clientX - tooltipWidth - offset : x;
            const finalY = y + tooltipHeight > screenHeight ? e.clientY - tooltipHeight - offset : y;
            setTooltipPosition({ x: finalX, y: finalY });
        }
    };

    const handleCommandMouseLeave = () => {
        if (tooltipTimer.current) {
            clearTimeout(tooltipTimer.current);
            tooltipTimer.current = null;
        }
        setHoveredCommand(null);
    };

    const handleBuild = async () => {
        if (!selectedPayloadType) return;

        setBuilding(true);
        setBuildResult(null);

        try {
            // Build parameters as array with name/value pairs
            const buildParameters = selectedPayloadType.buildparameters.map(bp => {
                let value = buildParams[bp.name] ?? bp.default_value;
                
                // Handle Dictionary type - parse if it's a string
                if (bp.parameter_type === 'Dictionary') {
                    if (typeof value === 'string') {
                        try {
                            value = JSON.parse(value);
                        } catch (e) {
                            value = {};
                        }
                    }
                }
                
                return { name: bp.name, value };
            });

            // C2 profiles - parameters should be an object
            const c2Profiles = c2ProfileInstances.map(inst => {
                const instanceParams: Record<string, unknown> = {};
                
                inst.profile.c2profileparameters.forEach(p => {
                    let value: any = inst.parameters[p.name] ?? p.default_value;
                    
                    // Handle Dictionary type
                    if (p.parameter_type === 'Dictionary') {
                        if (typeof value === 'string') {
                            try {
                                // Parse the JSON string
                                value = JSON.parse(value);
                            } catch (e) {
                                value = {};
                            }
                        }
                        // If it's already an object, use it as-is
                        if (typeof value === 'object' && value !== null) {
                            instanceParams[p.name] = value;
                        } else {
                            instanceParams[p.name] = {};
                        }
                    } else if (p.parameter_type === 'Array' || p.parameter_type === 'ChooseMultiple') {
                        // Handle array types
                        if (typeof value === 'string') {
                            try {
                                value = JSON.parse(value);
                            } catch (e) {
                                value = [];
                            }
                        }
                        instanceParams[p.name] = value;
                    } else if (p.parameter_type === 'Number') {
                        instanceParams[p.name] = Number(value);
                    } else if (p.parameter_type === 'Boolean') {
                        instanceParams[p.name] = value === true || value === 'true';
                    } else {
                        instanceParams[p.name] = value;
                    }
                });
                
                return {
                    c2_profile: inst.profile.name,
                    c2_profile_parameters: instanceParams
                };
            });

            // Use user-specified filename, or fallback to build params, or payload type name
            const finalFilename = filename || buildParams['output'] || buildParams['output_type'] || 
                             buildParams['filename'] || selectedPayloadType.name;

            const finishedPayload = {
                selected_os: selectedOS,
                payload_type: selectedPayloadType.name,
                filename: finalFilename,
                description: description,
                commands: selectedCommands,
                build_parameters: buildParameters,
                c2_profiles: c2Profiles
            };

            const result = await createPayload({
                variables: { payload: JSON.stringify(finishedPayload) }
            });

            if (result.data?.createPayload?.status === 'success') {
                setBuildResult({ status: 'success', uuid: result.data.createPayload.uuid });
                snackActions.success('Payload build started!');
            } else {
                setBuildResult({ status: 'error', error: result.data?.createPayload?.error || 'Unknown error' });
                snackActions.error(result.data?.createPayload?.error || 'Build failed');
            }
        } catch (error: any) {
            setBuildResult({ status: 'error', error: error.message });
            snackActions.error('Build failed: ' + getErrorMessage(error));
        } finally {
            setBuilding(false);
        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0: return Boolean(selectedOS && (createSource === 'msf' || selectedPayloadType));
            case 1: return true;
            case 2: return selectedCommands.length > 0;
            case 3: return c2ProfileInstances.length > 0 || selectedPayloadType?.payloadtypec2profiles.length === 0;
            case 4: return true;
            default: return false;
        }
    };

    // When the operator picks METASPLOIT in Step 0 and advances NEXT, hand off
    // to the MSF wizard. It manages its own steps + storage + agentstorage sync.
    if (showMsfEmbed && selectedOS) {
        return (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <CreateMsfPayloadEmbed
                    os={selectedOS}
                    onBack={() => setShowMsfEmbed(false)}
                    onComplete={onComplete}
                />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Step Indicator - Matching CreateWrapper style */}
            <div className="flex items-center justify-center mb-8">
                {PAYLOAD_STEPS.map((step, index) => (
                    <React.Fragment key={step}>
                        <motion.div 
                            className="flex flex-col items-center gap-2"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <motion.div 
                                className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                                    index < currentStep 
                                        ? "bg-matrix border-matrix text-void"
                                        : index === currentStep
                                            ? "border-signal text-signal bg-signal/10"
                                            : "border-ghost/30 text-ghost"
                                )}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                {index < currentStep ? (
                                    <Check size={18} strokeWidth={3} />
                                ) : (
                                    <span className="font-mono font-bold">{index + 1}</span>
                                )}
                            </motion.div>
                            <span className={cn(
                                "text-[10px] font-mono tracking-widest hidden lg:block text-center max-w-[80px]",
                                index <= currentStep ? "text-signal" : "text-ghost/50"
                            )}>
                                {step}
                            </span>
                        </motion.div>
                        {index < PAYLOAD_STEPS.length - 1 && (
                            <div className={cn(
                                "w-12 xl:w-20 h-0.5 mx-2 transition-all duration-500",
                                index < currentStep 
                                    ? "bg-matrix" 
                                    : "bg-ghost/20"
                            )} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Step Content */}
            <div className="flex-1 border border-ghost/30 rounded-lg overflow-hidden flex flex-col min-h-0 bg-black/20">
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 cyber-scrollbar">
                    <AnimatePresence mode="wait">
                        {/* Step 0: Select OS and Agent */}
                        {currentStep === 0 && (
                            <motion.div
                                key="step0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: getAnimDuration(0.3, isCombat) }}
                                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                            >
                                {/* OS Selection */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-mono text-signal flex items-center gap-2">
                                        <span className="text-gray-600">01.</span> TARGET SYSTEM
                                        <span className="ml-auto text-xs font-mono text-signal/70">
                                            {availableOS.length} OS · {MSF_ONLY_OS_LIST.length} via MSF
                                        </span>
                                    </h3>
                                    {/* OS list scrolls internally so the page chrome stays put even
                                        with MSF's full OS coverage stacked into the list. */}
                                    <div className="space-y-2 max-h-[55vh] overflow-y-auto cyber-scrollbar pr-2">
                                        {loadingTypes ? (
                                            <div className="flex items-center justify-center py-8">
                                                <Loader2 className="animate-spin text-signal" size={24} />
                                            </div>
                                        ) : (
                                            availableOS.map(os => {
                                                const osInfo = getOSInfo(os);
                                                const agentCount = payloadTypesByOS[os]?.length || 0;
                                                const isMsfOnly = !mythicOSes.has(os);
                                                return (
                                                    <button
                                                        key={os}
                                                        onClick={() => {
                                                            setSelectedOS(os);
                                                            setSelectedPayloadType(null);
                                                            // MSF-only OSes have no Mythic agents — auto-pick MSF source.
                                                            if (isMsfOnly) setCreateSource('msf');
                                                        }}
                                                        className={cn(
                                                            "w-full p-4 border text-left transition-all group",
                                                            selectedOS === os
                                                                ? (isMsfOnly ? "border-accent bg-signal/[0.06]" : `${osInfo.border} ${osInfo.bg}`)
                                                                : (isMsfOnly
                                                                    ? "border-signal/20 hover:border-accent hover:bg-signal/10"
                                                                    : "border-gray-700 hover:border-gray-500 hover:bg-white/5")
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            <div className={cn(
                                                                "p-3 border transition-colors",
                                                                selectedOS === os
                                                                    ? (isMsfOnly ? "border-accent bg-signal/[0.06] text-accent" : `${osInfo.border} ${osInfo.bg} ${osInfo.color}`)
                                                                    : (isMsfOnly ? "border-signal/20 text-accent" : "border-gray-600 text-gray-500 group-hover:text-gray-300")
                                                            )}>
                                                                {getOSIcon(os)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between mb-1 gap-2">
                                                                    <span className={cn(
                                                                        "font-mono font-bold text-lg",
                                                                        selectedOS === os ? (isMsfOnly ? "text-accent" : osInfo.color) : "text-white"
                                                                    )}>
                                                                        {os}
                                                                    </span>
                                                                    {isMsfOnly ? (
                                                                        <span className="text-[10px] font-mono tracking-[0.2em] border border-accent bg-signal/[0.06] px-1.5 py-px text-accent">
                                                                            MSF ONLY
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-xs bg-gray-800 px-2 py-0.5 text-gray-400 font-mono">
                                                                            {agentCount} AGENT{agentCount !== 1 ? 'S' : ''}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-signal/70 leading-relaxed">
                                                                    {isMsfOnly
                                                                        ? `Reachable via Metasploit only — no native Mythic agent.`
                                                                        : osInfo.desc}
                                                                </p>
                                                            </div>
                                                            <ChevronRight className={cn(
                                                                "transition-all mt-2",
                                                                selectedOS === os
                                                                    ? (isMsfOnly ? 'opacity-100 text-accent' : `opacity-100 ${osInfo.color}`)
                                                                    : "opacity-0 group-hover:opacity-50 text-gray-500"
                                                            )} size={18} />
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Agent Selection */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-mono text-signal flex items-center gap-2">
                                        <span className="text-gray-600">02.</span> AGENT TYPE
                                    </h3>
                                    <AnimatePresence mode="wait">
                                        {!selectedOS ? (
                                            <motion.div
                                                key="no-os"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: getAnimDuration(0.2, isCombat) }}
                                                className="border border-dashed border-gray-700 p-8 text-center text-gray-600 font-mono h-[300px] flex items-center justify-center"
                                            >
                                                <div>
                                                    <Package size={48} className="mx-auto mb-4 opacity-30" />
                                                    <p>SELECT TARGET SYSTEM FIRST</p>
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key={`os-${selectedOS}`}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: getAnimDuration(0.3, isCombat) }}
                                                className="space-y-2 max-h-[55vh] overflow-y-auto cyber-scrollbar pr-2"
                                            >
                                                {payloadTypesByOS[selectedOS]?.map((pt: PayloadTypeData, index: number) => (
                                                    <motion.button
                                                        key={pt.id}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{
                                                            duration: getAnimDuration(0.3, isCombat),
                                                            delay: getAnimDuration(index * 0.05, isCombat)
                                                        }}
                                                        onClick={() => { setSelectedPayloadType(pt); setCreateSource('mythic'); }}
                                                        className={cn(
                                                            "w-full p-4 border text-left transition-all group",
                                                            (selectedPayloadType?.id === pt.id && createSource === 'mythic')
                                                                ? "border-signal bg-signal/10"
                                                                : "border-gray-700 hover:border-gray-500 hover:bg-white/5"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className={cn(
                                                                    "font-mono font-bold",
                                                                    selectedPayloadType?.id === pt.id ? "text-signal" : "text-white"
                                                                )}>
                                                                    {pt.name}
                                                                </span>
                                                                {pt.container_running ? (
                                                                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                                                ) : (
                                                                    <span className="w-2 h-2 rounded-full bg-red-400" />
                                                                )}
                                                            </div>
                                                            <span className="text-xs bg-gray-800 px-2 py-0.5 text-gray-400 font-mono">
                                                                v{pt.semver}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{pt.note}</p>
                                                        <div className="flex items-center gap-4 text-[10px] text-gray-600 font-mono">
                                                            <span>{pt.commands?.length || 0} commands</span>
                                                            <span>{pt.payloadtypec2profiles?.length || 0} C2 profiles</span>
                                                            {pt.author && <span>by {pt.author}</span>}
                                                        </div>
                                                        {!pt.container_running && (
                                                            <div className="mt-2 flex items-center gap-1 text-yellow-500 text-xs">
                                                                <AlertTriangle size={12} />
                                                                Container not running
                                                            </div>
                                                        )}
                                                    </motion.button>
                                                ))}

                                                {/* ── METASPLOIT entry — additive sibling of every Mythic
                                                       agent tile. Picking it switches the wizard into MSF
                                                       mode for this OS without disturbing existing Mythic
                                                       payload types. ──────────────────────────────────── */}
                                                <motion.button
                                                    key="__msf__"
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        duration: getAnimDuration(0.3, isCombat),
                                                        delay: getAnimDuration((payloadTypesByOS[selectedOS]?.length ?? 0) * 0.05, isCombat),
                                                    }}
                                                    onClick={() => { setCreateSource('msf'); setSelectedPayloadType(null); }}
                                                    className={cn(
                                                        'w-full p-4 border text-left transition-all group relative overflow-hidden',
                                                        createSource === 'msf'
                                                            ? 'border-accent bg-signal/[0.06]'
                                                            : 'border-accent hover:border-accent hover:bg-signal/10',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[9px] font-mono tracking-[0.25em] border border-accent bg-signal/[0.06] px-1.5 py-px text-accent">
                                                                EXTERNAL
                                                            </span>
                                                            <span className={cn(
                                                                'font-mono font-bold',
                                                                createSource === 'msf' ? 'text-accent' : 'text-white',
                                                            )}>
                                                                METASPLOIT
                                                            </span>
                                                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_5px_currentColor] text-accent" />
                                                        </div>
                                                        <span className="text-xs bg-gray-800 px-2 py-0.5 text-signal font-mono">
                                                            MSF · RPC
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-signal/80 line-clamp-2 mb-2">
                                                        msfvenom-style payload generator — pick any
                                                        <span className="text-accent"> payload/{(OS_TO_MSF_HINT[selectedOS] ?? 'multi')}/* </span>
                                                        module, configure options, build &amp; deploy.
                                                    </p>
                                                    <div className="flex items-center gap-4 text-[10px] text-signal/80 font-mono">
                                                        <span>1500+ modules</span>
                                                        <span>multi-format output</span>
                                                        <span>shared via agentstorage</span>
                                                    </div>
                                                </motion.button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 1: Build Parameters - Table Style */}
                        {currentStep === 1 && selectedPayloadType && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: getAnimDuration(0.3, isCombat) }}
                                className="space-y-6"
                            >
                                {/* Description field */}
                                <div className="border border-gray-700 bg-black/40">
                                    <div className="bg-white/5 p-2 px-4 font-mono font-bold text-signal border-b border-gray-700 uppercase tracking-widest text-sm">
                                        PAYLOAD INFO
                                    </div>
                                    <table className="w-full">
                                        <tbody>
                                            <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                                                <td className="p-4 align-top w-1/3 border-r border-gray-800/30">
                                                    <div className="font-bold text-signal font-mono mb-1">filename</div>
                                                    <div className="text-xs text-gray-400">Output filename for the payload (e.g., agent.exe)</div>
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        type="text"
                                                        value={filename}
                                                        onChange={(e) => setFilename(e.target.value)}
                                                        placeholder={selectedPayloadType?.name || 'payload'}
                                                        className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                                    />
                                                </td>
                                            </tr>
                                            <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                                                <td className="p-4 align-top w-1/3 border-r border-gray-800/30">
                                                    <div className="font-bold text-signal font-mono mb-1">description</div>
                                                    <div className="text-xs text-gray-400">A description for this payload</div>
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        type="text"
                                                        value={description}
                                                        onChange={(e) => setDescription(e.target.value)}
                                                        className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                                    />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Grouped Build Parameters */}
                                {Object.entries(groupedBuildParams).map(([groupName, params]) => (
                                    <div key={groupName} className="border border-gray-700 bg-black/40">
                                        <div className="bg-white/5 p-2 px-4 font-mono font-bold text-signal border-b border-gray-700 uppercase tracking-widest text-sm">
                                            {groupName}
                                        </div>
                                        <table className="w-full">
                                            <tbody>
                                                {params.map(bp => (
                                                    <tr key={bp.id} className="border-b border-gray-800/50 hover:bg-white/5 transition-colors group">
                                                        <td className="p-4 align-top w-1/3 border-r border-gray-800/30">
                                                            <div className="font-bold text-signal font-mono mb-1 group-hover:text-white transition-colors">
                                                                {bp.name}
                                                            </div>
                                                            <div className="text-xs text-gray-400 leading-relaxed">{bp.description}</div>
                                                            {bp.required && (
                                                                <div className="text-[10px] text-red-400 mt-1 font-mono tracking-wider">* REQUIRED</div>
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            {bp.parameter_type === 'Boolean' ? (
                                                                <button
                                                                    onClick={() => setBuildParams({ ...buildParams, [bp.name]: !buildParams[bp.name] })}
                                                                    className={cn(
                                                                        "w-12 h-6 rounded-full p-1 transition-colors relative border",
                                                                        buildParams[bp.name] ? "bg-signal/[0.06] border-accent" : "bg-gray-900/50 border-gray-700"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_8px_white] transition-transform duration-300",
                                                                        buildParams[bp.name] ? "translate-x-6" : "translate-x-0"
                                                                    )} />
                                                                </button>
                                                            ) : bp.parameter_type === 'ChooseOne' && bp.choices ? (
                                                                <CyberDropdown
                                                                    value={buildParams[bp.name] || ''}
                                                                    onChange={(val) => setBuildParams({ ...buildParams, [bp.name]: val })}
                                                                    options={(typeof bp.choices === 'string' ? JSON.parse(bp.choices) : bp.choices).map((choice: string) => ({
                                                                        label: choice,
                                                                        value: choice
                                                                    }))}
                                                                    size="sm"
                                                                />
                                                            ) : bp.parameter_type === 'Number' ? (
                                                                <input
                                                                    type="number"
                                                                    value={buildParams[bp.name] || ''}
                                                                    onChange={(e) => setBuildParams({ ...buildParams, [bp.name]: Number(e.target.value) })}
                                                                    className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                                                />
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    value={buildParams[bp.name] || ''}
                                                                    onChange={(e) => setBuildParams({ ...buildParams, [bp.name]: e.target.value })}
                                                                    className="w-full bg-black/30 border border-gray-700 text-signal p-2 font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5"
                                                                />
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {/* Step 2: Commands with Tooltip - Fixed height with internal scroll */}
                        {currentStep === 2 && selectedPayloadType && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: getAnimDuration(0.3, isCombat) }}
                                className="flex flex-col h-full"
                            >
                                {/* Header with filter and actions */}
                                <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
                                    <div className="relative flex-1 w-full">
                                        <Search className="absolute left-3 top-2.5 text-ghost" size={18} />
                                        <input 
                                            type="text" 
                                            placeholder="FILTER_COMMANDS..." 
                                            value={commandFilter}
                                            onChange={(e) => setCommandFilter(e.target.value)}
                                            className="w-full bg-black/30 border border-ghost/30 py-2 pl-10 pr-4 text-signal font-mono text-sm focus:border-signal outline-none transition-colors focus:bg-white/5 rounded"
                                        />
                                    </div>
                                    <div className="flex gap-2 w-full md:w-auto">
                                        <motion.button 
                                            onClick={() => setSelectedCommands(filteredCommands.map(c => c.cmd))}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="flex-1 md:flex-none px-4 py-2 border border-matrix/50 bg-matrix/10 hover:bg-matrix/20 text-matrix text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 rounded"
                                        >
                                            <Check size={14} /> SELECT_VISIBLE
                                        </motion.button>
                                        <motion.button 
                                            onClick={() => {
                                                const visibleCmds = filteredCommands.map(c => c.cmd);
                                                setSelectedCommands(selectedCommands.filter(c => !visibleCmds.includes(c)));
                                            }}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="flex-1 md:flex-none px-4 py-2 border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 rounded"
                                        >
                                            <XCircle size={14} /> DESELECT_VISIBLE
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Commands Grid - Fixed height with internal scrolling */}
                                <div className="border border-ghost/30 bg-black/20 rounded-lg p-3 h-[400px] overflow-y-auto cyber-scrollbar">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                        {filteredCommands.map((cmd, index) => (
                                            <motion.button
                                                key={cmd.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: Math.min(index * 0.02, 0.5) }}
                                                onClick={() => {
                                                    if (selectedCommands.includes(cmd.cmd)) {
                                                        setSelectedCommands(selectedCommands.filter(c => c !== cmd.cmd));
                                                    } else {
                                                        setSelectedCommands([...selectedCommands, cmd.cmd]);
                                                    }
                                                }}
                                                onMouseEnter={(e) => handleCommandMouseEnter(e, cmd)}
                                                onMouseMove={handleCommandMouseMove}
                                                onMouseLeave={handleCommandMouseLeave}
                                                className={cn(
                                                    "flex items-start gap-3 p-3 text-left border transition-all duration-150 group relative overflow-hidden rounded",
                                                    selectedCommands.includes(cmd.cmd)
                                                        ? "border-signal bg-signal/10" 
                                                        : "border-ghost/20 hover:border-ghost/50 bg-black/20 hover:bg-white/5"
                                                )}
                                            >
                                                <div className={cn(
                                                    "mt-0.5 shrink-0 transition-colors",
                                                    selectedCommands.includes(cmd.cmd) ? "text-signal" : "text-ghost/50 group-hover:text-ghost"
                                                )}>
                                                    {selectedCommands.includes(cmd.cmd) ? <CheckCircle size={14} /> : <Box size={14} />}
                                                </div>
                                                <div className="overflow-hidden min-w-0 z-10">
                                                    <div className={cn(
                                                        "font-bold font-mono text-xs truncate transition-colors",
                                                        selectedCommands.includes(cmd.cmd) ? "text-signal" : "text-gray-300 group-hover:text-white"
                                                    )}>
                                                        {cmd.cmd}
                                                    </div>
                                                    {cmd.description && (
                                                        <div className="text-[10px] text-ghost/60 line-clamp-1 mt-0.5 leading-tight">
                                                            {cmd.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                                
                                {/* Footer stats */}
                                <div className="mt-3 text-xs font-mono text-ghost flex justify-between px-1 border-t border-ghost/20 pt-3">
                                    <span>TOTAL: {selectedPayloadType.commands.length}</span>
                                    <span>SELECTED: <span className="text-signal font-bold">{selectedCommands.length}</span></span>
                                </div>

                                {/* Tooltip */}
                                <AnimatePresence>
                                    {hoveredCommand && (
                                        <CommandTooltip cmd={hoveredCommand} position={tooltipPosition} isCombat={isCombat} />
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}

                        {/* Step 3: C2 Profiles - Select first, then ADD to show form */}
                        {currentStep === 3 && selectedPayloadType && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: getAnimDuration(0.3, isCombat) }}
                                className="space-y-6"
                            >
                                {/* Add Profile Section - Select first, then click ADD */}
                                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                                    <div className="flex flex-col md:flex-row gap-4 items-end">
                                        <div className="flex-1 w-full">
                                            <label className="block text-xs font-mono text-ghost mb-2 uppercase tracking-widest">
                                                SELECT_C2_PROFILE
                                            </label>
                                            <CyberDropdown
                                                value={selectedC2ToAdd}
                                                onChange={(val) => setSelectedC2ToAdd(val)}
                                                placeholder="-- SELECT_PROFILE --"
                                                options={selectedPayloadType.payloadtypec2profiles.map(({ c2profile }) => ({
                                                    label: `${c2profile.name} ${c2profile.is_p2p ? '(P2P)' : ''} - ${c2profile.description}`,
                                                    value: String(c2profile.id)
                                                }))}
                                            />
                                        </div>
                                        <motion.button 
                                            onClick={handleAddC2Profile}
                                            disabled={!selectedC2ToAdd}
                                            whileHover={{ scale: selectedC2ToAdd ? 1.02 : 1 }}
                                            whileTap={{ scale: selectedC2ToAdd ? 0.98 : 1 }}
                                            className={cn(
                                                "px-6 py-3 font-bold font-mono text-sm transition-all flex items-center gap-2 rounded border",
                                                selectedC2ToAdd 
                                                    ? "bg-signal text-void hover:bg-white border-transparent"
                                                    : "bg-ghost/20 text-ghost/50 cursor-not-allowed border-ghost/30"
                                            )}
                                        >
                                            <Plus size={16} /> ADD_PROFILE
                                        </motion.button>
                                    </div>
                                    
                                    {/* Show profile info when selected but not yet added */}
                                    <AnimatePresence>
                                        {selectedC2ToAdd && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-4 pt-4 border-t border-ghost/20"
                                            >
                                                {(() => {
                                                    const profile = selectedPayloadType.payloadtypec2profiles.find(
                                                        p => p.c2profile.id === parseInt(selectedC2ToAdd)
                                                    )?.c2profile;
                                                    if (!profile) return null;
                                                    return (
                                                        <div className="flex items-center gap-4 text-sm">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-signal font-mono font-bold">{profile.name}</span>
                                                                {profile.is_p2p && (
                                                                    <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 border border-yellow-400/30 font-mono rounded">
                                                                        P2P
                                                                    </span>
                                                                )}
                                                                <div className={cn(
                                                                    "flex items-center gap-1 text-xs",
                                                                    profile.running && profile.container_running ? "text-matrix" : "text-red-400"
                                                                )}>
                                                                    <span className={cn(
                                                                        "w-2 h-2 rounded-full",
                                                                        profile.running && profile.container_running ? "bg-matrix animate-pulse" : "bg-red-400"
                                                                    )} />
                                                                    {profile.running && profile.container_running ? "ONLINE" : "OFFLINE"}
                                                                </div>
                                                            </div>
                                                            <span className="text-ghost text-xs">|</span>
                                                            <span className="text-ghost text-xs">{profile.c2profileparameters.length} parameters</span>
                                                            <span className="text-ghost/60 text-xs flex-1">{profile.description}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Configured Profiles - Show forms after ADD */}
                                {c2ProfileInstances.length === 0 ? (
                                    <div className="text-center py-16 border border-dashed border-ghost/30 rounded-lg text-ghost font-mono">
                                        <Radio size={48} className="mx-auto mb-4 opacity-30" />
                                        <p>NO_C2_PROFILES_CONFIGURED</p>
                                        <p className="text-xs text-ghost/50 mt-2">Select a profile above and click ADD_PROFILE</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-[450px] overflow-y-auto cyber-scrollbar pr-2">
                                        {c2ProfileInstances.map((instance, idx) => (
                                            <motion.div 
                                                key={instance.instance_id} 
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="border border-ghost/30 bg-black/30 rounded-lg overflow-hidden"
                                            >
                                                {/* Profile Header */}
                                                <div className="bg-signal/5 p-4 flex justify-between items-center border-b border-ghost/30">
                                                    <div className="flex items-center gap-3">
                                                        <Radio size={18} className="text-signal" />
                                                        <span className="text-signal font-bold font-mono text-lg">{instance.profile.name}</span>
                                                        <span className="text-xs text-ghost font-mono bg-black/30 px-2 py-1 rounded">Instance #{idx + 1}</span>
                                                        {instance.profile.is_p2p && (
                                                            <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 border border-yellow-400/30 font-mono rounded">
                                                                P2P
                                                            </span>
                                                        )}
                                                        <div className={cn(
                                                            "flex items-center gap-1 text-xs",
                                                            instance.profile.running && instance.profile.container_running ? "text-matrix" : "text-red-400"
                                                        )}>
                                                            <span className={cn(
                                                                "w-2 h-2 rounded-full",
                                                                instance.profile.running && instance.profile.container_running ? "bg-matrix animate-pulse" : "bg-red-400"
                                                            )} />
                                                            {instance.profile.running && instance.profile.container_running ? "ONLINE" : "OFFLINE"}
                                                        </div>
                                                    </div>
                                                    <motion.button 
                                                        onClick={() => removeC2ProfileInstance(instance.instance_id)}
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.9 }}
                                                        className="text-ghost hover:text-red-500 transition-colors p-2"
                                                    >
                                                        <XCircle size={20} />
                                                    </motion.button>
                                                </div>
                                                
                                                {/* Profile Parameters Table */}
                                                <div className="p-4">
                                                    <table className="w-full">
                                                        <tbody>
                                                            {instance.profile.c2profileparameters.map(param => (
                                                                <tr key={param.id} className="border-b border-ghost/10 hover:bg-white/5 transition-colors">
                                                                    <td className="p-3 align-top w-1/3 border-r border-ghost/10">
                                                                        <div className="font-bold text-signal font-mono text-sm mb-1">{param.name}</div>
                                                                        <div className="text-xs text-ghost/60">{param.description}</div>
                                                                        {param.required && (
                                                                            <div className="text-[10px] text-red-400 mt-1 font-mono">* REQUIRED</div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-3">
                                                                        {param.parameter_type === 'Boolean' ? (
                                                                            <button
                                                                                onClick={() => updateC2InstanceParam(instance.instance_id, param.name, !instance.parameters[param.name])}
                                                                                className={cn(
                                                                                    "w-14 h-7 rounded-full p-1 transition-colors relative border",
                                                                                    instance.parameters[param.name] ? "bg-matrix/30 border-matrix" : "bg-ghost/20 border-ghost/30"
                                                                                )}
                                                                            >
                                                                                <div className={cn(
                                                                                    "w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-transform duration-300",
                                                                                    instance.parameters[param.name] ? "translate-x-7" : "translate-x-0"
                                                                                )} />
                                                                            </button>
                                                                        ) : param.parameter_type === 'ChooseOne' && param.choices ? (
                                                                            <CyberDropdown
                                                                                value={String(instance.parameters[param.name] ?? '')}
                                                                                onChange={(val) => updateC2InstanceParam(instance.instance_id, param.name, val)}
                                                                                options={(typeof param.choices === 'string' ? JSON.parse(param.choices) : param.choices).map((choice: string) => ({
                                                                                    label: choice,
                                                                                    value: choice
                                                                                }))}
                                                                                size="sm"
                                                                            />
                                                                        ) : param.parameter_type === 'Dictionary' ? (
                                                                            <textarea
                                                                                value={typeof instance.parameters[param.name] === 'string'
                                                                                    ? instance.parameters[param.name] as string
                                                                                    : JSON.stringify(instance.parameters[param.name], null, 2)}
                                                                                onChange={(e) => updateC2InstanceParam(instance.instance_id, param.name, e.target.value)}
                                                                                className="w-full bg-black/50 border border-ghost/30 text-signal p-2 font-mono text-xs focus:border-signal outline-none min-h-[100px] rounded"
                                                                            />
                                                                        ) : param.parameter_type === 'Date' ? (
                                                                            <input
                                                                                type="date"
                                                                                value={String(instance.parameters[param.name] ?? '')}
                                                                                onChange={(e) => updateC2InstanceParam(instance.instance_id, param.name, e.target.value)}
                                                                                className="bg-black/50 border border-ghost/30 text-signal p-2 font-mono text-sm focus:border-signal outline-none rounded"
                                                                            />
                                                                        ) : param.parameter_type === 'Number' ? (
                                                                            <input
                                                                                type="number"
                                                                                value={String(instance.parameters[param.name] ?? '')}
                                                                                onChange={(e) => updateC2InstanceParam(instance.instance_id, param.name, Number(e.target.value))}
                                                                                className="w-full bg-black/50 border border-ghost/30 text-signal p-2 font-mono text-sm focus:border-signal outline-none rounded"
                                                                            />
                                                                        ) : (
                                                                            <input
                                                                                type="text"
                                                                                value={String(instance.parameters[param.name] ?? '')}
                                                                                onChange={(e) => updateC2InstanceParam(instance.instance_id, param.name, e.target.value)}
                                                                                className="w-full bg-black/50 border border-ghost/30 text-signal p-2 font-mono text-sm focus:border-signal outline-none rounded"
                                                                            />
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Step 4: Build - Detailed Summary */}
                        {currentStep === 4 && selectedPayloadType && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: getAnimDuration(0.3, isCombat) }}
                                className="space-y-6"
                            >
                                {/* Header */}
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-signal/10 border border-signal/30 rounded">
                                        <FileText size={20} className="text-signal" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-mono text-signal font-bold tracking-widest">BUILD_SUMMARY</h3>
                                        <p className="text-xs text-ghost">Review configuration before initiating build sequence</p>
                                    </div>
                                </div>

                                {/* Two Column Layout */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left Column */}
                                    <div className="space-y-4">
                                        {/* Core Configuration */}
                                        <div className="border border-ghost/30 rounded-lg overflow-hidden bg-black/30">
                                            <div className="bg-signal/5 p-3 border-b border-ghost/30">
                                                <h4 className="text-sm font-mono text-signal font-bold tracking-widest flex items-center gap-2">
                                                    <Settings size={14} /> CORE_CONFIGURATION
                                                </h4>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <div className="flex justify-between items-center py-2 border-b border-ghost/10">
                                                    <span className="text-xs text-ghost uppercase tracking-widest">TARGET_OS</span>
                                                    <span className="text-signal font-mono font-bold">{selectedOS}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-ghost/10">
                                                    <span className="text-xs text-ghost uppercase tracking-widest">PAYLOAD_TYPE</span>
                                                    <span className="text-signal font-mono font-bold">{selectedPayloadType.name}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-ghost/10">
                                                    <span className="text-xs text-ghost uppercase tracking-widest">VERSION</span>
                                                    <span className="text-white font-mono">v{selectedPayloadType.semver}</span>
                                                </div>
                                                <div className="flex justify-between items-start py-2 border-b border-ghost/10">
                                                    <span className="text-xs text-ghost uppercase tracking-widest">FILENAME</span>
                                                    <span className="text-white font-mono text-right max-w-[200px] truncate">
                                                        {filename || buildParams['output'] || buildParams['output_type'] || buildParams['filename'] || selectedPayloadType.name}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-start py-2">
                                                    <span className="text-xs text-ghost uppercase tracking-widest">DESCRIPTION</span>
                                                    <span className="text-white/80 text-xs text-right max-w-[200px]">{description}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Build Parameters */}
                                        <div className="border border-ghost/30 rounded-lg overflow-hidden bg-black/30">
                                            <div className="bg-signal/5 p-3 border-b border-ghost/30">
                                                <h4 className="text-sm font-mono text-signal font-bold tracking-widest flex items-center gap-2">
                                                    <Sliders size={14} /> BUILD_PARAMETERS
                                                </h4>
                                            </div>
                                            <div className="p-4 max-h-[300px] overflow-y-auto cyber-scrollbar">
                                                <div className="space-y-2">
                                                    {selectedPayloadType.buildparameters.map(bp => (
                                                        <div key={bp.id} className="flex justify-between items-center py-2 border-b border-ghost/10 last:border-0">
                                                            <span className="text-xs text-ghost font-mono">{bp.name}</span>
                                                            <span className={cn(
                                                                "font-mono text-xs text-right max-w-[200px] truncate",
                                                                bp.parameter_type === 'Boolean' 
                                                                    ? buildParams[bp.name] ? "text-matrix" : "text-ghost/50"
                                                                    : "text-white"
                                                            )}>
                                                                {bp.parameter_type === 'Boolean' 
                                                                    ? (buildParams[bp.name] ? 'TRUE' : 'FALSE')
                                                                    : String(buildParams[bp.name] ?? bp.default_value)
                                                                }
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div className="space-y-4">
                                        {/* C2 Channels */}
                                        <div className="border border-ghost/30 rounded-lg overflow-hidden bg-black/30">
                                            <div className="bg-signal/5 p-3 border-b border-ghost/30">
                                                <h4 className="text-sm font-mono text-signal font-bold tracking-widest flex items-center gap-2">
                                                    <Radio size={14} /> C2_CHANNELS
                                                    <span className="text-xs text-ghost ml-auto font-normal">{c2ProfileInstances.length} configured</span>
                                                </h4>
                                            </div>
                                            <div className="p-4 max-h-[250px] overflow-y-auto cyber-scrollbar">
                                                {c2ProfileInstances.length === 0 ? (
                                                    <div className="text-center text-ghost/50 font-mono text-xs py-4">
                                                        NO_C2_PROFILES
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {c2ProfileInstances.map((inst, idx) => (
                                                            <div key={inst.instance_id} className="border-b border-ghost/10 pb-3 last:border-0 last:pb-0">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="text-signal font-mono font-bold text-sm">{inst.profile.name}</span>
                                                                    <span className="text-[10px] text-ghost bg-ghost/10 px-1.5 py-0.5 rounded">#{idx + 1}</span>
                                                                    {inst.profile.is_p2p && (
                                                                        <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">P2P</span>
                                                                    )}
                                                                </div>
                                                                <div className="space-y-1 pl-2 border-l-2 border-signal/30">
                                                                    {Object.entries(inst.parameters).slice(0, 5).map(([key, value]) => (
                                                                        <div key={key} className="flex justify-between text-[10px]">
                                                                            <span className="text-ghost font-mono">{key}</span>
                                                                            <span className="text-white/80 font-mono truncate max-w-[150px]">
                                                                                {typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                    {Object.keys(inst.parameters).length > 5 && (
                                                                        <div className="text-[10px] text-ghost/50 font-mono">
                                                                            +{Object.keys(inst.parameters).length - 5} more parameters...
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Commands */}
                                        <div className="border border-ghost/30 rounded-lg overflow-hidden bg-black/30">
                                            <div className="bg-signal/5 p-3 border-b border-ghost/30">
                                                <h4 className="text-sm font-mono text-signal font-bold tracking-widest flex items-center gap-2">
                                                    <Terminal size={14} /> COMMANDS
                                                    <span className="text-xs text-ghost ml-auto font-normal">{selectedCommands.length} selected</span>
                                                </h4>
                                            </div>
                                            <div className="p-4 max-h-[200px] overflow-y-auto cyber-scrollbar">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {selectedCommands.map(cmd => (
                                                        <motion.span 
                                                            key={cmd}
                                                            initial={{ opacity: 0, scale: 0.9 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            className="text-[10px] bg-signal/10 text-signal border border-signal/30 px-2 py-1 font-mono rounded hover:bg-signal/20 transition-colors"
                                                        >
                                                            {cmd}
                                                        </motion.span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Build Result */}
                                <AnimatePresence>
                                    {buildResult && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className={cn(
                                                "p-4 border rounded-lg",
                                                buildResult.status === 'success'
                                                    ? "bg-matrix/10 border-matrix/30 text-matrix"
                                                    : "bg-red-400/10 border-red-400/30 text-red-400"
                                            )}
                                        >
                                            {buildResult.status === 'success' ? (
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle size={24} />
                                                    <div>
                                                        <div className="font-mono font-bold">BUILD_INITIATED</div>
                                                        <div className="text-xs opacity-80">UUID: {buildResult.uuid}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <XCircle size={24} />
                                                    <div>
                                                        <div className="font-mono font-bold">BUILD_FAILED</div>
                                                        <div className="text-xs opacity-80">{buildResult.error}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Build Button */}
                                <motion.button
                                    onClick={handleBuild}
                                    disabled={building || buildResult?.status === 'success'}
                                    whileHover={{ scale: building || buildResult?.status === 'success' ? 1 : 1.01 }}
                                    whileTap={{ scale: building || buildResult?.status === 'success' ? 1 : 0.99 }}
                                    className={cn(
                                        "w-full py-4 font-mono font-bold transition-all flex items-center justify-center gap-3 rounded-lg text-lg tracking-widest",
                                        building || buildResult?.status === 'success'
                                            ? "bg-ghost/20 text-ghost/50 cursor-not-allowed border border-ghost/30"
                                            : "bg-gradient-to-r from-signal to-signal/80 text-void hover:from-white hover:to-signal hover:shadow-[0_0_30px_rgba(0,255,255,0.4)] border border-transparent"
                                    )}
                                >
                                    {building ? (
                                        <>
                                            <Loader2 className="animate-spin" size={24} />
                                            BUILDING_PAYLOAD...
                                        </>
                                    ) : buildResult?.status === 'success' ? (
                                        <>
                                            <CheckCircle size={24} />
                                            BUILD_INITIATED
                                        </>
                                    ) : (
                                        <>
                                            <Disc size={24} />
                                            INITIATE_BUILD_SEQUENCE
                                        </>
                                    )}
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Controls - Matching CreateWrapper style */}
                <div className="p-4 border-t border-ghost/30 flex justify-between items-center bg-black/30">
                    <motion.button
                        onClick={() => currentStep === 0 ? onComplete() : setCurrentStep(currentStep - 1)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="px-6 py-2.5 border border-ghost/30 text-ghost rounded-lg font-mono text-sm hover:text-signal hover:border-signal transition-all flex items-center gap-2"
                    >
                        <ChevronLeft size={16} />
                        {currentStep === 0 ? 'CANCEL' : 'BACK'}
                    </motion.button>
                    
                    {currentStep < PAYLOAD_STEPS.length - 1 && (
                        <motion.button
                            onClick={() => {
                                // Branch off the Mythic wizard when MSF was chosen on Step 0.
                                if (currentStep === 0 && createSource === 'msf' && selectedOS) {
                                    setShowMsfEmbed(true);
                                } else {
                                    setCurrentStep(currentStep + 1);
                                }
                            }}
                            disabled={!canProceed()}
                            whileHover={{ scale: canProceed() ? 1.02 : 1 }}
                            whileTap={{ scale: canProceed() ? 0.98 : 1 }}
                            className="px-8 py-2.5 bg-signal text-void font-bold rounded-lg font-mono text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                        >
                            NEXT <ChevronRight size={16} />
                        </motion.button>
                    )}
                    
                    {currentStep === PAYLOAD_STEPS.length - 1 && buildResult?.status === 'success' && (
                        <motion.button
                            onClick={onComplete}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="px-8 py-2.5 bg-matrix text-void font-bold rounded-lg font-mono text-sm hover:bg-matrix/80 transition-all flex items-center gap-2"
                        >
                            <CheckCircle size={16} />
                            DONE
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================
// Create Wrapper Embed Component
// ============================================
export const CreateWrapperEmbed: React.FC<{
    onComplete: () => void;
}> = ({ onComplete }) => {
    return <CreateWrapperWizard embedded={true} onComplete={onComplete} />;
};

// ============================================
// Main Payloads Overview Page
// ============================================
