import React, { useState, useMemo } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
    Package, 
    ChevronRight, 
    ChevronLeft, 
    Check, 
    Box,
    Loader,
    AlertCircle,
    X
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';
import { snackActions } from '../../../Archive/components/utilities/Snackbar';
import { meState } from '../../../cache';
import { useReactiveVar } from '@apollo/client';

// GraphQL Queries
const GET_WRAPPER_PAYLOAD_TYPES = gql`
query GetWrapperPayloadTypes {
    payloadtype(where: {deleted: {_eq: false}, wrapper: {_eq: true}}) {
        id
        name
        supported_os
        description
        author
        container_running
        buildparameters(where: {deleted: {_eq: false}}) {
            id
            name
            description
            parameter_type
            default_value
            required
            choices
        }
    }
}
`;

const GET_WRAPPABLE_PAYLOADS = gql`
query GetWrappablePayloads {
    payload(where: {deleted: {_eq: false}, build_phase: {_eq: "success"}}, order_by: {id: desc}) {
        id
        uuid
        description
        build_phase
        creation_time
        tag
        payloadtype {
            id
            name
            supported_os
        }
        filemetum {
            filename_text
        }
        c2profileparametersinstances {
            c2profile {
                name
            }
        }
    }
}
`;

const CREATE_WRAPPER = gql`
mutation createPayload($payload: String!) {
    createPayload(payloadDefinition: $payload) {
        error
        status
        uuid
    }
}
`;

interface PayloadType {
    id: number;
    name: string;
    supported_os: string[];
    description: string;
    author: string;
    container_running: boolean;
    buildparameters: Array<{
        id: number;
        name: string;
        description: string;
        parameter_type: string;
        default_value: any;
        required: boolean;
        choices: string[];
    }>;
}

interface Payload {
    id: number;
    uuid: string;
    description: string;
    build_phase: string;
    creation_time: string;
    tag: string;
    payloadtype: {
        id: number;
        name: string;
        supported_os: string[];
    };
    filemetum: {
        filename_text: string;
    };
    c2profileparametersinstances: Array<{
        c2profile: {
            name: string;
        };
    }>;
}

// Step components
const StepIndicator: React.FC<{
    step: number;
    currentStep: number;
    label: string;
}> = ({ step, currentStep, label }) => {
    const isActive = step === currentStep;
    const isCompleted = step < currentStep;

    return (
        <div className="flex items-center">
            <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                isCompleted ? "bg-matrix border-matrix text-void" :
                isActive ? "border-signal text-signal" :
                "border-ghost/30 text-ghost"
            )}>
                {isCompleted ? <Check size={20} /> : step + 1}
            </div>
            <span className={cn(
                "ml-2 text-sm hidden md:block",
                isActive ? "text-signal font-bold" : "text-ghost"
            )}>
                {label}
            </span>
        </div>
    );
};

// Step 1: Select Wrapper Type
const Step1SelectWrapper: React.FC<{
    wrapperTypes: PayloadType[];
    selected: PayloadType | null;
    onSelect: (pt: PayloadType) => void;
}> = ({ wrapperTypes, selected, onSelect }) => {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">SELECT WRAPPER TYPE</h2>
            <p className="text-ghost mb-6">Choose the wrapper payload type that will contain your existing payload</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wrapperTypes.map(pt => (
                    <motion.div
                        key={pt.id}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => onSelect(pt)}
                        className={cn(
                            "p-4 border rounded-lg cursor-pointer transition-all",
                            selected?.id === pt.id
                                ? "border-signal bg-signal/10"
                                : "border-ghost/30 hover:border-signal/50"
                        )}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-signal">{pt.name}</h3>
                            {!pt.container_running && (
                                <AlertCircle className="text-alert" size={18} />
                            )}
                        </div>
                        <p className="text-sm text-ghost mb-2 line-clamp-2">{pt.description}</p>
                        <div className="flex flex-wrap gap-1">
                            {pt.supported_os.map(os => (
                                <span key={os} className="px-2 py-0.5 bg-signal/20 text-signal text-xs rounded">
                                    {os}
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-ghost mt-2">by {pt.author}</p>
                    </motion.div>
                ))}
            </div>

            {wrapperTypes.length === 0 && (
                <div className="text-center py-10 text-ghost">
                    <Package size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No wrapper payload types available</p>
                </div>
            )}
        </div>
    );
};

// Step 2: Select Payload to Wrap
const Step2SelectPayload: React.FC<{
    payloads: Payload[];
    wrapperType: PayloadType | null;
    selected: Payload | null;
    onSelect: (p: Payload) => void;
}> = ({ payloads, wrapperType, selected, onSelect }) => {
    const [search, setSearch] = useState('');

    const filteredPayloads = useMemo(() => {
        if (!wrapperType) return [];
        
        return payloads.filter(p => {
            // Filter by supported OS
            const payloadOS = p.payloadtype.supported_os;
            const wrapperOS = wrapperType.supported_os;
            const osMatch = payloadOS.some(os => wrapperOS.includes(os));
            
            if (!osMatch) return false;
            
            if (search) {
                const s = search.toLowerCase();
                return (
                    p.payloadtype.name.toLowerCase().includes(s) ||
                    p.filemetum?.filename_text?.toLowerCase().includes(s) ||
                    p.description?.toLowerCase().includes(s) ||
                    p.tag?.toLowerCase().includes(s)
                );
            }
            return true;
        });
    }, [payloads, wrapperType, search]);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">SELECT PAYLOAD TO WRAP</h2>
            <p className="text-ghost mb-6">Choose an existing payload to wrap with {wrapperType?.name}</p>
            
            <input
                type="text"
                placeholder="Search payloads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal placeholder:text-ghost/50 focus:border-signal outline-none mb-4"
            />

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredPayloads.map(p => (
                    <motion.div
                        key={p.id}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => onSelect(p)}
                        className={cn(
                            "p-3 border rounded-lg cursor-pointer transition-all",
                            selected?.id === p.id
                                ? "border-signal bg-signal/10"
                                : "border-ghost/30 hover:border-signal/50"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="font-mono text-signal">
                                    {p.filemetum?.filename_text || p.uuid.slice(0, 8)}
                                </span>
                                <span className="ml-2 px-2 py-0.5 bg-matrix/20 text-matrix text-xs rounded">
                                    {p.payloadtype.name}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                {p.c2profileparametersinstances.map((c2, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-signal/20 text-signal text-xs rounded">
                                        {c2.c2profile.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {p.description && (
                            <p className="text-sm text-ghost mt-1">{p.description}</p>
                        )}
                        <p className="text-xs text-ghost mt-1">
                            Created: {new Date(p.creation_time).toLocaleString()}
                        </p>
                    </motion.div>
                ))}
            </div>

            {filteredPayloads.length === 0 && (
                <div className="text-center py-10 text-ghost">
                    <Box size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No compatible payloads found</p>
                </div>
            )}
        </div>
    );
};

// Step 3: Configure Build Parameters
const Step3Configure: React.FC<{
    wrapperType: PayloadType | null;
    parameters: Record<string, any>;
    setParameters: (params: Record<string, any>) => void;
    description: string;
    setDescription: (desc: string) => void;
}> = ({ wrapperType, parameters, setParameters, description, setDescription }) => {
    const buildParams = wrapperType?.buildparameters || [];

    const handleParamChange = (name: string, value: any) => {
        setParameters({ ...parameters, [name]: value });
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">CONFIGURE BUILD PARAMETERS</h2>
            <p className="text-ghost mb-6">Configure the wrapper build parameters</p>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-ghost mb-2">Description</label>
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Wrapped payload description"
                        className="w-full bg-void border border-ghost/30 rounded-lg px-4 py-2 text-signal placeholder:text-ghost/50 focus:border-signal outline-none"
                    />
                </div>

                {buildParams.map(param => (
                    <div key={param.id}>
                        <label className="block text-sm text-ghost mb-2">
                            {param.name}
                            {param.required && <span className="text-alert ml-1">*</span>}
                        </label>
                        <p className="text-xs text-ghost/70 mb-1">{param.description}</p>
                        
                        {param.parameter_type === 'ChooseOne' ? (
                            <select
                                value={parameters[param.name] ?? param.default_value}
                                onChange={(e) => handleParamChange(param.name, e.target.value)}
                                className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                            >
                                {param.choices?.map(choice => (
                                    <option key={choice} value={choice}>{choice}</option>
                                ))}
                            </select>
                        ) : param.parameter_type === 'Boolean' ? (
                            <button
                                onClick={() => handleParamChange(param.name, !(parameters[param.name] ?? param.default_value))}
                                className={cn(
                                    "px-4 py-2 rounded border transition-colors",
                                    (parameters[param.name] ?? param.default_value)
                                        ? "border-matrix bg-matrix/20 text-matrix"
                                        : "border-ghost/30 text-ghost"
                                )}
                            >
                                {(parameters[param.name] ?? param.default_value) ? 'Enabled' : 'Disabled'}
                            </button>
                        ) : (
                            <input
                                type="text"
                                value={parameters[param.name] ?? param.default_value ?? ''}
                                onChange={(e) => handleParamChange(param.name, e.target.value)}
                                className="w-full bg-void border border-ghost/30 rounded px-3 py-2 text-signal focus:border-signal outline-none"
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Step 4: Build
const Step4Build: React.FC<{
    wrapperType: PayloadType | null;
    wrappedPayload: Payload | null;
    parameters: Record<string, any>;
    description: string;
    onBuild: () => void;
    building: boolean;
}> = ({ wrapperType, wrappedPayload, parameters, description, onBuild, building }) => {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-signal mb-4">BUILD WRAPPER</h2>
            <p className="text-ghost mb-6">Review and build your wrapper payload</p>
            
            <div className="bg-black/30 border border-ghost/30 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                    <span className="text-ghost">Wrapper Type:</span>
                    <span className="text-signal font-mono">{wrapperType?.name}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-ghost">Wrapped Payload:</span>
                    <span className="text-signal font-mono">
                        {wrappedPayload?.filemetum?.filename_text || wrappedPayload?.uuid.slice(0, 8)}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-ghost">Payload Type:</span>
                    <span className="text-matrix">{wrappedPayload?.payloadtype.name}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-ghost">Description:</span>
                    <span className="text-signal">{description || 'No description'}</span>
                </div>
                
                {Object.entries(parameters).length > 0 && (
                    <>
                        <div className="border-t border-ghost/20 pt-3 mt-3">
                            <span className="text-ghost text-sm">Build Parameters:</span>
                        </div>
                        {Object.entries(parameters).map(([key, value]) => (
                            <div key={key} className="flex justify-between text-sm">
                                <span className="text-ghost">{key}:</span>
                                <span className="text-signal font-mono">{String(value)}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <button
                onClick={onBuild}
                disabled={building}
                className="w-full py-3 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
                {building ? (
                    <>
                        <Loader className="animate-spin" size={20} />
                        Building...
                    </>
                ) : (
                    <>
                        <Package size={20} />
                        Build Wrapper Payload
                    </>
                )}
            </button>
        </div>
    );
};

export function CreateWrapperWizard({ 
    embedded = false, 
    onComplete 
}: { 
    embedded?: boolean; 
    onComplete?: () => void; 
}) {
    const navigate = useNavigate();
    const { isSidebarCollapsed } = useAppStore();
    const me = useReactiveVar(meState);
    
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedWrapper, setSelectedWrapper] = useState<PayloadType | null>(null);
    const [selectedPayload, setSelectedPayload] = useState<Payload | null>(null);
    const [buildParameters, setBuildParameters] = useState<Record<string, any>>({});
    const [description, setDescription] = useState('');
    const [building, setBuilding] = useState(false);

    // Fetch wrapper types
    const { data: wrapperData, loading: loadingWrappers } = useQuery(GET_WRAPPER_PAYLOAD_TYPES);
    const wrapperTypes: PayloadType[] = wrapperData?.payloadtype || [];

    // Fetch payloads
    const { data: payloadData, loading: loadingPayloads } = useQuery(GET_WRAPPABLE_PAYLOADS);
    const payloads: Payload[] = payloadData?.payload || [];

    // Create wrapper mutation
    const [createWrapper] = useMutation(CREATE_WRAPPER, {
        onCompleted: (data) => {
            setBuilding(false);
            if (data.createPayload.status === 'success') {
                snackActions.success('Wrapper build started');
                if (onComplete) {
                    onComplete();
                } else {
                    navigate('/payloads');
                }
            } else {
                snackActions.error('Failed to create wrapper: ' + data.createPayload.error);
            }
        },
        onError: (error) => {
            setBuilding(false);
            snackActions.error('Failed to create wrapper: ' + error.message);
        }
    });

    const steps = ['Select Wrapper', 'Select Payload', 'Configure', 'Build'];

    // @ts-ignore
    const noOperation = (me?.user?.current_operation_id || 0) === 0;

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0: return selectedWrapper !== null;
            case 1: return selectedPayload !== null;
            case 2: return true;
            case 3: return true;
            default: return false;
        }
    };

    const handleBuild = () => {
        if (!selectedWrapper || !selectedPayload) return;

        setBuilding(true);

        const payloadDef = {
            selected_os: selectedPayload.payloadtype.supported_os[0],
            payload_type: selectedWrapper.name,
            description: description || `Wrapped ${selectedPayload.filemetum?.filename_text || selectedPayload.uuid}`,
            build_parameters: selectedWrapper.buildparameters.map(bp => ({
                name: bp.name,
                value: buildParameters[bp.name] ?? bp.default_value
            })),
            wrapped_payload: selectedPayload.uuid,
            c2_profiles: []
        };

        createWrapper({
            variables: {
                payload: JSON.stringify(payloadDef)
            }
        });
    };

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return (
                    <Step1SelectWrapper
                        wrapperTypes={wrapperTypes}
                        selected={selectedWrapper}
                        onSelect={(pt) => setSelectedWrapper(pt)}
                    />
                );
            case 1:
                return (
                    <Step2SelectPayload
                        payloads={payloads}
                        wrapperType={selectedWrapper}
                        selected={selectedPayload}
                        onSelect={(p) => setSelectedPayload(p)}
                    />
                );
            case 2:
                return (
                    <Step3Configure
                        wrapperType={selectedWrapper}
                        parameters={buildParameters}
                        setParameters={setBuildParameters}
                        description={description}
                        setDescription={setDescription}
                    />
                );
            case 3:
                return (
                    <Step4Build
                        wrapperType={selectedWrapper}
                        wrappedPayload={selectedPayload}
                        parameters={buildParameters}
                        description={description}
                        onBuild={handleBuild}
                        building={building}
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
                <Sidebar />
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

    // Embedded mode - no Sidebar, simpler wrapper
    if (embedded) {
        return (
            <div className="flex-1 flex flex-col overflow-auto p-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Package className="text-signal" size={24} />
                        <h2 className="text-xl font-bold tracking-wider">CREATE WRAPPER</h2>
                    </div>
                    <p className="text-ghost text-sm">
                        Wrap an existing payload with a container
                    </p>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-between mb-6 border-b border-ghost/30 pb-4">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step}>
                            <div className={cn(
                                "flex items-center gap-2",
                                idx <= currentStep ? "text-signal" : "text-ghost/50"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold border",
                                    idx < currentStep ? "bg-matrix border-matrix text-void" :
                                    idx === currentStep ? "border-signal text-signal" :
                                    "border-ghost/30"
                                )}>
                                    {idx < currentStep ? <Check size={14} /> : idx + 1}
                                </div>
                                <span className="text-xs font-medium hidden sm:inline">{step}</span>
                            </div>
                            {idx < steps.length - 1 && (
                                <div className={cn(
                                    "flex-1 h-0.5 mx-2",
                                    idx < currentStep ? "bg-matrix" : "bg-ghost/30"
                                )} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Loading */}
                {(loadingWrappers || loadingPayloads) && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading...</span>
                    </div>
                )}

                {/* Step Content */}
                {!loadingWrappers && !loadingPayloads && (
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
                {!loadingWrappers && !loadingPayloads && currentStep < 3 && (
                    <div className="flex justify-between pt-4 border-t border-ghost/20">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ChevronLeft size={16} />
                            Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-4 py-2 bg-signal text-void rounded hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Next
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Full page mode with Sidebar
    return (
        <div className="min-h-screen bg-void text-signal">
            <Sidebar />

            <div className={cn("transition-all duration-300 p-6", isSidebarCollapsed ? "ml-16" : "ml-64")}>
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Package className="text-signal" size={32} />
                        <h1 className="text-3xl font-bold tracking-wider">CREATE_WRAPPER</h1>
                    </div>
                    <p className="text-ghost">
                        Wrap an existing payload with a container
                    </p>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-between mb-8 border-b border-ghost/30 pb-4">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step}>
                            <StepIndicator
                                step={idx}
                                currentStep={currentStep}
                                label={step}
                            />
                            {idx < steps.length - 1 && (
                                <div className={cn(
                                    "flex-1 h-0.5 mx-2",
                                    idx < currentStep ? "bg-matrix" : "bg-ghost/30"
                                )} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Loading */}
                {(loadingWrappers || loadingPayloads) && (
                    <div className="flex items-center justify-center py-20">
                        <Loader className="animate-spin text-signal" size={32} />
                        <span className="ml-3 text-ghost">Loading...</span>
                    </div>
                )}

                {/* Step Content */}
                {!loadingWrappers && !loadingPayloads && (
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
                {!loadingWrappers && !loadingPayloads && currentStep < 3 && (
                    <div className="flex justify-between">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="px-6 py-2 border border-ghost/30 rounded-lg text-ghost hover:text-signal hover:border-signal transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ChevronLeft size={20} />
                            Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-6 py-2 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Next
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Default export for standalone page route
export default function CreateWrapper() {
    return <CreateWrapperWizard embedded={false} />;
}
