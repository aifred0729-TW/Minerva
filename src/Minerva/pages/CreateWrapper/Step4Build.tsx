import React, { useState, useEffect, useMemo } from 'react';
import { useLazyQueryCompat as useLazyQuery } from "../../lib/useQueryCompat";
import { motion, AnimatePresence } from 'framer-motion';
import AceEditor from 'react-ace';
import {
    Package, RotateCcw, ChevronUp, ChevronDown, Loader,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { snackActions } from '../../lib/snackbar';
import { decodeFilename, formatParamValue, groupBuildParams } from './createWrapper.utils';
import { EXPORT_PAYLOAD_CONFIG } from '../../lib/api';
import type { PayloadType, Payload, BuildStepFull } from './createWrapper.types';
import { AgentIcon, EditButton } from './SharedComponents';
import { BuildProgressPanel } from './BuildProgressPanel';

export const Step4Build: React.FC<{
    wrapperType: PayloadType | null;
    wrappedPayload: Payload | null;
    parameters: Record<string, unknown>;
    description: string;
    filename: string;
    selectedOS: string;
    onBuild: () => void;
    building: boolean;
    buildUUID: string | null;
    buildFromNow: string;
    onEditWrapper: () => void;
    onEditPayload: () => void;
    onEditConfigure: () => void;
    onStartOver: () => void;
    onComplete?: (uuid: string) => void;
    onFilenameChange?: (v: string) => void;
}> = ({
    wrapperType, wrappedPayload, parameters, description, filename, selectedOS,
    onBuild, building, buildUUID, buildFromNow,
    onEditWrapper, onEditPayload, onEditConfigure, onStartOver, onComplete,
    onFilenameChange,
}) => {
    const [showPayloadConfig, setShowPayloadConfig] = useState(true);
    const [payloadConfigJSON, setPayloadConfigJSON] = useState<string | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(false);

    const [fetchConfig] = useLazyQuery<any>(EXPORT_PAYLOAD_CONFIG, {
        fetchPolicy: 'no-cache',
        onCompleted: (data: any) => {
            setLoadingConfig(false);
            if (data.exportPayloadConfig.status === 'success') {
                try {
                    setPayloadConfigJSON(JSON.stringify(JSON.parse(data.exportPayloadConfig.config), null, 2));
                } catch {
                    setPayloadConfigJSON(data.exportPayloadConfig.config);
                }
            } else {
                snackActions.error('Failed to load config: ' + data.exportPayloadConfig.error);
            }
        },
        onError: () => {
            setLoadingConfig(false);
            snackActions.error('Failed to load payload config');
        },
    });

    useEffect(() => {
        if (wrappedPayload && !payloadConfigJSON) {
            setLoadingConfig(true);
            fetchConfig({ variables: { uuid: wrappedPayload.uuid } });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wrappedPayload?.uuid]);

    const handleToggleConfig = () => {
        if (!showPayloadConfig && !payloadConfigJSON && wrappedPayload) {
            setLoadingConfig(true);
            fetchConfig({ variables: { uuid: wrappedPayload.uuid } });
        }
        setShowPayloadConfig(v => !v);
    };

    const buildParams = wrapperType?.buildparameters || [];
    const paramGroups = useMemo(
        () => groupBuildParams(buildParams, parameters, selectedOS),
        [buildParams, parameters, selectedOS]
    );
    const wrappedFilename = decodeFilename(wrappedPayload?.filemetum?.filename_text) || wrappedPayload?.uuid.slice(0, 8) || '—';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-signal">BUILD WRAPPER</h2>
                <button
                    onClick={onStartOver}
                    className="flex items-center gap-1 text-xs text-ghost hover:text-signal border border-ghost/30 hover:border-signal/50 px-3 py-1.5 rounded transition-colors"
                >
                    <RotateCcw size={13} /> Start Over
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Wrapper info */}
                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-ghost/60">Wrapper</span>
                        <EditButton label="Edit" onClick={onEditWrapper} />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <AgentIcon name={wrapperType?.name || ''} size={28} />
                        <div>
                            <p className="font-mono text-signal font-bold">{wrapperType?.name}</p>
                            {wrapperType?.semver && (
                                <p className="text-xs text-ghost/60 font-mono">v{wrapperType.semver}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {wrapperType?.supported_os.map(os => (
                            <span key={os} className="px-1.5 py-0.5 bg-signal/15 text-signal text-xs rounded">{os}</span>
                        ))}
                    </div>
                    {selectedOS && (
                        <p className="text-xs mt-2">
                            <span className="text-ghost">Selected OS: </span>
                            <span className="text-signal font-mono">{selectedOS}</span>
                        </p>
                    )}
                </div>

                {/* Wrapped payload info */}
                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-ghost/60">Wrapped Payload</span>
                        <EditButton label="Edit" onClick={onEditPayload} />
                    </div>
                    <p className="font-mono text-signal font-bold">{wrappedFilename}</p>
                    <span className="px-2 py-0.5 bg-matrix/20 text-matrix text-xs rounded mt-1 inline-block">
                        {wrappedPayload?.payloadtype.name}
                    </span>
                    {wrappedPayload?.description && (
                        <p className="text-xs text-ghost mt-1">{wrappedPayload.description}</p>
                    )}
                    <button
                        onClick={handleToggleConfig}
                        className="mt-2 text-xs text-signal/60 hover:text-signal flex items-center gap-1 transition-colors"
                    >
                        {showPayloadConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {showPayloadConfig ? 'Hide' : 'Show'} full configuration
                    </button>
                </div>

                {/* Output settings */}
                <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-ghost/60">Output</span>
                        <EditButton label="Edit" onClick={onEditConfigure} />
                    </div>
                    <div className="mb-1">
                        <span className="text-ghost text-xs">Filename: </span>
                        {onFilenameChange ? (
                            <input
                                value={filename}
                                onChange={(e) => onFilenameChange(e.target.value)}
                                placeholder={wrapperType
                                    ? `${wrapperType.name}${wrapperType.file_extension ? '.' + wrapperType.file_extension : ''}`
                                    : 'wrapper'}
                                className="ml-1 bg-black/40 border border-ghost/30 rounded px-2 py-0.5 text-signal font-mono text-xs focus:border-signal focus:outline-none w-auto min-w-[140px]"
                            />
                        ) : (
                            <span className="text-signal font-mono text-sm">{filename || <span className="italic text-ghost/40">default</span>}</span>
                        )}
                    </div>
                    <p className="text-sm mt-1">
                        <span className="text-ghost text-xs">Description: </span>
                        <span className="text-signal">{description || <span className="text-ghost/40 italic text-xs">none</span>}</span>
                    </p>
                </div>

                {/* Build parameters summary */}
                {buildParams.length > 0 && (
                    <div className="bg-black/30 border border-ghost/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs uppercase tracking-widest text-ghost/60">Build Parameters</span>
                            <EditButton label="Edit" onClick={onEditConfigure} />
                        </div>
                        <div className="space-y-3">
                            {paramGroups.map(({ group, params }) => (
                                <div key={group}>
                                    {paramGroups.length > 1 && (
                                        <p className="text-[9px] uppercase tracking-widest text-ghost/40 font-mono mb-1">{group}</p>
                                    )}
                                    <div className="space-y-1">
                                        {params.map(bp => {
                                            const v = parameters[bp.name] ?? bp.default_value ?? '';
                                            return (
                                                <div key={bp.id} className="flex justify-between text-xs gap-2">
                                                    <span className="text-ghost flex-shrink-0">{bp.name}:</span>
                                                    <span className="text-signal font-mono truncate text-right"
                                                        title={formatParamValue(bp, v)}>
                                                        {formatParamValue(bp, v)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Payload JSON config expansion */}
            <AnimatePresence>
                {showPayloadConfig && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-ghost/30 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-ghost/20">
                                <span className="text-xs uppercase tracking-widest text-ghost/60">
                                    Wrapped Payload Configuration
                                </span>
                                {loadingConfig && <Loader size={14} className="animate-spin text-ghost" />}
                            </div>
                            {payloadConfigJSON ? (
                                <AceEditor
                                    mode="json"
                                    theme="monokai"
                                    width="100%"
                                    height="300px"
                                    readOnly={true}
                                    showPrintMargin={false}
                                    wrapEnabled={true}
                                    value={payloadConfigJSON}
                                    setOptions={{ useWorker: false, fontSize: 12 }}
                                    style={{ background: 'transparent' }}
                                />
                            ) : !loadingConfig ? (
                                <p className="p-4 text-xs text-ghost/50">No configuration available</p>
                            ) : (
                                <div className="p-4 flex items-center gap-2 text-ghost text-xs">
                                    <Loader size={14} className="animate-spin" /> Loading…
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Build button */}
            {!buildUUID && (
                <button
                    onClick={onBuild}
                    disabled={building}
                    className="w-full py-3 bg-signal text-void rounded-lg hover:bg-signal/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-bold"
                >
                    {building ? (
                        <><Loader className="animate-spin" size={20} /> Submitting…</>
                    ) : (
                        <><Package size={20} /> Build Wrapper Payload</>
                    )}
                </button>
            )}

            {/* Live build progress */}
            {buildUUID && (
                <BuildProgressPanel uuid={buildUUID} fromNow={buildFromNow} onComplete={onComplete} />
            )}
        </div>
    );
};
