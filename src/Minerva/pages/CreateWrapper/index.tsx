import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMutation, useLazyQuery } from "@apollo/client/react";
import { useQueryCompat as useQuery } from "../../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { UploadTaskFile } from '../../components/MythicFileUpload';
import {
    Package, ChevronRight, ChevronLeft, Check, Loader, AlertCircle,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';
import { snackActions } from '../../lib/snackbar';
import { meState } from '../../lib/state';
import { useReactiveVar } from "@apollo/client/react";
import {
    GET_WRAPPER_PAYLOAD_TYPES, GET_WRAPPABLE_BY_TYPE, GET_EXISTING_WRAPPERS,
    CREATE_WRAPPER,
} from '../../lib/api';
import type { PayloadType, Payload, ExistingWrapper } from './createWrapper.types';
import { decodeFilename } from './createWrapper.utils';
import { StepIndicator } from './SharedComponents';
import { Step1SelectWrapper } from './Step1SelectWrapper';
import { Step2SelectPayload } from './Step2SelectPayload';
import { Step3Configure } from './Step3Configure';
import { Step4Build } from './Step4Build';

// ============================================================
// Main Wizard
// ============================================================
export function CreateWrapperWizard({
    embedded = false,
    onComplete,
}: {
    embedded?: boolean;
    onComplete?: (uuid?: string) => void;
}) {
    const navigate = useNavigate();
    const { isSidebarCollapsed } = useAppStore();
    const me = useReactiveVar(meState);

    const [currentStep, setCurrentStep] = useState(0);
    const [selectedWrapper, setSelectedWrapper] = useState<PayloadType | null>(null);
    const [selectedPayload, setSelectedPayload] = useState<Payload | null>(null);
    const [buildParameters, setBuildParameters] = useState<Record<string, unknown>>({});
    const [description, setDescription] = useState('');
    const [filename, setFilename] = useState('');
    const [building, setBuilding] = useState(false);
    const [buildUUID, setBuildUUID] = useState<string | null>(null);
    const buildFromNowRef = useRef(new Date().toISOString());

    // Fetch wrapper types
    const { data: wrapperData, loading: loadingWrappers } = useQuery<any>(GET_WRAPPER_PAYLOAD_TYPES, {
        fetchPolicy: 'cache-and-network',
    });
    const wrapperTypes: PayloadType[] = wrapperData?.payloadtype || [];

    // Fetch existing wrappers (used in Step1 "copy from")
    const { data: existingData, loading: loadingExisting } = useQuery<any>(GET_EXISTING_WRAPPERS, {
        fetchPolicy: 'cache-and-network',
    });
    const existingWrappers: ExistingWrapper[] = existingData?.payload || [];

    // Lazy query for wrappable payloads — triggered when a wrapper type is selected
    const [fetchWrappable, { data: wrappableData, loading: loadingWrappable }] = useLazyQuery<any>(
        GET_WRAPPABLE_BY_TYPE,
        { fetchPolicy: 'network-only' }
    );

    const wrappablePayloads: Payload[] = useMemo(() => {
        if (!wrappableData?.payloadtype_by_pk) return [];
        const options: Payload[] = [];
        for (const item of (wrappableData.payloadtype_by_pk.wrap_these_payload_types || [])) {
            for (const p of (item.wrapped.payloads || [])) {
                options.push(p);
            }
        }
        return options.sort((a, b) => b.id - a.id);
    }, [wrappableData]);

    // Trigger wrappable query when wrapper type changes
    useEffect(() => {
        if (selectedWrapper) {
            fetchWrappable({ variables: { payloadTypeId: selectedWrapper.id } });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWrapper?.id]);

    // Auto-populate filename when wrapper type changes
    useEffect(() => {
        if (selectedWrapper) {
            const ext = selectedWrapper.file_extension;
            setFilename(ext ? `${selectedWrapper.name}.${ext}` : selectedWrapper.name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWrapper?.id]);

    // Create wrapper mutation
    const [createWrapper] = useMutation<any>(CREATE_WRAPPER, {
        onCompleted: (data: any) => {
            setBuilding(false);
            if (data.createPayload.status === 'success') {
                setBuildUUID(data.createPayload.uuid);
                snackActions.info('Build submitted — watching progress…');
            } else {
                snackActions.error('Failed to create wrapper: ' + data.createPayload.error);
            }
        },
        onError: (error) => {
            setBuilding(false);
            snackActions.error('Failed to create wrapper: ' + error.message);
        },
    });

    const steps = ['Select Wrapper', 'Select Payload', 'Configure', 'Build'];

    const noOperation = (me?.user?.current_operation_id || 0) === 0;

    const handleNext = () => { if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1); };
    const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

    const canJumpTo = (idx: number): boolean => {
        if (idx < currentStep) return true;  // always allow back
        if (idx === currentStep) return false; // no-op
        if (idx === 1 && selectedWrapper !== null) return true;
        if (idx === 2 && selectedWrapper !== null && selectedPayload !== null) return true;
        if (idx === 3 && selectedWrapper !== null && selectedPayload !== null) return true;
        return false;
    };

    const handleStartOver = () => {
        setCurrentStep(0);
        setSelectedWrapper(null);
        setSelectedPayload(null);
        setBuildParameters({});
        setDescription('');
        setFilename('');
        setBuilding(false);
        setBuildUUID(null);
        buildFromNowRef.current = new Date().toISOString();
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0: return selectedWrapper !== null;
            case 1: return selectedPayload !== null;
            default: return true;
        }
    };

    // Determine selected_os: prefer intersection of wrapper and payload OS
    const computedOS = useMemo(() => {
        if (!selectedWrapper || !selectedPayload) return '';
        const intersection = selectedWrapper.supported_os.filter(
            os => selectedPayload.payloadtype.supported_os.includes(os)
        );
        return intersection.length > 0 ? intersection[0] : selectedWrapper.supported_os[0];
    }, [selectedWrapper, selectedPayload]);

    // Async build — handles File / FileMultiple uploads first
    const handleBuild = async () => {
        if (!selectedWrapper || !selectedPayload) return;
        setBuilding(true);
        buildFromNowRef.current = new Date().toISOString();

        const resolvedParams: Array<{ name: string; value: any }> = [];
        for (const bp of selectedWrapper.buildparameters) {
            const val = buildParameters[bp.name] ?? bp.default_value;
            if (bp.parameter_type === 'File') {
                if (val instanceof File) {
                    const uuid = await UploadTaskFile(val, `Build param ${bp.name} for ${filename}`);
                    if (!uuid) {
                        snackActions.error(`Failed to upload file for parameter: ${bp.name}`);
                        setBuilding(false);
                        return;
                    }
                    resolvedParams.push({ name: bp.name, value: uuid });
                } else {
                    resolvedParams.push({ name: bp.name, value: val || '' });
                }
            } else if (bp.parameter_type === 'FileMultiple') {
                const files: any[] = Array.isArray(val) ? val : [];
                const uuids: string[] = [];
                for (const f of files) {
                    if (f instanceof File) {
                        const uuid = await UploadTaskFile(f, `Build param ${bp.name} for ${filename}`);
                        if (!uuid) {
                            snackActions.error(`Failed to upload file for parameter: ${bp.name}`);
                            setBuilding(false);
                            return;
                        }
                        uuids.push(uuid);
                    } else {
                        uuids.push(String(f));
                    }
                }
                resolvedParams.push({ name: bp.name, value: uuids });
            } else if (bp.parameter_type === 'Dictionary') {
                // Dictionary: convert [{name, value}] → {key: value}
                const entries: { name: string; value: string }[] = Array.isArray(val) ? val : [];
                const obj: Record<string, string> = {};
                for (const e of entries) obj[e.name] = e.value;
                resolvedParams.push({ name: bp.name, value: obj });
            } else if (bp.parameter_type === 'MapArray') {
                // MapArray: convert [[key, vals[]]] → {key: vals[]}
                const entries: [string, string[]][] = Array.isArray(val) ? val : [];
                const obj: Record<string, string[]> = {};
                for (const [k, v] of entries) obj[k] = v;
                resolvedParams.push({ name: bp.name, value: obj });
            } else if (['Array', 'ChooseMultiple', 'TypedArray'].includes(bp.parameter_type)) {
                // Ensure Array-type values are proper JS arrays (not raw JSON strings from default_value)
                let arrVal: any[];
                if (Array.isArray(val)) {
                    arrVal = val;
                } else if (typeof val === 'string' && val !== '') {
                    try { const parsed = JSON.parse(val); arrVal = Array.isArray(parsed) ? parsed : []; } catch { arrVal = []; }
                } else {
                    arrVal = [];
                }
                resolvedParams.push({ name: bp.name, value: arrVal });
            } else if (bp.parameter_type === 'Boolean') {
                // Ensure Boolean values are actual booleans, not strings
                const boolVal = val === true || val === 'true';
                resolvedParams.push({ name: bp.name, value: boolVal });
            } else if (bp.parameter_type === 'Number') {
                resolvedParams.push({ name: bp.name, value: Number(val) || 0 });
            } else {
                resolvedParams.push({ name: bp.name, value: val });
            }
        }

        const wrappedFname = decodeFilename(selectedPayload.filemetum?.filename_text) || selectedPayload.uuid;
        const payloadDef = {
            selected_os: computedOS,
            payload_type: selectedWrapper.name,
            filename: filename || selectedWrapper.name,
            description: description || `Wrapped ${wrappedFname}`,
            commands: [],
            build_parameters: resolvedParams,
            wrapped_payload: selectedPayload.uuid,
            wrapper: true,
            c2_profiles: [],
        };

        createWrapper({ variables: { payload: JSON.stringify(payloadDef) } });
    };

    // Handle copying settings from an existing wrapper payload
    const handleCopyExisting = (existing: ExistingWrapper) => {
        const matchingType = wrapperTypes.find(wt => wt.id === existing.payloadtype.id);
        if (!matchingType) {
            snackActions.warning('Could not find matching wrapper type');
            return;
        }
        if (!selectedWrapper || selectedWrapper.id !== matchingType.id) {
            setSelectedPayload(null);
            setBuildParameters({});
        }
        setSelectedWrapper(matchingType);
        const newParams: Record<string, unknown> = {};
        for (const bpi of existing.buildparameterinstances) {
            const bp = matchingType.buildparameters.find(p => p.id === bpi.build_parameter_id);
            if (bp) newParams[bp.name] = bpi.value;
        }
        setBuildParameters(newParams);
        snackActions.success('Loaded settings from existing wrapper — select a payload to continue');
        setCurrentStep(1);
    };

    // Item 9: onComplete receives UUID and navigates to payloads page
    const handleComplete = useCallback((uuid: string) => {
        if (onComplete) {
            onComplete(uuid);
        } else {
            navigate('/new/payloads');
            snackActions.info(`Wrapper ${uuid.slice(0, 8)}… built. Find it in the Payloads list.`);
        }
    }, [onComplete, navigate]);

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return (
                    <Step1SelectWrapper
                        wrapperTypes={wrapperTypes}
                        selected={selectedWrapper}
                        onSelect={(pt) => {
                            if (selectedWrapper && selectedWrapper.id !== pt.id) {
                                setSelectedPayload(null);
                                setBuildParameters({});
                            }
                            setSelectedWrapper(pt);
                        }}
                        existingWrappers={existingWrappers}
                        loadingExisting={loadingExisting}
                        onCopyExisting={handleCopyExisting}
                    />
                );
            case 1:
                return (
                    <Step2SelectPayload
                        payloads={wrappablePayloads}
                        loading={loadingWrappable}
                        wrapperType={selectedWrapper}
                        selected={selectedPayload}
                        onSelect={(p) => setSelectedPayload(p)}
                        onEditWrapper={() => setCurrentStep(0)}
                    />
                );
            case 2:
                return (
                    <Step3Configure
                        wrapperType={selectedWrapper}
                        selectedOS={computedOS}
                        parameters={buildParameters}
                        setParameters={setBuildParameters}
                        description={description}
                        setDescription={setDescription}
                        filename={filename}
                        setFilename={setFilename}
                        onEditWrapper={() => setCurrentStep(0)}
                        onEditPayload={() => setCurrentStep(1)}
                    />
                );
            case 3:
                return (
                    <Step4Build
                        wrapperType={selectedWrapper}
                        wrappedPayload={selectedPayload}
                        parameters={buildParameters}
                        description={description}
                        filename={filename}
                        selectedOS={computedOS}
                        onBuild={handleBuild}
                        building={building}
                        buildUUID={buildUUID}
                        buildFromNow={buildFromNowRef.current}
                        onEditWrapper={() => setCurrentStep(0)}
                        onEditPayload={() => setCurrentStep(1)}
                        onEditConfigure={() => setCurrentStep(2)}
                        onStartOver={handleStartOver}
                        onComplete={handleComplete}
                        onFilenameChange={(v) => setFilename(v)}
                    />
                );
            default:
                return null;
        }
    };

    if (noOperation) {
        if (embedded) {
            return (
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <AlertCircle size={48} className="mx-auto mb-4 text-alert" />
                        <h1 className="text-2xl font-bold text-alert mb-2">No Operation Selected</h1>
                        <p className="text-ghost">Please select a current operation to create wrappers</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="min-h-screen bg-void text-signal">
                <div className={cn("transition-all duration-300 p-6 flex items-center justify-center", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                    <div className="text-center">
                        <AlertCircle size={48} className="mx-auto mb-4 text-alert" />
                        <h1 className="text-2xl font-bold text-alert mb-2">No Operation Selected</h1>
                        <p className="text-ghost">Please select a current operation to create wrappers</p>
                    </div>
                </div>
            </div>
        );
    }

    // Embedded mode — no Sidebar
    if (embedded) {
        return (
            <div className="flex-1 flex flex-col overflow-auto p-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Package className="text-signal" size={24} />
                        <h2 className="text-xl font-bold tracking-wider">CREATE WRAPPER</h2>
                    </div>
                    <p className="text-ghost text-sm">Wrap an existing payload with a container</p>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-between mb-6 border-b border-ghost/30 pb-4">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step}>
                            <div className={cn("flex items-center gap-2", idx <= currentStep ? "text-signal" : canJumpTo(idx) ? "text-signal/60" : "text-ghost/50")}>
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border",
                                        idx < currentStep ? "bg-matrix border-matrix text-void cursor-pointer hover:bg-matrix/80" :
                                        idx === currentStep ? "border-signal text-signal" :
                                        canJumpTo(idx) ? "border-signal/50 text-signal/60 cursor-pointer hover:bg-signal/10 hover:border-signal" :
                                        "border-ghost/30"
                                    )}
                                    onClick={() => canJumpTo(idx) && setCurrentStep(idx)}
                                >
                                    {idx < currentStep ? <Check size={14} /> : idx + 1}
                                </div>
                                <span className="text-xs font-medium hidden sm:inline">{step}</span>
                            </div>
                            {idx < steps.length - 1 && (
                                <div className={cn("flex-1 h-0.5 mx-2", idx < currentStep ? "bg-matrix" : "bg-ghost/30")} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Loading */}
                {loadingWrappers && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading...</span>
                    </div>
                )}

                {/* Step Content */}
                {!loadingWrappers && (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="mb-8 flex-1"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                )}

                {/* Navigation */}
                {!loadingWrappers && currentStep < 3 && (
                    <div className="flex justify-between pt-4 border-t border-ghost/20">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ChevronLeft size={16} /> Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Full-page mode with Sidebar
    return (
        <div className="min-h-screen bg-void text-signal">
            <div className={cn("transition-all duration-300 p-6", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 border border-white/50 bg-white/10 rounded">
                            <Package size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">CREATE WRAPPER</h1>
                            <p className="text-xs text-gray-300 font-mono flex items-center gap-2 uppercase tracking-[0.2em]">
                                <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />
                                PAYLOAD WRAPPER
                            </p>
                        </div>
                    </div>
                </header>

                {/* Step Indicator */}
                <div className="flex items-center justify-between mb-8 border-b border-ghost/30 pb-4">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step}>
                            <StepIndicator
                                step={idx}
                                currentStep={currentStep}
                                label={step}
                                onClick={canJumpTo(idx) ? () => setCurrentStep(idx) : undefined}
                            />
                            {idx < steps.length - 1 && (
                                <div className={cn("flex-1 h-0.5 mx-2", idx < currentStep ? "bg-matrix" : "bg-ghost/30")} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Loading */}
                {loadingWrappers && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading...</span>
                    </div>
                )}

                {/* Step Content */}
                {!loadingWrappers && (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="mb-8"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                )}

                {/* Navigation */}
                {!loadingWrappers && currentStep < 3 && (
                    <div className="flex justify-between">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="px-6 py-2 border border-ghost/30 rounded-lg text-ghost hover:text-signal hover:border-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ChevronLeft size={20} /> Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-6 py-2 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Next <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Default export for standalone route
export default function CreateWrapper() {
    return <CreateWrapperWizard embedded={false} />;
}
