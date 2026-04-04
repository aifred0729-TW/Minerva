import React from 'react';
import { motion } from 'framer-motion';
import {
    Zap, X, Check, Clock, Pause, Play, Trash2, FileText, RotateCcw, XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { EventGroup } from './eventing.types';
import { getTriggerColor } from './eventing.types';

export const EventGroupDetailModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    eventGroup: EventGroup | null;
    onToggleActive: () => void;
    onApprove: (approved: boolean) => void;
    onDelete: () => void;
    onRestore: () => void;
    onManualTrigger: () => void;
    onExport: () => void;
    onKeywordTrigger: () => void;
}> = ({ isOpen, onClose, eventGroup, onToggleActive, onApprove, onDelete, onRestore, onManualTrigger, onExport, onKeywordTrigger }) => {
    if (!isOpen || !eventGroup) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-void border border-ghost/30 rounded-lg w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-ghost/30">
                    <div className="flex items-center gap-3">
                        <Zap className="text-signal" size={24} />
                        <h2 className="text-xl font-bold text-signal">{eventGroup.name}</h2>
                        <span className={cn("px-2 py-0.5 rounded text-xs font-mono", getTriggerColor(eventGroup.trigger))}>
                            {eventGroup.trigger}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-ghost hover:text-signal">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
                    <div>
                        <h3 className="text-sm text-ghost mb-1">Description</h3>
                        <p className="text-signal">{eventGroup.description || 'No description'}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Status</h4>
                            <p className={cn("font-bold", eventGroup.active ? "text-matrix" : "text-alert")}>
                                {eventGroup.active ? 'Active' : 'Inactive'}
                            </p>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Approved</h4>
                            <p className={cn("font-bold", eventGroup.approved_to_run ? "text-matrix" : "text-alert")}>
                                {eventGroup.approved_to_run ? 'Yes' : 'No'}
                            </p>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Created By</h4>
                            <p className="text-signal font-mono">{eventGroup.operator?.username || 'Unknown'}</p>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-ghost/20">
                            <h4 className="text-xs text-ghost">Run As</h4>
                            <p className="text-signal font-mono">{eventGroup.run_as || 'Default'}</p>
                        </div>
                    </div>

                    {eventGroup.keywords && eventGroup.keywords.length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Keywords</h3>
                            <div className="flex flex-wrap gap-2">
                                {eventGroup.keywords.map((keyword, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-signal/20 text-signal rounded text-xs font-mono">
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {eventGroup.next_scheduled_run && (
                        <div>
                            <h3 className="text-sm text-ghost mb-1">Next Scheduled Run</h3>
                            <p className="text-signal flex items-center gap-2">
                                <Clock size={16} />
                                {new Date(eventGroup.next_scheduled_run).toLocaleString()}
                            </p>
                        </div>
                    )}

                    {eventGroup.eventgroupconsumingcontainers && eventGroup.eventgroupconsumingcontainers.length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Consuming Containers</h3>
                            <div className="space-y-2">
                                {eventGroup.eventgroupconsumingcontainers.map(container => (
                                    <div key={container.id} className="bg-black/30 p-2 rounded border border-ghost/20 flex items-center justify-between">
                                        <span className="text-signal font-mono">{container.consuming_container_name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "w-2 h-2 rounded-full",
                                                container.consuming_container?.container_running ? "bg-matrix" : "bg-alert"
                                            )} />
                                            <span className={cn(
                                                "text-xs",
                                                container.all_functions_available ? "text-matrix" : "text-alert"
                                            )}>
                                                {container.all_functions_available ? 'All Functions Available' : 'Missing Functions'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {eventGroup.eventgroupapprovals && eventGroup.eventgroupapprovals.length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Approvals</h3>
                            <div className="space-y-2">
                                {eventGroup.eventgroupapprovals.map(approval => (
                                    <div key={approval.id} className="bg-black/30 p-2 rounded border border-ghost/20 flex items-center justify-between">
                                        <span className="text-signal">{approval.operator?.username}</span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-xs",
                                            approval.approved ? "bg-matrix/20 text-matrix" : "bg-alert/20 text-alert"
                                        )}>
                                            {approval.approved ? 'Approved' : 'Pending'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {eventGroup.environment && Object.keys(eventGroup.environment).length > 0 && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Environment</h3>
                            <pre className="bg-black/30 p-3 rounded border border-ghost/20 text-xs font-mono text-signal overflow-x-auto">
                                {JSON.stringify(eventGroup.environment, null, 2)}
                            </pre>
                        </div>
                    )}

                    {eventGroup.trigger_data && (
                        <div>
                            <h3 className="text-sm text-ghost mb-2">Trigger Data</h3>
                            <pre className="bg-black/30 p-3 rounded border border-ghost/20 text-xs font-mono text-signal overflow-x-auto">
                                {JSON.stringify(eventGroup.trigger_data, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                <div className="flex justify-between gap-3 p-4 border-t border-ghost/30 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                        {!eventGroup.approved_to_run && (
                            <>
                                <button
                                    onClick={() => onApprove(true)}
                                    className="px-4 py-2 bg-matrix text-void rounded hover:bg-matrix/80 transition-colors flex items-center gap-2"
                                >
                                    <Check size={16} />
                                    Approve
                                </button>
                                <button
                                    onClick={() => onApprove(false)}
                                    className="px-4 py-2 bg-alert/20 text-alert rounded hover:bg-alert/30 transition-colors flex items-center gap-2"
                                >
                                    <XCircle size={16} />
                                    Deny
                                </button>
                            </>
                        )}
                        {eventGroup.deleted ? (
                            <button
                                onClick={onRestore}
                                className="px-4 py-2 bg-matrix/20 text-matrix rounded hover:bg-matrix/30 transition-colors flex items-center gap-2"
                            >
                                <RotateCcw size={16} />
                                Restore
                            </button>
                        ) : (
                            <button
                                onClick={onDelete}
                                className="px-4 py-2 bg-alert text-void rounded hover:bg-alert/80 transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {eventGroup.trigger === 'manual' && (
                            <button
                                onClick={onManualTrigger}
                                className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors flex items-center gap-2"
                            >
                                <Play size={16} />
                                Run Now
                            </button>
                        )}
                        {eventGroup.keywords && eventGroup.keywords.length > 0 && (
                            <button
                                onClick={onKeywordTrigger}
                                className="px-4 py-2 bg-signal/20 text-signal rounded hover:bg-signal/30 transition-colors flex items-center gap-2"
                            >
                                <Zap size={16} />
                                Keyword Trigger
                            </button>
                        )}
                        <button
                            onClick={onExport}
                            className="px-4 py-2 border border-ghost/30 text-ghost rounded hover:text-signal hover:border-signal transition-colors flex items-center gap-2"
                        >
                            <FileText size={16} />
                            Export
                        </button>
                        <button
                            onClick={onToggleActive}
                            className={cn(
                                "px-4 py-2 rounded transition-colors flex items-center gap-2",
                                eventGroup.active
                                    ? "bg-alert/20 text-alert hover:bg-alert/30"
                                    : "bg-matrix/20 text-matrix hover:bg-matrix/30"
                            )}
                        >
                            {eventGroup.active ? <Pause size={16} /> : <Play size={16} />}
                            {eventGroup.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-ghost/30 rounded text-ghost hover:text-signal hover:border-signal transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
