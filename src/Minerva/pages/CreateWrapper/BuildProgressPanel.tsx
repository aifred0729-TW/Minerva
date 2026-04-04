import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSubscription } from "@apollo/client/react";
import { motion } from 'framer-motion';
import AceEditor from 'react-ace';
import { CheckCircle, XCircle, Minus, Loader, ChevronUp, ChevronDown, FileText, X, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { directDownloadUrl } from '../../lib/urls';
import { snackActions } from '../../lib/snackbar';
import { SUBSCRIBE_PAYLOAD_BUILD } from '../../lib/api';
import type { BuildStepFull } from './createWrapper.types';

export const BuildProgressPanel: React.FC<{
    uuid: string;
    fromNow: string;
    onComplete?: (uuid: string) => void;
}> = ({ uuid, fromNow, onComplete }) => {
    const [buildData, setBuildData] = useState<{
        build_phase: string;
        build_message: string;
        build_stderr: string;
        build_stdout: string;
        agent_file_id?: string;
        steps: BuildStepFull[];
    } | null>(null);
    const [expandedStep, setExpandedStep] = useState<number | null>(null);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const notifiedRef = useRef(false);

    useSubscription<any>(SUBSCRIBE_PAYLOAD_BUILD, {
        variables: { uuid, fromNow },
        onData: ({ data }: { data: any }) => {
            const stream = data.data?.payload_stream;
            if (!stream || stream.length === 0) return;
            const p = stream[0];
            setBuildData({
                build_phase: p.build_phase,
                build_message: p.build_message || '',
                build_stderr: p.build_stderr || '',
                build_stdout: p.build_stdout || '',
                agent_file_id: p.filemetum?.agent_file_id,
                steps: p.payload_build_steps || [],
            });
            if (p.build_phase === 'success' && !notifiedRef.current) {
                notifiedRef.current = true;
                const fileId = p.filemetum?.agent_file_id;
                snackActions.success(
                    <span className="flex flex-col gap-1">
                        <span className="font-bold">Wrapper built successfully!</span>
                        {fileId && (
                            <a
                                href={directDownloadUrl(fileId)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="underline font-mono text-green-200 hover:text-green-100 text-xs"
                            >
                                ⬇ Download now
                            </a>
                        )}
                    </span>
                );
            } else if (p.build_phase === 'error' && !notifiedRef.current) {
                notifiedRef.current = true;
                snackActions.error('Wrapper build failed — click "View Error" in the build panel for details');
            }
        },
        onError: (err) => { console.error('[SUBSCRIBE_PAYLOAD_BUILD] subscription error:', err); },
    });

    const phaseColor = buildData?.build_phase === 'success' ? 'text-matrix'
        : buildData?.build_phase === 'error' ? 'text-alert' : 'text-signal';
    const phaseIcon = buildData?.build_phase === 'success'
        ? <CheckCircle size={18} className="text-matrix" />
        : buildData?.build_phase === 'error'
        ? <XCircle size={18} className="text-alert" />
        : <Loader size={18} className="text-signal animate-spin" />;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 border border-ghost/30 rounded-lg overflow-hidden"
        >
            {/* Phase header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-black/40 border-b border-ghost/20">
                {phaseIcon}
                <span className={cn("font-mono text-sm font-bold uppercase flex-1", phaseColor)}>
                    {buildData?.build_phase ?? 'Waiting…'}
                </span>
                {buildData?.build_phase === 'success' && onComplete && (
                    <button
                        onClick={() => onComplete(uuid)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-matrix/20 border border-matrix/40 text-matrix text-xs rounded hover:bg-matrix/30 transition-colors font-mono"
                    >
                        <Check size={12} /> Done — View in List
                    </button>
                )}
            </div>

            {/* Build steps */}
            <div className="divide-y divide-ghost/10">
                {buildData?.steps.map(step => {
                    const isExpanded = expandedStep === step.step_number;
                    const hasOutput = step.step_stdout || step.step_stderr;
                    const icon = step.step_skip
                        ? <Minus size={14} className="text-ghost" />
                        : step.step_success === true
                        ? <CheckCircle size={14} className="text-matrix" />
                        : step.step_success === false
                        ? <XCircle size={14} className="text-alert" />
                        : <Loader size={14} className="text-signal animate-spin" />;
                    return (
                        <div key={step.step_number} className="px-4 py-2">
                            <div
                                className={cn("flex items-center justify-between", hasOutput ? "cursor-pointer" : "")}
                                onClick={() => hasOutput && setExpandedStep(isExpanded ? null : step.step_number)}
                            >
                                <div className="flex items-center gap-2">
                                    {icon}
                                    <span className="text-xs text-ghost font-mono">{step.step_name}</span>
                                </div>
                                {hasOutput && (isExpanded
                                    ? <ChevronUp size={12} className="text-ghost" />
                                    : <ChevronDown size={12} className="text-ghost" />)}
                            </div>
                            {isExpanded && (
                                <div className="mt-2 space-y-1">
                                    {step.step_stdout && (
                                        <pre className="text-xs bg-black/30 rounded p-2 text-matrix overflow-x-auto whitespace-pre-wrap font-mono">{step.step_stdout}</pre>
                                    )}
                                    {step.step_stderr && (
                                        <pre className="text-xs bg-black/30 rounded p-2 text-alert overflow-x-auto whitespace-pre-wrap font-mono">{step.step_stderr}</pre>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Download + UUID link on success */}
            {buildData?.build_phase === 'success' && buildData.agent_file_id && (
                <div className="px-4 py-3 bg-matrix/10 border-t border-matrix/30 space-y-1">
                    <div className="flex items-center gap-3">
                        <span className="text-ghost text-sm">Download:</span>
                        <a
                            href={directDownloadUrl(buildData.agent_file_id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-matrix underline hover:text-matrix/80 font-mono text-sm"
                        >
                            {buildData.agent_file_id}
                        </a>
                    </div>
                    <p className="text-xs text-ghost/50 font-mono">UUID: {uuid}</p>
                </div>
            )}

            {/* Error details */}
            {buildData?.build_phase === 'error' && (buildData.build_message || buildData.build_stderr || buildData.build_stdout) && (
                <div className="px-4 py-3 bg-alert/5 border-t border-alert/30 space-y-2">
                    {buildData.build_message && (
                        <pre className="text-xs text-alert font-mono whitespace-pre-wrap line-clamp-5">{buildData.build_message}</pre>
                    )}
                    {buildData.build_stderr && (
                        <pre className="text-xs text-alert/70 font-mono whitespace-pre-wrap line-clamp-3">{buildData.build_stderr}</pre>
                    )}
                    <button
                        onClick={() => setShowErrorModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-alert/20 border border-alert/40 text-alert text-xs rounded hover:bg-alert/30 transition-colors font-mono"
                    >
                        <FileText size={12} /> View Full Error Details
                    </button>
                </div>
            )}

            {/* AceEditor error modal */}
            {showErrorModal && createPortal(
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setShowErrorModal(false)}
                >
                    <div
                        className="bg-void border border-alert/30 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-alert/10 p-4 border-b border-alert/30 flex items-center justify-between shrink-0">
                            <h3 className="font-mono font-bold text-alert tracking-widest flex items-center gap-2">
                                <XCircle size={16} /> BUILD ERROR DETAILS
                            </h3>
                            <button onClick={() => setShowErrorModal(false)} className="text-ghost hover:text-signal transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden" style={{ minHeight: '300px' }}>
                            <AceEditor
                                mode="text"
                                theme="monokai"
                                fontSize={13}
                                width="100%"
                                height="100%"
                                value={[
                                    buildData?.build_message ? `[Build Message]\n${buildData.build_message}` : '',
                                    buildData?.build_stderr  ? `[Stderr]\n${buildData.build_stderr}` : '',
                                    buildData?.build_stdout  ? `[Stdout]\n${buildData.build_stdout}` : '',
                                ].filter(Boolean).join('\n\n')}
                                readOnly
                                showPrintMargin={false}
                                wrapEnabled={true}
                                setOptions={{ useWorker: false, showLineNumbers: true, tabSize: 2 }}
                            />
                        </div>
                        <div className="p-4 border-t border-ghost/30 flex justify-end shrink-0">
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className="px-4 py-2 border border-ghost/30 text-ghost font-mono rounded hover:text-signal hover:border-signal transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </motion.div>
    );
};
