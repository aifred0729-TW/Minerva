import React, { useState, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, Globe2, Tag as TagIcon, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { directDownloadUrl } from '../../lib/urls';
import type { PayloadTag, PayloadBuildStep, Payload } from '../../types/payloads';
import { createPortal } from 'react-dom';

export const ParseParamValue: React.FC<{
    value: string | null | undefined;
    parameterType: string;
    sensitive?: boolean;
}> = ({ value, parameterType, sensitive = false }) => {
    if (!value) return <span className="text-gray-600">—</span>;
    if (sensitive && value.length > 8) {
        return <span className="text-gray-600 italic">{value.slice(0, 6)}••••</span>;
    }
    const pt = parameterType || '';
    if (pt === 'Boolean') {
        const boolVal = String(value).toLowerCase();
        return (boolVal === 'true' || boolVal === 't')
            ? <span className="text-matrix font-bold">True</span>
            : <span className="text-red-400 font-bold">False</span>;
    }
    if (pt === 'Dictionary') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            const display = JSON.stringify(parsed, null, 2);
            return (
                <pre className="text-[10px] font-mono text-gray-300 bg-black/30 rounded p-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all">{display}</pre>
            );
        } catch {
            return <span className="text-gray-300 break-all">{value}</span>;
        }
    }
    if (pt === 'Array' || pt === 'ChooseMultiple') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (Array.isArray(parsed)) {
                return (
                    <div className="flex flex-wrap gap-1">
                        {parsed.map((item: unknown, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 bg-signal/10 text-signal border border-signal/20 rounded text-[10px] font-mono">{String(item)}</span>
                        ))}
                    </div>
                );
            }
        } catch { /* fall through */ }
        return <span className="text-gray-300 break-all">{value}</span>;
    }
    if (pt === 'File') {
        return (
            <a href={directDownloadUrl(value)} target="_blank" rel="noopener noreferrer"
               className="text-signal underline text-xs font-mono hover:text-white">
                {value.substring(0, 16)}…
            </a>
        );
    }
    if (pt === 'FileMultiple') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (Array.isArray(parsed)) {
                return (
                    <div className="space-y-0.5">
                        {parsed.map((fileId: string, i: number) => (
                            <a key={i} href={directDownloadUrl(fileId)} target="_blank" rel="noopener noreferrer"
                               className="block text-signal underline text-xs font-mono hover:text-white">
                                {fileId.substring(0, 16)}…
                            </a>
                        ))}
                    </div>
                );
            }
        } catch { /* fall through */ }
        return <span className="text-gray-300 break-all">{value}</span>;
    }
    return <span className="text-gray-300 break-all">{value}</span>;
};

// ============================================
// Helper Components
// ============================================

// Build Status Badge - Shows colored status with icon
export const BuildStatusBadge = ({ phase }: { phase: string }) => {
    const getConfig = () => {
        switch (phase) {
            case 'success':
                return { 
                    icon: CheckCircle, 
                    color: 'text-green-400', 
                    bg: 'bg-green-400/10', 
                    border: 'border-green-400/30',
                    label: 'SUCCESS' 
                };
            case 'building':
                return { 
                    icon: Loader2, 
                    color: 'text-yellow-400', 
                    bg: 'bg-yellow-400/10', 
                    border: 'border-yellow-400/30',
                    label: 'BUILDING',
                    animate: true 
                };
            case 'error':
                return { 
                    icon: XCircle, 
                    color: 'text-red-400', 
                    bg: 'bg-red-400/10', 
                    border: 'border-red-400/30',
                    label: 'ERROR' 
                };
            default:
                return { 
                    icon: Clock, 
                    color: 'text-yellow-400', 
                    bg: 'bg-yellow-400/10', 
                    border: 'border-yellow-400/30',
                    label: phase?.toUpperCase() || 'PENDING' 
                };
        }
    };

    const config = getConfig();
    const Icon = config.icon;

    return (
        <span className={cn(
            "inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-mono border",
            config.color, config.bg, config.border
        )}>
            <Icon size={14} className={config.animate ? "animate-spin" : ""} />
            {config.label}
        </span>
    );
};

// C2 Profile Status Indicator
export const C2StatusIndicator = ({ c2profiles, c2params }: {
    c2profiles: Payload['payloadc2profiles'];
    c2params?: Payload['c2profileparametersinstances'];
}) => {
    if (!c2profiles || c2profiles.length === 0) {
        return <span className="text-gray-500 text-xs font-mono">—</span>;
    }

    return (
        <div className="flex flex-col gap-1.5">
            {c2profiles.map((p, idx) => {
                const isRunning = p.c2profile.running && p.c2profile.container_running;
                const isWaiting = !p.c2profile.running && p.c2profile.container_running;
                const profileParams = c2params?.filter(inst => inst.c2profile.name === p.c2profile.name) || [];
                const hostInst = profileParams.find(inst => inst.c2profileparameter.name === 'callback_host' || inst.c2profileparameter.name === 'host');
                const portInst = profileParams.find(inst => inst.c2profileparameter.name === 'callback_port' || inst.c2profileparameter.name === 'port');
                return (
                    <div key={idx} className="flex flex-col gap-0.5">
                        <span className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono border w-fit",
                            isRunning
                                ? "text-green-400 bg-green-400/10 border-green-400/30"
                                : isWaiting
                                    ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
                                    : "text-red-400 bg-red-400/10 border-red-400/30",
                            p.c2profile.is_p2p && "border-dashed"
                        )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", isRunning ? "bg-green-400" : isWaiting ? "bg-yellow-400 animate-pulse" : "bg-red-400")} />
                            {p.c2profile.name}
                            {p.c2profile.is_p2p && " (P2P)"}
                        </span>
                        {(hostInst?.value || portInst?.value) && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500 pl-1">
                                <Globe2 size={9} className="text-signal/40" />
                                {hostInst?.value && <span className="text-signal/70 truncate max-w-[150px]">{hostInst.value}</span>}
                                {hostInst?.value && portInst?.value && <span>:</span>}
                                {portInst?.value && <span className="text-yellow-400/80 font-bold">{portInst.value}</span>}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// Tags Display Component
export const TagsDisplay = ({ tags }: { tags: PayloadTag[] }) => {
    if (!tags || tags.length === 0) return <span className="text-gray-500 text-xs font-mono">—</span>;

    return (
        <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
                <span 
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono"
                    style={{ 
                        backgroundColor: `${tag.tagtype.color}20`, 
                        color: tag.tagtype.color,
                        border: `1px solid ${tag.tagtype.color}40`
                    }}
                >
                    <TagIcon size={10} />
                    {tag.tagtype.name}
                </span>
            ))}
        </div>
    );
};

// ============================================
// Build Step Detail Modal (Item 1)
// ============================================
const BuildStepDetailModal: React.FC<{
    step: PayloadBuildStep;
    onClose: () => void;
}> = ({ step, onClose }) => {
    const duration = React.useMemo(() => {
        if (!step.start_time || !step.end_time) return null;
        const ms = Math.abs(new Date(step.end_time).getTime() - new Date(step.start_time).getTime());
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    }, [step.start_time, step.end_time]);

    const status = step.step_skip ? 'Skipped'
        : step.end_time === null && step.start_time ? 'Running…'
        : step.end_time === null ? 'Waiting…'
        : step.step_success ? 'Success' : 'Failed';

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-void border border-signal/30 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-signal/10 p-4 border-b border-signal/30 flex items-center justify-between">
                    <h3 className="font-mono font-bold text-signal text-sm tracking-widest">
                        STEP {step.step_number + 1} — {step.step_name}
                    </h3>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                            <span className="text-ghost block mb-0.5">Status</span>
                            <span className={cn(
                                "font-bold",
                                step.step_success === true ? "text-matrix" :
                                step.step_success === false ? "text-red-400" :
                                step.step_skip ? "text-ghost" : "text-yellow-400"
                            )}>{status}</span>
                        </div>
                        {duration && (
                            <div>
                                <span className="text-ghost block mb-0.5">Duration</span>
                                <span className="text-white">{duration}</span>
                            </div>
                        )}
                        {step.start_time && (
                            <div className="col-span-2">
                                <span className="text-ghost block mb-0.5">Start Time</span>
                                <span className="text-white/80">{new Date(step.start_time).toLocaleTimeString()}</span>
                            </div>
                        )}
                    </div>
                    {step.step_description && (
                        <p className="text-xs text-gray-400 border-l-2 border-ghost/30 pl-2 italic">{step.step_description}</p>
                    )}
                    {step.step_stdout && (
                        <div>
                            <label className="text-xs text-ghost uppercase tracking-wider block mb-1">Stdout</label>
                            <pre className="text-xs bg-black/50 rounded p-2 text-matrix/90 font-mono overflow-x-auto max-h-40 border border-matrix/20 cyber-scrollbar">{step.step_stdout}</pre>
                        </div>
                    )}
                    {step.step_stderr && (
                        <div>
                            <label className="text-xs text-red-400 uppercase tracking-wider block mb-1">Stderr</label>
                            <pre className="text-xs bg-black/50 rounded p-2 text-red-400/90 font-mono overflow-x-auto max-h-40 border border-red-400/20 cyber-scrollbar">{step.step_stderr}</pre>
                        </div>
                    )}
                </div>
                <div className="p-3 border-t border-ghost/20 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 border border-ghost/30 text-ghost font-mono rounded text-xs hover:text-signal hover:border-signal transition-colors"
                    >
                        Close
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

// Build Progress Steps — clickable per-step dot icons (Item 1)
export const BuildProgressSteps = ({ steps, buildPhase, isCombat = false }: { steps: PayloadBuildStep[]; buildPhase?: string; isCombat?: boolean }) => {
    const [detailStep, setDetailStep] = useState<PayloadBuildStep | null>(null);
    if (!steps || steps.length === 0) return null;

    const getDotClass = (s: PayloadBuildStep) => {
        if (s.step_skip) return "bg-ghost/20 border-ghost/30 opacity-40";
        if (s.step_success === true) return "bg-matrix/50 border-matrix/70 hover:bg-matrix/70";
        if (s.step_success === false) return "bg-red-500/50 border-red-500/70 hover:bg-red-500/70";
        if (s.start_time && !s.end_time) return cn("bg-signal/40 border-signal/60", !isCombat && "animate-pulse");
        return "bg-gray-700 border-gray-600 opacity-50";
    };

    return (
        <>
            <div className="flex items-center gap-0.5 mt-1.5 flex-wrap">
                {steps.map((s) => (
                    <button
                        key={s.step_number}
                        title={`Step ${s.step_number + 1}: ${s.step_name}`}
                        onClick={() => setDetailStep(s)}
                        className={cn(
                            "w-2.5 h-2.5 rounded-full border cursor-pointer transition-all hover:scale-150 hover:z-10 relative",
                            getDotClass(s)
                        )}
                    />
                ))}
            </div>
            {detailStep && (
                <BuildStepDetailModal step={detailStep} onClose={() => setDetailStep(null)} />
            )}
        </>
    );
};

// ============================================
// Confirm Dialog (replaces window.confirm)
// ============================================
