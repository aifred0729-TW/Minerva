import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toLocalTime } from '../../lib/time';
import { decodeFilename } from './createWrapper.utils';
import type { Payload } from './createWrapper.types';
import { AgentIcon, MiniStepProgress } from './SharedComponents';

export const PayloadDetailModal: React.FC<{ payload: Payload; onClose: () => void }> = ({ payload, onClose }) => {
    const fname = decodeFilename(payload.filemetum?.filename_text) || payload.uuid.slice(0, 12);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-void border border-ghost/30 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto z-10"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-ghost/20">
                    <div className="flex items-center gap-3">
                        <AgentIcon name={payload.payloadtype.name} size={24} />
                        <div>
                            <p className="font-mono text-signal font-bold text-sm">{fname}</p>
                            <p className="text-xs text-ghost/60">{payload.payloadtype.name} · {payload.uuid.slice(0, 8)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-ghost hover:text-signal transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {/* Status & OS */}
                    <div className="flex flex-wrap gap-2">
                        <span className={cn(
                            "px-2 py-0.5 text-xs rounded font-mono",
                            payload.build_phase === 'success' ? "bg-matrix/20 text-matrix" :
                            payload.build_phase === 'error' ? "bg-alert/20 text-alert" :
                            "bg-signal/20 text-signal"
                        )}>{payload.build_phase}</span>
                        {payload.payloadtype.supported_os.map(os => (
                            <span key={os} className="px-2 py-0.5 bg-signal/15 text-signal text-xs rounded">{os}</span>
                        ))}
                    </div>

                    {/* Description */}
                    {payload.description && (
                        <p className="text-sm text-ghost">{payload.description}</p>
                    )}

                    {/* Creation time */}
                    <p className="text-xs text-ghost/50">
                        Created: {toLocalTime(payload.creation_time, false)}
                    </p>

                    {/* C2 Profiles */}
                    {payload.c2profileparametersinstances.length > 0 && (
                        <div>
                            <p className="text-xs text-ghost/60 uppercase tracking-widest mb-2 font-mono">C2 Profiles</p>
                            <div className="flex flex-wrap gap-1">
                                {[...new Set(payload.c2profileparametersinstances.map(c => c.c2profile.name))].map(name => (
                                    <span key={name} className="px-2 py-0.5 bg-signal/15 text-signal text-xs rounded font-mono">{name}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Build parameters */}
                    {payload.buildparameterinstances.length > 0 && (
                        <div>
                            <p className="text-xs text-ghost/60 uppercase tracking-widest mb-2 font-mono">Build Parameters</p>
                            <div className="space-y-1">
                                {payload.buildparameterinstances.map((bpi, i) => (
                                    <div key={i} className="flex justify-between text-xs">
                                        <span className="text-ghost font-mono">{bpi.build_parameter_id}</span>
                                        <span className="text-signal font-mono truncate max-w-[55%] text-right">{String(bpi.value ?? '—')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Build steps progress */}
                    {(payload.payload_build_steps?.length ?? 0) > 0 && (
                        <div>
                            <p className="text-xs text-ghost/60 uppercase tracking-widest mb-2 font-mono">Build Steps</p>
                            <MiniStepProgress steps={payload.payload_build_steps!} />
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
